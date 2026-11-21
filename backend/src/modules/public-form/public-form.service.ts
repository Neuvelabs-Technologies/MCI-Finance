import { config } from '../../config/env.js';
import { Customer, type CustomerDoc } from '../../models/Customer.js';
import { Settings } from '../../models/Settings.js';
import type { EntityDoc } from '../../models/Entity.js';
import type { ISettings } from '../../models/Settings.js';
import { deliver, emailShell, esc, sendCustomerEmail } from '../../services/mailer.service.js';
import { audit } from '../../utils/audit.js';
import { issueToken } from '../../utils/token.js';
import { logger } from '../../utils/logger.js';
import { FILE_FIELDS, type BuyerData, type FileField } from '../../utils/rules.js';

/** Settings the public form is allowed to see. */
export const publicSettings = (s: ISettings) => ({
  orgName: s.orgName,
  formTitle: s.formTitle,
  formSubtitle: s.formSubtitle,
  intro: s.intro,
  dueDate: s.dueDate,
  contactName: s.contactName,
  contactEmail: s.contactEmail,
  accentColor: s.accentColor,
  hasLogo: !!s.logo?.storedName,
  sections: { ownership: !!s.sections?.ownership, bank: !!s.sections?.bank },
  maxFileMb: config.maxFileMb,
});

export const publicEntity = (e: EntityDoc) => ({
  id: String(e._id),
  key: e.key,
  name: e.name,
  licensedBy: e.licensedBy,
  licenceType: e.licenceType,
  issuingAuthority: e.issuingAuthority,
  licenceNo: e.licenceNo,
  tin: e.tin,
  trn: e.trn,
  peppolId: e.peppolId,
  address: e.address,
  emirate: e.emirate,
  freeZone: e.freeZone,
  contactName: e.contactName,
  contactEmail: e.contactEmail,
});

/** The customer's saved answers, shaped like the form (string ids, yyyy-mm-dd dates). */
export function customerFormData(c: CustomerDoc): Partial<BuyerData> {
  const d = c.toObject().data ?? {};
  return {
    ...d,
    entities: (d.entities ?? []).map(String),
    tradeLicenceExpiry: d.tradeLicenceExpiry ? new Date(d.tradeLicenceExpiry).toISOString().slice(0, 10) : '',
  };
}

/** Metadata of files on record — never the stored file names. */
export function customerFiles(c: CustomerDoc) {
  const out: Partial<Record<FileField, { originalName: string; size: number; uploadedAt: Date }>> = {};
  for (const f of FILE_FIELDS) {
    const meta = c.files?.[f];
    if (meta?.storedName) out[f] = { originalName: meta.originalName, size: meta.size, uploadedAt: meta.uploadedAt };
  }
  return out;
}

/** Find the customer for a form link. Returns 'expired' for an old link, null for an unknown one. */
export async function loadByToken(token: string | undefined): Promise<CustomerDoc | 'expired' | null> {
  if (!token || token.length < 20 || token.length > 64) return null;
  const c = await Customer.findOne({ token });
  if (!c) return null;
  if (c.tokenExpiresAt && c.tokenExpiresAt < new Date()) return 'expired';
  return c;
}

/** Which answers changed between the stored data and a new submission (for the audit trail). */
export function changedFields(before: Record<string, unknown>, next: BuyerData): string[] {
  const norm = (v: unknown): string => {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (Array.isArray(v)) return v.map(String).sort().join(',');
    return String(v ?? '');
  };
  return (Object.keys(next) as (keyof BuyerData)[]).filter((k) => norm(before[k]) !== norm(next[k]));
}

/** Confirmation to the customer and notification to finance. */
export async function notifySubmission(c: CustomerDoc, s: ISettings, d: BuyerData, first: boolean): Promise<void> {
  if (c.demo) return; // demo customers never trigger real emails
  const rows = (
    [
      [c.type === 'vendor' ? 'Vendor code' : 'Customer code', c.code],
      ['Company name', d.companyName],
      ['TRN', d.trn],
      ['TIN', d.tin],
      ['PEPPOL ID', d.peppolId],
      ['Submitted by', [d.declarantName, d.declarantDesignation].filter(Boolean).join(', ')],
      ['Submitted at', `${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dubai' })} (UAE)`],
    ] as [string, string][]
  ).filter(([, v]) => v);
  const table = `<table style="border-collapse:collapse;font-size:14px">${rows
    .map(([k, v]) => `<tr><td style="padding:4px 14px 4px 0;color:#5b6475">${esc(k)}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`)
    .join('')}</table>`;
  const wrap = (inner: string) => emailShell(inner, s);
  const plainRows = rows.map(([k, v]) => `${k}: ${v}`).join('\n');

  if (s.email?.sendConfirmation) {
    const to = [...new Set([d.email, ...(c.emails ?? [])].filter(Boolean))];
    if (to.length) {
      // A failed confirmation (recorded on the Emails page) must not stop the finance notification
      await deliver({
        kind: 'confirmation',
        customer: c._id,
        to,
        replyTo: s.contactEmail || undefined,
        subject: `${s.orgName}: e-invoicing details received – ${c.code}`,
        text: `Thank you. We have received your company's UAE e-invoicing details.\n\n${plainRows}\n\nIf anything changes, you can open the same link again and resubmit.\n\nRegards,\n${s.contactName}\n${s.orgName}`,
        html: wrap(`<p>Thank you. We have received your company's UAE e-invoicing details.</p>${table}<p>If anything changes, you can open the same link again and resubmit.</p><p>Regards,<br>${esc(s.contactName)}<br>${esc(s.orgName)}</p>`),
      }).catch((err: unknown) => logger.warn({ err, code: c.code }, '[notify] confirmation email failed'));
    }
  }
  if (config.notifyEmails) {
    await deliver({
      kind: 'notification',
      customer: c._id,
      to: config.notifyEmails.split(',').map((x) => x.trim()).filter(Boolean),
      subject: `[e-Invoicing] ${first ? 'New' : 'Updated'} ${c.type === 'vendor' ? 'vendor' : 'customer'} submission: ${c.code} – ${d.companyName}`,
      text: plainRows,
      html: wrap(`<p>A ${c.type === 'vendor' ? 'vendor' : 'customer'} has ${first ? 'submitted' : 'updated'} their e-invoicing details.</p>${table}<p>Open the admin panel to review the documents.</p>`),
    });
  }
}

/** A party asks for its link again from the home page at most this often. */
export const RESEND_COOLDOWN_MS = 30 * 60 * 1000;

/**
 * Email the form link again to every invited party (customer or vendor) registered with this address
 * that we're still waiting on. Returns how many were sent; the caller never tells the visitor.
 */
export async function resendLinks(email: string): Promise<number> {
  const addr = email.trim().toLowerCase();
  const parties = await Customer.find({
    emails: addr,
    demo: { $ne: true },
    invitedAt: { $ne: null },
    $or: [{ status: { $ne: 'submitted' } }, { reviewStatus: 'needs_correction' }],
  });
  if (!parties.length) return 0;
  const s = await Settings.get();
  const now = Date.now();
  let sent = 0;
  for (const c of parties) {
    const last = c.emailLog?.length ? c.emailLog[c.emailLog.length - 1] : undefined;
    if (last?.ok && now - new Date(last.at).getTime() < RESEND_COOLDOWN_MS) continue;
    if (!c.token || (c.tokenExpiresAt && c.tokenExpiresAt.getTime() < now)) issueToken(c, s.linkValidityDays);
    const correction = c.status === 'submitted' && c.reviewStatus === 'needs_correction';
    const r = await sendCustomerEmail(correction ? 'correction' : 'invite', c, s);
    await c.save();
    await audit(null, 'link.resend_requested', { customer: c._id, actor: 'public', details: { ok: r.ok } });
    if (r.ok) sent++;
  }
  return sent;
}
