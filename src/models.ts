/**
 * Модели объектов API и параметры запросов.
 *
 * Суммы — строки в единицах валюты. Поля, помеченные "minor", приходят в минимальных единицах.
 */
import type { PaymentStatus, PayoutStatus, Paginate } from './types.js';

// ─────────────────────────────── Платежи ───────────────────────────────

/** Объект платежа (инвойса). */
export interface Payment {
  uuid: string;
  order_id: string;
  amount: string;
  payment_amount: string | null;
  amount_paid: string;
  amount_remaining: string;
  payer_amount: string;
  payer_currency: string;
  currency: string;
  network: string;
  address: string;
  address_qr_code: string;
  payment_status: PaymentStatus;
  is_multi: boolean;
  url: string;
  expired_at: number;
  is_final: boolean;
  created_at: string;
  updated_at: string;
  additional_data: string;
  payer_email: string;
  url_return: string;
  url_success: string;
  rate_expires_at: number;
  confirmations: number;
  required_confirmations: number;
  txid: string;
  /** С v1.1.0: адрес, с которого пришли деньги (если известен; в UTXO-сетях может отсутствовать). */
  payer_address?: string;
  /** С v1.1.0: возвраты по платежу. */
  refunds?: PaymentRefundEntry[];
  /** С v1.1.0: агрегированный статус возвратов. */
  refund_status?: 'none' | 'partial' | 'full';
}

/** Запись возврата в `Payment.refunds` (v1.1.0). */
export interface PaymentRefundEntry {
  uuid?: string;
  amount?: string;
  currency?: string;
  network?: string;
  address?: string;
  status?: string;
  created_at?: string;
  [key: string]: unknown;
}

/** Параметры создания платежа (`POST /v1/payment`). */
export interface CreatePaymentParams {
  amount: string;
  currency: string;
  order_id?: string;
  network?: string;
  to_currency?: string;
  lifetime?: number;
  subtract?: number;
  accuracy_payment_percent?: number;
  url_callback?: string;
  url_return?: string;
  url_success?: string;
  additional_data?: string;
  payer_email?: string;
  theme?: 'dark' | 'light';
  is_payment_multiple?: boolean;
  is_refresh?: boolean;
  /**
   * Свой ключ идемпотентности (v1.1.0). Уходит HTTP-заголовком `Idempotency-Key`, НЕ в тело.
   * Если не задан, SDK генерирует UUID один раз на вызов (стабилен между внутренними повторами).
   */
  idempotency_key?: string;
}

/** Ссылка на объект по uuid или order_id (нужен хотя бы один). */
export interface Lookup {
  uuid?: string;
  order_id?: string;
}

export interface HistoryParams {
  limit?: number;
  offset?: number;
  status?: string;
}

export interface PaymentList {
  items: Array<Partial<Payment> & Pick<Payment, 'uuid' | 'order_id' | 'amount' | 'payment_status' | 'is_final'>>;
  paginate: Paginate;
}

export interface ServiceMethod {
  network: string;
  currency: string;
  is_available: boolean;
  limit: { min_amount: string; max_amount: string };
  commission: { fee_amount: string; percent: string };
}

// ─────────────────────────────── Кошельки ───────────────────────────────

/** Объект статического кошелька. */
export interface Wallet {
  uuid: string;
  address: string;
  network: string;
  currency: string;
  order_id: string;
  url: string;
}

export interface CreateWalletParams {
  currency: string;
  network: string;
  order_id?: string;
}

export interface BlockWalletParams {
  address: string;
  is_force_block?: boolean;
}

export interface BlockedRefundParams {
  uuid: string;
  address: string;
}

export interface Balance {
  balance: {
    merchant: Array<{ currency: string; balance: string }>;
  };
}

export interface ReferralInfo {
  code: string;
  link: string;
  /** Доля нашей комиссии рефереру по месяцам, в bps. */
  tier_bps: number[];
  referred_count: number;
  /** Валюта → сумма в minor-единицах (строкой). */
  earnings_by_asset: Record<string, string>;
}

// ─────────────────────────────── Выплаты ───────────────────────────────

/** Объект выплаты. */
export interface Payout {
  uuid: string;
  order_id: string;
  amount: string;
  currency: string;
  network: string;
  address: string;
  txid: string;
  status: PayoutStatus;
  is_final: boolean;
  approval_required: boolean;
  source: string;
  created_at: string;
  updated_at: string;
  /** Присутствует при использовании from_currency. */
  convert?: {
    from_currency: string;
    to_currency: string;
    from_amount: string;
    rate: string;
  };
}

export interface CreatePayoutParams {
  amount: string;
  currency: string;
  order_id: string;
  address: string;
  network?: string;
  is_subtract?: boolean;
  memo?: string;
  url_callback?: string;
  from_currency?: string;
  source?: 'api' | 'manual';
  /**
   * Свой ключ идемпотентности (v1.1.0). Уходит HTTP-заголовком `Idempotency-Key`, НЕ в тело.
   * Если не задан, SDK генерирует UUID один раз на вызов (стабилен между внутренними повторами).
   */
  idempotency_key?: string;
}

export interface MassPayoutItem {
  uuid?: string;
  order_id: string;
  status?: PayoutStatus;
  is_final?: boolean;
  approval_required?: boolean;
  success: boolean;
  message?: string;
}

export interface CalculatePayoutParams {
  amount: string;
  currency: string;
  network?: string;
  is_subtract?: boolean;
}

export interface PayoutCalculation {
  amount: string;
  currency: string;
  network: string;
  commission: string;
  merchant_amount: string;
  to_amount: string;
}

export interface RefundParams {
  /**
   * Адрес возврата. С v1.1.0 не обязателен — по умолчанию средства вернутся на адрес плательщика
   * (`payer_address`). Для Bitcoin/UTXO-сетей адрес плательщика неизвестен — там `address` нужен.
   */
  address?: string;
  uuid?: string;
  order_id?: string;
  network?: string;
  amount?: string;
  /**
   * Свой ключ идемпотентности (v1.1.0). Уходит HTTP-заголовком `Idempotency-Key`, НЕ в тело.
   * Если не задан, SDK генерирует UUID один раз на вызов.
   */
  idempotency_key?: string;
}

// ─────────────────────────────── Курсы ───────────────────────────────

export interface ExchangeRate {
  from: string;
  to: string;
  course: string;
}

/** Сеть в публичном каталоге `GET /v1/currencies`. */
export interface CurrencyNetwork {
  network: string;
  /** `native` (монета сети) или `token`. */
  kind: 'native' | 'token';
  /** Адрес контракта токена (только для `token`). */
  contract?: string;
  min_confirmations: number;
  /** Доступен ли приём (синоним `deposit_available`). */
  available: boolean;
  deposit_available: boolean;
  payout_available: boolean;
}

/** Актив в публичном каталоге `GET /v1/currencies`. */
export interface Currency {
  symbol: string;
  decimals: number;
  networks: CurrencyNetwork[];
}

/**
 * Разобранное тело боевого вебхука. Поле `type` различает семейство события
 * (`payment` — счёт, `wallet` — пополнение статик-кошелька, `payout` — выплата). Часть полей зависит
 * от семейства, поэтому индекс-сигнатура допускает дополнительные ключи. Передавайте этот тип
 * generic-ом в {@link constructWebhookEvent}.
 */
export interface WebhookEvent {
  type: 'payment' | 'wallet' | 'payout';
  uuid: string;
  order_id: string;
  /** Для платежа/кошелька — `payment_status`; для выплаты — укрупнённый статус (`paid`/`process`/…). */
  status: string;
  is_final: boolean;
  txid?: string;
  amount?: string;
  currency?: string;
  network?: string;
  address?: string;
  payment_amount?: string;
  payer_amount?: string;
  payer_currency?: string;
  additional_data?: string;
  [key: string]: unknown;
}

// ─────────────────────────────── Вебхуки/настройки ───────────────────────────────

export interface WebhookRegistration {
  endpoint_id: string;
  url: string;
  /** Секрет для проверки подписи вебхуков. Показывается один раз. */
  secret: string;
}

export interface Delivery {
  id: string;
  url: string;
  event_type: string;
  status: 'pending' | 'delivered' | 'dead';
  attempts: number;
  last_error: string;
  created_at: string;
  updated_at: string;
}

export interface AcceptedMethod {
  currency: string;
  network: string;
}

export interface AutoWithdrawRule {
  currency: string;
  network: string;
  address: string;
  /** Порог в minor-единицах ("0" = без порога). */
  min_minor: string;
}

// ─────────────────────────────── Батчи (v1.1.0) ───────────────────────────────

/** Поведение батча при ошибке элемента: продолжать (по умолчанию) или остановиться на первой. */
export type BatchOnError = 'continue' | 'stop';

/** Опции создающих batch-методов. */
export interface BatchOptions {
  /** `continue` (по умолчанию) — плохой элемент фейлит только себя; `stop` — остановиться на первой ошибке. */
  onError?: BatchOnError;
  /** Свой ключ идемпотентности. Уходит заголовком `Idempotency-Key`; если не задан — SDK генерирует UUID. */
  idempotency_key?: string;
}

/** Ответ постановки батча (`/v1/payment/batch`, `/v1/refund/batch`, `/v1/payout/batch`). */
export interface BatchSubmitResult {
  batch_id: string;
  kind: string;
  count: number;
  status: BatchStatus;
}

export type BatchStatus = 'pending' | 'processing' | 'completed';

/** Элемент возврата в `payments.refundBatch`. `reference` и `uuid`/`order_id` инвойса обязательны. */
export interface RefundBatchItem {
  /** Per-item ключ дедупликации возврата (обязателен в батче; скоуп — инвойс). */
  reference: string;
  uuid?: string;
  order_id?: string;
  /** С v1.1.0 не обязателен — по умолчанию адрес плательщика (кроме Bitcoin/UTXO). */
  address?: string;
  network?: string;
  amount?: string;
}

/** Результат одного элемента батча в `batches.info`. */
export interface BatchItem {
  idx: number;
  status: string;
  order_id?: string;
  /** Байт-в-байт сохранённый result соответствующего единичного эндпоинта. */
  result?: unknown;
  error?: string;
}

/** Ответ `POST /v1/batch/info`. */
export interface BatchInfo {
  batch_id: string;
  kind: string;
  status: BatchStatus;
  on_error: BatchOnError;
  total: number;
  succeeded: number;
  failed: number;
  created_at: string;
  updated_at: string;
  items: BatchItem[];
}

// ─────────────────────────── Платёжные ссылки (v1.1.0) ───────────────────────────

/** Режим суммы платёжной ссылки: фиксированная, свободная или диапазон. */
export type PaymentLinkAmountMode = 'fixed' | 'open' | 'range';

/** Параметры создания платёжной ссылки (`POST /v1/payment/link`). */
export interface CreatePaymentLinkParams {
  amount_mode: PaymentLinkAmountMode;
  /** Валюта ЦЕНЫ (фиат или монета — как в `payments.create`). */
  currency: string;
  title?: string;
  description?: string;
  /** Обязательна при `amount_mode: 'fixed'`. */
  amount_fixed?: string;
  /** Нижняя граница при `amount_mode: 'range'`. */
  amount_min?: string;
  /** Верхняя граница при `amount_mode: 'range'`. */
  amount_max?: string;
  /** Закрепить валюту расчёта (иначе выберет плательщик). */
  pinned_currency?: string;
  /** Закрепить сеть расчёта. */
  pinned_network?: string;
  /** Срок жизни в СЕКУНДАХ. 0 или отсутствие — бессрочная ссылка. */
  expires_in?: number;
}

/** Ответ создания платёжной ссылки. */
export interface PaymentLinkCreated {
  link_id: string;
  url: string;
}

/** Платёжная ссылка в list/info. */
export interface PaymentLink {
  link_id: string;
  title?: string;
  description?: string;
  amount_mode: PaymentLinkAmountMode;
  currency: string;
  active: boolean;
  url: string;
  created_at: string;
  amount_fixed?: string;
  amount_min?: string;
  amount_max?: string;
  pinned_currency?: string;
  pinned_network?: string;
  expires_at?: string;
}

/** Ответ `links.info`: ссылка + платежи по ней. */
export interface PaymentLinkInfo extends PaymentLink {
  payments: Array<{
    uuid: string;
    status: string;
    amount: string;
    currency: string;
    created_at: string;
    order_id?: string;
  }>;
}

/** Параметры публичного чекаута по ссылке (`POST /v1/link/{id}/checkout`). */
export interface LinkCheckoutParams {
  /** Обязательна при `amount_mode: 'open' | 'range'`; у `fixed` игнорируется. */
  amount?: string;
  /** Валюта расчёта (если не закреплена в ссылке). */
  currency?: string;
  /** Сеть расчёта (если не закреплена в ссылке). */
  network?: string;
  payer_email?: string;
}

// ─────────────────────────────── Сплиты (v1.1.0) ───────────────────────────────

/**
 * Параметры правила сплита: ЛИБО внешний адрес (`address`+`network`, необратимо),
 * ЛИБО аккаунт на платформе (`merchant_id`, обратимо при возврате). Ровно одно из двух.
 */
export interface CreateSplitRuleParams {
  address?: string;
  network?: string;
  merchant_id?: string;
  /** Доля в процентах, шаг 0.01 (0 < percent ≤ 100; сумма активных правил тоже ≤ 100). */
  percent: number;
  note?: string;
}

/** Правило сплита в `splits.listRules`. */
export interface SplitRule {
  rule_id: string;
  percent: number;
  active: boolean;
  note?: string;
  address?: string;
  network?: string;
  merchant_id?: string;
  /** `false` — доля ушла на внешний адрес (необратимо); `true` — партнёру на платформе (отзовётся при возврате). */
  reversible: boolean;
}

/** Настройки сплитов: окно удержания исходящей маршрутизации после settle. */
export interface SplitConfig {
  refund_hold_hours: number;
}

// ──────────────────────── Счёт на e-mail и resolve (v1.1.0) ────────────────────────

/** Параметры `payments.sendEmail` (`POST /v1/payment/send-email`). */
export interface SendEmailParams {
  uuid?: string;
  order_id?: string;
  /** Получатель. Если не задан — берётся `payer_email` платежа (иначе `email.no_recipient`). */
  email?: string;
}

export interface SendEmailResult {
  sent: boolean;
  email: string;
  uuid: string;
}

/** Параметры `payments.resolve` (`POST /v1/payment/resolve`) — судьба недоплаченного платежа. */
export interface ResolveParams {
  uuid?: string;
  order_id?: string;
  /** `accept` — оставить частичную оплату (глушит авто-возврат); `refund` — вернуть плательщику. */
  action: 'accept' | 'refund';
  /** Только refund: адрес возврата; по умолчанию `payer_address` инвойса (для UTXO обязателен). */
  address?: string;
  /** Только refund: сеть; по умолчанию сеть инвойса. */
  network?: string;
  /** Только refund: per-refund ключ дедупликации (уйдёт в reference рефанд-выплаты). */
  reference?: string;
  /** Свой ключ идемпотентности. Уходит заголовком `Idempotency-Key`; если не задан — SDK генерирует UUID. */
  idempotency_key?: string;
}

/** Результат `payments.resolve`. Набор полей зависит от `resolution`. */
export interface ResolveResult {
  payment_uuid: string;
  order_id: string;
  resolution: 'accepted' | 'refunded';
  currency: string;
  /** accept: сколько оставлено мерчанту. */
  amount_kept?: string;
  /** refund: uuid рефанд-выплаты. */
  uuid?: string;
  /** refund: сумма возврата. */
  amount?: string;
  /** refund: адрес возврата. */
  address?: string;
  /** refund: статус рефанд-выплаты (`check`/`process`/`paid`/`fail`/`cancel`). */
  status?: string;
  /** refund: терминальность статуса. */
  is_final?: boolean;
}

// ─────────────────────── Payout links — крипто-чеки (v1.1.0) ───────────────────────

/**
 * Статус payout-ссылки:
 * - `funded` — создана, резерв удержан, ждёт claim;
 * - `claiming` — claim в процессе (адрес зафиксирован, выплата порождается);
 * - `claimed` — выплата порождена (терминальный);
 * - `expired` — срок вышел без claim, резерв возвращён (терминальный);
 * - `cancelled` — отменена мерчантом до claim, резерв возвращён (терминальный).
 */
export type PayoutLinkStatus = 'funded' | 'claiming' | 'claimed' | 'expired' | 'cancelled';

/** Параметры создания payout-ссылки (`POST /v1/payout/link`). */
export interface CreatePayoutLinkParams {
  /** Крипто-актив выплаты (uppercase), например `USDT`. */
  currency: string;
  /** Сеть выплаты получателю, например `tron`. */
  network: string;
  /** Сумма (строкой) в `currency`. */
  amount: string;
  /**
   * Per-link ключ дедупликации (уникален в рамках мерчанта). Именно он защищает от дублей —
   * заголовок `Idempotency-Key` на этом эндпоинте не действует.
   */
  reference?: string;
  /** Лейбл, виден получателю. */
  title?: string;
  /** Заметка, видна получателю (и в письме). */
  note?: string;
  /** E-mail получателя — придёт письмо с кнопкой claim (best-effort). */
  email?: string;
  /**
   * Окно claim в ЧАСАХ, клампится в [1, 720]. РЕКОМЕНДУЕТСЯ задавать явно:
   * при 0/отсутствии бэкенд клампит к 1 часу (НЕ к 720).
   */
  expires_in_hours?: number;
}

/** Payout-ссылка в list/info/cancel (без claim-токена). */
export interface PayoutLink {
  link_id: string;
  status: PayoutLinkStatus;
  amount: string;
  currency: string;
  network: string;
  title?: string;
  note?: string;
  expires_at: string;
  created_at: string;
  reference?: string;
  email?: string;
  /** UUID порождённой выплаты (после claim). */
  payout_id?: string;
  /** Адрес получателя (после claim). */
  claim_address?: string;
  /** Общий id батча (для ссылок из `createBatch`). */
  batch_id?: string;
}

/**
 * Ответ создания payout-ссылки. `claim_token`/`claim_url` возвращаются ТОЛЬКО здесь
 * (хранится лишь хеш токена) — сохраните их сразу.
 */
export interface PayoutLinkCreated extends PayoutLink {
  claim_token: string;
  claim_url: string;
}

/** Элемент ответа `payoutLinks.createBatch` (index-aligned с запросом). */
export interface PayoutLinkBatchItem {
  ok: boolean;
  link?: PayoutLinkCreated;
  error?: string;
  message?: string;
}

/** Ответ `POST /v1/payout/link/batch`. */
export interface PayoutLinkBatchResult {
  created: number;
  total: number;
  results: PayoutLinkBatchItem[];
}

/** Публичные детали ссылки для страницы claim (`GET /v1/claim/{token}`). */
export interface PayoutLinkClaimInfo {
  status: PayoutLinkStatus;
  amount: string;
  currency: string;
  network: string;
  title?: string;
  note?: string;
  expires_at: string;
  /** Можно ли забрать прямо сейчас (`funded` и срок не вышел). */
  claimable: boolean;
}

/** Результат успешного claim (`POST /v1/claim/{token}`). */
export interface PayoutLinkClaimResult {
  status: 'claimed';
  payout_id: string;
  amount: string;
  currency: string;
  network: string;
  address: string;
}

// ---------------------------------------------------------------------------
// v1.2.0: песочница разработчика (sandbox) — ТОЛЬКО для тестовых ключей
// ---------------------------------------------------------------------------

/** Параметры симуляции он-чейн депозита в инвойс (`POST /v1/sandbox/deposit`). */
export interface SandboxDepositParams {
  /** UUID инвойса, который «оплачивает» виртуальный покупатель. */
  invoice_id: string;
  /**
   * Сумма депозита. Не задана/пустая строка — заплатить ровно сумму к оплате;
   * меньшее/большее значение симулирует недоплату/переплату.
   */
  amount?: string;
  /**
   * Число подтверждений. Не задано/0 — депозит сразу полностью подтверждён; небольшое число —
   * транзакция приходит ещё pending (дозреет через ~10 минут или при повторе того же `txid`
   * с бОльшим числом подтверждений).
   */
  confirmations?: number;
  /**
   * Идентификатор транзакции. Не задан — сгенерируется новый; повтор того же `txid` позволяет
   * тестировать идемпотентность и «углубление» подтверждений.
   */
  txid?: string;
}

/** Результат симуляции депозита. */
export interface SandboxDeposit {
  invoice_id: string;
  txid: string;
  amount: string;
  confirmations: number;
}

/** Параметры пополнения тестового баланса (`POST /v1/sandbox/faucet`). */
export interface SandboxFaucetParams {
  /** Актив, например `USDT`. */
  asset: string;
  /** Сумма (строка), максимум 1000000 за вызов. */
  amount: string;
  /** Опциональный ключ идемпотентности (в теле запроса — так требует контракт эндпоинта). */
  idempotency_key?: string;
}

/** Результат faucet-пополнения. */
export interface SandboxFaucetResult {
  asset: string;
  amount: string;
  journal_id: string;
}

/** Результат сброса песочницы (`POST /v1/sandbox/reset`). */
export interface SandboxResetResult {
  /** Сколько открытых инвойсов отменено. */
  invoices_cancelled: number;
  /** Сколько балансов обнулено (компенсирующей проводкой — история сохраняется). */
  balances_zeroed: number;
}

/** Доставка вебхука в журнале песочницы (`GET /v1/sandbox/webhooks`) — {@link Delivery} + сырой payload. */
export interface SandboxDelivery extends Delivery {
  /** Сырое тело вебхука (JSON-объект как есть). */
  payload: Record<string, unknown>;
}

/** Результат перепостановки доставки (`POST /v1/sandbox/webhooks/replay`). */
export interface SandboxReplayResult {
  delivery_id: string;
  requeued: boolean;
}

// ---------------------------------------------------------------------------
// v1.2.0: переводы пользователям платформы и публичный чекаут /v1/pay
// ---------------------------------------------------------------------------

/**
 * Элемент перевода пользователю платформы: тело `POST /v1/transfer/to-user` и элементы
 * `account.transferBatch` (`POST /v1/transfer/batch`).
 */
export interface TransferToUserItem {
  /**
   * Идентификатор ПОЛЬЗОВАТЕЛЯ платформы — UUID, НЕ username (не-UUID бэкенд отклоняет:
   * `transfer.bad_recipient`). Username резолвится в user_id на стороне кабинета
   * (публичный профиль), ядро username'ов сознательно не знает.
   */
  to_user_id: string;
  /** Сумма (строкой) в `currency`. */
  amount: string;
  /** Крипто-актив, например `USDT`. */
  currency: string;
  /** Ваш бизнес-идентификатор. Участвует в лестнице идемпотентности бэкенда (header → order_id → подпись). */
  order_id?: string;
}

/** Параметры `account.transferToUser` (`POST /v1/transfer/to-user`). */
export interface TransferToUserParams extends TransferToUserItem {
  /**
   * Свой ключ идемпотентности. Уходит HTTP-заголовком `Idempotency-Key`, НЕ в тело.
   * Если не задан, SDK генерирует UUID один раз на вызов (стабилен между внутренними повторами).
   */
  idempotency_key?: string;
}

/** Результат `POST /v1/transfer/to-user`. */
export interface TransferToUserResult {
  currency: string;
  amount: string;
  /** Канонизированный UUID получателя. */
  to_user_id: string;
  /** Новый баланс личного кошелька получателя в `currency`. */
  recipient_balance: string;
}

/**
 * Публичное состояние счёта для кастомного чекаута (`GET /v1/pay/{id}`,
 * `POST /v1/pay/{id}/select`) — {@link Payment} без мерчант-приватных полей
 * (`additional_data`, `payer_email`, `payer_address`).
 */
export interface PublicPayment
  extends Omit<Payment, 'payment_status' | 'additional_data' | 'payer_email' | 'payer_address'> {
  /**
   * Как `Payment.payment_status`, плюс `'select'` — валюто-агностичный счёт ещё ждёт,
   * пока плательщик выберет валюту/сеть (адрес не выделен, курс не зафиксирован).
   */
  payment_status: PaymentStatus | 'select';
  /** Только при `payment_status === 'select'`: методы, из которых плательщик может выбрать. */
  accepted?: AcceptedMethod[];
  [key: string]: unknown;
}

/** Параметры публичного выбора валюты плательщиком (`POST /v1/pay/{id}/select`). */
export interface PaySelectParams {
  /** Крипто-актив расчёта, например `USDT`. */
  currency: string;
  /** Сеть расчёта, например `tron`. */
  network: string;
}
