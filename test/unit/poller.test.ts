import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LRO, Oblodai, ROUTES, type BatchInfoResponse, type JobHandle } from "../../src/index.js";
import { mockFetch, ok } from "../support/mock-fetch.js";
import { HEADER_IDEMPOTENCY_KEY } from "../../src/generated/signing.js";

const creds = { publicId: "pk", secret: "s", baseUrl: "https://api.test" };

function client(script: Parameters<typeof mockFetch>[0]) {
  const { fetch, calls } = mockFetch(script);
  const ob = new Oblodai({ ...creds, fetch });
  const delays: number[] = [];
  ob.transport.sleep = async (ms) => {
    delays.push(ms);
  };
  return { ob, calls, delays };
}

describe("long-running operations wait (spec §3.8)", () => {
  it("a batch answer carries wait(): polls getBatchInfo until the status is terminal", async () => {
    const { ob, calls, delays } = client([
      ok({ batch_id: "b-1", count: 2, kind: "payout", status: "pending" }),
      ok({ batch_id: "b-1", status: "processing", items: [] }),
      ok({ batch_id: "b-1", status: "completed", items: [], succeeded: 2 }),
    ]);
    const batch = await ob.batches.createPayout({ payouts: [] });
    expect(batch.batch_id).toBe("b-1");
    expect(batch.jobId).toBe("b-1");
    expect(JSON.stringify(batch)).not.toContain("wait");
    const done: BatchInfoResponse = await batch.wait({ interval: 0.5 });
    expect(done.status).toBe("completed");
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual([
      "/v1/payout/batch",
      "/v1/batch/info",
      "/v1/batch/info",
    ]);
    expect(JSON.parse(calls[1]!.body!)).toEqual({ batch_id: "b-1" });
    // The poll is not the create: no idempotency key, its own request id.
    expect(calls[1]!.headers[HEADER_IDEMPOTENCY_KEY.toLowerCase()]).toBeUndefined();
    expect(calls[1]!.headers["x-request-id"]).not.toBe(calls[0]!.headers["x-request-id"]);
    expect(delays).toEqual([500]);
  });

  it("gives up after its timeout", async () => {
    const { ob } = client([
      ok({ batch_id: "b-1", status: "pending" }),
      ...Array.from({ length: 5 }, () => ok({ status: "processing" })),
    ]);
    const batch = await ob.batches.createPayment({ payments: [] } as never);
    ob.transport.sleep = () => new Promise((r) => setTimeout(r, 30));
    const err = await batch.wait({ timeout: 0.05, interval: 0.01 }).catch((e) => e);
    expect(err.code).toBe("transport.deadline");
    expect(err.message).toMatch(/b-1 is still processing/);
  });

  it("a document job waits, then downloads its file", async () => {
    const { ob, calls } = client([
      ok({ job_id: "j-1", status: "queued", kind: "statement" }),
      ok({ job_id: "j-1", status: "done" }),
      {
        status: 200,
        body: "%PDF",
        headers: {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="s.pdf"',
        },
      },
    ]);
    const job = await ob.documents.createJob({ kind: "statement" } as never);
    expect((await job.wait()).status).toBe("done");
    const file = await job.download();
    expect(file.filename).toBe("s.pdf");
    expect(new URL(calls[2]!.url).searchParams.get("job_id")).toBe("j-1");
  });

  it("an answer without the job id is a contract error", async () => {
    const { ob } = client([ok({ count: 1 })]);
    await expect(ob.batches.createRefund({ refunds: [] } as never)).rejects.toMatchObject({
      code: "sdk.bad_envelope",
    });
  });

  it("every long-running operation exists and its generated method answers with a waiting model", () => {
    const source = readFileSync(join(__dirname, "../../src/generated/resources.ts"), "utf8");
    const models = readFileSync(join(__dirname, "../../src/generated/models.ts"), "utf8");
    expect(Object.keys(LRO).length).toBeGreaterThan(0);
    for (const [create, poll] of Object.entries(LRO)) {
      expect(ROUTES).toHaveProperty(create);
      expect(ROUTES).toHaveProperty(poll);
      const call = source.indexOf(`this._request(ROUTES.${create},`);
      const head = source.lastIndexOf("): Promise<", call);
      const returned = /^\): Promise<(\w+)>/.exec(source.slice(head))?.[1];
      expect(models, create).toMatch(
        new RegExp(`export interface ${returned} extends (File)?JobHandle<\\w+> \\{`),
      );
    }
    // And the type says so: the waiter is part of the answer's type.
    const typed = (b: Awaited<ReturnType<Oblodai["batches"]["createPayout"]>>) =>
      b satisfies JobHandle<BatchInfoResponse>;
    expect(typeof typed).toBe("function");
  });
});
