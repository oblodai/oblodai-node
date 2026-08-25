import type { Money } from "./common.js";

/** `/v1/sandbox/faucet`. */
export interface FaucetResult {
  asset: string;
  amount: Money;
  journal_id: string;
}
/** `/v1/sandbox/deposit`. */
export interface SandboxDeposit {
  invoice_id: string;
  amount: Money;
  confirmations: number;
  txid: string;
}
/** `/v1/sandbox/reset`. */
export interface SandboxReset {
  invoices_cancelled: number;
  balances_zeroed: number;
}
