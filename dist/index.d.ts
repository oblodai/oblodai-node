/**
 * Общие типы Oblodai SDK.
 *
 * Суммы во всём API — строки в единицах валюты (например `"25.00"`), а не числа. SDK сохраняет их как
 * `string`, чтобы не терять точность на float. Отдельные поля приходят в минимальных единицах (minor) —
 * это отмечено в комментариях.
 */
/** Успешный конверт ответа API. */
interface Envelope<T> {
    state: 0;
    result: T;
}
/** Конверт ошибки API. */
interface ErrorEnvelope {
    error: {
        code: string;
        message: string;
    };
}
/**
 * Статусы платежа (`payment_status`).
 *
 * ТЕРМИНАЛЬНЫЕ (`is_final: true`, статус больше не изменится): `paid`, `paid_over`,
 * `wrong_amount`, `cancel`. Остальные — промежуточные.
 *
 * ⚠ Не путайте `wrong_amount_waiting` и `wrong_amount` — это РАЗНЫЕ вещи:
 * первый означает «увидели часть суммы, счёт ещё живой, ждём доплату» и НЕ терминален
 * (`payments.resolve` на нём отвечает `409 resolution.not_underpaid`); второй — «счёт
 * закрылся недоплаченным», и вот тогда `resolve` (accept/refund) возможен.
 *
 * `wrong_amount_waiting` — производный статус: шлюз выводит его из суммы уже полученного
 * (`amount_paid` меньше `payer_amount` при незакрытом счёте). Он приходит в ответах
 * `/v1/payment/info` и `/v1/payment/history`, но в ВЕБХУКАХ его нет — там такой счёт
 * приходит как `confirm_check`.
 */
type PaymentStatus = 'check' | 'confirm_check' | 'wrong_amount_waiting' | 'paid' | 'paid_over' | 'wrong_amount' | 'cancel' | 'select';
/** Укрупнённый (Heleket-совместимый) статус выплаты в ответах API. */
type PayoutStatus = 'check' | 'process' | 'paid' | 'fail' | 'cancel';
/** Коды сетей, поддерживаемые каталогом. */
type Network = 'ethereum' | 'bsc' | 'polygon' | 'avalanche' | 'base' | 'arbitrum' | 'tron' | 'solana' | 'ton' | 'bitcoin';
/**
 * Пользовательский логгер SDK. Вызывается с уровнем, сообщением и (опционально) структурированными
 * полями. Реализация решает, куда и как писать. По умолчанию логирование выключено.
 *
 * БЕЗОПАСНОСТЬ: SDK НИКОГДА не передаёт в `fields` секреты, подписи, заголовок Authorization или
 * тела запросов/ответов — только method/path/status/ms/attempt/delay/код ошибки. `publicId` безопасен.
 */
type OblodaiLogger = (level: 'debug' | 'info' | 'warn' | 'error', message: string, fields?: Record<string, unknown>) => void;
/** Конфигурация клиента. */
interface OblodaiConfig {
    /** `public_id` — несекретный идентификатор ключа. */
    publicId: string;
    /** `secret` — секрет для подписи запросов. Только на сервере. */
    secret: string;
    /**
     * Базовый URL API. По умолчанию `https://api.oblodai.com` (боевой).
     *
     * ⚠ Схема обязана быть `https://` — иначе конструктор бросает `Error`. Подпись (`X-Signature`)
     * и `public_id` уходят в заголовках, и по открытому HTTP их читает любой посредник.
     * ЕДИНСТВЕННОЕ исключение — loopback для локальных стендов: `http://localhost:8095`,
     * `http://127.0.0.1:...`, `http://[::1]:...`.
     */
    baseUrl?: string;
    /** Таймаут запроса в миллисекундах. По умолчанию 30000. */
    timeoutMs?: number;
    /** Настройки автоматических повторов. `false` — отключить. */
    retry?: RetryOptions | false;
    /** Кастомная реализация fetch (по умолчанию глобальный `fetch`). */
    fetch?: typeof fetch;
    /**
     * Опциональный логгер. Если не задан, но переменная окружения `OBLODAI_LOG` равна
     * `debug`/`info`/`warn`/`error`, используется встроенный console-логгер с фильтром по этому уровню.
     * Иначе логирование выключено. SDK не логирует секреты/подписи/тела — см. {@link OblodaiLogger}.
     */
    logger?: OblodaiLogger;
}
/** Настройки повторов с экспоненциальным backoff. */
interface RetryOptions {
    /** Максимум попыток (включая первую). По умолчанию 4. */
    maxAttempts?: number;
    /** Начальная задержка в мс. По умолчанию 500. */
    initialDelayMs?: number;
    /** Потолок задержки в мс. По умолчанию 30000. */
    maxDelayMs?: number;
}
/** Пагинация в списковых ответах. */
interface Paginate {
    count: number;
    per_page: number;
    offset: number;
}

/** Дополнительные опции одного вызова транспорта. */
interface RequestOpts {
    /**
     * Значение заголовка `Idempotency-Key`. Вызывающий генерирует его ОДИН раз до цикла ретраев,
     * поэтому все внутренние повторы уходят с одним и тем же ключом — бэкенд дедуплицирует
     * повтор и вернёт закешированный результат первой попытки. В подпись запроса заголовок
     * НЕ входит (подписываются только timestamp/method/path/body).
     */
    idempotencyKey?: string;
}
/**
 * Транспортный слой. Подписывает каждый запрос, отправляет POST+JSON, разбирает конверт
 * `state`/`result`, бросает типизированные ошибки и (при включённых ретраях) повторяет временные сбои
 * с экспоненциальным backoff и джиттером.
 */
declare class HttpClient {
    private readonly publicId;
    private readonly secret;
    private readonly baseUrl;
    private readonly timeoutMs;
    private readonly retry;
    private readonly fetchImpl;
    private readonly log;
    constructor(config: OblodaiConfig);
    /**
     * Выполняет подписанный POST-запрос к `path` с телом `payload`. Возвращает поле `result` из
     * конверта. Публичные (неподписанные) вызовы используют {@link requestPublic}.
     */
    request<T>(path: string, payload?: unknown, opts?: RequestOpts): Promise<T>;
    /**
     * Выполняет подписанный GET-запрос БЕЗ тела (используется тестовыми эндпоинтами песочницы,
     * например `GET /v1/sandbox/webhooks`). Каноническая строка подписи — та же, что и всегда:
     * `{timestamp}\nGET\n{path}\n` (тело — пустая строка).
     */
    requestGet<T>(path: string): Promise<T>;
    /** Выполняет запрос БЕЗ подписи (для публичных эндпоинтов). */
    requestPublic<T>(path: string, payload?: unknown, method?: 'GET' | 'POST'): Promise<T>;
    private execute;
    private once;
    /** Человекочитаемая причина повтора для логов (без секретов и тел). */
    private retryReason;
    /**
     * Повторяем только транспортно-временное: 429, 5xx (включая `503 idempotency.unavailable`) и
     * сетевые сбои. Все создающие денежные вызовы шлют неизменный `Idempotency-Key`, поэтому
     * повтор дедуплицируется шлюзом, а не порождает второй объект. 4xx — терминальны
     * (в т.ч. `400 idempotency.key_reused` и `409 idempotency.in_progress`: последний означает,
     * что первая попытка ещё выполняется, и решение о повторе принимает вызывающий).
     */
    private isRetriable;
    private backoffDelay;
    private sleep;
}

/** Базовый класс группы методов. Держит ссылку на транспорт. */
declare abstract class BaseResource {
    protected readonly http: HttpClient;
    constructor(http: HttpClient);
}

/**
 * Модели объектов API и параметры запросов.
 *
 * Суммы — строки в единицах валюты. Поля, помеченные "minor", приходят в минимальных единицах.
 */

/** Объект платежа (инвойса). */
interface Payment {
    uuid: string;
    order_id: string;
    amount: string;
    payment_amount: string | null;
    amount_paid: string;
    amount_remaining: string;
    payer_amount: string;
    payer_currency: string;
    currency: string;
    network: string;
    address: string;
    address_qr_code: string;
    /** Статус счёта; словарь и терминальность — см. {@link PaymentStatus}. */
    payment_status: PaymentStatus;
    is_multi: boolean;
    /**
     * Hosted-страница оплаты. Собирается ШЛЮЗОМ как `<публичный базовый URL>/pay/<uuid>`.
     * В проде шлюз без этого URL не стартует, а вот на ЛОКАЛЬНОМ стенде без
     * `GATEWAY_PUBLIC_BASE_URL` поле приходит ПУСТОЙ СТРОКОЙ — это не ошибка SDK.
     * В таком случае собирайте ссылку сами из `uuid`.
     */
    url: string;
    expired_at: number;
    /** `true` — статус терминальный (`paid`/`paid_over`/`wrong_amount`/`cancel`), больше не изменится. */
    is_final: boolean;
    created_at: string;
    updated_at: string;
    additional_data: string;
    payer_email: string;
    url_return: string;
    url_success: string;
    rate_expires_at: number;
    confirmations: number;
    required_confirmations: number;
    txid: string;
    /** С v1.1.0: адрес, с которого пришли деньги (если известен; в UTXO-сетях может отсутствовать). */
    payer_address?: string;
    /** С v1.1.0: возвраты по платежу. */
    refunds?: PaymentRefundEntry[];
    /** С v1.1.0: агрегированный статус возвратов. */
    refund_status?: 'none' | 'partial' | 'full';
}
/** Запись возврата в `Payment.refunds` (v1.1.0). */
interface PaymentRefundEntry {
    uuid?: string;
    amount?: string;
    currency?: string;
    network?: string;
    address?: string;
    status?: string;
    created_at?: string;
    [key: string]: unknown;
}
/** Параметры создания платежа (`POST /v1/payment`). */
interface CreatePaymentParams {
    amount: string;
    currency: string;
    order_id?: string;
    network?: string;
    to_currency?: string;
    lifetime?: number;
    subtract?: number;
    accuracy_payment_percent?: number;
    url_callback?: string;
    url_return?: string;
    url_success?: string;
    additional_data?: string;
    payer_email?: string;
    theme?: 'dark' | 'light';
    is_payment_multiple?: boolean;
    is_refresh?: boolean;
    /**
     * Свой ключ идемпотентности (v1.1.0). Уходит HTTP-заголовком `Idempotency-Key`, НЕ в тело.
     * Если не задан, SDK генерирует UUID один раз на вызов (стабилен между внутренними повторами).
     */
    idempotency_key?: string;
}
/** Ссылка на объект по uuid или order_id (нужен хотя бы один). */
interface Lookup {
    uuid?: string;
    order_id?: string;
}
interface HistoryParams {
    limit?: number;
    offset?: number;
    status?: string;
}
interface PaymentList {
    items: Array<Partial<Payment> & Pick<Payment, 'uuid' | 'order_id' | 'amount' | 'payment_status' | 'is_final'>>;
    paginate: Paginate;
}
interface ServiceMethod {
    network: string;
    currency: string;
    is_available: boolean;
    limit: {
        min_amount: string;
        max_amount: string;
    };
    commission: {
        fee_amount: string;
        percent: string;
    };
}
/** Объект статического кошелька. */
interface Wallet {
    uuid: string;
    address: string;
    network: string;
    currency: string;
    order_id: string;
    url: string;
}
interface CreateWalletParams {
    currency: string;
    network: string;
    order_id?: string;
}
interface BlockWalletParams {
    address: string;
    is_force_block?: boolean;
}
interface BlockedRefundParams {
    uuid: string;
    address: string;
    /**
     * Свой ключ идемпотентности вызова — уходит заголовком `Idempotency-Key`, не в тело.
     * Если не задан, SDK сгенерирует UUID один раз до цикла ретраев.
     * ⚠ Бэкенд этот заголовок на `/v1/wallet/blocked-address-refund` пока не обрабатывает.
     */
    idempotency_key?: string;
}
interface Balance {
    balance: {
        merchant: Array<{
            currency: string;
            balance: string;
        }>;
    };
}
interface ReferralInfo {
    code: string;
    link: string;
    /** Доля нашей комиссии рефереру по месяцам, в bps. */
    tier_bps: number[];
    referred_count: number;
    /** Валюта → сумма в minor-единицах (строкой). */
    earnings_by_asset: Record<string, string>;
}
/** Объект выплаты. */
interface Payout {
    uuid: string;
    order_id: string;
    amount: string;
    currency: string;
    network: string;
    address: string;
    txid: string;
    status: PayoutStatus;
    is_final: boolean;
    approval_required: boolean;
    source: string;
    created_at: string;
    updated_at: string;
    /** Присутствует при использовании from_currency. */
    convert?: {
        from_currency: string;
        to_currency: string;
        from_amount: string;
        rate: string;
    };
}
interface CreatePayoutParams {
    amount: string;
    currency: string;
    order_id: string;
    address: string;
    network?: string;
    is_subtract?: boolean;
    memo?: string;
    url_callback?: string;
    from_currency?: string;
    source?: 'api' | 'manual';
    /**
     * Свой ключ идемпотентности (v1.1.0). Уходит HTTP-заголовком `Idempotency-Key`, НЕ в тело.
     * Если не задан, SDK генерирует UUID один раз на вызов (стабилен между внутренними повторами).
     */
    idempotency_key?: string;
}
interface MassPayoutItem {
    uuid?: string;
    order_id: string;
    status?: PayoutStatus;
    is_final?: boolean;
    approval_required?: boolean;
    success: boolean;
    message?: string;
}
interface CalculatePayoutParams {
    amount: string;
    currency: string;
    network?: string;
    is_subtract?: boolean;
}
interface PayoutCalculation {
    amount: string;
    currency: string;
    network: string;
    commission: string;
    merchant_amount: string;
    to_amount: string;
}
interface RefundParams {
    /**
     * Адрес возврата. С v1.1.0 не обязателен — по умолчанию средства вернутся на адрес плательщика
     * (`payer_address`). Для Bitcoin/UTXO-сетей адрес плательщика неизвестен — там `address` нужен.
     */
    address?: string;
    uuid?: string;
    order_id?: string;
    network?: string;
    amount?: string;
    /**
     * Свой ключ идемпотентности (v1.1.0). Уходит HTTP-заголовком `Idempotency-Key`, НЕ в тело.
     * Если не задан, SDK генерирует UUID один раз на вызов.
     */
    idempotency_key?: string;
}
interface ExchangeRate {
    from: string;
    to: string;
    course: string;
}
/** Сеть в публичном каталоге `GET /v1/currencies`. */
interface CurrencyNetwork {
    network: string;
    /** `native` (монета сети) или `token`. */
    kind: 'native' | 'token';
    /** Адрес контракта токена (только для `token`). */
    contract?: string;
    min_confirmations: number;
    /** Доступен ли приём (синоним `deposit_available`). */
    available: boolean;
    deposit_available: boolean;
    payout_available: boolean;
}
/** Актив в публичном каталоге `GET /v1/currencies`. */
interface Currency {
    symbol: string;
    decimals: number;
    networks: CurrencyNetwork[];
}
/**
 * Разобранное тело боевого вебхука. Поле `type` различает семейство события
 * (`payment` — счёт, `wallet` — пополнение статик-кошелька, `payout` — выплата). Часть полей зависит
 * от семейства, поэтому индекс-сигнатура допускает дополнительные ключи. Передавайте этот тип
 * generic-ом в {@link constructWebhookEvent}.
 */
interface WebhookEvent {
    type: 'payment' | 'wallet' | 'payout';
    uuid: string;
    order_id: string;
    /** Для платежа/кошелька — `payment_status`; для выплаты — укрупнённый статус (`paid`/`process`/…). */
    status: string;
    is_final: boolean;
    txid?: string;
    amount?: string;
    currency?: string;
    network?: string;
    address?: string;
    payment_amount?: string;
    payer_amount?: string;
    payer_currency?: string;
    additional_data?: string;
    [key: string]: unknown;
}
interface WebhookRegistration {
    /**
     * Идентификатор эндпоинта. На проект он ОДИН: повторный `register()` с другим URL отдаёт
     * ТОТ ЖЕ `endpoint_id` (эндпоинт не добавляется, а перенаправляется) — см. `client.webhooks.register`.
     */
    endpoint_id: string;
    url: string;
    /**
     * СЕКРЕТ ЭНДПОИНТА — им и только им проверяется подпись входящих вебхуков
     * (`verifyWebhook` / `constructWebhookEvent`).
     *
     * ⚠ Это ОТДЕЛЬНЫЙ секрет: он НЕ равен секрету API-ключа (`OBLODAI_SECRET`), которым
     * подписываются исходящие запросы. Подставите ключ API — не пройдёт НИ ОДИН вебхук.
     * Сохраните это значение (обычно в `OBLODAI_WEBHOOK_SECRET`).
     */
    secret: string;
}
interface Delivery {
    id: string;
    url: string;
    event_type: string;
    status: 'pending' | 'delivered' | 'dead';
    attempts: number;
    last_error: string;
    created_at: string;
    updated_at: string;
}
interface AcceptedMethod {
    currency: string;
    network: string;
}
interface AutoWithdrawRule {
    currency: string;
    network: string;
    address: string;
    /** Порог в minor-единицах ("0" = без порога). */
    min_minor: string;
}
/** Поведение батча при ошибке элемента: продолжать (по умолчанию) или остановиться на первой. */
type BatchOnError = 'continue' | 'stop';
/** Опции создающих batch-методов. */
interface BatchOptions {
    /** `continue` (по умолчанию) — плохой элемент фейлит только себя; `stop` — остановиться на первой ошибке. */
    onError?: BatchOnError;
    /** Свой ключ идемпотентности. Уходит заголовком `Idempotency-Key`; если не задан — SDK генерирует UUID. */
    idempotency_key?: string;
}
/** Ответ постановки батча (`/v1/payment/batch`, `/v1/refund/batch`, `/v1/payout/batch`). */
interface BatchSubmitResult {
    batch_id: string;
    kind: string;
    count: number;
    status: BatchStatus;
}
type BatchStatus = 'pending' | 'processing' | 'completed';
/** Элемент возврата в `payments.refundBatch`. `reference` и `uuid`/`order_id` инвойса обязательны. */
interface RefundBatchItem {
    /** Per-item ключ дедупликации возврата (обязателен в батче; скоуп — инвойс). */
    reference: string;
    uuid?: string;
    order_id?: string;
    /** С v1.1.0 не обязателен — по умолчанию адрес плательщика (кроме Bitcoin/UTXO). */
    address?: string;
    network?: string;
    amount?: string;
}
/** Результат одного элемента батча в `batches.info`. */
interface BatchItem {
    idx: number;
    status: string;
    order_id?: string;
    /** Байт-в-байт сохранённый result соответствующего единичного эндпоинта. */
    result?: unknown;
    error?: string;
}
/** Ответ `POST /v1/batch/info`. */
interface BatchInfo {
    batch_id: string;
    kind: string;
    status: BatchStatus;
    on_error: BatchOnError;
    total: number;
    succeeded: number;
    failed: number;
    created_at: string;
    updated_at: string;
    items: BatchItem[];
}
/** Режим суммы платёжной ссылки: фиксированная, свободная или диапазон. */
type PaymentLinkAmountMode = 'fixed' | 'open' | 'range';
/** Параметры создания платёжной ссылки (`POST /v1/payment/link`). */
interface CreatePaymentLinkParams {
    amount_mode: PaymentLinkAmountMode;
    /** Валюта ЦЕНЫ (фиат или монета — как в `payments.create`). */
    currency: string;
    title?: string;
    description?: string;
    /** Обязательна при `amount_mode: 'fixed'`. */
    amount_fixed?: string;
    /** Нижняя граница при `amount_mode: 'range'`. */
    amount_min?: string;
    /** Верхняя граница при `amount_mode: 'range'`. */
    amount_max?: string;
    /** Закрепить валюту расчёта (иначе выберет плательщик). */
    pinned_currency?: string;
    /** Закрепить сеть расчёта. */
    pinned_network?: string;
    /** Срок жизни в СЕКУНДАХ. 0 или отсутствие — бессрочная ссылка. */
    expires_in?: number;
}
/** Ответ создания платёжной ссылки. */
interface PaymentLinkCreated {
    link_id: string;
    /**
     * Публичная страница ссылки. Собирается ШЛЮЗОМ как `<публичный базовый URL>/link/<link_id>`.
     * На локальном стенде без `GATEWAY_PUBLIC_BASE_URL` приходит ПУСТОЙ СТРОКОЙ (в проде шлюз без
     * этого URL не стартует) — собирайте ссылку сами из `link_id`.
     */
    url: string;
}
/** Платёжная ссылка в list/info. */
interface PaymentLink {
    link_id: string;
    title?: string;
    description?: string;
    amount_mode: PaymentLinkAmountMode;
    currency: string;
    active: boolean;
    url: string;
    created_at: string;
    amount_fixed?: string;
    amount_min?: string;
    amount_max?: string;
    pinned_currency?: string;
    pinned_network?: string;
    expires_at?: string;
}
/** Ответ `links.info`: ссылка + платежи по ней. */
interface PaymentLinkInfo extends PaymentLink {
    payments: Array<{
        uuid: string;
        status: string;
        amount: string;
        currency: string;
        created_at: string;
        order_id?: string;
    }>;
}
/** Параметры публичного чекаута по ссылке (`POST /v1/link/{id}/checkout`). */
interface LinkCheckoutParams {
    /** Обязательна при `amount_mode: 'open' | 'range'`; у `fixed` игнорируется. */
    amount?: string;
    /** Валюта расчёта (если не закреплена в ссылке). */
    currency?: string;
    /** Сеть расчёта (если не закреплена в ссылке). */
    network?: string;
    payer_email?: string;
}
/**
 * Параметры правила сплита: ЛИБО внешний адрес (`address`+`network`, необратимо),
 * ЛИБО аккаунт на платформе (`merchant_id`, обратимо при возврате). Ровно одно из двух.
 */
interface CreateSplitRuleParams {
    address?: string;
    network?: string;
    merchant_id?: string;
    /** Доля в процентах, шаг 0.01 (0 < percent ≤ 100; сумма активных правил тоже ≤ 100). */
    percent: number;
    note?: string;
}
/** Правило сплита в `splits.listRules`. */
interface SplitRule {
    rule_id: string;
    percent: number;
    active: boolean;
    note?: string;
    address?: string;
    network?: string;
    merchant_id?: string;
    /** `false` — доля ушла на внешний адрес (необратимо); `true` — партнёру на платформе (отзовётся при возврате). */
    reversible: boolean;
}
/** Настройки сплитов: окно удержания исходящей маршрутизации после settle. */
interface SplitConfig {
    refund_hold_hours: number;
}
/** Параметры `payments.sendEmail` (`POST /v1/payment/send-email`). */
interface SendEmailParams {
    uuid?: string;
    order_id?: string;
    /** Получатель. Если не задан — берётся `payer_email` платежа (иначе `email.no_recipient`). */
    email?: string;
}
interface SendEmailResult {
    sent: boolean;
    email: string;
    uuid: string;
}
/** Параметры `payments.resolve` (`POST /v1/payment/resolve`) — судьба недоплаченного платежа. */
interface ResolveParams {
    uuid?: string;
    order_id?: string;
    /** `accept` — оставить частичную оплату (глушит авто-возврат); `refund` — вернуть плательщику. */
    action: 'accept' | 'refund';
    /** Только refund: адрес возврата; по умолчанию `payer_address` инвойса (для UTXO обязателен). */
    address?: string;
    /** Только refund: сеть; по умолчанию сеть инвойса. */
    network?: string;
    /** Только refund: per-refund ключ дедупликации (уйдёт в reference рефанд-выплаты). */
    reference?: string;
    /** Свой ключ идемпотентности. Уходит заголовком `Idempotency-Key`; если не задан — SDK генерирует UUID. */
    idempotency_key?: string;
}
/** Результат `payments.resolve`. Набор полей зависит от `resolution`. */
interface ResolveResult {
    payment_uuid: string;
    order_id: string;
    resolution: 'accepted' | 'refunded';
    currency: string;
    /** accept: сколько оставлено мерчанту. */
    amount_kept?: string;
    /** refund: uuid рефанд-выплаты. */
    uuid?: string;
    /** refund: сумма возврата. */
    amount?: string;
    /** refund: адрес возврата. */
    address?: string;
    /** refund: статус рефанд-выплаты (`check`/`process`/`paid`/`fail`/`cancel`). */
    status?: string;
    /** refund: терминальность статуса. */
    is_final?: boolean;
}
/**
 * Статус payout-ссылки:
 * - `funded` — создана, резерв удержан, ждёт claim;
 * - `claiming` — claim в процессе (адрес зафиксирован, выплата порождается);
 * - `claimed` — выплата порождена (терминальный);
 * - `expired` — срок вышел без claim, резерв возвращён (терминальный);
 * - `cancelled` — отменена мерчантом до claim, резерв возвращён (терминальный).
 */
type PayoutLinkStatus = 'funded' | 'claiming' | 'claimed' | 'expired' | 'cancelled';
/** Параметры создания payout-ссылки (`POST /v1/payout/link`). */
interface CreatePayoutLinkParams {
    /** Крипто-актив выплаты (uppercase), например `USDT`. */
    currency: string;
    /** Сеть выплаты получателю, например `tron`. */
    network: string;
    /** Сумма (строкой) в `currency`. */
    amount: string;
    /**
     * Per-link ключ дедупликации (уникален в рамках мерчанта) — второй, durable слой защиты от
     * дублей поверх `Idempotency-Key`: работает даже без заголовка и даже когда ответ батча
     * слишком велик для кэша идемпотентности (>256 КБ). Повтор с тем же `reference` →
     * `409 payoutlink.duplicate_reference`. Рекомендуется всегда задавать в батчах.
     */
    reference?: string;
    /**
     * Свой ключ идемпотентности вызова — уходит заголовком `Idempotency-Key`, не в тело.
     * Если не задан, SDK сгенерирует UUID один раз до цикла ретраев.
     * Бэкенд этот заголовок на `/v1/payout/link` УВАЖАЕТ: повтор с тем же ключом реплеит первый
     * ответ (`Idempotent-Replayed: true`), баланс дебетуется ровно один раз. Тот же ключ с другим
     * телом → `400 idempotency.key_reused`.
     */
    idempotency_key?: string;
    /** Лейбл, виден получателю. */
    title?: string;
    /** Заметка, видна получателю (и в письме). */
    note?: string;
    /** E-mail получателя — придёт письмо с кнопкой claim (best-effort). */
    email?: string;
    /**
     * Окно claim в ЧАСАХ, клампится в [1, 720]. РЕКОМЕНДУЕТСЯ задавать явно:
     * при 0/отсутствии бэкенд клампит к 1 часу (НЕ к 720).
     */
    expires_in_hours?: number;
}
/** Payout-ссылка в list/info/cancel (без claim-токена). */
interface PayoutLink {
    link_id: string;
    status: PayoutLinkStatus;
    amount: string;
    currency: string;
    network: string;
    title?: string;
    note?: string;
    expires_at: string;
    created_at: string;
    reference?: string;
    email?: string;
    /** UUID порождённой выплаты (после claim). */
    payout_id?: string;
    /** Адрес получателя (после claim). */
    claim_address?: string;
    /** Общий id батча (для ссылок из `createBatch`). */
    batch_id?: string;
}
/**
 * Ответ создания payout-ссылки. `claim_token`/`claim_url` возвращаются ТОЛЬКО здесь
 * (хранится лишь хеш токена) — сохраните их сразу.
 */
interface PayoutLinkCreated extends PayoutLink {
    claim_token: string;
    /**
     * Ссылка на страницу claim. Собирается ШЛЮЗОМ как `<публичный базовый URL>/claim/<claim_token>`.
     * На ЛОКАЛЬНОМ стенде без `GATEWAY_PUBLIC_BASE_URL` приходит ПУСТОЙ СТРОКОЙ (в проде шлюз без
     * этого URL не стартует) — тогда собирайте ссылку сами из `claim_token`.
     */
    claim_url: string;
}
/** Элемент ответа `payoutLinks.createBatch` (index-aligned с запросом). */
interface PayoutLinkBatchItem {
    ok: boolean;
    link?: PayoutLinkCreated;
    error?: string;
    message?: string;
}
/** Ответ `POST /v1/payout/link/batch`. */
interface PayoutLinkBatchResult {
    created: number;
    total: number;
    results: PayoutLinkBatchItem[];
}
/** Публичные детали ссылки для страницы claim (`GET /v1/claim/{token}`). */
interface PayoutLinkClaimInfo {
    status: PayoutLinkStatus;
    amount: string;
    currency: string;
    network: string;
    title?: string;
    note?: string;
    expires_at: string;
    /** Можно ли забрать прямо сейчас (`funded` и срок не вышел). */
    claimable: boolean;
}
/** Результат успешного claim (`POST /v1/claim/{token}`). */
interface PayoutLinkClaimResult {
    status: 'claimed';
    payout_id: string;
    amount: string;
    currency: string;
    network: string;
    address: string;
}
/** Параметры симуляции он-чейн депозита в инвойс (`POST /v1/sandbox/deposit`). */
interface SandboxDepositParams {
    /** UUID инвойса, который «оплачивает» виртуальный покупатель. */
    invoice_id: string;
    /**
     * Сумма депозита. Не задана/пустая строка — заплатить ровно сумму к оплате;
     * меньшее/большее значение симулирует недоплату/переплату.
     */
    amount?: string;
    /**
     * Число подтверждений. Не задано/0 — депозит сразу полностью подтверждён; небольшое число —
     * транзакция приходит ещё pending и сама глубже НЕ станет. Единственный способ подтвердить её —
     * повторить вызов с тем же `txid` и бОльшим `confirmations`.
     */
    confirmations?: number;
    /**
     * Идентификатор транзакции. Не задан — сгенерируется новый; повтор того же `txid` позволяет
     * тестировать идемпотентность и «углубление» подтверждений.
     */
    txid?: string;
}
/** Результат симуляции депозита. */
interface SandboxDeposit {
    invoice_id: string;
    txid: string;
    amount: string;
    confirmations: number;
}
/** Параметры пополнения тестового баланса (`POST /v1/sandbox/faucet`). */
interface SandboxFaucetParams {
    /** Актив, например `USDT`. */
    asset: string;
    /** Сумма (строка), максимум 1000000 за вызов. */
    amount: string;
    /** Опциональный ключ идемпотентности (в теле запроса — так требует контракт эндпоинта). */
    idempotency_key?: string;
}
/** Результат faucet-пополнения. */
interface SandboxFaucetResult {
    asset: string;
    amount: string;
    journal_id: string;
}
/** Результат сброса песочницы (`POST /v1/sandbox/reset`). */
interface SandboxResetResult {
    /** Сколько открытых инвойсов отменено. */
    invoices_cancelled: number;
    /** Сколько балансов обнулено (компенсирующей проводкой — история сохраняется). */
    balances_zeroed: number;
}
/** Доставка вебхука в журнале песочницы (`GET /v1/sandbox/webhooks`) — {@link Delivery} + сырой payload. */
interface SandboxDelivery extends Delivery {
    /** Сырое тело вебхука (JSON-объект как есть). */
    payload: Record<string, unknown>;
}
/** Результат перепостановки доставки (`POST /v1/sandbox/webhooks/replay`). */
interface SandboxReplayResult {
    delivery_id: string;
    requeued: boolean;
}
/**
 * Элемент перевода пользователю платформы: тело `POST /v1/transfer/to-user` и элементы
 * `account.transferBatch` (`POST /v1/transfer/batch`).
 */
interface TransferToUserItem {
    /**
     * Идентификатор ПОЛЬЗОВАТЕЛЯ платформы — UUID, НЕ username (не-UUID бэкенд отклоняет:
     * `transfer.bad_recipient`). Username резолвится в user_id на стороне кабинета
     * (публичный профиль), ядро username'ов сознательно не знает.
     */
    to_user_id: string;
    /** Сумма (строкой) в `currency`. */
    amount: string;
    /** Крипто-актив, например `USDT`. */
    currency: string;
    /** Ваш бизнес-идентификатор. Участвует в лестнице идемпотентности бэкенда (header → order_id → подпись). */
    order_id?: string;
}
/** Параметры `account.transferToUser` (`POST /v1/transfer/to-user`). */
interface TransferToUserParams extends TransferToUserItem {
    /**
     * Свой ключ идемпотентности. Уходит HTTP-заголовком `Idempotency-Key`, НЕ в тело.
     * Если не задан, SDK генерирует UUID один раз на вызов (стабилен между внутренними повторами).
     */
    idempotency_key?: string;
}
/** Результат `POST /v1/transfer/to-user`. */
interface TransferToUserResult {
    currency: string;
    amount: string;
    /** Канонизированный UUID получателя. */
    to_user_id: string;
    /** Новый баланс личного кошелька получателя в `currency`. */
    recipient_balance: string;
}
/**
 * Публичное состояние счёта для кастомного чекаута (`GET /v1/pay/{id}`,
 * `POST /v1/pay/{id}/select`) — {@link Payment} без мерчант-приватных полей
 * (`additional_data`, `payer_email`, `payer_address`).
 */
interface PublicPayment extends Omit<Payment, 'payment_status' | 'additional_data' | 'payer_email' | 'payer_address'> {
    /**
     * Тот же словарь, что у `Payment.payment_status`. У валюто-агностичного счёта до выбора
     * это `'select'` — адрес не выделен, курс не зафиксирован (см. {@link PaymentStatus}).
     */
    payment_status: PaymentStatus;
    /** Только при `payment_status === 'select'`: методы, из которых плательщик может выбрать. */
    accepted?: AcceptedMethod[];
    [key: string]: unknown;
}
/** Параметры публичного выбора валюты плательщиком (`POST /v1/pay/{id}/select`). */
interface PaySelectParams {
    /** Крипто-актив расчёта, например `USDT`. */
    currency: string;
    /** Сеть расчёта, например `tron`. */
    network: string;
}

/** Методы приёма платежей. */
declare class Payments extends BaseResource {
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
    create(params: CreatePaymentParams): Promise<Payment>;
    /**
     * Массовое создание платежей — до 5000 одним подписанным запросом (одна отметка rate-limit).
     * `POST /v1/payment/batch`. Обработка в фоне: результат по элементам — через
     * `client.batches.info(batch_id)`.
     *
     * На каждом элементе ОБЯЗАТЕЛЕН `order_id` (`batch.order_id_required`); дубликат внутри
     * батча → `batch.duplicate_order_id`. Идемпотентность вызова — заголовком `Idempotency-Key`
     * (генерируется SDK или `opts.idempotency_key`).
     */
    createBatch(payments: CreatePaymentParams[], opts?: BatchOptions): Promise<BatchSubmitResult>;
    /**
     * Массовый возврат — до 5000 одним запросом. `POST /v1/refund/batch`.
     * На каждом элементе обязательны `reference` (per-item ключ дедупликации) и
     * `uuid`/`order_id` инвойса. Идемпотентность вызова — заголовком `Idempotency-Key`.
     * Результат по элементам — `client.batches.info(batch_id)`.
     */
    refundBatch(refunds: RefundBatchItem[], opts?: BatchOptions): Promise<BatchSubmitResult>;
    /**
     * Отправить покупателю счёт на e-mail (письмо с кнопкой «Оплатить»). `POST /v1/payment/send-email`
     *
     * Получатель — `email` или `payer_email` платежа. Лимит: 10 писем/час на адрес получателя
     * (`email.rate_limited`). Заголовок `Idempotency-Key` на этом эндпоинте не действует
     * (эндпоинт им не обёрнут) — повтор вызова отправит письмо ещё раз.
     */
    sendEmail(params: SendEmailParams): Promise<SendEmailResult>;
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
    resolve(params: ResolveParams): Promise<ResolveResult>;
    /** Информация о счёте по uuid или order_id. `POST /v1/payment/info` */
    info(lookup: Lookup): Promise<Payment>;
    /** Список платежей мерчанта. `POST /v1/payment/history` */
    history(params?: HistoryParams): Promise<PaymentList>;
    /** Доступные методы приёма. `POST /v1/payment/services` */
    services(): Promise<ServiceMethod[]>;
    /** QR-код депозит-адреса счёта (data:-URI). `POST /v1/payment/qr` */
    qr(lookup: Lookup): Promise<{
        image: string;
    }>;
    /** Переотправить текущий вебхук платежа. `POST /v1/payment/resend`. Ответ: `{ result: true }`. */
    resend(lookup: Lookup): Promise<{
        result: boolean;
    }>;
    /**
     * Возврат средств платежа. `POST /v1/payment/refund` (см. также client.payouts.refund)
     *
     * С v1.1.0 `address` не обязателен — по умолчанию вернём на адрес плательщика
     * (для Bitcoin/UTXO он неизвестен — там `address` нужен). Идемпотентность — заголовком
     * `Idempotency-Key` (SDK генерирует сам; свой — `params.idempotency_key`).
     */
    refund(params: RefundParams): Promise<unknown>;
    /**
     * ПУБЛИЧНО (без подписи): состояние счёта для КАСТОМНОЙ страницы оплаты. `GET /v1/pay/{id}`
     *
     * То, чем живёт hosted-страница оплаты: сумма, адрес (после выбора валюты), QR, статус,
     * срок — можно дергать из браузера плательщика и поллить статус без секрета мерчанта.
     * Мерчант-приватные поля (`additional_data`, `payer_email`, `payer_address`) не возвращаются.
     * У валюто-агностичного счёта до выбора валюты `payment_status === 'select'`, а в `accepted` —
     * методы, из которых плательщик может выбрать (см. {@link publicSelect}).
     */
    publicGet(uuid: string): Promise<PublicPayment>;
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
    publicSelect(uuid: string, params: PaySelectParams): Promise<PublicPayment>;
    /** Список принимаемых валют для агностичных счетов. `POST /v1/payment/accepted/list` */
    listAccepted(): Promise<{
        accepted: AcceptedMethod[];
    }>;
    /** Заменить набор принимаемых валют. `POST /v1/payment/accepted/set` */
    setAccepted(accepted: AcceptedMethod[]): Promise<{
        ok: boolean;
    }>;
    /** Список правил скидок/наценок. `POST /v1/payment/discount/list` */
    listDiscounts(): Promise<Array<{
        currency: string;
        network: string;
        discount_percent: number;
    }>>;
    /** Задать скидку/наценку. `POST /v1/payment/discount/set` */
    setDiscount(params: {
        discount_percent: number;
        currency?: string;
        network?: string;
    }): Promise<unknown>;
    /** Прочитать допуск недоплаты. `POST /v1/payment/accuracy/get` */
    getAccuracy(): Promise<{
        enabled: boolean;
        accuracy_percent: number;
    }>;
    /** Задать допуск недоплаты. `POST /v1/payment/accuracy/set` */
    setAccuracy(params: {
        enabled: boolean;
        accuracy_percent?: number;
    }): Promise<unknown>;
    /** Прочитать настройки автовозврата. `POST /v1/payment/autorefund/get` */
    getAutorefund(): Promise<{
        overpay: boolean;
        underpay: boolean;
        configured: boolean;
    }>;
    /** Задать настройки автовозврата. `POST /v1/payment/autorefund/set` */
    setAutorefund(params: {
        overpay: boolean;
        underpay: boolean;
    }): Promise<unknown>;
}

/** Методы выплат и возвратов. */
declare class Payouts extends BaseResource {
    /**
     * Создать выплату на внешний адрес. `POST /v1/payout`
     *
     * `order_id` обязателен всегда (`payout.order_id_required`) — это ВАШ бизнес-идентификатор.
     * Идемпотентность повторов (v1.1.0) — заголовком `Idempotency-Key`: SDK генерирует UUID
     * один раз до цикла ретраев; свой ключ — `params.idempotency_key` (в заголовок, не в тело).
     */
    create(params: CreatePayoutParams): Promise<Payout>;
    /**
     * Массовая выплата (до 100, синхронная). `POST /v1/payout/mass`
     * Идемпотентность вызова — заголовком `Idempotency-Key` (генерируется SDK или
     * `opts.idempotency_key`). Для тысяч выплат используйте {@link createBatch}.
     */
    createMass(payouts: CreatePayoutParams[], source?: string, opts?: {
        idempotency_key?: string;
    }): Promise<{
        items: MassPayoutItem[];
    }>;
    /**
     * Массовое создание выплат — до 5000 одним подписанным запросом, обработка в фоне.
     * `POST /v1/payout/batch`. Результат по элементам — `client.batches.info(batch_id)`.
     *
     * На каждом элементе ОБЯЗАТЕЛЕН `order_id` (`batch.order_id_required`); дубликат внутри
     * батча → `batch.duplicate_order_id`. Идемпотентность вызова — заголовком `Idempotency-Key`.
     */
    createBatch(payouts: CreatePayoutParams[], opts?: BatchOptions): Promise<BatchSubmitResult>;
    /** Информация о выплате по uuid или order_id. `POST /v1/payout/info` */
    info(lookup: Lookup): Promise<Payout>;
    /** История выплат. `POST /v1/payout/history` */
    history(params?: HistoryParams): Promise<{
        items: Partial<Payout>[];
        paginate: Paginate;
    }>;
    /** Доступные методы выплат. `POST /v1/payout/services` */
    services(): Promise<ServiceMethod[]>;
    /** Предрасчёт комиссии и сумм без создания. `POST /v1/payout/calculate` */
    calculate(params: CalculatePayoutParams): Promise<PayoutCalculation>;
    /**
     * Подтвердить выплату в статусе pending (для API-ключа обычно не нужно). `POST /v1/payout/approve`
     *
     * Ключ идемпотентности не нужен и не шлётся: это переход состояния, а не создание. Бэкенд
     * принимает только `StatusPending` и отвечает `409 payout.not_pending` в любом другом случае,
     * поэтому повторный approve физически не может одобрить или двинуть деньги дважды. Читайте
     * этот 409 как «уже одобрено» и уточняйте фактический статус через {@link info}.
     */
    approve(uuid: string): Promise<unknown>;
    /**
     * Возврат средств платежа (движок выплат). `POST /v1/payment/refund`
     * С v1.1.0 `address` не обязателен (по умолчанию — адрес плательщика; для Bitcoin/UTXO нужен).
     * Идемпотентность — заголовком `Idempotency-Key` (SDK генерирует сам).
     */
    refund(params: RefundParams): Promise<unknown>;
    /** Кто платит сетевую комиссию выплаты — чтение. `POST /v1/payout/fee-config/get` */
    getFeeConfig(): Promise<{
        fee_on_recipient: boolean;
        configured: boolean;
    }>;
    /** Кто платит сетевую комиссию выплаты — запись. `POST /v1/payout/fee-config/set` */
    setFeeConfig(feeOnRecipient: boolean): Promise<{
        fee_on_recipient: boolean;
    }>;
    /** Кто несёт нашу комиссию при возврате — чтение. `POST /v1/payout/refund-fee-config/get` */
    getRefundFeeConfig(): Promise<{
        fee_on_customer: boolean;
        configured: boolean;
    }>;
    /** Кто несёт нашу комиссию при возврате — запись. `POST /v1/payout/refund-fee-config/set` */
    setRefundFeeConfig(feeOnCustomer: boolean): Promise<{
        fee_on_customer: boolean;
    }>;
}

/** Методы статических кошельков. */
declare class Wallets extends BaseResource {
    /** Создать (или получить) постоянный статический адрес. `POST /v1/wallet` */
    create(params: CreateWalletParams): Promise<Wallet>;
    /** Заблокировать/разблокировать кошелёк. `POST /v1/wallet/block`
     *  Внимание: is_force_block по умолчанию true — для разблокировки передайте false. */
    block(params: BlockWalletParams): Promise<{
        uuid: string;
        address: string;
        blocked: boolean;
    }>;
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
    blockedAddressRefund(params: BlockedRefundParams): Promise<unknown>;
    /** QR-код произвольного адреса (data:-URI). `POST /v1/wallet/qr` */
    qr(address: string): Promise<{
        image: string;
    }>;
}

/** Баланс, рефералы, переводы на личный кошелёк и пользователям платформы, VRCS. */
declare class Account extends BaseResource {
    /** Доступные балансы мерчанта. `POST /v1/balance` */
    balance(): Promise<Balance>;
    /** Реферальная статистика. `POST /v1/referral/info` */
    referral(): Promise<ReferralInfo>;
    /**
     * Перевод средств на личный кошелёк владельца. `POST /v1/transfer/to-personal`
     *
     * Идемпотентность (v1.1.0): SDK генерирует ключ один раз до цикла ретраев и шлёт заголовком
     * `Idempotency-Key` — автоматический повтор не создаёт повторный перевод. Свой ключ —
     * `params.idempotency_key` (в заголовок, не в тело). ЛОМАЮЩЕЕ изменение против v1.0.x:
     * автоматический `order_id` (`idem-<uuid>`) больше НЕ подставляется — `order_id` уходит как есть.
     */
    transferToPersonal(params: {
        amount: string;
        currency: string;
        order_id?: string;
        /** Свой ключ идемпотентности — уйдёт заголовком `Idempotency-Key`, не в тело. */
        idempotency_key?: string;
    }): Promise<{
        currency: string;
        amount: string;
        direction: string;
        personal_balance: string;
    }>;
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
    transferToUser(params: TransferToUserParams): Promise<TransferToUserResult>;
    /**
     * Массовый («зарплатный») перевод пользователям платформы (v1.2.0): пачка элементов формата
     * `transferToUser`, обработка в фоне. `POST /v1/transfer/batch`.
     *
     * Прогресс и результаты по элементам — СУЩЕСТВУЮЩИМ методом `client.batches.info(batch_id)`
     * (`items[].result` — байт-в-байт result единичного `/v1/transfer/to-user`). Идемпотентность
     * вызова — заголовком `Idempotency-Key` (генерируется SDK или `opts.idempotency_key`).
     */
    transferBatch(transfers: TransferToUserItem[], opts?: BatchOptions): Promise<BatchSubmitResult>;
    /** Включить/выключить VRCS. Без enabled — чтение. `POST /v1/vrcs` */
    vrcs(enabled?: boolean): Promise<{
        enabled: boolean;
    }>;
}

/**
 * Управление вебхуками. Проверка ВХОДЯЩИХ вебхуков — отдельные функции verifyWebhook /
 * constructWebhookEvent (импортируются из корня пакета), здесь только управление через API.
 */
declare class Webhooks extends BaseResource {
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
    register(url: string): Promise<WebhookRegistration>;
    /**
     * Журнал последних доставок (до 50, новые первыми). `POST /v1/webhooks/deliveries`
     *
     * ⚠ ЛОМАЮЩЕЕ изменение в v1.2.0: метод отдаёт МАССИВ `Delivery[]`, а не `{ deliveries }` —
     * конверт разворачивается, как в `sandbox.listWebhooks()` и `payoutLinks.list()`.
     */
    deliveries(): Promise<Delivery[]>;
    /** Пробный вебхук платежа. `POST /v1/test-webhook/payment` */
    testPayment(params: {
        url_callback: string;
        status?: string;
        currency?: string;
        network?: string;
        uuid?: string;
        order_id?: string;
    }): Promise<{
        result: boolean;
        status_code: number;
    }>;
    /** Пробный вебхук кошелька. `POST /v1/test-webhook/wallet` */
    testWallet(params: {
        url_callback: string;
        status?: string;
        currency?: string;
        network?: string;
        uuid?: string;
        order_id?: string;
    }): Promise<{
        result: boolean;
        status_code: number;
    }>;
    /** Пробный вебхук выплаты. `POST /v1/test-webhook/payout` */
    testPayout(params: {
        url_callback: string;
        status?: string;
        currency?: string;
        network?: string;
        uuid?: string;
        order_id?: string;
    }): Promise<{
        result: boolean;
        status_code: number;
    }>;
}

/** Автовывод и IP-allowlist. */
declare class Settings extends BaseResource {
    /** Список правил автовывода. `POST /v1/auto-withdraw/list` */
    listAutoWithdraw(): Promise<{
        rules: AutoWithdrawRule[];
    }>;
    /** Включить автовывод для актива. `POST /v1/auto-withdraw/set`
     *  `min` — порог в единицах актива (не minor), по умолчанию "0". */
    setAutoWithdraw(params: {
        currency: string;
        network: string;
        address: string;
        min?: string;
    }): Promise<unknown>;
    /** Выключить автовывод для актива. `POST /v1/auto-withdraw/delete` */
    deleteAutoWithdraw(currency: string): Promise<unknown>;
    /** Список доверенных IP и статус. `POST /v1/api-allowlist/list` */
    listAllowlist(): Promise<{
        entries: string[];
        enabled: boolean;
    }>;
    /** Добавить IP или CIDR. `POST /v1/api-allowlist/add` */
    addAllowlist(cidr: string): Promise<unknown>;
    /** Удалить IP или CIDR. `POST /v1/api-allowlist/remove` */
    removeAllowlist(cidr: string): Promise<unknown>;
    /** Включить/выключить контроль. `POST /v1/api-allowlist/enable`
     *  Нельзя включить с пустым списком — сначала добавьте IP. */
    enableAllowlist(enabled: boolean): Promise<unknown>;
}

/** Публичные справочники: курсы валют и каталог монет/сетей (подпись не требуется). */
declare class Rates extends BaseResource {
    /**
     * Текущие курсы к USDT. `POST /v1/exchange-rate/list` (публичный).
     * Без аргумента — по всем валютам; с `currencyFrom` — по одной.
     */
    list(currencyFrom?: string): Promise<ExchangeRate[]>;
    /**
     * Каталог принимаемых активов и сетей. `GET /v1/currencies` (публичный, без подписи).
     * Удобно для построения выбора валюты в чекауте.
     */
    currencies(): Promise<Currency[]>;
}

/**
 * Статус массовых операций (v1.1.0). Постановка батча — методами `payments.createBatch`,
 * `payments.refundBatch`, `payouts.createBatch`; здесь — прогресс и результаты по элементам.
 */
declare class Batches extends BaseResource {
    /**
     * Прогресс и результаты батча. `POST /v1/batch/info` (read-only, идемпотентен сам по себе).
     * `limit` вне (0, 500] заменяется бэкендом на 100. `items[].result` — байт-в-байт result
     * соответствующего единичного эндпоинта.
     */
    info(batchId: string, params?: {
        limit?: number;
        offset?: number;
    }): Promise<BatchInfo>;
}

/**
 * Платёжные ссылки (v1.1.0): переиспользуемая ссылка, по которой платят многие —
 * каждый платёж порождает свой инвойс со своим адресом. Единственный способ принимать
 * платежи вообще без бэкенда (Tilda, Wix и т.п.).
 *
 * Management-методы (create/list/info/toggle) подписываются платёжным ключом; заголовок
 * `Idempotency-Key` на них не действует (эндпоинты им не обёрнуты). `publicGet`/`checkout` —
 * публичные, без подписи (для кода на стороне плательщика).
 */
declare class Links extends BaseResource {
    /**
     * Создать платёжную ссылку. `POST /v1/payment/link`
     * `expires_in` — в СЕКУНДАХ; 0/отсутствие = бессрочная. Ответ: `{ link_id, url }`.
     */
    create(params: CreatePaymentLinkParams): Promise<PaymentLinkCreated>;
    /** Список ссылок мерчанта. `POST /v1/payment/link/list` */
    list(params?: {
        limit?: number;
        offset?: number;
    }): Promise<PaymentLink[]>;
    /** Ссылка + платежи по ней. `POST /v1/payment/link/info` */
    info(linkId: string): Promise<PaymentLinkInfo>;
    /** Включить/выключить ссылку. `POST /v1/payment/link/toggle` */
    toggle(linkId: string, active: boolean): Promise<{
        link_id: string;
        active: boolean;
    }>;
    /**
     * Публичные детали ссылки. `GET /v1/link/{id}` — БЕЗ подписи (можно дергать со страницы
     * плательщика). Неактивная/истёкшая ссылка → `paylink.not_found` (404).
     */
    publicGet(linkId: string): Promise<PaymentLink>;
    /**
     * Публичный чекаут по ссылке: порождает обычный инвойс. `POST /v1/link/{id}/checkout` —
     * БЕЗ подписи. Закреплённые в ссылке валюта/сеть побеждают переданные. Лимит: 30 инвойсов/мин
     * на ссылку (`paylink.rate_limited`). Ответ — обычный объект платежа (`uuid` + `url`).
     */
    checkout(linkId: string, params?: LinkCheckoutParams): Promise<Payment>;
}

/**
 * Сплит-платежи (v1.1.0): доля каждого входящего платежа автоматически уходит партнёру.
 * Все методы требуют payout-ключ. Заголовок `Idempotency-Key` на этих эндпоинтах не
 * действует (не обёрнуты) — но операции декларативны (правила), повтор безопасен по смыслу.
 *
 * ВАЖНО про возвраты: отправка долей откладывается на окно `refund_hold_hours` — возврат внутри
 * окна сам уменьшает/отменяет отчисление. Долю, уже ушедшую на внешний адрес, вернуть нельзя.
 */
declare class Splits extends BaseResource {
    /**
     * Создать правило сплита. `POST /v1/split/rule`
     * Ровно одно из двух: `address`+`network` (внешний адрес, необратимо) ИЛИ `merchant_id`
     * (партнёр на платформе, обратимо). `percent` — 0 < x ≤ 100, шаг 0.01; сумма активных
     * правил тоже ≤ 100. Удобные обёртки: {@link splitToAddress}, {@link splitToMerchant}.
     */
    createRule(params: CreateSplitRuleParams): Promise<{
        rule_id: string;
        percent: number;
    }>;
    /** Доля на внешний адрес (необратимо при возврате). Обёртка над {@link createRule}. */
    splitToAddress(address: string, network: string, percent: number, note?: string): Promise<{
        rule_id: string;
        percent: number;
    }>;
    /** Доля аккаунту на платформе (возврат отзовёт долю). Обёртка над {@link createRule}. */
    splitToMerchant(merchantId: string, percent: number, note?: string): Promise<{
        rule_id: string;
        percent: number;
    }>;
    /** Список правил сплита. `POST /v1/split/rule/list` */
    listRules(): Promise<SplitRule[]>;
    /** Удалить правило. `POST /v1/split/rule/delete` */
    deleteRule(ruleId: string): Promise<{
        deleted: boolean;
    }>;
    /** Настройки сплитов (окно удержания перед отправкой долей). `POST /v1/split/config/get` */
    getConfig(): Promise<SplitConfig>;
    /**
     * Задать окно удержания `refund_hold_hours` — отсрочка исходящей маршрутизации
     * (сплиты/авто-вывод/авто-конверсия) после settle. `POST /v1/split/config/set`
     */
    setConfig(refundHoldHours: number): Promise<SplitConfig>;
}

/**
 * Payout-ссылки — «крипто-чеки» (v1.1.0): вы резервируете средства в claimable-ссылку,
 * НЕ зная кошелька получателя. Получатель открывает `claim_url`, вводит свой адрес — из
 * резерва порождается обычная выплата. Непорученная ссылка возвращает резерв при
 * истечении срока или отмене.
 *
 * Management-методы (create/createBatch/list/info/cancel) требуют PAYOUT-ключ.
 * `claimInfo`/`claim` — публичные, БЕЗ подписи (авторизация — сам 256-битный токен в URL).
 *
 * Идемпотентность: `POST /v1/payout/link` и `POST /v1/payout/link/batch` ОБЁРНУТЫ на бэкенде в
 * idempotency-middleware, поэтому заголовок `Idempotency-Key` здесь РАБОТАЕТ. SDK шлёт его на
 * обоих создающих вызовах и держит НЕИЗМЕННЫМ на всех внутренних повторах, так что автоповтор
 * при 5xx/таймауте/сетевой ошибке безопасен: шлюз реплеит первый ответ (та же ссылка, тот же
 * `claim_token`, заголовок `Idempotent-Replayed: true`), а баланс дебетуется РОВНО ОДИН РАЗ.
 *
 * Коды, специфичные для повторов (все — терминальные, кроме 503):
 * - `400 idempotency.key_reused` — тот же ключ с ДРУГИМ телом;
 * - `400 idempotency.bad_key` — некорректный ключ (длиннее 255 символов);
 * - `409 idempotency.in_progress` — параллельный повтор, пока первый ещё выполняется; повторите
 *   чуть позже тем же ключом;
 * - `503 idempotency.unavailable` — стор идемпотентности недоступен (fail-closed by design);
 *   ретраибельна, SDK повторит сам.
 *
 * ⚠ БЕЗ заголовка поведение прежнее: два одинаковых вызова создадут ДВЕ ссылки с двумя резервами.
 *
 * Второй, durable слой защиты — опциональный per-link `reference` (уникален в рамках мерчанта):
 * он работает даже без заголовка и даже когда ответ батча слишком велик для кэша. Повторный
 * create с тем же `reference` отдаёт `409 payoutlink.duplicate_reference` (раньше был 500,
 * который SDK ретраил вхолостую).
 */
declare class PayoutLinks extends BaseResource {
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
    create(params: CreatePayoutLinkParams): Promise<PayoutLinkCreated>;
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
    createBatch(links: CreatePayoutLinkParams[], opts?: {
        idempotency_key?: string;
    }): Promise<PayoutLinkBatchResult>;
    /** Список ссылок (created_at DESC; limit вне (0,200] → 50). `POST /v1/payout/link/list` */
    list(params?: {
        limit?: number;
        offset?: number;
    }): Promise<PayoutLink[]>;
    /** Информация о ссылке (после claim содержит `payout_id`, `claim_address`). `POST /v1/payout/link/info` */
    info(linkId: string): Promise<PayoutLink>;
    /**
     * Отменить непорученную (`funded`) ссылку — резерв вернётся на available.
     * `POST /v1/payout/link/cancel`. Уже забранная → `payoutlink.not_funded` (409);
     * гонка с claim разрешается в пользу claim (вернётся `status: 'claimed'` + `payout_id`).
     */
    cancel(linkId: string): Promise<PayoutLink>;
    /**
     * ПУБЛИЧНО (без подписи): детали ссылки для страницы claim. `GET /v1/claim/{token}`
     * Ничего мерчант-приватного не возвращает. `claimable === true` — можно забирать.
     */
    claimInfo(token: string): Promise<PayoutLinkClaimInfo>;
    /**
     * ПУБЛИЧНО (без подписи): забрать средства на адрес получателя. `POST /v1/claim/{token}`
     * `memo` — dest tag/comment для сетей вроде TON. Идемпотентно: повторный claim уже
     * забранной ссылки возвращает ту же выплату; claim с ДРУГИМ адресом на взятой ссылке →
     * `payoutlink.claim_in_progress` (409). Истёкшая/отменённая → `payoutlink.expired` /
     * `payoutlink.cancelled` (409).
     */
    claim(token: string, params: {
        address: string;
        memo?: string;
    }): Promise<PayoutLinkClaimResult>;
}

/**
 * `true`, если ключ тестовый: `public_id` тестового ключа начинается с `test_`
 * (секрет — с `oblodai_test_`). Бизнес-эндпоинты с тестовым ключом работают точь-в-точь
 * как с боевым — меняется только ключ; тестовые же (`/v1/sandbox/*`) доступны ТОЛЬКО ему.
 */
declare function isTestKey(publicId: string): boolean;
/**
 * Песочница разработчика (v1.2.0) — ТОЛЬКО для тестовых ключей (`test_...` / `oblodai_test_...`).
 *
 * Эти пять методов заменяют то, что в бою делает внешний мир (покупатель платит он-чейн и т.п.),
 * поэтому им место в ТЕСТОВОМ коде, а не в интеграции: боевой ключ на любом `/v1/sandbox/*`
 * получает `403 sandbox.live_key`. Все остальные методы SDK с тестовым ключом работают без
 * изменений — интеграционный код между тестом и боем не меняется, меняется только ключ.
 */
declare class Sandbox extends BaseResource {
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
    simulateDeposit(params: SandboxDepositParams): Promise<SandboxDeposit>;
    /**
     * Начислить тестовый баланс, чтобы гонять выплаты/возвраты. `POST /v1/sandbox/faucet`
     * Максимум 1000000 за вызов; `idempotency_key` (в теле) защищает от дублей при повторе.
     */
    faucet(params: SandboxFaucetParams): Promise<SandboxFaucetResult>;
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
    reset(): Promise<SandboxResetResult>;
    /**
     * Журнал последних доставок вебхуков (до 50, новые первыми). `GET /v1/sandbox/webhooks`
     * Подписанный GET без тела (подписывается пустая строка).
     */
    listWebhooks(): Promise<SandboxDelivery[]>;
    /** Перепоставить одну доставку в очередь. `POST /v1/sandbox/webhooks/replay` */
    replayWebhook(deliveryId: string): Promise<SandboxReplayResult>;
}

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
declare class OblodaiClient {
    /** Приём платежей, настройки приёма, публичный чекаут `/v1/pay` (v1.2.0). */
    readonly payments: Payments;
    /** Выплаты и возвраты. */
    readonly payouts: Payouts;
    /** Статические кошельки. */
    readonly wallets: Wallets;
    /** Баланс, рефералы, переводы на личный кошелёк и пользователям платформы (v1.2.0), VRCS. */
    readonly account: Account;
    /** Управление вебхуками и тестовые события. */
    readonly webhooks: Webhooks;
    /** Автовывод и IP-allowlist. */
    readonly settings: Settings;
    /** Публичные курсы валют. */
    readonly rates: Rates;
    /** Статус массовых операций (v1.1.0). */
    readonly batches: Batches;
    /**
     * Платёжные ссылки (v1.1.0) — КАНОНИЧЕСКОЕ имя ресурса.
     *
     * Во всех SDK Oblodai ресурс называется `payment_links` в идиоматике своего языка
     * (`paymentLinks` в JS/TS и PHP, `payment_links` в Python и Rust, `PaymentLinks` в Go),
     * чтобы код переносился между языками без переименований.
     * Не путать с {@link payoutLinks} — это payout-ссылки, обратное направление денег.
     */
    readonly paymentLinks: Links;
    /**
     * Документированный синоним {@link paymentLinks} — ТОТ ЖЕ объект
     * (`client.links === client.paymentLinks`). Оставлен навсегда ради совместимости.
     */
    readonly links: Links;
    /** Сплит-платежи (v1.1.0). */
    readonly splits: Splits;
    /** Payout-ссылки — «крипто-чеки» (v1.1.0). */
    readonly payoutLinks: PayoutLinks;
    /** Песочница разработчика (v1.2.0) — только тестовые ключи, только тестовый код. */
    readonly sandbox: Sandbox;
    private readonly http;
    constructor(config: OblodaiConfig);
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
    static fromEnv(overrides?: Partial<Omit<OblodaiConfig, 'publicId' | 'secret'>>): OblodaiClient;
}

/**
 * Проверка входящих вебхуков.
 *
 * ВНИМАНИЕ: подпись вебхука — ДРУГОЙ алгоритм, чем подпись запроса. Здесь подписанная строка это
 * `{timestamp}.{сырое_тело}` (точка-разделитель, без метода и пути), а секрет — тот, что вернул
 * `POST /v1/webhooks` (не ключ API).
 *
 *   X-Webhook-Signature = hex(HMAC-SHA256(secret, "{X-Webhook-Timestamp}." + сырое_тело))
 */
/** Заголовки доставки вебхука, нужные для проверки. */
interface WebhookHeaders {
    /** X-Webhook-Timestamp — unix-секунды момента отправки. */
    timestamp: string;
    /** X-Webhook-Signature — hex-подпись. */
    signature: string;
}
interface VerifyWebhookOptions {
    /**
     * Максимальный возраст вебхука в секундах для replay-защиты. Если задан и timestamp старше —
     * проверка не пройдёт. По умолчанию 300 (5 минут). Передайте 0, чтобы отключить проверку свежести.
     */
    maxAgeSeconds?: number;
    /** Текущее время в мс (для тестов). По умолчанию Date.now(). */
    now?: number;
    /**
     * Опциональный логгер. Если не задан, применяется env-опция `OBLODAI_LOG` (см. {@link OblodaiLogger}).
     * Логируются только факт успеха и причина отказа — секрет, подпись и тело НЕ логируются.
     */
    logger?: OblodaiLogger;
}
/**
 * Проверяет подпись и свежесть вебхука. Возвращает `true` при успехе, иначе бросает
 * {@link OblodaiSignatureError}.
 *
 * ВАЖНО: `rawBody` должен быть СЫРЫМ телом запроса (строка или Buffer) — тем же, что пришло по сети.
 * Не передавайте пересериализованный JSON: подпись считается по байтам.
 *
 * Пробные тела (`"is_test": true`) НЕ подписаны — их этой функцией проверять не нужно.
 *
 * @param secret  секрет из POST /v1/webhooks
 * @param rawBody сырое тело запроса
 * @param headers заголовки timestamp/signature
 */
declare function verifyWebhook(secret: string, rawBody: string | Buffer, headers: WebhookHeaders, options?: VerifyWebhookOptions): true;
/**
 * Удобная обёртка: проверяет вебхук и возвращает распарсенное тело типа T. Бросает
 * {@link OblodaiSignatureError} при неверной подписи.
 */
declare function constructWebhookEvent<T = unknown>(secret: string, rawBody: string | Buffer, headers: WebhookHeaders, options?: VerifyWebhookOptions): T;

/**
 * Подпись запросов к API.
 *
 * Каноническая строка: `{timestamp}\n{METHOD}\n{path}\n{body}`, подписывается секретом по HMAC-SHA256,
 * результат — hex в нижнем регистре. Тело подписывается ровно теми байтами, что уходят в сеть —
 * поэтому SDK сериализует тело один раз и использует одну строку и для подписи, и для отправки.
 */
interface SignedRequest {
    /** Значение заголовка X-Timestamp (unix-секунды строкой). */
    timestamp: string;
    /** Значение заголовка X-Signature (hex). */
    signature: string;
    /** Тело запроса — ровно та строка, что подписана и должна быть отправлена. */
    body: string;
}
/**
 * Считает подпись запроса.
 *
 * @param secret   секрет ключа мерчанта
 * @param method   HTTP-метод в верхнем регистре (обычно "POST")
 * @param path     путь запроса с ведущим слэшем, например "/v1/payment"
 * @param body     сериализованное тело (строка). Будет подписано как есть.
 * @param timestamp опционально — фиксированный timestamp (для тестов); иначе текущее время
 */
declare function signRequest(secret: string, method: string, path: string, body: string, timestamp?: string): SignedRequest;

/**
 * Ошибки Oblodai SDK.
 *
 * Все ошибки API приходят в конверте `{ "error": { "code", "message" } }`, где `code` — машиночитаемый
 * идентификатор вида `<домен>.<причина>` (например `payout.insufficient_funds`). Ветвитесь в коде по
 * `.code`, а не по тексту `.message`.
 */
/** Базовая ошибка SDK. Все прочие ошибки наследуются от неё. */
declare class OblodaiError extends Error {
    constructor(message: string);
}
/**
 * Ошибка, вернувшаяся от API (конверт `error`). Несёт машиночитаемый `code`, человекочитаемый
 * `message` и HTTP-статус ответа.
 */
declare class OblodaiApiError extends OblodaiError {
    /** Машиночитаемый код вида `<домен>.<причина>`. Ветвитесь по нему. */
    readonly code: string;
    /** HTTP-статус ответа. */
    readonly status: number;
    /** Сырое тело ответа (для отладки). */
    readonly raw: unknown;
    /**
     * Рекомендованная сервером задержка перед повтором в мс (из заголовка `Retry-After`, если был).
     * Транспорт использует её вместо собственного backoff — например, на 429 сервер отдаёт `Retry-After: 60`.
     */
    readonly retryAfterMs?: number;
    constructor(code: string, message: string, status: number, raw: unknown, retryAfterMs?: number);
    /** Класс ошибки — временная ли она (стоит ли повторять с backoff). */
    get isRetriable(): boolean;
}
/** Сетевая ошибка (соединение не удалось, таймаут). Как правило, безопасно повторить с backoff. */
declare class OblodaiConnectionError extends OblodaiError {
    readonly cause?: unknown;
    constructor(message: string, cause?: unknown);
    get isRetriable(): boolean;
}
/** Таймаут запроса. Помните: таймаут не значит, что операция не прошла — см. рецепт устойчивого клиента. */
declare class OblodaiTimeoutError extends OblodaiConnectionError {
}
/** Ошибка проверки подписи вебхука (`verifyWebhook`). */
declare class OblodaiSignatureError extends OblodaiError {
}

export { type AcceptedMethod, type AutoWithdrawRule, type Balance, type BatchInfo, type BatchItem, type BatchOnError, type BatchOptions, type BatchStatus, type BatchSubmitResult, type BlockWalletParams, type BlockedRefundParams, type CalculatePayoutParams, type CreatePaymentLinkParams, type CreatePaymentParams, type CreatePayoutLinkParams, type CreatePayoutParams, type CreateSplitRuleParams, type CreateWalletParams, type Currency, type CurrencyNetwork, type Delivery, type Envelope, type ErrorEnvelope, type ExchangeRate, type HistoryParams, type LinkCheckoutParams, type Lookup, type MassPayoutItem, type Network, OblodaiApiError, OblodaiClient, type OblodaiConfig, OblodaiConnectionError, OblodaiError, type OblodaiLogger, OblodaiSignatureError, OblodaiTimeoutError, type Paginate, type PaySelectParams, type Payment, type PaymentLink, type PaymentLinkAmountMode, type PaymentLinkCreated, type PaymentLinkInfo, type PaymentList, type PaymentRefundEntry, type PaymentStatus, type Payout, type PayoutCalculation, type PayoutLink, type PayoutLinkBatchItem, type PayoutLinkBatchResult, type PayoutLinkClaimInfo, type PayoutLinkClaimResult, type PayoutLinkCreated, type PayoutLinkStatus, type PayoutStatus, type PublicPayment, type ReferralInfo, type RefundBatchItem, type RefundParams, type ResolveParams, type ResolveResult, type RetryOptions, type SandboxDelivery, type SandboxDeposit, type SandboxDepositParams, type SandboxFaucetParams, type SandboxFaucetResult, type SandboxReplayResult, type SandboxResetResult, type SendEmailParams, type SendEmailResult, type ServiceMethod, type SignedRequest, type SplitConfig, type SplitRule, type TransferToUserItem, type TransferToUserParams, type TransferToUserResult, type VerifyWebhookOptions, type Wallet, type WebhookEvent, type WebhookHeaders, type WebhookRegistration, constructWebhookEvent, isTestKey, signRequest, verifyWebhook };
