import { describe, expect, it } from "vitest";
import { Oblodai } from "../../src/index.js";
import {
  AuthenticationError,
  IdempotencyConflictError,
  RateLimitError,
  TransportError,
  ValidationError,
} from "../../src/core/errors.js";
import { apiError, mockFetch, ok } from "../support/mock-fetch.js";
import {
  HEADER_IDEMPOTENCY_KEY,
  HEADER_PUBLIC_ID,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
} from "../../src/generated/signing.js";

const creds = {
  publicId: "pk_test_1",
  secret: "secret-1",
  baseUrl: "https://api.test",
  retry: { baseDelayMs: 1, maxDelayMs: 2 },
};

describe("transport", () => {
  it("signs path+query on GET and sends no body", async () => {
    const { fetch, calls } = mockFetch([
      ok({ items: [], paginate: { total: 0, per_page: 10, offset: 0, has_pages: false } }),
    ]);
    const ob = new Oblodai({ ...creds, fetch });
    await ob.sandbox.listWebhooks({ limit: 10, offset: 0 });
    expect(calls[0]!.url).toBe("https://api.test/v1/sandbox/webhooks?limit=10&offset=0");
    expect(calls[0]!.body).toBeUndefined();
    expect(calls[0]!.headers[HEADER_PUBLIC_ID.toLowerCase()]).toBe("pk_test_1");
    expect(calls[0]!.headers[HEADER_SIGNATURE.toLowerCase()]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates one Idempotency-Key per create call and reuses it across retries", async () => {
    const { fetch, calls } = mockFetch([
      apiError(503, { code: "db.unavailable", message: "down", retryable: true }),
      ok({ uuid: "u" }),
    ]);
    const ob = new Oblodai({ ...creds, fetch });
    await ob.payments.create({ amount: "1", currency: "USDT" });
    expect(calls).toHaveLength(2);
    const key = calls[0]!.headers[HEADER_IDEMPOTENCY_KEY.toLowerCase()];
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls[1]!.headers[HEADER_IDEMPOTENCY_KEY.toLowerCase()]).toBe(key);
    // Re-signed per attempt: same key, timestamp may differ but signature is present.
    expect(calls[1]!.headers[HEADER_SIGNATURE.toLowerCase()]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("honours a caller-supplied idempotency key and does not add one to read routes", async () => {
    const { fetch, calls } = mockFetch([ok({ uuid: "u" }), ok({ uuid: "u" })]);
    const ob = new Oblodai({ ...creds, fetch });
    await ob.payouts.create(
      { amount: "1", currency: "USDT", address: "T", order_id: "o" },
      { idempotencyKey: "my-key-1" },
    );
    await ob.payments.getInfo({ uuid: "u" });
    expect(calls[0]!.headers[HEADER_IDEMPOTENCY_KEY.toLowerCase()]).toBe("my-key-1");
    expect(calls[1]!.headers[HEADER_IDEMPOTENCY_KEY.toLowerCase()]).toBeUndefined();
  });

  it("does not retry a non-retryable error even on a 5xx", async () => {
    const { fetch, calls } = mockFetch([apiError(500, { code: "internal", retryable: false })]);
    const ob = new Oblodai({ ...creds, fetch });
    await expect(ob.account.getBalance()).rejects.toMatchObject({
      code: "internal",
      httpStatus: 500,
      retryable: false,
    });
    expect(calls).toHaveLength(1);
  });

  it("retries a retryable error and honours Retry-After, then surfaces it after the budget", async () => {
    const { fetch, calls } = mockFetch([
      apiError(
        429,
        { code: "request.rate_limited", retryable: true, retry_after: 0 },
        { "retry-after": "0" },
      ),
      apiError(429, { code: "request.rate_limited", retryable: true, retry_after: 0 }),
      apiError(429, { code: "request.rate_limited", retryable: true, retry_after: 0 }),
    ]);
    const ob = new Oblodai({ ...creds, fetch });
    const err = await ob.account.getBalance().catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.retryAfter).toBe(0);
    expect(calls).toHaveLength(3); // 1 + maxRetries(2)
  });

  it("retries a transport failure only when the request is safe to repeat", async () => {
    const boom = new TypeError("fetch failed");
    let f = mockFetch([{ throws: boom }, ok({ balance: { merchant: [] } })]);
    await new Oblodai({ ...creds, fetch: f.fetch }).account.getBalance(); // read route → retried
    expect(f.calls).toHaveLength(2);

    f = mockFetch([{ throws: boom }, ok({})]);
    const err = await new Oblodai({ ...creds, fetch: f.fetch }).settings
      .setAccuracy({ enabled: true })
      .catch((e) => e);
    expect(err).toBeInstanceOf(TransportError); // write without a key → not retried
    expect(err.code).toBe("transport.network");
    expect(f.calls).toHaveLength(1);

    f = mockFetch([{ throws: boom }, ok({ uuid: "u" })]);
    await new Oblodai({ ...creds, fetch: f.fetch }).payments.create({
      amount: "1",
      currency: "USDT",
    }); // keyed → retried
    expect(f.calls).toHaveLength(2);
  });

  it("classifies the error envelope into the right subclass and keeps request_id/field", async () => {
    const { fetch } = mockFetch([
      apiError(400, {
        code: "payment.below_minimum",
        message: "too small",
        field: "amount",
        retryable: false,
        request_id: "rq-1",
      }),
      apiError(401, { code: "merchant.bad_signature", message: "bad", retryable: false }),
      apiError(409, { code: "idempotency.key_reused", message: "reused", retryable: false }),
    ]);
    const ob = new Oblodai({ ...creds, fetch, retry: { maxRetries: 0 } });
    const e1 = await ob.payments.create({ amount: "0", currency: "USDT" }).catch((e) => e);
    expect(e1).toBeInstanceOf(ValidationError);
    expect(e1).toMatchObject({
      code: "payment.below_minimum",
      field: "amount",
      requestId: "rq-1",
      family: "payment",
    });
    const e2 = await ob.account.getBalance().catch((e) => e);
    expect(e2).toBeInstanceOf(AuthenticationError);
    const e3 = await ob.payments.create({ amount: "1", currency: "USDT" }).catch((e) => e);
    expect(e3).toBeInstanceOf(IdempotencyConflictError);
  });

  it("re-signs once with the server clock when a 401 reveals skew", async () => {
    const serverNow = Math.floor(Date.now() / 1000) + 3600;
    const { fetch, calls } = mockFetch([
      apiError(
        401,
        { code: "merchant.bad_signature", retryable: false },
        { date: new Date(serverNow * 1000).toUTCString() },
      ),
      ok({ balance: { merchant: [] } }),
    ]);
    const ob = new Oblodai({ ...creds, fetch, retry: { maxRetries: 0 } });
    await ob.account.getBalance();
    expect(calls).toHaveLength(2);
    const ts = Number(calls[1]!.headers[HEADER_TIMESTAMP.toLowerCase()]);
    expect(Math.abs(ts - serverNow)).toBeLessThan(5);
  });

  it("times out and reports transport.timeout", async () => {
    const { fetch } = mockFetch([{ delayMs: 200, body: ok({}).body }]);
    const ob = new Oblodai({ ...creds, fetch, timeout: 0.02, retry: { maxRetries: 0 } });
    const err = await ob.account.getBalance().catch((e) => e);
    expect(err).toBeInstanceOf(TransportError);
    expect(err.code).toBe("transport.timeout");
  });

  it("signs money-in and money-out routes with the same single API key", async () => {
    const { fetch, calls } = mockFetch([ok({ uuid: "p" }), ok({ uuid: "i" })]);
    const ob = new Oblodai({ ...creds, fetch });
    await ob.payouts.create({ amount: "1", currency: "USDT", address: "T", order_id: "o" });
    await ob.payments.create({ amount: "1", currency: "USDT" });
    expect(calls[0]!.headers[HEADER_PUBLIC_ID.toLowerCase()]).toBe("pk_test_1");
    expect(calls[1]!.headers[HEADER_PUBLIC_ID.toLowerCase()]).toBe("pk_test_1");
    expect(calls[0]!.headers[HEADER_SIGNATURE.toLowerCase()]).toBeDefined();
  });

  it("refuses a public route call with no credentials only when the route needs them", async () => {
    const { fetch } = mockFetch([ok({ currencies: [], pricing_currencies: [] })]);
    const ob = new Oblodai({ baseUrl: "https://api.test", fetch });
    await expect(ob.checkout.listCurrencies()).resolves.toBeTruthy();
    await expect(ob.account.getBalance()).rejects.toMatchObject({
      code: "sdk.missing_credentials",
    });
  });
});
