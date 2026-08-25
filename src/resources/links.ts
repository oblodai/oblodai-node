import type { RequestBodies } from "../contract/requests.js";
import type {
  BatchElement,
  ClaimPreview,
  ClaimResult,
  PaymentLink,
  PaymentLinkCreated,
  PaymentLinkToggled,
  PayoutLink,
  PublicPayment,
  PublicPaymentLink,
} from "../contract/models/index.js";
import type { PagePromise, PageParams } from "../core/pagination.js";
import { Resource, type FileResult, type RequestOptions, type Ref } from "./base.js";

export type CreatePayoutLinkParams = RequestBodies["POST /v1/payout/link"];
export type PayoutLinkBatchParams = RequestBodies["POST /v1/payout/link/batch"];
export type ClaimParams = RequestBodies["POST /v1/claim/{token}"];

/** Payout links (cheques): funds reserved now, claimed later by whoever holds the token. Payout key. */
export class PayoutLinks extends Resource {
  /** `POST /v1/payout/link` — reserve funds and mint a claim token (`claim_token`/`claim_url` are returned once). Idempotent by `reference`. */
  create(params: CreatePayoutLinkParams, opts?: RequestOptions): Promise<PayoutLink> {
    return this.call<PayoutLink>("POST /v1/payout/link", params, opts);
  }

  /** `POST /v1/payout/link/info`. */
  info(link: Ref<{ link_id: string }>, opts?: RequestOptions): Promise<PayoutLink> {
    return this.call<PayoutLink>(
      "POST /v1/payout/link/info",
      { link_id: idOf(link, "link_id") },
      opts,
    );
  }

  /** Alias of `info`. */
  get(link: Ref<{ link_id: string }>, opts?: RequestOptions): Promise<PayoutLink> {
    return this.info(link, opts);
  }

  /** `POST /v1/payout/link/list`. */
  list(params: PageParams = {}, opts?: RequestOptions): PagePromise<PayoutLink> {
    return this.page<PayoutLink>("POST /v1/payout/link/list", params, opts);
  }

  /** `POST /v1/payout/link/cancel` — release the reserved funds of an unclaimed link. */
  cancel(link: Ref<{ link_id: string }>, opts?: RequestOptions): Promise<PayoutLink> {
    return this.call<PayoutLink>(
      "POST /v1/payout/link/cancel",
      { link_id: idOf(link, "link_id") },
      opts,
    );
  }

  /** `POST /v1/payout/link/batch` — SYNCHRONOUS: many links in one signed call, per-element outcomes. `reference` is required on every item. */
  batch(
    params: PayoutLinkBatchParams,
    opts?: RequestOptions,
  ): Promise<{ items: BatchElement<PayoutLink>[] }> {
    return this.call<{ items: BatchElement<PayoutLink>[] }>(
      "POST /v1/payout/link/batch",
      params,
      opts,
    );
  }

  /** `POST /v1/payout/link/cheque` — printable PDF cheque for a claim token. */
  cheque(
    params: RequestBodies["POST /v1/payout/link/cheque"],
    opts?: RequestOptions,
  ): Promise<FileResult> {
    return this.file("POST /v1/payout/link/cheque", { ...opts, body: params });
  }

  // --- recipient side (public, unsigned) ---

  /** `GET /v1/claim/{token}` — what the recipient sees before claiming. No credentials needed. */
  claimPreview(token: string, opts?: RequestOptions): Promise<ClaimPreview> {
    return this.call<ClaimPreview>("GET /v1/claim/{token}", undefined, {
      ...opts,
      pathParams: { token },
    });
  }

  /** `POST /v1/claim/{token}` — claim to an address (and passcode when the link has one). No credentials needed. */
  claim(token: string, params: ClaimParams, opts?: RequestOptions): Promise<ClaimResult> {
    return this.call<ClaimResult>("POST /v1/claim/{token}", params, {
      ...opts,
      pathParams: { token },
    });
  }
}

export type CreatePaymentLinkParams = RequestBodies["POST /v1/payment/link"];
export type PaymentLinkCheckoutParams = RequestBodies["POST /v1/link/{id}/checkout"];

/** Reusable payment links (tip jars, price tags): each checkout spawns an invoice. Payment key. */
export class PaymentLinks extends Resource {
  /** `POST /v1/payment/link`. */
  create(params: CreatePaymentLinkParams, opts?: RequestOptions): Promise<PaymentLinkCreated> {
    return this.call<PaymentLinkCreated>("POST /v1/payment/link", params, opts);
  }

  /** `POST /v1/payment/link/info` — the link plus a page of the invoices it spawned (`payments`). */
  info(
    link: Ref<{ link_id: string }>,
    page: PageParams = {},
    opts?: RequestOptions,
  ): Promise<PaymentLink> {
    return this.call<PaymentLink>(
      "POST /v1/payment/link/info",
      { link_id: idOf(link, "link_id"), ...page },
      opts,
    );
  }

  /** Alias of `info`. */
  get(
    link: Ref<{ link_id: string }>,
    page: PageParams = {},
    opts?: RequestOptions,
  ): Promise<PaymentLink> {
    return this.info(link, page, opts);
  }

  /** `POST /v1/payment/link/list`. */
  list(params: PageParams = {}, opts?: RequestOptions): PagePromise<PaymentLink> {
    return this.page<PaymentLink>("POST /v1/payment/link/list", params, opts);
  }

  /** `POST /v1/payment/link/toggle` — enable or disable a link. */
  toggle(
    link: Ref<{ link_id: string }>,
    active: boolean,
    opts?: RequestOptions,
  ): Promise<PaymentLinkToggled> {
    return this.call<PaymentLinkToggled>(
      "POST /v1/payment/link/toggle",
      { link_id: idOf(link, "link_id"), active },
      opts,
    );
  }

  // --- payer side (public, unsigned) ---

  /** `GET /v1/link/{id}` — the link as the payer sees it. No credentials needed. */
  publicView(linkId: string, opts?: RequestOptions): Promise<PublicPaymentLink> {
    return this.call<PublicPaymentLink>("GET /v1/link/{id}", undefined, {
      ...opts,
      pathParams: { id: linkId },
    });
  }

  /** `POST /v1/link/{id}/checkout` — spawn an invoice from the link (rate-capped per IP). No credentials needed. */
  checkout(
    linkId: string,
    params: PaymentLinkCheckoutParams = {},
    opts?: RequestOptions,
  ): Promise<PublicPayment> {
    return this.call<PublicPayment>("POST /v1/link/{id}/checkout", params, {
      ...opts,
      pathParams: { id: linkId },
    });
  }
}

function idOf<K extends string>(ref: Ref<Record<K, string>>, key: K): string {
  return typeof ref === "string" ? ref : ref[key];
}
