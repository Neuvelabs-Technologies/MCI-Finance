import { Fragment, useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search } from 'lucide-react';
import { tallyApi } from '@/api/tally.api';
import { ErrorState, LoadingState } from '@/components/common/StateViews';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fmtDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { TallyLedger, TallyVoucher } from '@/types';
import { money } from './money';

const LIMIT = 50;
const ALL = '__all';

/** Waits until typing stops before searching. */
function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function Toolbar({
  search,
  onSearch,
  placeholder,
  filter,
  onFilter,
  options,
  allLabel,
}: {
  search: string;
  onSearch: (s: string) => void;
  placeholder: string;
  filter: string;
  onFilter: (s: string) => void;
  options: string[];
  allLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-56 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input className="pl-9" value={search} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      </div>
      <Select value={filter || ALL} onValueChange={(v) => onFilter(v === ALL ? '' : v)}>
        <SelectTrigger className="w-56" aria-label={allLabel}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / LIMIT));
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>
        {total === 0 ? 'Nothing found' : `${((page - 1) * LIMIT + 1).toLocaleString('en-GB')}–${Math.min(page * LIMIT, total).toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')}`}
      </span>
      <span className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <span className="tabular-nums">
          {page} / {pages}
        </span>
        <Button variant="ghost" size="icon" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page">
          <ChevronRight />
        </Button>
      </span>
    </div>
  );
}

const shell = 'overflow-hidden rounded-2xl border border-border bg-card';

// ---------------- Vouchers ----------------

export function TallyVouchers({ source, company, from, to }: { source: string; company: string; from?: string; to?: string }) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [data, setData] = useState<{ items: TallyVoucher[]; total: number; types: string[] } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const q = useDebounced(search);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await tallyApi.vouchers({ source, company, from, to, type, q, page, limit: LIMIT }));
    } catch (e) {
      setError(e);
    }
  }, [source, company, from, to, type, q, page]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <div className="flex flex-col gap-4">
      <Toolbar
        search={search}
        onSearch={(s) => {
          setSearch(s);
          setPage(1);
        }}
        placeholder="Search party, number, narration…"
        filter={type}
        onFilter={(t) => {
          setType(t);
          setPage(1);
        }}
        options={data?.types ?? []}
        allLabel="All voucher types"
      />
      {!data ? (
        <LoadingState rows={6} />
      ) : (
        <>
          <div className={shell}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Number</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="pr-5">
                    <span className="sr-only">Details</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((v) => (
                  <Fragment key={v._id}>
                    <TableRow className={cn('cursor-pointer', open === v._id && 'bg-muted/50')} onClick={() => setOpen(open === v._id ? null : v._id)}>
                      <TableCell className="pl-5 whitespace-nowrap tabular-nums">{fmtDate(v.date)}</TableCell>
                      <TableCell>
                        <span className="block">{v.voucherType}</span>
                        {v.baseType && v.baseType !== v.voucherType ? <span className="block text-xs text-muted-foreground">{v.baseType}</span> : null}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{v.number || '—'}</TableCell>
                      <TableCell className="max-w-72">
                        <span className="block truncate">{v.party || '—'}</span>
                        {v.cancelled ? <Badge variant="danger">Cancelled</Badge> : v.optional ? <Badge variant="neutral">Optional</Badge> : null}
                      </TableCell>
                      <TableCell className="text-right font-semibold whitespace-nowrap tabular-nums">{money(v.amount)}</TableCell>
                      <TableCell className="pr-5 text-right">
                        <span className="inline-flex text-muted-foreground" aria-label={open === v._id ? 'Hide lines' : 'Show lines'}>
                          {open === v._id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </span>
                      </TableCell>
                    </TableRow>
                    {open === v._id ? (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={6} className="px-5 py-4">
                          {v.narration ? <p className="mb-3 text-sm text-muted-foreground">{v.narration}</p> : null}
                          <table className="w-full max-w-2xl text-sm">
                            <thead>
                              <tr className="text-left text-xs text-muted-foreground">
                                <th className="pb-1 font-semibold">Ledger</th>
                                <th className="pb-1 font-semibold">Group</th>
                                <th className="pb-1 text-right font-semibold">Debit</th>
                                <th className="pb-1 text-right font-semibold">Credit</th>
                              </tr>
                            </thead>
                            <tbody>
                              {v.entries.map((e, i) => (
                                <tr key={`${e.ledger}-${i}`}>
                                  <td className="py-0.5 pr-3">{e.ledger}</td>
                                  <td className="py-0.5 pr-3 text-muted-foreground">{e.group}</td>
                                  <td className="py-0.5 text-right tabular-nums">{e.amount < 0 ? money(-e.amount) : ''}</td>
                                  <td className="py-0.5 text-right tabular-nums">{e.amount > 0 ? money(e.amount) : ''}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager page={page} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}

// ---------------- Ledgers ----------------

/** Tally shows debit balances as negative; show them the way accountants read them. */
const drCr = (n: number) => (n === 0 ? money(0) : `${money(Math.abs(n))} ${n < 0 ? 'Dr' : 'Cr'}`);

export function TallyLedgers({ source, company }: { source: string; company: string }) {
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: TallyLedger[]; total: number; groups: string[] } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const q = useDebounced(search);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await tallyApi.ledgers({ source, company, group, q, page, limit: LIMIT }));
    } catch (e) {
      setError(e);
    }
  }, [source, company, group, q, page]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState error={error} onRetry={load} />;

  return (
    <div className="flex flex-col gap-4">
      <Toolbar
        search={search}
        onSearch={(s) => {
          setSearch(s);
          setPage(1);
        }}
        placeholder="Search ledger or parent group…"
        filter={group}
        onFilter={(g) => {
          setGroup(g);
          setPage(1);
        }}
        options={data?.groups ?? []}
        allLabel="All groups"
      />
      {!data ? (
        <LoadingState rows={6} />
      ) : (
        <>
          <div className={shell}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Ledger</TableHead>
                  <TableHead>Under</TableHead>
                  <TableHead>Primary group</TableHead>
                  <TableHead className="text-right">Opening</TableHead>
                  <TableHead className="pr-5 text-right">Closing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((l) => (
                  <TableRow key={l._id}>
                    <TableCell className="pl-5 font-semibold">{l.name}</TableCell>
                    <TableCell className="text-muted-foreground">{l.parent}</TableCell>
                    <TableCell className="text-muted-foreground">{l.group}</TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">{drCr(l.opening)}</TableCell>
                    <TableCell className="pr-5 text-right font-semibold whitespace-nowrap tabular-nums">{drCr(l.closing)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager page={page} total={data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
