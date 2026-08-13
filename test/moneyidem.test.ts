import { describe, it, expect, vi } from "vitest";
import { OblodaiClient } from "../src/client.js";
import { OblodaiApiError } from "../src/errors.js";

/**
 * Денежные создающие вызовы, резервирующие средства: `/v1/payout/link`, `/v1/payout/link/batch`,
 * `/v1/wallet/blocked-address-refund`. Проверяем два свойства:
 *  1) SDK шлёт `Idempotency-Key`, и на всех внутренних повторах ключ ОДИН И ТОТ ЖЕ — именно на
 *     этом держится серверная дедупликация (`/v1/payout/link*` обёрнуты idempotency-middleware);
 *  2) автоповтор при 5xx/таймауте/сети НЕ отключён: сервер реплеит первый ответ, так что глушить
 *     ретраи — деградация надёжности, а не защита.
 */

function mockFetch(responses: Array<{ status: number; body: unknown } | "network">) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let i = 0;
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses[Math.min(i, responses.length - 1)]!;
    i++;
    if (r === "network") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

function makeClient(fetchImpl: typeof fetch, retry: false | object = false) {
  return new OblodaiClient({
    publicId: "pub_1",
    secret: "sec_1",
    baseUrl: "https://api.test",
    fetch: fetchImpl,
    // Быстрый backoff, чтобы тесты на ретраях не спали по полсекунды.
    retry: (retry === false ? false : { initialDelayMs: 1, maxDelayMs: 2, ...retry }) as never,
  });
}

function idemHeader(init: RequestInit): string | undefined {
  return (init.headers as Record<string, string>)["Idempotency-Key"];
}

function sentBody(init: RequestInit): Record<string, unknown> {
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const okLink = { status: 200, body: { state: 0, result: { link_id: "l1", claim_token: "t" } } };
const okBatch = { status: 200, body: { state: 0, result: { batch_id: "b1", results: [] } } };
const okRefund = { status: 200, body: { state: 0, result: { uuid: "r1" } } };
const err500 = { status: 500, body: { error: { code: "internal", message: "boom" } } };
const err429 = { status: 429, body: { state: 1, message: "rate limit exceeded" } };
const err503Idem = {
  status: 503,
  body: { error: { code: "idempotency.unavailable", message: "store unavailable, retry" } },
};
const err409InProgress = {
  status: 409,
  body: { error: { code: "idempotency.in_progress", message: "still being processed" } },
};
const err400KeyReused = {
  status: 400,
  body: { error: { code: "idempotency.key_reused", message: "used with a different request" } },
};
const err409DupRef = {
  status: 409,
  body: { error: { code: "payoutlink.duplicate_reference", message: "reference already exists" } },
};

const linkParams = { currency: "USDT", network: "tron", amount: "10" };

describe("Idempotency-Key на денежных create-вызовах", () => {
  it("payoutLinks.create шлёт сгенерированный UUID-ключ", async () => {
    const { fn, calls } = mockFetch([okLink]);
    await makeClient(fn).payoutLinks.create(linkParams);

    expect(idemHeader(calls[0]!.init)).toMatch(UUID_RE);
  });

  it("payoutLinks.create уважает явный idempotency_key и НЕ кладёт его в тело", async () => {
    const { fn, calls } = mockFetch([okLink]);
    await makeClient(fn).payoutLinks.create({ ...linkParams, idempotency_key: "my-key-1" });

    expect(idemHeader(calls[0]!.init)).toBe("my-key-1");
    const body = sentBody(calls[0]!.init);
    expect("idempotency_key" in body).toBe(false);
    // Полезная нагрузка не пострадала.
    expect(body.amount).toBe("10");
  });

  it("payoutLinks.createBatch шлёт ключ на весь вызов и вычищает per-item ключи из тела", async () => {
    const { fn, calls } = mockFetch([okBatch]);
    await makeClient(fn).payoutLinks.createBatch(
      [
        { ...linkParams, idempotency_key: "per-item-ignored" },
        { ...linkParams, amount: "20" },
      ],
      { idempotency_key: "batch-key-1" },
    );

    expect(idemHeader(calls[0]!.init)).toBe("batch-key-1");
    const links = sentBody(calls[0]!.init).links as Array<Record<string, unknown>>;
    expect(links).toHaveLength(2);
    expect(links.every((l) => !("idempotency_key" in l))).toBe(true);
    expect(links[1]!.amount).toBe("20");
  });

  it("wallets.blockedAddressRefund шлёт ключ и не протаскивает его в тело", async () => {
    const { fn, calls } = mockFetch([okRefund]);
    await makeClient(fn).wallets.blockedAddressRefund({
      uuid: "w1",
      address: "T...",
      idempotency_key: "refund-key-1",
    });

    expect(idemHeader(calls[0]!.init)).toBe("refund-key-1");
    const body = sentBody(calls[0]!.init);
    expect("idempotency_key" in body).toBe(false);
    expect(body).toEqual({ uuid: "w1", address: "T..." });
  });
});

describe("денежные create-вызовы ретраятся — сервер дедуплицирует по ключу", () => {
  it("payoutLinks.create повторяется на 5xx, и повтор несёт ТОТ ЖЕ ключ", async () => {
    const { fn, calls } = mockFetch([err500, okLink]);
    const client = makeClient(fn, {});

    await client.payoutLinks.create(linkParams);

    expect(calls).toHaveLength(2);
    expect(idemHeader(calls[0]!.init)).toMatch(UUID_RE);
    expect(idemHeader(calls[1]!.init)).toBe(idemHeader(calls[0]!.init));
  });

  it("payoutLinks.create повторяется на сетевой ошибке под тем же ключом", async () => {
    const { fn, calls } = mockFetch(["network", okLink]);
    const client = makeClient(fn, {});

    await client.payoutLinks.create({ ...linkParams, idempotency_key: "net-key" });

    expect(calls).toHaveLength(2);
    expect(calls.every((c) => idemHeader(c.init) === "net-key")).toBe(true);
  });

  it("503 idempotency.unavailable ретраибелен (fail-closed стор) — ключ стабилен", async () => {
    const { fn, calls } = mockFetch([err503Idem, okLink]);
    const client = makeClient(fn, {});

    await client.payoutLinks.create(linkParams);

    expect(calls).toHaveLength(2);
    expect(idemHeader(calls[1]!.init)).toBe(idemHeader(calls[0]!.init));
  });

  it("терминальные коды идемпотентности НЕ ретраятся: 409 in_progress, 400 key_reused", async () => {
    for (const [resp, code] of [
      [err409InProgress, "idempotency.in_progress"],
      [err400KeyReused, "idempotency.key_reused"],
    ] as const) {
      const { fn, calls } = mockFetch([resp, okLink]);
      const err = await makeClient(fn, {})
        .payoutLinks.create(linkParams)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(OblodaiApiError);
      expect((err as OblodaiApiError).code).toBe(code);
      expect(calls).toHaveLength(1);
    }
  });

  it("дубль reference — терминальный 409 payoutlink.duplicate_reference, а не бесконечный ретрай 500", async () => {
    const { fn, calls } = mockFetch([err409DupRef, okLink]);
    const err = await makeClient(fn, {})
      .payoutLinks.create({ ...linkParams, reference: "ref-1" })
      .catch((e: unknown) => e);

    expect((err as OblodaiApiError).code).toBe("payoutlink.duplicate_reference");
    expect(calls).toHaveLength(1);
  });

  it("createBatch и blockedAddressRefund тоже ретраятся под неизменным ключом", async () => {
    const b = mockFetch([err500, okBatch]);
    await makeClient(b.fn, {}).payoutLinks.createBatch([linkParams], { idempotency_key: "bk" });
    expect(b.calls).toHaveLength(2);
    expect(b.calls.every((c) => idemHeader(c.init) === "bk")).toBe(true);

    // Дедуп по детерминированному reference `refund-wallet:<id>` на бэкенде — повтор безопасен.
    const w = mockFetch(["network", okRefund]);
    await makeClient(w.fn, {}).wallets.blockedAddressRefund({ uuid: "w1", address: "T..." });
    expect(w.calls).toHaveLength(2);
    expect(idemHeader(w.calls[1]!.init)).toBe(idemHeader(w.calls[0]!.init));
  });

  it("429 повторяется (шлюз отбил ДО обработчика) — и ключ на повторе тот же", async () => {
    const { fn, calls } = mockFetch([err429, okLink]);
    const client = makeClient(fn, {});

    await client.payoutLinks.create({ ...linkParams, idempotency_key: "stable-key" });

    expect(calls).toHaveLength(2);
    expect(idemHeader(calls[0]!.init)).toBe("stable-key");
    // Ключ НЕ перегенерирован между попытками.
    expect(idemHeader(calls[1]!.init)).toBe(idemHeader(calls[0]!.init));
  });

  it("автоключ тоже стабилен между внутренними повторами", async () => {
    const { fn, calls } = mockFetch([err429, err429, okLink]);
    const client = makeClient(fn, {});

    await client.payoutLinks.create(linkParams);

    expect(calls).toHaveLength(3);
    const first = idemHeader(calls[0]!.init);
    expect(first).toMatch(UUID_RE);
    expect(idemHeader(calls[1]!.init)).toBe(first);
    expect(idemHeader(calls[2]!.init)).toBe(first);
  });

  it("обычные (обёрнутые на бэкенде) вызовы ретраиться не перестали", async () => {
    const { fn, calls } = mockFetch([
      err500,
      { status: 200, body: { state: 0, result: { uuid: "p1" } } },
    ]);
    const client = makeClient(fn, {});

    await client.payouts.create({
      amount: "10",
      currency: "USDT",
      network: "tron",
      address: "T...",
      order_id: "o1",
    });

    expect(calls).toHaveLength(2);
    expect(idemHeader(calls[1]!.init)).toBe(idemHeader(calls[0]!.init));
  });
});
