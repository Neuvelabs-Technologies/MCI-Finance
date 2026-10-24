import type { Request, Response } from 'express';
import { config } from '../../config/env.js';
import { dbIsUp } from '../../config/db.js';
import { clearDemoData, demoStatus, loadDemoData } from '../../services/demo.service.js';
import { smtpConfigured } from '../../services/mailer.service.js';
import { audit } from '../../utils/audit.js';

/** Facts about this server for the Settings → System tab and support queries. */
export async function info(_req: Request, res: Response) {
  res.json({
    version: config.version,
    environment: config.isProd ? 'production' : 'development',
    node: process.version,
    uptimeSeconds: Math.round(process.uptime()),
    database: dbIsUp() ? 'connected' : 'disconnected',
    inMemoryDatabase: config.useMemoryDb,
    smtpConfigured: smtpConfigured(),
    publicBaseUrl: config.publicBaseUrl,
    cookieSecure: config.cookieSecure,
    maxFileMb: config.maxFileMb,
    notifyEmails: config.notifyEmails ? config.notifyEmails.split(',').map((x) => x.trim()).filter(Boolean) : [],
    demo: await demoStatus(),
  });
}

export async function getDemo(_req: Request, res: Response) {
  res.json(await demoStatus());
}

export async function loadDemo(req: Request, res: Response) {
  const result = await loadDemoData();
  await audit(req, 'demo.loaded', { details: result });
  res.json(result);
}

export async function clearDemo(req: Request, res: Response) {
  const result = await clearDemoData();
  await audit(req, 'demo.cleared', { details: result });
  res.json(result);
}
