import crypto from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import type { Types } from 'mongoose';
import { config } from '../config/env.js';
import type { CustomerDoc, EmailLogEntry, PartyType } from '../models/Customer.js';
import { EmailMessage, type IEmailMessage, type MailKind, type MailStatus } from '../models/EmailMessage.js';
import type { EmailTemplates, ISettings } from '../models/Settings.js';
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

/**
 * Split `"Name" <email@x>` into its parts; a bare address is returned as is.
 * Quotes around the whole value are dropped: Docker's --env-file keeps them as part of the value.
 */
export function parseAddress(raw: string): { Email: string; Name?: string } {
  const s = raw.trim().replace(/^(["'])(.*)\1$/, '$2');
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
  Messages?: { Status?: string; Errors?: MailjetError[]; To?: { Email: string; MessageUUID?: string; MessageID?: string }[] }[];
}

/** What happened to one recipient when the email was handed over. */
export interface SentRecipient {
  email: string;
  messageUuid?: string;
  messageId?: string;
}

export interface SendOutcome {
  provider: MailProvider;
  recipients: SentRecipient[];
}

const recipientList = (to: string | string[]): string[] => (Array.isArray(to) ? to : [to]);

const MAILJET_SEND_URL = 'https://api.mailjet.com/v3.1/send';

async function sendViaMailjet({ to, subject, text, html, replyTo, customId }: SendInput): Promise<SendOutcome> {
  if (!config.mailFrom) throw new Error('MAIL_FROM is empty — set it to a sender address verified in Mailjet');
  const message = {
    From: parseAddress(config.mailFrom),
    To: recipientList(to).map((Email) => ({ Email })),
    ...(replyTo ? { ReplyTo: { Email: replyTo } } : {}),
    Subject: subject,
    TextPart: text,
    HTMLPart: html,
    // Links carry the customer's private form token: don't route them through Mailjet's click tracker
    TrackClicks: 'disabled',
    ...(customId ? { CustomID: customId } : {}),
  };
  const auth = Buffer.from(`${config.mailjet.apiKey}:${config.mailjet.secretKey}`).toString('base64');
  const res = await fetch(MAILJET_SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ Messages: [message] }),
    signal: AbortSignal.timeout(30_000),
  });
  // MessageID is a 64-bit number that JSON.parse would round, so read it as a string
  const raw = (await res.text().catch(() => '')).replace(/"MessageID"\s*:\s*(\d+)/g, '"MessageID":"$1"');
  let body: MailjetResponse = {};
  try {
    body = JSON.parse(raw) as MailjetResponse;
  } catch {
    // not JSON: reported below by HTTP status
  }
  const result = body.Messages?.[0];
  if (res.ok && result?.Status === 'success') {
    return {
      provider: 'mailjet',
      recipients: (result.To ?? []).map((r) => ({ email: r.Email.toLowerCase(), messageUuid: r.MessageUUID, messageId: r.MessageID })),
    };
  }

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
  customer: { type?: PartyType; code: string; name: string; contactName?: string; token?: string | null; reviewNote?: string };
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
    reviewNote: customer.reviewNote ?? '',
    partyType: customer.type === 'vendor' ? 'supplier' : 'customer',
    partyTitle: customer.type === 'vendor' ? 'Supplier' : 'Customer',
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

export interface SendInput {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  /** Our reference for this email; Mailjet returns it in delivery events. */
  customId?: string;
}

/** Hand an email to the configured provider. Throws if it is rejected. Use deliver() to also record it. */
export async function sendMail(input: SendInput): Promise<SendOutcome> {
  const provider = mailProvider();
  if (provider === 'mailjet') return sendViaMailjet(input);
  const { to, subject, text, html, replyTo } = input;
  const from = config.mailFrom || config.smtp.user || 'no-reply@localhost';
  await getTransport().sendMail({ from, to, subject, text, html, replyTo });
  if (provider === 'none') logger.info({ to, subject }, `[mail] Email sending not configured — email logged, not sent:\n${text}`);
  return { provider, recipients: recipientList(to).map((email) => ({ email: email.toLowerCase() })) };
}

/** Sent when finance asks a customer who has submitted to correct something. {{reviewNote}} is finance's note. */
const CORRECTION_SUBJECT = 'Action needed: please update your UAE e-invoicing details – {{code}}';
const CORRECTION_BODY = `Dear Valued {{partyTitle}},

Thank you for submitting your company's UAE e-invoicing details. On review, we need you to correct the following:

{{reviewNote}}

Please open your form, make the change and submit it again by {{dueDate}}. Your other answers are kept.

{{button}}

If the button does not work, copy this link into your browser:
{{link}}

Regards,
{{contactName}}
{{orgName}}
{{contactEmail}}`;

/** The invite/reminder templates for a customer or a vendor. */
export const templatesOf = (s: Pick<ISettings, 'email' | 'vendorEmail'>, type: PartyType | undefined): EmailTemplates =>
  type === 'vendor' && s.vendorEmail ? s.vendorEmail : s.email;

export function templatesFor(kind: EmailLogEntry['kind'], e: EmailTemplates): { subjectTpl: string; bodyTpl: string } {
  if (kind === 'correction') return { subjectTpl: CORRECTION_SUBJECT, bodyTpl: CORRECTION_BODY };
  return kind === 'reminder'
    ? { subjectTpl: e.reminderSubject, bodyTpl: e.reminderBody }
    : { subjectTpl: e.inviteSubject, bodyTpl: e.inviteBody };
}

export interface DeliverInput extends Omit<SendInput, 'customId'> {
  kind: MailKind;
  customer?: Types.ObjectId;
  /** Demo customer: record the email as delivered without sending it. */
  demo?: boolean;
}

/** Saving the email record must never stop the email itself. */
async function record(what: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    logger.warn({ err }, `[mail] could not ${what}`);
  }
}

/**
 * Send an email and record it (one EmailMessage per recipient) so its delivery status can be followed.
 * Throws if the provider rejects it; the failure is recorded first.
 */
export async function deliver({ kind, customer, demo, ...mail }: DeliverInput): Promise<{ batchId: string }> {
  const to = [...new Set(recipientList(mail.to).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!to.length) throw new Error('No email address');
  const batchId = crypto.randomUUID();
  const provider = mailProvider();
  const now = new Date();
  const base: Partial<IEmailMessage> = { at: now, statusAt: now, kind, customer, subject: mail.subject, provider, batchId, demo: !!demo };

  if (demo) {
    await record('record a demo email', () =>
      EmailMessage.insertMany(to.map((email) => ({ ...base, to: email, status: 'delivered', detail: 'Demo customer — not really sent', events: [] })))
    );
    return { batchId };
  }

  // Recorded before sending, so a delivery event that arrives quickly always finds its record
  await record('record an email', () => EmailMessage.insertMany(to.map((email) => ({ ...base, to: email, status: 'queued', events: [] }))));
  try {
    const out = await sendMail({ ...mail, to, customId: batchId });
    const status: MailStatus | undefined = provider === 'smtp' ? 'accepted' : provider === 'none' ? 'not_sent' : undefined;
    await record('save message ids', () =>
      Promise.all(
        to.map((email) => {
          const r = out.recipients.find((x) => x.email === email);
          const set: Partial<IEmailMessage> = {};
          if (r?.messageUuid) set.messageUuid = r.messageUuid;
          if (r?.messageId) set.messageId = r.messageId;
          if (status) Object.assign(set, { status, statusAt: new Date() });
          return Object.keys(set).length ? EmailMessage.updateOne({ batchId, to: email }, { $set: set }) : null;
        })
      )
    );
  } catch (err) {
    const detail = (err as Error).message;
    await record('record a failed email', () =>
      EmailMessage.updateMany({ batchId }, { $set: { status: 'failed', statusAt: new Date(), detail }, $push: { events: { at: new Date(), type: 'failed', detail } } })
    );
    throw err;
  }
  return { batchId };
}

/** Send an invite or reminder to a customer. Adds the outcome to customer.emailLog (caller saves). */
export async function sendCustomerEmail(kind: EmailLogEntry['kind'], customer: CustomerDoc, settings: ISettings): Promise<EmailLogEntry> {
  const rendered = renderEmail({ ...templatesFor(kind, templatesOf(settings, customer.type)), settings, customer });
  const to = customer.emails ?? [];
  const entry: EmailLogEntry = { at: new Date(), kind, to, ok: false };
  try {
    if (!to.length) throw new Error('Customer has no email address');
    // Demo customers have made-up addresses: recorded as delivered without sending.
    const { batchId } = await deliver({ kind, customer: customer._id, demo: !!customer.demo, to, ...rendered, replyTo: settings.contactEmail || undefined });
    entry.batchId = batchId;
    entry.ok = true;
  } catch (err) {
    entry.error = (err as Error).message;
  }
  customer.emailLog.push(entry);
  return entry;
}
