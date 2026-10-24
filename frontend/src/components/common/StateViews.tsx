import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Inbox, RefreshCw, type LucideIcon } from 'lucide-react';
import { errorMessage } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/controls';
import { cn } from '@/lib/utils';

export function LoadingState({ rows = 4, label = 'Loading', className }: { rows?: number; label?: string; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3', className)} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = 'This page could not load' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-14 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle size={26} aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-lg font-bold">{title}</p>
        <p className="max-w-md text-muted-foreground">{errorMessage(error)}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw />
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/** Shown when a list is empty: say what it is for and offer the action that would fill it. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-4 rounded-2xl border border-dashed border-input bg-card px-6 py-14 text-center', className)}>
      <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon size={26} aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-lg font-bold text-foreground">{title}</p>
        {description ? <p className="max-w-md text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Catches render errors so one broken page doesn't blank the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[einvoice] render error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-8 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-danger-soft text-danger">
            <AlertTriangle size={26} aria-hidden />
          </span>
          <p className="text-xl font-bold">Something went wrong on this page</p>
          <p className="text-sm text-muted-foreground">{this.state.error.message}</p>
          <Button onClick={() => window.location.reload()}>Reload the page</Button>
        </div>
      </div>
    );
  }
}
