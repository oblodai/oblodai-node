import type { RequestBodies } from "../contract/requests.js";
import type {
  WebhookDelivery,
  WebhookEndpoint,
  WebhookSecretRotated,
  WebhookTestResult,
} from "../contract/models/index.js";
import type { WebhookKind } from "../contract/enums.js";
import type { PagePromise } from "../core/pagination.js";
import { Resource, type RequestOptions } from "./base.js";

export type WebhookTestParams = RequestBodies["POST /v1/test-webhook/payment"];

/** Webhook endpoint management and delivery inspection. Verification lives in `@oblodai-npm/sdk/webhooks`. */
export class Webhooks extends Resource {
  /** `POST /v1/webhooks` — register (or replace) the merchant's endpoint; returns the signing secret once. */
  register(url: string, opts?: RequestOptions): Promise<WebhookEndpoint> {
    return this.call<WebhookEndpoint>("POST /v1/webhooks", { url }, opts);
  }

  /** `POST /v1/webhooks/rotate-secret` — new secret; the old one keeps verifying until `previous_secret_valid_until`. Payout key. */
  rotateSecret(opts?: RequestOptions): Promise<WebhookSecretRotated> {
    return this.call<WebhookSecretRotated>("POST /v1/webhooks/rotate-secret", undefined, opts);
  }

  /** `POST /v1/webhooks/deliveries` — delivery log, newest first. */
  deliveries(
    params: RequestBodies["POST /v1/webhooks/deliveries"] = {},
    opts?: RequestOptions,
  ): PagePromise<WebhookDelivery> {
    return this.page<WebhookDelivery>("POST /v1/webhooks/deliveries", params, opts);
  }

  /** `POST /v1/test-webhook/{payment|payout|wallet}` — deliver a sample event of that kind to `url_callback`, signed like a real one. */
  test(
    kind: WebhookKind,
    params: WebhookTestParams,
    opts?: RequestOptions,
  ): Promise<WebhookTestResult> {
    const key = `POST /v1/test-webhook/${kind}` as const;
    return this.call<WebhookTestResult>(key, params, opts);
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
