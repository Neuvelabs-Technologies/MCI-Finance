import {
  ALLOCATION_KEYS,
  type AllocationKey,
  CHART,
  COLUMN_KEYS,
  type ColumnKey,
  LEAVES,
  type LeafRow,
  ROW_BY_CODE,
  SERVICE_LINES,
  type ServiceLine,
  TREATMENTS,
  type Treatment,
} from './chart.js';

// Actual Group P&L from Tally amounts. Pure functions: the controller loads the data, this works it out.
//
// Each Tally ledger's amount for the period goes to a group account (setup.accounts), then into a column
// by the account's treatment: by project (cost centre → service line), spread over the service lines by a
// key (FTE, headcount, gross margin, m²), or kept in Local HQ / Other Offices / Local Adjustments.
// Whatever can't be placed (no project, a project without a service line, no FTE entered) stays in
// Back-Office and is reported, so totals always match the books.

export interface SetupInput {
  accounts: { kind: 'ledger' | 'group'; name: string; account: string }[];
  projects: { costCentre: string; serviceLine: string }[];
  treatments: { account: string; treatment: string }[];
  hr: { year: number; serviceLine: string; fte: number; headcount: number; sqm: number }[];
}

export interface LedgerInfo {
  name: string;
  parent: string;
  /** Groups above the ledger, nearest first (connector 1.2.0+; else only `parent` is known). */
  groups?: string[];
}

/** One ledger's total for the period, Tally's sign (credit positive), with its cost-centre split. */
export interface LedgerAmount {
  ledger: string;
  /** Primary group, to tell P&L ledgers apart when reporting unmapped ones. */
  group: string;
  amount: number;
  centres: { name: string; amount: number }[];
}

export interface ActualResult {
  rows: { code: string; values: (number | null)[] }[];
  /** Which ledgers make up each account (report sign), for drill-down. */
  detail: Record<string, { ledger: string; amount: number }[]>;
  warnings: {
    /** P&L ledgers with amounts that aren't mapped to a group account (not in any total). */
    unmapped: { ledger: string; group: string; amount: number }[];
    /** Projects without a service line (their amounts sit in Back-Office). */
    unassignedProjects: { costCentre: string; amount: number }[];
    /** Revenue or cost of sales booked without a project (in Back-Office). */
    noProject: number;
    /** Keys with no basis for the year (amounts left in Back-Office). */
    missingBasis: AllocationKey[];
  };
}

/** Income and expense primary groups in Tally: only these are reported as "not mapped". */
export const PL_GROUPS = ['Sales Accounts', 'Direct Incomes', 'Indirect Incomes', 'Purchase Accounts', 'Direct Expenses', 'Indirect Expenses'];

type Bucket = 'localHq' | 'otherOffices' | 'localAdj' | 'backOffice' | ServiceLine;
const BUCKETS: Bucket[] = ['localHq', 'otherOffices', 'localAdj', 'backOffice', ...SERVICE_LINES];
const FIXED: Partial<Record<Treatment, Bucket>> = {
  hq: 'localHq',
  otherOffices: 'otherOffices',
  adjustment: 'localAdj',
  backOffice: 'backOffice',
  pco: 'pco',
  amc: 'amc',
  corporate: 'corporate',
  specialty: 'specialty',
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const isTreatment = (t: string): t is Treatment => (TREATMENTS as readonly string[]).includes(t);
const isKey = (t: string): t is AllocationKey => (ALLOCATION_KEYS as readonly string[]).includes(t);
const isServiceLine = (s: string): s is ServiceLine => (SERVICE_LINES as readonly string[]).includes(s);

/** Each account's treatment: the chart's default unless the setup changes it. */
export function treatmentsFor(setup: Pick<SetupInput, 'treatments'>): Map<string, Treatment> {
  const map = new Map<string, Treatment>(LEAVES.map((l) => [l.code, l.treatment]));
  for (const t of setup.treatments) if (map.has(t.account) && isTreatment(t.treatment)) map.set(t.account, t.treatment);
  return map;
}

/** Ledger name → account code: the ledger's own mapping, else the nearest group above it that is mapped. */
export function accountResolver(setup: Pick<SetupInput, 'accounts'>, ledgers: LedgerInfo[]): (ledger: string) => string | null {
  const byLedger = new Map<string, string>();
  const byGroup = new Map<string, string>();
  for (const a of setup.accounts) {
    if (!ROW_BY_CODE.has(a.account) || ROW_BY_CODE.get(a.account)?.kind !== 'leaf') continue;
    (a.kind === 'group' ? byGroup : byLedger).set(a.name, a.account);
  }
  const info = new Map(ledgers.map((l) => [l.name, l]));
  return (ledger) => {
    const own = byLedger.get(ledger);
    if (own) return own;
    const l = info.get(ledger);
    const chain = l?.groups?.length ? l.groups : l?.parent ? [l.parent] : [];
    for (const g of chain) {
      const hit = byGroup.get(g);
      if (hit) return hit;
    }
    return null;
  };
}

/** Basis per service line for a year: FTE, headcount and m² from HR. */
function hrBasis(setup: SetupInput, year: number) {
  const out: Record<'fte' | 'headcount' | 'sqm', Record<ServiceLine, number>> = {
    fte: { pco: 0, amc: 0, corporate: 0, specialty: 0 },
    headcount: { pco: 0, amc: 0, corporate: 0, specialty: 0 },
    sqm: { pco: 0, amc: 0, corporate: 0, specialty: 0 },
  };
  let any = false;
  for (const h of setup.hr) {
    if (h.year !== year || !isServiceLine(h.serviceLine)) continue;
    any = true;
    out.fte[h.serviceLine] = Number(h.fte) || 0;
    out.headcount[h.serviceLine] = Number(h.headcount) || 0;
    out.sqm[h.serviceLine] = Number(h.sqm) || 0;
  }
  return { ...out, any };
}

/** The 11 report columns from the placed amounts. */
function columns(b: Record<Bucket, number>): number[] {
  const bsl = b.pco + b.amc + b.corporate + b.specialty;
  const localMgmt = b.backOffice + bsl;
  const office = b.localHq + b.otherOffices + b.localAdj + localMgmt;
  const byKey: Record<ColumnKey, number> = { office, localHq: b.localHq, otherOffices: b.otherOffices, localAdj: b.localAdj, localMgmt, backOffice: b.backOffice, bsl, ...pick(b) };
  return COLUMN_KEYS.map((k) => byKey[k]);
}
const pick = (b: Record<Bucket, number>) => ({ pco: b.pco, amc: b.amc, corporate: b.corporate, specialty: b.specialty });
const empty = (): Record<Bucket, number> => Object.fromEntries(BUCKETS.map((k) => [k, 0])) as Record<Bucket, number>;

export function computeActual(input: { setup: SetupInput; ledgers: LedgerInfo[]; amounts: LedgerAmount[]; year: number }): ActualResult {
  const { setup, year } = input;
  const treatment = treatmentsFor(setup);
  const resolve = accountResolver(setup, input.ledgers);
  const projectLine = new Map<string, ServiceLine>();
  for (const p of setup.projects) if (isServiceLine(p.serviceLine)) projectLine.set(p.costCentre, p.serviceLine);

  const placed = new Map<string, Record<Bucket, number>>();
  const bucketsOf = (code: string) => {
    let b = placed.get(code);
    if (!b) placed.set(code, (b = empty()));
    return b;
  };
  const pending: { code: string; key: AllocationKey; value: number }[] = [];
  const detail: ActualResult['detail'] = {};
  const unmapped: ActualResult['warnings']['unmapped'] = [];
  const unassigned = new Map<string, number>();
  let noProject = 0;

  for (const a of input.amounts) {
    const code = resolve(a.ledger);
    if (!code) {
      if (PL_GROUPS.includes(a.group) && Math.abs(a.amount) >= 0.005) unmapped.push({ ledger: a.ledger, group: a.group, amount: r2(a.amount) });
      continue;
    }
    const row = ROW_BY_CODE.get(code) as LeafRow;
    const sign = row.income ? 1 : -1;
    const value = sign * a.amount;
    (detail[code] ??= []).push({ ledger: a.ledger, amount: r2(value) });
    const t = treatment.get(code) ?? 'backOffice';
    const b = bucketsOf(code);
    if (t === 'project') {
      let split = 0;
      for (const c of a.centres) {
        split += c.amount;
        const sl = projectLine.get(c.name);
        if (sl) b[sl] += sign * c.amount;
        else {
          b.backOffice += sign * c.amount;
          unassigned.set(c.name, (unassigned.get(c.name) ?? 0) + sign * c.amount);
        }
      }
      const rest = sign * (a.amount - split);
      b.backOffice += rest;
      noProject += rest;
    } else if (isKey(t)) {
      pending.push({ code, key: t, value });
    } else {
      b[FIXED[t] ?? 'backOffice'] += value;
    }
  }

  // Bases: HR figures, and gross margin per service line from the project-placed revenue and cost of sales.
  const hr = hrBasis(setup, year);
  const gm: Record<ServiceLine, number> = { pco: 0, amc: 0, corporate: 0, specialty: 0 };
  for (const code of ['TURNOVER', 'COSTOFSALES']) {
    const b = placed.get(code);
    if (b) for (const sl of SERVICE_LINES) gm[sl] += b[sl];
  }
  const basis: Record<AllocationKey, Record<ServiceLine, number>> = { fte: hr.fte, headcount: hr.headcount, sqm: hr.sqm, gm };
  const missing = new Set<AllocationKey>();
  for (const p of pending) {
    const weights = SERVICE_LINES.map((sl) => Math.max(0, basis[p.key][sl]));
    const sum = weights.reduce((s, w) => s + w, 0);
    const b = bucketsOf(p.code);
    if (sum <= 0) {
      b.backOffice += p.value;
      missing.add(p.key);
      continue;
    }
    SERVICE_LINES.forEach((sl, i) => (b[sl] += (p.value * weights[i]) / sum));
  }

  // Rows: leaves from the placed amounts, totals from their parts, stats from HR, ratios per column.
  const values = new Map<string, (number | null)[]>();
  const evaluating = new Set<string>();
  const valueOf = (code: string): (number | null)[] => {
    const known = values.get(code);
    if (known) return known;
    const row = ROW_BY_CODE.get(code);
    let out: (number | null)[] = COLUMN_KEYS.map(() => null);
    if (row && !evaluating.has(code)) {
      evaluating.add(code);
      if (row.kind === 'leaf') out = columns(placed.get(code) ?? empty());
      else if (row.kind === 'total') {
        const acc = COLUMN_KEYS.map(() => 0);
        for (const [part, s] of row.sum) valueOf(part).forEach((v, i) => (acc[i] += s * (v ?? 0)));
        out = acc;
      } else if (row.kind === 'stat' && row.stat && hr.any) {
        const b = empty();
        for (const sl of SERVICE_LINES) b[sl] = hr[row.stat][sl];
        out = columns(b);
      } else if (row.kind === 'ratio') {
        const n = valueOf(row.num);
        const d = valueOf(row.den);
        out = n.map((v, i) => (v === null || d[i] === null || Math.abs(d[i] as number) < 1e-9 ? null : v / (d[i] as number)));
      }
      evaluating.delete(code);
    }
    const rounded = out.map((v) => (v === null ? null : row?.kind === 'ratio' ? Math.round(v * 10000) / 10000 : r2(v)));
    values.set(code, rounded);
    return rounded;
  };

  for (const list of Object.values(detail)) list.sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount));
  return {
    rows: CHART.map((r) => ({ code: r.code, values: valueOf(r.code) })),
    detail,
    warnings: {
      unmapped: unmapped.sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount)),
      unassignedProjects: [...unassigned].map(([costCentre, amount]) => ({ costCentre, amount: r2(amount) })).sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount)),
      noProject: r2(noProject),
      missingBasis: [...missing],
    },
  };
}
