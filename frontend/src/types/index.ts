// Shapes of the JSON the backend returns. Dates arrive as ISO strings.
import type { BuyerData, FieldMessages, FileField } from '@/lib/rules';

export type CustomerStatus = 'new' | 'invited' | 'opened' | 'submitted';
export type ReviewStatus = 'pending' | 'verified' | 'needs_correction';
export type EmailKind = 'invite' | 'reminder';
/** Customers (MCI bills them) and vendors (they bill MCI) fill the same form. */
export type PartyType = 'customer' | 'vendor';

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
    type: PartyType;
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
  /** Has signed in with Microsoft at least once. */
  microsoft?: boolean;
  /** Can open the Tally dashboard. */
  tally?: boolean;
  /** Tally access comes from the TALLY_USERS server setting (can't be removed in the app). */
  tallyFixed?: boolean;
  lastLoginAt?: string;
  createdAt?: string;
}

// ---------- Tally (data pushed by the connector on MCI's Tally server) ----------

export interface TallySyncLog {
  _id: string;
  at: string;
  source: string;
  company: string;
  ok: boolean;
  ledgers: number;
  vouchers: number;
  full: boolean;
  durationMs: number;
  error?: string;
  connectorVersion?: string;
  host?: string;
}

export interface TallyCompany {
  source: string;
  company: string;
  lastSync: TallySyncLog | null;
  vouchers: number;
  firstDate: string | null;
  latestDate: string | null;
}

export interface TallyAmountRow {
  name: string;
  group: string;
  amount: number;
}

export interface TallySummary {
  source: string;
  company: string;
  period: { from: string | null; to: string | null };
  kpis: { income: number; expenses: number; net: number; receivables: number; payables: number; cash: number };
  monthly: { month: string; income: number; expenses: number }[];
  topCustomers: { party: string; amount: number; count: number }[];
  byType: { type: string; amount: number; count: number }[];
  receivables: TallyAmountRow[];
  payables: TallyAmountRow[];
  cash: TallyAmountRow[];
  syncs: TallySyncLog[];
  voucherCount: number;
}

export interface TallyVoucher {
  _id: string;
  guid: string;
  date: string;
  voucherType: string;
  baseType: string;
  number: string;
  reference: string;
  party: string;
  narration: string;
  amount: number;
  cancelled: boolean;
  optional: boolean;
  entries: { ledger: string; group: string; amount: number }[];
}

export interface TallyLedger {
  _id: string;
  guid: string;
  name: string;
  parent: string;
  group: string;
  opening: number;
  closing: number;
}

export type TallyConnectorState = 'synced' | 'syncing' | 'idle' | 'no_company' | 'tally_not_running' | 'tally_not_responding' | 'wrong_tally' | 'error';

/** What the connector on the Tally server last reported (it checks in every few minutes). */
export interface TallyConnectorStatus {
  source: string;
  lastSeenAt: string;
  status: TallyConnectorState;
  message?: string;
  companies: string[];
  tally: { product?: string; user?: string; port?: number };
  host?: string;
  connectorVersion?: string;
  checkMinutes?: number;
  syncMinutes?: number;
  lastSyncAt?: string;
  syncRequestedAt?: string | null;
  syncRequestedBy?: string | null;
}

export interface TallyReport {
  source: string;
  company: string;
  period: { from: string | null; to: string | null };
  pnl: { group: string; kind: 'income' | 'expense'; total: number; ledgers: { name: string; amount: number }[] }[];
  customers: { party: string; amount: number; count: number; last: string }[];
}

export interface TallyPage<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/** Which sign-in methods this server offers. */
export interface SignInOptions {
  microsoft: boolean;
  password: boolean;
}

export interface MeResponse {
  admin: AdminUser;
  smtpConfigured: boolean;
  publicBaseUrl: string;
  version: string;
  signIn: SignInOptions;
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
  kind: EmailKind | 'correction';
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
  type: PartyType;
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
  customer?: { _id: string; code: string; name: string; type?: PartyType } | string | null;
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

export type MailKind = 'invite' | 'reminder' | 'correction' | 'confirmation' | 'notification' | 'test';
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
  customer?: { _id: string; code: string; name: string; type?: PartyType } | string | null;
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
  /** Number of customers and vendors (all of them, whatever type was asked for). */
  types?: Record<PartyType, number>;
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

/** The editable invite/reminder texts (one set for customers, one for vendors). */
export interface TemplateTexts {
  inviteSubject: string;
  inviteBody: string;
  reminderSubject: string;
  reminderBody: string;
}

export interface EmailTemplates extends TemplateTexts {
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
  vendorEmail: TemplateTexts;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

// ---------------- Group P&L (Tally actual vs forecast) ----------------

export type GroupPlRowKind = 'leaf' | 'total' | 'forecastOnly' | 'stat' | 'ratio';
export type GroupPlRowStyle = '' | 'highlighted' | 'subtotal' | 'total';
export interface GroupPlValues {
  code: string;
  values: (number | null)[];
}
export interface GroupPlReport {
  source: string;
  company: string;
  year: number;
  month: number;
  periodLabel: string;
  columns: { key: string; label: string }[];
  chart: { code: string; name: string; style: GroupPlRowStyle; kind: GroupPlRowKind }[];
  actual: {
    rows: GroupPlValues[];
    detail: Record<string, { ledger: string; amount: number }[]>;
    warnings: {
      unmapped: { ledger: string; group: string; amount: number }[];
      unassignedProjects: { costCentre: string; amount: number }[];
      noProject: number;
      missingBasis: string[];
    };
  };
  forecast: { id: string; label: string; version: string; entity: string; fileName: string; uploadedAt: string; uploadedBy: string; rows: GroupPlValues[] } | null;
  forecasts: { id: string; label: string; fileName: string; uploadedAt: string; uploadedBy: string }[];
  setupStatus: { accounts: number; projects: number; hrYear: boolean };
}

export interface GroupPlSetupData {
  accounts: { kind: 'ledger' | 'group'; name: string; account: string }[];
  projects: { costCentre: string; serviceLine: string }[];
  treatments: { account: string; treatment: string }[];
  hr: { year: number; serviceLine: string; fte: number; headcount: number; sqm: number }[];
}
export interface GroupPlSetupResponse {
  source: string;
  company: string;
  year: number;
  setup: GroupPlSetupData;
  accounts: { code: string; name: string; treatment: string; income: boolean }[];
  treatments: string[];
  serviceLines: string[];
  ledgers: { name: string; parent: string; group: string; groups: string[]; amount: number; suggested: string | null }[];
  groups: { name: string; above: string[] }[];
  costCentres: { name: string; amount: number; lines: number; last: string }[];
}
