import { Router } from 'express';
import { requireAdmin } from '../../middlewares/auth.middleware.js';
import { logoUpload } from '../../middlewares/upload.middleware.js';
import * as controller from './settings.controller.js';

const router = Router();
router.use(requireAdmin);

router.get('/', controller.get);
router.put('/', controller.update);
router.post('/logo', logoUpload, controller.uploadLogo);
router.delete('/logo', controller.removeLogo);
router.post('/test-email', controller.testEmail);
router.post('/preview-email', controller.previewEmail);

export default router;
