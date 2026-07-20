import type {
  CardCategory,
  CardId,
  CardRank,
  CardSuit,
  EquipmentSlot,
  Faction,
  Gender,
  PlayerId,
  TurnPhase,
} from "../types.js";

/** Eight generals and twenty-three skill assignments in the original Mountain pack. */
export const MOUNTAIN_GENERAL_SKILL_IDS = Object.freeze({
  cai_wen_ji: Object.freeze(["beige", "duanchang"]),
  deng_ai: Object.freeze(["tuntian", "zaoxian", "jixi"]),
  jiang_wei: Object.freeze(["tiaoxin", "zhiji", "guanxing"]),
  liu_chan: Object.freeze(["xiangle", "fangquan", "ruoyu", "jijiang"]),
  sun_ce: Object.freeze(["jiang", "yingyang", "hunzi", "zhiba", "yingzi", "yinghun"]),
  zhang_he: Object.freeze(["qiaobian"]),
  zhang_zhao_zhang_hong: Object.freeze(["zhijian", "guzheng"]),
  zuo_ci: Object.freeze(["huashen", "xinsheng"]),
} as const);

export const MOUNTAIN_GENERAL_COUNT = 8;
export const MOUNTAIN_SKILL_ASSIGNMENT_COUNT = 23;
export const MOUNTAIN_UNIQUE_SKILL_IDS = Object.freeze([
  "beige", "duanchang", "tuntian", "zaoxian", "jixi", "tiaoxin", "zhiji", "guanxing",
  "xiangle", "fangquan", "ruoyu", "jijiang", "jiang", "yingyang", "hunzi", "zhiba",
  "yingzi", "yinghun", "qiaobian", "zhijian", "guzheng", "huashen", "xinsheng",
] as const);

export type MountainCardZone = "hand" | "equipment" | "judgment" | "field" | "discard" | "processing";

/** Complete rule-facing projection; all fields are plain JSON data. */
export interface MountainRuleCard {
  readonly id: CardId;
  readonly kind: string;
  readonly ownerId: PlayerId;
  readonly zone: MountainCardZone;
  readonly suit: CardSuit;
  readonly category: CardCategory;
  readonly equipmentSlot: EquipmentSlot | null;
}

export interface MountainPlayContext {
  readonly actorId: PlayerId;
  readonly currentPlayerId: PlayerId;
  readonly phase: TurnPhase;
  readonly actorAlive: boolean;
  readonly skillEffective: boolean;
}

export type MountainRuleFailureCode =
  | "invalid_input"
  | "wrong_timing"
  | "not_active_player"
  | "owner_dead"
  | "skill_not_effective"
  | "already_used"
  | "invalid_card"
  | "invalid_target"
  | "target_dead"
  | "out_of_range"
  | "no_candidate"
  | "not_awakened"
  | "already_awakened"
  | "awakening_condition_not_met"
  | "declined"
  | "pool_exhausted";

export type MountainRuleResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: MountainRuleFailureCode; readonly detail: string };

function accept<T>(value: T): MountainRuleResult<T> {
  return { ok: true, value };
}

function reject<T>(code: MountainRuleFailureCode, detail: string): MountainRuleResult<T> {
  return { ok: false, code, detail };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function safeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function nonnegative(value: unknown): value is number {
  return safeInteger(value) && value >= 0;
}

function positive(value: unknown): value is number {
  return safeInteger(value) && value > 0;
}

const SUITS = new Set<string>(["spade", "heart", "club", "diamond"]);
const CARD_ZONES = new Set<string>(["hand", "equipment", "judgment", "field", "discard", "processing"]);
const CATEGORIES = new Set<string>(["basic", "trick", "equipment"]);
const SLOTS = new Set<string>(["weapon", "armor", "offensive_horse", "defensive_horse"]);
const PHASES = new Set<string>(["prepare", "judgment", "draw", "play", "respond", "discard", "end"]);
const FACTIONS = new Set<string>(["wei", "shu", "wu", "qun", "god"]);
const GENDERS = new Set<string>(["male", "female"]);
const SLASH_KINDS = new Set<string>(["slash", "fire_slash", "thunder_slash"]);

function suit(value: unknown): value is CardSuit {
  return typeof value === "string" && SUITS.has(value);
}

function rank(value: unknown): value is CardRank {
  return positive(value) && value <= 13;
}

function validCard(value: unknown): value is MountainRuleCard {
  if (!isRecord(value)) return false;
  if (
    !nonempty(value.id) || !nonempty(value.kind) || !nonempty(value.ownerId) ||
    typeof value.zone !== "string" || !CARD_ZONES.has(value.zone) || !suit(value.suit) ||
    typeof value.category !== "string" || !CATEGORIES.has(value.category) ||
    (value.equipmentSlot !== null && (typeof value.equipmentSlot !== "string" || !SLOTS.has(value.equipmentSlot)))
  ) return false;
  if ((value.category === "equipment") !== (value.equipmentSlot !== null)) return false;
  if (value.zone === "equipment" && value.category !== "equipment") return false;
  return true;
}

function uniqueIds(values: readonly { readonly id: CardId }[]): boolean {
  return new Set(values.map((value) => value.id)).size === values.length;
}

function uniqueStrings(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(nonempty) && new Set(value).size === value.length;
}

function activePlayFailure(value: unknown): MountainRuleResult<never> | null {
  if (
    !isRecord(value) || !nonempty(value.actorId) || !nonempty(value.currentPlayerId) ||
    typeof value.phase !== "string" || !PHASES.has(value.phase) ||
    typeof value.actorAlive !== "boolean" || typeof value.skillEffective !== "boolean"
  ) return reject("invalid_input", "active play context is malformed");
  if (!value.actorAlive) return reject("owner_dead", "a dead owner cannot use an active skill");
  if (!value.skillEffective) return reject("skill_not_effective", "the skill is not currently effective");
  if (value.actorId !== value.currentPlayerId) return reject("not_active_player", "the owner is not the current player");
  if (value.phase !== "play") return reject("wrong_timing", "the skill requires the play phase");
  return null;
}

function validOwnedCardList(value: unknown, ownerId: PlayerId): value is readonly MountainRuleCard[] {
  if (!Array.isArray(value) || !value.every(validCard) || !uniqueIds(value)) return false;
  return value.every((card) => card.ownerId === ownerId);
}

// ---------------------------------------------------------------------------
// Cai Wenji: Beige / Duanchang

export interface BeigeInput {
  readonly ownerId: PlayerId;
  readonly ownerAlive: boolean;
  readonly skillEffective: boolean;
  readonly slashDamageAftermathSettled: boolean;
  readonly victimId: PlayerId;
  readonly victimAlive: boolean;
  readonly damageSourceId: PlayerId | null;
  readonly damageSourceAlive: boolean;
  readonly costCard: MountainRuleCard;
  readonly finalJudgmentSuit: CardSuit;
  /** Post-cost hand/equipment snapshot of the damage source. */
  readonly damageSourceCards: readonly MountainRuleCard[];
}

export type BeigeSuitEffect =
  | { readonly type: "recover"; readonly targetId: PlayerId; readonly amount: 1 }
  | { readonly type: "draw"; readonly targetId: PlayerId; readonly count: 2 }
  | { readonly type: "source_discard"; readonly sourceId: PlayerId; readonly requiredCount: 2; readonly candidateCardIds: readonly CardId[]; readonly maximumDiscardCount: number }
  | { readonly type: "turn_over_source"; readonly sourceId: PlayerId }
  | { readonly type: "no_source_effect" };

export interface BeigePlan {
  readonly skillId: "beige";
  readonly ownerId: PlayerId;
  readonly victimId: PlayerId;
  readonly discardCostCardId: CardId;
  readonly judgmentOwnerId: PlayerId;
  readonly finalJudgmentSuit: CardSuit;
  readonly effect: BeigeSuitEffect;
}

export function planBeige(input: BeigeInput): MountainRuleResult<BeigePlan> {
  if (
    !isRecord(input) || !nonempty(input.ownerId) || typeof input.ownerAlive !== "boolean" ||
    typeof input.skillEffective !== "boolean" || typeof input.slashDamageAftermathSettled !== "boolean" ||
    !nonempty(input.victimId) || typeof input.victimAlive !== "boolean" ||
    (input.damageSourceId !== null && !nonempty(input.damageSourceId)) || typeof input.damageSourceAlive !== "boolean" ||
    !validCard(input.costCard) || !suit(input.finalJudgmentSuit) || !Array.isArray(input.damageSourceCards)
  ) return reject("invalid_input", "Beige input is malformed");
  if (!input.ownerAlive) return reject("owner_dead", "a dead Cai Wenji cannot activate Beige");
  if (!input.skillEffective) return reject("skill_not_effective", "Beige is not currently effective");
  if (!input.slashDamageAftermathSettled) return reject("wrong_timing", "Beige waits until Slash damage and dying resolution settle");
  if (!input.victimAlive) return reject("target_dead", "Beige cannot begin after the damaged character dies");
  if (
    input.costCard.ownerId !== input.ownerId ||
    (input.costCard.zone !== "hand" && input.costCard.zone !== "equipment")
  ) return reject("invalid_card", "Beige discards one owner hand or equipment card");
  if (input.damageSourceId === null && input.damageSourceAlive) {
    return reject("invalid_input", "a missing Beige damage source cannot be alive");
  }
  if (!input.damageSourceAlive) {
    if (input.damageSourceCards.length !== 0) return reject("invalid_input", "a missing or dead damage source cannot own discard candidates");
  } else if (input.damageSourceId === null || !validOwnedCardList(input.damageSourceCards, input.damageSourceId)) {
    return reject("invalid_card", "Beige source card snapshot is malformed");
  }
  if (input.damageSourceCards.some((card) => card.id === input.costCard.id)) {
    return reject("invalid_card", "the paid Beige card cannot remain in the post-cost source snapshot");
  }

  let effect: BeigeSuitEffect;
  switch (input.finalJudgmentSuit) {
    case "heart":
      effect = { type: "recover", targetId: input.victimId, amount: 1 };
      break;
    case "diamond":
      effect = { type: "draw", targetId: input.victimId, count: 2 };
      break;
    case "club": {
      if (input.damageSourceId === null || !input.damageSourceAlive) {
        effect = { type: "no_source_effect" };
      } else {
        const candidateCardIds = input.damageSourceCards
          .filter((card) => card.zone === "hand" || card.zone === "equipment")
          .map((card) => card.id);
        effect = {
          type: "source_discard",
          sourceId: input.damageSourceId,
          requiredCount: 2,
          candidateCardIds: [...candidateCardIds],
          maximumDiscardCount: Math.min(2, candidateCardIds.length),
        };
      }
      break;
    }
    case "spade":
      effect = input.damageSourceId === null || !input.damageSourceAlive
        ? { type: "no_source_effect" }
        : { type: "turn_over_source", sourceId: input.damageSourceId };
      break;
  }
  return accept({
    skillId: "beige", ownerId: input.ownerId, victimId: input.victimId,
    discardCostCardId: input.costCard.id, judgmentOwnerId: input.victimId,
    finalJudgmentSuit: input.finalJudgmentSuit, effect,
  });
}

export interface DuanchangInput {
  readonly ownerId: PlayerId;
  readonly ownerDead: boolean;
  readonly skillWasEffectiveAtDeath: boolean;
  readonly killerId: PlayerId | null;
  readonly killerAlive: boolean;
  /** Snapshot of current general-derived skills; equipment/card abilities are excluded. */
  readonly killerCurrentGeneralSkillIds: readonly string[];
}

export interface DuanchangPlan {
  readonly skillId: "duanchang";
  readonly ownerId: PlayerId;
  readonly killerId: PlayerId;
  readonly loseSkillIds: readonly string[];
  readonly snapshotLoss: true;
}

export function planDuanchang(input: DuanchangInput): MountainRuleResult<DuanchangPlan> {
  if (
    !isRecord(input) || !nonempty(input.ownerId) || typeof input.ownerDead !== "boolean" ||
    typeof input.skillWasEffectiveAtDeath !== "boolean" ||
    (input.killerId !== null && !nonempty(input.killerId)) || typeof input.killerAlive !== "boolean" ||
    !uniqueStrings(input.killerCurrentGeneralSkillIds)
  ) return reject("invalid_input", "Duanchang input is malformed");
  if (!input.ownerDead) return reject("wrong_timing", "Duanchang only resolves at owner death");
  if (!input.skillWasEffectiveAtDeath) return reject("skill_not_effective", "Duanchang was not effective at death");
  if (input.killerId === null || !input.killerAlive) return reject("no_candidate", "Duanchang has no living killer to strip");
  if (input.killerId === input.ownerId) return reject("invalid_target", "the dead owner cannot be their own living killer");
  return accept({
    skillId: "duanchang", ownerId: input.ownerId, killerId: input.killerId,
    loseSkillIds: [...input.killerCurrentGeneralSkillIds], snapshotLoss: true,
  });
}

// ---------------------------------------------------------------------------
// Deng Ai: Tuntian / Zaoxian / Jixi

export interface TuntianLossInput {
  readonly ownerId: PlayerId;
  readonly ownerAlive: boolean;
  readonly skillEffective: boolean;
  readonly currentTurnPlayerId: PlayerId | null;
  readonly moveBatchId: number;
  /** Cards with their pre-move owner and zone; one batch creates at most one trigger. */
  readonly lostCards: readonly MountainRuleCard[];
}

export interface TuntianJudgmentRequest {
  readonly skillId: "tuntian";
  readonly ownerId: PlayerId;
  readonly moveBatchId: number;
  readonly qualifyingLostCardIds: readonly CardId[];
  readonly optional: true;
  readonly judgmentsToCreate: 1;
}

export function evaluateTuntianLoss(input: TuntianLossInput): MountainRuleResult<TuntianJudgmentRequest> {
  if (
    !isRecord(input) || !nonempty(input.ownerId) || typeof input.ownerAlive !== "boolean" ||
    typeof input.skillEffective !== "boolean" ||
    (input.currentTurnPlayerId !== null && !nonempty(input.currentTurnPlayerId)) ||
    !positive(input.moveBatchId) || !Array.isArray(input.lostCards) || !input.lostCards.every(validCard) || !uniqueIds(input.lostCards)
  ) return reject("invalid_input", "Tuntian loss event is malformed");
  if (!input.ownerAlive) return reject("owner_dead", "a dead owner cannot trigger Tuntian");
  if (!input.skillEffective) return reject("skill_not_effective", "Tuntian is not currently effective");
  if (input.currentTurnPlayerId === input.ownerId) return reject("wrong_timing", "Tuntian only triggers outside the owner's turn");
  if (input.lostCards.some((card) => card.ownerId !== input.ownerId)) {
    return reject("invalid_card", "Tuntian loss batch includes a foreign card");
  }
  const qualifyingLostCardIds = input.lostCards
    .filter((card) => card.zone === "hand" || card.zone === "equipment")
    .map((card) => card.id);
  if (qualifyingLostCardIds.length === 0) return reject("wrong_timing", "no hand or equipment card was lost in this batch");
  return accept({
    skillId: "tuntian", ownerId: input.ownerId, moveBatchId: input.moveBatchId,
    qualifyingLostCardIds: [...qualifyingLostCardIds], optional: true, judgmentsToCreate: 1,
  });
}

export interface TuntianJudgmentInput {
  readonly ownerId: PlayerId;
  readonly ownerAlive: boolean;
  readonly finalJudgmentCardId: CardId;
  readonly finalJudgmentSuit: CardSuit;
}

export interface TuntianJudgmentPlan {
  readonly skillId: "tuntian";
  readonly ownerId: PlayerId;
  readonly cardId: CardId;
  readonly destination: "field" | "discard";
  readonly createsField: boolean;
}

export function planTuntianJudgment(input: TuntianJudgmentInput): MountainRuleResult<TuntianJudgmentPlan> {
  if (
    !isRecord(input) || !nonempty(input.ownerId) || typeof input.ownerAlive !== "boolean" ||
    !nonempty(input.finalJudgmentCardId) || !suit(input.finalJudgmentSuit)
  ) return reject("invalid_input", "Tuntian judgment input is malformed");
  if (!input.ownerAlive) return reject("owner_dead", "a dead owner cannot receive a Field card");
  const createsField = input.finalJudgmentSuit !== "heart";
  return accept({
    skillId: "tuntian", ownerId: input.ownerId, cardId: input.finalJudgmentCardId,
    destination: createsField ? "field" : "discard", createsField,
  });
}

export interface TuntianDistanceInput {
  readonly ownerId: PlayerId;
  readonly targetId: PlayerId;
  readonly skillEffective: boolean;
  readonly baseDistance: number;
  readonly fieldCount: number;
}

export interface TuntianDistancePlan {
  readonly skillId: "tuntian";
  readonly baseDistance: number;
  readonly fieldCountApplied: number;
  readonly distance: number;
}

export function applyTuntianDistance(input: TuntianDistanceInput): MountainRuleResult<TuntianDistancePlan> {
  if (
    !isRecord(input) || !nonempty(input.ownerId) || !nonempty(input.targetId) ||
    typeof input.skillEffective !== "boolean" || !positive(input.baseDistance) || !nonnegative(input.fieldCount)
  ) return reject("invalid_input", "Tuntian distance input is malformed");
  if (input.ownerId === input.targetId) return reject("invalid_target", "distance requires another player");
  const fieldCountApplied = input.skillEffective ? input.fieldCount : 0;
  return accept({
    skillId: "tuntian", baseDistance: input.baseDistance, fieldCountApplied,
    distance: Math.max(1, input.baseDistance - fieldCountApplied),
  });
}

export interface ZaoxianInput {
  readonly ownerId: PlayerId;
  readonly currentPlayerId: PlayerId;
  readonly atPreparePhaseStart: boolean;
  readonly ownerAlive: boolean;
  readonly skillEffective: boolean;
  readonly alreadyAwakened: boolean;
  readonly fieldCount: number;
  readonly hp: number;
  readonly maxHp: number;
}

export interface ZaoxianPlan {
  readonly skillId: "zaoxian";
  readonly ownerId: PlayerId;
  readonly maxHpBefore: number;
  readonly maxHpAfter: number;
  readonly hpAfter: number;
  readonly consumeAwakening: true;
  readonly grantSkillIds: readonly ["jixi"];
}

export function planZaoxian(input: ZaoxianInput): MountainRuleResult<ZaoxianPlan> {
  if (
    !isRecord(input) || !nonempty(input.ownerId) || !nonempty(input.currentPlayerId) ||
    typeof input.atPreparePhaseStart !== "boolean" || typeof input.ownerAlive !== "boolean" ||
    typeof input.skillEffective !== "boolean" || typeof input.alreadyAwakened !== "boolean" ||
    !nonnegative(input.fieldCount) || !positive(input.hp) || !positive(input.maxHp) || input.hp > input.maxHp
  ) return reject("invalid_input", "Zaoxian input is malformed");
  if (!input.ownerAlive) return reject("owner_dead", "a dead owner cannot awaken");
  if (!input.skillEffective) return reject("skill_not_effective", "Zaoxian is not currently effective");
  if (!input.atPreparePhaseStart || input.currentPlayerId !== input.ownerId) return reject("wrong_timing", "Zaoxian requires the owner's prepare phase start");
  if (input.alreadyAwakened) return reject("already_awakened", "Zaoxian has already awakened");
  if (input.fieldCount < 3) return reject("awakening_condition_not_met", "Zaoxian requires at least three Fields");
  if (input.maxHp <= 1) return reject("invalid_input", "Zaoxian cannot reduce maximum HP below one");
  const maxHpAfter = input.maxHp - 1;
  return accept({
    skillId: "zaoxian", ownerId: input.ownerId, maxHpBefore: input.maxHp, maxHpAfter,
    hpAfter: Math.min(input.hp, maxHpAfter), consumeAwakening: true, grantSkillIds: ["jixi"],
  });
}

export interface JixiInput {
  readonly context: MountainPlayContext;
  readonly fieldCard: MountainRuleCard;
  readonly targetId: PlayerId;
  readonly targetAlive: boolean;
  readonly targetCanBeTargetedBySnatch: boolean;
  readonly effectiveDistance: number;
  readonly snatchDistanceLimit: number;
  readonly targetCards: readonly MountainRuleCard[];
}

export interface JixiPlan {
  readonly skillId: "jixi";
  readonly ownerId: PlayerId;
  readonly fieldCardId: CardId;
  readonly virtualCard: "shun_shou_qian_yang";
  readonly targetId: PlayerId;
}

export function evaluateJixi(input: JixiInput): MountainRuleResult<JixiPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Jixi input must be an object");
  const failure = activePlayFailure(input.context);
  if (failure) return failure;
  if (
    !validCard(input.fieldCard) || !nonempty(input.targetId) || typeof input.targetAlive !== "boolean" ||
    typeof input.targetCanBeTargetedBySnatch !== "boolean" || !positive(input.effectiveDistance) ||
    !positive(input.snatchDistanceLimit) || !Array.isArray(input.targetCards) || !input.targetCards.every(validCard) || !uniqueIds(input.targetCards)
  ) return reject("invalid_input", "Jixi target facts are malformed");
  if (input.fieldCard.ownerId !== input.context.actorId || input.fieldCard.zone !== "field") {
    return reject("invalid_card", "Jixi requires one of the owner's Field cards");
  }
  if (input.targetId === input.context.actorId) return reject("invalid_target", "Snatch targets another player");
  if (!input.targetAlive) return reject("target_dead", "Jixi cannot target a dead player");
  if (!input.targetCanBeTargetedBySnatch) return reject("invalid_target", "the target is protected from Snatch");
  if (input.effectiveDistance > input.snatchDistanceLimit) return reject("out_of_range", "the target is outside Snatch range");
  if (!validOwnedCardList(input.targetCards, input.targetId)) return reject("invalid_card", "Jixi target card snapshot is malformed");
  if (!input.targetCards.some((card) => card.zone === "hand" || card.zone === "equipment" || card.zone === "judgment")) {
    return reject("no_candidate", "the Jixi target has no card in a targetable zone");
  }
  return accept({
    skillId: "jixi", ownerId: input.context.actorId, fieldCardId: input.fieldCard.id,
    virtualCard: "shun_shou_qian_yang", targetId: input.targetId,
  });
}

// ---------------------------------------------------------------------------
// Jiang Wei: Tiaoxin / Zhiji / granted Guanxing

export interface TiaoxinInput {
  readonly context: MountainPlayContext;
  readonly alreadyUsedThisTurn: boolean;
  readonly targetId: PlayerId;
  readonly targetAlive: boolean;
  readonly distanceFromTargetToOwner: number;
  readonly targetAttackRange: number;
  readonly targetCanLegallySlashOwner: boolean;
  readonly targetCards: readonly MountainRuleCard[];
}

export interface TiaoxinPromptPlan {
  readonly skillId: "tiaoxin";
  readonly ownerId: PlayerId;
  readonly targetId: PlayerId;
  readonly consumeTurnUse: true;
  readonly targetMayUseSlash: boolean;
  readonly declineDiscardCandidateIds: readonly CardId[];
}

export function evaluateTiaoxin(input: TiaoxinInput): MountainRuleResult<TiaoxinPromptPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Tiaoxin input must be an object");
  const failure = activePlayFailure(input.context);
  if (failure) return failure;
  if (
    typeof input.alreadyUsedThisTurn !== "boolean" || !nonempty(input.targetId) ||
    typeof input.targetAlive !== "boolean" || !positive(input.distanceFromTargetToOwner) ||
    !positive(input.targetAttackRange) || typeof input.targetCanLegallySlashOwner !== "boolean" ||
    !Array.isArray(input.targetCards) || !input.targetCards.every(validCard) || !uniqueIds(input.targetCards)
  ) return reject("invalid_input", "Tiaoxin target facts are malformed");
  if (input.alreadyUsedThisTurn) return reject("already_used", "Tiaoxin is limited to once per play phase");
  if (input.targetId === input.context.actorId) return reject("invalid_target", "Tiaoxin targets another player");
  if (!input.targetAlive) return reject("target_dead", "Tiaoxin cannot target a dead player");
  if (input.distanceFromTargetToOwner > input.targetAttackRange) {
    return reject("out_of_range", "the target's attack range does not contain the owner");
  }
  if (!validOwnedCardList(input.targetCards, input.targetId)) return reject("invalid_card", "Tiaoxin target card snapshot is malformed");
  const declineDiscardCandidateIds = input.targetCards
    .filter((card) => card.zone === "hand" || card.zone === "equipment" || card.zone === "judgment")
    .map((card) => card.id);
  return accept({
    skillId: "tiaoxin", ownerId: input.context.actorId, targetId: input.targetId,
    consumeTurnUse: true, targetMayUseSlash: input.targetCanLegallySlashOwner,
    declineDiscardCandidateIds: [...declineDiscardCandidateIds],
  });
}

export interface TiaoxinResolutionInput {
  readonly prompt: TiaoxinPromptPlan;
  readonly choice: "use_slash" | "decline";
  readonly slashCard: MountainRuleCard | null;
}

export type TiaoxinResolutionPlan =
  | {
      readonly skillId: "tiaoxin";
      readonly outcome: "use_slash";
      readonly slashCardId: CardId;
      readonly sourceId: PlayerId;
      readonly targetId: PlayerId;
    }
  | {
      readonly skillId: "tiaoxin";
      readonly outcome: "decline";
      readonly discardCandidateCardIds: readonly CardId[];
      readonly discardMaximum: 0 | 1;
    };

export function planTiaoxinResolution(input: TiaoxinResolutionInput): MountainRuleResult<TiaoxinResolutionPlan> {
  if (
    !isRecord(input) || !isRecord(input.prompt) || input.prompt.skillId !== "tiaoxin" ||
    !nonempty(input.prompt.ownerId) || !nonempty(input.prompt.targetId) ||
    typeof input.prompt.targetMayUseSlash !== "boolean" || !uniqueStrings(input.prompt.declineDiscardCandidateIds) ||
    (input.choice !== "use_slash" && input.choice !== "decline") ||
    (input.slashCard !== null && !validCard(input.slashCard))
  ) return reject("invalid_input", "Tiaoxin resolution input is malformed");
  if (input.choice === "use_slash") {
    const card = input.slashCard;
    if (
      !input.prompt.targetMayUseSlash || card === null || card.ownerId !== input.prompt.targetId ||
      card.zone !== "hand" || card.category !== "basic" || !SLASH_KINDS.has(card.kind)
    ) return reject("invalid_card", "the Tiaoxin target did not provide a legal hand Slash");
    return accept({
      skillId: "tiaoxin", outcome: "use_slash", slashCardId: card.id,
      sourceId: input.prompt.targetId, targetId: input.prompt.ownerId,
    });
  }
  if (input.slashCard !== null) return reject("invalid_input", "a declined Tiaoxin response cannot also commit a Slash");
  return accept({
    skillId: "tiaoxin", outcome: "decline",
    discardCandidateCardIds: [...input.prompt.declineDiscardCandidateIds],
    discardMaximum: input.prompt.declineDiscardCandidateIds.length === 0 ? 0 : 1,
  });
}

export interface ZhijiInput {
  readonly ownerId: PlayerId;
  readonly currentPlayerId: PlayerId;
  readonly atPreparePhaseStart: boolean;
  readonly ownerAlive: boolean;
  readonly skillEffective: boolean;
  readonly alreadyAwakened: boolean;
  readonly handCount: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly choice: "recover_one" | "draw_two";
}

export interface ZhijiPlan {
  readonly skillId: "zhiji";
  readonly ownerId: PlayerId;
  readonly choice: "recover_one" | "draw_two";
  readonly recoverBeforeMaxHpLoss: 0 | 1;
  readonly drawCount: 0 | 2;
  readonly maxHpAfter: number;
  readonly hpAfter: number;
  readonly consumeAwakening: true;
  readonly grantSkillIds: readonly ["guanxing"];
}

export function planZhiji(input: ZhijiInput): MountainRuleResult<ZhijiPlan> {
  if (
    !isRecord(input) || !nonempty(input.ownerId) || !nonempty(input.currentPlayerId) ||
    typeof input.atPreparePhaseStart !== "boolean" || typeof input.ownerAlive !== "boolean" ||
    typeof input.skillEffective !== "boolean" || typeof input.alreadyAwakened !== "boolean" ||
    !nonnegative(input.handCount) || !positive(input.hp) || !positive(input.maxHp) || input.hp > input.maxHp ||
    (input.choice !== "recover_one" && input.choice !== "draw_two")
  ) return reject("invalid_input", "Zhiji input is malformed");
  if (!input.ownerAlive) return reject("owner_dead", "a dead owner cannot awaken");
  if (!input.skillEffective) return reject("skill_not_effective", "Zhiji is not currently effective");
  if (!input.atPreparePhaseStart || input.currentPlayerId !== input.ownerId) return reject("wrong_timing", "Zhiji requires the owner's prepare phase start");
  if (input.alreadyAwakened) return reject("already_awakened", "Zhiji has already awakened");
  if (input.handCount !== 0) return reject("awakening_condition_not_met", "Zhiji requires an empty hand");
  if (input.maxHp <= 1) return reject("invalid_input", "Zhiji cannot reduce maximum HP below one");
  if (input.choice === "recover_one" && input.hp >= input.maxHp) {
    return reject("invalid_input", "a full-HP owner must choose to draw two cards");
  }
  const recoveredHp = input.choice === "recover_one" ? Math.min(input.maxHp, input.hp + 1) : input.hp;
  const maxHpAfter = input.maxHp - 1;
  return accept({
    skillId: "zhiji", ownerId: input.ownerId, choice: input.choice,
    recoverBeforeMaxHpLoss: input.choice === "recover_one" ? 1 : 0,
    drawCount: input.choice === "draw_two" ? 2 : 0,
    maxHpAfter, hpAfter: Math.min(recoveredHp, maxHpAfter), consumeAwakening: true,
    grantSkillIds: ["guanxing"],
  });
}

export interface MountainGuanxingInput {
  readonly ownerId: PlayerId;
  readonly currentPlayerId: PlayerId;
  readonly atPreparePhaseStart: boolean;
  readonly ownerAlive: boolean;
  readonly skillEffective: boolean;
  readonly alivePlayerCount: number;
  readonly availableDeckCardCount: number;
}

export interface MountainGuanxingPlan {
  readonly skillId: "guanxing";
  readonly ownerId: PlayerId;
  readonly viewCount: number;
  readonly optional: true;
}

export function planMountainGuanxing(input: MountainGuanxingInput): MountainRuleResult<MountainGuanxingPlan> {
  if (
    !isRecord(input) || !nonempty(input.ownerId) || !nonempty(input.currentPlayerId) ||
    typeof input.atPreparePhaseStart !== "boolean" || typeof input.ownerAlive !== "boolean" ||
    typeof input.skillEffective !== "boolean" || !positive(input.alivePlayerCount) || !nonnegative(input.availableDeckCardCount)
  ) return reject("invalid_input", "Guanxing input is malformed");
  if (!input.ownerAlive) return reject("owner_dead", "a dead owner cannot use Guanxing");
  if (!input.skillEffective) return reject("skill_not_effective", "Guanxing has not been granted or is suppressed");
  if (!input.atPreparePhaseStart || input.currentPlayerId !== input.ownerId) return reject("wrong_timing", "Guanxing requires the owner's prepare phase start");
  const viewCount = Math.min(5, input.alivePlayerCount, input.availableDeckCardCount);
  if (viewCount === 0) return reject("no_candidate", "there is no deck card to view");
  return accept({ skillId: "guanxing", ownerId: input.ownerId, viewCount, optional: true });
}

// ---------------------------------------------------------------------------
// Liu Chan: Xiangle / Fangquan / Ruoyu / granted Jijiang

export interface XiangleInput {
  readonly ownerId: PlayerId;
  readonly ownerAlive: boolean;
  readonly skillEffective: boolean;
  readonly slashTargetConfirmed: boolean;
  readonly slashSourceId: PlayerId;
  readonly slashSourceAlive: boolean;
  readonly sourceBasicHandCards: readonly MountainRuleCard[];
  readonly paymentCardId: CardId | null;
}

export interface XianglePlan {
  readonly skillId: "xiangle";
  readonly ownerId: PlayerId;
  readonly sourceId: PlayerId;
  readonly basicPaymentCandidateIds: readonly CardId[];
  readonly discardCardId: CardId | null;
  readonly slashEffectInvalidForTarget: boolean;
}

export function planXiangle(input: XiangleInput): MountainRuleResult<XianglePlan> {
  if (
    !isRecord(input) || !nonempty(input.ownerId) || typeof input.ownerAlive !== "boolean" ||
    typeof input.skillEffective !== "boolean" || typeof input.slashTargetConfirmed !== "boolean" ||
    !nonempty(input.slashSourceId) || typeof input.slashSourceAlive !== "boolean" ||
    !Array.isArray(input.sourceBasicHandCards) ||
    (input.paymentCardId !== null && !nonempty(input.paymentCardId))
  ) return reject("invalid_input", "Xiangle input is malformed");
  if (!input.ownerAlive) return reject("owner_dead", "a dead target cannot resolve Xiangle");
  if (!input.skillEffective) return reject("skill_not_effective", "Xiangle is not currently effective");
  if (!input.slashTargetConfirmed) return reject("wrong_timing", "Xiangle requires Slash target confirmation");
  if (!input.slashSourceAlive) return reject("target_dead", "the Slash source cannot pay after death");
  if (input.slashSourceId === input.ownerId) return reject("invalid_target", "a Slash source cannot target itself");
  if (!validOwnedCardList(input.sourceBasicHandCards, input.slashSourceId)) {
    return reject("invalid_card", "Xiangle source hand snapshot is malformed");
  }
  const basicPaymentCandidateIds = input.sourceBasicHandCards
    .filter((card) => card.zone === "hand" && card.category === "basic")
    .map((card) => card.id);
  if (input.paymentCardId !== null && !basicPaymentCandidateIds.includes(input.paymentCardId)) {
    return reject("invalid_card", "Xiangle payment is not one of the source's basic hand cards");
  }
  return accept({
    skillId: "xiangle", ownerId: input.ownerId, sourceId: input.slashSourceId,
    basicPaymentCandidateIds: [...basicPaymentCandidateIds], discardCardId: input.paymentCardId,
    slashEffectInvalidForTarget: input.paymentCardId === null,
  });
}

export interface FangquanSkipInput {
  readonly ownerId: PlayerId;
  readonly currentPlayerId: PlayerId;
  readonly ownerAlive: boolean;
  readonly skillEffective: boolean;
  readonly atPlayPhaseBefore: boolean;
  readonly turnId: number;
}

export interface FangquanSkipPlan {
  readonly skillId: "fangquan";
  readonly ownerId: PlayerId;
  readonly turnId: number;
  readonly skipPlayPhase: true;
  readonly endOfTurnMark: { readonly type: "fangquan_skipped_play"; readonly turnId: number };
}

export function planFangquanSkip(input: FangquanSkipInput): MountainRuleResult<FangquanSkipPlan> {
  if (
    !isRecord(input) || !nonempty(input.ownerId) || !nonempty(input.currentPlayerId) ||
    typeof input.ownerAlive !== "boolean" || typeof input.skillEffective !== "boolean" ||
    typeof input.atPlayPhaseBefore !== "boolean" || !positive(input.turnId)
  ) return reject("invalid_input", "Fangquan skip input is malformed");
  if (!input.ownerAlive) return reject("owner_dead", "a dead owner cannot use Fangquan");
  if (!input.skillEffective) return reject("skill_not_effective", "Fangquan is not currently effective");
  if (!input.atPlayPhaseBefore || input.currentPlayerId !== input.ownerId) return reject("wrong_timing", "Fangquan must replace the owner's play phase");
  return accept({
    skillId: "fangquan", ownerId: input.ownerId, turnId: input.turnId,
    skipPlayPhase: true, endOfTurnMark: { type: "fangquan_skipped_play", turnId: input.turnId },
  });
}

export interface FangquanEndInput {
  readonly ownerId: PlayerId;
  readonly ownerAlive: boolean;
  readonly atOwnerTurnEnd: boolean;
  readonly turnId: number;
  readonly markedTurnId: number;
  /** Both null means decline; otherwise both must be present and legal. */
  readonly discardHandCard: MountainRuleCard | null;
  readonly extraTurnTarget: { readonly playerId: PlayerId; readonly alive: boolean } | null;
}

export type FangquanEndPlan =
  | { readonly skillId: "fangquan"; readonly ownerId: PlayerId; readonly clearMark: true; readonly grantExtraTurn: false }
  | {
      readonly skillId: "fangquan";
      readonly ownerId: PlayerId;
      readonly clearMark: true;
      readonly grantExtraTurn: true;
      readonly discardCardId: CardId;
      readonly targetId: PlayerId;
      readonly queuedTurn: { readonly kind: "extra"; readonly playerId: PlayerId; readonly grantedByTurnId: number };
    };

export function planFangquanEnd(input: FangquanEndInput): MountainRuleResult<FangquanEndPlan> {
  if (
    !isRecord(input) || !nonempty(input.ownerId) || typeof input.ownerAlive !== "boolean" ||
    typeof input.atOwnerTurnEnd !== "boolean" || !positive(input.turnId) || !positive(input.markedTurnId) ||
    (input.discardHandCard !== null && !validCard(input.discardHandCard)) ||
    (input.extraTurnTarget !== null && (!isRecord(input.extraTurnTarget) || !nonempty(input.extraTurnTarget.playerId) || typeof input.extraTurnTarget.alive !== "boolean"))
  ) return reject("invalid_input", "Fangquan end input is malformed");
  if (!input.ownerAlive) return reject("owner_dead", "a dead owner cannot finish Fangquan");
  if (!input.atOwnerTurnEnd || input.markedTurnId !== input.turnId) return reject("wrong_timing", "Fangquan mark does not belong to this ending turn");
  if (input.discardHandCard === null && input.extraTurnTarget === null) {
    return accept({ skillId: "fangquan", ownerId: input.ownerId, clearMark: true, grantExtraTurn: false });
  }
  if (input.discardHandCard === null || input.extraTurnTarget === null) {
    return reject("invalid_input", "Fangquan payment and extra-turn target must be committed together");
  }
  if (input.discardHandCard.ownerId !== input.ownerId || input.discardHandCard.zone !== "hand") {
    return reject("invalid_card", "Fangquan requires one owner hand card");
  }
  if (input.extraTurnTarget.playerId === input.ownerId) return reject("invalid_target", "Fangquan must grant the extra turn to another player");
  if (!input.extraTurnTarget.alive) return reject("target_dead", "Fangquan cannot grant an extra turn to a dead player");
  return accept({
    skillId: "fangquan", ownerId: input.ownerId, clearMark: true, grantExtraTurn: true,
    discardCardId: input.discardHandCard.id, targetId: input.extraTurnTarget.playerId,
    queuedTurn: { kind: "extra", playerId: input.extraTurnTarget.playerId, grantedByTurnId: input.turnId },
  });
}

export interface RuoyuInput {
  readonly ownerId: PlayerId;
  readonly currentPlayerId: PlayerId;
  readonly atPreparePhaseStart: boolean;
  readonly ownerAlive: boolean;
  readonly skillEffectiveAsLord: boolean;
  readonly ownerIsLord: boolean;
  readonly alreadyAwakened: boolean;
  readonly hp: number;
  readonly maxHp: number;
  readonly livingPlayerHpValues: readonly number[];
}

export interface RuoyuPlan {
  readonly skillId: "ruoyu";
  readonly ownerId: PlayerId;
  readonly maxHpAfter: number;
  readonly hpAfter: number;
  readonly consumeAwakening: true;
  readonly grantSkillIds: readonly ["jijiang"];
}

export function planRuoyu(input: RuoyuInput): MountainRuleResult<RuoyuPlan> {
  if (
    !isRecord(input) || !nonempty(input.ownerId) || !nonempty(input.currentPlayerId) ||
    typeof input.atPreparePhaseStart !== "boolean" || typeof input.ownerAlive !== "boolean" ||
    typeof input.skillEffectiveAsLord !== "boolean" || typeof input.ownerIsLord !== "boolean" ||
    typeof input.alreadyAwakened !== "boolean" || !positive(input.hp) || !positive(input.maxHp) || input.hp > input.maxHp ||
    !Array.isArray(input.livingPlayerHpValues) || input.livingPlayerHpValues.length === 0 || !input.livingPlayerHpValues.every(positive)
  ) return reject("invalid_input", "Ruoyu input is malformed");
  if (!input.ownerAlive) return reject("owner_dead", "a dead owner cannot awaken");
  if (!input.ownerIsLord || !input.skillEffectiveAsLord) return reject("skill_not_effective", "Ruoyu is an effective native lord skill only");
  if (!input.atPreparePhaseStart || input.currentPlayerId !== input.ownerId) return reject("wrong_timing", "Ruoyu requires the owner's prepare phase start");
  if (input.alreadyAwakened) return reject("already_awakened", "Ruoyu has already awakened");
  if (!input.livingPlayerHpValues.includes(input.hp) || input.livingPlayerHpValues.some((hp) => hp < input.hp)) {
    return reject("awakening_condition_not_met", "Ruoyu requires the owner to tie for minimum HP");
  }
  if (input.maxHp >= Number.MAX_SAFE_INTEGER) return reject("invalid_input", "Ruoyu maximum HP would overflow");
  const maxHpAfter = input.maxHp + 1;
  return accept({
    skillId: "ruoyu", ownerId: input.ownerId, maxHpAfter,
    hpAfter: Math.min(maxHpAfter, input.hp + 1), consumeAwakening: true, grantSkillIds: ["jijiang"],
  });
}

export interface JijiangResponder {
  readonly playerId: PlayerId;
  readonly seat: number;
  readonly alive: boolean;
  readonly faction: Faction;
  readonly hasLegalSlashResponse: boolean;
}

export interface MountainJijiangInput {
  readonly ownerId: PlayerId;
  readonly ownerAlive: boolean;
  readonly ownerIsLord: boolean;
  readonly skillEffective: boolean;
  readonly slashRequestWindowOpen: boolean;
  readonly responders: readonly JijiangResponder[];
}

export interface MountainJijiangPlan {
  readonly skillId: "jijiang";
  readonly ownerId: PlayerId;
  readonly orderedResponderIds: readonly PlayerId[];
  readonly resultingSlashUserId: PlayerId;
}

export function planMountainJijiang(input: MountainJijiangInput): MountainRuleResult<MountainJijiangPlan> {
  if (
    !isRecord(input) || !nonempty(input.ownerId) || typeof input.ownerAlive !== "boolean" ||
    typeof input.ownerIsLord !== "boolean" || typeof input.skillEffective !== "boolean" ||
    typeof input.slashRequestWindowOpen !== "boolean" || !Array.isArray(input.responders)
  ) return reject("invalid_input", "Jijiang input is malformed");
  if (!input.ownerAlive) return reject("owner_dead", "a dead lord cannot invoke Jijiang");
  if (!input.ownerIsLord || !input.skillEffective) return reject("skill_not_effective", "Jijiang is not an effective lord skill");
  if (!input.slashRequestWindowOpen) return reject("wrong_timing", "Jijiang requires a Slash use or response window");
  const ids = new Set<PlayerId>();
  for (const responder of input.responders) {
    if (
      !isRecord(responder) || !nonempty(responder.playerId) || !positive(responder.seat) ||
      typeof responder.alive !== "boolean" || typeof responder.faction !== "string" || !FACTIONS.has(responder.faction) ||
      typeof responder.hasLegalSlashResponse !== "boolean" || ids.has(responder.playerId)
    ) return reject("invalid_input", "Jijiang responder snapshot is malformed or duplicated");
    ids.add(responder.playerId);
  }
  const orderedResponderIds = input.responders
    .filter((responder) => responder.playerId !== input.ownerId && responder.alive && responder.faction === "shu" && responder.hasLegalSlashResponse)
    .sort((left, right) => left.seat - right.seat)
    .map((responder) => responder.playerId);
  if (orderedResponderIds.length === 0) return reject("no_candidate", "no other living Shu player can provide Slash");
  return accept({
    skillId: "jijiang", ownerId: input.ownerId,
    orderedResponderIds: [...orderedResponderIds], resultingSlashUserId: input.ownerId,
  });
}

// ---------------------------------------------------------------------------
// Sun Ce: Jiang / Yingyang / Hunzi / Zhiba / granted Yingzi and Yinghun

export interface JiangInput {
  readonly ownerId: PlayerId;
  readonly ownerAlive: boolean;
  readonly skillEffective: boolean;
  readonly targetDesignationSettled: boolean;
  readonly role: "card_user" | "card_target";
  readonly cardKind: string;
  readonly cardSuit: CardSuit;
  readonly cardUserId: PlayerId;
  readonly targetIds: readonly PlayerId[];
}

export interface JiangPlan {
  readonly skillId: "jiang";
  readonly ownerId: PlayerId;
  readonly role: "card_user" | "card_target";
  readonly drawCount: 1;
  readonly optional: true;
}

export function planJiang(input: JiangInput): MountainRuleResult<JiangPlan> {
  if (
    !isRecord(input) || !nonempty(input.ownerId) || typeof input.ownerAlive !== "boolean" ||
    typeof input.skillEffective !== "boolean" || typeof input.targetDesignationSettled !== "boolean" ||
    (input.role !== "card_user" && input.role !== "card_target") || !nonempty(input.cardKind) ||
    !suit(input.cardSuit) || !nonempty(input.cardUserId) || !uniqueStrings(input.targetIds) || input.targetIds.length === 0
  ) return reject("invalid_input", "Jiang input is malformed");
  if (!input.ownerAlive) return reject("owner_dead", "a dead owner cannot trigger Jiang");
  if (!input.skillEffective) return reject("skill_not_effective", "Jiang is not currently effective");
  if (!input.targetDesignationSettled) return reject("wrong_timing", "Jiang triggers after targets are designated");
  if (input.role === "card_user" && input.cardUserId !== input.ownerId) return reject("invalid_target", "Jiang owner is not this card's user");
  if (input.role === "card_target" && !input.targetIds.includes(input.ownerId)) return reject("invalid_target", "Jiang owner is not among this card's targets");
  const isDuel = input.cardKind === "duel";
  const isRedSlash = SLASH_KINDS.has(input.cardKind) && (input.cardSuit === "heart" || input.cardSuit === "diamond");
  if (!isDuel && !isRedSlash) return reject("invalid_card", "Jiang only observes Duel or a red Slash");
  return accept({ skillId: "jiang", ownerId: input.ownerId, role: input.role, drawCount: 1, optional: true });
}

export interface YingyangInput {
  readonly ownerId: PlayerId;
  readonly ownerAlive: boolean;
  readonly skillEffective: boolean;
  readonly pindianCardRevealed: boolean;
  readonly revealedRank: CardRank;
  readonly choice: "plus_three" | "minus_three" | "decline";
}

export interface YingyangPlan {
  readonly skillId: "yingyang";
  readonly ownerId: PlayerId;
  readonly choice: "plus_three" | "minus_three" | "decline";
  readonly rankBefore: CardRank;
  readonly rankAfter: CardRank;
  readonly appliedDelta: -3 | 0 | 3;
}

export function applyYingyang(input: YingyangInput): MountainRuleResult<YingyangPlan> {
  if (
    !isRecord(input) || !nonempty(input.ownerId) || typeof input.ownerAlive !== "boolean" ||
    typeof input.skillEffective !== "boolean" || typeof input.pindianCardRevealed !== "boolean" ||
    !rank(input.revealedRank) ||
    (input.choice !== "plus_three" && input.choice !== "minus_three" && input.choice !== "decline")
  ) return reject("invalid_input", "Yingyang input is malformed");
  if (!input.ownerAlive) return reject("owner_dead", "a dead participant cannot invoke Yingyang");
  if (!input.skillEffective) return reject("skill_not_effective", "Yingyang is not currently effective");
  if (!input.pindianCardRevealed) return reject("wrong_timing", "Yingyang requires a revealed Pindian card");
  const appliedDelta: -3 | 0 | 3 = input.choice === "plus_three" ? 3 : input.choice === "minus_three" ? -3 : 0;
  const rankAfter = Math.max(1, Math.min(13, input.revealedRank + appliedDelta)) as CardRank;
  return accept({
    skillId: "yingyang", ownerId: input.ownerId, choice: input.choice,
    rankBefore: input.revealedRank, rankAfter, appliedDelta,
  });
}

export interface HunziInput {
  readonly ownerId: PlayerId;
  readonly currentPlayerId: PlayerId;
  readonly atPreparePhaseStart: boolean;
  readonly ownerAlive: boolean;
  readonly skillEffective: boolean;
  readonly alreadyAwakened: boolean;
  readonly hp: number;
  readonly maxHp: number;
}

export interface HunziPlan {
  readonly skillId: "hunzi";
  readonly ownerId: PlayerId;
  readonly maxHpAfter: number;
  readonly hpAfter: number;
  readonly consumeAwakening: true;
  readonly grantSkillIds: readonly ["yingzi", "yinghun"];
}

export function planHunzi(input: HunziInput): MountainRuleResult<HunziPlan> {
  if (
    !isRecord(input) || !nonempty(input.ownerId) || !nonempty(input.currentPlayerId) ||
    typeof input.atPreparePhaseStart !== "boolean" || typeof input.ownerAlive !== "boolean" ||
    typeof input.skillEffective !== "boolean" || typeof input.alreadyAwakened !== "boolean" ||
    !positive(input.hp) || !positive(input.maxHp) || input.hp > input.maxHp
  ) return reject("invalid_input", "Hunzi input is malformed");
  if (!input.ownerAlive) return reject("owner_dead", "a dead owner cannot awaken");
  if (!input.skillEffective) return reject("skill_not_effective", "Hunzi is not currently effective");
  if (!input.atPreparePhaseStart || input.currentPlayerId !== input.ownerId) return reject("wrong_timing", "Hunzi requires the owner's prepare phase start");
  if (input.alreadyAwakened) return reject("already_awakened", "Hunzi has already awakened");
  if (input.hp !== 1) return reject("awakening_condition_not_met", "Hunzi requires exactly one HP");
  if (input.maxHp <= 1) return reject("invalid_input", "Hunzi cannot reduce maximum HP below one");
  const maxHpAfter = input.maxHp - 1;
  return accept({
    skillId: "hunzi", ownerId: input.ownerId, maxHpAfter,
    hpAfter: Math.min(input.hp, maxHpAfter), consumeAwakening: true,
    grantSkillIds: ["yingzi", "yinghun"],
  });
}

export interface ZhibaRequestInput {
  readonly context: MountainPlayContext;
  readonly alreadyRequestedThisPlayPhase: boolean;
  readonly challengerFaction: Faction;
  readonly challengerHandCount: number;
  readonly lordId: PlayerId;
  readonly lordAlive: boolean;
  readonly lordIsCurrentLord: boolean;
  readonly lordSkillEffective: boolean;
  readonly lordHandCount: number;
  readonly lordAwakened: boolean;
  /** Ignored before awakening; after awakening false means the lord refuses. */
  readonly lordAccepts: boolean;
}

export type ZhibaRequestPlan =
  | {
      readonly skillId: "zhiba";
      readonly challengerId: PlayerId;
      readonly lordId: PlayerId;
      readonly consumeChallengerPhaseUse: true;
      readonly accepted: false;
    }
  | {
      readonly skillId: "zhiba";
      readonly challengerId: PlayerId;
      readonly lordId: PlayerId;
      readonly consumeChallengerPhaseUse: true;
      readonly accepted: true;
      readonly beginPindian: { readonly initiatorId: PlayerId; readonly targetId: PlayerId };
    };

export function evaluateZhibaRequest(input: ZhibaRequestInput): MountainRuleResult<ZhibaRequestPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Zhiba request must be an object");
  const failure = activePlayFailure(input.context);
  if (failure) return failure;
  if (
    typeof input.alreadyRequestedThisPlayPhase !== "boolean" ||
    typeof input.challengerFaction !== "string" || !FACTIONS.has(input.challengerFaction) ||
    !nonnegative(input.challengerHandCount) || !nonempty(input.lordId) || typeof input.lordAlive !== "boolean" ||
    typeof input.lordIsCurrentLord !== "boolean" || typeof input.lordSkillEffective !== "boolean" ||
    !nonnegative(input.lordHandCount) || typeof input.lordAwakened !== "boolean" || typeof input.lordAccepts !== "boolean"
  ) return reject("invalid_input", "Zhiba request facts are malformed");
  if (input.alreadyRequestedThisPlayPhase) return reject("already_used", "Zhiba may be requested once per challenger play phase");
  if (input.context.actorId === input.lordId) return reject("invalid_target", "the Zhiba lord cannot challenge themself");
  if (input.challengerFaction !== "wu") return reject("invalid_target", "only another Wu player may request Zhiba");
  if (!input.lordAlive) return reject("target_dead", "the Zhiba lord is dead");
  if (!input.lordIsCurrentLord || !input.lordSkillEffective) return reject("skill_not_effective", "Zhiba is not an effective lord skill");
  if (input.challengerHandCount === 0 || input.lordHandCount === 0) return reject("no_candidate", "both Zhiba participants need a hand card");
  if (input.lordAwakened && !input.lordAccepts) {
    return accept({
      skillId: "zhiba", challengerId: input.context.actorId, lordId: input.lordId,
      consumeChallengerPhaseUse: true, accepted: false,
    });
  }
  return accept({
    skillId: "zhiba", challengerId: input.context.actorId, lordId: input.lordId,
    consumeChallengerPhaseUse: true, accepted: true,
    beginPindian: { initiatorId: input.context.actorId, targetId: input.lordId },
  });
}

export interface ZhibaSettlementInput {
  readonly challengerId: PlayerId;
  readonly lordId: PlayerId;
  readonly challengerRank: CardRank;
  readonly lordRank: CardRank;
  readonly challengerCardId: CardId;
  readonly lordCardId: CardId;
  readonly lordChoosesToGain: boolean;
}

export interface ZhibaSettlementPlan {
  readonly skillId: "zhiba";
  readonly challengerId: PlayerId;
  readonly lordId: PlayerId;
  readonly challengerWon: boolean;
  readonly tied: boolean;
  readonly lordMayGainBoth: boolean;
  readonly destination: "lord_hand" | "discard";
  readonly cardIds: readonly [CardId, CardId];
}

export function planZhibaSettlement(input: ZhibaSettlementInput): MountainRuleResult<ZhibaSettlementPlan> {
  if (
    !isRecord(input) || !nonempty(input.challengerId) || !nonempty(input.lordId) ||
    input.challengerId === input.lordId || !rank(input.challengerRank) || !rank(input.lordRank) ||
    !nonempty(input.challengerCardId) || !nonempty(input.lordCardId) || input.challengerCardId === input.lordCardId ||
    typeof input.lordChoosesToGain !== "boolean"
  ) return reject("invalid_input", "Zhiba settlement input is malformed");
  const challengerWon = input.challengerRank > input.lordRank;
  const tied = input.challengerRank === input.lordRank;
  const lordMayGainBoth = !challengerWon;
  if (input.lordChoosesToGain && !lordMayGainBoth) {
    return reject("invalid_input", "the lord cannot gain cards after the challenger wins");
  }
  return accept({
    skillId: "zhiba", challengerId: input.challengerId, lordId: input.lordId,
    challengerWon, tied, lordMayGainBoth,
    destination: lordMayGainBoth && input.lordChoosesToGain ? "lord_hand" : "discard",
    cardIds: [input.challengerCardId, input.lordCardId],
  });
}

export interface MountainYingziInput {
  readonly ownerId: PlayerId;
  readonly ownerAlive: boolean;
  readonly skillEffective: boolean;
  readonly atDrawPhase: boolean;
  readonly baseDrawCount: number;
  readonly activate: boolean;
}

export interface MountainYingziPlan {
  readonly skillId: "yingzi";
  readonly ownerId: PlayerId;
  readonly activated: boolean;
  readonly drawCount: number;
  /** Original executable rule has no maximum-HP hand-limit override. */
  readonly handLimitOverride: null;
}

export function planMountainYingzi(input: MountainYingziInput): MountainRuleResult<MountainYingziPlan> {
  if (
    !isRecord(input) || !nonempty(input.ownerId) || typeof input.ownerAlive !== "boolean" ||
    typeof input.skillEffective !== "boolean" || typeof input.atDrawPhase !== "boolean" ||
    !nonnegative(input.baseDrawCount) || typeof input.activate !== "boolean"
  ) return reject("invalid_input", "Yingzi input is malformed");
  if (!input.ownerAlive) return reject("owner_dead", "a dead owner cannot draw");
  if (!input.skillEffective) return reject("skill_not_effective", "Yingzi has not been granted or is suppressed");
  if (!input.atDrawPhase) return reject("wrong_timing", "Yingzi modifies the draw phase");
  if (input.activate && input.baseDrawCount >= Number.MAX_SAFE_INTEGER) return reject("invalid_input", "Yingzi draw count would overflow");
  return accept({
    skillId: "yingzi", ownerId: input.ownerId, activated: input.activate,
    drawCount: input.baseDrawCount + (input.activate ? 1 : 0), handLimitOverride: null,
  });
}

export interface MountainYinghunInput {
  readonly ownerId: PlayerId;
  readonly ownerAlive: boolean;
  readonly skillEffective: boolean;
  readonly atPreparePhaseStart: boolean;
  readonly hp: number;
  readonly maxHp: number;
  readonly targetId: PlayerId;
  readonly targetAlive: boolean;
  readonly choice: "draw_x_discard_one" | "draw_one_discard_x";
}

export interface MountainYinghunPlan {
  readonly skillId: "yinghun";
  readonly ownerId: PlayerId;
  readonly targetId: PlayerId;
  readonly lostHp: number;
  readonly drawCount: number;
  readonly requestedDiscardCount: number;
  readonly discardAllIfInsufficient: true;
  readonly optional: true;
}

export function planMountainYinghun(input: MountainYinghunInput): MountainRuleResult<MountainYinghunPlan> {
  if (
    !isRecord(input) || !nonempty(input.ownerId) || typeof input.ownerAlive !== "boolean" ||
    typeof input.skillEffective !== "boolean" || typeof input.atPreparePhaseStart !== "boolean" ||
    !positive(input.hp) || !positive(input.maxHp) || input.hp > input.maxHp ||
    !nonempty(input.targetId) || typeof input.targetAlive !== "boolean" ||
    (input.choice !== "draw_x_discard_one" && input.choice !== "draw_one_discard_x")
  ) return reject("invalid_input", "Yinghun input is malformed");
  if (!input.ownerAlive) return reject("owner_dead", "a dead owner cannot use Yinghun");
  if (!input.skillEffective) return reject("skill_not_effective", "Yinghun has not been granted or is suppressed");
  if (!input.atPreparePhaseStart) return reject("wrong_timing", "Yinghun requires prepare phase start");
  if (input.hp === input.maxHp) return reject("awakening_condition_not_met", "Yinghun requires the owner to be wounded");
  if (input.targetId === input.ownerId) return reject("invalid_target", "Yinghun targets another player");
  if (!input.targetAlive) return reject("target_dead", "Yinghun cannot target a dead player");
  const lostHp = input.maxHp - input.hp;
  return accept({
    skillId: "yinghun", ownerId: input.ownerId, targetId: input.targetId, lostHp,
    drawCount: input.choice === "draw_x_discard_one" ? lostHp : 1,
    requestedDiscardCount: input.choice === "draw_x_discard_one" ? 1 : lostHp,
    discardAllIfInsufficient: true, optional: true,
  });
}

// ---------------------------------------------------------------------------
// Zhang He: Qiaobian

export type QiaobianPhase = "judgment" | "draw" | "play" | "discard";

export interface QiaobianSkipInput {
  readonly ownerId: PlayerId;
  readonly currentPlayerId: PlayerId;
  readonly ownerAlive: boolean;
  readonly skillEffective: boolean;
  readonly atPhaseBefore: boolean;
  readonly phase: QiaobianPhase;
  readonly phaseInstanceId: number;
  readonly alreadyUsedForPhaseInstance: boolean;
  readonly discardHandCard: MountainRuleCard;
}

export interface QiaobianSkipPlan {
  readonly skillId: "qiaobian";
  readonly ownerId: PlayerId;
  readonly phase: QiaobianPhase;
  readonly phaseInstanceId: number;
  readonly discardCardId: CardId;
  readonly skipPhase: true;
  readonly replacement: "none" | "gain_up_to_two_hands" | "move_one_table_card";
}

export function evaluateQiaobianSkip(input: QiaobianSkipInput): MountainRuleResult<QiaobianSkipPlan> {
  if (
    !isRecord(input) || !nonempty(input.ownerId) || !nonempty(input.currentPlayerId) ||
    typeof input.ownerAlive !== "boolean" || typeof input.skillEffective !== "boolean" ||
    typeof input.atPhaseBefore !== "boolean" ||
    (input.phase !== "judgment" && input.phase !== "draw" && input.phase !== "play" && input.phase !== "discard") ||
    !positive(input.phaseInstanceId) || typeof input.alreadyUsedForPhaseInstance !== "boolean" ||
    !validCard(input.discardHandCard)
  ) return reject("invalid_input", "Qiaobian skip input is malformed");
  if (!input.ownerAlive) return reject("owner_dead", "a dead owner cannot use Qiaobian");
  if (!input.skillEffective) return reject("skill_not_effective", "Qiaobian is not currently effective");
  if (!input.atPhaseBefore || input.currentPlayerId !== input.ownerId) return reject("wrong_timing", "Qiaobian must be declared before an eligible owner phase");
  if (input.alreadyUsedForPhaseInstance) return reject("already_used", "this phase instance was already replaced");
  if (input.discardHandCard.ownerId !== input.ownerId || input.discardHandCard.zone !== "hand") {
    return reject("invalid_card", "Qiaobian discards one owner hand card");
  }
  const replacement = input.phase === "draw"
    ? "gain_up_to_two_hands"
    : input.phase === "play"
      ? "move_one_table_card"
      : "none";
  return accept({
    skillId: "qiaobian", ownerId: input.ownerId, phase: input.phase,
    phaseInstanceId: input.phaseInstanceId, discardCardId: input.discardHandCard.id,
    skipPhase: true, replacement,
  });
}

export interface QiaobianDrawSelection {
  readonly targetId: PlayerId;
  readonly targetAlive: boolean;
  readonly handCard: MountainRuleCard;
}

export interface QiaobianDrawInput {
  readonly ownerId: PlayerId;
  readonly selections: readonly QiaobianDrawSelection[];
}

export interface QiaobianDrawPlan {
  readonly skillId: "qiaobian";
  readonly ownerId: PlayerId;
  readonly gains: readonly { readonly fromPlayerId: PlayerId; readonly cardId: CardId; readonly hiddenSelection: true }[];
}

export function planQiaobianDraw(input: QiaobianDrawInput): MountainRuleResult<QiaobianDrawPlan> {
  if (!isRecord(input) || !nonempty(input.ownerId) || !Array.isArray(input.selections)) {
    return reject("invalid_input", "Qiaobian draw replacement is malformed");
  }
  if (input.selections.length > 2) return reject("invalid_target", "Qiaobian may take from at most two players");
  const targetIds = new Set<PlayerId>();
  const cardIds = new Set<CardId>();
  const gains: { fromPlayerId: PlayerId; cardId: CardId; hiddenSelection: true }[] = [];
  for (const selection of input.selections) {
    if (
      !isRecord(selection) || !nonempty(selection.targetId) || typeof selection.targetAlive !== "boolean" ||
      !validCard(selection.handCard)
    ) return reject("invalid_input", "a Qiaobian draw selection is malformed");
    if (selection.targetId === input.ownerId || targetIds.has(selection.targetId)) {
      return reject("invalid_target", "Qiaobian draw targets must be distinct other players");
    }
    if (!selection.targetAlive) return reject("target_dead", "Qiaobian cannot take from a dead player");
    if (
      selection.handCard.ownerId !== selection.targetId || selection.handCard.zone !== "hand" ||
      cardIds.has(selection.handCard.id)
    ) return reject("invalid_card", "Qiaobian must select one hidden hand card from each target");
    targetIds.add(selection.targetId);
    cardIds.add(selection.handCard.id);
    gains.push({ fromPlayerId: selection.targetId, cardId: selection.handCard.id, hiddenSelection: true });
  }
  return accept({ skillId: "qiaobian", ownerId: input.ownerId, gains });
}

export interface QiaobianTableDestination {
  readonly playerId: PlayerId;
  readonly alive: boolean;
  readonly occupiedEquipmentSlots: readonly EquipmentSlot[];
  readonly judgmentCardKinds: readonly string[];
  readonly canReceiveDelayedTrick: boolean;
}

export interface QiaobianTableMoveInput {
  readonly ownerId: PlayerId;
  readonly sourceId: PlayerId;
  readonly sourceAlive: boolean;
  readonly card: MountainRuleCard;
  readonly destination: QiaobianTableDestination;
}

export interface QiaobianTableMovePlan {
  readonly skillId: "qiaobian";
  readonly ownerId: PlayerId;
  readonly cardId: CardId;
  readonly fromPlayerId: PlayerId;
  readonly toPlayerId: PlayerId;
  readonly zone: "equipment" | "judgment";
  readonly correspondingPosition: EquipmentSlot | string;
}

export function planQiaobianTableMove(input: QiaobianTableMoveInput): MountainRuleResult<QiaobianTableMovePlan> {
  if (
    !isRecord(input) || !nonempty(input.ownerId) || !nonempty(input.sourceId) ||
    typeof input.sourceAlive !== "boolean" || !validCard(input.card) || !isRecord(input.destination) ||
    !nonempty(input.destination.playerId) || typeof input.destination.alive !== "boolean" ||
    !Array.isArray(input.destination.occupiedEquipmentSlots) ||
    !input.destination.occupiedEquipmentSlots.every((slot) => typeof slot === "string" && SLOTS.has(slot)) ||
    new Set(input.destination.occupiedEquipmentSlots).size !== input.destination.occupiedEquipmentSlots.length ||
    !uniqueStrings(input.destination.judgmentCardKinds) || typeof input.destination.canReceiveDelayedTrick !== "boolean"
  ) return reject("invalid_input", "Qiaobian table move input is malformed");
  if (!input.sourceAlive || !input.destination.alive) return reject("target_dead", "both Qiaobian table-move players must be alive");
  if (input.sourceId === input.destination.playerId) return reject("invalid_target", "Qiaobian must move the card to another player");
  if (input.card.ownerId !== input.sourceId || (input.card.zone !== "equipment" && input.card.zone !== "judgment")) {
    return reject("invalid_card", "Qiaobian only moves a source equipment or judgment card");
  }
  if (input.card.zone === "equipment") {
    const slot = input.card.equipmentSlot;
    if (slot === null || input.destination.occupiedEquipmentSlots.includes(slot)) {
      return reject("invalid_target", "the destination's corresponding equipment slot is occupied");
    }
    return accept({
      skillId: "qiaobian", ownerId: input.ownerId, cardId: input.card.id,
      fromPlayerId: input.sourceId, toPlayerId: input.destination.playerId,
      zone: "equipment", correspondingPosition: slot,
    });
  }
  if (input.card.category !== "trick" || input.card.equipmentSlot !== null) {
    return reject("invalid_card", "a judgment-zone card must be a delayed trick");
  }
  if (!input.destination.canReceiveDelayedTrick || input.destination.judgmentCardKinds.includes(input.card.kind)) {
    return reject("invalid_target", "the delayed trick has no legal corresponding position at the destination");
  }
  return accept({
    skillId: "qiaobian", ownerId: input.ownerId, cardId: input.card.id,
    fromPlayerId: input.sourceId, toPlayerId: input.destination.playerId,
    zone: "judgment", correspondingPosition: input.card.kind,
  });
}

// ---------------------------------------------------------------------------
// Zhang Zhao & Zhang Hong: Zhijian / Guzheng

export interface ZhijianInput {
  readonly context: MountainPlayContext;
  readonly equipmentCard: MountainRuleCard;
  readonly targetId: PlayerId;
  readonly targetAlive: boolean;
  readonly targetCanReceiveEquipment: boolean;
  readonly occupiedEquipmentSlots: readonly EquipmentSlot[];
}

export interface ZhijianPlan {
  readonly skillId: "zhijian";
  readonly ownerId: PlayerId;
  readonly cardId: CardId;
  readonly targetId: PlayerId;
  readonly equipmentSlot: EquipmentSlot;
  readonly drawCountAfterInstall: 1;
}

export function evaluateZhijian(input: ZhijianInput): MountainRuleResult<ZhijianPlan> {
  if (!isRecord(input)) return reject("invalid_input", "Zhijian input must be an object");
  const failure = activePlayFailure(input.context);
  if (failure) return failure;
  if (
    !validCard(input.equipmentCard) || !nonempty(input.targetId) || typeof input.targetAlive !== "boolean" ||
    typeof input.targetCanReceiveEquipment !== "boolean" || !Array.isArray(input.occupiedEquipmentSlots) ||
    !input.occupiedEquipmentSlots.every((slot) => typeof slot === "string" && SLOTS.has(slot)) ||
    new Set(input.occupiedEquipmentSlots).size !== input.occupiedEquipmentSlots.length
  ) return reject("invalid_input", "Zhijian target facts are malformed");
  if (
    input.equipmentCard.ownerId !== input.context.actorId || input.equipmentCard.zone !== "hand" ||
    input.equipmentCard.category !== "equipment" || input.equipmentCard.equipmentSlot === null
  ) return reject("invalid_card", "Zhijian requires an equipment card from the owner's hand");
  if (input.targetId === input.context.actorId) return reject("invalid_target", "Zhijian targets another player");
  if (!input.targetAlive) return reject("target_dead", "Zhijian cannot install equipment on a dead player");
  if (!input.targetCanReceiveEquipment) {
    return reject("invalid_target", "the target's corresponding equipment slot is unavailable");
  }
  return accept({
    skillId: "zhijian", ownerId: input.context.actorId, cardId: input.equipmentCard.id,
    targetId: input.targetId, equipmentSlot: input.equipmentCard.equipmentSlot, drawCountAfterInstall: 1,
  });
}

export interface GuzhengDiscardRecord {
  readonly card: MountainRuleCard;
  readonly discardedById: PlayerId;
  readonly enteredDuringDiscardPhase: boolean;
  readonly fromHand: boolean;
  readonly stillInDiscardPile: boolean;
}

export interface GuzhengInput {
  readonly ownerId: PlayerId;
  readonly ownerAlive: boolean;
  readonly skillEffective: boolean;
  readonly atOtherDiscardPhaseEnd: boolean;
  readonly discardPhaseOwnerId: PlayerId;
  readonly discardPhaseOwnerAlive: boolean;
  readonly records: readonly GuzhengDiscardRecord[];
  readonly returnCardId: CardId;
}

export interface GuzhengPlan {
  readonly skillId: "guzheng";
  readonly ownerId: PlayerId;
  readonly discardPhaseOwnerId: PlayerId;
  readonly returnToDiscarderCardId: CardId;
  readonly gainCardIds: readonly CardId[];
  readonly optional: true;
}

export function planGuzheng(input: GuzhengInput): MountainRuleResult<GuzhengPlan> {
  if (
    !isRecord(input) || !nonempty(input.ownerId) || typeof input.ownerAlive !== "boolean" ||
    typeof input.skillEffective !== "boolean" || typeof input.atOtherDiscardPhaseEnd !== "boolean" ||
    !nonempty(input.discardPhaseOwnerId) || typeof input.discardPhaseOwnerAlive !== "boolean" ||
    !Array.isArray(input.records) || !nonempty(input.returnCardId)
  ) return reject("invalid_input", "Guzheng input is malformed");
  if (!input.ownerAlive) return reject("owner_dead", "a dead owner cannot use Guzheng");
  if (!input.skillEffective) return reject("skill_not_effective", "Guzheng is not currently effective");
  if (!input.atOtherDiscardPhaseEnd) return reject("wrong_timing", "Guzheng requires another player's discard phase end");
  if (input.discardPhaseOwnerId === input.ownerId) return reject("invalid_target", "Guzheng only observes another player's discard phase");
  if (!input.discardPhaseOwnerAlive) return reject("target_dead", "Guzheng cannot return a card to a dead discarder");
  const seen = new Set<CardId>();
  for (const record of input.records) {
    if (
      !isRecord(record) || !validCard(record.card) || !nonempty(record.discardedById) ||
      typeof record.enteredDuringDiscardPhase !== "boolean" || typeof record.fromHand !== "boolean" ||
      typeof record.stillInDiscardPile !== "boolean" || seen.has(record.card.id)
    ) return reject("invalid_input", "Guzheng discard history is malformed or duplicated");
    seen.add(record.card.id);
  }
  const eligible = input.records.filter((record) =>
    record.discardedById === input.discardPhaseOwnerId &&
    record.enteredDuringDiscardPhase && record.fromHand && record.stillInDiscardPile &&
    record.card.zone === "discard"
  );
  if (eligible.length === 0) return reject("no_candidate", "no eligible discard-phase hand card remains in the discard pile");
  if (!eligible.some((record) => record.card.id === input.returnCardId)) {
    return reject("invalid_card", "Guzheng must return one eligible discard-phase hand card");
  }
  return accept({
    skillId: "guzheng", ownerId: input.ownerId, discardPhaseOwnerId: input.discardPhaseOwnerId,
    returnToDiscarderCardId: input.returnCardId,
    gainCardIds: eligible.filter((record) => record.card.id !== input.returnCardId).map((record) => record.card.id),
    optional: true,
  });
}

// ---------------------------------------------------------------------------
// Zuo Ci: Huashen / Xinsheng

export type HuashenSkillCategory =
  | "normal"
  | "locked"
  | "lord"
  | "limited"
  | "awakening"
  | "post_awakening"
  | "hidden";

export interface HuashenFormSkill {
  readonly skillId: string;
  readonly category: HuashenSkillCategory;
}

export interface HuashenForm {
  readonly generalId: string;
  readonly faction: Faction;
  readonly gender: Gender;
  readonly skills: readonly HuashenFormSkill[];
}

function validHuashenForm(value: unknown): value is HuashenForm {
  if (
    !isRecord(value) || !nonempty(value.generalId) ||
    typeof value.faction !== "string" || !FACTIONS.has(value.faction) ||
    typeof value.gender !== "string" || !GENDERS.has(value.gender) ||
    !Array.isArray(value.skills)
  ) return false;
  const skillIds = new Set<string>();
  for (const skill of value.skills) {
    if (
      !isRecord(skill) || !nonempty(skill.skillId) ||
      (skill.category !== "normal" && skill.category !== "locked" && skill.category !== "lord" &&
        skill.category !== "limited" && skill.category !== "awakening" &&
        skill.category !== "post_awakening" && skill.category !== "hidden") ||
      skillIds.has(skill.skillId)
    ) return false;
    skillIds.add(skill.skillId);
  }
  return true;
}

function huashenEligibleSkills(form: HuashenForm): readonly string[] {
  return form.skills
    .filter((skill) => skill.category === "normal" || skill.category === "locked")
    .map((skill) => skill.skillId);
}

function validateHuashenFormList(value: unknown): value is readonly HuashenForm[] {
  return Array.isArray(value) && value.every(validHuashenForm) &&
    new Set(value.map((form) => form.generalId)).size === value.length;
}

export interface HuashenInitialInput {
  readonly ownerId: PlayerId;
  readonly ownerAlive: boolean;
  readonly skillEffective: boolean;
  readonly atGameStart: boolean;
  readonly ownerGeneralId: string;
  /** Generals already selected for seats or otherwise unavailable to the form pool. */
  readonly unavailableGeneralIds: readonly string[];
  /** Exactly two forms already chosen by the authoritative seeded RNG. */
  readonly offeredForms: readonly HuashenForm[];
  readonly selectedFormGeneralId: string;
  readonly selectedSkillId: string;
}

export interface HuashenInitialPlan {
  readonly skillId: "huashen";
  readonly ownerId: PlayerId;
  readonly ownedForms: readonly HuashenForm[];
  readonly selectedFormGeneralId: string;
  readonly grantSkillId: string;
  readonly effectiveFaction: Faction;
  readonly effectiveGender: Gender;
  readonly preservesIdentityHpMaxHpZonesAndTurnState: true;
  readonly replacesPlayerObject: false;
}

export function planHuashenInitial(input: HuashenInitialInput): MountainRuleResult<HuashenInitialPlan> {
  if (
    !isRecord(input) || !nonempty(input.ownerId) || typeof input.ownerAlive !== "boolean" ||
    typeof input.skillEffective !== "boolean" || typeof input.atGameStart !== "boolean" ||
    !nonempty(input.ownerGeneralId) || !uniqueStrings(input.unavailableGeneralIds) ||
    !validateHuashenFormList(input.offeredForms) || !nonempty(input.selectedFormGeneralId) || !nonempty(input.selectedSkillId)
  ) return reject("invalid_input", "Huashen initial input is malformed");
  if (!input.ownerAlive) return reject("owner_dead", "a dead owner cannot initialize Huashen");
  if (!input.skillEffective) return reject("skill_not_effective", "Huashen is not currently effective");
  if (!input.atGameStart) return reject("wrong_timing", "initial Huashen forms are gained at game start");
  if (input.offeredForms.length !== 2) return reject("invalid_input", "initial Huashen requires exactly two offered forms");
  const unavailable = new Set([input.ownerGeneralId, ...input.unavailableGeneralIds]);
  if (input.offeredForms.some((form) => unavailable.has(form.generalId))) {
    return reject("invalid_target", "Huashen forms must be unused generals outside the game");
  }
  const selected = input.offeredForms.find((form) => form.generalId === input.selectedFormGeneralId);
  if (!selected) return reject("invalid_target", "selected Huashen form is not among the two offered forms");
  if (!huashenEligibleSkills(selected).includes(input.selectedSkillId)) {
    return reject("invalid_target", "Huashen may grant one normal or locked skill, not lord/limited/awakening/hidden skills");
  }
  return accept({
    skillId: "huashen", ownerId: input.ownerId,
    ownedForms: input.offeredForms.map((form) => ({
      generalId: form.generalId, faction: form.faction, gender: form.gender,
      skills: form.skills.map((skill) => ({ ...skill })),
    })),
    selectedFormGeneralId: selected.generalId, grantSkillId: input.selectedSkillId,
    effectiveFaction: selected.faction, effectiveGender: selected.gender,
    preservesIdentityHpMaxHpZonesAndTurnState: true, replacesPlayerObject: false,
  });
}

export interface HuashenSwitchInput {
  readonly ownerId: PlayerId;
  readonly ownerAlive: boolean;
  readonly skillEffective: boolean;
  readonly window: "turn_start" | "turn_end";
  readonly ownedForms: readonly HuashenForm[];
  readonly currentFormGeneralId: string;
  readonly currentGrantedSkillId: string;
  readonly selectedFormGeneralId: string;
  readonly selectedSkillId: string;
}

export interface HuashenSwitchPlan {
  readonly skillId: "huashen";
  readonly ownerId: PlayerId;
  readonly window: "turn_start" | "turn_end";
  readonly revokeSkillId: string;
  readonly grantSkillId: string;
  readonly selectedFormGeneralId: string;
  readonly effectiveFaction: Faction;
  readonly effectiveGender: Gender;
  readonly preservesIdentityHpMaxHpZonesAndTurnState: true;
  readonly replacesPlayerObject: false;
}

export function planHuashenSwitch(input: HuashenSwitchInput): MountainRuleResult<HuashenSwitchPlan> {
  if (
    !isRecord(input) || !nonempty(input.ownerId) || typeof input.ownerAlive !== "boolean" ||
    typeof input.skillEffective !== "boolean" || (input.window !== "turn_start" && input.window !== "turn_end") ||
    !validateHuashenFormList(input.ownedForms) || !nonempty(input.currentFormGeneralId) ||
    !nonempty(input.currentGrantedSkillId) || !nonempty(input.selectedFormGeneralId) || !nonempty(input.selectedSkillId)
  ) return reject("invalid_input", "Huashen switch input is malformed");
  if (!input.ownerAlive) return reject("owner_dead", "a dead owner cannot switch Huashen");
  if (!input.skillEffective) return reject("skill_not_effective", "Huashen is not currently effective");
  const current = input.ownedForms.find((form) => form.generalId === input.currentFormGeneralId);
  const selected = input.ownedForms.find((form) => form.generalId === input.selectedFormGeneralId);
  if (!current || !huashenEligibleSkills(current).includes(input.currentGrantedSkillId)) {
    return reject("invalid_input", "current Huashen form/skill state is corrupt");
  }
  if (!selected) return reject("invalid_target", "selected Huashen form is not owned");
  if (!huashenEligibleSkills(selected).includes(input.selectedSkillId)) {
    return reject("invalid_target", "selected Huashen skill is ineligible or absent from the selected form");
  }
  return accept({
    skillId: "huashen", ownerId: input.ownerId, window: input.window,
    revokeSkillId: input.currentGrantedSkillId, grantSkillId: input.selectedSkillId,
    selectedFormGeneralId: selected.generalId, effectiveFaction: selected.faction,
    effectiveGender: selected.gender, preservesIdentityHpMaxHpZonesAndTurnState: true,
    replacesPlayerObject: false,
  });
}

export interface XinshengInput {
  readonly ownerId: PlayerId;
  readonly ownerAliveAfterDamage: boolean;
  readonly skillEffective: boolean;
  readonly damageAftermathSettled: boolean;
  readonly damageAmount: number;
  readonly damagePoint: number;
  readonly ownerGeneralId: string;
  readonly unavailableGeneralIds: readonly string[];
  readonly ownedFormGeneralIds: readonly string[];
  /** One form chosen by the authoritative seeded RNG for this damage point. */
  readonly offeredForm: HuashenForm;
}

export interface XinshengPlan {
  readonly skillId: "xinsheng";
  readonly ownerId: PlayerId;
  readonly damagePoint: number;
  readonly addForm: HuashenForm;
  readonly optional: true;
}

export function planXinsheng(input: XinshengInput): MountainRuleResult<XinshengPlan> {
  if (
    !isRecord(input) || !nonempty(input.ownerId) || typeof input.ownerAliveAfterDamage !== "boolean" ||
    typeof input.skillEffective !== "boolean" || typeof input.damageAftermathSettled !== "boolean" ||
    !positive(input.damageAmount) || !positive(input.damagePoint) || input.damagePoint > input.damageAmount ||
    !nonempty(input.ownerGeneralId) || !uniqueStrings(input.unavailableGeneralIds) ||
    !uniqueStrings(input.ownedFormGeneralIds) || !validHuashenForm(input.offeredForm)
  ) return reject("invalid_input", "Xinsheng input is malformed");
  if (!input.ownerAliveAfterDamage) return reject("owner_dead", "Xinsheng does not trigger after the owner dies");
  if (!input.skillEffective) return reject("skill_not_effective", "Xinsheng is not currently effective");
  if (!input.damageAftermathSettled) return reject("wrong_timing", "Xinsheng waits for this damage point's dying aftermath");
  const unavailable = new Set([input.ownerGeneralId, ...input.unavailableGeneralIds, ...input.ownedFormGeneralIds]);
  if (unavailable.has(input.offeredForm.generalId)) {
    return reject("invalid_target", "Xinsheng must gain a new unused general form");
  }
  if (huashenEligibleSkills(input.offeredForm).length === 0) {
    return reject("pool_exhausted", "the offered form has no Huashen-eligible skill");
  }
  return accept({
    skillId: "xinsheng", ownerId: input.ownerId, damagePoint: input.damagePoint,
    addForm: {
      generalId: input.offeredForm.generalId, faction: input.offeredForm.faction,
      gender: input.offeredForm.gender, skills: input.offeredForm.skills.map((skill) => ({ ...skill })),
    },
    optional: true,
  });
}
