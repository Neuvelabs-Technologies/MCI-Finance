import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config/env.js';
import type { CustomerDoc, EmailLogEntry } from '../models/Customer.js';
import type { EmailSettings, ISettings } from '../models/Settings.js';
import { logger } from '../utils/logger.js';
import { formLink } from '../utils/token.js';

/**
 * How email goes out: Mailjet's Send API when its keys are set, else SMTP when SMTP_HOST is set,
 * else nowhere (emails are written to the log only).
 */
export type MailProvider = 'mailjet' | 'smtp' | 'none';
export const mailProvider = (): MailProvider =>
  config.mailjet.apiKey && config.mailjet.secretKey ? 'mailjet' : config.smtp.host ? 'smtp' : 'none';
export const mailConfigured = (): boolean => mailProvider() !== 'none';

let transport: Transporter | undefined;

function getTransport(): Transporter {
  if (transport) return transport;
  transport =
    mailProvider() === 'smtp'
      ? nodemailer.createTransport({
          host: config.smtp.host,
          port: config.smtp.port,
          secure: config.smtp.secure,
          auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
        })
      : // Nothing configured: emails are rendered and logged to the console only.
        nodemailer.createTransport({ jsonTransport: true });
  return transport;
}

/** Split `"Name" <email@x>` into its parts; a bare address is returned as is. */
export function parseAddress(s: string): { Email: string; Name?: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(s);
  if (!m) return { Email: s.trim() };
  const name = m[1].trim();
  return name ? { Email: m[2].trim(), Name: name } : { Email: m[2].trim() };
}

interface MailjetError {
  ErrorMessage?: string;
  ErrorRelatedTo?: string[];
}
interface MailjetResponse {
  ErrorMessage?: string;
  Messages?: { Status?: string; Errors?: MailjetError[] }[];
}

const MAILJET_SEND_URL = 'https://api.mailjet.com/v3.1/send';

async function sendViaMailjet({ to, subject, text, html, replyTo }: SendInput): Promise<void> {
  if (!config.mailFrom) throw new Error('MAIL_FROM is empty — set it to a sender address verified in Mailjet');
  const message = {
    From: parseAddress(config.mailFrom),
    To: (Array.isArray(to) ? to : [to]).map((Email) => ({ Email })),
    ...(replyTo ? { ReplyTo: { Email: replyTo } } : {}),
    Subject: subject,
    TextPart: text,
    HTMLPart: html,
  };
  const auth = Buffer.from(`${config.mailjet.apiKey}:${config.mailjet.secretKey}`).toString('base64');
  const res = await fetch(MAILJET_SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ Messages: [message] }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => ({}))) as MailjetResponse;
  const result = body.Messages?.[0];
  if (res.ok && result?.Status === 'success') return;

  const reasons = (result?.Errors ?? []).map((e) =>
    e.ErrorRelatedTo?.length ? `${e.ErrorMessage} (${e.ErrorRelatedTo.join(', ')})` : String(e.ErrorMessage),
  );
  if (body.ErrorMessage) reasons.push(body.ErrorMessage);
  if (res.status === 401) reasons.unshift('Mailjet rejected the API key or secret key');
  throw new Error(`Mailjet: ${reasons.join('; ') || `HTTP ${res.status}`}`);
}

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

export const fmtDate = (d: Date | string | undefined | null): string =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dubai' }) : 'the due date';

const fill = (tpl: string | undefined, vars: Record<string, string>): string =>
  String(tpl ?? '').replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '');

/** The settings fields an email template needs. */
export type EmailBranding = Pick<ISettings, 'orgName' | 'contactName' | 'contactEmail' | 'accentColor'> & {
  dueDate?: Date | string;
  logo?: ISettings['logo'];
};

/** Logo shown at the top of emails: the uploaded one, else the MCI lockup served by the frontend. */
export const emailLogoUrl = (s: { logo?: ISettings['logo'] }): string =>
  s.logo?.storedName ? `${config.publicBaseUrl}/api/public/logo` : `${config.publicBaseUrl}/brand/mci-lockup.jpeg`;

/** Wrap email body HTML in the branded MCI shell (logo, accent bar, footer). */
export function emailShell(inner: string, s: EmailBranding): string {
  const accent = s.accentColor || '#be2f48';
  return `<!doctype html><html><body style="margin:0;background:#f5f6f8;padding:24px 12px;font-family:'Plus Jakarta Sans',Segoe UI,Arial,sans-serif;color:#17202b;font-size:15px;line-height:1.55">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3e6eb">
<div style="height:4px;background:${accent}"></div>
<div style="padding:22px 30px 0"><img src="${esc(emailLogoUrl(s))}" alt="${esc(s.orgName)}" height="44" style="height:44px;width:auto;display:block;border:0"></div>
<div style="padding:18px 30px 26px">${inner}</div>
<div style="padding:14px 30px;background:#f5f6f8;border-top:1px solid #e3e6eb;font-size:12px;color:#566171">${esc(s.orgName)}${s.contactEmail ? ` · <a href="mailto:${esc(s.contactEmail)}" style="color:#566171">${esc(s.contactEmail)}</a>` : ''}</div>
</div></body></html>`;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

interface RenderInput {
  subjectTpl: string;
  bodyTpl: string;
  settings: EmailBranding;
  customer: { code: string; name: string; contactName?: string; token?: string | null };
}

export function renderEmail({ subjectTpl, bodyTpl, settings, customer }: RenderInput): RenderedEmail {
  const link = formLink(customer.token ?? '');
  const accent = settings.accentColor || '#be2f48';
  const vars: Record<string, string> = {
    code: customer.code,
    customerName: customer.name,
    contactPerson: customer.contactName ?? '',
    link,
    dueDate: fmtDate(settings.dueDate),
    orgName: settings.orgName,
    contactName: settings.contactName,
    contactEmail: settings.contactEmail,
  };
  const subject = fill(subjectTpl, vars);
  const text = fill(bodyTpl, { ...vars, button: `Open the form: ${link}` });

  const htmlVars: Record<string, string> = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, esc(v)]));
  htmlVars.link = `<a href="${esc(link)}" style="color:${accent};word-break:break-all">${esc(link)}</a>`;
  htmlVars.button = `</p><p style="margin:24px 0"><a href="${esc(link)}" style="background:${accent};color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:600;display:inline-block">Open the form</a></p><p style="margin:0 0 14px">`;
  const htmlBody = esc(bodyTpl)
    .replace(/\{\{(\w+)\}\}/g, (_m, k: string) => htmlVars[k] ?? '')
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
  return { subject, text, html: emailShell(htmlBody, settings) };
}

interface SendInput {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

export async function sendMail(input: SendInput): Promise<void> {
  const provider = mailProvider();
  if (provider === 'mailjet') return sendViaMailjet(input);
  const { to, subject, text, html, replyTo } = input;
  const from = config.mailFrom || config.smtp.user || 'no-reply@localhost';
  await getTransport().sendMail({ from, to, subject, text, html, replyTo });
  if (provider === 'none') logger.info({ to, subject }, `[mail] Email sending not configured — email logged, not sent:\n${text}`);
}

export function templatesFor(kind: EmailLogEntry['kind'], e: EmailSettings): { subjectTpl: string; bodyTpl: string } {
  return kind === 'reminder'
    ? { subjectTpl: e.reminderSubject, bodyTpl: e.reminderBody }
    : { subjectTpl: e.inviteSubject, bodyTpl: e.inviteBody };
}

/** Send an invite or reminder to a customer. Adds the outcome to customer.emailLog (caller saves). */
export async function sendCustomerEmail(kind: EmailLogEntry['kind'], customer: CustomerDoc, settings: ISettings): Promise<EmailLogEntry> {
  const rendered = renderEmail({ ...templatesFor(kind, settings.email), settings, customer });
  const to = customer.emails ?? [];
  const entry: EmailLogEntry = { at: new Date(), kind, to, ok: false };
  try {
    if (!to.length) throw new Error('Customer has no email address');
    // Demo customers have made-up addresses: record the email as sent without sending it.
    if (customer.demo) logger.debug({ code: customer.code, kind }, '[mail] demo customer — email simulated');
    else await sendMail({ to, ...rendered, replyTo: settings.contactEmail || undefined });
    entry.ok = true;
  } catch (err) {
    entry.error = (err as Error).message;
  }
  customer.emailLog.push(entry);
  return entry;
}
