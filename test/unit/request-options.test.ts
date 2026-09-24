import { describe, expect, it } from "vitest";
import { ConfigError } from "../../src/core/errors.js";
import { Oblodai } from "../../src/index.js";
import { apiError, mockFetch, ok } from "../support/mock-fetch.js";

const creds = {
  publicId: "pk_test_1",
  secret: "secret-1",
  baseUrl: "https://api.test",
  retry: { baseDelayMs: 1, maxDelayMs: 2 },
};
const balance = () => ok({ balance: { merchant: [] } });
const unavailable = () =>
  apiError(503, { code: "db.unavailable", retryable: true, retry_after: 0 });

describe("per-call options (spec §3.2)", () => {
  it("timeout is seconds per attempt", async () => {
    const { fetch } = mockFetch([{ delayMs: 200, body: ok({}).body }]);
    const ob = new Oblodai({ ...creds, fetch, retry: { maxRetries: 0 } });
    const err = await ob.account.getBalance({ timeout: 0.02 }).catch((e) => e);
    expect(err.code).toBe("transport.timeout");
    expect(err.message).toMatch(/0\.02 s/);
  });

  it("maxRetries overrides the client's retry budget for one call", async () => {
    let f = mockFetch([unavailable(), unavailable(), unavailable()]);
    await new Oblodai({ ...creds, fetch: f.fetch }).account
      .getBalance({ maxRetries: 0 })
      .catch(() => undefined);
    expect(f.calls).toHaveLength(1);

    f = mockFetch([unavailable(), unavailable(), balance()]);
    await new Oblodai({ ...creds, fetch: f.fetch, retry: { maxRetries: 0 } }).account.getBalance({
      maxRetries: 2,
    });
    expect(f.calls).toHaveLength(3);
  });

  it("extraHeaders merge over the client's headers; the SDK's own names stay the SDK's", async () => {
    const { fetch, calls } = mockFetch([balance()]);
    const ob = new Oblodai({ ...creds, fetch, headers: { "X-Team": "a", "X-Keep": "k" } });
    await ob.account.getBalance({ extraHeaders: { "X-Team": "b", "X-Signature": "forged" } });
    expect(calls[0]!.headers["x-team"]).toBe("b");
    expect(calls[0]!.headers["x-keep"]).toBe("k");
    expect(calls[0]!.headers["x-signature"]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("idempotencyKey is sent as the header on a route the core deduplicates", async () => {
    const { fetch, calls } = mockFetch([ok({ uuid: "u" })]);
    await new Oblodai({ ...creds, fetch }).payments.create(
      { amount: "1", currency: "USDT" },
      { idempotencyKey: "order-1" },
    );
    expect(calls[0]!.headers["idempotency-key"]).toBe("order-1");
  });

  it("idempotencyKey fills the route's own idempotency_key field where it has one (Ruling 10)", async () => {
    const { fetch, calls } = mockFetch([ok({})]);
    await new Oblodai({ ...creds, fetch }).sandbox.faucet(
      { asset: "USDT", amount: "5" },
      { idempotencyKey: "tap-1" },
    );
    expect(JSON.parse(calls[0]!.body!).idempotency_key).toBe("tap-1");
    expect(calls[0]!.headers["idempotency-key"]).toBeUndefined();
  });

  it("the faucet key given twice — in the body and as the option — is refused before the network", async () => {
    const { fetch, calls } = mockFetch([ok({}), ok({})]);
    const ob = new Oblodai({ ...creds, fetch });
    // A JavaScript caller (no type check) can still put the field in the body itself.
    const own = { asset: "USDT", amount: "5", idempotency_key: "own" } as {
      asset: string;
      amount: string;
    };
    const err = await ob.sandbox.faucet(own, { idempotencyKey: "tap-2" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConfigError);
    expect((err as ConfigError).code).toBe("sdk.bad_config");
    expect((err as ConfigError).message).toContain("idempotency_key");
    expect(calls).toHaveLength(0);
    // The field alone is sent as given.
    await ob.sandbox.faucet(own);
    expect(JSON.parse(calls[0]!.body!).idempotency_key).toBe("own");
  });
});

describe("X-Request-ID (spec §3.9)", () => {
  it("one generated id names every attempt of a call; the next call gets a new one", async () => {
    const { fetch, calls } = mockFetch([unavailable(), balance(), balance()]);
    const ob = new Oblodai({ ...creds, fetch });
    await ob.account.getBalance();
    await ob.account.getBalance();
    const ids = calls.map((c) => c.headers["x-request-id"]);
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids[1]).toBe(ids[0]);
    expect(ids[2]).not.toBe(ids[0]);
  });

  it("requestId sets it; a caller X-Request-ID header is the fallback", async () => {
    const { fetch, calls } = mockFetch([balance(), balance()]);
    const ob = new Oblodai({ ...creds, fetch, headers: { "x-request-id": "from-header" } });
    await ob.account.getBalance({ requestId: "rid-1" });
    await ob.account.getBalance();
    expect(calls[0]!.headers["x-request-id"]).toBe("rid-1");
    expect(Object.keys(calls[0]!.headers).filter((h) => h === "x-request-id")).toHaveLength(1);
    expect(calls[1]!.headers["x-request-id"]).toBe("from-header");
  });

  it("refuses a request id that would split the header", async () => {
    const { fetch, calls } = mockFetch([balance()]);
    const err = await new Oblodai({ ...creds, fetch }).account
      .getBalance({ requestId: "a\r\nX-Evil: 1" })
      .catch((e) => e);
    expect(err.code).toBe("sdk.bad_header");
    expect(calls).toHaveLength(0);
  });
});
