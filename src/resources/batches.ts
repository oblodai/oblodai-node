import type { RequestBodies } from "../contract/requests.js";
import type { BatchInfo, BatchSubmitted, Transfer } from "../contract/models/index.js";
import { Resource, type RequestOptions } from "./base.js";

/** Progress of asynchronous batches (payment, refund, payout, transfer, payout-link). */
export class Batches extends Resource {
  /** `POST /v1/batch/info` — status, counters and per-row outcomes. */
  info(params: RequestBodies["POST /v1/batch/info"], opts?: RequestOptions): Promise<BatchInfo> {
    return this.call<BatchInfo>("POST /v1/batch/info", params, opts);
  }
}

export type TransferToPersonalParams = RequestBodies["POST /v1/transfer/to-personal"];
export type TransferToUserParams = RequestBodies["POST /v1/transfer/to-user"];
export type TransferBatchParams = RequestBodies["POST /v1/transfer/batch"];

/** Internal, instant, fee-free moves between platform balances. Payout key. */
export class Transfers extends Resource {
  /** `POST /v1/transfer/to-personal` — business balance → owner's personal wallet. */
  toPersonal(params: TransferToPersonalParams, opts?: RequestOptions): Promise<Transfer> {
    return this.call<Transfer>("POST /v1/transfer/to-personal", params, opts);
  }

  /** `POST /v1/transfer/to-user` — business balance → another platform user's personal wallet. */
  toUser(params: TransferToUserParams, opts?: RequestOptions): Promise<Transfer> {
    return this.call<Transfer>("POST /v1/transfer/to-user", params, opts);
  }

  /** `POST /v1/transfer/batch` — asynchronous batch of `toUser` transfers. */
  batch(params: TransferBatchParams, opts?: RequestOptions): Promise<BatchSubmitted> {
    return this.call<BatchSubmitted>("POST /v1/transfer/batch", params, opts);
  }
}
