import type { Card, CardId, EquipmentSlot, GeneralSkillId, PlayerId } from "../types.js";

export type ZoneRef =
  | { readonly kind: "deck" }
  | { readonly kind: "discard" }
  | { readonly kind: "processing"; readonly frameId: number }
  | { readonly kind: "hand"; readonly playerId: PlayerId }
  | { readonly kind: "equipment"; readonly playerId: PlayerId; readonly slot: EquipmentSlot }
  | { readonly kind: "judgment"; readonly playerId: PlayerId }
  | { readonly kind: "extra"; readonly playerId: PlayerId; readonly pileId: string };

export type ZonePlacement = "append" | "deck_top" | "deck_bottom";
export type MoveVisibility = "public" | "owner" | "source_and_target" | "server_only";
export type MoveReason =
  | "draw"
  | "use"
  | "respond"
  | "discard"
  | "gain"
  | "give"
  | "steal"
  | "equip"
  | "replace_equipment"
  | "judgment"
  | "retrial"
  | "pindian"
  | "death"
  | "skill_cost"
  | "skill_effect"
  | "recast"
  | "deck_reorder";

export interface ZonePlayerState {
  readonly id: PlayerId;
  hand: Card[];
  equipment: Partial<Record<EquipmentSlot, Card>>;
  judgment: Card[];
  extraPiles: Record<string, Card[]>;
}

/** Mutable storage used by the atomic mover. Adapters can project GameSession into this shape. */
export interface AtomicZoneState {
  deck: Card[];
  discard: Card[];
  processing: Record<string, Card[]>;
  players: ZonePlayerState[];
}

export interface MoveIntent {
  /** For deck destinations, IDs are always ordered by their future draw order. */
  readonly cardIds: readonly CardId[];
  readonly from: ZoneRef;
  readonly to: ZoneRef;
  readonly placement?: ZonePlacement;
  readonly reason: MoveReason;
  readonly visibility: MoveVisibility;
  readonly actorId?: PlayerId | null;
  readonly sourceId?: PlayerId | null;
  readonly targetId?: PlayerId | null;
  readonly skillId?: GeneralSkillId | null;
  readonly useId?: number | null;
  readonly frameId?: number | null;
}

export interface MoveBatch {
  readonly batchId: number;
  readonly intents: readonly MoveIntent[];
}

export interface MoveRecord extends Omit<MoveIntent, "cardIds"> {
  readonly batchId: number;
  readonly cardIds: readonly CardId[];
  readonly cards: readonly Card[];
}

export interface LocatedCard {
  readonly card: Card;
  readonly zone: ZoneRef;
  readonly index: number;
}

export class ZoneMoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZoneMoveError";
  }
}

const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = [
  "weapon",
  "armor",
  "offensive_horse",
  "defensive_horse",
];

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

function playerFor(state: AtomicZoneState, playerId: PlayerId): ZonePlayerState {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new ZoneMoveError(`unknown player: ${playerId}`);
  return player;
}

function arrayFor(state: AtomicZoneState, zone: Exclude<ZoneRef, { kind: "equipment" }>): Card[] {
  switch (zone.kind) {
    case "deck":
      return state.deck;
    case "discard":
      return state.discard;
    case "processing":
      if (!Number.isSafeInteger(zone.frameId) || zone.frameId <= 0) throw new ZoneMoveError("processing frameId must be positive");
      return (state.processing[String(zone.frameId)] ??= []);
    case "hand":
      return playerFor(state, zone.playerId).hand;
    case "judgment":
      return playerFor(state, zone.playerId).judgment;
    case "extra":
      return (playerFor(state, zone.playerId).extraPiles[zone.pileId] ??= []);
  }
}

function cardAt(state: AtomicZoneState, zone: ZoneRef, cardId: CardId): LocatedCard | null {
  if (zone.kind === "equipment") {
    const card = playerFor(state, zone.playerId).equipment[zone.slot];
    return card?.id === cardId ? { card, zone: { ...zone }, index: 0 } : null;
  }
  const cards = arrayFor(state, zone);
  const index = cards.findIndex((card) => card.id === cardId);
  const card = cards[index];
  return index >= 0 && card ? { card, zone: { ...zone }, index } : null;
}

function allLocations(state: AtomicZoneState): LocatedCard[] {
  const locations: LocatedCard[] = [];
  const appendArray = (cards: readonly Card[], zone: ZoneRef): void => {
    cards.forEach((card, index) => locations.push({ card, zone, index }));
  };
  appendArray(state.deck, { kind: "deck" });
  appendArray(state.discard, { kind: "discard" });
  for (const [frameId, cards] of Object.entries(state.processing)) {
    const numericFrameId = Number(frameId);
    if (!Number.isSafeInteger(numericFrameId) || numericFrameId <= 0 || String(numericFrameId) !== frameId) {
      throw new ZoneMoveError(`invalid processing frame id: ${frameId}`);
    }
    appendArray(cards, { kind: "processing", frameId: numericFrameId });
  }
  const playerIds = state.players.map((player) => player.id);
  if (playerIds.some((id) => !id) || new Set(playerIds).size !== playerIds.length) {
    throw new ZoneMoveError("zone players must have unique nonempty ids");
  }
  for (const player of state.players) {
    appendArray(player.hand, { kind: "hand", playerId: player.id });
    appendArray(player.judgment, { kind: "judgment", playerId: player.id });
    for (const slot of EQUIPMENT_SLOTS) {
      const card = player.equipment[slot];
      if (card) locations.push({ card, zone: { kind: "equipment", playerId: player.id, slot }, index: 0 });
    }
    for (const [pileId, cards] of Object.entries(player.extraPiles)) {
      if (!pileId) throw new ZoneMoveError(`empty extra-pile id for ${player.id}`);
      appendArray(cards, { kind: "extra", playerId: player.id, pileId });
    }
  }
  return locations;
}

export function locatePhysicalCard(state: AtomicZoneState, cardId: CardId): LocatedCard {
  const matches = allLocations(state).filter((location) => location.card.id === cardId);
  if (matches.length !== 1) {
    throw new ZoneMoveError(`card ${cardId} must occupy exactly one zone; found ${matches.length}`);
  }
  return matches[0]!;
}

/** Returns all physical IDs after proving that none are duplicated. */
export function assertCardConservation(
  state: AtomicZoneState,
  expectedCardIds?: readonly CardId[],
): readonly CardId[] {
  const ids = allLocations(state).map((location) => location.card.id);
  const unique = new Set(ids);
  if (unique.size !== ids.length) throw new ZoneMoveError("a physical card occupies more than one zone");
  if (expectedCardIds) {
    const expected = [...expectedCardIds].sort();
    const actual = [...ids].sort();
    if (new Set(expected).size !== expected.length || actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
      throw new ZoneMoveError("physical card conservation check failed");
    }
  }
  return Object.freeze([...ids]);
}

function cloneZoneState(state: AtomicZoneState): AtomicZoneState {
  return {
    deck: [...state.deck],
    discard: [...state.discard],
    processing: Object.fromEntries(Object.entries(state.processing).map(([key, cards]) => [key, [...cards]])),
    players: state.players.map((player) => ({
      id: player.id,
      hand: [...player.hand],
      equipment: { ...player.equipment },
      judgment: [...player.judgment],
      extraPiles: Object.fromEntries(Object.entries(player.extraPiles).map(([key, cards]) => [key, [...cards]])),
    })),
  };
}

function removeFrom(state: AtomicZoneState, zone: ZoneRef, cardId: CardId): Card {
  const located = cardAt(state, zone, cardId);
  if (!located) throw new ZoneMoveError(`card ${cardId} is not in declared source ${JSON.stringify(zone)}`);
  if (zone.kind === "equipment") {
    delete playerFor(state, zone.playerId).equipment[zone.slot];
    return located.card;
  }
  const removed = arrayFor(state, zone).splice(located.index, 1)[0];
  if (!removed) throw new ZoneMoveError(`failed to remove ${cardId}`);
  return removed;
}

function addTo(state: AtomicZoneState, zone: ZoneRef, card: Card, placement: ZonePlacement): void {
  if (zone.kind === "equipment") {
    const equipment = playerFor(state, zone.playerId).equipment;
    if (equipment[zone.slot]) throw new ZoneMoveError(`${zone.playerId}'s ${zone.slot} slot is occupied`);
    if (placement !== "append") throw new ZoneMoveError("equipment destinations only support append placement");
    equipment[zone.slot] = card;
    return;
  }
  const cards = arrayFor(state, zone);
  if (placement === "deck_top" || placement === "deck_bottom") {
    if (zone.kind !== "deck") throw new ZoneMoveError(`${placement} is only valid for the deck`);
    if (placement === "deck_top") cards.push(card);
    else cards.unshift(card);
    return;
  }
  cards.push(card);
}

function addManyTo(state: AtomicZoneState, zone: ZoneRef, cards: readonly Card[], placement: ZonePlacement): void {
  if (zone.kind === "deck" && (placement === "deck_top" || placement === "deck_bottom")) {
    const storageOrder = [...cards].reverse();
    if (placement === "deck_top") state.deck.push(...storageOrder);
    else state.deck.unshift(...storageOrder);
    return;
  }
  for (const card of cards) addTo(state, zone, card, placement);
}

function applyIntent(state: AtomicZoneState, batchId: number, intent: MoveIntent): MoveRecord {
  if (intent.cardIds.length === 0) throw new ZoneMoveError("move intent must contain at least one card");
  if (new Set(intent.cardIds).size !== intent.cardIds.length) throw new ZoneMoveError("move intent contains duplicate cards");
  if (sameZone(intent.from, intent.to)) throw new ZoneMoveError("a move must change zones");
  const placement = intent.placement ?? "append";
  if (intent.to.kind === "deck" && placement === "append") {
    throw new ZoneMoveError("deck destinations require deck_top or deck_bottom placement");
  }
  const cards = intent.cardIds.map((cardId) => removeFrom(state, intent.from, cardId));
  addManyTo(state, intent.to, cards, placement);
  return Object.freeze({
    ...intent,
    from: Object.freeze({ ...intent.from }),
    to: Object.freeze({ ...intent.to }),
    cardIds: Object.freeze([...intent.cardIds]),
    cards: Object.freeze(cards.map((card) => Object.freeze({ ...card }))),
    placement,
    batchId,
  });
}

function replaceState(target: AtomicZoneState, source: AtomicZoneState): void {
  target.deck.splice(0, target.deck.length, ...source.deck);
  target.discard.splice(0, target.discard.length, ...source.discard);
  for (const key of Object.keys(target.processing)) delete target.processing[key];
  for (const [key, cards] of Object.entries(source.processing)) target.processing[key] = [...cards];
  if (target.players.length !== source.players.length || target.players.some((player, index) => player.id !== source.players[index]?.id)) {
    throw new ZoneMoveError("player ordering changed while committing a move batch");
  }
  target.players.forEach((player, index) => {
    const replacement = source.players[index]!;
    player.hand.splice(0, player.hand.length, ...replacement.hand);
    player.judgment.splice(0, player.judgment.length, ...replacement.judgment);
    for (const slot of EQUIPMENT_SLOTS) delete player.equipment[slot];
    Object.assign(player.equipment, replacement.equipment);
    for (const key of Object.keys(player.extraPiles)) delete player.extraPiles[key];
    for (const [key, cards] of Object.entries(replacement.extraPiles)) player.extraPiles[key] = [...cards];
  });
}

/**
 * Validates and applies every intent against an isolated copy. The live state
 * changes only after the whole batch succeeds, so a later invalid intent cannot
 * leave an earlier card half moved.
 */
export function commitMoveBatch(state: AtomicZoneState, batch: MoveBatch): readonly MoveRecord[] {
  if (!Number.isSafeInteger(batch.batchId) || batch.batchId <= 0) throw new ZoneMoveError("batchId must be positive");
  if (batch.intents.length === 0) throw new ZoneMoveError("move batch must contain at least one intent");
  const allIds = batch.intents.flatMap((intent) => [...intent.cardIds]);
  if (new Set(allIds).size !== allIds.length) throw new ZoneMoveError("a card may move only once in a batch");

  const expectedIds = assertCardConservation(state);
  const staged = cloneZoneState(state);
  const records = batch.intents.map((intent) => applyIntent(staged, batch.batchId, intent));
  assertCardConservation(staged, expectedIds);
  replaceState(state, staged);
  return Object.freeze(records);
}
