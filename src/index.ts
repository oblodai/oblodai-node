/**
 * Oblodai SDK — TypeScript/Node.js клиент для платёжного шлюза Oblodai.
 *
 * @packageDocumentation
 */

// Клиент
export { OblodaiClient } from './client.js';

// Вебхуки: проверка входящих
export {
  verifyWebhook,
  constructWebhookEvent,
  type WebhookHeaders,
  type VerifyWebhookOptions,
} from './webhooks.js';

// Низкоуровневая подпись (на случай кастомного транспорта)
export { signRequest, type SignedRequest } from './signing.js';

// Ошибки
export {
  OblodaiError,
  OblodaiApiError,
  OblodaiConnectionError,
  OblodaiTimeoutError,
  OblodaiSignatureError,
} from './errors.js';

// Типы конфигурации и общие
export type {
  OblodaiConfig,
  OblodaiLogger,
  RetryOptions,
  PaymentStatus,
  PayoutStatus,
  Network,
  Paginate,
  Envelope,
  ErrorEnvelope,
} from './types.js';

// Модели объектов и параметры
export type {
  Payment,
  CreatePaymentParams,
  Lookup,
  HistoryParams,
  PaymentList,
  ServiceMethod,
  Wallet,
  CreateWalletParams,
  BlockWalletParams,
  BlockedRefundParams,
  Balance,
  ReferralInfo,
  Payout,
  CreatePayoutParams,
  MassPayoutItem,
  CalculatePayoutParams,
  PayoutCalculation,
  RefundParams,
  ExchangeRate,
  Currency,
  CurrencyNetwork,
  WebhookEvent,
  WebhookRegistration,
  Delivery,
  AcceptedMethod,
  AutoWithdrawRule,
} from './models.js';
