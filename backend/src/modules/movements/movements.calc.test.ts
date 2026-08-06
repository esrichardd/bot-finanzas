import { describe, expect, it } from "vitest";
import {
  computeBalance,
  computeBalanceAdjustment,
  computeTransferBreakdown,
  deriveRate,
  signedAmount,
  type MovementType,
} from "./movements.calc.js";

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

  it("computes the single movement needed to reach a target balance", () => {
    expect(computeBalanceAdjustment(100, 150)).toEqual({
      type: "adjustment_in",
      amount: 50,
    });
    expect(computeBalanceAdjustment(100, 70)).toEqual({
      type: "adjustment_out",
      amount: 30,
    });
    expect(computeBalanceAdjustment(-100, 0)).toEqual({
      type: "adjustment_in",
      amount: 100,
    });
    expect(computeBalanceAdjustment(50, -25)).toEqual({
      type: "adjustment_out",
      amount: 75,
    });
    expect(computeBalanceAdjustment(0, 0)).toBeNull();
  });

  it("computes deducted, additional, and destination fees canonically", () => {
    expect(computeTransferBreakdown({
      amountFrom: 40_000,
      sameCurrency: true,
      fees: [
        { side: "source", mode: "deducted_from_amount", amount: 1_500 },
        { side: "source", mode: "charged_additionally", amount: 500 },
        { side: "destination", mode: "deducted_from_received", amount: 1_000 },
      ],
    })).toMatchObject({
      principalFrom: 38_500,
      grossDestination: 38_500,
      sourceDeductedFees: 1_500,
      sourceAdditionalFees: 500,
      destinationFees: 1_000,
      sourceTotalDebit: 40_500,
      destinationNetCredit: 37_500,
      rate: null,
    });
  });

  it("requires a destination amount for FX and rejects non-positive results", () => {
    expect(() => computeTransferBreakdown({ amountFrom: 10, sameCurrency: false, fees: [] }))
      .toThrow("TRANSFER_DESTINATION_AMOUNT_REQUIRED");
    expect(() => computeTransferBreakdown({
      amountFrom: 10,
      sameCurrency: true,
      fees: [{ side: "source", mode: "deducted_from_amount", amount: 10 }],
    })).toThrow("TRANSFER_SOURCE_FEES_EXCEED_AMOUNT");
  });
});
