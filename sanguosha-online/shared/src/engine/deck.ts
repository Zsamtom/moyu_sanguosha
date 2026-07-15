import { randomInteger, type ChaCha20State } from "../prng.js";
import type { Card, CardId } from "../types.js";

/** The array end of `drawPile` is the top, matching the legacy session. */
export interface DeckServiceState {
  readonly drawPile: readonly Card[];
  readonly discardPile: readonly Card[];
  readonly rng: ChaCha20State;
  /** Original-project exhaustion counter; reaching zero ends the game as a draw. */
  readonly reshufflesRemaining: number;
}

export interface DeckDrawTransition {
  readonly state: DeckServiceState;
  /** Cards in exact physical draw order. */
  readonly cards: readonly Card[];
  readonly reshufflesUsed: number;
}

export interface DeckReorderTransition {
  readonly state: DeckServiceState;
  /** Selected cards in their former draw order. */
  readonly selectedCards: readonly Card[];
}

export class DeckServiceError extends Error {
  readonly code: "INVALID_DECK" | "INVALID_SELECTION" | "NO_CARDS" | "GAME_DRAW";

  constructor(code: DeckServiceError["code"], message: string) {
    super(message);
    this.name = "DeckServiceError";
    this.code = code;
  }
}

const cloneCard = (card: Card): Card => ({ ...card });

function cloneState(state: DeckServiceState): {
  drawPile: Card[];
  discardPile: Card[];
  rng: ChaCha20State;
  reshufflesRemaining: number;
} {
  assertDeckServiceState(state);
  return {
    drawPile: state.drawPile.map(cloneCard),
    discardPile: state.discardPile.map(cloneCard),
    rng: { ...state.rng },
    reshufflesRemaining: state.reshufflesRemaining,
  };
}

function immutableState(state: {
  drawPile: Card[];
  discardPile: Card[];
  rng: ChaCha20State;
  reshufflesRemaining: number;
}): DeckServiceState {
  return Object.freeze({
    drawPile: Object.freeze(state.drawPile.map((card) => Object.freeze({ ...card }))),
    discardPile: Object.freeze(state.discardPile.map((card) => Object.freeze({ ...card }))),
    rng: Object.freeze({ ...state.rng }),
    reshufflesRemaining: state.reshufflesRemaining,
  });
}

function shuffle(cards: readonly Card[], initialRng: ChaCha20State): { cards: Card[]; rng: ChaCha20State } {
  const result = cards.map(cloneCard);
  let rng = { ...initialRng };
  for (let index = result.length - 1; index > 0; index -= 1) {
    const generated = randomInteger(rng, index + 1);
    rng = generated.state;
    [result[index], result[generated.value]] = [result[generated.value]!, result[index]!];
  }
  return { cards: result, rng };
}

function refill(state: ReturnType<typeof cloneState>): void {
  if (state.drawPile.length > 0) return;
  if (state.discardPile.length === 0) {
    throw new DeckServiceError("NO_CARDS", "draw and discard piles are both empty");
  }
  // CardsHeap.shuffle() decrements first and calls the game a draw when the
  // counter reaches zero, so an initial value of five permits four shuffles.
  if (state.reshufflesRemaining <= 1) {
    throw new DeckServiceError("GAME_DRAW", "the original-project shuffle limit was reached");
  }
  const shuffled = shuffle(state.discardPile, state.rng);
  state.drawPile = shuffled.cards;
  state.discardPile = [];
  state.rng = shuffled.rng;
  state.reshufflesRemaining -= 1;
}

export function assertDeckServiceState(state: DeckServiceState): void {
  if (!state || typeof state !== "object") throw new DeckServiceError("INVALID_DECK", "deck state is missing");
  if (!Number.isSafeInteger(state.reshufflesRemaining) || state.reshufflesRemaining < 0 || state.reshufflesRemaining > 100) {
    throw new DeckServiceError("INVALID_DECK", "reshuffle counter is invalid");
  }
  if (!/^[0-9a-f]{64}$/i.test(state.rng.key) || !Number.isSafeInteger(state.rng.counter) || state.rng.counter < 0 || state.rng.counter > 0xffff_ffff) {
    throw new DeckServiceError("INVALID_DECK", "deck RNG state is invalid");
  }
  const ids = [...state.drawPile, ...state.discardPile].map((card) => card.id);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    throw new DeckServiceError("INVALID_DECK", "draw/discard piles contain missing or duplicate physical cards");
  }
}

/** Draws atomically; a game-draw exhaustion leaves the input untouched. */
export function drawTopCards(state: DeckServiceState, count: number): DeckDrawTransition {
  if (!Number.isSafeInteger(count) || count < 0) throw new DeckServiceError("INVALID_SELECTION", "draw count must be nonnegative");
  const next = cloneState(state);
  const initialCounter = next.reshufflesRemaining;
  const cards: Card[] = [];
  while (cards.length < count) {
    refill(next);
    const card = next.drawPile.pop();
    if (!card) throw new DeckServiceError("NO_CARDS", "deck refill produced no card");
    cards.push(card);
  }
  return Object.freeze({
    state: immutableState(next),
    cards: Object.freeze(cards.map((card) => Object.freeze({ ...card }))),
    reshufflesUsed: initialCounter - next.reshufflesRemaining,
  });
}

/** Server-only peek in future draw order; RNG and state are unchanged. */
export function peekTopCards(state: DeckServiceState, count: number): readonly Card[] {
  assertDeckServiceState(state);
  if (!Number.isSafeInteger(count) || count < 0 || count > state.drawPile.length) {
    throw new DeckServiceError("INVALID_SELECTION", "peek count exceeds the current draw pile");
  }
  return Object.freeze(state.drawPile.slice(-count).reverse().map((card) => Object.freeze({ ...card })));
}

/**
 * Reorders exactly the current top N cards. Both arrays use future draw order:
 * top cards are drawn next; bottom cards are drawn after the untouched pile.
 */
export function reorderTopCards(
  state: DeckServiceState,
  input: {
    readonly selectedCardIds: readonly CardId[];
    readonly topInDrawOrder: readonly CardId[];
    readonly bottomInDrawOrder: readonly CardId[];
  },
): DeckReorderTransition {
  const next = cloneState(state);
  const selectedCount = input.selectedCardIds.length;
  if (selectedCount === 0 || selectedCount > next.drawPile.length) {
    throw new DeckServiceError("INVALID_SELECTION", "reorder selection size is invalid");
  }
  const currentTop = next.drawPile.slice(-selectedCount).reverse();
  const currentIds = currentTop.map((card) => card.id);
  const sameSet = (left: readonly CardId[], right: readonly CardId[]): boolean =>
    left.length === right.length &&
    new Set(left).size === left.length &&
    [...left].sort().every((id, index) => id === [...right].sort()[index]);
  if (!sameSet(input.selectedCardIds, currentIds)) {
    throw new DeckServiceError("INVALID_SELECTION", "selection is not exactly the current top cards");
  }
  const ordered = [...input.topInDrawOrder, ...input.bottomInDrawOrder];
  if (!sameSet(ordered, currentIds)) {
    throw new DeckServiceError("INVALID_SELECTION", "top and bottom orders must partition the selected cards");
  }
  const cardById = new Map(currentTop.map((card) => [card.id, card]));
  next.drawPile.splice(next.drawPile.length - selectedCount, selectedCount);
  const inStorageOrder = (ids: readonly CardId[]): Card[] =>
    [...ids].reverse().map((id) => {
      const selected = cardById.get(id);
      if (!selected) throw new DeckServiceError("INVALID_SELECTION", `selected card is missing: ${id}`);
      return selected;
    });
  next.drawPile = [
    ...inStorageOrder(input.bottomInDrawOrder),
    ...next.drawPile,
    ...inStorageOrder(input.topInDrawOrder),
  ];
  return Object.freeze({
    state: immutableState(next),
    selectedCards: Object.freeze(currentTop.map((card) => Object.freeze({ ...card }))),
  });
}
