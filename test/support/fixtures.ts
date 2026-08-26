import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const CONTRACT_DIR = join(__dirname, "..", "..", "contract");

export interface Fixture {
  route: string;
  status: number;
  request?: unknown;
  response?: { state?: number; result?: unknown; error?: Record<string, unknown> };
  headers?: Record<string, string>;
}

export function loadFixtures(): Map<string, Fixture> {
  const out = new Map<string, Fixture>();
  for (const f of readdirSync(join(CONTRACT_DIR, "fixtures"))) {
    const fx = JSON.parse(readFileSync(join(CONTRACT_DIR, "fixtures", f), "utf8")) as Fixture;
    out.set(fx.route, fx);
  }
  return out;
}

export function fixture(route: string): Fixture {
  const fx = loadFixtures().get(route);
  if (!fx) throw new Error(`no fixture for ${route}`);
  return fx;
}

/** The recorded success `result` for a route (throws when the recording was a refusal). */
export function resultOf<T = unknown>(route: string): T {
  const fx = fixture(route);
  if (fx.status < 200 || fx.status >= 300)
    throw new Error(`fixture for ${route} is a refusal (${fx.status})`);
  return fx.response?.result as T;
}

export function loadContract(): {
  routes: Array<{
    method: string;
    path: string;
    auth: string;
    idempotent: boolean;
    /** The core's own read-only classification; the SDK never infers it. */
    safe: boolean;
    bare: boolean;
    list?: string;
  }>;
  enums: Record<string, string[]>;
  error_codes: string[];
  event_types: string[];
  signing_vectors: Array<{
    name: string;
    secret: string;
    ts: number;
    method: string;
    request_uri: string;
    idempotency_key: string;
    body: string;
    canonical: string;
    signature: string;
  }>;
  webhook_vectors: Array<{ secret: string; ts: number; payload: string; signature: string }>;
} {
  return JSON.parse(readFileSync(join(CONTRACT_DIR, "contract.json"), "utf8"));
}

export function loadWebhookSamples(): Array<{
  headers: Record<string, string>;
  body: Record<string, unknown>;
}> {
  return JSON.parse(readFileSync(join(CONTRACT_DIR, "webhook-samples.json"), "utf8"));
}

export function loadErrorSamples(): Map<string, Fixture> {
  const out = new Map<string, Fixture>();
  for (const f of readdirSync(join(CONTRACT_DIR, "errors"))) {
    out.set(
      f.replace(/\.json$/, ""),
      JSON.parse(readFileSync(join(CONTRACT_DIR, "errors", f), "utf8")) as Fixture,
    );
  }
  return out;
}
