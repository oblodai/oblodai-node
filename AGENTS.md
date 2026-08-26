# Oblodai Node SDK — guide for coding agents

Package `@oblodai-npm/sdk` (1.3.0). Everything below is verified against the gateway's contract snapshot
shipped in `contract/contract.json` (also importable as `@oblodai-npm/sdk/contract.json`).

## Non-negotiables

- Amounts are decimal **strings** (`Money`): `amount: "25"`, never `25`. Do not `parseFloat`; use
  `addAmounts` / `compareAmounts` from the package.
- Every method's **last** argument is `{ idempotencyKey?, signal?, timeoutMs?, deadlineMs? }`.
- Amount helpers refuse anything that is not `-?digits[.digits]` (≤ 64 chars) with
  `ConfigError` / `sdk.bad_amount`. Order amounts with `compareAmounts`, never with `<` or `sort()`.
- **One API key.** `publicId` + `secret` (or `OBLODAI_PUBLIC_ID` / `OBLODAI_SECRET`) sign every
  signed route — money in and money out alike. There is no payout credential and no per-call key
  choice. `ROUTES[key].auth` is `"key"` (signed), `"public"` (no credentials) or `"onboard"`
  (`adminToken`, the two `merchants.*` routes only).
- List methods return a `PagePromise`: `await` = one page (`{ items, paginate }`), `for await` = every
  item, `.all(max)` = array. It is a real Promise (`then/catch/finally`) and requests nothing until consumed.
- Idempotency keys are generated automatically on create routes and reused across retries. Passing
  `idempotencyKey` to a route the core does not deduplicate throws `sdk.idempotency_unsupported` —
  including on list methods, which refuse it immediately rather than dropping it.
- Retry safety is `ROUTES[key].safe`, the core's own read-only classification from the contract. The
  SDK never infers it from a path or a verb.
- Secrets (client, transport, credentials, `WebhookEndpoint.secret`, `WebhookSecretRotated.secret`,
  `ApiKeyPair.secret`, `PayoutLink.claim_token`/`claim_url`/`passcode`) read normally as properties and
  render as
  `[redacted]` in `JSON.stringify`, `console.log` and `util.inspect`.

## Naming

| intent            | call                                                                                                                              |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| fetch one         | `.info(uuid \| { order_id })` (alias `.get`)                                                                                      |
| fetch many        | `.history(params)` on payments/payouts (alias `.list`), `.list(params)` elsewhere                                                 |
| create            | `.create(params)`; webhooks: `.register(url)`                                                                                     |
| many, synchronous | `payouts.mass` ≤100, `payoutLinks.batch` ≤500 — per-element `{ idx, ok, result, message, error_code }`                            |
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
`InternalError` (other 5xx), `TransportError` (no response), `ConfigError` (before sending),
`ContractError` (undecodable or oversized answer), `SignatureError` (forged/stale webhook),
`WebhookPayloadError` (authentic webhook, unreadable body — `webhook.bad_payload`, NOT a signature
failure). Every one is exported from the package root. `JSON.stringify(err)` keeps `message` and
drops the raw body.

Codes worth handling: `payout.insufficient_funds` (retryable), `payout.funds_maturing` (retryable),
`idempotency.key_reused`, `invoice.not_payable`, `payment.not_found`, `merchant.bad_signature`,
`request.rate_limited`. Full list: `ERROR_CODES`. (`merchant.wrong_key_kind` is retired: it can only
reach a merchant still holding a pre-merge `oblodai_pk_`/`oblodai_wk_` pair.)

## Statuses

- Payment: `select → created → confirm_check → paid | paid_over | wrong_amount | expired | cancelled`.
  `isPaymentPaid` = paid/paid_over. `wrong_amount` needs `refunds.resolve({ uuid, action })`.
- Payout: `pending → approved → awaiting_cosign → broadcasting → sent → confirmed | failed | cancelled`.
- Webhook event types: `invoice.<status>`, `payout.<status>`, `wallet.paid`; body `type` is
  `"payment" | "payout" | "wallet"` (discriminated union `WebhookEvent`). A type from a newer core is
  returned verbatim as `UnknownWebhookEvent`, never thrown — narrow with `isKnownEvent(event)` before
  switching on `type`.

## Webhooks

```ts
import { verifyWebhookDelivery, isKnownEvent, isStaleEvent } from "@oblodai-npm/sdk/webhooks";
const { event, id, isTest } = verifyWebhookDelivery(rawBody, req.headers, { secret });
```

Order of checks: headers → HMAC (current then `previousSecret`) → freshness → body parse. An empty
`secret`/`previousSecret` or a negative `toleranceSec` is a `ConfigError`; `toleranceSec: 0` disables
the freshness check. Answer 4xx to `SignatureError`, 5xx to `WebhookPayloadError`.

Verify over the **raw** bytes. `verifyWebhookDelivery(...).isTest` is true for rehearsal deliveries (`test: true` in the signed body) — never treat them as money. Deduplicate on `id` (`X-Webhook-Id`); drop out-of-order events with
`isStaleEvent(event, lastSequence)`. During rotation pass `previousSecret` for ≥26 h.

## Machine-readable surface

`ROUTES` (107 routes: method, path, auth, idempotent, safe, bare, list), `RequestBodies` (typed
bodies per route), `ERROR_CODES` (469), `NETWORKS`, `PAYMENT_STATUSES`, `PAYOUT_STATUSES`,
`EVENT_TYPES`, `CONTRACT_CORE_COMMIT`/`CONTRACT_HASH`, and `contract/` in the repository (schemas,
golden response bodies per route, error samples, signed webhook samples). The published package
carries `contract.json` and `descriptions.en.json` only.

Environment (all six): `OBLODAI_PUBLIC_ID`, `OBLODAI_SECRET`, `OBLODAI_ADMIN_TOKEN`,
`OBLODAI_BASE_URL`, `OBLODAI_LOG`, `OBLODAI_ALLOW_INSECURE`.
