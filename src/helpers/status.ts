import type { PaymentStatus, PayoutStatus } from "../contract/enums.js";

/** Invoice statuses after which nothing else can happen. */
export const FINAL_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  "paid",
  "paid_over",
  "wrong_amount",
  "expired",
  "cancelled",
];
/** Payout statuses after which nothing else can happen. */
export const FINAL_PAYOUT_STATUSES: readonly PayoutStatus[] = ["confirmed", "failed", "cancelled"];

export function isPaymentFinal(status: PaymentStatus | string): boolean {
  return (FINAL_PAYMENT_STATUSES as readonly string[]).includes(status);
}

/** `paid` or `paid_over` — the merchant has the money. `wrong_amount` is NOT paid: resolve it. */
export function isPaymentPaid(status: PaymentStatus | string): boolean {
  return status === "paid" || status === "paid_over";
}

/** The invoice is waiting for a merchant decision (underpaid). */
export function isPaymentUnderpaid(status: PaymentStatus | string): boolean {
  return status === "wrong_amount";
}

export function isPayoutFinal(status: PayoutStatus | string): boolean {
  return (FINAL_PAYOUT_STATUSES as readonly string[]).includes(status);
}

/** The payout reached the chain and is irreversible. */
export function isPayoutSucceeded(status: PayoutStatus | string): boolean {
  return status === "confirmed";
}
