import type { Request, Response } from 'express';
import { Customer } from '../../models/Customer.js';
import { ENTITY_FIELDS, Entity, type IEntity } from '../../models/Entity.js';
import { badRequest, notFound } from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { isId, str } from '../../utils/http.js';

/** Keep only the editable entity fields from the request body. */
function pickEntity(body: unknown): Partial<IEntity> {
  const src = (body ?? {}) as Record<string, unknown>;
  return Object.fromEntries(ENTITY_FIELDS.filter((k) => src[k] !== undefined).map((k) => [k, src[k]])) as Partial<IEntity>;
}

export async function list(_req: Request, res: Response) {
  res.json({ entities: await Entity.find().sort({ sortOrder: 1, name: 1 }) });
}

export async function create(req: Request, res: Response) {
  const body = pickEntity(req.body);
  if (!str(body.name).trim()) throw badRequest('Entity name is required');
  const e = await Entity.create(body);
  await audit(req, 'entity.created', { details: { name: e.name } });
  res.status(201).json({ entity: e });
}

export async function update(req: Request, res: Response) {
  const { id } = req.params;
  if (!isId(id)) throw notFound();
  const body = pickEntity(req.body);
  if (body.name !== undefined && !str(body.name).trim()) throw badRequest('Entity name is required');
  const e = await Entity.findByIdAndUpdate(id, body, { new: true, runValidators: true });
  if (!e) throw notFound();
  await audit(req, 'entity.updated', { details: { name: e.name } });
  res.json({ entity: e });
}

export async function remove(req: Request, res: Response) {
  const { id } = req.params;
  if (!isId(id)) throw notFound();
  if (await Customer.exists({ 'data.entities': id })) throw badRequest('Customers have selected this entity. Deactivate it instead of deleting.');
  const e = await Entity.findByIdAndDelete(id);
  if (!e) throw notFound();
  await audit(req, 'entity.deleted', { details: { name: e.name } });
  res.json({ ok: true });
}
