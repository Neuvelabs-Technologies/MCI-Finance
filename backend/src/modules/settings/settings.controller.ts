import type { Request, Response } from 'express';
import { config } from '../../config/env.js';
import { currentAdmin } from '../../middlewares/auth.middleware.js';
import { Settings, type EmailSettings } from '../../models/Settings.js';
import { renderEmail, sendMail, mailConfigured, templatesFor } from '../../services/mailer.service.js';
import { saveLogo } from '../../services/storage.service.js';
import { badRequest } from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { str } from '../../utils/http.js';
import { isEmail } from '../../utils/rules.js';

const TEXT_FIELDS = ['orgName', 'formTitle', 'formSubtitle', 'intro', 'contactName', 'contactEmail', 'autoReminderDays'] as const;
const EMAIL_TEXT_FIELDS = ['inviteSubject', 'inviteBody', 'reminderSubject', 'reminderBody'] as const;

export async function get(_req: Request, res: Response) {
  const s = await Settings.get();
  res.json({ settings: s, smtpConfigured: mailConfigured(), publicBaseUrl: config.publicBaseUrl });
}

export async function update(req: Request, res: Response) {
  const s = await Settings.get();
  const b = (req.body ?? {}) as Record<string, unknown> & {
    sections?: { ownership?: unknown; bank?: unknown };
    email?: Partial<Record<keyof EmailSettings, unknown>>;
  };

  if (b.autoReminderDays !== undefined && !/^\s*(\d+\s*(,\s*\d+\s*)*)?$/.test(str(b.autoReminderDays)))
    throw badRequest('Auto-reminder days must be numbers separated by commas, e.g. 7,2');
  if (b.accentColor !== undefined && !/^#[0-9a-f]{6}$/i.test(str(b.accentColor)))
    throw badRequest('Accent colour must be a hex value like #0b5cad');

  for (const k of TEXT_FIELDS) if (b[k] !== undefined) s[k] = str(b[k]);
  if (b.accentColor !== undefined) s.accentColor = str(b.accentColor);
  if (b.dueDate !== undefined) s.dueDate = b.dueDate ? new Date(str(b.dueDate)) : undefined;
  if (b.linkValidityDays !== undefined) s.linkValidityDays = Math.max(1, Math.min(Number(b.linkValidityDays) || 90, 365));
  if (b.sections) {
    if (b.sections.ownership !== undefined) s.sections.ownership = !!b.sections.ownership;
    if (b.sections.bank !== undefined) s.sections.bank = !!b.sections.bank;
  }
  if (b.email) {
    for (const k of EMAIL_TEXT_FIELDS) if (b.email[k] !== undefined) s.email[k] = str(b.email[k]);
    if (b.email.sendConfirmation !== undefined) s.email.sendConfirmation = !!b.email.sendConfirmation;
  }
  await s.save();
  await audit(req, 'settings.updated');
  res.json({ settings: s });
}

export async function uploadLogo(req: Request, res: Response) {
  if (!req.file) throw badRequest('Upload a PNG, JPG, SVG or WebP image under 1 MB');
  const s = await Settings.get();
  s.logo = saveLogo(req.file);
  await s.save();
  res.json({ ok: true });
}

export async function removeLogo(_req: Request, res: Response) {
  const s = await Settings.get();
  s.logo = undefined;
  await s.save();
  res.json({ ok: true });
}

export async function testEmail(req: Request, res: Response) {
  const to = str(req.body?.to) || currentAdmin(req).email;
  if (!isEmail(to)) throw badRequest('Enter a valid email');
  try {
    await sendMail({ to, subject: 'Test email from the e-invoicing form', text: 'Your email settings work.', html: '<p>Your email settings work.</p>' });
  } catch (e) {
    throw badRequest(`Send failed: ${(e as Error).message}`);
  }
  res.json({ ok: true, smtpConfigured: mailConfigured() });
}

/** Render the invite/reminder email with unsaved edits from the settings page. */
export async function previewEmail(req: Request, res: Response) {
  const s = await Settings.get();
  const saved = s.toObject();
  const kind = req.body?.kind === 'reminder' ? 'reminder' : 'invite';
  const branding = { ...saved, ...((req.body?.settings ?? {}) as Partial<typeof saved>) };
  const email: EmailSettings = { ...saved.email, ...((req.body?.email ?? {}) as Partial<EmailSettings>) };
  const out = renderEmail({
    ...templatesFor(kind, email),
    settings: branding,
    customer: { code: 'CL01015', name: 'Example Trading LLC', token: 'preview-token-example' },
  });
  res.json(out);
}
