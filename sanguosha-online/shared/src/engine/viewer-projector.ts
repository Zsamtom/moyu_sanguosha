import type {
  Card,
  CardCategory,
  CardId,
  CardKind,
  CardName,
  CardRank,
  CardSuit,
  EquipmentSlot,
  PlayerId,
} from "../types.js";
import type { RuleSetVersion } from "../rule-config.js";
import type { GameEvent } from "./events.js";
import {
  assertAuthoritativeEngineState,
  playerIdForZone,
  type AuthoritativeEngineState,
} from "./authoritative-state.js";
import { getPindianView, type PindianStage } from "./pindian.js";
import type {
  DecisionRequest,
  PhaseInstance,
  ResolutionFrame,
  ResolutionFrameKind,
  ResolutionFrameStatus,
  TurnEntry,
  TurnKind,
} from "./resolution.js";
import type { MoveRecord, ZoneRef } from "./zones.js";

declare const viewerProjectionBrand: unique symbol;

export interface ProjectedCard {
  readonly projectionKind: "card";
  readonly cardId: CardId;
  readonly cardKind: CardKind;
  readonly cardName: CardName;
  readonly category: CardCategory;
  readonly suit: CardSuit;
  readonly rank: CardRank;
}

export type ProjectedZoneRef =
  | { readonly zone: "deck" }
  | { readonly zone: "discard" }
  | { readonly zone: "processing"; readonly frameId: number }
  | { readonly zone: "hand"; readonly playerId: PlayerId }
  | { readonly zone: "equipment"; readonly playerId: PlayerId; readonly slot: EquipmentSlot }
  | { readonly zone: "judgment"; readonly playerId: PlayerId }
  | { readonly zone: "extra"; readonly playerId: PlayerId; readonly pileId: string };

export interface ProjectedPrivateCardCollection {
  readonly count: number;
  /** Null means this viewer is not entitled to the card identities. */
  readonly cards: readonly ProjectedCard[] | null;
}

export interface ProjectedExtraPile {
  readonly pileId: string;
  readonly count: number;
  readonly cards: readonly ProjectedCard[] | null;
}

export interface ProjectedZonePlayer {
  readonly playerId: PlayerId;
  readonly hand: ProjectedPrivateCardCollection;
  readonly equipment: Readonly<Partial<Record<EquipmentSlot, ProjectedCard>>>;
  readonly judgment: readonly ProjectedCard[];
  readonly extraPiles: readonly ProjectedExtraPile[];
}

export interface ProjectedProcessingZone {
  readonly frameId: number;
  readonly cardCount: number;
  readonly visibleCards: readonly ProjectedCard[];
  readonly hiddenCardCount: number;
}

export interface ProjectedZoneState {
  readonly projectionKind: "zones";
  readonly deckCount: number;
  readonly discard: readonly ProjectedCard[];
  readonly processing: readonly ProjectedProcessingZone[];
  readonly players: readonly ProjectedZonePlayer[];
}

export interface ProjectedMoveRecord {
  readonly projectionKind: "move_record";
  readonly batchId: number;
  readonly reason: MoveRecord["reason"];
  readonly audience: "public" | "viewer" | "masked";
  readonly from: ProjectedZoneRef;
  readonly to: ProjectedZoneRef;
  readonly cardCount: number;
  readonly visibleCards: readonly ProjectedCard[];
  readonly hiddenCardCount: number;
  readonly actorId: PlayerId | null;
  readonly sourceId: PlayerId | null;
  readonly targetId: PlayerId | null;
  readonly skillId: string | null;
  readonly useId: number | null;
  readonly frameId: number | null;
}

export interface ProjectedPindianSelection {
  readonly committed: boolean;
  readonly cardId: CardId | null;
}

export interface ProjectedPindianResult {
  readonly initiatorRank: CardRank;
  readonly targetRank: CardRank;
  readonly winnerPlayerId: PlayerId | null;
  readonly initiatorWon: boolean;
  readonly tied: boolean;
}

export interface ProjectedPindianCommitment {
  readonly projectionKind: "pindian";
  readonly frameId: number;
  readonly initiatorId: PlayerId;
  readonly targetId: PlayerId;
  readonly reasonSkillId: string;
  readonly stage: PindianStage;
  readonly commitments: Readonly<Record<PlayerId, ProjectedPindianSelection>>;
  readonly revealedRanks: Readonly<Partial<Record<PlayerId, CardRank>>>;
  readonly effectiveRanks: Readonly<Partial<Record<PlayerId, CardRank>>>;
  readonly result: ProjectedPindianResult | null;
}

export interface ProjectedPhaseInstance {
  readonly instanceId: number;
  readonly turnId: number;
  readonly playerId: PlayerId;
  readonly name: string;
  readonly lifecycle: PhaseInstance["lifecycle"];
}

export interface ProjectedResolutionFrame {
  readonly frameId: number;
  readonly kind: ResolutionFrameKind;
  readonly status: ResolutionFrameStatus;
  readonly phase: ProjectedPhaseInstance | null;
  readonly waitingForPlayerId: PlayerId | null;
}

export interface ProjectedDecisionRequest {
  readonly projectionKind: "decision_request";
  readonly requestId: number;
  readonly frameId: number;
  readonly kind: string;
  readonly canPass: boolean;
  readonly issuedAtResolutionVersion: number;
}

export interface ProjectedTurnEntry {
  readonly turnId: number;
  readonly playerId: PlayerId;
  readonly kind: TurnKind;
  readonly grantedByTurnId: number | null;
  readonly reasonType: string;
}

export interface ProjectedResolutionState {
  readonly projectionKind: "resolution";
  readonly stateVersion: number;
  readonly currentTurn: ProjectedTurnEntry | null;
  readonly pendingTurns: readonly ProjectedTurnEntry[];
  readonly frames: readonly ProjectedResolutionFrame[];
  /** Present only when the pending request belongs to this viewer. Raw payload is never copied. */
  readonly viewerDecision: ProjectedDecisionRequest | null;
  readonly consumedActionCount: number;
}

/**
 * Server events may contain secret targets and payloads, so viewers receive
 * only progress metadata until an event-level visibility policy exists.
 */
export interface ProjectedEventHistory {
  readonly projectionKind: "event_history_cursor";
  readonly eventCount: number;
  readonly lastEventId: number | null;
}

export interface ViewerProjectedEngineState {
  readonly [viewerProjectionBrand]: true;
  readonly projectionKind: "viewer_engine_state";
  readonly version: 1;
  readonly viewerId: PlayerId;
  readonly commitVersion: number;
  readonly ruleSetVersion: RuleSetVersion;
  readonly zones: ProjectedZoneState;
  readonly resolution: ProjectedResolutionState;
  readonly eventHistory: ProjectedEventHistory;
  readonly moveRecords: readonly ProjectedMoveRecord[];
  readonly pindian: readonly ProjectedPindianCommitment[];
}

export class ViewerProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ViewerProjectionError";
  }
}

function projectCard(card: Card): ProjectedCard {
  return {
    projectionKind: "card",
    cardId: card.id,
    cardKind: card.kind,
    cardName: card.name,
    category: card.category,
    suit: card.suit,
    rank: card.rank,
  };
}

function projectZoneRef(zone: ZoneRef): ProjectedZoneRef {
  switch (zone.kind) {
    case "deck": return { zone: "deck" };
    case "discard": return { zone: "discard" };
    case "processing": return { zone: "processing", frameId: zone.frameId };
    case "hand": return { zone: "hand", playerId: zone.playerId };
    case "equipment": return { zone: "equipment", playerId: zone.playerId, slot: zone.slot };
    case "judgment": return { zone: "judgment", playerId: zone.playerId };
    case "extra": return { zone: "extra", playerId: zone.playerId, pileId: zone.pileId };
  }
}

function recordParticipantIds(record: MoveRecord): Set<PlayerId> {
  return new Set([
    record.actorId,
    record.sourceId,
    record.targetId,
    playerIdForZone(record.from),
    playerIdForZone(record.to),
  ].filter((value): value is PlayerId => typeof value === "string" && value.length > 0));
}

function recordVisibleTo(record: MoveRecord, viewerId: PlayerId): boolean {
  switch (record.visibility) {
    case "public": return true;
    case "server_only": return false;
    case "owner": return recordParticipantIds(record).has(viewerId);
    case "source_and_target": {
      const direct = [record.sourceId, record.targetId]
        .filter((value): value is PlayerId => typeof value === "string" && value.length > 0);
      const allowed = direct.length > 0
        ? new Set(direct)
        : new Set([playerIdForZone(record.from), playerIdForZone(record.to)]
          .filter((value): value is PlayerId => value !== null));
      return allowed.has(viewerId);
    }
  }
}

function projectPindian(
  state: AuthoritativeEngineState,
  viewerId: PlayerId,
): readonly ProjectedPindianCommitment[] {
  return state.pindianFrames.map((frame) => {
    const view = getPindianView(frame, viewerId);
    return {
      projectionKind: "pindian" as const,
      frameId: view.frameId,
      initiatorId: view.initiatorId,
      targetId: view.targetId,
      reasonSkillId: view.reasonSkillId,
      stage: view.stage,
      commitments: Object.fromEntries(Object.entries(view.selections).map(([playerId, selection]) => [
        playerId,
        { committed: selection.selected, cardId: selection.cardId },
      ])),
      revealedRanks: { ...view.revealedRanks },
      effectiveRanks: { ...view.effectiveRanks },
      result: view.result ? {
        initiatorRank: view.result.initiatorRank,
        targetRank: view.result.targetRank,
        winnerPlayerId: view.result.winnerId,
        initiatorWon: view.result.initiatorWon,
        tied: view.result.tied,
      } : null,
    };
  });
}

function publicPindianCardIds(state: AuthoritativeEngineState): Set<CardId> {
  const ids = new Set<CardId>();
  for (const frame of state.pindianFrames) {
    if (frame.stage === "selecting" || frame.stage === "ready_to_reveal") continue;
    for (const cardId of Object.values(frame.selections)) if (cardId) ids.add(cardId);
  }
  return ids;
}

function visiblePindianCardIds(
  projections: readonly ProjectedPindianCommitment[],
): Set<CardId> {
  const ids = new Set<CardId>();
  for (const projection of projections) {
    for (const selection of Object.values(projection.commitments)) {
      if (selection.cardId) ids.add(selection.cardId);
    }
  }
  return ids;
}

function projectMoveRecords(
  state: AuthoritativeEngineState,
  viewerId: PlayerId,
  publicPindianIds: ReadonlySet<CardId>,
): readonly ProjectedMoveRecord[] {
  return state.moveRecords
    .filter((record) => record.visibility !== "server_only")
    .map((record): ProjectedMoveRecord => {
      const audienceCanSee = recordVisibleTo(record, viewerId);
      const visibleCards = record.cards.filter((card) => audienceCanSee || publicPindianIds.has(card.id));
      const publiclyVisible = record.visibility === "public" || visibleCards.length === record.cards.length && record.cards.every((card) => publicPindianIds.has(card.id));
      return {
        projectionKind: "move_record",
        batchId: record.batchId,
        reason: record.reason,
        audience: publiclyVisible ? "public" : visibleCards.length > 0 ? "viewer" : "masked",
        from: projectZoneRef(record.from),
        to: projectZoneRef(record.to),
        cardCount: record.cards.length,
        visibleCards: visibleCards.map(projectCard),
        hiddenCardCount: record.cards.length - visibleCards.length,
        actorId: record.actorId ?? null,
        sourceId: record.sourceId ?? null,
        targetId: record.targetId ?? null,
        skillId: record.skillId ?? null,
        useId: record.useId ?? null,
        frameId: record.frameId ?? null,
      };
    });
}

function latestMoveByCard(state: AuthoritativeEngineState): ReadonlyMap<CardId, MoveRecord> {
  const latest = new Map<CardId, MoveRecord>();
  for (const record of state.moveRecords) {
    for (const cardId of record.cardIds) latest.set(cardId, record);
  }
  return latest;
}

function projectZones(
  state: AuthoritativeEngineState,
  viewerId: PlayerId,
  visiblePindianIds: ReadonlySet<CardId>,
): ProjectedZoneState {
  const latestMoves = latestMoveByCard(state);
  const processing = Object.entries(state.zones.processing)
    .map(([frameId, cards]): ProjectedProcessingZone => {
      const visibleCards = cards.filter((card) => {
        if (visiblePindianIds.has(card.id)) return true;
        const move = latestMoves.get(card.id);
        return move ? recordVisibleTo(move, viewerId) : false;
      });
      return {
        frameId: Number(frameId),
        cardCount: cards.length,
        visibleCards: visibleCards.map(projectCard),
        hiddenCardCount: cards.length - visibleCards.length,
      };
    })
    .sort((left, right) => left.frameId - right.frameId);

  return {
    projectionKind: "zones",
    deckCount: state.zones.deck.length,
    discard: state.zones.discard.map(projectCard),
    processing,
    players: state.zones.players.map((player): ProjectedZonePlayer => ({
      playerId: player.id,
      hand: {
        count: player.hand.length,
        cards: player.id === viewerId ? player.hand.map(projectCard) : null,
      },
      equipment: Object.fromEntries(
        EQUIPMENT_SLOTS.flatMap((slot) => {
          const card = player.equipment[slot];
          return card ? [[slot, projectCard(card)]] : [];
        }),
      ),
      judgment: player.judgment.map(projectCard),
      extraPiles: Object.entries(player.extraPiles).map(([pileId, cards]) => ({
        pileId,
        count: cards.length,
        cards: player.id === viewerId ? cards.map(projectCard) : null,
      })),
    })),
  };
}

const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = [
  "weapon",
  "armor",
  "offensive_horse",
  "defensive_horse",
];

function projectPhase(frame: ResolutionFrame): ProjectedPhaseInstance | null {
  if (frame.kind !== "phase") return null;
  return {
    instanceId: frame.phase.instanceId,
    turnId: frame.phase.turnId,
    playerId: frame.phase.playerId,
    name: frame.phase.name,
    lifecycle: frame.phase.lifecycle,
  };
}

function projectTurn(turn: TurnEntry): ProjectedTurnEntry {
  return {
    turnId: turn.turnId,
    playerId: turn.playerId,
    kind: turn.kind,
    grantedByTurnId: turn.grantedByTurnId,
    reasonType: turn.reason.type,
  };
}

function projectDecision(
  request: DecisionRequest | null,
  viewerId: PlayerId,
): ProjectedDecisionRequest | null {
  if (!request || request.actorId !== viewerId) return null;
  return {
    projectionKind: "decision_request",
    requestId: request.requestId,
    frameId: request.frameId,
    kind: request.kind,
    canPass: request.canPass,
    issuedAtResolutionVersion: request.issuedAtStateVersion,
  };
}

function projectResolution(
  state: AuthoritativeEngineState,
  viewerId: PlayerId,
): ProjectedResolutionState {
  const resolution = state.completeRules.resolution;
  const top = resolution.frames.at(-1);
  return {
    projectionKind: "resolution",
    stateVersion: resolution.stateVersion,
    currentTurn: resolution.turnQueue.current ? projectTurn(resolution.turnQueue.current) : null,
    pendingTurns: resolution.turnQueue.pending.map(projectTurn),
    frames: resolution.frames.map((frame) => ({
      frameId: frame.frameId,
      kind: frame.kind,
      status: frame.status,
      phase: projectPhase(frame),
      waitingForPlayerId: frame.decisionRequest?.actorId ?? null,
    })),
    viewerDecision: projectDecision(top?.decisionRequest ?? null, viewerId),
    consumedActionCount: resolution.consumedActions.length,
  };
}

function projectEventHistory(events: readonly GameEvent[]): ProjectedEventHistory {
  return {
    projectionKind: "event_history_cursor",
    eventCount: events.length,
    lastEventId: events.at(-1)?.eventId ?? null,
  };
}

function deepFreeze(value: unknown, visited = new Set<object>()): void {
  if (!value || typeof value !== "object" || visited.has(value)) return;
  visited.add(value);
  for (const child of Object.values(value)) deepFreeze(child, visited);
  Object.freeze(value);
}

/**
 * The only shared-layer conversion from the authoritative root to a viewer DTO.
 * It deliberately omits raw frame payloads, continuations, actions, deck order,
 * opponent hands, raw server events, server-only moves, lifecycle internals,
 * and secret commitments.
 */
export function projectAuthoritativeEngineState(
  state: AuthoritativeEngineState,
  viewerId: PlayerId,
): ViewerProjectedEngineState {
  if (!viewerId) throw new ViewerProjectionError("viewerId is required");
  try {
    assertAuthoritativeEngineState(state);
  } catch (error) {
    throw new ViewerProjectionError(error instanceof Error ? error.message : "invalid authoritative state");
  }
  const pindian = projectPindian(state, viewerId);
  const publicPindianIds = publicPindianCardIds(state);
  const projected = {
    projectionKind: "viewer_engine_state" as const,
    version: 1 as const,
    viewerId,
    commitVersion: state.commitVersion,
    ruleSetVersion: state.completeRules.ruleSetVersion,
    zones: projectZones(state, viewerId, visiblePindianCardIds(pindian)),
    resolution: projectResolution(state, viewerId),
    eventHistory: projectEventHistory(state.events),
    moveRecords: projectMoveRecords(state, viewerId, publicPindianIds),
    pindian,
  };
  deepFreeze(projected);
  return projected as ViewerProjectedEngineState;
}
