import type { Network } from "../enums.js";
import { defineKeys } from "../keys.js";
import type { Money, Timestamp } from "./common.js";

/** `/v1/balance`. */
export interface Balance {
  balance: { merchant: BalanceEntry[] };
}
export interface BalanceEntry {
  currency: string;
  /** Available (spendable) balance. */
  balance: Money;
}
export const BalanceKeys = defineKeys<Balance>()("balance");

/** `/v1/referral/info`. */
export interface ReferralInfo {
  code: string;
  link: string;
  /** Referral tiers, basis points. */
  tier_bps: number[];
  referred_count: number;
  earnings_by_asset: Record<string, Money>;
  week: { referred_count: number; earnings_by_asset: Record<string, Money> };
}
export const ReferralInfoKeys = defineKeys<ReferralInfo>()(
  "code",
  "link",
  "tier_bps",
  "referred_count",
  "earnings_by_asset",
  "week",
);

/** `/v1/vrcs` — volatility risk control (auto-convert volatile deposits to USDT). */
export interface VrcsStatus {
  enabled: boolean;
}

/** Static (permanent) deposit wallet — `/v1/wallet`. */
export interface Wallet {
  uuid: string;
  address: string;
  network: Network | (string & {});
  currency: string;
  order_id: string;
  /** Hosted page showing the address and QR. */
  url: string;
  document_url: string;
  /** XRP destination tag / TON and Stellar memo, when the network needs one. */
  destination_tag?: string;
  memo?: string;
  address_xaddress?: string;
  address_muxed?: string;
}
export const WalletKeys = defineKeys<
  Omit<Wallet, "destination_tag" | "memo" | "address_xaddress" | "address_muxed">
>()("uuid", "address", "network", "currency", "order_id", "url", "document_url");

export interface WalletBlocked {
  uuid?: string;
  address: string;
  blocked: boolean;
}

/** `/v1/auto-withdraw/*` entry. */
export interface AutoWithdrawRule {
  currency: string;
  network: Network | (string & {});
  address: string;
  min_amount: Money;
}
export const AutoWithdrawRuleKeys = defineKeys<AutoWithdrawRule>()(
  "currency",
  "network",
  "address",
  "min_amount",
);

/** `/v1/api-allowlist/*` — entries are CIDRs. */
export interface ApiAllowlist {
  enabled: boolean;
  items: string[];
}
export const ApiAllowlistKeys = defineKeys<ApiAllowlist>()("enabled", "items");

export interface DiscountRule {
  currency: string;
  network: Network | (string & {});
  /** Positive = discount for the payer, negative = markup. */
  discount_percent: number;
}
export const DiscountRuleKeys = defineKeys<DiscountRule>()(
  "currency",
  "network",
  "discount_percent",
);

export interface AccuracyConfig {
  enabled: boolean;
  accuracy_percent: number;
}
export interface AutoRefundConfig {
  overpay: boolean;
  underpay: boolean;
  configured?: boolean;
}
export interface AcceptedMethod {
  currency: string;
  network: Network | (string & {});
  available: boolean;
  /** Why it is unavailable, when it is. */
  reason?: string;
}

/** `/v1/split/rule` and `/v1/split/rule/list` items. */
export interface SplitRule {
  rule_id: string;
  /** Share of every payment, percent, as a decimal string. */
  percent: string;
  active?: boolean;
  address?: string;
  network?: Network | (string & {});
  /** Set for on-platform partner rules (reversible on refund). */
  merchant_id?: string;
  note?: string;
  reversible?: boolean;
}
export const SplitRuleKeys = defineKeys<Required<Omit<SplitRule, "merchant_id">>>()(
  "rule_id",
  "percent",
  "active",
  "address",
  "network",
  "note",
  "reversible",
);
export interface SplitConfig {
  refund_hold_seconds: number;
}
export interface SplitOptIn {
  enabled: boolean;
}

/** `/v1/documents/jobs` and `/jobs/info`. */
export interface DocumentJob {
  job_id: string;
  kind: string;
  format: string;
  lang: string;
  status: "queued" | "processing" | "ready" | "failed" | (string & {});
  period: { from: string; to: string };
  /** Hint, seconds, while queued. */
  ready_within?: number;
  /** Set once ready; download with `documents.jobFile`. */
  file?: Record<string, unknown>;
  error?: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}
