import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test' || !!process.env.VITEST;

/**
 * App-wide logger. JSON lines in production (for docker logs / a log shipper),
 * readable coloured output in development, silent in tests.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isTest ? 'silent' : isProd ? 'info' : 'debug'),
  base: { app: 'einvoice-api' },
  redact: {
    paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]', '*.password', '*.passwordHash'],
    censor: '[redacted]',
  },
  transport: isProd || isTest ? undefined : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,app' } },
});
