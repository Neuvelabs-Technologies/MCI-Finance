import { Router } from 'express';
import { requireAdmin } from '../../middlewares/auth.middleware.js';
import * as controller from './emails.controller.js';

const router = Router();
router.use(requireAdmin);

router.get('/', controller.list);
router.get('/export', controller.exportXlsx);
router.post('/sync', controller.sync);

export default router;
