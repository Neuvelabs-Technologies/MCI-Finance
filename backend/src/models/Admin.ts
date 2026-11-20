import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export interface IAdmin {
  email: string;
  name?: string;
  passwordHash: string;
  /** Entra object id (oid), set on first Microsoft sign-in. */
  microsoftId?: string;
  lastLoginAt?: Date;
  /** Bumped on password change; sessions signed with an older value stop working. */
  sessionVersion: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SafeAdmin {
  id: Types.ObjectId;
  email: string;
  name?: string;
  microsoft: boolean;
  lastLoginAt?: Date;
  createdAt?: Date;
}

interface AdminMethods {
  toSafe(): SafeAdmin;
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
  },
  { timestamps: true }
);

AdminSchema.method('toSafe', function toSafe(this: AdminDoc): SafeAdmin {
  return { id: this._id, email: this.email, name: this.name, microsoft: !!this.microsoftId, lastLoginAt: this.lastLoginAt, createdAt: this.createdAt };
});

export const Admin = model<IAdmin, AdminModel>('Admin', AdminSchema);
