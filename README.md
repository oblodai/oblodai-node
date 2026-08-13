# Oblodai SDK

Официальный TypeScript / Node.js SDK для платёжного шлюза **Oblodai**: приём платежей, выплаты,
массовые операции, платёжные и payout-ссылки, сплиты, статические кошельки, вебхуки. Подпись запросов,
разбор ответов, типизированные ошибки и повторы — из коробки.

> **Базовый URL.** По умолчанию — `https://api.oblodai.com`. При необходимости переопределите `baseUrl` и свои ключи при инициализации.

## Установка

```bash
npm install @oblodai-npm/sdk
```

Требуется Node.js 18+ (используется глобальный `fetch`). Пакет поставляется в ESM и CommonJS с
типами TypeScript.

## Где взять ключи

Ключи выдаются в **личном кабинете Oblodai** (<https://oblodai.com>), в разделе API-ключей.
Пара состоит из двух частей:

- **`public_id`** — несекретный идентификатор ключа, уходит в заголовке `X-Public-Id`;
- **`secret`** — секрет, которым SDK подписывает запрос (`X-Signature`). Он **показывается один
  раз, в момент создания ключа**, и больше не отображается — сохраните его сразу в своё
  секрет-хранилище. Потеряли — выпускайте новый ключ, «посмотреть старый» нельзя.

Для разработки берите **тестовый** ключ: его `public_id` начинается с `test_`, а секрет — с
`oblodai_test_`. Он работает во всей [песочнице](#песочница--тестирование-v120) и на обычных
бизнес-эндпоинтах, но не двигает настоящих денег. Боевой секрет имеет вид `oblodai_live_...`.

Секрет — **только на сервере**. Он даёт право создавать выплаты, поэтому в браузер, мобильное
приложение или публичный репозиторий он попадать не должен ни при каких условиях.

## Учётные данные

Храните ключи в переменных окружения (см. `.env.example`):

```bash
export OBLODAI_PUBLIC_ID=test_...
export OBLODAI_SECRET=oblodai_test_...
# необязательно: export OBLODAI_BASE_URL=https://api.oblodai.com
```

Тот же код работает и с боевым ключом — меняется **только ключ** (`oblodai_live_...`), ни строчки
интеграции переписывать не нужно.

⚠ `OBLODAI_BASE_URL` обязан быть `https://`: подпись и `public_id` уходят в заголовках, и по
открытому HTTP их читает любой посредник. Клиент отвергает не-HTTPS адрес сразу при создании.
Единственное исключение — локальный стенд на петле (`http://localhost:8095`, `http://127.0.0.1:...`,
`http://[::1]:...`).

```ts
import { OblodaiClient } from "@oblodai-npm/sdk";

const client = OblodaiClient.fromEnv(); // OBLODAI_PUBLIC_ID / OBLODAI_SECRET / OBLODAI_BASE_URL
```

## Быстрый старт

```ts
import { OblodaiClient } from "@oblodai-npm/sdk";

// либо явно (эквивалент fromEnv выше):
const client = new OblodaiClient({
  publicId: process.env.OBLODAI_PUBLIC_ID!,
  secret: process.env.OBLODAI_SECRET!,
  baseUrl: "https://api.oblodai.com", // необязательно
});

// Создать платёж
const payment = await client.payments.create({
  amount: "10",
  currency: "USD",
  order_id: "order-1",
  to_currency: "USDT",
  network: "tron",
});

console.log(payment.address); // адрес для оплаты
console.log(payment.url); // hosted-страница оплаты
```

Клиент возвращает промисы — работает и через `await`, и через `.then()`.

> **Ссылки собирает шлюз, а не SDK.** `payment.url` (`.../pay/<uuid>`), `link.url`
> (`.../link/<link_id>`) и `claim_url` payout-ссылки (`.../claim/<claim_token>`) шлюз строит из
> своего публичного базового URL (`GATEWAY_PUBLIC_BASE_URL`). В проде шлюз без него не стартует,
> а вот на **локальном стенде**, где он не задан, эти поля приходят **пустой строкой**. Это не
> баг SDK и не баг шлюза: если тестируете локально, собирайте ссылку сами из `uuid` / `link_id` /
> `claim_token`, которые всегда на месте.

## Песочница / тестирование (v1.2.0)

У шлюза есть песочница разработчика. **Те же эндпоинты, тот же код** — интеграция между тестом и
боем не меняется вообще, меняется только ключ: тестовый `public_id` начинается с `test_...`,
тестовый секрет — с `oblodai_test_...`. Все бизнес-методы SDK с тестовым ключом работают
точь-в-точь как с боевым.

Новое — пять **тестовых** методов `client.sandbox.*` (`/v1/sandbox/*`). У них нет боевого
аналога: они заменяют то, что в бою делает внешний мир (покупатель платит он-чейн и т.п.),
поэтому им место **только в тестовом коде**, не в интеграции. Боевой ключ на любом из них
получает `403 sandbox.live_key` — удобная страховка, что sandbox-вызов не утёк в прод.
Проверить ключ можно хелпером `isTestKey(publicId)` (экспортируется из корня пакета).

```ts
import { OblodaiClient } from "@oblodai-npm/sdk";

const client = new OblodaiClient({
  publicId: process.env.OBLODAI_TEST_PUBLIC_ID!, // test_...
  secret: process.env.OBLODAI_TEST_SECRET!, // oblodai_test_...
});

// 1. Обычный код интеграции — создать счёт (ничего «тестового» в нём нет)
const payment = await client.payments.create({
  amount: "10",
  currency: "USD",
  order_id: "order-1",
  to_currency: "USDT",
  network: "tron",
});

// 2. Тестовый код — «покупатель заплатил он-чейн»
await client.sandbox.simulateDeposit({ invoice_id: payment.uuid });
// без amount — ровно сумма к оплате; amount меньше/больше — недо-/переплата
// confirmations: 2 — депозит придёт ещё pending (см. каверзы ниже)

// 3. Обычный код — дождаться статуса (или принять вебхук)
const info = await client.payments.info({ uuid: payment.uuid }); // → 'paid'

// 4. Начислить тестовый баланс (до 1000000 за вызов) и погонять выплату
await client.sandbox.faucet({ asset: "USDT", amount: "1000" });
await client.payouts.create({
  amount: "25",
  currency: "USDT",
  network: "tron",
  address: "T...",
  order_id: "payout-1",
});

// Журнал вебхуков и повторная доставка:
const deliveries = await client.sandbox.listWebhooks(); // до 50, новые первыми
await client.sandbox.replayWebhook(deliveries[0]!.id);

// Обнулить балансы и отменить счета, по которым ещё НЕ было оплаты
await client.sandbox.reset(); // история операций сохраняется
```

Каверзы, о которых стоит знать:

- **Неглубокие подтверждения сами НЕ «дозревают».** Депозит с малым `confirmations` приходит
  pending (`confirm_check`) и остаётся в нём **сколько угодно долго**: симулированную транзакцию
  никто не переэмитит глубже, курсор по ней не двигается. Единственный способ довести инвойс до
  `paid` — **повторить `simulateDeposit` с тем же `txid`** и бОльшим `confirmations`. Повтор того
  же `txid` — это же способ проверить идемпотентность вашей обработки.
- **Не путайте с maturity-холдом на ВЫПЛАТЕ.** Знаменитые «~10 минут» относятся к другому
  механизму: в песочнице зачисленные средства какое-то время держатся незрелыми, и выплата с них
  падает с `payout.funds_maturing` (терминальная ошибка, не ретраить). Вот этот холд снимается
  сам по возрасту — фоновым джобом, по умолчанию через 10 минут
  (`GATEWAY_SANDBOX_MATURITY_MINUTES` на стороне шлюза). К числу подтверждений инвойса он
  отношения не имеет.
- **UTXO-сети (Bitcoin и т.п.)** — как и в бою: **нет** авто-возврата переплаты и **нет** адреса
  плательщика, возврат требует явного `address`.
- **`reset()` — не «чистый лист».** Он обнуляет балансы и отменяет счета только в статусах `check`
  и `select`. Счёт, по которому депозит уже **виден** (`confirm_check`, `wrong_amount_waiting`),
  reset **сознательно не трогает**: отмена дала бы этому депозиту подтвердиться в отменённый счёт и
  зачислиться без события. Симулированный депозит для пайплайна — такой же настоящий, как
  он-чейновый, и песочница это правило не обходит. Нужен по-настоящему чистый прогон — заводите
  новый счёт, а не рассчитывайте на сброс уже оплачиваемого. Ничего при этом не удаляется:
  обнуление баланса — компенсирующая проводка в append-only леджере, история остаётся читаемой.

## Статусы платежа

Словарь `payment_status` (тип `PaymentStatus`). Терминальные помечены — в ответе им соответствует
`is_final: true`, статус больше не изменится:

| Статус                 | Что значит                                                                         | Терминальный |
| ---------------------- | ---------------------------------------------------------------------------------- | ------------ |
| `check`                | счёт создан, оплаты ещё не видели                                                  | нет          |
| `confirm_check`        | оплата увидена, ждём подтверждений сети                                            | нет          |
| `wrong_amount_waiting` | увидели **частичную** оплату, счёт ещё живой, ждём доплату                         | **нет**      |
| `paid`                 | оплачен полностью (в пределах допуска)                                             | да           |
| `paid_over`            | переплачен; излишек уходит в авто-возврат, если он включён и сеть его поддерживает | да           |
| `wrong_amount`         | счёт **закрылся** недоплаченным                                                    | да           |
| `cancel`               | истёк или отменён                                                                  | да           |
| `select`               | валюто-агностичный счёт: покупатель ещё не выбрал валюту/сеть                      | нет          |

⚠ **`wrong_amount_waiting` ≠ `wrong_amount`** — самая частая путаница:

- `wrong_amount_waiting` — денег пришло меньше, но **счёт ещё не закрыт**: покупатель может
  доплатить. Вызов `payments.resolve` здесь отвечает **`409 resolution.not_underpaid`** — это
  ожидаемое поведение, а не сбой. Не разруливайте недоплату в этом статусе.
- `wrong_amount` — счёт закрылся недоплаченным, доплаты уже не будет. **Вот теперь** `resolve`
  работает: `accept` (оставить частичную оплату себе) или `refund` (вернуть плательщику).

`wrong_amount_waiting` — производный статус: шлюз выводит его из уже полученной суммы. Он приходит
в `payments.info` / `payments.history`, но **в вебхуках его нет** — там такой счёт приезжает как
`confirm_check`. Разбирайте недоплату по `amount_paid` / `amount_remaining` либо дождитесь
терминального `wrong_amount`.

Статусы выплаты (`PayoutStatus`): `check` (создана, ждёт одобрения) → `process` (одобрена /
отправляется / отправлена) → `paid` (подтверждена в блокчейне); плюс `fail` и `cancel`.

## Проверка вебхуков

Подпись вебхука отличается от подписи запроса. SDK делает и то, и другое за вас. Для входящих вебхуков
берите **сырое тело** и заголовки `X-Webhook-Timestamp` / `X-Webhook-Signature`.

> ⚠ **Секрет вебхуков — ОТДЕЛЬНЫЙ секрет**, тот, что вернул `client.webhooks.register()`
> (поле `secret`). Он **не равен** секрету API-ключа (`OBLODAI_SECRET`), которым подписываются
> исходящие запросы. Подставите ключ API — не пройдёт **ни один** вебхук. Храните его отдельно,
> например в `OBLODAI_WEBHOOK_SECRET`.

```ts
import express from "express";
import { constructWebhookEvent, OblodaiSignatureError, type WebhookEvent } from "@oblodai-npm/sdk";

const app = express();
const WEBHOOK_SECRET = process.env.OBLODAI_WEBHOOK_SECRET!; // из client.webhooks.register()

// ВАЖНО: сырое тело, не express.json()
app.post("/oblodai/callback", express.raw({ type: "*/*" }), (req, res) => {
  const raw = req.body as Buffer;

  // Пробные тела (is_test) не подписаны
  const maybe = JSON.parse(raw.toString("utf8"));
  if (maybe.is_test) return res.send("ok");

  try {
    const event = constructWebhookEvent<WebhookEvent>(WEBHOOK_SECRET, raw, {
      timestamp: req.get("X-Webhook-Timestamp")!,
      signature: req.get("X-Webhook-Signature")!,
    }); // проверяет подпись И свежесть (replay-защита, окно 5 мин по умолчанию)

    if (event.type === "payment" && event.status === "paid") {
      // пометить заказ event.order_id оплаченным (идемпотентно по uuid + status)
    }
    res.send("ok");
  } catch (e) {
    if (e instanceof OblodaiSignatureError) return res.status(403).send("bad signature");
    throw e;
  }
});
```

### Регистрация URL: один эндпоинт на проект (upsert)

```ts
const hook = await client.webhooks.register("https://example.com/oblodai/callback");
// hook.endpoint_id, hook.url, hook.secret — секрет вебхуков, сохраните его
```

⚠ **`register()` — это upsert единственного эндпоинта, а не «добавить ещё один».** У проекта может
быть ровно **один** вебхук-эндпоинт. Повторный вызов с **другим** URL не создаёт второй эндпоинт —
он **перенаправляет доставки**: возвращается **тот же** `endpoint_id`, а старый URL молча перестаёт
что-либо получать. Веерная рассылка на несколько URL средствами API невозможна: принимайте события
на один адрес и разводите их у себя.

При смене URL **секрет сохраняется** — и это требование корректности, а не удобство: доставки
снимают секрет в момент постановки в очередь, так что новый секрет на каждой смене URL осиротил бы
всё уже поставленное в очередь (HMAC не сойдётся → ретраи → dead-letter → потерянные события).
Секрет генерируется на **первой** регистрации; отзыв скомпрометированного секрета — отдельное,
намеренное действие (ротация), а не повторный `register()`.

Журнал доставок — `client.webhooks.deliveries()` (до 50, новые первыми).

## Обработка ошибок

Все ошибки API — экземпляры `OblodaiApiError` с машиночитаемым `.code`. Ветвитесь по коду.

```ts
import { OblodaiApiError } from "@oblodai-npm/sdk";

try {
  await client.payouts.create({
    amount: "25",
    currency: "USDT",
    network: "tron",
    address: "T...",
    order_id: "payout-1",
  });
} catch (e) {
  if (e instanceof OblodaiApiError) {
    if (e.code === "payout.insufficient_funds") {
      // недостаточно средств
    } else if (e.code === "payout.funds_maturing") {
      // средства ещё дозревают — терминальная ошибка (e.isRetriable === false):
      // не повторяйте вслепую, попробуйте позже
    }
    console.error(e.code, e.status, e.message);
  }
}
```

### Классы ошибок

| Класс                    | Когда                                                                |
| ------------------------ | -------------------------------------------------------------------- |
| `OblodaiApiError`        | API вернул конверт `error`. Есть `.code`, `.status`, `.isRetriable`. |
| `OblodaiConnectionError` | Сеть недоступна.                                                     |
| `OblodaiTimeoutError`    | Истёк таймаут запроса.                                               |
| `OblodaiSignatureError`  | Не прошла проверка подписи вебхука.                                  |
| `OblodaiError`           | Базовый класс для всех выше.                                         |

## Повторы (retry)

Временные ошибки (`5xx`, `429`, сетевые сбои) повторяются автоматически с экспоненциальным backoff
и джиттером. Ошибки запроса (`4xx`) и бизнес-ошибки (в т.ч. `payout.funds_maturing`) не повторяются.
На `429` SDK уважает заголовок `Retry-After` от сервера (даже если он больше `maxDelayMs`; потолок — 5 минут).

```ts
const client = new OblodaiClient({
  publicId: "...",
  secret: "...",
  retry: { maxAttempts: 4, initialDelayMs: 500, maxDelayMs: 30_000 },
  // retry: false — отключить
});
```

> **Важно про таймаут.** Таймаут не означает, что операция не прошла — но на большинстве создающих
> вызовов повтор всё равно безопасен.
> С v1.1.0 каждый создающий вызов уходит с HTTP-заголовком **`Idempotency-Key`**: SDK генерирует UUID
> **один раз до цикла ретраев**, поэтому все внутренние повторы несут один и тот же ключ, и бэкенд
> возвращает результат первой попытки вместо дубля. Свой ключ можно передать параметром
> `idempotency_key` (уйдёт в заголовок, не в тело).
>
> ⚠ **Ломающее изменение против v1.0.x:** SDK больше **не подставляет** автоматический `order_id`
> (`idem-<uuid>`) в `payments.create` и `account.transferToPersonal` — `order_id` уходит ровно так,
> как передали вы. `order_id` — ваш бизнес-идентификатор для поиска через `payments.info`, ключом
> идемпотентности он быть перестал. Для выплат `order_id` обязателен всегда.
>
> Заголовок действует на создающих эндпоинтах (`/v1/payment`, `/v1/payment/refund`,
> `/v1/payment/resolve`, `/v1/payment/batch`, `/v1/refund/batch`, `/v1/payout`, `/v1/payout/mass`,
> `/v1/payout/batch`, `/v1/payout/link`, `/v1/payout/link/batch`, `/v1/transfer/to-personal`,
> а с v1.2.0 — `/v1/transfer/to-user` и `/v1/transfer/batch`).
>
> Заголовок действует и на payout-ссылках: `/v1/payout/link` и `/v1/payout/link/batch` тоже
> обёрнуты idempotency-middleware. Повтор с тем же ключом реплеит первый ответ (та же ссылка,
> тот же `claim_token`, ответ помечен `Idempotent-Replayed: true`), а баланс резервируется
> **ровно один раз** — поэтому обычный автоповтор SDK на этих вызовах включён.
>
> Специфичные для повторов коды на эндпоинтах с идемпотентностью:
>
> | Код                           | Когда                                                   | Ретраить?                          |
> | ----------------------------- | ------------------------------------------------------- | ---------------------------------- |
> | `400 idempotency.key_reused`  | тот же ключ с ДРУГИМ телом                              | нет (терминальная)                 |
> | `400 idempotency.bad_key`     | ключ длиннее 255 символов                               | нет (терминальная)                 |
> | `409 idempotency.in_progress` | параллельный повтор, пока первый ещё выполняется        | вручную, чуть позже, тем же ключом |
> | `503 idempotency.unavailable` | стор идемпотентности недоступен (fail-closed by design) | да, SDK повторит сам               |
>
> ⚠ **Без заголовка защиты нет**: два одинаковых вызова `payoutLinks.create` создадут ДВЕ ссылки
> с двумя резервами. SDK шлёт ключ всегда, но если вы ходите в API мимо SDK — шлите его сами.
>
> ⚠ **Батчи**: частично упавший батч реплеится КАК ЕСТЬ — упавшие элементы под тем же ключом не
> повторяются, шлите их НОВЫМ ключом. И ответ больше 256 КБ шлюз не кэширует, поэтому повтор
> такого батча выполнится заново — на батчах **проставляйте per-item `reference`** (второй,
> durable слой дедупликации: повтор → `409 payoutlink.duplicate_reference`).
>
> `wallets.blockedAddressRefund` намеренно НЕ обёрнут middleware'ом и в нём не нуждается: бэкенд
> дедуплицирует его по детерминированному reference `refund-wallet:<wallet_id>` под advisory-локом
> — повтор (в том числе конкурентный) возвращает ТУ ЖЕ выплату, вторая не создаётся. Автоповтор
> здесь безопасен и включён. Косметика: адрес в reference не входит, так что повтор с другим
> адресом вернёт первую выплату на первый адрес.
>
> `payouts.approve` — переход состояния, а не создание: принимается только `pending`, иначе
> `409 payout.not_pending`. Повторный approve не может одобрить или двинуть деньги дважды;
> читайте этот 409 как «уже одобрено» и уточняйте статус через `payouts.info`.

## Новое в v1.1.0

Требует обновлённого шлюза (заголовок `Idempotency-Key` и новые эндпоинты).

### Массовые операции — до 5000 элементов одним запросом

Одна отметка rate-limit вместо тысячи; обработка в фоне, прогресс — через `batches.info`:

```ts
const sub = await client.payments.createBatch(
  [
    { amount: "10", currency: "USD", order_id: "a-1", to_currency: "USDT", network: "tron" },
    { amount: "20", currency: "EUR", order_id: "a-2", to_currency: "USDT", network: "tron" },
  ],
  { onError: "continue" }, // 'continue' (по умолчанию) или 'stop'
);
const info = await client.batches.info(sub.batch_id, { limit: 100 });
// info.status: pending → processing → completed; info.items[i].result / .error — по элементам
```

Аналогично: `payments.refundBatch([...])` (обязательны `reference` и `uuid|order_id` на элементе)
и `payouts.createBatch([...])` (обязателен `order_id` на элементе).

### Платёжные ссылки (донаты) — платят многие, каждый платёж свой инвойс

```ts
const link = await client.paymentLinks.create({ amount_mode: "open", currency: "USD" }); // { link_id, url }
await client.paymentLinks.toggle(link.link_id, false); // выключить
// Публичные (без подписи) — для страницы плательщика:
await client.paymentLinks.publicGet(link.link_id);
await client.paymentLinks.checkout(link.link_id, { amount: "5", payer_email: "a@b.c" }); // → обычный платёж
```

> **Два имени одного ресурса.** `client.paymentLinks` и `client.links` — это **один и тот же
> объект** (`client.paymentLinks === client.links`), а не две разные ручки. Канон во всех SDK
> Oblodai — `payment_links` в идиоматике своего языка (`paymentLinks` в JS/TS и PHP,
> `payment_links` в Python и Rust, `PaymentLinks` в Go), поэтому код, написанный на одном языке,
> переносится на другой без переименований. Короткое `links` остаётся **документированным
> синонимом** и удаляться не будет. Не путайте с `payoutLinks` — это payout-ссылки
> («крипто-чеки»), обратное направление денег.

### Сплит-платежи — доля каждого платежа уходит партнёру

```ts
await client.splits.splitToAddress("T...", "tron", 10, "партнёр А"); // внешний адрес, необратимо
await client.splits.splitToMerchant("m-42", 5); // аккаунт платформы, обратимо
await client.splits.setConfig(24); // окно удержания refund_hold_hours (защита возвратов)
```

### Счёт на e-mail и resolve недоплаты

```ts
await client.payments.sendEmail({ uuid: payment.uuid, email: "buyer@example.com" });

// Недоплата: оставить себе или вернуть (нужен payout-ключ)
await client.payments.resolve({ uuid: payment.uuid, action: "accept" });
await client.payments.resolve({ uuid: payment.uuid, action: "refund" }); // по умолчанию на адрес плательщика
```

⚠ Резолвится **только** статус `wrong_amount` — счёт, который уже **закрылся** недоплаченным.
Пока счёт живой и ждёт доплату, он в `wrong_amount_waiting`, и `resolve` там отвечает
`409 resolution.not_underpaid` (см. [Статусы платежа](#статусы-платежа)).

### Payout-ссылки — «крипто-чеки»: выплата без знания кошелька получателя

```ts
const check = await client.payoutLinks.create({
  currency: "USDT",
  network: "tron",
  amount: "50",
  title: "Бонус",
  email: "user@example.com",
  expires_in_hours: 168, // задавайте явно: при 0/отсутствии окно клампится к 1 часу
});
// check.claim_url / check.claim_token — ТОЛЬКО в этом ответе, сохраните сразу.

// Получатель (публично, без подписи):
const details = await client.payoutLinks.claimInfo(token); // { claimable, amount, ... }
await client.payoutLinks.claim(token, { address: "T..." }); // → { status: 'claimed', payout_id }

// Мерчант: createBatch (до 500), list, info, cancel (funded-ссылка вернёт резерв).
```

Статусы payout-ссылки: `funded → claiming → claimed | expired | cancelled`.

Дедупликация create — два слоя. Первый: заголовок `Idempotency-Key` (SDK шлёт сам, свой —
`idempotency_key`) — `/v1/payout/link` и `/v1/payout/link/batch` обёрнуты idempotency-middleware,
повтор реплеит первый ответ и резервирует средства ровно один раз, поэтому автоповтор SDK на этих
вызовах работает как обычно. Второй, durable: per-link `reference` — уникален в рамках мерчанта,
повтор отдаёт `409 payoutlink.duplicate_reference` (не 500). Он нужен там, где кэш не спасает:
**без заголовка** и на **батчах с ответом >256 КБ** (такой ответ не кэшируется, и повтор
выполнится заново). Частично упавший батч реплеится как есть — упавшие элементы шлите НОВЫМ ключом.

## Переводы пользователям платформы (v1.2.0)

Внутренний перевод **без комиссии** с баланса мерчанта на личный кошелёк пользователя платформы
(payout-ключ, та же подпись, что у выплат). `to_user_id` — **UUID пользователя, не username**
(не-UUID бэкенд отклоняет); username → user_id резолвится публичным профилем кабинета.

```ts
await client.account.transferToUser({
  to_user_id: "5c3f1c7e-9a44-4a5f-8d1a-2f6b7c8d9e0f", // UUID пользователя платформы
  amount: "25",
  currency: "USDT",
  order_id: "bonus-1",
}); // → { currency, amount, to_user_id, recipient_balance }

// «Зарплатная» пачка — обработка в фоне, прогресс через СУЩЕСТВУЮЩИЙ batches.info:
const sub = await client.account.transferBatch(
  [
    { to_user_id: "...", amount: "100", currency: "USDT", order_id: "salary-1" },
    { to_user_id: "...", amount: "150", currency: "USDT", order_id: "salary-2" },
  ],
  { onError: "continue" },
);
const info = await client.batches.info(sub.batch_id); // items[i].result — как у /v1/transfer/to-user
```

Идемпотентность — как у остальных денежных вызовов: заголовок `Idempotency-Key` (SDK генерирует
сам, свой — параметр `idempotency_key`); на бэкенде лестница «заголовок → `order_id` → подпись».

## Кастомный чекаут: публичные `/v1/pay` (v1.2.0)

Пара публичных (без подписи) методов, из которых собирается **полностью свой чекаут** вместо
hosted-страницы оплаты: страница плательщика рендерит и поллит счёт без секрета мерчанта, а на
валюто-агностичном счёте плательщик сам выбирает валюту — `publicSelect` фиксирует курс и
выделяет депозит-адрес.

```ts
// Страница плательщика (секрет не нужен):
const view = await client.payments.publicGet(payment.uuid); // GET /v1/pay/{id}
// view.payment_status === 'select' — счёт ждёт выбора валюты, view.accepted — доступные методы

const inv = await client.payments.publicSelect(payment.uuid, {
  currency: "USDT",
  network: "tron",
}); // POST /v1/pay/{id}/select → финализированный счёт: address, payer_amount, QR
```

Мерчант-приватные поля (`additional_data`, `payer_email`, `payer_address`) в публичном
представлении не возвращаются. Повторный select уже выбранного счёта → `pay.not_selectable`.

⚠ **На свежем мерчанте `publicSelect` легко отдаёт `pay.method_not_accepted` — это норма, а не
ошибка интеграции.** Пара (`currency`, `network`) должна входить в принимаемый набор
(`payments.setAccepted([...])`); когда набор **пуст**, по умолчанию берётся каталог методов
с **живым наблюдателем депозитов**, а на локальном стенде без подключённых RPC он может оказаться
пустым целиком. Не хардкодьте пары в своём чекауте — рендерите их из `accepted`, которое отдаёт
`publicGet`.

## Обзор методов

```ts
// Платежи
client.payments.create(params)
client.payments.createBatch([...], { onError })   // v1.1.0
client.payments.refundBatch([...], { onError })   // v1.1.0
client.payments.sendEmail({ uuid, email })        // v1.1.0
client.payments.resolve({ uuid, action })         // v1.1.0
client.payments.info({ order_id })
client.payments.history({ limit, offset, status })
client.payments.services()
client.payments.qr({ order_id })
client.payments.resend({ order_id })
client.payments.refund({ order_id, amount })      // address с v1.1.0 не обязателен
client.payments.setAccepted([...]) / listAccepted()
client.payments.setDiscount({...}) / listDiscounts()
client.payments.setAccuracy({...}) / getAccuracy()
client.payments.setAutorefund({...}) / getAutorefund()
client.payments.publicGet(uuid) / publicSelect(uuid, { currency, network }) // v1.2.0; публичные, без подписи

// Выплаты
client.payouts.create(params)
client.payouts.createMass([...])
client.payouts.createBatch([...], { onError })    // v1.1.0
client.payouts.info({ order_id })
client.payouts.history({...})
client.payouts.services()
client.payouts.calculate({...})
client.payouts.approve(uuid)
client.payouts.refund({...})
client.payouts.getFeeConfig() / setFeeConfig(bool)
client.payouts.getRefundFeeConfig() / setRefundFeeConfig(bool)

// Батчи (v1.1.0)
client.batches.info(batchId, { limit, offset })

// Платёжные ссылки (v1.1.0). Канон — client.paymentLinks; client.links — тот же объект (синоним)
client.paymentLinks.create({ amount_mode, currency, ... })
client.paymentLinks.list({ limit, offset }) / info(linkId) / toggle(linkId, active)
client.paymentLinks.publicGet(linkId) / checkout(linkId, { amount })   // публичные, без подписи

// Сплиты (v1.1.0)
client.splits.splitToAddress(address, network, percent, note?)
client.splits.splitToMerchant(merchantId, percent, note?)
client.splits.createRule({...}) / listRules() / deleteRule(ruleId)
client.splits.getConfig() / setConfig(refundHoldHours)

// Payout-ссылки — крипто-чеки (v1.1.0)
client.payoutLinks.create({ currency, network, amount, expires_in_hours })
client.payoutLinks.createBatch([...])  // до 500
client.payoutLinks.list({ limit, offset }) / info(linkId) / cancel(linkId)
client.payoutLinks.claimInfo(token) / claim(token, { address })  // публичные, без подписи

// Кошельки
client.wallets.create({ currency, network, order_id })
client.wallets.block({ address })
client.wallets.blockedAddressRefund({ uuid, address })
client.wallets.qr(address)

// Аккаунт
client.account.balance()
client.account.referral()
client.account.transferToPersonal({ amount, currency })
client.account.transferToUser({ to_user_id, amount, currency })   // v1.2.0; to_user_id — UUID
client.account.transferBatch([...], { onError })                  // v1.2.0; поллинг — batches.info
client.account.vrcs(enabled?)

// Вебхуки
client.webhooks.register(url)        // upsert ЕДИНСТВЕННОГО эндпоинта проекта; секрет — отдельный
client.webhooks.deliveries()         // → Delivery[]; с v1.2.0 массив, а не { deliveries }
client.webhooks.testPayment({ url_callback })

// Настройки
client.settings.listAutoWithdraw() / setAutoWithdraw({...}) / deleteAutoWithdraw(currency)
client.settings.listAllowlist() / addAllowlist(cidr) / removeAllowlist(cidr) / enableAllowlist(bool)

// Курсы (публично, без ключа)
client.rates.list('ETH')

// Песочница (v1.2.0; ТОЛЬКО тестовый ключ, только тестовый код)
client.sandbox.simulateDeposit({ invoice_id, amount?, confirmations?, txid? })
client.sandbox.faucet({ asset, amount, idempotency_key? })
client.sandbox.reset()                 // отменяет только НЕоплачиваемые счета (check/select)
client.sandbox.listWebhooks()          // подписанный GET; → SandboxDelivery[]
client.sandbox.replayWebhook(deliveryId)
```

## Конфигурация

```ts
interface OblodaiConfig {
  publicId: string; // обязательно
  secret: string; // обязательно
  baseUrl?: string; // по умолчанию https://api.oblodai.com
  timeoutMs?: number; // по умолчанию 30000
  retry?: RetryOptions | false;
  fetch?: typeof fetch; // кастомный fetch
}
```

## Замечания

- **Суммы — строки** в единицах валюты (`"25.00"`), не числа. Так сохраняется точность.
- **Идемпотентность — заголовком `Idempotency-Key`** (с v1.1.0): SDK шлёт его сам на всех создающих
  вызовах, свой ключ — параметр `idempotency_key`. `order_id` — ваш бизнес-идентификатор (SDK его
  больше не подставляет); для выплат он обязателен всегда. `payoutLinks.create` /
  `payoutLinks.createBatch` шлюз тоже дедуплицирует по заголовку — второй, durable слой у
  payout-ссылок — per-link `reference` (`409 payoutlink.duplicate_reference` вместо дубля),
  особенно важный в батчах, где ответ >256 КБ не кэшируется.
- **Два разных секрета.** Секрет API-ключа (`OBLODAI_SECRET`) подписывает ваши **исходящие**
  запросы; секрет эндпоинта из `webhooks.register()` проверяет **входящие** вебхуки. Перепутать их —
  значит отвергнуть 100% вебхуков.
- **Один вебхук-эндпоинт на проект.** `webhooks.register(url)` — upsert: повтор с другим URL
  перенаправляет доставки на новый адрес (тот же `endpoint_id`), старый замолкает; секрет при этом
  сохраняется.
- **Списковые методы возвращают массивы** — `webhooks.deliveries()`, `sandbox.listWebhooks()`,
  `payoutLinks.list()` разворачивают конверт сами.
- **Секрет — только на сервере.** SDK серверный; не встраивайте ключ в браузер/мобильное приложение.
  Исключение — публичные методы (`rates.*`, `paymentLinks.publicGet/checkout`, `payoutLinks.claimInfo/claim`,
  `payments.publicGet/publicSelect`): они не требуют ключа вовсе.

## Лицензия

MIT
