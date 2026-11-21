import type { ReactNode } from 'react';
import { Lock, Moon, Sun } from 'lucide-react';
import { publicApi } from '@/api/public.api';
import { MciArt, MciLogo } from '@/components/common/MciLogo';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';
import type { PublicSettings } from '@/types';

/** Header, background art and footer around every customer- and vendor-facing page. */
export function PublicShell({
  settings,
  right,
  children,
  secureBadge = true,
  wide = false,
}: {
  settings?: PublicSettings;
  /** Extra header content, before the theme toggle (e.g. the staff sign-in button on the home page). */
  right?: ReactNode;
  children: ReactNode;
  /** The "Secure form" pill — for the form pages, not the home page. */
  secureBadge?: boolean;
  /** Wider header and footer, matching the home page's layout. */
  wide?: boolean;
}) {
  const { isDark, toggleTheme } = useTheme();
  const org = settings?.orgName ?? 'MCI Middle East';
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip bg-background">
      <MciArt className="-top-16 -right-28 w-[560px] max-w-none sm:w-[720px]" />
      <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur">
        <div className="h-1 bg-primary" />
        <div className={cn('mx-auto flex h-16 w-full items-center gap-3 px-4', wide ? 'max-w-5xl' : 'max-w-4xl')}>
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
            {secureBadge ? (
              <span className="hidden items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-bold text-success sm:inline-flex">
                <Lock size={12} aria-hidden /> Secure form
              </span>
            ) : null}
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
        <div className={cn('mx-auto flex flex-col items-center gap-1 px-4', wide ? 'max-w-5xl' : 'max-w-4xl')}>
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
