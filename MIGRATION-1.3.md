# Migrating to 1.3

1.3 is a rewrite. The 1.x line signed requests with a four-field recipe the gateway no longer accepts
(every call has returned 401 since the five-field recipe shipped), and its models described an earlier
vocabulary. 1.3 is generated from the gateway's contract snapshot and verified against it.

## Signing (automatic)

Nothing to do — the SDK signs `ts \n METHOD \n path+query \n Idempotency-Key \n body`. If you
computed signatures yourself, use `signRequest` from the package instead.

## Renamed and reshaped

| 1.x                                              | 1.3                                                                                                                  |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `payment.payment_status`                         | `payment.status` (`created`, `confirm_check`, `paid`, `paid_over`, `wrong_amount`, `expired`, `cancelled`, `select`) |
| payout statuses `check/process/paid/fail/cancel` | `pending/approved/awaiting_cosign/broadcasting/sent/confirmed/failed/cancelled`                                      |
| `paginate.count`                                 | `paginate.total`, plus `has_pages`                                                                                   |
| `webhooks.deliveries()` → `{deliveries}`         | `PagePromise<WebhookDelivery>` (`items` + `paginate`)                                                                |
| `payoutLinks.list()` → `{links}`                 | `PagePromise<PayoutLink>`                                                                                            |
| `calculate` → `to_amount`, `merchant_amount`     | `PayoutCalculation`: `amount`, `commission`, `payer_amount`, `fee_bearer`, `fee_type` (nullable when unpriceable)    |
| batch items `{status, error}` / `{success}`      | `BatchElement`: `{idx, ok, order_id, result, message, error_code, http_status}`                                      |
| payout link `expires_in_hours`                   | `expires_in_seconds`; new: `passcode`, `fee_bearer`, `title`, `note`                                                 |
| payment link `amount_min/amount_max/expires_in`  | `min_amount/max_amount/expires_in_seconds`                                                                           |
| split `refund_hold_hours`                        | `refund_hold_seconds`                                                                                                |
| auto-withdraw `min`                              | `min_amount`                                                                                                         |
| `resend` → `{result}`, replay → `{requeued}`     | `{ ok }`                                                                                                             |
| `OblodaiError { code, message }`                 | adds `httpStatus`, `retryable`, `retryAfter`, `requestId`, `field`; subclasses per status                            |
| `client.rates.currencies()`                      | `client.catalog.currencies()` / `client.catalog.exchangeRates()`                                                     |
| `client.links.*`                                 | `client.paymentLinks.*`                                                                                              |
| `client.idempotency.*`                           | pass `{ idempotencyKey }` as the last argument of any method                                                         |

## Renamed in the review pass

`documents.get/balance/fees/batch/link/split/referrals` → `download/balanceCertificate/feeSchedule/batchReport/linkReport/splitReport/referralsReport`; `wallets.refundBlocked` → `refundBlockedDeposit`; `settings.getApiAllowlist` → `listApiAllowlist`; `Resolution.resolution` is `"accepted" | "refunded"`.

## New

`payments.cancel`, `payouts.cancel`, `payouts.validate`, `payments.batch`, `refunds.resolve`,
`settings.*FeeConfig`, `splits.setOptIn`, `webhooks.rotateSecret`, `payoutLinks.cheque`, the whole
`documents` namespace, payer-facing `publicView/select/publicQr/checkout/claim`, `PagePromise`
iteration, `verifyWebhook` with rotation support, `isStaleEvent`, money helpers.

## Webhooks

`verifyWebhook(rawBody, headers, { secret })` replaces the previous verifier; it also accepts
`previousSecret` during rotations and rejects stale timestamps (±300 s) by default. `toleranceSec: 0`
disables the freshness check; a negative one is a `ConfigError`, and so is an empty `secret` or an
empty `previousSecret` (the old code would have verified with the empty key).

Three changes need a look at your handler:

1. **A type your SDK release does not know no longer throws.** `verifyWebhook` / `parseWebhook`
   return `AnyWebhookEvent`, which is the modelled union plus `UnknownWebhookEvent`. Narrow first:

   ```ts
   const { event, isTest } = verifyWebhookDelivery(raw, req.headers, { secret });
   if (!isKnownEvent(event)) return res.sendStatus(200); // log it; a newer gateway sent it
   if (event.type === "payment" && event.status === "paid") markPaid(event.order_id);
   ```

   Without the `isKnownEvent` guard, `event.type === "payment"` still compiles but the per-kind
   fields come back as `unknown`.

2. **An authentic delivery with an unreadable body is no longer a signature error.** It is a
   `WebhookPayloadError` (`webhook.bad_payload`). If you answer 401/400 to `SignatureError`, keep
   doing that — but answer 5xx to `WebhookPayloadError` so the gateway retries it:

   ```ts
   if (err instanceof SignatureError) return res.status(400).send(err.code); // forged or stale
   if (err instanceof WebhookPayloadError) return res.status(500).send(err.code); // authentic, unreadable
   ```

3. **`isStaleEvent` never throws.** An event with no usable integer `sequence` is reported as not
   stale, rather than raising.

`verifyWebhookDelivery(...).isTest` is true for rehearsal deliveries (`webhooks.test`, sandbox).
They are signed exactly like live ones, so a handler that does not check it will act on money that
never moved.

## Merchant provisioning and the admin token

`client.merchants.create({ email, name })` and `client.merchants.createSandbox(merchantId)` mint
merchants and their one API key (`api_key`; the response carries no other key). These two routes are not HMAC-signed; a self-hosted gateway gates them
with its admin token, passed as `adminToken:` or `OBLODAI_ADMIN_TOKEN` and sent as `X-Admin-Token` on
those routes only. A caller `X-Admin-Token` in `headers:` is dropped, so it can never ride along on a
signed merchant route.

## Secrets are redacted in JSON and in logs

The client, its transport, the resolved credentials and every secret-bearing result render as
`[redacted]`:

| object                                  | redacted field(s)                      |
| --------------------------------------- | -------------------------------------- |
| `Oblodai` / `Transport` / `Credentials` | the API secrets, admin token           |
| `webhooks.register` / `rotateSecret`    | `secret`                               |
| `merchants.create` / `createSandbox`    | `api_key.secret`                       |
| `payoutLinks.create` / `batch`          | `claim_token`, `claim_url`, `passcode` |

The values still read normally as properties — `endpoint.secret`, `link.claim_token` — but they are
gone from `JSON.stringify` and from `console.log` / `util.inspect`. **If you persisted one of these
objects by serialising it, read the field explicitly instead:**

```ts
const { secret } = await oblodai.webhooks.register(url);
await vault.put("oblodai/webhook", secret); // NOT JSON.stringify(endpoint)
```

A logger passed as `logger:` is wrapped, so it receives fields that were already scrubbed.

## One API key

A merchant has a single API key, and it signs every signed route — payments and payouts alike. The
client takes exactly `publicId` + `secret` (plus `adminToken` for the two provisioning routes):

| removed                                              | do this instead                                        |
| ---------------------------------------------------- | ------------------------------------------------------ |
| `payoutPublicId` / `payoutSecret`                    | drop them; `publicId` / `secret` sign everything       |
| `OBLODAI_PAYOUT_PUBLIC_ID` / `OBLODAI_PAYOUT_SECRET` | drop them; `OBLODAI_PUBLIC_ID` / `OBLODAI_SECRET` only |
| `{ preferPayoutKey: true }` on a call                | drop the option; there is no second key to choose      |
| catching `merchant.wrong_key_kind`                   | drop the branch (see below)                            |

The environment the SDK reads is exactly six variables: `OBLODAI_PUBLIC_ID`, `OBLODAI_SECRET`,
`OBLODAI_ADMIN_TOKEN`, `OBLODAI_BASE_URL`, `OBLODAI_LOG`, `OBLODAI_ALLOW_INSECURE`.

`merchant.wrong_key_kind` has left the gateway's catalogue and `ERROR_CODES` with it. It can only
reach a merchant still holding a pre-merge split pair (`oblodai_pk_…` in, `oblodai_wk_…` out); mint
one current key in the dashboard and the code cannot occur at all.

`ROUTES[key].auth` follows: it is `"public"` (no credentials), `"key"` (signed with the API key) or
`"onboard"` (the admin token). The old `payment` / `payout` / `any` values are gone, and the codegen
refuses a contract export that still uses them.

## Retry safety, idempotency and amounts

- Retry safety is `ROUTES[key].safe` — the gateway's own read-only classification, shipped in
  `contract.json`. Nothing is inferred from a path any more.
- Passing `idempotencyKey` to a list method now raises `sdk.idempotency_unsupported` instead of
  being dropped silently. Remove it; paging cannot use one.
- The money helpers raise `ConfigError` with code `sdk.bad_amount` for anything that is not
  `-?digits[.digits]` (at most 64 characters). If you fed them numbers or `".5"`, they used to throw
  a native `TypeError` — catch the SDK error now.
- `Money` is a `string`. `a < b` compiles and is wrong (`"9" < "10"`); use `compareAmounts`.

## Errors, headers and limits

- `ConfigError`, `WebhookPayloadError`, `PaymentBatchParams`, `PageParams` and `Credentials` are
  exported from the package root (`ConfigError` was documented but unreachable before).
- A caller header the SDK owns (`Accept`, `Content-Type`, `User-Agent`, `X-Public-Id`, `X-Signature`,
  `X-Timestamp`, `Idempotency-Key`, `X-Admin-Token`) is dropped whatever its casing, and a header
  value with CR/LF or a non-ASCII character raises `sdk.bad_header` before anything is sent.
- Response bodies are capped at 8 MiB (JSON) / 64 MiB (documents) — `sdk.response_too_large`.
- `payouts.mass` takes at most 100 elements, `payoutLinks.batch` at most 500; the asynchronous
  batches take up to 5000.
- The published tarball no longer contains `contract/fixtures`, `contract/errors` or
  `contract/webhook-samples.json`. `import contract from "@oblodai-npm/sdk/contract.json" with { type: "json" }`
  still works.
