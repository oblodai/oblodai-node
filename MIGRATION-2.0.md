# Migrating from 1.x to 2.0

2.0 is generated from the gateway's OpenAPI contract. The wire protocol, the signing, the retry and
idempotency rules and the webhook verification are unchanged; what changes is the surface: method
names, how arguments are passed, and the units of the options. There are no deprecated aliases —
a renamed 1.x method is gone in 2.0, so `tsc` points at each call that needs a change.

## Requirements

- Node.js **20** or newer (was 18.17).
- The package name is unchanged: `@oblodai-npm/sdk`. `@oblodai-npm/sdk/contract.json` and the
  `contract/` snapshot are gone; the route table is `ROUTES` (keyed by `operationId`).

## Arguments

- **One `params` object.** Every method takes the request body as one object with the wire's
  `snake_case` field names, then `RequestOptions`. The 1.x shorthands that took a bare id are gone:
  `payments.info("u")` → `payments.getInfo({ uuid: "u" })`, `payouts.approve("p")` →
  `payouts.approve({ uuid: "p" })`, `webhooks.register(url)` → `webhooks.register({ url })`,
  `paymentLinks.toggle(id, false)` → `paymentLinks.toggle({ link_id: id, active: false })`.
- **Path parameters** stay positional and come first: `checkout.get(id)`,
  `checkout.selectMethod(id, { currency, network })`, `payoutLinks.claimPayout(token, { address })`,
  `documents.getSigned(kind, id, { exp, sig })`.
- **Query parameters** of GET routes travel inside `params`: `documents.getBatch({ uuid, format })`,
  `sandbox.listWebhooks({ limit, offset })` (1.x took a separate query object).
- **Types** are the generated request and response models (`PaymentRequest`, `PaymentView`,
  `PayoutRequest`, …); the hand-written 1.x types (`Payment`, `CreatePaymentParams`, `Money`,
  `PagePromise`, …) are gone. Amounts are still decimal strings.

## Options

| 1.x                                   | 2.0                                                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `new Oblodai({ timeoutMs: 30_000 })`  | `new Oblodai({ timeout: 30 })` — seconds                                                                  |
| `new Oblodai({ deadlineMs: 90_000 })` | `new Oblodai({ deadline: 90 })` — seconds                                                                 |
| per call `{ timeoutMs }`              | per call `{ timeout }` — seconds                                                                          |
| per call `{ deadlineMs }`             | removed; the client's `deadline` bounds every call                                                        |
| —                                     | per call `{ maxRetries, extraHeaders, requestId }`                                                        |
| —                                     | `client.withOptions({ timeout, maxRetries, extraHeaders })`, `resource.withOptions(options)`              |
| —                                     | `resource.withRawResponse.<method>(...)` → `RawAPIResponse` (`status`, `headers`, `requestId`, `parse()`) |
| —                                     | `hooks: { onRequest, onResponse }`                                                                        |

`retry` keeps its millisecond knobs (`baseDelayMs`, `maxDelayMs`, `maxRetryAfterMs`).

## Behaviour

- Every call sends `X-Request-ID` (yours via `requestId`, else a UUID; the same on every retry), and
  errors carry it: `String(err)` is `[code] message (request_id=…)`.
- A fractional number anywhere in a request body is refused before sending with `ConfigError`
  `sdk.float_amount` (1.x sent it).
- Lists return `Page` instead of `PagePromise`: `await` still gives the first page (now a `PageResult`
  with `items`, `paginate`, `total`, `hasPages`), `for await` still walks every item, `.all(max)` is
  unchanged, and `.byPage()` walks page by page.
- Documents resolve to `FileResult { content, contentType, filename }` — `bytes` is now `content`.
- Batches (`batches.createPayment/createPayout/createRefund`, `payouts.createTransferBatch`) and
  `documents.createJob` answer with a waiter attached: `await answer.wait()` polls to the final status,
  `await job.download()` fetches a finished document. 1.x left the polling to you.
- Webhook events: the `conversion` event kind is modelled (`ConversionEvent`).

## Removed

- `merchants.create` (`POST /v1/merchants`) is not part of the public contract any more — provision
  merchants from the gateway's admin surface. `merchants.createSandbox` is `sandbox.onboardStore(id)`.
- `ERROR_CODES` (the array) — the codes are the `ErrorCode` constant object and type.
- `CONTRACT_HASH`, `CONTRACT_CORE_COMMIT`, `CONTRACT_EXPORTED_AT`.

## Method names

The rule: the OpenAPI `operationId` without the resource's name, in camelCase. Names are pinned in
[`names.lock`](names.lock); a later rename fails the build as a breaking change.

| 1.x                            | 2.0                               | Route                                    |
| ------------------------------ | --------------------------------- | ---------------------------------------- |
| `account.balance`              | `account.getBalance`              | `POST /v1/balance`                       |
| `account.referral`             | `referrals.getInfo`               | `POST /v1/referral/info`                 |
| `account.vrcs`                 | `settings.configureVrcs`          | `POST /v1/vrcs`                          |
| `batches.info`                 | `batches.getInfo`                 | `POST /v1/batch/info`                    |
| `catalog.currencies`           | `checkout.listCurrencies`         | `GET /v1/currencies`                     |
| `catalog.exchangeRates`        | `account.listExchangeRates`       | `POST /v1/exchange-rate/list`            |
| `documents.balanceCertificate` | `documents.getBalance`            | `GET /v1/documents/balance`              |
| `documents.batchReport`        | `documents.getBatch`              | `GET /v1/documents/batch`                |
| `documents.createJob`          | `documents.createJob`             | `POST /v1/documents/jobs`                |
| `documents.download`           | `documents.getSigned`             | `GET /v1/documents/{kind}/{id}`          |
| `documents.feeSchedule`        | `documents.getFees`               | `GET /v1/documents/fees`                 |
| `documents.jobFile`            | `documents.downloadJobFile`       | `GET /v1/documents/jobs/file`            |
| `documents.jobInfo`            | `documents.getJob`                | `POST /v1/documents/jobs/info`           |
| `documents.ledger`             | `documents.getLedger`             | `GET /v1/documents/ledger`               |
| `documents.linkReport`         | `documents.getPaymentLink`        | `GET /v1/documents/link`                 |
| `documents.referralsReport`    | `documents.getReferrals`          | `GET /v1/documents/referrals`            |
| `documents.splitReport`        | `documents.getSplit`              | `GET /v1/documents/split`                |
| `documents.statement`          | `documents.getStatement`          | `GET /v1/documents/statement`            |
| `documents.walletStatement`    | `documents.getWalletStatement`    | `GET /v1/documents/wallet/statement`     |
| `merchants.create`             | — (removed, see below)            | `POST /v1/merchants`                     |
| `merchants.createSandbox`      | `sandbox.onboardStore`            | `POST /v1/merchants/{id}/sandbox`        |
| `paymentLinks.checkout`        | `checkout.paymentLink`            | `POST /v1/link/{id}/checkout`            |
| `paymentLinks.create`          | `paymentLinks.create`             | `POST /v1/payment/link`                  |
| `paymentLinks.get`             | `paymentLinks.get`                | `POST /v1/payment/link/info`             |
| `paymentLinks.info`            | `paymentLinks.get`                | `POST /v1/payment/link/info`             |
| `paymentLinks.list`            | `paymentLinks.list`               | `POST /v1/payment/link/list`             |
| `paymentLinks.publicView`      | `checkout.getPublicPaymentLink`   | `GET /v1/link/{id}`                      |
| `paymentLinks.toggle`          | `paymentLinks.toggle`             | `POST /v1/payment/link/toggle`           |
| `payments.batch`               | `batches.createPayment`           | `POST /v1/payment/batch`                 |
| `payments.cancel`              | `payments.cancel`                 | `POST /v1/payment/cancel`                |
| `payments.create`              | `payments.create`                 | `POST /v1/payment`                       |
| `payments.get`                 | `payments.getInfo`                | `POST /v1/payment/info`                  |
| `payments.history`             | `payments.listHistory`            | `POST /v1/payment/history`               |
| `payments.info`                | `payments.getInfo`                | `POST /v1/payment/info`                  |
| `payments.list`                | `payments.listHistory`            | `POST /v1/payment/history`               |
| `payments.publicQr`            | `checkout.getQr`                  | `GET /v1/pay/{id}/qr`                    |
| `payments.publicView`          | `checkout.get`                    | `GET /v1/pay/{id}`                       |
| `payments.qr`                  | `payments.getQr`                  | `POST /v1/payment/qr`                    |
| `payments.resend`              | `webhooks.resendPayment`          | `POST /v1/payment/resend`                |
| `payments.select`              | `checkout.selectMethod`           | `POST /v1/pay/{id}/select`               |
| `payments.sendEmail`           | `payments.sendEmail`              | `POST /v1/payment/send-email`            |
| `payments.services`            | `payments.listServices`           | `POST /v1/payment/services`              |
| `payoutLinks.batch`            | `payoutLinks.createBatch`         | `POST /v1/payout/link/batch`             |
| `payoutLinks.cancel`           | `payoutLinks.cancel`              | `POST /v1/payout/link/cancel`            |
| `payoutLinks.cheque`           | `documents.getPayoutLinkCheque`   | `POST /v1/payout/link/cheque`            |
| `payoutLinks.claim`            | `payoutLinks.claimPayout`         | `POST /v1/claim/{token}`                 |
| `payoutLinks.claimPreview`     | `payoutLinks.getPayoutClaim`      | `GET /v1/claim/{token}`                  |
| `payoutLinks.create`           | `payoutLinks.create`              | `POST /v1/payout/link`                   |
| `payoutLinks.get`              | `payoutLinks.get`                 | `POST /v1/payout/link/info`              |
| `payoutLinks.info`             | `payoutLinks.get`                 | `POST /v1/payout/link/info`              |
| `payoutLinks.list`             | `payoutLinks.list`                | `POST /v1/payout/link/list`              |
| `payouts.approve`              | `payouts.approve`                 | `POST /v1/payout/approve`                |
| `payouts.batch`                | `batches.createPayout`            | `POST /v1/payout/batch`                  |
| `payouts.calculate`            | `payouts.calculate`               | `POST /v1/payout/calculate`              |
| `payouts.cancel`               | `payouts.cancel`                  | `POST /v1/payout/cancel`                 |
| `payouts.create`               | `payouts.create`                  | `POST /v1/payout`                        |
| `payouts.get`                  | `payouts.getInfo`                 | `POST /v1/payout/info`                   |
| `payouts.getFeeConfig`         | `settings.getPayoutFeeConfig`     | `POST /v1/payout/fee-config/get`         |
| `payouts.getRefundFeeConfig`   | `settings.getRefundFeeConfig`     | `POST /v1/payout/refund-fee-config/get`  |
| `payouts.history`              | `payouts.listHistory`             | `POST /v1/payout/history`                |
| `payouts.info`                 | `payouts.getInfo`                 | `POST /v1/payout/info`                   |
| `payouts.list`                 | `payouts.listHistory`             | `POST /v1/payout/history`                |
| `payouts.mass`                 | `payouts.createMass`              | `POST /v1/payout/mass`                   |
| `payouts.services`             | `payouts.listServices`            | `POST /v1/payout/services`               |
| `payouts.setFeeConfig`         | `settings.setPayoutFeeConfig`     | `POST /v1/payout/fee-config/set`         |
| `payouts.setRefundFeeConfig`   | `settings.setRefundFeeConfig`     | `POST /v1/payout/refund-fee-config/set`  |
| `payouts.validate`             | `payouts.validate`                | `POST /v1/payout/validate`               |
| `refunds.batch`                | `batches.createRefund`            | `POST /v1/refund/batch`                  |
| `refunds.create`               | `refunds.payment`                 | `POST /v1/payment/refund`                |
| `refunds.resolve`              | `payments.resolve`                | `POST /v1/payment/resolve`               |
| `sandbox.deposit`              | `sandbox.simulateDeposit`         | `POST /v1/sandbox/deposit`               |
| `sandbox.faucet`               | `sandbox.faucet`                  | `POST /v1/sandbox/faucet`                |
| `sandbox.replay`               | `sandbox.replayWebhook`           | `POST /v1/sandbox/webhooks/replay`       |
| `sandbox.reset`                | `sandbox.reset`                   | `POST /v1/sandbox/reset`                 |
| `sandbox.webhooks`             | `sandbox.listWebhooks`            | `GET /v1/sandbox/webhooks`               |
| `settings.addApiAllowlist`     | `apiAllowlist.addEntry`           | `POST /v1/api-allowlist/add`             |
| `settings.deleteAutoWithdraw`  | `settings.deleteAutoWithdrawRule` | `POST /v1/auto-withdraw/delete`          |
| `settings.enableApiAllowlist`  | `apiAllowlist.setEnabled`         | `POST /v1/api-allowlist/enable`          |
| `settings.getAccuracy`         | `settings.getAccuracy`            | `POST /v1/payment/accuracy/get`          |
| `settings.getAutoRefund`       | `settings.getAutoRefund`          | `POST /v1/payment/autorefund/get`        |
| `settings.getPaymentFeeConfig` | `settings.getPaymentFeeConfig`    | `POST /v1/payment/fee-config/get`        |
| `settings.listAccepted`        | `settings.listAcceptedCurrencies` | `POST /v1/payment/accepted/list`         |
| `settings.listApiAllowlist`    | `apiAllowlist.list`               | `POST /v1/api-allowlist/list`            |
| `settings.listAutoWithdraw`    | `settings.listAutoWithdrawRules`  | `POST /v1/auto-withdraw/list`            |
| `settings.listDiscounts`       | `settings.listDiscounts`          | `POST /v1/payment/discount/list`         |
| `settings.removeApiAllowlist`  | `apiAllowlist.removeEntry`        | `POST /v1/api-allowlist/remove`          |
| `settings.setAccepted`         | `settings.setAcceptedCurrencies`  | `POST /v1/payment/accepted/set`          |
| `settings.setAccuracy`         | `settings.setAccuracy`            | `POST /v1/payment/accuracy/set`          |
| `settings.setAutoRefund`       | `settings.setAutoRefund`          | `POST /v1/payment/autorefund/set`        |
| `settings.setAutoWithdraw`     | `settings.setAutoWithdrawRule`    | `POST /v1/auto-withdraw/set`             |
| `settings.setDiscount`         | `settings.setDiscount`            | `POST /v1/payment/discount/set`          |
| `settings.setPaymentFeeConfig` | `settings.setPaymentFeeConfig`    | `POST /v1/payment/fee-config/set`        |
| `splits.createRule`            | `splits.createRule`               | `POST /v1/split/rule`                    |
| `splits.deleteRule`            | `splits.deleteRule`               | `POST /v1/split/rule/delete`             |
| `splits.getConfig`             | `splits.getConfig`                | `POST /v1/split/config/get`              |
| `splits.getOptIn`              | `splits.getRecipientOptIn`        | `POST /v1/split/recipient/optin/get`     |
| `splits.listRules`             | `splits.listRules`                | `POST /v1/split/rule/list`               |
| `splits.setConfig`             | `splits.setConfig`                | `POST /v1/split/config/set`              |
| `splits.setOptIn`              | `splits.setRecipientOptIn`        | `POST /v1/split/recipient/optin`         |
| `transfers.batch`              | `payouts.createTransferBatch`     | `POST /v1/transfer/batch`                |
| `transfers.toPersonal`         | `payouts.transferToPersonal`      | `POST /v1/transfer/to-personal`          |
| `transfers.toUser`             | `payouts.transferToUser`          | `POST /v1/transfer/to-user`              |
| `wallets.block`                | `wallets.block`                   | `POST /v1/wallet/block`                  |
| `wallets.create`               | `wallets.create`                  | `POST /v1/wallet`                        |
| `wallets.qr`                   | `wallets.getQr`                   | `POST /v1/wallet/qr`                     |
| `wallets.refundBlockedDeposit` | `refunds.blockedWallet`           | `POST /v1/wallet/blocked-address-refund` |
| `webhooks.deliveries`          | `webhooks.listDeliveries`         | `POST /v1/webhooks/deliveries`           |
| `webhooks.register`            | `webhooks.register`               | `POST /v1/webhooks`                      |
| `webhooks.rotateSecret`        | `webhooks.rotateSecret`           | `POST /v1/webhooks/rotate-secret`        |
| `webhooks.test("payment")`     | `webhooks.sendTestPayment`        | `POST /v1/test-webhook/payment`          |
| `webhooks.test("payout")`      | `webhooks.sendTestPayout`         | `POST /v1/test-webhook/payout`           |
| `webhooks.test("wallet")`      | `webhooks.sendTestWallet`         | `POST /v1/test-webhook/wallet`           |
| `webhooks.testLegacy`          | `webhooks.sendLegacyTest`         | `POST /v1/payment/testing-webhook`       |

New in 2.0 (no 1.x counterpart):

- `account.getSummary`
- `checkout.getOnramp`
- `checkout.getSourceOfFundsForm`
- `checkout.startOnramp`
- `checkout.submitSourceOfFunds`
- `payments.getAmlLinks`
- `payments.getCheckoutConfig`
- `payments.setCheckoutConfig`
- `settings.getAutoConvert`
- `settings.listApiLog`
- `settings.setAutoConvert`
- `webhooks.requeueDelivery`
- `webhooks.sendTestConversion`
- `webhooks.setActive`
