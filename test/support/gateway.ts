import { ROUTES } from "../../src/generated/routes.js";
import type { RouteSpec } from "../../src/core/route.js";

/**
 * A stand-in gateway for the documentation tests: it answers every route of the contract with a
 * small valid-looking result, so README snippets and examples run end to end without a network.
 * Lists answer one item and no further pages; long-running jobs are already finished; documents are
 * a PDF.
 */
const SAMPLE: Record<string, unknown> = {
  uuid: "5d6f3a52-0000-4000-8000-000000000001",
  id: "d-1",
  order_id: "order-1001",
  status: "created",
  url: "https://pay.oblodai.com/5d6f3a52",
  address: "TQrY8bkbpXKPt2LZbU8jqfnpFbUSF15sbx",
  amount: "25",
  currency: "USDT",
  network: "tron",
  payer_amount: "25",
  payer_currency: "USDT",
  commission: "0.5",
  fee_bearer: "merchant",
  valid: true,
  batch_id: "b-1",
  job_id: "j-1",
  endpoint_id: "e-1",
  secret: "whsec_demo",
  link_id: "l-1",
  claim_token: "ct-1",
  event_type: "invoice.paid",
  succeeded: 1,
  balance: { merchant: [{ currency: "USDT", network: "tron", balance: "100" }] },
  currencies: [{ currency: "USDT", networks: ["tron"] }],
  items: [],
};

const OVERRIDES: Record<string, Record<string, unknown>> = {
  getBatchInfo: { status: "completed" },
  getDocumentJob: { status: "done" },
  getPaymentInfo: { status: "paid" },
};

export interface GatewayCall {
  route: RouteSpec;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

const routes = Object.values(ROUTES) as RouteSpec[];

function match(method: string, path: string): RouteSpec | undefined {
  return routes.find(
    (r) =>
      r.method === method && new RegExp(`^${r.path.replace(/\{[^}]+\}/g, "[^/]+")}$`).test(path),
  );
}

export function gateway(): {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  calls: GatewayCall[];
} {
  const calls: GatewayCall[] = [];
  const fetch = async (url: string, init: RequestInit): Promise<Response> => {
    const u = new URL(url);
    const method = init.method ?? "GET";
    const route = match(method, u.pathname);
    if (!route) return new Response("not found", { status: 404 });
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init.headers ?? {}) as Record<string, string>)) {
      headers[k.toLowerCase()] = v;
    }
    calls.push({
      route,
      url,
      headers,
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    });
    if (route.bare) {
      return new Response("%PDF-1.7 demo", {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="document.pdf"',
        },
      });
    }
    const one = { ...SAMPLE, ...OVERRIDES[route.operationId] };
    const result =
      route.listKind === "paged"
        ? { items: [one], paginate: { total: 1, per_page: 50, offset: 0, has_pages: false } }
        : one;
    return new Response(JSON.stringify({ state: 0, result }), {
      status: 200,
      headers: { "content-type": "application/json", "x-request-id": "req-demo" },
    });
  };
  return { fetch, calls };
}
