import { describe, expect, it } from "vitest";

import type { Card } from "../src/types.js";
import {
  AuthoritativeEngineError,
  assertAuthoritativeEngineState,
  cloneAuthoritativeEngineState,
  createAuthoritativeEngineState,
  transactAuthoritativeEngineState,
} from "../src/engine/authoritative-state.js";
import { createDamageInstance, type LifePlayerState } from "../src/engine/damage.js";
import { createDeathFrame } from "../src/engine/death.js";
import { createDyingFrame } from "../src/engine/dying.js";
import { pushFrame } from "../src/engine/resolution.js";
import { createCompleteRulesEngineState } from "../src/engine/state.js";
import type { AtomicZoneState } from "../src/engine/zones.js";

function card(id: string): Card {
  return {
    id,
    kind: "slash",
    name: "杀",
    category: "basic",
    suit: "spade",
    rank: 7,
  } as Card;
}

function zones(): AtomicZoneState {
  return {
    deck: [card("deck-card")],
    discard: [],
    processing: {},
    players: [
      { id: "source", hand: [card("source-card")], equipment: {}, judgment: [], extraPiles: {} },
      { id: "victim", hand: [card("victim-card")], equipment: {}, judgment: [], extraPiles: {} },
    ],
  };
}

function life(victim: Pick<LifePlayerState, "hp" | "alive"> = { hp: 3, alive: true }): LifePlayerState[] {
  return [
    { id: "source", hp: 4, maxHp: 4, alive: true },
    { id: "victim", hp: victim.hp, maxHp: 3, alive: victim.alive },
  ];
}

function createDamageRoot() {
  const initial = createAuthoritativeEngineState({ zones: zones(), lifePlayers: life() });
  return transactAuthoritativeEngineState(initial, {
    expectedCommitVersion: 0,
    domainTransition: (draft, tools) => {
      const frameId = draft.completeRules.resolution.nextFrameId;
      const damage = createDamageInstance({
        damageId: tools.allocateDamageId(),
        frameId,
        sourceId: "source",
        targetId: "victim",
        nature: "normal",
        reason: { type: "skill", id: "test_damage" },
        amount: 1,
      });
      draft.damageFrames.push(damage);
      return { frameId, damageId: damage.damageId };
    },
    resolutionTransition: (resolution) => pushFrame(resolution, null, {
      kind: "damage",
      continuation: { type: "damage", data: {} },
    }).stack,
    expectedResolutionTop: (result) => ({ frameId: result.frameId, kind: "damage" }),
  }).state;
}

describe("authoritative life, damage, dying, and death roots", () => {
  it("migrates only an empty legacy life domain and otherwise requires explicit life state", () => {
    const migrated = createAuthoritativeEngineState({ zones: zones() });
    expect(migrated.lifePlayers).toEqual([
      { id: "source", hp: 1, maxHp: 1, alive: true },
      { id: "victim", hp: 1, maxHp: 1, alive: true },
    ]);
    expect(migrated.damageFrames).toEqual([]);
    expect(migrated.dyingFrames).toEqual([]);
    expect(migrated.deathFrames).toEqual([]);

    const completeRulesState = createCompleteRulesEngineState();
    completeRulesState.resolution = pushFrame(completeRulesState.resolution, null, {
      kind: "damage",
    }).stack;
    expect(() => createAuthoritativeEngineState({ zones: zones(), completeRulesState }))
      .toThrow(/lifePlayers are required/);

    expect(() => createAuthoritativeEngineState({
      zones: zones(),
      lifePlayers: [{ id: "source", hp: 4, maxHp: 4, alive: true }],
    })).toThrow(/life-player IDs must exactly match zone-player IDs/);
  });

  it("allocates damage IDs through the transaction ledger and rejects forged links", () => {
    const state = createDamageRoot();
    expect(state.completeRules.nextDamageId).toBe(2);
    expect(state.damageFrames).toMatchObject([{
      frameId: 1,
      damageId: 1,
      sourceId: "source",
      targetId: "victim",
      stage: "start",
    }]);
    expect(state.completeRules.resolution.frames).toMatchObject([{ frameId: 1, kind: "damage" }]);
    expect(() => assertAuthoritativeEngineState(state)).not.toThrow();

    const cloned = cloneAuthoritativeEngineState(state);
    expect(cloned.damageFrames[0]).not.toBe(state.damageFrames[0]);
    expect(cloned.damageFrames[0]?.reason).not.toBe(state.damageFrames[0]?.reason);
    expect(cloned.lifePlayers[0]).not.toBe(state.lifePlayers[0]);

    (cloned.damageFrames[0] as { frameId: number }).frameId = 99;
    expect(() => assertAuthoritativeEngineState(cloned)).toThrow(
      /damage domain frames and resolution frames are out of sync/,
    );
  });

  it("rejects damage frames whose IDs bypass the authoritative allocator", () => {
    const initial = createAuthoritativeEngineState({ zones: zones(), lifePlayers: life() });
    expect(() => transactAuthoritativeEngineState(initial, {
      expectedCommitVersion: 0,
      domainTransition: (draft) => {
        const frameId = draft.completeRules.resolution.nextFrameId;
        draft.damageFrames.push(createDamageInstance({
          damageId: draft.completeRules.nextDamageId,
          frameId,
          sourceId: "source",
          targetId: "victim",
          nature: "normal",
          reason: { type: "skill", id: "forged_damage" },
          amount: 1,
        }));
        return { frameId };
      },
      resolutionTransition: (resolution) => pushFrame(resolution, null, { kind: "damage" }).stack,
      expectedResolutionTop: (result) => ({ frameId: result.frameId, kind: "damage" }),
    })).toThrow(/unallocated damage ID|root transaction invariants/);
    expect(initial.completeRules.nextDamageId).toBe(1);
    expect(initial.damageFrames).toEqual([]);
  });

  it("persists a dying frame with exact event and resolution provenance", () => {
    const initial = createAuthoritativeEngineState({
      zones: zones(),
      lifePlayers: life({ hp: 0, alive: true }),
    });
    const state = transactAuthoritativeEngineState(initial, {
      expectedCommitVersion: 0,
      domainTransition: (draft, tools) => {
        const frameId = draft.completeRules.resolution.nextFrameId;
        const reason = tools.emitEvent({
          type: "hp_lost",
          frameId: null,
          turnId: null,
          phaseInstanceId: null,
          sourceId: null,
          targetIds: ["victim"],
          reasonId: "test_hp_loss",
          payload: {},
        });
        draft.dyingFrames.push(createDyingFrame(draft.lifePlayers, {
          frameId,
          victimId: "victim",
          reason: { type: "hp_loss", eventId: reason.eventId, sourceId: null },
          responderOrder: ["source", "victim"],
        }));
        return { frameId };
      },
      resolutionTransition: (resolution) => pushFrame(resolution, null, {
        kind: "dying",
        continuation: { type: "dying", data: {} },
      }).stack,
      expectedResolutionTop: (result) => ({ frameId: result.frameId, kind: "dying" }),
    }).state;

    expect(state.dyingFrames).toMatchObject([{
      frameId: 1,
      victimId: "victim",
      stage: "rescue",
      reason: { eventId: 1, type: "hp_loss" },
    }]);
    const cloned = cloneAuthoritativeEngineState(state);
    expect(cloned.dyingFrames[0]).not.toBe(state.dyingFrames[0]);
    expect(cloned.dyingFrames[0]?.reason).not.toBe(state.dyingFrames[0]?.reason);

    (cloned.events[0] as { targetIds: string[] }).targetIds = ["source"];
    expect(() => assertAuthoritativeEngineState(cloned)).toThrow(/dying reason event provenance/);
  });

  it("persists a dead victim and rejects forged death-event provenance", () => {
    const initial = createAuthoritativeEngineState({
      zones: zones(),
      lifePlayers: life({ hp: 0, alive: false }),
    });
    const state = transactAuthoritativeEngineState(initial, {
      expectedCommitVersion: 0,
      domainTransition: (draft, tools) => {
        const frameId = draft.completeRules.resolution.nextFrameId;
        const reason = tools.emitEvent({
          type: "hp_lost",
          frameId: null,
          turnId: null,
          phaseInstanceId: null,
          sourceId: null,
          targetIds: ["victim"],
          reasonId: "test_hp_loss",
          payload: {},
        });
        const death = tools.emitEvent({
          type: "death",
          frameId,
          turnId: null,
          phaseInstanceId: null,
          sourceId: null,
          targetIds: ["victim"],
          reasonId: "test_death",
          payload: {},
        });
        draft.deathFrames.push(createDeathFrame({
          frameId,
          death: {
            type: "death",
            eventId: death.eventId,
            victimId: "victim",
            killerId: null,
            reason: { type: "hp_loss", eventId: reason.eventId, sourceId: null },
          },
        }));
        return { frameId };
      },
      resolutionTransition: (resolution) => pushFrame(resolution, null, {
        kind: "death",
        continuation: { type: "death", data: {} },
      }).stack,
      expectedResolutionTop: (result) => ({ frameId: result.frameId, kind: "death" }),
    }).state;

    expect(state.deathFrames).toMatchObject([{
      frameId: 1,
      stage: "identity_reveal",
      death: { victimId: "victim", killerId: null, eventId: 2 },
    }]);
    const cloned = cloneAuthoritativeEngineState(state);
    expect(cloned.deathFrames[0]).not.toBe(state.deathFrames[0]);
    expect(cloned.deathFrames[0]?.death).not.toBe(state.deathFrames[0]?.death);

    (cloned.events[1] as { sourceId: string | null }).sourceId = "source";
    expect(() => assertAuthoritativeEngineState(cloned)).toThrow(/death event provenance/);
  });
});
