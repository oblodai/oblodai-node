export { Oblodai, SDK_VERSION, userAgent } from "./client.js";
export type { ClientOverrides, Resources } from "./client.js";
export type { ClientOptions } from "./config.js";
export { DEFAULT_BASE_URL } from "./config.js";

// Errors
export {
  OblodaiError,
  ApiError,
  ConfigError,
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
  WebhookPayloadError,
  MAX_RETRY_AFTER_SECONDS,
} from "./core/errors.js";
export type {
  ErrorDetail,
  AnyErrorCode,
  SdkErrorCode,
  TransportErrorCode,
  WebhookErrorCode,
} from "./core/errors.js";

// Runtime types
export type { RequestOptions } from "./core/options.js";
export type { FileResult } from "./core/file.js";
export { Page, PageResult, DEFAULT_PAGE_LIMIT } from "./core/pagination.js";
export type { Paginate } from "./core/pagination.js";
export { RawAPIResponse } from "./core/raw.js";
export type { Hooks, RequestInfo, ResponseInfo } from "./core/hooks.js";
export type { JobHandle, FileJobHandle, WaitOptions } from "./core/poller.js";
export { LRO, TERMINAL_STATUSES } from "./core/poller.js";
export type { RetryOptions } from "./core/retry.js";
export type { Logger, LogFields } from "./core/logger.js";
export { consoleLogger } from "./core/logger.js";
export type { FetchLike, RawResponse } from "./core/transport.js";
export { Transport, MAX_JSON_BODY_BYTES, MAX_BARE_BODY_BYTES } from "./core/transport.js";
export type { Credentials } from "./core/request.js";
export type { RouteSpec, RouteAuth, HttpMethod, ListKind } from "./core/route.js";
export { Resource } from "./resources/base.js";
export type { WithRawResponse, RawResult } from "./resources/base.js";
export { signRequest, canonicalString, signWebhook } from "./core/signing.js";
export { newIdempotencyKey } from "./core/idempotency.js";

// Generated from the API contract: resources, route table, enums, models, webhook event kinds and
// status helpers.
export * from "./generated/index.js";

// Helpers
export * from "./helpers/status.js";
export * from "./helpers/money.js";

// Webhook verification is also available from the "@oblodai-npm/sdk/webhooks" subpath.
export {
  verifyWebhook,
  verifyWebhookDelivery,
  parseWebhook,
  isKnownEvent,
  isStaleEvent,
  isTestEvent,
  DEFAULT_TOLERANCE_SECONDS,
  HEADER_WEBHOOK_ID,
  HEADER_WEBHOOK_EVENT,
  HEADER_WEBHOOK_EVENT_TIME,
  HEADER_WEBHOOK_SIGNATURE,
  HEADER_WEBHOOK_SIGNATURE_PREV,
  HEADER_WEBHOOK_TEST,
  HEADER_WEBHOOK_TIMESTAMP,
} from "./webhooks.js";
export type {
  VerifyWebhookOptions,
  WebhookHeaders,
  WebhookDeliveryInfo,
  AnyWebhookEvent,
  UnknownWebhookEvent,
} from "./webhooks.js";
