import { Router } from 'express';
import { requireAdmin } from '../../middlewares/auth.middleware.js';
import * as controller from './audit.controller.js';

const router = Router();
router.use(requireAdmin);

router.get('/', controller.list);

export default router;
