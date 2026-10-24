import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const VARIANTS = {
  default: 'bg-primary text-primary-foreground',
  secondary: 'bg-secondary text-secondary-foreground',
  outline: 'border-border text-foreground',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-muted text-muted-foreground',
  primary: 'bg-primary-soft text-primary-soft-foreground',
} as const;

export type BadgeVariant = keyof typeof VARIANTS;

export function Badge({ className, variant = 'default', ...props }: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      data-variant={variant}
      className={cn(
        'inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full border border-transparent px-2.5 text-xs font-bold [&>svg]:pointer-events-none [&>svg]:size-3.5',
        VARIANTS[variant],
        className
      )}
      {...props}
    />
  );
}
