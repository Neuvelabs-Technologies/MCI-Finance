import type {
  AuditLog,
  CustomerDetail,
  CustomerList,
  CustomerStats,
  CustomerSummary,
  EmailKind,
  ImportResult,
  Overview,
  ReviewStatus,
  SendResult,
} from '@/types';
import type { FileField } from '@/lib/rules';
import { http, type Ok } from './client';

const BASE = '/api/customers';

export interface CustomerInput {
  code: string;
  name: string;
  emails: string;
  contactName: string;
  notes: string;
}

/** List filters, also used for the Excel export. */
export type CustomerFilter = { status?: string; review?: string; issue?: string; q?: string };

const qs = (params: Record<string, string | undefined>) =>
  new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => !!e[1])).toString();

export const customersApi = {
  list: (filter: CustomerFilter & { page: number; limit: number; sort?: string; dir?: 'asc' | 'desc' }) =>
    http.get<CustomerList>(`${BASE}?${qs({ ...filter, page: String(filter.page), limit: String(filter.limit) })}`),
  stats: () => http.get<CustomerStats>(`${BASE}/stats`),
  overview: () => http.get<Overview>(`${BASE}/overview`),
  get: (id: string) => http.get<{ customer: CustomerDetail; logs: AuditLog[] }>(`${BASE}/${id}`),
  create: (body: CustomerInput) => http.post<{ customer: CustomerSummary }>(BASE, body),
  update: (id: string, body: CustomerInput) => http.put<{ customer: CustomerSummary }>(`${BASE}/${id}`, body),
  remove: (id: string) => http.del<Ok>(`${BASE}/${id}`),
  /** Delete several customers and their documents. */
  removeMany: (ids: string[]) => http.post<{ deleted: number }>(`${BASE}/delete`, { ids }),
  send: (kind: EmailKind, opts: { ids?: string[]; allPending?: boolean }) =>
    http.post<{ results: SendResult[]; smtpConfigured: boolean }>(`${BASE}/send`, { kind, ...opts }),
  markSent: (ids: string[]) => http.post<Ok>(`${BASE}/mark-sent`, { ids }),
  regenerateLink: (id: string) => http.post<{ link: string; tokenExpiresAt: string }>(`${BASE}/${id}/link`),
  review: (id: string, reviewStatus: ReviewStatus, reviewNote: string) =>
    http.patch<{ customer: CustomerSummary }>(`${BASE}/${id}/review`, { reviewStatus, reviewNote }),
  import: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return http.upload<ImportResult>(`${BASE}/import`, fd);
  },

  // Plain URLs for links and downloads
  exportUrl: (filter: CustomerFilter) => `${BASE}/export?${qs(filter)}`,
  importTemplateUrl: () => `${BASE}/import-template`,
  fileUrl: (id: string, field: FileField, opts: { version?: string; download?: boolean } = {}) =>
    `${BASE}/${id}/files/${field}${opts.version || opts.download ? `?${qs({ v: opts.version, download: opts.download ? '1' : undefined })}` : ''}`,
};
