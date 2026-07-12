import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { signRequest } from '../src/signing.js';
import { verifyWebhook, constructWebhookEvent } from '../src/webhooks.js';
import { OblodaiSignatureError } from '../src/errors.js';

describe('signRequest', () => {
  it('строит каноническую строку timestamp\\nMETHOD\\npath\\nbody и подписывает HMAC-SHA256', () => {
    const secret = 'test_secret';
    const body = '{"amount":"25.00"}';
    const ts = '1700000000';

    const signed = signRequest(secret, 'POST', '/v1/payment', body, ts);

    const expected = crypto
      .createHmac('sha256', secret)
      .update(`1700000000\nPOST\n/v1/payment\n${body}`)
      .digest('hex');

    expect(signed.signature).toBe(expected);
    expect(signed.timestamp).toBe(ts);
    expect(signed.body).toBe(body);
  });

  it('генерирует timestamp, если не передан', () => {
    const before = Math.floor(Date.now() / 1000);
    const signed = signRequest('s', 'POST', '/v1/balance', '{}');
    const after = Math.floor(Date.now() / 1000);
    const ts = Number(signed.timestamp);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe('verifyWebhook', () => {
  const secret = 'wh_secret';

  function sign(ts: string, body: string): string {
    return crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  }

  it('принимает корректную подпись со свежим timestamp', () => {
    const ts = Math.floor(Date.now() / 1000).toString();
    const body = '{"type":"payment","status":"paid"}';
    const sig = sign(ts, body);

    expect(verifyWebhook(secret, body, { timestamp: ts, signature: sig })).toBe(true);
  });

  it('отклоняет неверную подпись', () => {
    const ts = Math.floor(Date.now() / 1000).toString();
    const body = '{"status":"paid"}';
    expect(() =>
      verifyWebhook(secret, body, { timestamp: ts, signature: 'deadbeef' }),
    ).toThrow(OblodaiSignatureError);
  });

  it('отклоняет устаревший вебхук (replay-защита)', () => {
    const oldTs = (Math.floor(Date.now() / 1000) - 3600).toString(); // час назад
    const body = '{"status":"paid"}';
    const sig = sign(oldTs, body);
    expect(() =>
      verifyWebhook(secret, body, { timestamp: oldTs, signature: sig }, { maxAgeSeconds: 300 }),
    ).toThrow(OblodaiSignatureError);
  });

  it('пропускает старый вебхук при maxAgeSeconds=0', () => {
    const oldTs = (Math.floor(Date.now() / 1000) - 3600).toString();
    const body = '{"status":"paid"}';
    const sig = sign(oldTs, body);
    expect(
      verifyWebhook(secret, body, { timestamp: oldTs, signature: sig }, { maxAgeSeconds: 0 }),
    ).toBe(true);
  });

  it('работает с Buffer в качестве сырого тела', () => {
    const ts = Math.floor(Date.now() / 1000).toString();
    const body = Buffer.from('{"status":"paid"}', 'utf8');
    const sig = crypto.createHmac('sha256', secret).update(Buffer.concat([Buffer.from(`${ts}.`), body])).digest('hex');
    expect(verifyWebhook(secret, body, { timestamp: ts, signature: sig })).toBe(true);
  });

  it('constructWebhookEvent возвращает распарсенный объект', () => {
    const ts = Math.floor(Date.now() / 1000).toString();
    const body = '{"type":"payment","status":"paid","uuid":"abc"}';
    const sig = sign(ts, body);
    const event = constructWebhookEvent<{ uuid: string; status: string }>(secret, body, {
      timestamp: ts,
      signature: sig,
    });
    expect(event.uuid).toBe('abc');
    expect(event.status).toBe('paid');
  });
});
