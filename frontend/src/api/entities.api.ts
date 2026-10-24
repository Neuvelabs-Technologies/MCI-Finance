import type { Entity } from '@/types';
import { http, type Ok } from './client';

const BASE = '/api/entities';

export const entitiesApi = {
  list: () => http.get<{ entities: Entity[] }>(BASE),
  create: (body: Entity) => http.post<{ entity: Entity }>(BASE, body),
  update: (id: string, body: Entity) => http.put<{ entity: Entity }>(`${BASE}/${id}`, body),
  remove: (id: string) => http.del<Ok>(`${BASE}/${id}`),
};
