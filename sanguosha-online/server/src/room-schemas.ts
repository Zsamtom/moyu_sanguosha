import { z } from "zod";

export const roomIdSchema = z.string().uuid();

export const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(40),
  maxPlayers: z.number().int().min(2).max(10).optional(),
});

export const readySchema = z.object({ ready: z.boolean() });

const playerId = z.string().uuid();
const cardId = z.string().min(1).max(100);

export const gameActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("play_card"),
    playerId,
    cardId,
    targetId: playerId.optional(),
    targetIds: z.array(playerId).max(3).optional(),
  }),
  z.object({
    type: z.literal("respond"),
    playerId,
    cardId: cardId.nullish(),
    cardIds: z.array(cardId).length(2).optional(),
  }),
  z.object({
    type: z.literal("use_skill"),
    playerId,
    skillId: z.enum([
      "wusheng", "longdan", "qixi", "kurou", "zhiheng", "rende",
      "qingnang", "jieyin", "guose", "qingguo", "jijiu", "fanjian", "lijian",
    ]),
    cardIds: z.array(cardId).max(200).optional(),
    targetId: playerId.optional(),
    targetIds: z.array(playerId).max(3).optional(),
  }),
  z.object({
    type: z.literal("invoke_lord_skill"),
    playerId,
    skillId: z.enum(["hujia", "jijiang"]),
    targetId: playerId.optional(),
  }),
  z.object({
    type: z.literal("resolve_lord_dispatch"),
    playerId,
    promptId: z.string().min(1).max(240),
    cardId: cardId.nullish(),
  }),
  z.object({
    type: z.literal("choose_fanjian_suit"),
    playerId,
    suit: z.enum(["spade", "heart", "club", "diamond"]),
    promptId: z.string().min(1).max(240),
  }),
  z.object({
    type: z.literal("resolve_skill"),
    playerId,
    skillId: z.enum(["luoyi", "keji", "yingzi", "biyue", "luoshen", "jizhi", "lianying", "xiaoji"]),
    activate: z.boolean(),
    promptId: z.string().min(1).max(240).optional(),
  }),
  z.object({
    type: z.literal("resolve_standard_skill"),
    playerId,
    promptId: z.string().min(1).max(240),
    activate: z.boolean(),
    cardId: cardId.optional(),
    cardIds: z.array(cardId).max(10).optional(),
    targetId: playerId.optional(),
    targetIds: z.array(playerId).max(10).optional(),
    tokens: z.array(z.string().regex(/^(hand:\d+|equipment:(weapon|armor|offensive_horse|defensive_horse))$/).max(80)).max(10).optional(),
    topCardIds: z.array(cardId).max(5).optional(),
    bottomCardIds: z.array(cardId).max(5).optional(),
    allocations: z.array(z.object({ cardId, targetId: playerId })).max(2).optional(),
  }),
  z.object({
    type: z.literal("use_zhang_ba_slash"),
    playerId,
    cardIds: z.array(cardId).length(2),
    targetId: playerId,
  }),
  z.object({
    type: z.literal("activate_armor"),
    playerId,
    activate: z.boolean(),
  }),
  z.object({
    type: z.literal("resolve_weapon"),
    playerId,
    activate: z.boolean(),
    cardIds: z.array(cardId).max(2).optional(),
    tokens: z.array(z.string().regex(/^(hand:\d+|equipment:(weapon|armor|offensive_horse|defensive_horse))$/).max(80)).max(1).optional(),
  }),
  z.object({
    type: z.literal("end_play"),
    playerId,
  }),
  z.object({
    type: z.literal("discard"),
    playerId,
    cardIds: z.array(cardId).max(20),
  }),
  z.object({
    type: z.literal("choose_zone_card"),
    playerId,
    token: z.string().regex(/^(hand:\d+|equipment:(weapon|armor|offensive_horse|defensive_horse)|judgment:\d+)$/).max(80),
  }),
  z.object({
    type: z.literal("choose_hand_card"),
    playerId,
    cardId: cardId.nullish(),
  }),
  z.object({
    type: z.literal("choose_amazing_grace_card"),
    playerId,
    cardId,
  }),
]);
