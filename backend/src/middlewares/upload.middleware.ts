import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { BLOCKED_FILE_MESSAGE, FILE_FIELDS, isBlockedFileName } from '../utils/rules.js';

export const LOGO_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
};

export const tmpDir = path.join(config.uploadDir, 'tmp');
fs.mkdirSync(tmpDir, { recursive: true });

/** Per-file size cap in bytes, or undefined for no limit (MAX_FILE_MB=0, the default). */
const maxFileBytes = config.maxFileMb > 0 ? config.maxFileMb * 1024 * 1024 : undefined;

/**
 * Customer documents on the public form: written to a temp folder, then moved by storage.service.
 * Any document or image is accepted; only programs and scripts are refused (see rules.ts).
 * The form link is checked BEFORE this runs (see public-form.routes), so a made-up link can't upload.
 */
export const formDocsUpload = multer({
  dest: tmpDir,
  limits: { ...(maxFileBytes ? { fileSize: maxFileBytes } : {}), files: FILE_FIELDS.length, fields: 60 },
  fileFilter: (_req, file, cb) => {
    if (isBlockedFileName(file.originalname)) return cb(new ApiError(400, BLOCKED_FILE_MESSAGE, file.fieldname));
    cb(null, true);
  },
}).fields(FILE_FIELDS.map((name) => ({ name, maxCount: 1 })));

/** Customer import file (CSV / XLSX), kept in memory. */
export const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }).single('file');

/** Logo image for the form header, kept in memory. */
export const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
  fileFilter: (_req, f, cb) => cb(null, !!LOGO_TYPES[f.mimetype]),
}).single('logo');
