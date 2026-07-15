import { describe, expect, it } from "vitest";

import type { Card } from "../src/types.js";
import {
  PindianError,
  assertPindianFrame,
  clonePindianFrame,
  comparePindian,
  createPindianFrame,
  getPindianView,
  modifyPindianRank,
  revealPindianCards,
  selectPindianCard,
  settlePindianCards,
} from "../src/engine/pindian.js";
import { assertCardConservation, type AtomicZoneState } from "../src/engine/zones.js";

function card(id: string, rank: Card["rank"]): Card {
  return { id, kind: "slash", name: "杀", category: "basic", suit: "spade", rank };
}

function state(): AtomicZoneState {
  return {
    deck: [],
    discard: [],
    processing: {},
    players: [
      { id: "a", hand: [card("a1", 5), card("a2", 13)], equipment: {}, judgment: [], extraPiles: {} },
      { id: "b", hand: [card("b1", 8), card("b2", 1)], equipment: {}, judgment: [], extraPiles: {} },
      { id: "observer", hand: [], equipment: {}, judgment: [], extraPiles: {} },
    ],
  };
}

describe("private pindian frame", () => {
  it("keeps the first commitment secret while reserving it face-down in processing", () => {
    const game = state();
    const frame = createPindianFrame(game, { frameId: 1, initiatorId: "a", targetId: "b", reasonSkillId: "tianyi" });
    const record = selectPindianCard(game, frame, "a", "a1", 1);
    expect(game.players[0]?.hand.map((entry) => entry.id)).not.toContain("a1");
    expect(game.processing["1"]?.map((entry) => entry.id)).toEqual(["a1"]);
    expect(record).toMatchObject({ reason: "pindian", visibility: "owner", cardIds: ["a1"] });
    expect(getPindianView(frame, "a").selections.a).toEqual({ selected: true, cardId: "a1" });
    expect(getPindianView(frame, "b").selections.a).toEqual({ selected: true, cardId: null });
    expect(getPindianView(frame, "observer").selections.a).toEqual({ selected: true, cardId: null });
    assertPindianFrame(game, frame);
  });

  it("reveals both cards atomically and treats a tie as initiator not winning", () => {
    const game = state();
    const expected = assertCardConservation(game);
    const frame = createPindianFrame(game, { frameId: 2, initiatorId: "a", targetId: "b", reasonSkillId: "quhu" });
    selectPindianCard(game, frame, "a", "a1", 2);
    selectPindianCard(game, frame, "b", "b1", 3);
    revealPindianCards(game, frame);
    expect(game.processing["2"]?.map((entry) => entry.id)).toEqual(["a1", "b1"]);
    expect(getPindianView(frame, "observer").selections).toEqual({
      a: { selected: true, cardId: "a1" },
      b: { selected: true, cardId: "b1" },
    });
    modifyPindianRank(frame, { playerId: "a", skillId: "yingyang", delta: 3 });
    expect(comparePindian(frame)).toEqual({ initiatorRank: 8, targetRank: 8, winnerId: null, initiatorWon: false, tied: true });
    settlePindianCards(game, frame, { batchId: 2 });
    expect(game.discard.map((entry) => entry.id)).toEqual(["a1", "b1"]);
    expect(() => assertCardConservation(game, expected)).not.toThrow();
    assertPindianFrame(game, frame);
  });

  it("clamps Yingyang to 1..13 and permits only one application per skill owner", () => {
    const game = state();
    const frame = createPindianFrame(game, { frameId: 3, initiatorId: "a", targetId: "b", reasonSkillId: "zhiba" });
    selectPindianCard(game, frame, "a", "a2", 4);
    selectPindianCard(game, frame, "b", "b2", 5);
    revealPindianCards(game, frame);
    expect(modifyPindianRank(frame, { playerId: "a", skillId: "yingyang", delta: 3 })).toBe(13);
    expect(modifyPindianRank(frame, { playerId: "b", skillId: "other_modifier", delta: -3 })).toBe(1);
    expect(() => modifyPindianRank(frame, { playerId: "a", skillId: "yingyang", delta: -3 })).toThrow(/only modify once/);
    expect(comparePindian(frame).winnerId).toBe("a");
  });

  it("supports Zhiba routing both compared cards to the lord's hand", () => {
    const game = state();
    const frame = createPindianFrame(game, { frameId: 4, initiatorId: "a", targetId: "b", reasonSkillId: "zhiba" });
    selectPindianCard(game, frame, "a", "a1", 6);
    selectPindianCard(game, frame, "b", "b1", 7);
    revealPindianCards(game, frame);
    comparePindian(frame);
    settlePindianCards(game, frame, {
      batchId: 5,
      destinations: {
        a: { kind: "hand", playerId: "b" },
        b: { kind: "hand", playerId: "b" },
      },
    });
    expect(game.players[1]?.hand.map((entry) => entry.id)).toEqual(["b2", "a1", "b1"]);
    assertPindianFrame(game, frame);
  });

  it("rejects replay, nonparticipants, processing corruption, and snapshot corruption", () => {
    const game = state();
    const frame = createPindianFrame(game, { frameId: 5, initiatorId: "a", targetId: "b", reasonSkillId: "lieren" });
    expect(() => selectPindianCard(game, frame, "observer", "a1", 8)).toThrow(/not part/);
    selectPindianCard(game, frame, "a", "a1", 9);
    expect(() => selectPindianCard(game, frame, "a", "a2", 10)).toThrow(/already/);
    selectPindianCard(game, frame, "b", "b1", 11);
    const displaced = game.processing["5"]!.splice(1, 1)[0]!;
    game.discard.push(displaced);
    expect(() => revealPindianCards(game, frame)).toThrow(PindianError);

    const restored = clonePindianFrame(JSON.parse(JSON.stringify(frame)) as typeof frame);
    restored.selections.a = "missing";
    expect(() => assertPindianFrame(game, restored)).toThrow(PindianError);
  });

  it("keeps committed cards revealable after a participant's remaining zones are death-cleaned", () => {
    const game = state();
    const frame = createPindianFrame(game, { frameId: 6, initiatorId: "a", targetId: "b", reasonSkillId: "quhu" });
    selectPindianCard(game, frame, "a", "a1", 12);
    selectPindianCard(game, frame, "b", "b1", 13);
    game.discard.push(...game.players[1]!.hand.splice(0));

    expect(() => revealPindianCards(game, frame)).not.toThrow();
    expect(frame.revealedRanks).toEqual({ a: 5, b: 8 });
    expect(game.processing["6"]?.map((entry) => entry.id)).toEqual(["a1", "b1"]);
  });
});
