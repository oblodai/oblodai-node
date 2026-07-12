import type { HttpClient } from '../http.js';

/** Базовый класс группы методов. Держит ссылку на транспорт. */
export abstract class BaseResource {
  constructor(protected readonly http: HttpClient) {}
}
