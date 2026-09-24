// End-to-end in the sandbox with a test_ key: fake money in, a simulated deposit, the webhook log.
import { Oblodai } from "@oblodai-npm/sdk";

export async function main(): Promise<void> {
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
  await oblodai.sandbox.simulateDeposit({
    invoice_id: invoice.uuid,
    amount: "25",
    confirmations: 20,
    txid: `sbx-tx-${Date.now()}`,
  });
  console.log((await oblodai.payments.getInfo({ uuid: invoice.uuid })).status); // "paid"

  // A batch answers at once and works in the background; wait() polls it to the end.
  const batch = await oblodai.batches.createPayout({
    payouts: [
      {
        amount: "5",
        currency: "USDT",
        network: "tron",
        address: "TQrY8bkbpXKPt2LZbU8jqfnpFbUSF15sbx",
        order_id: `sbx-b-${Date.now()}`,
      },
    ],
  });
  const done = await batch.wait({ timeout: 120 });
  console.log("batch", done.status, done.succeeded, "succeeded");

  for await (const delivery of oblodai.sandbox.listWebhooks({ limit: 20 })) {
    console.log(delivery.event_type, delivery.status);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
