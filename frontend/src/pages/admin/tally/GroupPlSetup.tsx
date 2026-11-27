import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { errorMessage } from '@/api/client';
import { tallyApi } from '@/api/tally.api';
import { ErrorState, LoadingState } from '@/components/common/StateViews';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SearchSelect } from '@/components/ui/search-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/menu';
import { cn } from '@/lib/utils';
import type { GroupPlSetupData, GroupPlSetupResponse } from '@/types';
import { moneyWhole } from './money';

// Group P&L setup: how Tally's books fill the group report. Usually done once by the Tally user (Ann),
// then touched when a ledger or project is added in Tally, and each year for the HR figures.

export const SERVICE_LINE_LABEL: Record<string, string> = { pco: 'PCO/SME', amc: 'AM&C', corporate: 'Corporate Division', specialty: 'Specialty' };
const TREATMENT_LABEL: Record<string, string> = {
  project: 'By project (cost centre)',
  fte: 'Spread by FTE',
  headcount: 'Spread by headcount',
  gm: 'Spread by gross margin',
  sqm: 'Spread by office m²',
  hq: 'Local HQ (not spread)',
  otherOffices: 'Other Offices (not spread)',
  adjustment: 'Local Adjustments (not spread)',
  backOffice: 'Back-Office (not spread)',
  pco: 'All to PCO/SME',
  amc: 'All to AM&C',
  corporate: 'All to Corporate Division',
  specialty: 'All to Specialty',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: string;
  company: string;
  year: number;
  onSaved: () => void;
}

export function GroupPlSetup({ open, onOpenChange, source, company, year, onSaved }: Props) {
  const [data, setData] = useState<GroupPlSetupResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [draft, setDraft] = useState<GroupPlSetupData | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await tallyApi.groupPlSetup({ source, company, year });
      setData(r);
      setDraft(r.setup);
    } catch (e) {
      setError(e);
    }
  }, [source, company, year]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  /** After a delete or bring-back: fresh lists, unsaved links kept. */
  const refresh = useCallback(async () => {
    try {
      setData(await tallyApi.groupPlSetup({ source, company, year }));
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }, [source, company, year, onSaved]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      await tallyApi.saveGroupPlSetup({ source, company }, draft);
      toast.success('Group P&L setup saved');
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[min(1500px,96vw)] max-w-none sm:max-w-none flex-col">
        <DialogHeader>
          <DialogTitle>Group P&L setup · {company}</DialogTitle>
          <DialogDescription>How Tally's books fill the group report. Nothing here changes Tally.</DialogDescription>
        </DialogHeader>
        {error ? (
          <ErrorState error={error} onRetry={load} />
        ) : !data || !draft ? (
          <LoadingState rows={6} />
        ) : (
          <Tabs defaultValue="accounts" className="min-h-0 flex-1">
            <TabsList>
              <TabsTrigger value="accounts">Accounts</TabsTrigger>
              <TabsTrigger value="projects">Projects</TabsTrigger>
              <TabsTrigger value="allocation">Allocation keys</TabsTrigger>
              <TabsTrigger value="hr">HR figures</TabsTrigger>
            </TabsList>
            <TabsContent value="accounts" className="min-h-0">
              <Accounts data={data} draft={draft} setDraft={setDraft} target={{ source, company }} onChanged={refresh} />
            </TabsContent>
            <TabsContent value="projects" className="min-h-0">
              <Projects data={data} draft={draft} setDraft={setDraft} />
            </TabsContent>
            <TabsContent value="allocation" className="min-h-0">
              <Allocation data={data} draft={draft} setDraft={setDraft} />
            </TabsContent>
            <TabsContent value="hr" className="min-h-0">
              <Hr data={data} draft={draft} setDraft={setDraft} year={year} />
            </TabsContent>
          </Tabs>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!draft || saving}>
            {saving ? 'Saving…' : 'Save setup'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface TabProps {
  data: GroupPlSetupResponse;
  draft: GroupPlSetupData;
  setDraft: (fn: (d: GroupPlSetupData | null) => GroupPlSetupData | null) => void;
}

const Scroll = ({ children }: { children: ReactNode }) => <div className="max-h-[55vh] overflow-auto rounded-lg border border-border">{children}</div>;
const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th className={cn('sticky top-0 z-[1] bg-muted px-3 py-2 text-left text-xs font-bold text-muted-foreground', className)}>{children}</th>
);

function AccountSelect({ value, onChange, accounts, empty = 'Not linked' }: { value: string; onChange: (v: string) => void; accounts: GroupPlSetupResponse['accounts']; empty?: string }) {
  return (
    <SearchSelect
      size="sm"
      value={value}
      onValueChange={onChange}
      options={useMemo(() => [{ value: '', label: empty }, ...accounts.map((a) => ({ value: a.code, label: `${a.code} · ${a.name}` }))], [accounts, empty])}
      searchPlaceholder="Type a code or account name…"
      contentClassName="min-w-96"
    />
  );
}

function Accounts({ data, draft, setDraft, target, onChanged }: TabProps & { target: { source: string; company: string }; onChanged: () => Promise<void> }) {
  const [mode, setMode] = useState<'ledger' | 'group' | 'deleted'>('ledger');
  const [q, setQ] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [showBs, setShowBs] = useState(false);
  const [under, setUnder] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const map = useMemo(() => new Map(draft.accounts.map((a) => [`${a.kind}|${a.name}`, a.account])), [draft.accounts]);
  const accountName = useMemo(() => new Map(data.accounts.map((a) => [a.code, a.name])), [data.accounts]);

  const set = (kind: 'ledger' | 'group', name: string, account: string) =>
    setDraft((d) => d && { ...d, accounts: [...d.accounts.filter((a) => !(a.kind === kind && a.name === name)), ...(account ? [{ kind, name, account }] : [])] });

  const chainOf = (l: GroupPlSetupResponse['ledgers'][number]) => (l.groups.length ? l.groups : [l.parent]);
  /** What a ledger ends up as: its own link, else the nearest linked group above it. */
  const via = (l: GroupPlSetupResponse['ledgers'][number]) => {
    for (const g of chainOf(l)) {
      const a = map.get(`group|${g}`);
      if (a) return { account: a, group: g };
    }
    return null;
  };

  async function act(kind: 'ledger' | 'group', name: string, restore: boolean) {
    if (!restore) {
      const n = kind === 'group' ? data.ledgers.filter((l) => chainOf(l).includes(name)).length : 0;
      const what = kind === 'group' ? `the Tally group "${name}" and the ${n} ledger(s) under it` : `the ledger "${name}"`;
      if (!window.confirm(`Delete ${what} from every report here?\n\nNothing changes in Tally. You can bring it back from the Deleted list.`)) return;
    }
    setBusy(`${kind}|${name}`);
    try {
      await (restore ? tallyApi.restoreToReports(target, kind, name) : tallyApi.deleteFromReports(target, kind, name));
      toast.success(restore ? `"${name}" is back in the reports` : `"${name}" deleted from reports`);
      await onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const needle = q.trim().toLowerCase();
  const scope = data.ledgers.filter((l) => showBs || l.pl);
  const scopeGroups = data.groups.filter((g) => showBs || g.pl);
  const ledgers = scope.filter(
    (l) =>
      (!under || chainOf(l).includes(under)) &&
      (!needle || l.name.toLowerCase().includes(needle) || l.parent.toLowerCase().includes(needle)) &&
      (!onlyOpen || (!map.get(`ledger|${l.name}`) && !via(l)))
  );
  const groups = scopeGroups.filter((g) => (!under || g.name === under || g.above.includes(under)) && (!needle || g.name.toLowerCase().includes(needle)));
  const deletedCount = data.deleted.groups.length + data.deleted.ledgers.filter((l) => !l.byGroup).length;
  const suggestions = scope.filter((l) => l.suggested && !map.get(`ledger|${l.name}`) && !via(l));
  const unlinked = data.ledgers.filter((l) => l.pl && !map.get(`ledger|${l.name}`) && !via(l)).length;
  const bsCount = data.ledgers.filter((l) => !l.pl).length;
  const del = (kind: 'ledger' | 'group', name: string) => (
    <Button variant="ghost" size="icon-sm" title="Delete from reports (Tally is not changed)" aria-label={`Delete ${name} from reports`} disabled={busy !== null} onClick={() => act(kind, name, false)}>
      <Trash2 className="text-muted-foreground" />
    </Button>
  );

  return (
    <div className="flex flex-col gap-3 pt-3">
      <p className="text-sm text-muted-foreground">
        Link each income and expense ledger to a group account (the P&L codes). Linking a <b className="text-foreground">Tally group</b> links every ledger under it at once, unless a
        ledger has its own link. Amounts are {data.year} to date.
        {unlinked ? <b className="text-foreground"> {unlinked} P&L ledger(s) not linked yet.</b> : <b className="text-success"> Every P&L ledger is linked.</b>}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border p-0.5">
          {(['ledger', 'group', 'deleted'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={cn('rounded-md px-3 py-1 text-sm', mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>
              {m === 'ledger' ? `Ledgers (${scope.length})` : m === 'group' ? `Tally groups (${scopeGroups.length})` : `Deleted (${deletedCount})`}
            </button>
          ))}
        </div>
        {mode !== 'deleted' ? (
          <>
            <Input className="h-9 w-56 px-3" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
            <SearchSelect
              size="sm"
              className="w-64"
              contentClassName="min-w-80"
              aria-label="Filter by Tally group"
              value={under}
              onValueChange={setUnder}
              searchPlaceholder="Type a Tally group…"
              options={[{ value: '', label: 'All Tally groups' }, ...scopeGroups.map((g) => ({ value: g.name, label: g.name, hint: `(${g.ledgers})` }))]}
            />
            {mode === 'ledger' ? (
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Only not linked
              </label>
            ) : null}
            <label className="flex items-center gap-1.5 text-sm" title="Banks, debtors, assets and liabilities: they don't go into the P&L">
              <input
                type="checkbox"
                checked={showBs}
                onChange={(e) => {
                  setShowBs(e.target.checked);
                  setUnder('');
                }}
              />{' '}
              Show balance-sheet ledgers ({bsCount})
            </label>
            {suggestions.length ? (
              <Button variant="outline" size="sm" onClick={() => suggestions.forEach((l) => set('ledger', l.name, l.suggested!))}>
                <Sparkles /> Link {suggestions.length} by name
              </Button>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Deleted from every report here (ledger list, balances, P&L, Group P&L). Nothing was changed in Tally.</p>
        )}
      </div>
      <Scroll>
        {mode === 'deleted' ? (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <Th>Deleted</Th>
                <Th>Kind</Th>
                <Th className="text-right">Closing</Th>
                <Th className="w-40" />
              </tr>
            </thead>
            <tbody>
              {data.deleted.groups.map((g) => (
                <tr key={`g|${g.name}`} className="border-t border-border/60">
                  <td className="px-3 py-1.5 font-medium">{g.name}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">Tally group · hides {g.ledgers} ledger(s)</td>
                  <td />
                  <td className="px-3 py-1.5 text-right">
                    <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => act('group', g.name, true)}>
                      <RotateCcw /> Bring back
                    </Button>
                  </td>
                </tr>
              ))}
              {data.deleted.ledgers.map((l) => (
                <tr key={`l|${l.name}`} className="border-t border-border/60">
                  <td className="px-3 py-1.5">{l.name}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground">{l.byGroup ? `Ledger · with group "${l.byGroup}"` : l.entry && l.entry !== l.name ? `Ledger · by number ${l.entry}` : 'Ledger'}</td>
                  <td className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums">{l.closing ? moneyWhole(l.closing) : ''}</td>
                  <td className="px-3 py-1.5 text-right">
                    {l.byGroup ? null : (
                      <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => act('ledger', l.name, true)}>
                        <RotateCcw /> Bring back
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {!data.deleted.groups.length && !data.deleted.ledgers.length ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                    Nothing deleted. Use the bin on a ledger or Tally group to take it out of the reports.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead>
              {mode === 'ledger' ? (
                <tr>
                  <Th>Tally ledger</Th>
                  <Th>Under</Th>
                  <Th className="text-right">Amount</Th>
                  <Th className="w-[420px]">Group account</Th>
                  <Th className="w-10" />
                </tr>
              ) : (
                <tr>
                  <Th>Tally group</Th>
                  <Th>Under</Th>
                  <Th className="text-right">Ledgers</Th>
                  <Th className="w-[420px]">Group account (for every ledger under it)</Th>
                  <Th className="w-10" />
                </tr>
              )}
            </thead>
            <tbody>
              {mode === 'ledger'
                ? ledgers.map((l) => {
                    const own = map.get(`ledger|${l.name}`) ?? '';
                    const inherited = own ? null : via(l);
                    return (
                      <tr key={l.name} className="border-t border-border/60">
                        <td className="px-3 py-1.5">{l.name}</td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">{chainOf(l).join(' › ')}</td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums">{l.amount ? moneyWhole(l.amount) : ''}</td>
                        <td className="px-3 py-1.5">
                          <AccountSelect
                            value={own}
                            onChange={(v) => set('ledger', l.name, v)}
                            accounts={data.accounts}
                            empty={inherited ? `Via group "${inherited.group}": ${inherited.account} · ${accountName.get(inherited.account) ?? ''}` : 'Not linked'}
                          />
                        </td>
                        <td className="px-1 py-1.5">{del('ledger', l.name)}</td>
                      </tr>
                    );
                  })
                : groups.map((g) => (
                    <tr key={g.name} className="border-t border-border/60">
                      <td className="px-3 py-1.5">{g.name}</td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">{g.above.join(' › ') || 'Primary'}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{g.ledgers}</td>
                      <td className="px-3 py-1.5">
                        <AccountSelect value={map.get(`group|${g.name}`) ?? ''} onChange={(v) => set('group', g.name, v)} accounts={data.accounts} />
                      </td>
                      <td className="px-1 py-1.5">{del('group', g.name)}</td>
                    </tr>
                  ))}
              {(mode === 'ledger' ? ledgers.length : groups.length) === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    {data.ledgers.length ? 'Nothing matches.' : 'No ledgers from Tally yet. They appear after the first sync.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </Scroll>
    </div>
  );
}

function Projects({ data, draft, setDraft }: TabProps) {
  const [q, setQ] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const map = useMemo(() => new Map(draft.projects.map((p) => [p.costCentre, p.serviceLine])), [draft.projects]);
  const set = (costCentre: string, serviceLine: string) =>
    setDraft((d) => d && { ...d, projects: [...d.projects.filter((p) => p.costCentre !== costCentre), ...(serviceLine ? [{ costCentre, serviceLine }] : [])] });
  const needle = q.trim().toLowerCase();
  const list = data.costCentres.filter((c) => (!needle || c.name.toLowerCase().includes(needle)) && (!onlyOpen || !map.get(c.name)));
  const open = data.costCentres.filter((c) => !map.get(c.name)).length;
  return (
    <div className="flex flex-col gap-3 pt-3">
      <p className="text-sm text-muted-foreground">
        Each project is a cost centre in Tally. Give it the service line it belongs to: its revenue and cost of sales go there. Newest first.
        {open ? <b className="text-foreground"> {open} project(s) without a service line.</b> : null}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input className="h-9 w-64 px-3" placeholder="Search projects" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Only without a service line
        </label>
      </div>
      <Scroll>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <Th>Project (cost centre)</Th>
              <Th className="text-right">Lines</Th>
              <Th className="text-right">Net amount</Th>
              <Th className="w-64">Service line</Th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.name} className="border-t border-border/60">
                <td className="px-3 py-1.5">{c.name}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{c.lines}</td>
                <td className="px-3 py-1.5 text-right whitespace-nowrap tabular-nums">{moneyWhole(c.amount)}</td>
                <td className="px-3 py-1.5">
                  <SearchSelect
                    size="sm"
                    value={map.get(c.name) ?? ''}
                    onValueChange={(v) => set(c.name, v)}
                    options={[{ value: '', label: 'Not set (Back-Office)' }, ...data.serviceLines.map((s) => ({ value: s, label: SERVICE_LINE_LABEL[s] ?? s }))]}
                  />
                </td>
              </tr>
            ))}
            {list.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                  {data.costCentres.length ? 'Nothing matches.' : 'No cost centres from Tally yet. They arrive with connector 1.2.0 after its first sync.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Scroll>
    </div>
  );
}

function Allocation({ data, draft, setDraft }: TabProps) {
  const map = useMemo(() => new Map(draft.treatments.map((t) => [t.account, t.treatment])), [draft.treatments]);
  const set = (account: string, treatment: string, def: string) =>
    setDraft((d) => d && { ...d, treatments: [...d.treatments.filter((t) => t.account !== account), ...(treatment !== def ? [{ account, treatment }] : [])] });
  return (
    <div className="flex flex-col gap-3 pt-3">
      <p className="text-sm text-muted-foreground">
        Where each account's actual goes. Back-office costs are spread over the service lines by FTE, headcount, gross margin or office m². The defaults follow MCI DUBAI's forecast; changed ones are marked.
      </p>
      <Scroll>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <Th>Group account</Th>
              <Th className="w-72">Goes to</Th>
            </tr>
          </thead>
          <tbody>
            {data.accounts.map((a) => {
              const value = map.get(a.code) ?? a.treatment;
              const changed = value !== a.treatment;
              return (
                <tr key={a.code} className="border-t border-border/60">
                  <td className="px-3 py-1.5">
                    {a.name} <span className="text-xs text-muted-foreground">{a.code}</span>
                    {changed ? <span className="ml-2 text-xs font-bold text-primary">changed (default: {TREATMENT_LABEL[a.treatment]})</span> : null}
                  </td>
                  <td className="px-3 py-1.5">
                    <SearchSelect
                      size="sm"
                      value={value}
                      onValueChange={(v) => set(a.code, v, a.treatment)}
                      options={data.treatments.map((t) => ({ value: t, label: TREATMENT_LABEL[t] ?? t }))}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Scroll>
    </div>
  );
}

function Hr({ data, draft, setDraft, year: initialYear }: TabProps & { year: number }) {
  const [year, setYear] = useState(initialYear);
  const row = (sl: string) => draft.hr.find((h) => h.year === year && h.serviceLine === sl) ?? { year, serviceLine: sl, fte: 0, headcount: 0, sqm: 0 };
  const set = (sl: string, field: 'fte' | 'headcount' | 'sqm', value: string) =>
    setDraft((d) => {
      if (!d) return d;
      const cur = d.hr.find((h) => h.year === year && h.serviceLine === sl) ?? { year, serviceLine: sl, fte: 0, headcount: 0, sqm: 0 };
      const next = { ...cur, [field]: Math.max(0, Number(value) || 0) };
      return { ...d, hr: [...d.hr.filter((h) => !(h.year === year && h.serviceLine === sl)), next] };
    });
  const total = (f: 'fte' | 'headcount' | 'sqm') => data.serviceLines.reduce((s, sl) => s + (row(sl)[f] || 0), 0);
  return (
    <div className="flex flex-col gap-3 pt-3">
      <p className="text-sm text-muted-foreground">
        From the HR payroll report: annualized FTE, headcount and office m² per service line. They are the keys for spreading back-office costs, and fill the FTE and m² rows.
      </p>
      <label className="flex items-center gap-2 text-sm">
        Year
        <SearchSelect
          size="sm"
          className="w-28"
          contentClassName="min-w-32"
          aria-label="Year"
          value={String(year)}
          onValueChange={(v) => setYear(Number(v))}
          options={[initialYear + 1, initialYear, initialYear - 1, initialYear - 2].map((y) => ({ value: String(y), label: String(y) }))}
        />
      </label>
      <table className="w-full max-w-2xl text-sm">
        <thead>
          <tr>
            <Th>Service line</Th>
            <Th>FTE</Th>
            <Th>Headcount</Th>
            <Th>Office m²</Th>
          </tr>
        </thead>
        <tbody>
          {data.serviceLines.map((sl) => {
            const r = row(sl);
            return (
              <tr key={sl} className="border-t border-border/60">
                <td className="px-3 py-1.5 font-semibold">{SERVICE_LINE_LABEL[sl] ?? sl}</td>
                {(['fte', 'headcount', 'sqm'] as const).map((f) => (
                  <td key={f} className="px-3 py-1.5">
                    <Input type="number" min={0} step="any" className="h-9 px-2" aria-label={`${SERVICE_LINE_LABEL[sl]} ${f}`} value={r[f] || ''} onChange={(e) => set(sl, f, e.target.value)} />
                  </td>
                ))}
              </tr>
            );
          })}
          <tr className="border-t-2 border-border font-bold">
            <td className="px-3 py-1.5">Total</td>
            <td className="px-3 py-1.5 tabular-nums">{Math.round(total('fte') * 10) / 10}</td>
            <td className="px-3 py-1.5 tabular-nums">{total('headcount')}</td>
            <td className="px-3 py-1.5 tabular-nums">{Math.round(total('sqm'))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
