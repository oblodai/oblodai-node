import type { RequestBodies } from "../contract/requests.js";
import type {
  AcceptedMethod,
  AccuracyConfig,
  ApiAllowlist,
  AutoRefundConfig,
  AutoWithdrawRule,
  DiscountRule,
  OkResult,
  PaymentFeeConfig,
} from "../contract/models/index.js";
import type { PagePromise } from "../core/pagination.js";
import { Resource, type RequestOptions } from "./base.js";

/** Merchant-level configuration exposed over the API. */
export class Settings extends Resource {
  /** `POST /v1/payment/discount/set` — payer-facing discount/markup per currency+network. */
  setDiscount(
    params: RequestBodies["POST /v1/payment/discount/set"],
    opts?: RequestOptions,
  ): Promise<DiscountRule> {
    return this.call<DiscountRule>("POST /v1/payment/discount/set", params, opts);
  }
  /** `POST /v1/payment/discount/list`. */
  listDiscounts(
    params: RequestBodies["POST /v1/payment/discount/list"] = {},
    opts?: RequestOptions,
  ): PagePromise<DiscountRule> {
    return this.page<DiscountRule>("POST /v1/payment/discount/list", params, opts);
  }

  /** `POST /v1/payment/accuracy/get` — under/overpayment tolerance. */
  getAccuracy(opts?: RequestOptions): Promise<AccuracyConfig> {
    return this.call<AccuracyConfig>("POST /v1/payment/accuracy/get", undefined, opts);
  }
  /** `POST /v1/payment/accuracy/set`. */
  setAccuracy(
    params: RequestBodies["POST /v1/payment/accuracy/set"],
    opts?: RequestOptions,
  ): Promise<AccuracyConfig> {
    return this.call<AccuracyConfig>("POST /v1/payment/accuracy/set", params, opts);
  }

  /** `POST /v1/payment/autorefund/get`. */
  getAutoRefund(opts?: RequestOptions): Promise<AutoRefundConfig> {
    return this.call<AutoRefundConfig>("POST /v1/payment/autorefund/get", undefined, opts);
  }
  /** `POST /v1/payment/autorefund/set` — refund over/underpayments automatically. */
  setAutoRefund(
    params: RequestBodies["POST /v1/payment/autorefund/set"],
    opts?: RequestOptions,
  ): Promise<AutoRefundConfig> {
    return this.call<AutoRefundConfig>("POST /v1/payment/autorefund/set", params, opts);
  }

  /** `POST /v1/payment/accepted/list` — which currency/network pairs invoices may be paid in. */
  listAccepted(
    params: RequestBodies["POST /v1/payment/accepted/list"] = {},
    opts?: RequestOptions,
  ): PagePromise<AcceptedMethod> {
    return this.page<AcceptedMethod>("POST /v1/payment/accepted/list", params, opts);
  }
  /** `POST /v1/payment/accepted/set`. */
  setAccepted(
    params: RequestBodies["POST /v1/payment/accepted/set"],
    opts?: RequestOptions,
  ): Promise<OkResult> {
    return this.call<OkResult>("POST /v1/payment/accepted/set", params, opts);
  }

  /** `POST /v1/payment/fee-config/get` — share of the network fee charged to the payer. */
  getPaymentFeeConfig(opts?: RequestOptions): Promise<PaymentFeeConfig> {
    return this.call<PaymentFeeConfig>("POST /v1/payment/fee-config/get", undefined, opts);
  }
  /** `POST /v1/payment/fee-config/set`. */
  setPaymentFeeConfig(
    params: RequestBodies["POST /v1/payment/fee-config/set"],
    opts?: RequestOptions,
  ): Promise<PaymentFeeConfig> {
    return this.call<PaymentFeeConfig>("POST /v1/payment/fee-config/set", params, opts);
  }

  /** `POST /v1/auto-withdraw/list`. */
  async listAutoWithdraw(opts?: RequestOptions): Promise<AutoWithdrawRule[]> {
    return (await this.plainList<AutoWithdrawRule>("POST /v1/auto-withdraw/list", undefined, opts))
      .items;
  }
  /** `POST /v1/auto-withdraw/set` — sweep a currency to an address once the balance passes `min_amount`. */
  async setAutoWithdraw(
    params: RequestBodies["POST /v1/auto-withdraw/set"],
    opts?: RequestOptions,
  ): Promise<AutoWithdrawRule[]> {
    return (await this.plainList<AutoWithdrawRule>("POST /v1/auto-withdraw/set", params, opts))
      .items;
  }
  /** `POST /v1/auto-withdraw/delete`. */
  async deleteAutoWithdraw(currency: string, opts?: RequestOptions): Promise<AutoWithdrawRule[]> {
    return (
      await this.plainList<AutoWithdrawRule>("POST /v1/auto-withdraw/delete", { currency }, opts)
    ).items;
  }

  /** `POST /v1/api-allowlist/list` — source IPs allowed to use the API key. */
  listApiAllowlist(opts?: RequestOptions): Promise<ApiAllowlist> {
    return this.call<ApiAllowlist>("POST /v1/api-allowlist/list", undefined, opts);
  }
  /** `POST /v1/api-allowlist/add`. */
  addApiAllowlist(cidr: string, opts?: RequestOptions): Promise<ApiAllowlist> {
    return this.call<ApiAllowlist>("POST /v1/api-allowlist/add", { cidr }, opts);
  }
  /** `POST /v1/api-allowlist/remove`. */
  removeApiAllowlist(cidr: string, opts?: RequestOptions): Promise<ApiAllowlist> {
    return this.call<ApiAllowlist>("POST /v1/api-allowlist/remove", { cidr }, opts);
  }
  /** `POST /v1/api-allowlist/enable` — switch enforcement on or off (the list is kept). */
  enableApiAllowlist(enabled: boolean, opts?: RequestOptions): Promise<ApiAllowlist> {
    return this.call<ApiAllowlist>("POST /v1/api-allowlist/enable", { enabled }, opts);
  }
}
