import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signWebhook } from "../../src/core/signing.js";
import { gateway } from "../support/gateway.js";
import {
  HEADER_IDEMPOTENCY_KEY,
  HEADER_WEBHOOK_ID,
  HEADER_WEBHOOK_SIGNATURE,
  HEADER_WEBHOOK_TIMESTAMP,
} from "../../src/generated/signing.js";

// Every examples/*.ts runs its main() against the stand-in gateway; the webhook receiver gets a
// signed delivery and a forged one.
const realFetch = globalThis.fetch;
let calls: ReturnType<typeof gateway>["calls"];

beforeEach(() => {
  const g = gateway();
  calls = g.calls;
  globalThis.fetch = g.fetch as typeof fetch;
  vi.stubEnv("OBLODAI_PUBLIC_ID", "test_oblodai_demo");
  vi.stubEnv("OBLODAI_SECRET", "oblodai_test_demo");
  vi.stubEnv("OBLODAI_BASE_URL", "");
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("examples", () => {
  it("accept-payment", async () => {
    const { main } = await import("../../examples/accept-payment.js");
    await main(0);
    expect(calls.map((c) => c.route.operationId)).toEqual(["createPayment", "getPaymentInfo"]);
  });

  it("payout", async () => {
    const { main } = await import("../../examples/payout.js");
    await main();
    expect(calls.map((c) => c.route.operationId)).toEqual(["validatePayout", "createPayout"]);
    expect(calls[1]!.headers[HEADER_IDEMPOTENCY_KEY.toLowerCase()]).toBe("payout-42");
  });

  it("sandbox", async () => {
    const { main } = await import("../../examples/sandbox.js");
    await main();
    expect(calls.map((c) => c.route.operationId)).toEqual([
      "sandboxFaucet",
      "createPayment",
      "sandboxSimulateDeposit",
      "getPaymentInfo",
      "createPayoutBatch",
      "getBatchInfo",
      "sandboxListWebhooks",
    ]);
  });

  it("webhook-express accepts a signed delivery and refuses a forged one", async () => {
    globalThis.fetch = realFetch;
    vi.stubEnv("OBLODAI_WEBHOOK_SECRET", "whsec_demo");
    const { app } = await import("../../examples/webhook-express.js");
    const server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    try {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/oblodai/webhook`;
      const body = JSON.stringify({
        type: "payment",
        uuid: "u-1",
        order_id: "o-1",
        status: "paid",
        sequence: 1,
      });
      const ts = Math.floor(Date.now() / 1000);
      const send = (signature: string) =>
        fetch(url, {
          method: "POST",
          body,
          headers: {
            "content-type": "application/json",
            [HEADER_WEBHOOK_TIMESTAMP]: String(ts),
            [HEADER_WEBHOOK_SIGNATURE]: signature,
            [HEADER_WEBHOOK_ID]: "w-1",
          },
        });
      expect((await send(signWebhook("whsec_demo", ts, body))).status).toBe(200);
      expect((await send(signWebhook("forged", ts, body))).status).toBe(400);
    } finally {
      server.close();
    }
  });
});
