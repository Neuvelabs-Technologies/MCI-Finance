/** Error thrown for any non-2xx response. `data` is the parsed JSON body, if there was one. */
export class ApiError<T = unknown> extends Error {
  constructor(
    message: string,
    public status: number,
    public data: T | null
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request<T>(method: Method, url: string, body?: unknown, form?: FormData): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} };
  if (form) init.body = form;
  else if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
  const data: unknown = isJson ? await res.json() : null;
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, data);
  }
  return data as T;
}

export const http = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
  upload: <T>(url: string, form: FormData) => request<T>('POST', url, undefined, form),
};

export type Ok = { ok: true };

/** Message of an unknown caught error. */
export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));
