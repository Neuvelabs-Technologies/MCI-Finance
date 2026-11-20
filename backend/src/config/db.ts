import mongoose from 'mongoose';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { logger } from '../utils/logger.js';
import { config } from './env.js';

let memServer: MongoMemoryServer | undefined;

export async function connectDb(uri = config.mongoUri): Promise<void> {
  let target = uri;
  if (config.useMemoryDb) {
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memServer = await MongoMemoryServer.create();
    target = memServer.getUri('mci_einvoice');
    logger.warn('[db] using an in-memory MongoDB — data is lost on restart');
  }
  mongoose.connection.on('disconnected', () => logger.warn('[db] disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('[db] reconnected'));
  const dbName = config.useMemoryDb ? undefined : databaseName(target, config.mongoDbName);
  await mongoose.connect(target, { serverSelectionTimeoutMS: 10_000, ...(dbName ? { dbName } : {}) });
  logger.info(`[db] connected to ${mongoose.connection.name}`);
}

/**
 * MONGODB_DB if set; otherwise 'finance' when the URI names no database (MCI's DocumentDB
 * URI ends in "/?tls=…", and the driver would quietly use "test"); otherwise the URI decides.
 */
export function databaseName(uri: string, configured: string): string | undefined {
  if (configured) return configured;
  const afterHost = uri.replace(/^mongodb(\+srv)?:\/\/[^/]*/, '');
  const name = afterHost.replace(/^\//, '').split('?')[0];
  return name ? undefined : 'finance';
}

export const dbIsUp = (): boolean => mongoose.connection.readyState === mongoose.ConnectionStates.connected;

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  if (memServer) await memServer.stop();
}
