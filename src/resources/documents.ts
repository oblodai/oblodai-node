import type { RequestBodies } from "../contract/requests.js";
import type { DocumentJob } from "../contract/models/index.js";
import type { Query } from "../core/request.js";
import { Resource, type FileResult, type RequestOptions } from "./base.js";

/** `lang` is a 2-letter code (41 supported); `format` where the document offers CSV. */
export interface DocumentQuery {
  lang?: string;
}
export interface FormatQuery extends DocumentQuery {
  format?: "pdf" | "csv";
}
export interface PeriodQuery extends FormatQuery {
  /** `YYYY-MM-DD` */
  from?: string;
  to?: string;
}

/**
 * Generated PDF/CSV documents. Every method returns the bytes (`FileResult`); large ranges go
 * through asynchronous jobs (`createJob` → `jobInfo` → `jobFile`). Payment key.
 */
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

  /** `GET /v1/documents/statement` — account statement for a period (PDF or CSV). */
  statement(query: PeriodQuery = {}, opts?: RequestOptions): Promise<FileResult> {
    return this.file("GET /v1/documents/statement", { ...opts, query: query as Query });
  }

  /** `GET /v1/documents/balance` — balance certificate (PDF). */
  balanceCertificate(query: DocumentQuery = {}, opts?: RequestOptions): Promise<FileResult> {
    return this.file("GET /v1/documents/balance", { ...opts, query: query as Query });
  }

  /** `GET /v1/documents/fees` — the fee schedule in force for the merchant (PDF). */
  feeSchedule(query: DocumentQuery = {}, opts?: RequestOptions): Promise<FileResult> {
    return this.file("GET /v1/documents/fees", { ...opts, query: query as Query });
  }

  /** `GET /v1/documents/ledger` — full ledger export for a period (PDF or CSV). */
  ledger(query: PeriodQuery = {}, opts?: RequestOptions): Promise<FileResult> {
    return this.file("GET /v1/documents/ledger", { ...opts, query: query as Query });
  }

  /** `GET /v1/documents/split` — how one payment was split between partners (PDF). */
  splitReport(
    paymentUuid: string,
    query: DocumentQuery = {},
    opts?: RequestOptions,
  ): Promise<FileResult> {
    return this.file("GET /v1/documents/split", {
      ...opts,
      query: { ...(query as Query), uuid: paymentUuid },
    });
  }

  /** `GET /v1/documents/batch` — per-row report of an asynchronous batch. */
  batchReport(
    batchId: string,
    query: FormatQuery = {},
    opts?: RequestOptions,
  ): Promise<FileResult> {
    return this.file("GET /v1/documents/batch", {
      ...opts,
      query: { ...(query as Query), uuid: batchId },
    });
  }

  /** `GET /v1/documents/link` — payment-link report (its invoices). */
  linkReport(linkId: string, query: FormatQuery = {}, opts?: RequestOptions): Promise<FileResult> {
    return this.file("GET /v1/documents/link", {
      ...opts,
      query: { ...(query as Query), uuid: linkId },
    });
  }

  /** `GET /v1/documents/wallet/statement` — static-wallet statement. */
  walletStatement(
    walletUuid: string,
    query: PeriodQuery = {},
    opts?: RequestOptions,
  ): Promise<FileResult> {
    return this.file("GET /v1/documents/wallet/statement", {
      ...opts,
      query: { ...(query as Query), uuid: walletUuid },
    });
  }

  /** `GET /v1/documents/referrals` — referral earnings report. */
  referralsReport(query: PeriodQuery = {}, opts?: RequestOptions): Promise<FileResult> {
    return this.file("GET /v1/documents/referrals", { ...opts, query: query as Query });
  }

  /**
   * `GET /v1/documents/{kind}/{id}` — a public document by its signed link (`exp` and `sig` come from a
   * `document_url`). No credentials needed; prefer fetching `document_url` directly.
   */
  download(
    kind: string,
    id: string,
    query: DocumentQuery & { exp: number; sig: string },
    opts?: RequestOptions,
  ): Promise<FileResult> {
    return this.file("GET /v1/documents/{kind}/{id}", {
      ...opts,
      pathParams: { kind, id },
      query: query as unknown as Query,
    });
  }
}
