import { describe, expect, it } from "vitest";

import type { CardCategory, CardSuit, EquipmentSlot } from "../src/types.js";
import {
  evaluateBazhen,
  evaluateHuoji,
  evaluateJiemingPoint,
  evaluateKanpo,
  evaluateLianhuan,
  evaluateLuanji,
  evaluateMengjin,
  evaluateQiangxi,
  evaluateQuhuTargets,
  evaluateShuangxiong,
  evaluateTianyi,
  evaluateXueyi,
  planNiepan,
  planQuhuDamage,
  type FirePlayContext,
  type FireRuleCard,
  type FireRuleResult,
} from "../src/skills/fire-runtime.js";

function playContext(overrides: Partial<FirePlayContext> = {}): FirePlayContext {
  return {
    actorId: "owner",
    currentPlayerId: "owner",
    phase: "play",
    actorAlive: true,
    skillEffective: true,
    ...overrides,
  };
}

function card(
  id: string,
  suit: CardSuit,
  options: {
    readonly ownerId?: string;
    readonly zone?: FireRuleCard["zone"];
    readonly category?: CardCategory;
    readonly equipmentSlot?: EquipmentSlot | null;
  } = {},
): FireRuleCard {
  const equipmentSlot = options.equipmentSlot ?? null;
  return {
    id,
    ownerId: options.ownerId ?? "owner",
    zone: options.zone ?? "hand",
    suit,
    category: options.category ?? (equipmentSlot === null ? "basic" : "equipment"),
    equipmentSlot,
  };
}

function weapon(id: string, zone: "hand" | "equipment" = "hand", ownerId = "owner"): FireRuleCard {
  return card(id, "spade", { ownerId, zone, category: "equipment", equipmentSlot: "weapon" });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function pure<TInput, TOutput>(input: TInput, invoke: () => FireRuleResult<TOutput>): FireRuleResult<TOutput> {
  const before = JSON.stringify(input);
  deepFreeze(input);
  const result = invoke();
  expect(JSON.stringify(input)).toBe(before);
  expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  return result;
}

function valueOf<T>(result: FireRuleResult<T>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`${result.code}: ${result.detail}`);
  return result.value;
}

function expectFailure<T>(result: FireRuleResult<T>, code: string): void {
  expect(result).toMatchObject({ ok: false, code });
}

describe("fire package pure runtime", () => {
  describe("Qiangxi", () => {
    it.each([
      { label: "loses HP", payment: { type: "lose_hp" as const }, expected: { type: "lose_hp", amount: 1, mayEnterDying: true } },
      { label: "discards a hand Weapon", payment: { type: "discard_weapon" as const, card: weapon("hand-weapon") }, expected: { type: "discard_weapon", cardId: "hand-weapon", from: "hand" } },
      { label: "discards an equipped Weapon", payment: { type: "discard_weapon" as const, card: weapon("equipped-weapon", "equipment") }, expected: { type: "discard_weapon", cardId: "equipped-weapon", from: "equipment" } },
    ])("accepts $label without mutating its input", ({ payment, expected }) => {
      const input = {
        context: playContext(),
        alreadyUsedThisTurn: false,
        actorHp: 1,
        targetId: "target",
        targetAlive: true,
        distanceBeforePayment: 3,
        attackRangeBeforePayment: 3,
        payment,
      };
      const plan = valueOf(pure(input, () => evaluateQiangxi(input)));
      expect(plan.payment).toEqual(expected);
      expect(plan).toMatchObject({
        consumeTurnUse: true,
        distanceCheckedBeforePayment: true,
        damage: { sourceId: "owner", targetId: "target", amount: 1, nature: "normal" },
      });
    });

    it.each([
      ["already used", { alreadyUsedThisTurn: true }, "already_used"],
      ["out of pre-payment range", { distanceBeforePayment: 4 }, "out_of_range"],
      ["self target", { targetId: "owner" }, "invalid_target"],
      ["dead target", { targetAlive: false }, "target_dead"],
    ] as const)("rejects %s", (_label, overrides, code) => {
      const input = {
        context: playContext(),
        alreadyUsedThisTurn: false,
        actorHp: 3,
        targetId: "target",
        targetAlive: true,
        distanceBeforePayment: 2,
        attackRangeBeforePayment: 3,
        payment: { type: "lose_hp" as const },
        ...overrides,
      };
      expectFailure(pure(input, () => evaluateQiangxi(input)), code);
    });

    it("rejects non-Weapon, foreign, and judgment-zone Weapon payments", () => {
      const badCards = [
        card("armor", "club", { category: "equipment", equipmentSlot: "armor" }),
        weapon("foreign", "hand", "other"),
        card("judgment-weapon", "spade", { zone: "judgment", category: "equipment", equipmentSlot: "weapon" }),
      ];
      for (const badCard of badCards) {
        const input = {
          context: playContext(), alreadyUsedThisTurn: false, actorHp: 3,
          targetId: "target", targetAlive: true, distanceBeforePayment: 1, attackRangeBeforePayment: 1,
          payment: { type: "discard_weapon" as const, card: badCard },
        };
        expectFailure(pure(input, () => evaluateQiangxi(input)), "invalid_payment");
      }
    });
  });

  describe("Mengjin", () => {
    function input() {
      return {
        skillOwnerId: "owner",
        skillOwnerAlive: true,
        skillEffective: true,
        targetId: "target",
        targetAlive: true,
        dodge: {
          requiredCount: 2,
          successfulCountBefore: 1,
          thisDodgeSucceeded: true,
          finalSlashOutcome: "dodged" as const,
          forcedHitAfterDodge: false,
        },
        targetCards: [
          card("hand", "heart", { ownerId: "target" }),
          weapon("equipment", "equipment", "target"),
          card("judgment", "club", { ownerId: "target", zone: "judgment", category: "trick" }),
        ],
      };
    }

    it("only exposes target hand/equipment cards after the final required Dodge", () => {
      const facts = input();
      const plan = valueOf(pure(facts, () => evaluateMengjin(facts)));
      expect(plan.candidateCardIds).toEqual(["hand", "equipment"]);
      expect(plan.candidateZones).toEqual(["hand", "equipment"]);
    });

    it.each([
      ["earlier Dodge", { successfulCountBefore: 0, finalSlashOutcome: "pending" as const, forcedHitAfterDodge: false }],
      ["failed response", { successfulCountBefore: 1, thisDodgeSucceeded: false, finalSlashOutcome: "hit" as const }],
      ["Guanshi forced hit", { successfulCountBefore: 1, finalSlashOutcome: "hit" as const, forcedHitAfterDodge: true }],
    ])("does not trigger for %s", (_label, dodgeOverrides) => {
      const facts = input();
      const altered = { ...facts, dodge: { ...facts.dodge, ...dodgeOverrides } };
      expectFailure(pure(altered, () => evaluateMengjin(altered)), "invalid_timing");
    });

    it("rejects a dead target and a target with only judgment cards", () => {
      const dead = { ...input(), targetAlive: false };
      expectFailure(pure(dead, () => evaluateMengjin(dead)), "target_dead");
      const judgmentOnly = { ...input(), targetCards: [card("j", "spade", { ownerId: "target", zone: "judgment", category: "trick" })] };
      expectFailure(pure(judgmentOnly, () => evaluateMengjin(judgmentOnly)), "no_candidate");
    });
  });

  describe("Lianhuan", () => {
    const clubHand = card("club", "club");
    const target = (playerId: string) => ({ playerId, alive: true, canBeTargetedByIronChain: true });

    it.each([
      [0, "recast", []],
      [1, "use", ["owner"]],
      [2, "use", ["owner", "target"]],
    ] as const)("maps %i selected targets to %s", (count, mode, targetIds) => {
      const targets = targetIds.map(target);
      const input = { context: playContext(), card: clubHand, targets };
      const plan = valueOf(pure(input, () => evaluateLianhuan(input)));
      expect(plan).toMatchObject({ mode, targetIds: [...targetIds] });
      expect(targets).toHaveLength(count);
    });

    it("rejects more than two, duplicate, dead, and prohibited targets", () => {
      const targetLists = [
        [target("a"), target("b"), target("c")],
        [target("a"), target("a")],
        [{ ...target("a"), alive: false }],
        [{ ...target("a"), canBeTargetedByIronChain: false }],
      ];
      for (const targets of targetLists) {
        const input = { context: playContext(), card: clubHand, targets };
        expect(pure(input, () => evaluateLianhuan(input)).ok).toBe(false);
      }
    });

    it("requires a Club card from hand", () => {
      for (const badCard of [card("spade", "spade"), weapon("club-equipment", "equipment")]) {
        const input = { context: playContext(), card: badCard, targets: [] };
        expectFailure(pure(input, () => evaluateLianhuan(input)), "invalid_card");
      }
    });
  });

  describe("Tianyi", () => {
    function input(initiatorRank: 1 | 5 | 8 | 10, targetRank: 5 | 8 | 10) {
      return {
        context: playContext(),
        alreadyUsedThisTurn: false,
        pindian: { initiatorId: "owner", targetId: "target", initiatorRank, targetRank },
        baseSlashPolicy: { useLimit: 1, usesSoFar: 1, ignoresDistance: false, maxTargets: 3 },
      };
    }

    it.each([
      [10, 5, "win", 2, 4, true, false, true],
      [5, 10, "loss", 1, 3, false, true, false],
      [8, 8, "tie", 1, 3, false, true, false],
    ] as const)("turn result %i vs %i is %s", (ownerRank, targetRank, outcome, limit, maxTargets, ignoreDistance, prohibited, canUse) => {
      const facts = input(ownerRank, targetRank);
      const modifier = valueOf(pure(facts, () => evaluateTianyi(facts)));
      expect(modifier.outcome).toBe(outcome);
      expect(modifier.effectiveSlashPolicy).toEqual({
        useLimit: limit,
        usesSoFar: 1,
        ignoresDistance: ignoreDistance,
        maxTargets,
        activeSlashProhibited: prohibited,
        canUseAnotherActiveSlash: canUse,
      });
      expect(modifier.modifier.prohibitResponseSlash).toBe(false);
    });

    it("keeps an unlimited Crossbow-style base limit unlimited while adding range and a target", () => {
      const facts = { ...input(10, 5), baseSlashPolicy: { useLimit: null, usesSoFar: 20, ignoresDistance: false, maxTargets: 1 } };
      const modifier = valueOf(pure(facts, () => evaluateTianyi(facts)));
      expect(modifier.effectiveSlashPolicy).toMatchObject({ useLimit: null, maxTargets: 2, ignoresDistance: true, canUseAnotherActiveSlash: true });
    });

    it("rejects a replay and malformed Pindian participants", () => {
      const replay = { ...input(10, 5), alreadyUsedThisTurn: true };
      expectFailure(pure(replay, () => evaluateTianyi(replay)), "already_used");
      const wrongInitiator = { ...input(10, 5), pindian: { initiatorId: "other", targetId: "target", initiatorRank: 10 as const, targetRank: 5 as const } };
      expectFailure(pure(wrongInitiator, () => evaluateTianyi(wrongInitiator)), "invalid_target");
    });
  });

  describe("Bazhen", () => {
    it("acts as optional Bagua only with an empty, effective armor slot", () => {
      const input = { ownerId: "owner", ownerAlive: true, skillEffective: true, actualArmor: null, armorEffectsIgnored: false };
      expect(valueOf(pure(input, () => evaluateBazhen(input)))).toEqual({
        skillId: "bazhen", ownerId: "owner", treatedAs: "ba_gua_zhen", optionalActivation: true,
      });
    });

    it.each([
      ["actual armor", { actualArmor: card("armor", "club", { zone: "equipment", category: "equipment", equipmentSlot: "armor" }) }, "armor_present"],
      ["Qinggang/armor invalidation", { armorEffectsIgnored: true }, "armor_ignored"],
      ["skill suppression", { skillEffective: false }, "skill_not_effective"],
      ["death", { ownerAlive: false }, "owner_dead"],
    ] as const)("rejects %s", (_label, overrides, code) => {
      const input = { ownerId: "owner", ownerAlive: true, skillEffective: true, actualArmor: null, armorEffectsIgnored: false, ...overrides };
      expectFailure(pure(input, () => evaluateBazhen(input)), code);
    });
  });

  describe("Huoji", () => {
    it("allows Fire Attack to target its owner when another hand card remains", () => {
      const input = {
        context: playContext(),
        card: card("cost", "heart"),
        target: { playerId: "owner", alive: true, canBeTargetedByFireAttack: true, handCardIds: ["cost", "reveal"] },
      };
      expect(valueOf(pure(input, () => evaluateHuoji(input)))).toMatchObject({
        virtualCard: "fire_attack", targetId: "owner", selfTarget: true, targetHandCountAfterPayment: 1,
      });
    });

    it("allows another living target with a hand card", () => {
      const input = {
        context: playContext(),
        card: card("cost", "diamond"),
        target: { playerId: "target", alive: true, canBeTargetedByFireAttack: true, handCardIds: ["hidden"] },
      };
      expect(valueOf(pure(input, () => evaluateHuoji(input))).selfTarget).toBe(false);
    });

    it.each([
      ["last self hand card", card("cost", "heart"), { playerId: "owner", alive: true, canBeTargetedByFireAttack: true, handCardIds: ["cost"] }, "invalid_target"],
      ["black cost", card("cost", "spade"), { playerId: "target", alive: true, canBeTargetedByFireAttack: true, handCardIds: ["hidden"] }, "invalid_card"],
      ["equipped red cost", card("cost", "diamond", { zone: "equipment", category: "equipment", equipmentSlot: "weapon" }), { playerId: "target", alive: true, canBeTargetedByFireAttack: true, handCardIds: ["hidden"] }, "invalid_card"],
      ["dead target", card("cost", "heart"), { playerId: "target", alive: false, canBeTargetedByFireAttack: true, handCardIds: ["hidden"] }, "target_dead"],
    ] as const)("rejects %s", (_label, cost, target, code) => {
      const input = { context: playContext(), card: cost, target };
      expectFailure(pure(input, () => evaluateHuoji(input)), code);
    });
  });

  describe("Kanpo", () => {
    it.each(["spade", "club"] as const)("converts a %s hand card in an open response window", (suit) => {
      const input = {
        ownerId: "owner", responderId: "owner", ownerAlive: true, skillEffective: true,
        nullificationWindowOpen: true, card: card("cost", suit),
      };
      expect(valueOf(pure(input, () => evaluateKanpo(input)))).toMatchObject({ cardId: "cost", virtualCard: "wu_xie_ke_ji" });
    });

    it.each([
      ["red card", { card: card("cost", "heart") }, "invalid_card"],
      ["equipped black card", { card: weapon("cost", "equipment") }, "invalid_card"],
      ["closed window", { nullificationWindowOpen: false }, "invalid_timing"],
      ["wrong responder", { responderId: "other" }, "invalid_timing"],
    ] as const)("rejects %s", (_label, overrides, code) => {
      const input = {
        ownerId: "owner", responderId: "owner", ownerAlive: true, skillEffective: true,
        nullificationWindowOpen: true, card: card("cost", "club"), ...overrides,
      };
      expectFailure(pure(input, () => evaluateKanpo(input)), code);
    });
  });

  describe("Quhu", () => {
    function targetsInput() {
      return {
        context: playContext(),
        alreadyUsedThisTurn: false,
        actorHp: 3,
        opponent: { playerId: "opponent", alive: true, hp: 4, handCount: 2, canPindian: true, attackRange: 2 },
        damageTarget: { playerId: "victim", alive: true, canReceiveDamage: true, distanceFromOpponent: 2 },
      };
    }

    it("validates and preserves the ordered opponent/victim pair before Pindian", () => {
      const input = targetsInput();
      expect(valueOf(pure(input, () => evaluateQuhuTargets(input)))).toEqual({
        skillId: "quhu",
        ownerId: "owner",
        opponentId: "opponent",
        damageTargetId: "victim",
        orderedTargetIds: ["opponent", "victim"],
        consumeTurnUse: true,
        beginPindian: { initiatorId: "owner", targetId: "opponent" },
      });
    });

    it.each([
      ["equal HP", { opponent: { ...targetsInput().opponent, hp: 3 } }, "invalid_target"],
      ["opponent has no hand", { opponent: { ...targetsInput().opponent, handCount: 0 } }, "invalid_target"],
      ["victim is owner", { damageTarget: { ...targetsInput().damageTarget, playerId: "owner" } }, "invalid_target"],
      ["victim is opponent", { damageTarget: { ...targetsInput().damageTarget, playerId: "opponent" } }, "invalid_target"],
      ["victim out of range", { damageTarget: { ...targetsInput().damageTarget, distanceFromOpponent: 3 } }, "out_of_range"],
      ["dead victim", { damageTarget: { ...targetsInput().damageTarget, alive: false } }, "target_dead"],
    ] as const)("rejects %s", (_label, overrides, code) => {
      const input = { ...targetsInput(), ...overrides };
      expectFailure(pure(input, () => evaluateQuhuTargets(input)), code);
    });

    it.each([
      [10, 5, "win", "victim"],
      [5, 10, "loss", "owner"],
      [8, 8, "tie", "owner"],
    ] as const)("routes %i vs %i as %s damage", (ownerRank, targetRank, outcome, damageTargetId) => {
      const input = {
        ownerId: "owner", opponentId: "opponent", damageTargetId: "victim",
        ownerAlive: true, opponentAlive: true, damageTargetAlive: true,
        pindian: { initiatorId: "owner", targetId: "opponent", initiatorRank: ownerRank, targetRank },
      };
      const plan = valueOf(pure(input, () => planQuhuDamage(input)));
      expect(plan.pindianOutcome).toBe(outcome);
      expect(plan.damage).toEqual({ sourceId: "opponent", targetId: damageTargetId, amount: 1, nature: "normal" });
    });

    it.each([
      ["dead owner", { ownerAlive: false }, "owner_dead"],
      ["dead opponent", { opponentAlive: false }, "target_dead"],
      ["dead victim", { damageTargetAlive: false }, "target_dead"],
    ] as const)("fails closed if resolution sees a %s", (_label, overrides, code) => {
      const input = {
        ownerId: "owner", opponentId: "opponent", damageTargetId: "victim",
        ownerAlive: true, opponentAlive: true, damageTargetAlive: true,
        pindian: { initiatorId: "owner", targetId: "opponent", initiatorRank: 10 as const, targetRank: 5 as const },
        ...overrides,
      };
      expectFailure(pure(input, () => planQuhuDamage(input)), code);
    });
  });

  describe("Jieming", () => {
    it.each([
      [3, 1, 3, 2],
      [7, 1, 5, 4],
      [4, 4, 4, 0],
      [4, 6, 4, 0],
    ] as const)("max HP %i and hand %i produces target %i and draw %i", (maxHp, handCount, targetHandSize, drawCount) => {
      const input = {
        ownerId: "owner", ownerAliveAfterDamage: true, damageAftermathSettled: true,
        damageAmount: 2, damagePoint: 2,
        target: { playerId: "target", alive: true, maxHp, handCount },
      };
      expect(valueOf(pure(input, () => evaluateJiemingPoint(input)))).toMatchObject({
        damagePoint: 2, targetHandSize, drawCount, optional: true,
      });
    });

    it.each([
      ["dead owner", { ownerAliveAfterDamage: false }, "owner_dead"],
      ["unsettled dying", { damageAftermathSettled: false }, "invalid_timing"],
      ["dead target", { target: { playerId: "target", alive: false, maxHp: 4, handCount: 0 } }, "target_dead"],
      ["point beyond damage", { damagePoint: 3 }, "invalid_input"],
    ] as const)("rejects %s", (_label, overrides, code) => {
      const input = {
        ownerId: "owner", ownerAliveAfterDamage: true, damageAftermathSettled: true,
        damageAmount: 2, damagePoint: 1,
        target: { playerId: "target", alive: true, maxHp: 4, handCount: 0 }, ...overrides,
      };
      expectFailure(pure(input, () => evaluateJiemingPoint(input)), code);
    });
  });

  describe("Shuangxiong", () => {
    it.each([
      ["heart", "spade", "red", "black"],
      ["diamond", "club", "red", "black"],
      ["spade", "heart", "black", "red"],
      ["club", "diamond", "black", "red"],
    ] as const)("final %s judgment accepts opposite %s", (judgmentSuit, costSuit, judgmentColor, requiredColor) => {
      const input = { context: playContext(), activatedThisTurn: true, finalJudgmentSuit: judgmentSuit, card: card("cost", costSuit) };
      expect(valueOf(pure(input, () => evaluateShuangxiong(input)))).toMatchObject({
        virtualCard: "duel", finalJudgmentColor: judgmentColor, requiredCardColor: requiredColor,
      });
    });

    it("rejects the same color, a non-hand card, and a missing draw replacement", () => {
      const cases = [
        { context: playContext(), activatedThisTurn: true, finalJudgmentSuit: "heart" as const, card: card("cost", "diamond") },
        { context: playContext(), activatedThisTurn: true, finalJudgmentSuit: "heart" as const, card: weapon("cost", "equipment") },
        { context: playContext(), activatedThisTurn: false, finalJudgmentSuit: "heart" as const, card: card("cost", "spade") },
      ];
      for (const input of cases) expect(pure(input, () => evaluateShuangxiong(input)).ok).toBe(false);
    });
  });

  describe("Luanji", () => {
    it("accepts two distinct hand cards of exactly the same suit", () => {
      const input = { context: playContext(), cards: [card("one", "club"), card("two", "club")] };
      expect(valueOf(pure(input, () => evaluateLuanji(input)))).toEqual({
        skillId: "luanji", ownerId: "owner", cardIds: ["one", "two"], suit: "club", virtualCard: "arrow_barrage",
      });
    });

    it.each([
      ["same color but different suits", [card("one", "heart"), card("two", "diamond")]],
      ["same physical card twice", [card("one", "club"), card("one", "club")]],
      ["an equipped card", [card("one", "club"), weapon("two", "equipment")]],
      ["only one card", [card("one", "club")]],
    ] as const)("rejects %s", (_label, cards) => {
      const input = { context: playContext(), cards };
      expectFailure(pure(input, () => evaluateLuanji(input)), "invalid_card");
    });
  });

  describe("Xueyi", () => {
    function players() {
      return [
        { playerId: "owner", alive: true, faction: "qun" as const },
        { playerId: "qun-alive-1", alive: true, faction: "qun" as const },
        { playerId: "qun-dead", alive: false, faction: "qun" as const },
        { playerId: "wei-alive", alive: true, faction: "wei" as const },
        { playerId: "qun-alive-2", alive: true, faction: "qun" as const },
      ];
    }

    it("adds two for each other living Qun player, excluding the owner and dead players", () => {
      const input = { ownerId: "owner", hasEffectiveLordSkill: true, players: players() };
      expect(valueOf(pure(input, () => evaluateXueyi(input)))).toEqual({
        skillId: "xueyi",
        ownerId: "owner",
        qualifyingOtherPlayerIds: ["qun-alive-1", "qun-alive-2"],
        qualifyingCount: 2,
        handLimitBonus: 4,
      });
    });

    it("requires an effective lord skill, supporting a caller-resolved native/Weidi entitlement", () => {
      const input = { ownerId: "owner", hasEffectiveLordSkill: false, players: players() };
      expectFailure(pure(input, () => evaluateXueyi(input)), "skill_not_effective");
    });

    it("rejects a dead owner and duplicate player snapshots", () => {
      const deadPlayers = players().map((player) => player.playerId === "owner" ? { ...player, alive: false } : player);
      const dead = { ownerId: "owner", hasEffectiveLordSkill: true, players: deadPlayers };
      expectFailure(pure(dead, () => evaluateXueyi(dead)), "owner_dead");
      const duplicate = { ownerId: "owner", hasEffectiveLordSkill: true, players: [...players(), players()[1]!] };
      expectFailure(pure(duplicate, () => evaluateXueyi(duplicate)), "invalid_input");
    });
  });

  describe("Niepan", () => {
    function input() {
      return {
        ownerId: "owner",
        dyingPlayerId: "owner",
        inOwnDyingResponseWindow: true,
        skillEffective: true,
        limitedSkillConsumed: false,
        state: {
          playerId: "owner",
          alive: true,
          hp: 0,
          maxHp: 3,
          faceUp: false,
          chained: true,
          drunk: true,
          handCardIds: ["hand-1", "hand-2"],
          equipment: [{ slot: "weapon" as const, cardId: "weapon" }],
          judgmentCardIds: ["delayed"],
        },
      };
    }

    it("returns an immutable, complete reset plan without mutating the dying state", () => {
      const facts = input();
      const plan = valueOf(pure(facts, () => planNiepan(facts)));
      expect(plan).toEqual({
        skillId: "niepan",
        ownerId: "owner",
        consumeLimitedSkill: true,
        discard: {
          handCardIds: ["hand-1", "hand-2"],
          equipment: [{ slot: "weapon", cardId: "weapon" }],
          judgmentCardIds: ["delayed"],
          allCardIds: ["hand-1", "hand-2", "weapon", "delayed"],
        },
        stateBeforeDraw: {
          playerId: "owner", alive: true, hp: 3, maxHp: 3, faceUp: true,
          chained: false, drunk: false, handCardIds: [], equipment: [], judgmentCardIds: [],
        },
        requestedHp: 3,
        drawCount: 3,
      });
      expect(facts.state).toMatchObject({ hp: 0, faceUp: false, chained: true, drunk: true });
    });

    it("caps the requested HP at max HP to preserve state invariants", () => {
      const facts = { ...input(), state: { ...input().state, maxHp: 2 } };
      const plan = valueOf(pure(facts, () => planNiepan(facts)));
      expect(plan.requestedHp).toBe(3);
      expect(plan.stateBeforeDraw.hp).toBe(2);
    });

    it.each([
      ["already consumed", { limitedSkillConsumed: true }, "limited_skill_consumed"],
      ["outside own response window", { inOwnDyingResponseWindow: false }, "not_dying"],
      ["another dying player", { dyingPlayerId: "other" }, "not_dying"],
      ["positive HP", { state: { ...input().state, hp: 1 } }, "not_dying"],
      ["dead owner", { state: { ...input().state, alive: false } }, "owner_dead"],
      ["duplicate card across zones", { state: { ...input().state, judgmentCardIds: ["hand-1"] } }, "invalid_input"],
    ] as const)("rejects %s", (_label, overrides, code) => {
      const facts = { ...input(), ...overrides };
      expectFailure(pure(facts, () => planNiepan(facts)), code);
    });
  });
});
