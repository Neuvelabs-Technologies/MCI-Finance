import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { FILE_FIELDS } from '../utils/rules.js';

/** Document types customers may upload, with the extension we store them under. */
export const DOC_TYPES: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};

export const LOGO_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
};

export const tmpDir = path.join(config.uploadDir, 'tmp');
fs.mkdirSync(tmpDir, { recursive: true });

/** Customer documents on the public form: written to a temp folder, then moved by storage.service. */
export const formDocsUpload = multer({
  dest: tmpDir,
  limits: { fileSize: config.maxFileMb * 1024 * 1024, files: 10, fields: 60 },
  fileFilter: (_req, file, cb) => {
    if (!DOC_TYPES[file.mimetype]) return cb(new ApiError(400, 'Only PDF, JPG or PNG files are allowed.', file.fieldname));
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
