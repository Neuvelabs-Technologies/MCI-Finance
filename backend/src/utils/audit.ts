import type { Request } from 'express';
import type { Types } from 'mongoose';
import { AuditLog } from '../models/AuditLog.js';
import { logger } from './logger.js';

interface AuditOptions {
  customer?: Types.ObjectId;
  details?: Record<string, unknown>;
  actor?: string;
}

/** Record an action in the audit trail. Never throws. */
export async function audit(req: Request | null, action: string, { customer, details, actor }: AuditOptions = {}): Promise<void> {
  try {
    await AuditLog.create({
      actor: actor ?? req?.admin?.email ?? 'system',
      action,
      customer,
      ip: req?.ip,
      details,
    });
  } catch (e) {
    logger.error({ err: e, action }, '[audit] failed to record');
  }
}
