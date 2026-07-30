import { describe, expect, it } from "vitest";
import { computeBalance, deriveRate, signedAmount, type MovementType } from "./movements.calc.js";

describe("movement calculations", () => {
  it("applies the canonical sign to every movement type", () => {
    const positive: MovementType[] = ["income", "transfer_in", "adjustment_in"];
    const negative: MovementType[] = ["expense", "transfer_out", "adjustment_out"];

    for (const type of positive) expect(signedAmount(type, 125)).toBe(125);
    for (const type of negative) expect(signedAmount(type, 125)).toBe(-125);
  });

  it("computes mixed and negative balances", () => {
    expect(
      computeBalance([
        { type: "income", amount: 200_000 },
        { type: "expense", amount: 50_000 },
        { type: "adjustment_in", amount: 1_000 },
        { type: "transfer_out", amount: 25_000 },
      ]),
    ).toBe(126_000);
    expect(computeBalance([{ type: "expense", amount: 500 }])).toBe(-500);
    expect(computeBalance([])).toBe(0);
  });

  it("derives an FX rate without storing it", () => {
    expect(deriveRate(400_000, 10_000)).toBe(0.025);
  });
});
