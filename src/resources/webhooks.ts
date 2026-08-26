import type { RequestBodies } from "../contract/requests.js";
import type {
  WebhookDelivery,
  WebhookEndpoint,
  WebhookSecretRotated,
  WebhookTestResult,
} from "../contract/models/index.js";
import type { WebhookKind } from "../contract/enums.js";
import type { PagePromise } from "../core/pagination.js";
import { protectSecrets } from "../core/secrets.js";
import { Resource, type RequestOptions } from "./base.js";

/** Fields that must never reach a log by being part of an object someone printed. */
const WEBHOOK_SECRET_FIELDS = ["secret"] as const;

export type PaymentWebhookTestParams = RequestBodies["POST /v1/test-webhook/payment"];
export type PayoutWebhookTestParams = RequestBodies["POST /v1/test-webhook/payout"];
export type WalletWebhookTestParams = RequestBodies["POST /v1/test-webhook/wallet"];

/** Body of `webhooks.test(kind, …)`, resolved per kind (`status` is that kind's status vocabulary). */
export type WebhookTestParams<K extends WebhookKind = WebhookKind> = K extends "payment"
  ? PaymentWebhookTestParams
  : K extends "payout"
    ? PayoutWebhookTestParams
    : WalletWebhookTestParams;

/** Webhook endpoint management and delivery inspection. Verification lives in `@oblodai-npm/sdk/webhooks`. */
export class Webhooks extends Resource {
  /** `POST /v1/webhooks` — register (or replace) the merchant's endpoint; returns the signing secret once. */
  async register(url: string, opts?: RequestOptions): Promise<WebhookEndpoint> {
    const endpoint = await this.call<WebhookEndpoint>("POST /v1/webhooks", { url }, opts);
    // `secret` stays readable as a property and invisible to JSON.stringify/console.log.
    return protectSecrets(endpoint, WEBHOOK_SECRET_FIELDS);
  }

  /** `POST /v1/webhooks/rotate-secret` — new secret; the old one keeps verifying until `previous_secret_valid_until`. */
  async rotateSecret(opts?: RequestOptions): Promise<WebhookSecretRotated> {
    const rotated = await this.call<WebhookSecretRotated>(
      "POST /v1/webhooks/rotate-secret",
      undefined,
      opts,
    );
    return protectSecrets(rotated, WEBHOOK_SECRET_FIELDS);
  }

  /** `POST /v1/webhooks/deliveries` — delivery log, newest first. */
  deliveries(
    params: RequestBodies["POST /v1/webhooks/deliveries"] = {},
    opts?: RequestOptions,
  ): PagePromise<WebhookDelivery> {
    return this.page<WebhookDelivery>("POST /v1/webhooks/deliveries", params, opts);
  }

  /** `POST /v1/test-webhook/{payment|payout|wallet}` — deliver a sample event of that kind to `url_callback`, signed like a real one. */
  test<K extends WebhookKind>(
    kind: K,
    params: WebhookTestParams<K>,
    opts?: RequestOptions,
  ): Promise<WebhookTestResult> {
    const key = `POST /v1/test-webhook/${kind}` as const;
    return this.call<WebhookTestResult>(key, params as never, opts);
  }

  /** `POST /v1/payment/testing-webhook` — the older rehearsal door (payment events only).
   * @deprecated use `test("payment", …)`. */
  testLegacy(
    params: RequestBodies["POST /v1/payment/testing-webhook"],
    opts?: RequestOptions,
  ): Promise<WebhookTestResult> {
    return this.call<WebhookTestResult>("POST /v1/payment/testing-webhook", params, opts);
  }
}
