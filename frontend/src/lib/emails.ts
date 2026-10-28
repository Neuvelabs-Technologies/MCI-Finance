import type { BadgeVariant } from '@/components/ui/badge';
import type { MailKind, MailStatus } from '@/types';

export const MAIL_STATUS_LABEL: Record<MailStatus, string> = {
  queued: 'Waiting',
  delivered: 'Delivered',
  opened: 'Opened',
  clicked: 'Clicked',
  unsubscribed: 'Unsubscribed',
  spam: 'Marked as spam',
  bounced: 'Bounced',
  blocked: 'Blocked',
  failed: 'Failed',
  accepted: 'Sent (no tracking)',
  not_sent: 'Not sent (log only)',
};

export const MAIL_STATUS_TONE: Record<MailStatus, BadgeVariant> = {
  queued: 'neutral',
  delivered: 'info',
  opened: 'success',
  clicked: 'success',
  unsubscribed: 'warning',
  spam: 'danger',
  bounced: 'danger',
  blocked: 'danger',
  failed: 'danger',
  accepted: 'info',
  not_sent: 'warning',
};

/** What each status means, for tooltips and the guide. */
export const MAIL_STATUS_HELP: Record<MailStatus, string> = {
  queued: 'Mailjet has the email and is sending it.',
  delivered: 'The recipient’s mail server accepted it. It is in their mailbox (or spam folder).',
  opened: 'The recipient opened it. Some mail apps hide opens, so “Delivered” may also have been read.',
  clicked: 'The recipient clicked a link in it.',
  unsubscribed: 'The recipient unsubscribed.',
  spam: 'The recipient marked it as spam.',
  bounced: 'The recipient’s mail server refused it, e.g. the address doesn’t exist or the mailbox is full.',
  blocked: 'Mailjet refused to send it, e.g. the address bounced before or was reported as spam.',
  failed: 'Mailjet rejected it when it was sent (e.g. sender not verified).',
  accepted: 'Sent through SMTP. Delivery can’t be tracked.',
  not_sent: 'Email sending isn’t set up, so it was only written to the server log.',
};

export const MAIL_KIND_LABEL: Record<MailKind, string> = {
  invite: 'Invite',
  reminder: 'Reminder',
  confirmation: 'Confirmation',
  notification: 'Submission alert',
  test: 'Test',
};

export const MAIL_KIND_OPTIONS = (Object.keys(MAIL_KIND_LABEL) as MailKind[]).map((value) => ({ value, label: MAIL_KIND_LABEL[value] }));

export const MAIL_STATUS_OPTIONS = [
  { value: 'problem', label: 'Problems (bounced, blocked, spam, failed)' },
  { value: 'delivered', label: 'Delivered or opened' },
  { value: 'waiting', label: 'Waiting' },
  ...(['opened', 'bounced', 'blocked', 'spam', 'failed', 'unsubscribed', 'accepted', 'not_sent'] as MailStatus[]).map((value) => ({
    value,
    label: MAIL_STATUS_LABEL[value],
  })),
];

/** Event names as Mailjet reports them, in words. */
export const EVENT_LABEL: Record<string, string> = {
  sent: 'Delivered to the recipient’s server',
  open: 'Opened',
  click: 'Link clicked',
  bounce: 'Bounced',
  blocked: 'Blocked by Mailjet',
  spam: 'Marked as spam',
  unsub: 'Unsubscribed',
  failed: 'Rejected when sending',
};

export const eventLabel = (type: string): string => {
  if (type.startsWith('refresh:')) {
    const s = type.slice(8);
    return `${EVENT_LABEL[s === 'opened' ? 'open' : s === 'clicked' ? 'click' : s] ?? (/bounce/.test(s) ? 'Bounced' : s)} (from refresh)`;
  }
  return EVENT_LABEL[type] ?? type;
};
