// Express receiver: verify over the RAW body, deduplicate by X-Webhook-Id, ignore stale sequences.
import express from "express";
import { verifyWebhookDelivery, isStaleEvent, SignatureError } from "@oblodai-npm/sdk/webhooks";

const app = express();
const seenDeliveries = new Set<string>(); // X-Webhook-Id; use your database in production
const lastSequence = new Map<string, number>(); // per object uuid

app.post("/oblodai/webhook", express.raw({ type: "*/*" }), (req, res) => {
  let delivery;
  try {
    delivery = verifyWebhookDelivery(req.body, req.headers, {
      secret: process.env.OBLODAI_WEBHOOK_SECRET!,
    });
  } catch (err) {
    if (err instanceof SignatureError) return res.status(400).send(err.code);
    throw err;
  }
  const { event, id } = delivery;
  if (id && seenDeliveries.has(id)) return res.sendStatus(200); // retry of a delivery we already handled
  if (id) seenDeliveries.add(id);
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
