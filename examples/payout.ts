// Validate first (free, no side effects), then create with your own idempotency key.
import { Oblodai, OblodaiError } from "@oblodai-npm/sdk";

export async function main(): Promise<void> {
  // The same API key that takes payments sends payouts — OBLODAI_PUBLIC_ID / OBLODAI_SECRET.
  const oblodai = new Oblodai();
  const params = {
    amount: "10",
    currency: "USDT",
    network: "tron",
    address: "TQrY8bkbpXKPt2LZbU8jqfnpFbUSF15sbx",
    order_id: "payout-42",
  };

  try {
    const check = await oblodai.payouts.validate(params);
    console.log("will debit", check.payer_amount, "commission", check.commission);
    // Your own key: a process restart re-sends the same key, and the gateway pays once.
    const payout = await oblodai.payouts.create(params, { idempotencyKey: "payout-42" });
    console.log(payout.uuid, payout.status);
  } catch (err) {
    if (!(err instanceof OblodaiError)) throw err;
    console.error(String(err), err.retryable ? "(retry later)" : ""); // [code] message (request_id=…)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
