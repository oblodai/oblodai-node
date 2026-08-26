import { ContractError } from "./errors.js";

/**
 * Reading a response body safely. Two things can go wrong between "the peer answered" and "the SDK
 * has bytes": the answer is larger than any legitimate response (a mistargeted base URL pointing at
 * a file server, a proxy streaming an endless error page), or the answer came from somewhere the
 * request was never sent to. Both are caught here, before anything is buffered or parsed.
 */

/** Read the whole body but never buffer more than `maxBytes`; the cap is a ContractError, not an OOM. */
export async function readCapped(
  res: { headers: Headers; body?: unknown; arrayBuffer(): Promise<ArrayBuffer> },
  maxBytes: number,
  label: string,
): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge(label, declared, maxBytes);

  const stream = res.body as ReadableStream<Uint8Array> | null | undefined;
  if (!stream || typeof stream.getReader !== "function") {
    // An injected fetch that hands back a buffered body: it is already in memory, so the cap can
    // only be checked after the fact — still better than parsing an unbounded document.
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > maxBytes) throw tooLarge(label, bytes.length, maxBytes);
    return bytes;
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) throw tooLarge(label, total, maxBytes);
      chunks.push(value);
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

function tooLarge(label: string, seen: number, maxBytes: number): ContractError {
  return new ContractError(
    `${label}: response body exceeds ${maxBytes} bytes (saw at least ${seen}) — refusing to buffer it`,
    0,
    undefined,
    "sdk.response_too_large",
  );
}

/**
 * The SDK never follows a redirect: the signature is bound to the path it signed, and a 3xx to
 * another origin would replay the request (and its Idempotency-Key) somewhere else. Native fetch is
 * called with `redirect: "manual"`, but an injected client may ignore that — so the answer's own URL
 * is checked against the one asked for.
 */
export function assertNotRedirected(
  requestedUrl: string,
  res: { url?: string; redirected?: boolean },
): void {
  const landed = typeof res.url === "string" && res.url !== "" ? res.url : undefined;
  const moved = res.redirected === true || (landed !== undefined && !sameUrl(landed, requestedUrl));
  if (!moved) return;
  throw new ContractError(
    `unexpected redirect: the request to ${requestedUrl} was answered by ${landed ?? "another location"}; the SDK never follows redirects — check baseUrl`,
    0,
    undefined,
    "sdk.bad_envelope",
  );
}

function sameUrl(a: string, b: string): boolean {
  if (a === b) return true;
  try {
    return new URL(a).toString() === new URL(b).toString();
  } catch {
    return false;
  }
}
