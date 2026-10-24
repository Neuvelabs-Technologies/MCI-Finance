import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/controls';
import { cn } from '@/lib/utils';

export type StatTone = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

const TONE: Record<StatTone, string> = {
  default: 'bg-muted text-muted-foreground',
  primary: 'bg-primary-soft text-primary-soft-foreground',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
};

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: StatTone;
  loading?: boolean;
  /** Makes the card a filter button. */
  onClick?: () => void;
  active?: boolean;
}

/** One figure in a KPI strip. */
export function StatCard({ label, value, hint, icon: Icon, tone = 'default', loading, onClick, active }: StatCardProps) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={onClick ? !!active : undefined}
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-2xl border bg-card p-4 text-left transition-colors',
        active ? 'border-primary ring-3 ring-primary/15' : 'border-border',
        onClick && !active && 'hover:border-foreground/25'
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-bold tracking-wide text-muted-foreground uppercase">{label}</span>
        {Icon ? (
          <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg', TONE[tone])}>
            <Icon size={15} aria-hidden />
          </span>
        ) : null}
      </span>
      {loading ? <Skeleton className="h-7 w-14" /> : <span className="text-2xl leading-none font-bold tabular-nums">{value}</span>}
      {hint ? <span className="truncate text-xs text-muted-foreground">{hint}</span> : null}
    </Comp>
  );
}

/** A row of StatCards: 2 across on a phone, up to 6 on a wide screen. */
export function KpiStrip({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6', className)}>{children}</div>;
}
