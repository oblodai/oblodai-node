import { BaseResource } from './base.js';
import { idempotencyKeyFor } from './idempotency.js';
import type {
  Payout,
  CreatePayoutParams,
  MassPayoutItem,
  Lookup,
  HistoryParams,
  ServiceMethod,
  CalculatePayoutParams,
  PayoutCalculation,
  RefundParams,
  BatchOptions,
  BatchSubmitResult,
} from '../models.js';
import type { Paginate } from '../types.js';

/** Методы выплат и возвратов. */
export class Payouts extends BaseResource {
  /**
   * Создать выплату на внешний адрес. `POST /v1/payout`
   *
   * `order_id` обязателен всегда (`payout.order_id_required`) — это ВАШ бизнес-идентификатор.
   * Идемпотентность повторов (v1.1.0) — заголовком `Idempotency-Key`: SDK генерирует UUID
   * один раз до цикла ретраев; свой ключ — `params.idempotency_key` (в заголовок, не в тело).
   */
  create(params: CreatePayoutParams): Promise<Payout> {
    const { idempotency_key, ...body } = params;
    return this.http.request<Payout>('/v1/payout', body, {
      idempotencyKey: idempotencyKeyFor(idempotency_key),
    });
  }

  /**
   * Массовая выплата (до 100, синхронная). `POST /v1/payout/mass`
   * Идемпотентность вызова — заголовком `Idempotency-Key` (генерируется SDK или
   * `opts.idempotency_key`). Для тысяч выплат используйте {@link createBatch}.
   */
  createMass(
    payouts: CreatePayoutParams[],
    source?: string,
    opts: { idempotency_key?: string } = {},
  ): Promise<{ items: MassPayoutItem[] }> {
    const body: Record<string, unknown> = { payouts };
    if (source !== undefined) body.source = source;
    return this.http.request('/v1/payout/mass', body, {
      idempotencyKey: idempotencyKeyFor(opts.idempotency_key),
    });
  }

  /**
   * Массовое создание выплат — до 5000 одним подписанным запросом, обработка в фоне.
   * `POST /v1/payout/batch`. Результат по элементам — `client.batches.info(batch_id)`.
   *
   * На каждом элементе ОБЯЗАТЕЛЕН `order_id` (`batch.order_id_required`); дубликат внутри
   * батча → `batch.duplicate_order_id`. Идемпотентность вызова — заголовком `Idempotency-Key`.
   */
  createBatch(payouts: CreatePayoutParams[], opts: BatchOptions = {}): Promise<BatchSubmitResult> {
    const body: Record<string, unknown> = { payouts };
    if (opts.onError) body.on_error = opts.onError;
    return this.http.request<BatchSubmitResult>('/v1/payout/batch', body, {
      idempotencyKey: idempotencyKeyFor(opts.idempotency_key),
    });
  }

  /** Информация о выплате по uuid или order_id. `POST /v1/payout/info` */
  info(lookup: Lookup): Promise<Payout> {
    return this.http.request<Payout>('/v1/payout/info', lookup);
  }

  /** История выплат. `POST /v1/payout/history` */
  history(params: HistoryParams = {}): Promise<{ items: Partial<Payout>[]; paginate: Paginate }> {
    return this.http.request('/v1/payout/history', params);
  }

  /** Доступные методы выплат. `POST /v1/payout/services` */
  services(): Promise<ServiceMethod[]> {
    return this.http.request<ServiceMethod[]>('/v1/payout/services', {});
  }

  /** Предрасчёт комиссии и сумм без создания. `POST /v1/payout/calculate` */
  calculate(params: CalculatePayoutParams): Promise<PayoutCalculation> {
    return this.http.request<PayoutCalculation>('/v1/payout/calculate', params);
  }

  /**
   * Подтвердить выплату в статусе pending (для API-ключа обычно не нужно). `POST /v1/payout/approve`
   *
   * Ключ идемпотентности не нужен и не шлётся: это переход состояния, а не создание. Бэкенд
   * принимает только `StatusPending` и отвечает `409 payout.not_pending` в любом другом случае,
   * поэтому повторный approve физически не может одобрить или двинуть деньги дважды. Читайте
   * этот 409 как «уже одобрено» и уточняйте фактический статус через {@link info}.
   */
  approve(uuid: string): Promise<unknown> {
    return this.http.request('/v1/payout/approve', { uuid });
  }

  /**
   * Возврат средств платежа (движок выплат). `POST /v1/payment/refund`
   * С v1.1.0 `address` не обязателен (по умолчанию — адрес плательщика; для Bitcoin/UTXO нужен).
   * Идемпотентность — заголовком `Idempotency-Key` (SDK генерирует сам).
   */
  refund(params: RefundParams): Promise<unknown> {
    const { idempotency_key, ...body } = params;
    return this.http.request('/v1/payment/refund', body, {
      idempotencyKey: idempotencyKeyFor(idempotency_key),
    });
  }

  // ── Конфигурация комиссий ──

  /** Кто платит сетевую комиссию выплаты — чтение. `POST /v1/payout/fee-config/get` */
  getFeeConfig(): Promise<{ fee_on_recipient: boolean; configured: boolean }> {
    return this.http.request('/v1/payout/fee-config/get', {});
  }

  /** Кто платит сетевую комиссию выплаты — запись. `POST /v1/payout/fee-config/set` */
  setFeeConfig(feeOnRecipient: boolean): Promise<{ fee_on_recipient: boolean }> {
    return this.http.request('/v1/payout/fee-config/set', { fee_on_recipient: feeOnRecipient });
  }

  /** Кто несёт нашу комиссию при возврате — чтение. `POST /v1/payout/refund-fee-config/get` */
  getRefundFeeConfig(): Promise<{ fee_on_customer: boolean; configured: boolean }> {
    return this.http.request('/v1/payout/refund-fee-config/get', {});
  }

  /** Кто несёт нашу комиссию при возврате — запись. `POST /v1/payout/refund-fee-config/set` */
  setRefundFeeConfig(feeOnCustomer: boolean): Promise<{ fee_on_customer: boolean }> {
    return this.http.request('/v1/payout/refund-fee-config/set', { fee_on_customer: feeOnCustomer });
  }
}
