import { makeCredentials, type Credentials } from "./core/request.js";
import type { Hooks } from "./core/hooks.js";
import type { FetchLike } from "./core/transport.js";
import type { Logger } from "./core/logger.js";
import type { RetryOptions } from "./core/retry.js";
import { consoleLogger } from "./core/logger.js";
import { ConfigError } from "./core/errors.js";

export const DEFAULT_BASE_URL = "https://api.oblodai.com";

export interface ClientOptions {
  /** Public id of the merchant's one API key (`X-Public-Id`). Falls back to `OBLODAI_PUBLIC_ID`. */
  publicId?: string;
  /** Secret of that key; it signs every signed route. Falls back to `OBLODAI_SECRET`. */
  secret?: string;
  /** API origin. Falls back to `OBLODAI_BASE_URL`, then https://api.oblodai.com. */
  baseUrl?: string;
  /** Custom fetch (undici with a proxy agent, a recording stub in tests). */
  fetch?: FetchLike;
  /** Per-attempt timeout, seconds. Default 30. */
  timeout?: number;
  /** Overall budget per call including retries and pauses, seconds. Default 90. */
  deadline?: number;
  /** Retry policy overrides; `{ maxRetries: 0 }` disables retries. */
  retry?: Partial<RetryOptions>;
  /** Structured logger; `OBLODAI_LOG=debug` enables a console logger when omitted. */
  logger?: Logger;
  /** Extra headers on every request. */
  headers?: Record<string, string>;
  /** Admin token of a self-hosted gateway; only the merchant-provisioning routes use it. Falls back to `OBLODAI_ADMIN_TOKEN`. */
  adminToken?: string;
  /** Permit plain http:// base URLs (local core, CI). Default false. */
  allowInsecureBaseUrl?: boolean;
  /** Called once per attempt: before it is sent and when it ends. */
  hooks?: Hooks;
  /** The environment to read `OBLODAI_*` from; `process.env` by default. */
  env?: Record<string, string | undefined>;
}

export interface ResolvedConfig {
  baseUrl: string;
  credentials?: Credentials;
  fetch?: FetchLike;
  timeout?: number;
  deadline?: number;
  retry?: Partial<RetryOptions>;
  logger?: Logger;
  headers?: Record<string, string>;
  adminToken?: string;
  hooks?: Hooks;
}

/** Merge explicit options with the environment and validate what can be validated up front. */
export function resolveConfig(
  opts: ClientOptions = {},
  env: Record<string, string | undefined> = opts.env ?? process.env,
): ResolvedConfig {
  const baseUrl = (opts.baseUrl ?? (env.OBLODAI_BASE_URL || DEFAULT_BASE_URL)).replace(/\/+$/, "");
  assertBaseUrl(baseUrl, opts.allowInsecureBaseUrl ?? env.OBLODAI_ALLOW_INSECURE === "1");

  const publicId = opts.publicId ?? (env.OBLODAI_PUBLIC_ID || undefined);
  const secret = opts.secret ?? (env.OBLODAI_SECRET || undefined);
  if ((publicId && !secret) || (!publicId && secret)) {
    throw new ConfigError(
      "sdk.bad_config",
      "publicId and secret must be provided together (or set both OBLODAI_PUBLIC_ID and OBLODAI_SECRET)",
    );
  }
  let logger = opts.logger;
  if (!logger && env.OBLODAI_LOG) {
    const lvl = env.OBLODAI_LOG.toLowerCase();
    if (lvl === "debug" || lvl === "info" || lvl === "warn" || lvl === "error")
      logger = consoleLogger(lvl);
  }

  return {
    baseUrl,
    credentials: publicId && secret ? makeCredentials(publicId, secret) : undefined,
    fetch: opts.fetch,
    timeout: opts.timeout,
    deadline: opts.deadline,
    retry: opts.retry,
    logger,
    headers: opts.headers,
    adminToken: opts.adminToken ?? (env.OBLODAI_ADMIN_TOKEN || undefined),
    hooks: opts.hooks,
  };
}

function assertBaseUrl(baseUrl: string, allowInsecure: boolean): void {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new ConfigError("sdk.bad_config", `baseUrl is not a valid URL: ${baseUrl}`, "baseUrl");
  }
  if (parsed.protocol === "https:") return;
  const local =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "[::1]" ||
    parsed.hostname === "::1";
  if (parsed.protocol === "http:" && (allowInsecure || local)) return;
  throw new ConfigError(
    "sdk.bad_config",
    `baseUrl must use https (got ${parsed.protocol}//${parsed.host}); set allowInsecureBaseUrl for a local core`,
    "baseUrl",
  );
}
