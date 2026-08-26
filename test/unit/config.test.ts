import { describe, expect, it } from "vitest";
import { resolveConfig } from "../../src/config.js";
import {
  addAmounts,
  compareAmounts,
  isZeroAmount,
  subtractAmounts,
} from "../../src/helpers/money.js";
import { isPaymentFinal, isPaymentPaid, isPayoutFinal } from "../../src/helpers/status.js";

describe("config", () => {
  it("reads credentials and base URL from the environment", () => {
    const cfg = resolveConfig(
      {},
      { OBLODAI_PUBLIC_ID: "pk", OBLODAI_SECRET: "s", OBLODAI_BASE_URL: "https://x.test/" },
    );
    expect(cfg.credentials?.publicId).toBe("pk");
    expect(cfg.credentials?.secret).toBe("s");
    expect(cfg.baseUrl).toBe("https://x.test");
  });
  it("refuses plain http except for localhost or when allowed", () => {
    expect(() => resolveConfig({ baseUrl: "http://api.oblodai.com" }, {})).toThrow(/https/);
    expect(resolveConfig({ baseUrl: "http://localhost:8095" }, {}).baseUrl).toBe(
      "http://localhost:8095",
    );
    expect(
      resolveConfig({ baseUrl: "http://10.0.0.1", allowInsecureBaseUrl: true }, {}).baseUrl,
    ).toBe("http://10.0.0.1");
  });
  it("refuses half a key pair", () => {
    expect(() => resolveConfig({ publicId: "pk" }, {})).toThrow(/together/);
  });
});

describe("helpers", () => {
  it("money helpers work at arbitrary precision", () => {
    expect(addAmounts("0.1", "0.2")).toBe("0.3");
    expect(addAmounts("10.000000", "0.5")).toBe("10.500000");
    expect(subtractAmounts("1", "1.000001")).toBe("-0.000001");
    expect(compareAmounts("25", "25.000000")).toBe(0);
    expect(compareAmounts("0.000000000000000001", "0")).toBe(1);
    expect(isZeroAmount("0.000000")).toBe(true);
  });
  it("status helpers follow the core vocabulary", () => {
    expect(isPaymentPaid("paid_over")).toBe(true);
    expect(isPaymentPaid("wrong_amount")).toBe(false);
    expect(isPaymentFinal("confirm_check")).toBe(false);
    expect(isPayoutFinal("sent")).toBe(false);
    expect(isPayoutFinal("confirmed")).toBe(true);
  });
});
