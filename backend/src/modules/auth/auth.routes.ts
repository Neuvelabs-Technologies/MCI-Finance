import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAdmin } from '../../middlewares/auth.middleware.js';
import * as controller from './auth.controller.js';

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
// Microsoft checks the password and MFA; this only stops a runaway client. Looser, because a whole
// office often shares one IP and every sign-in takes two calls.
const microsoftLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false });

const router = Router();

router.post('/login', loginLimiter, controller.login);
router.post('/logout', controller.logout);
// Microsoft Entra ID sign-in (see services/microsoft-auth.service.ts)
router.get('/options', controller.options);
router.post('/microsoft/start', microsoftLimiter, controller.microsoftStart);
router.post('/microsoft/callback', microsoftLimiter, controller.microsoftCallback);
// One-click sign-in for development and staging (off on the live server, see config.quickLogin)
router.get('/quick-login', controller.quickLoginOptions);
router.post('/quick-login', loginLimiter, controller.quickLogin);
router.get('/me', requireAdmin, controller.me);
router.post('/password', requireAdmin, controller.changePassword);

export default router;
