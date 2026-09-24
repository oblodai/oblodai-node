import { describe, expect, it } from "vitest";
import { Oblodai } from "../../src/index.js";
import { ConfigError } from "../../src/core/errors.js";
import { apiError, mockFetch } from "../support/mock-fetch.js";

const creds = {
  publicId: "pk",
  secret: "s",
  baseUrl: "https://api.test",
  retry: { maxRetries: 0 },
};

describe("errors read well in logs (spec §3.6)", () => {
  it("String(err) is [code] message (request_id=…)", async () => {
    const { fetch } = mockFetch([
      apiError(400, {
        code: "payment.bad_amount",
        message: "bad amount",
        retryable: false,
        request_id: "rq-1",
      }),
    ]);
    const err = await new Oblodai({ ...creds, fetch }).payments
      .create({ amount: "0", currency: "USDT" })
      .catch((e) => e);
    expect(String(err)).toBe("[payment.bad_amount] bad amount (request_id=rq-1)");
    expect(err.message).toBe("bad amount");
    expect(err.stack.split("\n")[0]).toBe(
      "ValidationError: [payment.bad_amount] bad amount (request_id=rq-1)",
    );
  });

  it("falls back to the id this SDK sent when the answer carried none", async () => {
    const { fetch } = mockFetch([{ status: 502, body: "<html>bad gateway</html>" }]);
    const err = await new Oblodai({ ...creds, fetch }).account
      .getBalance({ requestId: "mine-1" })
      .catch((e) => e);
    expect(err.requestId).toBe("mine-1");
    expect(String(err)).toMatch(/^\[internal\] HTTP 502 .* \(request_id=mine-1\)$/);
  });

  it("an error raised before any request has no suffix", () => {
    expect(String(new ConfigError("sdk.bad_config", "nope"))).toBe("[sdk.bad_config] nope");
  });
});
