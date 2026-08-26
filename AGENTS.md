# Oblodai Node SDK — guide for coding agents

Package `@oblodai-npm/sdk` (1.3). Everything below is verified against the gateway's contract snapshot
shipped in `contract/contract.json` (also importable as `@oblodai-npm/sdk/contract.json`).

## Non-negotiables

- Amounts are decimal **strings** (`Money`): `amount: "25"`, never `25`. Do not `parseFloat`; use
  `addAmounts` / `compareAmounts` from the package.
- Every method's **last** argument is `{ idempotencyKey?, signal?, timeoutMs?, deadlineMs?, preferPayoutKey? }`.
- Two key kinds. The **payout key** is required for: `payouts.*`, `refunds.*`, `payoutLinks.*`,
  `transfers.*`, `splits.*`, `wallets.refundBlockedDeposit`, `settings.*AutoWithdraw`,
  `settings.*ApiAllowlist`, `webhooks.rotateSecret`, `webhooks.test("payout")`, `sandbox.faucet`,
  `sandbox.reset`. Configure it with `payoutPublicId`/`payoutSecret` (or `OBLODAI_PAYOUT_*`); a wrong
  kind is a 403 `merchant.wrong_key_kind`.
- List methods return a `PagePromise`: `await` = one page (`{ items, paginate }`), `for await` = every
  item, `.all(max)` = array. It is a real Promise (`then/catch/finally`) and requests nothing until consumed.
- Idempotency keys are generated automatically on create routes and reused across retries. Passing
  `idempotencyKey` to a route the core does not deduplicate throws `sdk.idempotency_unsupported`.

## Naming

| intent            | call                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| fetch one         | `.info(uuid \| { order_id })` (alias `.get`)                                                                                      |
| fetch many        | `.history(params)` on payments/payouts (alias `.list`), `.list(params)` elsewhere                                                 |
| create            | `.create(params)`; webhooks: `.register(url)`                                                                                     |
| many, synchronous | `payouts.mass`, `payoutLinks.batch` — ≤100, per-element `{ idx, ok, result, message }`                                            |
| many, async       | `payments.batch`, `payouts.batch`, `refunds.batch`, `transfers.batch` — ≤5000, poll `batches.info`                                |
| documents         | `documents.*Report / statement / feeSchedule / balanceCertificate` → `FileResult { bytes, contentType, filename }`                |
| provisioning      | `merchants.create({ email, name })`, `merchants.createSandbox(merchantId)` — no HMAC; `adminToken` option on self-hosted gateways |
| payer-facing      | `payments.publicView/select/publicQr`, `paymentLinks.publicView/checkout`, `payoutLinks.claimPreview/claim` — no credentials      |

## Errors

`catch (err)` → `OblodaiError` with `code` (`family.reason`, typed as `ErrorCode | string`),
`httpStatus`, `retryable` (authoritative — the SDK already retried what it should), `retryAfter`,
`requestId` (quote to support), `field` (400s), `synthetic` (answer came from a proxy, not the API).
Subclasses: `ValidationError` 400, `AuthenticationError` 401, `PermissionError` 403, `NotFoundError` 404,
`ConflictError`/`IdempotencyConflictError` 409, `RateLimitError` 429, `UnavailableError` 503,
`TransportError` (no response), `ConfigError` (before sending), `SignatureError` (webhooks).
`JSON.stringify(err)` keeps `message` and drops the raw body.

Codes worth handling: `payout.insufficient_funds` (retryable), `payout.funds_maturing` (retryable),
`idempotency.key_reused`, `invoice.not_payable`, `payment.not_found`, `merchant.wrong_key_kind`,
`merchant.bad_signature`, `request.rate_limited`. Full list: `ERROR_CODES`.

## Statuses

- Payment: `select → created → confirm_check → paid | paid_over | wrong_amount | expired | cancelled`.
  `isPaymentPaid` = paid/paid_over. `wrong_amount` needs `refunds.resolve({ uuid, action })`.
- Payout: `pending → approved → awaiting_cosign → broadcasting → sent → confirmed | failed | cancelled`.
- Webhook event types: `invoice.<status>`, `payout.<status>`, `wallet.paid`; body `type` is
  `"payment" | "payout" | "wallet"` (discriminated union `WebhookEvent`).

## Webhooks

```ts
import { verifyWebhookDelivery, isStaleEvent } from "@oblodai-npm/sdk/webhooks";
const { event, id } = verifyWebhookDelivery(rawBody, req.headers, { secret });
```

Verify over the **raw** bytes. `verifyWebhookDelivery(...).isTest` is true for rehearsal deliveries (`test: true` in the signed body) — never treat them as money. Deduplicate on `id` (`X-Webhook-Id`); drop out-of-order events with
`isStaleEvent(event, lastSequence)`. During rotation pass `previousSecret` for ≥26 h.

## Machine-readable surface

`ROUTES` (105 routes: path, auth, idempotent, safe, bare, list), `RequestBodies` (typed bodies per
route), `ERROR_CODES`, `NETWORKS`, `PAYMENT_STATUSES`, `PAYOUT_STATUSES`, `EVENT_TYPES`, and
`contract/` (schemas, golden response bodies per route, error samples, signed webhook samples).
