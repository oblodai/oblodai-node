import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

/** The backend checkout: `$OBLODAI_BACKEND`, else `../oblodai-backend` next to this repository. */
export function backendRoot(): string {
  const configured = process.env.OBLODAI_BACKEND;
  return configured ? resolve(configured) : resolve(__dirname, "..", "..", "..", "oblodai-backend");
}

/** The vendored contract snapshot (`scripts/sync-contract.mjs`), used when no backend is at hand. */
export const VENDORED_CONTRACT = resolve(__dirname, "..", "..", "contract");

/**
 * The shared conformance suite: `$SDKGEN_CONFORMANCE`, else the backend's
 * `tools/sdkgen/conformance`, else the vendored snapshot in `contract/conformance` (CI).
 */
export function conformanceDir(): string {
  if (process.env.SDKGEN_CONFORMANCE) return process.env.SDKGEN_CONFORMANCE;
  const fromBackend = join(backendRoot(), "tools", "sdkgen", "conformance");
  if (process.env.OBLODAI_BACKEND || existsSync(fromBackend)) return fromBackend;
  return join(VENDORED_CONTRACT, "conformance");
}

export function hasBackend(): boolean {
  return existsSync(join(backendRoot(), "services", "core", "api", "openapi.json"));
}
