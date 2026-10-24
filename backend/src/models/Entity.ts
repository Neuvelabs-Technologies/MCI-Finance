import { Schema, model, type HydratedDocument } from 'mongoose';

// One of the organisation's own legal entities (the supplier side shown to customers).
export interface IEntity {
  key?: string; // short label, e.g. "LLC"
  name: string;
  licensedBy?: string; // shown under the name, e.g. "Licensed by Dubai DET"
  licenceType?: string;
  issuingAuthority?: string;
  licenceNo?: string;
  tin?: string;
  trn?: string;
  peppolId?: string;
  address?: string;
  emirate?: string;
  freeZone: boolean;
  contactName?: string;
  contactEmail?: string;
  sortOrder: number;
  active: boolean;
  /** Sample entity from the demo data set. */
  demo?: boolean;
}

export type EntityDoc = HydratedDocument<IEntity>;

export const ENTITY_FIELDS = [
  'key', 'name', 'licensedBy', 'licenceType', 'issuingAuthority', 'licenceNo', 'tin', 'trn',
  'peppolId', 'address', 'emirate', 'freeZone', 'contactName', 'contactEmail', 'sortOrder', 'active',
] as const satisfies readonly (keyof IEntity)[];

const EntitySchema = new Schema<IEntity>(
  {
    key: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    licensedBy: { type: String, trim: true },
    licenceType: { type: String, trim: true, default: 'Trade licence' },
    issuingAuthority: { type: String, trim: true },
    licenceNo: { type: String, trim: true },
    tin: { type: String, trim: true },
    trn: { type: String, trim: true },
    peppolId: { type: String, trim: true },
    address: { type: String, trim: true },
    emirate: { type: String, trim: true },
    freeZone: { type: Boolean, default: false },
    contactName: { type: String, trim: true },
    contactEmail: { type: String, trim: true },
    sortOrder: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    demo: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Entity = model<IEntity>('Entity', EntitySchema);
