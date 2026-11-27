import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { config } from '../src/config/env.js';
import { GroupPlForecast, GroupPlSetup } from '../src/models/GroupPl.js';
import { TallyLedger, TallyVoucher } from '../src/models/Tally.js';
import { COLUMN_KEYS } from '../src/modules/grouppl/chart.js';
import { type SetupInput, computeActual } from '../src/modules/grouppl/compute.js';
import { ensureSeed } from '../src/seeds/seed.js';

const col = (k: (typeof COLUMN_KEYS)[number]) => COLUMN_KEYS.indexOf(k);
const rowOf = (rows: { code: string; values: (number | null)[] }[], code: string) => rows.find((r) => r.code === code)!.values;

const LEDGERS = [
  { name: 'Event Revenue', parent: 'Revenue', groups: ['Revenue', 'Sales Accounts'] },
  { name: 'Event Direct Costs', parent: 'Direct Costs', groups: ['Direct Costs', 'Direct Expenses'] },
  { name: 'Office Rent', parent: 'Rent', groups: ['Rent', 'Office Costs', 'Indirect Expenses'] },
  { name: 'Salaries', parent: 'Staff', groups: ['Staff', 'Indirect Expenses'] },
  { name: 'Insurance', parent: 'Indirect Expenses', groups: ['Indirect Expenses'] },
  { name: 'Group Fees', parent: 'Indirect Expenses', groups: ['Indirect Expenses'] },
  { name: 'Sundry Exp', parent: 'Indirect Expenses', groups: ['Indirect Expenses'] },
];

const SETUP: SetupInput = {
  accounts: [
    { kind: 'group', name: 'Revenue', account: 'TURNOVER' },
    { kind: 'group', name: 'Direct Costs', account: 'COSTOFSALES' },
    { kind: 'group', name: 'Office Costs', account: 'A501.100' }, // two levels above Office Rent
    { kind: 'group', name: 'Staff', account: 'A500.110' },
    { kind: 'ledger', name: 'Insurance', account: 'A505.050' },
    { kind: 'ledger', name: 'Group Fees', account: 'A508.051' },
  ],
  projects: [
    { costCentre: 'P-Congress', serviceLine: 'pco' },
    { costCentre: 'P-Incentive', serviceLine: 'amc' },
  ],
  treatments: [],
  hr: [
    { year: 2026, serviceLine: 'pco', fte: 6, headcount: 6, sqm: 100 },
    { year: 2026, serviceLine: 'amc', fte: 2, headcount: 2, sqm: 100 },
    { year: 2026, serviceLine: 'corporate', fte: 2, headcount: 2, sqm: 0 },
    { year: 2026, serviceLine: 'specialty', fte: 0, headcount: 0, sqm: 0 },
  ],
};

// Tally signs: income credit (+), costs debit (-).
const AMOUNTS = [
  { ledger: 'Event Revenue', group: 'Sales Accounts', amount: 1000, centres: [{ name: 'P-Congress', amount: 600 }, { name: 'P-Incentive', amount: 300 }] },
  { ledger: 'Event Direct Costs', group: 'Direct Expenses', amount: -400, centres: [{ name: 'P-Congress', amount: -300 }, { name: 'P-Unknown', amount: -100 }] },
  { ledger: 'Office Rent', group: 'Indirect Expenses', amount: -200, centres: [] },
  { ledger: 'Salaries', group: 'Indirect Expenses', amount: -500, centres: [] },
  { ledger: 'Insurance', group: 'Indirect Expenses', amount: -90, centres: [] },
  { ledger: 'Group Fees', group: 'Indirect Expenses', amount: -50, centres: [] },
  { ledger: 'Sundry Exp', group: 'Indirect Expenses', amount: -7, centres: [] },
];

describe('computeActual', () => {
  const r = computeActual({ setup: SETUP, ledgers: LEDGERS, amounts: AMOUNTS, year: 2026 });

  it('places revenue and cost of sales by project, leaving the rest in Back-Office', () => {
    const t = rowOf(r.rows, 'TURNOVER');
    expect(t[col('pco')]).toBe(600);
    expect(t[col('amc')]).toBe(300);
    expect(t[col('backOffice')]).toBe(100); // no project
    expect(t[col('office')]).toBe(1000);
    const c = rowOf(r.rows, 'COSTOFSALES');
    expect(c[col('pco')]).toBe(-300);
    expect(c[col('backOffice')]).toBe(-100); // project without a service line
    expect(rowOf(r.rows, 'TOTALGM')[col('office')]).toBe(600);
    expect(r.warnings.unassignedProjects).toEqual([{ costCentre: 'P-Unknown', amount: -100 }]);
    expect(r.warnings.noProject).toBe(100);
  });

  it('spreads costs by FTE, m² and gross margin, and keeps HQ costs in Local HQ', () => {
    const sal = rowOf(r.rows, 'A500.110'); // mapped through its group, FTE 6:2:2:0
    expect([sal[col('pco')], sal[col('amc')], sal[col('corporate')], sal[col('specialty')]]).toEqual([300, 100, 100, 0]);
    const rent = rowOf(r.rows, 'A501.100'); // m² 100:100:0:0, mapped two groups up
    expect([rent[col('pco')], rent[col('amc')]]).toEqual([100, 100]);
    const ins = rowOf(r.rows, 'A505.050'); // GM per line: pco 600-300=300, amc 300 → 50:50
    expect([ins[col('pco')], ins[col('amc')]]).toEqual([45, 45]);
    const fees = rowOf(r.rows, 'A508.051');
    expect(fees[col('localHq')]).toBe(50);
    expect(fees[col('localMgmt')]).toBe(0);
    expect(fees[col('office')]).toBe(50);
  });

  it('works out totals, EBITDA, FTE and ratios, and lists unmapped ledgers', () => {
    expect(rowOf(r.rows, 'A500')[col('office')]).toBe(500);
    expect(rowOf(r.rows, 'TotalOpCosts')[col('office')]).toBe(840);
    expect(rowOf(r.rows, 'EBITDA')[col('office')]).toBe(600 - 840);
    expect(rowOf(r.rows, 'EBT')[col('office')]).toBe(-240);
    expect(rowOf(r.rows, 'TOT ANNUAL FTE')[col('office')]).toBe(10);
    expect(rowOf(r.rows, 'GMPERFTE')[col('office')]).toBe(60);
    expect(rowOf(r.rows, 'PRODRATIO')[col('office')]).toBeCloseTo(500 / 600, 4);
    expect(rowOf(r.rows, 'DELIVEREDGM')[col('office')]).toBeNull(); // forecast-only row
    expect(r.warnings.unmapped).toEqual([{ ledger: 'Sundry Exp', group: 'Indirect Expenses', amount: -7 }]);
    expect(r.detail['A500.110']).toEqual([{ ledger: 'Salaries', amount: 500 }]);
  });

  it('leaves amounts in Back-Office when a key has no basis, and follows changed treatments', () => {
    const noHr = computeActual({ setup: { ...SETUP, hr: [], treatments: [{ account: 'A505.050', treatment: 'corporate' }] }, ledgers: LEDGERS, amounts: AMOUNTS, year: 2026 });
    expect(rowOf(noHr.rows, 'A500.110')[col('backOffice')]).toBe(500);
    expect(noHr.warnings.missingBasis.sort()).toEqual(['fte', 'sqm']);
    expect(rowOf(noHr.rows, 'A505.050')[col('corporate')]).toBe(90);
    expect(rowOf(noHr.rows, 'TOT ANNUAL FTE')[col('office')]).toBeNull();
  });
});

// ---------------- API ----------------

let mongo: MongoMemoryServer;
let app: Express;
const ADMIN_EMAIL = 'admin@test.example';
const T = { source: 'gold', company: 'MCI DUBAI' };

async function signedIn() {
  const agent = request.agent(app);
  expect((await agent.post('/api/auth/quick-login').send({ email: ADMIN_EMAIL })).status).toBe(200);
  return agent;
}

/** A small file laid out like the group tool's P&L export. */
async function forecastFile(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Feuille1');
  ws.getCell('B7').value = 'Year';
  ws.getCell('C7').value = 2026;
  ws.getCell('D7').value = 'Current forecast';
  ws.getCell('E7').value = 'Forecast11';
  ws.getCell('M14').value = 'Management Entity\t     MCI DUBAI';
  ws.getRow(21).values = ['', 'Account', 'Row Style', '', '', '', '', '', '', '', '', '', 'Account', '', 'Office', 'Local HQ', 'Other Offices (SC)', 'Local Adjustments', 'Local Management', 'Back-Office', 'Business Service Lines', 'PCO/SME', 'AM&C', 'Corporate Division', 'Specialty'];
  ws.getRow(22).values = ['', 'TOTALGM', 'total', '', '', '', '', '', '', '', '', '', 'Total Gross Margin', '', 900, 0, 0, 0, 900, 0, 900, 500, 200, 100, 100];
  ws.getRow(23).values = ['', 'A500.110', '', '', '', '', '', '', '', '', '', '', 'Reference Salary', '', { formula: 'S23', result: 400 } as never, 0, 0, 0, 400, 0, 400, 200, 100, 50, 50];
  ws.getRow(24).values = ['', 'ZZZ.999', '', '', '', '', '', '', '', '', '', '', 'Something new', '', 1];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('grouppl_test'));
  await ensureSeed();
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  config.tally.users = [ADMIN_EMAIL];
  await Promise.all([TallyLedger.deleteMany({}), TallyVoucher.deleteMany({}), GroupPlSetup.deleteMany({}), GroupPlForecast.deleteMany({})]);
  await TallyLedger.create(
    LEDGERS.map((l, i) => ({ ...T, guid: `L${i}`, name: l.name, parent: l.parent, groups: l.groups, group: l.groups[l.groups.length - 1] }))
  );
  await TallyVoucher.create({
    ...T,
    guid: 'V1',
    date: new Date('2026-03-10'),
    baseType: 'Sales',
    entries: [
      { ledger: 'Acme', group: 'Sundry Debtors', amount: -1000 },
      { ledger: 'Event Revenue', group: 'Sales Accounts', amount: 1000, costCentres: [{ name: 'P-Congress', amount: 1000 }] },
    ],
  });
  await TallyVoucher.create({
    ...T,
    guid: 'V2',
    date: new Date('2026-03-11'),
    baseType: 'Payment',
    entries: [
      { ledger: 'Salaries', group: 'Indirect Expenses', amount: -400 },
      { ledger: 'Bank', group: 'Bank Accounts', amount: 400 },
    ],
  });
});

describe('group P&L API', () => {
  it('is closed to admins without Tally access', async () => {
    config.tally.users = [];
    const agent = await signedIn();
    expect((await agent.get(`/api/tally/group-pl?source=gold&company=${encodeURIComponent(T.company)}`)).status).toBe(403);
  });

  it('saves the setup, reports actuals, takes a forecast upload and exports Excel', async () => {
    const agent = await signedIn();
    const q = `source=gold&company=${encodeURIComponent(T.company)}&year=2026&month=12`;

    const s = await agent.get(`/api/tally/group-pl/setup?${q}`);
    expect(s.status).toBe(200);
    expect(s.body.ledgers.map((l: { name: string }) => l.name)).toContain('Salaries');
    expect(s.body.costCentres).toEqual([expect.objectContaining({ name: 'P-Congress', amount: 1000 })]);

    const saved = await agent.put('/api/tally/group-pl/setup').send({
      ...T,
      accounts: [
        { kind: 'group', name: 'Revenue', account: 'TURNOVER' },
        { kind: 'ledger', name: 'Salaries', account: 'A500.110' },
        { kind: 'ledger', name: 'Bad', account: 'EBITDA' }, // not a leaf: dropped
      ],
      projects: [{ costCentre: 'P-Congress', serviceLine: 'pco' }],
      treatments: [{ account: 'A500.110', treatment: 'fte' }], // same as default: not stored
      hr: [{ year: 2026, serviceLine: 'pco', fte: 4, headcount: 4, sqm: 50 }],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.setup.accounts).toHaveLength(2);
    expect(saved.body.setup.treatments).toHaveLength(0);

    const up = await agent.post('/api/tally/group-pl/forecast').field('source', 'gold').field('company', T.company).attach('file', await forecastFile(), 'forecast.xlsx');
    expect(up.status).toBe(200);
    expect(up.body).toMatchObject({ year: 2026, label: 'Forecast11', entity: 'MCI DUBAI', rows: 2, unknownCodes: ['ZZZ.999'] });

    const r = await agent.get(`/api/tally/group-pl?${q}`);
    expect(r.status).toBe(200);
    expect(r.body.periodLabel).toBe('January–December 2026');
    const actual = r.body.actual.rows as { code: string; values: number[] }[];
    expect(rowOf(actual, 'TOTALGM')[col('pco')]).toBe(1000);
    expect(rowOf(actual, 'A500.110')[col('pco')]).toBe(400); // all FTE is PCO
    expect(rowOf(actual, 'EBITDA')[col('office')]).toBe(600);
    expect(rowOf(r.body.forecast.rows, 'A500.110')[col('office')]).toBe(400);
    expect(r.body.setupStatus).toEqual({ accounts: 2, projects: 1, hrYear: true });

    const x = await agent.get(`/api/tally/group-pl/export?${q}`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(x.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(x.body as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Actual', 'Forecast', 'Actual vs Forecast']);
  });

  it('keeps cost centres and group chains sent by connector 1.2.0', async () => {
    config.tally.connectorKey = 'test-connector-key-that-is-long-enough-123';
    config.tally.allowedIps = [];
    const post = (path: string, body: object) => request(app).post(`/api/tally/connector${path}`).set('x-tally-key', config.tally.connectorKey).send(body);
    expect((await post('/ledgers', { ...T, ledgers: [{ guid: 'LX', name: 'Rent X', parent: 'Rent', group: 'Indirect Expenses', groups: ['Rent', 'Office Costs', 'Indirect Expenses'] }] })).status).toBe(200);
    const v = { guid: 'VX', alterId: 1, date: '20260401', entries: [{ ledger: 'Rent X', group: 'Indirect Expenses', amount: -10, costCentres: [{ name: 'P1', amount: -10 }, { name: '', amount: 1 }] }] };
    expect((await post('/vouchers', { ...T, vouchers: [v] })).status).toBe(200);
    expect((await TallyLedger.findOne({ guid: 'LX' }).lean())?.groups).toEqual(['Rent', 'Office Costs', 'Indirect Expenses']);
    expect((await TallyVoucher.findOne({ guid: 'VX' }).lean())?.entries[0].costCentres).toEqual([{ name: 'P1', amount: -10 }]);
  });

  it('refuses a file without a P&L table', async () => {
    const agent = await signedIn();
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('x').getCell('A1').value = 'hello';
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const up = await agent.post('/api/tally/group-pl/forecast').field('source', 'gold').field('company', T.company).attach('file', buf, 'x.xlsx');
    expect(up.status).toBe(400);
  });
});
