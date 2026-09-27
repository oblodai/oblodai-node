import { describe, expect, it } from "vitest";
import { isKnownEvent } from "../../src/webhooks.js";
import {
  isStaleEvent,
  objectId,
  parseWebhook,
  verifyWebhook,
  verifyWebhookDelivery,
} from "../../src/webhooks.js";
import { SignatureError } from "../../src/core/errors.js";
import { signWebhook } from "../../src/core/signing.js";
import { WEBHOOK_SAMPLES_SECRET, loadWebhookSamples } from "../support/fixtures.js";
import {
  HEADER_WEBHOOK_EVENT,
  HEADER_WEBHOOK_EVENT_ID,
  HEADER_WEBHOOK_ID,
  HEADER_WEBHOOK_SIGNATURE,
  HEADER_WEBHOOK_SIGNATURE_PREV,
  HEADER_WEBHOOK_TIMESTAMP,
  SKEW_SECONDS,
} from "../../src/generated/signing.js";

// The samples were delivered by the core's real dispatcher to the recorder, signed with the
// endpoint secret in force at that moment — the one returned by the rotate-secret call.
const samples = loadWebhookSamples();
const secret = WEBHOOK_SAMPLES_SECRET;

describe("verifyWebhook against real deliveries", () => {
  for (const s of samples) {
    it(`verifies ${s.headers[HEADER_WEBHOOK_EVENT]}`, () => {
      const raw = s.raw ?? JSON.stringify(s.body); // the recorder keeps the exact delivered bytes
      const ts = Number(s.headers[HEADER_WEBHOOK_TIMESTAMP]);
      const { event, eventKey, unverified } = verifyWebhookDelivery(raw, s.headers, {
        secret,
        now: () => ts,
      });
      expect(objectId(event)).toBe(s.body.uuid);
      expect(eventKey).toBe(`${s.body.type}:${s.body.uuid}:${s.body.sequence}`);
      expect(unverified.deliveryId).toBe(s.headers[HEADER_WEBHOOK_ID]);
      expect(unverified.eventId).toBe(s.headers[HEADER_WEBHOOK_EVENT_ID]);
      expect(unverified.eventType).toBe(s.headers[HEADER_WEBHOOK_EVENT]);
      expect(() =>
        verifyWebhook(raw, s.headers, {
          secret: "some-other-secret",
          previousSecret: "another",
          now: () => ts,
        }),
      ).toThrow(/does not match/);
      expect(event.type).toBe(s.body.type);
      expect(typeof event.sequence).toBe("number");
      expect(s.headers[HEADER_WEBHOOK_EVENT]).toMatch(/^(invoice|payout|wallet)\./);
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
    [HEADER_WEBHOOK_TIMESTAMP.toLowerCase()]: String(ts),
    [HEADER_WEBHOOK_SIGNATURE.toLowerCase()]: signWebhook("whsec", ts, body),
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
    expect(() =>
      verifyWebhook(body, { [HEADER_WEBHOOK_SIGNATURE.toLowerCase()]: "aa" }, { secret: "whsec" }),
    ).toThrow(/missing/);
  });

  it("rejects stale deliveries unless tolerance is disabled", () => {
    expect(() =>
      verifyWebhook(body, headers(), { secret: "whsec", now: () => ts + 2 * SKEW_SECONDS }),
    ).toThrow(/outside/);
    expect(
      verifyWebhook(body, headers(), {
        secret: "whsec",
        now: () => ts + 2 * SKEW_SECONDS,
        toleranceSec: 0,
      }),
    ).toMatchObject({ uuid: "u1" });
  });

  it("verifies during a secret rotation via the Prev header or the previousSecret option", () => {
    const rotated = headers({
      [HEADER_WEBHOOK_SIGNATURE.toLowerCase()]: signWebhook("new", ts, body),
      [HEADER_WEBHOOK_SIGNATURE_PREV.toLowerCase()]: signWebhook("old", ts, body),
    });
    expect(verifyWebhook(body, rotated, { secret: "old", now: () => ts })).toMatchObject({
      uuid: "u1",
    }); // not yet swapped
    expect(verifyWebhook(body, rotated, { secret: "new", now: () => ts })).toMatchObject({
      uuid: "u1",
    }); // swapped
    expect(
      verifyWebhook(body, rotated, { secret: "unrelated", previousSecret: "old", now: () => ts }),
    ).toMatchObject({ uuid: "u1" });
  });

  it("keeps the unsigned id headers under `unverified` only", () => {
    const withIds = headers({
      [HEADER_WEBHOOK_ID.toLowerCase()]: "d-1",
      [HEADER_WEBHOOK_EVENT_ID.toLowerCase()]: "e-1",
    });
    const delivery = verifyWebhookDelivery(body, withIds, { secret: "whsec", now: () => ts });
    expect([delivery.unverified.deliveryId, delivery.unverified.eventId]).toEqual(["d-1", "e-1"]);
    expect(delivery).not.toHaveProperty("id");
    expect(delivery).not.toHaveProperty("eventId");
    expect(
      verifyWebhookDelivery(body, headers(), { secret: "whsec", now: () => ts }).unverified.eventId,
    ).toBeUndefined();
  });

  it("derives the dedupe key from the signed body, not from a replayed header", () => {
    // A captured delivery replayed with a fresh X-Webhook-Event-Id: the MAC still holds (the header
    // is not signed), and the dedupe key must stay the same so the replay is recognised.
    const original = verifyWebhookDelivery(
      body,
      headers({ [HEADER_WEBHOOK_EVENT_ID.toLowerCase()]: "e-1" }),
      { secret: "whsec", now: () => ts },
    );
    const replayed = verifyWebhookDelivery(
      body,
      headers({ [HEADER_WEBHOOK_EVENT_ID.toLowerCase()]: "e-forged" }),
      { secret: "whsec", now: () => ts },
    );
    expect(original.eventKey).toBeDefined();
    expect(replayed.eventKey).toBe(original.eventKey);
  });

  it("parses the discriminated union and detects stale sequences", () => {
    const ev = parseWebhook(body);
    expect(ev.type).toBe("payment");
    expect(isStaleEvent(ev, 7)).toBe(true);
    expect(isStaleEvent(ev, 6)).toBe(false);
    expect(isStaleEvent(ev, undefined)).toBe(false);
    // A type from a newer core must reach the handler, not blow up the receiver.
    const alien = parseWebhook('{"type":"alien","uuid":"x"}');
    expect(alien.type).toBe("alien");
    expect(isKnownEvent(alien)).toBe(false);
  });

  it("reads the object id from the field the contract declares for the kind", () => {
    expect(objectId(parseWebhook(body))).toBe(JSON.parse(body).uuid);
    // A conversion names its object `id`, not `uuid`.
    expect(objectId(parseWebhook('{"type":"conversion","id":"c-1","sequence":1}'))).toBe("c-1");
    // An unknown kind's id field is not guessed.
    expect(objectId(parseWebhook('{"type":"alien","uuid":"x","id":"y"}'))).toBeUndefined();
    expect(objectId(null)).toBeUndefined();
  });
});
