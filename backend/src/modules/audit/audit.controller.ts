import type { Request, Response } from 'express';
import type { QueryFilter } from 'mongoose';
import { AuditLog, type IAuditLog } from '../../models/AuditLog.js';
import { escapeRegex, isId, str } from '../../utils/http.js';

/** Action groups the Activity page can filter by (the part before the dot). */
const GROUPS = ['form', 'email', 'customer', 'review', 'entity', 'settings', 'admin', 'export', 'demo'];

export async function list(req: Request, res: Response) {
  const filter: QueryFilter<IAuditLog> = {};
  const customer = req.query.customer;
  if (isId(customer)) filter.customer = customer;
  const group = str(req.query.group);
  if (GROUPS.includes(group)) filter.action = new RegExp(`^${group}\\.`);
  const q = str(req.query.q).trim();
  if (q) {
    const re = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ actor: re }, { action: re }];
  }
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const [logs, total] = await Promise.all([
    AuditLog.find(filter).sort({ at: -1 }).skip((page - 1) * limit).limit(limit).populate('customer', 'code name'),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ logs, total, page, limit });
}
