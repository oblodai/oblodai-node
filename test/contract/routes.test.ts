import { describe, expect, it } from "vitest";
import { Oblodai } from "../../src/index.js";
import { ROUTES, type RouteKey } from "../../src/contract/routes.js";
import { loadContract, loadFixtures } from "../support/fixtures.js";
import { mockFetch } from "../support/mock-fetch.js";

/**
 * Every route the core declares has exactly one SDK method, wired to the right METHOD and path.
 * The table is the SDK's coverage ledger: a new core route fails this test until it is added.
 */
const anyResult = {
  state: 0,
  result: {
    items: [],
    paginate: { total: 0, per_page: 1, offset: 0, has_pages: false },
    enabled: true,
  },
};

type Call = (ob: Oblodai) => Promise<unknown> | PromiseLike<unknown>;
const COVERAGE: Record<RouteKey, Call> = {
  "GET /v1/claim/{token}": (ob) => ob.payoutLinks.claimPreview("tok"),
  "GET /v1/currencies": (ob) => ob.catalog.currencies(),
  "GET /v1/documents/balance": (ob) => ob.documents.balanceCertificate(),
  "GET /v1/documents/batch": (ob) => ob.documents.batchReport("b1"),
  "GET /v1/documents/fees": (ob) => ob.documents.feeSchedule(),
  "GET /v1/documents/jobs/file": (ob) => ob.documents.jobFile("j1"),
  "GET /v1/documents/ledger": (ob) => ob.documents.ledger(),
  "GET /v1/documents/link": (ob) => ob.documents.linkReport("l1"),
  "GET /v1/documents/referrals": (ob) => ob.documents.referralsReport(),
  "GET /v1/documents/split": (ob) => ob.documents.splitReport("i1"),
  "GET /v1/documents/statement": (ob) =>
    ob.documents.statement({ from: "2026-01-01", to: "2026-02-01" }),
  "GET /v1/documents/wallet/statement": (ob) => ob.documents.walletStatement("w1"),
  "GET /v1/documents/{kind}/{id}": (ob) =>
    ob.documents.download("invoice", "i1", { exp: 1, sig: "s" }),
  "GET /v1/link/{id}": (ob) => ob.paymentLinks.publicView("l1"),
  "GET /v1/pay/{id}": (ob) => ob.payments.publicView("i1"),
  "GET /v1/pay/{id}/qr": (ob) => ob.payments.publicQr("i1"),
  "GET /v1/sandbox/webhooks": (ob) => ob.sandbox.webhooks(),
  "POST /v1/api-allowlist/add": (ob) => ob.settings.addApiAllowlist("10.0.0.0/8"),
  "POST /v1/api-allowlist/enable": (ob) => ob.settings.enableApiAllowlist(true),
  "POST /v1/api-allowlist/list": (ob) => ob.settings.listApiAllowlist(),
  "POST /v1/api-allowlist/remove": (ob) => ob.settings.removeApiAllowlist("10.0.0.0/8"),
  "POST /v1/auto-withdraw/delete": (ob) => ob.settings.deleteAutoWithdraw("USDT"),
  "POST /v1/auto-withdraw/list": (ob) => ob.settings.listAutoWithdraw(),
  "POST /v1/auto-withdraw/set": (ob) =>
    ob.settings.setAutoWithdraw({ currency: "USDT", network: "tron", address: "T" }),
  "POST /v1/balance": (ob) => ob.account.balance(),
  "POST /v1/batch/info": (ob) => ob.batches.info({ batch_id: "b1" }),
  "POST /v1/claim/{token}": (ob) => ob.payoutLinks.claim("tok", { address: "T" }),
  "POST /v1/exchange-rate/list": (ob) => ob.catalog.exchangeRates(),
  "POST /v1/link/{id}/checkout": (ob) => ob.paymentLinks.checkout("l1"),
  "POST /v1/pay/{id}/select": (ob) =>
    ob.payments.select("i1", { currency: "USDT", network: "tron" }),
  "POST /v1/payment": (ob) => ob.payments.create({ amount: "1", currency: "USDT" }),
  "POST /v1/payment/accepted/list": (ob) => ob.settings.listAccepted(),
  "POST /v1/payment/accepted/set": (ob) => ob.settings.setAccepted({ accepted: [] }),
  "POST /v1/payment/accuracy/get": (ob) => ob.settings.getAccuracy(),
  "POST /v1/payment/accuracy/set": (ob) => ob.settings.setAccuracy({ enabled: true }),
  "POST /v1/payment/autorefund/get": (ob) => ob.settings.getAutoRefund(),
  "POST /v1/payment/autorefund/set": (ob) =>
    ob.settings.setAutoRefund({ overpay: true, underpay: false }),
  "POST /v1/payment/batch": (ob) => ob.payments.batch({ payments: [] }),
  "POST /v1/payment/cancel": (ob) => ob.payments.cancel({ uuid: "i1" }),
  "POST /v1/payment/discount/list": (ob) => ob.settings.listDiscounts(),
  "POST /v1/payment/discount/set": (ob) => ob.settings.setDiscount({ discount_percent: 1 }),
  "POST /v1/payment/fee-config/get": (ob) => ob.settings.getPaymentFeeConfig(),
  "POST /v1/payment/fee-config/set": (ob) =>
    ob.settings.setPaymentFeeConfig({ payer_pays_percent: 50 }),
  "POST /v1/payment/history": (ob) => ob.payments.history(),
  "POST /v1/payment/info": (ob) => ob.payments.info({ uuid: "i1" }),
  "POST /v1/payment/link": (ob) =>
    ob.paymentLinks.create({ amount_mode: "open", currency: "USDT" }),
  "POST /v1/payment/link/info": (ob) => ob.paymentLinks.info("l1"),
  "POST /v1/payment/link/list": (ob) => ob.paymentLinks.list(),
  "POST /v1/payment/link/toggle": (ob) => ob.paymentLinks.toggle("l1", false),
  "POST /v1/payment/qr": (ob) => ob.payments.qr({ uuid: "i1" }),
  "POST /v1/payment/refund": (ob) => ob.refunds.create({ uuid: "i1" }),
  "POST /v1/payment/resend": (ob) => ob.payments.resend({ uuid: "i1" }),
  "POST /v1/payment/resolve": (ob) => ob.refunds.resolve({ action: "accept", uuid: "i1" }),
  "POST /v1/payment/send-email": (ob) => ob.payments.sendEmail({ uuid: "i1" }),
  "POST /v1/payment/services": (ob) => ob.payments.services(),
  "POST /v1/payment/testing-webhook": (ob) => ob.webhooks.testLegacy({ url: "https://x" }),
  "POST /v1/payout": (ob) =>
    ob.payouts.create({ amount: "1", currency: "USDT", address: "T", order_id: "o" }),
  "POST /v1/payout/approve": (ob) => ob.payouts.approve("p1"),
  "POST /v1/payout/batch": (ob) => ob.payouts.batch({ payouts: [] }),
  "POST /v1/payout/calculate": (ob) => ob.payouts.calculate({ amount: "1", currency: "USDT" }),
  "POST /v1/payout/cancel": (ob) => ob.payouts.cancel("p1"),
  "POST /v1/payout/fee-config/get": (ob) => ob.payouts.getFeeConfig(),
  "POST /v1/payout/fee-config/set": (ob) => ob.payouts.setFeeConfig({ fee_on_recipient: true }),
  "POST /v1/payout/history": (ob) => ob.payouts.history(),
  "POST /v1/payout/info": (ob) => ob.payouts.info({ uuid: "p1" }),
  "POST /v1/payout/link": (ob) =>
    ob.payoutLinks.create({ amount: "1", currency: "USDT", network: "tron" }),
  "POST /v1/payout/link/batch": (ob) => ob.payoutLinks.batch({ items: [] }),
  "POST /v1/payout/link/cancel": (ob) => ob.payoutLinks.cancel("l1"),
  "POST /v1/payout/link/cheque": (ob) => ob.payoutLinks.cheque({ claim_token: "t" }),
  "POST /v1/payout/link/info": (ob) => ob.payoutLinks.info("l1"),
  "POST /v1/payout/link/list": (ob) => ob.payoutLinks.list(),
  "POST /v1/payout/mass": (ob) => ob.payouts.mass({ payouts: [] }),
  "POST /v1/payout/refund-fee-config/get": (ob) => ob.payouts.getRefundFeeConfig(),
  "POST /v1/payout/refund-fee-config/set": (ob) =>
    ob.payouts.setRefundFeeConfig({ fee_on_customer: true }),
  "POST /v1/payout/services": (ob) => ob.payouts.services(),
  "POST /v1/payout/validate": (ob) =>
    ob.payouts.validate({ amount: "1", currency: "USDT", address: "T" }),
  "POST /v1/referral/info": (ob) => ob.account.referral(),
  "POST /v1/refund/batch": (ob) => ob.refunds.batch({ refunds: [] }),
  "POST /v1/sandbox/deposit": (ob) => ob.sandbox.deposit({ invoice_id: "i1" }),
  "POST /v1/sandbox/faucet": (ob) => ob.sandbox.faucet({ asset: "USDT", amount: "1" }),
  "POST /v1/sandbox/reset": (ob) => ob.sandbox.reset(),
  "POST /v1/sandbox/webhooks/replay": (ob) => ob.sandbox.replay("d1"),
  "POST /v1/split/config/get": (ob) => ob.splits.getConfig(),
  "POST /v1/split/config/set": (ob) => ob.splits.setConfig({ refund_hold_seconds: 60 }),
  "POST /v1/split/recipient/optin": (ob) => ob.splits.setOptIn(true),
  "POST /v1/split/recipient/optin/get": (ob) => ob.splits.getOptIn(),
  "POST /v1/split/rule": (ob) => ob.splits.createRule({ percent: "10" }),
  "POST /v1/split/rule/delete": (ob) => ob.splits.deleteRule("r1"),
  "POST /v1/split/rule/list": (ob) => ob.splits.listRules(),
  "POST /v1/test-webhook/payment": (ob) =>
    ob.webhooks.test("payment", { url_callback: "https://x" }),
  "POST /v1/test-webhook/payout": (ob) => ob.webhooks.test("payout", { url_callback: "https://x" }),
  "POST /v1/test-webhook/wallet": (ob) => ob.webhooks.test("wallet", { url_callback: "https://x" }),
  "POST /v1/transfer/batch": (ob) => ob.transfers.batch({}),
  "POST /v1/transfer/to-personal": (ob) =>
    ob.transfers.toPersonal({ amount: "1", currency: "USDT" }),
  "POST /v1/transfer/to-user": (ob) => ob.transfers.toUser({ to_user_id: "u" }),
  "POST /v1/vrcs": (ob) => ob.account.vrcs(),
  "POST /v1/wallet": (ob) => ob.wallets.create({ currency: "USDT", network: "tron" }),
  "POST /v1/wallet/block": (ob) => ob.wallets.block({ address: "T" }),
  "POST /v1/wallet/blocked-address-refund": (ob) =>
    ob.wallets.refundBlockedDeposit({ uuid: "w1", address: "T" }),
  "POST /v1/wallet/qr": (ob) => ob.wallets.qr("T"),
  "POST /v1/webhooks": (ob) => ob.webhooks.register("https://x"),
  "POST /v1/webhooks/deliveries": (ob) => ob.webhooks.deliveries(),
  "POST /v1/webhooks/rotate-secret": (ob) => ob.webhooks.rotateSecret(),
  "POST /v1/documents/jobs": (ob) => ob.documents.createJob({ kind: "statement" }),
  "POST /v1/documents/jobs/info": (ob) => ob.documents.jobInfo("j1"),
};

describe("route registry", () => {
  const contract = loadContract();
  const declared = new Set(
    contract.routes
      .filter(
        (r) =>
          r.auth !== "onboard" && !/^\/(healthz|readyz|docs|openapi\.json|internal)/.test(r.path),
      )
      .map((r) => `${r.method} ${r.path}`),
  );

  it("is the core's merchant surface, nothing more and nothing less", () => {
    expect(new Set(Object.keys(ROUTES))).toEqual(declared);
  });

  it("every recorded fixture belongs to a known route", () => {
    for (const route of loadFixtures().keys()) expect(ROUTES).toHaveProperty([route]);
  });

  for (const key of Object.keys(ROUTES) as RouteKey[]) {
    it(`${key} has an SDK method wired to it`, async () => {
      const spec = ROUTES[key];
      const { fetch, calls } = mockFetch([
        {
          status: 200,
          body: spec.bare ? "%PDF" : anyResult,
          headers: spec.bare ? { "content-type": "application/pdf" } : undefined,
        },
      ]);
      const ob = new Oblodai({
        publicId: "pk",
        secret: "s",
        payoutPublicId: "wk",
        payoutSecret: "s2",
        baseUrl: "https://api.test",
        fetch,
      });
      await COVERAGE[key](ob);
      expect(calls).toHaveLength(1);
      const call = calls[0]!;
      expect(call.method).toBe(spec.method);
      const url = new URL(call.url);
      const pattern = new RegExp("^" + spec.path.replace(/\{[a-z]+\}/g, "[^/]+") + "$");
      expect(url.pathname).toMatch(pattern);
      if (spec.auth === "public") expect(call.headers["x-signature"]).toBeUndefined();
      else expect(call.headers["x-public-id"]).toBe(spec.auth === "payout" ? "wk" : "pk");
      if (spec.idempotent) expect(call.headers["idempotency-key"]).toBeDefined();
      else expect(call.headers["idempotency-key"]).toBeUndefined();
    });
  }
});
