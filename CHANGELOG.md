# Changelog

All notable changes to this package are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow
[Semantic Versioning](https://semver.org/).

## Unreleased

### Added

- `client.cliLogin` — `start`, `poll`, `logout`: the browser login of the `oblodai` CLI (OAuth
  2.0 device authorization) and logout of its key.
- `OblodaiError.details`: the machine-readable facts of an error envelope's new `details` object
  (for example `cli.permission_denied` carries `required_role` and `role`); only string values are
  kept.
- Every method's documentation names the minimum team role a CLI key needs to call it;
  money-out operations (payouts, refunds, transfers, auto-withdrawal, split rules) take only the
  store owner's own CLI key.
- `client.refunds.calculate` (POST /v1/payment/refund/calculate): dry-run a refund and get back a
  `RefundCalculation` — `amount`, `currency`, `network`, `address`, `amountPaid`, `surcharge`,
  `commission`/`commissionBearer`, `credited`, `refundable`, `refunded`, `remaining`, and, with
  `fromCurrency` set, the estimated `fromAmount`. Runs the same checks as `refunds.payment` and
  reserves/sends nothing.

### Changed

- `PayoutValidateResult` (`payouts.validate`) gains `address` (the destination), and, for a
  `fromCurrency` payout, `fromAmount` and `rate` alongside the existing `fundedBy`.
- `PayoutRequest.memo` / `PayoutValidateRequest.memo` docs are now network-specific: the XRP
  destination tag, the Stellar memo id, a TON comment (at most 64 bytes), and at most 120 bytes on
  every other network.
- **Breaking:** `payments.listHistory` takes its own request model `PaymentHistoryRequest` (`limit`,
  `offset`, `status`) instead of the shared `HistoryRequest`; `HistoryRequest` now serves
  `payouts.listHistory` only. The payment feed never honoured `kind`/`include_refunds`, so the new
  model drops them, and `status` filters by the payment status vocabulary. Migration: type payment
  history parameters as `PaymentHistoryRequest` and pass only `limit`, `offset` and `status`.
- Method docs: the payout calculation lists `payout.unsupported_network` for an unknown network;
  lookup, test-webhook (`ok` / `status_code`) and refund amount fields are described more precisely.
  The webhook signing constants already carry the event-id and delivery-id header names that the
  contract now names as `event_id_header` / `delivery_id_header`.

- Method docs: refunds explicitly follow the store's refund fee setting (`getRefundFeeConfig`)
  — when the merchant bears the Oblodai commission, refunds debit more than the payment
  credited, paid from the merchant's balance. `refunds.calculate` docs now list
  `payout.insufficient_funds` and `payout.convert_insufficient` among the errors it can return.

## [2.0.0] — 2026-09-25

Generated from the gateway's OpenAPI contract (`services/core/api/openapi.json`, `tools/sdkgen` in
the backend). Breaking: method names, argument shapes and option units change — see
[MIGRATION-2.0.md](MIGRATION-2.0.md).

### Added

- Every route of the contract — 120, in 16 resources (`account`, `apiAllowlist`, `batches`,
  `checkout`, `documents`, `paymentLinks`, `payments`, `payoutLinks`, `payouts`, `referrals`,
  `refunds`, `sandbox`, `settings`, `splits`, `wallets`, `webhooks`), named
  `client.<resource>.<method>` after the `operationId` and pinned in `names.lock`.
- Request and response models, enums (`OpenEnum<T>`: an unknown value stays a string) and the route
  table `ROUTES` generated from the contract; retry safety is the contract's `x-retry-safe`.
- Per-call `RequestOptions`: `idempotencyKey`, `timeout` (seconds), `maxRetries`, `extraHeaders`,
  `requestId`, `signal`.
- `X-Request-ID` on every call (one id for all attempts); errors carry it and print as
  `[code] message (request_id=…)`.
- `withRawResponse` on every resource (`RawAPIResponse`: status, headers, request id, `parse()`),
  `withOptions` on the client and on resources, `hooks: { onRequest, onResponse }`.
- `Page.byPage()`; `PageResult` with `total`, `perPage`, `offset`, `hasPages`.
- Long-running operations wait: batch and document-job answers carry `wait()` (and `download()`).
- `ConversionEvent` webhook kind.
- `verifyWebhookDelivery(...).eventId` (`X-Webhook-Event-Id`, `HEADER_WEBHOOK_EVENT_ID`): the id of
  the state a delivery carries, the same across retries and resends — the key to deduplicate on
  (`id`, `X-Webhook-Id`, changes on a resend).
- Facts of the API generated from the contract instead of kept by hand: the long-running operations
  (`LRO`, `TERMINAL_STATUSES`; each waiter ends on its own operation's terminal statuses), the
  webhook event kinds (`KNOWN_EVENT_KINDS`, `KnownEventKind`, `WEBHOOK_EVENTS`, one `<Kind>Event`
  per kind), and status helpers for every classified status enum (`FINAL_<X>_STATUSES`,
  `SUCCESS_<X>_STATUSES`, `is<X>Final`, `is<X>Success` — e.g. `isBatchFinal`,
  `isDocumentJobSuccess`).
- The signing protocol comes from the contract's `x-oblodai-signing` (`src/generated/signing.ts`,
  generated): the signed-request and webhook header names, the canonical strings, the clock skew,
  `MAX_BODY` and `MAX_IDEMPOTENCY_KEY_LENGTH`. The public `HEADER_*` and `HEADER_WEBHOOK_*` names
  (the rehearsal header `HEADER_WEBHOOK_TEST` too, from `webhook.test_header`),
  `SIGNATURE_SKEW_SECONDS`, `DEFAULT_TOLERANCE_SECONDS` and `MAX_IDEMPOTENCY_KEY_LENGTH` stay, as
  aliases of the generated values; a header the gateway renames reaches the SDK by regeneration
  alone, and the conformance suite checks the request a signed call actually sends — method, path
  and query, body and the headers under the contract's names.
- `objectId(event)`: the id of the object an event is about, from the generated `EVENT_ID_FIELDS`
  (`uuid`, or `id` on a conversion); `undefined` for an unknown kind — its id field is not guessed.
- The shared conformance suite of the backend runs in `npm test`; README blocks and `examples/`
  execute in tests; `make ci`; a packaging gate installs the tarball and type-checks ESM and CJS.

### Changed

- Node.js 20 or newer.
- Timeouts are seconds: `timeout`/`deadline` on the client, `timeout` per call (were `timeoutMs`,
  `deadlineMs`).
- A fractional number in a request body is refused before sending (`sdk.float_amount`).
- Documents resolve to `FileResult { content, contentType, filename }` (was `bytes`).
- An undici timeout is `transport.timeout` (was `transport.network`).

### Removed

- The hand-written resources and models of 1.x, the `contract/` snapshot and its codegen,
  `merchants.create`, `ERROR_CODES`, `CONTRACT_*` constants and every 1.x method alias.

## [1.3.0] — 2026-08-26

A rewrite, generated from the gateway's contract snapshot (core `2cc44c1`) and verified against it.
Migration notes: [MIGRATION-1.3.md](MIGRATION-1.3.md).

### Added

- Every merchant route the gateway declares — 107 of them: cancel/validate, batches, documents, fee
  configs, split opt-in, secret rotation, payer-facing checkout and claim endpoints.
- `merchants` namespace — `create` and `createSandbox` provision merchants on a self-hosted gateway.
  These routes are unsigned and gated by an admin token: `adminToken:` or `OBLODAI_ADMIN_TOKEN`,
  sent as `X-Admin-Token` on those two routes and nowhere else.
- `PagePromise` on every list method: `await` for one page, `for await` for every item, `.all(max)`
  for an array. Nothing is requested until it is consumed.
- Retries driven by the API's own `retryable` flag, automatic idempotency keys and clock-skew
  correction.
- `@oblodai-npm/sdk/webhooks` — signature verification with no client and no API key, rotation-aware
  (`previousSecret`), plus `parseWebhook`, `isStaleEvent`, `isTestEvent`, `isKnownEvent`.
- `verifyWebhookDelivery(...).isTest` is true for rehearsal deliveries (`webhooks.test`, sandbox):
  signed exactly like live ones, so a handler must check it and never act as if money moved.
- Machine-readable surface: `ROUTES` (with the gateway's own `safe` flag), `RequestBodies`,
  `ERROR_CODES` (469), `NETWORKS`, `PAYMENT_STATUSES`, `PAYOUT_STATUSES`, `EVENT_TYPES`,
  `CONTRACT_CORE_COMMIT` / `CONTRACT_HASH`.
- Contract tests against golden response bodies and real signed webhook deliveries; a drift gate
  (`npm run check-drift`); a live journey (`npm run test:live`).
- Money helpers `addAmounts`, `subtractAmounts`, `compareAmounts`, `amountEquals`, `isZeroAmount`,
  `isValidAmount`.

### Fixed

- **Requests are signed with the five-field recipe over path+query.** The 1.x line signed four
  fields; the gateway has answered 401 to every 1.x call since the recipe changed.
- Models, statuses, pagination and parameter names match the current API vocabulary; the wallet
  model carries `blocked`, and `refundBlockedDeposit` documents the refund-family codes it returns.
- **Retry safety comes from the contract, not from the shape of a path.** `ROUTES[key].safe` is the
  gateway's own hand-written read-only classification, exported in `contract.json`; the codegen
  fails if any route lacks it. The previous path-suffix heuristic would have mis-classified any new
  route whose name happened to end in `/info`, `/list` or `/get`.
- **The error envelope is decoded field by field.** A peer that answers with the envelope's shape
  and the wrong types can no longer steer the SDK: a non-string `code` demotes the body to "no
  envelope" (keeping `request_id`), a non-string `message` falls back to `HTTP <status>`, only a
  literal `true`/`false` is accepted for `retryable`, and `retry_after` (and the `Retry-After`
  header, delta-seconds or HTTP-date) is clamped to `[0, 86400]` seconds — never negative, never
  overflowing, never a wait computed from garbage.
- **Concurrent calls survive a clock-skew correction.** Each attempt now remembers the offset it was
  signed with and compares the server's time against that, not against the shared offset a sibling
  call may already have fixed; a correction is reverted only if the shared offset is still the one
  this call installed. Previously, five concurrent calls against a one-hour-skewed clock produced
  one success and four hard `merchant.bad_signature` failures.
- **Webhook verification order and inputs.** An empty `secret` (or an empty `previousSecret`) is a
  `ConfigError` before any hashing, instead of verifying with the empty key; a negative
  `toleranceSec` is a `ConfigError` and `0` disables the freshness check. The HMAC is checked
  **before** the timestamp, so the freshness window is not an oracle for an unauthenticated caller.
  Signature headers tolerate surrounding whitespace and upper-case hex and reject a `0x` prefix; a
  present-but-empty signature header is `webhook.bad_signature`, not `webhook.missing_header`;
  `X-Webhook-Test` is recognised whatever its case.
- **An authentic delivery with an unreadable body is `webhook.bad_payload`**, a `WebhookPayloadError`
  in the contract family — not a `SignatureError`. A receiver that answers 401 to forged deliveries
  no longer answers 401 to a genuine one it simply could not parse.
- **An unknown event `type` no longer throws.** It comes back verbatim as `UnknownWebhookEvent`;
  narrow with `isKnownEvent(event)` before switching on `type`. `isStaleEvent` returns `false`
  instead of throwing when the sequence is missing or not an integer.
- **Secrets never print.** The client, its transport, the resolved credentials and every
  secret-bearing result (`WebhookEndpoint.secret`, `WebhookSecretRotated.secret`,
  `ApiKeyPair.secret`, `PayoutLink.claim_token` / `claim_url` / `passcode`) render as `[redacted]` in
  `JSON.stringify` and in `console.log` / `util.inspect` at any depth, while still reading normally
  as properties. A logger supplied through `logger:` is wrapped, so it receives fields that were
  redacted before it saw them.
- **Header rules.** The headers the SDK owns (`Accept`, `Content-Type`, `User-Agent`, `X-Public-Id`,
  `X-Signature`, `X-Timestamp`, `Idempotency-Key`, `X-Admin-Token`) beat a caller header of the same
  name whatever its casing; a caller value containing CR/LF or a non-ASCII character is refused with
  `sdk.bad_header` before anything is sent.
- **Response bodies are bounded**: 8 MiB for JSON routes, 64 MiB for document routes, refused as
  `sdk.response_too_large` rather than buffered. The per-attempt timeout covers reading the body,
  not just the headers. A redirect is never followed, and one an injected HTTP client followed is
  detected and reported.
- **Money helpers refuse what they cannot compute.** `-?digits[.digits]`, at most 64 characters —
  anything else (a number, `undefined`, `".5"`, `"1e3"`, a ten-million-digit string) raises
  `ConfigError` / `sdk.bad_amount` instead of a native `TypeError` or a ten-second parse.
- An `idempotencyKey` passed to a list method now raises `sdk.idempotency_unsupported` immediately
  instead of being silently dropped.
- `ConfigError` is exported from the package root (the docs told callers to use `instanceof
ConfigError` while it was unreachable), along with `WebhookPayloadError`, `PaymentBatchParams`,
  `PageParams`, `Credentials` and the error-code type aliases.
- `webhooks.test(kind, params)` types `params` per kind instead of always as the payment body.
- Generated docs are English only: the codegen no longer copies a non-ASCII example string out of
  the core's own annotations.

### Changed

- **One API key.** A merchant holds a single key and it signs every signed route, so the client takes
  exactly `publicId` + `secret` (plus `adminToken` for the two provisioning routes). The payout
  credential pair (`payoutPublicId` / `payoutSecret`, `OBLODAI_PAYOUT_PUBLIC_ID` /
  `OBLODAI_PAYOUT_SECRET`), the per-call `preferPayoutKey` option and the payout-key retry inside
  `batches.info` are gone; `ROUTES[key].auth` is now `public`, `key` or `onboard`, and the onboarding
  response carries `api_key` alone. `merchant.wrong_key_kind` has left the catalogue — it can only
  reach a merchant still holding a pre-merge `oblodai_pk_` / `oblodai_wk_` pair.
- Zero runtime dependencies; Node ≥ 18.17; ESM + CJS with a `./webhooks` subpath export.
- The published tarball carries `contract/contract.json` and `contract/descriptions.en.json` only.
  The golden fixtures, error samples and webhook samples stay in the repository (they are test
  data, and they were ~1.1 MB of it).
- Removed dead surface: `collectPages`, `compact`, `RequestBodyOf`.

## [1.2.0] — 2026-07-19

### Breaking: a non-HTTPS `baseUrl` is refused

The client now requires `https://` and throws from the constructor. `http://` used to be accepted
silently, putting `X-Signature` and `public_id` on the wire in the clear. Loopback is the only
exception (`localhost`, `127.0.0.0/8`, `[::1]`, `*.localhost`), so local stands keep working. An
invalid URL now gives a clear error instead of failing during parsing. The check also applies to
`OblodaiClient.fromEnv()` (`OBLODAI_BASE_URL`).

### Breaking: `webhooks.deliveries()` returns an array

It returns `Delivery[]` rather than `{ deliveries: Delivery[] }` — the SDK unwraps the envelope, as
`sandbox.listWebhooks()` and `payoutLinks.list()` already did. Migration: drop `.deliveries`.

### Breaking: new idempotency semantics

- The SDK no longer injects an automatic `order_id` (`idem-<uuid>`) into `payments.create` or
  `account.transferToPersonal`. Your `order_id` reaches the gateway exactly as you passed it.
- Duplicate protection is the `Idempotency-Key` HTTP header. One UUID is generated per logical call,
  before the retry loop, so every internal retry (timeout, 5xx, network, 429) carries the same key
  and the gateway replays the first attempt's result. The header is not part of the signature.
- Your own key: the optional `idempotency_key` parameter on creating calls
  (`payments.create/refund/createBatch/refundBatch/resolve`, `payouts.create/createMass/createBatch`,
  `account.transferToPersonal`). It goes into the header, not the body.
- The header is sent only to the routes the gateway wraps in idempotency: `/v1/payment`,
  `/v1/payment/refund`, `/v1/payment/resolve`, `/v1/payment/batch`, `/v1/refund/batch`, `/v1/payout`,
  `/v1/payout/mass`, `/v1/payout/batch`, `/v1/payout/link`, `/v1/payout/link/batch`,
  `/v1/transfer/to-personal`.

### Added

- `client.paymentLinks` — the canonical name for payment links across all Oblodai SDKs.
  `client.links` remains a documented synonym and the same object; existing code needs no change.
  Not to be confused with `client.payoutLinks` (money in the other direction).
- Developer sandbox — `client.sandbox`, for `test_…` keys only (a live key gets
  `403 sandbox.live_key`): `simulateDeposit`, `faucet` (up to 1 000 000 per call), `reset`,
  `listWebhooks`, `replayWebhook`.
- Signed GET in the transport (`HttpClient.requestGet`) — the same canonical string with an empty
  body, needed by `GET /v1/sandbox/webhooks`.
- Transfers to platform users — `account.transferToUser({ to_user_id, amount, currency, order_id? })`:
  an internal, fee-free move from the merchant balance to a platform user's personal wallet.
  `to_user_id` is a UUID, not a username.
- Payroll-style batches — `account.transferBatch([...], { onError?, idempotency_key? })`, processed
  in the background; progress and per-element results through the existing `batches.info(batch_id)`.
- Public checkout — `payments.publicGet(uuid)` and `payments.publicSelect(uuid, { currency, network })`
  for building your own checkout instead of the hosted page.
- `isTestKey(publicId)` helper, and types for every new object.
- Batches (up to 5000 per signed request): `payments.createBatch`, `payments.refundBatch`,
  `payouts.createBatch`, plus `client.batches.info(batch_id, { limit, offset })`. Mode
  `onError: "continue" | "stop"`.
- Payment links — `client.links`: `create`, `list`, `info`, `toggle`, plus unsigned `publicGet` and
  `checkout`. Fixed/open/range amount, pinnable currency and network.
- Split payments — `client.splits`: `createRule`, `splitToAddress` / `splitToMerchant`, `listRules`,
  `deleteRule`, `getConfig` / `setConfig`.
- Invoice by e-mail — `payments.sendEmail({ uuid | order_id, email? })` (10 mails per hour per
  recipient).
- Underpayment resolution — `payments.resolve({ uuid | order_id, action: "accept" | "refund" })`.
- Payout links ("crypto cheques") — `client.payoutLinks`: `create`, `createBatch` (up to 500),
  `list`, `info`, `cancel`, plus unsigned `claimInfo(token)` and `claim(token, { address, memo? })`.
  Funds are reserved without knowing the recipient's wallet. Set `expires_in_hours` explicitly: the
  gateway clamps a missing or zero window to one hour.
- New payment fields: `payer_address`, `refunds[]`, `refund_status` (`none|partial|full`).

### Fixed

- **Payout links are deduplicated by the gateway, so automatic retry is back on.**
  `/v1/payout/link` and `/v1/payout/link/batch` are wrapped in the idempotency middleware: a repeat
  with the same key replays the first response — same link, same `claim_token`,
  `Idempotent-Replayed: true` — and the balance is reserved exactly once. The `unreplayableWrite`
  flag is therefore gone from `payoutLinks.create`/`createBatch`, where it had become pure
  reliability loss. Without the header the old behaviour stands: two identical calls create two
  links.
- **Automatic retry is back on `wallets.blockedAddressRefund`.** The route is deliberately not
  wrapped (wrapping would turn a concurrent repeat into `409 idempotency.in_progress` instead of a
  wait and a success), but it is not unprotected: the gateway deduplicates on the deterministic
  reference `refund-wallet:<wallet_id>` under an advisory lock and returns the existing payout.
- Internal: the `RequestOpts.unreplayableWrite` transport option is removed — no call needs it.
- `payoutLinks.createBatch` accepts a second argument `{ idempotency_key? }` for the whole call;
  a per-item `idempotency_key` no longer leaks into the request body.
- `address` is no longer required on a refund (`payments.refund` / `payouts.refund` /
  `refundBatch`) — funds go back to the payer's address by default (Bitcoin/UTXO still needs one).

### Documentation

- New README section "Where to get keys", first after installation: keys come from the Oblodai
  dashboard, the secret is shown once, a test key looks like `test_…` / `oblodai_test_…`.
- The sandbox section moved up, right after the quick start, so a reader going top to bottom meets
  the safe playground before live keys. Quick-start placeholders are test keys.
- The HTTPS requirement for `baseUrl` (and the loopback exception) is documented in the README, in
  the `OblodaiConfig.baseUrl` doc comment and in the credentials section.
- Removed the claims that payout links and `blocked-address-refund` were unprotected against
  duplicates — see "Fixed" above.
- Documented the idempotency response codes: `400 idempotency.key_reused` (same key, different
  body), `400 idempotency.bad_key` (key longer than 255 characters),
  `409 idempotency.in_progress` (a concurrent repeat while the first call is still running),
  `503 idempotency.unavailable` (the store is down; fail-closed by design).
- A duplicate payout-link `reference` is `409 payoutlink.duplicate_reference`, not a 500 — which
  matters, because the SDK used to retry the 500 four times for nothing.
- Payout-link batches: a response over 256 kB is not cached, so replaying such a batch re-executes
  it. Set a per-item `reference` as the second, durable layer. A partially failed batch replays as
  is; the failed elements need a NEW key.
- `payouts.approve` needs no idempotency key: it is a state transition that only accepts `pending`
  and answers `409 payout.not_pending` otherwise. Read that 409 as "already approved".
- Removed the false claim that a sandbox deposit matures on its own. A simulated transaction is
  never re-emitted, so an invoice stays in `confirm_check` until you repeat `simulateDeposit` with
  the same `txid` and a higher `confirmations`. (The ~10 minutes belong to the maturity hold on a
  **payout**, `payout.funds_maturing`.)
- `PaymentStatus` gained `select` and a full vocabulary description; `PublicPayment` uses the shared
  type instead of widening it by hand. Terminal statuses marked: `paid`, `paid_over`,
  `wrong_amount`, `cancel`.
- `wrong_amount_waiting` and `wrong_amount` are distinguished, with a status table and a warning.
  `wrong_amount_waiting` means "a partial payment arrived, the invoice is still alive" and is not
  terminal: `payments.resolve` answers `409 resolution.not_underpaid` on it, as designed. It is also
  a derived status — present in `info`/`history`, absent from webhooks (there such an invoice is
  `confirm_check`).
- `webhooks.register()` is documented as an upsert of the project's single endpoint: calling it with
  a different URL redirects deliveries rather than adding a second endpoint, and the secret is
  **kept** (a new one would orphan deliveries already queued and signed with the old one). The
  secret is generated on the first registration only; revoking it is a separate action (rotation).
- The webhook secret is a **separate** secret (the `secret` field from `webhooks.register()`), not
  `OBLODAI_SECRET`. Passing the API secret to `verifyWebhook` rejects 100% of deliveries.
- Empty `url` / `claim_url` on a local stand: the gateway builds them from
  `GATEWAY_PUBLIC_BASE_URL`, which local stands do not set. Build the link yourself from `uuid` /
  `link_id` / `claim_token`.
- `sandbox.reset()` is not a clean slate: it cancels invoices in `check`/`select` only, deliberately
  leaving one whose deposit is already visible; balances are always zeroed with a compensating
  entry.
- `pay.method_not_accepted` in a custom checkout is normal on a fresh merchant: the
  (currency, network) pair must be in the accepted set, and an empty set falls back to the catalogue
  of methods with a live deposit watcher. Render the pairs from `accepted` rather than hard-coding.

## [1.0.2] — 2026-07-12

### Fixed

- The automatic idempotency key no longer mutates the caller's object: `payments.create` and
  `account.transferToPersonal` write the generated `order_id` into a copy. Reusing one parameter
  literal across two `create()` calls used to leak the first `order_id` into the second, collapsing
  both operations into one.
- "Empty `order_id`" is normalised: `undefined`, `null`, `""` and whitespace-only strings all count
  as absent. Key stability across retries is preserved (the body is built once, before the loop).

## [1.0.1] — 2026-07-12

### Fixed

- Money safety: `payments.create` and `account.transferToPersonal` set a stable `order_id`
  (`idem-<uuid>`) before sending when none was given. An automatic retry of a non-idempotent POST
  could otherwise create a duplicate, since the gateway deduplicated on `order_id` only. Payouts
  were unaffected (`order_id` is mandatory there).
- `Retry-After` is no longer truncated to `maxDelayMs`. The server's hint is honoured as given,
  bounded only by an absolute five-minute ceiling; `maxDelayMs` still caps our own backoff.
- `payout.funds_maturing` is terminal (`isRetriable === false`): it is a business state, not a
  transport failure.

### Changed

- `package.json`: `"sideEffects": false`; `@types/node` moved to `dependencies` because `Buffer`
  appears in the public type surface; `.env.example` added to the package.

## [1.0.0] — 2026-07-12

### Added

- First release of the official TypeScript/Node.js SDK for the Oblodai payment gateway.
- Payment acceptance, payouts and mass payouts, static wallets, refunds, webhooks, public reference
  data (exchange rates, the catalogue of coins and networks).
- HMAC-SHA256 request signing and webhook signature verification (constant-time comparison, replay
  protection).
- `OblodaiClient.fromEnv()` — `OBLODAI_PUBLIC_ID` / `OBLODAI_SECRET` / `OBLODAI_BASE_URL`.
- Automatic retries with exponential backoff, honouring `Retry-After` on 429.
