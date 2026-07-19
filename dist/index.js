// src/signing.ts
import crypto from "crypto";
function signRequest(secret, method, path, body, timestamp) {
  const ts = timestamp ?? Math.floor(Date.now() / 1e3).toString();
  const signingString = `${ts}
${method}
${path}
${body}`;
  const signature = crypto.createHmac("sha256", secret).update(signingString).digest("hex");
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
import { randomUUID } from "crypto";
function idempotencyKeyFor(explicit) {
  return typeof explicit === "string" && explicit.trim() !== "" ? explicit : randomUUID();
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
   * Платёж в другом статусе → `resolution.not_underpaid` (409).
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
  /** Подтвердить выплату в статусе pending (для API-ключа обычно не нужно). `POST /v1/payout/approve` */
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
   */
  create(params) {
    return this.http.request("/v1/payout/link", params);
  }
  /**
   * Создать до 500 ссылок одним запросом. `POST /v1/payout/link/batch`
   * Каждый элемент резервируется в своей транзакции (плохой фейлит только себя); ответ
   * index-aligned (`results[i]` ↔ `links[i]`), все созданные ссылки получают общий `batch_id`.
   * Больше 500 → `payoutlink.batch_too_large`. Дедуп — per-item `reference` (см. create).
   */
  createBatch(links) {
    return this.http.request("/v1/payout/link/batch", { links });
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
   * полностью подтверждён. Мелкое `confirmations` даёт pending-депозит — он дозреет через
   * ~10 минут или при повторе того же `txid` с бОльшим числом подтверждений.
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
   * Сбросить песочницу: отменить открытые инвойсы и обнулить балансы. `POST /v1/sandbox/reset`
   * Обнуление — компенсирующей проводкой в леджере, история операций сохраняется.
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
    return res.deliveries;
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
    this.links = new Links(this.http);
    this.paymentLinks = this.links;
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
import crypto2 from "crypto";
function verifyWebhook(secret, rawBody, headers, options = {}) {
  const { timestamp, signature } = headers;
  const log = resolveLogger(options.logger);
  if (!timestamp || !signature) {
    log("warn", "oblodai: webhook verify failed", { reason: "missing headers" });
    throw new OblodaiSignatureError("\u041E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u0435\u0442 timestamp \u0438\u043B\u0438 signature \u0432\u0435\u0431\u0445\u0443\u043A\u0430");
  }
  const raw = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  const signingString = Buffer.concat([Buffer.from(`${timestamp}.`, "utf8"), raw]);
  const expected = crypto2.createHmac("sha256", secret).update(signingString).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signature, "utf8");
  if (expectedBuf.length !== actualBuf.length || !crypto2.timingSafeEqual(expectedBuf, actualBuf)) {
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
export {
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
};
//# sourceMappingURL=index.js.map