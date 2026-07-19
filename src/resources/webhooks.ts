import { BaseResource } from './base.js';
import type { WebhookRegistration, Delivery } from '../models.js';

/**
 * Управление вебхуками. Проверка ВХОДЯЩИХ вебхуков — отдельные функции verifyWebhook /
 * constructWebhookEvent (импортируются из корня пакета), здесь только управление через API.
 */
export class Webhooks extends BaseResource {
  /**
   * Задать URL для вебхуков и получить секрет эндпоинта. `POST /v1/webhooks`
   *
   * ⚠ ЭТО UPSERT ЕДИНСТВЕННОГО ЭНДПОИНТА НА ПРОЕКТ, а не «добавить ещё один».
   * У проекта может быть ровно ОДИН вебхук-эндпоинт (в БД уникальность по `project_id`),
   * поэтому повторный `register()` с ДРУГИМ URL не создаёт второй эндпоинт, а
   * ПЕРЕНАПРАВЛЯЕТ доставки: возвращается ТОТ ЖЕ `endpoint_id`, а старый URL молча
   * перестаёт что-либо получать. Веерная рассылка на несколько URL средствами API
   * невозможна — разводите события у себя.
   *
   * Секрет при смене URL СОХРАНЯЕТСЯ (это не побочный эффект, а требование
   * корректности: доставки снимают секрет в момент постановки в очередь, и новый секрет
   * осиротил бы всё уже поставленное в очередь). На ПЕРВОЙ регистрации секрет
   * генерируется; отзыв скомпрометированного секрета — отдельное действие (ротация),
   * а не повторный `register()`.
   *
   * ⚠ Возвращаемый `secret` — СЕКРЕТ ЭНДПОИНТА, отдельный от секрета API-ключа. Именно
   * его передавайте в `verifyWebhook` / `constructWebhookEvent`; секрет API-ключа там не
   * подойдёт и отвергнет 100% вебхуков.
   *
   * Технически: ответ приходит БЕЗ конверта `state`/`result`.
   */
  register(url: string): Promise<WebhookRegistration> {
    return this.http.request<WebhookRegistration>('/v1/webhooks', { url });
  }

  /**
   * Журнал последних доставок (до 50, новые первыми). `POST /v1/webhooks/deliveries`
   *
   * ⚠ ЛОМАЮЩЕЕ изменение в v1.2.0: метод отдаёт МАССИВ `Delivery[]`, а не `{ deliveries }` —
   * конверт разворачивается, как в `sandbox.listWebhooks()` и `payoutLinks.list()`.
   */
  async deliveries(): Promise<Delivery[]> {
    const res = await this.http.request<{ deliveries: Delivery[] }>('/v1/webhooks/deliveries', {});
    return res.deliveries ?? [];
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
