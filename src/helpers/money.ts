import { ConfigError } from "../core/errors.js";

/**
 * Amounts are decimal strings; never `parseFloat` them (USDT has 6 decimals, BTC 8, ETH 18).
 * These helpers compare and add at arbitrary precision using BigInt.
 *
 * `Money` is a plain `string` in the type system, which means `a < b` compiles and is WRONG:
 * `"9" < "10"` is true lexicographically and false numerically. Always order amounts with
 * `compareAmounts`; never with `<`, `>`, `sort()` or `Math.max`.
 */

/** Longest amount accepted. Far beyond any asset's precision, and short enough to bound the work. */
export const MAX_AMOUNT_LENGTH = 64;

/**
 * Optional `-`, then digits, then at most one `.` followed by at least one digit. `.5`, `5.`,
 * `1e3`, `+1`, `1_000`, `Infinity` and `NaN` are all refused: every one of them is a place where a
 * caller thought they had a number and the wire would have carried something else.
 */
const DECIMAL = /^-?[0-9]+(\.[0-9]+)?$/;

/** Every rejection is one SDK error type — never a native TypeError from deep inside a helper. */
function badAmount(value: unknown, why: string): ConfigError {
  const shown = typeof value === "string" ? JSON.stringify(value.slice(0, 80)) : typeof value;
  return new ConfigError("sdk.bad_amount", `not a decimal amount (${why}): ${shown}`, "amount");
}

function parts(amount: string): { neg: boolean; int: string; frac: string } {
  if (typeof amount !== "string") throw badAmount(amount, "expected a string");
  if (amount.length === 0) throw badAmount(amount, "empty");
  if (amount.length > MAX_AMOUNT_LENGTH) {
    throw badAmount(amount, `longer than ${MAX_AMOUNT_LENGTH} characters`);
  }
  if (!DECIMAL.test(amount)) throw badAmount(amount, "expected digits with at most one dot");
  const neg = amount.charCodeAt(0) === 45; // "-"
  const [int = "0", frac = ""] = (neg ? amount.slice(1) : amount).split(".");
  return { neg, int, frac };
}

function scaled(amount: string, scale: number): bigint {
  const { neg, int, frac } = parts(amount);
  const v = BigInt(int + frac.padEnd(scale, "0"));
  return neg ? -v : v;
}

function scaleOf(...amounts: string[]): number {
  return Math.max(...amounts.map((a) => parts(a).frac.length));
}

function unscale(v: bigint, scale: number): string {
  const neg = v < 0n;
  const s = (neg ? -v : v).toString().padStart(scale + 1, "0");
  const int = s.slice(0, s.length - scale);
  const frac = s.slice(s.length - scale);
  return `${neg ? "-" : ""}${int}${scale ? `.${frac}` : ""}`;
}

/** -1, 0 or 1 — the only correct way to order two amounts. Throws `sdk.bad_amount` on a bad input. */
export function compareAmounts(a: string, b: string): -1 | 0 | 1 {
  const scale = scaleOf(a, b);
  const x = scaled(a, scale);
  const y = scaled(b, scale);
  return x < y ? -1 : x > y ? 1 : 0;
}

export function amountEquals(a: string, b: string): boolean {
  return compareAmounts(a, b) === 0;
}

export function addAmounts(a: string, b: string): string {
  const scale = scaleOf(a, b);
  return unscale(scaled(a, scale) + scaled(b, scale), scale);
}

export function subtractAmounts(a: string, b: string): string {
  const scale = scaleOf(a, b);
  return unscale(scaled(a, scale) - scaled(b, scale), scale);
}

export function isZeroAmount(a: string): boolean {
  return scaled(a, scaleOf(a)) === 0n;
}

/** True when `value` is an amount these helpers accept — a cheap guard before arithmetic. */
export function isValidAmount(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_AMOUNT_LENGTH &&
    DECIMAL.test(value)
  );
}
