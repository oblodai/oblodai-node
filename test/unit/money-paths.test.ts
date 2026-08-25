import { describe, expect, it } from "vitest";
import { Oblodai } from "../../src/index.js";
import { ConfigError, TransportError } from "../../src/core/errors.js";
import { apiError, mockFetch, ok } from "../support/mock-fetch.js";

const creds = {
  publicId: "pk",
  secret: "s",
  baseUrl: "https://api.test",
  retry: { baseDelayMs: 1, maxDelayMs: 2 },
};
const html = (status: number, headers: Record<string, string> = {}) => ({
  status,
  body: "<html>upstream error</html>",
  headers: { "content-type": "text/html", ...headers },
});

describe("paths that could double-spend", () => {
  it("rejects a caller idempotency key on a route the core does not deduplicate", async () => {
    const { fetch, calls } = mockFetch([ok({})]);
    const ob = new Oblodai({ ...creds, fetch });
    await expect(ob.payouts.approve("p1", { idempotencyKey: "k1" })).rejects.toBeInstanceOf(
      ConfigError,
    );
    await expect(ob.payouts.approve("p1", { idempotencyKey: "k1" })).rejects.toMatchObject({
      code: "sdk.idempotency_unsupported",
    });
    expect(calls).toHaveLength(0);
  });

  it("never re-sends an unsafe write after a proxy 503 without an envelope", async () => {
    const { fetch, calls } = mockFetch([html(503), ok({})]);
    const err = await new Oblodai({ ...creds, fetch }).payouts.approve("p1").catch((e) => e);
    expect(err).toMatchObject({ httpStatus: 503, synthetic: true, retryable: true });
    expect(calls).toHaveLength(1);
  });

  it("retries a read route after a proxy 502/504 and honours the Retry-After header", async () => {
    const { fetch, calls } = mockFetch([
      html(502),
      html(504, { "retry-after": "0" }),
      ok({ balance: { merchant: [] } }),
    ]);
    await new Oblodai({ ...creds, fetch }).account.balance();
    expect(calls).toHaveLength(3);

    const one = mockFetch([html(429, { "retry-after": "120" })]);
    const err = await new Oblodai({ ...creds, fetch: one.fetch, retry: { maxRetries: 0 } }).account
      .balance()
      .catch((e) => e);
    expect(err.retryAfter).toBe(120);
  });

  it("retries an enveloped retryable error on an unsafe write (the core answered, so it did nothing)", async () => {
    const { fetch, calls } = mockFetch([
      apiError(409, { code: "payout.funds_maturing", retryable: true, retry_after: 0 }),
      ok({ uuid: "p" }),
    ]);
    await new Oblodai({ ...creds, fetch }).payouts.approve("p1");
    expect(calls).toHaveLength(2);
  });
});

describe("PagePromise", () => {
  it("requests nothing until consumed and exposes catch/finally", async () => {
    const { fetch, calls } = mockFetch([
      apiError(404, { code: "payment.not_found", retryable: false }),
    ]);
    const ob = new Oblodai({ ...creds, fetch });
    const p = ob.payments.history();
    expect(calls).toHaveLength(0);
    expect(typeof p.catch).toBe("function");
    expect(typeof p.finally).toBe("function");
    const err = await p.catch((e) => e);
    expect(err.code).toBe("payment.not_found");
    expect(calls).toHaveLength(1);
  });

  it("does not forward a caller idempotency key to list pages", async () => {
    const { fetch, calls } = mockFetch([
      ok({ items: [], paginate: { total: 0, per_page: 50, offset: 0, has_pages: false } }),
    ]);
    await new Oblodai({ ...creds, fetch }).payouts.history({}, { idempotencyKey: "k" });
    expect(calls[0]!.headers["idempotency-key"]).toBeUndefined();
  });
});

describe("clock skew", () => {
  const dateFar = () => ({ date: new Date(Date.now() + 4000 * 1000).toUTCString() });

  it("ignores the Date header on a 401 that is not a signature failure", async () => {
    const { fetch, calls } = mockFetch([
      apiError(401, { code: "auth.ip_not_allowed", retryable: false }, dateFar()),
    ]);
    const ob = new Oblodai({ ...creds, fetch, retry: { maxRetries: 0 } });
    await expect(ob.account.balance()).rejects.toMatchObject({ code: "auth.ip_not_allowed" });
    expect(calls).toHaveLength(1);
  });

  it("reverts the correction when the re-signed attempt is still rejected, so one bad Date cannot wedge the client", async () => {
    const { fetch, calls } = mockFetch([
      apiError(401, { code: "merchant.bad_signature", retryable: false }, dateFar()),
      apiError(401, { code: "merchant.bad_signature", retryable: false }, dateFar()),
      ok({ balance: { merchant: [] } }),
    ]);
    const ob = new Oblodai({ ...creds, fetch, retry: { maxRetries: 0 } });
    await expect(ob.account.balance()).rejects.toMatchObject({ code: "merchant.bad_signature" });
    await ob.account.balance();
    const ts = Number(calls[2]!.headers["x-timestamp"]);
    expect(Math.abs(ts - Math.floor(Date.now() / 1000))).toBeLessThan(5);
  });
});

describe("request construction", () => {
  it("keeps a path prefix on baseUrl and signs over the full path", async () => {
    const { fetch, calls } = mockFetch([ok({ balance: { merchant: [] } })]);
    await new Oblodai({ ...creds, baseUrl: "https://gw.corp/oblodai/", fetch }).account.balance();
    expect(calls[0]!.url).toBe("https://gw.corp/oblodai/v1/balance");
  });

  it("drops caller headers that collide with signed headers", async () => {
    const { fetch, calls } = mockFetch([ok({ balance: { merchant: [] } })]);
    await new Oblodai({
      ...creds,
      fetch,
      headers: { "x-signature": "zz", "X-Trace": "t1" },
    }).account.balance();
    expect(calls[0]!.headers["x-signature"]).toMatch(/^[0-9a-f]{64}$/);
    expect(calls[0]!.headers["x-trace"]).toBe("t1");
  });

  it("refuses path parameters that would rewrite the URL", async () => {
    const ob = new Oblodai({ ...creds, fetch: mockFetch([]).fetch });
    await expect(ob.payments.publicView("..")).rejects.toMatchObject({
      code: "sdk.bad_path_param",
    });
    await expect(ob.payments.publicView("a/b")).rejects.toMatchObject({
      code: "sdk.bad_path_param",
    });
  });

  it("sends uuid for document reports keyed by batch/link id", async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: "%PDF", headers: { "content-type": "application/pdf" } },
    ]);
    await new Oblodai({ ...creds, fetch }).documents.batchReport("b-1", { format: "csv" });
    expect(new URL(calls[0]!.url).searchParams.get("uuid")).toBe("b-1");
  });
});

describe("abort, deadline, redirects, serialization", () => {
  it("aborting during a retry pause surfaces transport.aborted", async () => {
    const { fetch } = mockFetch([
      apiError(503, { code: "db.unavailable", retryable: true, retry_after: 1 }),
      ok({}),
    ]);
    const ac = new AbortController();
    const ob = new Oblodai({ ...creds, fetch, retry: { maxRetryAfterMs: 5000 } });
    const pending = ob.account.balance({ signal: ac.signal });
    setTimeout(() => ac.abort(), 10);
    const err = await pending.catch((e) => e);
    expect(err).toBeInstanceOf(TransportError);
    expect(err.code).toBe("transport.aborted");
  });

  it("stops retrying when the overall deadline would be exceeded", async () => {
    const { fetch, calls } = mockFetch([
      apiError(503, { code: "db.unavailable", retryable: true, retry_after: 2 }),
      ok({}),
    ]);
    const err = await new Oblodai({ ...creds, fetch, deadlineMs: 100 }).account
      .balance()
      .catch((e) => e);
    expect(err.code).toBe("transport.deadline");
    expect(calls).toHaveLength(1);
  });

  it("names the redirect target instead of a bare envelope error", async () => {
    const { fetch } = mockFetch([
      { status: 301, body: "", headers: { location: "https://www.api.test/v1/balance" } },
    ]);
    const err = await new Oblodai({ ...creds, fetch, retry: { maxRetries: 0 } }).account
      .balance()
      .catch((e) => e);
    expect(err.httpStatus).toBe(301);
    expect(err.message).toMatch(/redirect.*www\.api\.test/);
  });

  it("serializes errors without the raw body and keeps the message", async () => {
    const { fetch } = mockFetch([
      apiError(400, { code: "payment.below_minimum", message: "too small", retryable: false }),
    ]);
    const err = await new Oblodai({ ...creds, fetch }).payments
      .create({ amount: "0", currency: "USDT" })
      .catch((e) => e);
    const json = JSON.parse(JSON.stringify(err));
    expect(json).toMatchObject({
      code: "payment.below_minimum",
      message: "too small",
      httpStatus: 400,
    });
    expect(json.raw).toBeUndefined();
    expect(Object.keys(err)).not.toContain("raw");
  });

  it("accepts IPv6 loopback and rejects half a key pair", () => {
    expect(() => new Oblodai({ ...creds, baseUrl: "http://[::1]:8093" })).not.toThrow();
    expect(() => new Oblodai({ publicId: "pk", baseUrl: "https://api.test" })).toThrow(ConfigError);
  });
});
