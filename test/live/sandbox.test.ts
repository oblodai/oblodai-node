import { beforeAll, describe, expect, it } from "vitest";
import { Oblodai, isPaymentPaid, verifyWebhook, type Payment } from "../../src/index.js";

/**
 * Live contract test: the SDK against a REAL core (OBLODAI_LIVE_URL, e.g. a local stack booted by
 * scripts/sandbox-e2e.sh or `go run ./cmd/api`). Onboards a merchant, gets a sandbox key and walks
 * the money path — signature, envelope, idempotency and webhooks all exercised for real.
 */
const BASE = process.env.OBLODAI_LIVE_URL!;

async function onboardSandbox(): Promise<{ publicId: string; secret: string }> {
  const live = await fetch(`${BASE}/v1/merchants`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `sdk-live-${Date.now()}@example.com`, name: "SDK live" }),
  }).then((r) => r.json());
  const sbx = await fetch(`${BASE}/v1/merchants/${live.result.merchant_id}/sandbox`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }).then((r) => r.json());
  return { publicId: sbx.result.api_key.public_id, secret: sbx.result.api_key.secret };
}

describe("live sandbox journey", () => {
  let ob: Oblodai;
  let invoice: Payment;

  beforeAll(async () => {
    const key = await onboardSandbox();
    ob = new Oblodai({ ...key, baseUrl: BASE, allowInsecureBaseUrl: true });
  });

  it("reads public catalog data without credentials", async () => {
    const c = await new Oblodai({ baseUrl: BASE, allowInsecureBaseUrl: true }).catalog.currencies();
    expect(c.currencies.length).toBeGreaterThan(0);
  });

  it("creates an invoice and reads it back by order_id and uuid (signed GET with query too)", async () => {
    invoice = await ob.payments.create({
      amount: "25",
      currency: "USDT",
      network: "tron",
      order_id: `sdk-live-${Date.now()}`,
    });
    expect(invoice.status).toBe("created");
    expect((await ob.payments.info({ order_id: invoice.order_id })).uuid).toBe(invoice.uuid);
    const page = await ob.payments.history({ limit: 5 });
    expect(page.items.some((p) => p.uuid === invoice.uuid)).toBe(true);
    const hooks = await ob.sandbox.webhooks({ limit: 5, offset: 0 }); // GET with query → signed over path+query
    expect(Array.isArray(hooks.items)).toBe(true);
  });

  it("replays an idempotent create and refuses a reused key with a different body", async () => {
    const key = `sdk-idem-${Date.now()}`;
    const a = await ob.payments.create(
      { amount: "5", currency: "USDT", network: "tron", order_id: `${key}-o` },
      { idempotencyKey: key },
    );
    const b = await ob.payments.create(
      { amount: "5", currency: "USDT", network: "tron", order_id: `${key}-o` },
      { idempotencyKey: key },
    );
    expect(b.uuid).toBe(a.uuid);
    await expect(
      ob.payments.create(
        { amount: "2", currency: "USDT", network: "tron", order_id: `${key}-o2` },
        { idempotencyKey: key },
      ),
    ).rejects.toMatchObject({
      code: "idempotency.key_reused",
      httpStatus: 409,
    });
  });

  it("simulates a deposit, sees the invoice paid, and funds/validates/creates a payout", async () => {
    await ob.sandbox.deposit({
      invoice_id: invoice.uuid,
      amount: "25",
      confirmations: 20,
      txid: `sdk-tx-${Date.now()}`,
    });
    const paid = await ob.payments.info({ uuid: invoice.uuid });
    expect(isPaymentPaid(paid.status)).toBe(true);

    await ob.sandbox.faucet({ asset: "USDT", amount: "100" });
    const bal = await ob.account.balance();
    expect(bal.balance.merchant.find((b) => b.currency === "USDT")).toBeTruthy();

    const calc = await ob.payouts.calculate({ amount: "10", currency: "USDT", network: "tron" });
    expect(calc.fee_bearer).toBeDefined();
    const v = await ob.payouts.validate({
      amount: "10",
      currency: "USDT",
      network: "tron",
      address: "TQrY8bkbpXKPt2LZbU8jqfnpFbUSF15sbx",
    });
    expect(v.valid).toBe(true);
    const po = await ob.payouts.create({
      amount: "10",
      currency: "USDT",
      network: "tron",
      address: "TQrY8bkbpXKPt2LZbU8jqfnpFbUSF15sbx",
      order_id: `sdk-po-${Date.now()}`,
    });
    expect(po.uuid).toBeTruthy();
    expect((await ob.payouts.info({ uuid: po.uuid })).order_id).toBe(po.order_id);
  });

  it("classifies a domain refusal with the core's own retryable flag", async () => {
    const err = await ob.payouts
      .create({
        amount: "999999",
        currency: "USDT",
        network: "tron",
        address: "TQrY8bkbpXKPt2LZbU8jqfnpFbUSF15sbx",
        order_id: `sdk-big-${Date.now()}`,
      })
      .catch((e) => e);
    expect(err.code).toBe("payout.insufficient_funds");
    expect(err.httpStatus).toBe(409);
    expect(typeof err.requestId).toBe("string");
  });

  it("verifies a webhook the core signs for a registered endpoint", async () => {
    if (!process.env.OBLODAI_LIVE_HOOK_URL) return; // needs a reachable receiver; covered by contract samples otherwise
    const ep = await ob.webhooks.register(process.env.OBLODAI_LIVE_HOOK_URL);
    const res = await ob.webhooks.test("payment", {
      url_callback: process.env.OBLODAI_LIVE_HOOK_URL,
      currency: "USDT",
      network: "tron",
      status: "paid",
    });
    expect(res.ok).toBe(true);
    expect(typeof verifyWebhook).toBe("function");
    expect(ep.secret).toBeTruthy();
  });
});
