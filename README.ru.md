<div align="center">

<a href="https://oblodai.com">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/oblodai/.github/main/brand/logo-white.svg">
    <img src="https://raw.githubusercontent.com/oblodai/.github/main/brand/logo-black.svg" alt="oblodai" height="52">
  </picture>
</a>

<h3>Официальный TypeScript / Node.js SDK платёжного шлюза <a href="https://oblodai.com">oblodai</a></h3>

Платежи, выплаты, платёжные ссылки, сплиты, статические кошельки, вебхуки — один API-ключ.

<a href="https://www.npmjs.com/package/@oblodai-npm/sdk"><img src="https://img.shields.io/npm/v/%40oblodai-npm%2Fsdk?style=flat-square&color=CB3837&label=npm" alt="npm"></a>
<a href="https://github.com/oblodai/oblodai-node/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/oblodai/oblodai-node/ci.yml?branch=main&style=flat-square&label=CI" alt="CI"></a>
<img src="https://img.shields.io/badge/types-TypeScript-3178C6?style=flat-square" alt="TypeScript">
<a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-000000?style=flat-square" alt="License: MIT"></a>

[Документация](https://docs.oblodai.com) · [Кабинет](https://my.oblodai.com) · [Read in English →](README.md)

</div>

---

Официальный TypeScript / Node.js SDK платёжного шлюза **Oblodai**: приём платежей, выплаты,
массовые операции (батчи), платёжные ссылки, выплатные ссылки (крипточеки), сплиты, статические
кошельки, переводы, вебхуки. Подпись запросов, разбор ответов, типизированные ошибки,
идемпотентность и повторы — из коробки.

Node.js ≥ 20, ESM и CommonJS в одном пакете, без runtime-зависимостей. Ресурсы, модели и таблица
маршрутов сгенерированы из OpenAPI-контракта самого шлюза: у каждого его маршрута (их 120) здесь
есть метод, у каждого запроса и ответа — тип.

> **Base URL.** По умолчанию `https://api.oblodai.com`. При необходимости задайте свой `baseUrl` и
> ключи при инициализации. Схема должна быть `https://`; обычный `http://` допускается только для
> loopback (`http://127.0.0.1:8095`) или с явной опцией `allowInsecureBaseUrl`.

## Установка

```bash
npm install @oblodai-npm/sdk
```

Node.js 20 или новее (SDK использует глобальный `fetch` рантайма). В пакете — сборка ESM, сборка
CommonJS и объявления типов для обеих. Проверка вебхуков живёт в подпути `@oblodai-npm/sdk/webhooks`
и не требует ни клиента, ни API-ключа.

Пишете код с ИИ-агентом? Дайте ему [AGENTS.md](AGENTS.md) — он входит в пакет. Переходите с 1.x?
[MIGRATION-2.0.md](MIGRATION-2.0.md) сопоставляет каждое старое имя метода новому.

## Где взять ключи

Ключи выдаются в кабинете [my.oblodai.com](https://my.oblodai.com) → **API-ключи**. Секрет
показывается один раз, при создании. Боевая пара — публичный id `oblodai_<hex>` и секрет
`oblodai_live_<hex>`; песочная — `test_oblodai_<hex>` и `oblodai_test_<hex>`.

**Один API-ключ подписывает всё.** У мерчанта один ключ, и он аутентифицирует каждый подписанный
маршрут — приём и выплаты, настройки, документы, песочницу. Отдельного ключа для выплат нет.

| Учётные данные         | Задаётся как                                                  | Для чего                                                     |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------------------------------ |
| API-ключ               | `publicId` / `secret` (`OBLODAI_PUBLIC_ID`, `OBLODAI_SECRET`) | каждый подписанный маршрут                                   |
| Песочный API-ключ      | то же, пара `test_oblodai_<hex>`                              | та же поверхность на копии шлюза без блокчейна               |
| Админ-токен онбординга | `adminToken` (`OBLODAI_ADMIN_TOKEN`)                          | `sandbox.onboardStore` на self-hosted шлюзе, и больше ничего |

```ts
import { Oblodai } from "@oblodai-npm/sdk";

const oblodai = new Oblodai({
  publicId: process.env.OBLODAI_PUBLIC_ID,
  secret: process.env.OBLODAI_SECRET,
});
console.log(oblodai.transport.baseUrl);
```

Маршруты для плательщика не требуют ключей вовсе: все методы `checkout.*`,
`account.listExchangeRates`, `payoutLinks.getPayoutClaim` / `claimPayout` и `documents.getSigned`
(заранее подписанная ссылка).

## Быстрый старт

Примите платёж. Суммы — десятичные **строки**, никогда не числа с плавающей точкой.

```ts
import { Oblodai } from "@oblodai-npm/sdk";

const oblodai = new Oblodai(); // OBLODAI_PUBLIC_ID / OBLODAI_SECRET from the environment

const invoice = await oblodai.payments.create({
  amount: "25", // what you charge
  currency: "USDT", // a fiat (USD, EUR, …) or a crypto asset
  network: "tron", // omit to let the payer choose the network on the pay page
  order_id: "order-1001", // your reference; idempotent per order_id
  url_callback: "https://shop.example/oblodai/webhook",
});
console.log(invoice.url, invoice.address, invoice.status); // "created"
```

Чтобы выставлять цену в фиате, а получать крипту, передайте оба поля: `{ amount: "25", currency:
"USD", to_currency: "USDT" }` — `currency` то, что вы берёте, `to_currency` актив, который пришлёт
плательщик.

Отправьте выплату. Сначала проверка (бесплатно, без побочных эффектов), затем создание со своим
ключом идемпотентности.

```ts
import { Oblodai, type PayoutRequest } from "@oblodai-npm/sdk";

const oblodai = new Oblodai(); // the same key that took the payment sends the payout

const params: PayoutRequest = {
  amount: "10",
  currency: "USDT",
  network: "tron",
  address: "TQrY8bkbpXKPt2LZbU8jqfnpFbUSF15sbx",
  order_id: "payout-42",
};
const check = await oblodai.payouts.validate(params);
console.log("will debit", check.payer_amount, "commission", check.commission);

const payout = await oblodai.payouts.create(params, { idempotencyKey: "payout-42" });
console.log(payout.uuid, payout.status);
```

Больше программ целиком — в [`examples/`](examples); запуск: `npx tsx examples/sandbox.ts`.

### Запросы и ответы типизированы

Каждый метод — `client.<ресурс>.<метод>(params, options)`. `params` — тело запроса объектом с
именами полей как на проводе (`snake_case`); его тип (`PaymentRequest`, `PayoutRequest`, …)
сгенерирован из контракта, поэтому редактор дополняет поля, а `tsc` ловит опечатку или число в сумме
до того, как запрос уйдёт. Параметры пути идут первыми (`checkout.get(id)`), параметры строки
запроса — внутри `params`.

Результаты — JSON-объекты как пришли, типизированные сгенерированными интерфейсами. Поле новее этого
SDK остаётся в объекте; значение enum новее него — обычная строка (`OpenEnum<T>`); ни то ни другое не
ошибка. Значения enum экспортируются и константами: `PaymentStatus.PAID === "paid"`.

### Опции вызова

Последний аргумент любого метода — `RequestOptions`:

| Опция            | Смысл                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------- |
| `idempotencyKey` | свой ключ; на маршрутах, которые шлюз дедуплицирует, генерируется автоматически               |
| `timeout`        | секунды на одну попытку (весь вызов по-прежнему ограничен `deadline` клиента)                 |
| `maxRetries`     | число повторов после первой попытки, для этого вызова                                         |
| `extraHeaders`   | заголовки этого вызова поверх `headers` клиента                                               |
| `requestId`      | уходит как `X-Request-ID`; без него генерируется UUID — один и тот же на всех повторах вызова |
| `signal`         | `AbortSignal`, отменяющий вызов и паузу перед повтором                                        |

```ts
import { Oblodai } from "@oblodai-npm/sdk";

const oblodai = new Oblodai();

const balance = await oblodai.account.getBalance({
  timeout: 5, // seconds
  maxRetries: 0,
  requestId: "checkout-7f3a", // find this call in our logs by your own id
  extraHeaders: { "X-Tenant": "eu-1" },
});
console.log(balance.balance.merchant);

// A client (or a resource) that starts every call from other defaults:
const impatient = oblodai.withOptions({ timeout: 3, maxRetries: 1 });
await impatient.payments.getInfo({ order_id: "order-1001" });
```

### Суммы

Суммы — десятичные строки в масштабе самого актива. Число — ошибка типов, а дробное число, всё же
пришедшее из JavaScript, отклоняется до отправки (`ConfigError`, `sdk.float_amount`). Для арифметики —
точные хелперы:

```ts
import { addAmounts, amountEquals, compareAmounts, isValidAmount } from "@oblodai-npm/sdk";

console.log(addAmounts("10.000000", "0.5")); // "10.500000"
console.log(compareAmounts("9", "10")); // -1 — never compare amounts with < or sort()
console.log(amountEquals("25", "25.000000")); // true
console.log(isValidAmount("1e3")); // false
```

Для строк `"9" < "10"` — `false`: никогда не упорядочивайте суммы через `<`, `sort()` или `Math.max`.
Всё, что не `-?цифры[.цифры]` (≤ 64 символов), — `ConfigError` с кодом `sdk.bad_amount`.

## Песочница / тестирование

Песочный ключ работает с копией шлюза без блокчейна: баланс из крана, имитация поступлений, настоящие
подписанные вебхуки. Интегрируйтесь сначала с ней — поверхность API та же, поэтому при переходе на
боевые ключи ничего не меняется.

```ts
import { Oblodai } from "@oblodai-npm/sdk";

const oblodai = new Oblodai(); // a test_oblodai_… key pair in the environment

await oblodai.sandbox.faucet({ asset: "USDT", amount: "1000" });
const invoice = await oblodai.payments.create({
  amount: "25",
  currency: "USDT",
  network: "tron",
  order_id: `sbx-${Date.now()}`,
});
await oblodai.sandbox.simulateDeposit({
  invoice_id: invoice.uuid,
  amount: "25",
  confirmations: 20,
  txid: `sbx-tx-${Date.now()}`,
});
console.log((await oblodai.payments.getInfo({ uuid: invoice.uuid })).status); // "paid"

for await (const delivery of oblodai.sandbox.listWebhooks({ limit: 20 })) {
  console.log(delivery.event_type, delivery.status);
}
await oblodai.sandbox.reset(); // cancel open invoices, zero the balances
```

- `sandbox.simulateDeposit` зачисляет на счёт; повтор с тем же `txid` добавляет подтверждения.
- `sandbox.listWebhooks` — журнал доставок с телами; `sandbox.replayWebhook({ delivery_id })`
  повторяет завершённую (доставленную или мёртвую) доставку.
- `webhooks.sendTestPayment` / `sendTestPayout` / `sendTestWallet` / `sendTestConversion` —
  репетиция доставки на ваш адрес. Репетиции подписаны как настоящие и несут `test: true` —
  проверяйте `isTest` и никогда не двигайте по ним деньги.

## Обзор методов

Шестнадцать ресурсов, 120 маршрутов — у каждого маршрута шлюза здесь есть метод.

| Ресурс         | Методы                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payments`     | create · getInfo · getQr · listHistory · listServices · cancel · sendEmail · setCheckoutConfig · getCheckoutConfig · getAmlLinks · resolve                                                                                                                                                                                                                                                                     |
| `paymentLinks` | create · list · get · toggle                                                                                                                                                                                                                                                                                                                                                                                   |
| `refunds`      | payment · blockedWallet                                                                                                                                                                                                                                                                                                                                                                                        |
| `payouts`      | create · createMass · getInfo · listHistory · calculate · validate · cancel · approve · listServices · transferToPersonal · transferToUser · createTransferBatch                                                                                                                                                                                                                                               |
| `payoutLinks`  | create · createBatch · list · get · cancel · getPayoutClaim · claimPayout                                                                                                                                                                                                                                                                                                                                      |
| `batches`      | createPayment · createRefund · createPayout · getInfo                                                                                                                                                                                                                                                                                                                                                          |
| `splits`       | createRule · listRules · deleteRule · setConfig · getConfig · setRecipientOptIn · getRecipientOptIn                                                                                                                                                                                                                                                                                                            |
| `wallets`      | create · block · getQr                                                                                                                                                                                                                                                                                                                                                                                         |
| `account`      | getBalance · getSummary · listExchangeRates                                                                                                                                                                                                                                                                                                                                                                    |
| `webhooks`     | resendPayment · register · listDeliveries · requeueDelivery · sendLegacyTest · sendTestPayment · sendTestWallet · sendTestPayout · sendTestConversion · rotateSecret · setActive                                                                                                                                                                                                                               |
| `settings`     | setAccuracy · getAccuracy · setAutoRefund · getAutoRefund · setDiscount · listDiscounts · listApiLog · getAutoConvert · setAutoConvert · setAcceptedCurrencies · listAcceptedCurrencies · setPayoutFeeConfig · getPayoutFeeConfig · setRefundFeeConfig · getRefundFeeConfig · setPaymentFeeConfig · getPaymentFeeConfig · setAutoWithdrawRule · listAutoWithdrawRules · deleteAutoWithdrawRule · configureVrcs |
| `apiAllowlist` | list · addEntry · removeEntry · setEnabled                                                                                                                                                                                                                                                                                                                                                                     |
| `referrals`    | getInfo                                                                                                                                                                                                                                                                                                                                                                                                        |
| `documents`    | getSigned · getBalance · getFees · getLedger · getSplit · getPayoutLinkCheque · getStatement · getBatch · getPaymentLink · getWalletStatement · getReferrals · createJob · getJob · downloadJobFile                                                                                                                                                                                                            |
| `checkout`     | getSourceOfFundsForm · submitSourceOfFunds · getPublicPaymentLink · paymentLink · listCurrencies · get · selectMethod · startOnramp · getOnramp · getQr                                                                                                                                                                                                                                                        |
| `sandbox`      | onboardStore · faucet · simulateDeposit · reset · listWebhooks · replayWebhook                                                                                                                                                                                                                                                                                                                                 |

Имена подчиняются одному правилу: OpenAPI `operationId` без имени ресурса, в camelCase
(`createPayoutBatch` → `batches.createPayout`). Они зафиксированы в [`names.lock`](names.lock);
переименование — ломающее изменение и роняет сборку SDK.

- Синхронные массовые вызовы ограничены — `payouts.createMass` до 100 элементов,
  `payoutLinks.createBatch` до 500 — и отчитываются по каждому элементу отдельно, так что в ответе 200
  могут быть неудачи. Асинхронные пачки (`batches.*`, `payouts.createTransferBatch`) принимают до
  5000 элементов, и их можно дождаться (ниже).
- Методы документов возвращают `FileResult` — `{ content, contentType, filename }`.

### Списки

Метод-список возвращает `Page` — ленивый, асинхронно итерируемый и ожидаемый (`await`). Ничего не
запрашивается, пока его не начнут читать, и первая страница запрашивается один раз, как бы её ни
читали.

```ts
import { Oblodai } from "@oblodai-npm/sdk";

const oblodai = new Oblodai();

// one page: { items, paginate: { total, per_page, offset, has_pages } }
const page = await oblodai.payments.listHistory({ limit: 50 });
console.log(page.items.length, page.total);

// every item, page after page
for await (const payout of oblodai.payouts.listHistory({ status: "confirmed" })) {
  console.log(payout.uuid);
}

// page by page
for await (const p of oblodai.payments.listHistory({ limit: 100 }).byPage()) {
  console.log(p.offset, p.items.length);
}

// up to N items as an array
const refunds = await oblodai.payouts.listHistory({ kind: "refund" }).all(1000);
console.log(refunds.length);
```

### Долгие операции

Пачки и фоновые выгрузки документов отвечают сразу, а завершаются позже. Их ответ несёт ожидатель:
`wait()` опрашивает статус, пока он не станет конечным, и возвращает последний статус (задача со
статусом `failed` тоже возвращается — разберите её); выгрузка документа затем отдаёт файл через
`download()`.

```ts
import { Oblodai } from "@oblodai-npm/sdk";

const oblodai = new Oblodai();

const batch = await oblodai.batches.createPayout({
  on_error: "continue",
  payouts: [
    {
      amount: "5",
      currency: "USDT",
      network: "tron",
      address: "TQrY8bkbpXKPt2LZbU8jqfnpFbUSF15sbx",
      order_id: "bonus-1",
    },
  ],
});
const info = await batch.wait({ timeout: 300, interval: 2 }); // seconds
console.log(info.status, info.succeeded, info.failed);

const job = await oblodai.documents.createJob({ kind: "statement", format: "pdf", lang: "en" });
const done = await job.wait();
if (done.status === "done") {
  const file = await job.download();
  console.log(file.filename, file.content.length);
}
```

### Статусы

- Платёж: `select → created → confirm_check → paid | paid_over | wrong_amount | expired | cancelled`.
  `isPaymentPaid(status)` истинно для `paid`/`paid_over`; `wrong_amount` (недоплата) ждёт
  `payments.resolve({ uuid, action: "accept" | "refund" })`; `isPaymentFinal` покрывает остальное.
- Выплата: `pending → approved → awaiting_cosign → broadcasting → sent → confirmed | failed | cancelled`,
  с `isPayoutFinal` и `isPayoutSucceeded`.

Изменения состояния лучше получать вебхуками; опрос `getInfo` — только запасной путь.

## Вебхуки

Зарегистрируйте адрес через `webhooks.register({ url })`, затем проверяйте каждую доставку по
**сырому** телу, до разбора:

```ts
import { createServer } from "node:http";
import { SignatureError, isKnownEvent, verifyWebhookDelivery } from "@oblodai-npm/sdk/webhooks";

const paidOrders = new Set<string>();

export const server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    try {
      const { event, isTest } = verifyWebhookDelivery(Buffer.concat(chunks), req.headers, {
        secret: process.env.OBLODAI_WEBHOOK_SECRET ?? "",
        previousSecret: process.env.OBLODAI_WEBHOOK_SECRET_PREV || undefined, // during rotation
      });
      // A rehearsal never moves money; a type from a newer gateway is acknowledged and skipped.
      if (!isTest && isKnownEvent(event) && event.type === "payment" && event.status === "paid") {
        paidOrders.add(event.order_id ?? event.uuid);
      }
      res.writeHead(200).end();
    } catch (err) {
      res.writeHead(err instanceof SignatureError ? 401 : 500).end();
    }
  });
});
// server.listen(3000);
```

Проверки идут в фиксированном порядке — заголовки, затем HMAC (текущий секрет, затем
`previousSecret`), затем свежесть, затем тело, — поэтому окно свежести никогда не служит оракулом
для неаутентифицированного отправителя. Пустой `secret` — `ConfigError`, а не проверка пустым
ключом. `toleranceSec` по умолчанию 300, `0` отключает проверку свежести.

- **Дедуплицируйте по `id`** (`X-Webhook-Id`): он стабилен между повторами самого шлюза.
- **Упорядочивайте по `event.sequence`**: `isStaleEvent(event, lastSequence)`.
- **Репетиции** подписаны как боевые и несут `test: true` (и `X-Webhook-Test: true`);
  `verifyWebhookDelivery(...).isTest` об этом сообщает.
- **Незнакомые типы событий** от более нового шлюза возвращаются как есть (`UnknownWebhookEvent`), а
  не бросаются — вызывайте `isKnownEvent(event)` перед `switch` по `type`.
- **Ротация**: после `webhooks.rotateSecret()` продолжайте передавать `previousSecret` не меньше
  26 часов.

`SignatureError` (`webhook.bad_signature`, `webhook.stale_timestamp`, `webhook.missing_header`) —
поддельная или повторённая доставка: отвечайте 4xx. `WebhookPayloadError` (`webhook.bad_payload`) —
**подлинная** доставка, тело которой не удалось прочитать: отвечайте 5xx, чтобы шлюз повторил её.

## Ошибки

Любой сбой — `OblodaiError` с конвертом ошибки API: `code` (`payout.insufficient_funds`),
`httpStatus`, `retryable`, `retryAfter`, `requestId`, `field`. `String(err)` читается как
`[код] текст (request_id=…)` — той же строкой начинается стек непойманной ошибки, так что одной
строки лога достаточно, чтобы найти вызов на нашей стороне.

| Класс                                        | HTTP       | Когда                                                                                             |
| -------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------- |
| `ValidationError`                            | 400        | Запрос некорректен; `field` называет поле                                                         |
| `AuthenticationError`                        | 401        | Неверная подпись, неизвестный публичный id, сбитые часы                                           |
| `PermissionError`                            | 403        | Ключ верен, но это действие ему не разрешено                                                      |
| `NotFoundError`                              | 404        | Объекта нет                                                                                       |
| `ConflictError` / `IdempotencyConflictError` | 409        | Конфликт состояния; второй — повтор ключа идемпотентности с другим телом                          |
| `RateLimitError`                             | 429        | Ограничение частоты; задан `retryAfter`                                                           |
| `UnavailableError`                           | 503        | Шлюз временно недоступен; можно повторить                                                         |
| `InternalError`                              | прочие 5xx | Сбой шлюза                                                                                        |
| `TransportError`                             | —          | Ответа нет вовсе: DNS, TCP, TLS, таймаут, отмена, дедлайн                                         |
| `ConfigError`                                | —          | Отклонено до отправки: неверные опции, float в сумме, заголовок или ключ, которые SDK не отправит |
| `ContractError`                              | —          | Ответ — не документированный конверт или слишком велик                                            |
| `SignatureError` / `WebhookPayloadError`     | —          | Проверка вебхука (см. выше)                                                                       |

Ветвитесь по `code`, а не по тексту. Каждый код, который документирует шлюз, экспортирован как
`ErrorCode`:

```ts
import { Oblodai, OblodaiError, type PayoutRequest } from "@oblodai-npm/sdk";

const oblodai = new Oblodai();
const retryLater: number[] = [];

export async function sendPayout(params: PayoutRequest): Promise<void> {
  try {
    await oblodai.payouts.create(params);
  } catch (err) {
    if (!(err instanceof OblodaiError)) throw err;
    switch (err.code) {
      case "payout.insufficient_funds": // the balance may still arrive
      case "payout.funds_maturing":
        retryLater.push(err.retryAfter ?? 60);
        return;
      default:
        console.error(String(err)); // [code] message (request_id=…)
        throw err; // the SDK already retried what was safe to retry
    }
  }
}

await sendPayout({
  amount: "10",
  currency: "USDT",
  network: "tron",
  address: "TQrY8bkbpXKPt2LZbU8jqfnpFbUSF15sbx",
  order_id: "payout-43",
});
```

`retryable` авторитетен — SDK уже повторил то, что было безопасно повторять. `err.synthetic` истинно,
когда ответ пришёл без конверта шлюза (ответил прокси или балансировщик). `JSON.stringify(err)`
сохраняет `message` и отбрасывает сырое тело.

## Повторы, идемпотентность и таймауты

- **Что безопасно повторять — не догадка.** Флаг `safe` каждого маршрута (`ROUTES.<operationId>.safe`)
  берётся из контракта шлюза (`x-retry-safe`); SDK никогда не выводит его из пути или метода HTTP.
- Ошибка повторяется, только если API говорит `retryable: true`. Ответы без конверта API (502/503
  прокси) и сбои транспорта повторяются только на безопасных маршрутах или на записях с ключом —
  запись, которую шлюз не дедуплицирует, не отправляется повторно, раз она могла до него дойти.
- `Retry-After` всегда важнее вычисленной паузы; иначе — экспоненциальная пауза с полным джиттером.
  По умолчанию: `maxRetries: 2`, `baseDelayMs: 250`, `maxDelayMs: 4000`, `maxRetryAfterMs: 30000`.
- **Ключи идемпотентности автоматические** на маршрутах, которые шлюз дедуплицирует: один ключ на
  логический вызов, тот же на каждом повторе, так что таймаут не превратится во вторую выплату.
  Передайте свой `idempotencyKey`, чтобы повторы были безопасны и между перезапусками процесса. На
  маршруте без дедупликации ключ отклоняется сразу (`sdk.idempotency_unsupported`), а не теряется.
- **Таймауты — в секундах**: `timeout` ограничивает одну попытку (по умолчанию 30), `deadline` — весь
  вызов с повторами и паузами (по умолчанию 90).
- **Сбитые часы исправляются один раз** по заголовку `Date` ответа при ошибке подписи.
- **Редиректы никогда не выполняются**, а тела ограничены при чтении (8 МиБ JSON, 64 МиБ файлы).

### Сырые ответы и хуки

```ts
import { Oblodai } from "@oblodai-npm/sdk";

const oblodai = new Oblodai({
  hooks: {
    onRequest: (r) => console.log("→", r.method, r.url, "attempt", r.attempt, r.requestId),
    onResponse: (r) => console.log("←", r.status, `${r.elapsed.toFixed(3)} s`),
  },
});

const raw = await oblodai.payments.withRawResponse.getInfo({ uuid: "5d6f3a52" });
console.log(raw.status, raw.requestId, raw.header("content-type"));
const payment = raw.parse(); // what getInfo() returns
console.log(payment.status);
```

Хуки видят каждую попытку (подпись и админ-токен скрыты), с `X-Request-ID` вызова и `operationId`
маршрута — достаточно для метрик и трассировки без зависимостей.

## Настройка

```ts
import { Oblodai, consoleLogger } from "@oblodai-npm/sdk";

const oblodai = new Oblodai({
  baseUrl: "https://api.oblodai.com",
  timeout: 30, // seconds per attempt
  deadline: 90, // seconds for the whole call, retries included
  retry: { maxRetries: 2 },
  headers: { "X-Tenant": "eu-1" },
  logger: consoleLogger("info"),
});
console.log(JSON.stringify(oblodai)); // redacted: the secret never prints
```

| Опция                  | По умолчанию                           | Смысл                                                                |
| ---------------------- | -------------------------------------- | -------------------------------------------------------------------- |
| `publicId` / `secret`  | `OBLODAI_PUBLIC_ID` / `OBLODAI_SECRET` | Единственный API-ключ мерчанта; оба или ни одного                    |
| `baseUrl`              | `https://api.oblodai.com`              | Адрес API; префикс пути сохраняется                                  |
| `allowInsecureBaseUrl` | `false`                                | Разрешить обычный `http://` не на loopback                           |
| `adminToken`           | `OBLODAI_ADMIN_TOKEN`                  | Токен онбординга self-hosted шлюза; только `sandbox.onboardStore`    |
| `timeout`              | `30`                                   | Таймаут одной попытки, секунды                                       |
| `deadline`             | `90`                                   | Бюджет всего вызова с повторами, секунды                             |
| `retry`                | см. выше                               | `{ maxRetries, baseDelayMs, maxDelayMs, maxRetryAfterMs }`           |
| `headers`              | —                                      | Дополнительные заголовки каждого запроса                             |
| `hooks`                | —                                      | `{ onRequest, onResponse }`, по разу на попытку                      |
| `logger`               | `OBLODAI_LOG`                          | Структурный логгер; есть `consoleLogger(level)`                      |
| `fetch`                | глобальный `fetch`                     | Свой fetch — undici с прокси-агентом, записывающая заглушка в тестах |

| Переменная окружения     | Смысл                                                               |
| ------------------------ | ------------------------------------------------------------------- |
| `OBLODAI_PUBLIC_ID`      | Публичный id API-ключа мерчанта (боевого или песочного)             |
| `OBLODAI_SECRET`         | Его секрет                                                          |
| `OBLODAI_ADMIN_TOKEN`    | Админ-токен онбординга self-hosted шлюза                            |
| `OBLODAI_BASE_URL`       | Адрес API                                                           |
| `OBLODAI_LOG`            | `debug` \| `info` \| `warn` \| `error` — включает консольный логгер |
| `OBLODAI_ALLOW_INSECURE` | `1` разрешает обычный `http://` не на loopback                      |

Заголовки, которыми владеет SDK (`Accept`, `Content-Type`, `User-Agent`, `X-Public-Id`,
`X-Signature`, `X-Timestamp`, `Idempotency-Key`, `X-Admin-Token`), всегда важнее ваших; значение
заголовка с CR/LF или не-ASCII символом — `ConfigError`.

**Секреты не печатаются.** Клиент, его транспорт и каждый результат с секретом — `secret` вебхука,
только что выпущенный API-ключ, `claim_token`/`claim_url`/`passcode` выплатной ссылки — выводятся как
`[redacted]` в `JSON.stringify` и `console.log`/`util.inspect` на любой глубине, а сами значения
остаются доступны как свойства.

## Разработка

Код в `src/generated/` генерирует `tools/sdkgen` из OpenAPI-контракта шлюза в репозитории бэкенда
(`make sdk` там) — руками его не правят. Runtime вокруг него (`src/core`, `src/resources/base.ts`,
`src/lro.ts`, `src/webhooks.ts`) написан руками.

```bash
npm install
make ci             # format, drift, types, tests, conformance, build, package
npm test            # unit, conformance and documentation tests
make drift          # fail when src/generated is stale (OBLODAI_BACKEND=<backend checkout>)

# the live tier: runs the full journey against a real gateway
OBLODAI_LIVE_URL=http://localhost:8095 npm run test:live
```

`make ci` берёт checkout бэкенда из `OBLODAI_BACKEND` (иначе `../oblodai-backend`) для проверки
дрейфа и общего набора сценариев conformance (`tools/sdkgen/conformance`); каждый блок TypeScript
этого README и каждая программа в `examples/` исполняются в тестах на подставном шлюзе.

Дальше: [AGENTS.md](AGENTS.md), [CHANGELOG.md](CHANGELOG.md), [MIGRATION-2.0.md](MIGRATION-2.0.md).

## Лицензия

MIT — см. [LICENSE](LICENSE).
