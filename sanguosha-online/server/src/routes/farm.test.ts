import { describe, expect, it } from "vitest";
import { farmActionEnvelopeSchema } from "./farm.js";

describe("farm action HTTP schema", () => {
  it("accepts the account-scoped client action envelope", () => {
    expect(farmActionEnvelopeSchema.parse({
      expectedRevision: 4,
      action: {
        type: "farm_plant",
        cropId: "tomato",
        plotIndex: 2,
      },
    })).toEqual({
      expectedRevision: 4,
      action: {
        type: "farm_plant",
        cropId: "tomato",
        plotIndex: 2,
      },
    });
  });

  it("rejects injected player ids and out-of-range quantities", () => {
    expect(() => farmActionEnvelopeSchema.parse({
      expectedRevision: 0,
      action: {
        type: "farm_water",
        playerId: "another-account",
      },
    })).toThrow();
    expect(() => farmActionEnvelopeSchema.parse({
      expectedRevision: 0,
      action: {
        type: "farm_buy_seed",
        cropId: "wheat",
        quantity: 21,
      },
    })).toThrow();
  });
});
