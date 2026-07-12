import { BaseResource } from './base.js';
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

  /** Перевод средств на личный кошелёк владельца. `POST /v1/transfer/to-personal` */
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
    return this.http.request('/v1/transfer/to-personal', params);
  }

  /** Включить/выключить VRCS. Без enabled — чтение. `POST /v1/vrcs` */
  vrcs(enabled?: boolean): Promise<{ enabled: boolean }> {
    const body = enabled === undefined ? {} : { enabled };
    return this.http.request<{ enabled: boolean }>('/v1/vrcs', body);
  }
}
