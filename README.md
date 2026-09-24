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
retries — out of the box.

Node.js ≥ 20, ESM and CommonJS in one package, zero runtime dependencies. The resources, models and
route table are generated from the gateway's own OpenAPI contract: every route it exposes (120) has
a method here, and every request and response has a type.

> **Base URL.** Defaults to `https://api.oblodai.com`. Override `baseUrl` and supply your own keys at
> initialisation if needed. The scheme must be `https://`; plain `http://` is accepted only for
> loopback (`http://127.0.0.1:8095`) or with the explicit `allowInsecureBaseUrl` option.

## Installation

```bash
npm install @oblodai-npm/sdk
```

Node.js 20 or newer (the SDK uses the runtime's global `fetch`). The package ships an ESM build, a
CommonJS build and type declarations for both. Webhook verification lives in the
`@oblodai-npm/sdk/webhooks` subpath and needs neither a client nor an API key.

Writing code with an AI agent? Point it at [AGENTS.md](AGENTS.md) — it ships inside the package.
Coming from 1.x? [MIGRATION-2.0.md](MIGRATION-2.0.md) maps every old method name to its new one.

## Where to get keys

Keys are issued in the dashboard at [my.oblodai.com](https://my.oblodai.com) → **API keys**. The
secret is shown once, at creation. A live pair is a public id `oblodai_<hex>` with a secret
`oblodai_live_<hex>`; a sandbox pair is `test_oblodai_<hex>` with `oblodai_test_<hex>`.

**One API key signs everything.** A merchant has a single key, and it authenticates every signed
route — money in and money out, settings, documents, sandbox. There is no separate payout credential.

| Credential             | Configured as                                                 | Used for                                                          |
| ---------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| API key                | `publicId` / `secret` (`OBLODAI_PUBLIC_ID`, `OBLODAI_SECRET`) | every signed route                                                |
| Sandbox API key        | the same, a `test_oblodai_<hex>` pair                         | the same surface, against a chainless copy of the gateway         |
| Onboarding admin token | `adminToken` (`OBLODAI_ADMIN_TOKEN`)                          | `sandbox.onboardStore` on a self-hosted gateway, and nothing else |

```ts
import { Oblodai } from "@oblodai-npm/sdk";

const oblodai = new Oblodai({
  publicId: process.env.OBLODAI_PUBLIC_ID,
  secret: process.env.OBLODAI_SECRET,
});
console.log(oblodai.transport.baseUrl);
```

The payer-facing routes take no credentials at all: every `checkout.*` method,
`account.listExchangeRates`, `payoutLinks.getPayoutClaim` / `claimPayout` and
`documents.getSigned` (a pre-signed link).

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
import { Oblodai, type PayoutRequest } from "@oblodai-npm/sdk";

const oblodai = new Oblodai(); // the same key that took the payment sends the payout

const params: PayoutRequest = {
  amount: "10",
  currency: "USDT",
  network: "tron",
  address: "TQrY8bkbpXKPt2LZbU8jqfnpFbUSF15sbx",
  order_id: "payout-42",
};
const check = await oblodai.payouts.validate(params);
console.log("will debit", check.payer_amount, "commission", check.commission);

const payout = await oblodai.payouts.create(params, { idempotencyKey: "payout-42" });
console.log(payout.uuid, payout.status);
```

More end-to-end programs live in [`examples/`](examples) — run one with `npx tsx examples/sandbox.ts`.

### Requests and responses are typed

Every method is `client.<resource>.<method>(params, options)`. `params` is the request body as an
object with the wire's own `snake_case` field names — its type (`PaymentRequest`, `PayoutRequest`, …)
is generated from the contract, so editors autocomplete the fields and `tsc` catches a typo or a
number in an amount before it reaches the API. Path parameters come first (`checkout.get(id)`),
query parameters travel inside `params`.

Results are the JSON objects as they arrive, typed by the generated interfaces. A field newer than
this SDK stays on the object; an enum value newer than it is a plain string (`OpenEnum<T>`) — neither
is an error. Enum values are also exported as constants: `PaymentStatus.PAID === "paid"`.

### Per-call options

The last argument of every method is `RequestOptions`:

| Option           | Meaning                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `idempotencyKey` | your own key; generated automatically on routes the gateway deduplicates                        |
| `timeout`        | seconds per attempt (the client's `deadline` still bounds the whole call)                       |
| `maxRetries`     | retries after the first attempt, for this call                                                  |
| `extraHeaders`   | headers for this call, merged over the client's `headers`                                       |
| `requestId`      | sent as `X-Request-ID`; a UUID is generated when omitted — the same id on every retry of a call |
| `signal`         | an `AbortSignal` that cancels the call and any retry pause                                      |

```ts
import { Oblodai } from "@oblodai-npm/sdk";

const oblodai = new Oblodai();

const balance = await oblodai.account.getBalance({
  timeout: 5, // seconds
  maxRetries: 0,
  requestId: "checkout-7f3a", // find this call in our logs by your own id
  extraHeaders: { "X-Tenant": "eu-1" },
});
console.log(balance.balance.merchant);

// A client (or a resource) that starts every call from other defaults:
const impatient = oblodai.withOptions({ timeout: 3, maxRetries: 1 });
await impatient.payments.getInfo({ order_id: "order-1001" });
```

### Amounts

Amounts are decimal strings at the asset's own scale. A number is a type error, and a fractional
number that slips through from JavaScript is refused before anything is sent (`ConfigError`,
`sdk.float_amount`). For arithmetic use the exact helpers:

```ts
import { addAmounts, amountEquals, compareAmounts, isValidAmount } from "@oblodai-npm/sdk";

console.log(addAmounts("10.000000", "0.5")); // "10.500000"
console.log(compareAmounts("9", "10")); // -1 — never compare amounts with < or sort()
console.log(amountEquals("25", "25.000000")); // true
console.log(isValidAmount("1e3")); // false
```

`"9" < "10"` is `false` for strings: never order amounts with `<`, `sort()` or `Math.max`. Anything
that is not `-?digits[.digits]` (≤ 64 characters) raises `ConfigError` with code `sdk.bad_amount`.

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
await oblodai.sandbox.simulateDeposit({
  invoice_id: invoice.uuid,
  amount: "25",
  confirmations: 20,
  txid: `sbx-tx-${Date.now()}`,
});
console.log((await oblodai.payments.getInfo({ uuid: invoice.uuid })).status); // "paid"

for await (const delivery of oblodai.sandbox.listWebhooks({ limit: 20 })) {
  console.log(delivery.event_type, delivery.status);
}
await oblodai.sandbox.reset(); // cancel open invoices, zero the balances
```

- `sandbox.simulateDeposit` credits an invoice; repeat the same `txid` to add confirmations.
- `sandbox.listWebhooks` is the delivery log with payloads; `sandbox.replayWebhook({ delivery_id })`
  re-sends a terminal (delivered or dead) delivery.
- `webhooks.sendTestPayment` / `sendTestPayout` / `sendTestWallet` / `sendTestConversion` rehearse a
  delivery against your endpoint. Rehearsals are signed exactly like real deliveries and carry
  `test: true` — check `isTest` and never let one move money in your system.

## Method overview

Sixteen resources, 120 routes — every route the gateway exposes has a method here.

| Resource       | Methods                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payments`     | create · getInfo · getQr · listHistory · listServices · cancel · sendEmail · setCheckoutConfig · getCheckoutConfig · getAmlLinks · resolve                                                                                                                                                                                                                                                                     |
| `paymentLinks` | create · list · get · toggle                                                                                                                                                                                                                                                                                                                                                                                   |
| `refunds`      | payment · blockedWallet                                                                                                                                                                                                                                                                                                                                                                                        |
| `payouts`      | create · createMass · getInfo · listHistory · calculate · validate · cancel · approve · listServices · transferToPersonal · transferToUser · createTransferBatch                                                                                                                                                                                                                                               |
| `payoutLinks`  | create · createBatch · list · get · cancel · getPayoutClaim · claimPayout                                                                                                                                                                                                                                                                                                                                      |
| `batches`      | createPayment · createRefund · createPayout · getInfo                                                                                                                                                                                                                                                                                                                                                          |
| `splits`       | createRule · listRules · deleteRule · setConfig · getConfig · setRecipientOptIn · getRecipientOptIn                                                                                                                                                                                                                                                                                                            |
| `wallets`      | create · block · getQr                                                                                                                                                                                                                                                                                                                                                                                         |
| `account`      | getBalance · getSummary · listExchangeRates                                                                                                                                                                                                                                                                                                                                                                    |
| `webhooks`     | resendPayment · register · listDeliveries · requeueDelivery · sendLegacyTest · sendTestPayment · sendTestWallet · sendTestPayout · sendTestConversion · rotateSecret · setActive                                                                                                                                                                                                                               |
| `settings`     | setAccuracy · getAccuracy · setAutoRefund · getAutoRefund · setDiscount · listDiscounts · listApiLog · getAutoConvert · setAutoConvert · setAcceptedCurrencies · listAcceptedCurrencies · setPayoutFeeConfig · getPayoutFeeConfig · setRefundFeeConfig · getRefundFeeConfig · setPaymentFeeConfig · getPaymentFeeConfig · setAutoWithdrawRule · listAutoWithdrawRules · deleteAutoWithdrawRule · configureVrcs |
| `apiAllowlist` | list · addEntry · removeEntry · setEnabled                                                                                                                                                                                                                                                                                                                                                                     |
| `referrals`    | getInfo                                                                                                                                                                                                                                                                                                                                                                                                        |
| `documents`    | getSigned · getBalance · getFees · getLedger · getSplit · getPayoutLinkCheque · getStatement · getBatch · getPaymentLink · getWalletStatement · getReferrals · createJob · getJob · downloadJobFile                                                                                                                                                                                                            |
| `checkout`     | getSourceOfFundsForm · submitSourceOfFunds · getPublicPaymentLink · paymentLink · listCurrencies · get · selectMethod · startOnramp · getOnramp · getQr                                                                                                                                                                                                                                                        |
| `sandbox`      | onboardStore · faucet · simulateDeposit · reset · listWebhooks · replayWebhook                                                                                                                                                                                                                                                                                                                                 |

The names follow one rule: the OpenAPI `operationId` without the resource's name, in camelCase
(`createPayoutBatch` → `batches.createPayout`). They are pinned in [`names.lock`](names.lock); a
rename is a breaking change and fails the SDK build.

- Synchronous bulk calls are capped per call — `payouts.createMass` at 100 elements,
  `payoutLinks.createBatch` at 500 — and report each element separately, so a 200 can still contain
  failures. Asynchronous batches (`batches.*`, `payouts.createTransferBatch`) take up to 5000
  elements and can be waited on (below).
- Document methods resolve to a `FileResult` — `{ content, contentType, filename }`.

### Lists

A list method returns a `Page` — lazy, async-iterable and awaitable. Nothing is requested until you
consume it, and the first page is requested once however you consume it.

```ts
import { Oblodai } from "@oblodai-npm/sdk";

const oblodai = new Oblodai();

// one page: { items, paginate: { total, per_page, offset, has_pages } }
const page = await oblodai.payments.listHistory({ limit: 50 });
console.log(page.items.length, page.total);

// every item, page after page
for await (const payout of oblodai.payouts.listHistory({ status: "confirmed" })) {
  console.log(payout.uuid);
}

// page by page
for await (const p of oblodai.payments.listHistory({ limit: 100 }).byPage()) {
  console.log(p.offset, p.items.length);
}

// up to N items as an array
const refunds = await oblodai.payouts.listHistory({ kind: "refund" }).all(1000);
console.log(refunds.length);
```

### Long-running operations

Batches and background document jobs answer at once and finish later. Their answer carries a
waiter: `wait()` polls the status until it is final and resolves to the last status (a `failed` job
resolves too — inspect it); a document job can then `download()` its file.

```ts
import { Oblodai } from "@oblodai-npm/sdk";

const oblodai = new Oblodai();

const batch = await oblodai.batches.createPayout({
  on_error: "continue",
  payouts: [
    {
      amount: "5",
      currency: "USDT",
      network: "tron",
      address: "TQrY8bkbpXKPt2LZbU8jqfnpFbUSF15sbx",
      order_id: "bonus-1",
    },
  ],
});
const info = await batch.wait({ timeout: 300, interval: 2 }); // seconds
console.log(info.status, info.succeeded, info.failed);

const job = await oblodai.documents.createJob({ kind: "statement", format: "pdf", lang: "en" });
const done = await job.wait();
if (done.status === "done") {
  const file = await job.download();
  console.log(file.filename, file.content.length);
}
```

### Statuses

- Payment: `select → created → confirm_check → paid | paid_over | wrong_amount | expired | cancelled`.
  `isPaymentPaid(status)` is true for `paid`/`paid_over`; `wrong_amount` (underpaid) waits for
  `payments.resolve({ uuid, action: "accept" | "refund" })`; `isPaymentFinal` covers the rest.
- Payout: `pending → approved → awaiting_cosign → broadcasting → sent → confirmed | failed | cancelled`,
  with `isPayoutFinal` and `isPayoutSucceeded`.

Prefer webhooks for state changes; poll `getInfo` only as a fallback.

## Webhooks

Register an endpoint with `webhooks.register({ url })`, then verify every delivery over the **raw**
body, before parsing it:

```ts
import { createServer } from "node:http";
import { SignatureError, isKnownEvent, verifyWebhookDelivery } from "@oblodai-npm/sdk/webhooks";

const paidOrders = new Set<string>();

export const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    try {
      const { event, isTest } = verifyWebhookDelivery(Buffer.concat(chunks), req.headers, {
        secret: process.env.OBLODAI_WEBHOOK_SECRET ?? "",
        previousSecret: process.env.OBLODAI_WEBHOOK_SECRET_PREV || undefined, // during rotation
      });
      // A rehearsal never moves money; a type from a newer gateway is acknowledged and skipped.
      if (!isTest && isKnownEvent(event) && event.type === "payment" && event.status === "paid") {
        paidOrders.add(event.order_id ?? event.uuid);
      }
      res.writeHead(200).end();
    } catch (err) {
      res.writeHead(err instanceof SignatureError ? 401 : 500).end();
    }
  });
});
// server.listen(3000);
```

The checks run in a fixed order — headers, then the HMAC (current secret, then `previousSecret`),
then freshness, then the body — so the freshness window is never an oracle for an unauthenticated
caller. An empty `secret` is a `ConfigError`, never a verification against the empty key.
`toleranceSec` defaults to 300 and `0` disables the freshness check.

- **Deduplicate on `id`** (`X-Webhook-Id`): it is stable across the gateway's own retries.
- **Order with `event.sequence`**: `isStaleEvent(event, lastSequence)`.
- **Rehearsals** are signed like live ones and carry `test: true` (and `X-Webhook-Test: true`);
  `verifyWebhookDelivery(...).isTest` reports it.
- **Unknown event types** from a newer gateway are returned verbatim as `UnknownWebhookEvent` rather
  than thrown — call `isKnownEvent(event)` before switching on `type`.
- **Rotation**: after `webhooks.rotateSecret()`, keep passing `previousSecret` for at least 26 hours.

A `SignatureError` (`webhook.bad_signature`, `webhook.stale_timestamp`, `webhook.missing_header`) is
a forged or replayed delivery — answer 4xx. A `WebhookPayloadError` (`webhook.bad_payload`) is an
**authentic** delivery whose body could not be read — answer 5xx so the gateway retries it.

## Errors

Every failure is an `OblodaiError` carrying the API's error envelope: `code`
(`payout.insufficient_funds`), `httpStatus`, `retryable`, `retryAfter`, `requestId`, `field`.
`String(err)` reads `[code] message (request_id=…)` — the same line an uncaught error's stack starts
with, so a log line is enough to find the call on our side.

| Class                                        | HTTP      | When                                                                                               |
| -------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| `ValidationError`                            | 400       | The request is malformed; `field` names the offender                                               |
| `AuthenticationError`                        | 401       | Bad signature, unknown public id, skewed clock                                                     |
| `PermissionError`                            | 403       | The key is valid but not allowed to do this                                                        |
| `NotFoundError`                              | 404       | No such object                                                                                     |
| `ConflictError` / `IdempotencyConflictError` | 409       | State conflict; the second for a reused idempotency key with a different body                      |
| `RateLimitError`                             | 429       | Throttled; `retryAfter` is set                                                                     |
| `UnavailableError`                           | 503       | Gateway temporarily down; retryable                                                                |
| `InternalError`                              | other 5xx | Gateway fault                                                                                      |
| `TransportError`                             | —         | No response at all: DNS, TCP, TLS, timeout, abort, deadline                                        |
| `ConfigError`                                | —         | Rejected before sending: bad options, a float amount, a header or idempotency key it will not send |
| `ContractError`                              | —         | The answer is not the documented envelope, or is too large to buffer                               |
| `SignatureError` / `WebhookPayloadError`     | —         | Webhook verification (see above)                                                                   |

Branch on `code`, not on the message. Every code the gateway documents is exported as `ErrorCode`:

```ts
import { Oblodai, OblodaiError, type PayoutRequest } from "@oblodai-npm/sdk";

const oblodai = new Oblodai();
const retryLater: number[] = [];

export async function sendPayout(params: PayoutRequest): Promise<void> {
  try {
    await oblodai.payouts.create(params);
  } catch (err) {
    if (!(err instanceof OblodaiError)) throw err;
    switch (err.code) {
      case "payout.insufficient_funds": // the balance may still arrive
      case "payout.funds_maturing":
        retryLater.push(err.retryAfter ?? 60);
        return;
      default:
        console.error(String(err)); // [code] message (request_id=…)
        throw err; // the SDK already retried what was safe to retry
    }
  }
}

await sendPayout({
  amount: "10",
  currency: "USDT",
  network: "tron",
  address: "TQrY8bkbpXKPt2LZbU8jqfnpFbUSF15sbx",
  order_id: "payout-43",
});
```

`retryable` is authoritative — the SDK has already retried what was safe to retry. `err.synthetic`
is true when the answer carried no gateway envelope (a proxy or a load balancer replied).
`JSON.stringify(err)` keeps `message` and drops the raw body.

## Retries, idempotency and timeouts

- **What is safe to repeat is not a guess.** Every route's `safe` flag (`ROUTES.<operationId>.safe`)
  comes from the gateway's contract (`x-retry-safe`); the SDK never infers it from a path or a verb.
- An error is retried only when the API says `retryable: true`. Answers without an API envelope (a
  proxy 502/503) and transport failures are retried only on retry-safe routes or on keyed writes — a
  write the gateway does not deduplicate is never re-sent once it may have reached the gateway.
- `Retry-After` always wins over the computed backoff; otherwise exponential backoff with full jitter.
  Defaults: `maxRetries: 2`, `baseDelayMs: 250`, `maxDelayMs: 4000`, `maxRetryAfterMs: 30000`.
- **Idempotency keys are automatic** on routes the gateway deduplicates: one key per logical call,
  reused on every retry, so a timeout can never produce a second payout. Pass your own
  `idempotencyKey` to make retries safe across process restarts too. On a route the gateway does not
  deduplicate the key is refused up front (`sdk.idempotency_unsupported`) rather than dropped.
- **Timeouts are seconds**: `timeout` bounds one attempt (default 30), `deadline` the whole call
  including retries and pauses (default 90).
- **Clock skew is corrected once** from the response `Date` header on a signature failure.
- **Redirects are never followed**, and bodies are capped while buffering (8 MiB JSON, 64 MiB files).

### Raw responses and hooks

```ts
import { Oblodai } from "@oblodai-npm/sdk";

const oblodai = new Oblodai({
  hooks: {
    onRequest: (r) => console.log("→", r.method, r.url, "attempt", r.attempt, r.requestId),
    onResponse: (r) => console.log("←", r.status, `${r.elapsed.toFixed(3)} s`),
  },
});

const raw = await oblodai.payments.withRawResponse.getInfo({ uuid: "5d6f3a52" });
console.log(raw.status, raw.requestId, raw.header("content-type"));
const payment = raw.parse(); // what getInfo() returns
console.log(payment.status);
```

Hooks see every attempt (signature and admin token redacted), with the call's `X-Request-ID` and the
route's `operationId` — enough for metrics and tracing without a dependency.

## Configuration

```ts
import { Oblodai, consoleLogger } from "@oblodai-npm/sdk";

const oblodai = new Oblodai({
  baseUrl: "https://api.oblodai.com",
  timeout: 30, // seconds per attempt
  deadline: 90, // seconds for the whole call, retries included
  retry: { maxRetries: 2 },
  headers: { "X-Tenant": "eu-1" },
  logger: consoleLogger("info"),
});
console.log(JSON.stringify(oblodai)); // redacted: the secret never prints
```

| Option                 | Default                                | Meaning                                                             |
| ---------------------- | -------------------------------------- | ------------------------------------------------------------------- |
| `publicId` / `secret`  | `OBLODAI_PUBLIC_ID` / `OBLODAI_SECRET` | The merchant's one API key; both or neither                         |
| `baseUrl`              | `https://api.oblodai.com`              | API origin; a path prefix is preserved                              |
| `allowInsecureBaseUrl` | `false`                                | Permit a plain-`http://` base URL that is not loopback              |
| `adminToken`           | `OBLODAI_ADMIN_TOKEN`                  | Self-hosted onboarding token; `sandbox.onboardStore` only           |
| `timeout`              | `30`                                   | Per-attempt timeout, seconds                                        |
| `deadline`             | `90`                                   | Budget for the whole call, retries included, seconds                |
| `retry`                | see above                              | `{ maxRetries, baseDelayMs, maxDelayMs, maxRetryAfterMs }`          |
| `headers`              | —                                      | Extra headers on every request                                      |
| `hooks`                | —                                      | `{ onRequest, onResponse }`, called once per attempt                |
| `logger`               | `OBLODAI_LOG`                          | Structured logger; `consoleLogger(level)` is provided               |
| `fetch`                | global `fetch`                         | Custom fetch — undici with a proxy agent, a recording stub in tests |

| Environment variable     | Meaning                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| `OBLODAI_PUBLIC_ID`      | Public id of the merchant's API key (live or sandbox)             |
| `OBLODAI_SECRET`         | Its secret                                                        |
| `OBLODAI_ADMIN_TOKEN`    | Onboarding admin token of a self-hosted gateway                   |
| `OBLODAI_BASE_URL`       | API origin                                                        |
| `OBLODAI_LOG`            | `debug` \| `info` \| `warn` \| `error` — enables a console logger |
| `OBLODAI_ALLOW_INSECURE` | `1` permits a non-loopback plain-`http://` base URL               |

Headers the SDK owns (`Accept`, `Content-Type`, `User-Agent`, `X-Public-Id`, `X-Signature`,
`X-Timestamp`, `Idempotency-Key`, `X-Admin-Token`) always win over yours; a header value with CR/LF
or a non-ASCII character is a `ConfigError`.

**Secrets never print.** The client, its transport and every secret-bearing result — a webhook
`secret`, a freshly minted API key, a payout link's `claim_token`/`claim_url`/`passcode` — render as
`[redacted]` in `JSON.stringify` and `console.log`/`util.inspect`, at any depth, while the values
stay readable as properties.

## Development

The code under `src/generated/` is generated from the gateway's OpenAPI contract by `tools/sdkgen`
in the backend repository (`make sdk` there) — never edit it by hand. The runtime around it
(`src/core`, `src/resources/base.ts`, `src/lro.ts`, `src/webhooks.ts`) is hand-written.

```bash
npm install
make ci             # format, drift, types, tests, conformance, build, package
npm test            # unit, conformance and documentation tests
make drift          # fail when src/generated is stale (OBLODAI_BACKEND=<backend checkout>)

# the live tier: runs the full journey against a real gateway
OBLODAI_LIVE_URL=http://localhost:8095 npm run test:live
```

`make ci` reads the backend checkout from `OBLODAI_BACKEND` (else `../oblodai-backend`) for the
drift check and the shared conformance suite (`tools/sdkgen/conformance`); every TypeScript block
of this README and every program in `examples/` runs in the tests against a stand-in gateway.

Further reading: [AGENTS.md](AGENTS.md), [CHANGELOG.md](CHANGELOG.md),
[MIGRATION-2.0.md](MIGRATION-2.0.md).

## License

MIT — see [LICENSE](LICENSE).
