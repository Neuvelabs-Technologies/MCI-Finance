// Point Mailjet's delivery events (sent, opened, bounced, blocked, spam, unsubscribed) at this server.
//   npm run mailjet:webhook            set up / update   (production: npm run mailjet:webhook:prod)
//   npm run mailjet:webhook -- status  show what Mailjet has now
// Needs MAILJET_API_KEY, MAILJET_SECRET_KEY, MAILJET_WEBHOOK_SECRET and an https PUBLIC_BASE_URL.
// The setting belongs to the Mailjet API key: a second server using the same key would take the events over.
import { config } from '../config/env.js';

const EVENTS = ['sent', 'open', 'click', 'bounce', 'blocked', 'spam', 'unsub'];
const API = 'https://api.mailjet.com/v3/REST/eventcallbackurl';
const auth = `Basic ${Buffer.from(`${config.mailjet.apiKey}:${config.mailjet.secretKey}`).toString('base64')}`;

interface Callback {
  ID: number;
  EventType: string;
  Url: string;
  Status: string;
  Version: number;
  IsBackup?: boolean;
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

const hideSecret = (url: string) => url.replace(/\/\/([^:/@]+):[^@]+@/, '//$1:•••@');

async function run() {
  if (!config.mailjet.apiKey || !config.mailjet.secretKey) throw new Error('MAILJET_API_KEY and MAILJET_SECRET_KEY must be set');
  const current = (await call<{ Data: Callback[] }>('GET', `${API}?Limit=100`)).Data;

  if (process.argv.includes('status')) {
    if (!current.length) console.log('No webhook set up in Mailjet for this API key.');
    for (const c of current) console.log(`${c.EventType.padEnd(8)} ${c.Status.padEnd(6)} v${c.Version}  ${hideSecret(c.Url)}`);
    return;
  }

  if (!config.mailjet.webhookSecret) throw new Error('Set MAILJET_WEBHOOK_SECRET (a long random string) first');
  if (!config.publicBaseUrl.startsWith('https://')) throw new Error('PUBLIC_BASE_URL must be https:// — Mailjet only calls public https addresses');
  const base = new URL(config.publicBaseUrl);
  const url = `${base.protocol}//mailjet:${encodeURIComponent(config.mailjet.webhookSecret)}@${base.host}/api/webhooks/mailjet`;

  for (const type of EVENTS) {
    // Version 2 = Mailjet sends events in batches (an array), which our endpoint accepts
    const body = { EventType: type, Url: url, Status: 'alive', Version: 2, IsBackup: false };
    const existing = current.find((c) => c.EventType === type && !c.IsBackup);
    if (existing) await call('PUT', `${API}/${existing.ID}`, body);
    else await call('POST', API, body);
    console.log(`${type.padEnd(8)} → ${hideSecret(url)}`);
  }
  console.log('Done. Mailjet will report delivery events to this server.');
}

run().catch((err: unknown) => {
  console.error(`[mailjet:webhook] ${(err as Error).message}`);
  process.exit(1);
});
