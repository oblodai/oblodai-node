import { HttpClient } from './http.js';
import type { OblodaiConfig } from './types.js';
import { Payments } from './resources/payments.js';
import { Payouts } from './resources/payouts.js';
import { Wallets } from './resources/wallets.js';
import { Account } from './resources/account.js';
import { Webhooks } from './resources/webhooks.js';
import { Settings } from './resources/settings.js';
import { Rates } from './resources/rates.js';

/**
 * Клиент Oblodai API.
 *
 * ```ts
 * const client = new OblodaiClient({
 *   publicId: process.env.OBLODAI_PUBLIC_ID!,
 *   secret: process.env.OBLODAI_SECRET!,
 *   baseUrl: 'https://api.oblodai.com', // необязательно — это и есть умолчание
 * });
 *
 * const payment = await client.payments.create({
 *   amount: '10', currency: 'USD', order_id: 'order-1',
 *   to_currency: 'USDT', network: 'tron',
 * });
 * ```
 */
export class OblodaiClient {
  /** Приём платежей и настройки приёма. */
  readonly payments: Payments;
  /** Выплаты и возвраты. */
  readonly payouts: Payouts;
  /** Статические кошельки. */
  readonly wallets: Wallets;
  /** Баланс, рефералы, перевод на личный кошелёк, VRCS. */
  readonly account: Account;
  /** Управление вебхуками и тестовые события. */
  readonly webhooks: Webhooks;
  /** Автовывод и IP-allowlist. */
  readonly settings: Settings;
  /** Публичные курсы валют. */
  readonly rates: Rates;

  private readonly http: HttpClient;

  constructor(config: OblodaiConfig) {
    this.http = new HttpClient(config);
    this.payments = new Payments(this.http);
    this.payouts = new Payouts(this.http);
    this.wallets = new Wallets(this.http);
    this.account = new Account(this.http);
    this.webhooks = new Webhooks(this.http);
    this.settings = new Settings(this.http);
    this.rates = new Rates(this.http);
  }

  /**
   * Создаёт клиента из переменных окружения:
   * `OBLODAI_PUBLIC_ID` и `OBLODAI_SECRET` (обязательны), `OBLODAI_BASE_URL` (необязательна).
   * Любое поле в `overrides` перекрывает окружение. Бросает `Error`, если обязательная переменная
   * не задана. Только для серверной среды (Node.js) — секрет не должен попадать в браузер.
   *
   * ```ts
   * const client = OblodaiClient.fromEnv();
   * ```
   */
  static fromEnv(overrides: Partial<Omit<OblodaiConfig, 'publicId' | 'secret'>> = {}): OblodaiClient {
    const env: Record<string, string | undefined> =
      typeof process !== 'undefined' && process.env ? process.env : {};
    const publicId = env.OBLODAI_PUBLIC_ID;
    const secret = env.OBLODAI_SECRET;
    if (!publicId) throw new Error('oblodai: переменная окружения OBLODAI_PUBLIC_ID не задана');
    if (!secret) throw new Error('oblodai: переменная окружения OBLODAI_SECRET не задана');
    return new OblodaiClient({
      publicId,
      secret,
      ...(env.OBLODAI_BASE_URL ? { baseUrl: env.OBLODAI_BASE_URL } : {}),
      ...overrides,
    });
  }
}
