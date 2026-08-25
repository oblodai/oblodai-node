import type {
  AmountMode,
  FeeBearer,
  Network,
  PaymentStatus,
  PayoutLinkStatus,
  PayoutStatus,
} from "../enums.js";
import { defineKeys } from "../keys.js";
import type { Money, Timestamp } from "./common.js";

/** Payout link (cheque) as `/v1/payout/link`, `/info`, `/list`, `/cancel` and batch elements render it. */
export interface PayoutLink {
  link_id: string;
  status: PayoutLinkStatus;
  amount: Money;
  currency: string;
  network: Network | (string & {});
  /** Null while the asset cannot be priced. */
  commission: Money | null;
  payer_amount: Money | null;
  fee_bearer: FeeBearer;
  fee_type: string;
  reference: string;
  title: string;
  note: string;
  passcode_protected: boolean;
  expires_at: Timestamp;
  created_at: Timestamp;
  /** Present on create and batch-create only — the secret the recipient claims with. */
  claim_token?: string;
  claim_url?: string;
  batch_id?: string;
  /** Set once claimed: the payout that paid the recipient. */
  payout_id?: string;
  claim_address?: string;
  email?: string;
  /** The generated passcode, shown once on create when `passcode: "auto"` was requested. */
  passcode?: string;
}
export const PayoutLinkKeys = defineKeys<
  Omit<
    PayoutLink,
    "claim_token" | "claim_url" | "batch_id" | "payout_id" | "claim_address" | "email" | "passcode"
  >
>()(
  "link_id",
  "status",
  "amount",
  "currency",
  "network",
  "commission",
  "payer_amount",
  "fee_bearer",
  "fee_type",
  "reference",
  "title",
  "note",
  "passcode_protected",
  "expires_at",
  "created_at",
);

/** `GET /v1/claim/{token}` — what the recipient sees before claiming. */
export interface ClaimPreview {
  status: PayoutLinkStatus;
  claimable: boolean;
  amount: Money;
  currency: string;
  network: Network | (string & {});
  commission: Money | null;
  payer_amount: Money | null;
  fee_bearer: FeeBearer;
  fee_type: string;
  title: string;
  note: string;
  expires_at: Timestamp;
}
export const ClaimPreviewKeys = defineKeys<ClaimPreview>()(
  "status",
  "claimable",
  "amount",
  "currency",
  "network",
  "commission",
  "payer_amount",
  "fee_bearer",
  "fee_type",
  "title",
  "note",
  "expires_at",
);

/** `POST /v1/claim/{token}` — the payout minted by a claim. */
export interface ClaimResult {
  /** The payout that pays the recipient (`payouts.info({ uuid: payout_id })`). */
  payout_id: string;
  status: PayoutStatus;
  address: string;
  amount: Money;
  currency: string;
  network: Network | (string & {});
  commission: Money | null;
  payer_amount: Money | null;
  fee_bearer: FeeBearer;
  fee_type: string;
}
export const ClaimResultKeys = defineKeys<ClaimResult>()(
  "payout_id",
  "status",
  "address",
  "amount",
  "currency",
  "network",
  "commission",
  "payer_amount",
  "fee_bearer",
  "fee_type",
);

/** Payment link as `/v1/payment/link/info` and `/list` render it. Amount fields depend on `amount_mode`. */
export interface PaymentLink {
  link_id: string;
  url: string;
  active: boolean;
  title: string;
  description: string;
  amount_mode: AmountMode;
  currency: string;
  /** `fixed` links. */
  amount_fixed?: Money;
  /** `range` links. */
  min_amount?: Money;
  max_amount?: Money;
  pinned_currency?: string;
  pinned_network?: Network | (string & {});
  expires_at?: Timestamp;
  document_url: string;
  created_at: Timestamp;
  /** `info` only: invoices spawned by this link. */
  payments?: PaymentLinkPayment[];
}
export interface PaymentLinkPayment {
  uuid: string;
  order_id?: string;
  amount: Money;
  currency: string;
  status: PaymentStatus;
  created_at: Timestamp;
}
/** Keys of a `fixed` link with a pinned network — the shape the golden body was recorded with. */
export const PaymentLinkKeys = defineKeys<
  Required<Omit<PaymentLink, "payments" | "min_amount" | "max_amount" | "pinned_currency">>
>()(
  "link_id",
  "url",
  "active",
  "title",
  "description",
  "amount_mode",
  "currency",
  "amount_fixed",
  "pinned_network",
  "expires_at",
  "document_url",
  "created_at",
);

/** `POST /v1/payment/link` acknowledgement. */
export interface PaymentLinkCreated {
  link_id: string;
  url: string;
  document_url: string;
}
export const PaymentLinkCreatedKeys = defineKeys<PaymentLinkCreated>()(
  "link_id",
  "url",
  "document_url",
);

export interface PaymentLinkToggled {
  link_id: string;
  active: boolean;
}

/** `GET /v1/link/{id}` — the payer-facing view. */
export interface PublicPaymentLink {
  link_id: string;
  title: string;
  description: string;
  amount_mode: AmountMode;
  currency: string;
  amount_fixed?: Money;
  min_amount?: Money;
  max_amount?: Money;
  pinned_currency?: string;
  pinned_network?: Network | (string & {});
}
export const PublicPaymentLinkKeys = defineKeys<
  Required<Omit<PublicPaymentLink, "min_amount" | "max_amount" | "pinned_currency">>
>()("link_id", "title", "description", "amount_mode", "currency", "amount_fixed", "pinned_network");
