import { describe, it, expect, vi } from 'vitest';
import { OblodaiClient } from '../src/client.js';

/**
 * Тот же мок-транспорт, что и в http.test.ts: собирает вызовы и отдаёт заранее заданные ответы.
 */
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

function sentBody(init: RequestInit): Record<string, unknown> {
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

function idemHeader(init: RequestInit): string | undefined {
  return (init.headers as Record<string, string>)['Idempotency-Key'];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const okPayment = { status: 200, body: { state: 0, result: { uuid: 'p1', order_id: 'x' } } };

describe('идемпотентность v1.1.0: заголовок Idempotency-Key', () => {
  it('payments.create шлёт Idempotency-Key (uuid) и БОЛЬШЕ НЕ подставляет order_id', async () => {
    const { fn, calls } = mockFetch([okPayment]);
    const client = makeClient(fn);

    await client.payments.create({ amount: '10', currency: 'USD' });

    const body = sentBody(calls[0]!.init);
    // order_id уходит как есть: не задали — его нет в теле, никакого idem-<uuid>.
    expect('order_id' in body).toBe(false);
    const key = idemHeader(calls[0]!.init);
    expect(key).toMatch(UUID_RE);
  });

  it('payments.create НЕ трогает переданный order_id', async () => {
    const { fn, calls } = mockFetch([okPayment]);
    const client = makeClient(fn);

    await client.payments.create({ amount: '10', currency: 'USD', order_id: 'mine' });

    expect(sentBody(calls[0]!.init).order_id).toBe('mine');
    expect(idemHeader(calls[0]!.init)).toMatch(UUID_RE);
  });

  it('при повторе (503 → 200) заголовок Idempotency-Key ОДИНАКОВ на обеих попытках', async () => {
    const { fn, calls } = mockFetch([
      { status: 503, body: { error: { code: 'gateway.unavailable', message: 'try later' } } },
      okPayment,
    ]);
    const client = makeClient(fn, { maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 5 });

    await client.payments.create({ amount: '10', currency: 'USD' });

    expect(calls.length).toBe(2);
    const first = idemHeader(calls[0]!.init);
    const second = idemHeader(calls[1]!.init);
    expect(first).toMatch(UUID_RE);
    // Ключ генерируется один раз ДО цикла ретраев — дубля операции не будет.
    expect(second).toBe(first);
  });

  it('два вызова create — РАЗНЫЕ ключи (операции не схлопываются)', async () => {
    const { fn, calls } = mockFetch([okPayment]);
    const client = makeClient(fn);

    const params = { amount: '10', currency: 'USD' };
    await client.payments.create(params);
    await client.payments.create(params);

    const k1 = idemHeader(calls[0]!.init);
    const k2 = idemHeader(calls[1]!.init);
    expect(k1).toMatch(UUID_RE);
    expect(k2).toMatch(UUID_RE);
    expect(k2).not.toBe(k1);
  });

  it('явный idempotency_key уходит в заголовок и НЕ попадает в тело; объект вызывающего не мутируется', async () => {
    const { fn, calls } = mockFetch([okPayment]);
    const client = makeClient(fn);

    const params = { amount: '10', currency: 'USD', order_id: 'o-1', idempotency_key: 'my-key-1' };
    await client.payments.create(params);

    expect(idemHeader(calls[0]!.init)).toBe('my-key-1');
    const body = sentBody(calls[0]!.init);
    expect('idempotency_key' in body).toBe(false);
    expect(body.order_id).toBe('o-1');
    // Исходный объект не тронут.
    expect(params.idempotency_key).toBe('my-key-1');
  });

  it('пустой/пробельный idempotency_key заменяется сгенерированным uuid', async () => {
    const { fn, calls } = mockFetch([okPayment]);
    const client = makeClient(fn);

    await client.payments.create({ amount: '10', currency: 'USD', idempotency_key: '   ' });

    expect(idemHeader(calls[0]!.init)).toMatch(UUID_RE);
  });

  it('account.transferToPersonal: заголовок есть, order_id НЕ подставляется', async () => {
    const { fn, calls } = mockFetch([
      {
        status: 200,
        body: {
          state: 0,
          result: { currency: 'USDT', amount: '5', direction: 'to_personal', personal_balance: '5' },
        },
      },
    ]);
    const client = makeClient(fn);

    await client.account.transferToPersonal({ amount: '5', currency: 'USDT' });

    expect('order_id' in sentBody(calls[0]!.init)).toBe(false);
    expect(idemHeader(calls[0]!.init)).toMatch(UUID_RE);
  });

  it('payouts.create и payments.refund шлют заголовок (обёрнутые эндпоинты)', async () => {
    const { fn, calls } = mockFetch([okPayment]);
    const client = makeClient(fn);

    await client.payouts.create({
      amount: '5',
      currency: 'USDT',
      address: 'T...',
      order_id: 'w-1',
    });
    await client.payments.refund({ uuid: 'p1' });

    expect(calls[0]!.url).toBe('https://api.test/v1/payout');
    expect(idemHeader(calls[0]!.init)).toMatch(UUID_RE);
    expect(calls[1]!.url).toBe('https://api.test/v1/payment/refund');
    expect(idemHeader(calls[1]!.init)).toMatch(UUID_RE);
  });

  it('batch-методы и resolve шлют заголовок', async () => {
    const { fn, calls } = mockFetch([
      { status: 200, body: { state: 0, result: { batch_id: 'b1', kind: 'payment', count: 1, status: 'pending' } } },
    ]);
    const client = makeClient(fn);

    await client.payments.createBatch([{ amount: '1', currency: 'USD', order_id: 'a-1' }]);
    await client.payments.refundBatch([{ reference: 'r-1', uuid: 'p1' }]);
    await client.payouts.createBatch([
      { amount: '1', currency: 'USDT', address: 'T..', order_id: 'w-1' },
    ]);
    await client.payouts.createMass([
      { amount: '1', currency: 'USDT', address: 'T..', order_id: 'w-2' },
    ]);
    await client.payments.resolve({ uuid: 'p1', action: 'accept' });

    for (const call of calls) expect(idemHeader(call.init)).toMatch(UUID_RE);
  });

  it('НЕобёрнутые эндпоинты заголовок НЕ шлют: payout-ссылки, платёжные ссылки, сплиты, send-email, info', async () => {
    const { fn, calls } = mockFetch([{ status: 200, body: { state: 0, result: {} } }]);
    const client = makeClient(fn);

    await client.payoutLinks.create({ currency: 'USDT', network: 'tron', amount: '5' });
    await client.links.create({ amount_mode: 'open', currency: 'USD' });
    await client.splits.splitToAddress('T...', 'tron', 10);
    await client.payments.sendEmail({ uuid: 'p1', email: 'a@b.c' });
    await client.payments.info({ uuid: 'p1' });

    for (const call of calls) expect(idemHeader(call.init)).toBeUndefined();
  });

  it('заголовок не участвует в подписи: подпись совпадает с HMAC(ts\\nPOST\\npath\\nbody)', async () => {
    const { fn, calls } = mockFetch([okPayment]);
    const client = makeClient(fn);

    await client.payments.create({ amount: '10', currency: 'USD', order_id: 'o1' });

    const headers = calls[0]!.init.headers as Record<string, string>;
    const crypto = await import('node:crypto');
    const expected = crypto
      .createHmac('sha256', 'sec_1')
      .update(`${headers['X-Timestamp']}\nPOST\n/v1/payment\n${calls[0]!.init.body as string}`)
      .digest('hex');
    expect(headers['X-Signature']).toBe(expected);
  });
});
