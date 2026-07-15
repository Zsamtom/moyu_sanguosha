import { describe, expect, it } from "vitest";
import { gameActionSchema } from "./room-schemas.js";

const playerId = "11111111-1111-4111-8111-111111111111";
const targetId = "22222222-2222-4222-8222-222222222222";

describe("gameActionSchema skill actions", () => {
  it("accepts supported active and conversion skill payloads", () => {
    expect(gameActionSchema.parse({
      type: "use_skill",
      playerId,
      skillId: "wusheng",
      cardIds: ["red-card"],
      targetId,
    })).toEqual({
      type: "use_skill",
      playerId,
      skillId: "wusheng",
      cardIds: ["red-card"],
      targetId,
    });

    expect(gameActionSchema.safeParse({
      type: "use_skill",
      playerId,
      skillId: "kurou",
    }).success).toBe(true);

    for (const skillId of ["zhiheng", "rende", "qingnang", "jieyin", "guose", "qingguo", "jijiu"] as const) {
      expect(gameActionSchema.safeParse({
        type: "use_skill",
        playerId,
        skillId,
        cardIds: skillId === "jieyin" ? ["first", "second"] : ["cost-card"],
        targetId,
      }).success).toBe(true);
    }

    expect(gameActionSchema.safeParse({
      type: "use_skill", playerId, skillId: "fanjian", targetId,
    }).success).toBe(true);
    expect(gameActionSchema.safeParse({
      type: "use_skill", playerId, skillId: "lijian", cardIds: ["cost"], targetIds: [targetId, playerId],
    }).success).toBe(true);
    expect(gameActionSchema.parse({
      type: "choose_fanjian_suit",
      playerId,
      suit: "heart",
      promptId: `skill:1:fanjian:${playerId}:0`,
    })).toMatchObject({ type: "choose_fanjian_suit", suit: "heart" });
    expect(gameActionSchema.parse({
      type: "invoke_lord_skill", playerId, skillId: "jijiang", targetId,
    })).toEqual({ type: "invoke_lord_skill", playerId, skillId: "jijiang", targetId });
    expect(gameActionSchema.parse({
      type: "resolve_lord_dispatch",
      playerId,
      promptId: `lord:1:hujia:${targetId}:${playerId}`,
      cardId: "dodge-card",
    })).toMatchObject({ type: "resolve_lord_dispatch", cardId: "dodge-card" });

    for (const skillId of ["luoyi", "keji", "yingzi", "biyue", "luoshen", "jizhi", "lianying", "xiaoji"] as const) {
      const promptId = skillId === "jizhi" || skillId === "lianying" || skillId === "xiaoji"
        ? `skill:1:${skillId}:${playerId}:0`
        : undefined;
      expect(gameActionSchema.parse({
        type: "resolve_skill",
        playerId,
        skillId,
        activate: true,
        ...(promptId ? { promptId } : {}),
      })).toEqual({
        type: "resolve_skill",
        playerId,
        skillId,
        activate: true,
        ...(promptId ? { promptId } : {}),
      });
    }

    expect(gameActionSchema.parse({
      type: "resolve_standard_skill",
      playerId,
      promptId: `standard:9:guanxing:${playerId}:guanxing_reorder`,
      activate: true,
      topCardIds: ["top-1", "top-2"],
      bottomCardIds: ["bottom-1"],
      allocations: [{ cardId: "viewed-1", targetId }],
      tokens: ["hand:0", "equipment:armor"],
    })).toMatchObject({
      type: "resolve_standard_skill",
      playerId,
      activate: true,
      topCardIds: ["top-1", "top-2"],
      bottomCardIds: ["bottom-1"],
    });
  });

  it("rejects unsupported skills and oversized skill costs", () => {
    expect(gameActionSchema.safeParse({
      type: "use_skill",
      playerId,
      skillId: "paoxiao",
    }).success).toBe(false);
    expect(gameActionSchema.safeParse({
      type: "use_skill",
      playerId,
      skillId: "zhiheng",
      cardIds: Array.from({ length: 201 }, (_, index) => `card-${index}`),
      targetId,
    }).success).toBe(false);
    expect(gameActionSchema.safeParse({
      type: "resolve_skill",
      playerId,
      skillId: "kurou",
      activate: true,
    }).success).toBe(false);
    expect(gameActionSchema.safeParse({
      type: "choose_fanjian_suit", playerId, suit: "joker", promptId: "stale",
    }).success).toBe(false);
    expect(gameActionSchema.safeParse({
      type: "invoke_lord_skill", playerId, skillId: "weidi",
    }).success).toBe(false);
    expect(gameActionSchema.safeParse({
      type: "resolve_lord_dispatch", playerId, promptId: "", cardId: "slash",
    }).success).toBe(false);
    expect(gameActionSchema.safeParse({
      type: "resolve_standard_skill", playerId, promptId: "", activate: true,
    }).success).toBe(false);
    expect(gameActionSchema.safeParse({
      type: "resolve_standard_skill", playerId, promptId: "standard:1", activate: true,
      tokens: ["judgment:0"],
    }).success).toBe(false);
    expect(gameActionSchema.safeParse({
      type: "resolve_standard_skill", playerId, promptId: "standard:1", activate: true,
      allocations: Array.from({ length: 3 }, (_, index) => ({ cardId: `card-${index}`, targetId })),
    }).success).toBe(false);
  });
});
