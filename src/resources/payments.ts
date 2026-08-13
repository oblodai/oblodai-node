import { BaseResource } from "./base.js";
import { idempotencyKeyFor } from "./idempotency.js";
import type {
  Payment,
  CreatePaymentParams,
  Lookup,
  HistoryParams,
  PaymentList,
  ServiceMethod,
  AcceptedMethod,
  RefundParams,
  BatchOptions,
  BatchSubmitResult,
  RefundBatchItem,
  SendEmailParams,
  SendEmailResult,
  ResolveParams,
  ResolveResult,
  PublicPayment,
  PaySelectParams,
} from "../models.js";

/** Методы приёма платежей. */
export class Payments extends BaseResource {
  /**
   * Создать платёжный счёт (инвойс). `POST /v1/payment`
   *
   * Идемпотентность (v1.1.0): SDK генерирует ключ ОДИН раз до цикла ретраев и шлёт его
   * HTTP-заголовком `Idempotency-Key` (в подпись не входит) — автоматический повтор
   * (таймаут/5xx/сеть) не создаёт дубль счёта. Свой ключ — через `params.idempotency_key`
   * (уйдёт в заголовок, НЕ в тело).
   *
   * ЛОМАЮЩЕЕ изменение против v1.0.x: SDK больше НЕ подставляет автоматический
   * `order_id` (`idem-<uuid>`) — `order_id` уходит ровно так, как передали вы
   * (не задали — в платеже его не будет). Задавайте свой `order_id`, чтобы потом
   * находить платёж через `payments.info`.
   */
  create(params: CreatePaymentParams): Promise<Payment> {
    const { idempotency_key, ...body } = params;
    return this.http.request<Payment>("/v1/payment", body, {
      idempotencyKey: idempotencyKeyFor(idempotency_key),
    });
  }

  /**
   * Массовое создание платежей — до 5000 одним подписанным запросом (одна отметка rate-limit).
   * `POST /v1/payment/batch`. Обработка в фоне: результат по элементам — через
   * `client.batches.info(batch_id)`.
   *
   * На каждом элементе ОБЯЗАТЕЛЕН `order_id` (`batch.order_id_required`); дубликат внутри
   * батча → `batch.duplicate_order_id`. Идемпотентность вызова — заголовком `Idempotency-Key`
   * (генерируется SDK или `opts.idempotency_key`).
   */
  createBatch(
    payments: CreatePaymentParams[],
    opts: BatchOptions = {},
  ): Promise<BatchSubmitResult> {
    const body: Record<string, unknown> = { payments };
    if (opts.onError) body.on_error = opts.onError;
    return this.http.request<BatchSubmitResult>("/v1/payment/batch", body, {
      idempotencyKey: idempotencyKeyFor(opts.idempotency_key),
    });
  }

  /**
   * Массовый возврат — до 5000 одним запросом. `POST /v1/refund/batch`.
   * На каждом элементе обязательны `reference` (per-item ключ дедупликации) и
   * `uuid`/`order_id` инвойса. Идемпотентность вызова — заголовком `Idempotency-Key`.
   * Результат по элементам — `client.batches.info(batch_id)`.
   */
  refundBatch(refunds: RefundBatchItem[], opts: BatchOptions = {}): Promise<BatchSubmitResult> {
    const body: Record<string, unknown> = { refunds };
    if (opts.onError) body.on_error = opts.onError;
    return this.http.request<BatchSubmitResult>("/v1/refund/batch", body, {
      idempotencyKey: idempotencyKeyFor(opts.idempotency_key),
    });
  }

  /**
   * Отправить покупателю счёт на e-mail (письмо с кнопкой «Оплатить»). `POST /v1/payment/send-email`
   *
   * Получатель — `email` или `payer_email` платежа. Лимит: 10 писем/час на адрес получателя
   * (`email.rate_limited`). Заголовок `Idempotency-Key` на этом эндпоинте не действует
   * (эндпоинт им не обёрнут) — повтор вызова отправит письмо ещё раз.
   */
  sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
    return this.http.request<SendEmailResult>("/v1/payment/send-email", params);
  }

  /**
   * Решить судьбу НЕДОПЛАЧЕННОГО платежа (`payment_status === 'wrong_amount'`).
   * `POST /v1/payment/resolve` (нужен payout-ключ — операция может двигать деньги наружу).
   *
   * `action: 'accept'` — оставить частичную оплату себе (глушит авто-возврат);
   * `action: 'refund'` — вернуть плательщику (по умолчанию на `payer_address`; для UTXO
   * передайте `address`). Идемпотентно и заголовком `Idempotency-Key` (SDK генерирует сам),
   * и доменно: повторный accept — no-op, повторный refund — реплей той же выплаты.
   *
   * ⚠ Резолвится ТОЛЬКО закрытый недоплаченный счёт — `wrong_amount`. Пока счёт ещё живой и
   * ждёт доплату, его статус — `wrong_amount_waiting`, и resolve на нём отвечает
   * `409 resolution.not_underpaid` (как и на любом другом статусе): недоплату ещё могут
   * догнать переводом. Дождитесь `wrong_amount` — и только тогда решайте судьбу денег.
   * Тот же 409 прилетит, если поздняя доплата закрыла счёт уже в момент вашего вызова.
   */
  resolve(params: ResolveParams): Promise<ResolveResult> {
    const { idempotency_key, ...body } = params;
    return this.http.request<ResolveResult>("/v1/payment/resolve", body, {
      idempotencyKey: idempotencyKeyFor(idempotency_key),
    });
  }

  /** Информация о счёте по uuid или order_id. `POST /v1/payment/info` */
  info(lookup: Lookup): Promise<Payment> {
    return this.http.request<Payment>("/v1/payment/info", lookup);
  }

  /** Список платежей мерчанта. `POST /v1/payment/history` */
  history(params: HistoryParams = {}): Promise<PaymentList> {
    return this.http.request<PaymentList>("/v1/payment/history", params);
  }

  /** Доступные методы приёма. `POST /v1/payment/services` */
  services(): Promise<ServiceMethod[]> {
    return this.http.request<ServiceMethod[]>("/v1/payment/services", {});
  }

  /** QR-код депозит-адреса счёта (data:-URI). `POST /v1/payment/qr` */
  qr(lookup: Lookup): Promise<{ image: string }> {
    return this.http.request<{ image: string }>("/v1/payment/qr", lookup);
  }

  /** Переотправить текущий вебхук платежа. `POST /v1/payment/resend`. Ответ: `{ result: true }`. */
  resend(lookup: Lookup): Promise<{ result: boolean }> {
    return this.http.request<{ result: boolean }>("/v1/payment/resend", lookup);
  }

  /**
   * Возврат средств платежа. `POST /v1/payment/refund` (см. также client.payouts.refund)
   *
   * С v1.1.0 `address` не обязателен — по умолчанию вернём на адрес плательщика
   * (для Bitcoin/UTXO он неизвестен — там `address` нужен). Идемпотентность — заголовком
   * `Idempotency-Key` (SDK генерирует сам; свой — `params.idempotency_key`).
   */
  refund(params: RefundParams): Promise<unknown> {
    const { idempotency_key, ...body } = params;
    return this.http.request("/v1/payment/refund", body, {
      idempotencyKey: idempotencyKeyFor(idempotency_key),
    });
  }

  // ── Публичный чекаут (v1.2.0; без подписи) ──

  /**
   * ПУБЛИЧНО (без подписи): состояние счёта для КАСТОМНОЙ страницы оплаты. `GET /v1/pay/{id}`
   *
   * То, чем живёт hosted-страница оплаты: сумма, адрес (после выбора валюты), QR, статус,
   * срок — можно дергать из браузера плательщика и поллить статус без секрета мерчанта.
   * Мерчант-приватные поля (`additional_data`, `payer_email`, `payer_address`) не возвращаются.
   * У валюто-агностичного счёта до выбора валюты `payment_status === 'select'`, а в `accepted` —
   * методы, из которых плательщик может выбрать (см. {@link publicSelect}).
   */
  publicGet(uuid: string): Promise<PublicPayment> {
    return this.http.requestPublic<PublicPayment>(`/v1/pay/${encodeURIComponent(uuid)}`, {}, "GET");
  }

  /**
   * ПУБЛИЧНО (без подписи): плательщик выбирает валюту и сеть валюто-агностичного счёта.
   * `POST /v1/pay/{id}/select`
   *
   * Фиксирует курс, выделяет депозит-адрес и переводит счёт из `select` в обычный жизненный
   * цикл; ответ — финализированный счёт (та же форма, что у {@link publicGet}). Вместе с
   * `publicGet` это позволяет собрать полностью СВОЙ чекаут вместо hosted-страницы.
   * Повторный select уже выбранного счёта → `pay.not_selectable` (409).
   *
   * ⚠ `pay.method_not_accepted` на свежем мерчанте — норма, а не баг интеграции: пара
   * (currency, network) должна входить в принимаемый набор (`payments.setAccepted`), а когда
   * набор ПУСТ, набор по умолчанию — каталог методов с ЖИВЫМ наблюдателем депозитов, и на
   * локальном стенде без подключённых RPC он может оказаться пустым целиком. Не хардкодьте
   * пары в чекауте: берите их из `accepted` в ответе {@link publicGet}.
   */
  publicSelect(uuid: string, params: PaySelectParams): Promise<PublicPayment> {
    return this.http.requestPublic<PublicPayment>(
      `/v1/pay/${encodeURIComponent(uuid)}/select`,
      params,
    );
  }

  // ── Настройки приёма ──

  /** Список принимаемых валют для агностичных счетов. `POST /v1/payment/accepted/list` */
  listAccepted(): Promise<{ accepted: AcceptedMethod[] }> {
    return this.http.request("/v1/payment/accepted/list", {});
  }

  /** Заменить набор принимаемых валют. `POST /v1/payment/accepted/set` */
  setAccepted(accepted: AcceptedMethod[]): Promise<{ ok: boolean }> {
    return this.http.request("/v1/payment/accepted/set", { accepted });
  }

  /** Список правил скидок/наценок. `POST /v1/payment/discount/list` */
  listDiscounts(): Promise<Array<{ currency: string; network: string; discount_percent: number }>> {
    return this.http.request("/v1/payment/discount/list", {});
  }

  /** Задать скидку/наценку. `POST /v1/payment/discount/set` */
  setDiscount(params: {
    discount_percent: number;
    currency?: string;
    network?: string;
  }): Promise<unknown> {
    return this.http.request("/v1/payment/discount/set", params);
  }

  /** Прочитать допуск недоплаты. `POST /v1/payment/accuracy/get` */
  getAccuracy(): Promise<{ enabled: boolean; accuracy_percent: number }> {
    return this.http.request("/v1/payment/accuracy/get", {});
  }

  /** Задать допуск недоплаты. `POST /v1/payment/accuracy/set` */
  setAccuracy(params: { enabled: boolean; accuracy_percent?: number }): Promise<unknown> {
    return this.http.request("/v1/payment/accuracy/set", params);
  }

  /** Прочитать настройки автовозврата. `POST /v1/payment/autorefund/get` */
  getAutorefund(): Promise<{ overpay: boolean; underpay: boolean; configured: boolean }> {
    return this.http.request("/v1/payment/autorefund/get", {});
  }

  /** Задать настройки автовозврата. `POST /v1/payment/autorefund/set` */
  setAutorefund(params: { overpay: boolean; underpay: boolean }): Promise<unknown> {
    return this.http.request("/v1/payment/autorefund/set", params);
  }
}
