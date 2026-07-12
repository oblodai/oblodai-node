import { BaseResource } from './base.js';
import type {
  Wallet,
  CreateWalletParams,
  BlockWalletParams,
  BlockedRefundParams,
} from '../models.js';

/** Методы статических кошельков. */
export class Wallets extends BaseResource {
  /** Создать (или получить) постоянный статический адрес. `POST /v1/wallet` */
  create(params: CreateWalletParams): Promise<Wallet> {
    return this.http.request<Wallet>('/v1/wallet', params);
  }

  /** Заблокировать/разблокировать кошелёк. `POST /v1/wallet/block`
   *  Внимание: is_force_block по умолчанию true — для разблокировки передайте false. */
  block(params: BlockWalletParams): Promise<{ uuid: string; address: string; blocked: boolean }> {
    return this.http.request('/v1/wallet/block', params);
  }

  /** Вернуть средства с (заблокированного) кошелька на адрес. `POST /v1/wallet/blocked-address-refund` */
  blockedAddressRefund(params: BlockedRefundParams): Promise<unknown> {
    return this.http.request('/v1/wallet/blocked-address-refund', params);
  }

  /** QR-код произвольного адреса (data:-URI). `POST /v1/wallet/qr` */
  qr(address: string): Promise<{ image: string }> {
    return this.http.request<{ image: string }>('/v1/wallet/qr', { address });
  }
}
