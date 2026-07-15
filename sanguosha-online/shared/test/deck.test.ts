import { describe, expect, it } from "vitest";

import {
  drawTopCards,
  peekTopCards,
  reorderTopCards,
  type Card,
  type DeckServiceState,
} from "../src/index.js";

const seed = "9".repeat(64);
const card = (id: string): Card => ({
  id, kind: "slash", name: "杀", category: "basic", suit: "spade", rank: 1,
});
const state = (draw: string[], discard: string[] = [], remaining = 5): DeckServiceState => ({
  drawPile: draw.map(card),
  discardPile: discard.map(card),
  rng: { key: seed, counter: 0 },
  reshufflesRemaining: remaining,
});

describe("deterministic deck service", () => {
  it("uses the array end as top and returns physical draw order", () => {
    const result = drawTopCards(state(["bottom", "middle", "top"]), 2);
    expect(result.cards.map((entry) => entry.id)).toEqual(["top", "middle"]);
    expect(result.state.drawPile.map((entry) => entry.id)).toEqual(["bottom"]);
    expect(result.reshufflesUsed).toBe(0);
  });

  it("reshuffles deterministically without admitting processing cards", () => {
    const first = drawTopCards(state([], ["a", "b", "c"], 5), 3);
    const second = drawTopCards(state([], ["a", "b", "c"], 5), 3);
    expect(first.cards.map((entry) => entry.id)).toEqual(second.cards.map((entry) => entry.id));
    expect(first.state.rng.counter).toBeGreaterThan(0);
    expect(first.state.reshufflesRemaining).toBe(4);
    expect(first.reshufflesUsed).toBe(1);
    expect(first.state.discardPile).toEqual([]);
  });

  it("treats the final exhaustion as a game draw and is atomic", () => {
    const original = state([], ["a", "b"], 1);
    expect(() => drawTopCards(original, 1)).toThrowError(expect.objectContaining({ code: "GAME_DRAW" }));
    expect(original.discardPile.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(original.rng.counter).toBe(0);
  });

  it("makes the top/bottom contract explicit for Guanxing-style reorders", () => {
    const original = state(["x", "c", "b", "a"]);
    expect(peekTopCards(original, 3).map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    const reordered = reorderTopCards(original, {
      selectedCardIds: ["a", "b", "c"],
      topInDrawOrder: ["b", "a"],
      bottomInDrawOrder: ["c"],
    });
    expect(drawTopCards(reordered.state, 4).cards.map((entry) => entry.id)).toEqual(["b", "a", "x", "c"]);
    expect(original.drawPile.map((entry) => entry.id)).toEqual(["x", "c", "b", "a"]);
  });

  it("rejects non-top selections and duplicate physical cards", () => {
    expect(() => reorderTopCards(state(["x", "c", "b", "a"]), {
      selectedCardIds: ["a", "b", "x"],
      topInDrawOrder: ["a", "b"],
      bottomInDrawOrder: ["x"],
    })).toThrowError(expect.objectContaining({ code: "INVALID_SELECTION" }));
    expect(() => drawTopCards(state(["a", "a"]), 1)).toThrowError(
      expect.objectContaining({ code: "INVALID_DECK" }),
    );
  });
});
