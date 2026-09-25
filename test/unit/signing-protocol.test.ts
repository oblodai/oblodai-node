import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import * as core from "../../src/core/signing.js";
import { MAX_IDEMPOTENCY_KEY_LENGTH as IDEMPOTENCY_LIMIT } from "../../src/core/idempotency.js";
import * as gen from "../../src/generated/signing.js";
import * as webhooks from "../../src/webhooks.js";
import { backendRoot, hasBackend } from "../support/backend.js";

// The signing protocol has one source: `x-oblodai-signing` of the contract, generated into
// src/generated/signing.ts. The runtime reads the header names, the canonical strings and the
// limits from there, so a header the core renames reaches this SDK by regeneration alone.

const REQUEST_ROLES = ["public_id", "signature", "timestamp", "idempotency_key"];
const WEBHOOK_ROLES = [
  "timestamp",
  "signature",
  "signature_prev",
  "event",
  "id",
  "event_id",
  "event_time",
];

interface SigningSpec {
  headers: string[];
  skew_seconds: number;
  max_body: number;
  max_idempotency_key_length: number;
  algorithm: string;
  webhook: { headers: string[]; test_header: string };
}

function spec(): SigningSpec {
  const doc = JSON.parse(
    readFileSync(join(backendRoot(), "services", "core", "api", "openapi.json"), "utf8"),
  ) as { "x-oblodai-signing": SigningSpec };
  return doc["x-oblodai-signing"];
}

const constant = (name: string): unknown => (gen as Record<string, unknown>)[name];

describe.skipIf(!hasBackend())("the generated signing protocol is the contract's", () => {
  it("names every header by its role, and carries the limits", () => {
    const s = spec();
    REQUEST_ROLES.forEach((role, i) =>
      expect(constant(`HEADER_${role.toUpperCase()}`), role).toBe(s.headers[i]),
    );
    WEBHOOK_ROLES.forEach((role, i) =>
      expect(constant(`HEADER_WEBHOOK_${role.toUpperCase()}`), role).toBe(s.webhook.headers[i]),
    );
    expect(gen.HEADER_WEBHOOK_TEST).toBe(s.webhook.test_header);
    expect(gen.SKEW_SECONDS).toBe(s.skew_seconds);
    expect(gen.MAX_BODY).toBe(s.max_body);
    expect(gen.MAX_IDEMPOTENCY_KEY_LENGTH).toBe(s.max_idempotency_key_length);
    expect(gen.SIGNATURE_ALGORITHM).toBe(s.algorithm);
  });

  it("spells no signing header outside src/generated", () => {
    const s = spec();
    const names = [...s.headers, ...s.webhook.headers, s.webhook.test_header].map((n) =>
      n.toLowerCase(),
    );
    const src = join(__dirname, "..", "..", "src");
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          if (entry !== "generated") walk(path);
          continue;
        }
        const text = readFileSync(path, "utf8").toLowerCase();
        for (const n of names) if (text.includes(n)) offenders.push(`${relative(src, path)}: ${n}`);
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });
});

describe("the public names alias the generated values", () => {
  it("request and webhook headers, the skew and the key limit", () => {
    for (const role of REQUEST_ROLES) {
      const name = `HEADER_${role.toUpperCase()}`;
      expect((core as Record<string, unknown>)[name], name).toBe(constant(name));
    }
    for (const role of [...WEBHOOK_ROLES, "test"]) {
      const name = `HEADER_WEBHOOK_${role.toUpperCase()}`;
      expect((webhooks as Record<string, unknown>)[name], name).toBe(constant(name));
    }
    expect(core.SIGNATURE_SKEW_SECONDS).toBe(gen.SKEW_SECONDS);
    expect(webhooks.DEFAULT_TOLERANCE_SECONDS).toBe(gen.SKEW_SECONDS);
    expect(IDEMPOTENCY_LIMIT).toBe(gen.MAX_IDEMPOTENCY_KEY_LENGTH);
  });
});

// The body and idempotency-key limits as source literals: decimal, and `1 << n` for a power of two
// (digit separators — 1_048_576 — do not hide one). The skew is not scanned for: its value is also an
// HTTP status class (`< 300`); the alias assertions above hold it.
function limitPatterns(): RegExp[] {
  const pats = [gen.MAX_BODY, gen.MAX_IDEMPOTENCY_KEY_LENGTH].map(
    (limit) => new RegExp(`(?<![\\w.])${limit}(?![\\w.])`),
  );
  if ((gen.MAX_BODY & (gen.MAX_BODY - 1)) === 0) {
    pats.push(new RegExp(`\\b1\\s*<<\\s*${Math.log2(gen.MAX_BODY)}\\b`));
  }
  return pats;
}

describe("the limits are read from src/generated", () => {
  it("spells no literal of the body or idempotency-key limit outside src/generated", () => {
    const pats = limitPatterns();
    const src = join(__dirname, "..", "..", "src");
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          if (entry !== "generated") walk(path);
          continue;
        }
        const text = readFileSync(path, "utf8").replace(/(?<=\d)_(?=\d)/g, "");
        for (const p of pats)
          if (p.test(text)) offenders.push(`${relative(src, path)}: ${p.source}`);
      }
    };
    walk(src);
    expect(offenders).toEqual([]);
  });
});
