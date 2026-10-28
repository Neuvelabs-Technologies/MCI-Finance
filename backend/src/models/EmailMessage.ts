import { Schema, model, type HydratedDocument, type Types } from 'mongoose';

/** Every email the system sends, one record per recipient, with its delivery status. */

export const MAIL_KINDS = ['invite', 'reminder', 'confirmation', 'notification', 'test'] as const;
export type MailKind = (typeof MAIL_KINDS)[number];

export const MAIL_STATUSES = [
  'queued', // handed to Mailjet, no news yet
  'delivered', // accepted by the recipient's mail server (Mailjet "sent")
  'opened',
  'clicked',
  'unsubscribed',
  'spam', // the recipient marked it as spam
  'bounced',
  'blocked', // Mailjet refused to deliver it
  'failed', // the provider rejected it when we sent it
  'accepted', // sent by SMTP: accepted by the mail server, no delivery tracking
  'not_sent', // no email provider configured: written to the log only
] as const;
export type MailStatus = (typeof MAIL_STATUSES)[number];

/** Statuses that need someone to look at them. */
export const PROBLEM_STATUSES: MailStatus[] = ['bounced', 'blocked', 'spam', 'failed'];

export interface MailEvent {
  at: Date;
  type: string;
  detail?: string;
}

export interface IEmailMessage {
  at: Date;
  kind: MailKind;
  customer?: Types.ObjectId;
  to: string;
  subject: string;
  provider: 'mailjet' | 'smtp' | 'none';
  status: MailStatus;
  statusAt: Date;
  /** Why it failed / bounced / was blocked. */
  detail?: string;
  /** Sent to Mailjet as CustomID; shared by all recipients of one email. */
  batchId: string;
  /** Mailjet's MessageUUID (matches Message_GUID in webhook events). */
  messageUuid?: string;
  /** Mailjet's MessageID, kept as a string: it is larger than JavaScript numbers can hold exactly. */
  messageId?: string;
  events: MailEvent[];
  demo?: boolean;
}

export type EmailMessageDoc = HydratedDocument<IEmailMessage>;

const EmailMessageSchema = new Schema<IEmailMessage>(
  {
    at: { type: Date, default: Date.now, index: true },
    kind: { type: String, enum: MAIL_KINDS, required: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
    to: { type: String, required: true, lowercase: true, trim: true },
    subject: String,
    provider: { type: String, enum: ['mailjet', 'smtp', 'none'], required: true },
    status: { type: String, enum: MAIL_STATUSES, default: 'queued', index: true },
    statusAt: { type: Date, default: Date.now },
    detail: String,
    batchId: { type: String, required: true, index: true },
    messageUuid: { type: String, index: true, sparse: true },
    messageId: String,
    events: [{ _id: false, at: Date, type: { type: String }, detail: String }],
    demo: { type: Boolean, default: false, index: true },
  },
  { versionKey: false }
);

export const EmailMessage = model<IEmailMessage>('EmailMessage', EmailMessageSchema);
