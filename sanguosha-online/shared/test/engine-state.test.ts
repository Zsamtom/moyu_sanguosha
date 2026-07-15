import { describe, expect, it } from "vitest";

import {
  CompleteRulesStateError,
  assertCompleteRulesEngineState,
  cloneCompleteRulesEngineState,
  createCompleteRulesEngineState,
  migrateCompleteRulesEngineState,
} from "../src/engine/state.js";
import { pushFrame } from "../src/engine/resolution.js";
import { addMark } from "../src/engine/lifecycle.js";
import { createDamageInstance } from "../src/engine/damage.js";
import { pushDamageFlowFrame } from "../src/engine/damage-flow.js";
import { createDyingFrame, pushDyingFrame } from "../src/engine/dying.js";
import { createDeathFrame, pushDeathFrame } from "../src/engine/death.js";

describe("complete rules engine state", () => {
  it("creates a fully enabled JSON-safe state with monotonic allocators", () => {
    const state = createCompleteRulesEngineState();
    expect(state).toMatchObject({
      version: 1,
      ruleSetVersion: "original-66-v1",
      nextEventId: 1,
      nextMoveBatchId: 1,
      nextDamageId: 1,
      reshufflesRemaining: 5,
      damageFlow: { type: "damage_flow", version: 1, revision: 0, frames: [] },
      dying: { version: 1, frames: [] },
      death: { version: 1, frames: [] },
    });
    expect(state.ruleConfig.enabledGeneralPacks).toHaveLength(7);
    expect(() => assertCompleteRulesEngineState(state)).not.toThrow();
    expect(() => JSON.stringify(state)).not.toThrow();
  });

  it("deep-clones resolution, lifecycle, dying/death stacks and room configuration", () => {
    let state = createCompleteRulesEngineState();
    state.resolution = pushFrame(state.resolution, null, { kind: "skill", payload: { programId: "test" } }).stack;
    addMark(state.lifecycle, { markId: "rage", ownerId: "lvbu", sourcePlayerId: "lvbu", sourceSkillId: "kuangbao", amount: 1, visibility: "public", expiry: { type: "permanent" } });
    const cloned = cloneCompleteRulesEngineState(JSON.parse(JSON.stringify(state)) as typeof state);
    cloned.resolution.frames[0]!.payload.programId = "changed";
    cloned.lifecycle.marks[0]!.value = 9;
    cloned.damageFlow.completedDamageIds.push(99);
    (cloned.ruleConfig.enabledGeneralPacks as string[]).pop();
    expect(state.resolution.frames[0]?.payload.programId).toBe("test");
    expect(state.lifecycle.marks[0]?.value).toBe(1);
    expect(state.damageFlow.completedDamageIds).toEqual([]);
    expect(cloned.dying).not.toBe(state.dying);
    expect(cloned.dying.frames).not.toBe(state.dying.frames);
    expect(cloned.death).not.toBe(state.death);
    expect(cloned.death.frames).not.toBe(state.death.frames);
    expect(state.ruleConfig.enabledGeneralPacks).toHaveLength(7);
  });

  it("migrates missing damage, dying and death fields to their empty v1 boundaries", () => {
    const migrated = migrateCompleteRulesEngineState(undefined);
    expect(migrated.resolution.frames).toEqual([]);
    expect(migrated.damageFlow).toMatchObject({ type: "damage_flow", version: 1, revision: 0, frames: [] });
    expect(migrated.dying).toEqual({ version: 1, frames: [] });
    expect(migrated.death).toEqual({ version: 1, frames: [] });
    const legacy = structuredClone(migrated) as Partial<typeof migrated>;
    delete legacy.damageFlow;
    delete legacy.dying;
    delete legacy.death;
    const upgraded = migrateCompleteRulesEngineState(legacy);
    expect(upgraded.damageFlow).toEqual(migrated.damageFlow);
    expect(upgraded.dying).toEqual(migrated.dying);
    expect(upgraded.death).toEqual(migrated.death);
    const restored = migrateCompleteRulesEngineState(JSON.parse(JSON.stringify(migrated)));
    expect(restored).toEqual(migrated);
    expect(restored).not.toBe(migrated);
  });

  it("round-trips JSON deeply, accepts strict live damage flow, and rejects forged flow", () => {
    const state = createCompleteRulesEngineState();
    const restored = migrateCompleteRulesEngineState(JSON.parse(JSON.stringify(state)));
    expect(restored).toEqual(state);
    expect(restored.damageFlow).not.toBe(state.damageFlow);

    const forged = structuredClone(state);
    forged.damageFlow.nextWindowId = 0;
    expect(() => assertCompleteRulesEngineState(forged)).toThrow(CompleteRulesStateError);
    expect(() => migrateCompleteRulesEngineState(forged)).toThrow(CompleteRulesStateError);

    const active = structuredClone(state);
    active.nextDamageId = 2;
    active.damageFlow = pushDamageFlowFrame(active.damageFlow, {
      expectedParentFrameId: null,
      expectedRevision: 0,
      damage: createDamageInstance({
        damageId: 1,
        frameId: 1,
        sourceId: "source",
        targetId: "target",
        nature: "normal",
        reason: { type: "rule", id: "state-test" },
        amount: 1,
      }),
    }).state;
    expect(() => assertCompleteRulesEngineState(active)).not.toThrow();
    const restoredActive = migrateCompleteRulesEngineState(JSON.parse(JSON.stringify(active)));
    expect(restoredActive).toEqual(active);
    expect(restoredActive.damageFlow).not.toBe(active.damageFlow);
    expect(restoredActive.damageFlow.frames[0]).not.toBe(active.damageFlow.frames[0]);

    const staleAllocator = structuredClone(active);
    staleAllocator.nextDamageId = 1;
    expect(() => assertCompleteRulesEngineState(staleAllocator)).toThrow(/nextDamageId/);
    expect(() => migrateCompleteRulesEngineState(staleAllocator)).toThrow(/nextDamageId/);

    const aheadFrameAllocator = structuredClone(state);
    aheadFrameAllocator.nextDamageId = 2;
    aheadFrameAllocator.damageFlow = pushDamageFlowFrame(aheadFrameAllocator.damageFlow, {
      expectedParentFrameId: null,
      expectedRevision: 0,
      damage: createDamageInstance({
        damageId: 1,
        frameId: 2,
        sourceId: "source",
        targetId: "target",
        nature: "normal",
        reason: { type: "rule", id: "future-frame-test" },
        amount: 1,
      }),
    }).state;
    expect(() => assertCompleteRulesEngineState(aheadFrameAllocator)).toThrow(/nextDamageId/);
    expect(() => migrateCompleteRulesEngineState(aheadFrameAllocator)).toThrow(/nextDamageId/);

    const forgedActive = structuredClone(active);
    forgedActive.damageFlow.frames[0]!.damageId += 1;
    expect(() => assertCompleteRulesEngineState(forgedActive)).toThrow(CompleteRulesStateError);
    expect(() => migrateCompleteRulesEngineState(forgedActive)).toThrow(CompleteRulesStateError);
  });

  it("rejects malformed counters, unsupported configs and invalid nested frames", () => {
    const badCounter = createCompleteRulesEngineState();
    badCounter.nextDamageId = 0;
    expect(() => assertCompleteRulesEngineState(badCounter)).toThrow(CompleteRulesStateError);

    const badConfig = createCompleteRulesEngineState();
    badConfig.ruleConfig = { ...badConfig.ruleConfig, enabledGeneralPacks: ["wind"] };
    expect(() => assertCompleteRulesEngineState(badConfig)).toThrow(/standard/);

    const badResolution = createCompleteRulesEngineState();
    badResolution.resolution.nextFrameId = 0;
    expect(() => assertCompleteRulesEngineState(badResolution)).toThrow(CompleteRulesStateError);
  });

  it("rejects malformed or nonempty dying and death scaffold stacks", () => {
    const badDyingVersion = createCompleteRulesEngineState();
    (badDyingVersion.dying as { version: number }).version = 2;
    expect(() => assertCompleteRulesEngineState(badDyingVersion)).toThrow(/dying stack root/);

    const badDyingFrames = createCompleteRulesEngineState();
    (badDyingFrames.dying as unknown as { frames: unknown }).frames = null;
    expect(() => assertCompleteRulesEngineState(badDyingFrames)).toThrow(/dying stack root/);

    const badDeathVersion = createCompleteRulesEngineState();
    (badDeathVersion.death as { version: number }).version = 2;
    expect(() => assertCompleteRulesEngineState(badDeathVersion)).toThrow(/death stack root/);

    const badDeathFrames = createCompleteRulesEngineState();
    (badDeathFrames.death as unknown as { frames: unknown }).frames = {};
    expect(() => assertCompleteRulesEngineState(badDeathFrames)).toThrow(/death stack root/);

    const nonemptyDying = createCompleteRulesEngineState();
    const life = [
      { id: "victim", hp: 0, maxHp: 4, alive: true },
      { id: "rescuer", hp: 4, maxHp: 4, alive: true },
    ];
    pushDyingFrame(nonemptyDying.dying, createDyingFrame(life, {
      frameId: 1,
      victimId: "victim",
      reason: { type: "damage", eventId: 1, sourceId: "rescuer" },
      responderOrder: ["victim", "rescuer"],
    }));
    expect(() => assertCompleteRulesEngineState(nonemptyDying)).toThrow(/dying stack must remain empty/);
    expect(() => migrateCompleteRulesEngineState(nonemptyDying)).toThrow(/dying stack must remain empty/);

    const nonemptyDeath = createCompleteRulesEngineState();
    pushDeathFrame(nonemptyDeath.death, createDeathFrame({
      frameId: 1,
      death: {
        type: "death",
        eventId: 1,
        victimId: "victim",
        killerId: "killer",
        reason: { type: "damage", eventId: 1, sourceId: "killer" },
      },
    }));
    expect(() => assertCompleteRulesEngineState(nonemptyDeath)).toThrow(/death stack must remain empty/);
    expect(() => migrateCompleteRulesEngineState(nonemptyDeath)).toThrow(/death stack must remain empty/);
  });
});
