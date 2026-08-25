import type { RouteSpec } from "../contract/types.js";
import {
  HEADER_IDEMPOTENCY_KEY,
  HEADER_PUBLIC_ID,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  signRequest,
} from "./signing.js";
import { ConfigError } from "./errors.js";

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
}

export interface BuiltRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  /** What was signed (path + query); kept for debugging signature mismatches. */
  requestUri: string;
}

/** Headers the SDK owns; a caller-supplied header with one of these names is dropped. */
const RESERVED_HEADERS = new Set(
  [
    HEADER_PUBLIC_ID,
    HEADER_SIGNATURE,
    HEADER_TIMESTAMP,
    HEADER_IDEMPOTENCY_KEY,
    "Content-Type",
    "Content-Length",
    "Host",
  ].map((h) => h.toLowerCase()),
);

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
    if (!RESERVED_HEADERS.has(k.toLowerCase())) headers[k] = v;
  }
  headers.Accept = "application/json";
  headers["User-Agent"] = input.userAgent;
  const hasBody = route.method !== "GET";
  if (hasBody) headers["Content-Type"] = "application/json";
  if (input.idempotencyKey) headers[HEADER_IDEMPOTENCY_KEY] = input.idempotencyKey;

  if (route.auth !== "public" && route.auth !== "onboard") {
    if (!input.credentials) {
      throw new ConfigError(
        "sdk.missing_credentials",
        `${route.method} ${route.path} needs a ${route.auth === "any" ? "merchant" : route.auth} API key: pass { publicId, secret } to new Oblodai() or set OBLODAI_PUBLIC_ID / OBLODAI_SECRET`,
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
