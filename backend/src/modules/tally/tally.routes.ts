import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAdmin } from '../../middlewares/auth.middleware.js';
import { importUpload } from '../../middlewares/upload.middleware.js';
import * as groupPl from '../grouppl/grouppl.controller.js';
import * as connector from './tally.connector.js';
import * as controller from './tally.controller.js';

// /api/tally/connector/* — the Tally connector on MCI's Tally server (X-Tally-Key, larger bodies).
// Mounted before the app's 1 MB JSON parser, so it parses its own bodies.
const connectorLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false });

export const connectorRouter = Router();
connectorRouter.use(connectorLimiter, connector.requireConnectorKey, express.json({ limit: '25mb' }));
connectorRouter.get('/state', connector.state);
connectorRouter.post('/ledgers', connector.ingestLedgers);
connectorRouter.post('/vouchers', connector.ingestVouchers);
connectorRouter.post('/present', connector.markPresent);
connectorRouter.post('/sync-log', connector.logSync);
connectorRouter.post('/heartbeat', connector.heartbeat);

// /api/tally/* — the dashboard, for signed-in admins who were given Tally access.
export const dashboardRouter = Router();
dashboardRouter.use(requireAdmin, controller.requireTallyAccess);
dashboardRouter.get('/companies', controller.companies);
dashboardRouter.get('/summary', controller.summary);
dashboardRouter.get('/vouchers', controller.vouchers);
dashboardRouter.get('/ledgers', controller.ledgerList);
dashboardRouter.get('/status', controller.status);
dashboardRouter.post('/sync-request', controller.requestSync);
dashboardRouter.get('/report', controller.report);

// Group P&L: actual from Tally vs the uploaded forecast.
dashboardRouter.get('/group-pl', groupPl.report);
dashboardRouter.get('/group-pl/export', groupPl.exportXlsx);
dashboardRouter.get('/group-pl/setup', groupPl.getSetup);
dashboardRouter.put('/group-pl/setup', groupPl.saveSetup);
dashboardRouter.post('/group-pl/forecast', importUpload, groupPl.uploadForecast);
