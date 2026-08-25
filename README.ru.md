# Oblodai Node.js SDK

Официальный TypeScript/Node.js клиент платёжного шлюза [Oblodai](https://oblodai.com). Полное описание,
примеры и справочник — в [README.md](README.md) (английский). Кратко:

```ts
import { Oblodai } from "@oblodai-npm/sdk";
const oblodai = new Oblodai({ publicId: "pk_live_…", secret: "…" });
const invoice = await oblodai.payments.create({
  amount: "25",
  currency: "USDT",
  network: "tron",
  order_id: "order-1001",
});
```

- Node.js ≥ 18.17, ESM и CommonJS, без runtime-зависимостей.
- Покрыт весь мерчантский API; типы запросов и ответов сгенерированы из контракта шлюза (`contract/`).
- Ретраи по флагу `retryable` из ответа API, автоматические ключи идемпотентности, коррекция рассинхрона часов.
- Проверка подписи вебхуков: `import { verifyWebhook } from "@oblodai-npm/sdk/webhooks"`.

Миграция с 1.x: [MIGRATION-1.3.md](MIGRATION-1.3.md).
