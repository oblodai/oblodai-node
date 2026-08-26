import { describe, expect, it } from "vitest";
import {
  MAX_AMOUNT_LENGTH,
  addAmounts,
  amountEquals,
  compareAmounts,
  isValidAmount,
  isZeroAmount,
  subtractAmounts,
} from "../../src/helpers/money.js";
import { ConfigError } from "../../src/core/errors.js";

const ALL = [compareAmounts, amountEquals, addAmounts, subtractAmounts] as const;

describe("money helpers", () => {
  it("adds, subtracts and compares at the wider of the two scales", () => {
    expect(addAmounts("0.1", "0.2")).toBe("0.3");
    expect(addAmounts("10.000000", "0.5")).toBe("10.500000");
    expect(subtractAmounts("1", "1.000001")).toBe("-0.000001");
    expect(compareAmounts("9", "10")).toBe(-1); // NOT the lexicographic answer
    expect(compareAmounts("10", "9")).toBe(1);
    expect(amountEquals("1.50", "1.5")).toBe(true);
    expect(isZeroAmount("-0.000")).toBe(true);
  });

  it("keeps full precision far past a double", () => {
    const big = "123456789012345678901234567890.123456789012345678";
    expect(addAmounts(big, "0")).toBe(big);
    expect(compareAmounts(big, "123456789012345678901234567890.123456789012345679")).toBe(-1);
  });

  it("raises the SDK's amount error — never a native TypeError — on anything else", () => {
    const bad: unknown[] = [
      undefined,
      null,
      42,
      {},
      [],
      "",
      " 1",
      "1 ",
      "+1",
      ".5",
      "5.",
      "1.2.3",
      "1e3",
      "Infinity",
      "NaN",
      "1_000",
      "-",
      "--1",
      "0x10",
      "１",
    ];
    for (const v of bad) {
      for (const fn of ALL) {
        const err = (() => {
          try {
            (fn as (a: unknown, b: unknown) => unknown)(v, "1");
          } catch (e) {
            return e;
          }
        })();
        expect(err, `${fn.name}(${JSON.stringify(v)})`).toBeInstanceOf(ConfigError);
        expect((err as ConfigError).code).toBe("sdk.bad_amount");
      }
      expect(isValidAmount(v)).toBe(false);
    }
  });

  it("bounds the work: an absurdly long input is refused, not computed", () => {
    const long = "9".repeat(MAX_AMOUNT_LENGTH + 1);
    expect(isValidAmount(long)).toBe(false);
    const started = Date.now();
    expect(() => addAmounts(long, "1")).toThrow(/longer than 64/);
    expect(() => addAmounts("1." + "0".repeat(10_000_000), "1")).toThrow(ConfigError);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("accepts exactly the documented shape", () => {
    for (const v of ["0", "-0", "1", "-1", "0.5", "-0.5", "10.000000", "9".repeat(64)]) {
      expect(isValidAmount(v), v).toBe(true);
      expect(() => addAmounts(v, "0")).not.toThrow();
    }
  });
});
