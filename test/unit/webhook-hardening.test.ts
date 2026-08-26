import { describe, expect, it } from "vitest";
import {
  isStaleEvent,
  isTestEvent,
  parseWebhook,
  verifyWebhook,
  verifyWebhookDelivery,
} from "../../src/webhooks.js";
import { isKnownEvent } from "../../src/contract/models/webhooks.js";
import { ConfigError, SignatureError, WebhookPayloadError } from "../../src/core/errors.js";
import { signWebhook } from "../../src/core/signing.js";

const SECRET = "whsec_live_1";
const ts = 1_755_600_000;
const body = JSON.stringify({
  type: "payment",
  uuid: "u1",
  order_id: "o",
  status: "paid",
  is_final: true,
  sequence: 7,
  event_at: "2026-01-01T00:00:00Z",
});
const headers = (overrides: Record<string, string> = {}) => ({
  "x-webhook-timestamp": String(ts),
  "x-webhook-signature": signWebhook(SECRET, ts, body),
  ...overrides,
});
const now = () => ts;

describe("webhook configuration is checked before any crypto", () => {
  it("refuses an absent or empty secret instead of verifying with the empty key", () => {
    for (const secret of [undefined, "", null]) {
      const err = (() => {
        try {
          verifyWebhook(body, headers(), { secret: secret as unknown as string, now });
        } catch (e) {
          return e;
        }
      })();
      expect(err, String(secret)).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).code, String(secret)).toBe("sdk.bad_config");
    }
  });

  it("refuses an empty previousSecret rather than treating it as absent", () => {
    expect(() =>
      verifyWebhook(body, headers(), { secret: SECRET, previousSecret: "", now }),
    ).toThrow(ConfigError);
  });

  it("refuses a negative tolerance and honours 0 as 'do not check freshness'", () => {
    expect(() => verifyWebhook(body, headers(), { secret: SECRET, toleranceSec: -1, now })).toThrow(
      ConfigError,
    );
    // A year-old delivery still verifies when the window is disabled.
    const old = verifyWebhook(body, headers(), {
      secret: SECRET,
      toleranceSec: 0,
      now: () => ts + 400 * 24 * 3600,
    });
    expect(old.type).toBe("payment");
  });
});

describe("the MAC is checked before the timestamp", () => {
  it("answers a forged delivery with bad_signature even when it is also stale", () => {
    const stale = { ...headers(), "x-webhook-signature": signWebhook("wrong-key", ts, body) };
    const err = (() => {
      try {
        verifyWebhook(body, stale, { secret: SECRET, now: () => ts + 100_000 });
      } catch (e) {
        return e as SignatureError;
      }
    })();
    // stale_timestamp here would tell an unauthenticated caller which window we accept.
    expect(err!.code).toBe("webhook.bad_signature");
  });

  it("reports stale_timestamp only for an authentic delivery", () => {
    const err = (() => {
      try {
        verifyWebhook(body, headers(), { secret: SECRET, now: () => ts + 100_000 });
      } catch (e) {
        return e as SignatureError;
      }
    })();
    expect(err!.code).toBe("webhook.stale_timestamp");
  });
});

describe("signature header shapes", () => {
  const good = signWebhook(SECRET, ts, body);

  it("accepts surrounding whitespace and upper-case hex", () => {
    expect(
      verifyWebhook(body, headers({ "x-webhook-signature": `  ${good}\t` }), {
        secret: SECRET,
        now,
      }).type,
    ).toBe("payment");
    expect(
      verifyWebhook(body, headers({ "x-webhook-signature": good.toUpperCase() }), {
        secret: SECRET,
        now,
      }).type,
    ).toBe("payment");
  });

  it("rejects a 0x prefix, a non-hex value and an empty header", () => {
    for (const sig of [`0x${good}`, `${good}!`, "", "   "]) {
      const err = (() => {
        try {
          verifyWebhook(body, headers({ "x-webhook-signature": sig }), { secret: SECRET, now });
        } catch (e) {
          return e as SignatureError;
        }
      })();
      expect(err, JSON.stringify(sig)).toBeInstanceOf(SignatureError);
      // Present-but-unusable is a bad signature, not a missing header.
      expect(err!.code, JSON.stringify(sig)).toBe("webhook.bad_signature");
    }
  });

  it("still reports a missing header when the header is truly absent", () => {
    expect(() =>
      verifyWebhook(body, { "x-webhook-timestamp": String(ts) }, { secret: SECRET }),
    ).toThrow(/missing/);
  });
});

describe("an authentic body that cannot be read", () => {
  const sign = (raw: string) => ({
    "x-webhook-timestamp": String(ts),
    "x-webhook-signature": signWebhook(SECRET, ts, raw),
  });

  it("raises webhook.bad_payload, not a signature error", () => {
    for (const raw of ["not json", "[]", '"x"', "{}", '{"type":123}', '{"type":"payment"}']) {
      const err = (() => {
        try {
          verifyWebhook(raw, sign(raw), { secret: SECRET, now });
        } catch (e) {
          return e as WebhookPayloadError;
        }
      })();
      expect(err, raw).toBeInstanceOf(WebhookPayloadError);
      expect(err, raw).not.toBeInstanceOf(SignatureError);
      expect(err!.code, raw).toBe("webhook.bad_payload");
    }
  });
});

describe("an event type from a newer core", () => {
  const raw = JSON.stringify({ type: "settlement.completed", uuid: "s1", sequence: 4, test: true });

  it("is returned verbatim rather than thrown", () => {
    const { event, isTest } = verifyWebhookDelivery(
      raw,
      { "x-webhook-timestamp": String(ts), "x-webhook-signature": signWebhook(SECRET, ts, raw) },
      { secret: SECRET, now },
    );
    expect(event.type).toBe("settlement.completed");
    expect(isKnownEvent(event)).toBe(false);
    expect(isTest).toBe(true); // the helpers still work on it
    expect(isStaleEvent(event, 4)).toBe(true);
    expect(isTestEvent(event)).toBe(true);
  });
});

describe("the X-Webhook-Test header", () => {
  it('recognises "true" whatever its case or padding', () => {
    for (const flag of ["true", "True", "TRUE", " true "]) {
      const info = verifyWebhookDelivery(body, headers({ "x-webhook-test": flag }), {
        secret: SECRET,
        now,
      });
      expect(info.isTest, flag).toBe(true);
    }
    expect(
      verifyWebhookDelivery(body, headers({ "x-webhook-test": "false" }), {
        secret: SECRET,
        now,
      }).isTest,
    ).toBe(false);
  });
});

describe("isStaleEvent never throws", () => {
  it("returns false for a missing, null or non-integer sequence", () => {
    expect(isStaleEvent(parseWebhook(body), undefined)).toBe(false);
    expect(isStaleEvent(parseWebhook(body), null)).toBe(false);
    for (const seq of [undefined, null, "7", 1.5, NaN, {}]) {
      expect(isStaleEvent({ sequence: seq } as { sequence?: unknown }, 10), String(seq)).toBe(
        false,
      );
    }
    expect(isStaleEvent(null, 10)).toBe(false);
    expect(isStaleEvent(undefined, 10)).toBe(false);
    expect(isStaleEvent({ sequence: 9 }, 1.5)).toBe(false);
  });
});
