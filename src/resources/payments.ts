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
import type { PagePromise } from "../core/pagination.js";
import { Resource, type RequestOptions } from "./base.js";

export type CreatePaymentParams = RequestBodies["POST /v1/payment"];
export type PaymentLookup = RequestBodies["POST /v1/payment/info"];
export type PaymentHistoryParams = RequestBodies["POST /v1/payment/history"];
export type SelectPaymentMethodParams = RequestBodies["POST /v1/pay/{id}/select"];
export type PaymentBatchParams = RequestBodies["POST /v1/payment/batch"];

/** Invoices: create, look up, cancel, list, and the payer-facing checkout endpoints. */
export class Payments extends Resource {
  /** `POST /v1/payment` — create an invoice. Idempotent by `order_id` and by Idempotency-Key. */
  create(params: CreatePaymentParams, opts?: RequestOptions): Promise<Payment> {
    return this.call<Payment>("POST /v1/payment", params, opts);
  }

  /** `POST /v1/payment/info` — by `uuid` or `order_id`; includes `refunds` and `refund_status`. */
  info(lookup: PaymentLookup, opts?: RequestOptions): Promise<Payment> {
    return this.call<Payment>("POST /v1/payment/info", lookup, opts);
  }

  /** `POST /v1/payment/cancel` — cancel an unpaid invoice (409 once a deposit was seen). */
  cancel(lookup: PaymentLookup, opts?: RequestOptions): Promise<Payment> {
    return this.call<Payment>("POST /v1/payment/cancel", lookup, opts);
  }

  /** `POST /v1/payment/history` — newest first; `await` for a page, `for await` for everything. */
  history(params: PaymentHistoryParams = {}, opts?: RequestOptions): PagePromise<Payment> {
    return this.page<Payment>("POST /v1/payment/history", params, opts);
  }

  /** `POST /v1/payment/batch` — create up to 5000 invoices asynchronously; track with `batches.info`. */
  batch(params: PaymentBatchParams, opts?: RequestOptions): Promise<BatchSubmitted> {
    return this.call<BatchSubmitted>("POST /v1/payment/batch", params, opts);
  }

  /** `POST /v1/payment/qr` — QR image of the invoice's payment URI. */
  qr(lookup: PaymentLookup, opts?: RequestOptions): Promise<QrCode> {
    return this.call<QrCode>("POST /v1/payment/qr", lookup, opts);
  }

  /** `POST /v1/payment/services` — currencies/networks accepted for deposits, with limits and fees. */
  services(opts?: RequestOptions): PagePromise<ServiceMethod> {
    return this.page<ServiceMethod>("POST /v1/payment/services", {}, opts);
  }

  /** `POST /v1/payment/send-email` — email the receipt (defaults to the invoice's `payer_email`). */
  sendEmail(
    params: RequestBodies["POST /v1/payment/send-email"],
    opts?: RequestOptions,
  ): Promise<EmailSent> {
    return this.call<EmailSent>("POST /v1/payment/send-email", params, opts);
  }

  /** `POST /v1/payment/resend` — re-deliver the invoice's last webhook. */
  resend(lookup: PaymentLookup, opts?: RequestOptions): Promise<OkResult> {
    return this.call<OkResult>("POST /v1/payment/resend", lookup, opts);
  }

  // --- payer-facing (public, unsigned) — for custom checkout pages ---

  /** `GET /v1/pay/{id}` — the invoice as the payer sees it. */
  publicView(uuid: string, opts?: RequestOptions): Promise<PublicPayment> {
    return this.call<PublicPayment>("GET /v1/pay/{id}", undefined, {
      ...opts,
      pathParams: { id: uuid },
    });
  }

  /** `POST /v1/pay/{id}/select` — pick the asset/network on a multi-currency invoice. */
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

  /** `GET /v1/pay/{id}/qr` — QR for the payer page. */
  publicQr(uuid: string, opts?: RequestOptions): Promise<QrCode> {
    return this.call<QrCode>("GET /v1/pay/{id}/qr", undefined, {
      ...opts,
      pathParams: { id: uuid },
    });
  }
}
