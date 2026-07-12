import { BaseResource } from './base.js';
import type { Currency, ExchangeRate } from '../models.js';

/** Публичные справочники: курсы валют и каталог монет/сетей (подпись не требуется). */
export class Rates extends BaseResource {
  /**
   * Текущие курсы к USDT. `POST /v1/exchange-rate/list` (публичный).
   * Без аргумента — по всем валютам; с `currencyFrom` — по одной.
   */
  list(currencyFrom?: string): Promise<ExchangeRate[]> {
    const body = currencyFrom ? { currency_from: currencyFrom } : {};
    return this.http.requestPublic<ExchangeRate[]>('/v1/exchange-rate/list', body);
  }

  /**
   * Каталог принимаемых активов и сетей. `GET /v1/currencies` (публичный, без подписи).
   * Удобно для построения выбора валюты в чекауте.
   */
  async currencies(): Promise<Currency[]> {
    const res = await this.http.requestPublic<{ currencies: Currency[] }>('/v1/currencies', {}, 'GET');
    return res.currencies;
  }
}
