import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Shared look for every text field, select and picker trigger. */
export const fieldClass =
  'w-full min-w-0 rounded-[10px] border border-input bg-card text-[0.9375rem] text-foreground transition-colors outline-none ' +
  'placeholder:text-muted-foreground hover:border-[color-mix(in_oklch,var(--input),var(--foreground)_18%)] ' +
  'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 focus-visible:outline-none ' +
  'disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70 read-only:bg-muted/60 ' +
  'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/15';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} data-slot="input" className={cn(fieldClass, 'h-10 px-3', className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cn(fieldClass, 'flex field-sizing-content min-h-20 px-3 py-2.5 leading-relaxed', className)}
      {...props}
    />
  );
});
