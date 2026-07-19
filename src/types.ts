/**
 * Общие типы Oblodai SDK.
 *
 * Суммы во всём API — строки в единицах валюты (например `"25.00"`), а не числа. SDK сохраняет их как
 * `string`, чтобы не терять точность на float. Отдельные поля приходят в минимальных единицах (minor) —
 * это отмечено в комментариях.
 */

/** Успешный конверт ответа API. */
export interface Envelope<T> {
  state: 0;
  result: T;
}

/** Конверт ошибки API. */
export interface ErrorEnvelope {
  error: { code: string; message: string };
}

/**
 * Статусы платежа (`payment_status`).
 *
 * ТЕРМИНАЛЬНЫЕ (`is_final: true`, статус больше не изменится): `paid`, `paid_over`,
 * `wrong_amount`, `cancel`. Остальные — промежуточные.
 *
 * ⚠ Не путайте `wrong_amount_waiting` и `wrong_amount` — это РАЗНЫЕ вещи:
 * первый означает «увидели часть суммы, счёт ещё живой, ждём доплату» и НЕ терминален
 * (`payments.resolve` на нём отвечает `409 resolution.not_underpaid`); второй — «счёт
 * закрылся недоплаченным», и вот тогда `resolve` (accept/refund) возможен.
 *
 * `wrong_amount_waiting` — производный статус: шлюз выводит его из суммы уже полученного
 * (`amount_paid` меньше `payer_amount` при незакрытом счёте). Он приходит в ответах
 * `/v1/payment/info` и `/v1/payment/history`, но в ВЕБХУКАХ его нет — там такой счёт
 * приходит как `confirm_check`.
 */
export type PaymentStatus =
  | 'check' // счёт создан, оплаты ещё не видели
  | 'confirm_check' // оплату видим, ждём подтверждений сети
  | 'wrong_amount_waiting' // видим ЧАСТИЧНУЮ оплату, ждём доплату; НЕ терминальный
  | 'paid' // оплачено полностью (в пределах допуска)
  | 'paid_over' // переплата сверх допуска (излишек — в авто-возврат, если он включён)
  | 'wrong_amount' // счёт закрылся недоплаченным; терминальный, здесь работает resolve
  | 'cancel' // счёт истёк или отменён; терминальный
  | 'select'; // валюто-агностичный счёт: покупатель ещё не выбрал валюту/сеть

/** Укрупнённый (Heleket-совместимый) статус выплаты в ответах API. */
export type PayoutStatus =
  | 'check' // создана, средства зарезервированы, ждёт одобрения
  | 'process' // одобрена / отправляется / отправлена
  | 'paid' // подтверждена в блокчейне
  | 'fail' // отклонена / отправка не удалась
  | 'cancel'; // отменена до отправки

/** Коды сетей, поддерживаемые каталогом. */
export type Network =
  | 'ethereum'
  | 'bsc'
  | 'polygon'
  | 'avalanche'
  | 'base'
  | 'arbitrum'
  | 'tron'
  | 'solana'
  | 'ton'
  | 'bitcoin';

/**
 * Пользовательский логгер SDK. Вызывается с уровнем, сообщением и (опционально) структурированными
 * полями. Реализация решает, куда и как писать. По умолчанию логирование выключено.
 *
 * БЕЗОПАСНОСТЬ: SDK НИКОГДА не передаёт в `fields` секреты, подписи, заголовок Authorization или
 * тела запросов/ответов — только method/path/status/ms/attempt/delay/код ошибки. `publicId` безопасен.
 */
export type OblodaiLogger = (
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  fields?: Record<string, unknown>,
) => void;

/** Конфигурация клиента. */
export interface OblodaiConfig {
  /** `public_id` — несекретный идентификатор ключа. */
  publicId: string;
  /** `secret` — секрет для подписи запросов. Только на сервере. */
  secret: string;
  /**
   * Базовый URL API. По умолчанию `https://api.oblodai.com` (боевой).
   *
   * ⚠ Схема обязана быть `https://` — иначе конструктор бросает `Error`. Подпись (`X-Signature`)
   * и `public_id` уходят в заголовках, и по открытому HTTP их читает любой посредник.
   * ЕДИНСТВЕННОЕ исключение — loopback для локальных стендов: `http://localhost:8095`,
   * `http://127.0.0.1:...`, `http://[::1]:...`.
   */
  baseUrl?: string;
  /** Таймаут запроса в миллисекундах. По умолчанию 30000. */
  timeoutMs?: number;
  /** Настройки автоматических повторов. `false` — отключить. */
  retry?: RetryOptions | false;
  /** Кастомная реализация fetch (по умолчанию глобальный `fetch`). */
  fetch?: typeof fetch;
  /**
   * Опциональный логгер. Если не задан, но переменная окружения `OBLODAI_LOG` равна
   * `debug`/`info`/`warn`/`error`, используется встроенный console-логгер с фильтром по этому уровню.
   * Иначе логирование выключено. SDK не логирует секреты/подписи/тела — см. {@link OblodaiLogger}.
   */
  logger?: OblodaiLogger;
}

/** Настройки повторов с экспоненциальным backoff. */
export interface RetryOptions {
  /** Максимум попыток (включая первую). По умолчанию 4. */
  maxAttempts?: number;
  /** Начальная задержка в мс. По умолчанию 500. */
  initialDelayMs?: number;
  /** Потолок задержки в мс. По умолчанию 30000. */
  maxDelayMs?: number;
}

/** Пагинация в списковых ответах. */
export interface Paginate {
  count: number;
  per_page: number;
  offset: number;
}
