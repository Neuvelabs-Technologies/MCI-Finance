import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { formDocsUpload } from '../../middlewares/upload.middleware.js';
import * as controller from './public-form.controller.js';

const readLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });
const writeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

// No login: customers reach these through their personal token link.
const router = Router();

router.get('/info', readLimiter, controller.info);
router.get('/logo', readLimiter, controller.logo);
router.get('/form/:token', readLimiter, controller.getForm);
router.post('/form/:token', writeLimiter, formDocsUpload, controller.submitForm);

export default router;
