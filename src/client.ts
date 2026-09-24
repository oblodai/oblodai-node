import { resolveConfig, type ClientOptions } from "./config.js";
import { INSPECT_CUSTOM } from "./core/secrets.js";
import { Transport } from "./core/transport.js";
import { RESOURCES } from "./generated/resources.js";
import { SDK_VERSION } from "./version.js";
import "./lro.js";

export { SDK_VERSION };

/** One property per API resource, straight from the generated table. */
export type Resources = {
  readonly [K in keyof typeof RESOURCES]: InstanceType<(typeof RESOURCES)[K]>;
};

/** What `withOptions` may change for a derived client. */
export interface ClientOverrides {
  /** Per-attempt timeout, seconds. */
  timeout?: number;
  /** Retries after the first attempt; replaces `retry.maxRetries`. */
  maxRetries?: number;
  /** Merged over the client's `headers`. */
  extraHeaders?: Record<string, string>;
}

export function userAgent(): string {
  const node = typeof process !== "undefined" ? (process.versions?.node ?? "?") : "?";
  return `oblodai-node/${SDK_VERSION} (node ${node})`;
}

// Declaration merging: the class gets one typed property per generated resource, so a resource the
// API adds shows up on the client with no hand-written line.
export interface Oblodai extends Resources {}

/**
 * The Oblodai API client. One instance per API key; safe to share across requests.
 *
 * ```ts
 * const oblodai = new Oblodai({ publicId: "oblodai_…", secret: "oblodai_live_…" });
 * const invoice = await oblodai.payments.create({ amount: "25", currency: "USDT", order_id: "o-1" });
 * ```
 *
 * Credentials, base URL and admin token fall back to `OBLODAI_PUBLIC_ID`, `OBLODAI_SECRET`,
 * `OBLODAI_BASE_URL` and `OBLODAI_ADMIN_TOKEN`.
 */
export class Oblodai {
  /**
   * The transport, exposed for advanced use (custom routes, tests). It renders itself redacted, so
   * logging the client cannot print a key.
   */
  declare readonly transport: Transport;

  constructor(options: ClientOptions = {}) {
    const cfg = resolveConfig(options);
    this.attach(
      new Transport({
        baseUrl: cfg.baseUrl,
        userAgent: userAgent(),
        credentials: cfg.credentials,
        fetch: cfg.fetch,
        timeout: cfg.timeout,
        deadline: cfg.deadline,
        retry: cfg.retry,
        logger: cfg.logger,
        headers: cfg.headers,
        adminToken: cfg.adminToken,
        hooks: cfg.hooks,
      }),
    );
  }

  private attach(transport: Transport): void {
    Object.defineProperty(this, "transport", { value: transport, enumerable: false });
    for (const [name, Resource] of Object.entries(RESOURCES)) {
      Object.defineProperty(this, name, {
        value: new Resource(transport),
        enumerable: true,
      });
    }
  }

  /**
   * A new client with these overridden; the original is untouched. The copy shares the original's
   * credentials, fetch, hooks and clock correction.
   */
  withOptions(overrides: ClientOverrides): Oblodai {
    const clone = Object.create(Oblodai.prototype) as Oblodai;
    clone.attach(
      this.transport.derive({
        ...(overrides.timeout !== undefined ? { timeout: overrides.timeout } : {}),
        ...(overrides.maxRetries !== undefined ? { maxRetries: overrides.maxRetries } : {}),
        ...(overrides.extraHeaders ? { headers: overrides.extraHeaders } : {}),
      }),
    );
    return clone;
  }

  /** Structured-logger friendly: the namespaces are machinery, the transport redacts itself. */
  toJSON(): Record<string, unknown> {
    return { Oblodai: SDK_VERSION, transport: this.transport.toJSON() };
  }

  /** `console.log(client)` shows the same redacted summary, at any inspect depth. */
  [INSPECT_CUSTOM](): Record<string, unknown> {
    return this.toJSON();
  }
}
