import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '@/api/auth.api';
import { errorMessage } from '@/api/client';
import { Notice } from '@/components/common/Form';
import { MciLogo } from '@/components/common/MciLogo';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/controls';
import { takeMicrosoftTransaction } from '@/lib/microsoft';

/** Microsoft sends the browser back here (ENTRA_REDIRECT_URI) with ?code&state, or ?error. */
export default function AuthCallback() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [err, setErr] = useState('');
  // StrictMode runs effects twice in development; the code can only be redeemed once.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    document.title = 'Signing in — MCI e-Invoicing';
    const code = params.get('code') ?? '';
    const state = params.get('state') ?? '';
    const transaction = takeMicrosoftTransaction();
    const msError = params.get('error');
    if (msError) {
      const desc = params.get('error_description') ?? '';
      // AADSTS50105: signed in fine, but not in the group allowed to use this app.
      setErr(
        /AADSTS50105/.test(desc)
          ? 'Your Microsoft account is not allowed to use MCI e-Invoicing. Ask MCI IT to add you to the finance app’s user group.'
          : msError === 'access_denied'
            ? 'Sign-in was cancelled.'
            : 'Microsoft could not sign you in. Please try again.'
      );
      return;
    }
    if (!code || !state || !transaction) {
      setErr('This sign-in link is incomplete or was already used. Please start again.');
      return;
    }
    authApi
      .microsoftCallback({ code, state, transaction })
      .then(() => nav('/admin', { replace: true }))
      .catch((e: unknown) => setErr(errorMessage(e)));
  }, [params, nav]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        <MciLogo size="xl" className="rounded-2xl shadow-sm" />
        {err ? (
          <>
            <Notice tone="danger">{err}</Notice>
            <Button asChild>
              <Link to="/admin" replace>
                Back to sign-in
              </Link>
            </Button>
          </>
        ) : (
          <Spinner label="Signing you in" />
        )}
      </div>
    </div>
  );
}
