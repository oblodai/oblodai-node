/**
 * Keeping secrets out of logs. A merchant's API secret, a webhook signing secret and a cheque's
 * claim token are all one `console.log` away from a log aggregator, and the two paths that get them
 * there are the same two everywhere: `JSON.stringify` (structured loggers) and `util.inspect`
 * (`console.log` of an object, REPL, error dumps). Everything the SDK hands back or holds on to that
 * carries such a value is passed through here, so the value stays readable as a property and
 * unreadable in every automatic rendering of the object.
 */
export const REDACTED = "[redacted]";

/** Node's well-known custom-inspect symbol, referenced without importing `node:util`. */
export const INSPECT_CUSTOM = Symbol.for("nodejs.util.inspect.custom");

/**
 * Hide the named fields from enumeration, JSON and inspection, keeping them readable as properties.
 * Fields that are absent are left absent — an optional `secret` the core did not send does not
 * suddenly appear as "[redacted]".
 */
export function protectSecrets<T extends object>(value: T, fields: readonly string[]): T {
  if (value === null || typeof value !== "object") return value;
  const hidden: string[] = [];
  for (const f of fields) {
    if (!Object.prototype.hasOwnProperty.call(value, f)) continue;
    const v = (value as Record<string, unknown>)[f];
    if (v === undefined) continue;
    Object.defineProperty(value, f, {
      value: v,
      enumerable: false,
      writable: true,
      configurable: true,
    });
    hidden.push(f);
  }
  if (hidden.length === 0) return value;
  defineHidden(value, "toJSON", function toJSON(this: Record<string, unknown>) {
    return withPlaceholders(this, hidden);
  });
  defineHidden(value, INSPECT_CUSTOM, function inspect(this: Record<string, unknown>) {
    return withPlaceholders(this, hidden);
  });
  return value;
}

function withPlaceholders(
  value: Record<string, unknown>,
  hidden: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...value };
  for (const f of hidden) out[f] = REDACTED;
  return out;
}

/** Attach a non-enumerable member so it never shows up in a spread, a key list or a JSON dump. */
export function defineHidden(target: object, key: string | symbol, value: unknown): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: false,
    writable: true,
    configurable: true,
  });
}

/**
 * A summary object that says what a client/transport is pointed at and nothing about how it proves
 * who it is. Used as both the `toJSON` and the custom-inspect rendering of the SDK's own objects.
 */
export function describeCredential(publicId: string | undefined): string {
  return publicId ? `${publicId} (secret ${REDACTED})` : "none";
}

/**
 * Response fields that carry a credential: a webhook signing secret, a freshly minted API secret,
 * a payout link's claim token, the claim URL that embeds it, and its passcode.
 */
export const SECRET_RESPONSE_FIELDS: readonly string[] = [
  "secret",
  "claim_token",
  "claim_url",
  "passcode",
];

/**
 * Hide every {@link SECRET_RESPONSE_FIELDS} string anywhere in a decoded response, in place:
 * still readable as properties, gone from JSON and inspect renderings.
 */
export function protectResponseSecrets<T>(value: T, depth = 0): T {
  if (depth > 32 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    for (const item of value) protectResponseSecrets(item, depth + 1);
    return value;
  }
  const record = value as Record<string, unknown>;
  const present: string[] = [];
  for (const [key, item] of Object.entries(record)) {
    if (SECRET_RESPONSE_FIELDS.includes(key) && typeof item === "string") present.push(key);
    else protectResponseSecrets(item, depth + 1);
  }
  if (present.length) protectSecrets(record, present);
  return value;
}
