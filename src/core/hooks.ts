import { HEADER_ADMIN_TOKEN } from "./request.js";
import { REDACTED } from "./secrets.js";
import { HEADER_SIGNATURE } from "./signing.js";

/**
 * Request and response hooks: plain functions the client calls once per attempt, for metrics,
 * tracing and structured logs. They run synchronously inside the call, so keep them cheap; an
 * exception thrown by a hook propagates out of the call.
 */
export interface RequestInfo {
  method: string;
  /**
   * The URL as sent, with secrets masked: a claim/AML token in the path (`/v1/claim/[redacted]`) and
   * the signed-link parameters (`sig`, `exp`, `token`) in the query.
   */
  url: string;
  /** The headers as sent, with the signature and every credential header redacted. */
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

/** Headers whose value is a credential, matched case-insensitively. */
export const SECRET_HEADERS: ReadonlySet<string> = new Set(
  [
    HEADER_SIGNATURE,
    HEADER_ADMIN_TOKEN,
    "Authorization",
    "Proxy-Authorization",
    "X-Api-Key",
    "X-Claim-Passcode",
    "Cookie",
  ].map((h) => h.toLowerCase()),
);

/** A copy with every {@link SECRET_HEADERS} value replaced by `[redacted]`. */
export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SECRET_HEADERS.has(k.toLowerCase()) ? REDACTED : v;
  }
  return out;
}

/** Path parameters that are bearer credentials (`/v1/claim/{token}`, `/v1/aml/{token}`). */
const SECRET_PATH_PARAMS = /^\{(token|code|passcode)\}$/i;
/** Query parameters of a signed link (`/v1/documents/…?exp=&sig=`) or carrying a token. */
const SECRET_QUERY_PARAMS = new Set(["sig", "exp", "token"]);

/**
 * A URL safe to show in hooks, logs and error messages: userinfo dropped, the path segments the
 * route template names `{token}`/`{code}`/`{passcode}` masked, and `sig`/`exp`/`token` query values
 * masked. `template` is the route path; without it only the query and userinfo are cleaned.
 */
export function redactUrl(url: string, template?: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return REDACTED;
  }
  const segments = u.pathname.split("/");
  if (template) {
    const tpl = template.split("/");
    const shift = segments.length - tpl.length;
    tpl.forEach((t, i) => {
      if (SECRET_PATH_PARAMS.test(t) && i + shift >= 0) segments[i + shift] = REDACTED;
    });
  }
  const query = u.search
    ? "?" +
      u.search
        .slice(1)
        .split("&")
        .map((pair) => {
          const eq = pair.indexOf("=");
          const key = eq < 0 ? pair : pair.slice(0, eq);
          let name = key;
          try {
            name = decodeURIComponent(key.replace(/\+/g, " "));
          } catch {
            // an undecodable key is shown as sent
          }
          return SECRET_QUERY_PARAMS.has(name.toLowerCase()) ? `${key}=${REDACTED}` : pair;
        })
        .join("&")
    : "";
  return `${u.protocol}//${u.host}${segments.join("/")}${query}`;
}
