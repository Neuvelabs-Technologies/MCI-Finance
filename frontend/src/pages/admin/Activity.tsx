import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { auditApi } from '@/api/audit.api';
import { DataTable, type Column } from '@/components/common/DataTable';
import { FilterBar } from '@/components/common/FilterBar';
import { PageHeader } from '@/components/common/PageHeader';
import { ACTION_GROUPS, actorLabel, describeLog } from '@/lib/activity';
import { fmtDateTime, relativeTime } from '@/lib/format';
import type { AuditList, AuditLog } from '@/types';

export default function Activity() {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [res, setRes] = useState<AuditList>({ logs: [], total: 0, page: 1, limit: 50 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRes(await auditApi.list({ q, group, page, limit: pageSize }));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [q, group, page, pageSize]);

  useEffect(() => {
    document.title = 'Activity — MCI e-Invoicing';
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const columns: Column<AuditLog>[] = [
    {
      key: 'at',
      label: 'When',
      render: (l) => (
        <div className="leading-snug" title={fmtDateTime(l.at)}>
          <div className="text-sm">{fmtDateTime(l.at)}</div>
          <div className="text-xs text-muted-foreground">{relativeTime(l.at)}</div>
        </div>
      ),
    },
    { key: 'actor', label: 'Who', hideBelow: 'md', render: (l) => <span className="text-sm">{actorLabel(l.actor)}</span> },
    { key: 'action', label: 'What happened', className: 'max-w-[36rem] whitespace-normal', render: (l) => <span className="text-sm">{describeLog(l)}</span> },
    {
      key: 'customer',
      label: 'Customer',
      stopRowClick: true,
      render: (l) =>
        l.customer && typeof l.customer === 'object' ? (
          <Link to={`/admin/customers/${l.customer._id}`} className="font-mono text-[13px] font-semibold text-primary hover:underline">
            {l.customer.code}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { key: 'code', label: 'Event', hideBelow: 'xl', render: (l) => <span className="font-mono text-xs text-muted-foreground">{l.action}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Activity"
        subtitle="The audit trail: every form opened and submitted, every email, review, export and settings change — with who did it and when."
      />
      <DataTable
        ariaLabel="Activity log"
        columns={columns}
        items={res.logs}
        rowKey={(l) => l._id}
        loading={loading}
        error={error}
        onRetry={load}
        page={page}
        pageSize={pageSize}
        total={res.total}
        onPageChange={setPage}
        onPageSizeChange={(n) => {
          setPageSize(n);
          setPage(1);
        }}
        empty="Nothing recorded yet."
        toolbar={
          <FilterBar
            search={q}
            onSearchChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            searchPlaceholder="Search by person or action…"
            filters={[
              {
                name: 'group',
                label: 'Activity',
                value: group,
                options: ACTION_GROUPS,
                onChange: (v) => {
                  setGroup(v);
                  setPage(1);
                },
              },
            ]}
            onReset={() => {
              setQ('');
              setGroup('');
              setPage(1);
            }}
          />
        }
      />
    </>
  );
}
