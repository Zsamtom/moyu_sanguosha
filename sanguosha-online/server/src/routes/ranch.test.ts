import { describe, expect, it } from "vitest";
import {
  ranchActionEnvelopeSchema,
  ranchVisitEnvelopeSchema,
} from "./ranch.js";

describe("ranch HTTP schemas", () => {
  it("requires both farm and ranch revisions for linked actions", () => {
    expect(ranchActionEnvelopeSchema.parse({
      expectedFarmRevision: 8,
      expectedRanchRevision: 3,
      action: {
        type: "ranch_buy_animal",
        animalId: "chicken",
        penIndex: 0,
      },
    })).toEqual({
      expectedFarmRevision: 8,
      expectedRanchRevision: 3,
      action: {
        type: "ranch_buy_animal",
        animalId: "chicken",
        penIndex: 0,
      },
    });
    expect(() => ranchActionEnvelopeSchema.parse({
      expectedRanchRevision: 3,
      action: { type: "ranch_feed", penIndex: 0 },
    })).toThrow();
    expect(ranchActionEnvelopeSchema.parse({
      expectedFarmRevision: 8,
      expectedRanchRevision: 3,
      action: {
        type: "ranch_move_animal",
        fromPenIndex: 0,
        toPenIndex: 1,
      },
    })).toBeTruthy();
    expect(ranchActionEnvelopeSchema.parse({
      expectedFarmRevision: 8,
      expectedRanchRevision: 3,
      action: {
        type: "ranch_sell_animal",
        penIndex: 1,
      },
    })).toBeTruthy();
  });

  it("rejects injected owners, unsupported animals and invalid quantities", () => {
    expect(() => ranchActionEnvelopeSchema.parse({
      expectedFarmRevision: 0,
      expectedRanchRevision: 0,
      action: {
        type: "ranch_buy_animal",
        animalId: "horse",
        penIndex: 0,
      },
    })).toThrow();
    expect(() => ranchActionEnvelopeSchema.parse({
      expectedFarmRevision: 0,
      expectedRanchRevision: 0,
      action: {
        type: "ranch_sell",
        productId: "egg",
        quantity: 100,
        ownerId: "another-account",
      },
    })).toThrow();
  });

  it("requires both ranch revisions for cross-account actions", () => {
    expect(ranchVisitEnvelopeSchema.parse({
      expectedRanchRevision: 4,
      expectedNeighborRevision: 9,
      action: {
        type: "ranch_neighbor_collect",
        penIndex: 2,
      },
    })).toBeTruthy();
    expect(() => ranchVisitEnvelopeSchema.parse({
      expectedRanchRevision: 4,
      action: { type: "ranch_help", penIndex: 2 },
    })).toThrow();
  });
});
