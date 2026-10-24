import type { ComponentProps } from 'react';
import { DropdownMenu as DropdownMenuPrimitive, Tabs as TabsPrimitive, Tooltip as TooltipPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';
import { itemClass, panelClass } from './select';

// ---------- Dropdown menu ----------

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({ className, align = 'start', sideOffset = 6, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        className={cn(panelClass, 'max-h-(--radix-dropdown-menu-content-available-height) min-w-44 overflow-y-auto p-1.5', className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({ className, variant = 'default', ...props }: ComponentProps<typeof DropdownMenuPrimitive.Item> & { variant?: 'default' | 'destructive' }) {
  return (
    <DropdownMenuPrimitive.Item
      data-variant={variant}
      className={cn(itemClass, variant === 'destructive' && 'text-danger focus:bg-danger-soft data-[highlighted]:bg-danger-soft', className)}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return <DropdownMenuPrimitive.Label className={cn('px-3 pt-2 pb-1 text-xs font-bold text-muted-foreground', className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator className={cn('-mx-1.5 my-1.5 h-px bg-border', className)} {...props} />;
}

// ---------- Tabs ----------

/**
 * Two looks: `default` pill-shaped choices (filters), `line` underlined tabs (sections of one page).
 */
export function Tabs({ className, ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root className={cn('flex flex-col gap-5', className)} {...props} />;
}

export function TabsList({ className, variant = 'line', ...props }: ComponentProps<typeof TabsPrimitive.List> & { variant?: 'default' | 'line' }) {
  return (
    <TabsPrimitive.List
      data-variant={variant}
      className={cn(
        'group/tabs-list scroll-row flex max-w-full items-center overflow-x-auto',
        variant === 'line' ? 'gap-1 border-b border-border' : 'w-fit gap-2',
        className
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold transition-colors outline-none',
        'focus-visible:ring-3 focus-visible:ring-ring/25 disabled:pointer-events-none disabled:opacity-50',
        '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
        'group-data-[variant=default]/tabs-list:h-9 group-data-[variant=default]/tabs-list:rounded-full group-data-[variant=default]/tabs-list:border group-data-[variant=default]/tabs-list:border-input group-data-[variant=default]/tabs-list:bg-card group-data-[variant=default]/tabs-list:px-4',
        'group-data-[variant=default]/tabs-list:hover:bg-muted',
        'group-data-[variant=default]/tabs-list:data-[state=active]:border-foreground group-data-[variant=default]/tabs-list:data-[state=active]:bg-foreground group-data-[variant=default]/tabs-list:data-[state=active]:text-background',
        'group-data-[variant=line]/tabs-list:-mb-px group-data-[variant=line]/tabs-list:h-11 group-data-[variant=line]/tabs-list:border-b-[3px] group-data-[variant=line]/tabs-list:border-transparent group-data-[variant=line]/tabs-list:px-3 group-data-[variant=line]/tabs-list:text-muted-foreground',
        'group-data-[variant=line]/tabs-list:hover:text-foreground',
        'group-data-[variant=line]/tabs-list:data-[state=active]:border-primary group-data-[variant=line]/tabs-list:data-[state=active]:text-foreground',
        className
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn('flex-1 outline-none', className)} {...props} />;
}

// ---------- Tooltip ----------

export function TooltipProvider({ delayDuration = 200, ...props }: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({ className, sideOffset = 6, children, ...props }: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-[110] max-w-xs rounded-lg bg-foreground px-3 py-2 text-xs font-medium leading-snug text-background shadow-lg',
          'data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="fill-foreground" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}
