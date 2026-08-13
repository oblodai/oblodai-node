# Oblodai SDK

> [Читать по-русски →](README.ru.md)

The official TypeScript / Node.js SDK for the **Oblodai** payment gateway: accepting payments, payouts,
bulk operations, payment and payout links, splits, static wallets, webhooks. Request signing,
response parsing, typed errors, and retries — out of the box.

> **Base URL.** Defaults to `https://api.oblodai.com`. Override `baseUrl` and supply your own keys at initialization if needed.

## Installation

```bash
npm install @oblodai-npm/sdk
```

Requires Node.js 18+ (uses the global `fetch`). The package ships as ESM and CommonJS with
TypeScript types.

## Where to get keys

Keys are issued in the **Oblodai dashboard** (<https://oblodai.com>), in the API keys section.
A key pair consists of two parts:

- **`public_id`** — the non-secret key identifier, sent in the `X-Public-Id` header;
- **`secret`** — the secret the SDK signs requests with (`X-Signature`). It is **shown exactly
  once, at key creation**, and is never displayed again — store it in your secret vault right
  away. If you lose it, issue a new key; there is no way to "view the old one".

For development, use a **test** key: its `public_id` starts with `test_`, and its secret with
`oblodai_test_`. It works across the entire [sandbox](#sandbox--testing-v120) and on the regular
business endpoints, but never moves real money. A live secret looks like `oblodai_live_...`.

The secret belongs **on the server only**. It grants the right to create payouts, so it must never
end up in a browser, a mobile app, or a public repository under any circumstances.

## Credentials

Keep keys in environment variables (see `.env.example`):

```bash
export OBLODAI_PUBLIC_ID=test_...
export OBLODAI_SECRET=oblodai_test_...
# optional: export OBLODAI_BASE_URL=https://api.oblodai.com
```

The same code works with a live key too — **only the key changes** (`oblodai_live_...`); not a
single line of the integration needs rewriting.

⚠ `OBLODAI_BASE_URL` must be `https://`: the signature and `public_id` travel in headers, and over
plain HTTP any intermediary can read them. The client rejects a non-HTTPS address immediately at
construction. The only exception is a local loopback setup (`http://localhost:8095`, `http://127.0.0.1:...`,
`http://[::1]:...`).

```ts
import { OblodaiClient } from "@oblodai-npm/sdk";

const client = OblodaiClient.fromEnv(); // OBLODAI_PUBLIC_ID / OBLODAI_SECRET / OBLODAI_BASE_URL
```

## Quick start

```ts
import { OblodaiClient } from "@oblodai-npm/sdk";

// or explicitly (equivalent to fromEnv above):
const client = new OblodaiClient({
  publicId: process.env.OBLODAI_PUBLIC_ID!,
  secret: process.env.OBLODAI_SECRET!,
  baseUrl: "https://api.oblodai.com", // optional
});

// Create a payment
const payment = await client.payments.create({
  amount: "10",
  currency: "USD",
  order_id: "order-1",
  to_currency: "USDT",
  network: "tron",
});

console.log(payment.address); // address to pay to
console.log(payment.url); // hosted payment page
```

The client returns promises — works with both `await` and `.then()`.

> **URLs are built by the gateway, not the SDK.** `payment.url` (`.../pay/<uuid>`), `link.url`
> (`.../link/<link_id>`), and a payout link's `claim_url` (`.../claim/<claim_token>`) are built by
> the gateway from its public base URL (`GATEWAY_PUBLIC_BASE_URL`). In production the gateway won't
> even start without it, but on a **local setup** where it isn't set, these fields come back as an
> **empty string**. This is not an SDK bug and not a gateway bug: when testing locally, build the
> URL yourself from the `uuid` / `link_id` / `claim_token`, which are always present.

## Sandbox / testing (v1.2.0)

The gateway has a developer sandbox. **Same endpoints, same code** — the integration does not
change between test and live at all; only the key changes: a test `public_id` starts with
`test_...`, a test secret with `oblodai_test_...`. All business methods of the SDK work with a test
key exactly as they do with a live one.

What's new is five **test-only** methods, `client.sandbox.*` (`/v1/sandbox/*`). They have no live
counterpart: they stand in for what the outside world does in production (a buyer paying on-chain
and so on), so they belong **in test code only**, not in the integration. A live key gets
`403 sandbox.live_key` on any of them — a handy safeguard against a sandbox call leaking into
production. You can check a key with the `isTestKey(publicId)` helper (exported from the package
root).

```ts
import { OblodaiClient } from "@oblodai-npm/sdk";

const client = new OblodaiClient({
  publicId: process.env.OBLODAI_TEST_PUBLIC_ID!, // test_...
  secret: process.env.OBLODAI_TEST_SECRET!, // oblodai_test_...
});

// 1. Regular integration code — create an invoice (nothing "test-specific" in it)
const payment = await client.payments.create({
  amount: "10",
  currency: "USD",
  order_id: "order-1",
  to_currency: "USDT",
  network: "tron",
});

// 2. Test code — "the buyer paid on-chain"
await client.sandbox.simulateDeposit({ invoice_id: payment.uuid });
// without amount — exactly the amount due; a smaller/larger amount — under-/overpayment
// confirmations: 2 — the deposit arrives still pending (see the gotchas below)

// 3. Regular code — wait for the status (or receive a webhook)
const info = await client.payments.info({ uuid: payment.uuid }); // → 'paid'

// 4. Top up a test balance (up to 1000000 per call) and exercise a payout
await client.sandbox.faucet({ asset: "USDT", amount: "1000" });
await client.payouts.create({
  amount: "25",
  currency: "USDT",
  network: "tron",
  address: "T...",
  order_id: "payout-1",
});

// Webhook delivery log and redelivery:
const deliveries = await client.sandbox.listWebhooks(); // up to 50, newest first
await client.sandbox.replayWebhook(deliveries[0]!.id);

// Zero out balances and cancel invoices that have NOT seen a payment yet
await client.sandbox.reset(); // the operation history is preserved
```

Gotchas worth knowing about:

- **Shallow confirmations do NOT "ripen" on their own.** A deposit with a low `confirmations`
  arrives pending (`confirm_check`) and stays there **indefinitely**: nobody re-emits the
  simulated transaction any deeper, and the cursor never moves past it. The only way to bring the
  invoice to `paid` is to **repeat `simulateDeposit` with the same `txid`** and a larger
  `confirmations`. Repeating the same `txid` is also how you test the idempotency of your
  processing.
- **Don't confuse this with the maturity hold on the PAYOUT side.** The famous "~10 minutes"
  belongs to a different mechanism: in the sandbox, credited funds are held immature for a while,
  and a payout drawing on them fails with `payout.funds_maturing` (a terminal error, do not
  retry). That hold does lift on its own with age — via a background job, after 10 minutes by
  default (`GATEWAY_SANDBOX_MATURITY_MINUTES` on the gateway side). It has nothing to do with the
  invoice's confirmation count.
- **UTXO networks (Bitcoin and the like)** — same as in production: **no** auto-refund of
  overpayment and **no** payer address; a refund requires an explicit `address`.
- **`reset()` is not a "clean slate".** It zeroes balances and cancels invoices only in the
  `check` and `select` statuses. An invoice whose deposit is already **visible** (`confirm_check`,
  `wrong_amount_waiting`) is **deliberately left alone** by reset: cancelling it would let that
  deposit confirm into a cancelled invoice and get credited without an event. To the pipeline, a
  simulated deposit is just as real as an on-chain one, and the sandbox does not bypass that rule.
  If you need a truly clean run, create a new invoice rather than counting on resetting one that
  is already being paid. Nothing is deleted in the process: zeroing a balance is a compensating
  entry in the append-only ledger, and the history stays readable.

## Payment statuses

The `payment_status` dictionary (type `PaymentStatus`). Terminal ones are marked — in the response
they carry `is_final: true`, and the status will never change again:

| Status                 | Meaning                                                                               | Terminal |
| ---------------------- | ------------------------------------------------------------------------------------- | -------- |
| `check`                | invoice created, no payment seen yet                                                  | no       |
| `confirm_check`        | payment seen, waiting for network confirmations                                       | no       |
| `wrong_amount_waiting` | a **partial** payment was seen, the invoice is still live, waiting for the remainder  | **no**   |
| `paid`                 | paid in full (within tolerance)                                                       | yes      |
| `paid_over`            | overpaid; the excess goes to auto-refund if it is enabled and the network supports it | yes      |
| `wrong_amount`         | the invoice **closed** underpaid                                                      | yes      |
| `cancel`               | expired or cancelled                                                                  | yes      |
| `select`               | currency-agnostic invoice: the buyer hasn't picked a currency/network yet             | no       |

⚠ **`wrong_amount_waiting` ≠ `wrong_amount`** — the most common mix-up:

- `wrong_amount_waiting` — less money arrived, but the **invoice is not closed yet**: the buyer
  can still pay the rest. Calling `payments.resolve` here answers **`409 resolution.not_underpaid`** —
  that is expected behavior, not a failure. Do not resolve the underpayment in this status.
- `wrong_amount` — the invoice closed underpaid; no more money is coming. **Now** `resolve`
  works: `accept` (keep the partial payment) or `refund` (return it to the payer).

`wrong_amount_waiting` is a derived status: the gateway infers it from the amount already
received. It shows up in `payments.info` / `payments.history`, but **never in webhooks** — there
such an invoice arrives as `confirm_check`. Detect underpayment via `amount_paid` /
`amount_remaining`, or wait for the terminal `wrong_amount`.

Payout statuses (`PayoutStatus`): `check` (created, awaiting approval) → `process` (approved /
sending / sent) → `paid` (confirmed on the blockchain); plus `fail` and `cancel`.

## Verifying webhooks

The webhook signature differs from the request signature. The SDK handles both for you. For
incoming webhooks, take the **raw body** and the `X-Webhook-Timestamp` / `X-Webhook-Signature`
headers.

> ⚠ **The webhook secret is a SEPARATE secret** — the one returned by `client.webhooks.register()`
> (the `secret` field). It is **not equal** to the API key secret (`OBLODAI_SECRET`) that signs
> outgoing requests. Plug in the API key and **not a single** webhook will pass. Store it
> separately, e.g. in `OBLODAI_WEBHOOK_SECRET`.

```ts
import express from "express";
import { constructWebhookEvent, OblodaiSignatureError, type WebhookEvent } from "@oblodai-npm/sdk";

const app = express();
const WEBHOOK_SECRET = process.env.OBLODAI_WEBHOOK_SECRET!; // from client.webhooks.register()

// IMPORTANT: the raw body, not express.json()
app.post("/oblodai/callback", express.raw({ type: "*/*" }), (req, res) => {
  const raw = req.body as Buffer;

  // Test bodies (is_test) are not signed
  const maybe = JSON.parse(raw.toString("utf8"));
  if (maybe.is_test) return res.send("ok");

  try {
    const event = constructWebhookEvent<WebhookEvent>(WEBHOOK_SECRET, raw, {
      timestamp: req.get("X-Webhook-Timestamp")!,
      signature: req.get("X-Webhook-Signature")!,
    }); // verifies the signature AND freshness (replay protection, 5-minute window by default)

    if (event.type === "payment" && event.status === "paid") {
      // mark order event.order_id as paid (idempotent by uuid + status)
    }
    res.send("ok");
  } catch (e) {
    if (e instanceof OblodaiSignatureError) return res.status(403).send("bad signature");
    throw e;
  }
});
```

### Registering the URL: one endpoint per project (upsert)

```ts
const hook = await client.webhooks.register("https://example.com/oblodai/callback");
// hook.endpoint_id, hook.url, hook.secret — the webhook secret, save it
```

⚠ **`register()` is an upsert of the single endpoint, not "add another one".** A project can have
exactly **one** webhook endpoint. Calling it again with a **different** URL does not create a
second endpoint — it **redirects deliveries**: the **same** `endpoint_id` comes back, and the old
URL silently stops receiving anything. Fan-out to multiple URLs is not possible through the API:
receive events at one address and route them yourself.

When the URL changes, **the secret is preserved** — and that is a correctness requirement, not a
convenience: deliveries capture the secret at enqueue time, so a new secret on every URL change
would orphan everything already queued (the HMAC would no longer match → retries → dead-letter →
lost events). The secret is generated on the **first** registration; revoking a compromised secret
is a separate, deliberate action (rotation), not a repeated `register()`.

The delivery log is `client.webhooks.deliveries()` (up to 50, newest first).

## Error handling

All API errors are instances of `OblodaiApiError` with a machine-readable `.code`. Branch on the code.

```ts
import { OblodaiApiError } from "@oblodai-npm/sdk";

try {
  await client.payouts.create({
    amount: "25",
    currency: "USDT",
    network: "tron",
    address: "T...",
    order_id: "payout-1",
  });
} catch (e) {
  if (e instanceof OblodaiApiError) {
    if (e.code === "payout.insufficient_funds") {
      // not enough funds
    } else if (e.code === "payout.funds_maturing") {
      // funds are still maturing — a terminal error (e.isRetriable === false):
      // don't retry blindly, try again later
    }
    console.error(e.code, e.status, e.message);
  }
}
```

### Error classes

| Class                    | When                                                                          |
| ------------------------ | ----------------------------------------------------------------------------- |
| `OblodaiApiError`        | The API returned an `error` envelope. Has `.code`, `.status`, `.isRetriable`. |
| `OblodaiConnectionError` | The network is unreachable.                                                   |
| `OblodaiTimeoutError`    | The request timed out.                                                        |
| `OblodaiSignatureError`  | Webhook signature verification failed.                                        |
| `OblodaiError`           | Base class for all of the above.                                              |

## Retries

Transient errors (`5xx`, `429`, network failures) are retried automatically with exponential
backoff and jitter. Request errors (`4xx`) and business errors (including `payout.funds_maturing`)
are not retried. On `429` the SDK honors the server's `Retry-After` header (even when it exceeds
`maxDelayMs`; the ceiling is 5 minutes).

```ts
const client = new OblodaiClient({
  publicId: "...",
  secret: "...",
  retry: { maxAttempts: 4, initialDelayMs: 500, maxDelayMs: 30_000 },
  // retry: false — disable
});
```

> **Important note on timeouts.** A timeout does not mean the operation failed — but on most
> creating calls a retry is safe anyway.
> Since v1.1.0 every creating call goes out with an **`Idempotency-Key`** HTTP header: the SDK
> generates a UUID **once, before the retry loop**, so all internal retries carry the same key,
> and the backend returns the first attempt's result instead of a duplicate. You can pass your own
> key via the `idempotency_key` parameter (it goes into the header, not the body).
>
> ⚠ **Breaking change against v1.0.x:** the SDK **no longer injects** an automatic `order_id`
> (`idem-<uuid>`) into `payments.create` and `account.transferToPersonal` — `order_id` goes out
> exactly as you passed it. `order_id` is your business identifier for lookups via
> `payments.info`; it has ceased to be the idempotency key. For payouts, `order_id` is always
> required.
>
> The header applies to the creating endpoints (`/v1/payment`, `/v1/payment/refund`,
> `/v1/payment/resolve`, `/v1/payment/batch`, `/v1/refund/batch`, `/v1/payout`, `/v1/payout/mass`,
> `/v1/payout/batch`, `/v1/payout/link`, `/v1/payout/link/batch`, `/v1/transfer/to-personal`,
> and since v1.2.0 — `/v1/transfer/to-user` and `/v1/transfer/batch`).
>
> The header also applies to payout links: `/v1/payout/link` and `/v1/payout/link/batch` are
> wrapped in the idempotency middleware too. A retry with the same key replays the first response
> (same link, same `claim_token`, the response is marked `Idempotent-Replayed: true`), and the
> balance is reserved **exactly once** — which is why the SDK's usual auto-retry is enabled on
> these calls.
>
> Retry-specific codes on endpoints with idempotency:
>
> | Code                          | When                                                         | Retry?                          |
> | ----------------------------- | ------------------------------------------------------------ | ------------------------------- |
> | `400 idempotency.key_reused`  | same key with a DIFFERENT body                               | no (terminal)                   |
> | `400 idempotency.bad_key`     | key longer than 255 characters                               | no (terminal)                   |
> | `409 idempotency.in_progress` | a concurrent retry while the first is still running          | manually, a bit later, same key |
> | `503 idempotency.unavailable` | the idempotency store is unavailable (fail-closed by design) | yes, the SDK retries on its own |
>
> ⚠ **Without the header there is no protection**: two identical `payoutLinks.create` calls will
> create TWO links with two reserves. The SDK always sends the key, but if you hit the API
> without the SDK — send it yourself.
>
> ⚠ **Batches**: a partially failed batch is replayed AS IS — the failed items are not retried
> under the same key; resubmit them with a NEW key. And the gateway does not cache responses
> larger than 256 KB, so a retry of such a batch runs again — on batches, **set a per-item
> `reference`** (the second, durable deduplication layer: a repeat → `409 payoutlink.duplicate_reference`).
>
> `wallets.blockedAddressRefund` is deliberately NOT wrapped in the middleware and does not need
> it: the backend deduplicates it by the deterministic reference `refund-wallet:<wallet_id>` under
> an advisory lock — a repeat (including a concurrent one) returns THE SAME payout; a second one
> is never created. Auto-retry here is safe and enabled. Cosmetic detail: the address is not part
> of the reference, so a repeat with a different address returns the first payout to the first
> address.
>
> `payouts.approve` is a state transition, not a creation: only `pending` is accepted, otherwise
> `409 payout.not_pending`. A repeated approve cannot approve or move money twice; read that 409
> as "already approved" and check the status via `payouts.info`.

## New in v1.1.0

Requires an updated gateway (the `Idempotency-Key` header and the new endpoints).

### Bulk operations — up to 5000 items per request

One rate-limit tick instead of a thousand; processing happens in the background, progress via
`batches.info`:

```ts
const sub = await client.payments.createBatch(
  [
    { amount: "10", currency: "USD", order_id: "a-1", to_currency: "USDT", network: "tron" },
    { amount: "20", currency: "EUR", order_id: "a-2", to_currency: "USDT", network: "tron" },
  ],
  { onError: "continue" }, // 'continue' (default) or 'stop'
);
const info = await client.batches.info(sub.batch_id, { limit: 100 });
// info.status: pending → processing → completed; info.items[i].result / .error — per item
```

Likewise: `payments.refundBatch([...])` (`reference` and `uuid|order_id` are required on each
item) and `payouts.createBatch([...])` (`order_id` is required on each item).

### Payment links (donations) — many people pay, each payment gets its own invoice

```ts
const link = await client.paymentLinks.create({ amount_mode: "open", currency: "USD" }); // { link_id, url }
await client.paymentLinks.toggle(link.link_id, false); // disable
// Public (unsigned) — for the payer-facing page:
await client.paymentLinks.publicGet(link.link_id);
await client.paymentLinks.checkout(link.link_id, { amount: "5", payer_email: "a@b.c" }); // → a regular payment
```

> **Two names for one resource.** `client.paymentLinks` and `client.links` are **the same object**
> (`client.paymentLinks === client.links`), not two different handles. The canon across all
> Oblodai SDKs is `payment_links` in each language's idiom (`paymentLinks` in JS/TS and PHP,
> `payment_links` in Python and Rust, `PaymentLinks` in Go), so code written in one language ports
> to another without renames. The short `links` remains a **documented alias** and will not be
> removed. Don't confuse it with `payoutLinks` — those are payout links ("crypto-checks"), money
> flowing the opposite way.

### Split payments — a share of every payment goes to a partner

```ts
await client.splits.splitToAddress("T...", "tron", 10, "partner A"); // external address, irreversible
await client.splits.splitToMerchant("m-42", 5); // a platform account, reversible
await client.splits.setConfig(24); // refund_hold_hours retention window (refund protection)
```

### Invoice by e-mail and underpayment resolve

```ts
await client.payments.sendEmail({ uuid: payment.uuid, email: "buyer@example.com" });

// Underpayment: keep it or refund it (requires a payout key)
await client.payments.resolve({ uuid: payment.uuid, action: "accept" });
await client.payments.resolve({ uuid: payment.uuid, action: "refund" }); // defaults to the payer's address
```

⚠ **Only** the `wrong_amount` status resolves — an invoice that has already **closed** underpaid.
While the invoice is live and waiting for the remainder, it is in `wrong_amount_waiting`, and
`resolve` there answers `409 resolution.not_underpaid` (see [Payment statuses](#payment-statuses)).

### Payout links — "crypto-checks": a payout without knowing the recipient's wallet

```ts
const check = await client.payoutLinks.create({
  currency: "USDT",
  network: "tron",
  amount: "50",
  title: "Bonus",
  email: "user@example.com",
  expires_in_hours: 168, // set explicitly: with 0/absent, the window is clamped to 1 hour
});
// check.claim_url / check.claim_token — ONLY in this response, save them immediately.

// The recipient (public, unsigned):
const details = await client.payoutLinks.claimInfo(token); // { claimable, amount, ... }
await client.payoutLinks.claim(token, { address: "T..." }); // → { status: 'claimed', payout_id }

// Merchant: createBatch (up to 500), list, info, cancel (a funded link returns its reserve).
```

Payout link statuses: `funded → claiming → claimed | expired | cancelled`.

Create deduplication has two layers. First: the `Idempotency-Key` header (the SDK sends it itself;
your own — `idempotency_key`) — `/v1/payout/link` and `/v1/payout/link/batch` are wrapped in the
idempotency middleware; a retry replays the first response and reserves funds exactly once, so the
SDK's auto-retry works as usual on these calls. Second, durable: a per-link `reference` — unique
within the merchant; a repeat yields `409 payoutlink.duplicate_reference` (not a 500). It matters
where the cache can't help: **without the header** and on **batches with responses >256 KB** (such
a response is not cached, and a retry runs again). A partially failed batch is replayed as is —
resubmit the failed items with a NEW key.

## Transfers to platform users (v1.2.0)

An internal, **fee-free** transfer from the merchant balance to a platform user's personal wallet
(payout key, same signature as payouts). `to_user_id` is the **user's UUID, not a username** (the
backend rejects a non-UUID); username → user_id is resolved via the dashboard's public profile.

```ts
await client.account.transferToUser({
  to_user_id: "5c3f1c7e-9a44-4a5f-8d1a-2f6b7c8d9e0f", // platform user's UUID
  amount: "25",
  currency: "USDT",
  order_id: "bonus-1",
}); // → { currency, amount, to_user_id, recipient_balance }

// A "payroll" batch — processed in the background, progress via the EXISTING batches.info:
const sub = await client.account.transferBatch(
  [
    { to_user_id: "...", amount: "100", currency: "USDT", order_id: "salary-1" },
    { to_user_id: "...", amount: "150", currency: "USDT", order_id: "salary-2" },
  ],
  { onError: "continue" },
);
const info = await client.batches.info(sub.batch_id); // items[i].result — same as /v1/transfer/to-user
```

Idempotency is the same as for the other money-moving calls: the `Idempotency-Key` header (the SDK
generates it itself; your own — the `idempotency_key` parameter); on the backend, the ladder is
"header → `order_id` → signature".

## Custom checkout: the public `/v1/pay` (v1.2.0)

A pair of public (unsigned) methods from which you can assemble a **fully custom checkout**
instead of the hosted payment page: the payer-facing page renders and polls the invoice without
the merchant secret, and on a currency-agnostic invoice the payer picks the currency themselves —
`publicSelect` locks in the rate and allocates a deposit address.

```ts
// The payer-facing page (no secret needed):
const view = await client.payments.publicGet(payment.uuid); // GET /v1/pay/{id}
// view.payment_status === 'select' — the invoice awaits a currency choice, view.accepted — the available methods

const inv = await client.payments.publicSelect(payment.uuid, {
  currency: "USDT",
  network: "tron",
}); // POST /v1/pay/{id}/select → the finalized invoice: address, payer_amount, QR
```

Merchant-private fields (`additional_data`, `payer_email`, `payer_address`) are not returned in
the public view. A repeated select of an already selected invoice → `pay.not_selectable`.

⚠ **On a fresh merchant, `publicSelect` readily returns `pay.method_not_accepted` — that is
normal, not an integration bug.** The (`currency`, `network`) pair must be part of the accepted
set (`payments.setAccepted([...])`); when the set is **empty**, the default is the catalog of
methods with a **live deposit watcher**, and on a local setup with no RPCs connected it may be
empty entirely. Don't hardcode pairs into your checkout — render them from the `accepted` that
`publicGet` returns.

## Method overview

```ts
// Payments
client.payments.create(params)
client.payments.createBatch([...], { onError })   // v1.1.0
client.payments.refundBatch([...], { onError })   // v1.1.0
client.payments.sendEmail({ uuid, email })        // v1.1.0
client.payments.resolve({ uuid, action })         // v1.1.0
client.payments.info({ order_id })
client.payments.history({ limit, offset, status })
client.payments.services()
client.payments.qr({ order_id })
client.payments.resend({ order_id })
client.payments.refund({ order_id, amount })      // address is optional since v1.1.0
client.payments.setAccepted([...]) / listAccepted()
client.payments.setDiscount({...}) / listDiscounts()
client.payments.setAccuracy({...}) / getAccuracy()
client.payments.setAutorefund({...}) / getAutorefund()
client.payments.publicGet(uuid) / publicSelect(uuid, { currency, network }) // v1.2.0; public, unsigned

// Payouts
client.payouts.create(params)
client.payouts.createMass([...])
client.payouts.createBatch([...], { onError })    // v1.1.0
client.payouts.info({ order_id })
client.payouts.history({...})
client.payouts.services()
client.payouts.calculate({...})
client.payouts.approve(uuid)
client.payouts.refund({...})
client.payouts.getFeeConfig() / setFeeConfig(bool)
client.payouts.getRefundFeeConfig() / setRefundFeeConfig(bool)

// Batches (v1.1.0)
client.batches.info(batchId, { limit, offset })

// Payment links (v1.1.0). Canonical — client.paymentLinks; client.links is the same object (alias)
client.paymentLinks.create({ amount_mode, currency, ... })
client.paymentLinks.list({ limit, offset }) / info(linkId) / toggle(linkId, active)
client.paymentLinks.publicGet(linkId) / checkout(linkId, { amount })   // public, unsigned

// Splits (v1.1.0)
client.splits.splitToAddress(address, network, percent, note?)
client.splits.splitToMerchant(merchantId, percent, note?)
client.splits.createRule({...}) / listRules() / deleteRule(ruleId)
client.splits.getConfig() / setConfig(refundHoldHours)

// Payout links — crypto-checks (v1.1.0)
client.payoutLinks.create({ currency, network, amount, expires_in_hours })
client.payoutLinks.createBatch([...])  // up to 500
client.payoutLinks.list({ limit, offset }) / info(linkId) / cancel(linkId)
client.payoutLinks.claimInfo(token) / claim(token, { address })  // public, unsigned

// Wallets
client.wallets.create({ currency, network, order_id })
client.wallets.block({ address })
client.wallets.blockedAddressRefund({ uuid, address })
client.wallets.qr(address)

// Account
client.account.balance()
client.account.referral()
client.account.transferToPersonal({ amount, currency })
client.account.transferToUser({ to_user_id, amount, currency })   // v1.2.0; to_user_id is a UUID
client.account.transferBatch([...], { onError })                  // v1.2.0; poll via batches.info
client.account.vrcs(enabled?)

// Webhooks
client.webhooks.register(url)        // upsert of the project's SINGLE endpoint; the secret is separate
client.webhooks.deliveries()         // → Delivery[]; since v1.2.0 an array, not { deliveries }
client.webhooks.testPayment({ url_callback })

// Settings
client.settings.listAutoWithdraw() / setAutoWithdraw({...}) / deleteAutoWithdraw(currency)
client.settings.listAllowlist() / addAllowlist(cidr) / removeAllowlist(cidr) / enableAllowlist(bool)

// Rates (public, no key)
client.rates.list('ETH')

// Sandbox (v1.2.0; test key ONLY, test code only)
client.sandbox.simulateDeposit({ invoice_id, amount?, confirmations?, txid? })
client.sandbox.faucet({ asset, amount, idempotency_key? })
client.sandbox.reset()                 // cancels only invoices NOT being paid (check/select)
client.sandbox.listWebhooks()          // signed GET; → SandboxDelivery[]
client.sandbox.replayWebhook(deliveryId)
```

## Configuration

```ts
interface OblodaiConfig {
  publicId: string; // required
  secret: string; // required
  baseUrl?: string; // defaults to https://api.oblodai.com
  timeoutMs?: number; // defaults to 30000
  retry?: RetryOptions | false;
  fetch?: typeof fetch; // custom fetch
}
```

## Notes

- **Amounts are strings** in currency units (`"25.00"`), not numbers. That preserves precision.
- **Idempotency via the `Idempotency-Key` header** (since v1.1.0): the SDK sends it itself on all
  creating calls; your own key — the `idempotency_key` parameter. `order_id` is your business
  identifier (the SDK no longer injects it); for payouts it is always required.
  `payoutLinks.create` / `payoutLinks.createBatch` are also deduplicated by the gateway via the
  header — the second, durable layer for payout links is the per-link `reference`
  (`409 payoutlink.duplicate_reference` instead of a duplicate), especially important in batches,
  where a response >256 KB is not cached.
- **Two different secrets.** The API key secret (`OBLODAI_SECRET`) signs your **outgoing**
  requests; the endpoint secret from `webhooks.register()` verifies **incoming** webhooks. Mixing
  them up means rejecting 100% of webhooks.
- **One webhook endpoint per project.** `webhooks.register(url)` is an upsert: a repeat with a
  different URL redirects deliveries to the new address (same `endpoint_id`), the old one goes
  silent; the secret is preserved throughout.
- **List methods return arrays** — `webhooks.deliveries()`, `sandbox.listWebhooks()`,
  `payoutLinks.list()` unwrap the envelope themselves.
- **The secret stays on the server.** The SDK is server-side; do not embed the key in a
  browser/mobile app. The exception is the public methods (`rates.*`,
  `paymentLinks.publicGet/checkout`, `payoutLinks.claimInfo/claim`,
  `payments.publicGet/publicSelect`): they require no key at all.

## License

MIT
