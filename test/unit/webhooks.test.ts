import { describe, expect, it } from "vitest";
import {
  isStaleEvent,
  parseWebhook,
  verifyWebhook,
  verifyWebhookDelivery,
} from "../../src/webhooks.js";
import { SignatureError } from "../../src/core/errors.js";
import { signWebhook } from "../../src/core/signing.js";
import { loadWebhookSamples, resultOf } from "../support/fixtures.js";

// The samples were delivered by the core's real dispatcher to the recorder, signed with the
// endpoint secret in force at that moment — the one returned by the rotate-secret call.
const samples = loadWebhookSamples();
const secret = resultOf<{ secret: string }>("POST /v1/webhooks/rotate-secret").secret;

describe("verifyWebhook against real deliveries", () => {
  for (const s of samples) {
    it(`verifies ${s.headers["X-Webhook-Event"]}`, () => {
      const raw = s.raw ?? JSON.stringify(s.body); // the recorder keeps the exact delivered bytes
      const ts = Number(s.headers["X-Webhook-Timestamp"]);
      const { event, id, eventType } = verifyWebhookDelivery(raw, s.headers, {
        secret,
        now: () => ts,
      });
      expect(event.uuid).toBe(s.body.uuid);
      expect(id).toBe(s.headers["X-Webhook-Id"]);
      expect(eventType).toBe(s.headers["X-Webhook-Event"]);
      expect(() =>
        verifyWebhook(raw, s.headers, {
          secret: "some-other-secret",
          previousSecret: "another",
          now: () => ts,
        }),
      ).toThrow(/does not match/);
      expect(event.type).toBe(s.body.type);
      expect(typeof event.sequence).toBe("number");
      expect(s.headers["X-Webhook-Event"]).toMatch(/^(invoice|payout|wallet)\./);
    });
  }
});

describe("verifyWebhook rules", () => {
  const body = JSON.stringify({
    type: "payment",
    uuid: "u1",
    order_id: "o",
    status: "paid",
    is_final: true,
    sequence: 7,
    event_at: "2026-01-01T00:00:00Z",
  });
  const ts = 1_755_600_000;
  const headers = (overrides: Record<string, string> = {}) => ({
    "x-webhook-timestamp": String(ts),
    "x-webhook-signature": signWebhook("whsec", ts, body),
    ...overrides,
  });

  it("accepts a valid signature with case-insensitive headers", () => {
    expect(verifyWebhook(body, headers(), { secret: "whsec", now: () => ts }).type).toBe("payment");
  });

  it("rejects a wrong secret, a tampered body and a missing header", () => {
    expect(() => verifyWebhook(body, headers(), { secret: "other", now: () => ts })).toThrow(
      SignatureError,
    );
    expect(() =>
      verifyWebhook(body.replace("paid", "paid_over"), headers(), {
        secret: "whsec",
        now: () => ts,
      }),
    ).toThrow(/does not match/);
    expect(() => verifyWebhook(body, { "x-webhook-signature": "aa" }, { secret: "whsec" })).toThrow(
      /missing/,
    );
  });

  it("rejects stale deliveries unless tolerance is disabled", () => {
    expect(() => verifyWebhook(body, headers(), { secret: "whsec", now: () => ts + 600 })).toThrow(
      /outside/,
    );
    expect(
      verifyWebhook(body, headers(), { secret: "whsec", now: () => ts + 600, toleranceSec: 0 })
        .uuid,
    ).toBe("u1");
  });

  it("verifies during a secret rotation via the Prev header or the previousSecret option", () => {
    const rotated = headers({
      "x-webhook-signature": signWebhook("new", ts, body),
      "x-webhook-signature-prev": signWebhook("old", ts, body),
    });
    expect(verifyWebhook(body, rotated, { secret: "old", now: () => ts }).uuid).toBe("u1"); // not yet swapped
    expect(verifyWebhook(body, rotated, { secret: "new", now: () => ts }).uuid).toBe("u1"); // swapped
    expect(
      verifyWebhook(body, rotated, { secret: "unrelated", previousSecret: "old", now: () => ts })
        .uuid,
    ).toBe("u1");
  });

  it("parses the discriminated union and detects stale sequences", () => {
    const ev = parseWebhook(body);
    expect(ev.type).toBe("payment");
    expect(isStaleEvent(ev, 7)).toBe(true);
    expect(isStaleEvent(ev, 6)).toBe(false);
    expect(isStaleEvent(ev, undefined)).toBe(false);
    expect(() => parseWebhook('{"type":"alien","uuid":"x"}')).toThrow(/unknown event type/);
  });
});
