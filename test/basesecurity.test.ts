import { describe, it, expect } from 'vitest';
import { OblodaiClient } from '../src/client.js';

const CREDS = { publicId: 'test_pub', secret: 'oblodai_test_secret' };

function make(baseUrl?: string) {
  return () => new OblodaiClient({ ...CREDS, ...(baseUrl ? { baseUrl } : {}) });
}

describe('единые имена ресурсов: paymentLinks / links', () => {
  const client = new OblodaiClient({ ...CREDS, baseUrl: 'https://api.test' });

  it('client.links — ТОТ ЖЕ объект, что client.paymentLinks, а не вторая копия', () => {
    expect(client.paymentLinks).toBe(client.links);
  });

  it('оба имени дают полный набор методов ссылки', () => {
    for (const res of [client.paymentLinks, client.links]) {
      expect(typeof res.create).toBe('function');
      expect(typeof res.list).toBe('function');
      expect(typeof res.info).toBe('function');
      expect(typeof res.toggle).toBe('function');
      expect(typeof res.publicGet).toBe('function');
      expect(typeof res.checkout).toBe('function');
    }
  });

  it('payoutLinks — ДРУГОЙ ресурс, его не путать с paymentLinks', () => {
    expect(client.payoutLinks).not.toBe(client.paymentLinks);
  });
});

describe('baseUrl обязан быть https (кроме loopback)', () => {
  it('отвергает http:// на внешний хост — подпись ушла бы в открытый канал', () => {
    expect(make('http://api.oblodai.com')).toThrow(/https:\/\//);
    expect(make('http://api.oblodai.com')).toThrow(/oblodai:/);
  });

  it('в тексте ошибки объясняет причину и называет исключение — loopback', () => {
    let msg = '';
    try {
      make('http://gateway.example.com:8095')();
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain('X-Signature');
    expect(msg).toContain('localhost');
  });

  it('отвергает http:// на хост, лишь ПОХОЖИЙ на петлю', () => {
    // не петля: реальный внешний домен, который просто содержит слово localhost
    expect(make('http://localhost.attacker.com')).toThrow(/https:\/\//);
    // 127.0.0.1.example.com — тоже внешний хост, а не 127.0.0.0/8
    expect(make('http://127.0.0.1.example.com')).toThrow(/https:\/\//);
  });

  it('разрешает http:// на loopback — на нём живут локальные стенды', () => {
    // наш реальный стенд
    expect(make('http://localhost:8095')).not.toThrow();
    expect(make('http://127.0.0.1:8095')).not.toThrow();
    expect(make('http://[::1]:8095')).not.toThrow();
    // весь диапазон 127.0.0.0/8 — тоже петля
    expect(make('http://127.1.2.3:8095')).not.toThrow();
    // *.localhost резолвится в петлю по RFC 6761
    expect(make('http://core.localhost:8095')).not.toThrow();
  });

  it('разрешает https:// на любой хост', () => {
    expect(make('https://api.oblodai.com')).not.toThrow();
    expect(make('https://staging.example.com:8443')).not.toThrow();
    expect(make('https://localhost:8095')).not.toThrow();
  });

  it('умолчание (без baseUrl) — боевой https, проходит', () => {
    expect(make()).not.toThrow();
  });

  it('не ломается на завершающем слэше: он срезается ДО проверки схемы', () => {
    expect(make('https://api.oblodai.com/')).not.toThrow();
    expect(make('http://localhost:8095/')).not.toThrow();
    expect(make('http://api.oblodai.com/')).toThrow(/https:\/\//);
  });

  it('внятно сообщает о некорректном URL, а не падает разбором', () => {
    expect(make('не-урл-вовсе')).toThrow(/не является корректным URL/);
  });

  it('OblodaiClient.fromEnv тоже проверяет схему из OBLODAI_BASE_URL', () => {
    const saved = { ...process.env };
    try {
      process.env.OBLODAI_PUBLIC_ID = 'test_pub';
      process.env.OBLODAI_SECRET = 'oblodai_test_secret';
      process.env.OBLODAI_BASE_URL = 'http://api.oblodai.com';
      expect(() => OblodaiClient.fromEnv()).toThrow(/https:\/\//);

      process.env.OBLODAI_BASE_URL = 'http://localhost:8095';
      expect(() => OblodaiClient.fromEnv()).not.toThrow();
    } finally {
      process.env = saved;
    }
  });
});
