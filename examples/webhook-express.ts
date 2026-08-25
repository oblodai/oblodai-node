// Express receiver: verify over the RAW body, deduplicate by X-Webhook-Id, ignore stale sequences.
import express from "express";
import { verifyWebhook, isStaleEvent, SignatureError } from "@oblodai-npm/sdk/webhooks";

const app = express();
const lastSequence = new Map<string, number>(); // per object uuid; use your database in production

app.post("/oblodai/webhook", express.raw({ type: "*/*" }), (req, res) => {
  let event;
  try {
    event = verifyWebhook(req.body, req.headers, { secret: process.env.OBLODAI_WEBHOOK_SECRET! });
  } catch (err) {
    if (err instanceof SignatureError) return res.status(400).send(err.code);
    throw err;
  }
  if (isStaleEvent(event, lastSequence.get(event.uuid))) return res.sendStatus(200);
  lastSequence.set(event.uuid, event.sequence);

  switch (event.type) {
    case "payment":
      if (event.status === "paid" || event.status === "paid_over")
        console.log("order paid", event.order_id);
      break;
    case "payout":
      console.log("payout", event.uuid, event.status);
      break;
    case "wallet":
      console.log("deposit on static wallet", event.address, event.payment_amount);
      break;
  }
  res.sendStatus(200);
});

app.listen(3000);
