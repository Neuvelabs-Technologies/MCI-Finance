import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Banknote,
  CheckCircle2,
  FileCheck2,
  FileText,
  IdCard,
  Landmark,
  Lock,
  LogIn,
  MailOpen,
  Receipt,
  Send,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { errorMessage } from '@/api/client';
import { publicApi } from '@/api/public.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fmtDate } from '@/lib/format';
import type { PublicSettings } from '@/types';
import { PublicShell } from './PublicShell';

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: MailOpen, title: 'You get an email', text: 'Our finance team emails your company a personal, secure link. Only that link opens your form.' },
  { icon: FileText, title: 'Fill in the form', text: 'Check our company details, enter yours and upload the documents. It takes about 10 minutes.' },
  { icon: FileCheck2, title: 'We check and confirm', text: 'You get a receipt by email. If anything needs correcting, we’ll tell you and you can use the same link again.' },
];

/**
 * The home page ("/"). Explains what this site is for; the form itself only opens from a personal link.
 * Visitors who lost their email can ask for the link again, and staff sign in from the header.
 */
export default function Landing() {
  const [s, setS] = useState<PublicSettings | undefined>();

  useEffect(() => {
    publicApi
      .info()
      .then((d) => setS(d.settings))
      .catch(() => {});
  }, []);

  useEffect(() => {
    document.title = s?.orgName ? `UAE e-Invoicing — ${s.orgName}` : 'MCI — UAE e-Invoicing';
  }, [s]);

  const org = s?.orgName ?? 'MCI Middle East';
  const docs: { icon: LucideIcon; label: string }[] = [
    { icon: FileText, label: 'Trade licence (or company registration)' },
    { icon: Receipt, label: 'VAT TRN certificate' },
    { icon: Landmark, label: 'TIN (Corporate Tax) certificate' },
    { icon: IdCard, label: 'IDs of the authorised signatories' },
    ...(s?.sections.ownership !== false
      ? [
          { icon: FileCheck2, label: 'Memorandum of Association (MOA)' },
          { icon: Users, label: 'Ultimate beneficial owner (UBO) details' },
        ]
      : []),
    ...(s?.sections.bank !== false ? [{ icon: Banknote, label: 'Bank details (IBAN, SWIFT)' }] : []),
  ];

  return (
    <PublicShell
      settings={s}
      wide
      secureBadge={false}
      right={
        <Button variant="outline" size="sm" asChild>
          <Link to="/admin">
            <LogIn /> Staff sign-in
          </Link>
        </Button>
      }
    >
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-4 py-14 sm:py-20">
        {/* Hero */}
        <section className="flex max-w-2xl flex-col gap-5">
          <span className="inline-flex items-center gap-2 self-start rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary-soft-foreground">
            <ShieldCheck size={14} aria-hidden /> UAE Electronic Invoicing
          </span>
          <h1 className="text-4xl leading-tight font-bold tracking-tight sm:text-5xl">Getting ready for UAE e-invoicing, together</h1>
          <p className="text-lg text-muted-foreground">
            {org} is collecting up-to-date company and tax details from its <b className="text-foreground">customers and suppliers</b> so that invoices
            between us keep flowing under the UAE e-invoicing rules.
          </p>
          <p className="text-muted-foreground">
            Each company receives a <b className="text-foreground">personal link by email</b>. Open that link to fill in your details. There is no account or password
            to remember.
            {s?.dueDate ? (
              <>
                {' '}
                Please complete it by <b className="text-foreground">{fmtDate(s.dueDate)}</b>.
              </>
            ) : null}
          </p>
        </section>

        {/* How it works */}
        <section aria-labelledby="how" className="flex flex-col gap-5">
          <h2 id="how" className="text-2xl font-bold">
            How it works
          </h2>
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
                <span className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground">
                    <step.icon size={20} aria-hidden />
                  </span>
                  <span className="text-sm font-bold text-muted-foreground">Step {i + 1}</span>
                </span>
                <span className="text-lg font-bold">{step.title}</span>
                <span className="text-sm text-muted-foreground">{step.text}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Documents */}
          <section aria-labelledby="docs" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 lg:col-span-3">
            <div>
              <h2 id="docs" className="text-xl font-bold">
                Have these ready
              </h2>
              <p className="text-sm text-muted-foreground">PDFs, scans or clear photos are all fine.</p>
            </div>
            <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {docs.map((d) => (
                <li key={d.label} className="flex items-start gap-2.5 text-sm">
                  <d.icon size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                  {d.label}
                </li>
              ))}
            </ul>
          </section>

          {/* Lost link */}
          <ResendLink settings={s} />
        </div>

        {/* Privacy */}
        <section className="flex items-start gap-3 rounded-2xl bg-muted/60 p-5 text-sm text-muted-foreground">
          <Lock size={18} className="mt-0.5 shrink-0 text-foreground" aria-hidden />
          <p>
            <b className="text-foreground">Your details stay private.</b> Each link belongs to one company only, every page is sent over an encrypted connection, and
            what you submit is seen only by {org}’s finance team and used for invoicing and our records.
          </p>
        </section>
      </main>
    </PublicShell>
  );
}

/** "Can't find your link?": emails it again if the address is registered. The answer never says whether it is. */
function ResendLink({ settings }: { settings?: PublicSettings }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setState('sending');
    try {
      await publicApi.resendLink(email.trim());
      setState('sent');
    } catch (err) {
      setError(errorMessage(err));
      setState('idle');
    }
  }

  let body: ReactNode;
  if (state === 'sent') {
    body = (
      <div className="flex items-start gap-3 rounded-xl bg-success-soft p-4 text-sm text-success" role="status">
        <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden />
        <p>
          <b>Thank you.</b> If <b>{email}</b> is registered with us, we’ve emailed your link again. Please check your inbox and spam folder in a few minutes.
        </p>
      </div>
    );
  } else {
    body = (
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <label htmlFor="resend-email" className="text-sm font-semibold">
          Email address we wrote to
        </label>
        <Input
          id="resend-email"
          type="email"
          autoComplete="email"
          required
          placeholder="accounts@yourcompany.ae"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={error ? 'resend-error' : undefined}
        />
        {error ? (
          <p id="resend-error" className="text-sm font-semibold text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={state === 'sending' || !email.trim()}>
          <Send /> {state === 'sending' ? 'Sending…' : 'Send my link again'}
        </Button>
      </form>
    );
  }

  return (
    <section aria-labelledby="resend" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 lg:col-span-2">
      <div>
        <h2 id="resend" className="text-xl font-bold">
          Can’t find your link?
        </h2>
        <p className="text-sm text-muted-foreground">Enter the email address our invitation went to and we’ll send it again.</p>
      </div>
      {body}
      <p className="text-xs text-muted-foreground">
        Still stuck?{' '}
        {settings?.contactEmail ? (
          <>
            Write to{' '}
            <a href={`mailto:${settings.contactEmail}`} className="font-semibold text-primary hover:underline">
              {settings.contactEmail}
            </a>
            .
          </>
        ) : (
          'Contact our accounts team.'
        )}
      </p>
    </section>
  );
}
