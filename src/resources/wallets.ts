import { BaseResource } from "./base.js";
import { idempotencyKeyFor } from "./idempotency.js";
import type {
  Wallet,
  CreateWalletParams,
  BlockWalletParams,
  BlockedRefundParams,
} from "../models.js";

/** Методы статических кошельков. */
export class Wallets extends BaseResource {
  /** Создать (или получить) постоянный статический адрес. `POST /v1/wallet` */
  create(params: CreateWalletParams): Promise<Wallet> {
    return this.http.request<Wallet>("/v1/wallet", params);
  }

  /** Заблокировать/разблокировать кошелёк. `POST /v1/wallet/block`
   *  Внимание: is_force_block по умолчанию true — для разблокировки передайте false. */
  block(params: BlockWalletParams): Promise<{ uuid: string; address: string; blocked: boolean }> {
    return this.http.request("/v1/wallet/block", params);
  }

  /**
   * Вернуть средства с (заблокированного) кошелька на адрес. `POST /v1/wallet/blocked-address-refund`
   *
   * Вызов СОЗДАЁТ выплату, но он once-only ПО САМОМУ КОШЕЛЬКУ и без всяких заголовков: бэкенд
   * строит детерминированный reference `refund-wallet:<wallet_id>`, берёт advisory-lock и внутри
   * лока сначала ищет уже существующую выплату по этому reference. Повтор (в том числе
   * конкурентный — он подождёт на локе) возвращает ТУ ЖЕ выплату, вторая не создаётся. Поэтому
   * автоповтор при 5xx/таймауте/сетевой ошибке безопасен и включён.
   *
   * Маршрут НАМЕРЕННО не обёрнут в idempotency-middleware: обёртка была бы регрессом —
   * конкурентный повтор получал бы `409 idempotency.in_progress` вместо ожидания и успеха.
   * `Idempotency-Key` SDK всё равно шлёт (свой — `params.idempotency_key`); на этом маршруте он
   * безвреден и ни на что не влияет.
   *
   * ⚠ Косметика: адрес НЕ входит в reference, поэтому повтор с ДРУГИМ адресом вернёт первую
   * выплату на ПЕРВЫЙ адрес.
   */
  blockedAddressRefund(params: BlockedRefundParams): Promise<unknown> {
    const { idempotency_key, ...body } = params;
    return this.http.request("/v1/wallet/blocked-address-refund", body, {
      idempotencyKey: idempotencyKeyFor(idempotency_key),
    });
  }

  /** QR-код произвольного адреса (data:-URI). `POST /v1/wallet/qr` */
  qr(address: string): Promise<{ image: string }> {
    return this.http.request<{ image: string }>("/v1/wallet/qr", { address });
  }
}
