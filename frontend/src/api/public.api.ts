import type { PublicFormResponse, PublicSettings } from '@/types';
import { http } from './client';

const BASE = '/api/public';

export const publicApi = {
  info: () => http.get<{ settings: PublicSettings }>(`${BASE}/info`),
  logoUrl: (version?: number) => `${BASE}/logo${version ? `?v=${version}` : ''}`,
  getForm: (token: string) => http.get<PublicFormResponse>(`${BASE}/form/${encodeURIComponent(token)}`),
  /** Ask for the form link again. Always succeeds, whether or not the address is registered. */
  resendLink: (email: string) => http.post<{ ok: true }>(`${BASE}/resend-link`, { email }),
  submitForm: (token: string, form: FormData) =>
    http.upload<{ ok: true; submittedAt: string }>(`${BASE}/form/${encodeURIComponent(token)}`, form),
};
