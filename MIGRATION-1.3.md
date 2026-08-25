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

## New

`payments.cancel`, `payouts.cancel`, `payouts.validate`, `payments.batch`, `refunds.resolve`,
`settings.*FeeConfig`, `splits.setOptIn`, `webhooks.rotateSecret`, `payoutLinks.cheque`, the whole
`documents` namespace, payer-facing `publicView/select/publicQr/checkout/claim`, `PagePromise`
iteration, `verifyWebhook` with rotation support, `isStaleEvent`, money helpers.

## Webhooks

`verifyWebhook(rawBody, headers, { secret })` replaces the previous verifier; it also accepts
`previousSecret` during rotations and rejects stale timestamps (±300 s) by default.
