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

## Учётные данные

Храните ключи в переменных окружения (см. `.env.example`) — секрет **только на сервере**, никогда в браузере:

```bash
export OBLODAI_PUBLIC_ID=oblodai_...
export OBLODAI_SECRET=oblodai_live_...
# необязательно: export OBLODAI_BASE_URL=https://api.oblodai.com
```

```ts
import { OblodaiClient } from '@oblodai-npm/sdk';

const client = OblodaiClient.fromEnv(); // OBLODAI_PUBLIC_ID / OBLODAI_SECRET / OBLODAI_BASE_URL
```

## Быстрый старт

```ts
import { OblodaiClient } from '@oblodai-npm/sdk';

// либо явно (эквивалент fromEnv выше):
const client = new OblodaiClient({
  publicId: process.env.OBLODAI_PUBLIC_ID!,
  secret: process.env.OBLODAI_SECRET!,
  baseUrl: 'https://api.oblodai.com', // необязательно
});

// Создать платёж
const payment = await client.payments.create({
  amount: '10',
  currency: 'USD',
  order_id: 'order-1',
  to_currency: 'USDT',
  network: 'tron',
});

console.log(payment.address); // адрес для оплаты
console.log(payment.url);     // hosted-страница оплаты
```

Клиент возвращает промисы — работает и через `await`, и через `.then()`.

## Проверка вебхуков

Подпись вебхука отличается от подписи запроса. SDK делает и то, и другое за вас. Для входящих вебхуков
берите **сырое тело** и заголовки `X-Webhook-Timestamp` / `X-Webhook-Signature`.

```ts
import express from 'express';
import { constructWebhookEvent, OblodaiSignatureError, type WebhookEvent } from '@oblodai-npm/sdk';

const app = express();
const WEBHOOK_SECRET = process.env.OBLODAI_WEBHOOK_SECRET!; // из client.webhooks.register()

// ВАЖНО: сырое тело, не express.json()
app.post('/oblodai/callback', express.raw({ type: '*/*' }), (req, res) => {
  const raw = req.body as Buffer;

  // Пробные тела (is_test) не подписаны
  const maybe = JSON.parse(raw.toString('utf8'));
  if (maybe.is_test) return res.send('ok');

  try {
    const event = constructWebhookEvent<WebhookEvent>(WEBHOOK_SECRET, raw, {
      timestamp: req.get('X-Webhook-Timestamp')!,
      signature: req.get('X-Webhook-Signature')!,
    }); // проверяет подпись И свежесть (replay-защита, окно 5 мин по умолчанию)

    if (event.type === 'payment' && event.status === 'paid') {
      // пометить заказ event.order_id оплаченным (идемпотентно по uuid + status)
    }
    res.send('ok');
  } catch (e) {
    if (e instanceof OblodaiSignatureError) return res.status(403).send('bad signature');
    throw e;
  }
});
```

## Обработка ошибок

Все ошибки API — экземпляры `OblodaiApiError` с машиночитаемым `.code`. Ветвитесь по коду.

```ts
import { OblodaiApiError } from '@oblodai-npm/sdk';

try {
  await client.payouts.create({
    amount: '25', currency: 'USDT', network: 'tron',
    address: 'T...', order_id: 'payout-1',
  });
} catch (e) {
  if (e instanceof OblodaiApiError) {
    if (e.code === 'payout.insufficient_funds') {
      // недостаточно средств
    } else if (e.code === 'payout.funds_maturing') {
      // средства ещё дозревают — терминальная ошибка (e.isRetriable === false):
      // не повторяйте вслепую, попробуйте позже
    }
    console.error(e.code, e.status, e.message);
  }
}
```

### Классы ошибок

| Класс | Когда |
|---|---|
| `OblodaiApiError` | API вернул конверт `error`. Есть `.code`, `.status`, `.isRetriable`. |
| `OblodaiConnectionError` | Сеть недоступна. |
| `OblodaiTimeoutError` | Истёк таймаут запроса. |
| `OblodaiSignatureError` | Не прошла проверка подписи вебхука. |
| `OblodaiError` | Базовый класс для всех выше. |

## Повторы (retry)

Временные ошибки (`5xx`, `429`, сетевые сбои) повторяются автоматически с экспоненциальным backoff
и джиттером. Ошибки запроса (`4xx`) и бизнес-ошибки (в т.ч. `payout.funds_maturing`) не повторяются.
На `429` SDK уважает заголовок `Retry-After` от сервера (даже если он больше `maxDelayMs`; потолок — 5 минут).

```ts
const client = new OblodaiClient({
  publicId: '...', secret: '...',
  retry: { maxAttempts: 4, initialDelayMs: 500, maxDelayMs: 30_000 },
  // retry: false — отключить
});
```

> **Важно про таймаут.** Таймаут не означает, что операция не прошла — и повтор всё равно безопасен.
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
> `/v1/payout/batch`, `/v1/transfer/to-personal`). У payout-ссылок (`payoutLinks.*`) он не действует —
> там дедупликация через per-link `reference`.

## Новое в v1.1.0

Требует обновлённого шлюза (заголовок `Idempotency-Key` и новые эндпоинты).

### Массовые операции — до 5000 элементов одним запросом

Одна отметка rate-limit вместо тысячи; обработка в фоне, прогресс — через `batches.info`:

```ts
const sub = await client.payments.createBatch(
  [
    { amount: '10', currency: 'USD', order_id: 'a-1', to_currency: 'USDT', network: 'tron' },
    { amount: '20', currency: 'EUR', order_id: 'a-2', to_currency: 'USDT', network: 'tron' },
  ],
  { onError: 'continue' }, // 'continue' (по умолчанию) или 'stop'
);
const info = await client.batches.info(sub.batch_id, { limit: 100 });
// info.status: pending → processing → completed; info.items[i].result / .error — по элементам
```

Аналогично: `payments.refundBatch([...])` (обязательны `reference` и `uuid|order_id` на элементе)
и `payouts.createBatch([...])` (обязателен `order_id` на элементе).

### Платёжные ссылки (донаты) — платят многие, каждый платёж свой инвойс

```ts
const link = await client.links.create({ amount_mode: 'open', currency: 'USD' }); // { link_id, url }
await client.links.toggle(link.link_id, false); // выключить
// Публичные (без подписи) — для страницы плательщика:
await client.links.publicGet(link.link_id);
await client.links.checkout(link.link_id, { amount: '5', payer_email: 'a@b.c' }); // → обычный платёж
```

### Сплит-платежи — доля каждого платежа уходит партнёру

```ts
await client.splits.splitToAddress('T...', 'tron', 10, 'партнёр А'); // внешний адрес, необратимо
await client.splits.splitToMerchant('m-42', 5);                      // аккаунт платформы, обратимо
await client.splits.setConfig(24); // окно удержания refund_hold_hours (защита возвратов)
```

### Счёт на e-mail и resolve недоплаты

```ts
await client.payments.sendEmail({ uuid: payment.uuid, email: 'buyer@example.com' });

// Недоплата (payment_status === 'wrong_amount'): оставить себе или вернуть (нужен payout-ключ)
await client.payments.resolve({ uuid: payment.uuid, action: 'accept' });
await client.payments.resolve({ uuid: payment.uuid, action: 'refund' }); // по умолчанию на адрес плательщика
```

### Payout-ссылки — «крипто-чеки»: выплата без знания кошелька получателя

```ts
const check = await client.payoutLinks.create({
  currency: 'USDT', network: 'tron', amount: '50',
  title: 'Бонус', email: 'user@example.com',
  expires_in_hours: 168, // задавайте явно: при 0/отсутствии окно клампится к 1 часу
});
// check.claim_url / check.claim_token — ТОЛЬКО в этом ответе, сохраните сразу.

// Получатель (публично, без подписи):
const details = await client.payoutLinks.claimInfo(token);          // { claimable, amount, ... }
await client.payoutLinks.claim(token, { address: 'T...' });         // → { status: 'claimed', payout_id }

// Мерчант: createBatch (до 500), list, info, cancel (funded-ссылка вернёт резерв).
```

Статусы payout-ссылки: `funded → claiming → claimed | expired | cancelled`. Дедупликация create —
per-link `reference` (заголовок `Idempotency-Key` на этих эндпоинтах не действует).

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
import { OblodaiClient } from '@oblodai-npm/sdk';

const client = new OblodaiClient({
  publicId: process.env.OBLODAI_TEST_PUBLIC_ID!, // test_...
  secret: process.env.OBLODAI_TEST_SECRET!,      // oblodai_test_...
});

// 1. Обычный код интеграции — создать счёт (ничего «тестового» в нём нет)
const payment = await client.payments.create({
  amount: '10', currency: 'USD', order_id: 'order-1',
  to_currency: 'USDT', network: 'tron',
});

// 2. Тестовый код — «покупатель заплатил он-чейн»
await client.sandbox.simulateDeposit({ invoice_id: payment.uuid });
// без amount — ровно сумма к оплате; amount меньше/больше — недо-/переплата
// confirmations: 2 — депозит придёт ещё pending (см. каверзы ниже)

// 3. Обычный код — дождаться статуса (или принять вебхук)
const info = await client.payments.info({ uuid: payment.uuid }); // → 'paid'

// 4. Начислить тестовый баланс (до 1000000 за вызов) и погонять выплату
await client.sandbox.faucet({ asset: 'USDT', amount: '1000' });
await client.payouts.create({
  amount: '25', currency: 'USDT', network: 'tron',
  address: 'T...', order_id: 'payout-1',
});

// Журнал вебхуков и повторная доставка:
const deliveries = await client.sandbox.listWebhooks(); // до 50, новые первыми
await client.sandbox.replayWebhook(deliveries[0]!.id);

// Начать с чистого листа: отменить открытые счета и обнулить балансы
await client.sandbox.reset(); // история операций сохраняется
```

Каверзы, о которых стоит знать:

- **Неглубокие подтверждения.** Депозит с малым `confirmations` приходит pending
  (`confirm_check`) и дозревает **через ~10 минут** — либо сразу: повторите `simulateDeposit`
  с **тем же `txid`** и бОльшим `confirmations`. Повтор того же `txid` — это же способ
  проверить идемпотентность вашей обработки.
- **UTXO-сети (Bitcoin и т.п.)** — как и в бою: **нет** авто-возврата переплаты и **нет** адреса
  плательщика, возврат требует явного `address`.

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

// Платёжные ссылки (v1.1.0; client.paymentLinks — синоним)
client.links.create({ amount_mode, currency, ... })
client.links.list({ limit, offset }) / info(linkId) / toggle(linkId, active)
client.links.publicGet(linkId) / checkout(linkId, { amount })   // публичные, без подписи

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
client.account.vrcs(enabled?)

// Вебхуки
client.webhooks.register(url)
client.webhooks.deliveries()
client.webhooks.testPayment({ url_callback })

// Настройки
client.settings.listAutoWithdraw() / setAutoWithdraw({...}) / deleteAutoWithdraw(currency)
client.settings.listAllowlist() / addAllowlist(cidr) / removeAllowlist(cidr) / enableAllowlist(bool)

// Курсы (публично, без ключа)
client.rates.list('ETH')

// Песочница (v1.2.0; ТОЛЬКО тестовый ключ, только тестовый код)
client.sandbox.simulateDeposit({ invoice_id, amount?, confirmations?, txid? })
client.sandbox.faucet({ asset, amount, idempotency_key? })
client.sandbox.reset()
client.sandbox.listWebhooks()          // подписанный GET
client.sandbox.replayWebhook(deliveryId)
```

## Конфигурация

```ts
interface OblodaiConfig {
  publicId: string;          // обязательно
  secret: string;            // обязательно
  baseUrl?: string;          // по умолчанию https://api.oblodai.com
  timeoutMs?: number;        // по умолчанию 30000
  retry?: RetryOptions | false;
  fetch?: typeof fetch;      // кастомный fetch
}
```

## Замечания

- **Суммы — строки** в единицах валюты (`"25.00"`), не числа. Так сохраняется точность.
- **Идемпотентность — заголовком `Idempotency-Key`** (с v1.1.0): SDK шлёт его сам на всех создающих
  вызовах, свой ключ — параметр `idempotency_key`. `order_id` — ваш бизнес-идентификатор (SDK его
  больше не подставляет); для выплат он обязателен всегда. У payout-ссылок дедупликация —
  per-link `reference`.
- **Секрет — только на сервере.** SDK серверный; не встраивайте ключ в браузер/мобильное приложение.
  Исключение — публичные методы (`rates.*`, `links.publicGet/checkout`, `payoutLinks.claimInfo/claim`):
  они не требуют ключа вовсе.

## Лицензия

MIT
