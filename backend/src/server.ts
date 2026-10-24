import type { Server } from 'node:http';
import { createApp } from './app.js';
import { config, configProblems, configWarnings } from './config/env.js';
import { connectDb, disconnectDb } from './config/db.js';
import { startReminderJob } from './jobs/reminders.job.js';
import { ensureSeed } from './seeds/seed.js';
import { loadDemoData } from './services/demo.service.js';
import { logger } from './utils/logger.js';

let server: Server | undefined;
let reminderTimer: NodeJS.Timeout | undefined;

async function main() {
  const problems = configProblems();
  if (problems.length) {
    for (const p of problems) logger.fatal(`[config] ${p}`);
    process.exit(1);
  }
  for (const w of configWarnings()) logger.warn(`[config] ${w}`);

  await connectDb();
  await ensureSeed();
  if (config.useMemoryDb && config.autoDemoData) {
    const r = await loadDemoData();
    logger.info(`[demo] loaded ${r.customers} sample customers (set DEMO_DATA=0 to start empty)`);
  }

  server = createApp().listen(config.port, () => logger.info(`[api] v${config.version} listening on http://localhost:${config.port}`));
  reminderTimer = startReminderJob();
}

/** Stop taking requests, let in-flight ones finish, then close the database. */
async function shutdown(signal: string) {
  logger.info(`[api] ${signal} received — shutting down`);
  if (reminderTimer) clearInterval(reminderTimer);
  const force = setTimeout(() => {
    logger.error('[api] shutdown took too long — forcing exit');
    process.exit(1);
  }, 10_000);
  force.unref();
  try {
    if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
    await disconnectDb();
    process.exit(0);
  } catch (e) {
    logger.error(e, '[api] error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => logger.error({ err: reason }, '[api] unhandled promise rejection'));

main().catch((e: unknown) => {
  logger.fatal(e, '[api] failed to start');
  process.exit(1);
});
