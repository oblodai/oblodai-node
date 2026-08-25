import { defineKeys } from "../keys.js";
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
/** `/v1/sandbox/webhooks/replay`. */
export interface SandboxReplay {
  ok: boolean;
  delivery_id: string;
}
export const FaucetResultKeys = defineKeys<FaucetResult>()("asset", "amount", "journal_id");
export const SandboxDepositKeys = defineKeys<SandboxDeposit>()(
  "invoice_id",
  "amount",
  "confirmations",
  "txid",
);
export const SandboxResetKeys = defineKeys<SandboxReset>()("invoices_cancelled", "balances_zeroed");
export const SandboxReplayKeys = defineKeys<SandboxReplay>()("ok", "delivery_id");
