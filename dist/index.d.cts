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
/** Статусы платежа (`payment_status`). */
type PaymentStatus = 'check' | 'confirm_check' | 'wrong_amount_waiting' | 'paid' | 'paid_over' | 'wrong_amount' | 'cancel';
/** Укрупнённый (Heleket-совместимый) статус выплаты в ответах API. */
type PayoutStatus = 'check' | 'process' | 'paid' | 'fail' | 'cancel';
/** Коды сетей, поддерживаемые каталогом. */
type Network = 'ethereum' | 'bsc' | 'polygon' | 'avalanche' | 'base' | 'arbitrum' | 'tron' | 'solana' | 'ton' | 'bitcoin';
/** Конфигурация клиента. */
interface OblodaiConfig {
    /** `public_id` — несекретный идентификатор ключа. */
    publicId: string;
    /** `secret` — секрет для подписи запросов. Только на сервере. */
    secret: string;
    /**
     * Базовый URL API. По умолчанию `https://api.oblodai.example` (плейсхолдер из документации —
     * укажите реальный).
     */
    baseUrl?: string;
    /** Таймаут запроса в миллисекундах. По умолчанию 30000. */
    timeoutMs?: number;
    /** Настройки автоматических повторов. `false` — отключить. */
    retry?: RetryOptions | false;
    /** Кастомная реализация fetch (по умолчанию глобальный `fetch`). */
    fetch?: typeof fetch;
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
    constructor(config: OblodaiConfig);
    /**
     * Выполняет подписанный POST-запрос к `path` с телом `payload`. Возвращает поле `result` из
     * конверта. Публичные (неподписанные) вызовы используют {@link requestPublic}.
     */
    request<T>(path: string, payload?: unknown): Promise<T>;
    /** Выполняет запрос БЕЗ подписи (для публичных эндпоинтов). */
    requestPublic<T>(path: string, payload?: unknown, method?: 'GET' | 'POST'): Promise<T>;
    private execute;
    private once;
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
    payment_status: PaymentStatus;
    is_multi: boolean;
    url: string;
    expired_at: number;
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
    address: string;
    uuid?: string;
    order_id?: string;
    network?: string;
    amount?: string;
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
    endpoint_id: string;
    url: string;
    /** Секрет для проверки подписи вебхуков. Показывается один раз. */
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

/** Методы приёма платежей. */
declare class Payments extends BaseResource {
    /** Создать платёжный счёт (инвойс). `POST /v1/payment` */
    create(params: CreatePaymentParams): Promise<Payment>;
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
    /** Возврат средств платежа. `POST /v1/payment/refund` (см. также client.payouts.refund) */
    refund(params: {
        address: string;
        uuid?: string;
        order_id?: string;
        network?: string;
        amount?: string;
    }): Promise<unknown>;
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
    /** Создать выплату на внешний адрес. `POST /v1/payout` */
    create(params: CreatePayoutParams): Promise<Payout>;
    /** Массовая выплата (до 100). `POST /v1/payout/mass` */
    createMass(payouts: CreatePayoutParams[], source?: string): Promise<{
        items: MassPayoutItem[];
    }>;
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
    /** Подтвердить выплату в статусе pending (для API-ключа обычно не нужно). `POST /v1/payout/approve` */
    approve(uuid: string): Promise<unknown>;
    /** Возврат средств платежа (движок выплат). `POST /v1/payment/refund` */
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
    /** Вернуть средства с (заблокированного) кошелька на адрес. `POST /v1/wallet/blocked-address-refund` */
    blockedAddressRefund(params: BlockedRefundParams): Promise<unknown>;
    /** QR-код произвольного адреса (data:-URI). `POST /v1/wallet/qr` */
    qr(address: string): Promise<{
        image: string;
    }>;
}

/** Баланс, рефералы, перевод на личный кошелёк, VRCS. */
declare class Account extends BaseResource {
    /** Доступные балансы мерчанта. `POST /v1/balance` */
    balance(): Promise<Balance>;
    /** Реферальная статистика. `POST /v1/referral/info` */
    referral(): Promise<ReferralInfo>;
    /** Перевод средств на личный кошелёк владельца. `POST /v1/transfer/to-personal` */
    transferToPersonal(params: {
        amount: string;
        currency: string;
        order_id?: string;
    }): Promise<{
        currency: string;
        amount: string;
        direction: string;
        personal_balance: string;
    }>;
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
     * Зарегистрировать (заменить) URL для вебхуков и получить секрет. `POST /v1/webhooks`
     * Внимание: возвращает объект БЕЗ конверта state/result; повторный вызов выдаёт новый секрет.
     */
    register(url: string): Promise<WebhookRegistration>;
    /** Журнал последних доставок (до 50). `POST /v1/webhooks/deliveries` */
    deliveries(): Promise<{
        deliveries: Delivery[];
    }>;
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
 * Клиент Oblodai API.
 *
 * ```ts
 * const client = new OblodaiClient({
 *   publicId: process.env.OBLODAI_PUBLIC_ID!,
 *   secret: process.env.OBLODAI_SECRET!,
 *   baseUrl: 'https://api.oblodai.example', // укажите реальный
 * });
 *
 * const payment = await client.payments.create({
 *   amount: '10', currency: 'USD', order_id: 'order-1',
 *   to_currency: 'USDT', network: 'tron',
 * });
 * ```
 */
declare class OblodaiClient {
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

export { type AcceptedMethod, type AutoWithdrawRule, type Balance, type BlockWalletParams, type BlockedRefundParams, type CalculatePayoutParams, type CreatePaymentParams, type CreatePayoutParams, type CreateWalletParams, type Currency, type CurrencyNetwork, type Delivery, type Envelope, type ErrorEnvelope, type ExchangeRate, type HistoryParams, type Lookup, type MassPayoutItem, type Network, OblodaiApiError, OblodaiClient, type OblodaiConfig, OblodaiConnectionError, OblodaiError, OblodaiSignatureError, OblodaiTimeoutError, type Paginate, type Payment, type PaymentList, type PaymentStatus, type Payout, type PayoutCalculation, type PayoutStatus, type ReferralInfo, type RefundParams, type RetryOptions, type ServiceMethod, type SignedRequest, type VerifyWebhookOptions, type Wallet, type WebhookEvent, type WebhookHeaders, type WebhookRegistration, constructWebhookEvent, signRequest, verifyWebhook };
