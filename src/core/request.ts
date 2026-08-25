import type { RouteSpec } from "../contract/types.js";
import {
  HEADER_IDEMPOTENCY_KEY,
  HEADER_PUBLIC_ID,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  signRequest,
} from "./signing.js";
import { ContractError } from "./errors.js";

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

export function buildRequest(input: BuildInput): BuiltRequest {
  const { route } = input;
  const url = new URL(fillPath(route.path, input.pathParams), ensureTrailingSlash(input.baseUrl));
  if (input.query) {
    for (const [k, v] of Object.entries(input.query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  const requestUri = url.pathname + url.search;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": input.userAgent,
    ...input.extraHeaders,
  };
  const hasBody = route.method !== "GET";
  if (hasBody) headers["Content-Type"] = "application/json";
  if (input.idempotencyKey) headers[HEADER_IDEMPOTENCY_KEY] = input.idempotencyKey;

  if (route.auth !== "public") {
    if (!input.credentials) {
      throw new ContractError(
        `${route.method} ${route.path} requires API credentials (${route.auth} key)`,
        0,
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

/** Substitute `{name}` segments; every placeholder must be supplied, values are percent-encoded. */
export function fillPath(template: string, params: Record<string, string | number> = {}): string {
  return template.replace(/\{([a-zA-Z_]+)\}/g, (_, name: string) => {
    const v = params[name];
    if (v === undefined || v === null || String(v) === "") {
      throw new ContractError(`missing path parameter "${name}" for ${template}`, 0);
    }
    return encodeURIComponent(String(v));
  });
}

function ensureTrailingSlash(base: string): string {
  return base.endsWith("/") ? base : `${base}/`;
}

/** Serialize a request body once; `undefined` values vanish, a missing POST body becomes `{}`. */
export function serializeBody(body: unknown, method: string): string {
  if (method === "GET") return "";
  if (body === undefined || body === null) return "{}";
  return JSON.stringify(body);
}
