import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Banknote,
  Building2,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Receipt,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { ApiError, errorMessage } from '@/api/client';
import { customersApi } from '@/api/customers.api';
import { entitiesApi } from '@/api/entities.api';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmailDetailDialog } from '@/components/common/EmailDetailDialog';
import { FormField, InfoGrid, Notice } from '@/components/common/Form';
import { PageHeader } from '@/components/common/PageHeader';
import { ErrorState, LoadingState } from '@/components/common/StateViews';
import { MailStatusChip, ReviewChip, StatusChip } from '@/components/common/StatusChip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/menu';
import { actorLabel, describeLog } from '@/lib/activity';
import { copyText } from '@/lib/browser';
import { fmtDate, fmtDateTime, fmtSize, relativeTime } from '@/lib/format';
import { FILE_FIELDS, LABELS, LEGAL_ID_TYPES, UAE, type FileField } from '@/lib/rules';
import { MAIL_KIND_LABEL } from '@/lib/emails';
import { partyLabels } from '@/lib/party';
import { cn } from '@/lib/utils';
import type { AuditLog, CustomerDetail as Customer, EmailKind, EmailMessage, Entity, ReviewStatus } from '@/types';
import { CustomerModal } from './CustomerModal';

/** PDFs and images open in the browser; everything else is downloaded (the server enforces this too). */
const VIEWABLE = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const typeLabel = (name: string) => /\.([a-z0-9]{1,10})$/i.exec(name)?.[1]?.toUpperCase() ?? 'FILE';

const yn = (v: boolean | undefined) => (v === true ? 'Yes' : v === false ? 'No' : undefined);
const mono = (v: string | undefined) => (v ? <span className="font-mono text-[0.9rem]">{v}</span> : undefined);

export default function CustomerDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  // Until the record loads, the URL says whether this is a customer or a vendor
  const urlType = useLocation().pathname.startsWith('/admin/vendors') ? 'vendor' : 'customer';
  const [d, setD] = useState<{ customer: Customer; logs: AuditLog[]; emails: EmailMessage[] } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [dialog, setDialog] = useState<'edit' | 'delete' | 'regen' | EmailKind | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, e] = await Promise.all([customersApi.get(id), entitiesApi.list()]);
      setD(r);
      setEntities(e.entities);
      setNote(r.customer.reviewStatus === 'needs_correction' ? (r.customer.reviewNote ?? '') : '');
      document.title = `${r.customer.code} — MCI e-Invoicing`;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        const U = partyLabels(urlType);
        toast.error(`That ${U.singular} no longer exists`);
        nav(U.path, { replace: true });
      } else setError(e);
    }
  }, [id, nav, urlType]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!d) return <LoadingState rows={5} />;

  const c = d.customer;
  const L = partyLabels(c.type);
  const data = c.data ?? {};
  const submitted = c.status === 'submitted';
  const isUae = (data.country || UAE) === UAE;
  const entityName = (eid: string) => entities.find((e) => e._id === eid)?.name ?? 'Removed entity';
  const linkExpired = !!c.tokenExpiresAt && new Date(c.tokenExpiresAt) < new Date();

  // A reminder to someone who submitted asks them to correct what's in the review note
  const correction = c.status === 'submitted' && c.reviewStatus === 'needs_correction';

  async function sendEmail(kind: EmailKind) {
    try {
      const r = await customersApi.send(kind, { ids: [c.id] });
      const x = r.results[0];
      if (!x?.ok) throw new Error(x?.error ?? 'Send failed');
      toast.success(kind === 'invite' ? 'Invite sent' : correction ? 'Correction request sent' : 'Reminder sent', {
        description: r.smtpConfigured ? `To ${c.emails.join(', ')}` : 'Email server not connected — written to the server log only.',
      });
      await load();
    } catch (e) {
      toast.error(errorMessage(e));
      throw e;
    }
  }

  async function review(status: ReviewStatus) {
    setBusy(true);
    try {
      await customersApi.review(c.id, status, status === 'needs_correction' ? note : '');
      toast.success(
        status === 'verified' ? 'Marked as verified' : status === 'needs_correction' ? 'Correction requested' : 'Review reset',
        status === 'needs_correction' ? { description: `Send a reminder so the ${L.singular} sees your note.` } : undefined
      );
      await load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const emailKind: EmailKind = c.invitedAt ? 'reminder' : 'invite';

  return (
    <>
      <PageHeader
        back={{ to: L.path, label: L.Plural }}
        eyebrow={
          <span className="font-mono">
            {c.code} <span className="font-sans font-normal">· added {fmtDate(c.createdAt)}</span>
          </span>
        }
        title={data.companyName || c.name}
        badges={
          <>
            <StatusChip status={c.status} />
            {submitted ? <ReviewChip review={c.reviewStatus} /> : null}
            <Badge variant={c.type === 'vendor' ? 'info' : 'neutral'}>{L.Singular}</Badge>
            {c.demo ? <Badge variant="warning">Demo record</Badge> : null}
          </>
        }
        actions={
          <>
            {!submitted ? (
              <Button disabled={!c.emails?.length} onClick={() => setDialog(emailKind)}>
                <Mail /> {c.invitedAt ? 'Send reminder' : 'Send invite'}
              </Button>
            ) : c.reviewStatus === 'needs_correction' ? (
              <Button onClick={() => setDialog('reminder')}>
                <Mail /> Email {L.singular} to correct
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setDialog('edit')}>
              <Pencil /> Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {c.link ? (
                  <>
                    <DropdownMenuItem
                      onSelect={async () => {
                        await copyText(c.link ?? '');
                        toast.success('Form link copied');
                      }}
                    >
                      <Copy /> Copy form link
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href={c.link} target="_blank" rel="noreferrer">
                        <ExternalLink /> Open their form
                      </a>
                    </DropdownMenuItem>
                  </>
                ) : null}
                <DropdownMenuItem onSelect={() => setDialog('regen')}>
                  <RefreshCw /> Generate a new link
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setDialog('delete')}>
                  <Trash2 /> Delete {L.singular}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {submitted && c.reviewStatus === 'needs_correction' && c.reviewNote ? (
        <Notice tone="danger" icon={RotateCcw} title={`Waiting for the ${L.singular} to correct their submission`}>
          {c.reviewNote}
        </Notice>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          {!submitted ? (
            <ProgressSteps c={c} />
          ) : (
            <>
              <Section icon={Building2} title="Company">
                <InfoGrid
                  columns={3}
                  items={[
                    [LABELS.companyName, data.companyName],
                    [LABELS.country, data.country],
                    ...(isUae
                      ? ([
                          [LABELS.legalIdType, LEGAL_ID_TYPES.find((t) => t.value === data.legalIdType)?.label],
                          [LABELS.tradeLicenceNo, mono(data.tradeLicenceNo)],
                          [LABELS.licenceIssuingAuthority, data.licenceIssuingAuthority],
                          [LABELS.tradeLicenceExpiry, data.tradeLicenceExpiry ? <ExpiryValue date={data.tradeLicenceExpiry} /> : undefined],
                          ['Emirate', data.emirate],
                          [LABELS.freeZone, yn(data.freeZone)],
                        ] as [ReactNode, ReactNode][])
                      : ([
                          ['Registration number', mono(data.tradeLicenceNo)],
                          ['Registration authority', data.licenceIssuingAuthority],
                        ] as [ReactNode, ReactNode][])),
                    ['MCI entities they deal with', (data.entities ?? []).map(entityName).join(', ')],
                  ]}
                />
              </Section>
              <Section icon={Receipt} title="Tax and e-invoicing">
                <InfoGrid
                  columns={3}
                  items={
                    isUae
                      ? [
                          [LABELS.vatRegistered, yn(data.vatRegistered)],
                          [LABELS.vatGroupMember, yn(data.vatGroupMember)],
                          [LABELS.trn, mono(data.trn)],
                          [LABELS.tin, mono(data.tin)],
                          [LABELS.peppolId, mono(data.peppolId)],
                        ]
                      : [
                          [LABELS.foreignTaxId, mono(data.foreignTaxId)],
                          [LABELS.peppolId, mono(data.peppolId)],
                        ]
                  }
                />
              </Section>
              <Section icon={Phone} title="Contact">
                <InfoGrid
                  columns={3}
                  items={[
                    [LABELS.email, data.email],
                    [LABELS.invoiceEmail, data.invoiceEmail],
                    [LABELS.phone, data.phone],
                    [LABELS.address, data.address],
                    [LABELS.poBox, data.poBox],
                    [LABELS.city, data.city],
                    [LABELS.website, data.website],
                  ]}
                />
              </Section>
              {data.bankName || data.iban ? (
                <Section icon={Banknote} title="Bank">
                  <InfoGrid
                    columns={3}
                    items={[
                      [LABELS.bankName, data.bankName],
                      [LABELS.bankBranch, data.bankBranch],
                      [LABELS.bankAddress, data.bankAddress],
                      [LABELS.iban, mono(data.iban)],
                      [LABELS.swift, mono(data.swift)],
                      [LABELS.bankContact, data.bankContact],
                    ]}
                  />
                </Section>
              ) : null}
              <Section icon={ShieldCheck} title="Declaration">
                <InfoGrid
                  columns={3}
                  items={[
                    ['Submitted by', [data.declarantName, data.declarantDesignation].filter(Boolean).join(', ')],
                    ['Submitted', `${fmtDateTime(c.submittedAt)}${c.submitCount > 1 ? ` (${c.submitCount} times)` : ''}`],
                    ['Confirmed the declaration', data.declaration ? 'Yes' : 'No'],
                  ]}
                />
              </Section>
            </>
          )}
          <Documents c={c} />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {submitted ? (
            <Card size="sm">
              <CardHeader>
                <CardTitle className="text-base">Review</CardTitle>
                <CardDescription>Check the details against the uploaded licence and certificates.</CardDescription>
                <CardAction>
                  <ReviewChip review={c.reviewStatus} />
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Button disabled={busy || c.reviewStatus === 'verified'} onClick={() => void review('verified')}>
                  <Check /> {c.reviewStatus === 'verified' ? 'Verified' : 'Mark as verified'}
                </Button>
                <FormField label={`Ask the ${L.singular} to correct something`} htmlFor="rn" help="They see this note at the top of their form.">
                  <Textarea
                    id="rn"
                    rows={3}
                    placeholder="e.g. The TRN certificate is for a different company. Please upload the one issued to you."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </FormField>
                <Button variant="outline" disabled={busy || !note.trim()} onClick={() => void review('needs_correction')}>
                  <RotateCcw /> Request correction
                </Button>
                {c.reviewStatus !== 'pending' ? (
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => void review('pending')}>
                    Reset review
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-base">Form link</CardTitle>
              <CardDescription>
                {c.tokenExpiresAt ? (
                  linkExpired ? (
                    <span className="font-semibold text-danger">Expired {fmtDate(c.tokenExpiresAt)} — sending an email renews it.</span>
                  ) : (
                    <>Valid until {fmtDate(c.tokenExpiresAt)}</>
                  )
                ) : (
                  `Personal link for this ${L.singular} only`
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {c.link ? (
                <div className="flex gap-2">
                  <Input readOnly value={c.link} className="font-mono text-xs" onFocus={(e) => e.target.select()} aria-label="Form link" />
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Copy link"
                    onClick={async () => {
                      await copyText(c.link ?? '');
                      toast.success('Form link copied');
                    }}
                  >
                    <Copy />
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No link yet.</p>
              )}
              <div className="flex flex-wrap gap-2">
                {c.link ? (
                  <Button variant="outline" size="sm" asChild>
                    <a href={c.link} target="_blank" rel="noreferrer">
                      <ExternalLink /> Open their form
                    </a>
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" onClick={() => setDialog('regen')}>
                  <RefreshCw /> New link
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-base">{L.Singular} record</CardTitle>
            </CardHeader>
            <CardContent>
              <InfoGrid
                columns={2}
                items={[
                  ['Code', mono(c.code)],
                  ['Name on our list', c.name],
                  ['Invite goes to', c.emails?.length ? c.emails.join(', ') : <span className="text-danger">No email address</span>],
                  ['Contact', c.contactName],
                  ['Notes', c.notes],
                ]}
              />
            </CardContent>
          </Card>

          <EmailsCard customerId={c.id} emails={d.emails} />
          <History c={c} logs={d.logs} />
        </div>
      </div>

      <CustomerModal
        open={dialog === 'edit'}
        onOpenChange={(o) => setDialog(o ? 'edit' : null)}
        customer={c}
        onSaved={() => {
          toast.success(`${L.Singular} updated`);
          void load();
        }}
      />
      <ConfirmDialog
        open={dialog === 'invite' || dialog === 'reminder'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog === 'invite' ? 'Send the invite?' : correction ? `Ask the ${L.singular} to correct their details?` : 'Send a reminder?'}
        description={
          correction
            ? `Emails ${c.emails?.join(', ')} your note — “${c.reviewNote ?? ''}” — with their form link, so they can correct it and submit again.`
            : `Emails ${c.emails?.join(', ')} with their personal form link.`
        }
        confirmLabel={dialog === 'invite' ? 'Send invite' : correction ? 'Send correction request' : 'Send reminder'}
        onConfirm={() => sendEmail(dialog === 'invite' ? 'invite' : 'reminder')}
      />
      <ConfirmDialog
        open={dialog === 'regen'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Generate a new link?"
        description="The current link stops working straight away. Use this if the link was forwarded to the wrong person or has expired. Answers already submitted are kept."
        confirmLabel="Generate and copy"
        onConfirm={async () => {
          try {
            const r = await customersApi.regenerateLink(c.id);
            await copyText(r.link);
            toast.success('New link generated and copied');
            await load();
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Delete this ${L.singular}?`}
        confirmVariant="danger"
        confirmLabel="Delete permanently"
        description={
          <>
            This permanently deletes <b>{c.code} – {c.name}</b>, everything they submitted and all uploaded documents. Their link stops working. This can’t be undone.
          </>
        }
        onConfirm={async () => {
          try {
            await customersApi.remove(c.id);
            toast.success(`${c.code} deleted`);
            nav(L.path, { replace: true });
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
    </>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Building2; title: string; children: ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2.5 text-base">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground">
            <Icon size={15} aria-hidden />
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ExpiryValue({ date }: { date: string }) {
  const expired = new Date(date) < new Date(new Date().toDateString());
  return (
    <span className={cn(expired && 'text-danger')}>
      {fmtDate(date)}
      {expired ? ' (expired)' : ''}
    </span>
  );
}

/** Where a customer who hasn't submitted is up to. */
function ProgressSteps({ c }: { c: Customer }) {
  const steps = [
    { label: 'Added to the list', at: c.createdAt, done: true },
    { label: 'Invite emailed', at: c.invitedAt, done: !!c.invitedAt },
    { label: 'Opened the form', at: c.openedAt, done: !!c.openedAt },
    { label: 'Submitted details', at: c.submittedAt, done: false },
  ];
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-base">Not submitted yet</CardTitle>
        <CardDescription>
          {c.openedAt
            ? `They opened the form ${relativeTime(c.openedAt)} but haven't submitted. A reminder usually helps.`
            : c.invitedAt
              ? `The invite was sent ${relativeTime(c.invitedAt)}; the form hasn't been opened yet.`
              : 'The invite has not been sent.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3 sm:grid-cols-4">
          {steps.map((s) => (
            <li key={s.label} className={cn('flex items-start gap-2.5 rounded-xl border p-3', s.done ? 'border-success/30 bg-success-soft' : 'border-border')}>
              {s.done ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" /> : <Circle size={18} className="mt-0.5 shrink-0 text-muted-foreground" />}
              <div className="min-w-0">
                <p className="text-sm font-semibold">{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.at ? fmtDateTime(s.at) : '—'}</p>
              </div>
            </li>
          ))}
        </ol>
        {c.reminderCount ? <p className="mt-3 text-sm text-muted-foreground">{c.reminderCount} reminder(s) sent so far.</p> : null}
      </CardContent>
    </Card>
  );
}

function Documents({ c }: { c: Customer }) {
  const fields = FILE_FIELDS.filter((f) => c.files?.[f]);
  const url = (f: FileField, opts?: { version?: string; download?: boolean }) => customersApi.fileUrl(c.id, f, opts);
  return (
    <Card size="sm">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2.5 text-base">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground">
            <FileText size={15} aria-hidden />
          </span>
          Documents
        </CardTitle>
        <CardDescription>Stored privately. Only signed-in admins can open them.</CardDescription>
      </CardHeader>
      <CardContent>
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {fields.map((f) => {
              const m = c.files[f]!;
              return (
                <li key={f} className="flex items-center gap-3 rounded-xl border border-border p-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <FileText size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{LABELS[f]}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="font-semibold">{typeLabel(m.originalName)}</span> · {m.originalName} · {fmtSize(m.size)} · {fmtDate(m.uploadedAt)}
                    </p>
                  </div>
                  {VIEWABLE.has(m.mime) ? (
                    <Button variant="ghost" size="icon-sm" asChild>
                      <a href={url(f)} target="_blank" rel="noreferrer" aria-label={`View ${LABELS[f]}`} title="View">
                        <Eye />
                      </a>
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="icon-sm" asChild>
                    <a href={url(f, { download: true })} aria-label={`Download ${LABELS[f]}`} title="Download">
                      <Download />
                    </a>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {c.fileHistory?.length ? (
          <details className="mt-4 rounded-xl border border-border px-4 py-3">
            <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">Earlier versions ({c.fileHistory.length})</summary>
            <ul className="mt-2 flex flex-col gap-1.5 text-sm">
              {[...c.fileHistory].reverse().map((h) => (
                <li key={h.storedName}>
                  {LABELS[h.field]}:{' '}
                  <a href={url(h.field, { version: h.storedName })} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
                    {h.originalName}
                  </a>{' '}
                  <span className="text-muted-foreground">(replaced, uploaded {fmtDate(h.uploadedAt)})</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Every email sent about this customer, with whether it arrived. */
function EmailsCard({ customerId, emails }: { customerId: string; emails: EmailMessage[] }) {
  const [open, setOpen] = useState<EmailMessage | null>(null);
  const shown = emails.slice(0, 8);
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-base">Emails</CardTitle>
        <CardDescription>Whether each email reached them. Click one for details.</CardDescription>
        {emails.length > shown.length ? (
          <CardAction>
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/admin/emails?customer=${customerId}`}>See all {emails.length}</Link>
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">No emails sent yet.</p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {shown.map((e) => (
              <li key={e._id}>
                <button
                  type="button"
                  onClick={() => setOpen(e)}
                  className="flex w-full items-start justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {MAIL_KIND_LABEL[e.kind]} · {e.to}
                    </span>
                    <span className="block text-xs text-muted-foreground">{fmtDateTime(e.at)}</span>
                    {e.detail && !['delivered', 'opened'].includes(e.status) ? <span className="mt-0.5 line-clamp-2 block text-xs text-danger">{e.detail}</span> : null}
                  </span>
                  <MailStatusChip status={e.status} className="shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <EmailDetailDialog email={open} onOpenChange={(o) => !o && setOpen(null)} />
    </Card>
  );
}

function History({ c, logs }: { c: Customer; logs: AuditLog[] }) {
  const items = [
    ...c.emailLog.map((e) => ({
      at: e.at,
      text: `${MAIL_KIND_LABEL[e.kind]} email ${e.ok ? 'sent' : 'FAILED'} to ${e.to.join(', ')}${e.error ? ` — ${e.error}` : ''}`,
      who: 'System',
      bad: !e.ok,
    })),
    ...logs.filter((l) => !l.action.startsWith('email.')).map((l) => ({ at: l.at, text: describeLog(l), who: actorLabel(l.actor), bad: false })),
  ]
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 40);
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-base">History</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ol className="relative flex flex-col gap-4 border-l border-border pl-5">
            {items.map((x, i) => (
              <li key={`${x.at}-${i}`} className="relative">
                <span className={cn('absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-card', x.bad ? 'bg-danger' : 'bg-primary/70')} aria-hidden />
                <p className={cn('text-sm leading-snug', x.bad && 'font-semibold text-danger')}>{x.text}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtDateTime(x.at)} · {x.who}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
