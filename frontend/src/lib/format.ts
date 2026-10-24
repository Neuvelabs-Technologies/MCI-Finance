type DateInput = string | number | Date | null | undefined;

export const fmtDate = (d: DateInput): string =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

export const fmtDateTime = (d: DateInput): string =>
  d
    ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

export const fmtSize = (n: number): string =>
  n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "just now", "5 minutes ago", "3 days ago"; falls back to a date after a month. */
export function relativeTime(d: DateInput): string {
  if (!d) return '';
  const diff = Date.now() - new Date(d).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const days = Math.round(h / 24);
  if (days < 31) return days === 1 ? 'yesterday' : `${days} days ago`;
  return fmtDate(d);
}
