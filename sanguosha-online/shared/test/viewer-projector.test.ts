import { describe, expect, expectTypeOf, it } from "vitest";

import type { Card } from "../src/types.js";
import type { GameEvent } from "../src/engine/events.js";
import {
  createAuthoritativeEngineState,
  transactAuthoritativeEngineState,
  type AuthoritativeEngineState,
} from "../src/engine/authoritative-state.js";
import {
  createPindianFrame,
  selectPindianCard,
  type PindianFrame,
} from "../src/engine/pindian.js";
import {
  pushFrame,
  waitForDecision,
  type ResolutionStack,
} from "../src/engine/resolution.js";
import {
  projectAuthoritativeEngineState,
  type ProjectedEventHistory,
  type ProjectedMoveRecord,
  type ProjectedZoneState,
  type ViewerProjectedEngineState,
} from "../src/engine/viewer-projector.js";
import type { AtomicZoneState, MoveRecord } from "../src/engine/zones.js";

function card(id: string, rank: Card["rank"]): Card {
  return { id, kind: "slash", name: "杀", category: "basic", suit: "spade", rank } as Card;
}

function zones(): AtomicZoneState {
  return {
    deck: [card("deck-secret", 13)],
    discard: [],
    processing: {},
    players: [
      {
        id: "a",
        hand: [card("a1", 5), card("a2", 6)],
        equipment: {},
        judgment: [],
        extraPiles: { private_a: [card("a-star", 1)] },
      },
      {
        id: "b",
        hand: [card("b1", 8), card("b2", 9)],
        equipment: { weapon: card("b-weapon", 7) },
        judgment: [card("b-delay", 10)],
        extraPiles: { private_b: [card("b-star", 2)] },
      },
      { id: "observer", hand: [], equipment: {}, judgment: [], extraPiles: {} },
    ],
  };
}

function secretPindianState(): AuthoritativeEngineState {
  const initial = createAuthoritativeEngineState({ zones: zones() });
  return transactAuthoritativeEngineState(initial, {
    expectedCommitVersion: 0,
    domainTransition: (draft, tools) => {
      tools.commitMoves([{
        cardIds: ["deck-secret"],
        from: { kind: "deck" },
        to: { kind: "processing", frameId: 99 },
        reason: "deck_reorder",
        visibility: "server_only",
        frameId: 99,
      }]);
      const frameId = draft.completeRules.resolution.nextFrameId;
      const frame = createPindianFrame(draft.zones, {
        frameId,
        initiatorId: "a",
        targetId: "b",
        reasonSkillId: "tianyi",
      });
      draft.pindianFrames.push(frame);
      tools.recordMoveTransition((batchId) => [
        selectPindianCard(draft.zones, frame, "a", "a1", batchId),
      ]);
      tools.emitEvent({
        type: "pindian_started",
        frameId,
        turnId: null,
        phaseInstanceId: null,
        sourceId: "a",
        targetIds: ["b"],
        reasonId: "secret-tianyi-reason",
        payload: { secretCommitment: "a1", opponentHandIds: ["b1", "b2"] },
      });
      return { frameId };
    },
    resolutionTransition: (resolution, result) => {
      const pushed = pushFrame(resolution, null, {
        kind: "pindian",
        payload: { secretCardId: "a1", serverOnly: true },
        continuation: { type: "secret_pindian", data: { committedCardId: "a1" } },
      });
      expect(pushed.frame.frameId).toBe(result.frameId);
      return waitForDecision(pushed.stack, {
        frameId: result.frameId,
        actorId: "a",
        kind: "choose_pindian_card",
        payload: { secretCardId: "a1", opponentHandIds: ["b1", "b2"] },
      }).stack;
    },
    expectedResolutionTop: (result) => ({ frameId: result.frameId, kind: "pindian" }),
  }).state;
}

describe("mandatory viewer projection", () => {
  it("masks opponent zones, server-only moves, raw resolution data, and secret Pindian commitments", () => {
    const state = secretPindianState();
    const observer = projectAuthoritativeEngineState(state, "observer");
    const serialized = JSON.stringify(observer);

    expect(observer.zones.deckCount).toBe(0);
    expect(observer.zones.players.find((player) => player.playerId === "a")?.hand).toEqual({ count: 1, cards: null });
    expect(observer.zones.players.find((player) => player.playerId === "b")?.hand).toEqual({ count: 2, cards: null });
    expect(observer.zones.players.find((player) => player.playerId === "b")?.equipment.weapon?.cardId).toBe("b-weapon");
    expect(observer.zones.players.find((player) => player.playerId === "b")?.judgment[0]?.cardId).toBe("b-delay");
    expect(observer.zones.players.find((player) => player.playerId === "a")?.extraPiles[0]).toEqual({
      pileId: "private_a",
      count: 1,
      cards: null,
    });
    expect(observer.zones.processing.find((zone) => zone.frameId === 1)).toMatchObject({
      cardCount: 1,
      visibleCards: [],
      hiddenCardCount: 1,
    });
    expect(observer.zones.processing.find((zone) => zone.frameId === 99)).toMatchObject({
      cardCount: 1,
      visibleCards: [],
      hiddenCardCount: 1,
    });
    expect(observer.moveRecords).toHaveLength(1);
    expect(observer.moveRecords[0]).toMatchObject({ audience: "masked", cardCount: 1, visibleCards: [], hiddenCardCount: 1 });
    expect(observer.pindian[0]?.commitments.a).toEqual({ committed: true, cardId: null });
    expect(observer.pindian[0]?.commitments.b).toEqual({ committed: false, cardId: null });
    expect(observer.resolution.viewerDecision).toBeNull();
    expect(observer.eventHistory).toEqual({
      projectionKind: "event_history_cursor",
      eventCount: 1,
      lastEventId: 1,
    });

    for (const secret of ["a1", "a2", "a-star", "b1", "b2", "b-star", "deck-secret", "secretCardId", "committedCardId", "opponentHandIds", "secretCommitment", "secret-tianyi-reason"]) {
      expect(serialized).not.toContain(secret);
    }
    for (const rawKey of ["continuation", "payload", "decisionResult", "consumedActions", "physicalCardIds", "rankModifiers", "settledDestinations", "visibility"]) {
      expect(serialized).not.toContain(`\"${rawKey}\"`);
    }
  });

  it("shows only the viewer's own private zones, prompt metadata, commitment, and owner-visible move", () => {
    const state = secretPindianState();
    const owner = projectAuthoritativeEngineState(state, "a");
    const opponent = projectAuthoritativeEngineState(state, "b");

    expect(owner.zones.players.find((player) => player.playerId === "a")?.hand.cards?.map((entry) => entry.cardId)).toEqual(["a2"]);
    expect(owner.zones.players.find((player) => player.playerId === "a")?.extraPiles[0]?.cards?.[0]?.cardId).toBe("a-star");
    expect(owner.pindian[0]?.commitments.a).toEqual({ committed: true, cardId: "a1" });
    expect(owner.zones.processing.find((zone) => zone.frameId === 1)?.visibleCards[0]?.cardId).toBe("a1");
    expect(owner.moveRecords[0]).toMatchObject({ audience: "viewer", hiddenCardCount: 0 });
    expect(owner.moveRecords[0]?.visibleCards[0]?.cardId).toBe("a1");
    expect(owner.resolution.viewerDecision).toMatchObject({
      projectionKind: "decision_request",
      kind: "choose_pindian_card",
    });
    expect(JSON.stringify(owner.resolution.viewerDecision)).not.toContain("secretCardId");

    expect(opponent.pindian[0]?.commitments.a).toEqual({ committed: true, cardId: null });
    expect(opponent.zones.processing.find((zone) => zone.frameId === 1)?.visibleCards).toEqual([]);
    expect(opponent.resolution.viewerDecision).toBeNull();
    expect(opponent.zones.players.find((player) => player.playerId === "b")?.hand.cards?.map((entry) => entry.cardId)).toEqual(["b1", "b2"]);
  });

  it("returns a detached deeply frozen DTO", () => {
    const state = secretPindianState();
    const projected = projectAuthoritativeEngineState(state, "observer");
    expect(Object.isFrozen(projected)).toBe(true);
    expect(Object.isFrozen(projected.zones)).toBe(true);
    expect(Object.isFrozen(projected.zones.players)).toBe(true);
    expect(Object.isFrozen(projected.pindian[0]?.commitments)).toBe(true);
    expect(projected).not.toBe(state);
  });

  it("uses nominal projected DTOs that reject every corresponding raw engine type", () => {
    expectTypeOf<AuthoritativeEngineState>().not.toMatchTypeOf<ViewerProjectedEngineState>();
    expectTypeOf<AtomicZoneState>().not.toMatchTypeOf<ProjectedZoneState>();
    expectTypeOf<ResolutionStack>().not.toMatchTypeOf<ViewerProjectedEngineState["resolution"]>();
    expectTypeOf<GameEvent>().not.toMatchTypeOf<ProjectedEventHistory>();
    expectTypeOf<MoveRecord>().not.toMatchTypeOf<ProjectedMoveRecord>();
    expectTypeOf<PindianFrame>().not.toMatchTypeOf<ViewerProjectedEngineState["pindian"][number]>();
  });
});
