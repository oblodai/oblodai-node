import { describe, expect, it } from "vitest";
import {
  Oblodai,
  Page,
  PageResult,
  RawAPIResponse,
  type RequestInfo,
  type ResponseInfo,
} from "../../src/index.js";
import { apiError, mockFetch, ok } from "../support/mock-fetch.js";

const creds = {
  publicId: "pk",
  secret: "s",
  baseUrl: "https://api.test",
  retry: { baseDelayMs: 1, maxDelayMs: 2 },
};
const list = (items: unknown[], hasPages: boolean, offset = 0) =>
  ok({ items, paginate: { total: 3, per_page: 2, offset, has_pages: hasPages } });

describe("withRawResponse (spec §3.5)", () => {
  it("gives status, headers and request id; parse() gives the usual result", async () => {
    const { fetch, calls } = mockFetch([
      { status: 200, body: { state: 0, result: { uuid: "u-1" } }, headers: { "x-trace": "t" } },
    ]);
    const ob = new Oblodai({ ...creds, fetch });
    const raw = await ob.payments.withRawResponse.create({ amount: "1", currency: "USDT" });
    expect(raw).toBeInstanceOf(RawAPIResponse);
    expect(raw.status).toBe(200);
    expect(raw.header("X-Trace")).toBe("t");
    expect(raw.requestId).toBe(calls[0]!.headers["x-request-id"]);
    expect(raw.parse().uuid).toBe("u-1");
    expect(raw.parse()).toBe(raw.parse());
  });

  it("prefers the response's own X-Request-ID", async () => {
    const { fetch } = mockFetch([
      { status: 200, body: { state: 0, result: {} }, headers: { "x-request-id": "srv-1" } },
    ]);
    const raw = await new Oblodai({ ...creds, fetch }).account.withRawResponse.getBalance();
    expect(raw.requestId).toBe("srv-1");
  });

  it("an error status still throws", async () => {
    const { fetch } = mockFetch([apiError(404, { code: "payment.not_found", retryable: false })]);
    const err = await new Oblodai({ ...creds, fetch }).payments.withRawResponse
      .getInfo({ uuid: "x" })
      .catch((e) => e);
    expect(err.code).toBe("payment.not_found");
  });

  it("a list parses to a Page that starts from the raw page", async () => {
    const { fetch, calls } = mockFetch([list([1, 2], true), list([3], false, 2)]);
    const raw = await new Oblodai({ ...creds, fetch }).payments.withRawResponse.listHistory({
      limit: 2,
    });
    const page = raw.parse();
    expect(page).toBeInstanceOf(Page);
    expect(await page.all()).toEqual([1, 2, 3]);
    expect(calls).toHaveLength(2);
  });

  it("a document parses to its file", async () => {
    const { fetch } = mockFetch([
      { status: 200, body: "%PDF-1", headers: { "content-type": "application/pdf" } },
    ]);
    const raw = await new Oblodai({ ...creds, fetch }).documents.withRawResponse.getBatch({
      uuid: "b",
    });
    expect(raw.parse().contentType).toBe("application/pdf");
    expect(new TextDecoder().decode(raw.content)).toBe("%PDF-1");
  });
});

describe("withOptions", () => {
  it("a client copy changes only itself", async () => {
    const { fetch, calls } = mockFetch([
      apiError(503, { code: "db.unavailable", retryable: true, retry_after: 0 }),
      apiError(503, { code: "db.unavailable", retryable: true, retry_after: 0 }),
      ok({ balance: {} }),
    ]);
    const ob = new Oblodai({ ...creds, fetch });
    const strict = ob.withOptions({ maxRetries: 0, extraHeaders: { "X-Tenant": "t1" } });
    await strict.account.getBalance().catch(() => undefined);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.headers["x-tenant"]).toBe("t1");
    await ob.account.getBalance();
    expect(calls).toHaveLength(3);
    expect(calls[2]!.headers["x-tenant"]).toBeUndefined();
    expect(strict.payments).not.toBe(ob.payments);
  });

  it("refuses a nonsense retry budget", () => {
    const ob = new Oblodai({ ...creds, fetch: mockFetch([]).fetch });
    expect(() => ob.withOptions({ maxRetries: -1 })).toThrow(/maxRetries/);
    expect(() => ob.withOptions({ timeout: 0 })).toThrow(/timeout/);
  });

  it("a resource copy starts every call from its options; per-call options win", async () => {
    const { fetch, calls } = mockFetch([ok({}), ok({})]);
    const ob = new Oblodai({ ...creds, fetch });
    const tagged = ob.account.withOptions({ extraHeaders: { "X-A": "1", "X-B": "1" } });
    await tagged.getBalance({ extraHeaders: { "X-B": "2" } });
    await ob.account.getBalance();
    expect(calls[0]!.headers["x-a"]).toBe("1");
    expect(calls[0]!.headers["x-b"]).toBe("2");
    expect(calls[1]!.headers["x-a"]).toBeUndefined();
  });
});

describe("hooks", () => {
  it("see every attempt, redacted, with the call's request id and operation", async () => {
    const requests: RequestInfo[] = [];
    const responses: ResponseInfo[] = [];
    const boom = new TypeError("fetch failed");
    const { fetch } = mockFetch([{ throws: boom }, ok({})]);
    const ob = new Oblodai({
      ...creds,
      fetch,
      hooks: { onRequest: (r) => requests.push(r), onResponse: (r) => responses.push(r) },
    });
    await ob.account.getBalance();
    expect(requests.map((r) => r.attempt)).toEqual([1, 2]);
    expect(requests[0]!.operationId).toBe("getBalance");
    expect(requests[0]!.requestId).toBe(requests[1]!.requestId);
    expect(requests[0]!.headers["X-Signature"]).toBe("[redacted]");
    expect(responses.map((r) => r.status)).toEqual([0, 200]);
    expect((responses[0]!.error as { code: string }).code).toBe("transport.network");
    expect(responses[1]!.error).toBeUndefined();
    expect(responses[1]!.elapsed).toBeGreaterThanOrEqual(0);
  });

  it("a throwing hook fails the call", async () => {
    const { fetch } = mockFetch([ok({})]);
    const ob = new Oblodai({
      ...creds,
      fetch,
      hooks: {
        onRequest: () => {
          throw new Error("hook broke");
        },
      },
    });
    await expect(ob.account.getBalance()).rejects.toThrow("hook broke");
  });
});

describe("pages (spec §3.7)", () => {
  it("byPage() walks page by page, one request each, limit/offset in the body", async () => {
    const { fetch, calls } = mockFetch([list([1, 2], true), list([3], false, 2)]);
    const ob = new Oblodai({ ...creds, fetch });
    const pages: PageResult<unknown>[] = [];
    for await (const p of ob.payments.listHistory({ limit: 2, status: "paid" }).byPage()) {
      pages.push(p);
    }
    expect(pages.map((p) => p.items)).toEqual([[1, 2], [3]]);
    expect(pages[0]!.hasPages).toBe(true);
    expect(pages[0]!.total).toBe(3);
    expect(JSON.parse(calls[1]!.body!)).toEqual({ status: "paid", limit: 2, offset: 2 });
  });

  it("a GET list pages through the query and defaults to 50 per page", async () => {
    const { fetch, calls } = mockFetch([list([], false)]);
    await new Oblodai({ ...creds, fetch }).sandbox.listWebhooks();
    const url = new URL(calls[0]!.url);
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.get("offset")).toBe("0");
    expect(calls[0]!.body).toBeUndefined();
  });

  it("is lazy, and the first page is fetched once however it is consumed", async () => {
    const { fetch, calls } = mockFetch([list([1, 2], false)]);
    const page = new Oblodai({ ...creds, fetch }).payments.listHistory();
    expect(calls).toHaveLength(0);
    const first = await page;
    expect(first.items).toEqual([1, 2]);
    expect(await page.all()).toEqual([1, 2]);
    expect(calls).toHaveLength(1);
  });

  it("all(max) stops without requesting another page", async () => {
    const { fetch, calls } = mockFetch([list([1, 2], true), list([3], false, 2)]);
    expect(await new Oblodai({ ...creds, fetch }).payments.listHistory().all(2)).toEqual([1, 2]);
    expect(calls).toHaveLength(1);
  });
});
