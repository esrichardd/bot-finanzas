import { describe, expect, it } from "vitest";

import { formatMoney, parseMoney } from "./money";

describe("formatMoney", () => {
  it("formats COP and USD with the active locale", () => {
    expect(formatMoney(123456, { code: "COP", decimals: 2 }, "es")).toBe(
      "1234,56 COP",
    );
    expect(formatMoney(123456, { code: "USD", decimals: 2 }, "en")).toBe(
      "1,234.56 USD",
    );
  });

  it("formats crypto with its configured decimals", () => {
    expect(formatMoney(123456789, { code: "BTC", decimals: 8 }, "en")).toBe(
      "1.23456789 BTC",
    );
  });
});

describe("parseMoney", () => {
  const cop = { code: "COP", decimals: 2 };

  it("parses both common thousands/decimal separator conventions", () => {
    expect(parseMoney("1.234,56", cop)).toBe(123456);
    expect(parseMoney("1,234.56", cop)).toBe(123456);
  });

  it("parses whole amounts and satoshis", () => {
    expect(parseMoney("500", cop)).toBe(50000);
    expect(parseMoney("0.00000001", { code: "BTC", decimals: 8 })).toBe(1);
  });

  it("rejects invalid and negative input", () => {
    expect(parseMoney("basura", cop)).toBeNull();
    expect(parseMoney("-10", cop)).toBeNull();
  });

  it("rounds excess decimal places", () => {
    expect(parseMoney("1.999", cop)).toBe(200);
  });
});
