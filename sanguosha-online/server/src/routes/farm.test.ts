import { describe, expect, it } from "vitest";
import {
  farmActionEnvelopeSchema,
  farmVisitEnvelopeSchema,
} from "./farm.js";

describe("real-time farm HTTP schemas", () => {
  it("accepts account-scoped farming actions", () => {
    expect(farmActionEnvelopeSchema.parse({
      townId: "greenvale",
      expectedRevision: 4,
      action: {
        type: "farming_plant",
        cropId: "tomato",
        plotIndex: 2,
      },
    })).toEqual({
      townId: "greenvale",
      expectedRevision: 4,
      action: {
        type: "farming_plant",
        cropId: "tomato",
        plotIndex: 2,
      },
    });
    expect(farmActionEnvelopeSchema.parse({
      townId: "greenvale",
      expectedRevision: 5,
      action: {
        type: "farming_tend",
        care: "pest",
        plotIndex: 11,
      },
    })).toBeTruthy();
    expect(farmActionEnvelopeSchema.parse({
      townId: "greenvale",
      expectedRevision: 6,
      action: {
        type: "farming_clear_plot",
        plotIndex: 4,
      },
    })).toBeTruthy();
    expect(farmActionEnvelopeSchema.parse({
      townId: "greenvale",
      expectedRevision: 7,
      action: {
        type: "farming_redeem_mutation",
        cropId: "wheat",
        quantity: 1,
      },
    })).toBeTruthy();
  });

  it("rejects injected player ids and invalid quantities", () => {
    expect(() => farmActionEnvelopeSchema.parse({
      townId: "greenvale",
      expectedRevision: 0,
      action: {
        type: "farming_tend",
        care: "water",
        plotIndex: 0,
        playerId: "another-account",
      },
    })).toThrow();
    expect(() => farmActionEnvelopeSchema.parse({
      townId: "greenvale",
      expectedRevision: 0,
      action: {
        type: "farming_buy_seed",
        cropId: "wheat",
        quantity: 100,
      },
    })).toThrow();
  });

  it("requires both revisions for cross-account help and steal actions", () => {
    expect(farmVisitEnvelopeSchema.parse({
      townId: "greenvale",
      expectedRevision: 8,
      expectedNeighborRevision: 3,
      action: {
        type: "farming_steal",
        plotIndex: 0,
      },
    })).toEqual({
      townId: "greenvale",
      expectedRevision: 8,
      expectedNeighborRevision: 3,
      action: {
        type: "farming_steal",
        plotIndex: 0,
      },
    });
    expect(() => farmVisitEnvelopeSchema.parse({
      townId: "greenvale",
      expectedRevision: 8,
      action: {
        type: "farming_help",
        care: "weed",
        plotIndex: 0,
      },
    })).toThrow();
  });
});
