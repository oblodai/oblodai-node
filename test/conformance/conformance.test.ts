/**
 * The shared conformance suite every Oblodai SDK runs (backend `tools/sdkgen/conformance`).
 *
 * Scenarios are read from `$SDKGEN_CONFORMANCE`, else from `tools/sdkgen/conformance` of the backend
 * checkout the drift check uses (`$OBLODAI_BACKEND`, else `../oblodai-backend`). Signing vectors are
 * not in the scenario files: each suite names the backend `openapi.json` and a pointer into its
 * `x-oblodai-signing`, and the vectors are read from there.
 *
 * Every call scenario runs on the real client over a scripted fetch; retry pauses are recorded
 * instead of slept.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Oblodai, OblodaiError, SignatureError, WebhookPayloadError } from "../../src/index.js";
import { canonicalString, signRequest, signWebhook } from "../../src/core/signing.js";
import { isKnownEvent, verifyWebhook, verifyWebhookDelivery } from "../../src/webhooks.js";
import { WEBHOOK_EVENTS } from "../../src/generated/events.js";
import { conformanceDir } from "../support/backend.js";

const DIR = conformanceDir();
const found = existsSync(DIR);
if (!found && (process.env.SDKGEN_CONFORMANCE || process.env.OBLODAI_BACKEND)) {
  throw new Error(`conformance suite not found at ${DIR}`);
}

type Json = any;

const suite = (name: string): Json => JSON.parse(readFileSync(join(DIR, `${name}.json`), "utf8"));

function pointer(doc: Json, path: string): Json {
  return path
    .replace(/^\//, "")
    .split("/")
    .reduce((cur, part) => cur[part.replace(/~1/g, "/").replace(/~0/g, "~")], doc);
}

/** The spec's `x-oblodai-signing` and the vectors the suite points at. */
function source(s: Json): { signing: Json; vectors: Json[] } {
  const spec = JSON.parse(readFileSync(join(DIR, s.source.spec), "utf8"));
  return { signing: spec["x-oblodai-signing"], vectors: pointer(spec, s.source.pointer) };
}

function cases(name: string): Array<[string, Json, Json, Json]> {
  const s = suite(name);
  const { signing, vectors } = source(s);
  return s.checks.flatMap((check: Json) =>
    vectors.map(
      (vector, i) => [`${check.name}#${i}`, check, vector, signing] as [string, Json, Json, Json],
    ),
  );
}

/** `operationId` → [resource class, method], read from the generated source. */
function operations(): Map<string, [string, string]> {
  const src = readFileSync(join(__dirname, "../../src/generated/resources.ts"), "utf8");
  const out = new Map<string, [string, string]>();
  let cls = "";
  let method = "";
  for (const line of src.split("\n")) {
    const c = /^export class (\w+) extends Resource/.exec(line);
    if (c) cls = c[1]!;
    const m = /^ {2}(\w+)\(/.exec(line);
    if (m) method = m[1]!;
    const r = /this\._request\(ROUTES\.(\w+),/.exec(line);
    if (r) out.set(r[1]!, [cls, method]);
  }
  return out;
}

describe.skipIf(!found)("conformance", () => {
  describe("request signing", () => {
    it.each(found ? cases("signing") : [])("%s", (_, check, v) => {
      const input = {
        ts: v.ts,
        method: v.method,
        requestUri: v.request_uri,
        body: v.body,
        idempotencyKey: v.idempotency_key || undefined,
      };
      if (check.kind === "request_canonical") {
        expect(canonicalString(input)).toBe(v.canonical);
      } else {
        expect(check.kind).toBe("request_signature");
        expect(signRequest(v.secret, input)).toBe(v.signature);
      }
    });
  });

  describe("webhook deliveries", () => {
    const deliverySuite = found ? suite("webhook_delivery") : { headers: {}, checks: [] };
    const deliveries: Json[] = found ? source(deliverySuite).vectors : [];
    const camel = (snake: string) => snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

    it.skipIf(!found)("has a delivery of every event this release knows", () => {
      expect(deliveries.map((d) => d.event).sort()).toEqual(
        Object.values(WEBHOOK_EVENTS).flat().sort(),
      );
    });

    const deliveryCases: Array<[string, Json, Json]> = deliverySuite.checks.flatMap((check: Json) =>
      deliveries.map(
        (d) => [`${check.name} — ${d.event} (${check.key})`, check, d] as [string, Json, Json],
      ),
    );
    it.each(deliveryCases)("%s", (_, check, d) => {
      expect(check.kind).toBe("webhook_delivery");
      const secret = check.key === "previous" ? d.previous_secret : d.secret;
      const delivery = verifyWebhookDelivery(d.payload, d.headers, { secret, now: () => d.ts });
      expect(isKnownEvent(delivery.event)).toBe(true);
      expect(delivery.event.type).toBe(d.kind);
      expect(WEBHOOK_EVENTS[d.kind as keyof typeof WEBHOOK_EVENTS]).toContain(d.event);
      for (const [header, field] of Object.entries(
        deliverySuite.headers as Record<string, string>,
      )) {
        if (field === "") continue;
        const value = (delivery as unknown as Record<string, unknown>)[camel(field)];
        const want: string = d.headers[header];
        expect(value, `${camel(field)} ≠ ${header}`).toBe(
          typeof value === "number" ? Number(want) : want,
        );
      }
    });
  });

  describe("webhooks", () => {
    it.each(found ? cases("webhook") : [])("%s", (_, check, v, signing) => {
      if (check.kind === "webhook_signature") {
        expect(signWebhook(v.secret, v.ts, v.payload)).toBe(v.signature);
        return;
      }
      expect(check.kind).toBe("webhook_verify");
      const skew = Number(signing.skew_seconds);
      const offset =
        check.now_from_ts === "skew"
          ? skew
          : check.now_from_ts === "skew+1"
            ? skew + 1
            : Number(check.now_from_ts);
      let payload: string = v.payload;
      let signature: string = v.signature;
      if (check.mutate === "payload") payload += " ";
      else if (check.mutate === "signature")
        signature = (signature[0] !== "0" ? "0" : "1") + signature.slice(1);
      const headers = { "X-Webhook-Timestamp": String(v.ts), "X-Webhook-Signature": signature };
      const verify = () =>
        verifyWebhook(payload, headers, {
          secret: v.secret,
          toleranceSec: skew,
          now: () => v.ts + offset,
        });
      if (check.expect === "ok") {
        // The vectors sign bare payloads, not whole events: verification gets past the MAC and the
        // freshness window and only then may refuse to parse — that refusal still is a pass.
        try {
          verify();
        } catch (err) {
          expect(err).toBeInstanceOf(WebhookPayloadError);
        }
        return;
      }
      let caught: unknown;
      try {
        verify();
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(SignatureError);
      expect((caught as SignatureError).code).toBe(`webhook.${check.expect}`);
    });
  });

  describe("calls", () => {
    const ops = found ? operations() : new Map();
    const scenarios = found
      ? ["retry", "money", "forward_compat"].flatMap((name) =>
          suite(name).scenarios.map((s: Json) => [`${name}/${s.name}`, s] as [string, Json]),
        )
      : [];

    it.each(scenarios)("%s", async (_, scenario) => {
      const queue: Json[] = [...scenario.responses];
      const requests: Array<{ url: string; headers: Record<string, string>; body?: string }> = [];
      const fetch = async (url: string, init: RequestInit): Promise<Response> => {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(init.headers as Record<string, string>)) {
          headers[k.toLowerCase()] = v;
        }
        requests.push({
          url,
          headers,
          ...(typeof init.body === "string" ? { body: init.body } : {}),
        });
        const next = queue.shift();
        if (!next) throw new Error(`unscripted request ${init.method} ${url}`);
        if (next.transport_error === "timeout") {
          // What undici raises when the peer does not answer in time.
          throw Object.assign(new TypeError("fetch failed"), {
            cause: Object.assign(new Error("Headers Timeout Error"), {
              code: "UND_ERR_HEADERS_TIMEOUT",
            }),
          });
        }
        const h: Record<string, string> = { ...next.headers };
        if ("json" in next) {
          return new Response(JSON.stringify(next.json), {
            status: next.status,
            headers: { "content-type": "application/json", ...h },
          });
        }
        return new Response("<html>proxy</html>", {
          status: next.status,
          headers: { "content-type": "text/html", ...h },
        });
      };
      const client = new Oblodai({
        publicId: "pk_conformance",
        secret: "sk_conformance",
        baseUrl: "https://api.test",
        fetch,
        env: {},
      });
      const delays: number[] = [];
      client.transport.sleep = async (ms) => {
        delays.push(ms);
      };

      const op = ops.get(scenario.call.operation);
      expect(op, `no generated method serves ${scenario.call.operation}`).toBeDefined();
      const [cls, method] = op!;
      const resource = Object.values(client).find((r) => r?.constructor?.name === cls);
      expect(resource, `no resource on the client is a ${cls}`).toBeDefined();
      const args = Object.keys(scenario.call.args).length ? [{ ...scenario.call.args }] : [];

      let result: Json;
      let error: unknown;
      try {
        result = await resource[method](...args);
      } catch (err) {
        error = err;
      }

      const expectations = scenario.expect;
      expect(requests.map((r) => r.url)).toHaveLength(expectations.requests);
      const keys = requests.map((r) => r.headers["idempotency-key"]);
      if (expectations.idempotency_key === "absent")
        expect(keys.every((k) => k === undefined)).toBe(true);
      if (expectations.idempotency_key === "present") expect(keys.every((k) => !!k)).toBe(true);
      if (expectations.same_idempotency_key) {
        expect(keys[0]).toBeTruthy();
        expect(new Set(keys).size).toBe(1);
      }
      if ("delays_ms" in expectations) expect(delays).toEqual(expectations.delays_ms);
      for (const [name, want] of Object.entries(expectations.request_body_field ?? {})) {
        expect(JSON.parse(requests.at(-1)!.body!)[name]).toEqual(want);
      }
      if ("error_code" in expectations) {
        expect(error).toBeInstanceOf(OblodaiError);
        expect((error as OblodaiError).code).toBe(expectations.error_code);
        return;
      }
      if (error !== undefined) throw error;
      for (const [name, want] of Object.entries(expectations.result_field ?? {})) {
        expect(result[name]).toEqual(want);
      }
    });
  });
});
