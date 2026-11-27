import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Spinner } from '@/components/ui/controls';
import { SearchSelect } from '@/components/ui/search-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ErrorState } from './StateViews';

export interface Column<T> {
  key: string;
  label: ReactNode;
  render?: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  /** Hide on narrow screens. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** Clicking this cell doesn't open the row (e.g. an Actions column). */
  stopRowClick?: boolean;
  className?: string;
}

export interface SortState {
  field: string;
  direction: 'asc' | 'desc';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  items: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty?: ReactNode;
  ariaLabel: string;
  onRowClick?: (row: T) => void;
  /** Adds an automatic "#" column numbered across pages. */
  showSerial?: boolean;
  // Pagination (server side)
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  // Sorting
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  // Selection
  selectable?: boolean;
  selected?: Set<string>;
  onSelectionChange?: (next: Set<string>) => void;
  bulkActions?: ReactNode;
  /** Filter bar etc. shown inside the card, above the table. */
  toolbar?: ReactNode;
}

export const PAGE_SIZES = [20, 50, 75, 100];

const HIDE: Record<NonNullable<Column<unknown>['hideBelow']>, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
  '2xl': 'hidden 2xl:table-cell',
};

/** The standard list table: serial column, sorting, selection with bulk actions, and pagination. */
export function DataTable<T>({
  columns,
  items,
  rowKey,
  loading,
  error,
  onRetry,
  empty = 'Nothing to show',
  ariaLabel,
  onRowClick,
  showSerial = true,
  page = 1,
  pageSize = items.length || 20,
  total = items.length,
  onPageChange,
  onPageSizeChange,
  sort,
  onSortChange,
  selectable = false,
  selected = new Set<string>(),
  onSelectionChange,
  bulkActions,
  toolbar,
}: DataTableProps<T>) {
  const allOnPage = items.length > 0 && items.every((r) => selected.has(rowKey(r)));
  const someOnPage = !allOnPage && items.some((r) => selected.has(rowKey(r)));

  // Only ever selects or clears rows on the current page — a hidden selection
  // carried across pages is how people email customers they never saw.
  const toggleAll = () => {
    const next = new Set(selected);
    for (const r of items) {
      if (allOnPage) next.delete(rowKey(r));
      else next.add(rowKey(r));
    }
    onSelectionChange?.(next);
  };
  const toggleRow = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectionChange?.(next);
  };

  const header = (col: Column<T>) => {
    if (!col.sortable || !onSortChange) return col.label;
    const active = sort?.field === col.key;
    const Icon = !active ? ChevronsUpDown : sort?.direction === 'asc' ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => onSortChange({ field: col.key, direction: active && sort?.direction === 'asc' ? 'desc' : 'asc' })}
        className="inline-flex items-center gap-1 rounded-sm hover:text-foreground"
        aria-label={`Sort by ${typeof col.label === 'string' ? col.label : col.key}`}
      >
        {col.label}
        <Icon size={14} className={active ? 'text-primary' : 'opacity-40'} aria-hidden />
      </button>
    );
  };

  const align = (a?: Column<T>['align']) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : '');
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      {toolbar ? <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-2.5">{toolbar}</div> : null}

      {selectable && selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 bg-foreground px-4 py-2.5 text-background">
          <span className="text-sm font-bold">{selected.size} selected</span>
          <div className="flex flex-wrap items-center gap-2">{bulkActions}</div>
          <Button variant="ghost" size="sm" className="ml-auto text-background hover:bg-background/15" onClick={() => onSelectionChange?.(new Set())}>
            <X />
            Clear
          </Button>
        </div>
      ) : null}

      {error ? (
        <div className="p-4">
          <ErrorState error={error} onRetry={onRetry} title="This list could not load" />
        </div>
      ) : loading && items.length === 0 ? (
        <div className="py-16">
          <Spinner label="Loading" />
        </div>
      ) : items.length === 0 ? (
        <div className="px-6 py-14 text-center text-base text-muted-foreground">{empty}</div>
      ) : (
        <div className={cn('transition-opacity', loading && 'opacity-60')}>
          <Table aria-label={ariaLabel}>
            <TableHeader>
              <TableRow>
                {selectable ? (
                  <TableHead className="w-10 pl-4">
                    <Checkbox
                      checked={allOnPage ? true : someOnPage ? 'indeterminate' : false}
                      onCheckedChange={toggleAll}
                      aria-label={allOnPage ? 'Clear selection on this page' : 'Select all on this page'}
                    />
                  </TableHead>
                ) : null}
                {showSerial ? <TableHead className={cn('w-12', !selectable && 'pl-5')}>#</TableHead> : null}
                {columns.map((col) => (
                  <TableHead key={col.key} className={cn('last:pr-5', align(col.align), col.hideBelow && HIDE[col.hideBelow], col.className)}>
                    {header(col)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row, i) => {
                const key = rowKey(row);
                const isSel = selected.has(key);
                return (
                  <TableRow key={key} data-state={isSel ? 'selected' : undefined} className={cn(onRowClick && 'cursor-pointer')}>
                    {selectable ? (
                      <TableCell className="w-10 pl-4">
                        <Checkbox checked={isSel} onCheckedChange={() => toggleRow(key)} aria-label={`Select row ${from + i}`} />
                      </TableCell>
                    ) : null}
                    {showSerial ? (
                      <TableCell
                        className={cn('w-12 text-xs text-muted-foreground tabular-nums', !selectable && 'pl-5')}
                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                      >
                        {(page - 1) * pageSize + i + 1}
                      </TableCell>
                    ) : null}
                    {columns.map((col) => (
                      <TableCell
                        key={col.key}
                        className={cn('last:pr-5', align(col.align), col.hideBelow && HIDE[col.hideBelow], col.className)}
                        onClick={onRowClick && !col.stopRowClick ? () => onRowClick(row) : undefined}
                      >
                        {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '—')}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {onPageChange && total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            {onPageSizeChange ? (
              <>
                <span>Rows per page</span>
                <SearchSelect
                  size="sm"
                  className="w-20"
                  contentClassName="min-w-28"
                  aria-label="Rows per page"
                  value={String(pageSize)}
                  onValueChange={(v) => onPageSizeChange(Number(v))}
                  options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
                />
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <span className="tabular-nums">
              {from}–{to} of {total}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="icon-sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
                <ChevronRight />
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
