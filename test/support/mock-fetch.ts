import type { FetchLike } from "../../src/core/transport.js";

export interface Recorded {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

export interface Scripted {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** Throw this instead of answering (simulates a network failure). */
  throws?: Error;
  /** Delay before answering, ms. */
  delayMs?: number;
}

/** A fetch stub that replays scripted responses in order and records every request it saw. */
export function mockFetch(script: Scripted[]): { fetch: FetchLike; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const queue = [...script];
  const fetch: FetchLike = async (url, init) => {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init.headers ?? {}) as Record<string, string>))
      headers[k.toLowerCase()] = v;
    calls.push({
      url,
      method: init.method ?? "GET",
      headers,
      body: typeof init.body === "string" ? init.body : undefined,
    });
    const next = queue.shift();
    if (!next) throw new Error(`mockFetch: no scripted response for ${init.method} ${url}`);
    if (next.delayMs) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, next.delayMs);
        init.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(init.signal?.reason ?? new Error("aborted"));
        });
      });
    }
    if (next.throws) throw next.throws;
    const text =
      typeof next.body === "string"
        ? next.body
        : JSON.stringify(next.body ?? { state: 0, result: {} });
    return new Response(text, {
      status: next.status ?? 200,
      headers: { "content-type": "application/json", ...next.headers },
    });
  };
  return { fetch, calls };
}

export function ok(result: unknown): Scripted {
  return { status: 200, body: { state: 0, result } };
}

export function apiError(
  status: number,
  error: Record<string, unknown>,
  headers?: Record<string, string>,
): Scripted {
  return { status, body: { error }, headers };
}
