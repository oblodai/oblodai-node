import type { RequestBodies } from "../contract/requests.js";
import type { BatchInfo, BatchSubmitted, Transfer } from "../contract/models/index.js";
import { PermissionError } from "../core/errors.js";
import { Resource, type RequestOptions } from "./base.js";

/** Progress of asynchronous batches (payment, refund, payout, transfer, payout-link). */
export class Batches extends Resource {
  /**
   * `POST /v1/batch/info` — status, counters and per-row outcomes. Accepts either key kind; the core
   * requires the kind that created the batch, so a payout batch is retried with the payout key when
   * one is configured.
   */
  async info(
    params: RequestBodies["POST /v1/batch/info"],
    opts: RequestOptions = {},
  ): Promise<BatchInfo> {
    try {
      return await this.call<BatchInfo>("POST /v1/batch/info", params, opts);
    } catch (err) {
      if (
        err instanceof PermissionError &&
        err.code === "merchant.wrong_key_kind" &&
        !opts.preferPayoutKey
      ) {
        return this.call<BatchInfo>("POST /v1/batch/info", params, {
          ...opts,
          preferPayoutKey: true,
        });
      }
      throw err;
    }
  }
}

export type TransferToPersonalParams = RequestBodies["POST /v1/transfer/to-personal"];
export type TransferToUserParams = RequestBodies["POST /v1/transfer/to-user"];
export type TransferBatchParams = RequestBodies["POST /v1/transfer/batch"];

/** Internal, instant, fee-free moves between platform balances. Payout key. */
export class Transfers extends Resource {
  /** `POST /v1/transfer/to-personal` — business balance → the owner's personal wallet (needs an owner link). */
  toPersonal(params: TransferToPersonalParams, opts?: RequestOptions): Promise<Transfer> {
    return this.call<Transfer>("POST /v1/transfer/to-personal", params, opts);
  }

  /** `POST /v1/transfer/to-user` — business balance → another platform user's personal wallet. `amount` and `currency` are required. */
  toUser(
    params: TransferToUserParams & { amount: string; currency: string },
    opts?: RequestOptions,
  ): Promise<Transfer> {
    return this.call<Transfer>("POST /v1/transfer/to-user", params, opts);
  }

  /** `POST /v1/transfer/batch` — ASYNCHRONOUS batch of `toUser` transfers; poll `batches.info`. `order_id` is required on every item. */
  batch(params: TransferBatchParams, opts?: RequestOptions): Promise<BatchSubmitted> {
    return this.call<BatchSubmitted>("POST /v1/transfer/batch", params, opts);
  }
}
