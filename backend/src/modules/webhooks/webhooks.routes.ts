import { Router } from 'express';
import * as controller from './webhooks.controller.js';

// Called by external services, not the admin panel: authenticated by a shared secret, not a login.
const router = Router();

router.post('/mailjet', controller.mailjet);

export default router;
