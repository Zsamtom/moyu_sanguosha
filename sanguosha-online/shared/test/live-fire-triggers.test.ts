import { describe, expect, it } from "vitest";

import {
  applyAction,
  createGame,
  getCardDefinition,
  getGameView,
  grantSkill,
  handLimitFor,
  type Card,
  type CardKind,
  type GamePlayer,
  type GameSession,
} from "../src/index.js";

const seed = "f3".repeat(32);

function card(id: string, kind: CardKind, suit: Card["suit"] = "club"): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank: 7 };
}

function setup(): { game: GameSession; current: GamePlayer; others: GamePlayer[] } {
  const game = createGame({ playerIds: ["fire-c-1", "fire-c-2", "fire-c-3", "fire-c-4"], seed });
  const current = game.players.find((player) => player.id === game.currentPlayerId)!;
  const others = game.players.filter((player) => player.id !== current.id).sort((left, right) => left.seat - right.seat);
  for (const player of game.players) {
    player.generalId = "gan_ning";
    player.hp = player.maxHp = 4;
    player.alive = true;
    player.hand = [];
    player.equipment = {};
    player.judgment = [];
    player.extraPiles = {};
    player.chained = false;
  }
  game.deck = [];
  game.discardPile = [];
  game.resolvingCards = [];
  game.pendingResponse = null;
  game.afterMove = { queuedRecoveries: [], queuedTriggers: [], suspendedPhase: null, suspendedResponse: null };
  game.turn = {
    ...game.turn,
    playerId: current.id,
    phase: "play",
    slashUsed: false,
    wineUsed: false,
    slashDamageBonus: 0,
    requiredDiscardCount: 0,
    discardStage: "hand_limit",
    skipDraw: false,
    skipPlay: false,
    luoyiActive: false,
    shuangxiongJudgmentColor: null,
    slashRespondedInPlayPhase: false,
    skillUseCounts: {},
    rendeGivenCount: 0,
    rendeRecovered: false,
  };
  return { game, current, others };
}

function grant(game: GameSession, ownerId: string, skillId: Parameters<typeof grantSkill>[1]["skillId"]): void {
  grantSkill(game.completeRules.lifecycle, {
    ownerId,
    skillId,
    sourcePlayerId: ownerId,
    sourceSkillId: "test",
    expiry: { type: "permanent" },
  });
}

function standardPrompt(game: GameSession, playerId: string) {
  const prompt = getGameView(game, playerId).prompt;
  if (prompt.type !== "standard_skill") throw new Error(`Expected standard skill prompt, got ${prompt.type}`);
  return prompt;
}

describe("live Fire trigger/modifier skills", () => {
  it("offers Mengjin only after the final Wushuang Dodge and restores Qinglong after last-hand Lianying", () => {
    const { game, current: attacker, others: [target] } = setup();
    if (!target) throw new Error("Missing Mengjin target");
    attacker.generalId = "lv_bu";
    grant(game, attacker.id, "mengjin");
    grant(game, target.id, "lianying");
    attacker.equipment.weapon = card("mengjin-qinglong", "qing_long_yan_yue_dao");
    attacker.hand = [card("mengjin-slash", "slash"), card("mengjin-followup", "slash")];
    target.hand = [
      card("mengjin-dodge-1", "dodge", "heart"),
      card("mengjin-dodge-2", "dodge", "diamond"),
      card("mengjin-last", "peach", "club"),
    ];

    let current = applyAction(game, {
      type: "play_card", playerId: attacker.id, cardId: "mengjin-slash", targetId: target.id,
    });
    current = applyAction(current, { type: "respond", playerId: target.id, cardId: "mengjin-dodge-1" });
    expect(current.pendingResponse).toMatchObject({ type: "slash", dodgesPlayed: 1, requiredDodgeCount: 2 });

    current = applyAction(current, { type: "respond", playerId: target.id, cardId: "mengjin-dodge-2" });
    let prompt = standardPrompt(current, attacker.id);
    expect(prompt).toMatchObject({
      skillId: "mengjin",
      stage: "mengjin_discard",
      canPass: true,
      choices: [{ token: "hand:0", ownerId: target.id, zone: "hand", card: null }],
    });

    current = applyAction(JSON.parse(JSON.stringify(current)) as GameSession, {
      type: "resolve_standard_skill",
      playerId: attacker.id,
      promptId: prompt.promptId,
      activate: true,
      tokens: ["hand:0"],
    });
    expect(current.pendingResponse).toMatchObject({ type: "skill_choice", skillId: "lianying", targetId: target.id });
    expect(current.afterMove.suspendedResponse).toMatchObject({
      type: "standard_skill", skillId: "mengjin", stage: "mengjin_finish",
    });

    const lianying = getGameView(JSON.parse(JSON.stringify(current)) as GameSession, target.id).prompt;
    if (lianying.type !== "skill_choice" || !lianying.promptId) throw new Error("Expected Lianying prompt");
    current = applyAction(current, {
      type: "resolve_skill",
      playerId: target.id,
      skillId: "lianying",
      promptId: lianying.promptId,
      activate: false,
    });
    expect(current.pendingResponse).toMatchObject({
      type: "weapon_action",
      weaponKind: "qing_long_yan_yue_dao",
      stage: "qinglong_followup",
      victimId: target.id,
    });
    expect(current.discardPile.map((entry) => entry.id)).toContain("mengjin-last");
  });

  it("offers Guanshi before Mengjin when the final Dodge offsets a Slash", () => {
    const { game, current: attacker, others: [target] } = setup();
    if (!target) throw new Error("Missing Guanshi target");
    attacker.generalId = "pang_de";
    attacker.equipment.weapon = card("mengjin-guanshi", "guan_shi_fu");
    attacker.hand = [card("guanshi-slash", "slash"), card("guanshi-cost", "peach")];
    target.hand = [card("guanshi-dodge", "dodge"), card("guanshi-target-card", "peach")];

    let current = applyAction(game, {
      type: "play_card", playerId: attacker.id, cardId: "guanshi-slash", targetId: target.id,
    });
    current = applyAction(current, { type: "respond", playerId: target.id, cardId: "guanshi-dodge" });
    expect(current.pendingResponse).toMatchObject({
      type: "weapon_action", weaponKind: "guan_shi_fu", stage: "guanshi_force_hit",
    });

    current = applyAction(current, { type: "resolve_weapon", playerId: attacker.id, activate: false });
    expect(standardPrompt(current, attacker.id)).toMatchObject({ skillId: "mengjin", stage: "mengjin_discard" });
  });

  it("resolves Jieming once per settled damage point and caps the chosen hand size at five", () => {
    const { game, current: attacker, others: [owner, beneficiary] } = setup();
    if (!owner || !beneficiary) throw new Error("Missing Jieming fixtures");
    owner.generalId = "xun_yu";
    beneficiary.maxHp = 7;
    beneficiary.hp = 7;
    attacker.hand = [card("jieming-slash", "slash")];
    attacker.equipment.weapon = card("jieming-range", "qing_long_yan_yue_dao");
    game.turn.slashDamageBonus = 1;
    game.deck = Array.from({ length: 6 }, (_value, index) => card(`jieming-draw-${index + 1}`, "dodge"));

    let current = applyAction(game, {
      type: "play_card", playerId: attacker.id, cardId: "jieming-slash", targetId: owner.id,
    });
    current = applyAction(current, { type: "respond", playerId: owner.id, cardId: null });
    let prompt = standardPrompt(current, owner.id);
    expect(prompt).toMatchObject({ skillId: "jieming", stage: "jieming_target", minTargets: 1, maxTargets: 1 });

    current = applyAction(JSON.parse(JSON.stringify(current)) as GameSession, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      targetId: beneficiary.id,
    });
    expect(current.players.find((player) => player.id === beneficiary.id)?.hand).toHaveLength(5);
    prompt = standardPrompt(current, owner.id);
    expect(prompt).toMatchObject({ skillId: "jieming", stage: "jieming_target" });

    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      targetId: beneficiary.id,
    });
    expect(current.players.find((player) => player.id === owner.id)?.hp).toBe(2);
    expect(current.players.find((player) => player.id === beneficiary.id)?.hand).toHaveLength(5);
    expect(current.logs.filter((entry) => entry.message.includes("发动节命"))).toHaveLength(2);
    expect(current.completeRules.damageFlow.consumedActions.filter((entry) => entry.opportunityId.includes(":jieming:"))).toHaveLength(2);
  });

  it("uses the final retrial color for Shuangxiong and clears it at the next turn", () => {
    const { game, current: starter } = setup();
    const starterIndex = game.players.findIndex((player) => player.id === starter.id);
    const owner = game.players[(starterIndex + 1) % game.players.length]!;
    const retrialOwner = game.players[(starterIndex + 2) % game.players.length]!;
    owner.generalId = "yan_liang_wen_chou";
    retrialOwner.generalId = "si_ma_yi";
    owner.hand = [card("shuangxiong-black", "peach", "club")];
    retrialOwner.hand = [card("shuangxiong-retrial", "dodge", "diamond")];
    game.deck = [card("shuangxiong-initial", "slash", "spade")];

    let current = applyAction(game, { type: "end_play", playerId: starter.id });
    let prompt = standardPrompt(current, owner.id);
    expect(prompt).toMatchObject({ skillId: "shuangxiong", stage: "shuangxiong_draw", canPass: true });
    current = applyAction(current, {
      type: "resolve_standard_skill", playerId: owner.id, promptId: prompt.promptId, activate: true,
    });
    prompt = standardPrompt(current, retrialOwner.id);
    expect(prompt).toMatchObject({ skillId: "guicai", stage: "judgment_retrial", allowedCardIds: ["shuangxiong-retrial"] });

    current = applyAction(JSON.parse(JSON.stringify(current)) as GameSession, {
      type: "resolve_standard_skill",
      playerId: retrialOwner.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "shuangxiong-retrial",
    });
    expect(current.turn).toMatchObject({ playerId: owner.id, phase: "play", shuangxiongJudgmentColor: "red" });
    expect(current.players.find((player) => player.id === owner.id)?.hand.map((entry) => entry.id)).toContain("shuangxiong-retrial");
    const play = getGameView(current, owner.id).prompt;
    if (play.type !== "play") throw new Error(`Expected play prompt, got ${play.type}`);
    expect(play.skills.find((skill) => skill.skillId === "shuangxiong")?.cardIds).toEqual(["shuangxiong-black"]);

    current = applyAction(current, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "shuangxiong",
      cardIds: ["shuangxiong-black"],
      targetId: starter.id,
    });
    expect(current.pendingResponse).toMatchObject({ type: "duel", targetId: starter.id, initiatorId: owner.id });
    current = applyAction(current, { type: "respond", playerId: starter.id, cardId: null });

    current = applyAction(current, { type: "end_play", playerId: owner.id });
    expect(current.turn.shuangxiongJudgmentColor ?? null).toBeNull();
  });

  it("does not open a Shuangxiong judgment when no physical judgment card exists", () => {
    const { game, current: starter } = setup();
    const starterIndex = game.players.findIndex((player) => player.id === starter.id);
    const owner = game.players[(starterIndex + 1) % game.players.length]!;
    owner.generalId = "yan_liang_wen_chou";

    const current = applyAction(game, { type: "end_play", playerId: starter.id });
    expect(current).toMatchObject({ currentPlayerId: owner.id, pendingResponse: null, turn: { phase: "play" } });
    expect(current.turn.shuangxiongJudgmentColor ?? null).toBeNull();
  });

  it("applies Hongyan to Shuangxiong and preserves its virtual Duel through a Jizhi JSON pause", () => {
    const { game, current: starter } = setup();
    const starterIndex = game.players.findIndex((player) => player.id === starter.id);
    const owner = game.players[(starterIndex + 1) % game.players.length]!;
    const target = game.players[(starterIndex + 2) % game.players.length]!;
    owner.generalId = "huang_yue_ying";
    grant(game, owner.id, "shuangxiong");
    grant(game, owner.id, "hongyan");
    owner.hand = [
      card("shuangxiong-club-cost", "peach", "club"),
      card("shuangxiong-spade-blocked", "peach", "spade"),
    ];
    game.deck = [card("shuangxiong-hongyan-judgment", "dodge", "spade")];

    let current = applyAction(game, { type: "end_play", playerId: starter.id });
    let prompt = standardPrompt(current, owner.id);
    current = applyAction(current, {
      type: "resolve_standard_skill", playerId: owner.id, promptId: prompt.promptId, activate: true,
    });
    expect(current.turn.shuangxiongJudgmentColor).toBe("red");
    const play = getGameView(current, owner.id).prompt;
    if (play.type !== "play") throw new Error(`Expected play prompt, got ${play.type}`);
    const skill = play.skills.find((entry) => entry.skillId === "shuangxiong");
    expect(skill).toMatchObject({ cardIds: ["shuangxiong-club-cost"], virtualCardKind: "duel" });

    current = applyAction(current, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "shuangxiong",
      cardIds: ["shuangxiong-club-cost"],
      targetId: target.id,
    });
    expect(current.pendingResponse).toMatchObject({
      type: "skill_choice",
      skillId: "jizhi",
      resume: { type: "card_use", intent: { effectiveKind: "duel", viaSkill: "shuangxiong" } },
    });
    current = JSON.parse(JSON.stringify(current)) as GameSession;
    const jizhi = getGameView(current, owner.id).prompt;
    if (jizhi.type !== "skill_choice" || !jizhi.promptId) throw new Error("Expected Jizhi prompt");
    current = applyAction(current, {
      type: "resolve_skill",
      playerId: owner.id,
      skillId: "jizhi",
      promptId: jizhi.promptId,
      activate: false,
    });
    expect(current.pendingResponse).toMatchObject({ type: "duel", targetId: target.id, initiatorId: owner.id });
    current = applyAction(current, { type: "respond", playerId: target.id, cardId: null });
    expect(current.players.find((player) => player.id === target.id)?.hp).toBe(3);
    expect(current.discardPile).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "shuangxiong-club-cost", kind: "peach", suit: "club" }),
    ]));
  });

  it("computes Xueyi dynamically and uses the shared hand limit for discard", () => {
    const { game, current: lord, others } = setup();
    lord.generalId = "yuan_shao";
    lord.role = "lord";
    others[0]!.generalId = "lv_bu";
    others[1]!.generalId = "pang_de";
    others[2]!.generalId = "gan_ning";
    expect(handLimitFor(game, lord.id)).toBe(8);

    lord.role = "loyalist";
    expect(handLimitFor(game, lord.id)).toBe(4);
    lord.role = "lord";
    others[2]!.generalId = "yuan_shu";
    expect(handLimitFor(game, others[2]!.id)).toBe(10);
    others[2]!.generalId = "gan_ning";

    others[1]!.alive = false;
    expect(handLimitFor(game, lord.id)).toBe(6);
    lord.hand = Array.from({ length: 7 }, (_value, index) => card(`xueyi-hand-${index + 1}`, "dodge"));
    const current = applyAction(game, { type: "end_play", playerId: lord.id });
    expect(current.turn).toMatchObject({ phase: "discard", discardStage: "hand_limit", requiredDiscardCount: 1 });
  });
});
