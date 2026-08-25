import type { FeeBearerResult } from "../enums.js";

/** Decimal amount rendered by the core at the asset's own scale (`"10.000000"` for USDT). Never a float. */
export type Money = string;
/** RFC 3339 timestamp in UTC (`2026-08-25T20:58:55Z`). */
export type Timestamp = string;

/** Element of every batch listing (`/v1/payout/mass`, `/v1/payout/link/batch`, `/v1/batch/info`). */
export interface BatchElement<T> {
  idx: number;
  ok: boolean;
  order_id?: string;
  result?: T;
  message?: string;
  error_code?: string;
  http_status?: number;
}

/** How a fee was settled on a priced result. `fee_type` is the pricing mode (`percent`/`fixed`/…). */
export interface FeeInfo {
  commission: Money;
  fee_bearer: FeeBearerResult;
  fee_type: string;
}

/** Kinds of asynchronous batches. */
export type BatchKind =
  "payment" | "payout" | "refund" | "transfer" | "payout_link" | (string & {});
/** Lifecycle of an asynchronous batch. */
export type BatchStatus = "queued" | "processing" | "completed" | "stopped" | (string & {});

export interface OkResult {
  ok: boolean;
}
export const OkResultKeys = ["ok"] as const;
