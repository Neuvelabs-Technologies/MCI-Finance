import type { Request, Response } from 'express';
import type { QueryFilter } from 'mongoose';
import { EmailMessage, MAIL_KINDS, MAIL_STATUSES, PROBLEM_STATUSES, type IEmailMessage, type MailKind, type MailStatus } from '../../models/EmailMessage.js';
import { buildEmailExport } from '../../services/excel.service.js';
import { mailProvider } from '../../services/mailer.service.js';
import { syncFromMailjet } from '../../services/mail-tracking.service.js';
import { badRequest } from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { XLSX_MIME, escapeRegex, isId, str } from '../../utils/http.js';

/** Status groups the Emails page filters by, besides single statuses. */
const STATUS_GROUPS: Record<string, MailStatus[]> = {
  problem: PROBLEM_STATUSES,
  delivered: ['delivered', 'opened', 'clicked'],
  waiting: ['queued'],
};

function buildFilter(req: Request): QueryFilter<IEmailMessage> {
  const filter: QueryFilter<IEmailMessage> = {};
  const status = str(req.query.status);
  if (STATUS_GROUPS[status]) filter.status = { $in: STATUS_GROUPS[status] };
  else if ((MAIL_STATUSES as readonly string[]).includes(status)) filter.status = status as MailStatus;
  const kind = str(req.query.kind);
  if ((MAIL_KINDS as readonly string[]).includes(kind)) filter.kind = kind as MailKind;
  if (isId(req.query.customer)) filter.customer = req.query.customer;
  const q = str(req.query.q).trim();
  if (q) {
    const re = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ to: re }, { subject: re }];
  }
  return filter;
}

export async function list(req: Request, res: Response) {
  const filter = buildFilter(req);
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const [emails, total, byStatus] = await Promise.all([
    EmailMessage.find(filter).sort({ at: -1 }).skip((page - 1) * limit).limit(limit).populate('customer', 'code name'),
    EmailMessage.countDocuments(filter),
    EmailMessage.aggregate<{ _id: MailStatus; n: number }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  const summary = Object.fromEntries(byStatus.map((x) => [x._id, x.n]));
  res.json({ emails, total, page, limit, summary, provider: mailProvider() });
}

export async function exportXlsx(req: Request, res: Response) {
  const emails = await EmailMessage.find(buildFilter(req)).sort({ at: -1 }).limit(20000).populate('customer', 'code name');
  const buf = await buildEmailExport(emails as Parameters<typeof buildEmailExport>[0]);
  await audit(req, 'export.emails', { details: { count: emails.length } });
  res.attachment(`e-invoicing-emails-${new Date().toISOString().slice(0, 10)}.xlsx`);
  res.type(XLSX_MIME);
  res.send(buf);
}

/** "Refresh from Mailjet": update recent emails' delivery status from Mailjet's API. */
export async function sync(_req: Request, res: Response) {
  if (mailProvider() !== 'mailjet') throw badRequest('Delivery status is only available when emails are sent through Mailjet');
  try {
    res.json(await syncFromMailjet());
  } catch (e) {
    throw badRequest(`Could not reach Mailjet: ${(e as Error).message}`);
  }
}
