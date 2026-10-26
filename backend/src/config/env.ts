import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const backendRoot = path.resolve(import.meta.dirname, '..', '..');
// Tests set their own env; don't let a developer's .env leak into them.
if (!process.env.VITEST) dotenv.config({ path: path.join(backendRoot, '.env'), quiet: true });

const env = (k: string, d: string): string => {
  const v = process.env[k];
  return v !== undefined && v !== '' ? v : d;
};

const isProd = env('NODE_ENV', 'development') === 'production';

const readVersion = (): string => {
  try {
    return (JSON.parse(fs.readFileSync(path.join(backendRoot, 'package.json'), 'utf8')) as { version: string }).version;
  } catch {
    return 'unknown';
  }
};

export const config = {
  version: readVersion(),
  port: Number(env('PORT', '4000')),
  mongoUri: env('MONGO_URI', 'mongodb://127.0.0.1:27017/mci_einvoice'),
  useMemoryDb: env('USE_MEMORY_DB', '') === '1',
  jwtSecret: env('JWT_SECRET', 'change-me-in-production'),
  // Public URL customers open, e.g. https://einvoice.wearemci.com (no trailing slash)
  publicBaseUrl: env('PUBLIC_BASE_URL', 'http://localhost:5173').replace(/\/$/, ''),
  uploadDir: path.resolve(backendRoot, env('UPLOAD_DIR', 'uploads')),
  // Per-file upload cap in MB; 0 (the default) means no limit.
  maxFileMb: Number(env('MAX_FILE_MB', '0')),
  admin: {
    email: env('ADMIN_EMAIL', 'admin@example.com'),
    password: env('ADMIN_PASSWORD', 'ChangeMe123!'),
    name: env('ADMIN_NAME', 'Finance Admin'),
  },
  smtp: {
    host: env('SMTP_HOST', ''),
    port: Number(env('SMTP_PORT', '587')),
    secure: env('SMTP_SECURE', 'false') === 'true',
    user: env('SMTP_USER', ''),
    pass: env('SMTP_PASS', ''),
    from: env('MAIL_FROM', ''),
  },
  // Addresses that receive "customer submitted" notifications (comma-separated)
  notifyEmails: env('NOTIFY_EMAILS', ''),
  isProd,
  cookieSecure: env('COOKIE_SECURE', '') === 'true',
  // Sample customers for demos and training. Always allowed outside production;
  // in production only when ALLOW_DEMO_DATA=true (e.g. a staging server).
  allowDemoData: !isProd || env('ALLOW_DEMO_DATA', '') === 'true',
  // One-click "Quick sign-in" on the login page, without a password. Always on in development;
  // on a production server only when QUICK_LOGIN=true (a staging/demo server — never the live one).
  quickLogin: !isProd || env('QUICK_LOGIN', '') === 'true',
  // Load demo data automatically when starting with the in-memory database.
  autoDemoData: env('DEMO_DATA', '1') !== '0',
};

/** Problems that make the server unsafe to run; checked at startup. */
export function configProblems(): string[] {
  const problems: string[] = [];
  if (config.isProd) {
    if (config.jwtSecret === 'change-me-in-production' || config.jwtSecret === 'replace-with-a-long-random-string')
      problems.push('JWT_SECRET must be set to a long random string');
    if (config.useMemoryDb) problems.push('USE_MEMORY_DB cannot be used in production');
    if (!/^https?:\/\//.test(config.publicBaseUrl)) problems.push('PUBLIC_BASE_URL must start with http:// or https://');
  }
  if (!Number.isFinite(config.port) || config.port <= 0) problems.push('PORT must be a number');
  if (!Number.isFinite(config.maxFileMb) || config.maxFileMb < 0) problems.push('MAX_FILE_MB must be 0 (no limit) or a positive number');
  return problems;
}

/** Settings that work but should be fixed before go-live; logged as warnings. */
export function configWarnings(): string[] {
  const warnings: string[] = [];
  if (config.isProd) {
    if (config.jwtSecret.length < 32) warnings.push('JWT_SECRET is shorter than 32 characters — use a longer random string');
    if (!config.cookieSecure) warnings.push('COOKIE_SECURE is not true — admin sessions will work over plain HTTP');
    if (config.publicBaseUrl.startsWith('http://')) warnings.push('PUBLIC_BASE_URL uses http:// — customer links should use https://');
    if (config.admin.password === 'ChangeMe123!') warnings.push('ADMIN_PASSWORD is still the default (only used to create the first admin)');
    if (!config.smtp.host) warnings.push('SMTP_HOST is empty — emails will only be written to the log');
    if (config.allowDemoData) warnings.push('ALLOW_DEMO_DATA is on — turn it off on the live server');
    if (config.quickLogin) warnings.push('QUICK_LOGIN is on — anyone who can open the site can sign in as an admin. Never use it on the live server');
  }
  return warnings;
}
