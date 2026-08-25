import type { Network } from "../enums.js";
import { defineKeys } from "../keys.js";

/** `GET /v1/currencies`. */
export interface Currencies {
  currencies: CurrencyInfo[];
  pricing_currencies: PricingCurrency[];
}
export interface CurrencyInfo {
  currency: string;
  decimals: number;
  networks: CurrencyNetwork[];
}
export interface CurrencyNetwork {
  network: Network | string;
  /** `native` | `token`. */
  kind: string;
  contract?: string;
  min_confirmations: number;
  available: boolean;
  deposit_available: boolean;
  payout_available: boolean;
  default_offer: boolean;
}
export interface PricingCurrency {
  currency: string;
  decimals: number;
  fiat: boolean;
}
export const CurrenciesKeys = defineKeys<Currencies>()("currencies", "pricing_currencies");
export const CurrencyNetworkKeys = defineKeys<Omit<CurrencyNetwork, "contract">>()(
  "network",
  "kind",
  "min_confirmations",
  "available",
  "deposit_available",
  "payout_available",
  "default_offer",
);

/** `/v1/exchange-rate/list` item. */
export interface ExchangeRate {
  from: string;
  to: string;
  course: string;
}
export const ExchangeRateKeys = defineKeys<ExchangeRate>()("from", "to", "course");
