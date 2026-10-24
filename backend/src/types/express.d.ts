import type { AdminDoc } from '../models/Admin.js';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAdmin for signed-in admin routes. */
      admin?: AdminDoc;
    }
  }
}

export {};
