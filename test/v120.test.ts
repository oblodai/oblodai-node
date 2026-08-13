import { describe, it, expect, vi } from "vitest";
import { OblodaiClient } from "../src/client.js";

/** Мок-транспорт как в http.test.ts / v110.test.ts. */
function mockFetch(responses: Array<{ status: number; body: unknown }>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let i = 0;
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

function makeClient(fetchImpl: typeof fetch) {
  return new OblodaiClient({
    publicId: "pub_1",
    secret: "sec_1",
    baseUrl: "https://api.test",
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

const USER_ID = "5c3f1c7e-9a44-4a5f-8d1a-2f6b7c8d9e0f";

describe("переводы пользователям платформы (v1.2.0)", () => {
  it("transferToUser — подписанный POST /v1/transfer/to-user, idempotency_key уходит заголовком, не в тело", async () => {
    const { fn, calls } = mockFetch([
      {
        status: 200,
        body: {
          state: 0,
          result: { currency: "USDT", amount: "25", to_user_id: USER_ID, recipient_balance: "125" },
        },
      },
    ]);
    const client = makeClient(fn);

    const res = await client.account.transferToUser({
      to_user_id: USER_ID,
      amount: "25",
      currency: "USDT",
      order_id: "tr-1",
      idempotency_key: "k-1",
    });

    expect(res.recipient_balance).toBe("125");
    expect(res.to_user_id).toBe(USER_ID);
    expect(calls[0]!.url).toBe("https://api.test/v1/transfer/to-user");
    expect(calls[0]!.init.method).toBe("POST");
    // Тело — без idempotency_key (он в заголовке); order_id уходит как есть.
    expect(sentBody(calls[0]!.init)).toEqual({
      to_user_id: USER_ID,
      amount: "25",
      currency: "USDT",
      order_id: "tr-1",
    });
    const h = headers(calls[0]!.init);
    expect(h["X-Signature"]).toBeDefined(); // payout-key surface — подписан
    expect(h["X-Public-Id"]).toBe("pub_1");
    expect(h["Idempotency-Key"]).toBe("k-1");
  });

  it("transferToUser без своего ключа — SDK генерирует Idempotency-Key сам", async () => {
    const { fn, calls } = mockFetch([
      {
        status: 200,
        body: {
          state: 0,
          result: { currency: "USDT", amount: "1", to_user_id: USER_ID, recipient_balance: "1" },
        },
      },
    ]);
    const client = makeClient(fn);

    await client.account.transferToUser({ to_user_id: USER_ID, amount: "1", currency: "USDT" });

    const h = headers(calls[0]!.init);
    expect(h["Idempotency-Key"]).toBeDefined();
    expect(h["Idempotency-Key"]!.length).toBeGreaterThan(0);
    expect("idempotency_key" in sentBody(calls[0]!.init)).toBe(false);
    expect("order_id" in sentBody(calls[0]!.init)).toBe(false); // не подставляется автоматически
  });

  it("transferBatch — подписанный POST /v1/transfer/batch с {transfers, on_error}, поллится через batches.info", async () => {
    const { fn, calls } = mockFetch([
      {
        status: 200,
        body: {
          state: 0,
          result: { batch_id: "tb1", kind: "transfer", count: 2, status: "pending" },
        },
      },
      {
        status: 200,
        body: {
          state: 0,
          result: {
            batch_id: "tb1",
            kind: "transfer",
            status: "completed",
            on_error: "continue",
            total: 2,
            succeeded: 2,
            failed: 0,
            created_at: "t",
            updated_at: "t",
            items: [],
          },
        },
      },
    ]);
    const client = makeClient(fn);

    const sub = await client.account.transferBatch(
      [
        { to_user_id: USER_ID, amount: "10", currency: "USDT", order_id: "p-1" },
        { to_user_id: USER_ID, amount: "20", currency: "USDT", order_id: "p-2" },
      ],
      { onError: "continue", idempotency_key: "kb-1" },
    );

    expect(sub.batch_id).toBe("tb1");
    expect(calls[0]!.url).toBe("https://api.test/v1/transfer/batch");
    const body = sentBody(calls[0]!.init);
    expect(body.on_error).toBe("continue");
    expect((body.transfers as unknown[]).length).toBe(2);
    const h = headers(calls[0]!.init);
    expect(h["X-Signature"]).toBeDefined();
    expect(h["Idempotency-Key"]).toBe("kb-1");

    // Прогресс — СУЩЕСТВУЮЩИМ методом batches.info.
    const info = await client.batches.info(sub.batch_id);
    expect(info.kind).toBe("transfer");
    expect(calls[1]!.url).toBe("https://api.test/v1/batch/info");
    expect(sentBody(calls[1]!.init)).toEqual({ batch_id: "tb1" });
  });

  it("transferBatch без onError не отправляет on_error (бэкенд-дефолт continue)", async () => {
    const { fn, calls } = mockFetch([
      {
        status: 200,
        body: {
          state: 0,
          result: { batch_id: "tb2", kind: "transfer", count: 1, status: "pending" },
        },
      },
    ]);
    const client = makeClient(fn);

    await client.account.transferBatch([{ to_user_id: USER_ID, amount: "1", currency: "USDT" }]);

    expect("on_error" in sentBody(calls[0]!.init)).toBe(false);
  });
});

describe("публичный чекаут /v1/pay (v1.2.0)", () => {
  it("publicGet — ПУБЛИЧНЫЙ GET /v1/pay/{id} без подписи; select-счёт отдаёт accepted", async () => {
    const { fn, calls } = mockFetch([
      {
        status: 200,
        body: {
          state: 0,
          result: {
            uuid: "p1",
            order_id: "o1",
            amount: "10",
            currency: "USD",
            payment_status: "select",
            address: "",
            url: "https://pay.test/pay/p1",
            accepted: [
              { currency: "USDT", network: "tron" },
              { currency: "ETH", network: "ethereum" },
            ],
          },
        },
      },
    ]);
    const client = makeClient(fn);

    const view = await client.payments.publicGet("p1");

    expect(view.payment_status).toBe("select");
    expect(view.accepted!.length).toBe(2);
    expect(calls[0]!.url).toBe("https://api.test/v1/pay/p1");
    expect(calls[0]!.init.method).toBe("GET");
    expect(calls[0]!.init.body).toBeUndefined();
    // Без подписи — секрет мерчанта не нужен на странице плательщика.
    const h = headers(calls[0]!.init);
    expect(h["X-Signature"]).toBeUndefined();
    expect(h["X-Public-Id"]).toBeUndefined();
    expect(h["X-Timestamp"]).toBeUndefined();
  });

  it("publicSelect — ПУБЛИЧНЫЙ POST /v1/pay/{id}/select с {currency, network}, отдаёт финализированный счёт", async () => {
    const { fn, calls } = mockFetch([
      {
        status: 200,
        body: {
          state: 0,
          result: {
            uuid: "p1",
            payment_status: "check",
            payer_currency: "USDT",
            network: "tron",
            address: "TDep0sit...",
            payer_amount: "10.05",
          },
        },
      },
    ]);
    const client = makeClient(fn);

    const inv = await client.payments.publicSelect("p1", { currency: "USDT", network: "tron" });

    expect(inv.payment_status).toBe("check");
    expect(inv.address).toBe("TDep0sit...");
    expect(calls[0]!.url).toBe("https://api.test/v1/pay/p1/select");
    expect(calls[0]!.init.method).toBe("POST");
    expect(sentBody(calls[0]!.init)).toEqual({ currency: "USDT", network: "tron" });
    const h = headers(calls[0]!.init);
    expect(h["X-Signature"]).toBeUndefined();
    expect(h["X-Public-Id"]).toBeUndefined();
    expect(h["Idempotency-Key"]).toBeUndefined();
  });

  it("id счёта в пути URL-кодируется", async () => {
    const { fn, calls } = mockFetch([
      { status: 200, body: { state: 0, result: { uuid: "x", payment_status: "check" } } },
    ]);
    const client = makeClient(fn);

    await client.payments.publicGet("a/b c");

    expect(calls[0]!.url).toBe("https://api.test/v1/pay/a%2Fb%20c");
  });
});

describe("единая форма списков: webhooks.deliveries (v1.2.0, ломающее)", () => {
  it("разворачивает конверт {deliveries} и отдаёт массив — как sandbox.listWebhooks / payoutLinks.list", async () => {
    const { fn, calls } = mockFetch([
      {
        status: 200,
        body: {
          state: 0,
          result: {
            deliveries: [
              {
                id: "d1",
                url: "https://shop.example/hook",
                event_type: "payment",
                status: "delivered",
                attempts: 1,
                last_error: "",
                created_at: "2026-07-19T10:00:00Z",
                updated_at: "2026-07-19T10:00:01Z",
              },
            ],
          },
        },
      },
    ]);
    const client = makeClient(fn);

    const deliveries = await client.webhooks.deliveries();

    expect(calls[0]!.url).toBe("https://api.test/v1/webhooks/deliveries");
    expect(calls[0]!.init.method).toBe("POST");
    expect(Array.isArray(deliveries)).toBe(true);
    expect(deliveries.length).toBe(1);
    expect(deliveries[0]!.id).toBe("d1");
    expect(deliveries[0]!.status).toBe("delivered");
  });

  it("пустой журнал — пустой массив, а не undefined", async () => {
    const { fn } = mockFetch([{ status: 200, body: { state: 0, result: {} } }]);
    const client = makeClient(fn);

    await expect(client.webhooks.deliveries()).resolves.toEqual([]);
  });
});
