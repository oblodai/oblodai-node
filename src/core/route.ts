/**
 * What one route of the API is, as the runtime needs to know it. Runtime, not contract: the
 * generated route table (`src/generated/routes.ts`) describes every operation with this one type.
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Which credential the core's gate expects: `public` is unsigned, `key` is signed with the
 * merchant's one API key, `onboard` carries the gateway's admin token (`X-Admin-Token`).
 */
export type RouteAuth = "public" | "key" | "onboard";

/** `paged` for `{items, paginate}` lists. */
export type ListKind = "paged";

export interface RouteSpec {
  /** The OpenAPI `operationId`. */
  operationId: string;
  method: HttpMethod;
  /** Path template; `{name}` segments are filled from `pathParams`. */
  path: string;
  auth: RouteAuth;
  /** Wrapped in the core's `withIdempotency`: an Idempotency-Key is generated when not supplied. */
  idempotent: boolean;
  /** Retry-safe: repeating the request cannot duplicate a side effect. */
  safe: boolean;
  /** Outside the JSON envelope (binary documents). */
  bare: boolean;
  listKind: ListKind | null;
}

/** `"POST /v1/payment"` — the method and path of a route, for messages. */
export function routeLabel(route: RouteSpec): string {
  return `${route.method} ${route.path}`;
}
