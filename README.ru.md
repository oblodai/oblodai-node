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

[Documentation](https://docs.oblodai.com) · [Dashboard](https://my.oblodai.com) · [Read in English →](README.md)

</div>

---

Официальный TypeScript / Node.js SDK платёжного шлюза **Oblodai**: приём платежей, выплаты, массовые
операции (батчи), платёжные ссылки, выплатные ссылки (крипточеки), сплиты, статические кошельки,
переводы, вебхуки. Подпись запросов, разбор ответов, типизированные ошибки, идемпотентность и
ретраи — из коробки. Node.js ≥ 18.17, ESM и CommonJS в одном пакете, типы TypeScript сгенерированы из
контрактного снимка самого шлюза, runtime-зависимостей нет.

> **Базовый URL.** По умолчанию `https://api.oblodai.com`. При необходимости переопределите `baseUrl`
> и передайте свои ключи при инициализации. Схема должна быть `https://`; обычный `http://`
> принимается только для локальной петли (`http://127.0.0.1:8095`) или с явной опцией
> `allowInsecureBaseUrl`.

## Установка

```bash
npm install @oblodai-npm/sdk
```

Node.js ≥ 18.17 (SDK использует глобальный `fetch` рантайма). В пакете лежат сборка ESM, сборка
CommonJS и декларации типов для обеих; в рантайме ничего дополнительного не подтягивается. Проверка
подписи вебхуков вынесена в подпуть `@oblodai-npm/sdk/webhooks` и не требует ни клиента, ни
API-ключа. Пишете код с ИИ-агентом? Дайте ему [AGENTS.md](AGENTS.md).

## Где взять ключи

Ключи выпускаются в кабинете [my.oblodai.com](https://my.oblodai.com) → **API-ключи**. Секрет
показывается один раз, при создании. Боевая пара — это public id `oblodai_<hex>` и секрет
`oblodai_live_<hex>`; пара песочницы — `test_oblodai_<hex>` и `oblodai_test_<hex>`.

| Вид ключа              | Public id                                                   | Чем подписывает                                                                                                                                                                                                                                                             |
| ---------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Платёжный ключ         | `oblodai_<hex>` (устаревшая раздельная: `oblodai_pk_<hex>`) | Всё, что принимает деньги: `payments.*`, `paymentLinks.*`, `wallets.create/qr/block`, `documents.*`, `account.*`, `catalog.*`, большая часть `settings.*`                                                                                                                   |
| Выплатной ключ         | `oblodai_<hex>` (устаревшая раздельная: `oblodai_wk_<hex>`) | Всё, что отправляет деньги: `payouts.*`, `refunds.*`, `payoutLinks.*`, `transfers.*`, `splits.*`, `wallets.refundBlockedDeposit`, `settings.*AutoWithdraw`, `settings.*ApiAllowlist`, `webhooks.rotateSecret`, `webhooks.test("payout")`, `sandbox.faucet`, `sandbox.reset` |
| Ключ песочницы         | `test_oblodai_<hex>`                                        | Оба вида сразу, против бесцепочечной копии шлюза                                                                                                                                                                                                                            |
| Админ-токен онбординга | задаётся на self-hosted шлюзе                               | Только `merchants.create`, `merchants.createSandbox` — без подписи, уходит как `X-Admin-Token` и ни на одном другом маршруте                                                                                                                                                |

Нынешний боевой ключ **единый**: одна пара `oblodai_<hex>` подписывает обе стороны. У проектов,
заведённых до объединения, пары до сих пор две, и там одним платёжным ключом никому не заплатить —
настройте обе, и SDK сам выберет нужную для каждого вызова:

```ts
import { Oblodai } from "@oblodai-npm/sdk";

const oblodai = new Oblodai({
  publicId: process.env.OBLODAI_PUBLIC_ID,
  secret: process.env.OBLODAI_SECRET,
  payoutPublicId: process.env.OBLODAI_PAYOUT_PUBLIC_ID,
  payoutSecret: process.env.OBLODAI_PAYOUT_SECRET,
});
```

На раздельной паре вызов, подписанный ключом не того вида, — это 403 `merchant.wrong_key_kind`. На
маршруте, который принимает оба вида (например, `batches.info` для выплатного батча), передайте
`{ preferPayoutKey: true }`.

## Быстрый старт

Принять платёж. Суммы — десятичные **строки**, никогда не числа с плавающей точкой.

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

Чтобы назначать цену в фиате, а получать крипту, передайте оба поля:
`{ amount: "25", currency: "USD", to_currency: "USDT" }` — `currency` это то, что вы выставляете к
оплате, `to_currency` — актив, который отправляет плательщик.

Отправить выплату. Сначала валидация (бесплатно, без побочных эффектов), затем создание со своим
ключом идемпотентности.

```ts
import { Oblodai } from "@oblodai-npm/sdk";

const oblodai = new Oblodai({
  publicId: process.env.OBLODAI_PAYOUT_PUBLIC_ID,
  secret: process.env.OBLODAI_PAYOUT_SECRET,
});

const params = {
  amount: "10",
  currency: "USDT",
  network: "tron",
  address: "TQrY8bkbpXKPt2LZbU8jqfnpFbUSF15sbx",
  order_id: "payout-42",
};
const check = await oblodai.payouts.validate(params);
console.log("will debit", check.payer_amount, "commission", check.commission);

const payout = await oblodai.payouts.create(params, { idempotencyKey: "payout-42" });
console.log(payout.uuid, payout.status); // "pending"
```

Больше сквозных программ — в [`examples/`](examples); запустить одну: `npx tsx examples/sandbox.ts`.

## Песочница и тестирование

Ключ песочницы работает против бесцепочечной копии шлюза: фейковый баланс из крана, смоделированные
депозиты, настоящие подписанные вебхуки. Интегрируйтесь сначала на ней — поверхность API та же самая,
так что при переходе на боевые ключи ничего не меняется.

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
await oblodai.sandbox.deposit({
  invoice_id: invoice.uuid,
  amount: "25",
  confirmations: 20,
  txid: `sbx-tx-${Date.now()}`,
});
console.log((await oblodai.payments.info({ uuid: invoice.uuid })).status); // "paid"

for await (const delivery of oblodai.sandbox.webhooks({ limit: 20 })) {
  console.log(delivery.event_type, delivery.status, delivery.payload?.status);
}
await oblodai.sandbox.reset(); // cancel open invoices, zero the balances
```

- `sandbox.deposit` зачисляет средства по инвойсу; повторите тот же `txid`, чтобы добавить
  подтверждения.
- `sandbox.webhooks` — журнал доставок вместе с телами; `sandbox.replay(deliveryId)` переотправляет
  доставку в терминальном состоянии (доставлена или мертва).
- `webhooks.test("payment" | "payout" | "wallet")` прогоняет репетиционную доставку на ваш боевой
  эндпоинт. Репетиции подписаны точно так же, как настоящие доставки, и несут `test: true` —
  проверяйте `isTest` и никогда не давайте такой доставке двигать деньги в вашей системе.
- `sandbox.faucet` и `sandbox.reset` требуют выплатной ключ.

## Обзор методов

Шестнадцать неймспейсов, 107 мерчантских маршрутов — на каждый маршрут шлюза здесь есть метод.

| Неймспейс      | Методы                                                                                                                                                                                                                      | Маршруты                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `payments`     | create · info/get · cancel · history/list · batch · qr · services · sendEmail · resend · publicView · select · publicQr                                                                                                     | 12 — `/v1/payment*`, `/v1/pay/{id}*`                                                                                  |
| `refunds`      | create · resolve · batch                                                                                                                                                                                                    | 3 — `/v1/payment/refund`, `/v1/payment/resolve`, `/v1/refund/batch`                                                   |
| `payouts`      | create · validate · calculate · info/get · cancel · approve · history/list · mass · batch · services · getFeeConfig/setFeeConfig · getRefundFeeConfig/setRefundFeeConfig                                                    | 14 — `/v1/payout*`                                                                                                    |
| `payoutLinks`  | create · info/get · list · cancel · batch · cheque · claimPreview · claim                                                                                                                                                   | 8 — `/v1/payout/link*`, `/v1/claim/{token}`                                                                           |
| `paymentLinks` | create · info/get · list · toggle · publicView · checkout                                                                                                                                                                   | 6 — `/v1/payment/link*`, `/v1/link/{id}*`                                                                             |
| `batches`      | info                                                                                                                                                                                                                        | 1 — `/v1/batch/info`                                                                                                  |
| `transfers`    | toPersonal · toUser · batch                                                                                                                                                                                                 | 3 — `/v1/transfer/*`                                                                                                  |
| `wallets`      | create · qr · block · refundBlockedDeposit                                                                                                                                                                                  | 4 — `/v1/wallet*`                                                                                                     |
| `webhooks`     | register · rotateSecret · deliveries · test · testLegacy                                                                                                                                                                    | 7 — `/v1/webhooks*`, `/v1/test-webhook/*`, `/v1/payment/testing-webhook`                                              |
| `documents`    | statement · ledger · balanceCertificate · feeSchedule · splitReport · batchReport · linkReport · walletStatement · referralsReport · createJob · jobInfo · jobFile · download                                               | 13 — `/v1/documents/*`                                                                                                |
| `splits`       | createRule · listRules · deleteRule · getConfig/setConfig · getOptIn/setOptIn                                                                                                                                               | 7 — `/v1/split/*`                                                                                                     |
| `settings`     | setDiscount · listDiscounts · getAccuracy/setAccuracy · getAutoRefund/setAutoRefund · listAccepted/setAccepted · getPaymentFeeConfig/setPaymentFeeConfig · list/set/deleteAutoWithdraw · list/add/remove/enableApiAllowlist | 17 — `/v1/payment/{discount,accuracy,autorefund,accepted,fee-config}/*`, `/v1/auto-withdraw/*`, `/v1/api-allowlist/*` |
| `account`      | balance · referral · vrcs                                                                                                                                                                                                   | 3 — `/v1/balance`, `/v1/referral/info`, `/v1/vrcs`                                                                    |
| `catalog`      | currencies · exchangeRates                                                                                                                                                                                                  | 2 — `/v1/currencies`, `/v1/exchange-rate/list`                                                                        |
| `sandbox`      | faucet · deposit · webhooks · replay · reset                                                                                                                                                                                | 5 — `/v1/sandbox/*`                                                                                                   |
| `merchants`    | create · createSandbox                                                                                                                                                                                                      | 2 — `/v1/merchants`, `/v1/merchants/{id}/sandbox`                                                                     |

Соглашения, общие для всех:

- Получить один объект: `.info(uuid | { order_id })`, псевдоним `.get`. Получить много:
  `.history(params)` у платежей и выплат (псевдоним `.list`), `.list(params)` в остальных случаях.
- Каждый метод принимает один и тот же необязательный последний аргумент —
  `{ idempotencyKey, signal, timeoutMs, deadlineMs, preferPayoutKey }`.
- Синхронные массовые вызовы ограничены по числу элементов — `payouts.mass` до 100, `payoutLinks.batch`
  до 500 — и отчитываются по каждому элементу отдельно (`{ idx, ok, result, message, error_code }`),
  так что и внутри 200 могут быть отказы. Асинхронные батчи (`payments.batch`, `payouts.batch`,
  `refunds.batch`, `transfers.batch`) принимают до 5000 элементов, их состояние опрашивается через
  `batches.info`.
- Методы документов возвращают `FileResult` — `{ bytes, contentType, filename }`.
- Методы для плательщика (`payments.publicView/select/publicQr`, `paymentLinks.publicView/checkout`,
  `payoutLinks.claimPreview/claim`) вообще не требуют учётных данных.
- Провижининг (`merchants.create`, `merchants.createSandbox`) идёт без подписи и закрыт админ-токеном
  шлюза.

### Списки

Списочные методы возвращают `PagePromise` — настоящий Promise, который вдобавок можно перебирать
асинхронно. Пока вы его не потребите, запросов не будет.

```ts
import { Oblodai } from "@oblodai-npm/sdk";

const oblodai = new Oblodai();

// one page: { items, paginate: { total, per_page, offset, has_pages } }
const page = await oblodai.payments.history({ limit: 50 });
console.log(page.items.length, page.paginate.total);

// every item, page by page
for await (const payout of oblodai.payouts.history({ status: "confirmed" }))
  console.log(payout.uuid);

// up to N items as an array
const refunds = await oblodai.payouts.history({ kind: "refund" }).all(1000);
```

### Статусы

- Платёж: `select → created → confirm_check → paid | paid_over | wrong_amount | expired | cancelled`.
  `isPaymentPaid(status)` истинно для `paid`/`paid_over`; `wrong_amount` (недоплата) ждёт
  `refunds.resolve({ uuid, action: "accept" | "refund" })`; остальное покрывает `isPaymentFinal`.
- Выплата: `pending → approved → awaiting_cosign → broadcasting → sent → confirmed | failed | cancelled`,
  для неё есть `isPayoutFinal` и `isPayoutSucceeded`.

Об изменениях состояния лучше узнавать из вебхуков; `info` опрашивать только как запасной вариант.

### Суммы

`addAmounts`, `subtractAmounts`, `compareAmounts`, `amountEquals`, `isZeroAmount`, `isValidAmount` —
точная десятичная арифметика над строковыми суммами, которыми оперирует API. Никогда не применяйте
`parseFloat` к `Money` и никогда не сравнивайте суммы через `<`, `sort()` или `Math.max`: `Money` —
это `string`, поэтому `"9" < "10"` компилируется и даёт неверный результат. Значение, не подходящее
под `-?digits[.digits]` (не длиннее 64 символов), поднимает `ConfigError` с кодом `sdk.bad_amount` —
а не системный `TypeError`.

## Вебхуки

Зарегистрируйте эндпоинт через `webhooks.register(url)`, а затем проверяйте каждую доставку по
**сырому** телу, до его разбора:

```ts
import express from "express";
import { verifyWebhookDelivery, isKnownEvent } from "@oblodai-npm/sdk/webhooks";

const app = express();

app.post("/oblodai/webhook", express.raw({ type: "*/*" }), (req, res) => {
  const { event, id, isTest } = verifyWebhookDelivery(req.body, req.headers, {
    secret: process.env.OBLODAI_WEBHOOK_SECRET!,
    previousSecret: process.env.OBLODAI_WEBHOOK_SECRET_PREV, // during rotation
  });
  if (isTest) return res.sendStatus(200); // a rehearsal — never move money on it
  if (!isKnownEvent(event)) return res.sendStatus(200); // a type from a newer gateway
  // narrowed: event.type is "payment" | "payout" | "wallet"
  // order_id is null on refund payouts, so fall back to the uuid
  if (event.type === "payment" && event.status === "paid")
    markOrderPaid(event.order_id ?? event.uuid, id);
  res.sendStatus(200);
});
```

Проверки идут в фиксированном порядке — заголовки, затем HMAC (текущим секретом, потом
`previousSecret`), затем свежесть, затем тело — поэтому окно свежести никогда не становится оракулом
для неаутентифицированного вызывающего. Пустой `secret` (как и пустой `previousSecret`) — это
`ConfigError`, а не проверка с пустым ключом. `toleranceSec` по умолчанию 300, значение `0` отключает
проверку свежести.

- **Дедуплицируйте по `id`** (`X-Webhook-Id`): он не меняется между ретраями самого шлюза.
- **Упорядочивайте по `event.sequence`**: `isStaleEvent(event, lastSequence)` возвращает false, а не
  бросает исключение, когда пригодной последовательности нет.
- **Репетиции** (`webhooks.test`, доставки песочницы) подписаны как боевые и несут `test: true` (и
  `X-Webhook-Test: true`); `verifyWebhookDelivery(...).isTest` об этом сообщает.
- **Неизвестные типы событий** от более нового шлюза возвращаются как есть, в виде
  `UnknownWebhookEvent`, а не выбрасываются — вызывайте `isKnownEvent(event)` перед разбором по
  `type`.
- **Ротация**: после `webhooks.rotateSecret` продолжайте передавать `previousSecret` минимум 26 часов.

Два вида отказа — два ответа. `SignatureError` (`webhook.bad_signature`, `webhook.stale_timestamp`,
`webhook.missing_header`) означает подделанную или переигранную доставку — отвечайте 4xx, причём
**401 приберегите только для отказов подписи**. `WebhookPayloadError` (`webhook.bad_payload`) — это
**подлинная** доставка, тело которой не удалось прочитать: отвечайте 5xx, чтобы шлюз повторил её, и
идите разбираться.

## Ошибки

Любой отказ — это `OblodaiError`, несущий конверт ошибки API: `code`
(`payout.insufficient_funds`), `httpStatus`, `retryable`, `retryAfter`, `requestId`, `field`. Все
классы ниже экспортируются из корня пакета, так что `instanceof` работает.

| Класс                                        | HTTP       | Когда                                                                                                                                                                   |
| -------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ValidationError`                            | 400        | Запрос некорректен; `field` называет виновника                                                                                                                          |
| `AuthenticationError`                        | 401        | Неверная подпись, неизвестный public id, разъехавшиеся часы                                                                                                             |
| `PermissionError`                            | 403        | Ключ верный, но не того вида или без нужного права (`merchant.wrong_key_kind`)                                                                                          |
| `NotFoundError`                              | 404        | Такого объекта нет                                                                                                                                                      |
| `ConflictError` / `IdempotencyConflictError` | 409        | Конфликт состояния; второй — переиспользованный ключ идемпотентности с другим телом                                                                                     |
| `RateLimitError`                             | 429        | Троттлинг; `retryAfter` заполнен                                                                                                                                        |
| `UnavailableError`                           | 503        | Шлюз временно недоступен; можно повторить                                                                                                                               |
| `InternalError`                              | прочие 5xx | Сбой на стороне шлюза                                                                                                                                                   |
| `TransportError`                             | —          | Ответа не было вовсе: DNS, TCP, TLS, таймаут, отмена                                                                                                                    |
| `ConfigError`                                | —          | Отказ до отправки: плохие опции, заголовок, который SDK не отправит, ключ идемпотентности на маршруте, который шлюз не дедуплицирует, сумма не в виде десятичной строки |
| `ContractError`                              | —          | Ответ не является документированным конвертом или слишком велик для буферизации                                                                                         |
| `SignatureError` / `WebhookPayloadError`     | —          | Проверка вебхука (см. выше)                                                                                                                                             |

`retryable` авторитетен: SDK уже повторил всё, что можно было повторить безопасно, поэтому дошедшая
до вас ошибка с `retryable` — та, которую вы вправе переназначить сами. `retryAfter` — подсказка
самого шлюза в секундах. `requestId` называйте в поддержке. `err.synthetic` истинно, когда в ответе
не было конверта шлюза: ответил прокси или балансировщик, а не API; при этом небулев `retryable`,
числовой `code` или бессмысленный `retry_after` наружу не просачиваются — SDK откатывается к тому,
что оправдывает один только HTTP-статус. `JSON.stringify(err)` сохраняет `message` и выбрасывает
сырое тело.

Ветвитесь по `code`, а не по сообщению. Полный каталог — 471 код, экспортируется как `ERROR_CODES` и
типизирован как `ErrorCode`:

```ts
import { Oblodai, OblodaiError, type CreatePayoutParams } from "@oblodai-npm/sdk";

const oblodai = new Oblodai();

async function sendPayout(params: CreatePayoutParams): Promise<void> {
  try {
    await oblodai.payouts.create(params);
  } catch (err) {
    if (!(err instanceof OblodaiError)) throw err;
    switch (err.code) {
      case "payout.insufficient_funds": // the balance may still arrive
      case "payout.funds_maturing":
        return scheduleRetry(err.retryAfter ?? 60);
      default:
        throw err; // the SDK already retried what was safe to retry
    }
  }
}
```

Коды, которые стоит обрабатывать отдельно: `payout.insufficient_funds`, `payout.funds_maturing`,
`idempotency.key_reused`, `invoice.not_payable`, `payment.not_found`, `merchant.wrong_key_kind`,
`merchant.bad_signature`, `request.rate_limited`.

## Ретраи, идемпотентность и таймауты

**Что можно повторить — это не догадка.** `ROUTES[key].safe` — собственная, вручную выверенная
классификация шлюза «только чтение», поставляемая в `contract/contract.json`. SDK никогда не выводит
безопасность ретрая из пути или HTTP-метода.

- Ошибка повторяется только тогда, когда API сказал `retryable: true`. Ответы без конверта API (502/503
  от прокси) и транспортные сбои повторяются только на читающих маршрутах и на записях с ключом
  идемпотентности: запись, которую шлюз не дедуплицирует, не переотправляется, если она могла дойти.
- `Retry-After` всегда важнее вычисленной задержки; иначе — экспоненциальный откат с полным джиттером.
  Значения по умолчанию: `maxRetries: 2`, `baseDelayMs: 250`, `maxDelayMs: 4000`,
  `maxRetryAfterMs: 30000`. `retry: { maxRetries: 0 }` отключает ретраи полностью.
- **Ключи идемпотентности проставляются автоматически** на создающих маршрутах: один ключ на один
  логический вызов, переиспользуемый при каждом ретрае, — поэтому таймаут не может породить вторую
  выплату. Передавайте свой `idempotencyKey`, чтобы ретраи оставались безопасными и через перезапуск
  процесса. На маршруте, который шлюз не дедуплицирует, SDK отвергает ключ сразу (`ConfigError`,
  `sdk.idempotency_unsupported`), а не молча его выбрасывает, — списочные методы в том числе.
- **Опции на вызов**: `{ idempotencyKey, signal, timeoutMs, deadlineMs, preferPayoutKey }`.
  `timeoutMs` ограничивает одну попытку (по умолчанию 30000), `deadlineMs` — весь вызов вместе с
  ретраями (по умолчанию 90000).
- **Рассинхрон часов корректируется один раз.** Шлюз отклоняет метки времени, отличающиеся от его
  собственных больше чем на ±300 с; при отказе подписи SDK узнаёт серверное время из заголовка `Date`,
  переподписывает запрос один раз и сохраняет смещение, только если эта попытка прошла аутентификацию.
  Неправдоподобные смещения (> 24 ч) игнорируются.
- **Редиректы не выполняются никогда** — 3xx с поверхности API это ошибка, а не переход.
- **Тела ограничены по размеру** при буферизации: 8 МиБ для JSON-конвертов, 64 МиБ для бинарных
  маршрутов документов (`MAX_JSON_BODY_BYTES`, `MAX_BARE_BODY_BYTES`). Всё, что больше, —
  `ContractError`.

## Конфигурация

```ts
import { Oblodai, consoleLogger } from "@oblodai-npm/sdk";

const oblodai = new Oblodai({
  baseUrl: "https://api.oblodai.com",
  timeoutMs: 30_000,
  deadlineMs: 90_000,
  retry: { maxRetries: 2 },
  headers: { "X-Tenant": "eu-1" },
  logger: consoleLogger("info"),
});
```

| Опция                             | По умолчанию                           | Смысл                                                                            |
| --------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------- |
| `publicId` / `secret`             | `OBLODAI_PUBLIC_ID` / `OBLODAI_SECRET` | Платёжная (или песочная) пара ключей; обе или ни одной                           |
| `payoutPublicId` / `payoutSecret` | `OBLODAI_PAYOUT_*`                     | Выплатная пара ключей; обе или ни одной                                          |
| `baseUrl`                         | `https://api.oblodai.com`              | Адрес API; префикс пути сохраняется                                              |
| `allowInsecureBaseUrl`            | `false`                                | Разрешить базовый URL по обычному `http://` вне локальной петли                  |
| `adminToken`                      | `OBLODAI_ADMIN_TOKEN`                  | Токен онбординга self-hosted шлюза; используют только два маршрута `merchants.*` |
| `timeoutMs`                       | `30000`                                | Таймаут одной попытки                                                            |
| `deadlineMs`                      | `90000`                                | Бюджет на весь вызов, включая ретраи                                             |
| `retry`                           | см. выше                               | `{ maxRetries, baseDelayMs, maxDelayMs, maxRetryAfterMs }`                       |
| `headers`                         | —                                      | Дополнительные заголовки на каждом запросе                                       |
| `logger`                          | `OBLODAI_LOG`                          | Структурный логгер; `consoleLogger(level)` идёт в комплекте                      |
| `fetch`                           | глобальный `fetch`                     | Свой fetch — undici с прокси-агентом, записывающая заглушка в тестах             |

| Переменная окружения       | Смысл                                                               |
| -------------------------- | ------------------------------------------------------------------- |
| `OBLODAI_PUBLIC_ID`        | Public id платёжного (или песочного) ключа                          |
| `OBLODAI_SECRET`           | Его секрет                                                          |
| `OBLODAI_PAYOUT_PUBLIC_ID` | Public id выплатного ключа                                          |
| `OBLODAI_PAYOUT_SECRET`    | Его секрет                                                          |
| `OBLODAI_ADMIN_TOKEN`      | Админ-токен онбординга self-hosted шлюза                            |
| `OBLODAI_BASE_URL`         | Адрес API                                                           |
| `OBLODAI_LOG`              | `debug` \| `info` \| `warn` \| `error` — включает консольный логгер |
| `OBLODAI_ALLOW_INSECURE`   | `1` разрешает нелокальный базовый URL по обычному `http://`         |

Заголовки, добавленные через `headers:`, уходят с каждым запросом, кроме тех, которыми владеет сам
SDK (`Accept`, `Content-Type`, `User-Agent`, `X-Public-Id`, `X-Signature`, `X-Timestamp`,
`Idempotency-Key`, `X-Admin-Token`, сравнение без учёта регистра) — эти всегда побеждают. Значение
заголовка с CR/LF или не-ASCII символом — это `ConfigError`.

**Секреты не печатаются.** Клиент, его транспорт, разобранные учётные данные и любой результат с
секретом внутри — `secret` вебхука, только что выпущенная пара ключей, `claim_token`/`claim_url`/`passcode`
выплатной ссылки — отображаются как `[redacted]` в `JSON.stringify` и `console.log`/`util.inspect`, на
любой глубине. Сами значения по-прежнему читаются как свойства (`endpoint.secret` работает); вычищается
только автоматическое отображение. Логгер, переданный через `logger:`, получает поля уже
отредактированными, так что случайный `logger.info({ client })` не сможет утечь ключом.

Локальный или self-hosted шлюз не требует церемоний: `baseUrl: "http://localhost:8095"` работает
из коробки, для остальных хостов по обычному `http://` нужен `allowInsecureBaseUrl: true` (или
`OBLODAI_ALLOW_INSECURE=1`).

## Контрактный снимок

`contract/` выгружается собственным тестовым набором шлюза, а не пишется руками. В нём лежат реестр
маршрутов — 107 мерчантских маршрутов, у каждого флаги `auth`, `idempotent`, `safe`, `bare` и `list`, —
схемы DTO запросов с англоязычным описанием полей, перечисления, все коды ошибок (471), векторы
подписи, эталонные тела ответов, записанные с живого шлюза, и настоящие подписанные доставки вебхуков.
Этот релиз собран с ядра `7ec04293c426`.

`src/contract/` генерируется из снимка командой `npm run codegen`. `npm run check-drift` падает, когда
эти двое разошлись, а `npm test` сверяет каждую модель с эталонными телами и каждый флаг маршрута с
контрактом — так что документация, тип и шлюз не могут тихо разъехаться. `contract.json` едет внутри
пакета:

```ts
import { ROUTES, ERROR_CODES, CONTRACT_CORE_COMMIT } from "@oblodai-npm/sdk";

console.log(Object.keys(ROUTES).length, ERROR_CODES.length, CONTRACT_CORE_COMMIT);
console.log(ROUTES["POST /v1/payout"].safe); // false — never retried blindly
```

Эталонные фикстуры и примеры вебхуков лежат в репозитории, а не в опубликованном тарболе. Чтобы
обновить снимок, выполните `scripts/contract-pull.sh <core checkout>`, а затем `npm run codegen`.

## Разработка

```bash
git clone https://github.com/oblodai/oblodai-node.git
cd oblodai-node
npm install

npm run ci          # fmt:check + check-drift + typecheck (src + examples) + build + test
npm test            # unit + contract tests
npm run fmt         # prettier
npm run codegen     # after refreshing contract/ (scripts/contract-pull.sh <core checkout>)

# the live tier: runs the full journey against a real gateway
OBLODAI_LIVE_URL=http://localhost:8095 npm run test:live
```

Что почитать дальше: [AGENTS.md](AGENTS.md) (компактный справочник для кодовых агентов),
[CHANGELOG.md](CHANGELOG.md), [MIGRATION-1.3.md](MIGRATION-1.3.md) — про переход с 1.x.

## Лицензия

MIT — см. [LICENSE](LICENSE).
