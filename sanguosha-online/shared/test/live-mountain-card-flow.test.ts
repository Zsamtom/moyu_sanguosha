import { describe, expect, it } from "vitest";

import {
  GameRuleError,
  applyAction,
  awakenSkill,
  createGame,
  getCardDefinition,
  getGameView,
  grantSkill,
  type Card,
  type CardKind,
  type GamePlayer,
  type GameSession,
} from "../src/index.js";

const seed = "6c".repeat(32);

function card(
  id: string,
  kind: CardKind,
  rank: Card["rank"] = 7,
  suit: Card["suit"] = "club",
): Card {
  return { id, kind, ...getCardDefinition(kind), rank, suit };
}

function setup(count = 4): { game: GameSession; owner: GamePlayer; others: GamePlayer[] } {
  const game = createGame({
    playerIds: Array.from({ length: count }, (_value, index) => `mountain-c-${index + 1}`),
    seed,
  });
  const owner = game.players.find((player) => player.id === game.currentPlayerId)!;
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
    playerId: owner.id,
    phase: "play",
    slashUsed: false,
    activeSlashUses: 0,
    wineUsed: false,
    slashDamageBonus: 0,
    requiredDiscardCount: 0,
    discardStage: "hand_limit",
    skipDraw: false,
    skipPlay: false,
    luoyiActive: false,
    haoshiActive: false,
    shuangxiongJudgmentColor: null,
    slashRespondedInPlayPhase: false,
    tianyiOutcome: null,
    skillUseCounts: {},
    rendeGivenCount: 0,
    rendeRecovered: false,
  };
  return { game, owner, others: game.players.filter((player) => player.id !== owner.id) };
}

function grant(game: GameSession, ownerId: string, skillId: string): void {
  grantSkill(game.completeRules.lifecycle, {
    ownerId,
    skillId,
    sourcePlayerId: ownerId,
    sourceSkillId: `test:${skillId}`,
    expiry: { type: "permanent" },
  });
}

function standardPrompt(game: GameSession, playerId: string) {
  const prompt = getGameView(game, playerId).prompt;
  if (prompt.type !== "standard_skill") throw new Error(`Expected standard prompt, got ${prompt.type}`);
  return prompt;
}

function declineAfterMove(game: GameSession, playerId: string, skillId: "lianying" | "xiaoji"): GameSession {
  const prompt = getGameView(game, playerId).prompt;
  if (prompt.type !== "skill_choice" || prompt.skillId !== skillId || !prompt.promptId) {
    throw new Error(`Expected ${skillId} prompt`);
  }
  return applyAction(game, {
    type: "resolve_skill",
    playerId,
    skillId,
    promptId: prompt.promptId,
    activate: false,
  });
}

describe("live Mountain card flow", () => {
  it("runs Tiaoxin through a real Slash without consuming the responder's play quota and can discard judgment cards on decline", () => {
    const { game, owner, others: [target] } = setup();
    if (!target) throw new Error("Missing Tiaoxin target");
    owner.generalId = "jiang_wei";
    target.hand = [card("tiaoxin-slash", "slash", 8, "heart")];

    let current = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "tiaoxin",
      targetId: target.id,
    });
    let prompt = standardPrompt(current, target.id);
    expect(prompt).toMatchObject({
      skillId: "tiaoxin",
      stage: "tiaoxin_response",
      canPass: true,
      allowedCardIds: ["tiaoxin-slash"],
    });
    current = applyAction(JSON.parse(JSON.stringify(current)) as GameSession, {
      type: "resolve_standard_skill",
      playerId: target.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "tiaoxin-slash",
    });
    expect(current.pendingResponse).toMatchObject({
      type: "slash",
      attackerId: target.id,
      targetId: owner.id,
      completion: { type: "default" },
    });
    expect(current.turn.slashUsed).toBe(false);
    current = applyAction(current, { type: "respond", playerId: owner.id, cardId: null });
    expect(current.players.find((player) => player.id === owner.id)?.hp).toBe(3);
    expect(current.turn).toMatchObject({ phase: "play", slashUsed: false });

    const declined = setup();
    const declineOwner = declined.owner;
    const declineTarget = declined.others[0]!;
    declineOwner.generalId = "jiang_wei";
    declineTarget.judgment = [card("tiaoxin-delayed", "le_bu_si_shu", 6, "heart")];
    let declineState = applyAction(declined.game, {
      type: "use_skill",
      playerId: declineOwner.id,
      skillId: "tiaoxin",
      targetId: declineTarget.id,
    });
    prompt = standardPrompt(declineState, declineTarget.id);
    declineState = applyAction(declineState, {
      type: "resolve_standard_skill",
      playerId: declineTarget.id,
      promptId: prompt.promptId,
      activate: false,
    });
    prompt = standardPrompt(declineState, declineOwner.id);
    expect(prompt.choices).toEqual([
      expect.objectContaining({ token: "judgment:0", ownerId: declineTarget.id, zone: "judgment" }),
    ]);
    declineState = applyAction(declineState, {
      type: "resolve_standard_skill",
      playerId: declineOwner.id,
      promptId: prompt.promptId,
      activate: true,
      tokens: ["judgment:0"],
    });
    expect(declineState.discardPile).toContainEqual(expect.objectContaining({ id: "tiaoxin-delayed" }));
    expect(declineState.turn.phase).toBe("play");
  });

  it("coalesces Tiaoxin's ZhangBa pair into one out-of-turn Tuntian move batch", () => {
    const { game, owner, others: [target] } = setup();
    if (!target) throw new Error("Missing ZhangBa target");
    owner.generalId = "jiang_wei";
    target.generalId = "deng_ai";
    target.equipment.weapon = card("tiaoxin-zhangba", "zhang_ba_she_mao");
    target.hand = [card("tiaoxin-zb-a", "peach"), card("tiaoxin-zb-b", "dodge")];

    let current = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "tiaoxin",
      targetId: target.id,
    });
    const prompt = standardPrompt(current, target.id);
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: target.id,
      promptId: prompt.promptId,
      activate: true,
      cardIds: ["tiaoxin-zb-a", "tiaoxin-zb-b"],
      viewAsSkillId: "zhang_ba_she_mao",
    });
    expect(current.pendingResponse).toMatchObject({
      type: "standard_skill",
      skillId: "tuntian",
      targetId: target.id,
      selectedCardIds: ["tiaoxin-zb-a", "tiaoxin-zb-b"],
    });
    expect(current.afterMove.suspendedResponse).toMatchObject({
      type: "slash",
      attackerId: target.id,
      targetId: owner.id,
      damageCardIds: ["tiaoxin-zb-a", "tiaoxin-zb-b"],
    });
    expect(current.afterMove.queuedTriggers.filter((trigger) => trigger.skillId === "tuntian")).toHaveLength(0);
  });

  it("accepts Wusheng and Longdan as real Tiaoxin Slash sources", () => {
    const wusheng = setup();
    const wushengTarget = wusheng.others[0]!;
    wusheng.owner.generalId = "jiang_wei";
    wushengTarget.generalId = "guan_yu";
    wushengTarget.equipment.armor = card("tiaoxin-wusheng-armor", "ba_gua_zhen", 5, "heart");

    let current = applyAction(wusheng.game, {
      type: "use_skill",
      playerId: wusheng.owner.id,
      skillId: "tiaoxin",
      targetId: wushengTarget.id,
    });
    let prompt = standardPrompt(current, wushengTarget.id);
    expect(prompt).toMatchObject({
      options: expect.arrayContaining(["wusheng"]),
      allowedCardIds: expect.arrayContaining(["tiaoxin-wusheng-armor"]),
    });
    current = applyAction(JSON.parse(JSON.stringify(current)) as GameSession, {
      type: "resolve_standard_skill",
      playerId: wushengTarget.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "tiaoxin-wusheng-armor",
      viewAsSkillId: "wusheng",
    });
    expect(current.pendingResponse).toMatchObject({
      type: "slash",
      attackerId: wushengTarget.id,
      targetId: wusheng.owner.id,
      damageCardIds: ["tiaoxin-wusheng-armor"],
    });
    expect(current.players.find((player) => player.id === wushengTarget.id)?.equipment.armor).toBeUndefined();

    const longdan = setup();
    const longdanTarget = longdan.others[0]!;
    longdan.owner.generalId = "jiang_wei";
    longdanTarget.generalId = "zhao_yun";
    longdanTarget.hand = [card("tiaoxin-longdan-dodge", "dodge")];
    current = applyAction(longdan.game, {
      type: "use_skill",
      playerId: longdan.owner.id,
      skillId: "tiaoxin",
      targetId: longdanTarget.id,
    });
    prompt = standardPrompt(current, longdanTarget.id);
    expect(prompt).toMatchObject({
      options: expect.arrayContaining(["longdan"]),
      allowedCardIds: ["tiaoxin-longdan-dodge"],
    });
    current = applyAction(JSON.parse(JSON.stringify(current)) as GameSession, {
      type: "resolve_standard_skill",
      playerId: longdanTarget.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "tiaoxin-longdan-dodge",
      viewAsSkillId: "longdan",
    });
    expect(current.pendingResponse).toMatchObject({
      type: "slash",
      attackerId: longdanTarget.id,
      targetId: longdan.owner.id,
      damageCardIds: ["tiaoxin-longdan-dodge"],
    });
  });

  it("resumes Tiaoxin after Jijiang succeeds or all Shu providers decline without allowing a retry", () => {
    const successful = setup();
    const [lord, provider] = successful.others;
    if (!lord || !provider) throw new Error("Missing Jijiang participants");
    successful.owner.generalId = "gan_ning";
    grant(successful.game, successful.owner.id, "tiaoxin");
    successful.game.players.find((player) => player.role === "lord")!.role = "rebel";
    lord.role = "lord";
    lord.generalId = "liu_bei";
    provider.generalId = "zhao_yun";
    provider.hand = [card("tiaoxin-jijiang-slash", "fire_slash", 11, "heart")];

    let current = applyAction(successful.game, {
      type: "use_skill",
      playerId: successful.owner.id,
      skillId: "tiaoxin",
      targetId: lord.id,
    });
    let prompt = standardPrompt(current, lord.id);
    expect(prompt.options).toContain("jijiang");
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: lord.id,
      promptId: prompt.promptId,
      activate: true,
      tokens: ["jijiang"],
    });
    let dispatch = getGameView(current, provider.id).prompt;
    if (dispatch.type !== "lord_dispatch") throw new Error("Expected Tiaoxin Jijiang provider prompt");
    current = applyAction(JSON.parse(JSON.stringify(current)) as GameSession, {
      type: "resolve_lord_dispatch",
      playerId: provider.id,
      promptId: dispatch.promptId,
      cardId: "tiaoxin-jijiang-slash",
    });
    expect(current.pendingResponse).toMatchObject({
      type: "slash",
      attackerId: lord.id,
      targetId: successful.owner.id,
      slashKind: "fire_slash",
      completion: { type: "default" },
    });
    expect(current.turn.slashUsed).toBe(false);

    const declined = setup();
    const [declineLord, declineProvider] = declined.others;
    if (!declineLord || !declineProvider) throw new Error("Missing declining Jijiang participants");
    declined.owner.generalId = "gan_ning";
    grant(declined.game, declined.owner.id, "tiaoxin");
    declined.game.players.find((player) => player.role === "lord")!.role = "rebel";
    declineLord.role = "lord";
    declineLord.generalId = "liu_bei";
    declineProvider.generalId = "zhao_yun";
    declineProvider.hand = [];
    current = applyAction(declined.game, {
      type: "use_skill",
      playerId: declined.owner.id,
      skillId: "tiaoxin",
      targetId: declineLord.id,
    });
    prompt = standardPrompt(current, declineLord.id);
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: declineLord.id,
      promptId: prompt.promptId,
      activate: true,
      tokens: ["jijiang"],
    });
    dispatch = getGameView(current, declineProvider.id).prompt;
    if (dispatch.type !== "lord_dispatch") throw new Error("Expected declining Tiaoxin Jijiang prompt");
    current = applyAction(current, {
      type: "resolve_lord_dispatch",
      playerId: declineProvider.id,
      promptId: dispatch.promptId,
      cardId: null,
    });
    prompt = standardPrompt(current, declineLord.id);
    expect(prompt.options).toEqual(["decline"]);
    expect(() => applyAction(current, {
      type: "resolve_standard_skill",
      playerId: declineLord.id,
      promptId: prompt.promptId,
      activate: true,
      tokens: ["jijiang"],
    })).toThrow(GameRuleError);
  });

  it("offers Jiang once to each red-Slash participant before Xiangle's exact basic-card payment", () => {
    const { game, owner: source, others: [target] } = setup();
    if (!target) throw new Error("Missing Xiangle target");
    source.generalId = "sun_ce";
    target.generalId = "liu_chan";
    grant(game, target.id, "jiang");
    source.hand = [card("jiang-red-slash", "slash", 9, "diamond"), card("xiangle-basic", "peach")];
    game.deck = [card("jiang-draw-target", "dodge"), card("jiang-draw-source", "slash")];

    let current = applyAction(game, {
      type: "play_card",
      playerId: source.id,
      cardId: "jiang-red-slash",
      targetId: target.id,
    });
    const stalePrompt = standardPrompt(current, source.id);
    expect(stalePrompt).toMatchObject({ skillId: "jiang", stage: "jiang_invoke" });
    current = applyAction(JSON.parse(JSON.stringify(current)) as GameSession, {
      type: "resolve_standard_skill",
      playerId: source.id,
      promptId: stalePrompt.promptId,
      activate: true,
    });
    expect(() => applyAction(current, {
      type: "resolve_standard_skill",
      playerId: source.id,
      promptId: stalePrompt.promptId,
      activate: true,
    })).toThrow(GameRuleError);
    let prompt = standardPrompt(current, target.id);
    expect(prompt).toMatchObject({ skillId: "jiang", stage: "jiang_invoke" });
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: target.id,
      promptId: prompt.promptId,
      activate: true,
    });
    prompt = standardPrompt(current, source.id);
    expect(prompt).toMatchObject({
      skillId: "xiangle",
      stage: "xiangle_payment",
      allowedCardIds: expect.arrayContaining(["xiangle-basic"]),
    });
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: source.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "xiangle-basic",
    });
    expect(current.pendingResponse).toMatchObject({
      type: "slash",
      jiangProcessedPlayerIds: [source.id, target.id],
      xiangleCheckedPlayerIds: [target.id],
    });
    expect(current.logs.filter((entry) => entry.message.includes("发动激昂"))).toHaveLength(2);
    expect(current.discardPile).toContainEqual(expect.objectContaining({ id: "xiangle-basic" }));
  });

  it("checks Xiangle after a Wusheng Slash and invalidates it when the source declines payment", () => {
    const { game, owner: source, others: [target] } = setup();
    if (!target) throw new Error("Missing Wusheng Xiangle target");
    source.generalId = "guan_yu";
    target.generalId = "liu_chan";
    source.hand = [card("xiangle-wusheng-cost", "guo_he_chai_qiao", 10, "heart")];

    let current = applyAction(game, {
      type: "use_skill",
      playerId: source.id,
      skillId: "wusheng",
      cardIds: ["xiangle-wusheng-cost"],
      targetId: target.id,
    });
    const prompt = standardPrompt(current, source.id);
    expect(prompt).toMatchObject({
      skillId: "xiangle",
      stage: "xiangle_payment",
      allowedCardIds: [],
      canPass: true,
    });
    current = applyAction(JSON.parse(JSON.stringify(current)) as GameSession, {
      type: "resolve_standard_skill",
      playerId: source.id,
      promptId: prompt.promptId,
      activate: false,
    });
    expect(current.pendingResponse).toBeNull();
    expect(current.turn.phase).toBe("play");
    expect(current.players.find((player) => player.id === target.id)?.hp).toBe(4);
    expect(current.discardPile).toContainEqual(expect.objectContaining({
      id: "xiangle-wusheng-cost",
      kind: "guo_he_chai_qiao",
    }));
  });

  it("runs Jiang for both designated users of a Lijian-created Duel", () => {
    const { game, owner, others: [initiator, target] } = setup();
    if (!initiator || !target) throw new Error("Missing Lijian targets");
    owner.generalId = "diao_chan";
    initiator.generalId = "sun_ce";
    target.generalId = "zhou_yu";
    grant(game, target.id, "jiang");
    owner.hand = [card("lijian-cost", "dodge")];
    game.deck = [card("lijian-draw-target", "peach"), card("lijian-draw-source", "slash")];

    let current = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "lijian",
      cardIds: ["lijian-cost"],
      targetIds: [initiator.id, target.id],
    });
    let prompt = standardPrompt(current, initiator.id);
    expect(prompt).toMatchObject({ skillId: "jiang", stage: "jiang_invoke" });
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: initiator.id,
      promptId: prompt.promptId,
      activate: true,
    });
    prompt = standardPrompt(current, target.id);
    current = applyAction(JSON.parse(JSON.stringify(current)) as GameSession, {
      type: "resolve_standard_skill",
      playerId: target.id,
      promptId: prompt.promptId,
      activate: true,
    });
    expect(current.pendingResponse).toMatchObject({
      type: "duel",
      attackerId: initiator.id,
      targetId: target.id,
      initiatorId: initiator.id,
      originalTargetId: target.id,
    });
    expect(current.logs.filter((entry) => entry.message.includes("发动激昂"))).toHaveLength(2);
  });

  it("applies Yingyang only to its owner's Zhiba rank, clamps at thirteen, and resumes one Tuntian batch before reveal", () => {
    const { game, owner: challenger, others: [lord] } = setup();
    if (!lord) throw new Error("Missing Zhiba lord");
    const oldLord = game.players.find((player) => player.role === "lord")!;
    oldLord.role = "rebel";
    lord.role = "lord";
    challenger.generalId = "gan_ning";
    lord.generalId = "sun_ce";
    grant(game, lord.id, "tuntian");
    challenger.hand = [card("zhiba-challenger", "slash", 13, "heart")];
    lord.hand = [card("zhiba-lord", "dodge", 12, "club")];

    let current = applyAction(game, {
      type: "use_skill",
      playerId: challenger.id,
      skillId: "zhiba",
      targetId: lord.id,
    });
    let prompt = getGameView(current, challenger.id).prompt;
    if (prompt.type !== "choose_pindian_card") throw new Error("Expected challenger Pindian prompt");
    current = applyAction(current, {
      type: "choose_pindian_card",
      playerId: challenger.id,
      promptId: prompt.promptId,
      cardId: "zhiba-challenger",
    });
    prompt = getGameView(current, lord.id).prompt;
    if (prompt.type !== "choose_pindian_card") throw new Error("Expected lord Pindian prompt");
    current = applyAction(current, {
      type: "choose_pindian_card",
      playerId: lord.id,
      promptId: prompt.promptId,
      cardId: "zhiba-lord",
    });
    expect(current.pendingResponse).toMatchObject({
      type: "standard_skill",
      skillId: "tuntian",
      selectedCardIds: ["zhiba-lord"],
    });
    let standard = standardPrompt(current, lord.id);
    current = applyAction(JSON.parse(JSON.stringify(current)) as GameSession, {
      type: "resolve_standard_skill",
      playerId: lord.id,
      promptId: standard.promptId,
      activate: false,
    });
    standard = standardPrompt(current, lord.id);
    expect(standard).toMatchObject({
      skillId: "yingyang",
      stage: "yingyang_modify",
      options: ["plus_three", "minus_three", "decline"],
    });
    const forged = JSON.parse(JSON.stringify(current)) as GameSession;
    if (forged.pendingResponse?.type !== "standard_skill" || !forged.pendingResponse.pindian) {
      throw new Error("Missing forged Yingyang frame");
    }
    forged.pendingResponse.pindian.frame.effectiveRanks[lord.id] = 1;
    expect(() => applyAction(forged, {
      type: "resolve_standard_skill",
      playerId: lord.id,
      promptId: standard.promptId,
      activate: true,
      tokens: ["plus_three"],
    })).toThrow();
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: lord.id,
      promptId: standard.promptId,
      activate: true,
      tokens: ["plus_three"],
    });
    standard = standardPrompt(current, lord.id);
    expect(standard).toMatchObject({ skillId: "zhiba", stage: "zhiba_gain" });
    const staleGainPrompt = standard.promptId;
    current = applyAction(JSON.parse(JSON.stringify(current)) as GameSession, {
      type: "resolve_standard_skill",
      playerId: lord.id,
      promptId: standard.promptId,
      activate: true,
    });
    expect(current.players.find((player) => player.id === lord.id)?.hand.map((entry) => entry.id).sort()).toEqual([
      "zhiba-challenger",
      "zhiba-lord",
    ]);
    expect(() => applyAction(current, {
      type: "resolve_standard_skill",
      playerId: lord.id,
      promptId: staleGainPrompt,
      activate: true,
    })).toThrow(GameRuleError);
    expect(current.logs.some((entry) => entry.message.includes("调整为 13"))).toBe(true);
  });

  it("lets an awakened Zhiba lord refuse and still consumes that challenger's phase request", () => {
    const { game, owner: challenger, others: [lord] } = setup();
    if (!lord) throw new Error("Missing awakened Zhiba lord");
    game.players.find((player) => player.role === "lord")!.role = "rebel";
    lord.role = "lord";
    lord.generalId = "sun_ce";
    challenger.hand = [card("refuse-challenger", "slash")];
    lord.hand = [card("refuse-lord", "dodge")];
    awakenSkill(game.completeRules.lifecycle, lord.id, "hunzi", 1);

    let current = applyAction(game, {
      type: "use_skill",
      playerId: challenger.id,
      skillId: "zhiba",
      targetId: lord.id,
    });
    const prompt = standardPrompt(current, lord.id);
    expect(prompt).toMatchObject({ skillId: "zhiba", stage: "zhiba_accept", canPass: true });
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: lord.id,
      promptId: prompt.promptId,
      activate: false,
    });
    expect(current.pendingResponse).toBeNull();
    expect(() => applyAction(current, {
      type: "use_skill",
      playerId: challenger.id,
      skillId: "zhiba",
      targetId: lord.id,
    })).toThrow(GameRuleError);
  });

  it("replaces Zhijian equipment atomically, recovers Silver Lion, then resumes Lianying and Xiaoji before drawing", () => {
    const { game, owner, others: [target] } = setup();
    if (!target) throw new Error("Missing Zhijian target");
    owner.generalId = "zhang_zhao_zhang_hong";
    grant(game, owner.id, "lianying");
    grant(game, target.id, "xiaoji");
    owner.hand = [card("zhijian-armor", "ba_gua_zhen", 5, "spade")];
    target.equipment.armor = card("zhijian-silver-lion", "bai_yin_shi_zi", 1, "club");
    target.hp = 3;
    game.deck = [card("zhijian-draw", "slash")];

    let current = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "zhijian",
      cardIds: ["zhijian-armor"],
      targetId: target.id,
    });
    expect(current.players.find((player) => player.id === target.id)?.equipment.armor).toEqual(
      expect.objectContaining({ id: "zhijian-armor" }),
    );
    expect(current.players.find((player) => player.id === target.id)?.hp).toBe(4);
    expect(current.discardPile).toContainEqual(expect.objectContaining({ id: "zhijian-silver-lion" }));
    expect(current.pendingResponse).toMatchObject({ type: "skill_choice", skillId: "lianying", targetId: owner.id });
    current = declineAfterMove(JSON.parse(JSON.stringify(current)) as GameSession, owner.id, "lianying");
    expect(current.pendingResponse).toMatchObject({ type: "skill_choice", skillId: "xiaoji", targetId: target.id });
    current = declineAfterMove(current, target.id, "xiaoji");
    expect(current.pendingResponse).toBeNull();
    expect(current.turn.phase).toBe("play");
    expect(current.players.find((player) => player.id === owner.id)?.hand).toContainEqual(
      expect.objectContaining({ id: "zhijian-draw" }),
    );
    const allCards = [
      ...current.deck,
      ...current.discardPile,
      ...current.resolvingCards,
      ...current.players.flatMap((player) => [
        ...player.hand,
        ...Object.values(player.equipment),
        ...player.judgment,
      ]),
    ];
    expect(allCards.filter((entry) => entry.id === "zhijian-armor")).toHaveLength(1);
    expect(allCards.filter((entry) => entry.id === "zhijian-silver-lion")).toHaveLength(1);
  });
});
