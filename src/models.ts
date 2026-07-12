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
  address: string;
  uuid?: string;
  order_id?: string;
  network?: string;
  amount?: string;
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
