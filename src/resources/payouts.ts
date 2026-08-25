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
import type { PagePromise, PageParams } from "../core/pagination.js";
import { Resource, type RequestOptions, type Ref } from "./base.js";

export type CreatePayoutParams = RequestBodies["POST /v1/payout"];
/** Identify a payout by its `uuid` or by your `order_id` (one of them is required). */
export type PayoutLookup =
  { uuid: string; order_id?: string } | { order_id: string; uuid?: string };
export type PayoutHistoryParams = RequestBodies["POST /v1/payout/history"];
export type CalculatePayoutParams = RequestBodies["POST /v1/payout/calculate"];
export type ValidatePayoutParams = Omit<CreatePayoutParams, "order_id"> & { order_id?: string };
export type MassPayoutParams = RequestBodies["POST /v1/payout/mass"];
export type PayoutBatchParams = RequestBodies["POST /v1/payout/batch"];

/** Outgoing transfers to external addresses. Every route here needs the payout key. */
export class Payouts extends Resource {
  /** `POST /v1/payout` — create and (for API keys) auto-approve a payout. Idempotent by `order_id` and Idempotency-Key. Errors to handle: `payout.insufficient_funds` (retryable), `payout.funds_maturing`, `payout.bad_address`, `payout.memo_required`. */
  create(params: CreatePayoutParams, opts?: RequestOptions): Promise<Payout> {
    return this.call<Payout>("POST /v1/payout", params, opts);
  }

  /** `POST /v1/payout/validate` — dry run: every check of `create`, nothing reserved or sent. Same errors as `create`. */
  validate(params: ValidatePayoutParams, opts?: RequestOptions): Promise<PayoutValidation> {
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

  /** `POST /v1/payout/info` — by `uuid` or `order_id`. Refunds are payouts too (`is_refund`). */
  info(lookup: Ref<PayoutLookup>, opts?: RequestOptions): Promise<Payout> {
    return this.call<Payout>("POST /v1/payout/info", byUuid(lookup), opts);
  }

  /** Alias of `info`. */
  get(lookup: Ref<PayoutLookup>, opts?: RequestOptions): Promise<Payout> {
    return this.info(lookup, opts);
  }

  /** `POST /v1/payout/cancel` — cancel while not yet broadcast (pending/approved/awaiting_cosign); 409 `payout.not_pending` after. */
  cancel(payout: Ref<{ uuid: string }>, opts?: RequestOptions): Promise<Payout> {
    return this.call<Payout>("POST /v1/payout/cancel", { uuid: uuidOf(payout) }, opts);
  }

  /** `POST /v1/payout/approve` — approve a payout awaiting manual approval. */
  approve(payout: Ref<{ uuid: string }>, opts?: RequestOptions): Promise<Payout> {
    return this.call<Payout>("POST /v1/payout/approve", { uuid: uuidOf(payout) }, opts);
  }

  /** `POST /v1/payout/history` — newest first. `kind: "refund"` lists refunds only. */
  history(params: PayoutHistoryParams = {}, opts?: RequestOptions): PagePromise<Payout> {
    return this.page<Payout>("POST /v1/payout/history", params, opts);
  }

  /** Alias of `history`. */
  list(params: PayoutHistoryParams = {}, opts?: RequestOptions): PagePromise<Payout> {
    return this.history(params, opts);
  }

  /** `POST /v1/payout/mass` — SYNCHRONOUS batch (≤100): each element reports its own outcome in the response. */
  mass(
    params: MassPayoutParams,
    opts?: RequestOptions,
  ): Promise<{ items: BatchElement<Payout>[] }> {
    return this.call<{ items: BatchElement<Payout>[] }>("POST /v1/payout/mass", params, opts);
  }

  /** `POST /v1/payout/batch` — ASYNCHRONOUS batch (≤5000): returns a ticket; poll `batches.info`. `order_id` is required on every item. */
  batch(params: PayoutBatchParams, opts?: RequestOptions): Promise<BatchSubmitted> {
    return this.call<BatchSubmitted>("POST /v1/payout/batch", params, opts);
  }

  /** `POST /v1/payout/services` — currencies/networks available for payouts. */
  services(params: PageParams = {}, opts?: RequestOptions): PagePromise<ServiceMethod> {
    return this.page<ServiceMethod>("POST /v1/payout/services", params, opts);
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

function byUuid(ref: Ref<PayoutLookup>): PayoutLookup {
  return typeof ref === "string" ? { uuid: ref } : ref;
}
function uuidOf(ref: Ref<{ uuid: string }>): string {
  return typeof ref === "string" ? ref : ref.uuid;
}
