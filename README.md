# Oblodai Node.js SDK

Official TypeScript/Node.js client for the [Oblodai](https://oblodai.com) crypto payment gateway:
invoices, payouts, refunds, payout links, static wallets, webhooks, documents — the whole merchant API,
typed end to end and verified against the gateway's own contract snapshot.

- Node.js ≥ 18.17, ESM and CommonJS, zero runtime dependencies.
- Every route the core exposes has a method here; request/response types are generated from the core.
- Retries driven by the API's own `retryable` flag, automatic idempotency keys, clock-skew correction.
- `@oblodai-npm/sdk/webhooks`: signature verification that needs no client and no API key.

```bash
npm install @oblodai-npm/sdk
```

## Quick start

```ts
import { Oblodai } from "@oblodai-npm/sdk";

const oblodai = new Oblodai({
  publicId: process.env.OBLODAI_PUBLIC_ID,
  secret: process.env.OBLODAI_SECRET,
});

const invoice = await oblodai.payments.create({
  amount: "25",
  currency: "USDT",
  network: "tron",
  order_id: "order-1001",
  url_callback: "https://shop.example/oblodai/webhook",
});
console.log(invoice.url, invoice.address, invoice.status); // "created"
```

Credentials also come from `OBLODAI_PUBLIC_ID` / `OBLODAI_SECRET` (and `OBLODAI_PAYOUT_PUBLIC_ID` /
`OBLODAI_PAYOUT_SECRET` when you keep a separate payout key). `OBLODAI_BASE_URL` overrides the API origin.

## Resources

| Namespace               | Routes                                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `payments`              | create · info · cancel · history · batch · qr · services · sendEmail · resend · publicView · select · publicQr       |
| `refunds`               | create · resolve · batch                                                                                             |
| `payouts`               | create · validate · calculate · info · cancel · approve · history · mass · batch · services · fee configs            |
| `payoutLinks`           | create · info · list · cancel · batch · cheque · claimPreview · claim                                                |
| `paymentLinks`          | create · info · list · toggle · publicView · checkout                                                                |
| `batches` / `transfers` | info · toPersonal · toUser · batch                                                                                   |
| `wallets`               | create · qr · block · refundBlocked                                                                                  |
| `webhooks`              | register · rotateSecret · deliveries · test · testLegacy                                                             |
| `documents`             | statement · balance · fees · ledger · split · batch · link · walletStatement · referrals · jobs                      |
| `splits` / `settings`   | rules, config, opt-in · discounts, accuracy, auto-refund, accepted methods, fee config, auto-withdraw, IP allow-list |
| `account` / `catalog`   | balance · referral · vrcs · currencies · exchangeRates                                                               |
| `sandbox`               | faucet · deposit · webhooks · replay · reset                                                                         |

Every method takes an optional last argument `{ idempotencyKey, signal, timeoutMs }`.

### Lists

List methods return a `PagePromise`: `await` it for one page, `for await` it for every item.

```ts
const page = await oblodai.payments.history({ limit: 50 }); // { items, paginate: { total, per_page, offset, has_pages } }
for await (const payout of oblodai.payouts.history({ status: "confirmed" }))
  console.log(payout.uuid);
const all = await oblodai.payoutLinks.list().all(1000);
```

### Errors

Every failure is an `OblodaiError` carrying the API's error envelope: `code` (`payout.insufficient_funds`),
`httpStatus`, `retryable`, `retryAfter`, `requestId`, `field`. Subclasses exist for `instanceof`:
`ValidationError` (400), `AuthenticationError` (401), `PermissionError` (403), `NotFoundError` (404),
`ConflictError` / `IdempotencyConflictError` (409), `RateLimitError` (429), `UnavailableError` (503),
`TransportError` (no response). Quote `requestId` when contacting support.

```ts
import { OblodaiError, RateLimitError } from "@oblodai-npm/sdk";
try {
  await oblodai.payouts.create({ ... });
} catch (err) {
  if (err instanceof RateLimitError) await sleep(err.retryAfter! * 1000);
  else if (err instanceof OblodaiError && err.retryable) queueForLater();
  else throw err;
}
```

### Retries and idempotency

- Create-type routes get an `Idempotency-Key` automatically (one per logical call, reused on every retry),
  so a timeout can never produce a second payout. Pass your own key to make retries safe across restarts.
- Errors are retried only when the API says `retryable: true`; transport failures only on read routes or
  keyed writes. `Retry-After` is honoured. Configure with `retry: { maxRetries, baseDelayMs, maxDelayMs }`.

### Webhooks

```ts
import { verifyWebhook, isStaleEvent } from "@oblodai-npm/sdk/webhooks";

app.post("/oblodai/webhook", express.raw({ type: "*/*" }), (req, res) => {
  const event = verifyWebhook(req.body, req.headers, {
    secret: process.env.OBLODAI_WEBHOOK_SECRET!,
  });
  // event.type is "payment" | "payout" | "wallet"; the union is discriminated
  if (event.type === "payment" && event.status === "paid") markOrderPaid(event.order_id);
  res.sendStatus(200);
});
```

Verify over the **raw** body. Deliveries carry `X-Webhook-Id` (stable across retries — use it as your
idempotency key) and `sequence` (skip anything not newer than the last one you processed: `isStaleEvent`).
During a secret rotation pass `previousSecret` until `previous_secret_valid_until`.

### Sandbox

Sandbox keys (`test_…`) drive a chainless copy of the gateway: `sandbox.faucet` mints balance,
`sandbox.deposit` simulates an on-chain payment, `sandbox.webhooks` lists deliveries with payloads.
For a local core use `baseUrl: "http://localhost:8093"` (plain http is allowed for localhost).

## The contract snapshot

`contract/` is exported by the gateway's own test suite (`TestSDKContract_Export`): the route registry,
request DTO schemas, enums, every error code, signing vectors, golden response bodies recorded from a
live core and real signed webhook deliveries. `src/contract/` is generated from it (`npm run codegen`)
and `npm run check-drift` fails when the two disagree; `npm test` checks every model against the golden
bodies. A field cannot change on the wire without this repository turning red.

`npm run test:live` runs the journey against a real core at `OBLODAI_LIVE_URL`.

## Development

```bash
npm install
npm run ci          # fmt:check + check-drift + typecheck + build + test
npm run codegen     # after refreshing contract/ (scripts/contract-pull.sh <core checkout>)
```

License: MIT.
