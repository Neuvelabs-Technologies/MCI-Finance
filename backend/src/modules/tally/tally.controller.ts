import type { NextFunction, Request, Response } from 'express';
import type { PipelineStage } from 'mongoose';
import { currentAdmin } from '../../middlewares/auth.middleware.js';
import { TallyLedger, TallySync, TallyVoucher } from '../../models/Tally.js';
import { escapeRegex, str } from '../../utils/http.js';
import { tallyDate, target } from './tally.connector.js';

// The Tally dashboard (signed-in admins with Tally access only).
// Tally amounts are credit-positive: income ledgers are positive, expenses and assets negative.

/** Tally's primary groups, as Tally names them. */
export const GROUPS = {
  income: ['Sales Accounts', 'Direct Incomes', 'Indirect Incomes'],
  expense: ['Purchase Accounts', 'Direct Expenses', 'Indirect Expenses'],
  receivable: ['Sundry Debtors'],
  payable: ['Sundry Creditors'],
  cash: ['Bank Accounts', 'Cash-in-Hand', 'Bank OD A/c'],
};

/** After requireAdmin: only admins given the Tally dashboard. */
export function requireTallyAccess(req: Request, res: Response, next: NextFunction): void {
  if (!currentAdmin(req).hasTallyAccess()) {
    res.status(403).json({ error: 'You do not have access to the Tally dashboard' });
    return;
  }
  next();
}

const live = { deletedInTally: { $ne: true } };
const counted = { ...live, cancelled: { $ne: true }, optional: { $ne: true } };
const round = (n: number) => Math.round(n * 100) / 100;

/** from/to from the query (yyyy-mm-dd); `to` includes the whole day. */
function period(q: Request['query']): { from?: Date; to?: Date; match: Record<string, unknown> } {
  const from = tallyDate(q.from) ?? undefined;
  const toDay = tallyDate(q.to);
  const to = toDay ? new Date(toDay.getTime() + 86400000 - 1) : undefined;
  const date: Record<string, Date> = {};
  if (from) date.$gte = from;
  if (to) date.$lte = to;
  return { from, to, match: Object.keys(date).length ? { date } : {} };
}

/** GET /api/tally/companies — every Tally company the connector has sent, with its last sync. */
export async function companies(_req: Request, res: Response) {
  const [syncs, counts] = await Promise.all([
    TallySync.aggregate<{ _id: { source: string; company: string }; last: Record<string, unknown>; lastOk?: Date }>([
      { $sort: { at: -1 } },
      { $group: { _id: { source: '$source', company: '$company' }, last: { $first: '$$ROOT' } } },
    ]),
    TallyVoucher.aggregate<{ _id: { source: string; company: string }; vouchers: number; first: Date; latest: Date }>([
      { $match: live },
      { $group: { _id: { source: '$source', company: '$company' }, vouchers: { $sum: 1 }, first: { $min: '$date' }, latest: { $max: '$date' } } },
    ]),
  ]);
  const key = (id: { source: string; company: string }) => `${id.source}\u0000${id.company}`;
  const byKey = new Map(counts.map((c) => [key(c._id), c]));
  interface Row {
    source: string;
    company: string;
    lastSync: Record<string, unknown> | null;
    vouchers: number;
    firstDate: Date | null;
    latestDate: Date | null;
  }
  const list: Row[] = syncs.map((s) => {
    const c = byKey.get(key(s._id));
    return { source: s._id.source, company: s._id.company, lastSync: s.last, vouchers: c?.vouchers ?? 0, firstDate: c?.first ?? null, latestDate: c?.latest ?? null };
  });
  // Companies with data but no sync log yet (shouldn't happen, but never hide data)
  const logged = new Set(syncs.map((s) => key(s._id)));
  for (const c of counts) {
    if (!logged.has(key(c._id))) list.push({ source: c._id.source, company: c._id.company, lastSync: null, vouchers: c.vouchers, firstDate: c.first, latestDate: c.latest });
  }
  list.sort((a, b) => a.source.localeCompare(b.source) || a.company.localeCompare(b.company));
  res.json({ companies: list });
}

/** GET /api/tally/summary?source=&company=&from=&to= — the dashboard's figures. */
export async function summary(req: Request, res: Response) {
  const t = target(req.query);
  const p = period(req.query);
  const vMatch = { ...t, ...counted, ...p.match };
  const plGroups = [...GROUPS.income, ...GROUPS.expense];

  const monthlyPipeline: PipelineStage[] = [
    { $match: vMatch },
    { $unwind: '$entries' },
    { $match: { 'entries.group': { $in: plGroups } } },
    {
      $group: {
        _id: { month: { $dateToString: { format: '%Y-%m', date: '$date' } }, income: { $in: ['$entries.group', GROUPS.income] } },
        amount: { $sum: '$entries.amount' },
      },
    },
  ];

  const [monthlyRaw, topCustomers, byType, ledgers, lastSyncs, voucherCount] = await Promise.all([
    TallyVoucher.aggregate<{ _id: { month: string; income: boolean }; amount: number }>(monthlyPipeline),
    TallyVoucher.aggregate<{ _id: string; amount: number; count: number }>([
      { $match: { ...vMatch, baseType: 'Sales', party: { $ne: '' } } },
      { $group: { _id: '$party', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { amount: -1 } },
      { $limit: 10 },
    ]),
    TallyVoucher.aggregate<{ _id: string; amount: number; count: number }>([
      { $match: vMatch },
      { $group: { _id: '$baseType', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    TallyLedger.find({ ...t, ...live, group: { $in: [...GROUPS.receivable, ...GROUPS.payable, ...GROUPS.cash] } })
      .select('name group closing')
      .lean(),
    TallySync.find(t).sort({ at: -1 }).limit(8).lean(),
    TallyVoucher.countDocuments({ ...t, ...live }),
  ]);

  // Monthly income (credit, positive) and expenses (debit, shown positive)
  const months = new Map<string, { month: string; income: number; expenses: number }>();
  for (const r of monthlyRaw) {
    const m = months.get(r._id.month) ?? { month: r._id.month, income: 0, expenses: 0 };
    if (r._id.income) m.income += r.amount;
    else m.expenses -= r.amount;
    months.set(r._id.month, m);
  }
  const monthly = [...months.values()].sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({ ...m, income: round(m.income), expenses: round(m.expenses) }));
  const income = round(monthly.reduce((s, m) => s + m.income, 0));
  const expenses = round(monthly.reduce((s, m) => s + m.expenses, 0));

  // Balances today, from the ledgers (debit balances are negative in Tally)
  const pick = (groups: string[], sign: 1 | -1) =>
    ledgers
      .filter((l) => groups.includes(l.group))
      .map((l) => ({ name: l.name, group: l.group, amount: round(sign * l.closing) }))
      .sort((a, b) => b.amount - a.amount);
  const receivables = pick(GROUPS.receivable, -1);
  const payables = pick(GROUPS.payable, 1);
  const cash = pick(GROUPS.cash, -1);
  const total = (list: { amount: number }[]) => round(list.reduce((s, x) => s + x.amount, 0));

  res.json({
    ...t,
    period: { from: p.from ?? null, to: p.to ?? null },
    kpis: {
      income,
      expenses,
      net: round(income - expenses),
      receivables: total(receivables.filter((r) => r.amount > 0)),
      payables: total(payables.filter((r) => r.amount > 0)),
      cash: total(cash),
    },
    monthly,
    topCustomers: topCustomers.map((c) => ({ party: c._id, amount: round(c.amount), count: c.count })),
    byType: byType.map((x) => ({ type: x._id || 'Other', amount: round(x.amount), count: x.count })),
    receivables: receivables.filter((r) => r.amount > 0).slice(0, 10),
    payables: payables.filter((r) => r.amount > 0).slice(0, 10),
    cash,
    syncs: lastSyncs,
    voucherCount,
  });
}

const page = (q: Request['query']) => {
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
  const pageNo = Math.max(Number(q.page) || 1, 1);
  return { limit, page: pageNo, skip: (pageNo - 1) * limit };
};

/** GET /api/tally/vouchers?source=&company=&type=&q=&from=&to=&page=&limit= */
export async function vouchers(req: Request, res: Response) {
  const t = target(req.query);
  const p = period(req.query);
  const pg = page(req.query);
  const filter: Record<string, unknown> = { ...t, ...live, ...p.match };
  const type = str(req.query.type).trim();
  if (type) filter.baseType = type;
  const q = str(req.query.q).trim().slice(0, 100);
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ party: rx }, { number: rx }, { narration: rx }, { reference: rx }, { voucherType: rx }];
  }
  const [items, total, types] = await Promise.all([
    TallyVoucher.find(filter).sort({ date: -1, alterId: -1 }).skip(pg.skip).limit(pg.limit).select('-__v').lean(),
    TallyVoucher.countDocuments(filter),
    TallyVoucher.distinct('baseType', { ...t, ...live }),
  ]);
  res.json({ items, total, page: pg.page, limit: pg.limit, types: types.filter(Boolean).sort() });
}

/** GET /api/tally/ledgers?source=&company=&group=&q=&page=&limit= */
export async function ledgerList(req: Request, res: Response) {
  const t = target(req.query);
  const pg = page(req.query);
  const filter: Record<string, unknown> = { ...t, ...live };
  const group = str(req.query.group).trim();
  if (group) filter.group = group;
  const q = str(req.query.q).trim().slice(0, 100);
  if (q) filter.$or = [{ name: new RegExp(escapeRegex(q), 'i') }, { parent: new RegExp(escapeRegex(q), 'i') }];
  const [items, total, groups] = await Promise.all([
    TallyLedger.find(filter).sort({ name: 1 }).skip(pg.skip).limit(pg.limit).lean(),
    TallyLedger.countDocuments(filter),
    TallyLedger.distinct('group', { ...t, ...live }),
  ]);
  res.json({ items, total, page: pg.page, limit: pg.limit, groups: groups.filter(Boolean).sort() });
}
