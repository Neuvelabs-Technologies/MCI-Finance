import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Hourglass,
  Mail,
  MailCheck,
  MoreHorizontal,
  Plus,
  Send,
  Upload,
  Users,
} from 'lucide-react';
import { errorMessage } from '@/api/client';
import { customersApi, type CustomerFilter } from '@/api/customers.api';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type Column, type SortState } from '@/components/common/DataTable';
import { FilterBar } from '@/components/common/FilterBar';
import { Notice } from '@/components/common/Form';
import { PageHeader } from '@/components/common/PageHeader';
import { KpiStrip, StatCard } from '@/components/common/StatCard';
import { ReviewChip, StatusChip } from '@/components/common/StatusChip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/menu';
import { useAdmin } from '@/context/AdminContext';
import { copyText } from '@/lib/browser';
import { fmtDateTime, plural, relativeTime } from '@/lib/format';
import type { CustomerList, CustomerStats, CustomerSummary, EmailKind } from '@/types';
import { CustomerModal } from './CustomerModal';
import { ImportModal } from './ImportModal';

const STATUS_OPTIONS = [
  { value: 'new', label: 'Not sent' },
  { value: 'awaiting', label: 'Awaiting reply' },
  { value: 'invited', label: 'Sent, not opened' },
  { value: 'opened', label: 'Opened, not submitted' },
  { value: 'submitted', label: 'Submitted' },
];
const REVIEW_OPTIONS = [
  { value: 'pending', label: 'To review' },
  { value: 'verified', label: 'Verified' },
  { value: 'needs_correction', label: 'Needs correction' },
];
const ISSUE_OPTIONS = [
  { value: 'email_failed', label: 'Email failed' },
  { value: 'link_expired', label: 'Link expired' },
  { value: 'no_email', label: 'No email address' },
];

type Confirm = { kind: EmailKind; ids?: string[]; all?: boolean; count: number } | null;

export default function CustomersList() {
  const nav = useNavigate();
  const { smtpConfigured } = useAdmin();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const review = params.get('review') ?? '';
  const issue = params.get('issue') ?? '';
  const [q, setQ] = useState(params.get('q') ?? '');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sort, setSort] = useState<SortState>({ field: 'code', direction: 'asc' });

  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [res, setRes] = useState<CustomerList>({ items: [], total: 0, page: 1, limit: 50 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  const filter: CustomerFilter = useMemo(() => ({ status, review, issue, q }), [status, review, issue, q]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // Status tiles and the review filter are alternatives, not combinations
    if (key === 'status' && value) next.delete('review');
    if (key === 'review' && value) next.delete('status');
    setParams(next, { replace: true });
    setPage(1);
    setSel(new Set());
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, r] = await Promise.all([
        customersApi.stats(),
        customersApi.list({ ...filter, page, limit: pageSize, sort: sort.field, dir: sort.direction }),
      ]);
      setStats(s);
      setRes(r);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [filter, page, pageSize, sort]);

  useEffect(() => {
    document.title = 'Customers — MCI e-Invoicing';
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  async function send(c: NonNullable<Confirm>) {
    try {
      const r = await customersApi.send(c.kind, { ids: c.ids, allPending: c.all });
      const ok = r.results.filter((x) => x.ok).length;
      const failed = r.results.filter((x) => !x.ok);
      const what = c.kind === 'invite' ? 'invite' : 'reminder';
      if (failed.length) {
        toast.error(`${plural(ok, what)} sent, ${failed.length} failed`, {
          description: failed
            .slice(0, 3)
            .map((f) => `${f.code}: ${f.error}`)
            .join(' · '),
        });
      } else {
        toast.success(`${plural(ok, what)} sent`, { description: r.smtpConfigured ? undefined : 'Email server not connected — written to the server log only.' });
      }
      setSel(new Set());
      void load();
    } catch (e) {
      toast.error(errorMessage(e));
      throw e;
    }
  }

  async function markSent(ids: string[]) {
    try {
      await customersApi.markSent(ids);
      toast.success(`${plural(ids.length, 'customer')} marked as sent`);
      setSel(new Set());
      void load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function copyLink(id: string) {
    try {
      const r = await customersApi.get(id);
      if (!r.customer.link) throw new Error('This customer has no link yet');
      await copyText(r.customer.link);
      toast.success('Form link copied', { description: 'Paste it into an email to the customer.' });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const st = stats?.status ?? {};
  const awaiting = (st.invited ?? 0) + (st.opened ?? 0);
  const filtersActive = !!(status || review || issue || q);

  const columns: Column<CustomerSummary>[] = [
    { key: 'code', label: 'Code', sortable: true, render: (c) => <span className="font-mono text-[13px]">{c.code}</span> },
    {
      key: 'name',
      label: 'Customer',
      sortable: true,
      className: 'max-w-[20rem] whitespace-normal',
      render: (c) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{c.companyName || c.name}</span>
            {c.demo ? <Badge variant="warning">Demo</Badge> : null}
          </div>
          <div className="truncate text-xs text-muted-foreground">{c.emails?.length ? c.emails.join(', ') : <span className="text-danger">No email address</span>}</div>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (c) => (
        <div className="flex flex-col items-start gap-1">
          <StatusChip status={c.status} />
          {c.lastEmail && !c.lastEmail.ok ? <span className="text-xs font-semibold text-danger">Last email failed</span> : null}
        </div>
      ),
    },
    { key: 'review', label: 'Review', render: (c) => (c.status === 'submitted' ? <ReviewChip review={c.reviewStatus} /> : <span className="text-muted-foreground">—</span>) },
    {
      key: 'trn',
      label: 'TRN / PEPPOL ID',
      hideBelow: '2xl',
      render: (c) =>
        c.trn || c.peppolId ? (
          <div className="font-mono text-[13px] leading-snug">
            <div>{c.trn || '—'}</div>
            <div className="text-xs text-muted-foreground">{c.peppolId}</div>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'updated',
      label: 'Last activity',
      sortable: true,
      hideBelow: 'md',
      render: (c) => {
        const [what, at] = c.submittedAt
          ? ['Submitted', c.submittedAt]
          : c.openedAt
            ? ['Opened', c.openedAt]
            : c.invitedAt
              ? ['Invite sent', c.invitedAt]
              : [null, null];
        if (!what) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="text-sm leading-snug" title={fmtDateTime(at)}>
            <div>
              {what} {relativeTime(at)}
            </div>
            {c.reminderCount && c.status !== 'submitted' ? <div className="text-xs text-muted-foreground">{plural(c.reminderCount, 'reminder')}</div> : null}
          </div>
        );
      },
    },
    {
      key: 'actions',
      label: <span className="sr-only">Actions</span>,
      align: 'right',
      stopRowClick: true,
      render: (c) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => void copyLink(c.id)} aria-label={`Copy form link for ${c.code}`} title="Copy form link">
            <Copy />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${c.code}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => nav(`/admin/customers/${c.id}`)}>
                <ExternalLink /> Open
              </DropdownMenuItem>
              {c.status !== 'submitted' ? (
                <DropdownMenuItem disabled={!c.emails?.length} onSelect={() => setConfirm({ kind: c.invitedAt ? 'reminder' : 'invite', ids: [c.id], count: 1 })}>
                  <Mail /> {c.invitedAt ? 'Send reminder' : 'Send invite'}
                </DropdownMenuItem>
              ) : null}
              {c.status === 'new' ? (
                <DropdownMenuItem onSelect={() => void markSent([c.id])}>
                  <MailCheck /> Mark as sent manually
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Everyone MCI invoices. Send each customer their form link, follow up, and review what they submit."
        actions={
          <>
            <Button variant="outline" onClick={() => setImporting(true)}>
              <Upload /> Import
            </Button>
            <Button variant="outline" asChild>
              <a href={customersApi.exportUrl({ status, review, issue, q })} title={filtersActive ? 'Exports the customers matching the current filters' : undefined}>
                <Download /> Export{filtersActive ? ' filtered' : ''}
              </a>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Send /> Email <ChevronDown className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Bulk email</DropdownMenuLabel>
                <DropdownMenuItem disabled={!st.new} onSelect={() => setConfirm({ kind: 'invite', all: true, count: st.new ?? 0 })}>
                  <Send /> Invite everyone not yet sent ({st.new ?? 0})
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!awaiting} onSelect={() => setConfirm({ kind: 'reminder', all: true, count: awaiting })}>
                  <Clock /> Remind everyone awaiting reply ({awaiting})
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="font-normal">Email text: Settings → Emails</DropdownMenuLabel>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={() => setAdding(true)}>
              <Plus /> Add customer
            </Button>
          </>
        }
      />

      {!smtpConfigured ? (
        <Notice tone="warning" icon={Mail} title="Email sending isn't connected yet">
          Invites and reminders are written to the server log instead of being sent. You can still copy each customer's link, send it from Outlook, and choose <b>Mark as sent manually</b>.
        </Notice>
      ) : null}

      <KpiStrip>
        <StatCard label="All customers" value={stats?.total ?? 0} icon={Users} loading={!stats} active={!filtersActive} onClick={() => setParams({}, { replace: true })} />
        <StatCard label="Not sent" value={st.new ?? 0} icon={Send} loading={!stats} active={status === 'new'} onClick={() => setFilter('status', 'new')} />
        <StatCard label="Awaiting reply" value={awaiting} icon={Hourglass} tone="info" loading={!stats} active={status === 'awaiting'} onClick={() => setFilter('status', 'awaiting')} />
        <StatCard
          label="Submitted"
          value={st.submitted ?? 0}
          hint={stats?.total ? `${Math.round(((st.submitted ?? 0) / stats.total) * 100)}% of customers` : undefined}
          icon={CheckCircle2}
          tone="success"
          loading={!stats}
          active={status === 'submitted'}
          onClick={() => setFilter('status', 'submitted')}
        />
        <StatCard label="To review" value={stats?.review.pending ?? 0} icon={ClipboardCheck} tone="warning" loading={!stats} active={review === 'pending'} onClick={() => setFilter('review', 'pending')} />
        <StatCard label="Verified" value={stats?.review.verified ?? 0} icon={CheckCircle2} tone="primary" loading={!stats} active={review === 'verified'} onClick={() => setFilter('review', 'verified')} />
      </KpiStrip>

      <DataTable
        ariaLabel="Customers"
        columns={columns}
        items={res.items}
        rowKey={(c) => c.id}
        loading={loading}
        error={error}
        onRetry={load}
        onRowClick={(c) => nav(`/admin/customers/${c.id}`)}
        page={page}
        pageSize={pageSize}
        total={res.total}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
        sort={sort}
        onSortChange={(s) => {
          setSort(s);
          setPage(1);
        }}
        selectable
        selected={sel}
        onSelectionChange={setSel}
        bulkActions={
          <>
            <Button size="sm" variant="secondary" onClick={() => setConfirm({ kind: 'invite', ids: [...sel], count: sel.size })}>
              <Send /> Send invite
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirm({ kind: 'reminder', ids: [...sel], count: sel.size })}>
              <Clock /> Send reminder
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void markSent([...sel])}>
              <MailCheck /> Mark as sent
            </Button>
          </>
        }
        toolbar={
          <FilterBar
            search={q}
            onSearchChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            searchPlaceholder="Search code, name, email, TRN…"
            filters={[
              { name: 'status', label: 'Statuses', value: status, options: STATUS_OPTIONS, onChange: (v) => setFilter('status', v) },
              { name: 'review', label: 'Reviews', value: review, options: REVIEW_OPTIONS, onChange: (v) => setFilter('review', v) },
              { name: 'issue', label: 'Issues', value: issue, options: ISSUE_OPTIONS, onChange: (v) => setFilter('issue', v) },
            ]}
            onReset={() => {
              setQ('');
              setParams({}, { replace: true });
              setPage(1);
            }}
          />
        }
        empty={
          stats?.total ? (
            'No customers match these filters.'
          ) : (
            <div className="flex flex-col items-center gap-3">
              <p className="text-lg font-bold text-foreground">No customers yet</p>
              <p>Import your customer list from Excel, or add customers one by one.</p>
              <div className="flex gap-2">
                <Button onClick={() => setImporting(true)}>
                  <Upload /> Import from Excel
                </Button>
                <Button variant="outline" onClick={() => setAdding(true)}>
                  <Plus /> Add one
                </Button>
              </div>
            </div>
          )
        }
      />

      <CustomerModal
        open={adding}
        onOpenChange={setAdding}
        onSaved={(c) => {
          toast.success(`${c.code} added`, { description: 'Send the invite when you are ready.' });
          void load();
        }}
      />
      <ImportModal open={importing} onOpenChange={setImporting} onDone={() => void load()} />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.kind === 'invite' ? 'Send invites' : 'Send reminders'}
        confirmLabel={confirm ? `Send to ${plural(confirm.count, 'customer')}` : 'Send'}
        onConfirm={() => (confirm ? send(confirm) : undefined)}
        description={
          confirm?.kind === 'invite'
            ? `Emails the personal form link to ${plural(confirm?.count ?? 0, 'customer')}${confirm?.all ? ' who have not been sent an invite yet' : ''}.`
            : `Emails a reminder to ${plural(confirm?.count ?? 0, 'customer')}. Anyone who has already submitted is skipped.`
        }
      >
        <p className="text-sm text-muted-foreground">
          The wording comes from <b>Settings → Emails</b>. Expired links are renewed automatically before sending.
          {!smtpConfigured ? ' Email sending is not connected, so the emails will only be written to the server log.' : ''}
        </p>
      </ConfirmDialog>
    </>
  );
}
