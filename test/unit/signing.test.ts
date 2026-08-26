import { describe, expect, it } from "vitest";
import { canonicalString, signRequest, signWebhook } from "../../src/core/signing.js";
import { loadContract } from "../support/fixtures.js";

const contract = loadContract();

describe("request signing (vectors exported from the core test suite)", () => {
  for (const v of contract.signing_vectors) {
    it(v.name, () => {
      const input = {
        ts: v.ts,
        method: v.method,
        requestUri: v.request_uri,
        idempotencyKey: v.idempotency_key || undefined,
        body: v.body,
      };
      expect(canonicalString(input)).toBe(v.canonical);
      expect(signRequest(v.secret, input)).toBe(v.signature);
    });
  }

  it("the idempotency slot is empty, not absent, when no key is sent", () => {
    const withSlot = signRequest("s", { ts: 1, method: "POST", requestUri: "/v1/x", body: "{}" });
    const legacy = signRequest("s", {
      ts: 1,
      method: "POST",
      requestUri: "/v1/x",
      body: "{}",
      idempotencyKey: undefined,
    });
    expect(withSlot).toBe(legacy);
    expect(canonicalString({ ts: 1, method: "POST", requestUri: "/v1/x", body: "{}" })).toBe(
      "1\nPOST\n/v1/x\n\n{}",
    );
  });

  it("signs the body bytes, so a Uint8Array and its string form agree", () => {
    // Deliberately multi-byte: signing over characters instead of bytes would disagree here.
    const body = '{"additional_data":"caf\u00e9 \u2615"}';
    const a = signRequest("s", { ts: 5, method: "POST", requestUri: "/v1/payment", body });
    const b = signRequest("s", {
      ts: 5,
      method: "POST",
      requestUri: "/v1/payment",
      body: Buffer.from(body, "utf8"),
    });
    expect(a).toBe(b);
  });
});

describe("webhook signing", () => {
  for (const [i, v] of contract.webhook_vectors.entries()) {
    it(`vector ${i}`, () => {
      expect(signWebhook(v.secret, v.ts, v.payload)).toBe(v.signature);
    });
  }
});
