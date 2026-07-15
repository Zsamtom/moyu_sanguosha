import { describe, expect, it } from "vitest";

import type { Card, CardKind, CardSuit } from "../src/types.js";
import {
  ZoneMoveError,
  assertCardConservation,
  commitMoveBatch,
  locatePhysicalCard,
  type AtomicZoneState,
} from "../src/engine/zones.js";

function card(id: string, kind: CardKind = "slash", suit: CardSuit = "spade"): Card {
  return { id, kind, name: kind === "dodge" ? "闪" : "杀", category: "basic", suit, rank: 7 } as Card;
}

function state(): AtomicZoneState {
  return {
    deck: [card("bottom"), card("top")],
    discard: [],
    processing: {},
    players: [
      { id: "p1", hand: [card("h1"), card("h2")], equipment: { weapon: card("old-weapon", "gu_ding_dao") }, judgment: [], extraPiles: {} },
      { id: "p2", hand: [card("h3")], equipment: {}, judgment: [card("delay", "le_bu_si_shu")], extraPiles: {} },
    ],
  };
}

describe("atomic zone moves", () => {
  it("moves a batch atomically and records exact immutable provenance", () => {
    const game = state();
    const records = commitMoveBatch(game, {
      batchId: 1,
      intents: [
        { cardIds: ["h1"], from: { kind: "hand", playerId: "p1" }, to: { kind: "processing", frameId: 9 }, reason: "use", visibility: "public", actorId: "p1", frameId: 9 },
        { cardIds: ["h3"], from: { kind: "hand", playerId: "p2" }, to: { kind: "hand", playerId: "p1" }, reason: "give", visibility: "source_and_target", sourceId: "p2", targetId: "p1" },
      ],
    });

    expect(game.processing["9"]?.map((entry) => entry.id)).toEqual(["h1"]);
    expect(game.players[0]?.hand.map((entry) => entry.id)).toEqual(["h2", "h3"]);
    expect(game.players[1]?.hand).toEqual([]);
    expect(records.map((record) => record.cardIds)).toEqual([["h1"], ["h3"]]);
    expect(Object.isFrozen(records)).toBe(true);
    expect(Object.isFrozen(records[0]?.cards)).toBe(true);
    expect(Object.isFrozen(records[0]?.cards[0])).toBe(true);
    expect(locatePhysicalCard(game, "h1").zone).toEqual({ kind: "processing", frameId: 9 });
  });

  it("supports an equipment replacement in one ordered batch without cloning cards", () => {
    const game = state();
    const incoming = game.players[0]!.hand.find((entry) => entry.id === "h1")!;
    commitMoveBatch(game, {
      batchId: 2,
      intents: [
        { cardIds: ["old-weapon"], from: { kind: "equipment", playerId: "p1", slot: "weapon" }, to: { kind: "discard" }, reason: "replace_equipment", visibility: "public" },
        { cardIds: ["h1"], from: { kind: "hand", playerId: "p1" }, to: { kind: "equipment", playerId: "p1", slot: "weapon" }, reason: "equip", visibility: "public" },
      ],
    });
    expect(game.players[0]?.equipment.weapon).toBe(incoming);
    expect(game.discard.map((entry) => entry.id)).toEqual(["old-weapon"]);
  });

  it("moves judgment cards and persistent extra-pile cards through real zones", () => {
    const game = state();
    commitMoveBatch(game, {
      batchId: 3,
      intents: [
        { cardIds: ["delay"], from: { kind: "judgment", playerId: "p2" }, to: { kind: "extra", playerId: "p1", pileId: "stars" }, reason: "skill_effect", visibility: "owner", skillId: "qixing" as never },
      ],
    });
    expect(game.players[1]?.judgment).toEqual([]);
    expect(game.players[0]?.extraPiles.stars?.map((entry) => entry.id)).toEqual(["delay"]);
    expect(locatePhysicalCard(game, "delay").zone).toEqual({ kind: "extra", playerId: "p1", pileId: "stars" });
  });

  it("uses the deck array's end as top and start as bottom", () => {
    const game = state();
    commitMoveBatch(game, {
      batchId: 4,
      intents: [
        { cardIds: ["h1"], from: { kind: "hand", playerId: "p1" }, to: { kind: "deck" }, placement: "deck_top", reason: "deck_reorder", visibility: "server_only" },
        { cardIds: ["h3"], from: { kind: "hand", playerId: "p2" }, to: { kind: "deck" }, placement: "deck_bottom", reason: "deck_reorder", visibility: "server_only" },
      ],
    });
    expect(game.deck.map((entry) => entry.id)).toEqual(["h3", "bottom", "top", "h1"]);
    expect(game.deck.at(-1)?.id).toBe("h1");
  });

  it("places multi-card top and bottom moves in declared future draw order", () => {
    const game = state();
    game.players[1]!.hand.push(card("h4"));
    commitMoveBatch(game, {
      batchId: 41,
      intents: [
        { cardIds: ["h1", "h2"], from: { kind: "hand", playerId: "p1" }, to: { kind: "deck" }, placement: "deck_top", reason: "deck_reorder", visibility: "server_only" },
        { cardIds: ["h3", "h4"], from: { kind: "hand", playerId: "p2" }, to: { kind: "deck" }, placement: "deck_bottom", reason: "deck_reorder", visibility: "server_only" },
      ],
    });
    expect(game.deck.map((entry) => entry.id)).toEqual(["h4", "h3", "bottom", "top", "h2", "h1"]);
    expect([...game.deck].reverse().map((entry) => entry.id)).toEqual(["h1", "h2", "top", "bottom", "h3", "h4"]);
  });

  it("leaves live state byte-for-byte unchanged if any intent is invalid", () => {
    const game = state();
    const before = JSON.stringify(game);
    expect(() => commitMoveBatch(game, {
      batchId: 5,
      intents: [
        { cardIds: ["h1"], from: { kind: "hand", playerId: "p1" }, to: { kind: "discard" }, reason: "discard", visibility: "public" },
        { cardIds: ["missing"], from: { kind: "hand", playerId: "p2" }, to: { kind: "discard" }, reason: "discard", visibility: "public" },
      ],
    })).toThrow(ZoneMoveError);
    expect(JSON.stringify(game)).toBe(before);
  });

  it("rejects duplicate occupancy, duplicate moves, same-zone moves and occupied equipment", () => {
    const duplicate = state();
    duplicate.discard.push(duplicate.players[0]!.hand[0]!);
    expect(() => assertCardConservation(duplicate)).toThrow(/more than one zone/);

    const game = state();
    expect(() => commitMoveBatch(game, {
      batchId: 6,
      intents: [
        { cardIds: ["h1"], from: { kind: "hand", playerId: "p1" }, to: { kind: "discard" }, reason: "discard", visibility: "public" },
        { cardIds: ["h1"], from: { kind: "hand", playerId: "p1" }, to: { kind: "processing", frameId: 1 }, reason: "use", visibility: "public" },
      ],
    })).toThrow(/only once/);
    expect(() => commitMoveBatch(game, {
      batchId: 7,
      intents: [{ cardIds: ["h1"], from: { kind: "hand", playerId: "p1" }, to: { kind: "hand", playerId: "p1" }, reason: "skill_effect", visibility: "owner" }],
    })).toThrow(/change zones/);
    expect(() => commitMoveBatch(game, {
      batchId: 8,
      intents: [{ cardIds: ["h1"], from: { kind: "hand", playerId: "p1" }, to: { kind: "equipment", playerId: "p1", slot: "weapon" }, reason: "equip", visibility: "public" }],
    })).toThrow(/occupied/);
  });

  it("rejects noncanonical processing keys and duplicate player IDs", () => {
    const noncanonical = state();
    noncanonical.processing["01"] = [noncanonical.deck.pop()!];
    expect(() => assertCardConservation(noncanonical)).toThrow(/processing frame/);

    const duplicatePlayer = state();
    duplicatePlayer.players[1] = { ...duplicatePlayer.players[1]!, id: "p1" };
    expect(() => assertCardConservation(duplicatePlayer)).toThrow(/unique/);
  });
});
