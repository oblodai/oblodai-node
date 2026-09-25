import { KNOWN_EVENT_KINDS, type WebhookEvent } from "./generated/events.js";
import { EVENT_ID_FIELDS } from "./generated/facts.js";
import { ConfigError, OblodaiError, SignatureError, WebhookPayloadError } from "./core/errors.js";
import { signWebhook } from "./core/signing.js";
import { constantTimeEqual, headerValue, isRecord } from "./core/util.js";

export { SignatureError, WebhookPayloadError, ConfigError, OblodaiError };

// The event kinds, their models (`PaymentEvent`, `PayoutEvent`, … and the `WebhookEvent` union),
// `KNOWN_EVENT_KINDS` and `WEBHOOK_EVENTS` are generated from the contract's webhooks.
export * from "./generated/events.js";

/**
 * A delivery whose `type` this SDK release does not know. The core adds event types without asking,
 * and a receiver that throws on one it has not heard of turns a new feature into an outage — so an
 * unknown type is returned verbatim, with the raw `type` string, for the handler to ignore or log.
 */
export interface UnknownWebhookEvent {
  type: string;
  uuid?: string;
  sequence?: number;
  event_at?: string;
  test?: boolean;
  [field: string]: unknown;
}

/** What a verified delivery can be: one of the known events, or one from a newer core. */
export type AnyWebhookEvent = WebhookEvent | UnknownWebhookEvent;

/**
 * Narrow a delivery to the modelled union. Use it before switching on `type` so the compiler keeps
 * the per-kind fields:
 *
 * ```ts
 * if (!isKnownEvent(event)) return void log.info("unknown event type", event.type);
 * if (event.type === "payment") console.log(event.payer_amount);
 * ```
 */
export function isKnownEvent(event: AnyWebhookEvent): event is WebhookEvent {
  return (KNOWN_EVENT_KINDS as readonly string[]).includes(event.type);
}

/**
 * Webhook verification — usable on its own (`import { verifyWebhook } from "@oblodai-npm/sdk/webhooks"`),
 * no client or API key required. Deliveries are signed as:
 *
 *   X-Webhook-Timestamp: <unix seconds>
 *   X-Webhook-Signature: hex(HMAC-SHA256(secret, "<ts>." + rawBody))
 *   X-Webhook-Signature-Prev: same, with the previous secret — only during a rotation overlap
 *   X-Webhook-Event: invoice.<status> | payout.<status> | wallet.paid | … (`WEBHOOK_EVENTS`)
 *   X-Webhook-Id: the delivery — identical across its retries, but a resend is a new delivery
 *   X-Webhook-Event-Id: the state — identical across retries AND resends of it; deduplicate on it
 *   X-Webhook-Event-Time: unix seconds when the state change committed (order events by it)
 *
 * Always verify over the raw request bytes; a re-serialized parse will not match.
 *
 * The checks run in one deliberate order: headers, then the MAC, then freshness, then the body.
 * The MAC comes before the timestamp so an unauthenticated caller cannot use the freshness window
 * as an oracle, and the body is parsed only after it is known to be authentic.
 */
export type WebhookHeaders = Headers | Record<string, string | string[] | undefined>;

export interface VerifyWebhookOptions {
  /** The endpoint secret from `webhooks.register` / `rotateSecret`. Must be non-empty. */
  secret: string;
  /**
   * During a rotation keep the outgoing secret here. Deliveries queued before the rotation stay
   * signed with it for their whole retry life (~26 h), so keep it at least that long after rotating.
   * Supplying an empty string is a configuration error, not "no previous secret" — omit it instead.
   */
  previousSecret?: string;
  /** Reject deliveries whose timestamp is older/newer than this, seconds. Default 300; 0 disables. */
  toleranceSec?: number;
  /** Injectable clock (unix seconds) for tests. */
  now?: () => number;
}

/** A verified delivery: the event plus the advisory headers worth keeping. */
export interface WebhookDeliveryInfo {
  /** Use `isKnownEvent(event)` before switching on `type`: a newer core may send a type this release does not model. */
  event: AnyWebhookEvent;
  /**
   * `X-Webhook-Id` — the delivery: identical across its retries, but a resend
   * (`webhooks.resendPayment`, a sandbox replay) is a new delivery with a new id. Not a dedup key.
   */
  id?: string;
  /**
   * `X-Webhook-Event-Id` — the state the delivery carries: identical for the original, every retry
   * and every resend of the same state, different once the state changes. Deduplicate on it.
   */
  eventId?: string;
  /** `X-Webhook-Event` — `invoice.<status>`, `payout.<status>`, … (every name: `WEBHOOK_EVENTS`). */
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
export const HEADER_WEBHOOK_EVENT_ID = "X-Webhook-Event-Id";
export const HEADER_WEBHOOK_EVENT_TIME = "X-Webhook-Event-Time";
export const HEADER_WEBHOOK_TEST = "X-Webhook-Test";

export const DEFAULT_TOLERANCE_SECONDS = 300;

/** Verify the signature and freshness, then parse. Throws SignatureError; never returns an unverified body. */
export function verifyWebhook(
  rawBody: string | Uint8Array,
  headers: WebhookHeaders,
  options: VerifyWebhookOptions,
): AnyWebhookEvent {
  return verifyWebhookDelivery(rawBody, headers, options).event;
}

/** Like `verifyWebhook`, and also returns the delivery and event ids, event type and times from the headers. */
export function verifyWebhookDelivery(
  rawBody: string | Uint8Array,
  headers: WebhookHeaders,
  options: VerifyWebhookOptions,
): WebhookDeliveryInfo {
  // Configuration first, before a single byte is hashed: verifying with an empty key would "verify"
  // whatever an attacker sends, since they can compute HMAC("" , body) as easily as we can.
  const secret = requireSecret(options?.secret, "secret");
  const previousSecret =
    options?.previousSecret === undefined
      ? undefined
      : requireSecret(options.previousSecret, "previousSecret");
  const tolerance = options?.toleranceSec ?? DEFAULT_TOLERANCE_SECONDS;
  if (typeof tolerance !== "number" || !Number.isFinite(tolerance) || tolerance < 0) {
    throw new ConfigError(
      "sdk.bad_config",
      "toleranceSec must be a non-negative number of seconds (0 disables the freshness check)",
      "toleranceSec",
    );
  }

  // --- 1. headers ---
  const tsRaw = headerValue(headers, HEADER_WEBHOOK_TIMESTAMP);
  const sigRaw = headerValue(headers, HEADER_WEBHOOK_SIGNATURE);
  if (tsRaw === undefined || sigRaw === undefined) {
    throw new SignatureError(
      "webhook.missing_header",
      `missing ${HEADER_WEBHOOK_TIMESTAMP} or ${HEADER_WEBHOOK_SIGNATURE}`,
    );
  }
  const sig = normalizeSignature(sigRaw, HEADER_WEBHOOK_SIGNATURE);
  const ts = Number(tsRaw.trim());
  if (!Number.isInteger(ts)) {
    throw new SignatureError("webhook.bad_signature", "timestamp header is not an integer");
  }

  // --- 2. MAC, current secret first, then the rotation overlap ---
  const prevSigRaw = headerValue(headers, HEADER_WEBHOOK_SIGNATURE_PREV);
  const prevSig =
    prevSigRaw === undefined
      ? undefined
      : normalizeSignature(prevSigRaw, HEADER_WEBHOOK_SIGNATURE_PREV);
  // A merchant who has not swapped the stored secret yet verifies the Prev header with it; one who
  // already swapped but kept the old copy verifies the main header with the new secret. Both hold.
  const candidates: Array<[string, string]> = [[sig, secret]];
  if (prevSig) candidates.push([prevSig, secret]);
  if (previousSecret) {
    candidates.push([sig, previousSecret]);
    if (prevSig) candidates.push([prevSig, previousSecret]);
  }
  const ok = candidates.some(([provided, key]) =>
    constantTimeEqual(provided, signWebhook(key, ts, rawBody)),
  );
  if (!ok) throw new SignatureError("webhook.bad_signature", "signature does not match the body");

  // --- 3. freshness, only for a delivery that is already proven authentic ---
  if (tolerance > 0) {
    const now = (options.now ?? (() => Math.floor(Date.now() / 1000)))();
    if (Math.abs(now - ts) > tolerance) {
      throw new SignatureError(
        "webhook.stale_timestamp",
        `delivery timestamp ${ts} is outside the ±${tolerance}s window`,
      );
    }
  }

  // --- 4. body ---
  const eventTimeRaw = headerValue(headers, HEADER_WEBHOOK_EVENT_TIME);
  const event = parseWebhook(rawBody);
  return {
    event,
    isTest: isTrueHeader(headerValue(headers, HEADER_WEBHOOK_TEST)) || isTestEvent(event),
    id: headerValue(headers, HEADER_WEBHOOK_ID),
    eventId: headerValue(headers, HEADER_WEBHOOK_EVENT_ID),
    eventType: headerValue(headers, HEADER_WEBHOOK_EVENT),
    eventTime: eventTimeRaw && /^\d+$/.test(eventTimeRaw.trim()) ? Number(eventTimeRaw) : undefined,
    sentAt: ts,
  };
}

// isTestEvent and isStaleEvent take any event (`object`): an event kind whose model lacks `test` or
// `sequence` still passes, so a new kind in the contract never stops a receiver from compiling.

/** True for rehearsal deliveries (`webhooks.test`, sandbox) — never act on them as if money moved. */
export function isTestEvent(event: object | null | undefined): boolean {
  return (event as { test?: unknown } | null | undefined)?.test === true;
}

/**
 * Parse a (previously verified) delivery body into a typed event. A body that is not usable JSON,
 * or lacks the fields every event carries, raises `webhook.bad_payload` — deliberately NOT a
 * signature error, so a receiver that answers 401 to forged deliveries does not answer 401 to an
 * authentic one it simply could not read.
 */
export function parseWebhook(rawBody: string | Uint8Array): AnyWebhookEvent {
  const text = typeof rawBody === "string" ? rawBody : Buffer.from(rawBody).toString("utf8");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new WebhookPayloadError("delivery body is not JSON", text);
  }
  if (!isRecord(body)) {
    throw new WebhookPayloadError("delivery body is not a JSON object", body);
  }
  if (typeof body.type !== "string" || body.type === "") {
    throw new WebhookPayloadError("delivery body has no `type` string", body);
  }
  const event = body as unknown as AnyWebhookEvent;
  // An event kind from a newer core is handed back verbatim rather than rejected; only the kinds
  // this release models are held to their field types.
  if (isKnownEvent(event)) {
    const idField = EVENT_ID_FIELDS[event.type];
    if (idField !== undefined && typeof body[idField] !== "string") {
      throw new WebhookPayloadError(`"${body.type}" event has no \`${idField}\` string`, body);
    }
  }
  return event;
}

/**
 * The id of the object the event is about — the field `EVENT_ID_FIELDS` (generated from the
 * contract) names for its kind: a payment's `uuid`, a conversion's `id`, … Key per-object state on
 * it, e.g. the last `sequence` for `isStaleEvent`.
 *
 * `undefined` for a kind this release does not know (or one without such a field): acknowledge the
 * delivery, but do not guess which field identifies its object.
 */
export function objectId(event: object | null | undefined): string | undefined {
  if (!isRecord(event) || typeof event.type !== "string") return undefined;
  const field = Object.hasOwn(EVENT_ID_FIELDS, event.type)
    ? EVENT_ID_FIELDS[event.type]
    : undefined;
  const value = field === undefined ? undefined : event[field];
  return typeof value === "string" ? value : undefined;
}

/**
 * Deliveries can arrive out of order (a retried `paid` after a `refund`). Keep the last `sequence`
 * you processed per object and skip anything not newer. Never throws: an event without a usable
 * `sequence` is not stale, because nothing about it can be compared.
 */
export function isStaleEvent(
  event: object | null | undefined,
  lastProcessedSequence: number | undefined | null,
): boolean {
  if (typeof lastProcessedSequence !== "number" || !Number.isInteger(lastProcessedSequence)) {
    return false;
  }
  const sequence = (event as { sequence?: unknown } | null | undefined)?.sequence;
  if (typeof sequence !== "number" || !Number.isInteger(sequence)) return false;
  return sequence <= lastProcessedSequence;
}

function requireSecret(value: unknown, field: string): string {
  if (typeof value !== "string" || value === "") {
    throw new ConfigError(
      "sdk.bad_config",
      `${field} must be a non-empty string; verifying with an empty key would accept any body`,
      field,
    );
  }
  return value;
}

/**
 * Signature headers survive proxies that add whitespace and senders that upper-case hex, but a
 * `0x`-prefixed value is not what the core signs — accepting it would mean accepting a value that
 * never matches, framed as a mismatch the integrator cannot explain.
 */
function normalizeSignature(raw: string, header: string): string {
  const v = raw.trim();
  if (v === "") throw new SignatureError("webhook.bad_signature", `${header} is empty`);
  if (!/^[0-9a-fA-F]+$/.test(v)) {
    throw new SignatureError(
      "webhook.bad_signature",
      `${header} is not hexadecimal (a "0x" prefix is not part of the signature)`,
    );
  }
  return v.toLowerCase();
}

function isTrueHeader(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}
