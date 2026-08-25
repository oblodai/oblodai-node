import { defineKeys } from "../keys.js";

/** An API key pair as minted by onboarding. The secret is shown once. */
export interface ApiKeyPair {
  public_id: string;
  secret: string;
  /** `api` — the unified key kind current merchants receive. */
  kind: string;
}

/** `POST /v1/merchants` — a freshly provisioned merchant and its keys. */
export interface MerchantOnboarded {
  merchant_id: string;
  project_id: string;
  /** The unified key (same as `payment_key`/`payout_key` for merchants created now). */
  api_key: ApiKeyPair;
  payment_key: ApiKeyPair;
  payout_key: ApiKeyPair;
}
export const MerchantOnboardedKeys = defineKeys<MerchantOnboarded>()(
  "merchant_id",
  "project_id",
  "api_key",
  "payment_key",
  "payout_key",
);

/** `POST /v1/merchants/{id}/sandbox` — the merchant's dev store and its `test_` key. */
export interface SandboxStore extends MerchantOnboarded {
  /** False when the dev store already existed (the call is idempotent). */
  created: boolean;
}
export const SandboxStoreKeys = defineKeys<SandboxStore>()(
  "merchant_id",
  "project_id",
  "api_key",
  "payment_key",
  "payout_key",
  "created",
);
