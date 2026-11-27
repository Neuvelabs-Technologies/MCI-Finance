import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, CircleSlash, Clock, Loader2, MonitorX, PlugZap, RefreshCw, ServerOff, type LucideIcon } from 'lucide-react';
import { errorMessage } from '@/api/client';
import { tallyApi } from '@/api/tally.api';
import { Button } from '@/components/ui/button';
import { fmtDateTime, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { TallyConnectorStatus } from '@/types';

// The "is it working?" panel at the top of Tally reports. Says, in plain words, what the connector on the
// Tally server last saw (Tally open or not, which one, who opened it, which company), when data last
// came in, when the next sync is due, and lets anyone with access ask for a sync now.

type Tone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

const TONE: Record<Tone, { box: string; icon: string }> = {
  success: { box: 'border-success/25 bg-success-soft', icon: 'text-success' },
  info: { box: 'border-info/25 bg-info-soft', icon: 'text-info' },
  warning: { box: 'border-warning/30 bg-warning-soft', icon: 'text-warning' },
  danger: { box: 'border-danger/25 bg-danger-soft', icon: 'text-danger' },
  neutral: { box: 'border-border bg-card', icon: 'text-muted-foreground' },
};

interface View {
  tone: Tone;
  icon: LucideIcon;
  title: string;
  help: string;
}

const minutesAgo = (d?: string | null) => (d ? (Date.now() - new Date(d).getTime()) / 60000 : Infinity);

/** Turns the connector's last report into a headline and what to do about it. */
function describe(c: TallyConnectorStatus): View {
  const check = c.checkMinutes ?? 2;
  const product = c.tally.product || 'Tally';
  const who = c.tally.user ? ` (opened by ${c.tally.user})` : '';
  // No check-in for a while: the connector itself isn't running. A sync reports after each month, which
  // can take a few minutes on a busy month, so allow longer while one is running.
  if (minutesAgo(c.lastSeenAt) > (c.status === 'syncing' ? 30 : Math.max(check * 4, 10))) {
    return {
      tone: 'danger',
      icon: ServerOff,
      title: `Connector offline — last heard from ${relativeTime(c.lastSeenAt)}`,
      help: 'The connector on the Tally server is not running. Usually the Windows user it runs as signed out. MCI IT can set it to run without anyone signed in (docs/TALLY.md, step B).',
    };
  }
  switch (c.status) {
    case 'syncing':
      return { tone: 'info', icon: Loader2, title: 'Syncing now…', help: c.message || 'Reading Tally and sending the changes. The first sync of a company can take a few minutes.' };
    case 'synced':
    case 'idle':
      return {
        tone: 'success',
        icon: CheckCircle2,
        title: `Connected to ${product}${who}`,
        help: c.companies.length ? `Company open in Tally: ${c.companies.join(', ')}.` : 'Tally is open.',
      };
    case 'no_company':
      return {
        tone: 'warning',
        icon: CircleSlash,
        title: `${product} is open${who}, but no company is loaded`,
        help: 'Ask whoever has Tally open to load the company. Data syncs at the next check.',
      };
    case 'tally_not_running':
      return {
        tone: 'neutral',
        icon: MonitorX,
        title: 'Tally is not open on the server',
        help: 'Nothing to read right now. Data syncs automatically as soon as someone opens TallyPrime (Gold) with the company — no changes are lost in between.',
      };
    case 'tally_not_responding':
      return {
        tone: 'warning',
        icon: AlertTriangle,
        title: `Tally is open${who} but not answering`,
        help: 'Usually a message box or an open entry screen is waiting in Tally. Close it and go back to Gateway of Tally; if that does not help, close and reopen Tally.',
      };
    case 'wrong_tally':
      return {
        tone: 'warning',
        icon: PlugZap,
        title: `${product}${who} is using Tally's port`,
        help: c.message || 'Another Tally program opened first and took the port. Close it, then reopen TallyPrime.',
      };
    default:
      return { tone: 'danger', icon: AlertTriangle, title: 'The last sync failed', help: c.message || 'See the connector log on the Tally server.' };
  }
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="truncate text-sm font-semibold">{children}</dd>
    </div>
  );
}

export function ConnectorPanel({ source = 'gold', onSynced }: { source?: string; onSynced?: () => void }) {
  const [c, setC] = useState<TallyConnectorStatus | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await tallyApi.status();
      setC(r.connectors.find((x) => x.source === source) ?? null);
    } catch {
      setC(null);
    }
  }, [source]);

  // Refresh every 20 seconds; re-render every 10 so "x minutes ago" stays right.
  useEffect(() => {
    void load();
    const a = setInterval(() => void load(), 20000);
    const b = setInterval(() => tick((n) => n + 1), 10000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, [load]);

  // When a new sync finishes while the page is open, let the page reload its figures.
  const lastSync = c?.lastSyncAt;
  const seen = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (lastSync && seen.current && lastSync !== seen.current) onSynced?.();
    if (lastSync) seen.current = lastSync;
  }, [lastSync, onSynced]);

  async function syncNow() {
    setBusy(true);
    try {
      const r = await tallyApi.requestSync(source);
      setC(r.connector);
      toast.success('Sync requested', { description: `The connector picks it up within ${r.connector.checkMinutes ?? 2} minutes, if Tally is open with the company.` });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (c === undefined) return null;
  if (c === null) {
    return (
      <div className={cn('flex flex-col gap-1 rounded-2xl border p-4', TONE.neutral.box)}>
        <p className="flex items-center gap-2 font-bold">
          <ServerOff size={18} className="text-muted-foreground" aria-hidden /> The connector has not checked in yet
        </p>
        <p className="text-sm text-muted-foreground">
          The connector on MCI's Tally server reports here every couple of minutes once it runs (version 1.1 or later). See docs/TALLY.md for setup.
        </p>
      </div>
    );
  }

  const v = describe(c);
  const t = TONE[v.tone];
  const Icon = v.icon;
  const syncEvery = c.syncMinutes ?? 15;
  const requested = !!c.syncRequestedAt;
  const nextSync = c.lastSyncAt ? new Date(new Date(c.lastSyncAt).getTime() + syncEvery * 60000) : null;
  const nextText = requested
    ? `Requested ${relativeTime(c.syncRequestedAt)} by ${c.syncRequestedBy ?? 'someone'} — starts within ${c.checkMinutes ?? 2} min`
    : c.status === 'syncing'
      ? 'Running now'
      : ['synced', 'idle'].includes(c.status)
        ? nextSync && nextSync.getTime() > Date.now()
          ? `Around ${nextSync.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
          : `Within ${c.checkMinutes ?? 2} min`
        : 'When Tally is open with the company';

  return (
    <section className={cn('flex flex-col gap-4 rounded-2xl border p-4 md:p-5', t.box)} aria-live="polite" aria-label="Tally connection">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Icon size={22} className={cn('mt-0.5 shrink-0', t.icon, c.status === 'syncing' && 'animate-spin')} aria-hidden />
          <div className="min-w-0">
            <p className="font-bold">{v.title}</p>
            <p className="text-sm text-muted-foreground">{v.help}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void load()} aria-label="Refresh status">
            <RefreshCw />
          </Button>
          <Button size="sm" onClick={() => void syncNow()} disabled={busy || requested || c.status === 'syncing'}>
            {requested ? <Clock /> : <RefreshCw />}
            {requested ? 'Sync requested' : 'Sync now'}
          </Button>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-foreground/10 pt-3 sm:grid-cols-3 lg:grid-cols-5">
        <Fact label="Last data received">
          <span title={c.lastSyncAt ? fmtDateTime(c.lastSyncAt) : undefined}>{c.lastSyncAt ? relativeTime(c.lastSyncAt) : 'Not yet'}</span>
        </Fact>
        <Fact label="Next sync">
          <span title={nextText}>{nextText}</span>
        </Fact>
        <Fact label="Tally on the server">
          {c.tally.product ? `${c.tally.product}${c.tally.user ? ` · ${c.tally.user}` : ''}` : c.status === 'tally_not_running' ? 'Not open' : '—'}
        </Fact>
        <Fact label="Company open">{c.companies.length ? c.companies.join(', ') : 'None'}</Fact>
        <Fact label="Connector last check">
          <span title={`${fmtDateTime(c.lastSeenAt)}${c.host ? ` · ${c.host}` : ''}${c.connectorVersion ? ` · v${c.connectorVersion}` : ''}`}>
            {relativeTime(c.lastSeenAt)}
          </span>
        </Fact>
      </dl>
    </section>
  );
}
