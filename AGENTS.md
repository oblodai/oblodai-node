# Oblodai Node SDK — guide for coding agents

Package `@oblodai-npm/sdk` (2.0.0), Node.js ≥ 20, ESM + CJS. Resources, models, enums and the route
table are generated from the gateway's OpenAPI contract (`src/generated/`, never edited by hand);
everything below holds for every method.

## Non-negotiables

- Call shape: `client.<resource>.<method>(pathParams..., params, options)`. `params` is the request
  body as one object with the wire's `snake_case` names (types: `PaymentRequest`, `PayoutRequest`,
  …); GET query parameters go inside `params` too. `options` is `RequestOptions`:
  `{ idempotencyKey?, timeout? (seconds), maxRetries?, extraHeaders?, requestId?, signal? }`.
- Amounts are decimal **strings**: `amount: "25"`, never `25`. A fractional number in a body throws
  `ConfigError` `sdk.float_amount` before sending. Use `addAmounts` / `compareAmounts` /
  `amountEquals`; never `parseFloat`, `<` or `sort()` on amounts.
- **One API key.** `publicId` + `secret` (or `OBLODAI_PUBLIC_ID` / `OBLODAI_SECRET`) sign every
  signed route. `ROUTES.<operationId>.auth` is `"key"`, `"public"` (no credentials: `checkout.*`,
  `account.listExchangeRates`, `payoutLinks.getPayoutClaim/claimPayout`, `documents.getSigned`) or
  `"onboard"` (`adminToken`, `sandbox.onboardStore` only).
- Idempotency keys are automatic where the gateway deduplicates (`ROUTES.x.idempotent`) and reused on
  every retry. `idempotencyKey` on any other route throws `sdk.idempotency_unsupported` — except
  `sandbox.faucet`, whose own `idempotency_key` body field the option fills.
- Retry safety is `ROUTES.x.safe`, the contract's `x-retry-safe`. Never infer it.
- Timeouts are seconds (`timeout`, `deadline`); retry backoff knobs stay in ms.

## Naming

Method = OpenAPI `operationId` without the resource name, camelCase; pinned in `names.lock`.

| intent       | call                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| fetch one    | `payments.getInfo({ uuid } \| { order_id })`, `payouts.getInfo(...)`, `paymentLinks.get(...)`              |
| fetch many   | `payments.listHistory(params)`, `payouts.listHistory(params)`, `*.list(params)` → `Page`                   |
| create       | `payments.create`, `payouts.create`, `paymentLinks.create`, `webhooks.register({ url })`                   |
| bulk, sync   | `payouts.createMass` ≤100, `payoutLinks.createBatch` ≤500 — per-element results                            |
| bulk, async  | `batches.createPayment/createPayout/createRefund`, `payouts.createTransferBatch` → `.wait()`               |
| documents    | `documents.get*` → `FileResult { content, contentType, filename }`; `createJob` → `.wait()`, `.download()` |
| payer-facing | `checkout.get/selectMethod/getQr/getPublicPaymentLink/paymentLink/listCurrencies`                          |
| sandbox      | `sandbox.faucet/simulateDeposit/listWebhooks/replayWebhook/reset`                                          |

## Lists

A list method returns `Page<T>` (lazy): `await page` → first `PageResult` (`items`, `paginate`,
`total`, `hasPages`); `for await (const x of page)` → every item; `page.byPage()` → every page;
`page.all(max)` → array. `idempotencyKey` on a list throws.

## Errors

`catch (err)` → `OblodaiError`: `code` (`family.reason`, typed `ErrorCode | string`), `httpStatus`,
`retryable` (authoritative — the SDK already retried what it safely could), `retryAfter`,
`requestId`, `field`, `synthetic`. `String(err)` = `[code] message (request_id=…)`. Subclasses:
`ValidationError` 400, `AuthenticationError` 401, `PermissionError` 403, `NotFoundError` 404,
`ConflictError`/`IdempotencyConflictError` 409, `RateLimitError` 429, `UnavailableError` 503,
`InternalError`, `TransportError` (no response: `transport.timeout|network|aborted|deadline`),
`ConfigError` (before sending), `ContractError`, `SignatureError`, `WebhookPayloadError`.

## Extras

- `resource.withRawResponse.<method>(...)` → `RawAPIResponse` (`status`, `headers`, `requestId`,
  `parse()`); `client.withOptions({ timeout, maxRetries, extraHeaders })`;
  `resource.withOptions(options)`; `hooks: { onRequest, onResponse }` in the client options.
- Statuses: payment `select → created → confirm_check → paid | paid_over | wrong_amount | expired |
cancelled` (`isPaymentPaid`, `isPaymentFinal`; `wrong_amount` → `payments.resolve`); payout
  `pending → approved → awaiting_cosign → broadcasting → sent → confirmed | failed | cancelled`.

## Webhooks

```ts
import { verifyWebhookDelivery, isKnownEvent, isStaleEvent } from "@oblodai-npm/sdk/webhooks";
const { event, id, isTest } = verifyWebhookDelivery(rawBody, req.headers, { secret });
```

Verify over the raw bytes. Order of checks: headers → HMAC (current, then `previousSecret`) →
freshness (`toleranceSec`, default 300) → body. Deduplicate on `id`, order by `event.sequence`
(`isStaleEvent`), skip `isTest` rehearsals, narrow with `isKnownEvent(event)` before switching on
`event.type` (`payment | payout | wallet | conversion`). Answer 4xx to `SignatureError`, 5xx to
`WebhookPayloadError`.
