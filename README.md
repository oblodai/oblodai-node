# Oblodai Node.js SDK

Official TypeScript/Node.js client for the [Oblodai](https://oblodai.com) crypto payment gateway:
invoices, payouts, refunds, payout links, static wallets, webhooks, documents — the whole merchant API,
typed end to end and verified against the gateway's own contract snapshot.

- Node.js ≥ 18.17, ESM and CommonJS, zero runtime dependencies.
- Every route the gateway exposes has a method here; request/response types are generated from the gateway.
- Retries driven by the API's own `retryable` flag, automatic idempotency keys, clock-skew correction.
- `@oblodai-npm/sdk/webhooks`: signature verification that needs no client and no API key.
- Writing code with an AI agent? Point it at [AGENTS.md](AGENTS.md).

```bash
npm install @oblodai-npm/sdk
```

## Start in the sandbox

Get your keys in the Oblodai dashboard. A **sandbox key** (`test_…`) drives a chainless copy of the
gateway — fake balance from a faucet, simulated deposits, real webhooks — so integrate against it first.

```ts
import { Oblodai } from "@oblodai-npm/sdk";

const oblodai = new Oblodai({
  publicId: process.env.OBLODAI_PUBLIC_ID,
  secret: process.env.OBLODAI_SECRET,
});

const invoice = await oblodai.payments.create({
  amount: "25", // amounts are decimal strings, never floats
  currency: "USDT", // what you price in — a fiat (USD, EUR, …) or a crypto asset
  network: "tron", // omit to let the payer choose the network on the pay page
  order_id: "order-1001", // your reference; idempotent per order_id
  url_callback: "https://shop.example/oblodai/webhook",
});
console.log(invoice.url, invoice.address, invoice.status); // "created"
```

Prices in fiat: `{ amount: "25", currency: "USD", to_currency: "USDT" }` — `currency` is what you
charge, `to_currency` the asset the payer sends. See `examples/` (`npx tsx examples/sandbox.ts`).

### Two keys

The gateway issues a **payment key** (`pk_…`) and a **payout key** (`wk_…`). Sandbox keys are both at
once; live keys are separate, and money-out routes need the payout one: `payouts.*`, `refunds.*`,
`payoutLinks.*`, `transfers.*`, `splits.*`, `wallets.refundBlockedDeposit`, auto-withdraw, the IP
allow-list, `webhooks.rotateSecret`, `sandbox.faucet`/`reset`. Pass both pairs and the SDK picks the
right one per call:

```ts
new Oblodai({ publicId, secret, payoutPublicId, payoutSecret });
// or OBLODAI_PUBLIC_ID / OBLODAI_SECRET / OBLODAI_PAYOUT_PUBLIC_ID / OBLODAI_PAYOUT_SECRET
```

A call with the wrong kind is a 403 `merchant.wrong_key_kind`.

## Resources

| Namespace               | Methods                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payments`              | create · info/get · cancel · history/list · batch · qr · services · sendEmail · resend · publicView · select · publicQr                                                                     |
| `refunds`               | create · resolve · batch                                                                                                                                                                    |
| `payouts`               | create · validate · calculate · info/get · cancel · approve · history/list · mass · batch · services · get/setFeeConfig · get/setRefundFeeConfig                                            |
| `payoutLinks`           | create · info/get · list · cancel · batch · cheque · claimPreview · claim                                                                                                                   |
| `paymentLinks`          | create · info/get · list · toggle · publicView · checkout                                                                                                                                   |
| `batches` / `transfers` | info · toPersonal · toUser · batch                                                                                                                                                          |
| `wallets`               | create · qr · block · refundBlockedDeposit                                                                                                                                                  |
| `webhooks`              | register · rotateSecret · deliveries · test                                                                                                                                                 |
| `documents`             | statement · ledger · balanceCertificate · feeSchedule · splitReport · batchReport · linkReport · walletStatement · referralsReport · createJob · jobInfo · jobFile · download               |
| `splits`                | createRule · listRules · deleteRule · get/setConfig · get/setOptIn                                                                                                                          |
| `settings`              | setDiscount · listDiscounts · get/setAccuracy · get/setAutoRefund · listAccepted · setAccepted · get/setPaymentFeeConfig · list/set/deleteAutoWithdraw · list/add/remove/enableApiAllowlist |
| `account` / `catalog`   | balance · referral · vrcs · currencies · exchangeRates                                                                                                                                      |
| `sandbox`               | faucet · deposit · webhooks · replay · reset                                                                                                                                                |
| `merchants`             | create · createSandbox (provisioning; `adminToken` on a self-hosted gateway)                                                                                                                |

Every method takes an optional last argument `{ idempotencyKey, signal, timeoutMs, deadlineMs }`.
Lookups accept a bare uuid or an object: `payments.info("uuid")`, `payments.info({ order_id: "…" })`.

### Lists

List methods return a `PagePromise` — a real Promise that is also async-iterable. Nothing is
requested until you consume it.

```ts
const page = await oblodai.payments.history({ limit: 50 }); // { items, paginate: { total, per_page, offset, has_pages } }
for await (const payout of oblodai.payouts.history({ status: "confirmed" }))
  console.log(payout.uuid);
const refunds = await oblodai.payouts.history({ kind: "refund" }).all(1000);
```

### Statuses

- Payment: `select → created → confirm_check → paid | paid_over | wrong_amount | expired | cancelled`.
  `isPaymentPaid(status)` is true for `paid`/`paid_over`; `wrong_amount` (underpaid) waits for
  `refunds.resolve({ uuid, action: "accept" | "refund" })`; `isPaymentFinal` covers the rest.
- Payout: `pending → approved → awaiting_cosign → broadcasting → sent → confirmed | failed | cancelled`.

Prefer webhooks for state changes; poll `info` only as a fallback.

### Errors

Every failure is an `OblodaiError` carrying the API's error envelope: `code` (`payout.insufficient_funds`),
`httpStatus`, `retryable`, `retryAfter`, `requestId`, `field`. Subclasses for `instanceof`:
`ValidationError` (400), `AuthenticationError` (401), `PermissionError` (403), `NotFoundError` (404),
`ConflictError` / `IdempotencyConflictError` (409), `RateLimitError` (429), `UnavailableError` (503),
`TransportError` (no response), `ConfigError` (rejected before sending). Quote `requestId` to support.

```ts
import { OblodaiError } from "@oblodai-npm/sdk";
try {
  await oblodai.payouts.create(params);
} catch (err) {
  if (!(err instanceof OblodaiError)) throw err;
  switch (err.code) {
    case "payout.insufficient_funds": // retryable — the balance may still arrive
    case "payout.funds_maturing":
      return scheduleRetry(err.retryAfter ?? 60);
    default:
      throw err; // the SDK already retried what was safe to retry
  }
}
```

### Retries and idempotency

- Create-type routes get an `Idempotency-Key` automatically (one per logical call, reused on every
  retry), so a timeout can never produce a second payout. Pass your own key to make retries safe across
  restarts; on routes the gateway does not deduplicate the SDK refuses a key (`sdk.idempotency_unsupported`).
- An error is retried only when the API says `retryable: true`. Answers without an API envelope (a proxy
  502/503) and transport failures are retried only on read routes or keyed writes. `Retry-After` is honoured.
- `retry: { maxRetries, baseDelayMs, maxDelayMs, maxRetryAfterMs }`; `timeoutMs` per attempt, `deadlineMs` per call.

### Webhooks

```ts
import { verifyWebhookDelivery, isStaleEvent } from "@oblodai-npm/sdk/webhooks";

app.post("/oblodai/webhook", express.raw({ type: "*/*" }), (req, res) => {
  const { event, id } = verifyWebhookDelivery(req.body, req.headers, {
    secret: process.env.OBLODAI_WEBHOOK_SECRET!,
  });
  // event.type is "payment" | "payout" | "wallet" — a discriminated union
  if (event.type === "payment" && event.status === "paid") markOrderPaid(event.order_id);
  res.sendStatus(200);
});
```

Verify over the **raw** body. Rehearsal deliveries (`webhooks.test`, sandbox) are signed like live ones and carry `test: true` (and `X-Webhook-Test: true`) — check `isTest` and never act on them as if money moved. `id` (`X-Webhook-Id`) is stable across retries — use it to deduplicate;
`event.sequence` orders events (`isStaleEvent`). After `webhooks.rotateSecret` pass `previousSecret`
for at least 26 hours.

### Money helpers

`addAmounts`, `subtractAmounts`, `compareAmounts`, `isZeroAmount` — exact decimal arithmetic on the
string amounts the API uses. Never `parseFloat` a `Money`.

### Self-hosted or local gateway

`baseUrl: "http://localhost:8093"` works out of the box; other plain-http hosts need
`allowInsecureBaseUrl: true` (or `OBLODAI_ALLOW_INSECURE=1`). A path prefix in `baseUrl` is kept.

## The contract snapshot

`contract/` is exported by the gateway's own test suite: the route registry, request DTO schemas with
English field docs, enums, every error code, signing vectors, golden response bodies recorded from a
live gateway and real signed webhook deliveries. `src/contract/` is generated from it
(`npm run codegen`); `npm run check-drift` fails when they disagree; `npm test` checks every model
against the golden bodies. It ships in the package: `import contract from "@oblodai-npm/sdk/contract.json"`.

`npm run test:live` runs the journey against a real gateway at `OBLODAI_LIVE_URL`.

## Development

```bash
npm install
npm run ci          # fmt:check + check-drift + typecheck (src + examples) + build + test
npm run codegen     # after refreshing contract/ (scripts/contract-pull.sh <core checkout>)
```

License: MIT.
