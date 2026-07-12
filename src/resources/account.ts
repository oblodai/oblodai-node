import { randomUUID } from 'node:crypto';
import { BaseResource } from './base.js';
import { needsIdempotencyKey } from './idempotency.js';
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
   * Если `order_id` не задан (или пуст/из одних пробелов), SDK подставляет стабильный
   * ключ идемпотентности (`idem-<uuid>`) ДО отправки — чтобы автоматический повтор не
   * создал повторный перевод. Ключ инъектируется в КОПИЮ — объект вызывающего не мутируется.
   */
  transferToPersonal(params: {
    amount: string;
    currency: string;
    order_id?: string;
  }): Promise<{
    currency: string;
    amount: string;
    direction: string;
    personal_balance: string;
  }> {
    const body = needsIdempotencyKey(params)
      ? { ...params, order_id: `idem-${randomUUID()}` }
      : params;
    return this.http.request('/v1/transfer/to-personal', body);
  }

  /** Включить/выключить VRCS. Без enabled — чтение. `POST /v1/vrcs` */
  vrcs(enabled?: boolean): Promise<{ enabled: boolean }> {
    const body = enabled === undefined ? {} : { enabled };
    return this.http.request<{ enabled: boolean }>('/v1/vrcs', body);
  }
}
