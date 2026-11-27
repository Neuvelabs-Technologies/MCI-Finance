import type { Request, Response } from 'express';
import { currentAdmin } from '../../middlewares/auth.middleware.js';
import { GroupPlForecast, GroupPlSetup, type IGroupPlSetup } from '../../models/GroupPl.js';
import { TallyLedger, TallyVoucher } from '../../models/Tally.js';
import { badRequest } from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { isId, str, XLSX_MIME } from '../../utils/http.js';
import { target } from '../tally/tally.connector.js';
import { hiddenLedgerNames, hiddenState } from '../tally/tally.hidden.js';
import { CHART, COLUMNS, LEAVES, ROW_BY_CODE, SERVICE_LINES, TREATMENTS } from './chart.js';
import { type LedgerAmount, PL_GROUPS, computeActual } from './compute.js';
import { buildGroupPlWorkbook, parseForecast } from './excel.js';

// /api/tally/group-pl/* — MCI Group's management P&L: actual from Tally vs the uploaded forecast.
// Same access as the Tally dashboard (signed-in admins with Tally access).

const live = { deletedInTally: { $ne: true } };
const counted = { ...live, cancelled: { $ne: true }, optional: { $ne: true } };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Year and last month of the actual (year to date): this month for the current year, else December. */
function yearMonth(q: Request['query']) {
  const now = new Date();
  const year = Number(q.year) || now.getUTCFullYear();
  if (year < 2000 || year > 2100) throw badRequest('year is out of range');
  const defMonth = year === now.getUTCFullYear() ? now.getUTCMonth() + 1 : 12;
  const month = Math.min(Math.max(Number(q.month) || defMonth, 1), 12);
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year, month, 1) - 1);
  const label = month === 1 ? `January ${year}` : `January–${MONTHS[month - 1]} ${year}`;
  return { year, month, from, to, label };
}

const emptySetup = (): Pick<IGroupPlSetup, 'accounts' | 'projects' | 'treatments' | 'hr'> => ({ accounts: [], projects: [], treatments: [], hr: [] });

/** Each ledger's total for the period, with its split over cost centres. */
async function ledgerAmounts(match: Record<string, unknown>, hidden: string[]): Promise<LedgerAmount[]> {
  const [totals, centres] = await Promise.all([
    TallyVoucher.aggregate<{ _id: string; group: string; amount: number }>([
      { $match: match },
      { $unwind: '$entries' },
      { $match: { 'entries.ledger': { $nin: hidden } } },
      { $group: { _id: '$entries.ledger', group: { $first: '$entries.group' }, amount: { $sum: '$entries.amount' } } },
    ]),
    TallyVoucher.aggregate<{ _id: { ledger: string; centre: string }; amount: number }>([
      { $match: { ...match, 'entries.costCentres.0': { $exists: true } } },
      { $unwind: '$entries' },
      { $match: { 'entries.ledger': { $nin: hidden } } },
      { $unwind: '$entries.costCentres' },
      { $group: { _id: { ledger: '$entries.ledger', centre: '$entries.costCentres.name' }, amount: { $sum: '$entries.costCentres.amount' } } },
    ]),
  ]);
  const byLedger = new Map<string, { name: string; amount: number }[]>();
  for (const c of centres) {
    const list = byLedger.get(c._id.ledger) ?? [];
    list.push({ name: c._id.centre, amount: c.amount });
    byLedger.set(c._id.ledger, list);
  }
  return totals.map((t) => ({ ledger: t._id, group: t.group ?? '', amount: t.amount, centres: byLedger.get(t._id) ?? [] }));
}

async function load(req: Request) {
  const t = target(req.query);
  const p = yearMonth(req.query);
  const hidden = await hiddenLedgerNames(t);
  const [setupDoc, ledgers, amounts, forecasts] = await Promise.all([
    GroupPlSetup.findOne(t).lean(),
    TallyLedger.find({ ...t, ...live, name: { $nin: hidden } }).select('name parent groups').lean(),
    ledgerAmounts({ ...t, ...counted, date: { $gte: p.from, $lte: p.to } }, hidden),
    GroupPlForecast.find({ ...t, year: p.year }).select('-rows').sort({ uploadedAt: -1 }).lean(),
  ]);
  const setup = setupDoc ?? emptySetup();
  const actual = computeActual({ setup, ledgers, amounts, year: p.year });
  const wantedId = str(req.query.forecastId);
  const chosen = (isId(wantedId) && forecasts.find((f) => String(f._id) === wantedId)) || forecasts[0];
  const forecast = chosen ? await GroupPlForecast.findById(chosen._id).lean() : null;
  return { t, p, setup, actual, forecast, forecasts };
}

/** GET /api/tally/group-pl?source=&company=&year=&month=&forecastId= */
export async function report(req: Request, res: Response) {
  const { t, p, setup, actual, forecast, forecasts } = await load(req);
  const hrYear = setup.hr.some((h) => h.year === p.year);
  res.json({
    ...t,
    year: p.year,
    month: p.month,
    periodLabel: p.label,
    columns: COLUMNS,
    chart: CHART.map((r) => ({ code: r.code, name: r.name, style: r.style, kind: r.kind })),
    actual,
    forecast: forecast
      ? { id: String(forecast._id), label: forecast.label, version: forecast.version, entity: forecast.entity, fileName: forecast.fileName, uploadedAt: forecast.uploadedAt, uploadedBy: forecast.uploadedBy, rows: forecast.rows }
      : null,
    forecasts: forecasts.map((f) => ({ id: String(f._id), label: f.label, fileName: f.fileName, uploadedAt: f.uploadedAt, uploadedBy: f.uploadedBy })),
    setupStatus: { accounts: setup.accounts.length, projects: setup.projects.length, hrYear },
  });
}

/** GET /api/tally/group-pl/export — the same as an Excel workbook (Actual, Forecast, Actual vs Forecast). */
export async function exportXlsx(req: Request, res: Response) {
  const { t, p, actual, forecast } = await load(req);
  const notes: string[] = [];
  if (actual.warnings.unmapped.length) notes.push(`${actual.warnings.unmapped.length} Tally ledger(s) not yet mapped to a group account are left out.`);
  if (actual.warnings.missingBasis.length) notes.push(`No ${actual.warnings.missingBasis.join(', ')} figures for ${p.year}: amounts using them stay in Back-Office.`);
  const buf = await buildGroupPlWorkbook({
    company: t.company,
    year: p.year,
    periodLabel: p.label,
    actual: new Map(actual.rows.map((r) => [r.code, r.values])),
    forecast: forecast ? new Map(forecast.rows.map((r) => [r.code, r.values])) : null,
    forecastLabel: forecast ? [forecast.label, forecast.version].filter(Boolean).join(' · ') || forecast.fileName : '',
    notes,
  });
  await audit(req, 'tally.grouppl_exported', { details: { ...t, year: p.year, month: p.month } });
  res.attachment(`group-pl-${t.company.replace(/[^\w-]+/g, '_')}-${p.year}-${String(p.month).padStart(2, '0')}.xlsx`);
  res.type(XLSX_MIME);
  res.send(buf);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** GET /api/tally/group-pl/setup?source=&company= — the setup, with what there is to map. */
export async function getSetup(req: Request, res: Response) {
  const t = target(req.query);
  const p = yearMonth(req.query);
  const deleted = await hiddenState(t);
  const hidden = deleted.ledgers.map((l) => l.name);
  const [setupDoc, ledgers, amounts, centres] = await Promise.all([
    GroupPlSetup.findOne(t).lean(),
    TallyLedger.find({ ...t, ...live, name: { $nin: hidden } }).select('name parent group groups').sort({ name: 1 }).lean(),
    ledgerAmounts({ ...t, ...counted, date: { $gte: p.from, $lte: p.to } }, hidden),
    TallyVoucher.aggregate<{ _id: string; amount: number; lines: number; last: Date }>([
      { $match: { ...t, ...counted, 'entries.costCentres.0': { $exists: true } } },
      { $unwind: '$entries' },
      { $match: { 'entries.ledger': { $nin: hidden } } },
      { $unwind: '$entries.costCentres' },
      { $group: { _id: '$entries.costCentres.name', amount: { $sum: '$entries.costCentres.amount' }, lines: { $sum: 1 }, last: { $max: '$date' } } },
      { $sort: { last: -1 } },
      { $limit: 5000 },
    ]),
  ]);
  const setup = setupDoc ?? emptySetup();
  const ytd = new Map(amounts.map((a) => [a.ledger, a.amount]));
  const mapped = new Set(setup.accounts.filter((a) => a.kind === 'ledger').map((a) => a.name));
  const byName = new Map(LEAVES.map((l) => [norm(l.name), l.code]));
  // Group accounts are P&L codes, so balance-sheet ledgers (banks, debtors…) are flagged: the screen leaves them out
  // unless asked. Those with a link already count as P&L so a link is never hidden.
  const isPl = (l: { name: string; group: string }) => PL_GROUPS.includes(l.group) || mapped.has(l.name);
  const groups = new Map<string, { above: string[]; pl: boolean; ledgers: number }>();
  for (const l of ledgers) {
    const chain = l.groups?.length ? l.groups : l.parent ? [l.parent] : [];
    chain.forEach((g, i) => {
      const cur = groups.get(g) ?? { above: chain.slice(i + 1), pl: false, ledgers: 0 };
      cur.ledgers += 1;
      cur.pl ||= isPl(l);
      groups.set(g, cur);
    });
  }
  res.json({
    ...t,
    year: p.year,
    setup: { accounts: setup.accounts, projects: setup.projects, treatments: setup.treatments, hr: setup.hr },
    accounts: LEAVES.map((l) => ({ code: l.code, name: l.name, treatment: l.treatment, income: !!l.income })),
    treatments: TREATMENTS,
    serviceLines: SERVICE_LINES,
    ledgers: ledgers.map((l) => {
      // Suggest an account when the ledger's name carries a code ("A501.100 Office rental") or equals an account name.
      const code = /\b(A5\d\d(?:\.\d{3})?)\b/.exec(l.name)?.[1];
      const suggested = (code && ROW_BY_CODE.get(code)?.kind === 'leaf' ? code : undefined) ?? byName.get(norm(l.name));
      return { name: l.name, parent: l.parent, group: l.group, groups: l.groups ?? [], pl: isPl(l), amount: Math.round((ytd.get(l.name) ?? 0) * 100) / 100, suggested: suggested ?? null };
    }),
    groups: [...groups].map(([name, g]) => ({ name, ...g })).sort((a, b) => a.name.localeCompare(b.name)),
    deleted: {
      groups: deleted.groups.map((name) => ({ name, ledgers: deleted.ledgers.filter((l) => l.byGroup === name).length })),
      ledgers: deleted.ledgers.map((l) => ({ name: l.name, group: l.group, closing: l.closing, entry: l.entry ?? null, byGroup: l.byGroup ?? null })),
    },
    costCentres: centres.map((c) => ({ name: c._id, amount: Math.round(c.amount * 100) / 100, lines: c.lines, last: c.last })),
  });
}

const text = (v: unknown, max = 200) => str(v).trim().slice(0, max);
function list(v: unknown, max: number, label: string): Record<string, unknown>[] {
  if (!Array.isArray(v)) throw badRequest(`${label} must be a list`);
  if (v.length > max) throw badRequest(`At most ${max} ${label}`);
  return v.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object');
}
const nonNeg = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : 0;
};

/** PUT /api/tally/group-pl/setup { source, company, accounts?, projects?, treatments?, hr? } — each list given replaces the saved one. */
export async function saveSetup(req: Request, res: Response) {
  const t = target(req.body);
  const body = req.body as Record<string, unknown>;
  const $set: Partial<IGroupPlSetup> = {};
  const leafDefault = new Map(LEAVES.map((l) => [l.code, l.treatment as string]));

  if (body.accounts !== undefined) {
    const seen = new Set<string>();
    $set.accounts = list(body.accounts, 20000, 'account mappings')
      .map((a) => ({ kind: a.kind === 'group' ? ('group' as const) : ('ledger' as const), name: text(a.name), account: text(a.account, 40) }))
      .filter((a) => a.name && leafDefault.has(a.account))
      .filter((a) => {
        const k = `${a.kind}\u0000${a.name}`;
        return seen.has(k) ? false : (seen.add(k), true);
      });
  }
  if (body.projects !== undefined) {
    const seen = new Set<string>();
    $set.projects = list(body.projects, 20000, 'projects')
      .map((p) => ({ costCentre: text(p.costCentre), serviceLine: text(p.serviceLine, 20) }))
      .filter((p) => p.costCentre && (SERVICE_LINES as readonly string[]).includes(p.serviceLine) && !seen.has(p.costCentre) && seen.add(p.costCentre));
  }
  if (body.treatments !== undefined) {
    $set.treatments = list(body.treatments, 1000, 'treatments')
      .map((x) => ({ account: text(x.account, 40), treatment: text(x.treatment, 20) }))
      .filter((x) => leafDefault.has(x.account) && (TREATMENTS as readonly string[]).includes(x.treatment) && leafDefault.get(x.account) !== x.treatment);
  }
  if (body.hr !== undefined) {
    const seen = new Set<string>();
    $set.hr = list(body.hr, 2000, 'HR rows')
      .map((h) => ({ year: Math.trunc(Number(h.year)), serviceLine: text(h.serviceLine, 20), fte: nonNeg(h.fte), headcount: nonNeg(h.headcount), sqm: nonNeg(h.sqm) }))
      .filter((h) => h.year >= 2000 && h.year <= 2100 && (SERVICE_LINES as readonly string[]).includes(h.serviceLine))
      .filter((h) => {
        const k = `${h.year}|${h.serviceLine}`;
        return seen.has(k) ? false : (seen.add(k), true);
      });
  }
  if (!Object.keys($set).length) throw badRequest('Nothing to save');
  const doc = await GroupPlSetup.findOneAndUpdate(
    t,
    { $set: { ...$set, updatedAt: new Date(), updatedBy: currentAdmin(req).email }, $setOnInsert: t },
    { upsert: true, returnDocument: 'after' }
  ).lean();
  const counts = Object.fromEntries(Object.entries($set).map(([k, v]) => [k, (v as unknown[]).length]));
  await audit(req, 'tally.grouppl_setup_saved', { details: { ...t, ...counts } });
  res.json({ setup: { accounts: doc!.accounts, projects: doc!.projects, treatments: doc!.treatments, hr: doc!.hr } });
}

/** POST /api/tally/group-pl/forecast (multipart: file, source, company, year?) — the group tool's P&L export. */
export async function uploadForecast(req: Request, res: Response) {
  const t = target(req.body);
  if (!req.file) throw badRequest('Choose the forecast Excel file');
  if (!/\.xlsx$/i.test(req.file.originalname)) throw badRequest('Only .xlsx files are supported');
  const parsed = await parseForecast(req.file.buffer);
  const year = parsed.year ?? (Number(req.body?.year) || null);
  if (!year || year < 2000 || year > 2100) throw badRequest('The file does not say which year it is for: choose the year and upload again', 'year');
  const doc = await GroupPlForecast.create({
    ...t,
    year,
    label: parsed.label,
    version: parsed.version,
    entity: parsed.entity,
    fileName: req.file.originalname.slice(0, 200),
    rows: parsed.rows,
    uploadedAt: new Date(),
    uploadedBy: currentAdmin(req).email,
  });
  await audit(req, 'tally.grouppl_forecast_uploaded', { details: { ...t, year, file: doc.fileName, label: parsed.label, rows: parsed.rows.length } });
  res.json({ id: String(doc._id), year, label: parsed.label, version: parsed.version, entity: parsed.entity, rows: parsed.rows.length, unknownCodes: parsed.unknownCodes });
}
