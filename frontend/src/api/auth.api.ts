import type { AdminUser, MeResponse, SignInOptions } from '@/types';
import { http, type Ok } from './client';

const BASE = '/api/auth';

export const authApi = {
  login: (email: string, password: string) => http.post<{ admin: AdminUser }>(`${BASE}/login`, { email, password }),
  options: () => http.get<SignInOptions>(`${BASE}/options`),
  /** Where to send the browser for Microsoft sign-in, and the transaction to bring back. */
  microsoftStart: () => http.post<{ url: string; transaction: string }>(`${BASE}/microsoft/start`),
  microsoftCallback: (body: { code: string; state: string; transaction: string }) => http.post<{ admin: AdminUser }>(`${BASE}/microsoft/callback`, body),
  logout: () => http.post<Ok>(`${BASE}/logout`),
  me: () => http.get<MeResponse>(`${BASE}/me`),
  /** Whether one-click sign-in is on (development / staging only) and which accounts it offers. */
  quickLoginOptions: () => http.get<{ enabled: boolean; accounts: { email: string; name?: string }[] }>(`${BASE}/quick-login`),
  quickLogin: (email: string) => http.post<{ admin: AdminUser }>(`${BASE}/quick-login`, { email }),
  changePassword: (current: string, next: string) => http.post<Ok>(`${BASE}/password`, { current, next }),
};
