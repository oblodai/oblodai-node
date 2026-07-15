import { BaseResource } from './base.js';
import { idempotencyKeyFor } from './idempotency.js';
import type { Balance, ReferralInfo } from '../models.js';

/** Баланс, рефералы, перевод на личный кошелёк, VRCS. */
export class Account extends BaseResource {
  /** Доступные балансы мерчанта. `POST /v1/balance` */
  balance(): Promise<Balance> {
    return this.http.request<Balance>('/v1/balance', {});
  }

  /** Реферальная статистика. `POST /v1/referral/info` */
  referral(): Promise<ReferralInfo> {
    return this.http.request<ReferralInfo>('/v1/referral/info', {});
  }

  /**
   * Перевод средств на личный кошелёк владельца. `POST /v1/transfer/to-personal`
   *
   * Идемпотентность (v1.1.0): SDK генерирует ключ один раз до цикла ретраев и шлёт заголовком
   * `Idempotency-Key` — автоматический повтор не создаёт повторный перевод. Свой ключ —
   * `params.idempotency_key` (в заголовок, не в тело). ЛОМАЮЩЕЕ изменение против v1.0.x:
   * автоматический `order_id` (`idem-<uuid>`) больше НЕ подставляется — `order_id` уходит как есть.
   */
  transferToPersonal(params: {
    amount: string;
    currency: string;
    order_id?: string;
    /** Свой ключ идемпотентности — уйдёт заголовком `Idempotency-Key`, не в тело. */
    idempotency_key?: string;
  }): Promise<{
    currency: string;
    amount: string;
    direction: string;
    personal_balance: string;
  }> {
    const { idempotency_key, ...body } = params;
    return this.http.request('/v1/transfer/to-personal', body, {
      idempotencyKey: idempotencyKeyFor(idempotency_key),
    });
  }

  /** Включить/выключить VRCS. Без enabled — чтение. `POST /v1/vrcs` */
  vrcs(enabled?: boolean): Promise<{ enabled: boolean }> {
    const body = enabled === undefined ? {} : { enabled };
    return this.http.request<{ enabled: boolean }>('/v1/vrcs', body);
  }
}
