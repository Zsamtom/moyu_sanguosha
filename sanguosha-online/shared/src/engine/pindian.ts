import type { CardId, CardRank, PlayerId } from "../types.js";
import {
  ZoneMoveError,
  commitMoveBatch,
  locatePhysicalCard,
  type AtomicZoneState,
  type MoveRecord,
  type ZoneRef,
} from "./zones.js";

export type PindianStage = "selecting" | "ready_to_reveal" | "modifying" | "compared" | "settled";

export interface PindianRankModifier {
  readonly playerId: PlayerId;
  readonly skillId: string;
  readonly delta: number;
  readonly rankBefore: CardRank;
  readonly rankAfter: CardRank;
}

export interface PindianResult {
  readonly initiatorRank: CardRank;
  readonly targetRank: CardRank;
  readonly winnerId: PlayerId | null;
  readonly initiatorWon: boolean;
  readonly tied: boolean;
}

export interface PindianFrame {
  readonly type: "pindian";
  readonly frameId: number;
  readonly initiatorId: PlayerId;
  readonly targetId: PlayerId;
  readonly reasonSkillId: string;
  stage: PindianStage;
  selections: Partial<Record<PlayerId, CardId>>;
  revealedRanks: Partial<Record<PlayerId, CardRank>>;
  effectiveRanks: Partial<Record<PlayerId, CardRank>>;
  rankModifiers: PindianRankModifier[];
  result: PindianResult | null;
  settledDestinations: Partial<Record<PlayerId, ZoneRef>>;
}

export interface PindianView {
  readonly frameId: number;
  readonly initiatorId: PlayerId;
  readonly targetId: PlayerId;
  readonly reasonSkillId: string;
  readonly stage: PindianStage;
  readonly selections: Readonly<Record<PlayerId, { readonly selected: boolean; readonly cardId: CardId | null }>>;
  readonly revealedRanks: Readonly<Partial<Record<PlayerId, CardRank>>>;
  readonly effectiveRanks: Readonly<Partial<Record<PlayerId, CardRank>>>;
  readonly result: PindianResult | null;
}

export class PindianError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PindianError";
  }
}

function participantIds(frame: PindianFrame): readonly [PlayerId, PlayerId] {
  return [frame.initiatorId, frame.targetId];
}

function isParticipant(frame: PindianFrame, playerId: PlayerId): boolean {
  return playerId === frame.initiatorId || playerId === frame.targetId;
}

function handContains(state: AtomicZoneState, playerId: PlayerId, cardId: CardId): boolean {
  return state.players.find((player) => player.id === playerId)?.hand.some((card) => card.id === cardId) ?? false;
}

function locatePindianCard(state: AtomicZoneState, cardId: CardId): ReturnType<typeof locatePhysicalCard> {
  try {
    return locatePhysicalCard(state, cardId);
  } catch (error) {
    if (error instanceof ZoneMoveError) throw new PindianError(error.message);
    throw error;
  }
}

function processingZone(frame: PindianFrame): ZoneRef {
  return { kind: "processing", frameId: frame.frameId };
}

export function createPindianFrame(
  state: AtomicZoneState,
  input: {
    readonly frameId: number;
    readonly initiatorId: PlayerId;
    readonly targetId: PlayerId;
    readonly reasonSkillId: string;
  },
): PindianFrame {
  if (!Number.isSafeInteger(input.frameId) || input.frameId <= 0) throw new PindianError("frameId must be positive");
  if (!input.initiatorId || !input.targetId || input.initiatorId === input.targetId) {
    throw new PindianError("pindian requires two different players");
  }
  if (!input.reasonSkillId) throw new PindianError("pindian reason skill is required");
  for (const playerId of [input.initiatorId, input.targetId]) {
    const player = state.players.find((candidate) => candidate.id === playerId);
    if (!player) throw new PindianError(`unknown player: ${playerId}`);
    if (player.hand.length === 0) throw new PindianError(`${playerId} has no hand card for pindian`);
  }
  return {
    type: "pindian",
    frameId: input.frameId,
    initiatorId: input.initiatorId,
    targetId: input.targetId,
    reasonSkillId: input.reasonSkillId,
    stage: "selecting",
    selections: {},
    revealedRanks: {},
    effectiveRanks: {},
    rankModifiers: [],
    result: null,
    settledDestinations: {},
  };
}

/**
 * Commits one card face-down to this frame's processing zone. Moving the
 * physical card immediately reserves it: later hand-use and death-cleanup
 * operations can no longer consume a committed pindian card.
 */
export function selectPindianCard(
  state: AtomicZoneState,
  frame: PindianFrame,
  playerId: PlayerId,
  cardId: CardId,
  batchId: number,
): MoveRecord {
  if (frame.stage !== "selecting") throw new PindianError("pindian is not accepting selections");
  if (!isParticipant(frame, playerId)) throw new PindianError("player is not part of this pindian");
  if (frame.selections[playerId]) throw new PindianError("pindian selection was already committed");
  if (!handContains(state, playerId, cardId)) throw new PindianError("selected pindian card is not in the player's hand");
  let record: MoveRecord;
  try {
    const records = commitMoveBatch(state, {
      batchId,
      intents: [{
        cardIds: [cardId],
        from: { kind: "hand", playerId },
        to: processingZone(frame),
        reason: "pindian",
        visibility: "owner",
        actorId: playerId,
        skillId: frame.reasonSkillId as never,
        frameId: frame.frameId,
      }],
    });
    record = records[0]!;
  } catch (error) {
    if (error instanceof ZoneMoveError) throw new PindianError(error.message);
    throw error;
  }
  frame.selections[playerId] = cardId;
  if (participantIds(frame).every((id) => frame.selections[id] !== undefined)) frame.stage = "ready_to_reveal";
  return record;
}

/** Turns both already-reserved commitments face-up and exposes their ranks. */
export function revealPindianCards(
  state: AtomicZoneState,
  frame: PindianFrame,
): void {
  if (frame.stage !== "ready_to_reveal") throw new PindianError("both pindian selections are not ready");
  const [initiatorId, targetId] = participantIds(frame);
  const initiatorCardId = frame.selections[initiatorId];
  const targetCardId = frame.selections[targetId];
  if (!initiatorCardId || !targetCardId) throw new PindianError("pindian selection metadata is incomplete");
  for (const playerId of participantIds(frame)) {
    const cardId = frame.selections[playerId]!;
    const located = locatePindianCard(state, cardId);
    if (located.zone.kind !== "processing" || located.zone.frameId !== frame.frameId) {
      throw new PindianError("committed pindian card is outside its processing zone");
    }
    const card = located.card;
    frame.revealedRanks[playerId] = card.rank;
    frame.effectiveRanks[playerId] = card.rank;
  }
  frame.stage = "modifying";
}

/** Applies Yingyang-style rank changes once per skill owner, clamped to 1..13. */
export function modifyPindianRank(
  frame: PindianFrame,
  input: { readonly playerId: PlayerId; readonly skillId: string; readonly delta: number },
): CardRank {
  if (frame.stage !== "modifying") throw new PindianError("pindian ranks are not accepting modifiers");
  if (!isParticipant(frame, input.playerId) || !input.skillId) throw new PindianError("invalid pindian rank modifier owner");
  if (!Number.isSafeInteger(input.delta) || input.delta === 0) throw new PindianError("pindian rank modifier must be a non-zero integer");
  if (frame.rankModifiers.some((modifier) => modifier.playerId === input.playerId && modifier.skillId === input.skillId)) {
    throw new PindianError("the same pindian rank skill can only modify once");
  }
  const before = frame.effectiveRanks[input.playerId];
  if (!before) throw new PindianError("pindian card is not revealed");
  const after = Math.max(1, Math.min(13, before + input.delta)) as CardRank;
  frame.effectiveRanks[input.playerId] = after;
  frame.rankModifiers.push({ playerId: input.playerId, skillId: input.skillId, delta: input.delta, rankBefore: before, rankAfter: after });
  return after;
}

/** A tie is explicitly not a win for the initiator. */
export function comparePindian(frame: PindianFrame): PindianResult {
  if (frame.stage !== "modifying") throw new PindianError("pindian is not ready to compare");
  const initiatorRank = frame.effectiveRanks[frame.initiatorId];
  const targetRank = frame.effectiveRanks[frame.targetId];
  if (!initiatorRank || !targetRank) throw new PindianError("pindian effective ranks are incomplete");
  const tied = initiatorRank === targetRank;
  const winnerId = tied ? null : initiatorRank > targetRank ? frame.initiatorId : frame.targetId;
  frame.result = {
    initiatorRank,
    targetRank,
    winnerId,
    initiatorWon: winnerId === frame.initiatorId,
    tied,
  };
  frame.stage = "compared";
  return frame.result;
}

export function settlePindianCards(
  state: AtomicZoneState,
  frame: PindianFrame,
  input: {
    readonly batchId: number;
    /** Defaults both cards to discard; Zhiba can route both to the lord's hand. */
    readonly destinations?: Partial<Record<PlayerId, ZoneRef>>;
  },
): readonly MoveRecord[] {
  if (frame.stage !== "compared" || !frame.result) throw new PindianError("pindian must be compared before settlement");
  const intents = participantIds(frame).map((playerId) => {
    const cardId = frame.selections[playerId];
    if (!cardId) throw new PindianError("pindian card selection is missing");
    const destination = input.destinations?.[playerId] ?? { kind: "discard" as const };
    return {
      cardIds: [cardId],
      from: processingZone(frame),
      to: destination,
      reason: destination.kind === "discard" ? "discard" as const : "gain" as const,
      visibility: "public" as const,
      actorId: playerId,
      skillId: frame.reasonSkillId as never,
      frameId: frame.frameId,
    };
  });
  let records: readonly MoveRecord[];
  try {
    records = commitMoveBatch(state, { batchId: input.batchId, intents });
  } catch (error) {
    if (error instanceof ZoneMoveError) throw new PindianError(error.message);
    throw error;
  }
  for (const playerId of participantIds(frame)) {
    frame.settledDestinations[playerId] = { ...(input.destinations?.[playerId] ?? { kind: "discard" }) } as ZoneRef;
  }
  frame.stage = "settled";
  return records;
}

/** Masks the opponent's committed card until both cards are publicly revealed. */
export function getPindianView(frame: PindianFrame, viewerId: PlayerId): PindianView {
  const revealed = frame.stage === "modifying" || frame.stage === "compared" || frame.stage === "settled";
  const selectionView = Object.fromEntries(participantIds(frame).map((playerId) => [
    playerId,
    {
      selected: frame.selections[playerId] !== undefined,
      cardId: revealed || viewerId === playerId ? frame.selections[playerId] ?? null : null,
    },
  ]));
  return {
    frameId: frame.frameId,
    initiatorId: frame.initiatorId,
    targetId: frame.targetId,
    reasonSkillId: frame.reasonSkillId,
    stage: frame.stage,
    selections: selectionView,
    revealedRanks: revealed ? { ...frame.revealedRanks } : {},
    effectiveRanks: revealed ? { ...frame.effectiveRanks } : {},
    result: frame.result ? { ...frame.result } : null,
  };
}

export function clonePindianFrame(frame: PindianFrame): PindianFrame {
  return {
    ...frame,
    selections: { ...frame.selections },
    revealedRanks: { ...frame.revealedRanks },
    effectiveRanks: { ...frame.effectiveRanks },
    rankModifiers: frame.rankModifiers.map((modifier) => ({ ...modifier })),
    result: frame.result ? { ...frame.result } : null,
    settledDestinations: Object.fromEntries(Object.entries(frame.settledDestinations).map(([key, zone]) => [key, zone ? { ...zone } : zone])),
  };
}

export function assertPindianFrame(state: AtomicZoneState, frame: PindianFrame): void {
  if (!Number.isSafeInteger(frame.frameId) || frame.frameId <= 0) throw new PindianError("frameId is invalid");
  if (frame.initiatorId === frame.targetId || !frame.reasonSkillId) throw new PindianError("pindian metadata is invalid");
  const bothSelected = participantIds(frame).every((playerId) => frame.selections[playerId] !== undefined);
  if (frame.stage === "selecting") {
    if (bothSelected) throw new PindianError("completed selections did not advance the frame");
    for (const playerId of participantIds(frame)) {
      const cardId = frame.selections[playerId];
      if (!cardId) continue;
      const located = locatePindianCard(state, cardId);
      if (located.zone.kind !== "processing" || located.zone.frameId !== frame.frameId) {
        throw new PindianError("secret pindian commitment left its processing zone");
      }
    }
    return;
  }
  if (!bothSelected) throw new PindianError("active pindian is missing a selection");
  if (frame.stage === "ready_to_reveal") {
    for (const playerId of participantIds(frame)) {
      const located = locatePindianCard(state, frame.selections[playerId]!);
      if (located.zone.kind !== "processing" || located.zone.frameId !== frame.frameId) {
        throw new PindianError("committed pindian card left processing before reveal");
      }
    }
    return;
  }
  for (const playerId of participantIds(frame)) {
    const cardId = frame.selections[playerId]!;
    const located = locatePindianCard(state, cardId);
    if (frame.stage === "settled") {
      const destination = frame.settledDestinations[playerId];
      if (!destination || JSON.stringify(destination) !== JSON.stringify(located.zone)) throw new PindianError("settled pindian card is in the wrong zone");
    } else if (located.zone.kind !== "processing" || located.zone.frameId !== frame.frameId) {
      throw new PindianError("revealed pindian card is outside processing");
    }
    if (!frame.revealedRanks[playerId] || !frame.effectiveRanks[playerId]) throw new PindianError("revealed pindian ranks are incomplete");
  }
  if ((frame.stage === "compared" || frame.stage === "settled") && !frame.result) throw new PindianError("compared pindian has no result");
}
