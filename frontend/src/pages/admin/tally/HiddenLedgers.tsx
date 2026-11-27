import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { errorMessage } from '@/api/client';
import { tallyApi } from '@/api/tally.api';
import { ErrorState, LoadingState } from '@/components/common/StateViews';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { fmtDate } from '@/lib/format';
import type { TallyHiddenLedgers } from '@/types';
import { money } from './money';

// Hidden ledgers: a clean-up of old ledgers that stay in Tally but should not show in any report here.
// Keep entryHides in step with backend/src/modules/tally/tally.hidden.ts.

/** Does this entry (a code or a full name) hide the ledger? "1000" hides "1000-Cash" but not "100001-Bank". */
function entryHides(entry: string, ledgerName: string): boolean {
  const e = entry.trim().toLowerCase();
  const n = ledgerName.trim().toLowerCase();
  if (!e || !n.startsWith(e)) return false;
  const next = n.charAt(e.length);
  return next === '' || !/[a-z0-9]/.test(next) || !/[a-z0-9]$/.test(e);
}

/** One entry per line; commas also separate (ledger names with commas can go on their own line). */
function parseEntries(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const parts = /^\d/.test(line.trim()) && line.includes(',') ? line.split(',') : [line];
    for (const p of parts) {
      const e = p.trim();
      if (e && !seen.has(e.toLowerCase())) {
        seen.add(e.toLowerCase());
        out.push(e);
      }
    }
  }
  return out;
}

const drCr = (n: number) => (n === 0 ? money(0) : `${money(Math.abs(n))} ${n < 0 ? 'Dr' : 'Cr'}`);

export function HiddenLedgersDialog({
  source,
  company,
  open,
  onOpenChange,
  onSaved,
}: {
  source: string;
  company: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<TallyHiddenLedgers | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      const d = await tallyApi.hiddenLedgers({ source, company });
      setData(d);
      setText(d.entries.join('\n'));
    } catch (e) {
      setError(e);
    }
  }, [source, company]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const entries = useMemo(() => parseEntries(text), [text]);
  const preview = useMemo(() => {
    const all = data?.all ?? [];
    const hidden = all.filter((l) => entries.some((e) => entryHides(e, l.name)));
    const unmatched = entries.filter((e) => !all.some((l) => entryHides(e, l.name)));
    return { hidden, unmatched, withBalance: hidden.filter((l) => Math.abs(l.closing) >= 0.005) };
  }, [data, entries]);

  async function restoreGroup(name: string) {
    try {
      const d = await tallyApi.restoreToReports({ source, company }, 'group', name);
      setData((cur) => (cur ? { ...d, all: cur.all } : d));
      toast.success(`"${name}" is back in the reports`);
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function save() {
    setSaving(true);
    try {
      const d = await tallyApi.saveHiddenLedgers({ source, company }, entries);
      toast.success(d.ledgers.length ? `${d.ledgers.length} ledger(s) hidden from reports` : 'No ledgers hidden');
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
      <DialogContent className="flex max-h-[92vh] w-[min(1100px,96vw)] max-w-none flex-col sm:max-w-none">
        <DialogHeader>
          <DialogTitle>Hidden ledgers · {company}</DialogTitle>
          <DialogDescription>
            Old ledgers you keep in Tally but don't want in reports here. They are left out of the ledger list, balances, P&L, top customers and Group P&L. Nothing changes in
            Tally, and you can show them again by removing them from this list.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <ErrorState error={error} onRetry={load} />
        ) : !data ? (
          <LoadingState rows={5} />
        ) : (
          <div className="grid min-h-0 flex-1 gap-5 overflow-hidden md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="flex min-h-0 flex-col gap-2">
              <label htmlFor="hidden-ledgers" className="text-sm font-semibold">
                Ledger numbers
              </label>
              <p className="text-sm text-muted-foreground">
                One per line (or separated by commas). A number hides the ledger whose name starts with it: <span className="font-medium text-foreground">1000147</span> hides
                “1000147 - ASME-4102…”, not “10001470…”. A full ledger name also works.
              </p>
              <Textarea
                id="hidden-ledgers"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={'1000147\n1000152\n100310'}
                className="min-h-64 flex-1 font-mono text-sm [field-sizing:fixed]"
                spellCheck={false}
              />
              {data.groups.length > 0 && (
                <div className="flex flex-col gap-1.5 rounded-xl border border-border p-3 text-sm">
                  <p className="font-semibold">Deleted Tally groups</p>
                  <p className="text-xs text-muted-foreground">Every ledger under these is hidden too. Delete groups in Group P&L setup → Accounts → Tally groups.</p>
                  {data.groups.map((g) => (
                    <div key={g.name} className="flex items-center justify-between gap-2">
                      <span>
                        {g.name} <span className="text-muted-foreground">· {g.ledgers} ledger(s)</span>
                      </span>
                      <Button variant="outline" size="sm" onClick={() => restoreGroup(g.name)}>
                        <RotateCcw /> Bring back
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {data.updatedAt && (
                <p className="text-xs text-muted-foreground">
                  Last changed {fmtDate(data.updatedAt)}
                  {data.updatedBy ? ` by ${data.updatedBy}` : ''}
                </p>
              )}
            </div>
            <div className="flex min-h-0 flex-col gap-3">
              <p className="text-sm font-semibold">
                {preview.hidden.length} ledger(s) will be hidden
                {preview.unmatched.length > 0 && <span className="font-normal text-muted-foreground"> · {preview.unmatched.length} entr{preview.unmatched.length === 1 ? 'y matches' : 'ies match'} no ledger</span>}
              </p>
              {preview.withBalance.length > 0 && (
                <div className="flex gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    {preview.withBalance.length} of these still have a balance in Tally. Hiding them takes their amounts out of the reports' totals.
                  </span>
                </div>
              )}
              {preview.unmatched.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  No ledger for: <span className="font-mono text-foreground">{preview.unmatched.slice(0, 20).join(', ')}</span>
                  {preview.unmatched.length > 20 ? ` and ${preview.unmatched.length - 20} more` : ''}
                </p>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-border">
                {preview.hidden.length === 0 ? (
                  <p className="p-5 text-sm text-muted-foreground">Ledgers the list hides will show here.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 font-semibold">Ledger</th>
                        <th className="px-4 py-2 font-semibold">Group</th>
                        <th className="px-4 py-2 text-right font-semibold">Closing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.hidden.map((l) => (
                        <tr key={l.name} className="border-t border-border">
                          <td className="px-4 py-2 font-medium">{l.name}</td>
                          <td className="px-4 py-2 text-muted-foreground">{l.group}</td>
                          <td className={`px-4 py-2 text-right whitespace-nowrap tabular-nums ${Math.abs(l.closing) >= 0.005 ? 'font-semibold text-amber-700' : ''}`}>{drCr(l.closing)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!data || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
