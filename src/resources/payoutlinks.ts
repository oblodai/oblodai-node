import { BaseResource } from "./base.js";
import { idempotencyKeyFor } from "./idempotency.js";
import type {
  CreatePayoutLinkParams,
  PayoutLink,
  PayoutLinkCreated,
  PayoutLinkBatchResult,
  PayoutLinkClaimInfo,
  PayoutLinkClaimResult,
} from "../models.js";

/**
 * Payout-ссылки — «крипто-чеки» (v1.1.0): вы резервируете средства в claimable-ссылку,
 * НЕ зная кошелька получателя. Получатель открывает `claim_url`, вводит свой адрес — из
 * резерва порождается обычная выплата. Непорученная ссылка возвращает резерв при
 * истечении срока или отмене.
 *
 * Management-методы (create/createBatch/list/info/cancel) требуют PAYOUT-ключ.
 * `claimInfo`/`claim` — публичные, БЕЗ подписи (авторизация — сам 256-битный токен в URL).
 *
 * Идемпотентность: `POST /v1/payout/link` и `POST /v1/payout/link/batch` ОБЁРНУТЫ на бэкенде в
 * idempotency-middleware, поэтому заголовок `Idempotency-Key` здесь РАБОТАЕТ. SDK шлёт его на
 * обоих создающих вызовах и держит НЕИЗМЕННЫМ на всех внутренних повторах, так что автоповтор
 * при 5xx/таймауте/сетевой ошибке безопасен: шлюз реплеит первый ответ (та же ссылка, тот же
 * `claim_token`, заголовок `Idempotent-Replayed: true`), а баланс дебетуется РОВНО ОДИН РАЗ.
 *
 * Коды, специфичные для повторов (все — терминальные, кроме 503):
 * - `400 idempotency.key_reused` — тот же ключ с ДРУГИМ телом;
 * - `400 idempotency.bad_key` — некорректный ключ (длиннее 255 символов);
 * - `409 idempotency.in_progress` — параллельный повтор, пока первый ещё выполняется; повторите
 *   чуть позже тем же ключом;
 * - `503 idempotency.unavailable` — стор идемпотентности недоступен (fail-closed by design);
 *   ретраибельна, SDK повторит сам.
 *
 * ⚠ БЕЗ заголовка поведение прежнее: два одинаковых вызова создадут ДВЕ ссылки с двумя резервами.
 *
 * Второй, durable слой защиты — опциональный per-link `reference` (уникален в рамках мерчанта):
 * он работает даже без заголовка и даже когда ответ батча слишком велик для кэша. Повторный
 * create с тем же `reference` отдаёт `409 payoutlink.duplicate_reference` (раньше был 500,
 * который SDK ретраил вхолостую).
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
   *
   * ⚠ `claim_url` собирает ШЛЮЗ из своего публичного базового URL (`.../claim/<claim_token>`).
   * На локальном стенде без `GATEWAY_PUBLIC_BASE_URL` он приходит ПУСТОЙ СТРОКОЙ — в проде шлюз
   * без этого URL не стартует, так что это не баг: просто собирайте ссылку сами из `claim_token`.
   * То же самое у `payment.url` (hosted-страница оплаты, `.../pay/<uuid>`).
   *
   * Свой ключ идемпотентности — `params.idempotency_key` (уходит заголовком, не в тело); иначе
   * SDK сгенерирует UUID один раз до цикла ретраев. Маршрут обёрнут idempotency-middleware, так
   * что повтор с тем же ключом реплеит первый ответ и НЕ резервирует средства второй раз —
   * см. описание класса.
   */
  create(params: CreatePayoutLinkParams): Promise<PayoutLinkCreated> {
    const { idempotency_key, ...body } = params;
    return this.http.request<PayoutLinkCreated>("/v1/payout/link", body, {
      idempotencyKey: idempotencyKeyFor(idempotency_key),
    });
  }

  /**
   * Создать до 500 ссылок одним запросом. `POST /v1/payout/link/batch`
   * Каждый элемент резервируется в своей транзакции (плохой фейлит только себя); ответ
   * index-aligned (`results[i]` ↔ `links[i]`), все созданные ссылки получают общий `batch_id`.
   * Больше 500 → `payoutlink.batch_too_large`.
   *
   * Ключ идемпотентности — на весь вызов (`opts.idempotency_key`, иначе UUID от SDK);
   * per-item `idempotency_key` смысла не имеет и в тело не уходит. Маршрут обёрнут
   * middleware'ом, повтор с тем же ключом реплеит ответ первой попытки.
   *
   * ⚠ Две особенности батча:
   * - частично упавший батч реплеится КАК ЕСТЬ — упавшие элементы под тем же ключом НЕ
   *   повторяются, их надо слать НОВЫМ ключом;
   * - ответ больше 256 КБ шлюз НЕ кэширует, и тогда повтор выполнится заново. Поэтому на
   *   батчах стоит проставлять per-item `reference` — второй, durable слой защиты
   *   (`409 payoutlink.duplicate_reference` вместо дубля).
   */
  createBatch(
    links: CreatePayoutLinkParams[],
    opts: { idempotency_key?: string } = {},
  ): Promise<PayoutLinkBatchResult> {
    const body = links.map(({ idempotency_key: _ignored, ...link }) => link);
    return this.http.request<PayoutLinkBatchResult>(
      "/v1/payout/link/batch",
      { links: body },
      {
        idempotencyKey: idempotencyKeyFor(opts.idempotency_key),
      },
    );
  }

  /** Список ссылок (created_at DESC; limit вне (0,200] → 50). `POST /v1/payout/link/list` */
  async list(params: { limit?: number; offset?: number } = {}): Promise<PayoutLink[]> {
    const res = await this.http.request<{ links: PayoutLink[] }>("/v1/payout/link/list", params);
    return res.links;
  }

  /** Информация о ссылке (после claim содержит `payout_id`, `claim_address`). `POST /v1/payout/link/info` */
  info(linkId: string): Promise<PayoutLink> {
    return this.http.request<PayoutLink>("/v1/payout/link/info", { link_id: linkId });
  }

  /**
   * Отменить непорученную (`funded`) ссылку — резерв вернётся на available.
   * `POST /v1/payout/link/cancel`. Уже забранная → `payoutlink.not_funded` (409);
   * гонка с claim разрешается в пользу claim (вернётся `status: 'claimed'` + `payout_id`).
   */
  cancel(linkId: string): Promise<PayoutLink> {
    return this.http.request<PayoutLink>("/v1/payout/link/cancel", { link_id: linkId });
  }

  /**
   * ПУБЛИЧНО (без подписи): детали ссылки для страницы claim. `GET /v1/claim/{token}`
   * Ничего мерчант-приватного не возвращает. `claimable === true` — можно забирать.
   */
  claimInfo(token: string): Promise<PayoutLinkClaimInfo> {
    return this.http.requestPublic<PayoutLinkClaimInfo>(
      `/v1/claim/${encodeURIComponent(token)}`,
      {},
      "GET",
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
