import { describe, expect, it } from "vitest";
import * as M from "../../src/contract/models/index.js";
import {
  ERROR_CODES,
  EVENT_TYPES,
  PAYMENT_STATUSES,
  PAYOUT_STATUSES,
  PAYOUT_LINK_STATUSES,
  DELIVERY_STATUSES,
} from "../../src/contract/enums.js";
import {
  loadContract,
  loadErrorSamples,
  loadFixtures,
  loadWebhookSamples,
  resultOf,
} from "../support/fixtures.js";

/**
 * Wire models versus the golden bodies the core recorded. Each row names a route, how to reach the
 * object inside its result, and the model's key tuple. Keys must match EXACTLY: a field the core
 * stopped sending fails here, and so does a field it started sending that the model lacks.
 */
type Row = [
  route: string,
  pick: (result: any) => unknown,
  keys: readonly string[],
  optional?: readonly string[],
];
const ROWS: Row[] = [
  ["POST /v1/payment", (r) => r, M.PaymentKeys],
  ["POST /v1/payment/info", (r) => r, M.PaymentKeys, ["refunds", "refund_status"]],
  ["POST /v1/payment/cancel", (r) => r, M.PaymentKeys],
  ["POST /v1/payment/history", (r) => r.items[0], M.PaymentKeys],
  ["GET /v1/pay/{id}", (r) => r, M.PublicPaymentKeys],
  ["POST /v1/pay/{id}/select", (r) => r, M.PublicPaymentKeys],
  ["POST /v1/link/{id}/checkout", (r) => r, M.PublicPaymentKeys],
  ["POST /v1/payment/qr", (r) => r, M.QrCodeKeys],
  ["GET /v1/pay/{id}/qr", (r) => r, M.QrCodeKeys],
  ["POST /v1/payment/services", (r) => r.items[0], M.ServiceMethodKeys],
  ["POST /v1/payout/services", (r) => r.items[0], M.ServiceMethodKeys],
  ["POST /v1/payment/batch", (r) => r, M.BatchSubmittedKeys],
  ["POST /v1/payout/batch", (r) => r, M.BatchSubmittedKeys],
  ["POST /v1/refund/batch", (r) => r, M.BatchSubmittedKeys],
  ["POST /v1/transfer/batch", (r) => r, M.BatchSubmittedKeys],
  ["POST /v1/batch/info", (r) => r, M.BatchInfoKeys],
  ["POST /v1/payout", (r) => r, M.PayoutKeys],
  ["POST /v1/payout/info", (r) => r, M.PayoutKeys, ["error", "error_code"]],
  ["POST /v1/payout/cancel", (r) => r, M.PayoutKeys],
  ["POST /v1/payout/history", (r) => r.items[0], M.PayoutKeys],
  ["POST /v1/payout/mass", (r) => r.items[0].result, M.PayoutKeys],
  ["POST /v1/payment/refund", (r) => r, M.PayoutKeys],
  ["POST /v1/payout/calculate", (r) => r, M.PayoutCalculationKeys],
  ["POST /v1/payout/validate", (r) => r, M.PayoutValidationKeys],
  ["POST /v1/payout/link", (r) => r, M.PayoutLinkKeys, ["claim_token", "claim_url"]],
  ["POST /v1/payout/link/info", (r) => r, M.PayoutLinkKeys],
  ["POST /v1/payout/link/list", (r) => r.items[0], M.PayoutLinkKeys],
  ["POST /v1/payout/link/cancel", (r) => r, M.PayoutLinkKeys],
  [
    "POST /v1/payout/link/batch",
    (r) => r.items[0].result,
    M.PayoutLinkKeys,
    ["claim_token", "claim_url", "batch_id"],
  ],
  ["GET /v1/claim/{token}", (r) => r, M.ClaimPreviewKeys],
  ["POST /v1/claim/{token}", (r) => r, M.ClaimResultKeys],
  ["POST /v1/payment/link", (r) => r, M.PaymentLinkCreatedKeys],
  ["POST /v1/payment/link/info", (r) => r, M.PaymentLinkKeys, ["payments"]],
  ["POST /v1/payment/link/list", (r) => r.items[0], M.PaymentLinkKeys],
  ["GET /v1/link/{id}", (r) => r, M.PublicPaymentLinkKeys],
  ["POST /v1/balance", (r) => r, M.BalanceKeys],
  ["POST /v1/referral/info", (r) => r, M.ReferralInfoKeys],
  ["POST /v1/auto-withdraw/list", (r) => r.items[0], M.AutoWithdrawRuleKeys],
  ["POST /v1/api-allowlist/list", (r) => r, M.ApiAllowlistKeys],
  ["POST /v1/payment/discount/list", (r) => r.items[0], M.DiscountRuleKeys],
  ["POST /v1/split/rule/list", (r) => r.items[0], M.SplitRuleKeys],
  ["GET /v1/currencies", (r) => r, M.CurrenciesKeys],
  ["GET /v1/currencies", (r) => r.currencies[0].networks[0], M.CurrencyNetworkKeys, ["contract"]],
  ["POST /v1/exchange-rate/list", (r) => r.items[0], M.ExchangeRateKeys],
  ["POST /v1/webhooks", (r) => r, M.WebhookEndpointKeys],
  ["POST /v1/webhooks/rotate-secret", (r) => r, M.WebhookSecretRotatedKeys],
  ["POST /v1/webhooks/deliveries", (r) => r.items[0], M.WebhookDeliveryKeys],
  ["GET /v1/sandbox/webhooks", (r) => r.items[0], M.WebhookDeliveryKeys, ["payload", "sequence"]],
  ["POST /v1/payment/resolve", (r) => r, [...M.PayoutKeys, "resolution"]],
  ["POST /v1/payment/send-email", (r) => r, M.EmailSentKeys],
  ["POST /v1/payment/resend", (r) => r, M.OkResultKeys],
  ["POST /v1/payment/accepted/set", (r) => r, M.OkResultKeys],
  ["POST /v1/split/rule/delete", (r) => r, M.OkResultKeys],
  ["POST /v1/payment/accepted/list", (r) => r.items[0], M.AcceptedMethodKeys, ["reason"]],
  ["POST /v1/payment/accuracy/get", (r) => r, M.AccuracyConfigKeys],
  ["POST /v1/payment/accuracy/set", (r) => r, M.AccuracyConfigKeys],
  ["POST /v1/payment/autorefund/get", (r) => r, M.AutoRefundConfigKeys],
  ["POST /v1/payment/autorefund/set", (r) => r, M.AutoRefundConfigKeys, ["configured"]],
  ["POST /v1/payment/discount/set", (r) => r, M.DiscountRuleKeys],
  ["POST /v1/payment/fee-config/get", (r) => r, M.PaymentFeeConfigKeys],
  ["POST /v1/payment/fee-config/set", (r) => r, M.PaymentFeeConfigKeys, ["enabled"]],
  ["POST /v1/payout/fee-config/get", (r) => r, M.PayoutFeeConfigKeys],
  ["POST /v1/payout/fee-config/set", (r) => r, M.PayoutFeeConfigKeys, ["configured"]],
  ["POST /v1/payout/refund-fee-config/get", (r) => r, M.RefundFeeConfigKeys],
  ["POST /v1/payout/refund-fee-config/set", (r) => r, M.RefundFeeConfigKeys, ["configured"]],
  ["POST /v1/payment/link/toggle", (r) => r, M.PaymentLinkToggledKeys],
  ["POST /v1/split/rule", (r) => r, M.SplitRuleCreatedKeys],
  ["POST /v1/split/config/get", (r) => r, M.SplitConfigKeys],
  ["POST /v1/split/config/set", (r) => r, M.SplitConfigKeys],
  ["POST /v1/split/recipient/optin", (r) => r, M.SplitOptInKeys],
  ["POST /v1/split/recipient/optin/get", (r) => r, M.SplitOptInKeys],
  ["POST /v1/vrcs", (r) => r, M.VrcsStatusKeys],
  ["POST /v1/auto-withdraw/set", (r) => r.items[0], M.AutoWithdrawRuleKeys],
  ["POST /v1/auto-withdraw/delete", (r) => r, ["items"]],
  ["POST /v1/api-allowlist/add", (r) => r, M.ApiAllowlistKeys],
  ["POST /v1/api-allowlist/remove", (r) => r, M.ApiAllowlistKeys],
  ["POST /v1/api-allowlist/enable", (r) => r, M.ApiAllowlistKeys],
  [
    "POST /v1/wallet",
    (r) => r,
    M.WalletKeys,
    ["destination_tag", "memo", "address_xaddress", "address_muxed"],
  ],
  ["POST /v1/wallet/block", (r) => r, M.WalletBlockedKeys],
  ["POST /v1/wallet/qr", (r) => r, ["image"]],
  ["POST /v1/wallet/blocked-address-refund", (r) => r, [...M.PayoutKeys, "wallet_uuid"]],
  ["POST /v1/transfer/to-personal", (r) => r, M.TransferToPersonalKeys],
  ["POST /v1/transfer/to-user", (r) => r, M.TransferToUserKeys],
  ["POST /v1/documents/jobs", (r) => r, M.DocumentJobKeys, ["ready_within", "file", "error"]],
  ["POST /v1/documents/jobs/info", (r) => r, M.DocumentJobKeys, ["ready_within", "file", "error"]],
  [
    "POST /v1/documents/jobs/info",
    (r) => r.file,
    ["download_url", "expires_at", "rows", "size_bytes"],
  ],
  ["POST /v1/test-webhook/payment", (r) => r, M.WebhookTestResultKeys],
  ["POST /v1/test-webhook/payout", (r) => r, M.WebhookTestResultKeys],
  ["POST /v1/test-webhook/wallet", (r) => r, M.WebhookTestResultKeys],
  [
    "POST /v1/payment/testing-webhook",
    (r) => r,
    [...M.WebhookTestResultKeys, "url", "duration_ms"],
  ],
  ["POST /v1/sandbox/faucet", (r) => r, M.FaucetResultKeys],
  ["POST /v1/sandbox/deposit", (r) => r, M.SandboxDepositKeys],
  ["POST /v1/sandbox/reset", (r) => r, M.SandboxResetKeys],
  ["POST /v1/sandbox/webhooks/replay", (r) => r, M.SandboxReplayKeys],
  ["POST /v1/merchants", (r) => r, M.MerchantOnboardedKeys],
  ["POST /v1/merchants", (r) => r.api_key, ["public_id", "secret", "kind"]],
  ["POST /v1/merchants/{id}/sandbox", (r) => r, M.SandboxStoreKeys],
];

/** Routes the API guarantees to refuse for API keys (no success body exists to model). */
const NOT_MODELLED = new Set([
  "POST /v1/payout/approve", // API-key payouts auto-approve; approve serves the cabinet's maker-checker flow
]);

function keySetDiff(
  actual: string[],
  expected: readonly string[],
  optional: readonly string[] = [],
) {
  const a = new Set(actual);
  const e = new Set([...expected]);
  const missingOnWire = [...e].filter((k) => !a.has(k) && !optional.includes(k));
  const unknownOnWire = [...a].filter((k) => !e.has(k) && !optional.includes(k));
  return { missingOnWire, unknownOnWire };
}

describe("wire models match the golden bodies", () => {
  const fixtures = loadFixtures();
  for (const [route, pick, keys, optional] of ROWS) {
    it(`${route} ↔ ${keys.length} keys`, () => {
      const fx = fixtures.get(route);
      if (!fx || fx.status >= 300) return; // recorded as a refusal in this environment: nothing to compare
      const obj = pick(fx.response?.result);
      expect(obj, `${route}: picker found nothing`).toBeTruthy();
      const diff = keySetDiff(Object.keys(obj as object), keys, optional);
      expect(diff, `${route}: model keys drifted from the wire`).toEqual({
        missingOnWire: [],
        unknownOnWire: [],
      });
    });
  }
});

describe("every recorded success body is covered by a model row", () => {
  it("lists each JSON success fixture in ROWS", () => {
    const covered = new Set(ROWS.map((r) => r[0]));
    for (const [route, fx] of loadFixtures()) {
      if (fx.status < 200 || fx.status >= 300 || NOT_MODELLED.has(route)) continue;
      if (!fx.headers?.["Content-Type"]?.includes("json")) continue;
      expect(covered.has(route), `${route}: recorded success body has no model row`).toBe(true);
    }
  });
});

describe("enums cover what the wire carries", () => {
  it("statuses in fixtures are in the vocabulary", () => {
    const pay = resultOf<any>("POST /v1/payment/history").items.map((p: any) => p.status);
    for (const s of pay) expect(PAYMENT_STATUSES).toContain(s);
    const po = resultOf<any>("POST /v1/payout/history").items.map((p: any) => p.status);
    for (const s of po) expect(PAYOUT_STATUSES).toContain(s);
    for (const l of resultOf<any>("POST /v1/payout/link/list").items)
      expect(PAYOUT_LINK_STATUSES).toContain(l.status);
    for (const d of resultOf<any>("POST /v1/webhooks/deliveries").items)
      expect(DELIVERY_STATUSES).toContain(d.status);
  });

  it("webhook samples carry known event types and bodies matching the event models", () => {
    for (const s of loadWebhookSamples()) {
      expect(EVENT_TYPES).toContain(s.headers["X-Webhook-Event"]);
      const keys =
        s.body.type === "payment"
          ? M.PaymentEventKeys
          : s.body.type === "payout"
            ? M.PayoutEventKeys
            : M.WalletEventKeys;
      expect(keySetDiff(Object.keys(s.body), keys, ["test"])).toEqual({
        missingOnWire: [],
        unknownOnWire: [],
      });
    }
  });

  it("every recorded error code is a known code with the documented envelope", () => {
    for (const [code, fx] of loadErrorSamples()) {
      expect(ERROR_CODES).toContain(code);
      const err = fx.response?.error ?? {};
      expect(err.code).toBe(code);
      expect(typeof err.retryable).toBe("boolean");
      expect(typeof err.request_id).toBe("string");
      if (fx.status === 429) expect(err.retry_after).toBeGreaterThan(0);
    }
  });

  it("recorded request bodies only use documented fields", () => {
    const schemas = new Map(
      loadContract().routes.map((r) => [`${r.method} ${r.path}`, (r as any).request_schema]),
    );
    for (const [route, fx] of loadFixtures()) {
      const schema = schemas.get(route);
      if (!schema?.properties || !fx.request || typeof fx.request !== "object") continue;
      for (const k of Object.keys(fx.request as object)) {
        expect(
          schema.properties,
          `${route}: journey sent undocumented field "${k}"`,
        ).toHaveProperty(k);
      }
    }
  });
});
