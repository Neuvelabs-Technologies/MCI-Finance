import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export interface IAdmin {
  email: string;
  name?: string;
  passwordHash: string;
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
    lastLoginAt: Date,
    sessionVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

AdminSchema.method('toSafe', function toSafe(this: AdminDoc): SafeAdmin {
  return { id: this._id, email: this.email, name: this.name, lastLoginAt: this.lastLoginAt, createdAt: this.createdAt };
});

export const Admin = model<IAdmin, AdminModel>('Admin', AdminSchema);
