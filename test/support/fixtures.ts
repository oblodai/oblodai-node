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
  "70200ecc6784c713e4fcda1c7b4d3e520713bb109edeacc541c3a90fa8cfd91f";

export function loadWebhookSamples(): WebhookSample[] {
  return JSON.parse(
    readFileSync(join(__dirname, "..", "fixtures", "webhook-samples.json"), "utf8"),
  ) as WebhookSample[];
}
