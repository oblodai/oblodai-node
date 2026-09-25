import { ErrorCode } from "../generated/enums.js";
import { assertNotRedirected, readCapped } from "./body.js";
import { SkewCorrectingClock } from "./clock.js";
import { decodeEnvelope } from "./envelope.js";
import {
  ConfigError,
  ContractError,
  OblodaiError,
  TransportError,
  type ApiError,
} from "./errors.js";
import { redactHeaders, type Hooks, type RequestInfo } from "./hooks.js";
import { assertIdempotencyKey, newIdempotencyKey } from "./idempotency.js";
import { noopLogger, redactingLogger, type Logger } from "./logger.js";
import type { RequestOptions } from "./options.js";
import {
  HEADER_REQUEST_ID,
  buildRequest,
  serializeBody,
  type BuiltRequest,
  type Credentials,
  type Query,
} from "./request.js";
import { DEFAULT_RETRY, retryDelayMs, shouldRetry, type RetryOptions } from "./retry.js";
import { routeLabel, type RouteSpec } from "./route.js";
import {
  INSPECT_CUSTOM,
  REDACTED,
  defineHidden,
  describeCredential,
  protectResponseSecrets,
} from "./secrets.js";
import { HEADER_IDEMPOTENCY_KEY, SIGNATURE_SKEW_SECONDS } from "./signing.js";
import { headerValue, sleep, uuid } from "./util.js";

/**
 * The HTTP engine every resource goes through. One method, `call`, does the whole lifecycle:
 * serialize → sign → fetch (with timeout) → classify the answer → retry per policy. It returns the
 * raw 2xx answer; `unwrapResult` turns an envelope route's answer into its `result`.
 */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Default per-attempt timeout, seconds. */
export const DEFAULT_TIMEOUT = 30;
/** Default budget for a whole call including retries and pauses, seconds. */
export const DEFAULT_DEADLINE = 90;

export interface TransportSettings {
  baseUrl: string;
  userAgent: string;
  /** The merchant's one API key; it signs every `key` route. */
  credentials?: Credentials | undefined;
  fetch?: FetchLike | undefined;
  /** Per-attempt timeout, seconds. */
  timeout?: number | undefined;
  /** Budget for a whole call including retries and pauses, seconds. */
  deadline?: number | undefined;
  retry?: Partial<RetryOptions> | undefined;
  clock?: SkewCorrectingClock | undefined;
  logger?: Logger | undefined;
  /** Extra headers on every request. Never signed material. */
  headers?: Record<string, string> | undefined;
  /** Sent as `X-Admin-Token` on `onboard` routes only. */
  adminToken?: string | undefined;
  hooks?: Hooks | undefined;
}

/** One call: the request itself plus the caller's per-call overrides. */
export interface CallOptions extends RequestOptions {
  body?: unknown;
  query?: Query | undefined;
  pathParams?: Record<string, string | number> | undefined;
}

/** A 2xx answer as it arrived. */
export interface RawResponse {
  status: number;
  headers: Headers;
  body: Uint8Array;
  contentType: string | null;
  /** The `X-Request-ID` this SDK sent with the call. */
  requestId: string;
}

/**
 * Error codes that mean the core rejected the signature because of the timestamp or MAC. Taken
 * from the generated `ErrorCode`, so a code renamed in the contract fails to compile.
 */
const SIGNATURE_FAILURE_CODES: ReadonlySet<string> = new Set<string>([
  ErrorCode.MERCHANT_BAD_SIGNATURE,
  ErrorCode.AUTH_BAD_TIMESTAMP,
]);

/**
 * Response body caps. The SDK buffers the whole body, so an endless or mistargeted stream would
 * otherwise grow until the process dies.
 */
export const MAX_JSON_BODY_BYTES = 8 * 1024 * 1024;
export const MAX_BARE_BODY_BYTES = 64 * 1024 * 1024;

/** undici's timeout codes: the peer was reached (or not) but did not answer in time. */
const TIMEOUT_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "ETIMEDOUT",
]);

interface Resolved {
  baseUrl: string;
  userAgent: string;
  credentials: Credentials | undefined;
  fetch: FetchLike;
  timeout: number;
  deadline: number;
  retry: RetryOptions;
  clock: SkewCorrectingClock;
  logger: Logger;
  headers: Record<string, string> | undefined;
  adminToken: string | undefined;
  hooks: Hooks | undefined;
}

export class Transport {
  /** How retry pauses wait; replaceable in tests to record pauses instead of sleeping. */
  sleep: (ms: number, signal?: AbortSignal) => Promise<void> = sleep;
  declare private readonly s: Resolved;

  constructor(settings: TransportSettings) {
    const f = settings.fetch ?? (globalThis.fetch as FetchLike | undefined);
    if (!f) {
      throw new ConfigError(
        "sdk.bad_config",
        "global fetch is unavailable; pass `fetch` in options (Node >= 20 required)",
      );
    }
    // The settings carry the API key. Non-enumerable so a spread, a key list, `JSON.stringify` or
    // an `inspect` of the transport cannot reach them by walking properties.
    defineHidden(this, "s", {
      baseUrl: settings.baseUrl,
      userAgent: settings.userAgent,
      credentials: settings.credentials,
      fetch: f,
      timeout: positiveSeconds("timeout", settings.timeout ?? DEFAULT_TIMEOUT),
      deadline: positiveSeconds("deadline", settings.deadline ?? DEFAULT_DEADLINE),
      retry: { ...DEFAULT_RETRY, ...settings.retry },
      clock: settings.clock ?? new SkewCorrectingClock(),
      // Wrapped, not trusted: whatever logger the caller injected receives redacted fields only.
      logger: settings.logger ? redactingLogger(settings.logger) : noopLogger,
      headers: settings.headers,
      adminToken: settings.adminToken,
      hooks: settings.hooks,
    } satisfies Resolved);
  }

  get baseUrl(): string {
    return this.s.baseUrl;
  }

  /**
   * A transport with these overridden and everything else shared — the clock (its skew
   * correction), fetch, credentials, hooks. `headers` are merged over the current ones.
   */
  derive(changes: {
    timeout?: number;
    maxRetries?: number;
    headers?: Record<string, string>;
  }): Transport {
    const s = this.s;
    if (
      changes.maxRetries !== undefined &&
      (!Number.isInteger(changes.maxRetries) || changes.maxRetries < 0)
    ) {
      throw new ConfigError(
        "sdk.bad_config",
        "maxRetries must be a non-negative integer",
        "maxRetries",
      );
    }
    const next = new Transport({
      ...s,
      logger: undefined,
      timeout: changes.timeout ?? s.timeout,
      retry:
        changes.maxRetries !== undefined ? { ...s.retry, maxRetries: changes.maxRetries } : s.retry,
      headers: changes.headers ? { ...s.headers, ...changes.headers } : s.headers,
    });
    (next.s as { logger: Logger }).logger = s.logger;
    next.sleep = this.sleep;
    return next;
  }

  /** What this transport is pointed at — never how it proves who it is. */
  toJSON(): Record<string, unknown> {
    const s = this.s;
    return {
      baseUrl: s.baseUrl,
      credentials: describeCredential(s.credentials?.publicId),
      adminToken: s.adminToken ? REDACTED : undefined,
      timeout: s.timeout,
      deadline: s.deadline,
      retry: s.retry,
    };
  }

  /** `console.log(transport)` / `util.inspect` render the same redacted summary as `toJSON`. */
  [INSPECT_CUSTOM](): Record<string, unknown> {
    return { Transport: this.toJSON() };
  }

  /** Call an envelope route and return its decoded `result`. */
  async callResult<T = unknown>(route: RouteSpec, options: CallOptions = {}): Promise<T> {
    return unwrapResult(route, await this.call(route, options)) as T;
  }

  /** Run one call to a 2xx answer, or throw the error it ended with. */
  async call(route: RouteSpec, options: CallOptions = {}): Promise<RawResponse> {
    const s = this.s;
    const label = routeLabel(route);
    let headers = s.headers;
    if (options.extraHeaders) headers = { ...s.headers, ...options.extraHeaders };
    // One id for every attempt: it names the call, not the attempt.
    const requestId = options.requestId ?? headerValue(headers ?? {}, HEADER_REQUEST_ID) ?? uuid();
    try {
      return await this.run(route, options, label, headers, requestId);
    } catch (err) {
      if (err instanceof OblodaiError) err.withRequestId(requestId);
      throw err;
    }
  }

  private async run(
    route: RouteSpec,
    options: CallOptions,
    label: string,
    headers: Record<string, string> | undefined,
    requestId: string,
  ): Promise<RawResponse> {
    const s = this.s;
    const retry =
      options.maxRetries !== undefined ? { ...s.retry, maxRetries: options.maxRetries } : s.retry;
    if (!Number.isInteger(retry.maxRetries) || retry.maxRetries < 0) {
      throw new ConfigError(
        "sdk.bad_config",
        "maxRetries must be a non-negative integer",
        "maxRetries",
      );
    }
    const perAttempt = positiveSeconds("timeout", options.timeout ?? s.timeout);
    const body = serializeBody(options.body, route.method);
    let idempotencyKey = options.idempotencyKey;
    if (idempotencyKey !== undefined) {
      assertIdempotencyKey(idempotencyKey);
      if (!route.idempotent) {
        // The core ignores the header here, so a key would only make the SDK believe a re-send is
        // deduplicated when it is not — the one belief that turns a lost response into a double spend.
        throw new ConfigError(
          "sdk.idempotency_unsupported",
          `${label} does not deduplicate by ${HEADER_IDEMPOTENCY_KEY}; remove idempotencyKey from this call`,
          "idempotencyKey",
        );
      }
    } else if (route.idempotent) {
      idempotencyKey = newIdempotencyKey();
    }
    const safeToRepeat = route.safe || (route.idempotent && idempotencyKey !== undefined);
    const deadline = Date.now() + s.deadline * 1000;

    let attempt = 0;
    let skewTried = false;
    let skewInstalled = 0;
    let skewBefore = 0;
    for (;;) {
      // The offset this attempt is signed with. Compared against the server's own time below —
      // never against the shared offset, which a concurrent call may already have corrected.
      const signedOffset = s.clock.offset;
      const req = buildRequest({
        baseUrl: s.baseUrl,
        route,
        pathParams: options.pathParams,
        query: options.query,
        body,
        credentials: s.credentials,
        idempotencyKey,
        ts: s.clock.now(),
        userAgent: s.userAgent,
        extraHeaders: headers,
        // Never on a signed merchant route: the admin token provisions merchants, and a gateway
        // operator's token must not travel on every call a merchant integration makes.
        adminToken: route.auth === "onboard" ? s.adminToken : undefined,
        requestId,
      });
      s.logger.debug("request", { route: label, attempt, requestId, idempotencyKey });
      const info: RequestInfo = {
        method: req.method,
        url: req.url,
        headers: redactHeaders(req.headers),
        attempt: attempt + 1,
        requestId,
        operationId: route.operationId,
      };
      s.hooks?.onRequest?.(info);
      const sentAt = Date.now();
      const emit = (status: number, h: Headers, error?: unknown) =>
        s.hooks?.onResponse?.({
          request: info,
          status,
          headers: h,
          elapsed: Math.max(0, (Date.now() - sentAt) / 1000),
          ...(error !== undefined ? { error } : {}),
        });

      let raw: RawResponse;
      try {
        raw = await this.send(
          req,
          options.signal,
          Math.min(perAttempt * 1000, Math.max(1, deadline - Date.now())),
          route.bare ? MAX_BARE_BODY_BYTES : MAX_JSON_BODY_BYTES,
          requestId,
        );
      } catch (err) {
        emit(0, new Headers(), err);
        if (shouldRetry(err, { attempt, safeToRepeat }, retry)) {
          await this.pause(err, attempt, retry, options.signal, deadline);
          attempt += 1;
          continue;
        }
        throw err;
      }

      if (raw.status >= 200 && raw.status < 300) {
        emit(raw.status, raw.headers);
        return raw;
      }

      const failure = this.classify(route, raw);
      emit(raw.status, raw.headers, failure);
      s.logger.debug("response", {
        route: label,
        status: raw.status,
        code: failure.code,
        requestId: failure.requestId ?? requestId,
      });

      // Clock skew: the core rejected the timestamp/MAC. Learn its time from the `Date` header,
      // re-sign once, and keep the offset only if that attempt got past authentication.
      if (raw.status === 401 && SIGNATURE_FAILURE_CODES.has(failure.code)) {
        if (!skewTried) {
          const offset = s.clock.observeServerDate(raw.headers.get("date"));
          if (
            offset !== undefined &&
            Math.abs(offset - signedOffset) > SIGNATURE_SKEW_SECONDS / 2
          ) {
            s.logger.warn("clock skew detected; re-signing with server time", {
              route: label,
              offsetSec: offset,
            });
            skewTried = true;
            skewBefore = signedOffset;
            skewInstalled = offset;
            s.clock.correct(offset);
            continue;
          }
        } else {
          // The corrected timestamp did not help, so it was not skew — but only this call's own
          // correction may be undone; a sibling's newer one stays.
          s.clock.revertIfUnchanged(skewInstalled, skewBefore);
        }
      }
      if (shouldRetry(failure, { attempt, safeToRepeat }, retry)) {
        await this.pause(failure, attempt, retry, options.signal, deadline);
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
      if (!decoded.ok) {
        return decoded.error.withRequestId(raw.headers.get(HEADER_REQUEST_ID) ?? undefined);
      }
    } catch (err) {
      if (err instanceof OblodaiError) return err;
      throw err;
    }
    return new ContractError(
      `${routeLabel(route)}: HTTP ${raw.status} with a success envelope`,
      raw.status,
      text,
    );
  }

  private async pause(
    err: unknown,
    attempt: number,
    retry: RetryOptions,
    signal: AbortSignal | undefined,
    deadline: number,
  ): Promise<void> {
    const ms = retryDelayMs(err, { attempt, safeToRepeat: true }, retry);
    if (Date.now() + ms > deadline) {
      throw new TransportError(
        "transport.deadline",
        `retry would exceed the call deadline; last error: ${(err as Error).message}`,
        err,
      );
    }
    if (ms <= 0) return;
    try {
      await this.sleep(ms, signal);
    } catch (abort) {
      throw new TransportError(
        "transport.aborted",
        "request aborted by caller during a retry pause",
        abort,
      );
    }
  }

  private async send(
    req: BuiltRequest,
    signal: AbortSignal | undefined,
    timeoutMs: number,
    maxBytes: number,
    requestId: string,
  ): Promise<RawResponse> {
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        controller.abort(
          new TransportError("transport.timeout", `request timed out after ${timeoutMs / 1000} s`),
        ),
      timeoutMs,
    );
    const onOuterAbort = () =>
      controller.abort(new TransportError("transport.aborted", "request aborted by caller"));
    if (signal) {
      if (signal.aborted) onOuterAbort();
      else signal.addEventListener("abort", onOuterAbort, { once: true });
    }
    try {
      const res = await this.s.fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
        signal: controller.signal,
        redirect: "manual",
      });
      assertNotRedirected(req.url, res);
      // The timeout above is still armed here: it covers reading the body, not just the headers.
      const bytes = await readCapped(res, maxBytes, `${req.method} ${req.url}`);
      return {
        status: res.status,
        headers: res.headers,
        body: bytes,
        contentType: res.headers.get("content-type"),
        requestId,
      };
    } catch (err) {
      if (controller.signal.aborted && controller.signal.reason instanceof TransportError)
        throw controller.signal.reason;
      if (err instanceof OblodaiError) throw err;
      if (isTimeout(err)) {
        throw new TransportError("transport.timeout", `request timed out: ${describe(err)}`, err);
      }
      throw new TransportError("transport.network", `network error: ${describe(err)}`, err);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onOuterAbort);
    }
  }
}

/** Decode a success envelope, surfacing the core's oversized-replay marker as an error. */
export function unwrapResult(route: RouteSpec, raw: RawResponse): unknown {
  const decoded = decodeEnvelope<unknown>(raw.status, Buffer.from(raw.body).toString("utf8"));
  if (!decoded.ok) throw decoded.error; // unreachable: `call` already threw for error statuses
  // The core replays a cached response by idempotency key; when the original was too large to
  // cache it answers {ok, idempotent_replay: true, detail} instead of the object — surface that.
  const r = decoded.result as { idempotent_replay?: unknown; detail?: unknown } | null;
  if (r && typeof r === "object" && r.idempotent_replay === true) {
    throw new ContractError(
      `${routeLabel(route)}: the request was already processed but its response was too large to replay — fetch the result by order_id/reference (${String(r.detail ?? "")})`,
      raw.status,
      r,
    );
  }
  return protectResponseSecrets(decoded.result);
}

function positiveSeconds(name: string, value: number): number {
  if (typeof value !== "number" || !(value > 0)) {
    throw new ConfigError("sdk.bad_config", `${name} must be a positive number of seconds`, name);
  }
  return value;
}

function isTimeout(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && depth < 4; depth++) {
    const x = e as { name?: unknown; code?: unknown; cause?: unknown };
    if (x.name === "TimeoutError") return true;
    if (typeof x.code === "string" && TIMEOUT_CODES.has(x.code)) return true;
    e = x.cause;
  }
  return false;
}

function describe(err: unknown): string {
  const e = err as { message?: unknown; cause?: { message?: unknown; code?: unknown } };
  const base = typeof e?.message === "string" ? e.message : String(err);
  const cause = e?.cause;
  if (cause && (cause.code || cause.message)) {
    return `${base} (${[cause.code, cause.message].filter(Boolean).join(": ")})`;
  }
  return base;
}
