import type { OblodaiLogger } from './types.js';

/**
 * Разрешение логгера SDK.
 *
 * Приоритет:
 *   1. явный `logger` из конфигурации — используется как есть (фильтрацию по уровню делает он сам);
 *   2. иначе переменная окружения `OBLODAI_LOG` = `debug|info|warn|error` — встроенный console-логгер
 *      с фильтром по этому уровню (guard `typeof process` для не-Node сред);
 *   3. иначе no-op (логирование выключено по умолчанию).
 *
 * БЕЗОПАСНОСТЬ: сюда попадают только безопасные поля (method/path/status/ms/attempt/delay/код ошибки).
 * Секреты, подписи, Authorization и тела запросов/ответов не логируются — это гарантируют вызывающие.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** No-op логгер: логирование выключено. */
const NOOP: OblodaiLogger = () => {
  /* logging disabled */
};

function isLogLevel(value: string | undefined): value is LogLevel {
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error';
}

/** Встроенный логгер поверх `console`, отфильтрованный по минимальному уровню `min`. */
function consoleLogger(min: LogLevel): OblodaiLogger {
  const threshold = LEVEL_ORDER[min];
  return (level, message, fields) => {
    if (LEVEL_ORDER[level] < threshold) return;
    const method =
      level === 'debug'
        ? console.debug
        : level === 'info'
          ? console.info
          : level === 'warn'
            ? console.warn
            : console.error;
    if (fields && Object.keys(fields).length > 0) {
      method(message, fields);
    } else {
      method(message);
    }
  };
}

/**
 * Возвращает эффективный логгер по правилам приоритета выше. Если `logger` задан — он и возвращается.
 */
export function resolveLogger(logger?: OblodaiLogger): OblodaiLogger {
  if (logger) return logger;
  if (typeof process !== 'undefined' && process.env) {
    const env = process.env.OBLODAI_LOG;
    if (isLogLevel(env)) return consoleLogger(env);
  }
  return NOOP;
}
