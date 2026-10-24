import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, MailOpen } from 'lucide-react';
import { publicApi } from '@/api/public.api';
import type { PublicSettings } from '@/types';
import { PublicShell } from './PublicShell';

/** Shown at "/" — the form itself is only reachable through a customer's personal link. */
export default function Landing() {
  const [s, setS] = useState<PublicSettings | undefined>();

  useEffect(() => {
    publicApi.info().then((d) => setS(d.settings)).catch(() => {});
  }, []);

  useEffect(() => {
    document.title = s?.formTitle ? `${s.formTitle} — ${s.orgName}` : 'MCI — UAE e-Invoicing';
  }, [s]);

  return (
    <PublicShell settings={s}>
      <main className="mx-auto flex max-w-xl flex-col items-center gap-5 px-4 py-20 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground">
          <MailOpen size={28} aria-hidden />
        </span>
        <h1 className="text-3xl font-bold">{s?.formTitle || 'UAE e-Invoicing Details'}</h1>
        <p className="text-lg text-muted-foreground">
          This form opens from the <b className="text-foreground">personal link</b> in the email we sent to your company. Please use that link — it keeps your details private.
        </p>
        <p className="text-muted-foreground">
          Can’t find the email?{' '}
          {s?.contactEmail ? (
            <>
              Write to{' '}
              <a href={`mailto:${s.contactEmail}`} className="font-semibold text-primary hover:underline">
                {s.contactEmail}
              </a>{' '}
              and we’ll send it again.
            </>
          ) : (
            'Contact our accounts team and we’ll send it again.'
          )}
        </p>
        <Link to="/admin" className="mt-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <Lock size={12} /> MCI staff sign-in
        </Link>
      </main>
    </PublicShell>
  );
}
