import { resolveConfig, type ClientOptions } from "./config.js";
import { CONTRACT_HASH } from "./contract/version.js";
import { Transport } from "./core/transport.js";
import { Account, Catalog } from "./resources/account.js";
import { Batches, Transfers } from "./resources/batches.js";
import { Documents } from "./resources/documents.js";
import { PaymentLinks, PayoutLinks } from "./resources/links.js";
import { Payments } from "./resources/payments.js";
import { Payouts } from "./resources/payouts.js";
import { Refunds } from "./resources/refunds.js";
import { Sandbox } from "./resources/sandbox.js";
import { Settings } from "./resources/settings.js";
import { Splits } from "./resources/splits.js";
import { Wallets } from "./resources/wallets.js";
import { Webhooks } from "./resources/webhooks.js";
import { Merchants } from "./resources/merchants.js";

export const SDK_VERSION = "1.3.0";

/**
 * The Oblodai API client. One instance per key pair; safe to share across requests.
 *
 * ```ts
 * const oblodai = new Oblodai({ publicId: "pk_live_…", secret: "…" });
 * const invoice = await oblodai.payments.create({ amount: "25", currency: "USDT", network: "tron", order_id: "o-1" });
 * ```
 */
export class Oblodai {
  readonly payments: Payments;
  readonly refunds: Refunds;
  readonly payouts: Payouts;
  readonly payoutLinks: PayoutLinks;
  readonly paymentLinks: PaymentLinks;
  readonly batches: Batches;
  readonly transfers: Transfers;
  readonly wallets: Wallets;
  readonly webhooks: Webhooks;
  readonly documents: Documents;
  readonly splits: Splits;
  readonly settings: Settings;
  readonly account: Account;
  readonly catalog: Catalog;
  readonly sandbox: Sandbox;
  readonly merchants: Merchants;

  /** The transport, exposed for advanced use (custom routes, tests). */
  readonly transport: Transport;

  constructor(options: ClientOptions = {}) {
    const cfg = resolveConfig(options);
    this.transport = new Transport({
      baseUrl: cfg.baseUrl,
      credentials: cfg.credentials,
      payoutCredentials: cfg.payoutCredentials,
      fetch: cfg.fetch,
      timeoutMs: cfg.timeoutMs,
      deadlineMs: cfg.deadlineMs,
      retry: cfg.retry,
      logger: cfg.logger,
      headers: cfg.headers,
      adminToken: cfg.adminToken,
      userAgent: `oblodai-node/${SDK_VERSION} (contract ${CONTRACT_HASH.slice(0, 12)}; node ${typeof process !== "undefined" ? (process.versions?.node ?? "?") : "?"})`,
    });
    this.payments = new Payments(this.transport);
    this.refunds = new Refunds(this.transport);
    this.payouts = new Payouts(this.transport);
    this.payoutLinks = new PayoutLinks(this.transport);
    this.paymentLinks = new PaymentLinks(this.transport);
    this.batches = new Batches(this.transport);
    this.transfers = new Transfers(this.transport);
    this.wallets = new Wallets(this.transport);
    this.webhooks = new Webhooks(this.transport);
    this.documents = new Documents(this.transport);
    this.splits = new Splits(this.transport);
    this.settings = new Settings(this.transport);
    this.account = new Account(this.transport);
    this.catalog = new Catalog(this.transport);
    this.sandbox = new Sandbox(this.transport);
    this.merchants = new Merchants(this.transport);
  }
}
