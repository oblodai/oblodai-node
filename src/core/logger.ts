/**
 * Minimal structured logger contract. Anything with debug/info/warn/error(msg, fields) fits
 * (pino, winston child loggers, console). Field values that carry secrets are redacted before
 * they reach the logger, so a debug log never leaks a key, a signature or a cheque passcode.
 */
export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

export const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

/** Console logger gated by level; `OBLODAI_LOG=debug|info|warn|error` selects it from the env. */
export function consoleLogger(level: "debug" | "info" | "warn" | "error" = "warn"): Logger {
  const order = { debug: 0, info: 1, warn: 2, error: 3 } as const;
  const min = order[level];
  const emit = (lvl: keyof typeof order, message: string, fields?: LogFields) => {
    if (order[lvl] < min) return;
    const line = `[oblodai] ${lvl.toUpperCase()} ${message}`;
    const fn =
      lvl === "debug"
        ? console.debug
        : lvl === "info"
          ? console.info
          : lvl === "warn"
            ? console.warn
            : console.error;
    fields ? fn(line, redact(fields)) : fn(line);
  };
  return {
    debug: (m, f) => emit("debug", m, f),
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
  };
}

const SENSITIVE = /secret|signature|passcode|token|authorization|password/i;

/** Replace values of sensitive-looking keys, recursively, without touching the original object. */
export function redact<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redact) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(v);
    }
    return out as T;
  }
  return value;
}
