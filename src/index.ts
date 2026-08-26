export { Oblodai, SDK_VERSION } from "./client.js";
export type { ClientOptions } from "./config.js";
export { DEFAULT_BASE_URL } from "./config.js";

// Errors
export {
  OblodaiError,
  ApiError,
  TransportError,
  ValidationError,
  AuthenticationError,
  PermissionError,
  NotFoundError,
  ConflictError,
  IdempotencyConflictError,
  RateLimitError,
  UnavailableError,
  InternalError,
  ContractError,
  SignatureError,
} from "./core/errors.js";
export type { ErrorDetail } from "./core/errors.js";

// Transport-level types
export type { Page, PlainList, Paginate } from "./core/envelope.js";
export { PagePromise } from "./core/pagination.js";
export type { RetryOptions } from "./core/retry.js";
export type { Logger, LogFields } from "./core/logger.js";
export { consoleLogger } from "./core/logger.js";
export type { FetchLike } from "./core/transport.js";
export type { RequestOptions, FileResult, Ref } from "./resources/base.js";
export { signRequest, canonicalString, signWebhook } from "./core/signing.js";
export { newIdempotencyKey } from "./core/idempotency.js";

// Contract: enums, routes, models, request DTOs
export * from "./contract/enums.js";
export { ROUTES } from "./contract/routes.js";
export type { RouteKey } from "./contract/routes.js";
export type { RouteSpec } from "./contract/types.js";
export type { RequestBodies } from "./contract/requests.js";
export * from "./contract/models/index.js";
export { CONTRACT_CORE_COMMIT, CONTRACT_EXPORTED_AT, CONTRACT_HASH } from "./contract/version.js";

// Resource param aliases
export type {
  CreatePaymentParams,
  PaymentLookup,
  PaymentHistoryParams,
  SelectPaymentMethodParams,
} from "./resources/payments.js";
export type { RefundParams, ResolveParams, RefundBatchParams } from "./resources/refunds.js";
export type {
  CreatePayoutParams,
  PayoutLookup,
  PayoutHistoryParams,
  CalculatePayoutParams,
  ValidatePayoutParams,
  MassPayoutParams,
  PayoutBatchParams,
} from "./resources/payouts.js";
export type {
  TransferToPersonalParams,
  TransferToUserParams,
  TransferBatchParams,
} from "./resources/batches.js";
export type {
  CreatePayoutLinkParams,
  PayoutLinkBatchParams,
  ClaimParams,
  CreatePaymentLinkParams,
  PaymentLinkCheckoutParams,
} from "./resources/links.js";
export type { CreateWalletParams } from "./resources/wallets.js";
export type { WebhookTestParams } from "./resources/webhooks.js";
export type { DocumentQuery, FormatQuery, PeriodQuery } from "./resources/documents.js";
export type { CreateSplitRuleParams } from "./resources/splits.js";
export type { OnboardParams } from "./resources/merchants.js";

// Helpers
export * from "./helpers/status.js";
export * from "./helpers/money.js";

// Webhook verification is also available from the "@oblodai-npm/sdk/webhooks" subpath.
export {
  verifyWebhook,
  verifyWebhookDelivery,
  parseWebhook,
  isStaleEvent,
  isTestEvent,
} from "./webhooks.js";
export type { VerifyWebhookOptions, WebhookHeaders, WebhookDeliveryInfo } from "./webhooks.js";
