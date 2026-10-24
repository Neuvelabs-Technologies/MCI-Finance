import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface FilterDef {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

interface FilterBarProps {
  search?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
  filters?: FilterDef[];
  onReset?: () => void;
}

/** Search box and dropdown filters, shown inside a table card. */
export function FilterBar({ search = '', onSearchChange, searchPlaceholder = 'Search…', filters = [], onReset }: FilterBarProps) {
  const active = !!search || filters.some((f) => f.value);
  return (
    <>
      {onSearchChange ? (
        <div className="relative w-full sm:w-72">
          <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            className="h-9 pr-9 pl-9 text-sm"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label={searchPlaceholder}
          />
          {search ? (
            <button
              type="button"
              className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          ) : null}
        </div>
      ) : null}
      {filters.map((f) => (
        <Select key={f.name} value={f.value || 'all'} onValueChange={(v) => f.onChange(v === 'all' ? '' : v)}>
          <SelectTrigger size="sm" className="w-full text-sm sm:w-44" aria-label={f.label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All {f.label.toLowerCase()}</SelectItem>
            {f.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      {active && onReset ? (
        <Button variant="ghost" size="sm" onClick={onReset}>
          <X />
          Clear filters
        </Button>
      ) : null}
    </>
  );
}
