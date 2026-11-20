import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { config, microsoftConfigured, passwordLoginEnabled } from '../../config/env.js';
import { clearSession, currentAdmin, setSession } from '../../middlewares/auth.middleware.js';
import { Admin } from '../../models/Admin.js';
import { Customer } from '../../models/Customer.js';
import { mailConfigured } from '../../services/mailer.service.js';
import { adminForIdentity, completeSignIn, failureReason, startSignIn } from '../../services/microsoft-auth.service.js';
import { ApiError, badRequest } from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { str } from '../../utils/http.js';

export async function login(req: Request, res: Response) {
  if (!passwordLoginEnabled()) throw new ApiError(403, 'Password sign-in is turned off. Use Sign in with Microsoft.');
  const email = str(req.body?.email).toLowerCase().trim();
  const password = str(req.body?.password);
  const admin = await Admin.findOne({ email });
  if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) throw new ApiError(401, 'Incorrect email or password');
  admin.lastLoginAt = new Date();
  await admin.save();
  setSession(res, admin);
  await audit(req, 'admin.login', { actor: admin.email });
  res.json({ admin: admin.toSafe() });
}

/** Which sign-in options the login page shows. Public; says nothing about the configuration itself. */
export function options(_req: Request, res: Response) {
  res.json({ microsoft: microsoftConfigured(), password: passwordLoginEnabled() });
}

/** Where to send the browser to sign in with Microsoft. */
export function microsoftStart(_req: Request, res: Response) {
  res.json(startSignIn());
}

/** { code, state, transaction } posted by the /auth/callback page after Microsoft redirects back. */
export async function microsoftCallback(req: Request, res: Response) {
  const code = str(req.body?.code);
  const state = str(req.body?.state);
  const transaction = str(req.body?.transaction);
  if (!code || !state || !transaction) throw new ApiError(400, 'code, state and transaction are required');
  let email = '';
  try {
    const identity = await completeSignIn({ code, state, transaction });
    email = identity.email;
    const { admin, created } = await adminForIdentity(identity);
    admin.lastLoginAt = new Date();
    await admin.save();
    if (created) await audit(req, 'admin.created', { actor: admin.email, details: { email: admin.email, via: 'microsoft' } });
    setSession(res, admin);
    await audit(req, 'admin.login', { actor: admin.email, details: { method: 'microsoft' } });
    res.json({ admin: admin.toSafe() });
  } catch (e) {
    await audit(req, 'admin.login_failed', { actor: email || 'unknown', details: { method: 'microsoft', reason: failureReason(e) } });
    throw e;
  }
}

export function logout(_req: Request, res: Response) {
  clearSession(res);
  res.json({ ok: true });
}

export async function me(req: Request, res: Response) {
  res.json({
    admin: currentAdmin(req).toSafe(),
    smtpConfigured: mailConfigured(),
    publicBaseUrl: config.publicBaseUrl,
    version: config.version,
    signIn: { microsoft: microsoftConfigured(), password: passwordLoginEnabled() },
    demo: { count: await Customer.countDocuments({ demo: true }), allowed: config.allowDemoData },
  });
}

export async function changePassword(req: Request, res: Response) {
  const admin = currentAdmin(req);
  const current = str(req.body?.current);
  const next = str(req.body?.next);
  if (!(await bcrypt.compare(current, admin.passwordHash))) throw badRequest('Current password is incorrect');
  if (next.length < 10) throw badRequest('New password must be at least 10 characters');
  admin.passwordHash = await bcrypt.hash(next, 12);
  // Sign out every other session, then give this browser a fresh one.
  admin.sessionVersion = (admin.sessionVersion ?? 0) + 1;
  await admin.save();
  setSession(res, admin);
  await audit(req, 'admin.password_changed');
  res.json({ ok: true });
}

/** Accounts offered for one-click sign-in (development / staging only). */
export async function quickLoginOptions(_req: Request, res: Response) {
  if (!config.quickLogin) {
    res.json({ enabled: false, accounts: [] });
    return;
  }
  const admins = await Admin.find().sort({ createdAt: 1 }).limit(6);
  res.json({ enabled: true, accounts: admins.map((a) => ({ email: a.email, name: a.name })) });
}

/** Sign in as an existing admin without a password. Refused unless quick sign-in is on. */
export async function quickLogin(req: Request, res: Response) {
  if (!config.quickLogin) throw new ApiError(404, 'Not found');
  const email = str(req.body?.email).toLowerCase().trim();
  const admin = email ? await Admin.findOne({ email }) : await Admin.findOne().sort({ createdAt: 1 });
  if (!admin) throw new ApiError(404, 'No such admin');
  admin.lastLoginAt = new Date();
  await admin.save();
  setSession(res, admin);
  await audit(req, 'admin.login', { actor: admin.email, details: { quick: true } });
  res.json({ admin: admin.toSafe() });
}
