import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Download, Hourglass, Mail, MailCheck, MailOpen, MailWarning, MailX, RefreshCw } from 'lucide-react';
import { errorMessage } from '@/api/client';
import { emailsApi } from '@/api/emails.api';
import { DataTable, type Column } from '@/components/common/DataTable';
import { EmailDetailDialog } from '@/components/common/EmailDetailDialog';
import { FilterBar } from '@/components/common/FilterBar';
import { Notice } from '@/components/common/Form';
import { PageHeader } from '@/components/common/PageHeader';
import { KpiStrip, StatCard } from '@/components/common/StatCard';
import { MailStatusChip } from '@/components/common/StatusChip';
import { Button } from '@/components/ui/button';
import { MAIL_KIND_LABEL, MAIL_KIND_OPTIONS, MAIL_STATUS_OPTIONS } from '@/lib/emails';
import { fmtDateTime, plural, relativeTime } from '@/lib/format';
import type { EmailList, EmailMessage, MailStatus } from '@/types';

const sum = (s: EmailList['summary'], keys: MailStatus[]) => keys.reduce((n, k) => n + (s[k] ?? 0), 0);

export default function Emails() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const kind = params.get('kind') ?? '';
  const customer = params.get('customer') ?? '';
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [res, setRes] = useState<EmailList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState<EmailMessage | null>(null);
  const [syncing, setSyncing] = useState(false);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setPage(1);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRes(await emailsApi.list({ q, status, kind, customer, page, limit: pageSize }));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [q, status, kind, customer, page, pageSize]);

  useEffect(() => {
    document.title = 'Emails — MCI e-Invoicing';
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  async function refresh() {
    setSyncing(true);
    try {
      const r = await emailsApi.sync();
      toast.success(r.updated ? `${plural(r.updated, 'email')} updated` : 'Everything is up to date', {
        description: `Checked ${plural(r.checked, 'recent email')} with Mailjet.`,
      });
      await load();
    } catch (e) {
      toast.error('Refresh failed', { description: errorMessage(e) });
    } finally {
      setSyncing(false);
    }
  }

  const s = res?.summary ?? {};
  const total = Object.values(s).reduce((n, v) => n + (v ?? 0), 0);
  const problems = sum(s, ['bounced', 'blocked', 'spam', 'failed']);
  const filtered = !!(status || kind || customer || q);
  const customerName = customer && res?.emails[0]?.customer && typeof res.emails[0].customer === 'object' ? res.emails[0].customer.code : null;

  const columns: Column<EmailMessage>[] = [
    {
      key: 'at',
      label: 'Sent',
      render: (e) => (
        <div className="leading-snug" title={fmtDateTime(e.at)}>
          <div className="text-sm">{fmtDateTime(e.at)}</div>
          <div className="text-xs text-muted-foreground">{relativeTime(e.at)}</div>
        </div>
      ),
    },
    {
      key: 'to',
      label: 'To',
      className: 'max-w-[22rem]',
      render: (e) => (
        <div className="min-w-0 leading-snug">
          <div className="truncate text-sm font-semibold">{e.to}</div>
          <div className="hidden truncate text-xs text-muted-foreground md:block">{e.subject}</div>
        </div>
      ),
    },
    {
      key: 'customer',
      label: 'Customer',
      stopRowClick: true,
      hideBelow: 'md',
      render: (e) =>
        e.customer && typeof e.customer === 'object' ? (
          <Link to={`/admin/customers/${e.customer._id}`} className="font-mono text-[13px] font-semibold text-primary hover:underline" title={e.customer.name}>
            {e.customer.code}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { key: 'kind', label: 'Type', hideBelow: 'lg', render: (e) => <span className="text-sm">{MAIL_KIND_LABEL[e.kind]}</span> },
    {
      key: 'status',
      label: 'Status',
      className: 'max-w-[20rem] whitespace-normal',
      render: (e) => (
        <div className="flex flex-col items-start gap-1">
          <MailStatusChip status={e.status} />
          {e.detail && e.status !== 'delivered' && e.status !== 'opened' ? <span className="line-clamp-2 text-xs text-muted-foreground">{e.detail}</span> : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Emails"
        subtitle="Every email the system sends (invites, reminders, confirmations and submission alerts) and whether it reached the recipient."
        actions={
          <>
            {res?.provider === 'mailjet' ? (
              <Button variant="outline" onClick={refresh} disabled={syncing} title="Ask Mailjet for the latest status of the last two weeks’ emails">
                <RefreshCw className={syncing ? 'animate-spin' : undefined} /> Refresh from Mailjet
              </Button>
            ) : null}
            <Button variant="outline" asChild>
              <a href={emailsApi.exportUrl({ q, status, kind, customer })}>
                <Download /> Export{filtered ? ' filtered' : ''}
              </a>
            </Button>
          </>
        }
      />

      {res && res.provider !== 'mailjet' ? (
        <Notice tone="warning" icon={MailWarning} title="Delivery tracking needs Mailjet">
          {res.provider === 'smtp'
            ? 'Emails are sent through SMTP, which can’t report whether they were delivered, bounced or opened.'
            : 'Email sending isn’t set up, so emails are only written to the server log.'}{' '}
          IT can add the Mailjet keys to the backend’s <code className="font-mono">.env</code> file.
        </Notice>
      ) : null}

      <KpiStrip className="xl:grid-cols-5">
        <StatCard label="All emails" value={total} icon={Mail} loading={!res} active={!status} onClick={() => setFilter('status', '')} />
        <StatCard
          label="Delivered"
          value={sum(s, ['delivered', 'opened', 'clicked'])}
          icon={MailCheck}
          tone="info"
          loading={!res}
          active={status === 'delivered'}
          onClick={() => setFilter('status', 'delivered')}
        />
        <StatCard label="Opened" value={sum(s, ['opened', 'clicked'])} icon={MailOpen} tone="success" loading={!res} active={status === 'opened'} onClick={() => setFilter('status', 'opened')} />
        <StatCard label="Waiting" value={s.queued ?? 0} icon={Hourglass} loading={!res} active={status === 'waiting'} onClick={() => setFilter('status', 'waiting')} />
        <StatCard
          label="Problems"
          value={problems}
          hint={problems ? 'Need attention' : undefined}
          icon={MailX}
          tone={problems ? 'danger' : 'default'}
          loading={!res}
          active={status === 'problem'}
          onClick={() => setFilter('status', 'problem')}
        />
      </KpiStrip>

      {customer ? (
        <Notice
          tone="neutral"
          title={`Showing emails for ${customerName ?? 'one customer'}`}
          action={
            <Button variant="ghost" size="sm" onClick={() => setFilter('customer', '')}>
              Show all
            </Button>
          }
        />
      ) : null}

      <DataTable
        ariaLabel="Emails"
        columns={columns}
        items={res?.emails ?? []}
        rowKey={(e) => e._id}
        loading={loading}
        error={error}
        onRetry={load}
        onRowClick={setOpen}
        page={page}
        pageSize={pageSize}
        total={res?.total ?? 0}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
        empty={filtered ? 'No emails match these filters.' : 'No emails sent yet. Invites, reminders and confirmations will appear here.'}
        toolbar={
          <FilterBar
            search={q}
            onSearchChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            searchPlaceholder="Search by address or subject…"
            filters={[
              { name: 'status', label: 'Status', value: status, options: MAIL_STATUS_OPTIONS, onChange: (v) => setFilter('status', v) },
              { name: 'kind', label: 'Type', value: kind, options: MAIL_KIND_OPTIONS, onChange: (v) => setFilter('kind', v) },
            ]}
            onReset={() => {
              setQ('');
              setParams({}, { replace: true });
              setPage(1);
            }}
          />
        }
      />

      <EmailDetailDialog email={open} onOpenChange={(o) => !o && setOpen(null)} />
    </>
  );
}
