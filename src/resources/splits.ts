import { BaseResource } from "./base.js";
import type { CreateSplitRuleParams, SplitRule, SplitConfig } from "../models.js";

/**
 * Сплит-платежи (v1.1.0): доля каждого входящего платежа автоматически уходит партнёру.
 * Все методы требуют payout-ключ. Заголовок `Idempotency-Key` на этих эндпоинтах не
 * действует (не обёрнуты) — но операции декларативны (правила), повтор безопасен по смыслу.
 *
 * ВАЖНО про возвраты: отправка долей откладывается на окно `refund_hold_hours` — возврат внутри
 * окна сам уменьшает/отменяет отчисление. Долю, уже ушедшую на внешний адрес, вернуть нельзя.
 */
export class Splits extends BaseResource {
  /**
   * Создать правило сплита. `POST /v1/split/rule`
   * Ровно одно из двух: `address`+`network` (внешний адрес, необратимо) ИЛИ `merchant_id`
   * (партнёр на платформе, обратимо). `percent` — 0 < x ≤ 100, шаг 0.01; сумма активных
   * правил тоже ≤ 100. Удобные обёртки: {@link splitToAddress}, {@link splitToMerchant}.
   */
  createRule(params: CreateSplitRuleParams): Promise<{ rule_id: string; percent: number }> {
    return this.http.request("/v1/split/rule", params);
  }

  /** Доля на внешний адрес (необратимо при возврате). Обёртка над {@link createRule}. */
  splitToAddress(
    address: string,
    network: string,
    percent: number,
    note?: string,
  ): Promise<{ rule_id: string; percent: number }> {
    return this.createRule({ address, network, percent, ...(note !== undefined ? { note } : {}) });
  }

  /** Доля аккаунту на платформе (возврат отзовёт долю). Обёртка над {@link createRule}. */
  splitToMerchant(
    merchantId: string,
    percent: number,
    note?: string,
  ): Promise<{ rule_id: string; percent: number }> {
    return this.createRule({
      merchant_id: merchantId,
      percent,
      ...(note !== undefined ? { note } : {}),
    });
  }

  /** Список правил сплита. `POST /v1/split/rule/list` */
  async listRules(): Promise<SplitRule[]> {
    const res = await this.http.request<{ items: SplitRule[] }>("/v1/split/rule/list", {});
    return res.items;
  }

  /** Удалить правило. `POST /v1/split/rule/delete` */
  deleteRule(ruleId: string): Promise<{ deleted: boolean }> {
    return this.http.request("/v1/split/rule/delete", { rule_id: ruleId });
  }

  /** Настройки сплитов (окно удержания перед отправкой долей). `POST /v1/split/config/get` */
  getConfig(): Promise<SplitConfig> {
    return this.http.request<SplitConfig>("/v1/split/config/get", {});
  }

  /**
   * Задать окно удержания `refund_hold_hours` — отсрочка исходящей маршрутизации
   * (сплиты/авто-вывод/авто-конверсия) после settle. `POST /v1/split/config/set`
   */
  setConfig(refundHoldHours: number): Promise<SplitConfig> {
    return this.http.request<SplitConfig>("/v1/split/config/set", {
      refund_hold_hours: refundHoldHours,
    });
  }
}
