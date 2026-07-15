import type {
  CardCategory,
  CardKind,
  CardSuit,
  CardUseMethod,
  DamageNature,
  Faction,
  PlayerId,
  TurnPhase,
} from "../types.js";

/**
 * Pure rules used by the Wind expansion.  Every public input and output is a
 * JSON value: callers may persist a request before applying its result.  The
 * module never mutates input snapshots and rejects malformed runtime values.
 */

export type WindCardColor = "red" | "black";
export type WindCardZone =
  | "hand"
  | "equipment"
  | "judgment"
  | "draw_pile"
  | "discard_pile"
  | "processing"
  | "extra_pile";

export interface WindCardSnapshot {
  readonly id: string;
  readonly kind: CardKind;
  readonly category: CardCategory;
  readonly printedSuit: CardSuit;
  readonly ownerId: PlayerId | null;
  readonly zone: WindCardZone;
  readonly physical: boolean;
}

export interface HongyanContext {
  readonly ownerId: PlayerId;
  readonly active: boolean;
}

export type WindRuleResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: "invalid_input"; readonly detail: string };

function success<T>(value: T): WindRuleResult<T> {
  return { ok: true, value };
}

function invalid(detail: string): WindRuleResult<never> {
  return { ok: false, error: "invalid_input", detail };
}

const SUITS: readonly CardSuit[] = ["spade", "heart", "club", "diamond"];
const PHASES: readonly TurnPhase[] = ["prepare", "judgment", "draw", "play", "respond", "discard", "end"];
const METHODS: readonly CardUseMethod[] = ["use", "respond", "recast"];
const FACTIONS: readonly Faction[] = ["wei", "shu", "wu", "qun", "god"];
const ZONES: readonly WindCardZone[] = [
  "hand", "equipment", "judgment", "draw_pile", "discard_pile", "processing", "extra_pile",
];

const BASIC_KINDS = [
  "slash", "fire_slash", "thunder_slash", "dodge", "peach", "wine",
] as const satisfies readonly CardKind[];

const EQUIPMENT_KINDS = [
  "chi_tu", "da_wan", "zi_xing", "di_lu", "hua_liu", "jue_ying", "zhua_huang_fei_dian",
  "zhu_ge_lian_nu", "gu_ding_dao", "qing_gang_jian", "ci_xiong_shuang_gu_jian",
  "han_bing_jian", "qing_long_yan_yue_dao", "zhang_ba_she_mao", "guan_shi_fu",
  "fang_tian_hua_ji", "zhu_que_yu_shan", "qi_lin_gong", "ren_wang_dun", "teng_jia",
  "bai_yin_shi_zi", "ba_gua_zhen",
] as const satisfies readonly CardKind[];

const TRICK_KINDS = [
  "ex_nihilo", "duel", "barbarian_invasion", "arrow_barrage", "peach_garden",
  "le_bu_si_shu", "bing_liang_cun_duan", "shan_dian", "wu_xie_ke_ji",
  "guo_he_chai_qiao", "shun_shou_qian_yang", "fire_attack", "amazing_grace",
  "borrowed_sword", "iron_chain",
] as const satisfies readonly CardKind[];

const KNOWN_KINDS: readonly CardKind[] = [...BASIC_KINDS, ...EQUIPMENT_KINDS, ...TRICK_KINDS];
const SLASH_KINDS = ["slash", "fire_slash", "thunder_slash"] as const satisfies readonly CardKind[];
const GUHUO_TRICK_KINDS = [
  "ex_nihilo", "duel", "barbarian_invasion", "arrow_barrage", "peach_garden",
  "wu_xie_ke_ji", "guo_he_chai_qiao", "shun_shou_qian_yang", "fire_attack",
  "amazing_grace", "borrowed_sword", "iron_chain",
] as const satisfies readonly CardKind[];
const GUHUO_DECLARABLE_KINDS: readonly CardKind[] = [...BASIC_KINDS, ...GUHUO_TRICK_KINDS];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function member<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

/** Rejects values that JSON would silently rewrite, omit, or fail to serialize. */
function isStrictJsonValue(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;

  if (ancestors.has(value)) return false;
  ancestors.add(value);
  try {
    const enumerableKeys = Object.keys(value);
    const ownKeys = Reflect.ownKeys(value);
    if (Array.isArray(value)) {
      return ownKeys.length === enumerableKeys.length + 1
        && ownKeys.includes("length")
        && enumerableKeys.length === value.length
        && enumerableKeys.every((key, index) => key === String(index))
        && enumerableKeys.every((key) => {
          const descriptor = Object.getOwnPropertyDescriptor(value, key);
          return descriptor?.enumerable === true
            && "value" in descriptor
            && isStrictJsonValue(descriptor.value, ancestors);
        });
    }
    const prototype = Object.getPrototypeOf(value);
    return (prototype === Object.prototype || prototype === null)
      && ownKeys.length === enumerableKeys.length
      && enumerableKeys.every((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return descriptor?.enumerable === true
          && "value" in descriptor
          && isStrictJsonValue(descriptor.value, ancestors);
      });
  } catch {
    return false;
  } finally {
    ancestors.delete(value);
  }
}

function expectedCategory(kind: CardKind): CardCategory {
  if (member(BASIC_KINDS, kind)) return "basic";
  if (member(EQUIPMENT_KINDS, kind)) return "equipment";
  return "trick";
}

function isValidCardSnapshot(value: unknown): value is WindCardSnapshot {
  if (!isRecord(value)) return false;
  if (
    !isNonEmptyId(value.id)
    || !member(KNOWN_KINDS, value.kind)
    || !member(SUITS, value.printedSuit)
    || !member(ZONES, value.zone)
    || typeof value.physical !== "boolean"
    || (value.ownerId !== null && !isNonEmptyId(value.ownerId))
  ) return false;
  if (value.category !== expectedCategory(value.kind)) return false;
  if (["hand", "equipment", "judgment", "extra_pile"].includes(value.zone) && value.ownerId === null) {
    return false;
  }
  return true;
}

function isValidHongyanContext(value: unknown): value is HongyanContext | null {
  return value === null || (
    isRecord(value)
    && isNonEmptyId(value.ownerId)
    && typeof value.active === "boolean"
  );
}

function colorOfSuit(suit: CardSuit): WindCardColor {
  return suit === "heart" || suit === "diamond" ? "red" : "black";
}

function resolveSuit(
  printedSuit: CardSuit,
  cardOwnerId: PlayerId | null,
  hongyan: HongyanContext | null,
): { effectiveSuit: CardSuit; effectiveColor: WindCardColor; modified: boolean } {
  const modified = hongyan !== null
    && hongyan.active
    && cardOwnerId === hongyan.ownerId
    && printedSuit === "spade";
  const effectiveSuit: CardSuit = modified ? "heart" : printedSuit;
  return { effectiveSuit, effectiveColor: colorOfSuit(effectiveSuit), modified };
}

export interface HongyanSuitQuery {
  readonly printedSuit: CardSuit;
  readonly cardOwnerId: PlayerId | null;
  readonly hongyan: HongyanContext | null;
}

export interface HongyanSuitResolution {
  readonly printedSuit: CardSuit;
  readonly effectiveSuit: CardSuit;
  readonly effectiveColor: WindCardColor;
  readonly modified: boolean;
}

/** Hongyan applies only while the queried physical card is owned by its skill owner. */
export function resolveHongyanSuit(input: HongyanSuitQuery): WindRuleResult<HongyanSuitResolution> {
  if (!isRecord(input) || !member(SUITS, input.printedSuit)) return invalid("printed suit is invalid");
  if (input.cardOwnerId !== null && !isNonEmptyId(input.cardOwnerId)) return invalid("card owner is invalid");
  if (!isValidHongyanContext(input.hongyan)) return invalid("hongyan context is invalid");
  const result = resolveSuit(input.printedSuit, input.cardOwnerId, input.hongyan);
  return success({ printedSuit: input.printedSuit, ...result });
}

export interface LiegongInput {
  readonly skillOwnerId: PlayerId;
  readonly slashSourceId: PlayerId;
  readonly turnPlayerId: PlayerId;
  readonly phase: TurnPhase;
  readonly method: CardUseMethod;
  readonly slashKind: CardKind;
  readonly targetHandCount: number;
  readonly ownerCurrentHp: number;
  readonly ownerAttackRange: number;
}

export type LiegongIneligibleReason =
  | "not_owners_play_phase"
  | "not_owner_slash"
  | "not_use_method"
  | "condition_not_met";

export interface LiegongDecision {
  readonly eligible: boolean;
  readonly reason: LiegongIneligibleReason | null;
  readonly handAtLeastCurrentHp: boolean;
  readonly handAtMostAttackRange: boolean;
}

export function evaluateLiegong(input: LiegongInput): WindRuleResult<LiegongDecision> {
  if (!isRecord(input)) return invalid("liegong input is invalid");
  if (![input.skillOwnerId, input.slashSourceId, input.turnPlayerId].every(isNonEmptyId)) {
    return invalid("liegong player id is invalid");
  }
  if (!member(PHASES, input.phase) || !member(METHODS, input.method) || !member(SLASH_KINDS, input.slashKind)) {
    return invalid("liegong card timing is invalid");
  }
  if (!isSafeInteger(input.targetHandCount) || input.targetHandCount < 0) {
    return invalid("target hand count is invalid");
  }
  if (!isSafeInteger(input.ownerCurrentHp) || !isSafeInteger(input.ownerAttackRange) || input.ownerAttackRange < 1) {
    return invalid("owner hp or attack range is invalid");
  }
  const high = input.targetHandCount >= input.ownerCurrentHp;
  const low = input.targetHandCount <= input.ownerAttackRange;
  if (input.turnPlayerId !== input.skillOwnerId || input.phase !== "play") {
    return success({ eligible: false, reason: "not_owners_play_phase", handAtLeastCurrentHp: high, handAtMostAttackRange: low });
  }
  if (input.slashSourceId !== input.skillOwnerId) {
    return success({ eligible: false, reason: "not_owner_slash", handAtLeastCurrentHp: high, handAtMostAttackRange: low });
  }
  if (input.method !== "use") {
    return success({ eligible: false, reason: "not_use_method", handAtLeastCurrentHp: high, handAtMostAttackRange: low });
  }
  return success({
    eligible: high || low,
    reason: high || low ? null : "condition_not_met",
    handAtLeastCurrentHp: high,
    handAtMostAttackRange: low,
  });
}

export interface KuangguDamagePointSnapshot {
  readonly pointIndex: number;
  /** The authoritative distance captured when this damage point was applied. */
  readonly distanceAtApplication: number;
  /** State after this point's target dying/death settlement, before Kuanggu. */
  readonly sourceAliveAfterSettlement: boolean;
  readonly sourceHpAfterSettlement: number;
  readonly sourceMaxHpAfterSettlement: number;
}

export interface KuangguPlanInput {
  readonly sourceId: PlayerId;
  readonly targetId: PlayerId;
  readonly points: readonly KuangguDamagePointSnapshot[];
}

export interface KuangguRecoveryStep {
  readonly pointIndex: number;
  readonly distanceAtApplication: number;
  readonly withinDistanceOne: boolean;
  readonly triggered: boolean;
  readonly requestedRecovery: 0 | 1;
  readonly recoverableAmount: 0 | 1;
  readonly reason: "outside_distance_one" | "source_dead" | null;
}

export interface KuangguRecoveryPlan {
  readonly sourceId: PlayerId;
  readonly targetId: PlayerId;
  readonly steps: readonly KuangguRecoveryStep[];
}

export function planKuangguRecovery(input: KuangguPlanInput): WindRuleResult<KuangguRecoveryPlan> {
  if (!isRecord(input) || !isNonEmptyId(input.sourceId) || !isNonEmptyId(input.targetId) || !Array.isArray(input.points)) {
    return invalid("kuanggu input is invalid");
  }
  const steps: KuangguRecoveryStep[] = [];
  for (let index = 0; index < input.points.length; index += 1) {
    const point = input.points[index];
    if (!isRecord(point)
      || point.pointIndex !== index + 1
      || !isSafeInteger(point.distanceAtApplication)
      || point.distanceAtApplication < 0
      || typeof point.sourceAliveAfterSettlement !== "boolean"
      || !isSafeInteger(point.sourceHpAfterSettlement)
      || !isSafeInteger(point.sourceMaxHpAfterSettlement)
      || point.sourceMaxHpAfterSettlement < 1
      || point.sourceHpAfterSettlement > point.sourceMaxHpAfterSettlement
    ) return invalid("kuanggu point snapshot is invalid or out of order");

    const withinDistanceOne = point.distanceAtApplication <= 1;
    const triggered = withinDistanceOne && point.sourceAliveAfterSettlement;
    const reason = !withinDistanceOne ? "outside_distance_one" : !point.sourceAliveAfterSettlement ? "source_dead" : null;
    steps.push({
      pointIndex: point.pointIndex,
      distanceAtApplication: point.distanceAtApplication,
      withinDistanceOne,
      triggered,
      requestedRecovery: triggered ? 1 : 0,
      recoverableAmount: triggered && point.sourceHpAfterSettlement < point.sourceMaxHpAfterSettlement ? 1 : 0,
      reason,
    });
  }
  return success({ sourceId: input.sourceId, targetId: input.targetId, steps });
}

export interface JushouDisposalInput {
  readonly skillOwnerId: PlayerId;
  readonly mode: "discard_non_equipment" | "use_equipment";
  readonly card: WindCardSnapshot;
  /** Result of normal equipment-use validation in the authoritative card-use engine. */
  readonly equipmentUseLegal: boolean;
}

export type JushouIneligibleReason =
  | "card_not_owned_hand"
  | "discard_requires_non_equipment"
  | "use_requires_equipment"
  | "equipment_use_illegal";

export interface JushouDisposalDecision {
  readonly eligible: boolean;
  readonly reason: JushouIneligibleReason | null;
  readonly disposition: "discard" | "use" | null;
}

export function evaluateJushouDisposal(input: JushouDisposalInput): WindRuleResult<JushouDisposalDecision> {
  if (!isRecord(input) || !isNonEmptyId(input.skillOwnerId) || !isValidCardSnapshot(input.card)) {
    return invalid("jushou input is invalid");
  }
  if (input.mode !== "discard_non_equipment" && input.mode !== "use_equipment") return invalid("jushou mode is invalid");
  if (typeof input.equipmentUseLegal !== "boolean") return invalid("equipment-use legality is invalid");
  if (!input.card.physical || input.card.ownerId !== input.skillOwnerId || input.card.zone !== "hand") {
    return success({ eligible: false, reason: "card_not_owned_hand", disposition: null });
  }
  if (input.mode === "discard_non_equipment") {
    const eligible = input.card.category !== "equipment";
    return success({ eligible, reason: eligible ? null : "discard_requires_non_equipment", disposition: eligible ? "discard" : null });
  }
  if (input.card.category !== "equipment") {
    return success({ eligible: false, reason: "use_requires_equipment", disposition: null });
  }
  return success({
    eligible: input.equipmentUseLegal,
    reason: input.equipmentUseLegal ? null : "equipment_use_illegal",
    disposition: input.equipmentUseLegal ? "use" : null,
  });
}

export type ShensuStage = "judgment_and_draw" | "play";
export type ShensuWindow = "before_judgment" | "before_play";

export interface ShensuActivationInput {
  readonly stage: ShensuStage;
  readonly window: ShensuWindow;
  readonly skillOwnerId: PlayerId;
  readonly turnPlayerId: PlayerId;
  /** True when the stage represented by `window` was already skipped upstream. */
  readonly phaseAlreadySkipped: boolean;
  readonly costCard: WindCardSnapshot | null;
  readonly target: {
    readonly id: PlayerId;
    readonly alive: boolean;
    /** Normal target legality after deliberately omitting only the distance check. */
    readonly legalIgnoringDistance: boolean;
  };
}

export interface ShensuVirtualSlash {
  readonly sourceSkillId: "shensu";
  readonly kind: "slash";
  readonly nature: DamageNature;
  readonly effectiveColor: null;
  readonly physicalCardIds: readonly [];
  readonly useMethod: "use";
  readonly ignoresDistance: true;
  readonly consumesPlayPhaseSlashQuota: false;
}

export type ShensuIneligibleReason =
  | "not_owner_turn"
  | "wrong_window"
  | "phase_already_skipped"
  | "stage_one_has_cost"
  | "stage_two_requires_equipment_cost"
  | "illegal_target";

export interface ShensuDecision {
  readonly eligible: boolean;
  readonly reason: ShensuIneligibleReason | null;
  readonly costCardId: string | null;
  readonly skippedPhases: readonly TurnPhase[];
  readonly virtualSlash: ShensuVirtualSlash | null;
}

function shensuSlash(): ShensuVirtualSlash {
  return {
    sourceSkillId: "shensu",
    kind: "slash",
    nature: "normal",
    effectiveColor: null,
    physicalCardIds: [],
    useMethod: "use",
    ignoresDistance: true,
    consumesPlayPhaseSlashQuota: false,
  };
}

export function evaluateShensuActivation(input: ShensuActivationInput): WindRuleResult<ShensuDecision> {
  if (!isRecord(input)
    || (input.stage !== "judgment_and_draw" && input.stage !== "play")
    || (input.window !== "before_judgment" && input.window !== "before_play")
    || !isNonEmptyId(input.skillOwnerId)
    || !isNonEmptyId(input.turnPlayerId)
    || typeof input.phaseAlreadySkipped !== "boolean"
    || !isRecord(input.target)
    || !isNonEmptyId(input.target.id)
    || typeof input.target.alive !== "boolean"
    || typeof input.target.legalIgnoringDistance !== "boolean"
  ) return invalid("shensu input is invalid");
  if (input.costCard !== null && !isValidCardSnapshot(input.costCard)) return invalid("shensu cost card is invalid");

  const empty = (reason: ShensuIneligibleReason): WindRuleResult<ShensuDecision> => success({
    eligible: false, reason, costCardId: null, skippedPhases: [], virtualSlash: null,
  });
  if (input.turnPlayerId !== input.skillOwnerId) return empty("not_owner_turn");
  const expectedWindow: ShensuWindow = input.stage === "judgment_and_draw" ? "before_judgment" : "before_play";
  if (input.window !== expectedWindow) return empty("wrong_window");
  if (input.phaseAlreadySkipped) return empty("phase_already_skipped");
  if (!input.target.alive || input.target.id === input.skillOwnerId || !input.target.legalIgnoringDistance) {
    return empty("illegal_target");
  }
  if (input.stage === "judgment_and_draw" && input.costCard !== null) return empty("stage_one_has_cost");
  if (input.stage === "play") {
    const card = input.costCard;
    if (card === null
      || !card.physical
      || card.ownerId !== input.skillOwnerId
      || (card.zone !== "hand" && card.zone !== "equipment")
      || card.category !== "equipment"
    ) return empty("stage_two_requires_equipment_cost");
  }
  return success({
    eligible: true,
    reason: null,
    costCardId: input.costCard?.id ?? null,
    skippedPhases: input.stage === "judgment_and_draw" ? ["judgment", "draw"] : ["play"],
    virtualSlash: shensuSlash(),
  });
}

export interface TianxiangChoiceInput {
  readonly skillOwnerId: PlayerId;
  readonly currentDamageTargetId: PlayerId;
  readonly costCard: WindCardSnapshot;
  readonly hongyan: HongyanContext | null;
  readonly target: { readonly id: PlayerId; readonly alive: boolean };
}

export type TianxiangIneligibleReason =
  | "damage_not_received_by_owner"
  | "cost_not_owned_physical_hand"
  | "cost_not_effective_heart"
  | "target_not_other_living_player";

export interface TianxiangChoiceDecision {
  readonly eligible: boolean;
  readonly reason: TianxiangIneligibleReason | null;
  readonly effectiveCostSuit: CardSuit;
  readonly costModifiedByHongyan: boolean;
}

export function evaluateTianxiangChoice(input: TianxiangChoiceInput): WindRuleResult<TianxiangChoiceDecision> {
  if (!isRecord(input)
    || !isNonEmptyId(input.skillOwnerId)
    || !isNonEmptyId(input.currentDamageTargetId)
    || !isValidCardSnapshot(input.costCard)
    || !isValidHongyanContext(input.hongyan)
    || !isRecord(input.target)
    || !isNonEmptyId(input.target.id)
    || typeof input.target.alive !== "boolean"
  ) return invalid("tianxiang input is invalid");
  const suit = resolveSuit(input.costCard.printedSuit, input.costCard.ownerId, input.hongyan);
  const result = (eligible: boolean, reason: TianxiangIneligibleReason | null): WindRuleResult<TianxiangChoiceDecision> => success({
    eligible, reason, effectiveCostSuit: suit.effectiveSuit, costModifiedByHongyan: suit.modified,
  });
  if (input.currentDamageTargetId !== input.skillOwnerId) return result(false, "damage_not_received_by_owner");
  if (!input.costCard.physical || input.costCard.ownerId !== input.skillOwnerId || input.costCard.zone !== "hand") {
    return result(false, "cost_not_owned_physical_hand");
  }
  if (suit.effectiveSuit !== "heart") return result(false, "cost_not_effective_heart");
  if (!input.target.alive || input.target.id === input.skillOwnerId) return result(false, "target_not_other_living_player");
  return result(true, null);
}

export interface HuangtianGiftInput {
  readonly giverId: PlayerId;
  readonly giverFaction: Faction;
  readonly giverAlive: boolean;
  readonly receiverId: PlayerId;
  readonly receiverAlive: boolean;
  readonly receiverHasEffectiveHuangtian: boolean;
  readonly turnPlayerId: PlayerId;
  readonly phase: TurnPhase;
  readonly useCountThisPlayPhase: number;
  readonly card: WindCardSnapshot;
}

export type HuangtianIneligibleReason =
  | "giver_or_receiver_dead"
  | "giver_not_other_qun_player"
  | "not_givers_play_phase"
  | "already_used_this_play_phase"
  | "receiver_lacks_effective_huangtian"
  | "card_not_owned_physical_hand"
  | "card_not_dodge_or_lightning";

export interface HuangtianGiftDecision {
  readonly eligible: boolean;
  readonly reason: HuangtianIneligibleReason | null;
}

export function evaluateHuangtianGift(input: HuangtianGiftInput): WindRuleResult<HuangtianGiftDecision> {
  if (!isRecord(input)
    || !isNonEmptyId(input.giverId)
    || !isNonEmptyId(input.receiverId)
    || !isNonEmptyId(input.turnPlayerId)
    || !member(FACTIONS, input.giverFaction)
    || typeof input.giverAlive !== "boolean"
    || typeof input.receiverAlive !== "boolean"
    || typeof input.receiverHasEffectiveHuangtian !== "boolean"
    || !member(PHASES, input.phase)
    || !isSafeInteger(input.useCountThisPlayPhase)
    || input.useCountThisPlayPhase < 0
    || !isValidCardSnapshot(input.card)
  ) return invalid("huangtian input is invalid");
  const decision = (reason: HuangtianIneligibleReason | null): WindRuleResult<HuangtianGiftDecision> => success({
    eligible: reason === null, reason,
  });
  if (!input.giverAlive || !input.receiverAlive) return decision("giver_or_receiver_dead");
  if (input.giverId === input.receiverId || input.giverFaction !== "qun") return decision("giver_not_other_qun_player");
  if (input.turnPlayerId !== input.giverId || input.phase !== "play") return decision("not_givers_play_phase");
  if (input.useCountThisPlayPhase !== 0) return decision("already_used_this_play_phase");
  if (!input.receiverHasEffectiveHuangtian) return decision("receiver_lacks_effective_huangtian");
  if (!input.card.physical || input.card.ownerId !== input.giverId || input.card.zone !== "hand") {
    return decision("card_not_owned_physical_hand");
  }
  if (input.card.kind !== "dodge" && input.card.kind !== "shan_dian") return decision("card_not_dodge_or_lightning");
  return decision(null);
}

export interface BuquLossInput {
  readonly hpBefore: number;
  readonly lossAmount: number;
}

export interface BuquQualifyingPoint {
  readonly pointIndex: number;
  readonly hpAfterPoint: number;
}

export interface BuquWoundPlan {
  readonly hpBefore: number;
  readonly hpAfter: number;
  readonly woundCount: number;
  readonly qualifyingPoints: readonly BuquQualifyingPoint[];
}

/** Counts only individual HP deductions whose post-point HP is zero or lower. */
export function planBuquWounds(input: BuquLossInput): WindRuleResult<BuquWoundPlan> {
  if (!isRecord(input) || !isSafeInteger(input.hpBefore) || !isSafeInteger(input.lossAmount) || input.lossAmount < 0) {
    return invalid("buqu hp loss input is invalid");
  }
  const hpAfter = input.hpBefore - input.lossAmount;
  if (!Number.isSafeInteger(hpAfter)) return invalid("buqu resulting hp is outside the safe integer range");
  const qualifyingPoints: BuquQualifyingPoint[] = [];
  for (let pointIndex = 1; pointIndex <= input.lossAmount; pointIndex += 1) {
    const hpAfterPoint = input.hpBefore - pointIndex;
    if (hpAfterPoint <= 0) qualifyingPoints.push({ pointIndex, hpAfterPoint });
  }
  return success({
    hpBefore: input.hpBefore,
    hpAfter,
    woundCount: qualifyingPoints.length,
    qualifyingPoints,
  });
}

export interface BuquWoundCard {
  readonly cardId: string;
  readonly rank: number;
}

export interface BuquWoundAnalysis {
  readonly uniqueRanks: boolean;
  readonly duplicateRanks: readonly number[];
  readonly protectedFromDying: boolean;
}

function validateBuquWounds(wounds: unknown): wounds is readonly BuquWoundCard[] {
  if (!Array.isArray(wounds)) return false;
  const ids = new Set<string>();
  for (const wound of wounds) {
    if (!isRecord(wound)
      || !isNonEmptyId(wound.cardId)
      || !isSafeInteger(wound.rank)
      || wound.rank < 1
      || wound.rank > 13
      || ids.has(wound.cardId)
    ) return false;
    ids.add(wound.cardId);
  }
  return true;
}

function analyzeWounds(wounds: readonly BuquWoundCard[]): BuquWoundAnalysis {
  const counts = new Map<number, number>();
  for (const wound of wounds) counts.set(wound.rank, (counts.get(wound.rank) ?? 0) + 1);
  const duplicateRanks = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([rank]) => rank)
    .sort((a, b) => a - b);
  return {
    uniqueRanks: duplicateRanks.length === 0,
    duplicateRanks,
    protectedFromDying: wounds.length > 0 && duplicateRanks.length === 0,
  };
}

export function analyzeBuquWounds(wounds: readonly BuquWoundCard[]): WindRuleResult<BuquWoundAnalysis> {
  if (!validateBuquWounds(wounds)) return invalid("buqu wound cards are invalid");
  return success(analyzeWounds(wounds));
}

export interface BuquRecoveryPointInput {
  readonly hp: number;
  readonly maxHp: number;
  readonly wounds: readonly BuquWoundCard[];
  readonly removeCardId: string;
}

export interface BuquRecoveryPointResult extends BuquWoundAnalysis {
  readonly hpBefore: number;
  readonly hpAfter: number;
  readonly removedWound: BuquWoundCard;
  readonly remainingWounds: readonly BuquWoundCard[];
  readonly finalWoundRemoved: boolean;
}

/** Resolves one recovery point while Buqu wounds exist; later points use the normal recovery engine. */
export function resolveBuquRecoveryPoint(input: BuquRecoveryPointInput): WindRuleResult<BuquRecoveryPointResult> {
  if (!isRecord(input)
    || !isSafeInteger(input.hp)
    || !isSafeInteger(input.maxHp)
    || input.maxHp < 1
    || input.hp > 0
    || !validateBuquWounds(input.wounds)
    || input.wounds.length === 0
    || !isNonEmptyId(input.removeCardId)
  ) return invalid("buqu recovery input is invalid");
  const selectedIndex = input.wounds.findIndex((wound) => wound.cardId === input.removeCardId);
  if (selectedIndex < 0) return invalid("selected buqu wound does not exist");
  const removed = input.wounds[selectedIndex]!;
  const remaining = input.wounds
    .filter((_, index) => index !== selectedIndex)
    .map((wound) => ({ cardId: wound.cardId, rank: wound.rank }));
  const analysis = analyzeWounds(remaining);
  const finalWoundRemoved = remaining.length === 0;
  return success({
    hpBefore: input.hp,
    hpAfter: finalWoundRemoved ? 1 : input.hp,
    removedWound: { cardId: removed.cardId, rank: removed.rank },
    remainingWounds: remaining,
    finalWoundRemoved,
    ...analysis,
  });
}

export interface LeijiPhysicalCardProvenance {
  readonly type: "physical";
  readonly cardId: string;
  readonly printedKind: CardKind;
}

export interface LeijiViewAsCardProvenance {
  readonly type: "view_as";
  readonly skillId: string;
  /** Empty is valid for equipment/judgment supplied virtual Dodges. */
  readonly physicalCardIds: readonly string[];
}

export type LeijiCardProvenance = LeijiPhysicalCardProvenance | LeijiViewAsCardProvenance;

/** Authoritative result of one attempted card use/response; this planner never accepts raw client intent. */
export interface LeijiDodgeEvent {
  readonly dodgeEventId: string;
  readonly attributedPlayerId: PlayerId;
  readonly accepted: boolean;
  readonly method: CardUseMethod;
  readonly effectiveCardKind: CardKind;
  readonly provenance: LeijiCardProvenance;
}

export interface LeijiSelectedTarget {
  readonly playerId: PlayerId;
  readonly alive: boolean;
}

export interface LeijiPlanInput {
  readonly skillOwnerId: PlayerId;
  readonly dodgeEvent: LeijiDodgeEvent;
  readonly selectedTarget: LeijiSelectedTarget;
}

export type LeijiIneligibleReason =
  | "dodge_not_accepted"
  | "dodge_not_attributed_to_skill_owner"
  | "dodge_method_not_use_or_respond"
  | "effective_card_not_dodge"
  | "selected_target_dead";

/** A later judgment executor owns card drawing and determines whether this pattern hits. */
export interface LeijiJudgmentSpec {
  readonly triggerEventId: string;
  readonly skillId: "leiji";
  readonly pattern: "spade";
  readonly judgedTargetId: PlayerId;
}

/** Applied only after the corresponding judgment reports a hit; no damage math happens here. */
export interface LeijiHitDamageSpec {
  readonly triggerEventId: string;
  readonly sourceId: PlayerId;
  readonly targetId: PlayerId;
  readonly amount: 2;
  readonly nature: "thunder";
  readonly reason: "leiji";
}

export interface LeijiPlan {
  readonly dodgeEventId: string;
  readonly eligible: boolean;
  readonly reason: LeijiIneligibleReason | null;
  readonly judgment: LeijiJudgmentSpec | null;
  readonly hitDamage: LeijiHitDamageSpec | null;
}

function isValidLeijiProvenance(value: unknown, effectiveKind: CardKind): value is LeijiCardProvenance {
  if (!isRecord(value) || !member(["physical", "view_as"] as const, value.type)) return false;
  if (value.type === "physical") {
    return hasExactKeys(value, ["type", "cardId", "printedKind"])
      && isNonEmptyId(value.cardId)
      && member(KNOWN_KINDS, value.printedKind)
      && value.printedKind === effectiveKind;
  }
  return hasExactKeys(value, ["type", "skillId", "physicalCardIds"])
    && isNonEmptyId(value.skillId)
    && Array.isArray(value.physicalCardIds)
    && value.physicalCardIds.every(isNonEmptyId)
    && new Set(value.physicalCardIds).size === value.physicalCardIds.length;
}

/**
 * Plans one Leiji trigger from one already accepted card event.  The returned
 * specifications are inert data: callers still execute judgment and damage.
 */
export function planLeiji(input: LeijiPlanInput): WindRuleResult<LeijiPlan> {
  if (!isStrictJsonValue(input)
    || !isRecord(input)
    || !hasExactKeys(input, ["skillOwnerId", "dodgeEvent", "selectedTarget"])
    || !isNonEmptyId(input.skillOwnerId)
    || !isRecord(input.dodgeEvent)
    || !hasExactKeys(input.dodgeEvent, [
      "dodgeEventId", "attributedPlayerId", "accepted", "method", "effectiveCardKind", "provenance",
    ])
    || !isNonEmptyId(input.dodgeEvent.dodgeEventId)
    || !isNonEmptyId(input.dodgeEvent.attributedPlayerId)
    || typeof input.dodgeEvent.accepted !== "boolean"
    || !member(METHODS, input.dodgeEvent.method)
    || !member(KNOWN_KINDS, input.dodgeEvent.effectiveCardKind)
    || !isValidLeijiProvenance(input.dodgeEvent.provenance, input.dodgeEvent.effectiveCardKind)
    || !isRecord(input.selectedTarget)
    || !hasExactKeys(input.selectedTarget, ["playerId", "alive"])
    || !isNonEmptyId(input.selectedTarget.playerId)
    || typeof input.selectedTarget.alive !== "boolean"
  ) return invalid("leiji input is invalid");

  const event = input.dodgeEvent;
  const target = input.selectedTarget;
  const reason: LeijiIneligibleReason | null = !event.accepted
    ? "dodge_not_accepted"
    : event.attributedPlayerId !== input.skillOwnerId
      ? "dodge_not_attributed_to_skill_owner"
      : event.method !== "use" && event.method !== "respond"
        ? "dodge_method_not_use_or_respond"
        : event.effectiveCardKind !== "dodge"
          ? "effective_card_not_dodge"
          : !target.alive
            ? "selected_target_dead"
            : null;
  if (reason !== null) {
    return success({ dodgeEventId: event.dodgeEventId, eligible: false, reason, judgment: null, hitDamage: null });
  }

  return success({
    dodgeEventId: event.dodgeEventId,
    eligible: true,
    reason: null,
    judgment: {
      triggerEventId: event.dodgeEventId,
      skillId: "leiji",
      pattern: "spade",
      judgedTargetId: target.playerId,
    },
    hitDamage: {
      triggerEventId: event.dodgeEventId,
      sourceId: input.skillOwnerId,
      targetId: target.playerId,
      amount: 2,
      nature: "thunder",
      reason: "leiji",
    },
  });
}

export type GuhuoDeclarationKind =
  | "slash" | "fire_slash" | "thunder_slash" | "dodge" | "peach" | "wine"
  | "ex_nihilo" | "duel" | "barbarian_invasion" | "arrow_barrage" | "peach_garden"
  | "wu_xie_ke_ji" | "guo_he_chai_qiao" | "shun_shou_qian_yang" | "fire_attack"
  | "amazing_grace" | "borrowed_sword" | "iron_chain";

export function isGuhuoDeclarableKind(kind: unknown): kind is GuhuoDeclarationKind {
  return member(GUHUO_DECLARABLE_KINDS, kind);
}

export interface GuhuoTruthInput {
  readonly declaredKind: GuhuoDeclarationKind;
  readonly physicalKind: CardKind;
}

export interface GuhuoTruthDecision {
  readonly truthful: boolean;
  readonly comparison: "generic_slash" | "exact_kind";
}

export function evaluateGuhuoTruth(input: GuhuoTruthInput): WindRuleResult<GuhuoTruthDecision> {
  if (!isRecord(input) || !isGuhuoDeclarableKind(input.declaredKind) || !member(KNOWN_KINDS, input.physicalKind)) {
    return invalid("guhuo declaration or physical card kind is invalid");
  }
  const genericSlash = input.declaredKind === "slash";
  return success({
    truthful: genericSlash ? member(SLASH_KINDS, input.physicalKind) : input.declaredKind === input.physicalKind,
    comparison: genericSlash ? "generic_slash" : "exact_kind",
  });
}

export interface GuhuoChallengeInput extends GuhuoTruthInput {
  readonly sourceId: PlayerId;
  readonly effectiveSuit: CardSuit;
  /** Already filtered into authoritative challenge order. */
  readonly challengerIds: readonly PlayerId[];
}

export interface GuhuoChallengerConsequence {
  readonly playerId: PlayerId;
  readonly effect: "lose_hp" | "draw";
  readonly amount: 1;
}

export type GuhuoChallengeOutcome =
  | "unchallenged"
  | "challenged_truthful_heart"
  | "challenged_truthful_non_heart"
  | "challenged_false";

export interface GuhuoChallengeDecision {
  readonly truthful: boolean;
  readonly challenged: boolean;
  readonly outcome: GuhuoChallengeOutcome;
  readonly continuesAsDeclared: boolean;
  readonly revealRequired: true;
  readonly consequences: readonly GuhuoChallengerConsequence[];
}

export function adjudicateGuhuoChallenge(input: GuhuoChallengeInput): WindRuleResult<GuhuoChallengeDecision> {
  if (!isRecord(input)
    || !isNonEmptyId(input.sourceId)
    || !member(SUITS, input.effectiveSuit)
    || !Array.isArray(input.challengerIds)
    || input.challengerIds.some((id) => !isNonEmptyId(id) || id === input.sourceId)
    || new Set(input.challengerIds).size !== input.challengerIds.length
  ) return invalid("guhuo challenge metadata is invalid");
  const truth = evaluateGuhuoTruth(input);
  if (!truth.ok) return truth;
  const challenged = input.challengerIds.length > 0;
  if (!challenged) {
    return success({
      truthful: truth.value.truthful,
      challenged: false,
      outcome: "unchallenged",
      continuesAsDeclared: true,
      revealRequired: true,
      consequences: [],
    });
  }
  const truthfulHeart = truth.value.truthful && input.effectiveSuit === "heart";
  const outcome: GuhuoChallengeOutcome = !truth.value.truthful
    ? "challenged_false"
    : truthfulHeart
      ? "challenged_truthful_heart"
      : "challenged_truthful_non_heart";
  return success({
    truthful: truth.value.truthful,
    challenged: true,
    outcome,
    continuesAsDeclared: truthfulHeart,
    revealRequired: true,
    consequences: input.challengerIds.map((playerId) => ({
      playerId,
      effect: truth.value.truthful ? "lose_hp" : "draw",
      amount: 1,
    })),
  });
}

export interface GuidaoCostInput {
  readonly skillOwnerId: PlayerId;
  readonly card: WindCardSnapshot;
  readonly hongyan: HongyanContext | null;
}

export type GuidaoIneligibleReason = "card_not_owned_physical_hand_or_equipment" | "card_not_effective_black";

export interface GuidaoCostDecision {
  readonly eligible: boolean;
  readonly reason: GuidaoIneligibleReason | null;
  readonly effectiveSuit: CardSuit;
  readonly effectiveColor: WindCardColor;
  readonly modifiedByHongyan: boolean;
}

export function evaluateGuidaoCost(input: GuidaoCostInput): WindRuleResult<GuidaoCostDecision> {
  if (!isRecord(input)
    || !isNonEmptyId(input.skillOwnerId)
    || !isValidCardSnapshot(input.card)
    || !isValidHongyanContext(input.hongyan)
  ) return invalid("guidao input is invalid");
  const suit = resolveSuit(input.card.printedSuit, input.card.ownerId, input.hongyan);
  const result = (eligible: boolean, reason: GuidaoIneligibleReason | null): WindRuleResult<GuidaoCostDecision> => success({
    eligible,
    reason,
    effectiveSuit: suit.effectiveSuit,
    effectiveColor: suit.effectiveColor,
    modifiedByHongyan: suit.modified,
  });
  if (!input.card.physical
    || input.card.ownerId !== input.skillOwnerId
    || (input.card.zone !== "hand" && input.card.zone !== "equipment")
  ) return result(false, "card_not_owned_physical_hand_or_equipment");
  if (suit.effectiveColor !== "black") return result(false, "card_not_effective_black");
  return result(true, null);
}
