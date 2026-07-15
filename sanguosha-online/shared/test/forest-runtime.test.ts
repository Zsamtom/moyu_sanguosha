import { describe, expect, it } from "vitest";

import type { CardCategory, CardKind, CardSuit, EquipmentSlot, Faction } from "../src/types.js";
import {
  FOREST_GENERAL_IDS,
  FOREST_RULE_DECISIONS,
  FOREST_SKILL_IDS,
  analyzeHaoshiTransfer,
  bindHuoshouSource,
  evaluateBaonueTrigger,
  evaluateBenghuaiTrigger,
  evaluateDuanliang,
  evaluateHaoshiActivation,
  evaluateHuoshouImmunity,
  evaluateJiuchi,
  evaluateJuxiangImmunity,
  evaluateLierenTrigger,
  evaluateLuanwuActivation,
  evaluateSongwei,
  evaluateWanshaPeach,
  evaluateWeimuTarget,
  evaluateZaiqiActivation,
  planBenghuaiChoice,
  planDimeng,
  planFangzhu,
  planJuxiangClaim,
  planLierenGain,
  planLuanwuActor,
  planRoulinResponses,
  planXingshang,
  planYinghun,
  planYinghunDiscard,
  planZaiqiSettlement,
  resolveHuoshouDamageSource,
  resolveLierenPindian,
  settleBaonueJudgment,
  validateHaoshiTransferChoice,
  type ForestPlayContext,
  type ForestRuleCard,
  type ForestRuleResult,
  type ForestSkillContext,
} from "../src/skills/forest-runtime.js";

function must<T>(result: ForestRuleResult<T>): T {
  if (!result.ok) throw new Error(`${result.code}: ${result.detail}`);
  return result.value;
}

function skill(ownerId = "owner"): ForestSkillContext {
  return { ownerId, ownerAlive: true, skillEffective: true };
}

function play(ownerId = "owner"): ForestPlayContext {
  return { ...skill(ownerId), currentPlayerId: ownerId, phase: "play" };
}

function card(overrides: Partial<ForestRuleCard> = {}): ForestRuleCard {
  return {
    id: "card-1",
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

function equipment(overrides: Partial<ForestRuleCard> = {}): ForestRuleCard {
  return card({
    kind: "gu_ding_dao",
    category: "equipment",
    equipmentSlot: "weapon",
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

describe("Forest runtime catalog", () => {
  it("locks the original repository scope to 8 generals and 18 unique skills", () => {
    expect(FOREST_GENERAL_IDS).toHaveLength(8);
    expect(FOREST_SKILL_IDS).toHaveLength(18);
    expect(new Set(FOREST_GENERAL_IDS)).toHaveLength(8);
    expect(new Set(FOREST_SKILL_IDS)).toHaveLength(18);
    expect(FOREST_GENERAL_IDS).toEqual([
      "cao_pi", "dong_zhuo", "jia_xu", "lu_su", "meng_huo", "sun_jian", "xu_huang", "zhu_rong",
    ]);
  });

  it("makes source-conflict decisions machine-readable and immutable", () => {
    expect(FOREST_RULE_DECISIONS.zaiqi).toContain("without_plus_one");
    expect(FOREST_RULE_DECISIONS.fangzhu).toContain("draw_lost_hp_then_toggle_face");
    expect(FOREST_RULE_DECISIONS.juxiang).toContain("java_hasJuXiang_returning_false");
    expect(Object.isFrozen(FOREST_RULE_DECISIONS)).toBe(true);
  });
});

describe("Cao Pi rules", () => {
  it("claims all ordinary death zones atomically, excludes extra piles, and preserves input", () => {
    const input = deepFreeze({
      context: skill("caopi"),
      deadPlayerId: "dead",
      decision: "claim" as const,
      privateCardsRevealedBeforeDecision: false,
      deadZones: {
        handCardIds: ["h1", "h2"],
        equipmentCardIds: ["e1"],
        judgmentCardIds: ["j1"],
        extraPileCardIds: ["buqu", "star"],
      },
    });
    const before = structuredClone(input);
    expect(must(planXingshang(input))).toEqual({
      skillId: "xingshang",
      ownerId: "caopi",
      deadPlayerId: "dead",
      claimed: true,
      transferCardIds: ["h1", "h2", "e1", "j1"],
      excludedExtraPileCardIds: ["buqu", "star"],
      atomicTransfer: true,
      timing: "before_death_rewards_and_punishments",
    });
    expect(input).toEqual(before);
  });

  it("allows an all-or-nothing decline", () => {
    expect(must(planXingshang({
      context: skill("caopi"),
      deadPlayerId: "dead",
      decision: "decline",
      privateCardsRevealedBeforeDecision: false,
      deadZones: { handCardIds: ["h"], equipmentCardIds: [], judgmentCardIds: [], extraPileCardIds: [] },
    }))).toMatchObject({ claimed: false, transferCardIds: [] });
  });

  it.each([
    { name: "self death", patch: { deadPlayerId: "caopi" }, code: "invalid_target" },
    { name: "private preview", patch: { privateCardsRevealedBeforeDecision: true }, code: "private_information_leak" },
    { name: "overlapping zones", patch: { deadZones: { handCardIds: ["same"], equipmentCardIds: ["same"], judgmentCardIds: [], extraPileCardIds: [] } }, code: "invalid_input" },
    { name: "duplicate hand IDs", patch: { deadZones: { handCardIds: ["same", "same"], equipmentCardIds: [], judgmentCardIds: [], extraPileCardIds: [] } }, code: "invalid_input" },
  ])("fails closed for $name", ({ patch, code }) => {
    const result = planXingshang({
      context: skill("caopi"),
      deadPlayerId: "dead",
      decision: "claim",
      privateCardsRevealedBeforeDecision: false,
      deadZones: { handCardIds: [], equipmentCardIds: [], judgmentCardIds: [], extraPileCardIds: [] },
      ...patch,
    });
    expect(result).toMatchObject({ ok: false, code });
  });

  it.each([
    { amount: 1, hp: 2, maxHp: 3, faceUp: true, draw: 1, after: false },
    { amount: 3, hp: 1, maxHp: 3, faceUp: false, draw: 2, after: true },
    { amount: 2, hp: 0, maxHp: 3, faceUp: true, draw: 3, after: false },
  ])("Fangzhu triggers once for a $amount-point damage event", ({ amount, hp, maxHp, faceUp, draw, after }) => {
    expect(must(planFangzhu({
      context: skill("caopi"),
      damageEventAmount: amount,
      ownerHp: hp,
      ownerMaxHp: maxHp,
      targetId: "target",
      targetAlive: true,
      targetFaceUp: faceUp,
    }))).toMatchObject({
      triggerCountForDamageEvent: 1,
      drawCount: draw,
      faceUpAfter: after,
      sequence: ["draw", "turn_over"],
    });
  });

  it.each([
    { name: "self target", targetId: "caopi", alive: true, code: "invalid_target" },
    { name: "dead target", targetId: "dead", alive: false, code: "target_dead" },
  ])("rejects Fangzhu $name", ({ targetId, alive, code }) => {
    expect(planFangzhu({
      context: skill("caopi"), damageEventAmount: 1, ownerHp: 2, ownerMaxHp: 3,
      targetId, targetAlive: alive, targetFaceUp: true,
    })).toMatchObject({ ok: false, code });
  });

  it.each([
    { name: "final Spade", player: "wei", faction: "wei", suit: "spade", final: true, invoked: true, eligible: true, reason: null },
    { name: "final Club", player: "wei", faction: "wei", suit: "club", final: true, invoked: true, eligible: true, reason: null },
    { name: "Heart", player: "wei", faction: "wei", suit: "heart", final: true, invoked: true, eligible: false, reason: "not_final_black_judgment" },
    { name: "pre-retrial black", player: "wei", faction: "wei", suit: "spade", final: false, invoked: true, eligible: false, reason: "not_final_black_judgment" },
    { name: "other faction", player: "shu", faction: "shu", suit: "spade", final: true, invoked: true, eligible: false, reason: "not_other_wei" },
    { name: "lord's own judgment", player: "caopi", faction: "wei", suit: "spade", final: true, invoked: true, eligible: false, reason: "not_other_wei" },
    { name: "decline by judged Wei", player: "wei", faction: "wei", suit: "spade", final: true, invoked: false, eligible: false, reason: "judged_player_declined" },
  ] as const)("Songwei handles $name", ({ player, faction, suit, final, invoked, eligible, reason }) => {
    expect(must(evaluateSongwei({
      context: skill("caopi"),
      judgedPlayerId: player,
      judgedPlayerAlive: true,
      judgedPlayerFaction: faction,
      judgmentEffectiveSuit: suit,
      finalJudgmentResult: final,
      judgedPlayerInvoked: invoked,
    }))).toMatchObject({ eligible, ownerDrawCount: eligible ? 1 : 0, reason });
  });
});

describe("Dong Zhuo rules", () => {
  it.each([
    { name: "use a Spade hand card", method: "use", suit: "spade", zone: "hand", physical: true, timing: true, ok: true },
    { name: "respond with a Spade hand card", method: "respond", suit: "spade", zone: "hand", physical: true, timing: true, ok: true },
    { name: "reject an effective Heart", method: "use", suit: "heart", zone: "hand", physical: true, timing: true, ok: false },
    { name: "reject equipped Spade", method: "use", suit: "spade", zone: "equipment", physical: true, timing: true, ok: false },
    { name: "reject virtual Spade", method: "use", suit: "spade", zone: "hand", physical: false, timing: true, ok: false },
    { name: "reject illegal Wine timing", method: "use", suit: "spade", zone: "hand", physical: true, timing: false, ok: false },
  ] as const)("Jiuchi can $name", ({ method, suit, zone, physical, timing, ok }) => {
    const cost = zone === "equipment"
      ? equipment({ ownerId: "dongzhuo", zone })
      : card({ ownerId: "dongzhuo", zone, physical });
    const result = evaluateJiuchi({
      context: skill("dongzhuo"), method, card: { ...cost, physical }, effectiveSuit: suit, wineTimingLegal: timing,
    });
    expect(result.ok).toBe(ok);
    if (ok) expect(must(result)).toMatchObject({ effectiveKind: "wine", retainsSuitAndRank: true, method });
  });

  it.each([
    { sourceGender: "male", sourceRoulin: true, targetGender: "female", targetRoulin: false, base: 1, applied: true, required: 2 },
    { sourceGender: "female", sourceRoulin: false, targetGender: "male", targetRoulin: true, base: 1, applied: true, required: 2 },
    { sourceGender: "male", sourceRoulin: true, targetGender: "male", targetRoulin: false, base: 1, applied: false, required: 1 },
    { sourceGender: "female", sourceRoulin: true, targetGender: "female", targetRoulin: true, base: 2, applied: true, required: 2 },
    { sourceGender: "female", sourceRoulin: true, targetGender: "female", targetRoulin: true, base: 3, applied: true, required: 3 },
  ] as const)("Roulin takes the maximum response count", (facts) => {
    expect(must(planRoulinResponses({
      sourceId: "source",
      sourceGender: facts.sourceGender,
      sourceHasEffectiveRoulin: facts.sourceRoulin,
      targetId: "target",
      targetGender: facts.targetGender,
      targetHasEffectiveRoulin: facts.targetRoulin,
      baseRequiredDodgeCount: facts.base,
    }))).toEqual({
      skillId: "roulin",
      applied: facts.applied,
      requiredDodgeCount: facts.required,
      stacksByMaximumNotAddition: true,
    });
  });

  it.each([
    { name: "one lower living player", hp: 4, players: [{ id: "a", alive: true, hp: 3 }], triggered: true, lower: ["a"] },
    { name: "tie for minimum", hp: 3, players: [{ id: "a", alive: true, hp: 3 }, { id: "b", alive: true, hp: 4 }], triggered: false, lower: [] },
    { name: "dead lower player", hp: 3, players: [{ id: "a", alive: false, hp: 1 }], triggered: false, lower: [] },
    { name: "several lower players", hp: 5, players: [{ id: "a", alive: true, hp: 4 }, { id: "b", alive: true, hp: 2 }], triggered: true, lower: ["a", "b"] },
  ])("Benghuai checks $name", ({ hp, players, triggered, lower }) => {
    expect(must(evaluateBenghuaiTrigger({ context: skill("dongzhuo"), phase: "end", ownerHp: hp, otherPlayers: players }))).toEqual({
      skillId: "benghuai", ownerId: "dongzhuo", triggered, lowerHpPlayerIds: lower, tiesAtMinimumDoNotTrigger: true,
    });
  });

  it("rejects Benghuai outside the end phase", () => {
    expect(evaluateBenghuaiTrigger({ context: skill("dongzhuo"), phase: "discard", ownerHp: 5, otherPlayers: [] }))
      .toMatchObject({ ok: false, code: "wrong_timing" });
  });

  it.each([
    { hp: 3, maxHp: 8, choice: "lose_hp", hpAfter: 2, maxAfter: 8, dying: false, zeroMax: false, clamp: 0 },
    { hp: 1, maxHp: 8, choice: "lose_hp", hpAfter: 0, maxAfter: 8, dying: true, zeroMax: false, clamp: 0 },
    { hp: 8, maxHp: 8, choice: "lose_max_hp", hpAfter: 7, maxAfter: 7, dying: false, zeroMax: false, clamp: 1 },
    { hp: 5, maxHp: 8, choice: "lose_max_hp", hpAfter: 5, maxAfter: 7, dying: false, zeroMax: false, clamp: 0 },
    { hp: 1, maxHp: 1, choice: "lose_max_hp", hpAfter: 0, maxAfter: 0, dying: false, zeroMax: true, clamp: 1 },
  ] as const)("plans Benghuai $choice from $hp/$maxHp", ({ hp, maxHp, choice, hpAfter, maxAfter, dying, zeroMax, clamp }) => {
    expect(must(planBenghuaiChoice({ hp, maxHp, choice }))).toMatchObject({
      hpAfter,
      maxHpAfter: maxAfter,
      entersDyingFromHpLoss: dying,
      diesImmediatelyFromZeroMaxHp: zeroMax,
      hpClampedByMaxHpLoss: clamp,
      startsAnotherDiscardPass: false,
    });
  });

  it.each([
    { name: "other living Qun invoked", source: "qun", alive: true, faction: "qun", invoked: true, eligible: true, reason: null },
    { name: "lord self damage", source: "dongzhuo", alive: true, faction: "qun", invoked: true, eligible: false, reason: "not_other_living_qun_source" },
    { name: "other Wei damage", source: "wei", alive: true, faction: "wei", invoked: true, eligible: false, reason: "not_other_living_qun_source" },
    { name: "dead Qun source", source: "qun", alive: false, faction: "qun", invoked: true, eligible: false, reason: "not_other_living_qun_source" },
    { name: "source declined", source: "qun", alive: true, faction: "qun", invoked: false, eligible: false, reason: "source_declined" },
  ] as const)("Baonue handles $name", ({ source, alive, faction, invoked, eligible, reason }) => {
    expect(must(evaluateBaonueTrigger({
      context: skill("dongzhuo"),
      damageSourceId: source,
      damageSourceAlive: alive,
      damageSourceFaction: faction,
      damageEventAmount: 3,
      damageSourceInvoked: invoked,
    }))).toMatchObject({
      eligible,
      judgmentOwnerId: eligible ? source : null,
      triggerCountForDamageEvent: eligible ? 1 : 0,
      reason,
    });
  });

  it.each([
    { hp: 8, maxHp: 8, suit: "spade", succeeded: true, requested: 1, actual: 0 },
    { hp: 6, maxHp: 8, suit: "spade", succeeded: true, requested: 1, actual: 1 },
    { hp: 6, maxHp: 8, suit: "club", succeeded: false, requested: 0, actual: 0 },
  ] as const)("settles Baonue judgment $suit at $hp/$maxHp", ({ hp, maxHp, suit, succeeded, requested, actual }) => {
    expect(must(settleBaonueJudgment({ ownerHp: hp, ownerMaxHp: maxHp, finalEffectiveSuit: suit }))).toEqual({
      skillId: "baonue", succeeded, requestedRecovery: requested, actualRecovery: actual,
    });
  });
});

describe("Jia Xu rules", () => {
  it.each([
    { name: "owner uses Peach", alive: true, effective: true, turn: "jiaxu", user: "jiaxu", dying: "dying", allowed: true, because: "wansha_owner" },
    { name: "dying player self-saves", alive: true, effective: true, turn: "jiaxu", user: "dying", dying: "dying", allowed: true, because: "current_dying_player" },
    { name: "third party rescues", alive: true, effective: true, turn: "jiaxu", user: "helper", dying: "dying", allowed: false, because: null },
    { name: "Jia Xu died mid-turn", alive: false, effective: true, turn: "jiaxu", user: "helper", dying: "dying", allowed: true, because: "restriction_inactive" },
    { name: "skill invalid", alive: true, effective: false, turn: "jiaxu", user: "helper", dying: "dying", allowed: true, because: "restriction_inactive" },
    { name: "another player's turn", alive: true, effective: true, turn: "other", user: "helper", dying: "dying", allowed: true, because: "restriction_inactive" },
  ] as const)("Wansha decides when $name", ({ alive, effective, turn, user, dying, allowed, because }) => {
    expect(must(evaluateWanshaPeach({
      context: { ownerId: "jiaxu", ownerAlive: alive, skillEffective: effective },
      activeTurnPlayerId: turn,
      peachUserId: user,
      currentDyingPlayerId: dying,
      effectiveCardKind: "peach",
    }))).toMatchObject({ allowed, allowedBecause: because });
  });

  it("applies Wansha to the topmost dying frame only", () => {
    const top = must(evaluateWanshaPeach({
      context: skill("jiaxu"), activeTurnPlayerId: "jiaxu", peachUserId: "suspended-dying",
      currentDyingPlayerId: "new-dying", effectiveCardKind: "peach",
    }));
    expect(top.allowed).toBe(false);
  });

  it("rejects non-Peach permission queries", () => {
    expect(evaluateWanshaPeach({
      context: skill("jiaxu"), activeTurnPlayerId: "jiaxu", peachUserId: "x",
      currentDyingPlayerId: "x", effectiveCardKind: "wine",
    })).toMatchObject({ ok: false, code: "invalid_card" });
  });

  it("authorizes one limited Luanwu in its owner's play phase", () => {
    expect(must(evaluateLuanwuActivation({ context: play("jiaxu"), limitedSkillConsumed: false }))).toEqual({
      skillId: "luanwu", ownerId: "jiaxu", consumeLimitedSkill: true,
      actorOrder: "living_seat_order_after_owner", continueAfterOwnerDeath: true,
    });
    expect(evaluateLuanwuActivation({ context: play("jiaxu"), limitedSkillConsumed: true }))
      .toMatchObject({ ok: false, code: "already_used" });
  });

  it("finds nearest players before filtering Slash target legality", () => {
    const plan = must(planLuanwuActor({
      actorId: "actor",
      actorAlive: true,
      actorCanProduceSlash: true,
      candidates: [
        { id: "kongcheng", alive: true, distance: 1, slashTargetLegal: false },
        { id: "far", alive: true, distance: 2, slashTargetLegal: true },
      ],
    }));
    expect(plan).toMatchObject({
      minimumDistance: 1,
      nearestPlayerIds: ["kongcheng"],
      legalSlashTargetIds: [],
      options: ["lose_hp"],
    });
  });

  it("keeps all tied nearest legal targets and offers voluntary HP loss", () => {
    const plan = must(planLuanwuActor({
      actorId: "actor",
      actorAlive: true,
      actorCanProduceSlash: true,
      candidates: [
        { id: "left", alive: true, distance: 1, slashTargetLegal: true },
        { id: "right", alive: true, distance: 1, slashTargetLegal: true },
        { id: "dead", alive: false, distance: 1, slashTargetLegal: true },
      ],
    }));
    expect(plan.legalSlashTargetIds).toEqual(["left", "right"]);
    expect(plan.options).toEqual(["use_slash", "lose_hp"]);
    expect(plan.hpLoss).toEqual({ amount: 1, sourceId: null, isDamage: false });
    expect(plan.slash).toMatchObject({ consumesPlayPhaseSlashQuota: false, zhugeLianNuEffectAllowed: false });
  });

  it.each([
    { name: "no usable Slash", actorAlive: true, canSlash: false, candidates: [{ id: "x", alive: true, distance: 1, slashTargetLegal: true }], options: ["lose_hp"], ended: false },
    { name: "dead actor", actorAlive: false, canSlash: true, candidates: [{ id: "x", alive: true, distance: 1, slashTargetLegal: true }], options: [], ended: true },
    { name: "no other survivor", actorAlive: true, canSlash: true, candidates: [], options: [], ended: true },
  ])("Luanwu handles $name", ({ actorAlive, canSlash, candidates, options, ended }) => {
    expect(must(planLuanwuActor({ actorId: "actor", actorAlive, actorCanProduceSlash: canSlash, candidates })))
      .toMatchObject({ options, noActionBecauseGameEnded: ended });
  });

  it("rejects forged Luanwu distance and duplicate candidate snapshots", () => {
    expect(planLuanwuActor({
      actorId: "actor", actorAlive: true, actorCanProduceSlash: true,
      candidates: [{ id: "x", alive: true, distance: 0, slashTargetLegal: true }],
    }).ok).toBe(false);
    expect(planLuanwuActor({
      actorId: "actor", actorAlive: true, actorCanProduceSlash: true,
      candidates: [{ id: "x", alive: true, distance: 1, slashTargetLegal: true }, { id: "x", alive: true, distance: 2, slashTargetLegal: true }],
    }).ok).toBe(false);
  });

  it.each([
    { mode: "direct_target", category: "trick", suit: "spade", prohibited: true, reason: "black_trick_target" },
    { mode: "global_auto_target", category: "trick", suit: "club", prohibited: true, reason: "black_trick_target" },
    { mode: "delayed_trick_transfer", category: "trick", suit: "spade", prohibited: true, reason: "black_trick_target" },
    { mode: "direct_target", category: "trick", suit: "heart", prohibited: false, reason: "not_black_trick" },
    { mode: "direct_target", category: "basic", suit: "spade", prohibited: false, reason: "not_black_trick" },
    { mode: "nullification_targets_card", category: "trick", suit: "spade", prohibited: false, reason: "not_a_character_target_designation" },
    { mode: "damage_redirect", category: "trick", suit: "spade", prohibited: false, reason: "not_a_character_target_designation" },
    { mode: "color_revealed_after_target_confirmation", category: "trick", suit: "spade", prohibited: false, reason: "not_a_character_target_designation" },
  ] as const)("Weimu resolves $mode / $category / $suit", ({ mode, category, suit, prohibited, reason }) => {
    expect(must(evaluateWeimuTarget({
      context: skill("jiaxu"), candidateTargetId: "jiaxu", cardCategory: category,
      effectiveSuit: suit, targetingMode: mode,
    }))).toMatchObject({ prohibited, reason });
  });
});

describe("Lu Su rules", () => {
  it("adds exactly two cards without replacing the normal draw", () => {
    expect(must(evaluateHaoshiActivation({ context: skill("lusu"), phase: "draw", drawPhaseAvailable: true }))).toEqual({
      skillId: "haoshi", ownerId: "lusu", additionalDrawCount: 2,
      normalDrawPreserved: true, decisionOccursBeforeDrawing: true,
    });
    expect(evaluateHaoshiActivation({ context: skill("lusu"), phase: "draw", drawPhaseAvailable: false }))
      .toMatchObject({ ok: false, code: "wrong_timing" });
  });

  it.each([
    { count: 5, required: false, give: 0 },
    { count: 6, required: true, give: 3 },
    { count: 7, required: true, give: 3 },
    { count: 8, required: true, give: 4 },
  ])("Haoshi with $count hand cards requires=$required and gives $give", ({ count, required, give }) => {
    const analysis = must(analyzeHaoshiTransfer({
      ownerId: "lusu",
      ownerHandCardIds: Array.from({ length: count }, (_, index) => `h${index}`),
      otherPlayers: [{ id: "a", alive: true, handCount: 2 }],
    }));
    expect(analysis).toMatchObject({ transferRequired: required, giveCount: give });
  });

  it("offers every tied minimum-hand living target and ignores dead players", () => {
    expect(must(analyzeHaoshiTransfer({
      ownerId: "lusu",
      ownerHandCardIds: ["1", "2", "3", "4", "5", "6"],
      otherPlayers: [
        { id: "a", alive: true, handCount: 1 },
        { id: "dead", alive: false, handCount: 0 },
        { id: "b", alive: true, handCount: 1 },
        { id: "c", alive: true, handCount: 2 },
      ],
    }))).toMatchObject({ minimumOtherHandCount: 1, eligibleTargetIds: ["a", "b"] });
  });

  it("validates exact Haoshi target and floor-half card partition", () => {
    const base = {
      ownerId: "lusu",
      ownerHandCardIds: ["1", "2", "3", "4", "5", "6", "7"],
      otherPlayers: [{ id: "a", alive: true, handCount: 0 }, { id: "b", alive: true, handCount: 2 }],
    };
    expect(must(validateHaoshiTransferChoice({ ...base, selectedTargetId: "a", selectedCardIds: ["1", "3", "7"] })))
      .toMatchObject({ targetId: "a", transferCardIds: ["1", "3", "7"], atomicTransfer: true });
    expect(validateHaoshiTransferChoice({ ...base, selectedTargetId: "b", selectedCardIds: ["1", "3", "7"] }))
      .toMatchObject({ ok: false, code: "invalid_target" });
    expect(validateHaoshiTransferChoice({ ...base, selectedTargetId: "a", selectedCardIds: ["1", "3"] }))
      .toMatchObject({ ok: false, code: "invalid_choice" });
  });

  it("plans a paid Dimeng hand swap atomically and preserves original-hand loss provenance", () => {
    const input = deepFreeze({
      context: play("lusu"),
      useCountThisPlayPhase: 0,
      targetA: { id: "a", alive: true, handCardIds: ["a1", "a2", "a3"] },
      targetB: { id: "b", alive: true, handCardIds: ["b1"] },
      ownerDiscardableCards: [card({ id: "cost-hand", ownerId: "lusu" }), equipment({ id: "cost-equip", ownerId: "lusu", zone: "equipment" })],
      selectedCostCardIds: ["cost-equip", "cost-hand"],
    });
    const before = structuredClone(input);
    expect(must(planDimeng(input))).toEqual({
      skillId: "dimeng",
      ownerId: "lusu",
      targetIds: ["a", "b"],
      consumePlayPhaseUse: true,
      costCount: 2,
      discardCardIds: ["cost-equip", "cost-hand"],
      handSwapMoves: [
        { cardId: "a1", fromPlayerId: "a", toPlayerId: "b" },
        { cardId: "a2", fromPlayerId: "a", toPlayerId: "b" },
        { cardId: "a3", fromPlayerId: "a", toPlayerId: "b" },
        { cardId: "b1", fromPlayerId: "b", toPlayerId: "a" },
      ],
      atomicHandSwap: true,
      lostAllOriginalHandPlayerIds: ["a", "b"],
    });
    expect(input).toEqual(before);
  });

  it("allows zero-cost Dimeng between equal hand counts", () => {
    expect(must(planDimeng({
      context: play("lusu"), useCountThisPlayPhase: 0,
      targetA: { id: "a", alive: true, handCardIds: [] },
      targetB: { id: "b", alive: true, handCardIds: [] },
      ownerDiscardableCards: [], selectedCostCardIds: [],
    }))).toMatchObject({ costCount: 0, discardCardIds: [], handSwapMoves: [], lostAllOriginalHandPlayerIds: [] });
  });

  it.each([
    { name: "second use", patch: { useCountThisPlayPhase: 1 }, code: "already_used" },
    { name: "self target", patch: { targetA: { id: "lusu", alive: true, handCardIds: [] } }, code: "invalid_target" },
    { name: "duplicate target", patch: { targetB: { id: "a", alive: true, handCardIds: [] } }, code: "invalid_target" },
    { name: "dead target", patch: { targetB: { id: "b", alive: false, handCardIds: [] } }, code: "target_dead" },
    { name: "insufficient cost", patch: { targetA: { id: "a", alive: true, handCardIds: ["1", "2"] } }, code: "insufficient_cards" },
  ])("rejects Dimeng $name", ({ patch, code }) => {
    expect(planDimeng({
      context: play("lusu"), useCountThisPlayPhase: 0,
      targetA: { id: "a", alive: true, handCardIds: [] },
      targetB: { id: "b", alive: true, handCardIds: [] },
      ownerDiscardableCards: [], selectedCostCardIds: [],
      ...patch,
    })).toMatchObject({ ok: false, code });
  });
});

describe("Meng Huo rules", () => {
  it.each([
    {
      name: "first living effective owner",
      owners: [
        { id: "dead", alive: false, skillEffective: true },
        { id: "inactive", alive: true, skillEffective: false },
        { id: "menghuo", alive: true, skillEffective: true },
        { id: "later", alive: true, skillEffective: true },
      ],
      bound: "menghuo",
      initial: "menghuo",
    },
    { name: "no Huoshou owner", owners: [], bound: null, initial: "user" },
    { name: "only inactive owner", owners: [{ id: "menghuo", alive: true, skillEffective: false }], bound: null, initial: "user" },
  ])("Huoshou binds $name", ({ owners, bound, initial }) => {
    expect(must(bindHuoshouSource({ originalCardUserId: "user", huoshouOwners: owners }))).toMatchObject({
      boundHuoshouOwnerId: bound,
      initiallyResolvedDamageSourceId: initial,
      bindingPersistsForEntireCardUse: true,
    });
  });

  it("does not fall back to the original Nanman user after the bound Meng Huo dies", () => {
    const binding = must(bindHuoshouSource({
      originalCardUserId: "user",
      huoshouOwners: [{ id: "menghuo", alive: true, skillEffective: true }],
    }));
    expect(must(resolveHuoshouDamageSource({ binding, boundOwnerStillAlive: true }))).toEqual({
      skillId: "huoshou", damageSourceId: "menghuo", fellBackToOriginalUser: false,
    });
    expect(must(resolveHuoshouDamageSource({ binding, boundOwnerStillAlive: false }))).toEqual({
      skillId: "huoshou", damageSourceId: null, fellBackToOriginalUser: false,
    });
  });

  it("uses the original Nanman user when no Huoshou binding existed", () => {
    const binding = must(bindHuoshouSource({ originalCardUserId: "user", huoshouOwners: [] }));
    expect(must(resolveHuoshouDamageSource({ binding, boundOwnerStillAlive: false }))).toEqual({
      skillId: "huoshou", damageSourceId: "user", fellBackToOriginalUser: true,
    });
  });

  it("rejects duplicate Huoshou owner priority entries", () => {
    expect(bindHuoshouSource({
      originalCardUserId: "user",
      huoshouOwners: [
        { id: "m", alive: true, skillEffective: true },
        { id: "m", alive: true, skillEffective: true },
      ],
    }).ok).toBe(false);
  });

  it.each([
    { kind: "barbarian_invasion", alive: true, effective: true, immune: true },
    { kind: "barbarian_invasion", alive: false, effective: true, immune: false },
    { kind: "barbarian_invasion", alive: true, effective: false, immune: false },
    { kind: "arrow_barrage", alive: true, effective: true, immune: false },
  ] as const)("Huoshou/Juxiang immunity for $kind alive=$alive effective=$effective", ({ kind, alive, effective, immune }) => {
    const input = { targetId: "target", targetAlive: alive, targetHasEffectiveSkill: effective, effectiveCardKind: kind };
    for (const decision of [evaluateHuoshouImmunity(input), evaluateJuxiangImmunity(input)]) {
      expect(must(decision)).toEqual({
        immune,
        preventsCardEffectOnly: true,
        doesNotPreventRedirectedDamage: true,
      });
    }
  });

  it.each([
    { hp: 3, maxHp: 4, reveal: 1 },
    { hp: 1, maxHp: 4, reveal: 3 },
    { hp: 0, maxHp: 4, reveal: 4 },
  ])("old Zaiqi reveals lost HP only: $hp/$maxHp -> $reveal", ({ hp, maxHp, reveal }) => {
    expect(must(evaluateZaiqiActivation({
      context: skill("menghuo"), phase: "draw", drawPhaseAvailable: true,
      ownerHp: hp, ownerMaxHp: maxHp,
    }))).toEqual({
      skillId: "zaiqi", ownerId: "menghuo", replacesNormalDraw: true,
      revealCount: reveal, formula: "lost_hp_without_plus_one",
    });
  });

  it.each([
    { name: "full HP", hp: 4, maxHp: 4, phase: "draw", available: true, code: "condition_not_met" },
    { name: "skipped draw", hp: 3, maxHp: 4, phase: "draw", available: false, code: "wrong_timing" },
    { name: "wrong phase", hp: 3, maxHp: 4, phase: "play", available: true, code: "wrong_timing" },
  ] as const)("rejects Zaiqi at $name", ({ hp, maxHp, phase, available, code }) => {
    expect(evaluateZaiqiActivation({
      context: skill("menghuo"), phase, drawPhaseAvailable: available, ownerHp: hp, ownerMaxHp: maxHp,
    })).toMatchObject({ ok: false, code });
  });

  it("settles printed Hearts as sequential recovery/discard and gains every other card", () => {
    const input = deepFreeze({
      ownerId: "menghuo",
      ownerHp: 1,
      ownerMaxHp: 4,
      revealedCards: [
        { id: "heart-1", printedSuit: "heart" as const },
        { id: "spade", printedSuit: "spade" as const },
        { id: "heart-2", printedSuit: "heart" as const },
      ],
    });
    const before = structuredClone(input);
    expect(must(planZaiqiSettlement(input))).toEqual({
      skillId: "zaiqi",
      ownerId: "menghuo",
      expectedRevealCount: 3,
      heartCardIds: ["heart-1", "heart-2"],
      discardCardIds: ["heart-1", "heart-2"],
      gainCardIds: ["spade"],
      recoverySteps: [
        { cardId: "heart-1", requested: 1, actual: 1 },
        { cardId: "heart-2", requested: 1, actual: 1 },
      ],
      onlyPrintedHeartsCount: true,
    });
    expect(input).toEqual(before);
  });

  it("does not treat an unowned printed Spade as a Heart", () => {
    expect(must(planZaiqiSettlement({
      ownerId: "menghuo", ownerHp: 3, ownerMaxHp: 4,
      revealedCards: [{ id: "spade", printedSuit: "spade" }],
    }))).toMatchObject({ heartCardIds: [], discardCardIds: [], gainCardIds: ["spade"], recoverySteps: [] });
  });

  it("rejects wrong Zaiqi reveal counts, duplicate IDs, and malformed suits", () => {
    expect(planZaiqiSettlement({
      ownerId: "menghuo", ownerHp: 2, ownerMaxHp: 4,
      revealedCards: [{ id: "one", printedSuit: "heart" }],
    })).toMatchObject({ ok: false, code: "invalid_choice" });
    expect(planZaiqiSettlement({
      ownerId: "menghuo", ownerHp: 2, ownerMaxHp: 4,
      revealedCards: [{ id: "same", printedSuit: "heart" }, { id: "same", printedSuit: "club" }],
    }).ok).toBe(false);
    expect(planZaiqiSettlement({
      ownerId: "menghuo", ownerHp: 3, ownerMaxHp: 4,
      revealedCards: [{ id: "one", printedSuit: "joker" as CardSuit }],
    }).ok).toBe(false);
  });
});

describe("Sun Jian rules", () => {
  it.each([
    { mode: "draw_x_discard_one", hp: 2, maxHp: 4, draw: 2, discard: 1 },
    { mode: "draw_one_discard_x", hp: 2, maxHp: 4, draw: 1, discard: 2 },
    { mode: "draw_x_discard_one", hp: 1, maxHp: 4, draw: 3, discard: 1 },
    { mode: "draw_one_discard_x", hp: 1, maxHp: 4, draw: 1, discard: 3 },
  ] as const)("Yinghun $mode at $hp/$maxHp", ({ mode, hp, maxHp, draw, discard }) => {
    expect(must(planYinghun({
      context: skill("sunjian"), phase: "prepare", ownerHp: hp, ownerMaxHp: maxHp,
      targetId: "target", targetAlive: true, mode,
    }))).toMatchObject({
      lostHp: maxHp - hp,
      drawCount: draw,
      requestedDiscardCount: discard,
      discardZones: ["hand", "equipment"],
      sequence: ["draw", "discard_batch"],
    });
  });

  it.each([
    { name: "full owner", patch: { ownerHp: 4 }, code: "condition_not_met" },
    { name: "self target", patch: { targetId: "sunjian" }, code: "invalid_target" },
    { name: "dead target", patch: { targetAlive: false }, code: "target_dead" },
    { name: "wrong phase", patch: { phase: "draw" }, code: "wrong_timing" },
  ])("rejects Yinghun for $name", ({ patch, code }) => {
    expect(planYinghun({
      context: skill("sunjian"), phase: "prepare", ownerHp: 3, ownerMaxHp: 4,
      targetId: "target", targetAlive: true, mode: "draw_x_discard_one",
      ...patch,
    })).toMatchObject({ ok: false, code });
  });

  it("discards exactly the requested hand/equipment cards as one batch", () => {
    const available = [
      card({ id: "h", ownerId: "target" }),
      equipment({ id: "e", ownerId: "target", zone: "equipment" }),
    ];
    expect(must(planYinghunDiscard({
      targetId: "target", requestedDiscardCount: 2, availableCards: available, selectedCardIds: ["e", "h"],
    }))).toEqual({
      skillId: "yinghun", targetId: "target", requestedDiscardCount: 2, actualDiscardCount: 2,
      discardCardIds: ["e", "h"], unfulfilledDiscardCount: 0,
      atomicSingleBatch: true, noFurtherDiscardAfterBatchTriggers: true,
    });
  });

  it("discards all available cards once when fewer than X exist", () => {
    expect(must(planYinghunDiscard({
      targetId: "target", requestedDiscardCount: 4,
      availableCards: [card({ id: "only", ownerId: "target" })], selectedCardIds: ["only"],
    }))).toMatchObject({ actualDiscardCount: 1, unfulfilledDiscardCount: 3, noFurtherDiscardAfterBatchTriggers: true });
  });

  it("rejects judgment cards and incorrect discard partitions", () => {
    expect(planYinghunDiscard({
      targetId: "target", requestedDiscardCount: 1,
      availableCards: [card({ id: "judge", ownerId: "target", kind: "le_bu_si_shu", category: "trick", zone: "judgment" })],
      selectedCardIds: ["judge"],
    })).toMatchObject({ ok: false, code: "invalid_card" });
    expect(planYinghunDiscard({
      targetId: "target", requestedDiscardCount: 2,
      availableCards: [card({ id: "a", ownerId: "target" }), card({ id: "b", ownerId: "target" })],
      selectedCardIds: ["a"],
    })).toMatchObject({ ok: false, code: "invalid_choice" });
  });
});

describe("Xu Huang rules", () => {
  const base = {
    context: play("xuhuang"),
    card: card({ ownerId: "xuhuang", printedSuit: "club" }),
    effectiveSuit: "club" as const,
    targetId: "target",
    targetAlive: true,
    distance: 2,
    targetLegalIgnoringDistance: true,
    targetAlreadyHasSupplyShortage: false,
  };

  it.each([
    { name: "black basic hand card at distance 1", patch: { distance: 1 }, from: "card-1" },
    { name: "black basic hand card at distance 2", patch: {}, from: "card-1" },
    {
      name: "black equipped card at distance 2",
      patch: { card: equipment({ id: "weapon", ownerId: "xuhuang", zone: "equipment", printedSuit: "spade" }), effectiveSuit: "spade" },
      from: "weapon",
    },
  ])("Duanliang accepts $name", ({ patch, from }) => {
    expect(must(evaluateDuanliang({ ...base, ...patch }))).toEqual({
      skillId: "duanliang", ownerId: "xuhuang", targetId: "target", physicalCardId: from,
      effectiveKind: "bing_liang_cun_duan", maximumDistance: 2,
      retainsPhysicalSuitAndRank: true, unlimitedUsesPerPlayPhase: true,
    });
  });

  it.each([
    { name: "effective red card", patch: { effectiveSuit: "heart" }, code: "invalid_card" },
    { name: "trick cost", patch: { card: card({ ownerId: "xuhuang", kind: "duel", category: "trick" }) }, code: "invalid_card" },
    { name: "distance three", patch: { distance: 3 }, code: "out_of_range" },
    { name: "self target", patch: { targetId: "xuhuang" }, code: "invalid_target" },
    { name: "dead target", patch: { targetAlive: false }, code: "target_dead" },
    { name: "normal target illegality", patch: { targetLegalIgnoringDistance: false }, code: "invalid_target" },
    { name: "duplicate Supply Shortage", patch: { targetAlreadyHasSupplyShortage: true }, code: "invalid_target" },
  ])("Duanliang rejects $name", ({ patch, code }) => {
    expect(evaluateDuanliang({ ...base, ...patch } as typeof base)).toMatchObject({ ok: false, code });
  });
});

describe("Zhu Rong rules", () => {
  it("mandatorily claims another player's one physical Nanman at card finish", () => {
    expect(must(planJuxiangClaim({
      context: skill("zhurong"),
      cardUserId: "other",
      effectiveCardKind: "barbarian_invasion",
      physicalCards: [card({
        id: "nanman", kind: "barbarian_invasion", category: "trick", ownerId: null, zone: "processing",
      })],
      cardStillInProcessing: true,
      wouldOtherwiseEnterDiscard: true,
      claimedByEarlierJuxiang: false,
    }))).toEqual({
      skillId: "juxiang", ownerId: "zhurong", physicalCardId: "nanman",
      mandatory: true, timing: "card_finished_before_discard",
    });
  });

  it.each([
    { name: "own Nanman", patch: { cardUserId: "zhurong" }, code: "condition_not_met" },
    { name: "converted non-Nanman physical card", patch: { physicalCards: [card({ id: "fake", kind: "dodge", ownerId: null, zone: "processing" })] }, code: "invalid_card" },
    { name: "virtual multi-card Nanman", patch: { physicalCards: [card({ id: "a", kind: "barbarian_invasion", category: "trick", ownerId: null, zone: "processing" }), card({ id: "b", kind: "barbarian_invasion", category: "trick", ownerId: null, zone: "processing" })] }, code: "invalid_card" },
    { name: "card already taken", patch: { cardStillInProcessing: false }, code: "condition_not_met" },
    { name: "not entering discard", patch: { wouldOtherwiseEnterDiscard: false }, code: "condition_not_met" },
    { name: "earlier Juxiang claimed it", patch: { claimedByEarlierJuxiang: true }, code: "condition_not_met" },
  ])("Juxiang rejects $name", ({ patch, code }) => {
    expect(planJuxiangClaim({
      context: skill("zhurong"), cardUserId: "other", effectiveCardKind: "barbarian_invasion",
      physicalCards: [card({ id: "nanman", kind: "barbarian_invasion", category: "trick", ownerId: null, zone: "processing" })],
      cardStillInProcessing: true, wouldOtherwiseEnterDiscard: true, claimedByEarlierJuxiang: false,
      ...patch,
    })).toMatchObject({ ok: false, code });
  });

  it.each([
    { name: "ordinary Slash damage", slash: true, target: "target", alive: true, ownerHand: 1, targetHand: 1, eligible: true, reason: null },
    { name: "chain damage derived from elemental Slash", slash: true, target: "chain-target", alive: true, ownerHand: 1, targetHand: 2, eligible: true, reason: null },
    { name: "non-Slash damage", slash: false, target: "target", alive: true, ownerHand: 1, targetHand: 1, eligible: false, reason: "not_slash_caused_damage" },
    { name: "dead target", slash: true, target: "target", alive: false, ownerHand: 1, targetHand: 1, eligible: false, reason: "target_not_other_living" },
    { name: "self target", slash: true, target: "zhurong", alive: true, ownerHand: 1, targetHand: 1, eligible: false, reason: "target_not_other_living" },
    { name: "owner has no hand", slash: true, target: "target", alive: true, ownerHand: 0, targetHand: 1, eligible: false, reason: "pindian_hand_missing" },
    { name: "target has no hand", slash: true, target: "target", alive: true, ownerHand: 1, targetHand: 0, eligible: false, reason: "pindian_hand_missing" },
  ])("Lieren handles $name", ({ slash, target, alive, ownerHand, targetHand, eligible, reason }) => {
    expect(must(evaluateLierenTrigger({
      context: skill("zhurong"), damageTargetId: target, damageTargetAlive: alive,
      damageEventAmount: 3, causedBySlashUseOrItsChainDamage: slash,
      ownerHandCountAfterDamage: ownerHand, targetHandCountAfterDamage: targetHand,
    }))).toMatchObject({
      eligible,
      triggerCountForDamageEvent: eligible ? 1 : 0,
      chainDamageEligible: true,
      reason,
    });
  });

  it.each([
    { ownerRank: 13, targetRank: 12, won: true },
    { ownerRank: 7, targetRank: 7, won: false },
    { ownerRank: 1, targetRank: 2, won: false },
  ])("Lieren pindian $ownerRank vs $targetRank => won=$won", ({ ownerRank, targetRank, won }) => {
    expect(must(resolveLierenPindian({
      ownerId: "zhurong",
      targetId: "target",
      ownerCard: card({ id: "owner-card", ownerId: "zhurong", rank: ownerRank }),
      targetCard: card({ id: "target-card", ownerId: "target", rank: targetRank }),
    }))).toMatchObject({
      discardPindianCardIds: ["owner-card", "target-card"],
      ownerWon: won,
      tieCountsAsOwnerNotWinning: true,
      mayGainTargetCard: won,
    });
  });

  it("rejects non-hand and virtual pindian cards", () => {
    expect(resolveLierenPindian({
      ownerId: "zhurong", targetId: "target",
      ownerCard: equipment({ ownerId: "zhurong", zone: "equipment" }),
      targetCard: card({ id: "target-card", ownerId: "target" }),
    })).toMatchObject({ ok: false, code: "invalid_card" });
    expect(resolveLierenPindian({
      ownerId: "zhurong", targetId: "target",
      ownerCard: card({ ownerId: "zhurong", physical: false }),
      targetCard: card({ id: "target-card", ownerId: "target" }),
    })).toMatchObject({ ok: false, code: "invalid_card" });
  });

  it.each([
    { name: "winning gain from hand", won: true, selected: card({ id: "gain", ownerId: "target" }), gain: "gain", zone: "hand", ok: true },
    { name: "winning gain from equipment", won: true, selected: equipment({ id: "gain", ownerId: "target", zone: "equipment" }), gain: "gain", zone: "equipment", ok: true },
    { name: "non-winning no gain", won: false, selected: null, gain: null, zone: null, ok: true },
    { name: "non-winning forged gain", won: false, selected: card({ id: "gain", ownerId: "target" }), gain: null, zone: null, ok: false },
    { name: "winning judgment-zone gain", won: true, selected: card({ id: "judge", ownerId: "target", kind: "le_bu_si_shu", category: "trick", zone: "judgment" }), gain: null, zone: null, ok: false },
  ])("Lieren plans $name", ({ won, selected, gain, zone, ok }) => {
    const result = planLierenGain({ ownerId: "zhurong", targetId: "target", pindianWon: won, selectedCard: selected });
    expect(result.ok).toBe(ok);
    if (ok) expect(must(result)).toMatchObject({ gainCardId: gain, fromZone: zone });
  });
});

describe("Forest runtime fail-closed and JSON contract", () => {
  it("rejects forged kind/category, rank, slot, ownership, and suit values", () => {
    const forgedCategory = card({ kind: "dodge", category: "equipment" as CardCategory });
    expect(evaluateJiuchi({
      context: skill("owner"), method: "use", card: forgedCategory, effectiveSuit: "spade", wineTimingLegal: true,
    }).ok).toBe(false);

    const forgedRank = card({ rank: 14 as never });
    expect(evaluateDuanliang({
      context: play("owner"), card: forgedRank, effectiveSuit: "spade", targetId: "target",
      targetAlive: true, distance: 1, targetLegalIgnoringDistance: true, targetAlreadyHasSupplyShortage: false,
    }).ok).toBe(false);

    const forgedSlot = card({ equipmentSlot: "armor" as EquipmentSlot });
    expect(evaluateJiuchi({
      context: skill("owner"), method: "use", card: forgedSlot, effectiveSuit: "spade", wineTimingLegal: true,
    }).ok).toBe(false);

    expect(evaluateSongwei({
      context: skill("caopi"), judgedPlayerId: "wei", judgedPlayerAlive: true,
      judgedPlayerFaction: "unknown" as Faction, judgmentEffectiveSuit: "spade",
      finalJudgmentResult: true, judgedPlayerInvoked: true,
    }).ok).toBe(false);
  });

  it("returns only JSON-safe values across representative nested plans", () => {
    const decisions = [
      planXingshang({
        context: skill("caopi"), deadPlayerId: "dead", decision: "claim", privateCardsRevealedBeforeDecision: false,
        deadZones: { handCardIds: ["h"], equipmentCardIds: [], judgmentCardIds: [], extraPileCardIds: [] },
      }),
      planLuanwuActor({
        actorId: "a", actorAlive: true, actorCanProduceSlash: true,
        candidates: [{ id: "b", alive: true, distance: 1, slashTargetLegal: true }],
      }),
      planDimeng({
        context: play("lusu"), useCountThisPlayPhase: 0,
        targetA: { id: "a", alive: true, handCardIds: ["a1"] },
        targetB: { id: "b", alive: true, handCardIds: ["b1"] },
        ownerDiscardableCards: [], selectedCostCardIds: [],
      }),
      planZaiqiSettlement({
        ownerId: "menghuo", ownerHp: 3, ownerMaxHp: 4,
        revealedCards: [{ id: "h", printedSuit: "heart" }],
      }),
    ];
    for (const decision of decisions) {
      expect(JSON.parse(JSON.stringify(decision))).toEqual(decision);
      expect(JSON.stringify(decision)).not.toContain("undefined");
    }
  });

  it("never mutates caller-owned arrays while validating failures", () => {
    const input = deepFreeze({
      context: play("lusu"),
      useCountThisPlayPhase: 0,
      targetA: { id: "a", alive: true, handCardIds: ["a1", "a2"] },
      targetB: { id: "b", alive: true, handCardIds: [] },
      ownerDiscardableCards: [card({ id: "only", ownerId: "lusu" })],
      selectedCostCardIds: ["only"],
    });
    const before = structuredClone(input);
    expect(planDimeng(input).ok).toBe(false);
    expect(input).toEqual(before);
  });

  it("rejects unknown runtime card kinds instead of trusting compile-time unions", () => {
    const unknown = card({ kind: "unknown" as CardKind });
    expect(evaluateJiuchi({
      context: skill("owner"), method: "use", card: unknown, effectiveSuit: "spade", wineTimingLegal: true,
    }).ok).toBe(false);
  });
});
