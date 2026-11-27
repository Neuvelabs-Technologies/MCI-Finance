import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { tallyApi } from '@/api/tally.api';
import { ErrorState, LoadingState } from '@/components/common/StateViews';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fmtDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { TallyReport, TallySummary } from '@/types';
import { moneyWhole } from './money';

// Reports tab: quarter and year summary (all dates), profit and loss by ledger and sales by customer (chosen period).

/** Saves rows as a CSV file Excel opens. */
function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((v) => (typeof v === 'number' ? String(v) : `"${String(v).replace(/"/g, '""')}"`)).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

const CsvButton = ({ onClick }: { onClick: () => void }) => (
  <Button variant="outline" size="sm" onClick={onClick}>
    <Download /> CSV
  </Button>
);

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');
const safe = (s: string) => s.replace(/[^\w-]+/g, '_');

interface Row {
  label: string;
  income: number;
  expenses: number;
  year: boolean;
}

function QuarterYear({ source, company }: { source: string; company: string }) {
  const [data, setData] = useState<TallySummary | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await tallyApi.summary({ source, company }));
    } catch (e) {
      setError(e);
    }
  }, [source, company]);

  useEffect(() => {
    void load();
  }, [load]);

  // Calendar quarters, newest year first, each year followed by its total.
  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const years = new Map<string, Map<number, { income: number; expenses: number }>>();
    for (const m of data.monthly) {
      const [y, mo] = m.month.split('-');
      const q = Math.ceil(Number(mo) / 3);
      const qs = years.get(y) ?? new Map();
      const cur = qs.get(q) ?? { income: 0, expenses: 0 };
      cur.income += m.income;
      cur.expenses += m.expenses;
      qs.set(q, cur);
      years.set(y, qs);
    }
    const out: Row[] = [];
    for (const y of [...years.keys()].sort().reverse()) {
      const qs = years.get(y)!;
      let ti = 0;
      let te = 0;
      for (const q of [...qs.keys()].sort()) {
        const v = qs.get(q)!;
        ti += v.income;
        te += v.expenses;
        out.push({ label: `Q${q} ${y}`, income: v.income, expenses: v.expenses, year: false });
      }
      out.push({ label: `Year ${y}`, income: ti, expenses: te, year: true });
    }
    return out;
  }, [data]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  const max = Math.max(1, ...rows.filter((r) => !r.year).map((r) => Math.max(r.income, r.expenses)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quarter and year summary</CardTitle>
        <CardDescription>All dates in Tally, by calendar quarter (Q1 = January–March). Cancelled and optional vouchers left out.</CardDescription>
        <CardAction>
          <CsvButton
            onClick={() =>
              downloadCsv(`tally-quarters-${safe(company)}.csv`, [
                ['Period', 'Income (AED)', 'Expenses (AED)', 'Net (AED)', 'Margin'],
                ...rows.map((r) => [r.label, r.income, r.expenses, Math.round((r.income - r.expenses) * 100) / 100, pct(r.income - r.expenses, r.income)]),
              ])
            }
          />
        </CardAction>
      </CardHeader>
      <CardContent className="-mx-5 md:-mx-6">
        {!data ? (
          <LoadingState rows={3} className="px-5" />
        ) : rows.length === 0 ? (
          <p className="px-6 py-6 text-center text-sm text-muted-foreground">No income or expense entries yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5 md:pl-6">Period</TableHead>
                <TableHead className="text-right">Income</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="hidden w-48 pr-5 md:table-cell md:pr-6">
                  <span className="sr-only">Chart</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const net = r.income - r.expenses;
                return (
                  <TableRow key={r.label} className={cn(r.year && 'bg-muted/50 font-bold hover:bg-muted/50')}>
                    <TableCell className="pl-5 md:pl-6">{r.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{moneyWhole(r.income)}</TableCell>
                    <TableCell className="text-right tabular-nums">{moneyWhole(r.expenses)}</TableCell>
                    <TableCell className={cn('text-right tabular-nums', net < 0 && 'text-danger')}>{moneyWhole(net)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(net, r.income)}</TableCell>
                    <TableCell className="hidden pr-5 md:table-cell md:pr-6">
                      {r.year ? null : (
                        <span className="flex flex-col gap-1" aria-hidden>
                          <span className="h-1.5 rounded-r-full bg-chart-1" style={{ width: `max(${(r.income / max) * 100}%, 2px)` }} />
                          <span className="h-1.5 rounded-r-full bg-foreground/30" style={{ width: `max(${(r.expenses / max) * 100}%, 2px)` }} />
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ProfitAndLoss({ report, periodLabel }: { report: TallyReport; periodLabel: string }) {
  const income = report.pnl.filter((s) => s.kind === 'income');
  const expense = report.pnl.filter((s) => s.kind === 'expense');
  const ti = income.reduce((s, x) => s + x.total, 0);
  const te = expense.reduce((s, x) => s + x.total, 0);

  const Section = ({ title, sections, total }: { title: string; sections: TallyReport['pnl']; total: number }) => (
    <div className="flex flex-col gap-2">
      <p className="flex justify-between border-b border-border pb-1.5 text-sm font-bold">
        <span>{title}</span>
        <span className="tabular-nums">{moneyWhole(total)}</span>
      </p>
      {sections.length === 0 ? <p className="text-sm text-muted-foreground">None in this period.</p> : null}
      {sections.map((s) => (
        <details key={s.group} className="group rounded-lg" open={sections.length <= 2}>
          <summary className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm font-semibold hover:bg-muted">
            <span>
              {s.group} <span className="font-normal text-muted-foreground">· {s.ledgers.length}</span>
            </span>
            <span className="tabular-nums">{moneyWhole(s.total)}</span>
          </summary>
          <ul className="mt-1 mb-2 ml-4 flex flex-col">
            {s.ledgers.map((l) => (
              <li key={l.name} className="flex justify-between gap-3 border-b border-border/60 py-1 text-sm last:border-0">
                <span className="truncate" title={l.name}>
                  {l.name}
                </span>
                <span className="shrink-0 tabular-nums">{moneyWhole(l.amount)}</span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profit and loss by ledger</CardTitle>
        <CardDescription>{periodLabel}. Click a group to see its ledgers.</CardDescription>
        <CardAction>
          <CsvButton
            onClick={() =>
              downloadCsv(`tally-pnl-${safe(report.company)}.csv`, [
                ['Type', 'Group', 'Ledger', 'Amount (AED)'],
                ...report.pnl.flatMap((s) => s.ledgers.map((l) => [s.kind === 'income' ? 'Income' : 'Expense', s.group, l.name, l.amount])),
                ['', '', 'Net result', Math.round((ti - te) * 100) / 100],
              ])
            }
          />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-6 md:grid-cols-2">
          <Section title="Income" sections={income} total={ti} />
          <Section title="Expenses" sections={expense} total={te} />
        </div>
        <p className={cn('flex justify-between rounded-xl px-4 py-3 font-bold', ti - te < 0 ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success')}>
          <span>Net result</span>
          <span className="tabular-nums">
            {moneyWhole(ti - te)} <span className="font-normal">· {pct(ti - te, ti)} of income</span>
          </span>
        </p>
      </CardContent>
    </Card>
  );
}

function SalesByCustomer({ report, periodLabel }: { report: TallyReport; periodLabel: string }) {
  const total = report.customers.reduce((s, c) => s + c.amount, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sales by customer</CardTitle>
        <CardDescription>
          {periodLabel}. {report.customers.length} customers, {moneyWhole(total)} in sales vouchers.
        </CardDescription>
        <CardAction>
          <CsvButton
            onClick={() =>
              downloadCsv(`tally-sales-by-customer-${safe(report.company)}.csv`, [
                ['Customer', 'Sales (AED)', 'Share', 'Invoices', 'Last invoice'],
                ...report.customers.map((c) => [c.party, c.amount, pct(c.amount, total), c.count, c.last.slice(0, 10)]),
              ])
            }
          />
        </CardAction>
      </CardHeader>
      <CardContent className="-mx-5 md:-mx-6">
        {report.customers.length === 0 ? (
          <p className="px-6 py-6 text-center text-sm text-muted-foreground">No sales in this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5 md:pl-6">Customer</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Share</TableHead>
                <TableHead className="text-right">Invoices</TableHead>
                <TableHead className="pr-5 md:pr-6">Last invoice</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.customers.map((c) => (
                <TableRow key={c.party}>
                  <TableCell className="max-w-72 truncate pl-5 font-semibold md:pl-6" title={c.party}>
                    {c.party}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{moneyWhole(c.amount)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(c.amount, total)}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.count}</TableCell>
                  <TableCell className="pr-5 whitespace-nowrap md:pr-6">{fmtDate(c.last)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function TallyReports({ source, company, from, to, periodLabel }: { source: string; company: string; from?: string; to?: string; periodLabel: string }) {
  const [report, setReport] = useState<TallyReport | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setError(null);
    setReport(null);
    try {
      setReport(await tallyApi.report({ source, company, from, to }));
    } catch (e) {
      setError(e);
    }
  }, [source, company, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <QuarterYear source={source} company={company} />
      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !report ? (
        <LoadingState rows={3} />
      ) : (
        <>
          <ProfitAndLoss report={report} periodLabel={periodLabel} />
          <SalesByCustomer report={report} periodLabel={periodLabel} />
        </>
      )}
    </div>
  );
}
