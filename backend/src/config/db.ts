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
  await mongoose.connect(target, { serverSelectionTimeoutMS: 10_000 });
  logger.info('[db] connected');
}

export const dbIsUp = (): boolean => mongoose.connection.readyState === mongoose.ConnectionStates.connected;

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  if (memServer) await memServer.stop();
}
