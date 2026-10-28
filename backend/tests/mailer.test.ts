import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config/env.js';
import { mailConfigured, mailProvider, parseAddress, sendMail } from '../src/services/mailer.service.js';

const saved = { mailjet: { ...config.mailjet }, mailFrom: config.mailFrom };
const mail = { to: ['a@acme.example', 'b@acme.example'], subject: 'Hi', text: 'Hello', html: '<p>Hello</p>', replyTo: 'finance@mci.example' };

const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe('parseAddress', () => {
  it('splits a display name from the address', () => {
    expect(parseAddress('"MCI Middle East – Accounts" <mci.admin@wearemci.com>')).toEqual({ Email: 'mci.admin@wearemci.com', Name: 'MCI Middle East – Accounts' });
    expect(parseAddress('MCI <mci.admin@wearemci.com>')).toEqual({ Email: 'mci.admin@wearemci.com', Name: 'MCI' });
    expect(parseAddress(' mci.admin@wearemci.com ')).toEqual({ Email: 'mci.admin@wearemci.com' });
  });
});

describe('Mailjet', () => {
  beforeEach(() => {
    config.mailjet.apiKey = 'key';
    config.mailjet.secretKey = 'secret';
    config.mailFrom = 'MCI Accounts <accounts@mci.example>';
  });
  afterEach(() => {
    Object.assign(config.mailjet, saved.mailjet);
    config.mailFrom = saved.mailFrom;
    vi.unstubAllGlobals();
  });

  it('is used when both keys are set', () => {
    expect(mailProvider()).toBe('mailjet');
    expect(mailConfigured()).toBe(true);
    config.mailjet.secretKey = '';
    expect(mailProvider()).not.toBe('mailjet');
  });

  it('sends one message to every recipient through the Send API', async () => {
    const fetch = reply(200, { Messages: [{ Status: 'success' }] });
    vi.stubGlobal('fetch', fetch);
    await sendMail(mail);

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.mailjet.com/v3.1/send');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('key:secret').toString('base64')}`);
    expect(JSON.parse(String(init.body))).toEqual({
      Messages: [
        {
          From: { Email: 'accounts@mci.example', Name: 'MCI Accounts' },
          To: [{ Email: 'a@acme.example' }, { Email: 'b@acme.example' }],
          ReplyTo: { Email: 'finance@mci.example' },
          Subject: 'Hi',
          TextPart: 'Hello',
          HTMLPart: '<p>Hello</p>',
        },
      ],
    });
  });

  it('reports Mailjet errors so they show in the email log', async () => {
    vi.stubGlobal(
      'fetch',
      reply(400, { Messages: [{ Status: 'error', Errors: [{ ErrorMessage: 'Sender is not validated', ErrorRelatedTo: ['From.Email'] }] }] }),
    );
    await expect(sendMail(mail)).rejects.toThrow('Mailjet: Sender is not validated (From.Email)');

    vi.stubGlobal('fetch', reply(401, { ErrorMessage: 'API key authentication/authorization failure' }));
    await expect(sendMail(mail)).rejects.toThrow('Mailjet rejected the API key or secret key');
  });

  it('refuses to send without a sender address', async () => {
    config.mailFrom = '';
    await expect(sendMail(mail)).rejects.toThrow('MAIL_FROM is empty');
  });
});
