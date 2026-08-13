import { BaseResource } from "./base.js";
import type { AutoWithdrawRule } from "../models.js";

/** Автовывод и IP-allowlist. */
export class Settings extends BaseResource {
  // ── Автовывод ──

  /** Список правил автовывода. `POST /v1/auto-withdraw/list` */
  listAutoWithdraw(): Promise<{ rules: AutoWithdrawRule[] }> {
    return this.http.request("/v1/auto-withdraw/list", {});
  }

  /** Включить автовывод для актива. `POST /v1/auto-withdraw/set`
   *  `min` — порог в единицах актива (не minor), по умолчанию "0". */
  setAutoWithdraw(params: {
    currency: string;
    network: string;
    address: string;
    min?: string;
  }): Promise<unknown> {
    return this.http.request("/v1/auto-withdraw/set", params);
  }

  /** Выключить автовывод для актива. `POST /v1/auto-withdraw/delete` */
  deleteAutoWithdraw(currency: string): Promise<unknown> {
    return this.http.request("/v1/auto-withdraw/delete", { currency });
  }

  // ── IP-allowlist ──

  /** Список доверенных IP и статус. `POST /v1/api-allowlist/list` */
  listAllowlist(): Promise<{ entries: string[]; enabled: boolean }> {
    return this.http.request("/v1/api-allowlist/list", {});
  }

  /** Добавить IP или CIDR. `POST /v1/api-allowlist/add` */
  addAllowlist(cidr: string): Promise<unknown> {
    return this.http.request("/v1/api-allowlist/add", { cidr });
  }

  /** Удалить IP или CIDR. `POST /v1/api-allowlist/remove` */
  removeAllowlist(cidr: string): Promise<unknown> {
    return this.http.request("/v1/api-allowlist/remove", { cidr });
  }

  /** Включить/выключить контроль. `POST /v1/api-allowlist/enable`
   *  Нельзя включить с пустым списком — сначала добавьте IP. */
  enableAllowlist(enabled: boolean): Promise<unknown> {
    return this.http.request("/v1/api-allowlist/enable", { enabled });
  }
}
