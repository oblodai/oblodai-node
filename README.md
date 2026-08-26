<div align="center">

<a href="https://oblodai.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/oblodai/.github/main/brand/logo-white.svg">
    <img src="https://raw.githubusercontent.com/oblodai/.github/main/brand/logo-black.svg" alt="oblodai" height="52">
  </picture>
</a>

<h3>Official TypeScript / Node.js SDK for the <a href="https://oblodai.com">oblodai</a> payment gateway</h3>

Payments, payouts, payment links, splits, static wallets, webhooks — one API key.

<a href="https://www.npmjs.com/package/@oblodai-npm/sdk"><img src="https://img.shields.io/npm/v/%40oblodai-npm%2Fsdk?style=flat-square&color=CB3837&label=npm" alt="npm"></a>
<a href="https://github.com/oblodai/oblodai-node/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/oblodai/oblodai-node/ci.yml?branch=main&style=flat-square&label=CI" alt="CI"></a>
<img src="https://img.shields.io/badge/types-TypeScript-3178C6?style=flat-square" alt="TypeScript">
<a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-000000?style=flat-square" alt="License: MIT"></a>

[Documentation](https://docs.oblodai.com) · [Dashboard](https://my.oblodai.com) · [Читать по-русски →](README.ru.md)

</div>

---

The official TypeScript / Node.js SDK for the **Oblodai** payment gateway: accepting payments,
payouts, bulk operations (batches), payment links, payout links (crypto cheques), splits, static
wallets, transfers, webhooks. Request signing, response parsing, typed errors, idempotency and
retries — out of the box. Node.js ≥ 18.17, ESM and CommonJS in one package, TypeScript types
generated from the gateway's own contract snapshot, and zero runtime dependencies.

> **Base URL.** Defaults to `https://api.oblodai.com`. Override `baseUrl` and supply your own keys at
> initialisation if needed. The scheme must be `https://`; plain `http://` is accepted only for
> loopback (`http://127.0.0.1:8095`) or with the explicit `allowInsecureBaseUrl` option.

## Installation

```bash
npm install @oblodai-npm/sdk
```

Node.js ≥ 18.17 (the SDK uses the runtime's global `fetch`). The package ships an ESM build, a
CommonJS build and type declarations for both; nothing else is pulled in at runtime. Webhook
verification lives in the `@oblodai-npm/sdk/webhooks` subpath and needs neither a client nor an API
key. Writing code with an AI agent? Point it at [AGENTS.md](AGENTS.md).

## Where to get keys

Keys are issued in the dashboard at [my.oblodai.com](https://my.oblodai.com) → **API keys**. The
secret is shown once, at creation. A live pair is a public id `oblodai_<hex>` with a secret
`oblodai_live_<hex>`; a sandbox pair is `test_oblodai_<hex>` with `oblodai_test_<hex>`.

| Key kind               | Public id                                              | Signs                                                                                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Payment key            | `oblodai_<hex>` (legacy split key: `oblodai_pk_<hex>`) | Everything that takes money in: `payments.*`, `paymentLinks.*`, `wallets.create/qr/block`, `documents.*`, `account.*`, `catalog.*`, most of `settings.*`                                                                                                                         |
| Payout key             | `oblodai_<hex>` (legacy split key: `oblodai_wk_<hex>`) | Everything that moves money out: `payouts.*`, `refunds.*`, `payoutLinks.*`, `transfers.*`, `splits.*`, `wallets.refundBlockedDeposit`, `settings.*AutoWithdraw`, `settings.*ApiAllowlist`, `webhooks.rotateSecret`, `webhooks.test("payout")`, `sandbox.faucet`, `sandbox.reset` |
| Sandbox key            | `test_oblodai_<hex>`                                   | Both kinds at once, against a chainless copy of the gateway                                                                                                                                                                                                                      |
| Onboarding admin token | set on a self-hosted gateway                           | `merchants.create`, `merchants.createSandbox` only — unsigned, sent as `X-Admin-Token` and on no other route                                                                                                                                                                     |

The current live key is **unified**: one `oblodai_<hex>` pair signs both sides. Projects issued before
the merge still hold two separate pairs, and there a payment key alone cannot pay anybody — configure
both and the SDK picks the right one per call:

```ts
import { Oblodai } from "@oblodai-npm/sdk";

const oblodai = new Oblodai({
  publicId: process.env.OBLODAI_PUBLIC_ID,
  secret: process.env.OBLODAI_SECRET,
  payoutPublicId: process.env.OBLODAI_PAYOUT_PUBLIC_ID,
  payoutSecret: process.env.OBLODAI_PAYOUT_SECRET,
});
```

On a split key pair, a call signed with the wrong kind is a 403 `merchant.wrong_key_kind`. On a route
that accepts either kind (`batches.info` for a payout batch, say) pass `{ preferPayoutKey: true }`.

## Quick start

Take a payment. Amounts are decimal **strings**, never floats.

```ts
import { Oblodai } from "@oblodai-npm/sdk";

const oblodai = new Oblodai(); // OBLODAI_PUBLIC_ID / OBLODAI_SECRET from the environment

const invoice = await oblodai.payments.create({
  amount: "25", // what you charge
  currency: "USDT", // a fiat (USD, EUR, …) or a crypto asset
  network: "tron", // omit to let the payer choose the network on the pay page
  order_id: "order-1001", // your reference; idempotent per order_id
  url_callback: "https://shop.example/oblodai/webhook",
});
console.log(invoice.url, invoice.address, invoice.status); // "created"
```

To price in fiat and settle in crypto, pass both: `{ amount: "25", currency: "USD", to_currency:
"USDT" }` — `currency` is what you charge, `to_currency` the asset the payer sends.

Send a payout. Validate first (free, no side effects), then create with your own idempotency key.

```ts
import { Oblodai } from "@oblodai-npm/sdk";

const oblodai = new Oblodai({
  publicId: process.env.OBLODAI_PAYOUT_PUBLIC_ID,
  secret: process.env.OBLODAI_PAYOUT_SECRET,
});

const params = {
  amount: "10",
  currency: "USDT",
  network: "tron",
  address: "TQrY8bkbpXKPt2LZbU8jqfnpFbUSF15sbx",
  order_id: "payout-42",
};
const check = await oblodai.payouts.validate(params);
console.log("will debit", check.payer_amount, "commission", check.commission);

const payout = await oblodai.payouts.create(params, { idempotencyKey: "payout-42" });
console.log(payout.uuid, payout.status); // "pending"
```

More end-to-end programs live in [`examples/`](examples) — run one with `npx tsx examples/sandbox.ts`.

## Sandbox / testing

A sandbox key drives a chainless copy of the gateway: fake balance from a faucet, simulated deposits,
real signed webhooks. Integrate against it first — the API surface is identical, so nothing changes
when you swap in live keys.

```ts
import { Oblodai } from "@oblodai-npm/sdk";

const oblodai = new Oblodai(); // a test_oblodai_… key pair in the environment

await oblodai.sandbox.faucet({ asset: "USDT", amount: "1000" });
const invoice = await oblodai.payments.create({
  amount: "25",
  currency: "USDT",
  network: "tron",
  order_id: `sbx-${Date.now()}`,
});
await oblodai.sandbox.deposit({
  invoice_id: invoice.uuid,
  amount: "25",
  confirmations: 20,
  txid: `sbx-tx-${Date.now()}`,
});
console.log((await oblodai.payments.info({ uuid: invoice.uuid })).status); // "paid"

for await (const delivery of oblodai.sandbox.webhooks({ limit: 20 })) {
  console.log(delivery.event_type, delivery.status, delivery.payload?.status);
}
await oblodai.sandbox.reset(); // cancel open invoices, zero the balances
```

- `sandbox.deposit` credits an invoice; repeat the same `txid` to add confirmations.
- `sandbox.webhooks` is the delivery log with payloads; `sandbox.replay(deliveryId)` re-sends a
  terminal (delivered or dead) delivery.
- `webhooks.test("payment" | "payout" | "wallet")` rehearses a delivery against your live endpoint.
  Rehearsals are signed exactly like real deliveries and carry `test: true` — check `isTest` and
  never let one move money in your system.
- `sandbox.faucet` and `sandbox.reset` need the payout key.

## Method overview

Sixteen namespaces, 107 merchant routes — every route the gateway exposes has a method here.

| Namespace      | Methods                                                                                                                                                                                                                     | Routes                                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `payments`     | create · info/get · cancel · history/list · batch · qr · services · sendEmail · resend · publicView · select · publicQr                                                                                                     | 12 — `/v1/payment*`, `/v1/pay/{id}*`                                                                                  |
| `refunds`      | create · resolve · batch                                                                                                                                                                                                    | 3 — `/v1/payment/refund`, `/v1/payment/resolve`, `/v1/refund/batch`                                                   |
| `payouts`      | create · validate · calculate · info/get · cancel · approve · history/list · mass · batch · services · getFeeConfig/setFeeConfig · getRefundFeeConfig/setRefundFeeConfig                                                    | 14 — `/v1/payout*`                                                                                                    |
| `payoutLinks`  | create · info/get · list · cancel · batch · cheque · claimPreview · claim                                                                                                                                                   | 8 — `/v1/payout/link*`, `/v1/claim/{token}`                                                                           |
| `paymentLinks` | create · info/get · list · toggle · publicView · checkout                                                                                                                                                                   | 6 — `/v1/payment/link*`, `/v1/link/{id}*`                                                                             |
| `batches`      | info                                                                                                                                                                                                                        | 1 — `/v1/batch/info`                                                                                                  |
| `transfers`    | toPersonal · toUser · batch                                                                                                                                                                                                 | 3 — `/v1/transfer/*`                                                                                                  |
| `wallets`      | create · qr · block · refundBlockedDeposit                                                                                                                                                                                  | 4 — `/v1/wallet*`                                                                                                     |
| `webhooks`     | register · rotateSecret · deliveries · test · testLegacy                                                                                                                                                                    | 7 — `/v1/webhooks*`, `/v1/test-webhook/*`, `/v1/payment/testing-webhook`                                              |
| `documents`    | statement · ledger · balanceCertificate · feeSchedule · splitReport · batchReport · linkReport · walletStatement · referralsReport · createJob · jobInfo · jobFile · download                                               | 13 — `/v1/documents/*`                                                                                                |
| `splits`       | createRule · listRules · deleteRule · getConfig/setConfig · getOptIn/setOptIn                                                                                                                                               | 7 — `/v1/split/*`                                                                                                     |
| `settings`     | setDiscount · listDiscounts · getAccuracy/setAccuracy · getAutoRefund/setAutoRefund · listAccepted/setAccepted · getPaymentFeeConfig/setPaymentFeeConfig · list/set/deleteAutoWithdraw · list/add/remove/enableApiAllowlist | 17 — `/v1/payment/{discount,accuracy,autorefund,accepted,fee-config}/*`, `/v1/auto-withdraw/*`, `/v1/api-allowlist/*` |
| `account`      | balance · referral · vrcs                                                                                                                                                                                                   | 3 — `/v1/balance`, `/v1/referral/info`, `/v1/vrcs`                                                                    |
| `catalog`      | currencies · exchangeRates                                                                                                                                                                                                  | 2 — `/v1/currencies`, `/v1/exchange-rate/list`                                                                        |
| `sandbox`      | faucet · deposit · webhooks · replay · reset                                                                                                                                                                                | 5 — `/v1/sandbox/*`                                                                                                   |
| `merchants`    | create · createSandbox                                                                                                                                                                                                      | 2 — `/v1/merchants`, `/v1/merchants/{id}/sandbox`                                                                     |

Conventions that hold across all of them:

- Fetch one: `.info(uuid | { order_id })`, aliased `.get`. Fetch many: `.history(params)` on payments
  and payouts (aliased `.list`), `.list(params)` elsewhere.
- Every method takes the same optional last argument —
  `{ idempotencyKey, signal, timeoutMs, deadlineMs, preferPayoutKey }`.
- Synchronous bulk calls are capped per call — `payouts.mass` at 100 elements, `payoutLinks.batch` at
  500 — and report each element separately (`{ idx, ok, result, message, error_code }`), so a 200 can
  still contain failures. Asynchronous batches (`payments.batch`, `payouts.batch`, `refunds.batch`,
  `transfers.batch`) take up to 5000 elements and are polled with `batches.info`.
- Document methods return a `FileResult` — `{ bytes, contentType, filename }`.
- Payer-facing methods (`payments.publicView/select/publicQr`, `paymentLinks.publicView/checkout`,
  `payoutLinks.claimPreview/claim`) need no credentials at all.
- Provisioning (`merchants.create`, `merchants.createSandbox`) is unsigned and gated by the gateway's
  admin token.

### Lists

List methods return a `PagePromise` — a real Promise that is also async-iterable. Nothing is
requested until you consume it.

```ts
import { Oblodai } from "@oblodai-npm/sdk";

const oblodai = new Oblodai();

// one page: { items, paginate: { total, per_page, offset, has_pages } }
const page = await oblodai.payments.history({ limit: 50 });
console.log(page.items.length, page.paginate.total);

// every item, page by page
for await (const payout of oblodai.payouts.history({ status: "confirmed" }))
  console.log(payout.uuid);

// up to N items as an array
const refunds = await oblodai.payouts.history({ kind: "refund" }).all(1000);
```

### Statuses

- Payment: `select → created → confirm_check → paid | paid_over | wrong_amount | expired | cancelled`.
  `isPaymentPaid(status)` is true for `paid`/`paid_over`; `wrong_amount` (underpaid) waits for
  `refunds.resolve({ uuid, action: "accept" | "refund" })`; `isPaymentFinal` covers the rest.
- Payout: `pending → approved → awaiting_cosign → broadcasting → sent → confirmed | failed | cancelled`,
  with `isPayoutFinal` and `isPayoutSucceeded`.

Prefer webhooks for state changes; poll `info` only as a fallback.

### Amounts

`addAmounts`, `subtractAmounts`, `compareAmounts`, `amountEquals`, `isZeroAmount`, `isValidAmount` —
exact decimal arithmetic on the string amounts the API uses. Never `parseFloat` a `Money`, and never
order one with `<`, `sort()` or `Math.max`: `Money` is a `string`, so `"9" < "10"` compiles and is
wrong. An input that is not `-?digits[.digits]` (≤ 64 characters) raises a `ConfigError` with code
`sdk.bad_amount` — never a native `TypeError`.

## Webhooks

Register an endpoint with `webhooks.register(url)`, then verify every delivery over the **raw** body,
before parsing it:

```ts
import express from "express";
import { verifyWebhookDelivery, isKnownEvent } from "@oblodai-npm/sdk/webhooks";

const app = express();

app.post("/oblodai/webhook", express.raw({ type: "*/*" }), (req, res) => {
  const { event, id, isTest } = verifyWebhookDelivery(req.body, req.headers, {
    secret: process.env.OBLODAI_WEBHOOK_SECRET!,
    previousSecret: process.env.OBLODAI_WEBHOOK_SECRET_PREV, // during rotation
  });
  if (isTest) return res.sendStatus(200); // a rehearsal — never move money on it
  if (!isKnownEvent(event)) return res.sendStatus(200); // a type from a newer gateway
  // narrowed: event.type is "payment" | "payout" | "wallet"
  // order_id is null on refund payouts, so fall back to the uuid
  if (event.type === "payment" && event.status === "paid")
    markOrderPaid(event.order_id ?? event.uuid, id);
  res.sendStatus(200);
});
```

The checks run in a fixed order — headers, then the HMAC (current secret, then `previousSecret`),
then freshness, then the body — so the freshness window is never an oracle for an unauthenticated
caller. An empty `secret` (or an empty `previousSecret`) is a `ConfigError`, never a verification
against the empty key. `toleranceSec` defaults to 300 and `0` disables the freshness check.

- **Deduplicate on `id`** (`X-Webhook-Id`): it is stable across the gateway's own retries.
- **Order with `event.sequence`**: `isStaleEvent(event, lastSequence)` returns false rather than
  throwing when there is no usable sequence.
- **Rehearsals** (`webhooks.test`, sandbox deliveries) are signed like live ones and carry
  `test: true` (and `X-Webhook-Test: true`); `verifyWebhookDelivery(...).isTest` reports it.
- **Unknown event types** from a newer gateway are returned verbatim as `UnknownWebhookEvent` rather
  than thrown — call `isKnownEvent(event)` before switching on `type`.
- **Rotation**: after `webhooks.rotateSecret`, keep passing `previousSecret` for at least 26 hours.

Two failure kinds, two answers. A `SignatureError` (`webhook.bad_signature`,
`webhook.stale_timestamp`, `webhook.missing_header`) is a forged or replayed delivery — answer 4xx,
and reserve **401 for signature failures only**. A `WebhookPayloadError` (`webhook.bad_payload`) is an
**authentic** delivery whose body could not be read — answer 5xx so the gateway retries it, and go
look at it.

## Errors

Every failure is an `OblodaiError` carrying the API's error envelope: `code`
(`payout.insufficient_funds`), `httpStatus`, `retryable`, `retryAfter`, `requestId`, `field`. All the
classes below are exported from the package root, so `instanceof` works.

| Class                                        | HTTP      | When                                                                                                                                                                         |
| -------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ValidationError`                            | 400       | The request is malformed; `field` names the offender                                                                                                                         |
| `AuthenticationError`                        | 401       | Bad signature, unknown public id, skewed clock                                                                                                                               |
| `PermissionError`                            | 403       | Right key, wrong kind or missing capability (`merchant.wrong_key_kind`)                                                                                                      |
| `NotFoundError`                              | 404       | No such object                                                                                                                                                               |
| `ConflictError` / `IdempotencyConflictError` | 409       | State conflict; the second for a reused idempotency key with a different body                                                                                                |
| `RateLimitError`                             | 429       | Throttled; `retryAfter` is set                                                                                                                                               |
| `UnavailableError`                           | 503       | Gateway temporarily down; retryable                                                                                                                                          |
| `InternalError`                              | other 5xx | Gateway fault                                                                                                                                                                |
| `TransportError`                             | —         | No response at all: DNS, TCP, TLS, timeout, abort                                                                                                                            |
| `ConfigError`                                | —         | Rejected before sending: bad options, a header the SDK will not send, an idempotency key on a route the gateway does not deduplicate, an amount that is not a decimal string |
| `ContractError`                              | —         | The answer is not the documented envelope, or is too large to buffer                                                                                                         |
| `SignatureError` / `WebhookPayloadError`     | —         | Webhook verification (see above)                                                                                                                                             |

`retryable` is authoritative — the SDK has already retried what was safe to retry, so a `retryable`
error that reaches you is one you may schedule yourself. `retryAfter` is the gateway's own hint in
seconds. Quote `requestId` to support. `err.synthetic` is true when the answer carried no gateway
envelope — a proxy or a load balancer replied, not the API; a non-boolean `retryable`, a numeric
`code` or a nonsense `retry_after` never leak through, they fall back to what the HTTP status alone
justifies. `JSON.stringify(err)` keeps `message` and drops the raw body.

Branch on `code`, not on the message. The full catalogue is 471 codes, exported as `ERROR_CODES` and
typed as `ErrorCode`:

```ts
import { Oblodai, OblodaiError, type CreatePayoutParams } from "@oblodai-npm/sdk";

const oblodai = new Oblodai();

async function sendPayout(params: CreatePayoutParams): Promise<void> {
  try {
    await oblodai.payouts.create(params);
  } catch (err) {
    if (!(err instanceof OblodaiError)) throw err;
    switch (err.code) {
      case "payout.insufficient_funds": // the balance may still arrive
      case "payout.funds_maturing":
        return scheduleRetry(err.retryAfter ?? 60);
      default:
        throw err; // the SDK already retried what was safe to retry
    }
  }
}
```

Codes worth handling explicitly: `payout.insufficient_funds`, `payout.funds_maturing`,
`idempotency.key_reused`, `invoice.not_payable`, `payment.not_found`, `merchant.wrong_key_kind`,
`merchant.bad_signature`, `request.rate_limited`.

## Retries, idempotency and timeouts

**What is safe to repeat is not a guess.** `ROUTES[key].safe` is the gateway's own hand-written
read-only classification, shipped in `contract/contract.json`. The SDK never infers retry safety from
a path or an HTTP verb.

- An error is retried only when the API says `retryable: true`. Answers without an API envelope (a
  proxy 502/503) and transport failures are retried only on read routes or on keyed writes — a write
  the gateway does not deduplicate is never re-sent once it may have reached the gateway.
- `Retry-After` always wins over the computed backoff; otherwise exponential backoff with full jitter.
  Defaults: `maxRetries: 2`, `baseDelayMs: 250`, `maxDelayMs: 4000`, `maxRetryAfterMs: 30000`.
  `retry: { maxRetries: 0 }` disables retries entirely.
- **Idempotency keys are automatic** on create-type routes: one key per logical call, reused on every
  retry, so a timeout can never produce a second payout. Pass your own `idempotencyKey` to make
  retries safe across process restarts too. On a route the gateway does not deduplicate the SDK
  refuses the key up front (`ConfigError`, `sdk.idempotency_unsupported`) rather than dropping it
  silently — list methods included.
- **Per-call options**: `{ idempotencyKey, signal, timeoutMs, deadlineMs, preferPayoutKey }`.
  `timeoutMs` bounds one attempt (default 30000), `deadlineMs` the whole call including retries
  (default 90000).
- **Clock skew is corrected once.** The gateway rejects timestamps more than ±300 s from its own; on a
  signature failure the SDK learns the server time from the response `Date` header, re-signs once, and
  keeps the offset only if that attempt got past authentication. Implausible offsets (> 24 h) are
  ignored.
- **Redirects are never followed** — a 3xx from the API surface is an error, not a hop.
- **Bodies are capped** while buffering: 8 MiB for JSON envelopes, 64 MiB for binary document routes
  (`MAX_JSON_BODY_BYTES`, `MAX_BARE_BODY_BYTES`). Anything larger is a `ContractError`.

## Configuration

```ts
import { Oblodai, consoleLogger } from "@oblodai-npm/sdk";

const oblodai = new Oblodai({
  baseUrl: "https://api.oblodai.com",
  timeoutMs: 30_000,
  deadlineMs: 90_000,
  retry: { maxRetries: 2 },
  headers: { "X-Tenant": "eu-1" },
  logger: consoleLogger("info"),
});
```

| Option                            | Default                                | Meaning                                                                 |
| --------------------------------- | -------------------------------------- | ----------------------------------------------------------------------- |
| `publicId` / `secret`             | `OBLODAI_PUBLIC_ID` / `OBLODAI_SECRET` | The payment (or sandbox) key pair; both or neither                      |
| `payoutPublicId` / `payoutSecret` | `OBLODAI_PAYOUT_*`                     | The payout key pair; both or neither                                    |
| `baseUrl`                         | `https://api.oblodai.com`              | API origin; a path prefix is preserved                                  |
| `allowInsecureBaseUrl`            | `false`                                | Permit a plain-`http://` base URL that is not loopback                  |
| `adminToken`                      | `OBLODAI_ADMIN_TOKEN`                  | Self-hosted onboarding token; used by the two `merchants.*` routes only |
| `timeoutMs`                       | `30000`                                | Per-attempt timeout                                                     |
| `deadlineMs`                      | `90000`                                | Budget for the whole call, retries included                             |
| `retry`                           | see above                              | `{ maxRetries, baseDelayMs, maxDelayMs, maxRetryAfterMs }`              |
| `headers`                         | —                                      | Extra headers on every request                                          |
| `logger`                          | `OBLODAI_LOG`                          | Structured logger; `consoleLogger(level)` is provided                   |
| `fetch`                           | global `fetch`                         | Custom fetch — undici with a proxy agent, a recording stub in tests     |

| Environment variable       | Meaning                                                           |
| -------------------------- | ----------------------------------------------------------------- |
| `OBLODAI_PUBLIC_ID`        | Public id of the payment (or sandbox) key                         |
| `OBLODAI_SECRET`           | Its secret                                                        |
| `OBLODAI_PAYOUT_PUBLIC_ID` | Public id of the payout key                                       |
| `OBLODAI_PAYOUT_SECRET`    | Its secret                                                        |
| `OBLODAI_ADMIN_TOKEN`      | Onboarding admin token of a self-hosted gateway                   |
| `OBLODAI_BASE_URL`         | API origin                                                        |
| `OBLODAI_LOG`              | `debug` \| `info` \| `warn` \| `error` — enables a console logger |
| `OBLODAI_ALLOW_INSECURE`   | `1` permits a non-loopback plain-`http://` base URL               |

Headers you add with `headers:` travel on every request, except the ones the SDK owns (`Accept`,
`Content-Type`, `User-Agent`, `X-Public-Id`, `X-Signature`, `X-Timestamp`, `Idempotency-Key`,
`X-Admin-Token`, matched case-insensitively) — those always win. A header value containing CR/LF or a
non-ASCII character is a `ConfigError`.

**Secrets never print.** The client, its transport, the resolved credentials and every secret-bearing
result — a webhook `secret`, a freshly minted key pair, a payout link's
`claim_token`/`claim_url`/`passcode` — render as `[redacted]` in `JSON.stringify` and
`console.log`/`util.inspect`, at any depth. The values are still readable as properties
(`endpoint.secret` works); only the automatic renderings are scrubbed. A logger you inject through
`logger:` receives fields that were redacted before they reached it, so an accidental
`logger.info({ client })` cannot leak a key.

A local or self-hosted gateway needs no ceremony: `baseUrl: "http://localhost:8095"` works out of the
box, other plain-`http://` hosts need `allowInsecureBaseUrl: true` (or `OBLODAI_ALLOW_INSECURE=1`).

## The contract snapshot

`contract/` is exported by the gateway's own test suite, not written by hand. It holds the route
registry — 107 merchant routes, each with its `auth`, `idempotent`, `safe`, `bare` and `list` flags —
request DTO schemas with English field docs, enums, every error code (471), signing vectors, golden
response bodies recorded from a live gateway and real signed webhook deliveries. This release is
built from core `7ec04293c426`.

`src/contract/` is generated from it with `npm run codegen`. `npm run check-drift` fails when the two
disagree, and `npm test` checks every model against the golden bodies and every route flag against
the contract — so a doc, a type and the gateway cannot quietly diverge. `contract.json` ships inside
the package:

```ts
import { ROUTES, ERROR_CODES, CONTRACT_CORE_COMMIT } from "@oblodai-npm/sdk";

console.log(Object.keys(ROUTES).length, ERROR_CODES.length, CONTRACT_CORE_COMMIT);
console.log(ROUTES["POST /v1/payout"].safe); // false — never retried blindly
```

The golden fixtures and webhook samples live in the repository, not in the published tarball. To
refresh the snapshot, run `scripts/contract-pull.sh <core checkout>` and then `npm run codegen`.

## Development

```bash
git clone https://github.com/oblodai/oblodai-node.git
cd oblodai-node
npm install

npm run ci          # fmt:check + check-drift + typecheck (src + examples) + build + test
npm test            # unit + contract tests
npm run fmt         # prettier
npm run codegen     # after refreshing contract/ (scripts/contract-pull.sh <core checkout>)

# the live tier: runs the full journey against a real gateway
OBLODAI_LIVE_URL=http://localhost:8095 npm run test:live
```

Further reading: [AGENTS.md](AGENTS.md) (the compact reference for coding agents),
[CHANGELOG.md](CHANGELOG.md), [MIGRATION-1.3.md](MIGRATION-1.3.md) for the move from 1.x.

## License

MIT — see [LICENSE](LICENSE).
