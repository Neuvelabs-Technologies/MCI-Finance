import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail, ShieldCheck, Zap } from 'lucide-react';
import { authApi } from '@/api/auth.api';
import { errorMessage } from '@/api/client';
import { FormField, Notice } from '@/components/common/Form';
import { MciArt, MciLogo } from '@/components/common/MciLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function Login({ onDone }: { onDone: () => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [quick, setQuick] = useState<{ email: string; name?: string }[]>([]);
  const [quickBusy, setQuickBusy] = useState('');
  const nav = useNavigate();

  useEffect(() => {
    document.title = 'Sign in — MCI e-Invoicing';
    // The server only offers quick sign-in in development or on a staging server.
    authApi
      .quickLoginOptions()
      .then((r) => setQuick(r.enabled ? r.accounts : []))
      .catch(() => setQuick([]));
  }, []);

  async function quickSignIn(email: string) {
    setQuickBusy(email);
    setErr('');
    try {
      await authApi.quickLogin(email);
      await onDone();
      nav('/admin', { replace: true });
    } catch (ex) {
      setErr(errorMessage(ex));
    } finally {
      setQuickBusy('');
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await authApi.login(email.trim(), password);
      await onDone();
      nav('/admin', { replace: true });
    } catch (ex) {
      setErr(errorMessage(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-background p-4">
      <MciArt className="-top-10 -right-24 w-[620px] max-w-none" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(232,72,97,0.07),transparent_55%)]" aria-hidden />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <MciLogo size="xl" className="rounded-2xl shadow-sm" />
          <h1 className="text-2xl font-bold tracking-tight">MCI Middle East</h1>
          <p className="text-sm text-muted-foreground">UAE e-Invoicing — customer data collection</p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-xl">
          <div>
            <h2 className="text-lg font-bold">Sign in</h2>
            <p className="text-sm text-muted-foreground">For the MCI finance team.</p>
          </div>
          {quick.length ? (
            <>
              <div className="flex flex-col gap-2 rounded-xl border border-dashed border-warning/40 bg-warning-soft/50 p-3">
                <p className="flex items-center gap-1.5 text-xs font-bold text-warning">
                  <Zap size={14} aria-hidden /> Quick sign-in · test server only
                </p>
                {quick.map((a) => (
                  <Button
                    key={a.email}
                    type="button"
                    variant="outline"
                    className="h-auto justify-start gap-3 py-2 text-left"
                    disabled={!!quickBusy}
                    onClick={() => void quickSignIn(a.email)}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-soft-foreground">
                      {(a.name || a.email)
                        .split(/[\s@.]+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((w) => w[0]?.toUpperCase())
                        .join('')}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-semibold">{quickBusy === a.email ? 'Signing in…' : a.name || a.email}</span>
                      {a.name ? <span className="truncate text-xs font-normal text-muted-foreground">{a.email}</span> : null}
                    </span>
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or with email and password
                <span className="h-px flex-1 bg-border" />
              </div>
            </>
          ) : null}
          <FormField label="Work email" htmlFor="email">
            <div className="relative">
              <Mail size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="email"
                type="email"
                className="h-11 pl-10"
                placeholder="you@mci-group.com"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
          </FormField>
          <FormField label="Password" htmlFor="password">
            <div className="relative">
              <Lock size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="password"
                type={show ? 'text' : 'password'}
                className="h-11 pr-10 pl-10"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </FormField>
          {err ? <Notice tone="danger">{err}</Notice> : null}
          <Button type="submit" size="lg" disabled={busy} className="w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck size={14} aria-hidden /> Sessions end after 12 hours. Too many attempts locks sign-in for 15 minutes.
        </p>
      </div>
    </div>
  );
}
