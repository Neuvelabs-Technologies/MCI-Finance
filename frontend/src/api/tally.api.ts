import type { GroupPlReport, GroupPlSetupData, GroupPlSetupResponse, TallyCompany, TallyConnectorStatus, TallyLedger, TallyPage, TallyReport, TallySummary, TallyVoucher } from '@/types';
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
  status: () => http.get<{ connectors: TallyConnectorStatus[]; now: string }>(`${BASE}/status`),
  requestSync: (source: string) => http.post<{ connector: TallyConnectorStatus }>(`${BASE}/sync-request`, { source }),
  report: (q: TallyQuery) => http.get<TallyReport>(`${BASE}/report?${qs(q)}`),
  groupPl: (q: GroupPlQuery) => http.get<GroupPlReport>(`${BASE}/group-pl?${gq(q)}`),
  groupPlExportUrl: (q: GroupPlQuery) => `${BASE}/group-pl/export?${gq(q)}`,
  groupPlSetup: (q: GroupPlQuery) => http.get<GroupPlSetupResponse>(`${BASE}/group-pl/setup?${gq(q)}`),
  saveGroupPlSetup: (t: { source: string; company: string }, setup: Partial<GroupPlSetupData>) =>
    http.put<{ setup: GroupPlSetupData }>(`${BASE}/group-pl/setup`, { ...t, ...setup }),
  uploadForecast: (t: { source: string; company: string; year: number }, file: File) => {
    const form = new FormData();
    form.set('source', t.source);
    form.set('company', t.company);
    form.set('year', String(t.year));
    form.set('file', file);
    return http.upload<{ id: string; year: number; label: string; version: string; entity: string; rows: number; unknownCodes: string[] }>(`${BASE}/group-pl/forecast`, form);
  },
};

export interface GroupPlQuery {
  source: string;
  company: string;
  year?: number;
  month?: number;
  forecastId?: string;
}

const gq = (q: GroupPlQuery) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') p.set(k, String(v));
  return p.toString();
};
