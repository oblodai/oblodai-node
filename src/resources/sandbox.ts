import type { RequestBodies } from "../contract/requests.js";
import type {
  FaucetResult,
  SandboxDeposit,
  SandboxReplay,
  SandboxReset,
  WebhookDelivery,
} from "../contract/models/index.js";
import type { PagePromise } from "../core/pagination.js";
import { Resource, type RequestOptions } from "./base.js";

/** Developer sandbox (`test_` keys only): fake money, simulated deposits, webhook inspector. */
export class Sandbox extends Resource {
  /** `POST /v1/sandbox/faucet` — credit test funds. */
  faucet(
    params: RequestBodies["POST /v1/sandbox/faucet"],
    opts?: RequestOptions,
  ): Promise<FaucetResult> {
    return this.call<FaucetResult>("POST /v1/sandbox/faucet", params, opts);
  }

  /** `POST /v1/sandbox/deposit` — simulate an on-chain deposit to an invoice (repeat the txid to add confirmations). */
  deposit(
    params: RequestBodies["POST /v1/sandbox/deposit"],
    opts?: RequestOptions,
  ): Promise<SandboxDeposit> {
    return this.call<SandboxDeposit>("POST /v1/sandbox/deposit", params, opts);
  }

  /** `GET /v1/sandbox/webhooks` — deliveries with their payloads. */
  webhooks(
    params: { limit?: number; offset?: number } = {},
    opts?: RequestOptions,
  ): PagePromise<WebhookDelivery> {
    return this.page<WebhookDelivery>("GET /v1/sandbox/webhooks", params, opts);
  }

  /** `POST /v1/sandbox/webhooks/replay` — re-send a terminal (delivered/dead) delivery. */
  replay(deliveryId: string, opts?: RequestOptions): Promise<SandboxReplay> {
    return this.call<SandboxReplay>(
      "POST /v1/sandbox/webhooks/replay",
      { delivery_id: deliveryId },
      opts,
    );
  }

  /** `POST /v1/sandbox/reset` — cancel open invoices and zero balances. */
  reset(opts?: RequestOptions): Promise<SandboxReset> {
    return this.call<SandboxReset>("POST /v1/sandbox/reset", undefined, opts);
  }
}
