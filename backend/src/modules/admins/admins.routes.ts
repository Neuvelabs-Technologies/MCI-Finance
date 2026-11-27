import { Router } from 'express';
import { requireAdmin } from '../../middlewares/auth.middleware.js';
import * as controller from './admins.controller.js';

const router = Router();
router.use(requireAdmin);

router.get('/', controller.list);
router.post('/', controller.create);
router.put('/:id/tally', controller.setTally);
router.delete('/:id', controller.remove);

export default router;
