import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

/** The backend checkout: `$OBLODAI_BACKEND`, else `../oblodai-backend` next to this repository. */
export function backendRoot(): string {
  const configured = process.env.OBLODAI_BACKEND;
  return configured ? resolve(configured) : resolve(__dirname, "..", "..", "..", "oblodai-backend");
}

/** The shared conformance suite: `$SDKGEN_CONFORMANCE`, else the backend's `tools/sdkgen/conformance`. */
export function conformanceDir(): string {
  return process.env.SDKGEN_CONFORMANCE ?? join(backendRoot(), "tools", "sdkgen", "conformance");
}

export function hasBackend(): boolean {
  return existsSync(join(backendRoot(), "services", "core", "api", "openapi.json"));
}
