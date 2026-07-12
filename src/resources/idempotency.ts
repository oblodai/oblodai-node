/**
 * Нужно ли SDK подставить собственный ключ идемпотентности `order_id`.
 *
 * Возвращает `true` (инъектировать), пока `order_id` не является непустой строкой
 * после `.trim()`. То есть `undefined`, `null`, `''` и строки из одних пробелов
 * считаются отсутствующими и требуют автоключа.
 */
export function needsIdempotencyKey(params: { order_id?: string | null }): boolean {
  const orderId = params.order_id;
  return typeof orderId !== 'string' || orderId.trim() === '';
}
