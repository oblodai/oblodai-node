import { signRequest } from './signing.js';
import {
  OblodaiApiError,
  OblodaiConnectionError,
  OblodaiTimeoutError,
} from './errors.js';
import type { Envelope, ErrorEnvelope, OblodaiConfig, OblodaiLogger, RetryOptions } from './types.js';
import { resolveLogger } from './logger.js';

const DEFAULT_BASE_URL = 'https://api.oblodai.com';

/**
 * Разбирает заголовок `Retry-After` в миллисекунды. Поддерживает форму «секунды» (как отдаёт шлюз
 * на 429: `Retry-After: 60`). HTTP-date форму игнорируем (шлюз её не использует). Возвращает
 * `undefined`, если заголовка нет или он не число.
 */
function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header.trim());
  if (!Number.isFinite(seconds) || seconds < 0) return undefined;
  return seconds * 1000;
}
const DEFAULT_TIMEOUT_MS = 30_000;
/** Абсолютный потолок для серверного `Retry-After` (защита от абсурдных значений), 5 минут. */
const MAX_RETRY_AFTER_MS = 300_000;
const DEFAULT_RETRY: Required<RetryOptions> = {
  maxAttempts: 4,
  initialDelayMs: 500,
  maxDelayMs: 30_000,
};

/** Дополнительные опции одного вызова транспорта. */
export interface RequestOpts {
  /**
   * Значение заголовка `Idempotency-Key`. Вызывающий генерирует его ОДИН раз до цикла ретраев,
   * поэтому все внутренние повторы уходят с одним и тем же ключом — бэкенд дедуплицирует
   * повтор и вернёт закешированный результат первой попытки. В подпись запроса заголовок
   * НЕ входит (подписываются только timestamp/method/path/body).
   */
  idempotencyKey?: string;
}

/**
 * Транспортный слой. Подписывает каждый запрос, отправляет POST+JSON, разбирает конверт
 * `state`/`result`, бросает типизированные ошибки и (при включённых ретраях) повторяет временные сбои
 * с экспоненциальным backoff и джиттером.
 */
export class HttpClient {
  private readonly publicId: string;
  private readonly secret: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retry: Required<RetryOptions> | null;
  private readonly fetchImpl: typeof fetch;
  private readonly log: OblodaiLogger;

  constructor(config: OblodaiConfig) {
    if (!config.publicId) throw new Error('OblodaiConfig.publicId обязателен');
    if (!config.secret) throw new Error('OblodaiConfig.secret обязателен');

    this.publicId = config.publicId;
    this.secret = config.secret;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retry =
      config.retry === false ? null : { ...DEFAULT_RETRY, ...(config.retry ?? {}) };

    const f = config.fetch ?? globalThis.fetch;
    if (!f) {
      throw new Error(
        'Глобальный fetch недоступен. Используйте Node.js 18+ или передайте config.fetch.',
      );
    }
    this.fetchImpl = f;
    this.log = resolveLogger(config.logger);
  }

  /**
   * Выполняет подписанный POST-запрос к `path` с телом `payload`. Возвращает поле `result` из
   * конверта. Публичные (неподписанные) вызовы используют {@link requestPublic}.
   */
  async request<T>(path: string, payload: unknown = {}, opts: RequestOpts = {}): Promise<T> {
    return this.execute<T>(path, payload, true, 'POST', opts);
  }

  /**
   * Выполняет подписанный GET-запрос БЕЗ тела (используется тестовыми эндпоинтами песочницы,
   * например `GET /v1/sandbox/webhooks`). Каноническая строка подписи — та же, что и всегда:
   * `{timestamp}\nGET\n{path}\n` (тело — пустая строка).
   */
  async requestGet<T>(path: string): Promise<T> {
    return this.execute<T>(path, undefined, true, 'GET');
  }

  /** Выполняет запрос БЕЗ подписи (для публичных эндпоинтов). */
  async requestPublic<T>(
    path: string,
    payload: unknown = {},
    method: 'GET' | 'POST' = 'POST',
  ): Promise<T> {
    return this.execute<T>(path, payload, false, method);
  }

  private async execute<T>(
    path: string,
    payload: unknown,
    signed: boolean,
    method: 'GET' | 'POST' = 'POST',
    opts: RequestOpts = {},
  ): Promise<T> {
    const attempts = this.retry?.maxAttempts ?? 1;
    let lastErr: unknown;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      this.log('debug', 'oblodai: request', { method, path, attempt, attempts });
      try {
        return await this.once<T>(path, payload, signed, method, opts);
      } catch (err) {
        lastErr = err;
        const retriable = this.isRetriable(err);
        if (!retriable || attempt === attempts) {
          const status = err instanceof OblodaiApiError ? err.status : undefined;
          const code = err instanceof OblodaiApiError ? err.code : undefined;
          this.log('warn', 'oblodai: request failed', { status, code, method, path });
          throw err;
        }
        // Уважаем Retry-After от сервера (напр. 429), иначе — собственный backoff с джиттером.
        // Серверную подсказку НЕ ограничиваем maxDelayMs (это потолок только для собственного
        // backoff): если сервер просит подождать 60с — ждём 60с. Ограничиваем лишь абсолютным
        // потолком MAX_RETRY_AFTER_MS от абсурдных значений.
        const suggested =
          err instanceof OblodaiApiError && err.retryAfterMs != null ? err.retryAfterMs : undefined;
        const delay =
          suggested != null ? Math.min(suggested, MAX_RETRY_AFTER_MS) : this.backoffDelay(attempt);
        this.log('warn', 'oblodai: retrying', {
          method,
          path,
          delayMs: delay,
          reason: this.retryReason(err),
          nextAttempt: attempt + 1,
        });
        await this.sleep(delay);
      }
    }
    // недостижимо, но для типов
    throw lastErr;
  }

  private async once<T>(
    path: string,
    payload: unknown,
    signed: boolean,
    method: 'GET' | 'POST',
    opts: RequestOpts = {},
  ): Promise<T> {
    const url = this.baseUrl + path;
    const body = method === 'GET' ? undefined : JSON.stringify(payload ?? {});
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (signed) {
      // Для GET тело отсутствует — подписывается пустая строка (та же каноническая форма).
      const s = signRequest(this.secret, method, path, body ?? '');
      headers['X-Public-Id'] = this.publicId;
      headers['X-Timestamp'] = s.timestamp;
      headers['X-Signature'] = s.signature;
    }
    // Заголовок идемпотентности одинаков на всех попытках (генерируется до цикла ретраев)
    // и не участвует в подписи.
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const start = Date.now();
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new OblodaiTimeoutError(`Таймаут запроса ${path} (${this.timeoutMs}мс)`, err);
      }
      throw new OblodaiConnectionError(`Сетевая ошибка при запросе ${path}`, err);
    } finally {
      clearTimeout(timer);
    }

    this.log('debug', 'oblodai: response', {
      status: res.status,
      method,
      path,
      ms: Date.now() - start,
    });

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      throw new OblodaiApiError(
        'response.not_json',
        `Ответ не является JSON (HTTP ${res.status})`,
        res.status,
        text,
      );
    }

    // Ошибочный конверт
    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      const e = (parsed as ErrorEnvelope).error;
      throw new OblodaiApiError(
        e?.code ?? 'unknown',
        e?.message ?? 'Неизвестная ошибка',
        res.status,
        parsed,
      );
    }

    // Не-2xx без конверта ошибки. Сюда попадает и 429 (тело `{state:1,message:"rate limit exceeded"}`
    // без ключа `error`) — вытаскиваем message из тела и учитываем заголовок Retry-After.
    if (!res.ok) {
      const bodyMsg =
        parsed && typeof parsed === 'object' && typeof (parsed as { message?: unknown }).message === 'string'
          ? (parsed as { message: string }).message
          : `HTTP ${res.status}`;
      throw new OblodaiApiError(
        `http.${res.status}`,
        bodyMsg,
        res.status,
        parsed,
        parseRetryAfterMs(res.headers.get('Retry-After')),
      );
    }

    // Успешный конверт { state: 0, result: ... }
    if (parsed && typeof parsed === 'object' && 'result' in parsed) {
      return (parsed as Envelope<T>).result;
    }

    // Ответ без конверта (единственное исключение — POST /v1/webhooks, 201 Created)
    return parsed as T;
  }

  /** Человекочитаемая причина повтора для логов (без секретов и тел). */
  private retryReason(err: unknown): string {
    if (err instanceof OblodaiApiError) {
      if (err.status === 429) return '429 rate limit';
      if (err.status >= 500) return '5xx';
    }
    return 'network';
  }

  /**
   * Повторяем только транспортно-временное: 429, 5xx (включая `503 idempotency.unavailable`) и
   * сетевые сбои. Все создающие денежные вызовы шлют неизменный `Idempotency-Key`, поэтому
   * повтор дедуплицируется шлюзом, а не порождает второй объект. 4xx — терминальны
   * (в т.ч. `400 idempotency.key_reused` и `409 idempotency.in_progress`: последний означает,
   * что первая попытка ещё выполняется, и решение о повторе принимает вызывающий).
   */
  private isRetriable(err: unknown): boolean {
    if (err instanceof OblodaiApiError) return err.isRetriable;
    if (err instanceof OblodaiConnectionError) return true; // включая таймаут
    return false;
  }

  private backoffDelay(attempt: number): number {
    const r = this.retry!;
    const base = Math.min(r.initialDelayMs * 2 ** (attempt - 1), r.maxDelayMs);
    const jitter = Math.random() * (r.initialDelayMs / 2);
    return base + jitter;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
