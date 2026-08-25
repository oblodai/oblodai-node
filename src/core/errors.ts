/**
 * Error model. One family, `OblodaiError`, mirrors the core's error envelope:
 *
 *   { "error": { "code", "message", "field"?, "retryable", "retry_after"?, "request_id"? } }
 *
 * `retryable` is authoritative: it comes from the core's own classification of the failure
 * (kind + per-code overrides), so callers and the built-in retry policy trust it over the HTTP
 * status. Subclasses exist for `instanceof` ergonomics only — the discriminator is always `code`.
 */
export interface ErrorDetail {
  code: string;
  message?: string;
  field?: string;
  retryable?: boolean;
  retry_after?: number;
  request_id?: string;
}

export interface OblodaiErrorInit {
  code: string;
  message: string;
  httpStatus: number;
  retryable: boolean;
  retryAfter?: number;
  requestId?: string;
  field?: string;
  /** The decoded error body (or raw text when the body was not JSON). */
  raw?: unknown;
  cause?: unknown;
}

export class OblodaiError extends Error {
  /** Stable machine code, e.g. `payout.insufficient_funds`. */
  readonly code: string;
  /** HTTP status, or 0 when no response was received. */
  readonly httpStatus: number;
  /** Whether repeating the identical request can succeed later. */
  readonly retryable: boolean;
  /** Seconds to wait before retrying, when the core provided a hint. */
  readonly retryAfter?: number;
  /** Server-side request id — quote it when contacting support. */
  readonly requestId?: string;
  /** The request field the error refers to, for validation failures. */
  readonly field?: string;
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
    this.raw = init.raw;
  }

  /** Code family (`payout` in `payout.insufficient_funds`). */
  get family(): string {
    const dot = this.code.indexOf(".");
    return dot < 0 ? this.code : this.code.slice(0, dot);
  }
}

/** The request never produced an HTTP response: DNS, TCP, TLS, timeout, abort. */
export class TransportError extends OblodaiError {
  constructor(
    code: "transport.timeout" | "transport.network" | "transport.aborted",
    message: string,
    cause?: unknown,
  ) {
    super({ code, message, httpStatus: 0, retryable: code !== "transport.aborted", cause });
  }
}

/** The core answered with an error envelope. */
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
/** 429 — rate limited; `retryAfter` is always present. */
export class RateLimitError extends ApiError {}
/** 503 — an upstream dependency is down; safe to retry after a pause. */
export class UnavailableError extends ApiError {}
/** 5xx other than 503. */
export class InternalError extends ApiError {}

/** The response could not be interpreted as the documented envelope. */
export class ContractError extends OblodaiError {
  constructor(message: string, httpStatus: number, raw?: unknown) {
    super({ code: "sdk.bad_envelope", message, httpStatus, retryable: false, raw });
  }
}

/** Webhook verification failed (bad signature, stale timestamp, missing headers). */
export class SignatureError extends OblodaiError {
  constructor(
    code: "webhook.bad_signature" | "webhook.stale_timestamp" | "webhook.missing_header",
    message: string,
  ) {
    super({ code, message, httpStatus: 0, retryable: false });
  }
}

/** Build the right subclass from an error envelope and the HTTP status that carried it. */
export function apiErrorFrom(httpStatus: number, detail: ErrorDetail, raw?: unknown): ApiError {
  const init: OblodaiErrorInit = {
    code: detail.code || "internal",
    message:
      detail.message || `request failed with HTTP ${httpStatus} (${detail.code || "no code"})`,
    httpStatus,
    // Absent flag: fall back to the core's own kind rule (429/503 retryable, everything else not).
    retryable: detail.retryable ?? (httpStatus === 429 || httpStatus === 503),
    retryAfter: detail.retry_after,
    requestId: detail.request_id,
    field: detail.field,
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
