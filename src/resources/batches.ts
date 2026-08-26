import type { RequestBodies } from "../contract/requests.js";
import type {
  BatchInfo,
  BatchSubmitted,
  TransferToPersonal,
  TransferToUser,
} from "../contract/models/index.js";
import { Resource, type RequestOptions } from "./base.js";

/** Progress of asynchronous batches (payment, refund, payout, transfer, payout-link). */
export class Batches extends Resource {
  /** `POST /v1/batch/info` — status, counters and per-row outcomes of any batch you submitted. */
  info(params: RequestBodies["POST /v1/batch/info"], opts?: RequestOptions): Promise<BatchInfo> {
    return this.call<BatchInfo>("POST /v1/batch/info", params, opts);
  }
}

export type TransferToPersonalParams = RequestBodies["POST /v1/transfer/to-personal"];
export type TransferToUserParams = RequestBodies["POST /v1/transfer/to-user"];
export type TransferBatchParams = RequestBodies["POST /v1/transfer/batch"];

/** Internal, instant, fee-free moves between platform balances. */
export class Transfers extends Resource {
  /**
   * `POST /v1/transfer/to-personal` — business balance → the owner's personal wallet (needs an
   * owner link).
   *
   * Codes worth branching on: `transfer.bad_amount`, `merchant.no_owner`,
   * `merchant.no_personal_wallet`, `payout.insufficient_funds` (retryable),
   * `payout.funds_maturing` (retryable).
   */
  toPersonal(params: TransferToPersonalParams, opts?: RequestOptions): Promise<TransferToPersonal> {
    return this.call<TransferToPersonal>("POST /v1/transfer/to-personal", params, opts);
  }

  /**
   * `POST /v1/transfer/to-user` — business balance → another platform user's personal wallet.
   * `amount` and `currency` are required.
   *
   * Codes worth branching on: `transfer.bad_amount`, `transfer.no_recipient`,
   * `transfer.recipient_not_found`, `transfer.bad_recipient` (the recipient is yourself),
   * `payout.insufficient_funds` (retryable).
   */
  toUser(
    params: TransferToUserParams & { amount: string; currency: string },
    opts?: RequestOptions,
  ): Promise<TransferToUser> {
    return this.call<TransferToUser>("POST /v1/transfer/to-user", params, opts);
  }

  /**
   * `POST /v1/transfer/batch` — ASYNCHRONOUS batch of `toUser` transfers; poll `batches.info`.
   * `order_id` is required on every item.
   *
   * Codes worth branching on: `payout.batch_too_large`, `payout.empty_batch`,
   * `request.missing_field` (an item without `order_id`/`amount`/`currency`),
   * `transfer.recipient_not_found`, `idempotency.key_reused`.
   */
  batch(params: TransferBatchParams, opts?: RequestOptions): Promise<BatchSubmitted> {
    return this.call<BatchSubmitted>("POST /v1/transfer/batch", params, opts);
  }
}
