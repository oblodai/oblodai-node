import {
  ContractError,
  MAX_RETRY_AFTER_SECONDS,
  apiErrorFrom,
  decodeErrorDetail,
  type ApiError,
} from "./errors.js";
import { isRecord } from "./util.js";

/**
 * Response envelopes, as `httpx`/`apiutil` on the core write them:
 *
 *   success : { "state": 0, "result": <payload> }
 *   list    : result = { "items": [...], "paginate": { total, per_page, offset, has_pages } }
 *   error   : { "error": { code, message, field?, details?, retryable, retry_after?, request_id? } }
 *
 * Every non-`bare` route uses these; bare routes (PDF documents, health pages) bypass this module.
 */
export interface Paginate {
  total: number;
  per_page: number;
  offset: number;
  has_pages: boolean;
}

export interface Page<T> {
  items: T[];
  paginate: Paginate;
}

/** A list that the core caps by catalog size rather than paginating (`listPlain` routes). */
export interface PlainList<T> {
  items: T[];
}

export type Decoded<T> = { ok: true; result: T } | { ok: false; error: ApiError };

export interface DecodeContext {
  /** `Retry-After` header value, if any. */
  retryAfter?: string | null;
  /** `Location` header value, for redirects. */
  location?: string | null;
}

/** Interpret a response body. `text` is the raw body so non-JSON failures keep their evidence. */
export function decodeEnvelope<T>(
  httpStatus: number,
  text: string,
  ctx: DecodeContext = {},
): Decoded<T> {
  const retryAfterHeader = parseRetryAfter(ctx.retryAfter);

  if (httpStatus >= 300 && httpStatus < 400) {
    const where = ctx.location ? ` to ${ctx.location}` : "";
    return {
      ok: false,
      error: apiErrorFrom(
        httpStatus,
        {
          code: "internal",
          message: `unexpected redirect (HTTP ${httpStatus})${where}; check baseUrl`,
        },
        text,
        { synthetic: true },
      ),
    };
  }

  let body: unknown;
  try {
    body = text.length ? JSON.parse(text) : undefined;
  } catch {
    if (httpStatus >= 400) {
      return {
        ok: false,
        error: apiErrorFrom(
          httpStatus,
          { code: "internal", message: noEnvelope(httpStatus, text) },
          text,
          { synthetic: true, retryAfterHeader },
        ),
      };
    }
    throw new ContractError(`expected a JSON envelope, got ${describe(text)}`, httpStatus, text);
  }

  if (isRecord(body) && isRecord(body.error)) {
    // Field by field: a body with the envelope shape but the wrong types must not be able to steer
    // the SDK (a non-boolean `retryable` deciding retries, a numeric `code` breaking `family`).
    const { detail, usable } = decodeErrorDetail(body.error);
    if (usable) {
      return { ok: false, error: apiErrorFrom(httpStatus, detail, body, { retryAfterHeader }) };
    }
    if (httpStatus >= 400) {
      return {
        ok: false,
        error: apiErrorFrom(
          httpStatus,
          {
            code: "internal",
            message: noEnvelope(httpStatus, text),
            request_id: detail.request_id,
          },
          body,
          { synthetic: true, retryAfterHeader },
        ),
      };
    }
  }
  if (httpStatus >= 400) {
    return {
      ok: false,
      error: apiErrorFrom(
        httpStatus,
        { code: "internal", message: noEnvelope(httpStatus, text) },
        body,
        { synthetic: true, retryAfterHeader },
      ),
    };
  }
  if (isRecord(body) && body.state === 0 && "result" in body) {
    return { ok: true, result: body.result as T };
  }
  throw new ContractError(
    `response is not a {state:0,result} envelope: ${describe(text)}`,
    httpStatus,
    body,
  );
}

/**
 * `Retry-After` as delta-seconds or an HTTP-date; undefined when absent or unparsable. Whatever the
 * peer wrote, the result is a finite number of seconds in [0, MAX_RETRY_AFTER_SECONDS]: a date in
 * the year 9999, a 400-digit integer or a negative delta can never become a wait the caller honours.
 */
export function parseRetryAfter(
  value: string | null | undefined,
  now: number = Date.now(),
): number | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (/^\d+$/.test(v)) return clampSeconds(Number(v));
  const at = Date.parse(v);
  if (Number.isNaN(at)) return undefined;
  return clampSeconds(Math.ceil((at - now) / 1000));
}

function clampSeconds(n: number): number | undefined {
  if (!Number.isFinite(n)) return undefined;
  return Math.min(Math.max(0, n), MAX_RETRY_AFTER_SECONDS);
}

function noEnvelope(status: number, text: string): string {
  return `HTTP ${status} without an Oblodai error envelope (${describe(text)}) — the answer came from a proxy or load balancer, not the API`;
}

function describe(text: string): string {
  const head = text.slice(0, 120).replace(/\s+/g, " ");
  return text.length > 120 ? `${head}…` : head || "<empty body>";
}

/** Assert the paged-list shape on a decoded result; throws ContractError otherwise. */
export function asPage<T>(result: unknown, httpStatus = 200): Page<T> {
  if (isRecord(result) && Array.isArray(result.items) && isRecord(result.paginate)) {
    return result as unknown as Page<T>;
  }
  throw new ContractError("expected {items, paginate} list result", httpStatus, result);
}

export function asPlainList<T>(result: unknown, httpStatus = 200): PlainList<T> {
  if (isRecord(result) && Array.isArray(result.items)) return result as unknown as PlainList<T>;
  throw new ContractError("expected {items} list result", httpStatus, result);
}
