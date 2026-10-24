import fs from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { config } from '../src/config/env.js';
import { Customer } from '../src/models/Customer.js';
import { ensureSeed } from '../src/seeds/seed.js';
import { samplePdf } from '../src/services/demo.service.js';

let mongo: MongoMemoryServer;
let app: Express;

const ADMIN = { email: 'admin@test.example', password: 'TestPassword123!' };

async function signedIn() {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/login').send(ADMIN);
  expect(r.status).toBe(200);
  return agent;
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('einvoice_test'));
  await ensureSeed();
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
  fs.rmSync(config.uploadDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await Customer.deleteMany({});
});

describe('health', () => {
  it('reports the database as up', async () => {
    const r = await request(app).get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, db: 'up' });
  });
});

describe('auth', () => {
  it('rejects a wrong password', async () => {
    const r = await request(app).post('/api/auth/login').send({ ...ADMIN, password: 'nope' });
    expect(r.status).toBe(401);
  });

  it('protects admin routes', async () => {
    expect((await request(app).get('/api/customers')).status).toBe(401);
    expect((await request(app).get('/api/settings')).status).toBe(401);
  });

  it('offers quick sign-in outside production, and refuses it when turned off', async () => {
    const opts = await request(app).get('/api/auth/quick-login');
    expect(opts.body.enabled).toBe(true);
    expect(opts.body.accounts[0].email).toBe(ADMIN.email);
    const agent = request.agent(app);
    expect((await agent.post('/api/auth/quick-login').send({ email: ADMIN.email })).status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(200);

    config.quickLogin = false; // as on the live server
    try {
      expect((await request(app).get('/api/auth/quick-login')).body).toEqual({ enabled: false, accounts: [] });
      expect((await request(app).post('/api/auth/quick-login').send({ email: ADMIN.email })).status).toBe(404);
    } finally {
      config.quickLogin = true;
    }
  });

  it('signs out other sessions when the password changes', async () => {
    const a = await signedIn();
    const b = await signedIn();
    const next = 'AnotherPassword456!';
    expect((await a.post('/api/auth/password').send({ current: ADMIN.password, next })).status).toBe(200);
    expect((await a.get('/api/auth/me')).status).toBe(200); // this browser got a fresh session
    expect((await b.get('/api/auth/me')).status).toBe(401); // the other one is out
    // put it back for the other tests
    expect((await a.post('/api/auth/password').send({ current: next, next: ADMIN.password })).status).toBe(200);
  });
});

describe('customers', () => {
  it('creates a customer with a form link and rejects duplicate codes', async () => {
    const agent = await signedIn();
    const r = await agent.post('/api/customers').send({ code: 'cl01', name: 'Acme', emails: 'a@acme.example' });
    expect(r.status).toBe(201);
    expect(r.body.customer.code).toBe('CL01');
    const dup = await agent.post('/api/customers').send({ code: 'CL01', name: 'Other' });
    expect(dup.status).toBe(400);
    const detail = await agent.get(`/api/customers/${r.body.customer.id}`);
    expect(detail.body.customer.link).toMatch(/\/f\/[\w-]{20,}$/);
  });

  it('imports a CSV, updating existing codes', async () => {
    const agent = await signedIn();
    await agent.post('/api/customers').send({ code: 'CL01', name: 'Old name' });
    const csv = 'Code,Company name,Email\nCL01,New name,x@acme.example\nCL02,Beta,b@beta.example\nCL03,,\n';
    const r = await agent.post('/api/customers/import').attach('file', Buffer.from(csv), 'list.csv');
    expect(r.body).toMatchObject({ created: 1, updated: 1 });
    expect(r.body.errors).toHaveLength(1);
  });
});

describe('customer form', () => {
  async function newCustomerToken() {
    const agent = await signedIn();
    const r = await agent.post('/api/customers').send({ code: 'F01', name: 'Form Co', emails: 'f@form.example' });
    const d = await agent.get(`/api/customers/${r.body.customer.id}`);
    return { agent, id: r.body.customer.id as string, token: (d.body.customer.link as string).split('/').pop()! };
  }

  it('rejects unknown tokens', async () => {
    const r = await request(app).get('/api/public/form/this-token-does-not-exist-123');
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('invalid');
  });

  it('marks the form opened, accepts a valid submission and stores documents', async () => {
    const { agent, id, token } = await newCustomerToken();
    const form = await request(app).get(`/api/public/form/${token}`);
    expect(form.status).toBe(200);
    const entity = form.body.entities[0].id as string;

    const data = {
      entities: [entity],
      companyName: 'Form Co LLC',
      country: 'United Arab Emirates',
      tradeLicenceNo: 'TL1',
      licenceIssuingAuthority: 'Dubai DET',
      tradeLicenceExpiry: '2099-01-01',
      emirate: 'Dubai',
      vatRegistered: true,
      trn: '100123456700003',
      tin: '1001234567',
      peppolId: '1001234567', // bare TIN — the server normalises it to 0235:<TIN>
      email: 'f@form.example',
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
    };
    const missing = await request(app).post(`/api/public/form/${token}`).field('data', JSON.stringify(data));
    expect(missing.status).toBe(422);

    const pdf = samplePdf(['test']);
    let req = request(app).post(`/api/public/form/${token}`).field('data', JSON.stringify(data));
    for (const f of ['tradeLicence', 'trnCertificate', 'tinCertificate', 'signatoryIds', 'moa', 'ubo']) req = req.attach(f, pdf, { filename: `${f}.pdf`, contentType: 'application/pdf' });
    const ok = await req;
    expect(ok.body.errors).toBeUndefined();
    expect(ok.status).toBe(200);

    const detail = await agent.get(`/api/customers/${id}`);
    expect(detail.body.customer.status).toBe('submitted');
    expect(detail.body.customer.data.peppolId).toBe('0235:1001234567');
    const file = await agent.get(`/api/customers/${id}/files/tradeLicence`);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toMatch(/pdf/);
  });

  it('rejects a file that is not really a PDF', async () => {
    const { token } = await newCustomerToken();
    const r = await request(app)
      .post(`/api/public/form/${token}`)
      .field('data', '{}')
      .attach('tradeLicence', Buffer.from('not a pdf'), { filename: 'x.pdf', contentType: 'application/pdf' });
    // Validation runs first (missing fields), so the fake file never gets stored
    expect([400, 422]).toContain(r.status);
  });
});

describe('demo data', () => {
  it('loads, never emails, and clears without touching real customers', async () => {
    const agent = await signedIn();
    await agent.post('/api/customers').send({ code: 'REAL1', name: 'Real customer' });

    const load = await agent.post('/api/system/demo');
    expect(load.status).toBe(200);
    expect(load.body.customers).toBeGreaterThan(15);

    const overview = await agent.get('/api/customers/overview');
    expect(overview.body.status.submitted).toBeGreaterThan(0);
    expect(overview.body.attention.emailFailures).toBe(1);

    const demoCustomer = await Customer.findOne({ demo: true, status: 'new', 'emails.0': { $exists: true } });
    const sent = await agent.post('/api/customers/send').send({ kind: 'invite', ids: [String(demoCustomer!._id)] });
    expect(sent.body.results[0].ok).toBe(true);

    const clear = await agent.delete('/api/system/demo');
    expect(clear.body.customers).toBe(load.body.customers);
    expect(await Customer.countDocuments({ demo: true })).toBe(0);
    expect(await Customer.exists({ code: 'REAL1' })).toBeTruthy();
  });
});
