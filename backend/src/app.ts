import crypto from 'node:crypto';
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
import entitiesRoutes from './modules/entities/entities.routes.js';
import publicFormRoutes from './modules/public-form/public-form.routes.js';
import settingsRoutes from './modules/settings/settings.routes.js';
import systemRoutes from './modules/system/system.routes.js';
import { logger } from './utils/logger.js';

/** The JSON API. The React frontend is built and served separately (see frontend/). */
export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
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
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Liveness + readiness: 503 while the database is unreachable, so the load balancer / Docker can tell.
  app.get('/api/health', (_req, res) => {
    const db = dbIsUp();
    res.status(db ? 200 : 503).json({ ok: db, db: db ? 'up' : 'down', version: config.version, uptime: Math.round(process.uptime()) });
  });

  // Customer-facing (token link, no login)
  app.use('/api/public', publicFormRoutes);

  // Admin panel
  app.use('/api/auth', authRoutes);
  app.use('/api/customers', customersRoutes);
  app.use('/api/entities', entitiesRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/admins', adminsRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/system', systemRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
