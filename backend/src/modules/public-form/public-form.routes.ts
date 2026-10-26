import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { formDocsUpload } from '../../middlewares/upload.middleware.js';
import * as controller from './public-form.controller.js';
import { loadByToken } from './public-form.service.js';

const readLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });
const writeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

/** Refuse uploads for unknown or expired links before any file is written to disk. */
async function requireFormLink(req: Request, res: Response, next: NextFunction) {
  const c = await loadByToken(String(req.params.token ?? ''));
  if (!c || c === 'expired') {
    // Read and discard the upload (nothing is written to disk) before answering, so the
    // browser receives this message instead of a dropped connection mid-upload.
    const reply = () => {
      if (!res.headersSent) res.status(404).json({ error: 'This link is invalid or has expired.' });
    };
    if (req.complete) reply();
    else {
      req.on('end', reply);
      req.on('error', () => res.destroy());
      req.resume();
    }
    return;
  }
  next();
}

// No login: customers reach these through their personal token link.
const router = Router();

router.get('/info', readLimiter, controller.info);
router.get('/logo', readLimiter, controller.logo);
router.get('/form/:token', readLimiter, controller.getForm);
router.post('/form/:token', writeLimiter, requireFormLink, formDocsUpload, controller.submitForm);

export default router;
