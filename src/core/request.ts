import type { RouteSpec } from "../contract/types.js";
import {
  HEADER_IDEMPOTENCY_KEY,
  HEADER_PUBLIC_ID,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  signRequest,
} from "./signing.js";
import { ConfigError } from "./errors.js";
import { protectSecrets } from "./secrets.js";

/**
 * Builds the outgoing request — URL, headers, body — as a pure function of its inputs, so the
 * signing material (what is signed) and the wire bytes (what is sent) come from one place and
 * cannot disagree. Nothing here touches the network or the clock.
 */
export type QueryValue = string | number | boolean | undefined | null;
export type Query = Record<string, QueryValue>;

export interface Credentials {
  publicId: string;
  secret: string;
}

/**
 * Build a credential whose secret is readable as a property but invisible to `JSON.stringify`,
 * `console.log` and any spread — the three ways a key ends up in a log file by accident.
 */
export function makeCredentials(publicId: string, secret: string): Credentials {
  const creds = { publicId, secret } as Credentials;
  return protectSecrets(creds, ["secret"]);
}

export interface BuildInput {
  baseUrl: string;
  route: RouteSpec;
  pathParams?: Record<string, string | number>;
  query?: Query;
  /** Already-serialized body; empty string for GET. */
  body: string;
  credentials?: Credentials;
  idempotencyKey?: string;
  /** Unix seconds; signed into X-Timestamp. */
  ts: number;
  userAgent: string;
  extraHeaders?: Record<string, string>;
  /** Sent as `X-Admin-Token`; the transport supplies it on `onboard` routes only. */
  adminToken?: string;
}

export interface BuiltRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  /** What was signed (path + query); kept for debugging signature mismatches. */
  requestUri: string;
}

export const HEADER_ADMIN_TOKEN = "X-Admin-Token";

/**
 * Headers the SDK owns. A caller-supplied header with one of these names is dropped, matched
 * case-insensitively: `accept: text/html` next to the SDK's `Accept` would otherwise reach the wire
 * as a second value, and a caller `X-Admin-Token` would travel on signed merchant routes it has no
 * business on.
 */
const RESERVED_HEADERS = new Set(
  [
    HEADER_PUBLIC_ID,
    HEADER_SIGNATURE,
    HEADER_TIMESTAMP,
    HEADER_IDEMPOTENCY_KEY,
    HEADER_ADMIN_TOKEN,
    "Accept",
    "User-Agent",
    "Content-Type",
    "Content-Length",
    "Host",
  ].map((h) => h.toLowerCase()),
);

/**
 * Caller header values must be printable ASCII on one line. A CR or LF would let a caller-controlled
 * value append headers of its own (request splitting); a non-ASCII byte is rejected by the runtime's
 * header encoder at best and mangled at worst, so it is refused here where the error is legible.
 */
function assertHeaderValue(name: string, value: string): void {
  if (typeof value !== "string" || !/^[\x20-\x7e\t]*$/.test(value)) {
    throw new ConfigError(
      "sdk.bad_header",
      `header "${name}" must be printable ASCII on a single line (no CR/LF, no non-ASCII characters)`,
      name,
    );
  }
}

export function buildRequest(input: BuildInput): BuiltRequest {
  const { route } = input;
  const url = joinUrl(input.baseUrl, fillPath(route.path, input.pathParams));
  if (input.query) {
    for (const [k, v] of Object.entries(input.query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  const requestUri = url.pathname + url.search;

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.extraHeaders ?? {})) {
    if (RESERVED_HEADERS.has(k.toLowerCase())) continue;
    assertHeaderValue(k, v);
    headers[k] = v;
  }
  headers.Accept = "application/json";
  headers["User-Agent"] = input.userAgent;
  const hasBody = route.method !== "GET";
  if (hasBody) headers["Content-Type"] = "application/json";
  if (input.idempotencyKey) headers[HEADER_IDEMPOTENCY_KEY] = input.idempotencyKey;
  if (input.adminToken) {
    assertHeaderValue(HEADER_ADMIN_TOKEN, input.adminToken);
    headers[HEADER_ADMIN_TOKEN] = input.adminToken;
  }

  if (route.auth === "key") {
    if (!input.credentials) {
      throw new ConfigError(
        "sdk.missing_credentials",
        `${route.method} ${route.path} is signed with the merchant's API key: pass { publicId, secret } to new Oblodai() or set OBLODAI_PUBLIC_ID / OBLODAI_SECRET`,
      );
    }
    headers[HEADER_PUBLIC_ID] = input.credentials.publicId;
    headers[HEADER_TIMESTAMP] = String(input.ts);
    headers[HEADER_SIGNATURE] = signRequest(input.credentials.secret, {
      ts: input.ts,
      method: route.method,
      requestUri,
      idempotencyKey: input.idempotencyKey,
      body: hasBody ? input.body : "",
    });
  }

  return {
    url: url.toString(),
    method: route.method,
    headers,
    body: hasBody ? input.body : undefined,
    requestUri,
  };
}

/** Append a route path to the base URL, keeping any path prefix the base carries (`https://host/api`). */
export function joinUrl(baseUrl: string, routePath: string): URL {
  const base = new URL(baseUrl);
  const prefix = base.pathname.replace(/\/+$/, "");
  base.pathname = prefix + routePath;
  base.search = "";
  base.hash = "";
  return base;
}

/** Substitute `{name}` segments; every placeholder must be supplied, values are percent-encoded. */
export function fillPath(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{([a-zA-Z_]+)\}/g, (_, name: string) => {
    const raw = params[name];
    const v = raw === undefined || raw === null ? "" : String(raw);
    if (v === "" || v === "." || v === ".." || v.includes("/")) {
      throw new ConfigError(
        "sdk.bad_path_param",
        `path parameter "${name}" for ${template} must be a non-empty single segment (got ${JSON.stringify(v)})`,
        name,
      );
    }
    return encodeURIComponent(v);
  });
}

/** Serialize a request body once; `undefined` values vanish, a missing POST body becomes `{}`. */
export function serializeBody(body: unknown, method: string): string {
  if (method === "GET") return "";
  if (body === undefined || body === null) return "{}";
  return JSON.stringify(body);
}
