import { BaseResource } from './base.js';
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
} from '../models.js';
import type { Paginate } from '../types.js';

/** Методы выплат и возвратов. */
export class Payouts extends BaseResource {
  /** Создать выплату на внешний адрес. `POST /v1/payout` */
  create(params: CreatePayoutParams): Promise<Payout> {
    return this.http.request<Payout>('/v1/payout', params);
  }

  /** Массовая выплата (до 100). `POST /v1/payout/mass` */
  createMass(
    payouts: CreatePayoutParams[],
    source?: string,
  ): Promise<{ items: MassPayoutItem[] }> {
    const body: Record<string, unknown> = { payouts };
    if (source !== undefined) body.source = source;
    return this.http.request('/v1/payout/mass', body);
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

  /** Подтвердить выплату в статусе pending (для API-ключа обычно не нужно). `POST /v1/payout/approve` */
  approve(uuid: string): Promise<unknown> {
    return this.http.request('/v1/payout/approve', { uuid });
  }

  /** Возврат средств платежа (движок выплат). `POST /v1/payment/refund` */
  refund(params: RefundParams): Promise<unknown> {
    return this.http.request('/v1/payment/refund', params);
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
