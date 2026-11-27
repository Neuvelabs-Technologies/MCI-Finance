import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ChevronRight, Download, Settings2, Upload } from 'lucide-react';
import { errorMessage } from '@/api/client';
import { tallyApi } from '@/api/tally.api';
import { ErrorState, LoadingState } from '@/components/common/StateViews';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SearchSelect } from '@/components/ui/search-select';
import { fmtDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { GroupPlReport } from '@/types';
import { GroupPlSetup } from './GroupPlSetup';
import { moneyWhole } from './money';

// Group P&L tab: MCI Group's management P&L, actual from Tally (year to date) next to the uploaded
// full-year forecast. Same rows and columns as the group planning tool's export.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const VIEWS = { compare: 'Actual vs Forecast', actual: 'Actual', forecast: 'Forecast' } as const;
type View = keyof typeof VIEWS;

const num0 = new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 });
const num1 = new Intl.NumberFormat('en-AE', { maximumFractionDigits: 1 });
const num2 = new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Figures as the group report shows them: whole AED, FTE with one decimal, ratios with two. */
function fmt(code: string, kind: string, v: number | null | undefined): string {
  if (v === null || v === undefined) return '';
  if (kind === 'ratio' && code !== 'GMPERFTE') return num2.format(v);
  if (code === 'TOT ANNUAL FTE') return num1.format(v);
  const s = num0.format(Math.round(v));
  return s === '-0' ? '0' : s;
}

const ROW_CLASS: Record<string, string> = {
  highlighted: 'bg-muted/60 font-bold',
  subtotal: 'font-bold border-t-2 border-border',
  total: 'font-bold bg-primary-soft/50 border-y-2 border-primary/30',
};

export function GroupPl({ source, company }: { source: string; company: string }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState<number | undefined>(undefined);
  const [view, setView] = useState<View>('compare');
  const [column, setColumn] = useState('office');
  const [forecastId, setForecastId] = useState<string | undefined>(undefined);
  const [data, setData] = useState<GroupPlReport | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const q = useMemo(() => ({ source, company, year, month, forecastId }), [source, company, year, month, forecastId]);
  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await tallyApi.groupPl(q));
    } catch (e) {
      setError(e);
    }
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(file: File) {
    setUploading(true);
    try {
      const r = await tallyApi.uploadForecast({ source, company, year }, file);
      toast.success(`Forecast uploaded: ${[r.label, r.entity].filter(Boolean).join(' · ') || file.name} (${r.year})`, {
        description: `${r.rows} rows read.${r.unknownCodes.length ? ` Not in the report and left out: ${r.unknownCodes.join(', ')}.` : ''}`,
      });
      setForecastId(undefined);
      if (r.year !== year) setYear(r.year);
      else await load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <LoadingState rows={8} />;

  const actual = new Map(data.actual.rows.map((r) => [r.code, r.values]));
  const forecast = data.forecast ? new Map(data.forecast.rows.map((r) => [r.code, r.values])) : null;
  const colIdx = Math.max(0, data.columns.findIndex((c) => c.key === column));
  const effectiveView: View = !forecast && view !== 'actual' ? 'actual' : view;
  const years = [now.getFullYear() + 1, now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];
  const w = data.actual.warnings;
  const unmappedTotal = w.unmapped.reduce((s, u) => s + u.amount, 0);
  const notSetUp = data.setupStatus.accounts === 0;

  const toggle = (code: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(code)) n.delete(code);
      else n.add(code);
      return n;
    });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Group P&L</CardTitle>
          <CardDescription>
            Actual from Tally, {data.periodLabel}
            {data.forecast ? (
              <>
                {' '}
                · Forecast: {[data.forecast.label, data.forecast.version].filter(Boolean).join(' · ') || data.forecast.fileName} (full year {data.year}), uploaded {fmtDateTime(data.forecast.uploadedAt)}
                {data.forecast.uploadedBy ? ` by ${data.forecast.uploadedBy}` : ''}
              </>
            ) : (
              <> · No forecast uploaded for {data.year}</>
            )}
            . AED.
          </CardDescription>
          <CardAction className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setSetupOpen(true)}>
              <Settings2 /> Setup
            </Button>
            <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileInput.current?.click()}>
              <Upload /> {uploading ? 'Uploading…' : 'Upload forecast'}
            </Button>
            <input ref={fileInput} type="file" accept=".xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
            <Button variant="outline" size="sm" asChild>
              <a href={tallyApi.groupPlExportUrl({ ...q, month: data.month })} download>
                <Download /> Excel
              </a>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <SearchSelect
            className="w-28"
            contentClassName="min-w-32"
            aria-label="Year"
            value={String(year)}
            onValueChange={(v) => (setYear(Number(v)), setMonth(undefined), setForecastId(undefined))}
            options={years.map((y) => ({ value: String(y), label: String(y) }))}
          />
          <SearchSelect
            className="w-52"
            aria-label="Actual up to"
            value={String(data.month)}
            onValueChange={(v) => setMonth(Number(v))}
            options={MONTHS.map((m, i) => ({ value: String(i + 1), label: `Actual to end of ${m}` }))}
          />
          <SearchSelect
            className="w-48"
            aria-label="View"
            value={effectiveView}
            onValueChange={(v) => setView(v as View)}
            options={Object.entries(VIEWS).map(([k, label]) => ({ value: k, label, disabled: k !== 'actual' && !forecast }))}
          />
          {effectiveView === 'compare' ? (
            <SearchSelect className="w-56" aria-label="Column" value={column} onValueChange={setColumn} options={data.columns.map((c) => ({ value: c.key, label: c.label }))} />
          ) : null}
          {data.forecasts.length > 1 ? (
            <SearchSelect
              className="w-72"
              aria-label="Forecast"
              value={data.forecast?.id}
              onValueChange={setForecastId}
              options={data.forecasts.map((f, i) => ({ value: f.id, label: `${f.label || f.fileName} · ${fmtDateTime(f.uploadedAt)}${i === 0 ? ' (latest)' : ''}` }))}
            />
          ) : null}
        </CardContent>
      </Card>

      {notSetUp ? (
        <Notice tone="info" title="Not set up yet">
          Tally ledgers aren't linked to group accounts yet, so the actual columns are empty. Open <b>Setup</b> to link ledgers (or whole Tally groups), give each project its service line, and enter FTE and m² from the HR
          report.
        </Notice>
      ) : null}
      {!notSetUp && (w.unmapped.length > 0 || w.unassignedProjects.length > 0 || w.noProject !== 0 || w.missingBasis.length > 0 || !data.setupStatus.hrYear) ? (
        <Notice tone="warning" title="Check before using these figures">
          <ul className="list-disc pl-5">
            {w.unmapped.length > 0 ? (
              <li>
                {w.unmapped.length} income or expense ledger(s) aren't linked to a group account and are left out ({moneyWhole(unmappedTotal)} in Tally's sign), e.g. {w.unmapped
                  .slice(0, 3)
                  .map((u) => u.ledger)
                  .join(', ')}
                .
              </li>
            ) : null}
            {w.unassignedProjects.length > 0 ? <li>{w.unassignedProjects.length} project(s) have no service line yet: their revenue and cost of sales are in Back-Office.</li> : null}
            {w.noProject !== 0 ? <li>{moneyWhole(w.noProject)} of revenue / cost of sales has no project (cost centre) in Tally: shown in Back-Office.</li> : null}
            {!data.setupStatus.hrYear ? <li>No FTE, headcount or m² entered for {data.year}: costs spread by those keys stay in Back-Office.</li> : null}
            {data.setupStatus.hrYear && w.missingBasis.length > 0 ? <li>Nothing to spread by ({w.missingBasis.join(', ')}) for {data.year}: those costs stay in Back-Office.</li> : null}
          </ul>
          <Button variant="outline" size="sm" className="mt-2 w-fit" onClick={() => setSetupOpen(true)}>
            <Settings2 /> Open setup
          </Button>
        </Notice>
      ) : null}

      <Card className="overflow-hidden p-0">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-primary text-primary-foreground">
              <tr>
                <th className="sticky left-0 z-20 min-w-80 bg-primary px-3 py-2 text-left font-bold">Account</th>
                {effectiveView === 'compare' ? (
                  <>
                    <th className="px-3 py-2 text-right font-bold whitespace-nowrap">Actual (to {MONTHS[data.month - 1].slice(0, 3)})</th>
                    <th className="px-3 py-2 text-right font-bold whitespace-nowrap">Forecast (year)</th>
                    <th className="px-3 py-2 text-right font-bold whitespace-nowrap">Variance</th>
                    <th className="px-3 py-2 text-right font-bold whitespace-nowrap">% of forecast</th>
                  </>
                ) : (
                  data.columns.map((c) => (
                    <th key={c.key} className="min-w-28 px-3 py-2 text-right font-bold">
                      {c.label}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {data.chart.map((row) => {
                const a = actual.get(row.code);
                const f = forecast?.get(row.code);
                const detail = data.actual.detail[row.code];
                const canOpen = row.kind === 'leaf' && !!detail?.length && effectiveView !== 'forecast';
                const isOpen = canOpen && open.has(row.code);
                const values = effectiveView === 'forecast' ? f : a;
                const av = a?.[colIdx] ?? null;
                const fv = f?.[colIdx] ?? null;
                const variance = av !== null && fv !== null ? av - fv : null;
                const share = av !== null && fv ? av / fv : null;
                return (
                  <Fragment key={row.code}>
                    <tr className={cn('border-b border-border/70 hover:bg-muted/40', ROW_CLASS[row.style])}>
                      <td className={cn('sticky left-0 z-[1] bg-card px-3 py-1.5', row.style === 'highlighted' && 'bg-muted', row.style === 'total' && 'bg-primary-soft')}>
                        {canOpen ? (
                          <button type="button" className="flex items-center gap-1 text-left hover:underline" onClick={() => toggle(row.code)} aria-expanded={isOpen}>
                            <ChevronRight className={cn('size-3.5 shrink-0 transition-transform', isOpen && 'rotate-90')} />
                            {row.name}
                          </button>
                        ) : (
                          <span className={row.kind === 'leaf' ? 'pl-[18px]' : ''}>{row.name || row.code}</span>
                        )}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">{row.code}</span>
                      </td>
                      {effectiveView === 'compare' ? (
                        <>
                          <Num v={av} code={row.code} kind={row.kind} />
                          <Num v={fv} code={row.code} kind={row.kind} />
                          <Num v={row.kind === 'ratio' ? null : variance} code={row.code} kind={row.kind} />
                          <td className="px-3 py-1.5 text-right text-muted-foreground tabular-nums">{row.kind === 'ratio' || row.kind === 'stat' || share === null ? '' : `${Math.round(share * 100)}%`}</td>
                        </>
                      ) : (
                        data.columns.map((c, i) => <Num key={c.key} v={values?.[i] ?? null} code={row.code} kind={row.kind} />)
                      )}
                    </tr>
                    {isOpen
                      ? detail!.map((d) => (
                          <tr key={`${row.code}|${d.ledger}`} className="border-b border-border/40 bg-muted/20 text-xs text-muted-foreground">
                            <td className="sticky left-0 bg-card py-1 pr-3 pl-10">{d.ledger}</td>
                            <td className="px-3 py-1 text-right tabular-nums">{num0.format(d.amount)}</td>
                            <td colSpan={effectiveView === 'compare' ? 3 : data.columns.length - 1} className="px-3 py-1">
                              Tally ledger, total for the period before spreading
                            </td>
                          </tr>
                        ))
                      : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-muted-foreground">
        Pipeline rows (closed, contracted, prospects…) come from the forecast only. Actual gross margin is Tally revenue less cost of sales. Back-office costs are spread over the service lines here, by the key set for
        each account; nothing is written to Tally.
      </p>

      <GroupPlSetup
        open={setupOpen}
        onOpenChange={setSetupOpen}
        source={source}
        company={company}
        year={data.year}
        onSaved={() => {
          void load();
        }}
      />
    </div>
  );
}

function Num({ v, code, kind }: { v: number | null; code: string; kind: string }) {
  return <td className={cn('px-3 py-1.5 text-right whitespace-nowrap tabular-nums', v !== null && v < -0.5 && kind !== 'ratio' && 'text-danger')}>{fmt(code, kind, v)}</td>;
}

function Notice({ tone, title, children }: { tone: 'info' | 'warning'; title: string; children: ReactNode }) {
  return (
    <div className={cn('flex gap-3 rounded-xl border p-4 text-sm', tone === 'warning' ? 'border-warning/40 bg-warning-soft' : 'border-info/40 bg-info-soft')}>
      <AlertTriangle className={cn('mt-0.5 size-4 shrink-0', tone === 'warning' ? 'text-warning' : 'text-info')} />
      <div className="flex flex-col gap-1">
        <p className="font-bold">{title}</p>
        {children}
      </div>
    </div>
  );
}
