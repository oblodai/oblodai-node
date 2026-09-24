/**
 * Per-call options: the things a single call may override. Every generated method takes them as
 * its last argument; anything left out falls back to the client's setting.
 */
export interface RequestOptions {
  /**
   * Your own idempotency key. Generated automatically on routes the core deduplicates, rejected
   * (`sdk.idempotency_unsupported`) on routes it does not — except where the route itself takes an
   * `idempotency_key` field, which this option then fills.
   */
  idempotencyKey?: string | undefined;
  /** Per-attempt timeout, seconds (capped by the client's `deadline` for the whole call). */
  timeout?: number | undefined;
  /** Retries after the first attempt for this call; overrides `retry.maxRetries`. */
  maxRetries?: number | undefined;
  /** Extra headers for this call alone, merged over the client's own. */
  extraHeaders?: Record<string, string> | undefined;
  /** Sent as `X-Request-ID` to tie your logs to ours; a UUID is generated when omitted. */
  requestId?: string | undefined;
  /** Abort the call (and any retry pause) from the outside. */
  signal?: AbortSignal | undefined;
}

/** `b` over `a`; headers are merged, not replaced. */
export function mergeOptions(
  a: RequestOptions | undefined,
  b: RequestOptions | undefined,
): RequestOptions {
  if (!a) return { ...b };
  if (!b) return { ...a };
  const out: RequestOptions = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  if (a.extraHeaders || b.extraHeaders) out.extraHeaders = { ...a.extraHeaders, ...b.extraHeaders };
  return out;
}
