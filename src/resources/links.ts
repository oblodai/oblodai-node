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
import { protectSecrets } from "../core/secrets.js";
import { Resource, type FileResult, type RequestOptions, type Ref } from "./base.js";

/**
 * A payout link is a bearer instrument: whoever reads `claim_token` (and `passcode`) can take the
 * money. They are returned exactly once, so they must not be the thing a debug log copies.
 * `claim_url` is the claim page built around the token and therefore carries it verbatim — it is a
 * secret in exactly the same way, and is redacted with them.
 */
const PAYOUT_LINK_SECRET_FIELDS = ["claim_token", "claim_url", "passcode"] as const;

export type CreatePayoutLinkParams = RequestBodies["POST /v1/payout/link"];
export type PayoutLinkBatchParams = RequestBodies["POST /v1/payout/link/batch"];
export type ClaimParams = RequestBodies["POST /v1/claim/{token}"];

/** Payout links (cheques): funds reserved now, claimed later by whoever holds the token. Payout key. */
export class PayoutLinks extends Resource {
  /**
   * `POST /v1/payout/link` — reserve funds and mint a claim token (`claim_token`/`claim_url` are
   * returned once, and are kept out of logs — see the redaction note in MIGRATION-1.3).
   * Idempotent by `reference`.
   *
   * Codes worth branching on: `payout_link.disabled`, `payout.insufficient_funds` (retryable),
   * `payout.funds_maturing` (retryable), `payout.bad_amount`, `payout.bad_address`,
   * `payout.reference_collision` (that `reference` already minted a different link),
   * `merchant.wrong_key_kind`.
   */
  async create(params: CreatePayoutLinkParams, opts?: RequestOptions): Promise<PayoutLink> {
    const link = await this.call<PayoutLink>("POST /v1/payout/link", params, opts);
    return protectSecrets(link, PAYOUT_LINK_SECRET_FIELDS);
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

  /**
   * `POST /v1/payout/link/batch` — SYNCHRONOUS: at most 500 links in one signed call, with
   * per-element outcomes, so a 200 can still contain failures — check every `items[].ok`.
   * `reference` is required on every item.
   *
   * Call-level codes worth branching on: `payout.batch_too_large` (>500), `payout.empty_batch`,
   * `payout_link.disabled`, `payout.insufficient_funds` (retryable), `merchant.wrong_key_kind`.
   * Per-element failures arrive as `items[].error_code` with the vocabulary of `create`.
   */
  async batch(
    params: PayoutLinkBatchParams,
    opts?: RequestOptions,
  ): Promise<{ items: BatchElement<PayoutLink>[] }> {
    const batch = await this.call<{ items: BatchElement<PayoutLink>[] }>(
      "POST /v1/payout/link/batch",
      params,
      opts,
    );
    for (const item of batch.items ?? []) {
      if (item?.result) protectSecrets(item.result, PAYOUT_LINK_SECRET_FIELDS);
    }
    return batch;
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

  /**
   * `POST /v1/claim/{token}` — claim to an address (and passcode when the link has one). No
   * credentials needed.
   *
   * Codes worth branching on: `request.not_found` (unknown or spent token),
   * `payout.bad_address`, `payout.address_network_mismatch`, `payout.memo_required`,
   * `payout.bad_status` (already claimed, cancelled or expired), `request.rate_limited`
   * (too many passcode attempts — the link locks after 10).
   */
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
  /**
   * `POST /v1/payment/link` — a reusable link; each checkout spawns its own invoice.
   *
   * Codes worth branching on: `invoice.bad_price`, `payment.bad_amount`,
   * `request.unknown_currency`, `payment.unsupported_network`, `payment.below_minimum`,
   * `idempotency.key_reused`.
   */
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
