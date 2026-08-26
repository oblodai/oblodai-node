import type { RequestBodies } from "../contract/requests.js";
import type { BatchSubmitted, Payout, Resolution } from "../contract/models/index.js";
import { Resource, type RequestOptions } from "./base.js";

export type RefundParams = RequestBodies["POST /v1/payment/refund"];
export type ResolveParams = RequestBodies["POST /v1/payment/resolve"];
export type RefundBatchParams = RequestBodies["POST /v1/refund/batch"];

/** Refunds are payouts in the invoice's own asset; underpayments are resolved (accept or refund). */
export class Refunds extends Resource {
  /**
   * `POST /v1/payment/refund` — refund a paid invoice, fully or partially.
   *
   * Codes worth branching on: `refund.nothing_to_refund`, `refund.exceeds_refundable`,
   * `refund.no_address` (the payer address is not refundable — ask for one),
   * `refund.dust` (below the network's minimum), `refund.reference_collision`,
   * `payout.insufficient_funds` (retryable).
   */
  create(params: RefundParams, opts?: RequestOptions): Promise<Payout> {
    return this.call<Payout>("POST /v1/payment/refund", params, opts);
  }

  /**
   * `POST /v1/payment/resolve` — settle an underpaid (`wrong_amount`) invoice.
   *
   * Codes worth branching on: `payment.not_found`, `payment.bad_status` (not `wrong_amount`),
   * `refund.nothing_to_refund`, `refund.no_address`, `refund.exceeds_excess`.
   */
  resolve(params: ResolveParams, opts?: RequestOptions): Promise<Resolution> {
    return this.call<Resolution>("POST /v1/payment/resolve", params, opts);
  }

  /**
   * `POST /v1/refund/batch` — up to 5000 refunds; track with `batches.info`.
   *
   * Codes worth branching on: `payout.batch_too_large`, `payout.empty_batch`,
   * `refund.reference_collision`, `request.missing_field` (an item without `reference`),
   * `idempotency.key_reused`.
   */
  batch(params: RefundBatchParams, opts?: RequestOptions): Promise<BatchSubmitted> {
    return this.call<BatchSubmitted>("POST /v1/refund/batch", params, opts);
  }
}
