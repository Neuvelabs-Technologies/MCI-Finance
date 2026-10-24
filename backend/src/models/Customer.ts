import { Schema, model, type HydratedDocument, type Types } from 'mongoose';
import type { BuyerData, FileField } from '../utils/rules.js';

export const CUSTOMER_STATUSES = ['new', 'invited', 'opened', 'submitted'] as const;
export const REVIEW_STATUSES = ['pending', 'verified', 'needs_correction'] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export interface StoredFile {
  originalName: string;
  storedName: string;
  size: number;
  mime: string;
  uploadedAt: Date;
}

export interface FileHistoryEntry extends StoredFile {
  field: FileField;
}

export interface EmailLogEntry {
  at: Date;
  kind: 'invite' | 'reminder';
  to: string[];
  ok: boolean;
  error?: string;
}

/** Buyer data as stored: same as the form, but entity ids are ObjectIds and the expiry is a Date. */
export type StoredBuyerData = Partial<Omit<BuyerData, 'entities' | 'tradeLicenceExpiry'>> & {
  entities?: Types.ObjectId[] | string[];
  tradeLicenceExpiry?: Date;
};

export interface ICustomer {
  code: string;
  name: string;
  emails: string[];
  contactName?: string;
  notes?: string;
  token?: string | null;
  tokenExpiresAt?: Date;
  status: CustomerStatus;
  reviewStatus: ReviewStatus;
  reviewNote?: string;
  invitedAt?: Date;
  lastReminderAt?: Date;
  reminderCount: number;
  openedAt?: Date;
  lastOpenedAt?: Date;
  submittedAt?: Date;
  submitCount: number;
  data: StoredBuyerData;
  files: Partial<Record<FileField, StoredFile>>;
  fileHistory: FileHistoryEntry[];
  emailLog: EmailLogEntry[];
  /** Sample record from the demo data set — never emailed, removable in one step. */
  demo?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CustomerDoc = HydratedDocument<ICustomer>;

const FileSchema = new Schema<StoredFile>(
  { originalName: String, storedName: String, size: Number, mime: String, uploadedAt: Date },
  { _id: false }
);

const DataSchema = new Schema(
  {
    entities: [{ type: Schema.Types.ObjectId, ref: 'Entity' }],
    // company
    companyName: String,
    country: String,
    legalIdType: String, // TL | EID | PAS | CD
    tradeLicenceNo: String,
    licenceIssuingAuthority: String,
    tradeLicenceExpiry: Date,
    emirate: String,
    freeZone: Boolean,
    // tax
    vatRegistered: Boolean,
    vatGroupMember: Boolean,
    trn: String,
    tin: String,
    peppolId: String,
    foreignTaxId: String,
    // contact
    email: String,
    invoiceEmail: String,
    phone: String,
    address: String,
    poBox: String,
    city: String,
    // bank
    bankName: String,
    bankBranch: String,
    bankAddress: String,
    iban: String,
    swift: String,
    bankContact: String,
    website: String,
    // declaration
    declarantName: String,
    declarantDesignation: String,
    declaration: Boolean,
  },
  { _id: false }
);

const CustomerSchema = new Schema<ICustomer>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    emails: [{ type: String, lowercase: true, trim: true }],
    contactName: { type: String, trim: true },
    notes: String,
    token: { type: String, unique: true, sparse: true, index: true },
    tokenExpiresAt: Date,
    status: { type: String, enum: CUSTOMER_STATUSES, default: 'new', index: true },
    reviewStatus: { type: String, enum: REVIEW_STATUSES, default: 'pending' },
    reviewNote: String,
    invitedAt: Date,
    lastReminderAt: Date,
    reminderCount: { type: Number, default: 0 },
    openedAt: Date,
    lastOpenedAt: Date,
    submittedAt: Date,
    submitCount: { type: Number, default: 0 },
    data: { type: DataSchema, default: () => ({}) },
    files: {
      tradeLicence: FileSchema,
      trnCertificate: FileSchema,
      tinCertificate: FileSchema,
      signatoryIds: FileSchema,
      moa: FileSchema,
      ubo: FileSchema,
    },
    fileHistory: [
      { field: String, originalName: String, storedName: String, size: Number, mime: String, uploadedAt: Date },
    ],
    emailLog: [{ at: Date, kind: String, to: [String], ok: Boolean, error: String }],
    demo: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

CustomerSchema.index({ name: 'text', code: 'text' });

export const Customer = model<ICustomer>('Customer', CustomerSchema);
