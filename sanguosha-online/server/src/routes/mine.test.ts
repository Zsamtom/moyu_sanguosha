import { describe, expect, it } from "vitest";
import { mineActionEnvelopeSchema } from "./mine.js";

describe("mine HTTP schemas", () => {
  it("requires all three optimistic revisions", () => {
    expect(mineActionEnvelopeSchema.parse({
      expectedFarmRevision: 8,
      expectedRanchRevision: 5,
      expectedMineRevision: 2,
      action: {
        type: "mine_start",
        depositId: "coal",
        shaftIndex: 0,
      },
    })).toBeTruthy();
    expect(() => mineActionEnvelopeSchema.parse({
      expectedFarmRevision: 8,
      expectedMineRevision: 2,
      action: { type: "mine_collect", shaftIndex: 0 },
    })).toThrow();
  });

  it("rejects unsupported deposits, injected owners and invalid quantities", () => {
    expect(() => mineActionEnvelopeSchema.parse({
      expectedFarmRevision: 0,
      expectedRanchRevision: 0,
      expectedMineRevision: 0,
      action: {
        type: "mine_start",
        depositId: "diamond",
        shaftIndex: 0,
      },
    })).toThrow();
    expect(() => mineActionEnvelopeSchema.parse({
      expectedFarmRevision: 0,
      expectedRanchRevision: 0,
      expectedMineRevision: 0,
      action: {
        type: "mine_sell",
        depositId: "iron",
        quantity: 100,
        ownerId: "another-account",
      },
    })).toThrow();
  });
});
