import { BaseResource } from "./base.js";
import type { BatchInfo } from "../models.js";

/**
 * Статус массовых операций (v1.1.0). Постановка батча — методами `payments.createBatch`,
 * `payments.refundBatch`, `payouts.createBatch`; здесь — прогресс и результаты по элементам.
 */
export class Batches extends BaseResource {
  /**
   * Прогресс и результаты батча. `POST /v1/batch/info` (read-only, идемпотентен сам по себе).
   * `limit` вне (0, 500] заменяется бэкендом на 100. `items[].result` — байт-в-байт result
   * соответствующего единичного эндпоинта.
   */
  info(batchId: string, params: { limit?: number; offset?: number } = {}): Promise<BatchInfo> {
    return this.http.request<BatchInfo>("/v1/batch/info", { batch_id: batchId, ...params });
  }
}
