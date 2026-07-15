import type {
  CardCategory,
  CardId,
  CardKind,
  CardRank,
  CardSuit,
  CardUseMethod,
  EquipmentSlot,
  Faction,
  Gender,
  PlayerId,
  TurnPhase,
} from "../types.js";

/** Exact repository scope: the two mythic cards printed with Forest stay in the God pack. */
export const FOREST_GENERAL_IDS = Object.freeze([
  "cao_pi", "dong_zhuo", "jia_xu", "lu_su", "meng_huo", "sun_jian", "xu_huang", "zhu_rong",
] as const);

export const FOREST_SKILL_IDS = Object.freeze([
  "xingshang", "fangzhu", "songwei",
  "jiuchi", "roulin", "benghuai", "baonue",
  "wansha", "luanwu", "weimu",
  "haoshi", "dimeng",
  "huoshou", "zaiqi",
  "yinghun", "duanliang", "juxiang", "lieren",
] as const);

/** Decisions where the old Java body, its text, and the 2010 FAQ do not all agree. */
export const FOREST_RULE_DECISIONS = Object.freeze({
  xingshang: "claim_all_hand_equipment_judgment_cards_atomically_before_death_rewards; exclude_extra_piles",
  fangzhu: "once_per_damage_event; draw_lost_hp_then_toggle_face",
  baonue: "other_qun_source_may_judge_even_when_lord_full; once_per_damage_event",
  zaiqi: "reveal_lost_hp_cards_without_plus_one; only_printed_hearts_recover",
  juxiang: "mandatory_immunity_and_claim_despite_java_hasJuXiang_returning_false",
  lieren: "once_per_slash_caused_damage_event_including_chain; gain_from_hand_or_equipment",
} as const);

export type ForestCardColor = "red" | "black";
export type ForestCardZone =
  | "hand"
  | "equipment"
  | "judgment"
  | "draw_pile"
  | "discard_pile"
  | "processing"
  | "extra_pile";

export interface ForestRuleCard {
  readonly id: CardId;
  readonly kind: CardKind;
  readonly category: CardCategory;
  readonly printedSuit: CardSuit;
  readonly rank: CardRank;
  readonly ownerId: PlayerId | null;
  readonly zone: ForestCardZone;
  readonly equipmentSlot: EquipmentSlot | null;
  readonly physical: boolean;
}

export interface ForestSkillContext {
  readonly ownerId: PlayerId;
  readonly ownerAlive: boolean;
  readonly skillEffective: boolean;
}

export interface ForestPlayContext extends ForestSkillContext {
  readonly currentPlayerId: PlayerId;
  readonly phase: TurnPhase;
}

export type ForestRuleFailureCode =
  | "invalid_input"
  | "owner_dead"
  | "skill_not_effective"
  | "wrong_timing"
  | "not_active_player"
  | "invalid_card"
  | "invalid_target"
  | "target_dead"
  | "already_used"
  | "invalid_choice"
  | "condition_not_met"
  | "out_of_range"
  | "insufficient_cards"
  | "private_information_leak";

export type ForestRuleResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: ForestRuleFailureCode; readonly detail: string };

function accept<T>(value: T): ForestRuleResult<T> {
  return { ok: true, value };
}

function reject<T>(code: ForestRuleFailureCode, detail: string): ForestRuleResult<T> {
  return { ok: false, code, detail };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonemptyId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isNonnegativeInteger(value: unknown): value is number {
  return isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isSafeInteger(value) && value > 0;
}

function member<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

const SUITS: readonly CardSuit[] = ["spade", "heart", "club", "diamond"];
const PHASES: readonly TurnPhase[] = ["prepare", "judgment", "draw", "play", "respond", "discard", "end"];
const METHODS: readonly CardUseMethod[] = ["use", "respond", "recast"];
const FACTIONS: readonly Faction[] = ["wei", "shu", "wu", "qun", "god"];
const GENDERS: readonly Gender[] = ["male", "female"];
const ZONES: readonly ForestCardZone[] = [
  "hand", "equipment", "judgment", "draw_pile", "discard_pile", "processing", "extra_pile",
];
const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = ["weapon", "armor", "offensive_horse", "defensive_horse"];

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

function expectedCategory(kind: CardKind): CardCategory {
  if (member(BASIC_KINDS, kind)) return "basic";
  if (member(EQUIPMENT_KINDS, kind)) return "equipment";
  return "trick";
}

function isForestRuleCard(value: unknown): value is ForestRuleCard {
  if (!isRecord(value)
    || !isNonemptyId(value.id)
    || !member(KNOWN_KINDS, value.kind)
    || !member(SUITS, value.printedSuit)
    || !isPositiveInteger(value.rank)
    || value.rank > 13
    || !member(ZONES, value.zone)
    || typeof value.physical !== "boolean"
    || (value.ownerId !== null && !isNonemptyId(value.ownerId))
    || (value.equipmentSlot !== null && !member(EQUIPMENT_SLOTS, value.equipmentSlot))
  ) return false;
  if (value.category !== expectedCategory(value.kind)) return false;
  if ((value.category === "equipment") !== (value.equipmentSlot !== null)) return false;
  if (value.zone === "equipment" && value.category !== "equipment") return false;
  if (["hand", "equipment", "extra_pile"].includes(value.zone) && value.ownerId === null) return false;
  return true;
}

function colorOf(suit: CardSuit): ForestCardColor {
  return suit === "heart" || suit === "diamond" ? "red" : "black";
}

function validateSkillContext(value: unknown): ForestRuleResult<never> | null {
  if (!isRecord(value)
    || !isNonemptyId(value.ownerId)
    || typeof value.ownerAlive !== "boolean"
    || typeof value.skillEffective !== "boolean"
  ) return reject("invalid_input", "skill context is incomplete or malformed");
  if (!value.ownerAlive) return reject("owner_dead", "a dead owner cannot resolve this skill");
  if (!value.skillEffective) return reject("skill_not_effective", "the skill is not currently effective");
  return null;
}

function validatePlayContext(value: unknown): ForestRuleResult<never> | null {
  const skillFailure = validateSkillContext(value);
  if (skillFailure) return skillFailure;
  if (!isRecord(value) || !isNonemptyId(value.currentPlayerId) || !member(PHASES, value.phase)) {
    return reject("invalid_input", "play context is incomplete or malformed");
  }
  if (value.currentPlayerId !== value.ownerId) return reject("not_active_player", "the skill owner is not the current player");
  if (value.phase !== "play") return reject("wrong_timing", "the skill is only legal in the play phase");
  return null;
}

function uniqueIds(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isNonemptyId) && new Set(value).size === value.length;
}

function disjointIds(groups: readonly (readonly string[])[]): boolean {
  const all = groups.flat();
  return new Set(all).size === all.length;
}

// ---------------------------------------------------------------------------
// Cao Pi: Xingshang, Fangzhu, Songwei

export interface XingshangInput {
  readonly context: ForestSkillContext;
  readonly deadPlayerId: PlayerId;
  readonly decision: "claim" | "decline";
  /** Must be false: Cao Pi chooses before privately inspecting the dead hand. */
  readonly privateCardsRevealedBeforeDecision: boolean;
  readonly deadZones: {
    readonly handCardIds: readonly CardId[];
    readonly equipmentCardIds: readonly CardId[];
    readonly judgmentCardIds: readonly CardId[];
    readonly extraPileCardIds: readonly CardId[];
  };
}

export interface XingshangPlan {
  readonly skillId: "xingshang";
  readonly ownerId: PlayerId;
  readonly deadPlayerId: PlayerId;
  readonly claimed: boolean;
  readonly transferCardIds: readonly CardId[];
  readonly excludedExtraPileCardIds: readonly CardId[];
  readonly atomicTransfer: true;
  readonly timing: "before_death_rewards_and_punishments";
}

export function planXingshang(input: XingshangInput): ForestRuleResult<XingshangPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Xingshang input must be an object");
  const contextFailure = validateSkillContext(input.context);
  if (contextFailure) return contextFailure;
  if (!isNonemptyId(input.deadPlayerId) || input.deadPlayerId === input.context.ownerId) {
    return reject("invalid_target", "Xingshang only observes another player's death");
  }
  if (input.decision !== "claim" && input.decision !== "decline") return reject("invalid_choice", "unknown Xingshang decision");
  if (typeof input.privateCardsRevealedBeforeDecision !== "boolean" || !isRecord(input.deadZones)) {
    return reject("invalid_input", "Xingshang death zones are malformed");
  }
  if (input.privateCardsRevealedBeforeDecision) {
    return reject("private_information_leak", "Xingshang must be chosen before inspecting the dead player's private cards");
  }
  const groups = [
    input.deadZones.handCardIds,
    input.deadZones.equipmentCardIds,
    input.deadZones.judgmentCardIds,
    input.deadZones.extraPileCardIds,
  ];
  if (!groups.every(uniqueIds) || !disjointIds(groups)) return reject("invalid_input", "dead-player card zones overlap or contain invalid IDs");
  const transferCardIds = input.decision === "claim"
    ? [...input.deadZones.handCardIds, ...input.deadZones.equipmentCardIds, ...input.deadZones.judgmentCardIds]
    : [];
  return accept({
    skillId: "xingshang",
    ownerId: input.context.ownerId,
    deadPlayerId: input.deadPlayerId,
    claimed: input.decision === "claim",
    transferCardIds,
    excludedExtraPileCardIds: [...input.deadZones.extraPileCardIds],
    atomicTransfer: true,
    timing: "before_death_rewards_and_punishments",
  });
}

export interface FangzhuInput {
  readonly context: ForestSkillContext;
  readonly damageEventAmount: number;
  readonly ownerHp: number;
  readonly ownerMaxHp: number;
  readonly targetId: PlayerId;
  readonly targetAlive: boolean;
  readonly targetFaceUp: boolean;
}

export interface FangzhuPlan {
  readonly skillId: "fangzhu";
  readonly ownerId: PlayerId;
  readonly targetId: PlayerId;
  readonly triggerCountForDamageEvent: 1;
  readonly drawCount: number;
  readonly faceUpBefore: boolean;
  readonly faceUpAfter: boolean;
  readonly sequence: readonly ["draw", "turn_over"];
}

export function planFangzhu(input: FangzhuInput): ForestRuleResult<FangzhuPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Fangzhu input must be an object");
  const contextFailure = validateSkillContext(input.context);
  if (contextFailure) return contextFailure;
  if (!isPositiveInteger(input.damageEventAmount)
    || !isSafeInteger(input.ownerHp)
    || !isPositiveInteger(input.ownerMaxHp)
    || input.ownerHp > input.ownerMaxHp
  ) return reject("invalid_input", "Fangzhu damage or HP facts are invalid");
  if (!isNonemptyId(input.targetId) || typeof input.targetAlive !== "boolean" || typeof input.targetFaceUp !== "boolean") {
    return reject("invalid_input", "Fangzhu target facts are invalid");
  }
  if (input.targetId === input.context.ownerId) return reject("invalid_target", "Fangzhu must target another player");
  if (!input.targetAlive) return reject("target_dead", "Fangzhu cannot target a dead player");
  return accept({
    skillId: "fangzhu",
    ownerId: input.context.ownerId,
    targetId: input.targetId,
    triggerCountForDamageEvent: 1,
    drawCount: input.ownerMaxHp - input.ownerHp,
    faceUpBefore: input.targetFaceUp,
    faceUpAfter: !input.targetFaceUp,
    sequence: ["draw", "turn_over"],
  });
}

export interface SongweiInput {
  readonly context: ForestSkillContext;
  readonly judgedPlayerId: PlayerId;
  readonly judgedPlayerAlive: boolean;
  readonly judgedPlayerFaction: Faction;
  readonly judgmentEffectiveSuit: CardSuit;
  readonly finalJudgmentResult: boolean;
  readonly judgedPlayerInvoked: boolean;
}

export interface SongweiPlan {
  readonly skillId: "songwei";
  readonly ownerId: PlayerId;
  readonly judgedPlayerId: PlayerId;
  readonly eligible: boolean;
  readonly ownerDrawCount: 0 | 1;
  readonly reason: "not_other_wei" | "not_final_black_judgment" | "judged_player_declined" | null;
}

export function evaluateSongwei(input: SongweiInput): ForestRuleResult<SongweiPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Songwei input must be an object");
  const contextFailure = validateSkillContext(input.context);
  if (contextFailure) return contextFailure;
  if (!isNonemptyId(input.judgedPlayerId)
    || typeof input.judgedPlayerAlive !== "boolean"
    || !member(FACTIONS, input.judgedPlayerFaction)
    || !member(SUITS, input.judgmentEffectiveSuit)
    || typeof input.finalJudgmentResult !== "boolean"
    || typeof input.judgedPlayerInvoked !== "boolean"
  ) return reject("invalid_input", "Songwei judgment facts are malformed");
  const result = (eligible: boolean, reason: SongweiPlan["reason"]): ForestRuleResult<SongweiPlan> => accept({
    skillId: "songwei",
    ownerId: input.context.ownerId,
    judgedPlayerId: input.judgedPlayerId,
    eligible,
    ownerDrawCount: eligible ? 1 : 0,
    reason,
  });
  if (!input.judgedPlayerAlive || input.judgedPlayerId === input.context.ownerId || input.judgedPlayerFaction !== "wei") {
    return result(false, "not_other_wei");
  }
  if (!input.finalJudgmentResult || colorOf(input.judgmentEffectiveSuit) !== "black") {
    return result(false, "not_final_black_judgment");
  }
  if (!input.judgedPlayerInvoked) return result(false, "judged_player_declined");
  return result(true, null);
}

// ---------------------------------------------------------------------------
// Dong Zhuo: Jiuchi, Roulin, Benghuai, Baonue

export interface JiuchiInput {
  readonly context: ForestSkillContext;
  readonly method: Exclude<CardUseMethod, "recast">;
  readonly card: ForestRuleCard;
  readonly effectiveSuit: CardSuit;
  /** Supplied by the Wine/card-use controller (play use or dying self-rescue). */
  readonly wineTimingLegal: boolean;
}

export interface JiuchiPlan {
  readonly skillId: "jiuchi";
  readonly ownerId: PlayerId;
  readonly physicalCardId: CardId;
  readonly effectiveKind: "wine";
  readonly method: "use" | "respond";
  readonly retainsSuitAndRank: true;
}

export function evaluateJiuchi(input: JiuchiInput): ForestRuleResult<JiuchiPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Jiuchi input must be an object");
  const contextFailure = validateSkillContext(input.context);
  if (contextFailure) return contextFailure;
  if ((input.method !== "use" && input.method !== "respond")
    || !isForestRuleCard(input.card)
    || !member(SUITS, input.effectiveSuit)
    || typeof input.wineTimingLegal !== "boolean"
  ) return reject("invalid_input", "Jiuchi card-use facts are malformed");
  if (!input.wineTimingLegal) return reject("wrong_timing", "Wine is not legal in the current use or rescue context");
  if (!input.card.physical || input.card.ownerId !== input.context.ownerId || input.card.zone !== "hand") {
    return reject("invalid_card", "Jiuchi requires one physical hand card owned by the skill owner");
  }
  if (input.effectiveSuit !== "spade") return reject("invalid_card", "Jiuchi requires an effective Spade hand card");
  return accept({
    skillId: "jiuchi",
    ownerId: input.context.ownerId,
    physicalCardId: input.card.id,
    effectiveKind: "wine",
    method: input.method,
    retainsSuitAndRank: true,
  });
}

export interface RoulinInput {
  readonly sourceId: PlayerId;
  readonly sourceGender: Gender;
  readonly sourceHasEffectiveRoulin: boolean;
  readonly targetId: PlayerId;
  readonly targetGender: Gender;
  readonly targetHasEffectiveRoulin: boolean;
  readonly baseRequiredDodgeCount: number;
}

export interface RoulinPlan {
  readonly skillId: "roulin";
  readonly applied: boolean;
  readonly requiredDodgeCount: number;
  readonly stacksByMaximumNotAddition: true;
}

export function planRoulinResponses(input: RoulinInput): ForestRuleResult<RoulinPlan> {
  if (!isRecord(input)
    || !isNonemptyId(input.sourceId)
    || !isNonemptyId(input.targetId)
    || input.sourceId === input.targetId
    || !member(GENDERS, input.sourceGender)
    || !member(GENDERS, input.targetGender)
    || typeof input.sourceHasEffectiveRoulin !== "boolean"
    || typeof input.targetHasEffectiveRoulin !== "boolean"
    || !isPositiveInteger(input.baseRequiredDodgeCount)
  ) return reject("invalid_input", "Roulin Slash facts are malformed");
  const applied = (input.sourceHasEffectiveRoulin && input.targetGender === "female")
    || (input.targetHasEffectiveRoulin && input.sourceGender === "female");
  return accept({
    skillId: "roulin",
    applied,
    requiredDodgeCount: applied ? Math.max(2, input.baseRequiredDodgeCount) : input.baseRequiredDodgeCount,
    stacksByMaximumNotAddition: true,
  });
}

export interface BenghuaiTriggerInput {
  readonly context: ForestSkillContext;
  readonly phase: TurnPhase;
  readonly ownerHp: number;
  readonly otherPlayers: readonly {
    readonly id: PlayerId;
    readonly alive: boolean;
    readonly hp: number;
  }[];
}

export interface BenghuaiTriggerDecision {
  readonly skillId: "benghuai";
  readonly ownerId: PlayerId;
  readonly triggered: boolean;
  readonly lowerHpPlayerIds: readonly PlayerId[];
  readonly tiesAtMinimumDoNotTrigger: true;
}

export function evaluateBenghuaiTrigger(input: BenghuaiTriggerInput): ForestRuleResult<BenghuaiTriggerDecision> {
  if (!isRecord(input)) return reject("invalid_input", "Benghuai input must be an object");
  const contextFailure = validateSkillContext(input.context);
  if (contextFailure) return contextFailure;
  if (!member(PHASES, input.phase) || !isSafeInteger(input.ownerHp) || !Array.isArray(input.otherPlayers)) {
    return reject("invalid_input", "Benghuai phase or HP facts are malformed");
  }
  if (input.phase !== "end") return reject("wrong_timing", "Benghuai checks at the start of the end phase");
  const seen = new Set<string>();
  const lower: string[] = [];
  for (const player of input.otherPlayers) {
    if (!isRecord(player)
      || !isNonemptyId(player.id)
      || player.id === input.context.ownerId
      || seen.has(player.id)
      || typeof player.alive !== "boolean"
      || !isSafeInteger(player.hp)
    ) return reject("invalid_input", "Benghuai player snapshot is malformed");
    seen.add(player.id);
    if (player.alive && player.hp < input.ownerHp) lower.push(player.id);
  }
  return accept({
    skillId: "benghuai",
    ownerId: input.context.ownerId,
    triggered: lower.length > 0,
    lowerHpPlayerIds: lower,
    tiesAtMinimumDoNotTrigger: true,
  });
}

export interface BenghuaiChoiceInput {
  readonly hp: number;
  readonly maxHp: number;
  readonly choice: "lose_hp" | "lose_max_hp";
}

export interface BenghuaiChoicePlan {
  readonly skillId: "benghuai";
  readonly choice: "lose_hp" | "lose_max_hp";
  readonly hpBefore: number;
  readonly hpAfter: number;
  readonly maxHpBefore: number;
  readonly maxHpAfter: number;
  readonly hpLossAmount: 0 | 1;
  readonly maxHpLossAmount: 0 | 1;
  readonly hpClampedByMaxHpLoss: number;
  readonly entersDyingFromHpLoss: boolean;
  readonly diesImmediatelyFromZeroMaxHp: boolean;
  readonly startsAnotherDiscardPass: false;
}

export function planBenghuaiChoice(input: BenghuaiChoiceInput): ForestRuleResult<BenghuaiChoicePlan> {
  if (!isRecord(input)
    || !isSafeInteger(input.hp)
    || !isPositiveInteger(input.maxHp)
    || input.hp > input.maxHp
    || (input.choice !== "lose_hp" && input.choice !== "lose_max_hp")
  ) return reject("invalid_input", "Benghuai choice or HP facts are malformed");
  if (input.choice === "lose_hp") {
    const hpAfter = input.hp - 1;
    if (!Number.isSafeInteger(hpAfter)) return reject("invalid_input", "Benghuai HP result is unsafe");
    return accept({
      skillId: "benghuai",
      choice: "lose_hp",
      hpBefore: input.hp,
      hpAfter,
      maxHpBefore: input.maxHp,
      maxHpAfter: input.maxHp,
      hpLossAmount: 1,
      maxHpLossAmount: 0,
      hpClampedByMaxHpLoss: 0,
      entersDyingFromHpLoss: hpAfter <= 0,
      diesImmediatelyFromZeroMaxHp: false,
      startsAnotherDiscardPass: false,
    });
  }
  const maxHpAfter = input.maxHp - 1;
  const hpAfter = maxHpAfter <= 0 ? 0 : Math.min(input.hp, maxHpAfter);
  return accept({
    skillId: "benghuai",
    choice: "lose_max_hp",
    hpBefore: input.hp,
    hpAfter,
    maxHpBefore: input.maxHp,
    maxHpAfter,
    hpLossAmount: 0,
    maxHpLossAmount: 1,
    hpClampedByMaxHpLoss: Math.max(0, input.hp - hpAfter),
    entersDyingFromHpLoss: false,
    diesImmediatelyFromZeroMaxHp: maxHpAfter === 0,
    startsAnotherDiscardPass: false,
  });
}

export interface BaonueTriggerInput {
  readonly context: ForestSkillContext;
  readonly damageSourceId: PlayerId;
  readonly damageSourceAlive: boolean;
  readonly damageSourceFaction: Faction;
  readonly damageEventAmount: number;
  readonly damageSourceInvoked: boolean;
}

export interface BaonueTriggerPlan {
  readonly skillId: "baonue";
  readonly ownerId: PlayerId;
  readonly damageSourceId: PlayerId;
  readonly eligible: boolean;
  readonly judgmentOwnerId: PlayerId | null;
  readonly triggerCountForDamageEvent: 0 | 1;
  readonly reason: "not_other_living_qun_source" | "source_declined" | null;
}

export function evaluateBaonueTrigger(input: BaonueTriggerInput): ForestRuleResult<BaonueTriggerPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Baonue input must be an object");
  const contextFailure = validateSkillContext(input.context);
  if (contextFailure) return contextFailure;
  if (!isNonemptyId(input.damageSourceId)
    || typeof input.damageSourceAlive !== "boolean"
    || !member(FACTIONS, input.damageSourceFaction)
    || !isPositiveInteger(input.damageEventAmount)
    || typeof input.damageSourceInvoked !== "boolean"
  ) return reject("invalid_input", "Baonue damage facts are malformed");
  const result = (eligible: boolean, reason: BaonueTriggerPlan["reason"]): ForestRuleResult<BaonueTriggerPlan> => accept({
    skillId: "baonue",
    ownerId: input.context.ownerId,
    damageSourceId: input.damageSourceId,
    eligible,
    judgmentOwnerId: eligible ? input.damageSourceId : null,
    triggerCountForDamageEvent: eligible ? 1 : 0,
    reason,
  });
  if (!input.damageSourceAlive || input.damageSourceId === input.context.ownerId || input.damageSourceFaction !== "qun") {
    return result(false, "not_other_living_qun_source");
  }
  if (!input.damageSourceInvoked) return result(false, "source_declined");
  return result(true, null);
}

export interface BaonueJudgmentInput {
  readonly ownerHp: number;
  readonly ownerMaxHp: number;
  readonly finalEffectiveSuit: CardSuit;
}

export interface BaonueJudgmentPlan {
  readonly skillId: "baonue";
  readonly succeeded: boolean;
  readonly requestedRecovery: 0 | 1;
  readonly actualRecovery: 0 | 1;
}

export function settleBaonueJudgment(input: BaonueJudgmentInput): ForestRuleResult<BaonueJudgmentPlan> {
  if (!isRecord(input)
    || !isSafeInteger(input.ownerHp)
    || !isPositiveInteger(input.ownerMaxHp)
    || input.ownerHp > input.ownerMaxHp
    || !member(SUITS, input.finalEffectiveSuit)
  ) return reject("invalid_input", "Baonue judgment facts are malformed");
  const succeeded = input.finalEffectiveSuit === "spade";
  return accept({
    skillId: "baonue",
    succeeded,
    requestedRecovery: succeeded ? 1 : 0,
    actualRecovery: succeeded && input.ownerHp < input.ownerMaxHp ? 1 : 0,
  });
}

// ---------------------------------------------------------------------------
// Jia Xu: Wansha, Luanwu, Weimu

export interface WanshaPeachInput {
  readonly context: ForestSkillContext;
  readonly activeTurnPlayerId: PlayerId;
  readonly peachUserId: PlayerId;
  /** The topmost, currently resolving dying frame, not any suspended frame. */
  readonly currentDyingPlayerId: PlayerId;
  readonly effectiveCardKind: CardKind;
}

export interface WanshaPeachDecision {
  readonly skillId: "wansha";
  readonly restrictionActive: boolean;
  readonly allowed: boolean;
  readonly allowedBecause: "wansha_owner" | "current_dying_player" | "restriction_inactive" | null;
}

export function evaluateWanshaPeach(input: WanshaPeachInput): ForestRuleResult<WanshaPeachDecision> {
  if (!isRecord(input)
    || !isRecord(input.context)
    || !isNonemptyId(input.context.ownerId)
    || typeof input.context.ownerAlive !== "boolean"
    || typeof input.context.skillEffective !== "boolean"
    || !isNonemptyId(input.activeTurnPlayerId)
    || !isNonemptyId(input.peachUserId)
    || !isNonemptyId(input.currentDyingPlayerId)
    || !member(KNOWN_KINDS, input.effectiveCardKind)
  ) return reject("invalid_input", "Wansha dying facts are malformed");
  if (input.effectiveCardKind !== "peach") return reject("invalid_card", "Wansha only modifies Peach permission");
  const restrictionActive = input.context.ownerAlive
    && input.context.skillEffective
    && input.activeTurnPlayerId === input.context.ownerId;
  if (!restrictionActive) {
    return accept({ skillId: "wansha", restrictionActive: false, allowed: true, allowedBecause: "restriction_inactive" });
  }
  if (input.peachUserId === input.context.ownerId) {
    return accept({ skillId: "wansha", restrictionActive: true, allowed: true, allowedBecause: "wansha_owner" });
  }
  if (input.peachUserId === input.currentDyingPlayerId) {
    return accept({ skillId: "wansha", restrictionActive: true, allowed: true, allowedBecause: "current_dying_player" });
  }
  return accept({ skillId: "wansha", restrictionActive: true, allowed: false, allowedBecause: null });
}

export interface LuanwuActivationInput {
  readonly context: ForestPlayContext;
  readonly limitedSkillConsumed: boolean;
}

export interface LuanwuActivationPlan {
  readonly skillId: "luanwu";
  readonly ownerId: PlayerId;
  readonly consumeLimitedSkill: true;
  readonly actorOrder: "living_seat_order_after_owner";
  readonly continueAfterOwnerDeath: true;
}

export function evaluateLuanwuActivation(input: LuanwuActivationInput): ForestRuleResult<LuanwuActivationPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Luanwu input must be an object");
  const contextFailure = validatePlayContext(input.context);
  if (contextFailure) return contextFailure;
  if (typeof input.limitedSkillConsumed !== "boolean") return reject("invalid_input", "Luanwu limited state is malformed");
  if (input.limitedSkillConsumed) return reject("already_used", "Luanwu is a once-per-game limited skill");
  return accept({
    skillId: "luanwu",
    ownerId: input.context.ownerId,
    consumeLimitedSkill: true,
    actorOrder: "living_seat_order_after_owner",
    continueAfterOwnerDeath: true,
  });
}

export interface LuanwuCandidate {
  readonly id: PlayerId;
  readonly alive: boolean;
  /** Current authoritative distance from this Luanwu actor. */
  readonly distance: number;
  /** Full Slash legality except for the Luanwu nearest-target restriction. */
  readonly slashTargetLegal: boolean;
}

export interface LuanwuActorInput {
  readonly actorId: PlayerId;
  readonly actorAlive: boolean;
  readonly actorCanProduceSlash: boolean;
  readonly candidates: readonly LuanwuCandidate[];
}

export interface LuanwuActorPlan {
  readonly skillId: "luanwu";
  readonly actorId: PlayerId;
  readonly noActionBecauseGameEnded: boolean;
  readonly minimumDistance: number | null;
  readonly nearestPlayerIds: readonly PlayerId[];
  readonly legalSlashTargetIds: readonly PlayerId[];
  readonly options: readonly ("use_slash" | "lose_hp")[];
  readonly hpLoss: {
    readonly amount: 1;
    readonly sourceId: null;
    readonly isDamage: false;
  } | null;
  readonly slash: {
    readonly method: "use";
    readonly consumesPlayPhaseSlashQuota: false;
    readonly targetMustHaveMinimumDistance: true;
    readonly ordinaryWeaponEffectsAllowed: true;
    readonly zhugeLianNuEffectAllowed: false;
  } | null;
}

export function planLuanwuActor(input: LuanwuActorInput): ForestRuleResult<LuanwuActorPlan> {
  if (!isRecord(input)
    || !isNonemptyId(input.actorId)
    || typeof input.actorAlive !== "boolean"
    || typeof input.actorCanProduceSlash !== "boolean"
    || !Array.isArray(input.candidates)
  ) return reject("invalid_input", "Luanwu actor facts are malformed");
  const seen = new Set<string>();
  const living: LuanwuCandidate[] = [];
  for (const candidate of input.candidates) {
    if (!isRecord(candidate)
      || !isNonemptyId(candidate.id)
      || candidate.id === input.actorId
      || seen.has(candidate.id)
      || typeof candidate.alive !== "boolean"
      || !isPositiveInteger(candidate.distance)
      || typeof candidate.slashTargetLegal !== "boolean"
    ) return reject("invalid_input", "Luanwu candidate facts are malformed");
    seen.add(candidate.id);
    if (candidate.alive) living.push({
      id: candidate.id,
      alive: true,
      distance: candidate.distance,
      slashTargetLegal: candidate.slashTargetLegal,
    });
  }
  if (!input.actorAlive || living.length === 0) {
    return accept({
      skillId: "luanwu",
      actorId: input.actorId,
      noActionBecauseGameEnded: true,
      minimumDistance: null,
      nearestPlayerIds: [],
      legalSlashTargetIds: [],
      options: [],
      hpLoss: null,
      slash: null,
    });
  }
  const minimumDistance = Math.min(...living.map((candidate) => candidate.distance));
  const nearest = living.filter((candidate) => candidate.distance === minimumDistance);
  const legalTargets = nearest.filter((candidate) => candidate.slashTargetLegal).map((candidate) => candidate.id);
  const canUseSlash = input.actorCanProduceSlash && legalTargets.length > 0;
  return accept({
    skillId: "luanwu",
    actorId: input.actorId,
    noActionBecauseGameEnded: false,
    minimumDistance,
    nearestPlayerIds: nearest.map((candidate) => candidate.id),
    legalSlashTargetIds: canUseSlash ? legalTargets : [],
    options: canUseSlash ? ["use_slash", "lose_hp"] : ["lose_hp"],
    hpLoss: { amount: 1, sourceId: null, isDamage: false },
    slash: canUseSlash ? {
      method: "use",
      consumesPlayPhaseSlashQuota: false,
      targetMustHaveMinimumDistance: true,
      ordinaryWeaponEffectsAllowed: true,
      zhugeLianNuEffectAllowed: false,
    } : null,
  });
}

export type WeimuTargetingMode =
  | "direct_target"
  | "global_auto_target"
  | "delayed_trick_transfer"
  | "nullification_targets_card"
  | "damage_redirect"
  | "color_revealed_after_target_confirmation";

export interface WeimuInput {
  readonly context: ForestSkillContext;
  readonly candidateTargetId: PlayerId;
  readonly cardCategory: CardCategory;
  readonly effectiveSuit: CardSuit;
  readonly targetingMode: WeimuTargetingMode;
}

export interface WeimuDecision {
  readonly skillId: "weimu";
  readonly prohibited: boolean;
  readonly effectiveColor: ForestCardColor;
  readonly reason: "black_trick_target" | "not_a_character_target_designation" | "not_black_trick";
}

export function evaluateWeimuTarget(input: WeimuInput): ForestRuleResult<WeimuDecision> {
  const targetingModes: readonly WeimuTargetingMode[] = [
    "direct_target", "global_auto_target", "delayed_trick_transfer",
    "nullification_targets_card", "damage_redirect", "color_revealed_after_target_confirmation",
  ];
  if (!isRecord(input)) return reject("invalid_input", "Weimu input must be an object");
  const contextFailure = validateSkillContext(input.context);
  if (contextFailure) return contextFailure;
  if (!isNonemptyId(input.candidateTargetId)
    || (input.cardCategory !== "basic" && input.cardCategory !== "trick" && input.cardCategory !== "equipment")
    || !member(SUITS, input.effectiveSuit)
    || !member(targetingModes, input.targetingMode)
  ) return reject("invalid_input", "Weimu target facts are malformed");
  if (input.candidateTargetId !== input.context.ownerId) return reject("invalid_target", "Weimu query must concern its owner");
  const characterDesignation = input.targetingMode === "direct_target"
    || input.targetingMode === "global_auto_target"
    || input.targetingMode === "delayed_trick_transfer";
  if (!characterDesignation) {
    return accept({
      skillId: "weimu",
      prohibited: false,
      effectiveColor: colorOf(input.effectiveSuit),
      reason: "not_a_character_target_designation",
    });
  }
  const prohibited = input.cardCategory === "trick" && colorOf(input.effectiveSuit) === "black";
  return accept({
    skillId: "weimu",
    prohibited,
    effectiveColor: colorOf(input.effectiveSuit),
    reason: prohibited ? "black_trick_target" : "not_black_trick",
  });
}

// ---------------------------------------------------------------------------
// Lu Su: Haoshi, Dimeng

export interface HaoshiActivationInput {
  readonly context: ForestSkillContext;
  readonly phase: TurnPhase;
  readonly drawPhaseAvailable: boolean;
}

export interface HaoshiActivationPlan {
  readonly skillId: "haoshi";
  readonly ownerId: PlayerId;
  readonly additionalDrawCount: 2;
  readonly normalDrawPreserved: true;
  readonly decisionOccursBeforeDrawing: true;
}

export function evaluateHaoshiActivation(input: HaoshiActivationInput): ForestRuleResult<HaoshiActivationPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Haoshi input must be an object");
  const contextFailure = validateSkillContext(input.context);
  if (contextFailure) return contextFailure;
  if (!member(PHASES, input.phase) || typeof input.drawPhaseAvailable !== "boolean") {
    return reject("invalid_input", "Haoshi draw-phase facts are malformed");
  }
  if (input.phase !== "draw" || !input.drawPhaseAvailable) return reject("wrong_timing", "Haoshi requires an available draw phase");
  return accept({
    skillId: "haoshi",
    ownerId: input.context.ownerId,
    additionalDrawCount: 2,
    normalDrawPreserved: true,
    decisionOccursBeforeDrawing: true,
  });
}

export interface HaoshiTransferAnalysisInput {
  readonly ownerId: PlayerId;
  readonly ownerHandCardIds: readonly CardId[];
  readonly otherPlayers: readonly {
    readonly id: PlayerId;
    readonly alive: boolean;
    readonly handCount: number;
  }[];
}

export interface HaoshiTransferAnalysis {
  readonly skillId: "haoshi";
  readonly transferRequired: boolean;
  readonly giveCount: number;
  readonly minimumOtherHandCount: number | null;
  readonly eligibleTargetIds: readonly PlayerId[];
}

export function analyzeHaoshiTransfer(input: HaoshiTransferAnalysisInput): ForestRuleResult<HaoshiTransferAnalysis> {
  if (!isRecord(input) || !isNonemptyId(input.ownerId) || !uniqueIds(input.ownerHandCardIds) || !Array.isArray(input.otherPlayers)) {
    return reject("invalid_input", "Haoshi transfer snapshot is malformed");
  }
  const seen = new Set<string>();
  const living: { id: string; handCount: number }[] = [];
  for (const player of input.otherPlayers) {
    if (!isRecord(player)
      || !isNonemptyId(player.id)
      || player.id === input.ownerId
      || seen.has(player.id)
      || typeof player.alive !== "boolean"
      || !isNonnegativeInteger(player.handCount)
    ) return reject("invalid_input", "Haoshi target snapshot is malformed");
    seen.add(player.id);
    if (player.alive) living.push({ id: player.id, handCount: player.handCount });
  }
  const transferRequired = input.ownerHandCardIds.length > 5;
  if (!transferRequired) {
    return accept({ skillId: "haoshi", transferRequired: false, giveCount: 0, minimumOtherHandCount: null, eligibleTargetIds: [] });
  }
  if (living.length === 0) return reject("invalid_target", "mandatory Haoshi transfer has no living other target");
  const minimum = Math.min(...living.map((player) => player.handCount));
  return accept({
    skillId: "haoshi",
    transferRequired: true,
    giveCount: Math.floor(input.ownerHandCardIds.length / 2),
    minimumOtherHandCount: minimum,
    eligibleTargetIds: living.filter((player) => player.handCount === minimum).map((player) => player.id),
  });
}

export interface HaoshiTransferChoiceInput extends HaoshiTransferAnalysisInput {
  readonly selectedTargetId: PlayerId;
  readonly selectedCardIds: readonly CardId[];
}

export interface HaoshiTransferPlan extends HaoshiTransferAnalysis {
  readonly targetId: PlayerId;
  readonly transferCardIds: readonly CardId[];
  readonly atomicTransfer: true;
}

export function validateHaoshiTransferChoice(input: HaoshiTransferChoiceInput): ForestRuleResult<HaoshiTransferPlan> {
  if (!isRecord(input) || !isNonemptyId(input.selectedTargetId) || !uniqueIds(input.selectedCardIds)) {
    return reject("invalid_input", "Haoshi transfer choice is malformed");
  }
  const analysisResult = analyzeHaoshiTransfer(input);
  if (!analysisResult.ok) return analysisResult;
  const analysis = analysisResult.value;
  if (!analysis.transferRequired) return reject("condition_not_met", "Haoshi transfer is not required at five or fewer hand cards");
  if (!analysis.eligibleTargetIds.includes(input.selectedTargetId)) {
    return reject("invalid_target", "Haoshi target must have the minimum hand count among other living players");
  }
  if (input.selectedCardIds.length !== analysis.giveCount
    || input.selectedCardIds.some((cardId) => !input.ownerHandCardIds.includes(cardId))
  ) return reject("invalid_choice", "Haoshi must transfer exactly floor(half) of the owner's current hand");
  return accept({
    ...analysis,
    targetId: input.selectedTargetId,
    transferCardIds: [...input.selectedCardIds],
    atomicTransfer: true,
  });
}

export interface DimengTargetSnapshot {
  readonly id: PlayerId;
  readonly alive: boolean;
  readonly handCardIds: readonly CardId[];
}

export interface DimengInput {
  readonly context: ForestPlayContext;
  readonly useCountThisPlayPhase: number;
  readonly targetA: DimengTargetSnapshot;
  readonly targetB: DimengTargetSnapshot;
  readonly ownerDiscardableCards: readonly ForestRuleCard[];
  readonly selectedCostCardIds: readonly CardId[];
}

export interface DimengMove {
  readonly cardId: CardId;
  readonly fromPlayerId: PlayerId;
  readonly toPlayerId: PlayerId;
}

export interface DimengPlan {
  readonly skillId: "dimeng";
  readonly ownerId: PlayerId;
  readonly targetIds: readonly [PlayerId, PlayerId];
  readonly consumePlayPhaseUse: true;
  readonly costCount: number;
  readonly discardCardIds: readonly CardId[];
  readonly handSwapMoves: readonly DimengMove[];
  readonly atomicHandSwap: true;
  /** These players lost their complete original hand, even if the same batch gives them cards. */
  readonly lostAllOriginalHandPlayerIds: readonly PlayerId[];
}

export function planDimeng(input: DimengInput): ForestRuleResult<DimengPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Dimeng input must be an object");
  const contextFailure = validatePlayContext(input.context);
  if (contextFailure) return contextFailure;
  if (!isNonnegativeInteger(input.useCountThisPlayPhase)
    || !isRecord(input.targetA)
    || !isRecord(input.targetB)
    || !Array.isArray(input.ownerDiscardableCards)
    || !uniqueIds(input.selectedCostCardIds)
  ) return reject("invalid_input", "Dimeng snapshots are malformed");
  if (input.useCountThisPlayPhase !== 0) return reject("already_used", "Dimeng is limited to once per play phase");
  for (const target of [input.targetA, input.targetB]) {
    if (!isNonemptyId(target.id) || typeof target.alive !== "boolean" || !uniqueIds(target.handCardIds)) {
      return reject("invalid_input", "Dimeng target hand snapshot is malformed");
    }
    if (!target.alive) return reject("target_dead", "Dimeng targets must both be alive");
    if (target.id === input.context.ownerId) return reject("invalid_target", "Dimeng cannot target its owner");
  }
  if (input.targetA.id === input.targetB.id || !disjointIds([input.targetA.handCardIds, input.targetB.handCardIds])) {
    return reject("invalid_target", "Dimeng requires two distinct targets with disjoint physical hands");
  }
  const discardable = new Map<string, ForestRuleCard>();
  for (const card of input.ownerDiscardableCards) {
    if (!isForestRuleCard(card)
      || !card.physical
      || card.ownerId !== input.context.ownerId
      || (card.zone !== "hand" && card.zone !== "equipment")
      || discardable.has(card.id)
    ) return reject("invalid_card", "Dimeng cost pool must contain unique owned hand/equipment cards");
    discardable.set(card.id, card);
  }
  const costCount = Math.abs(input.targetA.handCardIds.length - input.targetB.handCardIds.length);
  if (input.selectedCostCardIds.length !== costCount
    || input.selectedCostCardIds.some((cardId) => !discardable.has(cardId))
  ) return reject(costCount > discardable.size ? "insufficient_cards" : "invalid_choice", "Dimeng cost must equal the targets' hand-count difference");
  return accept({
    skillId: "dimeng",
    ownerId: input.context.ownerId,
    targetIds: [input.targetA.id, input.targetB.id],
    consumePlayPhaseUse: true,
    costCount,
    discardCardIds: [...input.selectedCostCardIds],
    handSwapMoves: [
      ...input.targetA.handCardIds.map((cardId) => ({ cardId, fromPlayerId: input.targetA.id, toPlayerId: input.targetB.id })),
      ...input.targetB.handCardIds.map((cardId) => ({ cardId, fromPlayerId: input.targetB.id, toPlayerId: input.targetA.id })),
    ],
    atomicHandSwap: true,
    lostAllOriginalHandPlayerIds: [input.targetA, input.targetB]
      .filter((target) => target.handCardIds.length > 0)
      .map((target) => target.id),
  });
}

// ---------------------------------------------------------------------------
// Meng Huo: Huoshou, Zaiqi

export interface HuoshouOwnerSnapshot {
  readonly id: PlayerId;
  readonly alive: boolean;
  readonly skillEffective: boolean;
}

export interface HuoshouBindingInput {
  readonly originalCardUserId: PlayerId | null;
  /** Already in authoritative same-timing priority order. */
  readonly huoshouOwners: readonly HuoshouOwnerSnapshot[];
}

export interface HuoshouSourceBinding {
  readonly skillId: "huoshou";
  readonly originalCardUserId: PlayerId | null;
  readonly boundHuoshouOwnerId: PlayerId | null;
  readonly initiallyResolvedDamageSourceId: PlayerId | null;
  readonly bindingPersistsForEntireCardUse: true;
}

export function bindHuoshouSource(input: HuoshouBindingInput): ForestRuleResult<HuoshouSourceBinding> {
  if (!isRecord(input)
    || (input.originalCardUserId !== null && !isNonemptyId(input.originalCardUserId))
    || !Array.isArray(input.huoshouOwners)
  ) return reject("invalid_input", "Huoshou source facts are malformed");
  const seen = new Set<string>();
  let boundOwnerId: string | null = null;
  for (const owner of input.huoshouOwners) {
    if (!isRecord(owner)
      || !isNonemptyId(owner.id)
      || seen.has(owner.id)
      || typeof owner.alive !== "boolean"
      || typeof owner.skillEffective !== "boolean"
    ) return reject("invalid_input", "Huoshou owner priority list is malformed");
    seen.add(owner.id);
    if (boundOwnerId === null && owner.alive && owner.skillEffective) boundOwnerId = owner.id;
  }
  return accept({
    skillId: "huoshou",
    originalCardUserId: input.originalCardUserId,
    boundHuoshouOwnerId: boundOwnerId,
    initiallyResolvedDamageSourceId: boundOwnerId ?? input.originalCardUserId,
    bindingPersistsForEntireCardUse: true,
  });
}

export interface HuoshouDamageSourceInput {
  readonly binding: HuoshouSourceBinding;
  readonly boundOwnerStillAlive: boolean;
}

export interface HuoshouDamageSourceDecision {
  readonly skillId: "huoshou";
  readonly damageSourceId: PlayerId | null;
  readonly fellBackToOriginalUser: boolean;
}

export function resolveHuoshouDamageSource(input: HuoshouDamageSourceInput): ForestRuleResult<HuoshouDamageSourceDecision> {
  if (!isRecord(input)
    || !isRecord(input.binding)
    || input.binding.skillId !== "huoshou"
    || (input.binding.originalCardUserId !== null && !isNonemptyId(input.binding.originalCardUserId))
    || (input.binding.boundHuoshouOwnerId !== null && !isNonemptyId(input.binding.boundHuoshouOwnerId))
    || input.binding.bindingPersistsForEntireCardUse !== true
    || typeof input.boundOwnerStillAlive !== "boolean"
  ) return reject("invalid_input", "Huoshou binding is malformed");
  if (input.binding.boundHuoshouOwnerId === null) {
    return accept({
      skillId: "huoshou",
      damageSourceId: input.binding.originalCardUserId,
      fellBackToOriginalUser: true,
    });
  }
  return accept({
    skillId: "huoshou",
    damageSourceId: input.boundOwnerStillAlive ? input.binding.boundHuoshouOwnerId : null,
    fellBackToOriginalUser: false,
  });
}

export interface NanmanImmunityInput {
  readonly targetId: PlayerId;
  readonly targetAlive: boolean;
  readonly targetHasEffectiveSkill: boolean;
  readonly effectiveCardKind: CardKind;
}

export interface NanmanImmunityDecision {
  readonly immune: boolean;
  readonly preventsCardEffectOnly: true;
  readonly doesNotPreventRedirectedDamage: true;
}

export function evaluateHuoshouImmunity(input: NanmanImmunityInput): ForestRuleResult<NanmanImmunityDecision> {
  return evaluateNanmanImmunity(input);
}

export function evaluateJuxiangImmunity(input: NanmanImmunityInput): ForestRuleResult<NanmanImmunityDecision> {
  return evaluateNanmanImmunity(input);
}

function evaluateNanmanImmunity(input: NanmanImmunityInput): ForestRuleResult<NanmanImmunityDecision> {
  if (!isRecord(input)
    || !isNonemptyId(input.targetId)
    || typeof input.targetAlive !== "boolean"
    || typeof input.targetHasEffectiveSkill !== "boolean"
    || !member(KNOWN_KINDS, input.effectiveCardKind)
  ) return reject("invalid_input", "Nanman immunity facts are malformed");
  return accept({
    immune: input.targetAlive && input.targetHasEffectiveSkill && input.effectiveCardKind === "barbarian_invasion",
    preventsCardEffectOnly: true,
    doesNotPreventRedirectedDamage: true,
  });
}

export interface ZaiqiActivationInput {
  readonly context: ForestSkillContext;
  readonly phase: TurnPhase;
  readonly drawPhaseAvailable: boolean;
  readonly ownerHp: number;
  readonly ownerMaxHp: number;
}

export interface ZaiqiActivationPlan {
  readonly skillId: "zaiqi";
  readonly ownerId: PlayerId;
  readonly replacesNormalDraw: true;
  readonly revealCount: number;
  readonly formula: "lost_hp_without_plus_one";
}

export function evaluateZaiqiActivation(input: ZaiqiActivationInput): ForestRuleResult<ZaiqiActivationPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Zaiqi input must be an object");
  const contextFailure = validateSkillContext(input.context);
  if (contextFailure) return contextFailure;
  if (!member(PHASES, input.phase)
    || typeof input.drawPhaseAvailable !== "boolean"
    || !isSafeInteger(input.ownerHp)
    || !isPositiveInteger(input.ownerMaxHp)
    || input.ownerHp > input.ownerMaxHp
  ) return reject("invalid_input", "Zaiqi draw or HP facts are malformed");
  if (input.phase !== "draw" || !input.drawPhaseAvailable) return reject("wrong_timing", "Zaiqi requires an available draw phase");
  const lostHp = input.ownerMaxHp - input.ownerHp;
  if (lostHp <= 0) return reject("condition_not_met", "Zaiqi requires its owner to be wounded");
  return accept({
    skillId: "zaiqi",
    ownerId: input.context.ownerId,
    replacesNormalDraw: true,
    revealCount: lostHp,
    formula: "lost_hp_without_plus_one",
  });
}

export interface ZaiqiRevealedCard {
  readonly id: CardId;
  readonly printedSuit: CardSuit;
}

export interface ZaiqiSettlementInput {
  readonly ownerId: PlayerId;
  readonly ownerHp: number;
  readonly ownerMaxHp: number;
  readonly revealedCards: readonly ZaiqiRevealedCard[];
}

export interface ZaiqiSettlementPlan {
  readonly skillId: "zaiqi";
  readonly ownerId: PlayerId;
  readonly expectedRevealCount: number;
  readonly heartCardIds: readonly CardId[];
  readonly discardCardIds: readonly CardId[];
  readonly gainCardIds: readonly CardId[];
  readonly recoverySteps: readonly { readonly cardId: CardId; readonly requested: 1; readonly actual: 0 | 1 }[];
  readonly onlyPrintedHeartsCount: true;
}

export function planZaiqiSettlement(input: ZaiqiSettlementInput): ForestRuleResult<ZaiqiSettlementPlan> {
  if (!isRecord(input)
    || !isNonemptyId(input.ownerId)
    || !isSafeInteger(input.ownerHp)
    || !isPositiveInteger(input.ownerMaxHp)
    || input.ownerHp > input.ownerMaxHp
    || !Array.isArray(input.revealedCards)
  ) return reject("invalid_input", "Zaiqi settlement facts are malformed");
  const expected = input.ownerMaxHp - input.ownerHp;
  if (expected <= 0 || input.revealedCards.length !== expected) {
    return reject("invalid_choice", "Zaiqi must settle exactly lost-HP cards");
  }
  const seen = new Set<string>();
  for (const card of input.revealedCards) {
    if (!isRecord(card) || !isNonemptyId(card.id) || seen.has(card.id) || !member(SUITS, card.printedSuit)) {
      return reject("invalid_input", "Zaiqi revealed cards are malformed");
    }
    seen.add(card.id);
  }
  const hearts = input.revealedCards.filter((card) => card.printedSuit === "heart");
  let currentHp = input.ownerHp;
  const recoverySteps = hearts.map((card) => {
    const actual: 0 | 1 = currentHp < input.ownerMaxHp ? 1 : 0;
    currentHp += actual;
    return { cardId: card.id, requested: 1 as const, actual };
  });
  return accept({
    skillId: "zaiqi",
    ownerId: input.ownerId,
    expectedRevealCount: expected,
    heartCardIds: hearts.map((card) => card.id),
    discardCardIds: hearts.map((card) => card.id),
    gainCardIds: input.revealedCards.filter((card) => card.printedSuit !== "heart").map((card) => card.id),
    recoverySteps,
    onlyPrintedHeartsCount: true,
  });
}

// ---------------------------------------------------------------------------
// Sun Jian: Yinghun

export type YinghunMode = "draw_x_discard_one" | "draw_one_discard_x";

export interface YinghunInput {
  readonly context: ForestSkillContext;
  readonly phase: TurnPhase;
  readonly ownerHp: number;
  readonly ownerMaxHp: number;
  readonly targetId: PlayerId;
  readonly targetAlive: boolean;
  readonly mode: YinghunMode;
}

export interface YinghunPlan {
  readonly skillId: "yinghun";
  readonly ownerId: PlayerId;
  readonly targetId: PlayerId;
  readonly lostHp: number;
  readonly mode: YinghunMode;
  readonly drawCount: number;
  readonly requestedDiscardCount: number;
  readonly discardZones: readonly ["hand", "equipment"];
  readonly sequence: readonly ["draw", "discard_batch"];
}

export function planYinghun(input: YinghunInput): ForestRuleResult<YinghunPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Yinghun input must be an object");
  const contextFailure = validateSkillContext(input.context);
  if (contextFailure) return contextFailure;
  if (!member(PHASES, input.phase)
    || !isSafeInteger(input.ownerHp)
    || !isPositiveInteger(input.ownerMaxHp)
    || input.ownerHp > input.ownerMaxHp
    || !isNonemptyId(input.targetId)
    || typeof input.targetAlive !== "boolean"
    || (input.mode !== "draw_x_discard_one" && input.mode !== "draw_one_discard_x")
  ) return reject("invalid_input", "Yinghun phase, HP, target, or mode is malformed");
  if (input.phase !== "prepare") return reject("wrong_timing", "Yinghun triggers in the prepare phase");
  const lostHp = input.ownerMaxHp - input.ownerHp;
  if (lostHp <= 0) return reject("condition_not_met", "Yinghun requires a wounded owner");
  if (input.targetId === input.context.ownerId) return reject("invalid_target", "Yinghun must target another player");
  if (!input.targetAlive) return reject("target_dead", "Yinghun cannot target a dead player");
  return accept({
    skillId: "yinghun",
    ownerId: input.context.ownerId,
    targetId: input.targetId,
    lostHp,
    mode: input.mode,
    drawCount: input.mode === "draw_x_discard_one" ? lostHp : 1,
    requestedDiscardCount: input.mode === "draw_x_discard_one" ? 1 : lostHp,
    discardZones: ["hand", "equipment"],
    sequence: ["draw", "discard_batch"],
  });
}

export interface YinghunDiscardInput {
  readonly targetId: PlayerId;
  readonly requestedDiscardCount: number;
  /** Snapshot after Yinghun's draw step and before the one atomic discard. */
  readonly availableCards: readonly ForestRuleCard[];
  readonly selectedCardIds: readonly CardId[];
}

export interface YinghunDiscardPlan {
  readonly skillId: "yinghun";
  readonly targetId: PlayerId;
  readonly requestedDiscardCount: number;
  readonly actualDiscardCount: number;
  readonly discardCardIds: readonly CardId[];
  readonly unfulfilledDiscardCount: number;
  readonly atomicSingleBatch: true;
  readonly noFurtherDiscardAfterBatchTriggers: true;
}

export function planYinghunDiscard(input: YinghunDiscardInput): ForestRuleResult<YinghunDiscardPlan> {
  if (!isRecord(input)
    || !isNonemptyId(input.targetId)
    || !isPositiveInteger(input.requestedDiscardCount)
    || !Array.isArray(input.availableCards)
    || !uniqueIds(input.selectedCardIds)
  ) return reject("invalid_input", "Yinghun discard facts are malformed");
  const available = new Map<string, ForestRuleCard>();
  for (const card of input.availableCards) {
    if (!isForestRuleCard(card)
      || !card.physical
      || card.ownerId !== input.targetId
      || (card.zone !== "hand" && card.zone !== "equipment")
      || available.has(card.id)
    ) return reject("invalid_card", "Yinghun may discard only unique target hand/equipment cards");
    available.set(card.id, card);
  }
  const actualDiscardCount = Math.min(input.requestedDiscardCount, available.size);
  if (input.selectedCardIds.length !== actualDiscardCount
    || input.selectedCardIds.some((cardId) => !available.has(cardId))
  ) return reject("invalid_choice", "Yinghun must discard the requested number or every available card");
  return accept({
    skillId: "yinghun",
    targetId: input.targetId,
    requestedDiscardCount: input.requestedDiscardCount,
    actualDiscardCount,
    discardCardIds: [...input.selectedCardIds],
    unfulfilledDiscardCount: input.requestedDiscardCount - actualDiscardCount,
    atomicSingleBatch: true,
    noFurtherDiscardAfterBatchTriggers: true,
  });
}

// ---------------------------------------------------------------------------
// Xu Huang: Duanliang

export interface DuanliangInput {
  readonly context: ForestPlayContext;
  readonly card: ForestRuleCard;
  readonly effectiveSuit: CardSuit;
  readonly targetId: PlayerId;
  readonly targetAlive: boolean;
  readonly distance: number;
  /** Normal Supply Shortage target legality with only its distance cap omitted. */
  readonly targetLegalIgnoringDistance: boolean;
  readonly targetAlreadyHasSupplyShortage: boolean;
}

export interface DuanliangPlan {
  readonly skillId: "duanliang";
  readonly ownerId: PlayerId;
  readonly targetId: PlayerId;
  readonly physicalCardId: CardId;
  readonly effectiveKind: "bing_liang_cun_duan";
  readonly maximumDistance: 2;
  readonly retainsPhysicalSuitAndRank: true;
  readonly unlimitedUsesPerPlayPhase: true;
}

export function evaluateDuanliang(input: DuanliangInput): ForestRuleResult<DuanliangPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Duanliang input must be an object");
  const contextFailure = validatePlayContext(input.context);
  if (contextFailure) return contextFailure;
  if (!isForestRuleCard(input.card)
    || !member(SUITS, input.effectiveSuit)
    || !isNonemptyId(input.targetId)
    || typeof input.targetAlive !== "boolean"
    || !isPositiveInteger(input.distance)
    || typeof input.targetLegalIgnoringDistance !== "boolean"
    || typeof input.targetAlreadyHasSupplyShortage !== "boolean"
  ) return reject("invalid_input", "Duanliang card or target facts are malformed");
  if (!input.card.physical
    || input.card.ownerId !== input.context.ownerId
    || (input.card.zone !== "hand" && input.card.zone !== "equipment")
    || (input.card.category !== "basic" && input.card.category !== "equipment")
    || colorOf(input.effectiveSuit) !== "black"
  ) return reject("invalid_card", "Duanliang requires an effective-black owned basic/equipment card from hand or equipment");
  if (input.targetId === input.context.ownerId || !input.targetLegalIgnoringDistance || input.targetAlreadyHasSupplyShortage) {
    return reject("invalid_target", "Duanliang target violates normal Supply Shortage legality");
  }
  if (!input.targetAlive) return reject("target_dead", "Duanliang cannot target a dead player");
  if (input.distance > 2) return reject("out_of_range", "Duanliang extends Supply Shortage only to distance two");
  return accept({
    skillId: "duanliang",
    ownerId: input.context.ownerId,
    targetId: input.targetId,
    physicalCardId: input.card.id,
    effectiveKind: "bing_liang_cun_duan",
    maximumDistance: 2,
    retainsPhysicalSuitAndRank: true,
    unlimitedUsesPerPlayPhase: true,
  });
}

// ---------------------------------------------------------------------------
// Zhu Rong: Juxiang, Lieren

export interface JuxiangClaimInput {
  readonly context: ForestSkillContext;
  readonly cardUserId: PlayerId;
  readonly effectiveCardKind: CardKind;
  readonly physicalCards: readonly ForestRuleCard[];
  readonly cardStillInProcessing: boolean;
  readonly wouldOtherwiseEnterDiscard: boolean;
  readonly claimedByEarlierJuxiang: boolean;
}

export interface JuxiangClaimPlan {
  readonly skillId: "juxiang";
  readonly ownerId: PlayerId;
  readonly physicalCardId: CardId;
  readonly mandatory: true;
  readonly timing: "card_finished_before_discard";
}

export function planJuxiangClaim(input: JuxiangClaimInput): ForestRuleResult<JuxiangClaimPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Juxiang claim input must be an object");
  const contextFailure = validateSkillContext(input.context);
  if (contextFailure) return contextFailure;
  if (!isNonemptyId(input.cardUserId)
    || !member(KNOWN_KINDS, input.effectiveCardKind)
    || !Array.isArray(input.physicalCards)
    || typeof input.cardStillInProcessing !== "boolean"
    || typeof input.wouldOtherwiseEnterDiscard !== "boolean"
    || typeof input.claimedByEarlierJuxiang !== "boolean"
  ) return reject("invalid_input", "Juxiang card-finish facts are malformed");
  if (input.cardUserId === input.context.ownerId) return reject("condition_not_met", "Juxiang only claims another player's Nanman Invasion");
  if (input.effectiveCardKind !== "barbarian_invasion"
    || input.physicalCards.length !== 1
    || !isForestRuleCard(input.physicalCards[0])
    || !input.physicalCards[0]!.physical
    || input.physicalCards[0]!.kind !== "barbarian_invasion"
  ) return reject("invalid_card", "Juxiang only claims one physical printed Nanman Invasion");
  const card = input.physicalCards[0]!;
  if (!input.cardStillInProcessing || !input.wouldOtherwiseEnterDiscard || input.claimedByEarlierJuxiang || card.zone !== "processing") {
    return reject("condition_not_met", "the Nanman Invasion is no longer claimable at card finish");
  }
  return accept({
    skillId: "juxiang",
    ownerId: input.context.ownerId,
    physicalCardId: card.id,
    mandatory: true,
    timing: "card_finished_before_discard",
  });
}

export interface LierenTriggerInput {
  readonly context: ForestSkillContext;
  readonly damageTargetId: PlayerId;
  readonly damageTargetAlive: boolean;
  readonly damageEventAmount: number;
  readonly causedBySlashUseOrItsChainDamage: boolean;
  readonly ownerHandCountAfterDamage: number;
  readonly targetHandCountAfterDamage: number;
}

export interface LierenTriggerPlan {
  readonly skillId: "lieren";
  readonly ownerId: PlayerId;
  readonly targetId: PlayerId;
  readonly eligible: boolean;
  readonly triggerCountForDamageEvent: 0 | 1;
  readonly chainDamageEligible: true;
  readonly reason: "not_slash_caused_damage" | "target_not_other_living" | "pindian_hand_missing" | null;
}

export function evaluateLierenTrigger(input: LierenTriggerInput): ForestRuleResult<LierenTriggerPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Lieren input must be an object");
  const contextFailure = validateSkillContext(input.context);
  if (contextFailure) return contextFailure;
  if (!isNonemptyId(input.damageTargetId)
    || typeof input.damageTargetAlive !== "boolean"
    || !isPositiveInteger(input.damageEventAmount)
    || typeof input.causedBySlashUseOrItsChainDamage !== "boolean"
    || !isNonnegativeInteger(input.ownerHandCountAfterDamage)
    || !isNonnegativeInteger(input.targetHandCountAfterDamage)
  ) return reject("invalid_input", "Lieren damage or hand facts are malformed");
  const result = (eligible: boolean, reason: LierenTriggerPlan["reason"]): ForestRuleResult<LierenTriggerPlan> => accept({
    skillId: "lieren",
    ownerId: input.context.ownerId,
    targetId: input.damageTargetId,
    eligible,
    triggerCountForDamageEvent: eligible ? 1 : 0,
    chainDamageEligible: true,
    reason,
  });
  if (!input.causedBySlashUseOrItsChainDamage) return result(false, "not_slash_caused_damage");
  if (!input.damageTargetAlive || input.damageTargetId === input.context.ownerId) return result(false, "target_not_other_living");
  if (input.ownerHandCountAfterDamage === 0 || input.targetHandCountAfterDamage === 0) return result(false, "pindian_hand_missing");
  return result(true, null);
}

export interface LierenPindianInput {
  readonly ownerId: PlayerId;
  readonly targetId: PlayerId;
  readonly ownerCard: ForestRuleCard;
  readonly targetCard: ForestRuleCard;
}

export interface LierenPindianPlan {
  readonly skillId: "lieren";
  readonly ownerId: PlayerId;
  readonly targetId: PlayerId;
  readonly ownerCardId: CardId;
  readonly targetCardId: CardId;
  readonly discardPindianCardIds: readonly [CardId, CardId];
  readonly ownerWon: boolean;
  readonly tieCountsAsOwnerNotWinning: true;
  readonly mayGainTargetCard: boolean;
}

export function resolveLierenPindian(input: LierenPindianInput): ForestRuleResult<LierenPindianPlan> {
  if (!isRecord(input)
    || !isNonemptyId(input.ownerId)
    || !isNonemptyId(input.targetId)
    || input.ownerId === input.targetId
    || !isForestRuleCard(input.ownerCard)
    || !isForestRuleCard(input.targetCard)
  ) return reject("invalid_input", "Lieren pindian facts are malformed");
  if (!input.ownerCard.physical
    || input.ownerCard.ownerId !== input.ownerId
    || input.ownerCard.zone !== "hand"
    || !input.targetCard.physical
    || input.targetCard.ownerId !== input.targetId
    || input.targetCard.zone !== "hand"
    || input.ownerCard.id === input.targetCard.id
  ) return reject("invalid_card", "Lieren pindian requires one distinct physical hand card from each player");
  const ownerWon = input.ownerCard.rank > input.targetCard.rank;
  return accept({
    skillId: "lieren",
    ownerId: input.ownerId,
    targetId: input.targetId,
    ownerCardId: input.ownerCard.id,
    targetCardId: input.targetCard.id,
    discardPindianCardIds: [input.ownerCard.id, input.targetCard.id],
    ownerWon,
    tieCountsAsOwnerNotWinning: true,
    mayGainTargetCard: ownerWon,
  });
}

export interface LierenGainInput {
  readonly ownerId: PlayerId;
  readonly targetId: PlayerId;
  readonly pindianWon: boolean;
  readonly selectedCard: ForestRuleCard | null;
}

export interface LierenGainPlan {
  readonly skillId: "lieren";
  readonly ownerId: PlayerId;
  readonly targetId: PlayerId;
  readonly gainCardId: CardId | null;
  readonly fromZone: "hand" | "equipment" | null;
}

export function planLierenGain(input: LierenGainInput): ForestRuleResult<LierenGainPlan> {
  if (!isRecord(input)
    || !isNonemptyId(input.ownerId)
    || !isNonemptyId(input.targetId)
    || input.ownerId === input.targetId
    || typeof input.pindianWon !== "boolean"
  ) return reject("invalid_input", "Lieren gain facts are malformed");
  if (!input.pindianWon) {
    if (input.selectedCard !== null) return reject("invalid_choice", "Lieren cannot gain a card when its pindian did not win");
    return accept({ skillId: "lieren", ownerId: input.ownerId, targetId: input.targetId, gainCardId: null, fromZone: null });
  }
  if (!isForestRuleCard(input.selectedCard)
    || !input.selectedCard.physical
    || input.selectedCard.ownerId !== input.targetId
    || (input.selectedCard.zone !== "hand" && input.selectedCard.zone !== "equipment")
  ) return reject("invalid_card", "a winning Lieren may gain one target hand or equipment card");
  return accept({
    skillId: "lieren",
    ownerId: input.ownerId,
    targetId: input.targetId,
    gainCardId: input.selectedCard.id,
    fromZone: input.selectedCard.zone,
  });
}
