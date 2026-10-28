// Shapes of the JSON the backend returns. Dates arrive as ISO strings.
import type { BuyerData, FieldMessages, FileField } from '@/lib/rules';

export type CustomerStatus = 'new' | 'invited' | 'opened' | 'submitted';
export type ReviewStatus = 'pending' | 'verified' | 'needs_correction';
export type EmailKind = 'invite' | 'reminder';

// ---------- public form ----------

export interface PublicSettings {
  orgName: string;
  formTitle: string;
  formSubtitle: string;
  intro: string;
  dueDate?: string;
  contactName: string;
  contactEmail: string;
  accentColor: string;
  hasLogo: boolean;
  sections: { ownership: boolean; bank: boolean };
  maxFileMb: number;
}

export interface PublicEntity {
  id: string;
  key?: string;
  name: string;
  licensedBy?: string;
  licenceType?: string;
  issuingAuthority?: string;
  licenceNo?: string;
  tin?: string;
  trn?: string;
  peppolId?: string;
  address?: string;
  emirate?: string;
  freeZone?: boolean;
  contactName?: string;
  contactEmail?: string;
}

export interface FileOnRecord {
  originalName: string;
  size: number;
  uploadedAt: string;
}

export interface PublicFormResponse {
  settings: PublicSettings;
  entities: PublicEntity[];
  customer: {
    code: string;
    name: string;
    status: CustomerStatus;
    submittedAt?: string;
    reviewStatus: ReviewStatus;
    reviewNote?: string;
    data: Partial<BuyerData>;
    files: Partial<Record<FileField, FileOnRecord>>;
  };
}

/** Error body when a form link is unknown or expired. */
export interface FormLinkError {
  error: 'expired' | 'invalid';
  settings?: PublicSettings;
}

export interface SubmitErrorBody {
  error?: string;
  errors?: FieldMessages;
}

// ---------- admin ----------

export interface AdminUser {
  id: string;
  email: string;
  name?: string;
  lastLoginAt?: string;
  createdAt?: string;
}

export interface MeResponse {
  admin: AdminUser;
  smtpConfigured: boolean;
  publicBaseUrl: string;
  version: string;
  demo: DemoStatus;
}

export interface DemoStatus {
  /** Sample customers currently loaded. */
  count?: number;
  customers?: number;
  /** Whether this server lets admins load demo data. */
  allowed: boolean;
}

export interface EmailLogEntry {
  at: string;
  kind: EmailKind;
  to: string[];
  ok: boolean;
  error?: string;
}

export interface StoredFile extends FileOnRecord {
  storedName: string;
  mime: string;
}

export interface FileHistoryEntry extends StoredFile {
  field: FileField;
}

export interface CustomerSummary {
  id: string;
  code: string;
  name: string;
  emails: string[];
  contactName?: string;
  notes?: string;
  status: CustomerStatus;
  reviewStatus: ReviewStatus;
  invitedAt?: string;
  reminderCount: number;
  lastReminderAt?: string;
  openedAt?: string;
  submittedAt?: string;
  submitCount: number;
  tokenExpiresAt?: string;
  companyName?: string;
  trn?: string;
  tin?: string;
  peppolId?: string;
  lastEmail: EmailLogEntry | null;
  demo?: boolean;
}

export interface CustomerDetail extends CustomerSummary {
  reviewNote?: string;
  lastOpenedAt?: string;
  data: Partial<BuyerData>;
  files: Partial<Record<FileField, StoredFile>>;
  fileHistory: FileHistoryEntry[];
  emailLog: EmailLogEntry[];
  link: string | null;
  createdAt: string;
}

export interface AuditLog {
  _id: string;
  at: string;
  actor?: string;
  action: string;
  customer?: { _id: string; code: string; name: string } | string | null;
  details?: {
    changed?: string[];
    filesReplaced?: string[];
    [key: string]: unknown;
  };
}

export interface CustomerList {
  items: CustomerSummary[];
  total: number;
  page: number;
  limit: number;
}

export type MailKind = 'invite' | 'reminder' | 'confirmation' | 'notification' | 'test';
export type MailStatus =
  | 'queued'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'unsubscribed'
  | 'spam'
  | 'bounced'
  | 'blocked'
  | 'failed'
  | 'accepted'
  | 'not_sent';

export interface EmailMessage {
  _id: string;
  at: string;
  kind: MailKind;
  customer?: { _id: string; code: string; name: string } | string | null;
  to: string;
  subject: string;
  provider: 'mailjet' | 'smtp' | 'none';
  status: MailStatus;
  statusAt: string;
  detail?: string;
  events: { at: string; type: string; detail?: string }[];
  demo?: boolean;
}

export interface EmailList {
  emails: EmailMessage[];
  total: number;
  page: number;
  limit: number;
  /** Count of all emails by status (not filtered). */
  summary: Partial<Record<MailStatus, number>>;
  provider: 'mailjet' | 'smtp' | 'none';
}

export interface AuditList {
  logs: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

export interface Overview extends CustomerStats {
  daysLeft: number | null;
  funnel: { total: number; invited: number; opened: number; submitted: number; verified: number };
  attention: { toReview: number; corrections: number; emailFailures: number; expiredLinks: number; noEmail: number };
  toReview: CustomerSummary[];
  recentSubmissions: CustomerSummary[];
  activity: AuditLog[];
  setup: { smtp: boolean; dueDate: boolean; contactEmail: boolean; entities: boolean; customers: boolean; invitesSent: boolean };
}

export interface SystemInfo {
  version: string;
  environment: 'production' | 'development';
  node: string;
  uptimeSeconds: number;
  database: 'connected' | 'disconnected';
  inMemoryDatabase: boolean;
  smtpConfigured: boolean;
  mailProvider: 'mailjet' | 'smtp' | 'none';
  /** Mailjet reports delivery events to this server. */
  deliveryWebhook: boolean;
  publicBaseUrl: string;
  cookieSecure: boolean;
  maxFileMb: number;
  notifyEmails: string[];
  demo: { customers: number; allowed: boolean };
}

export interface CustomerStats {
  total: number;
  status: Partial<Record<CustomerStatus, number>>;
  review: Partial<Record<ReviewStatus, number>>;
  dueDate?: string;
  smtpConfigured: boolean;
  entityCount: number;
}

export interface SendResult {
  id: string;
  code: string;
  ok: boolean;
  error?: string;
}

export interface ImportResult {
  created: number;
  updated: number;
  errors: { row: number; reason: string }[];
}

export interface Entity {
  _id?: string;
  demo?: boolean;
  key: string;
  name: string;
  licensedBy: string;
  licenceType: string;
  issuingAuthority: string;
  licenceNo: string;
  tin: string;
  trn: string;
  peppolId: string;
  address: string;
  emirate: string;
  freeZone: boolean;
  contactName: string;
  contactEmail: string;
  sortOrder: number;
  active: boolean;
}

export interface EmailTemplates {
  inviteSubject: string;
  inviteBody: string;
  reminderSubject: string;
  reminderBody: string;
  sendConfirmation: boolean;
}

export interface AppSettings {
  orgName: string;
  formTitle: string;
  formSubtitle: string;
  intro: string;
  dueDate?: string;
  contactName: string;
  contactEmail: string;
  accentColor: string;
  logo?: { storedName?: string; mime?: string };
  sections: { ownership: boolean; bank: boolean };
  linkValidityDays: number;
  autoReminderDays: string;
  email: EmailTemplates;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}
