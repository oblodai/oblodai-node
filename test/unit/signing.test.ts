import { describe, expect, it } from "vitest";
import { canonicalString, signRequest } from "../../src/core/signing.js";

// The core's own vectors (x-oblodai-signing of the contract) run in test/conformance.
describe("request signing", () => {
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
