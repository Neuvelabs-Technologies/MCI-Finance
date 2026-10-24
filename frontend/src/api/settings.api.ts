import type { AppSettings, EmailKind, EmailTemplates, RenderedEmail } from '@/types';
import { http, type Ok } from './client';

const BASE = '/api/settings';

export const settingsApi = {
  get: () => http.get<{ settings: AppSettings; smtpConfigured: boolean; publicBaseUrl: string }>(BASE),
  update: (body: AppSettings) => http.put<{ settings: AppSettings }>(BASE, body),
  uploadLogo: (file: File) => {
    const fd = new FormData();
    fd.append('logo', file);
    return http.upload<Ok>(`${BASE}/logo`, fd);
  },
  removeLogo: () => http.del<Ok>(`${BASE}/logo`),
  testEmail: (to: string) => http.post<{ ok: true; smtpConfigured: boolean }>(`${BASE}/test-email`, { to }),
  previewEmail: (kind: EmailKind, email: EmailTemplates, settings: Partial<AppSettings>) =>
    http.post<RenderedEmail>(`${BASE}/preview-email`, { kind, email, settings }),
};
