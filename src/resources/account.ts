import type { RequestBodies } from "../contract/requests.js";
import type {
  Balance,
  Currencies,
  ExchangeRate,
  ReferralInfo,
  VrcsStatus,
} from "../contract/models/index.js";
import type { PagePromise } from "../core/pagination.js";
import { Resource, type RequestOptions } from "./base.js";

/** Balances and account-level facts. */
export class Account extends Resource {
  /** `POST /v1/balance` — available balance per currency. */
  balance(opts?: RequestOptions): Promise<Balance> {
    return this.call<Balance>("POST /v1/balance", undefined, opts);
  }

  /** `POST /v1/referral/info` — referral code, link and earnings. */
  referral(opts?: RequestOptions): Promise<ReferralInfo> {
    return this.call<ReferralInfo>("POST /v1/referral/info", undefined, opts);
  }

  /** `POST /v1/vrcs` — read (no argument) or set volatility-risk conversion (auto-convert volatile deposits to USDT). */
  vrcs(enabled?: boolean, opts?: RequestOptions): Promise<VrcsStatus> {
    return this.call<VrcsStatus>(
      "POST /v1/vrcs",
      enabled === undefined ? undefined : { enabled },
      opts,
    );
  }
}

/** Public reference data — no credentials needed. */
export class Catalog extends Resource {
  /** `GET /v1/currencies` — every asset, its networks and live availability. */
  currencies(opts?: RequestOptions): Promise<Currencies> {
    return this.call<Currencies>("GET /v1/currencies", undefined, opts);
  }

  /** `POST /v1/exchange-rate/list` — current rates, optionally filtered by `currency_from`/`currency_to`. */
  exchangeRates(
    params: RequestBodies["POST /v1/exchange-rate/list"] = {},
    opts?: RequestOptions,
  ): PagePromise<ExchangeRate> {
    return this.page<ExchangeRate>("POST /v1/exchange-rate/list", params, opts);
  }
}
