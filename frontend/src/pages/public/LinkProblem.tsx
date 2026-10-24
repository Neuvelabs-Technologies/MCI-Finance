import { Clock, LinkIcon, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PublicSettings } from '@/types';
import { PublicShell } from './PublicShell';

export type LinkProblemKind = 'expired' | 'invalid' | 'network';

const COPY = {
  expired: {
    icon: Clock,
    title: 'This link has expired',
    msg: 'For security, form links stop working after a while. Ask us for a new link and we’ll send it right away — anything you already submitted is kept.',
  },
  invalid: {
    icon: LinkIcon,
    title: 'This link isn’t valid',
    msg: 'Please open the form with the exact link from our latest email. If you copied it, make sure the whole link was included. A newer link may have replaced this one.',
  },
  network: {
    icon: WifiOff,
    title: 'We couldn’t load the form',
    msg: 'Please check your internet connection and try again.',
  },
};

export function LinkProblem({ kind, settings }: { kind: LinkProblemKind; settings?: PublicSettings }) {
  const { icon: Icon, title, msg } = COPY[kind];
  const contact = settings?.contactEmail;
  return (
    <PublicShell settings={settings}>
      <main className="mx-auto flex max-w-lg flex-col items-center gap-4 px-4 py-20 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-danger-soft text-danger">
          <Icon size={28} aria-hidden />
        </span>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground">{msg}</p>
        {kind === 'network' ? (
          <Button onClick={() => window.location.reload()}>Try again</Button>
        ) : contact ? (
          <Button asChild>
            <a href={`mailto:${contact}?subject=${encodeURIComponent('New e-invoicing form link please')}`}>Email {contact}</a>
          </Button>
        ) : null}
      </main>
    </PublicShell>
  );
}
