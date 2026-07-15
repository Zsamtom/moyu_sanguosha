import {
  createStandardDeck,
  damageNatureForSlash,
  getCardDefinition,
  isSlashCardKind,
} from "./cards.js";
import { DEFAULT_GENERALS, getGeneralDefinition, hasGeneralSkill } from "./generals.js";
import { FULL_GENERAL_CATALOG } from "./full-general-catalog.js";
import { effectiveSkillIds as lifecycleEffectiveSkillIds } from "./engine/lifecycle.js";
import { createDamageInstance, type LifePlayerState } from "./engine/damage.js";
import {
  applyDamageLifeFlow,
  closeDamageFlowWindow,
  finishDamageFlowFrame,
  openDamageFlowWindow,
  pushDamageFlowFrame,
  resumeDamageAfterDyingFlow,
  type DamageDyingBarrier,
  type DamageFlowCallerContinuation,
  type DamageFlowState,
  type DamageFlowWindowKind,
} from "./engine/damage-flow.js";
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
  type JudgmentFrame,
  type JudgmentPattern,
} from "./engine/judgment.js";
import { drawTopCards, reorderTopCards, type DeckServiceState } from "./engine/deck.js";
import type { AtomicZoneState } from "./engine/zones.js";
import {
  assertExactPartition,
  cloneStandardDamageAftermath,
  cloneStandardJudgmentContext,
  standardDamageSkillQueue,
  standardPromptId,
} from "./skills/standard-runtime.js";
import type {
  Card,
  CardId,
  CardKind,
  CardSuit,
  CardUseContinuation,
  CardUseIntent,
  CreateGameInput,
  DamageNature,
  EquipmentSlot,
  GameAction,
  GamePlayer,
  GamePrompt,
  GameRuleErrorCode,
  GameSession,
  GameView,
  GameWinner,
  GeneralSkillId,
  DyingResume,
  LordDispatchSkillId,
  LordDispatchableResponse,
  PendingLordDispatch,
  PendingDyingResponse,
  PendingMassAttackResponse,
  PendingNullificationResponse,
  PendingResponse,
  PendingStandardJudgment,
  PendingStandardSkill,
  PendingTrickEffect,
  PendingZoneSelection,
  PlayableCardHint,
  PlayableSkillHint,
  PlayerId,
  PublicLogType,
  ResponseContext,
  Role,
  RoleDistribution,
  SkillTriggerRef,
  SkillResponseHint,
  SlashResolutionContinuation,
  StandardDamageAftermath,
  StandardImplementedSkillId,
  StandardJudgmentContext,
  TurnState,
} from "./types.js";
import {
  normalizeChaCha20Key,
  randomInteger,
  type ChaCha20State,
} from "./prng.js";

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;
const INITIAL_HAND_SIZE = 4;
const TURN_DRAW_COUNT = 2;
const MAX_PUBLIC_LOGS = 500;

const ROLE_DISTRIBUTIONS: Readonly<Record<number, RoleDistribution>> = {
  2: { lord: 1, loyalist: 0, rebel: 1, renegade: 0 },
  3: { lord: 1, loyalist: 1, rebel: 1, renegade: 0 },
  4: { lord: 1, loyalist: 1, rebel: 2, renegade: 0 },
  5: { lord: 1, loyalist: 1, rebel: 2, renegade: 1 },
  6: { lord: 1, loyalist: 1, rebel: 3, renegade: 1 },
  7: { lord: 1, loyalist: 2, rebel: 3, renegade: 1 },
  8: { lord: 1, loyalist: 2, rebel: 4, renegade: 1 },
  9: { lord: 1, loyalist: 3, rebel: 4, renegade: 1 },
  10: { lord: 1, loyalist: 3, rebel: 5, renegade: 1 },
};

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
  const distribution = ROLE_DISTRIBUTIONS[playerCount];
  if (!distribution) {
    ruleError(
      "INVALID_PLAYER_COUNT",
      `玩家人数必须在 ${MIN_PLAYERS} 到 ${MAX_PLAYERS} 之间。`,
    );
  }
  return { ...distribution };
}

function rolesFor(playerCount: number): Role[] {
  const distribution = getRoleDistribution(playerCount);
  return [
    ...Array<Role>(distribution.lord).fill("lord"),
    ...Array<Role>(distribution.loyalist).fill("loyalist"),
    ...Array<Role>(distribution.rebel).fill("rebel"),
    ...Array<Role>(distribution.renegade).fill("renegade"),
  ];
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

function hasSkill(player: GamePlayer, skillId: Parameters<typeof hasGeneralSkill>[1]): boolean {
  return hasGeneralSkill(player.generalId, skillId);
}

const LORD_SKILL_IDS = new Set<GeneralSkillId>(
  FULL_GENERAL_CATALOG.flatMap((general) => general.skills)
    .filter((skill) => skill.category === "lord")
    .map((skill) => skill.rulesId),
);

function rawLifecycleSkillIds(session: GameSession, player: GamePlayer): GeneralSkillId[] {
  const base = player.generalId ? getGeneralDefinition(player.generalId).skillIds : [];
  return lifecycleEffectiveSkillIds(session.completeRules.lifecycle, player.id, base)
    .filter((skillId): skillId is GeneralSkillId => typeof skillId === "string") as GeneralSkillId[];
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

function factionOf(player: GamePlayer): "wei" | "shu" | "wu" | "qun" | "god" | null {
  return player.generalId ? getGeneralDefinition(player.generalId).faction : null;
}

function livingFactionCount(session: GameSession): number {
  return new Set(
    session.players
      .filter((player) => player.alive)
      .map(factionOf)
      .filter((faction): faction is "wei" | "shu" | "wu" | "qun" =>
        faction === "wei" || faction === "shu" || faction === "wu" || faction === "qun"),
  ).size;
}

function drawPhaseCardCount(session: GameSession, player: GamePlayer, modifier = 0): number {
  const yongsi = hasEffectiveSkill(session, player, "yongsi") ? livingFactionCount(session) : 0;
  return Math.max(0, TURN_DRAW_COUNT + yongsi + modifier);
}

function canBeSlashTarget(player: GamePlayer): boolean {
  return !(player.hand.length === 0 && hasSkill(player, "kongcheng"));
}

function canBeDuelTarget(player: GamePlayer): boolean {
  return !(player.hand.length === 0 && hasSkill(player, "kongcheng"));
}

function canBeQianxunTarget(player: GamePlayer): boolean {
  return !hasSkill(player, "qianxun");
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
  const offensive = (source.equipment.offensive_horse ? 1 : 0) + (hasSkill(source, "mashu") ? 1 : 0);
  const defensive = target.equipment.defensive_horse ? 1 : 0;
  return Math.max(1, base - offensive + defensive);
}

export function attackRangeFor(_session: GameSession, _playerId: PlayerId): number {
  const player = getLivingPlayer(_session, _playerId);
  const weapon = player.equipment.weapon;
  return weapon ? getCardDefinition(weapon.kind).weaponRange ?? 1 : 1;
}

function isInSlashRange(session: GameSession, sourceId: PlayerId, targetId: PlayerId): boolean {
  return distanceBetweenPlayers(session, sourceId, targetId) <= attackRangeFor(session, sourceId);
}

function enqueueAfterMoveSkill(
  session: GameSession,
  player: GamePlayer,
  skillId: Extract<SkillTriggerRef["skillId"], "lianying" | "xiaoji">,
): void {
  if (!hasSkill(player, skillId)) return;
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

/** The single committed hand-loss entry point used by every current rule path. */
function removeCard(session: GameSession, player: GamePlayer, cardId: CardId): Card {
  const index = player.hand.findIndex((card) => card.id === cardId);
  if (index < 0) ruleError("CARD_NOT_FOUND", `手牌中不存在 ${cardId}。`);
  const [card] = player.hand.splice(index, 1);
  if (!card) throw new Error("移除手牌失败。");
  // A temporarily reified virtual card already emitted the move event when
  // its physical origin left hand/equipment, so its synthetic hand removal
  // must not emit a second 连营 trigger.
  if (player.hand.length === 0 && !session.virtualCardOrigins[card.id]) {
    enqueueAfterMoveSkill(session, player, "lianying");
  }
  return card;
}

function removeAllHandCards(session: GameSession, player: GamePlayer): Card[] {
  if (player.hand.length === 0) return [];
  const removed = player.hand;
  player.hand = [];
  enqueueAfterMoveSkill(session, player, "lianying");
  return removed;
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
  session.status = "finished";
  session.winner = winner;
  session.pendingResponse = null;
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

function isBlackCard(card: Card): boolean {
  return card.suit === "spade" || card.suit === "club";
}

function isRedCard(card: Card): boolean {
  return card.suit === "heart" || card.suit === "diamond";
}

function isMassAttackImmune(player: GamePlayer, kind: "barbarian_invasion" | "arrow_barrage"): boolean {
  return player.equipment.armor?.kind === "teng_jia" && (kind === "barbarian_invasion" || kind === "arrow_barrage");
}

function killPlayer(session: GameSession, victim: GamePlayer, killer: GamePlayer | null): void {
  victim.hp = 0;
  victim.alive = false;
  const lostHand = removeAllHandCards(session, victim);
  if (lostHand.length > 0) session.discardPile.push(...lostHand);
  const equipment = loseAllEquipment(session, victim);
  if (equipment.length > 0) session.discardPile.push(...equipment);
  if (victim.judgment.length > 0) {
    session.discardPile.push(...victim.judgment.map((card) => restoreVirtualOrigin(session, card)));
  }
  victim.judgment = [];
  victim.chained = false;
  addLog(session, "death", `${victim.id} 阵亡，身份是${roleName(victim.role)}。`);

  if (killer && victim.role === "rebel" && killer.alive) {
    const drawn = drawCards(session, killer, 3);
    addLog(session, "card", `${killer.id} 击杀反贼，摸了 ${drawn} 张牌。`);
  } else if (killer?.role === "lord" && victim.role === "loyalist") {
    const lostHand = removeAllHandCards(session, killer);
    const lostEquipment = loseAllEquipment(session, killer);
    const discarded = lostHand.length + lostEquipment.length;
    session.discardPile.push(...lostHand, ...lostEquipment);
    addLog(session, "card", `${killer.id} 误杀忠臣，弃置了手牌和装备区内的全部 ${discarded} 张牌。`);
  }
  finishIfWon(session);
}

function beginDying(
  session: GameSession,
  target: GamePlayer,
  damageSourceId: PlayerId | null,
  resume: DyingResume,
): boolean {
  if (target.hp > 0) return false;
  const responders = livingPlayersInSeatOrderFrom(session, target).map((player) => player.id);
  const [firstResponder, ...remainingResponderIds] = responders;
  if (!firstResponder) throw new Error("濒死结算没有可响应玩家。");
  session.turn.phase = "respond";
  session.pendingResponse = {
    type: "dying",
    victimId: target.id,
    damageSourceId,
    targetId: firstResponder,
    remainingResponderIds,
    resume,
  };
  addLog(session, "damage", `${target.id} 进入濒死状态，需要回复至至少 1 点体力。`);
  return true;
}

function loseHp(session: GameSession, target: GamePlayer, amount: number, reason: string, resume: DyingResume): boolean {
  if (!Number.isSafeInteger(amount) || amount < 1) throw new Error("失去体力值必须为正整数。");
  target.hp -= amount;
  addLog(session, "damage", `${target.id} ${reason}，失去 ${amount} 点体力。`);
  return beginDying(session, target, null, resume);
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

interface OpportunityFreeDamageFlowStart {
  readonly damageId: number;
  readonly frameId: number;
  readonly dying: DamageDyingBarrier | null;
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

/**
 * Opens one root, opportunity-free damage frame and applies its life loss
 * exactly once. A lethal result intentionally remains paused at its persisted
 * dying barrier; a nonlethal result is ready for post-damage timings.
 */
function startOpportunityFreeDamageFlow(
  session: GameSession,
  target: GamePlayer,
  attacker: GamePlayer | null,
  amount: number,
  nature: DamageNature,
  reason: string,
  damageCardIds: readonly CardId[],
  callerContinuation: DamageFlowCallerContinuation | null,
): OpportunityFreeDamageFlowStart {
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
    reason: {
      type: damageCardIds.length > 0 ? "card" : "rule",
      id: damageCardIds[0] ?? reason,
    },
    amount,
  });
  let players = lifePlayerSnapshot(session);
  let flow = pushDamageFlowFrame(session.completeRules.damageFlow, {
    expectedParentFrameId: null,
    expectedRevision: session.completeRules.damageFlow.revision,
    damage,
    callerContinuation,
  }).state;

  for (const kind of ["causing_modifier", "redirect", "receiving_modifier"] as const) {
    flow = closeEmptyDamageFlowWindow(flow, frameId, kind, players);
  }

  const life = applyDamageLifeFlow(flow, players, {
    frameId,
    expectedRevision: flow.revision,
  });
  if (life.application.targetId !== target.id
    || life.application.amount !== amount
    || life.application.hpBefore !== target.hp
    || life.application.hpAfter !== target.hp - amount
  ) {
    throw new Error(`Damage flow ${damageId} produced an inconsistent life transaction`);
  }
  const shouldEnterDying = life.application.hpAfter <= 0;
  if ((life.dying !== null) !== shouldEnterDying) {
    throw new Error(`Damage flow ${damageId} produced an inconsistent dying barrier`);
  }

  commitLifePlayerSnapshot(session, life.players, damageId);
  session.completeRules.damageFlow = life.state;
  session.completeRules.nextDamageId = damageId + 1;
  return { damageId, frameId, dying: life.dying };
}

/** Completes every empty post-damage timing and consumes the root continuation once. */
function finishOpportunityFreeDamageFlow(
  session: GameSession,
  frameId: number,
): DamageFlowCallerContinuation | null {
  let flow = session.completeRules.damageFlow;
  const players = lifePlayerSnapshot(session);

  // Per-point timings repeat for damage greater than one. Driving the current
  // persisted stage preserves that cadence while still using empty windows.
  for (;;) {
    const frame = flow.frames[flow.frames.length - 1];
    if (!frame || frame.frameId !== frameId) throw new Error(`Damage flow ${frameId} lost its active frame`);
    if (frame.step === "complete") break;
    if (frame.step !== "post_damage") throw new Error(`Damage flow ${frameId} stopped at ${frame.step}`);
    flow = closeEmptyDamageFlowWindow(flow, frameId, postDamageWindowKind(frame.damage.stage), players);
  }

  const completed = finishDamageFlowFrame(flow, {
    frameId,
    resumeToken: null,
    expectedRevision: flow.revision,
    players: null,
  });
  if (completed.completedDamageId !== frameId
    || completed.completedFrameId !== frameId
    || completed.resumedParentFrameId !== null
    || completed.state.frames.length !== 0
  ) {
    throw new Error(`Damage flow ${frameId} did not complete at the root boundary`);
  }
  session.completeRules.damageFlow = completed.state;
  return completed.callerContinuation;
}

/** First live slice: resolves one opportunity-free nonlethal frame synchronously. */
function resolveSimpleNonlethalDamageFlow(
  session: GameSession,
  target: GamePlayer,
  attacker: GamePlayer | null,
  amount: number,
  nature: DamageNature,
  reason: string,
  damageCardIds: readonly CardId[],
): void {
  const started = startOpportunityFreeDamageFlow(
    session,
    target,
    attacker,
    amount,
    nature,
    reason,
    damageCardIds,
    null,
  );
  if (started.dying !== null) {
    throw new Error(`Nonlethal damage flow ${started.damageId} unexpectedly entered dying`);
  }
  if (finishOpportunityFreeDamageFlow(session, started.frameId) !== null) {
    throw new Error(`Nonlethal damage flow ${started.damageId} returned an unexpected continuation`);
  }
}

function effectiveDamageAmount(
  target: GamePlayer,
  amount: number,
  nature: DamageNature,
  ignoreArmor: boolean,
): number {
  let actualAmount = amount;
  if (!ignoreArmor && nature === "fire" && target.equipment.armor?.kind === "teng_jia") actualAmount += 1;
  if (!ignoreArmor && actualAmount > 1 && target.equipment.armor?.kind === "bai_yin_shi_zi") actualAmount = 1;
  return actualAmount;
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
  ignoreArmor = false,
  damageCardIds: readonly CardId[] = [],
): boolean {
  if (resume.type === "damage_flow") {
    throw new Error("An internal damage-flow cursor cannot start another root damage event");
  }
  const callerResume: GameDamageResume = resume;
  const actualAmount = effectiveDamageAmount(target, amount, nature, ignoreArmor);
  const skillQueue = standardDamageSkillQueue(getEffectiveGeneralSkillIds(session, target.id), actualAmount);
  const hasLegacyQilinOpportunity = resume.type === "slash_sequence"
    && attacker?.alive === true
    && attacker.equipment.weapon?.kind === "qi_lin_gong"
    && (target.equipment.offensive_horse !== undefined || target.equipment.defensive_horse !== undefined);
  const usesLiveDamageFlow = skillQueue.length === 0
    && !hasLegacyQilinOpportunity;
  let liveDying: DamageDyingBarrier | null = null;
  if (usesLiveDamageFlow) {
    if (target.hp - actualAmount > 0) {
      resolveSimpleNonlethalDamageFlow(session, target, attacker, actualAmount, nature, reason, damageCardIds);
    } else {
      const started = startOpportunityFreeDamageFlow(
        session,
        target,
        attacker,
        actualAmount,
        nature,
        reason,
        damageCardIds,
        encodeGameDamageContinuation(callerResume),
      );
      if (started.dying === null) {
        throw new Error(`Lethal damage flow ${started.damageId} did not enter dying`);
      }
      liveDying = started.dying;
    }
  } else {
    target.hp -= actualAmount;
  }
  const natureLabel = natureName(nature);
  addLog(
    session,
    "damage",
    `${target.id} ${reason}，受到 ${actualAmount} 点${natureLabel}伤害。`,
  );
  const sourceId = attacker?.id ?? null;
  if (usesLiveDamageFlow) {
    if (liveDying === null) return false;
    return beginDying(session, target, sourceId, {
      type: "damage_flow",
      frameId: liveDying.frameId,
      damageId: liveDying.damageId,
      dyingId: liveDying.dyingId,
    });
  }
  if (skillQueue.length === 0) return beginDying(session, target, sourceId, resume);
  const aftermath: StandardDamageAftermath = {
    eventId: allocateEventId(session),
    sourceId,
    targetId: target.id,
    amount: actualAmount,
    damageCardIds: [...new Set(damageCardIds)],
    remainingSkillIds: skillQueue,
    resume: cloneDyingResume(resume),
  };
  if (target.hp <= 0) {
    return beginDying(session, target, sourceId, { type: "standard_damage", aftermath });
  }
  return offerDamageAftermath(session, aftermath);
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
    target.chained = false;
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
      false,
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
    return dealDamage(session, target, attacker, amount, nature, reason, resume, ignoreArmor, damageCardIds);
  }
  const propagatedAmount = effectiveDamageAmount(target, amount, nature, ignoreArmor);
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
    ignoreArmor,
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

function finishTurn(session: GameSession, player: GamePlayer): void {
  session.pendingResponse = null;
  session.turn.phase = "end";
  addLog(session, "turn", `${player.id} 的回合结束。`);
  beginNextTurn(session);
}

/** Enter the real end phase exactly once, regardless of how discard was skipped/completed. */
function enterEndPhase(session: GameSession): void {
  const player = getLivingPlayer(session, session.currentPlayerId);
  session.turn.phase = "end";
  session.pendingResponse = null;
  if (hasSkill(player, "biyue")) {
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
  finishTurn(session, player);
}

function enterHandLimitDiscardOrEnd(session: GameSession, player: GamePlayer): void {
  const excess = Math.max(0, player.hand.length - player.hp);
  if (excess > 0) {
    session.turn.phase = "discard";
    session.turn.discardStage = "hand_limit";
    session.turn.requiredDiscardCount = excess;
    addLog(session, "turn", `${player.id} 需要按手牌上限弃置 ${excess} 张牌。`);
    return;
  }
  enterEndPhase(session);
}

function enterRealDiscardPhase(session: GameSession, player: GamePlayer): void {
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

function enterDiscardOrEnd(session: GameSession): void {
  const player = getLivingPlayer(session, session.currentPlayerId);
  const excess = Math.max(0, player.hand.length - player.hp);
  const hasYongsiDiscard = hasEffectiveSkill(session, player, "yongsi") && player.hand.length > 0 && livingFactionCount(session) > 0;
  if (excess > 0 || hasYongsiDiscard) {
    if (
      hasSkill(player, "keji") &&
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

function finishDrawPhase(session: GameSession, player: GamePlayer): void {
  if (session.turn.skipPlay) {
    addLog(session, "turn", `${player.id} 跳过出牌阶段。`);
    enterDiscardOrEnd(session);
  } else {
    session.turn.phase = "play";
  }
}

function moveLightningToNextPlayer(session: GameSession, lightning: Card, source: GamePlayer): void {
  const target = livingOpponentsInSeatOrder(session, source.id)
    .find((candidate) => !candidate.judgment.some((card) => card.kind === "shan_dian"));
  if (!target) {
    session.discardPile.push(lightning);
    addLog(session, "card", "闪电没有可转移目标，进入弃牌堆。");
    return;
  }
  target.judgment.push(lightning);
  addLog(session, "card", `闪电判定未命中，移动到 ${target.id} 的判定区。`);
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
  session.turn.phase = "draw";
  if (session.turn.skipDraw) {
    addLog(session, "turn", `${player.id} 跳过摸牌阶段。`);
  } else if (hasEffectiveSkill(session, player, "tuxi") && livingOpponentsInSeatOrder(session, player.id).some((target) => target.hand.length > 0)) {
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
  } else if (hasSkill(player, "luoyi")) {
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "skill_choice",
      targetId: player.id,
      skillId: "luoyi",
      resume: { type: "finish_draw", playerId: player.id },
    };
    addLog(session, "turn", `${player.id} 可以发动裸衣，少摸一张牌以强化本回合的杀和决斗。`);
    return;
  } else if (hasSkill(player, "yingzi")) {
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "skill_choice",
      targetId: player.id,
      skillId: "yingzi",
      resume: { type: "finish_draw", playerId: player.id },
    };
    addLog(session, "turn", `${player.id} 可以在摸牌阶段发动英姿多摸一张牌。`);
    return;
  } else {
    const drawn = drawCards(session, player, drawPhaseCardCount(session, player));
    if (hasEffectiveSkill(session, player, "yongsi")) {
      addLog(session, "card", `${player.id} 的庸肆按 ${livingFactionCount(session)} 个存活势力增加摸牌数。`);
    }
    addLog(session, "card", `${player.id} 摸了 ${drawn} 张牌。`);
  }
  finishDrawPhase(session, player);
}

function continuePrepareSkills(session: GameSession, player: GamePlayer): void {
  session.pendingResponse = null;
  session.turn.phase = "prepare";
  if (hasSkill(player, "luoshen")) {
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
  continueJudgmentPhase(session);
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

function beginTurnStart(session: GameSession): void {
  if (session.status === "finished") return;
  const player = getLivingPlayer(session, session.currentPlayerId);
  session.pendingResponse = null;
  if (!player.faceUp) {
    const restored = turnOverLivePlayer(session, player.id);
    addLog(session, "turn", `${restored.id} 在回合开始时翻回正面并跳过整个回合。`);
    beginNextTurn(session);
    return;
  }
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

function beginNextTurn(session: GameSession): void {
  const nextPlayer = nextLivingPlayer(session, session.currentPlayerId);
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
    slashRespondedInPlayPhase: false,
    skillUseCounts: {},
    rendeGivenCount: 0,
    rendeRecovered: false,
  };
  addLog(session, "turn", `第 ${session.turn.number} 回合：${nextPlayer.id} 开始行动。`);
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
    slashRespondedInPlayPhase: turn.slashRespondedInPlayPhase ?? false,
    skillUseCounts: { ...(turn.skillUseCounts ?? {}) },
    rendeGivenCount: turn.rendeGivenCount ?? 0,
    rendeRecovered: turn.rendeRecovered ?? false,
  };
}

function cloneTrickEffect(effect: PendingTrickEffect): PendingTrickEffect {
  if (effect.type === "mass_attack") {
    return { type: "mass_attack", pending: { ...effect.pending, remainingTargetIds: [...effect.pending.remainingTargetIds] } };
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

function cloneSlashCompletion(value: SlashResolutionContinuation | undefined): SlashResolutionContinuation {
  return value?.type === "turn_flow" ? { ...value } : { type: "default" };
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
    tieqiChecked: pending.tieqiChecked ?? false,
    excludedRedirectTargetIds: [...(pending.excludedRedirectTargetIds ?? [pending.attackerId, pending.targetId, ...pending.remainingTargetIds])],
    dodgeProhibited: pending.dodgeProhibited ?? false,
    completion: cloneSlashCompletion(pending.completion),
  };
}

function cloneDyingResume(resume: DyingResume): DyingResume {
  if (resume.type === "mass_attack") {
    return {
      type: "mass_attack",
      pending: { ...resume.pending, remainingTargetIds: [...resume.pending.remainingTargetIds] },
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
  if (resume.type === "standard_damage") {
    return { type: "standard_damage", aftermath: cloneStandardDamageAftermath(resume.aftermath) };
  }
  if (resume.type === "damage_flow") {
    return { ...resume };
  }
  if (resume.type === "skill") {
    return { ...resume };
  }
  return { type: resume.type };
}

function clonePendingResponse(pending: PendingResponse | null): PendingResponse | null {
  if (!pending) return null;
  if (pending.type === "mass_attack") {
    return {
      ...pending,
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
    return { ...pending, slash: cloneSlashPending(pending.slash) };
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
        ? { type: "use_slash", targetIds: [...pending.resume.targetIds] }
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
          remainingTriggers: pending.resume.remainingTriggers.map((trigger) => ({ ...trigger })),
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
    };
  }
  if (pending.type === "standard_skill") {
    return {
      ...pending,
      ...(pending.aftermath ? { aftermath: cloneStandardDamageAftermath(pending.aftermath) } : {}),
      ...(pending.slash ? { slash: cloneSlashPending(pending.slash) } : {}),
      ...(pending.selectedCardIds ? { selectedCardIds: [...pending.selectedCardIds] } : {}),
    };
  }
  return { ...pending };
}

function cloneSession(session: GameSession): GameSession {
  return {
    ...session,
    players: session.players.map((player) => ({
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
    })),
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
      queuedTriggers: (session.afterMove?.queuedTriggers ?? []).map((trigger) => ({ ...trigger })),
      suspendedPhase: session.afterMove?.suspendedPhase ?? null,
      suspendedResponse: clonePendingResponse(session.afterMove?.suspendedResponse ?? null),
    },
    completeRules: (() => {
      const completeRules = migrateCompleteRulesEngineState(session.completeRules);
      completeRules.nextEventId = Math.max(completeRules.nextEventId, session.nextEventId ?? 1);
      return completeRules;
    })(),
  };
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

  const shuffledDeck = shuffle(createStandardDeck(), rng);
  rng = shuffledDeck.state;
  const lord = players.find((player) => player.role === "lord");
  if (!lord) throw new Error("身份分配缺少主公。");

  const session: GameSession = {
    version: 1,
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
      slashRespondedInPlayPhase: false,
      skillUseCounts: {},
      rendeGivenCount: 0,
      rendeRecovered: false,
    },
    pendingResponse: null,
    winner: null,
    logs: [],
    rng,
    nextLogId: 1,
    nextUseId: 1,
    nextEventId: 1,
    afterMove: { queuedTriggers: [], suspendedPhase: null, suspendedResponse: null },
    completeRules: createCompleteRulesEngineState(),
  };

  addLog(session, "system", `游戏开始，共 ${players.length} 名玩家。`);
  addLog(session, "system", `${lord.id} 是主公。`);
  for (let round = 0; round < INITIAL_HAND_SIZE; round += 1) {
    for (const player of players) drawCards(session, player, 1);
  }
  addLog(session, "card", `所有玩家各摸了 ${INITIAL_HAND_SIZE} 张起始手牌。`);
  addLog(session, "turn", `第 1 回合：${lord.id} 开始行动。`);
  beginTurnStart(session);
  return session;
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

function areOppositeGender(left: GamePlayer, right: GamePlayer): boolean {
  if (!left.generalId || !right.generalId) return false;
  return getGeneralDefinition(left.generalId).gender !== getGeneralDefinition(right.generalId).gender;
}

function completeSlashResolution(
  session: GameSession,
  pending: Extract<PendingResponse, { type: "slash" }>,
): void {
  session.pendingResponse = null;
  finishResolvingCards(session);
  if (session.status !== "playing") return;
  const current = getPlayer(session, session.currentPlayerId);
  if (!current.alive) {
    beginNextTurn(session);
    return;
  }
  const completion = pending.completion ?? { type: "default" as const };
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
      .filter((candidate) => canBeSlashTarget(candidate) && isInSlashRange(probe, probeOwner.id, candidate.id))
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
    tieqiChecked: false,
    dodgeProhibited: false,
    excludedRedirectTargetIds: [...new Set([
      ...(slash.excludedRedirectTargetIds ?? [slash.attackerId, slash.targetId, ...slash.remainingTargetIds]),
      redirected.id,
    ])],
  });
}

function beginSlashTarget(
  session: GameSession,
  pending: Extract<PendingResponse, { type: "slash" }>,
): void {
  const target = getPlayer(session, pending.targetId);
  if (!target.alive) {
    advanceSlashSequence(session, pending);
    return;
  }
  const attacker = getPlayer(session, pending.attackerId);
  const liuliChecked = pending.liuliCheckedPlayerIds ?? [];
  if (!liuliChecked.includes(target.id) && hasEffectiveSkill(session, target, "liuli")) {
    const checkedPending = { ...pending, liuliCheckedPlayerIds: [...liuliChecked, target.id] };
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
  if (!pending.tieqiChecked) {
    const checkedPending = { ...pending, tieqiChecked: true };
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
    if (weapon?.kind === "ci_xiong_shuang_gu_jian" && areOppositeGender(attacker, target)) {
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
  const armorIgnored = weapon?.kind === "qing_gang_jian";
  const next = { ...pending, armorIgnored };
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
    addLog(session, "card", `${target.id} 因铁骑判定为红色，不能以任何方式使用或打出闪。`);
    beginSlashDamage(session, next);
    return;
  }
  session.turn.phase = "respond";
  session.pendingResponse = next;
}

function luoyiDamageBonus(session: GameSession, player: GamePlayer): number {
  return session.currentPlayerId === player.id && session.turn.luoyiActive && hasSkill(player, "luoyi") ? 1 : 0;
}

function wushuangResponseCount(player: GamePlayer): number {
  return hasSkill(player, "wushuang") ? 2 : 1;
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
    .filter((candidate) => factionOf(candidate) === faction);
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
    if (!canUseAnotherSlash(session, requester)) ruleError("SLASH_ALREADY_USED", "本出牌阶段不能再次通过激将使用杀。");
    const target = action.targetId ? getLivingPlayer(session, action.targetId) : null;
    if (!target || target.id === requester.id || !canBeSlashTarget(target) || !isInSlashRange(session, requester.id, target.id)) {
      ruleError("INVALID_TARGET", "激将必须指定一名攻击范围内可成为杀目标的其他角色。");
    }
    beginLordDispatch(session, requester, "jijiang", { type: "use_slash", targetIds: [target.id] });
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
  if (action.targetId !== undefined) ruleError("INVALID_TARGET", "响应牌已有结算目标，不能重新指定目标。");
  beginLordDispatch(session, requester, action.skillId, {
    type: "respond",
    pending: clearLordDispatchDeclined(dispatchable),
  });
}

function advanceOrFailLordDispatch(session: GameSession, pending: PendingLordDispatch): void {
  for (const [index, providerId] of pending.remainingProviderIds.entries()) {
    const provider = getPlayer(session, providerId);
    if (!provider.alive || factionOf(provider) !== pending.requiredFaction) continue;
    session.pendingResponse = {
      ...pending,
      targetId: provider.id,
      promptId: lordDispatchPromptId(pending.eventId, pending.skillId, pending.requesterId, provider.id),
      remainingProviderIds: pending.remainingProviderIds.slice(index + 1),
    };
    return;
  }
  if (pending.resume.type === "respond") {
    session.turn.phase = "respond";
    session.pendingResponse = markLordDispatchDeclined(pending.resume.pending, pending.skillId);
  } else {
    session.turn.phase = "play";
    session.pendingResponse = null;
  }
  addLog(session, "card", `${pending.requesterId} 的${pending.skillId === "hujia" ? "护驾" : "激将"}无人响应。`);
}

function resolveProvidedDodge(
  session: GameSession,
  pending: Extract<LordDispatchableResponse, { type: "slash" | "mass_attack" }>,
  requester: GamePlayer,
): void {
  if (pending.type === "slash") {
    const required = pending.requiredDodgeCount ?? 1;
    const dodgesPlayed = (pending.dodgesPlayed ?? 0) + 1;
    const progressed = clearLordDispatchDeclined({ ...pending, requiredDodgeCount: required, dodgesPlayed });
    if (dodgesPlayed < required) {
      session.pendingResponse = { ...progressed, armorAttempted: false };
      addLog(session, "card", `${requester.id} 通过护驾完成第 ${dodgesPlayed}/${required} 张闪，仍需继续响应。`);
      return;
    }
    completeSlashDodged(session, progressed);
    return;
  }
  advanceMassAttack(session, clearLordDispatchDeclined(pending));
}

function resolveProvidedSlash(
  session: GameSession,
  pending: Extract<LordDispatchableResponse, { type: "duel" | "mass_attack" | "borrowed_sword" }>,
  requester: GamePlayer,
  physical: Card,
): void {
  if (session.currentPlayerId === requester.id) session.turn.slashRespondedInPlayPhase = true;
  if (pending.type === "duel") {
    const required = pending.requiredSlashCount ?? 1;
    const slashesPlayed = (pending.slashesPlayed ?? 0) + 1;
    if (slashesPlayed < required) {
      session.pendingResponse = clearLordDispatchDeclined({ ...pending, requiredSlashCount: required, slashesPlayed });
      addLog(session, "card", `${requester.id} 通过激将完成第 ${slashesPlayed}/${required} 张杀，仍需继续响应决斗。`);
      return;
    }
    const opponent = getLivingPlayer(session, pending.attackerId);
    session.pendingResponse = {
      ...pending,
      attackerId: requester.id,
      targetId: opponent.id,
      requiredSlashCount: wushuangResponseCount(requester),
      slashesPlayed: 0,
      declinedLordSkillIds: [],
    };
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
    color: isBlackCard(physical) ? "black" : "red",
    armorIgnored: false,
    requiredDodgeCount: wushuangResponseCount(requester),
    dodgesPlayed: 0,
    remainingTargetIds: [],
    zhuQueChecked: false,
    ciXiongChecked: false,
    completion: { type: "default" },
  });
}

function resolveProvidedActiveSlash(
  session: GameSession,
  pending: PendingLordDispatch,
  requester: GamePlayer,
  physical: Card,
): void {
  if (pending.resume.type !== "use_slash") throw new Error("激将主动使用缺少目标续体。");
  session.pendingResponse = null;
  session.turn.phase = "play";
  assertPlayTurn(session, requester.id);
  if (!canUseAnotherSlash(session, requester)) ruleError("SLASH_ALREADY_USED", "激将结算时已不能继续使用杀。");
  const targetId = pending.resume.targetIds[0];
  const target = targetId ? getLivingPlayer(session, targetId) : null;
  if (!target || target.id === requester.id || !canBeSlashTarget(target) || !isInSlashRange(session, requester.id, target.id)) {
    ruleError("INVALID_TARGET", "激将结算时原目标已不再合法。");
  }
  const slashKind = physical.kind as Extract<CardKind, "slash" | "fire_slash" | "thunder_slash">;
  const damage = 1 + session.turn.slashDamageBonus + luoyiDamageBonus(session, requester);
  session.turn.slashUsed = true;
  session.turn.slashDamageBonus = 0;
  addLog(session, "card", `${requester.id} 通过激将对 ${target.id} 使用了由协助者打出的${physical.name}。`);
  beginSlashTarget(session, {
    type: "slash",
    attackerId: requester.id,
    targetId: target.id,
    cardId: physical.id,
    slashKind,
    damage,
    nature: damageNatureForSlash(slashKind),
    color: isBlackCard(physical) ? "black" : "red",
    armorIgnored: false,
    requiredDodgeCount: wushuangResponseCount(requester),
    dodgesPlayed: 0,
    remainingTargetIds: [],
    zhuQueChecked: false,
    ciXiongChecked: false,
    completion: { type: "default" },
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
  if (factionOf(provider) !== pending.requiredFaction) {
    ruleError("INVALID_SKILL", "当前角色的势力不满足此主公技请求。");
  }
  if (action.cardId == null) {
    addLog(session, "card", `${provider.id} 未响应 ${pending.requesterId} 的${pending.skillId === "hujia" ? "护驾" : "激将"}。`);
    advanceOrFailLordDispatch(session, pending);
    return;
  }
  const card = provider.hand.find((candidate) => candidate.id === action.cardId);
  if (!card) ruleError("CARD_NOT_FOUND", `手牌中不存在 ${action.cardId}。`);
  const valid = pending.responseKind === "dodge" ? card.kind === "dodge" : isSlashCardKind(card.kind);
  if (!valid) ruleError("INVALID_RESPONSE", `只能为该请求打出一张实体${pending.responseKind === "dodge" ? "闪" : "杀"}。`);
  const physical = removeCard(session, provider, card.id);
  session.resolvingCards.push(physical);
  const requester = getLivingPlayer(session, pending.requesterId);
  addLog(session, "card", `${provider.id} 为 ${requester.id} 的${pending.skillId === "hujia" ? "护驾" : "激将"}打出${physical.name}。`);
  if (pending.resume.type === "use_slash") {
    resolveProvidedActiveSlash(session, pending, requester, physical);
    return;
  }
  const resumed = pending.resume.pending;
  if (pending.responseKind === "dodge") {
    if (resumed.type !== "slash" && resumed.type !== "mass_attack") throw new Error("护驾恢复点不是闪响应。");
    resolveProvidedDodge(session, resumed, requester);
  } else {
    if (resumed.type !== "duel" && resumed.type !== "mass_attack" && resumed.type !== "borrowed_sword") {
      throw new Error("激将恢复点不是杀响应。");
    }
    resolveProvidedSlash(session, resumed, requester, physical);
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
  if (session.turn.slashUsed && weapon?.kind !== "zhu_ge_lian_nu" && !hasSkill(player, "paoxiao")) {
    ruleError("SLASH_ALREADY_USED", "每个出牌阶段只能使用一张杀。");
  }
  const requestedTargets = targetIds ?? (targetId ? [targetId] : []);
  const canUseFangTian = weapon?.kind === "fang_tian_hua_ji" && player.hand.length === 1;
  if (
    requestedTargets.length < 1 ||
    requestedTargets.length > (canUseFangTian ? 3 : 1) ||
    new Set(requestedTargets).size !== requestedTargets.length ||
    requestedTargets.includes(player.id)
  ) {
    ruleError("INVALID_TARGET", canUseFangTian
      ? `${card.name}必须指定一至三名不同的其他存活玩家。`
      : `${card.name}必须指定一名其他存活玩家。`);
  }
  const targets = requestedTargets.map((id) => getLivingPlayer(session, id));
  for (const target of targets) {
    if (!canBeSlashTarget(target)) {
      ruleError("INVALID_TARGET", `${target.id} 没有手牌，空城使其不能成为杀的目标。`);
    }
    if (!isInSlashRange(session, player.id, target.id)) {
      ruleError("INVALID_TARGET", `${target.id} 不在${card.name}的攻击范围内。`);
    }
  }
  const firstTarget = targets[0];
  if (!firstTarget) throw new Error("杀的目标解析失败。");
  const damage = 1 + session.turn.slashDamageBonus + luoyiDamageBonus(session, player);
  const played = moveCardToResolving(session, player, card.id);
  session.turn.slashUsed = true;
  session.turn.slashDamageBonus = 0;
  const pending: Extract<PendingResponse, { type: "slash" }> = {
    type: "slash",
    attackerId: player.id,
    targetId: firstTarget.id,
    cardId: played.id,
    slashKind: card.kind,
    damage,
    nature: damageNatureForSlash(card.kind),
    color: isBlackCard(card) ? "black" : "red",
    armorIgnored: false,
    requiredDodgeCount: wushuangResponseCount(player),
    dodgesPlayed: 0,
    remainingTargetIds: targets.slice(1).map((target) => target.id),
    zhuQueChecked: false,
    ciXiongChecked: false,
    completion: { type: "default" },
  };
  addLog(
    session,
    "card",
    `${player.id} 对 ${targets.map((target) => target.id).join("、")} 使用了${card.name}${damage > 1 ? "（伤害强化）" : ""}。`,
  );
  beginSlashTarget(session, pending);
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
  player.hp += 1;
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
  beginNullification(session, {
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
  if (!canBeDuelTarget(target)) {
    ruleError("INVALID_TARGET", `${target.id} 没有手牌，空城使其不能成为决斗的目标。`);
  }
  moveCardToResolving(session, player, card.id);
  addLog(session, "card", `${player.id} 对 ${target.id} 使用了决斗，等待无懈可击响应。`);
  beginNullification(session, {
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
  const massKind = card.kind;
  const targets = livingOpponentsInSeatOrder(session, player.id)
    .filter((target) => !isMassAttackImmune(target, massKind));
  const [firstTarget, ...remainingTargets] = targets;
  if (!firstTarget) {
    session.discardPile.push(removeCard(session, player, card.id));
    addLog(session, "card", `${card.name}没有可结算目标。`);
    return;
  }
  moveCardToResolving(session, player, card.id);
  const pending: PendingMassAttackResponse = {
    type: "mass_attack",
    attackerId: player.id,
    targetId: firstTarget.id,
    cardId: card.id,
    cardKind: massKind,
    responseKind: massKind === "barbarian_invasion" ? "slash" : "dodge",
    remainingTargetIds: remainingTargets.map((target) => target.id),
  };
  addLog(
    session,
    "card",
    `${player.id} 使用了${card.name}，从 ${firstTarget.id} 开始逐目标结算。`,
  );
  beginNullification(session, { type: "mass_attack", pending }, massKind);
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
  const targets = livingPlayersInSeatOrderFrom(session, player).filter((target) => target.hp < target.maxHp);
  const [firstTarget, ...remainingTargets] = targets;
  if (!firstTarget) {
    finishResolvingCards(session);
    return;
  }
  beginNullification(session, {
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
  if (card.kind === "le_bu_si_shu" && !canBeQianxunTarget(target)) {
    ruleError("INVALID_TARGET", `${target.id} 的谦逊使其不能成为乐不思蜀的目标。`);
  }
  if (target.judgment.some((candidate) => candidate.kind === card.kind)) {
    ruleError("DUPLICATE_DELAYED_TRICK", `${target.id} 的判定区已有${card.name}。`);
  }
  if (
    card.kind === "bing_liang_cun_duan" &&
    !hasSkill(player, "qicai") &&
    distanceBetweenPlayers(session, player.id, target.id) > 1
  ) {
    ruleError("INVALID_TARGET", `${target.id} 不在兵粮寸断的距离 1 范围内。`);
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
): void {
  if (card.kind !== "guo_he_chai_qiao" && card.kind !== "shun_shou_qian_yang") {
    throw new Error("非区域锦囊进入区域选择结算。");
  }
  if (!targetId || targetId === player.id) {
    ruleError("INVALID_TARGET", `${card.name}必须指定一名其他存活玩家。`);
  }
  const target = getLivingPlayer(session, targetId);
  if (!hasCardsInAnyZone(target)) ruleError("INVALID_TARGET", `${target.id} 的所有区域均没有牌。`);
  if (card.kind === "shun_shou_qian_yang" && !canBeQianxunTarget(target)) {
    ruleError("INVALID_TARGET", `${target.id} 的谦逊使其不能成为顺手牵羊的目标。`);
  }
  if (
    card.kind === "shun_shou_qian_yang" &&
    !hasSkill(player, "qicai") &&
    distanceBetweenPlayers(session, player.id, target.id) > 1
  ) {
    ruleError("INVALID_TARGET", `${target.id} 不在顺手牵羊的距离 1 范围内。`);
  }
  moveCardToResolving(session, player, card.id);
  addLog(session, "card", `${player.id} 对 ${target.id} 使用${card.name}，等待无懈可击响应。`);
  beginNullification(session, {
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
  if (!targetId || targetId === player.id) {
    ruleError("INVALID_TARGET", "火攻必须指定一名有手牌的其他存活玩家。");
  }
  const target = getLivingPlayer(session, targetId);
  if (target.hand.length === 0) ruleError("INVALID_TARGET", `${target.id} 没有可展示的手牌。`);
  moveCardToResolving(session, player, card.id);
  addLog(session, "card", `${player.id} 对 ${target.id} 使用火攻，等待无懈可击响应。`);
  beginNullification(session, {
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
  const targets = livingPlayersInSeatOrderFrom(session, player);
  const pool = drawPublicCards(session, targets.length);
  const [firstTarget, ...remainingTargets] = targets;
  addLog(session, "card", `${player.id} 使用五谷丰登，亮出 ${pool.length} 张牌。`);
  if (!firstTarget || pool.length === 0) {
    finishTrickResolution(session);
    return;
  }
  beginNullification(session, {
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
  if (!canBeSlashTarget(attackTarget)) {
    ruleError("INVALID_TARGET", `${attackTarget.id} 没有手牌，空城使其不能成为杀的目标。`);
  }
  if (!isInSlashRange(session, holder.id, attackTarget.id)) {
    ruleError("INVALID_TARGET", `${attackTarget.id} 不在 ${holder.id} 的攻击范围内。`);
  }
  moveCardToResolving(session, player, card.id);
  addLog(session, "card", `${player.id} 对 ${holder.id} 使用借刀杀人，要求其攻击 ${attackTarget.id}。`);
  beginNullification(session, {
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
  beginNullification(session, {
    type: "iron_chain",
    sourceId: player.id,
    targetId: firstTarget.id,
    cardId: card.id,
    remainingTargetIds: remainingTargets.map((target) => target.id),
  }, "iron_chain");
}

function hasNullification(player: GamePlayer): boolean {
  return player.hand.some((card) => card.kind === "wu_xie_ke_ji");
}

function initialNullificationResponders(session: GameSession, effectTargetId: PlayerId): PlayerId[] {
  const target = getLivingPlayer(session, effectTargetId);
  return livingPlayersInSeatOrderFrom(session, target)
    .filter(hasNullification)
    .map((player) => player.id);
}

function counterNullificationResponders(session: GameSession, responderId: PlayerId): PlayerId[] {
  const responder = getLivingPlayer(session, responderId);
  return [...livingOpponentsInSeatOrder(session, responder.id), responder]
    .filter(hasNullification)
    .map((player) => player.id);
}

function finishTrickResolution(session: GameSession): void {
  session.pendingResponse = null;
  if (session.status === "playing") session.turn.phase = "play";
  finishResolvingCards(session);
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
    const target = getLivingPlayer(session, effect.targetId);
    const drawn = drawCards(session, target, 2);
    addLog(session, "card", `${target.id} 因无中生有摸了 ${drawn} 张牌。`);
    finishTrickResolution(session);
    return;
  }
  if (effect.type === "duel") {
    const initiator = getLivingPlayer(session, effect.sourceId);
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "duel",
      attackerId: effect.sourceId,
      targetId: effect.targetId,
      cardId: effect.cardId,
      initiatorId: effect.sourceId,
      originalTargetId: effect.targetId,
      requiredSlashCount: wushuangResponseCount(initiator),
      slashesPlayed: 0,
    };
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
      target.hp += 1;
      addLog(session, "card", `${target.id} 因桃园结义回复了 1 点体力。`);
    }
    advancePeachGarden(session, effect);
    return;
  }
  if (effect.type === "fire_attack") {
    const victim = getLivingPlayer(session, effect.targetId);
    if (victim.hand.length === 0) {
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
    const holder = getLivingPlayer(session, effect.targetId);
    if (!holder.equipment.weapon) {
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
    const victim = getLivingPlayer(session, effect.targetId);
    if (!hasCardsInAnyZone(victim)) {
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
  const effectTargetId = effect.type === "mass_attack" ? effect.pending.targetId : effect.targetId;
  const sourceId = effect.type === "mass_attack" ? effect.pending.attackerId : effect.sourceId;
  const cardId = effect.type === "mass_attack" ? effect.pending.cardId : effect.cardId;
  const responders = initialNullificationResponders(session, effectTargetId);
  const [firstResponder, ...remainingResponderIds] = responders;
  if (!firstResponder) {
    resolveTrickEffect(session, effect, false);
    return;
  }
  session.turn.phase = "respond";
  session.pendingResponse = {
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
    if (card.kind !== "wu_xie_ke_ji") ruleError("INVALID_RESPONSE", "当前只能打出无懈可击。");
    session.resolvingCards.push(removeCard(session, responder, card.id));
    const responders = counterNullificationResponders(session, responder.id);
    const [firstResponder, ...remainingResponderIds] = responders;
    const negated = !pending.negated;
    addLog(session, "card", `${responder.id} 打出无懈可击，当前锦囊效果${negated ? "被抵消" : "恢复生效"}。`);
    if (!firstResponder) {
      resolveTrickEffect(session, pending.effect, negated);
      return;
    }
    session.pendingResponse = { ...pending, targetId: firstResponder, remainingResponderIds, negated };
    return;
  }
  for (const [index, playerId] of pending.remainingResponderIds.entries()) {
    const candidate = getPlayer(session, playerId);
    if (!candidate.alive || !hasNullification(candidate)) continue;
    session.pendingResponse = { ...pending, targetId: candidate.id, remainingResponderIds: pending.remainingResponderIds.slice(index + 1) };
    return;
  }
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
    const matching = source.hand.filter((card) => card.suit === revealed.suit);
    addLog(session, "card", `${victim.id} 展示了${revealed.name}（${revealed.suit} ${revealed.rank}）。`);
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
    addLog(session, "card", `等待 ${source.id} 弃置一张${revealed.suit}手牌，或放弃火攻伤害。`);
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
  if (payment.suit !== revealed.suit) ruleError("INVALID_SELECTION", "火攻只能弃置与展示牌花色相同的手牌。");
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
  const source = getLivingPlayer(session, pending.attackerId);
  if (cardId == null && (!cardIds || cardIds.length === 0)) {
    const weapon = holder.equipment.weapon;
    if (weapon) {
      source.hand.push(loseEquipment(session, holder, "weapon"));
      addLog(session, "card", `${holder.id} 未使用杀，将武器${weapon.name}交给 ${source.id}。`);
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
    requiredDodgeCount: wushuangResponseCount(holder),
    dodgesPlayed: 0,
    remainingTargetIds: [],
    zhuQueChecked: false,
    ciXiongChecked: false,
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

function commitPlayCard(
  session: GameSession,
  action: Extract<GameAction, { type: "play_card" }>,
): void {
  assertPlayTurn(session, action.playerId);
  const player = getLivingPlayer(session, action.playerId);
  const card = player.hand.find((candidate) => candidate.id === action.cardId);
  if (!card) ruleError("CARD_NOT_FOUND", `手牌中不存在 ${action.cardId}。`);

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
  effectiveKind: CardKind,
  action: Pick<Extract<GameAction, { type: "play_card" }>, "targetId" | "targetIds">,
): PlayerId[] {
  if (effectiveKind === "ex_nihilo") return [player.id];
  if (effectiveKind === "barbarian_invasion" || effectiveKind === "arrow_barrage") {
    return livingOpponentsInSeatOrder(session, player.id)
      .filter((target) => !isMassAttackImmune(target, effectiveKind))
      .map((target) => target.id);
  }
  if (effectiveKind === "peach_garden") {
    return livingPlayersInSeatOrderFrom(session, player)
      .filter((target) => target.hp < target.maxHp)
      .map((target) => target.id);
  }
  if (effectiveKind === "amazing_grace") {
    return livingPlayersInSeatOrderFrom(session, player).map((target) => target.id);
  }
  if (effectiveKind === "borrowed_sword" || effectiveKind === "iron_chain") {
    return [...(action.targetIds ?? [])];
  }
  return action.targetId ? [action.targetId] : [];
}

function actionForCardUseIntent(intent: CardUseIntent): Extract<GameAction, { type: "play_card" }> {
  if (intent.effectiveKind === "borrowed_sword" || intent.effectiveKind === "iron_chain") {
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
  const physical = ownedCard(player, intent.physicalCardId);
  assertIntentPhysicalCard(intent, physical);
  const action = actionForCardUseIntent(intent);

  if (intent.viaSkill === null && intent.physicalKind === intent.effectiveKind) {
    if (!player.hand.some((card) => card.id === physical.id)) {
      ruleError("CARD_NOT_FOUND", `手牌中不存在 ${physical.id}。`);
    }
    commitPlayCard(session, action);
    return;
  }

  if (intent.viaSkill !== "qixi" || intent.effectiveKind !== "guo_he_chai_qiao") {
    throw new Error(`尚不支持续体提交转化牌 ${intent.viaSkill ?? "unknown"}:${intent.effectiveKind}。`);
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

function triggersForCardUseEvent(
  session: GameSession,
  intent: CardUseIntent,
  stage: CardUseContinuation["stage"],
  eventId: number,
): SkillTriggerRef[] {
  if (stage !== "card_use_declared" || intent.method !== "use" || !ORDINARY_TRICK_KINDS.has(intent.effectiveKind)) {
    return [];
  }
  const source = getLivingPlayer(session, intent.sourceId);
  if (!hasSkill(source, "jizhi")) return [];
  return [{
    triggerId: `${eventId}:jizhi:${source.id}:0`,
    eventId,
    ownerId: source.id,
    skillId: "jizhi",
    targetIndex: 0,
    mandatory: false,
  }];
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

function beginStandardJudgment(
  session: GameSession,
  target: GamePlayer,
  reason: { type: "delayed_trick" | "skill" | "armor"; id: string },
  pattern: JudgmentPattern,
  context: StandardJudgmentContext,
): void {
  const frameId = allocateEventId(session);
  const retrialOrder = standardJudgmentOrder(session)
    .filter((player) => hasEffectiveSkill(session, player, "guicai"))
    .map((player) => ({ ownerId: player.id, skillId: "guicai" }));
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
  };
  advanceStandardJudgment(session);
}

function settleAndResumeStandardJudgment(session: GameSession, pending: PendingStandardJudgment): void {
  const { frame, context } = pending;
  const judged = getPlayer(session, frame.targetId);
  const luoshenGain = context.type === "luoshen" && frame.result === true;
  const gain = pending.tianduClaimed || luoshenGain;
  const adapted = judgmentZoneState(session, frame);
  settleJudgmentCard(adapted.state, frame, {
    batchId: nextMoveBatchId(session),
    to: gain ? { kind: "hand", playerId: judged.id } : { kind: "discard" },
    actorId: gain ? judged.id : null,
    skillId: pending.tianduClaimed ? "tiandu" : luoshenGain ? "luoshen" : null,
    visibility: gain ? "owner" : "public",
  });
  syncJudgmentZones(session, frame, adapted);
  session.pendingResponse = null;

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
        continueJudgmentPhase(session);
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
    continueJudgmentPhase(session);
    return;
  }

  if (context.type === "ganglie") {
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

  if (context.type === "tieqi") {
    beginSlashTarget(session, {
      ...context.slash,
      tieqiChecked: true,
      dodgeProhibited: frame.result === true,
    });
    return;
  }

  const armorPending = context.pending;
  const armorOwner = getPlayer(session, armorPending.targetId);
  if (!frame.result) {
    session.turn.phase = "respond";
    session.pendingResponse = { ...armorPending, armorAttempted: true };
    addLog(session, "card", `${armorOwner.id} 发动八卦阵失败，仍需打出闪。`);
    return;
  }
  if (armorPending.type === "slash") {
    const required = armorPending.requiredDodgeCount ?? 1;
    const dodgesPlayed = (armorPending.dodgesPlayed ?? 0) + 1;
    const progressed = { ...armorPending, requiredDodgeCount: required, dodgesPlayed };
    if (dodgesPlayed < required) {
      session.turn.phase = "respond";
      session.pendingResponse = { ...progressed, armorAttempted: false };
      addLog(session, "card", `${armorOwner.id} 发动八卦阵成功，视为打出第 ${dodgesPlayed}/${required} 张闪。`);
      return;
    }
    addLog(session, "card", `${armorOwner.id} 发动八卦阵成功，视为打出第 ${dodgesPlayed}/${required} 张闪并抵消杀。`);
    completeSlashDodged(session, progressed);
    return;
  }
  addLog(session, "card", `${armorOwner.id} 发动八卦阵成功，视为打出闪。`);
  advanceMassAttack(session, armorPending);
}

function advanceStandardJudgment(session: GameSession): void {
  const pending = session.pendingResponse;
  if (pending?.type !== "standard_judgment") throw new Error("standard judgment continuation is missing");
  const { frame } = pending;
  while (frame.stage === "retrial_window") {
    const opportunity = currentJudgmentRetrialOpportunity(frame);
    if (!opportunity) throw new Error("judgment retrial cursor is invalid");
    const owner = getPlayer(session, opportunity.ownerId);
    if (!owner.alive || !hasEffectiveSkill(session, owner, "guicai") || owner.hand.length === 0) {
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
    if (retrial.ownerId !== action.playerId || retrial.skillId !== "guicai") {
      ruleError("INVALID_RESPONSE", "当前鬼才响应者不匹配。");
    }
    if (!action.activate) {
      passJudgmentRetrial(pending.frame, action.playerId, "guicai");
    } else {
      if (!action.cardId) ruleError("INVALID_SELECTION", "鬼才必须选择一张手牌替换判定牌。");
      const owner = getLivingPlayer(session, action.playerId);
      if (!owner.hand.some((card) => card.id === action.cardId)) ruleError("CARD_NOT_FOUND", "鬼才所选手牌不存在。");
      const emptiedHand = owner.hand.length === 1;
      const adapted = judgmentZoneState(session, pending.frame);
      replaceJudgmentCard(adapted.state, pending.frame, {
        batchId: nextMoveBatchId(session),
        actorId: owner.id,
        skillId: "guicai",
        replacementCardId: action.cardId,
        replacementFrom: { kind: "hand", playerId: owner.id },
        oldCardTo: { kind: "discard" },
      });
      syncJudgmentZones(session, pending.frame, adapted);
      if (emptiedHand) enqueueAfterMoveSkill(session, owner, "lianying");
      addLog(session, "card", `${owner.id} 发动鬼才，以一张手牌替换了最终判定牌。`);
    }
    session.pendingResponse = pending;
    advanceStandardJudgment(session);
    return;
  }
  const post = currentJudgmentPostOpportunity(pending.frame);
  if (!post || post.ownerId !== action.playerId || post.skillId !== "tiandu") {
    ruleError("INVALID_RESPONSE", "当前天妒响应者不匹配。");
  }
  completeJudgmentPostOpportunity(pending.frame, action.playerId, "tiandu");
  session.pendingResponse = { ...pending, tianduClaimed: action.activate };
  if (action.activate) addLog(session, "card", `${action.playerId} 发动天妒，将获得最终生效的判定牌。`);
  advanceStandardJudgment(session);
}

function continueCardUse(session: GameSession, continuation: CardUseContinuation): void {
  const [trigger, ...remainingTriggers] = continuation.remainingTriggers;
  if (trigger) {
    if (trigger.skillId !== "jizhi" || trigger.ownerId !== continuation.intent.sourceId) {
      throw new Error(`不支持的用牌触发 ${trigger.triggerId}。`);
    }
    const promptId = `skill:${trigger.triggerId}`;
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "skill_choice",
      targetId: trigger.ownerId,
      skillId: "jizhi",
      promptId,
      triggerId: trigger.triggerId,
      resume: {
        ...continuation,
        intent: { ...continuation.intent, targetIds: [...continuation.intent.targetIds] },
        remainingTriggers: remainingTriggers.map((candidate) => ({ ...candidate })),
      },
    };
    addLog(session, "card", `${trigger.ownerId} 可以在普通锦囊结算前发动集智。`);
    return;
  }

  if (continuation.stage === "card_use_declared") {
    const eventId = allocateEventId(session);
    const next: CardUseContinuation = {
      type: "card_use",
      intent: { ...continuation.intent, targetIds: [...continuation.intent.targetIds] },
      stage: "targets_confirmed",
      eventId,
      remainingTriggers: triggersForCardUseEvent(session, continuation.intent, "targets_confirmed", eventId),
    };
    continueCardUse(session, next);
    return;
  }

  session.pendingResponse = null;
  session.turn.phase = "play";
  commitCardUseIntent(session, continuation.intent);
}

function startCardUse(session: GameSession, intent: CardUseIntent): void {
  const eventId = allocateEventId(session);
  continueCardUse(session, {
    type: "card_use",
    intent: { ...intent, targetIds: [...intent.targetIds] },
    stage: "card_use_declared",
    eventId,
    remainingTriggers: triggersForCardUseEvent(session, intent, "card_use_declared", eventId),
  });
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
    targetIds: canonicalCardUseTargets(session, player, effectiveKind, action),
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

function applyPlayCard(
  session: GameSession,
  action: Extract<GameAction, { type: "play_card" }>,
): void {
  assertPlayTurn(session, action.playerId);
  const player = getLivingPlayer(session, action.playerId);
  const card = player.hand.find((candidate) => candidate.id === action.cardId);
  if (!card) ruleError("CARD_NOT_FOUND", `手牌中不存在 ${action.cardId}。`);
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

function applyZhangBaSlash(
  session: GameSession,
  action: Extract<GameAction, { type: "use_zhang_ba_slash" }>,
): void {
  assertPlayTurn(session, action.playerId);
  const player = getLivingPlayer(session, action.playerId);
  if (player.equipment.weapon?.kind !== "zhang_ba_she_mao") {
    ruleError("INVALID_CARD", "未装备丈八蛇矛，不能将两张手牌当作杀。");
  }
  if (session.turn.slashUsed && !hasSkill(player, "paoxiao")) {
    ruleError("SLASH_ALREADY_USED", "本出牌阶段已经使用过杀。");
  }
  if (action.cardIds.length !== 2 || new Set(action.cardIds).size !== 2) {
    ruleError("INVALID_CARD", "丈八蛇矛必须选择两张不同的手牌。");
  }
  const target = getLivingPlayer(session, action.targetId);
  if (target.id === player.id || !canBeSlashTarget(target) || !isInSlashRange(session, player.id, target.id)) {
    ruleError("INVALID_TARGET", `${target.id} 不在丈八蛇矛的攻击范围内。`);
  }
  const selected = action.cardIds.map((id) => player.hand.find((card) => card.id === id));
  if (selected.some((card) => !card)) ruleError("CARD_NOT_FOUND", "丈八蛇矛所选手牌已不存在。");
  const cards = selected.map((card) => removeCard(session, player, card!.id));
  session.resolvingCards.push(...cards);
  const color = cards.every(isRedCard) ? "red" : cards.every(isBlackCard) ? "black" : "colorless";
  const damage = 1 + session.turn.slashDamageBonus + luoyiDamageBonus(session, player);
  session.turn.slashUsed = true;
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
    requiredDodgeCount: wushuangResponseCount(player),
    dodgesPlayed: 0,
    remainingTargetIds: [],
    zhuQueChecked: true,
    ciXiongChecked: true,
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
): Card {
  const card = player.equipment[slot];
  if (!card) ruleError("CARD_NOT_FOUND", `${player.id} 的装备区中没有该牌。`);
  delete player.equipment[slot];
  enqueueAfterMoveSkill(session, player, "xiaoji");
  if (card.kind === "bai_yin_shi_zi" && player.alive && player.hp > 0 && player.hp < player.maxHp) {
    player.hp += 1;
    addLog(session, "card", `${player.id} 失去白银狮子，回复了 1 点体力。`);
  }
  return card;
}

function loseAllEquipment(session: GameSession, player: GamePlayer): Card[] {
  const removed: Card[] = [];
  for (const slot of ["weapon", "armor", "offensive_horse", "defensive_horse"] as const) {
    if (player.equipment[slot]) removed.push(loseEquipment(session, player, slot));
  }
  return removed;
}

function removeOwnedCard(session: GameSession, player: GamePlayer, cardId: CardId): Card {
  const handCard = player.hand.find((card) => card.id === cardId);
  if (handCard) return removeCard(session, player, cardId);
  for (const slot of ["weapon", "armor", "offensive_horse", "defensive_horse"] as const) {
    if (player.equipment[slot]?.id === cardId) return loseEquipment(session, player, slot);
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

function withVirtualDelayedCard(
  session: GameSession,
  player: GamePlayer,
  cardId: CardId,
  virtualKind: Extract<CardKind, "le_bu_si_shu">,
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

function requiredResponseForSkill(session: GameSession, player: GamePlayer): "slash" | "dodge" | null {
  const pending = session.pendingResponse;
  if (session.turn.phase !== "respond" || !pending || pending.targetId !== player.id) return null;
  if (pending.type !== "slash" && pending.type !== "duel" && pending.type !== "mass_attack" && pending.type !== "borrowed_sword") {
    return null;
  }
  return responseKind(pending);
}

function applyUseSkill(
  session: GameSession,
  action: Extract<GameAction, { type: "use_skill" }>,
): void {
  const player = getLivingPlayer(session, action.playerId);
  if (!hasSkill(player, action.skillId)) {
    ruleError("INVALID_SKILL", `${player.id} 没有技能 ${action.skillId}。`);
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
    if (!isRedCard(card)) ruleError("INVALID_CARD", "急救只能将一张红色牌当作桃。");
    addLog(session, "card", `${player.id} 发动急救，将一张红色牌当作桃。`);
    withVirtualCard(session, player, cardId, "peach", () => {
      applyResponse(session, { type: "respond", playerId: player.id, cardId });
    });
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
      if (player.hp < player.maxHp) player.hp += 1;
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
    target.hp += 1;
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
    const targetGender = target?.generalId ? getGeneralDefinition(target.generalId).gender : null;
    if (
      !target || target.id === player.id || targetGender !== "male" || target.hp >= target.maxHp ||
      (action.targetIds?.length ?? 0) > 0
    ) {
      ruleError("INVALID_TARGET", "结姻必须指定一名其他受伤男性角色。");
    }
    session.discardPile.push(...cardIds.map((cardId) => removeCard(session, player, cardId)));
    if (player.hp < player.maxHp) player.hp += 1;
    target.hp += 1;
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
      target.generalId &&
      getGeneralDefinition(target.generalId).gender === "male"
    );
    if (!isOtherMale(initiator) || !isOtherMale(originalTarget)) {
      ruleError("INVALID_TARGET", "离间的两个目标都必须是其他存活男性角色。");
    }

    const eventId = allocateEventId(session);
    session.discardPile.push(removeOwnedCard(session, player, cost.id));
    markSkillUsed(session, "lijian");
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "duel",
      attackerId: initiator.id,
      targetId: originalTarget.id,
      cardId: `skill:lijian:${eventId}`,
      initiatorId: initiator.id,
      originalTargetId: originalTarget.id,
      requiredSlashCount: wushuangResponseCount(initiator),
      slashesPlayed: 0,
    };
    addLog(
      session,
      "card",
      `${player.id} 发动离间，弃置${cost.name}，令 ${initiator.id} 视为对 ${originalTarget.id} 使用决斗。`,
    );
    return;
  }

  const cardId = selectedSkillCard(action);
  const card = ownedCard(player, cardId);
  const required = requiredResponseForSkill(session, player);
  const isPlay = session.turn.phase === "play" && session.currentPlayerId === player.id;

  if (action.skillId === "wusheng") {
    if (!isRedCard(card)) ruleError("INVALID_CARD", "武圣只能使用红色牌。");
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
        applyResponse(session, { type: "respond", playerId: player.id, cardId });
      }
    });
    return;
  }

  if (action.skillId === "qingguo") {
    if (!player.hand.some((candidate) => candidate.id === cardId) || !isBlackCard(card)) {
      ruleError("INVALID_CARD", "倾国只能将一张黑色手牌当作闪。");
    }
    if (required !== "dodge") {
      ruleError("INVALID_PHASE", "当前不需要以倾国打出闪。");
    }
    addLog(session, "card", `${player.id} 发动倾国，将一张黑色手牌当作闪。`);
    withVirtualCard(session, player, cardId, "dodge", () => {
      applyResponse(session, { type: "respond", playerId: player.id, cardId });
    });
    return;
  }

  if (action.skillId === "guose") {
    assertPlayTurn(session, player.id);
    if (card.suit !== "diamond") ruleError("INVALID_CARD", "国色只能使用方块牌。");
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
  if (!isBlackCard(card)) ruleError("INVALID_CARD", "奇袭只能使用黑色牌。");
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

  if (revealed.suit !== action.suit) {
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
    continueJudgmentPhase(session);
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

function offerNextAfterMoveSkill(session: GameSession): void {
  const state = session.afterMove;
  if (session.status === "finished") {
    state.queuedTriggers = [];
    state.suspendedPhase = null;
    state.suspendedResponse = null;
    return;
  }
  if (
    session.pendingResponse?.type === "skill_choice" &&
    session.pendingResponse.resume.type === "after_move"
  ) {
    return;
  }

  while (state.queuedTriggers.length > 0) {
    const trigger = state.queuedTriggers.shift()!;
    if (trigger.skillId !== "lianying" && trigger.skillId !== "xiaoji") continue;
    const owner = session.players.find((player) => player.id === trigger.ownerId);
    if (!owner?.alive || !hasSkill(owner, trigger.skillId)) continue;
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
  }
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
  if (!hasSkill(player, action.skillId)) {
    ruleError("INVALID_SKILL", `${player.id} 没有技能 ${action.skillId}。`);
  }
  session.pendingResponse = null;

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

  if (pending.skillId === "luoyi") {
    if (pending.resume.type !== "finish_draw" || pending.resume.playerId !== player.id) {
      throw new Error("裸衣的摸牌阶段续体无效。");
    }
    session.turn.phase = "draw";
    session.turn.luoyiActive = action.activate;
    const drawn = drawCards(session, player, drawPhaseCardCount(session, player, action.activate ? -1 : 0));
    addLog(
      session,
      "card",
      action.activate
        ? `${player.id} 发动裸衣，摸了 ${drawn} 张牌；本回合杀和决斗造成的伤害 +1。`
        : `${player.id} 未发动裸衣，摸了 ${drawn} 张牌。`,
    );
    finishDrawPhase(session, player);
    return;
  }

  if (pending.skillId === "yingzi") {
    if (pending.resume.type !== "finish_draw" || pending.resume.playerId !== player.id) {
      throw new Error("英姿的摸牌阶段续体无效。");
    }
    session.turn.phase = "draw";
    const drawn = drawCards(session, player, drawPhaseCardCount(session, player, action.activate ? 1 : 0));
    addLog(
      session,
      "card",
      action.activate
        ? `${player.id} 发动英姿，摸了 ${drawn} 张牌。`
        : `${player.id} 未发动英姿，摸了 ${drawn} 张牌。`,
    );
    finishDrawPhase(session, player);
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
      continueJudgmentPhase(session);
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
    finishTurn(session, player);
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
  const actor = getLivingPlayer(session, action.playerId);

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

  if (pending.skillId === "tuxi") {
    if (pending.stage !== "tuxi_select") throw new Error("突袭状态无效。");
    if (!action.activate) {
      const drawn = drawCards(session, actor, drawPhaseCardCount(session, actor));
      addLog(session, "card", `${actor.id} 未发动突袭，摸了 ${drawn} 张牌。`);
      finishDrawPhase(session, actor);
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

  if (pending.skillId === "tieqi" && pending.stage === "invoke" && pending.slash) {
    const slash = cloneSlashPending(pending.slash);
    if (!action.activate) {
      addLog(session, "card", `${actor.id} 未对 ${slash.targetId} 发动铁骑。`);
      beginSlashTarget(session, { ...slash, tieqiChecked: true });
      return;
    }
    beginStandardJudgment(
      session,
      actor,
      { type: "skill", id: "tieqi" },
      { color: "red" },
      { type: "tieqi", slash: { ...slash, tieqiChecked: true } },
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
      session.discardPile.push(...cardIds.map((id) => removeCard(session, punished, id)));
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
    finishResolvingCards(session);
    return;
  }
  const attacker = getPlayer(session, pending.attackerId);
  const victim = getPlayer(session, pending.targetId);
  if (
    attacker.alive &&
    victim.alive &&
    attacker.equipment.weapon?.kind === "qi_lin_gong" &&
    (victim.equipment.offensive_horse || victim.equipment.defensive_horse)
  ) {
    session.turn.phase = "respond";
    session.pendingResponse = {
      type: "weapon_action",
      weaponKind: "qi_lin_gong",
      stage: "qilin_discard_horse",
      attackerId: attacker.id,
      targetId: attacker.id,
      victimId: victim.id,
      slash: pending,
    };
    return;
  }
  advanceSlashSequence(session, pending);
}

function beginSlashDamage(
  session: GameSession,
  pending: Extract<PendingResponse, { type: "slash" }>,
): void {
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

function completeSlashDodged(
  session: GameSession,
  pending: Extract<PendingResponse, { type: "slash" }>,
): void {
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
  const slashCardIds = attacker.hand.filter((card) => isSlashCardKind(card.kind)).map((card) => card.id);
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

function responseCard(
  session: GameSession,
  player: GamePlayer,
  cardId: CardId,
  required: "slash" | "dodge",
): Card {
  const card = player.hand.find((candidate) => candidate.id === cardId);
  if (!card) ruleError("CARD_NOT_FOUND", `手牌中不存在 ${cardId}。`);
  const valid = required === "slash" ? isSlashCardKind(card.kind) : card.kind === "dodge";
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
    const cards = selected.map((card) => removeCard(session, player, card!.id));
    const color = cards.every(isRedCard) ? "red" : cards.every(isBlackCard) ? "black" : "colorless";
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
    color: isBlackCard(card) ? "black" : "red",
    name: card.name,
  };
}

function applySlashResponse(
  session: GameSession,
  pending: Extract<PendingResponse, { type: "slash" }>,
  target: GamePlayer,
  cardId: CardId | null | undefined,
): void {
  if (cardId != null) {
    const played = responseCard(session, target, cardId, "dodge");
    session.resolvingCards.push(played);
    const required = pending.requiredDodgeCount ?? 1;
    const dodgesPlayed = (pending.dodgesPlayed ?? 0) + 1;
    const progressed = { ...pending, requiredDodgeCount: required, dodgesPlayed };
    if (dodgesPlayed < required) {
      session.pendingResponse = { ...progressed, armorAttempted: false };
      addLog(session, "card", `${target.id} 打出第 ${dodgesPlayed}/${required} 张闪，仍需继续响应${cardName(pending.slashKind)}。`);
      return;
    }
    addLog(session, "card", `${target.id} 打出 ${required} 张闪，抵消了${cardName(pending.slashKind)}。`);
    completeSlashDodged(session, progressed);
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
      session.pendingResponse = { ...pending, requiredSlashCount: required, slashesPlayed };
      addLog(session, "card", `${target.id} 在决斗中打出第 ${slashesPlayed}/${required} 张杀，仍需继续响应。`);
      return;
    }
    const opponent = getLivingPlayer(session, pending.attackerId);
    session.pendingResponse = {
      ...pending,
      attackerId: target.id,
      targetId: opponent.id,
      requiredSlashCount: wushuangResponseCount(target),
      slashesPlayed: 0,
    };
    addLog(session, "card", `${target.id} 在决斗中打出${response.name}，轮到 ${opponent.id} 响应。`);
    return;
  }

  finishResponse(session);
  const opponent = getLivingPlayer(session, pending.attackerId);
  const enteredDying = dealDamage(
    session,
    target,
    opponent,
    1 + luoyiDamageBonus(session, opponent),
    "normal",
    "在决斗中未出杀",
    { type: "finish_effect" },
    false,
    [pending.cardId],
  );
  if (!enteredDying) finishResolvingCards(session);
}

function advanceMassAttack(
  session: GameSession,
  pending: PendingMassAttackResponse,
): void {
  for (const [index, playerId] of pending.remainingTargetIds.entries()) {
    const candidate = getPlayer(session, playerId);
    if (!candidate.alive || isMassAttackImmune(candidate, pending.cardKind)) continue;
    const nextPending: PendingMassAttackResponse = {
      ...pending,
      targetId: candidate.id,
      remainingTargetIds: pending.remainingTargetIds.slice(index + 1),
      armorAttempted: false,
    };
    beginNullification(session, { type: "mass_attack", pending: nextPending }, pending.cardKind);
    return;
  }
  finishResponse(session);
  finishResolvingCards(session);
  addLog(
    session,
    "card",
    `${pending.cardKind === "barbarian_invasion" ? "南蛮入侵" : "万箭齐发"}结算完毕。`,
  );
  if (session.status === "playing" && !getPlayer(session, session.currentPlayerId).alive) {
    beginNextTurn(session);
  }
}

function applyMassAttackResponse(
  session: GameSession,
  pending: PendingMassAttackResponse,
  target: GamePlayer,
  cardId: CardId | null | undefined,
  cardIds?: readonly CardId[],
): void {
  if (cardId != null || (pending.responseKind === "slash" && cardIds && cardIds.length > 0)) {
    const cards = pending.responseKind === "slash"
      ? playSlashResponseCards(session, target, cardId, cardIds)?.cards
      : cardId != null ? [responseCard(session, target, cardId, "dodge")] : undefined;
    if (!cards) throw new Error("群体锦囊响应牌解析失败。");
    session.resolvingCards.push(...cards);
    addLog(session, "card", `${target.id} 打出${pending.responseKind === "slash" && cards.length === 2 ? "丈八蛇矛转化的杀" : cards[0]!.name}，响应了${cardName(pending.cardKind)}。`);
  } else {
    // A mass attack remains attributable to its source even if that source
    // left or died while another target's dying chain was being resolved.
    const attacker = getPlayer(session, pending.attackerId);
    const enteredDying = dealDamage(
      session,
      target,
      attacker,
      1,
      "normal",
      `未出${pending.responseKind === "slash" ? "杀" : "闪"}，受到${cardName(pending.cardKind)}影响`,
      { type: "mass_attack", pending: { ...pending, remainingTargetIds: [...pending.remainingTargetIds] } },
      false,
      [pending.cardId],
    );
    if (enteredDying) return;
  }

  if (session.status === "playing") advanceMassAttack(session, pending);
  else finishResolvingCards(session);
}

function rescueCardIds(player: GamePlayer, victimId: PlayerId): CardId[] {
  return player.hand
    .filter((card) => card.kind === "peach" || (player.id === victimId && card.kind === "wine"))
    .map((card) => card.id);
}

function resumeOpportunityFreeDamageAfterDying(
  session: GameSession,
  cursor: Extract<DyingResume, { type: "damage_flow" }>,
): void {
  const flow = session.completeRules.damageFlow;
  if (flow.frames.length !== 1) {
    throw new Error("A live game-session dying cursor must identify one root damage frame");
  }
  const frame = flow.frames[0]!;
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
    || frame.callerContinuation === null
  ) {
    throw new Error("Dying cursor does not match the active root damage barrier");
  }

  const victim = getPlayer(session, barrier.targetId);
  const outcome = victim.alive && victim.hp > 0
    ? "rescued"
    : !victim.alive && victim.hp <= 0
      ? "dead"
      : null;
  if (outcome === null) {
    throw new Error("Ordinary game-session dying resolution left an invalid life state");
  }

  session.completeRules.damageFlow = resumeDamageAfterDyingFlow(flow, lifePlayerSnapshot(session), {
    frameId: cursor.frameId,
    dyingId: cursor.dyingId,
    expectedRevision: flow.revision,
    outcome,
  });
  session.pendingResponse = null;
  const continuation = finishOpportunityFreeDamageFlow(session, cursor.frameId);
  if (continuation === null) {
    throw new Error(`Damage flow ${cursor.damageId} lost its caller continuation`);
  }
  resumeAfterDying(session, decodeGameDamageContinuation(continuation));
}

function resumeAfterDying(session: GameSession, resume: DyingResume): void {
  // DamageFlow must close even when death already established a winner. Only
  // the restored business continuation observes the finished-game shortcut.
  if (resume.type === "damage_flow") {
    resumeOpportunityFreeDamageAfterDying(session, resume);
    return;
  }
  if (session.status === "finished") {
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
  if (resume.type === "standard_damage") {
    const victim = getPlayer(session, resume.aftermath.targetId);
    if (victim.alive) continueDamageAftermath(session, resume.aftermath);
    else resumeAfterDying(session, resume.aftermath.resume);
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
  const victim = getPlayer(session, pending.victimId);
  const source = pending.damageSourceId === null ? null : getPlayer(session, pending.damageSourceId);
  killPlayer(session, victim, source);
  resumeAfterDying(session, pending.resume);
}

function advanceDyingResponder(session: GameSession, pending: PendingDyingResponse): void {
  for (const [index, playerId] of pending.remainingResponderIds.entries()) {
    const candidate = getPlayer(session, playerId);
    if (!candidate.alive) continue;
    session.pendingResponse = {
      ...pending,
      targetId: candidate.id,
      remainingResponderIds: pending.remainingResponderIds.slice(index + 1),
    };
    return;
  }
  failDyingRescue(session, pending);
}

function applyDyingResponse(
  session: GameSession,
  pending: PendingDyingResponse,
  responder: GamePlayer,
  cardId: CardId | null | undefined,
): void {
  const victim = getPlayer(session, pending.victimId);
  if (cardId == null) {
    advanceDyingResponder(session, pending);
    return;
  }
  const card = responder.hand.find((candidate) => candidate.id === cardId);
  if (!card) ruleError("CARD_NOT_FOUND", `手牌中不存在 ${cardId}。`);
  const allowed = card.kind === "peach" || (responder.id === victim.id && card.kind === "wine");
  if (!allowed) ruleError("INVALID_RESPONSE", "濒死救援只能使用桃；濒死者本人也可以使用酒。 ");
  session.resolvingCards.push(removeCard(session, responder, card.id));
  const jiuyuanBonus =
    card.kind === "peach" &&
    responder.id !== victim.id &&
    victim.role === "lord" &&
    hasEffectiveSkill(session, victim, "jiuyuan") &&
    responder.generalId !== null &&
    getGeneralDefinition(responder.generalId).faction === "wu"
      ? 1
      : 0;
  victim.hp += 1 + jiuyuanBonus;
  if (jiuyuanBonus > 0) addLog(session, "card", `${victim.id} 的救援令此次桃额外回复 1 点体力。`);
  addLog(
    session,
    "card",
    `${responder.id} 对濒死的 ${victim.id} 使用${card.name}，其体力回复至 ${victim.hp}。`,
  );
  if (victim.hp > 0) {
    addLog(session, "card", `${victim.id} 脱离濒死状态。`);
    resumeAfterDying(session, pending.resume);
    return;
  }
  if (rescueCardIds(responder, victim.id).length === 0) {
    advanceDyingResponder(session, pending);
  }
}

function applyResponse(
  session: GameSession,
  action: Extract<GameAction, { type: "respond" }>,
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
    applySlashResponse(session, pending, target, action.cardId);
  } else if (pending.type === "duel") {
    applyDuelResponse(session, pending, target, action.cardId, action.cardIds);
  } else if (pending.type === "mass_attack") {
    applyMassAttackResponse(session, pending, target, action.cardId, action.cardIds);
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
        advanceSlashSequence(session, pending.slash);
        return;
      }
      if (cardIds.length !== 2 || new Set(cardIds).size !== 2) {
        ruleError("INVALID_DISCARD", "发动贯石斧必须弃置两张不同的牌。");
      }
      const discarded = cardIds.map((cardId) => removeOwnedCard(session, attacker, cardId));
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
      if (!selected || !isSlashCardKind(selected.kind)) ruleError("INVALID_RESPONSE", "所选牌不是可用的杀。");
      const played = moveCardToResolving(session, attacker, selected.id);
      const slashKind = played.kind as Extract<CardKind, "slash" | "fire_slash" | "thunder_slash">;
      const slash = {
        ...pending.slash,
        cardId: played.id,
        slashKind,
        damage: 1,
        nature: damageNatureForSlash(slashKind),
        color: isBlackCard(played) ? "black" as const : "red" as const,
        armorAttempted: false,
        armorIgnored: false,
        requiredDodgeCount: wushuangResponseCount(attacker),
        dodgesPlayed: 0,
        zhuQueChecked: false,
        ciXiongChecked: false,
      };
      addLog(session, "card", `${attacker.id} 发动青龙偃月刀，对 ${victim.id} 追加使用${played.name}。`);
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
  if (required !== "dodge" || pending.armorAttempted || player.equipment.armor?.kind !== "ba_gua_zhen") {
    ruleError("INVALID_RESPONSE", "当前不能发动八卦阵。");
  }
  if (!action.activate) {
    session.pendingResponse = { ...pending, armorAttempted: true };
    return;
  }
  beginStandardJudgment(
    session,
    player,
    { type: "armor", id: "ba_gua_zhen" },
    { color: "red" },
    { type: "armor", pending },
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
  session.discardPile.push(...discarded);
  addLog(
    session,
    "card",
    `${player.id} 弃置了 ${discarded.length} 张牌：${discarded
      .map((card) => card.name)
      .join("、")}。`,
  );
  if (session.turn.discardStage === "yongsi") {
    enterHandLimitDiscardOrEnd(session, player);
  } else {
    enterEndPhase(session);
  }
}

export function applyAction(session: GameSession, action: GameAction): GameSession {
  if (session.status === "finished") {
    ruleError("GAME_FINISHED", "游戏已经结束。");
  }
  // Validate the actor before cloning so malformed actions fail consistently.
  getLivingPlayer(session, action.playerId);
  const next = cloneSession(session);
  switch (action.type) {
    case "play_card":
      applyPlayCard(next, action);
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
  return next;
}

function discardAbandonedResponseCards(session: GameSession): void {
  const pending = session.pendingResponse?.type === "skill_choice" &&
    session.pendingResponse.resume.type === "after_move"
    ? session.afterMove.suspendedResponse
    : session.pendingResponse;
  if (pending?.type === "amazing_grace_selection") {
    session.discardPile.push(...pending.pool);
  } else if (pending?.type === "nullification" && pending.effect.type === "amazing_grace") {
    session.discardPile.push(...pending.effect.pool);
  }
  session.pendingResponse = null;
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
function restoreSuspendedDyingForForfeit(session: GameSession): void {
  if (session.pendingResponse?.type !== "skill_choice"
    || session.pendingResponse.resume.type !== "after_move"
    || session.afterMove.suspendedResponse?.type !== "dying"
  ) return;
  session.pendingResponse = clonePendingResponse(session.afterMove.suspendedResponse);
  session.afterMove.queuedTriggers = [];
  session.afterMove.suspendedPhase = null;
  session.afterMove.suspendedResponse = null;
  session.turn.phase = "respond";
}

function resumeAfterForfeit(session: GameSession, forfeiterId: PlayerId): void {
  restoreSuspendedDyingForForfeit(session);
  const pending = session.pendingResponse;

  // Dying is the one response chain that cannot be cancelled wholesale: a
  // different victim may already be at zero HP. Skip a departed rescuer, or
  // resume the interrupted effect directly when the victim themself leaves.
  if (pending?.type === "dying") {
    if (pending.victimId === forfeiterId) {
      session.pendingResponse = null;
      resumeAfterDying(session, pending.resume);
    } else if (pending.targetId === forfeiterId) {
      advanceDyingResponder(session, pending);
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
  const next = cloneSession(session);
  const forfeiter = getLivingPlayer(next, playerId);
  const forfeitedHand = removeAllHandCards(next, forfeiter);
  if (forfeitedHand.length > 0) next.discardPile.push(...forfeitedHand);
  const forfeitedEquipment = loseAllEquipment(next, forfeiter);
  if (forfeitedEquipment.length > 0) next.discardPile.push(...forfeitedEquipment);
  if (forfeiter.judgment.length > 0) {
    next.discardPile.push(...forfeiter.judgment.map((card) => restoreVirtualOrigin(next, card)));
  }
  forfeiter.judgment = [];
  forfeiter.chained = false;
  forfeiter.alive = false;
  forfeiter.hp = 0;
  addLog(
    next,
    "death",
    `${forfeiter.id} 离席并被判定出局，身份是${roleName(forfeiter.role)}。`,
  );

  restoreSuspendedDyingForForfeit(next);
  const winner = winnerFor(next);
  if (winner) {
    const dying = next.pendingResponse?.type === "dying"
      ? clonePendingResponse(next.pendingResponse)
      : null;
    if (dying?.type === "dying") {
      next.pendingResponse = null;
      const victim = getPlayer(next, dying.victimId);
      if (victim.alive) {
        const source = dying.damageSourceId === null ? null : getPlayer(next, dying.damageSourceId);
        killPlayer(next, victim, source);
      }
      if (next.status !== "finished") finishWithWinner(next, winnerFor(next) ?? winner);
      // The internal damage-flow branch runs before the finished-game shortcut,
      // then its decoded business continuation observes the final winner.
      resumeAfterDying(next, dying.resume);
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
  const slashTargets = targets.filter((targetId) => {
    const target = getLivingPlayer(session, targetId);
    return canBeSlashTarget(target) && isInSlashRange(session, viewer.id, targetId);
  });
  const cards: PlayableCardHint[] = [];
  for (const card of viewer.hand) {
    if (isSlashCardKind(card.kind)) {
      if (
        !session.turn.slashUsed ||
        viewer.equipment.weapon?.kind === "zhu_ge_lian_nu" ||
        hasSkill(viewer, "paoxiao")
      ) {
        cards.push({
          cardId: card.id,
          kind: card.kind,
          targetMode: viewer.equipment.weapon?.kind === "fang_tian_hua_ji" && viewer.hand.length === 1
            ? "up-to-three"
            : "single-other",
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
          targetIds: targets.filter((targetId) => canBeDuelTarget(getLivingPlayer(session, targetId))),
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
            return canBeQianxunTarget(target) && !target.judgment.some((delayed) => delayed.kind === card.kind);
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
            return (hasSkill(viewer, "qicai") || distanceBetweenPlayers(session, viewer.id, targetId) <= 1) &&
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
            return canBeQianxunTarget(target) &&
              (hasSkill(viewer, "qicai") || distanceBetweenPlayers(session, viewer.id, targetId) <= 1) &&
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
              return attackTargetId !== holderId && canBeSlashTarget(attackTarget) &&
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
  return !session.turn.slashUsed || player.equipment.weapon?.kind === "zhu_ge_lian_nu" || hasSkill(player, "paoxiao");
}

function slashTargetsAfterSkillCost(session: GameSession, playerId: PlayerId, cardId: CardId): PlayerId[] {
  const hypothetical = cloneSession(session);
  const player = getLivingPlayer(hypothetical, playerId);
  removeOwnedCard(hypothetical, player, cardId);
  return hypothetical.players
    .filter((target) => target.alive && target.id !== player.id && canBeSlashTarget(target) &&
      isInSlashRange(hypothetical, player.id, target.id))
    .map((target) => target.id);
}

function playableSkills(session: GameSession, viewer: GamePlayer): PlayableSkillHint[] {
  const skills: PlayableSkillHint[] = [];
  const targets = session.players.filter((player) => player.alive && player.id !== viewer.id);

  if (
    hasEffectiveSkill(session, viewer, "jijiang") &&
    canUseAnotherSlash(session, viewer) &&
    lordDispatchProviders(session, viewer, "jijiang").length > 0
  ) {
    const targetIds = targets
      .filter((target) => canBeSlashTarget(target) && isInSlashRange(session, viewer.id, target.id))
      .map((target) => target.id);
    if (targetIds.length > 0) {
      skills.push({
        skillId: "jijiang",
        cardIds: [],
        minCards: 0,
        maxCards: 0,
        targetMode: "single-other",
        targetIds,
        virtualCardKind: "slash",
      });
    }
  }

  if (hasSkill(viewer, "wusheng") && canUseAnotherSlash(session, viewer)) {
    const cardIds = ownedCards(viewer).filter(isRedCard).map((card) => card.id);
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
        targetMode: "single-other",
        targetIds,
        cardTargetIds,
        virtualCardKind: "slash",
      });
    }
  }

  if (hasSkill(viewer, "longdan") && canUseAnotherSlash(session, viewer)) {
    const cardIds = viewer.hand.filter((card) => card.kind === "dodge").map((card) => card.id);
    const targetIds = targets
      .filter((target) => canBeSlashTarget(target) && isInSlashRange(session, viewer.id, target.id))
      .map((target) => target.id);
    if (cardIds.length > 0 && targetIds.length > 0) {
      skills.push({
        skillId: "longdan",
        cardIds,
        minCards: 1,
        maxCards: 1,
        targetMode: "single-other",
        targetIds,
        virtualCardKind: "slash",
      });
    }
  }

  if (hasSkill(viewer, "qixi")) {
    const cardIds = ownedCards(viewer).filter(isBlackCard).map((card) => card.id);
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

  if (hasSkill(viewer, "zhiheng") && skillUseCount(session, "zhiheng") === 0) {
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

  if (hasSkill(viewer, "rende") && viewer.hand.length > 0 && targets.length > 0) {
    skills.push({
      skillId: "rende",
      cardIds: viewer.hand.map((card) => card.id),
      minCards: 1,
      maxCards: viewer.hand.length,
      targetMode: "single-other",
      targetIds: targets.map((target) => target.id),
    });
  }

  if (hasSkill(viewer, "qingnang") && skillUseCount(session, "qingnang") === 0 && viewer.hand.length > 0) {
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

  if (hasSkill(viewer, "jieyin") && skillUseCount(session, "jieyin") === 0 && viewer.hand.length >= 2) {
    const targetIds = targets
      .filter((target) => target.hp < target.maxHp && target.generalId && getGeneralDefinition(target.generalId).gender === "male")
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

  if (hasSkill(viewer, "guose")) {
    const cardIds = ownedCards(viewer).filter((card) => card.suit === "diamond").map((card) => card.id);
    const targetIds = targets
      .filter((target) => canBeQianxunTarget(target) && !target.judgment.some((card) => card.kind === "le_bu_si_shu"))
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

  if (hasSkill(viewer, "fanjian") && skillUseCount(session, "fanjian") === 0 && viewer.hand.length > 0 && targets.length > 0) {
    skills.push({
      skillId: "fanjian",
      cardIds: [],
      minCards: 0,
      maxCards: 0,
      targetMode: "single-other",
      targetIds: targets.map((target) => target.id),
    });
  }

  if (hasSkill(viewer, "lijian") && skillUseCount(session, "lijian") === 0) {
    const cardIds = ownedCards(viewer).map((card) => card.id);
    const maleTargets = targets.filter((target) =>
      target.generalId !== null && getGeneralDefinition(target.generalId).gender === "male"
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

  if (hasSkill(viewer, "kurou")) {
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

function responseSkillHints(viewer: GamePlayer, required: "slash" | "dodge"): SkillResponseHint[] {
  const hints: SkillResponseHint[] = [];
  if (required === "slash" && hasSkill(viewer, "wusheng")) {
    const cardIds = ownedCards(viewer).filter(isRedCard).map((card) => card.id);
    if (cardIds.length > 0) hints.push({ skillId: "wusheng", cardIds, responseKind: "slash" });
  }
  if (hasSkill(viewer, "longdan")) {
    const cardIds = required === "slash"
      ? viewer.hand.filter((card) => card.kind === "dodge").map((card) => card.id)
      : viewer.hand.filter((card) => isSlashCardKind(card.kind)).map((card) => card.id);
    if (cardIds.length > 0) hints.push({ skillId: "longdan", cardIds, responseKind: required });
  }
  if (required === "dodge" && hasSkill(viewer, "qingguo")) {
    const cardIds = viewer.hand.filter(isBlackCard).map((card) => card.id);
    if (cardIds.length > 0) hints.push({ skillId: "qingguo", cardIds, responseKind: "dodge" });
  }
  return hints;
}

function dyingSkillHints(session: GameSession, viewer: GamePlayer): SkillResponseHint[] {
  if (!hasSkill(viewer, "jijiu") || session.currentPlayerId === viewer.id) return [];
  const cardIds = ownedCards(viewer).filter(isRedCard).map((card) => card.id);
  return cardIds.length > 0 ? [{ skillId: "jijiu", cardIds, responseKind: "peach" }] : [];
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
  if (!viewer?.alive) return { type: "waiting" };

  if (session.turn.phase === "play" && session.currentPlayerId === viewer.id) {
    const zhangBaSlash = viewer.equipment.weapon?.kind === "zhang_ba_she_mao" &&
      (!session.turn.slashUsed || hasSkill(viewer, "paoxiao")) && viewer.hand.length >= 2
      ? {
          allowedCardIds: viewer.hand.map((card) => card.id),
          targetIds: session.players
            .filter((player) => player.alive && player.id !== viewer.id && canBeSlashTarget(player) &&
              isInSlashRange(session, viewer.id, player.id))
            .map((player) => player.id),
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

  const pending = session.pendingResponse;
  if (session.turn.phase === "respond" && pending?.targetId === viewer.id) {
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
      const skillId: StandardImplementedSkillId = retrial ? "guicai" : "tiandu";
      return {
        type: "standard_skill",
        playerId: viewer.id,
        skillId,
        stage: retrial ? "judgment_retrial" : "judgment_post",
        promptId: pending.promptId,
        canPass: true,
        cards: [],
        allowedCardIds: retrial ? viewer.hand.map((card) => card.id) : [],
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
      let choices: Array<{ token: string; ownerId: PlayerId; zone: "hand" | "equipment"; card: Card | null }> | undefined;
      let cardTargetIds: Record<CardId, PlayerId[]> | undefined;
      let canPass = pending.stage === "invoke" || pending.stage === "tuxi_select" || pending.stage === "liuli_redirect";
      if (pending.skillId === "guanxing" && pending.stage === "guanxing_reorder") {
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
      } else if (pending.skillId === "yiji" && pending.stage === "yiji_distribute") {
        cards = Object.values(viewer.extraPiles).flat().filter((card) => pending.selectedCardIds?.includes(card.id)).map(cloneCard);
        allowedCardIds = cards.map((card) => card.id);
        targetIds = session.players.filter((player) => player.alive).map((player) => player.id);
        minCards = cards.length;
        maxCards = cards.length;
        minTargets = 1;
        maxTargets = cards.length;
        canPass = false;
      } else if (pending.skillId === "fankui" && pending.stage === "fankui_select" && pending.aftermath?.sourceId) {
        const source = getPlayer(session, pending.aftermath.sourceId);
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
        ...(choices ? { choices } : {}),
        ...(cardTargetIds ? { cardTargetIds } : {}),
      };
    }
    if (pending.type === "lord_dispatch") {
      const allowedCardIds = viewer.hand
        .filter((card) => pending.responseKind === "dodge" ? card.kind === "dodge" : isSlashCardKind(card.kind))
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
          ? viewer.hand.filter((card) => isSlashCardKind(card.kind)).map((card) => card.id)
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
        allowedCardIds: viewer.hand.filter((card) => card.suit === revealedCard.suit).map((card) => card.id),
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
        allowedCardIds: viewer.hand.filter((card) => card.kind === "wu_xie_ke_ji").map((card) => card.id),
        canPass: true,
      };
    }
    if (
      (pending.type === "slash" || (pending.type === "mass_attack" && pending.responseKind === "dodge")) &&
      !(pending.type === "slash" && pending.armorIgnored) &&
      !pending.armorAttempted &&
      viewer.equipment.armor?.kind === "ba_gua_zhen"
    ) {
      return {
        type: "armor",
        playerId: viewer.id,
        armorKind: "ba_gua_zhen",
        requiredCount: pending.type === "slash" ? pending.requiredDodgeCount ?? 1 : 1,
        respondedCount: pending.type === "slash" ? pending.dodgesPlayed ?? 0 : 0,
        canPass: true,
      };
    }
    if (pending.type === "dying") {
      const peachCardIds = viewer.hand.filter((card) => card.kind === "peach").map((card) => card.id);
      const wineCardIds = viewer.id === pending.victimId
        ? viewer.hand.filter((card) => card.kind === "wine").map((card) => card.id)
        : [];
      return {
        type: "dying",
        playerId: viewer.id,
        victimId: pending.victimId,
        allowedCardIds: [...peachCardIds, ...wineCardIds],
        peachCardIds,
        wineCardIds,
        skillResponses: dyingSkillHints(session, viewer),
        canPass: true,
      };
    }
    const required = responseKind(pending);
    const dodgeCardIds =
      required === "dodge"
        ? viewer.hand.filter((card) => card.kind === "dodge").map((card) => card.id)
        : [];
    const slashCardIds =
      required === "slash"
        ? viewer.hand.filter((card) => isSlashCardKind(card.kind)).map((card) => card.id)
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
      skillResponses: responseSkillHints(viewer, required),
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
  if (pending?.type === "standard_judgment" && pending.frame.cardId) {
    const card = session.resolvingCards.find((candidate) => candidate.id === pending.frame.cardId);
    return card ? [cloneCard(card)] : [];
  }
  return [];
}

export function getGameView(session: GameSession, viewerId: PlayerId | null): GameView {
  return {
    version: 1,
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
      chained: player.chained ?? false,
      role:
        player.id === viewerId ||
        player.role === "lord" ||
        !player.alive ||
        session.status === "finished"
          ? player.role
          : null,
      general: player.generalId ? (() => {
        const general = getGeneralDefinition(player.generalId);
        return { id: general.id, name: general.name, faction: general.faction, gender: general.gender };
      })() : null,
      effectiveSkillIds: getEffectiveGeneralSkillIds(session, player.id),
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
