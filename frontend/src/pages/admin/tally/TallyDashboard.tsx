import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Banknote, Database, HandCoins, Landmark, RefreshCw, Scale, TrendingUp, Wallet } from 'lucide-react';
import { tallyApi } from '@/api/tally.api';
import { PageHeader } from '@/components/common/PageHeader';
import { KpiStrip, StatCard } from '@/components/common/StatCard';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/StateViews';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fmtDate, fmtDateTime, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { TallyAmountRow, TallyCompany, TallySummary } from '@/types';
import { Input } from '@/components/ui/input';
import { ConnectorPanel } from './ConnectorPanel';
import { TallyReports } from './TallyReports';
import { TallyLedgers, TallyVouchers } from './TallyTables';
import { money, moneyShort, moneyWhole } from './money';

const PERIODS = {
  month: 'This month',
  lastmonth: 'Last month',
  quarter: 'This quarter',
  lastquarter: 'Last quarter',
  ytd: 'This year',
  lastyear: 'Last year',
  last12: 'Last 12 months',
  all: 'All dates',
  custom: 'Custom dates…',
} as const;
type Period = keyof typeof PERIODS;

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const qName = (d: Date) => `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;

/** Dates for a period (calendar quarters: Q1 = January–March), and a label that names them. */
function periodRange(p: Period, custom: { from?: string; to?: string }): { from?: string; to?: string; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const monthLabel = (d: Date) => d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  switch (p) {
    case 'month':
      return { from: ymd(new Date(y, m, 1)), to: ymd(now), label: monthLabel(now) };
    case 'lastmonth': {
      const s = new Date(y, m - 1, 1);
      return { from: ymd(s), to: ymd(new Date(y, m, 0)), label: monthLabel(s) };
    }
    case 'quarter': {
      const s = new Date(y, Math.floor(m / 3) * 3, 1);
      return { from: ymd(s), to: ymd(now), label: `${qName(s)} (to date)` };
    }
    case 'lastquarter': {
      const s = new Date(y, Math.floor(m / 3) * 3 - 3, 1);
      return { from: ymd(s), to: ymd(new Date(s.getFullYear(), s.getMonth() + 3, 0)), label: qName(s) };
    }
    case 'ytd':
      return { from: `${y}-01-01`, to: ymd(now), label: `${y} to date` };
    case 'lastyear':
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: String(y - 1) };
    case 'last12':
      return { from: ymd(new Date(y, m - 11, 1)), to: ymd(now), label: 'Last 12 months' };
    case 'custom':
      return {
        from: custom.from,
        to: custom.to,
        label: custom.from || custom.to ? `${custom.from ? fmtDate(custom.from) : 'Start'} – ${custom.to ? fmtDate(custom.to) : 'today'}` : 'All dates',
      };
    default:
      return { label: 'All dates' };
  }
}

const SOURCE_LABEL: Record<string, string> = { gold: 'Tally Gold', erp9: 'Tally ERP 9' };
const sourceLabel = (s: string) => SOURCE_LABEL[s] ?? s;
const companyKey = (c: { source: string; company: string }) => `${c.source}|${c.company}`;

const TABS = ['overview', 'reports', 'vouchers', 'ledgers'] as const;
type Tab = (typeof TABS)[number];

export default function TallyDashboard() {
  const [params, setParams] = useSearchParams();
  const [companies, setCompanies] = useState<TallyCompany[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'overview';
  const period: Period = (params.get('period') as Period) in PERIODS ? (params.get('period') as Period) : 'ytd';
  const range = periodRange(period, { from: params.get('from') ?? undefined, to: params.get('to') ?? undefined });
  const [refreshKey, setRefreshKey] = useState(0);

  const set = useCallback(
    (patch: Record<string, string>) => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(patch)) next.set(k, v);
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  const loadCompanies = useCallback(async () => {
    setError(null);
    try {
      setCompanies((await tallyApi.companies()).companies);
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    document.title = 'Tally reports — MCI Finance';
    void loadCompanies();
  }, [loadCompanies]);

  // The chosen company, else the first Gold one, else the first.
  const selected = useMemo(() => {
    if (!companies?.length) return null;
    return companies.find((c) => companyKey(c) === params.get('c')) ?? companies.find((c) => c.source === 'gold') ?? companies[0];
  }, [companies, params]);

  // A sync finished: reload companies and the figures on screen.
  const onSynced = useCallback(() => {
    void loadCompanies();
    setRefreshKey((n) => n + 1);
  }, [loadCompanies]);

  if (error) return <ErrorState error={error} onRetry={loadCompanies} />;
  const dataKey = selected ? `${companyKey(selected)}|${range.from ?? ''}|${range.to ?? ''}|${refreshKey}` : '';

  return (
    <>
      <PageHeader
        title="Tally reports"
        subtitle="Accounts copied from Tally by the connector on MCI's Tally server. Read-only: nothing here changes Tally."
        badges={selected ? <SyncBadge company={selected} /> : null}
        actions={
          companies && companies.length > 0 ? (
            <>
              {companies.length > 1 ? (
                <Select value={selected ? companyKey(selected) : undefined} onValueChange={(v) => set({ c: v })}>
                  <SelectTrigger className="w-64" aria-label="Tally company">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={companyKey(c)} value={companyKey(c)}>
                        {c.company} · {sourceLabel(c.source)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <Select value={period} onValueChange={(v) => set({ period: v })}>
                <SelectTrigger className="w-44" aria-label="Period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PERIODS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {period === 'custom' ? (
                <span className="flex items-center gap-2">
                  <Input type="date" className="w-40" aria-label="From date" value={params.get('from') ?? ''} onChange={(e) => set({ from: e.target.value })} />
                  <span className="text-muted-foreground">to</span>
                  <Input type="date" className="w-40" aria-label="To date" value={params.get('to') ?? ''} onChange={(e) => set({ to: e.target.value })} />
                </span>
              ) : null}
            </>
          ) : null
        }
      />

      <ConnectorPanel source={selected?.source ?? 'gold'} onSynced={onSynced} />

      {!companies ? (
        <LoadingState rows={4} />
      ) : !selected ? (
        <EmptyState
          icon={Database}
          title="No Tally data yet"
          description="No accounts have arrived from Tally yet. The panel above says why (for example, Tally not open, or no company loaded). Figures appear here after the first sync."
          action={
            <Button variant="outline" onClick={loadCompanies}>
              <RefreshCw /> Check again
            </Button>
          }
        />
      ) : (
        <Tabs value={tab} onValueChange={(v) => set({ tab: v })}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="vouchers">Vouchers</TabsTrigger>
            <TabsTrigger value="ledgers">Ledgers</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <Overview key={dataKey} company={selected} range={range} periodLabel={range.label} />
          </TabsContent>
          <TabsContent value="reports">
            <TallyReports key={dataKey} source={selected.source} company={selected.company} from={range.from} to={range.to} periodLabel={range.label} />
          </TabsContent>
          <TabsContent value="vouchers">
            <TallyVouchers key={dataKey} source={selected.source} company={selected.company} from={range.from} to={range.to} />
          </TabsContent>
          <TabsContent value="ledgers">
            <TallyLedgers key={`${companyKey(selected)}|${refreshKey}`} source={selected.source} company={selected.company} />
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}

function SyncBadge({ company }: { company: TallyCompany }) {
  const s = company.lastSync;
  if (!s) return <Badge variant="neutral">Never synced</Badge>;
  // The connector runs every 15 minutes while Tally is open; an hour without a sync is worth a look.
  const stale = Date.now() - new Date(s.at).getTime() > 60 * 60 * 1000;
  return (
    <>
      <Badge variant="primary">{sourceLabel(company.source)}</Badge>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0}>
            <Badge variant={!s.ok ? 'danger' : stale ? 'warning' : 'success'}>
              {!s.ok ? 'Last sync failed' : 'Synced'} {relativeTime(s.at)}
            </Badge>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {fmtDateTime(s.at)}
          {s.host ? ` from ${s.host}` : ''}
          {s.error ? ` — ${s.error}` : ''}
          {stale && s.ok ? ' — no sync for over an hour: is Tally open with this company loaded?' : ''}
        </TooltipContent>
      </Tooltip>
    </>
  );
}

// ---------------- Overview ----------------

function Overview({ company, range, periodLabel }: { company: TallyCompany; range: { from?: string; to?: string }; periodLabel: string }) {
  const [data, setData] = useState<TallySummary | null>(null);
  const [error, setError] = useState<unknown>(null);
  const { source, company: name } = company;
  const { from, to } = range;

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await tallyApi.summary({ source, company: name, from, to }));
    } catch (e) {
      setError(e);
    }
  }, [source, name, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  const k = data?.kpis;

  return (
    <div className="flex flex-col gap-6">
      <KpiStrip>
        <StatCard label="Income" value={k ? moneyShort(k.income) : ''} icon={TrendingUp} tone="primary" loading={!data} hint={periodLabel} />
        <StatCard label="Expenses" value={k ? moneyShort(k.expenses) : ''} icon={ArrowDownRight} tone="warning" loading={!data} hint={periodLabel} />
        <StatCard
          label="Net result"
          value={k ? moneyShort(k.net) : ''}
          icon={Scale}
          tone={k && k.net < 0 ? 'danger' : 'success'}
          loading={!data}
          hint={k && k.income ? `${Math.round((k.net / k.income) * 100)}% of income` : periodLabel}
        />
        <StatCard label="Receivables" value={k ? moneyShort(k.receivables) : ''} icon={HandCoins} tone="info" loading={!data} hint="Owed to MCI today" />
        <StatCard label="Payables" value={k ? moneyShort(k.payables) : ''} icon={Wallet} loading={!data} hint="MCI owes today" />
        <StatCard label="Cash & bank" value={k ? moneyShort(k.cash) : ''} icon={Landmark} tone="success" loading={!data} hint="Balance today" />
      </KpiStrip>

      {!data ? (
        <LoadingState rows={3} />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <MonthlyCard data={data} />
            <TopCustomers data={data} />
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <BalanceList title="Who owes MCI" description="Largest customer balances today (Sundry Debtors)." rows={data.receivables} total={data.kpis.receivables} icon={ArrowUpRight} />
            <BalanceList title="Who MCI owes" description="Largest supplier balances today (Sundry Creditors)." rows={data.payables} total={data.kpis.payables} icon={ArrowDownRight} />
            <BalanceList title="Cash and bank" description="Every bank and cash ledger." rows={data.cash} total={data.kpis.cash} icon={Banknote} showGroup />
          </div>
          <SyncHistory data={data} company={company} />
        </>
      )}
    </div>
  );
}

function MonthlyCard({ data }: { data: TallySummary }) {
  const max = Math.max(1, ...data.monthly.flatMap((m) => [m.income, m.expenses]));
  const monthName = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Income and expenses by month</CardTitle>
        <CardDescription>From the ledger lines of every voucher (cancelled and optional vouchers left out).</CardDescription>
        <CardAction>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-chart-1" aria-hidden /> Income
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm bg-foreground/30" aria-hidden /> Expenses
            </span>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {data.monthly.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No income or expense entries in this period.</p>
        ) : (
          <div className="flex h-60 items-end gap-2 overflow-x-auto border-b border-border pb-px" role="list" aria-label="Income and expenses by month">
            {data.monthly.map((m) => (
              <Tooltip key={m.month}>
                <TooltipTrigger asChild>
                  <div role="listitem" tabIndex={0} className="flex h-full min-w-7 flex-1 flex-col justify-end outline-none">
                    <div className="flex h-full items-end justify-center gap-1">
                      <span className="w-1/2 max-w-5 rounded-t-[4px] bg-chart-1" style={{ height: `max(${(m.income / max) * 100}%, 2px)` }} aria-hidden />
                      <span className="w-1/2 max-w-5 rounded-t-[4px] bg-foreground/30" style={{ height: `max(${(m.expenses / max) * 100}%, 2px)` }} aria-hidden />
                    </div>
                    <span className="mt-1.5 truncate text-center text-[11px] text-muted-foreground">{monthName(m.month)}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <b>{monthName(m.month)}</b>: income {money(m.income)} · expenses {money(m.expenses)} · net {money(m.income - m.expenses)}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TopCustomers({ data }: { data: TallySummary }) {
  const max = Math.max(1, ...data.topCustomers.map((c) => c.amount));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top customers</CardTitle>
        <CardDescription>Sales vouchers in the period, by party.</CardDescription>
      </CardHeader>
      <CardContent>
        {data.topCustomers.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No sales in this period.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {data.topCustomers.map((c) => (
              <li key={c.party} className="flex flex-col gap-1">
                <span className="truncate text-sm font-semibold" title={c.party}>
                  {c.party}
                </span>
                <span className="h-1.5 rounded-r-full bg-chart-1/80" style={{ width: `max(${(c.amount / max) * 100}%, 2px)` }} aria-hidden />
                <span className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground tabular-nums">{moneyWhole(c.amount)}</span> · {c.count} invoice{c.count === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function BalanceList({
  title,
  description,
  rows,
  total,
  icon: Icon,
  showGroup,
}: {
  title: string;
  description: string;
  rows: TallyAmountRow[];
  total: number;
  icon: typeof Banknote;
  showGroup?: boolean;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon size={17} className="text-muted-foreground" aria-hidden /> {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-2xl leading-none font-bold tabular-nums">{moneyWhole(total)}</p>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing outstanding.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={`${r.group}|${r.name}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate" title={r.name}>
                    {r.name}
                  </span>
                  {showGroup ? <span className="block text-xs text-muted-foreground">{r.group}</span> : null}
                </span>
                <span className={cn('shrink-0 font-semibold tabular-nums', r.amount < 0 && 'text-danger')} title={money(r.amount)}>
                  {moneyWhole(r.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SyncHistory({ data, company }: { data: TallySummary; company: TallyCompany }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Connector</CardTitle>
        <CardDescription>
          {data.voucherCount.toLocaleString('en-GB')} vouchers on record
          {company.firstDate ? `, dated ${fmtDate(company.firstDate)} to ${fmtDate(company.latestDate)}` : ''}. The connector sends changes every 15 minutes while Tally is open.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.syncs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No syncs recorded.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {data.syncs.map((s) => (
              <li key={s._id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Badge variant={s.ok ? 'success' : 'danger'}>{s.ok ? 'OK' : 'Failed'}</Badge>
                <span className="tabular-nums">{fmtDateTime(s.at)}</span>
                <span className="text-muted-foreground">
                  {s.full ? 'Full sync · ' : ''}
                  {s.vouchers} vouchers · {s.ledgers} ledgers · {(s.durationMs / 1000).toFixed(1)} s{s.host ? ` · ${s.host}` : ''}
                  {s.connectorVersion ? ` · v${s.connectorVersion}` : ''}
                </span>
                {s.error ? <span className="w-full text-danger">{s.error}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
