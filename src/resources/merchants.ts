import type { RequestBodies } from "../contract/requests.js";
import type { MerchantOnboarded, SandboxStore } from "../contract/models/index.js";
import { protectSecrets } from "../core/secrets.js";
import { Resource, type RequestOptions } from "./base.js";

export type OnboardParams = RequestBodies["POST /v1/merchants"];

/**
 * Merchant provisioning — for platforms that onboard merchants themselves. These routes are not
 * HMAC-signed; a self-hosted gateway gates them with its admin token (`adminToken` option).
 */
export class Merchants extends Resource {
  /** `POST /v1/merchants` — create a merchant and mint its API key (the secret is shown once). */
  async create(params: OnboardParams, opts?: RequestOptions): Promise<MerchantOnboarded> {
    return protectKeys(await this.call<MerchantOnboarded>("POST /v1/merchants", params, opts));
  }

  /** `POST /v1/merchants/{id}/sandbox` — the merchant's dev store and its `test_` key (idempotent). */
  async createSandbox(merchantId: string, opts?: RequestOptions): Promise<SandboxStore> {
    return protectKeys(
      await this.call<SandboxStore>("POST /v1/merchants/{id}/sandbox", undefined, {
        ...opts,
        pathParams: { id: merchantId },
      }),
    );
  }
}

/** A freshly minted key is shown once; keep its secret out of every automatic rendering. */
function protectKeys<T extends MerchantOnboarded>(minted: T): T {
  if (minted.api_key) protectSecrets(minted.api_key, ["secret"]);
  return minted;
}
