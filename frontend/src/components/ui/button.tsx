import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Slot } from 'radix-ui';
import { cn } from '@/lib/utils';

/**
 * Buttons. One solid button per screen is the main action; everything else is
 * outline, secondary or ghost. Sizes keep a 36px minimum so they are easy to hit.
 */
const BASE =
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-transparent font-semibold transition-colors select-none ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 ' +
  '[&_svg]:pointer-events-none [&_svg]:shrink-0';

const VARIANTS = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/85',
  outline: 'border-input bg-card text-foreground hover:bg-muted aria-expanded:bg-muted',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_6%)]',
  ghost: 'text-foreground hover:bg-muted aria-expanded:bg-muted',
  destructive: 'bg-danger-soft text-danger hover:bg-[color-mix(in_oklch,var(--danger-soft),var(--danger)_10%)]',
  danger: 'bg-danger text-white hover:bg-danger/90 dark:text-[#1a0a0e]',
  soft: 'bg-primary-soft text-primary-soft-foreground hover:bg-[color-mix(in_oklch,var(--primary-soft),var(--primary)_10%)]',
  link: 'h-auto border-0 px-0 text-primary underline-offset-4 hover:underline',
} as const;

const SIZES = {
  default: 'h-10 px-4 text-sm [&_svg:not([class*=size-])]:size-4',
  xs: 'h-7 gap-1 rounded-lg px-2.5 text-xs [&_svg:not([class*=size-])]:size-3.5',
  sm: 'h-9 gap-1.5 px-3 text-sm [&_svg:not([class*=size-])]:size-4',
  lg: 'h-12 px-6 text-base rounded-xl [&_svg:not([class*=size-])]:size-5',
  icon: 'size-10 [&_svg:not([class*=size-])]:size-5',
  'icon-xs': 'size-7 rounded-lg [&_svg:not([class*=size-])]:size-3.5',
  'icon-sm': 'size-9 [&_svg:not([class*=size-])]:size-4',
} as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

export function buttonVariants({
  variant = 'default',
  size = 'default',
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Render the child element (e.g. a Link) with button styling. */
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'default', size = 'default', asChild = false, type, ...props },
  ref
) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? 'button')}
      data-variant={variant}
      data-size={size}
      className={buttonVariants({ variant, size, className })}
      {...props}
    />
  );
});
