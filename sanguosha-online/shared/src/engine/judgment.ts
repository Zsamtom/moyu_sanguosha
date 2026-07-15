import type { Card, CardId, CardRank, CardSuit, PlayerId } from "../types.js";
import {
  DeckServiceError,
  drawTopCards,
  type DeckServiceState,
} from "./deck.js";
import {
  ZoneMoveError,
  commitMoveBatch,
  locatePhysicalCard,
  type AtomicZoneState,
  type MoveRecord,
  type ZoneRef,
} from "./zones.js";

export type JudgmentColor = "red" | "black";
export type JudgmentStage =
  | "awaiting_reveal"
  | "retrial_window"
  | "ready_to_resolve"
  | "post_judgment_window"
  | "ready_to_settle"
  | "settled";

export interface JudgmentReason {
  readonly type: "delayed_trick" | "skill" | "armor";
  readonly id: string;
}

export interface JudgmentPattern {
  readonly suits?: readonly CardSuit[];
  readonly color?: JudgmentColor;
  readonly minimumRank?: CardRank;
  readonly maximumRank?: CardRank;
  /** Inverts the conjunction of the supplied suit/color/rank constraints. */
  readonly negate?: boolean;
}

/** A persisted, single-use position in either judgment timing window. */
export interface JudgmentOpportunity {
  readonly ownerId: PlayerId;
  readonly skillId: string;
}

export interface JudgmentReplacement {
  readonly actorId: PlayerId;
  readonly skillId: string;
  readonly oldCardId: CardId;
  readonly newCardId: CardId;
  readonly oldCardDestination: ZoneRef;
}

/**
 * A replayable effective-suit rule. `null` means unconditional; otherwise the
 * rule is applied only when the suit produced by earlier rules matches it.
 */
export interface JudgmentSuitModifier {
  readonly modifierId: string;
  readonly sourcePlayerId: PlayerId | null;
  readonly skillId: string;
  readonly fromSuit: CardSuit | null;
  readonly toSuit: CardSuit;
}

export interface EffectiveJudgmentCard {
  readonly cardId: CardId;
  readonly physicalSuit: CardSuit;
  readonly effectiveSuit: CardSuit;
  readonly rank: CardRank;
  readonly color: JudgmentColor;
}

export interface JudgmentFrame {
  readonly type: "judgment";
  readonly version: 2;
  readonly frameId: number;
  readonly targetId: PlayerId;
  readonly reason: JudgmentReason;
  /** Stored on the frame so recovery cannot substitute a different pattern. */
  readonly pattern: JudgmentPattern;
  readonly retrialOrder: JudgmentOpportunity[];
  readonly postJudgmentOrder: JudgmentOpportunity[];
  stage: JudgmentStage;
  retrialCursor: number;
  postJudgmentCursor: number;
  initialCardId: CardId | null;
  cardId: CardId | null;
  effectiveCard: EffectiveJudgmentCard | null;
  result: boolean | null;
  replacements: JudgmentReplacement[];
  suitModifiers: JudgmentSuitModifier[];
  settledTo: ZoneRef | null;
}

export interface JudgmentRevealTransition {
  readonly record: MoveRecord;
  /** The only deck state callers may persist after the reveal. */
  readonly deckState: DeckServiceState;
  readonly reshufflesUsed: number;
}

export class JudgmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JudgmentError";
  }
}

const SUITS: readonly CardSuit[] = ["spade", "heart", "club", "diamond"];
const COLORS: readonly JudgmentColor[] = ["red", "black"];
const STAGES: readonly JudgmentStage[] = [
  "awaiting_reveal",
  "retrial_window",
  "ready_to_resolve",
  "post_judgment_window",
  "ready_to_settle",
  "settled",
];

function colorOf(suit: CardSuit): JudgmentColor {
  return suit === "heart" || suit === "diamond" ? "red" : "black";
}

function isSuit(value: unknown): value is CardSuit {
  return typeof value === "string" && SUITS.includes(value as CardSuit);
}

function isRank(value: unknown): value is CardRank {
  return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= 13;
}

function assertFrameId(frameId: number): void {
  if (!Number.isSafeInteger(frameId) || frameId <= 0) throw new JudgmentError("frameId must be positive");
}

function assertPattern(pattern: JudgmentPattern): void {
  if (!pattern || typeof pattern !== "object") throw new JudgmentError("judgment pattern is missing");
  if (pattern.suits !== undefined) {
    if (!Array.isArray(pattern.suits) || pattern.suits.some((suit) => !isSuit(suit)) || new Set(pattern.suits).size !== pattern.suits.length) {
      throw new JudgmentError("judgment pattern contains invalid or duplicate suits");
    }
  }
  if (pattern.color !== undefined && !COLORS.includes(pattern.color)) {
    throw new JudgmentError("judgment pattern color is invalid");
  }
  if (pattern.minimumRank !== undefined && !isRank(pattern.minimumRank)) {
    throw new JudgmentError("judgment pattern minimum rank is invalid");
  }
  if (pattern.maximumRank !== undefined && !isRank(pattern.maximumRank)) {
    throw new JudgmentError("judgment pattern maximum rank is invalid");
  }
  if (pattern.minimumRank !== undefined && pattern.maximumRank !== undefined && pattern.minimumRank > pattern.maximumRank) {
    throw new JudgmentError("judgment pattern rank range is inverted");
  }
  if (pattern.negate !== undefined && typeof pattern.negate !== "boolean") {
    throw new JudgmentError("judgment pattern negate flag is invalid");
  }
}

function clonePattern(pattern: JudgmentPattern): JudgmentPattern {
  return {
    ...(pattern.suits === undefined ? {} : { suits: [...pattern.suits] }),
    ...(pattern.color === undefined ? {} : { color: pattern.color }),
    ...(pattern.minimumRank === undefined ? {} : { minimumRank: pattern.minimumRank }),
    ...(pattern.maximumRank === undefined ? {} : { maximumRank: pattern.maximumRank }),
    ...(pattern.negate === undefined ? {} : { negate: pattern.negate }),
  };
}

function assertOpportunityOrder(order: readonly JudgmentOpportunity[], label: string): void {
  if (!Array.isArray(order)) throw new JudgmentError(`${label} order is invalid`);
  for (const opportunity of order) {
    if (!opportunity || typeof opportunity !== "object" || !opportunity.ownerId || !opportunity.skillId) {
      throw new JudgmentError(`${label} opportunity metadata is incomplete`);
    }
  }
  const keys = order.map((entry) => `${entry.ownerId}\u0000${entry.skillId}`);
  if (new Set(keys).size !== keys.length) throw new JudgmentError(`${label} opportunities must be unique`);
}

function cloneOpportunity(opportunity: JudgmentOpportunity): JudgmentOpportunity {
  return { ownerId: opportunity.ownerId, skillId: opportunity.skillId };
}

function assertZoneRef(zone: ZoneRef): void {
  if (!zone || typeof zone !== "object") throw new JudgmentError("judgment destination is invalid");
  switch (zone.kind) {
    case "deck":
    case "discard":
      return;
    case "processing":
      assertFrameId(zone.frameId);
      return;
    case "hand":
    case "judgment":
      if (!zone.playerId) throw new JudgmentError("judgment destination player is missing");
      return;
    case "equipment":
      if (!zone.playerId || !["weapon", "armor", "offensive_horse", "defensive_horse"].includes(zone.slot)) {
        throw new JudgmentError("judgment equipment destination is invalid");
      }
      return;
    case "extra":
      if (!zone.playerId || !zone.pileId) throw new JudgmentError("judgment extra-pile destination is invalid");
      return;
    default:
      throw new JudgmentError("judgment destination kind is invalid");
  }
}

function sameZone(left: ZoneRef, right: ZoneRef): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case "deck":
    case "discard":
      return true;
    case "processing":
      return left.frameId === (right as Extract<ZoneRef, { kind: "processing" }>).frameId;
    case "hand":
    case "judgment":
      return left.playerId === (right as Extract<ZoneRef, { kind: typeof left.kind }>).playerId;
    case "equipment": {
      const candidate = right as Extract<ZoneRef, { kind: "equipment" }>;
      return left.playerId === candidate.playerId && left.slot === candidate.slot;
    }
    case "extra": {
      const candidate = right as Extract<ZoneRef, { kind: "extra" }>;
      return left.playerId === candidate.playerId && left.pileId === candidate.pileId;
    }
  }
}

function sameCard(left: Card, right: Card): boolean {
  return left.id === right.id && left.kind === right.kind && left.name === right.name &&
    left.category === right.category && left.suit === right.suit && left.rank === right.rank;
}

function assertZoneDeckMatchesService(state: AtomicZoneState, deckState: DeckServiceState): void {
  const samePile = (left: readonly Card[], right: readonly Card[]): boolean =>
    left.length === right.length && left.every((card, index) => {
      const candidate = right[index];
      return candidate !== undefined && sameCard(card, candidate);
    });
  if (!samePile(state.deck, deckState.drawPile) || !samePile(state.discard, deckState.discardPile)) {
    throw new JudgmentError("zone draw/discard piles do not match the authoritative deck state");
  }
}

function processingZone(frame: JudgmentFrame): ZoneRef {
  return { kind: "processing", frameId: frame.frameId };
}

function assertModifier(modifier: JudgmentSuitModifier): void {
  if (!modifier || typeof modifier !== "object" || !modifier.modifierId || !modifier.skillId) {
    throw new JudgmentError("judgment suit modifier metadata is incomplete");
  }
  if (modifier.sourcePlayerId !== null && !modifier.sourcePlayerId) {
    throw new JudgmentError("judgment suit modifier source is invalid");
  }
  if (modifier.fromSuit !== null && !isSuit(modifier.fromSuit)) {
    throw new JudgmentError("judgment suit modifier source suit is invalid");
  }
  if (!isSuit(modifier.toSuit)) throw new JudgmentError("judgment suit modifier target suit is invalid");
}

function effectiveFromPhysical(card: Card, modifiers: readonly JudgmentSuitModifier[]): EffectiveJudgmentCard {
  let suit = card.suit;
  for (const modifier of modifiers) {
    assertModifier(modifier);
    if (modifier.fromSuit === null || modifier.fromSuit === suit) suit = modifier.toSuit;
  }
  return {
    cardId: card.id,
    physicalSuit: card.suit,
    effectiveSuit: suit,
    rank: card.rank,
    color: colorOf(suit),
  };
}

function refreshEffectiveCard(state: AtomicZoneState, frame: JudgmentFrame): void {
  if (!frame.cardId) throw new JudgmentError("judgment has no revealed card");
  let located: ReturnType<typeof locatePhysicalCard>;
  try {
    located = locatePhysicalCard(state, frame.cardId);
  } catch (error) {
    if (error instanceof ZoneMoveError) throw new JudgmentError(error.message);
    throw error;
  }
  if (located.zone.kind !== "processing" || located.zone.frameId !== frame.frameId) {
    throw new JudgmentError("judgment card is outside its processing zone");
  }
  frame.effectiveCard = effectiveFromPhysical(located.card, frame.suitModifiers);
}

function retrialWindowExhausted(frame: JudgmentFrame): boolean {
  return frame.retrialCursor === frame.retrialOrder.length;
}

function postWindowExhausted(frame: JudgmentFrame): boolean {
  return frame.postJudgmentCursor === frame.postJudgmentOrder.length;
}

function currentOpportunity(
  order: readonly JudgmentOpportunity[],
  cursor: number,
): JudgmentOpportunity | null {
  const opportunity = order[cursor];
  return opportunity ? cloneOpportunity(opportunity) : null;
}

function assertCurrentOpportunity(
  expected: JudgmentOpportunity | undefined,
  ownerId: PlayerId,
  skillId: string,
  label: string,
): void {
  if (!expected || expected.ownerId !== ownerId || expected.skillId !== skillId) {
    throw new JudgmentError(`${label} is not the current ordered opportunity`);
  }
}

function advanceRetrialCursor(frame: JudgmentFrame): void {
  frame.retrialCursor += 1;
  if (retrialWindowExhausted(frame)) frame.stage = "ready_to_resolve";
}

export function createJudgmentFrame(input: {
  readonly frameId: number;
  readonly targetId: PlayerId;
  readonly reason: JudgmentReason;
  readonly pattern: JudgmentPattern;
  readonly retrialOrder?: readonly JudgmentOpportunity[];
  readonly postJudgmentOrder?: readonly JudgmentOpportunity[];
}): JudgmentFrame {
  assertFrameId(input.frameId);
  if (!input.targetId) throw new JudgmentError("judgment target is required");
  if (!input.reason?.id || !["delayed_trick", "skill", "armor"].includes(input.reason.type)) {
    throw new JudgmentError("judgment reason is invalid");
  }
  assertPattern(input.pattern);
  const retrialOrder = input.retrialOrder ?? [];
  const postJudgmentOrder = input.postJudgmentOrder ?? [];
  assertOpportunityOrder(retrialOrder, "retrial");
  assertOpportunityOrder(postJudgmentOrder, "post-judgment");
  return {
    type: "judgment",
    version: 2,
    frameId: input.frameId,
    targetId: input.targetId,
    reason: { ...input.reason },
    pattern: clonePattern(input.pattern),
    retrialOrder: retrialOrder.map(cloneOpportunity),
    postJudgmentOrder: postJudgmentOrder.map(cloneOpportunity),
    stage: "awaiting_reveal",
    retrialCursor: 0,
    postJudgmentCursor: 0,
    initialCardId: null,
    cardId: null,
    effectiveCard: null,
    result: null,
    replacements: [],
    suitModifiers: [],
    settledTo: null,
  };
}

/**
 * Draws through the deterministic deck service, then exposes that exact card in
 * this frame's public processing zone. Shuffle exhaustion remains atomic.
 */
export function revealJudgmentCard(
  state: AtomicZoneState,
  frame: JudgmentFrame,
  input: { readonly batchId: number; readonly deckState: DeckServiceState },
): JudgmentRevealTransition {
  if (frame.stage !== "awaiting_reveal" || frame.cardId !== null) {
    throw new JudgmentError("judgment card was already revealed");
  }
  if ((state.processing[String(frame.frameId)]?.length ?? 0) !== 0) {
    throw new JudgmentError("judgment processing zone is not empty before reveal");
  }
  assertZoneDeckMatchesService(state, input.deckState);

  let drawn: ReturnType<typeof drawTopCards>;
  try {
    drawn = drawTopCards(input.deckState, 1);
  } catch (error) {
    if (error instanceof DeckServiceError) throw new JudgmentError(error.message);
    throw error;
  }
  const card = drawn.cards[0];
  if (!card) throw new JudgmentError("deck service produced no judgment card");

  // Rebuild the service's post-shuffle, pre-draw piles, then let the atomic zone
  // mover perform the only physical move into processing.
  const originalDeck = [...state.deck];
  const originalDiscard = [...state.discard];
  state.deck.splice(0, state.deck.length, ...drawn.state.drawPile, card);
  state.discard.splice(0, state.discard.length, ...drawn.state.discardPile);
  let record: MoveRecord | undefined;
  try {
    [record] = commitMoveBatch(state, {
      batchId: input.batchId,
      intents: [{
        cardIds: [card.id],
        from: { kind: "deck" },
        to: processingZone(frame),
        reason: "judgment",
        visibility: "public",
        targetId: frame.targetId,
        frameId: frame.frameId,
      }],
    });
  } catch (error) {
    state.deck.splice(0, state.deck.length, ...originalDeck);
    state.discard.splice(0, state.discard.length, ...originalDiscard);
    if (error instanceof ZoneMoveError) throw new JudgmentError(error.message);
    throw error;
  }
  if (!record) {
    state.deck.splice(0, state.deck.length, ...originalDeck);
    state.discard.splice(0, state.discard.length, ...originalDiscard);
    throw new JudgmentError("judgment reveal produced no move record");
  }

  frame.initialCardId = card.id;
  frame.cardId = card.id;
  frame.stage = frame.retrialOrder.length === 0 ? "ready_to_resolve" : "retrial_window";
  frame.effectiveCard = effectiveFromPhysical(card, frame.suitModifiers);
  return Object.freeze({
    record,
    deckState: drawn.state,
    reshufflesUsed: drawn.reshufflesUsed,
  });
}

export function currentJudgmentRetrialOpportunity(frame: JudgmentFrame): JudgmentOpportunity | null {
  if (frame.stage !== "retrial_window") return null;
  return currentOpportunity(frame.retrialOrder, frame.retrialCursor);
}

/** Declines the current retrial opportunity and advances exactly one seat/skill. */
export function passJudgmentRetrial(frame: JudgmentFrame, ownerId: PlayerId, skillId: string): void {
  if (frame.stage !== "retrial_window") throw new JudgmentError("judgment is not accepting retrials");
  assertCurrentOpportunity(frame.retrialOrder[frame.retrialCursor], ownerId, skillId, "retrial");
  advanceRetrialCursor(frame);
}

/**
 * Atomically replaces the current card. Guicai passes discard for oldCardTo;
 * Guidao passes the skill owner's hand so the original card is gained.
 */
export function replaceJudgmentCard(
  state: AtomicZoneState,
  frame: JudgmentFrame,
  input: {
    readonly batchId: number;
    readonly actorId: PlayerId;
    readonly skillId: string;
    readonly replacementCardId: CardId;
    readonly replacementFrom: ZoneRef;
    readonly oldCardTo: ZoneRef;
  },
): readonly MoveRecord[] {
  if (frame.stage !== "retrial_window" || !frame.cardId) {
    throw new JudgmentError("judgment is not accepting retrials");
  }
  assertCurrentOpportunity(frame.retrialOrder[frame.retrialCursor], input.actorId, input.skillId, "retrial");
  if (!input.replacementCardId || input.replacementCardId === frame.cardId) {
    throw new JudgmentError("retrial replacement must be a different physical card");
  }
  assertZoneRef(input.replacementFrom);
  assertZoneRef(input.oldCardTo);
  if (sameZone(input.oldCardTo, processingZone(frame))) {
    throw new JudgmentError("retrial must remove the previous card from processing");
  }
  const oldCardId = frame.cardId;
  let records: readonly MoveRecord[];
  try {
    records = commitMoveBatch(state, {
      batchId: input.batchId,
      intents: [
        {
          cardIds: [oldCardId],
          from: processingZone(frame),
          to: input.oldCardTo,
          reason: input.oldCardTo.kind === "hand" ? "gain" : "retrial",
          visibility: "public",
          actorId: input.actorId,
          skillId: input.skillId as never,
          frameId: frame.frameId,
        },
        {
          cardIds: [input.replacementCardId],
          from: input.replacementFrom,
          to: processingZone(frame),
          reason: "retrial",
          visibility: "public",
          actorId: input.actorId,
          skillId: input.skillId as never,
          targetId: frame.targetId,
          frameId: frame.frameId,
        },
      ],
    });
  } catch (error) {
    if (error instanceof ZoneMoveError) throw new JudgmentError(error.message);
    throw error;
  }
  frame.cardId = input.replacementCardId;
  frame.replacements.push({
    actorId: input.actorId,
    skillId: input.skillId,
    oldCardId,
    newCardId: input.replacementCardId,
    oldCardDestination: { ...input.oldCardTo },
  });
  refreshEffectiveCard(state, frame);
  advanceRetrialCursor(frame);
  return records;
}

/** Adds a replayable identity rule without ever mutating the physical card. */
export function setEffectiveJudgmentSuit(
  state: AtomicZoneState,
  frame: JudgmentFrame,
  suit: CardSuit,
  input?: {
    readonly modifierId?: string;
    readonly sourcePlayerId?: PlayerId | null;
    readonly skillId?: string;
    readonly fromSuit?: CardSuit | null;
  },
): void {
  if (frame.stage !== "retrial_window" && frame.stage !== "ready_to_resolve") {
    throw new JudgmentError("effective suit can only change before resolution");
  }
  if (!isSuit(suit)) throw new JudgmentError("effective judgment suit is invalid");
  if (!frame.cardId) throw new JudgmentError("judgment has no revealed card");
  let located: ReturnType<typeof locatePhysicalCard>;
  try {
    located = locatePhysicalCard(state, frame.cardId);
  } catch (error) {
    if (error instanceof ZoneMoveError) throw new JudgmentError(error.message);
    throw error;
  }
  if (located.zone.kind !== "processing" || located.zone.frameId !== frame.frameId) {
    throw new JudgmentError("judgment card is outside its processing zone");
  }
  const skillId = input?.skillId ?? "effective_suit";
  const modifier: JudgmentSuitModifier = {
    modifierId: input?.modifierId ?? `${skillId}:${frame.suitModifiers.length + 1}`,
    sourcePlayerId: input?.sourcePlayerId ?? null,
    skillId,
    fromSuit: input?.fromSuit === undefined ? located.card.suit : input.fromSuit,
    toSuit: suit,
  };
  assertModifier(modifier);
  if (frame.suitModifiers.some((entry) => entry.modifierId === modifier.modifierId)) {
    throw new JudgmentError(`duplicate judgment suit modifier: ${modifier.modifierId}`);
  }
  frame.suitModifiers.push(modifier);
  refreshEffectiveCard(state, frame);
}

export function judgmentMatches(card: EffectiveJudgmentCard, pattern: JudgmentPattern): boolean {
  assertPattern(pattern);
  const matches =
    (pattern.suits === undefined || pattern.suits.includes(card.effectiveSuit)) &&
    (pattern.color === undefined || pattern.color === card.color) &&
    (pattern.minimumRank === undefined || card.rank >= pattern.minimumRank) &&
    (pattern.maximumRank === undefined || card.rank <= pattern.maximumRank);
  return pattern.negate ? !matches : matches;
}

/** Locks the stored pattern result only after every retrial opportunity ends. */
export function resolveJudgment(frame: JudgmentFrame): boolean {
  if (frame.stage !== "ready_to_resolve" || !frame.effectiveCard || !retrialWindowExhausted(frame)) {
    throw new JudgmentError("judgment retrial window is not exhausted");
  }
  frame.result = judgmentMatches(frame.effectiveCard, frame.pattern);
  frame.stage = frame.postJudgmentOrder.length === 0 ? "ready_to_settle" : "post_judgment_window";
  return frame.result;
}

export function currentJudgmentPostOpportunity(frame: JudgmentFrame): JudgmentOpportunity | null {
  if (frame.stage !== "post_judgment_window") return null;
  return currentOpportunity(frame.postJudgmentOrder, frame.postJudgmentCursor);
}

/** Completes (activated or declined) exactly the current post-judgment skill. */
export function completeJudgmentPostOpportunity(
  frame: JudgmentFrame,
  ownerId: PlayerId,
  skillId: string,
): void {
  if (frame.stage !== "post_judgment_window") {
    throw new JudgmentError("judgment is not resolving post-judgment skills");
  }
  assertCurrentOpportunity(frame.postJudgmentOrder[frame.postJudgmentCursor], ownerId, skillId, "post-judgment skill");
  frame.postJudgmentCursor += 1;
  if (postWindowExhausted(frame)) frame.stage = "ready_to_settle";
}

/** Moves the final physical card exactly once after all ownership triggers end. */
export function settleJudgmentCard(
  state: AtomicZoneState,
  frame: JudgmentFrame,
  input: {
    readonly batchId: number;
    readonly to: ZoneRef;
    readonly actorId?: PlayerId | null;
    readonly skillId?: string | null;
    readonly visibility?: "public" | "owner";
  },
): MoveRecord {
  if (frame.stage !== "ready_to_settle" || frame.result === null || !frame.cardId || !postWindowExhausted(frame)) {
    throw new JudgmentError("judgment post-skill window must finish before settlement");
  }
  assertZoneRef(input.to);
  if (sameZone(input.to, processingZone(frame))) {
    throw new JudgmentError("judgment settlement must leave processing");
  }
  let records: readonly MoveRecord[];
  try {
    records = commitMoveBatch(state, {
      batchId: input.batchId,
      intents: [{
        cardIds: [frame.cardId],
        from: processingZone(frame),
        to: input.to,
        reason: input.to.kind === "discard" ? "judgment" : "gain",
        visibility: input.visibility ?? "public",
        actorId: input.actorId,
        skillId: (input.skillId ?? undefined) as never,
        targetId: input.to.kind === "hand" || input.to.kind === "extra" || input.to.kind === "judgment"
          ? input.to.playerId
          : undefined,
        frameId: frame.frameId,
      }],
    });
  } catch (error) {
    if (error instanceof ZoneMoveError) throw new JudgmentError(error.message);
    throw error;
  }
  const record = records[0];
  if (!record) throw new JudgmentError("judgment settlement produced no move record");
  frame.stage = "settled";
  frame.settledTo = { ...input.to };
  return record;
}

export function cloneJudgmentFrame(frame: JudgmentFrame): JudgmentFrame {
  return {
    ...frame,
    reason: { ...frame.reason },
    pattern: clonePattern(frame.pattern),
    retrialOrder: frame.retrialOrder.map(cloneOpportunity),
    postJudgmentOrder: frame.postJudgmentOrder.map(cloneOpportunity),
    effectiveCard: frame.effectiveCard ? { ...frame.effectiveCard } : null,
    replacements: frame.replacements.map((replacement) => ({
      ...replacement,
      oldCardDestination: { ...replacement.oldCardDestination },
    })),
    suitModifiers: frame.suitModifiers.map((modifier) => ({ ...modifier })),
    settledTo: frame.settledTo ? { ...frame.settledTo } : null,
  };
}

function assertCursor(cursor: number, length: number, label: string): void {
  if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > length) {
    throw new JudgmentError(`${label} cursor is invalid`);
  }
}

function assertEffectiveEquals(actual: EffectiveJudgmentCard, expected: EffectiveJudgmentCard): void {
  if (actual.cardId !== expected.cardId || actual.physicalSuit !== expected.physicalSuit ||
      actual.effectiveSuit !== expected.effectiveSuit || actual.rank !== expected.rank || actual.color !== expected.color) {
    throw new JudgmentError("effective judgment card does not match its physical card and modifier history");
  }
}

/** Strict restore-time validation; no derived effective/result fact is trusted. */
export function assertJudgmentFrame(state: AtomicZoneState, frame: JudgmentFrame): void {
  if (!frame || typeof frame !== "object" || frame.type !== "judgment" || frame.version !== 2) {
    throw new JudgmentError("judgment frame version is invalid");
  }
  assertFrameId(frame.frameId);
  if (!frame.targetId || !frame.reason?.id || !["delayed_trick", "skill", "armor"].includes(frame.reason.type)) {
    throw new JudgmentError("judgment metadata is incomplete");
  }
  assertPattern(frame.pattern);
  assertOpportunityOrder(frame.retrialOrder, "retrial");
  assertOpportunityOrder(frame.postJudgmentOrder, "post-judgment");
  if (!STAGES.includes(frame.stage)) throw new JudgmentError("judgment stage is invalid");
  assertCursor(frame.retrialCursor, frame.retrialOrder.length, "retrial");
  assertCursor(frame.postJudgmentCursor, frame.postJudgmentOrder.length, "post-judgment");
  if (!Array.isArray(frame.replacements) || !Array.isArray(frame.suitModifiers)) {
    throw new JudgmentError("judgment history is invalid");
  }
  frame.suitModifiers.forEach(assertModifier);
  const modifierIds = frame.suitModifiers.map((modifier) => modifier.modifierId);
  if (new Set(modifierIds).size !== modifierIds.length) {
    throw new JudgmentError("judgment suit modifier ids must be unique");
  }

  if (frame.stage === "awaiting_reveal") {
    if (frame.initialCardId !== null || frame.cardId !== null || frame.effectiveCard !== null ||
        frame.result !== null || frame.replacements.length !== 0 || frame.suitModifiers.length !== 0 ||
        frame.retrialCursor !== 0 || frame.postJudgmentCursor !== 0 || frame.settledTo !== null) {
      throw new JudgmentError("unrevealed judgment contains active or resolved state");
    }
    return;
  }

  if (!frame.initialCardId || !frame.cardId || !frame.effectiveCard || frame.effectiveCard.cardId !== frame.cardId) {
    throw new JudgmentError("revealed judgment card metadata is inconsistent");
  }
  let chainCardId = frame.initialCardId;
  const seenCardIds = new Set<CardId>([chainCardId]);
  for (const replacement of frame.replacements) {
    if (!replacement.actorId || !replacement.skillId || !replacement.oldCardId || !replacement.newCardId) {
      throw new JudgmentError("judgment replacement metadata is incomplete");
    }
    assertZoneRef(replacement.oldCardDestination);
    if (replacement.oldCardId !== chainCardId || replacement.oldCardId === replacement.newCardId || seenCardIds.has(replacement.newCardId)) {
      throw new JudgmentError("judgment replacement history is not a valid physical-card chain");
    }
    chainCardId = replacement.newCardId;
    seenCardIds.add(chainCardId);
  }
  if (chainCardId !== frame.cardId || frame.replacements.length > frame.retrialCursor) {
    throw new JudgmentError("judgment replacement history disagrees with its retrial cursor/card");
  }

  let located: ReturnType<typeof locatePhysicalCard>;
  try {
    located = locatePhysicalCard(state, frame.cardId);
  } catch (error) {
    if (error instanceof ZoneMoveError) throw new JudgmentError(error.message);
    throw error;
  }
  if (frame.stage === "settled") {
    if (!frame.settledTo) throw new JudgmentError("settled judgment has no destination");
    assertZoneRef(frame.settledTo);
    if (!sameZone(located.zone, frame.settledTo)) throw new JudgmentError("settled judgment card is in the wrong zone");
  } else {
    if (frame.settledTo !== null) throw new JudgmentError("active judgment already has a settlement destination");
    if (located.zone.kind !== "processing" || located.zone.frameId !== frame.frameId) {
      throw new JudgmentError("active judgment card is outside processing");
    }
  }
  assertEffectiveEquals(frame.effectiveCard, effectiveFromPhysical(located.card, frame.suitModifiers));

  const resultExpected = judgmentMatches(frame.effectiveCard, frame.pattern);
  switch (frame.stage) {
    case "retrial_window":
      if (frame.retrialOrder.length === 0 || frame.retrialCursor >= frame.retrialOrder.length ||
          frame.postJudgmentCursor !== 0 || frame.result !== null) {
        throw new JudgmentError("active retrial window state is inconsistent");
      }
      break;
    case "ready_to_resolve":
      if (!retrialWindowExhausted(frame) || frame.postJudgmentCursor !== 0 || frame.result !== null) {
        throw new JudgmentError("judgment is not actually ready to resolve");
      }
      break;
    case "post_judgment_window":
      if (!retrialWindowExhausted(frame) || frame.postJudgmentOrder.length === 0 ||
          frame.postJudgmentCursor >= frame.postJudgmentOrder.length || frame.result !== resultExpected) {
        throw new JudgmentError("post-judgment window state is inconsistent");
      }
      break;
    case "ready_to_settle":
      if (!retrialWindowExhausted(frame) || !postWindowExhausted(frame) || frame.result !== resultExpected) {
        throw new JudgmentError("judgment is not actually ready to settle");
      }
      break;
    case "settled":
      if (!retrialWindowExhausted(frame) || !postWindowExhausted(frame) || frame.result !== resultExpected) {
        throw new JudgmentError("settled judgment result/window state is inconsistent");
      }
      break;
  }
}
