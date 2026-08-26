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

Every method takes an optional last argument
`{ idempotencyKey, signal, timeoutMs, deadlineMs, preferPayoutKey }`. Lookups accept a bare uuid or an
object: `payments.info("uuid")`, `payments.info({ order_id: "…" })`. Synchronous batches are capped
per call — `payouts.mass` at 100 elements, `payoutLinks.batch` at 500 — and report each element
separately (`{ idx, ok, result, message, error_code }`), so a 200 can still contain failures.
Asynchronous batches (`payments.batch`, `payouts.batch`, `refunds.batch`, `transfers.batch`) take up
to 5000 and are polled with `batches.info`.

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
`InternalError` (other 5xx), `TransportError` (no response), `ConfigError` (rejected before sending —
bad options, a header the SDK will not send, an idempotency key on a route the gateway does not
deduplicate, an amount that is not a decimal string), `ContractError` (the answer is not the
documented envelope, or is too large to buffer), `SignatureError` and `WebhookPayloadError` (webhook
verification). All of them are exported from the package root. Quote `requestId` to support.

`err.synthetic` is true when the answer carried no gateway envelope — a proxy or load balancer
replied, not the API. Types with the wrong shape never leak through: a non-boolean `retryable`, a
numeric `code` or a nonsense `retry_after` fall back to what the HTTP status alone justifies.

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
- "Read route" is not a guess: `ROUTES[key].safe` is the gateway's own hand-written classification,
  exported in `contract/contract.json`. The SDK never infers retry safety from a path or a verb.
- `retry: { maxRetries, baseDelayMs, maxDelayMs, maxRetryAfterMs }`; `timeoutMs` per attempt, `deadlineMs` per call.

### Webhooks

```ts
import { verifyWebhookDelivery, isKnownEvent, isStaleEvent } from "@oblodai-npm/sdk/webhooks";

app.post("/oblodai/webhook", express.raw({ type: "*/*" }), (req, res) => {
  const { event, id, isTest } = verifyWebhookDelivery(req.body, req.headers, {
    secret: process.env.OBLODAI_WEBHOOK_SECRET!,
  });
  if (!isKnownEvent(event)) return res.sendStatus(200); // a type from a newer gateway
  // narrowed: event.type is "payment" | "payout" | "wallet"
  if (event.type === "payment" && event.status === "paid") markOrderPaid(event.order_id);
  res.sendStatus(200);
});
```

Verify over the **raw** body. The checks run in a fixed order — headers, then the HMAC, then
freshness, then the body — so the freshness window is never an oracle for an unauthenticated caller.
An empty `secret` (or an empty `previousSecret`) is a `ConfigError`, never a verification with the
empty key. `toleranceSec` defaults to 300 and `0` disables the freshness check.

Rehearsal deliveries (`webhooks.test`, sandbox) are signed like live ones and carry `test: true`
(and `X-Webhook-Test: true`) — check `isTest` and never act on them as if money moved. `id`
(`X-Webhook-Id`) is stable across retries — use it to deduplicate; `event.sequence` orders events
(`isStaleEvent`, which returns false rather than throwing when there is no usable sequence). After
`webhooks.rotateSecret` pass `previousSecret` for at least 26 hours.

Two failure kinds, two answers: a `SignatureError` (`webhook.bad_signature`,
`webhook.stale_timestamp`, `webhook.missing_header`) is a forged or replayed delivery — answer 4xx.
A `WebhookPayloadError` (`webhook.bad_payload`) is an **authentic** delivery whose body could not be
read — answer 5xx so it is retried, and look at it.

### Money helpers

`addAmounts`, `subtractAmounts`, `compareAmounts`, `amountEquals`, `isZeroAmount`, `isValidAmount` —
exact decimal arithmetic on the string amounts the API uses. Never `parseFloat` a `Money`, and never
order one with `<`, `sort()` or `Math.max`: `Money` is a `string`, so `"9" < "10"` compiles and is
wrong. Use `compareAmounts`. An input that is not `-?digits[.digits]` (≤ 64 characters) raises
`ConfigError` with code `sdk.bad_amount` — never a native `TypeError`.

### Secrets never print

The client, its transport, the resolved credentials and every secret-bearing result — a webhook
`secret`, a freshly minted key pair, a payout link's `claim_token`/`claim_url`/`passcode` — render as
`[redacted]` in `JSON.stringify` and `console.log`/`util.inspect`, at any depth. The values are still
readable as properties (`endpoint.secret` works); only the automatic renderings are scrubbed. A
logger you inject through `logger:` receives fields that were redacted before they reached it.

### Self-hosted or local gateway

`baseUrl: "http://localhost:8093"` works out of the box; other plain-http hosts need
`allowInsecureBaseUrl: true` (or `OBLODAI_ALLOW_INSECURE=1`). A path prefix in `baseUrl` is kept.
Merchant provisioning (`merchants.create`, `merchants.createSandbox`) is unsigned and gated by the
gateway's admin token: `adminToken:` or `OBLODAI_ADMIN_TOKEN`. It is sent as `X-Admin-Token` on those
two routes and on nothing else.

Environment variables the SDK reads: `OBLODAI_PUBLIC_ID`, `OBLODAI_SECRET`,
`OBLODAI_PAYOUT_PUBLIC_ID`, `OBLODAI_PAYOUT_SECRET`, `OBLODAI_BASE_URL`, `OBLODAI_ADMIN_TOKEN`,
`OBLODAI_ALLOW_INSECURE`, `OBLODAI_LOG` (`debug|info|warn|error`).

Headers you add with `headers:` travel on every request, except the ones the SDK owns (`Accept`,
`Content-Type`, `User-Agent`, `X-Public-Id`, `X-Signature`, `X-Timestamp`, `Idempotency-Key`,
`X-Admin-Token`, matched case-insensitively) — those always win. A header value with a CR/LF or a
non-ASCII character is a `ConfigError`. Redirects are never followed.

## The contract snapshot

`contract/` is exported by the gateway's own test suite: the route registry (107 merchant routes,
each with its `auth`, `idempotent`, `safe`, `bare` and `list` flags), request DTO schemas with English
field docs, enums, every error code (471), signing vectors, golden response bodies recorded from a
live gateway and real signed webhook deliveries. `src/contract/` is generated from it
(`npm run codegen`); `npm run check-drift` fails when they disagree; `npm test` checks every model
against the golden bodies and every route flag against the contract. `contract.json` ships in the
package:

```ts
import contract from "@oblodai-npm/sdk/contract.json" with { type: "json" };
// or, without an import attribute:
import { ROUTES, ERROR_CODES, CONTRACT_CORE_COMMIT } from "@oblodai-npm/sdk";
```

The golden fixtures and webhook samples live in the repository, not in the published tarball.

`npm run test:live` runs the journey against a real gateway at `OBLODAI_LIVE_URL`.

## Development

```bash
npm install
npm run ci          # fmt:check + check-drift + typecheck (src + examples) + build + test
npm run codegen     # after refreshing contract/ (scripts/contract-pull.sh <core checkout>)
```

License: MIT.
