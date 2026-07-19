import { describe, it, expect, vi } from 'vitest';
import { OblodaiClient } from '../src/client.js';

/** Мок-транспорт как в http.test.ts. */
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

function makeClient(fetchImpl: typeof fetch) {
  return new OblodaiClient({
    publicId: 'pub_1',
    secret: 'sec_1',
    baseUrl: 'https://api.test',
    fetch: fetchImpl,
    retry: false,
  });
}

function sentBody(init: RequestInit): Record<string, unknown> {
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

function headers(init: RequestInit): Record<string, string> {
  return init.headers as Record<string, string>;
}

describe('батчи (v1.1.0)', () => {
  it('payments.createBatch шлёт {payments, on_error} на /v1/payment/batch', async () => {
    const { fn, calls } = mockFetch([
      { status: 200, body: { state: 0, result: { batch_id: 'b1', kind: 'payment', count: 2, status: 'pending' } } },
    ]);
    const client = makeClient(fn);

    const sub = await client.payments.createBatch(
      [
        { amount: '10', currency: 'USD', order_id: 'a-1' },
        { amount: '20', currency: 'EUR', order_id: 'a-2' },
      ],
      { onError: 'stop' },
    );

    expect(sub.batch_id).toBe('b1');
    expect(sub.status).toBe('pending');
    expect(calls[0]!.url).toBe('https://api.test/v1/payment/batch');
    const body = sentBody(calls[0]!.init);
    expect(body.on_error).toBe('stop');
    expect((body.payments as unknown[]).length).toBe(2);
  });

  it('без onError поле on_error не отправляется (бэкенд-дефолт continue)', async () => {
    const { fn, calls } = mockFetch([
      { status: 200, body: { state: 0, result: { batch_id: 'b1', kind: 'payment', count: 1, status: 'pending' } } },
    ]);
    const client = makeClient(fn);

    await client.payments.createBatch([{ amount: '10', currency: 'USD', order_id: 'a-1' }]);

    expect('on_error' in sentBody(calls[0]!.init)).toBe(false);
  });

  it('payments.refundBatch и payouts.createBatch бьют в свои эндпоинты', async () => {
    const { fn, calls } = mockFetch([
      { status: 200, body: { state: 0, result: { batch_id: 'b2', kind: 'refund', count: 1, status: 'pending' } } },
    ]);
    const client = makeClient(fn);

    await client.payments.refundBatch([{ reference: 'r-1', order_id: 'o-1' }]);
    await client.payouts.createBatch([
      { amount: '1', currency: 'USDT', address: 'T..', order_id: 'w-1' },
    ]);

    expect(calls[0]!.url).toBe('https://api.test/v1/refund/batch');
    expect((sentBody(calls[0]!.init).refunds as unknown[]).length).toBe(1);
    expect(calls[1]!.url).toBe('https://api.test/v1/payout/batch');
    expect((sentBody(calls[1]!.init).payouts as unknown[]).length).toBe(1);
  });

  it('batches.info шлёт {batch_id, limit, offset} и возвращает items', async () => {
    const { fn, calls } = mockFetch([
      {
        status: 200,
        body: {
          state: 0,
          result: {
            batch_id: 'b1',
            kind: 'payment',
            status: 'completed',
            on_error: 'continue',
            total: 2,
            succeeded: 1,
            failed: 1,
            created_at: 't',
            updated_at: 't',
            items: [
              { idx: 0, status: 'ok', order_id: 'a-1', result: { uuid: 'p1' } },
              { idx: 1, status: 'failed', order_id: 'a-2', error: 'payment.unknown_currency' },
            ],
          },
        },
      },
    ]);
    const client = makeClient(fn);

    const info = await client.batches.info('b1', { limit: 100, offset: 0 });

    expect(calls[0]!.url).toBe('https://api.test/v1/batch/info');
    expect(sentBody(calls[0]!.init)).toEqual({ batch_id: 'b1', limit: 100, offset: 0 });
    expect(info.items.length).toBe(2);
    expect(info.items[1]!.error).toBe('payment.unknown_currency');
  });
});

describe('платёжные ссылки (v1.1.0)', () => {
  it('create/list/info/toggle — подписанные management-вызовы', async () => {
    const { fn, calls } = mockFetch([
      { status: 200, body: { state: 0, result: { link_id: 'l1', url: 'https://pay.test/link/l1' } } },
      { status: 200, body: { state: 0, result: { items: [{ link_id: 'l1', amount_mode: 'open', currency: 'USD', active: true, url: 'u', created_at: 't' }] } } },
      { status: 200, body: { state: 0, result: { link_id: 'l1', amount_mode: 'open', currency: 'USD', active: true, url: 'u', created_at: 't', payments: [] } } },
      { status: 200, body: { state: 0, result: { link_id: 'l1', active: false } } },
    ]);
    const client = makeClient(fn);

    const created = await client.links.create({ amount_mode: 'open', currency: 'USD' });
    expect(created.url).toContain('/link/l1');
    expect(calls[0]!.url).toBe('https://api.test/v1/payment/link');
    expect(headers(calls[0]!.init)['X-Signature']).toBeDefined();

    const list = await client.links.list({ limit: 10 });
    expect(list[0]!.link_id).toBe('l1');
    expect(calls[1]!.url).toBe('https://api.test/v1/payment/link/list');

    const info = await client.links.info('l1');
    expect(info.payments).toEqual([]);
    expect(sentBody(calls[2]!.init)).toEqual({ link_id: 'l1' });

    const toggled = await client.links.toggle('l1', false);
    expect(toggled.active).toBe(false);
    expect(sentBody(calls[3]!.init)).toEqual({ link_id: 'l1', active: false });
  });

  it('publicGet — публичный GET /v1/link/{id} без подписи', async () => {
    const { fn, calls } = mockFetch([
      { status: 200, body: { state: 0, result: { link_id: 'l1', amount_mode: 'fixed', currency: 'USD', active: true, url: 'u', created_at: 't' } } },
    ]);
    const client = makeClient(fn);

    await client.links.publicGet('l1');

    expect(calls[0]!.url).toBe('https://api.test/v1/link/l1');
    expect(calls[0]!.init.method).toBe('GET');
    expect(headers(calls[0]!.init)['X-Signature']).toBeUndefined();
  });

  it('checkout — публичный POST /v1/link/{id}/checkout без подписи, отдаёт платёж', async () => {
    const { fn, calls } = mockFetch([
      { status: 200, body: { state: 0, result: { uuid: 'p9', url: 'https://pay.test/p9' } } },
    ]);
    const client = makeClient(fn);

    const payment = await client.links.checkout('l1', { amount: '5', payer_email: 'a@b.c' });

    expect(payment.uuid).toBe('p9');
    expect(calls[0]!.url).toBe('https://api.test/v1/link/l1/checkout');
    expect(headers(calls[0]!.init)['X-Signature']).toBeUndefined();
    expect(sentBody(calls[0]!.init)).toEqual({ amount: '5', payer_email: 'a@b.c' });
  });

  it('client.paymentLinks — синоним client.links', () => {
    const { fn } = mockFetch([{ status: 200, body: { state: 0, result: {} } }]);
    const client = makeClient(fn);
    expect(client.paymentLinks).toBe(client.links);
  });
});

describe('сплиты (v1.1.0)', () => {
  it('splitToAddress → POST /v1/split/rule с address+network+percent', async () => {
    const { fn, calls } = mockFetch([
      { status: 200, body: { state: 0, result: { rule_id: 'r1', percent: 10 } } },
    ]);
    const client = makeClient(fn);

    const rule = await client.splits.splitToAddress('T...', 'tron', 10, 'партнёр А');

    expect(rule.rule_id).toBe('r1');
    expect(calls[0]!.url).toBe('https://api.test/v1/split/rule');
    expect(sentBody(calls[0]!.init)).toEqual({
      address: 'T...',
      network: 'tron',
      percent: 10,
      note: 'партнёр А',
    });
  });

  it('splitToMerchant → merchant_id; deleteRule/getConfig/setConfig бьют в свои пути', async () => {
    const { fn, calls } = mockFetch([
      { status: 200, body: { state: 0, result: { rule_id: 'r2', percent: 5 } } },
      { status: 200, body: { state: 0, result: { deleted: true } } },
      { status: 200, body: { state: 0, result: { refund_hold_hours: 24 } } },
      { status: 200, body: { state: 0, result: { refund_hold_hours: 48 } } },
    ]);
    const client = makeClient(fn);

    await client.splits.splitToMerchant('m-2', 5);
    expect(sentBody(calls[0]!.init)).toEqual({ merchant_id: 'm-2', percent: 5 });

    const del = await client.splits.deleteRule('r2');
    expect(del.deleted).toBe(true);
    expect(calls[1]!.url).toBe('https://api.test/v1/split/rule/delete');
    expect(sentBody(calls[1]!.init)).toEqual({ rule_id: 'r2' });

    const cfg = await client.splits.getConfig();
    expect(cfg.refund_hold_hours).toBe(24);
    expect(calls[2]!.url).toBe('https://api.test/v1/split/config/get');

    const set = await client.splits.setConfig(48);
    expect(set.refund_hold_hours).toBe(48);
    expect(sentBody(calls[3]!.init)).toEqual({ refund_hold_hours: 48 });
  });

  it('listRules разворачивает items', async () => {
    const { fn } = mockFetch([
      {
        status: 200,
        body: {
          state: 0,
          result: { items: [{ rule_id: 'r1', percent: 10, active: true, merchant_id: 'm-2', reversible: true }] },
        },
      },
    ]);
    const client = makeClient(fn);

    const rules = await client.splits.listRules();
    expect(rules[0]!.reversible).toBe(true);
  });
});

describe('send-email и resolve (v1.1.0)', () => {
  it('sendEmail шлёт {uuid, email} на /v1/payment/send-email', async () => {
    const { fn, calls } = mockFetch([
      { status: 200, body: { state: 0, result: { sent: true, email: 'a@b.c', uuid: 'p1' } } },
    ]);
    const client = makeClient(fn);

    const res = await client.payments.sendEmail({ uuid: 'p1', email: 'a@b.c' });

    expect(res.sent).toBe(true);
    expect(calls[0]!.url).toBe('https://api.test/v1/payment/send-email');
    expect(sentBody(calls[0]!.init)).toEqual({ uuid: 'p1', email: 'a@b.c' });
  });

  it('resolve accept: тело без idempotency_key, action уходит как есть', async () => {
    const { fn, calls } = mockFetch([
      {
        status: 200,
        body: {
          state: 0,
          result: { payment_uuid: 'p1', order_id: 'o1', resolution: 'accepted', amount_kept: '48.5', currency: 'USDT' },
        },
      },
    ]);
    const client = makeClient(fn);

    const res = await client.payments.resolve({ order_id: 'o1', action: 'accept', idempotency_key: 'k1' });

    expect(res.resolution).toBe('accepted');
    expect(calls[0]!.url).toBe('https://api.test/v1/payment/resolve');
    expect(sentBody(calls[0]!.init)).toEqual({ order_id: 'o1', action: 'accept' });
    expect(headers(calls[0]!.init)['Idempotency-Key']).toBe('k1');
  });

  it('resolve refund: возвращает данные рефанд-выплаты', async () => {
    const { fn, calls } = mockFetch([
      {
        status: 200,
        body: {
          state: 0,
          result: {
            payment_uuid: 'p1',
            order_id: 'o1',
            resolution: 'refunded',
            uuid: 'rf1',
            amount: '48.5',
            currency: 'USDT',
            address: '0xPayer',
            status: 'check',
            is_final: false,
          },
        },
      },
    ]);
    const client = makeClient(fn);

    const res = await client.payments.resolve({ uuid: 'p1', action: 'refund', reference: 'ref-1' });

    expect(res.resolution).toBe('refunded');
    expect(res.uuid).toBe('rf1');
    expect(sentBody(calls[0]!.init)).toEqual({ uuid: 'p1', action: 'refund', reference: 'ref-1' });
  });
});

describe('payout-ссылки — крипто-чеки (v1.1.0)', () => {
  const createdLink = {
    link_id: 'pl1',
    status: 'funded',
    amount: '0.005',
    currency: 'BTC',
    network: 'bitcoin',
    expires_at: 'e',
    created_at: 't',
    claim_token: 'tok_abc',
    claim_url: 'https://pay.test/claim/tok_abc',
  };

  it('create — подписанный POST /v1/payout/link, в ответе claim_token/claim_url', async () => {
    const { fn, calls } = mockFetch([{ status: 200, body: { state: 0, result: createdLink } }]);
    const client = makeClient(fn);

    const link = await client.payoutLinks.create({
      currency: 'BTC',
      network: 'bitcoin',
      amount: '0.005',
      expires_in_hours: 720,
    });

    expect(link.claim_token).toBe('tok_abc');
    expect(link.status).toBe('funded');
    expect(calls[0]!.url).toBe('https://api.test/v1/payout/link');
    expect(headers(calls[0]!.init)['X-Signature']).toBeDefined();
    // Маршрут обёрнут idempotency-middleware на бэкенде: ключ шлём, шлюз по нему дедуплицирует
    // (второй, durable слой — per-link `reference`).
    expect(headers(calls[0]!.init)['Idempotency-Key']).toBeDefined();
    expect(sentBody(calls[0]!.init).expires_in_hours).toBe(720);
  });

  it('createBatch шлёт {links} и возвращает index-aligned результаты', async () => {
    const { fn, calls } = mockFetch([
      {
        status: 200,
        body: {
          state: 0,
          result: {
            created: 1,
            total: 2,
            results: [
              { ok: true, link: createdLink },
              { ok: false, error: 'payoutlink.insufficient_funds', message: 'no funds' },
            ],
          },
        },
      },
    ]);
    const client = makeClient(fn);

    const res = await client.payoutLinks.createBatch([
      { currency: 'BTC', network: 'bitcoin', amount: '0.005' },
      { currency: 'BTC', network: 'bitcoin', amount: '99' },
    ]);

    expect(calls[0]!.url).toBe('https://api.test/v1/payout/link/batch');
    expect((sentBody(calls[0]!.init).links as unknown[]).length).toBe(2);
    expect(res.created).toBe(1);
    expect(res.results[0]!.ok).toBe(true);
    expect(res.results[1]!.error).toBe('payoutlink.insufficient_funds');
  });

  it('list/info/cancel — management-вызовы', async () => {
    const view = { ...createdLink, claim_token: undefined, claim_url: undefined };
    const { fn, calls } = mockFetch([
      { status: 200, body: { state: 0, result: { links: [view] } } },
      { status: 200, body: { state: 0, result: view } },
      { status: 200, body: { state: 0, result: { ...view, status: 'cancelled' } } },
    ]);
    const client = makeClient(fn);

    const links = await client.payoutLinks.list({ limit: 10 });
    expect(links[0]!.link_id).toBe('pl1');
    expect(calls[0]!.url).toBe('https://api.test/v1/payout/link/list');

    await client.payoutLinks.info('pl1');
    expect(calls[1]!.url).toBe('https://api.test/v1/payout/link/info');
    expect(sentBody(calls[1]!.init)).toEqual({ link_id: 'pl1' });

    const cancelled = await client.payoutLinks.cancel('pl1');
    expect(cancelled.status).toBe('cancelled');
    expect(calls[2]!.url).toBe('https://api.test/v1/payout/link/cancel');
  });

  it('claimInfo — ПУБЛИЧНЫЙ GET /v1/claim/{token} без подписи', async () => {
    const { fn, calls } = mockFetch([
      {
        status: 200,
        body: {
          state: 0,
          result: { status: 'funded', amount: '0.005', currency: 'BTC', network: 'bitcoin', expires_at: 'e', claimable: true },
        },
      },
    ]);
    const client = makeClient(fn);

    const info = await client.payoutLinks.claimInfo('tok_abc');

    expect(info.claimable).toBe(true);
    expect(calls[0]!.url).toBe('https://api.test/v1/claim/tok_abc');
    expect(calls[0]!.init.method).toBe('GET');
    const h = headers(calls[0]!.init);
    expect(h['X-Signature']).toBeUndefined();
    expect(h['X-Public-Id']).toBeUndefined();
  });

  it('claim — ПУБЛИЧНЫЙ POST /v1/claim/{token} без подписи, с address/memo', async () => {
    const { fn, calls } = mockFetch([
      {
        status: 200,
        body: {
          state: 0,
          result: { status: 'claimed', payout_id: 'po1', amount: '0.005', currency: 'BTC', network: 'bitcoin', address: 'bc1q...' },
        },
      },
    ]);
    const client = makeClient(fn);

    const res = await client.payoutLinks.claim('tok_abc', { address: 'bc1q...', memo: 'tag' });

    expect(res.status).toBe('claimed');
    expect(res.payout_id).toBe('po1');
    expect(calls[0]!.url).toBe('https://api.test/v1/claim/tok_abc');
    expect(calls[0]!.init.method).toBe('POST');
    expect(headers(calls[0]!.init)['X-Signature']).toBeUndefined();
    expect(sentBody(calls[0]!.init)).toEqual({ address: 'bc1q...', memo: 'tag' });
  });

  it('токен в пути URL-кодируется', async () => {
    const { fn, calls } = mockFetch([
      { status: 200, body: { state: 0, result: { status: 'funded', amount: '1', currency: 'X', network: 'n', expires_at: 'e', claimable: true } } },
    ]);
    const client = makeClient(fn);

    await client.payoutLinks.claimInfo('a/b c');

    expect(calls[0]!.url).toBe('https://api.test/v1/claim/a%2Fb%20c');
  });
});
