// Load or remove the demo data set from the command line.
//   npm run demo:load      replace demo data with a fresh set
//   npm run demo:clear     remove all demo data
// On a production server this refuses unless ALLOW_DEMO_DATA=true (or --force).
import { config } from '../config/env.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { clearDemoData, loadDemoData } from '../services/demo.service.js';
import { logger } from '../utils/logger.js';
import { ensureSeed } from './seed.js';

const action = process.argv[2];
const force = process.argv.includes('--force');

async function run() {
  if (action !== 'load' && action !== 'clear') {
    logger.error('Usage: tsx src/seeds/demo.ts <load|clear> [--force]');
    process.exit(2);
  }
  if (action === 'load' && !config.allowDemoData && !force) {
    logger.error('Demo data is turned off on this server. Set ALLOW_DEMO_DATA=true, or pass --force if you are sure.');
    process.exit(1);
  }
  await connectDb();
  await ensureSeed();
  if (action === 'load') {
    const r = await loadDemoData({ force: true });
    logger.info(`[demo] loaded ${r.customers} sample customers and ${r.entities} sample entity`);
  } else {
    const r = await clearDemoData();
    logger.info(`[demo] removed ${r.customers} sample customers, ${r.entities} entities and ${r.logs} activity entries`);
  }
  await disconnectDb();
}

run().catch((e: unknown) => {
  logger.fatal(e, '[demo] failed');
  process.exit(1);
});
