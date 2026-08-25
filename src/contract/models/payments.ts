import type { BatchOnError, Network, PaymentStatus, PayoutStatus } from "../enums.js";
import type { Payout } from "./payouts.js";
import { defineKeys } from "../keys.js";
import type { BatchKind, BatchStatus, Money, Timestamp } from "./common.js";

/** One on-chain deposit attributed to an invoice. */
export interface PaymentTx {
  txid: string;
  amount: Money;
  network: Network | (string & {});
  height: number;
  created_at: Timestamp;
}

/** A refund issued against an invoice (a payout in disguise; full detail via `payouts.info`). */
export interface PaymentRefund {
  uuid: string;
  address: string;
  amount: Money;
  status: PayoutStatus;
  is_final: boolean;
  txid: string;
  created_at: Timestamp;
}

/**
 * Invoice as `/v1/payment`, `/v1/payment/info`, `/v1/payment/history` and `/v1/payment/cancel`
 * render it (core `paymentResult`). `refunds`/`refund_status` are present on `info` only.
 */
export interface Payment {
  uuid: string;
  order_id: string;
  status: PaymentStatus;
  is_final: boolean;
  /** Priced amount in `currency`. */
  amount: Money;
  currency: string;
  /** Settlement network; empty until the payer selects one on a multi-network invoice. */
  network: Network | (string & {});
  /** Amount due in the payer asset (`payer_currency`). */
  payer_amount: Money;
  payer_currency: string;
  amount_paid: Money;
  amount_remaining: Money;
  address: string;
  /** XRP destination tag / Stellar memo / TON memo, when the network needs one. */
  destination_tag: string;
  memo: string;
  address_xaddress: string;
  address_muxed: string;
  /** `data:image/png;base64,…` QR of the payment URI. */
  address_qr_code: string;
  is_multi: boolean;
  url: string;
  url_return: string;
  url_success: string;
  expired_at: Timestamp;
  rate_expires_at: Timestamp;
  exchange_rate: Money;
  confirmations: number;
  required_confirmations: number;
  txid: string;
  tx_list: PaymentTx[];
  paid_at: Timestamp | null;
  payer_address: string;
  payer_address_is_refundable: boolean;
  payer_email: string;
  additional_data: string;
  commission: Money;
  merchant_amount: Money;
  document_url: string;
  is_test: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
  refunds?: PaymentRefund[];
  refund_status?: string;
}

export const PaymentKeys = defineKeys<Omit<Payment, "refunds" | "refund_status">>()(
  "uuid",
  "order_id",
  "status",
  "is_final",
  "amount",
  "currency",
  "network",
  "payer_amount",
  "payer_currency",
  "amount_paid",
  "amount_remaining",
  "address",
  "destination_tag",
  "memo",
  "address_xaddress",
  "address_muxed",
  "address_qr_code",
  "is_multi",
  "url",
  "url_return",
  "url_success",
  "expired_at",
  "rate_expires_at",
  "exchange_rate",
  "confirmations",
  "required_confirmations",
  "txid",
  "tx_list",
  "paid_at",
  "payer_address",
  "payer_address_is_refundable",
  "payer_email",
  "additional_data",
  "commission",
  "merchant_amount",
  "document_url",
  "is_test",
  "created_at",
  "updated_at",
);

/** The payer-facing view (`GET /v1/pay/{id}`, `/select`, link checkout): no merchant-only fields. */
export type PublicPayment = Pick<
  Payment,
  | "uuid"
  | "order_id"
  | "status"
  | "is_final"
  | "amount"
  | "currency"
  | "network"
  | "payer_amount"
  | "payer_currency"
  | "amount_paid"
  | "amount_remaining"
  | "address"
  | "destination_tag"
  | "memo"
  | "address_xaddress"
  | "address_muxed"
  | "address_qr_code"
  | "is_multi"
  | "url"
  | "url_return"
  | "url_success"
  | "expired_at"
  | "rate_expires_at"
  | "confirmations"
  | "required_confirmations"
  | "txid"
  | "created_at"
  | "updated_at"
>;

export const PublicPaymentKeys = defineKeys<PublicPayment>()(
  "uuid",
  "order_id",
  "status",
  "is_final",
  "amount",
  "currency",
  "network",
  "payer_amount",
  "payer_currency",
  "amount_paid",
  "amount_remaining",
  "address",
  "destination_tag",
  "memo",
  "address_xaddress",
  "address_muxed",
  "address_qr_code",
  "is_multi",
  "url",
  "url_return",
  "url_success",
  "expired_at",
  "rate_expires_at",
  "confirmations",
  "required_confirmations",
  "txid",
  "created_at",
  "updated_at",
);

/** `/v1/payment/qr`, `/v1/wallet/qr`, `GET /v1/pay/{id}/qr`. */
export interface QrCode {
  /** `data:image/png;base64,…` */
  image: string;
  /** What the QR encodes: a payment URI when `is_uri`, else the bare address. */
  payload: string;
  is_uri: boolean;
  address: string;
}
export const QrCodeKeys = defineKeys<QrCode>()("image", "payload", "is_uri", "address");

/** `/v1/payment/resolve` with `action: "accept"` — the underpayment was kept as full settlement. */
export interface ResolutionAccepted {
  resolution: "accepted";
  payment_uuid: string;
  order_id: string;
  currency: string;
  amount_kept: Money;
}
/** `/v1/payment/resolve` with `action: "refund"` — the underpayment was sent back; the body is the refund payout. */
export type ResolutionRefunded = Payout & { resolution: "refunded" };
export type Resolution = ResolutionAccepted | ResolutionRefunded;

/** `/v1/payment/send-email`. */
export interface EmailSent {
  ok: boolean;
  email: string;
  uuid: string;
}

/** Item of `/v1/payment/services` and `/v1/payout/services`. */
export interface ServiceMethod {
  currency: string;
  network: Network | (string & {});
  is_available: boolean;
  /** Limits are null when the asset cannot be priced right now. */
  limit: { currency?: string; min_amount: Money | null; max_amount: Money | null };
  commission: {
    currency: string;
    fee_amount: Money | null;
    percent: string | null;
    fee_type: string;
  };
}
export const ServiceMethodKeys = defineKeys<ServiceMethod>()(
  "currency",
  "network",
  "is_available",
  "limit",
  "commission",
);

/** `/v1/payment/batch`, `/v1/refund/batch`, `/v1/payout/batch`, `/v1/transfer/batch` acknowledgement. */
export interface BatchSubmitted {
  batch_id: string;
  kind: BatchKind;
  status: BatchStatus;
  count: number;
}
export const BatchSubmittedKeys = defineKeys<BatchSubmitted>()(
  "batch_id",
  "kind",
  "status",
  "count",
);

/** `/v1/batch/info`. */
export interface BatchInfo {
  batch_id: string;
  kind: BatchKind;
  status: BatchStatus;
  on_error: BatchOnError;
  total: number;
  succeeded: number;
  failed: number;
  items: BatchInfoItem[];
  created_at: Timestamp;
  updated_at: Timestamp;
}
export interface BatchInfoItem {
  idx: number;
  ok?: boolean;
  order_id?: string;
  status: string;
  result?: Record<string, unknown>;
  message?: string;
  error_code?: string;
  http_status?: number;
}
export const BatchInfoKeys = defineKeys<BatchInfo>()(
  "batch_id",
  "kind",
  "status",
  "on_error",
  "total",
  "succeeded",
  "failed",
  "items",
  "created_at",
  "updated_at",
);
