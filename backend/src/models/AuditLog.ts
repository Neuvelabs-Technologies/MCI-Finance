import { Schema, model, type Types } from 'mongoose';

export interface IAuditLog {
  at: Date;
  actor?: string; // admin email, "customer:<code>" or "system"
  action: string;
  customer?: Types.ObjectId;
  ip?: string;
  details?: Record<string, unknown>;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    at: { type: Date, default: Date.now, index: true },
    actor: String,
    action: String,
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
    ip: String,
    details: Schema.Types.Mixed,
  },
  { versionKey: false }
);

export const AuditLog = model<IAuditLog>('AuditLog', AuditLogSchema);
