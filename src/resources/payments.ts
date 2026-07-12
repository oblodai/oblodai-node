import { BaseResource } from './base.js';
import type {
  Payment,
  CreatePaymentParams,
  Lookup,
  HistoryParams,
  PaymentList,
  ServiceMethod,
  AcceptedMethod,
} from '../models.js';

/** Методы приёма платежей. */
export class Payments extends BaseResource {
  /** Создать платёжный счёт (инвойс). `POST /v1/payment` */
  create(params: CreatePaymentParams): Promise<Payment> {
    return this.http.request<Payment>('/v1/payment', params);
  }

  /** Информация о счёте по uuid или order_id. `POST /v1/payment/info` */
  info(lookup: Lookup): Promise<Payment> {
    return this.http.request<Payment>('/v1/payment/info', lookup);
  }

  /** Список платежей мерчанта. `POST /v1/payment/history` */
  history(params: HistoryParams = {}): Promise<PaymentList> {
    return this.http.request<PaymentList>('/v1/payment/history', params);
  }

  /** Доступные методы приёма. `POST /v1/payment/services` */
  services(): Promise<ServiceMethod[]> {
    return this.http.request<ServiceMethod[]>('/v1/payment/services', {});
  }

  /** QR-код депозит-адреса счёта (data:-URI). `POST /v1/payment/qr` */
  qr(lookup: Lookup): Promise<{ image: string }> {
    return this.http.request<{ image: string }>('/v1/payment/qr', lookup);
  }

  /** Переотправить текущий вебхук платежа. `POST /v1/payment/resend`. Ответ: `{ result: true }`. */
  resend(lookup: Lookup): Promise<{ result: boolean }> {
    return this.http.request<{ result: boolean }>('/v1/payment/resend', lookup);
  }

  /** Возврат средств платежа. `POST /v1/payment/refund` (см. также client.payouts.refund) */
  refund(params: {
    address: string;
    uuid?: string;
    order_id?: string;
    network?: string;
    amount?: string;
  }): Promise<unknown> {
    return this.http.request('/v1/payment/refund', params);
  }

  // ── Настройки приёма ──

  /** Список принимаемых валют для агностичных счетов. `POST /v1/payment/accepted/list` */
  listAccepted(): Promise<{ accepted: AcceptedMethod[] }> {
    return this.http.request('/v1/payment/accepted/list', {});
  }

  /** Заменить набор принимаемых валют. `POST /v1/payment/accepted/set` */
  setAccepted(accepted: AcceptedMethod[]): Promise<{ ok: boolean }> {
    return this.http.request('/v1/payment/accepted/set', { accepted });
  }

  /** Список правил скидок/наценок. `POST /v1/payment/discount/list` */
  listDiscounts(): Promise<Array<{ currency: string; network: string; discount_percent: number }>> {
    return this.http.request('/v1/payment/discount/list', {});
  }

  /** Задать скидку/наценку. `POST /v1/payment/discount/set` */
  setDiscount(params: {
    discount_percent: number;
    currency?: string;
    network?: string;
  }): Promise<unknown> {
    return this.http.request('/v1/payment/discount/set', params);
  }

  /** Прочитать допуск недоплаты. `POST /v1/payment/accuracy/get` */
  getAccuracy(): Promise<{ enabled: boolean; accuracy_percent: number }> {
    return this.http.request('/v1/payment/accuracy/get', {});
  }

  /** Задать допуск недоплаты. `POST /v1/payment/accuracy/set` */
  setAccuracy(params: { enabled: boolean; accuracy_percent?: number }): Promise<unknown> {
    return this.http.request('/v1/payment/accuracy/set', params);
  }

  /** Прочитать настройки автовозврата. `POST /v1/payment/autorefund/get` */
  getAutorefund(): Promise<{ overpay: boolean; underpay: boolean; configured: boolean }> {
    return this.http.request('/v1/payment/autorefund/get', {});
  }

  /** Задать настройки автовозврата. `POST /v1/payment/autorefund/set` */
  setAutorefund(params: { overpay: boolean; underpay: boolean }): Promise<unknown> {
    return this.http.request('/v1/payment/autorefund/set', params);
  }
}
