import { beforeAll, describe, expect, it } from "vitest";
import {
  ContractError,
  NotFoundError,
  Oblodai,
  ValidationError,
  type Payment,
  type PayoutLink,
} from "../../src/index.js";

/**
 * Live sweep: every namespace against a REAL core (OBLODAI_LIVE_URL). The point is not the business
 * outcome but that the bodies the SDK sends are accepted (no 400 from our own shapes) and the bodies
 * that come back decode (no ContractError). Routes that need a subsystem the stand may lack
 * (documents, email) are probed and skipped when the core reports them disabled.
 */
const BASE = process.env.OBLODAI_LIVE_URL!;
const ADDR = "TQrY8bkbpXKPt2LZbU8jqfnpFbUSF15sbx";
const HOOK = process.env.OBLODAI_LIVE_HOOK_URL ?? "http://127.0.0.1:8096/hook";

async function onboard(): Promise<{ publicId: string; secret: string; merchantId: string }> {
  const live = await fetch(`${BASE}/v1/merchants`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `sweep-${Date.now()}@example.com`, name: "Sweep" }),
  }).then((r) => r.json());
  const sbx = await fetch(`${BASE}/v1/merchants/${live.result.merchant_id}/sandbox`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }).then((r) => r.json());
  return {
    publicId: sbx.result.api_key.public_id,
    secret: sbx.result.api_key.secret,
    merchantId: sbx.result.merchant_id,
  };
}

/** Fails the test on SDK-side contract/shape problems; tolerates business refusals (409/403/404). */
async function accept<T>(p: Promise<T> | PromiseLike<T>): Promise<T | undefined> {
  try {
    return await p;
  } catch (err) {
    if (err instanceof ContractError || err instanceof ValidationError) throw err;
    return undefined;
  }
}

describe("live sweep", () => {
  let ob: Oblodai;
  let pub: Oblodai;
  let invoice: Payment;
  let link: PayoutLink | undefined;
  let docsEnabled = true;

  beforeAll(async () => {
    const key = await onboard();
    ob = new Oblodai({ ...key, baseUrl: BASE, allowInsecureBaseUrl: true });
    pub = new Oblodai({ baseUrl: BASE, allowInsecureBaseUrl: true });
    await ob.sandbox.faucet({ asset: "USDT", amount: "1000" });
    await ob.webhooks.register(HOOK); // a per-invoice url_callback needs a registered endpoint (it signs with its secret)
    invoice = await ob.payments.create({
      amount: "25",
      currency: "USDT",
      network: "tron",
      order_id: `sw-${Date.now()}`,
      payer_email: "buyer@example.com",
      url_callback: HOOK,
    });
    try {
      await ob.documents.balanceCertificate();
    } catch (err) {
      if (err instanceof NotFoundError && err.code === "document.disabled") docsEnabled = false;
    }
  });

  it("catalog & account", async () => {
    expect((await pub.catalog.currencies()).currencies.length).toBeGreaterThan(0);
    expect((await pub.catalog.exchangeRates({ currency_from: "BTC" })).items).toBeDefined();
    expect((await ob.account.balance()).balance.merchant).toBeDefined();
    expect(typeof (await ob.account.referral()).code).toBe("string");
    expect(typeof (await ob.account.vrcs()).enabled).toBe("boolean");
    expect(typeof (await ob.account.vrcs(false)).enabled).toBe("boolean");
  });

  it("payments: lookups, qr, services, public checkout, batch", async () => {
    expect((await ob.payments.get(invoice.uuid)).uuid).toBe(invoice.uuid);
    // Sandbox invoices carry a synthetic `sandbox:` address, which the core deliberately does not
    // render into a QR — the fields come back empty. A real invoice returns a data URI.
    expect(typeof (await ob.payments.qr(invoice.uuid)).image).toBe("string");
    expect((await ob.payments.services({ limit: 5 })).items.length).toBeGreaterThan(0);
    expect((await pub.payments.publicView(invoice.uuid)).status).toBe("created");
    expect(typeof (await pub.payments.publicQr(invoice.uuid)).image).toBe("string");
    const multi = await ob.payments.create({
      amount: "10",
      currency: "USDT",
      order_id: `sw-multi-${Date.now()}`,
    });
    expect(
      (await pub.payments.select(multi.uuid, { currency: "USDT", network: "tron" })).network,
    ).toBe("tron");
    await accept(ob.payments.resend(invoice.uuid));
    await accept(ob.payments.sendEmail({ uuid: invoice.uuid }));
    const b = await ob.payments.batch({
      on_error: "continue",
      payments: [
        { amount: "5", currency: "USDT", network: "tron", order_id: `sw-b-${Date.now()}` },
      ],
    });
    expect(b.batch_id).toBeTruthy();
    expect((await ob.batches.info({ batch_id: b.batch_id })).batch_id).toBe(b.batch_id);
    const toCancel = await ob.payments.create({
      amount: "5",
      currency: "USDT",
      network: "tron",
      order_id: `sw-c-${Date.now()}`,
    });
    expect((await ob.payments.cancel(toCancel.uuid)).status).toBe("cancelled");
    for await (const p of ob.payments.history({ limit: 2 })) expect(p.uuid).toBeTruthy();
  });

  it("deposit → paid → refund, resolve, refund batch", async () => {
    await ob.sandbox.deposit({
      invoice_id: invoice.uuid,
      amount: "25",
      confirmations: 20,
      txid: `sw-tx-${Date.now()}`,
    });
    const paid = await ob.payments.get(invoice.uuid);
    expect(["paid", "confirm_check"]).toContain(paid.status);
    await accept(
      ob.refunds.create({
        uuid: invoice.uuid,
        address: ADDR,
        amount: "5",
        reference: `sw-r-${Date.now()}`,
      }),
    );
    await accept(ob.refunds.resolve({ uuid: invoice.uuid, action: "accept" }));
    await accept(
      ob.refunds.batch({
        refunds: [
          { uuid: invoice.uuid, address: ADDR, amount: "5", reference: `sw-rb-${Date.now()}` },
        ],
      }),
    );
  });

  it("payouts: calculate, validate, create, info, cancel, mass, batch, services, fee configs", async () => {
    expect(
      (await ob.payouts.calculate({ amount: "10", currency: "USDT", network: "tron" })).currency,
    ).toBe("USDT");
    expect(
      (
        await ob.payouts.validate({
          amount: "10",
          currency: "USDT",
          network: "tron",
          address: ADDR,
        })
      ).valid,
    ).toBe(true);
    const po = await ob.payouts.create({
      amount: "10",
      currency: "USDT",
      network: "tron",
      address: ADDR,
      order_id: `sw-po-${Date.now()}`,
    });
    expect((await ob.payouts.get({ order_id: po.order_id! })).uuid).toBe(po.uuid);
    await accept(ob.payouts.cancel(po.uuid));
    await accept(ob.payouts.approve(po.uuid));
    const mass = await ob.payouts.mass({
      payouts: [
        {
          amount: "5",
          currency: "USDT",
          network: "tron",
          address: ADDR,
          order_id: `sw-m-${Date.now()}`,
        },
      ],
    });
    expect(mass.items[0]!.idx).toBe(0);
    const batch = await ob.payouts.batch({
      payouts: [
        {
          amount: "5",
          currency: "USDT",
          network: "tron",
          address: ADDR,
          order_id: `sw-pb-${Date.now()}`,
        },
      ],
    });
    expect(batch.batch_id).toBeTruthy();
    expect((await ob.payouts.services()).items.length).toBeGreaterThan(0);
    expect(
      typeof (await ob.payouts.setFeeConfig({ fee_on_recipient: true })).fee_on_recipient,
    ).toBe("boolean");
    expect(typeof (await ob.payouts.getFeeConfig()).fee_on_recipient).toBe("boolean");
    expect(
      typeof (await ob.payouts.setRefundFeeConfig({ fee_on_customer: true })).fee_on_customer,
    ).toBe("boolean");
    expect(typeof (await ob.payouts.getRefundFeeConfig()).fee_on_customer).toBe("boolean");
    expect((await ob.payouts.history({ kind: "refund", limit: 5 })).items).toBeDefined();
  });

  it("payout links: create, info, list, claim preview/claim, cancel, batch", async () => {
    link = await ob.payoutLinks.create({
      amount: "5",
      currency: "USDT",
      network: "tron",
      reference: `sw-pl-${Date.now()}`,
      title: "Bonus",
      expires_in_seconds: 3600,
    });
    expect(link.claim_token).toBeTruthy();
    expect((await ob.payoutLinks.get(link.link_id)).status).toBe("funded");
    expect((await ob.payoutLinks.list({ limit: 5 })).items.length).toBeGreaterThan(0);
    expect((await pub.payoutLinks.claimPreview(link.claim_token!)).claimable).toBe(true);
    const claimed = await pub.payoutLinks.claim(link.claim_token!, { address: ADDR });
    expect(claimed.payout_id).toBeTruthy();
    const second = await ob.payoutLinks.create({
      amount: "5",
      currency: "USDT",
      network: "tron",
      reference: `sw-pl2-${Date.now()}`,
    });
    expect((await ob.payoutLinks.cancel(second.link_id)).status).toBe("cancelled");
    const batch = await ob.payoutLinks.batch({
      items: [
        { amount: "5", currency: "USDT", network: "tron", reference: `sw-plb-${Date.now()}` },
      ],
    });
    expect(batch.items[0]!.ok).toBe(true);
  });

  it("payment links: create, info, list, toggle, public view, checkout", async () => {
    const created = await ob.paymentLinks.create({
      title: "Tip",
      amount_mode: "fixed",
      currency: "USDT",
      amount_fixed: "10",
      pinned_network: "tron",
    });
    expect(created.link_id).toBeTruthy();
    expect((await ob.paymentLinks.get(created.link_id)).active).toBe(true);
    expect((await ob.paymentLinks.list()).items.length).toBeGreaterThan(0);
    expect((await pub.paymentLinks.publicView(created.link_id)).amount_mode).toBe("fixed");
    expect(
      (await pub.paymentLinks.checkout(created.link_id, { currency: "USDT", network: "tron" }))
        .uuid,
    ).toBeTruthy();
    expect((await ob.paymentLinks.toggle(created.link_id, false)).active).toBe(false);
  });

  it("splits & settings", async () => {
    const rule = await ob.splits.createRule({
      percent: "10",
      address: ADDR,
      network: "tron",
      note: "partner",
    });
    expect((await ob.splits.listRules()).items.some((r) => r.rule_id === rule.rule_id)).toBe(true);
    expect((await ob.splits.setConfig({ refund_hold_seconds: 3600 })).refund_hold_seconds).toBe(
      3600,
    );
    expect((await ob.splits.getConfig()).refund_hold_seconds).toBe(3600);
    expect((await ob.splits.setOptIn(true)).enabled).toBe(true);
    expect((await ob.splits.getOptIn()).enabled).toBe(true);
    expect((await ob.splits.deleteRule(rule.rule_id)).ok).toBe(true);
    expect(
      (await ob.settings.setDiscount({ currency: "USDT", network: "tron", discount_percent: 2 }))
        .discount_percent,
    ).toBe(2);
    expect((await ob.settings.listDiscounts()).items.length).toBeGreaterThan(0);
    expect((await ob.settings.setAccuracy({ enabled: true, accuracy_percent: 2 })).enabled).toBe(
      true,
    );
    expect((await ob.settings.getAccuracy()).enabled).toBe(true);
    expect((await ob.settings.setAutoRefund({ overpay: true, underpay: false })).overpay).toBe(
      true,
    );
    expect(typeof (await ob.settings.getAutoRefund()).configured).toBe("boolean");
    expect(
      (await ob.settings.setAccepted({ accepted: [{ currency: "USDT", network: "tron" }] })).ok,
    ).toBe(true);
    expect((await ob.settings.listAccepted()).items).toBeDefined();
    expect(
      (await ob.settings.setPaymentFeeConfig({ payer_pays_percent: 50 })).payer_pays_percent,
    ).toBe(50);
    expect((await ob.settings.getPaymentFeeConfig()).payer_pays_percent).toBe(50);
    expect(
      (
        await ob.settings.setAutoWithdraw({
          currency: "USDT",
          network: "tron",
          address: ADDR,
          min_amount: "100",
        })
      ).length,
    ).toBeGreaterThan(0);
    expect(await ob.settings.listAutoWithdraw()).toBeDefined();
    expect(await ob.settings.deleteAutoWithdraw("USDT")).toBeDefined();
    expect((await ob.settings.addApiAllowlist("203.0.113.0/24")).items).toContain("203.0.113.0/24");
    expect((await ob.settings.listApiAllowlist()).items).toContain("203.0.113.0/24");
    expect((await ob.settings.enableApiAllowlist(false)).enabled).toBe(false);
    expect((await ob.settings.removeApiAllowlist("203.0.113.0/24")).items).not.toContain(
      "203.0.113.0/24",
    );
  });

  it("webhooks & sandbox inspector", async () => {
    const ep = await ob.webhooks.register(HOOK);
    expect(ep.endpoint_id).toBeTruthy();
    const rotated = await ob.webhooks.rotateSecret();
    expect(rotated.secret).toBeTruthy();
    expect((await ob.webhooks.deliveries({ limit: 5 })).items).toBeDefined();
    await accept(
      ob.webhooks.test("payment", {
        url_callback: HOOK,
        currency: "USDT",
        network: "tron",
        status: "paid",
      }),
    );
    await accept(ob.webhooks.testLegacy({ url: HOOK, status: "paid" }));
    const inspector = await ob.sandbox.webhooks({ limit: 5 });
    expect(inspector.items).toBeDefined();
    const terminal = inspector.items.find((d) => d.status === "delivered" || d.status === "dead");
    if (terminal) await accept(ob.sandbox.replay(terminal.id));
  });

  it("wallets (refused for a dev store, as documented)", async () => {
    await accept(
      ob.wallets.create({ currency: "USDT", network: "tron", order_id: `sw-w-${Date.now()}` }),
    );
    await accept(ob.wallets.qr(ADDR));
    await accept(ob.wallets.block({ address: ADDR }));
    await accept(ob.transfers.toPersonal({ amount: "5", currency: "USDT" }));
  });

  it("documents (when the stand has a renderer)", async () => {
    if (!docsEnabled) return;
    const pdf = await ob.documents.statement({ from: "2026-01-01", to: "2026-12-31", lang: "en" });
    expect(pdf.contentType).toMatch(/pdf/);
    expect(pdf.bytes.length).toBeGreaterThan(0);
    expect((await ob.documents.feeSchedule()).bytes.length).toBeGreaterThan(0);
    expect((await ob.documents.ledger({ format: "csv" })).contentType).toMatch(/csv|pdf/);
    if (link)
      expect(
        (await ob.payoutLinks.cheque({ claim_token: link.claim_token!, lang: "en" })).contentType,
      ).toMatch(/pdf/);
    const job = await ob.documents.createJob({
      kind: "statement",
      format: "csv",
      lang: "en",
      from: "2026-01-01",
      to: "2026-08-25",
    });
    expect((await ob.documents.jobInfo(job.job_id)).job_id).toBe(job.job_id);
    await accept(ob.documents.jobFile(job.job_id));
    const info = await ob.payments.get(invoice.uuid);
    const u = new URL(info.document_url);
    expect(
      (
        await pub.documents.download(u.pathname.split("/")[3]!, u.pathname.split("/")[4]!, {
          exp: Number(u.searchParams.get("exp")),
          sig: u.searchParams.get("sig")!,
        })
      ).contentType,
    ).toMatch(/pdf/);
  });

  it("sandbox reset last", async () => {
    const r = await ob.sandbox.reset();
    expect(typeof r.invoices_cancelled).toBe("number");
  });
});
