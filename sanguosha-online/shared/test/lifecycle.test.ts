import { describe, expect, it } from "vitest";

import {
  LifecycleError,
  addMark,
  addStatusEffect,
  assertSkillLifecycleState,
  awakenSkill,
  cloneSkillLifecycleState,
  consumeLimitedSkill,
  createSkillLifecycleState,
  effectiveSkillIds,
  expireLifecycleState,
  grantSkill,
  hasAwakened,
  markCount,
  recordSkillLoss,
  setMaximumHp,
  spendMarks,
  suppressSkills,
} from "../src/engine/lifecycle.js";

describe("marks and skill lifecycle", () => {
  it("keeps same-named marks isolated by source and never permits a negative count", () => {
    const state = createSkillLifecycleState();
    addMark(state, { markId: "nightmare", ownerId: "victim", sourcePlayerId: "god-guan-1", sourceSkillId: "wuhun", amount: 2, visibility: "public", expiry: { type: "permanent" } });
    addMark(state, { markId: "nightmare", ownerId: "victim", sourcePlayerId: "god-guan-2", sourceSkillId: "wuhun", amount: 3, visibility: "public", expiry: { type: "permanent" } });
    expect(markCount(state, { ownerId: "victim", markId: "nightmare" })).toBe(5);
    expect(markCount(state, { ownerId: "victim", markId: "nightmare", sourcePlayerId: "god-guan-1" })).toBe(2);
    spendMarks(state, { ownerId: "victim", markId: "nightmare", amount: 1, sourcePlayerId: "god-guan-1" });
    expect(markCount(state, { ownerId: "victim", markId: "nightmare", sourcePlayerId: "god-guan-1" })).toBe(1);
    expect(() => spendMarks(state, { ownerId: "victim", markId: "nightmare", amount: 2, sourcePlayerId: "god-guan-1" })).toThrow(/not enough/);
  });

  it("expires marks, effects, grants and suppressions only at their exact boundary", () => {
    const state = createSkillLifecycleState();
    addMark(state, { markId: "rage", ownerId: "lvbu", sourcePlayerId: "lvbu", sourceSkillId: "kuangbao", amount: 1, visibility: "public", expiry: { type: "permanent" } });
    addStatusEffect(state, { ownerId: "target", kind: "fog", sourcePlayerId: "zhuge", sourceSkillId: "dawu", payload: {}, visibility: "public", expiry: { type: "turn_start", playerId: "zhuge", afterTurnId: 7 } });
    grantSkill(state, { ownerId: "lvbu", skillId: "wushuang", sourcePlayerId: "lvbu", sourceSkillId: "wuqian", expiry: { type: "turn_end", turnId: 7 } });
    suppressSkills(state, { ownerId: "target", skillId: null, sourcePlayerId: "lvbu", sourceSkillId: "wuqian", expiry: { type: "turn_end", turnId: 7 } });
    expect(expireLifecycleState(state, { type: "turn_end", turnId: 6 }).grants).toHaveLength(0);
    const expired = expireLifecycleState(state, { type: "turn_end", turnId: 7 });
    expect(expired.grants).toHaveLength(1);
    expect(expired.suppressions).toHaveLength(1);
    expect(state.marks).toHaveLength(1);
    expect(expireLifecycleState(state, { type: "turn_start", playerId: "zhuge", turnId: 7 }).effects).toHaveLength(0);
    expect(expireLifecycleState(state, { type: "turn_start", playerId: "zhuge", turnId: 8 }).effects).toHaveLength(1);
  });

  it("supports first-match expiry across turn start, source death, skill loss, and game end", () => {
    const state = createSkillLifecycleState();
    addStatusEffect(state, {
      ownerId: "target",
      kind: "fog",
      sourcePlayerId: "zhuge",
      sourceSkillId: "dawu",
      payload: {},
      visibility: "public",
      expiry: {
        type: "any_of",
        anyOf: [
          { type: "turn_start", playerId: "zhuge", afterTurnId: 7 },
          { type: "source_death", sourcePlayerId: "zhuge" },
          { type: "skill_lost", ownerId: "zhuge", skillId: "dawu" },
          { type: "game_end" },
        ],
      },
    });
    expect(expireLifecycleState(state, { type: "turn_start", playerId: "zhuge", turnId: 7 }).effects).toEqual([]);
    expect(expireLifecycleState(state, { type: "skill_lost", ownerId: "zhuge", skillId: "qixing" }).effects).toEqual([]);
    expect(expireLifecycleState(state, { type: "source_death", sourcePlayerId: "zhuge" }).effects).toHaveLength(1);
    expect(state.effects).toEqual([]);
  });

  it("composes base, granted and suppressed skills dynamically", () => {
    const state = createSkillLifecycleState();
    grantSkill(state, { ownerId: "liuchan", skillId: "jijiang", sourcePlayerId: "liuchan", sourceSkillId: "ruoyu", expiry: { type: "permanent" } });
    expect(effectiveSkillIds(state, "liuchan", ["xiangle", "fangquan", "ruoyu"])).toEqual(["xiangle", "fangquan", "ruoyu", "jijiang"]);
    suppressSkills(state, { ownerId: "liuchan", skillId: "fangquan", sourcePlayerId: "caiwenji", sourceSkillId: "duanchang", expiry: { type: "permanent" } });
    expect(effectiveSkillIds(state, "liuchan", ["xiangle", "fangquan", "ruoyu"])).toEqual(["xiangle", "ruoyu", "jijiang"]);
    suppressSkills(state, { ownerId: "liuchan", skillId: null, sourcePlayerId: "test", sourceSkillId: "disable_all", expiry: { type: "phase_end", phaseInstanceId: 9 } });
    expect(effectiveSkillIds(state, "liuchan", ["xiangle", "fangquan", "ruoyu"])).toEqual([]);
  });

  it("records Duanchang-style loss as a snapshot instead of suppressing future grants", () => {
    const state = createSkillLifecycleState();
    recordSkillLoss(state, {
      ownerId: "killer",
      skillIds: ["wushuang", "mashu"],
      sourcePlayerId: "caiwenji",
      sourceSkillId: "duanchang",
      lostAtEventId: 20,
    });
    expect(effectiveSkillIds(state, "killer", ["wushuang", "mashu"])).toEqual([]);
    grantSkill(state, {
      ownerId: "killer",
      skillId: "wushuang",
      sourcePlayerId: "zuoci",
      sourceSkillId: "huashen",
      expiry: { type: "permanent" },
    });
    // The prior loss removes the old instance, not a future independently-granted one.
    expect(effectiveSkillIds(state, "killer", [])).toEqual(["wushuang"]);
  });

  it("rejects mark and lifecycle ID overflow before mutating state", () => {
    const state = createSkillLifecycleState();
    addMark(state, { markId: "rage", ownerId: "lvbu", sourcePlayerId: "lvbu", sourceSkillId: "kuangbao", amount: Number.MAX_SAFE_INTEGER, visibility: "public", expiry: { type: "permanent" } });
    expect(() => addMark(state, { markId: "rage", ownerId: "lvbu", sourcePlayerId: "lvbu", sourceSkillId: "kuangbao", amount: 1, visibility: "public", expiry: { type: "permanent" } })).toThrow(/overflow/);
    expect(state.marks[0]?.value).toBe(Number.MAX_SAFE_INTEGER);
    state.nextEffectId = Number.MAX_SAFE_INTEGER;
    expect(() => addStatusEffect(state, { ownerId: "target", kind: "fog", sourcePlayerId: "zhuge", sourceSkillId: "dawu", payload: {}, visibility: "public", expiry: { type: "permanent" } })).toThrow(/exhausted/);
    expect(state.effects).toEqual([]);
  });

  it("allows each limited and awakening skill exactly once", () => {
    const state = createSkillLifecycleState();
    consumeLimitedSkill(state, "pangtong", "niepan", 10);
    expect(() => consumeLimitedSkill(state, "pangtong", "niepan", 11)).toThrow(/already/);
    awakenSkill(state, "dengai", "zaoxian", 12);
    expect(hasAwakened(state, "dengai", "zaoxian")).toBe(true);
    expect(() => awakenSkill(state, "dengai", "zaoxian", 13)).toThrow(/already/);
  });

  it("clamps HP when maximum HP is reduced", () => {
    const player = { id: "lord", hp: 5, maxHp: 5, alive: true };
    setMaximumHp(player, 3);
    expect(player).toMatchObject({ hp: 3, maxHp: 3 });
    expect(() => setMaximumHp(player, 0)).toThrow(LifecycleError);
  });

  it("deep-clones snapshots and validates monotonic IDs and one-shot records", () => {
    const state = createSkillLifecycleState();
    addStatusEffect(state, { ownerId: "target", kind: "gale", sourcePlayerId: "zhuge", sourceSkillId: "kuangfeng", payload: { fireDamage: 1 }, visibility: "public", expiry: { type: "turn_start", playerId: "zhuge", afterTurnId: 2 } });
    const restored = cloneSkillLifecycleState(JSON.parse(JSON.stringify(state)) as typeof state);
    (restored.effects[0]!.payload as { fireDamage: number }).fireDamage = 99;
    expect(state.effects[0]?.payload.fireDamage).toBe(1);
    assertSkillLifecycleState(state);
    restored.nextEffectId = 1;
    expect(() => assertSkillLifecycleState(restored)).toThrow(LifecycleError);
  });
});
