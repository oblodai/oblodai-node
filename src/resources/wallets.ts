import type { RequestBodies } from "../contract/requests.js";
import type { Payout, QrCode, Wallet, WalletBlocked } from "../contract/models/index.js";
import { Resource, type RequestOptions } from "./base.js";

export type CreateWalletParams = RequestBodies["POST /v1/wallet"];

/** Static deposit wallets: one permanent address per customer, deposits reported as `wallet.paid`. */
export class Wallets extends Resource {
  /** `POST /v1/wallet` — idempotent by `order_id`. */
  create(params: CreateWalletParams, opts?: RequestOptions): Promise<Wallet> {
    return this.call<Wallet>("POST /v1/wallet", params, opts);
  }

  /** `POST /v1/wallet/qr`. */
  qr(address: string, opts?: RequestOptions): Promise<QrCode> {
    return this.call<QrCode>("POST /v1/wallet/qr", { address }, opts);
  }

  /** `POST /v1/wallet/block` — stop crediting an address; later deposits wait for a refund decision. */
  block(
    params: RequestBodies["POST /v1/wallet/block"],
    opts?: RequestOptions,
  ): Promise<WalletBlocked> {
    return this.call<WalletBlocked>("POST /v1/wallet/block", params, opts);
  }

  /** `POST /v1/wallet/blocked-address-refund` — send funds that landed on a blocked address back. Payout key. */
  refundBlockedDeposit(
    params: RequestBodies["POST /v1/wallet/blocked-address-refund"],
    opts?: RequestOptions,
  ): Promise<Payout> {
    return this.call<Payout>("POST /v1/wallet/blocked-address-refund", params, opts);
  }
}
