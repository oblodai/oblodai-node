import { describe, expect, it } from "vitest";
import { Oblodai } from "../../src/index.js";
import { decodeEnvelope, parseRetryAfter } from "../../src/core/envelope.js";
import {
  MAX_RETRY_AFTER_SECONDS,
  coerceRetryAfterSeconds,
  decodeErrorDetail,
} from "../../src/core/errors.js";
import { apiError, mockFetch, ok } from "../support/mock-fetch.js";

const creds = {
  publicId: "pk",
  secret: "s",
  baseUrl: "https://api.test",
  retry: { baseDelayMs: 1, maxDelayMs: 2 },
};

/**
 * A peer can answer with the envelope's SHAPE and the wrong TYPES. None of it may change how the
 * SDK behaves: the decoding is field by field, and a field that is not what it claims falls back to
 * what the HTTP status alone justifies.
 */
describe("error envelope decoded field by field", () => {
  it("keeps `family` working when the peer sends a numeric code", async () => {
    const { fetch } = mockFetch([apiError(400, { code: 123, message: "nope" })]);
    const ob = new Oblodai({ ...creds, fetch, retry: { maxRetries: 0 } });
    const err = await ob.account.balance().catch((e) => e);
    expect(typeof err.code).toBe("string");
    expect(() => err.family).not.toThrow();
    expect(err.synthetic).toBe(true); // no usable code == no usable envelope
  });

  it("does not stringify a non-string message into [object Object]", async () => {
    const { fetch } = mockFetch([apiError(400, { code: "payment.bad_amount", message: { a: 1 } })]);
    const ob = new Oblodai({ ...creds, fetch, retry: { maxRetries: 0 } });
    const err = await ob.account.balance().catch((e) => e);
    expect(err.code).toBe("payment.bad_amount");
    expect(err.message).not.toContain("[object Object]");
    expect(err.message).toContain("HTTP 400");
  });

  it('treats a truthy non-boolean `retryable` ("yes") as not retryable', async () => {
    const { fetch, calls } = mockFetch([
      apiError(500, { code: "internal", retryable: "yes" }),
      ok({ balance: { merchant: [] } }),
    ]);
    const ob = new Oblodai({ ...creds, fetch });
    const err = await ob.account.balance().catch((e) => e);
    expect(err.retryable).toBe(false);
    expect(calls).toHaveLength(1); // the string must not buy a retry
  });

  it("keeps request_id from an otherwise unusable envelope", () => {
    const decoded = decodeEnvelope(500, JSON.stringify({ error: { code: 7, request_id: "rq-9" } }));
    expect(decoded.ok).toBe(false);
    if (!decoded.ok) expect(decoded.error.requestId).toBe("rq-9");
  });

  it("drops non-string field/request_id instead of handing them to the caller", () => {
    const { detail, usable } = decodeErrorDetail({
      code: "payment.bad_amount",
      field: 5,
      request_id: { id: 1 },
    });
    expect(usable).toBe(true);
    expect(detail.field).toBeUndefined();
    expect(detail.request_id).toBeUndefined();
  });

  it("accepts retry_after as an integer, a float or a numeric string, and clamps the rest", () => {
    expect(coerceRetryAfterSeconds(12)).toBe(12);
    expect(coerceRetryAfterSeconds(1.5)).toBe(1.5);
    expect(coerceRetryAfterSeconds("30")).toBe(30);
    expect(coerceRetryAfterSeconds(-5)).toBe(0);
    expect(coerceRetryAfterSeconds(Number.MAX_VALUE)).toBe(MAX_RETRY_AFTER_SECONDS);
    expect(coerceRetryAfterSeconds(Infinity)).toBe(MAX_RETRY_AFTER_SECONDS);
    expect(coerceRetryAfterSeconds(NaN)).toBeUndefined();
    expect(coerceRetryAfterSeconds("soon")).toBeUndefined();
    expect(coerceRetryAfterSeconds({})).toBeUndefined();
    expect(coerceRetryAfterSeconds(null)).toBeUndefined();
  });

  it("clamps the Retry-After header, including an HTTP-date in the year 9999", () => {
    expect(parseRetryAfter("120")).toBe(120);
    expect(parseRetryAfter("Fri, 31 Dec 9999 23:59:59 GMT")).toBe(MAX_RETRY_AFTER_SECONDS);
    expect(parseRetryAfter("99999999999999999999999")).toBe(MAX_RETRY_AFTER_SECONDS);
    // A date already in the past is "retry now", never a negative wait.
    expect(parseRetryAfter("Thu, 01 Jan 1970 00:00:00 GMT")).toBe(0);
    expect(parseRetryAfter("later")).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });

  it("never throws a non-SDK exception on a hostile body", async () => {
    for (const body of ['{"error":null}', '{"error":[]}', '{"error":{}}', "null", "[]", '"x"']) {
      const { fetch } = mockFetch([{ status: 502, body }]);
      const ob = new Oblodai({ ...creds, fetch, retry: { maxRetries: 0 } });
      const err = await ob.account.balance().catch((e) => e);
      expect(err, body).toBeInstanceOf(Error);
      expect(typeof err.code, body).toBe("string");
      expect(err.httpStatus, body).toBe(502);
    }
  });
});
