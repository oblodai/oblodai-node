# Changelog

Значимые изменения этого пакета. Формат — [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/),
версии — [SemVer](https://semver.org/lang/ru/).

## [1.1.0] — 2026-07-15

### ⚠ ЛОМАЮЩЕЕ ИЗМЕНЕНИЕ: новая семантика идемпотентности

- **SDK больше НЕ подставляет автоматический `order_id`** (`idem-<uuid>`) в `payments.create` и
  `account.transferToPersonal`. `order_id` уходит на бэкенд ровно так, как передали вы; не задали —
  в операции его не будет. Если вы полагались на «order_id появится сам» — задавайте его явно.
- **Защита от дублей теперь — HTTP-заголовок `Idempotency-Key`** (требует обновлённого шлюза).
  На каждом создающем вызове SDK генерирует UUID ОДИН раз до цикла ретраев — все внутренние
  повторы (таймаут/5xx/сеть/429) уходят с одним и тем же ключом, бэкенд дедуплицирует и возвращает
  результат первой попытки. В подпись запроса заголовок не входит.
- **Свой ключ** — новый опциональный параметр `idempotency_key` в создающих вызовах
  (`payments.create/refund/createBatch/refundBatch/resolve`, `payouts.create/createMass/createBatch`,
  `account.transferToPersonal`): уходит в заголовок, НЕ в тело.
- Заголовок шлётся только на эндпоинты, обёрнутые идемпотентностью на бэкенде:
  `/v1/payment`, `/v1/payment/refund`, `/v1/payment/resolve`, `/v1/payment/batch`, `/v1/refund/batch`,
  `/v1/payout`, `/v1/payout/mass`, `/v1/payout/batch`, `/v1/transfer/to-personal`.
  На `/v1/payout/link*`, `/v1/payment/link*`, `/v1/split/*`, `/v1/payment/send-email` он не действует
  и не отправляется (у payout-ссылок дедуп — per-link `reference`).

### Добавлено

- **Массовые операции (батчи)** — до 5000 элементов одним подписанным запросом (одна отметка
  rate-limit): `payments.createBatch`, `payments.refundBatch`, `payouts.createBatch` + новый ресурс
  `client.batches.info(batch_id, { limit, offset })` для прогресса и результатов по элементам.
  Режим `onError: 'continue' | 'stop'`.
- **Платёжные ссылки** — `client.links` (синоним `client.paymentLinks`): `create`, `list`, `info`,
  `toggle` + публичные (без подписи) `publicGet(linkId)` и `checkout(linkId, params)`.
  Сумма fixed/open/range, закрепляемые валюта/сеть, бессрочность.
- **Сплит-платежи** — `client.splits`: `createRule`, удобные `splitToAddress`/`splitToMerchant`,
  `listRules`, `deleteRule`, `getConfig`/`setConfig` (окно удержания `refund_hold_hours`).
- **Счёт на e-mail** — `payments.sendEmail({ uuid | order_id, email? })` (лимит 10 писем/час на
  получателя).
- **Resolve недоплаты** — `payments.resolve({ uuid | order_id, action: 'accept' | 'refund' })`:
  оставить частичную оплату себе или вернуть плательщику (нужен payout-ключ).
- **Payout-ссылки («крипто-чеки»)** — `client.payoutLinks`: `create`, `createBatch` (до 500), `list`,
  `info`, `cancel` + ПУБЛИЧНЫЕ (без подписи) `claimInfo(token)` и `claim(token, { address, memo? })`.
  Средства резервируются без знания кошелька получателя; получатель забирает их по ссылке.
  Статусы: `funded → claiming → claimed / expired / cancelled`. Рекомендуется задавать
  `expires_in_hours` явно — при 0/отсутствии бэкенд клампит окно к 1 часу.
- **Новые поля платежа:** `payer_address`, `refunds[]`, `refund_status` (`none|partial|full`).
- Типы на все новые объекты (`BatchInfo`, `PaymentLink*`, `SplitRule`, `PayoutLink*`,
  `ResolveResult` и др.) экспортируются из корня пакета.

### Изменено

- `address` в возврате (`payments.refund` / `payouts.refund` / `refundBatch`) больше не обязателен —
  по умолчанию средства возвращаются на адрес плательщика (для Bitcoin/UTXO адрес по-прежнему нужен).

## [1.0.2] — 2026-07-12

### Исправлено
- **Авто-ключ идемпотентности больше не мутирует объект вызывающего.** `payments.create` и
  `account.transferToPersonal` теперь подставляют сгенерированный `order_id` в КОПИЮ параметров
  (`{ ...params, order_id }`), а не в исходный объект. Раньше переиспользование одного литерала
  параметров между двумя вызовами `create()` протекало первым `order_id` во второй вызов — и обе
  операции схлопывались в одну из-за дедупликации по `order_id` на бэкенде.
- **Нормализована проверка «пустого» `order_id`.** Автоключ подставляется, если `order_id` не является
  непустой строкой после `.trim()` — т.е. `undefined`, `null`, `''` и строки из одних пробелов
  теперь одинаково считаются отсутствующими. Стабильность ключа между повторами сохранена (тело
  строится один раз до цикла ретраев).

## [1.0.1] — 2026-07-12

### Исправлено
- **Безопасность денег: авто-ключ идемпотентности.** `payments.create` и `account.transferToPersonal`
  теперь подставляют стабильный `order_id` (`idem-<uuid>`) до отправки, если он не задан. Раньше
  автоматический повтор неидемпотентного `POST` (таймаут/5xx/сеть) мог создать дубль счёта/перевода —
  бэкенд дедуплицирует только по `order_id`. Выплаты (`payouts.*`) не затронуты — там `order_id`
  обязателен.
- **`Retry-After` больше не обрезается до `maxDelayMs`.** Серверную подсказку (напр. `Retry-After: 60`
  на 429) уважаем как есть; ограничиваем только абсолютным потолком 5 минут. `maxDelayMs` остаётся
  потолком лишь для собственного backoff.
- **`payout.funds_maturing` теперь терминальна** (`isRetriable === false`): это бизнес-состояние
  «средства дозревают», а не транспортный сбой — бессмысленно крутить повторы.

### Изменено
- `package.json`: `"sideEffects": false` (лучше tree-shaking); `@types/node` перенесён в
  `dependencies`, т.к. `Buffer` присутствует в публичной типовой поверхности. В пакет добавлен
  `.env.example`.

## [1.0.0] — 2026-07-12

### Добавлено
- Первый релиз официального TypeScript/Node.js SDK для платёжного шлюза Oblodai.
- Приём платежей, выплаты и массовые выплаты, статические кошельки, возвраты, вебхуки,
  публичные справочники (курсы валют, каталог монет и сетей).
- Подпись запросов HMAC-SHA256 и проверка подписи вебхуков (сравнение в постоянном времени,
  защита от replay).
- Конструктор из переменных окружения `OblodaiClient.fromEnv()` — `OBLODAI_PUBLIC_ID` / `OBLODAI_SECRET` /
  `OBLODAI_BASE_URL`.
- Автоматические повторы с экспоненциальным backoff и учётом заголовка `Retry-After` на 429.
