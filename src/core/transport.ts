import type { RouteSpec } from "../contract/types.js";
import { SkewCorrectingClock } from "./clock.js";
import { decodeEnvelope } from "./envelope.js";
import {
  ConfigError,
  ContractError,
  OblodaiError,
  TransportError,
  type ApiError,
} from "./errors.js";
import { assertIdempotencyKey, newIdempotencyKey } from "./idempotency.js";
import { noopLogger, redact, type Logger } from "./logger.js";
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
  /** Per-attempt timeout, ms. Default 30000. */
  timeoutMs?: number;
  /** Overall budget for a call including retries and pauses, ms. Default 90000. */
  deadlineMs?: number;
  retry?: Partial<RetryOptions>;
  clock?: SkewCorrectingClock;
  logger?: Logger;
  userAgent: string;
  /** Extra headers on every request (e.g. a platform token). Never signed material. */
  headers?: Record<string, string>;
  /** Sent as `X-Admin-Token` on `onboard` routes only. */
  adminToken?: string;
}

export interface CallOptions {
  body?: unknown;
  query?: Query;
  pathParams?: Record<string, string | number>;
  /** Supply your own key to make the call idempotent across process restarts. */
  idempotencyKey?: string;
  /** Prefer the payout key pair on an `any`-gated route. */
  preferPayoutKey?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
  deadlineMs?: number;
}

export interface RawResponse {
  status: number;
  headers: Headers;
  body: Uint8Array;
  contentType: string | null;
}

/** Error codes that mean the core rejected the signature because of the timestamp or MAC. */
const SIGNATURE_FAILURE_CODES = new Set(["merchant.bad_signature", "auth.bad_timestamp"]);

export class Transport {
  private readonly fetchImpl: FetchLike;
  private readonly retry: RetryOptions;
  private readonly clock: SkewCorrectingClock;
  private readonly logger: Logger;
  private readonly timeoutMs: number;
  private readonly deadlineMs: number;

  constructor(private readonly opts: TransportOptions) {
    const f = opts.fetch ?? (globalThis.fetch as FetchLike | undefined);
    if (!f)
      throw new ConfigError(
        "sdk.bad_config",
        "global fetch is unavailable; pass `fetch` in options (Node >= 18.17 required)",
      );
    this.fetchImpl = f;
    this.retry = { ...DEFAULT_RETRY, ...opts.retry };
    this.clock = opts.clock ?? new SkewCorrectingClock();
    this.logger = opts.logger ?? noopLogger;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.deadlineMs = opts.deadlineMs ?? 90_000;
  }

  /** Call an envelope route and return its `result`. */
  async call<T>(route: RouteSpec, options: CallOptions = {}): Promise<T> {
    const raw = await this.execute(route, options);
    const decoded = decodeEnvelope<T>(raw.status, Buffer.from(raw.body).toString("utf8"));
    if (decoded.ok) {
      // The core replays a cached response by Idempotency-Key; when the original was too large to
      // cache it answers {ok, idempotent_replay: true, detail} instead of the object — surface that.
      const r = decoded.result as { idempotent_replay?: unknown; detail?: unknown } | null;
      if (r && typeof r === "object" && r.idempotent_replay === true) {
        throw new ContractError(
          `${route.method} ${route.path}: the request was already processed but its response was too large to replay — fetch the result by order_id/reference (${String(r.detail ?? "")})`,
          raw.status,
          r,
        );
      }
      return decoded.result;
    }
    throw decoded.error; // unreachable: execute() already threw for error statuses
  }

  /** Call a `bare` route and return the response bytes (status already checked to be 2xx). */
  async callRaw(route: RouteSpec, options: CallOptions = {}): Promise<RawResponse> {
    return this.execute(route, options);
  }

  /** Which key pair signs a route. `any` routes take the payment key unless told otherwise. */
  private credentialsFor(route: RouteSpec, preferPayout: boolean): Credentials | undefined {
    if (route.auth === "payout" || (route.auth === "any" && preferPayout)) {
      return this.opts.payoutCredentials ?? this.opts.credentials;
    }
    return this.opts.credentials;
  }

  private async execute(route: RouteSpec, options: CallOptions): Promise<RawResponse> {
    const body = serializeBody(options.body, route.method);
    let idempotencyKey = options.idempotencyKey;
    if (idempotencyKey !== undefined) {
      assertIdempotencyKey(idempotencyKey);
      if (!route.idempotent) {
        // The core ignores the header here, so a key would only make the SDK believe a re-send is
        // deduplicated when it is not — the one belief that turns a lost response into a double spend.
        throw new ConfigError(
          "sdk.idempotency_unsupported",
          `${route.method} ${route.path} does not deduplicate by Idempotency-Key; remove idempotencyKey from this call`,
          "idempotencyKey",
        );
      }
    } else if (route.idempotent) {
      idempotencyKey = newIdempotencyKey();
    }
    const safeToRepeat = route.safe || (route.idempotent && idempotencyKey !== undefined);
    const deadline = Date.now() + (options.deadlineMs ?? this.deadlineMs);
    const label = `${route.method} ${route.path}`;

    let attempt = 0;
    let skewTried = false;
    let skewBefore = 0;
    for (;;) {
      const req = buildRequest({
        baseUrl: this.opts.baseUrl,
        route,
        pathParams: options.pathParams,
        query: options.query,
        body,
        credentials: this.credentialsFor(route, options.preferPayoutKey ?? false),
        idempotencyKey,
        ts: this.clock.now(),
        userAgent: this.opts.userAgent,
        extraHeaders:
          route.auth === "onboard" && this.opts.adminToken
            ? { ...this.opts.headers, "X-Admin-Token": this.opts.adminToken }
            : this.opts.headers,
      });
      this.logger.debug("request", { route: label, attempt, idempotencyKey });

      let raw: RawResponse;
      try {
        raw = await this.send(req, options, deadline);
      } catch (err) {
        if (shouldRetry(err, { attempt, safeToRepeat }, this.retry)) {
          await this.pause(err, attempt, options.signal, deadline);
          attempt += 1;
          continue;
        }
        throw err;
      }

      if (raw.status >= 200 && raw.status < 300) return raw;

      const failure = this.classify(route, raw);
      this.logger.debug(
        "response",
        redact({
          route: label,
          status: raw.status,
          code: failure.code,
          requestId: failure.requestId,
        }),
      );

      // Clock skew: the core rejected the timestamp/MAC. Learn its time from the `Date` header,
      // re-sign once, and keep the offset only if that attempt got past authentication.
      if (raw.status === 401 && SIGNATURE_FAILURE_CODES.has(failure.code)) {
        if (!skewTried) {
          const offset = this.clock.observeServerDate(raw.headers.get("date"));
          if (
            offset !== undefined &&
            Math.abs(offset - this.clock.offset) > SIGNATURE_SKEW_SECONDS / 2
          ) {
            this.logger.warn("clock skew detected; re-signing with server time", {
              route: label,
              offsetSec: offset,
            });
            skewTried = true;
            skewBefore = this.clock.offset;
            this.clock.correct(offset);
            continue;
          }
        } else {
          this.clock.correct(skewBefore); // the corrected timestamp did not help: it was not skew
        }
      }
      if (shouldRetry(failure, { attempt, safeToRepeat }, this.retry)) {
        await this.pause(failure, attempt, options.signal, deadline);
        attempt += 1;
        continue;
      }
      throw failure;
    }
  }

  private classify(route: RouteSpec, raw: RawResponse): ApiError | OblodaiError {
    const text = Buffer.from(raw.body).toString("utf8");
    try {
      const decoded = decodeEnvelope(raw.status, text, {
        retryAfter: raw.headers.get("retry-after"),
        location: raw.headers.get("location"),
      });
      if (!decoded.ok) return decoded.error;
    } catch (err) {
      if (err instanceof OblodaiError) return err;
      throw err;
    }
    return new ContractError(
      `${route.method} ${route.path}: HTTP ${raw.status} with a success envelope`,
      raw.status,
      text,
    );
  }

  private async pause(
    err: unknown,
    attempt: number,
    signal: AbortSignal | undefined,
    deadline: number,
  ): Promise<void> {
    const ms = retryDelayMs(err, { attempt, safeToRepeat: true }, this.retry);
    if (Date.now() + ms > deadline) {
      throw new TransportError(
        "transport.deadline",
        `retry would exceed the call deadline; last error: ${(err as Error).message}`,
        err,
      );
    }
    if (ms <= 0) return;
    try {
      await sleep(ms, signal);
    } catch (abort) {
      throw new TransportError(
        "transport.aborted",
        "request aborted by caller during a retry pause",
        abort,
      );
    }
  }

  private async send(
    req: { url: string; method: string; headers: Record<string, string>; body: string | undefined },
    options: CallOptions,
    deadline: number,
  ): Promise<RawResponse> {
    const controller = new AbortController();
    const timeoutMs = Math.min(
      options.timeoutMs ?? this.timeoutMs,
      Math.max(1, deadline - Date.now()),
    );
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
