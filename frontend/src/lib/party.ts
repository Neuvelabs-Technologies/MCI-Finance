import type { PartyType } from '@/types';

export interface PartyLabels {
  type: PartyType;
  /** "customer" / "vendor" */
  singular: string;
  /** "Customer" / "Vendor" */
  Singular: string;
  /** "Customers" / "Vendors" */
  Plural: string;
  plural: string;
  /** Admin list page, e.g. /admin/vendors */
  path: string;
}

/** Wording and links for customers vs vendors, so one set of pages serves both. */
export function partyLabels(type: PartyType | undefined): PartyLabels {
  return type === 'vendor'
    ? { type: 'vendor', singular: 'vendor', Singular: 'Vendor', plural: 'vendors', Plural: 'Vendors', path: '/admin/vendors' }
    : { type: 'customer', singular: 'customer', Singular: 'Customer', plural: 'customers', Plural: 'Customers', path: '/admin/customers' };
}

/** Admin page for one customer or vendor. */
export const partyPath = (p: { id: string; type?: PartyType }) => `${partyLabels(p.type).path}/${p.id}`;
