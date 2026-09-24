import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Deliveries the core's real dispatcher sent to a recorder, headers and exact bytes included. */
export interface WebhookSample {
  headers: Record<string, string>;
  body: Record<string, unknown>;
  raw?: string;
}

/** The endpoint secret in force when the samples were recorded (the rotate-secret answer). */
export const WEBHOOK_SAMPLES_SECRET =
  "0000000000000000000000000000000000000000000000000000000000000000";

export function loadWebhookSamples(): WebhookSample[] {
  return JSON.parse(
    readFileSync(join(__dirname, "..", "fixtures", "webhook-samples.json"), "utf8"),
  ) as WebhookSample[];
}
