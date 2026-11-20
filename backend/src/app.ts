import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { config } from './config/env.js';
import { dbIsUp } from './config/db.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import adminsRoutes from './modules/admins/admins.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import customersRoutes from './modules/customers/customers.routes.js';
import emailsRoutes from './modules/emails/emails.routes.js';
import entitiesRoutes from './modules/entities/entities.routes.js';
import publicFormRoutes from './modules/public-form/public-form.routes.js';
import settingsRoutes from './modules/settings/settings.routes.js';
import systemRoutes from './modules/system/system.routes.js';
import webhooksRoutes from './modules/webhooks/webhooks.routes.js';
import { storageKind } from './services/storage.service.js';
import { normalizeForwardedFor } from './utils/client-ip.js';
import { logger } from './utils/logger.js';

// The built frontend, copied in by the Azure deploy workflow. Absent on the UAT server and in
// development, where nginx or Vite serves the frontend instead.
const PUBLIC_DIR = path.resolve(import.meta.dirname, '..', 'public');

/** The JSON API, plus the React frontend when it's been built into backend/public (Azure). */
export function createApp({ publicDir = PUBLIC_DIR }: { publicDir?: string } = {}) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(normalizeForwardedFor);
  app.disable('x-powered-by');
  app.use(
    helmet({
      // Same policy as the frontend's nginx config, so documents opened from the API (PDFs, images) still render
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          frameSrc: ["'self'", 'blob:'],
          objectSrc: ["'self'", 'blob:'],
          upgradeInsecureRequests: config.cookieSecure ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(
    pinoHttp({
      logger,
      // A request id ties log lines together and is returned to the browser for support queries
      genReqId: (req, res) => {
        const id = (req.headers['x-request-id'] as string | undefined) ?? crypto.randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url.replace(/\/form\/[^/?]+/, '/form/:token') }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    })
  );
  // Delivery events from the email provider. Mailjet batches events, so allow larger bodies than the API.
  app.use('/api/webhooks', express.json({ limit: '10mb' }), webhooksRoutes);

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Liveness + readiness: 503 while the database is unreachable, so the load balancer / Docker can tell.
  app.get('/api/health', (_req, res) => {
    const db = dbIsUp();
    res.status(db ? 200 : 503).json({ ok: db, db: db ? 'up' : 'down', storage: storageKind(), version: config.version, ...(config.commit ? { commit: config.commit } : {}), uptime: Math.round(process.uptime()) });
  });

  // Customer-facing (token link, no login)
  app.use('/api/public', publicFormRoutes);

  // Admin panel
  app.use('/api/auth', authRoutes);
  app.use('/api/customers', customersRoutes);
  app.use('/api/emails', emailsRoutes);
  app.use('/api/entities', entitiesRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/admins', adminsRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/system', systemRoutes);

  if (fs.existsSync(path.join(publicDir, 'index.html'))) serveFrontend(app, publicDir);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

/** Serves the React app from the same origin as the API (Azure App Service, no nginx). */
function serveFrontend(app: express.Express, publicDir: string): void {
  const indexFile = path.join(publicDir, 'index.html');
  const assetsDir = path.join(publicDir, 'assets') + path.sep;
  app.use(
    express.static(publicDir, {
      index: false,
      setHeaders(res, filePath) {
        // Vite puts content-hashed files under /assets, so they never change.
        if (filePath.startsWith(assetsDir)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else if (filePath.includes(`${path.sep}brand${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=86400');
        else res.setHeader('Cache-Control', 'no-cache');
      },
    })
  );
  // React routes (/admin/..., /f/<token>, /auth/callback) load the app. Unknown /api paths and
  // missing /assets files (an old tab after a deploy) still get a 404 rather than HTML.
  app.get(/^\/(?!api(?:\/|$)|assets\/)/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(indexFile);
  });
}
