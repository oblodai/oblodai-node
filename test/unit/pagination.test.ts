import { describe, expect, it } from "vitest";
import { Oblodai } from "../../src/index.js";
import { mockFetch, ok } from "../support/mock-fetch.js";

const page = (items: unknown[], offset: number, total: number, perPage: number) =>
  ok({
    items,
    paginate: { total, per_page: perPage, offset, has_pages: offset + items.length < total },
  });

describe("PagePromise", () => {
  it("await gives the first page; for-await walks every page lazily", async () => {
    const { fetch, calls } = mockFetch([
      page([1, 2], 0, 5, 2),
      page([1, 2], 0, 5, 2),
      page([3, 4], 2, 5, 2),
      page([5], 4, 5, 2),
    ]);
    const ob = new Oblodai({ publicId: "p", secret: "s", baseUrl: "https://api.test", fetch });
    const first = await ob.payments.history({ limit: 2 });
    expect(first.items).toEqual([1, 2]);
    expect(first.paginate.has_pages).toBe(true);
    expect(calls).toHaveLength(1);

    const seen: unknown[] = [];
    for await (const item of ob.payments.history({ limit: 2 })) seen.push(item);
    expect(seen).toEqual([1, 2, 3, 4, 5]);
    expect(calls).toHaveLength(4);
    expect(JSON.parse(calls[2]!.body!)).toEqual({ limit: 2, offset: 2 });
  });

  it("all() collects with a cap", async () => {
    const { fetch } = mockFetch([page([1, 2], 0, 3, 2), page([3], 2, 3, 2)]);
    const ob = new Oblodai({ publicId: "p", secret: "s", baseUrl: "https://api.test", fetch });
    expect(await ob.payouts.history({ limit: 2 }).all()).toEqual([1, 2, 3]);
  });
});
