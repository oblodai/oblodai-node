import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { Oblodai } from "../../src/index.js";
import type { LogFields, Logger } from "../../src/core/logger.js";
import { mockFetch, ok } from "../support/mock-fetch.js";

const creds = {
  publicId: "pk_live_1",
  secret: "SUPER-SECRET-1",
  payoutPublicId: "wk_live_1",
  payoutSecret: "SUPER-SECRET-2",
  adminToken: "ADMIN-TOKEN-1",
  baseUrl: "https://api.test",
};

const SECRETS = ["SUPER-SECRET-1", "SUPER-SECRET-2", "ADMIN-TOKEN-1"];

function expectNoSecrets(text: string, what: string) {
  for (const s of SECRETS) expect(text, `${what} leaked ${s}`).not.toContain(s);
}

describe("secrets never print", () => {
  it("survives JSON.stringify and util.inspect of the client at any depth", () => {
    const { fetch } = mockFetch([]);
    const ob = new Oblodai({ ...creds, fetch });
    expectNoSecrets(JSON.stringify(ob), "JSON.stringify(client)");
    expectNoSecrets(inspect(ob, { depth: 10 }), "inspect(client, depth 10)");
    expectNoSecrets(JSON.stringify(ob.transport), "JSON.stringify(transport)");
    expectNoSecrets(inspect(ob.transport, { depth: 10 }), "inspect(transport)");
    expectNoSecrets(inspect({ client: ob }, { depth: 10 }), "inspect of a wrapper object");
    // The public ids are not secrets and stay visible, so the rendering is still useful.
    expect(JSON.stringify(ob)).toContain("pk_live_1");
  });

  it("redacts a caller-injected logger's fields before it sees them", async () => {
    const seen: Array<[string, LogFields | undefined]> = [];
    const spy: Logger = {
      debug: (m, f) => seen.push([m, f]),
      info: (m, f) => seen.push([m, f]),
      warn: (m, f) => seen.push([m, f]),
      error: (m, f) => seen.push([m, f]),
    };
    const { fetch } = mockFetch([ok({ balance: { merchant: [] } })]);
    const ob = new Oblodai({ ...creds, fetch, logger: spy });
    await ob.account.balance();
    expect(seen.length).toBeGreaterThan(0);
    expectNoSecrets(JSON.stringify(seen), "injected logger fields");
    // The logger the transport holds is a wrapper, not the object the caller handed in: a field
    // named like a secret is scrubbed on the way through, whoever wrote the logger.
    const wrapped = (ob.transport as unknown as { logger: Logger }).logger;
    expect(wrapped).not.toBe(spy);
    wrapped.warn("leak?", { secret: "SUPER-SECRET-1", nested: { token: "ADMIN-TOKEN-1" } });
    expectNoSecrets(JSON.stringify(seen), "wrapped logger");
  });

  it("keeps a webhook secret readable but out of JSON and inspect", async () => {
    const { fetch } = mockFetch([
      ok({ endpoint_id: "e1", url: "https://x", secret: "WHSEC-1" }),
      ok({
        endpoint_id: "e1",
        url: "https://x",
        secret: "WHSEC-2",
        previous_secret_valid_until: "2026-01-01T00:00:00Z",
      }),
    ]);
    const ob = new Oblodai({ ...creds, fetch });
    const endpoint = await ob.webhooks.register("https://x");
    expect(endpoint.secret).toBe("WHSEC-1"); // still usable
    expect(JSON.stringify(endpoint)).not.toContain("WHSEC-1");
    expect(JSON.stringify(endpoint)).toContain("[redacted]");
    expect(inspect(endpoint, { depth: 5 })).not.toContain("WHSEC-1");

    const rotated = await ob.webhooks.rotateSecret();
    expect(rotated.secret).toBe("WHSEC-2");
    expect(JSON.stringify(rotated)).not.toContain("WHSEC-2");
    expect(rotated.previous_secret_valid_until).toBe("2026-01-01T00:00:00Z");
  });

  it("keeps a payout link's claim token and passcode out of logs", async () => {
    const link = { link_id: "l1", claim_token: "CLAIM-1", passcode: "PASS-1", amount: "1" };
    const { fetch } = mockFetch([
      ok(link),
      ok({ items: [{ idx: 0, ok: true, result: { ...link } }] }),
    ]);
    const ob = new Oblodai({ ...creds, fetch });
    const created = await ob.payoutLinks.create({ amount: "1", currency: "USDT", network: "tron" });
    expect(created.claim_token).toBe("CLAIM-1");
    expect(JSON.stringify(created)).not.toContain("CLAIM-1");
    expect(JSON.stringify(created)).not.toContain("PASS-1");
    expect(inspect(created, { depth: 5 })).not.toContain("CLAIM-1");

    const batch = await ob.payoutLinks.batch({ items: [] });
    expect(batch.items[0]!.result!.claim_token).toBe("CLAIM-1");
    expect(JSON.stringify(batch)).not.toContain("CLAIM-1");
  });

  it("keeps freshly minted merchant key secrets out of logs", async () => {
    const pair = (s: string) => ({ public_id: "pk_x", secret: s, kind: "api" });
    const { fetch } = mockFetch([
      ok({
        merchant_id: "m1",
        project_id: "p1",
        api_key: pair("MINTED-1"),
        payment_key: pair("MINTED-2"),
        payout_key: pair("MINTED-3"),
      }),
    ]);
    const ob = new Oblodai({ ...creds, fetch });
    const minted = await ob.merchants.create({ email: "a@b.c", name: "A" });
    expect(minted.payout_key.secret).toBe("MINTED-3");
    const dumped = JSON.stringify(minted) + inspect(minted, { depth: 10 });
    for (const s of ["MINTED-1", "MINTED-2", "MINTED-3"]) expect(dumped).not.toContain(s);
  });

  it("keeps resolved credentials out of JSON and inspect", async () => {
    const { fetch } = mockFetch([]);
    const ob = new Oblodai({ ...creds, fetch });
    const t = ob.transport as unknown as { opts: { credentials?: { secret: string } } };
    expect(t.opts.credentials?.secret).toBe("SUPER-SECRET-1"); // signing still works
    expectNoSecrets(JSON.stringify(t.opts.credentials), "credentials JSON");
    expectNoSecrets(inspect(t.opts.credentials, { depth: 5 }), "credentials inspect");
    expect(Object.keys(t.opts.credentials!)).toEqual(["publicId"]);
  });
});
