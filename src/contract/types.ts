/**
 * Hand-written types describing the generated route registry (src/contract/routes.ts). The
 * registry itself is produced by scripts/codegen.ts from contract/contract.json, which is exported
 * from the core's own conformance table — so every route the SDK can call is one the core
 * declares, with the same auth gate and idempotency wrapper.
 */
export type HttpMethod = "GET" | "POST";

/** Which credential the core's gate expects. Mirrors api_conformance_test.go constants. */
export type RouteAuth = "public" | "payment" | "payout" | "any" | "onboard";

export type ListKind = "paged" | "plain";

export interface RouteSpec {
  method: HttpMethod;
  /** Path template; `{name}` segments are filled from `pathParams`. */
  path: string;
  auth: RouteAuth;
  /** Wrapped in the core's `withIdempotency`: an Idempotency-Key is generated when not supplied. */
  idempotent: boolean;
  /** Read-only: a transport failure may be retried without risking a duplicate side effect. */
  safe: boolean;
  /** Outside the JSON envelope (binary documents, health pages). */
  bare: boolean;
  list?: ListKind;
}
