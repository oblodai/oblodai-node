import { OblodaiError, TransportError } from "./errors.js";

/**
 * Retry policy. The decision is driven by the core's `retryable` flag (carried on every
 * OblodaiError), never by the HTTP status alone, and by whether re-sending is safe:
 *
 * - an API error is retried only when `retryable` is true;
 * - a transport error (no response) is retried only when the request is safe to repeat — a
 *   read-only route, or a write carrying an Idempotency-Key the core will deduplicate on;
 * - `Retry-After` / `retry_after` always wins over the computed backoff;
 * - otherwise: exponential backoff with full jitter, capped.
 */
export interface RetryOptions {
  /** Maximum number of retries after the first attempt. Default 2. */
  maxRetries: number;
  /** Base delay for the first retry, ms. Default 250. */
  baseDelayMs: number;
  /** Upper bound for a computed (non-Retry-After) delay, ms. Default 4000. */
  maxDelayMs: number;
  /** Upper bound honored for a server-provided Retry-After, ms. Default 30000. */
  maxRetryAfterMs: number;
}

export const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 2,
  baseDelayMs: 250,
  maxDelayMs: 4000,
  maxRetryAfterMs: 30_000,
};

export interface RetryContext {
  /** 0 for the first retry decision (i.e. after attempt #1 failed). */
  attempt: number;
  /** True when re-sending cannot duplicate a side effect. */
  safeToRepeat: boolean;
}

export function shouldRetry(err: unknown, ctx: RetryContext, opts: RetryOptions): boolean {
  if (ctx.attempt >= opts.maxRetries) return false;
  if (!(err instanceof OblodaiError)) return false;
  if (err instanceof TransportError) return err.retryable && ctx.safeToRepeat;
  if (!err.retryable) return false;
  // A retryable API error on an unsafe write: the core has answered, so it has NOT performed the
  // operation (429/503/frozen/maturing all fail before any effect) — repeating is fine.
  return true;
}

/** Delay before the next attempt, in ms. `random` is injectable for deterministic tests. */
export function retryDelayMs(
  err: unknown,
  ctx: RetryContext,
  opts: RetryOptions,
  random: () => number = Math.random,
): number {
  if (err instanceof OblodaiError && err.retryAfter !== undefined && err.retryAfter > 0) {
    return Math.min(err.retryAfter * 1000, opts.maxRetryAfterMs);
  }
  const exp = Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** ctx.attempt);
  return Math.floor(random() * exp);
}
