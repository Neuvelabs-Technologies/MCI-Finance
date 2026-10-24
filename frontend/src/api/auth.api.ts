import type { AdminUser, MeResponse } from '@/types';
import { http, type Ok } from './client';

const BASE = '/api/auth';

export const authApi = {
  login: (email: string, password: string) => http.post<{ admin: AdminUser }>(`${BASE}/login`, { email, password }),
  logout: () => http.post<Ok>(`${BASE}/logout`),
  me: () => http.get<MeResponse>(`${BASE}/me`),
  /** Whether one-click sign-in is on (development / staging only) and which accounts it offers. */
  quickLoginOptions: () => http.get<{ enabled: boolean; accounts: { email: string; name?: string }[] }>(`${BASE}/quick-login`),
  quickLogin: (email: string) => http.post<{ admin: AdminUser }>(`${BASE}/quick-login`, { email }),
  changePassword: (current: string, next: string) => http.post<Ok>(`${BASE}/password`, { current, next }),
};
