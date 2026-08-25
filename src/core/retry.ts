import { OblodaiError, TransportError } from "./errors.js";

/**
 * Retry policy. Two questions decide every retry:
 *
 * 1. Can it succeed? — the core's `retryable` flag (authoritative when the core wrote the envelope),
 *    or a transient status for answers that carry no envelope.
 * 2. Is repeating safe? — only for read-only routes and for writes the core deduplicates by
 *    Idempotency-Key. A write the core does not deduplicate is never re-sent once it MAY have
 *    reached the core: a transport error or a proxy 503 after the request left the socket could
 *    mean the payout already happened.
 *
 * An envelope error on an unsafe write is still retried when `retryable` — the core answered, so it
 * did not perform the operation (429/503/frozen/maturing all fail before any effect).
 * `Retry-After` always wins over the computed backoff; otherwise exponential backoff with jitter.
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
  if (!err.retryable) return false;
  if (err instanceof TransportError) return ctx.safeToRepeat;
  // No core envelope: something in front of the core answered; the core may have done the work.
  if (err.synthetic) return ctx.safeToRepeat;
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
  // Full jitter with a floor so a burst of retries never lands in the same instant.
  return Math.max(Math.floor(exp / 4), Math.floor(random() * exp));
}
