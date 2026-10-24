import type { ComponentProps } from 'react';
import { Checkbox as CheckboxPrimitive, Label as LabelPrimitive, Progress as ProgressPrimitive, Switch as SwitchPrimitive } from 'radix-ui';
import { Check, Loader2, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm font-semibold leading-snug text-foreground select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
        className
      )}
      {...props}
    />
  );
}

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer relative flex size-5 shrink-0 items-center justify-center rounded-md border-2 border-input bg-card transition-colors outline-none',
        'after:absolute after:-inset-2 focus-visible:ring-3 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        'data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground',
        'aria-invalid:border-destructive',
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="grid place-content-center text-current">
        {props.checked === 'indeterminate' ? <Minus className="size-3.5" strokeWidth={3} /> : <Check className="size-3.5" strokeWidth={3} />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors outline-none',
        'focus-visible:ring-3 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-5 rounded-full bg-white shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitive.Root>
  );
}

export function Progress({ className, value, indicatorClassName, ...props }: ComponentProps<typeof ProgressPrimitive.Root> & { indicatorClassName?: string }) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn('relative flex h-2 w-full items-center overflow-hidden rounded-full bg-muted', className)}
      value={value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn('size-full flex-1 rounded-full bg-primary transition-transform duration-300', indicatorClassName)}
        style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('animate-pulse rounded-xl bg-muted', className)} {...props} />;
}

export function Spinner({ className, label = 'Loading', size = 'default' }: { className?: string; label?: string; size?: 'sm' | 'default' | 'lg' }) {
  const sizeClass = size === 'sm' ? 'size-4' : size === 'lg' ? 'size-8' : 'size-6';
  return (
    <div className={cn('flex items-center justify-center gap-2.5 text-muted-foreground', className)} role="status">
      <Loader2 className={cn('animate-spin text-primary', sizeClass)} aria-hidden />
      {label ? <span className="text-sm font-medium">{label}</span> : null}
    </div>
  );
}

export function Separator({ className, orientation = 'horizontal' }: { className?: string; orientation?: 'horizontal' | 'vertical' }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn('shrink-0 bg-border', orientation === 'horizontal' ? 'h-px w-full' : 'w-px self-stretch', className)}
    />
  );
}

/** Keyboard key, e.g. ⌘K. */
export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return <kbd className={cn('rounded-md border border-border px-1.5 font-sans text-[11px] text-muted-foreground', className)} {...props} />;
}
