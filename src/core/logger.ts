/**
 * Minimal structured logger contract. Anything with debug/info/warn/error(msg, fields) fits
 * (pino, winston child loggers, console). Every field the SDK logs goes through `redact` first —
 * inside the transport, before the logger is called — so a caller-injected logger receives values
 * that are already scrubbed and a debug log never leaks a key, a signature or a cheque passcode.
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

const SENSITIVE = /secret|signature|passcode|token|authorization|password|api[-_]?key/i;

/**
 * Wrap a logger so its fields are redacted before it sees them. The SDK does this once, around the
 * logger the caller supplied: redaction that lives inside `consoleLogger` alone would protect only
 * the SDK's own logger and quietly leave a pino or winston user unprotected.
 */
export function redactingLogger(inner: Logger): Logger {
  return {
    debug: (m, f) => inner.debug(m, f && redact(f)),
    info: (m, f) => inner.info(m, f && redact(f)),
    warn: (m, f) => inner.warn(m, f && redact(f)),
    error: (m, f) => inner.error(m, f && redact(f)),
  };
}

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
