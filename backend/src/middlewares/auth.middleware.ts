import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { Admin, type AdminDoc } from '../models/Admin.js';

const COOKIE = 'einv_admin';
const SESSION_HOURS = 12;

interface SessionClaims extends jwt.JwtPayload {
  sub: string;
  /** Admin.sessionVersion when the session was issued. */
  v?: number;
}

export function setSession(res: Response, admin: AdminDoc): void {
  const token = jwt.sign({ sub: String(admin._id), v: admin.sessionVersion ?? 0 }, config.jwtSecret, { expiresIn: `${SESSION_HOURS}h` });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: SESSION_HOURS * 3600 * 1000,
    path: '/',
  });
}

export function clearSession(res: Response): void {
  res.clearCookie(COOKIE, { path: '/' });
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const raw: unknown = req.cookies?.[COOKIE];
    if (typeof raw !== 'string' || !raw) {
      res.status(401).json({ error: 'Not signed in' });
      return;
    }
    const claims = jwt.verify(raw, config.jwtSecret) as SessionClaims;
    const admin = claims.sub ? await Admin.findById(claims.sub) : null;
    // A removed admin, or a password changed since this session began, ends the session.
    if (!admin || (claims.v ?? 0) !== (admin.sessionVersion ?? 0)) {
      clearSession(res);
      res.status(401).json({ error: 'Your session has ended. Please sign in again.' });
      return;
    }
    req.admin = admin;
    next();
  } catch {
    res.status(401).json({ error: 'Session expired' });
  }
}

/** The signed-in admin. Only call this in routes behind requireAdmin. */
export function currentAdmin(req: Request): AdminDoc {
  if (!req.admin) throw new Error('requireAdmin middleware missing');
  return req.admin;
}
