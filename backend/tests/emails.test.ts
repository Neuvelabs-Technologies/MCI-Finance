import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { config } from '../src/config/env.js';
import { Customer } from '../src/models/Customer.js';
import { EmailMessage } from '../src/models/EmailMessage.js';
import { ensureSeed } from '../src/seeds/seed.js';

let mongo: MongoMemoryServer;
let app: Express;
let agent: ReturnType<typeof request.agent>;

const saved = { mailjet: { ...config.mailjet }, mailFrom: config.mailFrom };
const SECRET = 'webhook-secret-for-tests';
const hook = () => request(app).post('/api/webhooks/mailjet').auth('mailjet', SECRET);

/** Mailjet's API, faked. IDs are bigger than JavaScript numbers can hold exactly, as in real life. */
let uuidSeq = 0;
let sendFails = false;
let messageStatus: Record<string, { status: string; comment?: string }> = {};
const mailjetFetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
  const u = String(url);
  if (u.endsWith('/v3.1/send')) {
    if (sendFails) return new Response(JSON.stringify({ Messages: [{ Status: 'error', Errors: [{ ErrorMessage: 'Sender is not validated', ErrorRelatedTo: ['From.Email'] }] }] }), { status: 400 });
    const msg = JSON.parse(String(init?.body)).Messages[0] as { To: { Email: string }[] };
    const to = msg.To.map((t) => `{"Email":"${t.Email}","MessageUUID":"uuid-${++uuidSeq}","MessageID":28823041765723995${uuidSeq}}`);
    return new Response(`{"Messages":[{"Status":"success","To":[${to.join(',')}]}]}`, { status: 200 });
  }
  const m = /\/(message|messagehistory)\/(\d+)$/.exec(u);
  if (m && messageStatus[m[2]]) {
    const s = messageStatus[m[2]];
    const data = m[1] === 'message' ? [{ Status: s.status }] : [{ EventAt: 1790000000, EventType: s.status, State: 'user unknown', Comment: s.comment ?? '' }];
    return new Response(JSON.stringify({ Data: data }), { status: 200 });
  }
  return new Response('{}', { status: 404 });
});

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('einvoice_emails_test'));
  await ensureSeed();
  app = createApp();
  agent = request.agent(app);
  expect((await agent.post('/api/auth/login').send({ email: 'admin@test.example', password: 'TestPassword123!' })).status).toBe(200);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Customer.deleteMany({});
  await EmailMessage.deleteMany({});
  Object.assign(config.mailjet, { apiKey: 'key', secretKey: 'secret', webhookSecret: SECRET });
  config.mailFrom = 'MCI <mci.admin@wearemci.com>';
  sendFails = false;
  messageStatus = {};
  mailjetFetch.mockClear();
  vi.stubGlobal('fetch', mailjetFetch);
});

afterEach(() => {
  Object.assign(config.mailjet, saved.mailjet);
  config.mailFrom = saved.mailFrom;
  vi.unstubAllGlobals();
});

async function invitedCustomer(emails = 'a@acme.example, b@acme.example') {
  const c = await agent.post('/api/customers').send({ code: 'EM01', name: 'Acme', emails });
  const id = c.body.customer.id as string;
  const sent = await agent.post('/api/customers/send').send({ kind: 'invite', ids: [id] });
  expect(sent.body.results[0].ok).toBe(true);
  return id;
}

describe('email tracking', () => {
  it('records one email per recipient with Mailjet ids, exactly', async () => {
    const id = await invitedCustomer();
    const mails = await EmailMessage.find({ customer: id }).sort({ to: 1 });
    expect(mails.map((m) => [m.to, m.kind, m.status, m.provider])).toEqual([
      ['a@acme.example', 'invite', 'queued', 'mailjet'],
      ['b@acme.example', 'invite', 'queued', 'mailjet'],
    ]);
    expect(mails[0].messageId).toMatch(/^28823041765723995\d$/); // not rounded
    const c = await Customer.findById(id);
    expect(c!.emailLog[0].batchId).toBe(mails[0].batchId);
  });

  it('accepts only authenticated webhook calls, and only when a secret is set', async () => {
    expect((await request(app).post('/api/webhooks/mailjet').send({ event: 'sent' })).status).toBe(401);
    expect((await request(app).post('/api/webhooks/mailjet').auth('mailjet', 'wrong').send({ event: 'sent' })).status).toBe(401);
    config.mailjet.webhookSecret = '';
    expect((await hook().send({ event: 'sent' })).status).toBe(404);
  });

  it('moves the status forward from webhook events and flags bounces on the customer', async () => {
    const id = await invitedCustomer();
    const [a, b] = await EmailMessage.find({ customer: id }).sort({ to: 1 });

    // Grouped events (Mailjet "version 2"), one unknown message among them
    const r = await hook().send([
      { event: 'sent', time: 1790000000, email: a.to, Message_GUID: a.messageUuid },
      { event: 'open', time: 1790000100, email: a.to, Message_GUID: a.messageUuid },
      { event: 'sent', time: 1790000000, email: 'x@else.example', Message_GUID: 'someone-else' },
    ]);
    expect(r.body).toMatchObject({ ok: true, received: 3, applied: 2 });
    // A late "sent" doesn't move an opened email back; a repeat isn't recorded twice
    await hook().send({ event: 'sent', time: 1790000000, email: a.to, Message_GUID: a.messageUuid });
    const opened = await EmailMessage.findById(a._id);
    expect(opened!.status).toBe('opened');
    expect(opened!.events.map((e) => e.type)).toEqual(['sent', 'open']);

    // Matched by our CustomID when Mailjet's id isn't known
    await hook().send({ event: 'bounce', time: 1790000200, email: b.to, CustomID: b.batchId, hard_bounce: true, error: 'user unknown', error_related_to: 'recipient' });
    const bounced = await EmailMessage.findById(b._id);
    expect(bounced!.status).toBe('bounced');
    expect(bounced!.detail).toContain('Hard bounce');

    const c = await Customer.findById(id);
    expect(c!.emailLog[0].ok).toBe(false);
    expect(c!.emailLog[0].error).toContain('b@acme.example');
    expect((await agent.get('/api/customers/overview')).body.attention.emailFailures).toBe(1);

    const detail = await agent.get(`/api/customers/${id}`);
    expect(detail.body.emails).toHaveLength(2);
  });

  it('records emails the provider rejects as failed', async () => {
    sendFails = true;
    const c = await agent.post('/api/customers').send({ code: 'EM02', name: 'Beta', emails: 'x@beta.example' });
    const sent = await agent.post('/api/customers/send').send({ kind: 'invite', ids: [c.body.customer.id] });
    expect(sent.body.results[0]).toMatchObject({ ok: false });
    const m = await EmailMessage.findOne({ to: 'x@beta.example' });
    expect(m).toMatchObject({ status: 'failed' });
    expect(m!.detail).toContain('Sender is not validated');
  });

  it('lists, filters, exports and refreshes from Mailjet', async () => {
    const id = await invitedCustomer();
    const [a] = await EmailMessage.find({ customer: id }).sort({ to: 1 });
    messageStatus[a.messageId!] = { status: 'hardbounced', comment: 'mailbox does not exist' };

    const sync = await agent.post('/api/emails/sync');
    expect(sync.body).toEqual({ checked: 2, updated: 1 });
    expect((await EmailMessage.findById(a._id))!.detail).toContain('mailbox does not exist');

    const all = await agent.get('/api/emails');
    expect(all.body.total).toBe(2);
    expect(all.body.summary).toEqual({ bounced: 1, queued: 1 });
    expect(all.body.emails[0].customer.code).toBe('EM01');
    expect((await agent.get('/api/emails?status=problem')).body.total).toBe(1);
    expect((await agent.get('/api/emails?q=b@acme')).body.total).toBe(1);
    expect((await agent.get('/api/emails?kind=reminder')).body.total).toBe(0);

    const xlsx = await agent.get('/api/emails/export').buffer(true);
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
  });

  it('removes a customer’s emails with the customer', async () => {
    const id = await invitedCustomer();
    expect((await agent.delete(`/api/customers/${id}`)).status).toBe(200);
    expect(await EmailMessage.countDocuments()).toBe(0);
  });

  it('demo data comes with delivery records that are cleared with it', async () => {
    await agent.post('/api/system/demo');
    expect(await EmailMessage.countDocuments({ demo: true, status: 'bounced' })).toBeGreaterThan(0);
    expect(await EmailMessage.countDocuments({ demo: true, status: 'opened' })).toBeGreaterThan(0);
    expect(mailjetFetch).not.toHaveBeenCalledWith(expect.stringContaining('/send'), expect.anything());
    await agent.delete('/api/system/demo');
    expect(await EmailMessage.countDocuments()).toBe(0);
  });
});
