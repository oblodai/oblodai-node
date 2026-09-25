import { createHmac, type Hmac } from "node:crypto";
import {
  REQUEST_CANONICAL_ORDER,
  REQUEST_CANONICAL_SEPARATOR,
  SKEW_SECONDS,
  WEBHOOK_CANONICAL_ORDER,
  WEBHOOK_CANONICAL_SEPARATOR,
} from "../generated/signing.js";

/**
 * Request signing — the exact recipe the core verifies (`crypto.SignRequest`), generated from the
 * contract's `x-oblodai-signing` (`src/generated/signing.ts`):
 *
 *   canonical = the parts of REQUEST_CANONICAL_ORDER, in order, joined by REQUEST_CANONICAL_SEPARATOR
 *   signature = hex(HMAC-SHA256(secret, canonical))
 *
 * - `ts` is unix seconds; the core accepts ±SKEW_SECONDS of skew.
 * - `request_uri` is path + raw query (`/v1/x?limit=1`), never the origin.
 * - The `idempotency_key` part is the empty string when no idempotency key header is sent.
 * - `body` is the byte-exact request body; GETs sign an empty body.
 *
 * Pure: no clock, no I/O. Vectors in test/unit/signing.test.ts come from the core test suite.
 */
export interface SignInput {
  /** Unix timestamp in seconds, as sent in the `HEADER_TIMESTAMP` header. */
  ts: number;
  /** Upper-case HTTP method. */
  method: string;
  /** Path plus raw query string, exactly as the request line carries it. */
  requestUri: string;
  /** Value of the `HEADER_IDEMPOTENCY_KEY` header, or empty/undefined when absent. */
  idempotencyKey?: string;
  /** Request body bytes (already-serialized JSON, or empty). */
  body: string | Uint8Array;
}

type Part = string | Uint8Array;

/** Each part of the request canonical string, by the name the contract gives it. */
function requestParts(input: SignInput): Record<(typeof REQUEST_CANONICAL_ORDER)[number], Part> {
  return {
    ts: String(input.ts),
    METHOD: input.method.toUpperCase(),
    request_uri: input.requestUri,
    idempotency_key: input.idempotencyKey ?? "",
    body: input.body,
  };
}

const text = (part: Part): string =>
  typeof part === "string" ? part : Buffer.from(part).toString("utf8");

/** Feed the parts in contract order, separated, into the MAC — the body bytes as they are. */
function feed(
  mac: Hmac,
  order: readonly string[],
  parts: Record<string, Part>,
  separator: string,
): Hmac {
  order.forEach((name, i) => {
    if (i > 0) mac.update(separator);
    const part = parts[name]!;
    mac.update(typeof part === "string" ? Buffer.from(part, "utf8") : part);
  });
  return mac;
}

export function canonicalString(input: SignInput): string {
  const parts = requestParts(input);
  return REQUEST_CANONICAL_ORDER.map((name) => text(parts[name])).join(REQUEST_CANONICAL_SEPARATOR);
}

export function signRequest(secret: string, input: SignInput): string {
  const mac = createHmac("sha256", Buffer.from(secret, "utf8"));
  return feed(
    mac,
    REQUEST_CANONICAL_ORDER,
    requestParts(input),
    REQUEST_CANONICAL_SEPARATOR,
  ).digest("hex");
}

/**
 * Webhook signature — `webhook.Sign` on the core side:
 *
 *   signature = hex(HMAC-SHA256(secret, WEBHOOK_CANONICAL_ORDER joined by WEBHOOK_CANONICAL_SEPARATOR))
 *
 * `ts` is the delivery's unix seconds. The payload is signed verbatim, so verifiers must use the raw
 * request bytes, never a re-encoded parse of them.
 */
export function signWebhook(secret: string, ts: number, payload: string | Uint8Array): string {
  const mac = createHmac("sha256", Buffer.from(secret, "utf8"));
  const parts: Record<(typeof WEBHOOK_CANONICAL_ORDER)[number], Part> = { ts: String(ts), payload };
  return feed(mac, WEBHOOK_CANONICAL_ORDER, parts, WEBHOOK_CANONICAL_SEPARATOR).digest("hex");
}

/** Signed request headers as the core reads them — names from the contract. */
export {
  HEADER_IDEMPOTENCY_KEY,
  HEADER_PUBLIC_ID,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
} from "../generated/signing.js";

/** Accepted clock skew on the core side, in seconds. */
export const SIGNATURE_SKEW_SECONDS = SKEW_SECONDS;
