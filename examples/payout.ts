// Validate first (free, no side effects), then create with your own idempotency key.
import { Oblodai, OblodaiError } from "@oblodai-npm/sdk";

const oblodai = new Oblodai({
  publicId: process.env.OBLODAI_PAYOUT_PUBLIC_ID,
  secret: process.env.OBLODAI_PAYOUT_SECRET,
});
const params = {
  amount: "10",
  currency: "USDT",
  network: "tron",
  address: "TQrY8bkbpXKPt2LZbU8jqfnpFbUSF15sbx",
  order_id: "payout-42",
};

try {
  const check = await oblodai.payouts.validate(params);
  console.log(
    "will debit",
    check.payer_amount,
    "commission",
    check.commission,
    "fee bearer",
    check.fee_bearer,
  );
  const payout = await oblodai.payouts.create(params, { idempotencyKey: `payout-42` });
  console.log(payout.uuid, payout.status);
} catch (err) {
  if (err instanceof OblodaiError)
    console.error(err.code, err.message, err.retryable ? "(retry later)" : "", err.requestId);
  else throw err;
}
