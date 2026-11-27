import type { Request, Response } from 'express';
import { currentAdmin } from '../../middlewares/auth.middleware.js';
import { TallyHiddenLedgers, TallyLedger } from '../../models/Tally.js';
import { badRequest } from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { str } from '../../utils/http.js';
import { type Target, target } from './tally.connector.js';

// Hidden ("deleted") ledgers and Tally groups: old ones MCI keeps in Tally but doesn't want in any report here
// (ledger list, balances, P&L, top customers, Group P&L and its setup). Soft: nothing changes in Tally, nothing is
// removed here, and taking an item off the list brings it back. See ITallyHiddenLedgers.

/** Does this entry (a code or a full name) hide the ledger? "1000" hides "1000-Cash" but not "100001-Bank". */
export function entryHides(entry: string, ledgerName: string): boolean {
  const e = entry.trim().toLowerCase();
  const n = ledgerName.trim().toLowerCase();
  if (!e || !n.startsWith(e)) return false;
  const next = n.charAt(e.length);
  return next === '' || !/[a-z0-9]/.test(next) || !/[a-z0-9]$/.test(e);
}

export interface HiddenLedger {
  name: string;
  parent: string;
  group: string;
  closing: number;
  deletedInTally: boolean;
  /** Hidden by this entry of the list… */
  entry?: string;
  /** …or because this Tally group above it is deleted. */
  byGroup?: string;
}

/** The list and every ledger it hides. */
export async function hiddenState(t: Target) {
  const doc = await TallyHiddenLedgers.findOne(t).lean();
  const entries = doc?.entries ?? [];
  const groups = doc?.groups ?? [];
  const ledgers: HiddenLedger[] = [];
  if (entries.length || groups.length) {
    const deletedGroups = new Set(groups);
    const all = await TallyLedger.find(t).select('name parent group groups closing deletedInTally').sort({ name: 1 }).lean();
    for (const l of all) {
      const base = { name: l.name, parent: l.parent, group: l.group, closing: l.closing, deletedInTally: l.deletedInTally };
      const entry = entries.find((e) => entryHides(e, l.name));
      if (entry) {
        ledgers.push({ ...base, entry });
        continue;
      }
      const byGroup = (l.groups?.length ? l.groups : [l.parent]).find((g) => deletedGroups.has(g));
      if (byGroup) ledgers.push({ ...base, byGroup });
    }
  }
  return { doc, entries, groups, ledgers };
}

/** Names of the ledgers hidden for this company, for `$nin` filters. Empty when nothing is hidden. */
export async function hiddenLedgerNames(t: Target): Promise<string[]> {
  return (await hiddenState(t)).ledgers.map((l) => l.name);
}

async function respond(res: Response, t: Target, extra: Record<string, unknown> = {}) {
  const { doc, entries, groups, ledgers } = await hiddenState(t);
  const used = new Set(ledgers.map((l) => l.entry).filter(Boolean));
  const perGroup = new Map<string, number>();
  for (const l of ledgers) if (l.byGroup) perGroup.set(l.byGroup, (perGroup.get(l.byGroup) ?? 0) + 1);
  res.json({
    ...t,
    entries,
    groups: groups.map((name) => ({ name, ledgers: perGroup.get(name) ?? 0 })),
    ledgers,
    unmatched: entries.filter((e) => !used.has(e)),
    updatedAt: doc?.updatedAt ?? null,
    updatedBy: doc?.updatedBy ?? null,
    ...extra,
  });
}

const stamp = (req: Request) => ({ updatedAt: new Date(), updatedBy: currentAdmin(req).email });

function cleanList(raw: unknown, label: string): string[] {
  if (!Array.isArray(raw)) throw badRequest(`${label} must be a list`);
  if (raw.length > 5000) throw badRequest(`At most 5000 ${label}`);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    const e = String(v ?? '').trim().slice(0, 200);
    if (e && !seen.has(e.toLowerCase())) {
      seen.add(e.toLowerCase());
      out.push(e);
    }
  }
  return out;
}

/** GET /api/tally/hidden-ledgers?source=&company= — the list, with the ledgers it hides. */
export async function getHidden(req: Request, res: Response) {
  const t = target(req.query);
  // Every ledger too, so the box can show what an entry hides while it is typed.
  const all = await TallyLedger.find({ ...t, deletedInTally: { $ne: true } }).select('-_id name group closing').sort({ name: 1 }).lean();
  await respond(res, t, { all });
}

/** PUT /api/tally/hidden-ledgers { source, company, entries?, groups? } — each list given replaces the saved one. */
export async function saveHidden(req: Request, res: Response) {
  const t = target(req.body);
  const $set: Record<string, unknown> = stamp(req);
  if (req.body?.entries !== undefined) $set.entries = cleanList(req.body.entries, 'entries');
  if (req.body?.groups !== undefined) $set.groups = cleanList(req.body.groups, 'groups');
  if (!('entries' in $set) && !('groups' in $set)) throw badRequest('Nothing to save');
  await TallyHiddenLedgers.findOneAndUpdate(t, { $set, $setOnInsert: t }, { upsert: true });
  await audit(req, 'tally.hidden_ledgers_saved', { details: { ...t, entries: ($set.entries as string[] | undefined)?.length, groups: ($set.groups as string[] | undefined)?.length } });
  await respond(res, t);
}

function kindName(body: unknown) {
  const b = (body ?? {}) as Record<string, unknown>;
  const kind = b.kind === 'group' ? 'group' : b.kind === 'ledger' ? 'ledger' : null;
  const name = str(b.name).trim().slice(0, 200);
  if (!kind || !name) throw badRequest('kind (ledger or group) and name are required');
  return { kind, name } as const;
}

/** POST /api/tally/hidden-ledgers/delete { source, company, kind, name } — soft-delete one ledger or Tally group. */
export async function deleteOne(req: Request, res: Response) {
  const t = target(req.body);
  const { kind, name } = kindName(req.body);
  await TallyHiddenLedgers.findOneAndUpdate(t, { $addToSet: { [kind === 'group' ? 'groups' : 'entries']: name }, $set: stamp(req), $setOnInsert: t }, { upsert: true });
  await audit(req, kind === 'group' ? 'tally.group_deleted' : 'tally.ledger_deleted', { details: { ...t, name } });
  await respond(res, t);
}

/** POST /api/tally/hidden-ledgers/restore { source, company, kind, name } — bring a deleted ledger or Tally group back. */
export async function restoreOne(req: Request, res: Response) {
  const t = target(req.body);
  const { kind, name } = kindName(req.body);
  if (kind === 'group') {
    await TallyHiddenLedgers.updateOne(t, { $pull: { groups: name }, $set: stamp(req) });
  } else {
    const state = await hiddenState(t);
    const hit = state.ledgers.find((l) => l.name === name);
    if (hit?.byGroup) throw badRequest(`This ledger is hidden because its Tally group "${hit.byGroup}" is deleted. Bring the group back instead.`);
    // Take off every entry that hides it (its own name, or a code it starts with).
    const drop = state.entries.filter((e) => entryHides(e, name));
    if (drop.length) await TallyHiddenLedgers.updateOne(t, { $pull: { entries: { $in: drop } }, $set: stamp(req) });
  }
  await audit(req, kind === 'group' ? 'tally.group_restored' : 'tally.ledger_restored', { details: { ...t, name } });
  await respond(res, t);
}
