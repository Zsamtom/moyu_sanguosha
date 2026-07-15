import { describe, expect, it } from "vitest";

import type { Card, CardKind, CardSuit } from "../src/types.js";
import type { DeckServiceState } from "../src/engine/deck.js";
import {
  JudgmentError,
  assertJudgmentFrame,
  cloneJudgmentFrame,
  completeJudgmentPostOpportunity,
  createJudgmentFrame,
  currentJudgmentPostOpportunity,
  currentJudgmentRetrialOpportunity,
  passJudgmentRetrial,
  replaceJudgmentCard,
  resolveJudgment,
  revealJudgmentCard,
  setEffectiveJudgmentSuit,
  settleJudgmentCard,
  type JudgmentFrame,
} from "../src/engine/judgment.js";
import { type AtomicZoneState, assertCardConservation } from "../src/engine/zones.js";

const RNG_KEY = "0123456789abcdef".repeat(4);

function card(id: string, suit: CardSuit, rank: Card["rank"], kind: CardKind = "slash"): Card {
  return { id, kind, name: "鏉€", category: "basic", suit, rank } as Card;
}

function state(): AtomicZoneState {
  return {
    deck: [card("bottom", "heart", 1), card("judge", "spade", 7)],
    discard: [],
    processing: {},
    players: [
      { id: "target", hand: [], equipment: {}, judgment: [], extraPiles: {} },
      {
        id: "sima",
        hand: [card("guicai", "heart", 12), card("spade-retrial", "spade", 5)],
        equipment: {},
        judgment: [],
        extraPiles: {},
      },
      { id: "zhangjiao", hand: [card("guidao", "club", 4)], equipment: {}, judgment: [], extraPiles: {} },
    ],
  };
}

function deckState(game: AtomicZoneState, reshufflesRemaining = 5): DeckServiceState {
  return {
    drawPile: game.deck.map((entry) => ({ ...entry })),
    discardPile: game.discard.map((entry) => ({ ...entry })),
    rng: { key: RNG_KEY, counter: 0 },
    reshufflesRemaining,
  };
}

function reveal(game: AtomicZoneState, frame: JudgmentFrame, batchId: number): DeckServiceState {
  return revealJudgmentCard(game, frame, { batchId, deckState: deckState(game) }).deckState;
}

describe("recoverable judgment frame", () => {
  it("persists its pattern and keeps the physical card public until settlement", () => {
    const game = state();
    const frame = createJudgmentFrame({
      frameId: 7,
      targetId: "target",
      reason: { type: "delayed_trick", id: "lightning" },
      pattern: { suits: ["spade"], minimumRank: 2, maximumRank: 9 },
    });

    const nextDeck = reveal(game, frame, 1);
    expect(nextDeck.drawPile.map((entry) => entry.id)).toEqual(["bottom"]);
    expect(game.deck.map((entry) => entry.id)).toEqual(["bottom"]);
    expect(game.processing["7"]?.map((entry) => entry.id)).toEqual(["judge"]);
    expect(frame.stage).toBe("ready_to_resolve");
    expect(resolveJudgment(frame)).toBe(true);
    expect(frame.stage).toBe("ready_to_settle");
    assertJudgmentFrame(game, frame);

    settleJudgmentCard(game, frame, { batchId: 2, to: { kind: "discard" } });
    expect(game.discard.map((entry) => entry.id)).toEqual(["judge"]);
    expect(frame.stage).toBe("settled");
    assertJudgmentFrame(game, frame);
    expect(() => resolveJudgment(frame)).toThrow(JudgmentError);
    expect(() => settleJudgmentCard(game, frame, { batchId: 3, to: { kind: "discard" } })).toThrow(JudgmentError);
  });

  it("enforces Guicai/Guidao competition in the persisted action order", () => {
    const game = state();
    const expectedIds = assertCardConservation(game);
    const frame = createJudgmentFrame({
      frameId: 8,
      targetId: "target",
      reason: { type: "skill", id: "ganglie" },
      pattern: { color: "black" },
      retrialOrder: [
        { ownerId: "sima", skillId: "guicai" },
        { ownerId: "zhangjiao", skillId: "guidao" },
      ],
    });
    reveal(game, frame, 4);

    expect(currentJudgmentRetrialOpportunity(frame)).toEqual({ ownerId: "sima", skillId: "guicai" });
    expect(() => replaceJudgmentCard(game, frame, {
      batchId: 5,
      actorId: "zhangjiao",
      skillId: "guidao",
      replacementCardId: "guidao",
      replacementFrom: { kind: "hand", playerId: "zhangjiao" },
      oldCardTo: { kind: "hand", playerId: "zhangjiao" },
    })).toThrow(JudgmentError);
    expect(game.processing["8"]?.map((entry) => entry.id)).toEqual(["judge"]);
    expect(() => resolveJudgment(frame)).toThrow(JudgmentError);

    replaceJudgmentCard(game, frame, {
      batchId: 6,
      actorId: "sima",
      skillId: "guicai",
      replacementCardId: "guicai",
      replacementFrom: { kind: "hand", playerId: "sima" },
      oldCardTo: { kind: "discard" },
    });
    expect(frame.retrialCursor).toBe(1);
    expect(currentJudgmentRetrialOpportunity(frame)).toEqual({ ownerId: "zhangjiao", skillId: "guidao" });
    expect(game.discard.map((entry) => entry.id)).toEqual(["judge"]);

    const restoredMidWindow = cloneJudgmentFrame(JSON.parse(JSON.stringify(frame)) as JudgmentFrame);
    assertJudgmentFrame(game, restoredMidWindow);
    replaceJudgmentCard(game, restoredMidWindow, {
      batchId: 7,
      actorId: "zhangjiao",
      skillId: "guidao",
      replacementCardId: "guidao",
      replacementFrom: { kind: "hand", playerId: "zhangjiao" },
      oldCardTo: { kind: "hand", playerId: "zhangjiao" },
    });
    expect(game.players[2]?.hand.map((entry) => entry.id)).toEqual(["guicai"]);
    expect(restoredMidWindow.stage).toBe("ready_to_resolve");
    expect(restoredMidWindow.replacements.map((entry) => [entry.skillId, entry.oldCardId, entry.newCardId])).toEqual([
      ["guicai", "judge", "guicai"],
      ["guidao", "guicai", "guidao"],
    ]);
    expect(resolveJudgment(restoredMidWindow)).toBe(true);
    settleJudgmentCard(game, restoredMidWindow, { batchId: 8, to: { kind: "discard" } });
    expect(() => assertCardConservation(game, expectedIds)).not.toThrow();
  });

  it("keeps Hongyan's conditional suit modifier after a later spade retrial", () => {
    const game = state();
    const frame = createJudgmentFrame({
      frameId: 9,
      targetId: "target",
      reason: { type: "delayed_trick", id: "lightning" },
      pattern: { suits: ["spade"], minimumRank: 2, maximumRank: 9 },
      retrialOrder: [{ ownerId: "sima", skillId: "guicai" }],
    });
    reveal(game, frame, 9);
    setEffectiveJudgmentSuit(game, frame, "heart", {
      modifierId: "hongyan:target",
      sourcePlayerId: "target",
      skillId: "hongyan",
      fromSuit: "spade",
    });
    expect(frame.effectiveCard).toMatchObject({ physicalSuit: "spade", effectiveSuit: "heart", color: "red" });

    replaceJudgmentCard(game, frame, {
      batchId: 10,
      actorId: "sima",
      skillId: "guicai",
      replacementCardId: "spade-retrial",
      replacementFrom: { kind: "hand", playerId: "sima" },
      oldCardTo: { kind: "discard" },
    });
    expect(frame.effectiveCard).toMatchObject({
      cardId: "spade-retrial",
      physicalSuit: "spade",
      effectiveSuit: "heart",
      rank: 5,
      color: "red",
    });
    expect(game.processing["9"]?.[0]?.suit).toBe("spade");
    expect(resolveJudgment(frame)).toBe(false);
    assertJudgmentFrame(game, frame);
  });

  it("blocks settlement until Tiandu/Luoshen post-judgment positions are exhausted", () => {
    const game = state();
    const frame = createJudgmentFrame({
      frameId: 10,
      targetId: "target",
      reason: { type: "skill", id: "luoshen" },
      pattern: { color: "black" },
      postJudgmentOrder: [
        { ownerId: "target", skillId: "tiandu" },
        { ownerId: "target", skillId: "luoshen" },
      ],
    });
    reveal(game, frame, 11);
    expect(resolveJudgment(frame)).toBe(true);
    expect(frame.stage).toBe("post_judgment_window");
    expect(currentJudgmentPostOpportunity(frame)).toEqual({ ownerId: "target", skillId: "tiandu" });
    expect(() => settleJudgmentCard(game, frame, { batchId: 12, to: { kind: "hand", playerId: "target" } })).toThrow(JudgmentError);
    expect(() => completeJudgmentPostOpportunity(frame, "target", "luoshen")).toThrow(JudgmentError);

    completeJudgmentPostOpportunity(frame, "target", "tiandu");
    expect(frame.postJudgmentCursor).toBe(1);
    expect(currentJudgmentPostOpportunity(frame)).toEqual({ ownerId: "target", skillId: "luoshen" });
    const restored = cloneJudgmentFrame(JSON.parse(JSON.stringify(frame)) as JudgmentFrame);
    assertJudgmentFrame(game, restored);
    completeJudgmentPostOpportunity(restored, "target", "luoshen");
    expect(restored.stage).toBe("ready_to_settle");
    settleJudgmentCard(game, restored, {
      batchId: 13,
      to: { kind: "hand", playerId: "target" },
      actorId: "target",
      skillId: "tiandu",
      visibility: "owner",
    });
    expect(game.players[0]?.hand.map((entry) => entry.id)).toEqual(["judge"]);
    assertJudgmentFrame(game, restored);
  });

  it("recomputes physical/effective/result facts and rejects forged restored snapshots", () => {
    const game = state();
    const frame = createJudgmentFrame({
      frameId: 11,
      targetId: "target",
      reason: { type: "armor", id: "bagua" },
      pattern: { color: "red" },
    });
    reveal(game, frame, 14);
    setEffectiveJudgmentSuit(game, frame, "heart", {
      modifierId: "hongyan:11",
      sourcePlayerId: "target",
      skillId: "hongyan",
      fromSuit: "spade",
    });
    expect(resolveJudgment(frame)).toBe(true);
    const valid = cloneJudgmentFrame(JSON.parse(JSON.stringify(frame)) as JudgmentFrame);
    expect(() => assertJudgmentFrame(game, valid)).not.toThrow();

    const forgedEffective = cloneJudgmentFrame(valid);
    forgedEffective.effectiveCard = { ...forgedEffective.effectiveCard!, effectiveSuit: "club", color: "black" };
    expect(() => assertJudgmentFrame(game, forgedEffective)).toThrow(JudgmentError);

    const forgedRank = cloneJudgmentFrame(valid);
    forgedRank.effectiveCard = { ...forgedRank.effectiveCard!, rank: 13 };
    expect(() => assertJudgmentFrame(game, forgedRank)).toThrow(JudgmentError);

    const forgedModifier = cloneJudgmentFrame(valid);
    forgedModifier.suitModifiers[0] = { ...forgedModifier.suitModifiers[0]!, toSuit: "club" };
    expect(() => assertJudgmentFrame(game, forgedModifier)).toThrow(JudgmentError);

    const forgedResult = cloneJudgmentFrame(valid);
    forgedResult.result = false;
    expect(() => assertJudgmentFrame(game, forgedResult)).toThrow(JudgmentError);

    const forgedStage = cloneJudgmentFrame(valid);
    forgedStage.stage = "retrial_window";
    expect(() => assertJudgmentFrame(game, forgedStage)).toThrow(JudgmentError);

    valid.suitModifiers[0] = { ...valid.suitModifiers[0]!, modifierId: "changed" };
    expect(frame.suitModifiers[0]?.modifierId).toBe("hongyan:11");
  });

  it("passes an ordered retrial opportunity without inventing an action", () => {
    const game = state();
    const frame = createJudgmentFrame({
      frameId: 12,
      targetId: "target",
      reason: { type: "skill", id: "test" },
      pattern: { color: "black" },
      retrialOrder: [{ ownerId: "sima", skillId: "guicai" }],
    });
    reveal(game, frame, 15);
    expect(() => passJudgmentRetrial(frame, "zhangjiao", "guidao")).toThrow(JudgmentError);
    passJudgmentRetrial(frame, "sima", "guicai");
    expect(frame.stage).toBe("ready_to_resolve");
    expect(resolveJudgment(frame)).toBe(true);
  });

  it("refills an empty draw pile through the deterministic deck service", () => {
    const makeEmptyDraw = (): AtomicZoneState => ({
      deck: [],
      discard: [card("discard-a", "heart", 2), card("discard-b", "club", 6), card("discard-c", "diamond", 10)],
      processing: {},
      players: [{ id: "target", hand: [], equipment: {}, judgment: [], extraPiles: {} }],
    });
    const first = makeEmptyDraw();
    const expectedIds = assertCardConservation(first);
    const firstFrame = createJudgmentFrame({
      frameId: 13,
      targetId: "target",
      reason: { type: "skill", id: "refill" },
      pattern: { color: "red" },
    });
    const transition = revealJudgmentCard(first, firstFrame, { batchId: 16, deckState: deckState(first) });
    expect(transition.reshufflesUsed).toBe(1);
    expect(first.discard).toEqual([]);
    expect(first.deck.map((entry) => entry.id)).toEqual(transition.deckState.drawPile.map((entry) => entry.id));
    expect(first.processing["13"]?.map((entry) => entry.id)).toEqual([firstFrame.cardId]);
    expect(() => assertCardConservation(first, expectedIds)).not.toThrow();

    const second = makeEmptyDraw();
    const secondFrame = createJudgmentFrame({
      frameId: 14,
      targetId: "target",
      reason: { type: "skill", id: "refill" },
      pattern: { color: "red" },
    });
    revealJudgmentCard(second, secondFrame, { batchId: 17, deckState: deckState(second) });
    expect(secondFrame.cardId).toBe(firstFrame.cardId);
    expect(second.deck.map((entry) => entry.id)).toEqual(first.deck.map((entry) => entry.id));
  });

  it("rejects a mismatched deck snapshot and true exhaustion without changing zones", () => {
    const game = state();
    const frame = createJudgmentFrame({
      frameId: 15,
      targetId: "target",
      reason: { type: "skill", id: "no-middle-draw" },
      pattern: { color: "black" },
    });
    const mismatched = deckState(game);
    const reversed: DeckServiceState = { ...mismatched, drawPile: [...mismatched.drawPile].reverse() };
    expect(() => revealJudgmentCard(game, frame, { batchId: 18, deckState: reversed })).toThrow(JudgmentError);
    expect(game.deck.map((entry) => entry.id)).toEqual(["bottom", "judge"]);
    expect(game.processing["15"]).toBeUndefined();

    const empty: AtomicZoneState = {
      deck: [], discard: [], processing: {},
      players: [{ id: "target", hand: [], equipment: {}, judgment: [], extraPiles: {} }],
    };
    const emptyFrame = createJudgmentFrame({
      frameId: 16,
      targetId: "target",
      reason: { type: "skill", id: "exhausted" },
      pattern: { color: "black" },
    });
    expect(() => revealJudgmentCard(empty, emptyFrame, { batchId: 19, deckState: deckState(empty) })).toThrow(JudgmentError);
    expect(empty).toMatchObject({ deck: [], discard: [], processing: {} });
    expect(emptyFrame.stage).toBe("awaiting_reveal");
  });
});
