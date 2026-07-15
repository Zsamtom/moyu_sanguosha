import type { Pool } from "pg";
import { z } from "zod";
import {
  FULL_GENERAL_IDS,
  FULL_SKILL_RULE_IDS,
  assertJudgmentFrame,
  assertCompleteRulesEngineState,
  decodeGameDamageContinuation,
  migrateCompleteRulesEngineState,
  getGeneralDefinition,
  type CompleteRulesEngineState,
} from "@sanguosha/shared";
import type { RoomServiceSnapshot } from "./rooms.js";

const playerIdSchema = z.string().uuid();
const generalIdSchema = z.enum(FULL_GENERAL_IDS);
const generalSkillIdSchema = z.enum(FULL_SKILL_RULE_IDS);
const nonnegativeSafeIntegerSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positiveSafeIntegerSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const cardKindSchema = z.enum([
  "slash",
  "fire_slash",
  "thunder_slash",
  "dodge",
  "peach",
  "wine",
  "ex_nihilo",
  "duel",
  "barbarian_invasion",
  "arrow_barrage",
  "peach_garden",
  "chi_tu", "da_wan", "zi_xing", "di_lu", "hua_liu", "jue_ying", "zhua_huang_fei_dian",
  "zhu_ge_lian_nu", "gu_ding_dao", "ci_xiong_shuang_gu_jian", "han_bing_jian",
  "qing_long_yan_yue_dao", "zhang_ba_she_mao", "guan_shi_fu", "fang_tian_hua_ji",
  "zhu_que_yu_shan", "qi_lin_gong",
  "ren_wang_dun", "teng_jia", "bai_yin_shi_zi", "ba_gua_zhen", "qing_gang_jian",
  "le_bu_si_shu", "bing_liang_cun_duan", "shan_dian",
  "wu_xie_ke_ji",
  "guo_he_chai_qiao", "shun_shou_qian_yang",
  "fire_attack", "amazing_grace", "borrowed_sword", "iron_chain",
]);
const cardSchema = z.object({
  id: z.string().min(1).max(80),
  kind: cardKindSchema,
  // These fields were added without changing the v1 snapshot version. Keep
  // them optional so rooms created by the previous production build migrate.
  name: z.string().min(1).max(20).optional(),
  category: z.enum(["basic", "trick", "equipment"]).optional(),
  suit: z.enum(["spade", "heart", "club", "diamond"]).optional(),
  rank: z.number().int().min(1).max(13).optional(),
});
const completeRulesStateSchema = z.custom<CompleteRulesEngineState>((value) => {
  try {
    assertCompleteRulesEngineState(value);
    return true;
  } catch {
    return false;
  }
}, "Invalid complete-rules engine state");
const gamePlayerSchema = z.object({
  id: playerIdSchema,
  seat: z.number().int().min(0).max(9),
  role: z.enum(["lord", "loyalist", "rebel", "renegade"]),
  generalId: generalIdSchema.nullable().default(null),
  // Multi-point damage may persist a living victim below zero while their
  // exact dying barrier is awaiting enough rescue cards.
  hp: z.number().int().min(-10).max(10),
  maxHp: z.number().int().min(1).max(10),
  alive: z.boolean(),
  faceUp: z.boolean().default(true),
  hand: z.array(cardSchema).max(200),
  equipment: z.object({
    weapon: cardSchema.optional(),
    armor: cardSchema.optional(),
    offensive_horse: cardSchema.optional(),
    defensive_horse: cardSchema.optional(),
  }).default({}),
  judgment: z.array(cardSchema).max(3).default([]),
  chained: z.boolean().default(false),
  extraPiles: z.record(z.string().min(1).max(80), z.array(cardSchema).max(200)).default({}),
});
const turnSchema = z.object({
  number: z.number().int().positive(),
  playerId: playerIdSchema,
  phase: z.enum(["prepare", "judgment", "draw", "play", "respond", "discard", "end"]),
  slashUsed: z.boolean(),
  wineUsed: z.boolean().optional(),
  slashDamageBonus: z.number().int().min(0).max(1).optional(),
  requiredDiscardCount: z.number().int().min(0).max(200),
  discardStage: z.enum(["hand_limit", "yongsi"]).default("hand_limit"),
  skipDraw: z.boolean().default(false),
  skipPlay: z.boolean().default(false),
  luoyiActive: z.boolean().default(false),
  slashRespondedInPlayPhase: z.boolean().default(false),
  skillUseCounts: z.record(generalSkillIdSchema, nonnegativeSafeIntegerSchema).default({}),
  rendeGivenCount: nonnegativeSafeIntegerSchema.default(0),
  rendeRecovered: z.boolean().default(false),
});
const declinedLordSkillIdsSchema = z.array(z.enum(["hujia", "jijiang"])).max(2).optional();
const slashCompletionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("default") }),
  z.object({
    type: z.literal("turn_flow"),
    continuationId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    playerId: playerIdSchema,
    destination: z.enum(["play", "discard_or_end"]),
  }),
]);
const massAttackResponseSchema = z.object({
  type: z.literal("mass_attack"),
  attackerId: playerIdSchema,
  targetId: playerIdSchema,
  cardId: z.string().min(1).max(80),
  cardKind: z.enum(["barbarian_invasion", "arrow_barrage"]),
  responseKind: z.enum(["slash", "dodge"]),
  remainingTargetIds: z.array(playerIdSchema).max(9),
  armorAttempted: z.boolean().optional(),
  declinedLordSkillIds: declinedLordSkillIdsSchema,
});
const slashResponseSchema = z.object({
  type: z.literal("slash"),
  attackerId: playerIdSchema,
  targetId: playerIdSchema,
  cardId: z.string().min(1).max(100),
  damageCardIds: z.array(z.string().min(1).max(100)).min(1).max(2).optional(),
  slashKind: z.enum(["slash", "fire_slash", "thunder_slash"]).default("slash"),
  damage: z.number().int().positive().max(10).default(1),
  nature: z.enum(["normal", "fire", "thunder"]).default("normal"),
  color: z.enum(["red", "black", "colorless"]).default("colorless"),
  armorAttempted: z.boolean().optional(),
  armorIgnored: z.boolean().optional(),
  requiredDodgeCount: z.number().int().min(1).max(2).default(1),
  // A completed 2/2 Wushuang response can remain nested inside a weapon
  // decision (Guan Shi Fu / Qing Long Yan Yue Dao) until that prompt resolves.
  dodgesPlayed: z.number().int().min(0).max(2).default(0),
  remainingTargetIds: z.array(playerIdSchema).max(2).default([]),
  zhuQueChecked: z.boolean().default(true),
  ciXiongChecked: z.boolean().default(true),
  liuliCheckedPlayerIds: z.array(playerIdSchema).max(10).default([]),
  tieqiChecked: z.boolean().default(false),
  excludedRedirectTargetIds: z.array(playerIdSchema).max(10).default([]),
  dodgeProhibited: z.boolean().default(false),
  completion: slashCompletionSchema.default({ type: "default" }),
  declinedLordSkillIds: declinedLordSkillIdsSchema,
});
const duelResponseSchema = z.object({
  type: z.literal("duel"),
  attackerId: playerIdSchema,
  targetId: playerIdSchema,
  cardId: z.string().min(1).max(100),
  initiatorId: playerIdSchema,
  originalTargetId: playerIdSchema,
  requiredSlashCount: z.number().int().min(1).max(2).default(1),
  slashesPlayed: z.number().int().min(0).max(1).default(0),
  declinedLordSkillIds: declinedLordSkillIdsSchema,
});
const borrowedSwordResponseSchema = z.object({
  type: z.literal("borrowed_sword"),
  attackerId: playerIdSchema,
  targetId: playerIdSchema,
  attackTargetId: playerIdSchema,
  cardId: z.string().min(1).max(100),
  declinedLordSkillIds: declinedLordSkillIdsSchema,
});
const cardUseIntentSchema = z.object({
  useId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  sourceId: playerIdSchema,
  physicalCardId: z.string().min(1).max(80),
  physicalKind: cardKindSchema,
  effectiveKind: cardKindSchema,
  suit: z.enum(["spade", "heart", "club", "diamond"]),
  rank: z.number().int().min(1).max(13),
  targetIds: z.array(playerIdSchema).max(10),
  method: z.enum(["use", "respond", "recast"]),
  viaSkill: generalSkillIdSchema.nullable(),
});
const skillTriggerRefSchema = z.object({
  triggerId: z.string().min(1).max(200),
  eventId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  ownerId: playerIdSchema,
  skillId: generalSkillIdSchema,
  targetIndex: z.number().int().nonnegative().max(10),
  mandatory: z.boolean(),
});
const cardUseContinuationSchema = z.object({
  type: z.literal("card_use"),
  intent: cardUseIntentSchema,
  stage: z.enum(["card_use_declared", "targets_confirmed"]),
  eventId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  remainingTriggers: z.array(skillTriggerRefSchema).max(100),
});
const trickEffectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ex_nihilo"), sourceId: playerIdSchema, targetId: playerIdSchema, cardId: z.string().min(1).max(80) }),
  z.object({ type: z.literal("duel"), sourceId: playerIdSchema, targetId: playerIdSchema, cardId: z.string().min(1).max(80) }),
  z.object({ type: z.literal("mass_attack"), pending: massAttackResponseSchema }),
  z.object({
    type: z.literal("peach_garden"), sourceId: playerIdSchema, targetId: playerIdSchema,
    cardId: z.string().min(1).max(80), remainingTargetIds: z.array(playerIdSchema).max(9),
  }),
  z.object({
    type: z.literal("delayed_trick"), sourceId: playerIdSchema, targetId: playerIdSchema,
    cardId: z.string().min(1).max(80), cardKind: z.enum(["le_bu_si_shu", "bing_liang_cun_duan", "shan_dian"]),
  }),
  z.object({
    type: z.literal("zone_trick"), sourceId: playerIdSchema, targetId: playerIdSchema,
    cardId: z.string().min(1).max(80), cardKind: z.enum(["guo_he_chai_qiao", "shun_shou_qian_yang"]),
  }),
  z.object({ type: z.literal("fire_attack"), sourceId: playerIdSchema, targetId: playerIdSchema, cardId: z.string().min(1).max(80) }),
  z.object({
    type: z.literal("borrowed_sword"), sourceId: playerIdSchema, targetId: playerIdSchema,
    attackTargetId: playerIdSchema, cardId: z.string().min(1).max(80),
  }),
  z.object({
    type: z.literal("iron_chain"), sourceId: playerIdSchema, targetId: playerIdSchema,
    cardId: z.string().min(1).max(80), remainingTargetIds: z.array(playerIdSchema).max(2),
  }),
  z.object({
    type: z.literal("amazing_grace"), sourceId: playerIdSchema, targetId: playerIdSchema,
    cardId: z.string().min(1).max(80), pool: z.array(cardSchema).max(10), remainingTargetIds: z.array(playerIdSchema).max(9),
  }),
]);
const baseDyingResumeSchema = z.union([
  z.object({ type: z.literal("finish_effect") }),
  z.object({ type: z.literal("turn_start") }),
  z.object({ type: z.literal("mass_attack"), pending: massAttackResponseSchema }),
  z.object({ type: z.literal("slash_sequence"), pending: slashResponseSchema }),
  z.object({ type: z.literal("skill"), skillId: z.literal("kurou"), playerId: playerIdSchema }),
]);
const damageFlowDyingResumeSchema = z.object({
  type: z.literal("damage_flow"),
  frameId: positiveSafeIntegerSchema,
  damageId: positiveSafeIntegerSchema,
  dyingId: positiveSafeIntegerSchema,
}).strict();

const standardImplementedSkillIdSchema = z.enum([
  "jianxiong", "tiandu", "yiji", "guicai", "fankui",
  "ganglie", "tuxi", "guanxing", "tieqi", "liuli",
]);
const standardDamageSkillIdSchema = z.enum(["jianxiong", "yiji", "fankui", "ganglie"]);

const standardDamageAftermathSchema: z.ZodTypeAny = z.lazy(() => z.object({
  eventId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  sourceId: playerIdSchema.nullable(),
  targetId: playerIdSchema,
  amount: z.number().int().positive().max(10),
  damageCardIds: z.array(z.string().min(1).max(100)).max(10),
  remainingSkillIds: z.array(standardDamageSkillIdSchema).max(4),
  resume: businessDyingResumeSchema,
}));

const nonChainDyingResumeSchema: z.ZodTypeAny = z.lazy(() => z.union([
  baseDyingResumeSchema,
  z.object({ type: z.literal("standard_damage"), aftermath: standardDamageAftermathSchema }),
]));

const businessDyingResumeSchema: z.ZodTypeAny = z.lazy(() => z.union([
  nonChainDyingResumeSchema,
  z.object({
    type: z.literal("chain_damage"),
    sourceId: playerIdSchema.nullable(),
    amount: z.number().int().positive().max(10),
    nature: z.enum(["fire", "thunder"]),
    damageCardIds: z.array(z.string().min(1).max(100)).max(10).default([]),
    remainingTargetIds: z.array(playerIdSchema).max(9),
    finalResume: nonChainDyingResumeSchema,
  }),
]));

const dyingResumeSchema: z.ZodTypeAny = z.lazy(() => z.union([
  businessDyingResumeSchema,
  damageFlowDyingResumeSchema,
]));

const judgmentPatternSchema = z.object({
  suits: z.array(z.enum(["spade", "heart", "club", "diamond"])).max(4).optional(),
  color: z.enum(["red", "black"]).optional(),
  minimumRank: z.number().int().min(1).max(13).optional(),
  maximumRank: z.number().int().min(1).max(13).optional(),
  negate: z.boolean().optional(),
});
const judgmentOpportunitySchema = z.object({ ownerId: playerIdSchema, skillId: z.string().min(1).max(80) });
const judgmentZoneRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("deck") }),
  z.object({ kind: z.literal("discard") }),
  z.object({ kind: z.literal("processing"), frameId: z.number().int().positive() }),
  z.object({ kind: z.literal("hand"), playerId: playerIdSchema }),
  z.object({ kind: z.literal("judgment"), playerId: playerIdSchema }),
  z.object({ kind: z.literal("equipment"), playerId: playerIdSchema, slot: z.enum(["weapon", "armor", "offensive_horse", "defensive_horse"]) }),
  z.object({ kind: z.literal("extra"), playerId: playerIdSchema, pileId: z.string().min(1).max(80) }),
]);
const judgmentFrameSchema = z.object({
  type: z.literal("judgment"),
  version: z.literal(2),
  frameId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  targetId: playerIdSchema,
  reason: z.object({ type: z.enum(["delayed_trick", "skill", "armor"]), id: z.string().min(1).max(100) }),
  pattern: judgmentPatternSchema,
  retrialOrder: z.array(judgmentOpportunitySchema).max(20),
  postJudgmentOrder: z.array(judgmentOpportunitySchema).max(20),
  stage: z.enum(["awaiting_reveal", "retrial_window", "ready_to_resolve", "post_judgment_window", "ready_to_settle", "settled"]),
  retrialCursor: z.number().int().nonnegative().max(20),
  postJudgmentCursor: z.number().int().nonnegative().max(20),
  initialCardId: z.string().min(1).max(100).nullable(),
  cardId: z.string().min(1).max(100).nullable(),
  effectiveCard: z.object({
    cardId: z.string().min(1).max(100),
    physicalSuit: z.enum(["spade", "heart", "club", "diamond"]),
    effectiveSuit: z.enum(["spade", "heart", "club", "diamond"]),
    rank: z.number().int().min(1).max(13),
    color: z.enum(["red", "black"]),
  }).nullable(),
  result: z.boolean().nullable(),
  replacements: z.array(z.object({
    actorId: playerIdSchema,
    skillId: z.string().min(1).max(80),
    oldCardId: z.string().min(1).max(100),
    newCardId: z.string().min(1).max(100),
    oldCardDestination: judgmentZoneRefSchema,
  })).max(20),
  suitModifiers: z.array(z.object({
    modifierId: z.string().min(1).max(160),
    sourcePlayerId: playerIdSchema.nullable(),
    skillId: z.string().min(1).max(80),
    fromSuit: z.enum(["spade", "heart", "club", "diamond"]).nullable(),
    toSuit: z.enum(["spade", "heart", "club", "diamond"]),
  })).max(20),
  settledTo: judgmentZoneRefSchema.nullable(),
});

function baseDyingResumePlayerIds(resume: z.infer<typeof baseDyingResumeSchema>): string[] {
  if (resume.type === "mass_attack" || resume.type === "slash_sequence") {
    return [
      resume.pending.attackerId,
      resume.pending.targetId,
      ...resume.pending.remainingTargetIds,
      ...(resume.type === "slash_sequence" && resume.pending.completion.type === "turn_flow"
        ? [resume.pending.completion.playerId]
        : []),
    ];
  }
  if (resume.type === "skill") return [resume.playerId];
  return [];
}

function dyingResumePlayerIds(resume: any): string[] {
  if (resume?.type === "chain_damage") {
    return [
      ...(resume.sourceId === null ? [] : [resume.sourceId]),
      ...resume.remainingTargetIds,
      ...dyingResumePlayerIds(resume.finalResume),
    ];
  }
  if (resume?.type === "standard_damage") {
    return [
      resume.aftermath.targetId,
      ...(resume.aftermath.sourceId ? [resume.aftermath.sourceId] : []),
      ...dyingResumePlayerIds(resume.aftermath.resume),
    ];
  }
  return baseDyingResumePlayerIds(resume);
}

const lordDispatchableResponseSchema = z.discriminatedUnion("type", [
  slashResponseSchema,
  duelResponseSchema,
  massAttackResponseSchema,
  borrowedSwordResponseSchema,
]);

const lordDispatchSchema = z.object({
  type: z.literal("lord_dispatch"),
  requesterId: playerIdSchema,
  targetId: playerIdSchema,
  skillId: z.enum(["hujia", "jijiang"]),
  requiredFaction: z.enum(["wei", "shu"]),
  responseKind: z.enum(["slash", "dodge"]),
  method: z.enum(["use", "respond"]),
  eventId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  promptId: z.string().min(1).max(240),
  remainingProviderIds: z.array(playerIdSchema).max(9),
  resume: z.discriminatedUnion("type", [
    z.object({ type: z.literal("use_slash"), targetIds: z.array(playerIdSchema).length(1) }),
    z.object({ type: z.literal("respond"), pending: lordDispatchableResponseSchema }),
  ]),
});

const standardJudgmentContextSchema: z.ZodTypeAny = z.lazy(() => z.discriminatedUnion("type", [
  z.object({ type: z.literal("delayed_trick"), playerId: playerIdSchema, delayedCard: cardSchema }),
  z.object({ type: z.literal("luoshen"), playerId: playerIdSchema, iteration: nonnegativeSafeIntegerSchema }),
  z.object({ type: z.literal("ganglie"), aftermath: standardDamageAftermathSchema }),
  z.object({ type: z.literal("tieqi"), slash: slashResponseSchema }),
  z.object({ type: z.literal("armor"), pending: z.discriminatedUnion("type", [slashResponseSchema, massAttackResponseSchema]) }),
]));

const standardJudgmentResponseSchema = z.object({
  type: z.literal("standard_judgment"),
  targetId: playerIdSchema,
  promptId: z.string().min(1).max(240),
  frame: judgmentFrameSchema,
  context: standardJudgmentContextSchema,
  tianduClaimed: z.boolean(),
});

const standardSkillResponseSchema = z.object({
  type: z.literal("standard_skill"),
  targetId: playerIdSchema,
  promptId: z.string().min(1).max(240),
  eventId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  skillId: standardImplementedSkillIdSchema,
  stage: z.enum(["invoke", "guanxing_reorder", "tuxi_select", "yiji_distribute", "fankui_select", "ganglie_punish", "liuli_redirect"]),
  aftermath: standardDamageAftermathSchema.optional(),
  slash: slashResponseSchema.optional(),
  sourceId: playerIdSchema.optional(),
  selectedCardIds: z.array(z.string().min(1).max(100)).max(5).optional(),
  iteration: nonnegativeSafeIntegerSchema.optional(),
});

const pendingResponseSchema = z.discriminatedUnion("type", [
  slashResponseSchema,
  z.object({
    type: z.literal("weapon_action"),
    weaponKind: z.enum(["zhu_que_yu_shan", "ci_xiong_shuang_gu_jian", "guan_shi_fu", "qing_long_yan_yue_dao", "han_bing_jian", "qi_lin_gong"]),
    stage: z.enum(["zhuque_convert", "cixiong_activate", "cixiong_choice", "guanshi_force_hit", "qinglong_followup", "hanbing_prevent", "hanbing_select", "qilin_discard_horse"]),
    attackerId: playerIdSchema,
    targetId: playerIdSchema,
    victimId: playerIdSchema,
    slash: slashResponseSchema,
    remainingSelections: z.number().int().min(1).max(2).optional(),
  }),
  duelResponseSchema,
  z.object({
    type: z.literal("fanjian_suit"),
    attackerId: playerIdSchema,
    targetId: playerIdSchema,
    eventId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    promptId: z.string().min(1).max(240),
  }),
  massAttackResponseSchema,
  z.object({
    type: z.literal("nullification"),
    attackerId: playerIdSchema,
    targetId: playerIdSchema,
    effectTargetId: playerIdSchema,
    cardId: z.string().min(1).max(80),
    cardKind: z.enum(["ex_nihilo", "duel", "barbarian_invasion", "arrow_barrage", "peach_garden", "le_bu_si_shu", "bing_liang_cun_duan", "shan_dian", "guo_he_chai_qiao", "shun_shou_qian_yang", "fire_attack", "amazing_grace", "borrowed_sword", "iron_chain"]),
    remainingResponderIds: z.array(playerIdSchema).max(9),
    negated: z.boolean(),
    effect: trickEffectSchema,
  }),
  z.object({
    type: z.literal("zone_selection"),
    attackerId: playerIdSchema,
    targetId: playerIdSchema,
    victimId: playerIdSchema,
    cardId: z.string().min(1).max(80),
    cardKind: z.enum(["guo_he_chai_qiao", "shun_shou_qian_yang"]),
    mode: z.enum(["discard", "gain"]),
  }),
  z.object({
    type: z.literal("fire_attack_reveal"), attackerId: playerIdSchema, targetId: playerIdSchema,
    cardId: z.string().min(1).max(80),
  }),
  z.object({
    type: z.literal("fire_attack_discard"), attackerId: playerIdSchema, targetId: playerIdSchema,
    victimId: playerIdSchema, cardId: z.string().min(1).max(80), revealedCardId: z.string().min(1).max(80),
  }),
  z.object({
    type: z.literal("amazing_grace_selection"), attackerId: playerIdSchema, targetId: playerIdSchema,
    cardId: z.string().min(1).max(80), pool: z.array(cardSchema).max(10), remainingTargetIds: z.array(playerIdSchema).max(9),
  }),
  borrowedSwordResponseSchema,
  z.object({
    type: z.literal("dying"),
    victimId: playerIdSchema,
    damageSourceId: playerIdSchema.nullable(),
    targetId: playerIdSchema,
    remainingResponderIds: z.array(playerIdSchema).max(9),
    resume: dyingResumeSchema,
  }),
  z.object({
    type: z.literal("skill_choice"),
    targetId: playerIdSchema,
    skillId: z.enum(["luoyi", "keji", "yingzi", "biyue", "luoshen", "jizhi", "lianying", "xiaoji"]),
    resume: z.discriminatedUnion("type", [
      z.object({ type: z.literal("finish_draw"), playerId: playerIdSchema }),
      z.object({
        type: z.literal("enter_discard"),
        playerId: playerIdSchema,
        count: z.number().int().min(0).max(200),
      }),
      z.object({ type: z.literal("continue_judgment"), playerId: playerIdSchema }),
      z.object({ type: z.literal("finish_turn"), playerId: playerIdSchema }),
      z.object({ type: z.literal("after_move"), eventId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }),
      cardUseContinuationSchema,
    ]),
    promptId: z.string().min(1).max(240).optional(),
    triggerId: z.string().min(1).max(200).optional(),
    iteration: nonnegativeSafeIntegerSchema.optional(),
  }),
  lordDispatchSchema,
  standardJudgmentResponseSchema,
  standardSkillResponseSchema,
]);

type PersistedPendingResponse = z.infer<typeof pendingResponseSchema>;

function slashCompletionPlayerIds(pending: z.infer<typeof slashResponseSchema>): string[] {
  return pending.completion.type === "turn_flow" ? [pending.completion.playerId] : [];
}

function lordDispatchablePlayerIds(pending: z.infer<typeof lordDispatchableResponseSchema>): string[] {
  return [
    pending.attackerId,
    pending.targetId,
    ...(pending.type === "slash" || pending.type === "mass_attack" ? pending.remainingTargetIds : []),
    ...(pending.type === "slash" && pending.completion.type === "turn_flow" ? [pending.completion.playerId] : []),
    ...(pending.type === "duel" ? [pending.initiatorId, pending.originalTargetId] : []),
    ...(pending.type === "borrowed_sword" ? [pending.attackTargetId] : []),
  ];
}

function suspendedResponsePlayerIds(pending: PersistedPendingResponse): string[] {
  if (pending.type === "dying") {
    const resumeIds = dyingResumePlayerIds(pending.resume);
    return [
      pending.victimId,
      ...(pending.damageSourceId === null ? [] : [pending.damageSourceId]),
      pending.targetId,
      ...pending.remainingResponderIds,
      ...resumeIds,
    ];
  }
  if (pending.type === "skill_choice") {
    if (pending.resume.type === "card_use") {
      return [
        pending.targetId,
        pending.resume.intent.sourceId,
        ...pending.resume.intent.targetIds,
        ...pending.resume.remainingTriggers.map((trigger) => trigger.ownerId),
      ];
    }
    return pending.resume.type === "after_move"
      ? [pending.targetId]
      : [pending.targetId, pending.resume.playerId];
  }
  if (pending.type === "lord_dispatch") {
    return [
      pending.requesterId,
      pending.targetId,
      ...pending.remainingProviderIds,
      ...(pending.resume.type === "use_slash"
        ? pending.resume.targetIds
        : lordDispatchablePlayerIds(pending.resume.pending)),
    ];
  }
  if (pending.type === "standard_judgment") {
    const context = pending.context;
    return [
      pending.targetId,
      pending.frame.targetId,
      ...pending.frame.retrialOrder.map((entry) => entry.ownerId),
      ...pending.frame.postJudgmentOrder.map((entry) => entry.ownerId),
      ...(context.type === "delayed_trick" || context.type === "luoshen" ? [context.playerId] : []),
      ...(context.type === "ganglie" ? [context.aftermath.targetId, ...(context.aftermath.sourceId ? [context.aftermath.sourceId] : []), ...dyingResumePlayerIds(context.aftermath.resume)] : []),
      ...(context.type === "tieqi" ? [context.slash.attackerId, context.slash.targetId, ...context.slash.remainingTargetIds, ...slashCompletionPlayerIds(context.slash)] : []),
      ...(context.type === "armor" ? [
        context.pending.attackerId,
        context.pending.targetId,
        ...context.pending.remainingTargetIds,
        ...(context.pending.type === "slash" ? slashCompletionPlayerIds(context.pending) : []),
      ] : []),
    ];
  }
  if (pending.type === "standard_skill") {
    return [
      pending.targetId,
      ...(pending.sourceId ? [pending.sourceId] : []),
      ...(pending.aftermath ? [pending.aftermath.targetId, ...(pending.aftermath.sourceId ? [pending.aftermath.sourceId] : []), ...dyingResumePlayerIds(pending.aftermath.resume)] : []),
      ...(pending.slash ? [pending.slash.attackerId, pending.slash.targetId, ...pending.slash.remainingTargetIds, ...slashCompletionPlayerIds(pending.slash)] : []),
    ];
  }
  if (pending.type === "zone_selection" || pending.type === "fire_attack_discard") {
    return [pending.attackerId, pending.targetId, pending.victimId];
  }
  if (pending.type === "amazing_grace_selection") {
    return [pending.attackerId, pending.targetId, ...pending.remainingTargetIds];
  }
  if (pending.type === "nullification") {
    const effect = pending.effect;
    const effectIds = effect.type === "mass_attack"
      ? [effect.pending.attackerId, effect.pending.targetId, ...effect.pending.remainingTargetIds]
      : [
          effect.sourceId,
          effect.targetId,
          ...(effect.type === "peach_garden" || effect.type === "iron_chain" || effect.type === "amazing_grace"
            ? effect.remainingTargetIds
            : []),
          ...(effect.type === "borrowed_sword" ? [effect.attackTargetId] : []),
        ];
    return [
      pending.attackerId,
      pending.targetId,
      pending.effectTargetId,
      ...pending.remainingResponderIds,
      ...effectIds,
    ];
  }
  return [
    pending.attackerId,
    pending.targetId,
    ...(pending.type === "slash" ? slashCompletionPlayerIds(pending) : []),
    ...(pending.type === "weapon_action" ? [pending.victimId, pending.slash.attackerId, pending.slash.targetId, ...pending.slash.remainingTargetIds, ...slashCompletionPlayerIds(pending.slash)] : []),
    ...(pending.type === "duel" ? [pending.initiatorId, pending.originalTargetId] : []),
    ...(pending.type === "mass_attack" ? pending.remainingTargetIds : []),
    ...(pending.type === "borrowed_sword" ? [pending.attackTargetId] : []),
  ];
}

type KnownDamageSource = { readonly known: boolean; readonly sourceId: string | null };

function dyingDamageSourceFromResume(resume: any): KnownDamageSource {
  if (!resume || typeof resume !== "object") return { known: false, sourceId: null };
  if (resume.type === "standard_damage") return { known: true, sourceId: resume.aftermath.sourceId ?? null };
  if (resume.type === "slash_sequence" || resume.type === "mass_attack") {
    return { known: true, sourceId: resume.pending.attackerId };
  }
  if (resume.type === "chain_damage") return { known: true, sourceId: resume.sourceId ?? null };
  if (resume.type === "turn_start" || resume.type === "skill") return { known: true, sourceId: null };
  return { known: false, sourceId: null };
}

function aftermathDamageSourceFromResume(resume: any): KnownDamageSource {
  if (!resume || typeof resume !== "object") return { known: false, sourceId: null };
  if (resume.type === "standard_damage") return { known: true, sourceId: resume.aftermath.targetId };
  return dyingDamageSourceFromResume(resume);
}

function slashResponsesFromResume(resume: any): Array<z.infer<typeof slashResponseSchema>> {
  if (!resume || typeof resume !== "object") return [];
  if (resume.type === "slash_sequence") return [resume.pending];
  if (resume.type === "chain_damage") return slashResponsesFromResume(resume.finalResume);
  if (resume.type === "standard_damage") return slashResponsesFromResume(resume.aftermath.resume);
  return [];
}

function slashResponsesFromPending(pending: any): Array<z.infer<typeof slashResponseSchema>> {
  if (!pending || typeof pending !== "object") return [];
  if (pending.type === "slash") return [pending];
  if (pending.type === "weapon_action") return [pending.slash];
  if (pending.type === "dying") return slashResponsesFromResume(pending.resume);
  if (pending.type === "standard_skill") {
    return [
      ...(pending.slash ? [pending.slash] : []),
      ...(pending.aftermath ? slashResponsesFromResume(pending.aftermath.resume) : []),
    ];
  }
  if (pending.type === "standard_judgment") {
    if (pending.context.type === "tieqi") return [pending.context.slash];
    if (pending.context.type === "armor" && pending.context.pending.type === "slash") return [pending.context.pending];
    if (pending.context.type === "ganglie") return slashResponsesFromResume(pending.context.aftermath.resume);
  }
  if (pending.type === "lord_dispatch" && pending.resume.type === "respond") {
    return slashResponsesFromPending(pending.resume.pending);
  }
  return [];
}

const gameSessionSchema = z.object({
  version: z.literal(1),
  status: z.enum(["playing", "finished"]),
  players: z.array(gamePlayerSchema).min(2).max(10),
  deck: z.array(cardSchema).max(200),
  discardPile: z.array(cardSchema).max(200),
  resolvingCards: z.array(cardSchema).max(200).optional(),
  virtualCardOrigins: z.record(z.string().min(1).max(80), cardKindSchema).default({}),
  currentPlayerId: playerIdSchema,
  turn: turnSchema,
  pendingResponse: pendingResponseSchema.nullable(),
  winner: z.object({
    side: z.enum(["lord", "rebel", "renegade"]),
    playerIds: z.array(playerIdSchema).min(1).max(10),
  }).nullable(),
  logs: z.array(z.object({
    id: z.number().int().positive(),
    type: z.enum(["system", "turn", "card", "damage", "death", "victory"]),
    message: z.string().min(1).max(500),
  })).max(500),
  rng: z.object({
    key: z.string().regex(/^[0-9a-f]{64}$/i),
    counter: z.number().int().min(0).max(0xffff_ffff),
  }),
  nextLogId: z.number().int().positive(),
  nextUseId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  nextEventId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  afterMove: z.object({
    queuedTriggers: z.array(skillTriggerRefSchema).max(100),
    suspendedPhase: z.enum(["prepare", "judgment", "draw", "play", "respond", "discard", "end"]).nullable(),
    suspendedResponse: pendingResponseSchema.nullable(),
  }),
  completeRules: completeRulesStateSchema,
}).superRefine((game, context) => {
  const playerIds = game.players.map((player) => player.id);
  const knownPlayers = new Set(playerIds);
  const issue = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  if (knownPlayers.size !== playerIds.length) issue("Game contains duplicate players");
  if (!knownPlayers.has(game.currentPlayerId)) issue("Current player is not in the game");
  if (game.turn.playerId !== game.currentPlayerId) issue("Turn player does not match current player");
  if (game.players.some((player, index) => player.seat !== index)) issue("Game seats are not contiguous");
  if (game.players.some((player) => player.hp > player.maxHp)) issue("Player hp exceeds maxHp");
  const dyingVictimId = game.pendingResponse?.type === "dying"
    ? game.pendingResponse.victimId
    : game.afterMove.suspendedResponse?.type === "dying"
      ? game.afterMove.suspendedResponse.victimId
      : undefined;
  if (game.players.some((player) =>
    (!player.alive && player.hp !== 0) ||
    (player.alive && player.hp <= 0 && player.id !== dyingVictimId)
  )) issue("Player alive flag disagrees with hp");
  const allCards = [
    ...game.deck,
    ...game.discardPile,
    ...(game.resolvingCards ?? []),
    ...game.players.flatMap((player) => player.hand),
    ...game.players.flatMap((player) => Object.values(player.equipment)),
    ...game.players.flatMap((player) => player.judgment),
    ...game.players.flatMap((player) => Object.values(player.extraPiles).flat()),
    ...(game.pendingResponse?.type === "amazing_grace_selection"
      ? game.pendingResponse.pool
      : game.pendingResponse?.type === "nullification" && game.pendingResponse.effect.type === "amazing_grace"
        ? game.pendingResponse.effect.pool
        : []),
    ...(game.afterMove.suspendedResponse?.type === "amazing_grace_selection"
      ? game.afterMove.suspendedResponse.pool
      : game.afterMove.suspendedResponse?.type === "nullification" &&
          game.afterMove.suspendedResponse.effect.type === "amazing_grace"
        ? game.afterMove.suspendedResponse.effect.pool
        : []),
  ];
  if (new Set(allCards.map((card) => card.id)).size !== allCards.length) issue("Card appears in multiple zones");
  if (game.completeRules.nextEventId !== game.nextEventId) issue("Complete-rules event counter is out of sync");
  const pendingDyingFrames = [game.pendingResponse, game.afterMove.suspendedResponse]
    .filter((pending): pending is Extract<PersistedPendingResponse, { type: "dying" }> => pending?.type === "dying");
  const damageFlowDyingFrames = pendingDyingFrames
    .filter((pending) => pending.resume.type === "damage_flow");
  const activeDamageFrames = game.completeRules.damageFlow.frames;
  const callerSlashFrames: Array<z.infer<typeof slashResponseSchema>> = [];

  if (activeDamageFrames.length > 0 || damageFlowDyingFrames.length > 0) {
    if (game.status === "finished") {
      issue("Finished game cannot retain an active damage flow");
    }
    if (activeDamageFrames.length !== 1 || damageFlowDyingFrames.length !== 1) {
      issue("Active damage flow must have exactly one matching dying continuation");
    } else {
      const frame = activeDamageFrames[0]!;
      const pending = damageFlowDyingFrames[0]!;
      const cursor = pending.resume as z.infer<typeof damageFlowDyingResumeSchema>;
      const barrier = frame.dying;
      const victim = game.players.find((player) => player.id === frame.damage.targetId);
      if (frame.status !== "active"
        || frame.step !== "dying"
        || frame.window !== null
        || frame.parentResumeToken !== null
        || frame.awaitingChildToken !== null
        || frame.damage.stage !== "life_deducted"
        || frame.callerContinuation === null
        || barrier === null
        || cursor.frameId !== frame.frameId
        || cursor.damageId !== frame.damageId
        || cursor.dyingId !== barrier.dyingId
        || barrier.frameId !== frame.frameId
        || barrier.damageId !== frame.damageId
        || barrier.targetId !== frame.damage.targetId
        || barrier.hpAfterDamage !== frame.damage.hpAfter
        || pending.victimId !== barrier.targetId
        || pending.damageSourceId !== frame.damage.sourceId
        || !victim
        || !victim.alive
        || victim.hp > 0
        || victim.hp !== barrier.hpAfterDamage
        || game.turn.phase !== "respond"
      ) {
        issue("Active damage flow disagrees with its dying barrier");
      }
      if (frame.callerContinuation !== null) {
        try {
          const callerResume = decodeGameDamageContinuation(frame.callerContinuation);
          if (dyingResumePlayerIds(callerResume).some((id) => !knownPlayers.has(id))) {
            issue("Damage-flow caller continuation references an unknown player");
          }
          callerSlashFrames.push(...slashResponsesFromResume(callerResume));
        } catch {
          issue("Active damage flow has an invalid caller continuation");
        }
      }
    }
  }

  for (const pending of pendingDyingFrames) {
    const expected = dyingDamageSourceFromResume(pending.resume);
    if (expected.known && pending.damageSourceId !== expected.sourceId) {
      issue("Dying damage source disagrees with its causal continuation");
    }
  }

  const slashFrames = [
    ...slashResponsesFromPending(game.pendingResponse),
    ...slashResponsesFromPending(game.afterMove.suspendedResponse),
    ...callerSlashFrames,
  ];
  for (const slash of slashFrames) {
    if (
      slash.completion.type === "turn_flow" &&
      (
        slash.completion.continuationId >= game.nextEventId ||
        slash.completion.playerId !== game.currentPlayerId ||
        slash.completion.playerId !== game.turn.playerId
      )
    ) {
      issue("Slash completion continuation is inconsistent with the current turn");
    }
  }

  const queuedTriggerIds = game.afterMove.queuedTriggers.map((trigger) => trigger.triggerId);
  if (new Set(queuedTriggerIds).size !== queuedTriggerIds.length) {
    issue("After-move queue contains duplicate trigger identifiers");
  }
  for (const trigger of game.afterMove.queuedTriggers) {
    if (
      (trigger.skillId !== "lianying" && trigger.skillId !== "xiaoji") ||
      trigger.triggerId !== `${trigger.eventId}:${trigger.skillId}:${trigger.ownerId}:0` ||
      trigger.targetIndex !== 0 ||
      trigger.mandatory ||
      trigger.eventId >= game.nextEventId
    ) {
      issue("After-move queue contains an invalid trigger reference");
    }
    if (!knownPlayers.has(trigger.ownerId)) issue("After-move trigger references an unknown player");
  }
  const afterMovePrompt = game.pendingResponse?.type === "skill_choice" &&
    game.pendingResponse.resume.type === "after_move"
    ? game.pendingResponse
    : null;
  if (game.afterMove.suspendedPhase === null) {
    if (game.afterMove.suspendedResponse !== null || game.afterMove.queuedTriggers.length > 0 || afterMovePrompt) {
      issue("After-move state has work without a suspended phase");
    }
  } else {
    if (!afterMovePrompt) issue("After-move state has no active skill prompt");
    if (game.afterMove.suspendedResponse !== null && game.afterMove.suspendedPhase !== "respond") {
      issue("After-move suspended response is outside respond phase");
    }
    if (game.afterMove.suspendedResponse === null && game.afterMove.suspendedPhase === "respond") {
      issue("After-move respond phase has no suspended response");
    }
  }
  const suspendedRelatedIds = game.afterMove.suspendedResponse
    ? suspendedResponsePlayerIds(game.afterMove.suspendedResponse)
    : [];
  if (suspendedRelatedIds.some((id) => !knownPlayers.has(id))) {
    issue("Suspended response references an unknown player");
  }
  const virtualCards = [
    ...(game.resolvingCards ?? []),
    ...game.players.flatMap((player) => player.judgment),
  ];
  for (const cardId of Object.keys(game.virtualCardOrigins)) {
    const matches = virtualCards.filter((card) => card.id === cardId);
    if (matches.length !== 1) {
      issue("Virtual card origin must reference exactly one resolving or judgment card");
      continue;
    }
    if (matches[0]!.kind !== "le_bu_si_shu" && matches[0]!.kind !== "guo_he_chai_qiao") {
      issue("Virtual card origin must reference a supported virtual trick card");
    }
  }
  if (game.pendingResponse) {
    const relatedIds = game.pendingResponse.type === "dying"
      ? [
          game.pendingResponse.victimId,
          ...(game.pendingResponse.damageSourceId === null ? [] : [game.pendingResponse.damageSourceId]),
          game.pendingResponse.targetId,
          ...game.pendingResponse.remainingResponderIds,
          ...dyingResumePlayerIds(game.pendingResponse.resume),
        ]
      : game.pendingResponse.type === "zone_selection"
        ? [game.pendingResponse.attackerId, game.pendingResponse.targetId, game.pendingResponse.victimId]
      : game.pendingResponse.type === "fire_attack_discard"
        ? [game.pendingResponse.attackerId, game.pendingResponse.targetId, game.pendingResponse.victimId]
      : game.pendingResponse.type === "amazing_grace_selection"
        ? [game.pendingResponse.attackerId, game.pendingResponse.targetId, ...game.pendingResponse.remainingTargetIds]
      : game.pendingResponse.type === "nullification"
        ? [
            game.pendingResponse.attackerId,
            game.pendingResponse.targetId,
            game.pendingResponse.effectTargetId,
            ...game.pendingResponse.remainingResponderIds,
            ...(game.pendingResponse.effect.type === "mass_attack"
              ? [game.pendingResponse.effect.pending.attackerId, game.pendingResponse.effect.pending.targetId, ...game.pendingResponse.effect.pending.remainingTargetIds]
              : [
                  game.pendingResponse.effect.sourceId,
                  game.pendingResponse.effect.targetId,
                  ...(game.pendingResponse.effect.type === "peach_garden" || game.pendingResponse.effect.type === "iron_chain" || game.pendingResponse.effect.type === "amazing_grace"
                    ? game.pendingResponse.effect.remainingTargetIds
                    : []),
                  ...(game.pendingResponse.effect.type === "borrowed_sword" ? [game.pendingResponse.effect.attackTargetId] : []),
                ]),
          ]
        : game.pendingResponse.type === "skill_choice"
          ? game.pendingResponse.resume.type === "card_use"
            ? [
                game.pendingResponse.targetId,
                game.pendingResponse.resume.intent.sourceId,
                ...game.pendingResponse.resume.intent.targetIds,
                ...game.pendingResponse.resume.remainingTriggers.map((trigger) => trigger.ownerId),
              ]
            : game.pendingResponse.resume.type === "after_move"
              ? [game.pendingResponse.targetId]
              : [game.pendingResponse.targetId, game.pendingResponse.resume.playerId]
        : game.pendingResponse.type === "lord_dispatch"
          ? [
              game.pendingResponse.requesterId,
              game.pendingResponse.targetId,
              ...game.pendingResponse.remainingProviderIds,
              ...(game.pendingResponse.resume.type === "use_slash"
                ? game.pendingResponse.resume.targetIds
                : lordDispatchablePlayerIds(game.pendingResponse.resume.pending)),
            ]
        : game.pendingResponse.type === "standard_judgment" || game.pendingResponse.type === "standard_skill"
          ? suspendedResponsePlayerIds(game.pendingResponse)
        : [
          game.pendingResponse.attackerId,
          game.pendingResponse.targetId,
          ...(game.pendingResponse.type === "duel"
            ? [game.pendingResponse.initiatorId, game.pendingResponse.originalTargetId]
            : []),
          ...(game.pendingResponse.type === "mass_attack" ? game.pendingResponse.remainingTargetIds : []),
          ...(game.pendingResponse.type === "borrowed_sword" ? [game.pendingResponse.attackTargetId] : []),
        ];
    if (relatedIds.some((id) => !knownPlayers.has(id))) issue("Pending response references an unknown player");
    if (game.pendingResponse.type === "skill_choice") {
      if (
        game.pendingResponse.resume.type !== "card_use" &&
        game.pendingResponse.resume.type !== "after_move" &&
        game.pendingResponse.targetId !== game.pendingResponse.resume.playerId
      ) {
        issue("Skill choice target and resume player disagree");
      }
      if (
        ((game.pendingResponse.skillId === "luoyi" || game.pendingResponse.skillId === "yingzi") &&
          game.pendingResponse.resume.type !== "finish_draw") ||
        (game.pendingResponse.skillId === "keji" && game.pendingResponse.resume.type !== "enter_discard") ||
        (game.pendingResponse.skillId === "biyue" && game.pendingResponse.resume.type !== "finish_turn") ||
        (game.pendingResponse.skillId === "luoshen" && game.pendingResponse.resume.type !== "continue_judgment") ||
        (game.pendingResponse.skillId === "jizhi" && game.pendingResponse.resume.type !== "card_use") ||
        ((game.pendingResponse.skillId === "lianying" || game.pendingResponse.skillId === "xiaoji") &&
          game.pendingResponse.resume.type !== "after_move")
      ) {
        issue("Skill choice has an incompatible resume point");
      }
      if (game.pendingResponse.skillId !== "luoshen" && game.pendingResponse.iteration !== undefined) {
        issue("Only Luoshen may persist a repeat iteration");
      }
      if (game.pendingResponse.skillId === "jizhi") {
        const continuation = game.pendingResponse.resume;
        if (continuation.type !== "card_use") {
          issue("Jizhi must resume a card-use frame");
        } else {
          const intent = continuation.intent;
          const expectedTriggerId = `${continuation.eventId}:jizhi:${game.pendingResponse.targetId}:0`;
          if (
            !game.pendingResponse.promptId ||
            !game.pendingResponse.triggerId ||
            game.pendingResponse.triggerId !== expectedTriggerId ||
            game.pendingResponse.promptId !== `skill:${expectedTriggerId}`
          ) {
            issue("Jizhi prompt and trigger identifiers disagree");
          }
          if (
            continuation.stage !== "card_use_declared" ||
            intent.sourceId !== game.pendingResponse.targetId ||
            intent.method !== "use" ||
            ![
              "ex_nihilo", "duel", "barbarian_invasion", "arrow_barrage", "peach_garden",
              "guo_he_chai_qiao", "shun_shou_qian_yang", "fire_attack", "amazing_grace",
              "borrowed_sword", "iron_chain",
            ].includes(intent.effectiveKind)
          ) {
            issue("Jizhi card-use continuation is not an ordinary trick declaration");
          }
          if (game.nextUseId <= intent.useId || game.nextEventId <= continuation.eventId) {
            issue("Card-use continuation identifiers are not behind their monotonic counters");
          }
          const source = game.players.find((player) => player.id === intent.sourceId);
          const owned = source
            ? [...source.hand, ...Object.values(source.equipment)].filter((card) => card.id === intent.physicalCardId)
            : [];
          const physical = owned[0];
          if (
            owned.length !== 1 ||
            !physical ||
            physical.kind !== intent.physicalKind ||
            physical.suit !== intent.suit ||
            physical.rank !== intent.rank
          ) {
            issue("Card-use continuation physical card is no longer owned by its source");
          }
          if (
            (intent.viaSkill === null && intent.physicalKind !== intent.effectiveKind) ||
            (intent.viaSkill !== null &&
              (intent.viaSkill !== "qixi" || intent.effectiveKind !== "guo_he_chai_qiao"))
          ) {
            issue("Card-use continuation has an unsupported virtual-card origin");
          }
          const triggerIds = continuation.remainingTriggers.map((trigger) => trigger.triggerId);
          if (new Set(triggerIds).size !== triggerIds.length) {
            issue("Card-use continuation contains duplicate trigger identifiers");
          }
          if (continuation.remainingTriggers.some((trigger) => trigger.eventId !== continuation.eventId)) {
            issue("Card-use continuation trigger references the wrong event");
          }
        }
      } else if (game.pendingResponse.skillId === "lianying" || game.pendingResponse.skillId === "xiaoji") {
        const continuation = game.pendingResponse.resume;
        const expectedTriggerId = continuation.type === "after_move"
          ? `${continuation.eventId}:${game.pendingResponse.skillId}:${game.pendingResponse.targetId}:0`
          : "";
        if (
          continuation.type !== "after_move" ||
          !game.pendingResponse.promptId ||
          game.pendingResponse.triggerId !== expectedTriggerId ||
          game.pendingResponse.promptId !== `skill:${expectedTriggerId}` ||
          game.nextEventId <= continuation.eventId
        ) {
          issue("After-move skill prompt and trigger identifiers disagree");
        }
      } else if (game.pendingResponse.promptId !== undefined || game.pendingResponse.triggerId !== undefined) {
        issue("Only event-driven skill choices may persist prompt/trigger identifiers");
      }
    }
    if (game.pendingResponse.type === "standard_skill") {
      const pending = game.pendingResponse;
      if (pending.eventId >= game.nextEventId) issue("Standard skill event id is not behind the monotonic counter");
      const validStages: Readonly<Record<string, readonly string[]>> = {
        jianxiong: ["invoke"],
        yiji: ["invoke", "yiji_distribute"],
        fankui: ["invoke", "fankui_select"],
        ganglie: ["invoke", "ganglie_punish"],
        tuxi: ["tuxi_select"],
        guanxing: ["invoke", "guanxing_reorder"],
        tieqi: ["invoke"],
        liuli: ["liuli_redirect"],
      };
      if (!validStages[pending.skillId]?.includes(pending.stage)) {
        issue("Standard skill id/stage combination is invalid");
      }
      const expectedPrompt = pending.skillId === "guanxing"
        ? `standard:${pending.eventId}:guanxing:${pending.targetId}:${pending.stage === "invoke" ? "invoke" : "reorder"}`
        : pending.skillId === "tuxi"
          ? `standard:${pending.eventId}:tuxi:${pending.targetId}:select`
          : pending.skillId === "yiji" && pending.stage === "yiji_distribute"
            ? `standard:${pending.eventId}:yiji:${pending.targetId}:distribute-${pending.aftermath?.remainingSkillIds.length ?? -1}`
            : pending.skillId === "fankui" && pending.stage === "fankui_select"
              ? `standard:${pending.eventId}:fankui:${pending.targetId}:select`
              : pending.skillId === "ganglie" && pending.stage === "ganglie_punish"
                ? `standard:${pending.eventId}:ganglie:${pending.targetId}:punish`
                : pending.skillId === "liuli"
                  ? `standard:${pending.eventId}:liuli:${pending.targetId}:redirect`
                  : pending.skillId === "tieqi" && pending.slash
                    ? `standard:${pending.eventId}:tieqi:${pending.targetId}:target-${pending.slash.targetId}`
                    : pending.stage === "invoke" && pending.aftermath
                      ? `standard:${pending.eventId}:${pending.skillId}:${pending.targetId}:invoke-${pending.aftermath.remainingSkillIds.length}`
                      : "";
      if (!expectedPrompt || pending.promptId !== expectedPrompt) issue("Standard skill prompt metadata is inconsistent");
      const requiresAftermath = ["jianxiong", "yiji", "fankui", "ganglie"].includes(pending.skillId);
      if (requiresAftermath && !pending.aftermath) issue("Damage skill prompt is missing its aftermath frame");
      if (!requiresAftermath && pending.aftermath) issue("Non-damage skill prompt carries an aftermath frame");
      const requiresSlash = pending.skillId === "tieqi" || pending.skillId === "liuli";
      if (requiresSlash && !pending.slash) issue("Slash skill prompt is missing its target frame");
      if (!requiresSlash && pending.slash) issue("Non-Slash skill prompt carries a target frame");
      if (pending.skillId === "ganglie" && pending.stage === "ganglie_punish") {
        if (
          !pending.aftermath ||
          pending.sourceId !== pending.aftermath.targetId ||
          pending.targetId !== pending.aftermath.sourceId
        ) issue("Ganglie punishment source metadata is inconsistent");
      } else if (pending.aftermath) {
        const expectedSourceId = pending.aftermath.sourceId ?? undefined;
        if (pending.sourceId !== expectedSourceId) issue("Damage skill source metadata is inconsistent");
        const causalSource = aftermathDamageSourceFromResume(pending.aftermath.resume);
        if (causalSource.known && pending.aftermath.sourceId !== causalSource.sourceId) {
          issue("Damage skill aftermath source disagrees with its causal continuation");
        }
      } else if (pending.sourceId !== undefined) {
        issue("Non-damage skill prompt carries source metadata");
      }
      const requiresSelectedCards =
        (pending.skillId === "guanxing" && pending.stage === "guanxing_reorder") ||
        (pending.skillId === "yiji" && pending.stage === "yiji_distribute");
      if (requiresSelectedCards !== (pending.selectedCardIds !== undefined)) {
        issue("Standard skill private-card metadata is inconsistent");
      }
      if (pending.iteration !== undefined) issue("Standard skill prompt carries unsupported iteration metadata");
      if (pending.skillId === "guanxing" && pending.stage === "guanxing_reorder") {
        const selected = pending.selectedCardIds ?? [];
        const top = game.deck.slice(-selected.length).reverse().map((card) => card.id);
        if (selected.length === 0 || new Set(selected).size !== selected.length || [...selected].sort().some((id, index) => id !== [...top].sort()[index])) {
          issue("Guanxing selection is not exactly the current top cards");
        }
      }
      if (pending.skillId === "yiji" && pending.stage === "yiji_distribute") {
        const owner = game.players.find((player) => player.id === pending.targetId);
        const selected = pending.selectedCardIds ?? [];
        const privateCards = owner ? Object.values(owner.extraPiles).flat().filter((card) => selected.includes(card.id)) : [];
        if (selected.length < 1 || selected.length > 2 || privateCards.length !== selected.length) {
          issue("Yiji viewed cards are not present in exactly one owner-private pile");
        }
      }
    }
    if (game.pendingResponse.type === "standard_judgment") {
      const pending = game.pendingResponse;
      const frame = pending.frame;
      const retrial = frame.stage === "retrial_window" ? frame.retrialOrder[frame.retrialCursor] : undefined;
      const post = frame.stage === "post_judgment_window" ? frame.postJudgmentOrder[frame.postJudgmentCursor] : undefined;
      const expectedPrompt = retrial
        ? `judgment:${frame.frameId}:retrial:${retrial.ownerId}:${frame.retrialCursor}`
        : post
          ? `judgment:${frame.frameId}:post:${post.ownerId}:${frame.postJudgmentCursor}`
          : "";
      if (!expectedPrompt || pending.promptId !== expectedPrompt || pending.targetId !== (retrial?.ownerId ?? post?.ownerId)) {
        issue("Standard judgment prompt cursor is inconsistent");
      }
      if (frame.frameId >= game.nextEventId || frame.stage === "awaiting_reveal" || frame.stage === "settled") {
        issue("Standard judgment frame stage/id is invalid for a pending prompt");
      }
      const contextMatchesFrame = pending.context.type === "delayed_trick"
        ? frame.reason.type === "delayed_trick" &&
          frame.reason.id === pending.context.delayedCard.kind &&
          frame.targetId === pending.context.playerId &&
          ["le_bu_si_shu", "bing_liang_cun_duan", "shan_dian"].includes(pending.context.delayedCard.kind)
        : pending.context.type === "luoshen"
          ? frame.reason.type === "skill" && frame.reason.id === "luoshen" && frame.targetId === pending.context.playerId
          : pending.context.type === "ganglie"
            ? frame.reason.type === "skill" && frame.reason.id === "ganglie" && frame.targetId === pending.context.aftermath.targetId
            : pending.context.type === "tieqi"
              ? frame.reason.type === "skill" && frame.reason.id === "tieqi" && frame.targetId === pending.context.slash.attackerId
              : frame.reason.type === "armor" && frame.reason.id === "ba_gua_zhen" && frame.targetId === pending.context.pending.targetId;
      if (!contextMatchesFrame) issue("Standard judgment context does not match its frame reason/target");
      if (pending.context.type === "ganglie") {
        const causalSource = aftermathDamageSourceFromResume(pending.context.aftermath.resume);
        if (causalSource.known && pending.context.aftermath.sourceId !== causalSource.sourceId) {
          issue("Ganglie aftermath source disagrees with its causal continuation");
        }
      }
      try {
        const frameCard = (game.resolvingCards ?? []).filter((card) => card.id === frame.cardId);
        assertJudgmentFrame({
          deck: game.deck as any,
          discard: game.discardPile as any,
          processing: { [String(frame.frameId)]: frameCard as any },
          players: game.players.map((player) => ({
            id: player.id,
            hand: player.hand as any,
            equipment: player.equipment as any,
            judgment: player.judgment as any,
            extraPiles: player.extraPiles as any,
          })),
        }, frame as any);
      } catch {
        issue("Standard judgment frame failed strict physical/derived validation");
      }
    }
    if (game.pendingResponse.type === "fanjian_suit") {
      const pending = game.pendingResponse;
      const source = game.players.find((player) => player.id === pending.attackerId);
      const target = game.players.find((player) => player.id === pending.targetId);
      const expectedPromptId = `skill:${pending.eventId}:fanjian:${pending.targetId}:0`;
      if (
        pending.promptId !== expectedPromptId ||
        pending.eventId >= game.nextEventId ||
        pending.attackerId === pending.targetId ||
        pending.attackerId !== game.currentPlayerId ||
        !source?.alive ||
        source.hand.length === 0 ||
        !target?.alive ||
        (game.turn.skillUseCounts.fanjian ?? 0) < 1
      ) {
        issue("Fanjian prompt state is inconsistent");
      }
    }
    if (game.pendingResponse.type === "lord_dispatch") {
      const pending = game.pendingResponse;
      const expectedFaction = pending.skillId === "hujia" ? "wei" : "shu";
      const expectedKind = pending.skillId === "hujia" ? "dodge" : "slash";
      const providerIds = [pending.targetId, ...pending.remainingProviderIds];
      const providersValid = providerIds.every((providerId) => {
        const provider = game.players.find((player) => player.id === providerId);
        return provider?.alive && provider.generalId !== null && getGeneralDefinition(provider.generalId).faction === expectedFaction;
      });
      const resumedKind = pending.resume.type === "respond"
        ? pending.resume.pending.type === "slash" ||
          (pending.resume.pending.type === "mass_attack" && pending.resume.pending.responseKind === "dodge")
          ? "dodge"
          : "slash"
        : "slash";
      if (
        pending.eventId >= game.nextEventId ||
        pending.promptId !== `lord:${pending.eventId}:${pending.skillId}:${pending.requesterId}:${pending.targetId}` ||
        pending.requiredFaction !== expectedFaction ||
        pending.responseKind !== expectedKind ||
        resumedKind !== expectedKind ||
        pending.method !== (pending.resume.type === "use_slash" ? "use" : "respond") ||
        pending.requesterId === pending.targetId ||
        new Set(providerIds).size !== providerIds.length ||
        !providersValid ||
        (pending.resume.type === "respond" && pending.resume.pending.targetId !== pending.requesterId) ||
        (pending.resume.type === "use_slash" && pending.skillId !== "jijiang")
      ) {
        issue("Lord dispatch prompt state is inconsistent");
      }
    }
    if (
      game.pendingResponse.type === "slash" &&
      (game.pendingResponse.dodgesPlayed ?? 0) >= (game.pendingResponse.requiredDodgeCount ?? 1)
    ) {
      issue("Slash response progress must remain below its required Dodge count");
    }
    if (
      game.pendingResponse.type === "duel" &&
      (game.pendingResponse.slashesPlayed ?? 0) >= (game.pendingResponse.requiredSlashCount ?? 1)
    ) {
      issue("Duel response progress must remain below its required Slash count");
    }
    if (game.turn.phase !== "respond") issue("Pending response exists outside respond phase");
  } else if (game.turn.phase === "respond") {
    issue("Respond phase has no pending response");
  }
  if (game.winner?.playerIds.some((id) => !knownPlayers.has(id))) issue("Winner references an unknown player");
  if ((game.status === "finished") !== (game.winner !== null)) issue("Game status and winner disagree");
});

const playerSchema = z.object({
  id: playerIdSchema,
  username: z.string().min(1).max(32),
  displayName: z.string().min(1).max(40),
  ready: z.boolean(),
  connected: z.boolean(),
  seat: z.number().int().min(0).max(9),
  isBot: z.boolean().default(false),
  // Started rooms retain departed players as hidden seat-roster tombstones so
  // their authoritative GameSession remains restorable after a leave/timeout.
  departed: z.boolean().default(false),
});

const roomSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(40),
  ownerId: playerIdSchema,
  status: z.enum(["waiting", "playing", "finished"]),
  maxPlayers: z.number().int().min(2).max(10),
  createdAt: z.string().datetime(),
  players: z.array(playerSchema).min(1).max(10),
  game: gameSessionSchema.optional(),
}).superRefine((room, context) => {
  const issue = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  const playerIds = room.players.map((player) => player.id);
  const activePlayerIds = room.players.filter((player) => !player.departed).map((player) => player.id);
  if (new Set(playerIds).size !== playerIds.length) issue("Room contains duplicate players");
  if (room.players.some((player, index) => player.seat !== index)) issue("Room seats are not contiguous");
  if (!activePlayerIds.includes(room.ownerId)) issue("Room owner is not an active member");
  if (room.players.length > room.maxPlayers) issue("Room exceeds maxPlayers");
  if (room.status === "waiting" && room.game) issue("Waiting room unexpectedly contains a game");
  if (room.status !== "waiting" && !room.game) issue("Started room has no game state");
  if (room.game) {
    const gamePlayerIds = room.game.players.map((player) => player.id);
    if (gamePlayerIds.length !== playerIds.length || gamePlayerIds.some((id, index) => id !== playerIds[index])) {
      issue("Room members and game players disagree");
    }
    if (room.status !== room.game.status) issue("Room status and game status disagree");
  }
});

const roomSnapshotSchema = z.object({
  version: z.literal(1),
  rooms: z.array(roomSchema).max(1_000),
}).superRefine((snapshot, context) => {
  const roomIds = snapshot.rooms.map((room) => room.id);
  const userIds = snapshot.rooms.flatMap((room) =>
    room.players.filter((player) => !player.departed).map((player) => player.id)
  );
  if (new Set(roomIds).size !== roomIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Snapshot contains duplicate rooms" });
  }
  if (new Set(userIds).size !== userIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "User appears in multiple rooms" });
  }
});

export type RoomSnapshotLoadResult =
  | { readonly kind: "empty" }
  | { readonly kind: "valid"; readonly snapshot: RoomServiceSnapshot }
  | { readonly kind: "invalid"; readonly reason: string };

/** Explicit v1 migration for counters added by the serializable card-use engine. */
function migrateRoomSnapshot(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const migrated = structuredClone(value) as Record<string, unknown>;
  if (!Array.isArray(migrated.rooms)) return migrated;
  for (const rawRoom of migrated.rooms) {
    if (!rawRoom || typeof rawRoom !== "object") continue;
    const room = rawRoom as Record<string, unknown>;
    if (!room.game || typeof room.game !== "object") continue;
    const game = room.game as Record<string, unknown>;
    if (game.nextUseId === undefined) game.nextUseId = 1;
    if (game.nextEventId === undefined) game.nextEventId = 1;
    const hadCompleteRules = game.completeRules !== undefined;
    try {
      const completeRules = migrateCompleteRulesEngineState(game.completeRules);
      if (!hadCompleteRules) completeRules.nextEventId = game.nextEventId as number;
      game.completeRules = completeRules;
    } catch {
      // Preserve an existing malformed/nonempty value so strict schema
      // validation rejects it; migration must never replace ambiguous state.
    }
    if (game.afterMove === undefined) {
      game.afterMove = { queuedTriggers: [], suspendedPhase: null, suspendedResponse: null };
    }
    if (game.turn && typeof game.turn === "object") {
      const turn = game.turn as Record<string, unknown>;
      if (turn.discardStage === undefined) turn.discardStage = "hand_limit";
    }
    if (Array.isArray(game.players)) {
      for (const rawPlayer of game.players) {
        if (!rawPlayer || typeof rawPlayer !== "object") continue;
        const player = rawPlayer as Record<string, unknown>;
        if (player.extraPiles === undefined) player.extraPiles = {};
        if (player.faceUp === undefined) player.faceUp = true;
      }
    }
  }
  return migrated;
}

export async function loadRoomSnapshot(pool: Pool): Promise<RoomSnapshotLoadResult> {
  const result = await pool.query<{ snapshot: unknown }>(
    "SELECT snapshot FROM room_state WHERE id = 1",
  );
  const value = result.rows[0]?.snapshot;
  if (value === undefined) return { kind: "empty" };
  const parsed = roomSnapshotSchema.safeParse(migrateRoomSnapshot(value));
  if (!parsed.success) {
    return { kind: "invalid", reason: parsed.error.issues.map((issue) => issue.message).join("; ").slice(0, 2_000) };
  }
  return { kind: "valid", snapshot: parsed.data as unknown as RoomServiceSnapshot };
}

export async function quarantineInvalidRoomSnapshot(pool: Pool, reason: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO room_state_quarantine (snapshot, reason)
       SELECT snapshot, $1 FROM room_state WHERE id = 1`,
      [reason],
    );
    await client.query("DELETE FROM room_state WHERE id = 1");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function saveRoomSnapshot(pool: Pool, snapshot: RoomServiceSnapshot): Promise<void> {
  await pool.query(
    `INSERT INTO room_state (id, snapshot, updated_at)
     VALUES (1, $1::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at = NOW()`,
    [JSON.stringify(snapshot)],
  );
}

/**
 * Keeps at most one unsaved snapshot. A burst of game actions therefore
 * coalesces to the newest state instead of building an unbounded Promise queue.
 * A transient database failure leaves the snapshot dirty and retries it.
 */
export class RoomSnapshotWriter {
  private pending: RoomServiceSnapshot | undefined;
  private running: Promise<void> | undefined;
  private retryTimer: NodeJS.Timeout | undefined;
  private stopped = false;

  constructor(
    private readonly pool: Pool,
    private readonly onError: (error: unknown) => void,
    private readonly retryMs = 1_000,
  ) {}

  enqueue(snapshot: RoomServiceSnapshot): void {
    this.pending = snapshot;
    if (!this.stopped) this.start();
  }

  private start(): void {
    if (this.running || !this.pending || this.stopped) return;
    const operation = this.drain();
    this.running = operation;
    void operation
      .catch(this.onError)
      .finally(() => {
        if (this.running === operation) this.running = undefined;
        if (this.pending && !this.stopped && !this.retryTimer) {
          this.retryTimer = setTimeout(() => {
            this.retryTimer = undefined;
            this.start();
          }, this.retryMs);
          this.retryTimer.unref();
        }
      });
  }

  private async drain(): Promise<void> {
    while (this.pending) {
      const snapshot = this.pending;
      this.pending = undefined;
      try {
        await saveRoomSnapshot(this.pool, snapshot);
      } catch (error) {
        // Keep the newer state if another mutation arrived during the write.
        this.pending ??= snapshot;
        throw error;
      }
    }
  }

  async flush(snapshot?: RoomServiceSnapshot): Promise<void> {
    if (snapshot) this.pending = snapshot;
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    if (this.running) {
      try {
        await this.running;
      } catch {
        // Retry the retained dirty snapshot once synchronously below.
      }
    }
    await this.drain();
  }
}
