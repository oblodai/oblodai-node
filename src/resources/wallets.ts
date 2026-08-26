import type { RequestBodies } from "../contract/requests.js";
import type { Payout, Wallet, WalletBlocked, WalletQr } from "../contract/models/index.js";
import { Resource, type RequestOptions } from "./base.js";

export type CreateWalletParams = RequestBodies["POST /v1/wallet"];

/** Static deposit wallets: one permanent address per customer, deposits reported as `wallet.paid`. */
export class Wallets extends Resource {
  /**
   * `POST /v1/wallet` — a permanent deposit address for one customer. Idempotent by `order_id`.
   *
   * Codes worth branching on: `wallet.static_disabled`, `wallet.unsupported_network`,
   * `wallet.no_network` (multi-network asset, no `network` given), `wallet.no_address`
   * (derivation is temporarily unavailable — retryable), `wallet.sandbox_unsupported`,
   * `request.unknown_currency`, `idempotency.key_reused`.
   */
  create(params: CreateWalletParams, opts?: RequestOptions): Promise<Wallet> {
    return this.call<Wallet>("POST /v1/wallet", params, opts);
  }

  /** `POST /v1/wallet/qr`. */
  qr(address: string, opts?: RequestOptions): Promise<WalletQr> {
    return this.call<WalletQr>("POST /v1/wallet/qr", { address }, opts);
  }

  /** `POST /v1/wallet/block` — stop crediting an address; later deposits wait for a refund decision. */
  block(
    params: RequestBodies["POST /v1/wallet/block"],
    opts?: RequestOptions,
  ): Promise<WalletBlocked> {
    return this.call<WalletBlocked>("POST /v1/wallet/block", params, opts);
  }

  /**
   * `POST /v1/wallet/blocked-address-refund` — send funds that landed on a blocked address back.
   *
   * Codes worth branching on: `wallet.bad_uuid`, `refund.no_address` (the address is not blocked),
   * `refund.nothing_to_refund` (already refunded or empty), `refund.dust` (below the network minimum),
   * `refund.destination_internal`.
   */
  refundBlockedDeposit(
    params: RequestBodies["POST /v1/wallet/blocked-address-refund"],
    opts?: RequestOptions,
  ): Promise<Payout> {
    return this.call<Payout>("POST /v1/wallet/blocked-address-refund", params, opts);
  }
}
