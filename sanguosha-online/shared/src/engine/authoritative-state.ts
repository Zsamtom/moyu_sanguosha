import type { Card, CardId, EquipmentSlot, PlayerId } from "../types.js";
import {
  assertCardUseFrame,
  cloneCardUseFrame,
  type CardUseFrame,
} from "./card-use.js";
import {
  assertDamageInstance,
  cloneDamageInstance,
  type DamageInstance,
  type LifePlayerState,
} from "./damage.js";
import {
  assertDeathStack,
  cloneDeathFrame,
  type DeathFrame,
} from "./death.js";
import {
  assertDyingStack,
  cloneDyingFrame,
  type DyingFrame,
} from "./dying.js";
import {
  GAME_EVENT_TYPES,
  createGameEvent,
  type GameEvent,
} from "./events.js";
import {
  assertJudgmentFrame,
  cloneJudgmentFrame,
  type JudgmentFrame,
} from "./judgment.js";
import {
  assertPindianFrame,
  clonePindianFrame,
  type PindianFrame,
} from "./pindian.js";
import {
  assertResolutionStack,
  cloneJsonObject,
  cloneResolutionStack,
  type ResolutionFrameKind,
  type ResolutionStack,
} from "./resolution.js";
import {
  assertCompleteRulesEngineState,
  cloneCompleteRulesEngineState,
  createCompleteRulesEngineState,
  type CompleteRulesEngineState,
} from "./state.js";
import {
  assertCardConservation,
  commitMoveBatch as commitAtomicMoveBatch,
  type AtomicZoneState,
  type MoveIntent,
  type MoveRecord,
  type ZonePlayerState,
  type ZoneRef,
} from "./zones.js";

export interface AuthoritativeEngineState {
  readonly rootKind: "authoritative_engine_state";
  /** Increments exactly once after a whole root transaction commits. */
  commitVersion: number;
  /** The complete rules tree is one explicit root branch and owns all counters. */
  completeRules: CompleteRulesEngineState;
  zones: AtomicZoneState;
  /** Append-only server history. Viewer projection exposes only a cursor. */
  events: GameEvent[];
  /** First event ID retained after migration/history compaction. */
  readonly eventHistoryBaseId: number;
  /** Append-only authoritative movement history. */
  moveRecords: MoveRecord[];
  /** First move-batch ID retained after migration/history compaction. */
  readonly moveHistoryBaseBatchId: number;
  /** Domain frames whose secret selections must never be read from resolution payloads. */
  pindianFrames: PindianFrame[];
  /** Typed card-use domains linked one-to-one with resolution card_use frames. */
  cardUseFrames: CardUseFrame[];
  /** Typed judgment domains linked one-to-one with resolution judgment frames. */
  judgmentFrames: JudgmentFrame[];
  /** Authoritative HP/death state; IDs exactly match the zone-player domain. */
  lifePlayers: LifePlayerState[];
  /** Typed damage domains linked one-to-one with resolution damage frames. */
  damageFrames: DamageInstance[];
  /** Typed same-kind dying stack linked one-to-one with resolution dying frames. */
  dyingFrames: DyingFrame[];
  /** Typed same-kind death stack linked one-to-one with resolution death frames. */
  deathFrames: DeathFrame[];
  /** Immutable conservation baseline for every physical card in this game. */
  readonly physicalCardIds: readonly CardId[];
}

export interface CreateAuthoritativeEngineStateInput {
  readonly zones: AtomicZoneState;
  readonly completeRulesState?: CompleteRulesEngineState;
  readonly events?: readonly GameEvent[];
  readonly moveRecords?: readonly MoveRecord[];
  readonly pindianFrames?: readonly PindianFrame[];
  readonly cardUseFrames?: readonly CardUseFrame[];
  /**
   * Optional only at the migration boundary. A pre-v2 snapshot with no active
   * judgment becomes an empty list; an active resolution judgment still needs
   * an explicit typed frame and is rejected instead of being guessed.
   */
  readonly judgmentFrames?: readonly JudgmentFrame[];
  /**
   * Required whenever any damage/dying/death typed or resolution frame exists.
   * The only compatibility default is for a pre-life-domain snapshot with no
   * such frames: every zone player starts hp=maxHp=1 and alive=true.
   */
  readonly lifePlayers?: readonly LifePlayerState[];
  /** v1 damage snapshots must first pass through migrateDamageInstance(). */
  readonly damageFrames?: readonly DamageInstance[];
  /** Legacy dying snapshots must first pass through migrateDyingFrame(). */
  readonly dyingFrames?: readonly DyingFrame[];
  readonly deathFrames?: readonly DeathFrame[];
}

export interface AuthoritativeTransactionTools {
  /** Allocates an event ID from completeRules and appends one server event. */
  emitEvent(input: Omit<GameEvent, "eventId">): GameEvent;
  /** Allocates one batch ID, commits the atomic move, and records its provenance. */
  commitMoves(intents: readonly MoveIntent[]): readonly MoveRecord[];
  /**
   * Runs a domain move helper that owns its own atomic move call (for example,
   * selectPindianCard), then records the returned records under one allocated ID.
   */
  recordMoveTransition(
    transition: (batchId: number) => readonly MoveRecord[],
  ): readonly MoveRecord[];
  /** Allocates one damage ID from the same complete-rules counter tree. */
  allocateDamageId(): number;
}

export interface ExpectedResolutionTop {
  readonly frameId: number;
  readonly kind: ResolutionFrameKind;
}

export interface AuthoritativeTransactionSpec<Result> {
  readonly expectedCommitVersion: number;
  readonly domainTransition: (
    draft: AuthoritativeEngineState,
    tools: AuthoritativeTransactionTools,
  ) => Result;
  /** Receives an isolated resolution clone only after the domain transition succeeds. */
  readonly resolutionTransition: (
    resolution: ResolutionStack,
    domainResult: Result,
  ) => ResolutionStack;
  /**
   * Required cross-domain postcondition. Supplying null requires an empty stack;
   * supplying a descriptor requires that exact frame and kind at stack top.
   */
  readonly expectedResolutionTop:
    | ExpectedResolutionTop
    | null
    | ((domainResult: Result) => ExpectedResolutionTop | null);
}

export interface AuthoritativeTransactionResult<Result> {
  readonly state: AuthoritativeEngineState;
  readonly result: Result;
}

export class AuthoritativeEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthoritativeEngineError";
  }
}

const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = [
  "weapon",
  "armor",
  "offensive_horse",
  "defensive_horse",
];

const MOVE_VISIBILITIES = new Set(["public", "owner", "source_and_target", "server_only"]);
const MOVE_REASONS = new Set([
  "draw",
  "use",
  "respond",
  "discard",
  "gain",
  "give",
  "steal",
  "equip",
  "replace_equipment",
  "judgment",
  "retrial",
  "pindian",
  "death",
  "skill_cost",
  "skill_effect",
  "recast",
  "deck_reorder",
]);
const GAME_EVENT_TYPE_SET = new Set<string>(GAME_EVENT_TYPES);

function cloneCard(card: Card): Card {
  return { ...card };
}

function cloneLifePlayer(player: LifePlayerState): LifePlayerState {
  return { ...player };
}

function cloneZoneRef(zone: ZoneRef): ZoneRef {
  return { ...zone } as ZoneRef;
}

function cloneZoneState(state: AtomicZoneState): AtomicZoneState {
  return {
    deck: state.deck.map(cloneCard),
    discard: state.discard.map(cloneCard),
    processing: Object.fromEntries(
      Object.entries(state.processing).map(([frameId, cards]) => [frameId, cards.map(cloneCard)]),
    ),
    players: state.players.map((player): ZonePlayerState => ({
      id: player.id,
      hand: player.hand.map(cloneCard),
      equipment: Object.fromEntries(
        EQUIPMENT_SLOTS.flatMap((slot) => {
          const card = player.equipment[slot];
          return card ? [[slot, cloneCard(card)]] : [];
        }),
      ) as ZonePlayerState["equipment"],
      judgment: player.judgment.map(cloneCard),
      extraPiles: Object.fromEntries(
        Object.entries(player.extraPiles).map(([pileId, cards]) => [pileId, cards.map(cloneCard)]),
      ),
    })),
  };
}

function cloneMoveRecord(record: MoveRecord): MoveRecord {
  return {
    ...record,
    from: cloneZoneRef(record.from),
    to: cloneZoneRef(record.to),
    cardIds: [...record.cardIds],
    cards: record.cards.map(cloneCard),
  };
}

function cloneGameEvent(event: GameEvent): GameEvent {
  return {
    ...event,
    targetIds: [...event.targetIds],
    payload: cloneJsonObject(event.payload),
  };
}

function allZoneCards(state: AtomicZoneState): readonly Card[] {
  return [
    ...state.deck,
    ...state.discard,
    ...Object.values(state.processing).flat(),
    ...state.players.flatMap((player) => [
      ...player.hand,
      ...Object.values(player.equipment),
      ...player.judgment,
      ...Object.values(player.extraPiles).flat(),
    ]),
  ];
}

function assertCard(card: Card, label: string): void {
  if (!card || typeof card !== "object" || !card.id || !card.kind || !card.name) {
    throw new AuthoritativeEngineError(`${label} is not a complete card`);
  }
  if (card.category !== "basic" && card.category !== "trick" && card.category !== "equipment") {
    throw new AuthoritativeEngineError(`${label} has an invalid category`);
  }
  if (card.suit !== "spade" && card.suit !== "heart" && card.suit !== "club" && card.suit !== "diamond") {
    throw new AuthoritativeEngineError(`${label} has an invalid suit`);
  }
  if (!Number.isSafeInteger(card.rank) || card.rank < 1 || card.rank > 13) {
    throw new AuthoritativeEngineError(`${label} has an invalid rank`);
  }
}

function assertMoveRecords(state: AuthoritativeEngineState): void {
  const physicalIds = new Set(state.physicalCardIds);
  positive(state.moveHistoryBaseBatchId, "moveHistoryBaseBatchId");
  let previousBatchId = state.moveHistoryBaseBatchId - 1;
  const cardsByBatch = new Map<number, Set<CardId>>();
  for (const [index, record] of state.moveRecords.entries()) {
    if (
      !Number.isSafeInteger(record.batchId) ||
      record.batchId <= 0 ||
      (index === 0 && record.batchId !== state.moveHistoryBaseBatchId) ||
      (record.batchId !== previousBatchId && record.batchId !== previousBatchId + 1)
    ) {
      throw new AuthoritativeEngineError(`moveRecords[${index}] has an invalid batch order`);
    }
    previousBatchId = record.batchId;
    if (record.cardIds.length === 0 || record.cardIds.length !== record.cards.length) {
      throw new AuthoritativeEngineError(`moveRecords[${index}] has mismatched cards`);
    }
    if (!MOVE_VISIBILITIES.has(record.visibility) || !MOVE_REASONS.has(record.reason)) {
      throw new AuthoritativeEngineError(`moveRecords[${index}] has invalid metadata`);
    }
    const seenInBatch = cardsByBatch.get(record.batchId) ?? new Set<CardId>();
    for (const [cardIndex, cardId] of record.cardIds.entries()) {
      const card = record.cards[cardIndex];
      if (!card || card.id !== cardId || !physicalIds.has(cardId) || seenInBatch.has(cardId)) {
        throw new AuthoritativeEngineError(`moveRecords[${index}] has invalid card provenance`);
      }
      assertCard(card, `moveRecords[${index}].cards[${cardIndex}]`);
      seenInBatch.add(cardId);
    }
    cardsByBatch.set(record.batchId, seenInBatch);
  }
  if (state.completeRules.nextMoveBatchId !== previousBatchId + 1) {
    throw new AuthoritativeEngineError("nextMoveBatchId does not follow recorded batches");
  }
}

function positive(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new AuthoritativeEngineError(`${label} must be a positive integer`);
  }
}

function assertOptionalPositiveId(value: number | null, label: string): void {
  if (value !== null && (!Number.isSafeInteger(value) || value <= 0)) {
    throw new AuthoritativeEngineError(`${label} must be null or a positive integer`);
  }
}

function sameOrderedIds(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function sameCardIdSet(left: readonly CardId[], right: readonly CardId[]): boolean {
  return left.length === right.length && left.every((id) => right.includes(id));
}

function assertKnownPlayer(
  playerIds: ReadonlySet<PlayerId>,
  playerId: PlayerId | null,
  label: string,
): void {
  if (playerId !== null && !playerIds.has(playerId)) {
    throw new AuthoritativeEngineError(`${label} references an unknown player`);
  }
}

function assertLifePlayers(state: AuthoritativeEngineState): void {
  const zonePlayerIds = state.zones.players.map((player) => player.id);
  const lifePlayerIds = state.lifePlayers.map((player) => player.id);
  if (
    lifePlayerIds.some((id) => !id) ||
    new Set(lifePlayerIds).size !== lifePlayerIds.length ||
    zonePlayerIds.length !== lifePlayerIds.length ||
    zonePlayerIds.some((id) => !lifePlayerIds.includes(id))
  ) {
    throw new AuthoritativeEngineError("life-player IDs must exactly match zone-player IDs");
  }
  for (const [index, player] of state.lifePlayers.entries()) {
    if (
      !Number.isSafeInteger(player.hp) ||
      !Number.isSafeInteger(player.maxHp) ||
      player.maxHp <= 0 ||
      player.hp > player.maxHp ||
      typeof player.alive !== "boolean" ||
      (!player.alive && player.hp > 0)
    ) {
      throw new AuthoritativeEngineError(`lifePlayers[${index}] has an invalid life state`);
    }
  }
}

function resolutionFrameIds(
  state: AuthoritativeEngineState,
  kind: ResolutionFrameKind,
): number[] {
  return state.completeRules.resolution.frames
    .filter((frame) => frame.kind === kind)
    .map((frame) => frame.frameId);
}

function assertExactResolutionLinks(
  state: AuthoritativeEngineState,
  kind: ResolutionFrameKind,
  domainIds: readonly number[],
  label: string,
): void {
  if (new Set(domainIds).size !== domainIds.length) {
    throw new AuthoritativeEngineError(`${label} frame IDs are duplicated`);
  }
  if (!sameOrderedIds(domainIds, resolutionFrameIds(state, kind))) {
    throw new AuthoritativeEngineError(
      `${label} domain frames and resolution frames are out of sync`,
    );
  }
}

function retainedEvent(
  state: AuthoritativeEngineState,
  eventId: number,
  label: string,
): GameEvent | null {
  positive(eventId, label);
  if (eventId >= state.completeRules.nextEventId) {
    throw new AuthoritativeEngineError(`${label} was not allocated by the event ledger`);
  }
  if (eventId < state.eventHistoryBaseId) return null;
  const event = state.events[eventId - state.eventHistoryBaseId];
  if (!event || event.eventId !== eventId) {
    throw new AuthoritativeEngineError(`${label} is missing from retained event history`);
  }
  return event;
}

function assertEmbeddedMoveRecords(
  state: AuthoritativeEngineState,
  records: readonly MoveRecord[],
  label: string,
): void {
  const physicalIds = new Set(state.physicalCardIds);
  for (const [index, record] of records.entries()) {
    if (record.cardIds.some((cardId) => !physicalIds.has(cardId))) {
      throw new AuthoritativeEngineError(`${label}[${index}] references a nonphysical card`);
    }
    if (!state.moveRecords.some((candidate) => sameJson(candidate, record))) {
      throw new AuthoritativeEngineError(
        `${label}[${index}] is missing from authoritative move history`,
      );
    }
  }
}

function assertEvents(state: AuthoritativeEngineState): void {
  positive(state.eventHistoryBaseId, "eventHistoryBaseId");
  let previousEventId = state.eventHistoryBaseId - 1;
  for (const [index, event] of state.events.entries()) {
    if (!Number.isSafeInteger(event.eventId) || event.eventId !== previousEventId + 1) {
      throw new AuthoritativeEngineError(`events[${index}] has an invalid event order`);
    }
    previousEventId = event.eventId;
    if (!GAME_EVENT_TYPE_SET.has(event.type)) {
      throw new AuthoritativeEngineError(`events[${index}] has an invalid type`);
    }
    assertOptionalPositiveId(event.frameId, `events[${index}].frameId`);
    assertOptionalPositiveId(event.turnId, `events[${index}].turnId`);
    assertOptionalPositiveId(event.phaseInstanceId, `events[${index}].phaseInstanceId`);
    if ((event.sourceId !== null && !event.sourceId) || !event.reasonId) {
      throw new AuthoritativeEngineError(`events[${index}] has invalid source or reason metadata`);
    }
    if (
      event.targetIds.some((targetId) => !targetId) ||
      new Set(event.targetIds).size !== event.targetIds.length
    ) {
      throw new AuthoritativeEngineError(`events[${index}] has invalid targets`);
    }
    try {
      cloneJsonObject(event.payload);
    } catch (error) {
      throw new AuthoritativeEngineError(
        error instanceof Error ? error.message : `events[${index}] has an invalid payload`,
      );
    }
  }
  if (state.completeRules.nextEventId !== previousEventId + 1) {
    throw new AuthoritativeEngineError("nextEventId does not follow recorded events");
  }
}

function assertPindianLinks(state: AuthoritativeEngineState): void {
  const domainIds = state.pindianFrames.map((frame) => frame.frameId);
  if (new Set(domainIds).size !== domainIds.length) {
    throw new AuthoritativeEngineError("pindian frame IDs are duplicated");
  }
  const resolutionIds = state.completeRules.resolution.frames
    .filter((frame) => frame.kind === "pindian")
    .map((frame) => frame.frameId);
  if (
    domainIds.length !== resolutionIds.length ||
    [...domainIds].sort((left, right) => left - right).some((id, index) => id !== [...resolutionIds].sort((left, right) => left - right)[index])
  ) {
    throw new AuthoritativeEngineError("pindian domain frames and resolution frames are out of sync");
  }
  const top = state.completeRules.resolution.frames.at(-1);
  if (top?.kind === "pindian" && !domainIds.includes(top.frameId)) {
    throw new AuthoritativeEngineError("top Pindian resolution frame has no domain frame");
  }
  for (const frame of state.pindianFrames) assertPindianFrame(state.zones, frame);
}

function assertCardUseLinks(state: AuthoritativeEngineState): void {
  const domainIds = state.cardUseFrames.map((frame) => frame.frameId);
  const useIds = state.cardUseFrames.map((frame) => frame.useId);
  if (new Set(domainIds).size !== domainIds.length || new Set(useIds).size !== useIds.length) {
    throw new AuthoritativeEngineError("card-use frame or use IDs are duplicated");
  }
  const resolutionIds = state.completeRules.resolution.frames
    .filter((frame) => frame.kind === "card_use")
    .map((frame) => frame.frameId);
  if (
    domainIds.length !== resolutionIds.length ||
    [...domainIds].sort((left, right) => left - right).some((id, index) => id !== [...resolutionIds].sort((left, right) => left - right)[index])
  ) {
    throw new AuthoritativeEngineError("card-use domain frames and resolution frames are out of sync");
  }
  const physicalIds = new Set(state.physicalCardIds);
  for (const frame of state.cardUseFrames) {
    assertCardUseFrame(frame);
    if (frame.physicalCardIds.some((cardId) => !physicalIds.has(cardId))) {
      throw new AuthoritativeEngineError("card-use frame references a nonphysical card");
    }
  }
}

function judgmentPhysicalCardIds(frame: JudgmentFrame): readonly CardId[] {
  return [
    frame.initialCardId,
    frame.cardId,
    frame.effectiveCard?.cardId ?? null,
    ...frame.replacements.flatMap((replacement) => [
      replacement.oldCardId,
      replacement.newCardId,
    ]),
  ].filter((cardId): cardId is CardId => cardId !== null);
}

function assertJudgmentLinks(state: AuthoritativeEngineState): void {
  const domainIds = state.judgmentFrames.map((frame) => frame.frameId);
  if (new Set(domainIds).size !== domainIds.length) {
    throw new AuthoritativeEngineError("judgment frame IDs are duplicated");
  }
  const resolutionIds = state.completeRules.resolution.frames
    .filter((frame) => frame.kind === "judgment")
    .map((frame) => frame.frameId);
  const sortedDomainIds = [...domainIds].sort((left, right) => left - right);
  const sortedResolutionIds = [...resolutionIds].sort((left, right) => left - right);
  if (
    sortedDomainIds.length !== sortedResolutionIds.length ||
    sortedDomainIds.some((id, index) => id !== sortedResolutionIds[index])
  ) {
    throw new AuthoritativeEngineError(
      "judgment domain frames and resolution frames are out of sync",
    );
  }

  const physicalIds = new Set(state.physicalCardIds);
  for (const frame of state.judgmentFrames) {
    assertJudgmentFrame(state.zones, frame);
    if (judgmentPhysicalCardIds(frame).some((cardId) => !physicalIds.has(cardId))) {
      throw new AuthoritativeEngineError("judgment frame references a nonphysical card");
    }
  }
}

function assertDamageLinks(state: AuthoritativeEngineState): void {
  const frameIds = state.damageFrames.map((frame) => frame.frameId);
  assertExactResolutionLinks(state, "damage", frameIds, "damage");
  const damageIds = state.damageFrames.map((frame) => frame.damageId);
  if (new Set(damageIds).size !== damageIds.length) {
    throw new AuthoritativeEngineError("damage IDs are duplicated");
  }
  const playerIds = new Set(state.lifePlayers.map((player) => player.id));
  const physicalIds = new Set(state.physicalCardIds);
  const resolutionIndexById = new Map(
    state.completeRules.resolution.frames.map((frame, index) => [frame.frameId, index]),
  );
  for (const frame of state.damageFrames) {
    assertDamageInstance(frame);
    if (frame.damageId >= state.completeRules.nextDamageId) {
      throw new AuthoritativeEngineError("damage frame uses an unallocated damage ID");
    }
    assertKnownPlayer(playerIds, frame.sourceId, "damage source");
    assertKnownPlayer(playerIds, frame.targetId, "damage target");
    assertKnownPlayer(playerIds, frame.originalTargetId, "original damage target");
    for (const redirect of frame.redirects) {
      assertKnownPlayer(playerIds, redirect.sourceId, "damage redirect source");
      assertKnownPlayer(playerIds, redirect.fromTargetId, "damage redirect origin");
      assertKnownPlayer(playerIds, redirect.toTargetId, "damage redirect target");
    }
    if (frame.physicalCardIds.some((cardId) => !physicalIds.has(cardId))) {
      throw new AuthoritativeEngineError("damage frame references a nonphysical card");
    }

    if (frame.cardUseId === null) {
      if (frame.reason.type === "card" || frame.physicalCardIds.length > 0) {
        throw new AuthoritativeEngineError("card damage is missing card-use provenance");
      }
      continue;
    }
    const cardUse = state.cardUseFrames.find((candidate) => candidate.useId === frame.cardUseId);
    if (!cardUse) {
      throw new AuthoritativeEngineError("damage frame references a missing live card use");
    }
    if (
      cardUse.sourceId !== frame.sourceId ||
      !sameCardIdSet(cardUse.physicalCardIds, frame.physicalCardIds)
    ) {
      throw new AuthoritativeEngineError("damage card-use provenance is inconsistent");
    }
    const useIndex = resolutionIndexById.get(cardUse.frameId);
    const damageIndex = resolutionIndexById.get(frame.frameId);
    if (useIndex === undefined || damageIndex === undefined || useIndex >= damageIndex) {
      throw new AuthoritativeEngineError("damage card use is not an ancestor resolution frame");
    }
  }
}

function assertDyingReasonEvent(
  state: AuthoritativeEngineState,
  frame: DyingFrame,
): void {
  const event = retainedEvent(state, frame.reason.eventId, "dying reason eventId");
  if (!event) return;
  const expectedType = frame.reason.type === "damage" ? "damage_applied" : "hp_lost";
  if (
    event.type !== expectedType ||
    event.sourceId !== frame.reason.sourceId ||
    !event.targetIds.includes(frame.victimId)
  ) {
    throw new AuthoritativeEngineError("dying reason event provenance is inconsistent");
  }
  if (frame.reason.type === "damage") {
    const damage = state.damageFrames.find((candidate) => candidate.frameId === event.frameId);
    if (
      !damage ||
      damage.targetId !== frame.victimId ||
      damage.sourceId !== frame.reason.sourceId
    ) {
      throw new AuthoritativeEngineError("dying frame is not nested under its damage provenance");
    }
  }
}

function assertDyingLinks(state: AuthoritativeEngineState): void {
  const frameIds = state.dyingFrames.map((frame) => frame.frameId);
  assertExactResolutionLinks(state, "dying", frameIds, "dying");
  assertDyingStack(state.lifePlayers, { version: 1, frames: state.dyingFrames });
  const playerIds = new Set(state.lifePlayers.map((player) => player.id));
  const physicalIds = new Set(state.physicalCardIds);
  const resolutionIndexById = new Map(
    state.completeRules.resolution.frames.map((frame, index) => [frame.frameId, index]),
  );
  for (const frame of state.dyingFrames) {
    assertKnownPlayer(playerIds, frame.victimId, "dying victim");
    assertKnownPlayer(playerIds, frame.reason.sourceId, "dying source");
    for (const responderId of frame.responderOrder) {
      assertKnownPlayer(playerIds, responderId, "dying responder");
    }
    assertDyingReasonEvent(state, frame);

    for (const rescue of frame.rescues) {
      assertKnownPlayer(playerIds, rescue.responderId, "dying rescue responder");
      const recoveryEvent = retainedEvent(state, rescue.eventId, "dying rescue eventId");
      if (
        recoveryEvent &&
        recoveryEvent.type !== "recovered" &&
        recoveryEvent.type !== "dying_rescued"
      ) {
        throw new AuthoritativeEngineError("dying rescue event provenance is inconsistent");
      }
      if (rescue.provenance !== "verified") continue;
      if (rescue.physicalCardIds.some((cardId) => !physicalIds.has(cardId))) {
        throw new AuthoritativeEngineError("dying rescue references a nonphysical card");
      }
      assertEmbeddedMoveRecords(state, rescue.moveRecords, "dying rescue moveRecords");
      const cardUse = state.cardUseFrames.find(
        (candidate) => candidate.frameId === rescue.cardUseFrameId,
      );
      if (cardUse) {
        if (
          cardUse.useId !== rescue.useId ||
          cardUse.sourceId !== rescue.responderId ||
          !sameCardIdSet(cardUse.physicalCardIds, rescue.physicalCardIds)
        ) {
          throw new AuthoritativeEngineError("dying rescue live card-use provenance is inconsistent");
        }
        const dyingIndex = resolutionIndexById.get(frame.frameId);
        const useIndex = resolutionIndexById.get(cardUse.frameId);
        if (dyingIndex === undefined || useIndex === undefined || useIndex <= dyingIndex) {
          throw new AuthoritativeEngineError("dying rescue card use is not a nested resolution frame");
        }
      } else {
        if (
          rescue.cardUseFrameId === null ||
          rescue.cardUseFrameId >= state.completeRules.resolution.nextFrameId ||
          resolutionIndexById.has(rescue.cardUseFrameId)
        ) {
          throw new AuthoritativeEngineError("dying rescue references an invalid historical card-use frame");
        }
      }
    }
  }
}

function assertDeathReasonEvent(
  state: AuthoritativeEngineState,
  frame: DeathFrame,
): void {
  const deathEvent = retainedEvent(state, frame.death.eventId, "death eventId");
  if (
    deathEvent &&
    (
      deathEvent.type !== "death" ||
      deathEvent.sourceId !== frame.death.killerId ||
      !deathEvent.targetIds.includes(frame.death.victimId)
    )
  ) {
    throw new AuthoritativeEngineError("death event provenance is inconsistent");
  }
  const reasonEvent = retainedEvent(state, frame.death.reason.eventId, "death reason eventId");
  if (!reasonEvent) return;
  const expectedType = frame.death.reason.type === "damage" ? "damage_applied" : "hp_lost";
  if (
    reasonEvent.type !== expectedType ||
    reasonEvent.sourceId !== frame.death.reason.sourceId ||
    !reasonEvent.targetIds.includes(frame.death.victimId)
  ) {
    throw new AuthoritativeEngineError("death reason event provenance is inconsistent");
  }
}

function assertDeathLinks(state: AuthoritativeEngineState): void {
  const frameIds = state.deathFrames.map((frame) => frame.frameId);
  assertExactResolutionLinks(state, "death", frameIds, "death");
  assertDeathStack({ version: 1, frames: state.deathFrames });
  const players = new Map(state.lifePlayers.map((player) => [player.id, player]));
  const playerIds = new Set(players.keys());
  const physicalIds = new Set(state.physicalCardIds);
  for (const frame of state.deathFrames) {
    const victim = players.get(frame.death.victimId);
    if (!victim || victim.alive || victim.hp > 0) {
      throw new AuthoritativeEngineError("death victim life state is inconsistent");
    }
    assertKnownPlayer(playerIds, frame.death.killerId, "death killer");
    assertKnownPlayer(playerIds, frame.death.reason.sourceId, "death reason source");
    if (frame.death.killerId !== (frame.death.reason.type === "damage" ? frame.death.reason.sourceId : null)) {
      throw new AuthoritativeEngineError("death killer provenance is inconsistent");
    }
    if (frame.ownedPhysicalCardIds.some((cardId) => !physicalIds.has(cardId))) {
      throw new AuthoritativeEngineError("death frame references a nonphysical owned card");
    }
    assertDeathReasonEvent(state, frame);

    const stageEvents = [
      frame.identityReveal?.eventId,
      frame.deathTriggers?.eventId,
      frame.cardDisposition?.eventId,
      frame.rewardPunishment?.eventId,
      frame.deathAfter?.eventId,
    ].filter((eventId): eventId is number => eventId !== undefined);
    for (const eventId of stageEvents) retainedEvent(state, eventId, "death-stage eventId");

    if (frame.cardDisposition) {
      assertKnownPlayer(
        playerIds,
        frame.cardDisposition.xingshangRecipientId,
        "Xingshang recipient",
      );
      assertEmbeddedMoveRecords(
        state,
        frame.cardDisposition.moveRecords,
        "death cardDisposition moveRecords",
      );
    }
    if (frame.rewardPunishment) {
      assertKnownPlayer(
        playerIds,
        frame.rewardPunishment.affectedPlayerId,
        "death reward affected player",
      );
      assertEmbeddedMoveRecords(
        state,
        frame.rewardPunishment.moveRecords,
        "death reward moveRecords",
      );
    }
  }
}

export function assertAuthoritativeEngineState(
  value: unknown,
): asserts value is AuthoritativeEngineState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuthoritativeEngineError("authoritative engine state must be an object");
  }
  const candidate = value as Partial<AuthoritativeEngineState>;
  if (candidate.rootKind !== "authoritative_engine_state") {
    throw new AuthoritativeEngineError("authoritative root kind is invalid");
  }
  if (!Number.isSafeInteger(candidate.commitVersion) || (candidate.commitVersion ?? -1) < 0) {
    throw new AuthoritativeEngineError("commitVersion must be a nonnegative integer");
  }
  try {
    assertCompleteRulesEngineState(
      candidate.completeRules,
      Array.isArray(candidate.lifePlayers) ? candidate.lifePlayers : undefined,
    );
    if (!candidate.zones || !Array.isArray(candidate.zones.players)) {
      throw new AuthoritativeEngineError("authoritative zones are missing");
    }
    const playerIds = candidate.zones.players.map((player) => player.id);
    if (playerIds.some((id) => !id) || new Set(playerIds).size !== playerIds.length) {
      throw new AuthoritativeEngineError("zone player IDs must be unique and nonempty");
    }
    if (!Array.isArray(candidate.physicalCardIds) || new Set(candidate.physicalCardIds).size !== candidate.physicalCardIds.length) {
      throw new AuthoritativeEngineError("physicalCardIds must be unique");
    }
    for (const [index, card] of allZoneCards(candidate.zones).entries()) assertCard(card, `zones.card[${index}]`);
    assertCardConservation(candidate.zones, candidate.physicalCardIds);
    if (
      !Array.isArray(candidate.events) ||
      !Array.isArray(candidate.moveRecords) ||
      !Array.isArray(candidate.pindianFrames) ||
      !Array.isArray(candidate.cardUseFrames) ||
      !Array.isArray(candidate.judgmentFrames) ||
      !Array.isArray(candidate.lifePlayers) ||
      !Array.isArray(candidate.damageFrames) ||
      !Array.isArray(candidate.dyingFrames) ||
      !Array.isArray(candidate.deathFrames)
    ) {
      throw new AuthoritativeEngineError("authoritative histories are missing");
    }
    const state = candidate as AuthoritativeEngineState;
    assertLifePlayers(state);
    assertEvents(state);
    assertMoveRecords(state);
    assertPindianLinks(state);
    assertCardUseLinks(state);
    assertJudgmentLinks(state);
    assertDamageLinks(state);
    assertDyingLinks(state);
    assertDeathLinks(state);
  } catch (error) {
    if (error instanceof AuthoritativeEngineError) throw error;
    throw new AuthoritativeEngineError(error instanceof Error ? error.message : "authoritative nested state is invalid");
  }
}

export function createAuthoritativeEngineState(
  input: CreateAuthoritativeEngineStateInput,
): AuthoritativeEngineState {
  const complete = input.completeRulesState
    ? cloneCompleteRulesEngineState(input.completeRulesState)
    : createCompleteRulesEngineState();
  const zones = cloneZoneState(input.zones);
  const events = (input.events ?? []).map(cloneGameEvent);
  const moveRecords = (input.moveRecords ?? []).map(cloneMoveRecord);
  const damageFrames = (input.damageFrames ?? []).map(cloneDamageInstance);
  const dyingFrames = (input.dyingFrames ?? []).map(cloneDyingFrame);
  const deathFrames = (input.deathFrames ?? []).map(cloneDeathFrame);
  const hasLifeDomainFrames =
    damageFrames.length > 0 ||
    dyingFrames.length > 0 ||
    deathFrames.length > 0 ||
    complete.resolution.frames.some((frame) =>
      frame.kind === "damage" || frame.kind === "dying" || frame.kind === "death"
    );
  if (hasLifeDomainFrames && input.lifePlayers === undefined) {
    throw new AuthoritativeEngineError(
      "lifePlayers are required when restoring damage, dying, or death frames",
    );
  }
  const lifePlayers = input.lifePlayers
    ? input.lifePlayers.map(cloneLifePlayer)
    : zones.players.map((player): LifePlayerState => ({
      id: player.id,
      hp: 1,
      maxHp: 1,
      alive: true,
    }));
  const highestEventId = events.reduce((highest, event) => Math.max(highest, event.eventId), 0);
  const highestBatchId = moveRecords.reduce((highest, record) => Math.max(highest, record.batchId), 0);
  const highestDamageId = damageFrames.reduce(
    (highest, frame) => Math.max(highest, frame.damageId),
    0,
  );
  if (events.length > 0) complete.nextEventId = Math.max(complete.nextEventId, highestEventId + 1);
  if (moveRecords.length > 0) complete.nextMoveBatchId = Math.max(complete.nextMoveBatchId, highestBatchId + 1);
  if (damageFrames.length > 0) {
    complete.nextDamageId = Math.max(complete.nextDamageId, highestDamageId + 1);
  }
  const state: AuthoritativeEngineState = {
    rootKind: "authoritative_engine_state",
    commitVersion: 0,
    completeRules: complete,
    zones,
    events,
    eventHistoryBaseId: events[0]?.eventId ?? complete.nextEventId,
    moveRecords,
    moveHistoryBaseBatchId: moveRecords[0]?.batchId ?? complete.nextMoveBatchId,
    pindianFrames: (input.pindianFrames ?? []).map(clonePindianFrame),
    cardUseFrames: (input.cardUseFrames ?? []).map(cloneCardUseFrame),
    judgmentFrames: (input.judgmentFrames ?? []).map(cloneJudgmentFrame),
    lifePlayers,
    damageFrames,
    dyingFrames,
    deathFrames,
    physicalCardIds: [...assertCardConservation(zones)],
  };
  assertAuthoritativeEngineState(state);
  return state;
}

export function cloneAuthoritativeEngineState(
  state: AuthoritativeEngineState,
): AuthoritativeEngineState {
  assertAuthoritativeEngineState(state);
  return {
    rootKind: "authoritative_engine_state",
    commitVersion: state.commitVersion,
    completeRules: cloneCompleteRulesEngineState(state.completeRules),
    zones: cloneZoneState(state.zones),
    events: state.events.map(cloneGameEvent),
    eventHistoryBaseId: state.eventHistoryBaseId,
    moveRecords: state.moveRecords.map(cloneMoveRecord),
    moveHistoryBaseBatchId: state.moveHistoryBaseBatchId,
    pindianFrames: state.pindianFrames.map(clonePindianFrame),
    cardUseFrames: state.cardUseFrames.map(cloneCardUseFrame),
    judgmentFrames: state.judgmentFrames.map(cloneJudgmentFrame),
    lifePlayers: state.lifePlayers.map(cloneLifePlayer),
    damageFrames: state.damageFrames.map(cloneDamageInstance),
    dyingFrames: state.dyingFrames.map(cloneDyingFrame),
    deathFrames: state.deathFrames.map(cloneDeathFrame),
    physicalCardIds: [...state.physicalCardIds],
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function incrementCounter(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value >= Number.MAX_SAFE_INTEGER) {
    throw new AuthoritativeEngineError(`${label} is exhausted or invalid`);
  }
  return value + 1;
}

function assertExpectedTop<Result>(
  spec: AuthoritativeTransactionSpec<Result>,
  result: Result,
  resolution: ResolutionStack,
): void {
  const configured = spec.expectedResolutionTop;
  const expected = typeof configured === "function" ? configured(result) : configured;
  const top = resolution.frames.at(-1) ?? null;
  if (expected === null || expected === undefined) {
    if (top !== null) {
      throw new AuthoritativeEngineError(
        `resolution top mismatch: expected an empty stack, got ${top.kind}#${top.frameId}`,
      );
    }
    return;
  }
  if (top?.frameId !== expected.frameId || top.kind !== expected.kind) {
    const actual = top ? `${top.kind}#${top.frameId}` : "empty stack";
    throw new AuthoritativeEngineError(
      `resolution top mismatch: expected ${expected.kind}#${expected.frameId}, got ${actual}`,
    );
  }
}

/**
 * Executes one authoritative root transaction in a fixed order:
 *
 * 1. clone the entire root;
 * 2. run the domain transition on the clone;
 * 3. run the resolution transition on a separate resolution clone;
 * 4. validate the complete root and return one new committed version.
 *
 * Neither a domain failure nor a resolution failure can mutate the input root.
 */
export function transactAuthoritativeEngineState<Result>(
  current: AuthoritativeEngineState,
  spec: AuthoritativeTransactionSpec<Result>,
): AuthoritativeTransactionResult<Result> {
  assertAuthoritativeEngineState(current);
  if (spec.expectedCommitVersion !== current.commitVersion) {
    throw new AuthoritativeEngineError(
      `stale authoritative commit: expected ${spec.expectedCommitVersion}, current ${current.commitVersion}`,
    );
  }

  const draft = cloneAuthoritativeEngineState(current);
  const resolutionBeforeDomain = cloneResolutionStack(draft.completeRules.resolution);
  const immutablePhysicalIds = [...draft.physicalCardIds];
  const existingDamageFrameKeys = new Set(
    current.damageFrames.map((frame) => `${frame.damageId}:${frame.frameId}`),
  );
  let allocatedDamageIds = 0;
  const allocatedDamageIdValues = new Set<number>();

  const recordMoveTransition = (
    transition: (batchId: number) => readonly MoveRecord[],
  ): readonly MoveRecord[] => {
    const batchId = draft.completeRules.nextMoveBatchId;
    const records = transition(batchId);
    if (!Array.isArray(records) || records.length === 0) {
      throw new AuthoritativeEngineError("a recorded move transition must return at least one record");
    }
    if (
      draft.completeRules.nextMoveBatchId !== batchId ||
      records.some((record) => record.batchId !== batchId)
    ) {
      throw new AuthoritativeEngineError("domain move transition used an unexpected batch ID");
    }
    draft.moveRecords.push(...records.map(cloneMoveRecord));
    draft.completeRules.nextMoveBatchId = incrementCounter(batchId, "nextMoveBatchId");
    return records;
  };

  const tools: AuthoritativeTransactionTools = {
    emitEvent: (input) => {
      const event = createGameEvent(draft.completeRules, input);
      draft.events.push(cloneGameEvent(event));
      return event;
    },
    commitMoves: (intents) => recordMoveTransition((batchId) =>
      commitAtomicMoveBatch(draft.zones, { batchId, intents })),
    recordMoveTransition,
    allocateDamageId: () => {
      const damageId = draft.completeRules.nextDamageId;
      draft.completeRules.nextDamageId = incrementCounter(damageId, "nextDamageId");
      allocatedDamageIds += 1;
      allocatedDamageIdValues.add(damageId);
      return damageId;
    },
  };

  const result = spec.domainTransition(draft, tools);
  if (!sameJson(draft.completeRules.resolution, resolutionBeforeDomain)) {
    throw new AuthoritativeEngineError("domain transition must not mutate the resolution stack");
  }
  if (
    draft.commitVersion !== current.commitVersion ||
    draft.rootKind !== current.rootKind ||
    draft.completeRules.version !== current.completeRules.version ||
    draft.completeRules.ruleSetVersion !== current.completeRules.ruleSetVersion ||
    draft.eventHistoryBaseId !== current.eventHistoryBaseId ||
    draft.moveHistoryBaseBatchId !== current.moveHistoryBaseBatchId ||
    draft.completeRules.nextDamageId !== current.completeRules.nextDamageId + allocatedDamageIds ||
    draft.damageFrames.some((frame) =>
      !existingDamageFrameKeys.has(`${frame.damageId}:${frame.frameId}`) &&
      !allocatedDamageIdValues.has(frame.damageId)
    ) ||
    draft.events.length < current.events.length ||
    !sameJson(draft.events.slice(0, current.events.length), current.events) ||
    draft.moveRecords.length < current.moveRecords.length ||
    !sameJson(draft.moveRecords.slice(0, current.moveRecords.length), current.moveRecords) ||
    !sameJson(draft.physicalCardIds, immutablePhysicalIds)
  ) {
    throw new AuthoritativeEngineError("domain transition modified root transaction invariants");
  }

  const resolution = spec.resolutionTransition(
    cloneResolutionStack(resolutionBeforeDomain),
    result,
  );
  assertResolutionStack(resolution);
  if (
    resolution.stateVersion < resolutionBeforeDomain.stateVersion ||
    (!sameJson(resolution, resolutionBeforeDomain) &&
      resolution.stateVersion === resolutionBeforeDomain.stateVersion)
  ) {
    throw new AuthoritativeEngineError(
      "resolution transition moved stateVersion backwards or changed state without advancing it",
    );
  }
  draft.completeRules.resolution = cloneResolutionStack(resolution);
  assertExpectedTop(spec, result, draft.completeRules.resolution);
  draft.commitVersion = current.commitVersion + 1;
  assertAuthoritativeEngineState(draft);
  return { state: draft, result };
}

/** Utility for visibility policies that refer to the player owning a zone. */
export function playerIdForZone(zone: ZoneRef): PlayerId | null {
  switch (zone.kind) {
    case "hand":
    case "equipment":
    case "judgment":
    case "extra":
      return zone.playerId;
    case "deck":
    case "discard":
    case "processing":
      return null;
  }
}
