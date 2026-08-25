import type { RequestBodies } from "../contract/requests.js";
import type { DocumentJob } from "../contract/models/index.js";
import type { Query } from "../core/request.js";
import { Resource, type FileResult, type RequestOptions } from "./base.js";

/** Common query for period documents. `lang` is a 2-letter code (41 supported). */
export interface DocumentQuery {
  lang?: string;
  format?: "pdf" | "csv" | string;
}
export interface PeriodQuery extends DocumentQuery {
  /** `YYYY-MM-DD` */
  from?: string;
  to?: string;
}

/** Generated PDF/CSV documents: instant downloads and asynchronous jobs for large ranges. */
export class Documents extends Resource {
  /** `POST /v1/documents/jobs` — queue a large report; poll `jobInfo`, then `jobFile`. */
  createJob(
    params: RequestBodies["POST /v1/documents/jobs"],
    opts?: RequestOptions,
  ): Promise<DocumentJob> {
    return this.call<DocumentJob>("POST /v1/documents/jobs", params, opts);
  }

  /** `POST /v1/documents/jobs/info`. */
  jobInfo(jobId: string, opts?: RequestOptions): Promise<DocumentJob> {
    return this.call<DocumentJob>("POST /v1/documents/jobs/info", { job_id: jobId }, opts);
  }

  /** `GET /v1/documents/jobs/file` — the finished job's bytes. */
  jobFile(jobId: string, opts?: RequestOptions): Promise<FileResult> {
    return this.file("GET /v1/documents/jobs/file", { ...opts, query: { job_id: jobId } });
  }

  /** `GET /v1/documents/statement` — account statement for a period. */
  statement(query: PeriodQuery = {}, opts?: RequestOptions): Promise<FileResult> {
    return this.file("GET /v1/documents/statement", { ...opts, query: query as Query });
  }

  /** `GET /v1/documents/balance` — balance certificate. */
  balance(query: DocumentQuery = {}, opts?: RequestOptions): Promise<FileResult> {
    return this.file("GET /v1/documents/balance", { ...opts, query: query as Query });
  }

  /** `GET /v1/documents/fees` — fee schedule in force for the merchant. */
  fees(query: DocumentQuery = {}, opts?: RequestOptions): Promise<FileResult> {
    return this.file("GET /v1/documents/fees", { ...opts, query: query as Query });
  }

  /** `GET /v1/documents/ledger` — full ledger export for a period. */
  ledger(query: PeriodQuery = {}, opts?: RequestOptions): Promise<FileResult> {
    return this.file("GET /v1/documents/ledger", { ...opts, query: query as Query });
  }

  /** `GET /v1/documents/split` — split-rule settlement report. */
  split(query: PeriodQuery = {}, opts?: RequestOptions): Promise<FileResult> {
    return this.file("GET /v1/documents/split", { ...opts, query: query as Query });
  }

  /** `GET /v1/documents/batch` — batch report. */
  batch(batchId: string, query: DocumentQuery = {}, opts?: RequestOptions): Promise<FileResult> {
    return this.file("GET /v1/documents/batch", {
      ...opts,
      query: { ...(query as Query), batch_id: batchId },
    });
  }

  /** `GET /v1/documents/link` — payment-link report. */
  link(linkId: string, query: DocumentQuery = {}, opts?: RequestOptions): Promise<FileResult> {
    return this.file("GET /v1/documents/link", {
      ...opts,
      query: { ...(query as Query), link_id: linkId },
    });
  }

  /** `GET /v1/documents/wallet/statement` — static-wallet statement. */
  walletStatement(
    uuid: string,
    query: PeriodQuery = {},
    opts?: RequestOptions,
  ): Promise<FileResult> {
    return this.file("GET /v1/documents/wallet/statement", {
      ...opts,
      query: { ...(query as Query), uuid },
    });
  }

  /** `GET /v1/documents/referrals` — referral earnings report. */
  referrals(query: PeriodQuery = {}, opts?: RequestOptions): Promise<FileResult> {
    return this.file("GET /v1/documents/referrals", { ...opts, query: query as Query });
  }

  /** `GET /v1/documents/{kind}/{id}` — a public document by kind and id (the `document_url` targets). */
  get(
    kind: string,
    id: string,
    query: DocumentQuery = {},
    opts?: RequestOptions,
  ): Promise<FileResult> {
    return this.file("GET /v1/documents/{kind}/{id}", {
      ...opts,
      pathParams: { kind, id },
      query: query as Query,
    });
  }
}
