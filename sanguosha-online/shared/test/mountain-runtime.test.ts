import { describe, expect, it } from "vitest";

import type { CardCategory, CardSuit, EquipmentSlot } from "../src/types.js";
import {
  MOUNTAIN_GENERAL_COUNT,
  MOUNTAIN_GENERAL_SKILL_IDS,
  MOUNTAIN_SKILL_ASSIGNMENT_COUNT,
  MOUNTAIN_UNIQUE_SKILL_IDS,
  applyTuntianDistance,
  applyYingyang,
  evaluateJixi,
  evaluateQiaobianSkip,
  evaluateTiaoxin,
  evaluateTuntianLoss,
  evaluateZhibaRequest,
  evaluateZhijian,
  planBeige,
  planDuanchang,
  planFangquanEnd,
  planFangquanSkip,
  planGuzheng,
  planHuashenInitial,
  planHuashenSwitch,
  planHunzi,
  planJiang,
  planMountainGuanxing,
  planMountainJijiang,
  planMountainYinghun,
  planMountainYingzi,
  planQiaobianDraw,
  planQiaobianTableMove,
  planRuoyu,
  planTiaoxinResolution,
  planTuntianJudgment,
  planXinsheng,
  planZaoxian,
  planZhibaSettlement,
  planZhiji,
  planXiangle,
  type HuashenForm,
  type MountainPlayContext,
  type MountainRuleCard,
  type MountainRuleResult,
} from "../src/skills/mountain-runtime.js";

function context(overrides: Partial<MountainPlayContext> = {}): MountainPlayContext {
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
  suit: CardSuit = "spade",
  options: {
    readonly kind?: string;
    readonly ownerId?: string;
    readonly zone?: MountainRuleCard["zone"];
    readonly category?: CardCategory;
    readonly equipmentSlot?: EquipmentSlot | null;
  } = {},
): MountainRuleCard {
  const equipmentSlot = options.equipmentSlot ?? null;
  return {
    id,
    kind: options.kind ?? "slash",
    ownerId: options.ownerId ?? "owner",
    zone: options.zone ?? "hand",
    suit,
    category: options.category ?? (equipmentSlot === null ? "basic" : "equipment"),
    equipmentSlot,
  };
}

function equipment(
  id: string,
  slot: EquipmentSlot = "weapon",
  zone: "hand" | "equipment" = "hand",
  ownerId = "owner",
): MountainRuleCard {
  return card(id, "club", { kind: `${slot}_card`, ownerId, zone, category: "equipment", equipmentSlot: slot });
}

function delayed(id: string, kind: string, ownerId: string, zone: "judgment" | "discard" = "judgment"): MountainRuleCard {
  return card(id, "spade", { kind, ownerId, zone, category: "trick" });
}

function form(
  generalId: string,
  skills: HuashenForm["skills"] = [{ skillId: "normal_skill", category: "normal" }],
  faction: HuashenForm["faction"] = "wei",
  gender: HuashenForm["gender"] = "male",
): HuashenForm {
  return { generalId, faction, gender, skills };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function pure<TInput, TOutput>(input: TInput, invoke: () => MountainRuleResult<TOutput>): MountainRuleResult<TOutput> {
  const before = JSON.stringify(input);
  deepFreeze(input);
  const result = invoke();
  expect(JSON.stringify(input)).toBe(before);
  expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  return result;
}

function valueOf<T>(result: MountainRuleResult<T>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`${result.code}: ${result.detail}`);
  return result.value;
}

function fail<T>(result: MountainRuleResult<T>, code: string): void {
  expect(result).toMatchObject({ ok: false, code });
}

describe("Mountain package pure runtime", () => {
  describe("roster contract", () => {
    it("contains exactly eight generals and twenty-three skill assignments", () => {
      expect(Object.keys(MOUNTAIN_GENERAL_SKILL_IDS)).toHaveLength(MOUNTAIN_GENERAL_COUNT);
      expect(Object.values(MOUNTAIN_GENERAL_SKILL_IDS).flat()).toHaveLength(MOUNTAIN_SKILL_ASSIGNMENT_COUNT);
    });

    it("contains the expected twenty-three unique rule IDs", () => {
      expect(new Set(MOUNTAIN_UNIQUE_SKILL_IDS).size).toBe(23);
      expect(Object.values(MOUNTAIN_GENERAL_SKILL_IDS).flat()).toEqual(expect.arrayContaining([...MOUNTAIN_UNIQUE_SKILL_IDS]));
    });
  });

  describe("Beige", () => {
    function input(judgmentSuit: CardSuit) {
      return {
        ownerId: "owner", ownerAlive: true, skillEffective: true,
        slashDamageAftermathSettled: true, victimId: "victim", victimAlive: true,
        damageSourceId: "source", damageSourceAlive: true,
        costCard: card("cost"), finalJudgmentSuit: judgmentSuit,
        damageSourceCards: [
          card("source-hand", "heart", { ownerId: "source" }),
          equipment("source-equip", "weapon", "equipment", "source"),
          delayed("source-judge", "le_bu_si_shu", "source"),
        ],
      };
    }

    it.each([
      ["heart", { type: "recover", targetId: "victim", amount: 1 }],
      ["diamond", { type: "draw", targetId: "victim", count: 2 }],
      ["spade", { type: "turn_over_source", sourceId: "source" }],
    ] as const)("maps final %s to its original suit effect", (judgmentSuit, effect) => {
      const facts = input(judgmentSuit);
      expect(valueOf(pure(facts, () => planBeige(facts))).effect).toEqual(effect);
    });

    it("limits the Club discard to source hand/equipment cards and available count", () => {
      const facts = input("club");
      expect(valueOf(pure(facts, () => planBeige(facts))).effect).toEqual({
        type: "source_discard", sourceId: "source", requiredCount: 2,
        candidateCardIds: ["source-hand", "source-equip"], maximumDiscardCount: 2,
      });
    });

    it.each([
      ["dead owner", { ownerAlive: false }, "owner_dead"],
      ["dead victim", { victimAlive: false }, "target_dead"],
      ["unsettled damage", { slashDamageAftermathSettled: false }, "wrong_timing"],
      ["judgment-zone cost", { costCard: delayed("cost", "lightning", "owner") }, "invalid_card"],
    ] as const)("rejects %s", (_label, override, code) => {
      const facts = { ...input("heart"), ...override };
      fail(pure(facts, () => planBeige(facts)), code);
    });

    it("keeps Heart/Diamond useful and Club/Spade harmless after the source dies", () => {
      const club = { ...input("club"), damageSourceAlive: false, damageSourceCards: [] };
      expect(valueOf(pure(club, () => planBeige(club))).effect).toEqual({ type: "no_source_effect" });
      const heart = { ...input("heart"), damageSourceAlive: false, damageSourceCards: [] };
      expect(valueOf(pure(heart, () => planBeige(heart))).effect.type).toBe("recover");
    });
  });

  describe("Duanchang", () => {
    it("creates a snapshot loss of all current general skills", () => {
      const input = {
        ownerId: "owner", ownerDead: true, skillWasEffectiveAtDeath: true,
        killerId: "killer", killerAlive: true, killerCurrentGeneralSkillIds: ["skill_a", "granted_b"],
      };
      expect(valueOf(pure(input, () => planDuanchang(input)))).toEqual({
        skillId: "duanchang", ownerId: "owner", killerId: "killer",
        loseSkillIds: ["skill_a", "granted_b"], snapshotLoss: true,
      });
    });

    it.each([
      ["owner survived", { ownerDead: false }, "wrong_timing"],
      ["source-less death", { killerId: null, killerAlive: false }, "no_candidate"],
      ["dead killer", { killerAlive: false }, "no_candidate"],
      ["duplicate skill IDs", { killerCurrentGeneralSkillIds: ["x", "x"] }, "invalid_input"],
    ] as const)("fails closed for %s", (_label, override, code) => {
      const input = {
        ownerId: "owner", ownerDead: true, skillWasEffectiveAtDeath: true,
        killerId: "killer" as string | null, killerAlive: true, killerCurrentGeneralSkillIds: ["x"], ...override,
      };
      fail(pure(input, () => planDuanchang(input)), code);
    });
  });

  describe("Tuntian, Zaoxian and Jixi", () => {
    function lossInput() {
      return {
        ownerId: "owner", ownerAlive: true, skillEffective: true,
        currentTurnPlayerId: "other", moveBatchId: 9,
        lostCards: [card("h1"), card("h2"), equipment("e1", "armor", "equipment")],
      };
    }

    it("creates exactly one optional Tuntian judgment per multi-card loss batch", () => {
      const input = lossInput();
      expect(valueOf(pure(input, () => evaluateTuntianLoss(input)))).toMatchObject({
        moveBatchId: 9, qualifyingLostCardIds: ["h1", "h2", "e1"], judgmentsToCreate: 1,
      });
    });

    it.each([
      ["owner's own turn", { currentTurnPlayerId: "owner" }, "wrong_timing"],
      ["only judgment cards lost", { lostCards: [delayed("j", "lightning", "owner")] }, "wrong_timing"],
      ["foreign card", { lostCards: [card("foreign", "spade", { ownerId: "other" })] }, "invalid_card"],
      ["dead owner", { ownerAlive: false }, "owner_dead"],
    ] as const)("rejects Tuntian for %s", (_label, override, code) => {
      const input = { ...lossInput(), ...override };
      fail(pure(input, () => evaluateTuntianLoss(input)), code);
    });

    it.each([
      ["heart", "discard", false],
      ["diamond", "field", true],
      ["club", "field", true],
      ["spade", "field", true],
    ] as const)("routes a final %s judgment to %s", (judgmentSuit, destination, createsField) => {
      const input = { ownerId: "owner", ownerAlive: true, finalJudgmentCardId: "judge", finalJudgmentSuit: judgmentSuit };
      expect(valueOf(pure(input, () => planTuntianJudgment(input)))).toMatchObject({ destination, createsField });
    });

    it.each([
      [5, 3, true, 2],
      [2, 5, true, 1],
      [5, 3, false, 5],
      [1, 99, true, 1],
    ] as const)("maps base distance %i with %i Fields and effective=%s to %i", (baseDistance, fieldCount, skillEffective, expected) => {
      const input = { ownerId: "owner", targetId: "target", skillEffective, baseDistance, fieldCount };
      expect(valueOf(pure(input, () => applyTuntianDistance(input))).distance).toBe(expected);
    });

    function zaoxian() {
      return {
        ownerId: "owner", currentPlayerId: "owner", atPreparePhaseStart: true,
        ownerAlive: true, skillEffective: true, alreadyAwakened: false,
        fieldCount: 3, hp: 4, maxHp: 4,
      };
    }

    it("awakens Zaoxian at three Fields, caps HP, and grants Jixi", () => {
      const input = zaoxian();
      expect(valueOf(pure(input, () => planZaoxian(input)))).toMatchObject({ maxHpAfter: 3, hpAfter: 3, grantSkillIds: ["jixi"] });
    });

    it.each([
      ["two Fields", { fieldCount: 2 }, "awakening_condition_not_met"],
      ["already awake", { alreadyAwakened: true }, "already_awakened"],
      ["wrong player", { currentPlayerId: "other" }, "wrong_timing"],
    ] as const)("does not awaken for %s", (_label, override, code) => {
      const input = { ...zaoxian(), ...override };
      fail(pure(input, () => planZaoxian(input)), code);
    });

    function jixi() {
      return {
        context: context(), fieldCard: card("field", "heart", { zone: "field" }),
        targetId: "target", targetAlive: true, targetCanBeTargetedBySnatch: true,
        effectiveDistance: 1, snatchDistanceLimit: 1,
        targetCards: [card("target-hand", "club", { ownerId: "target" })],
      };
    }

    it("converts one owned Field into a range-checked Snatch", () => {
      const input = jixi();
      expect(valueOf(pure(input, () => evaluateJixi(input)))).toMatchObject({ fieldCardId: "field", virtualCard: "shun_shou_qian_yang", targetId: "target" });
    });

    it.each([
      ["hand card instead of Field", { fieldCard: card("field") }, "invalid_card"],
      ["self target", { targetId: "owner" }, "invalid_target"],
      ["out of range", { effectiveDistance: 2 }, "out_of_range"],
      ["empty target", { targetCards: [] }, "no_candidate"],
      ["Qianxun/prohibition", { targetCanBeTargetedBySnatch: false }, "invalid_target"],
    ] as const)("rejects Jixi for %s", (_label, override, code) => {
      const input = { ...jixi(), ...override };
      fail(pure(input, () => evaluateJixi(input)), code);
    });
  });

  describe("Tiaoxin, Zhiji and granted Guanxing", () => {
    function tiaoxin() {
      return {
        context: context(), alreadyUsedThisTurn: false, targetId: "target", targetAlive: true,
        distanceFromTargetToOwner: 2, targetAttackRange: 2, targetCanLegallySlashOwner: true,
        targetCards: [
          card("target-hand", "spade", { ownerId: "target" }),
          equipment("target-equip", "armor", "equipment", "target"),
          delayed("target-judge", "lightning", "target"),
        ],
      };
    }

    it("allows an in-range target even when the discard candidate list is empty", () => {
      const input = { ...tiaoxin(), targetCards: [] };
      expect(valueOf(pure(input, () => evaluateTiaoxin(input)))).toMatchObject({
        consumeTurnUse: true, targetMayUseSlash: true, declineDiscardCandidateIds: [],
      });
    });

    it("includes hand, equipment, and judgment cards in the decline branch", () => {
      const input = tiaoxin();
      expect(valueOf(pure(input, () => evaluateTiaoxin(input))).declineDiscardCandidateIds)
        .toEqual(["target-hand", "target-equip", "target-judge"]);
    });

    it.each([
      ["already used", { alreadyUsedThisTurn: true }, "already_used"],
      ["target cannot reach owner", { distanceFromTargetToOwner: 3 }, "out_of_range"],
      ["self target", { targetId: "owner" }, "invalid_target"],
      ["dead target", { targetAlive: false }, "target_dead"],
    ] as const)("rejects Tiaoxin for %s", (_label, override, code) => {
      const input = { ...tiaoxin(), ...override };
      fail(pure(input, () => evaluateTiaoxin(input)), code);
    });

    it("plans the target's legal Slash as a real Slash against Jiang Wei", () => {
      const facts = tiaoxin();
      const prompt = valueOf(evaluateTiaoxin(facts));
      const input = { prompt, choice: "use_slash" as const, slashCard: card("slash", "heart", { kind: "fire_slash", ownerId: "target" }) };
      expect(valueOf(pure(input, () => planTiaoxinResolution(input)))).toEqual({
        skillId: "tiaoxin", outcome: "use_slash", slashCardId: "slash", sourceId: "target", targetId: "owner",
      });
    });

    it("plans at most one discard after decline and zero when target is empty", () => {
      for (const targetCards of [tiaoxin().targetCards, []]) {
        const facts = { ...tiaoxin(), targetCards };
        const prompt = valueOf(evaluateTiaoxin(facts));
        const input = { prompt, choice: "decline" as const, slashCard: null };
        const plan = valueOf(pure(input, () => planTiaoxinResolution(input)));
        expect(plan.outcome).toBe("decline");
        if (plan.outcome === "decline") expect(plan.discardMaximum).toBe(targetCards.length === 0 ? 0 : 1);
      }
    });

    it("rejects a Slash branch when the target cannot legally use Slash", () => {
      const prompt = valueOf(evaluateTiaoxin({ ...tiaoxin(), targetCanLegallySlashOwner: false }));
      const input = { prompt, choice: "use_slash" as const, slashCard: card("slash", "spade", { ownerId: "target" }) };
      fail(pure(input, () => planTiaoxinResolution(input)), "invalid_card");
    });

    function zhiji(choice: "recover_one" | "draw_two" = "recover_one") {
      return {
        ownerId: "owner", currentPlayerId: "owner", atPreparePhaseStart: true,
        ownerAlive: true, skillEffective: true, alreadyAwakened: false,
        handCount: 0, hp: 2, maxHp: 4, choice,
      };
    }

    it.each([
      ["recover_one", 1, 0, 3, 3],
      ["draw_two", 0, 2, 3, 2],
    ] as const)("resolves Zhiji choice %s before reducing max HP", (choice, recover, draw, maxHpAfter, hpAfter) => {
      const input = zhiji(choice);
      expect(valueOf(pure(input, () => planZhiji(input)))).toMatchObject({
        recoverBeforeMaxHpLoss: recover, drawCount: draw, maxHpAfter, hpAfter, grantSkillIds: ["guanxing"],
      });
    });

    it.each([
      ["nonempty hand", { handCount: 1 }, "awakening_condition_not_met"],
      ["full HP recovery choice", { hp: 4, choice: "recover_one" as const }, "invalid_input"],
      ["already awake", { alreadyAwakened: true }, "already_awakened"],
      ["wrong phase owner", { currentPlayerId: "other" }, "wrong_timing"],
    ] as const)("rejects Zhiji for %s", (_label, override, code) => {
      const input = { ...zhiji(), ...override };
      fail(pure(input, () => planZhiji(input)), code);
    });

    it.each([
      [8, 99, 5],
      [3, 99, 3],
      [8, 2, 2],
    ] as const)("Guanxing views min(alive=%i, deck=%i, 5) = %i", (alivePlayerCount, availableDeckCardCount, expected) => {
      const input = {
        ownerId: "owner", currentPlayerId: "owner", atPreparePhaseStart: true,
        ownerAlive: true, skillEffective: true, alivePlayerCount, availableDeckCardCount,
      };
      expect(valueOf(pure(input, () => planMountainGuanxing(input))).viewCount).toBe(expected);
    });

    it("rejects Guanxing before it is granted", () => {
      const input = {
        ownerId: "owner", currentPlayerId: "owner", atPreparePhaseStart: true,
        ownerAlive: true, skillEffective: false, alivePlayerCount: 4, availableDeckCardCount: 4,
      };
      fail(pure(input, () => planMountainGuanxing(input)), "skill_not_effective");
    });
  });

  describe("Xiangle, Fangquan, Ruoyu and granted Jijiang", () => {
    function xiangle(paymentCardId: string | null) {
      return {
        ownerId: "owner", ownerAlive: true, skillEffective: true, slashTargetConfirmed: true,
        slashSourceId: "source", slashSourceAlive: true,
        sourceBasicHandCards: [
          card("slash", "spade", { kind: "slash", ownerId: "source" }),
          card("dodge", "heart", { kind: "dodge", ownerId: "source" }),
        ],
        paymentCardId,
      };
    }

    it.each([
      ["slash", false],
      ["dodge", false],
      [null, true],
    ] as const)("maps Xiangle payment %s to target invalid=%s", (paymentCardId, invalid) => {
      const input = xiangle(paymentCardId);
      expect(valueOf(pure(input, () => planXiangle(input)))).toMatchObject({ discardCardId: paymentCardId, slashEffectInvalidForTarget: invalid });
    });

    it.each([
      ["equipment payment", { paymentCardId: "weapon", sourceBasicHandCards: [equipment("weapon", "weapon", "hand", "source")] }, "invalid_card"],
      ["unconfirmed target", { slashTargetConfirmed: false }, "wrong_timing"],
      ["dead owner", { ownerAlive: false }, "owner_dead"],
    ] as const)("rejects Xiangle for %s", (_label, override, code) => {
      const input = { ...xiangle(null), ...override };
      fail(pure(input, () => planXiangle(input)), code);
    });

    it("marks the exact turn when Fangquan skips play", () => {
      const input = {
        ownerId: "owner", currentPlayerId: "owner", ownerAlive: true,
        skillEffective: true, atPlayPhaseBefore: true, turnId: 7,
      };
      expect(valueOf(pure(input, () => planFangquanSkip(input)))).toEqual({
        skillId: "fangquan", ownerId: "owner", turnId: 7, skipPlayPhase: true,
        endOfTurnMark: { type: "fangquan_skipped_play", turnId: 7 },
      });
    });

    it("queues a non-recursive extra turn after hand payment", () => {
      const input = {
        ownerId: "owner", ownerAlive: true, atOwnerTurnEnd: true, turnId: 7, markedTurnId: 7,
        discardHandCard: card("cost"), extraTurnTarget: { playerId: "target", alive: true },
      };
      expect(valueOf(pure(input, () => planFangquanEnd(input)))).toMatchObject({
        clearMark: true, grantExtraTurn: true, discardCardId: "cost",
        queuedTurn: { kind: "extra", playerId: "target", grantedByTurnId: 7 },
      });
    });

    it("allows declining the end payment while still clearing the mark", () => {
      const input = {
        ownerId: "owner", ownerAlive: true, atOwnerTurnEnd: true, turnId: 7, markedTurnId: 7,
        discardHandCard: null, extraTurnTarget: null,
      };
      expect(valueOf(pure(input, () => planFangquanEnd(input)))).toMatchObject({ clearMark: true, grantExtraTurn: false });
    });

    it.each([
      ["self target", { extraTurnTarget: { playerId: "owner", alive: true } }, "invalid_target"],
      ["equipment payment", { discardHandCard: equipment("cost", "weapon", "equipment") }, "invalid_card"],
      ["stale mark", { markedTurnId: 6 }, "wrong_timing"],
      ["half commitment", { extraTurnTarget: null }, "invalid_input"],
    ] as const)("rejects Fangquan end for %s", (_label, override, code) => {
      const input = {
        ownerId: "owner", ownerAlive: true, atOwnerTurnEnd: true, turnId: 7, markedTurnId: 7,
        discardHandCard: card("cost") as MountainRuleCard | null,
        extraTurnTarget: { playerId: "target", alive: true } as { playerId: string; alive: boolean } | null,
        ...override,
      };
      fail(pure(input, () => planFangquanEnd(input)), code);
    });

    function ruoyu() {
      return {
        ownerId: "owner", currentPlayerId: "owner", atPreparePhaseStart: true,
        ownerAlive: true, skillEffectiveAsLord: true, ownerIsLord: true,
        alreadyAwakened: false, hp: 2, maxHp: 3, livingPlayerHpValues: [2, 2, 4],
      };
    }

    it("allows a tied minimum and increases max HP before recovery", () => {
      const input = ruoyu();
      expect(valueOf(pure(input, () => planRuoyu(input)))).toMatchObject({ maxHpAfter: 4, hpAfter: 3, grantSkillIds: ["jijiang"] });
    });

    it.each([
      ["lower living player", { livingPlayerHpValues: [1, 2, 4] }, "awakening_condition_not_met"],
      ["non-lord", { ownerIsLord: false }, "skill_not_effective"],
      ["already awake", { alreadyAwakened: true }, "already_awakened"],
      ["wrong turn", { currentPlayerId: "other" }, "wrong_timing"],
    ] as const)("rejects Ruoyu for %s", (_label, override, code) => {
      const input = { ...ruoyu(), ...override };
      fail(pure(input, () => planRuoyu(input)), code);
    });

    it("orders only other living Shu responders with a legal Slash by seat", () => {
      const input = {
        ownerId: "owner", ownerAlive: true, ownerIsLord: true, skillEffective: true,
        slashRequestWindowOpen: true,
        responders: [
          { playerId: "shu-3", seat: 3, alive: true, faction: "shu" as const, hasLegalSlashResponse: true },
          { playerId: "owner", seat: 1, alive: true, faction: "shu" as const, hasLegalSlashResponse: true },
          { playerId: "wei", seat: 2, alive: true, faction: "wei" as const, hasLegalSlashResponse: true },
          { playerId: "shu-2", seat: 2, alive: true, faction: "shu" as const, hasLegalSlashResponse: true },
          { playerId: "shu-empty", seat: 4, alive: true, faction: "shu" as const, hasLegalSlashResponse: false },
        ],
      };
      expect(valueOf(pure(input, () => planMountainJijiang(input)))).toMatchObject({
        orderedResponderIds: ["shu-2", "shu-3"], resultingSlashUserId: "owner",
      });
    });

    it.each([
      ["no Shu candidate", { responders: [] }, "no_candidate"],
      ["not lord", { ownerIsLord: false }, "skill_not_effective"],
      ["closed window", { slashRequestWindowOpen: false }, "wrong_timing"],
    ] as const)("rejects Jijiang for %s", (_label, override, code) => {
      const input = {
        ownerId: "owner", ownerAlive: true, ownerIsLord: true, skillEffective: true,
        slashRequestWindowOpen: true,
        responders: [{ playerId: "shu", seat: 2, alive: true, faction: "shu" as const, hasLegalSlashResponse: true }],
        ...override,
      };
      fail(pure(input, () => planMountainJijiang(input)), code);
    });
  });

  describe("Sun Ce's six-skill lifecycle", () => {
    it.each([
      ["card_user", "slash", "heart"],
      ["card_user", "fire_slash", "diamond"],
      ["card_target", "slash", "heart"],
      ["card_user", "duel", "spade"],
      ["card_target", "duel", "club"],
    ] as const)("Jiang triggers as %s for %s/%s", (role, cardKind, cardSuit) => {
      const input = {
        ownerId: "owner", ownerAlive: true, skillEffective: true, targetDesignationSettled: true,
        role, cardKind, cardSuit, cardUserId: role === "card_user" ? "owner" : "other",
        targetIds: role === "card_target" ? ["owner"] : ["target"],
      };
      expect(valueOf(pure(input, () => planJiang(input)))).toMatchObject({ role, drawCount: 1, optional: true });
    });

    it.each([
      ["black Slash", { cardKind: "slash", cardSuit: "spade" as const }, "invalid_card"],
      ["ordinary trick", { cardKind: "fire_attack", cardSuit: "heart" as const }, "invalid_card"],
      ["owner absent from target list", { role: "card_target" as const, cardUserId: "other", targetIds: ["someone"] }, "invalid_target"],
      ["premature event", { targetDesignationSettled: false }, "wrong_timing"],
    ] as const)("Jiang rejects %s", (_label, override, code) => {
      const input = {
        ownerId: "owner", ownerAlive: true, skillEffective: true, targetDesignationSettled: true,
        role: "card_user" as const, cardKind: "slash", cardSuit: "heart" as const,
        cardUserId: "owner", targetIds: ["target"], ...override,
      };
      fail(pure(input, () => planJiang(input)), code);
    });

    it.each([
      [1, "plus_three", 4],
      [12, "plus_three", 13],
      [13, "plus_three", 13],
      [1, "minus_three", 1],
      [2, "minus_three", 1],
      [13, "minus_three", 10],
      [8, "decline", 8],
    ] as const)("Yingyang maps %i with %s to %i", (revealedRank, choice, rankAfter) => {
      const input = {
        ownerId: "owner", ownerAlive: true, skillEffective: true,
        pindianCardRevealed: true, revealedRank, choice,
      };
      expect(valueOf(pure(input, () => applyYingyang(input))).rankAfter).toBe(rankAfter);
    });

    it("rejects Yingyang before reveal", () => {
      const input = {
        ownerId: "owner", ownerAlive: true, skillEffective: true,
        pindianCardRevealed: false, revealedRank: 8 as const, choice: "plus_three" as const,
      };
      fail(pure(input, () => applyYingyang(input)), "wrong_timing");
    });

    function hunzi(hp = 1) {
      return {
        ownerId: "owner", currentPlayerId: "owner", atPreparePhaseStart: true,
        ownerAlive: true, skillEffective: true, alreadyAwakened: false, hp, maxHp: 4,
      };
    }

    it("awakens only at exactly one HP and grants Yingzi/Yinghun", () => {
      const input = hunzi();
      expect(valueOf(pure(input, () => planHunzi(input)))).toMatchObject({
        maxHpAfter: 3, hpAfter: 1, grantSkillIds: ["yingzi", "yinghun"],
      });
    });

    it.each([
      ["two HP", { hp: 2 }, "awakening_condition_not_met"],
      ["already awake", { alreadyAwakened: true }, "already_awakened"],
      ["wrong turn", { currentPlayerId: "other" }, "wrong_timing"],
    ] as const)("Hunzi rejects %s", (_label, override, code) => {
      const input = { ...hunzi(), ...override };
      fail(pure(input, () => planHunzi(input)), code);
    });

    function zhiba() {
      return {
        context: context({ actorId: "challenger", currentPlayerId: "challenger" }),
        alreadyRequestedThisPlayPhase: false, challengerFaction: "wu" as const, challengerHandCount: 2,
        lordId: "lord", lordAlive: true, lordIsCurrentLord: true, lordSkillEffective: true,
        lordHandCount: 2, lordAwakened: false, lordAccepts: false,
      };
    }

    it("forces pre-awakening acceptance and consumes the challenger's phase use", () => {
      const input = zhiba();
      expect(valueOf(pure(input, () => evaluateZhibaRequest(input)))).toMatchObject({
        accepted: true, consumeChallengerPhaseUse: true,
        beginPindian: { initiatorId: "challenger", targetId: "lord" },
      });
    });

    it("allows awakened Sun Ce to refuse while still consuming the request", () => {
      const input = { ...zhiba(), lordAwakened: true, lordAccepts: false };
      expect(valueOf(pure(input, () => evaluateZhibaRequest(input)))).toMatchObject({ accepted: false, consumeChallengerPhaseUse: true });
    });

    it.each([
      ["non-Wu challenger", { challengerFaction: "wei" as const }, "invalid_target"],
      ["empty challenger hand", { challengerHandCount: 0 }, "no_candidate"],
      ["empty lord hand", { lordHandCount: 0 }, "no_candidate"],
      ["not lord", { lordIsCurrentLord: false }, "skill_not_effective"],
      ["repeat request", { alreadyRequestedThisPlayPhase: true }, "already_used"],
    ] as const)("Zhiba request rejects %s", (_label, override, code) => {
      const input = { ...zhiba(), ...override };
      fail(pure(input, () => evaluateZhibaRequest(input)), code);
    });

    it.each([
      [10, 5, false, false, false, "discard"],
      [5, 10, true, false, true, "lord_hand"],
      [8, 8, true, true, true, "lord_hand"],
      [8, 8, false, true, true, "discard"],
    ] as const)("settles Zhiba %i:%i gain=%s", (challengerRank, lordRank, lordChoosesToGain, tied, lordMayGainBoth, destination) => {
      const input = {
        challengerId: "challenger", lordId: "lord", challengerRank, lordRank,
        challengerCardId: "challenger-card", lordCardId: "lord-card", lordChoosesToGain,
      };
      expect(valueOf(pure(input, () => planZhibaSettlement(input)))).toMatchObject({ tied, lordMayGainBoth, destination });
    });

    it("rejects a forged gain after challenger wins", () => {
      const input = {
        challengerId: "challenger", lordId: "lord", challengerRank: 10 as const, lordRank: 5 as const,
        challengerCardId: "c", lordCardId: "l", lordChoosesToGain: true,
      };
      fail(pure(input, () => planZhibaSettlement(input)), "invalid_input");
    });

    it.each([
      [2, false, 2],
      [2, true, 3],
      [0, true, 1],
    ] as const)("Yingzi base draw %i active=%s yields %i without a hand-limit override", (baseDrawCount, activate, drawCount) => {
      const input = { ownerId: "owner", ownerAlive: true, skillEffective: true, atDrawPhase: true, baseDrawCount, activate };
      expect(valueOf(pure(input, () => planMountainYingzi(input)))).toMatchObject({ drawCount, handLimitOverride: null });
    });

    it("rejects Yingzi outside draw phase", () => {
      const input = { ownerId: "owner", ownerAlive: true, skillEffective: true, atDrawPhase: false, baseDrawCount: 2, activate: true };
      fail(pure(input, () => planMountainYingzi(input)), "wrong_timing");
    });

    it.each([
      ["draw_x_discard_one", 3, 1],
      ["draw_one_discard_x", 1, 3],
    ] as const)("Yinghun %s with three lost HP draws %i and discards %i", (choice, drawCount, requestedDiscardCount) => {
      const input = {
        ownerId: "owner", ownerAlive: true, skillEffective: true, atPreparePhaseStart: true,
        hp: 1, maxHp: 4, targetId: "target", targetAlive: true, choice,
      };
      expect(valueOf(pure(input, () => planMountainYinghun(input)))).toMatchObject({ lostHp: 3, drawCount, requestedDiscardCount });
    });

    it.each([
      ["unwounded owner", { hp: 4 }, "awakening_condition_not_met"],
      ["self target", { targetId: "owner" }, "invalid_target"],
      ["dead target", { targetAlive: false }, "target_dead"],
    ] as const)("Yinghun rejects %s", (_label, override, code) => {
      const input = {
        ownerId: "owner", ownerAlive: true, skillEffective: true, atPreparePhaseStart: true,
        hp: 2, maxHp: 4, targetId: "target", targetAlive: true,
        choice: "draw_x_discard_one" as const, ...override,
      };
      fail(pure(input, () => planMountainYinghun(input)), code);
    });
  });

  describe("Qiaobian", () => {
    it.each([
      ["judgment", "none"],
      ["draw", "gain_up_to_two_hands"],
      ["play", "move_one_table_card"],
      ["discard", "none"],
    ] as const)("skipping %s produces replacement %s", (phase, replacement) => {
      const input = {
        ownerId: "owner", currentPlayerId: "owner", ownerAlive: true, skillEffective: true,
        atPhaseBefore: true, phase, phaseInstanceId: 11, alreadyUsedForPhaseInstance: false,
        discardHandCard: card("cost"),
      };
      expect(valueOf(pure(input, () => evaluateQiaobianSkip(input)))).toMatchObject({ phase, skipPhase: true, replacement });
    });

    it.each([
      ["equipment cost", { discardHandCard: equipment("cost", "weapon", "equipment") }, "invalid_card"],
      ["stale phase", { atPhaseBefore: false }, "wrong_timing"],
      ["repeat phase", { alreadyUsedForPhaseInstance: true }, "already_used"],
      ["wrong player", { currentPlayerId: "other" }, "wrong_timing"],
    ] as const)("skip rejects %s", (_label, override, code) => {
      const input = {
        ownerId: "owner", currentPlayerId: "owner", ownerAlive: true, skillEffective: true,
        atPhaseBefore: true, phase: "draw" as const, phaseInstanceId: 11,
        alreadyUsedForPhaseInstance: false, discardHandCard: card("cost"), ...override,
      };
      fail(pure(input, () => evaluateQiaobianSkip(input)), code);
    });

    it.each([
      [[], []],
      [[{ targetId: "a", targetAlive: true, handCard: card("a-card", "spade", { ownerId: "a" }) }], [{ fromPlayerId: "a", cardId: "a-card", hiddenSelection: true }]],
      [[
        { targetId: "a", targetAlive: true, handCard: card("a-card", "spade", { ownerId: "a" }) },
        { targetId: "b", targetAlive: true, handCard: card("b-card", "heart", { ownerId: "b" }) },
      ], [
        { fromPlayerId: "a", cardId: "a-card", hiddenSelection: true },
        { fromPlayerId: "b", cardId: "b-card", hiddenSelection: true },
      ]],
    ] as const)("draw replacement accepts 0/1/2 targets", (selections, gains) => {
      const input = { ownerId: "owner", selections };
      expect(valueOf(pure(input, () => planQiaobianDraw(input))).gains).toEqual(gains);
    });

    it.each([
      ["three targets", [
        { targetId: "a", targetAlive: true, handCard: card("a", "spade", { ownerId: "a" }) },
        { targetId: "b", targetAlive: true, handCard: card("b", "spade", { ownerId: "b" }) },
        { targetId: "c", targetAlive: true, handCard: card("c", "spade", { ownerId: "c" }) },
      ], "invalid_target"],
      ["duplicate target", [
        { targetId: "a", targetAlive: true, handCard: card("a", "spade", { ownerId: "a" }) },
        { targetId: "a", targetAlive: true, handCard: card("b", "heart", { ownerId: "a" }) },
      ], "invalid_target"],
      ["self target", [{ targetId: "owner", targetAlive: true, handCard: card("a") }], "invalid_target"],
      ["dead target", [{ targetId: "a", targetAlive: false, handCard: card("a", "spade", { ownerId: "a" }) }], "target_dead"],
    ] as const)("draw replacement rejects %s", (_label, selections, code) => {
      const input = { ownerId: "owner", selections };
      fail(pure(input, () => planQiaobianDraw(input)), code);
    });

    function destination() {
      return {
        playerId: "destination", alive: true,
        occupiedEquipmentSlots: [] as EquipmentSlot[], judgmentCardKinds: [] as string[],
        canReceiveDelayedTrick: true,
      };
    }

    it("moves equipment into the destination's corresponding empty slot", () => {
      const input = {
        ownerId: "owner", sourceId: "source", sourceAlive: true,
        card: equipment("weapon", "weapon", "equipment", "source"), destination: destination(),
      };
      expect(valueOf(pure(input, () => planQiaobianTableMove(input)))).toMatchObject({
        cardId: "weapon", fromPlayerId: "source", toPlayerId: "destination",
        zone: "equipment", correspondingPosition: "weapon",
      });
    });

    it("moves a delayed trick only to a destination without the same kind", () => {
      const input = {
        ownerId: "owner", sourceId: "source", sourceAlive: true,
        card: delayed("lightning", "shan_dian", "source"), destination: destination(),
      };
      expect(valueOf(pure(input, () => planQiaobianTableMove(input)))).toMatchObject({ zone: "judgment", correspondingPosition: "shan_dian" });
    });

    it.each([
      ["same source/destination", { destination: { ...destination(), playerId: "source" } }, "invalid_target"],
      ["occupied equipment slot", { destination: { ...destination(), occupiedEquipmentSlots: ["weapon" as const] } }, "invalid_target"],
      ["duplicate delayed trick", { card: delayed("lightning", "shan_dian", "source"), destination: { ...destination(), judgmentCardKinds: ["shan_dian"] } }, "invalid_target"],
      ["hand card", { card: card("hand", "spade", { ownerId: "source" }) }, "invalid_card"],
      ["dead source", { sourceAlive: false }, "target_dead"],
      ["dead destination", { destination: { ...destination(), alive: false } }, "target_dead"],
    ] as const)("table move rejects %s", (_label, override, code) => {
      const input = {
        ownerId: "owner", sourceId: "source", sourceAlive: true,
        card: equipment("weapon", "weapon", "equipment", "source"), destination: destination(), ...override,
      };
      fail(pure(input, () => planQiaobianTableMove(input)), code);
    });
  });

  describe("Zhijian and Guzheng", () => {
    function zhijian() {
      return {
        context: context(), equipmentCard: equipment("armor", "armor"),
        targetId: "target", targetAlive: true, targetCanReceiveEquipment: true,
        occupiedEquipmentSlots: [] as EquipmentSlot[],
      };
    }

    it("installs any hand equipment type in another empty slot and draws one", () => {
      for (const slot of ["weapon", "armor", "offensive_horse", "defensive_horse"] as const) {
        const input = { ...zhijian(), equipmentCard: equipment(slot, slot) };
        expect(valueOf(pure(input, () => evaluateZhijian(input)))).toMatchObject({ equipmentSlot: slot, drawCountAfterInstall: 1 });
      }
    });

    it.each([
      ["self target", { targetId: "owner" }, "invalid_target"],
      ["occupied slot", { occupiedEquipmentSlots: ["armor" as const] }, "invalid_target"],
      ["non-equipment card", { equipmentCard: card("basic") }, "invalid_card"],
      ["equipped rather than hand card", { equipmentCard: equipment("armor", "armor", "equipment") }, "invalid_card"],
      ["dead target", { targetAlive: false }, "target_dead"],
    ] as const)("Zhijian rejects %s", (_label, override, code) => {
      const input = { ...zhijian(), ...override };
      fail(pure(input, () => evaluateZhijian(input)), code);
    });

    function guzheng() {
      return {
        ownerId: "owner", ownerAlive: true, skillEffective: true, atOtherDiscardPhaseEnd: true,
        discardPhaseOwnerId: "discarder", discardPhaseOwnerAlive: true,
        records: [
          { card: card("one", "spade", { ownerId: "discarder", zone: "discard" }), discardedById: "discarder", enteredDuringDiscardPhase: true, fromHand: true, stillInDiscardPile: true },
          { card: card("two", "heart", { ownerId: "discarder", zone: "discard" }), discardedById: "discarder", enteredDuringDiscardPhase: true, fromHand: true, stillInDiscardPile: true },
          { card: card("moved", "club", { ownerId: "discarder", zone: "discard" }), discardedById: "discarder", enteredDuringDiscardPhase: true, fromHand: true, stillInDiscardPile: false },
          { card: card("foreign", "club", { ownerId: "other", zone: "discard" }), discardedById: "other", enteredDuringDiscardPhase: true, fromHand: true, stillInDiscardPile: true },
        ],
        returnCardId: "one",
      };
    }

    it("returns one eligible card and gains only the other still-present discards", () => {
      const input = guzheng();
      expect(valueOf(pure(input, () => planGuzheng(input)))).toEqual({
        skillId: "guzheng", ownerId: "owner", discardPhaseOwnerId: "discarder",
        returnToDiscarderCardId: "one", gainCardIds: ["two"], optional: true,
      });
    });

    it.each([
      ["self discard phase", { discardPhaseOwnerId: "owner" }, "invalid_target"],
      ["dead discarder", { discardPhaseOwnerAlive: false }, "target_dead"],
      ["already moved return card", { returnCardId: "moved" }, "invalid_card"],
      ["foreign return card", { returnCardId: "foreign" }, "invalid_card"],
      ["wrong timing", { atOtherDiscardPhaseEnd: false }, "wrong_timing"],
    ] as const)("Guzheng rejects %s", (_label, override, code) => {
      const input = { ...guzheng(), ...override };
      fail(pure(input, () => planGuzheng(input)), code);
    });
  });

  describe("Huashen and Xinsheng", () => {
    const normal = form("normal", [
      { skillId: "available", category: "normal" },
      { skillId: "locked_available", category: "locked" },
      { skillId: "lord_forbidden", category: "lord" },
      { skillId: "limited_forbidden", category: "limited" },
      { skillId: "awakening_forbidden", category: "awakening" },
      { skillId: "post_forbidden", category: "post_awakening" },
    ], "wu", "female");
    const second = form("second", [{ skillId: "second_skill", category: "normal" }], "shu", "male");

    function initial() {
      return {
        ownerId: "owner", ownerAlive: true, skillEffective: true, atGameStart: true,
        ownerGeneralId: "zuo_ci", unavailableGeneralIds: ["seated_general"],
        offeredForms: [normal, second], selectedFormGeneralId: "normal", selectedSkillId: "available",
      };
    }

    it("gains exactly two unused forms and one eligible skill without replacing the player", () => {
      const input = initial();
      const plan = valueOf(pure(input, () => planHuashenInitial(input)));
      expect(plan).toMatchObject({
        selectedFormGeneralId: "normal", grantSkillId: "available",
        effectiveFaction: "wu", effectiveGender: "female",
        preservesIdentityHpMaxHpZonesAndTurnState: true, replacesPlayerObject: false,
      });
      expect(plan.ownedForms.map((entry) => entry.generalId)).toEqual(["normal", "second"]);
      expect(plan.ownedForms).not.toBe(input.offeredForms);
    });

    it.each([
      ["one initial form", { offeredForms: [normal] }, "invalid_input"],
      ["duplicate forms", { offeredForms: [normal, normal] }, "invalid_input"],
      ["seated general", { offeredForms: [form("seated_general"), second] }, "invalid_target"],
      ["form not offered", { selectedFormGeneralId: "missing" }, "invalid_target"],
      ["lord skill", { selectedSkillId: "lord_forbidden" }, "invalid_target"],
      ["limited skill", { selectedSkillId: "limited_forbidden" }, "invalid_target"],
      ["awakening skill", { selectedSkillId: "awakening_forbidden" }, "invalid_target"],
      ["post-awakening skill", { selectedSkillId: "post_forbidden" }, "invalid_target"],
      ["wrong timing", { atGameStart: false }, "wrong_timing"],
    ] as const)("initial Huashen rejects %s", (_label, override, code) => {
      const input = { ...initial(), ...override };
      fail(pure(input, () => planHuashenInitial(input)), code);
    });

    function switchInput() {
      return {
        ownerId: "owner", ownerAlive: true, skillEffective: true, window: "turn_start" as const,
        ownedForms: [normal, second], currentFormGeneralId: "normal", currentGrantedSkillId: "available",
        selectedFormGeneralId: "second", selectedSkillId: "second_skill",
      };
    }

    it.each(["turn_start", "turn_end"] as const)("switches one granted skill at %s and preserves core state", (window) => {
      const input = { ...switchInput(), window };
      expect(valueOf(pure(input, () => planHuashenSwitch(input)))).toEqual({
        skillId: "huashen", ownerId: "owner", window,
        revokeSkillId: "available", grantSkillId: "second_skill", selectedFormGeneralId: "second",
        effectiveFaction: "shu", effectiveGender: "male",
        preservesIdentityHpMaxHpZonesAndTurnState: true, replacesPlayerObject: false,
      });
    });

    it.each([
      ["unknown selected form", { selectedFormGeneralId: "missing" }, "invalid_target"],
      ["ineligible selected skill", { selectedFormGeneralId: "normal", selectedSkillId: "lord_forbidden" }, "invalid_target"],
      ["forged current skill", { currentGrantedSkillId: "missing" }, "invalid_input"],
      ["dead owner", { ownerAlive: false }, "owner_dead"],
    ] as const)("Huashen switch rejects %s", (_label, override, code) => {
      const input = { ...switchInput(), ...override };
      fail(pure(input, () => planHuashenSwitch(input)), code);
    });

    function xinsheng() {
      return {
        ownerId: "owner", ownerAliveAfterDamage: true, skillEffective: true,
        damageAftermathSettled: true, damageAmount: 3, damagePoint: 2,
        ownerGeneralId: "zuo_ci", unavailableGeneralIds: ["seated"], ownedFormGeneralIds: ["normal", "second"],
        offeredForm: form("new_form", [{ skillId: "new_skill", category: "locked" }], "qun", "female"),
      };
    }

    it("adds one RNG-selected unused form for each independently indexed damage point", () => {
      const input = xinsheng();
      expect(valueOf(pure(input, () => planXinsheng(input)))).toEqual({
        skillId: "xinsheng", ownerId: "owner", damagePoint: 2,
        addForm: form("new_form", [{ skillId: "new_skill", category: "locked" }], "qun", "female"), optional: true,
      });
    });

    it.each([
      ["point beyond damage", { damagePoint: 4 }, "invalid_input"],
      ["owner died", { ownerAliveAfterDamage: false }, "owner_dead"],
      ["unsettled aftermath", { damageAftermathSettled: false }, "wrong_timing"],
      ["already owned form", { offeredForm: normal }, "invalid_target"],
      ["seated form", { offeredForm: form("seated") }, "invalid_target"],
      ["form with only lord skill", { offeredForm: form("new_form", [{ skillId: "lord", category: "lord" }]) }, "pool_exhausted"],
    ] as const)("Xinsheng rejects %s", (_label, override, code) => {
      const input = { ...xinsheng(), ...override };
      fail(pure(input, () => planXinsheng(input)), code);
    });
  });
});
