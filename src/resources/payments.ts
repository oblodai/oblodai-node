import type { RequestBodies } from "../contract/requests.js";
import type {
  BatchSubmitted,
  EmailSent,
  OkResult,
  Payment,
  PublicPayment,
  QrCode,
  ServiceMethod,
} from "../contract/models/index.js";
import type { PagePromise, PageParams } from "../core/pagination.js";
import { Resource, type RequestOptions, type Ref } from "./base.js";

export type CreatePaymentParams = RequestBodies["POST /v1/payment"];
/** Identify an invoice by its `uuid` or by your `order_id` (one of them is required). */
export type PaymentLookup =
  { uuid: string; order_id?: string } | { order_id: string; uuid?: string };
export type PaymentHistoryParams = Omit<RequestBodies["POST /v1/payment/history"], "kind">;
export type SelectPaymentMethodParams = RequestBodies["POST /v1/pay/{id}/select"];
export type PaymentBatchParams = RequestBodies["POST /v1/payment/batch"];

/** Invoices: create, look up, cancel, list, and the payer-facing checkout endpoints. Payment key. */
export class Payments extends Resource {
  /**
   * `POST /v1/payment` — create an invoice. Idempotent by `order_id` and by Idempotency-Key.
   *
   * Codes worth branching on: `payment.bad_amount`, `payment.below_minimum`,
   * `payment.minimum_unavailable` (rate feed down — retryable), `payment.unsupported_network`,
   * `payment.network_required` (multi-network asset, no `network` given),
   * `request.unknown_currency`, `idempotency.key_reused` (same key, different body).
   */
  create(params: CreatePaymentParams, opts?: RequestOptions): Promise<Payment> {
    return this.call<Payment>("POST /v1/payment", params, opts);
  }

  /** `POST /v1/payment/info` — by `uuid` or `order_id`; includes `refunds` and `refund_status`. */
  info(lookup: Ref<PaymentLookup>, opts?: RequestOptions): Promise<Payment> {
    return this.call<Payment>("POST /v1/payment/info", byUuid(lookup), opts);
  }

  /** Alias of `info`. */
  get(lookup: Ref<PaymentLookup>, opts?: RequestOptions): Promise<Payment> {
    return this.info(lookup, opts);
  }

  /** `POST /v1/payment/cancel` — cancel an unpaid invoice (409 `invoice.not_payable` once a deposit was seen). */
  cancel(lookup: Ref<PaymentLookup>, opts?: RequestOptions): Promise<Payment> {
    return this.call<Payment>("POST /v1/payment/cancel", byUuid(lookup), opts);
  }

  /** `POST /v1/payment/history` — newest first; `await` for a page, `for await` for everything. */
  history(params: PaymentHistoryParams = {}, opts?: RequestOptions): PagePromise<Payment> {
    return this.page<Payment>("POST /v1/payment/history", params, opts);
  }

  /** Alias of `history`. */
  list(params: PaymentHistoryParams = {}, opts?: RequestOptions): PagePromise<Payment> {
    return this.history(params, opts);
  }

  /**
   * `POST /v1/payment/batch` — create up to 5000 invoices asynchronously; track with `batches.info`.
   *
   * Codes worth branching on: `payment.bad_amount`, `payment.below_minimum`,
   * `request.unknown_currency`, `request.missing_field` (an item without `order_id`),
   * `payout.batch_too_large`, `idempotency.key_reused`.
   */
  batch(params: PaymentBatchParams, opts?: RequestOptions): Promise<BatchSubmitted> {
    return this.call<BatchSubmitted>("POST /v1/payment/batch", params, opts);
  }

  /** `POST /v1/payment/qr` — QR image of the invoice's payment URI. */
  qr(lookup: Ref<PaymentLookup>, opts?: RequestOptions): Promise<QrCode> {
    return this.call<QrCode>("POST /v1/payment/qr", byUuid(lookup), opts);
  }

  /** `POST /v1/payment/services` — currencies/networks accepted for deposits, with limits and fees. */
  services(params: PageParams = {}, opts?: RequestOptions): PagePromise<ServiceMethod> {
    return this.page<ServiceMethod>("POST /v1/payment/services", params, opts);
  }

  /** `POST /v1/payment/send-email` — email the receipt (defaults to the invoice's `payer_email`). */
  sendEmail(
    params: RequestBodies["POST /v1/payment/send-email"],
    opts?: RequestOptions,
  ): Promise<EmailSent> {
    return this.call<EmailSent>("POST /v1/payment/send-email", params, opts);
  }

  /** `POST /v1/payment/resend` — re-deliver the invoice's last webhook. */
  resend(lookup: Ref<PaymentLookup>, opts?: RequestOptions): Promise<OkResult> {
    return this.call<OkResult>("POST /v1/payment/resend", byUuid(lookup), opts);
  }

  // --- payer-facing (public, unsigned) — for custom checkout pages ---

  /** `GET /v1/pay/{id}` — the invoice as the payer sees it. No credentials needed. */
  publicView(uuid: string, opts?: RequestOptions): Promise<PublicPayment> {
    return this.call<PublicPayment>("GET /v1/pay/{id}", undefined, {
      ...opts,
      pathParams: { id: uuid },
    });
  }

  /** `POST /v1/pay/{id}/select` — pick the asset/network on a multi-currency invoice. No credentials needed. */
  select(
    uuid: string,
    params: SelectPaymentMethodParams,
    opts?: RequestOptions,
  ): Promise<PublicPayment> {
    return this.call<PublicPayment>("POST /v1/pay/{id}/select", params, {
      ...opts,
      pathParams: { id: uuid },
    });
  }

  /** `GET /v1/pay/{id}/qr` — QR for the payer page. No credentials needed. */
  publicQr(uuid: string, opts?: RequestOptions): Promise<QrCode> {
    return this.call<QrCode>("GET /v1/pay/{id}/qr", undefined, {
      ...opts,
      pathParams: { id: uuid },
    });
  }
}

/** A bare string is taken as the `uuid`. */
function byUuid(ref: Ref<PaymentLookup>): PaymentLookup {
  return typeof ref === "string" ? { uuid: ref } : ref;
}
