import { describe, expect, it } from "vitest";

import {
  GameRuleError,
  applyAction,
  createGame,
  getCardDefinition,
  getGameView,
  grantSkill,
  type Card,
  type CardKind,
  type GamePlayer,
  type GameSession,
} from "../src/index.js";

const seed = "72".repeat(32);

function card(id: string, kind: CardKind, suit: Card["suit"] = "club"): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank: 7 };
}

function setup(): { game: GameSession; actor: GamePlayer; others: GamePlayer[] } {
  const game = createGame({ playerIds: ["guidao-1", "guidao-2", "guidao-3", "guidao-4"], seed });
  const actor = game.players.find((player) => player.id === game.currentPlayerId)!;
  const others = game.players.filter((player) => player.id !== actor.id).sort((left, right) => left.seat - right.seat);
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

function beginBaguaJudgment(game: GameSession, actor: GamePlayer, target: GamePlayer, slashId: string): GameSession {
  let current = applyAction(game, { type: "play_card", playerId: actor.id, cardId: slashId, targetId: target.id });
  current = applyAction(current, { type: "activate_armor", playerId: target.id, activate: true });
  return current;
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

describe("live Wind Guidao", () => {
  it("accepts effective-black hand/equipment cards, rejects Hongyan Spades, and gains the old judgment card", () => {
    const { game, actor, others: [target] } = setup();
    if (!target) throw new Error("Missing Guidao target");
    actor.generalId = "zhang_jiao";
    grantSkill(game.completeRules.lifecycle, {
      ownerId: actor.id,
      skillId: "hongyan",
      sourcePlayerId: actor.id,
      sourceSkillId: "test",
      expiry: { type: "permanent" },
    });
    actor.hand = [
      card("guidao-slash", "slash"),
      card("hand-club", "peach", "club"),
      card("hand-spade", "peach", "spade"),
    ];
    actor.equipment.offensive_horse = card("equipment-club", "chi_tu", "club");
    actor.equipment.defensive_horse = card("equipment-spade", "jue_ying", "spade");
    target.equipment.armor = card("bagua", "ba_gua_zhen", "diamond");
    game.deck = [card("initial-heart", "dodge", "heart")];

    let current = beginBaguaJudgment(game, actor, target, "guidao-slash");
    const prompt = standardPrompt(current, actor.id);
    expect(prompt).toMatchObject({
      skillId: "guidao",
      stage: "judgment_retrial",
      allowedCardIds: expect.arrayContaining(["hand-club", "equipment-club"]),
      minCards: 1,
      maxCards: 1,
      canPass: true,
    });
    expect(prompt.allowedCardIds).not.toEqual(expect.arrayContaining(["hand-spade", "equipment-spade"]));
    expect(ruleCode(() => applyAction(current, {
      type: "resolve_standard_skill",
      playerId: actor.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "hand-spade",
    }))).toBe("INVALID_CARD");

    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: actor.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "equipment-club",
    });
    const resolvedActor = current.players.find((player) => player.id === actor.id)!;
    expect(resolvedActor.hand).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "initial-heart", suit: "heart" }),
      expect.objectContaining({ id: "hand-spade", suit: "spade" }),
    ]));
    expect(resolvedActor.equipment.offensive_horse).toBeUndefined();
    expect(resolvedActor.equipment.defensive_horse).toMatchObject({ id: "equipment-spade", suit: "spade" });
    expect(current.discardPile).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "equipment-club", suit: "club" }),
    ]));
    expect(current.pendingResponse).toMatchObject({ type: "slash", targetId: target.id, armorAttempted: true });

    current = applyAction(current, { type: "respond", playerId: target.id, cardId: null });
    expect(current.players.find((player) => player.id === target.id)?.hp).toBe(3);
  });

  it("preserves multi-owner retrial order through JSON and triggers Lianying for a last-hand Guidao cost", () => {
    const { game, actor, others: [target, secondOwner] } = setup();
    if (!target || !secondOwner) throw new Error("Missing multi-Guidao fixtures");
    actor.generalId = "zhang_jiao";
    secondOwner.generalId = "zhang_jiao";
    target.generalId = "guo_jia";
    grantSkill(game.completeRules.lifecycle, {
      ownerId: actor.id,
      skillId: "lianying",
      sourcePlayerId: actor.id,
      sourceSkillId: "test",
      expiry: { type: "permanent" },
    });
    actor.hand = [card("ordered-slash", "slash"), card("first-cost", "peach", "club")];
    actor.equipment.weapon = card("ordered-range", "qing_long_yan_yue_dao", "heart");
    secondOwner.hand = [card("second-cost", "peach", "club")];
    target.equipment.armor = card("ordered-bagua", "ba_gua_zhen", "diamond");
    game.deck = [card("ordered-initial", "dodge", "heart")];

    let current = beginBaguaJudgment(game, actor, target, "ordered-slash");
    let prompt = standardPrompt(current, actor.id);
    expect(prompt).toMatchObject({ skillId: "guidao", allowedCardIds: ["first-cost"] });
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: actor.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "first-cost",
    });
    expect(current.pendingResponse).toMatchObject({ type: "skill_choice", targetId: actor.id, skillId: "lianying" });
    expect(current.afterMove.suspendedResponse).toMatchObject({
      type: "standard_judgment",
      targetId: secondOwner.id,
      frame: { replacements: [{ actorId: actor.id, skillId: "guidao", oldCardId: "ordered-initial", newCardId: "first-cost" }] },
    });

    current = JSON.parse(JSON.stringify(current)) as GameSession;
    const lianying = getGameView(current, actor.id).prompt;
    if (lianying.type !== "skill_choice" || !lianying.promptId) throw new Error("Expected Lianying prompt");
    current = applyAction(current, {
      type: "resolve_skill",
      playerId: actor.id,
      skillId: "lianying",
      promptId: lianying.promptId,
      activate: false,
    });
    prompt = standardPrompt(current, secondOwner.id);
    expect(prompt).toMatchObject({ skillId: "guidao", stage: "judgment_retrial", allowedCardIds: ["second-cost"] });
    expect(current.players.find((player) => player.id === actor.id)?.hand).toEqual([
      expect.objectContaining({ id: "ordered-initial", suit: "heart" }),
    ]);

    current = applyAction(JSON.parse(JSON.stringify(current)) as GameSession, {
      type: "resolve_standard_skill",
      playerId: secondOwner.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "second-cost",
    });
    expect(current.pendingResponse).toMatchObject({
      type: "standard_judgment",
      targetId: target.id,
      frame: {
        replacements: [
          { actorId: actor.id, oldCardId: "ordered-initial", newCardId: "first-cost" },
          { actorId: secondOwner.id, oldCardId: "first-cost", newCardId: "second-cost" },
        ],
      },
    });
    expect(current.players.find((player) => player.id === secondOwner.id)?.hand).toEqual([
      expect.objectContaining({ id: "first-cost", suit: "club" }),
    ]);

    prompt = standardPrompt(current, target.id);
    expect(prompt).toMatchObject({ skillId: "tiandu", stage: "judgment_post" });
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: target.id,
      promptId: prompt.promptId,
      activate: false,
    });
    expect(current.pendingResponse).toMatchObject({ type: "slash", targetId: target.id, armorAttempted: true });
    current = applyAction(current, { type: "respond", playerId: target.id, cardId: null });

    expect(current.players.find((player) => player.id === target.id)?.hp).toBe(3);
    expect(current.discardPile).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "second-cost", suit: "club" }),
    ]));
  });
});
