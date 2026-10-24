import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Types } from 'mongoose';
import { config } from '../config/env.js';
import { DOC_TYPES, LOGO_TYPES } from '../middlewares/upload.middleware.js';
import type { StoredFile } from '../models/Customer.js';
import { ApiError } from '../utils/ApiError.js';

const SETTINGS_DIR = path.join(config.uploadDir, '_settings');

/** Check the file's magic bytes match a type we accept. */
function sniff(filePath: string): string | null {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(8);
  fs.readSync(fd, buf, 0, 8, 0);
  fs.closeSync(fd);
  if (buf.subarray(0, 4).toString() === '%PDF') return 'application/pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}

/** Move an uploaded temp file into the customer's private folder. Returns file metadata. */
export function storeCustomerFile(customerId: Types.ObjectId, field: string, file: Express.Multer.File): StoredFile {
  const real = sniff(file.path);
  if (!real) {
    fs.rmSync(file.path, { force: true });
    throw new ApiError(400, 'The file does not look like a valid PDF, JPG or PNG.', field);
  }
  const dir = path.join(config.uploadDir, String(customerId));
  fs.mkdirSync(dir, { recursive: true });
  const storedName = `${field}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${DOC_TYPES[real]}`;
  fs.renameSync(file.path, path.join(dir, storedName));
  return {
    originalName: path.basename(file.originalname).slice(0, 180),
    storedName,
    size: file.size,
    mime: real,
    uploadedAt: new Date(),
  };
}

/** Save a generated file (e.g. a demo document) into the customer's private folder. */
export function writeCustomerFile(customerId: Types.ObjectId, field: string, data: Buffer, originalName: string, mime: string, at = new Date()): StoredFile {
  const dir = path.join(config.uploadDir, String(customerId));
  fs.mkdirSync(dir, { recursive: true });
  const storedName = `${field}-${at.getTime()}-${crypto.randomBytes(4).toString('hex')}${DOC_TYPES[mime] ?? ''}`;
  fs.writeFileSync(path.join(dir, storedName), data);
  return { originalName, storedName, size: data.length, mime, uploadedAt: at };
}

/** Absolute path of a stored customer file, or null if it's missing on disk. */
export function customerFilePath(customerId: Types.ObjectId, storedName: string): string | null {
  const p = path.join(config.uploadDir, String(customerId), path.basename(storedName));
  return fs.existsSync(p) ? p : null;
}

export function deleteCustomerFiles(customerId: Types.ObjectId): void {
  fs.rmSync(path.join(config.uploadDir, String(customerId)), { recursive: true, force: true });
}

export function cleanupTemp(files: Express.Multer.File[] | undefined): void {
  for (const f of files ?? []) fs.rmSync(f.path, { force: true });
}

export function saveLogo(file: Express.Multer.File): { storedName: string; mime: string } {
  fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  const storedName = `logo-${Date.now()}${LOGO_TYPES[file.mimetype] ?? ''}`;
  fs.writeFileSync(path.join(SETTINGS_DIR, storedName), file.buffer);
  return { storedName, mime: file.mimetype };
}

export function logoPath(storedName: string): string | null {
  const p = path.join(SETTINGS_DIR, path.basename(storedName));
  return fs.existsSync(p) ? p : null;
}
