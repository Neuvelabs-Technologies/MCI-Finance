import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { currentAdmin } from '../../middlewares/auth.middleware.js';
import { Admin } from '../../models/Admin.js';
import { badRequest, notFound } from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { isId, str } from '../../utils/http.js';
import { isEmail } from '../../utils/rules.js';

export async function list(_req: Request, res: Response) {
  const admins = await Admin.find().sort({ createdAt: 1 });
  res.json({ admins: admins.map((a) => a.toSafe()) });
}

export async function create(req: Request, res: Response) {
  const email = str(req.body?.email).toLowerCase().trim();
  const password = str(req.body?.password);
  if (!isEmail(email)) throw badRequest('Enter a valid email');
  if (password.length < 10) throw badRequest('Password must be at least 10 characters');
  if (await Admin.exists({ email })) throw badRequest('This user already exists');
  const a = await Admin.create({ email, name: str(req.body?.name) || undefined, passwordHash: await bcrypt.hash(password, 12) });
  await audit(req, 'admin.created', { details: { email } });
  res.status(201).json({ admin: a.toSafe() });
}

export async function remove(req: Request, res: Response) {
  const { id } = req.params;
  if (!isId(id)) throw notFound();
  if (String(currentAdmin(req)._id) === id) throw badRequest("You can't remove yourself");
  const a = await Admin.findByIdAndDelete(id);
  if (!a) throw notFound();
  await audit(req, 'admin.deleted', { details: { email: a.email } });
  res.json({ ok: true });
}
