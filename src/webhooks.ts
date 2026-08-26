import type { WebhookEvent } from "./contract/models/webhooks.js";
import { OblodaiError, SignatureError } from "./core/errors.js";
import { signWebhook } from "./core/signing.js";
import { constantTimeEqual, headerValue, isRecord } from "./core/util.js";

export { SignatureError, OblodaiError };

/**
 * Webhook verification — usable on its own (`import { verifyWebhook } from "@oblodai-npm/sdk/webhooks"`),
 * no client or API key required. Deliveries are signed as:
 *
 *   X-Webhook-Timestamp: <unix seconds>
 *   X-Webhook-Signature: hex(HMAC-SHA256(secret, "<ts>." + rawBody))
 *   X-Webhook-Signature-Prev: same, with the previous secret — only during a rotation overlap
 *   X-Webhook-Event: invoice.<status> | payout.<status> | wallet.paid
 *   X-Webhook-Id: stable per delivery (identical across retries) — use it as your idempotency key
 *   X-Webhook-Event-Time: unix seconds when the state change committed (order events by it)
 *
 * Always verify over the raw request bytes; a re-serialized parse will not match.
 */
export type WebhookHeaders = Headers | Record<string, string | string[] | undefined>;

export interface VerifyWebhookOptions {
  /** The endpoint secret from `webhooks.register` / `rotateSecret`. */
  secret: string;
  /**
   * During a rotation keep the outgoing secret here. Deliveries queued before the rotation stay
   * signed with it for their whole retry life (~26 h), so keep it at least that long after rotating.
   */
  previousSecret?: string;
  /** Reject deliveries whose timestamp is older/newer than this, seconds. Default 300; 0 disables. */
  toleranceSec?: number;
  /** Injectable clock (unix seconds) for tests. */
  now?: () => number;
}

/** A verified delivery: the event plus the advisory headers worth keeping. */
export interface WebhookDeliveryInfo {
  event: WebhookEvent;
  /** `X-Webhook-Id` — stable across retries of the same delivery; use it as your idempotency key. */
  id?: string;
  /** `X-Webhook-Event` — `invoice.<status>` | `payout.<status>` | `wallet.paid`. */
  eventType?: string;
  /** `X-Webhook-Event-Time` — unix seconds when the state change committed. */
  eventTime?: number;
  /** `X-Webhook-Timestamp` — unix seconds when this attempt was sent. */
  sentAt: number;
  /** A rehearsal delivery (`X-Webhook-Test: true` / body `test: true`): signed like a live one, but no money moved. */
  isTest: boolean;
}

export const HEADER_WEBHOOK_TIMESTAMP = "X-Webhook-Timestamp";
export const HEADER_WEBHOOK_SIGNATURE = "X-Webhook-Signature";
export const HEADER_WEBHOOK_SIGNATURE_PREV = "X-Webhook-Signature-Prev";
export const HEADER_WEBHOOK_EVENT = "X-Webhook-Event";
export const HEADER_WEBHOOK_ID = "X-Webhook-Id";
export const HEADER_WEBHOOK_EVENT_TIME = "X-Webhook-Event-Time";
export const HEADER_WEBHOOK_TEST = "X-Webhook-Test";

/** Verify the signature and freshness, then parse. Throws SignatureError; never returns an unverified body. */
export function verifyWebhook(
  rawBody: string | Uint8Array,
  headers: WebhookHeaders,
  options: VerifyWebhookOptions,
): WebhookEvent {
  return verifyWebhookDelivery(rawBody, headers, options).event;
}

/** Like `verifyWebhook`, and also returns the delivery id, event type and times from the headers. */
export function verifyWebhookDelivery(
  rawBody: string | Uint8Array,
  headers: WebhookHeaders,
  options: VerifyWebhookOptions,
): WebhookDeliveryInfo {
  const tsRaw = headerValue(headers, HEADER_WEBHOOK_TIMESTAMP);
  const sig = headerValue(headers, HEADER_WEBHOOK_SIGNATURE);
  if (!tsRaw || !sig) {
    throw new SignatureError(
      "webhook.missing_header",
      `missing ${HEADER_WEBHOOK_TIMESTAMP} or ${HEADER_WEBHOOK_SIGNATURE}`,
    );
  }
  const ts = Number(tsRaw);
  if (!Number.isInteger(ts))
    throw new SignatureError("webhook.bad_signature", "timestamp header is not an integer");

  const tolerance = options.toleranceSec ?? 300;
  if (tolerance > 0) {
    const now = (options.now ?? (() => Math.floor(Date.now() / 1000)))();
    if (Math.abs(now - ts) > tolerance) {
      throw new SignatureError(
        "webhook.stale_timestamp",
        `delivery timestamp ${ts} is outside the ±${tolerance}s window`,
      );
    }
  }

  const candidates: Array<[string, string]> = [[sig, options.secret]];
  const prevSig = headerValue(headers, HEADER_WEBHOOK_SIGNATURE_PREV);
  // A merchant who has not swapped the stored secret yet verifies the Prev header with it; one who
  // already swapped but kept the old copy verifies the main header with the new secret. Both hold.
  if (prevSig) candidates.push([prevSig, options.secret]);
  if (options.previousSecret) {
    candidates.push([sig, options.previousSecret]);
    if (prevSig) candidates.push([prevSig, options.previousSecret]);
  }
  const ok = candidates.some(([provided, secret]) =>
    constantTimeEqual(provided.toLowerCase(), signWebhook(secret, ts, rawBody)),
  );
  if (!ok) throw new SignatureError("webhook.bad_signature", "signature does not match the body");

  const eventTimeRaw = headerValue(headers, HEADER_WEBHOOK_EVENT_TIME);
  const event = parseWebhook(rawBody);
  return {
    event,
    isTest: headerValue(headers, HEADER_WEBHOOK_TEST) === "true" || event.test === true,
    id: headerValue(headers, HEADER_WEBHOOK_ID),
    eventType: headerValue(headers, HEADER_WEBHOOK_EVENT),
    eventTime: eventTimeRaw && /^\d+$/.test(eventTimeRaw) ? Number(eventTimeRaw) : undefined,
    sentAt: ts,
  };
}

/** True for rehearsal deliveries (`webhooks.test`, sandbox) — never act on them as if money moved. */
export function isTestEvent(event: Pick<WebhookEvent, "test">): boolean {
  return event.test === true;
}

/** Parse a (previously verified) delivery body into a typed event, discriminated by `type`. */
export function parseWebhook(rawBody: string | Uint8Array): WebhookEvent {
  const text = typeof rawBody === "string" ? rawBody : Buffer.from(rawBody).toString("utf8");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new SignatureError("webhook.bad_signature", "body is not JSON");
  }
  if (!isRecord(body) || typeof body.type !== "string" || typeof body.uuid !== "string") {
    throw new SignatureError(
      "webhook.bad_signature",
      "body lacks the type/uuid fields every event carries",
    );
  }
  if (body.type !== "payment" && body.type !== "payout" && body.type !== "wallet") {
    throw new SignatureError("webhook.bad_signature", `unknown event type "${String(body.type)}"`);
  }
  return body as unknown as WebhookEvent;
}

/**
 * Deliveries can arrive out of order (a retried `paid` after a `refund`). Keep the last `sequence`
 * you processed per object and skip anything not newer.
 */
export function isStaleEvent(
  event: Pick<WebhookEvent, "sequence">,
  lastProcessedSequence: number | undefined,
): boolean {
  return lastProcessedSequence !== undefined && event.sequence <= lastProcessedSequence;
}
