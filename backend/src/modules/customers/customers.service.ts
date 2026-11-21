import type { QueryFilter, Types } from 'mongoose';
import {
  CUSTOMER_STATUSES,
  Customer,
  REVIEW_STATUSES,
  type CustomerDoc,
  type CustomerStatus,
  type EmailLogEntry,
  type ICustomer,
  type PartyType,
  type ReviewStatus,
} from '../../models/Customer.js';
import { AuditLog } from '../../models/AuditLog.js';
import { Entity } from '../../models/Entity.js';
import { Settings } from '../../models/Settings.js';
import { parseCustomerImport, type ImportError } from '../../services/excel.service.js';
import { sendCustomerEmail, mailConfigured } from '../../services/mailer.service.js';
import { escapeRegex } from '../../utils/http.js';
import { issueToken } from '../../utils/token.js';

/** The row shown in the customer list. */
export function toSummary(c: CustomerDoc) {
  return {
    id: c._id,
    type: c.type ?? 'customer',
    code: c.code,
    name: c.name,
    emails: c.emails,
    contactName: c.contactName,
    status: c.status,
    reviewStatus: c.reviewStatus,
    invitedAt: c.invitedAt,
    reminderCount: c.reminderCount,
    lastReminderAt: c.lastReminderAt,
    openedAt: c.openedAt,
    submittedAt: c.submittedAt,
    submitCount: c.submitCount,
    tokenExpiresAt: c.tokenExpiresAt,
    companyName: c.data?.companyName,
    trn: c.data?.trn,
    tin: c.data?.tin,
    peppolId: c.data?.peppolId,
    lastEmail: c.emailLog?.length ? c.emailLog[c.emailLog.length - 1] : null,
    demo: !!c.demo,
  };
}

export interface ListQuery {
  type?: PartyType;
  status?: string;
  review?: string;
  q?: string;
  issue?: string;
  demo?: string;
}

/** Customers we're still waiting on: not submitted yet, or asked to correct their submission. */
const WAITING_ON_CUSTOMER: QueryFilter<ICustomer>[] = [{ status: { $ne: 'submitted' } }, { reviewStatus: 'needs_correction' }];
const LAST_EMAIL_FAILED = { $expr: { $eq: [{ $arrayElemAt: ['$emailLog.ok', -1] }, false] } };

/** Turn the list/export query string into a MongoDB filter. */
export function buildFilter(q: ListQuery): QueryFilter<ICustomer> {
  const filter: QueryFilter<ICustomer> = {};
  if (q.type) filter.type = q.type;
  if (q.status === 'pending') filter.status = { $ne: 'submitted' };
  else if (q.status === 'awaiting') filter.status = { $in: ['invited', 'opened'] };
  else if (isCustomerStatus(q.status)) filter.status = q.status;
  if (isReviewStatus(q.review)) {
    filter.status = 'submitted';
    filter.reviewStatus = q.review;
  }
  // Problems the Overview page links to
  // $and, so the search box's own $or can't replace this one
  if (q.issue === 'email_failed') Object.assign(filter, { $and: [{ $or: WAITING_ON_CUSTOMER }], ...LAST_EMAIL_FAILED });
  if (q.issue === 'link_expired') Object.assign(filter, { status: { $ne: 'submitted' }, tokenExpiresAt: { $lt: new Date() } });
  if (q.issue === 'no_email') Object.assign(filter, { status: { $ne: 'submitted' }, emails: { $size: 0 } });
  if (q.demo === 'only') filter.demo = true;
  if (q.demo === 'hide') filter.demo = { $ne: true };
  if (q.q) {
    const re = new RegExp(escapeRegex(String(q.q).trim()), 'i');
    filter.$or = [{ code: re }, { name: re }, { emails: re }, { 'data.companyName': re }, { 'data.trn': re }, { 'data.tin': re }];
  }
  return filter;
}

/** Limit a query to one party type; no type = customers and vendors together. */
const ofType = (type?: PartyType): QueryFilter<ICustomer> => (type ? { type } : {});

/** How many customers and vendors there are (for the sidebar). */
export async function typeCounts(): Promise<Record<PartyType, number>> {
  const rows = await Customer.aggregate<{ _id: PartyType | null; n: number }>([{ $group: { _id: '$type', n: { $sum: 1 } } }]);
  const out: Record<PartyType, number> = { customer: 0, vendor: 0 };
  for (const r of rows) out[r._id === 'vendor' ? 'vendor' : 'customer'] += r.n;
  return out;
}

export async function getStats(type?: PartyType) {
  const match = ofType(type);
  const [byStatus, byReview, s, entityCount] = await Promise.all([
    Customer.aggregate<{ _id: string; n: number }>([{ $match: match }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Customer.aggregate<{ _id: string; n: number }>([{ $match: { ...match, status: 'submitted' } }, { $group: { _id: '$reviewStatus', n: { $sum: 1 } } }]),
    Settings.get(),
    Entity.countDocuments({ active: true }),
  ]);
  const status = Object.fromEntries(byStatus.map((x) => [x._id, x.n])) as Record<string, number>;
  const review = Object.fromEntries(byReview.map((x) => [x._id, x.n])) as Record<string, number>;
  const total = Object.values(status).reduce((a, b) => a + b, 0);
  return { total, status, review, dueDate: s.dueDate, smtpConfigured: mailConfigured(), entityCount };
}

/** Everything the Overview dashboard shows, in one request. */
export async function getOverview(type?: PartyType) {
  const now = new Date();
  const pendingStatus = { $ne: 'submitted' as const };
  const t = ofType(type);
  const [stats, s, invited, opened, toReview, recentSubmissions, counts, activity] = await Promise.all([
    getStats(type),
    Settings.get(),
    Customer.countDocuments({ ...t, invitedAt: { $ne: null } }),
    Customer.countDocuments({ ...t, openedAt: { $ne: null } }),
    Customer.find({ ...t, status: 'submitted', reviewStatus: 'pending' }).sort({ submittedAt: 1 }).limit(6),
    Customer.find({ ...t, status: 'submitted' }).sort({ submittedAt: -1 }).limit(6),
    Promise.all([
      Customer.countDocuments({ ...t, status: 'submitted', reviewStatus: 'needs_correction' }),
      Customer.countDocuments({ ...t, $or: WAITING_ON_CUSTOMER, ...LAST_EMAIL_FAILED }),
      Customer.countDocuments({ ...t, status: pendingStatus, tokenExpiresAt: { $lt: now } }),
      Customer.countDocuments({ ...t, status: pendingStatus, emails: { $size: 0 } }),
    ]),
    AuditLog.find().sort({ at: -1 }).limit(8).populate('customer', 'code name type'),
  ]);
  const [corrections, emailFailures, expiredLinks, noEmail] = counts;
  const submitted = stats.status.submitted ?? 0;
  const dueDate = s.dueDate ?? null;
  const daysLeft = dueDate ? Math.ceil((new Date(dueDate).getTime() - now.getTime()) / 864e5) : null;
  return {
    ...stats,
    daysLeft,
    funnel: { total: stats.total, invited, opened, submitted, verified: stats.review.verified ?? 0 },
    attention: { toReview: stats.review.pending ?? 0, corrections, emailFailures, expiredLinks, noEmail },
    toReview: toReview.map(toSummary),
    recentSubmissions: recentSubmissions.map(toSummary),
    activity,
    setup: {
      smtp: stats.smtpConfigured,
      dueDate: !!dueDate,
      contactEmail: !!s.contactEmail,
      entities: stats.entityCount > 0,
      customers: stats.total > 0,
      invitesSent: invited > 0,
    },
  };
}

/** Add new customers/vendors and update existing ones (matched by code) from an uploaded list. */
export async function importCustomers(buffer: Buffer, filename: string, type: PartyType = 'customer') {
  const { items, errors } = await parseCustomerImport(buffer, filename);
  const s = await Settings.get();
  let created = 0;
  let updated = 0;
  const seen = new Set<string>();
  const allErrors: ImportError[] = [...errors];
  for (const it of items) {
    if (seen.has(it.code)) {
      allErrors.push({ row: it.row, reason: `Duplicate code ${it.code} in file` });
      continue;
    }
    seen.add(it.code);
    const existing = await Customer.findOne({ code: it.code });
    if (existing && (existing.type ?? 'customer') !== type) {
      // Codes are unique across customers and vendors: never turn one into the other by import
      allErrors.push({ row: it.row, reason: `Code ${it.code} already exists as a ${existing.type ?? 'customer'}` });
      continue;
    }
    if (existing) {
      existing.name = it.name;
      if (it.emails.length) existing.emails = it.emails;
      if (it.contactName) existing.contactName = it.contactName;
      await existing.save();
      updated++;
    } else {
      const c = new Customer({ type, code: it.code, name: it.name, emails: it.emails, contactName: it.contactName });
      issueToken(c, s.linkValidityDays);
      await c.save();
      created++;
    }
  }
  return { created, updated, errors: allErrors };
}

export interface SendResult {
  id: Types.ObjectId | string;
  code: string;
  ok: boolean;
  error?: string;
}

async function pendingIds(kind: EmailLogEntry['kind'], type?: PartyType): Promise<Types.ObjectId[]> {
  const pending = await Customer.find({
    ...ofType(type),
    status: { $ne: 'submitted' },
    ...(kind === 'reminder' ? { invitedAt: { $ne: null } } : { status: 'new' }),
  }).select('_id');
  return pending.map((x) => x._id);
}

/** Update the customer's status after an invite/reminder went out. */
function markEmailed(c: CustomerDoc, kind: EmailLogEntry['kind']): void {
  const now = new Date();
  if (kind === 'reminder') {
    c.reminderCount = (c.reminderCount || 0) + 1;
    c.lastReminderAt = now;
  }
  c.invitedAt = c.invitedAt ?? now;
  if (c.status === 'new') c.status = 'invited';
}

/** Email invites or reminders. Pass `allPending` to target everyone still waiting instead of `ids`. */
export async function sendEmails(
  kind: 'invite' | 'reminder',
  ids: (Types.ObjectId | string)[],
  allPending: boolean,
  type?: PartyType
): Promise<SendResult[]> {
  const targets = allPending ? await pendingIds(kind, type) : ids;
  const s = await Settings.get();
  const results: SendResult[] = [];
  // One at a time, so a large batch doesn't overwhelm the email provider.
  for (const id of targets) {
    const c = await Customer.findById(id);
    if (!c) continue;
    // A reminder to someone who submitted is only for asking them to correct something
    const correction = kind === 'reminder' && c.status === 'submitted' && c.reviewStatus === 'needs_correction';
    if (kind === 'reminder' && c.status === 'submitted' && !correction) {
      results.push({ id, code: c.code, ok: false, error: 'Already submitted' });
      continue;
    }
    const expired = !c.token || (c.tokenExpiresAt && c.tokenExpiresAt < new Date());
    if (expired) issueToken(c, s.linkValidityDays);
    const r = await sendCustomerEmail(correction ? 'correction' : kind, c, s);
    if (r.ok) markEmailed(c, kind);
    await c.save();
    results.push({ id, code: c.code, ok: r.ok, error: r.error });
  }
  return results;
}

export const isReviewStatus = (v: unknown): v is ReviewStatus =>
  typeof v === 'string' && (REVIEW_STATUSES as readonly string[]).includes(v);

const isCustomerStatus = (v: unknown): v is CustomerStatus =>
  typeof v === 'string' && (CUSTOMER_STATUSES as readonly string[]).includes(v);
