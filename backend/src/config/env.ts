import fs from 'node:fs';
import os from 'node:os';
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

/** The git commit, written to build.json by the Azure deploy workflow (absent elsewhere). */
const readCommit = (): string => {
  try {
    return (JSON.parse(fs.readFileSync(path.join(backendRoot, 'build.json'), 'utf8')) as { commit?: string }).commit ?? '';
  } catch {
    return '';
  }
};

export const config = {
  version: readVersion(),
  commit: readCommit(),
  port: Number(env('PORT', '4000')),
  // MCI's App Service sets MONGODB_URI; the UAT server and local .env use MONGO_URI.
  mongoUri: env('MONGODB_URI', env('MONGO_URI', 'mongodb://127.0.0.1:27017/mci_einvoice')),
  // Database to use when the URI doesn't name one (MCI's DocumentDB URI doesn't). Empty = the URI's own.
  mongoDbName: env('MONGODB_DB', ''),
  useMemoryDb: env('USE_MEMORY_DB', '') === '1',
  jwtSecret: env('JWT_SECRET', 'change-me-in-production'),
  // Public URL customers open, e.g. https://einvoice.wearemci.com (no trailing slash)
  publicBaseUrl: env('PUBLIC_BASE_URL', 'http://localhost:5173').replace(/\/$/, ''),
  // Documents on local disk (UAT, development). Ignored for storage once Azure Blob is set up
  // below; upload temp files still land in <uploadDir>/tmp, so on Azure it defaults to the OS temp folder.
  uploadDir: path.resolve(backendRoot, env('UPLOAD_DIR', process.env.AZURE_STORAGE_BLOB_ENDPOINT || process.env.AZURE_STORAGE_CONNECTION_STRING ? path.join(os.tmpdir(), 'mci-finance-uploads') : 'uploads')),
  // Azure Blob storage (production on MCI's App Service). Signs in with the app's managed identity;
  // AZURE_STORAGE_CONNECTION_STRING is for local testing against Azurite.
  azureStorage: {
    endpoint: env('AZURE_STORAGE_BLOB_ENDPOINT', ''),
    connectionString: env('AZURE_STORAGE_CONNECTION_STRING', ''),
    container: env('AZURE_STORAGE_CONTAINER', 'finance-documents'),
  },
  // Microsoft Entra ID sign-in (MCI's app registration). The secret never leaves the server.
  microsoft: {
    tenantId: env('ENTRA_TENANT_ID', ''),
    clientId: env('ENTRA_CLIENT_ID', ''),
    clientSecret: env('ENTRA_CLIENT_SECRET', ''),
    redirectUri: env('ENTRA_REDIRECT_URI', ''),
    // Overridable so tests can point at a stand-in for Microsoft.
    authority: env('ENTRA_AUTHORITY', 'https://login.microsoftonline.com').replace(/\/+$/, ''),
  },
  // PASSWORD_LOGIN=false turns off email-and-password sign-in (production uses Microsoft only).
  // Ignored while Microsoft sign-in isn't fully set up, so a missing setting can't lock everyone out.
  passwordLoginSetting: env('PASSWORD_LOGIN', 'true') !== 'false',
  // Per-file upload cap in MB; 0 (the default) means no limit.
  maxFileMb: Number(env('MAX_FILE_MB', '0')),
  admin: {
    email: env('ADMIN_EMAIL', 'admin@example.com'),
    password: env('ADMIN_PASSWORD', 'ChangeMe123!'),
    name: env('ADMIN_NAME', 'Finance Admin'),
  },
  // Sender for every email, e.g. "MCI Middle East – Accounts <mci.admin@wearemci.com>".
  // With Mailjet it must be a sender (or domain) verified in the Mailjet account.
  mailFrom: env('MAIL_FROM', ''),
  // Mailjet Send API (used when both keys are set; takes priority over SMTP)
  mailjet: {
    apiKey: env('MAILJET_API_KEY', ''),
    secretKey: env('MAILJET_SECRET_KEY', ''),
    // Password Mailjet uses when it reports delivery events to /api/webhooks/mailjet.
    // Empty = webhook off (statuses then only update with "Refresh from Mailjet").
    webhookSecret: env('MAILJET_WEBHOOK_SECRET', ''),
  },
  // SMTP fallback, used only when the Mailjet keys are empty
  smtp: {
    host: env('SMTP_HOST', ''),
    port: Number(env('SMTP_PORT', '587')),
    secure: env('SMTP_SECURE', 'false') === 'true',
    user: env('SMTP_USER', ''),
    pass: env('SMTP_PASS', ''),
  },
  // Addresses that receive "customer submitted" notifications (comma-separated)
  notifyEmails: env('NOTIFY_EMAILS', ''),
  isProd,
  // Azure App Service sets WEBSITE_SITE_NAME on every app.
  onAzureAppService: env('WEBSITE_SITE_NAME', '') !== '',
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

/** Microsoft sign-in has everything it needs. */
export const microsoftConfigured = (): boolean => {
  const m = config.microsoft;
  return !!(m.tenantId && m.clientId && m.clientSecret && m.redirectUri);
};

/** Email-and-password sign-in is allowed (always, until Microsoft sign-in is set up). */
export const passwordLoginEnabled = (): boolean => config.passwordLoginSetting || !microsoftConfigured();

/** Customer documents go to Azure Blob instead of the local disk. */
export const blobStorageConfigured = (): boolean => !!(config.azureStorage.endpoint || config.azureStorage.connectionString);

/** Problems that make the server unsafe to run; checked at startup. */
export function configProblems(): string[] {
  const problems: string[] = [];
  if (config.isProd) {
    if (config.jwtSecret === 'change-me-in-production' || config.jwtSecret === 'replace-with-a-long-random-string')
      problems.push('JWT_SECRET must be set to a long random string');
    if (config.useMemoryDb) problems.push('USE_MEMORY_DB cannot be used in production');
    if (!/^https?:\/\//.test(config.publicBaseUrl)) problems.push('PUBLIC_BASE_URL must start with http:// or https://');
    // On Azure App Service every file goes to Blob storage; the local disk there is not kept safe.
    if (config.onAzureAppService && !blobStorageConfigured())
      problems.push('On Azure App Service documents must go to Blob storage: set AZURE_STORAGE_BLOB_ENDPOINT and AZURE_STORAGE_CONTAINER');
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
    const mailjet = !!(config.mailjet.apiKey && config.mailjet.secretKey);
    if (!mailjet && (config.mailjet.apiKey || config.mailjet.secretKey))
      warnings.push('Only one of MAILJET_API_KEY / MAILJET_SECRET_KEY is set — Mailjet needs both');
    if (!mailjet && !config.smtp.host) warnings.push('No email provider set (MAILJET_API_KEY/MAILJET_SECRET_KEY or SMTP_HOST) — emails will only be written to the log');
    if (mailjet && !config.mailjet.webhookSecret)
      warnings.push('MAILJET_WEBHOOK_SECRET is empty — email delivery statuses only update when an admin presses "Refresh from Mailjet"');
    if (mailjet && !config.mailFrom) warnings.push('MAIL_FROM is empty — Mailjet needs a verified sender address, so emails will fail');
    if (config.allowDemoData) warnings.push('ALLOW_DEMO_DATA is on — turn it off on the live server');
    const m = config.microsoft;
    const someMicrosoft = m.tenantId || m.clientId || m.clientSecret || m.redirectUri;
    if (someMicrosoft && !microsoftConfigured())
      warnings.push('Microsoft sign-in is only partly set up — it needs ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET and ENTRA_REDIRECT_URI');
    if (!config.passwordLoginSetting && !microsoftConfigured()) warnings.push('PASSWORD_LOGIN=false is ignored until Microsoft sign-in is set up');
    if (config.quickLogin) warnings.push('QUICK_LOGIN is on — anyone who can open the site can sign in as an admin. Never use it on the live server');
  }
  return warnings;
}
