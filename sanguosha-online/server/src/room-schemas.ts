import {
  CARD_DEFINITIONS,
  FULL_GENERAL_IDS,
  FULL_GENERAL_PACKS,
  validateRoomRuleConfig,
  type DoudizhuAction,
  type GameAction,
  type GoujiAction,
} from "@sanguosha/shared";
import { z } from "zod";
import { DEFAULT_BOT_INTELLIGENCE } from "./bot-intelligence.js";

export const roomIdSchema = z.string().uuid();
const botIntelligenceSchema = z.union([
  z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7),
]);

export const roomRuleConfigSchema = z.object({
  ruleSetVersion: z.literal("original-66-v1"),
  enabledGeneralPacks: z.array(z.enum(FULL_GENERAL_PACKS)).min(1).max(FULL_GENERAL_PACKS.length),
  generalSelection: z.object({
    mode: z.enum(["choice", "random"]),
    candidatesPerPlayer: z.number().int().min(1).max(10),
    allowDuplicateGenerals: z.boolean(),
  }).strict(),
  deckProfile: z.literal("original-160"),
  maximumReshuffles: z.number().int().min(0).max(100),
  lordBonusMinimumPlayers: z.number().int().min(2).max(10),
  godFactionChoice: z.boolean(),
}).strict().superRefine((config, context) => {
  try {
    validateRoomRuleConfig(config);
  } catch (error) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : "Invalid room rule configuration",
    });
  }
});

export const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(40),
  gameType: z.enum(["sanguosha", "gouji", "doudizhu"]).optional(),
  maxPlayers: z.number().int().min(2).max(10).optional(),
  botIntelligence: botIntelligenceSchema.default(DEFAULT_BOT_INTELLIGENCE),
  botMode: z.enum(["rules", "llm"]).default("rules"),
  ruleConfig: roomRuleConfigSchema.optional(),
}).strict().superRefine((input, context) => {
  if (input.gameType === "gouji" && input.maxPlayers !== undefined && input.maxPlayers !== 6) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maxPlayers"],
      message: "够级固定为 6 人",
    });
  }
  if (input.gameType === "doudizhu" && input.maxPlayers !== undefined && input.maxPlayers !== 3) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maxPlayers"],
      message: "斗地主固定为 3 人",
    });
  }
  if (input.botMode === "llm" && input.gameType === "gouji") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["botMode"],
      message: "LLM bot mode is not available for Gouji rooms",
    });
  }
});

const generalIdSchema = z.enum(FULL_GENERAL_IDS);
const playableFactionSchema = z.enum(["wei", "shu", "wu", "qun"]);

export const chooseGeneralSchema = z.object({ generalId: generalIdSchema }).strict();
export const chooseGodFactionSchema = z.object({ faction: playableFactionSchema }).strict();
export const chooseGeneralPayloadSchema = chooseGeneralSchema.extend({ roomId: roomIdSchema }).strict();
export const chooseGodFactionPayloadSchema = chooseGodFactionSchema.extend({ roomId: roomIdSchema }).strict();

export const readySchema = z.object({ ready: z.boolean() });
export const chatMessageSchema = z.object({
  message: z.string().trim().min(1).max(200),
}).strict();
export const chatMessagePayloadSchema = chatMessageSchema.extend({
  roomId: roomIdSchema,
}).strict();

const playerId = z.string().uuid();
const cardId = z.string().min(1).max(100);
const promptId = z.string().min(1).max(240);
const opaqueToken = z.string().min(1).max(240);
const targetIds = z.array(playerId).max(10);
const cardIds = z.array(cardId).max(200);
const cardKind = z.enum(Object.keys(CARD_DEFINITIONS) as [
  keyof typeof CARD_DEFINITIONS,
  ...(keyof typeof CARD_DEFINITIONS)[],
]);

type UseSkillId = Extract<GameAction, { readonly type: "use_skill" }>["skillId"];
const useSkillIds = [
  "wusheng", "longdan", "qixi", "kurou", "zhiheng", "rende",
  "qingnang", "jieyin", "guose", "qingguo", "jijiu", "fanjian", "lijian", "huangtian",
  "shuangxiong", "lianhuan", "huoji", "kanpo", "luanji", "qiangxi", "tianyi", "quhu",
  "luanwu", "dimeng", "jiuchi", "duanliang", "tiaoxin", "zhiba", "zhijian", "jixi",
  "wushen", "wuqian", "shenfen", "longhun", "yeyan", "gongxin", "jilue",
] as const satisfies readonly UseSkillId[];

type ResolveSkillId = Extract<GameAction, { readonly type: "resolve_skill" }>["skillId"];
const resolveSkillIds = [
  "luoyi", "keji", "yingzi", "biyue", "luoshen", "jizhi", "jilue", "lianying", "xiaoji", "buqu", "niepan",
] as const satisfies readonly ResolveSkillId[];

const strictObject = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape).strict();

const parsedGameActionSchema = z.discriminatedUnion("type", [
  strictObject({
    type: z.literal("play_card"),
    playerId,
    cardId,
    targetId: playerId.optional(),
    targetIds: targetIds.optional(),
  }),
  strictObject({
    type: z.literal("respond"),
    playerId,
    cardId: cardId.nullish(),
    cardIds: z.array(cardId).length(2).optional(),
  }),
  strictObject({
    type: z.literal("declare_guhuo"),
    playerId,
    cardId,
    declaredKind: cardKind,
    targetId: playerId.optional(),
    targetIds: targetIds.optional(),
  }),
  strictObject({
    type: z.literal("resolve_guhuo"),
    playerId,
    promptId,
    challenge: z.boolean(),
  }),
  strictObject({
    type: z.literal("choose_pindian_card"),
    playerId,
    promptId,
    cardId,
  }),
  strictObject({
    type: z.literal("use_skill"),
    playerId,
    skillId: z.enum(useSkillIds),
    cardIds: cardIds.optional(),
    targetId: playerId.optional(),
    targetIds: targetIds.optional(),
    allocations: z.array(strictObject({
      targetId: playerId,
      damage: z.number().int().min(1).max(10),
    })).max(10).optional(),
  }),
  strictObject({
    type: z.literal("invoke_lord_skill"),
    playerId,
    skillId: z.enum(["hujia", "jijiang"]),
    targetId: playerId.optional(),
    targetIds: targetIds.optional(),
  }),
  strictObject({
    type: z.literal("resolve_lord_dispatch"),
    playerId,
    promptId,
    cardId: cardId.nullish(),
  }),
  strictObject({
    type: z.literal("choose_fanjian_suit"),
    playerId,
    suit: z.enum(["spade", "heart", "club", "diamond"]),
    promptId,
  }),
  strictObject({
    type: z.literal("resolve_skill"),
    playerId,
    skillId: z.enum(resolveSkillIds),
    activate: z.boolean(),
    promptId: promptId.optional(),
  }),
  strictObject({
    type: z.literal("resolve_standard_skill"),
    playerId,
    promptId,
    activate: z.boolean(),
    cardId: cardId.optional(),
    cardIds: cardIds.optional(),
    targetId: playerId.optional(),
    targetIds: targetIds.optional(),
    tokens: z.array(opaqueToken).max(10).optional(),
    topCardIds: z.array(cardId).max(5).optional(),
    bottomCardIds: z.array(cardId).max(5).optional(),
    allocations: z.array(strictObject({ cardId, targetId: playerId })).max(2).optional(),
    viewAsSkillId: z.enum(["wusheng", "longdan", "wushen", "longhun", "zhang_ba_she_mao"]).optional(),
  }),
  strictObject({
    type: z.literal("use_zhang_ba_slash"),
    playerId,
    cardIds: z.array(cardId).length(2),
    targetId: playerId,
    targetIds: targetIds.optional(),
  }),
  strictObject({
    type: z.literal("activate_armor"),
    playerId,
    activate: z.boolean(),
  }),
  strictObject({
    type: z.literal("resolve_weapon"),
    playerId,
    promptId: promptId.optional(),
    activate: z.boolean(),
    cardIds: z.array(cardId).max(2).optional(),
    tokens: z.array(opaqueToken).max(1).optional(),
  }),
  strictObject({
    type: z.literal("end_play"),
    playerId,
  }),
  strictObject({
    type: z.literal("discard"),
    playerId,
    cardIds,
  }),
  strictObject({
    type: z.literal("choose_zone_card"),
    playerId,
    token: opaqueToken,
  }),
  strictObject({
    type: z.literal("choose_hand_card"),
    playerId,
    cardId: cardId.nullish(),
  }),
  strictObject({
    type: z.literal("choose_amazing_grace_card"),
    playerId,
    cardId,
  }),
]);

export const gameActionSchema = parsedGameActionSchema.transform((action): GameAction => action);

export const goujiActionSchema = z.discriminatedUnion("type", [
  strictObject({
    type: z.literal("gouji_play"),
    playerId,
    cardIds: z.array(cardId).min(1).max(40),
  }),
  strictObject({
    type: z.literal("gouji_pass"),
    playerId,
  }),
  strictObject({
    type: z.literal("gouji_yield"),
    playerId,
  }),
]).transform((action): GoujiAction => action);

export const doudizhuActionSchema = z.discriminatedUnion("type", [
  strictObject({
    type: z.literal("doudizhu_bid"),
    playerId,
    score: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  }),
  strictObject({
    type: z.literal("doudizhu_play"),
    playerId,
    cardIds: z.array(cardId).min(1).max(20),
  }),
  strictObject({
    type: z.literal("doudizhu_pass"),
    playerId,
  }),
]).transform((action): DoudizhuAction => action);

export const gameActionEnvelopeSchema = z.object({
  expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  expectedPromptId: promptId,
  action: z.union([gameActionSchema, goujiActionSchema, doudizhuActionSchema]),
}).strict();

export const gameActionPayloadSchema = gameActionEnvelopeSchema.extend({ roomId: roomIdSchema }).strict();
