import type { GameAction, RoomRuleConfig } from "@sanguosha/shared";
import { describe, expect, it } from "vitest";
import {
  chooseGeneralPayloadSchema,
  chooseGeneralSchema,
  chooseGodFactionPayloadSchema,
  chooseGodFactionSchema,
  createRoomSchema,
  gameActionEnvelopeSchema,
  gameActionPayloadSchema,
  gameActionSchema,
  roomRuleConfigSchema,
} from "./room-schemas.js";

const playerId = "11111111-1111-4111-8111-111111111111";
const targetId = "22222222-2222-4222-8222-222222222222";
const targetIds = Array.from({ length: 10 }, (_, index) =>
  `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
);

const useSkillIds = [
  "wusheng", "longdan", "qixi", "kurou", "zhiheng", "rende",
  "qingnang", "jieyin", "guose", "qingguo", "jijiu", "fanjian", "lijian", "huangtian",
  "shuangxiong", "lianhuan", "huoji", "kanpo", "luanji", "qiangxi", "tianyi", "quhu",
  "luanwu", "dimeng", "jiuchi", "duanliang", "tiaoxin", "zhiba", "zhijian", "jixi",
  "wushen", "wuqian", "shenfen", "longhun", "yeyan", "gongxin", "jilue",
] as const satisfies readonly Extract<GameAction, { type: "use_skill" }>["skillId"][];

const ruleConfig: RoomRuleConfig = {
  ruleSetVersion: "original-66-v1",
  enabledGeneralPacks: ["standard", "wind", "god"],
  generalSelection: {
    mode: "choice",
    candidatesPerPlayer: 3,
    allowDuplicateGenerals: false,
  },
  deckProfile: "original-160",
  maximumReshuffles: 5,
  lordBonusMinimumPlayers: 5,
  godFactionChoice: true,
};

describe("room creation and draft schemas", () => {
  it("accepts an optional complete room config and rejects unknown or inconsistent fields", () => {
    expect(createRoomSchema.parse({ name: " 风包选将 ", maxPlayers: 8, ruleConfig })).toEqual({
      name: "风包选将",
      maxPlayers: 8,
      botIntelligence: 3,
      ruleConfig,
    });
    expect(createRoomSchema.parse({ name: "默认房" })).toEqual({ name: "默认房", botIntelligence: 3 });
    expect(createRoomSchema.parse({ name: "军师房", botIntelligence: 7 })).toMatchObject({ botIntelligence: 7 });
    expect(createRoomSchema.safeParse({ name: "越界房", botIntelligence: 8 }).success).toBe(false);

    expect(createRoomSchema.safeParse({ name: "房间", injected: true }).success).toBe(false);
    expect(createRoomSchema.safeParse({
      name: "房间",
      ruleConfig: { ...ruleConfig, injected: true },
    }).success).toBe(false);
    expect(createRoomSchema.safeParse({
      name: "房间",
      ruleConfig: {
        ...ruleConfig,
        generalSelection: { ...ruleConfig.generalSelection, injected: true },
      },
    }).success).toBe(false);
    expect(roomRuleConfigSchema.safeParse({
      ...ruleConfig,
      enabledGeneralPacks: ["standard", "standard"],
    }).success).toBe(false);
    expect(roomRuleConfigSchema.safeParse({
      ...ruleConfig,
      enabledGeneralPacks: ["wind"],
    }).success).toBe(false);
  });

  it("accepts only caller-owned general and God-faction selection fields", () => {
    const roomId = "33333333-3333-4333-8333-333333333333";
    expect(chooseGeneralSchema.parse({ generalId: "cao_cao" })).toEqual({ generalId: "cao_cao" });
    expect(chooseGodFactionSchema.parse({ faction: "shu" })).toEqual({ faction: "shu" });
    expect(chooseGeneralPayloadSchema.parse({ roomId, generalId: "shen_zhou_yu" })).toEqual({
      roomId,
      generalId: "shen_zhou_yu",
    });
    expect(chooseGodFactionPayloadSchema.parse({ roomId, faction: "qun" })).toEqual({ roomId, faction: "qun" });

    expect(chooseGeneralSchema.safeParse({ generalId: "cao_cao", playerId }).success).toBe(false);
    expect(chooseGeneralPayloadSchema.safeParse({ roomId, generalId: "cao_cao", playerId }).success).toBe(false);
    expect(chooseGodFactionSchema.safeParse({ faction: "wei", playerId }).success).toBe(false);
    expect(chooseGodFactionPayloadSchema.safeParse({ roomId, faction: "wei", playerId }).success).toBe(false);
    expect(chooseGeneralSchema.safeParse({ generalId: "not_a_general" }).success).toBe(false);
    expect(chooseGodFactionSchema.safeParse({ faction: "god" }).success).toBe(false);
  });
});

describe("gameActionSchema skill actions", () => {
  it("requires a strict revision and prompt envelope", () => {
    const roomId = "33333333-3333-4333-8333-333333333333";
    const envelope = {
      expectedRevision: 7,
      expectedPromptId: "game:7",
      action: { type: "end_play", playerId } as const,
    };

    expect(gameActionEnvelopeSchema.parse(envelope)).toEqual(envelope);
    expect(gameActionPayloadSchema.parse({ roomId, ...envelope })).toEqual({ roomId, ...envelope });
    expect(gameActionEnvelopeSchema.safeParse({ action: envelope.action }).success).toBe(false);
    expect(gameActionEnvelopeSchema.safeParse({ ...envelope, expectedRevision: -1 }).success).toBe(false);
    expect(gameActionEnvelopeSchema.safeParse({ ...envelope, expectedRevision: Number.MAX_SAFE_INTEGER + 1 }).success).toBe(false);
    expect(gameActionEnvelopeSchema.safeParse({ ...envelope, injected: true }).success).toBe(false);
    expect(gameActionPayloadSchema.safeParse({ roomId, ...envelope, injected: true }).success).toBe(false);
  });

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

    for (const skillId of ["zhiheng", "rende", "qingnang", "jieyin", "guose", "qingguo", "jijiu", "huangtian"] as const) {
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

    for (const skillId of ["luoyi", "keji", "yingzi", "biyue", "luoshen", "jizhi", "jilue", "lianying", "xiaoji", "buqu", "niepan"] as const) {
      const promptId = skillId === "buqu"
        ? "dying:1:buqu-entry"
        : skillId === "jizhi" || skillId === "lianying" || skillId === "xiaoji" || skillId === "niepan"
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

    expect(gameActionSchema.parse({
      type: "resolve_standard_skill",
      playerId,
      promptId: "damage:41",
      activate: true,
      cardId: "server-authorized-heart",
      targetId,
    })).toEqual({
      type: "resolve_standard_skill",
      playerId,
      promptId: "damage:41",
      activate: true,
      cardId: "server-authorized-heart",
      targetId,
    });

    expect(gameActionSchema.parse({
      type: "resolve_weapon",
      playerId,
      promptId: "damage:41",
      activate: true,
      tokens: ["equipment:offensive_horse"],
    })).toMatchObject({ type: "resolve_weapon", promptId: "damage:41", activate: true });
  });

  it("accepts every GameAction discriminant and every active skill id", () => {
    const actions: GameAction[] = [
      { type: "play_card", playerId, cardId: "slash", targetIds: [targetId] },
      { type: "respond", playerId, cardIds: ["first", "second"] },
      { type: "declare_guhuo", playerId, cardId: "hidden", declaredKind: "duel", targetIds: [targetId] },
      { type: "resolve_guhuo", playerId, promptId: "guhuo:1", challenge: true },
      { type: "choose_pindian_card", playerId, promptId: "pindian:1", cardId: "choice" },
      { type: "use_zhang_ba_slash", playerId, cardIds: ["first", "second"], targetId, targetIds: [targetId] },
      { type: "activate_armor", playerId, activate: true },
      { type: "end_play", playerId },
      { type: "discard", playerId, cardIds: ["discard"] },
      { type: "choose_zone_card", playerId, token: "server-authorized opaque token" },
      { type: "choose_hand_card", playerId, cardId: null },
      { type: "choose_amazing_grace_card", playerId, cardId: "grace" },
      { type: "use_skill", playerId, skillId: "longhun", cardIds: ["one", "two", "three", "four"] },
      { type: "invoke_lord_skill", playerId, skillId: "jijiang", targetIds: [targetId] },
      { type: "resolve_lord_dispatch", playerId, promptId: "lord:1", cardId: null },
      { type: "choose_fanjian_suit", playerId, promptId: "fanjian:1", suit: "heart" },
      { type: "resolve_skill", playerId, skillId: "jilue", activate: false },
      {
        type: "resolve_standard_skill",
        playerId,
        promptId: "standard:1",
        activate: true,
        viewAsSkillId: "longhun",
      },
      { type: "resolve_weapon", playerId, activate: false },
    ];

    for (const action of actions) expect(gameActionSchema.parse(action)).toEqual(action);
    for (const skillId of useSkillIds) {
      expect(gameActionSchema.safeParse({ type: "use_skill", playerId, skillId }).success).toBe(true);
    }
  });

  it("accepts authority-validated payloads up to bounded room and deck limits", () => {
    const cardIds = Array.from({ length: 200 }, (_, index) => `card-${index}`);
    expect(gameActionSchema.parse({
      type: "use_skill",
      playerId,
      skillId: "yeyan",
      cardIds,
      targetIds,
      allocations: targetIds.map((allocationTargetId, index) => ({
        targetId: allocationTargetId,
        damage: index + 1,
      })),
    })).toMatchObject({ type: "use_skill", skillId: "yeyan", cardIds, targetIds });
    expect(gameActionSchema.safeParse({
      type: "resolve_standard_skill",
      playerId,
      promptId: "standard:bulk",
      activate: true,
      cardIds,
      tokens: ["hand:future-format:opaque", "random-hand-token/v2"],
    }).success).toBe(true);
    expect(gameActionSchema.safeParse({ type: "discard", playerId, cardIds }).success).toBe(true);
    expect(gameActionSchema.safeParse({
      type: "resolve_weapon",
      playerId,
      activate: true,
      tokens: ["server-authorized:opaque"],
    }).success).toBe(true);
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
      tokens: [""],
    }).success).toBe(false);
    expect(gameActionSchema.safeParse({
      type: "resolve_standard_skill", playerId, promptId: "standard:1", activate: true,
      tokens: Array.from({ length: 11 }, () => "opaque"),
    }).success).toBe(false);
    expect(gameActionSchema.safeParse({
      type: "resolve_standard_skill", playerId, promptId: "standard:1", activate: true,
      allocations: Array.from({ length: 3 }, (_, index) => ({ cardId: `card-${index}`, targetId })),
    }).success).toBe(false);
    expect(gameActionSchema.safeParse({
      type: "resolve_weapon", playerId, promptId: "", activate: false,
    }).success).toBe(false);
    expect(gameActionSchema.safeParse({
      type: "declare_guhuo", playerId, cardId: "hidden", declaredKind: "unknown-card",
    }).success).toBe(false);
    expect(gameActionSchema.safeParse({
      type: "resolve_standard_skill", playerId, promptId: "standard:1", activate: true,
      viewAsSkillId: "guhuo",
    }).success).toBe(false);
    expect(gameActionSchema.safeParse({
      type: "play_card", playerId, cardId: "slash", targetIds: [...targetIds, targetId],
    }).success).toBe(false);
    expect(gameActionSchema.safeParse({
      type: "discard", playerId,
      cardIds: Array.from({ length: 201 }, (_, index) => `card-${index}`),
    }).success).toBe(false);
    expect(gameActionSchema.safeParse({
      type: "choose_zone_card", playerId, token: "x".repeat(241),
    }).success).toBe(false);
    expect(gameActionSchema.safeParse({
      type: "end_play", playerId, injected: true,
    }).success).toBe(false);
  });
});
