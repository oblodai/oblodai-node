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
import { SkewCorrectingClock } from "../../src/core/clock.js";
import { makeCredentials, type Query } from "../../src/core/request.js";
import type { HttpMethod, RouteSpec } from "../../src/core/route.js";
import { Transport } from "../../src/core/transport.js";
import {
  isKnownEvent,
  parseWebhook,
  verifyWebhook,
  verifyWebhookDelivery,
} from "../../src/webhooks.js";
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

/**
 * The spec's `x-oblodai-signing`, the vectors the suite points at and the header names by role
 * (`header_names`): read from the spec, never from the SDK's own constants, so a rename in the core
 * that did not reach the SDK fails here.
 */
function source(s: Json): { signing: Json; vectors: Json[]; names: Record<string, string> } {
  const spec = JSON.parse(readFileSync(join(DIR, s.source.spec), "utf8"));
  const names: Record<string, string> = {};
  if (s.header_names) {
    const list: string[] = pointer(spec, s.header_names.pointer);
    expect(list).toHaveLength(s.header_names.roles.length);
    s.header_names.roles.forEach((role: string, i: number) => (names[role] = list[i]!));
  }
  return { signing: spec["x-oblodai-signing"], vectors: pointer(spec, s.source.pointer), names };
}

function cases(name: string): Array<[string, Json, Json, Json, Record<string, string>]> {
  const s = suite(name);
  const { signing, vectors, names } = source(s);
  return s.checks.flatMap((check: Json) =>
    vectors.map(
      (vector, i) =>
        [`${check.name}#${i}`, check, vector, signing, names] as [
          string,
          Json,
          Json,
          Json,
          Record<string, string>,
        ],
    ),
  );
}

/**
 * Send a request vector through the signing transport the client's methods use — keys `publicId`
 * + the vector's secret, clock at the vector's `ts` — and return the headers that reached fetch,
 * with lower-cased names.
 */
async function sendVector(v: Json, publicId: string): Promise<Record<string, string>> {
  const sent: Array<Record<string, string>> = [];
  const fetch = async (_url: string, init: RequestInit): Promise<Response> => {
    const headers: Record<string, string> = {};
    for (const [k, value] of Object.entries(init.headers as Record<string, string>)) {
      headers[k.toLowerCase()] = value;
    }
    sent.push(headers);
    expect(init.body ?? "").toBe(v.body);
    return new Response(JSON.stringify({ result: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const [path, rawQuery] = String(v.request_uri).split("?", 2) as [string, string | undefined];
  const query: Query = Object.fromEntries(new URLSearchParams(rawQuery ?? ""));
  const route: RouteSpec = {
    operationId: "conformanceRequestHeaders",
    method: v.method as HttpMethod,
    path,
    auth: "key",
    idempotent: v.idempotency_key !== "",
    safe: false,
    bare: false,
    listKind: null,
  };
  const transport = new Transport({
    baseUrl: "https://api.test",
    userAgent: "conformance",
    credentials: makeCredentials(publicId, v.secret),
    fetch,
    clock: new SkewCorrectingClock({ now: () => v.ts }),
  });
  await transport.call(route, {
    query,
    ...(v.method === "GET" ? {} : { body: JSON.parse(v.body) }),
    ...(v.idempotency_key ? { idempotencyKey: v.idempotency_key } : {}),
  });
  expect(sent).toHaveLength(1);
  return sent[0]!;
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
    it.each(found ? cases("signing") : [])("%s", async (_, check, v, _signing, names) => {
      if (check.kind === "request_headers") {
        const headers = await sendVector(v, check.public_id);
        const sent = (role: string) => headers[names[role]!.toLowerCase()];
        expect(sent("public_id"), names.public_id).toBe(check.public_id);
        expect(sent("signature"), names.signature).toBe(v.signature);
        expect(sent("timestamp"), names.timestamp).toBe(String(v.ts));
        expect(sent("idempotency_key"), names.idempotency_key).toBe(
          v.idempotency_key === "" ? undefined : v.idempotency_key,
        );
        return;
      }
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
    const deliverySuite = found ? suite("webhook_delivery") : { fields: {}, checks: [] };
    const { vectors: deliveries, names: deliveryNames } = found
      ? source(deliverySuite)
      : { vectors: [] as Json[], names: {} as Record<string, string> };
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
      for (const [role, field] of Object.entries(deliverySuite.fields as Record<string, string>)) {
        if (field === "") continue;
        const header = deliveryNames[role]!;
        expect(header, `no header name for role ${role}`).toBeTruthy();
        const value = (delivery as unknown as Record<string, unknown>)[camel(field)];
        const want: string = d.headers[header];
        expect(value, `${camel(field)} ≠ ${header}`).toBe(
          typeof value === "number" ? Number(want) : want,
        );
      }
    });
  });

  describe("webhooks", () => {
    it.each(found ? cases("webhook") : [])("%s", (_, check, v, signing, names) => {
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
      const headers = { [names.timestamp!]: String(v.ts), [names.signature!]: signature };
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

  // forward_compat webhooks: the body parses, keeps its raw type, and is known exactly as said.
  describe("webhook bodies", () => {
    const bodies: Array<[string, Json]> = found
      ? suite("forward_compat").webhooks.map((b: Json) => [b.name, b] as [string, Json])
      : [];

    it.skipIf(!found)("has webhook bodies", () => {
      expect(bodies.length).toBeGreaterThan(0);
    });

    it.each(bodies)("%s", (_, body) => {
      const event = parseWebhook(JSON.stringify(body.body));
      expect(event.type).toBe(body.expect.type);
      expect(isKnownEvent(event)).toBe(body.expect.known);
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
