import { PaymentStatus } from "../generated/enums.js";
import type { OpenEnum, PayoutStatus } from "../generated/enums.js";
import { isPaymentSuccess, isPayoutSuccess } from "../generated/status.js";

// FINAL_<X>_STATUSES, SUCCESS_<X>_STATUSES, is<X>Final and is<X>Success of every classified status
// enum come from the contract (`x-status-classes`); below are only the names this SDK has always
// offered on top of them.
export * from "../generated/status.js";

/** `paid` or `paid_over` — the merchant has the money. `wrong_amount` is NOT paid: resolve it. */
export function isPaymentPaid(status: OpenEnum<PaymentStatus>): boolean {
  return isPaymentSuccess(status);
}

/** The invoice is waiting for a merchant decision (underpaid): call `payments.resolve`. */
export function isPaymentUnderpaid(status: OpenEnum<PaymentStatus>): boolean {
  return status === PaymentStatus.WRONG_AMOUNT;
}

/** The payout reached the chain and is irreversible. */
export function isPayoutSucceeded(status: OpenEnum<PayoutStatus>): boolean {
  return isPayoutSuccess(status);
}
