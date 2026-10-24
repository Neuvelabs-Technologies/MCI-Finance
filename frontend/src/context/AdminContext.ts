import { createContext, useContext } from 'react';
import type { MeResponse } from '@/types';

export interface AdminContextValue extends MeResponse {
  /** Re-read the session (e.g. after demo data changes). */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AdminContext = createContext<AdminContextValue | null>(null);

/** The signed-in admin. Only usable inside the admin panel. */
export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used inside the admin panel');
  return ctx;
}
