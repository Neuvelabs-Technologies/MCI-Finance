import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config, tallyConnectorEnabled } from '../../config/env.js';
import { type ITallyEntry, type ITallyLedger, type ITallyVoucher, TallyLedger, TallySync, TallyVoucher } from '../../models/Tally.js';
import { badRequest } from '../../utils/ApiError.js';
import { str } from '../../utils/http.js';

// What the Tally connector (connector/tally-sync.ps1 on MCI's Tally server) calls.
// It authenticates with the X-Tally-Key header, never with a user session.
// Every write here adds or updates; nothing is ever deleted.

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest();
const plainIp = (ip: string | undefined) => (ip ?? '').replace(/^::ffff:/, '');

/** Lets the request through only with the right connector key (and from an allowed IP, if any are set). */
export function requireConnectorKey(req: Request, res: Response, next: NextFunction): void {
  if (!tallyConnectorEnabled()) {
    res.status(503).json({ error: 'The Tally connector is not set up on this server (TALLY_CONNECTOR_KEY is empty)' });
    return;
  }
  const given = req.get('x-tally-key') ?? '';
  if (!given || !crypto.timingSafeEqual(sha256(given), sha256(config.tally.connectorKey))) {
    res.status(401).json({ error: 'Wrong or missing connector key' });
    return;
  }
  const allowed = config.tally.allowedIps;
  if (allowed.length && !allowed.includes(plainIp(req.ip))) {
    res.status(403).json({ error: `This IP (${plainIp(req.ip)}) may not send Tally data` });
    return;
  }
  next();
}

// ---------- input cleaning ----------

interface Target {
  source: string;
  company: string;
}

/** Which Tally installation and company the request is about. */
export function target(input: unknown): Target {
  const src = (input ?? {}) as Record<string, unknown>;
  const source = str(src.source).trim().toLowerCase();
  const company = str(src.company).trim();
  if (!/^[a-z0-9_-]{1,30}$/.test(source)) throw badRequest('source must be a short name such as "gold"');
  if (!company || company.length > 200) throw badRequest('company is required');
  return { source, company };
}

const text = (v: unknown, max = 300): string => str(v).trim().slice(0, max);

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(str(v).replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};

/** "2026-04-01" or Tally's "20260401" → midnight UTC that day. */
export function tallyDate(v: unknown): Date | null {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(str(v).trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function rows(v: unknown, max: number, label: string): Record<string, unknown>[] {
  if (!Array.isArray(v)) throw badRequest(`${label} must be a list`);
  if (v.length > max) throw badRequest(`Send at most ${max} ${label} per request`);
  return v.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object');
}

type LedgerRow = Omit<ITallyLedger, 'source' | 'company' | 'deletedInTally' | 'syncedAt'>;
type VoucherRow = Omit<ITallyVoucher, 'source' | 'company' | 'deletedInTally' | 'syncedAt'>;

function cleanLedger(r: Record<string, unknown>): LedgerRow | null {
  const guid = text(r.guid, 100);
  const name = text(r.name);
  if (!guid || !name) return null;
  return { guid, name, alterId: num(r.alterId), parent: text(r.parent), group: text(r.group), opening: num(r.opening), closing: num(r.closing) };
}

function cleanVoucher(r: Record<string, unknown>): VoucherRow | null {
  const guid = text(r.guid, 100);
  const date = tallyDate(r.date);
  if (!guid || !date) return null;
  const entries: ITallyEntry[] = (Array.isArray(r.entries) ? r.entries : [])
    .slice(0, 500)
    .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
    .map((e) => ({ ledger: text(e.ledger), group: text(e.group), amount: num(e.amount) }))
    .filter((e) => e.ledger);
  // The credit side of a balanced voucher equals its total.
  const credit = entries.reduce((s, e) => (e.amount > 0 ? s + e.amount : s), 0);
  return {
    guid,
    date,
    alterId: num(r.alterId),
    voucherType: text(r.voucherType, 100),
    baseType: text(r.baseType, 100),
    number: text(r.number, 100),
    reference: text(r.reference, 200),
    party: text(r.party),
    narration: text(r.narration, 2000),
    amount: Math.round((r.amount !== undefined ? Math.abs(num(r.amount)) : credit) * 100) / 100,
    cancelled: r.cancelled === true,
    optional: r.optional === true,
    entries,
  };
}

// ---------- handlers ----------

/** POST /api/tally/connector/ledgers { source, company, ledgers: [...] } — every ledger, every run (balances move). */
export async function ingestLedgers(req: Request, res: Response) {
  const t = target(req.body);
  const input = rows(req.body?.ledgers, 20000, 'ledgers');
  const clean = input.map(cleanLedger).filter((l): l is LedgerRow => l !== null);
  const now = new Date();
  const ops = clean.map((l) => ({
    updateOne: { filter: { ...t, guid: l.guid }, update: { $set: { ...l, ...t, deletedInTally: false, syncedAt: now } }, upsert: true },
  }));
  const r = ops.length ? await TallyLedger.bulkWrite(ops, { ordered: false }) : null;
  res.json({ ok: true, received: input.length, skipped: input.length - clean.length, added: r?.upsertedCount ?? 0, updated: r?.modifiedCount ?? 0 });
}

/** POST /api/tally/connector/vouchers { source, company, vouchers: [...] } — new and changed vouchers. */
export async function ingestVouchers(req: Request, res: Response) {
  const t = target(req.body);
  const input = rows(req.body?.vouchers, 5000, 'vouchers');
  const clean = input.map(cleanVoucher).filter((v): v is VoucherRow => v !== null);
  const now = new Date();
  const ops = clean.map((v) => ({
    updateOne: { filter: { ...t, guid: v.guid }, update: { $set: { ...v, ...t, deletedInTally: false, syncedAt: now } }, upsert: true },
  }));
  const r = ops.length ? await TallyVoucher.bulkWrite(ops, { ordered: false }) : null;
  res.json({ ok: true, received: input.length, skipped: input.length - clean.length, added: r?.upsertedCount ?? 0, updated: r?.modifiedCount ?? 0 });
}

/**
 * POST /api/tally/connector/present { source, company, kind: "ledger" | "voucher", guids: [...], force? }
 * Every GUID that exists in Tally right now. Records not in the list are flagged deletedInTally
 * (kept, never deleted). Refuses a list much shorter than what we hold — that usually means Tally
 * answered for the wrong period or a half-loaded company — unless force is true.
 */
export async function markPresent(req: Request, res: Response) {
  const t = target(req.body);
  const kind = str(req.body?.kind);
  if (kind !== 'ledger' && kind !== 'voucher') throw badRequest('kind must be "ledger" or "voucher"');
  const raw: unknown = req.body?.guids;
  if (!Array.isArray(raw)) throw badRequest('guids must be a list');
  if (raw.length > 500000) throw badRequest('Send at most 500000 guids per request');
  const guids = [...new Set(raw.map((g) => text(g, 100)).filter(Boolean))];
  if (!guids.length) throw badRequest('guids is empty: refusing to flag every record as deleted');

  const held = kind === 'ledger' ? await TallyLedger.countDocuments({ ...t, deletedInTally: false }) : await TallyVoucher.countDocuments({ ...t, deletedInTally: false });
  if (req.body?.force !== true && held > 20 && guids.length < held * 0.5) {
    throw badRequest(`Tally listed ${guids.length} ${kind}s but ${held} are on record. Nothing was flagged; send force: true if this is expected.`);
  }
  const goneFilter = { ...t, deletedInTally: false, guid: { $nin: guids } };
  const backFilter = { ...t, deletedInTally: true, guid: { $in: guids } };
  const [gone, back] =
    kind === 'ledger'
      ? await Promise.all([TallyLedger.updateMany(goneFilter, { $set: { deletedInTally: true } }), TallyLedger.updateMany(backFilter, { $set: { deletedInTally: false } })])
      : await Promise.all([TallyVoucher.updateMany(goneFilter, { $set: { deletedInTally: true } }), TallyVoucher.updateMany(backFilter, { $set: { deletedInTally: false } })]);
  res.json({ ok: true, flaggedDeleted: gone.modifiedCount, restored: back.modifiedCount });
}

/** GET /api/tally/connector/state?source=&company= — where the connector should carry on from. */
export async function state(req: Request, res: Response) {
  const t = target(req.query);
  const [last, lastSync] = await Promise.all([
    TallyVoucher.findOne(t).sort({ alterId: -1 }).select('alterId').lean(),
    TallySync.findOne(t).sort({ at: -1 }).lean(),
  ]);
  res.json({ maxVoucherAlterId: last?.alterId ?? 0, lastSync });
}

/** POST /api/tally/connector/sync-log { source, company, ok, ledgers, vouchers, full, durationMs, error?, connectorVersion?, host? } */
export async function logSync(req: Request, res: Response) {
  const t = target(req.body);
  const b = (req.body ?? {}) as Record<string, unknown>;
  await TallySync.create({
    ...t,
    ok: b.ok !== false,
    ledgers: num(b.ledgers),
    vouchers: num(b.vouchers),
    full: b.full === true,
    durationMs: num(b.durationMs),
    error: text(b.error, 2000) || undefined,
    connectorVersion: text(b.connectorVersion, 40) || undefined,
    host: text(b.host, 100) || undefined,
    ip: plainIp(req.ip) || undefined,
  });
  res.status(201).json({ ok: true });
}
