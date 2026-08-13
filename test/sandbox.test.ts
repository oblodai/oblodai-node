import crypto from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import { OblodaiClient } from "../src/client.js";
import { isTestKey } from "../src/resources/sandbox.js";

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
      headers: { "Content-Type": "application/json" },
    });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

function makeClient(fetchImpl: typeof fetch) {
  return new OblodaiClient({
    publicId: "test_pub_1",
    secret: "oblodai_test_sec_1",
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

describe("песочница (v1.2.0)", () => {
  it("simulateDeposit шлёт POST /v1/sandbox/deposit со всеми полями и разворачивает result", async () => {
    const { fn, calls } = mockFetch([
      {
        status: 200,
        body: {
          state: 0,
          result: { invoice_id: "inv-1", txid: "tx-1", amount: "10", confirmations: 2 },
        },
      },
    ]);
    const client = makeClient(fn);

    const dep = await client.sandbox.simulateDeposit({
      invoice_id: "inv-1",
      amount: "10",
      confirmations: 2,
      txid: "tx-1",
    });

    expect(calls[0]!.url).toBe("https://api.test/v1/sandbox/deposit");
    expect(calls[0]!.init.method).toBe("POST");
    expect(sentBody(calls[0]!.init)).toEqual({
      invoice_id: "inv-1",
      amount: "10",
      confirmations: 2,
      txid: "tx-1",
    });
    // result развернут из конверта
    expect(dep.txid).toBe("tx-1");
    expect(dep.confirmations).toBe(2);
  });

  it("simulateDeposit без опциональных полей шлёт только invoice_id (бэкенд-дефолты)", async () => {
    const { fn, calls } = mockFetch([
      {
        status: 200,
        body: {
          state: 0,
          result: { invoice_id: "inv-1", txid: "gen", amount: "10", confirmations: 0 },
        },
      },
    ]);
    const client = makeClient(fn);

    await client.sandbox.simulateDeposit({ invoice_id: "inv-1" });

    expect(sentBody(calls[0]!.init)).toEqual({ invoice_id: "inv-1" });
    // запрос подписан как обычный POST
    const h = headers(calls[0]!.init);
    expect(h["X-Public-Id"]).toBe("test_pub_1");
    expect(h["X-Signature"]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("faucet шлёт {asset, amount, idempotency_key} на /v1/sandbox/faucet", async () => {
    const { fn, calls } = mockFetch([
      {
        status: 200,
        body: { state: 0, result: { asset: "USDT", amount: "500", journal_id: "j-1" } },
      },
    ]);
    const client = makeClient(fn);

    const res = await client.sandbox.faucet({
      asset: "USDT",
      amount: "500",
      idempotency_key: "k-1",
    });

    expect(calls[0]!.url).toBe("https://api.test/v1/sandbox/faucet");
    expect(calls[0]!.init.method).toBe("POST");
    expect(sentBody(calls[0]!.init)).toEqual({
      asset: "USDT",
      amount: "500",
      idempotency_key: "k-1",
    });
    expect(res.journal_id).toBe("j-1");
  });

  it("reset шлёт пустое тело {} и возвращает счётчики", async () => {
    const { fn, calls } = mockFetch([
      { status: 200, body: { state: 0, result: { invoices_cancelled: 3, balances_zeroed: 2 } } },
    ]);
    const client = makeClient(fn);

    const res = await client.sandbox.reset();

    expect(calls[0]!.url).toBe("https://api.test/v1/sandbox/reset");
    expect(calls[0]!.init.method).toBe("POST");
    expect(sentBody(calls[0]!.init)).toEqual({});
    expect(res.invoices_cancelled).toBe(3);
    expect(res.balances_zeroed).toBe(2);
  });

  it("listWebhooks идёт подписанным GET без тела и разворачивает {deliveries}", async () => {
    const { fn, calls } = mockFetch([
      {
        status: 200,
        body: {
          state: 0,
          result: {
            deliveries: [
              {
                id: "d-1",
                event_type: "payment",
                url: "https://shop.example/cb",
                status: "delivered",
                attempts: 1,
                last_error: "",
                payload: { uuid: "p1", status: "paid" },
                created_at: "t",
                updated_at: "t",
              },
            ],
          },
        },
      },
    ]);
    const client = makeClient(fn);

    const deliveries = await client.sandbox.listWebhooks();

    expect(calls[0]!.url).toBe("https://api.test/v1/sandbox/webhooks");
    expect(calls[0]!.init.method).toBe("GET");
    expect(calls[0]!.init.body).toBeUndefined(); // GET — тела нет

    // Подпись есть и посчитана над ПУСТЫМ телом: {ts}\nGET\n{path}\n<пусто>
    const h = headers(calls[0]!.init);
    expect(h["X-Public-Id"]).toBe("test_pub_1");
    const expected = crypto
      .createHmac("sha256", "oblodai_test_sec_1")
      .update(`${h["X-Timestamp"]}\nGET\n/v1/sandbox/webhooks\n`)
      .digest("hex");
    expect(h["X-Signature"]).toBe(expected);

    expect(deliveries.length).toBe(1);
    expect(deliveries[0]!.payload).toEqual({ uuid: "p1", status: "paid" });
    expect(deliveries[0]!.status).toBe("delivered");
  });

  it("replayWebhook шлёт {delivery_id} на /v1/sandbox/webhooks/replay", async () => {
    const { fn, calls } = mockFetch([
      { status: 200, body: { state: 0, result: { delivery_id: "d-1", requeued: true } } },
    ]);
    const client = makeClient(fn);

    const res = await client.sandbox.replayWebhook("d-1");

    expect(calls[0]!.url).toBe("https://api.test/v1/sandbox/webhooks/replay");
    expect(calls[0]!.init.method).toBe("POST");
    expect(sentBody(calls[0]!.init)).toEqual({ delivery_id: "d-1" });
    expect(res.requeued).toBe(true);
  });

  it("боевой ключ получает 403 sandbox.live_key как OblodaiApiError", async () => {
    const { fn } = mockFetch([
      { status: 403, body: { error: { code: "sandbox.live_key", message: "live key" } } },
    ]);
    const client = makeClient(fn);

    await expect(client.sandbox.reset()).rejects.toMatchObject({
      code: "sandbox.live_key",
      status: 403,
    });
  });

  it("isTestKey различает тестовый и боевой public_id", () => {
    expect(isTestKey("test_abc123")).toBe(true);
    expect(isTestKey("oblodai_abc123")).toBe(false);
    expect(isTestKey("")).toBe(false);
  });
});
