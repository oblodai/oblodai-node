import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Oblodai } from "../../src/index.js";
import { NON_MONEY_NUMBERS, serializeBody } from "../../src/core/request.js";
import { backendRoot } from "../support/backend.js";
import { mockFetch, ok } from "../support/mock-fetch.js";

const creds = { publicId: "pk", secret: "s", baseUrl: "https://api.test" };

describe("a float in an amount fails before the network (spec §3.3)", () => {
  it("refuses a fractional number and sends nothing", async () => {
    const { fetch, calls } = mockFetch([ok({})]);
    const ob = new Oblodai({ ...creds, fetch });
    const err = await ob.payments
      .create({ amount: 25.5 as unknown as string, currency: "USDT" })
      .catch((e) => e);
    expect(err.code).toBe("sdk.float_amount");
    expect(err.field).toBe("amount");
    expect(String(err)).toContain('"25.5"');
    expect(calls).toHaveLength(0);
  });

  it("names the path of a nested float", () => {
    expect(() =>
      serializeBody({ payouts: [{ amount: "1" }, { amount: 0.1 + 0.2 }] }, "POST"),
    ).toThrow(expect.objectContaining({ code: "sdk.float_amount", field: "payouts[1].amount" }));
  });

  it("refuses NaN and Infinity too, and lets integers and decimal strings through", () => {
    expect(() => serializeBody({ amount: Number.NaN }, "POST")).toThrow(/float/);
    expect(() => serializeBody({ amount: Infinity }, "POST")).toThrow(/float/);
    expect(serializeBody({ amount: "25.10", limit: 10 }, "POST")).toBe(
      '{"amount":"25.10","limit":10}',
    );
  });

  it("allows a fraction in the fields that are not money", () => {
    expect(serializeBody({ accuracy_payment_percent: 0.5 }, "POST")).toBe(
      '{"accuracy_payment_percent":0.5}',
    );
  });

  it("the not-money set is exactly the fractional numbers of the contract's request bodies", () => {
    const spec = JSON.parse(
      readFileSync(join(backendRoot(), "services", "core", "api", "openapi.json"), "utf8"),
    ) as {
      paths: Record<
        string,
        Record<string, { requestBody?: { content?: Record<string, { schema?: unknown }> } }>
      >;
      components: { schemas: Record<string, unknown> };
    };
    const found = new Set<string>();
    const seen = new Set<unknown>();
    const walk = (schema: unknown): void => {
      if (!schema || typeof schema !== "object" || seen.has(schema)) return;
      seen.add(schema);
      const s = schema as Record<string, unknown>;
      if (typeof s.$ref === "string") {
        walk(spec.components.schemas[s.$ref.split("/").pop()!]);
        return;
      }
      for (const [name, prop] of Object.entries((s.properties ?? {}) as Record<string, unknown>)) {
        const p = prop as Record<string, unknown>;
        if (p.type === "number" || (Array.isArray(p.type) && p.type.includes("number"))) {
          found.add(name);
        }
        walk(p);
      }
      for (const key of ["items", "additionalProperties"]) walk(s[key]);
      for (const key of ["allOf", "oneOf", "anyOf"]) {
        for (const sub of (s[key] as unknown[] | undefined) ?? []) walk(sub);
      }
    };
    for (const ops of Object.values(spec.paths)) {
      for (const op of Object.values(ops))
        walk(op?.requestBody?.content?.["application/json"]?.schema);
    }
    expect([...found].sort()).toEqual([...NON_MONEY_NUMBERS].sort());
  });
});
