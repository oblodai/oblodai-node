import { TERMINAL_STATUSES } from "../lro.js";
import { ContractError, TransportError } from "./errors.js";
import type { FileResult } from "./file.js";
import { isRecord } from "./util.js";

/**
 * Waiters for long-running operations (batches, document jobs). The create call's answer comes
 * back as usual, with a waiter attached (non-enumerable, so it never shows up in JSON or a
 * spread): `await answer.wait()` polls until the job's status is terminal and returns the last
 * poll answer — a terminal status is returned, not thrown, so a `failed` job is inspected like a
 * finished one. Which operations are jobs is `src/lro.ts`.
 */
export interface WaitOptions {
  /** Give up after this many seconds (a `transport.deadline` error). Default 300. */
  timeout?: number | undefined;
  /** Seconds between polls. Default 2. */
  interval?: number | undefined;
  signal?: AbortSignal | undefined;
}

export interface JobHandle<P> {
  /** The job's id (`batch_id` / `job_id` of the answer). */
  readonly jobId: string;
  /** Poll until the status is terminal; resolves with that poll answer. */
  wait(options?: WaitOptions): Promise<P>;
}

export interface FileJobHandle<P> extends JobHandle<P> {
  /** The finished job's file. */
  download(): Promise<FileResult>;
}

export interface JobPlumbing<P> {
  poll: () => Promise<P>;
  download?: (() => Promise<FileResult>) | undefined;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/** The job's id out of the create call's result. */
export function jobIdOf(idField: string, result: unknown): string {
  const value = isRecord(result) ? result[idField] : undefined;
  if (typeof value !== "string" && typeof value !== "number") {
    throw new ContractError(`long-running call answered without ${idField}`, 200, result);
  }
  const id = String(value);
  if (!id) throw new ContractError(`long-running call answered without ${idField}`, 200, result);
  return id;
}

/** The `status` of a poll answer. */
export function statusOf(answer: unknown): string {
  const s = isRecord(answer) ? answer.status : undefined;
  return typeof s === "string" ? s : "";
}

/** Attach the waiter to the create answer and return it. */
export function attachJob<T extends object, P>(result: T, id: string, job: JobPlumbing<P>): T {
  const hidden = (key: string, value: unknown) =>
    Object.defineProperty(result, key, { value, enumerable: false, configurable: true });
  hidden("jobId", id);
  hidden("wait", async (options: WaitOptions = {}): Promise<P> => {
    const timeout = options.timeout ?? 300;
    const interval = options.interval ?? 2;
    const deadline = Date.now() + timeout * 1000;
    for (;;) {
      const answer = await job.poll();
      const status = statusOf(answer);
      if (TERMINAL_STATUSES.has(status)) return answer;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new TransportError(
          "transport.deadline",
          `job ${id} is still ${status || "unfinished"} after ${timeout} s`,
        );
      }
      try {
        await job.sleep(Math.min(interval * 1000, remaining), options.signal);
      } catch (abort) {
        throw new TransportError("transport.aborted", `waiting for job ${id} aborted`, abort);
      }
    }
  });
  if (job.download) hidden("download", job.download);
  return result;
}
