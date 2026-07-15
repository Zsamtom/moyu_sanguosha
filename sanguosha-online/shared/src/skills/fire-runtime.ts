import type {
  CardCategory,
  CardId,
  CardRank,
  CardSuit,
  EquipmentSlot,
  Faction,
  PlayerId,
  TurnPhase,
} from "../types.js";

export type FireCardColor = "red" | "black";
export type FireCardZone = "hand" | "equipment" | "judgment";

/**
 * A deliberately small, fully serializable card projection used by the fire
 * package rules. Zone and ownership are part of the input so a caller cannot
 * accidentally authorize a hand-only conversion with an equipped card.
 */
export interface FireRuleCard {
  readonly id: CardId;
  readonly ownerId: PlayerId;
  readonly zone: FireCardZone;
  readonly suit: CardSuit;
  readonly category: CardCategory;
  readonly equipmentSlot: EquipmentSlot | null;
}

export interface FirePlayContext {
  readonly actorId: PlayerId;
  readonly currentPlayerId: PlayerId;
  readonly phase: TurnPhase;
  readonly actorAlive: boolean;
  readonly skillEffective: boolean;
}

export type FireRuleFailureCode =
  | "invalid_input"
  | "not_active_player"
  | "wrong_phase"
  | "owner_dead"
  | "skill_not_effective"
  | "already_used"
  | "invalid_card"
  | "invalid_payment"
  | "invalid_target"
  | "target_dead"
  | "out_of_range"
  | "invalid_timing"
  | "no_candidate"
  | "armor_present"
  | "armor_ignored"
  | "color_mismatch"
  | "limited_skill_consumed"
  | "not_dying";

export type FireRuleResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: FireRuleFailureCode; readonly detail: string };

function accept<T>(value: T): FireRuleResult<T> {
  return { ok: true, value };
}

function reject<T>(code: FireRuleFailureCode, detail: string): FireRuleResult<T> {
  return { ok: false, code, detail };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
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

const SUITS = new Set<string>(["spade", "heart", "club", "diamond"]);
const CATEGORIES = new Set<string>(["basic", "trick", "equipment"]);
const EQUIPMENT_SLOTS = new Set<string>(["weapon", "armor", "offensive_horse", "defensive_horse"]);
const CARD_ZONES = new Set<string>(["hand", "equipment", "judgment"]);
const TURN_PHASES = new Set<string>(["prepare", "judgment", "draw", "play", "respond", "discard", "end"]);
const FACTIONS = new Set<string>(["wei", "shu", "wu", "qun", "god"]);

function isCardSuit(value: unknown): value is CardSuit {
  return typeof value === "string" && SUITS.has(value);
}

function isRank(value: unknown): value is CardRank {
  return isPositiveInteger(value) && value <= 13;
}

function isFireRuleCard(value: unknown): value is FireRuleCard {
  if (!isRecord(value)) return false;
  if (
    !isNonemptyString(value.id) ||
    !isNonemptyString(value.ownerId) ||
    typeof value.zone !== "string" ||
    !CARD_ZONES.has(value.zone) ||
    !isCardSuit(value.suit) ||
    typeof value.category !== "string" ||
    !CATEGORIES.has(value.category) ||
    (value.equipmentSlot !== null && (typeof value.equipmentSlot !== "string" || !EQUIPMENT_SLOTS.has(value.equipmentSlot)))
  ) return false;
  if (value.category === "equipment" && value.equipmentSlot === null) return false;
  if (value.category !== "equipment" && value.equipmentSlot !== null) return false;
  if (value.zone === "equipment" && value.category !== "equipment") return false;
  return true;
}

function playContextFailure(value: unknown): FireRuleResult<never> | null {
  if (
    !isRecord(value) ||
    !isNonemptyString(value.actorId) ||
    !isNonemptyString(value.currentPlayerId) ||
    typeof value.phase !== "string" ||
    !TURN_PHASES.has(value.phase) ||
    typeof value.actorAlive !== "boolean" ||
    typeof value.skillEffective !== "boolean"
  ) return reject("invalid_input", "play context is incomplete or malformed");
  if (!value.actorAlive) return reject("owner_dead", "a dead owner cannot use an active skill");
  if (!value.skillEffective) return reject("skill_not_effective", "the skill is not currently effective");
  if (value.actorId !== value.currentPlayerId) return reject("not_active_player", "the skill owner is not the current player");
  if (value.phase !== "play") return reject("wrong_phase", "the skill can only be used during the play phase");
  return null;
}

function cardColor(suit: CardSuit): FireCardColor {
  return suit === "heart" || suit === "diamond" ? "red" : "black";
}

function uniqueNonemptyIds(value: unknown): value is readonly CardId[] {
  return Array.isArray(value) && value.every(isNonemptyString) && new Set(value).size === value.length;
}

// ---------------------------------------------------------------------------
// Qiangxi

export type QiangxiPayment =
  | { readonly type: "lose_hp" }
  | { readonly type: "discard_weapon"; readonly card: FireRuleCard };

export interface QiangxiInput {
  readonly context: FirePlayContext;
  readonly alreadyUsedThisTurn: boolean;
  readonly actorHp: number;
  readonly targetId: PlayerId;
  readonly targetAlive: boolean;
  /** Both values must be the values before paying the Qiangxi cost. */
  readonly distanceBeforePayment: number;
  readonly attackRangeBeforePayment: number;
  readonly payment: QiangxiPayment;
}

export interface QiangxiPlan {
  readonly skillId: "qiangxi";
  readonly ownerId: PlayerId;
  readonly targetId: PlayerId;
  readonly consumeTurnUse: true;
  readonly distanceCheckedBeforePayment: true;
  readonly payment:
    | { readonly type: "lose_hp"; readonly amount: 1; readonly mayEnterDying: boolean }
    | { readonly type: "discard_weapon"; readonly cardId: CardId; readonly from: "hand" | "equipment" };
  readonly damage: { readonly sourceId: PlayerId; readonly targetId: PlayerId; readonly amount: 1; readonly nature: "normal" };
}

export function evaluateQiangxi(input: QiangxiInput): FireRuleResult<QiangxiPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Qiangxi input must be an object");
  const contextFailure = playContextFailure(input.context);
  if (contextFailure) return contextFailure;
  const context = input.context;
  if (
    typeof input.alreadyUsedThisTurn !== "boolean" ||
    !isPositiveInteger(input.actorHp) ||
    !isNonemptyString(input.targetId) ||
    typeof input.targetAlive !== "boolean" ||
    !isPositiveInteger(input.distanceBeforePayment) ||
    !isPositiveInteger(input.attackRangeBeforePayment) ||
    !isRecord(input.payment)
  ) return reject("invalid_input", "Qiangxi facts are incomplete or malformed");
  if (input.alreadyUsedThisTurn) return reject("already_used", "Qiangxi is limited to once per play phase");
  if (input.targetId === context.actorId) return reject("invalid_target", "Qiangxi must target another player");
  if (!input.targetAlive) return reject("target_dead", "Qiangxi cannot target a dead player");
  if (input.distanceBeforePayment > input.attackRangeBeforePayment) {
    return reject("out_of_range", "the target was outside attack range before payment");
  }

  let payment: QiangxiPlan["payment"];
  if (input.payment.type === "lose_hp") {
    payment = { type: "lose_hp", amount: 1, mayEnterDying: input.actorHp <= 1 };
  } else if (input.payment.type === "discard_weapon") {
    const card = input.payment.card;
    if (
      !isFireRuleCard(card) ||
      card.ownerId !== context.actorId ||
      (card.zone !== "hand" && card.zone !== "equipment") ||
      card.category !== "equipment" ||
      card.equipmentSlot !== "weapon"
    ) return reject("invalid_payment", "Qiangxi requires the owner's hand or equipped Weapon card");
    payment = { type: "discard_weapon", cardId: card.id, from: card.zone };
  } else {
    return reject("invalid_payment", "unknown Qiangxi payment");
  }

  return accept({
    skillId: "qiangxi",
    ownerId: context.actorId,
    targetId: input.targetId,
    consumeTurnUse: true,
    distanceCheckedBeforePayment: true,
    payment,
    damage: { sourceId: context.actorId, targetId: input.targetId, amount: 1, nature: "normal" },
  });
}

// ---------------------------------------------------------------------------
// Mengjin

export interface MengjinInput {
  readonly skillOwnerId: PlayerId;
  readonly skillOwnerAlive: boolean;
  readonly skillEffective: boolean;
  readonly targetId: PlayerId;
  readonly targetAlive: boolean;
  readonly dodge: {
    readonly requiredCount: number;
    readonly successfulCountBefore: number;
    readonly thisDodgeSucceeded: boolean;
    readonly finalSlashOutcome: "pending" | "dodged" | "hit";
    readonly forcedHitAfterDodge: boolean;
  };
  readonly targetCards: readonly FireRuleCard[];
}

export interface MengjinPlan {
  readonly skillId: "mengjin";
  readonly ownerId: PlayerId;
  readonly targetId: PlayerId;
  readonly optional: true;
  readonly candidateCardIds: readonly CardId[];
  readonly candidateZones: readonly ["hand", "equipment"];
}

export function evaluateMengjin(input: MengjinInput): FireRuleResult<MengjinPlan> {
  if (
    !isRecord(input) ||
    !isNonemptyString(input.skillOwnerId) ||
    typeof input.skillOwnerAlive !== "boolean" ||
    typeof input.skillEffective !== "boolean" ||
    !isNonemptyString(input.targetId) ||
    typeof input.targetAlive !== "boolean" ||
    !isRecord(input.dodge) ||
    !Array.isArray(input.targetCards)
  ) return reject("invalid_input", "Mengjin input is incomplete or malformed");
  if (!input.skillOwnerAlive) return reject("owner_dead", "a dead owner cannot trigger Mengjin");
  if (!input.skillEffective) return reject("skill_not_effective", "Mengjin is not currently effective");
  if (!input.targetAlive) return reject("target_dead", "Mengjin cannot discard from a dead target");
  if (input.targetId === input.skillOwnerId) return reject("invalid_target", "a Slash target must be another player");
  if (
    !isPositiveInteger(input.dodge.requiredCount) ||
    !isNonnegativeInteger(input.dodge.successfulCountBefore) ||
    input.dodge.successfulCountBefore >= input.dodge.requiredCount ||
    typeof input.dodge.thisDodgeSucceeded !== "boolean" ||
    (input.dodge.finalSlashOutcome !== "pending" && input.dodge.finalSlashOutcome !== "dodged" && input.dodge.finalSlashOutcome !== "hit") ||
    typeof input.dodge.forcedHitAfterDodge !== "boolean"
  ) return reject("invalid_input", "Mengjin dodge facts are inconsistent");

  const isFinalSuccessfulDodge =
    input.dodge.thisDodgeSucceeded &&
    input.dodge.successfulCountBefore + 1 === input.dodge.requiredCount;
  if (
    !isFinalSuccessfulDodge ||
    input.dodge.finalSlashOutcome !== "dodged" ||
    input.dodge.forcedHitAfterDodge
  ) return reject("invalid_timing", "Mengjin only triggers after the final Dodge fully offsets the Slash");

  const seen = new Set<CardId>();
  for (const card of input.targetCards) {
    if (!isFireRuleCard(card) || card.ownerId !== input.targetId || seen.has(card.id)) {
      return reject("invalid_card", "Mengjin target card snapshot is invalid");
    }
    seen.add(card.id);
  }
  const candidateCardIds = input.targetCards
    .filter((card) => card.zone === "hand" || card.zone === "equipment")
    .map((card) => card.id);
  if (candidateCardIds.length === 0) return reject("no_candidate", "the target has no hand or equipment card to discard");
  return accept({
    skillId: "mengjin",
    ownerId: input.skillOwnerId,
    targetId: input.targetId,
    optional: true,
    candidateCardIds: [...candidateCardIds],
    candidateZones: ["hand", "equipment"],
  });
}

// ---------------------------------------------------------------------------
// Lianhuan

export interface LianhuanTarget {
  readonly playerId: PlayerId;
  readonly alive: boolean;
  readonly canBeTargetedByIronChain: boolean;
}

export interface LianhuanInput {
  readonly context: FirePlayContext;
  readonly card: FireRuleCard;
  readonly targets: readonly LianhuanTarget[];
}

export type LianhuanPlan =
  | { readonly skillId: "lianhuan"; readonly ownerId: PlayerId; readonly cardId: CardId; readonly mode: "recast"; readonly targetIds: readonly [] }
  | { readonly skillId: "lianhuan"; readonly ownerId: PlayerId; readonly cardId: CardId; readonly mode: "use"; readonly targetIds: readonly PlayerId[] };

export function evaluateLianhuan(input: LianhuanInput): FireRuleResult<LianhuanPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Lianhuan input must be an object");
  const contextFailure = playContextFailure(input.context);
  if (contextFailure) return contextFailure;
  if (!isFireRuleCard(input.card) || !Array.isArray(input.targets)) {
    return reject("invalid_input", "Lianhuan card or target list is malformed");
  }
  if (input.card.ownerId !== input.context.actorId || input.card.zone !== "hand" || input.card.suit !== "club") {
    return reject("invalid_card", "Lianhuan requires one Club hand card owned by the user");
  }
  if (input.targets.length > 2) return reject("invalid_target", "Iron Chain accepts at most two targets");
  const targetIds: PlayerId[] = [];
  for (const target of input.targets) {
    if (
      !isRecord(target) ||
      !isNonemptyString(target.playerId) ||
      typeof target.alive !== "boolean" ||
      typeof target.canBeTargetedByIronChain !== "boolean"
    ) return reject("invalid_input", "a Lianhuan target is malformed");
    if (!target.alive) return reject("target_dead", "Iron Chain cannot target a dead player");
    if (!target.canBeTargetedByIronChain) return reject("invalid_target", "the selected player cannot be targeted by Iron Chain");
    if (targetIds.includes(target.playerId)) return reject("invalid_target", "Lianhuan targets must be distinct");
    targetIds.push(target.playerId);
  }
  if (targetIds.length === 0) {
    return accept({ skillId: "lianhuan", ownerId: input.context.actorId, cardId: input.card.id, mode: "recast", targetIds: [] });
  }
  return accept({ skillId: "lianhuan", ownerId: input.context.actorId, cardId: input.card.id, mode: "use", targetIds: [...targetIds] });
}

// ---------------------------------------------------------------------------
// Tianyi

export interface TianyiInput {
  readonly context: FirePlayContext;
  readonly alreadyUsedThisTurn: boolean;
  readonly pindian: {
    readonly initiatorId: PlayerId;
    readonly targetId: PlayerId;
    readonly initiatorRank: CardRank;
    readonly targetRank: CardRank;
  };
  readonly baseSlashPolicy: {
    /** Null represents an otherwise unlimited active-Slash allowance. */
    readonly useLimit: number | null;
    readonly usesSoFar: number;
    readonly ignoresDistance: boolean;
    readonly maxTargets: number;
  };
}

export interface TianyiTurnModifier {
  readonly skillId: "tianyi";
  readonly ownerId: PlayerId;
  readonly consumeTurnUse: true;
  readonly outcome: "win" | "loss" | "tie";
  readonly expiresAt: "turn_end";
  readonly modifier: {
    readonly slashUseLimitDelta: 0 | 1;
    readonly slashMaxTargetsDelta: 0 | 1;
    readonly ignoreSlashDistance: boolean;
    readonly prohibitActiveSlash: boolean;
    readonly prohibitResponseSlash: false;
  };
  readonly effectiveSlashPolicy: {
    readonly useLimit: number | null;
    readonly usesSoFar: number;
    readonly ignoresDistance: boolean;
    readonly maxTargets: number;
    readonly activeSlashProhibited: boolean;
    readonly canUseAnotherActiveSlash: boolean;
  };
}

export function evaluateTianyi(input: TianyiInput): FireRuleResult<TianyiTurnModifier> {
  if (!isRecord(input)) return reject("invalid_input", "Tianyi input must be an object");
  const contextFailure = playContextFailure(input.context);
  if (contextFailure) return contextFailure;
  if (
    typeof input.alreadyUsedThisTurn !== "boolean" ||
    !isRecord(input.pindian) ||
    !isNonemptyString(input.pindian.initiatorId) ||
    !isNonemptyString(input.pindian.targetId) ||
    !isRank(input.pindian.initiatorRank) ||
    !isRank(input.pindian.targetRank) ||
    !isRecord(input.baseSlashPolicy) ||
    (input.baseSlashPolicy.useLimit !== null && !isNonnegativeInteger(input.baseSlashPolicy.useLimit)) ||
    !isNonnegativeInteger(input.baseSlashPolicy.usesSoFar) ||
    typeof input.baseSlashPolicy.ignoresDistance !== "boolean" ||
    !isPositiveInteger(input.baseSlashPolicy.maxTargets)
  ) return reject("invalid_input", "Tianyi facts are incomplete or malformed");
  if (input.alreadyUsedThisTurn) return reject("already_used", "Tianyi is limited to once per play phase");
  if (input.pindian.initiatorId !== input.context.actorId || input.pindian.targetId === input.context.actorId) {
    return reject("invalid_target", "Tianyi Pindian participants are invalid");
  }

  const won = input.pindian.initiatorRank > input.pindian.targetRank;
  const tied = input.pindian.initiatorRank === input.pindian.targetRank;
  const outcome: TianyiTurnModifier["outcome"] = won ? "win" : tied ? "tie" : "loss";
  let useLimit = input.baseSlashPolicy.useLimit;
  let maxTargets = input.baseSlashPolicy.maxTargets;
  if (won) {
    if (useLimit !== null) {
      if (useLimit >= Number.MAX_SAFE_INTEGER) return reject("invalid_input", "Tianyi Slash limit would overflow");
      useLimit += 1;
    }
    if (maxTargets >= Number.MAX_SAFE_INTEGER) return reject("invalid_input", "Tianyi target limit would overflow");
    maxTargets += 1;
  }
  const activeSlashProhibited = !won;
  const canUseAnotherActiveSlash = !activeSlashProhibited && (useLimit === null || input.baseSlashPolicy.usesSoFar < useLimit);
  return accept({
    skillId: "tianyi",
    ownerId: input.context.actorId,
    consumeTurnUse: true,
    outcome,
    expiresAt: "turn_end",
    modifier: {
      slashUseLimitDelta: won ? 1 : 0,
      slashMaxTargetsDelta: won ? 1 : 0,
      ignoreSlashDistance: won,
      prohibitActiveSlash: !won,
      prohibitResponseSlash: false,
    },
    effectiveSlashPolicy: {
      useLimit,
      usesSoFar: input.baseSlashPolicy.usesSoFar,
      ignoresDistance: won || input.baseSlashPolicy.ignoresDistance,
      maxTargets,
      activeSlashProhibited,
      canUseAnotherActiveSlash,
    },
  });
}

// ---------------------------------------------------------------------------
// Bazhen

export interface BazhenInput {
  readonly ownerId: PlayerId;
  readonly ownerAlive: boolean;
  readonly skillEffective: boolean;
  readonly actualArmor: FireRuleCard | null;
  readonly armorEffectsIgnored: boolean;
}

export interface BazhenPlan {
  readonly skillId: "bazhen";
  readonly ownerId: PlayerId;
  readonly treatedAs: "ba_gua_zhen";
  readonly optionalActivation: true;
}

export function evaluateBazhen(input: BazhenInput): FireRuleResult<BazhenPlan> {
  if (
    !isRecord(input) ||
    !isNonemptyString(input.ownerId) ||
    typeof input.ownerAlive !== "boolean" ||
    typeof input.skillEffective !== "boolean" ||
    typeof input.armorEffectsIgnored !== "boolean" ||
    (input.actualArmor !== null && !isFireRuleCard(input.actualArmor))
  ) return reject("invalid_input", "Bazhen input is incomplete or malformed");
  if (!input.ownerAlive) return reject("owner_dead", "a dead owner cannot invoke Bazhen");
  if (!input.skillEffective) return reject("skill_not_effective", "Bazhen is not currently effective");
  if (input.actualArmor !== null) {
    if (
      input.actualArmor.ownerId !== input.ownerId ||
      input.actualArmor.zone !== "equipment" ||
      input.actualArmor.equipmentSlot !== "armor"
    ) return reject("invalid_card", "actual armor metadata is inconsistent");
    return reject("armor_present", "Bazhen only applies while the armor slot is empty");
  }
  if (input.armorEffectsIgnored) return reject("armor_ignored", "Bazhen is suppressed while armor effects are ignored");
  return accept({ skillId: "bazhen", ownerId: input.ownerId, treatedAs: "ba_gua_zhen", optionalActivation: true });
}

// ---------------------------------------------------------------------------
// Huoji and Kanpo

export interface HuojiInput {
  readonly context: FirePlayContext;
  readonly card: FireRuleCard;
  readonly target: {
    readonly playerId: PlayerId;
    readonly alive: boolean;
    readonly canBeTargetedByFireAttack: boolean;
    readonly handCardIds: readonly CardId[];
  };
}

export interface HuojiPlan {
  readonly skillId: "huoji";
  readonly ownerId: PlayerId;
  readonly cardId: CardId;
  readonly virtualCard: "fire_attack";
  readonly targetId: PlayerId;
  readonly selfTarget: boolean;
  readonly targetHandCountAfterPayment: number;
}

export function evaluateHuoji(input: HuojiInput): FireRuleResult<HuojiPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Huoji input must be an object");
  const contextFailure = playContextFailure(input.context);
  if (contextFailure) return contextFailure;
  if (
    !isFireRuleCard(input.card) ||
    !isRecord(input.target) ||
    !isNonemptyString(input.target.playerId) ||
    typeof input.target.alive !== "boolean" ||
    typeof input.target.canBeTargetedByFireAttack !== "boolean" ||
    !uniqueNonemptyIds(input.target.handCardIds)
  ) return reject("invalid_input", "Huoji card or target facts are malformed");
  if (
    input.card.ownerId !== input.context.actorId ||
    input.card.zone !== "hand" ||
    cardColor(input.card.suit) !== "red"
  ) return reject("invalid_card", "Huoji requires one red hand card owned by the user");
  if (!input.target.alive) return reject("target_dead", "Fire Attack cannot target a dead player");
  if (!input.target.canBeTargetedByFireAttack) return reject("invalid_target", "the selected player cannot be targeted by Fire Attack");

  const selfTarget = input.target.playerId === input.context.actorId;
  const containsCostCard = input.target.handCardIds.includes(input.card.id);
  if (selfTarget && !containsCostCard) return reject("invalid_input", "a self target hand snapshot must contain the Huoji cost card");
  if (!selfTarget && containsCostCard) return reject("invalid_input", "another player's hand cannot contain the Huoji cost card");
  const targetHandCountAfterPayment = input.target.handCardIds.length - (selfTarget ? 1 : 0);
  if (targetHandCountAfterPayment <= 0) {
    return reject("invalid_target", "the Fire Attack target must retain a hand card after paying the Huoji card");
  }
  return accept({
    skillId: "huoji",
    ownerId: input.context.actorId,
    cardId: input.card.id,
    virtualCard: "fire_attack",
    targetId: input.target.playerId,
    selfTarget,
    targetHandCountAfterPayment,
  });
}

export interface KanpoInput {
  readonly ownerId: PlayerId;
  readonly responderId: PlayerId;
  readonly ownerAlive: boolean;
  readonly skillEffective: boolean;
  readonly nullificationWindowOpen: boolean;
  readonly card: FireRuleCard;
}

export interface KanpoPlan {
  readonly skillId: "kanpo";
  readonly ownerId: PlayerId;
  readonly cardId: CardId;
  readonly virtualCard: "wu_xie_ke_ji";
}

export function evaluateKanpo(input: KanpoInput): FireRuleResult<KanpoPlan> {
  if (
    !isRecord(input) ||
    !isNonemptyString(input.ownerId) ||
    !isNonemptyString(input.responderId) ||
    typeof input.ownerAlive !== "boolean" ||
    typeof input.skillEffective !== "boolean" ||
    typeof input.nullificationWindowOpen !== "boolean" ||
    !isFireRuleCard(input.card)
  ) return reject("invalid_input", "Kanpo input is incomplete or malformed");
  if (!input.ownerAlive) return reject("owner_dead", "a dead owner cannot respond with Kanpo");
  if (!input.skillEffective) return reject("skill_not_effective", "Kanpo is not currently effective");
  if (input.ownerId !== input.responderId || !input.nullificationWindowOpen) {
    return reject("invalid_timing", "Kanpo requires the owner's active Nullification response window");
  }
  if (
    input.card.ownerId !== input.ownerId ||
    input.card.zone !== "hand" ||
    cardColor(input.card.suit) !== "black"
  ) return reject("invalid_card", "Kanpo requires one black hand card owned by the responder");
  return accept({ skillId: "kanpo", ownerId: input.ownerId, cardId: input.card.id, virtualCard: "wu_xie_ke_ji" });
}

// ---------------------------------------------------------------------------
// Quhu

export interface QuhuTargetsInput {
  readonly context: FirePlayContext;
  readonly alreadyUsedThisTurn: boolean;
  readonly actorHp: number;
  readonly opponent: {
    readonly playerId: PlayerId;
    readonly alive: boolean;
    readonly hp: number;
    readonly handCount: number;
    readonly canPindian: boolean;
    readonly attackRange: number;
  };
  readonly damageTarget: {
    readonly playerId: PlayerId;
    readonly alive: boolean;
    readonly canReceiveDamage: boolean;
    readonly distanceFromOpponent: number;
  };
}

export interface QuhuPindianPlan {
  readonly skillId: "quhu";
  readonly ownerId: PlayerId;
  readonly opponentId: PlayerId;
  readonly damageTargetId: PlayerId;
  readonly orderedTargetIds: readonly [PlayerId, PlayerId];
  readonly consumeTurnUse: true;
  readonly beginPindian: { readonly initiatorId: PlayerId; readonly targetId: PlayerId };
}

export function evaluateQuhuTargets(input: QuhuTargetsInput): FireRuleResult<QuhuPindianPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Quhu input must be an object");
  const contextFailure = playContextFailure(input.context);
  if (contextFailure) return contextFailure;
  if (
    typeof input.alreadyUsedThisTurn !== "boolean" ||
    !isPositiveInteger(input.actorHp) ||
    !isRecord(input.opponent) ||
    !isNonemptyString(input.opponent.playerId) ||
    typeof input.opponent.alive !== "boolean" ||
    !isPositiveInteger(input.opponent.hp) ||
    !isNonnegativeInteger(input.opponent.handCount) ||
    typeof input.opponent.canPindian !== "boolean" ||
    !isPositiveInteger(input.opponent.attackRange) ||
    !isRecord(input.damageTarget) ||
    !isNonemptyString(input.damageTarget.playerId) ||
    typeof input.damageTarget.alive !== "boolean" ||
    typeof input.damageTarget.canReceiveDamage !== "boolean" ||
    !isPositiveInteger(input.damageTarget.distanceFromOpponent)
  ) return reject("invalid_input", "Quhu target facts are incomplete or malformed");
  if (input.alreadyUsedThisTurn) return reject("already_used", "Quhu is limited to once per play phase");
  if (!input.opponent.alive || !input.damageTarget.alive) return reject("target_dead", "both ordered Quhu targets must be alive");
  if (
    input.opponent.playerId === input.context.actorId ||
    input.damageTarget.playerId === input.context.actorId ||
    input.damageTarget.playerId === input.opponent.playerId
  ) return reject("invalid_target", "Quhu requires two distinct other players");
  if (input.opponent.hp <= input.actorHp) return reject("invalid_target", "the Pindian opponent must have more HP than the owner");
  if (input.opponent.handCount <= 0 || !input.opponent.canPindian) {
    return reject("invalid_target", "the selected opponent cannot Pindian");
  }
  if (!input.damageTarget.canReceiveDamage) return reject("invalid_target", "the second Quhu target cannot receive damage");
  if (input.damageTarget.distanceFromOpponent > input.opponent.attackRange) {
    return reject("out_of_range", "the second target is outside the opponent's attack range");
  }
  return accept({
    skillId: "quhu",
    ownerId: input.context.actorId,
    opponentId: input.opponent.playerId,
    damageTargetId: input.damageTarget.playerId,
    orderedTargetIds: [input.opponent.playerId, input.damageTarget.playerId],
    consumeTurnUse: true,
    beginPindian: { initiatorId: input.context.actorId, targetId: input.opponent.playerId },
  });
}

export interface QuhuResolutionInput {
  readonly ownerId: PlayerId;
  readonly opponentId: PlayerId;
  readonly damageTargetId: PlayerId;
  readonly ownerAlive: boolean;
  readonly opponentAlive: boolean;
  readonly damageTargetAlive: boolean;
  readonly pindian: {
    readonly initiatorId: PlayerId;
    readonly targetId: PlayerId;
    readonly initiatorRank: CardRank;
    readonly targetRank: CardRank;
  };
}

export interface QuhuDamagePlan {
  readonly skillId: "quhu";
  readonly ownerId: PlayerId;
  readonly opponentId: PlayerId;
  readonly pindianOutcome: "win" | "loss" | "tie";
  readonly damage: { readonly sourceId: PlayerId; readonly targetId: PlayerId; readonly amount: 1; readonly nature: "normal" };
}

export function planQuhuDamage(input: QuhuResolutionInput): FireRuleResult<QuhuDamagePlan> {
  if (
    !isRecord(input) ||
    !isNonemptyString(input.ownerId) ||
    !isNonemptyString(input.opponentId) ||
    !isNonemptyString(input.damageTargetId) ||
    typeof input.ownerAlive !== "boolean" ||
    typeof input.opponentAlive !== "boolean" ||
    typeof input.damageTargetAlive !== "boolean" ||
    !isRecord(input.pindian) ||
    !isNonemptyString(input.pindian.initiatorId) ||
    !isNonemptyString(input.pindian.targetId) ||
    !isRank(input.pindian.initiatorRank) ||
    !isRank(input.pindian.targetRank)
  ) return reject("invalid_input", "Quhu resolution facts are incomplete or malformed");
  if (
    input.ownerId === input.opponentId ||
    input.ownerId === input.damageTargetId ||
    input.opponentId === input.damageTargetId ||
    input.pindian.initiatorId !== input.ownerId ||
    input.pindian.targetId !== input.opponentId
  ) return reject("invalid_target", "Quhu resolution participants do not match the ordered target plan");
  if (!input.ownerAlive) return reject("owner_dead", "Quhu owner died before its damage could resolve");
  if (!input.opponentAlive || !input.damageTargetAlive) return reject("target_dead", "a Quhu resolution participant is dead");
  const won = input.pindian.initiatorRank > input.pindian.targetRank;
  const tied = input.pindian.initiatorRank === input.pindian.targetRank;
  const pindianOutcome: QuhuDamagePlan["pindianOutcome"] = won ? "win" : tied ? "tie" : "loss";
  return accept({
    skillId: "quhu",
    ownerId: input.ownerId,
    opponentId: input.opponentId,
    pindianOutcome,
    damage: {
      sourceId: input.opponentId,
      targetId: won ? input.damageTargetId : input.ownerId,
      amount: 1,
      nature: "normal",
    },
  });
}

// ---------------------------------------------------------------------------
// Jieming

export interface JiemingPointInput {
  readonly ownerId: PlayerId;
  readonly ownerAliveAfterDamage: boolean;
  readonly damageAftermathSettled: boolean;
  readonly damageAmount: number;
  readonly damagePoint: number;
  readonly target: {
    readonly playerId: PlayerId;
    readonly alive: boolean;
    readonly maxHp: number;
    readonly handCount: number;
  };
}

export interface JiemingDrawPlan {
  readonly skillId: "jieming";
  readonly ownerId: PlayerId;
  readonly damagePoint: number;
  readonly targetId: PlayerId;
  readonly targetHandSize: number;
  readonly drawCount: number;
  readonly optional: true;
}

export function evaluateJiemingPoint(input: JiemingPointInput): FireRuleResult<JiemingDrawPlan> {
  if (
    !isRecord(input) ||
    !isNonemptyString(input.ownerId) ||
    typeof input.ownerAliveAfterDamage !== "boolean" ||
    typeof input.damageAftermathSettled !== "boolean" ||
    !isPositiveInteger(input.damageAmount) ||
    !isPositiveInteger(input.damagePoint) ||
    input.damagePoint > input.damageAmount ||
    !isRecord(input.target) ||
    !isNonemptyString(input.target.playerId) ||
    typeof input.target.alive !== "boolean" ||
    !isPositiveInteger(input.target.maxHp) ||
    !isNonnegativeInteger(input.target.handCount)
  ) return reject("invalid_input", "Jieming damage-point facts are incomplete or malformed");
  if (!input.ownerAliveAfterDamage) return reject("owner_dead", "Jieming does not trigger after its owner dies");
  if (!input.damageAftermathSettled) return reject("invalid_timing", "Jieming waits until dying resolution for this damage point is settled");
  if (!input.target.alive) return reject("target_dead", "Jieming cannot choose a dead target");
  const targetHandSize = Math.min(input.target.maxHp, 5);
  const drawCount = Math.max(0, targetHandSize - input.target.handCount);
  return accept({
    skillId: "jieming",
    ownerId: input.ownerId,
    damagePoint: input.damagePoint,
    targetId: input.target.playerId,
    targetHandSize,
    drawCount,
    optional: true,
  });
}

// ---------------------------------------------------------------------------
// Shuangxiong and Luanji

export interface ShuangxiongInput {
  readonly context: FirePlayContext;
  readonly activatedThisTurn: boolean;
  /** The suit after all retrials and suit modifiers have settled. */
  readonly finalJudgmentSuit: CardSuit;
  readonly card: FireRuleCard;
}

export interface ShuangxiongPlan {
  readonly skillId: "shuangxiong";
  readonly ownerId: PlayerId;
  readonly cardId: CardId;
  readonly virtualCard: "duel";
  readonly finalJudgmentColor: FireCardColor;
  readonly requiredCardColor: FireCardColor;
}

export function evaluateShuangxiong(input: ShuangxiongInput): FireRuleResult<ShuangxiongPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Shuangxiong input must be an object");
  const contextFailure = playContextFailure(input.context);
  if (contextFailure) return contextFailure;
  if (
    typeof input.activatedThisTurn !== "boolean" ||
    !isCardSuit(input.finalJudgmentSuit) ||
    !isFireRuleCard(input.card)
  ) return reject("invalid_input", "Shuangxiong facts are incomplete or malformed");
  if (!input.activatedThisTurn) return reject("invalid_timing", "Shuangxiong was not activated as this turn's draw replacement");
  if (input.card.ownerId !== input.context.actorId || input.card.zone !== "hand") {
    return reject("invalid_card", "Shuangxiong only converts the owner's hand card");
  }
  const finalJudgmentColor = cardColor(input.finalJudgmentSuit);
  const requiredCardColor: FireCardColor = finalJudgmentColor === "red" ? "black" : "red";
  if (cardColor(input.card.suit) !== requiredCardColor) {
    return reject("color_mismatch", "Shuangxiong requires a card of the opposite color from the final judgment");
  }
  return accept({
    skillId: "shuangxiong",
    ownerId: input.context.actorId,
    cardId: input.card.id,
    virtualCard: "duel",
    finalJudgmentColor,
    requiredCardColor,
  });
}

export interface LuanjiInput {
  readonly context: FirePlayContext;
  readonly cards: readonly [FireRuleCard, FireRuleCard] | readonly FireRuleCard[];
}

export interface LuanjiPlan {
  readonly skillId: "luanji";
  readonly ownerId: PlayerId;
  readonly cardIds: readonly [CardId, CardId];
  readonly suit: CardSuit;
  readonly virtualCard: "arrow_barrage";
}

export function evaluateLuanji(input: LuanjiInput): FireRuleResult<LuanjiPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Luanji input must be an object");
  const contextFailure = playContextFailure(input.context);
  if (contextFailure) return contextFailure;
  if (!Array.isArray(input.cards) || input.cards.length !== 2 || !input.cards.every(isFireRuleCard)) {
    return reject("invalid_card", "Luanji requires exactly two physical cards");
  }
  const [first, second] = input.cards;
  if (!first || !second) return reject("invalid_card", "Luanji requires exactly two physical cards");
  if (
    first.id === second.id ||
    first.ownerId !== input.context.actorId ||
    second.ownerId !== input.context.actorId ||
    first.zone !== "hand" ||
    second.zone !== "hand" ||
    first.suit !== second.suit
  ) return reject("invalid_card", "Luanji requires two distinct, same-suit hand cards owned by the user");
  return accept({
    skillId: "luanji",
    ownerId: input.context.actorId,
    cardIds: [first.id, second.id],
    suit: first.suit,
    virtualCard: "arrow_barrage",
  });
}

// ---------------------------------------------------------------------------
// Xueyi

export interface XueyiPlayer {
  readonly playerId: PlayerId;
  readonly alive: boolean;
  readonly faction: Faction;
}

export interface XueyiInput {
  readonly ownerId: PlayerId;
  /** True for a native active lord skill or a valid Weidi-derived grant. */
  readonly hasEffectiveLordSkill: boolean;
  readonly players: readonly XueyiPlayer[];
}

export interface XueyiHandLimitPlan {
  readonly skillId: "xueyi";
  readonly ownerId: PlayerId;
  readonly qualifyingOtherPlayerIds: readonly PlayerId[];
  readonly qualifyingCount: number;
  readonly handLimitBonus: number;
}

export function evaluateXueyi(input: XueyiInput): FireRuleResult<XueyiHandLimitPlan> {
  if (
    !isRecord(input) ||
    !isNonemptyString(input.ownerId) ||
    typeof input.hasEffectiveLordSkill !== "boolean" ||
    !Array.isArray(input.players)
  ) return reject("invalid_input", "Xueyi input is incomplete or malformed");
  const seen = new Set<PlayerId>();
  let ownerAlive: boolean | null = null;
  for (const player of input.players) {
    if (
      !isRecord(player) ||
      !isNonemptyString(player.playerId) ||
      typeof player.alive !== "boolean" ||
      typeof player.faction !== "string" ||
      !FACTIONS.has(player.faction) ||
      seen.has(player.playerId)
    ) return reject("invalid_input", "Xueyi player snapshot is malformed or duplicated");
    seen.add(player.playerId);
    if (player.playerId === input.ownerId) ownerAlive = player.alive;
  }
  if (ownerAlive === null) return reject("invalid_input", "Xueyi owner is absent from the player snapshot");
  if (!ownerAlive) return reject("owner_dead", "a dead owner has no hand-limit calculation");
  if (!input.hasEffectiveLordSkill) return reject("skill_not_effective", "Xueyi is not an effective lord skill for this owner");
  const qualifyingOtherPlayerIds = input.players
    .filter((player) => player.playerId !== input.ownerId && player.alive && player.faction === "qun")
    .map((player) => player.playerId);
  if (qualifyingOtherPlayerIds.length > Math.floor(Number.MAX_SAFE_INTEGER / 2)) {
    return reject("invalid_input", "Xueyi hand-limit bonus would overflow");
  }
  return accept({
    skillId: "xueyi",
    ownerId: input.ownerId,
    qualifyingOtherPlayerIds: [...qualifyingOtherPlayerIds],
    qualifyingCount: qualifyingOtherPlayerIds.length,
    handLimitBonus: qualifyingOtherPlayerIds.length * 2,
  });
}

// ---------------------------------------------------------------------------
// Niepan

export interface NiepanEquipmentCard {
  readonly slot: EquipmentSlot;
  readonly cardId: CardId;
}

export interface NiepanOwnerState {
  readonly playerId: PlayerId;
  readonly alive: boolean;
  readonly hp: number;
  readonly maxHp: number;
  readonly faceUp: boolean;
  readonly chained: boolean;
  readonly drunk: boolean;
  readonly handCardIds: readonly CardId[];
  readonly equipment: readonly NiepanEquipmentCard[];
  readonly judgmentCardIds: readonly CardId[];
}

export interface NiepanInput {
  readonly ownerId: PlayerId;
  readonly dyingPlayerId: PlayerId;
  readonly inOwnDyingResponseWindow: boolean;
  readonly skillEffective: boolean;
  readonly limitedSkillConsumed: boolean;
  readonly state: NiepanOwnerState;
}

export interface NiepanPlan {
  readonly skillId: "niepan";
  readonly ownerId: PlayerId;
  readonly consumeLimitedSkill: true;
  readonly discard: {
    readonly handCardIds: readonly CardId[];
    readonly equipment: readonly NiepanEquipmentCard[];
    readonly judgmentCardIds: readonly CardId[];
    readonly allCardIds: readonly CardId[];
  };
  /** Complete owner state after clearing zones/resetting posture, before drawing. */
  readonly stateBeforeDraw: NiepanOwnerState;
  readonly requestedHp: 3;
  readonly drawCount: 3;
}

function validNiepanState(value: unknown): value is NiepanOwnerState {
  if (
    !isRecord(value) ||
    !isNonemptyString(value.playerId) ||
    typeof value.alive !== "boolean" ||
    !isSafeInteger(value.hp) ||
    !isPositiveInteger(value.maxHp) ||
    typeof value.faceUp !== "boolean" ||
    typeof value.chained !== "boolean" ||
    typeof value.drunk !== "boolean" ||
    !uniqueNonemptyIds(value.handCardIds) ||
    !Array.isArray(value.equipment) ||
    !uniqueNonemptyIds(value.judgmentCardIds)
  ) return false;
  const slots = new Set<EquipmentSlot>();
  const equipmentCardIds = new Set<CardId>();
  for (const equipment of value.equipment) {
    if (
      !isRecord(equipment) ||
      typeof equipment.slot !== "string" ||
      !EQUIPMENT_SLOTS.has(equipment.slot) ||
      !isNonemptyString(equipment.cardId) ||
      slots.has(equipment.slot as EquipmentSlot) ||
      equipmentCardIds.has(equipment.cardId)
    ) return false;
    slots.add(equipment.slot as EquipmentSlot);
    equipmentCardIds.add(equipment.cardId);
  }
  const allIds = [...value.handCardIds, ...equipmentCardIds, ...value.judgmentCardIds];
  return new Set(allIds).size === allIds.length;
}

export function planNiepan(input: NiepanInput): FireRuleResult<NiepanPlan> {
  if (
    !isRecord(input) ||
    !isNonemptyString(input.ownerId) ||
    !isNonemptyString(input.dyingPlayerId) ||
    typeof input.inOwnDyingResponseWindow !== "boolean" ||
    typeof input.skillEffective !== "boolean" ||
    typeof input.limitedSkillConsumed !== "boolean" ||
    !validNiepanState(input.state)
  ) return reject("invalid_input", "Niepan input is incomplete or malformed");
  if (!input.state.alive) return reject("owner_dead", "Niepan cannot be activated after death");
  if (!input.skillEffective) return reject("skill_not_effective", "Niepan is not currently effective");
  if (input.limitedSkillConsumed) return reject("limited_skill_consumed", "Niepan has already been consumed");
  if (
    !input.inOwnDyingResponseWindow ||
    input.ownerId !== input.dyingPlayerId ||
    input.ownerId !== input.state.playerId ||
    input.state.hp > 0
  ) return reject("not_dying", "Niepan is only legal in the owner's own dying response window");

  const handCardIds = [...input.state.handCardIds];
  const equipment = input.state.equipment.map((entry) => ({ slot: entry.slot, cardId: entry.cardId }));
  const judgmentCardIds = [...input.state.judgmentCardIds];
  const allCardIds = [...handCardIds, ...equipment.map((entry) => entry.cardId), ...judgmentCardIds];
  const stateBeforeDraw: NiepanOwnerState = {
    playerId: input.state.playerId,
    alive: true,
    hp: Math.min(3, input.state.maxHp),
    maxHp: input.state.maxHp,
    faceUp: true,
    chained: false,
    drunk: false,
    handCardIds: [],
    equipment: [],
    judgmentCardIds: [],
  };
  return accept({
    skillId: "niepan",
    ownerId: input.ownerId,
    consumeLimitedSkill: true,
    discard: { handCardIds, equipment, judgmentCardIds, allCardIds },
    stateBeforeDraw,
    requestedHp: 3,
    drawCount: 3,
  });
}
