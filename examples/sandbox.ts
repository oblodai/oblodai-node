// End-to-end in the sandbox with a test_oblodai_ key: fake money in, a simulated deposit, the webhook log.
import { Oblodai } from "@oblodai-npm/sdk";

const oblodai = new Oblodai({
  publicId: process.env.OBLODAI_PUBLIC_ID,
  secret: process.env.OBLODAI_SECRET,
});

await oblodai.sandbox.faucet({ asset: "USDT", amount: "1000" });
const invoice = await oblodai.payments.create({
  amount: "25",
  currency: "USDT",
  network: "tron",
  order_id: `sbx-${Date.now()}`,
});
await oblodai.sandbox.deposit({
  invoice_id: invoice.uuid,
  amount: "25",
  confirmations: 20,
  txid: `sbx-tx-${Date.now()}`,
});
console.log((await oblodai.payments.info({ uuid: invoice.uuid })).status); // "paid"

const check = await oblodai.payouts.validate({
  amount: "10",
  currency: "USDT",
  network: "tron",
  address: "TQrY8bkbpXKPt2LZbU8jqfnpFbUSF15sbx",
});
console.log("payout would debit", check.payer_amount, "fee", check.commission);

for await (const delivery of oblodai.sandbox.webhooks({ limit: 20 })) {
  console.log(delivery.event_type, delivery.status, delivery.payload?.status);
}
