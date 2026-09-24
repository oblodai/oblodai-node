// Express receiver: verify over the RAW body, deduplicate by X-Webhook-Id, ignore stale sequences.
import express from "express";
import {
  verifyWebhookDelivery,
  isStaleEvent,
  isKnownEvent,
  SignatureError,
  WebhookPayloadError,
} from "@oblodai-npm/sdk/webhooks";

export const app = express();
const seenDeliveries = new Set<string>(); // X-Webhook-Id; use your database in production
const lastSequence = new Map<string, number>(); // per object id

app.post("/oblodai/webhook", express.raw({ type: "*/*" }), (req, res) => {
  let delivery;
  try {
    delivery = verifyWebhookDelivery(req.body, req.headers, {
      secret: process.env.OBLODAI_WEBHOOK_SECRET!,
    });
  } catch (err) {
    // A forged or stale delivery: answer 4xx so the sender stops.
    if (err instanceof SignatureError) return res.status(400).send(err.code);
    // Authentic but unreadable — NOT a signature failure. Answer 5xx so it is retried, and alert.
    if (err instanceof WebhookPayloadError) return res.status(500).send(err.code);
    throw err;
  }
  const { event, id } = delivery;
  if (id && seenDeliveries.has(id)) return res.sendStatus(200); // a retry we already handled
  if (id) seenDeliveries.add(id);
  // An event type this SDK release does not model: log it and acknowledge, never crash.
  if (!isKnownEvent(event)) {
    console.log("unknown event type", event.type);
    return res.sendStatus(200);
  }
  // Invoices, payouts and wallet deposits carry `uuid`; conversions (and kinds added later) `id`.
  const objectId = "uuid" in event ? event.uuid : event.id;
  if (isStaleEvent(event, lastSequence.get(objectId))) return res.sendStatus(200);
  lastSequence.set(objectId, event.sequence);

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
    case "conversion":
      console.log("conversion", event.id, event.status);
      break;
  }
  return res.sendStatus(200);
});

if (import.meta.url === `file://${process.argv[1]}`) app.listen(3000);
