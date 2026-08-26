import { defineKeys } from "../keys.js";

/** The merchant's API key pair as minted by onboarding. The secret is shown once. */
export interface ApiKeyPair {
  public_id: string;
  secret: string;
}

/** `POST /v1/merchants` — a freshly provisioned merchant and its API key. */
export interface MerchantOnboarded {
  merchant_id: string;
  project_id: string;
  /** The merchant's one API key; it signs every signed route. */
  api_key: ApiKeyPair;
}
export const MerchantOnboardedKeys = defineKeys<MerchantOnboarded>()(
  "merchant_id",
  "project_id",
  "api_key",
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
  "created",
);
