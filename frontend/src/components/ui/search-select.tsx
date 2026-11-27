import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fieldClass } from './input';
import { itemClass, panelClass } from './select';

// A dropdown you can type into to search: the app's one select. Click (or start typing on it) to open,
// type to narrow the list, arrows + Enter to pick, Esc to close.

export interface SelectOption {
  value: string;
  label: string;
  /** Extra text that is searched and shown dimmed after the label. */
  hint?: string;
  disabled?: boolean;
}

/** Most rows drawn at once; typing narrows a longer list. */
const MAX_ROWS = 300;

export function SearchSelect({
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Type to search…',
  emptyText = 'Nothing matches.',
  size = 'default',
  className,
  contentClassName,
  disabled,
  id,
  invalid,
  'aria-label': ariaLabel,
}: {
  value: string | undefined;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  size?: 'sm' | 'default';
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
  'aria-label'?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return options;
    return options.filter((o) => {
      const text = `${o.label} ${o.hint ?? ''} ${o.value}`.toLowerCase();
      return words.every((w) => text.includes(w));
    });
  }, [options, query]);
  const shown = filtered.slice(0, MAX_ROWS);

  // Opening: start on the chosen option.
  useEffect(() => {
    if (!open) return;
    const i = shown.findIndex((o) => o.value === value);
    setActive(i >= 0 ? i : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function choose(o: SelectOption | undefined) {
    if (!o || o.disabled) return;
    onValueChange(o.value);
    setOpen(false);
  }

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, shown.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(shown.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(shown[active]);
    }
  }

  /** Typing a letter on the closed dropdown opens it with that letter already searched. */
  function onTriggerKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (open || disabled) return;
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ') {
      e.preventDefault();
      setQuery(e.key);
      setOpen(true);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setQuery('');
      setOpen(true);
    }
  }

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery('');
      }}
    >
      <PopoverPrimitive.Trigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          onKeyDown={onTriggerKey}
          className={cn(
            fieldClass,
            'flex w-full items-center justify-between gap-2 pr-2.5 pl-3 text-left select-none disabled:cursor-not-allowed disabled:opacity-50',
            size === 'sm' ? 'h-9 text-sm' : 'h-10',
            className
          )}
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>{selected ? selected.label : placeholder}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            panelClass,
            'flex max-h-[min(24rem,var(--radix-popover-content-available-height))] w-(--radix-popover-trigger-width) min-w-56 flex-col',
            contentClassName
          )}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).querySelector('input')?.focus();
          }}
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onSearchKey}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div ref={listRef} role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {shown.map((o, i) => (
              <div
                key={o.value}
                role="option"
                data-index={i}
                aria-selected={o.value === value}
                aria-disabled={o.disabled || undefined}
                data-highlighted={i === active ? '' : undefined}
                data-disabled={o.disabled ? '' : undefined}
                onMouseMove={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
                className={cn(itemClass, 'cursor-pointer pr-9')}
              >
                <span className="min-w-0 flex-1 truncate">
                  {o.label}
                  {o.hint ? <span className="ml-1.5 text-muted-foreground">{o.hint}</span> : null}
                </span>
                {o.value === value ? <Check className="absolute right-3 text-primary" strokeWidth={2.5} /> : null}
              </div>
            ))}
            {shown.length === 0 ? <p className="px-3 py-2 text-sm text-muted-foreground">{emptyText}</p> : null}
            {filtered.length > shown.length ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Showing {shown.length} of {filtered.length}. Type to narrow.
              </p>
            ) : null}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
