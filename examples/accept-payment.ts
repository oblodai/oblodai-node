// Create an invoice, show the payer the address/URL, then poll until it is final.
import { Oblodai, isPaymentFinal, isPaymentPaid, isPaymentUnderpaid } from "@oblodai-npm/sdk";

const oblodai = new Oblodai(); // OBLODAI_PUBLIC_ID / OBLODAI_SECRET from the environment

const invoice = await oblodai.payments.create({
  amount: "25",
  currency: "USDT",
  network: "tron",
  order_id: `order-${Date.now()}`,
  url_success: "https://shop.example/thanks",
});
console.log(
  "pay at",
  invoice.url,
  "or send",
  invoice.payer_amount,
  invoice.payer_currency,
  "to",
  invoice.address,
);

let current = invoice;
while (!isPaymentFinal(current.status)) {
  await new Promise((r) => setTimeout(r, 10_000));
  current = await oblodai.payments.info({ uuid: invoice.uuid });
}
console.log(
  isPaymentPaid(current.status) ? `paid ${current.amount_paid}` : `ended as ${current.status}`,
);
