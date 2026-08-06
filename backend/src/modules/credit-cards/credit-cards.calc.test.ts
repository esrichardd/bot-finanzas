import { describe, expect, it } from "vitest";
import { availableCredit, creditBalance, creditUtilization, currentDebt, nextOccurrence } from "./credit-cards.calc.js";

describe("credit card calculations", () => {
  it("calculates debt from a negative balance", () => {
    expect(currentDebt(-350_000)).toBe(350_000);
    expect(currentDebt(0)).toBe(0);
    expect(currentDebt(25_000)).toBe(0);
  });

  it("calculates available credit without going below zero", () => {
    expect(availableCredit(2_000_000, -350_000)).toBe(1_650_000);
    expect(availableCredit(2_000_000, -2_500_000)).toBe(0);
  });

  it("calculates credit balance and real utilization", () => {
    expect(creditBalance(25_000)).toBe(25_000);
    expect(creditBalance(-25_000)).toBe(0);
    expect(creditUtilization(0, 2_000_000)).toBe(0);
    expect(creditUtilization(1_000_000, 2_000_000)).toBe(50);
    expect(creditUtilization(2_500_000, 2_000_000)).toBe(125);
  });

  it("calculates the next occurrence and clamps short months", () => {
    expect(nextOccurrence(25, "2026-07-15")).toBe("2026-07-25");
    expect(nextOccurrence(15, "2026-07-20")).toBe("2026-08-15");
    expect(nextOccurrence(15, "2026-07-15")).toBe("2026-07-15");
    expect(nextOccurrence(31, "2026-04-01")).toBe("2026-04-30");
    expect(nextOccurrence(30, "2026-02-15")).toBe("2026-02-28");
    expect(nextOccurrence(30, "2028-02-15")).toBe("2028-02-29");
    expect(nextOccurrence(30, "2026-12-31")).toBe("2027-01-30");
  });
});
