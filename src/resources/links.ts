import { BaseResource } from './base.js';
import type {
  CreatePaymentLinkParams,
  PaymentLinkCreated,
  PaymentLink,
  PaymentLinkInfo,
  LinkCheckoutParams,
  Payment,
} from '../models.js';

/**
 * Платёжные ссылки (v1.1.0): переиспользуемая ссылка, по которой платят многие —
 * каждый платёж порождает свой инвойс со своим адресом. Единственный способ принимать
 * платежи вообще без бэкенда (Tilda, Wix и т.п.).
 *
 * Management-методы (create/list/info/toggle) подписываются платёжным ключом; заголовок
 * `Idempotency-Key` на них не действует (эндпоинты им не обёрнуты). `publicGet`/`checkout` —
 * публичные, без подписи (для кода на стороне плательщика).
 */
export class Links extends BaseResource {
  /**
   * Создать платёжную ссылку. `POST /v1/payment/link`
   * `expires_in` — в СЕКУНДАХ; 0/отсутствие = бессрочная. Ответ: `{ link_id, url }`.
   */
  create(params: CreatePaymentLinkParams): Promise<PaymentLinkCreated> {
    return this.http.request<PaymentLinkCreated>('/v1/payment/link', params);
  }

  /** Список ссылок мерчанта. `POST /v1/payment/link/list` */
  async list(params: { limit?: number; offset?: number } = {}): Promise<PaymentLink[]> {
    const res = await this.http.request<{ items: PaymentLink[] }>('/v1/payment/link/list', params);
    return res.items;
  }

  /** Ссылка + платежи по ней. `POST /v1/payment/link/info` */
  info(linkId: string): Promise<PaymentLinkInfo> {
    return this.http.request<PaymentLinkInfo>('/v1/payment/link/info', { link_id: linkId });
  }

  /** Включить/выключить ссылку. `POST /v1/payment/link/toggle` */
  toggle(linkId: string, active: boolean): Promise<{ link_id: string; active: boolean }> {
    return this.http.request('/v1/payment/link/toggle', { link_id: linkId, active });
  }

  /**
   * Публичные детали ссылки. `GET /v1/link/{id}` — БЕЗ подписи (можно дергать со страницы
   * плательщика). Неактивная/истёкшая ссылка → `paylink.not_found` (404).
   */
  publicGet(linkId: string): Promise<PaymentLink> {
    return this.http.requestPublic<PaymentLink>(
      `/v1/link/${encodeURIComponent(linkId)}`,
      {},
      'GET',
    );
  }

  /**
   * Публичный чекаут по ссылке: порождает обычный инвойс. `POST /v1/link/{id}/checkout` —
   * БЕЗ подписи. Закреплённые в ссылке валюта/сеть побеждают переданные. Лимит: 30 инвойсов/мин
   * на ссылку (`paylink.rate_limited`). Ответ — обычный объект платежа (`uuid` + `url`).
   */
  checkout(linkId: string, params: LinkCheckoutParams = {}): Promise<Payment> {
    return this.http.requestPublic<Payment>(
      `/v1/link/${encodeURIComponent(linkId)}/checkout`,
      params,
    );
  }
}
