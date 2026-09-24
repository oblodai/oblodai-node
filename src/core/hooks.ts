import { HEADER_ADMIN_TOKEN } from "./request.js";
import { HEADER_SIGNATURE } from "./signing.js";

/**
 * Request and response hooks: plain functions the client calls once per attempt, for metrics,
 * tracing and structured logs. They run synchronously inside the call, so keep them cheap; an
 * exception thrown by a hook propagates out of the call.
 */
export interface RequestInfo {
  method: string;
  url: string;
  /** The headers as sent, with the signature and the admin token redacted. */
  headers: Record<string, string>;
  /** 1 for the first attempt, 2 for the first retry, and so on. */
  attempt: number;
  /** `X-Request-ID` of the call; the same on every attempt. */
  requestId: string;
  /** The route's OpenAPI `operationId`. */
  operationId: string;
}

export interface ResponseInfo {
  request: RequestInfo;
  /** HTTP status, or 0 when the attempt produced no response (timeout, network error). */
  status: number;
  headers: Headers;
  /** Seconds from sending the attempt to this point. */
  elapsed: number;
  /** The error this attempt ended with (an error status or a transport failure). */
  error?: unknown;
}

export interface Hooks {
  onRequest?: ((info: RequestInfo) => void) | undefined;
  onResponse?: ((info: ResponseInfo) => void) | undefined;
}

const SECRET_HEADERS = new Set([HEADER_SIGNATURE, HEADER_ADMIN_TOKEN].map((h) => h.toLowerCase()));

/** A copy with the signature and the admin token replaced by `[redacted]`. */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SECRET_HEADERS.has(k.toLowerCase()) ? "[redacted]" : v;
  }
  return out;
}
