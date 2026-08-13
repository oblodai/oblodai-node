import crypto from "node:crypto";
import { OblodaiSignatureError } from "./errors.js";
import { resolveLogger } from "./logger.js";
import type { OblodaiLogger } from "./types.js";

/**
 * Проверка входящих вебхуков.
 *
 * ВНИМАНИЕ: подпись вебхука — ДРУГОЙ алгоритм, чем подпись запроса. Здесь подписанная строка это
 * `{timestamp}.{сырое_тело}` (точка-разделитель, без метода и пути), а секрет — тот, что вернул
 * `POST /v1/webhooks` (не ключ API).
 *
 *   X-Webhook-Signature = hex(HMAC-SHA256(secret, "{X-Webhook-Timestamp}." + сырое_тело))
 */

/** Заголовки доставки вебхука, нужные для проверки. */
export interface WebhookHeaders {
  /** X-Webhook-Timestamp — unix-секунды момента отправки. */
  timestamp: string;
  /** X-Webhook-Signature — hex-подпись. */
  signature: string;
}

export interface VerifyWebhookOptions {
  /**
   * Максимальный возраст вебхука в секундах для replay-защиты. Если задан и timestamp старше —
   * проверка не пройдёт. По умолчанию 300 (5 минут). Передайте 0, чтобы отключить проверку свежести.
   */
  maxAgeSeconds?: number;
  /** Текущее время в мс (для тестов). По умолчанию Date.now(). */
  now?: number;
  /**
   * Опциональный логгер. Если не задан, применяется env-опция `OBLODAI_LOG` (см. {@link OblodaiLogger}).
   * Логируются только факт успеха и причина отказа — секрет, подпись и тело НЕ логируются.
   */
  logger?: OblodaiLogger;
}

/**
 * Проверяет подпись и свежесть вебхука. Возвращает `true` при успехе, иначе бросает
 * {@link OblodaiSignatureError}.
 *
 * ВАЖНО: `rawBody` должен быть СЫРЫМ телом запроса (строка или Buffer) — тем же, что пришло по сети.
 * Не передавайте пересериализованный JSON: подпись считается по байтам.
 *
 * Пробные тела (`"is_test": true`) НЕ подписаны — их этой функцией проверять не нужно.
 *
 * @param secret  секрет из POST /v1/webhooks
 * @param rawBody сырое тело запроса
 * @param headers заголовки timestamp/signature
 */
export function verifyWebhook(
  secret: string,
  rawBody: string | Buffer,
  headers: WebhookHeaders,
  options: VerifyWebhookOptions = {},
): true {
  const { timestamp, signature } = headers;
  const log = resolveLogger(options.logger);

  if (!timestamp || !signature) {
    log("warn", "oblodai: webhook verify failed", { reason: "missing headers" });
    throw new OblodaiSignatureError("Отсутствует timestamp или signature вебхука");
  }

  const raw = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  const signingString = Buffer.concat([Buffer.from(`${timestamp}.`, "utf8"), raw]);
  const expected = crypto.createHmac("sha256", secret).update(signingString).digest("hex");

  // Сравнение в постоянном времени
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
    log("warn", "oblodai: webhook verify failed", { reason: "signature mismatch" });
    throw new OblodaiSignatureError("Подпись вебхука не совпадает");
  }

  // Replay-защита: проверка свежести timestamp
  const maxAge = options.maxAgeSeconds ?? 300;
  if (maxAge > 0) {
    const now = options.now ?? Date.now();
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) {
      log("warn", "oblodai: webhook verify failed", { reason: "invalid timestamp" });
      throw new OblodaiSignatureError("Некорректный timestamp вебхука");
    }
    const ageSeconds = Math.abs(now / 1000 - ts);
    if (ageSeconds > maxAge) {
      log("warn", "oblodai: webhook verify failed", { reason: "stale" });
      throw new OblodaiSignatureError(
        `Вебхук слишком старый: возраст ${Math.round(ageSeconds)}с > ${maxAge}с`,
      );
    }
  }

  log("debug", "oblodai: webhook signature ok");
  return true;
}

/**
 * Удобная обёртка: проверяет вебхук и возвращает распарсенное тело типа T. Бросает
 * {@link OblodaiSignatureError} при неверной подписи.
 */
export function constructWebhookEvent<T = unknown>(
  secret: string,
  rawBody: string | Buffer,
  headers: WebhookHeaders,
  options?: VerifyWebhookOptions,
): T {
  verifyWebhook(secret, rawBody, headers, options);
  const text = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  return JSON.parse(text) as T;
}
