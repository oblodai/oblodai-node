import { MAX_IDEMPOTENCY_KEY_LENGTH } from "../generated/signing.js";
import { ConfigError } from "./errors.js";
import { uuid } from "./util.js";

/**
 * Idempotency keys. On create-type routes the core caches the first response per key for the
 * merchant and replays it on retries; a different body under the same key is a 409
 * `idempotency.key_reused`. The SDK generates a key once per logical call and reuses it on every
 * retry, so a timeout never turns into a double payout.
 */
export { MAX_IDEMPOTENCY_KEY_LENGTH };

export function newIdempotencyKey(): string {
  return uuid();
}

/** Validate a caller-supplied key before it is signed and sent. */
export function assertIdempotencyKey(key: string): void {
  if (typeof key !== "string" || key.length === 0) {
    throw sdkInvalid("idempotencyKey must be a non-empty string");
  }
  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw sdkInvalid(`idempotencyKey is too long (max ${MAX_IDEMPOTENCY_KEY_LENGTH} chars)`);
  }
  // Header values must be visible ASCII: the key is signed verbatim, so a stray control char or
  // surrounding whitespace would silently change the MAC on one side only.
  if (!/^[\x21-\x7e]+$/.test(key)) {
    throw sdkInvalid("idempotencyKey must be printable ASCII without spaces");
  }
}

// A key the SDK refuses is a caller mistake caught before anything is sent — a ConfigError, like
// every other pre-flight refusal. A ValidationError would claim the API answered 400, and callers
// branch on that difference.
function sdkInvalid(message: string): ConfigError {
  return new ConfigError("sdk.bad_idempotency_key", message, "idempotencyKey");
}
