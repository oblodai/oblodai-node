import { randomUUID } from 'node:crypto';

/**
 * Ключ идемпотентности для создающего вызова: явный ключ пользователя (если это непустая
 * строка после `.trim()`) или новый UUID.
 *
 * Вызывается ОДИН раз до цикла ретраев — все внутренние повторы (таймаут/5xx/сеть) уходят с тем же
 * заголовком `Idempotency-Key`, поэтому повтор не создаёт дубль операции: бэкенд вернёт
 * закешированный результат первой успешной попытки (`Idempotent-Replayed: true`).
 *
 * С v1.1.0 SDK больше НЕ подставляет автоматический `order_id` (`idem-<uuid>`) —
 * `order_id` уходит на бэкенд ровно так, как его передал вызывающий.
 */
export function idempotencyKeyFor(explicit?: string | null): string {
  return typeof explicit === 'string' && explicit.trim() !== '' ? explicit : randomUUID();
}
