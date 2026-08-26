import type { ErrorCode } from "../contract/enums.js";

/**
 * Error model. One family, `OblodaiError`, mirrors the core's error envelope:
 *
 *   { "error": { "code", "message", "field"?, "retryable", "retry_after"?, "request_id"? } }
 *
 * `retryable` is authoritative when the core wrote the envelope: it is the core's own classification
 * of the failure. A response without an envelope (a proxy 502, an HTML 503) is `synthetic` — the
 * core never saw or never answered the request — and is retried only when repeating is safe.
 * Subclasses exist for `instanceof` ergonomics; the discriminator is always `code`.
 */
export interface ErrorDetail {
  code: string;
  message?: string;
  field?: string;
  retryable?: boolean;
  retry_after?: number;
  request_id?: string;
}

/** Codes the SDK itself raises before or instead of a request. */
export type SdkErrorCode =
  | "sdk.missing_credentials"
  | "sdk.bad_config"
  | "sdk.bad_idempotency_key"
  | "sdk.idempotency_unsupported"
  | "sdk.bad_envelope"
  | "sdk.bad_path_param"
  | "sdk.bad_header"
  | "sdk.response_too_large"
  | "sdk.bad_amount";

export type AnyErrorCode =
  ErrorCode | SdkErrorCode | TransportErrorCode | WebhookErrorCode | (string & {});
export type TransportErrorCode =
  "transport.timeout" | "transport.network" | "transport.aborted" | "transport.deadline";
/** Signature-family webhook failures: answer 401 to these and the sender will stop. */
export type WebhookErrorCode =
  "webhook.bad_signature" | "webhook.stale_timestamp" | "webhook.missing_header";

export interface OblodaiErrorInit {
  code: AnyErrorCode;
  message: string;
  httpStatus: number;
  retryable: boolean;
  retryAfter?: number;
  requestId?: string;
  field?: string;
  /** True when no core envelope was present (proxy/LB answer, empty body). */
  synthetic?: boolean;
  /** The decoded error body (or raw text when the body was not JSON). Not serialized by toJSON. */
  raw?: unknown;
  cause?: unknown;
}

export class OblodaiError extends Error {
  /** Stable machine code (`family.reason`), e.g. `payout.insufficient_funds`. Autocompletes; unknown codes still type. */
  readonly code: AnyErrorCode;
  /** HTTP status, or 0 when no response was received. */
  readonly httpStatus: number;
  /** Whether repeating the identical request can succeed later. */
  readonly retryable: boolean;
  /** Seconds to wait before retrying, when the core (or a Retry-After header) provided a hint. */
  readonly retryAfter?: number;
  /** Server-side request id — quote it when contacting support. */
  readonly requestId?: string;
  /** The request field the error refers to, for validation failures. */
  readonly field?: string;
  /** No core envelope: the answer came from something in front of the core. */
  readonly synthetic: boolean;
  /** Raw body, non-enumerable so loggers do not dump it. */
  readonly raw?: unknown;

  constructor(init: OblodaiErrorInit) {
    super(init.message, init.cause !== undefined ? { cause: init.cause } : undefined);
    this.name = new.target.name;
    this.code = init.code;
    this.httpStatus = init.httpStatus;
    this.retryable = init.retryable;
    this.retryAfter = init.retryAfter;
    this.requestId = init.requestId;
    this.field = init.field;
    this.synthetic = init.synthetic ?? false;
    Object.defineProperty(this, "raw", { value: init.raw, enumerable: false, writable: false });
  }

  /** Code family (`payout` in `payout.insufficient_funds`). */
  get family(): string {
    const dot = this.code.indexOf(".");
    return dot < 0 ? this.code : this.code.slice(0, dot);
  }

  /** Structured-logger friendly: keeps the message, drops the raw body. */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      httpStatus: this.httpStatus,
      retryable: this.retryable,
      retryAfter: this.retryAfter,
      requestId: this.requestId,
      field: this.field,
    };
  }
}

/** The request never produced an HTTP response: DNS, TCP, TLS, timeout, abort, deadline. */
export class TransportError extends OblodaiError {
  constructor(code: TransportErrorCode, message: string, cause?: unknown) {
    super({
      code,
      message,
      httpStatus: 0,
      retryable: code === "transport.timeout" || code === "transport.network",
      cause,
    });
  }
}

/** Raised before any request is sent: bad options, missing credentials, unusable arguments. */
export class ConfigError extends OblodaiError {
  constructor(code: SdkErrorCode, message: string, field?: string) {
    super({ code, message, httpStatus: 0, retryable: false, field });
  }
}

/** The core (or something in front of it) answered with an error status. */
export class ApiError extends OblodaiError {}

/** 400 — the request is malformed or violates a business rule; see `field` and `code`. */
export class ValidationError extends ApiError {}
/** 401 — bad signature, unknown key, clock skew, IP not in the allow-list. */
export class AuthenticationError extends ApiError {}
/** 403 — the key is valid but not allowed to do this (wrong key kind, feature disabled). */
export class PermissionError extends ApiError {}
/** 404 — the referenced object does not exist for this merchant. */
export class NotFoundError extends ApiError {}
/** 409 — state or idempotency conflict. */
export class ConflictError extends ApiError {}
/** 409 `idempotency.key_reused` — the same key was used with a different request body. */
export class IdempotencyConflictError extends ConflictError {}
/** 429 — rate limited; `retryAfter` is set. */
export class RateLimitError extends ApiError {}
/** 503 — an upstream dependency is down; safe to retry after a pause. */
export class UnavailableError extends ApiError {}
/** 5xx other than 503. */
export class InternalError extends ApiError {}

/** The response could not be interpreted as the documented envelope. */
export class ContractError extends OblodaiError {
  constructor(
    message: string,
    httpStatus: number,
    raw?: unknown,
    code: AnyErrorCode = "sdk.bad_envelope",
  ) {
    super({ code, message, httpStatus, retryable: false, raw });
  }
}

/**
 * The delivery's signature verified but its body is not a usable event. Deliberately NOT a
 * `SignatureError`: a receiver that answers 401 to signature failures must not answer 401 here —
 * the sender is authentic and the delivery should be retried or investigated, not rejected as forged.
 */
export class WebhookPayloadError extends ContractError {
  constructor(message: string, raw?: unknown) {
    super(message, 0, raw, "webhook.bad_payload");
  }
}

/** Webhook verification failed (bad signature, stale timestamp, missing headers). */
export class SignatureError extends OblodaiError {
  constructor(code: WebhookErrorCode, message: string) {
    super({ code, message, httpStatus: 0, retryable: false });
  }
}

/** Statuses a response without an envelope may carry transiently (LB/proxy/timeouts). */
const TRANSIENT_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface ApiErrorSource {
  /** No `{error}` envelope was present. */
  synthetic?: boolean;
  /** Parsed `Retry-After` header, seconds. */
  retryAfterHeader?: number;
}

/**
 * Upper bound for any retry hint the SDK will report, seconds. A hostile or broken peer can put
 * anything in `retry_after`/`Retry-After`; clamping here means no caller ever schedules a wait from
 * a negative, infinite or overflowing number. The retry loop separately honours at most
 * `retry.maxRetryAfterMs` (default 30 s) of it.
 */
export const MAX_RETRY_AFTER_SECONDS = 86_400;

/** A retry hint as seconds, or undefined when the value is not a usable finite number. */
export function coerceRetryAfterSeconds(value: unknown): number | undefined {
  let n: number;
  if (typeof value === "number") n = value;
  else if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)))
    n = Number(value);
  else return undefined;
  // NaN carries no instruction; ±Infinity does (wait forever / wait not at all) and clamps like any
  // other out-of-range number rather than silently vanishing.
  if (Number.isNaN(n)) return undefined;
  return Math.min(Math.max(0, n), MAX_RETRY_AFTER_SECONDS);
}

function stringOrUndefined(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/**
 * Decode `{error: {...}}` field by field. A peer that answers with the right shape but the wrong
 * types (`code: 123`, `retryable: "yes"`) must not be able to change how the SDK behaves: an
 * unusable `code` demotes the whole body to "no envelope", and every other field falls back to the
 * value the HTTP status alone justifies. Never throws.
 */
export function decodeErrorDetail(raw: unknown): { detail: ErrorDetail; usable: boolean } {
  const src = (raw ?? {}) as Record<string, unknown>;
  const requestId = stringOrUndefined(src.request_id);
  const code = stringOrUndefined(src.code);
  if (!code) return { detail: { code: "", request_id: requestId }, usable: false };
  const retryable = typeof src.retryable === "boolean" ? src.retryable : undefined;
  return {
    detail: {
      code,
      message: stringOrUndefined(src.message),
      field: stringOrUndefined(src.field),
      retryable,
      retry_after: coerceRetryAfterSeconds(src.retry_after),
      request_id: requestId,
    },
    usable: true,
  };
}

/** Build the right subclass from an error envelope (or a synthesized one) and the HTTP status. */
export function apiErrorFrom(
  httpStatus: number,
  detail: ErrorDetail,
  raw?: unknown,
  source: ApiErrorSource = {},
): ApiError {
  const synthetic = source.synthetic ?? false;
  const code = (typeof detail.code === "string" && detail.code) || "internal";
  const message =
    (typeof detail.message === "string" && detail.message) ||
    `request failed with HTTP ${httpStatus} (${code})`;
  const init: OblodaiErrorInit = {
    code,
    message,
    httpStatus,
    retryable: synthetic
      ? TRANSIENT_STATUSES.has(httpStatus)
      : typeof detail.retryable === "boolean"
        ? detail.retryable
        : httpStatus === 429 || httpStatus === 503,
    retryAfter:
      coerceRetryAfterSeconds(detail.retry_after) ??
      coerceRetryAfterSeconds(source.retryAfterHeader),
    requestId: stringOrUndefined(detail.request_id),
    field: stringOrUndefined(detail.field),
    synthetic,
    raw,
  };
  if (init.code === "idempotency.key_reused") return new IdempotencyConflictError(init);
  switch (httpStatus) {
    case 400:
      return new ValidationError(init);
    case 401:
      return new AuthenticationError(init);
    case 403:
      return new PermissionError(init);
    case 404:
      return new NotFoundError(init);
    case 409:
      return new ConflictError(init);
    case 429:
      return new RateLimitError(init);
    case 503:
      return new UnavailableError(init);
    default:
      return httpStatus >= 500 ? new InternalError(init) : new ApiError(init);
  }
}
