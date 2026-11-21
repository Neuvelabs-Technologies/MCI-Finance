import type { EmailList } from '@/types';
import { http } from './client';

const BASE = '/api/emails';

export interface EmailQuery {
  page?: number;
  limit?: number;
  q?: string;
  /** A status, or a group: "problem", "delivered", "waiting". */
  status?: string;
  kind?: string;
  customer?: string;
  /** "customer" or "vendor": emails to one group only. */
  type?: string;
}

const qs = (query: EmailQuery) =>
  new URLSearchParams(
    Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => [k, String(v)])
  );

export const emailsApi = {
  list: (query: EmailQuery = {}) => http.get<EmailList>(`${BASE}?${qs(query)}`),
  exportUrl: (query: EmailQuery) => `${BASE}/export?${qs({ ...query, page: undefined, limit: undefined })}`,
  /** Ask Mailjet for the latest status of recent emails. */
  sync: () => http.post<{ checked: number; updated: number }>(`${BASE}/sync`),
};
