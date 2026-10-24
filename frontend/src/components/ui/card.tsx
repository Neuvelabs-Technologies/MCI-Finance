import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type DivProps = HTMLAttributes<HTMLDivElement>;

/** A white surface with a soft border. `size="sm"` tightens the padding. */
export function Card({ className, size = 'default', ...props }: DivProps & { size?: 'default' | 'sm' }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        'flex flex-col gap-(--card-gap) overflow-hidden rounded-2xl border border-border bg-card py-(--card-pad) text-card-foreground',
        '[--card-pad:--spacing(6)] [--card-gap:--spacing(4)] data-[size=sm]:[--card-pad:--spacing(4)] data-[size=sm]:[--card-gap:--spacing(3)]',
        'has-data-[slot=card-footer]:pb-0',
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: DivProps) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'grid auto-rows-min items-start gap-1 px-(--card-pad) has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-(--card-pad)',
        className
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: DivProps) {
  return <div data-slot="card-title" className={cn('text-lg font-bold leading-snug', className)} {...props} />;
}

export function CardDescription({ className, ...props }: DivProps) {
  return <div data-slot="card-description" className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function CardAction({ className, ...props }: DivProps) {
  return (
    <div data-slot="card-action" className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)} {...props} />
  );
}

export function CardContent({ className, ...props }: DivProps) {
  return <div data-slot="card-content" className={cn('px-(--card-pad)', className)} {...props} />;
}

export function CardFooter({ className, ...props }: DivProps) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center gap-2 border-t border-border bg-muted/50 px-(--card-pad) py-4', className)}
      {...props}
    />
  );
}
