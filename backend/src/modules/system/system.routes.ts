import { Router } from 'express';
import { requireAdmin } from '../../middlewares/auth.middleware.js';
import * as controller from './system.controller.js';

const router = Router();
router.use(requireAdmin);

router.get('/info', controller.info);
router.get('/demo', controller.getDemo);
router.post('/demo', controller.loadDemo);
router.delete('/demo', controller.clearDemo);

export default router;
