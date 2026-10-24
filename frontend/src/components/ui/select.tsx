import type { ComponentProps } from 'react';
import { Select as SelectPrimitive } from 'radix-ui';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fieldClass } from './input';

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

/** Shared look for the floating panels: menus, selects, popovers. */
export const panelClass =
  'z-[100] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl ' +
  'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] ' +
  'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.98]';

/** Shared look for one row in a menu or list. */
export const itemClass =
  'relative flex w-full cursor-default items-center gap-2.5 rounded-lg px-3 py-2 text-sm outline-none select-none ' +
  'focus:bg-muted data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ' +
  '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4';

export function SelectTrigger({ className, size = 'default', children, ...props }: ComponentProps<typeof SelectPrimitive.Trigger> & { size?: 'sm' | 'default' }) {
  return (
    <SelectPrimitive.Trigger
      data-size={size}
      className={cn(
        fieldClass,
        'flex w-full items-center justify-between gap-2 whitespace-nowrap pr-2.5 pl-3 text-left select-none data-[placeholder]:text-muted-foreground',
        size === 'sm' ? 'h-9 text-sm' : 'h-10',
        '[&>span]:line-clamp-1 [&_svg]:pointer-events-none [&_svg]:shrink-0',
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="size-4 text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({ className, children, position = 'popper', align = 'start', ...props }: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        className={cn(
          panelClass,
          'pointer-events-auto relative max-h-(--radix-select-content-available-height) min-w-40 overflow-y-auto',
          position === 'popper' && 'data-[side=bottom]:translate-y-1.5 data-[side=top]:-translate-y-1.5',
          className
        )}
        position={position}
        align={align}
        {...props}
      >
        <SelectPrimitive.ScrollUpButton className="flex items-center justify-center py-1">
          <ChevronUp className="size-4" />
        </SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className={cn('p-1.5', position === 'popper' && 'w-full min-w-(--radix-select-trigger-width)')}>
          {children}
        </SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="flex items-center justify-center py-1">
          <ChevronDown className="size-4" />
        </SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectLabel({ className, ...props }: ComponentProps<typeof SelectPrimitive.Label>) {
  return <SelectPrimitive.Label className={cn('px-3 pt-2 pb-1 text-xs font-bold text-muted-foreground', className)} {...props} />;
}

export function SelectItem({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item className={cn(itemClass, 'pr-9', className)} {...props}>
      <span className="absolute right-3 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="text-primary" strokeWidth={2.5} />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export function SelectSeparator({ className, ...props }: ComponentProps<typeof SelectPrimitive.Separator>) {
  return <SelectPrimitive.Separator className={cn('-mx-1.5 my-1.5 h-px bg-border', className)} {...props} />;
}
