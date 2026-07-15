import { describe, expect, it } from "vitest";

import type { CardCategory, CardKind, CardSuit, EquipmentSlot } from "../src/types.js";
import {
  GOD_DYNAMIC_SKILL_IDS,
  GOD_GENERAL_IDS,
  GOD_RULE_DECISIONS,
  GOD_SKILL_IDS,
  JILUE_BORROWED_SKILL_IDS,
  evaluateJilueWanshaPeach,
  evaluateLonghun,
  evaluateShelieActivation,
  evaluateWushenDistance,
  evaluateWushenViewAs,
  planBaiyin,
  planDawu,
  planFeiyingDistance,
  planGodFactionChoice,
  planGongxin,
  planGuixinDamageWindows,
  planGuixinPoint,
  planJilueFangzhu,
  planJilueGuicai,
  planJilueJizhi,
  planJilueWansha,
  planJilueZhiheng,
  planJuejingDraw,
  planJuejingHandLimit,
  planKuangbaoDamage,
  planKuangbaoInitial,
  planKuangfeng,
  planLianpoExtraTurn,
  planQinyin,
  planQixingExchange,
  planQixingInitial,
  planQixingWeatherCleanup,
  planQixingWeatherDamage,
  planRenjieDamage,
  planRenjieDiscard,
  planShelieSettlement,
  planShenfen,
  planShenfenVictimDiscard,
  planWuhunDamageMarks,
  planWuhunDeath,
  planWumou,
  planWuqian,
  planYeyan,
  recordLianpoKill,
  settleWuhunJudgment,
  type GodPhaseContext,
  type GodRuleCard,
  type GodRuleResult,
  type GodSkillContext,
  type JilueContext,
  type LonghunEffectiveKind,
} from "../src/skills/god-runtime.js";

function must<T>(result: GodRuleResult<T>): T {
  if (!result.ok) throw new Error(`${result.code}: ${result.detail}`);
  return result.value;
}

function skill(ownerId = "owner"): GodSkillContext {
  return { ownerId, ownerAlive: true, skillEffective: true };
}

function phase(name: GodPhaseContext["phase"], ownerId = "owner"): GodPhaseContext {
  return { ...skill(ownerId), currentPlayerId: ownerId, phase: name };
}

function jilue(ownerId = "sima", renMarks = 3): JilueContext {
  return { ...skill(ownerId), awakened: true, renMarks };
}

function card(overrides: Partial<GodRuleCard> = {}): GodRuleCard {
  return {
    id: "c1",
    kind: "dodge",
    category: "basic",
    printedSuit: "spade",
    rank: 7,
    ownerId: "owner",
    zone: "hand",
    equipmentSlot: null,
    physical: true,
    ...overrides,
  };
}

function equipment(overrides: Partial<GodRuleCard> = {}): GodRuleCard {
  return card({
    kind: "gu_ding_dao",
    category: "equipment",
    equipmentSlot: "weapon",
    zone: "equipment",
    ...overrides,
  });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function pure<I, T>(input: I, call: (frozen: I) => GodRuleResult<T>): GodRuleResult<T> {
  const frozen = deepFreeze(input);
  const before = structuredClone(input);
  const result = call(frozen);
  expect(input).toEqual(before);
  expect(() => JSON.parse(JSON.stringify(result))).not.toThrow();
  return result;
}

describe("God runtime catalog and setup", () => {
  it("locks scope to 8 generals, 21 intrinsic/awakened skills and 6 dynamic references", () => {
    expect(GOD_GENERAL_IDS).toHaveLength(8);
    expect(GOD_SKILL_IDS).toHaveLength(21);
    expect(GOD_DYNAMIC_SKILL_IDS).toHaveLength(6);
    expect(JILUE_BORROWED_SKILL_IDS).toHaveLength(5);
    expect(new Set(GOD_GENERAL_IDS)).toHaveLength(8);
    expect(new Set(GOD_SKILL_IDS)).toHaveLength(21);
    expect(new Set(GOD_DYNAMIC_SKILL_IDS)).toHaveLength(6);
  });

  it("publishes immutable source-conflict decisions", () => {
    expect(GOD_RULE_DECISIONS.shenfen).toContain("damage_all_then_equipment_all_then_hand_all");
    expect(GOD_RULE_DECISIONS.lianpo).toContain("java_nested_run");
    expect(GOD_RULE_DECISIONS.shelie).toContain("java_optional_subset_rejected");
    expect(Object.isFrozen(GOD_RULE_DECISIONS)).toBe(true);
  });

  it.each(["wei", "shu", "wu", "qun"] as const)("accepts the selectable faction %s", (chosenFaction) => {
    expect(must(planGodFactionChoice({
      ownerId: "god",
      generalId: "shen_cao_cao",
      setupStage: "before_game_start",
      currentFaction: null,
      chosenFaction,
    }))).toMatchObject({ chosenFaction, appliesToFactionChecksAndLordSkills: true, immutableForGame: true });
  });

  it.each([
    ["god choice", { chosenFaction: "god" }, "invalid_choice"],
    ["late choice", { setupStage: "game_started" }, "wrong_timing"],
    ["second choice", { currentFaction: "wei" }, "already_used"],
    ["unknown general", { generalId: "not-god" }, "invalid_input"],
  ] as const)("fails closed for %s", (_label, patch, code) => {
    const result = planGodFactionChoice({
      ownerId: "god",
      generalId: "shen_cao_cao",
      setupStage: "before_game_start",
      currentFaction: null,
      chosenFaction: "wei",
      ...patch,
    } as Parameters<typeof planGodFactionChoice>[0]);
    expect(result).toMatchObject({ ok: false, code });
  });
});

describe("Shen Guan Yu rules", () => {
  it.each([
    ["use", "use"],
    ["respond", "respond"],
  ] as const)("Wushen replaces an effective-Heart hand card for %s", (_label, method) => {
    const input = {
      context: skill("guan"),
      card: card({ ownerId: "guan", printedSuit: "heart", kind: "peach" }),
      effectiveSuit: "heart" as const,
      method,
      slashTimingLegal: true,
    };
    expect(must(pure(input, (frozen) => evaluateWushenViewAs(frozen)))).toMatchObject({
      effectiveKind: "slash", method, lockedReplacement: true, retainsPhysicalRank: true,
    });
  });

  it.each([
    ["non-heart", { effectiveSuit: "diamond" }, "invalid_card"],
    ["equipment", { card: equipment({ ownerId: "guan", printedSuit: "heart" }), effectiveSuit: "heart" }, "invalid_card"],
    ["wrong owner", { card: card({ ownerId: "other", printedSuit: "heart" }), effectiveSuit: "heart" }, "invalid_card"],
    ["illegal timing", { slashTimingLegal: false }, "wrong_timing"],
    ["dead owner", { context: { ...skill("guan"), ownerAlive: false } }, "owner_dead"],
  ] as const)("Wushen rejects %s", (_label, patch, code) => {
    const result = evaluateWushenViewAs({
      context: skill("guan"),
      card: card({ ownerId: "guan", printedSuit: "heart" }),
      effectiveSuit: "heart",
      method: "use",
      slashTimingLegal: true,
      ...patch,
    } as Parameters<typeof evaluateWushenViewAs>[0]);
    expect(result).toMatchObject({ ok: false, code });
  });

  it.each([
    ["own declaration", "owner_declared_target", false, true, true],
    ["ordinary in range", "owner_declared_target", true, true, true],
    ["borrowed preselection", "borrowed_sword_preselected", false, false, false],
    ["lord dispatch preselection", "lord_dispatch_preselected", true, false, true],
  ] as const)("resolves Wushen distance for %s", (_label, declarationOrigin, inRange, ignores, legal) => {
    expect(must(evaluateWushenDistance({
      attackerId: "guan",
      hasEffectiveWushen: true,
      slashEffectiveSuit: "heart",
      declarationOrigin,
      targetWithinOrdinaryRange: inRange,
    }))).toMatchObject({ ignoresDistance: ignores, targetLegalByDistance: legal });
  });

  it.each([
    ["one sourced point", "enemy", 1, 1],
    ["three sourced points", "enemy", 3, 3],
    ["source-less damage", null, 2, 0],
  ] as const)("adds Wuhun marks for %s", (_label, sourceId, damageAmount, delta) => {
    expect(must(planWuhunDamageMarks({ context: skill("guan"), sourceId, damageAmount }))).toMatchObject({ nightmareMarkDelta: delta });
  });

  it("selects only living positive maximum mark holders", () => {
    const input = {
      ownerId: "guan",
      deathConfirmed: true,
      gameAlreadyFinished: false,
      otherPlayers: [
        { id: "dead-max", alive: false, nightmareMarks: 9 },
        { id: "a", alive: true, nightmareMarks: 3 },
        { id: "b", alive: true, nightmareMarks: 3 },
        { id: "c", alive: true, nightmareMarks: 2 },
      ],
      chosenTargetId: "b",
    };
    expect(must(pure(input, (frozen) => planWuhunDeath(frozen)))).toMatchObject({
      maximumMarks: 3,
      eligibleTargetIds: ["a", "b"],
      judgmentTargetId: "b",
      resolvesBeforeOriginalDeathRewardsAndPunishments: true,
    });
  });

  it("does nothing safely when no living role has a mark", () => {
    expect(must(planWuhunDeath({
      ownerId: "guan", deathConfirmed: true, gameAlreadyFinished: false,
      otherPlayers: [{ id: "a", alive: true, nightmareMarks: 0 }], chosenTargetId: null,
    }))).toMatchObject({ maximumMarks: 0, eligibleTargetIds: [], judgmentTargetId: null });
  });

  it.each([
    ["nonmaximum choice", { chosenTargetId: "c" }, "invalid_choice"],
    ["missing tie choice", { chosenTargetId: null }, "invalid_choice"],
    ["unconfirmed death", { deathConfirmed: false }, "wrong_timing"],
    ["already ended game", { gameAlreadyFinished: true }, "game_finished"],
  ] as const)("Wuhun death rejects %s", (_label, patch, code) => {
    const result = planWuhunDeath({
      ownerId: "guan", deathConfirmed: true, gameAlreadyFinished: false,
      otherPlayers: [
        { id: "a", alive: true, nightmareMarks: 2 },
        { id: "b", alive: true, nightmareMarks: 2 },
        { id: "c", alive: true, nightmareMarks: 1 },
      ],
      chosenTargetId: "a",
      ...patch,
    });
    expect(result).toMatchObject({ ok: false, code });
  });

  it.each([
    ["peach", true],
    ["peach_garden", true],
    ["slash", false],
  ] as const)("settles Wuhun judgment result %s", (finalEffectiveCardKind, survives) => {
    expect(must(settleWuhunJudgment({ targetId: "victim", finalEffectiveCardKind }))).toEqual({
      skillId: "wuhun",
      targetId: "victim",
      survives,
      immediateDeath: !survives,
      bypassDyingRescueAndBuqu: true,
      deathSourceId: null,
    });
  });
});

describe("Shen Lu Meng rules", () => {
  it.each([
    ["replace_draw", true, 5],
    ["normal_draw", false, 0],
  ] as const)("resolves Shelie choice %s", (decision, activated, revealCount) => {
    expect(must(evaluateShelieActivation({ context: phase("draw", "meng"), drawPhaseAvailable: true, decision }))).toMatchObject({
      activated, replacesNormalDraw: activated, revealCount,
    });
  });

  it("does not offer Shelie after a skipped draw phase", () => {
    expect(evaluateShelieActivation({
      context: phase("draw", "meng"), drawPhaseAvailable: false, decision: "replace_draw",
    })).toMatchObject({ ok: false, code: "wrong_timing" });
  });

  it("gains exactly one card of every represented printed suit", () => {
    const input = {
      ownerId: "meng",
      revealedCards: [
        { id: "s1", printedSuit: "spade" as const },
        { id: "s2", printedSuit: "spade" as const },
        { id: "h", printedSuit: "heart" as const },
        { id: "c", printedSuit: "club" as const },
        { id: "d", printedSuit: "diamond" as const },
      ],
      selectedCardIds: ["s2", "h", "c", "d"],
    };
    expect(must(pure(input, (frozen) => planShelieSettlement(frozen)))).toMatchObject({
      gainCardIds: ["s2", "h", "c", "d"], discardCardIds: ["s1"], exactlyOnePerPrintedSuitPresent: true,
    });
  });

  it("handles five cards of one suit by requiring exactly one", () => {
    expect(must(planShelieSettlement({
      ownerId: "meng",
      revealedCards: [1, 2, 3, 4, 5].map((n) => ({ id: `h${n}`, printedSuit: "heart" as const })),
      selectedCardIds: ["h3"],
    }))).toMatchObject({ gainCardIds: ["h3"], discardCardIds: ["h1", "h2", "h4", "h5"] });
  });

  it.each([
    ["optional subset", ["s", "h"], "invalid_choice"],
    ["duplicate suit", ["s1", "s2", "h", "c"], "invalid_choice"],
    ["unknown card", ["s1", "h", "c", "x"], "invalid_choice"],
  ] as const)("Shelie rejects %s", (_label, selectedCardIds, code) => {
    const result = planShelieSettlement({
      ownerId: "meng",
      revealedCards: [
        { id: "s1", printedSuit: "spade" }, { id: "s2", printedSuit: "spade" },
        { id: "h", printedSuit: "heart" }, { id: "c", printedSuit: "club" }, { id: "d", printedSuit: "diamond" },
      ],
      selectedCardIds,
    });
    expect(result).toMatchObject({ ok: false, code });
  });

  it.each([
    ["discard", "discard", "heart", "h", "h", null],
    ["top deck", "put_on_draw_pile_top", "heart", "h", null, "h"],
    ["Hongyan effective Heart", "discard", "heart", "spade", "spade", null],
  ] as const)("Gongxin performs %s", (_label, action, effectiveSuit, selectedCardId, discardCardId, drawPileTopCardId) => {
    expect(must(planGongxin({
      context: phase("play", "meng"), usedThisPlayPhase: false,
      targetId: "target", targetAlive: true,
      targetHand: [{ id: selectedCardId, effectiveSuit }, { id: "n", effectiveSuit: "club" }],
      selectedCardId, action,
    }))).toMatchObject({ consumePlayPhaseUse: true, revealedCardId: selectedCardId, discardCardId, drawPileTopCardId });
  });

  it("consumes Gongxin even when no Heart is selected", () => {
    expect(must(planGongxin({
      context: phase("play", "meng"), usedThisPlayPhase: false,
      targetId: "target", targetAlive: true, targetHand: [{ id: "c", effectiveSuit: "club" }],
      selectedCardId: null, action: null,
    }))).toMatchObject({ consumePlayPhaseUse: true, revealedCardId: null });
  });

  it.each([
    ["self target", { targetId: "meng" }, "invalid_target"],
    ["second use", { usedThisPlayPhase: true }, "already_used"],
    ["dead target", { targetAlive: false }, "target_dead"],
    ["non-heart selection", { selectedCardId: "c", action: "discard" }, "invalid_card"],
    ["missing action", { selectedCardId: "h", action: null }, "invalid_choice"],
  ] as const)("Gongxin rejects %s", (_label, patch, code) => {
    const result = planGongxin({
      context: phase("play", "meng"), usedThisPlayPhase: false,
      targetId: "target", targetAlive: true,
      targetHand: [{ id: "h", effectiveSuit: "heart" }, { id: "c", effectiveSuit: "club" }],
      selectedCardId: "h", action: "discard", ...patch,
    } as Parameters<typeof planGongxin>[0]);
    expect(result).toMatchObject({ ok: false, code });
  });
});

describe("Shen Zhou Yu rules", () => {
  function qinyin(mode: "decline" | "all_recover_one" | "all_lose_one_hp") {
    return {
      context: phase("discard", "zhou"),
      alreadyInvokedThisDiscardPhase: false,
      qualifyingDiscardedHandCardIds: ["a", "b"],
      mode,
      resolutionOrder: [
        { id: "zhou", alive: true, hp: 1, maxHp: 4 },
        { id: "full", alive: true, hp: 3, maxHp: 3 },
        { id: "dead", alive: false, hp: 0, maxHp: 4 },
      ],
    };
  }

  it("Qinyin recovers in owner-first seat order and caps full HP", () => {
    expect(must(planQinyin(qinyin("all_recover_one")))).toMatchObject({
      invoked: true,
      steps: [
        { targetId: "zhou", operation: "recover", actual: 1, hpAfter: 2 },
        { targetId: "full", operation: "recover", actual: 0, hpAfter: 3 },
      ],
      recheckHandLimitAfterSkill: true,
    });
  });

  it("Qinyin loses source-less HP and inserts dying settlement", () => {
    expect(must(planQinyin(qinyin("all_lose_one_hp")))).toMatchObject({
      invoked: true,
      sourceLessHpLoss: true,
      steps: [
        { targetId: "zhou", hpAfter: 0, insertDyingSettlement: true },
        { targetId: "full", hpAfter: 2, insertDyingSettlement: false },
      ],
    });
  });

  it("allows Qinyin to decline without effects", () => {
    expect(must(planQinyin(qinyin("decline")))).toMatchObject({ invoked: false, steps: [] });
  });

  it.each([
    ["only one qualifying discard", { qualifyingDiscardedHandCardIds: ["a"] }, "condition_not_met"],
    ["already invoked", { alreadyInvokedThisDiscardPhase: true }, "already_used"],
    ["wrong phase", { context: phase("end", "zhou") }, "wrong_timing"],
    ["wrong first seat", { resolutionOrder: [{ id: "other", alive: true, hp: 2, maxHp: 3 }] }, "invalid_input"],
  ] as const)("Qinyin rejects %s", (_label, patch, code) => {
    expect(planQinyin({ ...qinyin("all_recover_one"), ...patch } as Parameters<typeof planQinyin>[0])).toMatchObject({ ok: false, code });
  });

  function yeyan(overrides: Partial<Parameters<typeof planYeyan>[0]> = {}): Parameters<typeof planYeyan>[0] {
    return {
      context: phase("play", "zhou"), limitedAlreadyConsumed: false,
      ownerHp: 4, ownerMaxHp: 4,
      allocations: [{ targetId: "a", targetAlive: true, damage: 1 }],
      seatOrderFromOwner: ["zhou", "a", "b", "c"],
      greaterCostCards: [], ...overrides,
    };
  }

  function fourSuitCost(): Parameters<typeof planYeyan>[0]["greaterCostCards"] {
    return (["spade", "heart", "club", "diamond"] as const).map((effectiveSuit, index) => ({
      card: card({ id: `cost-${index}`, ownerId: "zhou", printedSuit: effectiveSuit }), effectiveSuit,
    }));
  }

  it("plans lesser Yeyan with one to three total fire damage and no cost", () => {
    const input = yeyan({
      allocations: [
        { targetId: "c", targetAlive: true, damage: 1 },
        { targetId: "a", targetAlive: true, damage: 1 },
        { targetId: "b", targetAlive: true, damage: 1 },
      ],
    });
    expect(must(pure(input, (frozen) => planYeyan(frozen)))).toMatchObject({
      greaterYeyan: false, totalAssignedDamage: 3, hpLossCost: 0,
      damageSteps: [{ targetId: "a" }, { targetId: "b" }, { targetId: "c" }],
    });
  });

  it("allows self as a Yeyan target", () => {
    expect(must(planYeyan(yeyan({ allocations: [{ targetId: "zhou", targetAlive: true, damage: 1 }] })))).toMatchObject({
      damageSteps: [{ targetId: "zhou", amount: 1 }],
    });
  });

  it("pays greater Yeyan first, enters dying at exactly three HP, then keeps committed damage", () => {
    expect(must(planYeyan(yeyan({
      ownerHp: 3,
      allocations: [{ targetId: "a", targetAlive: true, damage: 2 }, { targetId: "b", targetAlive: true, damage: 1 }],
      greaterCostCards: fourSuitCost(),
    })))).toMatchObject({
      greaterYeyan: true, hpLossCost: 3, ownerHpAfterCost: 0,
      resolveOwnerDyingBeforeDamage: true, committedDamageContinuesIfSourceDies: true,
      discardCostCardIds: ["cost-0", "cost-1", "cost-2", "cost-3"],
    });
  });

  it.each([
    ["over three damage", { allocations: [{ targetId: "a", targetAlive: true, damage: 4 }] }, "invalid_choice"],
    ["duplicate target", { allocations: [{ targetId: "a", targetAlive: true, damage: 1 }, { targetId: "a", targetAlive: true, damage: 1 }] }, "invalid_input"],
    ["dead target", { allocations: [{ targetId: "a", targetAlive: false, damage: 1 }] }, "target_dead"],
    ["consumed limit", { limitedAlreadyConsumed: true }, "limited_consumed"],
    ["HP below greater cost", { ownerHp: 2, allocations: [{ targetId: "a", targetAlive: true, damage: 2 }], greaterCostCards: fourSuitCost() }, "condition_not_met"],
    ["missing suit", { allocations: [{ targetId: "a", targetAlive: true, damage: 2 }], greaterCostCards: fourSuitCost().map((x) => ({ ...x, effectiveSuit: "heart" as const })) }, "insufficient_cards"],
    ["cost on lesser", { greaterCostCards: fourSuitCost() }, "invalid_choice"],
  ] as const)("Yeyan rejects %s", (_label, patch, code) => {
    expect(planYeyan(yeyan(patch as Partial<Parameters<typeof planYeyan>[0]>))).toMatchObject({ ok: false, code });
  });
});

describe("Shen Zhu Ge Liang rules", () => {
  const hands = ["h1", "h2", "h3", "h4"];
  const stars = ["s1", "s2", "s3", "s4", "s5", "s6", "s7"];

  it("models the eleven-card Qixing initial choice as four hand plus seven private Stars", () => {
    const input = {
      context: skill("zhuge"), initialHandCardIds: hands, topSevenCardIds: stars,
      handCardIdsToStars: ["h1", "h4"], starCardIdsToHand: ["s2", "s7"],
    };
    expect(must(pure(input, (frozen) => planQixingInitial(frozen)))).toEqual({
      skillId: "qixing", ownerId: "zhuge",
      finalHandCardIds: ["h2", "h3", "s2", "s7"],
      finalStarCardIds: ["s1", "s3", "s4", "s5", "s6", "h1", "h4"],
      starCount: 7, privateToOwner: true, elevenCardInitialChoice: true,
    });
  });

  it("allows a zero-card Qixing exchange after a real draw phase", () => {
    expect(must(planQixingExchange({
      context: phase("draw", "zhuge"), drawPhaseOccurred: true,
      handCardIds: hands, starCardIds: ["s1", "s2"], handCardIdsToStars: [], starCardIdsToHand: [],
    }))).toMatchObject({ exchangedCount: 0, finalHandCardIds: hands, finalStarCardIds: ["s1", "s2"] });
  });

  it("exchanges equal subsets after drawing", () => {
    expect(must(planQixingExchange({
      context: phase("draw", "zhuge"), drawPhaseOccurred: true,
      handCardIds: hands, starCardIds: ["s1", "s2"], handCardIdsToStars: ["h2"], starCardIdsToHand: ["s1"],
    }))).toMatchObject({ finalHandCardIds: ["h1", "h3", "h4", "s1"], finalStarCardIds: ["s2", "h2"], exchangedCount: 1 });
  });

  it.each([
    ["skipped draw", { drawPhaseOccurred: false }, "wrong_timing"],
    ["unequal exchange", { handCardIdsToStars: ["h1"], starCardIdsToHand: [] }, "invalid_choice"],
    ["missing hand card", { handCardIdsToStars: ["x"], starCardIdsToHand: ["s1"] }, "invalid_choice"],
    ["overlap", { handCardIds: ["same"], starCardIds: ["same"] }, "invalid_input"],
  ] as const)("Qixing exchange rejects %s", (_label, patch, code) => {
    expect(planQixingExchange({
      context: phase("draw", "zhuge"), drawPhaseOccurred: true,
      handCardIds: hands, starCardIds: ["s1", "s2"], handCardIdsToStars: [], starCardIdsToHand: [], ...patch,
    } as Parameters<typeof planQixingExchange>[0])).toMatchObject({ ok: false, code });
  });

  it("spends one Star for Kuangfeng and may mark self", () => {
    expect(must(planKuangfeng({
      context: phase("end", "zhuge"), starCardIds: ["s1"], selectedStarCardId: "s1",
      targetId: "zhuge", targetAlive: true,
    }))).toMatchObject({ discardStarCardIds: ["s1"], targetMayBeOwner: true, clearsIfOwnerDies: true });
  });

  it("spends equal Stars for distinct Dawu targets including self", () => {
    expect(must(planDawu({
      context: phase("end", "zhuge"), starCardIds: ["s1", "s2", "s3"],
      selectedStarCardIds: ["s1", "s3"], targets: [{ id: "zhuge", alive: true }, { id: "ally", alive: true }],
    }))).toMatchObject({
      discardStarCardIds: ["s1", "s3"], targetIds: ["zhuge", "ally"], doesNotPreventHpLoss: true,
    });
  });

  it.each([
    ["missing Kuangfeng Star", () => planKuangfeng({ context: phase("end", "zhuge"), starCardIds: [], selectedStarCardId: "x", targetId: "a", targetAlive: true }), "insufficient_cards"],
    ["dead Kuangfeng target", () => planKuangfeng({ context: phase("end", "zhuge"), starCardIds: ["s"], selectedStarCardId: "s", targetId: "a", targetAlive: false }), "target_dead"],
    ["zero Dawu targets", () => planDawu({ context: phase("end", "zhuge"), starCardIds: ["s"], selectedStarCardIds: [], targets: [] }), "invalid_choice"],
    ["unequal Dawu targets", () => planDawu({ context: phase("end", "zhuge"), starCardIds: ["s"], selectedStarCardIds: ["s"], targets: [{ id: "a", alive: true }, { id: "b", alive: true }] }), "invalid_choice"],
  ] as const)("weather activation rejects %s", (_label, call, code) => {
    expect(call()).toMatchObject({ ok: false, code });
  });

  it.each([
    ["normal through Dawu", "normal", true, true, 0, 0],
    ["fire through Dawu", "fire", true, true, 0, 0],
    ["thunder through Dawu", "thunder", true, false, 2, 0],
    ["fire through Kuangfeng", "fire", false, false, 3, 1],
    ["normal through Kuangfeng", "normal", false, false, 2, 0],
    ["fire with both", "fire", true, true, 0, 0],
  ] as const)("settles %s", (_label, nature, dawuApplied, prevented, finalDamage, kuangfengBonus) => {
    expect(must(planQixingWeatherDamage({
      targetId: "target", targetAlive: true, baseDamage: 2, nature,
      kuangfengApplied: true, dawuApplied,
    }))).toMatchObject({ prevented, finalDamage, kuangfengBonus, dawuChecksBeforeKuangfeng: true });
  });

  it.each(["owner_next_turn_start", "owner_death"] as const)("clears source-owned weather on %s", (reason) => {
    expect(must(planQixingWeatherCleanup({
      ownerId: "zhuge", reason, kuangfengTargetIds: ["a"], dawuTargetIds: ["a", "b"],
    }))).toMatchObject({ reason, clearOnlyEffectsOwnedByThisSource: true });
  });
});

describe("Shen Cao Cao rules", () => {
  it.each([
    [1, 1],
    [3, 3],
  ])("opens one complete Guixin window per each of %i damage points", (damageAmount, independentOptionalWindows) => {
    expect(must(planGuixinDamageWindows({ context: skill("cao"), damageAmount }))).toEqual({
      skillId: "guixin", ownerId: "cao", independentOptionalWindows,
      completeEachWindowBeforeOpeningNext: true, resnapshotZonesForEveryWindow: true,
    });
  });

  function guixin(overrides: Partial<Parameters<typeof planGuixinPoint>[0]> = {}): Parameters<typeof planGuixinPoint>[0] {
    return {
      context: skill("cao"), decision: "invoke", ownerFaceUp: true,
      otherPlayers: [
        { id: "a", alive: true, handCardIds: ["a-h1", "a-h2"], equipmentCardIds: [], judgmentCardIds: [], selected: { zone: "hand", cardId: "a-h2" } },
        { id: "b", alive: true, handCardIds: [], equipmentCardIds: ["b-e"], judgmentCardIds: [], selected: { zone: "equipment", cardId: "b-e" } },
        { id: "c", alive: true, handCardIds: [], equipmentCardIds: [], judgmentCardIds: ["c-j"], selected: { zone: "judgment", cardId: "c-j" } },
        { id: "empty", alive: true, handCardIds: [], equipmentCardIds: [], judgmentCardIds: [], selected: null },
        { id: "dead", alive: false, handCardIds: ["dead-h"], equipmentCardIds: [], judgmentCardIds: [], selected: null },
      ],
      ...overrides,
    };
  }

  it("takes exactly one ordinary-zone card from every eligible role then turns over", () => {
    const input = guixin();
    expect(must(pure(input, (frozen) => planGuixinPoint(frozen)))).toMatchObject({
      invoked: true,
      gainSteps: [
        { fromPlayerId: "a", zone: "hand", cardId: "a-h2", handCardSelectionIsAnonymousServerRandom: true },
        { fromPlayerId: "b", zone: "equipment", cardId: "b-e", handCardSelectionIsAnonymousServerRandom: false },
        { fromPlayerId: "c", zone: "judgment", cardId: "c-j", handCardSelectionIsAnonymousServerRandom: false },
      ],
      faceUpBefore: true, faceUpAfter: false,
      sequence: ["gain_one_from_every_eligible_other_in_seat_order", "turn_over"],
    });
  });

  it("toggles a face-down owner face-up on a later Guixin point", () => {
    expect(must(planGuixinPoint(guixin({ ownerFaceUp: false })))).toMatchObject({ faceUpBefore: false, faceUpAfter: true });
  });

  it("allows an all-or-nothing Guixin decline without turning over", () => {
    const otherPlayers = guixin().otherPlayers.map((player) => ({ ...player, selected: null }));
    expect(must(planGuixinPoint(guixin({ decision: "decline", otherPlayers })))).toMatchObject({
      invoked: false, gainSteps: [], faceUpAfter: true,
    });
  });

  it.each([
    ["invoke with no cards", { otherPlayers: [{ id: "a", alive: true, handCardIds: [], equipmentCardIds: [], judgmentCardIds: [], selected: null }] }, "condition_not_met"],
    ["skip eligible role", { otherPlayers: [{ id: "a", alive: true, handCardIds: ["h"], equipmentCardIds: [], judgmentCardIds: [], selected: null }] }, "invalid_choice"],
    ["select dead role", { otherPlayers: [{ id: "a", alive: false, handCardIds: ["h"], equipmentCardIds: [], judgmentCardIds: [], selected: { zone: "hand", cardId: "h" } }] }, "invalid_choice"],
    ["wrong zone card", { otherPlayers: [{ id: "a", alive: true, handCardIds: ["h"], equipmentCardIds: [], judgmentCardIds: [], selected: { zone: "equipment", cardId: "h" } }] }, "invalid_card"],
    ["duplicate global card", { otherPlayers: [
      { id: "a", alive: true, handCardIds: ["same"], equipmentCardIds: [], judgmentCardIds: [], selected: { zone: "hand", cardId: "same" } },
      { id: "b", alive: true, handCardIds: ["same"], equipmentCardIds: [], judgmentCardIds: [], selected: { zone: "hand", cardId: "same" } },
    ] }, "invalid_input"],
  ] as const)("Guixin rejects %s", (_label, patch, code) => {
    expect(planGuixinPoint(guixin(patch as Partial<Parameters<typeof planGuixinPoint>[0]>))).toMatchObject({ ok: false, code });
  });

  it.each([
    [true, true, 2, 3, 1],
    [false, true, 2, 2, 0],
    [true, false, 4, 4, 0],
  ])("Feiying effective=%s alive=%s changes distance %i to %i", (targetHasEffectiveFeiying, targetAlive, baseDistance, distance, modifier) => {
    expect(must(planFeiyingDistance({
      sourceId: "a", targetId: "cao", targetAlive, targetHasEffectiveFeiying, baseDistance,
    }))).toMatchObject({ distance, modifier, outgoingDistanceUnaffected: true });
  });
});

describe("Shen Lu Bu rules", () => {
  it("starts with exactly two additional Rage marks", () => {
    expect(must(planKuangbaoInitial({ context: skill("lvbu"), gameStarting: true, existingRageMarks: 0 }))).toEqual({
      skillId: "kuangbao", ownerId: "lvbu", rageMarkDelta: 2, rageMarksAfter: 2,
    });
  });

  it.each([
    ["late initialization", { gameStarting: false }, "wrong_timing"],
    ["negative marks", { existingRageMarks: -1 }, "invalid_input"],
  ] as const)("Kuangbao initialization rejects %s", (_label, patch, code) => {
    expect(planKuangbaoInitial({ context: skill("lvbu"), gameStarting: true, existingRageMarks: 0, ...patch })).toMatchObject({ ok: false, code });
  });

  it.each([
    ["dealt", "lvbu", "enemy", 2, 2, 0, 2],
    ["received", "enemy", "lvbu", 3, 0, 3, 3],
    ["self damage", "lvbu", "lvbu", 2, 2, 2, 4],
    ["unrelated", "a", "b", 1, 0, 0, 0],
  ] as const)("Kuangbao tracks %s damage", (_label, sourceId, targetId, damageAmount, sourceSideMarkDelta, targetSideMarkDelta, totalRageMarkDelta) => {
    expect(must(planKuangbaoDamage({ context: skill("lvbu"), sourceId, targetId, damageAmount }))).toMatchObject({
      sourceSideMarkDelta, targetSideMarkDelta, totalRageMarkDelta,
      selfDamageGainsTwoPerPoint: sourceId === "lvbu" && targetId === "lvbu",
    });
  });

  it.each([
    ["spend Rage", "remove_rage", 2, -1, 0],
    ["lose HP by choice", "lose_hp", 2, 0, 1],
    ["forced lose HP at zero Rage", "lose_hp", 0, 0, 1],
  ] as const)("Wumou can %s", (_label, choice, rageMarks, rageMarkDelta, loseHp) => {
    expect(must(planWumou({
      context: skill("lvbu"), effectiveCardKind: "wu_xie_ke_ji", effectiveCardCategory: "trick", rageMarks, choice,
    }))).toMatchObject({ rageMarkDelta, loseHp, trickContinuesIfOwnerDies: true });
  });

  it.each([
    ["delayed trick", { effectiveCardKind: "shan_dian", effectiveCardCategory: "trick" }, "condition_not_met"],
    ["basic card", { effectiveCardKind: "slash", effectiveCardCategory: "basic" }, "condition_not_met"],
    ["missing Rage payment", { rageMarks: 0, choice: "remove_rage" }, "insufficient_marks"],
  ] as const)("Wumou rejects %s", (_label, patch, code) => {
    expect(planWumou({
      context: skill("lvbu"), effectiveCardKind: "duel", effectiveCardCategory: "trick", rageMarks: 1, choice: "remove_rage", ...patch,
    } as Parameters<typeof planWumou>[0])).toMatchObject({ ok: false, code });
  });

  it("Wuqian may target self without armor and grants Wushuang", () => {
    expect(must(planWuqian({
      context: phase("play", "lvbu"), rageMarks: 2, targetId: "lvbu", targetAlive: true,
      previouslyArmorInvalidTargetIds: [],
    }))).toMatchObject({
      targetId: "lvbu", rageMarkDelta: -2, targetMayBeOwner: true,
      grantWushuangUntilTurnEnd: true, includesVirtualArmorSkills: true,
    });
  });

  it("accumulates Wuqian targets without duplicating prior targets", () => {
    expect(must(planWuqian({
      context: phase("play", "lvbu"), rageMarks: 8, targetId: "b", targetAlive: true,
      previouslyArmorInvalidTargetIds: ["a", "b"],
    }))).toMatchObject({ armorInvalidTargetIdsUntilTurnEnd: ["a", "b"], unlimitedUsesPerPlayPhase: true });
  });

  it.each([
    ["insufficient marks", { rageMarks: 1 }, "insufficient_marks"],
    ["dead target", { targetAlive: false }, "target_dead"],
    ["wrong phase", { context: phase("end", "lvbu") }, "wrong_timing"],
  ] as const)("Wuqian rejects %s", (_label, patch, code) => {
    expect(planWuqian({
      context: phase("play", "lvbu"), rageMarks: 2, targetId: "a", targetAlive: true,
      previouslyArmorInvalidTargetIds: [], ...patch,
    } as Parameters<typeof planWuqian>[0])).toMatchObject({ ok: false, code });
  });

  it("plans Shenfen as four global stages and filters initially dead roles", () => {
    const input = {
      context: phase("play", "lvbu"), rageMarks: 6, usedThisPlayPhase: false,
      otherPlayers: [{ id: "a", alive: true }, { id: "dead", alive: false }, { id: "b", alive: true }],
    };
    expect(must(pure(input, (frozen) => planShenfen(frozen)))).toMatchObject({
      rageMarkDelta: -6, targetIds: ["a", "b"],
      stages: [
        "damage_each_other_in_seat_order",
        "each_survivor_discards_all_equipment",
        "each_survivor_discards_four_or_all_hand_cards",
        "owner_turns_over_if_alive",
      ],
      committedSkillContinuesIfOwnerDies: true,
    });
  });

  it.each([
    ["second use", { usedThisPlayPhase: true }, "already_used"],
    ["five marks", { rageMarks: 5 }, "insufficient_marks"],
    ["owner in target list", { otherPlayers: [{ id: "lvbu", alive: true }] }, "invalid_input"],
  ] as const)("Shenfen rejects %s", (_label, patch, code) => {
    expect(planShenfen({
      context: phase("play", "lvbu"), rageMarks: 6, usedThisPlayPhase: false,
      otherPlayers: [{ id: "a", alive: true }], ...patch,
    } as Parameters<typeof planShenfen>[0])).toMatchObject({ ok: false, code });
  });

  it("discards all equipment and all of a three-card hand", () => {
    expect(must(planShenfenVictimDiscard({
      targetId: "a", targetAliveAtDiscardStages: true,
      equipmentCardIds: ["armor", "horse"], handCardIds: ["h1", "h2", "h3"], selectedHandCardIds: ["h1", "h2", "h3"],
    }))).toMatchObject({
      discardEquipmentCardIds: ["armor", "horse"], discardHandCardIds: ["h1", "h2", "h3"],
      equipmentBatchPrecedesHandBatch: true,
    });
  });

  it("requires exactly four selected cards from a larger hand", () => {
    expect(must(planShenfenVictimDiscard({
      targetId: "a", targetAliveAtDiscardStages: true, equipmentCardIds: [],
      handCardIds: ["1", "2", "3", "4", "5"], selectedHandCardIds: ["2", "3", "4", "5"],
    }))).toMatchObject({ requestedHandDiscardCount: 4, discardHandCardIds: ["2", "3", "4", "5"] });
  });

  it("skips a role that died during Shenfen damage", () => {
    expect(must(planShenfenVictimDiscard({
      targetId: "dead", targetAliveAtDiscardStages: false,
      equipmentCardIds: ["old"], handCardIds: ["h"], selectedHandCardIds: [],
    }))).toMatchObject({ skippedBecauseDead: true, discardEquipmentCardIds: [], discardHandCardIds: [] });
  });

  it.each([
    ["only three of five", ["1", "2", "3"]],
    ["unknown card", ["1", "2", "3", "x"]],
  ])("rejects Shenfen victim choice %s", (_label, selectedHandCardIds) => {
    expect(planShenfenVictimDiscard({
      targetId: "a", targetAliveAtDiscardStages: true, equipmentCardIds: [],
      handCardIds: ["1", "2", "3", "4", "5"], selectedHandCardIds,
    })).toMatchObject({ ok: false, code: "invalid_choice" });
  });
});

describe("Shen Zhao Yun rules", () => {
  it.each([
    [2, 2, 0, 2],
    [1, 2, 1, 3],
    [1, 3, 2, 4],
  ])("Juejing at %i/%i adds %i to a base draw of two", (ownerHp, ownerMaxHp, additionalDrawCount, finalDrawCount) => {
    expect(must(planJuejingDraw({ context: skill("zhao"), ownerHp, ownerMaxHp, baseDrawCount: 2 }))).toMatchObject({
      additionalDrawCount, finalDrawCount, composesWithOtherDrawModifiers: true,
    });
  });

  it("Juejing composes with a replacement base draw count", () => {
    expect(must(planJuejingDraw({ context: skill("zhao"), ownerHp: 1, ownerMaxHp: 2, baseDrawCount: 4 }))).toMatchObject({ finalDrawCount: 5 });
  });

  it.each([
    [0, 2],
    [5, 7],
  ])("Juejing adds two to hand limit %i", (baseHandLimit, finalHandLimit) => {
    expect(must(planJuejingHandLimit({
      ownerId: "zhao", ownerAlive: true, skillEffective: true, baseHandLimit,
    }))).toMatchObject({ modifier: 2, finalHandLimit });
  });

  const longhunCases: readonly [CardSuit, LonghunEffectiveKind, "use" | "respond"][] = [
    ["heart", "peach", "use"],
    ["diamond", "fire_slash", "use"],
    ["club", "dodge", "respond"],
    ["spade", "wu_xie_ke_ji", "respond"],
  ];

  it.each(longhunCases)("Longhun maps %s to %s", (effectiveSuit, requestedKind, method) => {
    expect(must(evaluateLonghun({
      context: skill("zhao"), ownerHp: 1, ownerHandCount: 1,
      components: [{ card: card({ ownerId: "zhao", printedSuit: effectiveSuit }), effectiveSuit }],
      requestedKind, method, requestedCardTimingLegal: true,
    }))).toMatchObject({
      requiredCardCount: 1, effectiveSuit, effectiveKind: requestedKind, method,
      effectiveRank: 7, countsAsLastHandCardForFangTian: true,
    });
  });

  it("uses two same-suit hand cards at two HP and counts as the final hand card", () => {
    expect(must(evaluateLonghun({
      context: skill("zhao"), ownerHp: 2, ownerHandCount: 2,
      components: [
        { card: card({ id: "d1", ownerId: "zhao" }), effectiveSuit: "diamond" },
        { card: card({ id: "d2", ownerId: "zhao" }), effectiveSuit: "diamond" },
      ],
      requestedKind: "fire_slash", method: "use", requestedCardTimingLegal: true,
    }))).toMatchObject({ requiredCardCount: 2, effectiveRank: null, countsAsLastHandCardForFangTian: true });
  });

  it("may mix hand and equipment but then is not the final hand card for Fang Tian", () => {
    expect(must(evaluateLonghun({
      context: skill("zhao"), ownerHp: 2, ownerHandCount: 1,
      components: [
        { card: card({ id: "h", ownerId: "zhao" }), effectiveSuit: "diamond" },
        { card: equipment({ id: "e", ownerId: "zhao", printedSuit: "diamond" }), effectiveSuit: "diamond" },
      ],
      requestedKind: "fire_slash", method: "use", requestedCardTimingLegal: true,
    }))).toMatchObject({ countsAsLastHandCardForFangTian: false, consumesHandAndOrEquipmentAtomically: true });
  });

  it("uses one card while at zero or negative HP for self-rescue", () => {
    expect(must(evaluateLonghun({
      context: skill("zhao"), ownerHp: 0, ownerHandCount: 1,
      components: [{ card: card({ ownerId: "zhao", printedSuit: "heart" }), effectiveSuit: "heart" }],
      requestedKind: "peach", method: "use", requestedCardTimingLegal: true,
    }))).toMatchObject({ requiredCardCount: 1, effectiveKind: "peach" });
  });

  it.each([
    ["too few at two HP", { ownerHp: 2 }, "insufficient_cards"],
    ["mixed effective suits", { ownerHp: 2, ownerHandCount: 2, components: [
      { card: card({ id: "a", ownerId: "zhao" }), effectiveSuit: "heart" },
      { card: card({ id: "b", ownerId: "zhao" }), effectiveSuit: "diamond" },
    ] }, "invalid_card"],
    ["wrong mapped kind", { requestedKind: "dodge" }, "invalid_choice"],
    ["duplicate physical card", { ownerHp: 2, ownerHandCount: 2, components: [
      { card: card({ id: "same", ownerId: "zhao" }), effectiveSuit: "heart" },
      { card: card({ id: "same", ownerId: "zhao" }), effectiveSuit: "heart" },
    ] }, "invalid_card"],
    ["opponent card", { components: [{ card: card({ ownerId: "other" }), effectiveSuit: "heart" }] }, "invalid_card"],
    ["illegal card timing", { requestedCardTimingLegal: false }, "wrong_timing"],
  ] as const)("Longhun rejects %s", (_label, patch, code) => {
    expect(evaluateLonghun({
      context: skill("zhao"), ownerHp: 1, ownerHandCount: 1,
      components: [{ card: card({ ownerId: "zhao" }), effectiveSuit: "heart" }],
      requestedKind: "peach", method: "use", requestedCardTimingLegal: true, ...patch,
    } as Parameters<typeof evaluateLonghun>[0])).toMatchObject({ ok: false, code });
  });
});

describe("Shen Si Ma Yi rules", () => {
  it.each([
    [1, 1],
    [3, 3],
  ])("Renjie gains %i marks after damage", (damageAmount, renMarkDelta) => {
    expect(must(planRenjieDamage({ context: skill("sima"), damageAmount }))).toMatchObject({ renMarkDelta, beforeOptionalJilueFangzhu: true });
  });

  it("Renjie counts only hand cards discarded by the owner during discard phase", () => {
    expect(must(planRenjieDiscard({
      context: skill("sima"), phase: "discard", discardedByOwner: true,
      discardedHandCardIds: ["h1", "h2"], discardedNonHandCardIds: ["armor"],
    }))).toMatchObject({ renMarkDelta: 2, countedHandCardIds: ["h1", "h2"], ignoredNonHandCardIds: ["armor"] });
  });

  it.each([
    ["outside discard", "play", true],
    ["discarded by another effect controller", "discard", false],
  ] as const)("Renjie ignores cards %s", (_label, phaseName, discardedByOwner) => {
    expect(must(planRenjieDiscard({
      context: skill("sima"), phase: phaseName, discardedByOwner,
      discardedHandCardIds: ["h"], discardedNonHandCardIds: [],
    }))).toMatchObject({ renMarkDelta: 0, countedHandCardIds: [] });
  });

  it("Baiyin mandatorily reduces max HP, caps HP and grants Jilue without spending Ren", () => {
    expect(must(planBaiyin({
      context: phase("prepare", "sima"), alreadyAwakened: false, renMarks: 5,
      ownerHp: 4, ownerMaxHp: 4,
    }))).toEqual({
      skillId: "baiyin", ownerId: "sima", mandatory: true,
      maxHpBefore: 4, maxHpAfter: 3, hpAfter: 3,
      consumeAwakening: true, grantSkillIds: ["jilue"], renMarksRetained: true,
    });
  });

  it.each([
    ["three marks", { renMarks: 3 }, "condition_not_met"],
    ["already awakened", { alreadyAwakened: true }, "already_awakened"],
    ["wrong phase", { context: phase("play", "sima") }, "wrong_timing"],
    ["max HP one", { ownerHp: 1, ownerMaxHp: 1 }, "invalid_input"],
  ] as const)("Baiyin rejects %s", (_label, patch, code) => {
    expect(planBaiyin({
      context: phase("prepare", "sima"), alreadyAwakened: false, renMarks: 4,
      ownerHp: 2, ownerMaxHp: 4, ...patch,
    } as Parameters<typeof planBaiyin>[0])).toMatchObject({ ok: false, code });
  });

  it("Jilue spends one Ren to replace a judgment using a hand card", () => {
    expect(must(planJilueGuicai({
      context: jilue(), judgmentPending: true, originalJudgmentCardId: "judge",
      replacementCard: card({ id: "replacement", ownerId: "sima" }),
    }))).toMatchObject({ borrowedSkillId: "guicai", renMarkDelta: -1, replacementCardId: "replacement" });
  });

  it.each([
    ["equipment replacement", equipment({ id: "e", ownerId: "sima" }), "invalid_card"],
    ["opponent hand", card({ id: "h", ownerId: "other" }), "invalid_card"],
  ] as const)("Jilue Guicai rejects %s", (_label, replacementCard, code) => {
    expect(planJilueGuicai({
      context: jilue(), judgmentPending: true, originalJudgmentCardId: "judge", replacementCard,
    })).toMatchObject({ ok: false, code });
  });

  it("Jilue Fangzhu triggers once per damage event and turns over before drawing", () => {
    expect(must(planJilueFangzhu({
      context: jilue(), damageAmount: 3, ownerHp: 1, ownerMaxHp: 4,
      targetId: "ally", targetAlive: true, targetFaceUp: true,
    }))).toMatchObject({
      borrowedSkillId: "fangzhu", renMarkDelta: -1, triggerCountForDamageEvent: 1,
      faceUpAfter: false, drawCount: 3, sequence: ["turn_over", "draw"],
    });
  });

  it.each([
    ["self target", { targetId: "sima" }, "invalid_target"],
    ["dead target", { targetAlive: false }, "target_dead"],
  ] as const)("Jilue Fangzhu rejects %s", (_label, patch, code) => {
    expect(planJilueFangzhu({
      context: jilue(), damageAmount: 1, ownerHp: 3, ownerMaxHp: 4,
      targetId: "ally", targetAlive: true, targetFaceUp: true, ...patch,
    })).toMatchObject({ ok: false, code });
  });

  it.each(["duel", "wu_xie_ke_ji", "iron_chain"] as const)("Jilue Jizhi draws for ordinary trick %s", (effectiveCardKind) => {
    expect(must(planJilueJizhi({ context: jilue(), effectiveCardKind, effectiveCardCategory: "trick" }))).toMatchObject({
      borrowedSkillId: "jizhi", renMarkDelta: -1, drawCount: 1,
    });
  });

  it.each([
    ["delayed trick", "shan_dian", "trick"],
    ["basic card", "slash", "basic"],
  ] as const)("Jilue Jizhi ignores %s", (_label, effectiveCardKind, effectiveCardCategory) => {
    expect(planJilueJizhi({ context: jilue(), effectiveCardKind, effectiveCardCategory })).toMatchObject({ ok: false, code: "condition_not_met" });
  });

  it("Jilue Zhiheng spends one Ren, discards one batch, then draws equally", () => {
    const input = {
      context: { ...jilue(), currentPlayerId: "sima", phase: "play" as const },
      usedZhihengThisPlayPhase: false,
      discardCards: [card({ id: "h", ownerId: "sima" }), equipment({ id: "e", ownerId: "sima" })],
    };
    expect(must(pure(input, (frozen) => planJilueZhiheng(frozen)))).toMatchObject({
      borrowedSkillId: "zhiheng", renMarkDelta: -1, discardCardIds: ["h", "e"], drawCount: 2,
      sequence: ["discard_batch", "resolve_card_loss_triggers", "draw_equal"],
    });
  });

  it.each([
    ["second phase use", { usedZhihengThisPlayPhase: true }, "already_used"],
    ["zero cards", { discardCards: [] }, "insufficient_cards"],
    ["wrong phase", { context: { ...jilue(), currentPlayerId: "sima", phase: "end" } }, "wrong_timing"],
  ] as const)("Jilue Zhiheng rejects %s", (_label, patch, code) => {
    expect(planJilueZhiheng({
      context: { ...jilue(), currentPlayerId: "sima", phase: "play" },
      usedZhihengThisPlayPhase: false, discardCards: [card({ ownerId: "sima" })], ...patch,
    } as Parameters<typeof planJilueZhiheng>[0])).toMatchObject({ ok: false, code });
  });

  it("Jilue Wansha activates once at play-phase start until turn end", () => {
    expect(must(planJilueWansha({
      context: { ...jilue(), currentPlayerId: "sima", phase: "play" },
      atPlayPhaseStart: true, alreadyActiveThisTurn: false,
    }))).toMatchObject({ borrowedSkillId: "wansha", renMarkDelta: -1, activeUntilTurnEnd: true });
  });

  it.each([
    ["late activation", { atPlayPhaseStart: false }, "wrong_timing"],
    ["already active", { alreadyActiveThisTurn: true }, "already_used"],
  ] as const)("Jilue Wansha rejects %s", (_label, patch, code) => {
    expect(planJilueWansha({
      context: { ...jilue(), currentPlayerId: "sima", phase: "play" },
      atPlayPhaseStart: true, alreadyActiveThisTurn: false, ...patch,
    })).toMatchObject({ ok: false, code });
  });

  it.each([
    ["owner", "sima", true],
    ["dying role", "dying", true],
    ["third party", "helper", false],
  ])("borrowed Wansha Peach use by %s allowed=%s", (_label, peachUserId, peachAllowed) => {
    expect(must(evaluateJilueWanshaPeach({
      ownerId: "sima", ownerAlive: true, effectActive: true, currentPlayerId: "sima",
      peachUserId, dyingPlayerId: "dying",
    }))).toMatchObject({ peachAllowed, restricted: true });
  });

  it.each([
    ["dead owner", false, true, "sima"],
    ["inactive effect", true, false, "sima"],
    ["different current turn", true, true, "other"],
  ] as const)("does not impose borrowed Wansha for %s", (_label, ownerAlive, effectActive, currentPlayerId) => {
    expect(must(evaluateJilueWanshaPeach({
      ownerId: "sima", ownerAlive, effectActive, currentPlayerId,
      peachUserId: "helper", dyingPlayerId: "dying",
    }))).toMatchObject({ peachAllowed: true, restricted: false });
  });

  it.each([
    ["not awakened", { awakened: false }, "not_awakened"],
    ["zero Ren", { renMarks: 0 }, "insufficient_marks"],
    ["dead owner", { ownerAlive: false }, "owner_dead"],
    ["disabled Jilue", { skillEffective: false }, "skill_not_effective"],
  ] as const)("all Jilue components fail closed for %s", (_label, patch, code) => {
    expect(planJilueJizhi({
      context: { ...jilue(), ...patch }, effectiveCardKind: "duel", effectiveCardCategory: "trick",
    })).toMatchObject({ ok: false, code });
  });

  it("arms Lianpo when Shen Sima kills another role inside any role's turn", () => {
    expect(must(recordLianpoKill({
      context: skill("sima"), killerId: "sima", victimId: "victim",
      insideAPlayersTurn: true, activeTurnId: "turn-7",
    }))).toEqual({
      skillId: "lianpo", ownerId: "sima", qualifies: true,
      armedTurnId: "turn-7", multipleKillsStillArmOneExtraTurn: true,
    });
  });

  it.each([
    ["other killer", "other", "victim", true, "turn", false],
    ["self death", "sima", "sima", true, "turn", false],
    ["outside a turn", "sima", "victim", false, null, false],
  ] as const)("does not arm Lianpo for %s", (_label, killerId, victimId, insideAPlayersTurn, activeTurnId, qualifies) => {
    expect(must(recordLianpoKill({
      context: skill("sima"), killerId, victimId, insideAPlayersTurn, activeTurnId,
    }))).toMatchObject({ qualifies, armedTurnId: null });
  });

  it.each([
    ["take_extra_turn", "sima"],
    ["decline", null],
  ] as const)("resolves optional Lianpo decision %s", (decision, queueExtraTurnForPlayerId) => {
    expect(must(planLianpoExtraTurn({
      context: skill("sima"), endedTurnId: "turn-7", armedTurnId: "turn-7", decision,
    }))).toMatchObject({
      queueExtraTurnForPlayerId, clearArmedTurnId: true,
      insertAfterFullTurnEndWindow: true, normalTurnOrderResumesAfterExtraTurn: true,
    });
  });

  it.each([
    ["different armed turn", "turn-6"],
    ["not armed", null],
  ] as const)("rejects Lianpo at %s", (_label, armedTurnId) => {
    expect(planLianpoExtraTurn({
      context: skill("sima"), endedTurnId: "turn-7", armedTurnId, decision: "take_extra_turn",
    })).toMatchObject({ ok: false, code: "condition_not_met" });
  });
});
