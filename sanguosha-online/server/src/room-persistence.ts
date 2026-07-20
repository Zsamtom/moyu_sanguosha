import type { Pool } from "pg";
import { z } from "zod";
import {
  FULL_GENERAL_PACKS,
  FULL_GENERAL_IDS,
  FULL_SKILL_RULE_IDS,
  adjudicateGuhuoChallenge,
  applyAction,
  attackRangeFor,
  assertGeneralDraftForConfig,
  assertJudgmentFrame,
  assertPindianFrame,
  assertRestorableCardUseContinuation,
  assertRestorableDuelResponse,
  assertRestorableMassAttackResponse,
  assertRestorableNullificationResponse,
  assertRestorableSlashResponse,
  assertShenfenContinuation,
  assertWumouContinuation,
  assertYeyanContinuation,
  assertCompleteRulesEngineState,
  currentDyingEntrySaveSkill,
  currentDyingOwnerResponseSkill,
  currentDyingResponder,
  decodeGameDamageContinuation,
  distanceBetweenPlayers,
  getCardDefinition,
  getEffectiveGeneralSkillIds,
  getEffectivePlayerFaction,
  hasAwakened,
  markCount,
  migrateDyingFrame,
  migrateCompleteRulesEngineState,
  getGeneralDefinition,
  isGuhuoDeclarableKind,
  isSlashCardKind,
  pushDyingFrame,
  resolveHongyanSuit,
  standardPromptId,
  type CardUseContinuation,
  type CompleteRulesEngineState,
  type GeneralDraftState,
  type GameSession,
  type LifePlayerState,
  type PendingNullificationResponse,
  type PendingDeathResolution,
  type RoomRuleConfig,
  type StandardImplementedSkillId,
  validateRoomRuleConfig,
} from "@sanguosha/shared";
import {
  DEFAULT_SERVER_ROOM_RULE_CONFIG,
  type RoomServiceSnapshot,
} from "./rooms.js";

const playerIdSchema = z.string().uuid();
const generalIdSchema = z.enum(FULL_GENERAL_IDS);
const generalPackSchema = z.enum(FULL_GENERAL_PACKS);
const playableFactionSchema = z.enum(["wei", "shu", "wu", "qun"]);
const roleSchema = z.enum(["lord", "loyalist", "rebel", "renegade"]);
const generalSkillIdSchema = z.enum(FULL_SKILL_RULE_IDS);
const safeIntegerSchema = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const nonnegativeSafeIntegerSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positiveSafeIntegerSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const roomRuleConfigSchema = z.object({
  ruleSetVersion: z.literal("original-66-v1"),
  enabledGeneralPacks: z.array(generalPackSchema).min(1).max(FULL_GENERAL_PACKS.length),
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
const generalDraftSchema = z.object({
  version: z.literal(1),
  playerIds: z.array(playerIdSchema).min(2).max(10),
  allowDuplicateGenerals: z.boolean(),
  godFactionChoice: z.boolean(),
  roles: z.record(playerIdSchema, roleSchema).optional(),
  candidates: z.record(playerIdSchema, z.array(generalIdSchema).min(1).max(10)),
  selections: z.record(playerIdSchema, generalIdSchema.nullable()),
  factionSelections: z.record(playerIdSchema, playableFactionSchema.nullable()),
  stage: z.enum(["selecting_generals", "selecting_factions", "complete"]),
  rng: z.object({
    key: z.string().regex(/^[0-9a-f]{64}$/),
    counter: z.number().int().min(0).max(0xffff_ffff),
  }).strict(),
}).strict();
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
  // DyingStack validation needs the sibling player snapshot, which is only
  // available in gameSessionSchema.superRefine below.
  return value !== null && typeof value === "object" && !Array.isArray(value);
}, "Invalid complete-rules engine state");
const gamePlayerSchema = z.object({
  id: playerIdSchema,
  seat: z.number().int().min(0).max(9),
  role: roleSchema,
  generalId: generalIdSchema.nullable().default(null),
  godFaction: playableFactionSchema.nullable().default(null),
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
  haoshiActive: z.boolean().optional(),
  shuangxiongJudgmentColor: z.enum(["red", "black"]).nullable().optional(),
  slashRespondedInPlayPhase: z.boolean().default(false),
  activeSlashUses: nonnegativeSafeIntegerSchema.optional(),
  tianyiOutcome: z.enum(["win", "loss", "tie"]).nullable().optional(),
  skillUseCounts: z.record(generalSkillIdSchema, nonnegativeSafeIntegerSchema).default({}),
  rendeGivenCount: nonnegativeSafeIntegerSchema.default(0),
  rendeRecovered: z.boolean().default(false),
  normalTurnAnchorPlayerId: playerIdSchema.nullable().optional(),
  queuedExtraTurns: z.array(z.object({
    playerId: playerIdSchema,
    normalTurnAnchorPlayerId: playerIdSchema,
    grantedByTurnId: positiveSafeIntegerSchema,
    sourceSkillId: generalSkillIdSchema,
  }).strict()).max(10).optional(),
  fangquanSkippedPlay: z.boolean().optional(),
  discardPhaseStarted: z.boolean().optional(),
  discardPhaseHandCardIds: z.array(z.string().min(1).max(100)).max(200).optional(),
  qinyinInvoked: z.boolean().optional(),
  qinyinEventId: positiveSafeIntegerSchema.nullable().optional(),
  lianpoArmedOwnerIds: z.array(playerIdSchema).max(10).optional(),
}).strict();
const declinedLordSkillIdsSchema = z.array(z.enum(["hujia", "jijiang"])).max(2).optional();
const slashCompletionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("default") }).strict(),
  z.object({
    type: z.literal("turn_flow"),
    continuationId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    playerId: playerIdSchema,
    destination: z.enum(["play", "before_play", "discard_or_end"]),
  }).strict(),
  z.object({
    type: z.literal("luanwu"),
    eventId: positiveSafeIntegerSchema,
    ownerId: playerIdSchema,
    processedActorIds: z.array(playerIdSchema).max(9),
    remainingActorIds: z.array(playerIdSchema).max(9),
  }).strict(),
]);
const massAttackResponseSchema = z.object({
  type: z.literal("mass_attack"),
  attackerId: playerIdSchema,
  targetId: playerIdSchema,
  cardId: z.string().min(1).max(80),
  damageCardIds: z.array(z.string().min(1).max(100)).max(2).optional(),
  sourceSkillId: z.literal("luanji").optional(),
  cardKind: z.enum(["barbarian_invasion", "arrow_barrage"]),
  responseKind: z.enum(["slash", "dodge"]),
  effectiveSuit: z.enum(["spade", "heart", "club", "diamond"]).optional(),
  huoshouSourceId: playerIdSchema.nullable().optional(),
  remainingTargetIds: z.array(playerIdSchema).max(9),
  armorAttempted: z.boolean().optional(),
  declinedLordSkillIds: declinedLordSkillIdsSchema,
}).strict();
const slashResponseSchema = z.object({
  type: z.literal("slash"),
  attackerId: playerIdSchema,
  targetId: playerIdSchema,
  cardId: z.string().min(1).max(100),
  damageCardIds: z.array(z.string().min(1).max(100)).max(4).optional(),
  sourceSkillId: z.literal("shensu").optional(),
  slashKind: z.enum(["slash", "fire_slash", "thunder_slash"]).default("slash"),
  damage: z.number().int().positive().max(3).default(1),
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
  xiangleCheckedPlayerIds: z.array(playerIdSchema).max(10).default([]),
  jiangProcessedPlayerIds: z.array(playerIdSchema).max(10).default([]),
  liegongChecked: z.boolean().default(false),
  tieqiChecked: z.boolean().default(false),
  useProvenance: z.object({
    method: z.enum(["use", "respond", "recast"]),
    turnPlayerId: playerIdSchema,
    phase: z.enum(["prepare", "judgment", "draw", "play", "respond", "discard", "end"]),
  }).strict().optional(),
  excludedRedirectTargetIds: z.array(playerIdSchema).max(10).optional(),
  dodgeProhibited: z.boolean().default(false),
  completion: slashCompletionSchema.default({ type: "default" }),
  declinedLordSkillIds: declinedLordSkillIdsSchema,
}).strict();
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
  additionalPhysicalCards: z.array(z.object({
    id: z.string().min(1).max(80),
    kind: cardKindSchema,
    suit: z.enum(["spade", "heart", "club", "diamond"]),
    rank: z.number().int().min(1).max(13),
  }).strict()).max(1).optional(),
  targetIds: z.array(playerIdSchema).max(10),
  method: z.enum(["use", "respond", "recast"]),
  viaSkill: generalSkillIdSchema.nullable(),
}).strict();
const skillTriggerRefSchema = z.object({
  triggerId: z.string().min(1).max(200),
  eventId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  ownerId: playerIdSchema,
  skillId: generalSkillIdSchema,
  targetIndex: z.number().int().nonnegative().max(10),
  mandatory: z.boolean(),
  moveBatchId: positiveSafeIntegerSchema.optional(),
  cardIds: z.array(z.string().min(1).max(100)).max(200).optional(),
}).strict();
const cardUseContinuationSchema = z.object({
  type: z.literal("card_use"),
  intent: cardUseIntentSchema,
  stage: z.enum(["card_use_declared", "targets_confirmed"]),
  eventId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  remainingTriggers: z.array(skillTriggerRefSchema).max(100),
}).strict();
const trickEffectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ex_nihilo"), sourceId: playerIdSchema, targetId: playerIdSchema, cardId: z.string().min(1).max(80) }).strict(),
  z.object({ type: z.literal("duel"), sourceId: playerIdSchema, targetId: playerIdSchema, cardId: z.string().min(1).max(80) }).strict(),
  z.object({ type: z.literal("mass_attack"), pending: massAttackResponseSchema }).strict(),
  z.object({
    type: z.literal("peach_garden"), sourceId: playerIdSchema, targetId: playerIdSchema,
    cardId: z.string().min(1).max(80), remainingTargetIds: z.array(playerIdSchema).max(9),
  }).strict(),
  z.object({
    type: z.literal("delayed_trick"), sourceId: playerIdSchema, targetId: playerIdSchema,
    cardId: z.string().min(1).max(80), cardKind: z.enum(["le_bu_si_shu", "bing_liang_cun_duan", "shan_dian"]),
  }).strict(),
  z.object({
    type: z.literal("zone_trick"), sourceId: playerIdSchema, targetId: playerIdSchema,
    cardId: z.string().min(1).max(80), cardKind: z.enum(["guo_he_chai_qiao", "shun_shou_qian_yang"]),
  }).strict(),
  z.object({ type: z.literal("fire_attack"), sourceId: playerIdSchema, targetId: playerIdSchema, cardId: z.string().min(1).max(80) }).strict(),
  z.object({
    type: z.literal("borrowed_sword"), sourceId: playerIdSchema, targetId: playerIdSchema,
    attackTargetId: playerIdSchema, cardId: z.string().min(1).max(80),
  }).strict(),
  z.object({
    type: z.literal("iron_chain"), sourceId: playerIdSchema, targetId: playerIdSchema,
    cardId: z.string().min(1).max(80), remainingTargetIds: z.array(playerIdSchema).max(2),
  }).strict(),
  z.object({
    type: z.literal("amazing_grace"), sourceId: playerIdSchema, targetId: playerIdSchema,
    cardId: z.string().min(1).max(80), pool: z.array(cardSchema).max(10), remainingTargetIds: z.array(playerIdSchema).max(9),
  }).strict(),
]);
const nullificationResponseSchema = z.object({
  type: z.literal("nullification"),
  attackerId: playerIdSchema,
  targetId: playerIdSchema,
  effectTargetId: playerIdSchema,
  cardId: z.string().min(1).max(80),
  cardKind: z.enum(["ex_nihilo", "duel", "barbarian_invasion", "arrow_barrage", "peach_garden", "le_bu_si_shu", "bing_liang_cun_duan", "shan_dian", "guo_he_chai_qiao", "shun_shou_qian_yang", "fire_attack", "amazing_grace", "borrowed_sword", "iron_chain"]),
  remainingResponderIds: z.array(playerIdSchema).max(9),
  negated: z.boolean(),
  effect: trickEffectSchema,
}).strict();

const wumouContinuationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("trick_effect"),
    cardKind: z.enum(["ex_nihilo", "duel", "barbarian_invasion", "arrow_barrage", "peach_garden", "guo_he_chai_qiao", "shun_shou_qian_yang", "fire_attack", "amazing_grace", "borrowed_sword", "iron_chain"]),
    effect: trickEffectSchema,
  }).strict(),
  z.object({
    type: z.literal("finish_trick"),
    sourceId: playerIdSchema,
    cardId: z.string().min(1).max(100),
    cardKind: z.enum(["peach_garden", "amazing_grace"]),
  }).strict(),
  z.object({
    type: z.literal("finish_mass_attack"),
    sourceId: playerIdSchema,
    cardId: z.string().min(1).max(100),
    damageCardIds: z.array(z.string().min(1).max(100)).max(2),
    sourceSkillId: z.literal("luanji").optional(),
    cardKind: z.enum(["barbarian_invasion", "arrow_barrage"]),
  }).strict(),
  z.object({
    type: z.literal("nullification"),
    responderId: playerIdSchema,
    responseCardId: z.string().min(1).max(100),
    pending: nullificationResponseSchema,
  }).strict(),
]);

const shenfenContinuationSchema = z.object({
  eventId: positiveSafeIntegerSchema,
  ownerId: playerIdSchema,
  targetIds: z.array(playerIdSchema).max(9),
  stage: z.enum(["damage", "equipment", "hand", "turn_over"]),
  nextTargetIndex: nonnegativeSafeIntegerSchema,
}).strict();

const yeyanContinuationSchema = z.object({
  eventId: positiveSafeIntegerSchema,
  ownerId: playerIdSchema,
  greaterYeyan: z.boolean(),
  costCardIds: z.array(z.string().min(1).max(100)).max(4),
  allocations: z.array(z.object({
    targetId: playerIdSchema,
    amount: z.number().int().positive().max(3),
  }).strict()).max(3),
  stage: z.enum(["after_cost", "damage"]),
  nextAllocationIndex: nonnegativeSafeIntegerSchema,
}).strict();

const baseDyingResumeSchema = z.union([
  z.object({ type: z.literal("finish_effect") }).strict(),
  z.object({ type: z.literal("turn_start") }).strict(),
  z.object({ type: z.literal("mass_attack"), pending: massAttackResponseSchema }).strict(),
  z.object({ type: z.literal("slash_sequence"), pending: slashResponseSchema }).strict(),
  z.object({ type: z.literal("skill"), skillId: z.literal("kurou"), playerId: playerIdSchema }).strict(),
  z.object({
    type: z.literal("qiangxi"),
    eventId: positiveSafeIntegerSchema,
    sourceId: playerIdSchema,
    damageTargetId: playerIdSchema,
    distanceBeforePayment: nonnegativeSafeIntegerSchema,
    attackRangeBeforePayment: positiveSafeIntegerSchema,
  }).strict(),
  z.object({
    type: z.literal("leiji"),
    resume: z.discriminatedUnion("type", [
      z.object({ type: z.literal("slash"), pending: slashResponseSchema }).strict(),
      z.object({ type: z.literal("mass_attack"), pending: massAttackResponseSchema }).strict(),
    ]),
  }).strict(),
  z.object({ type: z.literal("forest_end"), playerId: playerIdSchema }).strict(),
  z.object({
    type: z.literal("qinyin"),
    ownerId: playerIdSchema,
    eventId: positiveSafeIntegerSchema,
    targetIds: z.array(playerIdSchema).max(10),
    nextTargetIndex: nonnegativeSafeIntegerSchema,
  }).strict(),
  z.object({
    type: z.literal("luanwu"),
    eventId: positiveSafeIntegerSchema,
    ownerId: playerIdSchema,
    processedActorIds: z.array(playerIdSchema).max(9),
    remainingActorIds: z.array(playerIdSchema).max(9),
  }).strict(),
  z.object({
    type: z.literal("wumou"),
    ownerId: playerIdSchema,
    eventId: positiveSafeIntegerSchema,
    continuation: wumouContinuationSchema,
  }).strict(),
  z.object({ type: z.literal("shenfen"), continuation: shenfenContinuationSchema }).strict(),
  z.object({ type: z.literal("yeyan"), continuation: yeyanContinuationSchema }).strict(),
]);
const damageFlowDyingResumeSchema = z.object({
  type: z.literal("damage_flow"),
  frameId: positiveSafeIntegerSchema,
  damageId: positiveSafeIntegerSchema,
  dyingId: positiveSafeIntegerSchema,
}).strict();

const damageOpportunityCursorSchema = z.object({
  actionId: positiveSafeIntegerSchema,
  promptId: positiveSafeIntegerSchema,
  frameId: positiveSafeIntegerSchema,
  damageId: positiveSafeIntegerSchema,
  windowId: positiveSafeIntegerSchema,
  opportunityId: z.string().min(1).max(240),
  ownerId: playerIdSchema,
  expectedRevision: nonnegativeSafeIntegerSchema,
}).strict();

const pendingRecoverySchema = z.object({
  eventId: positiveSafeIntegerSchema,
  targetId: playerIdSchema,
  sourceId: playerIdSchema.nullable(),
  hpBefore: z.number().int().min(-10).max(10),
  requestedAmount: z.number().int().positive().max(10),
  remainingAmount: z.number().int().positive().max(10),
  reason: z.string().min(1).max(120),
  dyingRescue: z.object({
    frameId: positiveSafeIntegerSchema,
    responderId: playerIdSchema,
    cardKind: z.enum(["peach", "wine", "view_as_peach", "view_as_wine"]),
    viewAsSkillId: z.enum(["jijiu", "guhuo", "jiuchi", "longhun"]).nullable(),
    useId: positiveSafeIntegerSchema,
    cardUseFrameId: positiveSafeIntegerSchema,
    physicalCardId: z.string().min(1).max(100),
    physicalCards: z.array(z.object({
      physicalCardId: z.string().min(1).max(100),
      from: z.enum(["hand", "equipment"]),
      equipmentSlot: z.enum(["weapon", "armor", "offensive_horse", "defensive_horse"]).optional(),
    }).strict()).max(4).optional(),
    from: z.enum(["hand", "equipment"]),
    equipmentSlot: z.enum(["weapon", "armor", "offensive_horse", "defensive_horse"]).optional(),
    moveBatchId: positiveSafeIntegerSchema,
    effectiveSuit: z.enum(["spade", "heart", "club", "diamond"]),
    suitModifierSkillId: z.literal("hongyan").nullable(),
  }).strict().optional(),
}).strict().superRefine((recovery, refine) => {
  if (recovery.remainingAmount > recovery.requestedAmount) {
    refine.addIssue({ code: z.ZodIssueCode.custom, message: "Recovery remainder exceeds its request" });
  }
  if (recovery.dyingRescue &&
    (recovery.dyingRescue.from === "equipment") !== (recovery.dyingRescue.equipmentSlot !== undefined)
  ) {
    refine.addIssue({ code: z.ZodIssueCode.custom, message: "Recovery source zone is inconsistent" });
  }
});

const standardImplementedSkillIdSchema = generalSkillIdSchema;
const standardDamageSkillIdSchema = z.enum(["jianxiong", "yiji", "fankui", "ganglie"]);
const standardSkillStageSchema = z.enum([
  "invoke", "guanxing_reorder", "tuxi_select", "yiji_distribute", "fankui_select", "ganglie_punish",
  "liuli_redirect", "buqu_recovery", "tianxiang_redirect", "jushou_dispose", "jushou_finish",
  "shensu_judgment_draw", "shensu_play", "leiji_target", "leiji_judgment_retrial",
  "leiji_judgment_post", "mengjin_discard", "mengjin_finish", "jieming_target", "shuangxiong_draw",
  "haoshi_draw", "haoshi_transfer", "dimeng_swap", "zaiqi_draw", "zaiqi_finish", "yinghun_select",
  "yinghun_discard", "yinghun_finish", "benghuai_choice", "luanwu_slash", "xingshang_claim",
  "fangzhu_target", "songwei_invoke", "baonue_invoke", "lieren_invoke", "lieren_gain", "beige_cost",
  "beige_source_discard", "huashen_initial", "huashen_turn_start", "huashen_turn_end", "xinsheng_invoke",
  "tiaoxin_response", "tiaoxin_discard", "xiangle_payment", "jiang_invoke", "yingyang_modify",
  "zhiba_accept", "zhiba_gain", "zhijian_finish", "tuntian_invoke", "zhiji_choice", "fangquan_skip",
  "fangquan_finish", "fangquan_complete", "qiaobian_skip", "qiaobian_after_cost", "qiaobian_draw",
  "qiaobian_play", "qiaobian_finish", "guzheng_claim", "guixin_invoke", "guixin_select", "wuhun_target",
  "qinyin_choice", "lianpo_choice", "wumou_choice", "shenfen_discard_hand", "shenfen_continue",
  "yeyan_after_cost", "shelie_invoke", "shelie_select", "gongxin_choose", "qixing_initial",
  "qixing_exchange", "jilue_wansha", "jilue_fangzhu", "jilue_zhiheng_finish", "kuangfeng_choice",
  "dawu_choice",
]);

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
  z.object({ type: z.literal("standard_damage"), aftermath: standardDamageAftermathSchema }).strict(),
  z.object({ type: z.literal("guhuo"), pending: guhuoConsequenceSchema }).strict(),
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
  }).strict(),
]));

const dyingResumeSchema: z.ZodTypeAny = z.lazy(() => z.union([
  businessDyingResumeSchema,
  damageFlowDyingResumeSchema,
]));

const pendingDyingResponseSchema = z.object({
  type: z.literal("dying"),
  frameId: positiveSafeIntegerSchema,
  victimId: playerIdSchema,
  damageSourceId: playerIdSchema.nullable(),
  targetId: playerIdSchema,
  remainingResponderIds: z.array(playerIdSchema).max(9),
  resume: dyingResumeSchema,
}).strict();

const guhuoRespondableSchema = z.union([
  slashResponseSchema,
  duelResponseSchema,
  massAttackResponseSchema,
  nullificationResponseSchema,
  borrowedSwordResponseSchema,
  pendingDyingResponseSchema,
]);

const guhuoContinuationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("use"), intent: cardUseIntentSchema }).strict(),
  z.object({ type: z.literal("respond"), pending: guhuoRespondableSchema }).strict(),
]);

const guhuoChallengeSchema = z.object({
  type: z.literal("guhuo"),
  stage: z.literal("challenge"),
  eventId: positiveSafeIntegerSchema,
  sourceId: playerIdSchema,
  targetId: playerIdSchema,
  physicalCardId: z.string().min(1).max(100),
  declaredKind: cardKindSchema,
  continuation: guhuoContinuationSchema,
  promptId: z.string().min(1).max(240),
  challengeCursor: nonnegativeSafeIntegerSchema,
  challengerIds: z.array(playerIdSchema).max(9),
  remainingChallengeIds: z.array(playerIdSchema).max(9),
}).strict();

const guhuoConsequenceSchema = z.object({
  type: z.literal("guhuo"),
  stage: z.literal("consequence"),
  eventId: positiveSafeIntegerSchema,
  sourceId: playerIdSchema,
  targetId: playerIdSchema,
  physicalCardId: z.string().min(1).max(100),
  declaredKind: cardKindSchema,
  continuation: guhuoContinuationSchema,
  effectiveSuit: z.enum(["spade", "heart", "club", "diamond"]),
  outcome: z.enum(["unchallenged", "challenged_truthful_heart", "challenged_truthful_non_heart", "challenged_false"]),
  continuesAsDeclared: z.boolean(),
  consequenceEffect: z.enum(["lose_hp", "draw"]).nullable(),
  challengerIds: z.array(playerIdSchema).max(9),
  consequenceCursor: nonnegativeSafeIntegerSchema,
  remainingConsequenceIds: z.array(playerIdSchema).max(9),
}).strict();

const guhuoSchema = z.discriminatedUnion("stage", [guhuoChallengeSchema, guhuoConsequenceSchema]);

const pendingDeathResolutionSchema: z.ZodTypeAny = z.lazy(() => z.object({
  frameId: positiveSafeIntegerSchema,
  rewards: z.boolean(),
  checkWinner: z.boolean(),
  logKind: z.enum(["normal", "forfeit"]),
  remainingOwnerIds: z.array(playerIdSchema).max(9),
  completion: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("dying"),
      frameId: positiveSafeIntegerSchema,
      resume: dyingResumeSchema,
    }).strict(),
    z.object({ type: z.literal("direct"), resume: dyingResumeSchema }).strict(),
    z.object({ type: z.literal("wuhun"), parent: pendingDeathResolutionSchema }).strict(),
    z.object({ type: z.literal("none") }).strict(),
  ]),
  wuhunResolved: z.boolean().optional(),
}).strict());

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
const pindianFrameSchema = z.object({
  type: z.literal("pindian"),
  frameId: positiveSafeIntegerSchema,
  initiatorId: playerIdSchema,
  targetId: playerIdSchema,
  reasonSkillId: z.string().min(1).max(80),
  stage: z.enum(["selecting", "ready_to_reveal", "modifying", "compared", "settled"]),
  selections: z.record(playerIdSchema, z.string().min(1).max(100)),
  revealedRanks: z.record(playerIdSchema, z.number().int().min(1).max(13)),
  effectiveRanks: z.record(playerIdSchema, z.number().int().min(1).max(13)),
  rankModifiers: z.array(z.object({
    playerId: playerIdSchema,
    skillId: z.string().min(1).max(80),
    delta: z.number().int().min(-12).max(12),
    rankBefore: z.number().int().min(1).max(13),
    rankAfter: z.number().int().min(1).max(13),
  }).strict()).max(20),
  result: z.object({
    initiatorRank: z.number().int().min(1).max(13),
    targetRank: z.number().int().min(1).max(13),
    winnerId: playerIdSchema.nullable(),
    initiatorWon: z.boolean(),
    tied: z.boolean(),
  }).strict().nullable(),
  settledDestinations: z.record(playerIdSchema, judgmentZoneRefSchema),
}).strict();
const pendingPindianSchema = z.object({
  type: z.literal("pindian"),
  eventId: positiveSafeIntegerSchema,
  targetId: playerIdSchema,
  promptId: z.string().min(1).max(240),
  skillId: z.enum(["tianyi", "quhu", "lieren", "zhiba"]),
  frame: pindianFrameSchema,
  continuation: z.discriminatedUnion("type", [
    z.object({ type: z.literal("tianyi") }).strict(),
    z.object({ type: z.literal("quhu"), damageTargetId: playerIdSchema }).strict(),
    z.object({ type: z.literal("lieren"), damageOpportunity: damageOpportunityCursorSchema }).strict(),
    z.object({ type: z.literal("zhiba") }).strict(),
  ]),
}).strict();
const qiangxiEffectSchema = z.object({
  type: z.literal("qiangxi_effect"),
  eventId: positiveSafeIntegerSchema,
  sourceId: playerIdSchema,
  targetId: playerIdSchema,
  damageTargetId: playerIdSchema,
  distanceBeforePayment: positiveSafeIntegerSchema,
  attackRangeBeforePayment: positiveSafeIntegerSchema,
}).strict();
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
    replacementFrom: judgmentZoneRefSchema.optional(),
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
      ...(resume.type === "slash_sequence" && resume.pending.useProvenance
        ? [resume.pending.useProvenance.turnPlayerId]
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
  if (resume?.type === "guhuo") return guhuoPlayerIds(resume.pending);
  if (resume?.type === "qiangxi") return [resume.sourceId, resume.damageTargetId];
  if (resume?.type === "leiji") return suspendedResponsePlayerIds(resume.resume.pending);
  if (resume?.type === "forest_end") return [resume.playerId];
  if (resume?.type === "qinyin") return [resume.ownerId, ...resume.targetIds];
  if (resume?.type === "luanwu") return [resume.ownerId, ...resume.processedActorIds, ...resume.remainingActorIds];
  if (resume?.type === "wumou") return [resume.ownerId, ...wumouContinuationPlayerIds(resume.continuation)];
  if (resume?.type === "shenfen") return [resume.continuation.ownerId, ...resume.continuation.targetIds];
  if (resume?.type === "yeyan") {
    return [resume.continuation.ownerId, ...resume.continuation.allocations.map((entry: any) => entry.targetId)];
  }
  return baseDyingResumePlayerIds(resume);
}

function guhuoPlayerIds(pending: any): string[] {
  const continuationIds = pending.continuation?.type === "use"
    ? [pending.continuation.intent.sourceId, ...pending.continuation.intent.targetIds]
    : pending.continuation?.type === "respond"
      ? suspendedResponsePlayerIds(pending.continuation.pending)
      : [];
  return [
    pending.sourceId,
    pending.targetId,
    ...(pending.challengerIds ?? []),
    ...(pending.remainingChallengeIds ?? []),
    ...(pending.remainingConsequenceIds ?? []),
    ...continuationIds,
  ];
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
    z.object({
      type: z.literal("use_slash"),
      targetIds: z.array(playerIdSchema).min(1).max(3),
      ignoreUseLimit: z.boolean().optional(),
      completion: slashCompletionSchema.optional(),
      failureResume: z.lazy(() => standardSkillResponseSchema).optional(),
    }).strict(),
    z.object({ type: z.literal("respond"), pending: lordDispatchableResponseSchema }),
  ]),
});

const standardJudgmentContextSchema: z.ZodTypeAny = z.lazy(() => z.discriminatedUnion("type", [
  z.object({ type: z.literal("delayed_trick"), playerId: playerIdSchema, delayedCard: cardSchema }),
  z.object({ type: z.literal("luoshen"), playerId: playerIdSchema, iteration: nonnegativeSafeIntegerSchema }),
  z.object({ type: z.literal("shuangxiong"), playerId: playerIdSchema }).strict(),
  z.object({
    type: z.literal("tuntian"),
    ownerId: playerIdSchema,
    moveBatchId: positiveSafeIntegerSchema,
  }).strict(),
  z.object({
    type: z.literal("ganglie"),
    aftermath: standardDamageAftermathSchema.optional(),
    damageOpportunity: damageOpportunityCursorSchema.optional(),
  }),
  z.object({
    type: z.literal("wuhun"),
    ownerId: playerIdSchema,
    deathResolution: pendingDeathResolutionSchema,
  }).strict(),
  z.object({
    type: z.literal("baonue"),
    ownerId: playerIdSchema,
    damageOpportunity: damageOpportunityCursorSchema,
  }).strict(),
  z.object({
    type: z.literal("beige"),
    ownerId: playerIdSchema,
    costCard: cardSchema,
    costZone: z.enum(["hand", "equipment"]),
    damageOpportunity: damageOpportunityCursorSchema,
  }).strict(),
  z.object({ type: z.literal("tieqi"), slash: slashResponseSchema }),
  z.object({
    type: z.literal("armor"),
    pending: z.discriminatedUnion("type", [slashResponseSchema, massAttackResponseSchema]),
    sourceSkillId: z.enum(["ba_gua_zhen", "bazhen"]).optional(),
  }),
]));

const standardJudgmentResponseSchema = z.object({
  type: z.literal("standard_judgment"),
  targetId: playerIdSchema,
  promptId: z.string().min(1).max(240),
  frame: judgmentFrameSchema,
  context: standardJudgmentContextSchema,
  tianduClaimed: z.boolean(),
  songweiProcessedOwnerIds: z.array(playerIdSchema).max(10).optional(),
});

const leijiDodgeSchema = z.object({
  dodgeEventId: z.string().min(1).max(240),
  attributedPlayerId: playerIdSchema,
  method: z.enum(["use", "respond"]),
  provenance: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("physical"),
      cardId: z.string().min(1).max(100),
      printedKind: cardKindSchema,
    }).strict(),
    z.object({
      type: z.literal("view_as"),
      skillId: z.union([generalSkillIdSchema, z.literal("ba_gua_zhen")]),
      physicalCardIds: z.array(z.string().min(1).max(100)).max(4),
    }).strict(),
  ]),
  resume: z.discriminatedUnion("type", [
    z.object({ type: z.literal("slash"), pending: slashResponseSchema }).strict(),
    z.object({ type: z.literal("mass_attack"), pending: massAttackResponseSchema }).strict(),
  ]),
}).strict();

const standardSkillResponseSchema = z.object({
  type: z.literal("standard_skill"),
  targetId: playerIdSchema,
  promptId: z.string().min(1).max(240),
  eventId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  skillId: standardImplementedSkillIdSchema,
  stage: standardSkillStageSchema,
  aftermath: standardDamageAftermathSchema.optional(),
  slash: slashResponseSchema.optional(),
  duel: duelResponseSchema.optional(),
  cardUse: cardUseContinuationSchema.optional(),
  pindian: pendingPindianSchema.optional(),
  sourceId: playerIdSchema.optional(),
  selectedCardIds: z.array(z.string().min(1).max(100)).max(200).optional(),
  handCardIds: z.array(z.string().min(1).max(100)).max(200).optional(),
  starCardIds: z.array(z.string().min(1).max(100)).max(200).optional(),
  targetIds: z.array(playerIdSchema).max(10).optional(),
  processedPlayerIds: z.array(playerIdSchema).max(10).optional(),
  targetHandCardIds: z.tuple([
    z.array(z.string().min(1).max(100)).max(200),
    z.array(z.string().min(1).max(100)).max(200),
  ]).optional(),
  requestedCount: nonnegativeSafeIntegerSchema.optional(),
  mode: z.enum(["draw_x_discard_one", "draw_one_discard_x", "all_recover_one", "all_lose_one_hp"]).optional(),
  phase: z.enum(["judgment", "draw", "play", "discard"]).optional(),
  moveBatchId: positiveSafeIntegerSchema.optional(),
  iteration: nonnegativeSafeIntegerSchema.optional(),
  damageOpportunity: damageOpportunityCursorSchema.optional(),
  recovery: pendingRecoverySchema.optional(),
  leijiDodge: leijiDodgeSchema.optional(),
  judgment: judgmentFrameSchema.optional(),
  tianduClaimed: z.boolean().optional(),
  deathResolution: pendingDeathResolutionSchema.optional(),
  wumouContinuation: wumouContinuationSchema.optional(),
  shenfenContinuation: shenfenContinuationSchema.optional(),
  yeyanContinuation: yeyanContinuationSchema.optional(),
}).strict();

const pendingResponseSchema = z.union([
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
    damageOpportunity: damageOpportunityCursorSchema.optional(),
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
  nullificationResponseSchema,
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
  guhuoSchema,
  pendingPindianSchema,
  qiangxiEffectSchema,
  pendingDyingResponseSchema,
  z.object({
    type: z.literal("skill_choice"),
    targetId: playerIdSchema,
    skillId: z.enum(["luoyi", "keji", "yingzi", "biyue", "luoshen", "jizhi", "jilue", "lianying", "xiaoji", "buqu", "niepan"]),
    resume: z.discriminatedUnion("type", [
      z.object({ type: z.literal("finish_draw"), playerId: playerIdSchema }),
      z.object({
        type: z.literal("enter_discard"),
        playerId: playerIdSchema,
        count: z.number().int().min(0).max(200),
      }),
      z.object({ type: z.literal("continue_judgment"), playerId: playerIdSchema }),
      z.object({ type: z.literal("finish_turn"), playerId: playerIdSchema }),
      z.object({
        type: z.literal("dying"),
        frameId: positiveSafeIntegerSchema,
        resume: dyingResumeSchema,
        buquLoss: z.object({
          hpBefore: safeIntegerSchema,
          amount: positiveSafeIntegerSchema,
        }).strict().optional(),
      }).strict(),
      z.object({ type: z.literal("after_move"), eventId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }),
      cardUseContinuationSchema,
    ]),
    promptId: z.string().min(1).max(240).optional(),
    triggerId: z.string().min(1).max(200).optional(),
    markCount: nonnegativeSafeIntegerSchema.optional(),
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

function slashProvenancePlayerIds(pending: z.infer<typeof slashResponseSchema>): string[] {
  return pending.useProvenance ? [pending.useProvenance.turnPlayerId] : [];
}

function deathResolutionPlayerIds(pending: PendingDeathResolution): string[] {
  const completion = pending.completion;
  return [
    ...pending.remainingOwnerIds,
    ...(completion.type === "dying" || completion.type === "direct"
      ? dyingResumePlayerIds(completion.resume)
      : completion.type === "wuhun"
        ? deathResolutionPlayerIds(completion.parent)
        : []),
  ];
}

function lordDispatchablePlayerIds(pending: z.infer<typeof lordDispatchableResponseSchema>): string[] {
  return [
    pending.attackerId,
    pending.targetId,
    ...(pending.type === "slash" || pending.type === "mass_attack" ? pending.remainingTargetIds : []),
    ...(pending.type === "slash" && pending.completion.type === "turn_flow" ? [pending.completion.playerId] : []),
    ...(pending.type === "slash" ? slashProvenancePlayerIds(pending) : []),
    ...(pending.type === "duel" ? [pending.initiatorId, pending.originalTargetId] : []),
    ...(pending.type === "borrowed_sword" ? [pending.attackTargetId] : []),
  ];
}

function trickEffectPlayerIds(effect: z.infer<typeof trickEffectSchema>): string[] {
  if (effect.type === "mass_attack") {
    return [effect.pending.attackerId, effect.pending.targetId, ...effect.pending.remainingTargetIds];
  }
  return [
    effect.sourceId,
    effect.targetId,
    ...(effect.type === "peach_garden" || effect.type === "iron_chain" || effect.type === "amazing_grace"
      ? effect.remainingTargetIds
      : []),
    ...(effect.type === "borrowed_sword" ? [effect.attackTargetId] : []),
  ];
}

function wumouContinuationPlayerIds(continuation: z.infer<typeof wumouContinuationSchema>): string[] {
  if (continuation.type === "trick_effect") return trickEffectPlayerIds(continuation.effect);
  if (continuation.type === "nullification") {
    return [continuation.responderId, ...suspendedResponsePlayerIds(continuation.pending)];
  }
  return [continuation.sourceId];
}

function suspendedResponsePlayerIds(pending: PersistedPendingResponse): string[] {
  if (pending.type === "guhuo") return guhuoPlayerIds(pending);
  if (pending.type === "pindian") {
    return [
      pending.targetId,
      pending.frame.initiatorId,
      pending.frame.targetId,
      ...(pending.continuation.type === "quhu" ? [pending.continuation.damageTargetId] : []),
      ...(pending.continuation.type === "lieren" ? [pending.continuation.damageOpportunity.ownerId] : []),
    ];
  }
  if (pending.type === "qiangxi_effect") {
    return [pending.sourceId, pending.targetId, pending.damageTargetId];
  }
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
    if (pending.resume.type === "dying") {
      return [pending.targetId, ...dyingResumePlayerIds(pending.resume.resume)];
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
        ? [
            ...pending.resume.targetIds,
            ...(pending.resume.failureResume
              ? suspendedResponsePlayerIds(pending.resume.failureResume)
              : []),
          ]
        : lordDispatchablePlayerIds(pending.resume.pending)),
    ];
  }
  if (pending.type === "standard_judgment") {
    const context = pending.context;
    return [
      pending.targetId,
      pending.frame.targetId,
      ...(pending.songweiProcessedOwnerIds ?? []),
      ...pending.frame.retrialOrder.map((entry) => entry.ownerId),
      ...pending.frame.postJudgmentOrder.map((entry) => entry.ownerId),
      ...(context.type === "delayed_trick" || context.type === "luoshen" ? [context.playerId] : []),
      ...(context.type === "shuangxiong" ? [context.playerId] : []),
      ...(context.type === "tuntian" ? [context.ownerId] : []),
      ...(context.type === "ganglie" && context.aftermath
        ? [context.aftermath.targetId, ...(context.aftermath.sourceId ? [context.aftermath.sourceId] : []), ...dyingResumePlayerIds(context.aftermath.resume)]
        : context.type === "ganglie" && context.damageOpportunity
          ? [context.damageOpportunity.ownerId]
          : []),
      ...(context.type === "baonue" || context.type === "beige"
        ? [context.ownerId, context.damageOpportunity.ownerId]
        : []),
      ...(context.type === "wuhun"
        ? [context.ownerId, ...deathResolutionPlayerIds(context.deathResolution)]
        : []),
      ...(context.type === "tieqi" ? [context.slash.attackerId, context.slash.targetId, ...context.slash.remainingTargetIds, ...slashCompletionPlayerIds(context.slash), ...slashProvenancePlayerIds(context.slash)] : []),
      ...(context.type === "armor" ? [
        context.pending.attackerId,
        context.pending.targetId,
        ...context.pending.remainingTargetIds,
        ...(context.pending.type === "slash" ? [...slashCompletionPlayerIds(context.pending), ...slashProvenancePlayerIds(context.pending)] : []),
      ] : []),
    ];
  }
  if (pending.type === "standard_skill") {
    return [
      pending.targetId,
      ...(pending.sourceId ? [pending.sourceId] : []),
      ...(pending.damageOpportunity ? [pending.damageOpportunity.ownerId] : []),
      ...(pending.recovery
        ? [pending.recovery.targetId, ...(pending.recovery.sourceId ? [pending.recovery.sourceId] : []),
            ...(pending.recovery.dyingRescue ? [pending.recovery.dyingRescue.responderId] : [])]
        : []),
      ...(pending.aftermath ? [pending.aftermath.targetId, ...(pending.aftermath.sourceId ? [pending.aftermath.sourceId] : []), ...dyingResumePlayerIds(pending.aftermath.resume)] : []),
      ...(pending.slash ? [pending.slash.attackerId, pending.slash.targetId, ...pending.slash.remainingTargetIds, ...slashCompletionPlayerIds(pending.slash), ...slashProvenancePlayerIds(pending.slash)] : []),
      ...(pending.duel ? [pending.duel.attackerId, pending.duel.targetId, pending.duel.initiatorId, pending.duel.originalTargetId] : []),
      ...(pending.cardUse ? [pending.cardUse.intent.sourceId, ...pending.cardUse.intent.targetIds,
        ...pending.cardUse.remainingTriggers.map((trigger) => trigger.ownerId)] : []),
      ...(pending.pindian ? suspendedResponsePlayerIds(pending.pindian) : []),
      ...(pending.targetIds ?? []),
      ...(pending.processedPlayerIds ?? []),
      ...(pending.leijiDodge ? [pending.leijiDodge.attributedPlayerId,
        ...lordDispatchablePlayerIds(pending.leijiDodge.resume.pending)] : []),
      ...(pending.judgment ? [pending.judgment.targetId, ...pending.judgment.retrialOrder.map((entry) => entry.ownerId),
        ...pending.judgment.postJudgmentOrder.map((entry) => entry.ownerId)] : []),
      ...(pending.deathResolution ? deathResolutionPlayerIds(pending.deathResolution) : []),
      ...(pending.wumouContinuation ? wumouContinuationPlayerIds(pending.wumouContinuation) : []),
      ...(pending.shenfenContinuation
        ? [pending.shenfenContinuation.ownerId, ...pending.shenfenContinuation.targetIds]
        : []),
      ...(pending.yeyanContinuation
        ? [pending.yeyanContinuation.ownerId, ...pending.yeyanContinuation.allocations.map((entry) => entry.targetId)]
        : []),
    ];
  }
  if (pending.type === "zone_selection" || pending.type === "fire_attack_discard") {
    return [pending.attackerId, pending.targetId, pending.victimId];
  }
  if (pending.type === "amazing_grace_selection") {
    return [pending.attackerId, pending.targetId, ...pending.remainingTargetIds];
  }
  if (pending.type === "nullification") {
    return [
      pending.attackerId,
      pending.targetId,
      pending.effectTargetId,
      ...pending.remainingResponderIds,
      ...trickEffectPlayerIds(pending.effect),
    ];
  }
  return [
    pending.attackerId,
    pending.targetId,
    ...(pending.type === "slash" ? [...slashCompletionPlayerIds(pending), ...slashProvenancePlayerIds(pending)] : []),
    ...(pending.type === "weapon_action" ? [pending.victimId, pending.slash.attackerId, pending.slash.targetId, ...pending.slash.remainingTargetIds, ...slashCompletionPlayerIds(pending.slash), ...slashProvenancePlayerIds(pending.slash)] : []),
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
  if (resume.type === "leiji" && resume.resume?.pending?.type === "slash") return [resume.resume.pending];
  if (resume.type === "guhuo") return slashResponsesFromPending(resume.pending);
  if (resume.type === "chain_damage") return slashResponsesFromResume(resume.finalResume);
  if (resume.type === "standard_damage") return slashResponsesFromResume(resume.aftermath.resume);
  return [];
}

function slashResponsesFromPending(pending: any): Array<z.infer<typeof slashResponseSchema>> {
  if (!pending || typeof pending !== "object") return [];
  if (pending.type === "slash") return [pending];
  if (pending.type === "weapon_action") return [pending.slash];
  if (pending.type === "guhuo" && pending.continuation?.type === "respond") {
    return slashResponsesFromPending(pending.continuation.pending);
  }
  if (pending.type === "dying") return slashResponsesFromResume(pending.resume);
  if (pending.type === "skill_choice" && pending.resume.type === "dying") {
    return slashResponsesFromResume(pending.resume.resume);
  }
  if (pending.type === "standard_skill") {
    return [
      ...(pending.slash ? [pending.slash] : []),
      ...(pending.leijiDodge?.resume?.pending?.type === "slash" ? [pending.leijiDodge.resume.pending] : []),
      ...(pending.aftermath ? slashResponsesFromResume(pending.aftermath.resume) : []),
    ];
  }
  if (pending.type === "standard_judgment") {
    if (pending.context.type === "tieqi") return [pending.context.slash];
    if (pending.context.type === "armor" && pending.context.pending.type === "slash") return [pending.context.pending];
    if (pending.context.type === "ganglie" && pending.context.aftermath) {
      return slashResponsesFromResume(pending.context.aftermath.resume);
    }
  }
  if (pending.type === "lord_dispatch" && pending.resume.type === "respond") {
    return slashResponsesFromPending(pending.resume.pending);
  }
  if (pending.type === "lord_dispatch" && pending.resume.type === "use_slash" && pending.resume.failureResume) {
    return slashResponsesFromPending(pending.resume.failureResume);
  }
  return [];
}

function massAttackResponsesFromResume(resume: any): Array<z.infer<typeof massAttackResponseSchema>> {
  if (!resume || typeof resume !== "object") return [];
  if (resume.type === "mass_attack") return [resume.pending];
  if (resume.type === "leiji" && resume.resume?.pending?.type === "mass_attack") return [resume.resume.pending];
  if (resume.type === "guhuo") return massAttackResponsesFromPending(resume.pending);
  if (resume.type === "wumou") {
    if (resume.continuation?.type === "trick_effect" && resume.continuation.effect?.type === "mass_attack") {
      return [resume.continuation.effect.pending];
    }
    if (resume.continuation?.type === "nullification") {
      return massAttackResponsesFromPending(resume.continuation.pending);
    }
  }
  if (resume.type === "chain_damage") return massAttackResponsesFromResume(resume.finalResume);
  if (resume.type === "standard_damage") return massAttackResponsesFromResume(resume.aftermath.resume);
  return [];
}

function massAttackResponsesFromPending(pending: any): Array<z.infer<typeof massAttackResponseSchema>> {
  if (!pending || typeof pending !== "object") return [];
  if (pending.type === "mass_attack") return [pending];
  if (pending.type === "guhuo" && pending.continuation?.type === "respond") {
    return massAttackResponsesFromPending(pending.continuation.pending);
  }
  if (pending.type === "dying") return massAttackResponsesFromResume(pending.resume);
  if (pending.type === "skill_choice" && pending.resume?.type === "dying") {
    return massAttackResponsesFromResume(pending.resume.resume);
  }
  if (pending.type === "standard_skill") {
    return [
      ...(pending.leijiDodge?.resume?.pending?.type === "mass_attack" ? [pending.leijiDodge.resume.pending] : []),
      ...(pending.wumouContinuation?.type === "trick_effect" &&
          pending.wumouContinuation.effect?.type === "mass_attack"
        ? [pending.wumouContinuation.effect.pending] : []),
      ...(pending.wumouContinuation?.type === "nullification"
        ? massAttackResponsesFromPending(pending.wumouContinuation.pending) : []),
      ...(pending.aftermath ? massAttackResponsesFromResume(pending.aftermath.resume) : []),
    ];
  }
  if (pending.type === "standard_judgment") {
    if (pending.context.type === "armor" && pending.context.pending.type === "mass_attack") {
      return [pending.context.pending];
    }
    if (pending.context.type === "ganglie" && pending.context.aftermath) {
      return massAttackResponsesFromResume(pending.context.aftermath.resume);
    }
  }
  if (pending.type === "lord_dispatch" && pending.resume.type === "respond") {
    return massAttackResponsesFromPending(pending.resume.pending);
  }
  if (pending.type === "lord_dispatch" && pending.resume.type === "use_slash" && pending.resume.failureResume) {
    return massAttackResponsesFromPending(pending.resume.failureResume);
  }
  if (pending.type === "nullification" && pending.effect?.type === "mass_attack") {
    return [pending.effect.pending];
  }
  return [];
}

function nullificationResponsesFromResume(resume: any): Array<z.infer<typeof nullificationResponseSchema>> {
  if (!resume || typeof resume !== "object") return [];
  if (resume.type === "guhuo") return nullificationResponsesFromPending(resume.pending);
  if (resume.type === "wumou" && resume.continuation?.type === "nullification") {
    return [resume.continuation.pending];
  }
  if (resume.type === "chain_damage") return nullificationResponsesFromResume(resume.finalResume);
  if (resume.type === "standard_damage") return nullificationResponsesFromResume(resume.aftermath.resume);
  return [];
}

function nullificationResponsesFromPending(pending: any): Array<z.infer<typeof nullificationResponseSchema>> {
  if (!pending || typeof pending !== "object") return [];
  if (pending.type === "nullification") return [pending];
  if (pending.type === "guhuo" && pending.continuation?.type === "respond") {
    return nullificationResponsesFromPending(pending.continuation.pending);
  }
  if (pending.type === "dying") return nullificationResponsesFromResume(pending.resume);
  if (pending.type === "skill_choice" && pending.resume?.type === "dying") {
    return nullificationResponsesFromResume(pending.resume.resume);
  }
  if (pending.type === "standard_skill") {
    return [
      ...(pending.wumouContinuation?.type === "nullification"
        ? [pending.wumouContinuation.pending] : []),
      ...(pending.aftermath ? nullificationResponsesFromResume(pending.aftermath.resume) : []),
    ];
  }
  if (pending.type === "standard_judgment" && pending.context.type === "ganglie" && pending.context.aftermath) {
    return nullificationResponsesFromResume(pending.context.aftermath.resume);
  }
  if (pending.type === "lord_dispatch" && pending.resume.type === "use_slash" && pending.resume.failureResume) {
    return nullificationResponsesFromPending(pending.resume.failureResume);
  }
  return [];
}

function duelResponsesFromResume(resume: any): Array<z.infer<typeof duelResponseSchema>> {
  if (!resume || typeof resume !== "object") return [];
  if (resume.type === "guhuo") return duelResponsesFromPending(resume.pending);
  if (resume.type === "chain_damage") return duelResponsesFromResume(resume.finalResume);
  if (resume.type === "standard_damage") return duelResponsesFromResume(resume.aftermath.resume);
  return [];
}

function duelResponsesFromPending(pending: any): Array<z.infer<typeof duelResponseSchema>> {
  if (!pending || typeof pending !== "object") return [];
  if (pending.type === "duel") return [pending];
  if (pending.type === "guhuo" && pending.continuation?.type === "respond") {
    return duelResponsesFromPending(pending.continuation.pending);
  }
  if (pending.type === "dying") return duelResponsesFromResume(pending.resume);
  if (pending.type === "skill_choice" && pending.resume?.type === "dying") {
    return duelResponsesFromResume(pending.resume.resume);
  }
  if (pending.type === "standard_skill") {
    return [
      ...(pending.duel ? [pending.duel] : []),
      ...(pending.aftermath ? duelResponsesFromResume(pending.aftermath.resume) : []),
    ];
  }
  if (pending.type === "standard_judgment" && pending.context.type === "ganglie" && pending.context.aftermath) {
    return duelResponsesFromResume(pending.context.aftermath.resume);
  }
  if (pending.type === "lord_dispatch" && pending.resume.type === "respond") {
    return pending.resume.pending.type === "duel" ? [pending.resume.pending] : [];
  }
  if (pending.type === "lord_dispatch" && pending.resume.type === "use_slash" && pending.resume.failureResume) {
    return duelResponsesFromPending(pending.resume.failureResume);
  }
  return [];
}

type PersistedDamageOpportunity = z.infer<typeof damageOpportunityCursorSchema>;

function damageOpportunityFromPending(
  pending: PersistedPendingResponse | null,
): PersistedDamageOpportunity | null {
  if (pending?.type === "standard_skill" || pending?.type === "weapon_action") {
    return pending.damageOpportunity ?? null;
  }
  if (pending?.type === "standard_judgment") {
    if (pending.context.type === "ganglie") return pending.context.damageOpportunity ?? null;
    if (pending.context.type === "baonue" || pending.context.type === "beige") {
      return pending.context.damageOpportunity;
    }
  }
  if (pending?.type === "pindian" && pending.continuation.type === "lieren") {
    return pending.continuation.damageOpportunity;
  }
  return null;
}

function dyingResumeFromPending(pending: PersistedPendingResponse): z.infer<typeof dyingResumeSchema> | null {
  if (pending.type === "dying") return pending.resume;
  if (pending.type === "skill_choice" && pending.resume.type === "dying") {
    return pending.resume.resume;
  }
  return null;
}

function dyingInteractionsFromPending(pending: any, seen = new Set<object>()): any[] {
  if (!pending || typeof pending !== "object" || seen.has(pending)) return [];
  seen.add(pending);
  if (pending.type === "dying") {
    return [pending, ...dyingInteractionsFromResume(pending.resume, seen)];
  }
  if (pending.type === "skill_choice" && pending.resume?.type === "dying") {
    return [pending, ...dyingInteractionsFromResume(pending.resume.resume, seen)];
  }
  if (pending.type === "guhuo" && pending.continuation?.type === "respond") {
    return dyingInteractionsFromPending(pending.continuation.pending, seen);
  }
  return [];
}

function dyingInteractionsFromResume(resume: any, seen: Set<object>): any[] {
  return resume?.type === "guhuo"
    ? dyingInteractionsFromPending(resume.pending, seen)
    : [];
}

function dyingInteractionsFromDeathResolution(pending: any, seen = new Set<object>()): any[] {
  if (!pending || typeof pending !== "object" || seen.has(pending)) return [];
  seen.add(pending);
  const completion = pending.completion;
  if (completion?.type === "wuhun") {
    return dyingInteractionsFromDeathResolution(completion.parent, seen);
  }
  return completion?.resume ? dyingInteractionsFromResume(completion.resume, seen) : [];
}

function embeddedPublicCardsFromTrickEffect(effect: any): any[] {
  return effect?.type === "amazing_grace" && Array.isArray(effect.pool) ? effect.pool : [];
}

function embeddedPublicCardsFromWumou(continuation: any, seen: Set<object>): any[] {
  if (!continuation || typeof continuation !== "object" || seen.has(continuation)) return [];
  seen.add(continuation);
  if (continuation.type === "trick_effect") return embeddedPublicCardsFromTrickEffect(continuation.effect);
  if (continuation.type === "nullification") {
    return embeddedPublicCardsFromPending(continuation.pending, seen);
  }
  return [];
}

function embeddedPublicCardsFromResume(resume: any, seen: Set<object>): any[] {
  if (!resume || typeof resume !== "object" || seen.has(resume)) return [];
  seen.add(resume);
  if (resume.type === "wumou") return embeddedPublicCardsFromWumou(resume.continuation, seen);
  if (resume.type === "guhuo") return embeddedPublicCardsFromPending(resume.pending, seen);
  if (resume.type === "chain_damage") return embeddedPublicCardsFromResume(resume.finalResume, seen);
  if (resume.type === "standard_damage") return embeddedPublicCardsFromResume(resume.aftermath?.resume, seen);
  return [];
}

function embeddedPublicCardsFromDeathResolution(pending: any, seen: Set<object>): any[] {
  if (!pending || typeof pending !== "object" || seen.has(pending)) return [];
  seen.add(pending);
  const completion = pending.completion;
  if (completion?.type === "wuhun") return embeddedPublicCardsFromDeathResolution(completion.parent, seen);
  return completion?.resume ? embeddedPublicCardsFromResume(completion.resume, seen) : [];
}

function embeddedPublicCardsFromPending(pending: any, seen = new Set<object>()): any[] {
  if (!pending || typeof pending !== "object" || seen.has(pending)) return [];
  seen.add(pending);
  if (pending.type === "amazing_grace_selection") return Array.isArray(pending.pool) ? pending.pool : [];
  if (pending.type === "nullification") return embeddedPublicCardsFromTrickEffect(pending.effect);
  if (pending.type === "guhuo" && pending.continuation?.type === "respond") {
    return embeddedPublicCardsFromPending(pending.continuation.pending, seen);
  }
  if (pending.type === "dying") return embeddedPublicCardsFromResume(pending.resume, seen);
  if (pending.type === "skill_choice" && pending.resume?.type === "dying") {
    return embeddedPublicCardsFromResume(pending.resume.resume, seen);
  }
  if (pending.type === "standard_skill") {
    return [
      ...(pending.wumouContinuation ? embeddedPublicCardsFromWumou(pending.wumouContinuation, seen) : []),
      ...(pending.aftermath ? embeddedPublicCardsFromResume(pending.aftermath.resume, seen) : []),
      ...(pending.deathResolution ? embeddedPublicCardsFromDeathResolution(pending.deathResolution, seen) : []),
    ];
  }
  if (pending.type === "standard_judgment") {
    if (pending.context?.type === "wuhun") {
      return embeddedPublicCardsFromDeathResolution(pending.context.deathResolution, seen);
    }
    if (pending.context?.type === "ganglie" && pending.context.aftermath) {
      return embeddedPublicCardsFromResume(pending.context.aftermath.resume, seen);
    }
  }
  if (pending.type === "lord_dispatch" && pending.resume.type === "use_slash" && pending.resume.failureResume) {
    return embeddedPublicCardsFromPending(pending.resume.failureResume, seen);
  }
  return [];
}

function dyingInteractionFrameId(pending: any): number | null {
  if (pending?.type === "dying") return pending.frameId;
  return pending?.type === "skill_choice" && pending.resume?.type === "dying"
    ? pending.resume.frameId
    : null;
}

function sameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

const gameSessionSchema = z.object({
  version: z.literal(1),
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
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
    queuedRecoveries: z.array(pendingRecoverySchema).max(100),
    queuedTriggers: z.array(skillTriggerRefSchema).max(100),
    suspendedPhase: z.enum(["prepare", "judgment", "draw", "play", "respond", "discard", "end"]).nullable(),
    suspendedResponse: pendingResponseSchema.nullable(),
  }),
  completeRules: completeRulesStateSchema,
}).superRefine((game, context) => {
  const playerIds = game.players.map((player) => player.id);
  const knownPlayers = new Set(playerIds);
  const issue = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  try {
    assertCompleteRulesEngineState(game.completeRules, game.players.map((player) => ({
      id: player.id,
      hp: player.hp,
      maxHp: player.maxHp,
      alive: player.alive,
    })));
  } catch {
    issue("Invalid complete-rules engine state");
    return;
  }
  if (knownPlayers.size !== playerIds.length) issue("Game contains duplicate players");
  const authoritativeGame = game as unknown as GameSession;
  const hasEffectiveSkill = (player: z.infer<typeof gamePlayerSchema>, skillId: string): boolean =>
    getEffectiveGeneralSkillIds(authoritativeGame, player.id).some((candidate) => candidate === skillId);
  const playerFaction = (player: z.infer<typeof gamePlayerSchema>): string | null =>
    getEffectivePlayerFaction(authoritativeGame, player.id);
  const hasCurrentOrRecordedSkill = (
    player: z.infer<typeof gamePlayerSchema> | undefined,
    skillId: string,
  ): boolean => !!player && (
    hasEffectiveSkill(player, skillId) ||
    (player.generalId !== null && getGeneralDefinition(player.generalId).skillIds.includes(skillId as never)) ||
    game.completeRules.lifecycle.grants.some((grant) => grant.ownerId === player.id && grant.skillId === skillId) ||
    game.completeRules.lifecycle.skillLosses.some((loss) =>
      loss.ownerId === player.id && loss.skillIds.includes(skillId))
  );
  const validateNullificationMetadata = (pending: any, validateResponderOrder: boolean): void => {
    const effect = pending.effect;
    const sourceId = effect.type === "mass_attack" ? effect.pending.attackerId : effect.sourceId;
    const targetId = effect.type === "mass_attack" ? effect.pending.targetId : effect.targetId;
    const cardId = effect.type === "mass_attack" ? effect.pending.cardId : effect.cardId;
    const cardKind = effect.type === "mass_attack" ? effect.pending.cardKind
      : effect.type === "delayed_trick" || effect.type === "zone_trick" ? effect.cardKind : effect.type;
    const responders = [pending.targetId, ...pending.remainingResponderIds];
    let responderOrderValid = new Set(responders).size === responders.length;
    if (validateResponderOrder) {
      const targetSeat = game.players.findIndex((player) => player.id === pending.targetId);
      const offsets = responders.map((playerId: string) => {
        const seat = game.players.findIndex((player) => player.id === playerId);
        return targetSeat < 0 || seat < 0 ? -1 : (seat - targetSeat + game.players.length) % game.players.length;
      });
      responderOrderValid = responderOrderValid && offsets.every((offset: number, index: number) =>
        offset >= 0 && (index === 0 ? offset === 0 : offset > offsets[index - 1]!));
    }
    if (pending.attackerId !== sourceId || pending.effectTargetId !== targetId ||
        pending.cardId !== cardId || pending.cardKind !== cardKind ||
        (game.resolvingCards ?? []).filter((card) => card.id === cardId).length !== 1 ||
        !responderOrderValid) {
      issue("Nullification response disagrees with its committed trick effect");
    }
  };
  const validateQiangxiContinuation = (continuation: any, internalCursor = false): void => {
    if (
      continuation.eventId >= game.nextEventId ||
      continuation.sourceId === continuation.damageTargetId ||
      continuation.distanceBeforePayment <= 0 ||
      continuation.distanceBeforePayment > continuation.attackRangeBeforePayment ||
      (game.turn.skillUseCounts.qiangxi ?? 0) !== 1 ||
      !knownPlayers.has(continuation.sourceId) ||
      !knownPlayers.has(continuation.damageTargetId) ||
      (internalCursor && continuation.targetId !== continuation.sourceId)
    ) issue("Qiangxi continuation is inconsistent");
  };
  const validateGuhuoPending = (pending: any): void => {
    const source = game.players.find((player) => player.id === pending.sourceId);
    const physicalCards = (game.resolvingCards ?? []).filter((card) => card.id === pending.physicalCardId);
    if (!source?.alive || !hasEffectiveSkill(source, "guhuo") || !isGuhuoDeclarableKind(pending.declaredKind) ||
        pending.eventId >= game.nextEventId || physicalCards.length !== 1) {
      issue("Guhuo continuation metadata is inconsistent");
      return;
    }
    if (pending.continuation.type === "use") {
      const intent = pending.continuation.intent;
      let targetsRemainLegal = true;
      if (pending.stage === "challenge") {
        try {
          const probe = structuredClone(authoritativeGame);
          const probeSource = probe.players.find((player) => player.id === source.id);
          const physicalIndex = probe.resolvingCards.findIndex((card) => card.id === pending.physicalCardId);
          const [physical] = physicalIndex < 0 ? [] : probe.resolvingCards.splice(physicalIndex, 1);
          if (!probeSource || !physical) throw new Error("Missing Guhuo probe card");
          probeSource.hand.push({
            ...getCardDefinition(pending.declaredKind),
            id: physical.id,
            kind: pending.declaredKind,
            suit: physical.suit,
            rank: physical.rank,
          });
          probe.pendingResponse = null;
          probe.turn.phase = "play";
          const targetAction = pending.declaredKind === "borrowed_sword" || pending.declaredKind === "iron_chain" ||
              (isSlashCardKind(pending.declaredKind) && intent.targetIds.length > 1)
            ? { targetIds: [...intent.targetIds] }
            : pending.declaredKind === "barbarian_invasion" || pending.declaredKind === "arrow_barrage" ||
                pending.declaredKind === "peach_garden" || pending.declaredKind === "amazing_grace"
              ? {}
              : { targetId: intent.targetIds[0] };
          applyAction(probe, {
            type: "play_card",
            playerId: source.id,
            cardId: physical.id,
            ...targetAction,
          });
        } catch {
          targetsRemainLegal = false;
        }
      }
      if (intent.sourceId !== source.id || intent.physicalCardId !== pending.physicalCardId ||
          intent.physicalKind !== physicalCards[0]!.kind || intent.suit !== physicalCards[0]!.suit ||
          intent.rank !== physicalCards[0]!.rank || intent.effectiveKind !== pending.declaredKind ||
          intent.viaSkill !== "guhuo" || intent.method !== "use" ||
          intent.useId <= 0 || intent.useId >= game.nextUseId || intent.additionalPhysicalCards !== undefined ||
          source.id !== game.currentPlayerId || new Set(intent.targetIds).size !== intent.targetIds.length ||
          intent.targetIds.some((targetId: string) => !knownPlayers.has(targetId)) || !targetsRemainLegal) {
        issue("Guhuo card-use continuation is inconsistent");
      }
    } else {
      const response = pending.continuation.pending;
      const declaredKindValid = response.type === "slash"
        ? pending.declaredKind === "dodge"
        : response.type === "duel" || response.type === "borrowed_sword"
          ? isSlashCardKind(pending.declaredKind)
          : response.type === "mass_attack"
            ? response.responseKind === "slash"
              ? isSlashCardKind(pending.declaredKind)
              : pending.declaredKind === "dodge"
            : response.type === "nullification"
              ? pending.declaredKind === "wu_xie_ke_ji"
              : response.type === "dying" &&
                (pending.declaredKind === "peach" ||
                  (pending.declaredKind === "wine" && response.victimId === source.id));
      if (response.targetId !== source.id || !declaredKindValid) {
        issue("Guhuo response continuation is inconsistent");
      }
      if (response.type === "nullification") validateNullificationMetadata(response, true);
    }
    if (pending.stage === "challenge") {
      const sourceIndex = game.players.findIndex((player) => player.id === source.id);
      const order = Array.from({ length: game.players.length - 1 }, (_value, index) =>
        game.players[(sourceIndex + index + 1) % game.players.length]!)
        .filter((player) => player.alive && player.hp !== 0)
        .map((player) => player.id);
      const asked = order.slice(0, pending.challengeCursor);
      let lastAskedIndex = -1;
      const challengersValid = pending.challengerIds.every((challengerId: string) => {
        const index = asked.indexOf(challengerId);
        if (index <= lastAskedIndex) return false;
        lastAskedIndex = index;
        return true;
      });
      if (
        order[pending.challengeCursor] !== pending.targetId ||
        pending.promptId !== `guhuo:${pending.eventId}:challenge:${pending.challengeCursor}:${pending.targetId}` ||
        !sameOrderedStrings(pending.remainingChallengeIds, order.slice(pending.challengeCursor + 1)) ||
        !challengersValid
      ) issue("Guhuo challenge cursor is inconsistent");
      return;
    }
    const sourceIndex = game.players.findIndex((player) => player.id === source.id);
    const seatOrder = Array.from({ length: game.players.length - 1 }, (_value, index) =>
      game.players[(sourceIndex + index + 1) % game.players.length]!.id);
    let lastSeatIndex = -1;
    const challengersValid = pending.challengerIds.every((challengerId: string) => {
      const index = seatOrder.indexOf(challengerId);
      if (index <= lastSeatIndex) return false;
      lastSeatIndex = index;
      return true;
    });
    const expectedTarget = pending.consequenceCursor === 0
      ? source.id
      : pending.challengerIds[pending.consequenceCursor - 1];
    const suit = resolveHongyanSuit({
      printedSuit: physicalCards[0]!.suit!,
      cardOwnerId: source.id,
      hongyan: { ownerId: source.id, active: hasEffectiveSkill(source, "hongyan") },
    });
    const effectiveSuit = suit.ok ? suit.value.effectiveSuit : null;
    const decision = effectiveSuit ? adjudicateGuhuoChallenge({
      sourceId: source.id,
      declaredKind: pending.declaredKind,
      physicalKind: physicalCards[0]!.kind,
      effectiveSuit,
      challengerIds: pending.challengerIds,
    }) : null;
    const expectedEffect = decision?.ok ? decision.value.consequences[0]?.effect ?? null : null;
    if (
      !challengersValid || pending.consequenceCursor > pending.challengerIds.length ||
      expectedTarget !== pending.targetId ||
      !sameOrderedStrings(pending.remainingConsequenceIds, pending.challengerIds.slice(pending.consequenceCursor)) ||
      !decision?.ok || pending.effectiveSuit !== effectiveSuit ||
      pending.outcome !== decision.value.outcome ||
      pending.continuesAsDeclared !== decision.value.continuesAsDeclared ||
      pending.consequenceEffect !== expectedEffect
    ) issue("Guhuo consequence cursor is inconsistent");
  };
  const validatePindianPending = (pending: any): void => {
    const frame = pending.frame;
    const initiator = game.players.find((player) => player.id === frame.initiatorId);
    const target = game.players.find((player) => player.id === frame.targetId);
    const continuationMatches = pending.continuation.type === pending.skillId;
    const ownsSkill = pending.skillId === "zhiba"
      ? target?.role === "lord" && !!target && hasEffectiveSkill(target, "zhiba") && initiator !== undefined && playerFaction(initiator) === "wu"
      : initiator !== undefined && hasEffectiveSkill(initiator, pending.skillId);
    const selectedInitiator = typeof frame.selections[frame.initiatorId] === "string";
    const selectedTarget = typeof frame.selections[frame.targetId] === "string";
    const expectedTarget = !selectedInitiator ? frame.initiatorId : frame.targetId;
    const expectedCursor = !selectedInitiator ? 0 : 1;
    if (
      pending.eventId >= game.nextEventId || frame.frameId !== pending.eventId ||
      frame.reasonSkillId !== pending.skillId || frame.initiatorId === frame.targetId ||
      !initiator?.alive || !target?.alive || !ownsSkill || !continuationMatches ||
      (pending.skillId !== "lieren" && frame.initiatorId !== game.currentPlayerId) ||
      (pending.skillId === "tianyi" || pending.skillId === "quhu") &&
        (game.turn.skillUseCounts[pending.skillId as keyof typeof game.turn.skillUseCounts] ?? 0) !== 1 ||
      (frame.stage !== "selecting" && frame.stage !== "ready_to_reveal") ||
      (!selectedInitiator && selectedTarget) ||
      pending.targetId !== expectedTarget ||
      pending.promptId !== `pindian:${pending.eventId}:select:${expectedCursor}:${expectedTarget}` ||
      Object.keys(frame.selections).some((playerId) => playerId !== frame.initiatorId && playerId !== frame.targetId) ||
      Object.keys(frame.revealedRanks).length !== 0 || Object.keys(frame.effectiveRanks).length !== 0 ||
      frame.rankModifiers.length !== 0 || frame.result !== null || Object.keys(frame.settledDestinations).length !== 0
    ) issue("Pindian continuation metadata is inconsistent");
    try {
      assertPindianFrame({
        deck: game.deck as any,
        discard: game.discardPile as any,
        processing: { [String(frame.frameId)]: (game.resolvingCards ?? []) as any },
        players: game.players.map((player) => ({
          id: player.id,
          hand: player.hand as any,
          equipment: player.equipment as any,
          judgment: player.judgment as any,
          extraPiles: player.extraPiles as any,
        })),
      }, frame);
    } catch {
      issue("Pindian frame failed strict physical validation");
    }
  };
  const judgmentOrder = (() => {
    const current = game.players.find((player) => player.id === game.currentPlayerId);
    if (!current?.alive) return game.players.filter((player) => player.alive).sort((left, right) => left.seat - right.seat);
    return game.players
      .filter((player) => player.alive)
      .sort((left, right) =>
        ((left.seat - current.seat + game.players.length) % game.players.length) -
        ((right.seat - current.seat + game.players.length) % game.players.length));
  })();
  const baonueBeneficiaryId = (sourceId: string): string | null => {
    const source = game.players.find((player) => player.id === sourceId);
    if (!source?.alive || playerFaction(source) !== "qun") return null;
    return judgmentOrder.find((candidate) =>
      candidate.id !== source.id && candidate.alive && hasEffectiveSkill(candidate, "baonue"))?.id ?? null;
  };
  const judgmentOrdersMatch = (frame: z.infer<typeof judgmentFrameSchema>): boolean => {
    const expectedRetrial = judgmentOrder.flatMap((player) => {
      const order: Array<{ ownerId: string; skillId: "guicai" | "guidao" | "jilue" }> = [];
      const hasGuicai = hasEffectiveSkill(player, "guicai");
      if (hasGuicai) order.push({ ownerId: player.id, skillId: "guicai" });
      if (hasEffectiveSkill(player, "guidao")) order.push({ ownerId: player.id, skillId: "guidao" });
      const renMarks = markCount(game.completeRules.lifecycle, {
        ownerId: player.id,
        markId: "ren",
        sourcePlayerId: player.id,
        sourceSkillId: "renjie",
      });
      const spentJilueHere = frame.replacements.some((replacement) =>
        replacement.actorId === player.id && replacement.skillId === "jilue");
      if (!hasGuicai && hasEffectiveSkill(player, "jilue") &&
          hasAwakened(game.completeRules.lifecycle, player.id, "baiyin") &&
          (renMarks > 0 || spentJilueHere)) {
        order.push({ ownerId: player.id, skillId: "jilue" });
      }
      return order;
    });
    const expectedPost = game.players.some((player) =>
      player.id === frame.targetId && player.alive && hasEffectiveSkill(player, "tiandu"))
      ? [{ ownerId: frame.targetId, skillId: "tiandu" }]
      : [];
    return frame.retrialOrder.length === expectedRetrial.length &&
      frame.retrialOrder.every((entry, index) => entry.ownerId === expectedRetrial[index]?.ownerId &&
        entry.skillId === expectedRetrial[index]?.skillId) &&
      frame.postJudgmentOrder.length === expectedPost.length &&
      frame.postJudgmentOrder.every((entry, index) => entry.ownerId === expectedPost[index]?.ownerId &&
        entry.skillId === expectedPost[index]?.skillId);
  };
  const judgmentRetrialSkillEffective = (ownerId: string, skillId: string): boolean => {
    const owner = game.players.find((player) => player.id === ownerId);
    if (!owner?.alive || !hasEffectiveSkill(owner, skillId)) return false;
    if (skillId !== "jilue") return skillId === "guicai" || skillId === "guidao";
    return hasAwakened(game.completeRules.lifecycle, owner.id, "baiyin") &&
      markCount(game.completeRules.lifecycle, {
        ownerId: owner.id,
        markId: "ren",
        sourcePlayerId: owner.id,
        sourceSkillId: "renjie",
      }) > 0;
  };
  const suspendedAnsweredRetrialIndex = (
    pending: { targetId: string; promptId: string },
    frame: z.infer<typeof judgmentFrameSchema>,
  ): number | null => {
    const match = /^judgment:(\d+):retrial:([^:]+):(\d+)$/.exec(pending.promptId);
    if (!match || Number(match[1]) !== frame.frameId) return null;
    const index = Number(match[3]);
    const opportunity = frame.retrialOrder[index];
    const replacement = frame.replacements.at(-1);
    return Number.isSafeInteger(index) && index < frame.retrialCursor && opportunity && replacement &&
      opportunity.ownerId === match[2] && opportunity.ownerId === pending.targetId &&
      replacement.actorId === opportunity.ownerId && replacement.skillId === opportunity.skillId
      ? index
      : null;
  };
  const hasJudgmentRetrialCard = (ownerId: string, skillId: string): boolean => {
    const owner = game.players.find((player) => player.id === ownerId);
    if (!owner?.alive) return false;
    if (skillId === "guicai" || skillId === "jilue") return owner.hand.length > 0;
    if (skillId !== "guidao") return false;
    return [...owner.hand, ...Object.values(owner.equipment)].some((card) => {
      if (!card.suit) return false;
      const suit = resolveHongyanSuit({
        printedSuit: card.suit,
        cardOwnerId: owner.id,
        hongyan: { ownerId: owner.id, active: hasEffectiveSkill(owner, "hongyan") },
      });
      return suit.ok && (suit.value.effectiveSuit === "spade" || suit.value.effectiveSuit === "club");
    });
  };
  const xingshangOwnerIds = (victimId: string): string[] => judgmentOrder
    .filter((player) => player.id !== victimId && hasEffectiveSkill(player, "xingshang"))
    .map((player) => player.id);
  const liveXingshangOwnerIds = (ownerIds: readonly string[]): string[] => ownerIds.filter((ownerId) => {
    const owner = game.players.find((player) => player.id === ownerId);
    return !!owner?.alive && hasEffectiveSkill(owner, "xingshang");
  });
  const wuhunTargetIds = (ownerId: string): string[] => {
    const ownerIndex = game.players.findIndex((player) => player.id === ownerId);
    if (ownerIndex < 0) return [];
    const marked = Array.from({ length: game.players.length - 1 }, (_value, index) =>
      game.players[(ownerIndex + index + 1) % game.players.length]!)
      .filter((player) => player.alive)
      .map((player) => ({
        id: player.id,
        marks: markCount(game.completeRules.lifecycle, {
          ownerId: player.id,
          markId: "nightmare",
          sourcePlayerId: ownerId,
          sourceSkillId: "wuhun",
        }),
      }));
    const maximum = marked.reduce((value, player) => Math.max(value, player.marks), 0);
    return maximum > 0 ? marked.filter((player) => player.marks === maximum).map((player) => player.id) : [];
  };
  if (!knownPlayers.has(game.currentPlayerId)) issue("Current player is not in the game");
  if (game.turn.playerId !== game.currentPlayerId) issue("Turn player does not match current player");
  if (game.players.some((player, index) => player.seat !== index)) issue("Game seats are not contiguous");
  if (game.players.some((player) => player.hp > player.maxHp)) issue("Player hp exceeds maxHp");
  if (game.players.some((player) => {
    if (player.generalId === null) return player.godFaction !== null;
    return getGeneralDefinition(player.generalId).factionSelectable
      ? player.godFaction === null
      : player.godFaction !== null;
  })) issue("God faction selection disagrees with general metadata");
  const dyingVictimIds = new Set(game.completeRules.dying.frames.map((frame) => frame.victimId));
  const deathFramesByVictim = new Map(game.completeRules.death.frames.map((frame) => [frame.death.victimId, frame]));
  const activeDeathFrames = game.completeRules.death.frames;
  const deathInteractionCarriers = [game.pendingResponse, game.afterMove.suspendedResponse];
  const deathSkillCursor = deathInteractionCarriers.find((pending) => pending?.type === "standard_skill" &&
    (pending.skillId === "xingshang" || pending.skillId === "wuhun") && pending.deathResolution) ?? null;
  const deathJudgmentCursor = deathInteractionCarriers.find((pending) => pending?.type === "standard_judgment" &&
    pending.context.type === "wuhun") ?? null;
  const validateHpLossBusinessResume = (resume: any, dyingFrame: any): void => {
    if (dyingFrame?.reason.type === "hp_loss") {
      const victim = game.players.find((player) => player.id === dyingFrame.victimId);
      const typeMatchesCause = (() => {
        if (!victim || dyingFrame.reason.sourceId !== null) return false;
        if (resume.type === "turn_start") return true;
        if (resume.type === "skill") {
          return resume.skillId === "kurou" && resume.playerId === victim.id &&
            game.currentPlayerId === victim.id && hasCurrentOrRecordedSkill(victim, "kurou");
        }
        if (resume.type === "qiangxi") return resume.sourceId === victim.id;
        if (resume.type === "forest_end") {
          return resume.playerId === victim.id && game.currentPlayerId === victim.id &&
            hasCurrentOrRecordedSkill(victim, "benghuai");
        }
        if (resume.type === "qinyin" || resume.type === "luanwu") {
          return resume.processedActorIds?.at(-1) === victim.id ||
            resume.targetIds?.[resume.nextTargetIndex - 1] === victim.id;
        }
        if (resume.type === "wumou") return resume.ownerId === victim.id;
        if (resume.type === "yeyan") {
          return resume.continuation.ownerId === victim.id && resume.continuation.greaterYeyan &&
            resume.continuation.stage === "damage" && resume.continuation.nextAllocationIndex === 0;
        }
        if (resume.type === "guhuo") return resume.pending.targetId === victim.id;
        return false;
      })();
      if (!typeMatchesCause) issue("HP-loss dying continuation discriminator is inconsistent with its victim");
    }
    if (resume.type !== "qinyin" && resume.type !== "luanwu") return;
    const ownerIndex = game.players.findIndex((player) => player.id === resume.ownerId);
    const opponents = ownerIndex < 0 ? [] : Array.from({ length: game.players.length - 1 }, (_value, index) =>
      game.players[(ownerIndex + index + 1) % game.players.length]!.id);
    if (!dyingFrame || dyingFrame.reason.type !== "hp_loss" || dyingFrame.reason.sourceId !== null ||
        resume.eventId >= game.nextEventId || game.currentPlayerId !== resume.ownerId ||
        game.turn.playerId !== resume.ownerId) {
      issue(`${resume.type === "qinyin" ? "Qinyin" : "Luanwu"} dying continuation metadata is inconsistent`);
      return;
    }
    if (resume.type === "qinyin") {
      const expectedOrder = ownerIndex < 0 ? [] : [resume.ownerId, ...opponents];
      if (game.turn.discardPhaseStarted !== true || game.turn.qinyinInvoked !== true ||
          game.turn.qinyinEventId !== resume.eventId || resume.nextTargetIndex <= 0 ||
          resume.nextTargetIndex > resume.targetIds.length ||
          !sameOrderedStrings(resume.targetIds, expectedOrder) ||
          resume.targetIds[resume.nextTargetIndex - 1] !== dyingFrame.victimId) {
        issue("Qinyin dying continuation cursor is inconsistent");
      }
      return;
    }
    const frozenOrder = [...resume.processedActorIds, ...resume.remainingActorIds];
    const limitedUse = game.completeRules.lifecycle.limitedUses.some((entry) =>
      entry.ownerId === resume.ownerId && entry.skillId === "luanwu" && entry.consumedAtEventId === resume.eventId);
    if (resume.processedActorIds.length === 0 || !sameOrderedStrings(frozenOrder, opponents) ||
        resume.processedActorIds.at(-1) !== dyingFrame.victimId || !limitedUse) {
      issue("Luanwu dying continuation cursor is inconsistent");
    }
  };
  const snapshotCardCount = (cardId: string): number => [
    ...game.deck,
    ...game.discardPile,
    ...(game.resolvingCards ?? []),
    ...game.players.flatMap((player) => player.hand),
    ...game.players.flatMap((player) => Object.values(player.equipment)),
    ...game.players.flatMap((player) => player.judgment),
    ...game.players.flatMap((player) => Object.values(player.extraPiles).flat()),
    ...embeddedPublicCardsFromPending(game.pendingResponse),
    ...embeddedPublicCardsFromPending(game.afterMove.suspendedResponse),
  ].filter((card) => card.id === cardId).length;
  const validateWumouContinuation = (ownerId: string, eventId: number, continuation: any): void => {
    if (!knownPlayers.has(ownerId) || eventId <= 0 || eventId >= game.nextEventId) {
      issue("Wumou continuation owner or event is inconsistent");
      return;
    }
    try {
      assertWumouContinuation(authoritativeGame, ownerId, continuation, eventId);
    } catch {
      issue("Wumou continuation is inconsistent");
      return;
    }
    if (continuation.type === "finish_mass_attack" && continuation.sourceSkillId === "luanji" &&
        continuation.cardKind !== "arrow_barrage") {
      issue("Wumou Luanji continuation has an invalid card kind");
    }
    if (continuation.type === "nullification") {
      validateNullificationMetadata(continuation.pending, false);
    }
  };
  const validateShenfenContinuation = (continuation: any, directCallerFrame: any = null): void => {
    try {
      assertShenfenContinuation(authoritativeGame, continuation);
    } catch {
      issue("Shenfen continuation is inconsistent");
      return;
    }
    if (directCallerFrame) {
      const damage = directCallerFrame.damage;
      const expectedTargetId = continuation.targetIds[continuation.nextTargetIndex - 1];
      if (continuation.stage !== "damage" || continuation.nextTargetIndex <= 0 ||
          damage.sourceId !== continuation.ownerId || damage.originalTargetId !== expectedTargetId ||
          damage.originalAmount !== 1 || damage.nature !== "normal" || damage.physicalCardIds.length !== 0 ||
          damage.reason.type !== "rule" || damage.reason.id !== "因神愤") {
        issue("Shenfen DamageFlow caller is inconsistent");
      }
    }
  };
  const validateYeyanContinuation = (continuation: any, directCallerFrame: any = null): void => {
    try {
      assertYeyanContinuation(authoritativeGame, continuation);
    } catch {
      issue("Yeyan continuation is inconsistent");
      return;
    }
    if (continuation.costCardIds.some((cardId: string) => snapshotCardCount(cardId) !== 1)) {
      issue("Yeyan cost card is missing from the authoritative snapshot");
    }
    if (directCallerFrame) {
      const damage = directCallerFrame.damage;
      const allocation = continuation.allocations[continuation.nextAllocationIndex - 1];
      if (continuation.stage !== "damage" || continuation.nextAllocationIndex <= 0 || !allocation ||
          damage.sourceId !== continuation.ownerId || damage.originalTargetId !== allocation.targetId ||
          damage.originalAmount !== allocation.amount || damage.nature !== "fire" ||
          damage.physicalCardIds.length !== 0 || damage.reason.type !== "rule" ||
          damage.reason.id !== "受到业炎伤害") {
        issue("Yeyan DamageFlow caller is inconsistent");
      }
    }
  };
  const standardDamageSkillQueue = (targetId: string, amount: number): string[] => {
    const result: string[] = [];
    for (const skillId of getEffectiveGeneralSkillIds(authoritativeGame, targetId)) {
      if (skillId !== "jianxiong" && skillId !== "yiji" && skillId !== "fankui" && skillId !== "ganglie") continue;
      const count = skillId === "yiji" ? amount : 1;
      for (let point = 0; point < count; point += 1) result.push(skillId);
    }
    return result;
  };
  const isOrderedSuffix = (candidate: readonly string[], values: readonly string[]): boolean =>
    candidate.length <= values.length && sameOrderedStrings(candidate, values.slice(values.length - candidate.length));
  const validateStandardDamageAftermath = (
    aftermath: any,
    currentSkillId: string | null = null,
    directCallerFrame: any = null,
  ): void => {
    if (!aftermath || !knownPlayers.has(aftermath.targetId) ||
        (aftermath.sourceId !== null && !knownPlayers.has(aftermath.sourceId)) ||
        aftermath.eventId >= game.nextEventId ||
        new Set(aftermath.damageCardIds).size !== aftermath.damageCardIds.length ||
        aftermath.damageCardIds.some((cardId: string) => snapshotCardCount(cardId) !== 1)) {
      issue("Standard damage aftermath metadata is inconsistent");
      return;
    }
    const fullQueue = standardDamageSkillQueue(aftermath.targetId, aftermath.amount);
    const queueValid = currentSkillId === null
      ? isOrderedSuffix(aftermath.remainingSkillIds, fullQueue)
      : fullQueue.some((skillId, index) => skillId === currentSkillId &&
          sameOrderedStrings(aftermath.remainingSkillIds, fullQueue.slice(index + 1)));
    if (!queueValid) issue("Standard damage aftermath skill queue is inconsistent");

    if (directCallerFrame) {
      const damage = directCallerFrame.damage;
      if (damage.reason.type !== "rule" || damage.reason.id !== "受到刚烈惩罚" ||
          damage.sourceId !== aftermath.targetId || damage.originalTargetId !== aftermath.sourceId ||
          damage.originalAmount !== 1 || damage.nature !== "normal" || damage.physicalCardIds.length !== 0) {
        issue("Standard damage aftermath disagrees with its Ganglie damage frame");
      }
    }
  };
  const validateBusinessResume = (
    resume: any,
    directCallerFrame: any = null,
    dyingFrame: any = null,
  ): void => {
    if (!resume || typeof resume !== "object") return;
    if (resume.type === "chain_damage") {
      const damage = directCallerFrame?.damage;
      const propagated = damage?.reason?.type === "chain" && damage.reason.id === "受到铁索连环传导";
      if (damage) {
        const originIndex = game.players.findIndex((player) => player.id === damage.originalTargetId);
        const expectedTargets = originIndex < 0 ? [] : Array.from(
          { length: game.players.length - 1 },
          (_value, index) => game.players[(originIndex + index + 1) % game.players.length]!,
        ).filter((player) => player.alive && player.chained).map((player) => player.id);
        const liveFrozenTargets = resume.remainingTargetIds.filter((playerId: string) =>
          game.players.find((player) => player.id === playerId)?.alive);
        const amountSettled = propagated || ["life_deduction", "dying", "post_damage", "complete"]
          .includes(directCallerFrame.step);
        const expectedAmount = propagated ? damage.originalAmount : damage.amount;
        if (resume.sourceId !== damage.sourceId || resume.nature !== damage.nature ||
            !sameOrderedStrings(resume.damageCardIds, damage.physicalCardIds) ||
            new Set(resume.remainingTargetIds).size !== resume.remainingTargetIds.length ||
            !sameOrderedStrings(liveFrozenTargets, expectedTargets) ||
            (amountSettled && resume.amount !== expectedAmount)) {
          issue("Chain-damage continuation disagrees with its causal damage frame");
        }
      }
      validateBusinessResume(resume.finalResume, propagated ? null : directCallerFrame, null);
      return;
    }
    if (resume.type === "standard_damage") {
      validateStandardDamageAftermath(resume.aftermath, null, directCallerFrame);
      validateBusinessResume(resume.aftermath?.resume, null, null);
      return;
    }
    if (resume.type === "wumou") {
      validateWumouContinuation(resume.ownerId, resume.eventId, resume.continuation);
      if (dyingFrame && (dyingFrame.victimId !== resume.ownerId || dyingFrame.reason.type !== "hp_loss" ||
          dyingFrame.reason.sourceId !== null)) {
        issue("Wumou dying continuation is inconsistent");
      }
      return;
    }
    if (resume.type === "shenfen") {
      validateShenfenContinuation(resume.continuation, directCallerFrame);
      if (dyingFrame) {
        const expectedTarget = resume.continuation.targetIds[resume.continuation.nextTargetIndex - 1];
        if (resume.continuation.stage !== "damage" || resume.continuation.nextTargetIndex <= 0 ||
            dyingFrame.victimId !== expectedTarget || dyingFrame.reason.type !== "damage" ||
            dyingFrame.reason.sourceId !== resume.continuation.ownerId) {
          issue("Shenfen dying continuation is inconsistent");
        }
      }
      return;
    }
    if (resume.type === "yeyan") {
      validateYeyanContinuation(resume.continuation, directCallerFrame);
      if (dyingFrame) {
        const continuation = resume.continuation;
        const allocation = continuation.allocations[continuation.nextAllocationIndex - 1];
        const costDying = continuation.greaterYeyan && continuation.stage === "damage" &&
          continuation.nextAllocationIndex === 0 && dyingFrame.victimId === continuation.ownerId &&
          dyingFrame.reason.type === "hp_loss" && dyingFrame.reason.sourceId === null;
        const damageDying = continuation.stage === "damage" && continuation.nextAllocationIndex > 0 &&
          allocation?.targetId === dyingFrame.victimId && dyingFrame.reason.type === "damage" &&
          dyingFrame.reason.sourceId === continuation.ownerId;
        if (!costDying && !damageDying) issue("Yeyan dying continuation is inconsistent");
      }
    }
  };
  const validateDeathResolution = (
    pending: PendingDeathResolution,
    frame: (typeof activeDeathFrames)[number],
  ): void => {
    if (pending.frameId !== frame.frameId ||
      new Set(pending.remainingOwnerIds).size !== pending.remainingOwnerIds.length ||
      pending.remainingOwnerIds.some((ownerId) => !knownPlayers.has(ownerId))) {
      issue("Death resolution cursor disagrees with its frame or players");
    }
    if (frame.stage === "death_triggers" && !sameOrderedStrings(
      liveXingshangOwnerIds(pending.remainingOwnerIds),
      xingshangOwnerIds(frame.death.victimId),
    )) {
      issue("Death resolution Xingshang queue disagrees with its active owners");
    }
    const completion = pending.completion;
    if (completion.type === "dying") {
      const dying = game.completeRules.dying.frames.find((candidate) => candidate.frameId === completion.frameId);
      if (!dying || dying.victimId !== frame.death.victimId || dying.stage !== "death_confirmed") {
        issue("Death resolution has no matching confirmed DyingStack frame");
      } else {
        if (completion.resume.type === "damage_flow") {
          const resume = completion.resume;
          const damageFrame = game.completeRules.damageFlow.frames.find((candidate) =>
            candidate.frameId === resume.frameId);
          if (!damageFrame?.dying || damageFrame.step !== "dying" ||
              completion.frameId !== resume.dyingId ||
              resume.damageId !== damageFrame.damageId ||
              resume.dyingId !== damageFrame.dying.dyingId ||
              damageFrame.dying.frameId !== damageFrame.frameId ||
              damageFrame.dying.damageId !== damageFrame.damageId ||
              damageFrame.dying.targetId !== dying.victimId ||
              dying.reason.type !== "damage" || dying.reason.eventId !== damageFrame.damageId ||
              dying.reason.sourceId !== damageFrame.damage.sourceId) {
            issue("Death resolution DamageFlow cursor disagrees with its confirmed dying frame");
          }
        }
        validateHpLossBusinessResume(completion.resume, dying);
        validateBusinessResume(completion.resume, null, dying);
        if (completion.resume.type === "guhuo") validateGuhuoPending(completion.resume.pending);
      }
    } else if (completion.type === "direct") {
      if (completion.resume.type === "damage_flow") {
        issue("Direct death cannot resume a DamageFlow dying barrier");
      } else {
        validateBusinessResume(completion.resume);
      }
    } else if (completion.type === "wuhun") {
      const parent = activeDeathFrames.find((candidate) => candidate.frameId === frame.parentFrameId);
      if (!parent || parent.suspendedByFrameId !== frame.frameId ||
        completion.parent.frameId !== parent.frameId || completion.parent.wuhunResolved !== true) {
        issue("Wuhun child death continuation disagrees with its parent frame");
      } else {
        validateDeathResolution(completion.parent, parent);
      }
    }
  };
  for (const frame of activeDeathFrames) {
    const victim = game.players.find((player) => player.id === frame.death.victimId);
    const stageEventIds = [
      frame.death.eventId,
      frame.identityReveal?.eventId,
      frame.deathTriggers?.eventId,
      frame.cardDisposition?.eventId,
      frame.rewardPunishment?.eventId,
      frame.deathAfter?.eventId,
    ].filter((eventId): eventId is number => eventId !== undefined);
    if (!victim || victim.alive || victim.hp > 0 || frame.frameId !== frame.death.eventId ||
      stageEventIds.some((eventId) => eventId >= game.nextEventId) ||
      (frame.death.killerId !== null && !knownPlayers.has(frame.death.killerId)) ||
      (frame.death.reason.sourceId !== null && !knownPlayers.has(frame.death.reason.sourceId))) {
      issue("DeathStack frame disagrees with the live game roster or counters");
    }
  }
  const deathCursorCount = Number(deathSkillCursor !== null) + Number(deathJudgmentCursor !== null);
  if (activeDeathFrames.length > 0 && deathCursorCount !== 1) {
    issue("Active DeathStack must have exactly one restorable interaction cursor");
  }
  if (activeDeathFrames.length === 0 && deathCursorCount > 0) {
    issue("Death interaction cursor has no active DeathStack");
  }
  if (game.players.some((player) => {
    if (player.alive) {
      if (player.hp > 0 || dyingVictimIds.has(player.id)) return false;
      const wounds = player.extraPiles.buqu ?? [];
      const woundRanks = wounds.map((card) => card.rank);
      const hasBuqu = hasEffectiveSkill(player, "buqu");
      return !hasBuqu || wounds.length === 0 || woundRanks.some((rank) => rank === undefined) ||
        new Set(woundRanks).size !== woundRanks.length;
    }
    const deathFrame = deathFramesByVictim.get(player.id);
    if (!deathFrame) return player.hp !== 0;
    return player.hp > 0;
  })) issue("Player alive flag disagrees with hp");
  const allCards = [
    ...game.deck,
    ...game.discardPile,
    ...(game.resolvingCards ?? []),
    ...game.players.flatMap((player) => player.hand),
    ...game.players.flatMap((player) => Object.values(player.equipment)),
    ...game.players.flatMap((player) => player.judgment),
    ...game.players.flatMap((player) => Object.values(player.extraPiles).flat()),
    ...embeddedPublicCardsFromPending(game.pendingResponse),
    ...embeddedPublicCardsFromPending(game.afterMove.suspendedResponse),
  ];
  if (new Set(allCards.map((card) => card.id)).size !== allCards.length) issue("Card appears in multiple zones");
  if (game.completeRules.nextEventId !== game.nextEventId) issue("Complete-rules event counter is out of sync");
  const responseCarriers = [game.pendingResponse, game.afterMove.suspendedResponse]
    .filter((pending): pending is PersistedPendingResponse => pending !== null);
  const semanticResponseCarriers = [
    ...responseCarriers,
    ...responseCarriers.flatMap((pending) =>
      pending.type === "lord_dispatch" && pending.resume.type === "use_slash" && pending.resume.failureResume
        ? [pending.resume.failureResume]
        : []),
  ];
  if (semanticResponseCarriers.flatMap(suspendedResponsePlayerIds).some((id) => !knownPlayers.has(id))) {
    issue("Pending response references an unknown player");
  }
  for (const pending of responseCarriers) {
    if (pending.type !== "lord_dispatch") continue;
    const requester = game.players.find((player) => player.id === pending.requesterId);
    const expectedFaction = pending.skillId === "hujia" ? "wei" : "shu";
    const expectedKind = pending.skillId === "hujia" ? "dodge" : "slash";
    const providerIds = [pending.targetId, ...pending.remainingProviderIds];
    const orderedProviders = requester
      ? game.players
          .filter((player) => player.alive && player.id !== requester.id)
          .sort((left, right) =>
            ((left.seat - requester.seat + game.players.length) % game.players.length) -
            ((right.seat - requester.seat + game.players.length) % game.players.length))
          .filter((player) => playerFaction(player) === expectedFaction)
      : [];
    const providerIndex = orderedProviders.findIndex((player) => player.id === pending.targetId);
    const expectedProviders = providerIndex < 0 ? [] : orderedProviders.slice(providerIndex).map((player) => player.id);
    const resumedKind = pending.resume.type === "respond"
      ? pending.resume.pending.type === "slash" ||
        (pending.resume.pending.type === "mass_attack" && pending.resume.pending.responseKind === "dodge")
        ? "dodge"
        : "slash"
      : "slash";
    const failure = pending.resume.type === "use_slash" ? pending.resume.failureResume : undefined;
    const failureOwner = failure?.sourceId
      ? game.players.find((player) => player.id === failure.sourceId)
      : undefined;
    const failureValid = pending.resume.type !== "use_slash"
      ? true
      : failure
        ? pending.resume.ignoreUseLimit === true && pending.resume.completion?.type === "default" &&
          pending.resume.targetIds.length === 1 &&
          failure.skillId === "tiaoxin" && failure.stage === "tiaoxin_response" &&
          failure.targetId === pending.requesterId && failure.sourceId === pending.resume.targetIds[0] &&
          failure.eventId < pending.eventId &&
          failure.promptId === standardPromptId(
            failure.eventId,
            "tiaoxin",
            failure.targetId,
            `respond-${failure.sourceId}`,
          ) &&
          sameOrderedStrings(failure.processedPlayerIds ?? [], [pending.requesterId]) &&
          !!failureOwner?.alive && hasEffectiveSkill(failureOwner, "tiaoxin") &&
          game.currentPlayerId === failureOwner.id && game.turn.skillUseCounts.tiaoxin === 1
        : pending.resume.ignoreUseLimit === undefined && pending.resume.completion === undefined;
    if (
      !requester?.alive || !hasEffectiveSkill(requester, pending.skillId) ||
      pending.eventId >= game.nextEventId ||
      pending.promptId !== `lord:${pending.eventId}:${pending.skillId}:${pending.requesterId}:${pending.targetId}` ||
      pending.requiredFaction !== expectedFaction || pending.responseKind !== expectedKind ||
      resumedKind !== expectedKind || pending.method !== (pending.resume.type === "use_slash" ? "use" : "respond") ||
      pending.requesterId === pending.targetId || !sameOrderedStrings(providerIds, expectedProviders) ||
      (pending.resume.type === "respond" && pending.resume.pending.targetId !== pending.requesterId) ||
      (pending.resume.type === "use_slash" && pending.skillId !== "jijiang") || !failureValid
    ) {
      issue("Lord dispatch prompt state is inconsistent");
    }
  }
  for (const pending of semanticResponseCarriers) {
    if (pending.type === "nullification") validateNullificationMetadata(pending, true);
    if (pending.type === "guhuo") validateGuhuoPending(pending);
    if (pending.type === "pindian") validatePindianPending(pending);
    if (pending.type === "qiangxi_effect") validateQiangxiContinuation(pending, true);
    if (pending.type === "zone_selection") {
      const source = game.players.find((player) => player.id === pending.attackerId);
      const victim = game.players.find((player) => player.id === pending.victimId);
      const expectedMode = pending.cardKind === "guo_he_chai_qiao" ? "discard" : "gain";
      if (!source?.alive || !victim?.alive || source.id === victim.id || pending.targetId !== source.id ||
          pending.mode !== expectedMode ||
          (game.resolvingCards ?? []).filter((card) => card.id === pending.cardId).length !== 1) {
        issue("Zone-selection prompt disagrees with its trick effect");
      }
    }
    if (pending.type === "weapon_action") {
      const attacker = game.players.find((player) => player.id === pending.attackerId);
      const victim = game.players.find((player) => player.id === pending.victimId);
      const expectedWeaponByStage: Readonly<Record<string, string>> = {
        zhuque_convert: "zhu_que_yu_shan",
        cixiong_activate: "ci_xiong_shuang_gu_jian",
        cixiong_choice: "ci_xiong_shuang_gu_jian",
        guanshi_force_hit: "guan_shi_fu",
        qinglong_followup: "qing_long_yan_yue_dao",
        hanbing_prevent: "han_bing_jian",
        hanbing_select: "han_bing_jian",
        qilin_discard_horse: "qi_lin_gong",
      };
      const expectedTargetId = pending.stage === "cixiong_choice" ? pending.victimId : pending.attackerId;
      const required = pending.slash.requiredDodgeCount ?? 1;
      const dodged = (pending.slash.dodgesPlayed ?? 0) >= required;
      const stageProgressValid = pending.stage === "guanshi_force_hit" || pending.stage === "qinglong_followup"
        ? dodged
        : pending.stage === "hanbing_prevent" || pending.stage === "hanbing_select"
          ? !dodged
          : true;
      const selectionCountValid = pending.stage === "hanbing_select"
        ? pending.remainingSelections === 1 || pending.remainingSelections === 2
        : pending.remainingSelections === undefined;
      if (!attacker?.alive || !victim?.alive || attacker.equipment.weapon?.kind !== pending.weaponKind ||
          pending.weaponKind !== expectedWeaponByStage[pending.stage] || pending.targetId !== expectedTargetId ||
          pending.slash.attackerId !== attacker.id || pending.slash.targetId !== victim.id ||
          !stageProgressValid || !selectionCountValid ||
          (pending.damageOpportunity !== undefined) !== (pending.stage === "qilin_discard_horse")) {
        issue("Weapon prompt stage disagrees with its equipped weapon and Slash frame");
      }
    }
    if (pending.type === "amazing_grace_selection") {
      const target = game.players.find((player) => player.id === pending.targetId);
      const attackerSeat = game.players.findIndex((player) => player.id === pending.attackerId);
      const targetOrder = [pending.targetId, ...pending.remainingTargetIds];
      const offsets = targetOrder.map((playerId) => {
        const seat = game.players.findIndex((player) => player.id === playerId);
        return attackerSeat < 0 || seat < 0 ? -1 : (seat - attackerSeat + game.players.length) % game.players.length;
      });
      if (!target?.alive || pending.pool.length === 0 ||
          new Set(pending.pool.map((card) => card.id)).size !== pending.pool.length ||
          new Set(targetOrder).size !== targetOrder.length ||
          offsets.some((offset, index) => offset < 0 || (index > 0 && offset <= offsets[index - 1]!)) ||
          (game.resolvingCards ?? []).filter((card) => card.id === pending.cardId).length !== 1) {
        issue("Amazing Grace prompt pool or target cursor is inconsistent");
      }
    }
    if (pending.type === "borrowed_sword") {
      const holder = game.players.find((player) => player.id === pending.targetId);
      const attackTarget = game.players.find((player) => player.id === pending.attackTargetId);
      let targetInRange = false;
      if (holder?.alive && attackTarget?.alive) {
        try {
          targetInRange = distanceBetweenPlayers(authoritativeGame, holder.id, attackTarget.id) <=
            attackRangeFor(authoritativeGame, holder.id);
        } catch {
          targetInRange = false;
        }
      }
      if (!holder?.alive || !attackTarget?.alive || holder.id === attackTarget.id || !holder.equipment.weapon ||
          !targetInRange || (game.resolvingCards ?? []).filter((card) => card.id === pending.cardId).length !== 1) {
        issue("Borrowed Sword response disagrees with its holder, weapon, or attack target");
      }
    }
    if (pending.type === "standard_skill" && pending.aftermath) {
      validateStandardDamageAftermath(pending.aftermath, pending.skillId);
      if (pending.targetId !== pending.aftermath.targetId ||
          (pending.sourceId ?? null) !== pending.aftermath.sourceId) {
        issue("Standard damage prompt disagrees with its aftermath participants");
      }
    }
  }
  const deathResolutions = semanticResponseCarriers.flatMap((pending) => {
    if (pending.type === "standard_skill" && pending.deathResolution) return [pending.deathResolution];
    if (pending.type === "standard_judgment" && pending.context.type === "wuhun") {
      return [pending.context.deathResolution];
    }
    return [];
  });
  const dyingInteractions = [
    ...semanticResponseCarriers.flatMap((pending) => dyingInteractionsFromPending(pending)),
    ...deathResolutions.flatMap((pending) => dyingInteractionsFromDeathResolution(pending)),
  ];
  const dyingInteractionFrameIds = dyingInteractions.map(dyingInteractionFrameId);
  if (dyingInteractionFrameIds.some((frameId) => frameId === null) ||
      new Set(dyingInteractionFrameIds).size !== dyingInteractionFrameIds.length) {
    issue("DyingStack interaction cursors are duplicated or malformed");
  }
  const damageOpportunityCarriers = semanticResponseCarriers.flatMap((pending) => {
    const cursor = damageOpportunityFromPending(pending);
    return cursor ? [{ pending, cursor }] : [];
  });
  const damageOpportunityCursors = damageOpportunityCarriers.map((entry) => entry.cursor);
  const activeDamageFrames = game.completeRules.damageFlow.frames;
  const callerSlashFrames: Array<z.infer<typeof slashResponseSchema>> = [];
  const callerMassAttackFrames: Array<z.infer<typeof massAttackResponseSchema>> = [];
  const callerNullificationFrames: Array<z.infer<typeof nullificationResponseSchema>> = [];
  const callerDuelFrames: Array<z.infer<typeof duelResponseSchema>> = [];
  const tianxiangVisitedTargetIds = (frame: (typeof activeDamageFrames)[number]): Set<string> => new Set([
    frame.damage.originalTargetId,
    ...frame.damage.redirects.map((redirect) => redirect.toTargetId),
  ]);
  const hasTianxiangChoice = (
    frame: (typeof activeDamageFrames)[number],
    owner: z.infer<typeof gamePlayerSchema>,
  ): boolean => {
    const visited = tianxiangVisitedTargetIds(frame);
    const target = game.players.find((candidate) =>
      candidate.alive && candidate.id !== owner.id && !visited.has(candidate.id));
    if (!target) return false;
    return owner.hand.some((card) =>
      card.suit === "heart" || (card.suit === "spade" && hasEffectiveSkill(owner, "hongyan")));
  };
  const topDamageFrame = activeDamageFrames.at(-1);
  const lastDamageRedirect = topDamageFrame?.damage.redirects.at(-1);
  const tianxiangAfterMovePause =
    game.pendingResponse?.type === "skill_choice" &&
    game.pendingResponse.skillId === "lianying" &&
    game.pendingResponse.resume.type === "after_move" &&
    game.afterMove.suspendedPhase === "respond" &&
    game.afterMove.suspendedResponse === null &&
    game.afterMove.queuedRecoveries.length === 0 &&
    game.afterMove.queuedTriggers.length === 0 &&
    topDamageFrame?.step === "redirect" &&
    topDamageFrame.window === null &&
    lastDamageRedirect?.skillId === "tianxiang" &&
    lastDamageRedirect.sourceId === game.pendingResponse.targetId &&
    lastDamageRedirect.fromTargetId === game.pendingResponse.targetId &&
    game.players.some((player) =>
      player.id === game.pendingResponse!.targetId &&
      player.alive &&
      player.hand.length === 0 &&
      hasEffectiveSkill(player, "tianxiang") &&
      hasEffectiveSkill(player, "lianying"));

  for (const frame of activeDamageFrames) {
    const visited = new Set<string>([frame.damage.originalTargetId]);
    for (const [index, redirect] of frame.damage.redirects.entries()) {
      if (
        !knownPlayers.has(redirect.fromTargetId) ||
        !knownPlayers.has(redirect.toTargetId) ||
        (redirect.sourceId !== null && !knownPlayers.has(redirect.sourceId))
      ) issue("Damage redirect history references an unknown player");
      if (visited.has(redirect.toTargetId)) issue("Damage redirect history contains a visited target");
      visited.add(redirect.toTargetId);
      if (redirect.skillId !== "tianxiang") continue;
      const opportunityId = `${frame.damageId}:redirect:tianxiang:${redirect.fromTargetId}:0`;
      const action = game.completeRules.damageFlow.consumedActions.find((candidate) =>
        candidate.frameId === frame.frameId && candidate.opportunityId === opportunityId);
      if (
        redirect.sourceId !== redirect.fromTargetId ||
        !action ||
        action.damageId !== frame.damageId ||
        action.ownerId !== redirect.fromTargetId ||
        action.outcome !== "resolve" ||
        action.resolutionRef !== `tianxiang:${frame.damageId}:redirect:${index + 1}`
      ) issue("Tianxiang redirect history has no matching consumed opportunity");
    }

    const settlementOpportunities = frame.window?.kind === "settlement_end"
      ? frame.window.opportunities.filter((opportunity) => opportunity.ref.skillId === "tianxiang_draw")
      : [];
    const expectedSettlementRefs = frame.damage.redirects
      .map((redirect, index) => ({ redirect, index }))
      .filter(({ redirect }) => redirect.skillId === "tianxiang")
      .reverse();
    if (frame.window?.kind === "settlement_end" && (
      settlementOpportunities.length !== expectedSettlementRefs.length ||
      settlementOpportunities.some((opportunity, index) => {
        const expected = expectedSettlementRefs[index];
        return !expected ||
          opportunity.ref.opportunityId !== `${frame.damageId}:settlement_end:tianxiang_draw:${expected.redirect.toTargetId}:${expected.index + 1}` ||
          opportunity.ref.ownerId !== expected.redirect.toTargetId ||
          opportunity.ref.relation !== "global" ||
          opportunity.ref.cadence !== "settlement" ||
          opportunity.ref.pointIndex !== null;
      })
    )) issue("Tianxiang settlement draw opportunities disagree with redirect history");
    if (frame.window?.kind !== "settlement_end" && frame.window?.opportunities.some(
      (opportunity) => opportunity.ref.skillId === "tianxiang_draw"
    )) issue("Tianxiang settlement draw opportunity is in the wrong window");
  }

  if (activeDamageFrames.length > 0) {
    if (game.status === "finished") {
      issue("Finished game cannot retain an active damage flow");
    }
    for (const frame of activeDamageFrames) {
      if (!knownPlayers.has(frame.damage.targetId) || (frame.damage.sourceId !== null && !knownPlayers.has(frame.damage.sourceId))) {
        issue("Active damage flow references an unknown player");
      }
    }
    const root = activeDamageFrames[0]!;
    if (root.callerContinuation === null) {
      issue("Root damage flow is missing its caller continuation");
    } else {
      try {
        const callerResume = decodeGameDamageContinuation(root.callerContinuation);
        if (dyingResumePlayerIds(callerResume).some((id) => !knownPlayers.has(id))) {
          issue("Damage-flow caller continuation references an unknown player");
        }
        validateBusinessResume(callerResume, root);
        callerSlashFrames.push(...slashResponsesFromResume(callerResume));
        callerMassAttackFrames.push(...massAttackResponsesFromResume(callerResume));
        callerNullificationFrames.push(...nullificationResponsesFromResume(callerResume));
        callerDuelFrames.push(...duelResponsesFromResume(callerResume));
      } catch {
        issue("Active damage flow has an invalid caller continuation");
      }
    }

    const frame = activeDamageFrames.at(-1)!;
    if (frame.step === "dying") {
      if (damageOpportunityCursors.length > 0) {
        issue("Dying damage flow cannot retain a post-damage opportunity cursor");
      }
    } else if ((frame.step === "post_damage" || frame.step === "redirect") && frame.window?.prompt) {
      if (damageOpportunityCursors.length !== 1) {
        issue("Active post-damage flow must have exactly one matching opportunity cursor");
      } else {
        const carrier = damageOpportunityCarriers[0]!;
        const cursor = carrier.cursor;
        const prompt = frame.window.prompt;
        const opportunity = frame.window.opportunities[frame.window.cursor];
        if (
          cursor.actionId !== game.completeRules.damageFlow.nextActionId ||
          cursor.promptId !== prompt.promptId ||
          cursor.frameId !== frame.frameId ||
          cursor.damageId !== frame.damageId ||
          cursor.windowId !== frame.window.windowId ||
          cursor.opportunityId !== prompt.opportunityId ||
          cursor.ownerId !== prompt.ownerId ||
          cursor.expectedRevision !== prompt.issuedAtRevision ||
          !knownPlayers.has(cursor.ownerId)
        ) issue("Damage opportunity cursor disagrees with the active flow prompt");
        if (!opportunity || opportunity.ref.opportunityId !== cursor.opportunityId) {
          issue("Damage opportunity cursor has no current opportunity");
        } else if (carrier.pending.type === "pindian") {
          if (
            carrier.pending.continuation.type !== "lieren" ||
            opportunity.ref.skillId !== "lieren" ||
            cursor.ownerId !== carrier.pending.frame.initiatorId ||
            frame.damage.sourceId !== carrier.pending.frame.initiatorId ||
            frame.damage.targetId !== carrier.pending.frame.targetId
          ) issue("Lieren Pindian does not own the active damage opportunity");
        } else if (carrier.pending.type === "standard_skill") {
          const expectedOwnerId = (carrier.pending.skillId === "ganglie" && carrier.pending.stage === "ganglie_punish") ||
              (carrier.pending.skillId === "beige" && carrier.pending.stage === "beige_source_discard")
            ? carrier.pending.sourceId
            : carrier.pending.targetId;
          if (opportunity.ref.skillId !== carrier.pending.skillId || expectedOwnerId !== cursor.ownerId) {
            issue("Standard skill does not own the active damage opportunity");
          }
        } else if (carrier.pending.type === "weapon_action") {
          if (
            opportunity.ref.skillId !== "qi_lin_gong" ||
            carrier.pending.weaponKind !== "qi_lin_gong" ||
            carrier.pending.stage !== "qilin_discard_horse" ||
            carrier.pending.attackerId !== cursor.ownerId ||
            carrier.pending.targetId !== cursor.ownerId ||
            carrier.pending.victimId !== frame.damage.targetId
          ) issue("Weapon prompt does not own the active damage opportunity");
        } else if (carrier.pending.type !== "standard_judgment") {
          issue("Judgment prompt does not own the active damage opportunity");
        } else if (carrier.pending.context.type === "ganglie") {
          if (frame.damage.stage !== "target_after_once" || opportunity.ref.skillId !== "ganglie" ||
              opportunity.ref.relation !== "target" || opportunity.ref.cadence !== "once" ||
              opportunity.ref.pointIndex !== null ||
              opportunity.ref.opportunityId !== `${frame.damageId}:target_after_once:ganglie:${frame.damage.targetId}:0` ||
              cursor.ownerId !== frame.damage.targetId) {
            issue("Ganglie judgment does not own the active damage opportunity");
          }
        } else if (carrier.pending.context.type === "baonue") {
          if (frame.damage.stage !== "source_after_once" || opportunity.ref.skillId !== "baonue" ||
              opportunity.ref.relation !== "source" || opportunity.ref.cadence !== "once" ||
              opportunity.ref.pointIndex !== null ||
              opportunity.ref.opportunityId !== `${frame.damageId}:source_after_once:baonue:${frame.damage.sourceId}:0` ||
              cursor.ownerId !== frame.damage.sourceId) {
            issue("Baonue judgment does not own the active damage opportunity");
          }
        } else if (carrier.pending.context.type === "beige") {
          const slashContinuationMatches = callerSlashFrames.some((slash) => {
            const slashCardIds = slash.damageCardIds ?? [slash.cardId];
            return slash.attackerId === frame.damage.sourceId && slash.targetId === frame.damage.originalTargetId &&
              sameOrderedStrings([...slashCardIds].sort(), [...frame.damage.physicalCardIds].sort());
          });
          if (frame.damage.stage !== "target_after_once" || opportunity.ref.skillId !== "beige" ||
              opportunity.ref.relation !== "global" || opportunity.ref.cadence !== "once" ||
              opportunity.ref.pointIndex !== null ||
              opportunity.ref.opportunityId !== `${frame.damageId}:target_after_once:beige:${carrier.pending.context.ownerId}:0` ||
              cursor.ownerId !== carrier.pending.context.ownerId || frame.damage.targetId !== carrier.pending.frame.targetId ||
              !slashContinuationMatches) {
            issue("Beige judgment does not own the active damage opportunity");
          }
        } else {
          issue("Judgment prompt does not own the active damage opportunity");
        }
      }
    } else if (!(frame.step === "redirect" && frame.window === null && tianxiangAfterMovePause)) {
      issue("Active damage flow has no restorable interaction cursor");
    }
  } else if (damageOpportunityCursors.length > 0) {
    issue("Damage opportunity cursor has no active damage flow");
  }

  for (const pending of dyingInteractions) {
    const resume = dyingResumeFromPending(pending);
    if (!resume) continue;
    if (resume.type === "guhuo") validateGuhuoPending(resume.pending);
    if (resume.type === "qiangxi") validateQiangxiContinuation(resume);
    const expected = dyingDamageSourceFromResume(resume);
    const interactionFrameId = pending.type === "dying"
      ? pending.frameId
      : pending.type === "skill_choice" && pending.resume.type === "dying"
        ? pending.resume.frameId
        : null;
    const interactionFrame = game.completeRules.dying.frames.find((frame) => frame.frameId === interactionFrameId);
    const damageSourceId = pending.type === "dying"
      ? pending.damageSourceId
      : interactionFrame?.reason.sourceId ?? null;
    if (expected.known && damageSourceId !== expected.sourceId) {
      issue("Dying damage source disagrees with its causal continuation");
    }
    validateHpLossBusinessResume(resume, interactionFrame);
    validateBusinessResume(resume, null, interactionFrame);
  }

  const physicalCardIds = new Set(allCards.map((card) => card.id));
  const validateCardUseContinuation = (
    continuation: z.infer<typeof cardUseContinuationSchema>,
  ): boolean => {
    const { intent } = continuation;
    const source = game.players.find((player) => player.id === intent.sourceId);
    const targets = intent.targetIds.map((targetId) => game.players.find((player) => player.id === targetId));
    const ownedCards = source ? [...source.hand, ...Object.values(source.equipment)] : [];
    const legalPrimaryCards = !source
      ? []
      : intent.viaSkill === "jixi"
        ? source.extraPiles.field ?? []
        : intent.viaSkill === "guhuo"
          ? [...source.hand, ...(game.resolvingCards ?? [])]
          : ownedCards;
    const primaryMatches = legalPrimaryCards.filter((card) => card.id === intent.physicalCardId);
    const primary = primaryMatches[0];
    const supportedViaKind = intent.viaSkill === null
      ? intent.physicalKind === intent.effectiveKind && !!source?.hand.some((card) => card.id === intent.physicalCardId)
      : (intent.viaSkill === "guhuo" && isGuhuoDeclarableKind(intent.effectiveKind)) ||
        (intent.viaSkill === "duanliang" && intent.effectiveKind === "bing_liang_cun_duan") ||
        (intent.viaSkill === "jixi" && intent.effectiveKind === "shun_shou_qian_yang") ||
        (intent.viaSkill === "luanji" && intent.effectiveKind === "arrow_barrage") ||
        (intent.viaSkill === "qixi" && intent.effectiveKind === "guo_he_chai_qiao") ||
        (intent.viaSkill === "huoji" && intent.effectiveKind === "fire_attack") ||
        (intent.viaSkill === "lianhuan" && intent.effectiveKind === "iron_chain") ||
        (intent.viaSkill === "shuangxiong" && intent.effectiveKind === "duel");
    const viaSkillEffective = intent.viaSkill === null ||
      (!!source && hasEffectiveSkill(source, intent.viaSkill));
    let additionalValid = intent.additionalPhysicalCards === undefined;
    if (intent.viaSkill === "luanji") {
      const additional = intent.additionalPhysicalCards?.[0];
      const second = additional && source?.hand.find((card) => card.id === additional.id);
      const first = source?.hand.find((card) => card.id === intent.physicalCardId);
      const firstSuit = first?.suit && source ? resolveHongyanSuit({
        printedSuit: first.suit,
        cardOwnerId: source.id,
        hongyan: { ownerId: source.id, active: hasEffectiveSkill(source, "hongyan") },
      }) : null;
      const secondSuit = second?.suit && source ? resolveHongyanSuit({
        printedSuit: second.suit,
        cardOwnerId: source.id,
        hongyan: { ownerId: source.id, active: hasEffectiveSkill(source, "hongyan") },
      }) : null;
      additionalValid = !!additional && intent.additionalPhysicalCards?.length === 1 &&
        !!first && !!second && first.id !== second.id &&
        second.kind === additional.kind && second.suit === additional.suit && second.rank === additional.rank &&
        firstSuit?.ok === true && secondSuit?.ok === true &&
        firstSuit.value.effectiveSuit === secondSuit.value.effectiveSuit;
    }
    const valid = !!source?.alive && source.id === game.currentPlayerId && intent.method === "use" &&
      intent.useId === game.nextUseId - 1 && continuation.eventId < game.nextEventId &&
      new Set(intent.targetIds).size === intent.targetIds.length &&
      targets.every((target) => intent.viaSkill === "guhuo" ? target !== undefined : target?.alive) &&
      primaryMatches.length === 1 && !!primary && primary.kind === intent.physicalKind &&
      primary.suit === intent.suit && primary.rank === intent.rank &&
      supportedViaKind && viaSkillEffective && additionalValid;
    if (source && primaryMatches.length === 0) {
      issue("Card-use continuation physical card is no longer owned by its source");
    }
    if (!valid) issue("Card-use continuation intent is inconsistent with authoritative cards or players");
    if (valid) {
      try {
        assertRestorableCardUseContinuation(authoritativeGame, continuation as CardUseContinuation);
      } catch {
        issue("Card-use continuation failed committed runtime validation");
      }
    }
    return valid;
  };
  const damageFrameByDyingId = new Map(
    activeDamageFrames.flatMap((frame) => frame.dying ? [[frame.dying.dyingId, frame] as const] : []),
  );
  for (const frame of activeDamageFrames) {
    if (frame.step !== "dying" || !frame.dying) continue;
    const dyingFrame = game.completeRules.dying.frames.find((candidate) => candidate.frameId === frame.dying!.dyingId);
    if (!dyingFrame ||
      dyingFrame.victimId !== frame.damage.targetId ||
      dyingFrame.reason.type !== "damage" ||
      dyingFrame.reason.eventId !== frame.damageId ||
      dyingFrame.reason.sourceId !== frame.damage.sourceId
    ) issue("Damage-flow dying barrier has no exact DyingStack frame");
  }

  for (const frame of game.completeRules.dying.frames) {
    const victim = game.players.find((player) => player.id === frame.victimId);
    const damageFrame = damageFrameByDyingId.get(frame.frameId);
    if (!victim || (frame.reason.sourceId !== null && !knownPlayers.has(frame.reason.sourceId))) {
      issue("DyingStack references an unknown player");
      continue;
    }
    if (frame.reason.type === "hp_loss" && frame.reason.sourceId !== null) {
      issue("HP-loss dying reason cannot retain a damage source");
    }
    if (damageFrame) {
      if (
        frame.reason.type !== "damage" ||
        frame.reason.eventId !== damageFrame.damageId ||
        frame.reason.sourceId !== damageFrame.damage.sourceId ||
        frame.victimId !== damageFrame.damage.targetId
      ) issue("DyingStack damage provenance is inconsistent");
    } else if (frame.frameId >= game.nextEventId || frame.reason.eventId >= game.nextEventId) {
      issue("Non-DamageFlow dying identifiers are not behind the event counter");
    }

    let expectedHp = damageFrame?.dying?.hpAfterDamage;
    for (const rescue of frame.rescues) {
      if (!knownPlayers.has(rescue.responderId) || rescue.eventId >= game.nextEventId) {
        issue("Dying rescue references an unknown player or future event");
      }
      if (rescue.useId !== null && rescue.useId >= game.nextUseId) {
        issue("Dying rescue use id is not behind the monotonic counter");
      }
      if (rescue.cardUseFrameId !== null && rescue.cardUseFrameId >= game.nextEventId) {
        issue("Dying rescue card-use frame is not behind the event counter");
      }
      if (rescue.physicalCardIds.some((cardId) => !physicalCardIds.has(cardId))) {
        issue("Dying rescue references a missing physical card");
      }
      if (rescue.moveRecords.some((record) =>
        record.batchId >= game.completeRules.nextMoveBatchId ||
        [record.actorId, record.sourceId, record.targetId]
          .some((playerId) => playerId !== undefined && playerId !== null && !knownPlayers.has(playerId))
      )) issue("Dying rescue move provenance is outside the room allocators");
      const responder = game.players.find((player) => player.id === rescue.responderId);
      if (rescue.provenance === "verified" && (
        !responder ||
        (rescue.cardKind === "view_as_peach" && (
          rescue.viewAsSkillId !== "jijiu" ||
          !hasEffectiveSkill(responder, "jijiu") ||
          rescue.responderId === game.currentPlayerId
        )) ||
        (rescue.suitModifierSkillId === "hongyan" && (
          rescue.cardKind !== "view_as_peach" ||
          !hasEffectiveSkill(responder, "hongyan")
        ))
      )) issue("Dying rescue effective-suit provenance disagrees with its responder skills");
      if (expectedHp !== undefined && rescue.hpAfter !== expectedHp + rescue.recoveredAmount) {
        issue("Dying rescue HP history is inconsistent");
      }
      expectedHp = rescue.hpAfter;
    }
    if (frame.rescues.length === 0 && frame.skillResolutions.length > 0) {
      expectedHp = frame.skillResolutions.at(-1)!.hpAfter;
    }
    if (expectedHp !== undefined && victim.hp !== expectedHp) {
      issue("Dying victim HP disagrees with its persisted history");
    }
  }

  const validateDamageFlowDyingCursor = (
    resume: z.infer<typeof dyingResumeSchema> | null,
    frame: (typeof game.completeRules.dying.frames)[number],
  ): void => {
    if (resume?.type !== "damage_flow") return;
    const damageFrame = activeDamageFrames.find((candidate) => candidate.frameId === resume.frameId);
    if (!damageFrame?.dying ||
      resume.damageId !== damageFrame.damageId ||
      resume.dyingId !== damageFrame.dying.dyingId ||
      frame.frameId !== damageFrame.dying.dyingId ||
      damageFrame !== activeDamageFrames.at(-1)
    ) issue("Dying cursor does not match the active damage barrier");
  };
  const interactiveDyingFrames = game.completeRules.dying.frames.filter((frame) =>
    frame.stage === "entry_save" || frame.stage === "rescue");
  const expectedDyingCursorOrder = [...interactiveDyingFrames].reverse().map((frame) => frame.frameId);
  if (dyingInteractionFrameIds.length !== expectedDyingCursorOrder.length ||
      dyingInteractionFrameIds.some((frameId, index) => frameId !== expectedDyingCursorOrder[index])) {
    issue("DyingStack cursors do not match the visible top-to-parent continuation chain");
  }

  for (const frame of game.completeRules.dying.frames) {
    const interaction = dyingInteractions.find((candidate) => dyingInteractionFrameId(candidate) === frame.frameId);
    if (frame.stage === "entry_save") {
      if (!interaction) {
        issue("Active DyingStack entry save must have exactly one interaction cursor");
        continue;
      }
      if (
        interaction.type !== "skill_choice" ||
        interaction.skillId !== "buqu" ||
        interaction.resume.type !== "dying"
      ) {
        issue("Buqu entry cursor disagrees with the DyingStack top");
      } else {
        const victim = game.players.find((player) => player.id === frame.victimId);
        const loss = interaction.resume.buquLoss;
        if (
          currentDyingEntrySaveSkill(frame) !== "buqu" ||
          interaction.resume.frameId !== frame.frameId ||
          interaction.targetId !== frame.victimId ||
          interaction.promptId !== `dying:${frame.frameId}:buqu-entry` ||
          interaction.triggerId !== undefined ||
          interaction.iteration !== undefined ||
          !loss ||
          !victim ||
          !hasEffectiveSkill(victim, "buqu") ||
          loss.hpBefore > victim.maxHp ||
          loss.hpBefore - loss.amount !== victim.hp
        ) issue("Buqu entry cursor disagrees with the DyingStack top");
        const resume = interaction.resume.resume;
        if (resume.type === "damage_flow") {
          const damageFrame = activeDamageFrames.find((candidate) => candidate.frameId === resume.frameId);
          if (damageFrame && loss && (
            damageFrame.damage.hpBefore !== loss.hpBefore ||
            damageFrame.damage.amount !== loss.amount
          )) issue("Buqu life-deduction cursor disagrees with its damage frame");
        }
        validateDamageFlowDyingCursor(resume, frame);
      }
    } else if (frame.stage === "rescue") {
      if (!interaction) {
        issue("Active DyingStack frame must have exactly one interaction cursor");
        continue;
      }
      const responderId = currentDyingResponder(frame);
      const expectsNiepan = currentDyingOwnerResponseSkill(frame) === "niepan";
      const resume = dyingResumeFromPending(interaction);
      if (interaction.type === "dying") {
        if (
          expectsNiepan ||
          interaction.frameId !== frame.frameId ||
          interaction.victimId !== frame.victimId ||
          interaction.damageSourceId !== (frame.reason.type === "damage" ? frame.reason.sourceId : null) ||
          interaction.targetId !== responderId ||
          !sameOrderedStrings(interaction.remainingResponderIds, frame.responderOrder.slice(frame.responderIndex + 1))
        ) issue("Dying responder cursor disagrees with the DyingStack top");
      } else if (
        !expectsNiepan ||
        interaction.type !== "skill_choice" ||
        interaction.skillId !== "niepan" ||
        interaction.resume.type !== "dying" ||
        interaction.resume.frameId !== frame.frameId ||
        interaction.targetId !== responderId ||
        interaction.promptId !== `dying:${frame.frameId}:niepan` ||
        interaction.triggerId !== undefined ||
        interaction.iteration !== undefined
      ) issue("Niepan cursor disagrees with the DyingStack top");

      validateDamageFlowDyingCursor(resume, frame);
    } else if (frame.stage === "death_confirmed") {
      if (interaction || !deathFramesByVictim.has(frame.victimId)) {
        issue("Confirmed DyingStack frame is not owned by an active DeathStack frame");
      }
    } else {
      issue("DyingStack frame is not at a restorable interaction stage");
    }
  }
  if (game.completeRules.dying.frames.length === 0 && dyingInteractions.length > 0) {
    issue("Dying interaction has no DyingStack frame");
  }

  if (game.status === "finished" && (game.completeRules.dying.frames.length > 0 || game.completeRules.death.frames.length > 0)) {
    issue("Finished game cannot retain dying or death stack work");
  }

  const slashFrames = [
    ...slashResponsesFromPending(game.pendingResponse),
    ...slashResponsesFromPending(game.afterMove.suspendedResponse),
    ...callerSlashFrames,
  ].filter((slash, index, frames) => frames.indexOf(slash) === index);
  const massAttackFrames = [
    ...massAttackResponsesFromPending(game.pendingResponse),
    ...massAttackResponsesFromPending(game.afterMove.suspendedResponse),
    ...callerMassAttackFrames,
  ].filter((pending, index, frames) => frames.indexOf(pending) === index);
  const nullificationFrames = [
    ...nullificationResponsesFromPending(game.pendingResponse),
    ...nullificationResponsesFromPending(game.afterMove.suspendedResponse),
    ...callerNullificationFrames,
  ].filter((pending, index, frames) => frames.indexOf(pending) === index);
  const duelFrames = [
    ...duelResponsesFromPending(game.pendingResponse),
    ...duelResponsesFromPending(game.afterMove.suspendedResponse),
    ...callerDuelFrames,
  ].filter((pending, index, frames) => frames.indexOf(pending) === index);
  const responseCommitmentKinds = new Set([
    "mass_attack_commitment",
    "nullification_progress",
    "slash_response_progress",
    "duel_response_progress",
  ]);
  const responseCommitmentCount = game.completeRules.lifecycle.effects.filter((effect) =>
    responseCommitmentKinds.has(effect.kind)).length;
  const activeResponseCommitmentCount = new Set([
    ...slashFrames.map((pending) => `slash_response_progress:${pending.cardId}`),
    ...massAttackFrames.map((pending) => `mass_attack_commitment:${pending.cardId}`),
    ...nullificationFrames.map((pending) => `nullification_progress:${pending.cardId}`),
    ...duelFrames.map((pending) => `duel_response_progress:${pending.cardId}`),
  ]).size;
  if (responseCommitmentCount !== activeResponseCommitmentCount) {
    issue("Response commitment effects do not match the active response frames");
  }
  for (const slash of slashFrames) {
    try {
      assertRestorableSlashResponse(authoritativeGame, slash);
    } catch {
      issue("Slash response disagrees with its frozen commitment");
    }
    const damageCardIds = slash.damageCardIds ?? [slash.cardId];
    const provenance = slash.useProvenance;
    const expectedNature = slash.slashKind === "fire_slash" ? "fire"
      : slash.slashKind === "thunder_slash" ? "thunder" : "normal";
    const resolvingMatches = damageCardIds.map((cardId) =>
      (game.resolvingCards ?? []).filter((card) => card.id === cardId));
    const shensu = slash.sourceSkillId === "shensu";
    if (slash.nature !== expectedNature || new Set(damageCardIds).size !== damageCardIds.length ||
        (shensu
          ? slash.damageCardIds?.length !== 0 || !/^virtual:shensu:\d+$/.test(slash.cardId) ||
            slash.slashKind !== "slash" || slash.nature !== "normal" || slash.color !== "colorless" ||
            slash.damage !== 1
          : damageCardIds.length < 1 || damageCardIds.length > 4 || damageCardIds[0] !== slash.cardId ||
            resolvingMatches.some((matches) => matches.length !== 1))) {
      issue("Slash physical cards, nature, or source skill are inconsistent");
    }
    if (provenance && (
      !knownPlayers.has(provenance.turnPlayerId) ||
      provenance.turnPlayerId !== game.turn.playerId ||
      (provenance.phase === "play" &&
        (provenance.method !== "use" || provenance.turnPlayerId !== slash.attackerId))
    )) {
      issue("Slash use provenance is inconsistent with the current turn");
    }
    if (slash.liegongChecked && !provenance) {
      issue("Liegong progress is missing Slash use provenance");
    }
    if (provenance?.phase === "respond" && slash.damage !== 1) {
      issue("Response-window Slash cannot retain play-phase damage bonuses");
    }
    if (shensu) {
      const eventId = Number(slash.cardId.slice("virtual:shensu:".length));
      const expectedDestination = provenance?.phase === "judgment" ? "before_play"
        : provenance?.phase === "play" ? "discard_or_end" : null;
      if (!Number.isSafeInteger(eventId) || eventId <= 0 || eventId >= game.nextEventId ||
          provenance?.method !== "use" || !expectedDestination || slash.remainingTargetIds.length !== 0 ||
          slash.completion.type !== "turn_flow" || slash.completion.playerId !== slash.attackerId ||
          slash.completion.destination !== expectedDestination) {
        issue("Shensu Slash continuation is inconsistent");
      }
    }
    if (slash.completion.type === "luanwu") {
      const completion = slash.completion;
      const ownerIndex = game.players.findIndex((player) => player.id === completion.ownerId);
      const expectedOrder = ownerIndex < 0 ? [] : Array.from(
        { length: game.players.length - 1 },
        (_value, index) => game.players[(ownerIndex + index + 1) % game.players.length]!.id,
      );
      const actualOrder = [...completion.processedActorIds, ...completion.remainingActorIds];
      const limitedUse = game.completeRules.lifecycle.limitedUses.some((entry) =>
        entry.ownerId === completion.ownerId && entry.skillId === "luanwu" &&
        entry.consumedAtEventId === completion.eventId);
      if (!sameOrderedStrings(actualOrder, expectedOrder) || !limitedUse || completion.eventId >= game.nextEventId ||
          completion.processedActorIds.at(-1) !== slash.attackerId || slash.remainingTargetIds.length !== 0 ||
          slash.damage !== 1 || provenance?.phase !== "respond") {
        issue("Luanwu Slash continuation is inconsistent");
      }
    }
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

  for (const pending of massAttackFrames) {
    try {
      assertRestorableMassAttackResponse(authoritativeGame, pending);
    } catch {
      issue("Mass-attack response disagrees with its frozen commitment");
    }
    const damageCardIds = pending.damageCardIds ?? [pending.cardId];
    const cards = damageCardIds.map((cardId) =>
      (game.resolvingCards ?? []).filter((card) => card.id === cardId));
    const targetOrder = [pending.targetId, ...pending.remainingTargetIds];
    const attackerIndex = game.players.findIndex((player) => player.id === pending.attackerId);
    const offsets = targetOrder.map((playerId) => {
      const index = game.players.findIndex((player) => player.id === playerId);
      return index < 0 || attackerIndex < 0 ? -1 : (index - attackerIndex + game.players.length) % game.players.length;
    });
    const orderValid = new Set(targetOrder).size === targetOrder.length && !targetOrder.includes(pending.attackerId) &&
      offsets.every((offset, index) => offset > 0 && (index === 0 || offset > offsets[index - 1]!));
    const responseKindValid = pending.cardKind === "barbarian_invasion"
      ? pending.responseKind === "slash"
      : pending.responseKind === "dodge";
    let entityValid = new Set(damageCardIds).size === damageCardIds.length &&
      damageCardIds[0] === pending.cardId && cards.every((matches) => matches.length === 1);
    if (pending.sourceSkillId === "luanji") {
      entityValid = entityValid && pending.cardKind === "arrow_barrage" && damageCardIds.length === 2;
    } else {
      entityValid = entityValid && damageCardIds.length === 1;
    }
    if (!responseKindValid || !entityValid || !orderValid) {
      issue("Mass-attack response source, entities, or target order are inconsistent");
    }
  }
  for (const pending of nullificationFrames) {
    try {
      assertRestorableNullificationResponse(authoritativeGame, pending as unknown as PendingNullificationResponse);
    } catch {
      issue("Nullification response disagrees with its frozen commitment");
    }
  }
  for (const pending of duelFrames) {
    try {
      assertRestorableDuelResponse(authoritativeGame, pending);
    } catch {
      issue("Duel response disagrees with its frozen commitment");
    }
  }

  const activeRecovery = game.pendingResponse?.type === "standard_skill"
    ? game.pendingResponse.recovery
    : undefined;
  const recoveryPoints = [
    ...(activeRecovery ? [activeRecovery] : []),
    ...game.afterMove.queuedRecoveries,
  ];
  if (new Set(recoveryPoints.map((recovery) => recovery.eventId)).size !== recoveryPoints.length) {
    issue("Recovery queue contains duplicate event identifiers");
  }
  for (const recovery of recoveryPoints) {
    const target = game.players.find((player) => player.id === recovery.targetId);
    if (!target || (recovery.sourceId !== null && !knownPlayers.has(recovery.sourceId))) {
      issue("Recovery queue references an unknown player");
      continue;
    }
    if (
      recovery.eventId >= game.nextEventId ||
      recovery.hpBefore !== target.hp ||
      !target.alive ||
      target.hp > 0 ||
      (target.extraPiles.buqu?.length ?? 0) === 0 ||
      !hasEffectiveSkill(target, "buqu")
    ) issue("Recovery queue is inconsistent with its Buqu owner");
    const rescue = recovery.dyingRescue;
    if (!rescue) continue;
    const dyingFrame = game.completeRules.dying.frames.find((frame) => frame.frameId === rescue.frameId);
    const processingCard = (game.resolvingCards ?? []).filter((card) => card.id === rescue.physicalCardId);
    const physical = processingCard[0];
    const responder = game.players.find((player) => player.id === rescue.responderId);
    const suspended = game.afterMove.suspendedResponse;
    const effectiveSuitMatches = physical !== undefined && (
      rescue.suitModifierSkillId === null
        ? rescue.effectiveSuit === physical.suit
        : rescue.cardKind === "view_as_peach" &&
          physical.suit === "spade" &&
          rescue.effectiveSuit === "heart" &&
          responder !== undefined &&
          hasEffectiveSkill(responder, "hongyan")
    );
    const cardKindMatches = effectiveSuitMatches && (rescue.cardKind === "peach"
      ? rescue.viewAsSkillId === null && physical.kind === "peach" && rescue.from === "hand"
      : rescue.cardKind === "wine"
        ? rescue.viewAsSkillId === null && physical.kind === "wine" && rescue.from === "hand" &&
          rescue.responderId === recovery.targetId
        : rescue.viewAsSkillId === "jijiu" &&
          (rescue.effectiveSuit === "heart" || rescue.effectiveSuit === "diamond") &&
          responder !== undefined &&
          hasEffectiveSkill(responder, "jijiu") &&
          rescue.responderId !== game.currentPlayerId);
    if (
      !dyingFrame ||
      dyingFrame.stage !== "rescue" ||
      dyingFrame.victimId !== recovery.targetId ||
      currentDyingResponder(dyingFrame) !== rescue.responderId ||
      rescue.responderId !== recovery.sourceId ||
      !knownPlayers.has(rescue.responderId) ||
      rescue.useId >= game.nextUseId ||
      rescue.cardUseFrameId >= game.nextEventId ||
      rescue.moveBatchId >= game.completeRules.nextMoveBatchId ||
      processingCard.length !== 1 ||
      !cardKindMatches ||
      (recovery.requestedAmount !== 1 && recovery.requestedAmount !== 2) ||
      suspended?.type !== "dying" ||
      suspended.frameId !== rescue.frameId ||
      suspended.victimId !== recovery.targetId ||
      suspended.targetId !== rescue.responderId
    ) issue("Queued dying rescue provenance is inconsistent");
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
  const buquRecoveryPrompt = game.pendingResponse?.type === "standard_skill" &&
    game.pendingResponse.skillId === "buqu" &&
    game.pendingResponse.stage === "buqu_recovery"
    ? game.pendingResponse
    : null;
  const tuntianAfterMovePrompt = game.pendingResponse?.type === "standard_skill" &&
      game.pendingResponse.skillId === "tuntian" && game.pendingResponse.stage === "tuntian_invoke" ||
    game.pendingResponse?.type === "standard_judgment" && game.pendingResponse.context.type === "tuntian";
  const afterMoveInteractionCount = Number(afterMovePrompt !== null) + Number(buquRecoveryPrompt !== null) +
    Number(tuntianAfterMovePrompt);
  if (game.afterMove.suspendedPhase === null) {
    if (
      game.afterMove.suspendedResponse !== null ||
      game.afterMove.queuedRecoveries.length > 0 ||
      game.afterMove.queuedTriggers.length > 0 ||
      afterMoveInteractionCount > 0
    ) {
      issue("After-move state has work without a suspended phase");
    }
  } else {
    if (afterMoveInteractionCount !== 1) issue("After-move state does not have exactly one active skill prompt");
    if (game.afterMove.suspendedResponse !== null && game.afterMove.suspendedPhase !== "respond") {
      issue("After-move suspended response is outside respond phase");
    }
    if (
      game.afterMove.suspendedResponse === null &&
      game.afterMove.suspendedPhase === "respond" &&
      !tianxiangAfterMovePause
    ) {
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
        : game.pendingResponse.type === "guhuo"
          ? guhuoPlayerIds(game.pendingResponse)
        : game.pendingResponse.type === "pindian" || game.pendingResponse.type === "qiangxi_effect"
          ? suspendedResponsePlayerIds(game.pendingResponse)
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
              : game.pendingResponse.resume.type === "dying"
                ? [game.pendingResponse.targetId, ...dyingResumePlayerIds(game.pendingResponse.resume.resume)]
                : [game.pendingResponse.targetId, game.pendingResponse.resume.playerId]
        : game.pendingResponse.type === "lord_dispatch"
          ? [
              game.pendingResponse.requesterId,
              game.pendingResponse.targetId,
              ...game.pendingResponse.remainingProviderIds,
              ...(game.pendingResponse.resume.type === "use_slash"
                ? [
                    ...game.pendingResponse.resume.targetIds,
                    ...(game.pendingResponse.resume.failureResume
                      ? suspendedResponsePlayerIds(game.pendingResponse.resume.failureResume)
                      : []),
                  ]
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
        game.pendingResponse.resume.type !== "dying" &&
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
          game.pendingResponse.resume.type !== "after_move") ||
        ((game.pendingResponse.skillId === "buqu" || game.pendingResponse.skillId === "niepan") &&
          game.pendingResponse.resume.type !== "dying")
      ) {
        issue("Skill choice has an incompatible resume point");
      }
      if (game.pendingResponse.resume.type === "dying" &&
        ((game.pendingResponse.skillId === "buqu") !== (game.pendingResponse.resume.buquLoss !== undefined))
      ) {
        issue("Dying skill choice carries incompatible Buqu loss metadata");
      }
      if (game.pendingResponse.skillId !== "luoshen" && game.pendingResponse.iteration !== undefined) {
        issue("Only Luoshen may persist a repeat iteration");
      }
      if (game.pendingResponse.skillId === "jizhi" || game.pendingResponse.skillId === "jilue") {
        const continuation = game.pendingResponse.resume;
        if (continuation.type !== "card_use") {
          issue("Jizhi/Jilue must resume a card-use frame");
        } else {
          const intent = continuation.intent;
          const borrowed = game.pendingResponse.skillId === "jilue";
          const triggerSkill = borrowed ? "jilue_jizhi" : "jizhi";
          const expectedTriggerId = `${continuation.eventId}:${triggerSkill}:${game.pendingResponse.targetId}:0`;
          const owner = game.players.find((player) => player.id === game.pendingResponse!.targetId);
          const renMarks = owner ? markCount(game.completeRules.lifecycle, {
            ownerId: owner.id,
            markId: "ren",
            sourcePlayerId: owner.id,
            sourceSkillId: "renjie",
          }) : 0;
          if (
            !game.pendingResponse.promptId ||
            !game.pendingResponse.triggerId ||
            game.pendingResponse.triggerId !== expectedTriggerId ||
            game.pendingResponse.promptId !== `skill:${expectedTriggerId}` ||
            game.pendingResponse.iteration !== undefined ||
            continuation.remainingTriggers.length !== 0 ||
            (borrowed
              ? !owner || hasEffectiveSkill(owner, "jizhi") || !hasEffectiveSkill(owner, "jilue") ||
                !hasAwakened(game.completeRules.lifecycle, owner.id, "baiyin") || renMarks < 1 ||
                game.pendingResponse.markCount !== renMarks
              : game.pendingResponse.markCount !== undefined)
          ) {
            issue("Jizhi/Jilue prompt and trigger identifiers disagree");
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
            issue("Jizhi/Jilue card-use continuation is not an ordinary trick declaration");
          }
          validateCardUseContinuation(continuation);
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
      } else if (game.pendingResponse.skillId === "buqu" || game.pendingResponse.skillId === "niepan") {
        if (game.pendingResponse.triggerId !== undefined || game.pendingResponse.iteration !== undefined) {
          issue("Dying skill prompt carries unsupported trigger metadata");
        }
      } else if (game.pendingResponse.promptId !== undefined || game.pendingResponse.triggerId !== undefined) {
        issue("Only event-driven skill choices may persist prompt/trigger identifiers");
      }
    }
    for (const pending of semanticResponseCarriers) {
      if (pending.type !== "standard_skill") continue;
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
        liegong: ["invoke"],
        buqu: ["buqu_recovery"],
        tianxiang: ["tianxiang_redirect"],
        jushou: ["invoke", "jushou_dispose", "jushou_finish"],
        shensu: ["shensu_judgment_draw", "shensu_play"],
        leiji: ["leiji_target"],
        guicai: ["leiji_judgment_retrial"],
        guidao: ["leiji_judgment_retrial"],
        tiandu: ["leiji_judgment_post"],
        mengjin: ["mengjin_discard", "mengjin_finish"],
        jieming: ["jieming_target"],
        shuangxiong: ["shuangxiong_draw"],
        haoshi: ["haoshi_draw", "haoshi_transfer"],
        dimeng: ["dimeng_swap"],
        zaiqi: ["zaiqi_draw", "zaiqi_finish"],
        yinghun: ["yinghun_select", "yinghun_discard", "yinghun_finish"],
        benghuai: ["benghuai_choice"],
        luanwu: ["luanwu_slash"],
        xingshang: ["xingshang_claim"],
        fangzhu: ["fangzhu_target"],
        baonue: ["baonue_invoke"],
        lieren: ["lieren_invoke", "lieren_gain"],
        beige: ["beige_cost", "beige_source_discard"],
        huashen: ["huashen_initial", "huashen_turn_start", "huashen_turn_end"],
        xinsheng: ["xinsheng_invoke"],
        tiaoxin: ["tiaoxin_response", "tiaoxin_discard"],
        xiangle: ["xiangle_payment"],
        jiang: ["jiang_invoke"],
        yingyang: ["yingyang_modify"],
        zhiba: ["zhiba_accept", "zhiba_gain"],
        zhijian: ["zhijian_finish"],
        tuntian: ["tuntian_invoke"],
        zhiji: ["zhiji_choice"],
        fangquan: ["fangquan_skip", "fangquan_finish", "fangquan_complete"],
        qiaobian: ["qiaobian_skip", "qiaobian_after_cost", "qiaobian_draw", "qiaobian_play", "qiaobian_finish"],
        guzheng: ["guzheng_claim"],
        guixin: ["guixin_invoke", "guixin_select"],
        wuhun: ["wuhun_target"],
        qinyin: ["qinyin_choice"],
        lianpo: ["lianpo_choice"],
        wumou: ["wumou_choice"],
        shenfen: ["shenfen_discard_hand", "shenfen_continue"],
        yeyan: ["yeyan_after_cost"],
        shelie: ["shelie_invoke", "shelie_select"],
        gongxin: ["gongxin_choose"],
        qixing: ["qixing_initial", "qixing_exchange"],
        jilue: ["leiji_judgment_retrial", "jilue_wansha", "jilue_fangzhu", "jilue_zhiheng_finish"],
        kuangfeng: ["kuangfeng_choice"],
        dawu: ["dawu_choice"],
      };
      if (!validStages[pending.skillId]?.includes(pending.stage)) {
        issue("Standard skill id/stage combination is invalid");
      }
      const skillStageKey = `${pending.skillId}/${pending.stage}`;
      if (pending.skillId === "yinghun") {
        if (pending.stage === "yinghun_select") {
          const owner = game.players.find((player) => player.id === pending.targetId);
          if (!owner?.alive || game.currentPlayerId !== owner.id || game.turn.playerId !== owner.id ||
              owner.hp >= owner.maxHp || !hasEffectiveSkill(owner, "yinghun") ||
              !game.players.some((player) => player.alive && player.id !== owner.id)) {
            issue("Yinghun selection prompt is inconsistent with its wounded owner");
          }
        } else {
          const owner = game.players.find((player) => player.id === pending.sourceId);
          const target = game.players.find((player) => player.id === pending.targetId);
          const lostHp = owner ? owner.maxHp - owner.hp : 0;
          const expectedCount = pending.mode === "draw_x_discard_one" ? 1
            : pending.mode === "draw_one_discard_x" ? lostHp : 0;
          if (!owner?.alive || !target?.alive || owner.id === target.id ||
              game.currentPlayerId !== owner.id || game.turn.playerId !== owner.id ||
              !hasEffectiveSkill(owner, "yinghun") || lostHp <= 0 ||
              pending.requestedCount !== expectedCount) {
            issue("Yinghun discard continuation is inconsistent with its owner HP and mode");
          }
        }
      }
      const recoveryOwner = pending.recovery
        ? game.players.find((player) => player.id === pending.recovery!.targetId)
        : undefined;
      const buquWoundIds = recoveryOwner?.extraPiles.buqu?.map((card) => card.id) ?? [];
      const expectedPrompt = (() => {
        const standard = (stage: string): string => standardPromptId(
          pending.eventId,
          pending.skillId as StandardImplementedSkillId,
          pending.targetId,
          stage,
        );
        if (pending.damageOpportunity) {
          const base = `damage:${pending.damageOpportunity.promptId}`;
          if (pending.stage === "yiji_distribute") return `${base}:yiji-distribute`;
          if (pending.stage === "fankui_select") return `${base}:fankui-select`;
          if (pending.stage === "ganglie_punish") return `${base}:ganglie-punish`;
          if (skillStageKey === "lieren/lieren_gain") return `${base}:lieren-gain`;
          if (skillStageKey === "beige/beige_source_discard") return `${base}:beige-discard`;
          if (skillStageKey === "guixin/guixin_invoke") return `${base}:guixin-invoke`;
          if (skillStageKey === "guixin/guixin_select") {
            return `${base}:guixin-select:${pending.iteration ?? -1}:${pending.sourceId ?? ""}`;
          }
          return base;
        }
        if (pending.aftermath) {
          if (pending.stage === "yiji_distribute") return standard(`distribute-${pending.aftermath.remainingSkillIds.length}`);
          if (pending.stage === "fankui_select") return standard("select");
          if (pending.stage === "ganglie_punish") return standard("punish");
          return standard(`invoke-${pending.aftermath.remainingSkillIds.length}`);
        }
        if (pending.recovery) {
          return `recovery:${pending.recovery.eventId}:buqu:${pending.recovery.remainingAmount}:${buquWoundIds.length}`;
        }
        if (pending.deathResolution) {
          return standard(`${pending.skillId === "xingshang" ? "death" : "target"}-${pending.deathResolution.frameId}`);
        }
        if (pending.judgment && (pending.stage === "leiji_judgment_retrial" || pending.stage === "leiji_judgment_post")) {
          const retrial = pending.stage === "leiji_judgment_retrial";
          const cursor = retrial ? pending.judgment.retrialCursor : pending.judgment.postJudgmentCursor;
          const opportunity = retrial
            ? pending.judgment.retrialOrder[cursor]
            : pending.judgment.postJudgmentOrder[cursor];
          const answeredRetrialIndex = retrial && pending === game.afterMove.suspendedResponse &&
              pending.judgment.stage === "ready_to_resolve"
            ? suspendedAnsweredRetrialIndex(pending, pending.judgment)
            : null;
          if (answeredRetrialIndex !== null) {
            const answered = pending.judgment.retrialOrder[answeredRetrialIndex]!;
            return `judgment:${pending.judgment.frameId}:retrial:${answered.ownerId}:${answeredRetrialIndex}`;
          }
          return opportunity
            ? `judgment:${pending.judgment.frameId}:${retrial ? "retrial" : "post"}:${opportunity.ownerId}:${cursor}`
            : "";
        }
        switch (skillStageKey) {
          case "guanxing/invoke": return standard("invoke");
          case "guanxing/guanxing_reorder": return standard("reorder");
          case "tuxi/tuxi_select": return standard("select");
          case "liuli/liuli_redirect": return standard("redirect");
          case "tieqi/invoke":
          case "liegong/invoke": return pending.slash ? standard(`target-${pending.slash.targetId}`) : "";
          case "jushou/invoke": return standard("invoke");
          case "jushou/jushou_dispose": return standard("dispose");
          case "jushou/jushou_finish": return standard("finish");
          case "shensu/shensu_judgment_draw": return standard("judgment-draw");
          case "shensu/shensu_play": return standard("play");
          case "leiji/leiji_target": return standard("target");
          case "mengjin/mengjin_discard": return standard("discard");
          case "mengjin/mengjin_finish": return standard("finish");
          case "shuangxiong/shuangxiong_draw": return standard("draw");
          case "haoshi/haoshi_draw": return standard("draw");
          case "haoshi/haoshi_transfer": return standard("transfer");
          case "dimeng/dimeng_swap": return standard("swap");
          case "zaiqi/zaiqi_draw": return standard("draw");
          case "zaiqi/zaiqi_finish": return standard("finish");
          case "yinghun/yinghun_select": return standard("select");
          case "yinghun/yinghun_discard": return standard("discard");
          case "yinghun/yinghun_finish": return standard("finish");
          case "benghuai/benghuai_choice": return standard("choice");
          case "luanwu/luanwu_slash": return standard(`slash-${pending.targetIds?.length ?? -1}`);
          case "huashen/huashen_initial": return standard("initial");
          case "huashen/huashen_turn_start": return standard("huashen_turn_start");
          case "huashen/huashen_turn_end": return standard("huashen_turn_end");
          case "tiaoxin/tiaoxin_response": return standard(`respond-${pending.sourceId ?? ""}`);
          case "tiaoxin/tiaoxin_discard": return standard(`discard-${pending.sourceId ?? ""}`);
          case "xiangle/xiangle_payment": return pending.slash ? standard(`target-${pending.slash.targetId}`) : "";
          case "jiang/jiang_invoke": {
            if (pending.slash) return standard(`slash-${pending.slash.cardId}`);
            if (pending.duel && pending.processedPlayerIds) {
              return `skill:${pending.eventId}:jiang:${pending.targetId}:${pending.processedPlayerIds.length - 1}`;
            }
            const parts = pending.promptId.split(":");
            const index = Number(parts[4]);
            return pending.cardUse && parts.length === 5 && parts[0] === "skill" &&
              parts[1] === String(pending.eventId) && parts[2] === "jiang" && parts[3] === pending.targetId &&
              Number.isSafeInteger(index) && index >= 0
              ? `skill:${pending.eventId}:jiang:${pending.targetId}:${index}`
              : "";
          }
          case "yingyang/yingyang_modify": return pending.processedPlayerIds
            ? `pindian:${pending.eventId}:yingyang:${pending.targetId}:${pending.processedPlayerIds.length - 1}`
            : "";
          case "zhiba/zhiba_accept": return standard(`request-${pending.sourceId ?? ""}`);
          case "zhiba/zhiba_gain": return `pindian:${pending.eventId}:zhiba:gain:${pending.targetId}`;
          case "zhijian/zhijian_finish": return standard(`finish-${pending.sourceId ?? ""}`);
          case "tuntian/tuntian_invoke": return `skill:${pending.eventId}:tuntian:${pending.targetId}:${pending.moveBatchId ?? -1}`;
          case "zhiji/zhiji_choice": return standard("choice");
          case "fangquan/fangquan_skip": return standard("skip");
          case "fangquan/fangquan_finish": return standard("finish");
          case "fangquan/fangquan_complete": return standard("complete");
          case "qiaobian/qiaobian_skip": return standard(pending.phase ?? "");
          case "qiaobian/qiaobian_after_cost": return standard("after-cost");
          case "qiaobian/qiaobian_draw": return standard("draw");
          case "qiaobian/qiaobian_play": return standard("play");
          case "qiaobian/qiaobian_finish": return standard(`finish-${pending.phase ?? ""}`);
          case "guzheng/guzheng_claim": return standard(`claim-${pending.processedPlayerIds?.length ?? -1}`);
          case "qinyin/qinyin_choice": return standard(pending.mode === "all_recover_one" ? "finish-recovery" : "choice");
          case "lianpo/lianpo_choice": return standard(`choice-turn-${game.turn.number}`);
          case "wumou/wumou_choice": return standard("choice");
          case "shenfen/shenfen_discard_hand": return pending.shenfenContinuation
            ? standard(`discard-hand-${pending.shenfenContinuation.nextTargetIndex}`) : "";
          case "shenfen/shenfen_continue": return pending.shenfenContinuation
            ? standard(`continue-${pending.shenfenContinuation.stage}-${pending.shenfenContinuation.nextTargetIndex}`) : "";
          case "yeyan/yeyan_after_cost": return standard("after-cost");
          case "shelie/shelie_invoke": return standard("invoke");
          case "shelie/shelie_select": return standard("select");
          case "gongxin/gongxin_choose": return standard(`choose-${pending.sourceId ?? ""}`);
          case "qixing/qixing_initial": return standard("initial");
          case "qixing/qixing_exchange": return standard("exchange");
          case "jilue/jilue_wansha": return standard("wansha");
          case "jilue/jilue_zhiheng_finish": return standard("zhiheng-finish");
          case "kuangfeng/kuangfeng_choice": return standard("choice");
          case "dawu/dawu_choice": return standard("choice");
          default: return "";
        }
      })();
      if (!expectedPrompt || pending.promptId !== expectedPrompt) issue("Standard skill prompt metadata is inconsistent");
      const legacyDamageKeys = new Set([
        "jianxiong/invoke", "yiji/invoke", "yiji/yiji_distribute", "fankui/invoke",
        "fankui/fankui_select", "ganglie/invoke", "ganglie/ganglie_punish",
      ]);
      const liveDamageKeys = new Set([
        "tianxiang/tianxiang_redirect", "jieming/jieming_target", "fangzhu/fangzhu_target",
        "baonue/baonue_invoke", "lieren/lieren_invoke", "lieren/lieren_gain",
        "beige/beige_cost", "beige/beige_source_discard", "xinsheng/xinsheng_invoke",
        "guixin/guixin_invoke", "guixin/guixin_select", "jilue/jilue_fangzhu",
      ]);
      if (legacyDamageKeys.has(skillStageKey) &&
          (pending.aftermath === undefined) === (pending.damageOpportunity === undefined)) {
        issue("Damage skill prompt requires exactly one damage continuation");
      }
      if (liveDamageKeys.has(skillStageKey) && (!pending.damageOpportunity || pending.aftermath !== undefined)) {
        issue("Live damage skill prompt requires exactly one damage opportunity");
      }
      if (!legacyDamageKeys.has(skillStageKey) && !liveDamageKeys.has(skillStageKey) &&
          (pending.aftermath !== undefined || pending.damageOpportunity !== undefined)) {
        issue("Non-damage skill prompt carries a damage continuation");
      }
      const requiresSlash = new Set([
        "tieqi/invoke", "liuli/liuli_redirect", "liegong/invoke",
        "mengjin/mengjin_discard", "mengjin/mengjin_finish", "xiangle/xiangle_payment",
      ]).has(skillStageKey);
      if (requiresSlash && !pending.slash) issue("Slash skill prompt is missing its target frame");
      if (pending.skillId === "jiang" && pending.stage === "jiang_invoke") {
        const continuationCount = Number(pending.slash !== undefined) + Number(pending.duel !== undefined) +
          Number(pending.cardUse !== undefined);
        if (continuationCount !== 1 || (pending.duel !== undefined) !== (pending.processedPlayerIds !== undefined)) {
          issue("Jiang prompt requires exactly one matching card-use continuation");
        }
        if (pending.cardUse) {
          const continuation = pending.cardUse;
          const intent = continuation.intent;
          const owners = [intent.sourceId, ...intent.targetIds]
            .filter((playerId, index, ids) => ids.indexOf(playerId) === index)
            .map((playerId) => game.players.find((player) => player.id === playerId))
            .filter((player): player is z.infer<typeof gamePlayerSchema> =>
              !!player?.alive && hasEffectiveSkill(player, "jiang"));
          const currentIndex = owners.findIndex((owner) => owner.id === pending.targetId);
          const expectedRemaining = owners.slice(currentIndex + 1).map((owner, index) => ({
            triggerId: `${continuation.eventId}:jiang:${owner.id}:${currentIndex + index + 1}`,
            eventId: continuation.eventId,
            ownerId: owner.id,
            skillId: "jiang",
            targetIndex: currentIndex + index + 1,
            mandatory: false,
          }));
          const remainingMatches = continuation.remainingTriggers.length === expectedRemaining.length &&
            continuation.remainingTriggers.every((trigger, index) => {
              const expected = expectedRemaining[index];
              return !!expected && trigger.triggerId === expected.triggerId && trigger.eventId === expected.eventId &&
                trigger.ownerId === expected.ownerId && trigger.skillId === expected.skillId &&
                trigger.targetIndex === expected.targetIndex && trigger.mandatory === false &&
                trigger.moveBatchId === undefined && trigger.cardIds === undefined;
            });
          if (!validateCardUseContinuation(continuation) || continuation.stage !== "targets_confirmed" ||
              continuation.eventId !== pending.eventId || intent.effectiveKind !== "duel" ||
              intent.targetIds.length !== 1 || currentIndex < 0 || pending.processedPlayerIds !== undefined ||
              pending.promptId !== `skill:${continuation.eventId}:jiang:${pending.targetId}:${currentIndex}` ||
              !remainingMatches) {
            issue("Jiang card-use trigger suffix is inconsistent");
          }
        }
      } else if (!requiresSlash && (pending.slash || pending.duel || pending.cardUse)) {
        issue("Non-card-use skill prompt carries a card-use continuation");
      }
      const requiresPindian = skillStageKey === "yingyang/yingyang_modify" || skillStageKey === "zhiba/zhiba_gain";
      if (requiresPindian !== (pending.pindian !== undefined)) {
        issue("Pindian skill prompt metadata is inconsistent");
      }
      if (pending.skillId === "liegong" && pending.slash) {
        const slash = pending.slash;
        const owner = game.players.find((player) => player.id === pending.targetId);
        const target = game.players.find((player) => player.id === slash.targetId);
        const provenance = slash.useProvenance;
        const weaponRange = owner?.equipment.weapon
          ? getCardDefinition(owner.equipment.weapon.kind).weaponRange ?? 1
          : 1;
        const thresholdMet = !!owner && !!target &&
          (target.hand.length >= owner.hp || target.hand.length <= weaponRange);
        if (
          !owner || !owner.alive || !target || !target.alive ||
          !hasEffectiveSkill(owner, "liegong") ||
          slash.attackerId !== owner.id ||
          slash.liegongChecked !== true ||
          slash.dodgeProhibited ||
          !provenance ||
          provenance.method !== "use" ||
          provenance.phase !== "play" ||
          provenance.turnPlayerId !== owner.id ||
          provenance.turnPlayerId !== game.turn.playerId ||
          !thresholdMet
        ) issue("Liegong prompt is inconsistent with its Slash declaration");
      }
      if (pending.skillId === "tianxiang") {
        const frame = activeDamageFrames.at(-1);
        const owner = game.players.find((player) => player.id === pending.targetId);
        const opportunity = frame?.window?.opportunities[frame.window.cursor];
        if (
          !frame ||
          frame.step !== "redirect" ||
          frame.window?.kind !== "redirect" ||
          frame.window.targetIdAtOpen !== pending.targetId ||
          frame.damage.targetId !== pending.targetId ||
          !owner?.alive ||
          !hasEffectiveSkill(owner, "tianxiang") ||
          !hasTianxiangChoice(frame, owner) ||
          opportunity?.ref.opportunityId !== `${frame.damageId}:redirect:tianxiang:${owner.id}:0` ||
          opportunity.ref.ownerId !== owner.id ||
          opportunity.ref.relation !== "target" ||
          opportunity.ref.cadence !== "once" ||
          opportunity.ref.pointIndex !== null ||
          pending.sourceId !== (frame.damage.sourceId ?? undefined)
        ) issue("Tianxiang prompt is inconsistent with its redirect opportunity");
      }
      if (pending.skillId === "xingshang" || pending.skillId === "wuhun") {
        const death = pending.deathResolution as PendingDeathResolution | undefined;
        const frame = activeDeathFrames.at(-1);
        const victim = frame ? game.players.find((player) => player.id === frame.death.victimId) : undefined;
        if (!death || !frame || !victim || frame.suspendedByFrameId !== null) {
          issue("Death skill prompt has no active DeathStack continuation");
        } else {
          validateDeathResolution(death, frame);
          const ordinaryCompletion = death.completion.type === "dying" || death.completion.type === "direct";
          const nestedWuhunCompletion = death.completion.type === "wuhun";
          if (death.rewards !== true || death.logKind !== "normal" ||
            (ordinaryCompletion && death.checkWinner !== true) ||
            (nestedWuhunCompletion && death.checkWinner !== false) ||
            (!ordinaryCompletion && !nestedWuhunCompletion)) {
            issue("Death skill continuation metadata is inconsistent");
          }
          if (pending.skillId === "xingshang") {
            const owner = game.players.find((player) => player.id === pending.targetId);
            const owners = xingshangOwnerIds(victim.id);
            const ownerIndex = owners.indexOf(pending.targetId);
            const expectedRemaining = ownerIndex < 0 ? [] : owners.slice(ownerIndex + 1);
            const ownedIds = [
              ...victim.hand,
              ...Object.values(victim.equipment),
              ...victim.judgment,
              ...Object.values(victim.extraPiles).flat(),
            ].map((card) => card.id).sort();
            const frozenIds = [...frame.ownedPhysicalCardIds].sort();
            if (frame.stage !== "card_disposition" || pending.sourceId !== victim.id ||
              !owner?.alive || !hasEffectiveSkill(owner, "xingshang") || ownerIndex < 0 ||
              !sameOrderedStrings(death.remainingOwnerIds, expectedRemaining) ||
              !sameOrderedStrings(ownedIds, frozenIds) || pending.targetIds !== undefined) {
              issue("Xingshang prompt disagrees with the active death frame");
            }
          } else {
            const expectedTargets = wuhunTargetIds(victim.id);
            const expectedOwners = xingshangOwnerIds(victim.id);
            if (frame.stage !== "death_triggers" || pending.targetId !== victim.id ||
              pending.sourceId !== victim.id || victim.alive || !hasEffectiveSkill(victim, "wuhun") ||
              death.wuhunResolved !== false || expectedTargets.length < 2 ||
              !sameOrderedStrings(pending.targetIds ?? [], expectedTargets) ||
              !sameOrderedStrings(liveXingshangOwnerIds(death.remainingOwnerIds), expectedOwners)) {
              issue("Wuhun target prompt disagrees with the active death frame");
            }
          }
        }
      }
      if (pending.skillId === "ganglie" && pending.stage === "ganglie_punish") {
        const damageFrame = pending.damageOpportunity ? activeDamageFrames.at(-1) : undefined;
        const ownerId = pending.damageOpportunity?.ownerId ?? pending.aftermath?.targetId;
        const damageSourceId = damageFrame?.damage.sourceId ?? pending.aftermath?.sourceId;
        if (!ownerId || pending.sourceId !== ownerId || pending.targetId !== damageSourceId) {
          issue("Ganglie punishment source metadata is inconsistent");
        }
      } else if (pending.aftermath) {
        const expectedSourceId = pending.aftermath.sourceId ?? undefined;
        if (pending.sourceId !== expectedSourceId) issue("Damage skill source metadata is inconsistent");
        const causalSource = aftermathDamageSourceFromResume(pending.aftermath.resume);
        if (causalSource.known && pending.aftermath.sourceId !== causalSource.sourceId) {
          issue("Damage skill aftermath source disagrees with its causal continuation");
        }
      } else if (pending.damageOpportunity) {
        const damageFrame = activeDamageFrames.at(-1);
        if (!damageFrame) {
          issue("Live damage skill has no active damage frame");
        } else {
          const ownerId = pending.damageOpportunity.ownerId;
          const damageSourceId = damageFrame.damage.sourceId ?? undefined;
          const damageTargetId = damageFrame.damage.targetId;
          if (skillStageKey === "ganglie/ganglie_punish") {
            if (pending.sourceId !== ownerId || pending.targetId !== damageSourceId) {
              issue("Ganglie punishment source metadata is inconsistent");
            }
          } else if (skillStageKey === "beige/beige_source_discard") {
            if (pending.targetId !== damageSourceId || pending.sourceId !== ownerId) {
              issue("Beige discard source metadata is inconsistent");
            }
          } else if (skillStageKey === "baonue/baonue_invoke") {
            const beneficiary = game.players.find((player) => player.id === pending.sourceId);
            const damageSource = game.players.find((player) => player.id === damageSourceId);
            if (pending.targetId !== ownerId || !beneficiary?.alive ||
                damageFrame.damage.sourceId !== ownerId || !hasEffectiveSkill(beneficiary, "baonue") ||
                !damageSource || playerFaction(damageSource) !== "qun" ||
                beneficiary.id !== baonueBeneficiaryId(ownerId)) {
              issue("Baonue beneficiary metadata is inconsistent");
            }
          } else if (skillStageKey === "lieren/lieren_invoke" || skillStageKey === "lieren/lieren_gain") {
            if (pending.targetId !== ownerId || pending.sourceId !== damageTargetId) {
              issue("Lieren target metadata is inconsistent");
            }
          } else if (skillStageKey === "fangzhu/fangzhu_target" || skillStageKey === "jilue/jilue_fangzhu" ||
              skillStageKey === "guixin/guixin_invoke") {
            if (pending.targetId !== ownerId || pending.sourceId !== undefined) {
              issue("Live damage target metadata is inconsistent");
            }
          } else if (skillStageKey === "guixin/guixin_select") {
            const selected = game.players.find((player) => player.id === pending.sourceId);
            if (pending.targetId !== ownerId || !selected?.alive || selected.id === ownerId) {
              issue("Guixin selection metadata is inconsistent");
            }
          } else if (pending.targetId !== ownerId || pending.sourceId !== damageSourceId) {
            issue("Live damage skill source metadata is inconsistent");
          }
        }
      } else if (pending.recovery) {
        if (
          pending.skillId !== "buqu" ||
          pending.stage !== "buqu_recovery" ||
          pending.targetId !== pending.recovery.targetId ||
          pending.eventId !== pending.recovery.eventId
        ) issue("Buqu recovery prompt metadata is inconsistent");
      } else if (pending.deathResolution) {
        if (pending.skillId !== "xingshang" && pending.skillId !== "wuhun") {
          issue("Non-death skill prompt carries a death continuation");
        }
      } else {
        const requiresSource = new Set([
          "yinghun/yinghun_discard", "yinghun/yinghun_finish", "luanwu/luanwu_slash",
          "tiaoxin/tiaoxin_response", "tiaoxin/tiaoxin_discard", "zhiba/zhiba_accept",
          "zhijian/zhijian_finish", "guzheng/guzheng_claim", "lianpo/lianpo_choice",
          "gongxin/gongxin_choose",
        ]).has(skillStageKey);
        if (requiresSource !== (pending.sourceId !== undefined)) {
          issue("Standard skill source metadata is inconsistent");
        }
      }
      if ((pending.skillId === "buqu") !== (pending.recovery !== undefined)) {
        issue("Standard skill recovery metadata is inconsistent");
      }
      if ((pending.skillId === "xingshang" || pending.skillId === "wuhun") !==
        (pending.deathResolution !== undefined)) {
        issue("Standard skill death metadata is inconsistent");
      }
      const validateCarrierField = (
        field: keyof typeof pending,
        requiredKeys: readonly string[],
        optionalKeys: readonly string[] = [],
      ): void => {
        const present = pending[field] !== undefined;
        const required = requiredKeys.includes(skillStageKey);
        if ((!present && required) || (present && !required && !optionalKeys.includes(skillStageKey))) {
          issue(`Standard skill ${String(field)} metadata is inconsistent`);
        }
      };
      validateCarrierField("selectedCardIds", [
        "guanxing/guanxing_reorder", "yiji/yiji_distribute", "buqu/buqu_recovery",
        "zaiqi/zaiqi_finish", "beige/beige_source_discard", "zhijian/zhijian_finish",
        "tuntian/tuntian_invoke", "fangquan/fangquan_finish", "qiaobian/qiaobian_after_cost",
        "qiaobian/qiaobian_play", "guzheng/guzheng_claim", "qinyin/qinyin_choice",
        "shelie/shelie_select", "gongxin/gongxin_choose", "jilue/jilue_zhiheng_finish",
      ]);
      validateCarrierField("handCardIds", [
        "shenfen/shenfen_discard_hand", "qixing/qixing_initial", "qixing/qixing_exchange",
      ]);
      validateCarrierField("starCardIds", [
        "qixing/qixing_initial", "qixing/qixing_exchange", "kuangfeng/kuangfeng_choice", "dawu/dawu_choice",
      ]);
      validateCarrierField("targetIds", [
        "dimeng/dimeng_swap", "luanwu/luanwu_slash", "fangquan/fangquan_finish",
        "qiaobian/qiaobian_draw", "qiaobian/qiaobian_play", "guzheng/guzheng_claim",
        "guixin/guixin_invoke", "guixin/guixin_select", "wuhun/wuhun_target",
        "qinyin/qinyin_choice", "lianpo/lianpo_choice", "kuangfeng/kuangfeng_choice", "dawu/dawu_choice",
      ]);
      validateCarrierField("processedPlayerIds", [
        "luanwu/luanwu_slash", "guzheng/guzheng_claim", "lianpo/lianpo_choice", "yingyang/yingyang_modify",
      ], ["jiang/jiang_invoke", "tiaoxin/tiaoxin_response", "tiaoxin/tiaoxin_discard"]);
      validateCarrierField("targetHandCardIds", ["dimeng/dimeng_swap"]);
      validateCarrierField("requestedCount", [
        "yinghun/yinghun_discard", "yinghun/yinghun_finish", "jilue/jilue_wansha", "jilue/jilue_zhiheng_finish",
      ]);
      validateCarrierField("mode", ["yinghun/yinghun_discard", "yinghun/yinghun_finish"], ["qinyin/qinyin_choice"]);
      validateCarrierField("phase", [
        "qiaobian/qiaobian_skip", "qiaobian/qiaobian_after_cost", "qiaobian/qiaobian_draw",
        "qiaobian/qiaobian_play", "qiaobian/qiaobian_finish",
      ]);
      validateCarrierField("moveBatchId", ["tuntian/tuntian_invoke"]);
      validateCarrierField("iteration", [
        "guixin/guixin_invoke", "guixin/guixin_select", "jilue/jilue_zhiheng_finish",
      ], ["qinyin/qinyin_choice"]);
      validateCarrierField("leijiDodge", ["leiji/leiji_target", "guicai/leiji_judgment_retrial",
        "guidao/leiji_judgment_retrial", "jilue/leiji_judgment_retrial", "tiandu/leiji_judgment_post"]);
      validateCarrierField("judgment", ["guicai/leiji_judgment_retrial", "guidao/leiji_judgment_retrial",
        "jilue/leiji_judgment_retrial", "tiandu/leiji_judgment_post"]);
      validateCarrierField("tianduClaimed", ["guicai/leiji_judgment_retrial", "guidao/leiji_judgment_retrial",
        "jilue/leiji_judgment_retrial", "tiandu/leiji_judgment_post"]);
      validateCarrierField("wumouContinuation", ["wumou/wumou_choice"]);
      validateCarrierField("shenfenContinuation", ["shenfen/shenfen_discard_hand", "shenfen/shenfen_continue"]);
      validateCarrierField("yeyanContinuation", ["yeyan/yeyan_after_cost"]);

      if (skillStageKey === "wumou/wumou_choice" && pending.wumouContinuation) {
        const owner = game.players.find((player) => player.id === pending.targetId);
        if (!owner?.alive || !hasEffectiveSkill(owner, "wumou")) {
          issue("Wumou choice prompt owner is inconsistent");
        }
        validateWumouContinuation(pending.targetId, pending.eventId, pending.wumouContinuation);
      }
      if (pending.shenfenContinuation) {
        const continuation = pending.shenfenContinuation;
        validateShenfenContinuation(continuation);
        if (pending.eventId !== continuation.eventId) {
          issue("Shenfen prompt event is inconsistent");
        }
        if (pending.stage === "shenfen_discard_hand") {
          const targetId = continuation.targetIds[continuation.nextTargetIndex];
          const target = game.players.find((player) => player.id === targetId);
          if (continuation.stage !== "hand" || continuation.nextTargetIndex >= continuation.targetIds.length ||
              pending.targetId !== targetId || !target?.alive || target.hand.length <= 4 ||
              !pending.handCardIds || !sameOrderedStrings(pending.handCardIds, target.hand.map((card) => card.id))) {
            issue("Shenfen hand-discard prompt cursor is inconsistent");
          }
        } else if (pending.targetId !== continuation.ownerId ||
          (continuation.stage !== "equipment" && continuation.stage !== "hand")) {
          issue("Shenfen after-move continuation cursor is inconsistent");
        }
      }
      if (pending.yeyanContinuation) {
        const continuation = pending.yeyanContinuation;
        validateYeyanContinuation(continuation);
        if (pending.targetId !== continuation.ownerId || pending.eventId !== continuation.eventId ||
            continuation.stage !== "after_cost" || continuation.nextAllocationIndex !== 0) {
          issue("Yeyan after-cost prompt cursor is inconsistent");
        }
      }

      const cardIdGroups = [pending.selectedCardIds, pending.handCardIds, pending.starCardIds,
        ...(pending.targetHandCardIds ?? [])].filter((ids): ids is string[] => ids !== undefined);
      if (cardIdGroups.some((ids) => new Set(ids).size !== ids.length || ids.some((id) => !physicalCardIds.has(id)))) {
        issue("Standard skill frozen cards are duplicated or missing from the live zones");
      }
      if ([pending.targetIds, pending.processedPlayerIds].some((ids) => ids && new Set(ids).size !== ids.length)) {
        issue("Standard skill frozen player order contains duplicates");
      }
      if (skillStageKey === "qinyin/qinyin_choice") {
        const recoveryBarrier = pending.mode !== undefined || pending.iteration !== undefined;
        if (recoveryBarrier && (pending.mode !== "all_recover_one" || pending.iteration !== pending.targetIds?.length)) {
          issue("Qinyin recovery barrier metadata is inconsistent");
        }
      }
      if (pending.leijiDodge) {
        const dodge = pending.leijiDodge;
        const owner = game.players.find((player) => player.id === dodge.attributedPlayerId);
        const physicalIds = dodge.provenance.type === "physical"
          ? [dodge.provenance.cardId]
          : dodge.provenance.physicalCardIds;
        const physicalCards = physicalIds.map((cardId) =>
          (game.resolvingCards ?? []).find((card) => card.id === cardId));
        const effectiveSuit = (player: z.infer<typeof gamePlayerSchema>, card: z.infer<typeof cardSchema>): string | null => {
          if (!card.suit) return null;
          const resolved = resolveHongyanSuit({
            printedSuit: card.suit,
            cardOwnerId: player.id,
            hongyan: { ownerId: player.id, active: hasEffectiveSkill(player, "hongyan") },
          });
          return resolved.ok ? resolved.value.effectiveSuit : null;
        };
        const wushenLocks = (player: z.infer<typeof gamePlayerSchema>, card: z.infer<typeof cardSchema>): boolean =>
          hasEffectiveSkill(player, "wushen") && effectiveSuit(player, card) === "heart";
        const armorDodge = dodge.provenance.type === "view_as" &&
          (dodge.provenance.skillId === "ba_gua_zhen" || dodge.provenance.skillId === "bazhen");
        const supportedViewAs = dodge.provenance.type !== "view_as" || [
          "ba_gua_zhen", "bazhen", "guhuo", "hujia", "longdan", "longhun", "qingguo",
        ].includes(dodge.provenance.skillId);
        const viewAsCountValid = dodge.provenance.type !== "view_as" ||
          (armorDodge
            ? physicalIds.length === 0
            : dodge.provenance.skillId === "longhun"
              ? physicalIds.length >= 1
              : physicalIds.length === 1);
        let physicalProvenanceValid = true;
        if (dodge.provenance.type === "physical") {
          const physicalCardId = dodge.provenance.cardId;
          const physicalCard = (game.resolvingCards ?? []).filter((card) => card.id === physicalCardId);
          physicalProvenanceValid = dodge.provenance.printedKind === "dodge" &&
            physicalCard.length === 1 && physicalCard[0]?.kind === "dodge" &&
            !!owner && !wushenLocks(owner, physicalCard[0]);
        }
        let viewAsSemanticsValid = true;
        if (dodge.provenance.type === "view_as") {
          const [physical] = physicalCards;
          switch (dodge.provenance.skillId) {
            case "ba_gua_zhen":
              viewAsSemanticsValid = dodge.resume.pending.armorAttempted !== true &&
                (dodge.resume.pending.type !== "slash" ||
                  (dodge.resume.pending.armorIgnored !== true && dodge.resume.pending.dodgeProhibited !== true)) &&
                (pending.stage !== "leiji_target" || owner?.equipment.armor?.kind === "ba_gua_zhen");
              break;
            case "bazhen":
              viewAsSemanticsValid = dodge.resume.pending.armorAttempted !== true &&
                (dodge.resume.pending.type !== "slash" ||
                  (dodge.resume.pending.armorIgnored !== true && dodge.resume.pending.dodgeProhibited !== true)) &&
                !!owner && hasEffectiveSkill(owner, "bazhen") &&
                (pending.stage !== "leiji_target" || owner.equipment.armor === undefined);
              break;
            case "hujia": {
              const providers = game.players.filter((player) =>
                player.alive && player.id !== owner?.id && playerFaction(player) === "wei" &&
                !!physical && !wushenLocks(player, physical));
              viewAsSemanticsValid = !!owner && hasEffectiveSkill(owner, "hujia") &&
                physical?.kind === "dodge" && providers.length > 0;
              break;
            }
            case "longdan":
              viewAsSemanticsValid = !!owner && hasEffectiveSkill(owner, "longdan") &&
                !!physical && isSlashCardKind(physical.kind);
              break;
            case "qingguo": {
              const suit = owner && physical ? effectiveSuit(owner, physical) : null;
              viewAsSemanticsValid = !!owner && hasEffectiveSkill(owner, "qingguo") &&
                (suit === "spade" || suit === "club");
              break;
            }
            case "guhuo":
              viewAsSemanticsValid = !!owner && hasEffectiveSkill(owner, "guhuo") && !!physical;
              break;
            case "longhun":
              viewAsSemanticsValid = !!owner && hasEffectiveSkill(owner, "longhun") &&
                physicalCards.length === Math.max(owner.hp, 1) &&
                physicalCards.every((card) => !!card && effectiveSuit(owner, card) === "club");
              break;
          }
        }
        const attackCardIds = dodge.resume.pending.damageCardIds ?? [dodge.resume.pending.cardId];
        const armorInvalidated = game.completeRules.lifecycle.effects.some((effect) =>
          effect.ownerId === dodge.attributedPlayerId && effect.kind === "armor_invalid" &&
          effect.sourceSkillId === "wuqian" && effect.sourcePlayerId !== null &&
          effect.payload.targetId === dodge.attributedPlayerId && effect.payload.turnId === game.turn.number &&
          effect.expiry.type === "turn_end" && effect.expiry.turnId === game.turn.number);
        let resumeValid: boolean;
        if (dodge.resume.type === "slash") {
          const slash = dodge.resume.pending;
          resumeValid = slash.targetId === dodge.attributedPlayerId && (slash.dodgesPlayed ?? 0) >= 1 &&
            (slash.dodgesPlayed ?? 0) <= (slash.requiredDodgeCount ?? 1);
        } else {
          const massAttack = dodge.resume.pending;
          resumeValid = massAttack.targetId === dodge.attributedPlayerId &&
            massAttack.cardKind === "arrow_barrage" && massAttack.responseKind === "dodge";
        }
        if (!owner?.alive || !hasEffectiveSkill(owner, "leiji") ||
            dodge.dodgeEventId !== `dodge:${pending.eventId}:${dodge.attributedPlayerId}` ||
            dodge.method !== "respond" || !supportedViewAs || !viewAsCountValid ||
            !physicalProvenanceValid || !viewAsSemanticsValid || !resumeValid ||
            new Set(physicalIds).size !== physicalIds.length ||
            physicalIds.some((cardId) => game.virtualCardOrigins[cardId] !== undefined || attackCardIds.includes(cardId)) ||
            (armorDodge && armorInvalidated) ||
            physicalIds.some((cardId) =>
              (game.resolvingCards ?? []).filter((card) => card.id === cardId).length !== 1)) {
          issue("Leiji Dodge provenance is inconsistent");
        }
        if (pending.stage === "leiji_target") {
          if (pending.targetId !== dodge.attributedPlayerId || pending.judgment !== undefined || pending.tianduClaimed !== undefined) {
            issue("Leiji target prompt metadata is inconsistent");
          }
        } else if (pending.judgment) {
          const frame = pending.judgment;
          const currentRetrial = frame.stage === "retrial_window" ? frame.retrialOrder[frame.retrialCursor] : undefined;
          const currentPost = frame.stage === "post_judgment_window" ? frame.postJudgmentOrder[frame.postJudgmentCursor] : undefined;
          const currentRetrialOwner = currentRetrial
            ? game.players.find((player) => player.id === currentRetrial.ownerId)
            : undefined;
          const currentPostOwner = currentPost
            ? game.players.find((player) => player.id === currentPost.ownerId)
            : undefined;
          const pausedReadyToResolve = pending === game.afterMove.suspendedResponse &&
            frame.stage === "ready_to_resolve" && suspendedAnsweredRetrialIndex(pending, frame) !== null;
          if (pending.tianduClaimed !== false || frame.reason.type !== "skill" || frame.reason.id !== "leiji" ||
              frame.pattern.suits?.length !== 1 || frame.pattern.suits[0] !== "spade" ||
              frame.pattern.color !== undefined || frame.pattern.minimumRank !== undefined ||
              frame.pattern.maximumRank !== undefined || frame.pattern.negate !== undefined ||
              frame.frameId >= game.nextEventId || !judgmentOrdersMatch(frame) ||
              (currentRetrial && (pending.skillId !== currentRetrial.skillId || pending.targetId !== currentRetrial.ownerId ||
                !currentRetrialOwner || !judgmentRetrialSkillEffective(currentRetrial.ownerId, currentRetrial.skillId) ||
                !hasJudgmentRetrialCard(currentRetrial.ownerId, currentRetrial.skillId))) ||
              (currentPost && (pending.skillId !== "tiandu" || pending.targetId !== currentPost.ownerId ||
                !currentPostOwner || !hasEffectiveSkill(currentPostOwner, "tiandu"))) ||
              (!currentRetrial && !currentPost && !pausedReadyToResolve)) {
            issue("Leiji judgment metadata is inconsistent");
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
            issue("Leiji judgment frame failed strict physical validation");
          }
        }
      }
      if (pending.pindian) {
        const pindian = pending.pindian;
        const participants = [pindian.frame.initiatorId, pindian.frame.targetId];
        if (pindian.eventId !== pending.eventId ||
            (skillStageKey === "yingyang/yingyang_modify" && (
              pindian.frame.stage !== "modifying" || !pending.processedPlayerIds ||
              pending.processedPlayerIds.some((playerId, index) => playerId !== participants[index]) ||
              pending.processedPlayerIds.at(-1) !== pending.targetId
            )) ||
            (skillStageKey === "zhiba/zhiba_gain" && (
              pindian.skillId !== "zhiba" || pindian.continuation.type !== "zhiba" ||
              pindian.frame.stage !== "compared" || pindian.frame.result === null ||
              pending.targetId !== pindian.frame.targetId
            ))) {
          issue("Standard skill Pindian continuation is inconsistent");
        }
        try {
          assertPindianFrame({
            deck: game.deck as any,
            discard: game.discardPile as any,
            processing: { [String(pindian.frame.frameId)]: (game.resolvingCards ?? []) as any },
            players: game.players.map((player) => ({
              id: player.id,
              hand: player.hand as any,
              equipment: player.equipment as any,
              judgment: player.judgment as any,
              extraPiles: player.extraPiles as any,
            })),
          }, pindian.frame as any);
        } catch {
          issue("Standard skill Pindian frame failed strict physical validation");
        }
      }
      const owner = game.players.find((player) => player.id === pending.targetId);
      if ((pending.skillId === "qixing" && (!owner ||
          !sameOrderedStrings(pending.handCardIds ?? [], owner.hand.map((card) => card.id)) ||
          !sameOrderedStrings(pending.starCardIds ?? [], (owner.extraPiles.stars ?? []).map((card) => card.id)))) ||
          (pending.skillId === "shenfen" && pending.stage === "shenfen_discard_hand" &&
            (!owner || !sameOrderedStrings(pending.handCardIds ?? [], owner.hand.map((card) => card.id))))) {
        issue("Standard skill private hand/pile snapshot is stale");
      }
      if (skillStageKey === "dimeng/dimeng_swap") {
        const targets = pending.targetIds ?? [];
        const hands = pending.targetHandCardIds;
        const targetPlayers = targets.map((playerId) => game.players.find((player) => player.id === playerId));
        if (targets.length !== 2 || !hands || targetPlayers.some((player) => !player?.alive) ||
            targetPlayers.some((player, index) => !sameOrderedStrings(
              hands[index] ?? [], player?.hand.map((card) => card.id) ?? []))) {
          issue("Dimeng frozen hand snapshots are inconsistent");
        }
      }
      if (skillStageKey === "gongxin/gongxin_choose") {
        const victim = game.players.find((player) => player.id === pending.sourceId);
        if (!victim?.alive || !sameOrderedStrings(pending.selectedCardIds ?? [], victim.hand.map((card) => card.id))) {
          issue("Gongxin frozen hand snapshot is inconsistent");
        }
      }
      if (skillStageKey === "fangquan/fangquan_finish" &&
          (!owner || !sameOrderedStrings(pending.selectedCardIds ?? [], owner.hand.map((card) => card.id)))) {
        issue("Fangquan frozen hand snapshot is inconsistent");
      }
      if (skillStageKey === "beige/beige_source_discard") {
        const source = game.players.find((player) => player.id === pending.targetId);
        const ownedIds = source ? [...source.hand, ...Object.values(source.equipment)].map((card) => card.id) : [];
        if (!source?.alive || ownedIds.length === 0 || !sameOrderedStrings(
          [...(pending.selectedCardIds ?? [])].sort(), [...ownedIds].sort())) {
          issue("Beige frozen source cards are inconsistent");
        }
      }
      if (pending.skillId === "guanxing" && pending.stage === "guanxing_reorder") {
        const selected = pending.selectedCardIds ?? [];
        const top = game.deck.slice(-selected.length).reverse().map((card) => card.id);
        if (selected.length === 0 || selected.length > 5 || new Set(selected).size !== selected.length || [...selected].sort().some((id, index) => id !== [...top].sort()[index])) {
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
      if (pending.skillId === "buqu" && pending.stage === "buqu_recovery") {
        const selected = pending.selectedCardIds ?? [];
        if (
          !recoveryOwner ||
          selected.length === 0 ||
          new Set(selected).size !== selected.length ||
          !sameOrderedStrings(selected, buquWoundIds)
        ) issue("Buqu recovery cards are not exactly the current wound pile");
      }
    }
    for (const pending of semanticResponseCarriers) {
      if (pending.type !== "standard_judgment") continue;
      const frame = pending.frame;
      if (pending.context.type === "ganglie" &&
        (pending.context.aftermath === undefined) === (pending.context.damageOpportunity === undefined)
      ) issue("Ganglie judgment requires exactly one continuation");
      const retrial = frame.stage === "retrial_window" ? frame.retrialOrder[frame.retrialCursor] : undefined;
      const post = frame.stage === "post_judgment_window" ? frame.postJudgmentOrder[frame.postJudgmentCursor] : undefined;
      const processedSongweiIds = pending.songweiProcessedOwnerIds ?? [];
      const judgedForSongwei = game.players.find((player) => player.id === frame.targetId);
      const songweiOwners = frame.stage === "ready_to_settle" && frame.result === true &&
          frame.effectiveCard && (frame.effectiveCard.effectiveSuit === "spade" || frame.effectiveCard.effectiveSuit === "club") &&
          judgedForSongwei?.alive && playerFaction(judgedForSongwei) === "wei"
        ? judgmentOrder.filter((player) => player.id !== judgedForSongwei.id && hasEffectiveSkill(player, "songwei"))
        : [];
      const songweiPrefixValid = processedSongweiIds.length <= songweiOwners.length &&
        processedSongweiIds.every((ownerId, index) => ownerId === songweiOwners[index]?.id);
      const songweiOwner = songweiPrefixValid ? songweiOwners[processedSongweiIds.length] : undefined;
      const expectedPrompt = retrial
        ? `judgment:${frame.frameId}:retrial:${retrial.ownerId}:${frame.retrialCursor}`
        : post
          ? `judgment:${frame.frameId}:post:${post.ownerId}:${frame.postJudgmentCursor}`
          : songweiOwner
            ? `judgment:${frame.frameId}:songwei:${songweiOwner.id}:${processedSongweiIds.length}`
            : "";
      const expectedTargetId = retrial?.ownerId ?? post?.ownerId ?? (songweiOwner ? frame.targetId : undefined);
      const answeredRetrialIndex = pending === game.afterMove.suspendedResponse && frame.stage === "ready_to_resolve"
        ? suspendedAnsweredRetrialIndex(pending, frame)
        : null;
      const suspendedReadyToResolve = pending === game.afterMove.suspendedResponse &&
        frame.stage === "ready_to_resolve" && answeredRetrialIndex !== null;
      if (!songweiPrefixValid || new Set(processedSongweiIds).size !== processedSongweiIds.length ||
          (!suspendedReadyToResolve &&
            (!expectedPrompt || pending.promptId !== expectedPrompt || pending.targetId !== expectedTargetId))) {
        issue("Standard judgment prompt cursor is inconsistent");
      }
      if (frame.frameId >= game.nextEventId || frame.stage === "awaiting_reveal" || frame.stage === "settled") {
        issue("Standard judgment frame stage/id is invalid for a pending prompt");
      }
      const retrialOwner = retrial ? game.players.find((player) => player.id === retrial.ownerId) : undefined;
      const postOwner = post ? game.players.find((player) => player.id === post.ownerId) : undefined;
      const tianduConsumed = frame.postJudgmentOrder.some((opportunity, index) =>
        index < frame.postJudgmentCursor && opportunity.ownerId === frame.targetId && opportunity.skillId === "tiandu");
      if (!judgmentOrdersMatch(frame) ||
          (retrial && (!retrialOwner || !judgmentRetrialSkillEffective(retrial.ownerId, retrial.skillId) ||
            !hasJudgmentRetrialCard(retrial.ownerId, retrial.skillId))) ||
          (post && (post.skillId !== "tiandu" || post.ownerId !== frame.targetId || !postOwner ||
            !hasEffectiveSkill(postOwner, "tiandu"))) ||
          ((retrial || post || frame.stage === "ready_to_resolve") && pending.tianduClaimed) ||
          (pending.tianduClaimed && !tianduConsumed)) {
        issue("Standard judgment opportunity order is inconsistent");
      }
      const emptyPattern = frame.pattern.suits === undefined && frame.pattern.color === undefined &&
        frame.pattern.minimumRank === undefined && frame.pattern.maximumRank === undefined &&
        frame.pattern.negate === undefined;
      const contextMatchesFrame = (() => {
        const context = pending.context;
        switch (context.type) {
          case "delayed_trick":
            return frame.reason.type === "delayed_trick" && frame.reason.id === context.delayedCard.kind &&
              frame.targetId === context.playerId &&
              ["le_bu_si_shu", "bing_liang_cun_duan", "shan_dian"].includes(context.delayedCard.kind);
          case "luoshen":
            return frame.reason.type === "skill" && frame.reason.id === "luoshen" && frame.targetId === context.playerId;
          case "shuangxiong": {
            const owner = game.players.find((player) => player.id === context.playerId);
            return frame.reason.type === "skill" && frame.reason.id === "shuangxiong" &&
              frame.targetId === context.playerId && context.playerId === game.currentPlayerId &&
              context.playerId === game.turn.playerId && emptyPattern && !!owner?.alive && hasEffectiveSkill(owner, "shuangxiong");
          }
          case "tuntian": {
            const owner = game.players.find((player) => player.id === context.ownerId);
            return frame.reason.type === "skill" && frame.reason.id === "tuntian" &&
              frame.targetId === context.ownerId && emptyPattern && context.moveBatchId < game.completeRules.nextMoveBatchId &&
              context.ownerId !== game.currentPlayerId && pending !== game.afterMove.suspendedResponse &&
              !!owner?.alive && hasEffectiveSkill(owner, "tuntian") && game.afterMove.suspendedPhase !== null;
          }
          case "ganglie":
            return frame.reason.type === "skill" && frame.reason.id === "ganglie" &&
              frame.targetId === (context.damageOpportunity?.ownerId ?? context.aftermath?.targetId);
          case "baonue": {
            const owner = game.players.find((player) => player.id === context.ownerId);
            const source = game.players.find((player) => player.id === frame.targetId);
            return frame.reason.type === "skill" && frame.reason.id === "baonue" &&
              frame.targetId === context.damageOpportunity.ownerId && frame.pattern.suits?.length === 1 &&
              frame.pattern.suits[0] === "spade" && frame.pattern.color === undefined &&
              frame.pattern.minimumRank === undefined && frame.pattern.maximumRank === undefined &&
              frame.pattern.negate === undefined && !!owner?.alive && !!source?.alive &&
              hasEffectiveSkill(owner, "baonue") && owner.id === baonueBeneficiaryId(source.id);
          }
          case "beige": {
            const owner = game.players.find((player) => player.id === context.ownerId);
            const damageFrame = activeDamageFrames.find((candidate) =>
              candidate.frameId === context.damageOpportunity.frameId);
            const victim = damageFrame
              ? game.players.find((player) => player.id === damageFrame.damage.targetId)
              : undefined;
            const costCards = allCards.filter((card) => card.id === context.costCard.id);
            const cost = costCards[0];
            const costMatches = costCards.length === 1 && !!cost && cost.kind === context.costCard.kind &&
              cost.name === context.costCard.name && cost.category === context.costCard.category &&
              cost.suit === context.costCard.suit && cost.rank === context.costCard.rank;
            return frame.reason.type === "skill" && frame.reason.id === "beige" && emptyPattern &&
              !!owner?.alive && hasEffectiveSkill(owner, "beige") && context.damageOpportunity.ownerId === owner.id &&
              !!victim?.alive && frame.targetId === victim.id && costMatches &&
              (context.costZone !== "equipment" || getCardDefinition(context.costCard.kind).category === "equipment");
          }
          case "wuhun":
            return frame.reason.type === "skill" && frame.reason.id === "wuhun";
          case "tieqi":
            return frame.reason.type === "skill" && frame.reason.id === "tieqi" && frame.targetId === context.slash.attackerId;
          case "armor": {
            const sourceSkillId = context.sourceSkillId ?? "ba_gua_zhen";
            const target = game.players.find((player) => player.id === context.pending.targetId);
            const armorInvalidated = game.completeRules.lifecycle.effects.some((effect) =>
              effect.ownerId === context.pending.targetId && effect.kind === "armor_invalid" &&
              effect.sourceSkillId === "wuqian" && effect.sourcePlayerId !== null &&
              effect.payload.targetId === context.pending.targetId && effect.payload.turnId === game.turn.number &&
              effect.expiry.type === "turn_end" && effect.expiry.turnId === game.turn.number);
            const paidBaguaAsGuidao = frame.replacements.some((replacement) => {
              if (replacement.actorId !== context.pending.targetId || replacement.skillId !== "guidao") return false;
              return replacement.replacementFrom?.kind === "equipment" &&
                replacement.replacementFrom.playerId === context.pending.targetId &&
                replacement.replacementFrom.slot === "armor" &&
                allCards.some((card) => card.id === replacement.newCardId && card.kind === "ba_gua_zhen");
            });
            const sourceAvailable = sourceSkillId === "bazhen"
              ? !!target && hasEffectiveSkill(target, "bazhen") && target.equipment.armor === undefined
              : target?.equipment.armor?.kind === "ba_gua_zhen" || paidBaguaAsGuidao;
            const responseEligible = context.pending.type === "mass_attack"
              ? context.pending.responseKind === "dodge"
              : context.pending.armorIgnored !== true && context.pending.dodgeProhibited !== true &&
                context.pending.dodgesPlayed < context.pending.requiredDodgeCount;
            return frame.reason.type === (sourceSkillId === "bazhen" ? "skill" : "armor") &&
              frame.reason.id === sourceSkillId && frame.targetId === context.pending.targetId &&
              frame.pattern.color === "red" && frame.pattern.suits === undefined &&
              frame.pattern.minimumRank === undefined && frame.pattern.maximumRank === undefined &&
              frame.pattern.negate === undefined && !!target?.alive && context.pending.armorAttempted !== true &&
              !armorInvalidated && sourceAvailable && responseEligible;
          }
        }
      })();
      if (!contextMatchesFrame) issue("Standard judgment context does not match its frame reason/target");
      if (pending.context.type === "ganglie" && pending.context.aftermath) {
        const causalSource = aftermathDamageSourceFromResume(pending.context.aftermath.resume);
        if (causalSource.known && pending.context.aftermath.sourceId !== causalSource.sourceId) {
          issue("Ganglie aftermath source disagrees with its causal continuation");
        }
      }
      if (pending.context.type === "wuhun") {
        const death = pending.context.deathResolution as PendingDeathResolution;
        const deathFrame = activeDeathFrames.at(-1);
        const victim = deathFrame
          ? game.players.find((player) => player.id === deathFrame.death.victimId)
          : undefined;
        if (!deathFrame || !victim || deathFrame.stage !== "death_triggers" ||
          deathFrame.suspendedByFrameId !== null || pending.context.ownerId !== victim.id || victim.alive ||
          !hasEffectiveSkill(victim, "wuhun") || death.wuhunResolved !== true ||
          !wuhunTargetIds(victim.id).includes(frame.targetId) ||
          !sameOrderedStrings(
            liveXingshangOwnerIds(death.remainingOwnerIds),
            xingshangOwnerIds(victim.id),
          )) {
          issue("Wuhun judgment disagrees with the active death frame");
        } else {
          validateDeathResolution(death, deathFrame);
        }
      }
      const judged = game.players.find((player) => player.id === frame.targetId);
      const hongyanModifiers = frame.suitModifiers.filter((modifier) =>
        modifier.skillId === "hongyan" || modifier.modifierId.startsWith("hongyan:"));
      const expectedHongyanModifier = judged && hasEffectiveSkill(judged, "hongyan")
        ? {
            modifierId: `hongyan:${frame.frameId}:${judged.id}`,
            sourcePlayerId: judged.id,
            skillId: "hongyan",
            fromSuit: "spade",
            toSuit: "heart",
          } as const
        : null;
      if (
        frame.suitModifiers.some((modifier) =>
          modifier.sourcePlayerId !== null && !knownPlayers.has(modifier.sourcePlayerId)) ||
        (expectedHongyanModifier === null
          ? hongyanModifiers.length !== 0
          : hongyanModifiers.length !== 1 ||
            Object.entries(expectedHongyanModifier).some(([key, value]) =>
              hongyanModifiers[0]?.[key as keyof typeof expectedHongyanModifier] !== value))
      ) issue("Hongyan judgment modifier disagrees with its effective skill owner");
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

function sameRoomRuleConfig(left: RoomRuleConfig, right: RoomRuleConfig): boolean {
  return left.ruleSetVersion === right.ruleSetVersion &&
    left.enabledGeneralPacks.length === right.enabledGeneralPacks.length &&
    left.enabledGeneralPacks.every((pack) => right.enabledGeneralPacks.includes(pack)) &&
    left.generalSelection.mode === right.generalSelection.mode &&
    left.generalSelection.candidatesPerPlayer === right.generalSelection.candidatesPerPlayer &&
    left.generalSelection.allowDuplicateGenerals === right.generalSelection.allowDuplicateGenerals &&
    left.deckProfile === right.deckProfile &&
    left.maximumReshuffles === right.maximumReshuffles &&
    left.lordBonusMinimumPlayers === right.lordBonusMinimumPlayers &&
    left.godFactionChoice === right.godFactionChoice;
}

const roomSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(40),
  ownerId: playerIdSchema,
  status: z.enum(["waiting", "drafting", "playing", "finished"]),
  maxPlayers: z.number().int().min(2).max(10),
  createdAt: z.string().datetime(),
  players: z.array(playerSchema).min(1).max(10),
  ruleConfig: roomRuleConfigSchema,
  draft: generalDraftSchema.optional(),
  game: gameSessionSchema.optional(),
}).superRefine((room, context) => {
  const issue = (message: string) => context.addIssue({ code: z.ZodIssueCode.custom, message });
  const playerIds = room.players.map((player) => player.id);
  const activePlayerIds = room.players.filter((player) => !player.departed).map((player) => player.id);
  if (new Set(playerIds).size !== playerIds.length) issue("Room contains duplicate players");
  if (room.players.some((player, index) => player.seat !== index)) issue("Room seats are not contiguous");
  if (!activePlayerIds.includes(room.ownerId)) issue("Room owner is not an active member");
  if (room.players.length > room.maxPlayers) issue("Room exceeds maxPlayers");
  if (room.status === "waiting" && (room.draft || room.game)) {
    issue("Waiting room unexpectedly contains draft or game state");
  }
  if (room.status === "drafting") {
    if (!room.draft || room.game) issue("Drafting room must contain only draft state");
    if (room.draft) {
      if (!sameOrderedStrings(room.draft.playerIds, activePlayerIds)) {
        issue("Room members and draft players disagree");
      }
      try {
        assertGeneralDraftForConfig(room.draft as GeneralDraftState, room.ruleConfig);
      } catch (error) {
        issue(error instanceof Error ? error.message : "Invalid general draft state");
      }
    }
  }
  if ((room.status === "playing" || room.status === "finished") && (!room.game || room.draft)) {
    issue("Playing or finished room must contain only game state");
  }
  if (room.game) {
    const gamePlayerIds = room.game.players.map((player) => player.id);
    if (gamePlayerIds.length !== playerIds.length || gamePlayerIds.some((id, index) => id !== playerIds[index])) {
      issue("Room members and game players disagree");
    }
    if (room.status !== room.game.status) issue("Room status and game status disagree");
    if (!sameRoomRuleConfig(room.ruleConfig, room.game.completeRules.ruleConfig)) {
      issue("Room and game rule configurations disagree");
    }
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

function plainRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Adds the missing DyingStack identity from the only unambiguous legacy UI cursor. */
function migrateLegacyPendingDying(game: Record<string, unknown>): void {
  const completeRules = game.completeRules as CompleteRulesEngineState | undefined;
  if (!completeRules || !Array.isArray(completeRules.dying?.frames) || !Array.isArray(game.players)) return;
  const afterMove = plainRecord(game.afterMove);
  const carriers = [game.pendingResponse, afterMove?.suspendedResponse]
    .map(plainRecord)
    .filter((pending): pending is Record<string, unknown> => pending?.type === "dying");
  if (carriers.length !== 1) return;
  const pending = carriers[0]!;
  if (Object.prototype.hasOwnProperty.call(pending, "frameId")) return;
  if (
    typeof pending.victimId !== "string" ||
    !(pending.damageSourceId === null || typeof pending.damageSourceId === "string") ||
    typeof pending.targetId !== "string" ||
    !Array.isArray(pending.remainingResponderIds) ||
    pending.remainingResponderIds.some((id) => typeof id !== "string")
  ) return;
  const resume = plainRecord(pending.resume);
  if (!resume) return;
  const players = (game.players as unknown[]).map((value) => {
    const player = plainRecord(value);
    return player && typeof player.id === "string" &&
      Number.isSafeInteger(player.hp) && Number.isSafeInteger(player.maxHp) && typeof player.alive === "boolean"
      ? { id: player.id, hp: player.hp as number, maxHp: player.maxHp as number, alive: player.alive }
      : null;
  });
  if (players.some((player) => player === null)) return;
  const lifePlayers = players as LifePlayerState[];

  const top = completeRules.dying.frames.at(-1);
  if (top) {
    if (
      completeRules.dying.frames.length !== 1 ||
      top.stage !== "rescue" ||
      top.victimId !== pending.victimId ||
      currentDyingResponder(top) !== pending.targetId ||
      !sameOrderedStrings(
        pending.remainingResponderIds as string[],
        top.responderOrder.slice(top.responderIndex + 1),
      ) ||
      (top.reason.type === "damage" ? top.reason.sourceId : null) !== pending.damageSourceId
    ) return;
    pending.frameId = top.frameId;
    return;
  }

  let frameId: number;
  let advancesEventCounter = false;
  let reason: { type: "damage" | "hp_loss"; eventId: number; sourceId: string | null };
  if (resume.type === "damage_flow") {
    if (!Number.isSafeInteger(resume.frameId) || !Number.isSafeInteger(resume.damageId) || !Number.isSafeInteger(resume.dyingId)) return;
    const damageFrame = completeRules.damageFlow.frames.at(-1);
    const barrier = damageFrame?.dying;
    if (!damageFrame || damageFrame.step !== "dying" || !barrier ||
      damageFrame.frameId !== resume.frameId ||
      damageFrame.damageId !== resume.damageId ||
      barrier.dyingId !== resume.dyingId ||
      barrier.targetId !== pending.victimId ||
      damageFrame.damage.sourceId !== pending.damageSourceId
    ) return;
    frameId = resume.dyingId as number;
    reason = {
      type: "damage",
      eventId: resume.damageId as number,
      sourceId: pending.damageSourceId as string | null,
    };
  } else {
    const gameNextEventId = game.nextEventId;
    if (!Number.isSafeInteger(gameNextEventId) || gameNextEventId !== completeRules.nextEventId ||
      (gameNextEventId as number) >= Number.MAX_SAFE_INTEGER
    ) return;
    frameId = gameNextEventId as number;
    advancesEventCounter = true;
    const legacyAftermath = resume.type === "standard_damage" ? plainRecord(resume.aftermath) : null;
    const legacyEventId = legacyAftermath?.eventId;
    const legacySourceId = legacyAftermath?.sourceId;
    if (legacyAftermath &&
      (!Number.isSafeInteger(legacyEventId) || !(legacySourceId === null || typeof legacySourceId === "string"))
    ) return;
    reason = pending.damageSourceId !== null || legacyAftermath
      ? {
          type: "damage",
          eventId: legacyAftermath ? legacyEventId as number : frameId,
          sourceId: legacyAftermath ? legacySourceId as string | null : pending.damageSourceId as string,
        }
      : { type: "hp_loss", eventId: frameId, sourceId: null };
    if (reason.sourceId !== pending.damageSourceId) return;
  }

  try {
    const frame = migrateDyingFrame(lifePlayers, {
      type: "dying",
      frameId,
      victimId: pending.victimId as string,
      reason,
      responderOrder: [pending.targetId as string, ...(pending.remainingResponderIds as string[])],
      responderIndex: 0,
      stage: "rescue",
      rescues: [],
      alternateSaveSkillIds: [],
      usedAlternateSaveSkillId: null,
    });
    pushDyingFrame(completeRules.dying, frame);
    if (advancesEventCounter) {
      game.nextEventId = frameId + 1;
      completeRules.nextEventId = frameId + 1;
    }
    pending.frameId = frame.frameId;
  } catch {
    // Leave the missing field untouched so strict schema validation rejects it.
  }
}

/** Explicit v1 migration for counters added by the serializable card-use engine. */
function migrateRoomSnapshot(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const migrated = structuredClone(value) as Record<string, unknown>;
  if (!Array.isArray(migrated.rooms)) return migrated;
  for (const rawRoom of migrated.rooms) {
    if (!rawRoom || typeof rawRoom !== "object") continue;
    const room = rawRoom as Record<string, unknown>;
    const hadRoomRuleConfig = room.ruleConfig !== undefined;
    if (!hadRoomRuleConfig) room.ruleConfig = structuredClone(DEFAULT_SERVER_ROOM_RULE_CONFIG);
    if (!room.game || typeof room.game !== "object") continue;
    const game = room.game as Record<string, unknown>;
    if (game.revision === undefined) game.revision = 0;
    if (game.nextUseId === undefined) game.nextUseId = 1;
    if (game.nextEventId === undefined) game.nextEventId = 1;
    if (Array.isArray(game.players)) {
      for (const rawPlayer of game.players) {
        if (!rawPlayer || typeof rawPlayer !== "object") continue;
        const player = rawPlayer as Record<string, unknown>;
        if (player.extraPiles === undefined) player.extraPiles = {};
        if (player.faceUp === undefined) player.faceUp = true;
      }
    }
    if (game.afterMove === undefined) {
      game.afterMove = { queuedRecoveries: [], queuedTriggers: [], suspendedPhase: null, suspendedResponse: null };
    } else {
      const afterMove = plainRecord(game.afterMove);
      if (afterMove && afterMove.queuedRecoveries === undefined) afterMove.queuedRecoveries = [];
    }
    const hadCompleteRules = game.completeRules !== undefined;
    try {
      const lifePlayers = Array.isArray(game.players)
        ? game.players.map((value) => {
            const player = plainRecord(value);
            return player
              ? { id: player.id, hp: player.hp, maxHp: player.maxHp, alive: player.alive }
              : value;
          }) as LifePlayerState[]
        : undefined;
      const completeRules = migrateCompleteRulesEngineState(game.completeRules, lifePlayers);
      if (!hadCompleteRules) completeRules.nextEventId = game.nextEventId as number;
      if (!hadRoomRuleConfig) {
        completeRules.ruleConfig = structuredClone(DEFAULT_SERVER_ROOM_RULE_CONFIG);
      }
      game.completeRules = completeRules;
    } catch {
      // Preserve an existing malformed/nonempty value so strict schema
      // validation rejects it; migration must never replace ambiguous state.
    }
    migrateLegacyPendingDying(game);
    if (game.turn && typeof game.turn === "object") {
      const turn = game.turn as Record<string, unknown>;
      if (turn.discardStage === undefined) turn.discardStage = "hand_limit";
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
  private waiters: Array<{ resolve: () => void; reject: (error: unknown) => void }> = [];
  private stopped = false;

  constructor(
    private readonly pool: Pool,
    private readonly onError: (error: unknown) => void,
    private readonly retryMs = 1_000,
  ) {}

  enqueue(snapshot: RoomServiceSnapshot): Promise<void> {
    if (this.stopped) return Promise.reject(new Error("Room snapshot writer is stopped"));
    this.pending = snapshot;
    const persisted = new Promise<void>((resolve, reject) => this.waiters.push({ resolve, reject }));
    this.start();
    return persisted;
  }

  private start(): void {
    if (this.running || !this.pending || this.stopped) return;
    const operation = this.drain();
    this.running = operation;
    void operation.then(
      () => {
        if (this.running === operation) this.running = undefined;
        if (this.pending && !this.stopped) this.start();
        else if (!this.pending) this.resolveWaiters();
      },
      (error) => {
        if (this.running === operation) this.running = undefined;
        this.onError(error);
        if (this.pending && !this.stopped && !this.retryTimer) {
          this.retryTimer = setTimeout(() => {
            this.retryTimer = undefined;
            this.start();
          }, this.retryMs);
          this.retryTimer.unref();
        }
      },
    );
  }

  private resolveWaiters(): void {
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) waiter.resolve();
  }

  private rejectWaiters(error: unknown): void {
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) waiter.reject(error);
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
    try {
      await this.drain();
      this.resolveWaiters();
    } catch (error) {
      this.rejectWaiters(error);
      throw error;
    }
  }
}
