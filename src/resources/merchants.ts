import type { RequestBodies } from "../contract/requests.js";
import type { MerchantOnboarded, SandboxStore } from "../contract/models/index.js";
import { Resource, type RequestOptions } from "./base.js";

export type OnboardParams = RequestBodies["POST /v1/merchants"];

/**
 * Merchant provisioning — for platforms that onboard merchants themselves. These routes are not
 * HMAC-signed; a self-hosted gateway gates them with its admin token (`adminToken` option).
 */
export class Merchants extends Resource {
  /** `POST /v1/merchants` — create a merchant and mint its payment and payout keys (shown once). */
  create(params: OnboardParams, opts?: RequestOptions): Promise<MerchantOnboarded> {
    return this.call<MerchantOnboarded>("POST /v1/merchants", params, opts);
  }

  /** `POST /v1/merchants/{id}/sandbox` — the merchant's dev store and its `test_` key (idempotent). */
  createSandbox(merchantId: string, opts?: RequestOptions): Promise<SandboxStore> {
    return this.call<SandboxStore>("POST /v1/merchants/{id}/sandbox", undefined, {
      ...opts,
      pathParams: { id: merchantId },
    });
  }
}
