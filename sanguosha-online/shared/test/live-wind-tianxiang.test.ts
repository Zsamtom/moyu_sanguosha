import { describe, expect, it } from "vitest";

import {
  GameRuleError,
  applyAction,
  assertCompleteRulesEngineState,
  createGame,
  getCardDefinition,
  getGameView,
  grantSkill,
  type Card,
  type CardKind,
  type GamePlayer,
  type GameSession,
} from "../src/index.js";

const seed = "a4".repeat(32);

function card(id: string, kind: CardKind, suit: Card["suit"] = "heart", rank: Card["rank"] = 7): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank };
}

function setup(count = 4): { game: GameSession; actor: GamePlayer; others: GamePlayer[] } {
  const game = createGame({ playerIds: Array.from({ length: count }, (_value, index) => `wind-${index + 1}`), seed });
  const actor = game.players.find((player) => player.id === game.currentPlayerId)!;
  const others = game.players.filter((player) => player.id !== actor.id).sort((left, right) => left.seat - right.seat);
  for (const player of game.players) {
    player.generalId = "gan_ning";
    player.hp = 4;
    player.maxHp = 4;
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
    playerId: actor.id,
    phase: "play",
    slashUsed: false,
    wineUsed: false,
    slashDamageBonus: 0,
    requiredDiscardCount: 0,
    discardStage: "hand_limit",
    skipDraw: false,
    skipPlay: false,
    luoyiActive: false,
    slashRespondedInPlayPhase: false,
    skillUseCounts: {},
    rendeGivenCount: 0,
    rendeRecovered: false,
  };
  return { game, actor, others };
}

function standardPrompt(game: GameSession, playerId: string) {
  const prompt = getGameView(game, playerId).prompt;
  if (prompt.type !== "standard_skill") throw new Error(`Expected standard skill prompt, got ${prompt.type}`);
  return prompt;
}

function attack(game: GameSession, actor: GamePlayer, target: GamePlayer, id = "tianxiang-slash"): GameSession {
  actor.hand.unshift(card(id, "slash", "club"));
  const attacked = applyAction(game, { type: "play_card", playerId: actor.id, cardId: id, targetId: target.id });
  return applyAction(attacked, { type: "respond", playerId: target.id, cardId: null });
}

function resolveTianxiang(game: GameSession, owner: GamePlayer, cardId: string, targetId: string): GameSession {
  const prompt = standardPrompt(game, owner.id);
  expect(prompt).toMatchObject({
    skillId: "tianxiang",
    stage: "tianxiang_redirect",
    allowedCardIds: expect.arrayContaining([cardId]),
    targetIds: expect.arrayContaining([targetId]),
    minCards: 1,
    maxCards: 1,
    minTargets: 1,
    maxTargets: 1,
    canPass: true,
  });
  return applyAction(game, {
    type: "resolve_standard_skill",
    playerId: owner.id,
    promptId: prompt.promptId,
    activate: true,
    cardId,
    targetId,
  });
}

function ruleCode(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    if (!(error instanceof GameRuleError)) throw error;
    return error.code;
  }
  return undefined;
}

describe("live Wind Tianxiang and Hongyan", () => {
  it("uses a Hongyan Spade as the physical Heart cost and rejects stale or illegal choices", () => {
    const { game, actor, others: [xiaoqiao, recipient, forbidden] } = setup();
    if (!xiaoqiao || !recipient || !forbidden) throw new Error("Missing Tianxiang fixtures");
    xiaoqiao.generalId = "xiao_qiao";
    xiaoqiao.hp = xiaoqiao.maxHp = 3;
    xiaoqiao.hand = [card("hongyan-spade", "dodge", "spade"), card("non-heart", "dodge", "club")];
    game.deck = [card("recipient-draw", "peach")];

    const prompted = attack(game, actor, xiaoqiao);
    const prompt = standardPrompt(prompted, xiaoqiao.id);
    expect(prompt.allowedCardIds).toEqual(["hongyan-spade"]);
    expect(prompt.targetIds).toEqual(expect.arrayContaining([recipient.id, forbidden.id]));
    expect(prompt.targetIds).not.toContain(xiaoqiao.id);
    expect(ruleCode(() => applyAction(prompted, {
      type: "resolve_standard_skill",
      playerId: xiaoqiao.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "non-heart",
      targetId: recipient.id,
    }))).toBe("INVALID_SELECTION");
    expect(ruleCode(() => applyAction(prompted, {
      type: "resolve_standard_skill",
      playerId: xiaoqiao.id,
      promptId: `${prompt.promptId}:stale`,
      activate: true,
      cardId: "hongyan-spade",
      targetId: recipient.id,
    }))).toBe("INVALID_RESPONSE");
    const declined = applyAction(prompted, {
      type: "resolve_standard_skill",
      playerId: xiaoqiao.id,
      promptId: prompt.promptId,
      activate: false,
    });
    expect(declined.players.find((player) => player.id === xiaoqiao.id)).toMatchObject({
      hp: 2,
      hand: [
        expect.objectContaining({ id: "hongyan-spade", suit: "spade" }),
        expect.objectContaining({ id: "non-heart" }),
      ],
    });

    const resolved = resolveTianxiang(prompted, xiaoqiao, "hongyan-spade", recipient.id);
    expect(resolved.players.find((player) => player.id === xiaoqiao.id)).toMatchObject({ hp: 3 });
    expect(resolved.players.find((player) => player.id === recipient.id)).toMatchObject({ hp: 3 });
    expect(resolved.players.find((player) => player.id === recipient.id)?.hand.map((entry) => entry.id)).toEqual(["recipient-draw"]);
    expect(resolved.discardPile).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "hongyan-spade", suit: "spade" }),
    ]));
    expect(resolved.completeRules.damageFlow.frames).toEqual([]);
  });

  it("resolves A-to-B-to-C redirects once and draws in reverse settlement order after multi-point damage", () => {
    const { game, actor, others: [first, second, recipient] } = setup();
    if (!first || !second || !recipient) throw new Error("Missing chained Tianxiang fixtures");
    first.generalId = second.generalId = "xiao_qiao";
    first.hp = first.maxHp = 3;
    second.maxHp = 3;
    second.hp = 2;
    first.hand = [card("first-cost", "dodge"), card("first-filler", "peach")];
    second.hand = [card("second-cost", "dodge"), card("second-filler", "peach")];
    game.turn.slashDamageBonus = 1;
    game.deck = [
      card("second-draw", "peach"),
      card("recipient-draw-2", "peach"),
      card("recipient-draw-1", "peach"),
    ];

    let current = resolveTianxiang(attack(game, actor, first), first, "first-cost", second.id);
    expect(current.pendingResponse).toMatchObject({
      type: "standard_skill",
      skillId: "tianxiang",
      targetId: second.id,
    });
    current = JSON.parse(JSON.stringify(current)) as GameSession;
    expect(() => assertCompleteRulesEngineState(current.completeRules)).not.toThrow();
    current = resolveTianxiang(current, second, "second-cost", recipient.id);

    expect(current.players.find((player) => player.id === first.id)).toMatchObject({ hp: 3 });
    expect(current.players.find((player) => player.id === second.id)).toMatchObject({ hp: 2 });
    expect(current.players.find((player) => player.id === recipient.id)).toMatchObject({ hp: 2 });
    expect(current.players.find((player) => player.id === recipient.id)?.hand.map((entry) => entry.id)).toEqual([
      "recipient-draw-1", "recipient-draw-2",
    ]);
    expect(current.players.find((player) => player.id === second.id)?.hand.map((entry) => entry.id)).toEqual([
      "second-filler", "second-draw",
    ]);
    expect(current.logs.filter((entry) => entry.message.includes("因天香结算摸了")).map((entry) => entry.message)).toEqual([
      `${recipient.id} 因天香结算摸了 2 张牌。`,
      `${second.id} 因天香结算摸了 1 张牌。`,
    ]);
    expect(current.completeRules.damageFlow.consumedActions.map((entry) => entry.resolutionRef).filter(Boolean)).toEqual(expect.arrayContaining([
      "tianxiang:1:redirect:1",
      "tianxiang:1:redirect:2",
      "tianxiang:1:draw:2",
      "tianxiang:1:draw:1",
    ]));
    expect(current.completeRules.damageFlow.frames).toEqual([]);
  });

  it("uses the settled redirected amount for a direct chain root even when its early caller is forged", () => {
    const { game, actor, others: [xiaoqiao, recipient, chainedPeer] } = setup();
    if (!xiaoqiao || !recipient || !chainedPeer) throw new Error("Missing direct-chain Tianxiang fixtures");
    xiaoqiao.generalId = "xiao_qiao";
    xiaoqiao.hp = xiaoqiao.maxHp = 3;
    xiaoqiao.hand = [card("chain-tianxiang-cost", "dodge")];
    xiaoqiao.chained = true;
    chainedPeer.chained = true;
    actor.hand = [card("chain-tianxiang-fire", "fire_slash", "diamond")];
    game.turn.slashDamageBonus = 1;
    game.deck = [card("chain-recipient-draw-2", "peach"), card("chain-recipient-draw-1", "peach")];

    let current = applyAction(game, {
      type: "play_card",
      playerId: actor.id,
      cardId: "chain-tianxiang-fire",
      targetId: xiaoqiao.id,
    });
    current = applyAction(current, { type: "respond", playerId: xiaoqiao.id, cardId: null });
    const root = current.completeRules.damageFlow.frames[0];
    if (!root?.callerContinuation) throw new Error("Expected direct chain caller continuation");
    const caller = root.callerContinuation as { data: { resume: { type: string; amount: number } } };
    expect(caller.data.resume).toMatchObject({ type: "chain_damage", amount: 2 });
    caller.data.resume.amount = 1;

    current = resolveTianxiang(current, xiaoqiao, "chain-tianxiang-cost", recipient.id);
    expect(current.players.find((player) => player.id === recipient.id)?.hp).toBe(2);
    expect(current.players.find((player) => player.id === chainedPeer.id)?.hp).toBe(2);
    expect(current.completeRules.damageFlow.frames).toEqual([]);
  });

  it("pauses a last-hand Tianxiang cost for Lianying and resumes the exact JSON-restored DamageFlow", () => {
    const { game, actor, others: [xiaoqiao, recipient] } = setup();
    if (!xiaoqiao || !recipient) throw new Error("Missing Lianying fixtures");
    xiaoqiao.generalId = "xiao_qiao";
    xiaoqiao.hp = xiaoqiao.maxHp = 3;
    xiaoqiao.hand = [card("last-spade", "dodge", "spade")];
    grantSkill(game.completeRules.lifecycle, {
      ownerId: xiaoqiao.id,
      skillId: "lianying",
      sourcePlayerId: xiaoqiao.id,
      sourceSkillId: "test",
      expiry: { type: "permanent" },
    });
    game.deck = [card("recipient-after-resume", "peach"), card("lianying-draw", "peach")];

    let current = resolveTianxiang(attack(game, actor, xiaoqiao), xiaoqiao, "last-spade", recipient.id);
    expect(current.pendingResponse).toMatchObject({
      type: "skill_choice",
      targetId: xiaoqiao.id,
      skillId: "lianying",
      resume: { type: "after_move" },
    });
    expect(current.afterMove).toMatchObject({ suspendedPhase: "respond", suspendedResponse: null });
    expect(current.completeRules.damageFlow.frames).toHaveLength(1);
    current = JSON.parse(JSON.stringify(current)) as GameSession;
    expect(() => assertCompleteRulesEngineState(current.completeRules)).not.toThrow();
    const prompt = getGameView(current, xiaoqiao.id).prompt;
    if (prompt.type !== "skill_choice" || !prompt.promptId) throw new Error("Expected Lianying prompt");
    current = applyAction(current, {
      type: "resolve_skill",
      playerId: xiaoqiao.id,
      skillId: "lianying",
      promptId: prompt.promptId,
      activate: true,
    });

    expect(current.players.find((player) => player.id === xiaoqiao.id)?.hand.map((entry) => entry.id)).toEqual(["lianying-draw"]);
    expect(current.players.find((player) => player.id === recipient.id)).toMatchObject({ hp: 3 });
    expect(current.players.find((player) => player.id === recipient.id)?.hand.map((entry) => entry.id)).toEqual(["recipient-after-resume"]);
    expect(current.afterMove).toEqual({ queuedRecoveries: [], queuedTriggers: [], suspendedPhase: null, suspendedResponse: null });
    expect(current.completeRules.damageFlow.frames).toEqual([]);
  });

  it("replays Hongyan after a Guicai Spade replacement without mutating the physical judgment card", () => {
    const { game, actor, others: [xiaoqiao, simayi] } = setup();
    if (!xiaoqiao || !simayi) throw new Error("Missing Hongyan judgment fixtures");
    xiaoqiao.generalId = "xiao_qiao";
    xiaoqiao.hp = xiaoqiao.maxHp = 3;
    xiaoqiao.equipment.armor = card("bagua", "ba_gua_zhen", "club");
    simayi.generalId = "si_ma_yi";
    simayi.hand = [card("guicai-spade", "dodge", "spade", 5)];
    game.deck = [card("initial-club", "slash", "club", 9)];

    actor.hand = [card("judgment-slash", "slash", "club")];
    let current = applyAction(game, {
      type: "play_card",
      playerId: actor.id,
      cardId: "judgment-slash",
      targetId: xiaoqiao.id,
    });
    current = applyAction(current, { type: "activate_armor", playerId: xiaoqiao.id, activate: true });
    let prompt = standardPrompt(current, simayi.id);
    expect(prompt).toMatchObject({ skillId: "guicai", stage: "judgment_retrial", allowedCardIds: ["guicai-spade"] });
    current = JSON.parse(JSON.stringify(current)) as GameSession;
    prompt = standardPrompt(current, simayi.id);
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: simayi.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "guicai-spade",
    });

    expect(current.players.find((player) => player.id === xiaoqiao.id)).toMatchObject({ hp: 3 });
    expect(current.pendingResponse).toBeNull();
    expect(current.discardPile).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "guicai-spade", suit: "spade" }),
    ]));
    expect(current.logs.map((entry) => entry.message).join("\n")).toContain("发动八卦阵成功");
  });
});
