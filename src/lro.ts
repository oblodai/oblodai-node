/**
 * Which operations are long-running, and how to follow them — a decision of this SDK, not of the
 * API. A create call listed in {@link LRO} returns its answer with a {@link JobHandle} attached:
 * `await answer.wait()` polls the operation named here until the status is terminal. The runtime
 * applies it by the route's `operationId`; the generator knows nothing of this table.
 */
import type { JobHandle, FileJobHandle } from "./core/poller.js";

/** `create operationId → poll operationId`. */
export const LRO: Readonly<Record<string, string>> = {
  createPaymentBatch: "getBatchInfo",
  createPayoutBatch: "getBatchInfo",
  createRefundBatch: "getBatchInfo",
  createTransferBatch: "getBatchInfo",
  createDocumentJob: "getDocumentJob",
};

/** How to follow one kind of job. */
export interface Poll {
  /** The job's id in the create answer; sent under the same name to the poll (and download). */
  idField: string;
  /** The `operationId` that returns the finished job's file, if the job makes one. */
  download?: string;
}

/** `poll operationId → how to follow it`. */
export const POLLS: Readonly<Record<string, Poll>> = {
  getBatchInfo: { idField: "batch_id" },
  getDocumentJob: { idField: "job_id", download: "downloadDocumentJobFile" },
};

/**
 * Statuses after which a job no longer changes: a batch ends `completed` or `stopped`
 * (`on_error=stop`), a document job `done`, `failed` or `expired`.
 */
export const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "stopped",
  "done",
  "failed",
  "expired",
]);

// The create answers of the operations above carry their waiter (names inside resolve in the
// generated models module). A unit test holds every LRO operation's result type to one of these.
declare module "./generated/models.js" {
  interface BatchSubmitResponse extends JobHandle<BatchInfoResponse> {}
  interface DocumentJobAccepted extends FileJobHandle<DocumentJobView> {}
}
