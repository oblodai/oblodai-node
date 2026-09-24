// Create an invoice, show the payer the address/URL, then poll until it is final.
import { Oblodai, isPaymentFinal, isPaymentPaid } from "@oblodai-npm/sdk";

export async function main(pollEvery = 10): Promise<void> {
  const oblodai = new Oblodai(); // OBLODAI_PUBLIC_ID / OBLODAI_SECRET from the environment

  const invoice = await oblodai.payments.create({
    amount: "25",
    currency: "USDT",
    network: "tron",
    order_id: `order-${Date.now()}`,
    url_success: "https://shop.example/thanks",
  });
  console.log("pay at", invoice.url, "or send", invoice.payer_amount, "to", invoice.address);

  let status = invoice.status;
  while (!isPaymentFinal(status)) {
    await new Promise((r) => setTimeout(r, pollEvery * 1000));
    status = (await oblodai.payments.getInfo({ uuid: invoice.uuid })).status;
  }
  console.log(isPaymentPaid(status) ? "paid" : `ended as ${status}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
