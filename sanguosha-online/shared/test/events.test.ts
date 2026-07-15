import { describe, expect, it } from "vitest";

import {
  EventEngineError,
  SkillRegistry,
  applyBooleanModifiers,
  applyNumericModifiers,
  assertTriggerWindow,
  buildTriggerWindow,
  cloneTriggerWindow,
  consumeTrigger,
  createGameEvent,
  orderOwnerTriggers,
  type SkillRuleDefinition,
} from "../src/engine/events.js";

function skill(rulesId: string, event: "damage_received" | "cards_moved", priority = 0): SkillRuleDefinition {
  return {
    rulesId,
    name: rulesId,
    categories: ["optional"],
    triggers: [{ id: "main", event, compulsory: false, conditionId: `${rulesId}.condition`, effectId: `${rulesId}.effect`, priority }],
    active: [],
    viewAs: [],
    modifiers: [],
  };
}

describe("event and skill registry", () => {
  it("allocates monotonic immutable events and rejects duplicate targets", () => {
    const stream = { nextEventId: 1 };
    const event = createGameEvent(stream, { type: "damage_received", frameId: 4, turnId: 2, phaseInstanceId: 3, sourceId: "a", targetIds: ["b"], reasonId: "slash", payload: { amount: 1 } });
    expect(event.eventId).toBe(1);
    expect(stream.nextEventId).toBe(2);
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.payload)).toBe(true);
    expect(() => createGameEvent(stream, { ...event, targetIds: ["b", "b"] })).toThrow(/duplicated/);
  });

  it("registers immutable definitions and proves required coverage", () => {
    const registry = new SkillRegistry();
    const definition = skill("yiji", "damage_received");
    registry.register(definition);
    definition.triggers[0]!.effectId = "mutated";
    expect(registry.get("yiji").triggers[0]?.effectId).toBe("yiji.effect");
    expect(Object.isFrozen(registry.get("yiji"))).toBe(true);
    expect(() => registry.register(skill("yiji", "damage_received"))).toThrow(/duplicate/);
    expect(() => registry.assertCoverage(["yiji", "fankui"])).toThrow(/fankui/);
    registry.register(skill("fankui", "damage_received"));
    expect(() => registry.assertCoverage(["yiji", "fankui"])).not.toThrow();
  });

  it("builds stable current-turn/seat/skill/target trigger order and never regenerates consumed refs", () => {
    const registry = new SkillRegistry();
    registry.register(skill("yiji", "damage_received"));
    registry.register(skill("fankui", "damage_received"));
    registry.register(skill("ganglie", "damage_received", 10));
    const stream = { nextEventId: 7 };
    const event = createGameEvent(stream, { type: "damage_received", frameId: 2, turnId: 1, phaseInstanceId: 3, sourceId: "a", targetIds: ["b", "c"], reasonId: "damage", payload: {} });
    const window = buildTriggerWindow(registry, event, [
      { ownerId: "b", rulesId: "yiji", registrationOrder: 1, grantedBy: null },
      { ownerId: "b", rulesId: "fankui", registrationOrder: 0, grantedBy: null },
      { ownerId: "c", rulesId: "ganglie", registrationOrder: 0, grantedBy: null },
    ], { currentTurnPlayerId: "b", seatOrder: ["a", "b", "c"] }, (_definition, _spec, instance) => instance.ownerId === "b" ? [1, 0] : [0]);
    expect(window.pending.map((trigger) => [trigger.rulesId, trigger.targetIndex])).toEqual([
      ["ganglie", 0],
      ["fankui", 0], ["yiji", 0],
      ["fankui", 1], ["yiji", 1],
    ]);
    expect(() => consumeTrigger(window, window.pending.at(-1)!.triggerId)).toThrow(/not next/);
    const first = consumeTrigger(window, window.pending[0]!.triggerId);
    expect(() => consumeTrigger(window, first.triggerId)).toThrow(/already consumed/);
    assertTriggerWindow(window);
  });

  it("rotates action order clockwise from the current turn player", () => {
    const registry = new SkillRegistry();
    registry.register(skill("yiji", "damage_received"));
    registry.register(skill("fankui", "damage_received"));
    const event = createGameEvent({ nextEventId: 1 }, { type: "damage_received", frameId: 2, turnId: 1, phaseInstanceId: 3, sourceId: "b", targetIds: ["b"], reasonId: "damage", payload: {} });
    const window = buildTriggerWindow(registry, event, [
      { ownerId: "a", rulesId: "yiji", registrationOrder: 0, grantedBy: null },
      { ownerId: "c", rulesId: "fankui", registrationOrder: 0, grantedBy: null },
    ], { currentTurnPlayerId: "b", seatOrder: ["a", "b", "c"] });

    expect(window.pending.map((trigger) => trigger.ownerId)).toEqual(["c", "a"]);
  });

  it("lets an owner explicitly order their simultaneous trigger group", () => {
    const registry = new SkillRegistry();
    registry.register(skill("yiji", "damage_received"));
    registry.register(skill("fankui", "damage_received"));
    const event = createGameEvent({ nextEventId: 1 }, { type: "damage_received", frameId: null, turnId: 1, phaseInstanceId: null, sourceId: "a", targetIds: ["b"], reasonId: "damage", payload: {} });
    const window = buildTriggerWindow(registry, event, [
      { ownerId: "b", rulesId: "yiji", registrationOrder: 0, grantedBy: null },
      { ownerId: "b", rulesId: "fankui", registrationOrder: 1, grantedBy: null },
    ], { currentTurnPlayerId: "a", seatOrder: ["a", "b"] });
    const reversed = [...window.pending].reverse().map((trigger) => trigger.triggerId);
    orderOwnerTriggers(window, "b", reversed);
    expect(window.pending.map((trigger) => trigger.triggerId)).toEqual(reversed);
  });

  it("does not let an owner reorder separate target occurrences as one group", () => {
    const registry = new SkillRegistry();
    registry.register(skill("yiji", "damage_received"));
    registry.register(skill("fankui", "damage_received"));
    const event = createGameEvent({ nextEventId: 1 }, { type: "damage_received", frameId: null, turnId: 1, phaseInstanceId: null, sourceId: "a", targetIds: ["b", "c"], reasonId: "damage", payload: {} });
    const window = buildTriggerWindow(registry, event, [
      { ownerId: "b", rulesId: "yiji", registrationOrder: 0, grantedBy: null },
      { ownerId: "b", rulesId: "fankui", registrationOrder: 1, grantedBy: null },
    ], { currentTurnPlayerId: "a", seatOrder: ["a", "b", "c"] }, () => [0, 1]);

    expect(() => orderOwnerTriggers(window, "b", window.pending.map((trigger) => trigger.triggerId))).toThrow(/orderable group/);
    const firstTargetGroup = window.pending.filter((trigger) => trigger.targetIndex === 0).map((trigger) => trigger.triggerId).reverse();
    orderOwnerTriggers(window, "b", firstTargetGroup);
    expect(window.pending.slice(0, 2).map((trigger) => trigger.triggerId)).toEqual(firstTargetGroup);
    expect(window.pending.slice(2).every((trigger) => trigger.targetIndex === 1)).toBe(true);
  });

  it("processes target occurrences independently and rejects forged target indexes", () => {
    const registry = new SkillRegistry();
    registry.register(skill("liuli", "target_confirming"));
    const event = createGameEvent({ nextEventId: 1 }, {
      type: "target_confirming", frameId: 3, turnId: 1, phaseInstanceId: 2,
      sourceId: "a", targetIds: ["b", "c"], reasonId: "slash", payload: {},
    });
    const window = buildTriggerWindow(registry, event, [
      { ownerId: "b", rulesId: "liuli", registrationOrder: 0, grantedBy: null },
      { ownerId: "c", rulesId: "liuli", registrationOrder: 0, grantedBy: null },
    ], { currentTurnPlayerId: "c", seatOrder: ["a", "b", "c"] }, (_definition, _spec, instance) => [instance.ownerId === "b" ? 0 : 1]);
    expect(window.pending.map((trigger) => [trigger.ownerId, trigger.targetIndex])).toEqual([["b", 0], ["c", 1]]);
    expect(() => buildTriggerWindow(registry, event, [
      { ownerId: "b", rulesId: "liuli", registrationOrder: 0, grantedBy: null },
    ], { currentTurnPlayerId: "a", seatOrder: ["a", "b", "c"] }, () => [2])).toThrow(/event targets/);
    expect(() => buildTriggerWindow(registry, event, [
      { ownerId: "b", rulesId: "liuli", registrationOrder: 0, grantedBy: null },
    ], { currentTurnPlayerId: "a", seatOrder: ["a", "b", "c"] }, () => [null])).toThrow(/event targets/);
  });

  it("uses a null target occurrence for event-wide targetless triggers", () => {
    const registry = new SkillRegistry();
    registry.register(skill("biyue", "phase_ended"));
    const event = createGameEvent({ nextEventId: 1 }, {
      type: "phase_ended", frameId: 1, turnId: 1, phaseInstanceId: 6,
      sourceId: "a", targetIds: [], reasonId: "end_phase", payload: {},
    });
    const window = buildTriggerWindow(registry, event, [
      { ownerId: "a", rulesId: "biyue", registrationOrder: 0, grantedBy: null },
    ], { currentTurnPlayerId: "a", seatOrder: ["a"] });
    expect(window.pending[0]?.targetIndex).toBeNull();
    expect(window.pending[0]?.triggerId).toContain(":global");
  });

  it("deep-clones trigger windows and detects cross-event corruption", () => {
    const registry = new SkillRegistry();
    registry.register(skill("lianying", "cards_moved"));
    const event = createGameEvent({ nextEventId: 4 }, { type: "cards_moved", frameId: 1, turnId: 1, phaseInstanceId: 2, sourceId: "a", targetIds: ["a"], reasonId: "use", payload: { cardIds: ["x"] } });
    const window = buildTriggerWindow(registry, event, [{ ownerId: "a", rulesId: "lianying", registrationOrder: 0, grantedBy: null }], { currentTurnPlayerId: "a", seatOrder: ["a"] });
    const restored = cloneTriggerWindow(JSON.parse(JSON.stringify(window)) as typeof window);
    expect(() => (restored.event.payload.cardIds as string[]).push("changed")).toThrow();
    expect(window.event.payload.cardIds).toEqual(["x"]);
    restored.pending[0]!.eventId = 999;
    expect(() => assertTriggerWindow(restored)).toThrow(EventEngineError);
  });

  it("strictly rejects non-JSON payloads and event ID overflow before mutation", () => {
    const base = { type: "cards_moved", frameId: null, turnId: null, phaseInstanceId: null, sourceId: null, targetIds: ["a"], reasonId: "test" } as const;
    expect(() => createGameEvent({ nextEventId: 1 }, { ...base, payload: { invalid: Number.NaN } })).toThrow();
    expect(() => createGameEvent({ nextEventId: 1 }, { ...base, payload: { invalid: undefined } as never })).toThrow();
    const stream = { nextEventId: Number.MAX_SAFE_INTEGER };
    expect(() => createGameEvent(stream, { ...base, payload: {} })).toThrow(/exhausted/);
    expect(stream.nextEventId).toBe(Number.MAX_SAFE_INTEGER);
    const event = createGameEvent({ nextEventId: 1 }, { ...base, payload: { nested: { ids: ["x"] } } });
    expect(Object.isFrozen(event.payload)).toBe(true);
    expect(Object.isFrozen(event.payload.nested)).toBe(true);
    expect(Object.isFrozen((event.payload.nested as { ids: string[] }).ids)).toBe(true);
  });

  it("combines numeric and boolean modifier contributions deterministically", () => {
    expect(applyNumericModifiers(2, [
      { contributionId: "b", ownerId: "x", rulesId: "yingzi", modifierSpecId: "draw", priority: 0, operation: "add", value: 1 },
      { contributionId: "a", ownerId: "x", rulesId: "haoshi", modifierSpecId: "draw", priority: 10, operation: "set", value: 4 },
      { contributionId: "c", ownerId: "x", rulesId: "cap", modifierSpecId: "draw", priority: -1, operation: "maximum", value: 4 },
    ])).toBe(4);
    expect(applyBooleanModifiers(true, [
      { contributionId: "allow", ownerId: "x", rulesId: "qicai", modifierSpecId: "range", priority: 0, operation: "allow", value: true },
      { contributionId: "deny", ownerId: "y", rulesId: "weimu", modifierSpecId: "target", priority: -1, operation: "deny", value: false },
    ])).toBe(false);
    expect(() => applyNumericModifiers(1, [{ contributionId: "bad", ownerId: "x", rulesId: "x", modifierSpecId: "x", priority: 0, operation: "deny", value: false }])).toThrow(/boolean/);
  });
});
