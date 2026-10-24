import { useEffect, useMemo, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import {
  AlertCircle,
  Banknote,
  Building2,
  CalendarClock,
  CheckCircle2,
  FileText,
  Info,
  Mail,
  PenLine,
  Receipt,
  RotateCcw,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react';
import { ApiError } from '@/api/client';
import { publicApi } from '@/api/public.api';
import { FormField, FormSection, Notice } from '@/components/common/Form';
import { Button } from '@/components/ui/button';
import { Checkbox, Progress, Spinner } from '@/components/ui/controls';
import { Input, Textarea, fieldClass } from '@/components/ui/input';
import { fmtDate, fmtDateTime, fmtSize } from '@/lib/format';
import {
  COUNTRIES,
  EMIRATES,
  FILE_FIELDS,
  LABELS,
  LEGAL_ID_TYPES,
  UAE,
  normalise,
  validate,
  type BuyerData,
  type FieldKey,
  type FieldMessages,
  type FileField,
} from '@/lib/rules';
import { cn } from '@/lib/utils';
import type { FormLinkError, PublicFormResponse, SubmitErrorBody } from '@/types';
import { LinkProblem, type LinkProblemKind } from './LinkProblem';
import { PublicShell } from './PublicShell';

const ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
const ACCEPT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

type SectionId = 'entities' | 'company' | 'tax' | 'ownership' | 'contact' | 'bank' | 'declaration';

const SECTION_KEYS: Record<SectionId, FieldKey[]> = {
  entities: ['entities'],
  company: ['companyName', 'country', 'legalIdType', 'tradeLicenceNo', 'licenceIssuingAuthority', 'tradeLicenceExpiry', 'emirate', 'tradeLicence'],
  tax: ['vatRegistered', 'trn', 'trnCertificate', 'tin', 'tinCertificate', 'peppolId', 'foreignTaxId'],
  ownership: ['signatoryIds', 'moa', 'ubo'],
  contact: ['email', 'invoiceEmail', 'phone', 'address', 'poBox', 'city', 'website'],
  bank: ['bankName', 'bankBranch', 'bankAddress', 'iban', 'swift', 'bankContact'],
  declaration: ['declarantName', 'declarantDesignation', 'declaration'],
};

const SECTION_SHORT: Record<SectionId, string> = {
  entities: 'MCI entities',
  company: 'Company',
  tax: 'Tax',
  ownership: 'Ownership',
  contact: 'Contact',
  bank: 'Bank',
  declaration: 'Declaration',
};

const ID_LABELS: Record<string, { no: string; auth: string; exp: string; file: string }> = {
  TL: { no: 'Trade licence number', auth: 'Trade licence issuing authority', exp: 'Trade licence expiry date', file: 'Company trade licence' },
  EID: { no: 'Emirates ID number', auth: 'Issuing authority', exp: 'Emirates ID expiry date', file: 'Emirates ID copy' },
  PAS: { no: 'Passport number', auth: 'Issuing country / authority', exp: 'Passport expiry date', file: 'Passport copy' },
  CD: { no: 'Decree / document number', auth: 'Issuing authority', exp: 'Document expiry date', file: 'Decree / document copy' },
};

/** Keys of BuyerData whose value is a string (usable with a text input). */
type TextKey = { [K in keyof BuyerData]-?: BuyerData[K] extends string ? K : never }[keyof BuyerData];
type BoolKey = 'freeZone' | 'vatRegistered';
type Draft = Partial<BuyerData>;

// ---------- browser draft (typed answers only — files can't be stored) ----------

const draftKey = (t: string) => `einv-draft-${t}`;
function readDraft(t: string): { at: number; data: Draft } | null {
  try {
    return JSON.parse(localStorage.getItem(draftKey(t)) ?? 'null') as { at: number; data: Draft } | null;
  } catch {
    return null;
  }
}
function writeDraft(t: string, data: Draft): void {
  try {
    localStorage.setItem(draftKey(t), JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* storage unavailable */
  }
}
function clearDraft(t: string): void {
  try {
    localStorage.removeItem(draftKey(t));
  } catch {
    /* ignore */
  }
}

type LoadState = { status: 'loading' } | { status: 'error'; kind: LinkProblemKind; settings?: PublicFormResponse['settings'] } | { status: 'ready'; res: PublicFormResponse };

const nativeSelect = cn(fieldClass, 'h-11 appearance-none bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9 pl-3');
const chevron = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%23566171' stroke-width='2' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
};

export default function PublicForm() {
  const { token = '' } = useParams();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [data, setData] = useState<Draft>({});
  const [newFiles, setNewFiles] = useState<Partial<Record<FileField, File>>>({});
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldMessages>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [view, setView] = useState<'form' | 'done'>('form');
  const [restored, setRestored] = useState(false);
  const peppolEdited = useRef(false);

  async function load({ keepView = false } = {}) {
    try {
      const res = await publicApi.getForm(token);
      const c = res.customer;
      let initial: Draft = { country: UAE, legalIdType: 'TL', ...c.data };
      if (!initial.companyName) initial.companyName = c.name;
      if (!initial.entities?.length && res.entities.length === 1) initial.entities = [res.entities[0]!.id];
      const draft = readDraft(token);
      if (draft && (!c.submittedAt || draft.at > new Date(c.submittedAt).getTime())) {
        initial = { ...initial, ...draft.data };
        setRestored(true);
      }
      if (initial.peppolId && initial.tin && initial.peppolId !== `0235:${initial.tin}`) peppolEdited.current = true;
      setData(initial);
      setState({ status: 'ready', res });
      if (!keepView) setView('form');
    } catch (e) {
      const body = e instanceof ApiError ? (e.data as FormLinkError | null) : null;
      const kind = body?.error === 'expired' || body?.error === 'invalid' ? body.error : 'network';
      setState({ status: 'error', kind, settings: body?.settings });
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const res = state.status === 'ready' ? state.res : null;
  const settings = res?.settings;

  useEffect(() => {
    if (settings?.formTitle) document.title = `${settings.formTitle} — ${settings.orgName}`;
  }, [settings]);

  // Autosave the draft
  useEffect(() => {
    if (state.status !== 'ready' || view !== 'form') return;
    const t = setTimeout(() => writeDraft(token, data), 600);
    return () => clearTimeout(t);
  }, [data, token, state.status, view]);

  const ctx = useMemo(() => ({ sections: settings?.sections ?? {}, hasEntities: (res?.entities ?? []).length > 0 }), [settings, res?.entities]);
  const fileState = useMemo(() => {
    const out: Partial<Record<FileField, boolean>> = {};
    for (const f of FILE_FIELDS) out[f] = !!(res?.customer.files?.[f] || newFiles[f]);
    return out;
  }, [res?.customer, newFiles]);
  const norm = useMemo(() => normalise(data), [data]);
  const v = useMemo(() => validate(norm, ctx, fileState), [norm, ctx, fileState]);

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner label="Opening your form" />
      </div>
    );
  }
  if (state.status === 'error') return <LinkProblem kind={state.kind} settings={state.settings} />;

  const { customer: cust, entities } = state.res;
  const s = state.res.settings;
  const isUae = norm.country === UAE;
  const errCount = Object.keys(v.errors).length;
  const idl = ID_LABELS[norm.legalIdType] ?? ID_LABELS.TL!;
  const maxMb = s.maxFileMb || 10;
  const submittedBefore = !!cust.submittedAt;

  const set = <K extends keyof BuyerData>(k: K, val: BuyerData[K]) => {
    setData((d) => {
      const next: Draft = { ...d, [k]: val };
      if (k === 'tin' && !peppolEdited.current) {
        const t = String(val).replace(/\D/g, '');
        next.peppolId = t.length === 10 ? `0235:${t}` : '';
      }
      if (k === 'peppolId') peppolEdited.current = !!val;
      return next;
    });
    if (serverErrors[k]) setServerErrors((e) => ({ ...e, [k]: undefined }));
    if (submitError) setSubmitError('');
  };
  const touch = (k: FieldKey) => setTouched((t) => (t[k] ? t : { ...t, [k]: true }));
  const show = (k: FieldKey) => attempted || !!touched[k];
  const err = (k: FieldKey) => serverErrors[k] || (show(k) ? v.errors[k] : undefined);
  const warn = (k: keyof BuyerData) => (show(k) || data[k] ? v.warnings[k] : undefined);
  const req = (k: FieldKey) => v.required.includes(k);

  const text = (k: TextKey, props: InputHTMLAttributes<HTMLInputElement> & { mono?: boolean } = {}) => {
    const { mono, className, ...rest } = props;
    return (
      <Input
        id={k}
        className={cn('h-11', mono && 'font-mono tracking-wide', className)}
        value={data[k] ?? ''}
        onChange={(e) => set(k, e.target.value)}
        onBlur={() => touch(k)}
        aria-invalid={!!err(k)}
        {...rest}
      />
    );
  };

  const yesNo = (k: BoolKey) => (
    <div className="grid w-full max-w-xs grid-cols-2 gap-2" role="radiogroup" aria-label={LABELS[k]}>
      {([[true, 'Yes'], [false, 'No']] as const).map(([val, lbl]) => {
        const on = data[k] === val;
        return (
          <button
            key={lbl}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => {
              set(k, val);
              touch(k);
            }}
            className={cn(
              'flex h-11 items-center justify-center gap-2 rounded-[10px] border text-sm font-semibold transition-colors',
              on ? 'border-primary bg-primary-soft text-primary-soft-foreground' : 'border-input bg-card hover:bg-muted'
            )}
          >
            <span className={cn('flex size-4 items-center justify-center rounded-full border-2', on ? 'border-primary' : 'border-input')}>
              {on ? <span className="size-2 rounded-full bg-primary" /> : null}
            </span>
            {lbl}
          </button>
        );
      })}
    </div>
  );

  const pickFile = (k: FileField, file: File | undefined) => {
    touch(k);
    if (!file) return;
    if (!ACCEPT_TYPES.includes(file.type)) {
      setServerErrors((e) => ({ ...e, [k]: 'Only PDF, JPG or PNG files are allowed.' }));
      return;
    }
    if (file.size > maxMb * 1024 * 1024) {
      setServerErrors((e) => ({ ...e, [k]: `The file is ${fmtSize(file.size)}. Please upload a file under ${maxMb} MB.` }));
      return;
    }
    setServerErrors((e) => ({ ...e, [k]: undefined }));
    setNewFiles((f) => ({ ...f, [k]: file }));
  };

  const fileField = (k: FileField, label: string, help?: string) => {
    const onFile = cust.files?.[k];
    const picked = newFiles[k];
    const e = err(k);
    return (
      <FormField label={label} required={req(k)} error={e} help={help} className="sm:col-span-2">
        <div
          className={cn(
            'flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed p-3 transition-colors',
            e ? 'border-danger/60 bg-danger-soft/40' : picked || onFile ? 'border-success/40 bg-success-soft/40' : 'border-input'
          )}
        >
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-lg',
              picked || onFile ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground'
            )}
          >
            {picked || onFile ? <CheckCircle2 size={19} /> : <FileText size={19} />}
          </span>
          <div className="min-w-0 flex-1">
            {picked ? (
              <>
                <p className="truncate text-sm font-semibold">
                  {picked.name} <span className="ml-1 rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-bold text-info">New</span>
                </p>
                <p className="text-xs text-muted-foreground">{fmtSize(picked.size)} · uploads when you submit</p>
              </>
            ) : onFile ? (
              <>
                <p className="truncate text-sm font-semibold">On file: {onFile.originalName}</p>
                <p className="text-xs text-muted-foreground">
                  Uploaded {fmtDate(onFile.uploadedAt)} · {fmtSize(onFile.size)}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">PDF, JPG or PNG · max {maxMb} MB</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {picked ? (
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setNewFiles((f) => ({ ...f, [k]: undefined }))} aria-label="Remove the new file">
                <X />
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" asChild>
              <label htmlFor={`file-${k}`} className="cursor-pointer">
                <Upload /> {picked || onFile ? 'Replace' : 'Choose file'}
              </label>
            </Button>
            <input
              id={`file-${k}`}
              type="file"
              className="sr-only"
              accept={ACCEPT}
              aria-label={label}
              onChange={(ev) => {
                pickFile(k, ev.target.files?.[0]);
                ev.target.value = '';
              }}
            />
          </div>
        </div>
      </FormField>
    );
  };

  const sections = (
    ['entities', 'company', 'tax', 'ownership', 'contact', 'bank', 'declaration'] as SectionId[]
  ).filter((id) => (id === 'entities' ? entities.length > 0 : id === 'ownership' ? s.sections.ownership : id === 'bank' ? s.sections.bank : true));
  const sectionDone = (id: SectionId) => SECTION_KEYS[id].filter(req).every((k) => !v.errors[k]);
  const num = (id: SectionId) => sections.indexOf(id) + 1;

  const toggleEntity = (id: string) => {
    const cur = new Set(data.entities ?? []);
    if (cur.has(id)) cur.delete(id);
    else cur.add(id);
    set('entities', [...cur]);
    touch('entities');
  };

  async function submit(e: { preventDefault: () => void }) {
    e.preventDefault();
    setAttempted(true);
    setSubmitError('');
    if (Object.keys(v.errors).length) {
      requestAnimationFrame(() => {
        const el = document.querySelector('[aria-invalid="true"], [role="alert"]');
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (el instanceof HTMLElement && 'focus' in el) el.focus({ preventScroll: true });
      });
      return;
    }
    const fd = new FormData();
    fd.append('data', JSON.stringify(norm));
    for (const [k, f] of Object.entries(newFiles)) if (f) fd.append(k, f, f.name);
    setSubmitting(true);
    try {
      await publicApi.submitForm(token, fd);
      clearDraft(token);
      setNewFiles({});
      setRestored(false);
      await load({ keepView: true });
      setView('done');
      window.scrollTo({ top: 0 });
    } catch (ex) {
      const body = ex instanceof ApiError ? (ex.data as SubmitErrorBody | null) : null;
      if (body?.errors) setServerErrors(body.errors);
      const tooLarge = ex instanceof ApiError && ex.status === 413;
      setSubmitError(body?.error || (tooLarge ? `A file is too large (max ${maxMb} MB).` : 'Could not submit. Please check your connection and try again.'));
      requestAnimationFrame(() => document.querySelector('[role="alert"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    } finally {
      setSubmitting(false);
    }
  }

  const due = s.dueDate ? new Date(s.dueDate) : null;
  const late = !!due && due < new Date(new Date().toDateString());
  const pct = Math.round((v.complete / Math.max(v.total, 1)) * 100);

  // ---------------- thank-you page ----------------
  if (view === 'done') {
    const d = cust.data;
    const summary = (
      [
        ['Company', d.companyName],
        ['TRN', d.trn],
        ['TIN', d.tin],
        ['PEPPOL ID', d.peppolId],
      ] as [string, string | undefined][]
    ).filter((row): row is [string, string] => !!row[1]);
    return (
      <PublicShell settings={s}>
        <main className="mx-auto flex max-w-xl flex-col items-center gap-5 px-4 py-16 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-success-soft text-success">
            <CheckCircle2 size={32} aria-hidden />
          </span>
          <h1 className="text-3xl font-bold">Thank you — your details are in</h1>
          <p className="text-muted-foreground">
            We received your e-invoicing details on <b className="text-foreground">{fmtDateTime(cust.submittedAt)}</b>. A confirmation has been emailed to you.
          </p>
          {summary.length ? (
            <dl className="w-full rounded-2xl border border-border bg-card p-5 text-left">
              {summary.map(([k, x]) => (
                <div key={k} className="flex justify-between gap-4 border-b border-border py-2 last:border-0">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-mono font-semibold">{x}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <p className="text-sm text-muted-foreground">If anything changes, come back to this same link and update your answers.</p>
          <Button variant="outline" onClick={() => setView('form')}>
            <PenLine /> Review or update my answers
          </Button>
        </main>
      </PublicShell>
    );
  }

  // ---------------- the form ----------------
  return (
    <PublicShell settings={s}>
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:py-10">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-primary">
            {cust.name} · <span className="font-mono">{cust.code}</span>
          </p>
          <h1 className="text-3xl font-bold leading-tight md:text-4xl">{s.formTitle}</h1>
          {s.formSubtitle ? <p className="text-lg text-muted-foreground">{s.formSubtitle}</p> : null}
          {s.intro ? <p className="max-w-3xl leading-relaxed text-muted-foreground">{s.intro}</p> : null}
        </div>

        {/* Sticky progress */}
        <div className="z-20 flex flex-wrap sm:sticky sm:top-[68px] items-center gap-x-5 gap-y-2 rounded-2xl border border-border bg-card/95 px-5 py-3 shadow-sm backdrop-blur" aria-live="polite">
          <div className="flex min-w-48 flex-1 flex-col gap-1.5">
            <span className="text-sm font-semibold tabular-nums">
              {v.complete} of {v.total} required answers complete
            </span>
            <Progress value={pct} indicatorClassName={pct === 100 ? 'bg-success' : undefined} aria-label={`${pct}% complete`} />
          </div>
          {due ? (
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold', late ? 'bg-danger-soft text-danger' : 'bg-info-soft text-info')}>
              <CalendarClock size={14} aria-hidden /> {late ? 'Was due' : 'Due'} {fmtDate(due)}
            </span>
          ) : null}
          <nav aria-label="Sections" className="hidden w-full gap-1.5 lg:flex">
            {sections.map((id) => (
              <a
                key={id}
                href={`#sec-${id}`}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-muted',
                  sectionDone(id) ? 'border-success/30 text-success' : 'border-border text-muted-foreground'
                )}
              >
                {sectionDone(id) ? <CheckCircle2 size={12} /> : <span className="tabular-nums">{num(id)}</span>}
                {SECTION_SHORT[id]}
              </a>
            ))}
          </nav>
        </div>

        {cust.reviewStatus === 'needs_correction' && cust.reviewNote ? (
          <Notice tone="danger" icon={RotateCcw} title="Please update your submission">
            Our team reviewed your details and asked for the following:
            <span className="mt-1 block font-semibold whitespace-pre-wrap">{cust.reviewNote}</span>
          </Notice>
        ) : null}
        {submittedBefore ? (
          <Notice tone="info" icon={Info} title={`You submitted this form on ${fmtDateTime(cust.submittedAt)}`}>
            Your answers are filled in below. Change anything that needs updating and submit again.
          </Notice>
        ) : null}
        {restored ? (
          <Notice
            tone="warning"
            icon={Info}
            title="We restored what you typed earlier on this device"
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  clearDraft(token);
                  setRestored(false);
                  void load();
                }}
              >
                Discard
              </Button>
            }
          >
            Files aren’t kept until you submit, so please attach them again if needed.
          </Notice>
        ) : null}

        <form onSubmit={submit} noValidate className="flex flex-col gap-6">
          {sections.includes('entities') ? (
            <FormSection
              id="sec-entities"
              number={num('entities')}
              done={sectionDone('entities')}
              title={`${s.orgName} companies you deal with`}
              description={`Tick every ${s.orgName} company you buy from. Its e-invoicing details appear underneath — please check them and update your supplier records.`}
            >
              <div className="flex flex-col gap-3">
                {entities.map((en) => {
                  const on = (data.entities ?? []).includes(en.id);
                  const rows = (
                    [
                      ['Licence / document type', en.licenceType],
                      ['Licence issuing authority', en.issuingAuthority],
                      ['Licence number', en.licenceNo],
                      ['TIN', en.tin],
                      ['VAT TRN', en.trn],
                      ['PEPPOL ID', en.peppolId],
                      ['Emirate', en.emirate],
                      ['Free zone based', en.freeZone ? 'Yes' : 'No'],
                      ['Full address', en.address],
                    ] as [string, string | undefined][]
                  ).filter(([, x]) => x);
                  return (
                    <div key={en.id} className={cn('overflow-hidden rounded-xl border transition-colors', on ? 'border-primary/50 bg-primary-soft/30' : 'border-border')}>
                      <label className="flex cursor-pointer items-center gap-3 p-4">
                        <Checkbox checked={on} onCheckedChange={() => toggleEntity(en.id)} aria-label={en.name} />
                        <span className="flex min-w-0 flex-col">
                          <span className="font-bold">{en.name}</span>
                          {en.licensedBy ? <span className="text-sm text-muted-foreground">{en.licensedBy}</span> : null}
                        </span>
                      </label>
                      {on ? (
                        <div className="border-t border-border bg-card px-4 py-4">
                          <p className="mb-3 text-xs font-bold tracking-wide text-muted-foreground uppercase">e-Invoicing details</p>
                          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                            {rows.map(([k, x]) => (
                              <div key={k} className={cn('min-w-0', k === 'Full address' && 'sm:col-span-2 lg:col-span-3')}>
                                <dt className="text-xs text-muted-foreground">{k}</dt>
                                <dd className={cn('font-semibold break-words', /TIN|TRN|PEPPOL|number/.test(k) && 'font-mono')}>{x}</dd>
                              </div>
                            ))}
                          </dl>
                          <p className="mt-4 text-sm text-muted-foreground">
                            These details are accurate and as per the licences issued by the legal authority.
                            {en.contactEmail ? (
                              <>
                                {' '}
                                Questions: {en.contactName ? `${en.contactName}, ` : ''}
                                <a href={`mailto:${en.contactEmail}`} className="font-semibold text-primary hover:underline">
                                  {en.contactEmail}
                                </a>
                                .
                              </>
                            ) : null}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {err('entities') ? (
                  <p className="text-sm font-medium text-danger" role="alert">
                    Please tick at least one company.
                  </p>
                ) : null}
              </div>
            </FormSection>
          ) : null}

          <FormSection id="sec-company" icon={Building2} number={num('company')} done={sectionDone('company')} title="Company details" description="As shown on your trade licence or company registration.">
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Customer code" help="Your account code with us — it’s in the subject line of our email.">
                <Input className="h-11 font-mono" value={cust.code} readOnly />
              </FormField>
              <FormField label={LABELS.country} required={req('country')} error={err('country')} htmlFor="country">
                <select id="country" className={nativeSelect} style={chevron} value={data.country || UAE} onChange={(e) => set('country', e.target.value)}>
                  {COUNTRIES.map((c) =>
                    c === '—' ? (
                      <option key={c} disabled>
                        ──────────
                      </option>
                    ) : (
                      <option key={c}>{c}</option>
                    )
                  )}
                </select>
              </FormField>
              <FormField label={LABELS.companyName} required={req('companyName')} error={err('companyName')} htmlFor="companyName" className="sm:col-span-2">
                {text('companyName', { autoComplete: 'organization' })}
              </FormField>
              {isUae ? (
                <>
                  <FormField label={LABELS.legalIdType} required={req('legalIdType')} error={err('legalIdType')} htmlFor="legalIdType" help="Most companies use their trade licence.">
                    <select id="legalIdType" className={nativeSelect} style={chevron} value={data.legalIdType || 'TL'} onChange={(e) => set('legalIdType', e.target.value)}>
                      {LEGAL_ID_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label={idl.no} required={req('tradeLicenceNo')} error={err('tradeLicenceNo')} htmlFor="tradeLicenceNo">
                    {text('tradeLicenceNo', { mono: true })}
                  </FormField>
                  <FormField label={idl.auth} required={req('licenceIssuingAuthority')} error={err('licenceIssuingAuthority')} htmlFor="licenceIssuingAuthority" help="e.g. Dubai DET, JAFZA, DMCC, ADGM">
                    {text('licenceIssuingAuthority')}
                  </FormField>
                  <FormField label={idl.exp} required={req('tradeLicenceExpiry')} error={err('tradeLicenceExpiry')} warning={warn('tradeLicenceExpiry')} htmlFor="tradeLicenceExpiry">
                    {text('tradeLicenceExpiry', { type: 'date' })}
                  </FormField>
                  <FormField label={LABELS.emirate} required={req('emirate')} error={err('emirate')} htmlFor="emirate">
                    <select
                      id="emirate"
                      className={nativeSelect}
                      style={chevron}
                      aria-invalid={!!err('emirate')}
                      value={data.emirate || ''}
                      onChange={(e) => {
                        set('emirate', e.target.value);
                        touch('emirate');
                      }}
                    >
                      <option value="">Select…</option>
                      {EMIRATES.map((em) => (
                        <option key={em}>{em}</option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="Free zone based?" optional>
                    {yesNo('freeZone')}
                  </FormField>
                  {fileField('tradeLicence', `Upload: ${idl.file}`)}
                </>
              ) : (
                <>
                  <FormField label="Company registration number" required={req('tradeLicenceNo')} error={err('tradeLicenceNo')} htmlFor="tradeLicenceNo">
                    {text('tradeLicenceNo', { mono: true })}
                  </FormField>
                  <FormField label="Registration authority" optional htmlFor="licenceIssuingAuthority">
                    {text('licenceIssuingAuthority')}
                  </FormField>
                  {fileField('tradeLicence', 'Upload: Certificate of incorporation / company registration')}
                </>
              )}
            </div>
          </FormSection>

          <FormSection id="sec-tax" icon={Receipt} number={num('tax')} done={sectionDone('tax')} title="Tax details" description="These identify you on every e-invoice, so please copy them exactly from your FTA certificates.">
            <div className="grid gap-5 sm:grid-cols-2">
              {isUae ? (
                <>
                  <FormField label="Is your company registered for UAE VAT?" required={req('vatRegistered')} error={err('vatRegistered') && 'Please choose Yes or No.'} className="sm:col-span-2">
                    {yesNo('vatRegistered')}
                  </FormField>
                  {data.vatRegistered === true ? (
                    <>
                      <FormField label={LABELS.trn} required={req('trn')} error={err('trn')} htmlFor="trn" help="15 digits, on your VAT registration certificate.">
                        {text('trn', { inputMode: 'numeric', placeholder: '100XXXXXXXXXXXX', maxLength: 20, mono: true })}
                      </FormField>
                      <div className="flex items-center pt-0 sm:pt-7">
                        <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
                          <Checkbox checked={!!data.vatGroupMember} onCheckedChange={(c) => set('vatGroupMember', c === true)} />
                          We are a member of a VAT group
                        </label>
                      </div>
                      {fileField('trnCertificate', `Upload: ${LABELS.trnCertificate}`)}
                    </>
                  ) : null}
                  <FormField
                    label={LABELS.tin}
                    required={req('tin')}
                    error={err('tin')}
                    warning={warn('tin')}
                    htmlFor="tin"
                    help="The 10-digit number issued by the Federal Tax Authority. Usually the first 10 digits of your TRN."
                  >
                    {text('tin', { inputMode: 'numeric', placeholder: '10 digits', maxLength: 14, mono: true })}
                  </FormField>
                  <FormField
                    label={LABELS.peppolId}
                    required={req('peppolId')}
                    error={err('peppolId')}
                    warning={warn('peppolId')}
                    htmlFor="peppolId"
                    help="Your e-invoicing address: 0235: followed by your TIN. Filled in for you."
                  >
                    {text('peppolId', { placeholder: '0235:1234567890', mono: true })}
                  </FormField>
                  {fileField(
                    'tinCertificate',
                    `Upload: ${LABELS.tinCertificate}`,
                    data.vatRegistered === true ? 'If your TIN is on your TRN certificate, you can upload that file again.' : undefined
                  )}
                </>
              ) : (
                <>
                  <Notice tone="info" icon={Info} className="sm:col-span-2">
                    Companies outside the UAE don’t need a UAE TIN. If you are on the PEPPOL network in your country, add your PEPPOL ID so we can send invoices electronically.
                  </Notice>
                  <FormField label={LABELS.foreignTaxId} optional htmlFor="foreignTaxId">
                    {text('foreignTaxId', { mono: true })}
                  </FormField>
                  <FormField label={LABELS.peppolId} optional error={err('peppolId')} htmlFor="peppolId" help="Format scheme:identifier, e.g. 0088:5790000435951">
                    {text('peppolId', { mono: true })}
                  </FormField>
                </>
              )}
            </div>
          </FormSection>

          {sections.includes('ownership') ? (
            <FormSection id="sec-ownership" icon={ShieldCheck} number={num('ownership')} done={sectionDone('ownership')} title="Ownership and signatories" description="Required by our compliance checks.">
              <div className="grid gap-5 sm:grid-cols-2">
                {fileField('signatoryIds', LABELS.signatoryIds, 'Put all pages into a single file.')}
                {fileField('moa', LABELS.moa)}
                {fileField('ubo', LABELS.ubo, 'The UBO declaration or register filed with your licensing authority.')}
              </div>
            </FormSection>
          ) : null}

          <FormSection id="sec-contact" icon={Mail} number={num('contact')} done={sectionDone('contact')} title="Contact details">
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label={LABELS.email} required={req('email')} error={err('email')} htmlFor="email">
                {text('email', { type: 'email', autoComplete: 'email' })}
              </FormField>
              <FormField label={LABELS.invoiceEmail} optional error={err('invoiceEmail')} htmlFor="invoiceEmail" help="Accounts payable address, if different. Separate several with commas.">
                {text('invoiceEmail', { type: 'text', autoComplete: 'off' })}
              </FormField>
              <FormField label={LABELS.phone} required={req('phone')} error={err('phone')} htmlFor="phone">
                {text('phone', { type: 'tel', placeholder: '+971 4 123 4567', autoComplete: 'tel' })}
              </FormField>
              <FormField label={LABELS.website} optional error={err('website')} htmlFor="website">
                {text('website', { placeholder: 'www.example.com', autoComplete: 'url' })}
              </FormField>
              <FormField label={LABELS.address} required={req('address')} error={err('address')} htmlFor="address" className="sm:col-span-2" help="Building, street, area — as on your trade licence.">
                <Textarea id="address" rows={2} value={data.address ?? ''} aria-invalid={!!err('address')} onChange={(e) => set('address', e.target.value)} onBlur={() => touch('address')} />
              </FormField>
              <FormField label={LABELS.poBox} optional htmlFor="poBox">
                {text('poBox')}
              </FormField>
              <FormField label={LABELS.city} optional htmlFor="city">
                {text('city', { autoComplete: 'address-level2' })}
              </FormField>
            </div>
          </FormSection>

          {sections.includes('bank') ? (
            <FormSection id="sec-bank" icon={Banknote} number={num('bank')} done={sectionDone('bank')} title="Bank details">
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField label={LABELS.bankName} required={req('bankName')} error={err('bankName')} htmlFor="bankName">
                  {text('bankName')}
                </FormField>
                <FormField label={LABELS.bankBranch} required={req('bankBranch')} error={err('bankBranch')} htmlFor="bankBranch">
                  {text('bankBranch')}
                </FormField>
                <FormField label={LABELS.bankAddress} required={req('bankAddress')} error={err('bankAddress')} htmlFor="bankAddress" className="sm:col-span-2">
                  <Textarea id="bankAddress" rows={2} value={data.bankAddress ?? ''} aria-invalid={!!err('bankAddress')} onChange={(e) => set('bankAddress', e.target.value)} onBlur={() => touch('bankAddress')} />
                </FormField>
                <FormField label={LABELS.iban} required={req('iban')} error={err('iban')} htmlFor="iban" help="UAE IBANs start with AE and have 23 characters. Spaces are fine.">
                  {text('iban', { placeholder: 'AE07 0331 2345 6789 0123 456', autoComplete: 'off', mono: true })}
                </FormField>
                <FormField label={LABELS.swift} required={req('swift')} error={err('swift')} htmlFor="swift">
                  {text('swift', { placeholder: '8 or 11 characters', autoComplete: 'off', mono: true, className: 'uppercase' })}
                </FormField>
                <FormField label={LABELS.bankContact} required={req('bankContact')} error={err('bankContact')} htmlFor="bankContact" className="sm:col-span-2">
                  {text('bankContact', { placeholder: 'e.g. Relationship manager, +971 4 123 4567' })}
                </FormField>
              </div>
            </FormSection>
          ) : null}

          <FormSection id="sec-declaration" icon={PenLine} number={num('declaration')} done={sectionDone('declaration')} title="Declaration">
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label={LABELS.declarantName} required={req('declarantName')} error={err('declarantName')} htmlFor="declarantName">
                {text('declarantName', { autoComplete: 'name' })}
              </FormField>
              <FormField label={LABELS.declarantDesignation} required={req('declarantDesignation')} error={err('declarantDesignation')} htmlFor="declarantDesignation">
                {text('declarantDesignation', { autoComplete: 'organization-title' })}
              </FormField>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-4', err('declaration') ? 'border-danger/60' : 'border-border')}>
                  <Checkbox
                    className="mt-0.5"
                    checked={!!data.declaration}
                    aria-invalid={!!err('declaration')}
                    onCheckedChange={(c) => {
                      set('declaration', c === true);
                      touch('declaration');
                    }}
                  />
                  <span className="text-sm leading-relaxed">
                    I confirm that the details above are accurate and as per the licences issued by the legal authority, and that I am authorised to submit them on behalf of the company.
                  </span>
                </label>
                {err('declaration') ? (
                  <p className="text-sm font-medium text-danger" role="alert">
                    {err('declaration')}
                  </p>
                ) : null}
              </div>
            </div>
          </FormSection>

          <SubmitBar>
            <div className="min-w-0 flex-1">
              {submitError ? (
                <p className="flex items-center gap-2 text-sm font-semibold text-danger" role="alert">
                  <AlertCircle size={16} /> {submitError}
                </p>
              ) : attempted && errCount > 0 ? (
                <p className="flex items-center gap-2 text-sm font-semibold text-danger" role="alert">
                  <AlertCircle size={16} /> Please complete the {errCount === 1 ? 'highlighted field' : `${errCount} highlighted fields`}.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Fields marked <span className="text-primary">*</span> are required. Your typing is saved on this device as you go.
                </p>
              )}
            </div>
            <Button type="submit" size="lg" disabled={submitting} className="w-full sm:w-auto">
              {submitting ? 'Submitting…' : submittedBefore ? 'Save changes' : 'Submit details'}
            </Button>
          </SubmitBar>
        </form>
      </main>
    </PublicShell>
  );
}

function SubmitBar({ children }: { children: ReactNode }) {
  return <div className="z-20 flex sm:sticky sm:bottom-3 flex-col items-stretch gap-3 rounded-2xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center">{children}</div>;
}
