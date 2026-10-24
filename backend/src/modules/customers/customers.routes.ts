import { Router } from 'express';
import { requireAdmin } from '../../middlewares/auth.middleware.js';
import { importUpload } from '../../middlewares/upload.middleware.js';
import * as controller from './customers.controller.js';

const router = Router();
router.use(requireAdmin);

// Collection-level routes first, so "stats" etc. aren't read as an :id
router.get('/', controller.list);
router.post('/', controller.create);
router.get('/stats', controller.stats);
router.get('/overview', controller.overview);
router.get('/export', controller.exportXlsx);
router.get('/import-template', controller.importTemplate);
router.post('/import', importUpload, controller.importList);
router.post('/send', controller.send);
router.post('/mark-sent', controller.markSent);

router.get('/:id', controller.getOne);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);
router.post('/:id/link', controller.regenerateLink);
router.patch('/:id/review', controller.review);
router.get('/:id/files/:field', controller.file);

export default router;
