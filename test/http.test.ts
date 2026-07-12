import { describe, it, expect, vi } from 'vitest';
import { OblodaiClient } from '../src/client.js';
import { OblodaiApiError } from '../src/errors.js';

function mockFetch(responses: Array<{ status: number; body: unknown }>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let i = 0;
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

function makeClient(fetchImpl: typeof fetch, retry: false | object = false) {
  return new OblodaiClient({
    publicId: 'pub_1',
    secret: 'sec_1',
    baseUrl: 'https://api.test',
    fetch: fetchImpl,
    retry: retry as never,
  });
}

describe('HttpClient через OblodaiClient', () => {
  it('подписывает запрос тремя заголовками и разворачивает result', async () => {
    const { fn, calls } = mockFetch([
      { status: 200, body: { state: 0, result: { uuid: 'p1', order_id: 'o1' } } },
    ]);
    const client = makeClient(fn);

    const payment = await client.payments.create({
      amount: '10',
      currency: 'USD',
      order_id: 'o1',
    });

    expect(payment.uuid).toBe('p1');

    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['X-Public-Id']).toBe('pub_1');
    expect(headers['X-Timestamp']).toMatch(/^\d+$/);
    expect(headers['X-Signature']).toMatch(/^[0-9a-f]{64}$/);
    expect(calls[0]!.url).toBe('https://api.test/v1/payment');
  });

  it('бросает OblodaiApiError с кодом из конверта error', async () => {
    const { fn } = mockFetch([
      { status: 409, body: { error: { code: 'payout.insufficient_funds', message: 'no funds' } } },
    ]);
    const client = makeClient(fn);

    await expect(
      client.payouts.create({ amount: '5', currency: 'USDT', address: 'T...', order_id: 'x' }),
    ).rejects.toMatchObject({ code: 'payout.insufficient_funds', status: 409 });
  });

  it('funds_maturing терминальна (НЕ retriable), 5xx/429 — retriable', async () => {
    // payout.funds_maturing — бизнес-состояние «средства дозревают», а не транспортный сбой:
    // повторять его бессмысленно, обрабатываем в коде.
    const err = new OblodaiApiError('payout.funds_maturing', 'maturing', 409, {});
    expect(err.isRetriable).toBe(false);
    const err2 = new OblodaiApiError('payout.insufficient_funds', 'no', 409, {});
    expect(err2.isRetriable).toBe(false);
    expect(new OblodaiApiError('gateway.unavailable', 'x', 503, {}).isRetriable).toBe(true);
    expect(new OblodaiApiError('http.429', 'x', 429, {}).isRetriable).toBe(true);
  });

  it('повторяет 503 и добивается успеха при включённых ретраях', async () => {
    const { fn, calls } = mockFetch([
      { status: 503, body: { error: { code: 'gateway.unavailable', message: 'try later' } } },
      { status: 200, body: { state: 0, result: { balance: { merchant: [] } } } },
    ]);
    const client = makeClient(fn, { maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 5 });

    const bal = await client.account.balance();
    expect(bal.balance.merchant).toEqual([]);
    expect(calls.length).toBe(2); // первая — 503, вторая — успех
  });

  it('НЕ повторяет 400', async () => {
    const { fn, calls } = mockFetch([
      { status: 400, body: { error: { code: 'request.bad_json', message: 'bad' } } },
    ]);
    const client = makeClient(fn, { maxAttempts: 3, initialDelayMs: 1 });

    await expect(client.account.balance()).rejects.toMatchObject({ code: 'request.bad_json' });
    expect(calls.length).toBe(1);
  });

  it('публичный курс идёт без заголовков подписи', async () => {
    const { fn, calls } = mockFetch([
      { status: 200, body: { state: 0, result: [{ from: 'ETH', to: 'USDT', course: '3450' }] } },
    ]);
    const client = makeClient(fn);

    const rates = await client.rates.list('ETH');
    expect(rates[0]!.course).toBe('3450');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['X-Signature']).toBeUndefined();
  });

  it('возвращает объект без конверта (случай /v1/webhooks)', async () => {
    const { fn } = mockFetch([
      { status: 201, body: { endpoint_id: 'e1', url: 'https://x', secret: 's1' } },
    ]);
    const client = makeClient(fn);

    const reg = await client.webhooks.register('https://x');
    expect(reg.secret).toBe('s1');
    expect(reg.endpoint_id).toBe('e1');
  });

  it('на 429 выносит message из тела и код http.429', async () => {
    const { fn } = mockFetch([
      { status: 429, body: { state: 1, message: 'rate limit exceeded' } },
    ]);
    const client = makeClient(fn); // retry выключен

    await expect(client.account.balance()).rejects.toMatchObject({
      code: 'http.429',
      status: 429,
      message: 'rate limit exceeded',
    });
  });

  it('на 429 уважает Retry-After и повторяет запрос', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    let i = 0;
    const fn = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (i++ === 0) {
        return new Response(JSON.stringify({ state: 1, message: 'rate limit exceeded' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '0' },
        });
      }
      return new Response(JSON.stringify({ state: 0, result: { balance: { merchant: [] } } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const client = makeClient(fn, { maxAttempts: 3, initialDelayMs: 1 });
    const bal = await client.account.balance();
    expect(bal.balance.merchant).toEqual([]);
    expect(calls.length).toBe(2); // первый 429 → повтор → успех
  });

  it('fromEnv читает OBLODAI_* и падает при отсутствии обязательных', () => {
    const prev = { ...process.env };
    try {
      process.env.OBLODAI_PUBLIC_ID = 'pub_env';
      process.env.OBLODAI_SECRET = 'sec_env';
      process.env.OBLODAI_BASE_URL = 'https://env.example';
      const client = OblodaiClient.fromEnv({ retry: false });
      expect(client).toBeInstanceOf(OblodaiClient);

      delete process.env.OBLODAI_PUBLIC_ID;
      expect(() => OblodaiClient.fromEnv()).toThrow(/OBLODAI_PUBLIC_ID/);
    } finally {
      process.env = prev;
    }
  });

  it('currencies() ходит публичным GET и разворачивает {currencies}', async () => {
    const { fn, calls } = mockFetch([
      {
        status: 200,
        body: { currencies: [{ symbol: 'USDT', decimals: 6, networks: [] }] },
      },
    ]);
    const client = makeClient(fn);

    const list = await client.rates.currencies();
    expect(list[0]!.symbol).toBe('USDT');
    expect(calls[0]!.url).toBe('https://api.test/v1/currencies');
    expect(calls[0]!.init.method).toBe('GET');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['X-Signature']).toBeUndefined();
  });
});
