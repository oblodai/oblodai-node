import crypto from "node:crypto";

/**
 * Подпись запросов к API.
 *
 * Каноническая строка: `{timestamp}\n{METHOD}\n{path}\n{body}`, подписывается секретом по HMAC-SHA256,
 * результат — hex в нижнем регистре. Тело подписывается ровно теми байтами, что уходят в сеть —
 * поэтому SDK сериализует тело один раз и использует одну строку и для подписи, и для отправки.
 */

export interface SignedRequest {
  /** Значение заголовка X-Timestamp (unix-секунды строкой). */
  timestamp: string;
  /** Значение заголовка X-Signature (hex). */
  signature: string;
  /** Тело запроса — ровно та строка, что подписана и должна быть отправлена. */
  body: string;
}

/**
 * Считает подпись запроса.
 *
 * @param secret   секрет ключа мерчанта
 * @param method   HTTP-метод в верхнем регистре (обычно "POST")
 * @param path     путь запроса с ведущим слэшем, например "/v1/payment"
 * @param body     сериализованное тело (строка). Будет подписано как есть.
 * @param timestamp опционально — фиксированный timestamp (для тестов); иначе текущее время
 */
export function signRequest(
  secret: string,
  method: string,
  path: string,
  body: string,
  timestamp?: string,
): SignedRequest {
  const ts = timestamp ?? Math.floor(Date.now() / 1000).toString();
  const signingString = `${ts}\n${method}\n${path}\n${body}`;
  const signature = crypto.createHmac("sha256", secret).update(signingString).digest("hex");
  return { timestamp: ts, signature, body };
}
