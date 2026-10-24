import type { AuditLog } from '@/types';
import { labelOf } from './rules';

/** Plain-English wording for each audit action. */
export const ACTION_LABEL: Record<string, string> = {
  'form.opened': 'Customer opened the form',
  'form.submitted': 'Customer submitted the form',
  'form.resubmitted': 'Customer updated their submission',
  'customer.created': 'Customer added',
  'customer.updated': 'Customer record edited',
  'customer.deleted': 'Customer deleted',
  'customer.imported': 'Customer list imported',
  'customer.link_regenerated': 'New form link generated (old link stopped working)',
  'review.verified': 'Submission marked as verified',
  'review.needs_correction': 'Customer asked to correct their submission',
  'review.pending': 'Review reset',
  'email.invite': 'Invite emails sent',
  'email.reminder': 'Reminder emails sent',
  'email.auto_reminder': 'Automatic reminders sent',
  'entity.created': 'Entity added',
  'entity.updated': 'Entity edited',
  'entity.deleted': 'Entity deleted',
  'settings.updated': 'Settings changed',
  'admin.login': 'Signed in',
  'admin.created': 'Admin user added',
  'admin.deleted': 'Admin user removed',
  'admin.password_changed': 'Password changed',
  'export.xlsx': 'Excel export downloaded',
  'demo.loaded': 'Demo data loaded',
  'demo.cleared': 'Demo data removed',
};

export const ACTION_GROUPS = [
  { value: 'form', label: 'Customer form' },
  { value: 'email', label: 'Emails' },
  { value: 'review', label: 'Reviews' },
  { value: 'customer', label: 'Customer records' },
  { value: 'entity', label: 'Entities' },
  { value: 'settings', label: 'Settings' },
  { value: 'admin', label: 'Sign-ins and users' },
  { value: 'export', label: 'Exports' },
  { value: 'demo', label: 'Demo data' },
];

/** Who did it, in words: an admin's email, "Customer", or "System". */
export function actorLabel(actor?: string): string {
  if (!actor || actor === 'system') return 'System';
  if (actor.startsWith('customer:')) return 'Customer';
  return actor;
}

/** One-line summary of an audit entry, with the useful details folded in. */
export function describeLog(l: AuditLog): string {
  const base = ACTION_LABEL[l.action] ?? l.action;
  const d = l.details ?? {};
  const parts: string[] = [];
  if (l.action === 'form.resubmitted' && d.changed?.length) parts.push(`changed: ${d.changed.map(labelOf).join(', ')}`);
  if (d.filesReplaced?.length && l.action !== 'form.submitted') parts.push(`new files: ${d.filesReplaced.map(labelOf).join(', ')}`);
  if (typeof d.count === 'number' && l.action.startsWith('email.')) parts.push(`${d.count} sent${d.failed ? `, ${String(d.failed)} failed` : ''}`);
  if (typeof d.sent === 'number') parts.push(`${d.sent} sent`);
  if (l.action === 'customer.imported' && typeof d.created === 'number') parts.push(`${String(d.created)} added, ${String(d.updated ?? 0)} updated`);
  if (l.action === 'export.xlsx' && typeof d.count === 'number') parts.push(`${d.count} customers`);
  if (typeof d.name === 'string' && l.action.startsWith('entity.')) parts.push(d.name);
  if (typeof d.email === 'string' && l.action.startsWith('admin.')) parts.push(d.email);
  if (typeof d.note === 'string' && d.note && l.action === 'review.needs_correction') parts.push(`“${d.note}”`);
  return parts.length ? `${base} — ${parts.join(' · ')}` : base;
}
