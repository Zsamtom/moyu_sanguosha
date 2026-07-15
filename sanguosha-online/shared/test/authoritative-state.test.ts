import { describe, expect, it } from "vitest";

import type { Card } from "../src/types.js";
import {
  beginTargetConfirmation,
  commitCardUseFrame,
  confirmCurrentTarget,
  createCardUseFrame,
} from "../src/engine/card-use.js";
import {
  AuthoritativeEngineError,
  assertAuthoritativeEngineState,
  cloneAuthoritativeEngineState,
  createAuthoritativeEngineState,
  transactAuthoritativeEngineState,
} from "../src/engine/authoritative-state.js";
import {
  createJudgmentFrame,
  replaceJudgmentCard,
  revealJudgmentCard,
} from "../src/engine/judgment.js";
import { pushFrame } from "../src/engine/resolution.js";
import { createCompleteRulesEngineState } from "../src/engine/state.js";
import { ZoneMoveError, type AtomicZoneState } from "../src/engine/zones.js";

const RNG_KEY = "0123456789abcdef".repeat(4);

function card(id: string, rank: Card["rank"] = 7): Card {
  return { id, kind: "slash", name: "杀", category: "basic", suit: "spade", rank } as Card;
}

function zones(): AtomicZoneState {
  return {
    deck: [card("deck-bottom"), card("deck-top")],
    discard: [],
    processing: {},
    players: [
      { id: "a", hand: [card("a1"), card("a2")], equipment: {}, judgment: [], extraPiles: {} },
      { id: "b", hand: [card("b1")], equipment: {}, judgment: [], extraPiles: {} },
    ],
  };
}

function createJudgmentRoot() {
  const initial = createAuthoritativeEngineState({ zones: zones() });
  return transactAuthoritativeEngineState(initial, {
    expectedCommitVersion: 0,
    domainTransition: (draft, tools) => {
      const frameId = draft.completeRules.resolution.nextFrameId;
      const judgment = createJudgmentFrame({
        frameId,
        targetId: "b",
        reason: { type: "skill", id: "ganglie" },
        pattern: { color: "black" },
        retrialOrder: [{ ownerId: "a", skillId: "guicai" }],
      });
      tools.recordMoveTransition((batchId) => [revealJudgmentCard(
        draft.zones,
        judgment,
        {
          batchId,
          deckState: {
            drawPile: draft.zones.deck.map((entry) => ({ ...entry })),
            discardPile: draft.zones.discard.map((entry) => ({ ...entry })),
            rng: { key: RNG_KEY, counter: 0 },
            reshufflesRemaining: 5,
          },
        },
      ).record]);
      tools.recordMoveTransition((batchId) => replaceJudgmentCard(
        draft.zones,
        judgment,
        {
          batchId,
          actorId: "a",
          skillId: "guicai",
          replacementCardId: "a1",
          replacementFrom: { kind: "hand", playerId: "a" },
          oldCardTo: { kind: "discard" },
        },
      ));
      draft.judgmentFrames.push(judgment);
      return { frameId };
    },
    resolutionTransition: (resolution) => pushFrame(resolution, null, {
      kind: "judgment",
      continuation: { type: "judgment", data: {} },
    }).stack,
    expectedResolutionTop: (result) => ({ frameId: result.frameId, kind: "judgment" }),
  }).state;
}

describe("authoritative engine root transactions", () => {
  it("retains migrated monotonic counters without inventing or resetting history", () => {
    const completeRulesState = createCompleteRulesEngineState();
    completeRulesState.nextEventId = 41;
    completeRulesState.nextMoveBatchId = 17;
    const restored = createAuthoritativeEngineState({ zones: zones(), completeRulesState });
    expect(restored).toMatchObject({ eventHistoryBaseId: 41, moveHistoryBaseBatchId: 17 });
    expect(restored.completeRules).toMatchObject({ nextEventId: 41, nextMoveBatchId: 17 });
    expect(restored.judgmentFrames).toEqual([]);
    expect(() => assertAuthoritativeEngineState(restored)).not.toThrow();
  });

  it("requires an explicit typed judgment when migration restores an active judgment resolution", () => {
    const completeRulesState = createCompleteRulesEngineState();
    completeRulesState.resolution = pushFrame(completeRulesState.resolution, null, {
      kind: "judgment",
    }).stack;

    expect(() => createAuthoritativeEngineState({
      zones: zones(),
      completeRulesState,
    })).toThrow(/judgment domain frames and resolution frames are out of sync/);
  });

  it("commits judgment domain moves and its matching resolution frame atomically", () => {
    const state = createJudgmentRoot();

    expect(state).toMatchObject({ commitVersion: 1 });
    expect(state.completeRules).toMatchObject({ nextMoveBatchId: 3 });
    expect(state.completeRules.resolution.frames).toMatchObject([
      { frameId: 1, kind: "judgment" },
    ]);
    expect(state.judgmentFrames).toMatchObject([
      {
        frameId: 1,
        stage: "ready_to_resolve",
        initialCardId: "deck-top",
        cardId: "a1",
        replacements: [{ oldCardId: "deck-top", newCardId: "a1" }],
      },
    ]);
    expect(state.zones.processing["1"]?.map((entry) => entry.id)).toEqual(["a1"]);
    expect(state.zones.discard.map((entry) => entry.id)).toEqual(["deck-top"]);
    expect(state.moveRecords).toHaveLength(3);
    expect(() => assertAuthoritativeEngineState(state)).not.toThrow();
  });

  it("deep-clones judgment patterns, windows, effective cards, and replacement provenance", () => {
    const state = createJudgmentRoot();
    const cloned = cloneAuthoritativeEngineState(state);
    const originalFrame = state.judgmentFrames[0]!;
    const clonedFrame = cloned.judgmentFrames[0]!;

    expect(clonedFrame).toEqual(originalFrame);
    expect(clonedFrame).not.toBe(originalFrame);
    expect(clonedFrame.reason).not.toBe(originalFrame.reason);
    expect(clonedFrame.pattern).not.toBe(originalFrame.pattern);
    expect(clonedFrame.retrialOrder).not.toBe(originalFrame.retrialOrder);
    expect(clonedFrame.retrialOrder[0]).not.toBe(originalFrame.retrialOrder[0]);
    expect(clonedFrame.effectiveCard).not.toBe(originalFrame.effectiveCard);
    expect(clonedFrame.replacements).not.toBe(originalFrame.replacements);
    expect(clonedFrame.replacements[0]).not.toBe(originalFrame.replacements[0]);
    expect(clonedFrame.replacements[0]?.oldCardDestination)
      .not.toBe(originalFrame.replacements[0]?.oldCardDestination);
  });

  it("rejects forged judgment links, missing typed history, and nonphysical historical card IDs", () => {
    const state = createJudgmentRoot();

    const wrongLink = cloneAuthoritativeEngineState(state);
    (wrongLink.judgmentFrames[0] as { frameId: number }).frameId = 99;
    expect(() => assertAuthoritativeEngineState(wrongLink)).toThrow(
      /judgment domain frames and resolution frames are out of sync/,
    );

    const missingDomain = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
    delete missingDomain.judgmentFrames;
    expect(() => assertAuthoritativeEngineState(missingDomain)).toThrow(
      /authoritative histories are missing/,
    );

    const nonphysicalHistory = cloneAuthoritativeEngineState(state);
    const forgedFrame = nonphysicalHistory.judgmentFrames[0]!;
    forgedFrame.initialCardId = "forged-card";
    (forgedFrame.replacements[0] as { oldCardId: string }).oldCardId = "forged-card";
    expect(() => assertAuthoritativeEngineState(nonphysicalHistory)).toThrow(
      /judgment frame references a nonphysical card/,
    );
  });
  it("clones domain state, updates resolution second, and commits one new root version", () => {
    const initial = createAuthoritativeEngineState({ zones: zones() });
    const before = JSON.stringify(initial);
    const transition = transactAuthoritativeEngineState(initial, {
      expectedCommitVersion: 0,
      domainTransition: (draft, tools) => {
        const frameId = draft.completeRules.resolution.nextFrameId;
        const records = tools.commitMoves([{
          cardIds: ["a1"],
          from: { kind: "hand", playerId: "a" },
          to: { kind: "processing", frameId },
          reason: "use",
          visibility: "public",
          actorId: "a",
          frameId,
        }]);
        const damageId = tools.allocateDamageId();
        const event = tools.emitEvent({
          type: "card_committed",
          frameId,
          turnId: null,
          phaseInstanceId: null,
          sourceId: "a",
          targetIds: ["b"],
          reasonId: "slash",
          payload: { privateCardId: records[0]!.cardIds[0]! },
        });
        const cardUse = createCardUseFrame({
          frameId,
          useId: 1,
          sourceId: "a",
          method: "use",
          physicalCardIds: [records[0]!.cardIds[0]!],
          effectiveKind: "slash",
          targetIds: ["b"],
        });
        beginTargetConfirmation(cardUse);
        confirmCurrentTarget(cardUse);
        commitCardUseFrame(cardUse);
        draft.cardUseFrames.push(cardUse);
        return { frameId, cardId: records[0]!.cardIds[0]!, eventId: event.eventId, damageId };
      },
      resolutionTransition: (resolution, result) => pushFrame(resolution, null, {
        kind: "card_use",
        payload: { cardId: result.cardId },
        continuation: { type: "card_use", data: { frameId: result.frameId } },
      }).stack,
      expectedResolutionTop: (result) => ({ frameId: result.frameId, kind: "card_use" }),
    });

    expect(JSON.stringify(initial)).toBe(before);
    expect(initial.commitVersion).toBe(0);
    expect(initial.zones.players[0]?.hand.map((entry) => entry.id)).toEqual(["a1", "a2"]);
    expect(transition.state).toMatchObject({ commitVersion: 1 });
    expect(transition.state.completeRules).toMatchObject({
      nextEventId: 2,
      nextMoveBatchId: 2,
      nextDamageId: 2,
    });
    expect(transition.state.completeRules.resolution).toMatchObject({ stateVersion: 1, nextFrameId: 2 });
    expect(transition.state.zones.processing["1"]?.map((entry) => entry.id)).toEqual(["a1"]);
    expect(transition.state.events).toHaveLength(1);
    expect(transition.state.events[0]).toMatchObject({ eventId: 1, type: "card_committed" });
    expect(transition.state.moveRecords).toHaveLength(1);
    expect(transition.result).toEqual({ frameId: 1, cardId: "a1", eventId: 1, damageId: 1 });
    expect(() => assertAuthoritativeEngineState(transition.state)).not.toThrow();
  });

  it("rolls back all staged domain moves when a later domain operation fails", () => {
    const initial = createAuthoritativeEngineState({ zones: zones() });
    const before = JSON.stringify(initial);

    expect(() => transactAuthoritativeEngineState(initial, {
      expectedCommitVersion: 0,
      domainTransition: (_draft, tools) => {
        tools.emitEvent({
          type: "cards_moving",
          frameId: null,
          turnId: null,
          phaseInstanceId: null,
          sourceId: "a",
          targetIds: [],
          reasonId: "rollback-test",
          payload: {},
        });
        tools.allocateDamageId();
        tools.commitMoves([{
          cardIds: ["a1"],
          from: { kind: "hand", playerId: "a" },
          to: { kind: "discard" },
          reason: "discard",
          visibility: "public",
        }]);
        tools.commitMoves([{
          cardIds: ["missing"],
          from: { kind: "hand", playerId: "b" },
          to: { kind: "discard" },
          reason: "discard",
          visibility: "public",
        }]);
      },
      resolutionTransition: (resolution) => resolution,
      expectedResolutionTop: null,
    })).toThrow(ZoneMoveError);

    expect(JSON.stringify(initial)).toBe(before);
    expect(initial.commitVersion).toBe(0);
    expect(initial.events).toEqual([]);
    expect(initial.moveRecords).toEqual([]);
    expect(initial.completeRules).toMatchObject({ nextEventId: 1, nextMoveBatchId: 1, nextDamageId: 1 });
  });

  it("rolls back a successful domain transition when the resolution transition fails", () => {
    const initial = createAuthoritativeEngineState({ zones: zones() });
    const before = JSON.stringify(initial);

    expect(() => transactAuthoritativeEngineState(initial, {
      expectedCommitVersion: 0,
      domainTransition: (_draft, tools) => tools.commitMoves([{
        cardIds: ["a1"],
        from: { kind: "hand", playerId: "a" },
        to: { kind: "discard" },
        reason: "discard",
        visibility: "public",
      }]),
      resolutionTransition: () => {
        throw new Error("resolution failed");
      },
      expectedResolutionTop: null,
    })).toThrow("resolution failed");

    expect(JSON.stringify(initial)).toBe(before);
  });

  it("rejects stale commits, direct resolution mutation, and card-loss corruption", () => {
    const initial = createAuthoritativeEngineState({ zones: zones() });
    expect(() => transactAuthoritativeEngineState(initial, {
      expectedCommitVersion: 1,
      domainTransition: () => undefined,
      resolutionTransition: (resolution) => resolution,
      expectedResolutionTop: null,
    })).toThrow(/stale authoritative commit/);

    expect(() => transactAuthoritativeEngineState(initial, {
      expectedCommitVersion: 0,
      domainTransition: (draft) => {
        draft.completeRules.resolution = pushFrame(
          draft.completeRules.resolution,
          null,
          { kind: "skill" },
        ).stack;
      },
      resolutionTransition: (resolution) => resolution,
      expectedResolutionTop: null,
    })).toThrow(/must not mutate the resolution stack/);

    expect(() => transactAuthoritativeEngineState(initial, {
      expectedCommitVersion: 0,
      domainTransition: (draft) => {
        draft.zones.players[0]!.hand.pop();
      },
      resolutionTransition: (resolution) => resolution,
      expectedResolutionTop: null,
    })).toThrow(AuthoritativeEngineError);
    expect(initial.zones.players[0]?.hand).toHaveLength(2);
  });

  it("rolls back when the committed stack top has the wrong frame kind", () => {
    const initial = createAuthoritativeEngineState({ zones: zones() });
    const before = JSON.stringify(initial);

    expect(() => transactAuthoritativeEngineState(initial, {
      expectedCommitVersion: 0,
      domainTransition: () => ({ frameId: 1 }),
      resolutionTransition: (resolution) => pushFrame(resolution, null, { kind: "skill" }).stack,
      expectedResolutionTop: (result) => ({ frameId: result.frameId, kind: "damage" }),
    })).toThrow(/resolution top mismatch/);

    expect(JSON.stringify(initial)).toBe(before);
  });

  it("deep-clones every authoritative branch without sharing card or history objects", () => {
    const initial = createAuthoritativeEngineState({ zones: zones() });
    const moved = transactAuthoritativeEngineState(initial, {
      expectedCommitVersion: 0,
      domainTransition: (_draft, tools) => {
        tools.emitEvent({
          type: "cards_moved",
          frameId: null,
          turnId: null,
          phaseInstanceId: null,
          sourceId: "a",
          targetIds: [],
          reasonId: "discard",
          payload: { serverDetail: "a1" },
        });
        return tools.commitMoves([{
          cardIds: ["a1"],
          from: { kind: "hand", playerId: "a" },
          to: { kind: "discard" },
          reason: "discard",
          visibility: "public",
        }]);
      },
      resolutionTransition: (resolution) => resolution,
      expectedResolutionTop: null,
    }).state;
    const cloned = cloneAuthoritativeEngineState(moved);

    expect(cloned).toEqual(moved);
    expect(cloned).not.toBe(moved);
    expect(cloned.zones).not.toBe(moved.zones);
    expect(cloned.completeRules).not.toBe(moved.completeRules);
    expect(cloned.completeRules.resolution).not.toBe(moved.completeRules.resolution);
    expect(cloned.zones.discard[0]).not.toBe(moved.zones.discard[0]);
    expect(cloned.events[0]).not.toBe(moved.events[0]);
    expect(cloned.events[0]?.payload).not.toBe(moved.events[0]?.payload);
    expect(cloned.moveRecords[0]).not.toBe(moved.moveRecords[0]);
    expect(cloned.moveRecords[0]?.cards[0]).not.toBe(moved.moveRecords[0]?.cards[0]);
  });
});
