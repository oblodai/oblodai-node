// Regression tests for the 2026-09 security review of the SDK (one block per finding).
import { describe, expect, it } from "vitest";
import { Oblodai } from "../../src/index.js";
import * as errors from "../../src/core/errors.js";
import { filenameFrom } from "../../src/core/file.js";
import { redactHeaders, redactUrl, type RequestInfo } from "../../src/core/hooks.js";
import { serializeBody } from "../../src/core/request.js";
import { MAX_BODY } from "../../src/generated/signing.js";
import { mockFetch, ok } from "../support/mock-fetch.js";

const creds = {
  publicId: "pk_test_1",
  secret: "secret-1",
  baseUrl: "https://api.test",
  retry: { baseDelayMs: 1, maxDelayMs: 2 },
};

describe("error classes are shared by every bundle (instanceof across entries)", () => {
  it("recognizes an instance of the same class from another copy of the module", async () => {
    // A second, independent evaluation of the module — what a second bundle is.
    const copy = "../../src/core/errors.ts?another-bundle";
    const other = (await import(/* @vite-ignore */ copy)) as typeof errors;
    expect(other.SignatureError).not.toBe(errors.SignatureError);
    const sig = new other.SignatureError("webhook.bad_signature", "x");
    expect(sig).toBeInstanceOf(errors.SignatureError);
    expect(sig).toBeInstanceOf(errors.OblodaiError);
    expect(sig).not.toBeInstanceOf(errors.ConfigError);
    expect(sig).not.toBeInstanceOf(errors.WebhookPayloadError);
    const payload = new errors.WebhookPayloadError("x");
    expect(payload).toBeInstanceOf(other.ContractError);
    expect(payload).toBeInstanceOf(other.WebhookPayloadError);
    expect(payload).not.toBeInstanceOf(other.SignatureError);
    expect({}).not.toBeInstanceOf(errors.OblodaiError);
    expect(new Error("x")).not.toBeInstanceOf(errors.OblodaiError);
  });
});

describe("secrets in URLs never reach hooks or error messages", () => {
  it("masks a claim token in the path in hook info", async () => {
    const { fetch } = mockFetch([ok({ status: "active" })]);
    const seen: RequestInfo[] = [];
    const ob = new Oblodai({ ...creds, fetch, hooks: { onRequest: (i) => seen.push(i) } });
    await ob.payoutLinks.getPayoutClaim("CLAIMTOKEN_secret123");
    expect(seen[0]!.url).toBe("https://api.test/v1/claim/[redacted]");
    expect(JSON.stringify(seen)).not.toContain("CLAIMTOKEN_secret123");
  });

  it("masks a signed link's sig/exp and keeps other query values", () => {
    const url = redactUrl(
      "https://api.test/v1/documents/payout/u-1?exp=1787761591&sig=abcdef&lang=en",
      "/v1/documents/{kind}/{id}",
    );
    expect(url).toBe(
      "https://api.test/v1/documents/payout/u-1?exp=[redacted]&sig=[redacted]&lang=en",
    );
    expect(redactUrl("https://api.test/p/v1/aml/TOK?x=1", "/v1/aml/{token}")).toBe(
      "https://api.test/p/v1/aml/[redacted]?x=1",
    );
  });

  it("keeps the token out of a response-too-large error", async () => {
    const huge = new Response("x".repeat(10), {
      status: 200,
      headers: { "content-length": String(64 * 1024 * 1024) },
    });
    const ob = new Oblodai({ ...creds, fetch: async () => huge, retry: { maxRetries: 0 } });
    const err = await ob.payoutLinks.getPayoutClaim("CLAIMTOKEN_secret123").catch((e) => e);
    expect(err.code).toBe("sdk.response_too_large");
    expect(String(err)).toContain("/v1/claim/[redacted]");
    expect(String(err)).not.toContain("CLAIMTOKEN_secret123");
  });

  it("keeps the token out of an unexpected-redirect error", async () => {
    const moved = new Response("{}", { status: 200 });
    Object.defineProperty(moved, "url", { value: "https://evil.test/v1/claim/x?sig=zz" });
    const ob = new Oblodai({ ...creds, fetch: async () => moved, retry: { maxRetries: 0 } });
    const err = await ob.payoutLinks.getPayoutClaim("CLAIMTOKEN_secret123").catch((e) => e);
    expect(String(err)).toMatch(/unexpected redirect/);
    expect(String(err)).not.toContain("CLAIMTOKEN_secret123");
    expect(String(err)).not.toContain("sig=zz");
  });

  it("redacts every credential header, whatever its case", () => {
    const out = redactHeaders({
      authorization: "Bearer A",
      "X-API-KEY": "K",
      "x-signature": "S",
      "X-Admin-Token": "T",
      "x-claim-passcode": "P",
      "X-Trace": "keep",
    });
    expect(JSON.stringify(out)).not.toMatch(/Bearer A|"K"|"S"|"T"|"P"/);
    expect(out["X-Trace"]).toBe("keep");
  });
});

describe("downloaded file names", () => {
  it("are reduced to a safe base name", () => {
    expect(filenameFrom('attachment; filename="../../etc/passwd"')).toBe("passwd");
    expect(filenameFrom("attachment; filename*=UTF-8''..%2F..%2F.bashrc")).toBe(".bashrc");
    expect(filenameFrom('attachment; filename="C:\\\\Windows\\\\x.pdf"')).toBe("x.pdf");
    expect(filenameFrom("attachment; filename*=UTF-8''a%0Ab%07.pdf")).toBe("ab.pdf");
    expect(filenameFrom('attachment; filename=".."')).toBeUndefined();
    expect(filenameFrom('attachment; filename="."')).toBeUndefined();
    expect(filenameFrom("attachment; filename*=UTF-8''%2F")).toBeUndefined();
    expect(filenameFrom('attachment; filename="report.pdf"')).toBe("report.pdf");
  });
});

describe("request body size", () => {
  it("is refused above the contract's MAX_BODY before anything is sent", async () => {
    expect(() => serializeBody({ memo: "x".repeat(MAX_BODY) }, "POST")).toThrow(
      expect.objectContaining({ code: "sdk.body_too_large" }),
    );
    const { fetch, calls } = mockFetch([]);
    const ob = new Oblodai({ ...creds, fetch });
    await expect(
      ob.payments.create({ amount: "1", currency: "USDT", order_id: "x".repeat(MAX_BODY) }),
    ).rejects.toMatchObject({ code: "sdk.body_too_large" });
    expect(calls).toHaveLength(0);
    expect(serializeBody({ memo: "x".repeat(MAX_BODY - 20) }, "POST").length).toBeLessThanOrEqual(
      MAX_BODY,
    );
  });
});

describe("pagination", () => {
  it("walks every page when the server clamps the page size below the requested limit", async () => {
    // The core answers an out-of-range limit with 25 per page instead of refusing it.
    const all = Array.from({ length: 60 }, (_, i) => ({ uuid: `p-${i}` }));
    const pages = [0, 25, 50].map((offset) =>
      ok({
        items: all.slice(offset, offset + 25),
        paginate: { total: 60, per_page: 25, offset, has_pages: offset + 25 < 60 },
      }),
    );
    const { fetch, calls } = mockFetch(pages);
    const got = await new Oblodai({ ...creds, fetch }).payments.listHistory({ limit: 200 }).all();
    expect(got).toHaveLength(60);
    expect(calls).toHaveLength(3);
  });

  it("stops on an empty page even without a total", async () => {
    const { fetch, calls } = mockFetch([
      ok({ items: [{ uuid: "a" }], paginate: { per_page: 1, offset: 0, has_pages: false } }),
      ok({ items: [], paginate: { per_page: 1, offset: 1, has_pages: false } }),
    ]);
    const got = await new Oblodai({ ...creds, fetch }).payments.listHistory({ limit: 1 }).all();
    expect(got).toHaveLength(1);
    expect(calls).toHaveLength(2);
  });
});
