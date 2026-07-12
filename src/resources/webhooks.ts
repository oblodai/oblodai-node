import { BaseResource } from './base.js';
import type { WebhookRegistration, Delivery } from '../models.js';

/**
 * Управление вебхуками. Проверка ВХОДЯЩИХ вебхуков — отдельные функции verifyWebhook /
 * constructWebhookEvent (импортируются из корня пакета), здесь только управление через API.
 */
export class Webhooks extends BaseResource {
  /**
   * Зарегистрировать (заменить) URL для вебхуков и получить секрет. `POST /v1/webhooks`
   * Внимание: возвращает объект БЕЗ конверта state/result; повторный вызов выдаёт новый секрет.
   */
  register(url: string): Promise<WebhookRegistration> {
    return this.http.request<WebhookRegistration>('/v1/webhooks', { url });
  }

  /** Журнал последних доставок (до 50). `POST /v1/webhooks/deliveries` */
  deliveries(): Promise<{ deliveries: Delivery[] }> {
    return this.http.request('/v1/webhooks/deliveries', {});
  }

  /** Пробный вебхук платежа. `POST /v1/test-webhook/payment` */
  testPayment(params: {
    url_callback: string;
    status?: string;
    currency?: string;
    network?: string;
    uuid?: string;
    order_id?: string;
  }): Promise<{ result: boolean; status_code: number }> {
    return this.http.request('/v1/test-webhook/payment', params);
  }

  /** Пробный вебхук кошелька. `POST /v1/test-webhook/wallet` */
  testWallet(params: {
    url_callback: string;
    status?: string;
    currency?: string;
    network?: string;
    uuid?: string;
    order_id?: string;
  }): Promise<{ result: boolean; status_code: number }> {
    return this.http.request('/v1/test-webhook/wallet', params);
  }

  /** Пробный вебхук выплаты. `POST /v1/test-webhook/payout` */
  testPayout(params: {
    url_callback: string;
    status?: string;
    currency?: string;
    network?: string;
    uuid?: string;
    order_id?: string;
  }): Promise<{ result: boolean; status_code: number }> {
    return this.http.request('/v1/test-webhook/payout', params);
  }
}
