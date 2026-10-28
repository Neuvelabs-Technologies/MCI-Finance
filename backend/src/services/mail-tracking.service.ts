// Delivery status of sent emails, from Mailjet.
// - Webhook: Mailjet posts events (sent, open, bounce, blocked, spam…) to /api/webhooks/mailjet.
// - Refresh: syncFromMailjet() asks Mailjet's API about recent emails (works without the webhook).
import { config } from '../config/env.js';
import { Customer } from '../models/Customer.js';
import { EmailMessage, PROBLEM_STATUSES, type EmailMessageDoc, type MailStatus } from '../models/EmailMessage.js';
import { logger } from '../utils/logger.js';

/** Higher replaces lower; events arriving out of order never move a status backwards. */
const RANK: Record<MailStatus, number> = {
  not_sent: 0,
  failed: 0,
  queued: 0,
  accepted: 0,
  delivered: 1,
  opened: 2,
  clicked: 3,
  unsubscribed: 4,
  spam: 5,
  bounced: 6,
  blocked: 6,
};

/** Mailjet webhook event names → our status. */
const EVENT_STATUS: Record<string, MailStatus> = {
  sent: 'delivered',
  open: 'opened',
  click: 'clicked',
  bounce: 'bounced',
  blocked: 'blocked',
  spam: 'spam',
  unsub: 'unsubscribed',
};

/** Mailjet message "Status" values (REST API) → our status. */
const MESSAGE_STATUS: Record<string, MailStatus> = {
  sent: 'delivered',
  opened: 'opened',
  clicked: 'clicked',
  bounce: 'bounced',
  hardbounced: 'bounced',
  softbounced: 'bounced',
  blocked: 'blocked',
  spam: 'spam',
  unsub: 'unsubscribed',
};

/** A Mailjet event, as posted to the webhook. Only the fields we use. */
export interface MailjetEvent {
  event?: string;
  time?: number;
  email?: string;
  Message_GUID?: string;
  CustomID?: string;
  error_related_to?: string;
  error?: string;
  comment?: string;
  hard_bounce?: boolean;
  source?: string;
}

const MAX_EVENTS = 50;

/** Plain-English reason for a problem event. */
export function eventDetail(ev: MailjetEvent): string | undefined {
  const reason = [ev.error, ev.comment].filter(Boolean).join(' — ');
  const related = ev.error_related_to && ev.error_related_to !== 'none' ? ` (${ev.error_related_to})` : '';
  switch (ev.event) {
    case 'bounce':
      return `${ev.hard_bounce ? 'Hard bounce: the address does not exist or refuses mail' : 'Soft bounce: the mailbox was full or unavailable'}${reason ? ` — ${reason}` : ''}${related}`;
    case 'blocked':
      return `Blocked by Mailjet${reason ? `: ${reason}` : ''}${related}`;
    case 'spam':
      return `The recipient marked it as spam${ev.source ? ` (${ev.source})` : ''}`;
    case 'unsub':
      return 'The recipient unsubscribed';
    default:
      return undefined;
  }
}

/** Record an event on an email and move its status forward. Returns true if the status changed. */
async function applyStatus(doc: EmailMessageDoc, status: MailStatus, at: Date, type: string, detail?: string): Promise<boolean> {
  if (!doc.events.some((e) => e.type === type && e.at?.getTime() === at.getTime())) {
    doc.events.push({ at, type, detail });
    if (doc.events.length > MAX_EVENTS) doc.events.splice(0, doc.events.length - MAX_EVENTS);
  }
  const changed = RANK[status] > RANK[doc.status];
  if (changed) {
    doc.status = status;
    doc.statusAt = at;
    if (detail) doc.detail = detail;
  }
  await doc.save();
  if (changed && PROBLEM_STATUSES.includes(status)) await flagCustomerEmail(doc, detail ?? status);
  return changed;
}

/** A bounced/blocked invite or reminder shows as a failed email on the customer (lists, Overview, filters). */
async function flagCustomerEmail(doc: EmailMessageDoc, detail: string): Promise<void> {
  if (!doc.customer || (doc.kind !== 'invite' && doc.kind !== 'reminder')) return;
  await Customer.updateOne(
    { _id: doc.customer, 'emailLog.batchId': doc.batchId },
    { $set: { 'emailLog.$.ok': false, 'emailLog.$.error': `${doc.to}: ${detail}` } }
  );
}

/** Apply one webhook event. Unknown messages (e.g. sent by another system on the same key) are ignored. */
export async function applyMailjetEvent(ev: MailjetEvent): Promise<'applied' | 'ignored'> {
  const status = ev.event ? EVENT_STATUS[ev.event] : undefined;
  if (!status) return 'ignored';
  let doc = ev.Message_GUID ? await EmailMessage.findOne({ messageUuid: ev.Message_GUID }) : null;
  if (!doc && ev.CustomID && ev.email) doc = await EmailMessage.findOne({ batchId: ev.CustomID, to: ev.email.toLowerCase() });
  if (!doc) return 'ignored';
  if (ev.Message_GUID && !doc.messageUuid) doc.messageUuid = ev.Message_GUID;
  const at = ev.time ? new Date(ev.time * 1000) : new Date();
  await applyStatus(doc, status, at, ev.event as string, eventDetail(ev));
  return 'applied';
}

// ---------------- Refresh from Mailjet's API ----------------

const MAILJET_API = 'https://api.mailjet.com/v3/REST';

async function mailjetGet<T>(path: string): Promise<T | null> {
  const auth = Buffer.from(`${config.mailjet.apiKey}:${config.mailjet.secretKey}`).toString('base64');
  const res = await fetch(`${MAILJET_API}/${path}`, { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) return null; // not processed by Mailjet yet
  if (res.status === 401) throw new Error('Mailjet rejected the API key or secret key');
  if (!res.ok) throw new Error(`Mailjet API error ${res.status}`);
  return (await res.json()) as T;
}

interface MailjetMessage {
  Status?: string;
  ArrivedAt?: string;
}
interface MailjetHistoryEvent {
  EventAt?: number;
  EventType?: string;
  State?: string;
  Comment?: string;
}

/** Update one email from Mailjet's message API. */
async function refreshOne(doc: EmailMessageDoc): Promise<boolean> {
  if (!doc.messageId) return false;
  const msg = (await mailjetGet<{ Data?: MailjetMessage[] }>(`message/${doc.messageId}`))?.Data?.[0];
  const status = msg?.Status ? MESSAGE_STATUS[msg.Status] : undefined;
  if (!status || RANK[status] <= RANK[doc.status]) return false;

  let detail: string | undefined;
  let at = new Date();
  // The history has the time of the event and, for problems, the reason
  const history = (await mailjetGet<{ Data?: MailjetHistoryEvent[] }>(`messagehistory/${doc.messageId}`))?.Data ?? [];
  const last = history.at(-1);
  if (last?.EventAt) at = new Date(last.EventAt * 1000);
  if (PROBLEM_STATUSES.includes(status) || status === 'unsubscribed') {
    const reason = [last?.State, last?.Comment].filter(Boolean).join(' — ');
    const name = status === 'bounced' ? (msg?.Status === 'softbounced' ? 'Soft bounce' : 'Bounced') : status === 'blocked' ? 'Blocked by Mailjet' : status === 'spam' ? 'Marked as spam' : 'Unsubscribed';
    detail = reason ? `${name}: ${reason}` : name;
  }
  return applyStatus(doc, status, at, `refresh:${msg?.Status}`, detail);
}

/**
 * Ask Mailjet about recent emails whose status can still change (queued, delivered, opened).
 * Used by "Refresh from Mailjet" when the webhook isn't set up, or to catch up.
 */
export async function syncFromMailjet({ days = 14, limit = 150 } = {}): Promise<{ checked: number; updated: number }> {
  const docs = await EmailMessage.find({
    provider: 'mailjet',
    demo: { $ne: true },
    status: { $in: ['queued', 'delivered', 'opened'] },
    messageId: { $exists: true },
    at: { $gte: new Date(Date.now() - days * 864e5) },
  })
    .sort({ at: -1 })
    .limit(limit);
  let updated = 0;
  // A few at a time, to stay well within Mailjet's API rate limits
  for (let i = 0; i < docs.length; i += 5) {
    const results = await Promise.allSettled(docs.slice(i, i + 5).map(refreshOne));
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) updated++;
      if (r.status === 'rejected') {
        // Bad keys fail every request: stop at once and say so
        if (String((r.reason as Error)?.message).includes('API key')) throw r.reason;
        logger.warn({ err: r.reason }, '[mail] Mailjet status refresh failed for one email');
      }
    }
  }
  return { checked: docs.length, updated };
}
