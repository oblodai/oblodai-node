"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  OblodaiApiError: () => OblodaiApiError,
  OblodaiClient: () => OblodaiClient,
  OblodaiConnectionError: () => OblodaiConnectionError,
  OblodaiError: () => OblodaiError,
  OblodaiSignatureError: () => OblodaiSignatureError,
  OblodaiTimeoutError: () => OblodaiTimeoutError,
  constructWebhookEvent: () => constructWebhookEvent,
  signRequest: () => signRequest,
  verifyWebhook: () => verifyWebhook
});
module.exports = __toCommonJS(index_exports);

// src/signing.ts
var import_node_crypto = __toESM(require("crypto"), 1);
function signRequest(secret, method, path, body, timestamp) {
  const ts = timestamp ?? Math.floor(Date.now() / 1e3).toString();
  const signingString = `${ts}
${method}
${path}
${body}`;
  const signature = import_node_crypto.default.createHmac("sha256", secret).update(signingString).digest("hex");
  return { timestamp: ts, signature, body };
}

// src/errors.ts
var OblodaiError = class extends Error {
  constructor(message) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
};
var OblodaiApiError = class extends OblodaiError {
  constructor(code, message, status, raw, retryAfterMs) {
    super(message || code);
    this.code = code;
    this.status = status;
    this.raw = raw;
    this.retryAfterMs = retryAfterMs;
  }
  /** Класс ошибки — временная ли она (стоит ли повторять с backoff). */
  get isRetriable() {
    if (this.status >= 500) return true;
    if (this.status === 429) return true;
    if (this.code === "payout.funds_maturing") return true;
    return false;
  }
};
var OblodaiConnectionError = class extends OblodaiError {
  constructor(message, cause) {
    super(message);
    this.cause = cause;
  }
  get isRetriable() {
    return true;
  }
};
var OblodaiTimeoutError = class extends OblodaiConnectionError {
};
var OblodaiSignatureError = class extends OblodaiError {
};

// src/http.ts
var DEFAULT_BASE_URL = "https://api.oblodai.example";
function parseRetryAfterMs(header) {
  if (!header) return void 0;
  const seconds = Number(header.trim());
  if (!Number.isFinite(seconds) || seconds < 0) return void 0;
  return seconds * 1e3;
}
var DEFAULT_TIMEOUT_MS = 3e4;
var DEFAULT_RETRY = {
  maxAttempts: 4,
  initialDelayMs: 500,
  maxDelayMs: 3e4
};
var HttpClient = class {
  constructor(config) {
    if (!config.publicId) throw new Error("OblodaiConfig.publicId \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u0435\u043D");
    if (!config.secret) throw new Error("OblodaiConfig.secret \u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u0435\u043D");
    this.publicId = config.publicId;
    this.secret = config.secret;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retry = config.retry === false ? null : { ...DEFAULT_RETRY, ...config.retry ?? {} };
    const f = config.fetch ?? globalThis.fetch;
    if (!f) {
      throw new Error(
        "\u0413\u043B\u043E\u0431\u0430\u043B\u044C\u043D\u044B\u0439 fetch \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D. \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 Node.js 18+ \u0438\u043B\u0438 \u043F\u0435\u0440\u0435\u0434\u0430\u0439\u0442\u0435 config.fetch."
      );
    }
    this.fetchImpl = f;
  }
  /**
   * Выполняет подписанный POST-запрос к `path` с телом `payload`. Возвращает поле `result` из
   * конверта. Публичные (неподписанные) вызовы используют {@link requestPublic}.
   */
  async request(path, payload = {}) {
    return this.execute(path, payload, true);
  }
  /** Выполняет запрос БЕЗ подписи (для публичных эндпоинтов). */
  async requestPublic(path, payload = {}, method = "POST") {
    return this.execute(path, payload, false, method);
  }
  async execute(path, payload, signed, method = "POST") {
    const attempts = this.retry?.maxAttempts ?? 1;
    let lastErr;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        return await this.once(path, payload, signed, method);
      } catch (err) {
        lastErr = err;
        const retriable = this.isRetriable(err);
        if (!retriable || attempt === attempts) throw err;
        const suggested = err instanceof OblodaiApiError && err.retryAfterMs != null ? err.retryAfterMs : void 0;
        const delay = suggested != null ? Math.min(suggested, this.retry.maxDelayMs) : this.backoffDelay(attempt);
        await this.sleep(delay);
      }
    }
    throw lastErr;
  }
  async once(path, payload, signed, method) {
    const url = this.baseUrl + path;
    const body = method === "GET" ? void 0 : JSON.stringify(payload ?? {});
    const headers = { "Content-Type": "application/json" };
    if (signed && body !== void 0) {
      const s = signRequest(this.secret, method, path, body);
      headers["X-Public-Id"] = this.publicId;
      headers["X-Timestamp"] = s.timestamp;
      headers["X-Signature"] = s.signature;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers,
        body,
        signal: controller.signal
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new OblodaiTimeoutError(`\u0422\u0430\u0439\u043C\u0430\u0443\u0442 \u0437\u0430\u043F\u0440\u043E\u0441\u0430 ${path} (${this.timeoutMs}\u043C\u0441)`, err);
      }
      throw new OblodaiConnectionError(`\u0421\u0435\u0442\u0435\u0432\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0437\u0430\u043F\u0440\u043E\u0441\u0435 ${path}`, err);
    } finally {
      clearTimeout(timer);
    }
    const text = await res.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      throw new OblodaiApiError(
        "response.not_json",
        `\u041E\u0442\u0432\u0435\u0442 \u043D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F JSON (HTTP ${res.status})`,
        res.status,
        text
      );
    }
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      const e = parsed.error;
      throw new OblodaiApiError(
        e?.code ?? "unknown",
        e?.message ?? "\u041D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043E\u0448\u0438\u0431\u043A\u0430",
        res.status,
        parsed
      );
    }
    if (!res.ok) {
      const bodyMsg = parsed && typeof parsed === "object" && typeof parsed.message === "string" ? parsed.message : `HTTP ${res.status}`;
      throw new OblodaiApiError(
        `http.${res.status}`,
        bodyMsg,
        res.status,
        parsed,
        parseRetryAfterMs(res.headers.get("Retry-After"))
      );
    }
    if (parsed && typeof parsed === "object" && "result" in parsed) {
      return parsed.result;
    }
    return parsed;
  }
  isRetriable(err) {
    if (err instanceof OblodaiApiError) return err.isRetriable;
    if (err instanceof OblodaiConnectionError) return true;
    return false;
  }
  backoffDelay(attempt) {
    const r = this.retry;
    const base = Math.min(r.initialDelayMs * 2 ** (attempt - 1), r.maxDelayMs);
    const jitter = Math.random() * (r.initialDelayMs / 2);
    return base + jitter;
  }
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
};

// src/resources/base.ts
var BaseResource = class {
  constructor(http) {
    this.http = http;
  }
};

// src/resources/payments.ts
var Payments = class extends BaseResource {
  /** Создать платёжный счёт (инвойс). `POST /v1/payment` */
  create(params) {
    return this.http.request("/v1/payment", params);
  }
  /** Информация о счёте по uuid или order_id. `POST /v1/payment/info` */
  info(lookup) {
    return this.http.request("/v1/payment/info", lookup);
  }
  /** Список платежей мерчанта. `POST /v1/payment/history` */
  history(params = {}) {
    return this.http.request("/v1/payment/history", params);
  }
  /** Доступные методы приёма. `POST /v1/payment/services` */
  services() {
    return this.http.request("/v1/payment/services", {});
  }
  /** QR-код депозит-адреса счёта (data:-URI). `POST /v1/payment/qr` */
  qr(lookup) {
    return this.http.request("/v1/payment/qr", lookup);
  }
  /** Переотправить текущий вебхук платежа. `POST /v1/payment/resend`. Ответ: `{ result: true }`. */
  resend(lookup) {
    return this.http.request("/v1/payment/resend", lookup);
  }
  /** Возврат средств платежа. `POST /v1/payment/refund` (см. также client.payouts.refund) */
  refund(params) {
    return this.http.request("/v1/payment/refund", params);
  }
  // ── Настройки приёма ──
  /** Список принимаемых валют для агностичных счетов. `POST /v1/payment/accepted/list` */
  listAccepted() {
    return this.http.request("/v1/payment/accepted/list", {});
  }
  /** Заменить набор принимаемых валют. `POST /v1/payment/accepted/set` */
  setAccepted(accepted) {
    return this.http.request("/v1/payment/accepted/set", { accepted });
  }
  /** Список правил скидок/наценок. `POST /v1/payment/discount/list` */
  listDiscounts() {
    return this.http.request("/v1/payment/discount/list", {});
  }
  /** Задать скидку/наценку. `POST /v1/payment/discount/set` */
  setDiscount(params) {
    return this.http.request("/v1/payment/discount/set", params);
  }
  /** Прочитать допуск недоплаты. `POST /v1/payment/accuracy/get` */
  getAccuracy() {
    return this.http.request("/v1/payment/accuracy/get", {});
  }
  /** Задать допуск недоплаты. `POST /v1/payment/accuracy/set` */
  setAccuracy(params) {
    return this.http.request("/v1/payment/accuracy/set", params);
  }
  /** Прочитать настройки автовозврата. `POST /v1/payment/autorefund/get` */
  getAutorefund() {
    return this.http.request("/v1/payment/autorefund/get", {});
  }
  /** Задать настройки автовозврата. `POST /v1/payment/autorefund/set` */
  setAutorefund(params) {
    return this.http.request("/v1/payment/autorefund/set", params);
  }
};

// src/resources/payouts.ts
var Payouts = class extends BaseResource {
  /** Создать выплату на внешний адрес. `POST /v1/payout` */
  create(params) {
    return this.http.request("/v1/payout", params);
  }
  /** Массовая выплата (до 100). `POST /v1/payout/mass` */
  createMass(payouts, source) {
    const body = { payouts };
    if (source !== void 0) body.source = source;
    return this.http.request("/v1/payout/mass", body);
  }
  /** Информация о выплате по uuid или order_id. `POST /v1/payout/info` */
  info(lookup) {
    return this.http.request("/v1/payout/info", lookup);
  }
  /** История выплат. `POST /v1/payout/history` */
  history(params = {}) {
    return this.http.request("/v1/payout/history", params);
  }
  /** Доступные методы выплат. `POST /v1/payout/services` */
  services() {
    return this.http.request("/v1/payout/services", {});
  }
  /** Предрасчёт комиссии и сумм без создания. `POST /v1/payout/calculate` */
  calculate(params) {
    return this.http.request("/v1/payout/calculate", params);
  }
  /** Подтвердить выплату в статусе pending (для API-ключа обычно не нужно). `POST /v1/payout/approve` */
  approve(uuid) {
    return this.http.request("/v1/payout/approve", { uuid });
  }
  /** Возврат средств платежа (движок выплат). `POST /v1/payment/refund` */
  refund(params) {
    return this.http.request("/v1/payment/refund", params);
  }
  // ── Конфигурация комиссий ──
  /** Кто платит сетевую комиссию выплаты — чтение. `POST /v1/payout/fee-config/get` */
  getFeeConfig() {
    return this.http.request("/v1/payout/fee-config/get", {});
  }
  /** Кто платит сетевую комиссию выплаты — запись. `POST /v1/payout/fee-config/set` */
  setFeeConfig(feeOnRecipient) {
    return this.http.request("/v1/payout/fee-config/set", { fee_on_recipient: feeOnRecipient });
  }
  /** Кто несёт нашу комиссию при возврате — чтение. `POST /v1/payout/refund-fee-config/get` */
  getRefundFeeConfig() {
    return this.http.request("/v1/payout/refund-fee-config/get", {});
  }
  /** Кто несёт нашу комиссию при возврате — запись. `POST /v1/payout/refund-fee-config/set` */
  setRefundFeeConfig(feeOnCustomer) {
    return this.http.request("/v1/payout/refund-fee-config/set", { fee_on_customer: feeOnCustomer });
  }
};

// src/resources/wallets.ts
var Wallets = class extends BaseResource {
  /** Создать (или получить) постоянный статический адрес. `POST /v1/wallet` */
  create(params) {
    return this.http.request("/v1/wallet", params);
  }
  /** Заблокировать/разблокировать кошелёк. `POST /v1/wallet/block`
   *  Внимание: is_force_block по умолчанию true — для разблокировки передайте false. */
  block(params) {
    return this.http.request("/v1/wallet/block", params);
  }
  /** Вернуть средства с (заблокированного) кошелька на адрес. `POST /v1/wallet/blocked-address-refund` */
  blockedAddressRefund(params) {
    return this.http.request("/v1/wallet/blocked-address-refund", params);
  }
  /** QR-код произвольного адреса (data:-URI). `POST /v1/wallet/qr` */
  qr(address) {
    return this.http.request("/v1/wallet/qr", { address });
  }
};

// src/resources/account.ts
var Account = class extends BaseResource {
  /** Доступные балансы мерчанта. `POST /v1/balance` */
  balance() {
    return this.http.request("/v1/balance", {});
  }
  /** Реферальная статистика. `POST /v1/referral/info` */
  referral() {
    return this.http.request("/v1/referral/info", {});
  }
  /** Перевод средств на личный кошелёк владельца. `POST /v1/transfer/to-personal` */
  transferToPersonal(params) {
    return this.http.request("/v1/transfer/to-personal", params);
  }
  /** Включить/выключить VRCS. Без enabled — чтение. `POST /v1/vrcs` */
  vrcs(enabled) {
    const body = enabled === void 0 ? {} : { enabled };
    return this.http.request("/v1/vrcs", body);
  }
};

// src/resources/webhooks.ts
var Webhooks = class extends BaseResource {
  /**
   * Зарегистрировать (заменить) URL для вебхуков и получить секрет. `POST /v1/webhooks`
   * Внимание: возвращает объект БЕЗ конверта state/result; повторный вызов выдаёт новый секрет.
   */
  register(url) {
    return this.http.request("/v1/webhooks", { url });
  }
  /** Журнал последних доставок (до 50). `POST /v1/webhooks/deliveries` */
  deliveries() {
    return this.http.request("/v1/webhooks/deliveries", {});
  }
  /** Пробный вебхук платежа. `POST /v1/test-webhook/payment` */
  testPayment(params) {
    return this.http.request("/v1/test-webhook/payment", params);
  }
  /** Пробный вебхук кошелька. `POST /v1/test-webhook/wallet` */
  testWallet(params) {
    return this.http.request("/v1/test-webhook/wallet", params);
  }
  /** Пробный вебхук выплаты. `POST /v1/test-webhook/payout` */
  testPayout(params) {
    return this.http.request("/v1/test-webhook/payout", params);
  }
};

// src/resources/settings.ts
var Settings = class extends BaseResource {
  // ── Автовывод ──
  /** Список правил автовывода. `POST /v1/auto-withdraw/list` */
  listAutoWithdraw() {
    return this.http.request("/v1/auto-withdraw/list", {});
  }
  /** Включить автовывод для актива. `POST /v1/auto-withdraw/set`
   *  `min` — порог в единицах актива (не minor), по умолчанию "0". */
  setAutoWithdraw(params) {
    return this.http.request("/v1/auto-withdraw/set", params);
  }
  /** Выключить автовывод для актива. `POST /v1/auto-withdraw/delete` */
  deleteAutoWithdraw(currency) {
    return this.http.request("/v1/auto-withdraw/delete", { currency });
  }
  // ── IP-allowlist ──
  /** Список доверенных IP и статус. `POST /v1/api-allowlist/list` */
  listAllowlist() {
    return this.http.request("/v1/api-allowlist/list", {});
  }
  /** Добавить IP или CIDR. `POST /v1/api-allowlist/add` */
  addAllowlist(cidr) {
    return this.http.request("/v1/api-allowlist/add", { cidr });
  }
  /** Удалить IP или CIDR. `POST /v1/api-allowlist/remove` */
  removeAllowlist(cidr) {
    return this.http.request("/v1/api-allowlist/remove", { cidr });
  }
  /** Включить/выключить контроль. `POST /v1/api-allowlist/enable`
   *  Нельзя включить с пустым списком — сначала добавьте IP. */
  enableAllowlist(enabled) {
    return this.http.request("/v1/api-allowlist/enable", { enabled });
  }
};

// src/resources/rates.ts
var Rates = class extends BaseResource {
  /**
   * Текущие курсы к USDT. `POST /v1/exchange-rate/list` (публичный).
   * Без аргумента — по всем валютам; с `currencyFrom` — по одной.
   */
  list(currencyFrom) {
    const body = currencyFrom ? { currency_from: currencyFrom } : {};
    return this.http.requestPublic("/v1/exchange-rate/list", body);
  }
  /**
   * Каталог принимаемых активов и сетей. `GET /v1/currencies` (публичный, без подписи).
   * Удобно для построения выбора валюты в чекауте.
   */
  async currencies() {
    const res = await this.http.requestPublic("/v1/currencies", {}, "GET");
    return res.currencies;
  }
};

// src/client.ts
var OblodaiClient = class _OblodaiClient {
  constructor(config) {
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
  static fromEnv(overrides = {}) {
    const env = typeof process !== "undefined" && process.env ? process.env : {};
    const publicId = env.OBLODAI_PUBLIC_ID;
    const secret = env.OBLODAI_SECRET;
    if (!publicId) throw new Error("oblodai: \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u0430\u044F \u043E\u043A\u0440\u0443\u0436\u0435\u043D\u0438\u044F OBLODAI_PUBLIC_ID \u043D\u0435 \u0437\u0430\u0434\u0430\u043D\u0430");
    if (!secret) throw new Error("oblodai: \u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u0430\u044F \u043E\u043A\u0440\u0443\u0436\u0435\u043D\u0438\u044F OBLODAI_SECRET \u043D\u0435 \u0437\u0430\u0434\u0430\u043D\u0430");
    return new _OblodaiClient({
      publicId,
      secret,
      ...env.OBLODAI_BASE_URL ? { baseUrl: env.OBLODAI_BASE_URL } : {},
      ...overrides
    });
  }
};

// src/webhooks.ts
var import_node_crypto2 = __toESM(require("crypto"), 1);
function verifyWebhook(secret, rawBody, headers, options = {}) {
  const { timestamp, signature } = headers;
  if (!timestamp || !signature) {
    throw new OblodaiSignatureError("\u041E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 timestamp \u0438\u043B\u0438 signature \u0432\u0435\u0431\u0445\u0443\u043A\u0430");
  }
  const raw = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  const signingString = Buffer.concat([Buffer.from(`${timestamp}.`, "utf8"), raw]);
  const expected = import_node_crypto2.default.createHmac("sha256", secret).update(signingString).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== actualBuf.length || !import_node_crypto2.default.timingSafeEqual(expectedBuf, actualBuf)) {
    throw new OblodaiSignatureError("\u041F\u043E\u0434\u043F\u0438\u0441\u044C \u0432\u0435\u0431\u0445\u0443\u043A\u0430 \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u0435\u0442");
  }
  const maxAge = options.maxAgeSeconds ?? 300;
  if (maxAge > 0) {
    const now = options.now ?? Date.now();
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) {
      throw new OblodaiSignatureError("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 timestamp \u0432\u0435\u0431\u0445\u0443\u043A\u0430");
    }
    const ageSeconds = Math.abs(now / 1e3 - ts);
    if (ageSeconds > maxAge) {
      throw new OblodaiSignatureError(
        `\u0412\u0435\u0431\u0445\u0443\u043A \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0441\u0442\u0430\u0440\u044B\u0439: \u0432\u043E\u0437\u0440\u0430\u0441\u0442 ${Math.round(ageSeconds)}\u0441 > ${maxAge}\u0441`
      );
    }
  }
  return true;
}
function constructWebhookEvent(secret, rawBody, headers, options) {
  verifyWebhook(secret, rawBody, headers, options);
  const text = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  return JSON.parse(text);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  OblodaiApiError,
  OblodaiClient,
  OblodaiConnectionError,
  OblodaiError,
  OblodaiSignatureError,
  OblodaiTimeoutError,
  constructWebhookEvent,
  signRequest,
  verifyWebhook
});
//# sourceMappingURL=index.cjs.map