import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HEADER_WEBHOOK_EVENT,
  HEADER_WEBHOOK_EVENT_ID,
  HEADER_WEBHOOK_EVENT_TIME,
  HEADER_WEBHOOK_ID,
  HEADER_WEBHOOK_SIGNATURE,
  HEADER_WEBHOOK_SIGNATURE_PREV,
  HEADER_WEBHOOK_TEST,
  HEADER_WEBHOOK_TIMESTAMP,
} from "../../src/generated/signing.js";

/** Deliveries the core's real dispatcher sent to a recorder, headers and exact bytes included. */
export interface WebhookSample {
  headers: Record<string, string>;
  body: Record<string, unknown>;
  raw?: string;
}

/** The endpoint secret in force when the samples were recorded (the rotate-secret answer). */
export const WEBHOOK_SAMPLES_SECRET =
  "70200ecc6784c713e4fcda1c7b4d3e520713bb109edeacc541c3a90fa8cfd91f";

/**
 * The samples keep the header names they were recorded under; each maps to its role's current name
 * from the contract, so a header the core renames reaches the samples with regeneration alone.
 */
export const RECORDED_WEBHOOK_HEADERS: Record<string, string> = {
  "X-Webhook-Timestamp": HEADER_WEBHOOK_TIMESTAMP,
  "X-Webhook-Signature": HEADER_WEBHOOK_SIGNATURE,
  "X-Webhook-Signature-Prev": HEADER_WEBHOOK_SIGNATURE_PREV,
  "X-Webhook-Event": HEADER_WEBHOOK_EVENT,
  "X-Webhook-Id": HEADER_WEBHOOK_ID,
  "X-Webhook-Event-Id": HEADER_WEBHOOK_EVENT_ID,
  "X-Webhook-Event-Time": HEADER_WEBHOOK_EVENT_TIME,
  "X-Webhook-Test": HEADER_WEBHOOK_TEST,
};

/** Recorded deliveries, their headers under the contract's current names. */
export function loadWebhookSamples(): WebhookSample[] {
  const samples = JSON.parse(
    readFileSync(join(__dirname, "..", "fixtures", "webhook-samples.json"), "utf8"),
  ) as WebhookSample[];
  for (const s of samples) {
    s.headers = Object.fromEntries(
      Object.entries(s.headers).map(([k, v]) => [RECORDED_WEBHOOK_HEADERS[k] ?? k, v]),
    );
  }
  return samples;
}
