import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Types } from 'mongoose';
import { config } from '../config/env.js';
import { LOGO_TYPES } from '../middlewares/upload.middleware.js';
import type { StoredFile } from '../models/Customer.js';
import { ApiError } from '../utils/ApiError.js';
import { BLOCKED_FILE_MESSAGE, fileExtension } from '../utils/rules.js';

const SETTINGS_DIR = path.join(config.uploadDir, '_settings');

/** Types we recognise from the file's contents, with the extension we store them under. */
const KNOWN_TYPES: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

/** Types safe to open in the browser. Everything else is always downloaded (see customers.controller → file). */
export const VIEWABLE_TYPES = new Set(Object.keys(KNOWN_TYPES));

export const UNKNOWN_TYPE = 'application/octet-stream';

/** What the file's first bytes say it is: a known type, 'program', or null for anything else. */
function sniff(filePath: string): string | null {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(12);
  const n = fs.readSync(fd, buf, 0, 12, 0);
  fs.closeSync(fd);
  const b = buf.subarray(0, n);
  // Programs, whatever the file is called: Windows (MZ), Linux (ELF), macOS (Mach-O), scripts (#!)
  if (b.subarray(0, 2).toString('latin1') === 'MZ') return 'program';
  if (b.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) return 'program';
  const magic = b.length >= 4 ? b.readUInt32BE(0) : 0;
  if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe].includes(magic)) return 'program';
  if (b.subarray(0, 2).toString('latin1') === '#!') return 'program';
  // Documents and images we can safely show in the browser
  if (b.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Move an uploaded temp file into the customer's private folder. Returns file metadata.
 * Any document is accepted, except programs (detected from the contents, so renaming doesn't help).
 * The browser's claimed type is never trusted: unknown types are stored as application/octet-stream.
 */
export function storeCustomerFile(customerId: Types.ObjectId, field: string, file: Express.Multer.File): StoredFile {
  const detected = sniff(file.path);
  if (detected === 'program') {
    fs.rmSync(file.path, { force: true });
    throw new ApiError(400, BLOCKED_FILE_MESSAGE, field);
  }
  const original = fileExtension(file.originalname);
  let ext = original ? `.${original}` : '';
  if (detected) ext = KNOWN_TYPES[detected] ?? ext;
  const dir = path.join(config.uploadDir, String(customerId));
  fs.mkdirSync(dir, { recursive: true });
  const storedName = `${field}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  fs.renameSync(file.path, path.join(dir, storedName));
  return {
    originalName: path.basename(file.originalname).slice(0, 180),
    storedName,
    size: file.size,
    mime: detected ?? UNKNOWN_TYPE,
    uploadedAt: new Date(),
  };
}

/** Save a generated file (e.g. a demo document) into the customer's private folder. */
export function writeCustomerFile(customerId: Types.ObjectId, field: string, data: Buffer, originalName: string, mime: string, at = new Date()): StoredFile {
  const dir = path.join(config.uploadDir, String(customerId));
  fs.mkdirSync(dir, { recursive: true });
  const storedName = `${field}-${at.getTime()}-${crypto.randomBytes(4).toString('hex')}${KNOWN_TYPES[mime] ?? ''}`;
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
