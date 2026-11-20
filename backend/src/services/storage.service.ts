// Customer documents and the form logo. Two drivers, picked from the environment:
//   - Azure Blob (production on MCI's App Service): AZURE_STORAGE_BLOB_ENDPOINT, signed in with
//     the app's managed identity. AZURE_STORAGE_CONNECTION_STRING for local testing (Azurite).
//   - Local disk (UAT server, development, tests): UPLOAD_DIR.
// Both store a file under the same key, "<customerId>/<storedName>" or "_settings/<storedName>",
// so the database records don't care which one is active.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Readable } from 'node:stream';
import type { ContainerClient } from '@azure/storage-blob';
import type { Types } from 'mongoose';
import { blobStorageConfigured, config } from '../config/env.js';
import { LOGO_TYPES } from '../middlewares/upload.middleware.js';
import type { StoredFile } from '../models/Customer.js';
import { ApiError } from '../utils/ApiError.js';
import { BLOCKED_FILE_MESSAGE, fileExtension } from '../utils/rules.js';

const SETTINGS_FOLDER = '_settings';

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

export interface OpenedFile {
  stream: Readable;
  size?: number;
}

interface Driver {
  /** Store a file from a local path (the path is left for the caller to remove). */
  putFile(key: string, filePath: string, contentType: string): Promise<void>;
  putBuffer(key: string, data: Buffer, contentType: string): Promise<void>;
  /** The file's contents, or null if there is no such file. */
  open(key: string): Promise<OpenedFile | null>;
  /** Delete every file whose key starts with `prefix` (a folder, ending in "/"). */
  removeFolder(prefix: string): Promise<void>;
}

// ---- Local disk ----------------------------------------------------------------

const diskPath = (key: string): string => {
  const p = path.resolve(config.uploadDir, key);
  // Keys are built here from ids and generated names, but never let one climb out of the folder.
  if (!p.startsWith(config.uploadDir + path.sep)) throw new Error(`invalid storage key ${key}`);
  return p;
};

const diskDriver: Driver = {
  async putFile(key, filePath) {
    const dest = diskPath(key);
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.copyFile(filePath, dest);
  },
  async putBuffer(key, data) {
    const dest = diskPath(key);
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.writeFile(dest, data);
  },
  async open(key) {
    const p = diskPath(key);
    const stat = await fs.promises.stat(p).catch(() => null);
    if (!stat?.isFile()) return null;
    return { stream: fs.createReadStream(p), size: stat.size };
  },
  async removeFolder(prefix) {
    await fs.promises.rm(diskPath(prefix), { recursive: true, force: true });
  },
};

// ---- Azure Blob ----------------------------------------------------------------

let containerClient: ContainerClient | undefined;

async function container(): Promise<ContainerClient> {
  if (!containerClient) {
    const { BlobServiceClient } = await import('@azure/storage-blob');
    const { connectionString, endpoint, container: name } = config.azureStorage;
    let service;
    if (connectionString) {
      service = BlobServiceClient.fromConnectionString(connectionString);
    } else {
      const { DefaultAzureCredential } = await import('@azure/identity');
      service = new BlobServiceClient(endpoint, new DefaultAzureCredential());
    }
    containerClient = service.getContainerClient(name);
  }
  return containerClient;
}

/** Tests only: swap in a stand-in for the Blob container client (undefined to reset). */
export function setBlobContainerForTests(fake: ContainerClient | undefined): void {
  containerClient = fake;
}

const isNotFound = (e: unknown): boolean => (e as { statusCode?: number })?.statusCode === 404;

const blobDriver: Driver = {
  async putFile(key, filePath, contentType) {
    const c = await container();
    await c.getBlockBlobClient(key).uploadFile(filePath, { blobHTTPHeaders: { blobContentType: contentType } });
  },
  async putBuffer(key, data, contentType) {
    const c = await container();
    await c.getBlockBlobClient(key).uploadData(data, { blobHTTPHeaders: { blobContentType: contentType } });
  },
  async open(key) {
    const c = await container();
    try {
      const res = await c.getBlobClient(key).download();
      if (!res.readableStreamBody) return null;
      return { stream: res.readableStreamBody as Readable, size: res.contentLength };
    } catch (e) {
      if (isNotFound(e)) return null;
      throw e;
    }
  },
  async removeFolder(prefix) {
    const c = await container();
    // includeVersions is not needed: the account's soft delete / versioning keeps its own copies.
    for await (const blob of c.listBlobsFlat({ prefix })) {
      await c.getBlobClient(blob.name).deleteIfExists({ deleteSnapshots: 'include' });
    }
  },
};

const driver = (): Driver => (blobStorageConfigured() ? blobDriver : diskDriver);

/** Where documents are kept, for the health check and start-up log. */
export const storageKind = (): 'azure-blob' | 'disk' => (blobStorageConfigured() ? 'azure-blob' : 'disk');

const customerKey = (customerId: Types.ObjectId, storedName: string) => `${String(customerId)}/${path.basename(storedName)}`;
const logoKey = (storedName: string) => `${SETTINGS_FOLDER}/${path.basename(storedName)}`;

// ---- Customer documents -------------------------------------------------------------

/** What the file's first bytes say it is: a known type, 'program', or null for anything else. */
async function sniff(filePath: string): Promise<string | null> {
  const fh = await fs.promises.open(filePath, 'r');
  const buf = Buffer.alloc(12);
  const { bytesRead: n } = await fh.read(buf, 0, 12, 0);
  await fh.close();
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
 * Store an uploaded temp file as one of the customer's documents. Returns file metadata.
 * Any document is accepted, except programs (detected from the contents, so renaming doesn't help).
 * The browser's claimed type is never trusted: unknown types are stored as application/octet-stream.
 * The temp file is removed either way.
 */
export async function storeCustomerFile(customerId: Types.ObjectId, field: string, file: Express.Multer.File): Promise<StoredFile> {
  try {
    const detected = await sniff(file.path);
    if (detected === 'program') throw new ApiError(400, BLOCKED_FILE_MESSAGE, field);
    const original = fileExtension(file.originalname);
    let ext = original ? `.${original}` : '';
    if (detected) ext = KNOWN_TYPES[detected] ?? ext;
    const storedName = `${field}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    const mime = detected ?? UNKNOWN_TYPE;
    await driver().putFile(customerKey(customerId, storedName), file.path, mime);
    return {
      originalName: path.basename(file.originalname).slice(0, 180),
      storedName,
      size: file.size,
      mime,
      uploadedAt: new Date(),
    };
  } finally {
    await fs.promises.rm(file.path, { force: true });
  }
}

/** Save a generated file (e.g. a demo document) as one of the customer's documents. */
export async function writeCustomerFile(
  customerId: Types.ObjectId,
  field: string,
  data: Buffer,
  originalName: string,
  mime: string,
  at = new Date()
): Promise<StoredFile> {
  const storedName = `${field}-${at.getTime()}-${crypto.randomBytes(4).toString('hex')}${KNOWN_TYPES[mime] ?? ''}`;
  await driver().putBuffer(customerKey(customerId, storedName), data, mime);
  return { originalName, storedName, size: data.length, mime, uploadedAt: at };
}

/** A stored customer document, or null if it's missing. */
export function openCustomerFile(customerId: Types.ObjectId, storedName: string): Promise<OpenedFile | null> {
  return driver().open(customerKey(customerId, storedName));
}

export function deleteCustomerFiles(customerId: Types.ObjectId): Promise<void> {
  return driver().removeFolder(`${String(customerId)}/`);
}

export async function cleanupTemp(files: Express.Multer.File[] | undefined): Promise<void> {
  await Promise.all((files ?? []).map((f) => fs.promises.rm(f.path, { force: true })));
}

// ---- Form logo ---------------------------------------------------------------------

export async function saveLogo(file: Express.Multer.File): Promise<{ storedName: string; mime: string }> {
  const storedName = `logo-${Date.now()}${LOGO_TYPES[file.mimetype] ?? ''}`;
  await driver().putBuffer(logoKey(storedName), file.buffer, file.mimetype);
  return { storedName, mime: file.mimetype };
}

export function openLogo(storedName: string): Promise<OpenedFile | null> {
  return driver().open(logoKey(storedName));
}

/** Send an opened file, ending the response cleanly if the storage stream fails halfway. */
export async function sendStoredFile(res: import('express').Response, file: OpenedFile): Promise<void> {
  if (file.size !== undefined) res.setHeader('Content-Length', String(file.size));
  await new Promise<void>((resolve, reject) => {
    file.stream.on('error', (err) => {
      if (res.headersSent) {
        res.destroy(err);
        resolve();
      } else reject(err);
    });
    res.on('close', () => {
      file.stream.destroy();
      resolve();
    });
    file.stream.pipe(res);
  });
}
