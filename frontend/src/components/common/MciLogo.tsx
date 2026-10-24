import { cn } from '@/lib/utils';

const SIZES = {
  xs: 'size-8',
  sm: 'size-9',
  md: 'size-12',
  lg: 'size-16',
  xl: 'size-20',
} as const;

/**
 * MCI mark. The artwork is on white, so it sits on a white tile — that keeps it
 * correct in dark mode too.
 */
export function MciLogo({ size = 'sm', className, alt = 'MCI' }: { size?: keyof typeof SIZES; className?: string; alt?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-white ring-1 ring-black/5', SIZES[size], className)}>
      <img src="/brand/mci-mark.jpeg" alt={alt} className="size-full object-contain" />
    </span>
  );
}

/** Logo plus product name, for the sidebar and page headers. */
export function MciBrand({ title, subtitle, size = 'sm', className }: { title: string; subtitle?: string; size?: keyof typeof SIZES; className?: string }) {
  return (
    <span className={cn('flex min-w-0 items-center gap-3', className)}>
      <MciLogo size={size} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-base font-extrabold tracking-tight text-foreground">{title}</span>
        {subtitle ? <span className="truncate text-sm text-muted-foreground">{subtitle}</span> : null}
      </span>
    </span>
  );
}

/** The large swirl from MCI's letterhead, as quiet background art. */
export function MciArt({ className }: { className?: string }) {
  return <img src="/brand/mci-art.jpg" alt="" aria-hidden className={cn('mci-art absolute', className)} />;
}
