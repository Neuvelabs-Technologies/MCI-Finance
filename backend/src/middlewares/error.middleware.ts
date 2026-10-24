import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { config } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Not found' });
}

// Express recognises error handlers by their 4 arguments, so `next` must stay.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
    const msg = `File must be under ${config.maxFileMb} MB.`;
    res.status(413).json({ error: `Each file must be under ${config.maxFileMb} MB.`, errors: err.field ? { [err.field]: msg } : undefined });
    return;
  }
  // Malformed JSON body
  if ((err as { type?: string })?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'The request could not be read.' });
    return;
  }
  const status = err instanceof ApiError ? err.status : ((err as { status?: number })?.status ?? 500);
  if (status >= 500) logger.error({ err, reqId: req.id }, 'unhandled error');
  const message = status >= 500 ? 'Something went wrong. Please try again.' : (err as Error).message;
  const field = err instanceof ApiError ? err.field : undefined;
  res.status(status).json({
    error: message,
    errors: field ? { [field]: message } : undefined,
    // Quote this when reporting a problem; it matches the server log line.
    requestId: status >= 500 ? req.id : undefined,
  });
}
