import type { ReactNode } from 'react';
import { Check, type LucideIcon } from 'lucide-react';
import { Label } from '@/components/ui/controls';
import { cn } from '@/lib/utils';

/** Field label with a required star or an "(optional)" note. */
export function FieldLabel({ htmlFor, required, optional, children }: { htmlFor?: string; required?: boolean; optional?: boolean; children: ReactNode }) {
  return (
    <Label htmlFor={htmlFor} className="gap-1">
      {children}
      {required ? (
        <span className="text-primary" aria-hidden>
          *
        </span>
      ) : null}
      {optional ? <span className="font-normal text-muted-foreground">(optional)</span> : null}
    </Label>
  );
}

interface FormFieldProps {
  label?: ReactNode;
  htmlFor?: string;
  required?: boolean;
  optional?: boolean;
  help?: ReactNode;
  error?: string | false | null;
  warning?: string | null;
  className?: string;
  children: ReactNode;
}

/** A labelled control with help text and an error or warning underneath. */
export function FormField({ label, htmlFor, required, optional, help, error, warning, className, children }: FormFieldProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {label ? (
        <FieldLabel htmlFor={htmlFor} required={required} optional={optional}>
          {label}
        </FieldLabel>
      ) : null}
      {children}
      {error ? (
        <p className="text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      ) : warning ? (
        <p className="text-sm text-warning">{warning}</p>
      ) : null}
      {help ? <p className="text-[13px] leading-snug text-muted-foreground">{help}</p> : null}
    </div>
  );
}

interface FormSectionProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  /** Step number; replaced by a tick when `done`. */
  number?: number;
  done?: boolean;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}

/** A titled card that groups related fields. */
export function FormSection({ title, description, icon: Icon, number, done, actions, children, className, id }: FormSectionProps) {
  return (
    <section id={id} className={cn('scroll-mt-28 overflow-hidden rounded-2xl border border-border bg-card', className)}>
      <header className="flex items-start gap-3 border-b border-border px-5 py-4 md:px-6">
        {number !== undefined ? (
          <span
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors',
              done ? 'bg-success text-white dark:text-[#0b1a12]' : 'bg-primary-soft text-primary-soft-foreground'
            )}
            aria-label={done ? 'Complete' : `Step ${number}`}
          >
            {done ? <Check size={16} strokeWidth={3} /> : number}
          </span>
        ) : Icon ? (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground">
            <Icon size={17} aria-hidden />
          </span>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1">
          <h2 className="text-base font-bold leading-tight">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      <div className="px-5 py-5 md:px-6">{children}</div>
    </section>
  );
}

/** Label/value pairs in a wide grid — more columns, fewer rows. */
export function InfoGrid({ items, columns = 3 }: { items: [ReactNode, ReactNode][]; columns?: 2 | 3 | 4 }) {
  const shown = items.filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!shown.length) return <p className="text-sm text-muted-foreground">Nothing recorded.</p>;
  const cols = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' }[columns];
  return (
    <dl className={cn('grid gap-x-8 gap-y-4', cols)}>
      {shown.map(([label, value], i) => (
        <div key={i} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-[13px] text-muted-foreground">{label}</dt>
          <dd className="font-semibold break-words whitespace-pre-wrap text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Small callout box for tips and warnings. */
export function Notice({
  tone = 'info',
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success' | 'neutral';
  icon?: LucideIcon;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const tones = {
    info: 'border-info/25 bg-info-soft text-info',
    warning: 'border-warning/25 bg-warning-soft text-warning',
    danger: 'border-danger/25 bg-danger-soft text-danger',
    success: 'border-success/25 bg-success-soft text-success',
    neutral: 'border-border bg-muted text-muted-foreground',
  };
  return (
    <div className={cn('flex gap-3 rounded-xl border px-4 py-3', tones[tone], className)} role={tone === 'danger' ? 'alert' : undefined}>
      {Icon ? <Icon size={18} className="mt-0.5 shrink-0" aria-hidden /> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm text-foreground">
        {title ? <p className="font-bold">{title}</p> : null}
        {children ? <div className="leading-relaxed text-foreground/85">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}
