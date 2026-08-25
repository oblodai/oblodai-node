// GENERATED FILE — do not edit. Source: contract/contract.json (core 2338d0ff701e).
// Regenerate with: npm run codegen
import type {
  AmountMode,
  BatchOnError,
  FeeBearer,
  Network,
  PaymentStatus,
  PayoutStatus,
} from "./enums.js";
import type { Money } from "./models/common.js";

/** Request bodies by route, generated from the core's documented DTOs (names, required flags, descriptions, examples). */
export interface RequestBodies {
  "POST /v1/api-allowlist/add": {
    /** IP or subnet in CIDR notation (203.0.113.7 or 203.0.113.0/24). Example: "203.0.113.0/24". */
    cidr: string;
  };
  "POST /v1/api-allowlist/enable": {
    /** true — accept API calls only from listed addresses; false — the list is kept but not enforced. Example: true. */
    enabled: boolean;
  };
  "POST /v1/api-allowlist/remove": {
    /** IP or subnet in CIDR notation (203.0.113.7 or 203.0.113.0/24). Example: "203.0.113.0/24". */
    cidr: string;
  };
  "POST /v1/auto-withdraw/delete": {
    /** Asset whose auto-withdrawal to switch off. Example: "USDT". */
    currency: string;
  };
  "POST /v1/auto-withdraw/set": {
    /** Destination address (the merchant's external wallet). Example: "TQrY8bkbpXKPt2LZbU8jqfnpFbUSF15sbx". */
    address: string;
    /** Asset to withdraw automatically. Example: "USDT". */
    currency: string;
    /** Threshold: the sweep runs once the available balance of the asset reaches this amount; empty uses the network minimum. Example: "100". */
    min_amount?: Money;
    /** Network of the destination address. Example: "tron". */
    network: Network | (string & {});
  };
  "POST /v1/batch/info": {
    /** Batch id from the submit response. Example: "9f4c1a2b-77de-4a55-9c1f-0e2b3d4a5f60". */
    batch_id: string;
    /** How many items to return in items (pagination). Example: 100. */
    limit?: number;
    /** Offset over items. Example: 0. */
    offset?: number;
  };
  "POST /v1/claim/{token}": {
    /** Recipient address in the payout network. */
    address?: string;
    /** Memo/tag — only for networks where it is required. */
    memo?: string;
    /** Claim code — if the sender set one on the link. After 10 incorrect attempts the link is locked. */
    passcode?: string;
  };
  "POST /v1/documents/jobs": {
    /** File format: pdf (default) or csv. CSV is generated without layout — cheaper for large statements and loads into Excel/1C. Example: "csv". */
    format?: string;
    /** Start of the period, YYYY-MM-DD (defaults to the first day of the current month). Example: "2025-01-01". */
    from?: string;
    /** Report type: statement (operations), fees (commissions) or ledger (balance movements). Example: "statement". */
    kind?: string;
    /** Document language (default en). Example: "ru". */
    lang?: string;
    /** End of the period, inclusive, YYYY-MM-DD (defaults to today). The period may span up to two years. Example: "2026-08-19". */
    to?: string;
  };
  "POST /v1/documents/jobs/info": {
    /** Job id from the creation response. Example: "6f1c…". */
    job_id?: string;
  };
  "POST /v1/exchange-rate/list": {
    /** Currency code. If set, only its rate is returned. If empty or the body is {}, rates for all currencies are returned. Example: "ETH". */
    currency_from?: string;
    /** Quote currency: USDT by default; any pricing asset, including fiats with a direct feed (EUR, RUB, …). */
    currency_to?: string;
    /** Page size, 1–100; default 25. */
    limit?: number;
    /** Offset from the start of the list; default 0. */
    offset?: number;
  };
  "POST /v1/link/{id}/checkout": {
    /** Amount entered by the buyer, in the link's price currency; required for open and range, ignored for fixed. Example: "10.00". */
    amount?: Money;
    /** Settlement currency — the coin the buyer pays with; needed only if the link did not pin pinned_currency. Example: "USDT". */
    currency?: string;
    /** Settlement network; needed only if the link did not pin pinned_network. Example: "tron". */
    network?: Network | (string & {});
    /** Shop order number from the embedded widget (data-oblodai-order-id); carried over to the invoice and to the webhook for matching with the order; not an idempotency key. */
    order_id?: string;
    /** Buyer email — the cheque is sent there automatically after payment. Example: "buyer@example.com". */
    payer_email?: string;
  };
  "POST /v1/pay/{id}/select": {
    /** Selected payment currency. Example: "USDT". */
    currency: string;
    /** Selected network. Example: "tron". */
    network: Network | (string & {});
  };
  "POST /v1/payment": {
    /** Under/overpayment tolerance, 0–5 %. Overrides the merchant setting. */
    accuracy_payment_percent?: number;
    /** Private merchant data, echoed back in webhooks (not visible to the buyer). */
    additional_data?: string;
    /** Amount to pay, in currency. Example: "10". */
    amount: Money;
    /** Price currency code: any of the 23 fiats (USD, EUR, RUB, …) or any coin (USDT, BTC, …). JPY and KRW have zero decimal places. Example: "USD". */
    currency: string;
    /** Allow paying up the remaining amount. */
    is_payment_multiple?: boolean;
    /** Revive an expired invoice by order_id instead of creating a new one. */
    is_refresh?: boolean;
    /** Invoice lifetime in seconds, 300–43200; default 3600. Values outside the range are clamped to the nearest bound. Example: 3600. */
    lifetime_seconds?: number;
    /** Settlement network (e.g. tron, ethereum). Optional — see the currency and network selection modes. Example: "tron". */
    network?: Network | (string & {});
    /** Merchant reference; idempotency key. Strongly recommended. Example: "order-1". */
    order_id?: string;
    /** Payer email. If set, a cheque is sent there automatically after payment; it is also the default recipient for POST /v1/payment/send-email. */
    payer_email?: string;
    /** Deprecated: % of the network markup charged to the payer (0–100); payer-facing markups are configured via discount. */
    subtract?: number;
    /** Payment page theme: dark | light. Example: "dark". */
    theme?: string;
    /** Settlement currency — the crypto used for payment. Defaults to currency (only if currency is a coin); with a fiat price set it explicitly or omit it together with network. Example: "USDT". */
    to_currency?: string;
    /** Per-invoice webhook. Requires a registered endpoint (POST /v1/webhooks): delivery is signed with its secret. */
    url_callback?: string;
    /** "Back to shop" link on the payment page. */
    url_return?: string;
    /** Redirect after successful payment. */
    url_success?: string;
  };
  "POST /v1/payment/accepted/list": {
    /** Page size, 1–100; out of range falls back to 25. Example: 25. */
    limit?: number;
    /** Offset from the start of the list (newest first). Example: 0. */
    offset?: number;
  };
  "POST /v1/payment/accepted/set": {
    /** The full list of currency+network pairs payers may use; an empty list accepts everything in the catalog. */
    accepted: Array<{
      /** Asset code. Example: "USDT". */
      currency: string;
      /** Asset network. Example: "tron". */
      network: Network | (string & {});
    }>;
  };
  "POST /v1/payment/accuracy/set": {
    /** Tolerance in percent, 1–5. Required when enabled: true; ignored when enabled: false (reset to 0). Capped at 5 %. Example: 2. */
    accuracy_percent?: number;
    /** Enable/disable the tolerance. Example: true. */
    enabled: boolean;
  };
  "POST /v1/payment/autorefund/set": {
    /** Refund the excess on overpayment (paid_over). Example: true. */
    overpay: boolean;
    /** Refund the funds on an expired underpayment (wrong_amount). Example: true. */
    underpay: boolean;
  };
  "POST /v1/payment/batch": {
    /** What to do when an item fails: continue (default) — process the rest; stop — halt processing after the first error. Example: "continue". */
    on_error?: BatchOnError | (string & {});
    /** Array of 1 to 5000 items — the same fields as POST /v1/payment; set order_id on every item: results are matched by it and it protects against duplicates. */
    payments: Array<{
      /** Under/overpayment tolerance, 0–5 %. Overrides the merchant setting. */
      accuracy_payment_percent?: number;
      /** Private merchant data, echoed back in webhooks (not visible to the buyer). */
      additional_data?: string;
      /** Amount to pay, in currency. Example: "10". */
      amount: Money;
      /** Price currency code: any of the 23 fiats (USD, EUR, RUB, …) or any coin (USDT, BTC, …). JPY and KRW have zero decimal places. Example: "USD". */
      currency: string;
      /** Allow paying up the remaining amount. */
      is_payment_multiple?: boolean;
      /** Revive an expired invoice by order_id instead of creating a new one. */
      is_refresh?: boolean;
      /** Invoice lifetime in seconds, 300–43200; default 3600. Values outside the range are clamped to the nearest bound. Example: 3600. */
      lifetime_seconds?: number;
      /** Settlement network (e.g. tron, ethereum). Optional — see the currency and network selection modes. Example: "tron". */
      network?: Network | (string & {});
      /** Merchant reference; idempotency key. Strongly recommended. Example: "order-1". */
      order_id?: string;
      /** Payer email. If set, a cheque is sent there automatically after payment; it is also the default recipient for POST /v1/payment/send-email. */
      payer_email?: string;
      /** Deprecated: % of the network markup charged to the payer (0–100); payer-facing markups are configured via discount. */
      subtract?: number;
      /** Payment page theme: dark | light. Example: "dark". */
      theme?: string;
      /** Settlement currency — the crypto used for payment. Defaults to currency (only if currency is a coin); with a fiat price set it explicitly or omit it together with network. Example: "USDT". */
      to_currency?: string;
      /** Per-invoice webhook. Requires a registered endpoint (POST /v1/webhooks): delivery is signed with its secret. */
      url_callback?: string;
      /** "Back to shop" link on the payment page. */
      url_return?: string;
      /** Redirect after successful payment. */
      url_success?: string;
    }>;
  };
  "POST /v1/payment/cancel": {
    /** Your order reference. Example: "order-1". */
    order_id?: string;
    /** Invoice id in Oblodai. Either uuid or order_id is required; uuid takes priority. */
    uuid?: string;
  };
  "POST /v1/payment/discount/list": {
    /** Page size, 1–100; out of range falls back to 25. Example: 25. */
    limit?: number;
    /** Offset from the start of the list (newest first). Example: 0. */
    offset?: number;
  };
  "POST /v1/payment/discount/set": {
    /** Currency. Empty = global default for all coins. Example: "USDT". */
    currency?: string;
    /** Percentage, from -99 to 99. Positive is a discount, negative is a markup. Example: 3. */
    discount_percent: number;
    /** Network. Empty = any network of this currency. Example: "tron". */
    network?: Network | (string & {});
  };
  "POST /v1/payment/fee-config/set": {
    /** Share of OUR commission paid by the buyer: 0 — the merchant pays (current behaviour), 100 — the buyer pays and the invoice is issued with a markup. Applies to invoices created AFTER the change. Example: 100. */
    payer_pays_percent: number;
  };
  "POST /v1/payment/history": {
    /** Ignored on this route (payout history only). Example: "payout". */
    kind?: string;
    /** Page size, 1–100; out of range falls back to 25. Example: 25. */
    limit?: number;
    /** Offset from the start of the list (newest first). Example: 0. */
    offset?: number;
    /** Filter by status (an exact value from the status vocabulary); empty returns all. Example: "paid". */
    status?: PaymentStatus | (string & {});
  };
  "POST /v1/payment/info": {
    /** Your order reference. Example: "order-1". */
    order_id?: string;
    /** Invoice id in Oblodai. Either uuid or order_id is required; uuid takes priority. */
    uuid?: string;
  };
  "POST /v1/payment/link": {
    /** Amount — for fixed mode; required in this mode. Example: "25.00". */
    amount_fixed?: Money;
    /** Amount mode: fixed | open | range. Example: "open". */
    amount_mode: AmountMode | (string & {});
    /** Price currency — fiat (USD, EUR, RUB, …) or a coin; see pricing_currencies from GET /v1/currencies. Example: "USD". */
    currency: string;
    /** Description on the payment page. */
    description?: string;
    /** Link lifetime in seconds from creation; 0 (default) — the link never expires. */
    expires_in_seconds?: number;
    /** Upper bound — for range; required in this mode. Example: "1000.00". */
    max_amount?: Money;
    /** Lower bound: an optional floor for open, a required minimum for range. Example: "1.00". */
    min_amount?: Money;
    /** Settlement currency (coin) pinned to the link; empty — the buyer chooses the coin. Example: "USDT". */
    pinned_currency?: string;
    /** Settlement network pinned to the link; empty — the buyer chooses the network. Example: "tron". */
    pinned_network?: Network | (string & {});
    /** Title on the payment page. Example: "Поддержать проект". */
    title?: string;
  };
  "POST /v1/payment/link/info": {
    /** Page size for the link's payments, 1–100; out of range falls back to 25. Example: 25. */
    limit?: number;
    /** Payment link identifier. Example: "5d3f2a71-9c84-4b0e-8d17-3e6a2c9f1b40". */
    link_id: string;
    /** Offset within the link's payments. Example: 0. */
    offset?: number;
  };
  "POST /v1/payment/link/list": {
    /** Page size, 1–100; out of range falls back to 25. Example: 25. */
    limit?: number;
    /** Offset from the start of the list (newest first). Example: 0. */
    offset?: number;
  };
  "POST /v1/payment/link/toggle": {
    /** true — the link accepts payments; false — disabled (the page shows the link as inactive). Example: false. */
    active: boolean;
    /** Payment link identifier. Example: "5d3f2a71-9c84-4b0e-8d17-3e6a2c9f1b40". */
    link_id: string;
  };
  "POST /v1/payment/qr": {
    /** Your order reference. Example: "order-1". */
    order_id?: string;
    /** Invoice id in Oblodai. Either uuid or order_id is required; uuid takes priority. */
    uuid?: string;
  };
  "POST /v1/payment/refund": {
    /** Refund destination address. Defaults to the payment's payer_address; required only for Bitcoin/UTXO. */
    address?: string;
    /** Partial amount. Defaults to the full amount received. Example: "10". */
    amount?: Money;
    /** Network. Example: "tron". */
    network?: Network | (string & {});
    /** Your order reference for the payment. Either uuid or order_id is required. Example: "order-1". */
    order_id?: string;
    /** Optional refund idempotency key: distinguishes two different refunds with the same (payment, address, amount); a repeat with the same value is deduplicated. This is not order_id. */
    reference?: string;
    /** Payment id. Either uuid or order_id is required. */
    uuid?: string;
  };
  "POST /v1/payment/resend": {
    /** Your order reference. Example: "order-1". */
    order_id?: string;
    /** Invoice id in Oblodai. Either uuid or order_id is required; uuid takes priority. */
    uuid?: string;
  };
  "POST /v1/payment/resolve": {
    /** accept — accept the partial payment, refund — return it to the payer. Example: "accept". */
    action: "accept" | "refund" | (string & {});
    /** refund only: refund address. Defaults to the payment's recorded payer_address; if it is empty (Bitcoin/UTXO) the address is required, otherwise refund.no_address. */
    address?: string;
    /** refund only: refund network, defaults to the payment network. */
    network?: Network | (string & {});
    /** Your payment identifier. Example: "ord-1001". */
    order_id?: string;
    /** refund only: your refund deduplication key. */
    reference?: string;
    /** Payment UUID. Either uuid or order_id is required. */
    uuid?: string;
  };
  "POST /v1/payment/send-email": {
    /** Where to send it. Defaults to the payer_email set on the payment. Example: "buyer@example.com". */
    email?: string;
    /** Your order reference. Example: "order-1". */
    order_id?: string;
    /** Payment id in Oblodai. Either uuid or order_id is required. */
    uuid?: string;
  };
  "POST /v1/payment/services": {
    /** Page size, 1–100; out of range falls back to 25. Example: 25. */
    limit?: number;
    /** Offset from the start of the list (newest first). Example: 0. */
    offset?: number;
  };
  "POST /v1/payment/testing-webhook": {
    /** Status in the body. Default paid. Example: "paid". */
    status?: PaymentStatus | (string & {});
    /** Where to send the test body. If not provided, delivery goes to the project's registered endpoint; without an endpoint it fails with webhook.no_endpoint. Signed with the project endpoint's secret, including when url is passed explicitly. Example: "https://shop.example/hook". */
    url?: string;
  };
  "POST /v1/payout": {
    /** Recipient address. */
    address: string;
    /** Payout amount, in currency. Example: "25". */
    amount: Money;
    /** Currency code (for example USDT). Example: "USDT". */
    currency: string;
    /** Fund the payout by converting the balance. USDT → currency only. Example: "USDT". */
    from_currency?: string;
    /** Who pays the network fee: true — amount+fee is debited from the balance and the recipient receives amount; false — the recipient receives amount-fee; not provided — the project fee-config. */
    is_subtract?: boolean;
    /** Destination tag/memo (TON Jetton). Maximum 120 characters. */
    memo?: string;
    /** Network (tron, ethereum, …). Required for coins with several networks. Example: "tron". */
    network?: Network | (string & {});
    /** Your payout number; idempotency key. Example: "payout-1". */
    order_id: string;
    /** Origin label: api (default) or manual. */
    source?: string;
    /** Custom webhook URL for this payout (passes the SSRF check). Requires a registered endpoint (POST /v1/webhooks): delivery is signed with its secret. */
    url_callback?: string;
  };
  "POST /v1/payout/approve": {
    /** Payout id. */
    uuid: string;
  };
  "POST /v1/payout/batch": {
    /** What to do when an item fails: continue (default) — process the rest; stop — halt processing after the first error. Example: "continue". */
    on_error?: BatchOnError | (string & {});
    /** Array of 1 to 5000 items — the same fields as POST /v1/payout; order_id is required on every item and serves as the idempotency key: a repeat returns the already created payout. */
    payouts: Array<{
      /** Recipient address. */
      address: string;
      /** Payout amount, in currency. Example: "25". */
      amount: Money;
      /** Currency code (for example USDT). Example: "USDT". */
      currency: string;
      /** Fund the payout by converting the balance. USDT → currency only. Example: "USDT". */
      from_currency?: string;
      /** Who pays the network fee: true — amount+fee is debited from the balance and the recipient receives amount; false — the recipient receives amount-fee; not provided — the project fee-config. */
      is_subtract?: boolean;
      /** Destination tag/memo (TON Jetton). Maximum 120 characters. */
      memo?: string;
      /** Network (tron, ethereum, …). Required for coins with several networks. Example: "tron". */
      network?: Network | (string & {});
      /** Your payout number; idempotency key. Example: "payout-1". */
      order_id: string;
      /** Origin label: api (default) or manual. */
      source?: string;
      /** Custom webhook URL for this payout (passes the SSRF check). Requires a registered endpoint (POST /v1/webhooks): delivery is signed with its secret. */
      url_callback?: string;
    }>;
  };
  "POST /v1/payout/calculate": {
    /** Payout amount as a decimal string. Example: "10". */
    amount: Money;
    /** Payout asset (USDT, BTC, …). Example: "USDT". */
    currency: string;
    /** true — the fee is debited from the balance on top of the amount (the recipient gets exactly amount); false — the fee is taken out of the payout. */
    is_subtract?: boolean;
    /** Payout network; required when the asset lives on several networks. Example: "tron". */
    network?: Network | (string & {});
  };
  "POST /v1/payout/cancel": {
    /** Id of the payout (or refund) to cancel. */
    uuid: string;
  };
  "POST /v1/payout/fee-config/set": {
    /** true — the recipient pays the network fee (receives less); false — the merchant bears the fee. Example: true. */
    fee_on_recipient: boolean;
  };
  "POST /v1/payout/history": {
    /** payout — ordinary payouts, refund — refunds; empty returns both. Example: "payout". */
    kind?: "payout" | "refund" | (string & {});
    /** Page size, 1–100; out of range falls back to 25. Example: 25. */
    limit?: number;
    /** Offset from the start of the list (newest first). Example: 0. */
    offset?: number;
    /** Filter by status (an exact value from the status vocabulary); empty returns all. Example: "paid". */
    status?: PayoutStatus | (string & {});
  };
  "POST /v1/payout/info": {
    /** Your order reference. Example: "order-1". */
    order_id?: string;
    /** Invoice id in Oblodai. Either uuid or order_id is required; uuid takes priority. */
    uuid?: string;
  };
  "POST /v1/payout/link": {
    /** Amount in currency, as a string; greater than zero. Example: "25". */
    amount: Money;
    /** Payout crypto asset (USDT, BTC, …); fiat is not possible. Example: "USDT". */
    currency: string;
    /** If set, the recipient receives an email with a "Claim funds" button; a delivery failure does not cancel link creation. Example: "user@example.com". */
    email?: string;
    /** Link lifetime in seconds, clamped to 3600–2592000 (one hour to 30 days); without the field or with 0 the link lives 1 hour, not the maximum — set it explicitly. Example: 604800. */
    expires_in_seconds?: number;
    /** Who pays the network fee: "recipient" (default — deducted from the amount, the recipient receives less) or "merchant" (the amount plus the fee is reserved, the recipient receives exactly amount). Example: "merchant". */
    fee_bearer?: FeeBearer | (string & {});
    /** Payout network for the recipient (tron, bitcoin, …). Example: "tron". */
    network: Network | (string & {});
    /** Message to the recipient (shown on the claim page and in the email). Example: "Спасибо за участие". */
    note?: string;
    /** Claim code — a second factor for the link: "auto" — we generate it and return it ONCE in the response, or your own (6–64 visible characters), empty — no code. Pass the code to the recipient over a channel SEPARATE from the link (it is not put into the email); after 10 incorrect attempts the link is locked. Example: "auto". */
    passcode?: string;
    /** Your deduplication key, unique per merchant; the Idempotency-Key header has no effect on this endpoint. Example: "bonus-42". */
    reference?: string;
    /** Title — shown to the recipient on the claim page. Example: "Бонус". */
    title?: string;
  };
  "POST /v1/payout/link/batch": {
    /** Up to 500 links per call; each one succeeds or fails independently, the response is aligned with the request indexes. */
    items: Array<{
      /** Amount in currency, as a string; greater than zero. Example: "25". */
      amount: Money;
      /** Payout crypto asset (USDT, BTC, …); fiat is not possible. Example: "USDT". */
      currency: string;
      /** If set, the recipient receives an email with a "Claim funds" button; a delivery failure does not cancel link creation. Example: "user@example.com". */
      email?: string;
      /** Link lifetime in seconds, clamped to 3600–2592000 (one hour to 30 days); without the field or with 0 the link lives 1 hour, not the maximum — set it explicitly. Example: 604800. */
      expires_in_seconds?: number;
      /** Who pays the network fee: "recipient" (default — deducted from the amount, the recipient receives less) or "merchant" (the amount plus the fee is reserved, the recipient receives exactly amount). Example: "merchant". */
      fee_bearer?: FeeBearer | (string & {});
      /** Payout network for the recipient (tron, bitcoin, …). Example: "tron". */
      network: Network | (string & {});
      /** Message to the recipient (shown on the claim page and in the email). Example: "Спасибо за участие". */
      note?: string;
      /** Claim code — a second factor for the link: "auto" — we generate it and return it ONCE in the response, or your own (6–64 visible characters), empty — no code. Pass the code to the recipient over a channel SEPARATE from the link (it is not put into the email); after 10 incorrect attempts the link is locked. Example: "auto". */
      passcode?: string;
      /** Your deduplication key, unique per merchant; the Idempotency-Key header has no effect on this endpoint. Example: "bonus-42". */
      reference?: string;
      /** Title — shown to the recipient on the claim page. Example: "Бонус". */
      title?: string;
    }>;
  };
  "POST /v1/payout/link/cancel": {
    /** Payout link id (link_id from the creation response). */
    link_id: string;
  };
  "POST /v1/payout/link/cheque": {
    /** Claim secret from the payout link creation response. Stored only as a hash and never reissued — the cheque can be printed only while you still hold the token. Example: "nUqx1yG3…". */
    claim_token?: string;
    /** Document language — one of the 41 supported codes (en by default); the full list is in the document.unknown_lang error. Example: "ru". */
    lang?: string;
  };
  "POST /v1/payout/link/info": {
    /** Payout link id (link_id from the creation response). */
    link_id: string;
  };
  "POST /v1/payout/link/list": {
    /** How many links to return per page. Example: 50. */
    limit?: number;
    /** Offset from the start of the list (paging). Example: 0. */
    offset?: number;
  };
  "POST /v1/payout/mass": {
    /** Array of up to 100 items; the fields of each are as in POST /v1/payout. */
    payouts: Array<{
      /** Recipient address. */
      address: string;
      /** Payout amount, in currency. Example: "25". */
      amount: Money;
      /** Currency code (for example USDT). Example: "USDT". */
      currency: string;
      /** Fund the payout by converting the balance. USDT → currency only. Example: "USDT". */
      from_currency?: string;
      /** Who pays the network fee: true — amount+fee is debited from the balance and the recipient receives amount; false — the recipient receives amount-fee; not provided — the project fee-config. */
      is_subtract?: boolean;
      /** Destination tag/memo (TON Jetton). Maximum 120 characters. */
      memo?: string;
      /** Network (tron, ethereum, …). Required for coins with several networks. Example: "tron". */
      network?: Network | (string & {});
      /** Your payout number; idempotency key. Example: "payout-1". */
      order_id: string;
      /** Origin label: api (default) or manual. */
      source?: string;
      /** Custom webhook URL for this payout (passes the SSRF check). Requires a registered endpoint (POST /v1/webhooks): delivery is signed with its secret. */
      url_callback?: string;
    }>;
    /** Origin label, applied to every item without its own source. */
    source?: string;
  };
  "POST /v1/payout/refund-fee-config/set": {
    /** true — the customer receives net (the customer pays the fee); false — the merchant pays the fee and the customer receives gross. Example: true. */
    fee_on_customer: boolean;
  };
  "POST /v1/payout/services": {
    /** Page size, 1–100; out of range falls back to 25. Example: 25. */
    limit?: number;
    /** Offset from the start of the list (newest first). Example: 0. */
    offset?: number;
  };
  "POST /v1/payout/validate": {
    /** Recipient address. */
    address: string;
    /** Payout amount, in currency. Example: "25". */
    amount: Money;
    /** Currency code (for example USDT). Example: "USDT". */
    currency: string;
    /** Fund the payout by converting the balance. USDT → currency only. Example: "USDT". */
    from_currency?: string;
    /** Who pays the network fee: true — amount+fee is debited from the balance and the recipient receives amount; false — the recipient receives amount-fee; not provided — the project fee-config. */
    is_subtract?: boolean;
    /** Destination tag/memo (TON Jetton). Maximum 120 characters. */
    memo?: string;
    /** Network (tron, ethereum, …). Required for coins with several networks. Example: "tron". */
    network?: Network | (string & {});
    /** Your payout number; idempotency key. Example: "payout-1". */
    order_id: string;
    /** Origin label: api (default) or manual. */
    source?: string;
    /** Custom webhook URL for this payout (passes the SSRF check). Requires a registered endpoint (POST /v1/webhooks): delivery is signed with its secret. */
    url_callback?: string;
  };
  "POST /v1/refund/batch": {
    /** What to do when an item fails: continue (default) — process the rest; stop — halt processing after the first error. Example: "continue". */
    on_error?: BatchOnError | (string & {});
    /** Array of 1 to 5000 items — the same fields as POST /v1/payment/refund; every item requires reference (idempotency key) and either uuid or order_id of the payment. */
    refunds: Array<{
      /** Refund destination address. Defaults to the payment's payer_address; required only for Bitcoin/UTXO. */
      address?: string;
      /** Partial amount. Defaults to the full amount received. Example: "10". */
      amount?: Money;
      /** Network. Example: "tron". */
      network?: Network | (string & {});
      /** Your order reference for the payment. Either uuid or order_id is required. Example: "order-1". */
      order_id?: string;
      /** Optional refund idempotency key: distinguishes two different refunds with the same (payment, address, amount); a repeat with the same value is deduplicated. This is not order_id. */
      reference?: string;
      /** Payment id. Either uuid or order_id is required. */
      uuid?: string;
    }>;
  };
  "POST /v1/sandbox/deposit": {
    /** Amount in the invoice currency; empty — pay exactly what is due, anything else is a way to produce an under/overpayment. Example: "10". */
    amount?: Money;
    /** How many confirmations the deposit arrived with; 0 — fully confirmed; fewer than required — a way to test the pending→confirmed transition (repeat the same txid with a higher number). Example: 0. */
    confirmations?: number;
    /** UUID of the test invoice being "paid". */
    invoice_id: string;
    /** Repeating the same txid tests your idempotency; empty — a new txid. */
    txid?: string;
  };
  "POST /v1/sandbox/faucet": {
    /** Amount of test money, as a string; capped at 1000000 per call. Example: "1000". */
    amount: Money;
    /** Top-up asset (USDT, BTC, …). Example: "USDT". */
    asset: string;
    /** Safe-retry key; empty — every call creates a new top-up. */
    idempotency_key?: string;
  };
  "POST /v1/sandbox/webhooks/replay": {
    /** Delivery id from GET /v1/sandbox/webhooks. */
    delivery_id: string;
  };
  "POST /v1/split/config/set": {
    /** How many seconds to defer split settlement; range 0–7776000 (up to 90 days). 0 — send the shares immediately: you take on the risk that a refund becomes impossible. Example: 172800. */
    refund_hold_seconds: number;
  };
  "POST /v1/split/recipient/optin": {
    /** Allow other merchants to route split shares to your balance. true — enable receiving, false — disable (new rules targeting you stop being created; existing ones keep executing). Example: true. */
    enabled: boolean;
  };
  "POST /v1/split/rule": {
    /** External crypto address of the partner; the share leaves as a real on-chain transaction — irreversible. Exactly one recipient option: either address+network or merchant_id. */
    address?: string;
    /** Id of the partner merchant inside Oblodai; the share moves through internal accounting and is clawed back on a refund. Example: "b4c1f0e2-5a77-4d31-9f08-2c6e7a1b3d94". */
    merchant_id?: string;
    /** Address network. Required together with address. Example: "tron". */
    network?: Network | (string & {});
    /** Comment for yourself (shown in the rule list). */
    note?: string;
    /** Share of every payment, as a string: "10" = 10 %, "2.5" = 2.5 %. Greater than 0 and at most 100, step 0.01 %; the sum of all rules cannot exceed 100 %. Example: "10". */
    percent: string;
  };
  "POST /v1/split/rule/delete": {
    /** Rule identifier from POST /v1/split/rule or the list. Example: "9f4c1a2b-77de-4a55-9c1f-0e2b3d4a5f60". */
    rule_id: string;
  };
  "POST /v1/split/rule/list": {
    /** Page size, 1–100; out of range falls back to 25. Example: 25. */
    limit?: number;
    /** Offset from the start of the list (newest first). Example: 0. */
    offset?: number;
  };
  "POST /v1/test-webhook/payment": {
    /** Currency in the body. Example: "USDT". */
    currency?: string;
    /** Network in the body. Example: "tron". */
    network?: Network | (string & {});
    /** Your order_id, which is put into the test event body. */
    order_id?: string;
    /** Status in the body — from the status dictionary of this event type. Default paid (confirmed for a payout). Example: "paid". */
    status?: PaymentStatus | (string & {});
    /** Where to send the test body. Example: "https://shop.example/oblodai/callback". */
    url_callback: string;
    /** UUID of the object (payment, wallet or payout) put into the test event body. */
    uuid?: string;
  };
  "POST /v1/test-webhook/payout": {
    /** Currency in the body. Example: "USDT". */
    currency?: string;
    /** Network in the body. Example: "tron". */
    network?: Network | (string & {});
    /** Your order_id, which is put into the test event body. */
    order_id?: string;
    /** Status in the body — from the status dictionary of this event type. Default paid (confirmed for a payout). Example: "paid". */
    status?: PayoutStatus | (string & {});
    /** Where to send the test body. Example: "https://shop.example/oblodai/callback". */
    url_callback: string;
    /** UUID of the object (payment, wallet or payout) put into the test event body. */
    uuid?: string;
  };
  "POST /v1/test-webhook/wallet": {
    /** Currency in the body. Example: "USDT". */
    currency?: string;
    /** Network in the body. Example: "tron". */
    network?: Network | (string & {});
    /** Your order_id, which is put into the test event body. */
    order_id?: string;
    /** Status in the body — from the status dictionary of this event type. Default paid (confirmed for a payout). Example: "paid". */
    status?: "paid" | (string & {});
    /** Where to send the test body. Example: "https://shop.example/oblodai/callback". */
    url_callback: string;
    /** UUID of the object (payment, wallet or payout) put into the test event body. */
    uuid?: string;
  };
  "POST /v1/transfer/batch": {
    /** What to do when an item fails: continue (default) — process the rest; stop — halt processing after the first error. Example: "continue". */
    on_error?: BatchOnError | (string & {});
    /** Array of 1 to 5000 items — the same fields as POST /v1/transfer/to-user; every item requires order_id (idempotency key) and to_user_id (user UUID). */
    transfers?: Array<{
      /** Transfer amount in currency. Example: "50". */
      amount?: Money;
      /** Currency code (cryptocurrency). Example: "USDT". */
      currency?: string;
      /** Idempotency key: a repeat with the same order_id is a no-op; required in a transfer batch. */
      order_id?: string;
      /** Platform user id of the recipient (UUID, not username); a username is resolved to an id via the cabinet public profile /public/users/{username}. */
      to_user_id: string;
    }>;
  };
  "POST /v1/transfer/to-personal": {
    /** Transfer amount in currency. Example: "50". */
    amount: Money;
    /** Currency code (cryptocurrency). Example: "USDT". */
    currency: string;
    /** Idempotency key: a repeat with the same order_id is a no-op. Always send it, otherwise retrying the request after a network timeout creates a second transfer. Example: "transfer-1". */
    order_id?: string;
  };
  "POST /v1/transfer/to-user": {
    /** Transfer amount in currency. Example: "50". */
    amount?: Money;
    /** Currency code (cryptocurrency). Example: "USDT". */
    currency?: string;
    /** Idempotency key: a repeat with the same order_id is a no-op; required in a transfer batch. */
    order_id?: string;
    /** Platform user id of the recipient (UUID, not username); a username is resolved to an id via the cabinet public profile /public/users/{username}. */
    to_user_id: string;
  };
  "POST /v1/vrcs": {
    /** true — enable auto-conversion of volatile deposits to USDT, false — disable; omit to read the current state. Example: true. */
    enabled?: boolean;
  };
  "POST /v1/wallet": {
    /** Symbol of the receiving currency (USDT, BTC, ETH, …). Example: "USDT". */
    currency: string;
    /** Receiving network (tron, ethereum, bitcoin, …). Example: "tron". */
    network: Network | (string & {});
    /** Your customer/order identifier. Pins a dedicated permanent address to the customer. Example: "client-42". */
    order_id?: string;
  };
  "POST /v1/wallet/block": {
    /** Static wallet address. Example: "TXk9...c3Fd". */
    address: string;
    /** true — block (the default when the field is omitted); false — unblock. */
    is_force_block?: boolean;
  };
  "POST /v1/wallet/blocked-address-refund": {
    /** Refund destination address. */
    address: string;
    /** Destination tag/memo (XRP destination tag, XLM memo id, TON comment). Required for a classic address on a tag/memo network if the tag is not embedded in the X-/M-address. */
    memo?: string;
    /** Static wallet id (from the /v1/wallet response). */
    uuid: string;
  };
  "POST /v1/wallet/qr": {
    /** Arbitrary address to render into a QR code (PNG as a data: URI). */
    address: string;
  };
  "POST /v1/webhooks": {
    /** HTTPS callback URL. SSRF check: private and local addresses are rejected. Example: "https://shop.example/oblodai/callback". */
    url: string;
  };
  "POST /v1/webhooks/deliveries": {
    /** Page size, 1–100; out of range falls back to 25. Example: 25. */
    limit?: number;
    /** Offset from the start of the list (newest first). Example: 0. */
    offset?: number;
  };
}

export type RequestBodyOf<K extends keyof RequestBodies> = RequestBodies[K];
