/**
 * Amounts are decimal strings; never `parseFloat` them (USDT has 6 decimals, BTC 8, ETH 18).
 * These helpers compare and add at arbitrary precision using BigInt.
 */
const DECIMAL = /^-?\d+(\.\d+)?$/;

function parts(amount: string): { neg: boolean; int: string; frac: string } {
  if (!DECIMAL.test(amount)) throw new TypeError(`not a decimal amount: "${amount}"`);
  const neg = amount.startsWith("-");
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

/** -1, 0 or 1. */
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
