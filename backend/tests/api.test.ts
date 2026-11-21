import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { config } from '../src/config/env.js';
import { Customer } from '../src/models/Customer.js';
import { EmailMessage } from '../src/models/EmailMessage.js';
import { resendLinks } from '../src/modules/public-form/public-form.service.js';
import { ensureSeed } from '../src/seeds/seed.js';
import { samplePdf } from '../src/services/demo.service.js';

let mongo: MongoMemoryServer;
let app: Express;

const ADMIN = { email: 'admin@test.example', password: 'TestPassword123!' };

type Agent = ReturnType<typeof request.agent>;
let shared: Agent | undefined;

/**
 * A signed-in admin. Reuses one session unless `fresh` is asked for, because sign-in is
 * rate-limited (10 attempts per 15 minutes) exactly as it is in production.
 */
async function signedIn({ fresh = false } = {}): Promise<Agent> {
  if (shared && !fresh) return shared;
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/login').send(ADMIN);
  expect(r.status).toBe(200);
  if (!fresh) shared = agent;
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
    const a = await signedIn({ fresh: true });
    const b = await signedIn({ fresh: true });
    const next = 'AnotherPassword456!';
    expect((await a.post('/api/auth/password').send({ current: ADMIN.password, next })).status).toBe(200);
    expect((await a.get('/api/auth/me')).status).toBe(200); // this browser got a fresh session
    expect((await b.get('/api/auth/me')).status).toBe(401); // the other one is out
    // put it back for the other tests
    expect((await a.post('/api/auth/password').send({ current: next, next: ADMIN.password })).status).toBe(200);
    shared = a; // older sessions (including the shared one) were signed out
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

describe('vendors', () => {
  it('keeps customers and vendors in separate lists and counts', async () => {
    const agent = await signedIn();
    await agent.post('/api/customers').send({ code: 'C1', name: 'Customer One' });
    const v = await agent.post('/api/customers').send({ type: 'vendor', code: 'V1', name: 'Vendor One' });
    expect(v.status).toBe(201);
    expect(v.body.customer.type).toBe('vendor');

    const vendors = await agent.get('/api/customers?type=vendor');
    expect(vendors.body.items.map((x: { code: string }) => x.code)).toEqual(['V1']);
    const customers = await agent.get('/api/customers?type=customer');
    expect(customers.body.items.map((x: { code: string }) => x.code)).toEqual(['C1']);
    expect((await agent.get('/api/customers')).body.total).toBe(2);

    const stats = await agent.get('/api/customers/stats?type=vendor');
    expect(stats.body.total).toBe(1);
    expect(stats.body.types).toEqual({ customer: 1, vendor: 1 });
  });

  it('treats records saved before vendors existed as customers', async () => {
    await Customer.collection.insertOne({ code: 'OLD1', name: 'Legacy', emails: [], status: 'new', reviewStatus: 'pending', data: {}, files: {}, fileHistory: [], emailLog: [] });
    await ensureSeed();
    const agent = await signedIn();
    const r = await agent.get('/api/customers?type=customer');
    expect(r.body.items.map((x: { code: string }) => x.code)).toEqual(['OLD1']);
  });

  it('rejects a code already used by the other type, on create and on import', async () => {
    const agent = await signedIn();
    await agent.post('/api/customers').send({ code: 'X1', name: 'Customer' });
    const dup = await agent.post('/api/customers').send({ type: 'vendor', code: 'x1', name: 'Vendor' });
    expect(dup.status).toBe(400);
    expect(dup.body.error).toMatch(/customer/);

    const csv = 'Code,Company name,Email\nX1,Clash,c@clash.example\nV9,Fresh Vendor,v@fresh.example\n';
    const r = await agent.post('/api/customers/import').field('type', 'vendor').attach('file', Buffer.from(csv), 'vendors.csv');
    expect(r.body).toMatchObject({ created: 1, updated: 0 });
    expect(r.body.errors[0].reason).toMatch(/already exists as a customer/);
    expect((await Customer.findOne({ code: 'V9' }))?.type).toBe('vendor');
    expect((await Customer.findOne({ code: 'X1' }))?.name).toBe('Customer');
  });

  it('emails vendors with the vendor template', async () => {
    const agent = await signedIn();
    const v = await agent.post('/api/customers').send({ type: 'vendor', code: 'V2', name: 'Supplier', emails: 's@supplier.example' });
    const c = await agent.post('/api/customers').send({ code: 'C2', name: 'Client', emails: 'c@client.example' });
    await agent.post('/api/customers/send').send({ kind: 'invite', ids: [v.body.customer.id, c.body.customer.id] });
    const vendorMail = await EmailMessage.findOne({ customer: v.body.customer.id });
    const customerMail = await EmailMessage.findOne({ customer: c.body.customer.id });
    expect(vendorMail?.subject).toMatch(/Supplier Information Required – V2/);
    expect(customerMail?.subject).not.toMatch(/Supplier/);

    const form = await request(app).get(`/api/public/form/${(await Customer.findById(v.body.customer.id))!.token}`);
    expect(form.body.customer.type).toBe('vendor');
  });
});

describe('resend link', () => {
  it('answers the same for unknown and known addresses', async () => {
    const unknown = await request(app).post('/api/public/resend-link').send({ email: 'nobody@nowhere.example' });
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual({ ok: true });
    expect((await request(app).post('/api/public/resend-link').send({ email: 'not-an-email' })).status).toBe(400);
  });

  it('resends only to invited parties still pending, at most once per cooldown', async () => {
    const agent = await signedIn();
    const r = await agent.post('/api/customers').send({ type: 'vendor', code: 'V3', name: 'Supplier', emails: 'ap@supplier.example' });
    const id = r.body.customer.id as string;
    expect(await resendLinks('ap@supplier.example')).toBe(0); // never invited by finance yet

    await agent.post('/api/customers/send').send({ kind: 'invite', ids: [id] });
    expect(await resendLinks('AP@supplier.example')).toBe(0); // just emailed: cooldown

    await Customer.updateOne({ _id: id }, { $set: { 'emailLog.0.at': new Date(Date.now() - 31 * 60 * 1000) } });
    expect(await resendLinks('ap@supplier.example')).toBe(1);
    const mails = await EmailMessage.find({ customer: id }).sort({ at: 1 });
    expect(mails.at(-1)?.subject).toMatch(/Supplier/);

    await Customer.updateOne({ _id: id }, { $set: { status: 'submitted', 'emailLog.$[].at': new Date(0) } });
    expect(await resendLinks('ap@supplier.example')).toBe(0); // nothing left to fill in
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

  /** A complete, valid UAE submission. */
  const validData = (entity: string) => ({
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
  });

  const FIELDS = ['tradeLicence', 'trnCertificate', 'tinCertificate', 'signatoryIds', 'moa', 'ubo'];
  type Upload = { field: string; data: Buffer; filename: string; contentType?: string };

  /** Submit the form with a PDF for every document, replacing any given in `overrides`. */
  async function submit(token: string, overrides: Upload[] = []) {
    const form = await request(app).get(`/api/public/form/${token}`);
    const entity = form.body.entities[0].id as string;
    let req = request(app).post(`/api/public/form/${token}`).field('data', JSON.stringify(validData(entity)));
    for (const f of FIELDS) {
      const o = overrides.find((x) => x.field === f);
      req = o
        ? req.attach(f, o.data, { filename: o.filename, contentType: o.contentType ?? 'application/octet-stream' })
        : req.attach(f, samplePdf(['test']), { filename: `${f}.pdf`, contentType: 'application/pdf' });
    }
    return req;
  }

  const customerDir = (id: string) => path.join(config.uploadDir, id);

  it('marks the form opened, accepts a valid submission and stores documents', async () => {
    const { agent, id, token } = await newCustomerToken();
    const form = await request(app).get(`/api/public/form/${token}`);
    expect(form.status).toBe(200);

    const missing = await request(app).post(`/api/public/form/${token}`).field('data', JSON.stringify(validData(form.body.entities[0].id)));
    expect(missing.status).toBe(422);

    const ok = await submit(token);
    expect(ok.body.errors).toBeUndefined();
    expect(ok.status).toBe(200);

    const detail = await agent.get(`/api/customers/${id}`);
    expect(detail.body.customer.status).toBe('submitted');
    expect(detail.body.customer.data.peppolId).toBe('0235:1001234567');
    const file = await agent.get(`/api/customers/${id}/files/tradeLicence`);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toMatch(/pdf/);
    expect(file.headers['content-disposition']).toMatch(/^inline/);
  });

  it('accepts any document type and downloads non-PDF/image files instead of opening them', async () => {
    const { agent, id, token } = await newCustomerToken();
    const docx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64, 1)]); // zip container, like a .docx
    const r = await submit(token, [{ field: 'tradeLicence', data: docx, filename: 'Trade Licence.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }]);
    expect(r.status).toBe(200);

    const detail = await agent.get(`/api/customers/${id}`);
    expect(detail.body.customer.files.tradeLicence.mime).toBe('application/octet-stream');
    expect(detail.body.customer.files.tradeLicence.storedName).toMatch(/\.docx$/);

    const file = await agent.get(`/api/customers/${id}/files/tradeLicence`);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toMatch(/octet-stream/);
    expect(file.headers['content-disposition']).toMatch(/^attachment/);
    expect(file.headers['content-security-policy']).toBe('sandbox');
  });

  it('refuses programs by name', async () => {
    const { token } = await newCustomerToken();
    const r = await submit(token, [{ field: 'tradeLicence', data: Buffer.from('hello'), filename: 'setup.exe' }]);
    expect(r.status).toBe(400);
    expect(r.body.errors.tradeLicence).toMatch(/Programs and scripts/);
  });

  it('refuses a program renamed to look like a document', async () => {
    const { agent, id, token } = await newCustomerToken();
    const fake = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]);
    const r = await submit(token, [{ field: 'tradeLicence', data: fake, filename: 'licence.pdf', contentType: 'application/pdf' }]);
    expect(r.status).toBe(400);
    expect((await agent.get(`/api/customers/${id}`)).body.customer.status).not.toBe('submitted');
  });

  it('refuses uploads to a made-up link before storing anything', async () => {
    const tmp = path.join(config.uploadDir, 'tmp');
    const before = fs.readdirSync(tmp).length;
    const r = await request(app)
      .post('/api/public/form/this-token-does-not-exist-123')
      .field('data', '{}')
      .attach('tradeLicence', Buffer.alloc(1024 * 1024, 1), { filename: 'big.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(404);
    expect(fs.readdirSync(tmp).length).toBe(before);
  });

  it('deleting a customer removes their documents from disk', async () => {
    const { agent, id, token } = await newCustomerToken();
    expect((await submit(token)).status).toBe(200);
    expect(fs.existsSync(customerDir(id))).toBe(true);
    expect((await agent.delete(`/api/customers/${id}`)).status).toBe(200);
    expect(fs.existsSync(customerDir(id))).toBe(false);
  });

  it('bulk delete removes several customers and their documents', async () => {
    const agent = await signedIn();
    const ids: string[] = [];
    for (const code of ['B01', 'B02']) {
      const c = await agent.post('/api/customers').send({ code, name: `Bulk ${code}`, emails: `${code}@bulk.example` });
      const link = (await agent.get(`/api/customers/${c.body.customer.id}`)).body.customer.link as string;
      expect((await submit(link.split('/').pop()!)).status).toBe(200);
      ids.push(c.body.customer.id);
    }
    const keep = await agent.post('/api/customers').send({ code: 'KEEP', name: 'Keep me' });

    const r = await agent.post('/api/customers/delete').send({ ids: [...ids, 'not-an-id'] });
    expect(r.status).toBe(200);
    expect(r.body.deleted).toBe(2);
    for (const id of ids) expect(fs.existsSync(customerDir(id))).toBe(false);
    expect(await Customer.exists({ _id: keep.body.customer.id })).toBeTruthy();
    expect((await agent.post('/api/customers/delete').send({ ids: [] })).status).toBe(400);
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
