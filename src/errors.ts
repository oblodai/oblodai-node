/**
 * Ошибки Oblodai SDK.
 *
 * Все ошибки API приходят в конверте `{ "error": { "code", "message" } }`, где `code` — машиночитаемый
 * идентификатор вида `<домен>.<причина>` (например `payout.insufficient_funds`). Ветвитесь в коде по
 * `.code`, а не по тексту `.message`.
 */

/** Базовая ошибка SDK. Все прочие ошибки наследуются от неё. */
export class OblodaiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    // Корректная работа instanceof при компиляции в ES5/ES2015
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Ошибка, вернувшаяся от API (конверт `error`). Несёт машиночитаемый `code`, человекочитаемый
 * `message` и HTTP-статус ответа.
 */
export class OblodaiApiError extends OblodaiError {
  /** Машиночитаемый код вида `<домен>.<причина>`. Ветвитесь по нему. */
  readonly code: string;
  /** HTTP-статус ответа. */
  readonly status: number;
  /** Сырое тело ответа (для отладки). */
  readonly raw: unknown;
  /**
   * Рекомендованная сервером задержка перед повтором в мс (из заголовка `Retry-After`, если был).
   * Транспорт использует её вместо собственного backoff — например, на 429 сервер отдаёт `Retry-After: 60`.
   */
  readonly retryAfterMs?: number;

  constructor(code: string, message: string, status: number, raw: unknown, retryAfterMs?: number) {
    super(message || code);
    this.code = code;
    this.status = status;
    this.raw = raw;
    this.retryAfterMs = retryAfterMs;
  }

  /** Класс ошибки — временная ли она (стоит ли повторять с backoff). */
  get isRetriable(): boolean {
    // 5xx и 429-подобные — временные; funds_maturing — временное «дозревание».
    if (this.status >= 500) return true;
    if (this.status === 429) return true;
    if (this.code === 'payout.funds_maturing') return true;
    return false;
  }
}

/** Сетевая ошибка (соединение не удалось, таймаут). Как правило, безопасно повторить с backoff. */
export class OblodaiConnectionError extends OblodaiError {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
  get isRetriable(): boolean {
    return true;
  }
}

/** Таймаут запроса. Помните: таймаут не значит, что операция не прошла — см. рецепт устойчивого клиента. */
export class OblodaiTimeoutError extends OblodaiConnectionError {}

/** Ошибка проверки подписи вебхука (`verifyWebhook`). */
export class OblodaiSignatureError extends OblodaiError {}
