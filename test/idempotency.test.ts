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

/** Достаёт order_id из тела отправленного запроса. */
function sentOrderId(init: RequestInit): unknown {
  const body = JSON.parse(init.body as string) as { order_id?: unknown };
  return body.order_id;
}

describe('автоматический ключ идемпотентности order_id', () => {
  it('payments.create без order_id отправляет непустой order_id (idem-…)', async () => {
    const { fn, calls } = mockFetch([
      { status: 200, body: { state: 0, result: { uuid: 'p1', order_id: 'x' } } },
    ]);
    const client = makeClient(fn);

    await client.payments.create({ amount: '10', currency: 'USD' });

    const orderId = sentOrderId(calls[0]!.init);
    expect(typeof orderId).toBe('string');
    expect(orderId as string).not.toBe('');
    expect(orderId as string).toMatch(/^idem-/);
  });

  it('payments.create НЕ трогает переданный order_id', async () => {
    const { fn, calls } = mockFetch([
      { status: 200, body: { state: 0, result: { uuid: 'p1', order_id: 'mine' } } },
    ]);
    const client = makeClient(fn);

    await client.payments.create({ amount: '10', currency: 'USD', order_id: 'mine' });

    expect(sentOrderId(calls[0]!.init)).toBe('mine');
  });

  it('при повторе (503 → 200) отправляется ТОТ ЖЕ order_id на обеих попытках', async () => {
    const { fn, calls } = mockFetch([
      { status: 503, body: { error: { code: 'gateway.unavailable', message: 'try later' } } },
      { status: 200, body: { state: 0, result: { uuid: 'p1', order_id: 'x' } } },
    ]);
    const client = makeClient(fn, { maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 5 });

    await client.payments.create({ amount: '10', currency: 'USD' });

    expect(calls.length).toBe(2);
    const first = sentOrderId(calls[0]!.init);
    const second = sentOrderId(calls[1]!.init);
    expect(typeof first).toBe('string');
    expect(first as string).toMatch(/^idem-/);
    // Ключ инъектится один раз до запроса, поэтому повтор переиспользует его — дубля счёта не будет.
    expect(second).toBe(first);
  });

  it('account.transferToPersonal без order_id инъектит ключ идемпотентности', async () => {
    const { fn, calls } = mockFetch([
      {
        status: 200,
        body: {
          state: 0,
          result: {
            currency: 'USDT',
            amount: '5',
            direction: 'to_personal',
            personal_balance: '5',
          },
        },
      },
    ]);
    const client = makeClient(fn);

    await client.account.transferToPersonal({ amount: '5', currency: 'USDT' });

    const orderId = sentOrderId(calls[0]!.init);
    expect(typeof orderId).toBe('string');
    expect(orderId as string).toMatch(/^idem-/);
  });
});
