import { describe, expect, it } from "vitest";
import {
  applyAccumulatedProductionModifier,
  applyDiscreteProductionModifier,
  applyPriceModifier,
} from "../src/index.js";

describe("production and market modifiers", () => {
  it("makes small positive and negative modifiers visible", () => {
    expect(applyDiscreteProductionModifier(6, 15)).toBe(7);
    expect(applyDiscreteProductionModifier(6, -15)).toBe(5);
    expect(applyDiscreteProductionModifier(3, 5)).toBe(4);
    expect(applyDiscreteProductionModifier(3, -5)).toBe(2);
  });

  it("keeps unmodified and completed production deterministic", () => {
    expect(applyDiscreteProductionModifier(6, 0)).toBe(6);
    expect(applyDiscreteProductionModifier(3, 50)).toBe(5);
    expect(applyDiscreteProductionModifier(1, -100)).toBe(1);
    expect(applyDiscreteProductionModifier(0, 25)).toBe(0);
  });

  it("retains fractional yield in the backend across repeated cycles", () => {
    for (const [percent, expectedTotal] of [[15, 69], [-15, 51]] as const) {
      let remainder = 0;
      let total = 0;
      for (let cycle = 0; cycle < 10; cycle += 1) {
        const result = applyAccumulatedProductionModifier(
          6,
          percent,
          remainder,
        );
        total += result.quantity;
        remainder = result.remainder;
      }
      expect(total).toBe(expectedTotal);
      expect(remainder).toBe(0);
    }
  });

  it("keeps same-day price changes integer, bounded, and visible", () => {
    expect(applyPriceModifier(180, 15)).toBe(207);
    expect(applyPriceModifier(260, -15)).toBe(221);
    expect(applyPriceModifier(100, -100)).toBe(20);
    expect(applyPriceModifier(100, 300)).toBe(200);
  });
});
