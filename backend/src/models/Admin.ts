import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import { config } from '../config/env.js';

export interface IAdmin {
  email: string;
  name?: string;
  passwordHash: string;
  /** Entra object id (oid), set on first Microsoft sign-in. */
  microsoftId?: string;
  lastLoginAt?: Date;
  /** Bumped on password change; sessions signed with an older value stop working. */
  sessionVersion: number;
  /** Given the Tally dashboard by an admin in Settings → Users (TALLY_USERS, if set, always have it). */
  tallyAccess?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SafeAdmin {
  id: Types.ObjectId;
  email: string;
  name?: string;
  microsoft: boolean;
  /** Can open the Tally dashboard. */
  tally: boolean;
  /** Access comes from the TALLY_USERS server setting, so it can't be taken away in the app. */
  tallyFixed: boolean;
  lastLoginAt?: Date;
  createdAt?: Date;
}

interface AdminMethods {
  toSafe(): SafeAdmin;
  hasTallyAccess(): boolean;
}

type AdminModel = Model<IAdmin, object, AdminMethods>;
export type AdminDoc = HydratedDocument<IAdmin, AdminMethods>;

const AdminSchema = new Schema<IAdmin, AdminModel, AdminMethods>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, trim: true },
    passwordHash: { type: String, required: true },
    microsoftId: { type: String, unique: true, sparse: true },
    lastLoginAt: Date,
    sessionVersion: { type: Number, default: 0 },
    tallyAccess: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const tallyFixed = (email: string): boolean => config.tally.users.includes(email.toLowerCase());

AdminSchema.method('hasTallyAccess', function hasTallyAccess(this: AdminDoc): boolean {
  return tallyFixed(this.email) || !!this.tallyAccess;
});

AdminSchema.method('toSafe', function toSafe(this: AdminDoc): SafeAdmin {
  return {
    id: this._id,
    email: this.email,
    name: this.name,
    microsoft: !!this.microsoftId,
    tally: this.hasTallyAccess(),
    tallyFixed: tallyFixed(this.email),
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
  };
});

export const Admin = model<IAdmin, AdminModel>('Admin', AdminSchema);
