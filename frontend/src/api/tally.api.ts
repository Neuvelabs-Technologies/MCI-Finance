import type { TallyCompany, TallyLedger, TallyPage, TallySummary, TallyVoucher } from '@/types';
import { http } from './client';

const BASE = '/api/tally';

export interface TallyQuery {
  source: string;
  company: string;
  from?: string;
  to?: string;
  type?: string;
  group?: string;
  q?: string;
  page?: number;
  limit?: number;
}

const qs = (q: TallyQuery) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') p.set(k, String(v));
  return p.toString();
};

export const tallyApi = {
  companies: () => http.get<{ companies: TallyCompany[] }>(`${BASE}/companies`),
  summary: (q: TallyQuery) => http.get<TallySummary>(`${BASE}/summary?${qs(q)}`),
  vouchers: (q: TallyQuery) => http.get<TallyPage<TallyVoucher> & { types: string[] }>(`${BASE}/vouchers?${qs(q)}`),
  ledgers: (q: TallyQuery) => http.get<TallyPage<TallyLedger> & { groups: string[] }>(`${BASE}/ledgers?${qs(q)}`),
};
