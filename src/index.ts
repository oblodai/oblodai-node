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

// Песочница: проверка «тестовости» ключа (префикс public_id `test_`)
export { isTestKey } from './resources/sandbox.js';

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
  PaymentRefundEntry,
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
  // v1.1.0: батчи
  BatchOnError,
  BatchOptions,
  BatchStatus,
  BatchSubmitResult,
  BatchItem,
  BatchInfo,
  RefundBatchItem,
  // v1.1.0: платёжные ссылки
  PaymentLinkAmountMode,
  CreatePaymentLinkParams,
  PaymentLinkCreated,
  PaymentLink,
  PaymentLinkInfo,
  LinkCheckoutParams,
  // v1.1.0: сплиты
  CreateSplitRuleParams,
  SplitRule,
  SplitConfig,
  // v1.1.0: счёт на e-mail и resolve
  SendEmailParams,
  SendEmailResult,
  ResolveParams,
  ResolveResult,
  // v1.1.0: payout-ссылки (крипто-чеки)
  PayoutLinkStatus,
  CreatePayoutLinkParams,
  PayoutLink,
  PayoutLinkCreated,
  PayoutLinkBatchItem,
  PayoutLinkBatchResult,
  PayoutLinkClaimInfo,
  PayoutLinkClaimResult,
  // v1.2.0: песочница разработчика
  SandboxDepositParams,
  SandboxDeposit,
  SandboxFaucetParams,
  SandboxFaucetResult,
  SandboxResetResult,
  SandboxDelivery,
  SandboxReplayResult,
  // v1.2.0: переводы пользователям платформы и публичный чекаут
  TransferToUserItem,
  TransferToUserParams,
  TransferToUserResult,
  PublicPayment,
  PaySelectParams,
} from './models.js';
