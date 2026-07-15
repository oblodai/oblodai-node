import { BaseResource } from './base.js';
import type {
  CreatePayoutLinkParams,
  PayoutLink,
  PayoutLinkCreated,
  PayoutLinkBatchResult,
  PayoutLinkClaimInfo,
  PayoutLinkClaimResult,
} from '../models.js';

/**
 * Payout-ссылки — «крипто-чеки» (v1.1.0): вы резервируете средства в claimable-ссылку,
 * НЕ зная кошелька получателя. Получатель открывает `claim_url`, вводит свой адрес — из
 * резерва порождается обычная выплата. Непорученная ссылка возвращает резерв при
 * истечении срока или отмене.
 *
 * Management-методы (create/createBatch/list/info/cancel) требуют PAYOUT-ключ.
 * `claimInfo`/`claim` — публичные, БЕЗ подписи (авторизация — сам 256-битный токен в URL).
 *
 * Идемпотентность: заголовок `Idempotency-Key` на `/v1/payout/link*` НЕ действует (эндпоинты
 * им не обёрнуты) — дедупликация здесь через опциональный per-link `reference` (уникален в
 * рамках мерчанта). ⚠ Повторный create с тем же `reference` сейчас отдаёт HTTP 500
 * (unique violation), а не реплей — не ретрайте его вслепую.
 */
export class PayoutLinks extends BaseResource {
  /**
   * Создать payout-ссылку (средства резервируются сразу: available → payout_held).
   * `POST /v1/payout/link`
   *
   * РЕКОМЕНДУЕТСЯ задавать `expires_in_hours` явно: при 0/отсутствии бэкенд клампит окно
   * claim к 1 часу (НЕ к максимуму); допустимый диапазон [1, 720] часов.
   * `claim_token`/`claim_url` возвращаются ТОЛЬКО в этом ответе (хранится лишь хеш) —
   * сохраните их сразу. При `email` получателю уйдёт письмо с кнопкой claim (best-effort).
   */
  create(params: CreatePayoutLinkParams): Promise<PayoutLinkCreated> {
    return this.http.request<PayoutLinkCreated>('/v1/payout/link', params);
  }

  /**
   * Создать до 500 ссылок одним запросом. `POST /v1/payout/link/batch`
   * Каждый элемент резервируется в своей транзакции (плохой фейлит только себя); ответ
   * index-aligned (`results[i]` ↔ `links[i]`), все созданные ссылки получают общий `batch_id`.
   * Больше 500 → `payoutlink.batch_too_large`. Дедуп — per-item `reference` (см. create).
   */
  createBatch(links: CreatePayoutLinkParams[]): Promise<PayoutLinkBatchResult> {
    return this.http.request<PayoutLinkBatchResult>('/v1/payout/link/batch', { links });
  }

  /** Список ссылок (created_at DESC; limit вне (0,200] → 50). `POST /v1/payout/link/list` */
  async list(params: { limit?: number; offset?: number } = {}): Promise<PayoutLink[]> {
    const res = await this.http.request<{ links: PayoutLink[] }>('/v1/payout/link/list', params);
    return res.links;
  }

  /** Информация о ссылке (после claim содержит `payout_id`, `claim_address`). `POST /v1/payout/link/info` */
  info(linkId: string): Promise<PayoutLink> {
    return this.http.request<PayoutLink>('/v1/payout/link/info', { link_id: linkId });
  }

  /**
   * Отменить непорученную (`funded`) ссылку — резерв вернётся на available.
   * `POST /v1/payout/link/cancel`. Уже забранная → `payoutlink.not_funded` (409);
   * гонка с claim разрешается в пользу claim (вернётся `status: 'claimed'` + `payout_id`).
   */
  cancel(linkId: string): Promise<PayoutLink> {
    return this.http.request<PayoutLink>('/v1/payout/link/cancel', { link_id: linkId });
  }

  /**
   * ПУБЛИЧНО (без подписи): детали ссылки для страницы claim. `GET /v1/claim/{token}`
   * Ничего мерчант-приватного не возвращает. `claimable === true` — можно забирать.
   */
  claimInfo(token: string): Promise<PayoutLinkClaimInfo> {
    return this.http.requestPublic<PayoutLinkClaimInfo>(
      `/v1/claim/${encodeURIComponent(token)}`,
      {},
      'GET',
    );
  }

  /**
   * ПУБЛИЧНО (без подписи): забрать средства на адрес получателя. `POST /v1/claim/{token}`
   * `memo` — dest tag/comment для сетей вроде TON. Идемпотентно: повторный claim уже
   * забранной ссылки возвращает ту же выплату; claim с ДРУГИМ адресом на взятой ссылке →
   * `payoutlink.claim_in_progress` (409). Истёкшая/отменённая → `payoutlink.expired` /
   * `payoutlink.cancelled` (409).
   */
  claim(token: string, params: { address: string; memo?: string }): Promise<PayoutLinkClaimResult> {
    return this.http.requestPublic<PayoutLinkClaimResult>(
      `/v1/claim/${encodeURIComponent(token)}`,
      params,
    );
  }
}
