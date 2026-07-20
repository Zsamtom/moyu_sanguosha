import { describe, expect, it } from "vitest";

import {
  DamageError,
  applyDamageToLife,
  assertDamageInstance,
  beginDamageCausing,
  beginDamageModifiers,
  beginDamageReceiving,
  beginDamageRedirects,
  cloneDamageInstance,
  completeDamageTriggerWindow,
  consumeDamageTriggerPoint,
  createDamageInstance,
  currentDamageTriggerWindow,
  finishDamage,
  lockDamageAmount,
  loseHp,
  migrateDamageInstance,
  modifyDamage,
  preventDamage,
  recoverHp,
  redirectDamage,
  resumeDamageAfterDying,
  resumeDamageAfterProtectedDying,
  type DamageInstance,
  type LegacyDamageInstanceV1,
  type LifePlayerState,
} from "../src/engine/damage.js";

function players(): LifePlayerState[] {
  return [
    { id: "source", hp: 4, maxHp: 4, alive: true },
    { id: "target", hp: 4, maxHp: 4, alive: true },
    { id: "xiaoqiao", hp: 3, maxHp: 3, alive: true },
  ];
}

function damage(amount = 1) {
  return createDamageInstance({
    damageId: 1,
    frameId: 2,
    sourceId: "source",
    targetId: "target",
    cardUseId: 3,
    physicalCardIds: ["slash-1"],
    nature: "fire",
    reason: { type: "card", id: "fire_slash" },
    amount,
  });
}

describe("damage pipeline", () => {
  it("persists start, causing, receiving, life-deduction, and post-damage stages", () => {
    const life = players();
    const instance = damage(2);
    expect(instance.stage).toBe("start");
    beginDamageCausing(instance);
    expect(instance.stage).toBe("causing");
    modifyDamage(instance, { operation: "add", value: 1, skillId: "tengjia" });
    beginDamageReceiving(instance);
    expect(instance.stage).toBe("receiving");
    modifyDamage(instance, { operation: "cap", value: 1, skillId: "baiyin_shizi" });
    expect(lockDamageAmount(instance)).toBe(1);
    expect(instance.stage).toBe("ready_for_life_deduction");
    expect(applyDamageToLife(life, instance)).toEqual({
      damageId: 1,
      targetId: "target",
      amount: 1,
      hpBefore: 4,
      hpAfter: 3,
      entersDying: false,
    });
    expect(instance.stage).toBe("life_deducted");
    resumeDamageAfterDying(life, instance);
    expect(currentDamageTriggerWindow(life, instance)).toMatchObject({ kind: "source_after_once", cadence: "once" });
    completeDamageTriggerWindow(instance);
    expect(consumeDamageTriggerPoint(instance)).toBe(1);
    expect(currentDamageTriggerWindow(life, instance)).toMatchObject({ kind: "target_after_once", cadence: "once" });
    completeDamageTriggerWindow(instance);
    expect(consumeDamageTriggerPoint(instance)).toBe(1);
    expect(instance.stage).toBe("settlement_end");
    finishDamage(instance);
    expect(instance.stage).toBe("complete");
    assertDamageInstance(instance);
  });

  it("redirects Tianxiang damage without applying it to the original target", () => {
    const life = players();
    const instance = damage();
    beginDamageRedirects(instance);
    redirectDamage(instance, { toTargetId: "xiaoqiao", sourceId: "xiaoqiao", skillId: "tianxiang" });
    beginDamageModifiers(instance);
    lockDamageAmount(instance);
    const applied = applyDamageToLife(life, instance);
    expect(applied.targetId).toBe("xiaoqiao");
    expect(life.find((player) => player.id === "target")?.hp).toBe(4);
    expect(life.find((player) => player.id === "xiaoqiao")?.hp).toBe(2);
    expect(() => redirectDamage(instance, { toTargetId: "target", skillId: "loop" })).toThrow(DamageError);
  });

  it("runs once-per-damage windows once and per-point windows twice for two damage", () => {
    const life = players();
    const instance = damage(2);
    beginDamageModifiers(instance);
    lockDamageAmount(instance);
    expect(applyDamageToLife(life, instance)).toMatchObject({ hpBefore: 4, hpAfter: 2, entersDying: false });
    resumeDamageAfterDying(life, instance);

    const visited: string[] = [];
    while (instance.stage !== "complete") {
      const window = currentDamageTriggerWindow(life, instance);
      expect(window).not.toBeNull();
      visited.push(`${window!.kind}:${window!.pointIndex ?? "once"}`);
      completeDamageTriggerWindow(instance);
    }
    expect(visited).toEqual([
      "source_after_once:once",
      "source_after_per_point:1",
      "source_after_per_point:2",
      "target_after_once:once",
      "target_after_per_point:1",
      "target_after_per_point:2",
      "settlement_end:once",
    ]);
    expect(instance.stage).toBe("complete");
    expect(() => consumeDamageTriggerPoint(instance)).toThrow(DamageError);
  });

  it("waits for dying resolution and does not permit a living player at zero HP to resume", () => {
    const life = players();
    const instance = damage(5);
    beginDamageModifiers(instance);
    lockDamageAmount(instance);
    expect(applyDamageToLife(life, instance).entersDying).toBe(true);
    expect(() => resumeDamageAfterDying(life, instance)).toThrow(/still requires dying/);
    const target = life.find((player) => player.id === "target")!;
    target.hp = 1;
    resumeDamageAfterDying(life, instance);
    expect(instance.stage).toBe("source_after_once");
  });

  it("uses the shared post-damage timing only for an explicit matching Buqu protection", () => {
    const life = players();
    life[1]!.hp = 1;
    const instance = damage(2);
    beginDamageModifiers(instance);
    lockDamageAmount(instance);
    expect(applyDamageToLife(life, instance)).toMatchObject({ hpAfter: -1, entersDying: true });

    expect(() => resumeDamageAfterDying(life, instance)).toThrow(/still requires dying/);
    resumeDamageAfterProtectedDying(life, instance, { skillId: "buqu", targetId: "target" });
    const windows: string[] = [];
    while (instance.stage !== "complete") {
      const window = currentDamageTriggerWindow(life, instance);
      expect(window).not.toBeNull();
      windows.push(`${window!.kind}:${window!.pointIndex ?? "once"}`);
      completeDamageTriggerWindow(instance);
    }
    expect(windows).toEqual([
      "source_after_once:once",
      "source_after_per_point:1",
      "source_after_per_point:2",
      "target_after_once:once",
      "target_after_per_point:1",
      "target_after_per_point:2",
      "settlement_end:once",
    ]);
  });

  it("rejects forged protected resumes at the low-level boundary", () => {
    const life = players();
    life[1]!.hp = 1;
    const instance = damage(2);
    beginDamageModifiers(instance);
    lockDamageAmount(instance);
    applyDamageToLife(life, instance);

    expect(() => resumeDamageAfterProtectedDying(life, instance, {
      skillId: "niepan" as never, targetId: "target",
    })).toThrow(/only Buqu/);
    expect(() => resumeDamageAfterProtectedDying(life, instance, {
      skillId: "buqu", targetId: "xiaoqiao",
    })).toThrow(/does not match/);
    life[1]!.hp = 1;
    expect(() => resumeDamageAfterProtectedDying(life, instance, {
      skillId: "buqu", targetId: "target",
    })).toThrow(/nonpositive/);
    life[1]!.hp = -1;
    life[1]!.alive = false;
    expect(() => resumeDamageAfterProtectedDying(life, instance, {
      skillId: "buqu", targetId: "target",
    })).toThrow(/is dead/);
    expect(instance.stage).toBe("life_deducted");
  });

  it("resumes post-damage trigger windows after the target's death is confirmed", () => {
    const life = players();
    life[1]!.hp = 1;
    const instance = damage();
    beginDamageModifiers(instance);
    lockDamageAmount(instance);
    expect(applyDamageToLife(life, instance)).toMatchObject({ hpAfter: 0, entersDying: true });
    life[1]!.alive = false;

    resumeDamageAfterDying(life, instance);
    const sourceWindow = currentDamageTriggerWindow(life, instance);
    expect(sourceWindow).toMatchObject({ kind: "source_after_once", subjectId: "source" });
    expect(sourceWindow?.eligibleOwnerIds).toEqual(["source", "xiaoqiao"]);
    completeDamageTriggerWindow(instance);
    expect(consumeDamageTriggerPoint(instance)).toBe(1);
    expect(instance.stage).toBe("target_after_once");
    expect(currentDamageTriggerWindow(life, instance)?.eligibleOwnerIds).not.toContain("target");
  });

  it("prevents damage without touching HP and can finish exactly once", () => {
    const life = players();
    const instance = damage();
    beginDamageModifiers(instance);
    preventDamage(instance, { skillId: "dawu", reason: "non-thunder damage prevented by Fog" });
    expect(life[1]?.hp).toBe(4);
    expect(() => applyDamageToLife(life, instance)).toThrow(DamageError);
    expect(currentDamageTriggerWindow(life, instance)).toMatchObject({ kind: "settlement_end", eventType: "damage_completed" });
    finishDamage(instance);
    expect(instance.stage).toBe("complete");
    expect(() => finishDamage(instance)).toThrow(DamageError);
  });

  it("keeps source-less HP loss and recovery out of the damage pipeline", () => {
    const life = players();
    const loss = loseHp(life, { eventId: 4, targetId: "target", amount: 2, reason: "kurou" });
    expect(loss).toMatchObject({ type: "hp_loss", hpBefore: 4, hpAfter: 2, entersDying: false });
    expect("stage" in loss).toBe(false);
    const recovery = recoverHp(life, { eventId: 5, sourceId: null, targetId: "target", amount: 5, reason: "peach" });
    expect(recovery).toMatchObject({ requestedAmount: 5, recoveredAmount: 2, hpAfter: 4 });
  });

  it("restores an exact per-point cursor without replaying completed windows", () => {
    const life = players();
    const instance = damage(2);
    beginDamageModifiers(instance);
    lockDamageAmount(instance);
    applyDamageToLife(life, instance);
    resumeDamageAfterDying(life, instance);
    completeDamageTriggerWindow(instance);
    expect(consumeDamageTriggerPoint(instance)).toBe(1);

    const restored = cloneDamageInstance(JSON.parse(JSON.stringify(instance)) as DamageInstance);
    assertDamageInstance(restored);
    expect(restored).toMatchObject({
      version: 2,
      stage: "source_after_per_point",
      triggerProgress: { sourceOnceCompleted: true, sourcePointCursor: 1 },
    });
    expect(currentDamageTriggerWindow(life, restored)).toMatchObject({ kind: "source_after_per_point", pointIndex: 2 });
    expect(consumeDamageTriggerPoint(restored)).toBe(2);
    expect(restored.stage).toBe("target_after_once");
  });

  it("migrates safe v1 boundaries and rejects an ambiguous partial combined cursor", () => {
    const life = players();
    const current = damage(2);
    beginDamageModifiers(current);
    lockDamageAmount(current);
    applyDamageToLife(life, current);
    const { version: _version, triggerProgress: _triggerProgress, ...legacyBase } = current;
    const legacy = { ...legacyBase, stage: "after_damage", completedTriggerPoints: 0 } as LegacyDamageInstanceV1;

    expect(() => assertDamageInstance(legacy as unknown as DamageInstance)).toThrow(/migrateDamageInstance/);
    expect(migrateDamageInstance(legacy)).toMatchObject({ version: 2, stage: "source_after_once" });
    expect(() => migrateDamageInstance({ ...legacy, completedTriggerPoints: 1 })).toThrow(/replay ambiguity/);
    expect(migrateDamageInstance({ ...legacy, completedTriggerPoints: 2 })).toMatchObject({
      stage: "settlement_end",
      triggerProgress: { sourcePointCursor: 2, targetPointCursor: 2 },
    });
  });

  it("deep-clones JSON snapshots and detects redirect/progress corruption", () => {
    const instance = damage(2);
    beginDamageRedirects(instance);
    redirectDamage(instance, { toTargetId: "xiaoqiao", skillId: "tianxiang" });
    beginDamageModifiers(instance);
    modifyDamage(instance, { operation: "add", value: 1, skillId: "kuangfeng" });
    const restored = cloneDamageInstance(JSON.parse(JSON.stringify(instance)) as typeof instance);
    restored.redirects[0]!.skillId = "changed";
    restored.modifiers[0]!.skillId = "changed";
    expect(instance.redirects[0]?.skillId).toBe("tianxiang");
    expect(instance.modifiers[0]?.skillId).toBe("kuangfeng");
    assertDamageInstance(instance);

    const corrupt = cloneDamageInstance(instance);
    corrupt.targetId = "target";
    expect(() => assertDamageInstance(corrupt)).toThrow(/redirect history/);

    const corruptReason = cloneDamageInstance(instance);
    (corruptReason.reason as { type: string }).type = "forged";
    expect(() => assertDamageInstance(corruptReason)).toThrow(/metadata/);
  });
});
