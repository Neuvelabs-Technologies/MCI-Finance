import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { config } from '../src/config/env.js';
import { Admin } from '../src/models/Admin.js';
import { TallyLedger, TallySync, TallyVoucher } from '../src/models/Tally.js';
import { ensureSeed } from '../src/seeds/seed.js';

let mongo: MongoMemoryServer;
let app: Express;

const KEY = 'test-connector-key-that-is-long-enough-123';
const ADMIN_EMAIL = 'admin@test.example';
const OTHER_EMAIL = 'other@test.example';
const T = { source: 'gold', company: 'MCI Middle East LLC' };

const LEDGERS = [
  { guid: 'L-SALES', name: 'Sales - Events', parent: 'Sales Accounts', group: 'Sales Accounts', opening: 0, closing: 15000 },
  { guid: 'L-RENT', name: 'Office Rent', parent: 'Indirect Expenses', group: 'Indirect Expenses', opening: 0, closing: -4000 },
  { guid: 'L-ACME', name: 'Acme Pharma', parent: 'Sundry Debtors', group: 'Sundry Debtors', opening: 0, closing: -9000 },
  { guid: 'L-BANK', name: 'ENBD Current', parent: 'Bank Accounts', group: 'Bank Accounts', opening: 0, closing: -2000 },
];

const VOUCHERS = [
  {
    guid: 'V-1',
    alterId: 10,
    date: '20260115',
    voucherType: 'Sales MCI',
    baseType: 'Sales',
    number: 'INV-001',
    party: 'Acme Pharma',
    entries: [
      { ledger: 'Acme Pharma', group: 'Sundry Debtors', amount: -10000 },
      { ledger: 'Sales - Events', group: 'Sales Accounts', amount: 10000 },
    ],
  },
  {
    guid: 'V-2',
    alterId: 11,
    date: '2026-02-03',
    voucherType: 'Sales MCI',
    baseType: 'Sales',
    number: 'INV-002',
    party: 'Acme Pharma',
    entries: [
      { ledger: 'Acme Pharma', group: 'Sundry Debtors', amount: -5000 },
      { ledger: 'Sales - Events', group: 'Sales Accounts', amount: 5000 },
    ],
  },
  {
    guid: 'V-3',
    alterId: 12,
    date: '20260205',
    voucherType: 'Payment',
    baseType: 'Payment',
    number: '7',
    party: 'Landlord',
    entries: [
      { ledger: 'Office Rent', group: 'Indirect Expenses', amount: -4000 },
      { ledger: 'ENBD Current', group: 'Bank Accounts', amount: 4000 },
    ],
  },
];

const connector = () => ({
  post: (path: string, body: unknown) => request(app).post(`/api/tally/connector${path}`).set('x-tally-key', KEY).send(body as object),
  get: (path: string) => request(app).get(`/api/tally/connector${path}`).set('x-tally-key', KEY),
});

async function signedInAs(email: string) {
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/quick-login').send({ email })).status).toBe(200);
  return agent;
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('tally_test'));
  await ensureSeed();
  await Admin.create({ email: OTHER_EMAIL, passwordHash: 'x' });
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  config.tally.connectorKey = KEY;
  config.tally.allowedIps = [];
  config.tally.users = [ADMIN_EMAIL];
  await Promise.all([TallyLedger.deleteMany({}), TallyVoucher.deleteMany({}), TallySync.deleteMany({})]);
  await Admin.updateMany({}, { $set: { tallyAccess: false } });
});

describe('tally connector intake', () => {
  it('refuses requests without the right key, or when no key is set up', async () => {
    expect((await request(app).post('/api/tally/connector/ledgers').send({ ...T, ledgers: [] })).status).toBe(401);
    expect((await request(app).post('/api/tally/connector/ledgers').set('x-tally-key', 'wrong').send({ ...T, ledgers: [] })).status).toBe(401);
    config.tally.connectorKey = '';
    expect((await connector().post('/ledgers', { ...T, ledgers: [] })).status).toBe(503);
  });

  it('refuses IPs outside TALLY_ALLOWED_IPS', async () => {
    config.tally.allowedIps = ['203.0.113.9'];
    expect((await connector().post('/ledgers', { ...T, ledgers: [] })).status).toBe(403);
  });

  it('adds, then updates, ledgers and vouchers without duplicates', async () => {
    const c = connector();
    const l = await c.post('/ledgers', { ...T, ledgers: LEDGERS });
    expect(l.status).toBe(200);
    expect(l.body).toMatchObject({ received: 4, added: 4 });
    expect((await c.post('/vouchers', { ...T, vouchers: VOUCHERS })).body).toMatchObject({ received: 3, added: 3 });

    // A changed voucher comes again with a higher alterId
    const changed = { ...VOUCHERS[0], alterId: 20, narration: 'Corrected' };
    expect((await c.post('/vouchers', { ...T, vouchers: [changed] })).body).toMatchObject({ added: 0, updated: 1 });
    expect(await TallyVoucher.countDocuments()).toBe(3);
    const v = await TallyVoucher.findOne({ guid: 'V-1' }).lean();
    expect(v).toMatchObject({ narration: 'Corrected', amount: 10000, baseType: 'Sales' });
    expect(v?.date.toISOString()).toBe('2026-01-15T00:00:00.000Z');

    const s = await c.get(`/state?source=gold&company=${encodeURIComponent(T.company)}`);
    expect(s.body.maxVoucherAlterId).toBe(20);
  });

  it('skips rows without a guid or date and rejects a bad source', async () => {
    const c = connector();
    const r = await c.post('/vouchers', { ...T, vouchers: [{ guid: '', date: '20260101' }, { guid: 'X', date: 'soon' }] });
    expect(r.body).toMatchObject({ received: 2, skipped: 2, added: 0 });
    expect((await c.post('/vouchers', { source: 'Gold Server!', company: 'x', vouchers: [] })).status).toBe(400);
  });

  it('flags records missing from Tally instead of deleting them, and refuses a suspiciously short list', async () => {
    const c = connector();
    await c.post('/vouchers', { ...T, vouchers: VOUCHERS });
    const r = await c.post('/present', { ...T, kind: 'voucher', guids: ['V-1', 'V-2'] });
    expect(r.body).toMatchObject({ flaggedDeleted: 1 });
    expect(await TallyVoucher.countDocuments()).toBe(3);
    expect((await TallyVoucher.findOne({ guid: 'V-3' }).lean())?.deletedInTally).toBe(true);
    // Back in Tally → back in reports
    expect((await c.post('/present', { ...T, kind: 'voucher', guids: ['V-1', 'V-2', 'V-3'] })).body).toMatchObject({ restored: 1 });
    expect((await c.post('/present', { ...T, kind: 'voucher', guids: [] })).status).toBe(400);

    await TallyVoucher.insertMany(Array.from({ length: 30 }, (_, i) => ({ ...T, guid: `B-${i}`, date: new Date() })));
    expect((await c.post('/present', { ...T, kind: 'voucher', guids: ['V-1'] })).status).toBe(400);
    expect(await TallyVoucher.countDocuments({ deletedInTally: true })).toBe(0);
  });
});

describe('tally dashboard', () => {
  async function load() {
    const c = connector();
    await c.post('/ledgers', { ...T, ledgers: LEDGERS });
    await c.post('/vouchers', { ...T, vouchers: VOUCHERS });
    await c.post('/sync-log', { ...T, ok: true, ledgers: 4, vouchers: 3, connectorVersion: '1.0.0', host: 'TALLY01' });
  }

  it('is only open to admins with Tally access', async () => {
    await load();
    expect((await request(app).get('/api/tally/companies')).status).toBe(401);
    const other = await signedInAs(OTHER_EMAIL);
    expect((await other.get('/api/tally/companies')).status).toBe(403);
    expect((await other.get('/api/auth/me')).body.admin.tally).toBe(false);

    const admin = await signedInAs(ADMIN_EMAIL);
    expect((await admin.get('/api/auth/me')).body.admin).toMatchObject({ tally: true, tallyFixed: true });
    const r = await admin.get('/api/tally/companies');
    expect(r.status).toBe(200);
    expect(r.body.companies).toHaveLength(1);
    expect(r.body.companies[0]).toMatchObject({ ...T, vouchers: 3 });
  });

  it('lets a Tally user give and take access, but not someone without it', async () => {
    const other = await signedInAs(OTHER_EMAIL);
    const admin = await signedInAs(ADMIN_EMAIL);
    const me = (await Admin.findOne({ email: ADMIN_EMAIL }))!;
    const them = (await Admin.findOne({ email: OTHER_EMAIL }))!;

    expect((await other.put(`/api/admins/${String(me._id)}/tally`).send({ enabled: true })).status).toBe(403);
    expect((await admin.put(`/api/admins/${String(them._id)}/tally`).send({ enabled: true })).body.admin.tally).toBe(true);
    expect((await other.get('/api/tally/companies')).status).toBe(200);
    expect((await admin.put(`/api/admins/${String(them._id)}/tally`).send({ enabled: false })).body.admin.tally).toBe(false);
    expect((await other.get('/api/tally/companies')).status).toBe(403);
    // TALLY_USERS access can't be removed in the app
    expect((await admin.put(`/api/admins/${String(me._id)}/tally`).send({ enabled: false })).status).toBe(400);
  });

  it('works out income, expenses and balances', async () => {
    await load();
    const admin = await signedInAs(ADMIN_EMAIL);
    const r = await admin.get(`/api/tally/summary?source=gold&company=${encodeURIComponent(T.company)}&from=2026-01-01&to=2026-12-31`);
    expect(r.status).toBe(200);
    expect(r.body.kpis).toEqual({ income: 15000, expenses: 4000, net: 11000, receivables: 9000, payables: 0, cash: 2000 });
    expect(r.body.monthly).toEqual([
      { month: '2026-01', income: 10000, expenses: 0 },
      { month: '2026-02', income: 5000, expenses: 4000 },
    ]);
    expect(r.body.topCustomers).toEqual([{ party: 'Acme Pharma', amount: 15000, count: 2 }]);
    expect(r.body.receivables[0]).toMatchObject({ name: 'Acme Pharma', amount: 9000 });

    // Period filter: February only
    const feb = await admin.get(`/api/tally/summary?source=gold&company=${encodeURIComponent(T.company)}&from=2026-02-01&to=2026-02-28`);
    expect(feb.body.kpis).toMatchObject({ income: 5000, expenses: 4000 });

    const v = await admin.get(`/api/tally/vouchers?source=gold&company=${encodeURIComponent(T.company)}&type=Sales&q=inv-002`);
    expect(v.body.total).toBe(1);
    expect(v.body.types).toEqual(['Payment', 'Sales']);
    const l = await admin.get(`/api/tally/ledgers?source=gold&company=${encodeURIComponent(T.company)}&group=Sundry%20Debtors`);
    expect(l.body.items.map((x: { name: string }) => x.name)).toEqual(['Acme Pharma']);
  });
});
