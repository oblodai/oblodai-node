import type { FeeBearerResult, Network, PayoutStatus } from "../enums.js";
import { defineKeys } from "../keys.js";
import type { Money, Timestamp } from "./common.js";

/**
 * Payout as `/v1/payout`, `/info`, `/history`, `/cancel`, mass/batch elements and refunds render
 * it (core `PayoutResult`). `error`/`error_code` appear on `info` for failed payouts.
 */
export interface Payout {
  uuid: string;
  /** Merchant reference; null for refunds (they are keyed by `reference`/`refund_for`). */
  order_id: string | null;
  status: PayoutStatus;
  is_final: boolean;
  amount: Money;
  currency: string;
  network: Network | (string & {});
  address: string;
  memo: string;
  /** Total debited from the balance (amount plus commission when the merchant bears the fee). */
  payer_amount: Money;
  commission: Money;
  fee_bearer: FeeBearerResult;
  /** Balance the payout was funded from. */
  source: "business" | "personal" | (string & {});
  approval_required: boolean;
  is_refund: boolean;
  /** For refunds: the invoice being refunded. */
  refund_for: string | null;
  payment_order_id: string | null;
  txid: string;
  document_url: string;
  created_at: Timestamp;
  updated_at: Timestamp;
  error?: string | null;
  error_code?: string | null;
}

export const PayoutKeys = defineKeys<Omit<Payout, "error" | "error_code">>()(
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
);

/** `/v1/payout/calculate`. Amounts are null when the asset cannot be priced right now. */
export interface PayoutCalculation {
  amount: Money | null;
  currency: string;
  network: Network | (string & {});
  commission: Money | null;
  payer_amount: Money | null;
  fee_bearer: FeeBearerResult;
  fee_type: string;
}
export const PayoutCalculationKeys = defineKeys<PayoutCalculation>()(
  "amount",
  "currency",
  "network",
  "commission",
  "payer_amount",
  "fee_bearer",
  "fee_type",
);

/** `/v1/payout/validate` — the dry run; errors are the same the create call would raise. */
export interface PayoutValidation {
  valid: boolean;
  amount: Money;
  currency: string;
  network: Network | (string & {});
  commission: Money;
  payer_amount: Money;
  fee_bearer: FeeBearerResult;
  /** Which balance would fund it (`business`/`personal`), when reported. */
  funded_by?: string;
  /** Non-empty when part of the balance is still maturing (reorg window). */
  maturity_note: string;
}
export const PayoutValidationKeys = defineKeys<Omit<PayoutValidation, "funded_by">>()(
  "valid",
  "amount",
  "currency",
  "network",
  "commission",
  "payer_amount",
  "fee_bearer",
  "maturity_note",
);

/** `/v1/transfer/to-personal` and `/v1/transfer/to-user`. */
export interface Transfer {
  uuid: string;
  currency: string;
  amount: Money;
  direction?: string;
  personal_balance?: Money;
  business_balance?: Money;
  document_url: string;
  to_user_id?: string;
}

/** `/v1/payout/fee-config/*`, `/v1/payout/refund-fee-config/*`, `/v1/payment/fee-config/*`. */
export interface PayoutFeeConfig {
  fee_on_recipient: boolean;
  configured?: boolean;
}
export interface RefundFeeConfig {
  fee_on_customer: boolean;
  configured?: boolean;
}
export interface PaymentFeeConfig {
  payer_pays_percent: number;
  enabled?: boolean;
}
