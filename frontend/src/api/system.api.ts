import type { DemoStatus, SystemInfo } from '@/types';
import { http } from './client';

const BASE = '/api/system';

export const systemApi = {
  info: () => http.get<SystemInfo>(`${BASE}/info`),
  demoStatus: () => http.get<DemoStatus>(`${BASE}/demo`),
  loadDemo: () => http.post<{ customers: number; entities: number }>(`${BASE}/demo`),
  clearDemo: () => http.del<{ customers: number; entities: number; logs: number }>(`${BASE}/demo`),
};
