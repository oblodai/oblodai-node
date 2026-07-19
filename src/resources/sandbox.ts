import { BaseResource } from './base.js';
import type {
  SandboxDepositParams,
  SandboxDeposit,
  SandboxFaucetParams,
  SandboxFaucetResult,
  SandboxResetResult,
  SandboxDelivery,
  SandboxReplayResult,
} from '../models.js';

/**
 * `true`, если ключ тестовый: `public_id` тестового ключа начинается с `test_`
 * (секрет — с `oblodai_test_`). Бизнес-эндпоинты с тестовым ключом работают точь-в-точь
 * как с боевым — меняется только ключ; тестовые же (`/v1/sandbox/*`) доступны ТОЛЬКО ему.
 */
export function isTestKey(publicId: string): boolean {
  return publicId.startsWith('test_');
}

/**
 * Песочница разработчика (v1.2.0) — ТОЛЬКО для тестовых ключей (`test_...` / `oblodai_test_...`).
 *
 * Эти пять методов заменяют то, что в бою делает внешний мир (покупатель платит он-чейн и т.п.),
 * поэтому им место в ТЕСТОВОМ коде, а не в интеграции: боевой ключ на любом `/v1/sandbox/*`
 * получает `403 sandbox.live_key`. Все остальные методы SDK с тестовым ключом работают без
 * изменений — интеграционный код между тестом и боем не меняется, меняется только ключ.
 */
export class Sandbox extends BaseResource {
  /**
   * Симулировать он-чейн депозит в инвойс. `POST /v1/sandbox/deposit`
   *
   * Без `amount` платится ровно сумма к оплате; без `confirmations` (или 0) депозит сразу
   * полностью подтверждён. Мелкое `confirmations` даёт pending-депозит — он дозреет через
   * ~10 минут или при повторе того же `txid` с бОльшим числом подтверждений.
   */
  simulateDeposit(params: SandboxDepositParams): Promise<SandboxDeposit> {
    return this.http.request<SandboxDeposit>('/v1/sandbox/deposit', params);
  }

  /**
   * Начислить тестовый баланс, чтобы гонять выплаты/возвраты. `POST /v1/sandbox/faucet`
   * Максимум 1000000 за вызов; `idempotency_key` (в теле) защищает от дублей при повторе.
   */
  faucet(params: SandboxFaucetParams): Promise<SandboxFaucetResult> {
    return this.http.request<SandboxFaucetResult>('/v1/sandbox/faucet', params);
  }

  /**
   * Сбросить песочницу: отменить открытые инвойсы и обнулить балансы. `POST /v1/sandbox/reset`
   * Обнуление — компенсирующей проводкой в леджере, история операций сохраняется.
   */
  reset(): Promise<SandboxResetResult> {
    return this.http.request<SandboxResetResult>('/v1/sandbox/reset', {});
  }

  /**
   * Журнал последних доставок вебхуков (до 50, новые первыми). `GET /v1/sandbox/webhooks`
   * Подписанный GET без тела (подписывается пустая строка).
   */
  async listWebhooks(): Promise<SandboxDelivery[]> {
    const res = await this.http.requestGet<{ deliveries: SandboxDelivery[] }>('/v1/sandbox/webhooks');
    return res.deliveries;
  }

  /** Перепоставить одну доставку в очередь. `POST /v1/sandbox/webhooks/replay` */
  replayWebhook(deliveryId: string): Promise<SandboxReplayResult> {
    return this.http.request<SandboxReplayResult>('/v1/sandbox/webhooks/replay', {
      delivery_id: deliveryId,
    });
  }
}
