import type { AdminUser } from '@/types';
import { http, type Ok } from './client';

const BASE = '/api/admins';

export const adminsApi = {
  list: () => http.get<{ admins: AdminUser[] }>(BASE),
  create: (body: { name: string; email: string; password: string }) => http.post<{ admin: AdminUser }>(BASE, body),
  remove: (id: string) => http.del<Ok>(`${BASE}/${id}`),
  setTally: (id: string, enabled: boolean) => http.put<{ admin: AdminUser }>(`${BASE}/${id}/tally`, { enabled }),
};
