import path from 'node:path';
import type { Request, Response } from 'express';
import { AuditLog } from '../../models/AuditLog.js';
import { Customer, type CustomerDoc, type StoredFile } from '../../models/Customer.js';
import { Entity } from '../../models/Entity.js';
import { Settings } from '../../models/Settings.js';
import { buildExport, buildImportTemplate } from '../../services/excel.service.js';
import { mailConfigured } from '../../services/mailer.service.js';
import { UNKNOWN_TYPE, VIEWABLE_TYPES, customerFilePath, deleteCustomerFiles } from '../../services/storage.service.js';
import { badRequest, notFound } from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { XLSX_MIME, allEmailsValid, isId, parseEmails, str } from '../../utils/http.js';
import { FILE_FIELDS, isFileField } from '../../utils/rules.js';
import { formLink, issueToken } from '../../utils/token.js';
import * as service from './customers.service.js';

/** Sortable list columns → database field. */
const SORT_FIELDS: Record<string, string> = {
  code: 'code',
  name: 'name',
  status: 'status',
  submitted: 'submittedAt',
  updated: 'updatedAt',
};

async function findOr404(id: unknown): Promise<CustomerDoc> {
  if (!isId(id)) throw notFound();
  const c = await Customer.findById(id);
  if (!c) throw notFound();
  return c;
}

const listQuery = (req: Request): service.ListQuery => ({
  status: str(req.query.status) || undefined,
  review: str(req.query.review) || undefined,
  q: str(req.query.q) || undefined,
  issue: str(req.query.issue) || undefined,
  demo: str(req.query.demo) || undefined,
});

export async function stats(_req: Request, res: Response) {
  res.json(await service.getStats());
}

export async function overview(_req: Request, res: Response) {
  res.json(await service.getOverview());
}

export async function list(req: Request, res: Response) {
  const filter = service.buildFilter(listQuery(req));
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const field = SORT_FIELDS[str(req.query.sort)] ?? 'code';
  const dir = str(req.query.dir) === 'desc' ? -1 : 1;
  const sort: Record<string, 1 | -1> = { [field]: dir, _id: 1 };
  const [items, total] = await Promise.all([
    Customer.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
    Customer.countDocuments(filter),
  ]);
  res.json({ items: items.map(service.toSummary), total, page, limit });
}

export async function create(req: Request, res: Response) {
  const code = str(req.body?.code).trim();
  const name = str(req.body?.name).trim();
  if (!code || !name) throw badRequest('Code and company name are required');
  const emails = parseEmails(req.body?.emails);
  if (!allEmailsValid(emails)) throw badRequest('One or more email addresses are invalid');
  if (await Customer.exists({ code: code.toUpperCase() })) throw badRequest('A customer with this code already exists');
  const s = await Settings.get();
  const c = new Customer({ code, name, emails, contactName: req.body?.contactName, notes: req.body?.notes });
  issueToken(c, s.linkValidityDays);
  await c.save();
  await audit(req, 'customer.created', { customer: c._id, details: { code: c.code } });
  res.status(201).json({ customer: service.toSummary(c) });
}

export async function importTemplate(_req: Request, res: Response) {
  res.attachment('customer-import-template.xlsx');
  res.type(XLSX_MIME);
  res.send(await buildImportTemplate());
}

export async function importList(req: Request, res: Response) {
  if (!req.file) throw badRequest('Choose a CSV or Excel file');
  if (!/\.(csv|xlsx)$/i.test(req.file.originalname)) throw badRequest('Only .csv or .xlsx files are supported');
  const result = await service.importCustomers(req.file.buffer, req.file.originalname);
  await audit(req, 'customer.imported', {
    details: { file: req.file.originalname, created: result.created, updated: result.updated, errors: result.errors.length },
  });
  res.json(result);
}

export async function send(req: Request, res: Response) {
  const kind = req.body?.kind === 'reminder' ? 'reminder' : 'invite';
  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).filter(isId) : [];
  const allPending = !!req.body?.allPending;
  if (!allPending && !ids.length) throw badRequest('No customers selected');
  const results = await service.sendEmails(kind, ids, allPending);
  if (!results.length) throw badRequest('No customers selected');
  await audit(req, `email.${kind}`, { details: { count: results.length, failed: results.filter((r) => !r.ok).length } });
  res.json({ results, smtpConfigured: mailConfigured() });
}

/** For when finance sends the link manually (e.g. from Outlook) instead of via the system. */
export async function markSent(req: Request, res: Response) {
  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).filter(isId) : [];
  await Customer.updateMany({ _id: { $in: ids }, status: 'new' }, { $set: { status: 'invited', invitedAt: new Date() } });
  res.json({ ok: true });
}

export async function getOne(req: Request, res: Response) {
  const c = await findOr404(req.params.id);
  const logs = await AuditLog.find({ customer: c._id }).sort({ at: -1 }).limit(100);
  const files: Partial<Record<string, StoredFile>> = {};
  for (const f of FILE_FIELDS) if (c.files?.[f]?.storedName) files[f] = c.files[f];
  res.json({
    customer: {
      ...service.toSummary(c),
      notes: c.notes,
      reviewNote: c.reviewNote,
      lastOpenedAt: c.lastOpenedAt,
      data: c.data,
      files,
      fileHistory: c.fileHistory,
      emailLog: [...(c.emailLog ?? [])].reverse(),
      link: c.token ? formLink(c.token) : null,
      createdAt: c.createdAt,
    },
    logs,
  });
}

export async function update(req: Request, res: Response) {
  const c = await findOr404(req.params.id);
  const { code, name, emails, contactName, notes } = (req.body ?? {}) as Record<string, unknown>;
  if (code !== undefined) {
    const nc = str(code).trim().toUpperCase();
    if (!nc) throw badRequest('Code is required');
    if (nc !== c.code && (await Customer.exists({ code: nc }))) throw badRequest('Another customer already uses this code');
    c.code = nc;
  }
  if (name !== undefined) {
    if (!str(name).trim()) throw badRequest('Company name is required');
    c.name = str(name);
  }
  if (emails !== undefined) {
    const list = parseEmails(emails);
    if (!allEmailsValid(list)) throw badRequest('One or more email addresses are invalid');
    c.emails = list;
  }
  if (contactName !== undefined) c.contactName = str(contactName);
  if (notes !== undefined) c.notes = str(notes);
  await c.save();
  await audit(req, 'customer.updated', { customer: c._id });
  res.json({ customer: service.toSummary(c) });
}

export async function remove(req: Request, res: Response) {
  if (!isId(req.params.id)) throw notFound();
  const c = await Customer.findByIdAndDelete(req.params.id);
  if (!c) throw notFound();
  deleteCustomerFiles(c._id);
  await audit(req, 'customer.deleted', { details: { code: c.code, name: c.name } });
  res.json({ ok: true });
}

/** Delete several customers, with their documents, at once. Unknown or invalid ids are ignored. */
export async function removeMany(req: Request, res: Response) {
  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).filter(isId) : [];
  if (!ids.length) throw badRequest('No customers selected');
  let deleted = 0;
  for (const id of ids) {
    const c = await Customer.findByIdAndDelete(id);
    if (!c) continue;
    deleteCustomerFiles(c._id);
    await audit(req, 'customer.deleted', { details: { code: c.code, name: c.name } });
    deleted++;
  }
  res.json({ deleted });
}

export async function regenerateLink(req: Request, res: Response) {
  const c = await findOr404(req.params.id);
  const s = await Settings.get();
  const token = issueToken(c, s.linkValidityDays);
  await c.save();
  await audit(req, 'customer.link_regenerated', { customer: c._id });
  res.json({ link: formLink(token), tokenExpiresAt: c.tokenExpiresAt });
}

export async function review(req: Request, res: Response) {
  const c = await findOr404(req.params.id);
  const reviewStatus: unknown = req.body?.reviewStatus;
  const reviewNote = str(req.body?.reviewNote);
  if (!service.isReviewStatus(reviewStatus)) throw badRequest('Invalid review status');
  if (reviewStatus === 'needs_correction' && !reviewNote.trim()) throw badRequest('Add a note telling the customer what to correct');
  c.reviewStatus = reviewStatus;
  c.reviewNote = reviewNote;
  await c.save();
  await audit(req, `review.${reviewStatus}`, { customer: c._id, details: { note: reviewNote } });
  res.json({ customer: service.toSummary(c) });
}

/** Stream an uploaded document. `?v=<storedName>` picks an earlier version; `?download=1` forces a download. */
export async function file(req: Request, res: Response) {
  const field = str(req.params.field);
  if (!isFileField(field)) throw notFound();
  const c = await findOr404(req.params.id);
  const version = str(req.query.v);
  const meta = version ? c.fileHistory.find((h) => h.field === field && h.storedName === version) : c.files?.[field];
  if (!meta?.storedName) throw notFound();
  const p = customerFilePath(c._id, meta.storedName);
  if (!p) throw notFound('File missing on disk');
  const name = `${c.code}-${field}${path.extname(meta.storedName)}`;
  // Only PDFs and images (recognised from their contents) open in the browser. Anything else
  // downloads, and the sandbox stops an uploaded web page or SVG from running in the admin panel.
  const viewable = VIEWABLE_TYPES.has(meta.mime) && !req.query.download;
  res.type(viewable ? meta.mime : UNKNOWN_TYPE);
  res.set('Content-Disposition', `${viewable ? 'inline' : 'attachment'}; filename="${name}"`);
  res.set('Content-Security-Policy', 'sandbox');
  res.set('Cache-Control', 'private, no-store');
  res.sendFile(p);
}

export async function exportXlsx(req: Request, res: Response) {
  const filter = service.buildFilter(listQuery(req));
  const [customers, entities] = await Promise.all([Customer.find(filter).sort({ code: 1 }), Entity.find()]);
  const buf = await buildExport(customers, entities, formLink);
  await audit(req, 'export.xlsx', { details: { count: customers.length } });
  res.attachment(`e-invoicing-customers-${new Date().toISOString().slice(0, 10)}.xlsx`);
  res.type(XLSX_MIME);
  res.send(buf);
}
