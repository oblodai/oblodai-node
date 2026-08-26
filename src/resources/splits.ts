import type { RequestBodies } from "../contract/requests.js";
import type { OkResult, SplitConfig, SplitOptIn, SplitRule } from "../contract/models/index.js";
import type { PagePromise } from "../core/pagination.js";
import { Resource, type RequestOptions } from "./base.js";

export type CreateSplitRuleParams = RequestBodies["POST /v1/split/rule"];

/** Revenue splits: a percentage of every payment forwarded to a partner. */
export class Splits extends Resource {
  /** `POST /v1/split/rule` — to an external address (`address`+`network`) or a platform merchant (`merchant_id`). */
  createRule(params: CreateSplitRuleParams, opts?: RequestOptions): Promise<SplitRule> {
    return this.call<SplitRule>("POST /v1/split/rule", params, opts);
  }

  /** `POST /v1/split/rule/list`. */
  listRules(
    params: RequestBodies["POST /v1/split/rule/list"] = {},
    opts?: RequestOptions,
  ): PagePromise<SplitRule> {
    return this.page<SplitRule>("POST /v1/split/rule/list", params, opts);
  }

  /** `POST /v1/split/rule/delete`. */
  deleteRule(ruleId: string, opts?: RequestOptions): Promise<OkResult> {
    return this.call<OkResult>("POST /v1/split/rule/delete", { rule_id: ruleId }, opts);
  }

  /** `POST /v1/split/config/get`. */
  getConfig(opts?: RequestOptions): Promise<SplitConfig> {
    return this.call<SplitConfig>("POST /v1/split/config/get", undefined, opts);
  }

  /** `POST /v1/split/config/set` — how long split shares are held back for refunds. */
  setConfig(
    params: RequestBodies["POST /v1/split/config/set"],
    opts?: RequestOptions,
  ): Promise<SplitConfig> {
    return this.call<SplitConfig>("POST /v1/split/config/set", params, opts);
  }

  /** `POST /v1/split/recipient/optin/get` — whether this merchant accepts being a split recipient. */
  getOptIn(opts?: RequestOptions): Promise<SplitOptIn> {
    return this.call<SplitOptIn>("POST /v1/split/recipient/optin/get", undefined, opts);
  }

  /** `POST /v1/split/recipient/optin`. */
  setOptIn(enabled: boolean, opts?: RequestOptions): Promise<SplitOptIn> {
    return this.call<SplitOptIn>("POST /v1/split/recipient/optin", { enabled }, opts);
  }
}
