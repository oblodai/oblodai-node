import type { Network } from "../enums.js";
import { defineKeys } from "../keys.js";
import type { Money, Timestamp } from "./common.js";

/** `/v1/balance`. */
export interface Balance {
  balance: { merchant: BalanceEntry[] };
}
export interface BalanceEntry {
  currency: string;
  balance: Money;
}
export const BalanceKeys = defineKeys<Balance>()("balance");

/** `/v1/referral/info`. */
export interface ReferralInfo {
  code: string;
  link: string;
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

export interface VrcsStatus {
  enabled: boolean;
}

/** Static (permanent) deposit wallet — `/v1/wallet`. */
export interface Wallet {
  uuid: string;
  address: string;
  network: Network | string;
  currency: string;
  order_id: string;
  url: string;
  document_url: string;
}
export const WalletKeys = defineKeys<Wallet>()(
  "uuid",
  "address",
  "network",
  "currency",
  "order_id",
  "url",
  "document_url",
);

export interface WalletBlocked {
  address: string;
  blocked: boolean;
}

/** `/v1/auto-withdraw/*` entry. */
export interface AutoWithdrawRule {
  currency: string;
  network: Network | string;
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
  network: Network | string;
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
  network: Network | string;
  available: boolean;
}

/** `/v1/split/rule` and `/v1/split/rule/list` items. */
export interface SplitRule {
  rule_id: string;
  percent: string;
  active?: boolean;
  address?: string;
  network?: Network | string;
  note?: string;
  reversible?: boolean;
}
export const SplitRuleKeys = defineKeys<Required<SplitRule>>()(
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
  status: string;
  from: string;
  to: string;
  period: string;
  created_at: Timestamp;
  updated_at: Timestamp;
}
