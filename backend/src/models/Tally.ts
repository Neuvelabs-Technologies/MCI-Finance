import { Schema, model } from 'mongoose';

// Data copied from Tally by the connector (connector/tally-sync.ps1). Read-only copies: the app never
// writes back to Tally, and records are never deleted here — something removed in Tally is only
// flagged with deletedInTally, so reports can leave it out while the history stays.
//
// Amounts keep Tally's own sign: credit positive, debit negative.
// `source` names the Tally installation ("gold" = TallyPrime Gold); `company` is the Tally company name.

export interface ITallyLedger {
  source: string;
  company: string;
  guid: string;
  alterId: number;
  name: string;
  /** The group directly above the ledger. */
  parent: string;
  /** Tally's primary group (Sales Accounts, Sundry Debtors, Bank Accounts…). */
  group: string;
  opening: number;
  closing: number;
  deletedInTally: boolean;
  syncedAt: Date;
}

const TallyLedgerSchema = new Schema<ITallyLedger>(
  {
    source: { type: String, required: true },
    company: { type: String, required: true },
    guid: { type: String, required: true },
    alterId: { type: Number, default: 0 },
    name: { type: String, required: true },
    parent: { type: String, default: '' },
    group: { type: String, default: '' },
    opening: { type: Number, default: 0 },
    closing: { type: Number, default: 0 },
    deletedInTally: { type: Boolean, default: false },
    syncedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);
TallyLedgerSchema.index({ source: 1, company: 1, guid: 1 }, { unique: true });
TallyLedgerSchema.index({ source: 1, company: 1, group: 1 });

export interface ITallyEntry {
  ledger: string;
  /** Primary group of the ledger when the voucher was synced. */
  group: string;
  amount: number;
}

export interface ITallyVoucher {
  source: string;
  company: string;
  guid: string;
  alterId: number;
  date: Date;
  /** The voucher type as named in Tally, e.g. "Sales MCI". */
  voucherType: string;
  /** The built-in type it is based on: Sales, Purchase, Receipt, Payment, Journal, Contra, Credit Note, Debit Note… */
  baseType: string;
  number: string;
  reference: string;
  party: string;
  narration: string;
  /** Voucher total (sum of the credit side), always positive. */
  amount: number;
  cancelled: boolean;
  optional: boolean;
  entries: ITallyEntry[];
  deletedInTally: boolean;
  syncedAt: Date;
}

const TallyVoucherSchema = new Schema<ITallyVoucher>(
  {
    source: { type: String, required: true },
    company: { type: String, required: true },
    guid: { type: String, required: true },
    alterId: { type: Number, default: 0 },
    date: { type: Date, required: true },
    voucherType: { type: String, default: '' },
    baseType: { type: String, default: '' },
    number: { type: String, default: '' },
    reference: { type: String, default: '' },
    party: { type: String, default: '' },
    narration: { type: String, default: '' },
    amount: { type: Number, default: 0 },
    cancelled: { type: Boolean, default: false },
    optional: { type: Boolean, default: false },
    entries: [{ _id: false, ledger: String, group: String, amount: Number }],
    deletedInTally: { type: Boolean, default: false },
    syncedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);
TallyVoucherSchema.index({ source: 1, company: 1, guid: 1 }, { unique: true });
TallyVoucherSchema.index({ source: 1, company: 1, date: -1 });
TallyVoucherSchema.index({ source: 1, company: 1, baseType: 1, date: -1 });
TallyVoucherSchema.index({ source: 1, company: 1, alterId: -1 });

export interface ITallySync {
  at: Date;
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
  ip?: string;
}

const TallySyncSchema = new Schema<ITallySync>(
  {
    at: { type: Date, default: Date.now },
    source: { type: String, required: true },
    company: { type: String, required: true },
    ok: { type: Boolean, default: true },
    ledgers: { type: Number, default: 0 },
    vouchers: { type: Number, default: 0 },
    full: { type: Boolean, default: false },
    durationMs: { type: Number, default: 0 },
    error: String,
    connectorVersion: String,
    host: String,
    ip: String,
  },
  { versionKey: false }
);
TallySyncSchema.index({ source: 1, company: 1, at: -1 });
TallySyncSchema.index({ at: -1 });

export const TallyLedger = model<ITallyLedger>('TallyLedger', TallyLedgerSchema);
export const TallyVoucher = model<ITallyVoucher>('TallyVoucher', TallyVoucherSchema);
export const TallySync = model<ITallySync>('TallySync', TallySyncSchema);
