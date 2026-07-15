import { describe, expect, it } from "vitest";

import type { CardCategory, CardKind, CardSuit } from "../src/types.js";
import {
  adjudicateGuhuoChallenge,
  analyzeBuquWounds,
  evaluateGuidaoCost,
  evaluateGuhuoTruth,
  evaluateHuangtianGift,
  evaluateJushouDisposal,
  evaluateLiegong,
  evaluateShensuActivation,
  evaluateTianxiangChoice,
  isGuhuoDeclarableKind,
  planBuquWounds,
  planKuangguRecovery,
  planLeiji,
  resolveBuquRecoveryPoint,
  resolveHongyanSuit,
  type HongyanContext,
  type LeijiDodgeEvent,
  type LeijiPlanInput,
  type LeijiSelectedTarget,
  type WindCardSnapshot,
  type WindRuleResult,
} from "../src/skills/wind-runtime.js";

function must<T>(result: WindRuleResult<T>): T {
  if (!result.ok) throw new Error(result.detail);
  return result.value;
}

function makeCard(overrides: Partial<WindCardSnapshot> = {}): WindCardSnapshot {
  return {
    id: "card-1",
    kind: "dodge",
    category: "basic",
    printedSuit: "heart",
    ownerId: "owner",
    zone: "hand",
    physical: true,
    ...overrides,
  };
}

function makeLeijiInput(
  eventOverrides: Partial<LeijiDodgeEvent> = {},
  targetOverrides: Partial<LeijiSelectedTarget> = {},
  skillOwnerId = "zhangjiao",
): LeijiPlanInput {
  const effectiveCardKind = eventOverrides.effectiveCardKind ?? "dodge";
  return {
    skillOwnerId,
    dodgeEvent: {
      dodgeEventId: "dodge-event-1",
      attributedPlayerId: skillOwnerId,
      accepted: true,
      method: "respond",
      effectiveCardKind,
      provenance: { type: "physical", cardId: "dodge-1", printedKind: effectiveCardKind },
      ...eventOverrides,
    },
    selectedTarget: { playerId: "target", alive: true, ...targetOverrides },
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

describe("Wind runtime: Hongyan", () => {
  const active: HongyanContext = { ownerId: "xiaoqiao", active: true };

  it.each([
    { name: "owned spade", printedSuit: "spade", cardOwnerId: "xiaoqiao", hongyan: active, suit: "heart", color: "red", modified: true },
    { name: "another owner's spade", printedSuit: "spade", cardOwnerId: "zhouyu", hongyan: active, suit: "spade", color: "black", modified: false },
    { name: "unowned pile spade", printedSuit: "spade", cardOwnerId: null, hongyan: active, suit: "spade", color: "black", modified: false },
    { name: "inactive skill", printedSuit: "spade", cardOwnerId: "xiaoqiao", hongyan: { ownerId: "xiaoqiao", active: false }, suit: "spade", color: "black", modified: false },
    { name: "owned club", printedSuit: "club", cardOwnerId: "xiaoqiao", hongyan: active, suit: "club", color: "black", modified: false },
    { name: "owned diamond", printedSuit: "diamond", cardOwnerId: "xiaoqiao", hongyan: active, suit: "diamond", color: "red", modified: false },
  ] as const)("resolves $name without rewriting the physical suit", (testCase) => {
    const input = deepFreeze({
      printedSuit: testCase.printedSuit,
      cardOwnerId: testCase.cardOwnerId,
      hongyan: testCase.hongyan,
    });
    const before = structuredClone(input);
    const result = must(resolveHongyanSuit(input));
    expect(result).toEqual({
      printedSuit: testCase.printedSuit,
      effectiveSuit: testCase.suit,
      effectiveColor: testCase.color,
      modified: testCase.modified,
    });
    expect(input).toEqual(before);
  });

  it("fails closed for malformed ownership or suit metadata", () => {
    expect(resolveHongyanSuit({ printedSuit: "joker", cardOwnerId: "x", hongyan: null } as never).ok).toBe(false);
    expect(resolveHongyanSuit({ printedSuit: "spade", cardOwnerId: "", hongyan: active }).ok).toBe(false);
  });
});

describe("Wind runtime: Liegong", () => {
  const base = {
    skillOwnerId: "huangzhong",
    slashSourceId: "huangzhong",
    turnPlayerId: "huangzhong",
    phase: "play",
    method: "use",
    slashKind: "slash",
    targetHandCount: 3,
    ownerCurrentHp: 3,
    ownerAttackRange: 2,
  } as const;

  it.each([
    { name: "hand equals hp", patch: {}, eligible: true, high: true, low: false, reason: null },
    { name: "hand equals range", patch: { targetHandCount: 2, ownerCurrentHp: 4 }, eligible: true, high: false, low: true, reason: null },
    { name: "both branches", patch: { targetHandCount: 1, ownerCurrentHp: 1 }, eligible: true, high: true, low: true, reason: null },
    { name: "neither branch", patch: { targetHandCount: 3, ownerCurrentHp: 4, ownerAttackRange: 2 }, eligible: false, high: false, low: false, reason: "condition_not_met" },
    { name: "wrong phase", patch: { phase: "respond" }, eligible: false, high: true, low: false, reason: "not_owners_play_phase" },
    { name: "another source", patch: { slashSourceId: "ally" }, eligible: false, high: true, low: false, reason: "not_owner_slash" },
    { name: "response slash", patch: { method: "respond" }, eligible: false, high: true, low: false, reason: "not_use_method" },
    { name: "elemental slash", patch: { slashKind: "fire_slash" }, eligible: true, high: true, low: false, reason: null },
  ] as const)("checks $name", ({ patch, eligible, high, low, reason }) => {
    const value = must(evaluateLiegong({ ...base, ...patch }));
    expect(value).toEqual({
      eligible,
      reason,
      handAtLeastCurrentHp: high,
      handAtMostAttackRange: low,
    });
  });

  it("rejects impossible counts and non-Slash kinds", () => {
    expect(evaluateLiegong({ ...base, targetHandCount: -1 }).ok).toBe(false);
    expect(evaluateLiegong({ ...base, slashKind: "dodge" }).ok).toBe(false);
  });
});

describe("Wind runtime: Kuanggu", () => {
  it("uses each damage point's captured distance and post-settlement source state", () => {
    const input = deepFreeze({
      sourceId: "weiyan",
      targetId: "target",
      points: [
        { pointIndex: 1, distanceAtApplication: 1, sourceAliveAfterSettlement: true, sourceHpAfterSettlement: 2, sourceMaxHpAfterSettlement: 4 },
        { pointIndex: 2, distanceAtApplication: 2, sourceAliveAfterSettlement: true, sourceHpAfterSettlement: 3, sourceMaxHpAfterSettlement: 4 },
        { pointIndex: 3, distanceAtApplication: 1, sourceAliveAfterSettlement: true, sourceHpAfterSettlement: 4, sourceMaxHpAfterSettlement: 4 },
        { pointIndex: 4, distanceAtApplication: 0, sourceAliveAfterSettlement: false, sourceHpAfterSettlement: 0, sourceMaxHpAfterSettlement: 4 },
      ],
    });
    const before = structuredClone(input);
    const plan = must(planKuangguRecovery(input));
    expect(plan.steps).toEqual([
      { pointIndex: 1, distanceAtApplication: 1, withinDistanceOne: true, triggered: true, requestedRecovery: 1, recoverableAmount: 1, reason: null },
      { pointIndex: 2, distanceAtApplication: 2, withinDistanceOne: false, triggered: false, requestedRecovery: 0, recoverableAmount: 0, reason: "outside_distance_one" },
      { pointIndex: 3, distanceAtApplication: 1, withinDistanceOne: true, triggered: true, requestedRecovery: 1, recoverableAmount: 0, reason: null },
      { pointIndex: 4, distanceAtApplication: 0, withinDistanceOne: true, triggered: false, requestedRecovery: 0, recoverableAmount: 0, reason: "source_dead" },
    ]);
    expect(input).toEqual(before);
  });

  it("rejects missing, reordered, or nonsensical point snapshots", () => {
    expect(planKuangguRecovery({
      sourceId: "weiyan",
      targetId: "target",
      points: [{ pointIndex: 2, distanceAtApplication: 1, sourceAliveAfterSettlement: true, sourceHpAfterSettlement: 1, sourceMaxHpAfterSettlement: 4 }],
    }).ok).toBe(false);
    expect(planKuangguRecovery({
      sourceId: "weiyan",
      targetId: "target",
      points: [{ pointIndex: 1, distanceAtApplication: -1, sourceAliveAfterSettlement: true, sourceHpAfterSettlement: 1, sourceMaxHpAfterSettlement: 4 }],
    }).ok).toBe(false);
  });
});

describe("Wind runtime: Jushou", () => {
  it.each([
    { name: "discard a basic card", mode: "discard_non_equipment", card: makeCard(), canUse: false, eligible: true, reason: null, disposition: "discard" },
    { name: "discard an ordinary trick", mode: "discard_non_equipment", card: makeCard({ kind: "duel", category: "trick" }), canUse: false, eligible: true, reason: null, disposition: "discard" },
    { name: "not discard equipment", mode: "discard_non_equipment", card: makeCard({ kind: "bai_yin_shi_zi", category: "equipment" }), canUse: false, eligible: false, reason: "discard_requires_non_equipment", disposition: null },
    { name: "use legal equipment", mode: "use_equipment", card: makeCard({ kind: "bai_yin_shi_zi", category: "equipment" }), canUse: true, eligible: true, reason: null, disposition: "use" },
    { name: "not use illegal equipment", mode: "use_equipment", card: makeCard({ kind: "bai_yin_shi_zi", category: "equipment" }), canUse: false, eligible: false, reason: "equipment_use_illegal", disposition: null },
    { name: "not use a basic card", mode: "use_equipment", card: makeCard(), canUse: true, eligible: false, reason: "use_requires_equipment", disposition: null },
    { name: "not dispose from equipment zone", mode: "use_equipment", card: makeCard({ kind: "bai_yin_shi_zi", category: "equipment", zone: "equipment" }), canUse: true, eligible: false, reason: "card_not_owned_hand", disposition: null },
  ] as const)("can $name", ({ mode, card, canUse, eligible, reason, disposition }) => {
    expect(must(evaluateJushouDisposal({
      skillOwnerId: "owner",
      mode,
      card,
      equipmentUseLegal: canUse,
    }))).toEqual({ eligible, reason, disposition });
  });
});

describe("Wind runtime: Shensu", () => {
  const target = { id: "enemy", alive: true, legalIgnoringDistance: true } as const;
  const equipInHand = makeCard({ id: "equip", kind: "gu_ding_dao", category: "equipment", ownerId: "xiahouyuan" });
  const equipped = makeCard({ id: "armor", kind: "bai_yin_shi_zi", category: "equipment", ownerId: "xiahouyuan", zone: "equipment" });

  it.each([
    { name: "first window", stage: "judgment_and_draw", window: "before_judgment", skipped: false, cost: null, eligible: true, reason: null },
    { name: "first window with a cost", stage: "judgment_and_draw", window: "before_judgment", skipped: false, cost: equipInHand, eligible: false, reason: "stage_one_has_cost" },
    { name: "first window already skipped", stage: "judgment_and_draw", window: "before_judgment", skipped: true, cost: null, eligible: false, reason: "phase_already_skipped" },
    { name: "second window hand equipment", stage: "play", window: "before_play", skipped: false, cost: equipInHand, eligible: true, reason: null },
    { name: "second window equipped card", stage: "play", window: "before_play", skipped: false, cost: equipped, eligible: true, reason: null },
    { name: "second window without equipment", stage: "play", window: "before_play", skipped: false, cost: null, eligible: false, reason: "stage_two_requires_equipment_cost" },
    { name: "wrong trigger window", stage: "play", window: "before_judgment", skipped: false, cost: equipInHand, eligible: false, reason: "wrong_window" },
  ] as const)("evaluates $name", ({ stage, window, skipped, cost, eligible, reason }) => {
    const result = must(evaluateShensuActivation({
      stage,
      window,
      skillOwnerId: "xiahouyuan",
      turnPlayerId: "xiahouyuan",
      phaseAlreadySkipped: skipped,
      costCard: cost,
      target,
    }));
    expect(result.eligible).toBe(eligible);
    expect(result.reason).toBe(reason);
    if (eligible) {
      expect(result.virtualSlash).toEqual({
        sourceSkillId: "shensu",
        kind: "slash",
        nature: "normal",
        effectiveColor: null,
        physicalCardIds: [],
        useMethod: "use",
        ignoresDistance: true,
        consumesPlayPhaseSlashQuota: false,
      });
      expect(result.skippedPhases).toEqual(stage === "play" ? ["play"] : ["judgment", "draw"]);
    }
  });

  it.each([
    { target: { id: "xiahouyuan", alive: true, legalIgnoringDistance: true }, label: "self" },
    { target: { id: "enemy", alive: false, legalIgnoringDistance: true }, label: "dead player" },
    { target: { id: "enemy", alive: true, legalIgnoringDistance: false }, label: "otherwise illegal target" },
  ])("rejects $label even though distance is ignored", ({ target: badTarget }) => {
    const result = must(evaluateShensuActivation({
      stage: "judgment_and_draw",
      window: "before_judgment",
      skillOwnerId: "xiahouyuan",
      turnPlayerId: "xiahouyuan",
      phaseAlreadySkipped: false,
      costCard: null,
      target: badTarget,
    }));
    expect(result).toMatchObject({ eligible: false, reason: "illegal_target" });
  });
});

describe("Wind runtime: Tianxiang", () => {
  const base = {
    skillOwnerId: "xiaoqiao",
    currentDamageTargetId: "xiaoqiao",
    hongyan: { ownerId: "xiaoqiao", active: true },
    target: { id: "attacker", alive: true },
  } as const;

  it.each([
    { name: "printed heart", card: makeCard({ ownerId: "xiaoqiao", printedSuit: "heart" }), eligible: true, suit: "heart", modified: false, reason: null },
    { name: "Hongyan spade", card: makeCard({ ownerId: "xiaoqiao", printedSuit: "spade" }), eligible: true, suit: "heart", modified: true, reason: null },
    { name: "diamond", card: makeCard({ ownerId: "xiaoqiao", printedSuit: "diamond" }), eligible: false, suit: "diamond", modified: false, reason: "cost_not_effective_heart" },
    { name: "equipped heart", card: makeCard({ ownerId: "xiaoqiao", printedSuit: "heart", kind: "ba_gua_zhen", category: "equipment", zone: "equipment" }), eligible: false, suit: "heart", modified: false, reason: "cost_not_owned_physical_hand" },
  ] as const)("checks $name cost", ({ card, eligible, suit, modified, reason }) => {
    expect(must(evaluateTianxiangChoice({ ...base, costCard: card }))).toEqual({
      eligible,
      reason,
      effectiveCostSuit: suit,
      costModifiedByHongyan: modified,
    });
  });

  it.each([
    { target: { id: "xiaoqiao", alive: true }, reason: "self" },
    { target: { id: "dead", alive: false }, reason: "dead" },
  ])("rejects a $reason redirect target", ({ target }) => {
    const value = must(evaluateTianxiangChoice({
      ...base,
      costCard: makeCard({ ownerId: "xiaoqiao" }),
      target,
    }));
    expect(value).toMatchObject({ eligible: false, reason: "target_not_other_living_player" });
  });
});

describe("Wind runtime: Huangtian", () => {
  const base = {
    giverId: "qun-giver",
    giverFaction: "qun",
    giverAlive: true,
    receiverId: "zhangjiao",
    receiverAlive: true,
    receiverHasEffectiveHuangtian: true,
    turnPlayerId: "qun-giver",
    phase: "play",
    useCountThisPlayPhase: 0,
    card: makeCard({ ownerId: "qun-giver", kind: "dodge", category: "basic" }),
  } as const;

  it.each([
    { name: "physical Dodge", patch: {}, eligible: true, reason: null },
    { name: "physical Lightning", patch: { card: makeCard({ ownerId: "qun-giver", kind: "shan_dian", category: "trick" }) }, eligible: true, reason: null },
    { name: "non-Qun giver", patch: { giverFaction: "wei" }, eligible: false, reason: "giver_not_other_qun_player" },
    { name: "self gift", patch: { receiverId: "qun-giver" }, eligible: false, reason: "giver_not_other_qun_player" },
    { name: "another turn", patch: { turnPlayerId: "other" }, eligible: false, reason: "not_givers_play_phase" },
    { name: "second use", patch: { useCountThisPlayPhase: 1 }, eligible: false, reason: "already_used_this_play_phase" },
    { name: "receiver without skill", patch: { receiverHasEffectiveHuangtian: false }, eligible: false, reason: "receiver_lacks_effective_huangtian" },
    { name: "virtual Dodge", patch: { card: makeCard({ ownerId: "qun-giver", physical: false }) }, eligible: false, reason: "card_not_owned_physical_hand" },
    { name: "Peach", patch: { card: makeCard({ ownerId: "qun-giver", kind: "peach" }) }, eligible: false, reason: "card_not_dodge_or_lightning" },
  ] as const)("handles $name", ({ patch, eligible, reason }) => {
    expect(must(evaluateHuangtianGift({ ...base, ...patch }))).toEqual({ eligible, reason });
  });
});

describe("Wind runtime: Buqu", () => {
  it.each([
    { hp: 3, loss: 4, count: 2, points: [{ pointIndex: 3, hpAfterPoint: 0 }, { pointIndex: 4, hpAfterPoint: -1 }] },
    { hp: 3, loss: 2, count: 0, points: [] },
    { hp: 1, loss: 1, count: 1, points: [{ pointIndex: 1, hpAfterPoint: 0 }] },
    { hp: 0, loss: 2, count: 2, points: [{ pointIndex: 1, hpAfterPoint: -1 }, { pointIndex: 2, hpAfterPoint: -2 }] },
    { hp: -2, loss: 1, count: 1, points: [{ pointIndex: 1, hpAfterPoint: -3 }] },
    { hp: 2, loss: 0, count: 0, points: [] },
  ])("from $hp HP and $loss loss needs $count wounds", ({ hp, loss, count, points }) => {
    expect(must(planBuquWounds({ hpBefore: hp, lossAmount: loss }))).toEqual({
      hpBefore: hp,
      hpAfter: hp - loss,
      woundCount: count,
      qualifyingPoints: points,
    });
  });

  it.each([
    { wounds: [], unique: true, duplicates: [], protectedFromDying: false },
    { wounds: [{ cardId: "a", rank: 1 }, { cardId: "b", rank: 7 }, { cardId: "c", rank: 13 }], unique: true, duplicates: [], protectedFromDying: true },
    { wounds: [{ cardId: "a", rank: 7 }, { cardId: "b", rank: 7 }, { cardId: "c", rank: 3 }, { cardId: "d", rank: 3 }], unique: false, duplicates: [3, 7], protectedFromDying: false },
  ])("analyzes wound rank uniqueness", ({ wounds, unique, duplicates, protectedFromDying }) => {
    expect(must(analyzeBuquWounds(wounds))).toEqual({
      uniqueRanks: unique,
      duplicateRanks: duplicates,
      protectedFromDying,
    });
  });

  it("removes exactly the chosen wound without mutating the pile", () => {
    const input = deepFreeze({
      hp: 0,
      maxHp: 4,
      wounds: [{ cardId: "seven-a", rank: 7 }, { cardId: "seven-b", rank: 7 }, { cardId: "nine", rank: 9 }],
      removeCardId: "seven-a",
    });
    const before = structuredClone(input);
    expect(must(resolveBuquRecoveryPoint(input))).toEqual({
      hpBefore: 0,
      hpAfter: 0,
      removedWound: { cardId: "seven-a", rank: 7 },
      remainingWounds: [{ cardId: "seven-b", rank: 7 }, { cardId: "nine", rank: 9 }],
      finalWoundRemoved: false,
      uniqueRanks: true,
      duplicateRanks: [],
      protectedFromDying: true,
    });
    expect(input).toEqual(before);
  });

  it("sets HP to one only when the last wound is removed", () => {
    expect(must(resolveBuquRecoveryPoint({
      hp: -2,
      maxHp: 4,
      wounds: [{ cardId: "last", rank: 12 }],
      removeCardId: "last",
    }))).toMatchObject({ hpAfter: 1, finalWoundRemoved: true, remainingWounds: [], protectedFromDying: false });
  });

  it("rejects invalid loss, ranks, duplicate IDs, and removal choices", () => {
    expect(planBuquWounds({ hpBefore: 1, lossAmount: -1 }).ok).toBe(false);
    expect(analyzeBuquWounds([{ cardId: "a", rank: 14 }]).ok).toBe(false);
    expect(analyzeBuquWounds([{ cardId: "a", rank: 1 }, { cardId: "a", rank: 2 }]).ok).toBe(false);
    expect(resolveBuquRecoveryPoint({ hp: 0, maxHp: 4, wounds: [{ cardId: "a", rank: 1 }], removeCardId: "b" }).ok).toBe(false);
  });
});

describe("Wind runtime: Guhuo", () => {
  it.each([
    { declared: "slash", physical: "slash", truthful: true, comparison: "generic_slash" },
    { declared: "slash", physical: "fire_slash", truthful: true, comparison: "generic_slash" },
    { declared: "slash", physical: "thunder_slash", truthful: true, comparison: "generic_slash" },
    { declared: "fire_slash", physical: "fire_slash", truthful: true, comparison: "exact_kind" },
    { declared: "fire_slash", physical: "slash", truthful: false, comparison: "exact_kind" },
    { declared: "dodge", physical: "dodge", truthful: true, comparison: "exact_kind" },
    { declared: "dodge", physical: "peach", truthful: false, comparison: "exact_kind" },
  ] as const)("compares $declared against $physical", ({ declared, physical, truthful, comparison }) => {
    expect(must(evaluateGuhuoTruth({ declaredKind: declared, physicalKind: physical }))).toEqual({ truthful, comparison });
  });

  it("allows only basic and ordinary non-delayed trick declarations", () => {
    for (const kind of ["slash", "wine", "wu_xie_ke_ji", "iron_chain"]) expect(isGuhuoDeclarableKind(kind)).toBe(true);
    for (const kind of ["shan_dian", "le_bu_si_shu", "ba_gua_zhen", "unknown"]) expect(isGuhuoDeclarableKind(kind)).toBe(false);
  });

  it.each([
    { name: "unchallenged false card", physical: "peach", suit: "spade", challengers: [], outcome: "unchallenged", continues: true, effect: null },
    { name: "challenged true heart", physical: "dodge", suit: "heart", challengers: ["a", "b"], outcome: "challenged_truthful_heart", continues: true, effect: "lose_hp" },
    { name: "challenged true non-heart", physical: "dodge", suit: "club", challengers: ["a"], outcome: "challenged_truthful_non_heart", continues: false, effect: "lose_hp" },
    { name: "challenged false heart", physical: "peach", suit: "heart", challengers: ["a", "b"], outcome: "challenged_false", continues: false, effect: "draw" },
  ] as const)("adjudicates $name", ({ physical, suit, challengers, outcome, continues, effect }) => {
    const value = must(adjudicateGuhuoChallenge({
      sourceId: "yuji",
      declaredKind: "dodge",
      physicalKind: physical,
      effectiveSuit: suit,
      challengerIds: challengers,
    }));
    expect(value.outcome).toBe(outcome);
    expect(value.continuesAsDeclared).toBe(continues);
    expect(value.revealRequired).toBe(true);
    expect(value.consequences).toEqual(effect === null ? [] : challengers.map((playerId) => ({ playerId, effect, amount: 1 })));
  });

  it("rejects invalid declarations and forged challenge orders", () => {
    expect(evaluateGuhuoTruth({ declaredKind: "shan_dian", physicalKind: "shan_dian" } as never).ok).toBe(false);
    expect(adjudicateGuhuoChallenge({
      sourceId: "yuji", declaredKind: "dodge", physicalKind: "dodge", effectiveSuit: "heart", challengerIds: ["a", "a"],
    }).ok).toBe(false);
    expect(adjudicateGuhuoChallenge({
      sourceId: "yuji", declaredKind: "dodge", physicalKind: "dodge", effectiveSuit: "heart", challengerIds: ["yuji"],
    }).ok).toBe(false);
  });
});

describe("Wind runtime: Leiji", () => {
  it("plans one spade judgment and thunder hit from an accepted physical Dodge", () => {
    const input = deepFreeze(makeLeijiInput());
    const before = structuredClone(input);

    expect(must(planLeiji(input))).toEqual({
      dodgeEventId: "dodge-event-1",
      eligible: true,
      reason: null,
      judgment: {
        triggerEventId: "dodge-event-1",
        skillId: "leiji",
        pattern: "spade",
        judgedTargetId: "target",
      },
      hitDamage: {
        triggerEventId: "dodge-event-1",
        sourceId: "zhangjiao",
        targetId: "target",
        amount: 2,
        nature: "thunder",
        reason: "leiji",
      },
    });
    expect(input).toEqual(before);
  });

  it("accepts a view-as Dodge attributed to the skill owner", () => {
    const input = makeLeijiInput({
      dodgeEventId: "qingguo-event",
      method: "use",
      provenance: { type: "view_as", skillId: "qingguo", physicalCardIds: ["black-card-1"] },
    });
    const result = must(planLeiji(input));
    expect(result.eligible).toBe(true);
    expect(result.judgment).toEqual({
      triggerEventId: "qingguo-event",
      skillId: "leiji",
      pattern: "spade",
      judgedTargetId: "target",
    });
    expect(result.hitDamage?.sourceId).toBe("zhangjiao");
  });

  it.each([
    {
      name: "non-Dodge effective card",
      input: makeLeijiInput({ effectiveCardKind: "slash" }),
      reason: "effective_card_not_dodge",
    },
    {
      name: "unaccepted Dodge",
      input: makeLeijiInput({ accepted: false }),
      reason: "dodge_not_accepted",
    },
    {
      name: "another player's Dodge",
      input: makeLeijiInput({ attributedPlayerId: "other" }),
      reason: "dodge_not_attributed_to_skill_owner",
    },
    {
      name: "recast method",
      input: makeLeijiInput({ method: "recast" }),
      reason: "dodge_method_not_use_or_respond",
    },
    {
      name: "dead selected target",
      input: makeLeijiInput({}, { alive: false }),
      reason: "selected_target_dead",
    },
  ] as const)("does not trigger for $name", ({ input, reason }) => {
    expect(must(planLeiji(input))).toEqual({
      dodgeEventId: "dodge-event-1",
      eligible: false,
      reason,
      judgment: null,
      hitDamage: null,
    });
  });

  it("allows the living skill owner to select themself", () => {
    const result = must(planLeiji(makeLeijiInput({}, { playerId: "zhangjiao" })));
    expect(result.eligible).toBe(true);
    expect(result.judgment?.judgedTargetId).toBe("zhangjiao");
    expect(result.hitDamage?.targetId).toBe("zhangjiao");
  });

  it("keeps separate accepted Dodge events independent", () => {
    const first = must(planLeiji(makeLeijiInput({ dodgeEventId: "dodge-event-a" }, { playerId: "a" })));
    const second = must(planLeiji(makeLeijiInput({ dodgeEventId: "dodge-event-b" }, { playerId: "b" })));

    expect(first.judgment).toEqual({
      triggerEventId: "dodge-event-a", skillId: "leiji", pattern: "spade", judgedTargetId: "a",
    });
    expect(second.judgment).toEqual({
      triggerEventId: "dodge-event-b", skillId: "leiji", pattern: "spade", judgedTargetId: "b",
    });
    expect(first.hitDamage?.triggerEventId).toBe("dodge-event-a");
    expect(second.hitDamage?.triggerEventId).toBe("dodge-event-b");
    expect(first.judgment).not.toBe(second.judgment);
  });

  it("fails closed for malformed event, target, method, and effective kind data", () => {
    expect(planLeiji(makeLeijiInput({ dodgeEventId: "" })).ok).toBe(false);
    expect(planLeiji(makeLeijiInput({ method: "discard" as never })).ok).toBe(false);
    expect(planLeiji(makeLeijiInput({ effectiveCardKind: "unknown" as CardKind })).ok).toBe(false);
    expect(planLeiji(makeLeijiInput({}, { playerId: "" })).ok).toBe(false);
    expect(planLeiji({ ...makeLeijiInput(), skillOwnerId: "" }).ok).toBe(false);
  });

  it("validates physical and view-as provenance instead of trusting forged snapshots", () => {
    expect(planLeiji(makeLeijiInput({
      provenance: { type: "physical", cardId: "slash-1", printedKind: "slash" },
    })).ok).toBe(false);
    expect(planLeiji(makeLeijiInput({
      provenance: { type: "view_as", skillId: "qingguo", physicalCardIds: ["same", "same"] },
    })).ok).toBe(false);
    expect(planLeiji(makeLeijiInput({
      provenance: { type: "view_as", skillId: "", physicalCardIds: [] },
    })).ok).toBe(false);
  });

  it("rejects non-JSON values, cycles, and extra schema fields", () => {
    const withUndefined = { ...makeLeijiInput(), ignored: undefined };
    expect(planLeiji(withUndefined as never).ok).toBe(false);
    expect(planLeiji({ ...makeLeijiInput(), selectedTarget: new Date() } as never).ok).toBe(false);

    const cyclic = makeLeijiInput() as LeijiPlanInput & { loop?: unknown };
    cyclic.loop = cyclic;
    expect(planLeiji(cyclic).ok).toBe(false);
  });
});

describe("Wind runtime: Guidao", () => {
  it.each([
    { name: "hand club", card: makeCard({ ownerId: "zhangjiao", printedSuit: "club" }), hongyan: null, eligible: true, suit: "club", color: "black", modified: false, reason: null },
    { name: "hand spade", card: makeCard({ ownerId: "zhangjiao", printedSuit: "spade" }), hongyan: null, eligible: true, suit: "spade", color: "black", modified: false, reason: null },
    { name: "Hongyan-owned spade", card: makeCard({ ownerId: "zhangjiao", printedSuit: "spade" }), hongyan: { ownerId: "zhangjiao", active: true }, eligible: false, suit: "heart", color: "red", modified: true, reason: "card_not_effective_black" },
    { name: "hand heart", card: makeCard({ ownerId: "zhangjiao", printedSuit: "heart" }), hongyan: null, eligible: false, suit: "heart", color: "red", modified: false, reason: "card_not_effective_black" },
    { name: "equipped club", card: makeCard({ ownerId: "zhangjiao", printedSuit: "club", kind: "ba_gua_zhen", category: "equipment", zone: "equipment" }), hongyan: null, eligible: true, suit: "club", color: "black", modified: false, reason: null },
    { name: "judgment-zone club", card: makeCard({ ownerId: "zhangjiao", printedSuit: "club", kind: "le_bu_si_shu", category: "trick", zone: "judgment" }), hongyan: null, eligible: false, suit: "club", color: "black", modified: false, reason: "card_not_owned_physical_hand_or_equipment" },
  ] as const)("checks $name", ({ card, hongyan, eligible, suit, color, modified, reason }) => {
    expect(must(evaluateGuidaoCost({ skillOwnerId: "zhangjiao", card, hongyan }))).toEqual({
      eligible,
      reason,
      effectiveSuit: suit,
      effectiveColor: color,
      modifiedByHongyan: modified,
    });
  });
});

describe("Wind runtime safety contract", () => {
  it("returns JSON-serializable decisions without leaking undefined values", () => {
    const decisions = [
      resolveHongyanSuit({ printedSuit: "spade", cardOwnerId: "x", hongyan: { ownerId: "x", active: true } }),
      evaluateLiegong({
        skillOwnerId: "h", slashSourceId: "h", turnPlayerId: "h", phase: "play", method: "use",
        slashKind: "slash", targetHandCount: 0, ownerCurrentHp: 3, ownerAttackRange: 1,
      }),
      planBuquWounds({ hpBefore: 1, lossAmount: 1 }),
      adjudicateGuhuoChallenge({
        sourceId: "y", declaredKind: "slash", physicalKind: "fire_slash", effectiveSuit: "heart", challengerIds: ["z"],
      }),
    ];
    for (const decision of decisions) {
      expect(JSON.parse(JSON.stringify(decision))).toEqual(decision);
      expect(JSON.stringify(decision)).not.toContain("undefined");
    }
  });

  it("rejects forged category/kind combinations instead of trusting TypeScript types", () => {
    const forged = makeCard({ kind: "dodge", category: "equipment" as CardCategory });
    expect(evaluateJushouDisposal({
      skillOwnerId: "owner",
      mode: "use_equipment",
      card: forged,
      equipmentUseLegal: true,
    }).ok).toBe(false);

    const unknownKind = makeCard({ kind: "unknown" as CardKind });
    expect(evaluateGuidaoCost({ skillOwnerId: "owner", card: unknownKind, hongyan: null }).ok).toBe(false);
    expect(resolveHongyanSuit({ printedSuit: "unknown" as CardSuit, cardOwnerId: "owner", hongyan: null }).ok).toBe(false);
  });
});
