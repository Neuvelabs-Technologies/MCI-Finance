import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Download,
  Hourglass,
  Link2Off,
  MailWarning,
  MailX,
  RotateCcw,
  Send,
  UserX,
  Users,
} from 'lucide-react';
import { customersApi } from '@/api/customers.api';
import { PageHeader } from '@/components/common/PageHeader';
import { KpiStrip, StatCard } from '@/components/common/StatCard';
import { ErrorState, LoadingState } from '@/components/common/StateViews';
import { ReviewChip } from '@/components/common/StatusChip';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/controls';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/menu';
import { actorLabel, describeLog } from '@/lib/activity';
import { fmtDate, fmtDateTime, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Overview as OverviewData } from '@/types';

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

export default function Overview() {
  const nav = useNavigate();
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await customersApi.overview());
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    document.title = 'Overview — MCI e-Invoicing';
    void load();
  }, [load]);

  if (error) return <ErrorState error={error} onRetry={load} />;

  const st = data?.status ?? {};
  const go = (query: string) => nav(`/admin/customers?${query}`);

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="How far MCI is in collecting UAE e-invoicing details from its customers."
        actions={
          <>
            <Button variant="outline" asChild>
              <a href={customersApi.exportUrl({})}>
                <Download />
                Export Excel
              </a>
            </Button>
            <Button asChild>
              <Link to="/admin/customers">
                <Users />
                Customers
              </Link>
            </Button>
          </>
        }
      />

      {data && <SetupChecklist setup={data.setup} />}

      <KpiStrip>
        <StatCard label="Customers" value={data?.total ?? 0} icon={Users} loading={!data} onClick={() => go('')} />
        <StatCard label="Not sent" value={st.new ?? 0} icon={Send} loading={!data} hint="Invite not emailed yet" onClick={() => go('status=new')} />
        <StatCard
          label="Awaiting reply"
          value={(st.invited ?? 0) + (st.opened ?? 0)}
          icon={Hourglass}
          tone="info"
          loading={!data}
          hint={`${st.opened ?? 0} opened the form`}
          onClick={() => go('status=awaiting')}
        />
        <StatCard
          label="Submitted"
          value={st.submitted ?? 0}
          icon={CheckCircle2}
          tone="success"
          loading={!data}
          hint={data ? `${pct(st.submitted ?? 0, data.total)}% of customers` : undefined}
          onClick={() => go('status=submitted')}
        />
        <StatCard label="To review" value={data?.review.pending ?? 0} icon={ClipboardCheck} tone="warning" loading={!data} onClick={() => go('review=pending')} />
        <StatCard label="Verified" value={data?.review.verified ?? 0} icon={CheckCircle2} tone="primary" loading={!data} onClick={() => go('review=verified')} />
      </KpiStrip>

      {!data ? (
        <LoadingState rows={3} />
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <ProgressCard data={data} />
            <AttentionCard data={data} />
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <ReviewQueue data={data} />
            <RecentActivity data={data} />
          </div>
        </>
      )}
    </>
  );
}

// ---------------- Progress: hero figure + funnel ----------------

function ProgressCard({ data }: { data: OverviewData }) {
  const { funnel, total } = data;
  const done = pct(funnel.submitted, total);
  const stages: { label: string; value: number; hint: string }[] = [
    { label: 'Customers', value: funnel.total, hint: 'On the list' },
    { label: 'Invited', value: funnel.invited, hint: 'Invite email sent (or marked as sent)' },
    { label: 'Opened the form', value: funnel.opened, hint: 'Opened their link at least once' },
    { label: 'Submitted', value: funnel.submitted, hint: 'Sent their details and documents' },
    { label: 'Verified', value: funnel.verified, hint: 'Checked by the finance team' },
  ];
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Response progress</CardTitle>
        <CardDescription>Each bar is the number of customers who reached that step.</CardDescription>
        <CardAction>
          <DueChip dueDate={data.dueDate} daysLeft={data.daysLeft} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <p className="text-5xl leading-none font-bold">{done}%</p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {funnel.submitted} of {total} customers have submitted
            </p>
          </div>
          <Progress value={done} className="mb-1.5 h-2.5 min-w-40 flex-1" aria-label={`${done}% submitted`} />
        </div>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">Import your customer list to see progress here.</p>
        ) : (
          <div className="flex flex-col gap-3" role="list" aria-label="Response funnel">
            {stages.map((s) => {
              const w = pct(s.value, total);
              return (
                <Tooltip key={s.label}>
                  <TooltipTrigger asChild>
                    <div role="listitem" className="grid grid-cols-[8.5rem_1fr] items-center gap-3 rounded-md outline-none sm:grid-cols-[10rem_1fr]" tabIndex={0}>
                      <span className="truncate text-sm text-muted-foreground">{s.label}</span>
                      <span className="flex min-w-0 items-center gap-2.5">
                        {/* 20px bar, rounded at the data end only, growing from one baseline */}
                        <span className="h-5 rounded-r-[4px] bg-chart-1" style={{ width: `max(${w}%, 2px)` }} aria-hidden />
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {s.value} <span className="font-normal text-muted-foreground">· {w}%</span>
                        </span>
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <b>{s.label}</b>: {s.value} of {total} customers ({w}%). {s.hint}.
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DueChip({ dueDate, daysLeft }: { dueDate?: string; daysLeft: number | null }) {
  if (!dueDate || daysLeft === null) {
    return (
      <Link to="/admin/settings" className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-bold text-muted-foreground hover:text-foreground">
        <CalendarClock size={14} /> Set a due date
      </Link>
    );
  }
  const tone = daysLeft < 0 ? 'bg-danger-soft text-danger' : daysLeft <= 7 ? 'bg-warning-soft text-warning' : 'bg-info-soft text-info';
  const text = daysLeft < 0 ? `${Math.abs(daysLeft)} days overdue` : daysLeft === 0 ? 'Due today' : `${daysLeft} days left`;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold', tone)}>
      <CalendarClock size={14} aria-hidden /> Due {fmtDate(dueDate)} · {text}
    </span>
  );
}

// ---------------- Needs attention ----------------

function AttentionCard({ data }: { data: OverviewData }) {
  const a = data.attention;
  const items = [
    { n: a.toReview, label: 'Submissions to review', icon: ClipboardCheck, to: 'review=pending', tone: 'text-warning bg-warning-soft' },
    { n: a.corrections, label: 'Waiting for a correction', icon: RotateCcw, to: 'review=needs_correction', tone: 'text-danger bg-danger-soft' },
    { n: a.emailFailures, label: 'Emails that failed', icon: MailX, to: 'issue=email_failed', tone: 'text-danger bg-danger-soft' },
    { n: a.expiredLinks, label: 'Expired form links', icon: Link2Off, to: 'issue=link_expired', tone: 'text-warning bg-warning-soft' },
    { n: a.noEmail, label: 'No email address', icon: UserX, to: 'issue=no_email', tone: 'text-muted-foreground bg-muted' },
  ];
  const open = items.filter((i) => i.n > 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Needs attention</CardTitle>
        <CardDescription>Things only the finance team can move forward.</CardDescription>
      </CardHeader>
      <CardContent>
        {open.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl bg-success-soft px-4 py-3 text-sm font-semibold text-success">
            <CheckCircle2 size={18} /> All clear — nothing is waiting on you.
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {items.map((i) => (
              <li key={i.label}>
                <Link
                  to={`/admin/customers?${i.to}`}
                  className={cn('flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted', i.n === 0 && 'pointer-events-none opacity-45')}
                  aria-disabled={i.n === 0}
                >
                  <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', i.tone)}>
                    <i.icon size={16} aria-hidden />
                  </span>
                  <span className="flex-1 text-sm">{i.label}</span>
                  <span className="text-base font-bold tabular-nums">{i.n}</span>
                  <ArrowRight size={15} className="text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------- Review queue ----------------

function ReviewQueue({ data }: { data: OverviewData }) {
  return (
    <Card className="lg:col-span-2" size="sm">
      <CardHeader>
        <CardTitle>Waiting for review</CardTitle>
        <CardDescription>Oldest first. Check each one against the uploaded licence and certificates.</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/customers?review=pending">
              View all <ArrowRight />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {data.toReview.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No submissions are waiting for review.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.toReview.map((c) => (
              <li key={c.id}>
                <Link to={`/admin/customers/${c.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/60">
                  <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{c.code}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{c.companyName || c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      TRN {c.trn || '—'} · PEPPOL {c.peppolId || '—'}
                    </span>
                  </span>
                  <span className="hidden text-xs text-muted-foreground sm:block">Submitted {relativeTime(c.submittedAt)}</span>
                  <ReviewChip review={c.reviewStatus} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------- Recent activity ----------------

function RecentActivity({ data }: { data: OverviewData }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/activity">
              All <ArrowRight />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {data.activity.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {data.activity.map((l) => (
              <li key={l._id} className="flex gap-3">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary/70" aria-hidden />
                <div className="min-w-0 text-sm">
                  <p className="line-clamp-2 leading-snug">{describeLog(l)}</p>
                  <p className="text-xs text-muted-foreground">
                    <span title={fmtDateTime(l.at)}>{relativeTime(l.at)}</span> · {actorLabel(l.actor)}
                    {l.customer && typeof l.customer === 'object' ? (
                      <>
                        {' · '}
                        <Link to={`/admin/customers/${l.customer._id}`} className="font-mono hover:text-foreground">
                          {l.customer.code}
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------- Go-live checklist ----------------

function SetupChecklist({ setup }: { setup: OverviewData['setup'] }) {
  const steps: { done: boolean; label: string; to: string; action: string }[] = [
    { done: setup.entities, label: 'Check MCI’s own entity details (TRN, TIN, licence)', to: '/admin/entities', action: 'Open entities' },
    { done: setup.dueDate, label: 'Set the due date customers see', to: '/admin/settings', action: 'Open settings' },
    { done: setup.contactEmail, label: 'Add the contact email customers reply to', to: '/admin/settings', action: 'Open settings' },
    { done: setup.smtp, label: 'Connect the email server (SMTP) so invites are really sent', to: '/admin/settings?tab=emails', action: 'Email settings' },
    { done: setup.customers, label: 'Import the customer list', to: '/admin/customers', action: 'Customers' },
    { done: setup.invitesSent, label: 'Send the first invites', to: '/admin/customers?status=new', action: 'Not sent' },
  ];
  const left = steps.filter((s) => !s.done).length;
  if (left === 0) return null;
  return (
    <Card size="sm" className="border-warning/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MailWarning size={18} className="text-warning" aria-hidden />
          Before you go live — {left} of {steps.length} steps left
        </CardTitle>
        <CardDescription>This list disappears once everything is done.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-x-6 gap-y-1 md:grid-cols-2">
          {steps.map((s) => (
            <ChecklistRow key={s.label} done={s.done}>
              <span className={cn('flex-1', s.done && 'text-muted-foreground line-through decoration-muted-foreground/40')}>{s.label}</span>
              {!s.done ? (
                <Link to={s.to} className="shrink-0 text-xs font-semibold text-primary hover:underline">
                  {s.action}
                </Link>
              ) : null}
            </ChecklistRow>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ChecklistRow({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2.5 py-1.5 text-sm">
      {done ? <CheckCircle2 size={17} className="shrink-0 text-success" aria-label="Done" /> : <Circle size={17} className="shrink-0 text-muted-foreground" aria-label="To do" />}
      {children}
    </li>
  );
}

