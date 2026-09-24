import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  KNOWN_EVENT_KINDS,
  LRO,
  TERMINAL_STATUSES,
  WEBHOOK_EVENTS,
  isKnownEvent,
  isPaymentFinal,
  isPaymentPaid,
  isPayoutFinal,
  isPayoutSucceeded,
  parseWebhook,
} from "../../src/index.js";
import { POLLS } from "../../src/generated/facts.js";

// The facts the runtime acts on (long-running operations, webhook event kinds, status classes) are
// generated from the contract, not kept by hand: the public helpers are held to the generated
// tables and, when the backend checkout is at hand, to the contract itself.

interface Spec {
  paths: Record<
    string,
    Record<string, { operationId?: string; "x-sdk-poll"?: { operation: string } }>
  >;
  webhooks: Record<string, unknown>;
  components: {
    schemas: Record<string, { enum?: string[]; "x-status-classes"?: { final: string[] } }>;
  };
}

const backend = process.env.OBLODAI_BACKEND ?? join(__dirname, "..", "..", "..", "oblodai-backend");
let spec: Spec | undefined;
try {
  spec = JSON.parse(
    readFileSync(join(backend, "services", "core", "api", "openapi.json"), "utf8"),
  ) as Spec;
} catch {
  spec = undefined;
}

describe("contract facts", () => {
  it("event kinds include conversion and every kind is recognised", () => {
    expect(KNOWN_EVENT_KINDS).toContain("conversion");
    const ev = parseWebhook(JSON.stringify({ type: "conversion", id: "c-1", status: "completed" }));
    expect(isKnownEvent(ev)).toBe(true);
    for (const kind of KNOWN_EVENT_KINDS) expect(WEBHOOK_EVENTS[kind].length).toBeGreaterThan(0);
    expect(WEBHOOK_EVENTS.conversion).toEqual(["conversion.completed", "conversion.refunded"]);
  });

  it("a known kind without its id field is unreadable", () => {
    expect(() => parseWebhook('{"type":"conversion","uuid":"x"}')).toThrow(/`id`/);
  });

  it("the status helpers follow the classes", () => {
    expect(isPaymentFinal("wrong_amount") && !isPaymentPaid("wrong_amount")).toBe(true);
    expect(isPaymentPaid("paid_over") && !isPaymentFinal("created")).toBe(true);
    expect(isPayoutFinal("failed") && !isPayoutSucceeded("failed")).toBe(true);
    expect(isPayoutSucceeded("confirmed") && !isPayoutFinal("sent")).toBe(true);
  });

  it("LRO and TERMINAL_STATUSES are derived from the generated plans", () => {
    expect(LRO).toEqual(
      Object.fromEntries(Object.entries(POLLS).map(([create, p]) => [create, p.operation])),
    );
    expect([...TERMINAL_STATUSES].sort()).toEqual(
      [...new Set(Object.values(POLLS).flatMap((p) => p.terminal))].sort(),
    );
  });

  it.skipIf(!spec)("match the backend contract", () => {
    const s = spec!;
    const polls: Record<string, string> = {};
    for (const ops of Object.values(s.paths)) {
      for (const op of Object.values(ops)) {
        if (op["x-sdk-poll"] && op.operationId) polls[op.operationId] = op["x-sdk-poll"].operation;
      }
    }
    expect(LRO).toEqual(polls);
    const kinds = new Set(Object.keys(s.webhooks).map((e) => e.split(".")[0]));
    expect(kinds.has("conversion")).toBe(true);
    expect(
      s.components.schemas.PaymentStatus?.["x-status-classes"]?.final.every(isPaymentFinal),
    ).toBe(true);
  });
});
