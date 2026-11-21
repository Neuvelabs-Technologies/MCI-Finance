// Creates the first admin user, the default settings and a starter entity if they don't exist yet.
// Safe to run repeatedly. Runs on every server start; `npm run seed` runs it on its own.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { config } from '../config/env.js';
import { connectDb, disconnectDb } from '../config/db.js';
import { Admin } from '../models/Admin.js';
import { Customer } from '../models/Customer.js';
import { Entity } from '../models/Entity.js';
import { MCI_ROSE, Settings } from '../models/Settings.js';
import { logger } from '../utils/logger.js';

/** Brand colour used in emails before the MCI theme; switched to MCI rose once. */
const OLD_DEFAULT_ACCENT = '#0b5cad';

export async function ensureSeed(): Promise<void> {
  const settings = await Settings.get();
  if (settings.accentColor === OLD_DEFAULT_ACCENT) {
    settings.accentColor = MCI_ROSE;
    await settings.save();
    logger.info('[seed] email accent colour updated to MCI rose');
  }
  // Records from before vendors existed (1.6.0) are customers. Stored explicitly so type filters find them.
  const untyped = await Customer.updateMany({ type: { $exists: false } }, { $set: { type: 'customer' } });
  if (untyped.modifiedCount) logger.info(`[seed] marked ${untyped.modifiedCount} existing records as customers`);
  if (!(await Admin.exists({}))) {
    await Admin.create({
      email: config.admin.email,
      name: config.admin.name,
      passwordHash: await bcrypt.hash(config.admin.password, 12),
    });
    logger.info(`[seed] created first admin ${config.admin.email}`);
  }
  if (!(await Entity.exists({}))) {
    // Starter entity — VERIFY these details against MCI's trade licence and TRN certificate before going live.
    await Entity.create({
      key: 'LLC',
      name: 'MCI Middle East LLC',
      licensedBy: 'Licensed by Dubai',
      licenceType: 'Trade licence',
      issuingAuthority: 'Dubai Department of Economy and Tourism',
      licenceNo: '582356',
      trn: '100252242100003',
      tin: '1002522421',
      peppolId: '0235:1002522421',
      address: 'Suite 902, Level 9, Dubai World Trade Centre, Sheikh Zayed Road, P.O. Box 124752, Dubai, UAE',
      emirate: 'Dubai',
      freeZone: false,
      contactName: 'Finance Team',
      sortOrder: 1,
    });
    logger.info('[seed] created starter entity — check it under Our entities');
  }
}

// Run directly: `npm run seed`
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  connectDb()
    .then(ensureSeed)
    .then(disconnectDb)
    .then(() => process.exit(0))
    .catch((e: unknown) => {
      logger.fatal(e, '[seed] failed');
      process.exit(1);
    });
}
