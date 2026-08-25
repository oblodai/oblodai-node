import { createHmac } from "node:crypto";

/**
 * Request signing — the exact recipe the core verifies (`crypto.SignRequest`):
 *
 *   canonical = ts "\n" METHOD "\n" requestURI "\n" idempotencyKey "\n" body
 *   signature = hex(HMAC-SHA256(secret, canonical))
 *
 * - `ts` is unix seconds; the core accepts ±300 s of skew.
 * - `requestURI` is path + raw query (`/v1/x?limit=1`), never the origin.
 * - The idempotency slot is the empty string when no `Idempotency-Key` header is sent.
 * - `body` is the byte-exact request body; GETs sign an empty body.
 *
 * Pure: no clock, no I/O. Vectors in test/unit/signing.test.ts come from the core test suite.
 */
export interface SignInput {
  /** Unix timestamp in seconds, as sent in `X-Timestamp`. */
  ts: number;
  /** Upper-case HTTP method. */
  method: string;
  /** Path plus raw query string, exactly as the request line carries it. */
  requestUri: string;
  /** Value of the `Idempotency-Key` header, or empty/undefined when absent. */
  idempotencyKey?: string;
  /** Request body bytes (already-serialized JSON, or empty). */
  body: string | Uint8Array;
}

export function canonicalString(input: SignInput): string {
  const body =
    typeof input.body === "string" ? input.body : Buffer.from(input.body).toString("utf8");
  return `${input.ts}\n${input.method.toUpperCase()}\n${input.requestUri}\n${input.idempotencyKey ?? ""}\n${body}`;
}

export function signRequest(secret: string, input: SignInput): string {
  const mac = createHmac("sha256", Buffer.from(secret, "utf8"));
  mac.update(
    `${input.ts}\n${input.method.toUpperCase()}\n${input.requestUri}\n${input.idempotencyKey ?? ""}\n`,
  );
  mac.update(typeof input.body === "string" ? Buffer.from(input.body, "utf8") : input.body);
  return mac.digest("hex");
}

/**
 * Webhook signature — `webhook.Sign` on the core side:
 *
 *   signature = hex(HMAC-SHA256(secret, "<unix ts>." + payload))
 *
 * The payload is signed verbatim, so verifiers must use the raw request bytes, never a re-encoded
 * parse of them.
 */
export function signWebhook(secret: string, ts: number, payload: string | Uint8Array): string {
  const mac = createHmac("sha256", Buffer.from(secret, "utf8"));
  mac.update(`${ts}.`);
  mac.update(typeof payload === "string" ? Buffer.from(payload, "utf8") : payload);
  return mac.digest("hex");
}

/** Signed request headers as the core reads them. */
export const HEADER_PUBLIC_ID = "X-Public-Id";
export const HEADER_SIGNATURE = "X-Signature";
export const HEADER_TIMESTAMP = "X-Timestamp";
export const HEADER_IDEMPOTENCY_KEY = "Idempotency-Key";

/** Accepted clock skew on the core side, in seconds. */
export const SIGNATURE_SKEW_SECONDS = 300;
