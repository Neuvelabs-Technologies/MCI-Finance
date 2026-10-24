import type { ReactNode } from 'react';
import { Lock, Moon, Sun } from 'lucide-react';
import { publicApi } from '@/api/public.api';
import { MciArt, MciLogo } from '@/components/common/MciLogo';
import { useTheme } from '@/context/ThemeContext';
import type { PublicSettings } from '@/types';

/** Header, background art and footer around every customer-facing page. */
export function PublicShell({ settings, right, children }: { settings?: PublicSettings; right?: ReactNode; children: ReactNode }) {
  const { isDark, toggleTheme } = useTheme();
  const org = settings?.orgName ?? 'MCI Middle East';
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip bg-background">
      <MciArt className="-top-16 -right-28 w-[560px] max-w-none sm:w-[720px]" />
      <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur">
        <div className="h-1 bg-primary" />
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center gap-3 px-4">
          {settings?.hasLogo ? (
            <span className="flex h-10 items-center rounded-lg bg-white px-2 ring-1 ring-black/5">
              <img src={publicApi.logoUrl()} alt={org} className="max-h-8 max-w-36 object-contain" />
            </span>
          ) : (
            <MciLogo size="sm" />
          )}
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-extrabold">{org}</span>
            <span className="truncate text-xs text-muted-foreground">UAE e-Invoicing</span>
          </span>
          <div className="ml-auto flex items-center gap-2">
            {right}
            <span className="hidden items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-bold text-success sm:inline-flex">
              <Lock size={12} aria-hidden /> Secure form
            </span>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex size-9 items-center justify-center rounded-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </header>
      <div className="relative flex-1">{children}</div>
      <footer className="relative border-t border-border bg-card/60 py-6 text-center text-sm text-muted-foreground">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-1 px-4">
          <span>
            {org}
            {settings?.contactEmail ? (
              <>
                {' '}
                · Questions?{' '}
                <a href={`mailto:${settings.contactEmail}`} className="font-semibold text-primary hover:underline">
                  {settings.contactEmail}
                </a>
              </>
            ) : null}
          </span>
          <span className="text-xs">Your details are sent over an encrypted connection and are only used for invoicing and our records.</span>
        </div>
      </footer>
    </div>
  );
}
