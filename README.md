# Oblodai SDK

Официальный TypeScript / Node.js SDK для платёжного шлюза **Oblodai**: приём платежей, выплаты,
статические кошельки, вебхуки. Подпись запросов, разбор ответов, типизированные ошибки и повторы — из
коробки.

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
      // средства ещё дозревают — временно, e.isRetriable === true
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

Временные ошибки (`5xx`, `429`, `payout.funds_maturing`, сетевые сбои) повторяются автоматически с
экспоненциальным backoff и джиттером. Ошибки запроса (`4xx`) не повторяются.

```ts
const client = new OblodaiClient({
  publicId: '...', secret: '...',
  retry: { maxAttempts: 4, initialDelayMs: 500, maxDelayMs: 30_000 },
  // retry: false — отключить
});
```

> **Важно про таймаут.** Таймаут не означает, что операция не прошла. Благодаря идемпотентности по
> `order_id` повтор безопасен: если выплата уже создана — вернётся она же, дубля не будет.

## Обзор методов

```ts
// Платежи
client.payments.create(params)
client.payments.info({ order_id })
client.payments.history({ limit, offset, status })
client.payments.services()
client.payments.qr({ order_id })
client.payments.resend({ order_id })
client.payments.refund({ order_id, address, amount })
client.payments.setAccepted([...]) / listAccepted()
client.payments.setDiscount({...}) / listDiscounts()
client.payments.setAccuracy({...}) / getAccuracy()
client.payments.setAutorefund({...}) / getAutorefund()

// Выплаты
client.payouts.create(params)
client.payouts.createMass([...])
client.payouts.info({ order_id })
client.payouts.history({...})
client.payouts.services()
client.payouts.calculate({...})
client.payouts.approve(uuid)
client.payouts.refund({...})
client.payouts.getFeeConfig() / setFeeConfig(bool)
client.payouts.getRefundFeeConfig() / setRefundFeeConfig(bool)

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
- **`order_id`/`reference` — ваш ключ идемпотентности.** Задавайте всегда для платежей и выплат.
- **Секрет — только на сервере.** SDK серверный; не встраивайте ключ в браузер/мобильное приложение.

## Лицензия

MIT
