import type { AuditList } from '@/types';
import { http } from './client';

export interface AuditQuery {
  page?: number;
  limit?: number;
  q?: string;
  /** Action group, e.g. "email" or "review". */
  group?: string;
  customer?: string;
}

export const auditApi = {
  list: (query: AuditQuery = {}) => {
    const params = new URLSearchParams(
      Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => [k, String(v)])
    );
    return http.get<AuditList>(`/api/audit?${params}`);
  },
};
