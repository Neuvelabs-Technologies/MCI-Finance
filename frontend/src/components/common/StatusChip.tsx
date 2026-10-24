import type { ReactNode } from 'react';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import type { CustomerStatus, ReviewStatus } from '@/types';

export const STATUS_LABEL: Record<CustomerStatus, string> = { new: 'Not sent', invited: 'Sent', opened: 'Opened', submitted: 'Submitted' };
export const REVIEW_LABEL: Record<ReviewStatus, string> = { pending: 'To review', verified: 'Verified', needs_correction: 'Needs correction' };

const STATUS_TONE: Record<CustomerStatus, BadgeVariant> = { new: 'neutral', invited: 'info', opened: 'warning', submitted: 'success' };
const REVIEW_TONE: Record<ReviewStatus, BadgeVariant> = { pending: 'warning', verified: 'success', needs_correction: 'danger' };

/** A small dot in the chip's own colour, so the state reads even in greyscale print. */
const Dot = () => <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />;

export function StatusChip({ status, className }: { status: CustomerStatus; className?: string }) {
  return (
    <Badge variant={STATUS_TONE[status]} className={className}>
      <Dot />
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function ReviewChip({ review, className }: { review: ReviewStatus; className?: string }) {
  return (
    <Badge variant={REVIEW_TONE[review]} className={className}>
      <Dot />
      {REVIEW_LABEL[review]}
    </Badge>
  );
}

export function ToneChip({ tone, children, className }: { tone: BadgeVariant; children: ReactNode; className?: string }) {
  return (
    <Badge variant={tone} className={className}>
      <Dot />
      {children}
    </Badge>
  );
}
