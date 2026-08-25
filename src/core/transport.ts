import type { RouteSpec } from "../contract/types.js";
import { SkewCorrectingClock } from "./clock.js";
import { decodeEnvelope } from "./envelope.js";
import { ContractError, OblodaiError, TransportError, type ApiError } from "./errors.js";
import { assertIdempotencyKey, newIdempotencyKey } from "./idempotency.js";
import { noopLogger, type Logger } from "./logger.js";
import { buildRequest, serializeBody, type Credentials, type Query } from "./request.js";
import { DEFAULT_RETRY, retryDelayMs, shouldRetry, type RetryOptions } from "./retry.js";
import { SIGNATURE_SKEW_SECONDS } from "./signing.js";
import { sleep } from "./util.js";

/**
 * The HTTP engine every resource goes through. One method, `call`, does the whole lifecycle:
 * serialize → sign → fetch (with timeout) → decode envelope → classify error → retry per policy.
 * `callRaw` serves the few `bare` routes that return bytes instead of JSON (PDF documents).
 */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface TransportOptions {
  baseUrl: string;
  /** Used for `payment`/`any` routes, and for `payout` routes when no payout credentials exist. */
  credentials?: Credentials;
  /** Optional second key pair for `payout` routes (the core issues separate key kinds). */
  payoutCredentials?: Credentials;
  fetch?: FetchLike;
  timeoutMs?: number;
  retry?: Partial<RetryOptions>;
  clock?: SkewCorrectingClock;
  logger?: Logger;
  userAgent: string;
  /** Extra headers on every request (e.g. a platform token). Never signed material. */
  headers?: Record<string, string>;
}

export interface CallOptions {
  body?: unknown;
  query?: Query;
  pathParams?: Record<string, string | number>;
  /** Supply your own key to make the call idempotent across process restarts. */
  idempotencyKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface RawResponse {
  status: number;
  headers: Headers;
  body: Uint8Array;
  contentType: string | null;
}

export class Transport {
  private readonly fetchImpl: FetchLike;
  private readonly retry: RetryOptions;
  private readonly clock: SkewCorrectingClock;
  private readonly logger: Logger;
  private readonly timeoutMs: number;

  constructor(private readonly opts: TransportOptions) {
    const f = opts.fetch ?? (globalThis.fetch as FetchLike | undefined);
    if (!f)
      throw new ContractError(
        "global fetch is unavailable; pass `fetch` in options (Node >= 18 required)",
        0,
      );
    this.fetchImpl = f;
    this.retry = { ...DEFAULT_RETRY, ...opts.retry };
    this.clock = opts.clock ?? new SkewCorrectingClock();
    this.logger = opts.logger ?? noopLogger;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  /** Call an envelope route and return its `result`. */
  async call<T>(route: RouteSpec, options: CallOptions = {}): Promise<T> {
    const raw = await this.execute(route, options);
    const text = Buffer.from(raw.body).toString("utf8");
    const decoded = decodeEnvelope<T>(raw.status, text);
    if (decoded.ok) return decoded.result;
    throw decoded.error; // unreachable: execute() already threw for error envelopes
  }

  /** Call a `bare` route and return the response bytes (status already checked to be 2xx). */
  async callRaw(route: RouteSpec, options: CallOptions = {}): Promise<RawResponse> {
    return this.execute(route, options);
  }

  private credentialsFor(route: RouteSpec): Credentials | undefined {
    if (route.auth === "payout") return this.opts.payoutCredentials ?? this.opts.credentials;
    return this.opts.credentials;
  }

  private async execute(route: RouteSpec, options: CallOptions): Promise<RawResponse> {
    const body = serializeBody(options.body, route.method);
    let idempotencyKey = options.idempotencyKey;
    if (idempotencyKey !== undefined) assertIdempotencyKey(idempotencyKey);
    else if (route.idempotent) idempotencyKey = newIdempotencyKey();
    const safeToRepeat = route.safe || idempotencyKey !== undefined;

    let attempt = 0;
    let skewCorrected = false;
    for (;;) {
      const req = buildRequest({
        baseUrl: this.opts.baseUrl,
        route,
        pathParams: options.pathParams,
        query: options.query,
        body,
        credentials: this.credentialsFor(route),
        idempotencyKey,
        ts: this.clock.now(),
        userAgent: this.opts.userAgent,
        extraHeaders: this.opts.headers,
      });
      this.logger.debug("request", { method: req.method, url: req.url, attempt, idempotencyKey });

      let raw: RawResponse;
      try {
        raw = await this.send(req, options);
      } catch (err) {
        if (shouldRetry(err, { attempt, safeToRepeat }, this.retry)) {
          await this.pause(err, attempt, options.signal);
          attempt += 1;
          continue;
        }
        throw err;
      }

      if (raw.status >= 200 && raw.status < 300) return raw;

      const failure = this.classify(route, raw);
      // Clock skew: the core saw a timestamp outside its window. Learn the server time from the
      // `Date` header and re-sign once; this is a correction, not a retry, so it is free.
      if (failure.httpStatus === 401 && !skewCorrected) {
        const offset = this.clock.observeServerDate(raw.headers.get("date"));
        if (
          offset !== undefined &&
          Math.abs(offset - this.clock.offset) > SIGNATURE_SKEW_SECONDS / 2
        ) {
          this.logger.warn("clock skew detected; re-signing with server time", {
            offsetSec: offset,
          });
          this.clock.correct(offset);
          skewCorrected = true;
          continue;
        }
      }
      if (shouldRetry(failure, { attempt, safeToRepeat }, this.retry)) {
        this.logger.debug("retrying", { code: failure.code, status: failure.httpStatus, attempt });
        await this.pause(failure, attempt, options.signal);
        attempt += 1;
        continue;
      }
      throw failure;
    }
  }

  private classify(route: RouteSpec, raw: RawResponse): ApiError | OblodaiError {
    const text = Buffer.from(raw.body).toString("utf8");
    try {
      const decoded = decodeEnvelope(raw.status, text);
      if (!decoded.ok) return decoded.error;
    } catch (err) {
      if (err instanceof OblodaiError) return err;
      throw err;
    }
    // A 2xx-less status with a success envelope cannot happen; treat it as a contract breach.
    return new ContractError(
      `${route.method} ${route.path}: HTTP ${raw.status} with a success envelope`,
      raw.status,
      text,
    );
  }

  private async pause(err: unknown, attempt: number, signal?: AbortSignal): Promise<void> {
    const ms = retryDelayMs(err, { attempt, safeToRepeat: true }, this.retry);
    if (ms > 0) await sleep(ms, signal);
  }

  private async send(
    req: { url: string; method: string; headers: Record<string, string>; body: string | undefined },
    options: CallOptions,
  ): Promise<RawResponse> {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const timer = setTimeout(
      () =>
        controller.abort(
          new TransportError("transport.timeout", `request timed out after ${timeoutMs} ms`),
        ),
      timeoutMs,
    );
    const onOuterAbort = () =>
      controller.abort(new TransportError("transport.aborted", "request aborted by caller"));
    if (options.signal) {
      if (options.signal.aborted) onOuterAbort();
      else options.signal.addEventListener("abort", onOuterAbort, { once: true });
    }
    try {
      const res = await this.fetchImpl(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
        signal: controller.signal,
        redirect: "manual",
      });
      const bytes = new Uint8Array(await res.arrayBuffer());
      return {
        status: res.status,
        headers: res.headers,
        body: bytes,
        contentType: res.headers.get("content-type"),
      };
    } catch (err) {
      if (controller.signal.aborted && controller.signal.reason instanceof TransportError)
        throw controller.signal.reason;
      if (err instanceof OblodaiError) throw err;
      throw new TransportError(
        "transport.network",
        `network error: ${(err as Error)?.message ?? String(err)}`,
        err,
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onOuterAbort);
    }
  }
}
