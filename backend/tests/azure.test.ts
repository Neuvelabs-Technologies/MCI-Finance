// What production on MCI's Azure App Service relies on: Microsoft sign-in, documents in Blob
// storage, the DocumentDB database name, Azure's X-Forwarded-For format and the built-in frontend.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { ContainerClient } from '@azure/storage-blob';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { config, configProblems } from '../src/config/env.js';
import { databaseName } from '../src/config/db.js';
import { Admin } from '../src/models/Admin.js';
import { AuditLog } from '../src/models/AuditLog.js';
import { ensureSeed } from '../src/seeds/seed.js';
import { samplePdf } from '../src/services/demo.service.js';
import { resetSigningKeyCache } from '../src/services/microsoft-auth.service.js';
import { setBlobContainerForTests } from '../src/services/storage.service.js';
import { stripPort } from '../src/utils/client-ip.js';

let mongo: MongoMemoryServer;
let app: Express;
const ADMIN = { email: 'admin@test.example', password: 'TestPassword123!' };

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('einvoice_azure_test'));
  await ensureSeed();
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
  fs.rmSync(config.uploadDir, { recursive: true, force: true });
});

describe('database name', () => {
  const docdb = 'mongodb+srv://u:p@docdb-finance-prod-001.mongocluster.cosmos.azure.com/?tls=true&retrywrites=false';
  it("uses 'finance' when the URI names no database (MCI's DocumentDB URI)", () => {
    expect(databaseName(docdb, '')).toBe('finance');
    expect(databaseName('mongodb://localhost:27017', '')).toBe('finance');
  });
  it('leaves a database named in the URI alone', () => {
    expect(databaseName('mongodb://mongo:27017/mci_einvoice', '')).toBeUndefined();
    expect(databaseName('mongodb://u:p@h1,h2/mci_einvoice?replicaSet=rs', '')).toBeUndefined();
  });
  it('MONGODB_DB wins', () => {
    expect(databaseName(docdb, 'other')).toBe('other');
  });
});

describe('production on Azure stores files in Blob only', () => {
  it('refuses to start on App Service without Blob storage', () => {
    const saved = { isProd: config.isProd, onAzure: config.onAzureAppService, jwt: config.jwtSecret };
    Object.assign(config, { isProd: true, onAzureAppService: true, jwtSecret: 'x'.repeat(40) });
    try {
      expect(configProblems().join(' ')).toMatch(/Blob storage/);
      config.azureStorage.endpoint = 'https://example.blob.core.windows.net/';
      expect(configProblems().join(' ')).not.toMatch(/Blob storage/);
    } finally {
      config.azureStorage.endpoint = '';
      Object.assign(config, { isProd: saved.isProd, onAzureAppService: saved.onAzure, jwtSecret: saved.jwt });
    }
  });
});

describe('client IP behind Azure', () => {
  it('strips the port Azure adds to X-Forwarded-For', () => {
    expect(stripPort('1.2.3.4:56789')).toBe('1.2.3.4');
    expect(stripPort(' 1.2.3.4 ')).toBe('1.2.3.4');
    expect(stripPort('[2001:db8::1]:443')).toBe('2001:db8::1');
    expect(stripPort('2001:db8::1')).toBe('2001:db8::1');
  });
});

// ---- Microsoft sign-in, against a stand-in for login.microsoftonline.com ----------------

describe('Microsoft sign-in', () => {
  const TENANT = 'tenant-0000-test';
  const CLIENT = 'client-0000-test';
  const KID = 'test-key-1';
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  let server: http.Server;
  let authority = '';
  // What the stand-in puts in the next ID token; tests change it.
  let nextClaims: Record<string, unknown> = {};
  let tokenRequests: URLSearchParams[] = [];
  const saved = { ...config.microsoft };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === `/${TENANT}/discovery/v2.0/keys`) {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: KID, use: 'sig' }] }));
        return;
      }
      if (req.url === `/${TENANT}/oauth2/v2.0/token` && req.method === 'POST') {
        let body = '';
        req.on('data', (c: Buffer) => (body += c.toString()));
        req.on('end', () => {
          const form = new URLSearchParams(body);
          tokenRequests.push(form);
          res.setHeader('content-type', 'application/json');
          if (form.get('code') !== 'good-code') {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'invalid_grant' }));
            return;
          }
          const idToken = jwt.sign({ tid: TENANT, ...nextClaims }, privateKey, {
            algorithm: 'RS256',
            keyid: KID,
            audience: CLIENT,
            issuer: `${authority}/${TENANT}/v2.0`,
            expiresIn: '5m',
          });
          res.end(JSON.stringify({ id_token: idToken }));
        });
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    authority = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    Object.assign(config.microsoft, {
      tenantId: TENANT,
      clientId: CLIENT,
      clientSecret: 'secret',
      redirectUri: 'https://finance.test/auth/callback',
      authority,
    });
    resetSigningKeyCache();
  });

  afterAll(async () => {
    Object.assign(config.microsoft, saved);
    config.passwordLoginSetting = true;
    await new Promise((r) => server.close(r));
  });

  afterEach(() => {
    tokenRequests = [];
  });

  /** Runs the browser's side: start, "visit Microsoft", come back with a code. */
  async function signIn(claims: Record<string, unknown>, { code = 'good-code', tamperState = false } = {}) {
    const start = await request(app).post('/api/auth/microsoft/start');
    expect(start.status).toBe(200);
    const url = new URL(start.body.url as string);
    const tx = jwt.decode(start.body.transaction as string) as { nonce: string };
    nextClaims = { nonce: tx.nonce, ...claims };
    const agent = request.agent(app);
    const res = await agent
      .post('/api/auth/microsoft/callback')
      .send({ code, state: tamperState ? 'other-state' : url.searchParams.get('state'), transaction: start.body.transaction });
    return { res, agent, url };
  }

  it('offers Microsoft on the sign-in page once it is set up', async () => {
    const r = await request(app).get('/api/auth/options');
    expect(r.body).toEqual({ microsoft: true, password: true });
  });

  it('sends the browser to Microsoft with PKCE and the redirect URI', async () => {
    const r = await request(app).post('/api/auth/microsoft/start');
    const url = new URL(r.body.url as string);
    expect(url.origin + url.pathname).toBe(`${authority}/${TENANT}/oauth2/v2.0/authorize`);
    expect(url.searchParams.get('client_id')).toBe(CLIENT);
    expect(url.searchParams.get('redirect_uri')).toBe('https://finance.test/auth/callback');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
  });

  it('creates an admin on first sign-in and starts a session', async () => {
    const { res, agent } = await signIn({ oid: 'oid-new-1', email: 'Clifford@WeAreMCI.com', name: 'Clifford' });
    expect(res.status).toBe(200);
    expect(res.body.admin).toMatchObject({ email: 'clifford@wearemci.com', name: 'Clifford', microsoft: true });
    expect(tokenRequests[0]?.get('client_secret')).toBe('secret');
    expect(tokenRequests[0]?.get('code_verifier')).toBeTruthy();
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.signIn).toEqual({ microsoft: true, password: true });

    // Next time: the same account, found by oid even if the email changed.
    const again = await signIn({ oid: 'oid-new-1', email: 'clifford.new@wearemci.com', name: 'Clifford' });
    expect(again.res.status).toBe(200);
    expect(await Admin.countDocuments({ microsoftId: 'oid-new-1' })).toBe(1);
  });

  it('links an existing admin with the same email instead of creating another', async () => {
    const before = await Admin.countDocuments();
    const { res } = await signIn({ oid: 'oid-seed', preferred_username: ADMIN.email, name: 'Finance Admin' });
    expect(res.status).toBe(200);
    expect(await Admin.countDocuments()).toBe(before);
    expect((await Admin.findOne({ email: ADMIN.email }))?.microsoftId).toBe('oid-seed');
  });

  it('refuses a response that does not match the sign-in it started', async () => {
    const { res } = await signIn({ oid: 'oid-x', email: 'x@wearemci.com' }, { tamperState: true });
    expect(res.status).toBe(400);
    expect(tokenRequests).toHaveLength(0);
  });

  it('refuses an ID token for another sign-in (nonce) or another tenant', async () => {
    expect((await signIn({ oid: 'oid-y', email: 'y@wearemci.com', nonce: 'replayed' })).res.status).toBe(401);
    expect((await signIn({ oid: 'oid-y', email: 'y@wearemci.com', tid: 'other-tenant' })).res.status).toBe(401);
    expect(await Admin.exists({ email: 'y@wearemci.com' })).toBeNull();
    expect(await AuditLog.exists({ action: 'admin.login_failed', 'details.reason': 'invalid_id_token' })).toBeTruthy();
  });

  it('reports a code Microsoft did not accept', async () => {
    expect((await signIn({ oid: 'oid-z', email: 'z@wearemci.com' }, { code: 'bad' })).res.status).toBe(401);
  });

  it('PASSWORD_LOGIN=false leaves only Microsoft', async () => {
    config.passwordLoginSetting = false;
    try {
      expect((await request(app).get('/api/auth/options')).body).toEqual({ microsoft: true, password: false });
      const r = await request(app).post('/api/auth/login').send(ADMIN);
      expect(r.status).toBe(403);
    } finally {
      config.passwordLoginSetting = true;
    }
  });

  it('PASSWORD_LOGIN=false is ignored while Microsoft is not set up, so nobody is locked out', async () => {
    const secret = config.microsoft.clientSecret;
    config.passwordLoginSetting = false;
    config.microsoft.clientSecret = '';
    try {
      expect((await request(app).get('/api/auth/options')).body).toEqual({ microsoft: false, password: true });
      expect((await request(app).post('/api/auth/microsoft/start')).status).toBe(503);
    } finally {
      config.passwordLoginSetting = true;
      config.microsoft.clientSecret = secret;
    }
  });
});

// ---- Documents in Azure Blob ----------------------------------------------------------------

/** Just enough of ContainerClient for the storage service, kept in memory. */
function fakeContainer() {
  const blobs = new Map<string, { data: Buffer; contentType?: string }>();
  const notFound = () => Object.assign(new Error('BlobNotFound'), { statusCode: 404 });
  const container = {
    getBlockBlobClient: (key: string) => ({
      uploadFile: async (p: string, o?: { blobHTTPHeaders?: { blobContentType?: string } }) => {
        blobs.set(key, { data: fs.readFileSync(p), contentType: o?.blobHTTPHeaders?.blobContentType });
      },
      uploadData: async (data: Buffer, o?: { blobHTTPHeaders?: { blobContentType?: string } }) => {
        blobs.set(key, { data: Buffer.from(data), contentType: o?.blobHTTPHeaders?.blobContentType });
      },
    }),
    getBlobClient: (key: string) => ({
      download: async () => {
        const b = blobs.get(key);
        if (!b) throw notFound();
        return { readableStreamBody: Readable.from(b.data), contentLength: b.data.length, contentType: b.contentType };
      },
      deleteIfExists: async () => ({ succeeded: blobs.delete(key) }),
    }),
    listBlobsFlat: ({ prefix = '' }: { prefix?: string } = {}) =>
      (async function* () {
        for (const name of [...blobs.keys()]) if (name.startsWith(prefix)) yield { name };
      })(),
  };
  return { blobs, container: container as unknown as ContainerClient };
}

describe('documents in Azure Blob', () => {
  const { blobs, container } = fakeContainer();

  beforeAll(() => {
    config.azureStorage.connectionString = 'UseDevelopmentStorage=true';
    setBlobContainerForTests(container);
  });
  afterAll(() => {
    config.azureStorage.connectionString = '';
    setBlobContainerForTests(undefined);
  });

  const validData = (entity: string) => ({
    entities: [entity],
    companyName: 'Blob Co LLC',
    country: 'United Arab Emirates',
    tradeLicenceNo: 'TL1',
    licenceIssuingAuthority: 'Dubai DET',
    tradeLicenceExpiry: '2099-01-01',
    emirate: 'Dubai',
    vatRegistered: true,
    trn: '100123456700003',
    tin: '1001234567',
    peppolId: '1001234567',
    email: 'b@blob.example',
    phone: '+971 4 123 4567',
    address: 'Dubai',
    bankName: 'Bank',
    bankBranch: 'Main',
    bankAddress: 'Dubai',
    iban: 'AE070331234567890123456',
    swift: 'EBILAEAD',
    bankContact: 'RM',
    declarantName: 'Jane',
    declarantDesignation: 'CFO',
    declaration: true,
  });

  it('stores a submission in Blob, serves it back, removes the temp files and deletes it with the customer', async () => {
    const agent = request.agent(app);
    expect((await agent.post('/api/auth/login').send(ADMIN)).status).toBe(200);
    const created = await agent.post('/api/customers').send({ code: 'BLOB1', name: 'Blob Co', emails: 'b@blob.example' });
    const id = created.body.customer.id as string;
    const token = ((await agent.get(`/api/customers/${id}`)).body.customer.link as string).split('/').pop()!;

    const form = await request(app).get(`/api/public/form/${token}`);
    let req = request(app).post(`/api/public/form/${token}`).field('data', JSON.stringify(validData(form.body.entities[0].id)));
    for (const f of ['tradeLicence', 'trnCertificate', 'tinCertificate', 'signatoryIds', 'moa', 'ubo'])
      req = req.attach(f, samplePdf([f]), { filename: `${f}.pdf`, contentType: 'application/pdf' });
    const ok = await req;
    expect(ok.body.errors).toBeUndefined();
    expect(ok.status).toBe(200);

    const keys = [...blobs.keys()].filter((k) => k.startsWith(`${id}/`));
    expect(keys).toHaveLength(6);
    expect(blobs.get(keys[0]!)?.contentType).toBe('application/pdf');
    // Nothing for this customer on local disk, and no temp files left behind
    expect(fs.existsSync(path.join(config.uploadDir, id))).toBe(false);
    expect(fs.readdirSync(path.join(config.uploadDir, 'tmp'))).toHaveLength(0);

    const file = await agent.get(`/api/customers/${id}/files/tradeLicence`).buffer(true);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toMatch(/pdf/);
    expect(file.body.subarray(0, 4).toString()).toBe('%PDF');

    expect((await agent.delete(`/api/customers/${id}`)).status).toBe(200);
    expect([...blobs.keys()].filter((k) => k.startsWith(`${id}/`))).toHaveLength(0);
  });

  it('keeps the form logo in Blob too', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send(ADMIN);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
    expect((await agent.post('/api/settings/logo').attach('logo', png, { filename: 'logo.png', contentType: 'image/png' })).status).toBe(200);
    expect([...blobs.keys()].some((k) => k.startsWith('_settings/logo-'))).toBe(true);
    const logo = await request(app).get('/api/public/logo');
    expect(logo.status).toBe(200);
    expect(logo.headers['content-type']).toMatch(/png/);
  });

  it('health check says where documents are kept', async () => {
    expect((await request(app).get('/api/health')).body.storage).toBe('azure-blob');
  });
});

// ---- The frontend served by Express ----------------------------------------------------------

describe('built frontend served from backend/public', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'einvoice-public-'));
  let web: Express;

  beforeAll(() => {
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><div id="root"></div>');
    fs.writeFileSync(path.join(dir, 'assets', 'app-abc123.js'), 'console.log(1)');
    web = createApp({ publicDir: dir });
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('loads the app for React routes, including the Microsoft callback', async () => {
    for (const p of ['/', '/admin', '/admin/customers/123', '/f/some-token', '/auth/callback?code=x&state=y']) {
      const r = await request(web).get(p);
      expect(r.status, p).toBe(200);
      expect(r.text).toContain('id="root"');
    }
  });

  it('caches hashed assets for good, but not index.html', async () => {
    expect((await request(web).get('/assets/app-abc123.js')).headers['cache-control']).toMatch(/immutable/);
    expect((await request(web).get('/admin')).headers['cache-control']).toMatch(/no-store/);
  });

  it('keeps JSON 404s for unknown API paths and missing assets', async () => {
    const api = await request(web).get('/api/nope');
    expect(api.status).toBe(404);
    expect(api.headers['content-type']).toMatch(/json/);
    expect((await request(web).get('/assets/old-build.js')).status).toBe(404);
  });

  it('the API still works alongside it', async () => {
    expect((await request(web).get('/api/health')).status).toBe(200);
  });
});
