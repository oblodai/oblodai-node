import { BaseResource } from './base.js';
import { idempotencyKeyFor } from './idempotency.js';
import type {
  Balance,
  ReferralInfo,
  TransferToUserItem,
  TransferToUserParams,
  TransferToUserResult,
  BatchOptions,
  BatchSubmitResult,
} from '../models.js';

/** Баланс, рефералы, переводы на личный кошелёк и пользователям платформы, VRCS. */
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

  /**
   * Перевод пользователю ПЛАТФОРМЫ (v1.2.0): внутренний перевод БЕЗ комиссии с баланса мерчанта
   * на личный кошелёк другого пользователя платформы. `POST /v1/transfer/to-user` (payout-ключ,
   * та же подпись, что у `/v1/payout`).
   *
   * `to_user_id` — UUID пользователя платформы, НЕ username (не-UUID бэкенд отклоняет:
   * `transfer.bad_recipient`); username → user_id резолвится публичным профилем кабинета.
   *
   * Идемпотентность — как у `payouts.create`: SDK генерирует ключ один раз до цикла ретраев и
   * шлёт заголовком `Idempotency-Key`; свой ключ — `params.idempotency_key` (в заголовок, не в
   * тело). Лестница на бэкенде: заголовок → `order_id` → подпись запроса.
   */
  transferToUser(params: TransferToUserParams): Promise<TransferToUserResult> {
    const { idempotency_key, ...body } = params;
    return this.http.request<TransferToUserResult>('/v1/transfer/to-user', body, {
      idempotencyKey: idempotencyKeyFor(idempotency_key),
    });
  }

  /**
   * Массовый («зарплатный») перевод пользователям платформы (v1.2.0): пачка элементов формата
   * `transferToUser`, обработка в фоне. `POST /v1/transfer/batch`.
   *
   * Прогресс и результаты по элементам — СУЩЕСТВУЮЩИМ методом `client.batches.info(batch_id)`
   * (`items[].result` — байт-в-байт result единичного `/v1/transfer/to-user`). Идемпотентность
   * вызова — заголовком `Idempotency-Key` (генерируется SDK или `opts.idempotency_key`).
   */
  transferBatch(
    transfers: TransferToUserItem[],
    opts: BatchOptions = {},
  ): Promise<BatchSubmitResult> {
    const body: Record<string, unknown> = { transfers };
    if (opts.onError) body.on_error = opts.onError;
    return this.http.request<BatchSubmitResult>('/v1/transfer/batch', body, {
      idempotencyKey: idempotencyKeyFor(opts.idempotency_key),
    });
  }

  /** Включить/выключить VRCS. Без enabled — чтение. `POST /v1/vrcs` */
  vrcs(enabled?: boolean): Promise<{ enabled: boolean }> {
    const body = enabled === undefined ? {} : { enabled };
    return this.http.request<{ enabled: boolean }>('/v1/vrcs', body);
  }
}
