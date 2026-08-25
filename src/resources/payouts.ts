import type { RequestBodies } from "../contract/requests.js";
import type {
  BatchElement,
  BatchSubmitted,
  Payout,
  PayoutCalculation,
  PayoutFeeConfig,
  PayoutValidation,
  RefundFeeConfig,
  ServiceMethod,
} from "../contract/models/index.js";
import type { PagePromise } from "../core/pagination.js";
import { Resource, type RequestOptions } from "./base.js";

export type CreatePayoutParams = RequestBodies["POST /v1/payout"];
export type PayoutLookup = RequestBodies["POST /v1/payout/info"];
export type PayoutHistoryParams = RequestBodies["POST /v1/payout/history"];
export type CalculatePayoutParams = RequestBodies["POST /v1/payout/calculate"];
export type MassPayoutParams = RequestBodies["POST /v1/payout/mass"];
export type PayoutBatchParams = RequestBodies["POST /v1/payout/batch"];

/** Outgoing transfers to external addresses. All routes need the payout key. */
export class Payouts extends Resource {
  /** `POST /v1/payout` — create and (for API keys) auto-approve a payout. Idempotent by `order_id`. */
  create(params: CreatePayoutParams, opts?: RequestOptions): Promise<Payout> {
    return this.call<Payout>("POST /v1/payout", params, opts);
  }

  /** `POST /v1/payout/validate` — dry run: every check of `create`, nothing reserved or sent. */
  validate(
    params: Omit<CreatePayoutParams, "order_id"> & { order_id?: string },
    opts?: RequestOptions,
  ): Promise<PayoutValidation> {
    return this.call<PayoutValidation>(
      "POST /v1/payout/validate",
      params as CreatePayoutParams,
      opts,
    );
  }

  /** `POST /v1/payout/calculate` — commission and net amount without creating anything. */
  calculate(params: CalculatePayoutParams, opts?: RequestOptions): Promise<PayoutCalculation> {
    return this.call<PayoutCalculation>("POST /v1/payout/calculate", params, opts);
  }

  /** `POST /v1/payout/info` — by `uuid` or `order_id`. */
  info(lookup: PayoutLookup, opts?: RequestOptions): Promise<Payout> {
    return this.call<Payout>("POST /v1/payout/info", lookup, opts);
  }

  /** `POST /v1/payout/cancel` — cancel while not yet broadcast (pending/approved/awaiting_cosign). */
  cancel(uuid: string, opts?: RequestOptions): Promise<Payout> {
    return this.call<Payout>("POST /v1/payout/cancel", { uuid }, opts);
  }

  /** `POST /v1/payout/approve` — approve a payout awaiting manual approval. */
  approve(uuid: string, opts?: RequestOptions): Promise<Payout> {
    return this.call<Payout>("POST /v1/payout/approve", { uuid }, opts);
  }

  /** `POST /v1/payout/history` — newest first. */
  history(params: PayoutHistoryParams = {}, opts?: RequestOptions): PagePromise<Payout> {
    return this.page<Payout>("POST /v1/payout/history", params, opts);
  }

  /** `POST /v1/payout/mass` — synchronous batch (≤100); each element reports its own outcome. */
  mass(
    params: MassPayoutParams,
    opts?: RequestOptions,
  ): Promise<{ items: BatchElement<Payout>[] }> {
    return this.call<{ items: BatchElement<Payout>[] }>("POST /v1/payout/mass", params, opts);
  }

  /** `POST /v1/payout/batch` — asynchronous batch (≤5000); track with `batches.info`. */
  batch(params: PayoutBatchParams, opts?: RequestOptions): Promise<BatchSubmitted> {
    return this.call<BatchSubmitted>("POST /v1/payout/batch", params, opts);
  }

  /** `POST /v1/payout/services` — currencies/networks available for payouts. */
  services(opts?: RequestOptions): PagePromise<ServiceMethod> {
    return this.page<ServiceMethod>("POST /v1/payout/services", {}, opts);
  }

  /** `POST /v1/payout/fee-config/get`. */
  getFeeConfig(opts?: RequestOptions): Promise<PayoutFeeConfig> {
    return this.call<PayoutFeeConfig>("POST /v1/payout/fee-config/get", undefined, opts);
  }

  /** `POST /v1/payout/fee-config/set` — who bears the network fee by default. */
  setFeeConfig(
    params: RequestBodies["POST /v1/payout/fee-config/set"],
    opts?: RequestOptions,
  ): Promise<PayoutFeeConfig> {
    return this.call<PayoutFeeConfig>("POST /v1/payout/fee-config/set", params, opts);
  }

  /** `POST /v1/payout/refund-fee-config/get`. */
  getRefundFeeConfig(opts?: RequestOptions): Promise<RefundFeeConfig> {
    return this.call<RefundFeeConfig>("POST /v1/payout/refund-fee-config/get", undefined, opts);
  }

  /** `POST /v1/payout/refund-fee-config/set` — who bears the fee on refunds. */
  setRefundFeeConfig(
    params: RequestBodies["POST /v1/payout/refund-fee-config/set"],
    opts?: RequestOptions,
  ): Promise<RefundFeeConfig> {
    return this.call<RefundFeeConfig>("POST /v1/payout/refund-fee-config/set", params, opts);
  }
}
