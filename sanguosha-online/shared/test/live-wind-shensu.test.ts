import { describe, expect, it } from "vitest";

import {
  applyAction,
  attackRangeFor,
  createGame,
  distanceBetweenPlayers,
  getCardDefinition,
  getGameView,
  grantSkill,
  type Card,
  type CardKind,
  type GamePlayer,
  type GameSession,
} from "../src/index.js";

const seed = "e7".repeat(32);

function card(id: string, kind: CardKind, suit: Card["suit"] = "club"): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank: 7 };
}

function setup(): { game: GameSession; owner: GamePlayer; farTarget: GamePlayer; adjacentTarget: GamePlayer } {
  const game = createGame({ playerIds: ["shensu-before", "shensu-owner", "shensu-near", "shensu-far"], seed });
  const currentIndex = game.players.findIndex((player) => player.id === game.currentPlayerId);
  const owner = game.players[(currentIndex + 1) % game.players.length]!;
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
  owner.generalId = "xia_hou_yuan";
  const targets = game.players.filter((player) => player.id !== owner.id && player.id !== game.currentPlayerId);
  const farTarget = [...targets].sort((left, right) =>
    distanceBetweenPlayers(game, owner.id, right.id) - distanceBetweenPlayers(game, owner.id, left.id))[0]!;
  const adjacentTarget = targets.find((target) => target.id !== farTarget.id) ?? farTarget;
  game.deck = [];
  game.discardPile = [];
  game.resolvingCards = [];
  game.pendingResponse = null;
  game.afterMove = { queuedRecoveries: [], queuedTriggers: [], suspendedPhase: null, suspendedResponse: null };
  game.turn.phase = "play";
  game.turn.slashUsed = false;
  return { game, owner, farTarget, adjacentTarget };
}

function standardPrompt(game: GameSession, playerId: string) {
  const prompt = getGameView(game, playerId).prompt;
  if (prompt.type !== "standard_skill") throw new Error(`Expected standard skill prompt, got ${prompt.type}`);
  return prompt;
}

function beginOwnerTurn(game: GameSession): GameSession {
  return applyAction(game, { type: "end_play", playerId: game.currentPlayerId });
}

describe("live Wind Shensu", () => {
  it("offers stage one before judgment, ignores only distance, and declines into normal judgment", () => {
    const { game, owner, farTarget, adjacentTarget } = setup();
    owner.judgment = [card("shensu-delayed", "le_bu_si_shu", "diamond")];
    game.deck = [card("shensu-judgment", "dodge", "heart")];
    adjacentTarget.generalId = "zhu_ge_liang";
    adjacentTarget.hand = [];

    let current = beginOwnerTurn(game);
    const prompt = standardPrompt(current, owner.id);
    expect(distanceBetweenPlayers(current, owner.id, farTarget.id)).toBeGreaterThan(attackRangeFor(current, owner.id));
    expect(prompt).toMatchObject({
      skillId: "shensu",
      stage: "shensu_judgment_draw",
      canPass: true,
      allowedCardIds: [],
      targetIds: expect.arrayContaining([farTarget.id]),
      minCards: 0,
      maxCards: 0,
      minTargets: 1,
      maxTargets: 1,
    });
    expect(prompt.targetIds).not.toContain(adjacentTarget.id);
    expect(current.players.find((player) => player.id === owner.id)?.judgment.map((entry) => entry.id)).toEqual(["shensu-delayed"]);

    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: false,
    });
    expect(current.pendingResponse).toBeNull();
    expect(current.turn).toMatchObject({ playerId: owner.id, phase: "play", skipPlay: false });
    const resolvedOwner = current.players.find((player) => player.id === owner.id)!;
    expect(resolvedOwner.judgment).toEqual([]);
    expect(resolvedOwner.hand.map((entry) => entry.id)).toEqual(expect.arrayContaining(["shensu-delayed", "shensu-judgment"]));
  });

  it("runs both virtual Slashes through response/damage and restores an equipped cost through Xiaoji", () => {
    const { game, owner, farTarget } = setup();
    owner.judgment = [card("skipped-delayed", "le_bu_si_shu", "diamond")];
    owner.equipment.armor = card("shensu-cost-armor", "ren_wang_dun");
    farTarget.hand = [card("stage-two-dodge", "dodge", "heart")];
    grantSkill(game.completeRules.lifecycle, {
      ownerId: owner.id,
      skillId: "xiaoji",
      sourcePlayerId: owner.id,
      sourceSkillId: "test",
      expiry: { type: "permanent" },
    });
    grantSkill(game.completeRules.lifecycle, {
      ownerId: owner.id,
      skillId: "liegong",
      sourcePlayerId: owner.id,
      sourceSkillId: "test",
      expiry: { type: "permanent" },
    });

    let current = beginOwnerTurn(game);
    let prompt = standardPrompt(current, owner.id);
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      targetId: farTarget.id,
    });
    expect(current.pendingResponse).toMatchObject({
      type: "slash",
      sourceSkillId: "shensu",
      damageCardIds: [],
      targetId: farTarget.id,
      useProvenance: { method: "use", phase: "judgment" },
      completion: { type: "turn_flow", destination: "before_play", playerId: owner.id },
    });
    expect(current.turn.slashUsed).toBe(false);

    current = JSON.parse(JSON.stringify(current)) as GameSession;
    current = applyAction(current, { type: "respond", playerId: farTarget.id, cardId: null });
    expect(current.players.find((player) => player.id === farTarget.id)?.hp).toBe(3);
    expect(current.players.find((player) => player.id === owner.id)?.judgment.map((entry) => entry.id)).toEqual(["skipped-delayed"]);
    expect(current.players.find((player) => player.id === owner.id)?.hand).toEqual([]);
    prompt = standardPrompt(current, owner.id);
    expect(prompt).toMatchObject({
      skillId: "shensu",
      stage: "shensu_play",
      allowedCardIds: ["shensu-cost-armor"],
      targetIds: expect.arrayContaining([farTarget.id]),
      minCards: 1,
      maxCards: 1,
      minTargets: 1,
      maxTargets: 1,
    });

    current = JSON.parse(JSON.stringify(current)) as GameSession;
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "shensu-cost-armor",
      targetId: farTarget.id,
    });
    expect(current.pendingResponse).toMatchObject({ type: "skill_choice", skillId: "xiaoji", targetId: owner.id });
    expect(current.afterMove).toMatchObject({
      suspendedResponse: {
        type: "slash",
        sourceSkillId: "shensu",
        damageCardIds: [],
        useProvenance: { method: "use", phase: "play" },
        completion: { type: "turn_flow", destination: "discard_or_end", playerId: owner.id },
      },
    });
    expect(current.turn).toMatchObject({ skipPlay: true, slashUsed: false });

    current = JSON.parse(JSON.stringify(current)) as GameSession;
    const xiaoji = getGameView(current, owner.id).prompt;
    if (xiaoji.type !== "skill_choice" || !xiaoji.promptId) throw new Error("Expected Xiaoji prompt");
    current = applyAction(current, {
      type: "resolve_skill",
      playerId: owner.id,
      skillId: "xiaoji",
      promptId: xiaoji.promptId,
      activate: false,
    });
    expect(current.pendingResponse).toMatchObject({ type: "slash", sourceSkillId: "shensu" });
    current = applyAction(current, {
      type: "respond",
      playerId: farTarget.id,
      cardId: "stage-two-dodge",
    });
    expect(current.players.find((player) => player.id === farTarget.id)?.hp).toBe(3);
    expect(current.currentPlayerId).not.toBe(owner.id);
  });

  it("does not consume the normal play-phase Slash quota", () => {
    const { game, owner, adjacentTarget } = setup();
    owner.hand = [card("unused-equipment", "ba_gua_zhen"), card("normal-slash", "slash")];
    adjacentTarget.hand = [card("shensu-dodge", "dodge")];

    let current = beginOwnerTurn(game);
    let prompt = standardPrompt(current, owner.id);
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      targetId: adjacentTarget.id,
    });
    current = applyAction(current, {
      type: "respond",
      playerId: adjacentTarget.id,
      cardId: "shensu-dodge",
    });
    prompt = standardPrompt(current, owner.id);
    expect(prompt.stage).toBe("shensu_play");
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: false,
    });
    expect(current.turn).toMatchObject({ phase: "play", slashUsed: false });

    current = applyAction(current, {
      type: "play_card",
      playerId: owner.id,
      cardId: "normal-slash",
      targetId: adjacentTarget.id,
    });
    expect(current.turn.slashUsed).toBe(true);
  });
});
