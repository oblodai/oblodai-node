import type { DeliveryStatus, EventType, Network, PaymentStatus, PayoutStatus } from "../enums.js";
import { defineKeys } from "../keys.js";
import type { Money, Timestamp } from "./common.js";
import type { Payout } from "./payouts.js";

/** `POST /v1/webhooks`. */
export interface WebhookEndpoint {
  endpoint_id: string;
  url: string;
  /** Shown once: at first registration and at rotation. Absent when only the URL was changed. */
  secret?: string;
}
export const WebhookEndpointKeys = defineKeys<Required<WebhookEndpoint>>()(
  "endpoint_id",
  "url",
  "secret",
);

/** `POST /v1/webhooks/rotate-secret`. */
export interface WebhookSecretRotated extends Required<WebhookEndpoint> {
  /** Until then deliveries also carry `X-Webhook-Signature-Prev` signed with the old secret. */
  previous_secret_valid_until: Timestamp;
}
export const WebhookSecretRotatedKeys = defineKeys<WebhookSecretRotated>()(
  "endpoint_id",
  "url",
  "secret",
  "previous_secret_valid_until",
);

/** Item of `/v1/webhooks/deliveries` and `GET /v1/sandbox/webhooks` (which adds `payload`, drops `sequence`). */
export interface WebhookDelivery {
  id: string;
  url: string;
  event_type: EventType | (string & {});
  status: DeliveryStatus;
  attempts: number;
  last_error: string;
  sequence?: number;
  created_at: Timestamp;
  updated_at: Timestamp;
  payload?: Record<string, unknown>;
}
export const WebhookDeliveryKeys = defineKeys<Required<Omit<WebhookDelivery, "payload">>>()(
  "id",
  "url",
  "event_type",
  "status",
  "attempts",
  "last_error",
  "sequence",
  "created_at",
  "updated_at",
);

/** `/v1/test-webhook/*` and `/v1/payment/testing-webhook`. */
export interface WebhookTestResult {
  ok: boolean;
  signed: boolean;
  /** Absent when the receiver could not be reached (see `error`). */
  status_code?: number;
  error?: string;
  /** `/v1/payment/testing-webhook` only. */
  url?: string;
  duration_ms?: number;
}
export const WebhookTestResultKeys = defineKeys<
  Required<Omit<WebhookTestResult, "error" | "url" | "duration_ms">>
>()("ok", "signed", "status_code");

/** Fields every delivered event carries. */
interface EventBase {
  uuid: string;
  /** Null on refund payouts. */
  order_id: string | null;
  is_final: boolean;
  /** When the state change was committed — order events by this, or by `sequence`. */
  event_at: Timestamp;
  /** Global, increasing (gaps are normal); a lower sequence arriving later is stale. */
  sequence: number;
  txid: string;
  /**
   * Present and true ONLY on rehearsal deliveries (`webhooks.test`, sandbox). The body is signed
   * like a live one, so a handler must check this flag (or `X-Webhook-Test`) and never act on a
   * test event as if money moved.
   */
  test?: boolean;
}

/** `invoice.<status>` — an invoice changed state. */
export interface PaymentEvent extends EventBase {
  type: "payment";
  status: PaymentStatus;
  amount: Money;
  currency: string;
  network: Network | (string & {});
  payer_amount: Money;
  payer_currency: string;
  /** What actually landed on the address, in `payer_currency`. */
  payment_amount: Money;
  payer_address: string;
  payer_address_is_refundable: boolean;
  additional_data: string;
}
export const PaymentEventKeys = defineKeys<Omit<PaymentEvent, "test">>()(
  "type",
  "uuid",
  "order_id",
  "status",
  "is_final",
  "amount",
  "currency",
  "network",
  "payer_amount",
  "payer_currency",
  "payment_amount",
  "payer_address",
  "payer_address_is_refundable",
  "additional_data",
  "txid",
  "event_at",
  "sequence",
);

/** `payout.<status>` — a payout (or refund) changed state; the body is the payout itself. */
export interface PayoutEvent
  extends
    Omit<Payout, "error" | "error_code" | "wallet_uuid">,
    Pick<EventBase, "event_at" | "sequence" | "test"> {
  type: "payout";
  status: PayoutStatus;
}
export const PayoutEventKeys = defineKeys<Omit<PayoutEvent, "test">>()(
  "type",
  "uuid",
  "order_id",
  "status",
  "is_final",
  "amount",
  "currency",
  "network",
  "address",
  "memo",
  "payer_amount",
  "commission",
  "fee_bearer",
  "source",
  "approval_required",
  "is_refund",
  "refund_for",
  "payment_order_id",
  "txid",
  "document_url",
  "created_at",
  "updated_at",
  "event_at",
  "sequence",
);

/** `wallet.paid` — a deposit landed on a static wallet. */
export interface WalletEvent extends EventBase {
  type: "wallet";
  status: "paid";
  address: string;
  currency: string;
  network: Network | (string & {});
  payer_currency: string;
  payment_amount: Money;
}
export const WalletEventKeys = defineKeys<Omit<WalletEvent, "test">>()(
  "type",
  "uuid",
  "order_id",
  "status",
  "is_final",
  "address",
  "currency",
  "network",
  "payer_currency",
  "payment_amount",
  "txid",
  "event_at",
  "sequence",
);

export type WebhookEvent = PaymentEvent | PayoutEvent | WalletEvent;

/**
 * A delivery whose `type` this SDK release does not know. The core adds event types without asking,
 * and a receiver that throws on one it has not heard of turns a new feature into an outage — so an
 * unknown type is returned verbatim, with the raw `type` string, for the handler to ignore or log.
 */
export interface UnknownWebhookEvent {
  type: string;
  uuid?: string;
  sequence?: number;
  event_at?: Timestamp;
  test?: boolean;
  [field: string]: unknown;
}

/** What a verified delivery can be: one of the known events, or one from a newer core. */
export type AnyWebhookEvent = WebhookEvent | UnknownWebhookEvent;

/** The event types this release models field by field. */
export const KNOWN_EVENT_KINDS = ["payment", "payout", "wallet"] as const;

/**
 * Narrow a delivery to the modelled union. Use it before switching on `type` so the compiler keeps
 * the per-kind fields:
 *
 * ```ts
 * const { event } = verifyWebhookDelivery(raw, headers, { secret });
 * if (!isKnownEvent(event)) return void log.info("unknown event type", event.type);
 * if (event.type === "payment") console.log(event.payer_amount);
 * ```
 */
export function isKnownEvent(event: AnyWebhookEvent): event is WebhookEvent {
  return (KNOWN_EVENT_KINDS as readonly string[]).includes(event.type);
}
