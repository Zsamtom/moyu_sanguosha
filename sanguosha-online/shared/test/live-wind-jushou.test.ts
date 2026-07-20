import { describe, expect, it } from "vitest";

import {
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

const seed = "d3".repeat(32);

function card(id: string, kind: CardKind): Card {
  return { id, kind, ...getCardDefinition(kind), suit: "club", rank: 7 };
}

function setup(): { game: GameSession; owner: GamePlayer; nextPlayer: GamePlayer } {
  const game = createGame({ playerIds: ["jushou-owner", "jushou-next", "jushou-third"], seed });
  const owner = game.players.find((player) => player.id === game.currentPlayerId)!;
  const ownerIndex = game.players.findIndex((player) => player.id === owner.id);
  const nextPlayer = game.players[(ownerIndex + 1) % game.players.length]!;
  for (const player of game.players) {
    player.generalId = "gan_ning";
    player.hp = player.maxHp = 4;
    player.alive = true;
    player.hand = [];
    player.equipment = {};
    player.judgment = [];
    player.chained = false;
    player.extraPiles = {};
  }
  owner.generalId = "cao_ren";
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
    requiredDiscardCount: 0,
    discardStage: "hand_limit",
    skipDraw: false,
    skipPlay: false,
  };
  return { game, owner, nextPlayer };
}

function standardPrompt(game: GameSession, playerId: string) {
  const prompt = getGameView(game, playerId).prompt;
  if (prompt.type !== "standard_skill") throw new Error(`Expected standard skill prompt, got ${prompt.type}`);
  return prompt;
}

function enterJushou(game: GameSession, owner: GamePlayer): GameSession {
  return applyAction(game, { type: "end_play", playerId: owner.id });
}

describe("live Wind Jushou", () => {
  it("may be declined without turning over or drawing", () => {
    const { game, owner, nextPlayer } = setup();
    let current = enterJushou(game, owner);
    const prompt = standardPrompt(current, owner.id);
    expect(prompt).toMatchObject({ skillId: "jushou", stage: "invoke", canPass: true });

    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: false,
    });

    expect(current.currentPlayerId).toBe(nextPlayer.id);
    expect(current.players.find((player) => player.id === owner.id)).toMatchObject({ faceUp: true, hand: [] });
  });

  it("restores a mandatory last-hand disposal through Lianying before ending the turn", () => {
    const { game, owner, nextPlayer } = setup();
    game.deck = [card("jushou-last-card", "dodge")];
    grantSkill(game.completeRules.lifecycle, {
      ownerId: owner.id,
      skillId: "lianying",
      sourcePlayerId: owner.id,
      sourceSkillId: "test",
      expiry: { type: "permanent" },
    });

    let current = enterJushou(game, owner);
    let prompt = standardPrompt(current, owner.id);
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
    });
    current = JSON.parse(JSON.stringify(current)) as GameSession;
    prompt = standardPrompt(current, owner.id);
    expect(prompt).toMatchObject({
      skillId: "jushou",
      stage: "jushou_dispose",
      canPass: false,
      allowedCardIds: ["jushou-last-card"],
      minCards: 1,
      maxCards: 1,
    });
    expect(current.players.find((player) => player.id === owner.id)).toMatchObject({ faceUp: false });

    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "jushou-last-card",
    });
    expect(current.currentPlayerId).toBe(owner.id);
    expect(current.pendingResponse).toMatchObject({
      type: "skill_choice",
      skillId: "lianying",
      targetId: owner.id,
    });
    expect(current.afterMove).toMatchObject({
      suspendedPhase: "end",
      suspendedResponse: { type: "standard_skill", skillId: "jushou", stage: "jushou_finish" },
    });
    expect(current.discardPile.map((entry) => entry.id)).toContain("jushou-last-card");

    current = JSON.parse(JSON.stringify(current)) as GameSession;
    const lianying = getGameView(current, owner.id).prompt;
    if (lianying.type !== "skill_choice" || !lianying.promptId) throw new Error("Expected Lianying prompt");
    current = applyAction(current, {
      type: "resolve_skill",
      playerId: owner.id,
      skillId: "lianying",
      promptId: lianying.promptId,
      activate: false,
    });

    expect(current.currentPlayerId).toBe(nextPlayer.id);
    expect(current.logs.filter((entry) => entry.message.includes("发动据守并翻面"))).toHaveLength(1);
    expect(current.players.find((player) => player.id === owner.id)).toMatchObject({ faceUp: false, hand: [] });
  });

  it("draws four and legally uses an equipment card for the mandatory disposition", () => {
    const { game, owner } = setup();
    owner.equipment.armor = card("old-armor", "ren_wang_dun");
    game.deck = [
      card("next-draw-2", "peach"),
      card("next-draw-1", "peach"),
      card("jushou-filler-3", "dodge"),
      card("jushou-filler-2", "dodge"),
      card("jushou-filler-1", "dodge"),
      card("jushou-new-armor", "ba_gua_zhen"),
    ];

    let current = enterJushou(game, owner);
    let prompt = standardPrompt(current, owner.id);
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
    });
    prompt = standardPrompt(current, owner.id);
    expect(prompt.allowedCardIds).toHaveLength(4);
    expect(prompt.allowedCardIds).toContain("jushou-new-armor");

    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "jushou-new-armor",
    });

    const resolved = current.players.find((player) => player.id === owner.id)!;
    expect(resolved).toMatchObject({ faceUp: false });
    expect(resolved.hand).toHaveLength(3);
    expect(resolved.equipment.armor?.id).toBe("jushou-new-armor");
    expect(current.discardPile.map((entry) => entry.id)).toContain("old-armor");
  });
});
