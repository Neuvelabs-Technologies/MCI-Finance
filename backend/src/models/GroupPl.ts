import { Schema, model } from 'mongoose';

// Group P&L (MCI Group's management P&L, actual from Tally vs forecast). See modules/grouppl/chart.ts.

/** How one Tally company's books fill the Group P&L. One record per Tally source + company. */
export interface IGroupPlSetup {
  source: string;
  company: string;
  /** Tally ledger or group → group account code. A ledger's own mapping wins over its groups'. */
  accounts: { kind: 'ledger' | 'group'; name: string; account: string }[];
  /** Tally cost centre (an MCI project) → service line. */
  projects: { costCentre: string; serviceLine: string }[];
  /** Account code → treatment, only where it differs from the chart's default. */
  treatments: { account: string; treatment: string }[];
  /** From the HR payroll report, per year and service line. */
  hr: { year: number; serviceLine: string; fte: number; headcount: number; sqm: number }[];
  updatedAt?: Date;
  updatedBy?: string;
}

const GroupPlSetupSchema = new Schema<IGroupPlSetup>(
  {
    source: { type: String, required: true },
    company: { type: String, required: true },
    accounts: { type: [{ _id: false, kind: String, name: String, account: String }], default: [] },
    projects: { type: [{ _id: false, costCentre: String, serviceLine: String }], default: [] },
    treatments: { type: [{ _id: false, account: String, treatment: String }], default: [] },
    hr: { type: [{ _id: false, year: Number, serviceLine: String, fte: Number, headcount: Number, sqm: Number }], default: [] },
    updatedAt: Date,
    updatedBy: String,
  },
  { versionKey: false }
);
GroupPlSetupSchema.index({ source: 1, company: 1 }, { unique: true });

/** One uploaded forecast export. The newest for a year is the one shown; older ones are kept. */
export interface IGroupPlForecast {
  source: string;
  company: string;
  year: number;
  /** E.g. "Forecast11" and "Current Forecast", as the file names them. */
  label: string;
  version: string;
  entity: string;
  fileName: string;
  /** One per account code: the 11 column values in COLUMNS order (null where the file has none). */
  rows: { code: string; values: (number | null)[] }[];
  uploadedAt: Date;
  uploadedBy: string;
}

const GroupPlForecastSchema = new Schema<IGroupPlForecast>(
  {
    source: { type: String, required: true },
    company: { type: String, required: true },
    year: { type: Number, required: true },
    label: { type: String, default: '' },
    version: { type: String, default: '' },
    entity: { type: String, default: '' },
    fileName: { type: String, default: '' },
    rows: { type: [{ _id: false, code: String, values: [Schema.Types.Mixed] }], default: [] },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: String, default: '' },
  },
  { versionKey: false }
);
GroupPlForecastSchema.index({ source: 1, company: 1, year: 1, uploadedAt: -1 });

export const GroupPlSetup = model<IGroupPlSetup>('GroupPlSetup', GroupPlSetupSchema);
export const GroupPlForecast = model<IGroupPlForecast>('GroupPlForecast', GroupPlForecastSchema);
