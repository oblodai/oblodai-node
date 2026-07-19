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
  isTestKey: () => isTestKey,
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

// src/logger.ts
var LEVEL_ORDER = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};
var NOOP = () => {
};
function isLogLevel(value) {
  return value === "debug" || value === "info" || value === "warn" || value === "error";
}
function consoleLogger(min) {
  const threshold = LEVEL_ORDER[min];
  return (level, message, fields) => {
    if (LEVEL_ORDER[level] < threshold) return;
    const method = level === "debug" ? console.debug : level === "info" ? console.info : level === "warn" ? console.warn : console.error;
    if (fields && Object.keys(fields).length > 0) {
      method(message, fields);
    } else {
      method(message);
    }
  };
}
function resolveLogger(logger) {
  if (logger) return logger;
  if (typeof process !== "undefined" && process.env) {
    const env = process.env.OBLODAI_LOG;
    if (isLogLevel(env)) return consoleLogger(env);
  }
  return NOOP;
}

// src/http.ts
var DEFAULT_BASE_URL = "https://api.oblodai.com";
function isLoopbackHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}
function assertSecureBaseUrl(baseUrl) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(
      `oblodai: baseUrl \xAB${baseUrl}\xBB \u043D\u0435 \u044F\u0432\u043B\u044F\u0435\u0442\u0441\u044F \u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u043C URL. \u041E\u0436\u0438\u0434\u0430\u0435\u0442\u0441\u044F \u0430\u0434\u0440\u0435\u0441 \u0432\u0438\u0434\u0430 https://api.oblodai.com`
    );
  }
  if (parsed.protocol === "https:") return;
  if (parsed.protocol === "http:" && isLoopbackHost(parsed.hostname)) return;
  throw new Error(
    `oblodai: baseUrl \u0434\u043E\u043B\u0436\u0435\u043D \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C https:// \u2014 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u043E \xAB${baseUrl}\xBB. \u041F\u043E \u043E\u0442\u043A\u0440\u044B\u0442\u043E\u043C\u0443 \u043A\u0430\u043D\u0430\u043B\u0443 \u043F\u043E\u0434\u043F\u0438\u0441\u044C \u0437\u0430\u043F\u0440\u043E\u0441\u0430 (X-Signature) \u0438 public_id \u0432\u0438\u0434\u043D\u044B \u043F\u043E\u0441\u0440\u0435\u0434\u043D\u0438\u043A\u0430\u043C. \u0418\u0441\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435 \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u0441\u0442\u0435\u043D\u0434\u0430 \u043D\u0430 \u043F\u0435\u0442\u043B\u0435: http://localhost, http://127.0.0.1, http://[::1].`
  );
}
function parseRetryAfterMs(header) {
  if (!header) return void 0;
  const seconds = Number(header.trim());
  if (!Number.isFinite(seconds) || seconds < 0) return void 0;
  return seconds * 1e3;
}
var DEFAULT_TIMEOUT_MS = 3e4;
var MAX_RETRY_AFTER_MS = 3e5;
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
    assertSecureBaseUrl(this.baseUrl);
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retry = config.retry === false ? null : { ...DEFAULT_RETRY, ...config.retry ?? {} };
    const f = config.fetch ?? globalThis.fetch;
    if (!f) {
      throw new Error(
        "\u0413\u043B\u043E\u0431\u0430\u043B\u044C\u043D\u044B\u0439 fetch \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D. \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 Node.js 18+ \u0438\u043B\u0438 \u043F\u0435\u0440\u0435\u0434\u0430\u0439\u0442\u0435 config.fetch."
      );
    }
    this.fetchImpl = f;
    this.log = resolveLogger(config.logger);
  }
  /**
   * Выполняет подписанный POST-запрос к `path` с телом `payload`. Возвращает поле `result` из
   * конверта. Публичные (неподписанные) вызовы используют {@link requestPublic}.
   */
  async request(path, payload = {}, opts = {}) {
    return this.execute(path, payload, true, "POST", opts);
  }
  /**
   * Выполняет подписанный GET-запрос БЕЗ тела (используется тестовыми эндпоинтами песочницы,
   * например `GET /v1/sandbox/webhooks`). Каноническая строка подписи — та же, что и всегда:
   * `{timestamp}\nGET\n{path}\n` (тело — пустая строка).
   */
  async requestGet(path) {
    return this.execute(path, void 0, true, "GET");
  }
  /** Выполняет запрос БЕЗ подписи (для публичных эндпоинтов). */
  async requestPublic(path, payload = {}, method = "POST") {
    return this.execute(path, payload, false, method);
  }
  async execute(path, payload, signed, method = "POST", opts = {}) {
    const attempts = this.retry?.maxAttempts ?? 1;
    let lastErr;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      this.log("debug", "oblodai: request", { method, path, attempt, attempts });
      try {
        return await this.once(path, payload, signed, method, opts);
      } catch (err) {
        lastErr = err;
        const retriable = this.isRetriable(err);
        if (!retriable || attempt === attempts) {
          const status = err instanceof OblodaiApiError ? err.status : void 0;
          const code = err instanceof OblodaiApiError ? err.code : void 0;
          this.log("warn", "oblodai: request failed", { status, code, method, path });
          throw err;
        }
        const suggested = err instanceof OblodaiApiError && err.retryAfterMs != null ? err.retryAfterMs : void 0;
        const delay = suggested != null ? Math.min(suggested, MAX_RETRY_AFTER_MS) : this.backoffDelay(attempt);
        this.log("warn", "oblodai: retrying", {
          method,
          path,
          delayMs: delay,
          reason: this.retryReason(err),
          nextAttempt: attempt + 1
        });
        await this.sleep(delay);
      }
    }
    throw lastErr;
  }
  async once(path, payload, signed, method, opts = {}) {
    const url = this.baseUrl + path;
    const body = method === "GET" ? void 0 : JSON.stringify(payload ?? {});
    const headers = { "Content-Type": "application/json" };
    if (signed) {
      const s = signRequest(this.secret, method, path, body ?? "");
      headers["X-Public-Id"] = this.publicId;
      headers["X-Timestamp"] = s.timestamp;
      headers["X-Signature"] = s.signature;
    }
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const start = Date.now();
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
    this.log("debug", "oblodai: response", {
      status: res.status,
      method,
      path,
      ms: Date.now() - start
    });
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
  /** Человекочитаемая причина повтора для логов (без секретов и тел). */
  retryReason(err) {
    if (err instanceof OblodaiApiError) {
      if (err.status === 429) return "429 rate limit";
      if (err.status >= 500) return "5xx";
    }
    return "network";
  }
  /**
   * Повторяем только транспортно-временное: 429, 5xx (включая `503 idempotency.unavailable`) и
   * сетевые сбои. Все создающие денежные вызовы шлют неизменный `Idempotency-Key`, поэтому
   * повтор дедуплицируется шлюзом, а не порождает второй объект. 4xx — терминальны
   * (в т.ч. `400 idempotency.key_reused` и `409 idempotency.in_progress`: последний означает,
   * что первая попытка ещё выполняется, и решение о повторе принимает вызывающий).
   */
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

// src/resources/idempotency.ts
var import_node_crypto2 = require("crypto");
function idempotencyKeyFor(explicit) {
  return typeof explicit === "string" && explicit.trim() !== "" ? explicit : (0, import_node_crypto2.randomUUID)();
}

// src/resources/payments.ts
var Payments = class extends BaseResource {
  /**
   * Создать платёжный счёт (инвойс). `POST /v1/payment`
   *
   * Идемпотентность (v1.1.0): SDK генерирует ключ ОДИН раз до цикла ретраев и шлёт его
   * HTTP-заголовком `Idempotency-Key` (в подпись не входит) — автоматический повтор
   * (таймаут/5xx/сеть) не создаёт дубль счёта. Свой ключ — через `params.idempotency_key`
   * (уйдёт в заголовок, НЕ в тело).
   *
   * ЛОМАЮЩЕЕ изменение против v1.0.x: SDK больше НЕ подставляет автоматический
   * `order_id` (`idem-<uuid>`) — `order_id` уходит ровно так, как передали вы
   * (не задали — в платеже его не будет). Задавайте свой `order_id`, чтобы потом
   * находить платёж через `payments.info`.
   */
  create(params) {
    const { idempotency_key, ...body } = params;
    return this.http.request("/v1/payment", body, {
      idempotencyKey: idempotencyKeyFor(idempotency_key)
    });
  }
  /**
   * Массовое создание платежей — до 5000 одним подписанным запросом (одна отметка rate-limit).
   * `POST /v1/payment/batch`. Обработка в фоне: результат по элементам — через
   * `client.batches.info(batch_id)`.
   *
   * На каждом элементе ОБЯЗАТЕЛЕН `order_id` (`batch.order_id_required`); дубликат внутри
   * батча → `batch.duplicate_order_id`. Идемпотентность вызова — заголовком `Idempotency-Key`
   * (генерируется SDK или `opts.idempotency_key`).
   */
  createBatch(payments, opts = {}) {
    const body = { payments };
    if (opts.onError) body.on_error = opts.onError;
    return this.http.request("/v1/payment/batch", body, {
      idempotencyKey: idempotencyKeyFor(opts.idempotency_key)
    });
  }
  /**
   * Массовый возврат — до 5000 одним запросом. `POST /v1/refund/batch`.
   * На каждом элементе обязательны `reference` (per-item ключ дедупликации) и
   * `uuid`/`order_id` инвойса. Идемпотентность вызова — заголовком `Idempotency-Key`.
   * Результат по элементам — `client.batches.info(batch_id)`.
   */
  refundBatch(refunds, opts = {}) {
    const body = { refunds };
    if (opts.onError) body.on_error = opts.onError;
    return this.http.request("/v1/refund/batch", body, {
      idempotencyKey: idempotencyKeyFor(opts.idempotency_key)
    });
  }
  /**
   * Отправить покупателю счёт на e-mail (письмо с кнопкой «Оплатить»). `POST /v1/payment/send-email`
   *
   * Получатель — `email` или `payer_email` платежа. Лимит: 10 писем/час на адрес получателя
   * (`email.rate_limited`). Заголовок `Idempotency-Key` на этом эндпоинте не действует
   * (эндпоинт им не обёрнут) — повтор вызова отправит письмо ещё раз.
   */
  sendEmail(params) {
    return this.http.request("/v1/payment/send-email", params);
  }
  /**
   * Решить судьбу НЕДОПЛАЧЕННОГО платежа (`payment_status === 'wrong_amount'`).
   * `POST /v1/payment/resolve` (нужен payout-ключ — операция может двигать деньги наружу).
   *
   * `action: 'accept'` — оставить частичную оплату себе (глушит авто-возврат);
   * `action: 'refund'` — вернуть плательщику (по умолчанию на `payer_address`; для UTXO
   * передайте `address`). Идемпотентно и заголовком `Idempotency-Key` (SDK генерирует сам),
   * и доменно: повторный accept — no-op, повторный refund — реплей той же выплаты.
   *
   * ⚠ Резолвится ТОЛЬКО закрытый недоплаченный счёт — `wrong_amount`. Пока счёт ещё живой и
   * ждёт доплату, его статус — `wrong_amount_waiting`, и resolve на нём отвечает
   * `409 resolution.not_underpaid` (как и на любом другом статусе): недоплату ещё могут
   * догнать переводом. Дождитесь `wrong_amount` — и только тогда решайте судьбу денег.
   * Тот же 409 прилетит, если поздняя доплата закрыла счёт уже в момент вашего вызова.
   */
  resolve(params) {
    const { idempotency_key, ...body } = params;
    return this.http.request("/v1/payment/resolve", body, {
      idempotencyKey: idempotencyKeyFor(idempotency_key)
    });
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
  /**
   * Возврат средств платежа. `POST /v1/payment/refund` (см. также client.payouts.refund)
   *
   * С v1.1.0 `address` не обязателен — по умолчанию вернём на адрес плательщика
   * (для Bitcoin/UTXO он неизвестен — там `address` нужен). Идемпотентность — заголовком
   * `Idempotency-Key` (SDK генерирует сам; свой — `params.idempotency_key`).
   */
  refund(params) {
    const { idempotency_key, ...body } = params;
    return this.http.request("/v1/payment/refund", body, {
      idempotencyKey: idempotencyKeyFor(idempotency_key)
    });
  }
  // ── Публичный чекаут (v1.2.0; без подписи) ──
  /**
   * ПУБЛИЧНО (без подписи): состояние счёта для КАСТОМНОЙ страницы оплаты. `GET /v1/pay/{id}`
   *
   * То, чем живёт hosted-страница оплаты: сумма, адрес (после выбора валюты), QR, статус,
   * срок — можно дергать из браузера плательщика и поллить статус без секрета мерчанта.
   * Мерчант-приватные поля (`additional_data`, `payer_email`, `payer_address`) не возвращаются.
   * У валюто-агностичного счёта до выбора валюты `payment_status === 'select'`, а в `accepted` —
   * методы, из которых плательщик может выбрать (см. {@link publicSelect}).
   */
  publicGet(uuid) {
    return this.http.requestPublic(
      `/v1/pay/${encodeURIComponent(uuid)}`,
      {},
      "GET"
    );
  }
  /**
   * ПУБЛИЧНО (без подписи): плательщик выбирает валюту и сеть валюто-агностичного счёта.
   * `POST /v1/pay/{id}/select`
   *
   * Фиксирует курс, выделяет депозит-адрес и переводит счёт из `select` в обычный жизненный
   * цикл; ответ — финализированный счёт (та же форма, что у {@link publicGet}). Вместе с
   * `publicGet` это позволяет собрать полностью СВОЙ чекаут вместо hosted-страницы.
   * Повторный select уже выбранного счёта → `pay.not_selectable` (409).
   *
   * ⚠ `pay.method_not_accepted` на свежем мерчанте — норма, а не баг интеграции: пара
   * (currency, network) должна входить в принимаемый набор (`payments.setAccepted`), а когда
   * набор ПУСТ, набор по умолчанию — каталог методов с ЖИВЫМ наблюдателем депозитов, и на
   * локальном стенде без подключённых RPC он может оказаться пустым целиком. Не хардкодьте
   * пары в чекауте: берите их из `accepted` в ответе {@link publicGet}.
   */
  publicSelect(uuid, params) {
    return this.http.requestPublic(
      `/v1/pay/${encodeURIComponent(uuid)}/select`,
      params
    );
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
  /**
   * Создать выплату на внешний адрес. `POST /v1/payout`
   *
   * `order_id` обязателен всегда (`payout.order_id_required`) — это ВАШ бизнес-идентификатор.
   * Идемпотентность повторов (v1.1.0) — заголовком `Idempotency-Key`: SDK генерирует UUID
   * один раз до цикла ретраев; свой ключ — `params.idempotency_key` (в заголовок, не в тело).
   */
  create(params) {
    const { idempotency_key, ...body } = params;
    return this.http.request("/v1/payout", body, {
      idempotencyKey: idempotencyKeyFor(idempotency_key)
    });
  }
  /**
   * Массовая выплата (до 100, синхронная). `POST /v1/payout/mass`
   * Идемпотентность вызова — заголовком `Idempotency-Key` (генерируется SDK или
   * `opts.idempotency_key`). Для тысяч выплат используйте {@link createBatch}.
   */
  createMass(payouts, source, opts = {}) {
    const body = { payouts };
    if (source !== void 0) body.source = source;
    return this.http.request("/v1/payout/mass", body, {
      idempotencyKey: idempotencyKeyFor(opts.idempotency_key)
    });
  }
  /**
   * Массовое создание выплат — до 5000 одним подписанным запросом, обработка в фоне.
   * `POST /v1/payout/batch`. Результат по элементам — `client.batches.info(batch_id)`.
   *
   * На каждом элементе ОБЯЗАТЕЛЕН `order_id` (`batch.order_id_required`); дубликат внутри
   * батча → `batch.duplicate_order_id`. Идемпотентность вызова — заголовком `Idempotency-Key`.
   */
  createBatch(payouts, opts = {}) {
    const body = { payouts };
    if (opts.onError) body.on_error = opts.onError;
    return this.http.request("/v1/payout/batch", body, {
      idempotencyKey: idempotencyKeyFor(opts.idempotency_key)
    });
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
  /**
   * Подтвердить выплату в статусе pending (для API-ключа обычно не нужно). `POST /v1/payout/approve`
   *
   * Ключ идемпотентности не нужен и не шлётся: это переход состояния, а не создание. Бэкенд
   * принимает только `StatusPending` и отвечает `409 payout.not_pending` в любом другом случае,
   * поэтому повторный approve физически не может одобрить или двинуть деньги дважды. Читайте
   * этот 409 как «уже одобрено» и уточняйте фактический статус через {@link info}.
   */
  approve(uuid) {
    return this.http.request("/v1/payout/approve", { uuid });
  }
  /**
   * Возврат средств платежа (движок выплат). `POST /v1/payment/refund`
   * С v1.1.0 `address` не обязателен (по умолчанию — адрес плательщика; для Bitcoin/UTXO нужен).
   * Идемпотентность — заголовком `Idempotency-Key` (SDK генерирует сам).
   */
  refund(params) {
    const { idempotency_key, ...body } = params;
    return this.http.request("/v1/payment/refund", body, {
      idempotencyKey: idempotencyKeyFor(idempotency_key)
    });
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
  blockedAddressRefund(params) {
    const { idempotency_key, ...body } = params;
    return this.http.request("/v1/wallet/blocked-address-refund", body, {
      idempotencyKey: idempotencyKeyFor(idempotency_key)
    });
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
  /**
   * Перевод средств на личный кошелёк владельца. `POST /v1/transfer/to-personal`
   *
   * Идемпотентность (v1.1.0): SDK генерирует ключ один раз до цикла ретраев и шлёт заголовком
   * `Idempotency-Key` — автоматический повтор не создаёт повторный перевод. Свой ключ —
   * `params.idempotency_key` (в заголовок, не в тело). ЛОМАЮЩЕЕ изменение против v1.0.x:
   * автоматический `order_id` (`idem-<uuid>`) больше НЕ подставляется — `order_id` уходит как есть.
   */
  transferToPersonal(params) {
    const { idempotency_key, ...body } = params;
    return this.http.request("/v1/transfer/to-personal", body, {
      idempotencyKey: idempotencyKeyFor(idempotency_key)
    });
  }
  /**
   * Перевод пользователю ПЛАТФОРМЫ (v1.2.0): внутренний перевод БЕЗ комиссии с баланса мерчанта
   * на личный кошелёк другого пользователя платформы. `POST /v1/transfer/to-user` (payout-ключ,
   * та же подпись, что у `/v1/payout`).
   *
   * `to_user_id` — UUID пользователя платформы, НЕ username (не-UUID бэкенд отклоняет:
   * `transfer.bad_recipient`); username → user_id резолвится публичным профилем кабинета.
   *
   * Идемпотентность — как у `payouts.create`: SDK генерирует ключ один раз до цикла ретраев и
   * шлёт заголовком `Idempotency-Key`; свой ключ — `params.idempotency_key` (в заголовок, не в
   * тело). Лестница на бэкенде: заголовок → `order_id` → подпись запроса.
   */
  transferToUser(params) {
    const { idempotency_key, ...body } = params;
    return this.http.request("/v1/transfer/to-user", body, {
      idempotencyKey: idempotencyKeyFor(idempotency_key)
    });
  }
  /**
   * Массовый («зарплатный») перевод пользователям платформы (v1.2.0): пачка элементов формата
   * `transferToUser`, обработка в фоне. `POST /v1/transfer/batch`.
   *
   * Прогресс и результаты по элементам — СУЩЕСТВУЮЩИМ методом `client.batches.info(batch_id)`
   * (`items[].result` — байт-в-байт result единичного `/v1/transfer/to-user`). Идемпотентность
   * вызова — заголовком `Idempotency-Key` (генерируется SDK или `opts.idempotency_key`).
   */
  transferBatch(transfers, opts = {}) {
    const body = { transfers };
    if (opts.onError) body.on_error = opts.onError;
    return this.http.request("/v1/transfer/batch", body, {
      idempotencyKey: idempotencyKeyFor(opts.idempotency_key)
    });
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
   * Задать URL для вебхуков и получить секрет эндпоинта. `POST /v1/webhooks`
   *
   * ⚠ ЭТО UPSERT ЕДИНСТВЕННОГО ЭНДПОИНТА НА ПРОЕКТ, а не «добавить ещё один».
   * У проекта может быть ровно ОДИН вебхук-эндпоинт (в БД уникальность по `project_id`),
   * поэтому повторный `register()` с ДРУГИМ URL не создаёт второй эндпоинт, а
   * ПЕРЕНАПРАВЛЯЕТ доставки: возвращается ТОТ ЖЕ `endpoint_id`, а старый URL молча
   * перестаёт что-либо получать. Веерная рассылка на несколько URL средствами API
   * невозможна — разводите события у себя.
   *
   * Секрет при смене URL СОХРАНЯЕТСЯ (это не побочный эффект, а требование
   * корректности: доставки снимают секрет в момент постановки в очередь, и новый секрет
   * осиротил бы всё уже поставленное в очередь). На ПЕРВОЙ регистрации секрет
   * генерируется; отзыв скомпрометированного секрета — отдельное действие (ротация),
   * а не повторный `register()`.
   *
   * ⚠ Возвращаемый `secret` — СЕКРЕТ ЭНДПОИНТА, отдельный от секрета API-ключа. Именно
   * его передавайте в `verifyWebhook` / `constructWebhookEvent`; секрет API-ключа там не
   * подойдёт и отвергнет 100% вебхуков.
   *
   * Технически: ответ приходит БЕЗ конверта `state`/`result`.
   */
  register(url) {
    return this.http.request("/v1/webhooks", { url });
  }
  /**
   * Журнал последних доставок (до 50, новые первыми). `POST /v1/webhooks/deliveries`
   *
   * ⚠ ЛОМАЮЩЕЕ изменение в v1.2.0: метод отдаёт МАССИВ `Delivery[]`, а не `{ deliveries }` —
   * конверт разворачивается, как в `sandbox.listWebhooks()` и `payoutLinks.list()`.
   */
  async deliveries() {
    const res = await this.http.request("/v1/webhooks/deliveries", {});
    return res.deliveries ?? [];
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

// src/resources/batches.ts
var Batches = class extends BaseResource {
  /**
   * Прогресс и результаты батча. `POST /v1/batch/info` (read-only, идемпотентен сам по себе).
   * `limit` вне (0, 500] заменяется бэкендом на 100. `items[].result` — байт-в-байт result
   * соответствующего единичного эндпоинта.
   */
  info(batchId, params = {}) {
    return this.http.request("/v1/batch/info", { batch_id: batchId, ...params });
  }
};

// src/resources/links.ts
var Links = class extends BaseResource {
  /**
   * Создать платёжную ссылку. `POST /v1/payment/link`
   * `expires_in` — в СЕКУНДАХ; 0/отсутствие = бессрочная. Ответ: `{ link_id, url }`.
   */
  create(params) {
    return this.http.request("/v1/payment/link", params);
  }
  /** Список ссылок мерчанта. `POST /v1/payment/link/list` */
  async list(params = {}) {
    const res = await this.http.request("/v1/payment/link/list", params);
    return res.items;
  }
  /** Ссылка + платежи по ней. `POST /v1/payment/link/info` */
  info(linkId) {
    return this.http.request("/v1/payment/link/info", { link_id: linkId });
  }
  /** Включить/выключить ссылку. `POST /v1/payment/link/toggle` */
  toggle(linkId, active) {
    return this.http.request("/v1/payment/link/toggle", { link_id: linkId, active });
  }
  /**
   * Публичные детали ссылки. `GET /v1/link/{id}` — БЕЗ подписи (можно дергать со страницы
   * плательщика). Неактивная/истёкшая ссылка → `paylink.not_found` (404).
   */
  publicGet(linkId) {
    return this.http.requestPublic(
      `/v1/link/${encodeURIComponent(linkId)}`,
      {},
      "GET"
    );
  }
  /**
   * Публичный чекаут по ссылке: порождает обычный инвойс. `POST /v1/link/{id}/checkout` —
   * БЕЗ подписи. Закреплённые в ссылке валюта/сеть побеждают переданные. Лимит: 30 инвойсов/мин
   * на ссылку (`paylink.rate_limited`). Ответ — обычный объект платежа (`uuid` + `url`).
   */
  checkout(linkId, params = {}) {
    return this.http.requestPublic(
      `/v1/link/${encodeURIComponent(linkId)}/checkout`,
      params
    );
  }
};

// src/resources/splits.ts
var Splits = class extends BaseResource {
  /**
   * Создать правило сплита. `POST /v1/split/rule`
   * Ровно одно из двух: `address`+`network` (внешний адрес, необратимо) ИЛИ `merchant_id`
   * (партнёр на платформе, обратимо). `percent` — 0 < x ≤ 100, шаг 0.01; сумма активных
   * правил тоже ≤ 100. Удобные обёртки: {@link splitToAddress}, {@link splitToMerchant}.
   */
  createRule(params) {
    return this.http.request("/v1/split/rule", params);
  }
  /** Доля на внешний адрес (необратимо при возврате). Обёртка над {@link createRule}. */
  splitToAddress(address, network, percent, note) {
    return this.createRule({ address, network, percent, ...note !== void 0 ? { note } : {} });
  }
  /** Доля аккаунту на платформе (возврат отзовёт долю). Обёртка над {@link createRule}. */
  splitToMerchant(merchantId, percent, note) {
    return this.createRule({
      merchant_id: merchantId,
      percent,
      ...note !== void 0 ? { note } : {}
    });
  }
  /** Список правил сплита. `POST /v1/split/rule/list` */
  async listRules() {
    const res = await this.http.request("/v1/split/rule/list", {});
    return res.items;
  }
  /** Удалить правило. `POST /v1/split/rule/delete` */
  deleteRule(ruleId) {
    return this.http.request("/v1/split/rule/delete", { rule_id: ruleId });
  }
  /** Настройки сплитов (окно удержания перед отправкой долей). `POST /v1/split/config/get` */
  getConfig() {
    return this.http.request("/v1/split/config/get", {});
  }
  /**
   * Задать окно удержания `refund_hold_hours` — отсрочка исходящей маршрутизации
   * (сплиты/авто-вывод/авто-конверсия) после settle. `POST /v1/split/config/set`
   */
  setConfig(refundHoldHours) {
    return this.http.request("/v1/split/config/set", {
      refund_hold_hours: refundHoldHours
    });
  }
};

// src/resources/payoutlinks.ts
var PayoutLinks = class extends BaseResource {
  /**
   * Создать payout-ссылку (средства резервируются сразу: available → payout_held).
   * `POST /v1/payout/link`
   *
   * РЕКОМЕНДУЕТСЯ задавать `expires_in_hours` явно: при 0/отсутствии бэкенд клампит окно
   * claim к 1 часу (НЕ к максимуму); допустимый диапазон [1, 720] часов.
   * `claim_token`/`claim_url` возвращаются ТОЛЬКО в этом ответе (хранится лишь хеш) —
   * сохраните их сразу. При `email` получателю уйдёт письмо с кнопкой claim (best-effort).
   *
   * ⚠ `claim_url` собирает ШЛЮЗ из своего публичного базового URL (`.../claim/<claim_token>`).
   * На локальном стенде без `GATEWAY_PUBLIC_BASE_URL` он приходит ПУСТОЙ СТРОКОЙ — в проде шлюз
   * без этого URL не стартует, так что это не баг: просто собирайте ссылку сами из `claim_token`.
   * То же самое у `payment.url` (hosted-страница оплаты, `.../pay/<uuid>`).
   *
   * Свой ключ идемпотентности — `params.idempotency_key` (уходит заголовком, не в тело); иначе
   * SDK сгенерирует UUID один раз до цикла ретраев. Маршрут обёрнут idempotency-middleware, так
   * что повтор с тем же ключом реплеит первый ответ и НЕ резервирует средства второй раз —
   * см. описание класса.
   */
  create(params) {
    const { idempotency_key, ...body } = params;
    return this.http.request("/v1/payout/link", body, {
      idempotencyKey: idempotencyKeyFor(idempotency_key)
    });
  }
  /**
   * Создать до 500 ссылок одним запросом. `POST /v1/payout/link/batch`
   * Каждый элемент резервируется в своей транзакции (плохой фейлит только себя); ответ
   * index-aligned (`results[i]` ↔ `links[i]`), все созданные ссылки получают общий `batch_id`.
   * Больше 500 → `payoutlink.batch_too_large`.
   *
   * Ключ идемпотентности — на весь вызов (`opts.idempotency_key`, иначе UUID от SDK);
   * per-item `idempotency_key` смысла не имеет и в тело не уходит. Маршрут обёрнут
   * middleware'ом, повтор с тем же ключом реплеит ответ первой попытки.
   *
   * ⚠ Две особенности батча:
   * - частично упавший батч реплеится КАК ЕСТЬ — упавшие элементы под тем же ключом НЕ
   *   повторяются, их надо слать НОВЫМ ключом;
   * - ответ больше 256 КБ шлюз НЕ кэширует, и тогда повтор выполнится заново. Поэтому на
   *   батчах стоит проставлять per-item `reference` — второй, durable слой защиты
   *   (`409 payoutlink.duplicate_reference` вместо дубля).
   */
  createBatch(links, opts = {}) {
    const body = links.map(({ idempotency_key: _ignored, ...link }) => link);
    return this.http.request(
      "/v1/payout/link/batch",
      { links: body },
      {
        idempotencyKey: idempotencyKeyFor(opts.idempotency_key)
      }
    );
  }
  /** Список ссылок (created_at DESC; limit вне (0,200] → 50). `POST /v1/payout/link/list` */
  async list(params = {}) {
    const res = await this.http.request("/v1/payout/link/list", params);
    return res.links;
  }
  /** Информация о ссылке (после claim содержит `payout_id`, `claim_address`). `POST /v1/payout/link/info` */
  info(linkId) {
    return this.http.request("/v1/payout/link/info", { link_id: linkId });
  }
  /**
   * Отменить непорученную (`funded`) ссылку — резерв вернётся на available.
   * `POST /v1/payout/link/cancel`. Уже забранная → `payoutlink.not_funded` (409);
   * гонка с claim разрешается в пользу claim (вернётся `status: 'claimed'` + `payout_id`).
   */
  cancel(linkId) {
    return this.http.request("/v1/payout/link/cancel", { link_id: linkId });
  }
  /**
   * ПУБЛИЧНО (без подписи): детали ссылки для страницы claim. `GET /v1/claim/{token}`
   * Ничего мерчант-приватного не возвращает. `claimable === true` — можно забирать.
   */
  claimInfo(token) {
    return this.http.requestPublic(
      `/v1/claim/${encodeURIComponent(token)}`,
      {},
      "GET"
    );
  }
  /**
   * ПУБЛИЧНО (без подписи): забрать средства на адрес получателя. `POST /v1/claim/{token}`
   * `memo` — dest tag/comment для сетей вроде TON. Идемпотентно: повторный claim уже
   * забранной ссылки возвращает ту же выплату; claim с ДРУГИМ адресом на взятой ссылке →
   * `payoutlink.claim_in_progress` (409). Истёкшая/отменённая → `payoutlink.expired` /
   * `payoutlink.cancelled` (409).
   */
  claim(token, params) {
    return this.http.requestPublic(
      `/v1/claim/${encodeURIComponent(token)}`,
      params
    );
  }
};

// src/resources/sandbox.ts
function isTestKey(publicId) {
  return publicId.startsWith("test_");
}
var Sandbox = class extends BaseResource {
  /**
   * Симулировать он-чейн депозит в инвойс. `POST /v1/sandbox/deposit`
   *
   * Без `amount` платится ровно сумма к оплате; без `confirmations` (или 0) депозит сразу
   * полностью подтверждён. Мелкое `confirmations` даёт pending-депозит, и сам он глубже НЕ
   * станет: симулированную транзакцию никто не переэмитит. Чтобы довести инвойс до `paid`,
   * повторите этот вызов с ТЕМ ЖЕ `txid` и бОльшим `confirmations`.
   *
   * ⚠ Не путайте с maturity-холдом на выплате (`payout.funds_maturing`): вот тот снимается сам
   * по возрасту (в песочнице по умолчанию ~10 минут) и к подтверждениям инвойса не относится.
   */
  simulateDeposit(params) {
    return this.http.request("/v1/sandbox/deposit", params);
  }
  /**
   * Начислить тестовый баланс, чтобы гонять выплаты/возвраты. `POST /v1/sandbox/faucet`
   * Максимум 1000000 за вызов; `idempotency_key` (в теле) защищает от дублей при повторе.
   */
  faucet(params) {
    return this.http.request("/v1/sandbox/faucet", params);
  }
  /**
   * Сбросить песочницу: обнулить балансы и отменить инвойсы, по которым ещё НЕ было оплаты.
   * `POST /v1/sandbox/reset`
   *
   * ⚠ Это НЕ «чистый лист». Отменяются только инвойсы в статусах `check` (внутренне `created`)
   * и `select`. Счёт, по которому депозит уже ВИДЕН (`confirm_check`, `wrong_amount_waiting`),
   * reset СОЗНАТЕЛЬНО не трогает: отмена дала бы этому депозиту подтвердиться в отменённый счёт
   * и зачислиться без события. Симулированный депозит для пайплайна — такой же настоящий, как
   * он-чейновый, и песочница это правило не обходит. Нужен действительно чистый прогон —
   * заводите новый инвойс, а не рассчитывайте на сброс уже оплачиваемого.
   *
   * Ничего не удаляется: обнуление баланса — компенсирующая проводка в append-only леджере,
   * история ваших экспериментов остаётся читаемой.
   */
  reset() {
    return this.http.request("/v1/sandbox/reset", {});
  }
  /**
   * Журнал последних доставок вебхуков (до 50, новые первыми). `GET /v1/sandbox/webhooks`
   * Подписанный GET без тела (подписывается пустая строка).
   */
  async listWebhooks() {
    const res = await this.http.requestGet("/v1/sandbox/webhooks");
    return res.deliveries ?? [];
  }
  /** Перепоставить одну доставку в очередь. `POST /v1/sandbox/webhooks/replay` */
  replayWebhook(deliveryId) {
    return this.http.request("/v1/sandbox/webhooks/replay", {
      delivery_id: deliveryId
    });
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
    this.batches = new Batches(this.http);
    this.paymentLinks = new Links(this.http);
    this.links = this.paymentLinks;
    this.splits = new Splits(this.http);
    this.payoutLinks = new PayoutLinks(this.http);
    this.sandbox = new Sandbox(this.http);
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
var import_node_crypto3 = __toESM(require("crypto"), 1);
function verifyWebhook(secret, rawBody, headers, options = {}) {
  const { timestamp, signature } = headers;
  const log = resolveLogger(options.logger);
  if (!timestamp || !signature) {
    log("warn", "oblodai: webhook verify failed", { reason: "missing headers" });
    throw new OblodaiSignatureError("\u041E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 timestamp \u0438\u043B\u0438 signature \u0432\u0435\u0431\u0445\u0443\u043A\u0430");
  }
  const raw = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  const signingString = Buffer.concat([Buffer.from(`${timestamp}.`, "utf8"), raw]);
  const expected = import_node_crypto3.default.createHmac("sha256", secret).update(signingString).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== actualBuf.length || !import_node_crypto3.default.timingSafeEqual(expectedBuf, actualBuf)) {
    log("warn", "oblodai: webhook verify failed", { reason: "signature mismatch" });
    throw new OblodaiSignatureError("\u041F\u043E\u0434\u043F\u0438\u0441\u044C \u0432\u0435\u0431\u0445\u0443\u043A\u0430 \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u0434\u0430\u0435\u0442");
  }
  const maxAge = options.maxAgeSeconds ?? 300;
  if (maxAge > 0) {
    const now = options.now ?? Date.now();
    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) {
      log("warn", "oblodai: webhook verify failed", { reason: "invalid timestamp" });
      throw new OblodaiSignatureError("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u044B\u0439 timestamp \u0432\u0435\u0431\u0445\u0443\u043A\u0430");
    }
    const ageSeconds = Math.abs(now / 1e3 - ts);
    if (ageSeconds > maxAge) {
      log("warn", "oblodai: webhook verify failed", { reason: "stale" });
      throw new OblodaiSignatureError(
        `\u0412\u0435\u0431\u0445\u0443\u043A \u0441\u043B\u0438\u0448\u043A\u043E\u043C \u0441\u0442\u0430\u0440\u044B\u0439: \u0432\u043E\u0437\u0440\u0430\u0441\u0442 ${Math.round(ageSeconds)}\u0441 > ${maxAge}\u0441`
      );
    }
  }
  log("debug", "oblodai: webhook signature ok");
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
  isTestKey,
  signRequest,
  verifyWebhook
});
//# sourceMappingURL=index.cjs.map