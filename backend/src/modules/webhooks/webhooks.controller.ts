import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { config } from '../../config/env.js';
import { applyMailjetEvent, type MailjetEvent } from '../../services/mail-tracking.service.js';
import { notFound } from '../../utils/ApiError.js';

const sameSecret = (a: string, b: string): boolean => {
  const x = crypto.createHash('sha256').update(a).digest();
  const y = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(x, y);
};

/** Mailjet signs in with HTTP basic auth (any user name, MAILJET_WEBHOOK_SECRET as the password). */
function authorized(req: Request): boolean {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const password = decoded.slice(decoded.indexOf(':') + 1);
  return sameSecret(password, config.mailjet.webhookSecret);
}

/**
 * Delivery events from Mailjet: one event, or an array when Mailjet groups them.
 * Always answers 200 for a valid request, otherwise Mailjet retries the same events for 24 hours.
 */
export async function mailjet(req: Request, res: Response) {
  if (!config.mailjet.webhookSecret) throw notFound();
  if (!authorized(req)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="mailjet"');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const events = (Array.isArray(req.body) ? req.body : [req.body]) as MailjetEvent[];
  let applied = 0;
  for (const ev of events) {
    try {
      if ((await applyMailjetEvent(ev)) === 'applied') applied++;
    } catch (err) {
      req.log.error({ err, event: ev?.event }, '[mailjet] could not apply event');
    }
  }
  res.json({ ok: true, received: events.length, applied });
}
