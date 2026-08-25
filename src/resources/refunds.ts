import type { RequestBodies } from "../contract/requests.js";
import type { BatchSubmitted, Payout, Resolution } from "../contract/models/index.js";
import { Resource, type RequestOptions } from "./base.js";

export type RefundParams = RequestBodies["POST /v1/payment/refund"];
export type ResolveParams = RequestBodies["POST /v1/payment/resolve"];
export type RefundBatchParams = RequestBodies["POST /v1/refund/batch"];

/** Refunds are payouts in the invoice's own asset; underpayments are resolved (accept or refund). */
export class Refunds extends Resource {
  /** `POST /v1/payment/refund` — refund a paid invoice, fully or partially. Requires the payout key. */
  create(params: RefundParams, opts?: RequestOptions): Promise<Payout> {
    return this.call<Payout>("POST /v1/payment/refund", params, opts);
  }

  /** `POST /v1/payment/resolve` — settle an underpaid (`wrong_amount`) invoice. */
  resolve(params: ResolveParams, opts?: RequestOptions): Promise<Resolution> {
    return this.call<Resolution>("POST /v1/payment/resolve", params, opts);
  }

  /** `POST /v1/refund/batch` — up to 5000 refunds; track with `batches.info`. */
  batch(params: RefundBatchParams, opts?: RequestOptions): Promise<BatchSubmitted> {
    return this.call<BatchSubmitted>("POST /v1/refund/batch", params, opts);
  }
}
