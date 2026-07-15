import type {
  CardCategory,
  CardId,
  CardKind,
  CardRank,
  CardSuit,
  CardUseMethod,
  DamageNature,
  EquipmentSlot,
  Faction,
  PlayerId,
  TurnPhase,
} from "../types.js";

/** The eight mythic generals implemented by the repository's people/god package. */
export const GOD_GENERAL_IDS = Object.freeze([
  "shen_cao_cao",
  "shen_guan_yu",
  "shen_lv_bu",
  "shen_lv_meng",
  "shen_si_ma_yi",
  "shen_zhao_yun",
  "shen_zhou_yu",
  "shen_zhu_ge_liang",
] as const);

/** Intrinsic/awakened God-package skills. Borrowed skills are deliberately separate. */
export const GOD_SKILL_IDS = Object.freeze([
  "guixin", "feiying",
  "wushen", "wuhun",
  "kuangbao", "wumou", "wuqian", "shenfen",
  "shelie", "gongxin",
  "renjie", "baiyin", "jilue", "lianpo",
  "juejing", "longhun",
  "qinyin", "yeyan",
  "qixing", "kuangfeng", "dawu",
] as const);

/** Existing skills referenced dynamically; they are not additional intrinsic God skills. */
export const GOD_DYNAMIC_SKILL_IDS = Object.freeze([
  "wushuang", "guicai", "fangzhu", "jizhi", "zhiheng", "wansha",
] as const);

export const JILUE_BORROWED_SKILL_IDS = Object.freeze([
  "guicai", "fangzhu", "jizhi", "zhiheng", "wansha",
] as const);

/** Source/FAQ conflicts are explicit so integration cannot silently inherit Java defects. */
export const GOD_RULE_DECISIONS = Object.freeze({
  scope: "21_intrinsic_or_awakened_skills_plus_6_dynamic_existing_skill_references",
  faction: "choose_exactly_one_of_wei_shu_wu_qun_before_game_start; never_remain_god",
  wuhun: "living_positive_maximum_only; no_mark_means_no_judgment; resolve_before_original_death_rewards",
  shelie: "must_gain_exactly_one_revealed_card_for_every_printed_suit_present; java_optional_subset_rejected",
  gongxin: "other_player_only_per_repository_java_and_printed_text; 2010_community_self_target_entry_is_rejected_conflict",
  qinyin: "once_when_qualifying_discard_reaches_two_inside_discard_phase_then_recheck_hand_limit; java_omits_recheck",
  yeyan: "self_is_a_legal_role_target; greater_cost_resolves_dying_before_damage_but_committed_damage_survives_source_death",
  qixing: "eleven_card_initial_choice_equivalent_to_four_hand_plus_seven_private_stars; weather_clears_on_owner_death",
  guixin: "one_complete_optional_resolution_per_damage_point; java_once_per_damage_event_rejected",
  wuqian: "self_target_is_legal_and_virtual_armor_skills_are_disabled; java_only_toggles_equipped_shields",
  shenfen: "global_stages_damage_all_then_equipment_all_then_hand_all_then_turn_over; java_per_player_interleaving_rejected",
  longhun: "owned_hand_or_equipment_cards_with_effective_same_suit; failed_validation_consumes_nothing",
  jilue: "spend_one_ren_per_inherited_skill_invocation; fangzhu_turns_over_then_draws; wansha_activates_at_play_phase_start",
  lianpo: "optional_one_extra_turn_per_qualifying_turn_after_full_turn_end; java_nested_run_and_own_end_only_rejected",
} as const);

export type GodGeneralId = (typeof GOD_GENERAL_IDS)[number];
export type GodSkillId = (typeof GOD_SKILL_IDS)[number];
export type GodDynamicSkillId = (typeof GOD_DYNAMIC_SKILL_IDS)[number];
export type JilueBorrowedSkillId = (typeof JILUE_BORROWED_SKILL_IDS)[number];

export type GodCardZone =
  | "hand"
  | "equipment"
  | "judgment"
  | "draw_pile"
  | "discard_pile"
  | "processing"
  | "extra_pile";

export interface GodRuleCard {
  readonly id: CardId;
  readonly kind: CardKind;
  readonly category: CardCategory;
  readonly printedSuit: CardSuit;
  readonly rank: CardRank;
  readonly ownerId: PlayerId | null;
  readonly zone: GodCardZone;
  readonly equipmentSlot: EquipmentSlot | null;
  readonly physical: boolean;
}

export interface GodSkillContext {
  readonly ownerId: PlayerId;
  readonly ownerAlive: boolean;
  readonly skillEffective: boolean;
}

export interface GodPhaseContext extends GodSkillContext {
  readonly currentPlayerId: PlayerId;
  readonly phase: TurnPhase;
}

export type GodRuleFailureCode =
  | "invalid_input"
  | "owner_dead"
  | "skill_not_effective"
  | "wrong_timing"
  | "not_active_player"
  | "invalid_card"
  | "invalid_target"
  | "target_dead"
  | "invalid_choice"
  | "condition_not_met"
  | "already_used"
  | "already_awakened"
  | "not_awakened"
  | "insufficient_cards"
  | "insufficient_marks"
  | "limited_consumed"
  | "game_finished";

export type GodRuleResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: GodRuleFailureCode; readonly detail: string };

function accept<T>(value: T): GodRuleResult<T> {
  return { ok: true, value };
}

function reject<T>(code: GodRuleFailureCode, detail: string): GodRuleResult<T> {
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

function uniqueIds(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isNonemptyId) && new Set(value).size === value.length;
}

function disjointIds(groups: readonly (readonly string[])[]): boolean {
  const all = groups.flat();
  return new Set(all).size === all.length;
}

const SUITS: readonly CardSuit[] = ["spade", "heart", "club", "diamond"];
const PHASES: readonly TurnPhase[] = ["prepare", "judgment", "draw", "play", "respond", "discard", "end"];
const NORMAL_FACTIONS = ["wei", "shu", "wu", "qun"] as const satisfies readonly Faction[];
const ALL_FACTIONS: readonly Faction[] = [...NORMAL_FACTIONS, "god"];
const ZONES: readonly GodCardZone[] = [
  "hand", "equipment", "judgment", "draw_pile", "discard_pile", "processing", "extra_pile",
];
const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = ["weapon", "armor", "offensive_horse", "defensive_horse"];
const BASIC_KINDS = ["slash", "fire_slash", "thunder_slash", "dodge", "peach", "wine"] as const satisfies readonly CardKind[];
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
const DELAYED_TRICK_KINDS = ["le_bu_si_shu", "bing_liang_cun_duan", "shan_dian"] as const satisfies readonly CardKind[];
const KNOWN_KINDS: readonly CardKind[] = [...BASIC_KINDS, ...EQUIPMENT_KINDS, ...TRICK_KINDS];

function expectedCategory(kind: CardKind): CardCategory {
  if (member(BASIC_KINDS, kind)) return "basic";
  if (member(EQUIPMENT_KINDS, kind)) return "equipment";
  return "trick";
}

function isGodRuleCard(value: unknown): value is GodRuleCard {
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

function validateSkillContext(value: unknown): GodRuleResult<never> | null {
  if (!isRecord(value)
    || !isNonemptyId(value.ownerId)
    || typeof value.ownerAlive !== "boolean"
    || typeof value.skillEffective !== "boolean"
  ) return reject("invalid_input", "skill context is incomplete or malformed");
  if (!value.ownerAlive) return reject("owner_dead", "a dead owner cannot resolve this skill");
  if (!value.skillEffective) return reject("skill_not_effective", "the skill is not currently effective");
  return null;
}

function validateOwnerPhase(value: unknown, expected: TurnPhase): GodRuleResult<never> | null {
  const skillFailure = validateSkillContext(value);
  if (skillFailure) return skillFailure;
  if (!isRecord(value) || !isNonemptyId(value.currentPlayerId) || !member(PHASES, value.phase)) {
    return reject("invalid_input", "phase context is incomplete or malformed");
  }
  if (value.currentPlayerId !== value.ownerId) return reject("not_active_player", "the skill owner is not the current player");
  if (value.phase !== expected) return reject("wrong_timing", `the skill requires the ${expected} phase`);
  return null;
}

function ownedPhysicalCard(card: GodRuleCard, ownerId: PlayerId, zones: readonly GodCardZone[]): boolean {
  return card.physical && card.ownerId === ownerId && zones.includes(card.zone);
}

// ---------------------------------------------------------------------------
// Shared God setup: selectable faction

export interface GodFactionChoiceInput {
  readonly ownerId: PlayerId;
  readonly generalId: GodGeneralId;
  readonly setupStage: "before_game_start" | "game_started";
  readonly currentFaction: Faction | null;
  readonly chosenFaction: Faction;
}

export interface GodFactionChoicePlan {
  readonly ownerId: PlayerId;
  readonly generalId: GodGeneralId;
  readonly chosenFaction: (typeof NORMAL_FACTIONS)[number];
  readonly publicFromGameStart: true;
  readonly appliesToFactionChecksAndLordSkills: true;
  readonly immutableForGame: true;
}

export function planGodFactionChoice(input: GodFactionChoiceInput): GodRuleResult<GodFactionChoicePlan> {
  if (!isRecord(input)
    || !isNonemptyId(input.ownerId)
    || !member(GOD_GENERAL_IDS, input.generalId)
    || (input.setupStage !== "before_game_start" && input.setupStage !== "game_started")
    || (input.currentFaction !== null && !member(ALL_FACTIONS, input.currentFaction))
    || !member(ALL_FACTIONS, input.chosenFaction)
  ) return reject("invalid_input", "God faction-choice facts are malformed");
  if (input.setupStage !== "before_game_start") return reject("wrong_timing", "a God chooses faction before game start");
  if (input.currentFaction !== null) return reject("already_used", "this God's faction was already fixed");
  if (!member(NORMAL_FACTIONS, input.chosenFaction)) return reject("invalid_choice", "God is not a selectable in-game faction");
  return accept({
    ownerId: input.ownerId,
    generalId: input.generalId,
    chosenFaction: input.chosenFaction,
    publicFromGameStart: true,
    appliesToFactionChecksAndLordSkills: true,
    immutableForGame: true,
  });
}

// ---------------------------------------------------------------------------
// Shen Guan Yu: Wushen, Wuhun

export interface WushenViewAsInput {
  readonly context: GodSkillContext;
  readonly card: GodRuleCard;
  readonly effectiveSuit: CardSuit;
  readonly method: Exclude<CardUseMethod, "recast">;
  readonly slashTimingLegal: boolean;
}

export interface WushenViewAsPlan {
  readonly skillId: "wushen";
  readonly ownerId: PlayerId;
  readonly physicalCardId: CardId;
  readonly effectiveKind: "slash";
  readonly effectiveSuit: "heart";
  readonly method: "use" | "respond";
  readonly lockedReplacement: true;
  readonly retainsPhysicalRank: true;
}

export function evaluateWushenViewAs(input: WushenViewAsInput): GodRuleResult<WushenViewAsPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Wushen input must be an object");
  const contextFailure = validateSkillContext(input.context);
  if (contextFailure) return contextFailure;
  if (!isGodRuleCard(input.card)
    || !member(SUITS, input.effectiveSuit)
    || (input.method !== "use" && input.method !== "respond")
    || typeof input.slashTimingLegal !== "boolean"
  ) return reject("invalid_input", "Wushen card-use facts are malformed");
  if (!input.slashTimingLegal) return reject("wrong_timing", "a Slash is not legal in this use/response window");
  if (!ownedPhysicalCard(input.card, input.context.ownerId, ["hand"]) || input.effectiveSuit !== "heart") {
    return reject("invalid_card", "Wushen replaces one effective-Heart physical hand card");
  }
  return accept({
    skillId: "wushen",
    ownerId: input.context.ownerId,
    physicalCardId: input.card.id,
    effectiveKind: "slash",
    effectiveSuit: "heart",
    method: input.method,
    lockedReplacement: true,
    retainsPhysicalRank: true,
  });
}

export type WushenDeclarationOrigin = "owner_declared_target" | "borrowed_sword_preselected" | "lord_dispatch_preselected";

export interface WushenDistanceInput {
  readonly attackerId: PlayerId;
  readonly hasEffectiveWushen: boolean;
  readonly slashEffectiveSuit: CardSuit;
  readonly declarationOrigin: WushenDeclarationOrigin;
  readonly targetWithinOrdinaryRange: boolean;
}

export interface WushenDistanceDecision {
  readonly ignoresDistance: boolean;
  readonly targetLegalByDistance: boolean;
  readonly preselectedTargetIsNotRetroactivelyLegalized: true;
}

export function evaluateWushenDistance(input: WushenDistanceInput): GodRuleResult<WushenDistanceDecision> {
  if (!isRecord(input)
    || !isNonemptyId(input.attackerId)
    || typeof input.hasEffectiveWushen !== "boolean"
    || !member(SUITS, input.slashEffectiveSuit)
    || !member(["owner_declared_target", "borrowed_sword_preselected", "lord_dispatch_preselected"] as const, input.declarationOrigin)
    || typeof input.targetWithinOrdinaryRange !== "boolean"
  ) return reject("invalid_input", "Wushen distance facts are malformed");
  const ignoresDistance = input.hasEffectiveWushen
    && input.slashEffectiveSuit === "heart"
    && input.declarationOrigin === "owner_declared_target";
  return accept({
    ignoresDistance,
    targetLegalByDistance: ignoresDistance || input.targetWithinOrdinaryRange,
    preselectedTargetIsNotRetroactivelyLegalized: true,
  });
}

export interface WuhunDamageInput {
  readonly context: GodSkillContext;
  readonly sourceId: PlayerId | null;
  readonly damageAmount: number;
}

export interface WuhunDamagePlan {
  readonly skillId: "wuhun";
  readonly sourceId: PlayerId | null;
  readonly nightmareMarkDelta: number;
  readonly timing: "after_damage_is_sustained_before_post_damage_skills";
  readonly sourceLessDamageCreatesNoMark: true;
}

export function planWuhunDamageMarks(input: WuhunDamageInput): GodRuleResult<WuhunDamagePlan> {
  if (!isRecord(input)) return reject("invalid_input", "Wuhun damage input must be an object");
  const contextFailure = validateSkillContext(input.context);
  if (contextFailure) return contextFailure;
  if ((input.sourceId !== null && !isNonemptyId(input.sourceId)) || !isPositiveInteger(input.damageAmount)) {
    return reject("invalid_input", "Wuhun damage source or amount is malformed");
  }
  return accept({
    skillId: "wuhun",
    sourceId: input.sourceId,
    nightmareMarkDelta: input.sourceId === null ? 0 : input.damageAmount,
    timing: "after_damage_is_sustained_before_post_damage_skills",
    sourceLessDamageCreatesNoMark: true,
  });
}

export interface WuhunDeathInput {
  readonly ownerId: PlayerId;
  readonly deathConfirmed: boolean;
  readonly gameAlreadyFinished: boolean;
  readonly otherPlayers: readonly {
    readonly id: PlayerId;
    readonly alive: boolean;
    readonly nightmareMarks: number;
  }[];
  readonly chosenTargetId: PlayerId | null;
}

export interface WuhunDeathPlan {
  readonly skillId: "wuhun";
  readonly ownerId: PlayerId;
  readonly maximumMarks: number;
  readonly eligibleTargetIds: readonly PlayerId[];
  readonly judgmentTargetId: PlayerId | null;
  readonly resolvesBeforeOriginalDeathRewardsAndPunishments: true;
  readonly deadMarkHoldersIgnored: true;
}

export function planWuhunDeath(input: WuhunDeathInput): GodRuleResult<WuhunDeathPlan> {
  if (!isRecord(input)
    || !isNonemptyId(input.ownerId)
    || typeof input.deathConfirmed !== "boolean"
    || typeof input.gameAlreadyFinished !== "boolean"
    || !Array.isArray(input.otherPlayers)
    || (input.chosenTargetId !== null && !isNonemptyId(input.chosenTargetId))
  ) return reject("invalid_input", "Wuhun death facts are malformed");
  if (!input.deathConfirmed) return reject("wrong_timing", "Wuhun death judgment follows confirmed death");
  if (input.gameAlreadyFinished) return reject("game_finished", "game end suppresses all remaining Wuhun settlement");
  const seen = new Set<string>();
  let maximumMarks = 0;
  for (const player of input.otherPlayers) {
    if (!isRecord(player)
      || !isNonemptyId(player.id)
      || player.id === input.ownerId
      || seen.has(player.id)
      || typeof player.alive !== "boolean"
      || !isNonnegativeInteger(player.nightmareMarks)
    ) return reject("invalid_input", "Wuhun mark-holder snapshot is malformed");
    seen.add(player.id);
    if (player.alive) maximumMarks = Math.max(maximumMarks, player.nightmareMarks);
  }
  const eligibleTargetIds = maximumMarks > 0
    ? input.otherPlayers.filter((player) => player.alive && player.nightmareMarks === maximumMarks).map((player) => player.id)
    : [];
  if (eligibleTargetIds.length === 0) {
    if (input.chosenTargetId !== null) return reject("invalid_choice", "no living positive-mark holder can be chosen");
  } else if (input.chosenTargetId === null || !eligibleTargetIds.includes(input.chosenTargetId)) {
    return reject("invalid_choice", "Wuhun must choose one living maximum positive-mark holder");
  }
  return accept({
    skillId: "wuhun",
    ownerId: input.ownerId,
    maximumMarks,
    eligibleTargetIds,
    judgmentTargetId: input.chosenTargetId,
    resolvesBeforeOriginalDeathRewardsAndPunishments: true,
    deadMarkHoldersIgnored: true,
  });
}

export interface WuhunJudgmentInput {
  readonly targetId: PlayerId;
  readonly finalEffectiveCardKind: CardKind;
}

export interface WuhunJudgmentPlan {
  readonly skillId: "wuhun";
  readonly targetId: PlayerId;
  readonly survives: boolean;
  readonly immediateDeath: boolean;
  readonly bypassDyingRescueAndBuqu: true;
  readonly deathSourceId: null;
}

export function settleWuhunJudgment(input: WuhunJudgmentInput): GodRuleResult<WuhunJudgmentPlan> {
  if (!isRecord(input) || !isNonemptyId(input.targetId) || !member(KNOWN_KINDS, input.finalEffectiveCardKind)) {
    return reject("invalid_input", "Wuhun final judgment is malformed");
  }
  const survives = input.finalEffectiveCardKind === "peach" || input.finalEffectiveCardKind === "peach_garden";
  return accept({
    skillId: "wuhun",
    targetId: input.targetId,
    survives,
    immediateDeath: !survives,
    bypassDyingRescueAndBuqu: true,
    deathSourceId: null,
  });
}

// ---------------------------------------------------------------------------
// Shen Lu Meng: Shelie, Gongxin

export interface ShelieActivationInput {
  readonly context: GodPhaseContext;
  readonly drawPhaseAvailable: boolean;
  readonly decision: "replace_draw" | "normal_draw";
}

export interface ShelieActivationPlan {
  readonly skillId: "shelie";
  readonly ownerId: PlayerId;
  readonly activated: boolean;
  readonly replacesNormalDraw: boolean;
  readonly revealCount: 0 | 5;
  readonly revealedPublicly: true;
}

export function evaluateShelieActivation(input: ShelieActivationInput): GodRuleResult<ShelieActivationPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Shelie activation input must be an object");
  const phaseFailure = validateOwnerPhase(input.context, "draw");
  if (phaseFailure) return phaseFailure;
  if (typeof input.drawPhaseAvailable !== "boolean"
    || (input.decision !== "replace_draw" && input.decision !== "normal_draw")
  ) return reject("invalid_input", "Shelie draw decision is malformed");
  if (!input.drawPhaseAvailable) return reject("wrong_timing", "a skipped draw phase offers no Shelie window");
  const activated = input.decision === "replace_draw";
  return accept({
    skillId: "shelie",
    ownerId: input.context.ownerId,
    activated,
    replacesNormalDraw: activated,
    revealCount: activated ? 5 : 0,
    revealedPublicly: true,
  });
}

export interface ShelieRevealedCard {
  readonly id: CardId;
  readonly printedSuit: CardSuit;
}

export interface ShelieSettlementInput {
  readonly ownerId: PlayerId;
  readonly revealedCards: readonly ShelieRevealedCard[];
  readonly selectedCardIds: readonly CardId[];
}

export interface ShelieSettlementPlan {
  readonly skillId: "shelie";
  readonly ownerId: PlayerId;
  readonly gainCardIds: readonly CardId[];
  readonly discardCardIds: readonly CardId[];
  readonly representedSuits: readonly CardSuit[];
  readonly exactlyOnePerPrintedSuitPresent: true;
}

export function planShelieSettlement(input: ShelieSettlementInput): GodRuleResult<ShelieSettlementPlan> {
  if (!isRecord(input)
    || !isNonemptyId(input.ownerId)
    || !Array.isArray(input.revealedCards)
    || !uniqueIds(input.selectedCardIds)
  ) return reject("invalid_input", "Shelie settlement facts are malformed");
  if (input.revealedCards.length !== 5) return reject("invalid_choice", "Shelie settles exactly five revealed cards");
  const byId = new Map<string, ShelieRevealedCard>();
  for (const card of input.revealedCards) {
    if (!isRecord(card) || !isNonemptyId(card.id) || byId.has(card.id) || !member(SUITS, card.printedSuit)) {
      return reject("invalid_input", "Shelie revealed cards contain invalid or duplicate facts");
    }
    byId.set(card.id, card as unknown as ShelieRevealedCard);
  }
  const representedSuits = SUITS.filter((suit) => input.revealedCards.some((card) => card.printedSuit === suit));
  if (input.selectedCardIds.length !== representedSuits.length
    || input.selectedCardIds.some((id) => !byId.has(id))
  ) return reject("invalid_choice", "Shelie must gain one card for every suit represented");
  const selectedCards = input.selectedCardIds.map((id) => byId.get(id)!);
  if (new Set(selectedCards.map((card) => card.printedSuit)).size !== representedSuits.length) {
    return reject("invalid_choice", "Shelie selections must have distinct printed suits");
  }
  return accept({
    skillId: "shelie",
    ownerId: input.ownerId,
    gainCardIds: [...input.selectedCardIds],
    discardCardIds: input.revealedCards.filter((card) => !input.selectedCardIds.includes(card.id)).map((card) => card.id),
    representedSuits,
    exactlyOnePerPrintedSuitPresent: true,
  });
}

export interface GongxinHandCard {
  readonly id: CardId;
  readonly effectiveSuit: CardSuit;
}

export interface GongxinInput {
  readonly context: GodPhaseContext;
  readonly usedThisPlayPhase: boolean;
  readonly targetId: PlayerId;
  readonly targetAlive: boolean;
  readonly targetHand: readonly GongxinHandCard[];
  readonly selectedCardId: CardId | null;
  readonly action: "discard" | "put_on_draw_pile_top" | null;
}

export interface GongxinPlan {
  readonly skillId: "gongxin";
  readonly ownerId: PlayerId;
  readonly targetId: PlayerId;
  readonly consumePlayPhaseUse: true;
  readonly inspectEntireHandPrivately: true;
  readonly revealedCardId: CardId | null;
  readonly discardCardId: CardId | null;
  readonly drawPileTopCardId: CardId | null;
  readonly effectiveHeartIncludesSuitModifiers: true;
}

export function planGongxin(input: GongxinInput): GodRuleResult<GongxinPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Gongxin input must be an object");
  const phaseFailure = validateOwnerPhase(input.context, "play");
  if (phaseFailure) return phaseFailure;
  if (typeof input.usedThisPlayPhase !== "boolean"
    || !isNonemptyId(input.targetId)
    || typeof input.targetAlive !== "boolean"
    || !Array.isArray(input.targetHand)
    || (input.selectedCardId !== null && !isNonemptyId(input.selectedCardId))
    || (input.action !== null && input.action !== "discard" && input.action !== "put_on_draw_pile_top")
  ) return reject("invalid_input", "Gongxin target or choice facts are malformed");
  if (input.usedThisPlayPhase) return reject("already_used", "Gongxin is limited to once per play phase");
  if (input.targetId === input.context.ownerId) return reject("invalid_target", "repository-era Gongxin targets another player");
  if (!input.targetAlive) return reject("target_dead", "Gongxin cannot inspect a dead player");
  const byId = new Map<string, GongxinHandCard>();
  for (const card of input.targetHand) {
    if (!isRecord(card) || !isNonemptyId(card.id) || byId.has(card.id) || !member(SUITS, card.effectiveSuit)) {
      return reject("invalid_input", "Gongxin target hand is malformed");
    }
    byId.set(card.id, card as unknown as GongxinHandCard);
  }
  if (input.selectedCardId === null) {
    if (input.action !== null) return reject("invalid_choice", "Gongxin cannot choose an action without a Heart card");
  } else {
    const selected = byId.get(input.selectedCardId);
    if (!selected || selected.effectiveSuit !== "heart") return reject("invalid_card", "Gongxin can reveal only an effective-Heart hand card");
    if (input.action === null) return reject("invalid_choice", "a selected Gongxin card requires discard or top-deck placement");
  }
  return accept({
    skillId: "gongxin",
    ownerId: input.context.ownerId,
    targetId: input.targetId,
    consumePlayPhaseUse: true,
    inspectEntireHandPrivately: true,
    revealedCardId: input.selectedCardId,
    discardCardId: input.action === "discard" ? input.selectedCardId : null,
    drawPileTopCardId: input.action === "put_on_draw_pile_top" ? input.selectedCardId : null,
    effectiveHeartIncludesSuitModifiers: true,
  });
}

// ---------------------------------------------------------------------------
// Shen Zhou Yu: Qinyin, Yeyan

export type QinyinMode = "decline" | "all_recover_one" | "all_lose_one_hp";

export interface QinyinInput {
  readonly context: GodPhaseContext;
  readonly alreadyInvokedThisDiscardPhase: boolean;
  readonly qualifyingDiscardedHandCardIds: readonly CardId[];
  readonly mode: QinyinMode;
  /** Living roles in seat order beginning with Shen Zhou Yu. */
  readonly resolutionOrder: readonly {
    readonly id: PlayerId;
    readonly alive: boolean;
    readonly hp: number;
    readonly maxHp: number;
  }[];
}

export interface QinyinStep {
  readonly targetId: PlayerId;
  readonly operation: "recover" | "lose_hp";
  readonly requested: 1;
  readonly actual: 0 | 1;
  readonly hpAfter: number;
  readonly insertDyingSettlement: boolean;
}

export interface QinyinPlan {
  readonly skillId: "qinyin";
  readonly ownerId: PlayerId;
  readonly invoked: boolean;
  readonly mode: QinyinMode;
  readonly steps: readonly QinyinStep[];
  readonly sourceLessHpLoss: true;
  readonly recheckHandLimitAfterSkill: true;
  readonly stopsOnlyIfGameEnds: true;
}

export function planQinyin(input: QinyinInput): GodRuleResult<QinyinPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Qinyin input must be an object");
  const phaseFailure = validateOwnerPhase(input.context, "discard");
  if (phaseFailure) return phaseFailure;
  if (typeof input.alreadyInvokedThisDiscardPhase !== "boolean"
    || !uniqueIds(input.qualifyingDiscardedHandCardIds)
    || !member(["decline", "all_recover_one", "all_lose_one_hp"] as const, input.mode)
    || !Array.isArray(input.resolutionOrder)
  ) return reject("invalid_input", "Qinyin trigger or player facts are malformed");
  if (input.alreadyInvokedThisDiscardPhase) return reject("already_used", "Qinyin can resolve only once in a discard phase");
  if (input.qualifyingDiscardedHandCardIds.length < 2) return reject("condition_not_met", "Qinyin requires at least two discarded hand cards");
  const seen = new Set<string>();
  for (const player of input.resolutionOrder) {
    if (!isRecord(player)
      || !isNonemptyId(player.id)
      || seen.has(player.id)
      || typeof player.alive !== "boolean"
      || !isSafeInteger(player.hp)
      || !isPositiveInteger(player.maxHp)
      || player.hp > player.maxHp
    ) return reject("invalid_input", "Qinyin resolution order is malformed");
    seen.add(player.id);
  }
  if (input.resolutionOrder.length === 0 || input.resolutionOrder[0]!.id !== input.context.ownerId || !input.resolutionOrder[0]!.alive) {
    return reject("invalid_input", "Qinyin resolves from its living owner in seat order");
  }
  const steps: QinyinStep[] = [];
  if (input.mode !== "decline") {
    for (const player of input.resolutionOrder) {
      if (!player.alive) continue;
      if (input.mode === "all_recover_one") {
        const actual: 0 | 1 = player.hp < player.maxHp ? 1 : 0;
        steps.push({ targetId: player.id, operation: "recover", requested: 1, actual, hpAfter: player.hp + actual, insertDyingSettlement: false });
      } else {
        const hpAfter = player.hp - 1;
        steps.push({ targetId: player.id, operation: "lose_hp", requested: 1, actual: 1, hpAfter, insertDyingSettlement: hpAfter <= 0 });
      }
    }
  }
  return accept({
    skillId: "qinyin",
    ownerId: input.context.ownerId,
    invoked: input.mode !== "decline",
    mode: input.mode,
    steps,
    sourceLessHpLoss: true,
    recheckHandLimitAfterSkill: true,
    stopsOnlyIfGameEnds: true,
  });
}

export interface YeyanAllocation {
  readonly targetId: PlayerId;
  readonly targetAlive: boolean;
  readonly damage: number;
}

export interface YeyanInput {
  readonly context: GodPhaseContext;
  readonly limitedAlreadyConsumed: boolean;
  readonly ownerHp: number;
  readonly ownerMaxHp: number;
  readonly allocations: readonly YeyanAllocation[];
  /** Circular seat order beginning with the owner, used for damage settlement. */
  readonly seatOrderFromOwner: readonly PlayerId[];
  readonly greaterCostCards: readonly {
    readonly card: GodRuleCard;
    readonly effectiveSuit: CardSuit;
  }[];
}

export interface YeyanPlan {
  readonly skillId: "yeyan";
  readonly ownerId: PlayerId;
  readonly limitedConsumed: true;
  readonly greaterYeyan: boolean;
  readonly totalAssignedDamage: number;
  readonly discardCostCardIds: readonly CardId[];
  readonly hpLossCost: 0 | 3;
  readonly ownerHpAfterCost: number;
  readonly resolveOwnerDyingBeforeDamage: boolean;
  readonly damageSteps: readonly {
    readonly targetId: PlayerId;
    readonly amount: number;
    readonly nature: "fire";
    readonly sourceId: PlayerId;
    readonly skipIfTargetNoLongerAlive: true;
  }[];
  readonly committedDamageContinuesIfSourceDies: true;
  readonly stopsOnlyIfGameEnds: true;
}

export function planYeyan(input: YeyanInput): GodRuleResult<YeyanPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Yeyan input must be an object");
  const phaseFailure = validateOwnerPhase(input.context, "play");
  if (phaseFailure) return phaseFailure;
  if (typeof input.limitedAlreadyConsumed !== "boolean"
    || !isSafeInteger(input.ownerHp)
    || !isPositiveInteger(input.ownerMaxHp)
    || input.ownerHp > input.ownerMaxHp
    || !Array.isArray(input.allocations)
    || !uniqueIds(input.seatOrderFromOwner)
    || !Array.isArray(input.greaterCostCards)
  ) return reject("invalid_input", "Yeyan HP, allocation, or cost facts are malformed");
  if (input.limitedAlreadyConsumed) return reject("limited_consumed", "Yeyan is limited to once per game");
  if (input.allocations.length < 1 || input.allocations.length > 3) return reject("invalid_choice", "Yeyan targets one to three roles");
  if (input.seatOrderFromOwner.length === 0 || input.seatOrderFromOwner[0] !== input.context.ownerId) {
    return reject("invalid_input", "Yeyan seat order must begin with its owner");
  }
  const allocationIds = new Set<string>();
  let totalAssignedDamage = 0;
  for (const allocation of input.allocations) {
    if (!isRecord(allocation)
      || !isNonemptyId(allocation.targetId)
      || allocationIds.has(allocation.targetId)
      || typeof allocation.targetAlive !== "boolean"
      || !isPositiveInteger(allocation.damage)
      || !input.seatOrderFromOwner.includes(allocation.targetId)
    ) return reject("invalid_input", "Yeyan allocations are malformed or duplicate");
    if (!allocation.targetAlive) return reject("target_dead", "Yeyan cannot choose a dead role");
    allocationIds.add(allocation.targetId);
    totalAssignedDamage += allocation.damage;
  }
  if (totalAssignedDamage > 3) return reject("invalid_choice", "Yeyan assigns at most three total damage");
  const greaterYeyan = input.allocations.some((allocation) => allocation.damage >= 2);
  const costIds = new Set<string>();
  const costSuits = new Set<CardSuit>();
  for (const item of input.greaterCostCards) {
    if (!isRecord(item) || !isGodRuleCard(item.card) || !member(SUITS, item.effectiveSuit) || costIds.has(item.card.id)) {
      return reject("invalid_card", "Yeyan cost cards are malformed or duplicate");
    }
    if (!ownedPhysicalCard(item.card, input.context.ownerId, ["hand"])) return reject("invalid_card", "greater Yeyan costs four owned hand cards");
    costIds.add(item.card.id);
    costSuits.add(item.effectiveSuit);
  }
  if (greaterYeyan) {
    if (input.ownerHp < 3) return reject("condition_not_met", "greater Yeyan requires at least three current HP");
    if (input.greaterCostCards.length !== 4 || costSuits.size !== 4) {
      return reject("insufficient_cards", "greater Yeyan requires four effective suits among four hand cards");
    }
  } else if (input.greaterCostCards.length !== 0) {
    return reject("invalid_choice", "lesser Yeyan has no discard or HP cost");
  }
  const byTarget = new Map(input.allocations.map((allocation) => [allocation.targetId, allocation] as const));
  const damageSteps = input.seatOrderFromOwner
    .map((id) => byTarget.get(id))
    .filter((allocation): allocation is YeyanAllocation => allocation !== undefined)
    .map((allocation) => ({
      targetId: allocation.targetId,
      amount: allocation.damage,
      nature: "fire" as const,
      sourceId: input.context.ownerId,
      skipIfTargetNoLongerAlive: true as const,
    }));
  const hpLossCost: 0 | 3 = greaterYeyan ? 3 : 0;
  const ownerHpAfterCost = input.ownerHp - hpLossCost;
  return accept({
    skillId: "yeyan",
    ownerId: input.context.ownerId,
    limitedConsumed: true,
    greaterYeyan,
    totalAssignedDamage,
    discardCostCardIds: input.greaterCostCards.map((item) => item.card.id),
    hpLossCost,
    ownerHpAfterCost,
    resolveOwnerDyingBeforeDamage: ownerHpAfterCost <= 0,
    damageSteps,
    committedDamageContinuesIfSourceDies: true,
    stopsOnlyIfGameEnds: true,
  });
}

// ---------------------------------------------------------------------------
// Shen Zhu Ge Liang: Qixing, Kuangfeng, Dawu

function validateQixingSwap(
  handCardIds: readonly CardId[],
  starCardIds: readonly CardId[],
  handCardIdsToStars: readonly CardId[],
  starCardIdsToHand: readonly CardId[],
): GodRuleResult<{ readonly finalHandCardIds: readonly CardId[]; readonly finalStarCardIds: readonly CardId[] }> {
  if (!uniqueIds(handCardIds)
    || !uniqueIds(starCardIds)
    || !uniqueIds(handCardIdsToStars)
    || !uniqueIds(starCardIdsToHand)
    || !disjointIds([handCardIds, starCardIds])
  ) return reject("invalid_input", "Qixing card piles overlap or contain invalid IDs");
  if (handCardIdsToStars.length !== starCardIdsToHand.length
    || handCardIdsToStars.some((id) => !handCardIds.includes(id))
    || starCardIdsToHand.some((id) => !starCardIds.includes(id))
  ) return reject("invalid_choice", "Qixing exchanges equal valid subsets of hand and Stars");
  return accept({
    finalHandCardIds: [
      ...handCardIds.filter((id) => !handCardIdsToStars.includes(id)),
      ...starCardIdsToHand,
    ],
    finalStarCardIds: [
      ...starCardIds.filter((id) => !starCardIdsToHand.includes(id)),
      ...handCardIdsToStars,
    ],
  });
}

export interface QixingInitialInput {
  readonly context: GodSkillContext;
  readonly initialHandCardIds: readonly CardId[];
  readonly topSevenCardIds: readonly CardId[];
  readonly handCardIdsToStars: readonly CardId[];
  readonly starCardIdsToHand: readonly CardId[];
}

export interface QixingInitialPlan {
  readonly skillId: "qixing";
  readonly ownerId: PlayerId;
  readonly finalHandCardIds: readonly CardId[];
  readonly finalStarCardIds: readonly CardId[];
  readonly starCount: 7;
  readonly privateToOwner: true;
  readonly elevenCardInitialChoice: true;
}

export function planQixingInitial(input: QixingInitialInput): GodRuleResult<QixingInitialPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Qixing initial input must be an object");
  const contextFailure = validateSkillContext(input.context);
  if (contextFailure) return contextFailure;
  if (!uniqueIds(input.initialHandCardIds)
    || !uniqueIds(input.topSevenCardIds)
    || input.initialHandCardIds.length !== 4
    || input.topSevenCardIds.length !== 7
  ) return reject("invalid_input", "Qixing starts from four hand cards and seven deck cards");
  const swap = validateQixingSwap(
    input.initialHandCardIds,
    input.topSevenCardIds,
    input.handCardIdsToStars,
    input.starCardIdsToHand,
  );
  if (!swap.ok) return swap;
  return accept({
    skillId: "qixing",
    ownerId: input.context.ownerId,
    finalHandCardIds: swap.value.finalHandCardIds,
    finalStarCardIds: swap.value.finalStarCardIds,
    starCount: 7,
    privateToOwner: true,
    elevenCardInitialChoice: true,
  });
}

export interface QixingExchangeInput {
  readonly context: GodPhaseContext;
  readonly drawPhaseOccurred: boolean;
  readonly handCardIds: readonly CardId[];
  readonly starCardIds: readonly CardId[];
  readonly handCardIdsToStars: readonly CardId[];
  readonly starCardIdsToHand: readonly CardId[];
}

export interface QixingExchangePlan {
  readonly skillId: "qixing";
  readonly ownerId: PlayerId;
  readonly finalHandCardIds: readonly CardId[];
  readonly finalStarCardIds: readonly CardId[];
  readonly exchangedCount: number;
  readonly privateToOwner: true;
}

export function planQixingExchange(input: QixingExchangeInput): GodRuleResult<QixingExchangePlan> {
  if (!isRecord(input)) return reject("invalid_input", "Qixing exchange input must be an object");
  const phaseFailure = validateOwnerPhase(input.context, "draw");
  if (phaseFailure) return phaseFailure;
  if (typeof input.drawPhaseOccurred !== "boolean") return reject("invalid_input", "Qixing draw-phase fact is malformed");
  if (!input.drawPhaseOccurred) return reject("wrong_timing", "Qixing cannot exchange after a skipped draw phase");
  const swap = validateQixingSwap(
    input.handCardIds,
    input.starCardIds,
    input.handCardIdsToStars,
    input.starCardIdsToHand,
  );
  if (!swap.ok) return swap;
  return accept({
    skillId: "qixing",
    ownerId: input.context.ownerId,
    finalHandCardIds: swap.value.finalHandCardIds,
    finalStarCardIds: swap.value.finalStarCardIds,
    exchangedCount: input.handCardIdsToStars.length,
    privateToOwner: true,
  });
}

export interface KuangfengInput {
  readonly context: GodPhaseContext;
  readonly starCardIds: readonly CardId[];
  readonly selectedStarCardId: CardId;
  readonly targetId: PlayerId;
  readonly targetAlive: boolean;
}

export interface KuangfengPlan {
  readonly skillId: "kuangfeng";
  readonly ownerId: PlayerId;
  readonly discardStarCardIds: readonly [CardId];
  readonly targetId: PlayerId;
  readonly targetMayBeOwner: true;
  readonly effect: "fire_damage_plus_one";
  readonly expiresBeforeOwnerNextTurn: true;
  readonly clearsIfOwnerDies: true;
}

export function planKuangfeng(input: KuangfengInput): GodRuleResult<KuangfengPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Kuangfeng input must be an object");
  const phaseFailure = validateOwnerPhase(input.context, "end");
  if (phaseFailure) return phaseFailure;
  if (!uniqueIds(input.starCardIds)
    || !isNonemptyId(input.selectedStarCardId)
    || !isNonemptyId(input.targetId)
    || typeof input.targetAlive !== "boolean"
  ) return reject("invalid_input", "Kuangfeng Star or target facts are malformed");
  if (!input.starCardIds.includes(input.selectedStarCardId)) return reject("insufficient_cards", "Kuangfeng spends one current Star");
  if (!input.targetAlive) return reject("target_dead", "Kuangfeng cannot mark a dead role");
  return accept({
    skillId: "kuangfeng",
    ownerId: input.context.ownerId,
    discardStarCardIds: [input.selectedStarCardId],
    targetId: input.targetId,
    targetMayBeOwner: true,
    effect: "fire_damage_plus_one",
    expiresBeforeOwnerNextTurn: true,
    clearsIfOwnerDies: true,
  });
}

export interface DawuInput {
  readonly context: GodPhaseContext;
  readonly starCardIds: readonly CardId[];
  readonly selectedStarCardIds: readonly CardId[];
  readonly targets: readonly { readonly id: PlayerId; readonly alive: boolean }[];
}

export interface DawuPlan {
  readonly skillId: "dawu";
  readonly ownerId: PlayerId;
  readonly discardStarCardIds: readonly CardId[];
  readonly targetIds: readonly PlayerId[];
  readonly targetsMayIncludeOwner: true;
  readonly effect: "prevent_non_thunder_damage";
  readonly doesNotPreventHpLoss: true;
  readonly expiresBeforeOwnerNextTurn: true;
  readonly clearsIfOwnerDies: true;
}

export function planDawu(input: DawuInput): GodRuleResult<DawuPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Dawu input must be an object");
  const phaseFailure = validateOwnerPhase(input.context, "end");
  if (phaseFailure) return phaseFailure;
  if (!uniqueIds(input.starCardIds) || !uniqueIds(input.selectedStarCardIds) || !Array.isArray(input.targets)) {
    return reject("invalid_input", "Dawu Star or target facts are malformed");
  }
  if (input.selectedStarCardIds.length === 0 || input.selectedStarCardIds.length !== input.targets.length) {
    return reject("invalid_choice", "Dawu spends one Star for each of one or more targets");
  }
  if (input.selectedStarCardIds.some((id) => !input.starCardIds.includes(id))) return reject("insufficient_cards", "Dawu selected a missing Star");
  const targetIds = new Set<string>();
  for (const target of input.targets) {
    if (!isRecord(target) || !isNonemptyId(target.id) || targetIds.has(target.id) || typeof target.alive !== "boolean") {
      return reject("invalid_input", "Dawu targets are malformed or duplicate");
    }
    if (!target.alive) return reject("target_dead", "Dawu cannot mark a dead role");
    targetIds.add(target.id);
  }
  return accept({
    skillId: "dawu",
    ownerId: input.context.ownerId,
    discardStarCardIds: [...input.selectedStarCardIds],
    targetIds: input.targets.map((target) => target.id),
    targetsMayIncludeOwner: true,
    effect: "prevent_non_thunder_damage",
    doesNotPreventHpLoss: true,
    expiresBeforeOwnerNextTurn: true,
    clearsIfOwnerDies: true,
  });
}

export interface QixingWeatherDamageInput {
  readonly targetId: PlayerId;
  readonly targetAlive: boolean;
  readonly baseDamage: number;
  readonly nature: DamageNature;
  readonly kuangfengApplied: boolean;
  readonly dawuApplied: boolean;
}

export interface QixingWeatherDamagePlan {
  readonly targetId: PlayerId;
  readonly prevented: boolean;
  readonly finalDamage: number;
  readonly kuangfengBonus: 0 | 1;
  readonly dawuChecksBeforeKuangfeng: true;
  readonly preventedChainDamageDoesNotUnchain: true;
}

export function planQixingWeatherDamage(input: QixingWeatherDamageInput): GodRuleResult<QixingWeatherDamagePlan> {
  if (!isRecord(input)
    || !isNonemptyId(input.targetId)
    || typeof input.targetAlive !== "boolean"
    || !isPositiveInteger(input.baseDamage)
    || !member(["normal", "fire", "thunder"] as const, input.nature)
    || typeof input.kuangfengApplied !== "boolean"
    || typeof input.dawuApplied !== "boolean"
  ) return reject("invalid_input", "Qixing weather damage facts are malformed");
  if (!input.targetAlive) return reject("target_dead", "damage cannot resolve against a dead target");
  const prevented = input.dawuApplied && input.nature !== "thunder";
  const kuangfengBonus: 0 | 1 = !prevented && input.kuangfengApplied && input.nature === "fire" ? 1 : 0;
  return accept({
    targetId: input.targetId,
    prevented,
    finalDamage: prevented ? 0 : input.baseDamage + kuangfengBonus,
    kuangfengBonus,
    dawuChecksBeforeKuangfeng: true,
    preventedChainDamageDoesNotUnchain: true,
  });
}

export interface QixingWeatherCleanupInput {
  readonly ownerId: PlayerId;
  readonly reason: "owner_next_turn_start" | "owner_death";
  readonly kuangfengTargetIds: readonly PlayerId[];
  readonly dawuTargetIds: readonly PlayerId[];
}

export interface QixingWeatherCleanupPlan {
  readonly ownerId: PlayerId;
  readonly reason: "owner_next_turn_start" | "owner_death";
  readonly clearKuangfengTargetIds: readonly PlayerId[];
  readonly clearDawuTargetIds: readonly PlayerId[];
  readonly clearOnlyEffectsOwnedByThisSource: true;
}

export function planQixingWeatherCleanup(input: QixingWeatherCleanupInput): GodRuleResult<QixingWeatherCleanupPlan> {
  if (!isRecord(input)
    || !isNonemptyId(input.ownerId)
    || (input.reason !== "owner_next_turn_start" && input.reason !== "owner_death")
    || !uniqueIds(input.kuangfengTargetIds)
    || !uniqueIds(input.dawuTargetIds)
  ) return reject("invalid_input", "Qixing weather cleanup facts are malformed");
  return accept({
    ownerId: input.ownerId,
    reason: input.reason,
    clearKuangfengTargetIds: [...input.kuangfengTargetIds],
    clearDawuTargetIds: [...input.dawuTargetIds],
    clearOnlyEffectsOwnedByThisSource: true,
  });
}

// ---------------------------------------------------------------------------
// Shen Cao Cao: Guixin, Feiying

export interface GuixinDamageWindowInput {
  readonly context: GodSkillContext;
  readonly damageAmount: number;
}

export interface GuixinDamageWindowPlan {
  readonly skillId: "guixin";
  readonly ownerId: PlayerId;
  readonly independentOptionalWindows: number;
  readonly completeEachWindowBeforeOpeningNext: true;
  readonly resnapshotZonesForEveryWindow: true;
}

export function planGuixinDamageWindows(input: GuixinDamageWindowInput): GodRuleResult<GuixinDamageWindowPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Guixin damage-window input must be an object");
  const contextFailure = validateSkillContext(input.context);
  if (contextFailure) return contextFailure;
  if (!isPositiveInteger(input.damageAmount)) return reject("invalid_input", "Guixin requires positive sustained damage");
  return accept({
    skillId: "guixin",
    ownerId: input.context.ownerId,
    independentOptionalWindows: input.damageAmount,
    completeEachWindowBeforeOpeningNext: true,
    resnapshotZonesForEveryWindow: true,
  });
}

export type GuixinZone = "hand" | "equipment" | "judgment";

export interface GuixinOtherPlayer {
  readonly id: PlayerId;
  readonly alive: boolean;
  readonly handCardIds: readonly CardId[];
  readonly equipmentCardIds: readonly CardId[];
  readonly judgmentCardIds: readonly CardId[];
  readonly selected: { readonly zone: GuixinZone; readonly cardId: CardId } | null;
}

export interface GuixinPointInput {
  readonly context: GodSkillContext;
  readonly decision: "invoke" | "decline";
  /** Other roles in seat order from the owner. */
  readonly otherPlayers: readonly GuixinOtherPlayer[];
  readonly ownerFaceUp: boolean;
}

export interface GuixinPointPlan {
  readonly skillId: "guixin";
  readonly ownerId: PlayerId;
  readonly invoked: boolean;
  readonly gainSteps: readonly {
    readonly fromPlayerId: PlayerId;
    readonly zone: GuixinZone;
    readonly cardId: CardId;
    readonly handCardSelectionIsAnonymousServerRandom: boolean;
  }[];
  readonly faceUpBefore: boolean;
  readonly faceUpAfter: boolean;
  readonly sequence: readonly ["gain_one_from_every_eligible_other_in_seat_order", "turn_over"];
}

export function planGuixinPoint(input: GuixinPointInput): GodRuleResult<GuixinPointPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Guixin point input must be an object");
  const contextFailure = validateSkillContext(input.context);
  if (contextFailure) return contextFailure;
  if ((input.decision !== "invoke" && input.decision !== "decline")
    || !Array.isArray(input.otherPlayers)
    || typeof input.ownerFaceUp !== "boolean"
  ) return reject("invalid_input", "Guixin choice or posture facts are malformed");
  const playerIds = new Set<string>();
  const allCardIds = new Set<string>();
  const eligible: GuixinOtherPlayer[] = [];
  for (const player of input.otherPlayers) {
    if (!isRecord(player)
      || !isNonemptyId(player.id)
      || player.id === input.context.ownerId
      || playerIds.has(player.id)
      || typeof player.alive !== "boolean"
      || !uniqueIds(player.handCardIds)
      || !uniqueIds(player.equipmentCardIds)
      || !uniqueIds(player.judgmentCardIds)
      || !disjointIds([player.handCardIds, player.equipmentCardIds, player.judgmentCardIds])
      || (player.selected !== null && (!isRecord(player.selected)
        || !member(["hand", "equipment", "judgment"] as const, player.selected.zone)
        || !isNonemptyId(player.selected.cardId)))
    ) return reject("invalid_input", "Guixin other-player snapshot is malformed");
    playerIds.add(player.id);
    for (const id of [...player.handCardIds, ...player.equipmentCardIds, ...player.judgmentCardIds]) {
      if (allCardIds.has(id)) return reject("invalid_input", "a card appears in multiple Guixin player zones");
      allCardIds.add(id);
    }
    if (player.alive && player.handCardIds.length + player.equipmentCardIds.length + player.judgmentCardIds.length > 0) {
      eligible.push(player as unknown as GuixinOtherPlayer);
    }
  }
  if (input.decision === "decline") {
    if (input.otherPlayers.some((player) => player.selected !== null)) return reject("invalid_choice", "declined Guixin has no card selections");
    return accept({
      skillId: "guixin",
      ownerId: input.context.ownerId,
      invoked: false,
      gainSteps: [],
      faceUpBefore: input.ownerFaceUp,
      faceUpAfter: input.ownerFaceUp,
      sequence: ["gain_one_from_every_eligible_other_in_seat_order", "turn_over"],
    });
  }
  if (input.otherPlayers.some((player) => !eligible.includes(player as unknown as GuixinOtherPlayer) && player.selected !== null)) {
    return reject("invalid_choice", "Guixin cannot select from a dead or empty role");
  }
  if (eligible.length === 0) return reject("condition_not_met", "Guixin cannot be invoked when no other role has an ordinary-zone card");
  const gainSteps: GuixinPointPlan["gainSteps"][number][] = [];
  for (const player of input.otherPlayers) {
    const isEligible = eligible.includes(player);
    if (!isEligible) {
      if (player.selected !== null) return reject("invalid_choice", "Guixin cannot select from a dead or empty role");
      continue;
    }
    if (player.selected === null) return reject("invalid_choice", "invoked Guixin must take one card from every eligible role");
    const zoneIds = player.selected.zone === "hand"
      ? player.handCardIds
      : player.selected.zone === "equipment"
        ? player.equipmentCardIds
        : player.judgmentCardIds;
    if (!zoneIds.includes(player.selected.cardId)) return reject("invalid_card", "Guixin selected a card outside the declared target zone");
    gainSteps.push({
      fromPlayerId: player.id,
      zone: player.selected.zone,
      cardId: player.selected.cardId,
      handCardSelectionIsAnonymousServerRandom: player.selected.zone === "hand",
    });
  }
  return accept({
    skillId: "guixin",
    ownerId: input.context.ownerId,
    invoked: true,
    gainSteps,
    faceUpBefore: input.ownerFaceUp,
    faceUpAfter: !input.ownerFaceUp,
    sequence: ["gain_one_from_every_eligible_other_in_seat_order", "turn_over"],
  });
}

export interface FeiyingDistanceInput {
  readonly sourceId: PlayerId;
  readonly targetId: PlayerId;
  readonly targetAlive: boolean;
  readonly targetHasEffectiveFeiying: boolean;
  readonly baseDistance: number;
}

export interface FeiyingDistancePlan {
  readonly skillId: "feiying";
  readonly distance: number;
  readonly modifier: 0 | 1;
  readonly outgoingDistanceUnaffected: true;
}

export function planFeiyingDistance(input: FeiyingDistanceInput): GodRuleResult<FeiyingDistancePlan> {
  if (!isRecord(input)
    || !isNonemptyId(input.sourceId)
    || !isNonemptyId(input.targetId)
    || input.sourceId === input.targetId
    || typeof input.targetAlive !== "boolean"
    || typeof input.targetHasEffectiveFeiying !== "boolean"
    || !isPositiveInteger(input.baseDistance)
  ) return reject("invalid_input", "Feiying distance facts are malformed");
  const modifier: 0 | 1 = input.targetAlive && input.targetHasEffectiveFeiying ? 1 : 0;
  return accept({ skillId: "feiying", distance: input.baseDistance + modifier, modifier, outgoingDistanceUnaffected: true });
}

// ---------------------------------------------------------------------------
// Shen Lu Bu: Kuangbao, Wumou, Wuqian, Shenfen

export interface KuangbaoInitialInput {
  readonly context: GodSkillContext;
  readonly gameStarting: boolean;
  readonly existingRageMarks: number;
}

export interface KuangbaoInitialPlan {
  readonly skillId: "kuangbao";
  readonly ownerId: PlayerId;
  readonly rageMarkDelta: 2;
  readonly rageMarksAfter: number;
}

export function planKuangbaoInitial(input: KuangbaoInitialInput): GodRuleResult<KuangbaoInitialPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Kuangbao initial input must be an object");
  const contextFailure = validateSkillContext(input.context);
  if (contextFailure) return contextFailure;
  if (typeof input.gameStarting !== "boolean" || !isNonnegativeInteger(input.existingRageMarks)) {
    return reject("invalid_input", "Kuangbao game-start facts are malformed");
  }
  if (!input.gameStarting) return reject("wrong_timing", "Kuangbao starts with two Rage marks at game start");
  return accept({ skillId: "kuangbao", ownerId: input.context.ownerId, rageMarkDelta: 2, rageMarksAfter: input.existingRageMarks + 2 });
}

export interface KuangbaoDamageInput {
  readonly context: GodSkillContext;
  readonly sourceId: PlayerId | null;
  readonly targetId: PlayerId;
  readonly damageAmount: number;
}

export interface KuangbaoDamagePlan {
  readonly skillId: "kuangbao";
  readonly ownerId: PlayerId;
  readonly sourceSideMarkDelta: number;
  readonly targetSideMarkDelta: number;
  readonly totalRageMarkDelta: number;
  readonly selfDamageGainsTwoPerPoint: boolean;
  readonly timing: readonly ["after_damage_source_skills", "after_damage_target_skills"];
}

export function planKuangbaoDamage(input: KuangbaoDamageInput): GodRuleResult<KuangbaoDamagePlan> {
  if (!isRecord(input)) return reject("invalid_input", "Kuangbao damage input must be an object");
  const contextFailure = validateSkillContext(input.context);
  if (contextFailure) return contextFailure;
  if ((input.sourceId !== null && !isNonemptyId(input.sourceId))
    || !isNonemptyId(input.targetId)
    || !isPositiveInteger(input.damageAmount)
  ) return reject("invalid_input", "Kuangbao damage facts are malformed");
  const sourceSideMarkDelta = input.sourceId === input.context.ownerId ? input.damageAmount : 0;
  const targetSideMarkDelta = input.targetId === input.context.ownerId ? input.damageAmount : 0;
  return accept({
    skillId: "kuangbao",
    ownerId: input.context.ownerId,
    sourceSideMarkDelta,
    targetSideMarkDelta,
    totalRageMarkDelta: sourceSideMarkDelta + targetSideMarkDelta,
    selfDamageGainsTwoPerPoint: sourceSideMarkDelta > 0 && targetSideMarkDelta > 0,
    timing: ["after_damage_source_skills", "after_damage_target_skills"],
  });
}

export interface WumouInput {
  readonly context: GodSkillContext;
  readonly effectiveCardKind: CardKind;
  readonly effectiveCardCategory: CardCategory;
  readonly rageMarks: number;
  readonly choice: "remove_rage" | "lose_hp";
}

export interface WumouPlan {
  readonly skillId: "wumou";
  readonly ownerId: PlayerId;
  readonly rageMarkDelta: -1 | 0;
  readonly loseHp: 0 | 1;
  readonly sequence: readonly ["pay_wumou_cost", "resolve_dying_if_needed", "continue_committed_trick"];
  readonly trickContinuesIfOwnerDies: true;
}

export function planWumou(input: WumouInput): GodRuleResult<WumouPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Wumou input must be an object");
  const contextFailure = validateSkillContext(input.context);
  if (contextFailure) return contextFailure;
  if (!member(KNOWN_KINDS, input.effectiveCardKind)
    || !member(["basic", "trick", "equipment"] as const, input.effectiveCardCategory)
    || !isNonnegativeInteger(input.rageMarks)
    || (input.choice !== "remove_rage" && input.choice !== "lose_hp")
  ) return reject("invalid_input", "Wumou card or payment facts are malformed");
  if (input.effectiveCardCategory !== "trick" || member(DELAYED_TRICK_KINDS, input.effectiveCardKind)) {
    return reject("condition_not_met", "Wumou triggers only for an effective ordinary trick");
  }
  if (input.choice === "remove_rage" && input.rageMarks < 1) return reject("insufficient_marks", "Wumou cannot remove a missing Rage mark");
  return accept({
    skillId: "wumou",
    ownerId: input.context.ownerId,
    rageMarkDelta: input.choice === "remove_rage" ? -1 : 0,
    loseHp: input.choice === "lose_hp" ? 1 : 0,
    sequence: ["pay_wumou_cost", "resolve_dying_if_needed", "continue_committed_trick"],
    trickContinuesIfOwnerDies: true,
  });
}

export interface WuqianInput {
  readonly context: GodPhaseContext;
  readonly rageMarks: number;
  readonly targetId: PlayerId;
  readonly targetAlive: boolean;
  readonly previouslyArmorInvalidTargetIds: readonly PlayerId[];
}

export interface WuqianPlan {
  readonly skillId: "wuqian";
  readonly ownerId: PlayerId;
  readonly targetId: PlayerId;
  readonly rageMarkDelta: -2;
  readonly grantWushuangUntilTurnEnd: true;
  readonly armorInvalidTargetIdsUntilTurnEnd: readonly PlayerId[];
  readonly includesVirtualArmorSkills: true;
  readonly targetMayBeOwner: true;
  readonly unlimitedUsesPerPlayPhase: true;
}

export function planWuqian(input: WuqianInput): GodRuleResult<WuqianPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Wuqian input must be an object");
  const phaseFailure = validateOwnerPhase(input.context, "play");
  if (phaseFailure) return phaseFailure;
  if (!isNonnegativeInteger(input.rageMarks)
    || !isNonemptyId(input.targetId)
    || typeof input.targetAlive !== "boolean"
    || !uniqueIds(input.previouslyArmorInvalidTargetIds)
  ) return reject("invalid_input", "Wuqian mark or target facts are malformed");
  if (input.rageMarks < 2) return reject("insufficient_marks", "Wuqian spends two Rage marks");
  if (!input.targetAlive) return reject("target_dead", "Wuqian cannot target a dead role");
  return accept({
    skillId: "wuqian",
    ownerId: input.context.ownerId,
    targetId: input.targetId,
    rageMarkDelta: -2,
    grantWushuangUntilTurnEnd: true,
    armorInvalidTargetIdsUntilTurnEnd: [...new Set([...input.previouslyArmorInvalidTargetIds, input.targetId])],
    includesVirtualArmorSkills: true,
    targetMayBeOwner: true,
    unlimitedUsesPerPlayPhase: true,
  });
}

export interface ShenfenInput {
  readonly context: GodPhaseContext;
  readonly rageMarks: number;
  readonly usedThisPlayPhase: boolean;
  /** Other living roles in circular seat order from Shen Lu Bu. */
  readonly otherPlayers: readonly { readonly id: PlayerId; readonly alive: boolean }[];
}

export interface ShenfenPlan {
  readonly skillId: "shenfen";
  readonly ownerId: PlayerId;
  readonly rageMarkDelta: -6;
  readonly consumePlayPhaseUse: true;
  readonly targetIds: readonly PlayerId[];
  readonly stages: readonly [
    "damage_each_other_in_seat_order",
    "each_survivor_discards_all_equipment",
    "each_survivor_discards_four_or_all_hand_cards",
    "owner_turns_over_if_alive"
  ];
  readonly damageNature: "normal";
  readonly damageSourceId: PlayerId;
  readonly insertDyingAfterEachDamage: true;
  readonly committedSkillContinuesIfOwnerDies: true;
  readonly stopsOnlyIfGameEnds: true;
}

export function planShenfen(input: ShenfenInput): GodRuleResult<ShenfenPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Shenfen input must be an object");
  const phaseFailure = validateOwnerPhase(input.context, "play");
  if (phaseFailure) return phaseFailure;
  if (!isNonnegativeInteger(input.rageMarks)
    || typeof input.usedThisPlayPhase !== "boolean"
    || !Array.isArray(input.otherPlayers)
  ) return reject("invalid_input", "Shenfen marks or player order are malformed");
  if (input.usedThisPlayPhase) return reject("already_used", "Shenfen is limited to once per play phase");
  if (input.rageMarks < 6) return reject("insufficient_marks", "Shenfen spends six Rage marks");
  const seen = new Set<string>();
  for (const player of input.otherPlayers) {
    if (!isRecord(player)
      || !isNonemptyId(player.id)
      || player.id === input.context.ownerId
      || seen.has(player.id)
      || typeof player.alive !== "boolean"
    ) return reject("invalid_input", "Shenfen other-player order is malformed");
    seen.add(player.id);
  }
  return accept({
    skillId: "shenfen",
    ownerId: input.context.ownerId,
    rageMarkDelta: -6,
    consumePlayPhaseUse: true,
    targetIds: input.otherPlayers.filter((player) => player.alive).map((player) => player.id),
    stages: [
      "damage_each_other_in_seat_order",
      "each_survivor_discards_all_equipment",
      "each_survivor_discards_four_or_all_hand_cards",
      "owner_turns_over_if_alive",
    ],
    damageNature: "normal",
    damageSourceId: input.context.ownerId,
    insertDyingAfterEachDamage: true,
    committedSkillContinuesIfOwnerDies: true,
    stopsOnlyIfGameEnds: true,
  });
}

export interface ShenfenVictimDiscardInput {
  readonly targetId: PlayerId;
  readonly targetAliveAtDiscardStages: boolean;
  readonly equipmentCardIds: readonly CardId[];
  readonly handCardIds: readonly CardId[];
  readonly selectedHandCardIds: readonly CardId[];
}

export interface ShenfenVictimDiscardPlan {
  readonly skillId: "shenfen";
  readonly targetId: PlayerId;
  readonly discardEquipmentCardIds: readonly CardId[];
  readonly requestedHandDiscardCount: 4;
  readonly discardHandCardIds: readonly CardId[];
  readonly skippedBecauseDead: boolean;
  readonly equipmentBatchPrecedesHandBatch: true;
}

export function planShenfenVictimDiscard(input: ShenfenVictimDiscardInput): GodRuleResult<ShenfenVictimDiscardPlan> {
  if (!isRecord(input)
    || !isNonemptyId(input.targetId)
    || typeof input.targetAliveAtDiscardStages !== "boolean"
    || !uniqueIds(input.equipmentCardIds)
    || !uniqueIds(input.handCardIds)
    || !uniqueIds(input.selectedHandCardIds)
    || !disjointIds([input.equipmentCardIds, input.handCardIds])
  ) return reject("invalid_input", "Shenfen victim zones are malformed");
  if (!input.targetAliveAtDiscardStages) {
    if (input.selectedHandCardIds.length !== 0) return reject("invalid_choice", "a dead Shenfen target makes no discard choice");
    return accept({
      skillId: "shenfen",
      targetId: input.targetId,
      discardEquipmentCardIds: [],
      requestedHandDiscardCount: 4,
      discardHandCardIds: [],
      skippedBecauseDead: true,
      equipmentBatchPrecedesHandBatch: true,
    });
  }
  const required = Math.min(4, input.handCardIds.length);
  if (input.selectedHandCardIds.length !== required || input.selectedHandCardIds.some((id) => !input.handCardIds.includes(id))) {
    return reject("invalid_choice", "Shenfen discards four hand cards or the entire smaller hand");
  }
  return accept({
    skillId: "shenfen",
    targetId: input.targetId,
    discardEquipmentCardIds: [...input.equipmentCardIds],
    requestedHandDiscardCount: 4,
    discardHandCardIds: [...input.selectedHandCardIds],
    skippedBecauseDead: false,
    equipmentBatchPrecedesHandBatch: true,
  });
}

// ---------------------------------------------------------------------------
// Shen Zhao Yun: Juejing, Longhun

export interface JuejingDrawInput {
  readonly context: GodSkillContext;
  readonly ownerHp: number;
  readonly ownerMaxHp: number;
  readonly baseDrawCount: number;
}

export interface JuejingDrawPlan {
  readonly skillId: "juejing";
  readonly ownerId: PlayerId;
  readonly lostHp: number;
  readonly additionalDrawCount: number;
  readonly finalDrawCount: number;
  readonly composesWithOtherDrawModifiers: true;
}

export function planJuejingDraw(input: JuejingDrawInput): GodRuleResult<JuejingDrawPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Juejing draw input must be an object");
  const contextFailure = validateSkillContext(input.context);
  if (contextFailure) return contextFailure;
  if (!isSafeInteger(input.ownerHp)
    || !isPositiveInteger(input.ownerMaxHp)
    || input.ownerHp > input.ownerMaxHp
    || !isNonnegativeInteger(input.baseDrawCount)
  ) return reject("invalid_input", "Juejing HP or base draw facts are malformed");
  const lostHp = input.ownerMaxHp - input.ownerHp;
  if (input.baseDrawCount > Number.MAX_SAFE_INTEGER - lostHp) return reject("invalid_input", "Juejing draw count would overflow");
  return accept({
    skillId: "juejing",
    ownerId: input.context.ownerId,
    lostHp,
    additionalDrawCount: lostHp,
    finalDrawCount: input.baseDrawCount + lostHp,
    composesWithOtherDrawModifiers: true,
  });
}

export interface JuejingHandLimitInput {
  readonly ownerId: PlayerId;
  readonly ownerAlive: boolean;
  readonly skillEffective: boolean;
  readonly baseHandLimit: number;
}

export interface JuejingHandLimitPlan {
  readonly skillId: "juejing";
  readonly ownerId: PlayerId;
  readonly modifier: 2;
  readonly finalHandLimit: number;
}

export function planJuejingHandLimit(input: JuejingHandLimitInput): GodRuleResult<JuejingHandLimitPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Juejing hand-limit input must be an object");
  const contextFailure = validateSkillContext(input);
  if (contextFailure) return contextFailure;
  if (!isNonnegativeInteger(input.baseHandLimit) || input.baseHandLimit > Number.MAX_SAFE_INTEGER - 2) {
    return reject("invalid_input", "Juejing base hand limit is malformed");
  }
  return accept({ skillId: "juejing", ownerId: input.ownerId, modifier: 2, finalHandLimit: input.baseHandLimit + 2 });
}

export type LonghunEffectiveKind = "peach" | "fire_slash" | "dodge" | "wu_xie_ke_ji";

export interface LonghunComponent {
  readonly card: GodRuleCard;
  readonly effectiveSuit: CardSuit;
}

export interface LonghunInput {
  readonly context: GodSkillContext;
  readonly ownerHp: number;
  readonly ownerHandCount: number;
  readonly components: readonly LonghunComponent[];
  readonly requestedKind: LonghunEffectiveKind;
  readonly method: Exclude<CardUseMethod, "recast">;
  readonly requestedCardTimingLegal: boolean;
}

export interface LonghunPlan {
  readonly skillId: "longhun";
  readonly ownerId: PlayerId;
  readonly requiredCardCount: number;
  readonly physicalCardIds: readonly CardId[];
  readonly effectiveSuit: CardSuit;
  readonly effectiveKind: LonghunEffectiveKind;
  readonly effectiveRank: CardRank | null;
  readonly method: "use" | "respond";
  readonly consumesHandAndOrEquipmentAtomically: true;
  readonly normalTargetQuotaAndRangeStillApply: true;
  readonly countsAsLastHandCardForFangTian: boolean;
}

function longhunKindForSuit(suit: CardSuit): LonghunEffectiveKind {
  if (suit === "heart") return "peach";
  if (suit === "diamond") return "fire_slash";
  if (suit === "club") return "dodge";
  return "wu_xie_ke_ji";
}

export function evaluateLonghun(input: LonghunInput): GodRuleResult<LonghunPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Longhun input must be an object");
  const contextFailure = validateSkillContext(input.context);
  if (contextFailure) return contextFailure;
  if (!isSafeInteger(input.ownerHp)
    || !isNonnegativeInteger(input.ownerHandCount)
    || !Array.isArray(input.components)
    || !member(["peach", "fire_slash", "dodge", "wu_xie_ke_ji"] as const, input.requestedKind)
    || (input.method !== "use" && input.method !== "respond")
    || typeof input.requestedCardTimingLegal !== "boolean"
  ) return reject("invalid_input", "Longhun HP, method, or request facts are malformed");
  if (!input.requestedCardTimingLegal) return reject("wrong_timing", "the requested Longhun card is not legal now");
  const requiredCardCount = Math.max(input.ownerHp, 1);
  if (input.components.length !== requiredCardCount) return reject("insufficient_cards", "Longhun requires current HP cards, with a minimum of one");
  const ids = new Set<string>();
  let effectiveSuit: CardSuit | null = null;
  for (const component of input.components) {
    if (!isRecord(component)
      || !isGodRuleCard(component.card)
      || !member(SUITS, component.effectiveSuit)
      || ids.has(component.card.id)
    ) return reject("invalid_card", "Longhun component cards are malformed or duplicate");
    if (!ownedPhysicalCard(component.card, input.context.ownerId, ["hand", "equipment"])) {
      return reject("invalid_card", "Longhun uses only the owner's physical hand/equipment cards");
    }
    if (effectiveSuit !== null && effectiveSuit !== component.effectiveSuit) {
      return reject("invalid_card", "Longhun component cards must share one effective suit");
    }
    effectiveSuit = component.effectiveSuit;
    ids.add(component.card.id);
  }
  if (effectiveSuit === null) return reject("invalid_card", "Longhun requires at least one component card");
  if (longhunKindForSuit(effectiveSuit) !== input.requestedKind) return reject("invalid_choice", "Longhun requested kind does not match its effective suit");
  const allFromHand = input.components.every((component) => component.card.zone === "hand");
  return accept({
    skillId: "longhun",
    ownerId: input.context.ownerId,
    requiredCardCount,
    physicalCardIds: input.components.map((component) => component.card.id),
    effectiveSuit,
    effectiveKind: input.requestedKind,
    effectiveRank: input.components.length === 1 ? input.components[0]!.card.rank : null,
    method: input.method,
    consumesHandAndOrEquipmentAtomically: true,
    normalTargetQuotaAndRangeStillApply: true,
    countsAsLastHandCardForFangTian: allFromHand && input.components.length === input.ownerHandCount,
  });
}

// ---------------------------------------------------------------------------
// Shen Si Ma Yi: Renjie, Baiyin, Jilue, Lianpo

export interface RenjieDamageInput {
  readonly context: GodSkillContext;
  readonly damageAmount: number;
}

export interface RenjieDamagePlan {
  readonly skillId: "renjie";
  readonly ownerId: PlayerId;
  readonly renMarkDelta: number;
  readonly beforeOptionalJilueFangzhu: true;
}

export function planRenjieDamage(input: RenjieDamageInput): GodRuleResult<RenjieDamagePlan> {
  if (!isRecord(input)) return reject("invalid_input", "Renjie damage input must be an object");
  const contextFailure = validateSkillContext(input.context);
  if (contextFailure) return contextFailure;
  if (!isPositiveInteger(input.damageAmount)) return reject("invalid_input", "Renjie requires positive sustained damage");
  return accept({ skillId: "renjie", ownerId: input.context.ownerId, renMarkDelta: input.damageAmount, beforeOptionalJilueFangzhu: true });
}

export interface RenjieDiscardInput {
  readonly context: GodSkillContext;
  readonly phase: TurnPhase;
  readonly discardedByOwner: boolean;
  readonly discardedHandCardIds: readonly CardId[];
  readonly discardedNonHandCardIds: readonly CardId[];
}

export interface RenjieDiscardPlan {
  readonly skillId: "renjie";
  readonly ownerId: PlayerId;
  readonly renMarkDelta: number;
  readonly countedHandCardIds: readonly CardId[];
  readonly ignoredNonHandCardIds: readonly CardId[];
}

export function planRenjieDiscard(input: RenjieDiscardInput): GodRuleResult<RenjieDiscardPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Renjie discard input must be an object");
  const contextFailure = validateSkillContext(input.context);
  if (contextFailure) return contextFailure;
  if (!member(PHASES, input.phase)
    || typeof input.discardedByOwner !== "boolean"
    || !uniqueIds(input.discardedHandCardIds)
    || !uniqueIds(input.discardedNonHandCardIds)
    || !disjointIds([input.discardedHandCardIds, input.discardedNonHandCardIds])
  ) return reject("invalid_input", "Renjie discard facts are malformed");
  if (input.phase !== "discard" || !input.discardedByOwner) {
    return accept({ skillId: "renjie", ownerId: input.context.ownerId, renMarkDelta: 0, countedHandCardIds: [], ignoredNonHandCardIds: [...input.discardedNonHandCardIds] });
  }
  return accept({
    skillId: "renjie",
    ownerId: input.context.ownerId,
    renMarkDelta: input.discardedHandCardIds.length,
    countedHandCardIds: [...input.discardedHandCardIds],
    ignoredNonHandCardIds: [...input.discardedNonHandCardIds],
  });
}

export interface BaiyinInput {
  readonly context: GodPhaseContext;
  readonly alreadyAwakened: boolean;
  readonly renMarks: number;
  readonly ownerHp: number;
  readonly ownerMaxHp: number;
}

export interface BaiyinPlan {
  readonly skillId: "baiyin";
  readonly ownerId: PlayerId;
  readonly mandatory: true;
  readonly maxHpBefore: number;
  readonly maxHpAfter: number;
  readonly hpAfter: number;
  readonly consumeAwakening: true;
  readonly grantSkillIds: readonly ["jilue"];
  readonly renMarksRetained: true;
}

export function planBaiyin(input: BaiyinInput): GodRuleResult<BaiyinPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Baiyin input must be an object");
  const phaseFailure = validateOwnerPhase(input.context, "prepare");
  if (phaseFailure) return phaseFailure;
  if (typeof input.alreadyAwakened !== "boolean"
    || !isNonnegativeInteger(input.renMarks)
    || !isPositiveInteger(input.ownerHp)
    || !isPositiveInteger(input.ownerMaxHp)
    || input.ownerHp > input.ownerMaxHp
  ) return reject("invalid_input", "Baiyin marks or HP facts are malformed");
  if (input.alreadyAwakened) return reject("already_awakened", "Baiyin has already awakened");
  if (input.renMarks < 4) return reject("condition_not_met", "Baiyin requires at least four Ren marks");
  if (input.ownerMaxHp <= 1) return reject("invalid_input", "Baiyin cannot reduce maximum HP below one");
  const maxHpAfter = input.ownerMaxHp - 1;
  return accept({
    skillId: "baiyin",
    ownerId: input.context.ownerId,
    mandatory: true,
    maxHpBefore: input.ownerMaxHp,
    maxHpAfter,
    hpAfter: Math.min(input.ownerHp, maxHpAfter),
    consumeAwakening: true,
    grantSkillIds: ["jilue"],
    renMarksRetained: true,
  });
}

export interface JilueContext extends GodSkillContext {
  readonly awakened: boolean;
  readonly renMarks: number;
}

function validateJilueContext(value: unknown): GodRuleResult<never> | null {
  const contextFailure = validateSkillContext(value);
  if (contextFailure) return contextFailure;
  if (!isRecord(value) || typeof value.awakened !== "boolean" || !isNonnegativeInteger(value.renMarks)) {
    return reject("invalid_input", "Jilue awakening or Ren-mark facts are malformed");
  }
  if (!value.awakened) return reject("not_awakened", "Jilue is unavailable before Baiyin");
  if (value.renMarks < 1) return reject("insufficient_marks", "Jilue spends one Ren mark per invocation");
  return null;
}

export interface JilueGuicaiInput {
  readonly context: JilueContext;
  readonly judgmentPending: boolean;
  readonly originalJudgmentCardId: CardId;
  readonly replacementCard: GodRuleCard;
}

export interface JilueGuicaiPlan {
  readonly skillId: "jilue";
  readonly borrowedSkillId: "guicai";
  readonly ownerId: PlayerId;
  readonly renMarkDelta: -1;
  readonly originalJudgmentCardId: CardId;
  readonly replacementCardId: CardId;
  readonly replacementMustBeHandCard: true;
}

export function planJilueGuicai(input: JilueGuicaiInput): GodRuleResult<JilueGuicaiPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Jilue Guicai input must be an object");
  const contextFailure = validateJilueContext(input.context);
  if (contextFailure) return contextFailure;
  if (typeof input.judgmentPending !== "boolean"
    || !isNonemptyId(input.originalJudgmentCardId)
    || !isGodRuleCard(input.replacementCard)
  ) return reject("invalid_input", "Jilue Guicai judgment facts are malformed");
  if (!input.judgmentPending) return reject("wrong_timing", "Guicai replaces a judgment before it becomes effective");
  if (!ownedPhysicalCard(input.replacementCard, input.context.ownerId, ["hand"])
    || input.replacementCard.id === input.originalJudgmentCardId
  ) return reject("invalid_card", "repository-era Guicai requires one distinct owned physical hand card");
  return accept({
    skillId: "jilue",
    borrowedSkillId: "guicai",
    ownerId: input.context.ownerId,
    renMarkDelta: -1,
    originalJudgmentCardId: input.originalJudgmentCardId,
    replacementCardId: input.replacementCard.id,
    replacementMustBeHandCard: true,
  });
}

export interface JilueFangzhuInput {
  readonly context: JilueContext;
  readonly damageAmount: number;
  readonly ownerHp: number;
  readonly ownerMaxHp: number;
  readonly targetId: PlayerId;
  readonly targetAlive: boolean;
  readonly targetFaceUp: boolean;
}

export interface JilueFangzhuPlan {
  readonly skillId: "jilue";
  readonly borrowedSkillId: "fangzhu";
  readonly ownerId: PlayerId;
  readonly targetId: PlayerId;
  readonly renMarkDelta: -1;
  readonly triggerCountForDamageEvent: 1;
  readonly faceUpAfter: boolean;
  readonly drawCount: number;
  readonly sequence: readonly ["turn_over", "draw"];
}

export function planJilueFangzhu(input: JilueFangzhuInput): GodRuleResult<JilueFangzhuPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Jilue Fangzhu input must be an object");
  const contextFailure = validateJilueContext(input.context);
  if (contextFailure) return contextFailure;
  if (!isPositiveInteger(input.damageAmount)
    || !isSafeInteger(input.ownerHp)
    || !isPositiveInteger(input.ownerMaxHp)
    || input.ownerHp > input.ownerMaxHp
    || !isNonemptyId(input.targetId)
    || typeof input.targetAlive !== "boolean"
    || typeof input.targetFaceUp !== "boolean"
  ) return reject("invalid_input", "Jilue Fangzhu damage, HP, or target facts are malformed");
  if (input.targetId === input.context.ownerId) return reject("invalid_target", "Fangzhu targets another role");
  if (!input.targetAlive) return reject("target_dead", "Fangzhu cannot target a dead role");
  return accept({
    skillId: "jilue",
    borrowedSkillId: "fangzhu",
    ownerId: input.context.ownerId,
    targetId: input.targetId,
    renMarkDelta: -1,
    triggerCountForDamageEvent: 1,
    faceUpAfter: !input.targetFaceUp,
    drawCount: input.ownerMaxHp - input.ownerHp,
    sequence: ["turn_over", "draw"],
  });
}

export interface JilueJizhiInput {
  readonly context: JilueContext;
  readonly effectiveCardKind: CardKind;
  readonly effectiveCardCategory: CardCategory;
}

export interface JilueJizhiPlan {
  readonly skillId: "jilue";
  readonly borrowedSkillId: "jizhi";
  readonly ownerId: PlayerId;
  readonly renMarkDelta: -1;
  readonly drawCount: 1;
  readonly onceForThisTrickUse: true;
}

export function planJilueJizhi(input: JilueJizhiInput): GodRuleResult<JilueJizhiPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Jilue Jizhi input must be an object");
  const contextFailure = validateJilueContext(input.context);
  if (contextFailure) return contextFailure;
  if (!member(KNOWN_KINDS, input.effectiveCardKind)
    || !member(["basic", "trick", "equipment"] as const, input.effectiveCardCategory)
  ) return reject("invalid_input", "Jilue Jizhi card facts are malformed");
  if (input.effectiveCardCategory !== "trick" || member(DELAYED_TRICK_KINDS, input.effectiveCardKind)) {
    return reject("condition_not_met", "Jizhi follows use of an effective ordinary trick");
  }
  return accept({ skillId: "jilue", borrowedSkillId: "jizhi", ownerId: input.context.ownerId, renMarkDelta: -1, drawCount: 1, onceForThisTrickUse: true });
}

export interface JilueZhihengInput {
  readonly context: JilueContext & { readonly currentPlayerId: PlayerId; readonly phase: TurnPhase };
  readonly usedZhihengThisPlayPhase: boolean;
  readonly discardCards: readonly GodRuleCard[];
}

export interface JilueZhihengPlan {
  readonly skillId: "jilue";
  readonly borrowedSkillId: "zhiheng";
  readonly ownerId: PlayerId;
  readonly renMarkDelta: -1;
  readonly discardCardIds: readonly CardId[];
  readonly drawCount: number;
  readonly consumeOncePerPlayPhaseUse: true;
  readonly sequence: readonly ["discard_batch", "resolve_card_loss_triggers", "draw_equal"];
}

export function planJilueZhiheng(input: JilueZhihengInput): GodRuleResult<JilueZhihengPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Jilue Zhiheng input must be an object");
  const contextFailure = validateJilueContext(input.context);
  if (contextFailure) return contextFailure;
  const phaseFailure = validateOwnerPhase(input.context, "play");
  if (phaseFailure) return phaseFailure;
  if (typeof input.usedZhihengThisPlayPhase !== "boolean" || !Array.isArray(input.discardCards)) {
    return reject("invalid_input", "Jilue Zhiheng usage facts are malformed");
  }
  if (input.usedZhihengThisPlayPhase) return reject("already_used", "borrowed Zhiheng retains its once-per-play-phase limit");
  if (input.discardCards.length === 0) return reject("insufficient_cards", "Zhiheng requires at least one discardable card");
  const ids = new Set<string>();
  for (const card of input.discardCards) {
    if (!isGodRuleCard(card)
      || ids.has(card.id)
      || !ownedPhysicalCard(card, input.context.ownerId, ["hand", "equipment"])
    ) return reject("invalid_card", "Zhiheng discards unique owned hand/equipment cards");
    ids.add(card.id);
  }
  return accept({
    skillId: "jilue",
    borrowedSkillId: "zhiheng",
    ownerId: input.context.ownerId,
    renMarkDelta: -1,
    discardCardIds: input.discardCards.map((card) => card.id),
    drawCount: input.discardCards.length,
    consumeOncePerPlayPhaseUse: true,
    sequence: ["discard_batch", "resolve_card_loss_triggers", "draw_equal"],
  });
}

export interface JilueWanshaInput {
  readonly context: JilueContext & { readonly currentPlayerId: PlayerId; readonly phase: TurnPhase };
  readonly atPlayPhaseStart: boolean;
  readonly alreadyActiveThisTurn: boolean;
}

export interface JilueWanshaPlan {
  readonly skillId: "jilue";
  readonly borrowedSkillId: "wansha";
  readonly ownerId: PlayerId;
  readonly renMarkDelta: -1;
  readonly activeUntilTurnEnd: true;
  readonly restrictionRequiresOwnerAlive: true;
}

export function planJilueWansha(input: JilueWanshaInput): GodRuleResult<JilueWanshaPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Jilue Wansha input must be an object");
  const contextFailure = validateJilueContext(input.context);
  if (contextFailure) return contextFailure;
  const phaseFailure = validateOwnerPhase(input.context, "play");
  if (phaseFailure) return phaseFailure;
  if (typeof input.atPlayPhaseStart !== "boolean" || typeof input.alreadyActiveThisTurn !== "boolean") {
    return reject("invalid_input", "Jilue Wansha timing facts are malformed");
  }
  if (!input.atPlayPhaseStart) return reject("wrong_timing", "borrowed Wansha is activated at play-phase start");
  if (input.alreadyActiveThisTurn) return reject("already_used", "Wansha is already active for this turn");
  return accept({
    skillId: "jilue",
    borrowedSkillId: "wansha",
    ownerId: input.context.ownerId,
    renMarkDelta: -1,
    activeUntilTurnEnd: true,
    restrictionRequiresOwnerAlive: true,
  });
}

export interface JilueWanshaPeachInput {
  readonly ownerId: PlayerId;
  readonly ownerAlive: boolean;
  readonly effectActive: boolean;
  readonly currentPlayerId: PlayerId;
  readonly peachUserId: PlayerId;
  readonly dyingPlayerId: PlayerId;
}

export interface JilueWanshaPeachDecision {
  readonly skillId: "jilue";
  readonly borrowedSkillId: "wansha";
  readonly peachAllowed: boolean;
  readonly restricted: boolean;
}

export function evaluateJilueWanshaPeach(input: JilueWanshaPeachInput): GodRuleResult<JilueWanshaPeachDecision> {
  if (!isRecord(input)
    || !isNonemptyId(input.ownerId)
    || typeof input.ownerAlive !== "boolean"
    || typeof input.effectActive !== "boolean"
    || !isNonemptyId(input.currentPlayerId)
    || !isNonemptyId(input.peachUserId)
    || !isNonemptyId(input.dyingPlayerId)
  ) return reject("invalid_input", "Jilue Wansha Peach facts are malformed");
  const restricted = input.ownerAlive && input.effectActive && input.currentPlayerId === input.ownerId;
  return accept({
    skillId: "jilue",
    borrowedSkillId: "wansha",
    peachAllowed: !restricted || input.peachUserId === input.ownerId || input.peachUserId === input.dyingPlayerId,
    restricted,
  });
}

export interface LianpoKillInput {
  readonly context: GodSkillContext;
  readonly killerId: PlayerId | null;
  readonly victimId: PlayerId;
  readonly insideAPlayersTurn: boolean;
  readonly activeTurnId: string | null;
}

export interface LianpoKillPlan {
  readonly skillId: "lianpo";
  readonly ownerId: PlayerId;
  readonly qualifies: boolean;
  readonly armedTurnId: string | null;
  readonly multipleKillsStillArmOneExtraTurn: true;
}

export function recordLianpoKill(input: LianpoKillInput): GodRuleResult<LianpoKillPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Lianpo kill input must be an object");
  const contextFailure = validateSkillContext(input.context);
  if (contextFailure) return contextFailure;
  if ((input.killerId !== null && !isNonemptyId(input.killerId))
    || !isNonemptyId(input.victimId)
    || typeof input.insideAPlayersTurn !== "boolean"
    || (input.activeTurnId !== null && !isNonemptyId(input.activeTurnId))
  ) return reject("invalid_input", "Lianpo kill attribution facts are malformed");
  if (input.insideAPlayersTurn !== (input.activeTurnId !== null)) return reject("invalid_input", "Lianpo active-turn identity is inconsistent");
  const qualifies = input.insideAPlayersTurn
    && input.killerId === input.context.ownerId
    && input.victimId !== input.context.ownerId;
  return accept({
    skillId: "lianpo",
    ownerId: input.context.ownerId,
    qualifies,
    armedTurnId: qualifies ? input.activeTurnId : null,
    multipleKillsStillArmOneExtraTurn: true,
  });
}

export interface LianpoExtraTurnInput {
  readonly context: GodSkillContext;
  readonly endedTurnId: string;
  readonly armedTurnId: string | null;
  readonly decision: "take_extra_turn" | "decline";
}

export interface LianpoExtraTurnPlan {
  readonly skillId: "lianpo";
  readonly ownerId: PlayerId;
  readonly queueExtraTurnForPlayerId: PlayerId | null;
  readonly clearArmedTurnId: true;
  readonly insertAfterFullTurnEndWindow: true;
  readonly normalTurnOrderResumesAfterExtraTurn: true;
}

export function planLianpoExtraTurn(input: LianpoExtraTurnInput): GodRuleResult<LianpoExtraTurnPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Lianpo extra-turn input must be an object");
  const contextFailure = validateSkillContext(input.context);
  if (contextFailure) return contextFailure;
  if (!isNonemptyId(input.endedTurnId)
    || (input.armedTurnId !== null && !isNonemptyId(input.armedTurnId))
    || (input.decision !== "take_extra_turn" && input.decision !== "decline")
  ) return reject("invalid_input", "Lianpo turn-end facts are malformed");
  if (input.armedTurnId !== input.endedTurnId) return reject("condition_not_met", "Lianpo was not armed by a kill during this ended turn");
  return accept({
    skillId: "lianpo",
    ownerId: input.context.ownerId,
    queueExtraTurnForPlayerId: input.decision === "take_extra_turn" ? input.context.ownerId : null,
    clearArmedTurnId: true,
    insertAfterFullTurnEndWindow: true,
    normalTurnOrderResumesAfterExtraTurn: true,
  });
}
