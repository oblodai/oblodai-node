// GENERATED FILE — do not edit. Source: contract/contract.json (core fd2c36d11f7c).
// Regenerate with: npm run codegen

/** Request bodies by route, generated from the core's documented DTOs (field names, required flags, examples). */
export interface RequestBodies {
  "POST /v1/api-allowlist/add": {
    /** e.g. "203.0.113.0/24" */
    cidr: string;
  };
  "POST /v1/api-allowlist/enable": {
    enabled: boolean;
  };
  "POST /v1/api-allowlist/remove": {
    /** e.g. "203.0.113.0/24" */
    cidr: string;
  };
  "POST /v1/auto-withdraw/delete": {
    /** e.g. "USDT" */
    currency: string;
  };
  "POST /v1/auto-withdraw/set": {
    address: string;
    /** e.g. "USDT" */
    currency: string;
    /** e.g. "100" */
    min_amount?: string;
    /** e.g. "tron" */
    network: string;
  };
  "POST /v1/batch/info": {
    /** e.g. "9f4c1a2b-77de-4a55-9c1f-0e2b3d4a5f60" */
    batch_id: string;
    /** e.g. 100 */
    limit?: number;
    /** e.g. 0 */
    offset?: number;
  };
  "POST /v1/claim/{token}": {
    address?: string;
    memo?: string;
    passcode?: string;
  };
  "POST /v1/documents/jobs": {
    /** e.g. "csv" */
    format?: string;
    /** e.g. "2025-01-01" */
    from?: string;
    /** e.g. "statement" */
    kind?: string;
    /** e.g. "ru" */
    lang?: string;
    /** e.g. "2026-08-19" */
    to?: string;
  };
  "POST /v1/documents/jobs/info": {
    /** e.g. "6f1c…" */
    job_id?: string;
  };
  "POST /v1/exchange-rate/list": {
    /** e.g. "ETH" */
    currency_from?: string;
    currency_to?: string;
    limit?: number;
    offset?: number;
  };
  "POST /v1/link/{id}/checkout": {
    /** e.g. "10.00" */
    amount?: string;
    /** e.g. "USDT" */
    currency?: string;
    /** e.g. "tron" */
    network?: string;
    order_id?: string;
    /** e.g. "buyer@example.com" */
    payer_email?: string;
  };
  "POST /v1/pay/{id}/select": {
    /** e.g. "USDT" */
    currency: string;
    /** e.g. "tron" */
    network: string;
  };
  "POST /v1/payment": {
    accuracy_payment_percent?: number;
    additional_data?: string;
    /** e.g. "10" */
    amount: string;
    /** e.g. "USD" */
    currency: string;
    is_payment_multiple?: boolean;
    is_refresh?: boolean;
    /** e.g. 3600 */
    lifetime_seconds?: number;
    /** e.g. "tron" */
    network?: string;
    /** e.g. "order-1" */
    order_id?: string;
    payer_email?: string;
    subtract?: number;
    /** e.g. "dark" */
    theme?: string;
    /** e.g. "USDT" */
    to_currency?: string;
    url_callback?: string;
    url_return?: string;
    url_success?: string;
  };
  "POST /v1/payment/accepted/list": {
    /** e.g. 50 */
    limit?: number;
    /** e.g. 0 */
    offset?: number;
  };
  "POST /v1/payment/accepted/set": {
    accepted: Array<{
      currency: string;
      network: string;
    }>;
  };
  "POST /v1/payment/accuracy/set": {
    /** e.g. 2 */
    accuracy_percent?: number;
    /** e.g. true */
    enabled: boolean;
  };
  "POST /v1/payment/autorefund/set": {
    /** e.g. true */
    overpay: boolean;
    /** e.g. true */
    underpay: boolean;
  };
  "POST /v1/payment/batch": {
    /** e.g. "continue" */
    on_error?: string;
    payments: Array<{
      accuracy_payment_percent?: number;
      additional_data?: string;
      /** e.g. "10" */
      amount: string;
      /** e.g. "USD" */
      currency: string;
      is_payment_multiple?: boolean;
      is_refresh?: boolean;
      /** e.g. 3600 */
      lifetime_seconds?: number;
      /** e.g. "tron" */
      network?: string;
      /** e.g. "order-1" */
      order_id?: string;
      payer_email?: string;
      subtract?: number;
      /** e.g. "dark" */
      theme?: string;
      /** e.g. "USDT" */
      to_currency?: string;
      url_callback?: string;
      url_return?: string;
      url_success?: string;
    }>;
  };
  "POST /v1/payment/cancel": {
    /** e.g. "order-1" */
    order_id?: string;
    uuid?: string;
  };
  "POST /v1/payment/discount/list": {
    /** e.g. 50 */
    limit?: number;
    /** e.g. 0 */
    offset?: number;
  };
  "POST /v1/payment/discount/set": {
    /** e.g. "USDT" */
    currency?: string;
    /** e.g. 3 */
    discount_percent: number;
    /** e.g. "tron" */
    network?: string;
  };
  "POST /v1/payment/fee-config/set": {
    /** e.g. 100 */
    payer_pays_percent: number;
  };
  "POST /v1/payment/history": {
    /** e.g. 50 */
    limit?: number;
    /** e.g. 0 */
    offset?: number;
    status?: string;
  };
  "POST /v1/payment/info": {
    /** e.g. "order-1" */
    order_id?: string;
    uuid?: string;
  };
  "POST /v1/payment/link": {
    /** e.g. "25.00" */
    amount_fixed?: string;
    /** e.g. "open" */
    amount_mode: string;
    /** e.g. "USD" */
    currency: string;
    description?: string;
    expires_in_seconds?: number;
    /** e.g. "1000.00" */
    max_amount?: string;
    /** e.g. "1.00" */
    min_amount?: string;
    /** e.g. "USDT" */
    pinned_currency?: string;
    /** e.g. "tron" */
    pinned_network?: string;
    /** e.g. "Поддержать проект" */
    title?: string;
  };
  "POST /v1/payment/link/info": {
    document_url?: string;
    /** e.g. "5d3f2a71-9c84-4b0e-8d17-3e6a2c9f1b40" */
    link_id?: string;
    /** e.g. "https://pay.oblodai.com/link/5d3f2a71-9c84-4b0e-8d17-3e6a2c9f1b40" */
    url?: string;
  };
  "POST /v1/payment/link/list": {
    /** e.g. 50 */
    limit?: number;
    /** e.g. 0 */
    offset?: number;
  };
  "POST /v1/payment/link/toggle": {
    active: boolean;
    link_id: string;
  };
  "POST /v1/payment/qr": {
    /** e.g. "order-1" */
    order_id?: string;
    uuid?: string;
  };
  "POST /v1/payment/refund": {
    address?: string;
    /** e.g. "10" */
    amount?: string;
    /** e.g. "tron" */
    network?: string;
    /** e.g. "order-1" */
    order_id?: string;
    reference?: string;
    uuid?: string;
  };
  "POST /v1/payment/resend": {
    /** e.g. "order-1" */
    order_id?: string;
    uuid?: string;
  };
  "POST /v1/payment/resolve": {
    /** e.g. "accept" */
    action: string;
    address?: string;
    network?: string;
    /** e.g. "ord-1001" */
    order_id?: string;
    reference?: string;
    uuid?: string;
  };
  "POST /v1/payment/send-email": {
    /** e.g. "buyer@example.com" */
    email?: string;
    /** e.g. "order-1" */
    order_id?: string;
    uuid?: string;
  };
  "POST /v1/payment/services": Record<string, never>;
  "POST /v1/payment/testing-webhook": {
    /** e.g. "paid" */
    status?: string;
    /** e.g. "https://shop.example/hook" */
    url?: string;
  };
  "POST /v1/payout": {
    address: string;
    /** e.g. "25" */
    amount: string;
    /** e.g. "USDT" */
    currency: string;
    /** e.g. "USDT" */
    from_currency?: string;
    is_subtract?: boolean;
    memo?: string;
    /** e.g. "tron" */
    network?: string;
    /** e.g. "payout-1" */
    order_id: string;
    source?: string;
    url_callback?: string;
  };
  "POST /v1/payout/approve": {
    uuid: string;
  };
  "POST /v1/payout/batch": {
    /** e.g. "continue" */
    on_error?: string;
    payouts: Array<{
      address: string;
      /** e.g. "25" */
      amount: string;
      /** e.g. "USDT" */
      currency: string;
      /** e.g. "USDT" */
      from_currency?: string;
      is_subtract?: boolean;
      memo?: string;
      /** e.g. "tron" */
      network?: string;
      /** e.g. "payout-1" */
      order_id: string;
      source?: string;
      url_callback?: string;
    }>;
  };
  "POST /v1/payout/calculate": {
    /** e.g. "10" */
    amount: string;
    /** e.g. "USDT" */
    currency: string;
    is_subtract?: boolean;
    /** e.g. "tron" */
    network?: string;
  };
  "POST /v1/payout/cancel": {
    uuid: string;
  };
  "POST /v1/payout/fee-config/set": {
    /** e.g. true */
    fee_on_recipient: boolean;
  };
  "POST /v1/payout/history": {
    /** e.g. 50 */
    limit?: number;
    /** e.g. 0 */
    offset?: number;
    status?: string;
  };
  "POST /v1/payout/info": {
    /** e.g. "order-1" */
    order_id?: string;
    uuid?: string;
  };
  "POST /v1/payout/link": {
    /** e.g. "25" */
    amount: string;
    /** e.g. "USDT" */
    currency: string;
    /** e.g. "user@example.com" */
    email?: string;
    /** e.g. 604800 */
    expires_in_seconds?: number;
    /** e.g. "merchant" */
    fee_bearer?: string;
    /** e.g. "tron" */
    network: string;
    /** e.g. "Спасибо за участие" */
    note?: string;
    /** e.g. "auto" */
    passcode?: string;
    /** e.g. "bonus-42" */
    reference?: string;
    /** e.g. "Бонус" */
    title?: string;
  };
  "POST /v1/payout/link/batch": {
    items: Array<{
      /** e.g. "25" */
      amount: string;
      /** e.g. "USDT" */
      currency: string;
      /** e.g. "user@example.com" */
      email?: string;
      /** e.g. 604800 */
      expires_in_seconds?: number;
      /** e.g. "merchant" */
      fee_bearer?: string;
      /** e.g. "tron" */
      network: string;
      /** e.g. "Спасибо за участие" */
      note?: string;
      /** e.g. "auto" */
      passcode?: string;
      /** e.g. "bonus-42" */
      reference?: string;
      /** e.g. "Бонус" */
      title?: string;
    }>;
  };
  "POST /v1/payout/link/cancel": {
    link_id: string;
  };
  "POST /v1/payout/link/cheque": {
    /** e.g. "nUqx1yG3…" */
    claim_token?: string;
    /** e.g. "ru" */
    lang?: string;
  };
  "POST /v1/payout/link/info": {
    link_id: string;
  };
  "POST /v1/payout/link/list": {
    /** e.g. 50 */
    limit?: number;
    /** e.g. 0 */
    offset?: number;
  };
  "POST /v1/payout/mass": {
    payouts: Array<{
      address: string;
      /** e.g. "25" */
      amount: string;
      /** e.g. "USDT" */
      currency: string;
      /** e.g. "USDT" */
      from_currency?: string;
      is_subtract?: boolean;
      memo?: string;
      /** e.g. "tron" */
      network?: string;
      /** e.g. "payout-1" */
      order_id: string;
      source?: string;
      url_callback?: string;
    }>;
    source?: string;
  };
  "POST /v1/payout/refund-fee-config/set": {
    /** e.g. true */
    fee_on_customer: boolean;
  };
  "POST /v1/payout/services": Record<string, never>;
  "POST /v1/payout/validate": {
    address: string;
    /** e.g. "25" */
    amount: string;
    /** e.g. "USDT" */
    currency: string;
    /** e.g. "USDT" */
    from_currency?: string;
    is_subtract?: boolean;
    memo?: string;
    /** e.g. "tron" */
    network?: string;
    /** e.g. "payout-1" */
    order_id: string;
    source?: string;
    url_callback?: string;
  };
  "POST /v1/refund/batch": {
    /** e.g. "continue" */
    on_error?: string;
    refunds: Array<{
      address?: string;
      /** e.g. "10" */
      amount?: string;
      /** e.g. "tron" */
      network?: string;
      /** e.g. "order-1" */
      order_id?: string;
      reference?: string;
      uuid?: string;
    }>;
  };
  "POST /v1/sandbox/deposit": {
    /** e.g. "10" */
    amount?: string;
    /** e.g. 0 */
    confirmations?: number;
    invoice_id: string;
    txid?: string;
  };
  "POST /v1/sandbox/faucet": {
    /** e.g. "1000" */
    amount: string;
    /** e.g. "USDT" */
    asset: string;
    idempotency_key?: string;
  };
  "POST /v1/sandbox/webhooks/replay": {
    delivery_id: string;
  };
  "POST /v1/split/config/set": {
    /** e.g. 172800 */
    refund_hold_seconds: number;
  };
  "POST /v1/split/recipient/optin": {
    /** e.g. true */
    enabled: boolean;
  };
  "POST /v1/split/rule": {
    address?: string;
    /** e.g. "b4c1f0e2-5a77-4d31-9f08-2c6e7a1b3d94" */
    merchant_id?: string;
    /** e.g. "tron" */
    network?: string;
    note?: string;
    /** e.g. "10" */
    percent: string;
  };
  "POST /v1/split/rule/delete": {
    rule_id: string;
  };
  "POST /v1/split/rule/list": {
    /** e.g. 50 */
    limit?: number;
    /** e.g. 0 */
    offset?: number;
  };
  "POST /v1/test-webhook/payment": {
    /** e.g. "USDT" */
    currency?: string;
    /** e.g. "tron" */
    network?: string;
    order_id?: string;
    /** e.g. "paid" */
    status?: string;
    /** e.g. "https://shop.example/oblodai/callback" */
    url_callback: string;
    uuid?: string;
  };
  "POST /v1/test-webhook/payout": {
    /** e.g. "USDT" */
    currency?: string;
    /** e.g. "tron" */
    network?: string;
    order_id?: string;
    /** e.g. "paid" */
    status?: string;
    /** e.g. "https://shop.example/oblodai/callback" */
    url_callback: string;
    uuid?: string;
  };
  "POST /v1/test-webhook/wallet": {
    /** e.g. "USDT" */
    currency?: string;
    /** e.g. "tron" */
    network?: string;
    order_id?: string;
    /** e.g. "paid" */
    status?: string;
    /** e.g. "https://shop.example/oblodai/callback" */
    url_callback: string;
    uuid?: string;
  };
  "POST /v1/transfer/batch": {
    /** e.g. "continue" */
    on_error?: string;
    transfers?: Array<{
      /** e.g. "50" */
      amount?: string;
      /** e.g. "USDT" */
      currency?: string;
      order_id?: string;
      to_user_id: string;
    }>;
  };
  "POST /v1/transfer/to-personal": {
    /** e.g. "50" */
    amount: string;
    /** e.g. "USDT" */
    currency: string;
    /** e.g. "transfer-1" */
    order_id?: string;
  };
  "POST /v1/transfer/to-user": {
    /** e.g. "50" */
    amount?: string;
    /** e.g. "USDT" */
    currency?: string;
    order_id?: string;
    to_user_id: string;
  };
  "POST /v1/wallet": {
    /** e.g. "USDT" */
    currency: string;
    /** e.g. "tron" */
    network: string;
    /** e.g. "client-42" */
    order_id?: string;
  };
  "POST /v1/wallet/block": {
    /** e.g. "TXk9...c3Fd" */
    address: string;
    is_force_block?: boolean;
  };
  "POST /v1/wallet/blocked-address-refund": {
    address: string;
    memo?: string;
    uuid: string;
  };
  "POST /v1/wallet/qr": {
    address: string;
  };
  "POST /v1/webhooks": {
    /** e.g. "https://shop.example/oblodai/callback" */
    url: string;
  };
  "POST /v1/webhooks/deliveries": {
    /** e.g. 50 */
    limit?: number;
    /** e.g. 0 */
    offset?: number;
  };
}

export type RequestBodyOf<K extends keyof RequestBodies> = RequestBodies[K];
