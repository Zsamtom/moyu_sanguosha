import {
  createStandardDeck,
  damageNatureForSlash,
  getCardDefinition,
  isSlashCardKind,
} from "./cards.js";
import { DEFAULT_GENERALS, getGeneralDefinition } from "./generals.js";
import { FULL_GENERAL_CATALOG } from "./full-general-catalog.js";
import { getSkillRuleTextDefinition } from "./skills/rule-text.js";
import {
  assertGeneralDraftForConfig,
  finalizeGeneralDraft,
  type GeneralDraftState,
} from "./engine/general-draft.js";
import {
  addMark,
  addStatusEffect,
  awakenSkill,
  consumeLimitedSkill,
  effectiveSkillIds as lifecycleEffectiveSkillIds,
  expireLifecycleState,
  grantSkill,
  hasAwakened,
  markCount,
  recordSkillLoss,
  spendMarks,
  type StatusEffect,
} from "./engine/lifecycle.js";
import { createDamageInstance, type LifePlayerState } from "./engine/damage.js";
import {
  applyDamageLifeFlow,
  actOnDamageOpportunity,
  closeDamageFlowWindow,
  currentDamageFlowPrompt,
  finishDamageFlowFrame,
  openDamageFlowWindow,
  pushDamageFlowFrame,
  resumeDamageAfterDyingFlow,
  type DamageFlowCallerContinuation,
  type DamageFlowFrame,
  type DamageFlowState,
  type DamageOpportunityEffect,
  type DamageOpportunityRef,
  type DamageFlowWindowKind,
} from "./engine/damage-flow.js";
import {
  applyDyingOwnerResponseSave,
  confirmDeath,
  createDyingFrame,
  currentDyingEntrySaveSkill,
  currentDyingOwnerResponseSkill,
  currentDyingResponder,
  declineDyingOwnerResponseSave,
  passDyingRescue,
  playDyingRescueCard,
  popResolvedDyingFrame,
  pushDyingFrame,
  recordDyingRescue,
  rescueDyingPlayer,
  resolveDyingEntrySave,
  resolveDyingRecoverySave,
  topDyingFrame,
  type DyingFrame,
} from "./engine/dying.js";
import {
  completeDeathAfter,
  completeDeathCardDisposition,
  completeDeathRewardPunishment,
  completeDeathTriggers,
  createDeathFrame,
  popCompletedDeathFrame,
  pushDeathFrame,
  revealDeathIdentity,
  topDeathFrame,
  type DeathFrame,
} from "./engine/death.js";
import {
  decodeGameDamageContinuation,
  encodeGameDamageContinuation,
  type GameDamageResume,
} from "./engine/game-damage-continuation.js";
import {
  createCompleteRulesEngineState,
  migrateCompleteRulesEngineState,
} from "./engine/state.js";
import {
  cloneJudgmentFrame,
  completeJudgmentPostOpportunity,
  createJudgmentFrame,
  currentJudgmentPostOpportunity,
  currentJudgmentRetrialOpportunity,
  passJudgmentRetrial,
  replaceJudgmentCard,
  resolveJudgment,
  revealJudgmentCard,
  settleJudgmentCard,
  setEffectiveJudgmentSuit,
  type JudgmentFrame,
  type JudgmentPattern,
} from "./engine/judgment.js";
import { drawTopCards, reorderTopCards, type DeckServiceState } from "./engine/deck.js";
import {
  assertPindianFrame,
  clonePindianFrame,
  comparePindian,
  createPindianFrame,
  modifyPindianRank,
  revealPindianCards,
  selectPindianCard,
  settlePindianCards,
  type PindianFrame,
} from "./engine/pindian.js";
import { commitMoveBatch, type AtomicZoneState, type MoveBatch, type MoveIntent, type MoveRecord, type ZoneRef } from "./engine/zones.js";
import {
  adjudicateGuhuoChallenge,
  analyzeBuquWounds,
  evaluateGuidaoCost,
  evaluateHuangtianGift,
  evaluateJushouDisposal,
  evaluateLiegong,
  evaluateShensuActivation,
  evaluateTianxiangChoice,
  isGuhuoDeclarableKind,
  planBuquWounds,
  planLeiji,
  planKuangguRecovery,
  resolveHongyanSuit,
  resolveBuquRecoveryPoint,
} from "./skills/wind-runtime.js";
import {
  evaluateBazhen,
  evaluateHuoji,
  evaluateJiemingPoint,
  evaluateKanpo,
  evaluateLianhuan,
  evaluateLuanji,
  evaluateMengjin,
  evaluateQiangxi,
  evaluateQuhuTargets,
  evaluateShuangxiong,
  evaluateTianyi,
  evaluateXueyi,
  planQuhuDamage,
  planNiepan,
} from "./skills/fire-runtime.js";
import {
  analyzeHaoshiTransfer,
  evaluateBenghuaiTrigger,
  evaluateHaoshiActivation,
  evaluateLuanwuActivation,
  evaluateZaiqiActivation,
  planDimeng,
  planBenghuaiChoice,
  planLuanwuActor,
  planYinghun,
  planYinghunDiscard,
  planZaiqiSettlement,
  validateHaoshiTransferChoice,
} from "./skills/forest-runtime.js";
import {
  applyTuntianDistance,
  applyYingyang,
  evaluateJixi,
  evaluateQiaobianSkip,
  evaluateTiaoxin,
  evaluateTuntianLoss,
  evaluateZhijian,
  evaluateZhibaRequest,
  planFangquanEnd,
  planFangquanSkip,
  planBeige,
  planDuanchang,
  planGuzheng,
  planHunzi,
  planHuashenInitial,
  planHuashenSwitch,
  planQiaobianDraw,
  planQiaobianTableMove,
  planRuoyu,
  planTuntianJudgment,
  planXinsheng,
  planJiang,
  planTiaoxinResolution,
  planXiangle,
  planZaoxian,
  planZhiji,
  planZhibaSettlement,
  type HuashenForm,
  type MountainRuleCard,
  type QiaobianPhase,
} from "./skills/mountain-runtime.js";
import {
  bindHuoshouSource,
  evaluateDuanliang,
  evaluateHuoshouImmunity,
  evaluateJiuchi,
  evaluateJuxiangImmunity,
  evaluateWeimuTarget,
  planJuxiangClaim,
  planRoulinResponses,
  resolveHuoshouDamageSource,
} from "./skills/forest-runtime.js";
import {
  evaluateBaonueTrigger,
  evaluateLierenTrigger,
  evaluateSongwei,
  evaluateWanshaPeach,
  planFangzhu,
  planLierenGain,
  planXingshang,
  resolveLierenPindian,
  settleBaonueJudgment,
} from "./skills/forest-runtime.js";
import {
  assertExactPartition,
  cloneStandardDamageAftermath,
  cloneStandardJudgmentContext,
  standardPromptId,
} from "./skills/standard-runtime.js";
import {
  evaluateLonghun,
  evaluateShelieActivation,
  evaluateWushenDistance,
  evaluateWushenViewAs,
  planBaiyin,
  planGongxin,
  planGuixinPoint,
  planJilueFangzhu,
  planJilueGuicai,
  planJilueJizhi,
  planJilueWansha,
  planJilueZhiheng,
  planFeiyingDistance,
  planJuejingDraw,
  planJuejingHandLimit,
  planKuangfeng,
  planKuangbaoDamage,
  planKuangbaoInitial,
  planDawu,
  planLianpoExtraTurn,
  planQinyin,
  planQixingExchange,
  planQixingInitial,
  planQixingWeatherCleanup,
  planQixingWeatherDamage,
  planRenjieDamage,
  planRenjieDiscard,
  planShenfen,
  planShenfenVictimDiscard,
  planYeyan,
  planWuqian,
  planWumou,
  planShelieSettlement,
  planWuhunDamageMarks,
  planWuhunDeath,
  recordLianpoKill,
  settleWuhunJudgment,
} from "./skills/god-runtime.js";
import type {
  Card,
  CardId,
  CardKind,
  CardRank,
  CardSuit,
  CardUseContinuation,
  CardUseIntent,
  CreateGameInput,
  DamageNature,
  DamageOpportunityCursor,
  DeathResolutionCompletion,
  EquipmentSlot,
  GameAction,
  GamePlayer,
  GamePrompt,
  GameRuleErrorCode,
  GameSession,
  GameView,
  GameWinner,
  GeneralId,
  GeneralSkillId,
  DyingResume,
  LordDispatchSkillId,
  LordDispatchableResponse,
  PendingGuhuo,
  PendingGuhuoChallenge,
  PendingGuhuoConsequence,
  PendingLordDispatch,
  PendingLeijiDodge,
  PendingDyingResponse,
  PendingDeathResolution,
  PendingDuelResponse,
  PendingMassAttackResponse,
  PendingNullificationResponse,
  PendingPindian,
  PendingQiangxiEffect,
  PendingRecoveryPoint,
  PendingResponse,
  PendingStandardJudgment,
  PendingStandardSkill,
  PendingTrickEffect,
  GuhuoRespondablePending,
  PlayableCardHint,
  PlayableSkillHint,
  PlayerId,
  QueuedExtraTurn,
  PublicLogType,
  ResponseContext,
  Role,
  RoleDistribution,
  ShenfenContinuation,
  SkillTriggerRef,
  SkillResponseHint,
  PendingSlashResponse,
  SlashResolutionContinuation,
  StandardDamageAftermath,
  StandardImplementedSkillId,
  StandardJudgmentContext,
  TurnState,
  WumouContinuation,
  YeyanContinuation,
} from "./types.js";
import {
  normalizeChaCha20Key,
  randomInteger,
  type ChaCha20State,
} from "./prng.js";
import {
  roleDistributionForCompleteRules,
  type RoomRuleConfig,
} from "./rule-config.js";

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;
const INITIAL_HAND_SIZE = 4;
const TURN_DRAW_COUNT = 2;
const MAX_PUBLIC_LOGS = 500;

export class GameRuleError extends Error {
  readonly code: GameRuleErrorCode;

  constructor(code: GameRuleErrorCode, message: string) {
    super(message);
    this.name = "GameRuleError";
    this.code = code;
  }
}

function ruleError(code: GameRuleErrorCode, message: string): never {
  throw new GameRuleError(code, message);
}

export function getRoleDistribution(playerCount: number): RoleDistribution {
  try {
    return roleDistributionForCompleteRules(playerCount);
  } catch {
    ruleError(
      "INVALID_PLAYER_COUNT",
      `玩家人数必须在 ${MIN_PLAYERS} 到 ${MAX_PLAYERS} 之间。`,
    );
  }
}

function rolesFor(playerCount: number): Role[] {
  return rolesFromDistribution(getRoleDistribution(playerCount));
}

function shuffleRolesWithLordFirst(playerCount: number, rng: ChaCha20State): {
  readonly items: readonly Role[];
  readonly state: ChaCha20State;
} {
  const shuffled = shuffle(rolesFor(playerCount).filter((role) => role !== "lord"), rng);
  return { items: ["lord", ...shuffled.items], state: shuffled.state };
}

function shuffle<T>(
  items: readonly T[],
  initialState: ChaCha20State,
): { items: T[]; state: ChaCha20State } {
  const shuffled = [...items];
  let state = initialState;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const generated = randomInteger(state, index + 1);
    state = generated.state;
    const swapIndex = generated.value;
    const current = shuffled[index];
    const replacement = shuffled[swapIndex];
    if (current === undefined || replacement === undefined) {
      throw new Error("洗牌索引越界。");
    }
    shuffled[index] = replacement;
    shuffled[swapIndex] = current;
  }
  return { items: shuffled, state };
}

function addLog(session: GameSession, type: PublicLogType, message: string): void {
  session.logs.push({ id: session.nextLogId, type, message });
  if (session.logs.length > MAX_PUBLIC_LOGS) {
    session.logs.splice(0, session.logs.length - MAX_PUBLIC_LOGS);
  }
  session.nextLogId += 1;
}

function refillDeck(session: GameSession): void {
  if (session.deck.length > 0 || session.discardPile.length === 0) return;
  const shuffled = shuffle(session.discardPile, session.rng);
  session.deck = shuffled.items;
  session.discardPile = [];
  session.rng = shuffled.state;
  addLog(session, "system", "弃牌堆已重新洗牌并成为新的牌堆。");
}

function drawCards(session: GameSession, player: GamePlayer, count: number): number {
  let drawn = 0;
  while (drawn < count) {
    refillDeck(session);
    const card = session.deck.pop();
    if (!card) break;
    player.hand.push(card);
    drawn += 1;
  }
  return drawn;
}

function getPlayer(session: GameSession, playerId: PlayerId): GamePlayer {
  const player = session.players.find((candidate) => candidate.id === playerId);
  if (!player) ruleError("UNKNOWN_PLAYER", `玩家 ${playerId} 不在本局游戏中。`);
  return player;
}

function getLivingPlayer(session: GameSession, playerId: PlayerId): GamePlayer {
  const player = getPlayer(session, playerId);
  if (!player.alive) ruleError("PLAYER_DEAD", `玩家 ${playerId} 已阵亡。`);
  return player;
}

const LORD_SKILL_IDS = new Set<GeneralSkillId>(
  FULL_GENERAL_CATALOG.flatMap((general) => general.skills)
    .filter((skill) => skill.category === "lord")
    .map((skill) => skill.rulesId),
);

const INTRINSIC_SKILL_IDS_BY_GENERAL = new Map(
  FULL_GENERAL_CATALOG.map((general) => [
    general.id,
    general.skills
      .filter((skill) => skill.category !== "post_awakening" &&
        (skill.category !== "special" || skill.rulesId === "huashen"))
      .map((skill) => skill.rulesId),
  ] as const),
);

function rawLifecycleSkillIds(session: GameSession, player: GamePlayer): GeneralSkillId[] {
  const base = player.generalId ? INTRINSIC_SKILL_IDS_BY_GENERAL.get(player.generalId) ?? [] : [];
  return lifecycleEffectiveSkillIds(session.completeRules.lifecycle, player.id, base)
    .filter((skillId): skillId is GeneralSkillId => typeof skillId === "string") as GeneralSkillId[];
}

const HUASHEN_FORM_EFFECT = "huashen_form";
const HUASHEN_SELECTED_EFFECT = "huashen_selected";
const QIXING_INITIALIZED_EFFECT = "qixing_initialized";
const KUANGBAO_INITIALIZED_EFFECT = "kuangbao_initialized";

function initializeMissingKuangbao(session: GameSession): void {
  for (const owner of session.players) {
    if (!owner.alive || !hasEffectiveSkill(session, owner, "kuangbao") ||
        session.completeRules.lifecycle.effects.some((effect) =>
          effect.ownerId === owner.id && effect.kind === KUANGBAO_INITIALIZED_EFFECT)) continue;
    const plan = planKuangbaoInitial({
      context: godSkillContext(session, owner, "kuangbao"),
      gameStarting: true,
      existingRageMarks: rageMarkCount(session, owner.id),
    });
    if (!plan.ok) throw new Error(plan.detail);
    addLivePermanentMark(session, owner.id, "rage", owner.id, "kuangbao", plan.value.rageMarkDelta);
    addStatusEffect(session.completeRules.lifecycle, {
      ownerId: owner.id,
      kind: KUANGBAO_INITIALIZED_EFFECT,
      sourcePlayerId: owner.id,
      sourceSkillId: "kuangbao",
      payload: { initializedAtTurn: session.turn.number },
      visibility: "server_only",
      expiry: { type: "permanent" },
    });
    addLog(session, "system", `${owner.id} 的狂暴在游戏开始时获得 2 枚暴怒标记。`);
  }
}
const QIXING_PILE_ID = "stars";
const KUANGFENG_EFFECT = "qixing_weather_kuangfeng";
const DAWU_EFFECT = "qixing_weather_dawu";

type QixingWeatherSkillId = "kuangfeng" | "dawu";

function qixingWeatherKind(skillId: QixingWeatherSkillId): string {
  return skillId === "kuangfeng" ? KUANGFENG_EFFECT : DAWU_EFFECT;
}

function qixingWeatherSkillId(effect: StatusEffect): QixingWeatherSkillId | null {
  if (effect.kind === KUANGFENG_EFFECT) return "kuangfeng";
  if (effect.kind === DAWU_EFFECT) return "dawu";
  return null;
}

function assertQixingWeatherEffect(session: GameSession, effect: StatusEffect): QixingWeatherSkillId {
  const skillId = qixingWeatherSkillId(effect);
  const createdAtTurn = effect.payload.createdAtTurn;
  if (skillId === null || effect.sourcePlayerId === null || effect.sourceSkillId !== skillId ||
      effect.visibility !== "public" || Object.keys(effect.payload).length !== 1 ||
      !Number.isSafeInteger(createdAtTurn) || (createdAtTurn as number) <= 0 ||
      (createdAtTurn as number) > session.turn.number ||
      !session.players.some((player) => player.id === effect.ownerId) ||
      !session.players.some((player) => player.id === effect.sourcePlayerId) ||
      effect.expiry.type !== "any_of" || effect.expiry.anyOf.length !== 3) {
    throw new Error("七星天气状态被篡改。");
  }
  const hasTurnStart = effect.expiry.anyOf.some((atom) => atom.type === "turn_start" &&
    atom.playerId === effect.sourcePlayerId && atom.afterTurnId === createdAtTurn);
  const hasSourceDeath = effect.expiry.anyOf.some((atom) => atom.type === "source_death" &&
    atom.sourcePlayerId === effect.sourcePlayerId);
  const hasTargetDeath = effect.expiry.anyOf.some((atom) => atom.type === "owner_death" &&
    atom.ownerId === effect.ownerId);
  if (!hasTurnStart || !hasSourceDeath || !hasTargetDeath) throw new Error("七星天气期限被篡改。");
  return skillId;
}

function qixingWeatherEffects(
  session: GameSession,
  targetId: PlayerId,
  skillId: QixingWeatherSkillId,
): StatusEffect[] {
  const effects = session.completeRules.lifecycle.effects.filter((effect) =>
    effect.ownerId === targetId && effect.kind === qixingWeatherKind(skillId));
  for (const effect of effects) {
    if (assertQixingWeatherEffect(session, effect) !== skillId) throw new Error("七星天气技能来源不一致。");
  }
  return effects.slice().sort((left, right) => left.effectId - right.effectId);
}

function qixingWeatherDamagePlan(
  session: GameSession,
  target: GamePlayer,
  baseDamage: number,
  nature: DamageNature,
) {
  const plan = planQixingWeatherDamage({
    targetId: target.id,
    targetAlive: target.alive,
    baseDamage,
    nature,
    kuangfengApplied: qixingWeatherEffects(session, target.id, "kuangfeng").length > 0,
    dawuApplied: qixingWeatherEffects(session, target.id, "dawu").length > 0,
  });
  if (!plan.ok) throw new Error(plan.detail);
  return plan.value;
}

function addQixingWeatherEffect(
  session: GameSession,
  sourceId: PlayerId,
  targetId: PlayerId,
  skillId: QixingWeatherSkillId,
): void {
  if (qixingWeatherEffects(session, targetId, skillId)
    .some((effect) => effect.sourcePlayerId === sourceId && effect.payload.createdAtTurn === session.turn.number)) {
    throw new Error("同一回合不能重复添加同源七星天气。");
  }
  addStatusEffect(session.completeRules.lifecycle, {
    ownerId: targetId,
    kind: qixingWeatherKind(skillId),
    sourcePlayerId: sourceId,
    sourceSkillId: skillId,
    payload: { createdAtTurn: session.turn.number },
    visibility: "public",
    expiry: {
      type: "any_of",
      anyOf: [
        { type: "turn_start", playerId: sourceId, afterTurnId: session.turn.number },
        { type: "source_death", sourcePlayerId: sourceId },
        { type: "owner_death", ownerId: targetId },
      ],
    },
  });
}

function discardQixingStars(
  session: GameSession,
  owner: GamePlayer,
  cardIds: readonly CardId[],
  skillId: QixingWeatherSkillId,
  eventId: number,
): void {
  const zones = sessionZoneState(session);
  commitLiveMoveBatch(session, zones.state, {
    batchId: nextMoveBatchId(session),
    intents: [{
      cardIds: [...cardIds],
      from: { kind: "extra", playerId: owner.id, pileId: QIXING_PILE_ID },
      to: { kind: "discard" },
      reason: "skill_effect",
      visibility: "public",
      actorId: owner.id,
      sourceId: owner.id,
      targetId: owner.id,
      skillId,
      frameId: eventId,
    }],
  });
  syncSessionZones(session, zones);
}

function expireQixingWeatherFromSource(
  session: GameSession,
  sourceId: PlayerId,
  reason: "owner_next_turn_start" | "owner_death",
): void {
  const ownedEffects = session.completeRules.lifecycle.effects.filter((effect) => {
    const skillId = qixingWeatherSkillId(effect);
    if (skillId === null || effect.sourcePlayerId !== sourceId) return false;
    assertQixingWeatherEffect(session, effect);
    return true;
  });
  const kuangfengTargetIds = [...new Set(ownedEffects
    .filter((effect) => effect.kind === KUANGFENG_EFFECT)
    .map((effect) => effect.ownerId))];
  const dawuTargetIds = [...new Set(ownedEffects
    .filter((effect) => effect.kind === DAWU_EFFECT)
    .map((effect) => effect.ownerId))];
  const plan = planQixingWeatherCleanup({ ownerId: sourceId, reason, kuangfengTargetIds, dawuTargetIds });
  if (!plan.ok) throw new Error(plan.detail);
  expireLifecycleState(session.completeRules.lifecycle, reason === "owner_death"
    ? { type: "source_death", sourcePlayerId: sourceId }
    : { type: "turn_start", playerId: sourceId, turnId: session.turn.number });
  if (plan.value.clearKuangfengTargetIds.some((targetId) =>
      qixingWeatherEffects(session, targetId, "kuangfeng").some((effect) => effect.sourcePlayerId === sourceId)) ||
      plan.value.clearDawuTargetIds.some((targetId) =>
        qixingWeatherEffects(session, targetId, "dawu").some((effect) => effect.sourcePlayerId === sourceId))) {
    throw new Error("七星天气未按来源完成清理。");
  }
}

function qixingInitialized(session: GameSession, owner: GamePlayer): boolean {
  const effects = session.completeRules.lifecycle.effects.filter((effect) =>
    effect.ownerId === owner.id && effect.kind === QIXING_INITIALIZED_EFFECT);
  if (effects.length === 0) return false;
  const effect = effects[0]!;
  if (effects.length !== 1 || effect.sourcePlayerId !== owner.id || effect.sourceSkillId !== "qixing" ||
      effect.visibility !== "server_only" || effect.expiry.type !== "permanent" ||
      effect.payload.initialHandCount !== 4 || effect.payload.initialStarCount !== 7 ||
      Object.keys(effect.payload).length !== 2) {
    throw new Error("七星初始化状态被篡改。");
  }
  return true;
}

function offerMissingInitialQixing(session: GameSession): boolean {
  for (const owner of session.players.slice().sort((left, right) => left.seat - right.seat)) {
    if (!owner.alive || !hasEffectiveSkill(session, owner, "qixing") || qixingInitialized(session, owner)) continue;
    if (owner.hand.length !== INITIAL_HAND_SIZE) {
      throw new Error("七星开局初始化要求恰有四张起始手牌。");
    }
    if ((owner.extraPiles[QIXING_PILE_ID]?.length ?? 0) !== 0) {
      throw new Error("未初始化七星角色已经持有星牌。");
    }
    if (session.deck.length + session.discardPile.length < 7) {
      throw new Error("七星开局初始化没有足够的七张牌。");
    }
    const transition = drawTopCards(deckServiceState(session), 7);
    applyDeckServiceState(session, transition.state);
    owner.extraPiles[QIXING_PILE_ID] = transition.cards.map(cloneCard);
    addStatusEffect(session.completeRules.lifecycle, {
      ownerId: owner.id,
      kind: QIXING_INITIALIZED_EFFECT,
      sourcePlayerId: owner.id,
      sourceSkillId: "qixing",
      payload: { initialHandCount: 4, initialStarCount: 7 },
      visibility: "server_only",
      expiry: { type: "permanent" },
    });
    const eventId = allocateEventId(session);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: owner.id,
      promptId: standardPromptId(eventId, "qixing", owner.id, "initial"),
      eventId,
      skillId: "qixing",
      stage: "qixing_initial",
      handCardIds: owner.hand.map((card) => card.id),
      starCardIds: transition.cards.map((card) => card.id),
    };
    addLog(session, "card", `${owner.id} 须在四张起始手牌与七张私有星牌之间完成初始七星交换。`);
    return true;
  }
  return false;
}

function continueGameStartSkills(session: GameSession): void {
  initializeMissingKuangbao(session);
  if (offerMissingInitialQixing(session)) return;
  if (!getPlayer(session, session.currentPlayerId).alive) {
    beginNextTurn(session);
    return;
  }
  beginTurnStart(session);
}

/** Explicit post-draft boundary: final generals and four-card hands, then turn one. */
export function initializeGameStartSkills(session: GameSession): GameSession {
  if (session.status !== "playing" || session.turn.number !== 1 || session.turn.phase !== "prepare" ||
      session.pendingResponse !== null || session.completeRules.damageFlow.frames.length > 0 ||
      session.completeRules.dying.frames.length > 0 || session.completeRules.death.frames.length > 0 ||
      session.afterMove.queuedRecoveries.length > 0 || session.afterMove.queuedTriggers.length > 0 ||
      session.afterMove.suspendedPhase !== null || session.afterMove.suspendedResponse !== null ||
      session.completeRules.lifecycle.effects.some((effect) => effect.kind === QIXING_INITIALIZED_EFFECT)) {
    ruleError("INVALID_PHASE", "开局技能初始化只能在选将与起始手牌确定后、第一回合开始前执行一次。");
  }
  const next = cloneSession(session);
  continueGameStartSkills(next);
  return next;
}

function catalogHuashenForm(generalId: string): HuashenForm {
  const general = FULL_GENERAL_CATALOG.find((candidate) => candidate.id === generalId);
  if (!general) throw new Error("化身状态包含未知武将。");
  return {
    generalId: general.id,
    faction: general.faction === "selectable" ? "god" : general.faction,
    gender: general.gender,
    skills: general.skills.map((skill) => ({
      skillId: skill.rulesId,
      category: skill.category === "optional" ? "normal"
        : skill.category === "special" ? "hidden" : skill.category,
    })),
  };
}

function huashenEligibleSkillIds(form: HuashenForm): GeneralSkillId[] {
  return form.skills
    .filter((skill) => skill.category === "normal" || skill.category === "locked")
    .map((skill) => skill.skillId as GeneralSkillId);
}

function huashenOwnedForms(session: GameSession, owner: GamePlayer): HuashenForm[] {
  const effects = session.completeRules.lifecycle.effects.filter((effect) => effect.kind === HUASHEN_FORM_EFFECT);
  const allIds = effects.map((effect) => {
    if (!session.players.some((player) => player.id === effect.ownerId) ||
        effect.sourcePlayerId !== effect.ownerId || effect.sourceSkillId !== "huashen" ||
        effect.visibility !== "server_only" || effect.expiry.type !== "permanent" ||
        Object.keys(effect.payload).length !== 1 || typeof effect.payload.generalId !== "string") {
      throw new Error("化身身份状态被篡改。");
    }
    const form = catalogHuashenForm(effect.payload.generalId);
    if (huashenEligibleSkillIds(form).length === 0) throw new Error("化身身份没有可选择技能。");
    return form.generalId;
  });
  const seated = new Set(session.players.flatMap((player) => player.generalId ? [player.generalId] : []));
  if (new Set(allIds).size !== allIds.length || allIds.some((generalId) => seated.has(generalId as GeneralId))) {
    throw new Error("化身身份状态重复或占用了已登场武将。");
  }
  return effects
    .filter((effect) => effect.ownerId === owner.id)
    .map((effect) => catalogHuashenForm(effect.payload.generalId as string));
}

function selectedHuashenState(
  session: GameSession,
  owner: GamePlayer,
): { readonly form: HuashenForm; readonly skillId: GeneralSkillId } | null {
  const forms = huashenOwnedForms(session, owner);
  const selectedEffects = session.completeRules.lifecycle.effects.filter((effect) =>
    effect.ownerId === owner.id && effect.kind === HUASHEN_SELECTED_EFFECT);
  const grants = session.completeRules.lifecycle.grants.filter((grant) =>
    grant.ownerId === owner.id && grant.sourcePlayerId === owner.id && grant.sourceSkillId === "huashen");
  if (selectedEffects.length === 0) {
    if (grants.length > 0) throw new Error("化身技能授权缺少选中身份。");
    return null;
  }
  const selected = selectedEffects[0]!;
  if (selectedEffects.length !== 1 || selected.sourcePlayerId !== owner.id || selected.sourceSkillId !== "huashen" ||
      selected.visibility !== "server_only" || selected.expiry.type !== "permanent" ||
      Object.keys(selected.payload).length !== 2 || typeof selected.payload.generalId !== "string" ||
      typeof selected.payload.skillId !== "string") {
    throw new Error("化身选中状态被篡改。");
  }
  const form = forms.find((candidate) => candidate.generalId === selected.payload.generalId);
  const skillId = selected.payload.skillId as GeneralSkillId;
  if (!form || !huashenEligibleSkillIds(form).includes(skillId) || grants.length !== 1 ||
      grants[0]!.skillId !== skillId || grants[0]!.expiry.type !== "permanent") {
    throw new Error("化身选中身份与技能授权不一致。");
  }
  return { form, skillId };
}

function effectiveHuashenState(
  session: GameSession,
  owner: GamePlayer,
): { readonly form: HuashenForm; readonly skillId: GeneralSkillId } | null {
  return rawLifecycleSkillIds(session, owner).includes("huashen") ? selectedHuashenState(session, owner) : null;
}

function huashenUnavailableGeneralIds(session: GameSession): string[] {
  return [...new Set([
    ...session.players.flatMap((player) => player.generalId ? [player.generalId] : []),
    ...session.players.flatMap((player) => huashenOwnedForms(session, player).map((form) => form.generalId)),
  ])];
}

function huashenFormPool(session: GameSession): HuashenForm[] {
  const unavailable = new Set(huashenUnavailableGeneralIds(session));
  return FULL_GENERAL_CATALOG
    .filter((general) => !unavailable.has(general.id))
    .map((general) => catalogHuashenForm(general.id))
    .filter((form) => huashenEligibleSkillIds(form).length > 0);
}

function chooseHuashenForms(session: GameSession, count: number): HuashenForm[] {
  const pool = huashenFormPool(session);
  if (pool.length < count) throw new Error("没有足够的未登场武将可作为化身。");
  const selected = shuffle(pool, session.rng);
  session.rng = selected.state;
  return selected.items.slice(0, count);
}

function addHuashenFormState(session: GameSession, owner: GamePlayer, form: HuashenForm): void {
  if (huashenOwnedForms(session, owner).some((candidate) => candidate.generalId === form.generalId) ||
      huashenUnavailableGeneralIds(session).includes(form.generalId)) {
    throw new Error("不能重复或占用已登场武将作为化身。");
  }
  addStatusEffect(session.completeRules.lifecycle, {
    ownerId: owner.id,
    kind: HUASHEN_FORM_EFFECT,
    sourcePlayerId: owner.id,
    sourceSkillId: "huashen",
    payload: { generalId: form.generalId },
    visibility: "server_only",
    expiry: { type: "permanent" },
  });
}

function setHuashenSelection(
  session: GameSession,
  owner: GamePlayer,
  form: HuashenForm,
  skillId: GeneralSkillId,
): void {
  if (!huashenOwnedForms(session, owner).some((candidate) => candidate.generalId === form.generalId) ||
      !huashenEligibleSkillIds(form).includes(skillId)) {
    throw new Error("化身选择不属于持有身份或技能不合法。");
  }
  const lifecycle = session.completeRules.lifecycle;
  lifecycle.effects = lifecycle.effects.filter((effect) =>
    effect.ownerId !== owner.id || effect.kind !== HUASHEN_SELECTED_EFFECT);
  lifecycle.grants = lifecycle.grants.filter((grant) =>
    grant.ownerId !== owner.id || grant.sourcePlayerId !== owner.id || grant.sourceSkillId !== "huashen");
  addStatusEffect(lifecycle, {
    ownerId: owner.id,
    kind: HUASHEN_SELECTED_EFFECT,
    sourcePlayerId: owner.id,
    sourceSkillId: "huashen",
    payload: { generalId: form.generalId, skillId },
    visibility: "server_only",
    expiry: { type: "permanent" },
  });
  grantSkill(lifecycle, {
    ownerId: owner.id,
    skillId,
    sourcePlayerId: owner.id,
    sourceSkillId: "huashen",
    expiry: { type: "permanent" },
  });
  selectedHuashenState(session, owner);
}

function huashenChoiceToken(form: HuashenForm, skillId: GeneralSkillId): string {
  return `huashen:${form.generalId}:${skillId}`;
}

function huashenChoiceOptions(session: GameSession, owner: GamePlayer): string[] {
  return huashenOwnedForms(session, owner).flatMap((form) =>
    huashenEligibleSkillIds(form).map((skillId) => huashenChoiceToken(form, skillId)));
}

function parseHuashenChoice(
  session: GameSession,
  owner: GamePlayer,
  token: string,
): { readonly form: HuashenForm; readonly skillId: GeneralSkillId } {
  const parts = token.split(":");
  if (parts.length !== 3 || parts[0] !== "huashen") ruleError("INVALID_SELECTION", "化身选择令牌无效。");
  const form = huashenOwnedForms(session, owner).find((candidate) => candidate.generalId === parts[1]);
  const skillId = parts[2] as GeneralSkillId;
  if (!form || !huashenEligibleSkillIds(form).includes(skillId) || token !== huashenChoiceToken(form, skillId)) {
    ruleError("INVALID_SELECTION", "只能选择持有化身的一项普通技或锁定技。");
  }
  return { form, skillId };
}

function huashenUnavailableForPlan(session: GameSession, owner: GamePlayer): string[] {
  return [...new Set([
    ...session.players.flatMap((player) => player.generalId ? [player.generalId] : []),
    ...session.players
      .filter((player) => player.id !== owner.id)
      .flatMap((player) => huashenOwnedForms(session, player).map((form) => form.generalId)),
  ])];
}

function offerMissingInitialHuashen(session: GameSession): boolean {
  for (const owner of session.players.slice().sort((left, right) => left.seat - right.seat)) {
    if (!owner.alive || !hasEffectiveSkill(session, owner, "huashen")) continue;
    let forms = huashenOwnedForms(session, owner);
    const selected = selectedHuashenState(session, owner);
    if (selected) continue;
    if (forms.length === 0) {
      for (const form of chooseHuashenForms(session, 2)) addHuashenFormState(session, owner, form);
      forms = huashenOwnedForms(session, owner);
    }
    if (forms.length !== 2) throw new Error("化身初始状态必须恰有两个未选身份。");
    const eventId = allocateEventId(session);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: owner.id,
      promptId: standardPromptId(eventId, "huashen", owner.id, "initial"),
      eventId,
      skillId: "huashen",
      stage: "huashen_initial",
    };
    addLog(session, "card", `${owner.id} 须从两张私有化身牌中展示一张并选择其一项技能。`);
    return true;
  }
  return false;
}

function offerHuashenSwitch(
  session: GameSession,
  owner: GamePlayer,
  stage: "huashen_turn_start" | "huashen_turn_end",
): boolean {
  if (!owner.alive || !hasEffectiveSkill(session, owner, "huashen") || !selectedHuashenState(session, owner)) return false;
  const eventId = allocateEventId(session);
  session.turn.phase = "respond";
  session.pendingResponse = {
    type: "standard_skill",
    targetId: owner.id,
    promptId: standardPromptId(eventId, "huashen", owner.id, stage),
    eventId,
    skillId: "huashen",
    stage,
  };
  addLog(session, "turn", `${owner.id} 可以在${stage === "huashen_turn_start" ? "准备阶段" : "结束阶段"}更换化身。`);
  return true;
}

/**
 * Lord skills are active only for the living lord. A non-lord with 伪帝
 * mirrors only the current living lord's current lord-skill instances. Reading
 * the lord's raw set prevents 伪帝 from recursively copying another 伪帝 view.
 */
export function getEffectiveGeneralSkillIds(session: GameSession, playerId: PlayerId): GeneralSkillId[] {
  const player = getPlayer(session, playerId);
  const ownRaw = rawLifecycleSkillIds(session, player);
  const effective = ownRaw.filter((skillId) => !LORD_SKILL_IDS.has(skillId) || player.role === "lord");
  if (!player.alive || player.role === "lord" || !ownRaw.includes("weidi")) return [...new Set(effective)];
  const lord = session.players.find((candidate) => candidate.alive && candidate.role === "lord");
  if (!lord || lord.id === player.id) return [...new Set(effective)];
  const inherited = rawLifecycleSkillIds(session, lord).filter((skillId) => LORD_SKILL_IDS.has(skillId));
  return [...new Set([...effective, ...inherited])];
}

function hasEffectiveSkill(session: GameSession, player: GamePlayer, skillId: GeneralSkillId): boolean {
  return getEffectiveGeneralSkillIds(session, player.id).includes(skillId);
}

function factionOf(session: GameSession, player: GamePlayer): "wei" | "shu" | "wu" | "qun" | "god" | null {
  const huashen = effectiveHuashenState(session, player);
  if (huashen) return huashen.form.faction;
  if (!player.generalId) return null;
  const general = getGeneralDefinition(player.generalId);
  return general.factionSelectable ? player.godFaction : general.faction;
}

export function getEffectivePlayerFaction(
  session: GameSession,
  playerId: PlayerId,
): "wei" | "shu" | "wu" | "qun" | "god" | null {
  return factionOf(session, getPlayer(session, playerId));
}

function genderOf(session: GameSession, player: GamePlayer): "male" | "female" | null {
  return effectiveHuashenState(session, player)?.form.gender ??
    (player.generalId ? getGeneralDefinition(player.generalId).gender : null);
}

function livingFactionCount(session: GameSession): number {
  return new Set(
    session.players
      .filter((player) => player.alive)
      .map((player) => factionOf(session, player))
      .filter((faction): faction is "wei" | "shu" | "wu" | "qun" =>
        faction === "wei" || faction === "shu" || faction === "wu" || faction === "qun"),
  ).size;
}

export function handLimitFor(session: GameSession, playerId: PlayerId): number {
  const player = getLivingPlayer(session, playerId);
  let limit = Math.max(0, player.hp);
  if (hasEffectiveSkill(session, player, "xueyi")) {
    const xueyi = evaluateXueyi({
      ownerId: player.id,
      hasEffectiveLordSkill: true,
      players: session.players.map((candidate) => ({
        playerId: candidate.id,
        alive: candidate.alive,
        faction: factionOf(session, candidate) ?? "god",
      })),
    });
    if (!xueyi.ok) throw new Error(xueyi.detail);
    limit += xueyi.value.handLimitBonus;
  }
  if (hasEffectiveSkill(session, player, "juejing")) {
    const juejing = planJuejingHandLimit({
      ownerId: player.id,
      ownerAlive: player.alive,
      skillEffective: true,
      baseHandLimit: limit,
    });
    if (!juejing.ok) throw new Error(juejing.detail);
    limit = juejing.value.finalHandLimit;
  }
  return limit;
}

function drawPhaseCardCount(session: GameSession, player: GamePlayer, modifier = 0): number {
  const yongsi = hasEffectiveSkill(session, player, "yongsi") ? livingFactionCount(session) : 0;
  const baseDrawCount = Math.max(0, TURN_DRAW_COUNT + yongsi + modifier);
  if (!hasEffectiveSkill(session, player, "juejing")) return baseDrawCount;
  const result = planJuejingDraw({
    context: {
      ownerId: player.id,
      ownerAlive: player.alive,
      skillEffective: true,
    },
    ownerHp: player.hp,
    ownerMaxHp: player.maxHp,
    baseDrawCount,
  });
  if (!result.ok) throw new Error(result.detail);
  return result.value.finalDrawCount;
}

function canBeSlashTarget(session: GameSession, player: GamePlayer): boolean {
  return !(player.hand.length === 0 && hasEffectiveSkill(session, player, "kongcheng"));
}

function canBeDuelTarget(session: GameSession, player: GamePlayer): boolean {
  return !(player.hand.length === 0 && hasEffectiveSkill(session, player, "kongcheng"));
}

function canBeQianxunTarget(session: GameSession, player: GamePlayer): boolean {
  return !hasEffectiveSkill(session, player, "qianxun");
}

/** Circular seat distance among living players. Dead seats do not block adjacency. */
export function distanceBetweenPlayers(
  session: GameSession,
  sourceId: PlayerId,
  targetId: PlayerId,
): number {
  if (sourceId === targetId) return 0;
  getLivingPlayer(session, sourceId);
  getLivingPlayer(session, targetId);
  const living = session.players
    .filter((player) => player.alive)
    .sort((left, right) => left.seat - right.seat);
  const sourceIndex = living.findIndex((player) => player.id === sourceId);
  const targetIndex = living.findIndex((player) => player.id === targetId);
  const clockwise = (targetIndex - sourceIndex + living.length) % living.length;
  const base = Math.min(clockwise, living.length - clockwise);
  const source = getLivingPlayer(session, sourceId);
  const target = getLivingPlayer(session, targetId);
  const offensive = (source.equipment.offensive_horse ? 1 : 0) + (hasEffectiveSkill(session, source, "mashu") ? 1 : 0);
  const defensive = target.equipment.defensive_horse ? 1 : 0;
  const result = applyTuntianDistance({
    ownerId: source.id,
    targetId: target.id,
    skillEffective: hasEffectiveSkill(session, source, "tuntian"),
    baseDistance: Math.max(1, base - offensive + defensive),
    fieldCount: (source.extraPiles.field ?? []).length,
  });
  if (!result.ok) throw new Error(result.detail);
  const feiying = planFeiyingDistance({
    sourceId: source.id,
    targetId: target.id,
    targetAlive: target.alive,
    targetHasEffectiveFeiying: hasEffectiveSkill(session, target, "feiying"),
    baseDistance: result.value.distance,
  });
  if (!feiying.ok) throw new Error(feiying.detail);
  return feiying.value.distance;
}

export function attackRangeFor(_session: GameSession, _playerId: PlayerId): number {
  const player = getLivingPlayer(_session, _playerId);
  const weapon = player.equipment.weapon;
  return weapon ? getCardDefinition(weapon.kind).weaponRange ?? 1 : 1;
}

function isInSlashRange(session: GameSession, sourceId: PlayerId, targetId: PlayerId): boolean {
  return distanceBetweenPlayers(session, sourceId, targetId) <= attackRangeFor(session, sourceId);
}

function hasTianyiWin(session: GameSession, player: GamePlayer): boolean {
  return session.currentPlayerId === player.id && session.turn.tianyiOutcome === "win";
}

function activeSlashUses(session: GameSession): number {
  return session.turn.slashUsed ? session.turn.activeSlashUses ?? 1 : 0;
}

function activeSlashTargetLimit(
  session: GameSession,
  player: GamePlayer,
  fangTianEligible: boolean,
): number {
  return (fangTianEligible ? 3 : 1) + (hasTianyiWin(session, player) ? 1 : 0);
}

function activeSlashTargetMode(maxTargets: number): PlayableCardHint["targetMode"] {
  if (maxTargets >= 4) return "up-to-four";
  if (maxTargets === 3) return "up-to-three";
  if (maxTargets === 2) return "up-to-two";
  return "single-other";
}

function isInActiveSlashRange(session: GameSession, source: GamePlayer, targetId: PlayerId): boolean {
  return hasTianyiWin(session, source) || isInSlashRange(session, source.id, targetId);
}

function isInOwnerDeclaredSlashRange(
  session: GameSession,
  source: GamePlayer,
  targetId: PlayerId,
  slashEffectiveSuit: CardSuit,
): boolean {
  if (hasTianyiWin(session, source)) return true;
  const result = evaluateWushenDistance({
    attackerId: source.id,
    hasEffectiveWushen: hasEffectiveSkill(session, source, "wushen"),
    slashEffectiveSuit,
    declarationOrigin: "owner_declared_target",
    targetWithinOrdinaryRange: isInSlashRange(session, source.id, targetId),
  });
  if (!result.ok) throw new Error(result.detail);
  return result.value.targetLegalByDistance;
}

function markActiveSlashUsed(session: GameSession): void {
  session.turn.activeSlashUses = activeSlashUses(session) + 1;
  session.turn.slashUsed = true;
}

function enqueueAfterMoveSkill(
  session: GameSession,
  player: GamePlayer,
  skillId: Extract<SkillTriggerRef["skillId"], "lianying" | "xiaoji">,
): void {
  if (!hasEffectiveSkill(session, player, skillId)) return;
  const eventId = allocateEventId(session);
  session.afterMove.queuedTriggers.push({
    triggerId: `${eventId}:${skillId}:${player.id}:0`,
    eventId,
    ownerId: player.id,
    skillId,
    targetIndex: 0,
    mandatory: false,
  });
}

function enqueueTuntianLossBatch(
  session: GameSession,
  player: GamePlayer,
  lostCards: readonly { readonly card: Card; readonly zone: "hand" | "equipment" }[],
  moveBatchId?: number,
): void {
  if (lostCards.length === 0 || !player.alive || session.currentPlayerId === player.id ||
      !hasEffectiveSkill(session, player, "tuntian")) return;
  const batchId = moveBatchId ?? nextMoveBatchId(session);
  const evaluated = evaluateTuntianLoss({
    ownerId: player.id,
    ownerAlive: player.alive,
    skillEffective: true,
    currentTurnPlayerId: session.currentPlayerId,
    moveBatchId: batchId,
    lostCards: lostCards.map(({ card, zone }) => mountainRuleCard(session, player, card, zone)),
  });
  if (!evaluated.ok) throw new Error(evaluated.detail);
  const existingIndex = session.afterMove.queuedTriggers.findIndex((trigger) =>
    trigger.skillId === "tuntian" && trigger.ownerId === player.id && trigger.moveBatchId === batchId);
  if (existingIndex >= 0) {
    const existing = session.afterMove.queuedTriggers[existingIndex]!;
    session.afterMove.queuedTriggers[existingIndex] = {
      ...existing,
      cardIds: [...new Set([...(existing.cardIds ?? []), ...evaluated.value.qualifyingLostCardIds])],
    };
    return;
  }
  const eventId = allocateEventId(session);
  session.afterMove.queuedTriggers.push({
    triggerId: `${eventId}:tuntian:${player.id}:${batchId}`,
    eventId,
    ownerId: player.id,
    skillId: "tuntian",
    targetIndex: 0,
    mandatory: false,
    moveBatchId: batchId,
    cardIds: [...evaluated.value.qualifyingLostCardIds],
  });
}

/** The single committed hand-loss entry point used by every current rule path. */
function removeCard(session: GameSession, player: GamePlayer, cardId: CardId, moveBatchId?: number): Card {
  const index = player.hand.findIndex((card) => card.id === cardId);
  if (index < 0) ruleError("CARD_NOT_FOUND", `手牌中不存在 ${cardId}。`);
  const [card] = player.hand.splice(index, 1);
  if (!card) throw new Error("移除手牌失败。");
  // A temporarily reified virtual card already emitted the move event when
  // its physical origin left hand/equipment, so its synthetic hand removal
  // must not emit a second 连营 trigger.
  if (!session.virtualCardOrigins[card.id]) {
    enqueueTuntianLossBatch(session, player, [{ card, zone: "hand" }], moveBatchId);
  }
  if (player.hand.length === 0 && !session.virtualCardOrigins[card.id]) {
    enqueueAfterMoveSkill(session, player, "lianying");
  }
  return card;
}

function assertPlayTurn(session: GameSession, playerId: PlayerId): void {
  if (session.turn.phase !== "play") {
    ruleError("INVALID_PHASE", "当前不是出牌阶段。");
  }
  if (session.currentPlayerId !== playerId) {
    ruleError("NOT_YOUR_TURN", "当前不是你的回合。");
  }
}

function playerIdsForSide(session: GameSession, side: GameWinner["side"]): PlayerId[] {
  if (side === "lord") {
    return session.players
      .filter((player) => player.role === "lord" || player.role === "loyalist")
      .map((player) => player.id);
  }
  return session.players
    .filter((player) => player.role === side)
    .map((player) => player.id);
}

function winnerFor(session: GameSession): GameWinner | null {
  const lord = session.players.find((player) => player.role === "lord");
  if (!lord) throw new Error("游戏状态中缺少主公。");
  const livingPlayers = session.players.filter((player) => player.alive);

  if (!lord.alive) {
    const survivor = livingPlayers.length === 1 ? livingPlayers[0] : undefined;
    if (survivor?.role === "renegade") {
      return {
        side: "renegade",
        playerIds: playerIdsForSide(session, "renegade"),
      };
    }
    return {
      side: "rebel",
      playerIds: playerIdsForSide(session, "rebel"),
    };
  }

  const threatsRemain = livingPlayers.some(
    (player) => player.role === "rebel" || player.role === "renegade",
  );
  if (!threatsRemain) {
    return {
      side: "lord",
      playerIds: playerIdsForSide(session, "lord"),
    };
  }
  return null;
}

function finishWithWinner(session: GameSession, winner: GameWinner): void {
  expireLifecycleState(session.completeRules.lifecycle, { type: "game_end" });
  session.status = "finished";
  session.winner = winner;
  session.pendingResponse = null;
  session.afterMove.queuedRecoveries = [];
  session.afterMove.queuedTriggers = [];
  session.afterMove.suspendedPhase = null;
  session.afterMove.suspendedResponse = null;
  const sideName: Record<GameWinner["side"], string> = {
    lord: "主公与忠臣",
    rebel: "反贼",
    renegade: "内奸",
  };
  addLog(session, "victory", `${sideName[winner.side]}获胜。`);
}

function finishIfWon(session: GameSession): boolean {
  const winner = winnerFor(session);
  if (!winner) return false;
  finishWithWinner(session, winner);
  return true;
}

function roleName(role: Role): string {
  const names: Record<Role, string> = {
    lord: "主公",
    loyalist: "忠臣",
    rebel: "反贼",
    renegade: "内奸",
  };
  return names[role];
}

function cardName(kind: CardKind): string {
  return getCardDefinition(kind).name;
}

function suitName(suit: CardSuit): string {
  const names: Record<CardSuit, string> = {
    spade: "黑桃",
    heart: "红桃",
    club: "梅花",
    diamond: "方块",
  };
  return names[suit];
}

function effectiveCardSuit(session: GameSession, owner: GamePlayer, card: Card): CardSuit {
  const resolution = resolveHongyanSuit({
    printedSuit: card.suit,
    cardOwnerId: owner.id,
    hongyan: {
      ownerId: owner.id,
      active: hasEffectiveSkill(session, owner, "hongyan"),
    },
  });
  if (!resolution.ok) throw new Error(resolution.detail);
  return resolution.value.effectiveSuit;
}

function isWushenLockedHeartHandCard(session: GameSession, owner: GamePlayer, card: Card): boolean {
  return session.virtualCardOrigins[card.id] === undefined &&
    hasEffectiveSkill(session, owner, "wushen") &&
    owner.hand.some((candidate) => candidate.id === card.id) &&
    effectiveCardSuit(session, owner, card) === "heart";
}

function godRuleCard(
  owner: GamePlayer,
  card: Card,
  zone: "hand" | "equipment" | "judgment" | "processing",
) {
  return {
    id: card.id,
    kind: card.kind,
    category: card.category,
    printedSuit: card.suit,
    rank: card.rank,
    ownerId: zone === "processing" ? null : owner.id,
    zone,
    equipmentSlot: getCardDefinition(card.kind).equipmentSlot ?? null,
    physical: true,
  } as const;
}

function godSkillContext(session: GameSession, player: GamePlayer, skillId: GeneralSkillId) {
  return {
    ownerId: player.id,
    ownerAlive: player.alive,
    skillEffective: hasEffectiveSkill(session, player, skillId),
  } as const;
}

function godPhaseContext(session: GameSession, player: GamePlayer, skillId: GeneralSkillId) {
  return {
    ...godSkillContext(session, player, skillId),
    currentPlayerId: session.currentPlayerId,
    phase: session.turn.phase,
  } as const;
}

function renMarkCount(session: GameSession, ownerId: PlayerId): number {
  return markCount(session.completeRules.lifecycle, {
    ownerId,
    markId: "ren",
    sourcePlayerId: ownerId,
    sourceSkillId: "renjie",
  });
}

function jilueContext(session: GameSession, owner: GamePlayer) {
  return {
    ...godSkillContext(session, owner, "jilue"),
    awakened: hasAwakened(session.completeRules.lifecycle, owner.id, "baiyin"),
    renMarks: renMarkCount(session, owner.id),
  } as const;
}

function spendJilueRen(session: GameSession, ownerId: PlayerId): void {
  spendMarks(session.completeRules.lifecycle, {
    ownerId,
    markId: "ren",
    amount: 1,
    sourcePlayerId: ownerId,
    sourceSkillId: "renjie",
  });
}

function rageMarkCount(session: GameSession, ownerId: PlayerId): number {
  return markCount(session.completeRules.lifecycle, {
    ownerId,
    markId: "rage",
    sourcePlayerId: ownerId,
    sourceSkillId: "kuangbao",
  });
}

function activeWuqianArmorInvalidTargetIds(session: GameSession, sourceId: PlayerId): PlayerId[] {
  return session.completeRules.lifecycle.effects
    .filter((effect) => effect.kind === "armor_invalid" && effect.sourceSkillId === "wuqian" &&
      effect.sourcePlayerId === sourceId && effect.payload.turnId === session.turn.number &&
      effect.payload.targetId === effect.ownerId && effect.expiry.type === "turn_end" &&
      effect.expiry.turnId === session.turn.number)
    .map((effect) => effect.ownerId);
}

function armorInvalidatedByWuqian(session: GameSession, targetId: PlayerId): boolean {
  return session.completeRules.lifecycle.effects.some((effect) =>
    effect.ownerId === targetId && effect.kind === "armor_invalid" && effect.sourceSkillId === "wuqian" &&
    effect.sourcePlayerId !== null && effect.payload.targetId === targetId &&
    effect.payload.turnId === session.turn.number && effect.expiry.type === "turn_end" &&
    effect.expiry.turnId === session.turn.number
  );
}

function fireRuleCard(
  session: GameSession,
  owner: GamePlayer,
  card: Card,
  zone: "hand" | "equipment" | "judgment",
) {
  return {
    id: card.id,
    ownerId: owner.id,
    zone,
    suit: effectiveCardSuit(session, owner, card),
    category: card.category,
    equipmentSlot: getCardDefinition(card.kind).equipmentSlot ?? null,
  } as const;
}

function firePlayContext(session: GameSession, player: GamePlayer, skillId: GeneralSkillId) {
  return {
    actorId: player.id,
    currentPlayerId: session.currentPlayerId,
    phase: session.turn.phase,
    actorAlive: player.alive,
    skillEffective: hasEffectiveSkill(session, player, skillId),
  } as const;
}

function forestSkillContext(session: GameSession, player: GamePlayer, skillId: GeneralSkillId) {
  return {
    ownerId: player.id,
    ownerAlive: player.alive,
    skillEffective: hasEffectiveSkill(session, player, skillId),
  } as const;
}

function forestPlayContext(session: GameSession, player: GamePlayer, skillId: GeneralSkillId) {
  return {
    ...forestSkillContext(session, player, skillId),
    currentPlayerId: session.currentPlayerId,
    phase: session.turn.phase,
  } as const;
}

function forestRuleCard(
  owner: GamePlayer,
  card: Card,
  zone: "hand" | "equipment" | "judgment",
) {
  return {
    id: card.id,
    kind: card.kind,
    category: card.category,
    printedSuit: card.suit,
    rank: card.rank,
    ownerId: owner.id,
    zone,
    equipmentSlot: getCardDefinition(card.kind).equipmentSlot ?? null,
    physical: true,
  } as const;
}

function mountainRuleCard(
  session: GameSession,
  owner: GamePlayer,
  card: Card,
  zone: MountainRuleCard["zone"],
): MountainRuleCard {
  return {
    id: card.id,
    kind: card.kind,
    ownerId: owner.id,
    zone,
    suit: effectiveCardSuit(session, owner, card),
    category: card.category,
    equipmentSlot: getCardDefinition(card.kind).equipmentSlot ?? null,
  } as const;
}

function isBlackCard(session: GameSession, owner: GamePlayer, card: Card): boolean {
  const suit = effectiveCardSuit(session, owner, card);
  return suit === "spade" || suit === "club";
}

function isRedCard(session: GameSession, owner: GamePlayer, card: Card): boolean {
  const suit = effectiveCardSuit(session, owner, card);
  return suit === "heart" || suit === "diamond";
}

function isWeimuProhibited(
  session: GameSession,
  source: GamePlayer,
  card: Card,
  target: GamePlayer,
  targetingMode: "direct_target" | "global_auto_target" | "delayed_trick_transfer",
): boolean {
  if (!hasEffectiveSkill(session, target, "weimu")) return false;
  const decision = evaluateWeimuTarget({
    context: forestSkillContext(session, target, "weimu"),
    candidateTargetId: target.id,
    cardCategory: card.category,
    effectiveSuit: effectiveCardSuit(session, source, card),
    targetingMode,
  });
  if (!decision.ok) throw new Error(decision.detail);
  return decision.value.prohibited;
}

function assertWeimuTarget(
  session: GameSession,
  source: GamePlayer,
  card: Card,
  target: GamePlayer,
  targetingMode: "direct_target" | "global_auto_target" | "delayed_trick_transfer" = "direct_target",
): void {
  if (isWeimuProhibited(session, source, card, target, targetingMode)) {
    ruleError("INVALID_TARGET", `${target.id} 的帷幕使其不能成为黑色锦囊牌的目标。`);
  }
}

function isMassAttackImmune(
  session: GameSession,
  player: GamePlayer,
  kind: "barbarian_invasion" | "arrow_barrage",
): boolean {
  return !armorInvalidatedByWuqian(session, player.id) && player.equipment.armor?.kind === "teng_jia" &&
    (kind === "barbarian_invasion" || kind === "arrow_barrage");
}

function isForestNanmanImmune(
  session: GameSession,
  player: GamePlayer,
  kind: "barbarian_invasion" | "arrow_barrage",
): boolean {
  const decisions = [
    evaluateHuoshouImmunity({
      targetId: player.id,
      targetAlive: player.alive,
      targetHasEffectiveSkill: hasEffectiveSkill(session, player, "huoshou"),
      effectiveCardKind: kind,
    }),
    evaluateJuxiangImmunity({
      targetId: player.id,
      targetAlive: player.alive,
      targetHasEffectiveSkill: hasEffectiveSkill(session, player, "juxiang"),
      effectiveCardKind: kind,
    }),
  ];
  for (const decision of decisions) {
    if (!decision.ok) throw new Error(decision.detail);
    if (decision.value.immune) return true;
  }
  return false;
}

function bindLiveHuoshouSource(session: GameSession, source: GamePlayer): PlayerId | null {
  const orderedOwners = livingPlayersInSeatOrderFrom(session, source)
    .filter((candidate) => rawLifecycleSkillIds(session, candidate).includes("huoshou"));
  const binding = bindHuoshouSource({
    originalCardUserId: source.id,
    huoshouOwners: orderedOwners.map((owner) => ({
      id: owner.id,
      alive: owner.alive,
      skillEffective: hasEffectiveSkill(session, owner, "huoshou"),
    })),
  });
  if (!binding.ok) throw new Error(binding.detail);
  return binding.value.boundHuoshouOwnerId;
}

function baguaResponseSource(
  session: GameSession,
  player: GamePlayer,
  pending: Extract<PendingResponse, { type: "slash" | "mass_attack" }>,
): "ba_gua_zhen" | "bazhen" | null {
  const armorEffectsIgnored = pending.type === "slash" && pending.armorIgnored === true;
  if (armorEffectsIgnored || armorInvalidatedByWuqian(session, player.id)) return null;
  if (player.equipment.armor?.kind === "ba_gua_zhen") return "ba_gua_zhen";
  const actualArmor = player.equipment.armor;
  const decision = evaluateBazhen({
    ownerId: player.id,
    ownerAlive: player.alive,
    skillEffective: hasEffectiveSkill(session, player, "bazhen"),
    actualArmor: actualArmor ? fireRuleCard(session, player, actualArmor, "equipment") : null,
    armorEffectsIgnored,
  });
  return decision.ok ? "bazhen" : null;
}

function victimOwnedZoneRefs(player: GamePlayer): Array<{ zone: ZoneRef; cardIds: CardId[] }> {
  const refs: Array<{ zone: ZoneRef; cardIds: CardId[] }> = [];
  if (player.hand.length > 0) refs.push({ zone: { kind: "hand", playerId: player.id }, cardIds: player.hand.map((card) => card.id) });
  for (const slot of ["weapon", "armor", "offensive_horse", "defensive_horse"] as const) {
    const card = player.equipment[slot];
    if (card) refs.push({ zone: { kind: "equipment", playerId: player.id, slot }, cardIds: [card.id] });
  }
  if (player.judgment.length > 0) refs.push({ zone: { kind: "judgment", playerId: player.id }, cardIds: player.judgment.map((card) => card.id) });
  for (const [pileId, cards] of Object.entries(player.extraPiles)) {
    if (cards.length > 0) refs.push({ zone: { kind: "extra", playerId: player.id, pileId }, cardIds: cards.map((card) => card.id) });
  }
  return refs;
}

function deathDrawRecords(session: GameSession, player: GamePlayer, count: number, frameId: number): readonly MoveRecord[] {
  const handCountBefore = player.hand.length;
  drawCards(session, player, count);
  const cards = player.hand.slice(handCountBefore).map(cloneCard);
  if (cards.length === 0) return [];
  const batchId = nextMoveBatchId(session);
  return [{
    batchId,
    cardIds: cards.map((card) => card.id),
    cards,
    from: { kind: "deck" },
    to: { kind: "hand", playerId: player.id },
    reason: "draw",
    visibility: "owner",
    actorId: player.id,
    sourceId: player.id,
    targetId: player.id,
    skillId: null,
    useId: null,
    frameId,
  }];
}

interface DeathResolutionOptions {
  readonly rewards: boolean;
  readonly logKind?: "normal" | "forfeit";
  readonly checkWinner?: boolean;
  readonly allowXingshang?: boolean;
  readonly allowWuhun?: boolean;
  readonly completion?: DeathResolutionCompletion;
}

const KNOWN_DYING_RESUME_TYPES = {
  finish_effect: true,
  skill: true,
  qiangxi: true,
  mass_attack: true,
  turn_start: true,
  damage_flow: true,
  chain_damage: true,
  slash_sequence: true,
  leiji: true,
  standard_damage: true,
  forest_end: true,
  qinyin: true,
  wumou: true,
  shenfen: true,
  yeyan: true,
  luanwu: true,
  guhuo: true,
} as const satisfies Record<DyingResume["type"], true>;

function knownDyingResumeType(value: string): value is DyingResume["type"] {
  return Object.prototype.hasOwnProperty.call(KNOWN_DYING_RESUME_TYPES, value);
}

function xingshangOwnerIds(session: GameSession, victimId: PlayerId): PlayerId[] {
  return standardJudgmentOrder(session)
    .filter((player) => player.id !== victimId && hasEffectiveSkill(session, player, "xingshang"))
    .map((player) => player.id);
}

function xingshangZones(victim: GamePlayer) {
  return {
    handCardIds: victim.hand.map((card) => card.id),
    equipmentCardIds: Object.values(victim.equipment).map((card) => card.id),
    judgmentCardIds: victim.judgment.map((card) => card.id),
    extraPileCardIds: Object.values(victim.extraPiles).flat().map((card) => card.id),
  };
}

function assertPendingXingshangDeath(
  session: GameSession,
  frame: DeathFrame,
  actor: GamePlayer,
  pending: PendingDeathResolution,
): void {
  const ownedIds = victimOwnedZoneRefs(getPlayer(session, frame.death.victimId)).flatMap((entry) => entry.cardIds).sort();
  const snapshottedIds = [...frame.ownedPhysicalCardIds].sort();
  const owners = xingshangOwnerIds(session, frame.death.victimId);
  const actorIndex = owners.indexOf(actor.id);
  const expectedRemaining = actorIndex < 0 ? [] : owners.slice(actorIndex + 1);
  const resumeType = pending.completion.type === "dying" || pending.completion.type === "direct"
    ? pending.completion.resume.type
    : null;
  const parent = session.completeRules.death.frames.at(-2) ?? null;
  const wuhunCompletionValid = pending.completion.type === "wuhun" &&
    pending.checkWinner === false && parent !== null && frame.parentFrameId === parent.frameId &&
    parent.suspendedByFrameId === frame.frameId && pending.completion.parent.frameId === parent.frameId &&
    pending.completion.parent.wuhunResolved === true;
  const ordinaryCompletionValid = resumeType !== null && knownDyingResumeType(resumeType) && pending.checkWinner === true;
  if (pending.frameId !== frame.frameId || pending.rewards !== true ||
      pending.logKind !== "normal" || (!ordinaryCompletionValid && !wuhunCompletionValid) ||
      actorIndex < 0 || new Set(pending.remainingOwnerIds).size !== pending.remainingOwnerIds.length ||
      pending.remainingOwnerIds.length !== expectedRemaining.length ||
      pending.remainingOwnerIds.some((ownerId, index) => ownerId !== expectedRemaining[index]) ||
      ownedIds.length !== snapshottedIds.length || ownedIds.some((cardId, index) => cardId !== snapshottedIds[index])) {
    throw new Error("行殇死亡续体被篡改或已过期。 ");
  }
  if (pending.completion.type === "dying") {
    const dying = topDyingFrame(session.completeRules.dying);
    if (!dying || dying.frameId !== pending.completion.frameId || dying.victimId !== frame.death.victimId ||
        dying.stage !== "death_confirmed") throw new Error("行殇濒死续体与 DyingStack 不一致。 ");
    if (pending.completion.resume.type === "damage_flow") {
      const damage = session.completeRules.damageFlow.frames.at(-1);
      const resume = pending.completion.resume;
      if (!damage || damage.frameId !== resume.frameId || damage.damageId !== resume.damageId ||
          damage.dying?.dyingId !== resume.dyingId || damage.damage.targetId !== dying.victimId) {
        throw new Error("行殇 DamageFlow 续体被篡改。 ");
      }
    }
  } else if (pending.completion.type === "direct" && pending.completion.resume.type === "damage_flow") {
    throw new Error("直接死亡不能携带 DamageFlow 濒死游标。 ");
  }
}

function completeDeathResolutionContinuation(
  session: GameSession,
  frame: DeathFrame,
  completion: DeathResolutionCompletion,
): boolean {
  if (completion.type === "none") return session.pendingResponse !== null;
  if (completion.type === "dying") {
    const dying = topDyingFrame(session.completeRules.dying);
    if (!dying || dying.frameId !== completion.frameId || dying.victimId !== frame.death.victimId || dying.stage !== "death_confirmed") {
      throw new Error("死亡结算的濒死续体与 DyingStack 不一致。 ");
    }
    return completeResolvedDying(session, dying, completion.resume, true);
  }
  if (completion.type === "wuhun") {
    return continueWuhunParentDeath(session, frame, completion.parent);
  }
  resumeAfterDying(session, completion.resume);
  return session.pendingResponse !== null;
}

function finishDeathResolution(
  session: GameSession,
  frame: DeathFrame,
  pending: PendingDeathResolution,
): boolean {
  const victim = getPlayer(session, frame.death.victimId);
  victim.hp = 0;
  victim.chained = false;
  addLog(session, "death", pending.logKind === "forfeit"
    ? `${victim.id} 离席并被判定出局，身份是${roleName(victim.role)}。`
    : `${victim.id} 阵亡，身份是${roleName(victim.role)}。`);

  const killer = frame.death.killerId === null ? null : getPlayer(session, frame.death.killerId);
  if (pending.rewards && killer?.alive && victim.role === "rebel") {
    const records = deathDrawRecords(session, killer, 3, frame.frameId);
    const bountyDrawn = records.reduce((sum, record) => sum + record.cardIds.length, 0);
    completeDeathRewardPunishment(frame, {
      eventId: allocateEventId(session),
      kind: "rebel_bounty",
      affectedPlayerId: killer.id,
      moveRecords: records,
    });
    addLog(session, "card", `${killer.id} 击杀反贼，摸了 ${bountyDrawn} 张牌。`);
  } else if (pending.rewards && killer?.role === "lord" && victim.role === "loyalist") {
    const penaltyRefs = victimOwnedZoneRefs(killer).filter((entry) => entry.zone.kind === "hand" || entry.zone.kind === "equipment");
    const lostLastHand = killer.hand.length > 0;
    const lostEquipmentCount = Object.keys(killer.equipment).length;
    const lostSilverLion = killer.equipment.armor?.kind === "bai_yin_shi_zi";
    let records: readonly MoveRecord[] = [];
    if (penaltyRefs.length > 0) {
      const zones = sessionZoneState(session);
      records = commitLiveMoveBatch(session, zones.state, {
        batchId: nextMoveBatchId(session),
        intents: penaltyRefs.map((entry) => ({
          cardIds: entry.cardIds,
          from: entry.zone,
          to: { kind: "discard" as const },
          reason: "death" as const,
          visibility: "public" as const,
          actorId: killer.id,
          sourceId: killer.id,
          targetId: killer.id,
          skillId: null,
          useId: null,
          frameId: frame.frameId,
        })),
      });
      syncSessionZones(session, zones);
      if (lostSilverLion && !armorInvalidatedByWuqian(session, killer.id) && killer.alive && killer.hp < killer.maxHp) {
        recoverLivePlayer(session, killer, 1, killer.id, "bai_yin_shi_zi");
        addLog(session, "card", `${killer.id} 失去白银狮子，回复了 1 点体力。`);
      }
      if (lostLastHand) enqueueAfterMoveSkill(session, killer, "lianying");
      for (let index = 0; index < lostEquipmentCount; index += 1) {
        enqueueAfterMoveSkill(session, killer, "xiaoji");
      }
    }
    completeDeathRewardPunishment(frame, {
      eventId: allocateEventId(session),
      kind: "lord_loyalist_penalty",
      affectedPlayerId: killer.id,
      moveRecords: records,
    });
    addLog(session, "card", `${killer.id} 误杀忠臣，弃置了手牌和装备区内的全部 ${records.reduce((sum, record) => sum + record.cardIds.length, 0)} 张牌。`);
  } else {
    completeDeathRewardPunishment(frame, { eventId: allocateEventId(session), kind: "none" });
  }
  completeDeathAfter(frame, { eventId: allocateEventId(session) });
  popCompletedDeathFrame(session.completeRules.death, frame.frameId);
  if (pending.checkWinner) finishIfWon(session);
  return completeDeathResolutionContinuation(session, frame, pending.completion);
}

function settleDeathCardDisposition(
  session: GameSession,
  frame: DeathFrame,
  pending: PendingDeathResolution,
  xingshangRecipientId: PlayerId | null,
): boolean {
  const victim = getPlayer(session, frame.death.victimId);
  const ownedRefs = victimOwnedZoneRefs(victim);
  let dispositionRecords: readonly MoveRecord[] = [];
  if (xingshangRecipientId !== null) {
    const owner = getLivingPlayer(session, xingshangRecipientId);
    const plan = planXingshang({
      context: { ownerId: owner.id, ownerAlive: owner.alive, skillEffective: hasEffectiveSkill(session, owner, "xingshang") },
      deadPlayerId: victim.id,
      decision: "claim",
      privateCardsRevealedBeforeDecision: false,
      deadZones: xingshangZones(victim),
    });
    if (!plan.ok) ruleError("INVALID_SKILL", plan.detail);
  }
  if (ownedRefs.length > 0) {
    const zones = sessionZoneState(session);
    dispositionRecords = commitLiveMoveBatch(session, zones.state, {
      batchId: nextMoveBatchId(session),
      intents: ownedRefs.map((entry) => {
        const claimed = xingshangRecipientId !== null && entry.zone.kind !== "extra";
        return {
          cardIds: entry.cardIds,
          from: entry.zone,
          to: claimed ? { kind: "hand" as const, playerId: xingshangRecipientId } : { kind: "discard" as const },
          reason: claimed ? "skill_effect" as const : "death" as const,
          visibility: claimed && entry.zone.kind === "hand" ? "source_and_target" as const : "public" as const,
          actorId: claimed ? xingshangRecipientId : victim.id,
          sourceId: victim.id,
          targetId: claimed ? xingshangRecipientId : victim.id,
          skillId: claimed ? "xingshang" : null,
          useId: null,
          frameId: frame.frameId,
        };
      }),
    });
    syncSessionZones(session, zones);
  }
  completeDeathCardDisposition(frame, {
    eventId: allocateEventId(session),
    xingshangRecipientId,
    moveRecords: dispositionRecords,
  });
  if (xingshangRecipientId !== null) {
    addLog(session, "card", `${xingshangRecipientId} 发动行殇，获得了 ${dispositionRecords.filter((record) => record.to.kind === "hand").reduce((sum, record) => sum + record.cardIds.length, 0)} 张死亡角色的牌。`);
  }
  session.pendingResponse = null;
  return finishDeathResolution(session, frame, pending);
}

function continueDeathCardDisposition(
  session: GameSession,
  frame: DeathFrame,
  pending: PendingDeathResolution,
): boolean {
  if (frame.stage !== "card_disposition" || frame.frameId !== pending.frameId || frame.suspendedByFrameId !== null) {
    throw new Error("死亡清理续体与 DeathStack 不一致。 ");
  }
  const victim = getPlayer(session, frame.death.victimId);
  if (victim.hand.length === 0 && Object.keys(victim.equipment).length === 0 && victim.judgment.length === 0) {
    return settleDeathCardDisposition(session, frame, { ...pending, remainingOwnerIds: [] }, null);
  }
  const [ownerId, ...remainingOwnerIds] = pending.remainingOwnerIds;
  if (!ownerId) return settleDeathCardDisposition(session, frame, pending, null);
  const owner = getPlayer(session, ownerId);
  if (!owner.alive || !hasEffectiveSkill(session, owner, "xingshang")) {
    return continueDeathCardDisposition(session, frame, { ...pending, remainingOwnerIds });
  }
  const decision = planXingshang({
    context: { ownerId: owner.id, ownerAlive: owner.alive, skillEffective: true },
    deadPlayerId: victim.id,
    decision: "decline",
    privateCardsRevealedBeforeDecision: false,
    deadZones: xingshangZones(victim),
  });
  if (!decision.ok) throw new Error(decision.detail);
  const eventId = allocateEventId(session);
  session.turn.phase = "respond";
  session.pendingResponse = {
    type: "standard_skill",
    targetId: owner.id,
    promptId: standardPromptId(eventId, "xingshang", owner.id, `death-${frame.frameId}`),
    eventId,
    skillId: "xingshang",
    stage: "xingshang_claim",
    sourceId: victim.id,
    deathResolution: {
      ...pending,
      remainingOwnerIds,
      completion: cloneDeathResolutionCompletion(pending.completion),
    },
  };
  addLog(session, "death", `${owner.id} 可以在死亡奖惩前发动行殇。`);
  return true;
}

function completeRemainingDeathTriggers(session: GameSession, frame: DeathFrame, wuhunResolved: boolean): void {
  const victim = getPlayer(session, frame.death.victimId);
  const eventId = allocateEventId(session);
  const consumedTriggerIds: string[] = wuhunResolved && hasEffectiveSkill(session, victim, "wuhun")
    ? [`wuhun:${frame.frameId}:${victim.id}`]
    : [];
  if (hasEffectiveSkill(session, victim, "duanchang")) {
    const killer = frame.death.killerId === null ? null : getPlayer(session, frame.death.killerId);
    const currentSkillIds = killer?.alive ? getEffectiveGeneralSkillIds(session, killer.id) : [];
    const plan = planDuanchang({
      ownerId: victim.id,
      ownerDead: !victim.alive,
      skillWasEffectiveAtDeath: true,
      killerId: killer?.id ?? null,
      killerAlive: killer?.alive ?? false,
      killerCurrentGeneralSkillIds: currentSkillIds,
    });
    if (plan.ok) {
      if (plan.value.loseSkillIds.length > 0) {
        recordSkillLoss(session.completeRules.lifecycle, {
          ownerId: plan.value.killerId,
          skillIds: plan.value.loseSkillIds,
          sourcePlayerId: victim.id,
          sourceSkillId: "duanchang",
          lostAtEventId: eventId,
        });
      }
      consumedTriggerIds.push(`duanchang:${frame.frameId}:${victim.id}:${plan.value.killerId}`);
      addLog(session, "death", `${victim.id} 的断肠生效，${plan.value.killerId} 永久失去了当前武将技能。`);
    } else if (plan.code !== "no_candidate") {
      throw new Error(plan.detail);
    }
  }
  completeDeathTriggers(frame, { eventId, consumedTriggerIds });
  expireQixingWeatherFromSource(session, victim.id, "owner_death");
  expireLifecycleState(session.completeRules.lifecycle, { type: "owner_death", ownerId: victim.id });
}

function wuhunMarkedPlayers(session: GameSession, ownerId: PlayerId) {
  return livingOpponentsInSeatOrder(session, ownerId).map((player) => ({
    id: player.id,
    alive: player.alive,
    nightmareMarks: markCount(session.completeRules.lifecycle, {
      ownerId: player.id,
      markId: "nightmare",
      sourcePlayerId: ownerId,
      sourceSkillId: "wuhun",
    }),
  }));
}

function beginWuhunJudgment(
  session: GameSession,
  frame: DeathFrame,
  pending: PendingDeathResolution,
  targetId: PlayerId,
): void {
  const victim = getPlayer(session, frame.death.victimId);
  const plan = planWuhunDeath({
    ownerId: victim.id,
    deathConfirmed: !victim.alive,
    gameAlreadyFinished: session.status === "finished",
    otherPlayers: wuhunMarkedPlayers(session, victim.id),
    chosenTargetId: targetId,
  });
  if (!plan.ok || plan.value.judgmentTargetId !== targetId) {
    throw new Error(plan.ok ? "武魂判定目标丢失。" : plan.detail);
  }
  const target = getLivingPlayer(session, targetId);
  beginStandardJudgment(
    session,
    target,
    { type: "skill", id: "wuhun" },
    {},
    {
      type: "wuhun",
      ownerId: victim.id,
      deathResolution: { ...clonePendingDeathResolution(pending), wuhunResolved: true },
    },
  );
}

function continueDeathTriggers(
  session: GameSession,
  frame: DeathFrame,
  pending: PendingDeathResolution,
): boolean {
  if (frame.stage !== "death_triggers" || frame.frameId !== pending.frameId || frame.suspendedByFrameId !== null) {
    throw new Error("死亡触发续体与 DeathStack 不一致。");
  }
  const victim = getPlayer(session, frame.death.victimId);
  if (!pending.wuhunResolved && hasEffectiveSkill(session, victim, "wuhun")) {
    const marked = wuhunMarkedPlayers(session, victim.id);
    const maximum = marked.reduce((value, player) => Math.max(value, player.nightmareMarks), 0);
    const eligibleTargetIds = maximum > 0
      ? marked.filter((player) => player.nightmareMarks === maximum).map((player) => player.id)
      : [];
    if (eligibleTargetIds.length === 0) {
      const plan = planWuhunDeath({
        ownerId: victim.id,
        deathConfirmed: !victim.alive,
        gameAlreadyFinished: session.status === "finished",
        otherPlayers: marked,
        chosenTargetId: null,
      });
      if (!plan.ok) throw new Error(plan.detail);
      pending = { ...pending, wuhunResolved: true };
    } else if (eligibleTargetIds.length === 1) {
      beginWuhunJudgment(session, frame, pending, eligibleTargetIds[0]!);
      return session.pendingResponse !== null;
    } else {
      const eventId = allocateEventId(session);
      session.turn.phase = "respond";
      session.pendingResponse = {
        type: "standard_skill",
        targetId: victim.id,
        promptId: standardPromptId(eventId, "wuhun", victim.id, `target-${frame.frameId}`),
        eventId,
        skillId: "wuhun",
        stage: "wuhun_target",
        sourceId: victim.id,
        targetIds: eligibleTargetIds,
        deathResolution: clonePendingDeathResolution(pending),
      };
      addLog(session, "death", `${victim.id} 的武魂须选择一名梦魇标记最多的存活角色进行判定。`);
      return true;
    }
  }
  completeRemainingDeathTriggers(session, frame, pending.wuhunResolved === true);
  return continueDeathCardDisposition(session, frame, pending);
}

function continueWuhunParentDeath(
  session: GameSession,
  completedFrame: DeathFrame,
  pending: PendingDeathResolution,
): boolean {
  const parent = topDeathFrame(session.completeRules.death);
  if (!parent || parent.frameId !== pending.frameId || parent.stage !== "death_triggers" ||
      parent.suspendedByFrameId !== null || pending.wuhunResolved !== true ||
      completedFrame.death.killerId !== null || completedFrame.death.reason.type !== "hp_loss" ||
      completedFrame.death.reason.sourceId !== null) {
    throw new Error("武魂嵌套死亡续体与 DeathStack 不一致。");
  }
  const winnerAlreadyEstablished = winnerFor(session) !== null;
  return continueDeathTriggers(session, parent, winnerAlreadyEstablished
    ? { ...pending, rewards: false, remainingOwnerIds: [] }
    : pending);
}

/** Starts the persisted, optionally pausable DeathStack pipeline. */
function beginDeathResolution(
  session: GameSession,
  death: ReturnType<typeof confirmDeath>,
  options: DeathResolutionOptions = { rewards: true },
): boolean {
  const victim = getPlayer(session, death.victimId);
  const attributedDeath = death.killerId === death.victimId ? { ...death, killerId: null } : death;
  for (const card of victim.judgment) restorePhysicalCard(session, restoreVirtualOrigin(session, card));
  const ownedRefs = victimOwnedZoneRefs(victim);
  const frame = createDeathFrame({
    frameId: attributedDeath.eventId,
    death: attributedDeath,
    ownedPhysicalCardIds: ownedRefs.flatMap((entry) => entry.cardIds),
  });
  pushDeathFrame(session.completeRules.death, frame);
  revealDeathIdentity(frame, { eventId: allocateEventId(session), role: victim.role });
  const pending: PendingDeathResolution = {
    frameId: frame.frameId,
    rewards: options.rewards,
    checkWinner: options.checkWinner !== false,
    logKind: options.logKind ?? "normal",
    remainingOwnerIds: options.allowXingshang === false ? [] : xingshangOwnerIds(session, victim.id),
    completion: cloneDeathResolutionCompletion(options.completion ?? { type: "none" }),
    wuhunResolved: options.allowWuhun === false,
  };
  const killer = attributedDeath.killerId === null ? null : getPlayer(session, attributedDeath.killerId);
  if (killer?.alive && hasEffectiveSkill(session, killer, "lianpo")) {
    const armed = recordLianpoKill({
      context: { ownerId: killer.id, ownerAlive: killer.alive, skillEffective: true },
      killerId: killer.id,
      victimId: victim.id,
      insideAPlayersTurn: session.status === "playing",
      activeTurnId: session.status === "playing" ? `turn-${session.turn.number}` : null,
    });
    if (!armed.ok) throw new Error(armed.detail);
    if (armed.value.qualifies && !(session.turn.lianpoArmedOwnerIds ?? []).includes(killer.id)) {
      session.turn.lianpoArmedOwnerIds = [...(session.turn.lianpoArmedOwnerIds ?? []), killer.id];
    }
  }
  return continueDeathTriggers(session, frame, pending);
}

/** Direct zero-max-HP deaths use the same pausable DeathStack path as dying deaths. */
export function beginDirectDeath(session: GameSession, victimId: PlayerId, resume: DyingResume): boolean {
  const victim = getLivingPlayer(session, victimId);
  const eventId = allocateEventId(session);
  victim.alive = false;
  victim.hp = 0;
  return beginDeathResolution(session, {
    type: "death",
    eventId,
    victimId: victim.id,
    killerId: null,
    reason: { type: "hp_loss", eventId, sourceId: null },
  }, { rewards: true, completion: { type: "direct", resume: cloneDyingResume(resume) } });
}

function beginDying(
  session: GameSession,
  target: GamePlayer,
  damageSourceId: PlayerId | null,
  resume: DyingResume,
  loss?: { readonly hpBefore: number; readonly amount: number },
): boolean {
  if (target.hp > 0) return false;
  const responders = livingPlayersInSeatOrderFrom(session, target).map((player) => player.id);
  if (responders.length === 0) throw new Error("濒死结算没有可响应玩家。");
  const damageCursor = resume.type === "damage_flow" ? resume : null;
  const frameId = damageCursor?.dyingId ?? allocateEventId(session);
  const hasNiepan = hasEffectiveSkill(session, target, "niepan") &&
    !session.completeRules.lifecycle.limitedUses.some((entry) => entry.ownerId === target.id && entry.skillId === "niepan");
  const frame = createDyingFrame(lifePlayerSnapshot(session), {
    frameId,
    victimId: target.id,
    reason: {
      type: damageCursor ? "damage" : "hp_loss",
      eventId: damageCursor?.damageId ?? frameId,
      sourceId: damageCursor ? damageSourceId : null,
    },
    responderOrder: responders,
    entrySaveSkillIds: hasEffectiveSkill(session, target, "buqu") ? ["buqu"] : [],
    ownerResponseSaveSkillIds: hasNiepan ? ["niepan"] : [],
  });
  pushDyingFrame(session.completeRules.dying, frame);
  addLog(session, "damage", `${target.id} 进入濒死状态，需要回复至至少 1 点体力。`);

  if (frame.stage === "entry_save") {
    const hpBefore = loss?.hpBefore ?? (damageCursor
      ? session.completeRules.damageFlow.frames.at(-1)?.damage.hpBefore
      : undefined);
    const amount = loss?.amount ?? (damageCursor
      ? session.completeRules.damageFlow.frames.at(-1)?.damage.amount
      : undefined);
    if (!Number.isSafeInteger(hpBefore) || !Number.isSafeInteger(amount) || (amount ?? 0) <= 0) {
      throw new Error("不屈缺少逐点扣减记录。");
    }
    const plan = planBuquWounds({ hpBefore: hpBefore!, lossAmount: amount! });
    if (!plan.ok || plan.value.woundCount <= 0) throw new Error(plan.ok ? "不屈没有需要亮出的伤牌。" : plan.detail);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "skill_choice",
      targetId: target.id,
      skillId: "buqu",
      promptId: `dying:${frame.frameId}:buqu-entry`,
      resume: {
        type: "dying",
        frameId: frame.frameId,
        resume: cloneDyingResume(resume),
        buquLoss: { hpBefore: hpBefore!, amount: amount! },
      },
    };
    addLog(session, "damage", `${target.id} 可以发动不屈，亮出本次扣减对应的伤牌。`);
    return true;
  }
  offerCurrentDyingResponse(session, frame, resume);
  return true;
}

function loseHp(session: GameSession, target: GamePlayer, amount: number, reason: string, resume: DyingResume): boolean {
  if (!Number.isSafeInteger(amount) || amount < 1) throw new Error("失去体力值必须为正整数。");
  const hpBefore = target.hp;
  target.hp -= amount;
  addLog(session, "damage", `${target.id} ${reason}，失去 ${amount} 点体力。`);
  return beginDying(session, target, null, resume, { hpBefore, amount });
}

function recoverLivePlayer(
  session: GameSession,
  target: GamePlayer,
  amount: number,
  sourceId: PlayerId | null,
  reason: string,
): number {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("回复体力值必须为正整数。");
  if (!target.alive || target.hp >= target.maxHp) return 0;
  const wounds = target.extraPiles.buqu ?? [];
  if (target.hp <= 0 && wounds.length > 0) {
    session.afterMove.queuedRecoveries.push({
      eventId: allocateEventId(session),
      targetId: target.id,
      sourceId,
      hpBefore: target.hp,
      requestedAmount: amount,
      remainingAmount: amount,
      reason,
    });
    return 0;
  }
  const hpBefore = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + amount);
  return target.hp - hpBefore;
}

function natureName(nature: DamageNature): string {
  if (nature === "fire") return "火焰";
  if (nature === "thunder") return "雷电";
  return "";
}

function lifePlayerSnapshot(session: GameSession): LifePlayerState[] {
  return session.players.map((player) => ({
    id: player.id,
    hp: player.hp,
    maxHp: player.maxHp,
    alive: player.alive,
  }));
}

function closeEmptyDamageFlowWindow(
  flow: DamageFlowState,
  frameId: number,
  kind: DamageFlowWindowKind,
  players: readonly LifePlayerState[],
): DamageFlowState {
  const opened = openDamageFlowWindow(flow, {
    frameId,
    expectedRevision: flow.revision,
    kind,
    opportunities: [],
    players,
  });
  const window = opened.frames[opened.frames.length - 1]?.window;
  if (!window) throw new Error(`Damage flow ${frameId} did not open ${kind}`);
  return closeDamageFlowWindow(opened, {
    frameId,
    windowId: window.windowId,
    expectedRevision: opened.revision,
  });
}

function postDamageWindowKind(stage: string): DamageFlowWindowKind {
  switch (stage) {
    case "source_after_once":
    case "source_after_per_point":
    case "target_after_once":
    case "target_after_per_point":
    case "settlement_end":
      return stage;
    default:
      throw new Error(`Damage flow has no post-damage window for ${stage}`);
  }
}

function commitLifePlayerSnapshot(
  session: GameSession,
  players: readonly LifePlayerState[],
  damageId: number,
): void {
  const lifeById = new Map(players.map((player) => [player.id, player] as const));
  for (const player of session.players) {
    const resolved = lifeById.get(player.id);
    if (!resolved) throw new Error(`Damage flow ${damageId} lost player ${player.id}`);
    player.hp = resolved.hp;
    player.alive = resolved.alive;
  }
}

function addLivePermanentMark(
  session: GameSession,
  ownerId: PlayerId,
  markId: "nightmare" | "rage" | "ren",
  sourcePlayerId: PlayerId,
  sourceSkillId: "wuhun" | "kuangbao" | "renjie",
  amount: number,
): void {
  if (amount <= 0) return;
  addMark(session.completeRules.lifecycle, {
    markId,
    ownerId,
    sourcePlayerId,
    sourceSkillId,
    amount,
    visibility: "public",
    expiry: { type: "permanent" },
  });
}

function applyWuhunMarksAfterLifeDeduction(session: GameSession, frame: DamageFlowFrame): void {
  const target = getPlayer(session, frame.damage.targetId);
  if (!hasEffectiveSkill(session, target, "wuhun")) return;
  const plan = planWuhunDamageMarks({
    context: { ownerId: target.id, ownerAlive: target.alive, skillEffective: true },
    sourceId: frame.damage.sourceId,
    damageAmount: frame.damage.amount,
  });
  if (!plan.ok) throw new Error(plan.detail);
  if (plan.value.sourceId !== null && plan.value.nightmareMarkDelta > 0) {
    addLivePermanentMark(
      session,
      plan.value.sourceId,
      "nightmare",
      target.id,
      "wuhun",
      plan.value.nightmareMarkDelta,
    );
    addLog(session, "damage", `${plan.value.sourceId} 因 ${target.id} 的武魂获得了 ${plan.value.nightmareMarkDelta} 枚梦魇标记。`);
  }
}

/** Opens one live damage frame; the driver owns every timing from causing onward. */
function startLiveDamageFlow(
  session: GameSession,
  target: GamePlayer,
  attacker: GamePlayer | null,
  amount: number,
  nature: DamageNature,
  reason: string,
  damageCardIds: readonly CardId[],
  callerContinuation: DamageFlowCallerContinuation | null,
  expectedParentFrameId: number | null = null,
): void {
  const damageId = session.completeRules.nextDamageId;
  if (damageId >= Number.MAX_SAFE_INTEGER) throw new Error("Damage ID allocator is exhausted");
  const frameId = damageId;
  const damage = createDamageInstance({
    damageId,
    frameId,
    sourceId: attacker?.id ?? null,
    targetId: target.id,
    physicalCardIds: [...new Set(damageCardIds)],
    nature,
    reason: reason === "受到铁索连环传导"
      ? { type: "chain", id: reason }
      : {
          type: damageCardIds.length > 0 ? "card" : "rule",
          id: damageCardIds[0] ?? reason,
        },
    amount,
  });
  const flow = pushDamageFlowFrame(session.completeRules.damageFlow, {
    expectedParentFrameId,
    expectedRevision: session.completeRules.damageFlow.revision,
    damage,
    callerContinuation: expectedParentFrameId === null ? callerContinuation : null,
  }).state;

  session.completeRules.damageFlow = flow;
  session.completeRules.nextDamageId = damageId + 1;
}

function damageOpportunityPoint(frame: DamageFlowFrame): number | null {
  if (frame.damage.stage === "source_after_per_point") return frame.damage.triggerProgress.sourcePointCursor + 1;
  if (frame.damage.stage === "target_after_per_point") return frame.damage.triggerProgress.targetPointCursor + 1;
  return null;
}

function kuangguCaptureOpportunityId(frame: DamageFlowFrame): string | null {
  return frame.damage.sourceId === null
    ? null
    : `${frame.damageId}:receiving_modifier:kuanggu:${frame.damage.sourceId}:0`;
}

function capturedKuangguDistance(session: GameSession, frame: DamageFlowFrame): number | null {
  const opportunityId = kuangguCaptureOpportunityId(frame);
  if (opportunityId === null) return null;
  const action = session.completeRules.damageFlow.consumedActions.find((candidate) =>
    candidate.frameId === frame.frameId
    && candidate.damageId === frame.damageId
    && candidate.opportunityId === opportunityId
    && candidate.outcome === "resolve");
  const prefix = `kuanggu:${frame.damageId}:distance:`;
  if (!action?.resolutionRef?.startsWith(prefix)) return null;
  const encoded = action.resolutionRef.slice(prefix.length);
  const distance = Number(encoded);
  return Number.isSafeInteger(distance) && distance >= 0 && String(distance) === encoded ? distance : null;
}

function currentKuangguRecoveryStep(session: GameSession, frame: DamageFlowFrame) {
  const source = frame.damage.sourceId === null ? null : getPlayer(session, frame.damage.sourceId);
  const pointIndex = damageOpportunityPoint(frame);
  const distanceAtApplication = capturedKuangguDistance(session, frame);
  if (!source || pointIndex === null || distanceAtApplication === null) return null;
  const plan = planKuangguRecovery({
    sourceId: source.id,
    targetId: frame.damage.targetId,
    points: [{
      pointIndex: 1,
      distanceAtApplication,
      sourceAliveAfterSettlement: source.alive,
      sourceHpAfterSettlement: source.hp,
      sourceMaxHpAfterSettlement: source.maxHp,
    }],
  });
  if (!plan.ok) throw new Error(plan.detail);
  const step = plan.value.steps[0];
  return step ? { ...step, pointIndex } : null;
}

function slashResumeFromContinuation(resume: DyingResume): Extract<DyingResume, { type: "slash_sequence" }> | null {
  if (resume.type === "slash_sequence") return resume;
  if (resume.type === "chain_damage") return slashResumeFromContinuation(resume.finalResume);
  return null;
}

function slashContinuationForDamage(frame: DamageFlowFrame): Extract<DyingResume, { type: "slash_sequence" }> | null {
  if (frame.callerContinuation === null) return null;
  try {
    return slashResumeFromContinuation(decodeGameDamageContinuation(frame.callerContinuation));
  } catch {
    return null;
  }
}

function damageFlowArmorEffective(session: GameSession, frame: DamageFlowFrame, target: GamePlayer): boolean {
  if (armorInvalidatedByWuqian(session, target.id)) return false;
  const slash = slashContinuationForDamage(frame);
  return !(slash?.pending.targetId === target.id && slash.pending.armorIgnored === true);
}

function previewDamageAfterWeatherAndArmor(
  session: GameSession,
  target: GamePlayer,
  amount: number,
  nature: DamageNature,
  ignoreArmor: boolean,
): number {
  const weather = qixingWeatherDamagePlan(session, target, amount, nature);
  if (weather.prevented) return 0;
  const armorEffective = !ignoreArmor && !armorInvalidatedByWuqian(session, target.id);
  let actualAmount = amount;
  if (armorEffective && nature === "fire" && target.equipment.armor?.kind === "teng_jia") actualAmount += 1;
  actualAmount += weather.kuangfengBonus;
  if (armorEffective && actualAmount > 1 && target.equipment.armor?.kind === "bai_yin_shi_zi") actualAmount = 1;
  return actualAmount;
}

function baonueOwnerForDamage(session: GameSession, source: GamePlayer, damageAmount: number): GamePlayer | null {
  return standardJudgmentOrder(session).find((candidate) => {
    if (!candidate.alive || candidate.id === source.id || !hasEffectiveSkill(session, candidate, "baonue")) return false;
    const decision = evaluateBaonueTrigger({
      context: { ownerId: candidate.id, ownerAlive: candidate.alive, skillEffective: true },
      damageSourceId: source.id,
      damageSourceAlive: source.alive,
      damageSourceFaction: factionOf(session, source) ?? "god",
      damageEventAmount: damageAmount,
      damageSourceInvoked: true,
    });
    if (!decision.ok) throw new Error(decision.detail);
    return decision.value.eligible;
  }) ?? null;
}

function liveDamageOpportunityEligible(
  session: GameSession,
  frame: DamageFlowFrame,
  skillId: string,
  ownerId?: PlayerId,
): boolean {
  const target = getPlayer(session, frame.damage.targetId);
  const source = frame.damage.sourceId === null ? null : getPlayer(session, frame.damage.sourceId);
  if (skillId === "beige") {
    const owner = ownerId ? getPlayer(session, ownerId) : null;
    return !!owner?.alive && target.alive && hasEffectiveSkill(session, owner, "beige") &&
      ownedCards(owner).length > 0 && slashContinuationForDamage(frame) !== null;
  }
  if (skillId === "xinsheng") {
    return target.alive && hasEffectiveSkill(session, target, "xinsheng") &&
      damageOpportunityPoint(frame) !== null && huashenFormPool(session).length > 0;
  }
  if (skillId === "qi_lin_gong") {
    const slash = slashContinuationForDamage(frame);
    return !!slash && !!source?.alive && target.alive &&
      source.id === slash.pending.attackerId && target.id === slash.pending.targetId &&
      source.equipment.weapon?.kind === "qi_lin_gong" &&
      (target.equipment.offensive_horse !== undefined || target.equipment.defensive_horse !== undefined);
  }
  if (skillId === "tianxiang") {
    return target.alive
      && hasEffectiveSkill(session, target, "tianxiang")
      && tianxiangCostCardIds(session, frame, target).length > 0
      && tianxiangTargetIds(session, frame, target).length > 0;
  }
  if (skillId === "dawu" || skillId === "kuangfeng") {
    if (!target.alive || frame.step !== "receiving") return false;
    const weather = qixingWeatherDamagePlan(session, target, frame.damage.amount, frame.damage.nature);
    const effects = qixingWeatherEffects(session, target.id, skillId);
    return effects.some((effect) => effect.sourcePlayerId === ownerId) &&
      (skillId === "dawu" ? weather.prevented : weather.kuangfengBonus === 1);
  }
  if (skillId === "teng_jia" || skillId === "bai_yin_shi_zi") {
    return target.alive && frame.step === "receiving" && ownerId === target.id &&
      damageFlowArmorEffective(session, frame, target) && target.equipment.armor?.kind === skillId &&
      (skillId === "teng_jia" ? frame.damage.nature === "fire" : frame.damage.amount > 1);
  }
  if (skillId === "kuanggu") {
    if (!source?.alive || !hasEffectiveSkill(session, source, "kuanggu")) return false;
    if (frame.step === "receiving") return target.alive;
    return currentKuangguRecoveryStep(session, frame)?.triggered === true;
  }
  if (skillId === "lieren") {
    if (!source?.alive || !hasEffectiveSkill(session, source, "lieren")) return false;
    const decision = evaluateLierenTrigger({
      context: { ownerId: source.id, ownerAlive: source.alive, skillEffective: true },
      damageTargetId: target.id,
      damageTargetAlive: target.alive,
      damageEventAmount: frame.damage.amount,
      causedBySlashUseOrItsChainDamage: slashContinuationForDamage(frame) !== null,
      ownerHandCountAfterDamage: source.hand.length,
      targetHandCountAfterDamage: target.hand.length,
    });
    if (!decision.ok) throw new Error(decision.detail);
    return decision.value.eligible;
  }
  if (skillId === "baonue") return !!source?.alive && baonueOwnerForDamage(session, source, frame.damage.amount) !== null;
  if (skillId === "fangzhu") {
    return target.alive && hasEffectiveSkill(session, target, "fangzhu") &&
      session.players.some((candidate) => candidate.alive && candidate.id !== target.id);
  }
  if (skillId === "jilue") {
    const context = jilueContext(session, target);
    return target.alive && ownerId === target.id && !hasEffectiveSkill(session, target, "fangzhu") &&
      context.skillEffective && context.awakened && context.renMarks > 0 &&
      session.players.some((candidate) => candidate.alive && candidate.id !== target.id);
  }
  if (skillId === "kuangbao") {
    const owner = ownerId ? getPlayer(session, ownerId) : null;
    return !!owner?.alive && hasEffectiveSkill(session, owner, "kuangbao") &&
      (owner.id === frame.damage.sourceId || owner.id === frame.damage.targetId) && damageOpportunityPoint(frame) !== null;
  }
  if (skillId === "renjie") {
    return target.alive && hasEffectiveSkill(session, target, "renjie") && damageOpportunityPoint(frame) !== null;
  }
  if (skillId === "guixin") {
    return target.alive && hasEffectiveSkill(session, target, "guixin") && damageOpportunityPoint(frame) !== null &&
      livingOpponentsInSeatOrder(session, target.id).some((player) =>
        player.hand.length + Object.keys(player.equipment).length + player.judgment.length > 0);
  }
  if (!target.alive || !hasEffectiveSkill(session, target, skillId as GeneralSkillId)) return false;
  if (skillId === "jianxiong") {
    return frame.damage.physicalCardIds.some((cardId) => session.resolvingCards.some((card) => card.id === cardId));
  }
  if (skillId === "yiji") return session.deck.length + session.discardPile.length > 0;
  if (skillId === "jieming") return session.players.some((player) => player.alive);
  if (skillId === "fankui") {
    return !!source?.alive && source.id !== target.id && (source.hand.length > 0 || Object.keys(source.equipment).length > 0);
  }
  if (skillId === "ganglie") return !!source?.alive && source.id !== target.id;
  return false;
}

function damageOpportunitiesForCurrentWindow(
  session: GameSession,
  frame: DamageFlowFrame,
): DamageOpportunityRef[] {
  const stage = frame.damage.stage;
  const pointIndex = damageOpportunityPoint(frame);
  const cadence = stage === "source_after_per_point" || stage === "target_after_per_point"
    ? "per_point" as const
    : stage === "settlement_end"
      ? "settlement" as const
      : "once" as const;
  const refs: DamageOpportunityRef[] = [];
  const add = (ownerId: PlayerId, skillId: string, relation: "source" | "target" | "global"): void => {
    if (!liveDamageOpportunityEligible(session, frame, skillId, ownerId)) return;
    refs.push({
      opportunityId: `${frame.damageId}:${stage}:${skillId}:${ownerId}:${pointIndex ?? 0}`,
      ownerId,
      skillId,
      relation,
      cadence,
      pointIndex,
    });
  };
  if (stage === "source_after_once" && frame.damage.sourceId !== null) {
    add(frame.damage.sourceId, "qi_lin_gong", "source");
    add(frame.damage.sourceId, "lieren", "source");
    add(frame.damage.sourceId, "baonue", "source");
  } else if (stage === "source_after_per_point" && frame.damage.sourceId !== null) {
    add(frame.damage.sourceId, "kuangbao", "source");
    add(frame.damage.sourceId, "kuanggu", "source");
  } else if (stage === "target_after_once") {
    const skills = getEffectiveGeneralSkillIds(session, frame.damage.targetId);
    for (const skillId of ["jianxiong", "fankui", "ganglie", "fangzhu"] as const) {
      if (skills.includes(skillId)) add(frame.damage.targetId, skillId, "target");
    }
    for (const owner of standardJudgmentOrder(session)) add(owner.id, "beige", "global");
  } else if (stage === "target_after_per_point") {
    for (const skillId of getEffectiveGeneralSkillIds(session, frame.damage.targetId)) {
      if (skillId === "kuangbao" || skillId === "renjie" || skillId === "guixin" ||
          skillId === "yiji" || skillId === "jieming" || skillId === "xinsheng") {
        add(frame.damage.targetId, skillId, "target");
      }
    }
  } else if (stage === "settlement_end") {
    if (frame.damage.prevention !== null || frame.damage.hpBefore === null || frame.damage.hpAfter === null) return refs;
    add(frame.damage.targetId, "jilue", "target");
    const redirects = frame.damage.redirects
      .map((redirect, index) => ({ redirect, index }))
      .filter(({ redirect }) => redirect.skillId === "tianxiang")
      .reverse();
    for (const { redirect, index } of redirects) {
      refs.push({
        opportunityId: `${frame.damageId}:settlement_end:tianxiang_draw:${redirect.toTargetId}:${index + 1}`,
        ownerId: redirect.toTargetId,
        skillId: "tianxiang_draw",
        relation: "global",
        cadence: "settlement",
        pointIndex: null,
      });
    }
  }
  return refs;
}

function damageOpportunitiesForReceivingWindow(
  session: GameSession,
  frame: DamageFlowFrame,
): DamageOpportunityRef[] {
  const refs: DamageOpportunityRef[] = [];
  const target = getPlayer(session, frame.damage.targetId);
  const weather = qixingWeatherDamagePlan(session, target, frame.damage.amount, frame.damage.nature);
  if (weather.prevented) {
    const effect = qixingWeatherEffects(session, target.id, "dawu")[0];
    if (!effect?.sourcePlayerId) throw new Error("大雾伤害防止缺少来源。");
    refs.push({
      opportunityId: `${frame.damageId}:receiving_modifier:dawu:${effect.sourcePlayerId}:${effect.effectId}`,
      ownerId: effect.sourcePlayerId,
      skillId: "dawu",
      relation: "global",
      cadence: "once",
      pointIndex: null,
    });
  } else {
    const armorEffective = damageFlowArmorEffective(session, frame, target);
    const tengJiaBonus = armorEffective && frame.damage.nature === "fire" && target.equipment.armor?.kind === "teng_jia" ? 1 : 0;
    if (tengJiaBonus === 1) {
      refs.push({
        opportunityId: `${frame.damageId}:receiving_modifier:teng_jia:${target.id}:0`,
        ownerId: target.id,
        skillId: "teng_jia",
        relation: "target",
        cadence: "once",
        pointIndex: null,
      });
    }
    if (weather.kuangfengBonus === 1) {
      const effect = qixingWeatherEffects(session, target.id, "kuangfeng")[0];
      if (!effect?.sourcePlayerId) throw new Error("狂风伤害加成缺少来源。");
      refs.push({
        opportunityId: `${frame.damageId}:receiving_modifier:kuangfeng:${effect.sourcePlayerId}:${effect.effectId}`,
        ownerId: effect.sourcePlayerId,
        skillId: "kuangfeng",
        relation: "global",
        cadence: "once",
        pointIndex: null,
      });
    }
    if (armorEffective && target.equipment.armor?.kind === "bai_yin_shi_zi" &&
        frame.damage.amount + tengJiaBonus + weather.kuangfengBonus > 1) {
      refs.push({
        opportunityId: `${frame.damageId}:receiving_modifier:bai_yin_shi_zi:${target.id}:0`,
        ownerId: target.id,
        skillId: "bai_yin_shi_zi",
        relation: "target",
        cadence: "once",
        pointIndex: null,
      });
    }
  }
  const sourceId = frame.damage.sourceId;
  const opportunityId = kuangguCaptureOpportunityId(frame);
  if (sourceId !== null && opportunityId !== null && liveDamageOpportunityEligible(session, frame, "kuanggu")) {
    refs.push({
      opportunityId,
      ownerId: sourceId,
      skillId: "kuanggu",
      relation: "global",
      cadence: "once",
      pointIndex: null,
    });
  }
  return refs;
}

function damageOpportunitiesForRedirectWindow(
  session: GameSession,
  frame: DamageFlowFrame,
): DamageOpportunityRef[] {
  const target = getPlayer(session, frame.damage.targetId);
  if (!liveDamageOpportunityEligible(session, frame, "tianxiang")) return [];
  return [{
    opportunityId: `${frame.damageId}:redirect:tianxiang:${target.id}:0`,
    ownerId: target.id,
    skillId: "tianxiang",
    relation: "target",
    cadence: "once",
    pointIndex: null,
  }];
}

function cursorForCurrentDamagePrompt(session: GameSession): DamageOpportunityCursor {
  const flow = session.completeRules.damageFlow;
  const prompt = currentDamageFlowPrompt(flow);
  if (!prompt) throw new Error("DamageFlow has no current opportunity prompt");
  return {
    actionId: flow.nextActionId,
    promptId: prompt.promptId,
    frameId: prompt.frameId,
    damageId: prompt.damageId,
    windowId: prompt.windowId,
    opportunityId: prompt.opportunityId,
    ownerId: prompt.ownerId,
    expectedRevision: prompt.issuedAtRevision,
  };
}

function assertLiveDamageCursor(session: GameSession, cursor: DamageOpportunityCursor): DamageFlowFrame {
  const flow = session.completeRules.damageFlow;
  const prompt = currentDamageFlowPrompt(flow);
  const frame = flow.frames.at(-1);
  if (!frame || !prompt ||
    cursor.actionId !== flow.nextActionId ||
    cursor.promptId !== prompt.promptId ||
    cursor.frameId !== prompt.frameId ||
    cursor.damageId !== prompt.damageId ||
    cursor.windowId !== prompt.windowId ||
    cursor.opportunityId !== prompt.opportunityId ||
    cursor.ownerId !== prompt.ownerId ||
    cursor.expectedRevision !== prompt.issuedAtRevision ||
    frame.frameId !== cursor.frameId
  ) ruleError("INVALID_RESPONSE", "伤害时机提示已过期或不属于当前结算帧。");
  return frame;
}

function consumeLiveDamageOpportunity(
  session: GameSession,
  cursor: DamageOpportunityCursor,
  outcome: "pass" | "resolve",
  resolutionRef: string | null,
  effect: DamageOpportunityEffect = { type: "none" },
): void {
  assertLiveDamageCursor(session, cursor);
  session.completeRules.damageFlow = actOnDamageOpportunity(session.completeRules.damageFlow, {
    ...cursor,
    outcome,
    resolutionRef,
    effect,
  });
}

function offerCurrentDamageOpportunity(session: GameSession): boolean {
  const flow = session.completeRules.damageFlow;
  const frame = flow.frames.at(-1);
  const prompt = currentDamageFlowPrompt(flow);
  if (!frame || !prompt || !frame.window) return false;
  const opportunity = frame.window.opportunities[frame.window.cursor];
  if (!opportunity || opportunity.ref.opportunityId !== prompt.opportunityId) {
    throw new Error("DamageFlow prompt lost its opportunity");
  }
  if (opportunity.ref.skillId === "tianxiang_draw") {
    const redirect = frame.damage.redirects.find((entry, index) =>
      entry.skillId === "tianxiang"
      && `${frame.damageId}:settlement_end:tianxiang_draw:${entry.toTargetId}:${index + 1}` === opportunity.ref.opportunityId);
    if (!redirect || redirect.toTargetId !== opportunity.ref.ownerId) {
      throw new Error("天香摸牌机会与伤害转移记录不一致。");
    }
    const beneficiary = getPlayer(session, redirect.toTargetId);
    const drawn = beneficiary.alive ? drawCards(session, beneficiary, Math.max(0, beneficiary.maxHp - beneficiary.hp)) : 0;
    const cursor = cursorForCurrentDamagePrompt(session);
    consumeLiveDamageOpportunity(
      session,
      cursor,
      "resolve",
      `tianxiang:${frame.damageId}:draw:${frame.damage.redirects.indexOf(redirect) + 1}`,
    );
    addLog(session, "card", `${beneficiary.id} 因天香结算摸了 ${drawn} 张牌。`);
    return false;
  }
  if (!liveDamageOpportunityEligible(session, frame, opportunity.ref.skillId, opportunity.ref.ownerId)) {
    consumeLiveDamageOpportunity(session, cursorForCurrentDamagePrompt(session), "pass", null);
    return false;
  }
  const cursor = cursorForCurrentDamagePrompt(session);
  if (opportunity.ref.skillId === "teng_jia" || opportunity.ref.skillId === "bai_yin_shi_zi") {
    const armorKind = opportunity.ref.skillId;
    const target = getPlayer(session, frame.damage.targetId);
    if (opportunity.ref.ownerId !== target.id || target.equipment.armor?.kind !== armorKind ||
        !damageFlowArmorEffective(session, frame, target)) {
      throw new Error("防具伤害修正机会与当前装备不一致。");
    }
    consumeLiveDamageOpportunity(
      session,
      cursor,
      "resolve",
      `${armorKind}:${frame.damageId}:${target.id}`,
      armorKind === "teng_jia"
        ? { type: "modifier", operation: "add", value: 1 }
        : { type: "modifier", operation: "cap", value: 1 },
    );
    addLog(session, "damage", armorKind === "teng_jia"
      ? `${target.id} 的藤甲令此次火焰伤害增加 1 点。`
      : `${target.id} 的白银狮子将此次伤害限制为 1 点。`);
    return false;
  }
  if (opportunity.ref.skillId === "dawu" || opportunity.ref.skillId === "kuangfeng") {
    const skillId = opportunity.ref.skillId;
    const target = getPlayer(session, frame.damage.targetId);
    const effect = qixingWeatherEffects(session, target.id, skillId)
      .find((candidate) => candidate.sourcePlayerId === opportunity.ref.ownerId);
    const weather = qixingWeatherDamagePlan(session, target, frame.damage.amount, frame.damage.nature);
    if (!effect || (skillId === "dawu" ? !weather.prevented : weather.kuangfengBonus !== 1)) {
      throw new Error("七星天气伤害机会与当前状态不一致。");
    }
    consumeLiveDamageOpportunity(
      session,
      cursor,
      "resolve",
      `${skillId}:${frame.damageId}:${effect.effectId}`,
      skillId === "dawu"
        ? { type: "prevention", reason: "dawu_prevents_non_thunder_damage" }
        : { type: "modifier", operation: "add", value: weather.kuangfengBonus },
    );
    addLog(session, "damage", skillId === "dawu"
      ? `${target.id} 的大雾防止了此次非雷电伤害。`
      : `${target.id} 的狂风令此次火焰伤害增加 1 点。`);
    return false;
  }
  if (opportunity.ref.skillId === "kuangbao") {
    const owner = getPlayer(session, opportunity.ref.ownerId);
    const plan = planKuangbaoDamage({
      context: { ownerId: owner.id, ownerAlive: owner.alive, skillEffective: true },
      sourceId: frame.damage.sourceId,
      targetId: frame.damage.targetId,
      damageAmount: 1,
    });
    if (!plan.ok) throw new Error(plan.detail);
    const delta = opportunity.ref.relation === "source"
      ? plan.value.sourceSideMarkDelta
      : plan.value.targetSideMarkDelta;
    if (delta !== 1) throw new Error("狂暴逐点机会与伤害关系不一致。");
    addLivePermanentMark(session, owner.id, "rage", owner.id, "kuangbao", delta);
    consumeLiveDamageOpportunity(session, cursor, "resolve", `kuangbao:${frame.damageId}:${opportunity.ref.relation}:${opportunity.ref.pointIndex}`);
    addLog(session, "damage", `${owner.id} 因狂暴获得了 1 枚暴怒标记。`);
    return false;
  }
  if (opportunity.ref.skillId === "renjie") {
    const owner = getPlayer(session, opportunity.ref.ownerId);
    const plan = planRenjieDamage({
      context: { ownerId: owner.id, ownerAlive: owner.alive, skillEffective: true },
      damageAmount: 1,
    });
    if (!plan.ok || plan.value.renMarkDelta !== 1) throw new Error(plan.ok ? "忍戒逐点机会无效。" : plan.detail);
    addLivePermanentMark(session, owner.id, "ren", owner.id, "renjie", 1);
    consumeLiveDamageOpportunity(session, cursor, "resolve", `renjie:${frame.damageId}:${opportunity.ref.pointIndex}`);
    addLog(session, "damage", `${owner.id} 因忍戒获得了 1 枚忍标记。`);
    return false;
  }
  if (opportunity.ref.skillId === "guixin") {
    const owner = getPlayer(session, opportunity.ref.ownerId);
    const targetIds = livingOpponentsInSeatOrder(session, owner.id)
      .filter((player) => player.hand.length + Object.keys(player.equipment).length + player.judgment.length > 0)
      .map((player) => player.id);
    const eventId = allocateEventId(session);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: owner.id,
      promptId: `damage:${cursor.promptId}:guixin-invoke`,
      eventId,
      skillId: "guixin",
      stage: "guixin_invoke",
      targetIds,
      iteration: 0,
      damageOpportunity: cursor,
    };
    addLog(session, "damage", `${owner.id} 可以发动归心，依次获得其他角色区域内的一张牌。`);
    return true;
  }
  if (opportunity.ref.skillId === "kuanggu") {
    const source = getPlayer(session, opportunity.ref.ownerId);
    if (frame.step === "receiving") {
      const distance = distanceBetweenPlayers(session, source.id, frame.damage.targetId);
      consumeLiveDamageOpportunity(
        session,
        cursor,
        "resolve",
        `kuanggu:${frame.damageId}:distance:${distance}`,
      );
      return false;
    }
    const step = currentKuangguRecoveryStep(session, frame);
    if (!step?.triggered) throw new Error("狂骨逐点回复机会与伤害快照不一致。");
    consumeLiveDamageOpportunity(
      session,
      cursor,
      "resolve",
      `kuanggu:${frame.damageId}:recover:${step.pointIndex}`,
    );
    const recovered = recoverLivePlayer(session, source, step.requestedRecovery, source.id, "kuanggu");
    if (recovered > 0) addLog(session, "damage", `${source.id} 因狂骨回复了 ${recovered} 点体力。`);
    if (session.afterMove.queuedRecoveries.length > 0 || session.afterMove.queuedTriggers.length > 0) {
      offerNextAfterMoveSkill(session);
      return session.pendingResponse !== null;
    }
    return false;
  }
  const promptId = `damage:${cursor.promptId}`;
  session.turn.phase = "respond";
  if (opportunity.ref.skillId === "qi_lin_gong") {
    const slash = slashContinuationForDamage(frame);
    if (!slash) throw new Error("麒麟弓伤害时机缺少杀续体。");
    session.pendingResponse = {
      type: "weapon_action",
      weaponKind: "qi_lin_gong",
      stage: "qilin_discard_horse",
      attackerId: opportunity.ref.ownerId,
      targetId: opportunity.ref.ownerId,
      victimId: frame.damage.targetId,
      slash: cloneSlashPending(slash.pending),
      damageOpportunity: cursor,
    };
    return true;
  }
  if (opportunity.ref.skillId === "tianxiang") {
    const eventId = allocateEventId(session);
    session.pendingResponse = {
      type: "standard_skill",
      targetId: opportunity.ref.ownerId,
      promptId,
      eventId,
      skillId: "tianxiang",
      stage: "tianxiang_redirect",
      damageOpportunity: cursor,
      ...(frame.damage.sourceId ? { sourceId: frame.damage.sourceId } : {}),
    };
    addLog(session, "damage", `${opportunity.ref.ownerId} 可以发动天香转移此次伤害。`);
    return true;
  }
  if (opportunity.ref.skillId === "beige" || opportunity.ref.skillId === "xinsheng") {
    const eventId = allocateEventId(session);
    session.pendingResponse = {
      type: "standard_skill",
      targetId: opportunity.ref.ownerId,
      promptId,
      eventId,
      skillId: opportunity.ref.skillId,
      stage: opportunity.ref.skillId === "beige" ? "beige_cost" : "xinsheng_invoke",
      damageOpportunity: cursor,
      ...(frame.damage.sourceId ? { sourceId: frame.damage.sourceId } : {}),
    };
    addLog(session, "damage", `${opportunity.ref.ownerId} 可以发动${opportunity.ref.skillId === "beige" ? "悲歌" : "新生"}。`);
    return true;
  }
  if (opportunity.ref.skillId === "lieren" || opportunity.ref.skillId === "fangzhu" ||
      opportunity.ref.skillId === "jilue" || opportunity.ref.skillId === "baonue") {
    const eventId = allocateEventId(session);
    const beneficiary = opportunity.ref.skillId === "baonue"
      ? baonueOwnerForDamage(session, getLivingPlayer(session, opportunity.ref.ownerId), frame.damage.amount)
      : null;
    if (opportunity.ref.skillId === "baonue" && !beneficiary) {
      consumeLiveDamageOpportunity(session, cursor, "pass", null);
      return false;
    }
    session.pendingResponse = {
      type: "standard_skill",
      targetId: opportunity.ref.ownerId,
      promptId,
      eventId,
      skillId: opportunity.ref.skillId,
      stage: opportunity.ref.skillId === "lieren" ? "lieren_invoke"
        : opportunity.ref.skillId === "fangzhu" ? "fangzhu_target"
          : opportunity.ref.skillId === "jilue" ? "jilue_fangzhu" : "baonue_invoke",
      damageOpportunity: cursor,
      ...(opportunity.ref.skillId === "lieren" ? { sourceId: frame.damage.targetId } : {}),
      ...(beneficiary ? { sourceId: beneficiary.id } : {}),
    };
    addLog(session, "damage", `${opportunity.ref.ownerId} 可以发动${opportunity.ref.skillId === "lieren" ? "烈刃" : opportunity.ref.skillId === "fangzhu" ? "放逐" : opportunity.ref.skillId === "jilue" ? "极略·放逐" : "暴虐"}。`);
    return true;
  }
  const skillId = opportunity.ref.skillId as Extract<StandardImplementedSkillId, "jianxiong" | "yiji" | "fankui" | "ganglie" | "jieming">;
  const eventId = allocateEventId(session);
  session.pendingResponse = {
    type: "standard_skill",
    targetId: opportunity.ref.ownerId,
    promptId,
    eventId,
    skillId,
    stage: skillId === "jieming" ? "jieming_target" : "invoke",
    damageOpportunity: cursor,
    ...(frame.damage.sourceId ? { sourceId: frame.damage.sourceId } : {}),
  };
  addLog(session, "damage", `${opportunity.ref.ownerId} 可以在受到伤害后发动${skillId}。`);
  return true;
}

/** Drives empty timings and one persisted opportunity prompt at a time. */
function driveLiveDamageFlow(session: GameSession, resumeRootContinuation: boolean): boolean {
  for (;;) {
    let flow = session.completeRules.damageFlow;
    const frame = flow.frames.at(-1);
    if (!frame) return false;
    if (frame.step === "causing") {
      flow = closeEmptyDamageFlowWindow(flow, frame.frameId,
        "causing_modifier",
        lifePlayerSnapshot(session));
      session.completeRules.damageFlow = flow;
      continue;
    }
    if (frame.step === "redirect") {
      if (frame.window === null) {
        if (session.afterMove.queuedRecoveries.length > 0 || session.afterMove.queuedTriggers.length > 0) return true;
        session.completeRules.damageFlow = openDamageFlowWindow(flow, {
          frameId: frame.frameId,
          expectedRevision: flow.revision,
          kind: "redirect",
          opportunities: damageOpportunitiesForRedirectWindow(session, frame),
          players: lifePlayerSnapshot(session),
        });
        continue;
      }
      if (frame.window.prompt !== null) {
        if (offerCurrentDamageOpportunity(session)) return true;
        continue;
      }
      session.completeRules.damageFlow = closeDamageFlowWindow(flow, {
        frameId: frame.frameId,
        windowId: frame.window.windowId,
        expectedRevision: flow.revision,
      });
      continue;
    }
    if (frame.step === "receiving") {
      if (frame.window === null) {
        session.completeRules.damageFlow = openDamageFlowWindow(flow, {
          frameId: frame.frameId,
          expectedRevision: flow.revision,
          kind: "receiving_modifier",
          opportunities: damageOpportunitiesForReceivingWindow(session, frame),
          players: lifePlayerSnapshot(session),
        });
        continue;
      }
      if (frame.window.prompt !== null) {
        if (offerCurrentDamageOpportunity(session)) return true;
        continue;
      }
      session.completeRules.damageFlow = closeDamageFlowWindow(flow, {
        frameId: frame.frameId,
        windowId: frame.window.windowId,
        expectedRevision: flow.revision,
      });
      continue;
    }
    if (frame.step === "life_deduction") {
      const life = applyDamageLifeFlow(flow, lifePlayerSnapshot(session), {
        frameId: frame.frameId,
        expectedRevision: flow.revision,
      });
      commitLifePlayerSnapshot(session, life.players, frame.damageId);
      session.completeRules.damageFlow = life.state;
      applyWuhunMarksAfterLifeDeduction(session, frame);
      if (life.dying) {
        const target = getPlayer(session, life.dying.targetId);
        return beginDying(session, target, frame.damage.sourceId, {
          type: "damage_flow",
          frameId: life.dying.frameId,
          damageId: life.dying.damageId,
          dyingId: life.dying.dyingId,
        }, { hpBefore: life.application.hpBefore, amount: life.application.amount });
      }
      continue;
    }
    if (frame.step === "dying") return true;
    if (frame.step === "post_damage") {
      if (frame.window === null) {
        session.completeRules.damageFlow = openDamageFlowWindow(flow, {
          frameId: frame.frameId,
          expectedRevision: flow.revision,
          kind: postDamageWindowKind(frame.damage.stage),
          opportunities: damageOpportunitiesForCurrentWindow(session, frame),
          players: lifePlayerSnapshot(session),
        });
        continue;
      }
      if (frame.window.prompt !== null) {
        if (offerCurrentDamageOpportunity(session)) return true;
        continue;
      }
      session.completeRules.damageFlow = closeDamageFlowWindow(flow, {
        frameId: frame.frameId,
        windowId: frame.window.windowId,
        expectedRevision: flow.revision,
      });
      continue;
    }
    if (frame.step !== "complete") throw new Error(`DamageFlow stopped at unsupported step ${frame.step}`);
    const completed = finishDamageFlowFrame(flow, {
      frameId: frame.frameId,
      resumeToken: frame.parentResumeToken,
      expectedRevision: flow.revision,
      players: frame.parentResumeToken === null ? null : lifePlayerSnapshot(session),
    });
    session.completeRules.damageFlow = completed.state;
    if (completed.resumedParentFrameId !== null) continue;
    if (resumeRootContinuation && completed.callerContinuation !== null) {
      const decoded = decodeGameDamageContinuation(completed.callerContinuation);
      const resume = decoded.type === "chain_damage" && frame.damage.reason.id !== "受到铁索连环传导"
        ? { ...decoded, amount: frame.damage.amount }
        : decoded;
      resumeAfterDying(session, resume);
    }
    return false;
  }
}

function eligibleDamageSkill(
  session: GameSession,
  frame: StandardDamageAftermath,
  skillId: StandardImplementedSkillId,
): boolean {
  const target = getPlayer(session, frame.targetId);
  if (!target.alive || !hasEffectiveSkill(session, target, skillId)) return false;
  if (skillId === "jianxiong") {
    return frame.damageCardIds.some((cardId) => session.resolvingCards.some((card) => card.id === cardId));
  }
  if (skillId === "yiji") return session.deck.length + session.discardPile.length > 0;
  if (skillId === "fankui") {
    const source = frame.sourceId ? getPlayer(session, frame.sourceId) : null;
    return !!source?.alive && source.id !== target.id && (source.hand.length > 0 || Object.keys(source.equipment).length > 0);
  }
  if (skillId === "ganglie") {
    const source = frame.sourceId ? getPlayer(session, frame.sourceId) : null;
    return !!source?.alive && source.id !== target.id;
  }
  return false;
}

function offerDamageAftermath(session: GameSession, initial: StandardDamageAftermath): boolean {
  const frame = cloneStandardDamageAftermath(initial);
  while (frame.remainingSkillIds.length > 0) {
    const skillId = frame.remainingSkillIds.shift()!;
    if (!eligibleDamageSkill(session, frame, skillId)) continue;
    const owner = getPlayer(session, frame.targetId);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: owner.id,
      promptId: standardPromptId(frame.eventId, skillId, owner.id, `invoke-${frame.remainingSkillIds.length}`),
      eventId: frame.eventId,
      skillId,
      stage: "invoke",
      aftermath: frame,
      ...(frame.sourceId ? { sourceId: frame.sourceId } : {}),
    };
    addLog(session, "damage", `${owner.id} 可以在受到伤害后发动${skillId}。`);
    return true;
  }
  return false;
}

function continueDamageAftermath(session: GameSession, frame: StandardDamageAftermath): void {
  if (session.status === "finished") {
    finishResolvingCards(session);
    return;
  }
  if (offerDamageAftermath(session, frame)) return;
  resumeAfterDying(session, frame.resume);
}

function dealDamage(
  session: GameSession,
  target: GamePlayer,
  attacker: GamePlayer | null,
  amount: number,
  nature: DamageNature,
  reason: string,
  resume: DyingResume,
  damageCardIds: readonly CardId[] = [],
): boolean {
  if (resume.type === "damage_flow") {
    throw new Error("An internal damage-flow cursor cannot start another root damage event");
  }
  const actualAmount = amount;
  startLiveDamageFlow(
    session,
    target,
    attacker,
    actualAmount,
    nature,
    reason,
    damageCardIds,
    encodeGameDamageContinuation(resume as GameDamageResume),
  );
  const natureLabel = natureName(nature);
  addLog(
    session,
    "damage",
    `${target.id} ${reason}，受到 ${actualAmount} 点${natureLabel}伤害。`,
  );
  return driveLiveDamageFlow(session, false);
}

function continueChainDamage(
  session: GameSession,
  resume: Extract<DyingResume, { type: "chain_damage" }>,
  resumeWhenComplete: boolean,
): boolean {
  for (const [index, playerId] of resume.remainingTargetIds.entries()) {
    if (session.status === "finished") return false;
    const target = getPlayer(session, playerId);
    if (!target.alive) continue;
    const weather = qixingWeatherDamagePlan(session, target, resume.amount, resume.nature);
    if (!weather.prevented) target.chained = false;
    const tail = resume.remainingTargetIds.slice(index + 1);
    const nextResume: DyingResume = tail.length > 0
      ? { ...resume, remainingTargetIds: tail }
      : resume.finalResume;
    const source = resume.sourceId === null ? null : getPlayer(session, resume.sourceId);
    const enteredDying = dealDamage(
      session,
      target,
      source,
      resume.amount,
      resume.nature,
      "受到铁索连环传导",
      nextResume,
      resume.damageCardIds ?? [],
    );
    if (enteredDying) return true;
  }
  if (resumeWhenComplete) resumeAfterDying(session, resume.finalResume);
  return false;
}

function dealDamageWithChain(
  session: GameSession,
  target: GamePlayer,
  attacker: GamePlayer | null,
  amount: number,
  nature: DamageNature,
  reason: string,
  resume: Exclude<GameDamageResume, { type: "chain_damage" }>,
  ignoreArmor = false,
  damageCardIds: readonly CardId[] = [],
): boolean {
  if (nature === "normal" || !target.chained) {
    return dealDamage(session, target, attacker, amount, nature, reason, resume, damageCardIds);
  }
  const propagatedAmount = previewDamageAfterWeatherAndArmor(session, target, amount, nature, ignoreArmor);
  if (propagatedAmount === 0) {
    return dealDamage(session, target, attacker, amount, nature, reason, resume, damageCardIds);
  }
  target.chained = false;
  const remainingTargetIds = livingOpponentsInSeatOrder(session, target.id)
    .filter((player) => player.chained)
    .map((player) => player.id);
  const chainResume: Extract<DyingResume, { type: "chain_damage" }> = {
    type: "chain_damage",
    sourceId: attacker?.id ?? null,
    amount: propagatedAmount,
    nature,
    damageCardIds: [...damageCardIds],
    remainingTargetIds,
    finalResume: resume,
  };
  const enteredDying = dealDamage(
    session,
    target,
    attacker,
    amount,
    nature,
    reason,
    remainingTargetIds.length > 0 ? chainResume : resume,
    damageCardIds,
  );
  if (enteredDying || remainingTargetIds.length === 0) return enteredDying;
  return continueChainDamage(session, chainResume, false);
}

function nextLivingPlayer(session: GameSession, currentPlayerId: PlayerId): GamePlayer {
  const currentIndex = session.players.findIndex((player) => player.id === currentPlayerId);
  if (currentIndex < 0) throw new Error("当前玩家不在座位表中。");
  for (let offset = 1; offset <= session.players.length; offset += 1) {
    const candidate = session.players[(currentIndex + offset) % session.players.length];
    if (candidate?.alive) return candidate;
  }
  throw new Error("没有存活玩家可进入下一回合。");
}

/** Living opponents in circular seat order, beginning immediately after source. */
function livingOpponentsInSeatOrder(
  session: GameSession,
  sourceId: PlayerId,
): GamePlayer[] {
  const sourceIndex = session.players.findIndex((player) => player.id === sourceId);
  if (sourceIndex < 0) throw new Error("效果来源不在座位表中。");
  const ordered: GamePlayer[] = [];
  for (let offset = 1; offset < session.players.length; offset += 1) {
    const candidate = session.players[(sourceIndex + offset) % session.players.length];
    if (candidate?.alive) ordered.push(candidate);
  }
  return ordered;
}

/** Source first, followed by living players in circular seat order. */
function livingPlayersInSeatOrderFrom(
  session: GameSession,
  source: GamePlayer,
): GamePlayer[] {
  return [source, ...livingOpponentsInSeatOrder(session, source.id)];
}

type LuanwuContinuation = Extract<SlashResolutionContinuation, { type: "luanwu" }>;

function allOpponentsInSeatOrder(session: GameSession, sourceId: PlayerId): PlayerId[] {
  const sourceIndex = session.players.findIndex((player) => player.id === sourceId);
  if (sourceIndex < 0) throw new Error("乱武来源不在座位表中。");
  return Array.from({ length: session.players.length - 1 }, (_value, index) =>
    session.players[(sourceIndex + index + 1) % session.players.length]!.id,
  );
}

function assertLuanwuContinuation(session: GameSession, continuation: LuanwuContinuation): void {
  const expectedOrder = allOpponentsInSeatOrder(session, continuation.ownerId);
  const actualOrder = [...continuation.processedActorIds, ...continuation.remainingActorIds];
  if (expectedOrder.length !== actualOrder.length || expectedOrder.some((playerId, index) => actualOrder[index] !== playerId)) {
    throw new Error("乱武冻结行动座次已被篡改。");
  }
  if (continuation.eventId >= session.nextEventId || !session.completeRules.lifecycle.limitedUses.some((entry) =>
    entry.ownerId === continuation.ownerId && entry.skillId === "luanwu" && entry.consumedAtEventId === continuation.eventId)) {
    throw new Error("乱武续体与限定技消费记录不一致。");
  }
}

function canProduceLuanwuSlash(session: GameSession, actor: GamePlayer): boolean {
  if (actor.hand.some((card) => isSlashCardKind(card.kind))) return true;
  if (hasEffectiveSkill(session, actor, "wusheng") && ownedCards(actor).some((card) => isRedCard(session, actor, card))) return true;
  if (hasEffectiveSkill(session, actor, "longdan") && actor.hand.some((card) => card.kind === "dodge")) return true;
  return actor.equipment.weapon?.kind === "zhang_ba_she_mao" && actor.hand.length >= 2;
}

function liveLuanwuActorPlan(session: GameSession, actor: GamePlayer) {
  return planLuanwuActor({
    actorId: actor.id,
    actorAlive: actor.alive,
    actorCanProduceSlash: canProduceLuanwuSlash(session, actor),
    candidates: session.players
      .filter((candidate) => candidate.id !== actor.id)
      .map((candidate) => ({
        id: candidate.id,
        alive: candidate.alive,
        distance: candidate.alive ? distanceBetweenPlayers(session, actor.id, candidate.id) : 1,
        slashTargetLegal: candidate.alive && canBeSlashTarget(session, candidate),
      })),
  });
}

function finishLuanwu(session: GameSession): void {
  session.pendingResponse = null;
  if (session.status !== "playing") return;
  const current = getPlayer(session, session.currentPlayerId);
  if (current.alive) session.turn.phase = "play";
  else beginNextTurn(session);
}

function qiaobianPhaseInstanceId(session: GameSession, phase: QiaobianPhase): number {
  const offset = phase === "judgment" ? 1 : phase === "draw" ? 2 : phase === "play" ? 3 : 4;
  const value = session.turn.number * 10 + offset;
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("巧变阶段实例编号耗尽。");
  return value;
}

function offerQiaobianBeforePhase(
  session: GameSession,
  player: GamePlayer,
  phase: QiaobianPhase,
): boolean {
  if (!hasEffectiveSkill(session, player, "qiaobian") || player.hand.length === 0) return false;
  const eventId = allocateEventId(session);
  session.turn.phase = "respond";
  session.pendingResponse = {
    type: "standard_skill",
    targetId: player.id,
    promptId: standardPromptId(eventId, "qiaobian", player.id, phase),
    eventId,
    skillId: "qiaobian",
    stage: "qiaobian_skip",
    phase,
  };
  addLog(session, "turn", `${player.id} 可以弃置一张手牌发动巧变，跳过${phase === "judgment" ? "判定" : phase === "draw" ? "摸牌" : phase === "play" ? "出牌" : "弃牌"}阶段。`);
  return true;
}

interface LiveQiaobianTableCard {
  readonly source: GamePlayer;
  readonly card: Card;
  readonly zone: "equipment" | "judgment";
  readonly equipmentSlot: EquipmentSlot | null;
  readonly targetIds: PlayerId[];
}

function qiaobianTableDestination(player: GamePlayer) {
  return {
    playerId: player.id,
    alive: player.alive,
    occupiedEquipmentSlots: Object.keys(player.equipment) as EquipmentSlot[],
    judgmentCardKinds: player.judgment.map((card) => card.kind),
    canReceiveDelayedTrick: player.alive,
  } as const;
}

function qiaobianTableCards(session: GameSession, owner: GamePlayer): LiveQiaobianTableCard[] {
  const candidates: LiveQiaobianTableCard[] = [];
  for (const source of session.players.filter((player) => player.alive)) {
    for (const [slot, card] of Object.entries(source.equipment) as Array<[EquipmentSlot, Card]>) {
      const targetIds = session.players.filter((destination) => {
        const plan = planQiaobianTableMove({
          ownerId: owner.id,
          sourceId: source.id,
          sourceAlive: source.alive,
          card: mountainRuleCard(session, source, card, "equipment"),
          destination: qiaobianTableDestination(destination),
        });
        return plan.ok;
      }).map((destination) => destination.id);
      if (targetIds.length > 0) candidates.push({ source, card, zone: "equipment", equipmentSlot: slot, targetIds });
    }
    for (const card of source.judgment) {
      const targetIds = session.players.filter((destination) => {
        const plan = planQiaobianTableMove({
          ownerId: owner.id,
          sourceId: source.id,
          sourceAlive: source.alive,
          card: mountainRuleCard(session, source, card, "judgment"),
          destination: qiaobianTableDestination(destination),
        });
        return plan.ok;
      }).map((destination) => destination.id);
      if (targetIds.length > 0) candidates.push({ source, card, zone: "judgment", equipmentSlot: null, targetIds });
    }
  }
  return candidates;
}

function continueUnskippedQiaobianPhase(
  session: GameSession,
  player: GamePlayer,
  phase: QiaobianPhase,
): void {
  if (phase === "judgment") continueBeforeJudgmentAfterQiaobian(session, player);
  else if (phase === "draw") continueDrawPhaseAfterQiaobian(session, player);
  else if (phase === "play") continueBeforePlayAfterQiaobian(session, player);
  else continueBeforeDiscardAfterQiaobian(session);
}

function finishQiaobianReplacement(session: GameSession, player: GamePlayer, phase: QiaobianPhase): void {
  session.pendingResponse = null;
  if (phase === "draw") enterBeforePlayPhase(session, player);
  else if (phase === "play") enterDiscardOrEnd(session);
  else throw new Error("巧变替代效果续体包含无效阶段。");
}

function continueQiaobianAfterCost(
  session: GameSession,
  player: GamePlayer,
  phase: QiaobianPhase,
  eventId: number,
): void {
  session.pendingResponse = null;
  if (phase === "judgment") {
    addLog(session, "turn", `${player.id} 因巧变跳过判定阶段。`);
    enterBeforeDrawPhase(session, player);
    return;
  }
  if (phase === "discard") {
    addLog(session, "turn", `${player.id} 因巧变跳过弃牌阶段。`);
    enterEndPhase(session);
    return;
  }
  if (phase === "draw") {
    const targetIds = livingOpponentsInSeatOrder(session, player.id)
      .filter((target) => target.hand.length > 0)
      .map((target) => target.id);
    if (targetIds.length === 0) {
      finishQiaobianReplacement(session, player, phase);
      return;
    }
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: player.id,
      promptId: standardPromptId(eventId, "qiaobian", player.id, "draw"),
      eventId,
      skillId: "qiaobian",
      stage: "qiaobian_draw",
      phase,
      targetIds,
    };
    addLog(session, "card", `${player.id} 可以因巧变获得至多两名其他角色的各一张手牌。`);
    return;
  }
  const candidates = qiaobianTableCards(session, player);
  if (candidates.length === 0) {
    finishQiaobianReplacement(session, player, phase);
    return;
  }
  session.turn.phase = "respond";
  session.pendingResponse = {
    type: "standard_skill",
    targetId: player.id,
    promptId: standardPromptId(eventId, "qiaobian", player.id, "play"),
    eventId,
    skillId: "qiaobian",
    stage: "qiaobian_play",
    phase,
    selectedCardIds: candidates.map((candidate) => candidate.card.id),
    targetIds: [...new Set(candidates.flatMap((candidate) => candidate.targetIds))],
  };
  addLog(session, "card", `${player.id} 可以因巧变移动场上的一张装备区或判定区牌。`);
}

function advanceLuanwu(session: GameSession, continuation: LuanwuContinuation): void {
  if (session.status !== "playing") return;
  assertLuanwuContinuation(session, continuation);
  const [actorId, ...remainingActorIds] = continuation.remainingActorIds;
  if (!actorId) {
    finishLuanwu(session);
    return;
  }
  const actor = getPlayer(session, actorId);
  const next: LuanwuContinuation = {
    ...continuation,
    processedActorIds: [...continuation.processedActorIds, actorId],
    remainingActorIds,
  };
  if (!actor.alive) {
    advanceLuanwu(session, next);
    return;
  }
  const plan = liveLuanwuActorPlan(session, actor);
  if (!plan.ok) throw new Error(plan.detail);
  if (plan.value.noActionBecauseGameEnded) {
    finishLuanwu(session);
    return;
  }
  if (!plan.value.options.includes("use_slash")) {
    const enteredDying = loseHp(session, actor, 1, "未能在乱武中使用杀", next);
    if (!enteredDying) advanceLuanwu(session, next);
    return;
  }
  session.turn.phase = "respond";
  session.pendingResponse = {
    type: "standard_skill",
    targetId: actor.id,
    promptId: standardPromptId(continuation.eventId, "luanwu", actor.id, `slash-${remainingActorIds.length}`),
    eventId: continuation.eventId,
    skillId: "luanwu",
    stage: "luanwu_slash",
    sourceId: continuation.ownerId,
    targetIds: next.remainingActorIds,
    processedPlayerIds: next.processedActorIds,
  };
  addLog(session, "card", `${actor.id} 须在乱武中对距离最近的合法角色使用一张杀，否则失去 1 点体力。`);
}

function offerNextLianpoChoice(session: GameSession, endedPlayerId: PlayerId, processedOwnerIds: readonly PlayerId[]): void {
  const [ownerId, ...remainingOwnerIds] = session.turn.lianpoArmedOwnerIds ?? [];
  if (!ownerId) {
    session.pendingResponse = null;
    // A resolved Lianpo prompt leaves the turn in `respond`. Mark the already
    // completed turn explicitly so beginNextTurn does not run its boundary a
    // second time after the final choice.
    session.turn.phase = "end";
    beginNextTurn(session);
    return;
  }
  const owner = getPlayer(session, ownerId);
  if (!owner.alive || !hasEffectiveSkill(session, owner, "lianpo")) {
    session.turn.lianpoArmedOwnerIds = remainingOwnerIds;
    offerNextLianpoChoice(session, endedPlayerId, [...processedOwnerIds, ownerId]);
    return;
  }
  const eventId = allocateEventId(session);
  session.turn.phase = "respond";
  session.pendingResponse = {
    type: "standard_skill",
    targetId: owner.id,
    promptId: standardPromptId(eventId, "lianpo", owner.id, `choice-turn-${session.turn.number}`),
    eventId,
    skillId: "lianpo",
    stage: "lianpo_choice",
    sourceId: endedPlayerId,
    targetIds: remainingOwnerIds,
    processedPlayerIds: [...processedOwnerIds],
  };
  addLog(session, "turn", `${owner.id} 本回合曾杀死角色，可以发动连破获得一个额外回合。`);
}

function completeTurn(session: GameSession, player: GamePlayer): void {
  session.pendingResponse = null;
  session.turn.phase = "end";
  expireLifecycleState(session.completeRules.lifecycle, { type: "turn_end", turnId: session.turn.number });
  addLog(session, "turn", `${player.id} 的回合结束。`);
  const armed = session.turn.lianpoArmedOwnerIds ?? [];
  if (new Set(armed).size !== armed.length || armed.some((playerId) => !session.players.some((candidate) => candidate.id === playerId))) {
    throw new Error("连破的本回合击杀记录被篡改。");
  }
  const armedSet = new Set(armed);
  session.turn.lianpoArmedOwnerIds = [player.id, ...allOpponentsInSeatOrder(session, player.id)]
    .filter((playerId) => armedSet.has(playerId));
  offerNextLianpoChoice(session, player.id, []);
}

function finishTurn(session: GameSession, player: GamePlayer): void {
  session.pendingResponse = null;
  session.turn.phase = "end";
  if (session.turn.fangquanSkippedPlay) {
    const targetIds = session.players
      .filter((candidate) => candidate.alive && candidate.id !== player.id)
      .map((candidate) => candidate.id);
    if (player.alive && player.hand.length > 0 && targetIds.length > 0) {
      const eventId = allocateEventId(session);
      session.turn.phase = "respond";
      session.pendingResponse = {
        type: "standard_skill",
        targetId: player.id,
        promptId: standardPromptId(eventId, "fangquan", player.id, "finish"),
        eventId,
        skillId: "fangquan",
        stage: "fangquan_finish",
        selectedCardIds: player.hand.map((card) => card.id),
        targetIds,
      };
      addLog(session, "turn", `${player.id} 可以弃置一张手牌，将一个额外回合交给一名其他角色。`);
      return;
    }
    session.turn.fangquanSkippedPlay = false;
  }
  completeTurn(session, player);
}

function continueEndPhaseAfterBiyue(session: GameSession, player: GamePlayer): void {
  session.pendingResponse = null;
  session.turn.phase = "end";
  if (offerHuashenSwitch(session, player, "huashen_turn_end")) return;
  finishTurn(session, player);
}

function continueEndPhaseAfterBenghuai(session: GameSession): void {
  const player = getLivingPlayer(session, session.currentPlayerId);
  session.turn.phase = "end";
  session.pendingResponse = null;
  if (hasEffectiveSkill(session, player, "biyue")) {
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "skill_choice",
      targetId: player.id,
      skillId: "biyue",
      resume: { type: "finish_turn", playerId: player.id },
    };
    addLog(session, "turn", `${player.id} 可以在结束阶段发动闭月摸一张牌。`);
    return;
  }
  continueEndPhaseAfterBiyue(session, player);
}

function continueEndPhaseAfterJushou(session: GameSession): void {
  const player = getLivingPlayer(session, session.currentPlayerId);
  session.turn.phase = "end";
  session.pendingResponse = null;
  const trigger = evaluateBenghuaiTrigger({
    context: forestSkillContext(session, player, "benghuai"),
    phase: session.turn.phase,
    ownerHp: player.hp,
    otherPlayers: session.players
      .filter((candidate) => candidate.id !== player.id)
      .map((candidate) => ({ id: candidate.id, alive: candidate.alive, hp: candidate.hp })),
  });
  if (trigger.ok && trigger.value.triggered) {
    const eventId = allocateEventId(session);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: player.id,
      promptId: standardPromptId(eventId, "benghuai", player.id, "choice"),
      eventId,
      skillId: "benghuai",
      stage: "benghuai_choice",
    };
    addLog(session, "turn", `${player.id} 的崩坏触发，须选择失去 1 点体力或减 1 点体力上限。`);
    return;
  }
  continueEndPhaseAfterBenghuai(session);
}

function continueEndPhaseAfterDawu(session: GameSession): void {
  const player = getLivingPlayer(session, session.currentPlayerId);
  session.turn.phase = "end";
  session.pendingResponse = null;
  if (hasEffectiveSkill(session, player, "jushou")) {
    const eventId = allocateEventId(session);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: player.id,
      promptId: standardPromptId(eventId, "jushou", player.id, "invoke"),
      eventId,
      skillId: "jushou",
      stage: "invoke",
    };
    addLog(session, "turn", `${player.id} 可以在结束阶段发动据守。`);
    return;
  }
  continueEndPhaseAfterJushou(session);
}

function continueEndPhaseAfterKuangfeng(session: GameSession): void {
  const player = getLivingPlayer(session, session.currentPlayerId);
  const stars = player.extraPiles[QIXING_PILE_ID] ?? [];
  session.turn.phase = "end";
  session.pendingResponse = null;
  if (hasEffectiveSkill(session, player, "dawu") && stars.length > 0) {
    const eventId = allocateEventId(session);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: player.id,
      promptId: standardPromptId(eventId, "dawu", player.id, "choice"),
      eventId,
      skillId: "dawu",
      stage: "dawu_choice",
      starCardIds: stars.map((card) => card.id),
      targetIds: session.players.filter((candidate) => candidate.alive).map((candidate) => candidate.id),
    };
    addLog(session, "turn", `${player.id} 可以移去任意张星并令等量角色获得大雾。`);
    return;
  }
  continueEndPhaseAfterDawu(session);
}

/** Enter the real end phase exactly once, regardless of how discard was skipped/completed. */
function enterEndPhase(session: GameSession): void {
  const player = getLivingPlayer(session, session.currentPlayerId);
  const stars = player.extraPiles[QIXING_PILE_ID] ?? [];
  session.turn.phase = "end";
  session.pendingResponse = null;
  if (hasEffectiveSkill(session, player, "kuangfeng") && stars.length > 0) {
    const eventId = allocateEventId(session);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: player.id,
      promptId: standardPromptId(eventId, "kuangfeng", player.id, "choice"),
      eventId,
      skillId: "kuangfeng",
      stage: "kuangfeng_choice",
      starCardIds: stars.map((card) => card.id),
      targetIds: session.players.filter((candidate) => candidate.alive).map((candidate) => candidate.id),
    };
    addLog(session, "turn", `${player.id} 可以移去一张星并令一名角色获得狂风。`);
    return;
  }
  continueEndPhaseAfterKuangfeng(session);
}

function clearDiscardPhaseHistory(session: GameSession): void {
  session.turn.discardPhaseStarted = false;
  session.turn.discardPhaseHandCardIds = [];
  session.turn.qinyinInvoked = false;
  session.turn.qinyinEventId = null;
}

function qinyinSeatOrder(session: GameSession, ownerId: PlayerId): GamePlayer[] {
  return [ownerId, ...allOpponentsInSeatOrder(session, ownerId)].map((playerId) => getPlayer(session, playerId));
}

function offerQinyin(session: GameSession, owner: GamePlayer): boolean {
  const discardedIds = session.turn.discardPhaseHandCardIds ?? [];
  if (!owner.alive || !hasEffectiveSkill(session, owner, "qinyin") ||
      session.turn.qinyinInvoked === true || discardedIds.length < 2) return false;
  if (session.currentPlayerId !== owner.id || !session.turn.discardPhaseStarted ||
      session.turn.qinyinEventId !== null && session.turn.qinyinEventId !== undefined) {
    throw new Error("琴音触发与当前弃牌阶段续体不一致。");
  }
  const order = qinyinSeatOrder(session, owner.id);
  const plan = planQinyin({
    context: { ...godSkillContext(session, owner, "qinyin"), currentPlayerId: owner.id, phase: "discard" },
    alreadyInvokedThisDiscardPhase: false,
    qualifyingDiscardedHandCardIds: discardedIds,
    mode: "decline",
    resolutionOrder: order.map((player) => ({
      id: player.id,
      alive: player.alive,
      hp: player.hp,
      maxHp: player.maxHp,
    })),
  });
  if (!plan.ok) throw new Error(plan.detail);
  const eventId = allocateEventId(session);
  session.turn.qinyinEventId = eventId;
  session.turn.phase = "respond";
  session.pendingResponse = {
    type: "standard_skill",
    targetId: owner.id,
    promptId: standardPromptId(eventId, "qinyin", owner.id, "choice"),
    eventId,
    skillId: "qinyin",
    stage: "qinyin_choice",
    selectedCardIds: [...discardedIds],
    targetIds: order.map((player) => player.id),
  };
  addLog(session, "card", `${owner.id} 本弃牌阶段已弃置至少两张手牌，可以发动琴音。`);
  return true;
}

function finishQinyin(session: GameSession, ownerId: PlayerId): void {
  const owner = getPlayer(session, ownerId);
  session.pendingResponse = null;
  session.turn.phase = "discard";
  if (owner.alive) {
    enterHandLimitDiscardOrEnd(session, owner);
  } else {
    clearDiscardPhaseHistory(session);
    completeTurn(session, owner);
  }
}

function continueQinyinHpLoss(session: GameSession, resume: Extract<DyingResume, { type: "qinyin" }>): void {
  const expectedOrder = [resume.ownerId, ...allOpponentsInSeatOrder(session, resume.ownerId)];
  if (session.currentPlayerId !== resume.ownerId || !session.turn.discardPhaseStarted ||
      session.turn.qinyinInvoked !== true || session.turn.qinyinEventId !== resume.eventId ||
      !Number.isSafeInteger(resume.eventId) || resume.eventId <= 0 || resume.eventId >= session.nextEventId ||
      !Number.isSafeInteger(resume.nextTargetIndex) || resume.nextTargetIndex < 0 ||
      resume.nextTargetIndex > resume.targetIds.length || resume.targetIds.length !== expectedOrder.length ||
      new Set(resume.targetIds).size !== resume.targetIds.length ||
      resume.targetIds.some((playerId, index) => expectedOrder[index] !== playerId)) {
    throw new Error("琴音失去体力座次续体被篡改。");
  }
  session.pendingResponse = null;
  session.turn.phase = "discard";
  for (let index = resume.nextTargetIndex; index < resume.targetIds.length; index += 1) {
    const target = getPlayer(session, resume.targetIds[index]!);
    if (!target.alive) continue;
    const next: Extract<DyingResume, { type: "qinyin" }> = {
      ...resume,
      targetIds: [...resume.targetIds],
      nextTargetIndex: index + 1,
    };
    if (loseHp(session, target, 1, "因琴音", next)) return;
  }
  finishQinyin(session, resume.ownerId);
}

function finishQinyinRecovery(session: GameSession, pending: PendingStandardSkill): void {
  const expectedOrder = [pending.targetId, ...allOpponentsInSeatOrder(session, pending.targetId)];
  if (pending.skillId !== "qinyin" || pending.stage !== "qinyin_choice" ||
      pending.mode !== "all_recover_one" || pending.iteration !== expectedOrder.length ||
      pending.eventId !== session.turn.qinyinEventId || session.turn.qinyinInvoked !== true ||
      !pending.targetIds || pending.targetIds.length !== expectedOrder.length ||
      pending.targetIds.some((playerId, index) => expectedOrder[index] !== playerId) ||
      pending.promptId !== standardPromptId(pending.eventId, "qinyin", pending.targetId, "finish-recovery")) {
    throw new Error("琴音回复后的牌移动续体被篡改。");
  }
  finishQinyin(session, pending.targetId);
}

function remainingGuzhengCardIds(session: GameSession, recordedCardIds: readonly CardId[]): CardId[] {
  const discardIds = new Set(session.discardPile.map((card) => card.id));
  return recordedCardIds.filter((cardId, index) =>
    recordedCardIds.indexOf(cardId) === index && discardIds.has(cardId)
  );
}

function advanceGuzheng(
  session: GameSession,
  discarder: GamePlayer,
  eventId: number,
  recordedCardIds: readonly CardId[],
  processedOwnerIds: readonly PlayerId[],
  remainingOwnerIds: readonly PlayerId[],
): void {
  const [ownerId, ...rest] = remainingOwnerIds;
  if (!ownerId || remainingGuzhengCardIds(session, recordedCardIds).length === 0) {
    clearDiscardPhaseHistory(session);
    enterEndPhase(session);
    return;
  }
  const owner = getPlayer(session, ownerId);
  if (!owner.alive || !hasEffectiveSkill(session, owner, "guzheng")) {
    advanceGuzheng(session, discarder, eventId, recordedCardIds, [...processedOwnerIds, ownerId], rest);
    return;
  }
  session.turn.phase = "respond";
  session.pendingResponse = {
    type: "standard_skill",
    targetId: owner.id,
    promptId: standardPromptId(eventId, "guzheng", owner.id, `claim-${processedOwnerIds.length}`),
    eventId,
    skillId: "guzheng",
    stage: "guzheng_claim",
    sourceId: discarder.id,
    selectedCardIds: [...recordedCardIds],
    processedPlayerIds: [...processedOwnerIds],
    targetIds: rest,
  };
  addLog(session, "card", `${owner.id} 可以发动固政，令 ${discarder.id} 收回一张本阶段弃置的手牌并获得其余牌。`);
}

function finishDiscardPhase(session: GameSession, player: GamePlayer): void {
  if (!session.turn.discardPhaseStarted || session.currentPlayerId !== player.id) {
    throw new Error("弃牌阶段收尾续体与当前回合不一致。");
  }
  if (offerQinyin(session, player)) return;
  const recordedCardIds = remainingGuzhengCardIds(session, session.turn.discardPhaseHandCardIds ?? []);
  const ownerIds = livingOpponentsInSeatOrder(session, player.id)
    .filter((candidate) => hasEffectiveSkill(session, candidate, "guzheng"))
    .map((candidate) => candidate.id);
  if (recordedCardIds.length === 0 || ownerIds.length === 0 || !player.alive) {
    clearDiscardPhaseHistory(session);
    enterEndPhase(session);
    return;
  }
  advanceGuzheng(session, player, allocateEventId(session), recordedCardIds, [], ownerIds);
}

function enterHandLimitDiscardOrEnd(session: GameSession, player: GamePlayer): void {
  const excess = Math.max(0, player.hand.length - handLimitFor(session, player.id));
  if (excess > 0) {
    session.turn.phase = "discard";
    session.turn.discardStage = "hand_limit";
    session.turn.requiredDiscardCount = excess;
    addLog(session, "turn", `${player.id} 需要按手牌上限弃置 ${excess} 张牌。`);
    return;
  }
  if (session.turn.discardPhaseStarted) finishDiscardPhase(session, player);
  else enterEndPhase(session);
}

function enterRealDiscardPhase(session: GameSession, player: GamePlayer): void {
  session.turn.discardPhaseStarted = true;
  session.turn.discardPhaseHandCardIds ??= [];
  const yongsiCount = hasEffectiveSkill(session, player, "yongsi")
    ? Math.min(livingFactionCount(session), player.hand.length)
    : 0;
  if (yongsiCount > 0) {
    session.turn.phase = "discard";
    session.turn.discardStage = "yongsi";
    session.turn.requiredDiscardCount = yongsiCount;
    addLog(session, "turn", `${player.id} 的庸肆在弃牌阶段开始时生效，须先弃置 ${yongsiCount} 张手牌。`);
    return;
  }
  enterHandLimitDiscardOrEnd(session, player);
}

function continueBeforeDiscardAfterQiaobian(session: GameSession): void {
  const player = getLivingPlayer(session, session.currentPlayerId);
  const excess = Math.max(0, player.hand.length - handLimitFor(session, player.id));
  const hasYongsiDiscard = hasEffectiveSkill(session, player, "yongsi") && player.hand.length > 0 && livingFactionCount(session) > 0;
  if (excess > 0 || hasYongsiDiscard) {
    if (
      hasEffectiveSkill(session, player, "keji") &&
      !session.turn.slashUsed &&
      !session.turn.slashRespondedInPlayPhase
    ) {
      session.turn.phase = "respond";
      session.pendingResponse = {
        type: "skill_choice",
        targetId: player.id,
        skillId: "keji",
        resume: { type: "enter_discard", playerId: player.id, count: excess },
      };
      addLog(session, "turn", `${player.id} 可以发动克己跳过弃牌阶段。`);
      return;
    }
    enterRealDiscardPhase(session, player);
    return;
  }
  enterEndPhase(session);
}

function enterDiscardOrEnd(session: GameSession): void {
  const player = getLivingPlayer(session, session.currentPlayerId);
  const excess = Math.max(0, player.hand.length - handLimitFor(session, player.id));
  const hasYongsiDiscard = hasEffectiveSkill(session, player, "yongsi") && player.hand.length > 0 && livingFactionCount(session) > 0;
  if ((excess > 0 || hasYongsiDiscard) && offerQiaobianBeforePhase(session, player, "discard")) return;
  continueBeforeDiscardAfterQiaobian(session);
}

function enterActualPlayPhase(session: GameSession, player: GamePlayer): void {
  session.pendingResponse = null;
  session.turn.phase = "play";
  const context = jilueContext(session, player);
  if (!context.skillEffective || !context.awakened || context.renMarks < 1 ||
      hasEffectiveSkill(session, player, "wansha")) return;
  const plan = planJilueWansha({
    context: { ...context, currentPlayerId: session.currentPlayerId, phase: "play" },
    atPlayPhaseStart: true,
    alreadyActiveThisTurn: false,
  });
  if (!plan.ok) throw new Error(plan.detail);
  const eventId = allocateEventId(session);
  session.turn.phase = "respond";
  session.pendingResponse = {
    type: "standard_skill",
    targetId: player.id,
    promptId: standardPromptId(eventId, "jilue", player.id, "wansha"),
    eventId,
    skillId: "jilue",
    stage: "jilue_wansha",
    requestedCount: context.renMarks,
  };
  addLog(session, "turn", `${player.id} 可以消耗 1 枚忍标记发动极略·完杀，持续至本回合结束。`);
}

function continueBeforePlayAfterQiaobian(session: GameSession, player: GamePlayer): void {
  const targetIds = shensuTargetIds(session, player, "play");
  const equipmentIds = ownedCards(player).filter((card) => card.category === "equipment").map((card) => card.id);
  if (hasEffectiveSkill(session, player, "shensu") && equipmentIds.length > 0 && targetIds.length > 0) {
    const eventId = allocateEventId(session);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: player.id,
      promptId: standardPromptId(eventId, "shensu", player.id, "play"),
      eventId,
      skillId: "shensu",
      stage: "shensu_play",
    };
    addLog(session, "turn", `${player.id} 可以发动神速，弃置一张装备牌并跳过出牌阶段。`);
    return;
  }
  enterActualPlayPhase(session, player);
}

function continueBeforePlayAfterFangquan(session: GameSession, player: GamePlayer): void {
  session.pendingResponse = null;
  session.turn.phase = "play";
  if (offerQiaobianBeforePhase(session, player, "play")) return;
  continueBeforePlayAfterQiaobian(session, player);
}

function enterBeforePlayPhase(session: GameSession, player: GamePlayer): void {
  if (session.turn.skipPlay) {
    addLog(session, "turn", `${player.id} 跳过出牌阶段。`);
    enterDiscardOrEnd(session);
    return;
  }
  if (hasEffectiveSkill(session, player, "fangquan")) {
    const eventId = allocateEventId(session);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: player.id,
      promptId: standardPromptId(eventId, "fangquan", player.id, "skip"),
      eventId,
      skillId: "fangquan",
      stage: "fangquan_skip",
    };
    addLog(session, "turn", `${player.id} 可以发动放权跳过出牌阶段。`);
    return;
  }
  continueBeforePlayAfterFangquan(session, player);
}

function finishDrawPhase(session: GameSession, player: GamePlayer, drawPhaseOccurred = true): void {
  const stars = player.extraPiles[QIXING_PILE_ID] ?? [];
  if (drawPhaseOccurred && qixingInitialized(session, player) && hasEffectiveSkill(session, player, "qixing") && stars.length > 0) {
    const eventId = allocateEventId(session);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: player.id,
      promptId: standardPromptId(eventId, "qixing", player.id, "exchange"),
      eventId,
      skillId: "qixing",
      stage: "qixing_exchange",
      handCardIds: player.hand.map((card) => card.id),
      starCardIds: stars.map((card) => card.id),
    };
    addLog(session, "turn", `${player.id} 可以在摸牌阶段结束时交换任意等量的手牌与星。`);
    return;
  }
  enterBeforePlayPhase(session, player);
}

function finishNormalDrawPhase(session: GameSession, player: GamePlayer): void {
  if (session.turn.haoshiActive) {
    const analysis = analyzeHaoshiTransfer({
      ownerId: player.id,
      ownerHandCardIds: player.hand.map((card) => card.id),
      otherPlayers: session.players
        .filter((candidate) => candidate.id !== player.id)
        .map((candidate) => ({ id: candidate.id, alive: candidate.alive, handCount: candidate.hand.length })),
    });
    if (!analysis.ok) throw new Error(analysis.detail);
    if (analysis.value.transferRequired) {
      const eventId = allocateEventId(session);
      session.turn.phase = "respond";
      session.pendingResponse = {
        type: "standard_skill",
        targetId: player.id,
        promptId: standardPromptId(eventId, "haoshi", player.id, "transfer"),
        eventId,
        skillId: "haoshi",
        stage: "haoshi_transfer",
      };
      addLog(session, "card", `${player.id} 因好施须将一半手牌交给手牌数最少的一名其他角色。`);
      return;
    }
  }
  session.turn.haoshiActive = false;
  finishDrawPhase(session, player);
}

function moveLightningToNextPlayer(session: GameSession, lightning: Card, source: GamePlayer): void {
  const target = livingOpponentsInSeatOrder(session, source.id)
    .find((candidate) =>
      !candidate.judgment.some((card) => card.kind === "shan_dian") &&
      !isWeimuProhibited(session, source, lightning, candidate, "delayed_trick_transfer")
    );
  if (!target) {
    session.discardPile.push(lightning);
    addLog(session, "card", "闪电没有可转移目标，进入弃牌堆。");
    return;
  }
  target.judgment.push(lightning);
  addLog(session, "card", `闪电判定未命中，移动到 ${target.id} 的判定区。`);
}

function continueNormalDrawModifiers(session: GameSession, player: GamePlayer): void {
  session.pendingResponse = null;
  session.turn.phase = "draw";
  if (hasEffectiveSkill(session, player, "luoyi")) {
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "skill_choice",
      targetId: player.id,
      skillId: "luoyi",
      resume: { type: "finish_draw", playerId: player.id },
    };
    addLog(session, "turn", `${player.id} 可以发动裸衣，少摸一张牌以强化本回合的杀和决斗。`);
    return;
  }
  if (hasEffectiveSkill(session, player, "yingzi")) {
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "skill_choice",
      targetId: player.id,
      skillId: "yingzi",
      resume: { type: "finish_draw", playerId: player.id },
    };
    addLog(session, "turn", `${player.id} 可以在摸牌阶段发动英姿多摸一张牌。`);
    return;
  }
  const drawn = drawCards(session, player, drawPhaseCardCount(session, player, session.turn.haoshiActive ? 2 : 0));
  if (hasEffectiveSkill(session, player, "yongsi")) {
    addLog(session, "card", `${player.id} 的庸肆按 ${livingFactionCount(session)} 个存活势力增加摸牌数。`);
  }
  addLog(session, "card", `${player.id} 摸了 ${drawn} 张牌。`);
  finishNormalDrawPhase(session, player);
}

function continueDrawPhaseAfterShelie(session: GameSession, player: GamePlayer): void {
  session.pendingResponse = null;
  session.turn.phase = "draw";
  const haoshi = evaluateHaoshiActivation({
    context: forestSkillContext(session, player, "haoshi"),
    phase: session.turn.phase,
    drawPhaseAvailable: !session.turn.skipDraw,
  });
  if (haoshi.ok) {
    const eventId = allocateEventId(session);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: player.id,
      promptId: standardPromptId(eventId, "haoshi", player.id, "draw"),
      eventId,
      skillId: "haoshi",
      stage: "haoshi_draw",
    };
    addLog(session, "turn", `${player.id} 可以发动好施，本阶段额外摸两张牌。`);
    return;
  }
  continueNormalDrawModifiers(session, player);
}

function continueDrawPhaseAfterTuxi(session: GameSession, player: GamePlayer): void {
  session.pendingResponse = null;
  session.turn.phase = "draw";
  const activation = evaluateShelieActivation({
    context: godPhaseContext(session, player, "shelie"),
    drawPhaseAvailable: !session.turn.skipDraw,
    decision: "replace_draw",
  });
  if (activation.ok && session.deck.length + session.discardPile.length >= activation.value.revealCount) {
    const eventId = allocateEventId(session);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: player.id,
      promptId: standardPromptId(eventId, "shelie", player.id, "invoke"),
      eventId,
      skillId: "shelie",
      stage: "shelie_invoke",
    };
    addLog(session, "turn", `${player.id} 可以发动涉猎，展示牌堆顶五张牌并替代摸牌。`);
    return;
  }
  continueDrawPhaseAfterShelie(session, player);
}

function continueDrawPhaseAfterShuangxiong(session: GameSession, player: GamePlayer): void {
  session.pendingResponse = null;
  session.turn.phase = "draw";
  if (hasEffectiveSkill(session, player, "tuxi") && livingOpponentsInSeatOrder(session, player.id).some((target) => target.hand.length > 0)) {
    const eventId = allocateEventId(session);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: player.id,
      promptId: standardPromptId(eventId, "tuxi", player.id, "select"),
      eventId,
      skillId: "tuxi",
      stage: "tuxi_select",
    };
    addLog(session, "turn", `${player.id} 可以发动突袭，以获得至多两名其他角色的各一张手牌并替代摸牌。`);
    return;
  }
  continueDrawPhaseAfterTuxi(session, player);
}

function continueDrawPhaseAfterZaiqi(session: GameSession, player: GamePlayer): void {
  session.pendingResponse = null;
  session.turn.phase = "draw";
  if (hasEffectiveSkill(session, player, "shuangxiong") && session.deck.length + session.discardPile.length > 0) {
    const eventId = allocateEventId(session);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: player.id,
      promptId: standardPromptId(eventId, "shuangxiong", player.id, "draw"),
      eventId,
      skillId: "shuangxiong",
      stage: "shuangxiong_draw",
    };
    addLog(session, "turn", `${player.id} 可以发动双雄，以判定并获得判定牌替代摸牌。`);
    return;
  }
  continueDrawPhaseAfterShuangxiong(session, player);
}

function continueDrawPhaseAfterQiaobian(session: GameSession, player: GamePlayer): void {
  session.pendingResponse = null;
  session.turn.phase = "draw";
  const zaiqi = evaluateZaiqiActivation({
    context: forestSkillContext(session, player, "zaiqi"),
    phase: session.turn.phase,
    drawPhaseAvailable: !session.turn.skipDraw,
    ownerHp: player.hp,
    ownerMaxHp: player.maxHp,
  });
  if (zaiqi.ok && session.deck.length + session.discardPile.length >= zaiqi.value.revealCount) {
    const eventId = allocateEventId(session);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: player.id,
      promptId: standardPromptId(eventId, "zaiqi", player.id, "draw"),
      eventId,
      skillId: "zaiqi",
      stage: "zaiqi_draw",
    };
    addLog(session, "turn", `${player.id} 可以发动再起，展示等同于已损失体力值的牌并替代摸牌。`);
    return;
  }
  continueDrawPhaseAfterZaiqi(session, player);
}

function enterBeforeDrawPhase(session: GameSession, player: GamePlayer): void {
  session.pendingResponse = null;
  session.turn.phase = "draw";
  if (session.turn.skipDraw) {
    addLog(session, "turn", `${player.id} 跳过摸牌阶段。`);
    finishDrawPhase(session, player, false);
    return;
  }
  if (offerQiaobianBeforePhase(session, player, "draw")) return;
  continueDrawPhaseAfterQiaobian(session, player);
}

/** Resume after prepare hooks; this must never re-offer prepare skills. */
function continueJudgmentPhase(session: GameSession): void {
  if (session.status === "finished") return;
  const player = getLivingPlayer(session, session.currentPlayerId);
  session.pendingResponse = null;
  session.turn.phase = "judgment";
  const delayed = player.judgment.shift();
  if (delayed) {
    const pattern: JudgmentPattern = delayed.kind === "le_bu_si_shu"
      ? { suits: ["heart"] }
      : delayed.kind === "bing_liang_cun_duan"
        ? { suits: ["club"] }
        : { suits: ["spade"], minimumRank: 2, maximumRank: 9 };
    beginStandardJudgment(
      session,
      player,
      { type: "delayed_trick", id: delayed.kind },
      pattern,
      { type: "delayed_trick", playerId: player.id, delayedCard: cloneCard(delayed) },
    );
    return;
  }
  enterBeforeDrawPhase(session, player);
}

function continueBeforeJudgmentAfterQiaobian(session: GameSession, player: GamePlayer): void {
  session.pendingResponse = null;
  session.turn.phase = "judgment";
  if (hasEffectiveSkill(session, player, "shensu") && shensuTargetIds(session, player, "judgment_and_draw").length > 0) {
    const eventId = allocateEventId(session);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: player.id,
      promptId: standardPromptId(eventId, "shensu", player.id, "judgment-draw"),
      eventId,
      skillId: "shensu",
      stage: "shensu_judgment_draw",
    };
    addLog(session, "turn", `${player.id} 可以发动神速，跳过判定阶段和摸牌阶段。`);
    return;
  }
  continueJudgmentPhase(session);
}

function enterBeforeJudgmentPhase(session: GameSession, player: GamePlayer): void {
  session.pendingResponse = null;
  session.turn.phase = "judgment";
  if (offerQiaobianBeforePhase(session, player, "judgment")) return;
  continueBeforeJudgmentAfterQiaobian(session, player);
}

function continuePrepareSkillsAfterYinghun(session: GameSession, player: GamePlayer): void {
  session.pendingResponse = null;
  session.turn.phase = "prepare";
  if (hasEffectiveSkill(session, player, "luoshen")) {
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "skill_choice",
      targetId: player.id,
      skillId: "luoshen",
      resume: { type: "continue_judgment", playerId: player.id },
      iteration: 0,
    };
    addLog(session, "turn", `${player.id} 可以在准备阶段发动洛神进行判定。`);
    return;
  }
  enterBeforeJudgmentPhase(session, player);
}

function continuePrepareSkills(session: GameSession, player: GamePlayer): void {
  session.pendingResponse = null;
  session.turn.phase = "prepare";
  if (hasEffectiveSkill(session, player, "yinghun") && player.hp < player.maxHp &&
    session.players.some((candidate) => candidate.alive && candidate.id !== player.id)) {
    const eventId = allocateEventId(session);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: player.id,
      promptId: standardPromptId(eventId, "yinghun", player.id, "select"),
      eventId,
      skillId: "yinghun",
      stage: "yinghun_select",
    };
    addLog(session, "turn", `${player.id} 可以在准备阶段发动英魂。`);
    return;
  }
  continuePrepareSkillsAfterYinghun(session, player);
}

function turnOverLivePlayer(session: GameSession, playerId: PlayerId): GamePlayer {
  const index = session.players.findIndex((candidate) => candidate.id === playerId);
  const player = index >= 0 ? session.players[index] : undefined;
  if (!player?.alive) ruleError("INVALID_TARGET", "只有存活角色可以翻面。");
  const updated: GamePlayer = { ...player, faceUp: !player.faceUp };
  session.players[index] = updated;
  return updated;
}

/** Authoritative live operation; callers receive a cloned transition and cannot mutate the input session. */
export function turnOverGamePlayer(session: GameSession, playerId: PlayerId): GameSession {
  if (session.status === "finished") ruleError("GAME_FINISHED", "游戏已经结束。");
  const next = cloneSession(session);
  const player = turnOverLivePlayer(next, playerId);
  addLog(next, "turn", `${player.id} 翻面为${player.faceUp ? "正面朝上" : "背面朝上"}。`);
  return next;
}

function applyAwakeningGrant(
  session: GameSession,
  player: GamePlayer,
  awakeningSkillId: Extract<GeneralSkillId, "zaoxian" | "zhiji" | "ruoyu" | "hunzi" | "baiyin">,
  grantedSkillIds: readonly GeneralSkillId[],
  eventId: number,
): void {
  awakenSkill(session.completeRules.lifecycle, player.id, awakeningSkillId, eventId);
  for (const skillId of grantedSkillIds) {
    grantSkill(session.completeRules.lifecycle, {
      ownerId: player.id,
      skillId,
      sourcePlayerId: player.id,
      sourceSkillId: awakeningSkillId,
      expiry: { type: "permanent" },
    });
  }
}

function continuePrepareAfterAwakenings(session: GameSession, player: GamePlayer): void {
  session.pendingResponse = null;
  session.turn.phase = "prepare";
  if (hasEffectiveSkill(session, player, "guanxing")) {
    const eventId = allocateEventId(session);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: player.id,
      promptId: standardPromptId(eventId, "guanxing", player.id, "invoke"),
      eventId,
      skillId: "guanxing",
      stage: "invoke",
    };
    addLog(session, "turn", `${player.id} 可以在准备阶段发动观星。`);
    return;
  }
  continuePrepareSkills(session, player);
}

function continuePrepareAwakenings(session: GameSession, player: GamePlayer): void {
  session.pendingResponse = null;
  session.turn.phase = "prepare";
  if (hasEffectiveSkill(session, player, "zaoxian") &&
      !hasAwakened(session.completeRules.lifecycle, player.id, "zaoxian") &&
      (player.extraPiles.field ?? []).length >= 3 && player.maxHp > 1) {
    const plan = planZaoxian({
      ownerId: player.id,
      currentPlayerId: session.currentPlayerId,
      atPreparePhaseStart: true,
      ownerAlive: player.alive,
      skillEffective: true,
      alreadyAwakened: false,
      fieldCount: (player.extraPiles.field ?? []).length,
      hp: player.hp,
      maxHp: player.maxHp,
    });
    if (!plan.ok) throw new Error(plan.detail);
    const eventId = allocateEventId(session);
    player.maxHp = plan.value.maxHpAfter;
    player.hp = plan.value.hpAfter;
    applyAwakeningGrant(session, player, "zaoxian", plan.value.grantSkillIds, eventId);
    addLog(session, "turn", `${player.id} 的凿险觉醒，减 1 点体力上限并获得急袭。`);
  }

  if (hasEffectiveSkill(session, player, "baiyin") &&
      !hasAwakened(session.completeRules.lifecycle, player.id, "baiyin") &&
      player.maxHp > 1) {
    const renMarks = markCount(session.completeRules.lifecycle, {
      ownerId: player.id,
      markId: "ren",
      sourcePlayerId: player.id,
      sourceSkillId: "renjie",
    });
    if (renMarks >= 4) {
      const plan = planBaiyin({
        context: godPhaseContext(session, player, "baiyin"),
        alreadyAwakened: false,
        renMarks,
        ownerHp: player.hp,
        ownerMaxHp: player.maxHp,
      });
      if (!plan.ok) throw new Error(plan.detail);
      const eventId = allocateEventId(session);
      player.maxHp = plan.value.maxHpAfter;
      player.hp = plan.value.hpAfter;
      applyAwakeningGrant(session, player, "baiyin", plan.value.grantSkillIds, eventId);
      addLog(session, "turn", `${player.id} 的拜印觉醒，减 1 点体力上限并获得极略。`);
    }
  }

  if (hasEffectiveSkill(session, player, "zhiji") &&
      !hasAwakened(session.completeRules.lifecycle, player.id, "zhiji") &&
      player.hand.length === 0 && player.maxHp > 1) {
    const eventId = allocateEventId(session);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: player.id,
      promptId: standardPromptId(eventId, "zhiji", player.id, "choice"),
      eventId,
      skillId: "zhiji",
      stage: "zhiji_choice",
    };
    addLog(session, "turn", `${player.id} 的志继觉醒，须选择回复 1 点体力或摸两张牌。`);
    return;
  }

  if (hasEffectiveSkill(session, player, "ruoyu") && player.role === "lord" &&
      !hasAwakened(session.completeRules.lifecycle, player.id, "ruoyu") && player.hp > 0 &&
      session.players.filter((candidate) => candidate.alive).every((candidate) => candidate.hp >= player.hp)) {
    const plan = planRuoyu({
      ownerId: player.id,
      currentPlayerId: session.currentPlayerId,
      atPreparePhaseStart: true,
      ownerAlive: player.alive,
      skillEffectiveAsLord: true,
      ownerIsLord: true,
      alreadyAwakened: false,
      hp: player.hp,
      maxHp: player.maxHp,
      livingPlayerHpValues: session.players.filter((candidate) => candidate.alive).map((candidate) => candidate.hp),
    });
    if (!plan.ok) throw new Error(plan.detail);
    const eventId = allocateEventId(session);
    player.maxHp = plan.value.maxHpAfter;
    player.hp = plan.value.hpAfter;
    applyAwakeningGrant(session, player, "ruoyu", plan.value.grantSkillIds, eventId);
    addLog(session, "turn", `${player.id} 的若愚觉醒，加 1 点体力上限、回复 1 点体力并获得激将。`);
  }

  if (hasEffectiveSkill(session, player, "hunzi") &&
      !hasAwakened(session.completeRules.lifecycle, player.id, "hunzi") &&
      player.hp === 1 && player.maxHp > 1) {
    const plan = planHunzi({
      ownerId: player.id,
      currentPlayerId: session.currentPlayerId,
      atPreparePhaseStart: true,
      ownerAlive: player.alive,
      skillEffective: true,
      alreadyAwakened: false,
      hp: player.hp,
      maxHp: player.maxHp,
    });
    if (!plan.ok) throw new Error(plan.detail);
    const eventId = allocateEventId(session);
    player.maxHp = plan.value.maxHpAfter;
    player.hp = plan.value.hpAfter;
    applyAwakeningGrant(session, player, "hunzi", plan.value.grantSkillIds, eventId);
    addLog(session, "turn", `${player.id} 的魂姿觉醒，减 1 点体力上限并获得英姿、英魂。`);
  }
  continuePrepareAfterAwakenings(session, player);
}

function beginTurnStart(session: GameSession): void {
  if (session.status === "finished") return;
  if (offerMissingInitialHuashen(session)) return;
  const player = getLivingPlayer(session, session.currentPlayerId);
  expireQixingWeatherFromSource(session, player.id, "owner_next_turn_start");
  session.pendingResponse = null;
  if (!player.faceUp) {
    const restored = turnOverLivePlayer(session, player.id);
    addLog(session, "turn", `${restored.id} 在回合开始时翻回正面并跳过整个回合。`);
    beginNextTurn(session);
    return;
  }
  if (offerHuashenSwitch(session, player, "huashen_turn_start")) return;
  continuePrepareAwakenings(session, player);
}

function beginNextTurn(session: GameSession): void {
  if (session.pendingResponse?.type === "standard_skill" &&
      session.pendingResponse.skillId === "lianpo" &&
      session.pendingResponse.stage === "lianpo_choice") {
    return;
  }
  if (session.turn.phase !== "end") {
    // Death/forfeit and committed-card continuations may discover that the
    // active player is gone at many different exit points. Funnel every such
    // path through the same turn-end lifecycle and Lianpo boundary before the
    // seat cursor advances.
    completeTurn(session, getPlayer(session, session.currentPlayerId));
    return;
  }
  const queuedExtraTurns = [...(session.turn.queuedExtraTurns ?? [])];
  const normalTurnAnchorPlayerId = session.turn.normalTurnAnchorPlayerId ?? session.currentPlayerId;
  let extraTurn: QueuedExtraTurn | null = null;
  while (queuedExtraTurns.length > 0) {
    const candidate = queuedExtraTurns.shift()!;
    if (!session.players.some((player) => player.id === candidate.playerId) ||
        !session.players.some((player) => player.id === candidate.normalTurnAnchorPlayerId) ||
        candidate.normalTurnAnchorPlayerId !== normalTurnAnchorPlayerId ||
        !Number.isSafeInteger(candidate.grantedByTurnId) || candidate.grantedByTurnId <= 0 ||
        candidate.grantedByTurnId > session.turn.number ||
        (candidate.sourceSkillId !== "fangquan" && candidate.sourceSkillId !== "lianpo")) {
      throw new Error("额外回合队列或正常座次锚点被篡改。");
    }
    if (getPlayer(session, candidate.playerId).alive) {
      extraTurn = candidate;
      break;
    }
  }
  const nextPlayer = extraTurn
    ? getLivingPlayer(session, extraTurn.playerId)
    : nextLivingPlayer(session, normalTurnAnchorPlayerId);
  session.currentPlayerId = nextPlayer.id;
  session.turn = {
    number: session.turn.number + 1,
    playerId: nextPlayer.id,
    phase: "prepare",
    slashUsed: false,
    wineUsed: false,
    slashDamageBonus: 0,
    requiredDiscardCount: 0,
    discardStage: "hand_limit",
    skipDraw: false,
    skipPlay: false,
    luoyiActive: false,
    haoshiActive: false,
    shuangxiongJudgmentColor: null,
    slashRespondedInPlayPhase: false,
    activeSlashUses: 0,
    tianyiOutcome: null,
    skillUseCounts: {},
    rendeGivenCount: 0,
    rendeRecovered: false,
    normalTurnAnchorPlayerId: extraTurn ? extraTurn.normalTurnAnchorPlayerId : null,
    queuedExtraTurns,
    fangquanSkippedPlay: false,
    discardPhaseStarted: false,
    discardPhaseHandCardIds: [],
    qinyinInvoked: false,
    qinyinEventId: null,
    lianpoArmedOwnerIds: [],
  };
  addLog(session, "turn", `第 ${session.turn.number} 回合：${nextPlayer.id} 开始${extraTurn ? "额外" : ""}行动。`);
  beginTurnStart(session);
}

function cloneCard(card: Card): Card {
  const definition = getCardDefinition(card.kind);
  return {
    id: card.id,
    kind: card.kind,
    // Fallbacks let a persisted v1 room created before card metadata was
    // introduced finish safely after a rolling deployment.
    name: card.name ?? definition.name,
    category: card.category ?? definition.category,
    suit: card.suit ?? "spade",
    rank: card.rank ?? 1,
  };
}

function cloneTurn(turn: TurnState): TurnState {
  return {
    ...turn,
    wineUsed: turn.wineUsed ?? false,
    slashDamageBonus: turn.slashDamageBonus ?? 0,
    discardStage: turn.discardStage ?? "hand_limit",
    skipDraw: turn.skipDraw ?? false,
    skipPlay: turn.skipPlay ?? false,
    luoyiActive: turn.luoyiActive ?? false,
    haoshiActive: turn.haoshiActive ?? false,
    shuangxiongJudgmentColor: turn.shuangxiongJudgmentColor ?? null,
    slashRespondedInPlayPhase: turn.slashRespondedInPlayPhase ?? false,
    activeSlashUses: turn.activeSlashUses ?? (turn.slashUsed ? 1 : 0),
    tianyiOutcome: turn.tianyiOutcome ?? null,
    skillUseCounts: { ...(turn.skillUseCounts ?? {}) },
    rendeGivenCount: turn.rendeGivenCount ?? 0,
    rendeRecovered: turn.rendeRecovered ?? false,
    normalTurnAnchorPlayerId: turn.normalTurnAnchorPlayerId ?? null,
    queuedExtraTurns: (turn.queuedExtraTurns ?? []).map((entry) => ({ ...entry })),
    fangquanSkippedPlay: turn.fangquanSkippedPlay ?? false,
    discardPhaseStarted: turn.discardPhaseStarted ?? false,
    discardPhaseHandCardIds: [...(turn.discardPhaseHandCardIds ?? [])],
    qinyinInvoked: turn.qinyinInvoked ?? false,
    qinyinEventId: turn.qinyinEventId ?? null,
    lianpoArmedOwnerIds: [...(turn.lianpoArmedOwnerIds ?? [])],
  };
}

function cloneTrickEffect(effect: PendingTrickEffect): PendingTrickEffect {
  if (effect.type === "mass_attack") {
    return {
      type: "mass_attack",
      pending: {
        ...effect.pending,
        damageCardIds: [...(effect.pending.damageCardIds ?? [effect.pending.cardId])],
        remainingTargetIds: [...effect.pending.remainingTargetIds],
      },
    };
  }
  if (effect.type === "peach_garden" || effect.type === "iron_chain") {
    return { ...effect, remainingTargetIds: [...effect.remainingTargetIds] };
  }
  if (effect.type === "amazing_grace") {
    return {
      ...effect,
      pool: effect.pool.map(cloneCard),
      remainingTargetIds: [...effect.remainingTargetIds],
    };
  }
  return { ...effect };
}

function cloneWumouContinuation(continuation: WumouContinuation): WumouContinuation {
  if (continuation.type === "trick_effect") {
    return { ...continuation, effect: cloneTrickEffect(continuation.effect) as typeof continuation.effect };
  }
  if (continuation.type === "finish_mass_attack") {
    return { ...continuation, damageCardIds: [...continuation.damageCardIds] };
  }
  if (continuation.type === "nullification") {
    return {
      ...continuation,
      pending: {
        ...continuation.pending,
        remainingResponderIds: [...continuation.pending.remainingResponderIds],
        effect: cloneTrickEffect(continuation.pending.effect),
      },
    };
  }
  return { ...continuation };
}

function cloneShenfenContinuation(continuation: ShenfenContinuation): ShenfenContinuation {
  return { ...continuation, targetIds: [...continuation.targetIds] };
}

function cloneYeyanContinuation(continuation: YeyanContinuation): YeyanContinuation {
  return {
    ...continuation,
    costCardIds: [...continuation.costCardIds],
    allocations: continuation.allocations.map((allocation) => ({ ...allocation })),
  };
}

function cloneSlashCompletion(value: SlashResolutionContinuation | undefined): SlashResolutionContinuation {
  if (value?.type === "turn_flow") return { ...value };
  if (value?.type === "luanwu") return {
    ...value,
    processedActorIds: [...value.processedActorIds],
    remainingActorIds: [...value.remainingActorIds],
  };
  return { type: "default" };
}

function cloneSlashPending(pending: Extract<PendingResponse, { type: "slash" }>): Extract<PendingResponse, { type: "slash" }> {
  return {
    ...pending,
    declinedLordSkillIds: [...(pending.declinedLordSkillIds ?? [])],
    slashKind: pending.slashKind ?? "slash",
    damage: pending.damage ?? 1,
    nature: pending.nature ?? "normal",
    color: pending.color ?? "colorless",
    damageCardIds: [...(pending.damageCardIds ?? [pending.cardId])],
    remainingTargetIds: [...(pending.remainingTargetIds ?? [])],
    zhuQueChecked: pending.zhuQueChecked ?? true,
    ciXiongChecked: pending.ciXiongChecked ?? true,
    requiredDodgeCount: pending.requiredDodgeCount ?? 1,
    dodgesPlayed: pending.dodgesPlayed ?? 0,
    liuliCheckedPlayerIds: [...(pending.liuliCheckedPlayerIds ?? [])],
    xiangleCheckedPlayerIds: [...(pending.xiangleCheckedPlayerIds ?? [])],
    jiangProcessedPlayerIds: [...(pending.jiangProcessedPlayerIds ?? [])],
    liegongChecked: pending.liegongChecked ?? false,
    tieqiChecked: pending.tieqiChecked ?? false,
    ...(pending.useProvenance ? { useProvenance: { ...pending.useProvenance } } : {}),
    excludedRedirectTargetIds: [...(pending.excludedRedirectTargetIds ?? [pending.attackerId, pending.targetId, ...pending.remainingTargetIds])],
    dodgeProhibited: pending.dodgeProhibited ?? false,
    completion: cloneSlashCompletion(pending.completion),
  };
}

function cloneDyingResume(resume: DyingResume): DyingResume {
  if (resume.type === "mass_attack") {
    return {
      type: "mass_attack",
      pending: {
        ...resume.pending,
        damageCardIds: [...(resume.pending.damageCardIds ?? [resume.pending.cardId])],
        remainingTargetIds: [...resume.pending.remainingTargetIds],
      },
    };
  }
  if (resume.type === "chain_damage") {
    return {
      ...resume,
      damageCardIds: [...(resume.damageCardIds ?? [])],
      remainingTargetIds: [...resume.remainingTargetIds],
      finalResume: cloneDyingResume(resume.finalResume) as Exclude<DyingResume, { type: "chain_damage" | "damage_flow" }>,
    };
  }
  if (resume.type === "slash_sequence") {
    return { type: "slash_sequence", pending: cloneSlashPending(resume.pending) };
  }
  if (resume.type === "leiji") {
    return { type: "leiji", resume: cloneLeijiResume(resume.resume) };
  }
  if (resume.type === "standard_damage") {
    return { type: "standard_damage", aftermath: cloneStandardDamageAftermath(resume.aftermath) };
  }
  if (resume.type === "luanwu") {
    return {
      ...resume,
      processedActorIds: [...resume.processedActorIds],
      remainingActorIds: [...resume.remainingActorIds],
    };
  }
  if (resume.type === "damage_flow") {
    return { ...resume };
  }
  if (resume.type === "skill") {
    return { ...resume };
  }
  if (resume.type === "forest_end") {
    return { ...resume };
  }
  if (resume.type === "qinyin") {
    return { ...resume, targetIds: [...resume.targetIds] };
  }
  if (resume.type === "wumou") {
    return { ...resume, continuation: cloneWumouContinuation(resume.continuation) };
  }
  if (resume.type === "shenfen") {
    return { type: "shenfen", continuation: cloneShenfenContinuation(resume.continuation) };
  }
  if (resume.type === "yeyan") {
    return { type: "yeyan", continuation: cloneYeyanContinuation(resume.continuation) };
  }
  if (resume.type === "qiangxi") {
    return { ...resume };
  }
  if (resume.type === "guhuo") {
    return { type: "guhuo", pending: cloneGuhuoPending(resume.pending) as PendingGuhuoConsequence };
  }
  return { type: resume.type };
}

function cloneGuhuoPending(pending: PendingGuhuo): PendingGuhuo {
  const continuation = cloneGuhuoContinuation(pending.continuation);
  return pending.stage === "challenge"
    ? {
        ...pending,
        challengerIds: [...pending.challengerIds],
        remainingChallengeIds: [...pending.remainingChallengeIds],
        continuation,
      }
    : {
        ...pending,
        challengerIds: [...pending.challengerIds],
        remainingConsequenceIds: [...pending.remainingConsequenceIds],
        continuation,
      };
}

function clonePindianPending(pending: PendingPindian): PendingPindian {
  return {
    ...pending,
    frame: clonePindianFrame(pending.frame),
    continuation: pending.continuation.type === "lieren"
      ? { type: "lieren", damageOpportunity: { ...pending.continuation.damageOpportunity } }
      : { ...pending.continuation },
  };
}

function cloneDeathResolutionCompletion(completion: DeathResolutionCompletion): DeathResolutionCompletion {
  if (completion.type === "dying") {
    return { type: "dying", frameId: completion.frameId, resume: cloneDyingResume(completion.resume) };
  }
  if (completion.type === "direct") return { type: "direct", resume: cloneDyingResume(completion.resume) };
  if (completion.type === "wuhun") return { type: "wuhun", parent: clonePendingDeathResolution(completion.parent) };
  return { type: "none" };
}

function clonePendingDeathResolution(pending: PendingDeathResolution): PendingDeathResolution {
  return {
    ...pending,
    remainingOwnerIds: [...pending.remainingOwnerIds],
    completion: cloneDeathResolutionCompletion(pending.completion),
  };
}

function cloneGuhuoContinuation(continuation: PendingGuhuo["continuation"]): PendingGuhuo["continuation"] {
  return continuation.type === "use"
    ? {
        type: "use" as const,
        intent: cloneCardUseIntent(continuation.intent),
      }
    : {
        type: "respond" as const,
        pending: clonePendingResponse(continuation.pending) as GuhuoRespondablePending,
      };
}

function cloneCardUseIntent(intent: CardUseIntent): CardUseIntent {
  return {
    ...intent,
    targetIds: [...intent.targetIds],
    ...(intent.additionalPhysicalCards
      ? { additionalPhysicalCards: intent.additionalPhysicalCards.map((card) => ({ ...card })) }
      : {}),
  };
}

function cloneSkillTriggerRef(trigger: SkillTriggerRef): SkillTriggerRef {
  return { ...trigger, ...(trigger.cardIds ? { cardIds: [...trigger.cardIds] } : {}) };
}

function cloneCardUseContinuation(continuation: CardUseContinuation): CardUseContinuation {
  return {
    ...continuation,
    intent: cloneCardUseIntent(continuation.intent),
    remainingTriggers: continuation.remainingTriggers.map(cloneSkillTriggerRef),
  };
}

function clonePendingRecoveryPoint(recovery: PendingRecoveryPoint): PendingRecoveryPoint {
  return {
    ...recovery,
    ...(recovery.dyingRescue
      ? {
          dyingRescue: {
            ...recovery.dyingRescue,
            ...(recovery.dyingRescue.physicalCards
              ? { physicalCards: recovery.dyingRescue.physicalCards.map((entry) => ({ ...entry })) }
              : {}),
          },
        }
      : {}),
  };
}

function clonePendingLeijiDodge(dodge: PendingLeijiDodge): PendingLeijiDodge {
  return {
    ...dodge,
    provenance: dodge.provenance.type === "view_as"
      ? { ...dodge.provenance, physicalCardIds: [...dodge.provenance.physicalCardIds] }
      : { ...dodge.provenance },
    resume: cloneLeijiResume(dodge.resume),
  };
}

function cloneLeijiResume(resume: PendingLeijiDodge["resume"]): PendingLeijiDodge["resume"] {
  return resume.type === "slash"
    ? { type: "slash", pending: cloneSlashPending(resume.pending) }
    : {
        type: "mass_attack",
        pending: {
          ...resume.pending,
          damageCardIds: [...(resume.pending.damageCardIds ?? [resume.pending.cardId])],
          remainingTargetIds: [...resume.pending.remainingTargetIds],
          declinedLordSkillIds: [...(resume.pending.declinedLordSkillIds ?? [])],
        },
      };
}

function clonePendingResponse(pending: PendingResponse | null): PendingResponse | null {
  if (!pending) return null;
  if (pending.type === "guhuo") return cloneGuhuoPending(pending);
  if (pending.type === "pindian") return clonePindianPending(pending);
  if (pending.type === "mass_attack") {
    return {
      ...pending,
      damageCardIds: [...(pending.damageCardIds ?? [pending.cardId])],
      declinedLordSkillIds: [...(pending.declinedLordSkillIds ?? [])],
      remainingTargetIds: [...pending.remainingTargetIds],
    };
  }
  if (pending.type === "slash") {
    return cloneSlashPending(pending);
  }
  if (pending.type === "duel") {
    return {
      ...pending,
      declinedLordSkillIds: [...(pending.declinedLordSkillIds ?? [])],
      requiredSlashCount: pending.requiredSlashCount ?? 1,
      slashesPlayed: pending.slashesPlayed ?? 0,
    };
  }
  if (pending.type === "weapon_action") {
    return {
      ...pending,
      slash: cloneSlashPending(pending.slash),
      ...(pending.damageOpportunity ? { damageOpportunity: { ...pending.damageOpportunity } } : {}),
    };
  }
  if (pending.type === "nullification") {
    return {
      ...pending,
      remainingResponderIds: [...pending.remainingResponderIds],
      effect: cloneTrickEffect(pending.effect),
    };
  }
  if (pending.type === "amazing_grace_selection") {
    return {
      ...pending,
      pool: pending.pool.map(cloneCard),
      remainingTargetIds: [...pending.remainingTargetIds],
    };
  }
  if (pending.type === "dying") {
    return {
      ...pending,
      remainingResponderIds: [...pending.remainingResponderIds],
      resume: cloneDyingResume(pending.resume),
    };
  }
  if (pending.type === "lord_dispatch") {
    return {
      ...pending,
      remainingProviderIds: [...pending.remainingProviderIds],
      resume: pending.resume.type === "use_slash"
        ? {
            type: "use_slash",
            targetIds: [...pending.resume.targetIds],
            ...(pending.resume.ignoreUseLimit ? { ignoreUseLimit: true } : {}),
            ...(pending.resume.completion ? { completion: cloneSlashCompletion(pending.resume.completion) } : {}),
            ...(pending.resume.failureResume
              ? { failureResume: clonePendingResponse(pending.resume.failureResume) as PendingStandardSkill }
              : {}),
          }
        : {
            type: "respond",
            pending: clonePendingResponse(pending.resume.pending) as LordDispatchableResponse,
          },
    };
  }
  if (pending.type === "skill_choice") {
    if (pending.resume.type === "card_use") {
      return {
        ...pending,
        resume: {
          ...pending.resume,
          intent: {
            ...pending.resume.intent,
            targetIds: [...pending.resume.intent.targetIds],
          },
          remainingTriggers: pending.resume.remainingTriggers.map(cloneSkillTriggerRef),
        },
      };
    }
    if (pending.resume.type === "dying") {
      return {
        ...pending,
        resume: {
          type: "dying",
          frameId: pending.resume.frameId,
          resume: cloneDyingResume(pending.resume.resume),
          ...(pending.resume.buquLoss ? { buquLoss: { ...pending.resume.buquLoss } } : {}),
        },
      };
    }
    return { ...pending, resume: { ...pending.resume } };
  }
  if (pending.type === "standard_judgment") {
    return {
      ...pending,
      frame: cloneJudgmentFrame(pending.frame),
      context: cloneStandardJudgmentContext(pending.context),
      songweiProcessedOwnerIds: [...(pending.songweiProcessedOwnerIds ?? [])],
    };
  }
  if (pending.type === "standard_skill") {
    return {
      ...pending,
      ...(pending.aftermath ? { aftermath: cloneStandardDamageAftermath(pending.aftermath) } : {}),
      ...(pending.slash ? { slash: cloneSlashPending(pending.slash) } : {}),
      ...(pending.duel ? {
        duel: {
          ...pending.duel,
          declinedLordSkillIds: [...(pending.duel.declinedLordSkillIds ?? [])],
        },
      } : {}),
      ...(pending.cardUse ? { cardUse: cloneCardUseContinuation(pending.cardUse) } : {}),
      ...(pending.pindian ? { pindian: clonePindianPending(pending.pindian) } : {}),
      ...(pending.selectedCardIds ? { selectedCardIds: [...pending.selectedCardIds] } : {}),
      ...(pending.handCardIds ? { handCardIds: [...pending.handCardIds] } : {}),
      ...(pending.starCardIds ? { starCardIds: [...pending.starCardIds] } : {}),
      ...(pending.targetIds ? { targetIds: [...pending.targetIds] } : {}),
      ...(pending.processedPlayerIds ? { processedPlayerIds: [...pending.processedPlayerIds] } : {}),
      ...(pending.targetHandCardIds ? {
        targetHandCardIds: [
          [...pending.targetHandCardIds[0]],
          [...pending.targetHandCardIds[1]],
        ],
      } : {}),
      ...(pending.damageOpportunity ? { damageOpportunity: { ...pending.damageOpportunity } } : {}),
      ...(pending.recovery ? { recovery: clonePendingRecoveryPoint(pending.recovery) } : {}),
      ...(pending.leijiDodge ? { leijiDodge: clonePendingLeijiDodge(pending.leijiDodge) } : {}),
      ...(pending.judgment ? { judgment: cloneJudgmentFrame(pending.judgment) } : {}),
      ...(pending.deathResolution ? { deathResolution: clonePendingDeathResolution(pending.deathResolution) } : {}),
      ...(pending.wumouContinuation
        ? { wumouContinuation: cloneWumouContinuation(pending.wumouContinuation) }
        : {}),
      ...(pending.shenfenContinuation
        ? { shenfenContinuation: cloneShenfenContinuation(pending.shenfenContinuation) }
        : {}),
      ...(pending.yeyanContinuation
        ? { yeyanContinuation: cloneYeyanContinuation(pending.yeyanContinuation) }
        : {}),
    };
  }
  return { ...pending };
}

function cloneSession(session: GameSession): GameSession {
  const players = session.players.map((player) => ({
    ...player,
    hand: player.hand.map(cloneCard),
    equipment: Object.fromEntries(
      Object.entries(player.equipment ?? {}).map(([slot, card]) => [slot, cloneCard(card)]),
    ),
    judgment: (player.judgment ?? []).map(cloneCard),
    chained: player.chained ?? false,
    faceUp: player.faceUp ?? true,
    extraPiles: Object.fromEntries(
      Object.entries(player.extraPiles ?? {}).map(([pileId, cards]) => [pileId, cards.map(cloneCard)]),
    ),
    generalId: player.generalId ?? null,
    godFaction: player.godFaction ?? null,
  }));
  return {
    ...session,
    players,
    deck: session.deck.map(cloneCard),
    discardPile: session.discardPile.map(cloneCard),
    resolvingCards: (session.resolvingCards ?? []).map(cloneCard),
    virtualCardOrigins: { ...(session.virtualCardOrigins ?? {}) },
    turn: cloneTurn(session.turn),
    pendingResponse: clonePendingResponse(session.pendingResponse),
    winner: session.winner
      ? { ...session.winner, playerIds: [...session.winner.playerIds] }
      : null,
    logs: session.logs.map((log) => ({ ...log })),
    rng: { ...session.rng },
    nextUseId: session.nextUseId ?? 1,
    nextEventId: Math.max(session.nextEventId ?? 1, session.completeRules?.nextEventId ?? 1),
    afterMove: {
      queuedRecoveries: (session.afterMove?.queuedRecoveries ?? []).map(clonePendingRecoveryPoint),
      queuedTriggers: (session.afterMove?.queuedTriggers ?? []).map(cloneSkillTriggerRef),
      suspendedPhase: session.afterMove?.suspendedPhase ?? null,
      suspendedResponse: clonePendingResponse(session.afterMove?.suspendedResponse ?? null),
    },
    completeRules: (() => {
      const completeRules = migrateCompleteRulesEngineState(session.completeRules, players.map((player) => ({
        id: player.id,
        hp: player.hp,
        maxHp: player.maxHp,
        alive: player.alive,
      })));
      completeRules.nextEventId = Math.max(completeRules.nextEventId, session.nextEventId ?? 1);
      return completeRules;
    })(),
  };
}

function startPreparedGame(
  players: GamePlayer[],
  initialRng: ChaCha20State,
  config?: RoomRuleConfig,
): GameSession {
  const shuffledDeck = shuffle(createStandardDeck(), initialRng);
  const lord = players.find((player) => player.role === "lord");
  if (!lord) throw new Error("身份分配缺少主公。");

  const session: GameSession = {
    version: 1,
    revision: 0,
    status: "playing",
    players,
    deck: shuffledDeck.items,
    discardPile: [],
    resolvingCards: [],
    virtualCardOrigins: {},
    currentPlayerId: lord.id,
    turn: {
      number: 1,
      playerId: lord.id,
      phase: "prepare",
      slashUsed: false,
      wineUsed: false,
      slashDamageBonus: 0,
      requiredDiscardCount: 0,
      discardStage: "hand_limit",
      skipDraw: false,
      skipPlay: false,
      luoyiActive: false,
      haoshiActive: false,
      shuangxiongJudgmentColor: null,
      slashRespondedInPlayPhase: false,
      activeSlashUses: 0,
      tianyiOutcome: null,
      skillUseCounts: {},
      rendeGivenCount: 0,
      rendeRecovered: false,
      normalTurnAnchorPlayerId: null,
      queuedExtraTurns: [],
      fangquanSkippedPlay: false,
      discardPhaseStarted: false,
      discardPhaseHandCardIds: [],
      qinyinInvoked: false,
      qinyinEventId: null,
      lianpoArmedOwnerIds: [],
    },
    pendingResponse: null,
    winner: null,
    logs: [],
    rng: shuffledDeck.state,
    nextLogId: 1,
    nextUseId: 1,
    nextEventId: 1,
    afterMove: { queuedRecoveries: [], queuedTriggers: [], suspendedPhase: null, suspendedResponse: null },
    completeRules: createCompleteRulesEngineState(config),
  };

  addLog(session, "system", `游戏开始，共 ${players.length} 名玩家。`);
  addLog(session, "system", `${lord.id} 是主公。`);
  for (let round = 0; round < INITIAL_HAND_SIZE; round += 1) {
    for (const player of players) drawCards(session, player, 1);
  }
  addLog(session, "card", `所有玩家各摸了 ${INITIAL_HAND_SIZE} 张起始手牌。`);
  addLog(session, "turn", `第 1 回合：${lord.id} 开始行动。`);
  return initializeGameStartSkills(session);
}

function rolesFromDistribution(distribution: RoleDistribution): Role[] {
  return [
    ...Array<Role>(distribution.lord).fill("lord"),
    ...Array<Role>(distribution.loyalist).fill("loyalist"),
    ...Array<Role>(distribution.rebel).fill("rebel"),
    ...Array<Role>(distribution.renegade).fill("renegade"),
  ];
}

export function createGameFromDraft(input: {
  readonly draft: GeneralDraftState;
  readonly config: RoomRuleConfig;
}): GameSession {
  assertGeneralDraftForConfig(input.draft, input.config);
  const assignments = finalizeGeneralDraft(input.draft);
  const shuffledRoles = input.draft.roles
    ? {
        items: input.draft.playerIds.map((playerId) => input.draft.roles![playerId]!),
        state: input.draft.rng,
      }
    : shuffleRolesWithLordFirst(assignments.length, input.draft.rng);
  const assignmentsByPlayerId = new Map(assignments.map((assignment) => [assignment.playerId, assignment]));
  const players = input.draft.playerIds.map((id, seat): GamePlayer => {
    const assignment = assignmentsByPlayerId.get(id);
    const role = shuffledRoles.items[seat];
    if (!assignment || !role) throw new Error("选将结果与身份分配数量不一致。");
    const general = getGeneralDefinition(assignment.generalId);
    const maxHp = general.maxHp + (
      role === "lord" && assignments.length >= input.config.lordBonusMinimumPlayers ? 1 : 0
    );
    return {
      id,
      seat,
      role,
      generalId: general.id,
      godFaction: general.factionSelectable ? assignment.faction : null,
      hp: maxHp,
      maxHp,
      alive: true,
      faceUp: true,
      hand: [],
      equipment: {},
      judgment: [],
      chained: false,
      extraPiles: {},
    };
  });
  return startPreparedGame(players, shuffledRoles.state, input.config);
}

export function createGame(input: CreateGameInput): GameSession {
  const { playerIds } = input;
  if (playerIds.length < MIN_PLAYERS || playerIds.length > MAX_PLAYERS) {
    ruleError(
      "INVALID_PLAYER_COUNT",
      `玩家人数必须在 ${MIN_PLAYERS} 到 ${MAX_PLAYERS} 之间。`,
    );
  }
  for (const playerId of playerIds) {
    if (typeof playerId !== "string" || playerId.trim().length === 0) {
      ruleError("INVALID_PLAYER_ID", "玩家 ID 不能为空。");
    }
  }
  if (new Set(playerIds).size !== playerIds.length) {
    ruleError("DUPLICATE_PLAYER", "同一玩家不能重复加入游戏。");
  }

  let key: string;
  try {
    key = normalizeChaCha20Key(input.seed);
  } catch {
    ruleError("INVALID_SEED", "随机种子必须是 64 个十六进制字符（256 位）。");
  }
  let rng: ChaCha20State = { key, counter: 0 };
  const shuffledRoles = shuffle(rolesFor(playerIds.length), rng);
  rng = shuffledRoles.state;
  const shuffledGenerals = shuffle(DEFAULT_GENERALS, rng);
  rng = shuffledGenerals.state;
  const players: GamePlayer[] = playerIds.map((id, seat) => {
    const role = shuffledRoles.items[seat];
    if (!role) throw new Error("身份分配数量不足。");
    const general = shuffledGenerals.items[seat];
    if (!general) throw new Error("武将分配数量不足。");
    const maxHp = general.maxHp + (role === "lord" && playerIds.length > 4 ? 1 : 0);
    return {
      id,
      seat,
      role,
      generalId: general.id,
      godFaction: null,
      hp: maxHp,
      maxHp,
      alive: true,
      faceUp: true,
      hand: [],
      equipment: {},
      judgment: [],
      chained: false,
      extraPiles: {},
    };
  });

  return startPreparedGame(players, rng);
}

function assertOptionalSelfTarget(
  player: GamePlayer,
  targetId: PlayerId | undefined,
  cardLabel: string,
): void {
  if (targetId !== undefined && targetId !== player.id) {
    ruleError("INVALID_TARGET", `${cardLabel}只能对自己使用。`);
  }
}

function assertNoTarget(targetId: PlayerId | undefined, cardLabel: string): void {
  if (targetId !== undefined) {
    ruleError("INVALID_TARGET", `${cardLabel}不需要指定目标。`);
  }
}

function moveCardToResolving(session: GameSession, player: GamePlayer, cardId: CardId): Card {
  const played = removeCard(session, player, cardId);
  session.resolvingCards.push(played);
  return played;
}

function takeResolvingCard(session: GameSession, cardId: CardId): Card {
  const index = session.resolvingCards.findIndex((card) => card.id === cardId);
  if (index < 0) throw new Error(`结算区中不存在 ${cardId}。`);
  const [card] = session.resolvingCards.splice(index, 1);
  if (!card) throw new Error("移除结算牌失败。");
  return card;
}

function restoreVirtualOrigin(session: GameSession, card: Card): Card {
  const originKind = session.virtualCardOrigins[card.id];
  if (!originKind) return card;
  delete session.virtualCardOrigins[card.id];
  return {
    ...getCardDefinition(originKind),
    id: card.id,
    kind: originKind,
    suit: card.suit,
    rank: card.rank,
  };
}

function finishResolvingCards(session: GameSession): void {
  if (session.resolvingCards.length === 0) return;
  session.discardPile.push(...session.resolvingCards.map((card) => restoreVirtualOrigin(session, card)));
  session.resolvingCards = [];
}

function areOppositeGender(session: GameSession, left: GamePlayer, right: GamePlayer): boolean {
  const leftGender = genderOf(session, left);
  const rightGender = genderOf(session, right);
  return leftGender !== null && rightGender !== null && leftGender !== rightGender;
}

function completeSlashResolution(
  session: GameSession,
  pending: Extract<PendingResponse, { type: "slash" }>,
): void {
  consumeSlashResponseCommitment(session, pending);
  session.pendingResponse = null;
  finishResolvingCards(session);
  if (session.status !== "playing") return;
  const completion = pending.completion ?? { type: "default" as const };
  if (completion.type === "luanwu") {
    advanceLuanwu(session, completion);
    return;
  }
  const current = getPlayer(session, session.currentPlayerId);
  if (!current.alive) {
    beginNextTurn(session);
    return;
  }
  if (completion.type === "default") {
    session.turn.phase = "play";
    return;
  }
  if (
    completion.continuationId >= session.nextEventId ||
    completion.playerId !== current.id ||
    completion.playerId !== session.turn.playerId
  ) {
    throw new Error("Slash completion continuation is inconsistent with the current turn.");
  }
  if (completion.destination === "play") {
    session.turn.phase = "play";
  } else if (completion.destination === "before_play") {
    enterBeforePlayPhase(session, current);
  } else {
    enterDiscardOrEnd(session);
  }
}

function advanceSlashSequence(
  session: GameSession,
  pending: Extract<PendingResponse, { type: "slash" }>,
): void {
  for (const [index, playerId] of pending.remainingTargetIds.entries()) {
    const candidate = getPlayer(session, playerId);
    if (!candidate.alive) continue;
    beginSlashTarget(session, {
      ...pending,
      targetId: candidate.id,
      remainingTargetIds: pending.remainingTargetIds.slice(index + 1),
      armorAttempted: false,
      dodgesPlayed: 0,
      ciXiongChecked: false,
      liegongChecked: false,
      tieqiChecked: false,
      dodgeProhibited: false,
    });
    return;
  }
  completeSlashResolution(session, pending);
}

function liuliCardTargetIds(
  session: GameSession,
  pending: Extract<PendingResponse, { type: "slash" }>,
  owner: GamePlayer,
): Record<CardId, PlayerId[]> {
  const excluded = new Set(pending.excludedRedirectTargetIds ?? [pending.attackerId, pending.targetId, ...pending.remainingTargetIds]);
  return Object.fromEntries(ownedCards(owner).map((card) => {
    const probe = cloneSession(session);
    const probeOwner = getLivingPlayer(probe, owner.id);
    removeOwnedCard(probe, probeOwner, card.id);
    const targetIds = probe.players
      .filter((candidate) => candidate.alive && !excluded.has(candidate.id) && candidate.id !== probeOwner.id)
      .filter((candidate) => canBeSlashTarget(probe, candidate) && isInSlashRange(probe, probeOwner.id, candidate.id))
      .map((candidate) => candidate.id);
    return [card.id, targetIds];
  }));
}

function applyLiuliRedirect(
  session: GameSession,
  pending: PendingStandardSkill,
  action: Extract<GameAction, { type: "resolve_standard_skill" }>,
): void {
  const slash = pending.slash;
  if (!slash) throw new Error("流离缺少杀的逐目标续体。");
  const owner = getLivingPlayer(session, pending.targetId);
  const checked = [...new Set([...(slash.liuliCheckedPlayerIds ?? []), owner.id])];
  if (!action.activate) {
    addLog(session, "card", `${owner.id} 未发动流离。`);
    beginSlashTarget(session, { ...slash, liuliCheckedPlayerIds: checked });
    return;
  }
  if (!action.cardId || !action.targetId) ruleError("INVALID_SELECTION", "流离必须选择一张手牌或装备牌以及转移目标。");
  const legalByCard = liuliCardTargetIds(session, slash, owner);
  if (!legalByCard[action.cardId]?.includes(action.targetId)) {
    ruleError("INVALID_TARGET", "流离目标必须在弃牌后的攻击范围内，且不能是来源或已有目标。");
  }
  const cost = removeOwnedCard(session, owner, action.cardId);
  session.discardPile.push(cost);
  const redirected = getLivingPlayer(session, action.targetId);
  addLog(session, "card", `${owner.id} 发动流离，弃置一张牌并将此杀转移给 ${redirected.id}。`);
  beginSlashTarget(session, {
    ...slash,
    targetId: redirected.id,
    liuliCheckedPlayerIds: checked,
    liegongChecked: false,
    tieqiChecked: false,
    dodgeProhibited: false,
    excludedRedirectTargetIds: [...new Set([
      ...(slash.excludedRedirectTargetIds ?? [slash.attackerId, slash.targetId, ...slash.remainingTargetIds]),
      redirected.id,
    ])],
  });
}

function isLiegongEligibleForSlash(
  session: GameSession,
  pending: Extract<PendingResponse, { type: "slash" }>,
  owner: GamePlayer,
  target: GamePlayer,
): boolean {
  if (pending.sourceSkillId === "shensu") return false;
  const provenance = pending.useProvenance;
  if (!owner.alive || !target.alive || !provenance || !hasEffectiveSkill(session, owner, "liegong")) return false;
  const result = evaluateLiegong({
    skillOwnerId: owner.id,
    slashSourceId: pending.attackerId,
    turnPlayerId: provenance.turnPlayerId,
    phase: provenance.phase,
    method: provenance.method,
    slashKind: pending.slashKind,
    targetHandCount: target.hand.length,
    ownerCurrentHp: owner.hp,
    ownerAttackRange: attackRangeFor(session, owner.id),
  });
  if (!result.ok) throw new Error(`烈弓判定输入无效：${result.detail}`);
  return result.value.eligible;
}

function beginSlashTarget(
  session: GameSession,
  pending: Extract<PendingResponse, { type: "slash" }>,
): void {
  syncSlashResponseCommitment(session, pending);
  const target = getPlayer(session, pending.targetId);
  if (!target.alive) {
    advanceSlashSequence(session, pending);
    return;
  }
  const attacker = getPlayer(session, pending.attackerId);
  pending = {
    ...pending,
    requiredDodgeCount: slashRequiredDodgeCount(session, attacker, target),
  };
  updateSlashResponseCommitment(session, pending);
  const jiangProcessed = [...(pending.jiangProcessedPlayerIds ?? [])];
  if (pending.color === "red") {
    const candidates = [attacker, target];
    for (const candidate of candidates) {
      if (jiangProcessed.includes(candidate.id)) continue;
      jiangProcessed.push(candidate.id);
      pending = { ...pending, jiangProcessedPlayerIds: [...jiangProcessed] };
      updateSlashResponseCommitment(session, pending);
      if (!candidate.alive || !hasEffectiveSkill(session, candidate, "jiang")) continue;
      const plan = planJiang({
        ownerId: candidate.id,
        ownerAlive: candidate.alive,
        skillEffective: true,
        targetDesignationSettled: true,
        role: candidate.id === attacker.id ? "card_user" : "card_target",
        cardKind: pending.slashKind,
        cardSuit: "heart",
        cardUserId: attacker.id,
        targetIds: [target.id, ...pending.remainingTargetIds],
      });
      if (!plan.ok) throw new Error(plan.detail);
      const eventId = allocateEventId(session);
      session.turn.phase = "respond";
      session.pendingResponse = {
        type: "standard_skill",
        targetId: candidate.id,
        promptId: standardPromptId(eventId, "jiang", candidate.id, `slash-${pending.cardId}`),
        eventId,
        skillId: "jiang",
        stage: "jiang_invoke",
        slash: pending,
      };
      return;
    }
  }
  const liuliChecked = pending.liuliCheckedPlayerIds ?? [];
  if (!liuliChecked.includes(target.id) && hasEffectiveSkill(session, target, "liuli")) {
    const checkedPending = { ...pending, liuliCheckedPlayerIds: [...liuliChecked, target.id] };
    updateSlashResponseCommitment(session, checkedPending);
    const cardTargetIds = liuliCardTargetIds(session, checkedPending, target);
    const allowedCardIds = Object.entries(cardTargetIds).filter(([, ids]) => ids.length > 0).map(([cardId]) => cardId);
    if (allowedCardIds.length > 0) {
      const eventId = allocateEventId(session);
      session.turn.phase = "respond";
      session.pendingResponse = {
        type: "standard_skill",
        targetId: target.id,
        promptId: standardPromptId(eventId, "liuli", target.id, "redirect"),
        eventId,
        skillId: "liuli",
        stage: "liuli_redirect",
        slash: checkedPending,
      };
      return;
    }
    pending = checkedPending;
  }
  const xiangleChecked = pending.xiangleCheckedPlayerIds ?? [];
  if (!xiangleChecked.includes(target.id) && hasEffectiveSkill(session, target, "xiangle")) {
    const checkedPending = {
      ...pending,
      xiangleCheckedPlayerIds: [...xiangleChecked, target.id],
    };
    updateSlashResponseCommitment(session, checkedPending);
    if (!attacker.alive) {
      advanceSlashSequence(session, checkedPending);
      return;
    }
    const eventId = allocateEventId(session);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: attacker.id,
      promptId: standardPromptId(eventId, "xiangle", attacker.id, `target-${target.id}`),
      eventId,
      skillId: "xiangle",
      stage: "xiangle_payment",
      slash: checkedPending,
    };
    return;
  }
  if (!pending.liegongChecked) {
    const checkedPending = { ...pending, liegongChecked: true };
    updateSlashResponseCommitment(session, checkedPending);
    if (isLiegongEligibleForSlash(session, checkedPending, attacker, target)) {
      const eventId = allocateEventId(session);
      session.turn.phase = "respond";
      session.pendingResponse = {
        type: "standard_skill",
        targetId: attacker.id,
        promptId: standardPromptId(eventId, "liegong", attacker.id, `target-${target.id}`),
        eventId,
        skillId: "liegong",
        stage: "invoke",
        slash: checkedPending,
      };
      return;
    }
    pending = checkedPending;
  }
  if (!pending.tieqiChecked) {
    const checkedPending = { ...pending, tieqiChecked: true };
    updateSlashResponseCommitment(session, checkedPending);
    if (attacker.alive && hasEffectiveSkill(session, attacker, "tieqi")) {
      const eventId = allocateEventId(session);
      session.turn.phase = "respond";
      session.pendingResponse = {
        type: "standard_skill",
        targetId: attacker.id,
        promptId: standardPromptId(eventId, "tieqi", attacker.id, `target-${target.id}`),
        eventId,
        skillId: "tieqi",
        stage: "invoke",
        slash: checkedPending,
      };
      return;
    }
    pending = checkedPending;
  }
  const weapon = attacker.alive ? attacker.equipment.weapon : undefined;
  if (!pending.zhuQueChecked) {
    const checked = { ...pending, zhuQueChecked: true };
    updateSlashResponseCommitment(session, checked);
    if (weapon?.kind === "zhu_que_yu_shan" && pending.slashKind === "slash") {
      session.turn.phase = "respond";
      session.pendingResponse = {
        type: "weapon_action",
        weaponKind: "zhu_que_yu_shan",
        stage: "zhuque_convert",
        attackerId: attacker.id,
        targetId: attacker.id,
        victimId: target.id,
        slash: checked,
      };
      return;
    }
    pending = checked;
  }
  if (!pending.ciXiongChecked) {
    const checked = { ...pending, ciXiongChecked: true };
    updateSlashResponseCommitment(session, checked);
    if (weapon?.kind === "ci_xiong_shuang_gu_jian" && areOppositeGender(session, attacker, target)) {
      session.turn.phase = "respond";
      session.pendingResponse = {
        type: "weapon_action",
        weaponKind: "ci_xiong_shuang_gu_jian",
        stage: "cixiong_activate",
        attackerId: attacker.id,
        targetId: attacker.id,
        victimId: target.id,
        slash: checked,
      };
      return;
    }
    pending = checked;
  }
  const armorIgnored = weapon?.kind === "qing_gang_jian" || armorInvalidatedByWuqian(session, target.id);
  const next = { ...pending, armorIgnored };
  updateSlashResponseCommitment(session, next);
  const armor = target.equipment.armor;
  const blockedByArmor = !armorIgnored && (
    (armor?.kind === "ren_wang_dun" && next.color === "black") ||
    (armor?.kind === "teng_jia" && next.slashKind === "slash")
  );
  if (blockedByArmor) {
    addLog(session, "card", `${target.id} 的${armor.name}令${cardName(next.slashKind)}无效。`);
    advanceSlashSequence(session, next);
    return;
  }
  if (next.dodgeProhibited) {
    addLog(session, "card", `${target.id} 不能以任何方式使用或打出闪。`);
    beginSlashDamage(session, next);
    return;
  }
  session.turn.phase = "respond";
  session.pendingResponse = next;
}

function luoyiDamageBonus(session: GameSession, player: GamePlayer): number {
  return session.currentPlayerId === player.id && session.turn.luoyiActive && hasEffectiveSkill(session, player, "luoyi") ? 1 : 0;
}

function wushuangResponseCount(session: GameSession, player: GamePlayer): number {
  return hasEffectiveSkill(session, player, "wushuang") ? 2 : 1;
}

function slashRequiredDodgeCount(
  session: GameSession,
  attacker: GamePlayer,
  target: GamePlayer,
): number {
  const baseRequiredDodgeCount = wushuangResponseCount(session, attacker);
  const sourceGender = genderOf(session, attacker);
  const targetGender = genderOf(session, target);
  if (!sourceGender || !targetGender) return baseRequiredDodgeCount;
  const decision = planRoulinResponses({
    sourceId: attacker.id,
    sourceGender,
    sourceHasEffectiveRoulin: hasEffectiveSkill(session, attacker, "roulin"),
    targetId: target.id,
    targetGender,
    targetHasEffectiveRoulin: hasEffectiveSkill(session, target, "roulin"),
    baseRequiredDodgeCount,
  });
  if (!decision.ok) throw new Error(decision.detail);
  return decision.value.requiredDodgeCount;
}

function lordDispatchFaction(skillId: LordDispatchSkillId): "wei" | "shu" {
  return skillId === "hujia" ? "wei" : "shu";
}

function lordDispatchResponseKind(skillId: LordDispatchSkillId): "slash" | "dodge" {
  return skillId === "hujia" ? "dodge" : "slash";
}

function lordDispatchProviders(
  session: GameSession,
  requester: GamePlayer,
  skillId: LordDispatchSkillId,
): GamePlayer[] {
  const faction = lordDispatchFaction(skillId);
  return livingOpponentsInSeatOrder(session, requester.id)
    .filter((candidate) => factionOf(session, candidate) === faction);
}

function availableLordSkillsForResponse(
  session: GameSession,
  requester: GamePlayer,
  pending: LordDispatchableResponse,
): LordDispatchSkillId[] {
  const required = pending.type === "slash" ||
    (pending.type === "mass_attack" && pending.responseKind === "dodge")
    ? "dodge"
    : "slash";
  const skillId: LordDispatchSkillId = required === "dodge" ? "hujia" : "jijiang";
  if (
    pending.declinedLordSkillIds?.includes(skillId) ||
    !hasEffectiveSkill(session, requester, skillId) ||
    lordDispatchProviders(session, requester, skillId).length === 0
  ) return [];
  return [skillId];
}

function lordDispatchPromptId(
  eventId: number,
  skillId: LordDispatchSkillId,
  requesterId: PlayerId,
  providerId: PlayerId,
): string {
  return `lord:${eventId}:${skillId}:${requesterId}:${providerId}`;
}

function beginLordDispatch(
  session: GameSession,
  requester: GamePlayer,
  skillId: LordDispatchSkillId,
  resume: PendingLordDispatch["resume"],
): void {
  const providers = lordDispatchProviders(session, requester, skillId);
  const [provider, ...remaining] = providers;
  if (!provider) ruleError("INVALID_SKILL", `没有可响应${skillId === "hujia" ? "护驾" : "激将"}的同势力角色。`);
  const eventId = allocateEventId(session);
  session.turn.phase = "respond";
  session.pendingResponse = {
    type: "lord_dispatch",
    requesterId: requester.id,
    targetId: provider.id,
    skillId,
    requiredFaction: lordDispatchFaction(skillId),
    responseKind: lordDispatchResponseKind(skillId),
    method: resume.type === "use_slash" ? "use" : "respond",
    eventId,
    promptId: lordDispatchPromptId(eventId, skillId, requester.id, provider.id),
    remainingProviderIds: remaining.map((candidate) => candidate.id),
    resume,
  };
  addLog(session, "card", `${requester.id} 发动${skillId === "hujia" ? "护驾" : "激将"}，依次请求同势力角色提供${skillId === "hujia" ? "闪" : "杀"}。`);
}

function markLordDispatchDeclined(
  pending: LordDispatchableResponse,
  skillId: LordDispatchSkillId,
): LordDispatchableResponse {
  return {
    ...pending,
    declinedLordSkillIds: [...new Set([...(pending.declinedLordSkillIds ?? []), skillId])],
  } as LordDispatchableResponse;
}

function clearLordDispatchDeclined<T extends LordDispatchableResponse>(pending: T): T {
  return { ...pending, declinedLordSkillIds: [] } as T;
}

function applyInvokeLordSkill(
  session: GameSession,
  action: Extract<GameAction, { type: "invoke_lord_skill" }>,
): void {
  const requester = getLivingPlayer(session, action.playerId);
  if (!hasEffectiveSkill(session, requester, action.skillId)) {
    ruleError("INVALID_SKILL", `${requester.id} 当前不拥有可发动的${action.skillId === "hujia" ? "护驾" : "激将"}。`);
  }

  if (session.turn.phase === "play") {
    assertPlayTurn(session, requester.id);
    if (action.skillId !== "jijiang") ruleError("INVALID_PHASE", "护驾不能在出牌阶段主动使用。");
    if (skillUseCount(session, "jijiang") > 0) {
      ruleError("INVALID_SKILL", "本出牌阶段的激将请求已经无人响应，不能重复发起。");
    }
    if (!canUseAnotherSlash(session, requester)) ruleError("SLASH_ALREADY_USED", "本出牌阶段不能再次通过激将使用杀。");
    const requestedTargetIds = action.targetIds ?? (action.targetId ? [action.targetId] : []);
    const maxTargets = activeSlashTargetLimit(session, requester, false);
    if (
      requestedTargetIds.length < 1 || requestedTargetIds.length > maxTargets ||
      new Set(requestedTargetIds).size !== requestedTargetIds.length || requestedTargetIds.includes(requester.id)
    ) ruleError("INVALID_TARGET", `激将必须指定一至${maxTargets}名不同的其他角色。`);
    const targets = requestedTargetIds.map((targetId) => getLivingPlayer(session, targetId));
    if (targets.some((target) => !canBeSlashTarget(session, target) || !isInActiveSlashRange(session, requester, target.id))) {
      ruleError("INVALID_TARGET", "激将目标必须在攻击范围内且可成为杀的目标。");
    }
    beginLordDispatch(session, requester, "jijiang", { type: "use_slash", targetIds: [...requestedTargetIds] });
    return;
  }

  const pending = session.pendingResponse;
  if (
    session.turn.phase !== "respond" ||
    !pending ||
    !["slash", "duel", "mass_attack", "borrowed_sword"].includes(pending.type) ||
    pending.targetId !== requester.id
  ) {
    ruleError("INVALID_PHASE", "当前没有可通过主公技代为打出的杀或闪。");
  }
  const dispatchable = pending as LordDispatchableResponse;
  if (!availableLordSkillsForResponse(session, requester, dispatchable).includes(action.skillId)) {
    ruleError("INVALID_SKILL", "该主公技不适用于当前响应，或本次询问已经全部被拒绝。");
  }
  if (action.targetId !== undefined || action.targetIds !== undefined) {
    ruleError("INVALID_TARGET", "响应牌已有结算目标，不能重新指定目标。");
  }
  beginLordDispatch(session, requester, action.skillId, {
    type: "respond",
    pending: clearLordDispatchDeclined(dispatchable),
  });
}

function advanceOrFailLordDispatch(session: GameSession, pending: PendingLordDispatch): void {
  for (const [index, providerId] of pending.remainingProviderIds.entries()) {
    const provider = getPlayer(session, providerId);
    if (!provider.alive || factionOf(session, provider) !== pending.requiredFaction) continue;
    session.pendingResponse = {
      ...pending,
      targetId: provider.id,
      promptId: lordDispatchPromptId(pending.eventId, pending.skillId, pending.requesterId, provider.id),
      remainingProviderIds: pending.remainingProviderIds.slice(index + 1),
    };
    return;
  }
  if (pending.resume.type === "respond") {
    const resumed = markLordDispatchDeclined(pending.resume.pending, pending.skillId);
    if (resumed.type === "mass_attack") updateMassAttackResponseCommitment(session, resumed);
    else if (resumed.type === "slash") updateSlashResponseCommitment(session, resumed);
    else if (resumed.type === "duel") updateDuelResponseCommitment(session, resumed);
    session.turn.phase = "respond";
    session.pendingResponse = resumed;
  } else if (pending.resume.failureResume) {
    session.turn.phase = "respond";
    session.pendingResponse = clonePendingResponse(pending.resume.failureResume);
  } else {
    if (pending.skillId === "jijiang") markSkillUsed(session, "jijiang");
    session.turn.phase = "play";
    session.pendingResponse = null;
  }
  addLog(session, "card", `${pending.requesterId} 的${pending.skillId === "hujia" ? "护驾" : "激将"}无人响应。`);
}

function resolveProvidedDodge(
  session: GameSession,
  pending: Extract<LordDispatchableResponse, { type: "slash" | "mass_attack" }>,
  requester: GamePlayer,
  providerCard: Card,
): void {
  if (pending.type === "slash") {
    const required = pending.requiredDodgeCount ?? 1;
    const dodgesPlayed = (pending.dodgesPlayed ?? 0) + 1;
    const progressed = clearLordDispatchDeclined({ ...pending, requiredDodgeCount: required, dodgesPlayed });
    if (dodgesPlayed < required) {
      addLog(session, "card", `${requester.id} 通过护驾完成第 ${dodgesPlayed}/${required} 张闪，仍需继续响应。`);
    }
    offerLeijiAfterDodge(
      session,
      requester,
      { type: "view_as", skillId: "hujia", physicalCardIds: [providerCard.id] },
      { type: "slash", pending: progressed },
    );
    return;
  }
  offerLeijiAfterDodge(
    session,
    requester,
    { type: "view_as", skillId: "hujia", physicalCardIds: [providerCard.id] },
    { type: "mass_attack", pending: clearLordDispatchDeclined(pending) },
  );
}

function resolveProvidedSlash(
  session: GameSession,
  pending: Extract<LordDispatchableResponse, { type: "duel" | "mass_attack" | "borrowed_sword" }>,
  requester: GamePlayer,
  physical: Card,
  provider: GamePlayer,
): void {
  if (session.currentPlayerId === requester.id) session.turn.slashRespondedInPlayPhase = true;
  if (pending.type === "duel") {
    const required = pending.requiredSlashCount ?? 1;
    const slashesPlayed = (pending.slashesPlayed ?? 0) + 1;
    if (slashesPlayed < required) {
      const next = clearLordDispatchDeclined({ ...pending, requiredSlashCount: required, slashesPlayed });
      updateDuelResponseCommitment(session, next);
      session.pendingResponse = next;
      addLog(session, "card", `${requester.id} 通过激将完成第 ${slashesPlayed}/${required} 张杀，仍需继续响应决斗。`);
      return;
    }
    const opponent = getPlayer(session, pending.attackerId);
    if (!opponent.alive) {
      addLog(session, "card", `${requester.id} 通过激将打出${physical.name}，但对方已经死亡，决斗结算结束。`);
      consumeDuelResponseCommitment(session, pending);
      finishTrickResolution(session);
      return;
    }
    const next = {
      ...pending,
      attackerId: requester.id,
      targetId: opponent.id,
      requiredSlashCount: wushuangResponseCount(session, requester),
      slashesPlayed: 0,
      declinedLordSkillIds: [],
    };
    updateDuelResponseCommitment(session, next);
    session.pendingResponse = next;
    return;
  }
  if (pending.type === "mass_attack") {
    advanceMassAttack(session, clearLordDispatchDeclined(pending));
    return;
  }
  const target = getLivingPlayer(session, pending.attackTargetId);
  if (!isInSlashRange(session, requester.id, target.id)) {
    ruleError("INVALID_TARGET", `${target.id} 已不在 ${requester.id} 的攻击范围内。`);
  }
  const slashKind = physical.kind as Extract<CardKind, "slash" | "fire_slash" | "thunder_slash">;
  beginSlashTarget(session, {
    type: "slash",
    attackerId: requester.id,
    targetId: target.id,
    cardId: physical.id,
    slashKind,
    damage: 1,
    nature: damageNatureForSlash(slashKind),
    color: isBlackCard(session, provider, physical) ? "black" : "red",
    armorIgnored: false,
    requiredDodgeCount: wushuangResponseCount(session, requester),
    dodgesPlayed: 0,
    remainingTargetIds: [],
    zhuQueChecked: false,
    ciXiongChecked: false,
    liegongChecked: false,
    useProvenance: {
      method: "use",
      turnPlayerId: session.turn.playerId,
      phase: session.turn.phase,
    },
    completion: { type: "default" },
  });
}

function resolveProvidedActiveSlash(
  session: GameSession,
  pending: PendingLordDispatch,
  requester: GamePlayer,
  physical: Card,
  provider: GamePlayer,
): void {
  if (pending.resume.type !== "use_slash") throw new Error("激将主动使用缺少目标续体。");
  const forcedUse = pending.resume.ignoreUseLimit === true;
  session.pendingResponse = null;
  session.turn.phase = forcedUse ? "respond" : "play";
  if (!forcedUse) {
    assertPlayTurn(session, requester.id);
    if (!canUseAnotherSlash(session, requester)) ruleError("SLASH_ALREADY_USED", "激将结算时已不能继续使用杀。");
  }
  const maxTargets = forcedUse ? 1 : activeSlashTargetLimit(session, requester, false);
  if (
    pending.resume.targetIds.length < 1 || pending.resume.targetIds.length > maxTargets ||
    new Set(pending.resume.targetIds).size !== pending.resume.targetIds.length ||
    pending.resume.targetIds.includes(requester.id)
  ) ruleError("INVALID_TARGET", "激将结算时目标数量或顺序已不再合法。");
  const targets = pending.resume.targetIds.map((targetId) => getLivingPlayer(session, targetId));
  if (targets.some((target) => !canBeSlashTarget(session, target) ||
      !(forcedUse ? isInSlashRange(session, requester.id, target.id) : isInActiveSlashRange(session, requester, target.id)))) {
    ruleError("INVALID_TARGET", "激将结算时原目标已不再合法。");
  }
  const target = targets[0];
  if (!target) throw new Error("激将主动杀缺少首个目标。");
  const slashKind = physical.kind as Extract<CardKind, "slash" | "fire_slash" | "thunder_slash">;
  const damage = forcedUse ? 1 : 1 + session.turn.slashDamageBonus + luoyiDamageBonus(session, requester);
  if (!forcedUse) {
    markActiveSlashUsed(session);
    session.turn.slashDamageBonus = 0;
  }
  addLog(session, "card", `${requester.id} 通过激将对 ${target.id} 使用了由协助者打出的${physical.name}。`);
  beginSlashTarget(session, {
    type: "slash",
    attackerId: requester.id,
    targetId: target.id,
    cardId: physical.id,
    slashKind,
    damage,
    nature: damageNatureForSlash(slashKind),
    color: isBlackCard(session, provider, physical) ? "black" : "red",
    armorIgnored: false,
    requiredDodgeCount: wushuangResponseCount(session, requester),
    dodgesPlayed: 0,
    remainingTargetIds: targets.slice(1).map((candidate) => candidate.id),
    zhuQueChecked: false,
    ciXiongChecked: false,
    liegongChecked: false,
    useProvenance: {
      method: "use",
      turnPlayerId: session.turn.playerId,
      phase: forcedUse ? "respond" : session.turn.phase,
    },
    completion: cloneSlashCompletion(pending.resume.completion),
  });
}

function applyResolveLordDispatch(
  session: GameSession,
  action: Extract<GameAction, { type: "resolve_lord_dispatch" }>,
): void {
  const pending = session.pendingResponse;
  if (
    session.turn.phase !== "respond" ||
    !pending ||
    pending.type !== "lord_dispatch" ||
    pending.targetId !== action.playerId
  ) ruleError("INVALID_PHASE", "当前没有轮到你处理的护驾或激将请求。");
  if (action.promptId !== pending.promptId) {
    ruleError("INVALID_RESPONSE", "护驾或激将请求已过期，请按当前提示重新操作。");
  }
  const provider = getLivingPlayer(session, action.playerId);
  if (factionOf(session, provider) !== pending.requiredFaction) {
    ruleError("INVALID_SKILL", "当前角色的势力不满足此主公技请求。");
  }
  if (action.cardId == null) {
    addLog(session, "card", `${provider.id} 未响应 ${pending.requesterId} 的${pending.skillId === "hujia" ? "护驾" : "激将"}。`);
    advanceOrFailLordDispatch(session, pending);
    return;
  }
  const card = provider.hand.find((candidate) => candidate.id === action.cardId);
  if (!card) ruleError("CARD_NOT_FOUND", `手牌中不存在 ${action.cardId}。`);
  const wushenSlash = isWushenLockedHeartHandCard(session, provider, card);
  const valid = pending.responseKind === "dodge"
    ? card.kind === "dodge" && !wushenSlash
    : isSlashCardKind(card.kind) || wushenSlash;
  if (!valid) ruleError("INVALID_RESPONSE", `只能为该请求打出一张实体${pending.responseKind === "dodge" ? "闪" : "杀"}。`);
  const physical = removeCard(session, provider, card.id);
  session.resolvingCards.push(physical);
  const providedCard = wushenSlash
    ? { ...getCardDefinition("slash"), id: physical.id, kind: "slash" as const, suit: physical.suit, rank: physical.rank }
    : physical;
  const requester = getLivingPlayer(session, pending.requesterId);
  addLog(session, "card", `${provider.id} 为 ${requester.id} 的${pending.skillId === "hujia" ? "护驾" : "激将"}打出${physical.name}。`);
  if (pending.resume.type === "use_slash") {
    resolveProvidedActiveSlash(session, pending, requester, providedCard, provider);
    return;
  }
  const resumed = pending.resume.pending;
  if (pending.responseKind === "dodge") {
    if (resumed.type !== "slash" && resumed.type !== "mass_attack") throw new Error("护驾恢复点不是闪响应。");
    resolveProvidedDodge(session, resumed, requester, physical);
  } else {
    if (resumed.type !== "duel" && resumed.type !== "mass_attack" && resumed.type !== "borrowed_sword") {
      throw new Error("激将恢复点不是杀响应。");
    }
    resolveProvidedSlash(session, resumed, requester, providedCard, provider);
  }
}

function playSlash(
  session: GameSession,
  player: GamePlayer,
  card: Card,
  targetId: PlayerId | undefined,
  targetIds: readonly PlayerId[] | undefined,
): void {
  if (!isSlashCardKind(card.kind)) throw new Error("非杀牌进入杀结算。");
  const weapon = player.equipment.weapon;
  if (!canUseAnotherSlash(session, player)) {
    ruleError("SLASH_ALREADY_USED", "每个出牌阶段只能使用一张杀。");
  }
  const requestedTargets = targetIds ?? (targetId ? [targetId] : []);
  const canUseFangTian = weapon?.kind === "fang_tian_hua_ji" && player.hand.length === 1;
  const maxTargets = activeSlashTargetLimit(session, player, canUseFangTian);
  if (
    requestedTargets.length < 1 ||
    requestedTargets.length > maxTargets ||
    new Set(requestedTargets).size !== requestedTargets.length ||
    requestedTargets.includes(player.id)
  ) {
    ruleError("INVALID_TARGET", `${card.name}必须指定一至${maxTargets}名不同的其他存活玩家。`);
  }
  const targets = requestedTargets.map((id) => getLivingPlayer(session, id));
  const slashEffectiveSuit = effectiveCardSuit(session, player, card);
  for (const target of targets) {
    if (!canBeSlashTarget(session, target)) {
      ruleError("INVALID_TARGET", `${target.id} 没有手牌，空城使其不能成为杀的目标。`);
    }
    if (!isInOwnerDeclaredSlashRange(session, player, target.id, slashEffectiveSuit)) {
      ruleError("INVALID_TARGET", `${target.id} 不在${card.name}的攻击范围内。`);
    }
  }
  const firstTarget = targets[0];
  if (!firstTarget) throw new Error("杀的目标解析失败。");
  const damage = 1 + session.turn.slashDamageBonus + luoyiDamageBonus(session, player);
  const played = moveCardToResolving(session, player, card.id);
  markActiveSlashUsed(session);
  session.turn.slashDamageBonus = 0;
  const pending: Extract<PendingResponse, { type: "slash" }> = {
    type: "slash",
    attackerId: player.id,
    targetId: firstTarget.id,
    cardId: played.id,
    slashKind: card.kind,
    damage,
    nature: damageNatureForSlash(card.kind),
    color: isBlackCard(session, player, card) ? "black" : "red",
    armorIgnored: false,
    requiredDodgeCount: wushuangResponseCount(session, player),
    dodgesPlayed: 0,
    remainingTargetIds: targets.slice(1).map((target) => target.id),
    zhuQueChecked: false,
    ciXiongChecked: false,
    liegongChecked: false,
    useProvenance: {
      method: "use",
      turnPlayerId: session.turn.playerId,
      phase: session.turn.phase,
    },
    completion: { type: "default" },
  };
  addLog(
    session,
    "card",
    `${player.id} 对 ${targets.map((target) => target.id).join("、")} 使用了${card.name}${damage > 1 ? "（伤害强化）" : ""}。`,
  );
  beginSlashTarget(session, pending);
}

function longhunSlashTargetsAfterPayment(
  session: GameSession,
  player: GamePlayer,
  requestedTargetIds: readonly PlayerId[],
  fangTianEligible: boolean,
): GamePlayer[] {
  if (!canUseAnotherSlash(session, player)) {
    ruleError("SLASH_ALREADY_USED", "当前装备结算后的出牌阶段已不能继续使用杀。");
  }
  const canUseFangTian = player.equipment.weapon?.kind === "fang_tian_hua_ji" && fangTianEligible;
  const maxTargets = activeSlashTargetLimit(session, player, canUseFangTian);
  if (
    requestedTargetIds.length < 1 ||
    requestedTargetIds.length > maxTargets ||
    new Set(requestedTargetIds).size !== requestedTargetIds.length ||
    requestedTargetIds.includes(player.id)
  ) {
    ruleError("INVALID_TARGET", `龙魂转化的火杀必须指定一至${maxTargets}名不同的其他存活角色。`);
  }
  const targets = requestedTargetIds.map((targetId) => getLivingPlayer(session, targetId));
  for (const target of targets) {
    if (!canBeSlashTarget(session, target)) ruleError("INVALID_TARGET", `${target.id} 的空城使其不能成为杀的目标。`);
    if (!isInActiveSlashRange(session, player, target.id)) {
      ruleError("INVALID_TARGET", `${target.id} 不在龙魂火杀的攻击范围内。`);
    }
  }
  return targets;
}

function beginLonghunFireSlash(
  session: GameSession,
  player: GamePlayer,
  physicalCards: readonly Card[],
  requestedTargetIds: readonly PlayerId[],
  fangTianEligible: boolean,
): void {
  const targets = longhunSlashTargetsAfterPayment(session, player, requestedTargetIds, fangTianEligible);
  const firstTarget = targets[0];
  if (!firstTarget || physicalCards.length === 0) throw new Error("龙魂火杀缺少实体牌或目标。");
  const damage = 1 + session.turn.slashDamageBonus + luoyiDamageBonus(session, player);
  markActiveSlashUsed(session);
  session.turn.slashDamageBonus = 0;
  addLog(session, "card", `${player.id} 发动龙魂，将 ${physicalCards.length} 张方块牌当作火杀对 ${targets.map((target) => target.id).join("、")} 使用。`);
  beginSlashTarget(session, {
    type: "slash",
    attackerId: player.id,
    targetId: firstTarget.id,
    cardId: physicalCards[0]!.id,
    damageCardIds: physicalCards.map((card) => card.id),
    slashKind: "fire_slash",
    damage,
    nature: "fire",
    color: "red",
    armorIgnored: false,
    requiredDodgeCount: wushuangResponseCount(session, player),
    dodgesPlayed: 0,
    remainingTargetIds: targets.slice(1).map((target) => target.id),
    zhuQueChecked: true,
    ciXiongChecked: false,
    liegongChecked: false,
    useProvenance: {
      method: "use",
      turnPlayerId: session.turn.playerId,
      phase: session.turn.phase,
    },
    completion: { type: "default" },
  });
}

function playPeach(
  session: GameSession,
  player: GamePlayer,
  card: Card,
  targetId: PlayerId | undefined,
): void {
  assertOptionalSelfTarget(player, targetId, "桃");
  if (player.hp >= player.maxHp) {
    ruleError("FULL_HEALTH", "体力已满，不能使用桃。");
  }
  session.discardPile.push(removeCard(session, player, card.id));
  recoverLivePlayer(session, player, 1, player.id, "peach");
  addLog(session, "card", `${player.id} 使用桃，回复了 1 点体力。`);
}

function playWine(
  session: GameSession,
  player: GamePlayer,
  card: Card,
  targetId: PlayerId | undefined,
): void {
  assertOptionalSelfTarget(player, targetId, "酒");
  if (session.turn.wineUsed) {
    ruleError("WINE_ALREADY_USED", "每个出牌阶段只能使用一张酒。");
  }
  session.discardPile.push(removeCard(session, player, card.id));
  session.turn.wineUsed = true;
  session.turn.slashDamageBonus = 1;
  addLog(session, "card", `${player.id} 使用酒，本回合下一张杀伤害 +1。`);
}

function playExNihilo(
  session: GameSession,
  player: GamePlayer,
  card: Card,
  targetId: PlayerId | undefined,
): void {
  assertOptionalSelfTarget(player, targetId, card.name);
  moveCardToResolving(session, player, card.id);
  addLog(session, "card", `${player.id} 使用无中生有，等待无懈可击响应。`);
  beginCommittedTrickEffect(session, {
    type: "ex_nihilo",
    sourceId: player.id,
    targetId: player.id,
    cardId: card.id,
  }, "ex_nihilo");
}

function playDuel(
  session: GameSession,
  player: GamePlayer,
  card: Card,
  targetId: PlayerId | undefined,
): void {
  if (!targetId || targetId === player.id) {
    ruleError("INVALID_TARGET", "决斗必须指定一名其他存活玩家。");
  }
  const target = getLivingPlayer(session, targetId);
  if (!canBeDuelTarget(session, target)) {
    ruleError("INVALID_TARGET", `${target.id} 没有手牌，空城使其不能成为决斗的目标。`);
  }
  moveCardToResolving(session, player, card.id);
  addLog(session, "card", `${player.id} 对 ${target.id} 使用了决斗，等待无懈可击响应。`);
  beginCommittedTrickEffect(session, {
    type: "duel",
    sourceId: player.id,
    targetId: target.id,
    cardId: card.id,
  }, "duel");
}

function playMassAttack(
  session: GameSession,
  player: GamePlayer,
  card: Card,
  targetId: PlayerId | undefined,
): void {
  assertNoTarget(targetId, card.name);
  if (card.kind !== "barbarian_invasion" && card.kind !== "arrow_barrage") {
    throw new Error("非群体锦囊进入群体结算。");
  }
  moveCardToResolving(session, player, card.id);
  beginMassAttackResolution(session, player, card, [card.id]);
}

function beginMassAttackResolution(
  session: GameSession,
  player: GamePlayer,
  card: Card,
  damageCardIds: readonly CardId[],
  sourceSkillId: "luanji" | null = null,
): void {
  if (card.kind !== "barbarian_invasion" && card.kind !== "arrow_barrage") {
    throw new Error("非群体锦囊进入群体结算。");
  }
  const massKind = card.kind;
  const targets = livingOpponentsInSeatOrder(session, player.id)
    .filter((target) => !isMassAttackImmune(session, target, massKind))
    .filter((target) => !isForestNanmanImmune(session, target, massKind))
    .filter((target) => !isWeimuProhibited(session, player, card, target, "global_auto_target"));
  const [firstTarget, ...remainingTargets] = targets;
  if (!firstTarget) {
    addLog(session, "card", `${card.name}没有可结算目标。`);
    const continuation: WumouContinuation = {
      type: "finish_mass_attack",
      sourceId: player.id,
      cardId: card.id,
      damageCardIds: [...damageCardIds],
      ...(sourceSkillId ? { sourceSkillId } : {}),
      cardKind: massKind,
    };
    if (offerWumouCost(session, player, continuation)) return;
    finishMassAttackResolution(session, {
      attackerId: player.id,
      cardId: card.id,
      ...(damageCardIds.length > 1 ? { damageCardIds: [...damageCardIds] } : {}),
      ...(sourceSkillId ? { sourceSkillId } : {}),
      cardKind: massKind,
    });
    return;
  }
  const huoshouSourceId = massKind === "barbarian_invasion"
    ? bindLiveHuoshouSource(session, player)
    : null;
  const pending: PendingMassAttackResponse = {
    type: "mass_attack",
    attackerId: player.id,
    targetId: firstTarget.id,
    cardId: card.id,
    ...(damageCardIds.length > 1 ? { damageCardIds: [...damageCardIds] } : {}),
    ...(sourceSkillId ? { sourceSkillId } : {}),
    cardKind: massKind,
    responseKind: massKind === "barbarian_invasion" ? "slash" : "dodge",
    effectiveSuit: effectiveCardSuit(session, player, card),
    ...(huoshouSourceId ? { huoshouSourceId } : {}),
    remainingTargetIds: remainingTargets.map((target) => target.id),
  };
  createMassAttackResponseCommitment(session, pending);
  addLog(
    session,
    "card",
    `${player.id} 使用了${card.name}，从 ${firstTarget.id} 开始逐目标结算。`,
  );
  beginCommittedTrickEffect(session, { type: "mass_attack", pending }, massKind);
}

function playPeachGarden(
  session: GameSession,
  player: GamePlayer,
  card: Card,
  targetId: PlayerId | undefined,
): void {
  assertNoTarget(targetId, card.name);
  moveCardToResolving(session, player, card.id);
  addLog(session, "card", `${player.id} 使用了桃园结义。`);
  const targets = livingPlayersInSeatOrderFrom(session, player)
    .filter((target) => target.hp < target.maxHp)
    .filter((target) => !isWeimuProhibited(session, player, card, target, "global_auto_target"));
  const [firstTarget, ...remainingTargets] = targets;
  if (!firstTarget) {
    if (offerWumouCost(session, player, {
      type: "finish_trick",
      sourceId: player.id,
      cardId: card.id,
      cardKind: "peach_garden",
    })) return;
    finishResolvingCards(session);
    return;
  }
  beginCommittedTrickEffect(session, {
    type: "peach_garden",
    sourceId: player.id,
    targetId: firstTarget.id,
    cardId: card.id,
    remainingTargetIds: remainingTargets.map((target) => target.id),
  }, "peach_garden");
}

function playDelayedTrick(
  session: GameSession,
  player: GamePlayer,
  card: Card,
  targetId: PlayerId | undefined,
  duanliangDistanceBeforePayment?: number,
): void {
  if (card.kind === "shan_dian") {
    assertOptionalSelfTarget(player, targetId, card.name);
    if (player.judgment.some((candidate) => candidate.kind === card.kind)) {
      ruleError("DUPLICATE_DELAYED_TRICK", "判定区内已经有闪电。");
    }
    moveCardToResolving(session, player, card.id);
    addLog(session, "card", `${player.id} 使用闪电，等待无懈可击响应。`);
    beginNullification(session, { type: "delayed_trick", sourceId: player.id, targetId: player.id, cardId: card.id, cardKind: "shan_dian" }, "shan_dian");
    return;
  }
  if (card.kind !== "le_bu_si_shu" && card.kind !== "bing_liang_cun_duan") {
    throw new Error("非延时锦囊进入延时锦囊结算。");
  }
  if (!targetId || targetId === player.id) {
    ruleError("INVALID_TARGET", `${card.name}必须指定一名其他存活玩家。`);
  }
  const target = getLivingPlayer(session, targetId);
  if (card.kind === "le_bu_si_shu" && !canBeQianxunTarget(session, target)) {
    ruleError("INVALID_TARGET", `${target.id} 的谦逊使其不能成为乐不思蜀的目标。`);
  }
  if (target.judgment.some((candidate) => candidate.kind === card.kind)) {
    ruleError("DUPLICATE_DELAYED_TRICK", `${target.id} 的判定区已有${card.name}。`);
  }
  if (
    card.kind === "bing_liang_cun_duan" &&
    (duanliangDistanceBeforePayment !== undefined
      ? duanliangDistanceBeforePayment > 2
      : !hasEffectiveSkill(session, player, "qicai") && distanceBetweenPlayers(session, player.id, target.id) > 1)
  ) {
    ruleError("INVALID_TARGET", `${target.id} 不在兵粮寸断的合法距离范围内。`);
  }
  moveCardToResolving(session, player, card.id);
  addLog(session, "card", `${player.id} 对 ${target.id} 使用${card.name}，等待无懈可击响应。`);
  beginNullification(session, { type: "delayed_trick", sourceId: player.id, targetId: target.id, cardId: card.id, cardKind: card.kind }, card.kind);
}

function hasCardsInAnyZone(player: GamePlayer): boolean {
  return player.hand.length > 0 || Object.keys(player.equipment).length > 0 || player.judgment.length > 0;
}

function playZoneTrick(
  session: GameSession,
  player: GamePlayer,
  card: Card,
  targetId: PlayerId | undefined,
  distanceBeforePayment?: number,
): void {
  if (card.kind !== "guo_he_chai_qiao" && card.kind !== "shun_shou_qian_yang") {
    throw new Error("非区域锦囊进入区域选择结算。");
  }
  if (!targetId || targetId === player.id) {
    ruleError("INVALID_TARGET", `${card.name}必须指定一名其他存活玩家。`);
  }
  const target = getLivingPlayer(session, targetId);
  if (!hasCardsInAnyZone(target)) ruleError("INVALID_TARGET", `${target.id} 的所有区域均没有牌。`);
  if (card.kind === "shun_shou_qian_yang" && !canBeQianxunTarget(session, target)) {
    ruleError("INVALID_TARGET", `${target.id} 的谦逊使其不能成为顺手牵羊的目标。`);
  }
  if (
    card.kind === "shun_shou_qian_yang" &&
    !hasEffectiveSkill(session, player, "qicai") &&
    (distanceBeforePayment ?? distanceBetweenPlayers(session, player.id, target.id)) > 1
  ) {
    ruleError("INVALID_TARGET", `${target.id} 不在顺手牵羊的距离 1 范围内。`);
  }
  moveCardToResolving(session, player, card.id);
  addLog(session, "card", `${player.id} 对 ${target.id} 使用${card.name}，等待无懈可击响应。`);
  beginCommittedTrickEffect(session, {
    type: "zone_trick",
    sourceId: player.id,
    targetId: target.id,
    cardId: card.id,
    cardKind: card.kind,
  }, card.kind);
}

function playFireAttack(
  session: GameSession,
  player: GamePlayer,
  card: Card,
  targetId: PlayerId | undefined,
): void {
  if (!targetId) ruleError("INVALID_TARGET", "火攻必须指定一名有手牌的存活玩家。");
  const target = getLivingPlayer(session, targetId);
  if (target.hand.length === 0 || (target.id === player.id && target.hand.length <= 1)) {
    ruleError("INVALID_TARGET", `${target.id} 在支付火攻牌后没有可展示的手牌。`);
  }
  moveCardToResolving(session, player, card.id);
  addLog(session, "card", `${player.id} 对 ${target.id} 使用火攻，等待无懈可击响应。`);
  beginCommittedTrickEffect(session, {
    type: "fire_attack",
    sourceId: player.id,
    targetId: target.id,
    cardId: card.id,
  }, "fire_attack");
}

function drawPublicCards(session: GameSession, count: number): Card[] {
  const cards: Card[] = [];
  while (cards.length < count) {
    refillDeck(session);
    const card = session.deck.pop();
    if (!card) break;
    cards.push(card);
  }
  return cards;
}

function playAmazingGrace(
  session: GameSession,
  player: GamePlayer,
  card: Card,
  targetId: PlayerId | undefined,
): void {
  assertNoTarget(targetId, card.name);
  moveCardToResolving(session, player, card.id);
  const targets = livingPlayersInSeatOrderFrom(session, player)
    .filter((target) => !isWeimuProhibited(session, player, card, target, "global_auto_target"));
  const pool = drawPublicCards(session, targets.length);
  const [firstTarget, ...remainingTargets] = targets;
  addLog(session, "card", `${player.id} 使用五谷丰登，亮出 ${pool.length} 张牌。`);
  if (!firstTarget || pool.length === 0) {
    if (offerWumouCost(session, player, {
      type: "finish_trick",
      sourceId: player.id,
      cardId: card.id,
      cardKind: "amazing_grace",
    })) return;
    finishTrickResolution(session);
    return;
  }
  beginCommittedTrickEffect(session, {
    type: "amazing_grace",
    sourceId: player.id,
    targetId: firstTarget.id,
    cardId: card.id,
    pool,
    remainingTargetIds: remainingTargets.map((target) => target.id),
  }, "amazing_grace");
}

function playBorrowedSword(
  session: GameSession,
  player: GamePlayer,
  card: Card,
  targetIds: readonly PlayerId[] | undefined,
): void {
  if (!targetIds || targetIds.length !== 2 || targetIds[0] === targetIds[1]) {
    ruleError("INVALID_TARGET", "借刀杀人必须依次指定持有武器者和其攻击目标。");
  }
  const [holderId, attackTargetId] = targetIds;
  if (!holderId || !attackTargetId || holderId === player.id) {
    ruleError("INVALID_TARGET", "借刀杀人的首个目标必须是持有武器的其他玩家。");
  }
  const holder = getLivingPlayer(session, holderId);
  const attackTarget = getLivingPlayer(session, attackTargetId);
  if (!holder.equipment.weapon) ruleError("INVALID_TARGET", `${holder.id} 没有装备武器。`);
  if (!canBeSlashTarget(session, attackTarget)) {
    ruleError("INVALID_TARGET", `${attackTarget.id} 没有手牌，空城使其不能成为杀的目标。`);
  }
  if (!isInSlashRange(session, holder.id, attackTarget.id)) {
    ruleError("INVALID_TARGET", `${attackTarget.id} 不在 ${holder.id} 的攻击范围内。`);
  }
  moveCardToResolving(session, player, card.id);
  addLog(session, "card", `${player.id} 对 ${holder.id} 使用借刀杀人，要求其攻击 ${attackTarget.id}。`);
  beginCommittedTrickEffect(session, {
    type: "borrowed_sword",
    sourceId: player.id,
    targetId: holder.id,
    attackTargetId: attackTarget.id,
    cardId: card.id,
  }, "borrowed_sword");
}

function playIronChain(
  session: GameSession,
  player: GamePlayer,
  card: Card,
  targetIds: readonly PlayerId[] | undefined,
): void {
  const targets = targetIds ?? [];
  if (targets.length === 0) {
    moveCardToResolving(session, player, card.id);
    const drawn = drawCards(session, player, 1);
    addLog(session, "card", `${player.id} 重铸铁索连环，摸了 ${drawn} 张牌。`);
    finishTrickResolution(session);
    return;
  }
  if (targets.length > 2 || new Set(targets).size !== targets.length) {
    ruleError("INVALID_TARGET", "铁索连环只能指定一至两名不同的存活玩家，或不选目标进行重铸。");
  }
  const selected = targets.map((targetId) => getLivingPlayer(session, targetId));
  moveCardToResolving(session, player, card.id);
  const [firstTarget, ...remainingTargets] = selected;
  if (!firstTarget) throw new Error("铁索连环目标解析失败。");
  addLog(session, "card", `${player.id} 对 ${selected.map((target) => target.id).join("、")} 使用铁索连环。`);
  beginCommittedTrickEffect(session, {
    type: "iron_chain",
    sourceId: player.id,
    targetId: firstTarget.id,
    cardId: card.id,
    remainingTargetIds: remainingTargets.map((target) => target.id),
  }, "iron_chain");
}

function kanpoCardIds(session: GameSession, player: GamePlayer): CardId[] {
  if (!hasEffectiveSkill(session, player, "kanpo")) return [];
  return player.hand.filter((card) => {
    if (card.kind === "wu_xie_ke_ji") return false;
    return evaluateKanpo({
      ownerId: player.id,
      responderId: player.id,
      ownerAlive: player.alive,
      skillEffective: true,
      nullificationWindowOpen: true,
      card: fireRuleCard(session, player, card, "hand"),
    }).ok;
  }).map((card) => card.id);
}

function hasNullification(session: GameSession, player: GamePlayer): boolean {
  return player.hand.some((card) => card.kind === "wu_xie_ke_ji" &&
    !isWushenLockedHeartHandCard(session, player, card)) ||
    kanpoCardIds(session, player).length > 0 ||
    longhunCardGroups(session, player, "spade").length > 0;
}

function initialNullificationResponders(session: GameSession, effectTargetId: PlayerId): PlayerId[] {
  const target = getLivingPlayer(session, effectTargetId);
  return livingPlayersInSeatOrderFrom(session, target)
    .filter((player) => hasNullification(session, player))
    .map((player) => player.id);
}

function counterNullificationResponders(session: GameSession, responderId: PlayerId): PlayerId[] {
  const responder = getPlayer(session, responderId);
  return [...livingOpponentsInSeatOrder(session, responder.id), responder]
    .filter((player) => player.alive && hasNullification(session, player))
    .map((player) => player.id);
}

function finishTrickResolution(session: GameSession): void {
  session.pendingResponse = null;
  if (session.status === "playing") session.turn.phase = "play";
  finishResolvingCards(session);
  if (session.status === "playing" && !getPlayer(session, session.currentPlayerId).alive) beginNextTurn(session);
}

function advancePeachGarden(session: GameSession, effect: Extract<PendingTrickEffect, { type: "peach_garden" }>): void {
  for (const [index, playerId] of effect.remainingTargetIds.entries()) {
    const target = getPlayer(session, playerId);
    if (!target.alive || target.hp >= target.maxHp) continue;
    beginNullification(session, {
      ...effect,
      targetId: target.id,
      remainingTargetIds: effect.remainingTargetIds.slice(index + 1),
    }, "peach_garden");
    return;
  }
  finishTrickResolution(session);
  addLog(session, "card", "桃园结义结算完毕。");
}

function advanceIronChain(session: GameSession, effect: Extract<PendingTrickEffect, { type: "iron_chain" }>): void {
  for (const [index, playerId] of effect.remainingTargetIds.entries()) {
    const target = getPlayer(session, playerId);
    if (!target.alive) continue;
    beginNullification(session, {
      ...effect,
      targetId: target.id,
      remainingTargetIds: effect.remainingTargetIds.slice(index + 1),
    }, "iron_chain");
    return;
  }
  finishTrickResolution(session);
  addLog(session, "card", "铁索连环结算完毕。");
}

function finishAmazingGrace(session: GameSession, pool: readonly Card[]): void {
  if (pool.length > 0) session.discardPile.push(...pool.map(cloneCard));
  finishTrickResolution(session);
  addLog(session, "card", "五谷丰登结算完毕，剩余亮出牌进入弃牌堆。");
}

function advanceAmazingGrace(
  session: GameSession,
  effect: Extract<PendingTrickEffect, { type: "amazing_grace" }>,
): void {
  if (effect.pool.length === 0) {
    finishAmazingGrace(session, []);
    return;
  }
  for (const [index, playerId] of effect.remainingTargetIds.entries()) {
    const target = getPlayer(session, playerId);
    if (!target.alive) continue;
    beginNullification(session, {
      ...effect,
      targetId: target.id,
      pool: effect.pool.map(cloneCard),
      remainingTargetIds: effect.remainingTargetIds.slice(index + 1),
    }, "amazing_grace");
    return;
  }
  finishAmazingGrace(session, effect.pool);
}

function trickEffectSourceId(effect: PendingTrickEffect): PlayerId {
  return effect.type === "mass_attack" ? effect.pending.attackerId : effect.sourceId;
}

function trickEffectCardId(effect: PendingTrickEffect): CardId {
  return effect.type === "mass_attack" ? effect.pending.cardId : effect.cardId;
}

function effectiveKindForTrickEffect(effect: PendingTrickEffect): PendingNullificationResponse["cardKind"] {
  if (effect.type === "mass_attack") return effect.pending.cardKind;
  if (effect.type === "delayed_trick" || effect.type === "zone_trick") return effect.cardKind;
  return effect.type;
}

function hasExactPayloadKeys(effect: StatusEffect, expectedKeys: readonly string[]): boolean {
  const actual = Object.keys(effect.payload).sort();
  const expected = [...expectedKeys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function hasCurrentTurnExpiry(session: GameSession, effect: StatusEffect): boolean {
  return effect.expiry.type === "turn_end" && effect.expiry.turnId === session.turn.number;
}

function commitmentEffects(
  session: GameSession,
  kind: string,
  payloadKey: string,
  payloadValue: string | number,
): StatusEffect[] {
  return session.completeRules.lifecycle.effects.filter((effect) =>
    effect.kind === kind && effect.payload[payloadKey] === payloadValue);
}

function consumeCommitmentEffect(session: GameSession, effectId: number): void {
  session.completeRules.lifecycle.effects = session.completeRules.lifecycle.effects.filter(
    (effect) => effect.effectId !== effectId,
  );
}

function replaceCommitmentCursor(session: GameSession, effect: StatusEffect, cursor: string): void {
  const index = session.completeRules.lifecycle.effects.findIndex((candidate) => candidate.effectId === effect.effectId);
  if (index < 0) throw new Error("响应续体缺少服务端游标。");
  session.completeRules.lifecycle.effects[index] = {
    ...effect,
    payload: { ...effect.payload, cursor },
  };
}

function exactStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function parseCommitment(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function massAttackCommitmentPayload(
  pending: PendingMassAttackResponse,
  initialTargetIds: readonly PlayerId[],
): string {
  return JSON.stringify({
    attackerId: pending.attackerId,
    cardId: pending.cardId,
    damageCardIds: [...(pending.damageCardIds ?? [pending.cardId])],
    sourceSkillId: pending.sourceSkillId ?? null,
    cardKind: pending.cardKind,
    responseKind: pending.responseKind,
    effectiveSuit: pending.effectiveSuit ?? null,
    huoshouSourceId: pending.huoshouSourceId ?? null,
    initialTargetIds: [...initialTargetIds],
  });
}

function massAttackCursorPayload(pending: PendingMassAttackResponse): string {
  return JSON.stringify({
    targetId: pending.targetId,
    remainingTargetIds: [...pending.remainingTargetIds],
    armorAttempted: pending.armorAttempted ?? false,
    declinedLordSkillIds: [...(pending.declinedLordSkillIds ?? [])],
  });
}

function massAttackCommitmentEffect(
  session: GameSession,
  pending: PendingMassAttackResponse,
): StatusEffect {
  const matches = commitmentEffects(session, "mass_attack_commitment", "cardId", pending.cardId);
  const effect = matches[0];
  const fixed = parseCommitment(effect?.payload.commitment);
  const initialTargetIds = fixed?.initialTargetIds;
  const activeTargetIds = [pending.targetId, ...pending.remainingTargetIds];
  const suffixStart = exactStringArray(initialTargetIds)
    ? initialTargetIds.length - activeTargetIds.length
    : -1;
  if (session.completeRules.lifecycle.effects.filter((candidate) => candidate.kind === "mass_attack_commitment").length !== 1 ||
      matches.length !== 1 || !effect || !fixed || !exactStringArray(initialTargetIds) ||
      initialTargetIds.length === 0 || new Set(initialTargetIds).size !== initialTargetIds.length ||
      new Set(activeTargetIds).size !== activeTargetIds.length ||
      suffixStart < 0 || activeTargetIds.some((playerId, index) => initialTargetIds[suffixStart + index] !== playerId) ||
      effect.ownerId !== pending.attackerId || effect.sourcePlayerId !== pending.attackerId ||
      effect.sourceSkillId !== (pending.sourceSkillId ?? "mass_attack") ||
      effect.payload.commitment !== massAttackCommitmentPayload(pending, initialTargetIds) ||
      !hasExactPayloadKeys(effect, ["cardId", "commitment", "cursor"]) ||
      effect.visibility !== "server_only" || effect.expiry.type !== "game_end") {
    throw new Error("群体锦囊续体与服务端承诺不一致。");
  }
  return effect;
}

export function assertRestorableMassAttackResponse(
  session: GameSession,
  pending: PendingMassAttackResponse,
): void {
  const effect = massAttackCommitmentEffect(session, pending);
  if (effect.payload.cursor !== massAttackCursorPayload(pending)) {
    throw new Error("群体锦囊续体与服务端阶段游标不一致。");
  }
}

function createMassAttackResponseCommitment(
  session: GameSession,
  pending: PendingMassAttackResponse,
): void {
  if (session.completeRules.lifecycle.effects.some((effect) => effect.kind === "mass_attack_commitment")) {
    throw new Error("群体锦囊重复创建服务端承诺。");
  }
  const initialTargetIds = [pending.targetId, ...pending.remainingTargetIds];
  addStatusEffect(session.completeRules.lifecycle, {
    ownerId: pending.attackerId,
    kind: "mass_attack_commitment",
    sourcePlayerId: pending.attackerId,
    sourceSkillId: pending.sourceSkillId ?? "mass_attack",
    payload: {
      cardId: pending.cardId,
      commitment: massAttackCommitmentPayload(pending, initialTargetIds),
      cursor: massAttackCursorPayload(pending),
    },
    visibility: "server_only",
    expiry: { type: "game_end" },
  });
  assertRestorableMassAttackResponse(session, pending);
}

function updateMassAttackResponseCommitment(session: GameSession, pending: PendingMassAttackResponse): void {
  const effect = massAttackCommitmentEffect(session, pending);
  replaceCommitmentCursor(session, effect, massAttackCursorPayload(pending));
  assertRestorableMassAttackResponse(session, pending);
}

function consumeMassAttackResponseCommitment(session: GameSession, pending: PendingMassAttackResponse): void {
  assertRestorableMassAttackResponse(session, pending);
  consumeCommitmentEffect(
    session,
    commitmentEffects(session, "mass_attack_commitment", "cardId", pending.cardId)[0]!.effectId,
  );
}

function nullificationCommitmentPayload(pending: PendingNullificationResponse): string {
  return JSON.stringify({
    attackerId: pending.attackerId,
    effectTargetId: pending.effectTargetId,
    cardId: pending.cardId,
    cardKind: pending.cardKind,
    effect: cloneTrickEffect(pending.effect),
  });
}

function nullificationCursorPayload(pending: PendingNullificationResponse): string {
  return JSON.stringify({
    targetId: pending.targetId,
    remainingResponderIds: [...pending.remainingResponderIds],
    negated: pending.negated,
  });
}

function nullificationCommitmentEffect(
  session: GameSession,
  pending: PendingNullificationResponse,
): StatusEffect {
  const matches = commitmentEffects(session, "nullification_progress", "cardId", pending.cardId);
  const effect = matches[0];
  const responderIds = [pending.targetId, ...pending.remainingResponderIds];
  if (session.completeRules.lifecycle.effects.filter((candidate) => candidate.kind === "nullification_progress").length !== 1 ||
      matches.length !== 1 || !effect || effect.ownerId !== pending.attackerId ||
      new Set(responderIds).size !== responderIds.length ||
      pending.attackerId !== trickEffectSourceId(pending.effect) ||
      pending.effectTargetId !== (pending.effect.type === "mass_attack" ? pending.effect.pending.targetId : pending.effect.targetId) ||
      pending.cardId !== trickEffectCardId(pending.effect) ||
      pending.cardKind !== effectiveKindForTrickEffect(pending.effect) ||
      effect.sourcePlayerId !== pending.attackerId || effect.sourceSkillId !== "nullification" ||
      effect.payload.commitment !== nullificationCommitmentPayload(pending) ||
      !hasExactPayloadKeys(effect, ["cardId", "commitment", "cursor"]) ||
      effect.visibility !== "server_only" || effect.expiry.type !== "game_end") {
    throw new Error("无懈可击响应链与服务端承诺不一致。");
  }
  return effect;
}

export function assertRestorableNullificationResponse(
  session: GameSession,
  pending: PendingNullificationResponse,
): void {
  const effect = nullificationCommitmentEffect(session, pending);
  if (effect.payload.cursor !== nullificationCursorPayload(pending)) {
    throw new Error("无懈可击响应链与服务端阶段游标不一致。");
  }
}

function createNullificationResponseCommitment(session: GameSession, pending: PendingNullificationResponse): void {
  if (session.completeRules.lifecycle.effects.some((effect) => effect.kind === "nullification_progress")) {
    throw new Error("无懈可击响应链重复创建服务端承诺。");
  }
  addStatusEffect(session.completeRules.lifecycle, {
    ownerId: pending.attackerId,
    kind: "nullification_progress",
    sourcePlayerId: pending.attackerId,
    sourceSkillId: "nullification",
    payload: {
      cardId: pending.cardId,
      commitment: nullificationCommitmentPayload(pending),
      cursor: nullificationCursorPayload(pending),
    },
    visibility: "server_only",
    expiry: { type: "game_end" },
  });
  assertRestorableNullificationResponse(session, pending);
}

function updateNullificationResponseCommitment(session: GameSession, pending: PendingNullificationResponse): void {
  const effect = nullificationCommitmentEffect(session, pending);
  replaceCommitmentCursor(session, effect, nullificationCursorPayload(pending));
  assertRestorableNullificationResponse(session, pending);
}

function consumeNullificationResponseCommitment(session: GameSession, pending: PendingNullificationResponse): void {
  assertRestorableNullificationResponse(session, pending);
  consumeCommitmentEffect(
    session,
    commitmentEffects(session, "nullification_progress", "cardId", pending.cardId)[0]!.effectId,
  );
}

function slashCommitmentPayload(
  pending: PendingSlashResponse,
  initialTargetIds: readonly PlayerId[],
): string {
  return JSON.stringify({
    attackerId: pending.attackerId,
    cardId: pending.cardId,
    damageCardIds: [...(pending.damageCardIds ?? [pending.cardId])],
    sourceSkillId: pending.sourceSkillId ?? null,
    damage: pending.damage,
    color: pending.color,
    initialTargetIds: [...initialTargetIds],
    useProvenance: pending.useProvenance ? { ...pending.useProvenance } : null,
    completion: cloneSlashCompletion(pending.completion),
  });
}

function slashCursorPayload(pending: PendingSlashResponse): string {
  return JSON.stringify({
    slashKind: pending.slashKind,
    nature: pending.nature,
    targetId: pending.targetId,
    remainingTargetIds: [...pending.remainingTargetIds],
    requiredDodgeCount: pending.requiredDodgeCount ?? 1,
    dodgesPlayed: pending.dodgesPlayed ?? 0,
    armorAttempted: pending.armorAttempted ?? false,
    armorIgnored: pending.armorIgnored ?? false,
    zhuQueChecked: pending.zhuQueChecked,
    ciXiongChecked: pending.ciXiongChecked,
    liuliCheckedPlayerIds: [...(pending.liuliCheckedPlayerIds ?? [])],
    xiangleCheckedPlayerIds: [...(pending.xiangleCheckedPlayerIds ?? [])],
    jiangProcessedPlayerIds: [...(pending.jiangProcessedPlayerIds ?? [])],
    liegongChecked: pending.liegongChecked ?? false,
    tieqiChecked: pending.tieqiChecked ?? false,
    excludedRedirectTargetIds: [...(pending.excludedRedirectTargetIds ?? [
      pending.attackerId,
      pending.targetId,
      ...pending.remainingTargetIds,
    ])],
    dodgeProhibited: pending.dodgeProhibited ?? false,
    declinedLordSkillIds: [...(pending.declinedLordSkillIds ?? [])],
  });
}

function slashCommitmentEffect(session: GameSession, pending: PendingSlashResponse): StatusEffect {
  const matches = commitmentEffects(session, "slash_response_progress", "cardId", pending.cardId);
  const effect = matches[0];
  const fixed = parseCommitment(effect?.payload.commitment);
  const initialTargetIds = fixed?.initialTargetIds;
  const remainingStart = exactStringArray(initialTargetIds)
    ? initialTargetIds.length - pending.remainingTargetIds.length
    : -1;
  if (session.completeRules.lifecycle.effects.filter((candidate) => candidate.kind === "slash_response_progress").length !== 1 ||
      matches.length !== 1 || !effect || !fixed || !exactStringArray(initialTargetIds) ||
      initialTargetIds.length === 0 || new Set(initialTargetIds).size !== initialTargetIds.length ||
      !Number.isSafeInteger(pending.requiredDodgeCount ?? 1) || (pending.requiredDodgeCount ?? 1) <= 0 ||
      !Number.isSafeInteger(pending.dodgesPlayed ?? 0) || (pending.dodgesPlayed ?? 0) < 0 ||
      (pending.dodgesPlayed ?? 0) > (pending.requiredDodgeCount ?? 1) ||
      remainingStart < 0 || pending.remainingTargetIds.some((playerId, index) =>
        initialTargetIds[remainingStart + index] !== playerId) ||
      effect.ownerId !== pending.attackerId || effect.sourcePlayerId !== pending.attackerId ||
      effect.sourceSkillId !== (pending.sourceSkillId ?? "slash") ||
      effect.payload.commitment !== slashCommitmentPayload(pending, initialTargetIds) ||
      !hasExactPayloadKeys(effect, ["cardId", "commitment", "cursor"]) ||
      effect.visibility !== "server_only" || effect.expiry.type !== "game_end") {
    throw new Error("杀响应续体与服务端承诺不一致。");
  }
  return effect;
}

export function assertRestorableSlashResponse(session: GameSession, pending: PendingSlashResponse): void {
  const effect = slashCommitmentEffect(session, pending);
  if (effect.payload.cursor !== slashCursorPayload(pending)) {
    throw new Error("杀响应续体与服务端阶段游标不一致。");
  }
}

function createSlashResponseCommitment(session: GameSession, pending: PendingSlashResponse): void {
  if (session.completeRules.lifecycle.effects.some((effect) => effect.kind === "slash_response_progress")) {
    throw new Error("杀响应续体重复创建服务端承诺。");
  }
  const initialTargetIds = [pending.targetId, ...pending.remainingTargetIds];
  addStatusEffect(session.completeRules.lifecycle, {
    ownerId: pending.attackerId,
    kind: "slash_response_progress",
    sourcePlayerId: pending.attackerId,
    sourceSkillId: pending.sourceSkillId ?? "slash",
    payload: {
      cardId: pending.cardId,
      commitment: slashCommitmentPayload(pending, initialTargetIds),
      cursor: slashCursorPayload(pending),
    },
    visibility: "server_only",
    expiry: { type: "game_end" },
  });
  assertRestorableSlashResponse(session, pending);
}

function updateSlashResponseCommitment(session: GameSession, pending: PendingSlashResponse): void {
  const effect = slashCommitmentEffect(session, pending);
  replaceCommitmentCursor(session, effect, slashCursorPayload(pending));
  assertRestorableSlashResponse(session, pending);
}

function syncSlashResponseCommitment(session: GameSession, pending: PendingSlashResponse): void {
  if (commitmentEffects(session, "slash_response_progress", "cardId", pending.cardId).length === 0) {
    createSlashResponseCommitment(session, pending);
  } else {
    updateSlashResponseCommitment(session, pending);
  }
}

function consumeSlashResponseCommitment(session: GameSession, pending: PendingSlashResponse): void {
  assertRestorableSlashResponse(session, pending);
  consumeCommitmentEffect(
    session,
    commitmentEffects(session, "slash_response_progress", "cardId", pending.cardId)[0]!.effectId,
  );
}

function duelCommitmentPayload(pending: PendingDuelResponse): string {
  return JSON.stringify({
    cardId: pending.cardId,
    initiatorId: pending.initiatorId,
    originalTargetId: pending.originalTargetId,
  });
}

function duelCursorPayload(pending: PendingDuelResponse): string {
  return JSON.stringify({
    attackerId: pending.attackerId,
    targetId: pending.targetId,
    requiredSlashCount: pending.requiredSlashCount ?? 1,
    slashesPlayed: pending.slashesPlayed ?? 0,
    declinedLordSkillIds: [...(pending.declinedLordSkillIds ?? [])],
  });
}

function duelCommitmentEffect(session: GameSession, pending: PendingDuelResponse): StatusEffect {
  const matches = commitmentEffects(session, "duel_response_progress", "cardId", pending.cardId);
  const effect = matches[0];
  const participants = new Set([pending.initiatorId, pending.originalTargetId]);
  if (session.completeRules.lifecycle.effects.filter((candidate) => candidate.kind === "duel_response_progress").length !== 1 ||
      matches.length !== 1 || !effect || effect.ownerId !== pending.initiatorId ||
      participants.size !== 2 || !participants.has(pending.attackerId) || !participants.has(pending.targetId) ||
      pending.attackerId === pending.targetId || !Number.isSafeInteger(pending.requiredSlashCount ?? 1) ||
      (pending.requiredSlashCount ?? 1) <= 0 || !Number.isSafeInteger(pending.slashesPlayed ?? 0) ||
      (pending.slashesPlayed ?? 0) < 0 || (pending.slashesPlayed ?? 0) >= (pending.requiredSlashCount ?? 1) ||
      effect.sourcePlayerId !== pending.initiatorId || effect.sourceSkillId !== "duel" ||
      effect.payload.commitment !== duelCommitmentPayload(pending) ||
      !hasExactPayloadKeys(effect, ["cardId", "commitment", "cursor"]) ||
      effect.visibility !== "server_only" || effect.expiry.type !== "game_end") {
    throw new Error("决斗响应续体与服务端承诺不一致。");
  }
  return effect;
}

export function assertRestorableDuelResponse(session: GameSession, pending: PendingDuelResponse): void {
  const effect = duelCommitmentEffect(session, pending);
  if (effect.payload.cursor !== duelCursorPayload(pending)) {
    throw new Error("决斗响应续体与服务端阶段游标不一致。");
  }
}

function createDuelResponseCommitment(session: GameSession, pending: PendingDuelResponse): void {
  if (session.completeRules.lifecycle.effects.some((effect) => effect.kind === "duel_response_progress")) {
    throw new Error("决斗响应续体重复创建服务端承诺。");
  }
  addStatusEffect(session.completeRules.lifecycle, {
    ownerId: pending.initiatorId,
    kind: "duel_response_progress",
    sourcePlayerId: pending.initiatorId,
    sourceSkillId: "duel",
    payload: {
      cardId: pending.cardId,
      commitment: duelCommitmentPayload(pending),
      cursor: duelCursorPayload(pending),
    },
    visibility: "server_only",
    expiry: { type: "game_end" },
  });
  assertRestorableDuelResponse(session, pending);
}

function updateDuelResponseCommitment(session: GameSession, pending: PendingDuelResponse): void {
  const effect = duelCommitmentEffect(session, pending);
  replaceCommitmentCursor(session, effect, duelCursorPayload(pending));
  assertRestorableDuelResponse(session, pending);
}

function consumeDuelResponseCommitment(session: GameSession, pending: PendingDuelResponse): void {
  assertRestorableDuelResponse(session, pending);
  consumeCommitmentEffect(
    session,
    commitmentEffects(session, "duel_response_progress", "cardId", pending.cardId)[0]!.effectId,
  );
}

export function assertWumouContinuation(
  session: GameSession,
  ownerId: PlayerId,
  continuation: WumouContinuation,
  eventId?: number,
): void {
  const assertCommitment = (): void => {
    if (eventId === undefined) return;
    const commitment = JSON.stringify(encodeGameDamageContinuation({
      type: "wumou",
      ownerId,
      eventId,
      continuation,
    }));
    const matches = commitmentEffects(session, "wumou_commitment", "eventId", eventId);
    const effect = matches[0];
    if (eventId <= 0 || eventId >= session.nextEventId || matches.length !== 1 || !effect ||
        effect.ownerId !== ownerId || effect.sourcePlayerId !== ownerId || effect.sourceSkillId !== "wumou" ||
        effect.payload.commitment !== commitment || !hasExactPayloadKeys(effect, ["eventId", "commitment"]) ||
        effect.visibility !== "server_only" || !hasCurrentTurnExpiry(session, effect)) {
      throw new Error("无谋续体与服务端承诺不一致。");
    }
  };
  if (continuation.type === "trick_effect") {
    if (trickEffectSourceId(continuation.effect) !== ownerId ||
        effectiveKindForTrickEffect(continuation.effect) !== continuation.cardKind ||
        !session.resolvingCards.some((card) => card.id === trickEffectCardId(continuation.effect))) {
      throw new Error("无谋普通锦囊续体与结算区不一致。");
    }
    assertCommitment();
    return;
  }
  if (continuation.type === "finish_mass_attack") {
    if (continuation.sourceId !== ownerId || continuation.damageCardIds.length === 0 ||
        new Set(continuation.damageCardIds).size !== continuation.damageCardIds.length ||
        !continuation.damageCardIds.includes(continuation.cardId) ||
        continuation.damageCardIds.some((cardId) => !session.resolvingCards.some((card) => card.id === cardId)) ||
        (continuation.sourceSkillId === "luanji" ? continuation.damageCardIds.length !== 2 : continuation.damageCardIds.length !== 1)) {
      throw new Error("无谋无目标群体锦囊续体与结算区不一致。");
    }
    assertCommitment();
    return;
  }
  if (continuation.type === "finish_trick") {
    if (continuation.sourceId !== ownerId ||
        !session.resolvingCards.some((card) => card.id === continuation.cardId)) {
      throw new Error("无谋无目标锦囊续体与结算区不一致。");
    }
    assertCommitment();
    return;
  }
  if (continuation.responderId !== ownerId || continuation.pending.targetId !== ownerId ||
      effectiveKindForTrickEffect(continuation.pending.effect) !== continuation.pending.cardKind ||
      !session.resolvingCards.some((card) => card.id === continuation.responseCardId)) {
    throw new Error("无谋无懈可击续体与响应链不一致。");
  }
  assertCommitment();
}

function offerWumouCost(
  session: GameSession,
  owner: GamePlayer,
  continuation: WumouContinuation,
): boolean {
  if (!owner.alive || !hasEffectiveSkill(session, owner, "wumou")) return false;
  assertWumouContinuation(session, owner.id, continuation);
  const eventId = allocateEventId(session);
  addStatusEffect(session.completeRules.lifecycle, {
    ownerId: owner.id,
    kind: "wumou_commitment",
    sourcePlayerId: owner.id,
    sourceSkillId: "wumou",
    payload: {
      eventId,
      commitment: JSON.stringify(encodeGameDamageContinuation({
        type: "wumou",
        ownerId: owner.id,
        eventId,
        continuation,
      })),
    },
    visibility: "server_only",
    expiry: { type: "turn_end", turnId: session.turn.number },
  });
  assertWumouContinuation(session, owner.id, continuation, eventId);
  session.turn.phase = "respond";
  session.pendingResponse = {
    type: "standard_skill",
    targetId: owner.id,
    promptId: standardPromptId(eventId, "wumou", owner.id, "choice"),
    eventId,
    skillId: "wumou",
    stage: "wumou_choice",
    wumouContinuation: cloneWumouContinuation(continuation),
  };
  addLog(session, "card", `${owner.id} 使用普通锦囊，须结算锁定技无谋。`);
  return true;
}

function continuePlayedNullification(
  session: GameSession,
  pending: PendingNullificationResponse,
  responderId: PlayerId,
): void {
  const responder = getPlayer(session, responderId);
  const responders = counterNullificationResponders(session, responder.id);
  const [firstResponder, ...remainingResponderIds] = responders;
  const negated = !pending.negated;
  addLog(session, "card", `${responder.id} 打出无懈可击，当前锦囊效果${negated ? "被抵消" : "恢复生效"}。`);
  if (!firstResponder) {
    consumeNullificationResponseCommitment(session, pending);
    resolveTrickEffect(session, pending.effect, negated);
    return;
  }
  const next = { ...pending, targetId: firstResponder, remainingResponderIds, negated };
  updateNullificationResponseCommitment(session, next);
  session.turn.phase = "respond";
  session.pendingResponse = next;
}

function continueWumouContinuation(session: GameSession, continuation: WumouContinuation): void {
  if (continuation.type === "trick_effect") {
    beginNullification(session, cloneTrickEffect(continuation.effect), continuation.cardKind);
    return;
  }
  if (continuation.type === "finish_mass_attack") {
    finishMassAttackResolution(session, {
      attackerId: continuation.sourceId,
      cardId: continuation.cardId,
      damageCardIds: [...continuation.damageCardIds],
      ...(continuation.sourceSkillId ? { sourceSkillId: continuation.sourceSkillId } : {}),
      cardKind: continuation.cardKind,
    });
    return;
  }
  if (continuation.type === "finish_trick") {
    finishTrickResolution(session);
    return;
  }
  continuePlayedNullification(session, continuation.pending, continuation.responderId);
}

function completeWumouContinuation(
  session: GameSession,
  ownerId: PlayerId,
  eventId: number,
  continuation: WumouContinuation,
): void {
  assertWumouContinuation(session, ownerId, continuation, eventId);
  const effectId = commitmentEffects(session, "wumou_commitment", "eventId", eventId)[0]!.effectId;
  continueWumouContinuation(session, continuation);
  consumeCommitmentEffect(session, effectId);
}

function consumeFinishedWumouContinuation(
  session: GameSession,
  ownerId: PlayerId,
  eventId: number,
  continuation: WumouContinuation,
): void {
  if (commitmentEffects(session, "wumou_commitment", "eventId", eventId).length === 0) return;
  consumeWumouContinuation(session, ownerId, eventId, continuation);
}

function consumeWumouContinuation(
  session: GameSession,
  ownerId: PlayerId,
  eventId: number,
  continuation: WumouContinuation,
): void {
  assertWumouContinuation(session, ownerId, continuation, eventId);
  consumeCommitmentEffect(
    session,
    commitmentEffects(session, "wumou_commitment", "eventId", eventId)[0]!.effectId,
  );
}

function shenfenCommitmentPayload(continuation: ShenfenContinuation): string {
  return JSON.stringify({
    eventId: continuation.eventId,
    ownerId: continuation.ownerId,
    targetIds: continuation.targetIds,
  });
}

function shenfenCursorPayload(continuation: ShenfenContinuation): string {
  return JSON.stringify({
    stage: continuation.stage,
    nextTargetIndex: continuation.nextTargetIndex,
  });
}

export function assertShenfenContinuation(session: GameSession, continuation: ShenfenContinuation): void {
  const allTargetIds = allOpponentsInSeatOrder(session, continuation.ownerId);
  const targetSet = new Set(continuation.targetIds);
  let previousIndex = -1;
  for (const targetId of continuation.targetIds) {
    const index = allTargetIds.indexOf(targetId);
    if (index <= previousIndex) throw new Error("神愤冻结目标座次已被篡改。");
    previousIndex = index;
  }
  const missingLivingTarget = allTargetIds.some((targetId) =>
    getPlayer(session, targetId).alive && !targetSet.has(targetId));
  const commitments = commitmentEffects(session, "shenfen_commitment", "eventId", continuation.eventId);
  const commitment = commitments[0];
  if (targetSet.size !== continuation.targetIds.length || missingLivingTarget ||
      continuation.eventId <= 0 || continuation.eventId >= session.nextEventId ||
      commitments.length !== 1 || !commitment || commitment.ownerId !== continuation.ownerId ||
      commitment.sourcePlayerId !== continuation.ownerId || commitment.sourceSkillId !== "shenfen" ||
      commitment.payload.commitment !== shenfenCommitmentPayload(continuation) ||
      commitment.payload.cursor !== shenfenCursorPayload(continuation) ||
      !hasExactPayloadKeys(commitment, ["eventId", "commitment", "cursor"]) ||
      commitment.visibility !== "server_only" || !hasCurrentTurnExpiry(session, commitment) ||
      !Number.isSafeInteger(continuation.nextTargetIndex) || continuation.nextTargetIndex < 0 ||
      continuation.nextTargetIndex > continuation.targetIds.length ||
      continuation.stage === "turn_over" && continuation.nextTargetIndex !== continuation.targetIds.length ||
      session.currentPlayerId !== continuation.ownerId || skillUseCount(session, "shenfen") !== 1) {
    throw new Error("神愤续体与已承诺的回合状态不一致。");
  }
}

function advanceShenfenCursor(
  session: GameSession,
  current: ShenfenContinuation,
  next: ShenfenContinuation,
): void {
  assertShenfenContinuation(session, current);
  if (shenfenCommitmentPayload(current) !== shenfenCommitmentPayload(next)) {
    throw new Error("神愤推进时不得改变已承诺的目标顺序。");
  }
  const currentEffect = commitmentEffects(session, "shenfen_commitment", "eventId", current.eventId)[0]!;
  const effectIndex = session.completeRules.lifecycle.effects.findIndex((effect) => effect.effectId === currentEffect.effectId);
  if (effectIndex < 0) throw new Error("神愤推进缺少唯一的服务端游标。");
  const effect = session.completeRules.lifecycle.effects[effectIndex]!;
  session.completeRules.lifecycle.effects[effectIndex] = {
    ...effect,
    payload: { ...effect.payload, cursor: shenfenCursorPayload(next) },
  };
  assertShenfenContinuation(session, next);
}

function pauseShenfenForAfterMove(session: GameSession, continuation: ShenfenContinuation): void {
  assertShenfenContinuation(session, continuation);
  session.turn.phase = "respond";
  session.pendingResponse = {
    type: "standard_skill",
    targetId: continuation.ownerId,
    promptId: standardPromptId(
      continuation.eventId,
      "shenfen",
      continuation.ownerId,
      `continue-${continuation.stage}-${continuation.nextTargetIndex}`,
    ),
    eventId: continuation.eventId,
    skillId: "shenfen",
    stage: "shenfen_continue",
    shenfenContinuation: cloneShenfenContinuation(continuation),
  };
  offerNextAfterMoveSkill(session);
}

function discardShenfenHandCards(
  session: GameSession,
  target: GamePlayer,
  selectedCardIds: readonly CardId[],
): void {
  const plan = planShenfenVictimDiscard({
    targetId: target.id,
    targetAliveAtDiscardStages: target.alive,
    equipmentCardIds: [],
    handCardIds: target.hand.map((card) => card.id),
    selectedHandCardIds: selectedCardIds,
  });
  if (!plan.ok) ruleError("INVALID_SELECTION", plan.detail);
  const moveBatchId = nextMoveBatchId(session);
  const discarded = plan.value.discardHandCardIds.map((cardId) => removeCard(session, target, cardId, moveBatchId));
  session.discardPile.push(...discarded);
  if (discarded.length > 0) addLog(session, "card", `${target.id} 因神愤弃置了 ${discarded.length} 张手牌。`);
}

function consumeShenfenContinuation(session: GameSession, continuation: ShenfenContinuation): void {
  assertShenfenContinuation(session, continuation);
  const effectId = commitmentEffects(session, "shenfen_commitment", "eventId", continuation.eventId)[0]!.effectId;
  consumeCommitmentEffect(session, effectId);
}

function consumeFinishedShenfenContinuation(session: GameSession, continuation: ShenfenContinuation): void {
  if (commitmentEffects(session, "shenfen_commitment", "eventId", continuation.eventId).length === 0) return;
  consumeShenfenContinuation(session, continuation);
}

function continueShenfen(session: GameSession, initial: ShenfenContinuation): void {
  let continuation = cloneShenfenContinuation(initial);
  if (session.status === "finished") {
    consumeFinishedShenfenContinuation(session, continuation);
    return;
  }
  assertShenfenContinuation(session, continuation);

  for (;;) {
    if (continuation.stage === "damage") {
      let index = continuation.nextTargetIndex;
      while (index < continuation.targetIds.length) {
        const target = getPlayer(session, continuation.targetIds[index]!);
        index += 1;
        if (!target.alive) continue;
        const next: ShenfenContinuation = { ...continuation, nextTargetIndex: index };
        advanceShenfenCursor(session, continuation, next);
        continuation = next;
        const paused = dealDamage(
          session,
          target,
          getPlayer(session, continuation.ownerId),
          1,
          "normal",
          "因神愤",
          { type: "shenfen", continuation: cloneShenfenContinuation(next) },
        );
        if (paused) return;
        if ((session as { status: GameSession["status"] }).status === "finished") {
          consumeFinishedShenfenContinuation(session, continuation);
          return;
        }
      }
      const next = { ...continuation, stage: "equipment" as const, nextTargetIndex: 0 };
      advanceShenfenCursor(session, continuation, next);
      continuation = next;
      continue;
    }

    if (continuation.stage === "equipment") {
      let index = continuation.nextTargetIndex;
      while (index < continuation.targetIds.length) {
        const target = getPlayer(session, continuation.targetIds[index]!);
        index += 1;
        if (!target.alive || Object.keys(target.equipment).length === 0) continue;
        const discarded = loseAllEquipment(session, target);
        session.discardPile.push(...discarded);
        addLog(session, "card", `${target.id} 因神愤弃置了装备区里的 ${discarded.length} 张牌。`);
        const next = { ...continuation, nextTargetIndex: index };
        advanceShenfenCursor(session, continuation, next);
        pauseShenfenForAfterMove(session, next);
        return;
      }
      const next = { ...continuation, stage: "hand" as const, nextTargetIndex: 0 };
      advanceShenfenCursor(session, continuation, next);
      continuation = next;
      continue;
    }

    if (continuation.stage === "hand") {
      let index = continuation.nextTargetIndex;
      while (index < continuation.targetIds.length) {
        const target = getPlayer(session, continuation.targetIds[index]!);
        if (!target.alive || target.hand.length === 0) {
          index += 1;
          continue;
        }
        if (target.hand.length > 4) {
          const promptContinuation = { ...continuation, nextTargetIndex: index };
          if (index !== continuation.nextTargetIndex) {
            advanceShenfenCursor(session, continuation, promptContinuation);
            continuation = promptContinuation;
          }
          session.turn.phase = "respond";
          session.pendingResponse = {
            type: "standard_skill",
            targetId: target.id,
            promptId: standardPromptId(continuation.eventId, "shenfen", target.id, `discard-hand-${index}`),
            eventId: continuation.eventId,
            skillId: "shenfen",
            stage: "shenfen_discard_hand",
            handCardIds: target.hand.map((card) => card.id),
            shenfenContinuation: cloneShenfenContinuation(continuation),
          };
          addLog(session, "card", `${target.id} 须因神愤弃置四张手牌。`);
          return;
        }
        discardShenfenHandCards(session, target, target.hand.map((card) => card.id));
        index += 1;
        const next = { ...continuation, nextTargetIndex: index };
        advanceShenfenCursor(session, continuation, next);
        pauseShenfenForAfterMove(session, next);
        return;
      }
      const next = {
        ...continuation,
        stage: "turn_over" as const,
        nextTargetIndex: continuation.targetIds.length,
      };
      advanceShenfenCursor(session, continuation, next);
      continuation = next;
      continue;
    }

    session.pendingResponse = null;
    const owner = getPlayer(session, continuation.ownerId);
    if (owner.alive) {
      const turned = turnOverLivePlayer(session, owner.id);
      consumeShenfenContinuation(session, continuation);
      session.turn.phase = "play";
      addLog(session, "card", `${owner.id} 完成神愤并翻面为${turned.faceUp ? "正面朝上" : "背面朝上"}。`);
    } else if (session.status === "playing" && session.currentPlayerId === owner.id) {
      consumeShenfenContinuation(session, continuation);
      beginNextTurn(session);
    } else {
      consumeShenfenContinuation(session, continuation);
    }
    return;
  }
}

function yeyanCommitmentPayload(continuation: YeyanContinuation): string {
  return JSON.stringify({
    eventId: continuation.eventId,
    ownerId: continuation.ownerId,
    greaterYeyan: continuation.greaterYeyan,
    costCardIds: continuation.costCardIds,
    allocations: continuation.allocations,
  });
}

function yeyanCursorPayload(continuation: YeyanContinuation): string {
  return JSON.stringify({
    stage: continuation.stage,
    nextAllocationIndex: continuation.nextAllocationIndex,
  });
}

export function assertYeyanContinuation(session: GameSession, continuation: YeyanContinuation): void {
  const seatOrder = [continuation.ownerId, ...allOpponentsInSeatOrder(session, continuation.ownerId)];
  let previousSeatIndex = -1;
  let totalDamage = 0;
  for (const allocation of continuation.allocations) {
    const seatIndex = seatOrder.indexOf(allocation.targetId);
    if (seatIndex <= previousSeatIndex || !Number.isSafeInteger(allocation.amount) || allocation.amount < 1 || allocation.amount > 3) {
      throw new Error("业炎冻结分配的座次或伤害值已被篡改。");
    }
    previousSeatIndex = seatIndex;
    totalDamage += allocation.amount;
  }
  const hasGreaterAllocation = continuation.allocations.some((allocation) => allocation.amount >= 2);
  const limitedUse = session.completeRules.lifecycle.limitedUses.find((entry) =>
    entry.ownerId === continuation.ownerId && entry.skillId === "yeyan");
  const commitments = commitmentEffects(session, "yeyan_commitment", "eventId", continuation.eventId);
  const commitment = commitments[0];
  if (
    continuation.eventId <= 0 || continuation.eventId >= session.nextEventId ||
    limitedUse?.consumedAtEventId !== continuation.eventId || commitments.length !== 1 || !commitment ||
    commitment.ownerId !== continuation.ownerId || commitment.sourcePlayerId !== continuation.ownerId ||
    commitment.sourceSkillId !== "yeyan" || commitment.payload.commitment !== yeyanCommitmentPayload(continuation) ||
    commitment.payload.cursor !== yeyanCursorPayload(continuation) ||
    !hasExactPayloadKeys(commitment, ["eventId", "commitment", "cursor"]) ||
    commitment.visibility !== "server_only" || commitment.expiry.type !== "game_end" ||
    continuation.allocations.length < 1 || continuation.allocations.length > 3 || totalDamage > 3 ||
    hasGreaterAllocation !== continuation.greaterYeyan ||
    new Set(continuation.costCardIds).size !== continuation.costCardIds.length ||
    continuation.costCardIds.length !== (continuation.greaterYeyan ? 4 : 0) ||
    !Number.isSafeInteger(continuation.nextAllocationIndex) || continuation.nextAllocationIndex < 0 ||
    continuation.nextAllocationIndex > continuation.allocations.length ||
    continuation.stage === "after_cost" && (!continuation.greaterYeyan || continuation.nextAllocationIndex !== 0) ||
    session.currentPlayerId !== continuation.ownerId
  ) {
    throw new Error("业炎续体与已承诺的限定技状态不一致。");
  }
}

function advanceYeyanCursor(
  session: GameSession,
  current: YeyanContinuation,
  next: YeyanContinuation,
): void {
  assertYeyanContinuation(session, current);
  if (yeyanCommitmentPayload(current) !== yeyanCommitmentPayload(next)) {
    throw new Error("业炎推进时不得改变已承诺的费用或伤害分配。");
  }
  const currentEffect = commitmentEffects(session, "yeyan_commitment", "eventId", current.eventId)[0]!;
  const effectIndex = session.completeRules.lifecycle.effects.findIndex((effect) => effect.effectId === currentEffect.effectId);
  if (effectIndex < 0) throw new Error("业炎推进缺少唯一的服务端游标。");
  const effect = session.completeRules.lifecycle.effects[effectIndex]!;
  session.completeRules.lifecycle.effects[effectIndex] = {
    ...effect,
    payload: { ...effect.payload, cursor: yeyanCursorPayload(next) },
  };
  assertYeyanContinuation(session, next);
}

function consumeYeyanContinuation(session: GameSession, continuation: YeyanContinuation): void {
  assertYeyanContinuation(session, continuation);
  const effectId = commitmentEffects(session, "yeyan_commitment", "eventId", continuation.eventId)[0]!.effectId;
  consumeCommitmentEffect(session, effectId);
}

function consumeFinishedYeyanContinuation(session: GameSession, continuation: YeyanContinuation): void {
  // finishWithWinner expires game_end state before the restored business
  // continuation observes the terminal shortcut.
  if (commitmentEffects(session, "yeyan_commitment", "eventId", continuation.eventId).length === 0) return;
  consumeYeyanContinuation(session, continuation);
}

function continueYeyanDamage(session: GameSession, initial: YeyanContinuation): void {
  let continuation = cloneYeyanContinuation(initial);
  if (continuation.stage !== "damage") throw new Error("业炎伤害续体阶段无效。");
  if (session.status === "finished") {
    consumeFinishedYeyanContinuation(session, continuation);
    return;
  }
  assertYeyanContinuation(session, continuation);
  while (continuation.nextAllocationIndex < continuation.allocations.length) {
    const allocation = continuation.allocations[continuation.nextAllocationIndex]!;
    const target = getPlayer(session, allocation.targetId);
    const next = {
      ...cloneYeyanContinuation(continuation),
      nextAllocationIndex: continuation.nextAllocationIndex + 1,
    };
    advanceYeyanCursor(session, continuation, next);
    continuation = next;
    if (!target.alive) continue;
    const paused = dealDamageWithChain(
      session,
      target,
      getPlayer(session, continuation.ownerId),
      allocation.amount,
      "fire",
      "受到业炎伤害",
      { type: "yeyan", continuation: cloneYeyanContinuation(continuation) },
    );
    if (paused) return;
    if ((session as { status: GameSession["status"] }).status === "finished") {
      consumeFinishedYeyanContinuation(session, continuation);
      return;
    }
  }
  session.pendingResponse = null;
  const owner = getPlayer(session, continuation.ownerId);
  if (owner.alive) {
    session.turn.phase = "play";
    consumeYeyanContinuation(session, continuation);
  } else if (session.status === "playing" && session.currentPlayerId === owner.id) {
    consumeYeyanContinuation(session, continuation);
    beginNextTurn(session);
  } else {
    consumeYeyanContinuation(session, continuation);
  }
}

function continueYeyanAfterCost(session: GameSession, continuation: YeyanContinuation): void {
  assertYeyanContinuation(session, continuation);
  if (continuation.stage !== "after_cost") throw new Error("大业炎费用续体阶段无效。");
  session.pendingResponse = null;
  const damageContinuation: YeyanContinuation = {
    ...cloneYeyanContinuation(continuation),
    stage: "damage",
    nextAllocationIndex: 0,
  };
  advanceYeyanCursor(session, continuation, damageContinuation);
  const owner = getPlayer(session, continuation.ownerId);
  if (!owner.alive) {
    continueYeyanDamage(session, damageContinuation);
    return;
  }
  const enteredDying = loseHp(session, owner, 3, "因大业炎代价", {
    type: "yeyan",
    continuation: cloneYeyanContinuation(damageContinuation),
  });
  if (!enteredDying) continueYeyanDamage(session, damageContinuation);
}

function pauseYeyanForAfterMove(session: GameSession, continuation: YeyanContinuation): void {
  assertYeyanContinuation(session, continuation);
  if (continuation.stage !== "after_cost") throw new Error("仅大业炎费用可等待牌移动后续。");
  session.turn.phase = "respond";
  session.pendingResponse = {
    type: "standard_skill",
    targetId: continuation.ownerId,
    promptId: standardPromptId(continuation.eventId, "yeyan", continuation.ownerId, "after-cost"),
    eventId: continuation.eventId,
    skillId: "yeyan",
    stage: "yeyan_after_cost",
    yeyanContinuation: cloneYeyanContinuation(continuation),
  };
  offerNextAfterMoveSkill(session);
}

function beginCommittedTrickEffect(
  session: GameSession,
  effect: Exclude<PendingTrickEffect, { readonly type: "delayed_trick" }>,
  cardKind: Exclude<PendingNullificationResponse["cardKind"], "le_bu_si_shu" | "bing_liang_cun_duan" | "shan_dian">,
): void {
  const source = getPlayer(session, trickEffectSourceId(effect));
  const continuation: WumouContinuation = { type: "trick_effect", cardKind, effect: cloneTrickEffect(effect) as typeof effect };
  if (offerWumouCost(session, source, continuation)) return;
  beginNullification(session, effect, cardKind);
}

function resolveTrickEffect(session: GameSession, effect: PendingTrickEffect, negated: boolean): void {
  session.pendingResponse = null;
  if (negated) {
    const targetId = effect.type === "mass_attack" ? effect.pending.targetId : effect.targetId;
    const kind = effect.type === "mass_attack"
      ? effect.pending.cardKind
      : effect.type === "delayed_trick" || effect.type === "zone_trick" ? effect.cardKind : effect.type;
    addLog(session, "card", `${targetId} 受到的${cardName(kind)}效果被无懈可击抵消。`);
    if (effect.type === "mass_attack") {
      advanceMassAttack(session, effect.pending);
      return;
    }
    if (effect.type === "peach_garden") {
      advancePeachGarden(session, effect);
      return;
    }
    if (effect.type === "iron_chain") {
      advanceIronChain(session, effect);
      return;
    }
    if (effect.type === "amazing_grace") {
      advanceAmazingGrace(session, effect);
      return;
    }
    finishTrickResolution(session);
    return;
  }

  if (effect.type === "ex_nihilo") {
    const target = getPlayer(session, effect.targetId);
    if (!target.alive) {
      addLog(session, "card", `${target.id} 已死亡，无中生有不再摸牌。`);
      finishTrickResolution(session);
      return;
    }
    const drawn = drawCards(session, target, 2);
    addLog(session, "card", `${target.id} 因无中生有摸了 ${drawn} 张牌。`);
    finishTrickResolution(session);
    return;
  }
  if (effect.type === "duel") {
    const initiator = getPlayer(session, effect.sourceId);
    const target = getPlayer(session, effect.targetId);
    if (!target.alive) {
      finishTrickResolution(session);
      return;
    }
    const duel: Extract<PendingResponse, { type: "duel" }> = {
      type: "duel",
      attackerId: effect.sourceId,
      targetId: effect.targetId,
      cardId: effect.cardId,
      initiatorId: effect.sourceId,
      originalTargetId: effect.targetId,
      requiredSlashCount: wushuangResponseCount(session, initiator),
      slashesPlayed: 0,
    };
    createDuelResponseCommitment(session, duel);
    session.turn.phase = "respond";
    session.pendingResponse = duel;
    addLog(session, "card", `决斗生效，轮到 ${effect.targetId} 打出杀。`);
    return;
  }
  if (effect.type === "mass_attack") {
    session.turn.phase = "respond";
    session.pendingResponse = { ...effect.pending };
    addLog(session, "card", `${cardName(effect.pending.cardKind)}对 ${effect.pending.targetId} 生效，等待其响应。`);
    return;
  }
  if (effect.type === "peach_garden") {
    const target = getPlayer(session, effect.targetId);
    if (target.alive && target.hp < target.maxHp) {
      recoverLivePlayer(session, target, 1, effect.sourceId, "peach_garden");
      addLog(session, "card", `${target.id} 因桃园结义回复了 1 点体力。`);
    }
    advancePeachGarden(session, effect);
    return;
  }
  if (effect.type === "fire_attack") {
    const source = getPlayer(session, effect.sourceId);
    const victim = getPlayer(session, effect.targetId);
    if (!source.alive || !victim.alive || victim.hand.length === 0) {
      addLog(session, "card", `${victim.id} 已没有手牌，火攻结算结束。`);
      finishTrickResolution(session);
      return;
    }
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "fire_attack_reveal",
      attackerId: effect.sourceId,
      targetId: victim.id,
      cardId: effect.cardId,
    };
    addLog(session, "card", `火攻生效，等待 ${victim.id} 展示一张手牌。`);
    return;
  }
  if (effect.type === "borrowed_sword") {
    const holder = getPlayer(session, effect.targetId);
    const attackTarget = getPlayer(session, effect.attackTargetId);
    if (!holder.alive || !attackTarget.alive || !holder.equipment.weapon) {
      addLog(session, "card", `${holder.id} 已没有武器，借刀杀人结算结束。`);
      finishTrickResolution(session);
      return;
    }
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "borrowed_sword",
      attackerId: effect.sourceId,
      targetId: holder.id,
      attackTargetId: effect.attackTargetId,
      cardId: effect.cardId,
    };
    addLog(session, "card", `借刀杀人生效，等待 ${holder.id} 对 ${effect.attackTargetId} 使用杀。`);
    return;
  }
  if (effect.type === "iron_chain") {
    const target = getPlayer(session, effect.targetId);
    if (target.alive) {
      target.chained = !target.chained;
      addLog(session, "card", `${target.id} ${target.chained ? "进入" : "解除"}连环状态。`);
    }
    advanceIronChain(session, effect);
    return;
  }
  if (effect.type === "amazing_grace") {
    const target = getPlayer(session, effect.targetId);
    if (!target.alive || effect.pool.length === 0) {
      advanceAmazingGrace(session, effect);
      return;
    }
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "amazing_grace_selection",
      attackerId: effect.sourceId,
      targetId: target.id,
      cardId: effect.cardId,
      pool: effect.pool.map(cloneCard),
      remainingTargetIds: [...effect.remainingTargetIds],
    };
    addLog(session, "card", `五谷丰登对 ${target.id} 生效，等待其从亮出牌中选择一张。`);
    return;
  }
  if (effect.type === "zone_trick") {
    const source = getPlayer(session, effect.sourceId);
    const victim = getPlayer(session, effect.targetId);
    if (!source.alive || !victim.alive || !hasCardsInAnyZone(victim)) {
      addLog(session, "card", `${victim.id} 已没有可选择的区域牌，${cardName(effect.cardKind)}结算结束。`);
      finishTrickResolution(session);
      return;
    }
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "zone_selection",
      attackerId: effect.sourceId,
      targetId: effect.sourceId,
      victimId: effect.targetId,
      cardId: effect.cardId,
      cardKind: effect.cardKind,
      mode: effect.cardKind === "guo_he_chai_qiao" ? "discard" : "gain",
    };
    addLog(session, "card", `${effect.cardKind === "guo_he_chai_qiao" ? "过河拆桥" : "顺手牵羊"}生效，等待 ${effect.sourceId} 选择 ${effect.targetId} 区域内的一张牌。`);
    return;
  }
  const target = getLivingPlayer(session, effect.targetId);
  target.judgment.push(takeResolvingCard(session, effect.cardId));
  addLog(session, "card", `${effect.cardKind === "shan_dian" ? target.id : `${effect.sourceId} 对 ${target.id}`} 的${cardName(effect.cardKind)}进入判定区。`);
  finishTrickResolution(session);
}

function beginNullification(
  session: GameSession,
  effect: PendingTrickEffect,
  cardKind: PendingNullificationResponse["cardKind"],
): void {
  if (effect.type === "mass_attack") assertRestorableMassAttackResponse(session, effect.pending);
  const effectTargetId = effect.type === "mass_attack" ? effect.pending.targetId : effect.targetId;
  const sourceId = effect.type === "mass_attack" ? effect.pending.attackerId : effect.sourceId;
  const cardId = effect.type === "mass_attack" ? effect.pending.cardId : effect.cardId;
  if (!getPlayer(session, effectTargetId).alive) {
    resolveTrickEffect(session, effect, false);
    return;
  }
  const responders = initialNullificationResponders(session, effectTargetId);
  const [firstResponder, ...remainingResponderIds] = responders;
  if (!firstResponder) {
    resolveTrickEffect(session, effect, false);
    return;
  }
  session.turn.phase = "respond";
  const pending: PendingNullificationResponse = {
    type: "nullification",
    attackerId: sourceId,
    targetId: firstResponder,
    effectTargetId,
    cardId,
    cardKind,
    remainingResponderIds,
    negated: false,
    effect,
  };
  createNullificationResponseCommitment(session, pending);
  session.pendingResponse = pending;
  addLog(session, "card", `${cardName(cardKind)}对 ${effectTargetId} 生效前，等待无懈可击。`);
}

function applyNullificationResponse(
  session: GameSession,
  pending: PendingNullificationResponse,
  responder: GamePlayer,
  cardId: CardId | null | undefined,
): void {
  if (cardId != null) {
    const card = responder.hand.find((candidate) => candidate.id === cardId);
    if (!card) ruleError("CARD_NOT_FOUND", `手牌中不存在 ${cardId}。`);
    if (card.kind !== "wu_xie_ke_ji" || isWushenLockedHeartHandCard(session, responder, card)) {
      ruleError("INVALID_RESPONSE", "当前只能打出有效牌名为无懈可击的牌。");
    }
    session.resolvingCards.push(removeCard(session, responder, card.id));
    if (offerWumouCost(session, responder, {
      type: "nullification",
      responderId: responder.id,
      responseCardId: card.id,
      pending: {
        ...pending,
        remainingResponderIds: [...pending.remainingResponderIds],
        effect: cloneTrickEffect(pending.effect),
      },
    })) return;
    continuePlayedNullification(session, pending, responder.id);
    return;
  }
  for (const [index, playerId] of pending.remainingResponderIds.entries()) {
    const candidate = getPlayer(session, playerId);
    if (!candidate.alive || !hasNullification(session, candidate)) continue;
    const next = {
      ...pending,
      targetId: candidate.id,
      remainingResponderIds: pending.remainingResponderIds.slice(index + 1),
    };
    updateNullificationResponseCommitment(session, next);
    session.pendingResponse = next;
    return;
  }
  consumeNullificationResponseCommitment(session, pending);
  resolveTrickEffect(session, pending.effect, pending.negated);
}

function zoneSelectionChoices(player: GamePlayer): Array<{
  token: string;
  zone: "hand" | "equipment" | "judgment";
  card: Card | null;
}> {
  const choices: Array<{ token: string; zone: "hand" | "equipment" | "judgment"; card: Card | null }> =
    player.hand.map((_card, index) => ({ token: `hand:${index}`, zone: "hand", card: null }));
  for (const [slot, card] of Object.entries(player.equipment) as Array<[EquipmentSlot, Card]>) {
    choices.push({ token: `equipment:${slot}`, zone: "equipment", card: cloneCard(card) });
  }
  for (const [index, card] of player.judgment.entries()) {
    choices.push({ token: `judgment:${index}`, zone: "judgment", card: cloneCard(card) });
  }
  return choices;
}

function applyZoneSelection(
  session: GameSession,
  action: Extract<GameAction, { type: "choose_zone_card" }>,
): void {
  const pending = session.pendingResponse;
  if (session.turn.phase !== "respond" || pending?.type !== "zone_selection" || pending.targetId !== action.playerId) {
    ruleError("INVALID_PHASE", "当前没有需要完成的区域选牌。 ");
  }
  const source = getLivingPlayer(session, action.playerId);
  const victim = getLivingPlayer(session, pending.victimId);
  let selected: Card | undefined;
  let zone: "hand" | "equipment" | "judgment" | undefined;
  if (action.token.startsWith("hand:")) {
    const index = Number(action.token.slice("hand:".length));
    if (Number.isInteger(index) && index >= 0 && index < victim.hand.length) {
      selected = removeCard(session, victim, victim.hand[index]!.id);
      zone = "hand";
    }
  } else if (action.token.startsWith("equipment:")) {
    const slot = action.token.slice("equipment:".length) as EquipmentSlot;
    if (["weapon", "armor", "offensive_horse", "defensive_horse"].includes(slot)) {
      selected = victim.equipment[slot];
      if (selected) {
        selected = loseEquipment(session, victim, slot);
        zone = "equipment";
      }
    }
  } else if (action.token.startsWith("judgment:")) {
    const index = Number(action.token.slice("judgment:".length));
    if (Number.isInteger(index) && index >= 0 && index < victim.judgment.length) {
      [selected] = victim.judgment.splice(index, 1);
      zone = "judgment";
    }
  }
  if (!selected || !zone) ruleError("INVALID_SELECTION", "所选区域牌不存在或已经移动。 ");
  if (zone === "judgment") selected = restoreVirtualOrigin(session, selected);
  if (pending.mode === "gain") {
    source.hand.push(selected);
    addLog(session, "card", `${source.id} 通过顺手牵羊获得了 ${victim.id} ${zone === "hand" ? "的一张手牌" : `区域内的${selected.name}`}。`);
  } else {
    session.discardPile.push(selected);
    addLog(session, "card", `${source.id} 通过过河拆桥弃置了 ${victim.id} 的${selected.name}。`);
  }
  finishTrickResolution(session);
}

function applyFireAttackHandChoice(
  session: GameSession,
  action: Extract<GameAction, { type: "choose_hand_card" }>,
): void {
  const pending = session.pendingResponse;
  if (
    session.turn.phase !== "respond" ||
    (pending?.type !== "fire_attack_reveal" && pending?.type !== "fire_attack_discard") ||
    pending.targetId !== action.playerId
  ) {
    ruleError("INVALID_PHASE", "当前没有需要完成的火攻选牌。");
  }

  if (pending.type === "fire_attack_reveal") {
    if (!action.cardId) ruleError("INVALID_SELECTION", "火攻目标必须展示一张手牌。");
    const victim = getLivingPlayer(session, action.playerId);
    const revealed = victim.hand.find((card) => card.id === action.cardId);
    if (!revealed) ruleError("CARD_NOT_FOUND", `手牌中不存在 ${action.cardId}。`);
    const source = getLivingPlayer(session, pending.attackerId);
    const revealedSuit = effectiveCardSuit(session, victim, revealed);
    const matching = source.hand.filter((card) => effectiveCardSuit(session, source, card) === revealedSuit);
    addLog(session, "card", `${victim.id} 展示了${revealed.name}（${suitName(revealedSuit)} ${revealed.rank}）。`);
    if (matching.length === 0) {
      addLog(session, "card", `${source.id} 没有同花色手牌可弃，火攻结算结束。`);
      finishTrickResolution(session);
      return;
    }
    session.pendingResponse = {
      type: "fire_attack_discard",
      attackerId: source.id,
      targetId: source.id,
      victimId: victim.id,
      cardId: pending.cardId,
      revealedCardId: revealed.id,
    };
    addLog(session, "card", `等待 ${source.id} 弃置一张${suitName(revealedSuit)}手牌，或放弃火攻伤害。`);
    return;
  }

  if (action.cardId == null) {
    addLog(session, "card", `${action.playerId} 放弃弃牌，火攻未造成伤害。`);
    finishTrickResolution(session);
    return;
  }
  const source = getLivingPlayer(session, action.playerId);
  const victim = getLivingPlayer(session, pending.victimId);
  const revealed = victim.hand.find((card) => card.id === pending.revealedCardId);
  if (!revealed) ruleError("INVALID_SELECTION", "火攻展示牌已不在目标手中。");
  const payment = source.hand.find((card) => card.id === action.cardId);
  if (!payment) ruleError("CARD_NOT_FOUND", `手牌中不存在 ${action.cardId}。`);
  if (effectiveCardSuit(session, source, payment) !== effectiveCardSuit(session, victim, revealed)) {
    ruleError("INVALID_SELECTION", "火攻只能弃置与展示牌有效花色相同的手牌。");
  }
  session.resolvingCards.push(removeCard(session, source, payment.id));
  session.pendingResponse = null;
  session.turn.phase = "play";
  addLog(session, "card", `${source.id} 弃置${payment.name}，对 ${victim.id} 造成火攻伤害。`);
  const enteredDying = dealDamageWithChain(
    session,
    victim,
    source,
    1,
    "fire",
    "受到火攻影响",
    { type: "finish_effect" },
    false,
    [pending.cardId],
  );
  if (!enteredDying) finishTrickResolution(session);
}

function applyAmazingGraceSelection(
  session: GameSession,
  action: Extract<GameAction, { type: "choose_amazing_grace_card" }>,
): void {
  const pending = session.pendingResponse;
  if (session.turn.phase !== "respond" || pending?.type !== "amazing_grace_selection" || pending.targetId !== action.playerId) {
    ruleError("INVALID_PHASE", "当前没有需要完成的五谷丰登选牌。");
  }
  const index = pending.pool.findIndex((card) => card.id === action.cardId);
  if (index < 0) ruleError("INVALID_SELECTION", "所选五谷丰登亮出牌不存在或已被取得。");
  const [selected] = pending.pool.splice(index, 1);
  if (!selected) throw new Error("五谷丰登移除亮出牌失败。");
  const player = getLivingPlayer(session, action.playerId);
  player.hand.push(selected);
  addLog(session, "card", `${player.id} 从五谷丰登中获得${selected.name}。`);
  advanceAmazingGrace(session, {
    type: "amazing_grace",
    sourceId: pending.attackerId,
    targetId: pending.targetId,
    cardId: pending.cardId,
    pool: pending.pool,
    remainingTargetIds: pending.remainingTargetIds,
  });
}

function applyBorrowedSwordResponse(
  session: GameSession,
  pending: Extract<PendingResponse, { type: "borrowed_sword" }>,
  holder: GamePlayer,
  cardId: CardId | null | undefined,
  cardIds?: readonly CardId[],
): void {
  const source = getPlayer(session, pending.attackerId);
  if (cardId == null && (!cardIds || cardIds.length === 0)) {
    const weapon = holder.equipment.weapon;
    if (weapon && source.alive) {
      source.hand.push(loseEquipment(session, holder, "weapon"));
      addLog(session, "card", `${holder.id} 未使用杀，将武器${weapon.name}交给 ${source.id}。`);
    } else if (weapon) {
      addLog(session, "card", `${holder.id} 未使用杀，但锦囊使用者已死亡，武器留在原处。`);
    }
    finishTrickResolution(session);
    return;
  }
  const target = getLivingPlayer(session, pending.attackTargetId);
  if (!isInSlashRange(session, holder.id, target.id)) {
    ruleError("INVALID_TARGET", `${target.id} 已不在 ${holder.id} 的攻击范围内。`);
  }
  const response = playSlashResponseCards(session, holder, cardId, cardIds);
  if (!response) throw new Error("借刀杀人响应牌解析失败。");
  session.resolvingCards.push(...response.cards);
  addLog(session, "card", `${holder.id} 响应借刀杀人，对 ${target.id} 使用${response.name}。`);
  const slashKind = response.slashKind;
  beginSlashTarget(session, {
    type: "slash",
    attackerId: holder.id,
    targetId: target.id,
    cardId: response.cards[0]!.id,
    damageCardIds: response.cards.map((card) => card.id),
    slashKind,
    damage: 1,
    nature: damageNatureForSlash(slashKind),
    color: response.color,
    armorIgnored: false,
    requiredDodgeCount: wushuangResponseCount(session, holder),
    dodgesPlayed: 0,
    remainingTargetIds: [],
    zhuQueChecked: false,
    ciXiongChecked: false,
    liegongChecked: false,
    useProvenance: {
      method: "use",
      turnPlayerId: session.turn.playerId,
      phase: session.turn.phase,
    },
    completion: { type: "default" },
  });
}

function playEquipment(
  session: GameSession,
  player: GamePlayer,
  card: Card,
  targetId: PlayerId | undefined,
): void {
  assertOptionalSelfTarget(player, targetId, card.name);
  const slot = getCardDefinition(card.kind).equipmentSlot;
  if (!slot) throw new Error(`${card.name} 缺少装备槽定义。`);
  const played = removeCard(session, player, card.id);
  const replaced = player.equipment[slot];
  if (replaced) {
    session.discardPile.push(loseEquipment(session, player, slot));
  }
  player.equipment[slot] = played;
  addLog(session, "card", `${player.id} 装备了${card.name}${replaced ? `，替换了${replaced.name}` : ""}。`);
}

function assertExplicitTrickTargets(
  session: GameSession,
  player: GamePlayer,
  card: Card,
  action: Pick<Extract<GameAction, { type: "play_card" }>, "targetId" | "targetIds">,
): void {
  if (card.category !== "trick" || card.kind === "wu_xie_ke_ji") return;
  let targetIds: readonly PlayerId[] = [];
  if (card.kind === "ex_nihilo" || card.kind === "shan_dian") {
    targetIds = [player.id];
  } else if (card.kind === "borrowed_sword") {
    targetIds = action.targetIds?.slice(0, 1) ?? [];
  } else if (card.kind === "iron_chain") {
    targetIds = action.targetIds ?? [];
  } else if (
    card.kind !== "barbarian_invasion" && card.kind !== "arrow_barrage" &&
    card.kind !== "peach_garden" && card.kind !== "amazing_grace"
  ) {
    targetIds = action.targetId ? [action.targetId] : [];
  }
  for (const targetId of targetIds) {
    assertWeimuTarget(session, player, card, getLivingPlayer(session, targetId));
  }
}

function commitPlayCard(
  session: GameSession,
  action: Extract<GameAction, { type: "play_card" }>,
): void {
  assertPlayTurn(session, action.playerId);
  const player = getLivingPlayer(session, action.playerId);
  const card = player.hand.find((candidate) => candidate.id === action.cardId);
  if (!card) ruleError("CARD_NOT_FOUND", `手牌中不存在 ${action.cardId}。`);
  assertExplicitTrickTargets(session, player, card, action);

  if (isSlashCardKind(card.kind)) {
    playSlash(session, player, card, action.targetId, action.targetIds);
    return;
  }
  if (card.category === "equipment") {
    playEquipment(session, player, card, action.targetId);
    return;
  }
  switch (card.kind) {
    case "peach":
      playPeach(session, player, card, action.targetId);
      return;
    case "wine":
      playWine(session, player, card, action.targetId);
      return;
    case "ex_nihilo":
      playExNihilo(session, player, card, action.targetId);
      return;
    case "duel":
      playDuel(session, player, card, action.targetId);
      return;
    case "barbarian_invasion":
    case "arrow_barrage":
      playMassAttack(session, player, card, action.targetId);
      return;
    case "peach_garden":
      playPeachGarden(session, player, card, action.targetId);
      return;
    case "le_bu_si_shu":
    case "bing_liang_cun_duan":
    case "shan_dian":
      playDelayedTrick(session, player, card, action.targetId);
      return;
    case "wu_xie_ke_ji":
      ruleError("INVALID_CARD", "无懈可击只能用于响应锦囊牌。 ");
    case "guo_he_chai_qiao":
    case "shun_shou_qian_yang":
      playZoneTrick(session, player, card, action.targetId);
      return;
    case "fire_attack":
      playFireAttack(session, player, card, action.targetId);
      return;
    case "amazing_grace":
      playAmazingGrace(session, player, card, action.targetId);
      return;
    case "borrowed_sword":
      playBorrowedSword(session, player, card, action.targetIds);
      return;
    case "iron_chain":
      playIronChain(session, player, card, action.targetIds);
      return;
    case "dodge":
      ruleError("INVALID_CARD", "闪不能在出牌阶段主动使用。");
  }
}

const ORDINARY_TRICK_KINDS = new Set<CardKind>([
  "ex_nihilo",
  "duel",
  "barbarian_invasion",
  "arrow_barrage",
  "peach_garden",
  "guo_he_chai_qiao",
  "shun_shou_qian_yang",
  "fire_attack",
  "amazing_grace",
  "borrowed_sword",
  "iron_chain",
]);

function canonicalCardUseTargets(
  session: GameSession,
  player: GamePlayer,
  physical: Card,
  effectiveKind: CardKind,
  action: Pick<Extract<GameAction, { type: "play_card" }>, "targetId" | "targetIds">,
): PlayerId[] {
  const effectiveCard: Card = physical.kind === effectiveKind
    ? physical
    : {
        ...getCardDefinition(effectiveKind),
        id: physical.id,
        kind: effectiveKind,
        suit: physical.suit,
        rank: physical.rank,
      };
  if (effectiveKind === "ex_nihilo") return [player.id];
  if (effectiveKind === "barbarian_invasion" || effectiveKind === "arrow_barrage") {
    return livingOpponentsInSeatOrder(session, player.id)
      .filter((target) => !isMassAttackImmune(session, target, effectiveKind))
      .filter((target) => !isForestNanmanImmune(session, target, effectiveKind))
      .filter((target) => !isWeimuProhibited(session, player, effectiveCard, target, "global_auto_target"))
      .map((target) => target.id);
  }
  if (effectiveKind === "peach_garden") {
    return livingPlayersInSeatOrderFrom(session, player)
      .filter((target) => target.hp < target.maxHp)
      .filter((target) => !isWeimuProhibited(session, player, effectiveCard, target, "global_auto_target"))
      .map((target) => target.id);
  }
  if (effectiveKind === "amazing_grace") {
    return livingPlayersInSeatOrderFrom(session, player)
      .filter((target) => !isWeimuProhibited(session, player, effectiveCard, target, "global_auto_target"))
      .map((target) => target.id);
  }
  if (isSlashCardKind(effectiveKind)) {
    return [...(action.targetIds ?? (action.targetId ? [action.targetId] : []))];
  }
  if (effectiveKind === "borrowed_sword" || effectiveKind === "iron_chain") {
    return [...(action.targetIds ?? [])];
  }
  return action.targetId ? [action.targetId] : [];
}

function actionForCardUseIntent(intent: CardUseIntent): Extract<GameAction, { type: "play_card" }> {
  if (
    intent.effectiveKind === "borrowed_sword" ||
    intent.effectiveKind === "iron_chain" ||
    (isSlashCardKind(intent.effectiveKind) && intent.targetIds.length > 1)
  ) {
    return {
      type: "play_card",
      playerId: intent.sourceId,
      cardId: intent.physicalCardId,
      targetIds: [...intent.targetIds],
    };
  }
  if (
    intent.effectiveKind === "barbarian_invasion" ||
    intent.effectiveKind === "arrow_barrage" ||
    intent.effectiveKind === "peach_garden" ||
    intent.effectiveKind === "amazing_grace"
  ) {
    return { type: "play_card", playerId: intent.sourceId, cardId: intent.physicalCardId };
  }
  return {
    type: "play_card",
    playerId: intent.sourceId,
    cardId: intent.physicalCardId,
    targetId: intent.targetIds[0],
  };
}

function assertIntentPhysicalCard(intent: CardUseIntent, physical: Card): void {
  if (
    physical.kind !== intent.physicalKind ||
    physical.suit !== intent.suit ||
    physical.rank !== intent.rank
  ) {
    ruleError("INVALID_CARD", `用牌续体中的实体牌 ${intent.physicalCardId} 已发生变化。`);
  }
}

function commitCardUseIntent(session: GameSession, intent: CardUseIntent): void {
  const player = getLivingPlayer(session, intent.sourceId);
  const physical = intent.viaSkill === "jixi"
    ? (player.extraPiles.field ?? []).find((card) => card.id === intent.physicalCardId)
    : intent.viaSkill === "guhuo"
    ? player.hand.find((card) => card.id === intent.physicalCardId) ??
      session.resolvingCards.find((card) => card.id === intent.physicalCardId)
    : ownedCard(player, intent.physicalCardId);
  if (!physical) ruleError("CARD_NOT_FOUND", `用牌实体牌 ${intent.physicalCardId} 已不在合法区域。`);
  assertIntentPhysicalCard(intent, physical);
  const action = actionForCardUseIntent(intent);

  if (intent.viaSkill === "duanliang" && intent.effectiveKind === "bing_liang_cun_duan") {
    if (intent.targetIds.length !== 1 || (intent.additionalPhysicalCards?.length ?? 0) > 0) {
      throw new Error("断粮续体必须包含一张实体牌和一个目标。");
    }
    if (!hasEffectiveSkill(session, player, "duanliang")) {
      ruleError("INVALID_SKILL", `${player.id} 已失去技能断粮。`);
    }
    const target = getLivingPlayer(session, intent.targetIds[0]!);
    const fromHand = player.hand.some((card) => card.id === physical.id);
    const distanceBeforePayment = distanceBetweenPlayers(session, player.id, target.id);
    const virtualCard: Card = {
      ...getCardDefinition("bing_liang_cun_duan"),
      id: physical.id,
      kind: "bing_liang_cun_duan",
      suit: physical.suit,
      rank: physical.rank,
    };
    const targetAlreadyHasSupplyShortage = target.judgment.some((card) => card.kind === "bing_liang_cun_duan");
    const decision = evaluateDuanliang({
      context: forestPlayContext(session, player, "duanliang"),
      card: forestRuleCard(player, physical, fromHand ? "hand" : "equipment"),
      effectiveSuit: effectiveCardSuit(session, player, physical),
      targetId: target.id,
      targetAlive: target.alive,
      distance: distanceBeforePayment,
      targetLegalIgnoringDistance: target.id !== player.id && !targetAlreadyHasSupplyShortage &&
        !isWeimuProhibited(session, player, virtualCard, target, "direct_target"),
      targetAlreadyHasSupplyShortage,
    });
    if (!decision.ok || physical.suit !== "spade" && physical.suit !== "club") {
      ruleError("INVALID_CARD", "断粮只能将一张印刷及有效黑色的基本牌或装备牌当作兵粮寸断使用，目标距离至多为 2。 ");
    }
    withVirtualDelayedCard(session, player, physical.id, "bing_liang_cun_duan", () => {
      const virtual = player.hand.find((card) => card.id === physical.id);
      if (!virtual) throw new Error("断粮虚拟兵粮寸断没有进入临时手牌区。");
      playDelayedTrick(session, player, virtual, target.id, distanceBeforePayment);
    });
    return;
  }

  if (intent.viaSkill === "guhuo") {
    if (!isGuhuoDeclarableKind(intent.effectiveKind)) throw new Error("蛊惑续体包含不可声明牌名。");
    withGuhuoVirtualCard(session, player, physical.id, intent.effectiveKind, () => commitPlayCard(session, action));
    return;
  }

  if (intent.viaSkill === "jixi" && intent.effectiveKind === "shun_shou_qian_yang") {
    if (intent.targetIds.length !== 1 || (intent.additionalPhysicalCards?.length ?? 0) > 0 ||
        !hasEffectiveSkill(session, player, "jixi")) {
      ruleError("INVALID_SKILL", "急袭续体必须由有效急袭将一张田当作顺手牵羊使用。");
    }
    const target = getLivingPlayer(session, intent.targetIds[0]!);
    const distanceBeforePayment = distanceBetweenPlayers(session, player.id, target.id);
    const virtualCard: Card = {
      ...getCardDefinition("shun_shou_qian_yang"),
      id: physical.id,
      kind: "shun_shou_qian_yang",
      suit: physical.suit,
      rank: physical.rank,
    };
    const decision = evaluateJixi({
      context: {
        actorId: player.id,
        currentPlayerId: session.currentPlayerId,
        phase: session.turn.phase,
        actorAlive: player.alive,
        skillEffective: true,
      },
      fieldCard: mountainRuleCard(session, player, physical, "field"),
      targetId: target.id,
      targetAlive: target.alive,
      targetCanBeTargetedBySnatch: canBeQianxunTarget(session, target) &&
        !isWeimuProhibited(session, player, virtualCard, target, "direct_target"),
      effectiveDistance: distanceBeforePayment,
      snatchDistanceLimit: hasEffectiveSkill(session, player, "qicai") ? Number.MAX_SAFE_INTEGER : 1,
      targetCards: tiaoxinTargetCards(session, target),
    });
    if (!decision.ok) {
      ruleError(decision.code === "invalid_card" ? "INVALID_CARD" : "INVALID_TARGET", decision.detail);
    }
    withFieldVirtualCard(session, player, physical.id, "shun_shou_qian_yang", () => {
      const virtual = player.hand.find((card) => card.id === physical.id);
      if (!virtual) throw new Error("急袭虚拟顺手牵羊没有进入临时手牌区。");
      assertExplicitTrickTargets(session, player, virtual, action);
      playZoneTrick(session, player, virtual, target.id, distanceBeforePayment);
    });
    return;
  }

  if (intent.viaSkill === null && intent.physicalKind === intent.effectiveKind) {
    if ((intent.additionalPhysicalCards?.length ?? 0) > 0) {
      throw new Error("普通实体牌续体不能附带额外实体牌。");
    }
    if (!player.hand.some((card) => card.id === physical.id)) {
      ruleError("CARD_NOT_FOUND", `手牌中不存在 ${physical.id}。`);
    }
    commitPlayCard(session, action);
    return;
  }

  if (intent.viaSkill === "luanji" && intent.effectiveKind === "arrow_barrage") {
    const [additional] = intent.additionalPhysicalCards ?? [];
    if (!additional || intent.additionalPhysicalCards?.length !== 1) {
      throw new Error("乱击续体必须包含两张实体牌。");
    }
    const first = player.hand.find((card) => card.id === physical.id);
    const second = player.hand.find((card) => card.id === additional.id);
    if (!first || !second || first.id === second.id) {
      ruleError("CARD_NOT_FOUND", "乱击的两张实体牌已不在使用者手牌中。");
    }
    if (second.kind !== additional.kind || second.suit !== additional.suit || second.rank !== additional.rank) {
      ruleError("INVALID_CARD", `用牌续体中的实体牌 ${additional.id} 已发生变化。`);
    }
    const decision = evaluateLuanji({
      context: firePlayContext(session, player, "luanji"),
      cards: [fireRuleCard(session, player, first, "hand"), fireRuleCard(session, player, second, "hand")],
    });
    if (!decision.ok) ruleError("INVALID_CARD", "乱击只能使用两张有效花色相同的手牌。");
    const firstRemoved = removeCard(session, player, first.id);
    const secondRemoved = removeCard(session, player, second.id);
    session.resolvingCards.push(firstRemoved, secondRemoved);
    const virtual: Card = {
      ...getCardDefinition("arrow_barrage"),
      id: firstRemoved.id,
      kind: "arrow_barrage",
      suit: firstRemoved.suit,
      rank: firstRemoved.rank,
    };
    beginMassAttackResolution(session, player, virtual, [firstRemoved.id, secondRemoved.id], "luanji");
    return;
  }

  if ((intent.additionalPhysicalCards?.length ?? 0) > 0) {
    throw new Error("单实体转化牌续体不能附带额外实体牌。");
  }
  const supported =
    (intent.viaSkill === "qixi" && intent.effectiveKind === "guo_he_chai_qiao") ||
    (intent.viaSkill === "huoji" && intent.effectiveKind === "fire_attack") ||
    (intent.viaSkill === "lianhuan" && intent.effectiveKind === "iron_chain") ||
    (intent.viaSkill === "shuangxiong" && intent.effectiveKind === "duel");
  if (!supported) {
    throw new Error(`尚不支持续体提交转化牌 ${intent.viaSkill ?? "unknown"}:${intent.effectiveKind}。`);
  }
  if (intent.viaSkill !== "qixi" && !hasEffectiveSkill(session, player, intent.viaSkill)) {
    ruleError("INVALID_SKILL", `${player.id} 已失去技能 ${intent.viaSkill}。`);
  }
  if (intent.viaSkill === "qixi" && !isBlackCard(session, player, physical)) {
    ruleError("INVALID_CARD", "奇袭只能使用黑色牌。");
  }
  if (intent.viaSkill === "lianhuan") {
    const decision = evaluateLianhuan({
      context: firePlayContext(session, player, "lianhuan"),
      card: fireRuleCard(session, player, physical, "hand"),
      targets: intent.targetIds.map((targetId) => ({
        playerId: targetId,
        alive: getPlayer(session, targetId).alive,
        canBeTargetedByIronChain: true,
      })),
    });
    if (!decision.ok) ruleError("INVALID_CARD", "连环只能将一张梅花手牌当作铁索连环使用或重铸。");
  }
  if (intent.viaSkill === "huoji") {
    const targetId = intent.targetIds[0];
    const target = targetId ? getPlayer(session, targetId) : null;
    const decision = target && intent.targetIds.length === 1
      ? evaluateHuoji({
          context: firePlayContext(session, player, "huoji"),
          card: fireRuleCard(session, player, physical, "hand"),
          target: {
            playerId: target.id,
            alive: target.alive,
            canBeTargetedByFireAttack: true,
            handCardIds: target.hand.map((card) => card.id),
          },
        })
      : null;
    if (!decision?.ok) ruleError("INVALID_CARD", "火计只能将一张红色手牌当作火攻使用。");
  }
  if (intent.viaSkill === "shuangxiong") {
    const judgmentColor = session.turn.shuangxiongJudgmentColor ?? null;
    const decision = judgmentColor === null
      ? null
      : evaluateShuangxiong({
          context: firePlayContext(session, player, "shuangxiong"),
          activatedThisTurn: true,
          finalJudgmentSuit: judgmentColor === "red" ? "heart" : "spade",
          card: fireRuleCard(session, player, physical, "hand"),
        });
    if (!decision?.ok) ruleError("INVALID_CARD", "双雄只能使用与判定结果颜色不同的手牌。");
  }
  if (intent.viaSkill !== "qixi") {
    withVirtualCard(session, player, physical.id, intent.effectiveKind, () => commitPlayCard(session, action));
    return;
  }
  if (session.virtualCardOrigins[physical.id]) {
    throw new Error(`牌 ${physical.id} 已经具有虚拟来源。`);
  }
  const removed = removeOwnedCard(session, player, physical.id);
  assertIntentPhysicalCard(intent, removed);
  session.virtualCardOrigins[removed.id] = removed.kind;
  player.hand.push({
    ...getCardDefinition(intent.effectiveKind),
    id: removed.id,
    kind: intent.effectiveKind,
    suit: removed.suit,
    rank: removed.rank,
  });
  commitPlayCard(session, action);
}

function validateCardUseIntent(session: GameSession, intent: CardUseIntent): void {
  const probe = cloneSession(session);
  commitCardUseIntent(probe, intent);
}

function cardUseIntentCommitmentPayload(intent: CardUseIntent): string {
  return JSON.stringify({
    useId: intent.useId,
    sourceId: intent.sourceId,
    physicalCardId: intent.physicalCardId,
    physicalKind: intent.physicalKind,
    effectiveKind: intent.effectiveKind,
    suit: intent.suit,
    rank: intent.rank,
    additionalPhysicalCards: intent.additionalPhysicalCards?.map((card) => ({ ...card })),
    targetIds: [...intent.targetIds],
    method: intent.method,
    viaSkill: intent.viaSkill,
  });
}

function cardUseCursorPayload(continuation: CardUseContinuation): string {
  return JSON.stringify({
    stage: continuation.stage,
    eventId: continuation.eventId,
    remainingTriggers: continuation.remainingTriggers.map(cloneSkillTriggerRef),
  });
}

function validCardUseCursorPayload(session: GameSession, value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const cursor = JSON.parse(value) as Record<string, unknown>;
    return Object.keys(cursor).length === 3 &&
      (cursor.stage === "card_use_declared" || cursor.stage === "targets_confirmed") &&
      Number.isSafeInteger(cursor.eventId) && (cursor.eventId as number) > 0 &&
      (cursor.eventId as number) < session.nextEventId &&
      Array.isArray(cursor.remainingTriggers) &&
      value === JSON.stringify({
        stage: cursor.stage,
        eventId: cursor.eventId,
        remainingTriggers: cursor.remainingTriggers,
      });
  } catch {
    return false;
  }
}

function assertCardUseIntentCommitment(session: GameSession, intent: CardUseIntent): void {
  const commitment = cardUseIntentCommitmentPayload(intent);
  const matches = commitmentEffects(session, "card_use_commitment", "useId", intent.useId);
  const effect = matches[0];
  if (intent.useId <= 0 || intent.useId >= session.nextUseId || matches.length !== 1 || !effect ||
      effect.ownerId !== intent.sourceId || effect.sourcePlayerId !== intent.sourceId ||
      effect.sourceSkillId !== (intent.viaSkill ?? "card_use") || effect.payload.commitment !== commitment ||
      !validCardUseCursorPayload(session, effect.payload.cursor) ||
      !hasExactPayloadKeys(effect, ["useId", "commitment", "cursor"]) ||
      effect.visibility !== "server_only" || !hasCurrentTurnExpiry(session, effect)) {
    throw new Error("用牌续体与服务端承诺不一致。");
  }
}

export function assertRestorableCardUseContinuation(
  session: GameSession,
  continuation: CardUseContinuation,
): void {
  assertCardUseIntentCommitment(session, continuation.intent);
  const effect = commitmentEffects(session, "card_use_commitment", "useId", continuation.intent.useId)[0]!;
  if (effect.payload.cursor !== cardUseCursorPayload(continuation)) {
    throw new Error("用牌续体与服务端阶段游标不一致。");
  }
}

function advanceCardUseCursor(
  session: GameSession,
  current: CardUseContinuation,
  next: CardUseContinuation,
): void {
  assertRestorableCardUseContinuation(session, current);
  const consumesTrigger = current.stage === next.stage && current.eventId === next.eventId &&
    current.remainingTriggers.length === next.remainingTriggers.length + 1 &&
    JSON.stringify(current.remainingTriggers.slice(1)) === JSON.stringify(next.remainingTriggers);
  const advancesStage = current.stage === "card_use_declared" && next.stage === "targets_confirmed" &&
    current.remainingTriggers.length === 0 && current.eventId !== next.eventId;
  if (cardUseIntentCommitmentPayload(current.intent) !== cardUseIntentCommitmentPayload(next.intent) ||
      (!consumesTrigger && !advancesStage)) {
    throw new Error("用牌续体阶段游标推进无效。");
  }
  const effect = commitmentEffects(session, "card_use_commitment", "useId", current.intent.useId)[0]!;
  const effectIndex = session.completeRules.lifecycle.effects.findIndex((candidate) => candidate.effectId === effect.effectId);
  session.completeRules.lifecycle.effects[effectIndex] = {
    ...effect,
    payload: { ...effect.payload, cursor: cardUseCursorPayload(next) },
  };
  assertRestorableCardUseContinuation(session, next);
}

function consumeCardUseContinuation(session: GameSession, continuation: CardUseContinuation): void {
  assertRestorableCardUseContinuation(session, continuation);
  consumeCommitmentEffect(
    session,
    commitmentEffects(session, "card_use_commitment", "useId", continuation.intent.useId)[0]!.effectId,
  );
}

export function assertRestorableCardUseIntent(session: GameSession, intent: CardUseIntent): void {
  assertCardUseIntentCommitment(session, intent);
  if (intent.viaSkill === "guhuo") return;
  const probe = cloneSession(session);
  probe.pendingResponse = null;
  probe.turn.phase = "play";
  commitCardUseIntent(probe, intent);
}

function triggersForCardUseEvent(
  session: GameSession,
  intent: CardUseIntent,
  stage: CardUseContinuation["stage"],
  eventId: number,
): SkillTriggerRef[] {
  if (intent.method !== "use") return [];
  const source = getLivingPlayer(session, intent.sourceId);
  if (stage === "card_use_declared") {
    if (!ORDINARY_TRICK_KINDS.has(intent.effectiveKind)) return [];
    if (!hasEffectiveSkill(session, source, "jizhi")) {
      const context = jilueContext(session, source);
      if (!context.skillEffective || !context.awakened || context.renMarks < 1) return [];
      return [{
        triggerId: `${eventId}:jilue_jizhi:${source.id}:0`,
        eventId,
        ownerId: source.id,
        skillId: "jilue",
        targetIndex: 0,
        mandatory: false,
      }];
    }
    return [{
      triggerId: `${eventId}:jizhi:${source.id}:0`,
      eventId,
      ownerId: source.id,
      skillId: "jizhi",
      targetIndex: 0,
      mandatory: false,
    }];
  }
  if (intent.effectiveKind !== "duel") return [];
  const owners = [source, ...intent.targetIds.map((targetId) => getLivingPlayer(session, targetId))]
    .filter((candidate, index, all) => all.findIndex((entry) => entry.id === candidate.id) === index)
    .filter((candidate) => hasEffectiveSkill(session, candidate, "jiang"));
  return owners.map((owner, index) => ({
    triggerId: `${eventId}:jiang:${owner.id}:${index}`,
    eventId,
    ownerId: owner.id,
    skillId: "jiang",
    targetIndex: index,
    mandatory: false,
  }));
}

function allocateEventId(session: GameSession): number {
  const eventId = Math.max(session.nextEventId, session.completeRules.nextEventId);
  session.nextEventId = eventId + 1;
  session.completeRules.nextEventId = eventId + 1;
  return eventId;
}

function nextMoveBatchId(session: GameSession): number {
  const batchId = session.completeRules.nextMoveBatchId;
  if (!Number.isSafeInteger(batchId) || batchId <= 0 || batchId >= Number.MAX_SAFE_INTEGER) {
    throw new Error("move batch id exhausted");
  }
  session.completeRules.nextMoveBatchId += 1;
  return batchId;
}

function deckServiceState(session: GameSession): DeckServiceState {
  return {
    drawPile: session.deck.map(cloneCard),
    discardPile: session.discardPile.map(cloneCard),
    rng: { ...session.rng },
    reshufflesRemaining: session.completeRules.reshufflesRemaining,
  };
}

function applyDeckServiceState(session: GameSession, state: DeckServiceState): void {
  session.deck = state.drawPile.map(cloneCard);
  session.discardPile = state.discardPile.map(cloneCard);
  session.rng = { ...state.rng };
  session.completeRules.reshufflesRemaining = state.reshufflesRemaining;
}

const SESSION_PROCESSING_FRAME_ID = Number.MAX_SAFE_INTEGER;

function sessionZoneState(
  session: GameSession,
): { state: AtomicZoneState; processingFrameId: number } {
  return {
    state: {
      deck: session.deck,
      discard: session.discardPile,
      processing: session.resolvingCards.length > 0
        ? { [String(SESSION_PROCESSING_FRAME_ID)]: session.resolvingCards }
        : {},
      players: session.players.map((player) => ({
        id: player.id,
        hand: player.hand,
        equipment: player.equipment,
        judgment: player.judgment,
        extraPiles: player.extraPiles,
      })),
    },
    processingFrameId: SESSION_PROCESSING_FRAME_ID,
  };
}

function commitLiveMoveBatch(
  session: GameSession,
  state: AtomicZoneState,
  batch: MoveBatch,
): readonly MoveRecord[] {
  const losses = new Map<PlayerId, { player: GamePlayer; cards: Array<{ card: Card; zone: "hand" | "equipment" }> }>();
  for (const intent of batch.intents) {
    if (intent.from.kind !== "hand" && intent.from.kind !== "equipment") continue;
    const from = intent.from;
    const player = getPlayer(session, from.playerId);
    const cards = intent.cardIds.map((cardId) => {
      const card = from.kind === "hand"
        ? player.hand.find((candidate) => candidate.id === cardId)
        : player.equipment[from.slot];
      if (!card || card.id !== cardId) throw new Error(`牌移动批次中的失牌实体 ${cardId} 不在声明区域。`);
      return card;
    }).filter((card) => !session.virtualCardOrigins[card.id]);
    if (cards.length === 0) continue;
    const entry = losses.get(player.id) ?? { player, cards: [] };
    entry.cards.push(...cards.map((card) => ({ card, zone: from.kind })));
    losses.set(player.id, entry);
  }
  const records = commitMoveBatch(state, batch);
  for (const { player, cards } of losses.values()) {
    enqueueTuntianLossBatch(session, player, cards, batch.batchId);
  }
  return records;
}

function syncSessionZones(
  session: GameSession,
  adapted: { state: AtomicZoneState; processingFrameId: number },
): void {
  session.deck = adapted.state.deck;
  session.discardPile = adapted.state.discard;
  session.resolvingCards = Object.values(adapted.state.processing).flat();
  for (const player of session.players) {
    const resolved = adapted.state.players.find((candidate) => candidate.id === player.id);
    if (!resolved) throw new Error(`Zone transition lost player ${player.id}`);
    player.hand = resolved.hand;
    player.equipment = resolved.equipment;
    player.judgment = resolved.judgment;
    player.extraPiles = resolved.extraPiles;
  }
}

interface OwnedDiscardAftermath {
  readonly lostLastHand: boolean;
  readonly lostEquipmentCount: number;
  readonly lostSilverLion: boolean;
}

function discardOwnedCardsAtomically(
  session: GameSession,
  owner: GamePlayer,
  cardIds: readonly CardId[],
  skillId: Extract<GeneralSkillId, "dimeng" | "yinghun" | "jilue">,
  reason: "skill_cost" | "skill_effect",
): OwnedDiscardAftermath {
  const selected = new Set(cardIds);
  const handCardIds = owner.hand.filter((card) => selected.has(card.id)).map((card) => card.id);
  const equipmentEntries = (["weapon", "armor", "offensive_horse", "defensive_horse"] as const)
    .flatMap((slot) => {
      const card = owner.equipment[slot];
      return card && selected.has(card.id) ? [{ slot, card }] : [];
    });
  if (handCardIds.length + equipmentEntries.length !== selected.size) {
    ruleError("INVALID_CARD", `${skillId} 只能弃置所选角色当前手牌或装备区中的实体牌。`);
  }
  const aftermath: OwnedDiscardAftermath = {
    lostLastHand: handCardIds.length > 0 && handCardIds.length === owner.hand.length,
    lostEquipmentCount: equipmentEntries.length,
    lostSilverLion: equipmentEntries.some(({ card }) => card.kind === "bai_yin_shi_zi"),
  };
  if (cardIds.length === 0) return aftermath;
  const intents: MoveIntent[] = [
    ...(handCardIds.length > 0 ? [{
      cardIds: handCardIds,
      from: { kind: "hand" as const, playerId: owner.id },
      to: { kind: "discard" as const },
      reason,
      visibility: "public" as const,
      actorId: owner.id,
      sourceId: owner.id,
      targetId: owner.id,
      skillId,
    }] : []),
    ...equipmentEntries.map(({ slot, card }) => ({
      cardIds: [card.id],
      from: { kind: "equipment" as const, playerId: owner.id, slot },
      to: { kind: "discard" as const },
      reason,
      visibility: "public" as const,
      actorId: owner.id,
      sourceId: owner.id,
      targetId: owner.id,
      skillId,
    })),
  ];
  const zones = sessionZoneState(session);
  commitLiveMoveBatch(session, zones.state, { batchId: nextMoveBatchId(session), intents });
  syncSessionZones(session, zones);
  return aftermath;
}

function queueOwnedDiscardAftermath(
  session: GameSession,
  owner: GamePlayer,
  aftermath: OwnedDiscardAftermath,
): void {
  if (aftermath.lostSilverLion && !armorInvalidatedByWuqian(session, owner.id) && owner.alive && owner.hp < owner.maxHp) {
    recoverLivePlayer(session, owner, 1, owner.id, "bai_yin_shi_zi");
    addLog(session, "card", `${owner.id} 失去白银狮子，回复 1 点体力。`);
  }
  if (aftermath.lostLastHand) enqueueAfterMoveSkill(session, owner, "lianying");
  for (let index = 0; index < aftermath.lostEquipmentCount; index += 1) {
    enqueueAfterMoveSkill(session, owner, "xiaoji");
  }
}

function completeDimengSwap(session: GameSession, pending: PendingStandardSkill): void {
  if (pending.skillId !== "dimeng" || pending.stage !== "dimeng_swap" ||
    pending.targetIds?.length !== 2 || !pending.targetHandCardIds) {
    throw new Error("缔盟换手续体无效。");
  }
  const [firstId, secondId] = pending.targetIds;
  const first = getLivingPlayer(session, firstId!);
  const second = getLivingPlayer(session, secondId!);
  const [firstSnapshot, secondSnapshot] = pending.targetHandCardIds;
  const sameHand = (actual: readonly Card[], expected: readonly CardId[]): boolean =>
    actual.length === expected.length && actual.every((card) => expected.includes(card.id));
  if (!sameHand(first.hand, firstSnapshot) || !sameHand(second.hand, secondSnapshot)) {
    throw new Error("缔盟支付代价后的目标手牌快照发生了未授权变化。");
  }
  const intents: MoveIntent[] = [
    ...(firstSnapshot.length > 0 ? [{
      cardIds: firstSnapshot,
      from: { kind: "hand" as const, playerId: first.id },
      to: { kind: "hand" as const, playerId: second.id },
      reason: "skill_effect" as const,
      visibility: "source_and_target" as const,
      actorId: pending.targetId,
      sourceId: first.id,
      targetId: second.id,
      skillId: "dimeng" as const,
    }] : []),
    ...(secondSnapshot.length > 0 ? [{
      cardIds: secondSnapshot,
      from: { kind: "hand" as const, playerId: second.id },
      to: { kind: "hand" as const, playerId: first.id },
      reason: "skill_effect" as const,
      visibility: "source_and_target" as const,
      actorId: pending.targetId,
      sourceId: second.id,
      targetId: first.id,
      skillId: "dimeng" as const,
    }] : []),
  ];
  if (intents.length > 0) {
    const zones = sessionZoneState(session);
    commitLiveMoveBatch(session, zones.state, { batchId: nextMoveBatchId(session), intents });
    syncSessionZones(session, zones);
  }
  if (firstSnapshot.length > 0) enqueueAfterMoveSkill(session, first, "lianying");
  if (secondSnapshot.length > 0) enqueueAfterMoveSkill(session, second, "lianying");
  session.pendingResponse = null;
  session.turn.phase = "play";
  addLog(session, "card", `${pending.targetId} 发动缔盟，交换了 ${first.id} 与 ${second.id} 的全部手牌。`);
  offerNextAfterMoveSkill(session);
}

function pindianZoneState(
  session: GameSession,
  frame: PindianFrame,
): { state: AtomicZoneState; unrelatedResolving: Card[] } {
  const selectedIds = new Set(Object.values(frame.selections).filter((cardId): cardId is CardId => typeof cardId === "string"));
  const pindianCards = session.resolvingCards.filter((card) => selectedIds.has(card.id));
  return {
    state: {
      deck: session.deck,
      discard: session.discardPile,
      processing: pindianCards.length > 0 ? { [String(frame.frameId)]: pindianCards } : {},
      players: session.players.map((player) => ({
        id: player.id,
        hand: player.hand,
        equipment: player.equipment,
        judgment: player.judgment,
        extraPiles: player.extraPiles,
      })),
    },
    unrelatedResolving: session.resolvingCards.filter((card) => !selectedIds.has(card.id)),
  };
}

function syncPindianZones(
  session: GameSession,
  frame: PindianFrame,
  adapted: { state: AtomicZoneState; unrelatedResolving: Card[] },
): void {
  session.deck = adapted.state.deck;
  session.discardPile = adapted.state.discard;
  session.resolvingCards = [
    ...adapted.unrelatedResolving,
    ...(adapted.state.processing[String(frame.frameId)] ?? []),
  ];
  for (const player of session.players) {
    const resolved = adapted.state.players.find((candidate) => candidate.id === player.id);
    if (!resolved) throw new Error(`Pindian zone transition lost player ${player.id}`);
    player.hand = resolved.hand;
    player.equipment = resolved.equipment;
    player.judgment = resolved.judgment;
    player.extraPiles = resolved.extraPiles;
  }
}

function judgmentZoneState(
  session: GameSession,
  frame: JudgmentFrame,
): { state: AtomicZoneState; unrelatedResolving: Card[] } {
  const judgmentIds = new Set([frame.cardId, frame.initialCardId].filter((id): id is string => id !== null));
  const judgmentCards = session.resolvingCards.filter((card) => judgmentIds.has(card.id));
  const unrelatedResolving = session.resolvingCards.filter((card) => !judgmentIds.has(card.id));
  return {
    state: {
      deck: session.deck,
      discard: session.discardPile,
      processing: judgmentCards.length > 0 ? { [String(frame.frameId)]: judgmentCards } : {},
      players: session.players.map((player) => ({
        id: player.id,
        hand: player.hand,
        equipment: player.equipment,
        judgment: player.judgment,
        extraPiles: player.extraPiles,
      })),
    },
    unrelatedResolving,
  };
}

function syncJudgmentZones(
  session: GameSession,
  frame: JudgmentFrame,
  adapted: { state: AtomicZoneState; unrelatedResolving: Card[] },
): void {
  session.deck = adapted.state.deck;
  session.discardPile = adapted.state.discard;
  session.resolvingCards = [
    ...adapted.unrelatedResolving,
    ...(adapted.state.processing[String(frame.frameId)] ?? []),
  ];
}

function judgmentPromptId(frame: JudgmentFrame, stage: "retrial" | "post", ownerId: PlayerId): string {
  const cursor = stage === "retrial" ? frame.retrialCursor : frame.postJudgmentCursor;
  return `judgment:${frame.frameId}:${stage}:${ownerId}:${cursor}`;
}

function standardJudgmentOrder(session: GameSession): GamePlayer[] {
  const current = getPlayer(session, session.currentPlayerId);
  return current.alive
    ? livingPlayersInSeatOrderFrom(session, current)
    : session.players.filter((player) => player.alive).sort((left, right) => left.seat - right.seat);
}

function standardJudgmentRetrialOrder(session: GameSession): Array<{ ownerId: PlayerId; skillId: "guicai" | "guidao" | "jilue" }> {
  return standardJudgmentOrder(session).flatMap((player) => {
    const result: Array<{ ownerId: PlayerId; skillId: "guicai" | "guidao" | "jilue" }> = [];
    const hasGuicai = hasEffectiveSkill(session, player, "guicai");
    if (hasGuicai) result.push({ ownerId: player.id, skillId: "guicai" });
    if (hasEffectiveSkill(session, player, "guidao")) result.push({ ownerId: player.id, skillId: "guidao" });
    const context = jilueContext(session, player);
    if (!hasGuicai && context.skillEffective && context.awakened && context.renMarks > 0) {
      result.push({ ownerId: player.id, skillId: "jilue" });
    }
    return result;
  });
}

function evaluateLiveGuidaoCost(session: GameSession, owner: GamePlayer, card: Card) {
  return evaluateGuidaoCost({
    skillOwnerId: owner.id,
    card: {
      id: card.id,
      kind: card.kind,
      category: card.category,
      printedSuit: card.suit,
      ownerId: owner.id,
      zone: owner.hand.some((candidate) => candidate.id === card.id) ? "hand" : "equipment",
      physical: true,
    },
    hongyan: { ownerId: owner.id, active: hasEffectiveSkill(session, owner, "hongyan") },
  });
}

function guidaoCardIds(session: GameSession, owner: GamePlayer): CardId[] {
  return ownedCards(owner).filter((card) => {
    const result = evaluateLiveGuidaoCost(session, owner, card);
    if (!result.ok) throw new Error(result.detail);
    return result.value.eligible;
  }).map((card) => card.id);
}

function beginStandardJudgment(
  session: GameSession,
  target: GamePlayer,
  reason: { type: "delayed_trick" | "skill" | "armor"; id: string },
  pattern: JudgmentPattern,
  context: StandardJudgmentContext,
): void {
  const frameId = allocateEventId(session);
  const retrialOrder = standardJudgmentRetrialOrder(session);
  const postJudgmentOrder = hasEffectiveSkill(session, target, "tiandu")
    ? [{ ownerId: target.id, skillId: "tiandu" }]
    : [];
  const frame = createJudgmentFrame({
    frameId,
    targetId: target.id,
    reason,
    pattern,
    retrialOrder,
    postJudgmentOrder,
  });
  const adapted = judgmentZoneState(session, frame);
  const transition = revealJudgmentCard(adapted.state, frame, {
    batchId: nextMoveBatchId(session),
    deckState: deckServiceState(session),
  });
  if (hasEffectiveSkill(session, target, "hongyan")) {
    setEffectiveJudgmentSuit(adapted.state, frame, "heart", {
      modifierId: `hongyan:${frame.frameId}:${target.id}`,
      sourcePlayerId: target.id,
      skillId: "hongyan",
      fromSuit: "spade",
    });
  }
  syncJudgmentZones(session, frame, adapted);
  session.rng = { ...transition.deckState.rng };
  session.completeRules.reshufflesRemaining = transition.deckState.reshufflesRemaining;
  const revealed = session.resolvingCards.find((card) => card.id === frame.cardId);
  if (!revealed) throw new Error("judgment reveal is missing from processing");
  addLog(session, "card", `判定牌为${revealed.name}（${suitName(revealed.suit)} ${revealed.rank}）。`);
  session.turn.phase = "respond";
  session.pendingResponse = {
    type: "standard_judgment",
    targetId: target.id,
    promptId: `judgment:${frame.frameId}:advance`,
    frame,
    context: cloneStandardJudgmentContext(context),
    tianduClaimed: false,
    songweiProcessedOwnerIds: [],
  };
  advanceStandardJudgment(session);
}

function nextSongweiOwner(session: GameSession, pending: PendingStandardJudgment): GamePlayer | null {
  const frame = pending.frame;
  if (frame.stage !== "ready_to_settle" || frame.result === null || !frame.effectiveCard) return null;
  const judged = getPlayer(session, frame.targetId);
  const processed = new Set(pending.songweiProcessedOwnerIds ?? []);
  for (const owner of standardJudgmentOrder(session)) {
    if (processed.has(owner.id) || !owner.alive || !hasEffectiveSkill(session, owner, "songwei")) continue;
    const decision = evaluateSongwei({
      context: { ownerId: owner.id, ownerAlive: owner.alive, skillEffective: true },
      judgedPlayerId: judged.id,
      judgedPlayerAlive: judged.alive,
      judgedPlayerFaction: factionOf(session, judged) ?? "god",
      judgmentEffectiveSuit: frame.effectiveCard.effectiveSuit,
      finalJudgmentResult: frame.result,
      judgedPlayerInvoked: true,
    });
    if (!decision.ok) throw new Error(decision.detail);
    if (decision.value.eligible) return owner;
  }
  return null;
}

function settleAndResumeStandardJudgment(session: GameSession, pending: PendingStandardJudgment): void {
  const { frame, context } = pending;
  const judged = getPlayer(session, frame.targetId);
  const wuhunFinalCardKind = context.type === "wuhun"
    ? session.resolvingCards.find((card) => card.id === frame.cardId)?.kind ?? null
    : null;
  const luoshenGain = context.type === "luoshen" && frame.result === true;
  const shuangxiongGain = context.type === "shuangxiong";
  const tuntianOwner = context.type === "tuntian" ? getPlayer(session, context.ownerId) : null;
  const tuntian = context.type === "tuntian" && frame.effectiveCard && tuntianOwner?.alive
    ? planTuntianJudgment({
        ownerId: tuntianOwner.id,
        ownerAlive: tuntianOwner.alive,
        finalJudgmentCardId: frame.effectiveCard.cardId,
        finalJudgmentSuit: frame.effectiveCard.effectiveSuit,
      })
    : null;
  if (tuntian && !tuntian.ok) throw new Error(tuntian.detail);
  const createsField = tuntian?.ok === true && tuntian.value.createsField && !pending.tianduClaimed;
  const gain = pending.tianduClaimed || luoshenGain || shuangxiongGain;
  const adapted = judgmentZoneState(session, frame);
  settleJudgmentCard(adapted.state, frame, {
    batchId: nextMoveBatchId(session),
    to: createsField
      ? { kind: "extra", playerId: tuntianOwner!.id, pileId: "field" }
      : gain ? { kind: "hand", playerId: judged.id } : { kind: "discard" },
    actorId: createsField ? tuntianOwner!.id : gain ? judged.id : null,
    skillId: createsField ? "tuntian" : pending.tianduClaimed ? "tiandu" : luoshenGain ? "luoshen" : shuangxiongGain ? "shuangxiong" : null,
    visibility: gain ? "owner" : "public",
  });
  syncJudgmentZones(session, frame, adapted);
  session.pendingResponse = null;

  if (context.type === "wuhun") {
    const parent = topDeathFrame(session.completeRules.death);
    const death = context.deathResolution;
    if (!wuhunFinalCardKind || !parent || parent.frameId !== death.frameId ||
        parent.death.victimId !== context.ownerId || parent.stage !== "death_triggers" ||
        parent.suspendedByFrameId !== null || death.wuhunResolved !== true || !judged.alive) {
      throw new Error("武魂判定续体与 DeathStack 不一致。");
    }
    const result = settleWuhunJudgment({ targetId: judged.id, finalEffectiveCardKind: wuhunFinalCardKind });
    if (!result.ok) throw new Error(result.detail);
    addLog(session, "death", `${context.ownerId} 的武魂判定为${cardName(wuhunFinalCardKind)}，${judged.id}${result.value.survives ? "存活" : "立即死亡"}。`);
    if (result.value.survives) {
      continueDeathTriggers(session, parent, clonePendingDeathResolution(death));
      return;
    }
    const eventId = allocateEventId(session);
    judged.alive = false;
    judged.hp = 0;
    beginDeathResolution(session, {
      type: "death",
      eventId,
      victimId: judged.id,
      killerId: null,
      reason: { type: "hp_loss", eventId, sourceId: null },
    }, {
      rewards: true,
      checkWinner: false,
      completion: { type: "wuhun", parent: clonePendingDeathResolution(death) },
    });
    return;
  }

  if (context.type === "delayed_trick") {
    const player = getPlayer(session, context.playerId);
    if (context.delayedCard.kind === "le_bu_si_shu") {
      session.discardPile.push(restoreVirtualOrigin(session, context.delayedCard));
      if (!frame.result) session.turn.skipPlay = true;
      addLog(session, "card", `${player.id} 的乐不思蜀判定${frame.result ? "通过" : "生效，跳过出牌阶段"}。`);
    } else if (context.delayedCard.kind === "bing_liang_cun_duan") {
      session.discardPile.push(restoreVirtualOrigin(session, context.delayedCard));
      if (!frame.result) session.turn.skipDraw = true;
      addLog(session, "card", `${player.id} 的兵粮寸断判定${frame.result ? "通过" : "生效，跳过摸牌阶段"}。`);
    } else if (context.delayedCard.kind === "shan_dian") {
      if (!frame.result) {
        moveLightningToNextPlayer(session, context.delayedCard, player);
      } else {
        session.resolvingCards.push(restoreVirtualOrigin(session, context.delayedCard));
        const paused = dealDamageWithChain(
          session, player, null, 3, "thunder", "受到闪电影响", { type: "turn_start" }, false,
          [context.delayedCard.id],
        );
        if (paused) return;
        resumeAfterDying(session, { type: "turn_start" });
        return;
      }
    }
    continueJudgmentPhase(session);
    return;
  }

  if (context.type === "luoshen") {
    if (frame.result) {
      const nextIteration = context.iteration + 1;
      addLog(session, "card", `${judged.id} 发动洛神获得黑色判定牌（最终生效判定牌）。`);
      if (session.deck.length === 0 && session.discardPile.length === 0) {
        addLog(session, "card", `${judged.id} 的洛神因无牌可继续判定而结束。`);
        enterBeforeJudgmentPhase(session, judged);
        return;
      }
      session.turn.phase = "respond";
      session.pendingResponse = {
        type: "skill_choice",
        targetId: judged.id,
        skillId: "luoshen",
        resume: { type: "continue_judgment", playerId: judged.id },
        iteration: nextIteration,
      };
      return;
    }
    addLog(session, "card", `${judged.id} 的洛神判定为红色，流程结束。`);
    enterBeforeJudgmentPhase(session, judged);
    return;
  }

  if (context.type === "shuangxiong") {
    if (context.playerId !== judged.id || !frame.effectiveCard) throw new Error("双雄判定续体无效。");
    session.turn.shuangxiongJudgmentColor = frame.effectiveCard.color;
    addLog(session, "card", `${judged.id} 发动双雄，获得最终生效的${frame.effectiveCard.color === "red" ? "红色" : "黑色"}判定牌。`);
    finishDrawPhase(session, judged);
    return;
  }

  if (context.type === "tuntian") {
    if (!frame.effectiveCard || context.ownerId !== judged.id || !tuntian?.ok) {
      throw new Error("屯田判定续体与最终判定牌不一致。");
    }
    addLog(session, "card", createsField
      ? `${judged.id} 的屯田判定不为红桃，将最终生效判定牌置为“田”。`
      : `${judged.id} 的屯田判定未产生“田”。`);
    offerNextAfterMoveSkill(session);
    return;
  }

  if (context.type === "ganglie") {
    if (context.damageOpportunity) {
      const cursor = context.damageOpportunity;
      const damageFrame = assertLiveDamageCursor(session, cursor);
      if (frame.result) {
        const source = damageFrame.damage.sourceId ? getPlayer(session, damageFrame.damage.sourceId) : null;
        if (source?.alive) {
          const eventId = allocateEventId(session);
          session.turn.phase = "respond";
          session.pendingResponse = {
            type: "standard_skill",
            targetId: source.id,
            promptId: `damage:${cursor.promptId}:ganglie-punish`,
            eventId,
            skillId: "ganglie",
            stage: "ganglie_punish",
            sourceId: judged.id,
            damageOpportunity: cursor,
          };
          return;
        }
      }
      consumeLiveDamageOpportunity(session, cursor, "resolve", `judgment:${frame.frameId}:ganglie`);
      driveLiveDamageFlow(session, true);
      return;
    }
    if (!context.aftermath) throw new Error("刚烈判定缺少伤害续体。");
    if (frame.result) {
      const aftermath = cloneStandardDamageAftermath(context.aftermath);
      const source = aftermath.sourceId ? getPlayer(session, aftermath.sourceId) : null;
      if (source?.alive) {
        const eventId = allocateEventId(session);
        session.turn.phase = "respond";
        session.pendingResponse = {
          type: "standard_skill",
          targetId: source.id,
          promptId: standardPromptId(eventId, "ganglie", source.id, "punish"),
          eventId,
          skillId: "ganglie",
          stage: "ganglie_punish",
          sourceId: judged.id,
          aftermath,
        };
        return;
      }
    }
    continueDamageAftermath(session, context.aftermath);
    return;
  }

  if (context.type === "baonue") {
    const cursor = context.damageOpportunity;
    const damage = assertLiveDamageCursor(session, cursor);
    const source = damage.damage.sourceId ? getPlayer(session, damage.damage.sourceId) : null;
    const owner = getPlayer(session, context.ownerId);
    if (!source || source.id !== judged.id || cursor.ownerId !== source.id) {
      throw new Error("暴虐判定续体与 DamageFlow 来源不一致。 ");
    }
    if (!frame.effectiveCard) throw new Error("暴虐判定缺少最终生效花色。 ");
    const plan = settleBaonueJudgment({
      ownerHp: owner.hp,
      ownerMaxHp: owner.maxHp,
      finalEffectiveSuit: frame.effectiveCard.effectiveSuit,
    });
    if (!plan.ok) throw new Error(plan.detail);
    if (plan.value.actualRecovery > 0 && owner.alive) {
      recoverLivePlayer(session, owner, plan.value.actualRecovery, source.id, "baonue");
      addLog(session, "damage", `${source.id} 发动暴虐判定成功，${owner.id} 回复了 1 点体力。`);
    } else {
      addLog(session, "card", `${source.id} 的暴虐判定${plan.value.succeeded ? "成功" : "失败"}。`);
    }
    consumeLiveDamageOpportunity(session, cursor, "resolve", `judgment:${frame.frameId}:baonue`);
    driveLiveDamageFlow(session, true);
    return;
  }

  if (context.type === "beige") {
    const cursor = context.damageOpportunity;
    const damage = assertLiveDamageCursor(session, cursor);
    const owner = getPlayer(session, context.ownerId);
    const victim = getPlayer(session, damage.damage.targetId);
    const source = damage.damage.sourceId ? getPlayer(session, damage.damage.sourceId) : null;
    if (judged.id !== victim.id || cursor.ownerId !== owner.id || !frame.effectiveCard ||
        slashContinuationForDamage(damage) === null) {
      throw new Error("悲歌判定续体与 DamageFlow 不一致。");
    }
    const sourceCards = source?.alive ? ownedCards(source).map((card) =>
      mountainRuleCard(session, source, card, source.hand.some((candidate) => candidate.id === card.id) ? "hand" : "equipment")) : [];
    const plan = planBeige({
      ownerId: owner.id,
      ownerAlive: owner.alive,
      skillEffective: hasEffectiveSkill(session, owner, "beige"),
      slashDamageAftermathSettled: true,
      victimId: victim.id,
      victimAlive: victim.alive,
      damageSourceId: source?.id ?? null,
      damageSourceAlive: source?.alive ?? false,
      costCard: mountainRuleCard(session, owner, context.costCard, context.costZone),
      finalJudgmentSuit: frame.effectiveCard.effectiveSuit,
      damageSourceCards: sourceCards,
    });
    if (!plan.ok) throw new Error(plan.detail);
    if (plan.value.effect.type === "recover") {
      const recovered = recoverLivePlayer(session, victim, 1, owner.id, "beige");
      addLog(session, "damage", `${victim.id} 因悲歌红桃判定回复了 ${recovered} 点体力。`);
    } else if (plan.value.effect.type === "draw") {
      const drawn = drawCards(session, victim, 2);
      addLog(session, "card", `${victim.id} 因悲歌方块判定摸了 ${drawn} 张牌。`);
    } else if (plan.value.effect.type === "turn_over_source") {
      turnOverLivePlayer(session, plan.value.effect.sourceId);
      addLog(session, "turn", `${plan.value.effect.sourceId} 因悲歌黑桃判定翻面。`);
    } else if (plan.value.effect.type === "source_discard" && plan.value.effect.maximumDiscardCount > 0) {
      session.turn.phase = "respond";
      session.pendingResponse = {
        type: "standard_skill",
        targetId: plan.value.effect.sourceId,
        promptId: `damage:${cursor.promptId}:beige-discard`,
        eventId: frame.frameId,
        skillId: "beige",
        stage: "beige_source_discard",
        sourceId: owner.id,
        selectedCardIds: [...plan.value.effect.candidateCardIds],
        damageOpportunity: { ...cursor },
      };
      addLog(session, "card", `${plan.value.effect.sourceId} 须因悲歌梅花判定弃置 ${plan.value.effect.maximumDiscardCount} 张牌。`);
      return;
    }
    consumeLiveDamageOpportunity(session, cursor, "resolve", `judgment:${frame.frameId}:beige:${plan.value.finalJudgmentSuit}`);
    if (plan.value.effect.type === "no_source_effect") {
      addLog(session, "card", "悲歌判定对应的伤害来源已不存在，没有后续效果。");
    }
    if (session.afterMove.queuedRecoveries.length > 0 || session.afterMove.queuedTriggers.length > 0) {
      offerNextAfterMoveSkill(session);
    } else {
      driveLiveDamageFlow(session, true);
    }
    return;
  }

  if (context.type === "tieqi") {
    beginSlashTarget(session, {
      ...context.slash,
      tieqiChecked: true,
      dodgeProhibited: context.slash.dodgeProhibited === true || frame.result === true,
    });
    return;
  }

  if (context.type !== "armor") throw new Error("不支持的判定续体。");
  const armorPending = context.pending;
  const armorOwner = getPlayer(session, armorPending.targetId);
  const armorSourceSkillId = context.sourceSkillId ?? "ba_gua_zhen";
  const armorName = armorSourceSkillId === "bazhen" ? "八阵" : "八卦阵";
  if (!frame.result) {
    session.turn.phase = "respond";
    const next = { ...armorPending, armorAttempted: true };
    if (next.type === "mass_attack") updateMassAttackResponseCommitment(session, next);
    else updateSlashResponseCommitment(session, next);
    session.pendingResponse = next;
    addLog(session, "card", `${armorOwner.id} 发动${armorName}失败，仍需打出闪。`);
    return;
  }
  if (armorPending.type === "slash") {
    const required = armorPending.requiredDodgeCount ?? 1;
    const dodgesPlayed = (armorPending.dodgesPlayed ?? 0) + 1;
    const progressed = { ...armorPending, requiredDodgeCount: required, dodgesPlayed };
    if (dodgesPlayed < required) {
      addLog(session, "card", `${armorOwner.id} 发动${armorName}成功，视为打出第 ${dodgesPlayed}/${required} 张闪。`);
    } else {
      addLog(session, "card", `${armorOwner.id} 发动${armorName}成功，视为打出第 ${dodgesPlayed}/${required} 张闪并抵消杀。`);
    }
    offerLeijiAfterDodge(
      session,
      armorOwner,
      { type: "view_as", skillId: armorSourceSkillId, physicalCardIds: [] },
      { type: "slash", pending: progressed },
    );
    return;
  }
  addLog(session, "card", `${armorOwner.id} 发动${armorName}成功，视为打出闪。`);
  offerLeijiAfterDodge(
    session,
    armorOwner,
    { type: "view_as", skillId: armorSourceSkillId, physicalCardIds: [] },
    { type: "mass_attack", pending: armorPending },
  );
}

function judgmentRetrialCardIds(session: GameSession, owner: GamePlayer, skillId: string): CardId[] {
  if (skillId === "guicai" || skillId === "jilue") return owner.hand.map((card) => card.id);
  if (skillId === "guidao") return guidaoCardIds(session, owner);
  return [];
}

function judgmentRetrialSkillEffective(session: GameSession, owner: GamePlayer, skillId: string): boolean {
  if (skillId !== "jilue") return hasEffectiveSkill(session, owner, skillId as GeneralSkillId);
  const context = jilueContext(session, owner);
  return context.skillEffective && context.awakened && context.renMarks > 0;
}

function applyJudgmentRetrialChoice(
  session: GameSession,
  frame: JudgmentFrame,
  action: Extract<GameAction, { type: "resolve_standard_skill" }>,
): void {
  const opportunity = currentJudgmentRetrialOpportunity(frame);
  if (!opportunity || opportunity.ownerId !== action.playerId ||
      (opportunity.skillId !== "guicai" && opportunity.skillId !== "guidao" && opportunity.skillId !== "jilue")) {
    ruleError("INVALID_RESPONSE", "当前改判响应者不匹配。");
  }
  const skillId = opportunity.skillId;
  if (!action.activate) {
    passJudgmentRetrial(frame, action.playerId, skillId);
    return;
  }
  if (!action.cardId || action.cardIds !== undefined) {
    const name = skillId === "guicai" ? "鬼才" : skillId === "guidao" ? "鬼道" : "极略·鬼才";
    ruleError("INVALID_SELECTION", `${name}必须选择一张合法牌替换判定牌。`);
  }
  const owner = getLivingPlayer(session, action.playerId);
  const card = ownedCards(owner).find((candidate) => candidate.id === action.cardId);
  if (!card) ruleError("CARD_NOT_FOUND", "所选改判牌不存在。");
  let replacementFrom: ZoneRef;
  let oldCardTo: ZoneRef = { kind: "discard" };
  let equipmentSlot: EquipmentSlot | null = null;
  if (skillId === "guicai" || skillId === "jilue") {
    if (!owner.hand.some((candidate) => candidate.id === card.id)) {
      ruleError("INVALID_CARD", `${skillId === "jilue" ? "极略·" : ""}鬼才只能使用手牌改判。`);
    }
    if (skillId === "jilue") {
      if (!frame.cardId) throw new Error("极略·鬼才缺少当前判定牌。");
      const plan = planJilueGuicai({
        context: jilueContext(session, owner),
        judgmentPending: frame.stage === "retrial_window",
        originalJudgmentCardId: frame.cardId,
        replacementCard: godRuleCard(owner, card, "hand"),
      });
      if (!plan.ok) ruleError("INVALID_SKILL", plan.detail);
      spendJilueRen(session, owner.id);
    }
    replacementFrom = { kind: "hand", playerId: owner.id };
  } else {
    const decision = evaluateLiveGuidaoCost(session, owner, card);
    if (!decision.ok) throw new Error(decision.detail);
    if (!decision.value.eligible) ruleError("INVALID_CARD", "鬼道只能使用有效黑色的手牌或装备牌改判。");
    if (owner.hand.some((candidate) => candidate.id === card.id)) {
      replacementFrom = { kind: "hand", playerId: owner.id };
    } else {
      const entry = Object.entries(owner.equipment).find(([, candidate]) => candidate.id === card.id);
      if (!entry) ruleError("CARD_NOT_FOUND", "鬼道所选装备牌不存在。");
      equipmentSlot = entry[0] as EquipmentSlot;
      replacementFrom = { kind: "equipment", playerId: owner.id, slot: equipmentSlot };
    }
    oldCardTo = { kind: "hand", playerId: owner.id };
  }
  const emptiedHand = replacementFrom.kind === "hand" && owner.hand.length === 1;
  const lostSilverLion = equipmentSlot === "armor" && card.kind === "bai_yin_shi_zi";
  const adapted = judgmentZoneState(session, frame);
  const moveBatchId = nextMoveBatchId(session);
  replaceJudgmentCard(adapted.state, frame, {
    batchId: moveBatchId,
    actorId: owner.id,
    skillId,
    replacementCardId: card.id,
    replacementFrom,
    oldCardTo,
  });
  syncJudgmentZones(session, frame, adapted);
  enqueueTuntianLossBatch(session, owner, [{ card, zone: replacementFrom.kind }], moveBatchId);
  if (emptiedHand) enqueueAfterMoveSkill(session, owner, "lianying");
  if (equipmentSlot !== null) enqueueAfterMoveSkill(session, owner, "xiaoji");
  if (lostSilverLion && !armorInvalidatedByWuqian(session, owner.id) && owner.alive && owner.hp < owner.maxHp) {
    recoverLivePlayer(session, owner, 1, owner.id, "bai_yin_shi_zi");
  }
  addLog(
    session,
    "card",
    `${owner.id} 发动${skillId === "guicai" ? "鬼才" : skillId === "guidao" ? "鬼道" : "极略·鬼才"}，以一张${equipmentSlot === null ? "手" : "装备"}牌替换了最终判定牌。`,
  );
}

function beginLeijiJudgment(
  session: GameSession,
  pending: PendingStandardSkill,
  target: GamePlayer,
): void {
  const dodge = pending.leijiDodge;
  if (!dodge || pending.skillId !== "leiji" || pending.stage !== "leiji_target") {
    throw new Error("雷击提示缺少有效闪续体。");
  }
  const plan = planLeiji({
    skillOwnerId: dodge.attributedPlayerId,
    dodgeEvent: {
      dodgeEventId: dodge.dodgeEventId,
      attributedPlayerId: dodge.attributedPlayerId,
      accepted: true,
      method: dodge.method,
      effectiveCardKind: "dodge",
      provenance: dodge.provenance,
    },
    selectedTarget: { playerId: target.id, alive: target.alive },
  });
  if (!plan.ok) throw new Error(plan.detail);
  if (!plan.value.eligible || !plan.value.judgment) ruleError("INVALID_TARGET", "雷击必须选择一名存活角色。");

  const frame = createJudgmentFrame({
    frameId: allocateEventId(session),
    targetId: target.id,
    reason: { type: "skill", id: "leiji" },
    pattern: { suits: ["spade"] },
    retrialOrder: standardJudgmentRetrialOrder(session),
    postJudgmentOrder: hasEffectiveSkill(session, target, "tiandu")
      ? [{ ownerId: target.id, skillId: "tiandu" }]
      : [],
  });
  const adapted = judgmentZoneState(session, frame);
  const transition = revealJudgmentCard(adapted.state, frame, {
    batchId: nextMoveBatchId(session),
    deckState: deckServiceState(session),
  });
  if (hasEffectiveSkill(session, target, "hongyan")) {
    setEffectiveJudgmentSuit(adapted.state, frame, "heart", {
      modifierId: `hongyan:${frame.frameId}:${target.id}`,
      sourcePlayerId: target.id,
      skillId: "hongyan",
      fromSuit: "spade",
    });
  }
  syncJudgmentZones(session, frame, adapted);
  session.rng = { ...transition.deckState.rng };
  session.completeRules.reshufflesRemaining = transition.deckState.reshufflesRemaining;
  const revealed = session.resolvingCards.find((card) => card.id === frame.cardId);
  if (!revealed) throw new Error("雷击判定牌不在处理区。");
  addLog(session, "card", `雷击判定牌为${revealed.name}（${suitName(revealed.suit)} ${revealed.rank}）。`);
  session.pendingResponse = {
    ...pending,
    targetId: target.id,
    promptId: `judgment:${frame.frameId}:advance`,
    judgment: frame,
    tianduClaimed: false,
  };
  advanceLeijiJudgment(session);
}

function settleLeijiJudgment(session: GameSession, pending: PendingStandardSkill): void {
  const frame = pending.judgment;
  const dodge = pending.leijiDodge;
  if (!frame || !dodge || frame.stage !== "ready_to_settle" || frame.result === null) {
    throw new Error("雷击判定尚未完成。");
  }
  const judged = getPlayer(session, frame.targetId);
  const adapted = judgmentZoneState(session, frame);
  settleJudgmentCard(adapted.state, frame, {
    batchId: nextMoveBatchId(session),
    to: pending.tianduClaimed ? { kind: "hand", playerId: judged.id } : { kind: "discard" },
    actorId: pending.tianduClaimed ? judged.id : null,
    skillId: pending.tianduClaimed ? "tiandu" : null,
    visibility: pending.tianduClaimed ? "owner" : "public",
  });
  syncJudgmentZones(session, frame, adapted);
  session.pendingResponse = null;
  if (!frame.result) {
    addLog(session, "card", `${judged.id} 的雷击判定不为黑桃。`);
    resumeAcceptedDodge(session, dodge.resume);
    return;
  }
  const source = getPlayer(session, dodge.attributedPlayerId);
  const paused = dealDamageWithChain(
    session,
    judged,
    source,
    2,
    "thunder",
    "受到雷击",
    { type: "leiji", resume: dodge.resume },
  );
  if (!paused) resumeAcceptedDodge(session, dodge.resume);
}

function advanceLeijiJudgment(session: GameSession): void {
  const pending = session.pendingResponse;
  if (pending?.type !== "standard_skill" || !pending.judgment || !pending.leijiDodge) {
    throw new Error("雷击判定续体缺失。");
  }
  const frame = pending.judgment;
  while (frame.stage === "retrial_window") {
    const opportunity = currentJudgmentRetrialOpportunity(frame);
    if (!opportunity) throw new Error("雷击改判游标无效。");
    const owner = getPlayer(session, opportunity.ownerId);
    if (!owner.alive || !judgmentRetrialSkillEffective(session, owner, opportunity.skillId) ||
        judgmentRetrialCardIds(session, owner, opportunity.skillId).length === 0) {
      passJudgmentRetrial(frame, opportunity.ownerId, opportunity.skillId);
      continue;
    }
    session.turn.phase = "respond";
    session.pendingResponse = {
      ...pending,
      targetId: owner.id,
      skillId: opportunity.skillId as Extract<StandardImplementedSkillId, "guicai" | "guidao" | "jilue">,
      stage: "leiji_judgment_retrial",
      promptId: judgmentPromptId(frame, "retrial", owner.id),
    };
    return;
  }
  if (frame.stage === "ready_to_resolve") resolveJudgment(frame);
  while (frame.stage === "post_judgment_window") {
    const opportunity = currentJudgmentPostOpportunity(frame);
    if (!opportunity) throw new Error("雷击判定后游标无效。");
    const owner = getPlayer(session, opportunity.ownerId);
    if (!owner.alive || !hasEffectiveSkill(session, owner, "tiandu")) {
      completeJudgmentPostOpportunity(frame, opportunity.ownerId, opportunity.skillId);
      continue;
    }
    session.turn.phase = "respond";
    session.pendingResponse = {
      ...pending,
      targetId: owner.id,
      skillId: "tiandu",
      stage: "leiji_judgment_post",
      promptId: judgmentPromptId(frame, "post", owner.id),
    };
    return;
  }
  settleLeijiJudgment(session, pending);
}

function applyLeijiJudgmentAction(
  session: GameSession,
  pending: PendingStandardSkill,
  action: Extract<GameAction, { type: "resolve_standard_skill" }>,
): void {
  if (!pending.judgment) throw new Error("雷击改判提示缺少 JudgmentFrame。");
  if (currentJudgmentRetrialOpportunity(pending.judgment)) {
    applyJudgmentRetrialChoice(session, pending.judgment, action);
    session.pendingResponse = pending;
    if (session.afterMove.queuedRecoveries.length > 0 || session.afterMove.queuedTriggers.length > 0) {
      return;
    }
    advanceLeijiJudgment(session);
    return;
  }
  const post = currentJudgmentPostOpportunity(pending.judgment);
  if (!post || post.ownerId !== action.playerId || post.skillId !== "tiandu") {
    ruleError("INVALID_RESPONSE", "当前雷击判定后响应者不匹配。");
  }
  completeJudgmentPostOpportunity(pending.judgment, action.playerId, "tiandu");
  session.pendingResponse = { ...pending, tianduClaimed: action.activate };
  advanceLeijiJudgment(session);
}

function advanceStandardJudgment(session: GameSession, stopBeforeResolution = false): void {
  const pending = session.pendingResponse;
  if (pending?.type !== "standard_judgment") throw new Error("standard judgment continuation is missing");
  const { frame } = pending;
  while (frame.stage === "retrial_window") {
    const opportunity = currentJudgmentRetrialOpportunity(frame);
    if (!opportunity) throw new Error("judgment retrial cursor is invalid");
    const owner = getPlayer(session, opportunity.ownerId);
    if (!owner.alive || !judgmentRetrialSkillEffective(session, owner, opportunity.skillId) ||
        judgmentRetrialCardIds(session, owner, opportunity.skillId).length === 0) {
      passJudgmentRetrial(frame, opportunity.ownerId, opportunity.skillId);
      continue;
    }
    session.turn.phase = "respond";
    session.pendingResponse = {
      ...pending,
      targetId: owner.id,
      promptId: judgmentPromptId(frame, "retrial", owner.id),
    };
    return;
  }
  if (stopBeforeResolution) return;
  if (frame.stage === "ready_to_resolve") resolveJudgment(frame);
  while (frame.stage === "post_judgment_window") {
    const opportunity = currentJudgmentPostOpportunity(frame);
    if (!opportunity) throw new Error("judgment post cursor is invalid");
    const owner = getPlayer(session, opportunity.ownerId);
    if (!owner.alive || !hasEffectiveSkill(session, owner, "tiandu")) {
      completeJudgmentPostOpportunity(frame, opportunity.ownerId, opportunity.skillId);
      continue;
    }
    session.turn.phase = "respond";
    session.pendingResponse = {
      ...pending,
      targetId: owner.id,
      promptId: judgmentPromptId(frame, "post", owner.id),
    };
    return;
  }
  if (frame.stage !== "ready_to_settle") throw new Error(`unexpected judgment stage ${frame.stage}`);
  const songweiOwner = nextSongweiOwner(session, pending);
  if (songweiOwner) {
    session.turn.phase = "respond";
    session.pendingResponse = {
      ...pending,
      targetId: frame.targetId,
      promptId: `judgment:${frame.frameId}:songwei:${songweiOwner.id}:${(pending.songweiProcessedOwnerIds ?? []).length}`,
      songweiProcessedOwnerIds: [...(pending.songweiProcessedOwnerIds ?? [])],
    };
    return;
  }
  settleAndResumeStandardJudgment(session, pending);
}

function applyStandardJudgmentAction(
  session: GameSession,
  action: Extract<GameAction, { type: "resolve_standard_skill" }>,
): void {
  const pending = session.pendingResponse;
  if (session.turn.phase !== "respond" || pending?.type !== "standard_judgment" || pending.targetId !== action.playerId) {
    ruleError("INVALID_PHASE", "当前没有由你处理的判定技能窗口。");
  }
  if (action.promptId !== pending.promptId) ruleError("INVALID_RESPONSE", "判定技能请求已失效。");
  const retrial = currentJudgmentRetrialOpportunity(pending.frame);
  if (retrial) {
    applyJudgmentRetrialChoice(session, pending.frame, action);
    session.pendingResponse = pending;
    if (session.afterMove.queuedRecoveries.length > 0 || session.afterMove.queuedTriggers.length > 0) {
      advanceStandardJudgment(session, true);
      return;
    }
    advanceStandardJudgment(session);
    return;
  }
  const post = currentJudgmentPostOpportunity(pending.frame);
  if (!post) {
    const owner = nextSongweiOwner(session, pending);
    if (!owner || pending.frame.targetId !== action.playerId ||
        pending.promptId !== `judgment:${pending.frame.frameId}:songwei:${owner.id}:${(pending.songweiProcessedOwnerIds ?? []).length}`) {
      ruleError("INVALID_RESPONSE", "当前颂威响应者不匹配。 ");
    }
    if (action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
        action.targetIds !== undefined || action.tokens !== undefined) {
      ruleError("INVALID_SELECTION", "颂威只需选择是否发动。 ");
    }
    if (action.activate) {
      const drawn = drawCards(session, owner, 1);
      addLog(session, "card", `${action.playerId} 响应颂威，令 ${owner.id} 摸了 ${drawn} 张牌。`);
    }
    session.pendingResponse = {
      ...pending,
      songweiProcessedOwnerIds: [...(pending.songweiProcessedOwnerIds ?? []), owner.id],
    };
    advanceStandardJudgment(session);
    return;
  }
  if (post.ownerId !== action.playerId || post.skillId !== "tiandu") {
    ruleError("INVALID_RESPONSE", "当前天妒响应者不匹配。");
  }
  completeJudgmentPostOpportunity(pending.frame, action.playerId, "tiandu");
  session.pendingResponse = { ...pending, tianduClaimed: action.activate };
  if (action.activate) addLog(session, "card", `${action.playerId} 发动天妒，将获得最终生效的判定牌。`);
  advanceStandardJudgment(session);
}

function continueCardUse(session: GameSession, continuation: CardUseContinuation): void {
  assertRestorableCardUseContinuation(session, continuation);
  const [trigger, ...remainingTriggers] = continuation.remainingTriggers;
  if (trigger) {
    if (trigger.skillId === "jiang") {
      const owner = getLivingPlayer(session, trigger.ownerId);
      const role = owner.id === continuation.intent.sourceId ? "card_user" as const : "card_target" as const;
      const plan = planJiang({
        ownerId: owner.id,
        ownerAlive: owner.alive,
        skillEffective: hasEffectiveSkill(session, owner, "jiang"),
        targetDesignationSettled: continuation.stage === "targets_confirmed",
        role,
        cardKind: continuation.intent.effectiveKind,
        cardSuit: continuation.intent.suit,
        cardUserId: continuation.intent.sourceId,
        targetIds: continuation.intent.targetIds,
      });
      if (!plan.ok) throw new Error(`激昂用牌续体无效：${plan.detail}`);
      const next = {
        ...cloneCardUseContinuation(continuation),
        remainingTriggers: remainingTriggers.map(cloneSkillTriggerRef),
      };
      advanceCardUseCursor(session, continuation, next);
      session.turn.phase = "respond";
      session.pendingResponse = {
        type: "standard_skill",
        targetId: owner.id,
        promptId: `skill:${trigger.triggerId}`,
        eventId: trigger.eventId,
        skillId: "jiang",
        stage: "jiang_invoke",
        cardUse: next,
      };
      addLog(session, "card", `${owner.id} 可以因决斗发动激昂。`);
      return;
    }
    if ((trigger.skillId !== "jizhi" && trigger.skillId !== "jilue") ||
        trigger.ownerId !== continuation.intent.sourceId) {
      throw new Error(`不支持的用牌触发 ${trigger.triggerId}。`);
    }
    const borrowed = trigger.skillId === "jilue";
    const owner = getLivingPlayer(session, trigger.ownerId);
    const context = borrowed ? jilueContext(session, owner) : null;
    if (borrowed && (!context?.skillEffective || !context.awakened || context.renMarks < 1)) {
      throw new Error("极略·集智用牌触发已不再有效。");
    }
    const next = {
      ...cloneCardUseContinuation(continuation),
      remainingTriggers: remainingTriggers.map(cloneSkillTriggerRef),
    };
    advanceCardUseCursor(session, continuation, next);
    const promptId = `skill:${trigger.triggerId}`;
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "skill_choice",
      targetId: trigger.ownerId,
      skillId: trigger.skillId,
      promptId,
      triggerId: trigger.triggerId,
      ...(context ? { markCount: context.renMarks } : {}),
      resume: next,
    };
    addLog(session, "card", `${trigger.ownerId} 可以在普通锦囊结算前发动${borrowed ? "极略·" : ""}集智。`);
    return;
  }

  if (continuation.stage === "card_use_declared") {
    const eventId = allocateEventId(session);
    const next: CardUseContinuation = {
      type: "card_use",
      intent: cloneCardUseIntent(continuation.intent),
      stage: "targets_confirmed",
      eventId,
      remainingTriggers: triggersForCardUseEvent(session, continuation.intent, "targets_confirmed", eventId),
    };
    advanceCardUseCursor(session, continuation, next);
    continueCardUse(session, next);
    return;
  }

  session.pendingResponse = null;
  session.turn.phase = "play";
  const effectId = commitmentEffects(
    session,
    "card_use_commitment",
    "useId",
    continuation.intent.useId,
  )[0]!.effectId;
  commitCardUseIntent(session, continuation.intent);
  consumeCommitmentEffect(session, effectId);
}

function startCardUse(session: GameSession, intent: CardUseIntent): void {
  const eventId = allocateEventId(session);
  const continuation: CardUseContinuation = {
    type: "card_use",
    intent: cloneCardUseIntent(intent),
    stage: "card_use_declared",
    eventId,
    remainingTriggers: triggersForCardUseEvent(session, intent, "card_use_declared", eventId),
  };
  const cursor = cardUseCursorPayload(continuation);
  addStatusEffect(session.completeRules.lifecycle, {
    ownerId: intent.sourceId,
    kind: "card_use_commitment",
    sourcePlayerId: intent.sourceId,
    sourceSkillId: intent.viaSkill ?? "card_use",
    payload: {
      useId: intent.useId,
      commitment: cardUseIntentCommitmentPayload(intent),
      cursor,
    },
    visibility: "server_only",
    expiry: { type: "turn_end", turnId: session.turn.number },
  });
  continueCardUse(session, continuation);
}

function continueLijianJiang(
  session: GameSession,
  duel: Extract<PendingResponse, { type: "duel" }>,
  processedPlayerIds: readonly PlayerId[],
): void {
  const match = /^skill:lijian:(\d+)$/.exec(duel.cardId);
  const eventId = match ? Number(match[1]) : 0;
  const participants = [duel.initiatorId, duel.originalTargetId];
  if (!Number.isSafeInteger(eventId) || eventId <= 0 || eventId >= session.nextEventId ||
      duel.attackerId !== duel.initiatorId || duel.targetId !== duel.originalTargetId ||
      processedPlayerIds.length > participants.length ||
      processedPlayerIds.some((playerId, index) => playerId !== participants[index])) {
    throw new Error("离间激昂续体的事件或参与者游标无效。");
  }
  const processed = [...processedPlayerIds];
  while (processed.length < participants.length) {
    const playerId = participants[processed.length]!;
    processed.push(playerId);
    const owner = getLivingPlayer(session, playerId);
    if (!hasEffectiveSkill(session, owner, "jiang")) continue;
    const plan = planJiang({
      ownerId: owner.id,
      ownerAlive: owner.alive,
      skillEffective: true,
      targetDesignationSettled: true,
      role: owner.id === duel.initiatorId ? "card_user" : "card_target",
      cardKind: "duel",
      cardSuit: "spade",
      cardUserId: duel.initiatorId,
      targetIds: [duel.originalTargetId],
    });
    if (!plan.ok) throw new Error(plan.detail);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: owner.id,
      promptId: `skill:${eventId}:jiang:${owner.id}:${processed.length - 1}`,
      eventId,
      skillId: "jiang",
      stage: "jiang_invoke",
      duel: {
        ...duel,
        declinedLordSkillIds: [...(duel.declinedLordSkillIds ?? [])],
      },
      processedPlayerIds: processed,
    };
    return;
  }
  session.turn.phase = "respond";
  session.pendingResponse = {
    ...duel,
    declinedLordSkillIds: [...(duel.declinedLordSkillIds ?? [])],
  };
}

function beginValidatedCardUse(
  session: GameSession,
  player: GamePlayer,
  physical: Card,
  effectiveKind: CardKind,
  action: Pick<Extract<GameAction, { type: "play_card" }>, "targetId" | "targetIds">,
  viaSkill: CardUseIntent["viaSkill"],
): void {
  const method = effectiveKind === "iron_chain" && (action.targetIds?.length ?? 0) === 0 ? "recast" : "use";
  const intent: CardUseIntent = {
    useId: session.nextUseId,
    sourceId: player.id,
    physicalCardId: physical.id,
    physicalKind: physical.kind,
    effectiveKind,
    suit: physical.suit,
    rank: physical.rank,
    targetIds: canonicalCardUseTargets(session, player, physical, effectiveKind, action),
    method,
    viaSkill,
  };
  validateCardUseIntent(session, intent);
  session.nextUseId += 1;
  if (method === "recast") {
    commitCardUseIntent(session, intent);
    return;
  }
  startCardUse(session, intent);
}

function beginValidatedLuanjiUse(
  session: GameSession,
  player: GamePlayer,
  first: Card,
  second: Card,
): void {
  const intent: CardUseIntent = {
    useId: session.nextUseId,
    sourceId: player.id,
    physicalCardId: first.id,
    physicalKind: first.kind,
    effectiveKind: "arrow_barrage",
    suit: first.suit,
    rank: first.rank,
    additionalPhysicalCards: [{ id: second.id, kind: second.kind, suit: second.suit, rank: second.rank }],
    targetIds: canonicalCardUseTargets(session, player, first, "arrow_barrage", {}),
    method: "use",
    viaSkill: "luanji",
  };
  validateCardUseIntent(session, intent);
  session.nextUseId += 1;
  startCardUse(session, intent);
}

function applyPlayCard(
  session: GameSession,
  action: Extract<GameAction, { type: "play_card" }>,
): void {
  assertPlayTurn(session, action.playerId);
  const player = getLivingPlayer(session, action.playerId);
  const card = player.hand.find((candidate) => candidate.id === action.cardId);
  if (!card) ruleError("CARD_NOT_FOUND", `手牌中不存在 ${action.cardId}。`);
  if (isWushenLockedHeartHandCard(session, player, card) && card.kind !== "slash") {
    ruleError("INVALID_CARD", "武神将有效花色为红桃的手牌锁定视为杀，不能按原牌名使用。");
  }
  if (!ORDINARY_TRICK_KINDS.has(card.kind)) {
    commitPlayCard(session, action);
    return;
  }

  // Run the complete existing card validator against an isolated clone before
  // generating any trigger, moving the card, drawing, or beginning Wuxie.
  const probe = cloneSession(session);
  commitPlayCard(probe, action);
  beginValidatedCardUse(session, player, card, card.kind, action, null);
}

function isGuhuoResponsePending(pending: PendingResponse): pending is GuhuoRespondablePending {
  return pending.type === "slash" || pending.type === "duel" || pending.type === "mass_attack" ||
    pending.type === "nullification" || pending.type === "borrowed_sword" || pending.type === "dying";
}

function guhuoPromptId(eventId: number, cursor: number, targetId: PlayerId): string {
  return `guhuo:${eventId}:challenge:${cursor}:${targetId}`;
}

function guhuoPhysicalCard(session: GameSession, pending: PendingGuhuo): Card {
  const card = session.resolvingCards.find((candidate) => candidate.id === pending.physicalCardId);
  if (!card) throw new Error(`蛊惑实体牌 ${pending.physicalCardId} 已不在处理区。`);
  return card;
}

function assertGuhuoChallengeCursor(session: GameSession, pending: PendingGuhuoChallenge): void {
  const source = getLivingPlayer(session, pending.sourceId);
  if (!hasEffectiveSkill(session, source, "guhuo") || !isGuhuoDeclarableKind(pending.declaredKind)) {
    throw new Error("蛊惑质疑续体的技能或声明无效。");
  }
  if (!Number.isSafeInteger(pending.eventId) || pending.eventId <= 0 || pending.eventId >= session.nextEventId) {
    throw new Error("蛊惑质疑续体的事件编号无效。");
  }
  const order = livingOpponentsInSeatOrder(session, source.id)
    .filter((player) => player.hp !== 0)
    .map((player) => player.id);
  const expectedTarget = order[pending.challengeCursor];
  const expectedRemaining = order.slice(pending.challengeCursor + 1);
  if (
    !Number.isSafeInteger(pending.challengeCursor) || pending.challengeCursor < 0 ||
    expectedTarget !== pending.targetId ||
    pending.promptId !== guhuoPromptId(pending.eventId, pending.challengeCursor, pending.targetId) ||
    pending.remainingChallengeIds.length !== expectedRemaining.length ||
    pending.remainingChallengeIds.some((playerId, index) => playerId !== expectedRemaining[index])
  ) throw new Error("蛊惑质疑续体的座次游标无效。");
  const asked = order.slice(0, pending.challengeCursor);
  let lastIndex = -1;
  for (const challengerId of pending.challengerIds) {
    const index = asked.indexOf(challengerId);
    if (index <= lastIndex) throw new Error("蛊惑质疑者不属于已处理的权威座次。");
    lastIndex = index;
  }
  if (pending.continuation.type === "use") {
    const { intent } = pending.continuation;
    if (
      intent.sourceId !== source.id || intent.physicalCardId !== pending.physicalCardId ||
      intent.effectiveKind !== pending.declaredKind || intent.viaSkill !== "guhuo"
    ) throw new Error("蛊惑质疑续体的主动用牌声明不一致。");
  } else if (pending.continuation.pending.targetId !== source.id) {
    throw new Error("蛊惑质疑续体的响应目标不一致。");
  }
}

function assertGuhuoConsequenceCursor(session: GameSession, pending: PendingGuhuoConsequence): void {
  const source = getLivingPlayer(session, pending.sourceId);
  if (!hasEffectiveSkill(session, source, "guhuo") || !isGuhuoDeclarableKind(pending.declaredKind)) {
    throw new Error("蛊惑后果续体的技能或声明无效。");
  }
  if (!Number.isSafeInteger(pending.eventId) || pending.eventId <= 0 || pending.eventId >= session.nextEventId) {
    throw new Error("蛊惑后果续体的事件编号无效。");
  }
  const physical = guhuoPhysicalCard(session, pending);
  if (pending.effectiveSuit !== effectiveCardSuit(session, source, physical)) {
    throw new Error("蛊惑后果续体的有效花色与权威裁定不一致。");
  }

  const sourceIndex = session.players.findIndex((player) => player.id === source.id);
  const seatOrder: PlayerId[] = [];
  for (let offset = 1; offset < session.players.length; offset += 1) {
    const player = session.players[(sourceIndex + offset) % session.players.length];
    if (player) seatOrder.push(player.id);
  }
  let previousSeatIndex = -1;
  for (const challengerId of pending.challengerIds) {
    const seatIndex = seatOrder.indexOf(challengerId);
    if (seatIndex <= previousSeatIndex) {
      throw new Error("蛊惑后果续体的质疑者座次、唯一性或来源无效。");
    }
    previousSeatIndex = seatIndex;
  }
  if (
    !Number.isSafeInteger(pending.consequenceCursor) || pending.consequenceCursor < 0 ||
    pending.consequenceCursor > pending.challengerIds.length
  ) throw new Error("蛊惑后果游标无效。");
  const expectedRemaining = pending.challengerIds.slice(pending.consequenceCursor);
  const expectedTarget = pending.consequenceCursor === 0
    ? source.id
    : pending.challengerIds[pending.consequenceCursor - 1];
  if (
    expectedTarget !== pending.targetId ||
    pending.remainingConsequenceIds.length !== expectedRemaining.length ||
    pending.remainingConsequenceIds.some((playerId, index) => playerId !== expectedRemaining[index])
  ) throw new Error("蛊惑后果续体的目标或剩余质疑者与游标不一致。");

  const decision = adjudicateGuhuoChallenge({
    sourceId: source.id,
    declaredKind: pending.declaredKind,
    physicalKind: physical.kind,
    effectiveSuit: pending.effectiveSuit,
    challengerIds: pending.challengerIds,
  });
  if (!decision.ok) throw new Error(`蛊惑后果续体无法重新裁定：${decision.detail}`);
  const expectedEffect = decision.value.consequences[0]?.effect ?? null;
  if (
    pending.outcome !== decision.value.outcome ||
    pending.continuesAsDeclared !== decision.value.continuesAsDeclared ||
    pending.consequenceEffect !== expectedEffect ||
    decision.value.consequences.length !== pending.challengerIds.length ||
    decision.value.consequences.some((entry, index) => entry.playerId !== pending.challengerIds[index])
  ) throw new Error("蛊惑后果续体与权威重新裁定结果不一致。");

  if (pending.continuation.type === "use") {
    const { intent } = pending.continuation;
    if (
      intent.sourceId !== source.id || intent.physicalCardId !== pending.physicalCardId ||
      intent.effectiveKind !== pending.declaredKind || intent.viaSkill !== "guhuo"
    ) throw new Error("蛊惑后果续体的主动用牌声明不一致。");
  } else if (pending.continuation.pending.targetId !== source.id) {
    throw new Error("蛊惑后果续体的响应目标不一致。");
  }
}

function restoreGuhuoContinuation(session: GameSession, continuation: PendingGuhuo["continuation"]): void {
  if (continuation.type === "use") {
    session.pendingResponse = null;
    session.turn.phase = "play";
  } else {
    session.pendingResponse = clonePendingResponse(continuation.pending);
    session.turn.phase = "respond";
  }
}

function discardFailedGuhuo(session: GameSession, pending: PendingGuhuoConsequence): void {
  session.discardPile.push(takeResolvingCard(session, pending.physicalCardId));
  restoreGuhuoContinuation(session, pending.continuation);
}

function continueDeclaredGuhuo(session: GameSession, pending: PendingGuhuoConsequence): void {
  const source = getLivingPlayer(session, pending.sourceId);
  guhuoPhysicalCard(session, pending);
  if (pending.continuation.type === "use") {
    const { intent } = pending.continuation;
    if (
      intent.sourceId !== source.id || intent.physicalCardId !== pending.physicalCardId ||
      intent.effectiveKind !== pending.declaredKind || intent.viaSkill !== "guhuo"
    ) throw new Error("蛊惑主动用牌续体与声明不一致。");
    session.pendingResponse = null;
    session.turn.phase = "play";
    startCardUse(session, intent);
    return;
  }
  if (pending.continuation.pending.targetId !== source.id) {
    throw new Error("蛊惑响应续体目标与声明者不一致。");
  }
  session.pendingResponse = clonePendingResponse(pending.continuation.pending);
  session.turn.phase = "respond";
  if (pending.continuation.pending.type === "dying") {
    if (pending.declaredKind !== "peach" && pending.declaredKind !== "wine") {
      throw new Error("蛊惑濒死响应必须声明桃或酒。");
    }
    const physical = takeResolvingCard(session, pending.physicalCardId);
    source.hand.push(physical);
    applyDyingResponse(
      session,
      pending.continuation.pending,
      source,
      physical.id,
      "guhuo",
      pending.declaredKind,
    );
    return;
  }
  withGuhuoVirtualCard(session, source, pending.physicalCardId, pending.declaredKind, () => {
    applyResponse(session, { type: "respond", playerId: source.id, cardId: pending.physicalCardId }, "guhuo");
  });
}

function continueGuhuoConsequences(session: GameSession, initial: PendingGuhuoConsequence): void {
  let pending = cloneGuhuoPending(initial) as PendingGuhuoConsequence;
  assertGuhuoConsequenceCursor(session, pending);
  const expectedEffect = pending.consequenceEffect;

  while (pending.remainingConsequenceIds.length > 0) {
    const [playerId, ...remainingConsequenceIds] = pending.remainingConsequenceIds;
    if (!playerId) throw new Error("蛊惑后果游标缺少目标。");
    const next: PendingGuhuoConsequence = {
      ...pending,
      targetId: playerId,
      consequenceCursor: pending.consequenceCursor + 1,
      remainingConsequenceIds,
      continuation: cloneGuhuoContinuation(pending.continuation),
    };
    assertGuhuoConsequenceCursor(session, next);
    const player = getPlayer(session, playerId);
    pending = next;
    if (!player.alive) continue;
    if (expectedEffect === "draw") {
      const drawn = drawCards(session, player, 1);
      addLog(session, "card", `${player.id} 质疑了虚假的蛊惑声明，摸了 ${drawn} 张牌。`);
      continue;
    }
    if (expectedEffect === "lose_hp") {
      const enteredDying = loseHp(
        session,
        player,
        1,
        "质疑了真实的蛊惑声明",
        { type: "guhuo", pending: cloneGuhuoPending(next) as PendingGuhuoConsequence },
      );
      if (enteredDying) return;
    }
  }
  assertGuhuoConsequenceCursor(session, pending);

  if (session.status !== "playing") {
    session.pendingResponse = null;
    finishResolvingCards(session);
    return;
  }
  if (!pending.continuesAsDeclared) {
    discardFailedGuhuo(session, pending);
    return;
  }
  continueDeclaredGuhuo(session, pending);
}

function adjudicateLiveGuhuo(session: GameSession, pending: PendingGuhuoChallenge): void {
  const source = getLivingPlayer(session, pending.sourceId);
  const physical = guhuoPhysicalCard(session, pending);
  if (!isGuhuoDeclarableKind(pending.declaredKind)) throw new Error("蛊惑续体包含不可声明牌名。");
  const effectiveSuit = effectiveCardSuit(session, source, physical);
  const decision = adjudicateGuhuoChallenge({
    sourceId: source.id,
    declaredKind: pending.declaredKind,
    physicalKind: physical.kind,
    effectiveSuit,
    challengerIds: pending.challengerIds,
  });
  if (!decision.ok) throw new Error(`蛊惑裁定失败：${decision.detail}`);
  if (decision.value.challenged) {
    addLog(
      session,
      "card",
      `${source.id} 的蛊惑牌亮出为${physical.name}（${suitName(effectiveSuit)}），声明${decision.value.truthful ? "为真" : "为假"}。`,
    );
  } else {
    addLog(session, "card", `无人质疑 ${source.id} 的蛊惑声明。`);
  }
  const consequence: PendingGuhuoConsequence = {
    type: "guhuo",
    stage: "consequence",
    eventId: pending.eventId,
    sourceId: source.id,
    targetId: source.id,
    physicalCardId: pending.physicalCardId,
    declaredKind: pending.declaredKind,
    continuation: cloneGuhuoContinuation(pending.continuation),
    effectiveSuit,
    outcome: decision.value.outcome,
    continuesAsDeclared: decision.value.continuesAsDeclared,
    consequenceEffect: decision.value.consequences[0]?.effect ?? null,
    challengerIds: [...pending.challengerIds],
    consequenceCursor: 0,
    remainingConsequenceIds: decision.value.consequences.map((entry) => entry.playerId),
  };
  session.pendingResponse = consequence;
  continueGuhuoConsequences(session, consequence);
}

function applyDeclareGuhuo(
  session: GameSession,
  action: Extract<GameAction, { type: "declare_guhuo" }>,
): void {
  const source = getLivingPlayer(session, action.playerId);
  if (!hasEffectiveSkill(session, source, "guhuo")) ruleError("INVALID_SKILL", `${source.id} 没有有效的蛊惑。`);
  if (!isGuhuoDeclarableKind(action.declaredKind)) ruleError("INVALID_CARD", "蛊惑只能声明基本牌或普通锦囊牌。");
  const physical = source.hand.find((card) => card.id === action.cardId);
  if (!physical) ruleError("CARD_NOT_FOUND", `手牌中不存在 ${action.cardId}。`);

  let continuation: PendingGuhuo["continuation"];
  if (session.turn.phase === "play" && session.currentPlayerId === source.id) {
    if (action.declaredKind === "iron_chain" && (action.targetIds?.length ?? 0) === 0) {
      ruleError("INVALID_TARGET", "蛊惑声明铁索连环时必须实际使用，不能重铸。 ");
    }
    const intent: CardUseIntent = {
      useId: session.nextUseId,
      sourceId: source.id,
      physicalCardId: physical.id,
      physicalKind: physical.kind,
      effectiveKind: action.declaredKind,
      suit: physical.suit,
      rank: physical.rank,
      targetIds: canonicalCardUseTargets(session, source, physical, action.declaredKind, action),
      method: "use",
      viaSkill: "guhuo",
    };
    validateCardUseIntent(session, intent);
    session.nextUseId += 1;
    continuation = { type: "use", intent };
  } else {
    const pending = session.pendingResponse;
    if (
      session.turn.phase !== "respond" || !pending || pending.targetId !== source.id ||
      !isGuhuoResponsePending(pending)
    ) ruleError("INVALID_PHASE", "当前没有可用蛊惑响应的牌或濒死请求。");
    if (action.targetId !== undefined || action.targetIds !== undefined) {
      ruleError("INVALID_TARGET", "响应蛊惑不接受目标参数。");
    }
    const probe = cloneSession(session);
    const probeSource = getLivingPlayer(probe, source.id);
    if (pending.type === "dying") {
      if (action.declaredKind !== "peach" && action.declaredKind !== "wine") {
        ruleError("INVALID_RESPONSE", "濒死时蛊惑只能声明桃；濒死者本人也可声明酒。");
      }
      applyDyingResponse(probe, pending, probeSource, physical.id, "guhuo", action.declaredKind);
    } else {
      withVirtualCard(probe, probeSource, physical.id, action.declaredKind, () => {
        applyResponse(probe, { type: "respond", playerId: source.id, cardId: physical.id }, "guhuo");
      });
    }
    continuation = { type: "respond", pending: clonePendingResponse(pending) as GuhuoRespondablePending };
  }

  moveCardToResolving(session, source, physical.id);
  const eventId = allocateEventId(session);
  const challengeOrder = livingOpponentsInSeatOrder(session, source.id)
    .filter((player) => player.hp !== 0)
    .map((player) => player.id);
  const [targetId, ...remainingChallengeIds] = challengeOrder;
  addLog(session, "card", `${source.id} 发动蛊惑，扣置一张手牌并声明为${cardName(action.declaredKind)}。`);
  const base = {
    type: "guhuo" as const,
    eventId,
    sourceId: source.id,
    physicalCardId: physical.id,
    declaredKind: action.declaredKind,
    continuation: cloneGuhuoContinuation(continuation),
  };
  if (!targetId) {
    adjudicateLiveGuhuo(session, {
      ...base,
      stage: "challenge",
      targetId: source.id,
      promptId: guhuoPromptId(eventId, 0, source.id),
      challengeCursor: 0,
      challengerIds: [],
      remainingChallengeIds: [],
    });
    return;
  }
  session.turn.phase = "respond";
  session.pendingResponse = {
    ...base,
    stage: "challenge",
    targetId,
    promptId: guhuoPromptId(eventId, 0, targetId),
    challengeCursor: 0,
    challengerIds: [],
    remainingChallengeIds,
  };
}

function applyResolveGuhuo(
  session: GameSession,
  action: Extract<GameAction, { type: "resolve_guhuo" }>,
): void {
  const pending = session.pendingResponse;
  if (
    session.turn.phase !== "respond" || pending?.type !== "guhuo" || pending.stage !== "challenge" ||
    pending.targetId !== action.playerId
  ) ruleError("INVALID_PHASE", "当前没有轮到你处理的蛊惑质疑。");
  if (action.promptId !== pending.promptId) ruleError("INVALID_RESPONSE", "蛊惑质疑请求已过期。");
  assertGuhuoChallengeCursor(session, pending);
  const actor = getLivingPlayer(session, action.playerId);
  if (actor.hp === 0) ruleError("INVALID_RESPONSE", "体力值为 0 的角色不能质疑蛊惑。");
  guhuoPhysicalCard(session, pending);
  const challengerIds = action.challenge ? [...pending.challengerIds, actor.id] : [...pending.challengerIds];
  const remaining = pending.remainingChallengeIds.filter((playerId) => {
    const player = getPlayer(session, playerId);
    return player.alive && player.hp !== 0;
  });
  const [targetId, ...remainingChallengeIds] = remaining;
  if (!targetId) {
    adjudicateLiveGuhuo(session, { ...pending, challengerIds, remainingChallengeIds: [] });
    return;
  }
  const challengeCursor = pending.challengeCursor + 1;
  session.pendingResponse = {
    ...pending,
    targetId,
    promptId: guhuoPromptId(pending.eventId, challengeCursor, targetId),
    challengeCursor,
    challengerIds,
    remainingChallengeIds,
    continuation: cloneGuhuoContinuation(pending.continuation),
  };
}

function applyZhangBaSlash(
  session: GameSession,
  action: Extract<GameAction, { type: "use_zhang_ba_slash" }>,
): void {
  assertPlayTurn(session, action.playerId);
  const player = getLivingPlayer(session, action.playerId);
  if (player.equipment.weapon?.kind !== "zhang_ba_she_mao") {
    ruleError("INVALID_CARD", "未装备丈八蛇矛，不能将两张手牌当作杀。");
  }
  if (!canUseAnotherSlash(session, player)) {
    ruleError("SLASH_ALREADY_USED", "本出牌阶段已经使用过杀。");
  }
  if (action.cardIds.length !== 2 || new Set(action.cardIds).size !== 2) {
    ruleError("INVALID_CARD", "丈八蛇矛必须选择两张不同的手牌。");
  }
  const requestedTargetIds = action.targetIds ?? [action.targetId];
  const maxTargets = activeSlashTargetLimit(session, player, false);
  if (
    requestedTargetIds.length < 1 || requestedTargetIds.length > maxTargets ||
    new Set(requestedTargetIds).size !== requestedTargetIds.length || requestedTargetIds.includes(player.id)
  ) ruleError("INVALID_TARGET", `丈八蛇矛转化的杀必须指定一至${maxTargets}名不同的其他存活玩家。`);
  const targets = requestedTargetIds.map((targetId) => getLivingPlayer(session, targetId));
  for (const target of targets) {
    if (!canBeSlashTarget(session, target) || !isInActiveSlashRange(session, player, target.id)) {
      ruleError("INVALID_TARGET", `${target.id} 不在丈八蛇矛的攻击范围内。`);
    }
  }
  const target = targets[0];
  if (!target) throw new Error("丈八蛇矛缺少首个杀目标。");
  const selected = action.cardIds.map((id) => player.hand.find((card) => card.id === id));
  if (selected.some((card) => !card)) ruleError("CARD_NOT_FOUND", "丈八蛇矛所选手牌已不存在。");
  const moveBatchId = nextMoveBatchId(session);
  const cards = selected.map((card) => removeCard(session, player, card!.id, moveBatchId));
  session.resolvingCards.push(...cards);
  const color = cards.every((card) => isRedCard(session, player, card))
    ? "red"
    : cards.every((card) => isBlackCard(session, player, card)) ? "black" : "colorless";
  const damage = 1 + session.turn.slashDamageBonus + luoyiDamageBonus(session, player);
  markActiveSlashUsed(session);
  session.turn.slashDamageBonus = 0;
  addLog(session, "card", `${player.id} 发动丈八蛇矛，将两张手牌当作杀对 ${target.id} 使用。`);
  beginSlashTarget(session, {
    type: "slash",
    attackerId: player.id,
    targetId: target.id,
    cardId: cards[0]!.id,
    damageCardIds: cards.map((card) => card.id),
    slashKind: "slash",
    damage,
    nature: "normal",
    color,
    armorIgnored: false,
    requiredDodgeCount: wushuangResponseCount(session, player),
    dodgesPlayed: 0,
    remainingTargetIds: targets.slice(1).map((candidate) => candidate.id),
    zhuQueChecked: true,
    ciXiongChecked: true,
    liegongChecked: false,
    useProvenance: {
      method: "use",
      turnPlayerId: session.turn.playerId,
      phase: session.turn.phase,
    },
    completion: { type: "default" },
  });
}

function finishResponse(session: GameSession): void {
  session.pendingResponse = null;
  if (session.status === "playing") session.turn.phase = "play";
}

function loseEquipment(
  session: GameSession,
  player: GamePlayer,
  slot: EquipmentSlot,
  moveBatchId?: number,
): Card {
  const card = player.equipment[slot];
  if (!card) ruleError("CARD_NOT_FOUND", `${player.id} 的装备区中没有该牌。`);
  delete player.equipment[slot];
  enqueueTuntianLossBatch(session, player, [{ card, zone: "equipment" }], moveBatchId);
  if (card.kind === "bai_yin_shi_zi" && !armorInvalidatedByWuqian(session, player.id) &&
      player.alive && player.hp < player.maxHp) {
    recoverLivePlayer(session, player, 1, player.id, "bai_yin_shi_zi");
    addLog(session, "card", `${player.id} 失去白银狮子，回复了 1 点体力。`);
  }
  enqueueAfterMoveSkill(session, player, "xiaoji");
  return card;
}

function loseAllEquipment(session: GameSession, player: GamePlayer): Card[] {
  const removed: Card[] = [];
  const moveBatchId = nextMoveBatchId(session);
  for (const slot of ["weapon", "armor", "offensive_horse", "defensive_horse"] as const) {
    if (player.equipment[slot]) removed.push(loseEquipment(session, player, slot, moveBatchId));
  }
  return removed;
}

function removeOwnedCard(session: GameSession, player: GamePlayer, cardId: CardId, moveBatchId?: number): Card {
  const handCard = player.hand.find((card) => card.id === cardId);
  if (handCard) return removeCard(session, player, cardId, moveBatchId);
  for (const slot of ["weapon", "armor", "offensive_horse", "defensive_horse"] as const) {
    if (player.equipment[slot]?.id === cardId) return loseEquipment(session, player, slot, moveBatchId);
  }
  ruleError("CARD_NOT_FOUND", `${player.id} 没有持有 ${cardId}。`);
}

function ownedCards(player: GamePlayer): Card[] {
  return [...player.hand, ...Object.values(player.equipment)];
}

function ownedCard(player: GamePlayer, cardId: CardId): Card {
  const card = ownedCards(player).find((candidate) => candidate.id === cardId);
  if (!card) ruleError("CARD_NOT_FOUND", `${player.id} 没有持有 ${cardId}。`);
  return card;
}

type LonghunVirtualKind = "peach" | "fire_slash" | "dodge" | "wu_xie_ke_ji";

function longhunKindForSuit(suit: CardSuit): LonghunVirtualKind {
  if (suit === "heart") return "peach";
  if (suit === "diamond") return "fire_slash";
  if (suit === "club") return "dodge";
  return "wu_xie_ke_ji";
}

interface LonghunOwnedComponent {
  readonly card: Card;
  readonly from: Extract<ZoneRef, { kind: "hand" | "equipment" }>;
}

function longhunOwnedComponents(
  player: GamePlayer,
  cardIds: readonly CardId[],
): LonghunOwnedComponent[] {
  return cardIds.map((cardId) => {
    const handCard = player.hand.find((card) => card.id === cardId);
    if (handCard) return { card: handCard, from: { kind: "hand", playerId: player.id } };
    const equipment = Object.entries(player.equipment)
      .find(([, card]) => card.id === cardId) as [EquipmentSlot, Card] | undefined;
    if (!equipment) ruleError("INVALID_CARD", "龙魂只能使用自己的手牌或装备牌。");
    return {
      card: equipment[1],
      from: { kind: "equipment", playerId: player.id, slot: equipment[0] },
    };
  });
}

function evaluateLiveLonghun(
  session: GameSession,
  player: GamePlayer,
  cardIds: readonly CardId[],
  requestedKind: LonghunVirtualKind,
  method: "use" | "respond",
  requestedCardTimingLegal: boolean,
) {
  const components = longhunOwnedComponents(player, cardIds);
  const evaluated = evaluateLonghun({
    context: godSkillContext(session, player, "longhun"),
    ownerHp: player.hp,
    ownerHandCount: player.hand.length,
    components: components.map(({ card, from }) => ({
      card: godRuleCard(player, card, from.kind),
      effectiveSuit: effectiveCardSuit(session, player, card),
    })),
    requestedKind,
    method,
    requestedCardTimingLegal,
  });
  if (!evaluated.ok) {
    ruleError(
      evaluated.code === "wrong_timing" ? "INVALID_PHASE" :
        evaluated.code === "insufficient_cards" ? "INVALID_SELECTION" : "INVALID_CARD",
      evaluated.detail,
    );
  }
  return { plan: evaluated.value, components };
}

function longhunCardGroups(
  session: GameSession,
  player: GamePlayer,
  effectiveSuit: CardSuit,
): CardId[][] {
  if (!hasEffectiveSkill(session, player, "longhun")) return [];
  const required = Math.max(player.hp, 1);
  const candidates = ownedCards(player)
    .filter((card) => effectiveCardSuit(session, player, card) === effectiveSuit)
    .map((card) => card.id);
  if (candidates.length < required) return [];
  const groups: CardId[][] = [];
  const selected: CardId[] = [];
  const choose = (start: number): void => {
    if (selected.length === required) {
      groups.push([...selected]);
      return;
    }
    const remaining = required - selected.length;
    for (let index = start; index <= candidates.length - remaining; index += 1) {
      selected.push(candidates[index]!);
      choose(index + 1);
      selected.pop();
    }
  };
  choose(0);
  return groups;
}

function yeyanCostCardGroups(session: GameSession, player: GamePlayer): CardId[][] {
  if (!hasEffectiveSkill(session, player, "yeyan") || player.hp < 3) return [];
  const bySuit = (["spade", "heart", "club", "diamond"] as const).map((suit) =>
    player.hand.filter((card) => effectiveCardSuit(session, player, card) === suit).map((card) => card.id));
  if (bySuit.some((cardIds) => cardIds.length === 0)) return [];
  const groups: CardId[][] = [];
  for (const spade of bySuit[0]!) {
    for (const heart of bySuit[1]!) {
      for (const club of bySuit[2]!) {
        for (const diamond of bySuit[3]!) groups.push([spade, heart, club, diamond]);
      }
    }
  }
  return groups;
}

function commitLonghunComponents(
  session: GameSession,
  player: GamePlayer,
  components: readonly LonghunOwnedComponent[],
  cardUseFrameId: number,
): { readonly moveBatchId: number; readonly cards: Card[]; readonly moveRecords: MoveRecord[] } {
  const moveBatchId = nextMoveBatchId(session);
  const cards = components.map(({ card }) => removeOwnedCard(session, player, card.id, moveBatchId));
  session.resolvingCards.push(...cards);
  const moveRecords = components.map(({ from }, index): MoveRecord => ({
    batchId: moveBatchId,
    cardIds: [cards[index]!.id],
    cards: [cloneCard(cards[index]!)],
    from,
    to: { kind: "processing", frameId: cardUseFrameId },
    placement: "append",
    reason: "respond",
    visibility: "public",
    actorId: player.id,
    sourceId: player.id,
    targetId: null,
    skillId: "longhun",
    useId: null,
    frameId: cardUseFrameId,
  }));
  return { moveBatchId, cards, moveRecords };
}

function withLonghunVirtualCard(
  session: GameSession,
  player: GamePlayer,
  components: readonly LonghunOwnedComponent[],
  virtualKind: LonghunVirtualKind,
  execute: (physicalCardIds: readonly CardId[]) => void,
): void {
  const frameId = allocateEventId(session);
  const committed = commitLonghunComponents(session, player, components, frameId);
  const primary = takeResolvingCard(session, committed.cards[0]!.id);
  if (session.virtualCardOrigins[primary.id]) throw new Error(`牌 ${primary.id} 已经具有虚拟来源。`);
  session.virtualCardOrigins[primary.id] = primary.kind;
  player.hand.push({
    ...getCardDefinition(virtualKind),
    id: primary.id,
    kind: virtualKind,
    suit: primary.suit,
    rank: primary.rank,
  });
  try {
    execute(committed.cards.map((card) => card.id));
  } finally {
    restorePhysicalCard(session, primary);
    delete session.virtualCardOrigins[primary.id];
  }
}

function restorePhysicalCard(session: GameSession, physical: Card): void {
  let replacements = 0;
  const replaceIn = (cards: Card[]): void => {
    const index = cards.findIndex((card) => card.id === physical.id);
    if (index >= 0) {
      cards[index] = physical;
      replacements += 1;
    }
  };
  replaceIn(session.deck);
  replaceIn(session.discardPile);
  replaceIn(session.resolvingCards);
  for (const player of session.players) {
    replaceIn(player.hand);
    replaceIn(player.judgment);
    for (const slot of ["weapon", "armor", "offensive_horse", "defensive_horse"] as const) {
      if (player.equipment[slot]?.id === physical.id) {
        player.equipment[slot] = physical;
        replacements += 1;
      }
    }
  }
  if (replacements !== 1) {
    throw new Error(`虚拟牌 ${physical.id} 结算后应当恰好位于一个区域，实际为 ${replacements}。`);
  }
}

function withVirtualCard(
  session: GameSession,
  player: GamePlayer,
  cardId: CardId,
  virtualKind: CardKind,
  execute: () => void,
): void {
  const physical = removeOwnedCard(session, player, cardId);
  if (session.virtualCardOrigins[physical.id]) {
    throw new Error(`牌 ${physical.id} 已经具有虚拟来源。`);
  }
  session.virtualCardOrigins[physical.id] = physical.kind;
  const virtual: Card = {
    ...getCardDefinition(virtualKind),
    id: physical.id,
    kind: virtualKind,
    suit: physical.suit,
    rank: physical.rank,
  };
  player.hand.push(virtual);
  try {
    execute();
  } finally {
    restorePhysicalCard(session, physical);
    delete session.virtualCardOrigins[physical.id];
  }
}

function withFieldVirtualCard(
  session: GameSession,
  player: GamePlayer,
  cardId: CardId,
  virtualKind: CardKind,
  execute: () => void,
): void {
  const field = player.extraPiles.field ?? [];
  const index = field.findIndex((card) => card.id === cardId);
  if (index < 0) ruleError("CARD_NOT_FOUND", `田中不存在 ${cardId}。`);
  const [physical] = field.splice(index, 1);
  if (!physical) throw new Error("移除急袭田牌失败。");
  player.extraPiles.field = field;
  if (session.virtualCardOrigins[physical.id]) throw new Error(`牌 ${physical.id} 已经具有虚拟来源。`);
  session.virtualCardOrigins[physical.id] = physical.kind;
  player.hand.push({
    ...getCardDefinition(virtualKind),
    id: physical.id,
    kind: virtualKind,
    suit: physical.suit,
    rank: physical.rank,
  });
  try {
    execute();
  } finally {
    restorePhysicalCard(session, physical);
    delete session.virtualCardOrigins[physical.id];
  }
}

function withGuhuoVirtualCard(
  session: GameSession,
  player: GamePlayer,
  cardId: CardId,
  virtualKind: CardKind,
  execute: () => void,
): void {
  if (player.hand.some((card) => card.id === cardId)) {
    withVirtualCard(session, player, cardId, virtualKind, execute);
    return;
  }
  const physical = takeResolvingCard(session, cardId);
  if (session.virtualCardOrigins[physical.id]) throw new Error(`牌 ${physical.id} 已经具有虚拟来源。`);
  session.virtualCardOrigins[physical.id] = physical.kind;
  player.hand.push({
    ...getCardDefinition(virtualKind),
    id: physical.id,
    kind: virtualKind,
    suit: physical.suit,
    rank: physical.rank,
  });
  try {
    execute();
  } finally {
    restorePhysicalCard(session, physical);
    delete session.virtualCardOrigins[physical.id];
  }
}

function withVirtualDelayedCard(
  session: GameSession,
  player: GamePlayer,
  cardId: CardId,
  virtualKind: Extract<CardKind, "le_bu_si_shu" | "bing_liang_cun_duan">,
  execute: () => void,
): void {
  const physical = removeOwnedCard(session, player, cardId);
  if (session.virtualCardOrigins[physical.id]) {
    throw new Error(`牌 ${physical.id} 已经具有虚拟来源。`);
  }
  session.virtualCardOrigins[physical.id] = physical.kind;
  player.hand.push({
    ...getCardDefinition(virtualKind),
    id: physical.id,
    kind: virtualKind,
    suit: physical.suit,
    rank: physical.rank,
  });
  execute();
}

function selectedSkillCardIds(
  action: Extract<GameAction, { type: "use_skill" }>,
  minCards: number,
  maxCards: number,
): CardId[] {
  const cardIds = action.cardIds ?? [];
  if (
    cardIds.length < minCards ||
    cardIds.length > maxCards ||
    new Set(cardIds).size !== cardIds.length
  ) {
    ruleError(
      "INVALID_SELECTION",
      `${action.skillId} 必须选择 ${minCards === maxCards ? minCards : `${minCards}-${maxCards}`} 张不同的牌。`,
    );
  }
  return cardIds;
}

function selectedSkillCard(action: Extract<GameAction, { type: "use_skill" }>): CardId {
  return selectedSkillCardIds(action, 1, 1)[0]!;
}

function skillUseCount(session: GameSession, skillId: keyof TurnState["skillUseCounts"]): number {
  return session.turn.skillUseCounts?.[skillId] ?? 0;
}

function markSkillUsed(session: GameSession, skillId: keyof TurnState["skillUseCounts"]): void {
  session.turn.skillUseCounts ??= {};
  session.turn.skillUseCounts[skillId] = skillUseCount(session, skillId) + 1;
}

function evaluateLiveHuangtianGift(
  session: GameSession,
  giver: GamePlayer,
  receiver: GamePlayer,
  card: Card,
): ReturnType<typeof evaluateHuangtianGift> {
  return evaluateHuangtianGift({
    giverId: giver.id,
    giverFaction: factionOf(session, giver) ?? "god",
    giverAlive: giver.alive,
    receiverId: receiver.id,
    receiverAlive: receiver.alive,
    receiverHasEffectiveHuangtian: hasEffectiveSkill(session, receiver, "huangtian"),
    turnPlayerId: session.currentPlayerId,
    phase: session.turn.phase,
    useCountThisPlayPhase: skillUseCount(session, "huangtian"),
    card: {
      id: card.id,
      kind: card.kind,
      category: card.category,
      printedSuit: card.suit,
      ownerId: giver.id,
      zone: giver.hand.some((candidate) => candidate.id === card.id) ? "hand" : "equipment",
      physical: true,
    },
  });
}

function evaluateLiveJushouDisposal(owner: GamePlayer, card: Card) {
  return evaluateJushouDisposal({
    skillOwnerId: owner.id,
    mode: card.category === "equipment" ? "use_equipment" : "discard_non_equipment",
    card: {
      id: card.id,
      kind: card.kind,
      category: card.category,
      printedSuit: card.suit,
      ownerId: owner.id,
      zone: "hand",
      physical: true,
    },
    equipmentUseLegal: card.category === "equipment" && getCardDefinition(card.kind).equipmentSlot !== undefined,
  });
}

function evaluateLiveShensu(
  session: GameSession,
  owner: GamePlayer,
  stage: "judgment_and_draw" | "play",
  target: GamePlayer,
  costCard: Card | null,
) {
  return evaluateShensuActivation({
    stage,
    window: stage === "judgment_and_draw" ? "before_judgment" : "before_play",
    skillOwnerId: owner.id,
    turnPlayerId: session.currentPlayerId,
    phaseAlreadySkipped: stage === "play" && session.turn.skipPlay,
    costCard: costCard ? {
      id: costCard.id,
      kind: costCard.kind,
      category: costCard.category,
      printedSuit: costCard.suit,
      ownerId: owner.id,
      zone: owner.hand.some((card) => card.id === costCard.id) ? "hand" : "equipment",
      physical: true,
    } : null,
    target: {
      id: target.id,
      alive: target.alive,
      legalIgnoringDistance: target.id !== owner.id && canBeSlashTarget(session, target),
    },
  });
}

function shensuTargetIds(
  session: GameSession,
  owner: GamePlayer,
  stage: "judgment_and_draw" | "play",
): PlayerId[] {
  const costCard = stage === "play"
    ? ownedCards(owner).find((card) => card.category === "equipment") ?? null
    : null;
  return session.players.filter((target) => {
    const result = evaluateLiveShensu(session, owner, stage, target, costCard);
    if (!result.ok) throw new Error(result.detail);
    return result.value.eligible;
  }).map((target) => target.id);
}

function beginShensuSlash(
  session: GameSession,
  owner: GamePlayer,
  target: GamePlayer,
  stage: "judgment_and_draw" | "play",
  eventId: number,
): void {
  const continuationId = allocateEventId(session);
  beginSlashTarget(session, {
    type: "slash",
    attackerId: owner.id,
    targetId: target.id,
    cardId: `virtual:shensu:${eventId}`,
    damageCardIds: [],
    sourceSkillId: "shensu",
    slashKind: "slash",
    damage: 1,
    nature: "normal",
    color: "colorless",
    armorAttempted: false,
    armorIgnored: false,
    requiredDodgeCount: wushuangResponseCount(session, owner),
    dodgesPlayed: 0,
    remainingTargetIds: [],
    zhuQueChecked: false,
    ciXiongChecked: false,
    liuliCheckedPlayerIds: [],
    liegongChecked: false,
    tieqiChecked: false,
    useProvenance: {
      method: "use",
      turnPlayerId: session.turn.playerId,
      phase: stage === "judgment_and_draw" ? "judgment" : "play",
    },
    excludedRedirectTargetIds: [owner.id, target.id],
    dodgeProhibited: false,
    completion: {
      type: "turn_flow",
      continuationId,
      playerId: owner.id,
      destination: stage === "judgment_and_draw" ? "before_play" : "discard_or_end",
    },
  });
}

function tianxiangVisitedTargetIds(frame: DamageFlowFrame): Set<PlayerId> {
  return new Set([
    frame.damage.originalTargetId,
    ...frame.damage.redirects.map((redirect) => redirect.toTargetId),
  ]);
}

function evaluateLiveTianxiangChoice(
  session: GameSession,
  frame: DamageFlowFrame,
  owner: GamePlayer,
  costCard: Card,
  target: GamePlayer,
): ReturnType<typeof evaluateTianxiangChoice> {
  return evaluateTianxiangChoice({
    skillOwnerId: owner.id,
    currentDamageTargetId: frame.damage.targetId,
    costCard: {
      id: costCard.id,
      kind: costCard.kind,
      category: costCard.category,
      printedSuit: costCard.suit,
      ownerId: owner.id,
      zone: "hand",
      physical: true,
    },
    hongyan: {
      ownerId: owner.id,
      active: hasEffectiveSkill(session, owner, "hongyan"),
    },
    target: { id: target.id, alive: target.alive },
  });
}

function tianxiangCostCardIds(
  session: GameSession,
  frame: DamageFlowFrame,
  owner: GamePlayer,
): CardId[] {
  const probeTarget = session.players.find((candidate) =>
    candidate.alive && candidate.id !== owner.id && !tianxiangVisitedTargetIds(frame).has(candidate.id));
  if (!probeTarget) return [];
  return owner.hand
    .filter((card) => {
      const result = evaluateLiveTianxiangChoice(session, frame, owner, card, probeTarget);
      if (!result.ok) throw new Error(result.detail);
      return result.value.eligible;
    })
    .map((card) => card.id);
}

function tianxiangTargetIds(session: GameSession, frame: DamageFlowFrame, owner: GamePlayer): PlayerId[] {
  const visited = tianxiangVisitedTargetIds(frame);
  return session.players
    .filter((target) => target.alive && target.id !== owner.id && !visited.has(target.id))
    .map((target) => target.id);
}

function requiredResponseForSkill(session: GameSession, player: GamePlayer): "slash" | "dodge" | null {
  const pending = session.pendingResponse;
  if (session.turn.phase !== "respond" || !pending || pending.targetId !== player.id) return null;
  if (pending.type !== "slash" && pending.type !== "duel" && pending.type !== "mass_attack" && pending.type !== "borrowed_sword") {
    return null;
  }
  return responseKind(pending);
}

function pindianPromptId(eventId: number, cursor: 0 | 1, playerId: PlayerId): string {
  return `pindian:${eventId}:select:${cursor}:${playerId}`;
}

function assertLivePindian(session: GameSession, pending: PendingPindian): void {
  const frame = pending.frame;
  if (
    !Number.isSafeInteger(pending.eventId) || pending.eventId <= 0 || pending.eventId >= session.nextEventId ||
    frame.frameId !== pending.eventId || frame.reasonSkillId !== pending.skillId ||
    (pending.skillId !== "tianyi" && pending.skillId !== "quhu" && pending.skillId !== "lieren" && pending.skillId !== "zhiba")
  ) throw new Error("拼点续体的事件或技能标识无效。");
  const initiator = getLivingPlayer(session, frame.initiatorId);
  const target = getLivingPlayer(session, frame.targetId);
  const ownsReasonSkill = pending.skillId === "zhiba"
    ? target.role === "lord" && hasEffectiveSkill(session, target, "zhiba") && factionOf(session, initiator) === "wu"
    : hasEffectiveSkill(session, initiator, pending.skillId);
  if (target.id === initiator.id || !ownsReasonSkill) {
    throw new Error("拼点续体的参与者或技能次数无效。");
  }
  if (pending.skillId === "lieren") {
    if (pending.continuation.type !== "lieren") throw new Error("烈刃拼点续体类型无效。 ");
    const damage = assertLiveDamageCursor(session, pending.continuation.damageOpportunity);
    const opportunity = damage.window?.opportunities[damage.window.cursor];
    if (damage.damage.sourceId !== initiator.id || damage.damage.targetId !== target.id ||
        pending.continuation.damageOpportunity.ownerId !== initiator.id ||
        opportunity?.ref.skillId !== "lieren" || opportunity.ref.ownerId !== initiator.id) {
      throw new Error("烈刃拼点与 DamageFlow 机会不一致。 ");
    }
  } else if (initiator.id !== session.currentPlayerId || skillUseCount(session, pending.skillId) !== 1) {
    throw new Error("拼点续体的参与者或技能次数无效。");
  }
  if (
    (pending.continuation.type === "tianyi" && pending.skillId !== "tianyi") ||
    (pending.continuation.type === "quhu" && pending.skillId !== "quhu") ||
    (pending.continuation.type === "lieren" && pending.skillId !== "lieren") ||
    (pending.continuation.type === "zhiba" && pending.skillId !== "zhiba")
  ) throw new Error("拼点续体的结算类型与技能不一致。");
  if (pending.continuation.type === "quhu") {
    const damageTarget = getLivingPlayer(session, pending.continuation.damageTargetId);
    if (
      damageTarget.id === initiator.id || damageTarget.id === target.id ||
      distanceBetweenPlayers(session, target.id, damageTarget.id) > attackRangeFor(session, target.id)
    ) throw new Error("驱虎拼点续体的伤害目标无效。");
  }

  const selectionKeys = Object.keys(frame.selections);
  if (
    selectionKeys.some((playerId) => playerId !== initiator.id && playerId !== target.id) ||
    Object.keys(frame.revealedRanks).length !== 0 || Object.keys(frame.effectiveRanks).length !== 0 ||
    frame.rankModifiers.length !== 0 || frame.result !== null || Object.keys(frame.settledDestinations).length !== 0
  ) throw new Error("拼点秘密选择续体包含越阶段数据。");
  const initiatorSelected = typeof frame.selections[initiator.id] === "string";
  const targetSelected = typeof frame.selections[target.id] === "string";
  let expectedTarget: PlayerId;
  let expectedCursor: 0 | 1;
  if (frame.stage === "selecting" && !initiatorSelected && !targetSelected) {
    expectedTarget = initiator.id;
    expectedCursor = 0;
  } else if (frame.stage === "selecting" && initiatorSelected && !targetSelected) {
    expectedTarget = target.id;
    expectedCursor = 1;
  } else if (frame.stage === "ready_to_reveal" && initiatorSelected && targetSelected) {
    expectedTarget = target.id;
    expectedCursor = 1;
  } else {
    throw new Error("拼点秘密选择续体的阶段或提交顺序无效。");
  }
  if (
    pending.targetId !== expectedTarget ||
    pending.promptId !== pindianPromptId(pending.eventId, expectedCursor, expectedTarget)
  ) throw new Error("拼点秘密选择续体的提示游标无效。");
  const adapted = pindianZoneState(session, frame);
  assertPindianFrame(adapted.state, frame);
}

function beginLivePindian(
  session: GameSession,
  initiator: GamePlayer,
  target: GamePlayer,
  skillId: PendingPindian["skillId"],
  continuation: PendingPindian["continuation"],
): void {
  const eventId = allocateEventId(session);
  const frame = createPindianFrame(pindianZoneState(session, {
    type: "pindian",
    frameId: eventId,
    initiatorId: initiator.id,
    targetId: target.id,
    reasonSkillId: skillId,
    stage: "selecting",
    selections: {},
    revealedRanks: {},
    effectiveRanks: {},
    rankModifiers: [],
    result: null,
    settledDestinations: {},
  }).state, {
    frameId: eventId,
    initiatorId: initiator.id,
    targetId: target.id,
    reasonSkillId: skillId,
  });
  if (skillId !== "lieren" && skillId !== "zhiba") markSkillUsed(session, skillId);
  session.turn.phase = "respond";
  session.pendingResponse = {
    type: "pindian",
    eventId,
    targetId: initiator.id,
    promptId: pindianPromptId(eventId, 0, initiator.id),
    skillId,
    frame,
    continuation: continuation.type === "lieren"
      ? { type: "lieren", damageOpportunity: { ...continuation.damageOpportunity } }
      : { ...continuation },
  };
  addLog(session, "card", `${initiator.id} 发动${skillId === "tianyi" ? "天义" : skillId === "quhu" ? "驱虎" : skillId === "lieren" ? "烈刃" : "制霸"}，与 ${target.id} 开始秘密拼点。`);
}

function assertRevealedPindian(
  session: GameSession,
  pending: PendingPindian,
  processedPlayerIds: readonly PlayerId[],
): void {
  const frame = pending.frame;
  const participants = [frame.initiatorId, frame.targetId];
  if (
    frame.stage !== "modifying" || frame.frameId !== pending.eventId || frame.reasonSkillId !== pending.skillId ||
    processedPlayerIds.length > participants.length ||
    processedPlayerIds.some((playerId, index) => playerId !== participants[index]) ||
    frame.result !== null || Object.keys(frame.settledDestinations).length !== 0
  ) throw new Error("拼点改点数续体的阶段或处理游标无效。");
  const initiator = getLivingPlayer(session, frame.initiatorId);
  const target = getLivingPlayer(session, frame.targetId);
  const ownsReasonSkill = pending.skillId === "zhiba"
    ? target.role === "lord" && hasEffectiveSkill(session, target, "zhiba") && factionOf(session, initiator) === "wu"
    : hasEffectiveSkill(session, initiator, pending.skillId);
  if (!ownsReasonSkill || initiator.id !== session.currentPlayerId && pending.skillId !== "lieren" ||
      pending.skillId !== "lieren" && skillUseCount(session, pending.skillId) !== 1) {
    throw new Error("拼点改点数续体的参与者或技能次数无效。");
  }
  if (
    (pending.continuation.type === "tianyi" && pending.skillId !== "tianyi") ||
    (pending.continuation.type === "quhu" && pending.skillId !== "quhu") ||
    (pending.continuation.type === "lieren" && pending.skillId !== "lieren") ||
    (pending.continuation.type === "zhiba" && pending.skillId !== "zhiba")
  ) throw new Error("拼点改点数续体的结算类型无效。");
  if (pending.continuation.type === "lieren") {
    const damage = assertLiveDamageCursor(session, pending.continuation.damageOpportunity);
    const opportunity = damage.window?.opportunities[damage.window.cursor];
    if (damage.damage.sourceId !== initiator.id || damage.damage.targetId !== target.id ||
        opportunity?.ref.skillId !== "lieren" || opportunity.ref.ownerId !== initiator.id) {
      throw new Error("烈刃拼点改点数续体与 DamageFlow 不一致。");
    }
  }
  const adapted = pindianZoneState(session, frame);
  assertPindianFrame(adapted.state, frame);
  const expectedRanks: Record<PlayerId, CardRank> = {};
  for (const playerId of participants) {
    const revealed = frame.revealedRanks[playerId];
    if (!revealed) throw new Error("拼点改点数续体缺少亮出点数。");
    expectedRanks[playerId] = revealed;
  }
  const seen = new Set<PlayerId>();
  for (const modifier of frame.rankModifiers) {
    const before = expectedRanks[modifier.playerId];
    if (modifier.skillId !== "yingyang" || before === undefined || seen.has(modifier.playerId) ||
        !processedPlayerIds.includes(modifier.playerId) || (modifier.delta !== 3 && modifier.delta !== -3) ||
        modifier.rankBefore !== before || modifier.rankAfter !== Math.max(1, Math.min(13, before + modifier.delta))) {
      throw new Error("拼点应扬修正记录遭到篡改。");
    }
    seen.add(modifier.playerId);
    expectedRanks[modifier.playerId] = modifier.rankAfter;
  }
  if (participants.some((playerId) => frame.effectiveRanks[playerId] !== expectedRanks[playerId])) {
    throw new Error("拼点应扬后的有效点数遭到篡改。");
  }
}

function completeOrdinaryPindian(
  session: GameSession,
  pending: PendingPindian,
  initiatorCard: Card,
  targetCard: Card,
): void {
  const result = pending.frame.result;
  if (!result || pending.frame.stage !== "settled") throw new Error("普通拼点尚未结算完成。");
  const initiator = getLivingPlayer(session, pending.frame.initiatorId);
  const target = getLivingPlayer(session, pending.frame.targetId);
  session.pendingResponse = null;
  session.turn.phase = "play";
  if (pending.continuation.type === "tianyi") {
    const evaluated = evaluateTianyi({
      context: {
        actorId: initiator.id,
        currentPlayerId: session.currentPlayerId,
        phase: "play",
        actorAlive: initiator.alive,
        skillEffective: hasEffectiveSkill(session, initiator, "tianyi"),
      },
      alreadyUsedThisTurn: false,
      pindian: {
        initiatorId: initiator.id,
        targetId: target.id,
        initiatorRank: result.initiatorRank,
        targetRank: result.targetRank,
      },
      baseSlashPolicy: {
        useLimit: initiator.equipment.weapon?.kind === "zhu_ge_lian_nu" || hasEffectiveSkill(session, initiator, "paoxiao") ? null : 1,
        usesSoFar: activeSlashUses(session),
        ignoresDistance: false,
        maxTargets: 1,
      },
    });
    if (!evaluated.ok) throw new Error(`天义拼点结算失败：${evaluated.detail}`);
    session.turn.tianyiOutcome = evaluated.value.outcome;
    addLog(session, "card", `${initiator.id} 天义拼点${evaluated.value.outcome === "win" ? "获胜" : evaluated.value.outcome === "tie" ? "平局" : "失败"}。`);
    return;
  }
  if (pending.continuation.type === "lieren") {
    const plan = resolveLierenPindian({
      ownerId: initiator.id,
      targetId: target.id,
      ownerCard: forestRuleCard(initiator, initiatorCard, "hand"),
      targetCard: forestRuleCard(target, targetCard, "hand"),
    });
    if (!plan.ok) throw new Error(plan.detail);
    const ownerWon = result.winnerId === initiator.id;
    if (plan.value.ownerWon !== ownerWon) throw new Error("烈刃拼点结果与权威 PindianFrame 不一致。 ");
    const cursor = pending.continuation.damageOpportunity;
    if (!ownerWon || target.hand.length === 0 && Object.keys(target.equipment).length === 0) {
      consumeLiveDamageOpportunity(session, cursor, "resolve", `lieren:${cursor.damageId}:pindian:${pending.eventId}`);
      addLog(session, "card", `${initiator.id} 烈刃拼点${ownerWon ? "获胜，但目标已无牌可获得" : "未获胜"}。`);
      driveLiveDamageFlow(session, true);
      return;
    }
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: initiator.id,
      promptId: `damage:${cursor.promptId}:lieren-gain`,
      eventId: pending.eventId,
      skillId: "lieren",
      stage: "lieren_gain",
      sourceId: target.id,
      damageOpportunity: { ...cursor },
    };
    addLog(session, "card", `${initiator.id} 烈刃拼点获胜，可以获得 ${target.id} 的一张牌。`);
    return;
  }
  if (pending.continuation.type !== "quhu") throw new Error("普通拼点结算缺少驱虎续体。");
  const damageTarget = getLivingPlayer(session, pending.continuation.damageTargetId);
  const planned = planQuhuDamage({
    ownerId: initiator.id,
    opponentId: target.id,
    damageTargetId: damageTarget.id,
    ownerAlive: initiator.alive,
    opponentAlive: target.alive,
    damageTargetAlive: damageTarget.alive,
    pindian: {
      initiatorId: initiator.id,
      targetId: target.id,
      initiatorRank: result.initiatorRank,
      targetRank: result.targetRank,
    },
  });
  if (!planned.ok) throw new Error(`驱虎拼点结算失败：${planned.detail}`);
  const damageSource = getLivingPlayer(session, planned.value.damage.sourceId);
  const victim = getLivingPlayer(session, planned.value.damage.targetId);
  addLog(session, "card", `${initiator.id} 驱虎拼点${planned.value.pindianOutcome === "win" ? "获胜" : "未获胜"}，由 ${damageSource.id} 对 ${victim.id} 造成伤害。`);
  dealDamage(session, victim, damageSource, 1, "normal", "受到驱虎影响", { type: "finish_effect" });
}

function compareAndContinuePindian(session: GameSession, pending: PendingPindian): void {
  assertRevealedPindian(session, pending, [pending.frame.initiatorId, pending.frame.targetId]);
  const frame = clonePindianFrame(pending.frame);
  const result = comparePindian(frame);
  const initiatorCardId = frame.selections[frame.initiatorId]!;
  const targetCardId = frame.selections[frame.targetId]!;
  const initiatorCard = session.resolvingCards.find((card) => card.id === initiatorCardId);
  const targetCard = session.resolvingCards.find((card) => card.id === targetCardId);
  if (!initiatorCard || !targetCard) throw new Error("拼点实体牌已离开处理区。");
  const compared: PendingPindian = { ...pending, frame };
  if (pending.continuation.type === "zhiba" && !result.initiatorWon) {
    const lord = getLivingPlayer(session, frame.targetId);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: lord.id,
      promptId: `pindian:${pending.eventId}:zhiba:gain:${lord.id}`,
      eventId: pending.eventId,
      skillId: "zhiba",
      stage: "zhiba_gain",
      pindian: compared,
    };
    addLog(session, "card", `${lord.id} 可获得此次制霸拼点的两张牌。`);
    return;
  }
  const adapted = pindianZoneState(session, frame);
  settlePindianCards(adapted.state, frame, { batchId: nextMoveBatchId(session) });
  syncPindianZones(session, frame, adapted);
  if (pending.continuation.type === "zhiba") {
    session.pendingResponse = null;
    session.turn.phase = "play";
    addLog(session, "card", `${frame.initiatorId} 制霸拼点严格获胜，两张拼点牌进入弃牌堆。`);
    return;
  }
  completeOrdinaryPindian(session, { ...pending, frame }, initiatorCard, targetCard);
}

function continueYingyangPindian(
  session: GameSession,
  pending: PendingPindian,
  processedPlayerIds: readonly PlayerId[],
): void {
  assertRevealedPindian(session, pending, processedPlayerIds);
  const participants = [pending.frame.initiatorId, pending.frame.targetId];
  const processed = [...processedPlayerIds];
  while (processed.length < participants.length) {
    const playerId = participants[processed.length]!;
    processed.push(playerId);
    const owner = getLivingPlayer(session, playerId);
    if (!hasEffectiveSkill(session, owner, "yingyang")) continue;
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: owner.id,
      promptId: `pindian:${pending.eventId}:yingyang:${owner.id}:${processed.length - 1}`,
      eventId: pending.eventId,
      skillId: "yingyang",
      stage: "yingyang_modify",
      pindian: clonePindianPending(pending),
      processedPlayerIds: processed,
    };
    return;
  }
  compareAndContinuePindian(session, pending);
}

function resolveReadyPindian(session: GameSession, pending: PendingPindian): void {
  assertLivePindian(session, pending);
  if (pending.frame.stage !== "ready_to_reveal") throw new Error("拼点尚未完成两次秘密选择。");
  const frame = clonePindianFrame(pending.frame);
  const initiator = getLivingPlayer(session, frame.initiatorId);
  const target = getLivingPlayer(session, frame.targetId);
  const initiatorCard = session.resolvingCards.find((card) => card.id === frame.selections[initiator.id]);
  const targetCard = session.resolvingCards.find((card) => card.id === frame.selections[target.id]);
  if (!initiatorCard || !targetCard) throw new Error("拼点亮牌实体不在专用处理区。");
  const adapted = pindianZoneState(session, frame);
  revealPindianCards(adapted.state, frame);
  syncPindianZones(session, frame, adapted);
  addLog(session, "card", `${initiator.id} 亮出${initiatorCard.name}（${initiatorCard.rank}），${target.id} 亮出${targetCard.name}（${targetCard.rank}）。`);
  continueYingyangPindian(session, { ...pending, frame }, []);
}

function applyChoosePindianCard(
  session: GameSession,
  action: Extract<GameAction, { type: "choose_pindian_card" }>,
): void {
  const pending = session.pendingResponse;
  if (
    session.turn.phase !== "respond" || pending?.type !== "pindian" ||
    pending.frame.stage !== "selecting" || pending.targetId !== action.playerId
  ) ruleError("INVALID_PHASE", "当前没有轮到你提交的拼点牌。");
  if (action.promptId !== pending.promptId) ruleError("INVALID_RESPONSE", "拼点选牌提示已过期。");
  assertLivePindian(session, pending);
  const chooser = getLivingPlayer(session, action.playerId);
  const selectedCard = chooser.hand.find((card) => card.id === action.cardId);
  if (!selectedCard) {
    ruleError("CARD_NOT_FOUND", "拼点只能提交当前手牌中的一张实体牌。");
  }
  const emptiedHand = chooser.hand.length === 1;
  const frame = clonePindianFrame(pending.frame);
  const adapted = pindianZoneState(session, frame);
  const moveBatchId = nextMoveBatchId(session);
  selectPindianCard(adapted.state, frame, chooser.id, action.cardId, moveBatchId);
  syncPindianZones(session, frame, adapted);
  enqueueTuntianLossBatch(session, chooser, [{ card: selectedCard, zone: "hand" }], moveBatchId);
  if (emptiedHand) enqueueAfterMoveSkill(session, chooser, "lianying");
  const secondChooser = getLivingPlayer(session, frame.targetId);
  const continuation = pending.continuation.type === "lieren"
    ? { type: "lieren" as const, damageOpportunity: { ...pending.continuation.damageOpportunity } }
    : { ...pending.continuation };
  session.pendingResponse = frame.stage === "ready_to_reveal"
    ? { ...pending, targetId: secondChooser.id, frame, continuation }
    : {
        ...pending,
        targetId: secondChooser.id,
        promptId: pindianPromptId(pending.eventId, 1, secondChooser.id),
        frame,
        continuation,
      };
  addLog(session, "card", `${chooser.id} 已秘密提交拼点牌。`);
}

function assertQiangxiContinuation(
  session: GameSession,
  continuation: Pick<PendingQiangxiEffect, "eventId" | "sourceId" | "damageTargetId" | "distanceBeforePayment" | "attackRangeBeforePayment">,
): void {
  if (
    !Number.isSafeInteger(continuation.eventId) || continuation.eventId <= 0 || continuation.eventId >= session.nextEventId ||
    !Number.isSafeInteger(continuation.distanceBeforePayment) || continuation.distanceBeforePayment <= 0 ||
    !Number.isSafeInteger(continuation.attackRangeBeforePayment) || continuation.attackRangeBeforePayment <= 0 ||
    continuation.distanceBeforePayment > continuation.attackRangeBeforePayment ||
    continuation.sourceId === continuation.damageTargetId ||
    skillUseCount(session, "qiangxi") !== 1
  ) throw new Error("强袭续体的事件、次数或支付前范围无效。");
  getPlayer(session, continuation.sourceId);
  getPlayer(session, continuation.damageTargetId);
}

function continueQiangxiDamage(
  session: GameSession,
  continuation: Pick<PendingQiangxiEffect, "eventId" | "sourceId" | "damageTargetId" | "distanceBeforePayment" | "attackRangeBeforePayment">,
): void {
  assertQiangxiContinuation(session, continuation);
  session.pendingResponse = null;
  const source = getPlayer(session, continuation.sourceId);
  const target = getPlayer(session, continuation.damageTargetId);
  if (!source.alive || !target.alive || session.status !== "playing") {
    if (session.status === "playing" && !getPlayer(session, session.currentPlayerId).alive) beginNextTurn(session);
    else if (session.status === "playing") session.turn.phase = "play";
    return;
  }
  session.turn.phase = "play";
  dealDamage(session, target, source, 1, "normal", "受到强袭影响", { type: "finish_effect" });
}

function applyQiangxi(
  session: GameSession,
  player: GamePlayer,
  action: Extract<GameAction, { type: "use_skill" }>,
): void {
  assertPlayTurn(session, player.id);
  if (skillUseCount(session, "qiangxi") > 0) ruleError("INVALID_SKILL", "强袭每个出牌阶段限用一次。");
  if ((action.targetIds?.length ?? 0) > 0 || !action.targetId) ruleError("INVALID_TARGET", "强袭必须指定一名其他角色。");
  const target = getLivingPlayer(session, action.targetId);
  if (target.id === player.id) ruleError("INVALID_TARGET", "强袭不能指定自己。");
  const cardIds = action.cardIds ?? [];
  if (cardIds.length > 1) ruleError("INVALID_SELECTION", "强袭只能弃置一张武器牌，或改为失去体力。");
  const distanceBeforePayment = distanceBetweenPlayers(session, player.id, target.id);
  const attackRangeBeforePayment = attackRangeFor(session, player.id);
  const paymentCard = cardIds[0] ? ownedCard(player, cardIds[0]) : null;
  const paymentZone = paymentCard
    ? player.hand.some((card) => card.id === paymentCard.id) ? "hand" as const : "equipment" as const
    : null;
  const evaluated = evaluateQiangxi({
    context: firePlayContext(session, player, "qiangxi"),
    alreadyUsedThisTurn: false,
    actorHp: player.hp,
    targetId: target.id,
    targetAlive: target.alive,
    distanceBeforePayment,
    attackRangeBeforePayment,
    payment: paymentCard
      ? { type: "discard_weapon", card: fireRuleCard(session, player, paymentCard, paymentZone!) }
      : { type: "lose_hp" },
  });
  if (!evaluated.ok) {
    if (evaluated.code === "out_of_range") ruleError("INVALID_TARGET", "强袭目标不在支付前的攻击范围内。");
    ruleError("INVALID_CARD", "强袭支付必须是一张手牌或装备区中的武器牌。");
  }
  const eventId = allocateEventId(session);
  markSkillUsed(session, "qiangxi");
  const continuation = {
    eventId,
    sourceId: player.id,
    damageTargetId: target.id,
    distanceBeforePayment,
    attackRangeBeforePayment,
  };
  if (evaluated.value.payment.type === "lose_hp") {
    addLog(session, "card", `${player.id} 发动强袭，失去 1 点体力以攻击 ${target.id}。`);
    const enteredDying = loseHp(session, player, 1, "支付强袭代价", { type: "qiangxi", ...continuation });
    if (!enteredDying) continueQiangxiDamage(session, continuation);
    return;
  }
  const discarded = removeOwnedCard(session, player, evaluated.value.payment.cardId);
  session.discardPile.push(discarded);
  session.turn.phase = "respond";
  session.pendingResponse = {
    type: "qiangxi_effect",
    ...continuation,
    targetId: player.id,
  };
  addLog(session, "card", `${player.id} 发动强袭，弃置武器牌以攻击 ${target.id}。`);
}

function applyUseSkill(
  session: GameSession,
  action: Extract<GameAction, { type: "use_skill" }>,
): void {
  const player = getLivingPlayer(session, action.playerId);
  if (action.skillId !== "huangtian" && action.skillId !== "zhiba" && !hasEffectiveSkill(session, player, action.skillId)) {
    ruleError("INVALID_SKILL", `${player.id} 没有技能 ${action.skillId}。`);
  }

  if (action.skillId === "jilue") {
    assertPlayTurn(session, player.id);
    if (hasEffectiveSkill(session, player, "zhiheng")) {
      ruleError("INVALID_SKILL", "已有效果的制衡时不重复发动极略·制衡。");
    }
    if (action.targetId !== undefined || action.targetIds !== undefined || action.allocations !== undefined) {
      ruleError("INVALID_SELECTION", "极略·制衡不需要选择目标。");
    }
    const cardIds = selectedSkillCardIds(action, 1, ownedCards(player).length);
    const discardCards = cardIds.map((cardId) => {
      const handCard = player.hand.find((card) => card.id === cardId);
      if (handCard) return godRuleCard(player, handCard, "hand");
      const equipmentCard = Object.values(player.equipment).find((card) => card.id === cardId);
      if (equipmentCard) return godRuleCard(player, equipmentCard, "equipment");
      ruleError("INVALID_CARD", "极略·制衡只能弃置自己的手牌或装备牌。");
    });
    const context = jilueContext(session, player);
    const plan = planJilueZhiheng({
      context: { ...context, currentPlayerId: session.currentPlayerId, phase: session.turn.phase },
      usedZhihengThisPlayPhase: skillUseCount(session, "jilue") > 0,
      discardCards,
    });
    if (!plan.ok) ruleError(plan.code === "invalid_card" ? "INVALID_CARD" : "INVALID_SKILL", plan.detail);
    spendJilueRen(session, player.id);
    markSkillUsed(session, "jilue");
    const eventId = allocateEventId(session);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: player.id,
      promptId: standardPromptId(eventId, "jilue", player.id, "zhiheng-finish"),
      eventId,
      skillId: "jilue",
      stage: "jilue_zhiheng_finish",
      selectedCardIds: [...plan.value.discardCardIds],
      requestedCount: plan.value.drawCount,
      iteration: context.renMarks - 1,
    };
    const aftermath = discardOwnedCardsAtomically(
      session,
      player,
      plan.value.discardCardIds,
      "jilue",
      "skill_effect",
    );
    queueOwnedDiscardAftermath(session, player, aftermath);
    addLog(session, "card", `${player.id} 消耗 1 枚忍标记发动极略·制衡，弃置 ${plan.value.discardCardIds.length} 张牌。`);
    offerNextAfterMoveSkill(session);
    return;
  }

  if (action.skillId === "gongxin") {
    assertPlayTurn(session, player.id);
    if (!action.targetId || action.targetIds !== undefined || action.cardIds !== undefined || action.allocations !== undefined) {
      ruleError("INVALID_SELECTION", "攻心只需指定一名其他角色。");
    }
    const target = getLivingPlayer(session, action.targetId);
    const plan = planGongxin({
      context: godPhaseContext(session, player, "gongxin"),
      usedThisPlayPhase: skillUseCount(session, "gongxin") > 0,
      targetId: target.id,
      targetAlive: target.alive,
      targetHand: target.hand.map((card) => ({ id: card.id, effectiveSuit: effectiveCardSuit(session, target, card) })),
      selectedCardId: null,
      action: null,
    });
    if (!plan.ok) {
      if (plan.code === "invalid_target" || plan.code === "target_dead") ruleError("INVALID_TARGET", plan.detail);
      ruleError("INVALID_SKILL", plan.detail);
    }
    markSkillUsed(session, "gongxin");
    const eventId = allocateEventId(session);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: player.id,
      promptId: standardPromptId(eventId, "gongxin", player.id, `choose-${target.id}`),
      eventId,
      skillId: "gongxin",
      stage: "gongxin_choose",
      sourceId: target.id,
      selectedCardIds: target.hand.map((card) => card.id),
    };
    addLog(session, "card", `${player.id} 对 ${target.id} 发动攻心，私下观看其全部手牌。`);
    return;
  }

  if (action.skillId === "jixi") {
    assertPlayTurn(session, player.id);
    if (action.cardIds?.length !== 1 || !action.targetId || action.targetIds !== undefined) {
      ruleError("INVALID_SELECTION", "急袭须选择一张田和一名顺手牵羊的合法目标。");
    }
    const fieldCard = (player.extraPiles.field ?? []).find((card) => card.id === action.cardIds![0]);
    if (!fieldCard) ruleError("INVALID_CARD", "急袭只能使用自己田中的一张实体牌。");
    const target = getLivingPlayer(session, action.targetId);
    const virtualCard: Card = {
      ...getCardDefinition("shun_shou_qian_yang"),
      id: fieldCard.id,
      kind: "shun_shou_qian_yang",
      suit: fieldCard.suit,
      rank: fieldCard.rank,
    };
    const plan = evaluateJixi({
      context: {
        actorId: player.id,
        currentPlayerId: session.currentPlayerId,
        phase: session.turn.phase,
        actorAlive: player.alive,
        skillEffective: hasEffectiveSkill(session, player, "jixi"),
      },
      fieldCard: mountainRuleCard(session, player, fieldCard, "field"),
      targetId: target.id,
      targetAlive: target.alive,
      targetCanBeTargetedBySnatch: canBeQianxunTarget(session, target) &&
        !isWeimuProhibited(session, player, virtualCard, target, "direct_target"),
      effectiveDistance: distanceBetweenPlayers(session, player.id, target.id),
      snatchDistanceLimit: hasEffectiveSkill(session, player, "qicai") ? Number.MAX_SAFE_INTEGER : 1,
      targetCards: tiaoxinTargetCards(session, target),
    });
    if (!plan.ok) {
      ruleError(plan.code === "invalid_card" ? "INVALID_CARD" : "INVALID_TARGET", plan.detail);
    }
    beginValidatedCardUse(
      session,
      player,
      fieldCard,
      plan.value.virtualCard,
      { targetId: plan.value.targetId },
      "jixi",
    );
    return;
  }

  if (action.skillId === "tiaoxin") {
    assertPlayTurn(session, player.id);
    if (action.cardIds !== undefined || action.targetIds !== undefined || !action.targetId) {
      ruleError("INVALID_SELECTION", "挑衅只需指定一名其他角色。");
    }
    const target = getLivingPlayer(session, action.targetId);
    const activation = evaluateTiaoxin({
      context: {
        actorId: player.id,
        currentPlayerId: session.currentPlayerId,
        phase: session.turn.phase,
        actorAlive: player.alive,
        skillEffective: hasEffectiveSkill(session, player, "tiaoxin"),
      },
      alreadyUsedThisTurn: skillUseCount(session, "tiaoxin") > 0,
      targetId: target.id,
      targetAlive: target.alive,
      distanceFromTargetToOwner: distanceBetweenPlayers(session, target.id, player.id),
      targetAttackRange: attackRangeFor(session, target.id),
      targetCanLegallySlashOwner: canBeSlashTarget(session, player) && tiaoxinSlashOptions(session, target).length > 0,
      targetCards: tiaoxinTargetCards(session, target),
    });
    if (!activation.ok) {
      if (activation.code === "out_of_range" || activation.code === "invalid_target") ruleError("INVALID_TARGET", activation.detail);
      ruleError("INVALID_SKILL", activation.detail);
    }
    markSkillUsed(session, "tiaoxin");
    const eventId = allocateEventId(session);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: target.id,
      promptId: standardPromptId(eventId, "tiaoxin", target.id, `respond-${player.id}`),
      eventId,
      skillId: "tiaoxin",
      stage: "tiaoxin_response",
      sourceId: player.id,
    };
    addLog(session, "card", `${player.id} 对 ${target.id} 发动挑衅，请其对自己使用杀。`);
    return;
  }

  if (action.skillId === "zhiba") {
    assertPlayTurn(session, player.id);
    if (action.cardIds !== undefined || action.targetIds !== undefined || !action.targetId) {
      ruleError("INVALID_SELECTION", "制霸请求只需指定当前存活主公。");
    }
    const lord = session.players.find((candidate) => candidate.alive && candidate.role === "lord" &&
      hasEffectiveSkill(session, candidate, "zhiba"));
    if (!lord || lord.id !== action.targetId) ruleError("INVALID_TARGET", "制霸目标必须是拥有有效制霸的当前存活主公。");
    const awakened = hasAwakened(session.completeRules.lifecycle, lord.id, "hunzi");
    const request = evaluateZhibaRequest({
      context: {
        actorId: player.id,
        currentPlayerId: session.currentPlayerId,
        phase: session.turn.phase,
        actorAlive: player.alive,
        skillEffective: true,
      },
      alreadyRequestedThisPlayPhase: skillUseCount(session, "zhiba") > 0,
      challengerFaction: factionOf(session, player) ?? "god",
      challengerHandCount: player.hand.length,
      lordId: lord.id,
      lordAlive: lord.alive,
      lordIsCurrentLord: lord.role === "lord",
      lordSkillEffective: hasEffectiveSkill(session, lord, "zhiba"),
      lordHandCount: lord.hand.length,
      lordAwakened: awakened,
      lordAccepts: true,
    });
    if (!request.ok) {
      if (request.code === "invalid_target" || request.code === "target_dead") ruleError("INVALID_TARGET", request.detail);
      ruleError("INVALID_SKILL", request.detail);
    }
    markSkillUsed(session, "zhiba");
    if (!awakened) {
      beginLivePindian(session, player, lord, "zhiba", { type: "zhiba" });
      return;
    }
    const eventId = allocateEventId(session);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: lord.id,
      promptId: standardPromptId(eventId, "zhiba", lord.id, `request-${player.id}`),
      eventId,
      skillId: "zhiba",
      stage: "zhiba_accept",
      sourceId: player.id,
    };
    addLog(session, "card", `${player.id} 向 ${lord.id} 发起制霸拼点请求。`);
    return;
  }

  if (action.skillId === "zhijian") {
    assertPlayTurn(session, player.id);
    if (!action.targetId || action.targetIds !== undefined || action.cardIds?.length !== 1) {
      ruleError("INVALID_SELECTION", "直谏必须选择一张装备手牌和一名其他角色。");
    }
    const card = player.hand.find((candidate) => candidate.id === action.cardIds![0]);
    if (!card) ruleError("INVALID_CARD", "直谏只能使用一张当前手牌。");
    const target = getLivingPlayer(session, action.targetId);
    const slot = getCardDefinition(card.kind).equipmentSlot;
    const plan = evaluateZhijian({
      context: {
        actorId: player.id,
        currentPlayerId: session.currentPlayerId,
        phase: session.turn.phase,
        actorAlive: player.alive,
        skillEffective: hasEffectiveSkill(session, player, "zhijian"),
      },
      equipmentCard: mountainRuleCard(session, player, card, "hand"),
      targetId: target.id,
      targetAlive: target.alive,
      targetCanReceiveEquipment: slot !== undefined,
      occupiedEquipmentSlots: Object.keys(target.equipment) as EquipmentSlot[],
    });
    if (!plan.ok || !slot) {
      if (plan.ok || plan.code === "invalid_card") ruleError("INVALID_CARD", plan.ok ? "直谏牌不是装备牌。" : plan.detail);
      ruleError("INVALID_TARGET", plan.detail);
    }
    const replaced = target.equipment[slot];
    const emptiedHand = player.hand.length === 1;
    const eventId = allocateEventId(session);
    const finish: PendingStandardSkill = {
      type: "standard_skill",
      targetId: player.id,
      promptId: standardPromptId(eventId, "zhijian", player.id, `finish-${target.id}`),
      eventId,
      skillId: "zhijian",
      stage: "zhijian_finish",
      sourceId: target.id,
      selectedCardIds: [card.id],
    };
    session.turn.phase = "respond";
    session.pendingResponse = finish;
    const intents: MoveIntent[] = [
      ...(replaced ? [{
        cardIds: [replaced.id],
        from: { kind: "equipment" as const, playerId: target.id, slot },
        to: { kind: "discard" as const },
        reason: "replace_equipment" as const,
        visibility: "public" as const,
        actorId: player.id,
        sourceId: target.id,
        targetId: target.id,
        skillId: "zhijian" as const,
      }] : []),
      {
        cardIds: [card.id],
        from: { kind: "hand", playerId: player.id },
        to: { kind: "equipment", playerId: target.id, slot },
        reason: "skill_effect",
        visibility: "public",
        actorId: player.id,
        sourceId: player.id,
        targetId: target.id,
        skillId: "zhijian",
      },
    ];
    const zones = sessionZoneState(session);
    commitLiveMoveBatch(session, zones.state, { batchId: nextMoveBatchId(session), intents });
    syncSessionZones(session, zones);
    if (emptiedHand) enqueueAfterMoveSkill(session, player, "lianying");
    if (replaced) enqueueAfterMoveSkill(session, target, "xiaoji");
    if (replaced?.kind === "bai_yin_shi_zi" && !armorInvalidatedByWuqian(session, target.id) &&
        target.alive && target.hp < target.maxHp) {
      recoverLivePlayer(session, target, 1, target.id, "bai_yin_shi_zi");
      addLog(session, "card", `${target.id} 因失去白银狮子回复 1 点体力。`);
    }
    addLog(session, "card", `${player.id} 发动直谏，将${card.name}置入 ${target.id} 的装备区${replaced ? `并替换${replaced.name}` : ""}。`);
    return;
  }

  if (action.skillId === "luanwu") {
    assertPlayTurn(session, player.id);
    if (action.cardIds !== undefined || action.targetId !== undefined || action.targetIds !== undefined) {
      ruleError("INVALID_SELECTION", "发动乱武不需要预先选择牌或目标。");
    }
    const limitedSkillConsumed = session.completeRules.lifecycle.limitedUses.some((entry) =>
      entry.ownerId === player.id && entry.skillId === "luanwu");
    const activation = evaluateLuanwuActivation({
      context: forestPlayContext(session, player, "luanwu"),
      limitedSkillConsumed,
    });
    if (!activation.ok) ruleError("INVALID_SKILL", activation.detail);
    const eventId = allocateEventId(session);
    consumeLimitedSkill(session.completeRules.lifecycle, player.id, "luanwu", eventId);
    const continuation: LuanwuContinuation = {
      type: "luanwu",
      eventId,
      ownerId: player.id,
      processedActorIds: [],
      remainingActorIds: allOpponentsInSeatOrder(session, player.id),
    };
    addLog(session, "card", `${player.id} 发动限定技乱武。`);
    advanceLuanwu(session, continuation);
    return;
  }

  if (action.skillId === "dimeng") {
    assertPlayTurn(session, player.id);
    if (action.targetId !== undefined || action.targetIds?.length !== 2) {
      ruleError("INVALID_SELECTION", "缔盟必须依次指定两名其他角色。");
    }
    const first = getLivingPlayer(session, action.targetIds[0]!);
    const second = getLivingPlayer(session, action.targetIds[1]!);
    const selectedCostCardIds = action.cardIds ?? [];
    const discardable = [
      ...player.hand.map((card) => forestRuleCard(player, card, "hand")),
      ...Object.values(player.equipment).map((card) => forestRuleCard(player, card, "equipment")),
    ];
    const plan = planDimeng({
      context: forestPlayContext(session, player, "dimeng"),
      useCountThisPlayPhase: skillUseCount(session, "dimeng"),
      targetA: { id: first.id, alive: first.alive, handCardIds: first.hand.map((card) => card.id) },
      targetB: { id: second.id, alive: second.alive, handCardIds: second.hand.map((card) => card.id) },
      ownerDiscardableCards: discardable,
      selectedCostCardIds,
    });
    if (!plan.ok) {
      if (plan.code === "invalid_target" || plan.code === "target_dead") ruleError("INVALID_TARGET", plan.detail);
      if (plan.code === "already_used") ruleError("INVALID_SKILL", plan.detail);
      ruleError("INVALID_CARD", plan.detail);
    }
    markSkillUsed(session, "dimeng");
    const eventId = allocateEventId(session);
    const pending: PendingStandardSkill = {
      type: "standard_skill",
      targetId: player.id,
      promptId: standardPromptId(eventId, "dimeng", player.id, "swap"),
      eventId,
      skillId: "dimeng",
      stage: "dimeng_swap",
      targetIds: [...plan.value.targetIds],
      targetHandCardIds: [
        first.hand.map((card) => card.id),
        second.hand.map((card) => card.id),
      ],
    };
    session.pendingResponse = pending;
    const aftermath = discardOwnedCardsAtomically(
      session,
      player,
      plan.value.discardCardIds,
      "dimeng",
      "skill_cost",
    );
    queueOwnedDiscardAftermath(session, player, aftermath);
    addLog(session, "card", `${player.id} 为缔盟弃置 ${plan.value.costCount} 张牌。`);
    if (session.afterMove.queuedRecoveries.length === 0 && session.afterMove.queuedTriggers.length === 0) {
      completeDimengSwap(session, pending);
    }
    return;
  }

  if (action.skillId === "jiuchi") {
    if (action.targetId || (action.targetIds?.length ?? 0) > 0) {
      ruleError("INVALID_SELECTION", "酒池不需要选择目标。");
    }
    const cardId = selectedSkillCard(action);
    const card = player.hand.find((candidate) => candidate.id === cardId);
    if (!card) ruleError("INVALID_CARD", "酒池只能使用一张手牌。");
    const pending = session.pendingResponse;
    const dyingSelfRescue = session.turn.phase === "respond" && pending?.type === "dying" &&
      pending.targetId === player.id && pending.victimId === player.id;
    const playUse = session.turn.phase === "play" && session.currentPlayerId === player.id;
    const decision = evaluateJiuchi({
      context: forestSkillContext(session, player, "jiuchi"),
      method: dyingSelfRescue ? "respond" : "use",
      card: forestRuleCard(player, card, "hand"),
      effectiveSuit: effectiveCardSuit(session, player, card),
      wineTimingLegal: dyingSelfRescue || playUse && !session.turn.wineUsed,
    });
    if (!decision.ok || card.suit !== "spade") {
      ruleError("INVALID_CARD", "酒池只能将一张印刷及有效花色均为黑桃的手牌当作酒。 ");
    }
    addLog(session, "card", `${player.id} 发动酒池，将一张黑桃手牌当作酒。`);
    if (dyingSelfRescue) {
      applyDyingResponse(session, pending, player, card.id, "jiuchi");
      return;
    }
    if (!playUse) ruleError("INVALID_PHASE", "酒池只能在出牌阶段使用，或由濒死者本人自救。 ");
    withVirtualCard(session, player, card.id, "wine", () => {
      applyPlayCard(session, { type: "play_card", playerId: player.id, cardId: card.id });
    });
    return;
  }

  if (action.skillId === "duanliang") {
    assertPlayTurn(session, player.id);
    if ((action.targetIds?.length ?? 0) > 0 || !action.targetId) {
      ruleError("INVALID_SELECTION", "断粮必须指定一名其他角色。");
    }
    const card = ownedCard(player, selectedSkillCard(action));
    addLog(session, "card", `${player.id} 发动断粮，将一张黑色基本牌或装备牌当作兵粮寸断。`);
    beginValidatedCardUse(
      session,
      player,
      card,
      "bing_liang_cun_duan",
      { targetId: action.targetId },
      "duanliang",
    );
    return;
  }

  if (action.skillId === "qiangxi") {
    applyQiangxi(session, player, action);
    return;
  }

  if (action.skillId === "tianyi") {
    assertPlayTurn(session, player.id);
    if (skillUseCount(session, "tianyi") > 0) ruleError("INVALID_SKILL", "天义每个出牌阶段限用一次。");
    if ((action.cardIds?.length ?? 0) > 0 || (action.targetIds?.length ?? 0) > 0 || !action.targetId) {
      ruleError("INVALID_SELECTION", "天义发动时只需指定一名拼点目标。");
    }
    const target = getLivingPlayer(session, action.targetId);
    if (target.id === player.id || player.hand.length === 0 || target.hand.length === 0) {
      ruleError("INVALID_TARGET", "天义只能与一名双方均有手牌的其他角色拼点。");
    }
    beginLivePindian(session, player, target, "tianyi", { type: "tianyi" });
    return;
  }

  if (action.skillId === "quhu") {
    assertPlayTurn(session, player.id);
    if (skillUseCount(session, "quhu") > 0) ruleError("INVALID_SKILL", "驱虎每个出牌阶段限用一次。");
    if ((action.cardIds?.length ?? 0) > 0 || action.targetId !== undefined || action.targetIds?.length !== 2) {
      ruleError("INVALID_SELECTION", "驱虎必须依次指定拼点角色和其攻击范围内的伤害目标。");
    }
    const opponent = getLivingPlayer(session, action.targetIds[0]!);
    const damageTarget = getLivingPlayer(session, action.targetIds[1]!);
    const evaluated = evaluateQuhuTargets({
      context: firePlayContext(session, player, "quhu"),
      alreadyUsedThisTurn: false,
      actorHp: player.hp,
      opponent: {
        playerId: opponent.id,
        alive: opponent.alive,
        hp: opponent.hp,
        handCount: opponent.hand.length,
        canPindian: opponent.hand.length > 0,
        attackRange: attackRangeFor(session, opponent.id),
      },
      damageTarget: {
        playerId: damageTarget.id,
        alive: damageTarget.alive,
        canReceiveDamage: damageTarget.alive,
        distanceFromOpponent: distanceBetweenPlayers(session, opponent.id, damageTarget.id),
      },
    });
    if (!evaluated.ok || player.hand.length === 0) {
      ruleError("INVALID_TARGET", "驱虎要求拼点目标体力更高、双方有手牌，且第二目标在其攻击范围内。");
    }
    beginLivePindian(session, player, opponent, "quhu", {
      type: "quhu",
      damageTargetId: damageTarget.id,
    });
    return;
  }

  if (action.skillId === "huangtian") {
    assertPlayTurn(session, player.id);
    const card = ownedCard(player, selectedSkillCard(action));
    const receiver = action.targetId ? getLivingPlayer(session, action.targetId) : null;
    if (!receiver || (action.targetIds?.length ?? 0) > 0) {
      ruleError("INVALID_TARGET", "黄天必须指定一名拥有黄天的存活主公。");
    }
    const result = evaluateLiveHuangtianGift(session, player, receiver, card);
    if (!result.ok) ruleError("INVALID_SKILL", "黄天赠牌状态无效。");
    if (!result.value.eligible) {
      if (result.value.reason === "card_not_owned_physical_hand" || result.value.reason === "card_not_dodge_or_lightning") {
        ruleError("INVALID_CARD", "黄天只能交给主公一张手牌中的闪或闪电。");
      }
      if (result.value.reason === "receiver_lacks_effective_huangtian" || result.value.reason === "giver_or_receiver_dead") {
        ruleError("INVALID_TARGET", "黄天目标必须是拥有有效黄天的存活主公。");
      }
      ruleError("INVALID_SKILL", "当前不能发动黄天赠牌。");
    }
    receiver.hand.push(removeCard(session, player, card.id));
    markSkillUsed(session, "huangtian");
    addLog(session, "card", `${player.id} 响应 ${receiver.id} 的黄天，交给其一张手牌。`);
    return;
  }

  if (action.skillId === "kanpo") {
    const pending = session.pendingResponse;
    if (
      session.turn.phase !== "respond" || pending?.type !== "nullification" ||
      pending.targetId !== player.id
    ) {
      ruleError("INVALID_PHASE", "看破只能在自己的无懈可击响应窗口发动。");
    }
    if (action.targetId || (action.targetIds?.length ?? 0) > 0) {
      ruleError("INVALID_SELECTION", "看破不需要选择目标。");
    }
    const cardId = selectedSkillCard(action);
    const card = player.hand.find((candidate) => candidate.id === cardId);
    if (!card) ruleError("INVALID_CARD", "看破只能使用一张手牌。");
    const decision = evaluateKanpo({
      ownerId: player.id,
      responderId: player.id,
      ownerAlive: player.alive,
      skillEffective: true,
      nullificationWindowOpen: true,
      card: fireRuleCard(session, player, card, "hand"),
    });
    if (!decision.ok) ruleError("INVALID_CARD", "看破只能将一张黑色手牌当作无懈可击。");
    addLog(session, "card", `${player.id} 发动看破，将一张黑色手牌当作无懈可击。`);
    withVirtualCard(session, player, card.id, "wu_xie_ke_ji", () => {
      applyResponse(session, { type: "respond", playerId: player.id, cardId: card.id });
    });
    return;
  }

  if (action.skillId === "lianhuan") {
    assertPlayTurn(session, player.id);
    if (action.targetId) ruleError("INVALID_SELECTION", "连环目标必须通过目标列表提交。");
    const cardId = selectedSkillCard(action);
    const card = player.hand.find((candidate) => candidate.id === cardId);
    if (!card) ruleError("INVALID_CARD", "连环只能使用一张手牌。");
    const targets = (action.targetIds ?? []).map((targetId) => getLivingPlayer(session, targetId));
    const decision = evaluateLianhuan({
      context: firePlayContext(session, player, "lianhuan"),
      card: fireRuleCard(session, player, card, "hand"),
      targets: targets.map((target) => ({
        playerId: target.id,
        alive: target.alive,
        canBeTargetedByIronChain: true,
      })),
    });
    if (!decision.ok) ruleError("INVALID_CARD", "连环只能将一张梅花手牌当作铁索连环使用或重铸。");
    addLog(session, "card", `${player.id} 发动连环，将一张梅花手牌当作铁索连环${targets.length === 0 ? "重铸" : "使用"}。`);
    beginValidatedCardUse(session, player, card, "iron_chain", { targetIds: targets.map((target) => target.id) }, "lianhuan");
    return;
  }

  if (action.skillId === "huoji") {
    assertPlayTurn(session, player.id);
    if ((action.targetIds?.length ?? 0) > 0) ruleError("INVALID_SELECTION", "火计只需要选择一个目标。");
    const cardId = selectedSkillCard(action);
    const card = player.hand.find((candidate) => candidate.id === cardId);
    if (!card) ruleError("INVALID_CARD", "火计只能使用一张手牌。");
    const target = action.targetId ? getLivingPlayer(session, action.targetId) : null;
    if (!target) ruleError("INVALID_TARGET", "火计必须指定一名有手牌的存活角色。");
    const decision = evaluateHuoji({
      context: firePlayContext(session, player, "huoji"),
      card: fireRuleCard(session, player, card, "hand"),
      target: {
        playerId: target.id,
        alive: target.alive,
        canBeTargetedByFireAttack: true,
        handCardIds: target.hand.map((candidate) => candidate.id),
      },
    });
    if (!decision.ok) ruleError("INVALID_TARGET", "火计需要一张红色手牌，且目标支付后仍须有手牌。");
    addLog(session, "card", `${player.id} 发动火计，将一张红色手牌当作火攻对 ${target.id} 使用。`);
    beginValidatedCardUse(session, player, card, "fire_attack", { targetId: target.id }, "huoji");
    return;
  }

  if (action.skillId === "luanji") {
    assertPlayTurn(session, player.id);
    if (action.targetId || (action.targetIds?.length ?? 0) > 0) {
      ruleError("INVALID_SELECTION", "乱击不需要选择目标。");
    }
    const [firstId, secondId] = selectedSkillCardIds(action, 2, 2);
    const first = firstId ? player.hand.find((card) => card.id === firstId) : null;
    const second = secondId ? player.hand.find((card) => card.id === secondId) : null;
    if (!first || !second) ruleError("INVALID_CARD", "乱击只能使用两张手牌。");
    const decision = evaluateLuanji({
      context: firePlayContext(session, player, "luanji"),
      cards: [fireRuleCard(session, player, first, "hand"), fireRuleCard(session, player, second, "hand")],
    });
    if (!decision.ok) ruleError("INVALID_CARD", "乱击只能使用两张有效花色相同的手牌。");
    addLog(session, "card", `${player.id} 发动乱击，将两张同花色手牌当作万箭齐发使用。`);
    beginValidatedLuanjiUse(session, player, first, second);
    return;
  }

  if (action.skillId === "kurou") {
    assertPlayTurn(session, player.id);
    if ((action.cardIds?.length ?? 0) > 0 || action.targetId || (action.targetIds?.length ?? 0) > 0) {
      ruleError("INVALID_SELECTION", "苦肉不需要选择牌或目标。");
    }
    addLog(session, "card", `${player.id} 发动苦肉。`);
    const enteredDying = loseHp(session, player, 1, "发动苦肉", {
      type: "skill",
      skillId: "kurou",
      playerId: player.id,
    });
    if (!enteredDying) {
      const drawn = drawCards(session, player, 2);
      addLog(session, "card", `${player.id} 因苦肉摸了 ${drawn} 张牌。`);
    }
    return;
  }

  if (action.skillId === "jijiu") {
    const pending = session.pendingResponse;
    if (
      session.turn.phase !== "respond" ||
      !pending ||
      pending.type !== "dying" ||
      pending.targetId !== player.id ||
      session.currentPlayerId === player.id
    ) {
      ruleError("INVALID_PHASE", "急救只能在自己的回合外响应濒死求桃。");
    }
    if (action.targetId || (action.targetIds?.length ?? 0) > 0) {
      ruleError("INVALID_SELECTION", "急救不需要选择目标。");
    }
    const cardId = selectedSkillCard(action);
    const card = ownedCard(player, cardId);
    if (!isRedCard(session, player, card)) ruleError("INVALID_CARD", "急救只能将一张红色牌当作桃。");
    addLog(session, "card", `${player.id} 发动急救，将一张红色牌当作桃。`);
    applyDyingResponse(session, pending, player, cardId, "jijiu");
    return;
  }

  if (action.skillId === "zhiheng") {
    assertPlayTurn(session, player.id);
    if (skillUseCount(session, "zhiheng") > 0) {
      ruleError("INVALID_SKILL", "制衡每个出牌阶段限用一次。");
    }
    if (action.targetId || (action.targetIds?.length ?? 0) > 0) {
      ruleError("INVALID_SELECTION", "制衡不需要选择目标。");
    }
    const cardIds = selectedSkillCardIds(action, 1, ownedCards(player).length);
    cardIds.forEach((cardId) => ownedCard(player, cardId));
    const discarded = cardIds.map((cardId) => removeOwnedCard(session, player, cardId));
    session.discardPile.push(...discarded);
    markSkillUsed(session, "zhiheng");
    const drawn = drawCards(session, player, discarded.length);
    addLog(session, "card", `${player.id} 发动制衡，弃置 ${discarded.length} 张牌并摸了 ${drawn} 张牌。`);
    return;
  }

  if (action.skillId === "rende") {
    assertPlayTurn(session, player.id);
    const cardIds = selectedSkillCardIds(action, 1, player.hand.length);
    const target = action.targetId ? getLivingPlayer(session, action.targetId) : null;
    if (!target || target.id === player.id || (action.targetIds?.length ?? 0) > 0) {
      ruleError("INVALID_TARGET", "仁德必须指定一名其他存活角色。");
    }
    const handIds = new Set(player.hand.map((card) => card.id));
    if (cardIds.some((cardId) => !handIds.has(cardId))) {
      ruleError("INVALID_CARD", "仁德只能交给目标自己的手牌。");
    }
    const transferred = cardIds.map((cardId) => removeCard(session, player, cardId));
    target.hand.push(...transferred);
    const previousCount = session.turn.rendeGivenCount;
    session.turn.rendeGivenCount += transferred.length;
    if (!session.turn.rendeRecovered && previousCount < 2 && session.turn.rendeGivenCount >= 2) {
      session.turn.rendeRecovered = true;
      if (player.hp < player.maxHp) recoverLivePlayer(session, player, 1, player.id, "rende");
    }
    addLog(session, "card", `${player.id} 发动仁德，交给 ${target.id} ${transferred.length} 张手牌。`);
    return;
  }

  if (action.skillId === "qingnang") {
    assertPlayTurn(session, player.id);
    if (skillUseCount(session, "qingnang") > 0) {
      ruleError("INVALID_SKILL", "青囊每个出牌阶段限用一次。");
    }
    const cardId = selectedSkillCard(action);
    if (!player.hand.some((card) => card.id === cardId)) {
      ruleError("INVALID_CARD", "青囊只能弃置一张手牌。");
    }
    const target = action.targetId ? getLivingPlayer(session, action.targetId) : null;
    if (!target || target.hp >= target.maxHp || (action.targetIds?.length ?? 0) > 0) {
      ruleError("INVALID_TARGET", "青囊必须指定一名受伤角色。");
    }
    session.discardPile.push(removeCard(session, player, cardId));
    recoverLivePlayer(session, target, 1, player.id, "qingnang");
    markSkillUsed(session, "qingnang");
    addLog(session, "card", `${player.id} 发动青囊，令 ${target.id} 回复 1 点体力。`);
    return;
  }

  if (action.skillId === "jieyin") {
    assertPlayTurn(session, player.id);
    if (skillUseCount(session, "jieyin") > 0) {
      ruleError("INVALID_SKILL", "结姻每个出牌阶段限用一次。");
    }
    const cardIds = selectedSkillCardIds(action, 2, 2);
    const handIds = new Set(player.hand.map((card) => card.id));
    if (cardIds.some((cardId) => !handIds.has(cardId))) {
      ruleError("INVALID_CARD", "结姻只能弃置两张手牌。");
    }
    const target = action.targetId ? getLivingPlayer(session, action.targetId) : null;
    const targetGender = target ? genderOf(session, target) : null;
    if (
      !target || target.id === player.id || targetGender !== "male" || target.hp >= target.maxHp ||
      (action.targetIds?.length ?? 0) > 0
    ) {
      ruleError("INVALID_TARGET", "结姻必须指定一名其他受伤男性角色。");
    }
    session.discardPile.push(...cardIds.map((cardId) => removeCard(session, player, cardId)));
    if (player.hp < player.maxHp) recoverLivePlayer(session, player, 1, player.id, "jieyin");
    recoverLivePlayer(session, target, 1, player.id, "jieyin");
    markSkillUsed(session, "jieyin");
    addLog(session, "card", `${player.id} 发动结姻，与 ${target.id} 各回复 1 点体力。`);
    return;
  }

  if (action.skillId === "fanjian") {
    assertPlayTurn(session, player.id);
    if (skillUseCount(session, "fanjian") > 0) {
      ruleError("INVALID_SKILL", "反间每个出牌阶段限用一次。");
    }
    selectedSkillCardIds(action, 0, 0);
    const target = action.targetId ? getLivingPlayer(session, action.targetId) : null;
    if (!target || target.id === player.id || (action.targetIds?.length ?? 0) > 0) {
      ruleError("INVALID_TARGET", "反间必须指定一名其他存活角色。");
    }
    if (player.hand.length === 0) {
      ruleError("INVALID_SKILL", "没有手牌时不能发动反间。");
    }
    const eventId = allocateEventId(session);
    const promptId = `skill:${eventId}:fanjian:${target.id}:0`;
    markSkillUsed(session, "fanjian");
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "fanjian_suit",
      attackerId: player.id,
      targetId: target.id,
      eventId,
      promptId,
    };
    addLog(session, "card", `${player.id} 对 ${target.id} 发动反间，等待其声明一种花色。`);
    return;
  }

  if (action.skillId === "lijian") {
    assertPlayTurn(session, player.id);
    if (skillUseCount(session, "lijian") > 0) {
      ruleError("INVALID_SKILL", "离间每个出牌阶段限用一次。");
    }
    const cardId = selectedSkillCard(action);
    const cost = ownedCard(player, cardId);
    const targetIds = action.targetIds ?? [];
    if (action.targetId || targetIds.length !== 2 || new Set(targetIds).size !== 2) {
      ruleError("INVALID_TARGET", "离间必须依次指定两名不同的其他男性角色。");
    }
    const [initiatorId, originalTargetId] = targetIds;
    const initiator = initiatorId ? getLivingPlayer(session, initiatorId) : null;
    const originalTarget = originalTargetId ? getLivingPlayer(session, originalTargetId) : null;
    const isOtherMale = (target: GamePlayer | null): target is GamePlayer => Boolean(
      target &&
      target.id !== player.id &&
      genderOf(session, target) === "male"
    );
    if (!isOtherMale(initiator) || !isOtherMale(originalTarget)) {
      ruleError("INVALID_TARGET", "离间的两个目标都必须是其他存活男性角色。");
    }

    const eventId = allocateEventId(session);
    session.discardPile.push(removeOwnedCard(session, player, cost.id));
    markSkillUsed(session, "lijian");
    const duel: Extract<PendingResponse, { type: "duel" }> = {
      type: "duel",
      attackerId: initiator.id,
      targetId: originalTarget.id,
      cardId: `skill:lijian:${eventId}`,
      initiatorId: initiator.id,
      originalTargetId: originalTarget.id,
      requiredSlashCount: wushuangResponseCount(session, initiator),
      slashesPlayed: 0,
    };
    createDuelResponseCommitment(session, duel);
    addLog(
      session,
      "card",
      `${player.id} 发动离间，弃置${cost.name}，令 ${initiator.id} 视为对 ${originalTarget.id} 使用决斗。`,
    );
    continueLijianJiang(session, duel, []);
    return;
  }

  if (action.skillId === "shuangxiong") {
    assertPlayTurn(session, player.id);
    const judgmentColor = session.turn.shuangxiongJudgmentColor ?? null;
    if (judgmentColor === null || !hasEffectiveSkill(session, player, "shuangxiong")) {
      ruleError("INVALID_SKILL", "本回合尚未通过双雄记录判定颜色。");
    }
    if ((action.targetIds?.length ?? 0) > 0) ruleError("INVALID_SELECTION", "双雄决斗只需选择一个目标。");
    const cardId = selectedSkillCard(action);
    const card = player.hand.find((candidate) => candidate.id === cardId);
    if (!card) ruleError("INVALID_CARD", "双雄只能使用一张手牌。");
    const target = action.targetId ? getLivingPlayer(session, action.targetId) : null;
    if (!target || target.id === player.id || !canBeDuelTarget(session, target)) {
      ruleError("INVALID_TARGET", "双雄必须指定一名可成为决斗目标的其他存活角色。");
    }
    const decision = evaluateShuangxiong({
      context: firePlayContext(session, player, "shuangxiong"),
      activatedThisTurn: true,
      finalJudgmentSuit: judgmentColor === "red" ? "heart" : "spade",
      card: fireRuleCard(session, player, card, "hand"),
    });
    if (!decision.ok) {
      ruleError("INVALID_CARD", "双雄只能将与判定结果颜色不同的手牌当作决斗。");
    }
    addLog(session, "card", `${player.id} 发动双雄，将一张手牌当作决斗对 ${target.id} 使用。`);
    beginValidatedCardUse(session, player, card, "duel", { targetId: target.id }, "shuangxiong");
    return;
  }

  if (action.skillId === "wuqian") {
    assertPlayTurn(session, player.id);
    const allowedKeys = new Set(["type", "playerId", "skillId", "targetId"]);
    if (Object.keys(action).some((key) => !allowedKeys.has(key)) || !action.targetId) {
      ruleError("INVALID_SELECTION", "无前只需指定一名存活角色。");
    }
    const target = getLivingPlayer(session, action.targetId);
    const previousTargets = [...new Set(activeWuqianArmorInvalidTargetIds(session, player.id))];
    const plan = planWuqian({
      context: godPhaseContext(session, player, "wuqian"),
      rageMarks: rageMarkCount(session, player.id),
      targetId: target.id,
      targetAlive: target.alive,
      previouslyArmorInvalidTargetIds: previousTargets,
    });
    if (!plan.ok) ruleError(plan.code === "insufficient_marks" ? "INVALID_SKILL" : "INVALID_TARGET", plan.detail);
    spendMarks(session.completeRules.lifecycle, {
      ownerId: player.id,
      markId: "rage",
      amount: 2,
      sourcePlayerId: player.id,
      sourceSkillId: "kuangbao",
    });
    const expiry = { type: "turn_end" as const, turnId: session.turn.number };
    if (!session.completeRules.lifecycle.grants.some((grant) =>
      grant.ownerId === player.id && grant.skillId === "wushuang" && grant.sourcePlayerId === player.id &&
      grant.sourceSkillId === "wuqian" && grant.expiry.type === "turn_end" && grant.expiry.turnId === session.turn.number
    )) {
      grantSkill(session.completeRules.lifecycle, {
        ownerId: player.id,
        skillId: "wushuang",
        sourcePlayerId: player.id,
        sourceSkillId: "wuqian",
        expiry,
      });
    }
    if (!previousTargets.includes(target.id)) {
      addStatusEffect(session.completeRules.lifecycle, {
        ownerId: target.id,
        kind: "armor_invalid",
        sourcePlayerId: player.id,
        sourceSkillId: "wuqian",
        payload: { targetId: target.id, turnId: session.turn.number },
        visibility: "public",
        expiry,
      });
    }
    addLog(session, "card", `${player.id} 发动无前，令 ${target.id} 的防具失效并获得无双直到回合结束。`);
    return;
  }

  if (action.skillId === "shenfen") {
    assertPlayTurn(session, player.id);
    const allowedKeys = new Set(["type", "playerId", "skillId"]);
    if (Object.keys(action).some((key) => !allowedKeys.has(key))) {
      ruleError("INVALID_SELECTION", "神愤不需要选择牌或目标。");
    }
    const orderedTargets = allOpponentsInSeatOrder(session, player.id)
      .map((playerId) => getPlayer(session, playerId));
    const plan = planShenfen({
      context: godPhaseContext(session, player, "shenfen"),
      rageMarks: rageMarkCount(session, player.id),
      usedThisPlayPhase: skillUseCount(session, "shenfen") > 0,
      otherPlayers: orderedTargets.map((target) => ({ id: target.id, alive: target.alive })),
    });
    if (!plan.ok) ruleError("INVALID_SKILL", plan.detail);
    spendMarks(session.completeRules.lifecycle, {
      ownerId: player.id,
      markId: "rage",
      amount: 6,
      sourcePlayerId: player.id,
      sourceSkillId: "kuangbao",
    });
    markSkillUsed(session, "shenfen");
    const eventId = allocateEventId(session);
    const continuation: ShenfenContinuation = {
      eventId,
      ownerId: player.id,
      targetIds: [...plan.value.targetIds],
      stage: "damage",
      nextTargetIndex: 0,
    };
    addStatusEffect(session.completeRules.lifecycle, {
      ownerId: player.id,
      kind: "shenfen_commitment",
      sourcePlayerId: player.id,
      sourceSkillId: "shenfen",
      payload: {
        eventId,
        commitment: shenfenCommitmentPayload(continuation),
        cursor: shenfenCursorPayload(continuation),
      },
      visibility: "server_only",
      expiry: { type: "turn_end", turnId: session.turn.number },
    });
    addLog(session, "damage", `${player.id} 弃置六枚暴怒标记发动神愤。`);
    continueShenfen(session, continuation);
    return;
  }

  if (action.skillId === "yeyan") {
    assertPlayTurn(session, player.id);
    const allowedKeys = new Set(["type", "playerId", "skillId", "allocations", "cardIds"]);
    if (Object.keys(action).some((key) => !allowedKeys.has(key)) || action.targetId !== undefined || action.targetIds !== undefined) {
      ruleError("INVALID_SELECTION", "业炎只接受显式伤害分配，不接受普通目标字段。");
    }
    const allocations = action.allocations ?? [];
    const costCardIds = action.cardIds ?? [];
    if (new Set(costCardIds).size !== costCardIds.length) {
      ruleError("INVALID_SELECTION", "业炎费用牌不能重复。");
    }
    const costCards = costCardIds.map((cardId) => {
      const card = player.hand.find((candidate) => candidate.id === cardId);
      if (!card) ruleError("INVALID_CARD", "大业炎只能弃置自己的四张手牌。");
      return {
        card: godRuleCard(player, card, "hand"),
        effectiveSuit: effectiveCardSuit(session, player, card),
      };
    });
    const limitedAlreadyConsumed = session.completeRules.lifecycle.limitedUses.some((entry) =>
      entry.ownerId === player.id && entry.skillId === "yeyan");
    const plan = planYeyan({
      context: godPhaseContext(session, player, "yeyan"),
      limitedAlreadyConsumed,
      ownerHp: player.hp,
      ownerMaxHp: player.maxHp,
      allocations: allocations.map((allocation) => {
        const target = session.players.find((candidate) => candidate.id === allocation.targetId);
        return {
          targetId: allocation.targetId,
          targetAlive: target?.alive ?? false,
          damage: allocation.damage,
        };
      }),
      seatOrderFromOwner: [player.id, ...allOpponentsInSeatOrder(session, player.id)],
      greaterCostCards: costCards,
    });
    if (!plan.ok) {
      ruleError(
        plan.code === "target_dead" ? "INVALID_TARGET" :
          plan.code === "invalid_card" || plan.code === "insufficient_cards" ? "INVALID_CARD" :
            plan.code === "invalid_choice" ? "INVALID_SELECTION" : "INVALID_SKILL",
        plan.detail,
      );
    }
    if (!plan.value.greaterYeyan && action.cardIds !== undefined) {
      ruleError("INVALID_SELECTION", "小业炎不得提交任何费用牌字段。");
    }
    const eventId = allocateEventId(session);
    const continuation: YeyanContinuation = {
      eventId,
      ownerId: player.id,
      greaterYeyan: plan.value.greaterYeyan,
      costCardIds: [...plan.value.discardCostCardIds],
      allocations: plan.value.damageSteps.map((step) => ({ targetId: step.targetId, amount: step.amount })),
      stage: plan.value.greaterYeyan ? "after_cost" : "damage",
      nextAllocationIndex: 0,
    };
    consumeLimitedSkill(session.completeRules.lifecycle, player.id, "yeyan", eventId);
    addStatusEffect(session.completeRules.lifecycle, {
      ownerId: player.id,
      kind: "yeyan_commitment",
      sourcePlayerId: player.id,
      sourceSkillId: "yeyan",
      payload: {
        eventId,
        commitment: yeyanCommitmentPayload(continuation),
        cursor: yeyanCursorPayload(continuation),
      },
      visibility: "server_only",
      expiry: { type: "game_end" },
    });
    if (!plan.value.greaterYeyan) {
      addLog(session, "damage", `${player.id} 发动小业炎，分配 ${plan.value.totalAssignedDamage} 点火焰伤害。`);
      continueYeyanDamage(session, continuation);
      return;
    }
    const moveBatchId = nextMoveBatchId(session);
    const discarded = plan.value.discardCostCardIds.map((cardId) => removeCard(session, player, cardId, moveBatchId));
    session.discardPile.push(...discarded);
    addLog(session, "card", `${player.id} 发动大业炎，原子弃置四种有效花色的手牌，等待失牌后续结算。`);
    pauseYeyanForAfterMove(session, continuation);
    return;
  }

  if (action.skillId === "longhun") {
    const isPlay = session.turn.phase === "play" && session.currentPlayerId === player.id;
    const pending = session.pendingResponse;
    const requiredCount = Math.max(player.hp, 1);
    const cardIds = selectedSkillCardIds(action, requiredCount, requiredCount);
    const firstCard = ownedCard(player, cardIds[0]!);
    const requestedKind = longhunKindForSuit(effectiveCardSuit(session, player, firstCard));

    if (isPlay) {
      if (requestedKind === "peach") {
        if ((action.targetIds?.length ?? 0) > 0 || action.allocations !== undefined ||
            action.targetId !== undefined && action.targetId !== player.id) {
          ruleError("INVALID_SELECTION", "龙魂转化的桃不需要目标，兼容自选目标时只能选择自己。");
        }
        const evaluated = evaluateLiveLonghun(
          session,
          player,
          cardIds,
          "peach",
          "use",
          player.hp < player.maxHp,
        );
        const frameId = allocateEventId(session);
        const committed = commitLonghunComponents(session, player, evaluated.components, frameId);
        for (const physical of committed.cards) session.discardPile.push(takeResolvingCard(session, physical.id));
        const recovered = recoverLivePlayer(session, player, 1, player.id, "longhun_peach");
        addLog(session, "card", `${player.id} 发动龙魂，将 ${committed.cards.length} 张红桃牌当作桃使用，回复 ${recovered} 点体力。`);
        return;
      }
      if (requestedKind !== "fire_slash") {
        ruleError("INVALID_PHASE", "出牌阶段的龙魂只能将红桃牌当作桃，或将方块牌当作火杀。");
      }
      if (action.allocations !== undefined) ruleError("INVALID_SELECTION", "龙魂火杀不接受伤害分配参数。");
      const requestedTargets = action.targetIds ?? (action.targetId ? [action.targetId] : []);
      const evaluated = evaluateLiveLonghun(
        session,
        player,
        cardIds,
        "fire_slash",
        "use",
        canUseAnotherSlash(session, player),
      );
      // Equipment components can change range, target quota, or Slash quota.
      // Validate that post-payment state on an isolated clone before moving a
      // single authoritative card in the live session.
      const probe = cloneSession(session);
      const probePlayer = getLivingPlayer(probe, player.id);
      const probeComponents = longhunOwnedComponents(probePlayer, cardIds);
      commitLonghunComponents(probe, probePlayer, probeComponents, allocateEventId(probe));
      longhunSlashTargetsAfterPayment(
        probe,
        probePlayer,
        requestedTargets,
        evaluated.plan.countsAsLastHandCardForFangTian,
      );
      const frameId = allocateEventId(session);
      const committed = commitLonghunComponents(session, player, evaluated.components, frameId);
      beginLonghunFireSlash(
        session,
        player,
        committed.cards,
        requestedTargets,
        evaluated.plan.countsAsLastHandCardForFangTian,
      );
      return;
    }

    if (action.targetId !== undefined || action.targetIds !== undefined || action.allocations !== undefined) {
      ruleError("INVALID_SELECTION", "响应窗口发动龙魂不能提交目标或伤害分配。");
    }
    if (session.turn.phase !== "respond" || !pending || pending.targetId !== player.id) {
      ruleError("INVALID_PHASE", "当前没有可用龙魂响应的牌或濒死请求。");
    }
    if (pending.type === "dying") {
      const evaluated = evaluateLiveLonghun(
        session,
        player,
        cardIds,
        "peach",
        "respond",
        requestedKind === "peach" && peachAllowedByWansha(session, player.id, pending.victimId),
      );
      applyLonghunDyingResponse(session, pending, player, evaluated.components, evaluated.plan.effectiveSuit);
      return;
    }
    if (pending.type === "nullification") {
      const evaluated = evaluateLiveLonghun(
        session,
        player,
        cardIds,
        "wu_xie_ke_ji",
        "respond",
        requestedKind === "wu_xie_ke_ji",
      );
      addLog(session, "card", `${player.id} 发动龙魂，将 ${cardIds.length} 张黑桃牌当作无懈可击。`);
      withLonghunVirtualCard(session, player, evaluated.components, "wu_xie_ke_ji", () => {
        applyResponse(session, { type: "respond", playerId: player.id, cardId: cardIds[0] });
      });
      return;
    }
    const required = requiredResponseForSkill(session, player);
    const expectedKind = required === "slash" ? "fire_slash" : required === "dodge" ? "dodge" : null;
    if (expectedKind === null || requestedKind !== expectedKind) {
      ruleError("INVALID_RESPONSE", "所选龙魂牌的有效花色与当前需要的杀或闪不匹配。");
    }
    const evaluated = evaluateLiveLonghun(session, player, cardIds, expectedKind, "respond", true);
    addLog(session, "card", `${player.id} 发动龙魂，将 ${cardIds.length} 张${expectedKind === "dodge" ? "梅花牌当作闪" : "方块牌当作火杀"}。`);
    withLonghunVirtualCard(session, player, evaluated.components, expectedKind, (physicalCardIds) => {
      applyResponse(
        session,
        { type: "respond", playerId: player.id, cardId: cardIds[0] },
        expectedKind === "dodge" ? "longhun" : null,
        expectedKind === "dodge" ? physicalCardIds : undefined,
      );
    });
    return;
  }

  const required = requiredResponseForSkill(session, player);
  const isPlay = session.turn.phase === "play" && session.currentPlayerId === player.id;

  if (action.skillId === "wushen") {
    const cardId = selectedSkillCard(action);
    const card = player.hand.find((candidate) => candidate.id === cardId);
    if (!card) ruleError("INVALID_CARD", "武神只能转换自己的一张手牌。");
    if (!isPlay && (action.targetId !== undefined || action.targetIds !== undefined)) {
      ruleError("INVALID_SELECTION", "响应窗口发动武神不应提交目标。");
    }
    const evaluated = evaluateWushenViewAs({
      context: godSkillContext(session, player, "wushen"),
      card: godRuleCard(player, card, "hand"),
      effectiveSuit: effectiveCardSuit(session, player, card),
      method: isPlay ? "use" : "respond",
      slashTimingLegal: isPlay ? canUseAnotherSlash(session, player) : required === "slash",
    });
    if (!evaluated.ok) ruleError("INVALID_CARD", "武神只能将有效花色为红桃的手牌视为杀。");
    addLog(session, "card", `${player.id} 以武神将一张红桃手牌视为杀。`);
    withVirtualCard(session, player, card.id, "slash", () => {
      if (isPlay) {
        applyPlayCard(session, {
          type: "play_card",
          playerId: player.id,
          cardId: card.id,
          targetId: action.targetId,
          targetIds: action.targetIds,
        });
      } else {
        applyResponse(session, { type: "respond", playerId: player.id, cardId: card.id });
      }
    });
    return;
  }

  const cardId = selectedSkillCard(action);
  const card = ownedCard(player, cardId);

  if (action.skillId === "wusheng") {
    if (!isRedCard(session, player, card)) ruleError("INVALID_CARD", "武圣只能使用红色牌。");
    if (!isPlay && required !== "slash") ruleError("INVALID_PHASE", "当前不需要以武圣打出杀。");
    addLog(session, "card", `${player.id} 发动武圣，将一张红色牌当作杀。`);
    withVirtualCard(session, player, cardId, "slash", () => {
      if (isPlay) {
        applyPlayCard(session, {
          type: "play_card",
          playerId: player.id,
          cardId,
          targetId: action.targetId,
          targetIds: action.targetIds,
        });
      } else {
        applyResponse(session, { type: "respond", playerId: player.id, cardId });
      }
    });
    return;
  }

  if (action.skillId === "longdan") {
    if (!player.hand.some((candidate) => candidate.id === cardId)) {
      ruleError("INVALID_CARD", "龙胆只能转换手牌中的杀或闪。");
    }
    const virtualKind: CardKind = isPlay || required === "slash" ? "slash" : "dodge";
    const validPhysical = virtualKind === "slash" ? card.kind === "dodge" : isSlashCardKind(card.kind);
    if (!validPhysical || (!isPlay && required === null)) {
      ruleError("INVALID_RESPONSE", "龙胆所选牌与当前需要的杀或闪不匹配。");
    }
    addLog(session, "card", `${player.id} 发动龙胆，将${card.name}当作${virtualKind === "slash" ? "杀" : "闪"}。`);
    withVirtualCard(session, player, cardId, virtualKind, () => {
      if (isPlay) {
        applyPlayCard(session, {
          type: "play_card",
          playerId: player.id,
          cardId,
          targetId: action.targetId,
          targetIds: action.targetIds,
        });
      } else {
        applyResponse(session, { type: "respond", playerId: player.id, cardId }, "longdan");
      }
    });
    return;
  }

  if (action.skillId === "qingguo") {
    if (!player.hand.some((candidate) => candidate.id === cardId) || !isBlackCard(session, player, card)) {
      ruleError("INVALID_CARD", "倾国只能将一张黑色手牌当作闪。");
    }
    if (required !== "dodge") {
      ruleError("INVALID_PHASE", "当前不需要以倾国打出闪。");
    }
    addLog(session, "card", `${player.id} 发动倾国，将一张黑色手牌当作闪。`);
    withVirtualCard(session, player, cardId, "dodge", () => {
      applyResponse(session, { type: "respond", playerId: player.id, cardId }, "qingguo");
    });
    return;
  }

  if (action.skillId === "guose") {
    assertPlayTurn(session, player.id);
    if (effectiveCardSuit(session, player, card) !== "diamond") ruleError("INVALID_CARD", "国色只能使用方块牌。");
    if ((action.targetIds?.length ?? 0) > 0) {
      ruleError("INVALID_SELECTION", "国色只需要选择一个目标。");
    }
    addLog(session, "card", `${player.id} 发动国色，将一张方块牌当作乐不思蜀。`);
    withVirtualDelayedCard(session, player, cardId, "le_bu_si_shu", () => {
      applyPlayCard(session, { type: "play_card", playerId: player.id, cardId, targetId: action.targetId });
    });
    return;
  }

  assertPlayTurn(session, player.id);
  if (!isBlackCard(session, player, card)) ruleError("INVALID_CARD", "奇袭只能使用黑色牌。");
  addLog(session, "card", `${player.id} 发动奇袭，将一张黑色牌当作过河拆桥。`);
  beginValidatedCardUse(
    session,
    player,
    card,
    "guo_he_chai_qiao",
    { targetId: action.targetId },
    "qixi",
  );
}

function applyFanjianSuitChoice(
  session: GameSession,
  action: Extract<GameAction, { type: "choose_fanjian_suit" }>,
): void {
  const pending = session.pendingResponse;
  if (
    session.turn.phase !== "respond" ||
    !pending ||
    pending.type !== "fanjian_suit" ||
    pending.targetId !== action.playerId
  ) {
    ruleError("INVALID_PHASE", "当前没有需要完成的反间花色声明。");
  }
  if (action.promptId !== pending.promptId) {
    ruleError("INVALID_RESPONSE", "反间选择请求已失效，请按当前请求重新操作。");
  }
  const suits: readonly CardSuit[] = ["spade", "heart", "club", "diamond"];
  if (!suits.includes(action.suit)) {
    ruleError("INVALID_SELECTION", "反间必须声明一种有效花色。");
  }

  const source = getLivingPlayer(session, pending.attackerId);
  const target = getLivingPlayer(session, pending.targetId);
  if (source.hand.length === 0) {
    ruleError("INVALID_SKILL", "反间结算时来源已没有手牌。");
  }

  // RNG is consumed only after actor, prompt id, suit and recoverable state all
  // validate, so stale/replayed actions cannot perturb future randomness.
  const generated = randomInteger(session.rng, source.hand.length);
  session.rng = generated.state;
  const selected = source.hand[generated.value];
  if (!selected) throw new Error("反间随机手牌索引无效。");
  const revealed = removeCard(session, source, selected.id);
  target.hand.push(revealed);
  session.pendingResponse = null;
  session.turn.phase = "play";
  addLog(
    session,
    "card",
    `${target.id} 为反间声明${suitName(action.suit)}，随机获得并展示 ${source.id} 的${revealed.name}（${suitName(revealed.suit)} ${revealed.rank}）。`,
  );

  if (effectiveCardSuit(session, target, revealed) !== action.suit) {
    dealDamage(
      session,
      target,
      source,
      1,
      "normal",
      "反间展示牌花色与声明不符",
      { type: "finish_effect" },
    );
  }
}

function resolveLuoshenJudgment(
  session: GameSession,
  player: GamePlayer,
  completedJudgments: number,
): void {
  session.turn.phase = "prepare";
  if (session.deck.length === 0 && session.discardPile.length === 0) {
    addLog(session, "card", `${player.id} 发动洛神，但牌堆和弃牌堆均无牌，流程结束。`);
    enterBeforeJudgmentPhase(session, player);
    return;
  }
  beginStandardJudgment(
    session,
    player,
    { type: "skill", id: "luoshen" },
    { color: "black" },
    { type: "luoshen", playerId: player.id, iteration: completedJudgments },
  );
}

function finishZhijian(session: GameSession, pending: PendingStandardSkill): void {
  if (pending.skillId !== "zhijian" || pending.stage !== "zhijian_finish" ||
      !pending.sourceId || pending.selectedCardIds?.length !== 1) {
    throw new Error("直谏移牌续体无效。");
  }
  const owner = getLivingPlayer(session, pending.targetId);
  const target = getLivingPlayer(session, pending.sourceId);
  const cardId = pending.selectedCardIds[0]!;
  if (!Object.values(target.equipment).some((card) => card.id === cardId)) {
    throw new Error("直谏装备牌未进入目标对应装备栏。");
  }
  const drawn = drawCards(session, owner, 1);
  session.pendingResponse = null;
  session.turn.phase = "play";
  addLog(session, "card", `${owner.id} 完成直谏并摸了 ${drawn} 张牌。`);
}

function finishJilueZhiheng(session: GameSession, pending: PendingStandardSkill): void {
  const cardIds = pending.selectedCardIds ?? [];
  if (pending.skillId !== "jilue" || pending.stage !== "jilue_zhiheng_finish" ||
      pending.requestedCount !== cardIds.length || cardIds.length === 0 ||
      new Set(cardIds).size !== cardIds.length || pending.iteration !== renMarkCount(session, pending.targetId) ||
      session.currentPlayerId !== pending.targetId || skillUseCount(session, "jilue") !== 1 ||
      pending.promptId !== standardPromptId(pending.eventId, "jilue", pending.targetId, "zhiheng-finish") ||
      cardIds.some((cardId) => !session.discardPile.some((card) => card.id === cardId))) {
    throw new Error("极略·制衡牌移动续体被篡改。");
  }
  const owner = getLivingPlayer(session, pending.targetId);
  const drawn = drawCards(session, owner, cardIds.length);
  session.pendingResponse = null;
  session.turn.phase = "play";
  addLog(session, "card", `${owner.id} 完成极略·制衡并摸了 ${drawn} 张牌。`);
}

function resumeReadyAfterMoveEffect(session: GameSession): boolean {
  if (session.pendingResponse === null && session.turn.phase === "discard" &&
      session.turn.discardPhaseStarted && session.turn.requiredDiscardCount === 0) {
    const player = getLivingPlayer(session, session.currentPlayerId);
    if (offerQinyin(session, player)) return true;
    if (session.turn.discardStage === "yongsi") enterHandLimitDiscardOrEnd(session, player);
    else finishDiscardPhase(session, player);
    return true;
  }
  const pending = session.pendingResponse;
  if (pending?.type === "standard_judgment") {
    advanceStandardJudgment(session);
    return true;
  }
  if (pending?.type === "standard_skill" && pending.judgment && pending.stage === "leiji_judgment_retrial") {
    advanceLeijiJudgment(session);
    return true;
  }
  if (pending?.type === "standard_skill" && pending.skillId === "jilue" && pending.stage === "jilue_zhiheng_finish") {
    finishJilueZhiheng(session, pending);
    return true;
  }
  if (pending?.type === "standard_skill" && pending.skillId === "shenfen" && pending.stage === "shenfen_continue") {
    const continuation = pending.shenfenContinuation;
    if (!continuation || pending.eventId !== continuation.eventId || pending.targetId !== continuation.ownerId ||
        pending.promptId !== standardPromptId(
          continuation.eventId,
          "shenfen",
          continuation.ownerId,
          `continue-${continuation.stage}-${continuation.nextTargetIndex}`,
        )) {
      throw new Error("神愤牌移动续体被篡改。");
    }
    assertShenfenContinuation(session, continuation);
    session.pendingResponse = null;
    continueShenfen(session, continuation);
    return true;
  }
  if (pending?.type === "standard_skill" && pending.skillId === "yeyan" && pending.stage === "yeyan_after_cost") {
    const continuation = pending.yeyanContinuation;
    if (!continuation || pending.eventId !== continuation.eventId || pending.targetId !== continuation.ownerId ||
        pending.promptId !== standardPromptId(continuation.eventId, "yeyan", continuation.ownerId, "after-cost")) {
      throw new Error("大业炎牌移动续体被篡改。");
    }
    assertYeyanContinuation(session, continuation);
    continueYeyanAfterCost(session, continuation);
    return true;
  }
  if (pending?.type === "standard_skill" && pending.skillId === "zhijian" && pending.stage === "zhijian_finish") {
    finishZhijian(session, pending);
    return true;
  }
  if (pending?.type === "standard_skill" && pending.skillId === "qinyin" &&
      pending.stage === "qinyin_choice" && pending.mode === "all_recover_one") {
    finishQinyinRecovery(session, pending);
    return true;
  }
  if (pending?.type === "pindian" && pending.frame.stage === "ready_to_reveal") {
    resolveReadyPindian(session, pending);
    return true;
  }
  if (pending?.type === "qiangxi_effect") {
    if (pending.targetId !== pending.sourceId) throw new Error("强袭牌移动续体的内部目标无效。");
    continueQiangxiDamage(session, pending);
    return true;
  }
  return false;
}

function offerNextAfterMoveSkill(session: GameSession): void {
  const state = session.afterMove;
  state.queuedRecoveries ??= [];
  if (session.status === "finished") {
    state.queuedRecoveries = [];
    state.queuedTriggers = [];
    state.suspendedPhase = null;
    state.suspendedResponse = null;
    return;
  }
  if (state.suspendedPhase !== null && session.pendingResponse !== null) return;
  if (
    session.pendingResponse?.type === "skill_choice" &&
    session.pendingResponse.resume.type === "after_move"
  ) {
    return;
  }
  if (
    session.pendingResponse?.type === "standard_skill" &&
    session.pendingResponse.stage === "buqu_recovery"
  ) {
    return;
  }

  while (state.queuedRecoveries.length > 0) {
    const recovery = state.queuedRecoveries.shift()!;
    const target = session.players.find((player) => player.id === recovery.targetId);
    if (!target?.alive || recovery.remainingAmount <= 0) continue;
    const wounds = target.extraPiles.buqu ?? [];
    if (target.hp <= 0 && wounds.length > 0) {
      if (state.suspendedPhase === null) {
        state.suspendedPhase = session.turn.phase;
        state.suspendedResponse = clonePendingResponse(session.pendingResponse);
      }
      session.turn.phase = "respond";
      session.pendingResponse = {
        type: "standard_skill",
        targetId: target.id,
        promptId: `recovery:${recovery.eventId}:buqu:${recovery.remainingAmount}:${wounds.length}`,
        eventId: recovery.eventId,
        skillId: "buqu",
        stage: "buqu_recovery",
        selectedCardIds: wounds.map((card) => card.id),
        recovery: clonePendingRecoveryPoint(recovery),
      };
      addLog(session, "card", `${target.id} 回复体力前须选择移去一张不屈牌。`);
      return;
    }

    const hpBefore = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + recovery.remainingAmount);
    const recovered = target.hp - hpBefore;
    if (recovered > 0) {
      addLog(session, "card", `${target.id} 回复了 ${recovered} 点体力。`);
    }
  }

  while (state.queuedTriggers.length > 0) {
    const trigger = state.queuedTriggers.shift()!;
    const owner = session.players.find((player) => player.id === trigger.ownerId);
    if (trigger.skillId === "tuntian") {
      if (!trigger.moveBatchId || !trigger.cardIds?.length || new Set(trigger.cardIds).size !== trigger.cardIds.length ||
          trigger.triggerId !== `${trigger.eventId}:tuntian:${trigger.ownerId}:${trigger.moveBatchId}`) {
        throw new Error("屯田失牌触发续体被篡改。");
      }
      if (!owner?.alive || session.currentPlayerId === owner.id || !hasEffectiveSkill(session, owner, "tuntian")) continue;
      if (state.suspendedPhase === null) {
        state.suspendedPhase = session.turn.phase;
        state.suspendedResponse = clonePendingResponse(session.pendingResponse);
      }
      session.turn.phase = "respond";
      session.pendingResponse = {
        type: "standard_skill",
        targetId: owner.id,
        promptId: `skill:${trigger.triggerId}`,
        eventId: trigger.eventId,
        skillId: "tuntian",
        stage: "tuntian_invoke",
        selectedCardIds: [...trigger.cardIds],
        moveBatchId: trigger.moveBatchId,
      };
      addLog(session, "card", `${owner.id} 于回合外失去牌，可以发动屯田进行判定。`);
      return;
    }
    if (trigger.skillId !== "lianying" && trigger.skillId !== "xiaoji") continue;
    if (!owner?.alive || !hasEffectiveSkill(session, owner, trigger.skillId)) continue;
    if (state.suspendedPhase === null) {
      state.suspendedPhase = session.turn.phase;
      state.suspendedResponse = clonePendingResponse(session.pendingResponse);
    }
    const promptId = `skill:${trigger.triggerId}`;
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "skill_choice",
      targetId: owner.id,
      skillId: trigger.skillId,
      promptId,
      triggerId: trigger.triggerId,
      resume: { type: "after_move", eventId: trigger.eventId },
    };
    addLog(
      session,
      "card",
      trigger.skillId === "lianying"
        ? `${owner.id} 失去最后的手牌，可以发动连营。`
        : `${owner.id} 失去装备区的牌，可以发动枭姬。`,
    );
    return;
  }

  if (state.suspendedPhase !== null) {
    session.turn.phase = state.suspendedPhase;
    session.pendingResponse = clonePendingResponse(state.suspendedResponse);
    state.suspendedPhase = null;
    state.suspendedResponse = null;
    if (
      session.pendingResponse?.type === "standard_skill" &&
      session.pendingResponse.skillId === "jushou" &&
      session.pendingResponse.stage === "jushou_finish"
    ) {
      session.pendingResponse = null;
      continueEndPhaseAfterJushou(session);
      return;
    }
    if (
      session.pendingResponse?.type === "standard_skill" &&
      session.pendingResponse.skillId === "mengjin" &&
      session.pendingResponse.stage === "mengjin_finish" &&
      session.pendingResponse.slash
    ) {
      const slash = cloneSlashPending(session.pendingResponse.slash);
      session.pendingResponse = null;
      continueSlashDodgedAfterMengjin(session, slash);
      return;
    }
    if (
      session.pendingResponse?.type === "standard_skill" &&
      session.pendingResponse.skillId === "zaiqi" &&
      session.pendingResponse.stage === "zaiqi_finish"
    ) {
      finishZaiqiSettlement(session, session.pendingResponse);
      return;
    }
    if (
      session.pendingResponse?.type === "standard_skill" &&
      session.pendingResponse.skillId === "yinghun" &&
      session.pendingResponse.stage === "yinghun_finish" &&
      session.pendingResponse.sourceId
    ) {
      const owner = getLivingPlayer(session, session.pendingResponse.sourceId);
      session.pendingResponse = null;
      continuePrepareSkillsAfterYinghun(session, owner);
      return;
    }
    if (
      session.pendingResponse?.type === "standard_skill" &&
      session.pendingResponse.skillId === "dimeng" &&
      session.pendingResponse.stage === "dimeng_swap"
    ) {
      completeDimengSwap(session, session.pendingResponse);
      return;
    }
    if (
      session.pendingResponse?.type === "standard_skill" &&
      session.pendingResponse.skillId === "jilue" &&
      session.pendingResponse.stage === "jilue_zhiheng_finish"
    ) {
      finishJilueZhiheng(session, session.pendingResponse);
      return;
    }
    if (
      session.pendingResponse?.type === "standard_skill" &&
      session.pendingResponse.skillId === "zhijian" &&
      session.pendingResponse.stage === "zhijian_finish"
    ) {
      finishZhijian(session, session.pendingResponse);
      return;
    }
    if (
      session.pendingResponse?.type === "standard_skill" &&
      session.pendingResponse.skillId === "fangquan" &&
      session.pendingResponse.stage === "fangquan_complete"
    ) {
      const owner = getLivingPlayer(session, session.pendingResponse.targetId);
      if (session.currentPlayerId !== owner.id || session.turn.fangquanSkippedPlay) {
        throw new Error("放权牌移动续体与当前结束回合不一致。");
      }
      completeTurn(session, owner);
      return;
    }
    if (
      session.pendingResponse?.type === "standard_skill" &&
      session.pendingResponse.skillId === "qiaobian" &&
      session.pendingResponse.stage === "qiaobian_after_cost"
    ) {
      const restored = session.pendingResponse;
      const owner = getLivingPlayer(session, restored.targetId);
      const phase = restored.phase;
      if (!phase || session.currentPlayerId !== owner.id || restored.selectedCardIds?.length !== 1 ||
          restored.promptId !== standardPromptId(restored.eventId, "qiaobian", owner.id, "after-cost")) {
        throw new Error("巧变费用后的牌移动续体被篡改。");
      }
      continueQiaobianAfterCost(session, owner, phase, restored.eventId);
      return;
    }
    if (
      session.pendingResponse?.type === "standard_skill" &&
      session.pendingResponse.skillId === "qiaobian" &&
      session.pendingResponse.stage === "qiaobian_finish"
    ) {
      const restored = session.pendingResponse;
      const owner = getLivingPlayer(session, restored.targetId);
      const phase = restored.phase;
      const suffix = phase === "draw" ? "finish-draw" : phase === "play" ? "finish-play" : null;
      if ((phase !== "draw" && phase !== "play") || !suffix || session.currentPlayerId !== owner.id ||
          restored.promptId !== standardPromptId(restored.eventId, "qiaobian", owner.id, suffix)) {
        throw new Error("巧变替代效果后的牌移动续体被篡改。");
      }
      finishQiaobianReplacement(session, owner, phase);
      return;
    }
    if (resumeReadyAfterMoveEffect(session)) return;
    if (session.pendingResponse === null && session.completeRules.damageFlow.frames.length > 0) {
      driveLiveDamageFlow(session, true);
    }
    return;
  }
  resumeReadyAfterMoveEffect(session);
}

function applyBuquRecoveryAction(
  session: GameSession,
  pending: PendingStandardSkill,
  action: Extract<GameAction, { type: "resolve_standard_skill" }>,
  target: GamePlayer,
): void {
  const recovery = pending.recovery;
  if (!recovery || pending.skillId !== "buqu" || pending.stage !== "buqu_recovery" || recovery.targetId !== target.id) {
    throw new Error("不屈恢复提示缺少权威恢复续体。");
  }
  if (!action.activate || !action.cardId || action.cardIds !== undefined) {
    ruleError("INVALID_SELECTION", "不屈回复体力时必须选择移去一张创，且不能取消。");
  }
  if (!pending.selectedCardIds?.includes(action.cardId)) {
    ruleError("INVALID_SELECTION", "所选不屈牌不属于当前恢复提示。");
  }
  const woundCards = target.extraPiles.buqu ?? [];
  const resolved = resolveBuquRecoveryPoint({
    hp: target.hp,
    maxHp: target.maxHp,
    wounds: woundCards.map((card) => ({ cardId: card.id, rank: card.rank })),
    removeCardId: action.cardId,
  });
  if (!resolved.ok) ruleError("INVALID_SELECTION", resolved.detail);

  const zones = sessionZoneState(session);
  commitLiveMoveBatch(session, zones.state, {
    batchId: nextMoveBatchId(session),
    intents: [{
      cardIds: [action.cardId],
      from: { kind: "extra", playerId: target.id, pileId: "buqu" },
      to: { kind: "discard" },
      reason: "skill_effect",
      visibility: "public",
      actorId: target.id,
      sourceId: recovery.sourceId,
      targetId: target.id,
      skillId: "buqu",
      useId: recovery.dyingRescue?.useId ?? null,
      frameId: recovery.dyingRescue?.frameId ?? recovery.eventId,
    }],
  });
  syncSessionZones(session, zones);
  target.hp = resolved.value.hpAfter;
  let remainingAmount = recovery.remainingAmount - 1;
  addLog(session, "card", `${target.id} 移去一张不屈牌以处理 1 点回复。`);

  const remainingWounds = target.extraPiles.buqu ?? [];
  if (remainingAmount > 0 && target.hp <= 0 && remainingWounds.length > 0) {
    const nextRecovery = { ...clonePendingRecoveryPoint(recovery), remainingAmount };
    session.pendingResponse = {
      ...pending,
      promptId: `recovery:${recovery.eventId}:buqu:${remainingAmount}:${remainingWounds.length}`,
      selectedCardIds: remainingWounds.map((card) => card.id),
      recovery: nextRecovery,
    };
    return;
  }

  if (remainingAmount > 0) {
    target.hp = Math.min(target.maxHp, target.hp + remainingAmount);
    remainingAmount = 0;
  }
  session.pendingResponse = null;

  if (recovery.dyingRescue) {
    const rescue = recovery.dyingRescue;
    const frame = topDyingFrame(session.completeRules.dying);
    const suspended = session.afterMove.suspendedResponse;
    if (
      !frame ||
      frame.frameId !== rescue.frameId ||
      frame.victimId !== target.id ||
      frame.stage !== "rescue" ||
      currentDyingResponder(frame) !== rescue.responderId ||
      session.afterMove.suspendedPhase === null ||
      suspended?.type !== "dying" ||
      suspended.frameId !== frame.frameId ||
      suspended.victimId !== target.id
    ) {
      throw new Error("不屈恢复救援与 DyingStack 续体不一致。");
    }
    const sources = rescue.physicalCards ?? [{
      physicalCardId: rescue.physicalCardId,
      from: rescue.from,
      ...(rescue.from === "equipment" ? { equipmentSlot: rescue.equipmentSlot } : {}),
    }];
    const physicals = sources.map((source) => {
      const physical = session.resolvingCards.find((card) => card.id === source.physicalCardId);
      if (!physical) throw new Error("不屈恢复救援缺少处理区实体牌。");
      return physical;
    });
    const viewAsSkillId = rescue.viewAsSkillId;
    const moveRecords = sources.map((source, index): MoveRecord => ({
      batchId: rescue.moveBatchId,
      cardIds: [physicals[index]!.id],
      cards: [cloneCard(physicals[index]!)],
      from: source.from === "equipment"
        ? { kind: "equipment", playerId: rescue.responderId, slot: source.equipmentSlot! }
        : { kind: "hand", playerId: rescue.responderId },
      to: { kind: "processing", frameId: rescue.cardUseFrameId },
      placement: "append",
      reason: "respond",
      visibility: "public",
      actorId: rescue.responderId,
      sourceId: rescue.responderId,
      targetId: target.id,
      skillId: viewAsSkillId,
      useId: rescue.useId,
      frameId: rescue.cardUseFrameId,
    }));
    recordDyingRescue(lifePlayerSnapshot(session), frame, {
      eventId: recovery.eventId,
      responderId: rescue.responderId,
      cardKind: rescue.cardKind,
      amount: recovery.requestedAmount,
      useId: rescue.useId,
      cardUseFrameId: rescue.cardUseFrameId,
      physicalCardIds: sources.map((source) => source.physicalCardId),
      viewAsSkillId,
      effectiveSuit: rescue.effectiveSuit,
      suitModifierSkillId: rescue.suitModifierSkillId,
      moveRecords,
      recoveredAmount: Math.min(recovery.requestedAmount, Math.max(0, target.hp - recovery.hpBefore)),
      hpAfter: target.hp,
    });
    if (frame.stage === "rescue" && target.hp <= 0) {
      const analysis = analyzeBuquWounds((target.extraPiles.buqu ?? []).map((card) => ({ cardId: card.id, rank: card.rank })));
      if (!analysis.ok) throw new Error(analysis.detail);
      resolveDyingRecoverySave(lifePlayerSnapshot(session), frame, {
        skillId: "buqu",
        survives: analysis.value.protectedFromDying,
      });
      if (analysis.value.protectedFromDying) {
        addLog(session, "damage", `${target.id} 移去不屈牌后点数各不相同，脱离濒死状态。`);
      }
    }
    const restoredPhase = session.afterMove.suspendedPhase;
    session.afterMove.suspendedPhase = null;
    session.afterMove.suspendedResponse = null;
    session.turn.phase = restoredPhase;
    const resolvedFrame = topDyingFrame(session.completeRules.dying);
    if (!resolvedFrame || resolvedFrame.frameId !== frame.frameId) {
      throw new Error("不屈恢复后 DyingStack 栈顶发生变化。");
    }
    if (resolvedFrame.stage === "rescued") {
      addLog(session, "card", `${target.id} 脱离濒死状态。`);
      completeResolvedDying(session, resolvedFrame, suspended.resume, true);
    } else {
      offerCurrentDyingResponse(session, resolvedFrame, suspended.resume);
    }
    return;
  }

  offerNextAfterMoveSkill(session);
}

function applyResolveSkill(
  session: GameSession,
  action: Extract<GameAction, { type: "resolve_skill" }>,
): void {
  const pending = session.pendingResponse;
  if (
    session.turn.phase !== "respond" ||
    !pending ||
    pending.type !== "skill_choice" ||
    pending.targetId !== action.playerId
  ) {
    ruleError("INVALID_PHASE", "当前没有需要处理的武将技能选择。");
  }
  if (pending.skillId !== action.skillId) {
    ruleError("INVALID_SKILL", `当前需要处理的是 ${pending.skillId}，不是 ${action.skillId}。`);
  }
  if (pending.promptId !== undefined && action.promptId !== pending.promptId) {
    ruleError("INVALID_PHASE", "技能选择已过期或不属于当前结算帧。");
  }
  const player = getLivingPlayer(session, action.playerId);
  if (!hasEffectiveSkill(session, player, action.skillId)) {
    ruleError("INVALID_SKILL", `${player.id} 没有技能 ${action.skillId}。`);
  }
  session.pendingResponse = null;

  if (pending.skillId === "buqu") {
    if (pending.resume.type !== "dying" || !pending.resume.buquLoss) {
      throw new Error("不屈提示缺少 DyingStack 扣减续体。");
    }
    const frame = topDyingFrame(session.completeRules.dying);
    const loss = pending.resume.buquLoss;
    if (
      !frame ||
      frame.frameId !== pending.resume.frameId ||
      frame.victimId !== player.id ||
      currentDyingEntrySaveSkill(frame) !== "buqu" ||
      loss.hpBefore - loss.amount !== player.hp
    ) {
      throw new Error("不屈提示与 DyingStack 入场游标不一致。");
    }
    if (!action.activate) {
      resolveDyingEntrySave(lifePlayerSnapshot(session), frame, { skillId: "buqu", survives: false });
      addLog(session, "damage", `${player.id} 未发动不屈。`);
      offerCurrentDyingResponse(session, frame, pending.resume.resume);
      return;
    }
    const plan = planBuquWounds({ hpBefore: loss.hpBefore, lossAmount: loss.amount });
    if (!plan.ok || plan.value.woundCount <= 0) {
      throw new Error(plan.ok ? "不屈没有需要亮出的伤牌。" : plan.detail);
    }
    const transition = drawTopCards(deckServiceState(session), plan.value.woundCount);
    applyDeckServiceState(session, transition.state);
    (player.extraPiles.buqu ??= []).push(...transition.cards.map(cloneCard));
    const analysis = analyzeBuquWounds(
      player.extraPiles.buqu.map((card) => ({ cardId: card.id, rank: card.rank })),
    );
    if (!analysis.ok) throw new Error(analysis.detail);
    resolveDyingEntrySave(lifePlayerSnapshot(session), frame, {
      skillId: "buqu",
      survives: analysis.value.protectedFromDying,
    });
    addLog(session, "card", `${player.id} 发动不屈，亮出了 ${transition.cards.length} 张创。`);
    if (analysis.value.protectedFromDying) {
      addLog(session, "damage", `${player.id} 的不屈牌点数各不相同，暂时不会死亡。`);
      completeResolvedDying(session, frame, pending.resume.resume, true);
    } else {
      offerCurrentDyingResponse(session, frame, pending.resume.resume);
    }
    return;
  }

  if (pending.skillId === "niepan") {
    if (pending.resume.type !== "dying") throw new Error("涅槃缺少 DyingStack 续体。");
    const frame = topDyingFrame(session.completeRules.dying);
    if (!frame || frame.frameId !== pending.resume.frameId || frame.victimId !== player.id || currentDyingOwnerResponseSkill(frame) !== "niepan") {
      throw new Error("涅槃提示与 DyingStack 游标不一致。");
    }
    if (!action.activate) {
      declineDyingOwnerResponseSave(frame, "niepan", player.hp);
      addLog(session, "damage", `${player.id} 未发动涅槃。`);
      offerCurrentDyingResponse(session, frame, pending.resume.resume);
      return;
    }
    const limitedSkillConsumed = session.completeRules.lifecycle.limitedUses.some((entry) =>
      entry.ownerId === player.id && entry.skillId === "niepan");
    const plan = planNiepan({
      ownerId: player.id,
      dyingPlayerId: frame.victimId,
      inOwnDyingResponseWindow: currentDyingResponder(frame) === player.id,
      skillEffective: hasEffectiveSkill(session, player, "niepan"),
      limitedSkillConsumed,
      state: {
        playerId: player.id,
        alive: player.alive,
        hp: player.hp,
        maxHp: player.maxHp,
        faceUp: player.faceUp,
        chained: player.chained,
        drunk: session.currentPlayerId === player.id && session.turn.slashDamageBonus > 0,
        handCardIds: player.hand.map((card) => card.id),
        equipment: Object.entries(player.equipment).map(([slot, card]) => ({
          slot: slot as EquipmentSlot,
          cardId: card.id,
        })),
        judgmentCardIds: player.judgment.map((card) => card.id),
      },
    });
    if (!plan.ok) ruleError("INVALID_SKILL", plan.detail);
    const eventId = allocateEventId(session);
    consumeLimitedSkill(session.completeRules.lifecycle, player.id, "niepan", eventId);
    for (const card of player.judgment) restorePhysicalCard(session, restoreVirtualOrigin(session, card));
    const refs = victimOwnedZoneRefs(player).filter((entry) => entry.zone.kind !== "extra");
    const lostHand = player.hand.length > 0;
    const lostEquipmentCount = Object.keys(player.equipment).length;
    if (refs.length > 0) {
      const zones = sessionZoneState(session);
      commitLiveMoveBatch(session, zones.state, {
        batchId: nextMoveBatchId(session),
        intents: refs.map((entry) => ({
          cardIds: entry.cardIds,
          from: entry.zone,
          to: { kind: "discard" as const },
          reason: "skill_effect" as const,
          visibility: "public" as const,
          actorId: player.id,
          sourceId: player.id,
          targetId: player.id,
          skillId: "niepan" as const,
          useId: null,
          frameId: frame.frameId,
        })),
      });
      syncSessionZones(session, zones);
    }
    const playerIndex = session.players.findIndex((candidate) => candidate.id === player.id);
    session.players[playerIndex] = {
      ...getPlayer(session, player.id),
      hp: plan.value.stateBeforeDraw.hp,
      faceUp: true,
      chained: false,
    };
    const resolved = getPlayer(session, player.id);
    if (session.currentPlayerId === resolved.id) session.turn.slashDamageBonus = 0;
    if (lostHand) enqueueAfterMoveSkill(session, resolved, "lianying");
    for (let index = 0; index < lostEquipmentCount; index += 1) enqueueAfterMoveSkill(session, resolved, "xiaoji");
    const drawn = drawCards(session, resolved, plan.value.drawCount);
    applyDyingOwnerResponseSave(lifePlayerSnapshot(session), frame, "niepan");
    addLog(session, "card", `${resolved.id} 发动涅槃，弃置区域内的牌，复原状态并摸了 ${drawn} 张牌。`);
    completeResolvedDying(session, frame, pending.resume.resume, true);
    return;
  }

  if (pending.skillId === "lianying" || pending.skillId === "xiaoji") {
    if (
      pending.resume.type !== "after_move" ||
      pending.triggerId !== `${pending.resume.eventId}:${pending.skillId}:${player.id}:0` ||
      session.afterMove.suspendedPhase === null
    ) {
      throw new Error(`${pending.skillId} 的牌移动事件续体无效。`);
    }
    if (action.activate) {
      const drawCount = pending.skillId === "lianying" ? 1 : 2;
      const drawn = drawCards(session, player, drawCount);
      addLog(session, "card", `${player.id} 发动${pending.skillId === "lianying" ? "连营" : "枭姬"}，摸了 ${drawn} 张牌。`);
    } else {
      addLog(session, "card", `${player.id} 未发动${pending.skillId === "lianying" ? "连营" : "枭姬"}。`);
    }
    offerNextAfterMoveSkill(session);
    return;
  }

  if (pending.skillId === "jizhi") {
    if (
      pending.resume.type !== "card_use" ||
      pending.resume.intent.sourceId !== player.id ||
      pending.triggerId === undefined ||
      pending.triggerId !== `${pending.resume.eventId}:jizhi:${player.id}:0`
    ) {
      throw new Error("集智的用牌事件续体无效。");
    }
    if (action.activate) {
      const drawn = drawCards(session, player, 1);
      addLog(session, "card", `${player.id} 发动集智，摸了 ${drawn} 张牌。`);
    } else {
      addLog(session, "card", `${player.id} 未发动集智。`);
    }
    continueCardUse(session, pending.resume);
    return;
  }

  if (pending.skillId === "jilue") {
    const context = jilueContext(session, player);
    const definition = pending.resume.type === "card_use"
      ? getCardDefinition(pending.resume.intent.effectiveKind)
      : null;
    if (pending.resume.type !== "card_use" || pending.resume.intent.sourceId !== player.id ||
        pending.triggerId !== `${pending.resume.eventId}:jilue_jizhi:${player.id}:0` ||
        pending.markCount !== context.renMarks || !definition || !context.skillEffective ||
        !context.awakened || context.renMarks < 1) {
      throw new Error("极略·集智的用牌事件续体无效。");
    }
    if (action.activate) {
      const plan = planJilueJizhi({
        context,
        effectiveCardKind: pending.resume.intent.effectiveKind,
        effectiveCardCategory: definition.category,
      });
      if (!plan.ok) throw new Error(plan.detail);
      spendJilueRen(session, player.id);
      const drawn = drawCards(session, player, plan.value.drawCount);
      addLog(session, "card", `${player.id} 消耗 1 枚忍标记发动极略·集智，摸了 ${drawn} 张牌。`);
    } else {
      addLog(session, "card", `${player.id} 未发动极略·集智。`);
    }
    continueCardUse(session, pending.resume);
    return;
  }

  if (pending.skillId === "luoyi") {
    if (pending.resume.type !== "finish_draw" || pending.resume.playerId !== player.id) {
      throw new Error("裸衣的摸牌阶段续体无效。");
    }
    session.turn.phase = "draw";
    session.turn.luoyiActive = action.activate;
    const drawn = drawCards(
      session,
      player,
      drawPhaseCardCount(session, player, (session.turn.haoshiActive ? 2 : 0) + (action.activate ? -1 : 0)),
    );
    addLog(
      session,
      "card",
      action.activate
        ? `${player.id} 发动裸衣，摸了 ${drawn} 张牌；本回合杀和决斗造成的伤害 +1。`
        : `${player.id} 未发动裸衣，摸了 ${drawn} 张牌。`,
    );
    finishNormalDrawPhase(session, player);
    return;
  }

  if (pending.skillId === "yingzi") {
    if (pending.resume.type !== "finish_draw" || pending.resume.playerId !== player.id) {
      throw new Error("英姿的摸牌阶段续体无效。");
    }
    session.turn.phase = "draw";
    const drawn = drawCards(
      session,
      player,
      drawPhaseCardCount(session, player, (session.turn.haoshiActive ? 2 : 0) + (action.activate ? 1 : 0)),
    );
    addLog(
      session,
      "card",
      action.activate
        ? `${player.id} 发动英姿，摸了 ${drawn} 张牌。`
        : `${player.id} 未发动英姿，摸了 ${drawn} 张牌。`,
    );
    finishNormalDrawPhase(session, player);
    return;
  }

  if (pending.skillId === "luoshen") {
    if (pending.resume.type !== "continue_judgment" || pending.resume.playerId !== player.id) {
      throw new Error("洛神的准备阶段续体无效。");
    }
    if (action.activate) {
      resolveLuoshenJudgment(session, player, pending.iteration ?? 0);
    } else {
      addLog(session, "turn", `${player.id} 未继续发动洛神。`);
      enterBeforeJudgmentPhase(session, player);
    }
    return;
  }

  if (pending.skillId === "biyue") {
    if (pending.resume.type !== "finish_turn" || pending.resume.playerId !== player.id) {
      throw new Error("闭月的结束阶段续体无效。");
    }
    session.turn.phase = "end";
    if (action.activate) {
      const drawn = drawCards(session, player, 1);
      addLog(session, "card", `${player.id} 发动闭月，摸了 ${drawn} 张牌。`);
    } else {
      addLog(session, "turn", `${player.id} 未发动闭月。`);
    }
    continueEndPhaseAfterBiyue(session, player);
    return;
  }

  if (
    pending.skillId !== "keji" ||
    pending.resume.type !== "enter_discard" ||
    pending.resume.playerId !== player.id
  ) {
    throw new Error("克己的弃牌阶段续体无效。");
  }
  if (action.activate) {
    addLog(session, "turn", `${player.id} 发动克己，跳过弃牌阶段并结束回合。`);
    enterEndPhase(session);
    return;
  }
  addLog(session, "turn", `${player.id} 未发动克己，进入弃牌阶段。`);
  enterRealDiscardPhase(session, player);
}

function finishZaiqiSettlement(session: GameSession, pending: PendingStandardSkill): void {
  if (pending.skillId !== "zaiqi" || pending.stage !== "zaiqi_finish" || !pending.selectedCardIds) {
    throw new Error("再起展示牌续体无效。");
  }
  const player = getLivingPlayer(session, pending.targetId);
  const selected = new Set(pending.selectedCardIds);
  const revealed = session.resolvingCards.filter((card) => selected.has(card.id));
  if (revealed.length !== selected.size) throw new Error("再起展示牌已离开结算区。");
  const hearts = revealed.filter((card) => card.suit === "heart");
  const gains = revealed.filter((card) => card.suit !== "heart");
  const intents: MoveIntent[] = [
    ...(hearts.length > 0 ? [{
      cardIds: hearts.map((card) => card.id),
      from: { kind: "processing" as const, frameId: SESSION_PROCESSING_FRAME_ID },
      to: { kind: "discard" as const },
      reason: "skill_effect" as const,
      visibility: "public" as const,
      actorId: player.id,
      sourceId: player.id,
      targetId: player.id,
      skillId: "zaiqi" as const,
    }] : []),
    ...(gains.length > 0 ? [{
      cardIds: gains.map((card) => card.id),
      from: { kind: "processing" as const, frameId: SESSION_PROCESSING_FRAME_ID },
      to: { kind: "hand" as const, playerId: player.id },
      reason: "gain" as const,
      visibility: "owner" as const,
      actorId: player.id,
      sourceId: player.id,
      targetId: player.id,
      skillId: "zaiqi" as const,
    }] : []),
  ];
  const zones = sessionZoneState(session);
  commitLiveMoveBatch(session, zones.state, { batchId: nextMoveBatchId(session), intents });
  syncSessionZones(session, zones);
  session.pendingResponse = null;
  addLog(session, "card", `${player.id} 完成再起，弃置 ${hearts.length} 张红桃并获得 ${gains.length} 张非红桃牌。`);
  finishDrawPhase(session, player);
}

function settleZaiqi(
  session: GameSession,
  player: GamePlayer,
  pending: PendingStandardSkill,
  revealCount: number,
): void {
  const hpBefore = player.hp;
  const transition = drawTopCards(deckServiceState(session), revealCount);
  applyDeckServiceState(session, transition.state);
  const revealed = transition.cards.map(cloneCard);
  const plan = planZaiqiSettlement({
    ownerId: player.id,
    ownerHp: hpBefore,
    ownerMaxHp: player.maxHp,
    revealedCards: revealed.map((card) => ({ id: card.id, printedSuit: card.suit })),
  });
  if (!plan.ok) throw new Error(plan.detail);
  session.resolvingCards.push(...revealed);
  session.turn.phase = "draw";
  session.pendingResponse = {
    ...pending,
    stage: "zaiqi_finish",
    promptId: standardPromptId(pending.eventId, "zaiqi", player.id, "finish"),
    selectedCardIds: revealed.map((card) => card.id),
  };
  for (const step of plan.value.recoverySteps) {
    if (step.actual > 0) recoverLivePlayer(session, player, step.actual, player.id, "zaiqi");
  }
  addLog(
    session,
    "card",
    `${player.id} 发动再起，展示 ${revealed.length} 张牌，其中 ${plan.value.heartCardIds.length} 张印刷红桃依次结算回复。`,
  );
  if (session.afterMove.queuedRecoveries.length === 0 && session.afterMove.queuedTriggers.length === 0) {
    finishZaiqiSettlement(session, session.pendingResponse);
  }
}

function beginLuanwuSlash(
  session: GameSession,
  actor: GamePlayer,
  target: GamePlayer,
  action: Extract<GameAction, { type: "resolve_standard_skill" }>,
  continuation: LuanwuContinuation,
): void {
  const conversion = action.viewAsSkillId;
  let selected: Card[];
  let slashKind: Extract<CardKind, "slash" | "fire_slash" | "thunder_slash"> = "slash";
  if (conversion === "zhang_ba_she_mao") {
    const cardIds = action.cardIds ?? [];
    if (action.cardId !== undefined || cardIds.length !== 2 || new Set(cardIds).size !== 2 ||
      actor.equipment.weapon?.kind !== "zhang_ba_she_mao") {
      ruleError("INVALID_CARD", "乱武中以丈八蛇矛出杀须选择两张不同手牌。");
    }
    selected = cardIds.map((cardId) => {
      const card = actor.hand.find((candidate) => candidate.id === cardId);
      if (!card) ruleError("INVALID_CARD", "丈八蛇矛只能使用两张当前手牌。");
      return card;
    });
  } else {
    if (!action.cardId || action.cardIds !== undefined) ruleError("INVALID_CARD", "乱武中使用杀须选择一张牌。");
    const card = conversion === "wusheng" ? ownedCard(actor, action.cardId) : actor.hand.find((candidate) => candidate.id === action.cardId);
    if (!card) ruleError("INVALID_CARD", "乱武所选手牌已经不存在。");
    if (conversion === "wusheng") {
      if (!hasEffectiveSkill(session, actor, "wusheng") || !isRedCard(session, actor, card)) {
        ruleError("INVALID_CARD", "乱武中武圣只能将一张红色牌当作杀。");
      }
    } else if (conversion === "longdan") {
      if (!hasEffectiveSkill(session, actor, "longdan") || card.kind !== "dodge") {
        ruleError("INVALID_CARD", "乱武中龙胆只能将一张手牌闪当作杀。");
      }
    } else if (conversion === undefined) {
      if (!isSlashCardKind(card.kind)) ruleError("INVALID_CARD", "乱武中须使用一张杀。");
      slashKind = card.kind;
    } else {
      ruleError("INVALID_SKILL", "乱武不支持该杀转化方式。");
    }
    selected = [card];
  }
  const color = selected.every((card) => isRedCard(session, actor, card))
    ? "red"
    : selected.every((card) => isBlackCard(session, actor, card)) ? "black" : "colorless";
  const moveBatchId = nextMoveBatchId(session);
  const removed = selected.map((card) => conversion === "wusheng"
    ? removeOwnedCard(session, actor, card.id, moveBatchId)
    : removeCard(session, actor, card.id, moveBatchId));
  session.resolvingCards.push(...removed);
  addLog(session, "card", `${actor.id} 在乱武中${conversion ? "转化并" : ""}对 ${target.id} 使用一张杀。`);
  beginSlashTarget(session, {
    type: "slash",
    attackerId: actor.id,
    targetId: target.id,
    cardId: removed[0]!.id,
    damageCardIds: removed.map((card) => card.id),
    slashKind,
    damage: 1,
    nature: damageNatureForSlash(slashKind),
    color,
    armorIgnored: false,
    requiredDodgeCount: wushuangResponseCount(session, actor),
    dodgesPlayed: 0,
    remainingTargetIds: [],
    zhuQueChecked: false,
    ciXiongChecked: false,
    liegongChecked: false,
    tieqiChecked: false,
    useProvenance: { method: "use", turnPlayerId: session.turn.playerId, phase: "respond" },
    completion: continuation,
  });
}

function tiaoxinTargetCards(session: GameSession, target: GamePlayer) {
  return [
    ...target.hand.map((card) => mountainRuleCard(session, target, card, "hand")),
    ...Object.values(target.equipment).map((card) => mountainRuleCard(session, target, card, "equipment")),
    ...target.judgment.map((card) => mountainRuleCard(session, target, card, "judgment")),
  ];
}

function tiaoxinSlashOptions(session: GameSession, actor: GamePlayer): string[] {
  const options: string[] = [];
  if (actor.hand.some((card) => isSlashCardKind(card.kind))) options.push("physical_slash");
  if (hasEffectiveSkill(session, actor, "wushen") &&
      actor.hand.some((card) => effectiveCardSuit(session, actor, card) === "heart")) {
    options.push("wushen");
  }
  if (hasEffectiveSkill(session, actor, "wusheng") && ownedCards(actor).some((card) => isRedCard(session, actor, card))) {
    options.push("wusheng");
  }
  if (hasEffectiveSkill(session, actor, "longdan") && actor.hand.some((card) => card.kind === "dodge")) {
    options.push("longdan");
  }
  if (actor.equipment.weapon?.kind === "zhang_ba_she_mao" && actor.hand.length >= 2) {
    options.push("zhang_ba_she_mao");
  }
  if (hasEffectiveSkill(session, actor, "jijiang") && lordDispatchProviders(session, actor, "jijiang").length > 0) {
    options.push("jijiang");
  }
  return options;
}

function liveTiaoxinPrompt(
  session: GameSession,
  owner: GamePlayer,
  target: GamePlayer,
) {
  return evaluateTiaoxin({
    context: {
      actorId: owner.id,
      currentPlayerId: session.currentPlayerId,
      phase: session.turn.phase === "respond" ? "play" : session.turn.phase,
      actorAlive: owner.alive,
      skillEffective: hasEffectiveSkill(session, owner, "tiaoxin"),
    },
    alreadyUsedThisTurn: skillUseCount(session, "tiaoxin") !== 1,
    targetId: target.id,
    targetAlive: target.alive,
    distanceFromTargetToOwner: distanceBetweenPlayers(session, target.id, owner.id),
    targetAttackRange: attackRangeFor(session, target.id),
    targetCanLegallySlashOwner: canBeSlashTarget(session, owner) && tiaoxinSlashOptions(session, target).length > 0,
    targetCards: tiaoxinTargetCards(session, target),
  });
}

function declineTiaoxin(session: GameSession, pending: PendingStandardSkill): void {
  const owner = pending.sourceId ? getLivingPlayer(session, pending.sourceId) : null;
  const target = getLivingPlayer(session, pending.targetId);
  if (!owner) throw new Error("挑衅续体缺少技能发动者。");
  const prompt = liveTiaoxinPrompt(session, owner, target);
  if (!prompt.ok) throw new Error(`挑衅拒绝续体无效：${prompt.detail}`);
  const resolution = planTiaoxinResolution({ prompt: prompt.value, choice: "decline", slashCard: null });
  if (!resolution.ok) throw new Error(resolution.detail);
  if (resolution.value.outcome !== "decline" || resolution.value.discardMaximum === 0) {
    session.pendingResponse = null;
    session.turn.phase = "play";
    addLog(session, "card", `${target.id} 未对 ${owner.id} 使用杀，且已无牌可被弃置。`);
    return;
  }
  session.turn.phase = "respond";
  session.pendingResponse = {
    ...pending,
    targetId: owner.id,
    sourceId: target.id,
    promptId: standardPromptId(pending.eventId, "tiaoxin", owner.id, `discard-${target.id}`),
    stage: "tiaoxin_discard",
  };
  addLog(session, "card", `${target.id} 未使用杀，${owner.id} 将弃置其区域内一张牌。`);
}

function beginTiaoxinSlash(
  session: GameSession,
  pending: PendingStandardSkill,
  action: Extract<GameAction, { type: "resolve_standard_skill" }>,
): void {
  const owner = pending.sourceId ? getLivingPlayer(session, pending.sourceId) : null;
  const actor = getLivingPlayer(session, pending.targetId);
  if (!owner || actor.id === owner.id || !canBeSlashTarget(session, owner) ||
      !isInSlashRange(session, actor.id, owner.id)) {
    ruleError("INVALID_TARGET", "挑衅响应杀的目标或距离已经不再合法。");
  }
  const prompt = liveTiaoxinPrompt(session, owner, actor);
  if (!prompt.ok || !prompt.value.targetMayUseSlash) ruleError("INVALID_CARD", "挑衅目标当前没有合法的杀来源。");
  if (action.targetId !== undefined || action.targetIds !== undefined) {
    ruleError("INVALID_SELECTION", "挑衅响应杀的目标固定为技能发动者。");
  }
  if (action.tokens?.length === 1 && action.tokens[0] === "jijiang") {
    if (action.cardId !== undefined || action.cardIds !== undefined || action.viewAsSkillId !== undefined ||
        !tiaoxinSlashOptions(session, actor).includes("jijiang") || pending.processedPlayerIds?.includes(actor.id)) {
      ruleError("INVALID_SELECTION", "挑衅中激将不需要预先选择牌。");
    }
    beginLordDispatch(session, actor, "jijiang", {
      type: "use_slash",
      targetIds: [owner.id],
      ignoreUseLimit: true,
      completion: { type: "default" },
      failureResume: {
        ...(clonePendingResponse(pending) as PendingStandardSkill),
        processedPlayerIds: [...new Set([...(pending.processedPlayerIds ?? []), actor.id])],
      },
    });
    return;
  }
  if (action.tokens !== undefined) ruleError("INVALID_SELECTION", "挑衅响应杀包含未知选项。");
  const conversion = action.viewAsSkillId;
  let selected: Card[];
  let slashKind: Extract<CardKind, "slash" | "fire_slash" | "thunder_slash"> = "slash";
  if (conversion === "zhang_ba_she_mao") {
    const cardIds = action.cardIds ?? [];
    if (action.cardId !== undefined || cardIds.length !== 2 || new Set(cardIds).size !== 2 ||
        actor.equipment.weapon?.kind !== "zhang_ba_she_mao") {
      ruleError("INVALID_CARD", "挑衅中丈八蛇矛须选择两张不同手牌。");
    }
    selected = cardIds.map((cardId) => {
      const card = actor.hand.find((candidate) => candidate.id === cardId);
      if (!card) ruleError("INVALID_CARD", "丈八蛇矛只能使用两张当前手牌。");
      return card;
    });
  } else {
    if (!action.cardId || action.cardIds !== undefined) ruleError("INVALID_CARD", "挑衅中使用杀须选择一张牌。");
    const card = conversion === "wusheng" ? ownedCard(actor, action.cardId) : actor.hand.find((candidate) => candidate.id === action.cardId);
    if (!card) ruleError("INVALID_CARD", "挑衅所选牌已经不存在。");
    if (conversion === "wushen") {
      const evaluated = evaluateWushenViewAs({
        context: godSkillContext(session, actor, "wushen"),
        card: godRuleCard(actor, card, "hand"),
        effectiveSuit: effectiveCardSuit(session, actor, card),
        method: "use",
        slashTimingLegal: true,
      });
      if (!evaluated.ok) ruleError("INVALID_CARD", "挑衅中武神只能将一张红桃手牌视为杀。");
    } else if (conversion === "wusheng") {
      if (!hasEffectiveSkill(session, actor, "wusheng") || !isRedCard(session, actor, card)) {
        ruleError("INVALID_CARD", "武圣只能将一张有效红色牌当作杀。");
      }
    } else if (conversion === "longdan") {
      if (!hasEffectiveSkill(session, actor, "longdan") || card.kind !== "dodge") {
        ruleError("INVALID_CARD", "龙胆只能将一张手牌闪当作杀。");
      }
    } else if (conversion === undefined) {
      if (!isSlashCardKind(card.kind)) ruleError("INVALID_CARD", "挑衅中须使用一张杀。");
      slashKind = card.kind;
    } else {
      ruleError("INVALID_SKILL", "挑衅不支持该杀转化方式。");
    }
    selected = [card];
  }
  const reified = {
    ...mountainRuleCard(session, actor, selected[0]!, "hand"),
    kind: "slash",
    category: "basic" as const,
    equipmentSlot: null,
  };
  const resolution = planTiaoxinResolution({ prompt: prompt.value, choice: "use_slash", slashCard: reified });
  if (!resolution.ok) ruleError("INVALID_CARD", resolution.detail);
  const color = selected.every((card) => isRedCard(session, actor, card))
    ? "red" as const
    : selected.every((card) => isBlackCard(session, actor, card)) ? "black" as const : "colorless" as const;
  const moveBatchId = nextMoveBatchId(session);
  const removed = selected.map((card) => conversion === "wusheng"
    ? removeOwnedCard(session, actor, card.id, moveBatchId)
    : removeCard(session, actor, card.id, moveBatchId));
  session.resolvingCards.push(...removed);
  addLog(session, "card", `${actor.id} 响应挑衅，对 ${owner.id} 使用${conversion ? "转化的" : ""}杀。`);
  beginSlashTarget(session, {
    type: "slash",
    attackerId: actor.id,
    targetId: owner.id,
    cardId: removed[0]!.id,
    damageCardIds: removed.map((card) => card.id),
    slashKind,
    damage: 1,
    nature: damageNatureForSlash(slashKind),
    color,
    armorIgnored: false,
    requiredDodgeCount: wushuangResponseCount(session, actor),
    dodgesPlayed: 0,
    remainingTargetIds: [],
    zhuQueChecked: false,
    ciXiongChecked: false,
    liegongChecked: false,
    tieqiChecked: false,
    useProvenance: { method: "use", turnPlayerId: session.turn.playerId, phase: "respond" },
    completion: { type: "default" },
  });
}

function guixinTargetHasCard(player: GamePlayer): boolean {
  return player.hand.length + Object.keys(player.equipment).length + player.judgment.length > 0;
}

function advanceGuixinSelection(
  session: GameSession,
  pending: PendingStandardSkill,
  nextIndex: number,
): void {
  const cursor = pending.damageOpportunity;
  if (pending.skillId !== "guixin" || !cursor || !pending.targetIds ||
      !Number.isSafeInteger(nextIndex) || nextIndex < 0 || nextIndex > pending.targetIds.length) {
    throw new Error("归心推进缺少 DamageFlow 游标或冻结座次。");
  }
  const actor = getLivingPlayer(session, pending.targetId);
  const frame = assertLiveDamageCursor(session, cursor);
  let index = nextIndex;
  while (index < pending.targetIds.length) {
    const target = getPlayer(session, pending.targetIds[index]!);
    if (target.alive && guixinTargetHasCard(target)) {
      session.turn.phase = "respond";
      session.pendingResponse = {
        ...pending,
        stage: "guixin_select",
        sourceId: target.id,
        iteration: index,
        promptId: `damage:${cursor.promptId}:guixin-select:${index}:${target.id}`,
      };
      return;
    }
    index += 1;
  }
  session.pendingResponse = null;
  consumeLiveDamageOpportunity(session, cursor, "resolve", `guixin:${frame.damageId}:${cursor.opportunityId}`);
  const turned = turnOverLivePlayer(session, actor.id);
  addLog(session, "card", `${actor.id} 完成归心并翻面为${turned.faceUp ? "正面朝上" : "背面朝上"}。`);
  if (session.afterMove.queuedRecoveries.length > 0 || session.afterMove.queuedTriggers.length > 0) {
    offerNextAfterMoveSkill(session);
  } else {
    driveLiveDamageFlow(session, true);
  }
}

function applyStandardSkillAction(
  session: GameSession,
  action: Extract<GameAction, { type: "resolve_standard_skill" }>,
): void {
  if (session.pendingResponse?.type === "standard_judgment") {
    applyStandardJudgmentAction(session, action);
    return;
  }
  const pending = session.pendingResponse;
  if (session.turn.phase !== "respond" || pending?.type !== "standard_skill" || pending.targetId !== action.playerId) {
    ruleError("INVALID_PHASE", "当前没有由你处理的标准技能请求。");
  }
  if (pending.promptId !== action.promptId) ruleError("INVALID_RESPONSE", "技能请求已失效，请按当前请求重新操作。");
  const deadWuhunOwner = pending.skillId === "wuhun" && pending.stage === "wuhun_target";
  const actor = deadWuhunOwner ? getPlayer(session, action.playerId) : getLivingPlayer(session, action.playerId);
  if (deadWuhunOwner && actor.alive) throw new Error("武魂死亡选择者仍处于存活状态。");

  if (pending.leijiDodge && pending.judgment) {
    applyLeijiJudgmentAction(session, pending, action);
    return;
  }

  if (pending.skillId === "wuhun" && pending.stage === "wuhun_target") {
    const death = pending.deathResolution;
    const frame = topDeathFrame(session.completeRules.death);
    if (!death || !frame || frame.frameId !== death.frameId || frame.death.victimId !== actor.id ||
        frame.stage !== "death_triggers" || frame.suspendedByFrameId !== null || death.wuhunResolved === true ||
        pending.sourceId !== actor.id || pending.promptId !== standardPromptId(pending.eventId, "wuhun", actor.id, `target-${frame.frameId}`)) {
      throw new Error("武魂选择续体与当前 DeathStack 不一致。");
    }
    if (!action.activate || !action.targetId || action.cardId !== undefined || action.cardIds !== undefined ||
        action.targetIds !== undefined || action.tokens !== undefined || action.topCardIds !== undefined ||
        action.bottomCardIds !== undefined || action.allocations !== undefined || action.viewAsSkillId !== undefined) {
      ruleError("INVALID_SELECTION", "武魂必须选择一名梦魇标记最多的存活角色。");
    }
    const marked = wuhunMarkedPlayers(session, actor.id);
    const plan = planWuhunDeath({
      ownerId: actor.id,
      deathConfirmed: !actor.alive,
      gameAlreadyFinished: session.status === "finished",
      otherPlayers: marked,
      chosenTargetId: action.targetId,
    });
    if (!plan.ok || !pending.targetIds || plan.value.eligibleTargetIds.length !== pending.targetIds.length ||
        plan.value.eligibleTargetIds.some((playerId, index) => pending.targetIds![index] !== playerId)) {
      ruleError("INVALID_TARGET", plan.ok ? "武魂冻结的最大梦魇目标已被篡改。" : plan.detail);
    }
    beginWuhunJudgment(session, frame, death, action.targetId);
    return;
  }

  if (pending.skillId === "jilue" && pending.stage === "jilue_wansha") {
    const context = jilueContext(session, actor);
    if (session.currentPlayerId !== actor.id || pending.requestedCount !== context.renMarks ||
        pending.promptId !== standardPromptId(pending.eventId, "jilue", actor.id, "wansha") ||
        !context.skillEffective || !context.awakened || context.renMarks < 1 ||
        action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
        action.targetIds !== undefined || action.tokens !== undefined || action.topCardIds !== undefined ||
        action.bottomCardIds !== undefined || action.allocations !== undefined || action.viewAsSkillId !== undefined) {
      ruleError("INVALID_SELECTION", "极略·完杀提示已失效或包含多余选择。");
    }
    if (action.activate) {
      const plan = planJilueWansha({
        context: { ...context, currentPlayerId: session.currentPlayerId, phase: "play" },
        atPlayPhaseStart: true,
        alreadyActiveThisTurn: hasEffectiveSkill(session, actor, "wansha"),
      });
      if (!plan.ok) ruleError("INVALID_SKILL", plan.detail);
      spendJilueRen(session, actor.id);
      grantSkill(session.completeRules.lifecycle, {
        ownerId: actor.id,
        skillId: "wansha",
        sourcePlayerId: actor.id,
        sourceSkillId: "jilue",
        expiry: { type: "turn_end", turnId: session.turn.number },
      });
      addLog(session, "turn", `${actor.id} 消耗 1 枚忍标记发动极略·完杀。`);
    } else {
      addLog(session, "turn", `${actor.id} 未发动极略·完杀。`);
    }
    session.pendingResponse = null;
    session.turn.phase = "play";
    return;
  }

  if (pending.skillId === "qinyin" && pending.stage === "qinyin_choice") {
    const discardedIds = session.turn.discardPhaseHandCardIds ?? [];
    const order = qinyinSeatOrder(session, actor.id);
    if (session.currentPlayerId !== actor.id || !session.turn.discardPhaseStarted ||
        session.turn.qinyinInvoked === true || session.turn.qinyinEventId !== pending.eventId ||
        pending.promptId !== standardPromptId(pending.eventId, "qinyin", actor.id, "choice") ||
        !pending.selectedCardIds || pending.selectedCardIds.length !== discardedIds.length ||
        pending.selectedCardIds.some((cardId, index) => discardedIds[index] !== cardId) ||
        !pending.targetIds || pending.targetIds.length !== order.length ||
        pending.targetIds.some((playerId, index) => order[index]?.id !== playerId)) {
      throw new Error("琴音选择提示与当前弃牌阶段续体不一致。");
    }
    if (action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
        action.targetIds !== undefined || action.topCardIds !== undefined || action.bottomCardIds !== undefined ||
        action.allocations !== undefined || action.viewAsSkillId !== undefined) {
      ruleError("INVALID_SELECTION", "琴音选择不能携带牌或目标。");
    }
    const token = action.tokens?.length === 1 ? action.tokens[0] : null;
    const mode = action.activate
      ? token === "all_recover_one" || token === "all_lose_one_hp" ? token : null
      : action.tokens === undefined ? "decline" as const : null;
    if (mode === null) ruleError("INVALID_SELECTION", "琴音须选择所有角色回复体力、失去体力，或放弃发动。");
    const plan = planQinyin({
      context: { ...godSkillContext(session, actor, "qinyin"), currentPlayerId: actor.id, phase: "discard" },
      alreadyInvokedThisDiscardPhase: false,
      qualifyingDiscardedHandCardIds: discardedIds,
      mode,
      resolutionOrder: order.map((player) => ({ id: player.id, alive: player.alive, hp: player.hp, maxHp: player.maxHp })),
    });
    if (!plan.ok) ruleError("INVALID_SELECTION", plan.detail);
    session.turn.qinyinInvoked = true;
    if (mode === "decline") {
      addLog(session, "card", `${actor.id} 未发动琴音。`);
      finishQinyin(session, actor.id);
      return;
    }
    if (mode === "all_recover_one") {
      const queuedBefore = session.afterMove.queuedRecoveries.length;
      for (const step of plan.value.steps) {
        if (step.operation !== "recover") throw new Error("琴音回复计划包含无效操作。");
        const target = getPlayer(session, step.targetId);
        if (step.actual > 0) recoverLivePlayer(session, target, 1, actor.id, "qinyin");
      }
      addLog(session, "card", `${actor.id} 发动琴音，令所有存活角色各回复 1 点体力。`);
      if (session.afterMove.queuedRecoveries.length === queuedBefore) {
        finishQinyin(session, actor.id);
      } else {
        session.turn.phase = "respond";
        session.pendingResponse = {
          ...pending,
          promptId: standardPromptId(pending.eventId, "qinyin", actor.id, "finish-recovery"),
          mode: "all_recover_one",
          iteration: order.length,
        };
      }
      return;
    }
    addLog(session, "card", `${actor.id} 发动琴音，令所有存活角色依次失去 1 点体力。`);
    continueQinyinHpLoss(session, {
      type: "qinyin",
      ownerId: actor.id,
      eventId: pending.eventId,
      targetIds: order.map((player) => player.id),
      nextTargetIndex: 0,
    });
    return;
  }

  if (pending.skillId === "lianpo" && pending.stage === "lianpo_choice") {
    if (!pending.sourceId) throw new Error("连破回合结束选择缺少结束回合角色。");
    const endedPlayerId = pending.sourceId;
    const armed = session.turn.lianpoArmedOwnerIds ?? [];
    const allParticipants = [...(pending.processedPlayerIds ?? []), ...armed];
    const participantSet = new Set(allParticipants);
    const expectedOrder = [endedPlayerId, ...allOpponentsInSeatOrder(session, endedPlayerId)]
      .filter((playerId) => participantSet.has(playerId));
    if (session.currentPlayerId !== endedPlayerId || session.turn.playerId !== endedPlayerId ||
        armed[0] !== actor.id || !pending.targetIds || armed.length !== pending.targetIds.length + 1 ||
        pending.targetIds.some((playerId, index) => armed[index + 1] !== playerId) ||
        new Set(allParticipants).size !== allParticipants.length || expectedOrder.length !== allParticipants.length ||
        expectedOrder.some((playerId, index) => allParticipants[index] !== playerId) ||
        pending.promptId !== standardPromptId(pending.eventId, "lianpo", actor.id, `choice-turn-${session.turn.number}`)) {
      throw new Error("连破回合结束选择与额外回合队列续体不一致。");
    }
    if (action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
        action.targetIds !== undefined || action.tokens !== undefined || action.topCardIds !== undefined ||
        action.bottomCardIds !== undefined || action.allocations !== undefined || action.viewAsSkillId !== undefined) {
      ruleError("INVALID_SELECTION", "连破选择不能携带牌、目标或其他选项。");
    }
    const endedTurnId = `turn-${session.turn.number}`;
    const plan = planLianpoExtraTurn({
      context: godSkillContext(session, actor, "lianpo"),
      endedTurnId,
      armedTurnId: endedTurnId,
      decision: action.activate ? "take_extra_turn" : "decline",
    });
    if (!plan.ok) ruleError("INVALID_SELECTION", plan.detail);
    if (plan.value.queueExtraTurnForPlayerId !== null) {
      const queuedTurn: QueuedExtraTurn = {
        playerId: plan.value.queueExtraTurnForPlayerId,
        normalTurnAnchorPlayerId: session.turn.normalTurnAnchorPlayerId ?? session.currentPlayerId,
        grantedByTurnId: session.turn.number,
        sourceSkillId: "lianpo",
      };
      session.turn.queuedExtraTurns = [...(session.turn.queuedExtraTurns ?? []), queuedTurn];
      addLog(session, "turn", `${actor.id} 发动连破，将在本回合后获得一个额外回合。`);
    } else {
      addLog(session, "turn", `${actor.id} 未发动连破。`);
    }
    session.turn.lianpoArmedOwnerIds = [...pending.targetIds];
    session.pendingResponse = null;
    offerNextLianpoChoice(session, endedPlayerId, [...(pending.processedPlayerIds ?? []), actor.id]);
    return;
  }

  if (pending.skillId === "wumou" && pending.stage === "wumou_choice") {
    const continuation = pending.wumouContinuation;
    const allowedKeys = new Set(["type", "playerId", "promptId", "activate", "tokens"]);
    if (!continuation || pending.eventId >= session.nextEventId ||
        pending.promptId !== standardPromptId(pending.eventId, "wumou", actor.id, "choice")) {
      throw new Error("无谋选择提示缺少已承诺锦囊续体。");
    }
    if (Object.keys(action).some((key) => !allowedKeys.has(key)) || !action.activate || action.tokens?.length !== 1) {
      ruleError("INVALID_SELECTION", "无谋须且只能选择弃置一枚暴怒标记或失去 1 点体力。");
    }
    assertWumouContinuation(session, actor.id, continuation, pending.eventId);
    const choice = action.tokens[0];
    if (choice !== "remove_rage" && choice !== "lose_hp") {
      ruleError("INVALID_SELECTION", "无谋支付方式无效。");
    }
    const effectiveCardKind = continuation.type === "nullification"
      ? "wu_xie_ke_ji"
      : continuation.cardKind;
    const plan = planWumou({
      context: godSkillContext(session, actor, "wumou"),
      effectiveCardKind,
      effectiveCardCategory: "trick",
      rageMarks: rageMarkCount(session, actor.id),
      choice,
    });
    if (!plan.ok) ruleError(plan.code === "insufficient_marks" ? "INVALID_SELECTION" : "INVALID_SKILL", plan.detail);
    session.pendingResponse = null;
    if (plan.value.rageMarkDelta === -1) {
      spendMarks(session.completeRules.lifecycle, {
        ownerId: actor.id,
        markId: "rage",
        amount: 1,
        sourcePlayerId: actor.id,
        sourceSkillId: "kuangbao",
      });
      addLog(session, "card", `${actor.id} 因无谋移去 1 枚暴怒标记。`);
      completeWumouContinuation(session, actor.id, pending.eventId, continuation);
      return;
    }
    addLog(session, "damage", `${actor.id} 因无谋失去 1 点体力。`);
    const enteredDying = loseHp(session, actor, 1, "因无谋", {
      type: "wumou",
      ownerId: actor.id,
      eventId: pending.eventId,
      continuation: cloneWumouContinuation(continuation),
    });
    if (!enteredDying) completeWumouContinuation(session, actor.id, pending.eventId, continuation);
    return;
  }

  if (pending.skillId === "shenfen" && pending.stage === "shenfen_discard_hand") {
    const continuation = pending.shenfenContinuation;
    const frozenHandCardIds = pending.handCardIds;
    const allowedKeys = new Set(["type", "playerId", "promptId", "activate", "cardIds"]);
    if (!continuation || !frozenHandCardIds ||
        continuation.stage !== "hand" || continuation.nextTargetIndex >= continuation.targetIds.length ||
        continuation.targetIds[continuation.nextTargetIndex] !== actor.id ||
        pending.eventId !== continuation.eventId ||
        pending.promptId !== standardPromptId(
          continuation.eventId,
          "shenfen",
          actor.id,
          `discard-hand-${continuation.nextTargetIndex}`,
        )) {
      throw new Error("神愤弃置手牌提示与冻结游标不一致。");
    }
    assertShenfenContinuation(session, continuation);
    if (frozenHandCardIds.length <= 4 || frozenHandCardIds.length !== actor.hand.length ||
        new Set(frozenHandCardIds).size !== frozenHandCardIds.length ||
        actor.hand.some((card) => !frozenHandCardIds.includes(card.id))) {
      throw new Error("神愤弃置手牌提示与当前手牌不一致。");
    }
    if (Object.keys(action).some((key) => !allowedKeys.has(key)) || !action.activate ||
        action.cardIds?.length !== 4 || new Set(action.cardIds).size !== 4) {
      ruleError("INVALID_SELECTION", "神愤必须弃置四张不同的当前手牌。");
    }
    discardShenfenHandCards(session, actor, action.cardIds);
    session.pendingResponse = null;
    const next = {
      ...cloneShenfenContinuation(continuation),
      nextTargetIndex: continuation.nextTargetIndex + 1,
    };
    advanceShenfenCursor(session, continuation, next);
    pauseShenfenForAfterMove(session, next);
    return;
  }

  if (pending.skillId === "guixin" && (pending.stage === "guixin_invoke" || pending.stage === "guixin_select")) {
    const cursor = pending.damageOpportunity;
    if (!cursor || cursor.ownerId !== actor.id || !pending.targetIds || !Number.isSafeInteger(pending.iteration) ||
        pending.iteration! < 0 || pending.iteration! > pending.targetIds.length ||
        new Set(pending.targetIds).size !== pending.targetIds.length) {
      throw new Error("归心提示缺少冻结座次或 DamageFlow 游标。");
    }
    const frame = assertLiveDamageCursor(session, cursor);
    const processed = new Set(pending.targetIds.slice(0, pending.iteration));
    const allSeatOrder = allOpponentsInSeatOrder(session, actor.id);
    let previousSeatIndex = -1;
    for (const playerId of pending.targetIds) {
      const seatIndex = allSeatOrder.indexOf(playerId);
      if (seatIndex <= previousSeatIndex) throw new Error("归心冻结目标不符合技能拥有者之后的座次顺序。");
      previousSeatIndex = seatIndex;
    }
    const expectedRemaining = allSeatOrder
      .map((playerId) => getPlayer(session, playerId))
      .filter((player) => !processed.has(player.id) && player.alive && guixinTargetHasCard(player))
      .map((player) => player.id);
    const frozenRemaining = pending.targetIds.slice(pending.iteration)
      .filter((playerId) => {
        const player = getPlayer(session, playerId);
        return player.alive && guixinTargetHasCard(player);
      });
    if (frame.damage.targetId !== actor.id || expectedRemaining.length !== frozenRemaining.length ||
        expectedRemaining.some((playerId, index) => frozenRemaining[index] !== playerId)) {
      throw new Error("归心冻结座次与当前未处理角色不一致。");
    }
    if (pending.stage === "guixin_invoke") {
      if (pending.iteration !== 0 || pending.promptId !== `damage:${cursor.promptId}:guixin-invoke` ||
          action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
          action.targetIds !== undefined || action.tokens !== undefined || action.topCardIds !== undefined ||
          action.bottomCardIds !== undefined || action.allocations !== undefined || action.viewAsSkillId !== undefined) {
        ruleError("INVALID_SELECTION", "归心发动选择不能携带牌或目标。");
      }
      if (!action.activate) {
        session.pendingResponse = null;
        consumeLiveDamageOpportunity(session, cursor, "pass", null);
        addLog(session, "damage", `${actor.id} 未发动本点伤害对应的归心。`);
        driveLiveDamageFlow(session, true);
        return;
      }
      advanceGuixinSelection(session, pending, 0);
      return;
    }

    const index = pending.iteration!;
    const victimId = pending.targetIds[index];
    if (!victimId || pending.sourceId !== victimId ||
        pending.promptId !== `damage:${cursor.promptId}:guixin-select:${index}:${victimId}` ||
        !action.activate || action.tokens?.length !== 1 || action.cardId !== undefined ||
        action.cardIds !== undefined || action.targetId !== undefined || action.targetIds !== undefined ||
        action.topCardIds !== undefined || action.bottomCardIds !== undefined ||
        action.allocations !== undefined || action.viewAsSkillId !== undefined) {
      ruleError("INVALID_SELECTION", "归心须从当前角色的手牌、装备区或判定区选择一张牌。");
    }
    const victim = getLivingPlayer(session, victimId);
    const token = action.tokens[0]!;
    let zone: "hand" | "equipment" | "judgment";
    let card: Card | undefined;
    let from: ZoneRef | undefined;
    let anonymousHand = false;
    if (token === "hand") {
      card = victim.hand[0];
      zone = "hand";
      from = { kind: "hand", playerId: victim.id };
      anonymousHand = true;
    } else if (token.startsWith("equipment:")) {
      const slot = token.slice("equipment:".length) as EquipmentSlot;
      card = victim.equipment[slot];
      zone = "equipment";
      from = card && getCardDefinition(card.kind).equipmentSlot === slot
        ? { kind: "equipment", playerId: victim.id, slot }
        : undefined;
    } else if (/^judgment:\d+$/.test(token)) {
      const cardIndex = Number(token.slice("judgment:".length));
      card = victim.judgment[cardIndex];
      zone = "judgment";
      from = { kind: "judgment", playerId: victim.id };
    } else {
      ruleError("INVALID_SELECTION", "归心区域牌令牌无效。");
    }
    if (!card || !from) ruleError("INVALID_CARD", "归心所选牌已不在冻结角色的对应区域。");
    const plan = planGuixinPoint({
      context: { ownerId: actor.id, ownerAlive: actor.alive, skillEffective: hasEffectiveSkill(session, actor, "guixin") },
      decision: "invoke",
      otherPlayers: [{
        id: victim.id,
        alive: victim.alive,
        handCardIds: victim.hand.map((candidate) => candidate.id),
        equipmentCardIds: Object.values(victim.equipment).map((candidate) => candidate.id),
        judgmentCardIds: victim.judgment.map((candidate) => candidate.id),
        selected: { zone, cardId: card.id },
      }],
      ownerFaceUp: actor.faceUp,
    });
    if (!plan.ok || plan.value.gainSteps.length !== 1 ||
        plan.value.gainSteps[0]?.handCardSelectionIsAnonymousServerRandom !== anonymousHand) {
      ruleError("INVALID_CARD", plan.ok ? "归心选牌未生成唯一且符合隐藏区规则的移动。" : plan.detail);
    }
    if (anonymousHand) {
      const generated = randomInteger(session.rng, victim.hand.length);
      session.rng = generated.state;
      card = victim.hand[generated.value];
      if (!card) throw new Error("归心服务器随机手牌索引无效。");
    }
    const lostLastHand = zone === "hand" && victim.hand.length === 1;
    const equipmentSlot = zone === "equipment" ? getCardDefinition(card.kind).equipmentSlot ?? null : null;
    const lostSilverLion = equipmentSlot === "armor" && card.kind === "bai_yin_shi_zi";
    const zones = sessionZoneState(session);
    commitLiveMoveBatch(session, zones.state, {
      batchId: nextMoveBatchId(session),
      intents: [{
        cardIds: [card.id],
        from,
        to: { kind: "hand", playerId: actor.id },
        reason: "skill_effect",
        visibility: zone === "hand" ? "source_and_target" : "public",
        actorId: actor.id,
        sourceId: victim.id,
        targetId: actor.id,
        skillId: "guixin",
      }],
    });
    syncSessionZones(session, zones);
    if (zone === "judgment") {
      const gainedIndex = actor.hand.findIndex((candidate) => candidate.id === card!.id);
      if (gainedIndex < 0) throw new Error("归心判定区牌移动后未进入技能拥有者手牌。");
      actor.hand[gainedIndex] = restoreVirtualOrigin(session, actor.hand[gainedIndex]!);
    }
    if (lostLastHand) enqueueAfterMoveSkill(session, victim, "lianying");
    if (equipmentSlot !== null) enqueueAfterMoveSkill(session, victim, "xiaoji");
    if (lostSilverLion && !armorInvalidatedByWuqian(session, victim.id) && victim.alive && victim.hp < victim.maxHp) {
      recoverLivePlayer(session, victim, 1, victim.id, "bai_yin_shi_zi");
    }
    addLog(session, "card", `${actor.id} 发动归心，从 ${victim.id} 获得了一张牌。`);
    advanceGuixinSelection(session, pending, index + 1);
    if (session.pendingResponse?.type === "standard_skill" && session.pendingResponse.skillId === "guixin" &&
        (session.afterMove.queuedRecoveries.length > 0 || session.afterMove.queuedTriggers.length > 0)) {
      offerNextAfterMoveSkill(session);
    }
    return;
  }

  if (pending.skillId === "gongxin" && pending.stage === "gongxin_choose") {
    if (!pending.sourceId || !pending.selectedCardIds || skillUseCount(session, "gongxin") !== 1) {
      throw new Error("攻心私密选牌续体无效。");
    }
    const target = getLivingPlayer(session, pending.sourceId);
    const frozenIds = pending.selectedCardIds;
    if (frozenIds.length !== target.hand.length || new Set(frozenIds).size !== frozenIds.length ||
        target.hand.some((card) => !frozenIds.includes(card.id))) {
      throw new Error("攻心目标手牌与权威续体不一致。");
    }
    if (action.cardIds !== undefined || action.targetId !== undefined || action.targetIds !== undefined ||
        action.topCardIds !== undefined || action.bottomCardIds !== undefined || action.allocations !== undefined ||
        action.viewAsSkillId !== undefined ||
        (!action.activate && (action.cardId !== undefined || action.tokens !== undefined))) {
      ruleError("INVALID_SELECTION", "攻心只能选择一张有效红桃手牌及其去向，或直接结束。");
    }
    let option: "discard" | "put_on_draw_pile_top" | null = null;
    if (action.activate) {
      const submitted = action.tokens?.length === 1 ? action.tokens[0] : undefined;
      if (!action.cardId || (submitted !== "discard" && submitted !== "put_on_draw_pile_top")) {
        ruleError("INVALID_SELECTION", "攻心选牌后必须选择弃置或置于牌堆顶。");
      }
      option = submitted;
    }
    const plan = planGongxin({
      context: {
        ...godSkillContext(session, actor, "gongxin"),
        currentPlayerId: session.currentPlayerId,
        phase: "play",
      },
      usedThisPlayPhase: false,
      targetId: target.id,
      targetAlive: target.alive,
      targetHand: target.hand.map((card) => ({ id: card.id, effectiveSuit: effectiveCardSuit(session, target, card) })),
      selectedCardId: action.activate ? action.cardId ?? null : null,
      action: option,
    });
    if (!plan.ok) {
      ruleError(plan.code === "invalid_card" ? "INVALID_CARD" : "INVALID_SELECTION", plan.detail);
    }
    session.pendingResponse = null;
    session.turn.phase = "play";
    if (!plan.value.revealedCardId) {
      addLog(session, "card", `${actor.id} 结束攻心，未展示 ${target.id} 的手牌。`);
      return;
    }
    const selected = target.hand.find((card) => card.id === plan.value.revealedCardId);
    if (!selected) throw new Error("攻心选中的目标手牌已经不存在。");
    const lostLastHand = target.hand.length === 1;
    const zones = sessionZoneState(session);
    commitLiveMoveBatch(session, zones.state, {
      batchId: nextMoveBatchId(session),
      intents: [{
        cardIds: [selected.id],
        from: { kind: "hand", playerId: target.id },
        to: plan.value.discardCardId ? { kind: "discard" } : { kind: "deck" },
        ...(plan.value.drawPileTopCardId ? { placement: "deck_top" as const } : {}),
        reason: "skill_effect",
        visibility: "public",
        actorId: actor.id,
        sourceId: actor.id,
        targetId: target.id,
        skillId: "gongxin",
        frameId: pending.eventId,
      }],
    });
    syncSessionZones(session, zones);
    if (lostLastHand) enqueueAfterMoveSkill(session, target, "lianying");
    addLog(
      session,
      "card",
      `${actor.id} 以攻心展示 ${target.id} 的${selected.name}（${suitName(selected.suit)} ${selected.rank}），并将其${plan.value.discardCardId ? "弃置" : "置于牌堆顶"}。`,
    );
    return;
  }

  if (pending.skillId === "jiang" && pending.stage === "jiang_invoke") {
    if (action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
        action.targetIds !== undefined || action.tokens !== undefined || action.viewAsSkillId !== undefined ||
        (pending.slash ? 1 : 0) + (pending.duel ? 1 : 0) + (pending.cardUse ? 1 : 0) !== 1) {
      ruleError("INVALID_SELECTION", "激昂只需选择是否发动。");
    }
    if (action.activate) {
      if (!hasEffectiveSkill(session, actor, "jiang")) ruleError("INVALID_SKILL", "激昂已经失去。");
      const drawn = drawCards(session, actor, 1);
      addLog(session, "card", `${actor.id} 发动激昂，摸了 ${drawn} 张牌。`);
    } else {
      addLog(session, "card", `${actor.id} 未发动激昂。`);
    }
    if (pending.slash) {
      if (!(pending.slash.jiangProcessedPlayerIds ?? []).includes(actor.id)) {
        throw new Error("激昂杀续体未记录当前技能所有者。");
      }
      beginSlashTarget(session, cloneSlashPending(pending.slash));
    } else if (pending.cardUse) {
      const continuation = pending.cardUse!;
      const role = actor.id === continuation.intent.sourceId ? "card_user" as const : "card_target" as const;
      const plan = planJiang({
        ownerId: actor.id,
        ownerAlive: actor.alive,
        skillEffective: hasEffectiveSkill(session, actor, "jiang"),
        targetDesignationSettled: continuation.stage === "targets_confirmed",
        role,
        cardKind: continuation.intent.effectiveKind,
        cardSuit: continuation.intent.suit,
        cardUserId: continuation.intent.sourceId,
        targetIds: continuation.intent.targetIds,
      });
      if (!plan.ok) throw new Error(`激昂决斗续体无效：${plan.detail}`);
      continueCardUse(session, cloneCardUseContinuation(continuation));
    } else {
      const duel = pending.duel!;
      const processed = pending.processedPlayerIds ?? [];
      if (processed.at(-1) !== actor.id) throw new Error("离间激昂当前所有者与处理游标不一致。");
      continueLijianJiang(session, duel, processed);
    }
    return;
  }

  if (pending.skillId === "xiangle" && pending.stage === "xiangle_payment" && pending.slash) {
    const slash = cloneSlashPending(pending.slash);
    const owner = getLivingPlayer(session, slash.targetId);
    const paymentCardId = action.activate ? action.cardId ?? null : null;
    if (action.cardIds !== undefined || action.targetId !== undefined || action.targetIds !== undefined ||
        action.tokens !== undefined || action.viewAsSkillId !== undefined ||
        (!action.activate && action.cardId !== undefined)) {
      ruleError("INVALID_SELECTION", "享乐只能弃置一张基本手牌或放弃支付。");
    }
    const plan = planXiangle({
      ownerId: owner.id,
      ownerAlive: owner.alive,
      skillEffective: hasEffectiveSkill(session, owner, "xiangle"),
      slashTargetConfirmed: slash.targetId === owner.id && (slash.xiangleCheckedPlayerIds ?? []).includes(owner.id),
      slashSourceId: actor.id,
      slashSourceAlive: actor.alive,
      sourceBasicHandCards: actor.hand
        .filter((card) => card.category === "basic")
        .map((card) => mountainRuleCard(session, actor, card, "hand")),
      paymentCardId,
    });
    if (!plan.ok) ruleError("INVALID_CARD", plan.detail);
    if (plan.value.slashEffectInvalidForTarget) {
      addLog(session, "card", `${actor.id} 未为享乐弃置基本牌，此杀对 ${owner.id} 无效。`);
      advanceSlashSequence(session, slash);
      return;
    }
    const payment = removeCard(session, actor, plan.value.discardCardId!);
    session.discardPile.push(payment);
    addLog(session, "card", `${actor.id} 为享乐弃置一张基本牌，此杀继续结算。`);
    beginSlashTarget(session, slash);
    return;
  }

  if (pending.skillId === "tiaoxin" && pending.stage === "tiaoxin_response") {
    if (!action.activate) {
      if (action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
          action.targetIds !== undefined || action.tokens !== undefined || action.viewAsSkillId !== undefined) {
        ruleError("INVALID_SELECTION", "拒绝挑衅时不应提交牌或目标。");
      }
      declineTiaoxin(session, pending);
      return;
    }
    beginTiaoxinSlash(session, pending, action);
    return;
  }

  if (pending.skillId === "tiaoxin" && pending.stage === "tiaoxin_discard") {
    if (!action.activate || action.tokens?.length !== 1 || action.cardId !== undefined || action.cardIds !== undefined ||
        action.targetId !== undefined || action.targetIds !== undefined || action.viewAsSkillId !== undefined || !pending.sourceId) {
      ruleError("INVALID_SELECTION", "挑衅必须弃置目标区域内一张牌。");
    }
    const victim = getLivingPlayer(session, pending.sourceId);
    const token = action.tokens[0]!;
    let discarded: Card | null = null;
    if (token.startsWith("hand:")) {
      const index = Number(token.slice(5));
      const card = Number.isInteger(index) ? victim.hand[index] : undefined;
      if (card) discarded = removeCard(session, victim, card.id);
    } else if (token.startsWith("equipment:")) {
      const slot = token.slice("equipment:".length) as EquipmentSlot;
      if (["weapon", "armor", "offensive_horse", "defensive_horse"].includes(slot) && victim.equipment[slot]) {
        discarded = loseEquipment(session, victim, slot);
      }
    } else if (token.startsWith("judgment:")) {
      const index = Number(token.slice("judgment:".length));
      if (Number.isInteger(index) && index >= 0 && index < victim.judgment.length) {
        const [selected] = victim.judgment.splice(index, 1);
        if (selected) discarded = restoreVirtualOrigin(session, selected);
      }
    }
    if (!discarded) ruleError("INVALID_SELECTION", "挑衅所选区域牌已经不存在。");
    session.discardPile.push(discarded);
    session.pendingResponse = null;
    session.turn.phase = "play";
    addLog(session, "card", `${actor.id} 因挑衅弃置了 ${victim.id} 的${discarded.name}。`);
    return;
  }

  if (pending.skillId === "yingyang" && pending.stage === "yingyang_modify" && pending.pindian) {
    const processed = pending.processedPlayerIds ?? [];
    if (processed.at(-1) !== actor.id || action.cardId !== undefined || action.cardIds !== undefined ||
        action.targetId !== undefined || action.targetIds !== undefined || action.viewAsSkillId !== undefined) {
      ruleError("INVALID_SELECTION", "应扬只能选择点数加三、减三或不修改。");
    }
    assertRevealedPindian(session, pending.pindian, processed);
    const choice = action.activate ? action.tokens?.[0] : "decline";
    if ((action.activate && action.tokens?.length !== 1) || (!action.activate && action.tokens !== undefined) ||
        (choice !== "plus_three" && choice !== "minus_three" && choice !== "decline")) {
      ruleError("INVALID_SELECTION", "应扬选择无效。");
    }
    const revealedRank = pending.pindian.frame.revealedRanks[actor.id];
    if (!revealedRank) throw new Error("应扬续体缺少自己的亮出点数。");
    const plan = applyYingyang({
      ownerId: actor.id,
      ownerAlive: actor.alive,
      skillEffective: hasEffectiveSkill(session, actor, "yingyang"),
      pindianCardRevealed: true,
      revealedRank,
      choice,
    });
    if (!plan.ok) ruleError("INVALID_SKILL", plan.detail);
    const frame = clonePindianFrame(pending.pindian.frame);
    if (plan.value.appliedDelta !== 0) {
      const rankAfter = modifyPindianRank(frame, {
        playerId: actor.id,
        skillId: "yingyang",
        delta: plan.value.appliedDelta,
      });
      if (rankAfter !== plan.value.rankAfter) throw new Error("应扬纯规则与 PindianFrame 修正结果不一致。");
    }
    addLog(session, "card", `${actor.id} ${choice === "decline" ? "未发动应扬" : `发动应扬，将拼点点数调整为 ${plan.value.rankAfter}`}。`);
    continueYingyangPindian(session, { ...pending.pindian, frame }, processed);
    return;
  }

  if (pending.skillId === "zhiba" && pending.stage === "zhiba_accept" && pending.sourceId) {
    if (action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
        action.targetIds !== undefined || action.tokens !== undefined || action.viewAsSkillId !== undefined ||
        actor.role !== "lord" || !hasAwakened(session.completeRules.lifecycle, actor.id, "hunzi")) {
      ruleError("INVALID_SELECTION", "制霸主公只需选择接受或拒绝拼点。");
    }
    const challenger = getLivingPlayer(session, pending.sourceId);
    const request = evaluateZhibaRequest({
      context: {
        actorId: challenger.id,
        currentPlayerId: session.currentPlayerId,
        phase: "play",
        actorAlive: challenger.alive,
        skillEffective: true,
      },
      alreadyRequestedThisPlayPhase: false,
      challengerFaction: factionOf(session, challenger) ?? "god",
      challengerHandCount: challenger.hand.length,
      lordId: actor.id,
      lordAlive: actor.alive,
      lordIsCurrentLord: actor.role === "lord",
      lordSkillEffective: hasEffectiveSkill(session, actor, "zhiba"),
      lordHandCount: actor.hand.length,
      lordAwakened: true,
      lordAccepts: action.activate,
    });
    if (!request.ok) ruleError("INVALID_SKILL", request.detail);
    if (!request.value.accepted) {
      session.pendingResponse = null;
      session.turn.phase = "play";
      addLog(session, "card", `${actor.id} 拒绝了 ${challenger.id} 的制霸请求。`);
      return;
    }
    beginLivePindian(session, challenger, actor, "zhiba", { type: "zhiba" });
    return;
  }

  if (pending.skillId === "zhiba" && pending.stage === "zhiba_gain" && pending.pindian) {
    const pindian = pending.pindian;
    const frame = clonePindianFrame(pindian.frame);
    if (action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
        action.targetIds !== undefined || action.tokens !== undefined || action.viewAsSkillId !== undefined ||
        pindian.continuation.type !== "zhiba" || frame.stage !== "compared" || !frame.result ||
        frame.targetId !== actor.id || frame.result.initiatorWon || actor.role !== "lord" ||
        !hasEffectiveSkill(session, actor, "zhiba") || skillUseCount(session, "zhiba") !== 1) {
      throw new Error("制霸获牌续体与当前拼点不一致。");
    }
    const verificationFrame = clonePindianFrame(frame);
    verificationFrame.stage = "modifying";
    verificationFrame.result = null;
    const verificationPending: PendingPindian = { ...pindian, frame: verificationFrame };
    assertRevealedPindian(session, verificationPending, [frame.initiatorId, frame.targetId]);
    const expectedResult = comparePindian(verificationFrame);
    if (JSON.stringify(expectedResult) !== JSON.stringify(frame.result)) {
      throw new Error("制霸比较结果遭到篡改。");
    }
    const adapted = pindianZoneState(session, frame);
    assertPindianFrame(adapted.state, frame);
    const challengerCardId = frame.selections[frame.initiatorId]!;
    const lordCardId = frame.selections[frame.targetId]!;
    const plan = planZhibaSettlement({
      challengerId: frame.initiatorId,
      lordId: frame.targetId,
      challengerRank: frame.result.initiatorRank,
      lordRank: frame.result.targetRank,
      challengerCardId,
      lordCardId,
      lordChoosesToGain: action.activate,
    });
    if (!plan.ok) throw new Error(plan.detail);
    settlePindianCards(adapted.state, frame, {
      batchId: nextMoveBatchId(session),
      ...(plan.value.destination === "lord_hand" ? {
        destinations: {
          [frame.initiatorId]: { kind: "hand" as const, playerId: actor.id },
          [frame.targetId]: { kind: "hand" as const, playerId: actor.id },
        },
      } : {}),
    });
    syncPindianZones(session, frame, adapted);
    session.pendingResponse = null;
    session.turn.phase = "play";
    addLog(session, "card", action.activate
      ? `${actor.id} 获得了制霸拼点的两张牌。`
      : `${actor.id} 放弃获得制霸拼点牌，两张牌进入弃牌堆。`);
    return;
  }

  if (pending.skillId === "tuntian" && pending.stage === "tuntian_invoke") {
    if (!pending.moveBatchId || !pending.selectedCardIds?.length ||
        new Set(pending.selectedCardIds).size !== pending.selectedCardIds.length ||
        pending.promptId !== `skill:${pending.eventId}:tuntian:${actor.id}:${pending.moveBatchId}` ||
        session.currentPlayerId === actor.id || !hasEffectiveSkill(session, actor, "tuntian")) {
      throw new Error("屯田判定提示与失牌批次不一致。");
    }
    if (action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
        action.targetIds !== undefined || action.tokens !== undefined || action.viewAsSkillId !== undefined) {
      ruleError("INVALID_SELECTION", "屯田只需选择是否发动。");
    }
    if (!action.activate) {
      session.pendingResponse = null;
      addLog(session, "card", `${actor.id} 未发动屯田。`);
      offerNextAfterMoveSkill(session);
      return;
    }
    if (session.deck.length === 0 && session.discardPile.length === 0) {
      ruleError("INVALID_SKILL", "牌堆和弃牌堆均无牌，不能发动屯田判定。");
    }
    beginStandardJudgment(
      session,
      actor,
      { type: "skill", id: "tuntian" },
      {},
      { type: "tuntian", ownerId: actor.id, moveBatchId: pending.moveBatchId },
    );
    return;
  }

  if (pending.skillId === "zhiji" && pending.stage === "zhiji_choice") {
    const choice = action.tokens?.[0];
    if (!action.activate || action.tokens?.length !== 1 ||
        (choice !== "recover_one" && choice !== "draw_two") ||
        action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
        action.targetIds !== undefined || action.viewAsSkillId !== undefined ||
        !hasEffectiveSkill(session, actor, "zhiji") ||
        hasAwakened(session.completeRules.lifecycle, actor.id, "zhiji")) {
      ruleError("INVALID_SELECTION", "志继必须选择回复 1 点体力或摸两张牌。");
    }
    const plan = planZhiji({
      ownerId: actor.id,
      currentPlayerId: session.currentPlayerId,
      atPreparePhaseStart: true,
      ownerAlive: actor.alive,
      skillEffective: true,
      alreadyAwakened: false,
      handCount: actor.hand.length,
      hp: actor.hp,
      maxHp: actor.maxHp,
      choice,
    });
    if (!plan.ok) ruleError("INVALID_SELECTION", plan.detail);
    if (plan.value.drawCount > 0) {
      const drawn = drawCards(session, actor, plan.value.drawCount);
      addLog(session, "card", `${actor.id} 因志继摸了 ${drawn} 张牌。`);
    } else {
      actor.hp = Math.min(actor.maxHp, actor.hp + plan.value.recoverBeforeMaxHpLoss);
      addLog(session, "card", `${actor.id} 因志继回复 1 点体力。`);
    }
    actor.maxHp = plan.value.maxHpAfter;
    actor.hp = plan.value.hpAfter;
    applyAwakeningGrant(session, actor, "zhiji", plan.value.grantSkillIds, pending.eventId);
    addLog(session, "turn", `${actor.id} 的志继觉醒，减 1 点体力上限并获得观星。`);
    continuePrepareAwakenings(session, actor);
    return;
  }

  if (pending.skillId === "fangquan" && pending.stage === "fangquan_skip") {
    if (pending.promptId !== standardPromptId(pending.eventId, "fangquan", actor.id, "skip") ||
        session.currentPlayerId !== actor.id || session.turn.fangquanSkippedPlay || session.turn.skipPlay ||
        action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
        action.targetIds !== undefined || action.tokens !== undefined || action.viewAsSkillId !== undefined) {
      ruleError("INVALID_SELECTION", "放权替代出牌阶段时只需选择是否发动。");
    }
    if (!action.activate) {
      session.pendingResponse = null;
      addLog(session, "turn", `${actor.id} 未发动放权。`);
      continueBeforePlayAfterFangquan(session, actor);
      return;
    }
    const plan = planFangquanSkip({
      ownerId: actor.id,
      currentPlayerId: session.currentPlayerId,
      ownerAlive: actor.alive,
      skillEffective: hasEffectiveSkill(session, actor, "fangquan"),
      atPlayPhaseBefore: true,
      turnId: session.turn.number,
    });
    if (!plan.ok) ruleError("INVALID_SKILL", plan.detail);
    session.pendingResponse = null;
    session.turn.fangquanSkippedPlay = true;
    session.turn.skipPlay = plan.value.skipPlayPhase;
    addLog(session, "turn", `${actor.id} 发动放权，跳过出牌阶段。`);
    enterDiscardOrEnd(session);
    return;
  }

  if (pending.skillId === "fangquan" && pending.stage === "fangquan_finish") {
    const frozenHandIds = pending.selectedCardIds ?? [];
    const frozenTargetIds = pending.targetIds ?? [];
    const liveTargetIds = session.players
      .filter((candidate) => candidate.alive && candidate.id !== actor.id)
      .map((candidate) => candidate.id);
    if (!session.turn.fangquanSkippedPlay || session.currentPlayerId !== actor.id ||
        pending.promptId !== standardPromptId(pending.eventId, "fangquan", actor.id, "finish") ||
        frozenHandIds.length !== actor.hand.length || frozenHandIds.some((cardId, index) => actor.hand[index]?.id !== cardId) ||
        frozenTargetIds.length !== liveTargetIds.length || frozenTargetIds.some((playerId, index) => liveTargetIds[index] !== playerId)) {
      throw new Error("放权回合结束提示与冻结手牌或目标不一致。");
    }
    if (!action.activate) {
      if (action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
          action.targetIds !== undefined || action.tokens !== undefined || action.viewAsSkillId !== undefined) {
        ruleError("INVALID_SELECTION", "放弃放权额外回合时不应提交牌或目标。");
      }
      const plan = planFangquanEnd({
        ownerId: actor.id,
        ownerAlive: actor.alive,
        atOwnerTurnEnd: true,
        turnId: session.turn.number,
        markedTurnId: session.turn.number,
        discardHandCard: null,
        extraTurnTarget: null,
      });
      if (!plan.ok) throw new Error(plan.detail);
      session.turn.fangquanSkippedPlay = false;
      addLog(session, "turn", `${actor.id} 放弃了放权的额外回合。`);
      completeTurn(session, actor);
      return;
    }
    if (!action.cardId || !action.targetId || action.cardIds !== undefined || action.targetIds !== undefined ||
        action.tokens !== undefined || action.viewAsSkillId !== undefined) {
      ruleError("INVALID_SELECTION", "放权须弃置一张手牌并选择一名其他角色。");
    }
    const card = actor.hand.find((candidate) => candidate.id === action.cardId);
    const target = session.players.find((candidate) => candidate.id === action.targetId);
    if (!card) ruleError("INVALID_CARD", "放权弃置牌已不在手牌中。");
    if (!target) ruleError("INVALID_TARGET", "放权目标不在本局中。");
    const plan = planFangquanEnd({
      ownerId: actor.id,
      ownerAlive: actor.alive,
      atOwnerTurnEnd: true,
      turnId: session.turn.number,
      markedTurnId: session.turn.number,
      discardHandCard: mountainRuleCard(session, actor, card, "hand"),
      extraTurnTarget: { playerId: target.id, alive: target.alive },
    });
    if (!plan.ok) {
      const { code, detail } = plan;
      ruleError(code === "invalid_card" ? "INVALID_CARD" : "INVALID_TARGET", detail);
      throw new Error(detail);
    }
    if (!plan.value.grantExtraTurn) throw new Error("已提交放权费用却未生成额外回合。");
    const normalTurnAnchorPlayerId = session.turn.normalTurnAnchorPlayerId ?? actor.id;
    const queuedTurn: QueuedExtraTurn = {
      playerId: plan.value.targetId,
      normalTurnAnchorPlayerId,
      grantedByTurnId: plan.value.queuedTurn.grantedByTurnId,
      sourceSkillId: "fangquan",
    };
    session.turn.queuedExtraTurns = [...(session.turn.queuedExtraTurns ?? []), queuedTurn];
    session.turn.fangquanSkippedPlay = false;
    const triggerCountBefore = session.afterMove.queuedTriggers.length;
    const discarded = removeCard(session, actor, plan.value.discardCardId);
    session.discardPile.push(discarded);
    addLog(session, "turn", `${actor.id} 发动放权，${plan.value.targetId} 将在本回合后获得一个额外回合。`);
    if (session.afterMove.queuedTriggers.length > triggerCountBefore) {
      session.turn.phase = "respond";
      session.pendingResponse = {
        type: "standard_skill",
        targetId: actor.id,
        promptId: standardPromptId(pending.eventId, "fangquan", actor.id, "complete"),
        eventId: pending.eventId,
        skillId: "fangquan",
        stage: "fangquan_complete",
      };
      offerNextAfterMoveSkill(session);
      return;
    }
    completeTurn(session, actor);
    return;
  }

  if (pending.skillId === "qiaobian" && pending.stage === "qiaobian_skip") {
    const phase = pending.phase;
    if (!phase || pending.promptId !== standardPromptId(pending.eventId, "qiaobian", actor.id, phase) ||
        session.currentPlayerId !== actor.id) {
      throw new Error("巧变阶段替代提示与当前回合不一致。");
    }
    if (!action.activate) {
      if (action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
          action.targetIds !== undefined || action.tokens !== undefined || action.viewAsSkillId !== undefined) {
        ruleError("INVALID_SELECTION", "放弃巧变时不应提交牌或目标。");
      }
      session.pendingResponse = null;
      addLog(session, "turn", `${actor.id} 未在当前阶段发动巧变。`);
      continueUnskippedQiaobianPhase(session, actor, phase);
      return;
    }
    if (!action.cardId || action.cardIds !== undefined || action.targetId !== undefined ||
        action.targetIds !== undefined || action.tokens !== undefined || action.viewAsSkillId !== undefined) {
      ruleError("INVALID_SELECTION", "巧变须弃置一张手牌作为阶段替代费用。");
    }
    const card = actor.hand.find((candidate) => candidate.id === action.cardId);
    if (!card) ruleError("INVALID_CARD", "巧变费用牌已不在手牌中。");
    const plan = evaluateQiaobianSkip({
      ownerId: actor.id,
      currentPlayerId: session.currentPlayerId,
      ownerAlive: actor.alive,
      skillEffective: hasEffectiveSkill(session, actor, "qiaobian"),
      atPhaseBefore: true,
      phase,
      phaseInstanceId: qiaobianPhaseInstanceId(session, phase),
      alreadyUsedForPhaseInstance: false,
      discardHandCard: mountainRuleCard(session, actor, card, "hand"),
    });
    if (!plan.ok) ruleError(plan.code === "invalid_card" ? "INVALID_CARD" : "INVALID_SKILL", plan.detail);
    const triggerCountBefore = session.afterMove.queuedTriggers.length;
    const recoveryCountBefore = session.afterMove.queuedRecoveries.length;
    session.discardPile.push(removeCard(session, actor, plan.value.discardCardId));
    if (phase === "draw") session.turn.skipDraw = true;
    if (phase === "play") session.turn.skipPlay = true;
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: actor.id,
      promptId: standardPromptId(pending.eventId, "qiaobian", actor.id, "after-cost"),
      eventId: pending.eventId,
      skillId: "qiaobian",
      stage: "qiaobian_after_cost",
      phase,
      selectedCardIds: [plan.value.discardCardId],
    };
    addLog(session, "turn", `${actor.id} 发动巧变，弃置一张手牌并跳过当前阶段。`);
    if (session.afterMove.queuedTriggers.length > triggerCountBefore ||
        session.afterMove.queuedRecoveries.length > recoveryCountBefore) {
      offerNextAfterMoveSkill(session);
      return;
    }
    continueQiaobianAfterCost(session, actor, phase, pending.eventId);
    return;
  }

  if (pending.skillId === "qiaobian" && pending.stage === "qiaobian_draw") {
    const phase = pending.phase;
    const expectedTargetIds = livingOpponentsInSeatOrder(session, actor.id)
      .filter((target) => target.hand.length > 0)
      .map((target) => target.id);
    if (phase !== "draw" || session.currentPlayerId !== actor.id ||
        pending.promptId !== standardPromptId(pending.eventId, "qiaobian", actor.id, "draw") ||
        !pending.targetIds || pending.targetIds.length !== expectedTargetIds.length ||
        pending.targetIds.some((playerId, index) => expectedTargetIds[index] !== playerId)) {
      throw new Error("巧变摸牌替代提示与当前手牌目标不一致。");
    }
    if (!action.activate) {
      if (action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
          action.targetIds !== undefined || action.tokens !== undefined || action.viewAsSkillId !== undefined) {
        ruleError("INVALID_SELECTION", "放弃巧变取牌时不应提交牌或目标。");
      }
      addLog(session, "card", `${actor.id} 未因巧变获得其他角色的手牌。`);
      finishQiaobianReplacement(session, actor, phase);
      return;
    }
    if (!action.tokens || action.tokens.length < 1 || action.tokens.length > 2 ||
        action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
        action.targetIds !== undefined || action.viewAsSkillId !== undefined) {
      ruleError("INVALID_SELECTION", "巧变摸牌替代须选择一至两名不同角色的各一张暗置手牌。");
    }
    const selections = action.tokens.map((token) => {
      const match = /^hand:(\d+):(\d+)$/.exec(token);
      const seat = match ? Number(match[1]) : Number.NaN;
      const index = match ? Number(match[2]) : Number.NaN;
      const target = session.players.find((candidate) => candidate.seat === seat);
      const handCard = target && Number.isInteger(index) ? target.hand[index] : undefined;
      if (!target || !handCard || !pending.targetIds!.includes(target.id)) {
        ruleError("INVALID_SELECTION", "巧变所选暗置手牌位置无效。");
      }
      return {
        target,
        handCard,
        ruleSelection: {
          targetId: target.id,
          targetAlive: target.alive,
          handCard: mountainRuleCard(session, target, handCard, "hand"),
        },
      };
    });
    if (new Set(selections.map((selection) => selection.target.id)).size !== selections.length) {
      ruleError("INVALID_SELECTION", "巧变摸牌替代不能从同一名角色处取两张牌。");
    }
    const plan = planQiaobianDraw({ ownerId: actor.id, selections: selections.map((selection) => selection.ruleSelection) });
    if (!plan.ok) ruleError("INVALID_SELECTION", plan.detail);
    const emptiedOwnerIds = selections.filter((selection) => selection.target.hand.length === 1)
      .map((selection) => selection.target.id);
    const triggerCountBefore = session.afterMove.queuedTriggers.length;
    const recoveryCountBefore = session.afterMove.queuedRecoveries.length;
    const zones = sessionZoneState(session);
    commitLiveMoveBatch(session, zones.state, {
      batchId: nextMoveBatchId(session),
      intents: plan.value.gains.map((gain) => ({
        cardIds: [gain.cardId],
        from: { kind: "hand", playerId: gain.fromPlayerId },
        to: { kind: "hand", playerId: actor.id },
        reason: "skill_effect",
        visibility: "source_and_target",
        actorId: actor.id,
        sourceId: gain.fromPlayerId,
        targetId: actor.id,
        skillId: "qiaobian",
      })),
    });
    syncSessionZones(session, zones);
    for (const ownerId of emptiedOwnerIds) enqueueAfterMoveSkill(session, getPlayer(session, ownerId), "lianying");
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: actor.id,
      promptId: standardPromptId(pending.eventId, "qiaobian", actor.id, "finish-draw"),
      eventId: pending.eventId,
      skillId: "qiaobian",
      stage: "qiaobian_finish",
      phase,
    };
    addLog(session, "card", `${actor.id} 因巧变获得了 ${plan.value.gains.length} 张其他角色的手牌。`);
    if (session.afterMove.queuedTriggers.length > triggerCountBefore ||
        session.afterMove.queuedRecoveries.length > recoveryCountBefore) {
      offerNextAfterMoveSkill(session);
      return;
    }
    finishQiaobianReplacement(session, actor, phase);
    return;
  }

  if (pending.skillId === "qiaobian" && pending.stage === "qiaobian_play") {
    const phase = pending.phase;
    const candidates = qiaobianTableCards(session, actor);
    const expectedCardIds = candidates.map((candidate) => candidate.card.id);
    const expectedTargetIds = [...new Set(candidates.flatMap((candidate) => candidate.targetIds))];
    if (phase !== "play" || session.currentPlayerId !== actor.id ||
        pending.promptId !== standardPromptId(pending.eventId, "qiaobian", actor.id, "play") ||
        !pending.selectedCardIds || !pending.targetIds ||
        pending.selectedCardIds.length !== expectedCardIds.length ||
        pending.selectedCardIds.some((cardId, index) => expectedCardIds[index] !== cardId) ||
        pending.targetIds.length !== expectedTargetIds.length ||
        pending.targetIds.some((playerId, index) => expectedTargetIds[index] !== playerId)) {
      throw new Error("巧变出牌替代提示与当前场上可移动牌不一致。");
    }
    if (!action.activate) {
      if (action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
          action.targetIds !== undefined || action.tokens !== undefined || action.viewAsSkillId !== undefined) {
        ruleError("INVALID_SELECTION", "放弃巧变移牌时不应提交牌或目标。");
      }
      addLog(session, "card", `${actor.id} 未因巧变移动场上的牌。`);
      finishQiaobianReplacement(session, actor, phase);
      return;
    }
    if (!action.cardId || !action.targetId || action.cardIds !== undefined || action.targetIds !== undefined ||
        action.tokens !== undefined || action.viewAsSkillId !== undefined) {
      ruleError("INVALID_SELECTION", "巧变出牌替代须选择一张场上牌及其合法新持有者。");
    }
    const selected = candidates.find((candidate) => candidate.card.id === action.cardId);
    const destination = session.players.find((candidate) => candidate.id === action.targetId);
    if (!selected) ruleError("INVALID_CARD", "巧变所选场上牌已经不可移动。");
    if (!destination) ruleError("INVALID_TARGET", "巧变移牌目标不在本局中。");
    const plan = planQiaobianTableMove({
      ownerId: actor.id,
      sourceId: selected.source.id,
      sourceAlive: selected.source.alive,
      card: mountainRuleCard(session, selected.source, selected.card, selected.zone),
      destination: qiaobianTableDestination(destination),
    });
    if (!plan.ok) ruleError(plan.code === "invalid_card" ? "INVALID_CARD" : "INVALID_TARGET", plan.detail);
    const triggerCountBefore = session.afterMove.queuedTriggers.length;
    const recoveryCountBefore = session.afterMove.queuedRecoveries.length;
    const zones = sessionZoneState(session);
    const from: ZoneRef = selected.zone === "equipment"
      ? { kind: "equipment", playerId: selected.source.id, slot: selected.equipmentSlot! }
      : { kind: "judgment", playerId: selected.source.id };
    const to: ZoneRef = selected.zone === "equipment"
      ? { kind: "equipment", playerId: destination.id, slot: selected.equipmentSlot! }
      : { kind: "judgment", playerId: destination.id };
    commitLiveMoveBatch(session, zones.state, {
      batchId: nextMoveBatchId(session),
      intents: [{
        cardIds: [selected.card.id],
        from,
        to,
        reason: "skill_effect",
        visibility: "public",
        actorId: actor.id,
        sourceId: selected.source.id,
        targetId: destination.id,
        skillId: "qiaobian",
      }],
    });
    syncSessionZones(session, zones);
    if (selected.zone === "equipment") {
      enqueueAfterMoveSkill(session, selected.source, "xiaoji");
      if (selected.card.kind === "bai_yin_shi_zi" && !armorInvalidatedByWuqian(session, selected.source.id) &&
          selected.source.alive && selected.source.hp < selected.source.maxHp) {
        recoverLivePlayer(session, selected.source, 1, selected.source.id, "bai_yin_shi_zi");
        addLog(session, "card", `${selected.source.id} 失去白银狮子，回复了 1 点体力。`);
      }
    }
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "standard_skill",
      targetId: actor.id,
      promptId: standardPromptId(pending.eventId, "qiaobian", actor.id, "finish-play"),
      eventId: pending.eventId,
      skillId: "qiaobian",
      stage: "qiaobian_finish",
      phase,
    };
    addLog(session, "card", `${actor.id} 因巧变将 ${selected.source.id} 场上的一张牌移动给 ${destination.id}。`);
    if (session.afterMove.queuedTriggers.length > triggerCountBefore ||
        session.afterMove.queuedRecoveries.length > recoveryCountBefore) {
      offerNextAfterMoveSkill(session);
      return;
    }
    finishQiaobianReplacement(session, actor, phase);
    return;
  }

  if (pending.skillId === "guzheng" && pending.stage === "guzheng_claim") {
    if (!pending.sourceId || !pending.selectedCardIds?.length || !pending.processedPlayerIds || !pending.targetIds ||
        new Set(pending.selectedCardIds).size !== pending.selectedCardIds.length) {
      throw new Error("固政提示缺少冻结弃牌记录或发动顺序。");
    }
    const discarder = getLivingPlayer(session, pending.sourceId);
    const expectedOwnerIds = livingOpponentsInSeatOrder(session, discarder.id)
      .filter((candidate) => hasEffectiveSkill(session, candidate, "guzheng"))
      .map((candidate) => candidate.id);
    const actualOwnerIds = [...pending.processedPlayerIds, actor.id, ...pending.targetIds];
    const liveRecordedIds = remainingGuzhengCardIds(session, session.turn.discardPhaseHandCardIds ?? []);
    if (!session.turn.discardPhaseStarted || session.currentPlayerId !== discarder.id || actor.id === discarder.id ||
        pending.promptId !== standardPromptId(pending.eventId, "guzheng", actor.id, `claim-${pending.processedPlayerIds.length}`) ||
        expectedOwnerIds.length !== actualOwnerIds.length ||
        expectedOwnerIds.some((playerId, index) => actualOwnerIds[index] !== playerId) ||
        liveRecordedIds.length !== pending.selectedCardIds.length ||
        liveRecordedIds.some((cardId, index) => pending.selectedCardIds![index] !== cardId)) {
      throw new Error("固政提示与实际弃牌阶段或座次顺序不一致。");
    }
    if (!action.activate) {
      if (action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
          action.targetIds !== undefined || action.tokens !== undefined || action.viewAsSkillId !== undefined) {
        ruleError("INVALID_SELECTION", "放弃固政时不应提交牌或目标。");
      }
      addLog(session, "card", `${actor.id} 未发动固政。`);
      session.pendingResponse = null;
      advanceGuzheng(
        session,
        discarder,
        pending.eventId,
        pending.selectedCardIds,
        [...pending.processedPlayerIds, actor.id],
        pending.targetIds,
      );
      return;
    }
    if (!action.cardId || action.cardIds !== undefined || action.targetId !== undefined ||
        action.targetIds !== undefined || action.tokens !== undefined || action.viewAsSkillId !== undefined) {
      ruleError("INVALID_SELECTION", "发动固政时须选择一张本阶段弃置的手牌返还。");
    }
    const records = pending.selectedCardIds.map((cardId) => {
      const card = session.discardPile.find((candidate) => candidate.id === cardId);
      if (!card) throw new Error("固政冻结的弃牌已经不在弃牌堆。");
      return {
        card: mountainRuleCard(session, discarder, card, "discard"),
        discardedById: discarder.id,
        enteredDuringDiscardPhase: true,
        fromHand: true,
        stillInDiscardPile: true,
      } as const;
    });
    const plan = planGuzheng({
      ownerId: actor.id,
      ownerAlive: actor.alive,
      skillEffective: hasEffectiveSkill(session, actor, "guzheng"),
      atOtherDiscardPhaseEnd: true,
      discardPhaseOwnerId: discarder.id,
      discardPhaseOwnerAlive: discarder.alive,
      records,
      returnCardId: action.cardId,
    });
    if (!plan.ok) ruleError("INVALID_CARD", plan.detail);
    const intents: MoveIntent[] = [
      {
        cardIds: [plan.value.returnToDiscarderCardId],
        from: { kind: "discard" },
        to: { kind: "hand", playerId: discarder.id },
        reason: "skill_effect",
        visibility: "public",
        actorId: actor.id,
        sourceId: actor.id,
        targetId: discarder.id,
        skillId: "guzheng",
      },
      ...(plan.value.gainCardIds.length > 0 ? [{
        cardIds: [...plan.value.gainCardIds],
        from: { kind: "discard" as const },
        to: { kind: "hand" as const, playerId: actor.id },
        reason: "skill_effect" as const,
        visibility: "public" as const,
        actorId: actor.id,
        sourceId: actor.id,
        targetId: actor.id,
        skillId: "guzheng" as const,
      }] : []),
    ];
    const zones = sessionZoneState(session);
    commitLiveMoveBatch(session, zones.state, { batchId: nextMoveBatchId(session), intents });
    syncSessionZones(session, zones);
    session.pendingResponse = null;
    clearDiscardPhaseHistory(session);
    addLog(session, "card", `${actor.id} 发动固政，令 ${discarder.id} 收回一张牌并获得其余 ${plan.value.gainCardIds.length} 张牌。`);
    enterEndPhase(session);
    return;
  }

  if (pending.skillId === "qixing" &&
      (pending.stage === "qixing_initial" || pending.stage === "qixing_exchange")) {
    if (!pending.handCardIds || !pending.starCardIds || !qixingInitialized(session, actor) ||
        action.cardId !== undefined || action.targetId !== undefined || action.targetIds !== undefined ||
        action.tokens !== undefined || action.topCardIds !== undefined || action.bottomCardIds !== undefined ||
        action.allocations !== undefined || action.viewAsSkillId !== undefined ||
        (pending.stage === "qixing_initial" && !action.activate) || (!action.activate && action.cardIds !== undefined)) {
      ruleError("INVALID_SELECTION", "七星只能提交等量的手牌与星进行交换；初始交换不可取消。");
    }
    const stars = actor.extraPiles[QIXING_PILE_ID] ?? [];
    const exactSnapshot = (cards: readonly Card[], frozenIds: readonly CardId[]): boolean =>
      cards.length === frozenIds.length && new Set(frozenIds).size === frozenIds.length &&
      cards.every((card) => frozenIds.includes(card.id));
    if (!exactSnapshot(actor.hand, pending.handCardIds) || !exactSnapshot(stars, pending.starCardIds)) {
      throw new Error("七星私有牌堆与权威交换续体不一致。");
    }
    const selected = action.activate ? action.cardIds ?? [] : [];
    const allFrozenIds = new Set([...pending.handCardIds, ...pending.starCardIds]);
    if (new Set(selected).size !== selected.length || selected.some((cardId) => !allFrozenIds.has(cardId))) {
      ruleError("INVALID_SELECTION", "七星选择包含重复或不属于当前手牌与星的牌。");
    }
    const handCardIdsToStars = selected.filter((cardId) => pending.handCardIds!.includes(cardId));
    const starCardIdsToHand = selected.filter((cardId) => pending.starCardIds!.includes(cardId));
    let finalHandCardIds: readonly CardId[];
    let finalStarCardIds: readonly CardId[];
    if (pending.stage === "qixing_initial") {
      const plan = planQixingInitial({
        context: godSkillContext(session, actor, "qixing"),
        initialHandCardIds: pending.handCardIds,
        topSevenCardIds: pending.starCardIds,
        handCardIdsToStars,
        starCardIdsToHand,
      });
      if (!plan.ok) ruleError("INVALID_SELECTION", plan.detail);
      finalHandCardIds = plan.value.finalHandCardIds;
      finalStarCardIds = plan.value.finalStarCardIds;
    } else {
      const plan = planQixingExchange({
        context: {
          ...godSkillContext(session, actor, "qixing"),
          currentPlayerId: session.currentPlayerId,
          phase: "draw",
        },
        drawPhaseOccurred: true,
        handCardIds: pending.handCardIds,
        starCardIds: pending.starCardIds,
        handCardIdsToStars,
        starCardIdsToHand,
      });
      if (!plan.ok) ruleError("INVALID_SELECTION", plan.detail);
      finalHandCardIds = plan.value.finalHandCardIds;
      finalStarCardIds = plan.value.finalStarCardIds;
    }
    if (handCardIdsToStars.length > 0) {
      const zones = sessionZoneState(session);
      const intents: MoveIntent[] = [
        {
          cardIds: handCardIdsToStars,
          from: { kind: "hand", playerId: actor.id },
          to: { kind: "extra", playerId: actor.id, pileId: QIXING_PILE_ID },
          reason: "skill_effect",
          visibility: "owner",
          actorId: actor.id,
          sourceId: actor.id,
          targetId: actor.id,
          skillId: "qixing",
          frameId: pending.eventId,
        },
        {
          cardIds: starCardIdsToHand,
          from: { kind: "extra", playerId: actor.id, pileId: QIXING_PILE_ID },
          to: { kind: "hand", playerId: actor.id },
          reason: "skill_effect",
          visibility: "owner",
          actorId: actor.id,
          sourceId: actor.id,
          targetId: actor.id,
          skillId: "qixing",
          frameId: pending.eventId,
        },
      ];
      commitMoveBatch(zones.state, { batchId: nextMoveBatchId(session), intents });
      syncSessionZones(session, zones);
    }
    if (!exactSnapshot(actor.hand, finalHandCardIds) ||
        !exactSnapshot(actor.extraPiles[QIXING_PILE_ID] ?? [], finalStarCardIds)) {
      throw new Error("七星原子交换后的私有牌堆与规则计划不一致。");
    }
    session.pendingResponse = null;
    addLog(session, "card", `${actor.id} 完成七星交换，共交换 ${handCardIdsToStars.length} 张牌。`);
    if (pending.stage === "qixing_initial") continueGameStartSkills(session);
    else enterBeforePlayPhase(session, actor);
    return;
  }

  if ((pending.skillId === "kuangfeng" && pending.stage === "kuangfeng_choice") ||
      (pending.skillId === "dawu" && pending.stage === "dawu_choice")) {
    const skillId = pending.skillId;
    const stars = actor.extraPiles[QIXING_PILE_ID] ?? [];
    const frozenStarIds = pending.starCardIds ?? [];
    const frozenTargetIds = pending.targetIds ?? [];
    const currentTargetIds = session.players.filter((player) => player.alive).map((player) => player.id);
    if (session.currentPlayerId !== actor.id || pending.promptId !== standardPromptId(pending.eventId, skillId, actor.id, "choice") ||
        session.turn.phase !== "respond" || frozenStarIds.length === 0 ||
        stars.length !== frozenStarIds.length || new Set(frozenStarIds).size !== frozenStarIds.length ||
        stars.some((entry) => !frozenStarIds.includes(entry.id)) ||
        frozenTargetIds.length !== currentTargetIds.length || new Set(frozenTargetIds).size !== frozenTargetIds.length ||
        frozenTargetIds.some((playerId, index) => playerId !== currentTargetIds[index]) ||
        action.topCardIds !== undefined || action.bottomCardIds !== undefined ||
        action.allocations !== undefined || action.viewAsSkillId !== undefined) {
      throw new Error("七星天气提示与当前结束阶段或私有星牌不一致。");
    }
    if (!action.activate) {
      if (action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
          action.targetIds !== undefined || action.tokens !== undefined) {
        ruleError("INVALID_SELECTION", "放弃七星天气时不应提交牌或目标。");
      }
      addLog(session, "turn", `${actor.id} 未发动${skillId === "kuangfeng" ? "狂风" : "大雾"}。`);
      if (skillId === "kuangfeng") continueEndPhaseAfterKuangfeng(session);
      else continueEndPhaseAfterDawu(session);
      return;
    }
    if (skillId === "kuangfeng") {
      if (!action.cardId || !action.targetId || action.cardIds !== undefined || action.targetIds !== undefined ||
          action.tokens !== undefined) {
        ruleError("INVALID_SELECTION", "狂风须选择一张星和一名存活角色。");
      }
      const target = session.players.find((player) => player.id === action.targetId);
      if (!target || !frozenTargetIds.includes(target.id)) ruleError("INVALID_TARGET", "狂风目标不在冻结目标中。");
      const plan = planKuangfeng({
        context: {
          ...godSkillContext(session, actor, "kuangfeng"),
          currentPlayerId: session.currentPlayerId,
          phase: "end",
        },
        starCardIds: frozenStarIds,
        selectedStarCardId: action.cardId,
        targetId: target.id,
        targetAlive: target.alive,
      });
      if (!plan.ok) ruleError(plan.code === "invalid_target" || plan.code === "target_dead" ? "INVALID_TARGET" : "INVALID_SELECTION", plan.detail);
      discardQixingStars(session, actor, plan.value.discardStarCardIds, "kuangfeng", pending.eventId);
      addQixingWeatherEffect(session, actor.id, plan.value.targetId, "kuangfeng");
      addLog(session, "turn", `${actor.id} 发动狂风，令 ${plan.value.targetId} 获得狂风状态。`);
      continueEndPhaseAfterKuangfeng(session);
      return;
    }
    if (!action.cardIds || !action.targetIds || action.cardIds.length === 0 ||
        action.cardId !== undefined || action.targetId !== undefined || action.tokens !== undefined ||
        action.targetIds.some((playerId) => !frozenTargetIds.includes(playerId))) {
      ruleError("INVALID_SELECTION", "大雾须选择等量且非空的星和存活角色。");
    }
    const targets = action.targetIds.map((playerId) => getPlayer(session, playerId));
    const plan = planDawu({
      context: {
        ...godSkillContext(session, actor, "dawu"),
        currentPlayerId: session.currentPlayerId,
        phase: "end",
      },
      starCardIds: frozenStarIds,
      selectedStarCardIds: action.cardIds,
      targets: targets.map((target) => ({ id: target.id, alive: target.alive })),
    });
    if (!plan.ok) ruleError(plan.code === "invalid_target" || plan.code === "target_dead" ? "INVALID_TARGET" : "INVALID_SELECTION", plan.detail);
    discardQixingStars(session, actor, plan.value.discardStarCardIds, "dawu", pending.eventId);
    for (const targetId of plan.value.targetIds) addQixingWeatherEffect(session, actor.id, targetId, "dawu");
    addLog(session, "turn", `${actor.id} 发动大雾，令 ${plan.value.targetIds.join("、")} 获得大雾状态。`);
    continueEndPhaseAfterDawu(session);
    return;
  }

  if (pending.skillId === "xingshang" && pending.stage === "xingshang_claim") {
    const death = pending.deathResolution;
    const frame = topDeathFrame(session.completeRules.death);
    if (!death || !frame || frame.frameId !== death.frameId || frame.death.victimId !== pending.sourceId ||
        frame.stage !== "card_disposition" || !hasEffectiveSkill(session, actor, "xingshang")) {
      throw new Error("行殇续体与当前 DeathStack 不一致。 ");
    }
    assertPendingXingshangDeath(session, frame, actor, death);
    if (action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
        action.targetIds !== undefined || action.tokens !== undefined) {
      ruleError("INVALID_SELECTION", "行殇只需选择是否发动。 ");
    }
    if (!action.activate) {
      addLog(session, "death", `${actor.id} 未发动行殇。`);
      session.pendingResponse = null;
      continueDeathCardDisposition(session, frame, clonePendingDeathResolution(death));
      return;
    }
    settleDeathCardDisposition(session, frame, clonePendingDeathResolution(death), actor.id);
    return;
  }

  if (pending.skillId === "huashen" && pending.stage === "huashen_initial") {
    if (!action.activate || action.tokens?.length !== 1 || action.cardId !== undefined ||
        action.cardIds !== undefined || action.targetId !== undefined || action.targetIds !== undefined ||
        action.topCardIds !== undefined || action.bottomCardIds !== undefined || action.allocations !== undefined ||
        action.viewAsSkillId !== undefined || !hasEffectiveSkill(session, actor, "huashen") ||
        selectedHuashenState(session, actor) !== null || !actor.generalId) {
      ruleError("INVALID_SELECTION", "初始化身必须从两张私有身份牌中选择一项合法技能。");
    }
    const forms = huashenOwnedForms(session, actor);
    if (forms.length !== 2) throw new Error("化身初始身份数量与提示不一致。");
    const selected = parseHuashenChoice(session, actor, action.tokens[0]!);
    const plan = planHuashenInitial({
      ownerId: actor.id,
      ownerAlive: actor.alive,
      skillEffective: true,
      atGameStart: true,
      ownerGeneralId: actor.generalId,
      unavailableGeneralIds: huashenUnavailableForPlan(session, actor),
      offeredForms: forms,
      selectedFormGeneralId: selected.form.generalId,
      selectedSkillId: selected.skillId,
    });
    if (!plan.ok) ruleError("INVALID_SELECTION", plan.detail);
    setHuashenSelection(session, actor, selected.form, selected.skillId);
    session.pendingResponse = null;
    addLog(session, "turn", `${actor.id} 展示化身 ${selected.form.generalId}，获得技能 ${selected.skillId}。`);
    beginTurnStart(session);
    return;
  }

  if (pending.skillId === "huashen" &&
      (pending.stage === "huashen_turn_start" || pending.stage === "huashen_turn_end")) {
    const selectedBefore = effectiveHuashenState(session, actor);
    const expectedWindow = pending.stage === "huashen_turn_start" ? "turn_start" as const : "turn_end" as const;
    if (!selectedBefore || session.currentPlayerId !== actor.id ||
        action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
        action.targetIds !== undefined || action.topCardIds !== undefined || action.bottomCardIds !== undefined ||
        action.allocations !== undefined || action.viewAsSkillId !== undefined ||
        (!action.activate && action.tokens !== undefined) || (action.activate && action.tokens?.length !== 1)) {
      ruleError("INVALID_SELECTION", "化身切换只能选择持有身份的一项合法技能，或放弃切换。");
    }
    if (action.activate) {
      const selected = parseHuashenChoice(session, actor, action.tokens![0]!);
      const plan = planHuashenSwitch({
        ownerId: actor.id,
        ownerAlive: actor.alive,
        skillEffective: true,
        window: expectedWindow,
        ownedForms: huashenOwnedForms(session, actor),
        currentFormGeneralId: selectedBefore.form.generalId,
        currentGrantedSkillId: selectedBefore.skillId,
        selectedFormGeneralId: selected.form.generalId,
        selectedSkillId: selected.skillId,
      });
      if (!plan.ok) ruleError("INVALID_SELECTION", plan.detail);
      setHuashenSelection(session, actor, selected.form, selected.skillId);
      addLog(session, "turn", `${actor.id} 切换并展示化身 ${selected.form.generalId}，获得技能 ${selected.skillId}。`);
    } else {
      addLog(session, "turn", `${actor.id} 未在${expectedWindow === "turn_start" ? "准备阶段" : "结束阶段"}更换化身。`);
    }
    session.pendingResponse = null;
    if (expectedWindow === "turn_start") continuePrepareAwakenings(session, actor);
    else finishTurn(session, actor);
    return;
  }

  if (pending.skillId === "benghuai" && pending.stage === "benghuai_choice") {
    const choice = action.tokens?.[0];
    if (!action.activate || action.tokens?.length !== 1 || (choice !== "lose_hp" && choice !== "lose_max_hp") ||
      action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
      action.targetIds !== undefined || action.viewAsSkillId !== undefined) {
      ruleError("INVALID_SELECTION", "崩坏必须选择失去体力或减体力上限。");
    }
    const plan = planBenghuaiChoice({ hp: actor.hp, maxHp: actor.maxHp, choice });
    if (!plan.ok) throw new Error(plan.detail);
    const resume: DyingResume = { type: "forest_end", playerId: actor.id };
    if (plan.value.choice === "lose_hp") {
      const enteredDying = loseHp(session, actor, 1, "因崩坏", resume);
      if (!enteredDying) continueEndPhaseAfterBenghuai(session);
      return;
    }
    actor.maxHp = plan.value.maxHpAfter;
    actor.hp = plan.value.hpAfter;
    addLog(session, "damage", `${actor.id} 因崩坏减 1 点体力上限至 ${actor.maxHp}。`);
    if (plan.value.diesImmediatelyFromZeroMaxHp) {
      beginDirectDeath(session, actor.id, resume);
      return;
    }
    continueEndPhaseAfterBenghuai(session);
    return;
  }

  if (pending.skillId === "luanwu" && pending.stage === "luanwu_slash") {
    if (!pending.sourceId || !pending.processedPlayerIds) throw new Error("乱武提示缺少冻结行动座次。");
    const continuation: LuanwuContinuation = {
      type: "luanwu",
      eventId: pending.eventId,
      ownerId: pending.sourceId,
      processedActorIds: [...pending.processedPlayerIds],
      remainingActorIds: [...(pending.targetIds ?? [])],
    };
    assertLuanwuContinuation(session, continuation);
    if (continuation.processedActorIds.at(-1) !== actor.id) throw new Error("乱武当前行动者与冻结游标不一致。");
    const plan = liveLuanwuActorPlan(session, actor);
    if (!plan.ok || plan.value.noActionBecauseGameEnded) throw new Error(plan.ok ? "乱武行动者已经没有可处理状态。" : plan.detail);
    if (!action.activate) {
      if (action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
        action.targetIds !== undefined || action.tokens !== undefined || action.viewAsSkillId !== undefined) {
        ruleError("INVALID_SELECTION", "乱武中选择失去体力时不应提交牌或目标。");
      }
      const enteredDying = loseHp(session, actor, 1, "在乱武中未使用杀", continuation);
      if (!enteredDying) advanceLuanwu(session, continuation);
      return;
    }
    if (!action.targetId || action.targetIds !== undefined || action.tokens !== undefined ||
      !plan.value.legalSlashTargetIds.includes(action.targetId)) {
      ruleError("INVALID_TARGET", "乱武的杀只能指定当前距离最近的合法角色。");
    }
    beginLuanwuSlash(session, actor, getLivingPlayer(session, action.targetId), action, continuation);
    return;
  }

  if (pending.skillId === "yinghun") {
    if (pending.stage === "yinghun_select") {
      if (!action.activate) {
        if (action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
          action.targetIds !== undefined || action.tokens !== undefined) {
          ruleError("INVALID_SELECTION", "不发动英魂时不应选择牌、目标或模式。");
        }
        addLog(session, "turn", `${actor.id} 未发动英魂。`);
        continuePrepareSkillsAfterYinghun(session, actor);
        return;
      }
      const mode = action.tokens?.[0];
      if (!action.targetId || action.tokens?.length !== 1 ||
        (mode !== "draw_x_discard_one" && mode !== "draw_one_discard_x") ||
        action.cardId !== undefined || action.cardIds !== undefined || action.targetIds !== undefined) {
        ruleError("INVALID_SELECTION", "英魂须选择一名其他角色和一个摸弃模式。");
      }
      const target = getLivingPlayer(session, action.targetId);
      const plan = planYinghun({
        context: forestSkillContext(session, actor, "yinghun"),
        phase: "prepare",
        ownerHp: actor.hp,
        ownerMaxHp: actor.maxHp,
        targetId: target.id,
        targetAlive: target.alive,
        mode,
      });
      if (!plan.ok) ruleError("INVALID_SKILL", plan.detail);
      const drawn = drawCards(session, target, plan.value.drawCount);
      const available = ownedCards(target);
      addLog(session, "card", `${actor.id} 对 ${target.id} 发动英魂，先令其摸了 ${drawn} 张牌。`);
      if (available.length === 0) {
        continuePrepareSkillsAfterYinghun(session, actor);
        return;
      }
      session.turn.phase = "respond";
      session.pendingResponse = {
        type: "standard_skill",
        targetId: target.id,
        promptId: standardPromptId(pending.eventId, "yinghun", target.id, "discard"),
        eventId: pending.eventId,
        skillId: "yinghun",
        stage: "yinghun_discard",
        sourceId: actor.id,
        requestedCount: plan.value.requestedDiscardCount,
        mode,
      };
      return;
    }
    if (pending.stage !== "yinghun_discard" || !pending.sourceId || !pending.requestedCount) {
      throw new Error("英魂弃牌续体无效。");
    }
    if (!action.activate || action.targetId !== undefined || action.targetIds !== undefined || action.tokens !== undefined ||
      (action.cardId !== undefined && action.cardIds !== undefined)) {
      ruleError("INVALID_SELECTION", "英魂目标必须一次性完成要求的弃牌。");
    }
    const selectedCardIds = action.cardIds ?? (action.cardId ? [action.cardId] : []);
    const available = [
      ...actor.hand.map((card) => forestRuleCard(actor, card, "hand")),
      ...Object.values(actor.equipment).map((card) => forestRuleCard(actor, card, "equipment")),
    ];
    const discard = planYinghunDiscard({
      targetId: actor.id,
      requestedDiscardCount: pending.requestedCount,
      availableCards: available,
      selectedCardIds,
    });
    if (!discard.ok) ruleError("INVALID_SELECTION", discard.detail);
    const owner = getLivingPlayer(session, pending.sourceId);
    session.turn.phase = "prepare";
    session.pendingResponse = {
      ...pending,
      promptId: standardPromptId(pending.eventId, "yinghun", actor.id, "finish"),
      stage: "yinghun_finish",
    };
    const aftermath = discardOwnedCardsAtomically(
      session,
      actor,
      discard.value.discardCardIds,
      "yinghun",
      "skill_effect",
    );
    queueOwnedDiscardAftermath(session, actor, aftermath);
    addLog(session, "card", `${actor.id} 因英魂一次性弃置了 ${discard.value.actualDiscardCount} 张牌。`);
    if (session.afterMove.queuedRecoveries.length === 0 && session.afterMove.queuedTriggers.length === 0) {
      session.pendingResponse = null;
      continuePrepareSkillsAfterYinghun(session, owner);
    }
    return;
  }

  if (pending.skillId === "haoshi") {
    if (pending.stage === "haoshi_draw") {
      if (action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
        action.targetIds !== undefined || action.tokens !== undefined) {
        ruleError("INVALID_SELECTION", "好施摸牌决定不需要选择牌或目标。");
      }
      session.turn.haoshiActive = action.activate;
      addLog(session, "turn", action.activate ? `${actor.id} 发动好施。` : `${actor.id} 未发动好施。`);
      continueNormalDrawModifiers(session, actor);
      return;
    }
    if (pending.stage !== "haoshi_transfer" || !action.activate || !action.targetId ||
      action.cardId !== undefined || action.targetIds !== undefined || action.tokens !== undefined) {
      ruleError("INVALID_SELECTION", "好施须选择一名手牌最少的其他角色并交给其恰好一半手牌。");
    }
    const decision = validateHaoshiTransferChoice({
      ownerId: actor.id,
      ownerHandCardIds: actor.hand.map((card) => card.id),
      otherPlayers: session.players
        .filter((candidate) => candidate.id !== actor.id)
        .map((candidate) => ({ id: candidate.id, alive: candidate.alive, handCount: candidate.hand.length })),
      selectedTargetId: action.targetId,
      selectedCardIds: action.cardIds ?? [],
    });
    if (!decision.ok) ruleError("INVALID_SELECTION", decision.detail);
    const target = getLivingPlayer(session, decision.value.targetId);
    const zones = sessionZoneState(session);
    commitLiveMoveBatch(session, zones.state, {
      batchId: nextMoveBatchId(session),
      intents: [{
        cardIds: decision.value.transferCardIds,
        from: { kind: "hand", playerId: actor.id },
        to: { kind: "hand", playerId: target.id },
        reason: "give",
        visibility: "source_and_target",
        actorId: actor.id,
        sourceId: actor.id,
        targetId: target.id,
        skillId: "haoshi",
      }],
    });
    syncSessionZones(session, zones);
    session.turn.haoshiActive = false;
    session.pendingResponse = null;
    addLog(session, "card", `${actor.id} 因好施交给 ${target.id} ${decision.value.transferCardIds.length} 张手牌。`);
    finishDrawPhase(session, actor);
    return;
  }

  if (pending.skillId === "zaiqi" && pending.stage === "zaiqi_draw") {
    if (action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
      action.targetIds !== undefined || action.tokens !== undefined) {
      ruleError("INVALID_SELECTION", "再起摸牌替代不需要选择牌或目标。");
    }
    if (!action.activate) {
      addLog(session, "turn", `${actor.id} 未发动再起。`);
      continueDrawPhaseAfterZaiqi(session, actor);
      return;
    }
    const activation = evaluateZaiqiActivation({
      context: forestSkillContext(session, actor, "zaiqi"),
      phase: "draw",
      drawPhaseAvailable: !session.turn.skipDraw,
      ownerHp: actor.hp,
      ownerMaxHp: actor.maxHp,
    });
    if (!activation.ok || session.deck.length + session.discardPile.length < activation.value.revealCount) {
      ruleError("INVALID_SKILL", "再起已经失去或牌堆不足以完成展示。");
    }
    settleZaiqi(session, actor, pending, activation.value.revealCount);
    return;
  }

  if (pending.skillId === "leiji" && pending.stage === "leiji_target" && pending.leijiDodge) {
    if (!action.activate) {
      session.pendingResponse = null;
      addLog(session, "card", `${actor.id} 未发动雷击。`);
      resumeAcceptedDodge(session, pending.leijiDodge.resume);
      return;
    }
    if (!hasEffectiveSkill(session, actor, "leiji")) ruleError("INVALID_SKILL", "雷击已经失去。");
    if (!action.targetId || action.cardId !== undefined || action.cardIds !== undefined || action.targetIds !== undefined) {
      ruleError("INVALID_SELECTION", "发动雷击必须选择一名存活角色，且无需选择牌。");
    }
    beginLeijiJudgment(session, pending, getLivingPlayer(session, action.targetId));
    return;
  }

  if (pending.skillId === "buqu" && pending.stage === "buqu_recovery") {
    applyBuquRecoveryAction(session, pending, action, actor);
    return;
  }

  if (pending.skillId === "shuangxiong" && pending.stage === "shuangxiong_draw") {
    if (action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined || action.targetIds !== undefined) {
      ruleError("INVALID_SELECTION", "双雄摸牌替代不需要选择牌或目标。");
    }
    if (!action.activate) {
      addLog(session, "turn", `${actor.id} 未发动双雄。`);
      continueDrawPhaseAfterShuangxiong(session, actor);
      return;
    }
    if (!hasEffectiveSkill(session, actor, "shuangxiong")) ruleError("INVALID_SKILL", "双雄已经失去。");
    beginStandardJudgment(
      session,
      actor,
      { type: "skill", id: "shuangxiong" },
      {},
      { type: "shuangxiong", playerId: actor.id },
    );
    return;
  }

  if (pending.skillId === "mengjin" && pending.stage === "mengjin_discard" && pending.slash) {
    const slash = cloneSlashPending(pending.slash);
    if (!action.activate) {
      addLog(session, "card", `${actor.id} 未发动猛进。`);
      continueSlashDodgedAfterMengjin(session, slash);
      return;
    }
    if (
      action.tokens?.length !== 1 || action.cardId !== undefined || action.cardIds !== undefined ||
      action.targetId !== undefined || action.targetIds !== undefined
    ) ruleError("INVALID_SELECTION", "猛进必须选择目标的一张手牌或装备牌。 ");
    const decision = evaluateLiveMengjin(session, slash);
    if (!decision.ok) ruleError("INVALID_SKILL", "猛进已经失去或目标已无合法牌。 ");
    const target = getLivingPlayer(session, slash.targetId);
    const token = action.tokens[0] ?? "";
    let discarded: Card | undefined;
    if (/^hand:\d+$/.test(token)) {
      const card = target.hand[Number(token.slice(5))];
      if (card && decision.value.candidateCardIds.includes(card.id)) discarded = removeCard(session, target, card.id);
    } else if (token.startsWith("equipment:")) {
      const slot = token.slice("equipment:".length) as EquipmentSlot;
      const card = target.equipment[slot];
      if (card && decision.value.candidateCardIds.includes(card.id)) discarded = loseEquipment(session, target, slot);
    }
    if (!discarded) ruleError("INVALID_SELECTION", "猛进所选目标牌已经不存在。 ");
    session.discardPile.push(discarded);
    addLog(session, "card", `${actor.id} 发动猛进，弃置了 ${target.id} 的一张牌。`);
    if (session.afterMove.queuedRecoveries.length > 0 || session.afterMove.queuedTriggers.length > 0) {
      session.pendingResponse = {
        ...pending,
        promptId: standardPromptId(pending.eventId, "mengjin", actor.id, "finish"),
        stage: "mengjin_finish",
        slash,
      };
      offerNextAfterMoveSkill(session);
    } else {
      continueSlashDodgedAfterMengjin(session, slash);
    }
    return;
  }

  if (pending.damageOpportunity) {
    const cursor = pending.damageOpportunity;
    const frame = assertLiveDamageCursor(session, cursor);
    const current = frame.window?.opportunities[frame.window.cursor];
    const expectedOwnerId = (pending.skillId === "ganglie" && pending.stage === "ganglie_punish") ||
        (pending.skillId === "beige" && pending.stage === "beige_source_discard")
      ? pending.sourceId
      : actor.id;
    if (!current || current.ref.skillId !== pending.skillId || current.ref.ownerId !== expectedOwnerId) {
      throw new Error("标准伤害技能与 DamageFlow 机会不一致。");
    }
    const finish = (outcome: "pass" | "resolve"): void => {
      consumeLiveDamageOpportunity(
        session,
        cursor,
        outcome,
        outcome === "resolve" ? `standard:${pending.eventId}:${pending.skillId}` : null,
      );
      session.pendingResponse = null;
      driveLiveDamageFlow(session, true);
    };

    if (pending.skillId === "beige" && pending.stage === "beige_cost") {
      if (!action.activate) {
        if (action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
            action.targetIds !== undefined || action.tokens !== undefined || action.topCardIds !== undefined ||
            action.bottomCardIds !== undefined || action.allocations !== undefined || action.viewAsSkillId !== undefined) {
          ruleError("INVALID_SELECTION", "不发动悲歌时不应选择牌或目标。");
        }
        addLog(session, "damage", `${actor.id} 未发动悲歌。`);
        finish("pass");
        return;
      }
      if (!liveDamageOpportunityEligible(session, frame, "beige", actor.id)) {
        ruleError("INVALID_SKILL", "悲歌已经失去或不再满足发动条件。");
      }
      if (!action.cardId || action.cardIds !== undefined || action.targetId !== undefined ||
          action.targetIds !== undefined || action.tokens !== undefined || action.topCardIds !== undefined ||
          action.bottomCardIds !== undefined || action.allocations !== undefined || action.viewAsSkillId !== undefined) {
        ruleError("INVALID_SELECTION", "悲歌必须弃置一张手牌或装备牌。");
      }
      const cost = ownedCard(actor, action.cardId);
      const costZone = actor.hand.some((card) => card.id === cost.id) ? "hand" as const : "equipment" as const;
      const costSnapshot = cloneCard(cost);
      session.discardPile.push(removeOwnedCard(session, actor, cost.id));
      const victim = getLivingPlayer(session, frame.damage.targetId);
      beginStandardJudgment(
        session,
        victim,
        { type: "skill", id: "beige" },
        {},
        {
          type: "beige",
          ownerId: actor.id,
          costCard: costSnapshot,
          costZone,
          damageOpportunity: { ...cursor },
        },
      );
      addLog(session, "card", `${actor.id} 弃置一张牌发动悲歌，令 ${victim.id} 进行判定。`);
      return;
    }

    if (pending.skillId === "beige" && pending.stage === "beige_source_discard") {
      const owner = pending.sourceId ? getPlayer(session, pending.sourceId) : null;
      const snapshot = pending.selectedCardIds ?? [];
      const candidates = ownedCards(actor).map((card) => card.id);
      const sortedSnapshot = [...snapshot].sort();
      const sortedCandidates = [...candidates].sort();
      if (!owner || owner.id !== cursor.ownerId || frame.damage.sourceId !== actor.id ||
          snapshot.length === 0 || new Set(snapshot).size !== snapshot.length ||
          sortedSnapshot.length !== sortedCandidates.length ||
          sortedSnapshot.some((cardId, index) => cardId !== sortedCandidates[index])) {
        throw new Error("悲歌梅花弃牌续体被篡改或已过期。");
      }
      const selectedCardIds = action.cardIds ?? [];
      const requiredCount = Math.min(2, candidates.length);
      if (!action.activate || action.cardId !== undefined || selectedCardIds.length !== requiredCount ||
          new Set(selectedCardIds).size !== selectedCardIds.length ||
          selectedCardIds.some((cardId) => !candidates.includes(cardId)) ||
          action.targetId !== undefined || action.targetIds !== undefined || action.tokens !== undefined ||
          action.topCardIds !== undefined || action.bottomCardIds !== undefined || action.allocations !== undefined ||
          action.viewAsSkillId !== undefined) {
        ruleError("INVALID_SELECTION", `悲歌梅花判定必须弃置 ${requiredCount} 张牌。`);
      }
      const moveBatchId = nextMoveBatchId(session);
      session.discardPile.push(...selectedCardIds.map((cardId) => removeOwnedCard(session, actor, cardId, moveBatchId)));
      addLog(session, "card", `${actor.id} 因悲歌梅花判定弃置了 ${requiredCount} 张牌。`);
      consumeLiveDamageOpportunity(
        session,
        cursor,
        "resolve",
        `standard:${pending.eventId}:beige`,
      );
      session.pendingResponse = null;
      if (session.afterMove.queuedRecoveries.length > 0 || session.afterMove.queuedTriggers.length > 0) {
        offerNextAfterMoveSkill(session);
      } else {
        driveLiveDamageFlow(session, true);
      }
      return;
    }

    if (pending.skillId === "xinsheng" && pending.stage === "xinsheng_invoke") {
      if (!action.activate) {
        if (action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
            action.targetIds !== undefined || action.tokens !== undefined || action.topCardIds !== undefined ||
            action.bottomCardIds !== undefined || action.allocations !== undefined || action.viewAsSkillId !== undefined) {
          ruleError("INVALID_SELECTION", "不发动新生时不应选择牌或目标。");
        }
        addLog(session, "damage", `${actor.id} 未发动新生。`);
        finish("pass");
        return;
      }
      if (action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
          action.targetIds !== undefined || action.tokens !== undefined || action.topCardIds !== undefined ||
          action.bottomCardIds !== undefined || action.allocations !== undefined || action.viewAsSkillId !== undefined ||
          !liveDamageOpportunityEligible(session, frame, "xinsheng", actor.id) || !actor.generalId) {
        ruleError("INVALID_SKILL", "新生已经失去或不再满足发动条件。");
      }
      const point = damageOpportunityPoint(frame);
      if (point === null) throw new Error("新生缺少逐点伤害游标。");
      const form = chooseHuashenForms(session, 1)[0]!;
      const forms = huashenOwnedForms(session, actor);
      const plan = planXinsheng({
        ownerId: actor.id,
        ownerAliveAfterDamage: actor.alive,
        skillEffective: true,
        damageAftermathSettled: true,
        damageAmount: frame.damage.amount,
        damagePoint: point,
        ownerGeneralId: actor.generalId,
        unavailableGeneralIds: huashenUnavailableForPlan(session, actor),
        ownedFormGeneralIds: forms.map((owned) => owned.generalId),
        offeredForm: form,
      });
      if (!plan.ok) throw new Error(plan.detail);
      addHuashenFormState(session, actor, plan.value.addForm);
      addLog(session, "damage", `${actor.id} 发动新生，获得了一张新的私有化身牌。`);
      finish("resolve");
      return;
    }

    if ((pending.skillId === "fangzhu" && pending.stage === "fangzhu_target") ||
        (pending.skillId === "jilue" && pending.stage === "jilue_fangzhu")) {
      const borrowed = pending.skillId === "jilue";
      if (!action.activate) {
        addLog(session, "damage", `${actor.id} 未发动${borrowed ? "极略·" : ""}放逐。`);
        finish("pass");
        return;
      }
      if (!liveDamageOpportunityEligible(session, frame, borrowed ? "jilue" : "fangzhu", actor.id)) {
        ruleError("INVALID_SKILL", `${borrowed ? "极略·" : ""}放逐已经失去或不再满足发动条件。`);
      }
      if (!action.targetId || action.cardId !== undefined || action.cardIds !== undefined || action.targetIds !== undefined ||
          action.tokens !== undefined || action.topCardIds !== undefined || action.bottomCardIds !== undefined ||
          action.allocations !== undefined || action.viewAsSkillId !== undefined) {
        ruleError("INVALID_SELECTION", "放逐必须选择另一名存活角色。 ");
      }
      const target = getLivingPlayer(session, action.targetId);
      const plan = borrowed
        ? planJilueFangzhu({
            context: jilueContext(session, actor),
            damageAmount: frame.damage.amount,
            ownerHp: actor.hp,
            ownerMaxHp: actor.maxHp,
            targetId: target.id,
            targetAlive: target.alive,
            targetFaceUp: target.faceUp,
          })
        : planFangzhu({
            context: { ownerId: actor.id, ownerAlive: actor.alive, skillEffective: true },
            damageEventAmount: frame.damage.amount,
            ownerHp: actor.hp,
            ownerMaxHp: actor.maxHp,
            targetId: target.id,
            targetAlive: target.alive,
            targetFaceUp: target.faceUp,
          });
      if (!plan.ok) ruleError("INVALID_TARGET", plan.detail);
      if (borrowed) spendJilueRen(session, actor.id);
      const turned = turnOverLivePlayer(session, target.id);
      const drawn = drawCards(session, target, plan.value.drawCount);
      addLog(session, "card", `${actor.id} 发动${borrowed ? "极略·" : ""}放逐，令 ${target.id} 翻至${turned.faceUp ? "正面" : "背面"}并摸了 ${drawn} 张牌。`);
      finish("resolve");
      return;
    }

    if (pending.skillId === "lieren" && pending.stage === "lieren_invoke") {
      if (!action.activate) {
        addLog(session, "damage", `${actor.id} 未发动烈刃。`);
        finish("pass");
        return;
      }
      if (!liveDamageOpportunityEligible(session, frame, "lieren") || !pending.sourceId) {
        ruleError("INVALID_SKILL", "烈刃已经失去或不再满足发动条件。 ");
      }
      if (action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined || action.targetIds !== undefined || action.tokens !== undefined) {
        ruleError("INVALID_SELECTION", "烈刃发动时无需选择牌或目标。 ");
      }
      beginLivePindian(session, actor, getLivingPlayer(session, pending.sourceId), "lieren", {
        type: "lieren",
        damageOpportunity: { ...cursor },
      });
      return;
    }

    if (pending.skillId === "baonue" && pending.stage === "baonue_invoke") {
      if (!action.activate) {
        addLog(session, "damage", `${actor.id} 未发动暴虐。`);
        finish("pass");
        return;
      }
      const owner = pending.sourceId ? getLivingPlayer(session, pending.sourceId) : null;
      const expectedOwner = baonueOwnerForDamage(session, actor, frame.damage.amount);
      if (!owner || owner.id !== expectedOwner?.id || !liveDamageOpportunityEligible(session, frame, "baonue")) {
        ruleError("INVALID_SKILL", "暴虐已经失去或不再满足发动条件。 ");
      }
      if (action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined || action.targetIds !== undefined || action.tokens !== undefined) {
        ruleError("INVALID_SELECTION", "暴虐发动时无需选择牌或目标。 ");
      }
      beginStandardJudgment(
        session,
        actor,
        { type: "skill", id: "baonue" },
        { suits: ["spade"] },
        { type: "baonue", ownerId: owner.id, damageOpportunity: { ...cursor } },
      );
      return;
    }

    if (pending.skillId === "lieren" && pending.stage === "lieren_gain") {
      const target = pending.sourceId ? getLivingPlayer(session, pending.sourceId) : null;
      if (!target || frame.damage.sourceId !== actor.id || frame.damage.targetId !== target.id) {
        throw new Error("烈刃获牌续体与 DamageFlow 参与者不一致。 ");
      }
      if (!action.activate) {
        addLog(session, "card", `${actor.id} 放弃获得烈刃拼点后的目标牌。`);
        finish("resolve");
        return;
      }
      if (action.tokens?.length !== 1 || action.cardId !== undefined || action.cardIds !== undefined ||
          action.targetId !== undefined || action.targetIds !== undefined) {
        ruleError("INVALID_SELECTION", "烈刃拼点获胜后必须选择目标的一张手牌或装备牌。 ");
      }
      const token = action.tokens[0] ?? "";
      let selected: Card | undefined;
      let zone: "hand" | "equipment" | null = null;
      if (/^hand:\d+$/.test(token)) {
        const card = target.hand[Number(token.slice(5))];
        if (card) {
          selected = card;
          zone = "hand";
        }
      } else if (token.startsWith("equipment:")) {
        const slot = token.slice("equipment:".length) as EquipmentSlot;
        const card = target.equipment[slot];
        if (card) {
          selected = card;
          zone = "equipment";
        }
      }
      if (!selected || !zone) ruleError("INVALID_SELECTION", "烈刃所选目标牌已经不存在。 ");
      const plan = planLierenGain({
        ownerId: actor.id,
        targetId: target.id,
        pindianWon: true,
        selectedCard: forestRuleCard(target, selected, zone),
      });
      if (!plan.ok) ruleError("INVALID_SELECTION", plan.detail);
      const gained = zone === "hand"
        ? removeCard(session, target, selected.id)
        : loseEquipment(session, target, getCardDefinition(selected.kind).equipmentSlot!);
      actor.hand.push(gained);
      addLog(session, "card", `${actor.id} 发动烈刃，获得了 ${target.id} 的一张牌。`);
      finish("resolve");
      return;
    }

    if (pending.skillId === "tianxiang" && pending.stage === "tianxiang_redirect") {
      if (!action.activate) {
        addLog(session, "damage", `${actor.id} 未发动天香。`);
        finish("pass");
        return;
      }
      if (!liveDamageOpportunityEligible(session, frame, "tianxiang")) {
        ruleError("INVALID_SKILL", "天香已经失去或不再满足发动条件。");
      }
      if (!action.cardId || !action.targetId || action.cardIds !== undefined || action.targetIds !== undefined) {
        ruleError("INVALID_SELECTION", "天香必须选择一张有效红桃手牌和一名未承受过此次伤害的其他角色。");
      }
      const cost = actor.hand.find((card) => card.id === action.cardId);
      if (!cost) ruleError("CARD_NOT_FOUND", `手牌中不存在 ${action.cardId}。`);
      const redirected = getLivingPlayer(session, action.targetId);
      if (tianxiangVisitedTargetIds(frame).has(redirected.id)) {
        ruleError("INVALID_TARGET", "天香不能将此次伤害转回已经承受过的目标。 ");
      }
      const decision = evaluateLiveTianxiangChoice(session, frame, actor, cost, redirected);
      if (!decision.ok) throw new Error(decision.detail);
      if (!decision.value.eligible) {
        ruleError("INVALID_SELECTION", "天香只能弃置有效花色为红桃的实体手牌并转移给其他存活角色。");
      }
      session.discardPile.push(removeCard(session, actor, cost.id));
      consumeLiveDamageOpportunity(
        session,
        cursor,
        "resolve",
        `tianxiang:${frame.damageId}:redirect:${frame.damage.redirects.length + 1}`,
        { type: "redirect", toTargetId: redirected.id },
      );
      session.pendingResponse = null;
      addLog(session, "damage", `${actor.id} 发动天香，将此次伤害转移给 ${redirected.id}。`);
      driveLiveDamageFlow(session, true);
      return;
    }

    if (pending.skillId === "jieming" && pending.stage === "jieming_target") {
      if (!action.activate) {
        addLog(session, "damage", `${actor.id} 未发动节命。`);
        finish("pass");
        return;
      }
      if (!liveDamageOpportunityEligible(session, frame, "jieming")) {
        ruleError("INVALID_SKILL", "节命已经失去或不再满足发动条件。");
      }
      if (!action.targetId || action.cardId !== undefined || action.cardIds !== undefined || action.targetIds !== undefined) {
        ruleError("INVALID_SELECTION", "节命必须选择一名存活角色，且无需选择牌。");
      }
      const target = getLivingPlayer(session, action.targetId);
      const point = damageOpportunityPoint(frame);
      if (point === null) throw new Error("节命缺少逐点伤害游标。");
      const decision = evaluateJiemingPoint({
        ownerId: actor.id,
        ownerAliveAfterDamage: actor.alive,
        damageAftermathSettled: true,
        damageAmount: frame.damage.amount,
        damagePoint: point,
        target: {
          playerId: target.id,
          alive: target.alive,
          maxHp: target.maxHp,
          handCount: target.hand.length,
        },
      });
      if (!decision.ok) throw new Error(decision.detail);
      const drawn = drawCards(session, target, decision.value.drawCount);
      addLog(session, "card", `${actor.id} 发动节命，令 ${target.id} 将手牌补至 ${decision.value.targetHandSize} 张，摸了 ${drawn} 张牌。`);
      finish("resolve");
      return;
    }

    if (pending.stage === "invoke") {
      if (!action.activate) {
        addLog(session, "damage", `${actor.id} 未发动${pending.skillId}。`);
        finish("pass");
        return;
      }
      if (!liveDamageOpportunityEligible(session, frame, pending.skillId)) {
        ruleError("INVALID_SKILL", "该伤害后技能已经失去或不再满足条件。");
      }
      if (pending.skillId === "jianxiong") {
        const available = new Set(frame.damage.physicalCardIds);
        const gained = session.resolvingCards.filter((card) => available.has(card.id));
        session.resolvingCards = session.resolvingCards.filter((card) => !available.has(card.id));
        actor.hand.push(...gained);
        addLog(session, "card", `${actor.id} 发动奸雄，获得了仍在处理区的 ${gained.length} 张伤害实体牌。`);
        finish("resolve");
        return;
      }
      if (pending.skillId === "yiji") {
        const count = Math.min(2, session.deck.length + session.discardPile.length);
        if (count === 0) {
          finish("pass");
          return;
        }
        const transition = drawTopCards(deckServiceState(session), count);
        applyDeckServiceState(session, transition.state);
        const pileId = `yiji:${pending.eventId}:${cursor.promptId}`;
        actor.extraPiles[pileId] = transition.cards.map(cloneCard);
        session.pendingResponse = {
          ...pending,
          stage: "yiji_distribute",
          promptId: `damage:${cursor.promptId}:yiji-distribute`,
          selectedCardIds: transition.cards.map((card) => card.id),
        };
        addLog(session, "card", `${actor.id} 发动遗计，私下观看牌堆顶 ${count} 张牌。`);
        return;
      }
      if (pending.skillId === "fankui") {
        session.pendingResponse = {
          ...pending,
          stage: "fankui_select",
          promptId: `damage:${cursor.promptId}:fankui-select`,
        };
        return;
      }
      if (pending.skillId === "ganglie") {
        beginStandardJudgment(
          session,
          actor,
          { type: "skill", id: "ganglie" },
          { suits: ["heart"], negate: true },
          { type: "ganglie", damageOpportunity: cursor },
        );
        return;
      }
    }

    if (pending.skillId === "yiji" && pending.stage === "yiji_distribute" && pending.selectedCardIds) {
      if (!action.activate) ruleError("INVALID_SELECTION", "遗计发动后必须分配全部观看牌。");
      const allocations = action.allocations ?? [];
      if (
        allocations.length !== pending.selectedCardIds.length ||
        new Set(allocations.map((entry) => entry.cardId)).size !== allocations.length ||
        pending.selectedCardIds.some((cardId) => !allocations.some((entry) => entry.cardId === cardId))
      ) ruleError("INVALID_SELECTION", "遗计必须将每张观看牌恰好分配一次。");
      const pileEntry = Object.entries(actor.extraPiles).find(([, cards]) =>
        cards.length === pending.selectedCardIds!.length && pending.selectedCardIds!.every((id) => cards.some((card) => card.id === id))
      );
      if (!pileEntry) ruleError("INVALID_SELECTION", "遗计私有牌堆已经失效。");
      const [pileId, pile] = pileEntry;
      for (const allocation of allocations) {
        const target = getLivingPlayer(session, allocation.targetId);
        const index = pile.findIndex((card) => card.id === allocation.cardId);
        if (index < 0) ruleError("INVALID_SELECTION", "遗计分配牌不存在。");
        const [card] = pile.splice(index, 1);
        if (!card) throw new Error("遗计移牌失败。");
        target.hand.push(card);
      }
      delete actor.extraPiles[pileId];
      addLog(session, "card", `${actor.id} 完成遗计分配。`);
      finish("resolve");
      return;
    }

    if (pending.skillId === "fankui" && pending.stage === "fankui_select") {
      if (!action.activate) ruleError("INVALID_SELECTION", "反馈发动后必须选择一张来源牌。");
      const sourceId = frame.damage.sourceId;
      const source = sourceId ? getLivingPlayer(session, sourceId) : null;
      if (!source || action.tokens?.length !== 1) ruleError("INVALID_SELECTION", "反馈必须选择一张来源牌。");
      const token = action.tokens[0] ?? "";
      let gained: Card | undefined;
      if (/^hand:\d+$/.test(token)) {
        const card = source.hand[Number(token.slice(5))];
        if (card) gained = removeCard(session, source, card.id);
      } else if (token.startsWith("equipment:")) {
        const slot = token.slice("equipment:".length) as EquipmentSlot;
        if (["weapon", "armor", "offensive_horse", "defensive_horse"].includes(slot) && source.equipment[slot]) {
          gained = loseEquipment(session, source, slot);
        }
      }
      if (!gained) ruleError("INVALID_SELECTION", "反馈所选来源牌不存在。");
      actor.hand.push(gained);
      addLog(session, "card", `${actor.id} 发动反馈，获得了 ${source.id} 的一张牌。`);
      finish("resolve");
      return;
    }

    if (pending.skillId === "ganglie" && pending.stage === "ganglie_punish" && pending.sourceId) {
      const punished = actor;
      const owner = getPlayer(session, pending.sourceId);
      if (action.activate) {
        const cardIds = action.cardIds ?? [];
        if (cardIds.length !== 2 || new Set(cardIds).size !== 2 || cardIds.some((id) => !punished.hand.some((card) => card.id === id))) {
          ruleError("INVALID_SELECTION", "刚烈必须弃置两张不同手牌，或选择受到伤害。");
        }
        const moveBatchId = nextMoveBatchId(session);
        session.discardPile.push(...cardIds.map((id) => removeCard(session, punished, id, moveBatchId)));
        addLog(session, "card", `${punished.id} 为刚烈弃置两张手牌。`);
        finish("resolve");
        return;
      }
      consumeLiveDamageOpportunity(session, cursor, "resolve", `standard:${pending.eventId}:ganglie`);
      session.pendingResponse = null;
      startLiveDamageFlow(
        session,
        punished,
        owner,
        1,
        "normal",
        "受到刚烈惩罚",
        [],
        null,
        cursor.frameId,
      );
      addLog(session, "damage", `${punished.id} 受到刚烈惩罚，受到 1 点伤害。`);
      driveLiveDamageFlow(session, true);
      return;
    }
    ruleError("INVALID_RESPONSE", "标准伤害技能动作与当前 DamageFlow 阶段不匹配。");
  }

  if (pending.skillId === "jushou") {
    if (pending.stage === "invoke") {
      if (!action.activate) {
        addLog(session, "turn", `${actor.id} 未发动据守。`);
        continueEndPhaseAfterJushou(session);
        return;
      }
      if (!hasEffectiveSkill(session, actor, "jushou")) ruleError("INVALID_SKILL", "据守已经失去。 ");
      if (action.cardId !== undefined || action.targetId !== undefined || action.cardIds !== undefined || action.targetIds !== undefined) {
        ruleError("INVALID_SELECTION", "发动据守时不应预先选择牌或目标。 ");
      }
      const owner = turnOverLivePlayer(session, actor.id);
      const drawn = drawCards(session, owner, 4);
      addLog(session, "turn", `${owner.id} 发动据守并翻面，摸了 ${drawn} 张牌。`);
      const allowedCardIds = owner.hand.filter((card) => {
        const decision = evaluateLiveJushouDisposal(owner, card);
        if (!decision.ok) throw new Error(decision.detail);
        return decision.value.eligible;
      }).map((card) => card.id);
      if (allowedCardIds.length === 0) {
        continueEndPhaseAfterJushou(session);
        return;
      }
      session.turn.phase = "respond";
      session.pendingResponse = {
        ...pending,
        promptId: standardPromptId(pending.eventId, "jushou", owner.id, "dispose"),
        stage: "jushou_dispose",
      };
      return;
    }
    if (pending.stage !== "jushou_dispose") {
      throw new Error("据守结束续体不应暴露为玩家动作。 ");
    }
    if (!action.activate || !action.cardId || action.cardIds !== undefined || action.targetId !== undefined || action.targetIds !== undefined) {
      ruleError("INVALID_SELECTION", "据守发动后必须选择一张合法手牌处置。 ");
    }
    const selected = actor.hand.find((card) => card.id === action.cardId);
    if (!selected) ruleError("CARD_NOT_FOUND", `据守所选手牌 ${action.cardId} 已不存在。`);
    const decision = evaluateLiveJushouDisposal(actor, selected);
    if (!decision.ok) throw new Error(decision.detail);
    if (!decision.value.eligible || !decision.value.disposition) {
      ruleError("INVALID_SELECTION", "据守只能弃置一张非装备手牌或合法使用一张装备手牌。 ");
    }
    if (decision.value.disposition === "discard") {
      session.discardPile.push(removeCard(session, actor, selected.id));
      addLog(session, "card", `${actor.id} 为据守弃置了一张非装备牌。`);
    } else {
      playEquipment(session, actor, selected, undefined);
      addLog(session, "card", `${actor.id} 为据守使用了一张装备牌。`);
    }
    if (session.afterMove.queuedRecoveries.length > 0 || session.afterMove.queuedTriggers.length > 0) {
      session.turn.phase = "end";
      session.pendingResponse = {
        ...pending,
        promptId: standardPromptId(pending.eventId, "jushou", actor.id, "finish"),
        stage: "jushou_finish",
      };
    } else {
      continueEndPhaseAfterJushou(session);
    }
    return;
  }

  if (pending.skillId === "shensu") {
    const stage = pending.stage === "shensu_judgment_draw"
      ? "judgment_and_draw" as const
      : pending.stage === "shensu_play" ? "play" as const : null;
    if (stage === null) throw new Error("神速阶段续体无效。 ");
    if (!action.activate) {
      addLog(session, "turn", `${actor.id} 未发动神速。`);
      if (stage === "judgment_and_draw") continueJudgmentPhase(session);
      else enterActualPlayPhase(session, actor);
      return;
    }
    if (!hasEffectiveSkill(session, actor, "shensu")) ruleError("INVALID_SKILL", "神速已经失去。 ");
    if (!action.targetId || action.targetIds !== undefined || action.cardIds !== undefined) {
      ruleError("INVALID_SELECTION", "神速必须选择恰好一名目标。 ");
    }
    if ((stage === "judgment_and_draw") !== (action.cardId === undefined)) {
      ruleError("INVALID_SELECTION", stage === "play" ? "神速第二项必须弃置一张装备牌。" : "神速第一项不需要弃置牌。 ");
    }
    const target = getLivingPlayer(session, action.targetId);
    const cost = stage === "play" ? ownedCard(actor, action.cardId!) : null;
    const decision = evaluateLiveShensu(session, actor, stage, target, cost);
    if (!decision.ok) throw new Error(decision.detail);
    if (!decision.value.eligible || !decision.value.virtualSlash) {
      ruleError("INVALID_TARGET", "神速目标或装备牌已不再合法。 ");
    }
    if (cost) {
      session.discardPile.push(removeOwnedCard(session, actor, cost.id));
      session.turn.skipPlay = true;
      addLog(session, "card", `${actor.id} 发动神速，弃置一张装备牌并跳过出牌阶段，对 ${target.id} 使用虚拟杀。`);
    } else {
      addLog(session, "card", `${actor.id} 发动神速，跳过判定阶段和摸牌阶段，对 ${target.id} 使用虚拟杀。`);
    }
    beginShensuSlash(session, actor, target, stage, pending.eventId);
    return;
  }

  if (pending.skillId === "guanxing") {
    if (pending.stage === "invoke") {
      if (!action.activate) {
        addLog(session, "turn", `${actor.id} 未发动观星。`);
        continuePrepareSkills(session, actor);
        return;
      }
      const count = Math.min(5, session.players.filter((player) => player.alive).length, session.deck.length + session.discardPile.length);
      if (count === 0) {
        continuePrepareSkills(session, actor);
        return;
      }
      const transition = drawTopCards(deckServiceState(session), count);
      const selected = transition.cards.map(cloneCard);
      applyDeckServiceState(session, {
        ...transition.state,
        drawPile: [...transition.state.drawPile, ...[...selected].reverse()],
      });
      session.pendingResponse = {
        ...pending,
        stage: "guanxing_reorder",
        promptId: standardPromptId(pending.eventId, "guanxing", actor.id, "reorder"),
        selectedCardIds: selected.map((card) => card.id),
      };
      addLog(session, "turn", `${actor.id} 发动观星，观看牌堆顶 ${count} 张牌。`);
      return;
    }
    if (pending.stage !== "guanxing_reorder" || !pending.selectedCardIds) throw new Error("观星重排状态无效。");
    if (!action.activate) ruleError("INVALID_SELECTION", "观星发动后必须完成牌堆顶/底重排。");
    const top = action.topCardIds ?? [];
    const bottom = action.bottomCardIds ?? [];
    try {
      assertExactPartition(pending.selectedCardIds, top, bottom);
      const reordered = reorderTopCards(deckServiceState(session), {
        selectedCardIds: pending.selectedCardIds,
        topInDrawOrder: top,
        bottomInDrawOrder: bottom,
      });
      applyDeckServiceState(session, reordered.state);
    } catch {
      ruleError("INVALID_SELECTION", "观星的牌堆顶/底顺序必须恰好包含全部观看牌。");
    }
    addLog(session, "card", `${actor.id} 完成观星：${top.length} 张置于牌堆顶，${bottom.length} 张置于牌堆底。`);
    continuePrepareSkills(session, actor);
    return;
  }

  if (pending.skillId === "shelie") {
    if (pending.stage === "shelie_invoke") {
      if (action.cardId !== undefined || action.cardIds !== undefined || action.targetId !== undefined ||
          action.targetIds !== undefined || action.tokens !== undefined || action.topCardIds !== undefined ||
          action.bottomCardIds !== undefined || action.allocations !== undefined || action.viewAsSkillId !== undefined) {
        ruleError("INVALID_SELECTION", "涉猎发动选择不需要提交牌或目标。");
      }
      if (!action.activate) {
        addLog(session, "turn", `${actor.id} 未发动涉猎。`);
        continueDrawPhaseAfterShelie(session, actor);
        return;
      }
      const activation = evaluateShelieActivation({
        context: {
          ...godSkillContext(session, actor, "shelie"),
          currentPlayerId: session.currentPlayerId,
          phase: "draw",
        },
        drawPhaseAvailable: !session.turn.skipDraw,
        decision: "replace_draw",
      });
      if (!activation.ok || session.deck.length + session.discardPile.length < activation.value.revealCount) {
        ruleError("INVALID_SKILL", "涉猎已经失去或牌堆不足以展示五张牌。");
      }
      const transition = drawTopCards(deckServiceState(session), activation.value.revealCount);
      applyDeckServiceState(session, transition.state);
      const pileId = `shelie:${pending.eventId}`;
      actor.extraPiles[pileId] = transition.cards.map(cloneCard);
      session.pendingResponse = {
        ...pending,
        stage: "shelie_select",
        promptId: standardPromptId(pending.eventId, "shelie", actor.id, "select"),
        selectedCardIds: transition.cards.map((card) => card.id),
      };
      addLog(session, "card", `${actor.id} 发动涉猎，公开展示牌堆顶五张牌。`);
      return;
    }
    if (pending.stage !== "shelie_select" || pending.selectedCardIds?.length !== 5) {
      throw new Error("涉猎选牌续体无效。");
    }
    if (!action.activate || action.cardId !== undefined || action.targetId !== undefined ||
        action.targetIds !== undefined || action.tokens !== undefined || action.topCardIds !== undefined ||
        action.bottomCardIds !== undefined || action.allocations !== undefined || action.viewAsSkillId !== undefined) {
      ruleError("INVALID_SELECTION", "涉猎发动后必须完成每种已展示花色各一张的选择。");
    }
    const pileId = `shelie:${pending.eventId}`;
    const pile = actor.extraPiles[pileId] ?? [];
    if (pile.length !== 5 || new Set(pile.map((card) => card.id)).size !== 5 ||
        pending.selectedCardIds.some((cardId) => !pile.some((card) => card.id === cardId))) {
      throw new Error("涉猎展示牌堆与权威续体不一致。");
    }
    const settlement = planShelieSettlement({
      ownerId: actor.id,
      revealedCards: pile.map((card) => ({ id: card.id, printedSuit: card.suit })),
      selectedCardIds: action.cardIds ?? [],
    });
    if (!settlement.ok) ruleError("INVALID_SELECTION", settlement.detail);
    const zones = sessionZoneState(session);
    commitLiveMoveBatch(session, zones.state, {
      batchId: nextMoveBatchId(session),
      intents: [
        {
          cardIds: settlement.value.gainCardIds,
          from: { kind: "extra", playerId: actor.id, pileId },
          to: { kind: "hand", playerId: actor.id },
          reason: "skill_effect",
          visibility: "public",
          actorId: actor.id,
          sourceId: actor.id,
          targetId: actor.id,
          skillId: "shelie",
          frameId: pending.eventId,
        },
        {
          cardIds: settlement.value.discardCardIds,
          from: { kind: "extra", playerId: actor.id, pileId },
          to: { kind: "discard" },
          reason: "skill_effect",
          visibility: "public",
          actorId: actor.id,
          sourceId: actor.id,
          targetId: actor.id,
          skillId: "shelie",
          frameId: pending.eventId,
        },
      ],
    });
    syncSessionZones(session, zones);
    delete actor.extraPiles[pileId];
    addLog(session, "card", `${actor.id} 以涉猎获得 ${settlement.value.gainCardIds.length} 张牌，其余展示牌置入弃牌堆。`);
    finishDrawPhase(session, actor);
    return;
  }

  if (pending.skillId === "tuxi") {
    if (pending.stage !== "tuxi_select") throw new Error("突袭状态无效。");
    if (!action.activate) {
      addLog(session, "turn", `${actor.id} 未发动突袭。`);
      continueDrawPhaseAfterTuxi(session, actor);
      return;
    }
    const targets = action.targetIds ?? [];
    const tokens = action.tokens ?? [];
    if (targets.length < 1 || targets.length > 2 || tokens.length !== targets.length || new Set(targets).size !== targets.length) {
      ruleError("INVALID_SELECTION", "突袭必须选择一至两名不同角色，并为每人选择一张匿名手牌。");
    }
    const gained: Array<{ source: GamePlayer; card: Card }> = [];
    targets.forEach((targetId, index) => {
      const target = getLivingPlayer(session, targetId);
      if (target.id === actor.id || target.hand.length === 0) ruleError("INVALID_TARGET", "突袭目标必须是有手牌的其他角色。");
      const token = tokens[index] ?? "";
      if (!/^hand:\d+$/.test(token)) ruleError("INVALID_SELECTION", "突袭只能选择匿名手牌令牌。");
      const handIndex = Number(token.slice(5));
      const card = target.hand[handIndex];
      if (!card) ruleError("INVALID_SELECTION", "突袭所选手牌已经不存在。");
      gained.push({ source: target, card });
    });
    for (const entry of gained) actor.hand.push(removeCard(session, entry.source, entry.card.id));
    addLog(session, "card", `${actor.id} 发动突袭，获得了 ${gained.length} 名角色的各一张手牌。`);
    finishDrawPhase(session, actor);
    return;
  }

  if (pending.skillId === "liegong" && pending.stage === "invoke" && pending.slash) {
    const slash = cloneSlashPending(pending.slash);
    if (slash.attackerId !== actor.id) throw new Error("烈弓技能所有者与杀的来源不一致。");
    if (!action.activate) {
      addLog(session, "card", `${actor.id} 未对 ${slash.targetId} 发动烈弓。`);
      beginSlashTarget(session, { ...slash, liegongChecked: true });
      return;
    }
    const target = getPlayer(session, slash.targetId);
    if (!isLiegongEligibleForSlash(session, slash, actor, target)) {
      ruleError("INVALID_SKILL", "当前杀已不满足烈弓的发动条件。");
    }
    addLog(session, "card", `${actor.id} 对 ${target.id} 发动烈弓，其不能使用或打出闪。`);
    beginSlashTarget(session, { ...slash, liegongChecked: true, dodgeProhibited: true });
    return;
  }

  if (pending.skillId === "tieqi" && pending.stage === "invoke" && pending.slash) {
    const slash = cloneSlashPending(pending.slash);
    if (!action.activate) {
      addLog(session, "card", `${actor.id} 未对 ${slash.targetId} 发动铁骑。`);
      beginSlashTarget(session, { ...slash, tieqiChecked: true });
      return;
    }
    const checked = { ...slash, tieqiChecked: true };
    updateSlashResponseCommitment(session, checked);
    beginStandardJudgment(
      session,
      actor,
      { type: "skill", id: "tieqi" },
      { color: "red" },
      { type: "tieqi", slash: checked },
    );
    return;
  }

  if (pending.stage === "invoke" && pending.aftermath) {
    const aftermath = cloneStandardDamageAftermath(pending.aftermath);
    if (!action.activate) {
      addLog(session, "damage", `${actor.id} 未发动${pending.skillId}。`);
      continueDamageAftermath(session, aftermath);
      return;
    }
    if (!hasEffectiveSkill(session, actor, pending.skillId)) ruleError("INVALID_SKILL", "该伤害后技能已经失去。");
    if (pending.skillId === "jianxiong") {
      const available = new Set(aftermath.damageCardIds);
      const gained = session.resolvingCards.filter((card) => available.has(card.id));
      session.resolvingCards = session.resolvingCards.filter((card) => !available.has(card.id));
      actor.hand.push(...gained);
      addLog(session, "card", `${actor.id} 发动奸雄，获得了仍在处理区的 ${gained.length} 张伤害实体牌。`);
      continueDamageAftermath(session, aftermath);
      return;
    }
    if (pending.skillId === "yiji") {
      const count = Math.min(2, session.deck.length + session.discardPile.length);
      if (count === 0) {
        continueDamageAftermath(session, aftermath);
        return;
      }
      const transition = drawTopCards(deckServiceState(session), count);
      applyDeckServiceState(session, transition.state);
      const pileId = `yiji:${pending.eventId}:${pending.promptId}`;
      actor.extraPiles[pileId] = transition.cards.map(cloneCard);
      session.pendingResponse = {
        ...pending,
        stage: "yiji_distribute",
        promptId: standardPromptId(pending.eventId, "yiji", actor.id, `distribute-${aftermath.remainingSkillIds.length}`),
        selectedCardIds: transition.cards.map((card) => card.id),
        aftermath,
      };
      addLog(session, "card", `${actor.id} 发动遗计，私下观看牌堆顶 ${count} 张牌。`);
      return;
    }
    if (pending.skillId === "fankui") {
      session.pendingResponse = {
        ...pending,
        stage: "fankui_select",
        promptId: standardPromptId(pending.eventId, "fankui", actor.id, "select"),
        aftermath,
      };
      return;
    }
    if (pending.skillId === "ganglie") {
      beginStandardJudgment(
        session,
        actor,
        { type: "skill", id: "ganglie" },
        { suits: ["heart"], negate: true },
        { type: "ganglie", aftermath },
      );
      return;
    }
  }

  if (pending.skillId === "yiji" && pending.stage === "yiji_distribute" && pending.aftermath && pending.selectedCardIds) {
    if (!action.activate) ruleError("INVALID_SELECTION", "遗计发动后必须分配全部观看牌。");
    const allocations = action.allocations ?? [];
    if (
      allocations.length !== pending.selectedCardIds.length ||
      new Set(allocations.map((entry) => entry.cardId)).size !== allocations.length ||
      pending.selectedCardIds.some((cardId) => !allocations.some((entry) => entry.cardId === cardId))
    ) ruleError("INVALID_SELECTION", "遗计必须将每张观看牌恰好分配一次。");
    const pileEntry = Object.entries(actor.extraPiles).find(([, cards]) =>
      cards.length === pending.selectedCardIds!.length && pending.selectedCardIds!.every((id) => cards.some((card) => card.id === id))
    );
    if (!pileEntry) ruleError("INVALID_SELECTION", "遗计私有牌堆已经失效。");
    const [pileId, pile] = pileEntry;
    for (const allocation of allocations) {
      const target = getLivingPlayer(session, allocation.targetId);
      const index = pile.findIndex((card) => card.id === allocation.cardId);
      if (index < 0) ruleError("INVALID_SELECTION", "遗计分配牌不存在。");
      const [card] = pile.splice(index, 1);
      if (!card) throw new Error("遗计移牌失败。");
      target.hand.push(card);
    }
    delete actor.extraPiles[pileId];
    addLog(session, "card", `${actor.id} 完成遗计分配。`);
    continueDamageAftermath(session, pending.aftermath);
    return;
  }

  if (pending.skillId === "fankui" && pending.stage === "fankui_select" && pending.aftermath?.sourceId) {
    if (!action.activate) ruleError("INVALID_SELECTION", "反馈发动后必须选择一张来源牌。");
    const source = getLivingPlayer(session, pending.aftermath.sourceId);
    if (action.tokens?.length !== 1) ruleError("INVALID_SELECTION", "Fankui requires exactly one source-card selection.");
    const token = action.tokens?.[0] ?? "";
    let gained: Card | undefined;
    if (/^hand:\d+$/.test(token)) {
      const index = Number(token.slice(5));
      const card = source.hand[index];
      if (card) gained = removeCard(session, source, card.id);
    } else if (token.startsWith("equipment:")) {
      const slot = token.slice("equipment:".length) as EquipmentSlot;
      if (["weapon", "armor", "offensive_horse", "defensive_horse"].includes(slot) && source.equipment[slot]) {
        gained = loseEquipment(session, source, slot);
      }
    }
    if (!gained) ruleError("INVALID_SELECTION", "反馈所选来源牌不存在。");
    actor.hand.push(gained);
    addLog(session, "card", `${actor.id} 发动反馈，获得了 ${source.id} 的一张牌。`);
    continueDamageAftermath(session, pending.aftermath);
    return;
  }

  if (pending.skillId === "ganglie" && pending.stage === "ganglie_punish" && pending.aftermath && pending.sourceId) {
    const punished = actor;
    const owner = getPlayer(session, pending.sourceId);
    if (action.activate) {
      const cardIds = action.cardIds ?? [];
      if (cardIds.length !== 2 || new Set(cardIds).size !== 2 || cardIds.some((id) => !punished.hand.some((card) => card.id === id))) {
        ruleError("INVALID_SELECTION", "刚烈必须弃置两张不同手牌，或选择受到伤害。");
      }
      const moveBatchId = nextMoveBatchId(session);
      session.discardPile.push(...cardIds.map((id) => removeCard(session, punished, id, moveBatchId)));
      addLog(session, "card", `${punished.id} 为刚烈弃置两张手牌。`);
      continueDamageAftermath(session, pending.aftermath);
      return;
    }
    const paused = dealDamage(
      session,
      punished,
      owner,
      1,
      "normal",
      "受到刚烈惩罚",
      { type: "standard_damage", aftermath: cloneStandardDamageAftermath(pending.aftermath) },
    );
    if (!paused) continueDamageAftermath(session, pending.aftermath);
    return;
  }

  if (pending.skillId === "liuli" && pending.stage === "liuli_redirect") {
    applyLiuliRedirect(session, pending, action);
    return;
  }
  ruleError("INVALID_RESPONSE", "标准技能动作与当前阶段不匹配。");
}

function completeSlashAfterDamage(
  session: GameSession,
  pending: Extract<PendingResponse, { type: "slash" }>,
): void {
  if (session.status === "finished") {
    consumeSlashResponseCommitment(session, pending);
    finishResolvingCards(session);
    return;
  }
  advanceSlashSequence(session, pending);
}

function beginSlashDamage(
  session: GameSession,
  pending: Extract<PendingResponse, { type: "slash" }>,
): void {
  updateSlashResponseCommitment(session, pending);
  const attacker = getPlayer(session, pending.attackerId);
  const target = getPlayer(session, pending.targetId);
  if (!target.alive) {
    advanceSlashSequence(session, pending);
    return;
  }
  if (
    attacker.alive &&
    attacker.equipment.weapon?.kind === "han_bing_jian" &&
    (target.hand.length > 0 || Object.keys(target.equipment).length > 0)
  ) {
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "weapon_action",
      weaponKind: "han_bing_jian",
      stage: "hanbing_prevent",
      attackerId: attacker.id,
      targetId: attacker.id,
      victimId: target.id,
      slash: pending,
    };
    return;
  }

  finishResponse(session);
  const guDingBonus = attacker.alive && attacker.equipment.weapon?.kind === "gu_ding_dao" && target.hand.length === 0 ? 1 : 0;
  const enteredDying = dealDamageWithChain(
    session,
    target,
    attacker,
    pending.damage + guDingBonus,
    pending.nature,
    `未出闪，被${cardName(pending.slashKind)}命中`,
    { type: "slash_sequence", pending },
    pending.armorIgnored,
    pending.damageCardIds ?? [pending.cardId],
  );
  if (!enteredDying) completeSlashAfterDamage(session, pending);
}

function continueSlashDodgedAfterMengjin(
  session: GameSession,
  pending: Extract<PendingResponse, { type: "slash" }>,
): void {
  updateSlashResponseCommitment(session, pending);
  const attacker = getPlayer(session, pending.attackerId);
  const slashCardIds = attacker.hand.filter((card) =>
    isSlashCardKind(card.kind) || isWushenLockedHeartHandCard(session, attacker, card)
  ).map((card) => card.id);
  if (attacker.alive && attacker.equipment.weapon?.kind === "qing_long_yan_yue_dao" && slashCardIds.length > 0) {
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "weapon_action",
      weaponKind: "qing_long_yan_yue_dao",
      stage: "qinglong_followup",
      attackerId: attacker.id,
      targetId: attacker.id,
      victimId: pending.targetId,
      slash: pending,
    };
    return;
  }
  advanceSlashSequence(session, pending);
}

function evaluateLiveMengjin(
  session: GameSession,
  pending: Extract<PendingResponse, { type: "slash" }>,
): ReturnType<typeof evaluateMengjin> {
  const attacker = getPlayer(session, pending.attackerId);
  const target = getPlayer(session, pending.targetId);
  const targetCards = [
    ...target.hand.map((card) => fireRuleCard(session, target, card, "hand")),
    ...Object.values(target.equipment).map((card) => fireRuleCard(session, target, card, "equipment")),
  ];
  const required = pending.requiredDodgeCount ?? 1;
  return evaluateMengjin({
    skillOwnerId: attacker.id,
    skillOwnerAlive: attacker.alive,
    skillEffective: attacker.alive && hasEffectiveSkill(session, attacker, "mengjin"),
    targetId: target.id,
    targetAlive: target.alive,
    dodge: {
      requiredCount: required,
      successfulCountBefore: required - 1,
      thisDodgeSucceeded: true,
      finalSlashOutcome: "dodged",
      forcedHitAfterDodge: false,
    },
    targetCards,
  });
}

function offerMengjinAfterSlashDodged(
  session: GameSession,
  pending: Extract<PendingResponse, { type: "slash" }>,
): void {
  updateSlashResponseCommitment(session, pending);
  const attacker = getPlayer(session, pending.attackerId);
  const target = getPlayer(session, pending.targetId);
  const decision = evaluateLiveMengjin(session, pending);
  if (!decision.ok) {
    continueSlashDodgedAfterMengjin(session, pending);
    return;
  }
  const eventId = allocateEventId(session);
  session.turn.phase = "respond";
  session.pendingResponse = {
    type: "standard_skill",
    targetId: attacker.id,
    promptId: standardPromptId(eventId, "mengjin", attacker.id, "discard"),
    eventId,
    skillId: "mengjin",
    stage: "mengjin_discard",
    slash: pending,
  };
  addLog(session, "card", `${attacker.id} 的杀被 ${target.id} 的最终一张闪抵消，可以发动猛进。`);
}

function completeSlashDodged(
  session: GameSession,
  pending: Extract<PendingResponse, { type: "slash" }>,
): void {
  updateSlashResponseCommitment(session, pending);
  const attacker = getPlayer(session, pending.attackerId);
  const ownCardCount = attacker.hand.length + Object.keys(attacker.equipment).length;
  if (attacker.alive && attacker.equipment.weapon?.kind === "guan_shi_fu" && ownCardCount >= 2) {
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "weapon_action",
      weaponKind: "guan_shi_fu",
      stage: "guanshi_force_hit",
      attackerId: attacker.id,
      targetId: attacker.id,
      victimId: pending.targetId,
      slash: pending,
    };
    return;
  }
  offerMengjinAfterSlashDodged(session, pending);
}

function resumeAcceptedDodge(session: GameSession, resume: PendingLeijiDodge["resume"]): void {
  if (resume.type === "mass_attack") {
    advanceMassAttack(session, resume.pending);
    return;
  }
  if ((resume.pending.dodgesPlayed ?? 0) < (resume.pending.requiredDodgeCount ?? 1)) {
    session.turn.phase = "respond";
    const next = { ...resume.pending, armorAttempted: false };
    updateSlashResponseCommitment(session, next);
    session.pendingResponse = next;
    return;
  }
  completeSlashDodged(session, resume.pending);
}

function offerLeijiAfterDodge(
  session: GameSession,
  owner: GamePlayer,
  provenance: PendingLeijiDodge["provenance"],
  resume: PendingLeijiDodge["resume"],
): void {
  if (resume.type === "mass_attack") updateMassAttackResponseCommitment(session, resume.pending);
  else updateSlashResponseCommitment(session, resume.pending);
  if (!owner.alive || !hasEffectiveSkill(session, owner, "leiji")) {
    resumeAcceptedDodge(session, resume);
    return;
  }
  const eventId = allocateEventId(session);
  session.turn.phase = "respond";
  session.pendingResponse = {
    type: "standard_skill",
    targetId: owner.id,
    promptId: standardPromptId(eventId, "leiji", owner.id, "target"),
    eventId,
    skillId: "leiji",
    stage: "leiji_target",
    leijiDodge: {
      dodgeEventId: `dodge:${eventId}:${owner.id}`,
      attributedPlayerId: owner.id,
      method: "respond",
      provenance,
      resume,
    },
  };
  addLog(session, "card", `${owner.id} 打出或使用了闪，可以发动雷击。`);
}

function acceptedDodgeProvenance(
  session: GameSession,
  card: Card,
  skillId: Extract<GeneralSkillId, "longdan" | "qingguo" | "guhuo" | "longhun"> | null,
  physicalCardIds: readonly CardId[] = [card.id],
): PendingLeijiDodge["provenance"] {
  if (skillId !== null) {
    return { type: "view_as", skillId, physicalCardIds: [...physicalCardIds] };
  }
  const printedKind = session.virtualCardOrigins[card.id];
  if (printedKind !== undefined) throw new Error("虚拟闪缺少权威技能来源。");
  return { type: "physical", cardId: card.id, printedKind: card.kind };
}

function responseCard(
  session: GameSession,
  player: GamePlayer,
  cardId: CardId,
  required: "slash" | "dodge",
): Card {
  const card = player.hand.find((candidate) => candidate.id === cardId);
  if (!card) ruleError("CARD_NOT_FOUND", `手牌中不存在 ${cardId}。`);
  const wushenReplaced = isWushenLockedHeartHandCard(session, player, card);
  const valid = required === "slash"
    ? isSlashCardKind(card.kind) && (!wushenReplaced || card.kind === "slash")
    : card.kind === "dodge" && !wushenReplaced;
  if (!valid) {
    ruleError(
      "INVALID_RESPONSE",
      `当前响应只能使用${required === "slash" ? "杀" : "闪"}。`,
    );
  }
  return removeCard(session, player, card.id);
}

interface SlashResponsePlay {
  readonly cards: Card[];
  readonly slashKind: Extract<CardKind, "slash" | "fire_slash" | "thunder_slash">;
  readonly color: "red" | "black" | "colorless";
  readonly name: string;
}

function playSlashResponseCards(
  session: GameSession,
  player: GamePlayer,
  cardId: CardId | null | undefined,
  cardIds: readonly CardId[] | undefined,
): SlashResponsePlay | null {
  if (cardIds && cardIds.length > 0) {
    if (player.equipment.weapon?.kind !== "zhang_ba_she_mao") {
      ruleError("INVALID_RESPONSE", "未装备丈八蛇矛，不能将两张手牌当作杀。");
    }
    if (cardIds.length !== 2 || new Set(cardIds).size !== 2) {
      ruleError("INVALID_RESPONSE", "丈八蛇矛必须选择两张不同的手牌。");
    }
    const selected = cardIds.map((id) => player.hand.find((card) => card.id === id));
    if (selected.some((card) => !card)) ruleError("CARD_NOT_FOUND", "丈八蛇矛所选手牌已不存在。");
    const moveBatchId = nextMoveBatchId(session);
    const cards = selected.map((card) => removeCard(session, player, card!.id, moveBatchId));
    const color = cards.every((card) => isRedCard(session, player, card))
      ? "red"
      : cards.every((card) => isBlackCard(session, player, card)) ? "black" : "colorless";
    if (session.currentPlayerId === player.id) session.turn.slashRespondedInPlayPhase = true;
    return { cards, slashKind: "slash", color, name: "丈八蛇矛转化的杀" };
  }
  if (cardId == null) return null;
  const card = responseCard(session, player, cardId, "slash");
  const slashKind = card.kind as Extract<CardKind, "slash" | "fire_slash" | "thunder_slash">;
  if (session.currentPlayerId === player.id) session.turn.slashRespondedInPlayPhase = true;
  return {
    cards: [card],
    slashKind,
    color: isBlackCard(session, player, card) ? "black" : "red",
    name: card.name,
  };
}

function applySlashResponse(
  session: GameSession,
  pending: Extract<PendingResponse, { type: "slash" }>,
  target: GamePlayer,
  cardId: CardId | null | undefined,
  dodgeSkillId: Extract<GeneralSkillId, "longdan" | "qingguo" | "guhuo" | "longhun"> | null = null,
  dodgePhysicalCardIds?: readonly CardId[],
): void {
  if (cardId != null) {
    const played = responseCard(session, target, cardId, "dodge");
    session.resolvingCards.push(played);
    const required = pending.requiredDodgeCount ?? 1;
    const dodgesPlayed = (pending.dodgesPlayed ?? 0) + 1;
    const progressed = { ...pending, requiredDodgeCount: required, dodgesPlayed };
    if (dodgesPlayed < required) {
      addLog(session, "card", `${target.id} 打出第 ${dodgesPlayed}/${required} 张闪，仍需继续响应${cardName(pending.slashKind)}。`);
    } else {
      addLog(session, "card", `${target.id} 打出 ${required} 张闪，抵消了${cardName(pending.slashKind)}。`);
    }
    offerLeijiAfterDodge(
      session,
      target,
      acceptedDodgeProvenance(session, played, dodgeSkillId, dodgePhysicalCardIds),
      { type: "slash", pending: progressed },
    );
    return;
  }
  beginSlashDamage(session, pending);
}

function applyDuelResponse(
  session: GameSession,
  pending: Extract<PendingResponse, { type: "duel" }>,
  target: GamePlayer,
  cardId: CardId | null | undefined,
  cardIds?: readonly CardId[],
): void {
  if (cardId != null || (cardIds && cardIds.length > 0)) {
    const response = playSlashResponseCards(session, target, cardId, cardIds);
    if (!response) throw new Error("决斗响应牌解析失败。");
    session.resolvingCards.push(...response.cards);
    const required = pending.requiredSlashCount ?? 1;
    const slashesPlayed = (pending.slashesPlayed ?? 0) + 1;
    if (slashesPlayed < required) {
      const next = { ...pending, requiredSlashCount: required, slashesPlayed };
      updateDuelResponseCommitment(session, next);
      session.pendingResponse = next;
      addLog(session, "card", `${target.id} 在决斗中打出第 ${slashesPlayed}/${required} 张杀，仍需继续响应。`);
      return;
    }
    const opponent = getPlayer(session, pending.attackerId);
    if (!opponent.alive) {
      addLog(session, "card", `${target.id} 在决斗中打出${response.name}，但对方已经死亡，决斗结算结束。`);
      consumeDuelResponseCommitment(session, pending);
      finishTrickResolution(session);
      return;
    }
    const next = {
      ...pending,
      attackerId: target.id,
      targetId: opponent.id,
      requiredSlashCount: wushuangResponseCount(session, target),
      slashesPlayed: 0,
    };
    updateDuelResponseCommitment(session, next);
    session.pendingResponse = next;
    addLog(session, "card", `${target.id} 在决斗中打出${response.name}，轮到 ${opponent.id} 响应。`);
    return;
  }

  consumeDuelResponseCommitment(session, pending);
  finishResponse(session);
  const opponent = getPlayer(session, pending.attackerId);
  const enteredDying = dealDamage(
    session,
    target,
    opponent,
    1 + luoyiDamageBonus(session, opponent),
    "normal",
    "在决斗中未出杀",
    { type: "finish_effect" },
    [pending.cardId],
  );
  if (!enteredDying) finishResolvingCards(session);
}

type MassAttackFinishState = Pick<PendingMassAttackResponse,
  "attackerId" | "cardId" | "damageCardIds" | "sourceSkillId" | "cardKind">;

function claimFinishedNanmanByJuxiang(
  session: GameSession,
  finished: MassAttackFinishState,
): boolean {
  if (finished.cardKind !== "barbarian_invasion") return false;
  const physicalIds = finished.damageCardIds ?? [finished.cardId];
  const physicalCards = physicalIds.flatMap((cardId) => {
    const card = session.resolvingCards.find((candidate) => candidate.id === cardId);
    const printedKind = card ? session.virtualCardOrigins[card.id] ?? card.kind : null;
    return card && printedKind ? [{
      id: card.id,
      kind: printedKind,
      category: getCardDefinition(printedKind).category,
      printedSuit: card.suit,
      rank: card.rank,
      ownerId: null,
      zone: "processing" as const,
      equipmentSlot: getCardDefinition(printedKind).equipmentSlot ?? null,
      physical: true,
    }] : [];
  });
  const cardUser = getPlayer(session, finished.attackerId);
  const owners = livingPlayersInSeatOrderFrom(session, cardUser)
    .filter((owner) => owner.id !== cardUser.id && hasEffectiveSkill(session, owner, "juxiang"));
  for (const owner of owners) {
    const plan = planJuxiangClaim({
      context: forestSkillContext(session, owner, "juxiang"),
      cardUserId: cardUser.id,
      effectiveCardKind: finished.cardKind,
      physicalCards,
      cardStillInProcessing: physicalIds.length === 1 && physicalCards.length === 1,
      wouldOtherwiseEnterDiscard: true,
      claimedByEarlierJuxiang: false,
    });
    if (!plan.ok) continue;
    const adapted = sessionZoneState(session);
    commitLiveMoveBatch(session, adapted.state, {
      batchId: nextMoveBatchId(session),
      intents: [{
        cardIds: [plan.value.physicalCardId],
        from: { kind: "processing", frameId: adapted.processingFrameId },
        to: { kind: "hand", playerId: owner.id },
        reason: "gain",
        visibility: "public",
        actorId: owner.id,
        sourceId: cardUser.id,
        targetId: owner.id,
        skillId: "juxiang",
        useId: null,
        frameId: adapted.processingFrameId,
      }],
    });
    syncSessionZones(session, adapted);
    addLog(session, "card", `${owner.id} 的巨象令其获得结算完毕的南蛮入侵。`);
    return true;
  }
  return false;
}

function finishMassAttackResolution(session: GameSession, finished: MassAttackFinishState): void {
  finishResponse(session);
  claimFinishedNanmanByJuxiang(session, finished);
  finishResolvingCards(session);
  addLog(
    session,
    "card",
    `${finished.cardKind === "barbarian_invasion" ? "南蛮入侵" : "万箭齐发"}结算完毕。`,
  );
  if (session.status === "playing" && !getPlayer(session, session.currentPlayerId).alive) {
    beginNextTurn(session);
  }
}

function advanceMassAttack(
  session: GameSession,
  pending: PendingMassAttackResponse,
): void {
  updateMassAttackResponseCommitment(session, pending);
  for (const [index, playerId] of pending.remainingTargetIds.entries()) {
    const candidate = getPlayer(session, playerId);
    if (!candidate.alive || isMassAttackImmune(session, candidate, pending.cardKind) ||
      isForestNanmanImmune(session, candidate, pending.cardKind)) continue;
    const nextPending: PendingMassAttackResponse = {
      ...pending,
      targetId: candidate.id,
      remainingTargetIds: pending.remainingTargetIds.slice(index + 1),
      armorAttempted: false,
    };
    updateMassAttackResponseCommitment(session, nextPending);
    beginNullification(session, { type: "mass_attack", pending: nextPending }, pending.cardKind);
    return;
  }
  consumeMassAttackResponseCommitment(session, pending);
  finishMassAttackResolution(session, pending);
}

function applyMassAttackResponse(
  session: GameSession,
  pending: PendingMassAttackResponse,
  target: GamePlayer,
  cardId: CardId | null | undefined,
  cardIds?: readonly CardId[],
  dodgeSkillId: Extract<GeneralSkillId, "longdan" | "qingguo" | "guhuo" | "longhun"> | null = null,
  dodgePhysicalCardIds?: readonly CardId[],
): void {
  if (cardId != null || (pending.responseKind === "slash" && cardIds && cardIds.length > 0)) {
    const cards = pending.responseKind === "slash"
      ? playSlashResponseCards(session, target, cardId, cardIds)?.cards
      : cardId != null ? [responseCard(session, target, cardId, "dodge")] : undefined;
    if (!cards) throw new Error("群体锦囊响应牌解析失败。");
    session.resolvingCards.push(...cards);
    addLog(session, "card", `${target.id} 打出${pending.responseKind === "slash" && cards.length === 2 ? "丈八蛇矛转化的杀" : cards[0]!.name}，响应了${cardName(pending.cardKind)}。`);
  } else {
    // Huoshou binds once for the whole Nanman use. A dead bound owner does not
    // fall back to the original user; mass attacks without a binding keep the
    // original source even if that source later dies.
    let attacker: GamePlayer | null = getPlayer(session, pending.attackerId);
    if (pending.cardKind === "barbarian_invasion" && pending.huoshouSourceId !== undefined) {
      const boundOwner = pending.huoshouSourceId === null ? null : getPlayer(session, pending.huoshouSourceId);
      const decision = resolveHuoshouDamageSource({
        binding: {
          skillId: "huoshou",
          originalCardUserId: pending.attackerId,
          boundHuoshouOwnerId: pending.huoshouSourceId,
          initiallyResolvedDamageSourceId: pending.huoshouSourceId ?? pending.attackerId,
          bindingPersistsForEntireCardUse: true,
        },
        boundOwnerStillAlive: boundOwner?.alive ?? false,
      });
      if (!decision.ok) throw new Error(decision.detail);
      attacker = decision.value.damageSourceId === null
        ? null
        : getPlayer(session, decision.value.damageSourceId);
    }
    const enteredDying = dealDamage(
      session,
      target,
      attacker,
      1,
      "normal",
      `未出${pending.responseKind === "slash" ? "杀" : "闪"}，受到${cardName(pending.cardKind)}影响`,
      {
        type: "mass_attack",
        pending: {
          ...pending,
          damageCardIds: [...(pending.damageCardIds ?? [pending.cardId])],
          remainingTargetIds: [...pending.remainingTargetIds],
        },
      },
      pending.damageCardIds ?? [pending.cardId],
    );
    if (enteredDying) return;
  }

  if (session.status === "playing" && pending.responseKind === "dodge" && cardId != null) {
    const played = session.resolvingCards.find((card) => card.id === cardId);
    if (!played) throw new Error("万箭齐发的有效闪不在处理区。");
    offerLeijiAfterDodge(
      session,
      target,
      acceptedDodgeProvenance(session, played, dodgeSkillId, dodgePhysicalCardIds),
      { type: "mass_attack", pending },
    );
  } else if (session.status === "playing") advanceMassAttack(session, pending);
  else {
    consumeMassAttackResponseCommitment(session, pending);
    finishResolvingCards(session);
  }
}

function peachAllowedByWansha(session: GameSession, peachUserId: PlayerId, victimId: PlayerId): boolean {
  const owner = getPlayer(session, session.currentPlayerId);
  if (!owner.alive || !hasEffectiveSkill(session, owner, "wansha")) return true;
  const dying = topDyingFrame(session.completeRules.dying);
  if (!dying || dying.victimId !== victimId) {
    throw new Error("完杀校验缺少当前濒死栈顶。 ");
  }
  const decision = evaluateWanshaPeach({
    context: {
      ownerId: owner.id,
      ownerAlive: owner.alive,
      skillEffective: true,
    },
    activeTurnPlayerId: session.currentPlayerId,
    peachUserId,
    currentDyingPlayerId: dying.victimId,
    effectiveCardKind: "peach",
  });
  if (!decision.ok) throw new Error(decision.detail);
  return decision.value.allowed;
}

function rescueCardIds(session: GameSession, player: GamePlayer, victimId: PlayerId): CardId[] {
  const peachAllowed = peachAllowedByWansha(session, player.id, victimId);
  return player.hand
    .filter((card) => !isWushenLockedHeartHandCard(session, player, card) &&
      (peachAllowed && card.kind === "peach" || player.id === victimId && card.kind === "wine"))
    .map((card) => card.id);
}

function resumeLiveDamageAfterDying(
  session: GameSession,
  cursor: Extract<DyingResume, { type: "damage_flow" }>,
  dyingFrame: DyingFrame,
): void {
  const flow = session.completeRules.damageFlow;
  const frame = flow.frames.at(-1);
  if (!frame) throw new Error("Dying cursor has no active damage frame");
  const barrier = frame.dying;
  if (frame.frameId !== cursor.frameId
    || frame.damageId !== cursor.damageId
    || frame.step !== "dying"
    || frame.status !== "active"
    || barrier === null
    || barrier.frameId !== cursor.frameId
    || barrier.damageId !== cursor.damageId
    || barrier.dyingId !== cursor.dyingId
    || barrier.targetId !== frame.damage.targetId
    || barrier.hpAfterDamage !== frame.damage.hpAfter
  ) {
    throw new Error("Dying cursor does not match the active root damage barrier");
  }

  const victim = getPlayer(session, barrier.targetId);
  const protectedByBuqu = dyingFrame.stage === "rescued" && dyingFrame.survivalSkillId === "buqu" && victim.alive && victim.hp <= 0;
  const outcome = protectedByBuqu ? "protected_by_buqu" as const
    : victim.alive && victim.hp > 0 ? "rescued" as const
      : !victim.alive && victim.hp <= 0 ? "dead" as const
        : null;
  if (outcome === null) throw new Error("Dying resolution left an invalid life state");
  session.completeRules.damageFlow = outcome === "protected_by_buqu"
    ? resumeDamageAfterDyingFlow(flow, lifePlayerSnapshot(session), {
        frameId: cursor.frameId,
        dyingId: cursor.dyingId,
        expectedRevision: flow.revision,
        outcome,
        proof: dyingFrame,
      })
    : resumeDamageAfterDyingFlow(flow, lifePlayerSnapshot(session), {
        frameId: cursor.frameId,
        dyingId: cursor.dyingId,
        expectedRevision: flow.revision,
        outcome,
      });
  session.pendingResponse = null;
}

function completeResolvedDying(
  session: GameSession,
  frame: DyingFrame,
  resume: DyingResume,
  resumeRootContinuation: boolean,
): boolean {
  if (frame.stage !== "rescued" && frame.stage !== "death_confirmed") {
    throw new Error("Cannot complete an unresolved DyingStack frame");
  }
  if (resume.type === "damage_flow") resumeLiveDamageAfterDying(session, resume, frame);
  popResolvedDyingFrame(session.completeRules.dying, frame.frameId);
  if (resume.type === "damage_flow") return driveLiveDamageFlow(session, resumeRootContinuation);
  if (resumeRootContinuation) resumeAfterDying(session, resume);
  return false;
}

function resumeAfterDying(session: GameSession, resume: DyingResume): void {
  // DamageFlow must close even when death already established a winner. Only
  // the restored business continuation observes the finished-game shortcut.
  if (resume.type === "damage_flow") {
    const frame = topDyingFrame(session.completeRules.dying);
    if (!frame || frame.frameId !== resume.dyingId || (frame.stage !== "rescued" && frame.stage !== "death_confirmed")) {
      throw new Error("DamageFlow dying resume has no matching resolved DyingStack frame");
    }
    completeResolvedDying(session, frame, resume, true);
    return;
  }
  if (session.status === "finished") {
    if (resume.type === "wumou") {
      consumeFinishedWumouContinuation(session, resume.ownerId, resume.eventId, resume.continuation);
    } else if (resume.type === "shenfen") {
      consumeFinishedShenfenContinuation(session, resume.continuation);
    } else if (resume.type === "yeyan") {
      consumeFinishedYeyanContinuation(session, resume.continuation);
    } else {
      consumeAbandonedDyingResumeCommitment(session, resume);
    }
    finishResolvingCards(session);
    return;
  }
  if (resume.type === "mass_attack") {
    advanceMassAttack(session, resume.pending);
    return;
  }
  if (resume.type === "chain_damage") {
    continueChainDamage(session, resume, true);
    return;
  }
  if (resume.type === "slash_sequence") {
    completeSlashAfterDamage(session, resume.pending);
    return;
  }
  if (resume.type === "leiji") {
    resumeAcceptedDodge(session, resume.resume);
    return;
  }
  if (resume.type === "standard_damage") {
    const victim = getPlayer(session, resume.aftermath.targetId);
    if (victim.alive) continueDamageAftermath(session, resume.aftermath);
    else resumeAfterDying(session, resume.aftermath.resume);
    return;
  }
  if (resume.type === "forest_end") {
    const player = getPlayer(session, resume.playerId);
    if (player.alive && session.currentPlayerId === player.id) continueEndPhaseAfterBenghuai(session);
    else if (!getPlayer(session, session.currentPlayerId).alive) beginNextTurn(session);
    return;
  }
  if (resume.type === "qinyin") {
    continueQinyinHpLoss(session, resume);
    return;
  }
  if (resume.type === "wumou") {
    if (resume.eventId >= session.nextEventId) throw new Error("无谋濒死续体事件无效。");
    completeWumouContinuation(session, resume.ownerId, resume.eventId, resume.continuation);
    return;
  }
  if (resume.type === "shenfen") {
    continueShenfen(session, resume.continuation);
    return;
  }
  if (resume.type === "yeyan") {
    continueYeyanDamage(session, resume.continuation);
    return;
  }
  if (resume.type === "luanwu") {
    advanceLuanwu(session, resume);
    return;
  }
  if (resume.type === "guhuo") {
    continueGuhuoConsequences(session, resume.pending);
    return;
  }
  if (resume.type === "qiangxi") {
    continueQiangxiDamage(session, resume);
    return;
  }
  if (resume.type === "skill") {
    finishResolvingCards(session);
    const player = getPlayer(session, resume.playerId);
    if (player.alive && resume.skillId === "kurou") {
      const drawn = drawCards(session, player, 2);
      addLog(session, "card", `${player.id} 完成苦肉，摸了 ${drawn} 张牌。`);
      session.turn.phase = "play";
    } else if (session.status === "playing" && !getPlayer(session, session.currentPlayerId).alive) {
      beginNextTurn(session);
    }
    return;
  }
  if (resume.type === "turn_start") {
    finishResolvingCards(session);
    const current = getPlayer(session, session.currentPlayerId);
    if (current.alive) continueJudgmentPhase(session);
    else beginNextTurn(session);
    return;
  }
  session.pendingResponse = null;
  finishResolvingCards(session);
  const current = getPlayer(session, session.currentPlayerId);
  if (current.alive) session.turn.phase = "play";
  else beginNextTurn(session);
}

function failDyingRescue(session: GameSession, pending: PendingDyingResponse): void {
  session.pendingResponse = null;
  const frame = topDyingFrame(session.completeRules.dying);
  if (!frame || frame.frameId !== pending.frameId || frame.victimId !== pending.victimId || frame.stage !== "death_pending") {
    throw new Error("濒死死亡确认与 DyingStack 不一致。");
  }
  const players = lifePlayerSnapshot(session);
  const death = confirmDeath(players, frame, allocateEventId(session));
  commitLifePlayerSnapshot(session, players, death.eventId);
  beginDeathResolution(session, death, {
    rewards: true,
    completion: { type: "dying", frameId: frame.frameId, resume: cloneDyingResume(pending.resume) },
  });
}

/** Explicit compatibility migration for legacy v1 rooms that persisted only the UI dying cursor. */
function dyingFrameForPending(session: GameSession, pending: PendingDyingResponse): DyingFrame {
  const top = topDyingFrame(session.completeRules.dying);
  if (top && top.frameId === pending.frameId) return top;
  if (top || (pending as { frameId?: number }).frameId !== undefined) {
    throw new Error("濒死响应游标与 DyingStack 不一致。");
  }
  const frameId = allocateEventId(session);
  const frame = createDyingFrame(lifePlayerSnapshot(session), {
    frameId,
    victimId: pending.victimId,
    reason: {
      type: pending.damageSourceId === null ? "hp_loss" : "damage",
      eventId: frameId,
      sourceId: pending.damageSourceId,
    },
    responderOrder: [pending.targetId, ...pending.remainingResponderIds]
      .filter((playerId) => getPlayer(session, playerId).alive),
  });
  pushDyingFrame(session.completeRules.dying, frame);
  (pending as { frameId: number }).frameId = frameId;
  return frame;
}

function offerCurrentDyingResponse(session: GameSession, frame: DyingFrame, resume: DyingResume): void {
  for (;;) {
    if (frame.stage === "death_pending") {
      failDyingRescue(session, {
        type: "dying",
        frameId: frame.frameId,
        victimId: frame.victimId,
        damageSourceId: frame.reason.type === "damage" ? frame.reason.sourceId : null,
        targetId: frame.victimId,
        remainingResponderIds: [],
        resume: cloneDyingResume(resume),
      });
      return;
    }
    const responderId = currentDyingResponder(frame);
    if (!responderId) throw new Error("DyingStack rescue cursor has no responder");
    const responder = getPlayer(session, responderId);
    if (!responder.alive) {
      passDyingRescue(lifePlayerSnapshot(session), frame, responderId);
      continue;
    }
    if (currentDyingOwnerResponseSkill(frame) === "niepan") {
      const available = hasEffectiveSkill(session, responder, "niepan") &&
        !session.completeRules.lifecycle.limitedUses.some((entry) => entry.ownerId === responder.id && entry.skillId === "niepan");
      if (available) {
        session.turn.phase = "respond";
        session.pendingResponse = {
          type: "skill_choice",
          targetId: responder.id,
          skillId: "niepan",
          promptId: `dying:${frame.frameId}:niepan`,
          resume: { type: "dying", frameId: frame.frameId, resume: cloneDyingResume(resume) },
        };
        return;
      }
      declineDyingOwnerResponseSave(frame, "niepan", responder.hp);
      continue;
    }
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "dying",
      frameId: frame.frameId,
      victimId: frame.victimId,
      damageSourceId: frame.reason.type === "damage" ? frame.reason.sourceId : null,
      targetId: responderId,
      remainingResponderIds: frame.responderOrder.slice(frame.responderIndex + 1),
      resume: cloneDyingResume(resume),
    };
    return;
  }
}

function advanceDyingResponder(session: GameSession, pending: PendingDyingResponse): void {
  const frame = dyingFrameForPending(session, pending);
  if (currentDyingResponder(frame) !== pending.targetId) {
    throw new Error("濒死响应游标与 DyingStack 不一致。");
  }
  passDyingRescue(lifePlayerSnapshot(session), frame, pending.targetId);
  offerCurrentDyingResponse(session, frame, pending.resume);
}

function applyDyingResponse(
  session: GameSession,
  pending: PendingDyingResponse,
  responder: GamePlayer,
  cardId: CardId | null | undefined,
  viewAsSkillId: "jijiu" | "guhuo" | "jiuchi" | null = null,
  guhuoDeclaredKind: "peach" | "wine" | null = null,
): void {
  const victim = getPlayer(session, pending.victimId);
  if (cardId == null) {
    advanceDyingResponder(session, pending);
    return;
  }
  const handCard = responder.hand.find((candidate) => candidate.id === cardId);
  const equipmentEntry = Object.entries(responder.equipment).find(([, candidate]) => candidate.id === cardId);
  const card = viewAsSkillId === "jijiu" ? handCard ?? equipmentEntry?.[1] : handCard;
  if (!card) ruleError("CARD_NOT_FOUND", `可用区域中不存在 ${cardId}。`);
  const allowed = viewAsSkillId === "jijiu"
    ? isRedCard(session, responder, card) && session.currentPlayerId !== responder.id
    : viewAsSkillId === "jiuchi"
      ? responder.id === victim.id && card.suit === "spade" && effectiveCardSuit(session, responder, card) === "spade"
    : viewAsSkillId === "guhuo"
      ? guhuoDeclaredKind === "peach" || guhuoDeclaredKind === "wine" && responder.id === victim.id
      : !isWushenLockedHeartHandCard(session, responder, card) &&
        (card.kind === "peach" || responder.id === victim.id && card.kind === "wine");
  if (!allowed) ruleError("INVALID_RESPONSE", "濒死救援只能使用桃；濒死者本人也可以使用酒。 ");
  const rescueCardKind = viewAsSkillId === "jijiu" || viewAsSkillId === "guhuo" && guhuoDeclaredKind === "peach"
    ? "view_as_peach" as const
    : viewAsSkillId === "guhuo" || viewAsSkillId === "jiuchi" ? "view_as_wine" as const
      : card.kind === "wine" ? "wine" as const : "peach" as const;
  if ((rescueCardKind === "peach" || rescueCardKind === "view_as_peach") &&
      !peachAllowedByWansha(session, responder.id, victim.id)) {
    ruleError("INVALID_RESPONSE", "完杀生效期间，只有当前回合角色或当前濒死角色可以使用桃。 ");
  }
  const frame = dyingFrameForPending(session, pending);
  if (frame.victimId !== victim.id || currentDyingResponder(frame) !== responder.id) {
    throw new Error("濒死救援与 DyingStack 游标不一致。");
  }
  const jiuyuanBonus =
    (rescueCardKind === "peach" || rescueCardKind === "view_as_peach") &&
    responder.id !== victim.id &&
    victim.role === "lord" &&
    hasEffectiveSkill(session, victim, "jiuyuan") &&
    factionOf(session, responder) === "wu"
      ? 1
      : 0;
  const effectiveSuit = effectiveCardSuit(session, responder, card);
  const suitModifierSkillId = effectiveSuit !== card.suit ? "hongyan" as const : null;
  const eventId = allocateEventId(session);
  const useId = session.nextUseId;
  session.nextUseId += 1;
  const cardUseFrameId = allocateEventId(session);
  const zones = sessionZoneState(session);
  const players = lifePlayerSnapshot(session);
  const from: ZoneRef = equipmentEntry && !handCard
    ? { kind: "equipment", playerId: responder.id, slot: equipmentEntry[0] as EquipmentSlot }
    : { kind: "hand", playerId: responder.id };
  const woundCards = victim.extraPiles.buqu ?? [];
  if (victim.hp <= 0 && woundCards.length > 0) {
    const moveBatchId = nextMoveBatchId(session);
    commitLiveMoveBatch(session, zones.state, {
      batchId: moveBatchId,
      intents: [{
        cardIds: [card.id],
        from,
        to: { kind: "processing", frameId: cardUseFrameId },
        reason: "respond",
        visibility: "public",
        actorId: responder.id,
        sourceId: responder.id,
        targetId: victim.id,
        skillId: viewAsSkillId,
        useId,
        frameId: cardUseFrameId,
      }],
    });
    syncSessionZones(session, zones);
    if (from.kind === "hand" && responder.hand.length === 0) {
      enqueueAfterMoveSkill(session, responder, "lianying");
    } else if (from.kind === "equipment") {
      enqueueAfterMoveSkill(session, responder, "xiaoji");
    }
    session.afterMove.queuedRecoveries.push({
      eventId,
      targetId: victim.id,
      sourceId: responder.id,
      hpBefore: victim.hp,
      requestedAmount: 1 + jiuyuanBonus,
      remainingAmount: 1 + jiuyuanBonus,
      reason: rescueCardKind,
      dyingRescue: {
        frameId: frame.frameId,
        responderId: responder.id,
        cardKind: rescueCardKind,
        viewAsSkillId,
        useId,
        cardUseFrameId,
        physicalCardId: card.id,
        from: from.kind,
        ...(from.kind === "equipment" ? { equipmentSlot: from.slot } : {}),
        moveBatchId,
        effectiveSuit,
        suitModifierSkillId,
      },
    });
    addLog(session, "card", `${responder.id} 对濒死的 ${victim.id} 使用${viewAsSkillId === "jijiu" ? "急救转化的桃" : viewAsSkillId === "jiuchi" ? "酒池转化的酒" : viewAsSkillId === "guhuo" ? `蛊惑声明的${cardName(guhuoDeclaredKind!)}` : card.name}，等待其处理不屈牌。`);
    return;
  }
  const played = playDyingRescueCard(players, zones.state, frame, {
    eventId,
    responderId: responder.id,
    cardKind: rescueCardKind,
    amount: 1 + jiuyuanBonus,
    useId,
    cardUseFrameId,
    batchId: nextMoveBatchId(session),
    physicalCardId: card.id,
    from,
    viewAsSkillId,
    effectiveSuit,
    suitModifierSkillId,
  });
  syncSessionZones(session, zones);
  commitLifePlayerSnapshot(session, players, eventId);
  if (jiuyuanBonus > 0) addLog(session, "card", `${victim.id} 的救援令此次桃额外回复 1 点体力。`);
  addLog(
    session,
    "card",
    `${responder.id} 对濒死的 ${victim.id} 使用${viewAsSkillId === "jiuchi" ? "酒池转化的酒" : viewAsSkillId === "guhuo" ? `蛊惑声明的${cardName(guhuoDeclaredKind!)}` : card.name}，回复 ${played.recovery.recoveredAmount} 点体力至 ${victim.hp}。`,
  );
  if (frame.stage === "rescued") {
    addLog(session, "card", `${victim.id} 脱离濒死状态。`);
    completeResolvedDying(session, frame, pending.resume, true);
    return;
  }
  const canUsePeachAgain = peachAllowedByWansha(session, responder.id, victim.id);
  const canUseJijiuAgain = canUsePeachAgain && session.currentPlayerId !== responder.id && hasEffectiveSkill(session, responder, "jijiu") &&
    ownedCards(responder).some((candidate) => isRedCard(session, responder, candidate));
  const canUseJiuchiAgain = responder.id === victim.id && hasEffectiveSkill(session, responder, "jiuchi") &&
    responder.hand.some((candidate) => candidate.suit === "spade" && effectiveCardSuit(session, responder, candidate) === "spade");
  const canUseGuhuoAgain = hasEffectiveSkill(session, responder, "guhuo") && responder.hand.length > 0 &&
    (canUsePeachAgain || responder.id === victim.id);
  const canUseLonghunAgain = canUsePeachAgain && longhunCardGroups(session, responder, "heart").length > 0;
  if (rescueCardIds(session, responder, victim.id).length === 0 && !canUseJijiuAgain && !canUseJiuchiAgain &&
      !canUseGuhuoAgain && !canUseLonghunAgain) {
    advanceDyingResponder(session, pending);
  }
}

function applyLonghunDyingResponse(
  session: GameSession,
  pending: PendingDyingResponse,
  responder: GamePlayer,
  components: readonly LonghunOwnedComponent[],
  effectiveSuit: CardSuit,
): void {
  const victim = getPlayer(session, pending.victimId);
  if (!peachAllowedByWansha(session, responder.id, victim.id)) {
    ruleError("INVALID_RESPONSE", "完杀生效期间，当前角色不能以龙魂使用桃救援。");
  }
  const frame = dyingFrameForPending(session, pending);
  if (frame.victimId !== victim.id || currentDyingResponder(frame) !== responder.id) {
    throw new Error("龙魂濒死救援与 DyingStack 游标不一致。");
  }
  const jiuyuanBonus = responder.id !== victim.id && victim.role === "lord" &&
    hasEffectiveSkill(session, victim, "jiuyuan") && factionOf(session, responder) === "wu" ? 1 : 0;
  const eventId = allocateEventId(session);
  const useId = session.nextUseId;
  session.nextUseId += 1;
  const cardUseFrameId = allocateEventId(session);
  const committed = commitLonghunComponents(session, responder, components, cardUseFrameId);
  const moveRecords = committed.moveRecords.map((record): MoveRecord => ({
    ...record,
    targetId: victim.id,
    useId,
    frameId: cardUseFrameId,
  }));
  const suitModifierSkillId = components.some(({ card }) => card.suit !== effectiveSuit) ? "hongyan" as const : null;
  const rescueInput = {
    eventId,
    responderId: responder.id,
    cardKind: "view_as_peach" as const,
    amount: 1 + jiuyuanBonus,
    useId,
    cardUseFrameId,
    physicalCardIds: committed.cards.map((card) => card.id),
    viewAsSkillId: "longhun" as const,
    effectiveSuit,
    suitModifierSkillId,
    moveRecords,
  };
  const woundCards = victim.extraPiles.buqu ?? [];
  if (victim.hp <= 0 && woundCards.length > 0) {
    const sources = components.map(({ card, from }) => ({
      physicalCardId: card.id,
      from: from.kind,
      ...(from.kind === "equipment" ? { equipmentSlot: from.slot } : {}),
    }));
    const firstSource = sources[0]!;
    session.afterMove.queuedRecoveries.push({
      eventId,
      targetId: victim.id,
      sourceId: responder.id,
      hpBefore: victim.hp,
      requestedAmount: 1 + jiuyuanBonus,
      remainingAmount: 1 + jiuyuanBonus,
      reason: "view_as_peach",
      dyingRescue: {
        frameId: frame.frameId,
        responderId: responder.id,
        cardKind: "view_as_peach",
        viewAsSkillId: "longhun",
        useId,
        cardUseFrameId,
        physicalCardId: firstSource.physicalCardId,
        physicalCards: sources,
        from: firstSource.from,
        ...(firstSource.from === "equipment" ? { equipmentSlot: firstSource.equipmentSlot } : {}),
        moveBatchId: committed.moveBatchId,
        effectiveSuit,
        suitModifierSkillId,
      },
    });
    addLog(session, "card", `${responder.id} 发动龙魂，以 ${committed.cards.length} 张红桃牌救援 ${victim.id}，等待处理不屈牌。`);
    return;
  }

  const players = lifePlayerSnapshot(session);
  let recoveredAmount = 0;
  if (victim.hp > 0) {
    recordDyingRescue(players, frame, { ...rescueInput, recoveredAmount: 0, hpAfter: victim.hp });
  } else {
    const recovery = rescueDyingPlayer(players, frame, rescueInput);
    recoveredAmount = recovery.recoveredAmount;
    commitLifePlayerSnapshot(session, players, eventId);
  }
  if (jiuyuanBonus > 0) addLog(session, "card", `${victim.id} 的救援令此次龙魂桃额外回复 1 点体力。`);
  addLog(session, "card", `${responder.id} 发动龙魂，以 ${committed.cards.length} 张红桃牌救援 ${victim.id}，回复 ${recoveredAmount} 点体力至 ${victim.hp}。`);
  if (frame.stage === "rescued") {
    addLog(session, "card", `${victim.id} 脱离濒死状态。`);
    completeResolvedDying(session, frame, pending.resume, true);
    return;
  }
  const canUsePeachAgain = peachAllowedByWansha(session, responder.id, victim.id);
  const canUseJijiuAgain = canUsePeachAgain && session.currentPlayerId !== responder.id &&
    hasEffectiveSkill(session, responder, "jijiu") && ownedCards(responder).some((card) => isRedCard(session, responder, card));
  const canUseJiuchiAgain = responder.id === victim.id && hasEffectiveSkill(session, responder, "jiuchi") &&
    responder.hand.some((card) => card.suit === "spade" && effectiveCardSuit(session, responder, card) === "spade");
  const canUseGuhuoAgain = hasEffectiveSkill(session, responder, "guhuo") && responder.hand.length > 0 &&
    (canUsePeachAgain || responder.id === victim.id);
  const canUseLonghunAgain = canUsePeachAgain && longhunCardGroups(session, responder, "heart").length > 0;
  if (rescueCardIds(session, responder, victim.id).length === 0 && !canUseJijiuAgain && !canUseJiuchiAgain &&
      !canUseGuhuoAgain && !canUseLonghunAgain) {
    advanceDyingResponder(session, pending);
  }
}

function applyResponse(
  session: GameSession,
  action: Extract<GameAction, { type: "respond" }>,
  dodgeSkillId: Extract<GeneralSkillId, "longdan" | "qingguo" | "guhuo" | "longhun"> | null = null,
  dodgePhysicalCardIds?: readonly CardId[],
): void {
  if (session.turn.phase !== "respond" || !session.pendingResponse) {
    ruleError("INVALID_PHASE", "当前没有需要响应的卡牌效果。");
  }
  const pending = session.pendingResponse;
  if (action.playerId !== pending.targetId) {
    ruleError("INVALID_RESPONSE", "只有当前结算目标可以响应。");
  }
  const target = getLivingPlayer(session, action.playerId);

  if (pending.type === "nullification") {
    applyNullificationResponse(session, pending, target, action.cardId);
  } else if (pending.type === "dying") {
    applyDyingResponse(session, pending, target, action.cardId);
  } else if (pending.type === "slash") {
    applySlashResponse(session, pending, target, action.cardId, dodgeSkillId, dodgePhysicalCardIds);
  } else if (pending.type === "duel") {
    applyDuelResponse(session, pending, target, action.cardId, action.cardIds);
  } else if (pending.type === "mass_attack") {
    applyMassAttackResponse(session, pending, target, action.cardId, action.cardIds, dodgeSkillId, dodgePhysicalCardIds);
  } else if (pending.type === "borrowed_sword") {
    applyBorrowedSwordResponse(session, pending, target, action.cardId, action.cardIds);
  } else {
    ruleError("INVALID_RESPONSE", "区域选牌必须提交选择令牌。 ");
  }
}

function applyWeaponAction(
  session: GameSession,
  action: Extract<GameAction, { type: "resolve_weapon" }>,
): void {
  const pending = session.pendingResponse;
  if (
    session.turn.phase !== "respond" ||
    !pending ||
    pending.type !== "weapon_action" ||
    pending.targetId !== action.playerId
  ) {
    ruleError("INVALID_PHASE", "当前没有需要处理的武器效果。");
  }
  const attacker = getPlayer(session, pending.attackerId);
  const victim = getPlayer(session, pending.victimId);
  const cardIds = action.cardIds ?? [];
  const tokens = action.tokens ?? [];
  if (pending.damageOpportunity) {
    if (action.promptId !== `damage:${pending.damageOpportunity.promptId}`) {
      ruleError("INVALID_RESPONSE", "武器伤害时机提示已过期。");
    }
    assertLiveDamageCursor(session, pending.damageOpportunity);
  } else if (action.promptId !== undefined) {
    ruleError("INVALID_RESPONSE", "当前武器效果不接受伤害时机提示。");
  }

  switch (pending.stage) {
    case "zhuque_convert": {
      const slash = action.activate
        ? { ...pending.slash, slashKind: "fire_slash" as const, nature: "fire" as const }
        : pending.slash;
      if (action.activate) addLog(session, "card", `${attacker.id} 发动朱雀羽扇，将此杀改为火杀。`);
      beginSlashTarget(session, slash);
      return;
    }
    case "cixiong_activate": {
      if (!action.activate) {
        beginSlashTarget(session, pending.slash);
        return;
      }
      addLog(session, "card", `${attacker.id} 发动雌雄双股剑。`);
      if (victim.hand.length === 0) {
        const drawn = drawCards(session, attacker, 1);
        addLog(session, "card", `${victim.id} 没有手牌可弃，${attacker.id} 摸了 ${drawn} 张牌。`);
        beginSlashTarget(session, pending.slash);
        return;
      }
      session.pendingResponse = { ...pending, stage: "cixiong_choice", targetId: victim.id };
      return;
    }
    case "cixiong_choice": {
      if (action.activate) {
        if (cardIds.length !== 1) ruleError("INVALID_DISCARD", "必须弃置一张手牌，或选择不弃置。");
        const selected = victim.hand.find((card) => card.id === cardIds[0]);
        if (!selected) ruleError("CARD_NOT_FOUND", "所选手牌已不在手中。");
        session.discardPile.push(removeCard(session, victim, selected.id));
        addLog(session, "card", `${victim.id} 因雌雄双股剑弃置了一张手牌。`);
      } else {
        const drawn = drawCards(session, attacker, 1);
        addLog(session, "card", `${victim.id} 未弃牌，${attacker.id} 摸了 ${drawn} 张牌。`);
      }
      beginSlashTarget(session, pending.slash);
      return;
    }
    case "guanshi_force_hit": {
      if (!action.activate) {
        offerMengjinAfterSlashDodged(session, pending.slash);
        return;
      }
      if (cardIds.length !== 2 || new Set(cardIds).size !== 2) {
        ruleError("INVALID_DISCARD", "发动贯石斧必须弃置两张不同的牌。");
      }
      const moveBatchId = nextMoveBatchId(session);
      const discarded = cardIds.map((cardId) => removeOwnedCard(session, attacker, cardId, moveBatchId));
      session.discardPile.push(...discarded);
      addLog(session, "card", `${attacker.id} 发动贯石斧，弃置两张牌令${cardName(pending.slash.slashKind)}强制命中。`);
      beginSlashDamage(session, pending.slash);
      return;
    }
    case "qinglong_followup": {
      if (!action.activate) {
        advanceSlashSequence(session, pending.slash);
        return;
      }
      if (cardIds.length !== 1) ruleError("INVALID_RESPONSE", "发动青龙偃月刀必须选择一张杀。");
      const selected = attacker.hand.find((card) => card.id === cardIds[0]);
      const wushenSlash = selected ? isWushenLockedHeartHandCard(session, attacker, selected) : false;
      if (!selected || !isSlashCardKind(selected.kind) && !wushenSlash) ruleError("INVALID_RESPONSE", "所选牌不是可用的杀。");
      const played = moveCardToResolving(session, attacker, selected.id);
      const slashKind = wushenSlash
        ? "slash" as const
        : played.kind as Extract<CardKind, "slash" | "fire_slash" | "thunder_slash">;
      const slash = {
        ...pending.slash,
        cardId: played.id,
        damageCardIds: [played.id],
        slashKind,
        damage: 1,
        nature: damageNatureForSlash(slashKind),
        color: isBlackCard(session, attacker, played) ? "black" as const : "red" as const,
        armorAttempted: false,
        armorIgnored: false,
        requiredDodgeCount: wushuangResponseCount(session, attacker),
        dodgesPlayed: 0,
        zhuQueChecked: false,
        ciXiongChecked: false,
        liuliCheckedPlayerIds: [],
        xiangleCheckedPlayerIds: [],
        jiangProcessedPlayerIds: [],
        liegongChecked: false,
        tieqiChecked: false,
        excludedRedirectTargetIds: [attacker.id, victim.id, ...pending.slash.remainingTargetIds],
        dodgeProhibited: false,
        declinedLordSkillIds: [],
      };
      addLog(session, "card", `${attacker.id} 发动青龙偃月刀，对 ${victim.id} 追加使用${played.name}。`);
      consumeSlashResponseCommitment(session, pending.slash);
      beginSlashTarget(session, slash);
      return;
    }
    case "hanbing_prevent": {
      if (!action.activate) {
        beginSlashDamage(session, pending.slash);
        return;
      }
      if (victim.hand.length === 0 && Object.keys(victim.equipment).length === 0) {
        advanceSlashSequence(session, pending.slash);
        return;
      }
      addLog(session, "card", `${attacker.id} 发动寒冰剑，防止此次伤害并改为弃置牌。`);
      session.pendingResponse = { ...pending, stage: "hanbing_select", remainingSelections: 2 };
      return;
    }
    case "hanbing_select": {
      if (!action.activate) {
        if ((pending.remainingSelections ?? 2) >= 2) {
          ruleError("INVALID_RESPONSE", "发动寒冰剑后至少需要弃置目标一张牌。");
        }
        advanceSlashSequence(session, pending.slash);
        return;
      }
      if (tokens.length !== 1) ruleError("INVALID_DISCARD", "请选择一张目标区域内的牌。");
      const token = tokens[0] ?? "";
      let discarded: Card;
      if (token.startsWith("hand:")) {
        const index = Number(token.slice("hand:".length));
        const card = Number.isInteger(index) ? victim.hand[index] : undefined;
        if (!card) ruleError("CARD_NOT_FOUND", "所选暗置手牌已不存在。");
        discarded = removeCard(session, victim, card.id);
      } else if (token.startsWith("equipment:")) {
        const slot = token.slice("equipment:".length) as EquipmentSlot;
        if (!["weapon", "armor", "offensive_horse", "defensive_horse"].includes(slot)) {
          ruleError("CARD_NOT_FOUND", "装备区域选择无效。");
        }
        discarded = loseEquipment(session, victim, slot);
      } else {
        ruleError("CARD_NOT_FOUND", "区域选择令牌无效。");
      }
      session.discardPile.push(discarded);
      addLog(session, "card", `${attacker.id} 以寒冰剑弃置了 ${victim.id} 的${discarded.name}。`);
      const remainingSelections = (pending.remainingSelections ?? 1) - 1;
      if (remainingSelections > 0 && (victim.hand.length > 0 || Object.keys(victim.equipment).length > 0)) {
        session.pendingResponse = { ...pending, remainingSelections };
      } else {
        advanceSlashSequence(session, pending.slash);
      }
      return;
    }
    case "qilin_discard_horse": {
      if (pending.damageOpportunity && action.activate) {
        const frame = assertLiveDamageCursor(session, pending.damageOpportunity);
        if (!liveDamageOpportunityEligible(session, frame, "qi_lin_gong")) {
          ruleError("INVALID_RESPONSE", "麒麟弓或目标坐骑已不再满足发动条件。");
        }
      }
      if (action.activate) {
        if (tokens.length !== 1) ruleError("INVALID_DISCARD", "发动麒麟弓必须选择一匹坐骑。");
        const token = tokens[0] ?? "";
        const slot = token.slice("equipment:".length) as EquipmentSlot;
        if (!token.startsWith("equipment:") || (slot !== "offensive_horse" && slot !== "defensive_horse")) {
          ruleError("INVALID_DISCARD", "麒麟弓只能弃置目标的坐骑。");
        }
        const discarded = loseEquipment(session, victim, slot);
        session.discardPile.push(discarded);
        addLog(session, "card", `${attacker.id} 发动麒麟弓，弃置了 ${victim.id} 的${discarded.name}。`);
      }
      if (pending.damageOpportunity) {
        consumeLiveDamageOpportunity(
          session,
          pending.damageOpportunity,
          action.activate ? "resolve" : "pass",
          action.activate ? `weapon:${pending.damageOpportunity.damageId}:qi_lin_gong` : null,
        );
        session.pendingResponse = null;
        driveLiveDamageFlow(session, true);
        return;
      }
      advanceSlashSequence(session, pending.slash);
      return;
    }
  }
}

function applyArmorAction(
  session: GameSession,
  action: Extract<GameAction, { type: "activate_armor" }>,
): void {
  const pending = session.pendingResponse;
  if (session.turn.phase !== "respond" || !pending || pending.targetId !== action.playerId) {
    ruleError("INVALID_PHASE", "当前没有可发动的防具响应。");
  }
  if (pending.type !== "slash" && pending.type !== "mass_attack") {
    ruleError("INVALID_RESPONSE", "当前响应不需要闪，不能发动八卦阵。");
  }
  const required = pending.type === "slash" ? "dodge" : pending.responseKind;
  const player = getLivingPlayer(session, action.playerId);
  const sourceSkillId = baguaResponseSource(session, player, pending);
  if (required !== "dodge" || pending.armorAttempted || sourceSkillId === null) {
    ruleError("INVALID_RESPONSE", "当前不能发动八卦阵。");
  }
  if (!action.activate) {
    const next = { ...pending, armorAttempted: true };
    if (next.type === "mass_attack") updateMassAttackResponseCommitment(session, next);
    else updateSlashResponseCommitment(session, next);
    session.pendingResponse = next;
    return;
  }
  beginStandardJudgment(
    session,
    player,
    { type: sourceSkillId === "bazhen" ? "skill" : "armor", id: sourceSkillId },
    { color: "red" },
    { type: "armor", pending, sourceSkillId },
  );
}

function applyEndPlay(
  session: GameSession,
  action: Extract<GameAction, { type: "end_play" }>,
): void {
  assertPlayTurn(session, action.playerId);
  enterDiscardOrEnd(session);
}

function applyDiscard(
  session: GameSession,
  action: Extract<GameAction, { type: "discard" }>,
): void {
  if (session.turn.phase !== "discard") {
    ruleError("INVALID_PHASE", "当前不是弃牌阶段。");
  }
  if (session.currentPlayerId !== action.playerId) {
    ruleError("NOT_YOUR_TURN", "当前不是你的回合。");
  }
  const player = getLivingPlayer(session, action.playerId);
  const required = session.turn.requiredDiscardCount;
  if (action.cardIds.length !== required || new Set(action.cardIds).size !== action.cardIds.length) {
    ruleError("INVALID_DISCARD", `必须选择 ${required} 张不同的手牌弃置。`);
  }
  const handIds = new Set(player.hand.map((card) => card.id));
  if (action.cardIds.some((cardId) => !handIds.has(cardId))) {
    ruleError("INVALID_DISCARD", "只能弃置自己持有的手牌。");
  }
  const discarded = action.cardIds.map((cardId) => removeCard(session, player, cardId));
  // Persisted rooms from before discard-phase tracking may already be paused on
  // a real discard prompt; the prompt itself is sufficient migration evidence.
  session.turn.discardPhaseStarted = true;
  session.turn.discardPhaseHandCardIds = [
    ...(session.turn.discardPhaseHandCardIds ?? []),
    ...discarded.map((card) => card.id),
  ];
  if (hasEffectiveSkill(session, player, "renjie")) {
    const plan = planRenjieDiscard({
      context: godSkillContext(session, player, "renjie"),
      phase: "discard",
      discardedByOwner: true,
      discardedHandCardIds: discarded.map((card) => card.id),
      discardedNonHandCardIds: [],
    });
    if (!plan.ok) throw new Error(plan.detail);
    addLivePermanentMark(session, player.id, "ren", player.id, "renjie", plan.value.renMarkDelta);
  }
  session.discardPile.push(...discarded);
  addLog(
    session,
    "card",
    `${player.id} 弃置了 ${discarded.length} 张牌：${discarded
      .map((card) => card.name)
      .join("、")}。`,
  );
  session.turn.requiredDiscardCount = 0;
  session.pendingResponse = null;
  session.turn.phase = "discard";
  offerNextAfterMoveSkill(session);
  resumeReadyAfterMoveEffect(session);
}

export function applyAction(session: GameSession, action: GameAction): GameSession {
  if (session.status === "finished") {
    ruleError("GAME_FINISHED", "游戏已经结束。");
  }
  // Validate the actor before cloning so malformed actions fail consistently.
  const deadWuhunAction = action.type === "resolve_standard_skill" &&
    session.turn.phase === "respond" &&
    session.pendingResponse?.type === "standard_skill" &&
    session.pendingResponse.targetId === action.playerId &&
    session.pendingResponse.skillId === "wuhun" &&
    session.pendingResponse.stage === "wuhun_target";
  if (deadWuhunAction) {
    if (getPlayer(session, action.playerId).alive) {
      throw new Error("武魂死亡结算只能由已确认死亡的技能拥有者操作。");
    }
  } else {
    getLivingPlayer(session, action.playerId);
  }
  if (!Number.isSafeInteger(session.revision) || session.revision < 0 || session.revision >= Number.MAX_SAFE_INTEGER) {
    throw new Error("游戏修订号非法或已耗尽。");
  }
  const next = cloneSession(session);
  switch (action.type) {
    case "play_card":
      applyPlayCard(next, action);
      break;
    case "declare_guhuo":
      applyDeclareGuhuo(next, action);
      break;
    case "resolve_guhuo":
      applyResolveGuhuo(next, action);
      break;
    case "choose_pindian_card":
      applyChoosePindianCard(next, action);
      break;
    case "use_zhang_ba_slash":
      applyZhangBaSlash(next, action);
      break;
    case "respond":
      applyResponse(next, action);
      break;
    case "activate_armor":
      applyArmorAction(next, action);
      break;
    case "resolve_weapon":
      applyWeaponAction(next, action);
      break;
    case "end_play":
      applyEndPlay(next, action);
      break;
    case "discard":
      applyDiscard(next, action);
      break;
    case "choose_zone_card":
      applyZoneSelection(next, action);
      break;
    case "choose_hand_card":
      applyFireAttackHandChoice(next, action);
      break;
    case "choose_amazing_grace_card":
      applyAmazingGraceSelection(next, action);
      break;
    case "use_skill":
      applyUseSkill(next, action);
      break;
    case "invoke_lord_skill":
      applyInvokeLordSkill(next, action);
      break;
    case "resolve_lord_dispatch":
      applyResolveLordDispatch(next, action);
      break;
    case "choose_fanjian_suit":
      applyFanjianSuitChoice(next, action);
      break;
    case "resolve_skill":
      applyResolveSkill(next, action);
      break;
    case "resolve_standard_skill":
      applyStandardSkillAction(next, action);
      break;
  }
  offerNextAfterMoveSkill(next);
  next.revision = session.revision + 1;
  return next;
}

function consumeAbandonedDyingResumeCommitment(session: GameSession, resume: DyingResume): void {
  if (resume.type === "mass_attack") {
    if (commitmentEffects(session, "mass_attack_commitment", "cardId", resume.pending.cardId).length > 0) {
      consumeMassAttackResponseCommitment(session, resume.pending);
    }
  } else if (resume.type === "slash_sequence") {
    if (commitmentEffects(session, "slash_response_progress", "cardId", resume.pending.cardId).length > 0) {
      consumeSlashResponseCommitment(session, resume.pending);
    }
  } else if (resume.type === "leiji") {
    consumeAbandonedDyingResumeCommitment(session, resume.resume.type === "mass_attack"
      ? { type: "mass_attack", pending: resume.resume.pending }
      : { type: "slash_sequence", pending: resume.resume.pending });
  } else if (resume.type === "chain_damage") {
    consumeAbandonedDyingResumeCommitment(session, resume.finalResume);
  } else if (resume.type === "standard_damage") {
    consumeAbandonedDyingResumeCommitment(session, resume.aftermath.resume);
  } else if (resume.type === "guhuo") {
    consumeAbandonedResponseCommitment(session, resume.pending);
  }
}

function consumeAbandonedWumouResponseCommitment(session: GameSession, continuation: WumouContinuation): void {
  if (continuation.type === "trick_effect" && continuation.effect.type === "mass_attack") {
    if (commitmentEffects(session, "mass_attack_commitment", "cardId", continuation.effect.pending.cardId).length > 0) {
      consumeMassAttackResponseCommitment(session, continuation.effect.pending);
    }
  } else if (continuation.type === "nullification") {
    const pending = continuation.pending;
    if (commitmentEffects(session, "nullification_progress", "cardId", pending.cardId).length > 0) {
      consumeNullificationResponseCommitment(session, pending);
    }
    if (pending.effect.type === "mass_attack" &&
        commitmentEffects(session, "mass_attack_commitment", "cardId", pending.effect.pending.cardId).length > 0) {
      consumeMassAttackResponseCommitment(session, pending.effect.pending);
    }
  }
}

function consumeAbandonedResponseCommitment(session: GameSession, pending: PendingResponse | null): void {
  if (!pending) return;
  if (pending.type === "mass_attack") {
    if (commitmentEffects(session, "mass_attack_commitment", "cardId", pending.cardId).length > 0) {
      consumeMassAttackResponseCommitment(session, pending);
    }
    return;
  }
  if (pending.type === "nullification") {
    if (commitmentEffects(session, "nullification_progress", "cardId", pending.cardId).length > 0) {
      consumeNullificationResponseCommitment(session, pending);
    }
    if (pending.effect.type === "mass_attack" &&
        commitmentEffects(session, "mass_attack_commitment", "cardId", pending.effect.pending.cardId).length > 0) {
      consumeMassAttackResponseCommitment(session, pending.effect.pending);
    }
    return;
  }
  if (pending.type === "slash") {
    if (commitmentEffects(session, "slash_response_progress", "cardId", pending.cardId).length > 0) {
      consumeSlashResponseCommitment(session, pending);
    }
    return;
  }
  if (pending.type === "duel") {
    if (commitmentEffects(session, "duel_response_progress", "cardId", pending.cardId).length > 0) {
      consumeDuelResponseCommitment(session, pending);
    }
    return;
  }
  if (pending.type === "weapon_action") {
    if (commitmentEffects(session, "slash_response_progress", "cardId", pending.slash.cardId).length > 0) {
      consumeSlashResponseCommitment(session, pending.slash);
    }
    return;
  }
  if (pending.type === "lord_dispatch" && pending.resume.type === "respond") {
    consumeAbandonedResponseCommitment(session, pending.resume.pending);
    return;
  }
  if (pending.type === "standard_judgment") {
    if (pending.context.type === "tieqi" &&
        commitmentEffects(session, "slash_response_progress", "cardId", pending.context.slash.cardId).length > 0) {
      consumeSlashResponseCommitment(session, pending.context.slash);
    }
    else if (pending.context.type === "armor") consumeAbandonedResponseCommitment(session, pending.context.pending);
    return;
  }
  if (pending.type === "guhuo" && pending.continuation.type === "respond") {
    consumeAbandonedResponseCommitment(session, pending.continuation.pending);
    return;
  }
  if (pending.type === "dying") {
    consumeAbandonedDyingResumeCommitment(session, pending.resume);
    return;
  }
  if (pending?.type === "skill_choice" && pending.resume.type === "card_use") {
    consumeCardUseContinuation(session, pending.resume);
    return;
  }
  if (pending?.type !== "standard_skill") return;
  if (pending.skillId === "wumou" && pending.stage === "wumou_choice" && pending.wumouContinuation) {
    consumeAbandonedWumouResponseCommitment(session, pending.wumouContinuation);
    consumeWumouContinuation(session, pending.targetId, pending.eventId, pending.wumouContinuation);
  } else if (pending.skillId === "shenfen" && pending.shenfenContinuation) {
    consumeShenfenContinuation(session, pending.shenfenContinuation);
  } else if (pending.skillId === "yeyan" && pending.yeyanContinuation) {
    consumeYeyanContinuation(session, pending.yeyanContinuation);
  } else if (pending.slash &&
      commitmentEffects(session, "slash_response_progress", "cardId", pending.slash.cardId).length > 0) {
    consumeSlashResponseCommitment(session, pending.slash);
  } else if (pending.duel &&
      commitmentEffects(session, "duel_response_progress", "cardId", pending.duel.cardId).length > 0) {
    consumeDuelResponseCommitment(session, pending.duel);
  } else if (pending.leijiDodge) {
    consumeAbandonedDyingResumeCommitment(session, pending.leijiDodge.resume.type === "mass_attack"
      ? { type: "mass_attack", pending: pending.leijiDodge.resume.pending }
      : { type: "slash_sequence", pending: pending.leijiDodge.resume.pending });
  } else if (pending.cardUse) {
    consumeCardUseContinuation(session, pending.cardUse);
  }
}

function consumeAbandonedDamageCommitment(session: GameSession): void {
  const root = session.completeRules.damageFlow.frames[0];
  if (!root?.callerContinuation) return;
  const resume = decodeGameDamageContinuation(root.callerContinuation);
  if (resume.type === "wumou") {
    consumeWumouContinuation(session, resume.ownerId, resume.eventId, resume.continuation);
  } else if (resume.type === "shenfen") {
    consumeShenfenContinuation(session, resume.continuation);
  } else if (resume.type === "yeyan") {
    consumeYeyanContinuation(session, resume.continuation);
  } else {
    consumeAbandonedDyingResumeCommitment(session, resume);
  }
}

function discardAbandonedResponseCards(session: GameSession): void {
  const pending = session.afterMove.suspendedPhase !== null && session.afterMove.suspendedResponse
    ? session.afterMove.suspendedResponse
    : session.pendingResponse;
  consumeAbandonedResponseCommitment(session, pending);
  consumeAbandonedDamageCommitment(session);
  if (pending?.type === "amazing_grace_selection") {
    session.discardPile.push(...pending.pool);
  } else if (pending?.type === "nullification" && pending.effect.type === "amazing_grace") {
    session.discardPile.push(...pending.effect.pool);
  }
  session.pendingResponse = null;
  session.afterMove.queuedRecoveries = [];
  session.afterMove.queuedTriggers = [];
  session.afterMove.suspendedPhase = null;
  session.afterMove.suspendedResponse = null;
  finishResolvingCards(session);
}

/**
 * Administrative forfeiture cancels optional after-move prompts before it
 * touches an inserted dying barrier. Restore that barrier as the authoritative
 * response so its unique DamageFlow cursor cannot be discarded with the UI
 * prompt that temporarily suspended it.
 */
function restoreSuspendedDyingForForfeit(session: GameSession, forfeiterId: PlayerId): boolean {
  const pending = session.pendingResponse;
  const suspended = session.afterMove.suspendedResponse;
  if (session.afterMove.suspendedPhase === null || !pending || suspended?.type !== "dying") return false;

  // A Peach/Wine already committed into mandatory Buqu recovery must survive
  // departure of its payer or any bystander. Only departure of the victim can
  // make that recovery impossible.
  const committedBuquRecovery = pending.type === "standard_skill" &&
    pending.stage === "buqu_recovery" && pending.recovery?.dyingRescue !== undefined;
  const invalidatesInsertedPrompt = forfeiterId === suspended.victimId ||
    (!committedBuquRecovery && (forfeiterId === suspended.targetId || forfeiterId === pending.targetId));
  if (!invalidatesInsertedPrompt) return false;

  session.pendingResponse = clonePendingResponse(session.afterMove.suspendedResponse);
  session.afterMove.queuedRecoveries = [];
  session.afterMove.queuedTriggers = [];
  session.afterMove.suspendedPhase = null;
  session.afterMove.suspendedResponse = null;
  session.turn.phase = "respond";
  return true;
}

function restoreSuspendedShenfenForForfeit(session: GameSession): void {
  const insertedAfterMovePrompt = session.pendingResponse?.type === "skill_choice" &&
      session.pendingResponse.resume.type === "after_move" ||
    session.pendingResponse?.type === "standard_skill" && session.pendingResponse.stage === "buqu_recovery";
  const suspended = session.afterMove.suspendedResponse;
  if (!insertedAfterMovePrompt || suspended?.type !== "standard_skill" ||
      suspended.skillId !== "shenfen" || suspended.stage !== "shenfen_continue") return;
  session.pendingResponse = clonePendingResponse(suspended);
  session.afterMove.queuedRecoveries = [];
  session.afterMove.queuedTriggers = [];
  session.afterMove.suspendedPhase = null;
  session.afterMove.suspendedResponse = null;
  session.turn.phase = "respond";
}

function restoreSuspendedYeyanForForfeit(session: GameSession): void {
  const insertedAfterMovePrompt = session.pendingResponse?.type === "skill_choice" &&
      session.pendingResponse.resume.type === "after_move" ||
    session.pendingResponse?.type === "standard_skill" && session.pendingResponse.stage === "buqu_recovery";
  const suspended = session.afterMove.suspendedResponse;
  if (!insertedAfterMovePrompt || suspended?.type !== "standard_skill" ||
      suspended.skillId !== "yeyan" || suspended.stage !== "yeyan_after_cost") return;
  session.pendingResponse = clonePendingResponse(suspended);
  session.afterMove.queuedRecoveries = [];
  session.afterMove.queuedTriggers = [];
  session.afterMove.suspendedPhase = null;
  session.afterMove.suspendedResponse = null;
  session.turn.phase = "respond";
}

function activeShenfenDamageContinuation(session: GameSession): ShenfenContinuation | null {
  const rootFrame = session.completeRules.damageFlow.frames[0];
  if (!rootFrame?.callerContinuation) return null;
  const resume = decodeGameDamageContinuation(rootFrame.callerContinuation);
  if (resume.type !== "shenfen") return null;
  assertShenfenContinuation(session, resume.continuation);
  return resume.continuation;
}

function activeYeyanDamageContinuation(session: GameSession): YeyanContinuation | null {
  const rootFrame = session.completeRules.damageFlow.frames[0];
  if (!rootFrame?.callerContinuation) return null;
  const resume = decodeGameDamageContinuation(rootFrame.callerContinuation);
  if (resume.type !== "yeyan") return null;
  assertYeyanContinuation(session, resume.continuation);
  return resume.continuation;
}

function closeForfeitedDyingVictim(session: GameSession, forfeiterId: PlayerId): boolean {
  restoreSuspendedDyingForForfeit(session, forfeiterId);
  const pending = session.pendingResponse;
  if (pending?.type === "dying" && pending.victimId === forfeiterId) {
    session.pendingResponse = null;
    const frame = dyingFrameForPending(session, pending);
    frame.stage = "death_confirmed";
    completeResolvedDying(session, frame, pending.resume, true);
    return true;
  }
  if (pending?.type === "skill_choice" && pending.resume.type === "dying" && pending.targetId === forfeiterId) {
    const frame = topDyingFrame(session.completeRules.dying);
    if (!frame || frame.frameId !== pending.resume.frameId || frame.victimId !== pending.targetId) {
      throw new Error("离席后的濒死技能提示与 DyingStack 不一致。");
    }
    session.pendingResponse = null;
    frame.stage = "death_confirmed";
    completeResolvedDying(session, frame, pending.resume.resume, true);
    return true;
  }
  return false;
}

function resumeAfterForfeit(session: GameSession, forfeiterId: PlayerId): void {
  restoreSuspendedDyingForForfeit(session, forfeiterId);
  restoreSuspendedShenfenForForfeit(session);
  restoreSuspendedYeyanForForfeit(session);
  if (closeForfeitedDyingVictim(session, forfeiterId)) return;
  const pending = session.pendingResponse;

  // Dying is the one response chain that cannot be cancelled wholesale: a
  // different victim may already be at zero HP. Skip a departed rescuer, or
  // resume the interrupted effect directly when the victim themself leaves.
  if (pending?.type === "dying") {
    if (pending.targetId === forfeiterId) {
      advanceDyingResponder(session, pending);
    }
    return;
  }

  // Buqu entry and Niepan are DyingStack-owned prompts rather than ordinary
  // optional effects. A bystander departure keeps them byte-for-byte; victim
  // departure confirms the already-open dying frame and pops it safely.
  if (pending?.type === "skill_choice" && pending.resume.type === "dying") {
    const frame = topDyingFrame(session.completeRules.dying);
    if (!frame || frame.frameId !== pending.resume.frameId || frame.victimId !== pending.targetId) {
      throw new Error("离席后的濒死技能提示与 DyingStack 不一致。");
    }
    return;
  }

  // An unrelated departure must not discard an after-move prompt that is
  // temporarily covering a live DyingStack barrier. The invalidating cases
  // were restored to the direct dying cursor above.
  if (session.afterMove.suspendedPhase !== null && session.afterMove.suspendedResponse?.type === "dying") {
    return;
  }

  if (pending?.type === "standard_skill" && pending.skillId === "shenfen") {
    const continuation = pending.shenfenContinuation;
    if (!continuation) throw new Error("离席后的神愤缺少冻结游标。");
    assertShenfenContinuation(session, continuation);
    if (pending.stage === "shenfen_continue") {
      session.pendingResponse = null;
      continueShenfen(session, continuation);
      return;
    }
    if (pending.stage === "shenfen_discard_hand") {
      if (pending.targetId === forfeiterId) {
        session.pendingResponse = null;
        const next = {
          ...cloneShenfenContinuation(continuation),
          nextTargetIndex: continuation.nextTargetIndex + 1,
        };
        advanceShenfenCursor(session, continuation, next);
        continueShenfen(session, next);
      }
      return;
    }
    throw new Error("离席后的神愤处于未知阶段。");
  }

  if (pending?.type === "standard_skill" && pending.skillId === "yeyan") {
    const continuation = pending.yeyanContinuation;
    if (!continuation) throw new Error("离席后的业炎缺少冻结游标。");
    assertYeyanContinuation(session, continuation);
    if (pending.stage !== "yeyan_after_cost") throw new Error("离席后的业炎处于未知阶段。");
    session.pendingResponse = null;
    continueYeyanAfterCost(session, continuation);
    return;
  }

  if (pending?.type === "standard_skill" && pending.skillId === "guixin" &&
      pending.stage === "guixin_select" && pending.sourceId === forfeiterId &&
      getPlayer(session, pending.targetId).alive) {
    advanceGuixinSelection(session, pending, (pending.iteration ?? -1) + 1);
    return;
  }

  if ((pending?.type === "standard_skill" || pending?.type === "weapon_action") && pending.damageOpportunity) {
    const frame = assertLiveDamageCursor(session, pending.damageOpportunity);
    const prompt = currentDamageFlowPrompt(session.completeRules.damageFlow);
    const opportunity = frame.window?.opportunities[frame.window.cursor];
    if (!prompt || !opportunity || opportunity.ref.opportunityId !== prompt.opportunityId) {
      throw new Error("离席后的 DamageFlow 时机游标不一致。");
    }
    if (liveDamageOpportunityEligible(session, frame, opportunity.ref.skillId, opportunity.ref.ownerId)) {
      return;
    }
    session.pendingResponse = null;
    consumeLiveDamageOpportunity(session, pending.damageOpportunity, "pass", null);
    driveLiveDamageFlow(session, true);
    return;
  }

  const activeShenfenDamage = activeShenfenDamageContinuation(session);
  if (activeShenfenDamage && pending) {
    const cursor = pending.type === "standard_skill" || pending.type === "weapon_action"
      ? pending.damageOpportunity
      : undefined;
    if (pending.targetId === forfeiterId && cursor) {
      session.pendingResponse = null;
      consumeLiveDamageOpportunity(session, cursor, "pass", null);
      driveLiveDamageFlow(session, true);
    }
    // A different player's prompt remains authoritative. In either case the
    // root DamageFlow frame retains the committed Shenfen cursor.
    return;
  }


  const activeYeyanDamage = activeYeyanDamageContinuation(session);
  if (activeYeyanDamage && pending) {
    const cursor = pending.type === "standard_skill" || pending.type === "weapon_action"
      ? pending.damageOpportunity
      : undefined;
    if (pending.targetId === forfeiterId && cursor) {
      session.pendingResponse = null;
      consumeLiveDamageOpportunity(session, cursor, "pass", null);
      driveLiveDamageFlow(session, true);
    }
    // A committed Yeyan allocation remains authoritative after any source or
    // target departure; only the departed responder's opportunity is skipped.
    return;
  }

  if (pending?.type === "standard_skill" && pending.skillId === "wuhun" &&
      pending.stage === "wuhun_target" && pending.deathResolution) {
    const frame = topDeathFrame(session.completeRules.death);
    if (!frame || frame.frameId !== pending.deathResolution.frameId || frame.death.victimId !== pending.targetId ||
        frame.stage !== "death_triggers" || frame.suspendedByFrameId !== null ||
        pending.deathResolution.wuhunResolved === true || getPlayer(session, pending.targetId).alive) {
      throw new Error("离席后的武魂选人续体与 DeathStack 不一致。");
    }
    if (pending.targetIds?.includes(forfeiterId)) {
      session.pendingResponse = null;
      continueDeathTriggers(session, frame, clonePendingDeathResolution(pending.deathResolution));
    }
    return;
  }

  const unrelatedAfterMoveForfeit = pending?.targetId !== forfeiterId && (
    pending?.type === "skill_choice" && pending.resume.type === "after_move" ||
    pending?.type === "standard_skill" && pending.stage === "buqu_recovery" &&
      session.afterMove.suspendedPhase !== null && session.afterMove.suspendedResponse !== null
  );
  if (unrelatedAfterMoveForfeit) return;

  if (pending?.type === "standard_skill" && pending.skillId === "xingshang" &&
      pending.stage === "xingshang_claim" && pending.deathResolution) {
    const frame = topDeathFrame(session.completeRules.death);
    if (!frame || frame.frameId !== pending.deathResolution.frameId || frame.death.victimId !== pending.sourceId ||
        frame.stage !== "card_disposition") {
      throw new Error("离席后的行殇续体与 DeathStack 不一致。");
    }
    const owner = getPlayer(session, pending.targetId);
    if (!owner.alive || !hasEffectiveSkill(session, owner, "xingshang")) {
      session.pendingResponse = null;
      continueDeathCardDisposition(session, frame, clonePendingDeathResolution(pending.deathResolution));
    }
    return;
  }

  if (pending?.type === "standard_skill" &&
      ((pending.skillId === "kuangfeng" && pending.stage === "kuangfeng_choice") ||
       (pending.skillId === "dawu" && pending.stage === "dawu_choice"))) {
    const owner = getPlayer(session, pending.targetId);
    if (!owner.alive) {
      if (session.currentPlayerId !== owner.id) throw new Error("七星天气离席续接与当前回合不一致。");
      session.pendingResponse = null;
      beginNextTurn(session);
    } else {
      session.pendingResponse = {
        ...pending,
        targetIds: (pending.targetIds ?? []).filter((playerId) => playerId !== forfeiterId),
      };
    }
    return;
  }

  if (pending?.type === "standard_skill" && pending.skillId === "qixing" &&
      pending.stage === "qixing_initial") {
    const owner = getPlayer(session, pending.targetId);
    if (owner.alive && owner.id !== forfeiterId) return;
    session.pendingResponse = null;
    session.turn.phase = "prepare";
    continueGameStartSkills(session);
    return;
  }

  if (pending?.type === "standard_skill" && pending.skillId === "shelie" &&
      (pending.stage === "shelie_invoke" || pending.stage === "shelie_select")) {
    const owner = getPlayer(session, pending.targetId);
    if (owner.alive && owner.id !== forfeiterId) return;
    if (session.currentPlayerId !== owner.id) throw new Error("涉猎离席续接与当前回合不一致。");
    session.pendingResponse = null;
    beginNextTurn(session);
    return;
  }

  if (pending?.type === "standard_skill" && pending.skillId === "guixin" &&
      (pending.stage === "guixin_invoke" || pending.stage === "guixin_select")) {
    const owner = getPlayer(session, pending.targetId);
    if (!owner.alive) {
      if (!pending.damageOpportunity) throw new Error("离席后的归心缺少 DamageFlow 游标。");
      session.pendingResponse = null;
      consumeLiveDamageOpportunity(session, pending.damageOpportunity, "pass", null);
      addLog(session, "system", `${owner.id} 离席，当前归心机会按未发动续接。`);
      driveLiveDamageFlow(session, true);
    }
    return;
  }

  if (pending?.type === "standard_skill" && pending.skillId === "qinyin" && pending.stage === "qinyin_choice") {
    const owner = getPlayer(session, pending.targetId);
    if (owner.alive) return;
    session.pendingResponse = null;
    clearDiscardPhaseHistory(session);
    completeTurn(session, owner);
    return;
  }

  if (pending?.type === "standard_skill" && pending.skillId === "lianpo" && pending.stage === "lianpo_choice") {
    if (!pending.sourceId) throw new Error("离席后的连破续体缺少结束回合角色。");
    const armed = session.turn.lianpoArmedOwnerIds ?? [];
    const remaining = armed.filter((playerId) => playerId !== forfeiterId);
    session.turn.lianpoArmedOwnerIds = remaining;
    if (pending.targetId === forfeiterId) {
      session.pendingResponse = null;
      offerNextLianpoChoice(session, pending.sourceId, [...(pending.processedPlayerIds ?? []), forfeiterId]);
    } else {
      session.pendingResponse = { ...pending, targetIds: remaining.slice(1) };
    }
    return;
  }

  // An administrative departure can invalidate sources, victims and hidden
  // selections throughout a response chain. Cancel that one in-flight effect
  // and return control to the authoritative turn instead of retaining a prompt
  // that can no longer be answered.
  if (pending) {
    discardAbandonedResponseCards(session);
    addLog(session, "system", "一名玩家离席，当前未完成的牌结算已取消。");
  }

  const current = getPlayer(session, session.currentPlayerId);
  if (!current.alive) {
    beginNextTurn(session);
  } else if (session.turn.phase === "respond") {
    session.turn.phase = "play";
  }
}

/**
 * Removes a room member from a running game. The player is marked dead and all
 * of their cards are discarded. Only the normal identity victory conditions
 * may finish the match; otherwise the current response/turn is made playable
 * again so the remaining room can continue.
 */
export function forfeitPlayer(session: GameSession, playerId: PlayerId): GameSession {
  if (session.status === "finished") {
    ruleError("GAME_FINISHED", "游戏已经结束。");
  }
  getLivingPlayer(session, playerId);
  if (!Number.isSafeInteger(session.revision) || session.revision < 0 || session.revision >= Number.MAX_SAFE_INTEGER) {
    throw new Error("游戏修订号非法或已耗尽。");
  }
  const next = cloneSession(session);
  restoreSuspendedDyingForForfeit(next, playerId);
  restoreSuspendedShenfenForForfeit(next);
  restoreSuspendedYeyanForForfeit(next);
  const interruptedResponse = clonePendingResponse(next.pendingResponse);
  const interruptedPhase = next.turn.phase;
  const forfeiter = getLivingPlayer(next, playerId);
  const forfeitEventId = allocateEventId(next);
  forfeiter.alive = false;
  forfeiter.hp = 0;
  beginDeathResolution(
    next,
    {
      type: "death",
      eventId: forfeitEventId,
      victimId: forfeiter.id,
      killerId: null,
      reason: { type: "hp_loss", eventId: forfeitEventId, sourceId: null },
    },
    {
      rewards: false,
      checkWinner: false,
      allowXingshang: false,
      allowWuhun: false,
      logKind: "forfeit",
      completion: { type: "none" },
    },
  );
  next.pendingResponse = interruptedResponse;
  next.turn.phase = interruptedPhase;
  closeForfeitedDyingVictim(next, forfeiter.id);
  next.revision = session.revision + 1;
  const winner = winnerFor(next);
  if (winner) {
    const dying = next.pendingResponse?.type === "dying"
      ? clonePendingResponse(next.pendingResponse)
      : null;
    if (dying?.type === "dying") {
      next.pendingResponse = null;
      const victim = getPlayer(next, dying.victimId);
      if (victim.alive) {
        const frame = topDyingFrame(next.completeRules.dying);
        if (!frame || frame.frameId !== dying.frameId) throw new Error("离席终局缺少濒死栈顶。");
        while (frame.stage === "rescue") {
          if (currentDyingOwnerResponseSkill(frame) === "niepan") {
            declineDyingOwnerResponseSave(frame, "niepan", victim.hp);
          } else {
            const responderId = currentDyingResponder(frame);
            if (!responderId) break;
            passDyingRescue(lifePlayerSnapshot(next), frame, responderId);
          }
        }
        failDyingRescue(next, dying);
      }
      if (next.status !== "finished") finishWithWinner(next, winnerFor(next) ?? winner);
    } else {
      discardAbandonedResponseCards(next);
      finishWithWinner(next, winner);
    }
    offerNextAfterMoveSkill(next);
    return next;
  }

  resumeAfterForfeit(next, forfeiter.id);
  offerNextAfterMoveSkill(next);
  return next;
}

function playableCards(session: GameSession, viewer: GamePlayer): PlayableCardHint[] {
  const livingIds = session.players
    .filter((player) => player.alive)
    .map((player) => player.id);
  const targets = session.players
    .filter((player) => player.alive && player.id !== viewer.id)
    .map((player) => player.id);
  const cards: PlayableCardHint[] = [];
  for (const card of viewer.hand) {
    const wushenReplaced = isWushenLockedHeartHandCard(session, viewer, card);
    if (wushenReplaced && card.kind !== "slash") continue;
    if (isSlashCardKind(card.kind)) {
      if (canUseAnotherSlash(session, viewer)) {
        const slashEffectiveSuit = effectiveCardSuit(session, viewer, card);
        const slashTargets = targets.filter((targetId) => {
          const target = getLivingPlayer(session, targetId);
          return canBeSlashTarget(session, target) &&
            isInOwnerDeclaredSlashRange(session, viewer, targetId, slashEffectiveSuit);
        });
        const maxTargets = activeSlashTargetLimit(
          session,
          viewer,
          viewer.equipment.weapon?.kind === "fang_tian_hua_ji" && viewer.hand.length === 1,
        );
        cards.push({
          cardId: card.id,
          kind: card.kind,
          targetMode: activeSlashTargetMode(maxTargets),
          targetIds: [...slashTargets],
        });
      }
      continue;
    }
    switch (card.kind) {
      case "chi_tu":
      case "da_wan":
      case "zi_xing":
      case "di_lu":
      case "hua_liu":
      case "jue_ying":
      case "zhua_huang_fei_dian":
      case "zhu_ge_lian_nu":
      case "gu_ding_dao":
      case "ci_xiong_shuang_gu_jian":
      case "han_bing_jian":
      case "qing_long_yan_yue_dao":
      case "zhang_ba_she_mao":
      case "guan_shi_fu":
      case "fang_tian_hua_ji":
      case "zhu_que_yu_shan":
      case "qi_lin_gong":
      case "ren_wang_dun":
      case "teng_jia":
      case "bai_yin_shi_zi":
      case "ba_gua_zhen":
      case "qing_gang_jian":
        cards.push({ cardId: card.id, kind: card.kind, targetMode: "self", targetIds: [viewer.id] });
        break;
      case "peach":
        if (viewer.hp < viewer.maxHp) {
          cards.push({
            cardId: card.id,
            kind: card.kind,
            targetMode: "self",
            targetIds: [viewer.id],
          });
        }
        break;
      case "wine":
        if (!session.turn.wineUsed) {
          cards.push({
            cardId: card.id,
            kind: card.kind,
            targetMode: "self",
            targetIds: [viewer.id],
          });
        }
        break;
      case "duel":
        cards.push({
          cardId: card.id,
          kind: card.kind,
          targetMode: "single-other",
          targetIds: targets.filter((targetId) => canBeDuelTarget(session, getLivingPlayer(session, targetId))),
        });
        break;
      case "ex_nihilo":
        cards.push({
          cardId: card.id,
          kind: card.kind,
          targetMode: "self",
          targetIds: [viewer.id],
        });
        break;
      case "barbarian_invasion":
      case "arrow_barrage":
      case "peach_garden":
        cards.push({
          cardId: card.id,
          kind: card.kind,
          targetMode: "none",
          targetIds: [],
        });
        break;
      case "le_bu_si_shu":
        cards.push({
          cardId: card.id,
          kind: card.kind,
          targetMode: "single-other",
          targetIds: targets.filter((targetId) => {
            const target = getLivingPlayer(session, targetId);
            return canBeQianxunTarget(session, target) && !target.judgment.some((delayed) => delayed.kind === card.kind);
          }),
        });
        break;
      case "bing_liang_cun_duan":
        cards.push({
          cardId: card.id,
          kind: card.kind,
          targetMode: "single-other",
          targetIds: targets.filter((targetId) => {
            const target = getLivingPlayer(session, targetId);
            return (hasEffectiveSkill(session, viewer, "qicai") || distanceBetweenPlayers(session, viewer.id, targetId) <= 1) &&
              !target.judgment.some((delayed) => delayed.kind === card.kind);
          }),
        });
        break;
      case "shan_dian":
        if (!viewer.judgment.some((delayed) => delayed.kind === card.kind)) {
          cards.push({ cardId: card.id, kind: card.kind, targetMode: "self", targetIds: [viewer.id] });
        }
        break;
      case "wu_xie_ke_ji":
      case "dodge":
        break;
      case "guo_he_chai_qiao":
        cards.push({
          cardId: card.id,
          kind: card.kind,
          targetMode: "single-other",
          targetIds: targets.filter((targetId) => hasCardsInAnyZone(getLivingPlayer(session, targetId))),
        });
        break;
      case "shun_shou_qian_yang":
        cards.push({
          cardId: card.id,
          kind: card.kind,
          targetMode: "single-other",
          targetIds: targets.filter((targetId) => {
            const target = getLivingPlayer(session, targetId);
            return canBeQianxunTarget(session, target) &&
              (hasEffectiveSkill(session, viewer, "qicai") || distanceBetweenPlayers(session, viewer.id, targetId) <= 1) &&
              hasCardsInAnyZone(target);
          }),
        });
        break;
      case "fire_attack":
        cards.push({
          cardId: card.id,
          kind: card.kind,
          targetMode: "single-other",
          targetIds: targets.filter((targetId) => getLivingPlayer(session, targetId).hand.length > 0),
        });
        break;
      case "amazing_grace":
        cards.push({ cardId: card.id, kind: card.kind, targetMode: "none", targetIds: [] });
        break;
      case "iron_chain":
        cards.push({ cardId: card.id, kind: card.kind, targetMode: "up-to-two", targetIds: livingIds });
        break;
      case "borrowed_sword": {
        const targetPairs = targets.flatMap((holderId) => {
          const holder = getLivingPlayer(session, holderId);
          if (!holder.equipment.weapon) return [];
          return livingIds
            .filter((attackTargetId) => {
              const attackTarget = getLivingPlayer(session, attackTargetId);
              return attackTargetId !== holderId && canBeSlashTarget(session, attackTarget) &&
                isInSlashRange(session, holderId, attackTargetId);
            })
            .map((attackTargetId) => [holderId, attackTargetId] as const);
        });
        if (targetPairs.length > 0) {
          cards.push({
            cardId: card.id,
            kind: card.kind,
            targetMode: "ordered-two",
            targetIds: [...new Set(targetPairs.map(([holderId]) => holderId))],
            targetPairs,
          });
        }
        break;
      }
    }
  }
  return cards.filter((hint) => hint.targetMode !== "single-other" || hint.targetIds.length > 0);
}

function canUseAnotherSlash(session: GameSession, player: GamePlayer): boolean {
  if (session.turn.tianyiOutcome === "loss" || session.turn.tianyiOutcome === "tie") return false;
  if (player.equipment.weapon?.kind === "zhu_ge_lian_nu" || hasEffectiveSkill(session, player, "paoxiao")) return true;
  return activeSlashUses(session) < (hasTianyiWin(session, player) ? 2 : 1);
}

function slashTargetsAfterSkillCost(session: GameSession, playerId: PlayerId, cardId: CardId): PlayerId[] {
  const hypothetical = cloneSession(session);
  const player = getLivingPlayer(hypothetical, playerId);
  removeOwnedCard(hypothetical, player, cardId);
  return hypothetical.players
    .filter((target) => target.alive && target.id !== player.id && canBeSlashTarget(session, target) &&
      isInActiveSlashRange(hypothetical, player, target.id))
    .map((target) => target.id);
}

function longhunSlashGroupTargets(
  session: GameSession,
  player: GamePlayer,
): Array<{ cardIds: CardId[]; targetIds: PlayerId[]; maxTargets: number }> {
  return longhunCardGroups(session, player, "diamond").flatMap((cardIds) => {
    const probe = cloneSession(session);
    const owner = getLivingPlayer(probe, player.id);
    const allFromHand = cardIds.every((cardId) => owner.hand.some((card) => card.id === cardId));
    const fangTianEligible = allFromHand && cardIds.length === owner.hand.length;
    const components = longhunOwnedComponents(owner, cardIds);
    commitLonghunComponents(probe, owner, components, allocateEventId(probe));
    if (!canUseAnotherSlash(probe, owner)) return [];
    const maxTargets = activeSlashTargetLimit(
      probe,
      owner,
      owner.equipment.weapon?.kind === "fang_tian_hua_ji" && fangTianEligible,
    );
    const targetIds = probe.players
      .filter((target) => target.alive && target.id !== owner.id && canBeSlashTarget(probe, target) &&
        isInActiveSlashRange(probe, owner, target.id))
      .map((target) => target.id);
    return targetIds.length > 0 ? [{ cardIds: [...cardIds], targetIds, maxTargets }] : [];
  });
}

function playableSkills(session: GameSession, viewer: GamePlayer): PlayableSkillHint[] {
  const skills: PlayableSkillHint[] = [];
  const targets = session.players.filter((player) => player.alive && player.id !== viewer.id);

  if (hasEffectiveSkill(session, viewer, "wuqian") && rageMarkCount(session, viewer.id) >= 2) {
    skills.push({
      skillId: "wuqian",
      cardIds: [],
      minCards: 0,
      maxCards: 0,
      targetMode: "single-any",
      targetIds: session.players.filter((player) => player.alive).map((player) => player.id),
    });
  }

  if (hasEffectiveSkill(session, viewer, "shenfen") && rageMarkCount(session, viewer.id) >= 6 &&
      skillUseCount(session, "shenfen") === 0) {
    skills.push({
      skillId: "shenfen",
      cardIds: [],
      minCards: 0,
      maxCards: 0,
      targetMode: "none",
      targetIds: [],
    });
  }

  if (hasEffectiveSkill(session, viewer, "yeyan") && !session.completeRules.lifecycle.limitedUses.some((entry) =>
    entry.ownerId === viewer.id && entry.skillId === "yeyan")) {
    const targetIds = session.players.filter((player) => player.alive).map((player) => player.id);
    skills.push({
      skillId: "yeyan",
      cardIds: [],
      minCards: 0,
      maxCards: 0,
      targetMode: "up-to-three",
      targetIds,
    });
    const cardGroups = yeyanCostCardGroups(session, viewer);
    if (cardGroups.length > 0) {
      skills.push({
        skillId: "yeyan",
        cardIds: [...new Set(cardGroups.flat())],
        minCards: 4,
        maxCards: 4,
        cardGroups,
        targetMode: "up-to-three",
        targetIds,
      });
    }
  }

  if (hasEffectiveSkill(session, viewer, "longhun")) {
    const required = Math.max(viewer.hp, 1);
    if (viewer.hp < viewer.maxHp) {
      const cardGroups = longhunCardGroups(session, viewer, "heart");
      if (cardGroups.length > 0) {
        skills.push({
          skillId: "longhun",
          cardIds: [...new Set(cardGroups.flat())],
          minCards: required,
          maxCards: required,
          cardGroups,
          targetMode: "none",
          targetIds: [],
          virtualCardKind: "peach",
        });
      }
    }
    if (canUseAnotherSlash(session, viewer)) {
      const cardGroupTargets = longhunSlashGroupTargets(session, viewer);
      if (cardGroupTargets.length > 0) {
        const maxTargets = Math.max(...cardGroupTargets.map((group) => group.maxTargets));
        skills.push({
          skillId: "longhun",
          cardIds: [...new Set(cardGroupTargets.flatMap((group) => group.cardIds))],
          minCards: required,
          maxCards: required,
          cardGroups: cardGroupTargets.map((group) => [...group.cardIds]),
          cardGroupTargets,
          targetMode: activeSlashTargetMode(maxTargets),
          targetIds: [...new Set(cardGroupTargets.flatMap((group) => group.targetIds))],
          virtualCardKind: "fire_slash",
        });
      }
    }
  }

  if (hasEffectiveSkill(session, viewer, "gongxin") && skillUseCount(session, "gongxin") === 0 && targets.length > 0) {
    skills.push({
      skillId: "gongxin",
      cardIds: [],
      minCards: 0,
      maxCards: 0,
      targetMode: "single-other",
      targetIds: targets.map((target) => target.id),
    });
  }

  if (hasEffectiveSkill(session, viewer, "jiuchi") && !session.turn.wineUsed) {
    const cardIds = viewer.hand
      .filter((card) => card.suit === "spade" && effectiveCardSuit(session, viewer, card) === "spade")
      .map((card) => card.id);
    if (cardIds.length > 0) {
      skills.push({
        skillId: "jiuchi",
        cardIds,
        minCards: 1,
        maxCards: 1,
        targetMode: "none",
        targetIds: [],
        virtualCardKind: "wine",
      });
    }
  }

  if (hasEffectiveSkill(session, viewer, "duanliang")) {
    const costs = ownedCards(viewer).filter((card) =>
      (card.category === "basic" || card.category === "equipment") &&
      (card.suit === "spade" || card.suit === "club") &&
      isBlackCard(session, viewer, card)
    );
    const cardTargetIds = Object.fromEntries(costs.map((cost) => {
      const virtual: Card = {
        ...getCardDefinition("bing_liang_cun_duan"),
        id: cost.id,
        kind: "bing_liang_cun_duan",
        suit: cost.suit,
        rank: cost.rank,
      };
      const ids = targets.filter((target) =>
        distanceBetweenPlayers(session, viewer.id, target.id) <= 2 &&
        !target.judgment.some((card) => card.kind === "bing_liang_cun_duan") &&
        !isWeimuProhibited(session, viewer, virtual, target, "direct_target")
      ).map((target) => target.id);
      return [cost.id, ids];
    }));
    const cardIds = costs.map((card) => card.id).filter((cardId) => cardTargetIds[cardId]!.length > 0);
    const targetIds = [...new Set(cardIds.flatMap((cardId) => cardTargetIds[cardId]!))];
    if (cardIds.length > 0) {
      skills.push({
        skillId: "duanliang",
        cardIds,
        minCards: 1,
        maxCards: 1,
        targetMode: "single-other",
        targetIds,
        cardTargetIds,
        virtualCardKind: "bing_liang_cun_duan",
      });
    }
  }

  if (hasEffectiveSkill(session, viewer, "jixi")) {
    const fields = viewer.extraPiles.field ?? [];
    const cardTargetIds = Object.fromEntries(fields.map((fieldCard) => {
      const virtualCard: Card = {
        ...getCardDefinition("shun_shou_qian_yang"),
        id: fieldCard.id,
        kind: "shun_shou_qian_yang",
        suit: fieldCard.suit,
        rank: fieldCard.rank,
      };
      const targetIds = targets.filter((target) => evaluateJixi({
        context: {
          actorId: viewer.id,
          currentPlayerId: session.currentPlayerId,
          phase: session.turn.phase,
          actorAlive: viewer.alive,
          skillEffective: true,
        },
        fieldCard: mountainRuleCard(session, viewer, fieldCard, "field"),
        targetId: target.id,
        targetAlive: target.alive,
        targetCanBeTargetedBySnatch: canBeQianxunTarget(session, target) &&
          !isWeimuProhibited(session, viewer, virtualCard, target, "direct_target"),
        effectiveDistance: distanceBetweenPlayers(session, viewer.id, target.id),
        snatchDistanceLimit: hasEffectiveSkill(session, viewer, "qicai") ? Number.MAX_SAFE_INTEGER : 1,
        targetCards: tiaoxinTargetCards(session, target),
      }).ok).map((target) => target.id);
      return [fieldCard.id, targetIds];
    }));
    const cardIds = fields.map((fieldCard) => fieldCard.id).filter((cardId) => cardTargetIds[cardId]!.length > 0);
    const targetIds = [...new Set(cardIds.flatMap((cardId) => cardTargetIds[cardId]!))];
    if (cardIds.length > 0) {
      skills.push({
        skillId: "jixi",
        cardIds,
        minCards: 1,
        maxCards: 1,
        targetMode: "single-other",
        targetIds,
        cardTargetIds,
        virtualCardKind: "shun_shou_qian_yang",
      });
    }
  }

  if (hasEffectiveSkill(session, viewer, "tiaoxin") && skillUseCount(session, "tiaoxin") === 0) {
    const targetIds = targets.filter((target) => {
      const result = evaluateTiaoxin({
        context: {
          actorId: viewer.id,
          currentPlayerId: session.currentPlayerId,
          phase: session.turn.phase,
          actorAlive: viewer.alive,
          skillEffective: true,
        },
        alreadyUsedThisTurn: false,
        targetId: target.id,
        targetAlive: target.alive,
        distanceFromTargetToOwner: distanceBetweenPlayers(session, target.id, viewer.id),
        targetAttackRange: attackRangeFor(session, target.id),
        targetCanLegallySlashOwner: canBeSlashTarget(session, viewer) && tiaoxinSlashOptions(session, target).length > 0,
        targetCards: tiaoxinTargetCards(session, target),
      });
      return result.ok;
    }).map((target) => target.id);
    if (targetIds.length > 0) {
      skills.push({
        skillId: "tiaoxin",
        cardIds: [],
        minCards: 0,
        maxCards: 0,
        targetMode: "single-other",
        targetIds,
      });
    }
  }

  const zhibaLord = session.players.find((candidate) => candidate.alive && candidate.role === "lord" &&
    hasEffectiveSkill(session, candidate, "zhiba"));
  if (zhibaLord && zhibaLord.id !== viewer.id && viewer.hand.length > 0 && zhibaLord.hand.length > 0 &&
      factionOf(session, viewer) === "wu" && skillUseCount(session, "zhiba") === 0) {
    skills.push({
      skillId: "zhiba",
      cardIds: [],
      minCards: 0,
      maxCards: 0,
      targetMode: "single-other",
      targetIds: [zhibaLord.id],
    });
  }

  if (hasEffectiveSkill(session, viewer, "zhijian")) {
    const equipmentIds = viewer.hand.filter((card) => card.category === "equipment").map((card) => card.id);
    if (equipmentIds.length > 0 && targets.length > 0) {
      const targetIds = targets.map((target) => target.id);
      skills.push({
        skillId: "zhijian",
        cardIds: equipmentIds,
        minCards: 1,
        maxCards: 1,
        targetMode: "single-other",
        targetIds,
        cardTargetIds: Object.fromEntries(equipmentIds.map((cardId) => [cardId, [...targetIds]])),
      });
    }
  }

  if (hasEffectiveSkill(session, viewer, "luanwu") && !session.completeRules.lifecycle.limitedUses.some((entry) =>
    entry.ownerId === viewer.id && entry.skillId === "luanwu")) {
    skills.push({
      skillId: "luanwu",
      cardIds: [],
      minCards: 0,
      maxCards: 0,
      targetMode: "none",
      targetIds: [],
    });
  }

  if (hasEffectiveSkill(session, viewer, "dimeng") && skillUseCount(session, "dimeng") === 0) {
    const discardable = ownedCards(viewer);
    const targetPairs = targets.flatMap((first, firstIndex) => targets.slice(firstIndex + 1).flatMap((second) => {
      const costCount = Math.abs(first.hand.length - second.hand.length);
      return costCount <= discardable.length ? [[first.id, second.id] as const] : [];
    }));
    if (targetPairs.length > 0) {
      skills.push({
        skillId: "dimeng",
        cardIds: discardable.map((card) => card.id),
        minCards: 0,
        maxCards: discardable.length,
        targetMode: "ordered-two",
        targetIds: [...new Set(targetPairs.flat())],
        targetPairs,
      });
    }
  }

  if (hasEffectiveSkill(session, viewer, "qiangxi") && skillUseCount(session, "qiangxi") === 0) {
    const targetIds = targets
      .filter((target) => distanceBetweenPlayers(session, viewer.id, target.id) <= attackRangeFor(session, viewer.id))
      .map((target) => target.id);
    const weaponIds = ownedCards(viewer)
      .filter((card) => card.category === "equipment" && getCardDefinition(card.kind).equipmentSlot === "weapon")
      .map((card) => card.id);
    if (targetIds.length > 0) {
      skills.push({
        skillId: "qiangxi",
        cardIds: weaponIds,
        minCards: 0,
        maxCards: 1,
        targetMode: "single-other",
        targetIds,
        cardTargetIds: Object.fromEntries(weaponIds.map((cardId) => [cardId, [...targetIds]])),
      });
    }
  }

  if (hasEffectiveSkill(session, viewer, "tianyi") && skillUseCount(session, "tianyi") === 0 && viewer.hand.length > 0) {
    const targetIds = targets.filter((target) => target.hand.length > 0).map((target) => target.id);
    if (targetIds.length > 0) {
      skills.push({
        skillId: "tianyi",
        cardIds: [],
        minCards: 0,
        maxCards: 0,
        targetMode: "single-other",
        targetIds,
      });
    }
  }

  if (hasEffectiveSkill(session, viewer, "quhu") && skillUseCount(session, "quhu") === 0 && viewer.hand.length > 0) {
    const targetPairs = targets.flatMap((opponent) => targets.flatMap((damageTarget) => {
      const evaluated = evaluateQuhuTargets({
        context: firePlayContext(session, viewer, "quhu"),
        alreadyUsedThisTurn: false,
        actorHp: viewer.hp,
        opponent: {
          playerId: opponent.id,
          alive: opponent.alive,
          hp: opponent.hp,
          handCount: opponent.hand.length,
          canPindian: opponent.hand.length > 0,
          attackRange: attackRangeFor(session, opponent.id),
        },
        damageTarget: {
          playerId: damageTarget.id,
          alive: damageTarget.alive,
          canReceiveDamage: damageTarget.alive,
          distanceFromOpponent: distanceBetweenPlayers(session, opponent.id, damageTarget.id),
        },
      });
      return evaluated.ok ? [[opponent.id, damageTarget.id] as const] : [];
    }));
    if (targetPairs.length > 0) {
      skills.push({
        skillId: "quhu",
        cardIds: [],
        minCards: 0,
        maxCards: 0,
        targetMode: "ordered-two",
        targetIds: [...new Set(targetPairs.flat())],
        targetPairs,
      });
    }
  }

  const huangtianCards = viewer.hand.filter((card) => card.kind === "dodge" || card.kind === "shan_dian");
  const huangtianTargetIds = huangtianCards.length === 0 ? [] : targets
    .filter((target) => {
      const result = evaluateLiveHuangtianGift(session, viewer, target, huangtianCards[0]!);
      return result.ok && result.value.eligible;
    })
    .map((target) => target.id);
  if (huangtianCards.length > 0 && huangtianTargetIds.length > 0) {
    skills.push({
      skillId: "huangtian",
      cardIds: huangtianCards.map((card) => card.id),
      minCards: 1,
      maxCards: 1,
      targetMode: "single-other",
      targetIds: huangtianTargetIds,
    });
  }

  if (
    hasEffectiveSkill(session, viewer, "jijiang") &&
    skillUseCount(session, "jijiang") === 0 &&
    canUseAnotherSlash(session, viewer) &&
    lordDispatchProviders(session, viewer, "jijiang").length > 0
  ) {
    const targetIds = targets
      .filter((target) => canBeSlashTarget(session, target) && isInActiveSlashRange(session, viewer, target.id))
      .map((target) => target.id);
    if (targetIds.length > 0) {
      skills.push({
        skillId: "jijiang",
        cardIds: [],
        minCards: 0,
        maxCards: 0,
        targetMode: activeSlashTargetMode(activeSlashTargetLimit(session, viewer, false)),
        targetIds,
        virtualCardKind: "slash",
      });
    }
  }

  if (hasEffectiveSkill(session, viewer, "wushen") && canUseAnotherSlash(session, viewer)) {
    const cardIds = viewer.hand
      .filter((card) => effectiveCardSuit(session, viewer, card) === "heart")
      .map((card) => card.id);
    const targetIds = targets
      .filter((target) => canBeSlashTarget(session, target) &&
        isInOwnerDeclaredSlashRange(session, viewer, target.id, "heart"))
      .map((target) => target.id);
    if (cardIds.length > 0 && targetIds.length > 0) {
      skills.push({
        skillId: "wushen",
        cardIds,
        minCards: 1,
        maxCards: 1,
        targetMode: activeSlashTargetMode(activeSlashTargetLimit(
          session,
          viewer,
          viewer.equipment.weapon?.kind === "fang_tian_hua_ji" && viewer.hand.length === 1,
        )),
        targetIds,
        cardTargetIds: Object.fromEntries(cardIds.map((cardId) => [cardId, [...targetIds]])),
        virtualCardKind: "slash",
      });
    }
  }

  if (hasEffectiveSkill(session, viewer, "wusheng") && canUseAnotherSlash(session, viewer)) {
    const cardIds = ownedCards(viewer)
      .filter((card) => isRedCard(session, viewer, card))
      .map((card) => card.id);
    const cardTargetIds = Object.fromEntries(
      cardIds.map((cardId) => [cardId, slashTargetsAfterSkillCost(session, viewer.id, cardId)]),
    );
    const targetIds = [...new Set(Object.values(cardTargetIds).flat())];
    if (cardIds.length > 0 && targetIds.length > 0) {
      skills.push({
        skillId: "wusheng",
        cardIds,
        minCards: 1,
        maxCards: 1,
        targetMode: activeSlashTargetMode(activeSlashTargetLimit(session, viewer, false)),
        targetIds,
        cardTargetIds,
        virtualCardKind: "slash",
      });
    }
  }

  if (hasEffectiveSkill(session, viewer, "longdan") && canUseAnotherSlash(session, viewer)) {
    const cardIds = viewer.hand.filter((card) => card.kind === "dodge").map((card) => card.id);
    const targetIds = targets
      .filter((target) => canBeSlashTarget(session, target) && isInActiveSlashRange(session, viewer, target.id))
      .map((target) => target.id);
    if (cardIds.length > 0 && targetIds.length > 0) {
      skills.push({
        skillId: "longdan",
        cardIds,
        minCards: 1,
        maxCards: 1,
        targetMode: activeSlashTargetMode(activeSlashTargetLimit(
          session,
          viewer,
          viewer.equipment.weapon?.kind === "fang_tian_hua_ji" && viewer.hand.length === 1,
        )),
        targetIds,
        virtualCardKind: "slash",
      });
    }
  }

  const shuangxiongJudgmentColor = session.turn.shuangxiongJudgmentColor ?? null;
  if (hasEffectiveSkill(session, viewer, "shuangxiong") && shuangxiongJudgmentColor !== null) {
    const requiredColor = shuangxiongJudgmentColor === "red" ? "black" : "red";
    const cardIds = viewer.hand
      .filter((card) => (isRedCard(session, viewer, card) ? "red" : "black") === requiredColor)
      .map((card) => card.id);
    const targetIds = targets.filter((target) => canBeDuelTarget(session, target)).map((target) => target.id);
    if (cardIds.length > 0 && targetIds.length > 0) {
      skills.push({
        skillId: "shuangxiong",
        cardIds,
        minCards: 1,
        maxCards: 1,
        targetMode: "single-other",
        targetIds,
        virtualCardKind: "duel",
      });
    }
  }

  if (hasEffectiveSkill(session, viewer, "lianhuan")) {
    const cardIds = viewer.hand
      .filter((card) => effectiveCardSuit(session, viewer, card) === "club")
      .map((card) => card.id);
    if (cardIds.length > 0) {
      skills.push({
        skillId: "lianhuan",
        cardIds,
        minCards: 1,
        maxCards: 1,
        targetMode: "up-to-two",
        targetIds: session.players.filter((player) => player.alive).map((player) => player.id),
        virtualCardKind: "iron_chain",
      });
    }
  }

  if (hasEffectiveSkill(session, viewer, "huoji")) {
    const cardIds = viewer.hand.filter((card) => isRedCard(session, viewer, card)).map((card) => card.id);
    const cardTargetIds = Object.fromEntries(cardIds.map((cardId) => [
      cardId,
      session.players.filter((target) =>
        target.alive && target.hand.length > (target.id === viewer.id ? 1 : 0)
      ).map((target) => target.id),
    ]));
    const targetIds = [...new Set(Object.values(cardTargetIds).flat())];
    if (cardIds.length > 0 && targetIds.length > 0) {
      skills.push({
        skillId: "huoji",
        cardIds,
        minCards: 1,
        maxCards: 1,
        targetMode: "single-any",
        targetIds,
        cardTargetIds,
        virtualCardKind: "fire_attack",
      });
    }
  }

  if (hasEffectiveSkill(session, viewer, "luanji")) {
    const cardPairs = viewer.hand.flatMap((first, firstIndex) =>
      viewer.hand.slice(firstIndex + 1)
        .filter((second) => effectiveCardSuit(session, viewer, first) === effectiveCardSuit(session, viewer, second))
        .map((second) => [first.id, second.id] as const)
    );
    if (cardPairs.length > 0) {
      skills.push({
        skillId: "luanji",
        cardIds: [...new Set(cardPairs.flat())],
        minCards: 2,
        maxCards: 2,
        targetMode: "none",
        targetIds: [],
        cardPairs,
        virtualCardKind: "arrow_barrage",
      });
    }
  }

  if (hasEffectiveSkill(session, viewer, "qixi")) {
    const cardIds = ownedCards(viewer)
      .filter((card) => isBlackCard(session, viewer, card))
      .map((card) => card.id);
    const targetIds = targets.filter(hasCardsInAnyZone).map((target) => target.id);
    if (cardIds.length > 0 && targetIds.length > 0) {
      skills.push({
        skillId: "qixi",
        cardIds,
        minCards: 1,
        maxCards: 1,
        targetMode: "single-other",
        targetIds,
        virtualCardKind: "guo_he_chai_qiao",
      });
    }
  }

  const liveJilue = jilueContext(session, viewer);
  if (liveJilue.skillEffective && liveJilue.awakened && liveJilue.renMarks > 0 &&
      !hasEffectiveSkill(session, viewer, "zhiheng") && skillUseCount(session, "jilue") === 0) {
    const cardIds = ownedCards(viewer).map((card) => card.id);
    if (cardIds.length > 0) {
      skills.push({
        skillId: "jilue",
        cardIds,
        minCards: 1,
        maxCards: cardIds.length,
        targetMode: "none",
        targetIds: [],
      });
    }
  }

  if (hasEffectiveSkill(session, viewer, "zhiheng") && skillUseCount(session, "zhiheng") === 0) {
    const cardIds = ownedCards(viewer).map((card) => card.id);
    if (cardIds.length > 0) {
      skills.push({
        skillId: "zhiheng",
        cardIds,
        minCards: 1,
        maxCards: cardIds.length,
        targetMode: "none",
        targetIds: [],
      });
    }
  }

  if (hasEffectiveSkill(session, viewer, "rende") && viewer.hand.length > 0 && targets.length > 0) {
    skills.push({
      skillId: "rende",
      cardIds: viewer.hand.map((card) => card.id),
      minCards: 1,
      maxCards: viewer.hand.length,
      targetMode: "single-other",
      targetIds: targets.map((target) => target.id),
    });
  }

  if (hasEffectiveSkill(session, viewer, "qingnang") && skillUseCount(session, "qingnang") === 0 && viewer.hand.length > 0) {
    const targetIds = session.players
      .filter((target) => target.alive && target.hp < target.maxHp)
      .map((target) => target.id);
    if (targetIds.length > 0) {
      skills.push({
        skillId: "qingnang",
        cardIds: viewer.hand.map((card) => card.id),
        minCards: 1,
        maxCards: 1,
        targetMode: "single-other",
        targetIds,
      });
    }
  }

  if (hasEffectiveSkill(session, viewer, "jieyin") && skillUseCount(session, "jieyin") === 0 && viewer.hand.length >= 2) {
    const targetIds = targets
      .filter((target) => target.hp < target.maxHp && genderOf(session, target) === "male")
      .map((target) => target.id);
    if (targetIds.length > 0) {
      skills.push({
        skillId: "jieyin",
        cardIds: viewer.hand.map((card) => card.id),
        minCards: 2,
        maxCards: 2,
        targetMode: "single-other",
        targetIds,
      });
    }
  }

  if (hasEffectiveSkill(session, viewer, "guose")) {
    const cardIds = ownedCards(viewer)
      .filter((card) => effectiveCardSuit(session, viewer, card) === "diamond")
      .map((card) => card.id);
    const targetIds = targets
      .filter((target) => canBeQianxunTarget(session, target) && !target.judgment.some((card) => card.kind === "le_bu_si_shu"))
      .map((target) => target.id);
    if (cardIds.length > 0 && targetIds.length > 0) {
      skills.push({
        skillId: "guose",
        cardIds,
        minCards: 1,
        maxCards: 1,
        targetMode: "single-other",
        targetIds,
        virtualCardKind: "le_bu_si_shu",
      });
    }
  }

  if (hasEffectiveSkill(session, viewer, "fanjian") && skillUseCount(session, "fanjian") === 0 && viewer.hand.length > 0 && targets.length > 0) {
    skills.push({
      skillId: "fanjian",
      cardIds: [],
      minCards: 0,
      maxCards: 0,
      targetMode: "single-other",
      targetIds: targets.map((target) => target.id),
    });
  }

  if (hasEffectiveSkill(session, viewer, "lijian") && skillUseCount(session, "lijian") === 0) {
    const cardIds = ownedCards(viewer).map((card) => card.id);
    const maleTargets = targets.filter((target) =>
      genderOf(session, target) === "male"
    );
    const targetPairs = maleTargets.flatMap((initiator) =>
      maleTargets
        .filter((target) => target.id !== initiator.id)
        .map((target) => [initiator.id, target.id] as const)
    );
    if (cardIds.length > 0 && targetPairs.length > 0) {
      skills.push({
        skillId: "lijian",
        cardIds,
        minCards: 1,
        maxCards: 1,
        targetMode: "ordered-two",
        targetIds: maleTargets.map((target) => target.id),
        targetPairs,
      });
    }
  }

  if (hasEffectiveSkill(session, viewer, "kurou")) {
    skills.push({
      skillId: "kurou",
      cardIds: [],
      minCards: 0,
      maxCards: 0,
      targetMode: "none",
      targetIds: [],
    });
  }

  return skills;
}

function responseSkillHints(
  session: GameSession,
  viewer: GamePlayer,
  required: "slash" | "dodge",
): SkillResponseHint[] {
  const hints: SkillResponseHint[] = [];
  if (required === "slash" && hasEffectiveSkill(session, viewer, "wushen")) {
    const cardIds = viewer.hand
      .filter((card) => effectiveCardSuit(session, viewer, card) === "heart")
      .map((card) => card.id);
    if (cardIds.length > 0) hints.push({ skillId: "wushen", cardIds, responseKind: "slash" });
  }
  if (required === "slash" && hasEffectiveSkill(session, viewer, "wusheng")) {
    const cardIds = ownedCards(viewer)
      .filter((card) => isRedCard(session, viewer, card))
      .map((card) => card.id);
    if (cardIds.length > 0) hints.push({ skillId: "wusheng", cardIds, responseKind: "slash" });
  }
  if (hasEffectiveSkill(session, viewer, "longdan")) {
    const cardIds = required === "slash"
      ? viewer.hand.filter((card) => card.kind === "dodge").map((card) => card.id)
      : viewer.hand.filter((card) => isSlashCardKind(card.kind)).map((card) => card.id);
    if (cardIds.length > 0) hints.push({ skillId: "longdan", cardIds, responseKind: required });
  }
  if (required === "dodge" && hasEffectiveSkill(session, viewer, "qingguo")) {
    const cardIds = viewer.hand
      .filter((card) => isBlackCard(session, viewer, card))
      .map((card) => card.id);
    if (cardIds.length > 0) hints.push({ skillId: "qingguo", cardIds, responseKind: "dodge" });
  }
  const longhunGroups = longhunCardGroups(session, viewer, required === "slash" ? "diamond" : "club");
  if (longhunGroups.length > 0) {
    const requiredCards = Math.max(viewer.hp, 1);
    hints.push({
      skillId: "longhun",
      cardIds: [...new Set(longhunGroups.flat())],
      responseKind: required,
      minCards: requiredCards,
      maxCards: requiredCards,
      cardGroups: longhunGroups,
    });
  }
  return hints;
}

function dyingSkillHints(session: GameSession, viewer: GamePlayer, victimId: PlayerId): SkillResponseHint[] {
  const hints: SkillResponseHint[] = [];
  if (hasEffectiveSkill(session, viewer, "jijiu") && session.currentPlayerId !== viewer.id &&
      peachAllowedByWansha(session, viewer.id, victimId)) {
    const cardIds = ownedCards(viewer)
      .filter((card) => isRedCard(session, viewer, card))
      .map((card) => card.id);
    if (cardIds.length > 0) hints.push({ skillId: "jijiu", cardIds, responseKind: "peach" });
  }
  if (viewer.id === victimId && hasEffectiveSkill(session, viewer, "jiuchi")) {
    const cardIds = viewer.hand
      .filter((card) => card.suit === "spade" && effectiveCardSuit(session, viewer, card) === "spade")
      .map((card) => card.id);
    if (cardIds.length > 0) hints.push({ skillId: "jiuchi", cardIds, responseKind: "wine" });
  }
  if (peachAllowedByWansha(session, viewer.id, victimId)) {
    const longhunGroups = longhunCardGroups(session, viewer, "heart");
    if (longhunGroups.length > 0) {
      const requiredCards = Math.max(viewer.hp, 1);
      hints.push({
        skillId: "longhun",
        cardIds: [...new Set(longhunGroups.flat())],
        responseKind: "peach",
        minCards: requiredCards,
        maxCards: requiredCards,
        cardGroups: longhunGroups,
      });
    }
  }
  return hints;
}

type CardResponsePending = Extract<PendingResponse, { type: "slash" | "duel" | "mass_attack" | "borrowed_sword" }>;

function responseContext(pending: CardResponsePending): ResponseContext {
  if (pending.type !== "mass_attack") return pending.type;
  return pending.cardKind;
}

function responseKind(pending: CardResponsePending): "slash" | "dodge" {
  if (pending.type === "slash") return "dodge";
  if (pending.type === "duel" || pending.type === "borrowed_sword") return "slash";
  return pending.responseKind;
}

function promptFor(session: GameSession, viewerId: PlayerId | null): GamePrompt {
  if (session.status === "finished") {
    if (!session.winner) throw new Error("结束的游戏缺少胜者。");
    return {
      type: "finished",
      winner: { ...session.winner, playerIds: [...session.winner.playerIds] },
    };
  }
  if (viewerId === null) return { type: "waiting" };
  const viewer = session.players.find((player) => player.id === viewerId);
  const pending = session.pendingResponse;
  const deadWuhunViewer = viewer !== undefined && !viewer.alive &&
    session.turn.phase === "respond" && pending?.type === "standard_skill" &&
    pending.targetId === viewer.id && pending.skillId === "wuhun" && pending.stage === "wuhun_target";
  if (!viewer || (!viewer.alive && !deadWuhunViewer)) return { type: "waiting" };

  if (session.turn.phase === "play" && session.currentPlayerId === viewer.id) {
    const zhangBaSlash = viewer.equipment.weapon?.kind === "zhang_ba_she_mao" &&
      canUseAnotherSlash(session, viewer) && viewer.hand.length >= 2
      ? {
          allowedCardIds: viewer.hand.map((card) => card.id),
          targetIds: session.players
            .filter((player) => player.alive && player.id !== viewer.id && canBeSlashTarget(session, player) &&
              isInActiveSlashRange(session, viewer, player.id))
            .map((player) => player.id),
          maxTargets: activeSlashTargetLimit(session, viewer, false),
        }
      : null;
    return {
      type: "play",
      playerId: viewer.id,
      cards: playableCards(session, viewer),
      skills: playableSkills(session, viewer),
      ...(zhangBaSlash ? { zhangBaSlash } : {}),
    };
  }

  if (session.turn.phase === "respond" && pending?.targetId === viewer.id) {
    if (pending.type === "guhuo") {
      if (pending.stage !== "challenge") return { type: "waiting" };
      return {
        type: "guhuo_challenge",
        playerId: viewer.id,
        sourceId: pending.sourceId,
        declaredKind: pending.declaredKind,
        promptId: pending.promptId,
        canChallenge: true,
      };
    }
    if (pending.type === "pindian") {
      assertLivePindian(session, pending);
      if (pending.frame.stage !== "selecting") return { type: "waiting" };
      const opponentId = viewer.id === pending.frame.initiatorId
        ? pending.frame.targetId
        : pending.frame.initiatorId;
      return {
        type: "choose_pindian_card",
        playerId: viewer.id,
        opponentId,
        skillId: pending.skillId,
        promptId: pending.promptId,
        allowedCardIds: viewer.hand.map((card) => card.id),
      };
    }
    if (pending.type === "qiangxi_effect") return { type: "waiting" };
    if (pending.type === "fanjian_suit") {
      return {
        type: "fanjian_suit",
        playerId: viewer.id,
        sourceId: pending.attackerId,
        promptId: pending.promptId,
        suits: ["spade", "heart", "club", "diamond"],
      };
    }
    if (pending.type === "skill_choice") {
      return {
        type: "skill_choice",
        playerId: viewer.id,
        skillId: pending.skillId,
        ...(pending.promptId ? { promptId: pending.promptId } : {}),
        ...(pending.skillId === "luoshen" ? { iteration: pending.iteration ?? 0 } : {}),
        canPass: true,
      };
    }
    if (pending.type === "standard_judgment") {
      const retrial = currentJudgmentRetrialOpportunity(pending.frame);
      const post = currentJudgmentPostOpportunity(pending.frame);
      const songweiOwner = !retrial && !post ? nextSongweiOwner(session, pending) : null;
      const skillId = (retrial?.skillId ?? (songweiOwner ? "songwei" : "tiandu")) as StandardImplementedSkillId;
      const allowedCardIds = retrial ? judgmentRetrialCardIds(session, viewer, retrial.skillId) : [];
      return {
        type: "standard_skill",
        playerId: viewer.id,
        skillId,
        stage: retrial ? "judgment_retrial" : songweiOwner ? "songwei_invoke" : "judgment_post",
        promptId: pending.promptId,
        canPass: true,
        cards: skillId === "guidao" ? ownedCards(viewer).filter((card) => allowedCardIds.includes(card.id)).map(cloneCard) : [],
        allowedCardIds,
        targetIds: [],
        minCards: retrial ? 1 : 0,
        maxCards: retrial ? 1 : 0,
        minTargets: 0,
        maxTargets: 0,
      };
    }
    if (pending.type === "standard_skill") {
      let cards: Card[] = [];
      let allowedCardIds: CardId[] = [];
      let targetIds: PlayerId[] = [];
      let minCards = 0;
      let maxCards = 0;
      let minTargets = 0;
      let maxTargets = 0;
      let options: string[] | undefined;
      let choices: Array<{ token: string; ownerId: PlayerId; zone: "hand" | "equipment" | "judgment"; card: Card | null }> | undefined;
      let cardTargetIds: Record<CardId, PlayerId[]> | undefined;
      let canPass = pending.stage === "invoke"
        || pending.stage === "tuxi_select"
        || pending.stage === "liuli_redirect"
        || pending.stage === "tianxiang_redirect"
        || pending.stage === "shensu_judgment_draw"
        || pending.stage === "shensu_play"
        || pending.stage === "shuangxiong_draw"
        || pending.stage === "jieming_target"
        || pending.stage === "mengjin_discard"
        || pending.stage === "leiji_target"
        || pending.stage === "leiji_judgment_retrial"
        || pending.stage === "leiji_judgment_post"
        || pending.stage === "xingshang_claim"
        || pending.stage === "fangzhu_target"
        || pending.stage === "jilue_fangzhu"
        || pending.stage === "baonue_invoke"
        || pending.stage === "lieren_invoke"
        || pending.stage === "lieren_gain"
        || pending.stage === "tiaoxin_response"
        || pending.stage === "xiangle_payment"
        || pending.stage === "jiang_invoke"
        || pending.stage === "yingyang_modify"
        || pending.stage === "zhiba_accept"
        || pending.stage === "zhiba_gain"
        || pending.stage === "beige_cost"
        || pending.stage === "xinsheng_invoke"
        || pending.stage === "huashen_turn_start"
        || pending.stage === "huashen_turn_end"
        || pending.stage === "haoshi_draw"
        || pending.stage === "zaiqi_draw"
        || pending.stage === "yinghun_select"
        || pending.stage === "tuntian_invoke"
        || pending.stage === "fangquan_skip"
        || pending.stage === "fangquan_finish"
        || pending.stage === "qiaobian_skip"
        || pending.stage === "qiaobian_draw"
        || pending.stage === "qiaobian_play"
        || pending.stage === "guzheng_claim"
        || pending.stage === "guixin_invoke"
        || pending.stage === "qinyin_choice"
        || pending.stage === "lianpo_choice"
        || pending.stage === "shelie_invoke"
        || pending.stage === "gongxin_choose"
        || pending.stage === "qixing_exchange"
        || pending.stage === "kuangfeng_choice"
        || pending.stage === "dawu_choice";
      if ((pending.skillId === "kuangfeng" && pending.stage === "kuangfeng_choice") ||
          (pending.skillId === "dawu" && pending.stage === "dawu_choice")) {
        const stars = viewer.extraPiles[QIXING_PILE_ID] ?? [];
        const frozenStarIds = pending.starCardIds ?? [];
        const frozenTargetIds = pending.targetIds ?? [];
        const currentTargetIds = session.players.filter((player) => player.alive).map((player) => player.id);
        if (session.currentPlayerId !== viewer.id || stars.length === 0 ||
            stars.length !== frozenStarIds.length || new Set(frozenStarIds).size !== frozenStarIds.length ||
            stars.some((entry) => !frozenStarIds.includes(entry.id)) ||
            frozenTargetIds.length !== currentTargetIds.length || new Set(frozenTargetIds).size !== frozenTargetIds.length ||
            frozenTargetIds.some((playerId, index) => playerId !== currentTargetIds[index])) {
          throw new Error("七星天气公开提示与结束阶段冻结状态不一致。");
        }
        cards = stars.map(cloneCard);
        allowedCardIds = [...frozenStarIds];
        targetIds = [...frozenTargetIds];
        minCards = 1;
        minTargets = 1;
        maxCards = pending.skillId === "kuangfeng" ? 1 : Math.min(stars.length, targetIds.length);
        maxTargets = pending.skillId === "kuangfeng" ? 1 : maxCards;
        canPass = true;
      } else if (pending.skillId === "qixing" &&
          (pending.stage === "qixing_initial" || pending.stage === "qixing_exchange")) {
        const stars = viewer.extraPiles[QIXING_PILE_ID] ?? [];
        const frozenHandIds = pending.handCardIds ?? [];
        const frozenStarIds = pending.starCardIds ?? [];
        if (viewer.hand.length !== frozenHandIds.length || stars.length !== frozenStarIds.length ||
            new Set(frozenHandIds).size !== frozenHandIds.length ||
            new Set(frozenStarIds).size !== frozenStarIds.length ||
            viewer.hand.some((card) => !frozenHandIds.includes(card.id)) ||
            stars.some((card) => !frozenStarIds.includes(card.id))) {
          throw new Error("七星私有提示与权威交换续体不一致。");
        }
        cards = [...viewer.hand, ...stars].map(cloneCard);
        allowedCardIds = cards.map((card) => card.id);
        minCards = 0;
        maxCards = 2 * Math.min(viewer.hand.length, stars.length);
        canPass = pending.stage === "qixing_exchange";
      } else if (pending.skillId === "guixin" && pending.stage === "guixin_invoke") {
        if (!pending.damageOpportunity || pending.damageOpportunity.ownerId !== viewer.id || pending.iteration !== 0) {
          throw new Error("归心发动提示缺少 DamageFlow 游标。");
        }
        canPass = true;
      } else if (pending.skillId === "guixin" && pending.stage === "guixin_select") {
        const index = pending.iteration;
        const sourceId = pending.sourceId;
        if (!Number.isSafeInteger(index) || index! < 0 || !sourceId || pending.targetIds?.[index!] !== sourceId) {
          throw new Error("归心选牌提示缺少冻结座次游标。");
        }
        const source = getLivingPlayer(session, sourceId);
        if (!guixinTargetHasCard(source)) throw new Error("归心当前角色已无可获得的区域牌。");
        choices = [
          ...(source.hand.length > 0
            ? [{ token: "hand", ownerId: source.id, zone: "hand" as const, card: null }]
            : []),
          ...Object.entries(source.equipment).map(([slot, card]) => ({
            token: `equipment:${slot}`,
            ownerId: source.id,
            zone: "equipment" as const,
            card: cloneCard(card),
          })),
          ...source.judgment.map((card, cardIndex) => ({
            token: `judgment:${cardIndex}`,
            ownerId: source.id,
            zone: "judgment" as const,
            card: cloneCard(card),
          })),
        ];
        minCards = 1;
        maxCards = 1;
        canPass = false;
      } else if (pending.skillId === "jilue" && pending.stage === "jilue_wansha") {
        const context = jilueContext(session, viewer);
        if (session.currentPlayerId !== viewer.id || pending.requestedCount !== context.renMarks ||
            !context.skillEffective || !context.awakened || context.renMarks < 1) {
          throw new Error("极略·完杀公开提示与当前回合不一致。");
        }
        canPass = true;
      } else if (pending.skillId === "jilue" && pending.stage === "jilue_zhiheng_finish") {
        throw new Error("极略·制衡牌移动续体不应投影为玩家提示。");
      } else if (pending.skillId === "qinyin" && pending.stage === "qinyin_choice") {
        if (pending.mode !== undefined || pending.eventId !== session.turn.qinyinEventId ||
            session.turn.qinyinInvoked === true || !session.turn.discardPhaseStarted) {
          throw new Error("琴音公开提示与弃牌阶段续体不一致。");
        }
        options = ["all_recover_one", "all_lose_one_hp"];
        canPass = true;
      } else if (pending.skillId === "lianpo" && pending.stage === "lianpo_choice") {
        if (!pending.sourceId || session.currentPlayerId !== pending.sourceId ||
            session.turn.lianpoArmedOwnerIds?.[0] !== viewer.id) {
          throw new Error("连破公开提示与回合结束续体不一致。");
        }
        options = ["take_extra_turn"];
        canPass = true;
      } else if (pending.skillId === "wumou" && pending.stage === "wumou_choice") {
        if (!pending.wumouContinuation || pending.eventId >= session.nextEventId ||
            pending.promptId !== standardPromptId(pending.eventId, "wumou", viewer.id, "choice")) {
          throw new Error("无谋公开提示缺少已承诺锦囊续体。");
        }
        assertWumouContinuation(session, viewer.id, pending.wumouContinuation, pending.eventId);
        options = rageMarkCount(session, viewer.id) > 0
          ? ["remove_rage", "lose_hp"]
          : ["lose_hp"];
        canPass = false;
      } else if (pending.skillId === "shenfen" && pending.stage === "shenfen_discard_hand") {
        const continuation = pending.shenfenContinuation;
        const frozenHandCardIds = pending.handCardIds ?? [];
        if (!continuation || continuation.stage !== "hand" ||
            continuation.targetIds[continuation.nextTargetIndex] !== viewer.id ||
            pending.eventId !== continuation.eventId || frozenHandCardIds.length <= 4 ||
            frozenHandCardIds.length !== viewer.hand.length || new Set(frozenHandCardIds).size !== frozenHandCardIds.length ||
            viewer.hand.some((card) => !frozenHandCardIds.includes(card.id))) {
          throw new Error("神愤公开弃牌提示与冻结游标不一致。");
        }
        assertShenfenContinuation(session, continuation);
        cards = viewer.hand.map(cloneCard);
        allowedCardIds = [...frozenHandCardIds];
        minCards = 4;
        maxCards = 4;
        canPass = false;
      } else if (pending.skillId === "shenfen" && pending.stage === "shenfen_continue") {
        throw new Error("神愤牌移动续体不应投影为玩家提示。");
      } else if (pending.skillId === "yeyan" && pending.stage === "yeyan_after_cost") {
        throw new Error("大业炎牌移动续体不应投影为玩家提示。");
      } else if (pending.skillId === "wuhun" && pending.stage === "wuhun_target") {
        const frame = topDeathFrame(session.completeRules.death);
        if (viewer.alive || !frame || frame.death.victimId !== viewer.id || frame.stage !== "death_triggers" ||
            pending.deathResolution?.frameId !== frame.frameId || pending.deathResolution.wuhunResolved === true) {
          throw new Error("武魂死亡选人提示与 DeathStack 不一致。");
        }
        const marked = wuhunMarkedPlayers(session, viewer.id);
        const plan = planWuhunDeath({
          ownerId: viewer.id,
          deathConfirmed: true,
          gameAlreadyFinished: false,
          otherPlayers: marked,
          chosenTargetId: pending.targetIds?.[0] ?? null,
        });
        if (!plan.ok || !pending.targetIds || plan.value.eligibleTargetIds.length !== pending.targetIds.length ||
            plan.value.eligibleTargetIds.some((playerId, index) => pending.targetIds![index] !== playerId)) {
          throw new Error("武魂死亡选人提示的最大梦魇目标已被篡改。");
        }
        targetIds = [...pending.targetIds];
        minTargets = 1;
        maxTargets = 1;
        canPass = false;
      } else if (pending.skillId === "shelie" && pending.stage === "shelie_select") {
        const pile = viewer.extraPiles[`shelie:${pending.eventId}`] ?? [];
        const frozenIds = pending.selectedCardIds ?? [];
        if (pile.length !== 5 || frozenIds.length !== 5 ||
            pile.some((card) => !frozenIds.includes(card.id))) {
          throw new Error("涉猎展示牌提示与权威续体不一致。");
        }
        cards = pile.map(cloneCard);
        allowedCardIds = pile.map((card) => card.id);
        minCards = new Set(pile.map((card) => card.suit)).size;
        maxCards = minCards;
        canPass = false;
      } else if (pending.skillId === "gongxin" && pending.stage === "gongxin_choose" && pending.sourceId) {
        const target = getLivingPlayer(session, pending.sourceId);
        const frozenIds = pending.selectedCardIds ?? [];
        if (target.hand.length !== frozenIds.length || new Set(frozenIds).size !== frozenIds.length ||
            target.hand.some((card) => !frozenIds.includes(card.id))) {
          throw new Error("攻心私密手牌提示与权威续体不一致。");
        }
        cards = target.hand.map(cloneCard);
        allowedCardIds = target.hand
          .filter((card) => effectiveCardSuit(session, target, card) === "heart")
          .map((card) => card.id);
        minCards = 0;
        maxCards = allowedCardIds.length > 0 ? 1 : 0;
        options = ["discard", "put_on_draw_pile_top"];
        canPass = true;
      } else if (pending.skillId === "tiaoxin" && pending.stage === "tiaoxin_response" && pending.sourceId) {
        const owner = getLivingPlayer(session, pending.sourceId);
        const prompt = liveTiaoxinPrompt(session, owner, viewer);
        if (!prompt.ok) throw new Error(`挑衅提示已经不再合法：${prompt.detail}`);
        const physicalSlashIds = viewer.hand.filter((card) => isSlashCardKind(card.kind)).map((card) => card.id);
        const wushengIds = hasEffectiveSkill(session, viewer, "wusheng")
          ? ownedCards(viewer).filter((card) => isRedCard(session, viewer, card)).map((card) => card.id)
          : [];
        const longdanIds = hasEffectiveSkill(session, viewer, "longdan")
          ? viewer.hand.filter((card) => card.kind === "dodge").map((card) => card.id)
          : [];
        const zhangBaIds = viewer.equipment.weapon?.kind === "zhang_ba_she_mao" && viewer.hand.length >= 2
          ? viewer.hand.map((card) => card.id)
          : [];
        allowedCardIds = [...new Set([...physicalSlashIds, ...wushengIds, ...longdanIds, ...zhangBaIds])];
        cards = Object.values(viewer.equipment).filter((card) => allowedCardIds.includes(card.id)).map(cloneCard);
        maxCards = zhangBaIds.length >= 2 ? 2 : allowedCardIds.length > 0 ? 1 : 0;
        options = [
          ...tiaoxinSlashOptions(session, viewer).filter((option) => option !== "jijiang" || !pending.processedPlayerIds?.includes(viewer.id)),
          "decline",
        ];
      } else if (pending.skillId === "tiaoxin" && pending.stage === "tiaoxin_discard" && pending.sourceId) {
        const victim = getLivingPlayer(session, pending.sourceId);
        choices = [
          ...victim.hand.map((_card, index) => ({ token: `hand:${index}`, ownerId: victim.id, zone: "hand" as const, card: null })),
          ...Object.entries(victim.equipment).map(([slot, card]) => ({
            token: `equipment:${slot}`,
            ownerId: victim.id,
            zone: "equipment" as const,
            card: cloneCard(card),
          })),
          ...victim.judgment.map((card, index) => ({
            token: `judgment:${index}`,
            ownerId: victim.id,
            zone: "judgment" as const,
            card: cloneCard(card),
          })),
        ];
        minCards = 1;
        maxCards = 1;
        canPass = false;
      } else if (pending.skillId === "xiangle" && pending.stage === "xiangle_payment") {
        allowedCardIds = viewer.hand.filter((card) => card.category === "basic").map((card) => card.id);
        minCards = allowedCardIds.length > 0 ? 1 : 0;
        maxCards = allowedCardIds.length > 0 ? 1 : 0;
      } else if (pending.skillId === "yingyang" && pending.stage === "yingyang_modify") {
        options = ["plus_three", "minus_three", "decline"];
      } else if (pending.skillId === "zhijian" && pending.stage === "zhijian_finish") {
        throw new Error("直谏牌移动续体不应投影为玩家提示。");
      } else if (pending.skillId === "tuntian" && pending.stage === "tuntian_invoke") {
        canPass = true;
      } else if (pending.skillId === "zhiji" && pending.stage === "zhiji_choice") {
        options = ["recover_one", "draw_two"];
        canPass = false;
      } else if (pending.skillId === "fangquan" && pending.stage === "fangquan_skip") {
        canPass = true;
      } else if (pending.skillId === "fangquan" && pending.stage === "fangquan_finish") {
        const candidates = new Set(pending.selectedCardIds ?? []);
        allowedCardIds = viewer.hand.filter((card) => candidates.has(card.id)).map((card) => card.id);
        targetIds = (pending.targetIds ?? []).filter((playerId) => getPlayer(session, playerId).alive);
        minCards = 1;
        maxCards = 1;
        minTargets = 1;
        maxTargets = 1;
        canPass = true;
      } else if (pending.skillId === "fangquan" && pending.stage === "fangquan_complete") {
        throw new Error("放权牌移动续体不应投影为玩家提示。");
      } else if (pending.skillId === "qiaobian" && pending.stage === "qiaobian_skip") {
        allowedCardIds = viewer.hand.map((card) => card.id);
        minCards = 1;
        maxCards = 1;
        canPass = true;
      } else if (pending.skillId === "qiaobian" && pending.stage === "qiaobian_draw") {
        const frozenTargets = new Set(pending.targetIds ?? []);
        choices = livingOpponentsInSeatOrder(session, viewer.id)
          .filter((target) => frozenTargets.has(target.id))
          .flatMap((target) => target.hand.map((_card, index) => ({
            token: `hand:${target.seat}:${index}`,
            ownerId: target.id,
            zone: "hand" as const,
            card: null,
          })));
        minCards = 0;
        maxCards = Math.min(2, frozenTargets.size);
        canPass = true;
      } else if (pending.skillId === "qiaobian" && pending.stage === "qiaobian_play") {
        const candidates = qiaobianTableCards(session, viewer);
        const frozenCards = new Set(pending.selectedCardIds ?? []);
        const projected = candidates.filter((candidate) => frozenCards.has(candidate.card.id));
        cards = projected.map((candidate) => cloneCard(candidate.card));
        allowedCardIds = projected.map((candidate) => candidate.card.id);
        cardTargetIds = Object.fromEntries(projected.map((candidate) => [candidate.card.id, [...candidate.targetIds]]));
        targetIds = [...new Set(projected.flatMap((candidate) => candidate.targetIds))];
        minCards = 1;
        maxCards = 1;
        minTargets = 1;
        maxTargets = 1;
        canPass = true;
      } else if (pending.skillId === "qiaobian" &&
          (pending.stage === "qiaobian_after_cost" || pending.stage === "qiaobian_finish")) {
        throw new Error("巧变牌移动续体不应投影为玩家提示。");
      } else if (pending.skillId === "guzheng" && pending.stage === "guzheng_claim") {
        const candidates = new Set(pending.selectedCardIds ?? []);
        cards = session.discardPile.filter((card) => candidates.has(card.id)).map(cloneCard);
        allowedCardIds = cards.map((card) => card.id);
        minCards = 1;
        maxCards = 1;
        canPass = true;
      } else if (pending.skillId === "beige" && pending.stage === "beige_cost") {
        allowedCardIds = ownedCards(viewer).map((card) => card.id);
        cards = Object.values(viewer.equipment).map(cloneCard);
        minCards = 1;
        maxCards = 1;
      } else if (pending.skillId === "beige" && pending.stage === "beige_source_discard") {
        const candidates = new Set(pending.selectedCardIds ?? []);
        allowedCardIds = ownedCards(viewer).filter((card) => candidates.has(card.id)).map((card) => card.id);
        cards = Object.values(viewer.equipment).filter((card) => candidates.has(card.id)).map(cloneCard);
        minCards = Math.min(2, allowedCardIds.length);
        maxCards = minCards;
        canPass = false;
      } else if (pending.skillId === "huashen" && (pending.stage === "huashen_initial" ||
          pending.stage === "huashen_turn_start" || pending.stage === "huashen_turn_end")) {
        options = huashenChoiceOptions(session, viewer);
        canPass = pending.stage !== "huashen_initial";
      } else if (pending.skillId === "xinsheng" && pending.stage === "xinsheng_invoke") {
        canPass = true;
      } else if (pending.skillId === "benghuai" && pending.stage === "benghuai_choice") {
        options = ["lose_hp", "lose_max_hp"];
        canPass = false;
      } else if (pending.skillId === "luanwu" && pending.stage === "luanwu_slash") {
        const plan = liveLuanwuActorPlan(session, viewer);
        if (!plan.ok || !plan.value.options.includes("use_slash")) throw new Error("乱武用杀提示已经不再合法。");
        targetIds = [...plan.value.legalSlashTargetIds];
        const physicalSlashIds = viewer.hand.filter((card) => isSlashCardKind(card.kind)).map((card) => card.id);
        const wushengIds = hasEffectiveSkill(session, viewer, "wusheng")
          ? ownedCards(viewer).filter((card) => isRedCard(session, viewer, card)).map((card) => card.id)
          : [];
        const longdanIds = hasEffectiveSkill(session, viewer, "longdan")
          ? viewer.hand.filter((card) => card.kind === "dodge").map((card) => card.id)
          : [];
        const zhangBaIds = viewer.equipment.weapon?.kind === "zhang_ba_she_mao" && viewer.hand.length >= 2
          ? viewer.hand.map((card) => card.id)
          : [];
        allowedCardIds = [...new Set([...physicalSlashIds, ...wushengIds, ...longdanIds, ...zhangBaIds])];
        cards = Object.values(viewer.equipment).filter((card) => allowedCardIds.includes(card.id)).map(cloneCard);
        minCards = 1;
        maxCards = zhangBaIds.length >= 2 ? 2 : 1;
        minTargets = 1;
        maxTargets = 1;
        canPass = true;
        options = [
          ...(physicalSlashIds.length > 0 ? ["physical_slash"] : []),
          ...(wushengIds.length > 0 ? ["wusheng"] : []),
          ...(longdanIds.length > 0 ? ["longdan"] : []),
          ...(zhangBaIds.length >= 2 ? ["zhang_ba_she_mao"] : []),
          "lose_hp",
        ];
      } else if (pending.skillId === "yinghun" && pending.stage === "yinghun_select") {
        targetIds = session.players.filter((player) => player.alive && player.id !== viewer.id).map((player) => player.id);
        minTargets = 1;
        maxTargets = 1;
        options = ["draw_x_discard_one", "draw_one_discard_x"];
      } else if (pending.skillId === "yinghun" && pending.stage === "yinghun_discard") {
        allowedCardIds = ownedCards(viewer).map((card) => card.id);
        cards = Object.values(viewer.equipment).map(cloneCard);
        const required = Math.min(pending.requestedCount ?? 0, allowedCardIds.length);
        minCards = required;
        maxCards = required;
        canPass = false;
      } else if (pending.skillId === "yinghun" && pending.stage === "yinghun_finish") {
        throw new Error("英魂牌移动续体不应投影为玩家提示。");
      } else if (pending.skillId === "haoshi" && pending.stage === "haoshi_transfer") {
        const analysis = analyzeHaoshiTransfer({
          ownerId: viewer.id,
          ownerHandCardIds: viewer.hand.map((card) => card.id),
          otherPlayers: session.players
            .filter((player) => player.id !== viewer.id)
            .map((player) => ({ id: player.id, alive: player.alive, handCount: player.hand.length })),
        });
        if (!analysis.ok || !analysis.value.transferRequired) throw new Error("好施交牌提示已经不再合法。");
        allowedCardIds = viewer.hand.map((card) => card.id);
        targetIds = [...analysis.value.eligibleTargetIds];
        minCards = analysis.value.giveCount;
        maxCards = analysis.value.giveCount;
        minTargets = 1;
        maxTargets = 1;
        canPass = false;
      } else if (pending.skillId === "dimeng" && pending.stage === "dimeng_swap") {
        throw new Error("缔盟换手续体不应投影为玩家提示。");
      } else if (pending.skillId === "zaiqi" && pending.stage === "zaiqi_finish") {
        throw new Error("再起展示牌续体不应投影为玩家提示。");
      } else if (pending.skillId === "leiji" && pending.stage === "leiji_target") {
        targetIds = session.players.filter((player) => player.alive).map((player) => player.id);
        minTargets = 1;
        maxTargets = 1;
      } else if (pending.skillId === "jieming" && pending.stage === "jieming_target") {
        targetIds = session.players.filter((player) => player.alive).map((player) => player.id);
        minTargets = 1;
        maxTargets = 1;
      } else if (pending.skillId === "mengjin" && pending.stage === "mengjin_finish") {
        throw new Error("猛进牌移动续体不应投影为玩家提示。 ");
      } else if (pending.skillId === "mengjin" && pending.stage === "mengjin_discard" && pending.slash) {
        const target = getLivingPlayer(session, pending.slash.targetId);
        const decision = evaluateLiveMengjin(session, pending.slash);
        if (!decision.ok) throw new Error("猛进提示已经不再合法。 ");
        const candidates = new Set(decision.value.candidateCardIds);
        choices = [
          ...target.hand.flatMap((card, index) => candidates.has(card.id)
            ? [{ token: `hand:${index}`, ownerId: target.id, zone: "hand" as const, card: null }]
            : []),
          ...Object.entries(target.equipment).flatMap(([slot, card]) => candidates.has(card.id)
            ? [{ token: `equipment:${slot}`, ownerId: target.id, zone: "equipment" as const, card: cloneCard(card) }]
            : []),
        ];
        minCards = 1;
        maxCards = 1;
      } else if (pending.stage === "leiji_judgment_retrial" && pending.judgment) {
        const retrial = currentJudgmentRetrialOpportunity(pending.judgment);
        if (!retrial || retrial.ownerId !== viewer.id || retrial.skillId !== pending.skillId) {
          throw new Error("雷击改判提示与 JudgmentFrame 游标不一致。");
        }
        allowedCardIds = judgmentRetrialCardIds(session, viewer, retrial.skillId);
        cards = retrial.skillId === "guidao"
          ? ownedCards(viewer).filter((card) => allowedCardIds.includes(card.id)).map(cloneCard)
          : [];
        minCards = 1;
        maxCards = 1;
      } else if (pending.skillId === "jushou" && pending.stage === "jushou_finish") {
        throw new Error("据守结束续体不应投影为玩家提示。 ");
      } else if (pending.skillId === "jushou" && pending.stage === "jushou_dispose") {
        allowedCardIds = viewer.hand.filter((card) => {
          const decision = evaluateLiveJushouDisposal(viewer, card);
          if (!decision.ok) throw new Error(decision.detail);
          return decision.value.eligible;
        }).map((card) => card.id);
        minCards = 1;
        maxCards = 1;
        canPass = false;
      } else if (pending.skillId === "shensu" && (pending.stage === "shensu_judgment_draw" || pending.stage === "shensu_play")) {
        const stage = pending.stage === "shensu_judgment_draw" ? "judgment_and_draw" : "play";
        targetIds = shensuTargetIds(session, viewer, stage);
        minTargets = 1;
        maxTargets = 1;
        if (stage === "play") {
          allowedCardIds = ownedCards(viewer).filter((card) => card.category === "equipment").map((card) => card.id);
          minCards = 1;
          maxCards = 1;
        }
      } else if (pending.skillId === "guanxing" && pending.stage === "guanxing_reorder") {
        cards = (pending.selectedCardIds ?? []).map((cardId) => {
          const card = session.deck.find((candidate) => candidate.id === cardId);
          if (!card) throw new Error("观星观看牌已不在牌堆顶。");
          return cloneCard(card);
        });
        allowedCardIds = pending.selectedCardIds ? [...pending.selectedCardIds] : [];
        maxCards = allowedCardIds.length;
      } else if (pending.skillId === "tuxi") {
        const targets = livingOpponentsInSeatOrder(session, viewer.id).filter((target) => target.hand.length > 0);
        targetIds = targets.map((target) => target.id);
        minTargets = 1;
        maxTargets = Math.min(2, targetIds.length);
        choices = targets.flatMap((target) => target.hand.map((_card, index) => ({
          token: `hand:${index}`,
          ownerId: target.id,
          zone: "hand" as const,
          card: null,
        })));
      } else if (pending.skillId === "buqu" && pending.stage === "buqu_recovery") {
        const selectedIds = new Set(pending.selectedCardIds ?? []);
        cards = (viewer.extraPiles.buqu ?? [])
          .filter((card) => selectedIds.has(card.id))
          .map(cloneCard);
        allowedCardIds = cards.map((card) => card.id);
        minCards = 1;
        maxCards = 1;
        canPass = false;
      } else if (pending.skillId === "tianxiang" && pending.stage === "tianxiang_redirect") {
        const frame = session.completeRules.damageFlow.frames.at(-1);
        if (!frame || frame.frameId !== pending.damageOpportunity?.frameId || frame.damage.targetId !== viewer.id) {
          throw new Error("天香提示缺少当前 DamageFlow 转移帧。");
        }
        allowedCardIds = tianxiangCostCardIds(session, frame, viewer);
        targetIds = tianxiangTargetIds(session, frame, viewer);
        minCards = 1;
        maxCards = 1;
        minTargets = 1;
        maxTargets = 1;
      } else if ((pending.skillId === "fangzhu" && pending.stage === "fangzhu_target") ||
          (pending.skillId === "jilue" && pending.stage === "jilue_fangzhu")) {
        targetIds = session.players.filter((player) => player.alive && player.id !== viewer.id).map((player) => player.id);
        minTargets = 1;
        maxTargets = 1;
      } else if (pending.skillId === "lieren" && pending.stage === "lieren_gain" && pending.sourceId) {
        const target = getLivingPlayer(session, pending.sourceId);
        choices = [
          ...target.hand.map((_card, index) => ({ token: `hand:${index}`, ownerId: target.id, zone: "hand" as const, card: null })),
          ...Object.entries(target.equipment).map(([slot, card]) => ({
            token: `equipment:${slot}`,
            ownerId: target.id,
            zone: "equipment" as const,
            card: cloneCard(card),
          })),
        ];
        minCards = 1;
        maxCards = 1;
      } else if (pending.skillId === "yiji" && pending.stage === "yiji_distribute") {
        cards = Object.values(viewer.extraPiles).flat().filter((card) => pending.selectedCardIds?.includes(card.id)).map(cloneCard);
        allowedCardIds = cards.map((card) => card.id);
        targetIds = session.players.filter((player) => player.alive).map((player) => player.id);
        minCards = cards.length;
        maxCards = cards.length;
        minTargets = 1;
        maxTargets = cards.length;
        canPass = false;
      } else if (pending.skillId === "fankui" && pending.stage === "fankui_select") {
        const sourceId = pending.aftermath?.sourceId ?? (pending.damageOpportunity
          ? session.completeRules.damageFlow.frames.at(-1)?.damage.sourceId
          : null);
        if (!sourceId) throw new Error("反馈提示缺少伤害来源。");
        const source = getPlayer(session, sourceId);
        choices = [
          ...source.hand.map((_card, index) => ({ token: `hand:${index}`, ownerId: source.id, zone: "hand" as const, card: null })),
          ...Object.entries(source.equipment).map(([slot, card]) => ({
            token: `equipment:${slot}`,
            ownerId: source.id,
            zone: "equipment" as const,
            card: cloneCard(card),
          })),
        ];
        minCards = 1;
        maxCards = 1;
        canPass = false;
      } else if (pending.skillId === "ganglie" && pending.stage === "ganglie_punish") {
        allowedCardIds = viewer.hand.map((card) => card.id);
        minCards = allowedCardIds.length >= 2 ? 2 : 0;
        maxCards = allowedCardIds.length >= 2 ? 2 : 0;
        canPass = true;
      } else if (pending.skillId === "liuli" && pending.stage === "liuli_redirect" && pending.slash) {
        cardTargetIds = liuliCardTargetIds(session, pending.slash, viewer);
        allowedCardIds = Object.entries(cardTargetIds).filter(([, ids]) => ids.length > 0).map(([id]) => id);
        targetIds = [...new Set(Object.values(cardTargetIds).flat())];
        minCards = 1;
        maxCards = 1;
        minTargets = 1;
        maxTargets = 1;
      }
      return {
        type: "standard_skill",
        playerId: viewer.id,
        skillId: pending.skillId,
        stage: pending.stage,
        promptId: pending.promptId,
        canPass,
        cards,
        allowedCardIds,
        targetIds,
        minCards,
        maxCards,
        minTargets,
        maxTargets,
        ...(options ? { options } : {}),
        ...(choices ? { choices } : {}),
        ...(cardTargetIds ? { cardTargetIds } : {}),
      };
    }
    if (pending.type === "lord_dispatch") {
      const allowedCardIds = viewer.hand
        .filter((card) => {
          const wushenSlash = isWushenLockedHeartHandCard(session, viewer, card);
          return pending.responseKind === "dodge"
            ? card.kind === "dodge" && !wushenSlash
            : isSlashCardKind(card.kind) && (!wushenSlash || card.kind === "slash") || wushenSlash;
        })
        .map((card) => card.id);
      return {
        type: "lord_dispatch",
        playerId: viewer.id,
        requesterId: pending.requesterId,
        skillId: pending.skillId,
        responseKind: pending.responseKind,
        method: pending.method,
        promptId: pending.promptId,
        allowedCardIds,
        canPass: true,
      };
    }
    if (pending.type === "weapon_action") {
      const victim = getPlayer(session, pending.victimId);
      const ownEquipmentIds = Object.values(viewer.equipment).map((card) => card.id);
      const allowedCardIds = pending.stage === "guanshi_force_hit"
        ? [...viewer.hand.map((card) => card.id), ...ownEquipmentIds]
        : pending.stage === "qinglong_followup"
          ? viewer.hand.filter((card) =>
            isSlashCardKind(card.kind) || isWushenLockedHeartHandCard(session, viewer, card)
          ).map((card) => card.id)
          : pending.stage === "cixiong_choice"
            ? viewer.hand.map((card) => card.id)
            : [];
      const choices = pending.stage === "hanbing_select"
        ? [
            ...victim.hand.map((_card, index) => ({ token: `hand:${index}`, zone: "hand" as const, card: null })),
            ...Object.entries(victim.equipment).map(([slot, card]) => ({ token: `equipment:${slot}`, zone: "equipment" as const, card: cloneCard(card) })),
          ]
        : pending.stage === "qilin_discard_horse"
          ? (["offensive_horse", "defensive_horse"] as const)
              .flatMap((slot) => victim.equipment[slot]
                ? [{ token: `equipment:${slot}`, zone: "equipment" as const, card: cloneCard(victim.equipment[slot]!) }]
                : [])
          : undefined;
      const minCards = pending.stage === "guanshi_force_hit" ? 2
        : pending.stage === "qinglong_followup" || pending.stage === "cixiong_choice" ? 1 : 0;
      const maxCards = pending.stage === "guanshi_force_hit" ? 2
        : pending.stage === "qinglong_followup" || pending.stage === "cixiong_choice" || pending.stage === "hanbing_select" || pending.stage === "qilin_discard_horse" ? 1 : 0;
      return {
        type: "weapon_action",
        playerId: viewer.id,
        weaponKind: pending.weaponKind,
        stage: pending.stage,
        victimId: pending.victimId,
        ...(pending.damageOpportunity ? { promptId: `damage:${pending.damageOpportunity.promptId}` } : {}),
        allowedCardIds,
        minCards,
        maxCards,
        canPass: pending.stage !== "hanbing_select" || (pending.remainingSelections ?? 2) < 2,
        choices,
      };
    }
    if (pending.type === "zone_selection") {
      const victim = getLivingPlayer(session, pending.victimId);
      return {
        type: "zone_selection",
        playerId: viewer.id,
        victimId: victim.id,
        mode: pending.mode,
        choices: zoneSelectionChoices(victim),
      };
    }
    if (pending.type === "fire_attack_reveal") {
      return {
        type: "fire_attack_reveal",
        playerId: viewer.id,
        sourceId: pending.attackerId,
        allowedCardIds: viewer.hand.map((card) => card.id),
      };
    }
    if (pending.type === "fire_attack_discard") {
      const victim = getLivingPlayer(session, pending.victimId);
      const revealedCard = victim.hand.find((card) => card.id === pending.revealedCardId);
      if (!revealedCard) throw new Error("火攻展示牌已不在目标手中。");
      return {
        type: "fire_attack_discard",
        playerId: viewer.id,
        victimId: victim.id,
        revealedCard: cloneCard(revealedCard),
        allowedCardIds: viewer.hand
          .filter((card) => effectiveCardSuit(session, viewer, card) === effectiveCardSuit(session, victim, revealedCard))
          .map((card) => card.id),
        canPass: true,
      };
    }
    if (pending.type === "amazing_grace_selection") {
      return {
        type: "amazing_grace_selection",
        playerId: viewer.id,
        cards: pending.pool.map(cloneCard),
      };
    }
    if (pending.type === "nullification") {
      return {
        type: "nullification",
        playerId: viewer.id,
        sourceId: pending.attackerId,
        effectTargetId: pending.effectTargetId,
        cardKind: pending.cardKind,
        allowedCardIds: viewer.hand
          .filter((card) => card.kind === "wu_xie_ke_ji" && !isWushenLockedHeartHandCard(session, viewer, card))
          .map((card) => card.id),
        kanpoCardIds: kanpoCardIds(session, viewer),
        longhunCardGroups: longhunCardGroups(session, viewer, "spade"),
        canPass: true,
      };
    }
    const armorSource =
      (pending.type === "slash" || (pending.type === "mass_attack" && pending.responseKind === "dodge"))
        ? baguaResponseSource(session, viewer, pending)
        : null;
    if (
      (pending.type === "slash" || (pending.type === "mass_attack" && pending.responseKind === "dodge")) &&
      !pending.armorAttempted &&
      armorSource !== null
    ) {
      return {
        type: "armor",
        playerId: viewer.id,
        armorKind: "ba_gua_zhen",
        sourceSkillId: armorSource === "bazhen" ? "bazhen" : null,
        requiredCount: pending.type === "slash" ? pending.requiredDodgeCount ?? 1 : 1,
        respondedCount: pending.type === "slash" ? pending.dodgesPlayed ?? 0 : 0,
        canPass: true,
      };
    }
    if (pending.type === "dying") {
      const peachCardIds = peachAllowedByWansha(session, viewer.id, pending.victimId)
        ? viewer.hand
          .filter((card) => card.kind === "peach" && !isWushenLockedHeartHandCard(session, viewer, card))
          .map((card) => card.id)
        : [];
      const wineCardIds = viewer.id === pending.victimId
        ? viewer.hand
          .filter((card) => card.kind === "wine" && !isWushenLockedHeartHandCard(session, viewer, card))
          .map((card) => card.id)
        : [];
      return {
        type: "dying",
        playerId: viewer.id,
        victimId: pending.victimId,
        allowedCardIds: [...peachCardIds, ...wineCardIds],
        peachCardIds,
        wineCardIds,
        skillResponses: dyingSkillHints(session, viewer, pending.victimId),
        canPass: true,
      };
    }
    const required = responseKind(pending);
    const dodgeCardIds =
      required === "dodge"
        ? viewer.hand
          .filter((card) => card.kind === "dodge" && !isWushenLockedHeartHandCard(session, viewer, card))
          .map((card) => card.id)
        : [];
    const slashCardIds =
      required === "slash"
        ? viewer.hand.filter((card) => {
          const wushenReplaced = isWushenLockedHeartHandCard(session, viewer, card);
          return isSlashCardKind(card.kind) && (!wushenReplaced || card.kind === "slash");
        }).map((card) => card.id)
        : [];
    const zhangBaCardIds = required === "slash" && viewer.equipment.weapon?.kind === "zhang_ba_she_mao" && viewer.hand.length >= 2
      ? viewer.hand.map((card) => card.id)
      : [];
    const requiredCount = pending.type === "slash"
      ? pending.requiredDodgeCount ?? 1
      : pending.type === "duel"
        ? pending.requiredSlashCount ?? 1
        : 1;
    const respondedCount = pending.type === "slash"
      ? pending.dodgesPlayed ?? 0
      : pending.type === "duel"
        ? pending.slashesPlayed ?? 0
        : 0;
    return {
      type: "respond",
      playerId: viewer.id,
      attackerId: pending.attackerId,
      targetId: pending.targetId,
      context: responseContext(pending),
      responseKind: required,
      allowedCardIds: required === "dodge" ? [...dodgeCardIds] : [...new Set([...slashCardIds, ...zhangBaCardIds])],
      dodgeCardIds,
      slashCardIds,
      zhangBaCardIds,
      skillResponses: responseSkillHints(session, viewer, required),
      lordSkills: availableLordSkillsForResponse(session, viewer, pending),
      requiredCount,
      respondedCount,
      canPass: true,
    };
  }

  if (session.turn.phase === "discard" && session.currentPlayerId === viewer.id) {
    return {
      type: "discard",
      playerId: viewer.id,
      count: session.turn.requiredDiscardCount,
      cardIds: viewer.hand.map((card) => card.id),
    };
  }
  return { type: "waiting" };
}

function publicCardsFor(session: GameSession): Card[] {
  const pending = session.pendingResponse?.type === "skill_choice" &&
    session.pendingResponse.resume.type === "after_move"
    ? session.afterMove.suspendedResponse
    : session.pendingResponse;
  if (pending?.type === "amazing_grace_selection") return pending.pool.map(cloneCard);
  if (pending?.type === "nullification" && pending.effect.type === "amazing_grace") {
    return pending.effect.pool.map(cloneCard);
  }
  if (pending?.type === "fire_attack_discard") {
    const victim = getPlayer(session, pending.victimId);
    const revealed = victim.hand.find((card) => card.id === pending.revealedCardId);
    return revealed ? [cloneCard(revealed)] : [];
  }
  if (pending?.type === "standard_skill" && pending.skillId === "shelie" &&
      pending.stage === "shelie_select") {
    const owner = getPlayer(session, pending.targetId);
    const frozenIds = new Set(pending.selectedCardIds ?? []);
    return (owner.extraPiles[`shelie:${pending.eventId}`] ?? [])
      .filter((card) => frozenIds.has(card.id))
      .map(cloneCard);
  }
  if (pending?.type === "pindian" || pending?.type === "qiangxi_effect") return [];
  if (pending?.type === "standard_judgment" && pending.frame.cardId) {
    const card = session.resolvingCards.find((candidate) => candidate.id === pending.frame.cardId);
    return card ? [cloneCard(card)] : [];
  }
  const guhuo = pending?.type === "guhuo" && pending.stage === "consequence"
    ? pending
    : pending?.type === "dying" && pending.resume.type === "guhuo"
      ? pending.resume.pending
      : pending?.type === "skill_choice" && pending.resume.type === "dying" && pending.resume.resume.type === "guhuo"
        ? pending.resume.resume.pending
        : null;
  if (guhuo && guhuo.outcome !== "unchallenged") {
    const card = session.resolvingCards.find((candidate) => candidate.id === guhuo.physicalCardId);
    return card ? [cloneCard(card)] : [];
  }
  return [];
}

export function getGameView(session: GameSession, viewerId: PlayerId | null): GameView {
  return {
    version: 1,
    revision: session.revision,
    actionPromptId: `game:${session.revision}`,
    status: session.status,
    players: session.players.map((player) => ({
      id: player.id,
      seat: player.seat,
      alive: player.alive,
      faceUp: player.faceUp ?? true,
      hp: player.hp,
      maxHp: player.maxHp,
      handCount: player.hand.length,
      hand: player.id === viewerId ? player.hand.map(cloneCard) : null,
      equipment: Object.values(player.equipment).map(cloneCard),
      judgment: (player.judgment ?? []).map(cloneCard),
      publicPiles: {
        buqu: (player.extraPiles.buqu ?? []).map(cloneCard),
        field: (player.extraPiles.field ?? []).map(cloneCard),
      },
      publicPileCounts: {
        stars: (player.extraPiles[QIXING_PILE_ID] ?? []).length,
      },
      privatePiles: Object.fromEntries(player.id === viewerId
        ? [[QIXING_PILE_ID, (player.extraPiles[QIXING_PILE_ID] ?? []).map(cloneCard)]]
        : []),
      publicMarks: Object.fromEntries(
        session.completeRules.lifecycle.marks
          .filter((mark) => mark.ownerId === player.id && mark.visibility === "public")
          .reduce((entries, mark) => {
            const key = mark.markId === "nightmare" && mark.sourcePlayerId !== null
              ? `nightmare:${mark.sourcePlayerId}`
              : mark.markId;
            entries.set(key, (entries.get(key) ?? 0) + mark.value);
            return entries;
          }, new Map<string, number>()),
      ),
      publicEffects: session.completeRules.lifecycle.effects
        .filter((effect) => effect.ownerId === player.id && qixingWeatherSkillId(effect) !== null)
        .sort((left, right) => left.effectId - right.effectId)
        .map((effect) => {
          const kind = assertQixingWeatherEffect(session, effect);
          return {
            effectId: effect.effectId,
            kind,
            targetPlayerId: effect.ownerId,
            sourcePlayerId: effect.sourcePlayerId!,
          };
        }),
      chained: player.chained ?? false,
      role:
        player.id === viewerId ||
        player.role === "lord" ||
        !player.alive ||
        session.status === "finished"
          ? player.role
          : null,
      general: player.generalId ? (() => {
        const selected = effectiveHuashenState(session, player);
        const general = getGeneralDefinition((selected?.form.generalId ?? player.generalId) as GeneralId);
        return {
          id: general.id,
          name: general.name,
          faction: factionOf(session, player) ?? general.faction,
          gender: genderOf(session, player) ?? general.gender,
        };
      })() : null,
      effectiveSkillIds: getEffectiveGeneralSkillIds(session, player.id),
      effectiveSkills: getEffectiveGeneralSkillIds(session, player.id).map((id) => {
        const definition = getSkillRuleTextDefinition(id);
        return { id, name: definition.name, description: definition.text };
      }),
    })),
    deckCount: session.deck.length,
    discardPile: session.discardPile.map(cloneCard),
    publicCards: publicCardsFor(session),
    currentPlayerId: session.currentPlayerId,
    turn: cloneTurn(session.turn),
    // Nullification eligibility is derived from private hands. Do not expose
    // the current/remaining eligible responder identities to other clients.
    pendingResponse: session.pendingResponse?.type === "dying" ||
      session.pendingResponse?.type === "nullification" ||
      session.pendingResponse?.type === "guhuo" ||
      session.pendingResponse?.type === "pindian" ||
      session.pendingResponse?.type === "qiangxi_effect" ||
      session.pendingResponse?.type === "skill_choice" ||
      session.pendingResponse?.type === "lord_dispatch" ||
      session.pendingResponse?.type === "fanjian_suit" ||
      session.pendingResponse?.type === "standard_judgment" ||
      session.pendingResponse?.type === "standard_skill"
      ? null
      : clonePendingResponse(session.pendingResponse),
    winner: session.winner
      ? { ...session.winner, playerIds: [...session.winner.playerIds] }
      : null,
    logs: session.logs.map((log) => ({ ...log })),
    prompt: promptFor(session, viewerId),
  };
}

export const viewGame = getGameView;
