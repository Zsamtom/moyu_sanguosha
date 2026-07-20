import { describe, expect, it } from "vitest";

import {
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

const seed = "7b".repeat(32);

function card(id: string, kind: CardKind, suit: Card["suit"] = "spade", rank: Card["rank"] = 7): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank };
}

function setup(): { game: GameSession; actor: GamePlayer; target: GamePlayer } {
  const game = createGame({ playerIds: ["survival-1", "survival-2", "survival-3"], seed });
  const actor = game.players.find((player) => player.id === game.currentPlayerId)!;
  const target = game.players
    .filter((player) => player.id !== actor.id)
    .sort((left, right) => left.seat - right.seat)[0]!;
  for (const player of game.players) {
    player.generalId = "gan_ning";
    player.alive = true;
    player.hp = 4;
    player.maxHp = 4;
    player.hand = [];
    player.equipment = {};
    player.judgment = [];
    player.extraPiles = {};
    player.faceUp = true;
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
  return { game, actor, target };
}

function life(game: GameSession) {
  return game.players.map(({ id, hp, maxHp, alive }) => ({ id, hp, maxHp, alive }));
}

describe("live dying survival skills", () => {
  it("persists Buqu recovery choices, resumes the exact DamageFlow barrier, and removes wounds on later recovery", () => {
    const { game, actor, target } = setup();
    target.generalId = "zhou_tai";
    target.hp = 1;
    target.hand = [card("buqu-peach", "peach", "heart", 3)];
    actor.hand = [
      card("buqu-slash", "slash"),
      card("buqu-garden", "peach_garden", "heart", 1),
    ];
    game.turn.slashDamageBonus = 1;
    game.deck = [
      card("buqu-wound-1", "dodge", "club", 9),
      card("buqu-wound-2", "slash", "diamond", 9),
    ];

    let current = applyAction(game, {
      type: "play_card",
      playerId: actor.id,
      cardId: "buqu-slash",
      targetId: target.id,
    });
    current = applyAction(current, { type: "respond", playerId: target.id, cardId: null });
    expect(current.pendingResponse).toMatchObject({
      type: "skill_choice",
      targetId: target.id,
      skillId: "buqu",
      resume: { type: "dying", buquLoss: { hpBefore: 1, amount: 2 } },
    });
    expect(current.completeRules.dying.frames.at(-1)).toMatchObject({
      victimId: target.id,
      stage: "entry_save",
      entrySaveSkillIds: ["buqu"],
      skillResolutions: [],
    });
    expect(() => assertCompleteRulesEngineState(current.completeRules, life(current))).not.toThrow();
    const entryPrompt = getGameView(current, target.id).prompt;
    if (entryPrompt.type !== "skill_choice" || entryPrompt.skillId !== "buqu" || !entryPrompt.promptId) {
      throw new Error("Expected identified Buqu entry prompt");
    }
    current = applyAction(JSON.parse(JSON.stringify(current)) as GameSession, {
      type: "resolve_skill",
      playerId: target.id,
      skillId: "buqu",
      activate: true,
      promptId: entryPrompt.promptId,
    });
    expect(current.pendingResponse).toMatchObject({ type: "dying", targetId: target.id, victimId: target.id });
    expect(current.completeRules.dying.frames.at(-1)).toMatchObject({
      victimId: target.id,
      stage: "rescue",
      skillResolutions: [{ skillId: "buqu", timing: "life_deduction", succeeded: false }],
    });
    expect(getGameView(current, actor.id).players.find((player) => player.id === target.id)?.publicPiles.buqu)
      .toHaveLength(2);

    current = applyAction(current, { type: "respond", playerId: target.id, cardId: "buqu-peach" });
    expect(current.pendingResponse).toMatchObject({
      type: "standard_skill",
      targetId: target.id,
      skillId: "buqu",
      stage: "buqu_recovery",
    });
    expect(current.afterMove.suspendedResponse).toMatchObject({ type: "dying", victimId: target.id });
    const restored = JSON.parse(JSON.stringify(current)) as GameSession;
    expect(() => assertCompleteRulesEngineState(restored.completeRules, life(restored))).not.toThrow();
    const recoveryPrompt = getGameView(restored, target.id).prompt;
    if (recoveryPrompt.type !== "standard_skill") throw new Error("Expected Buqu recovery prompt");
    expect(recoveryPrompt).toMatchObject({ canPass: false, minCards: 1, maxCards: 1 });
    expect(recoveryPrompt.cards.map((wound) => wound.rank)).toEqual([9, 9]);

    current = applyAction(restored, {
      type: "resolve_standard_skill",
      playerId: target.id,
      promptId: recoveryPrompt.promptId,
      activate: true,
      cardId: recoveryPrompt.allowedCardIds[0],
    });
    const protectedTarget = current.players.find((player) => player.id === target.id)!;
    expect(protectedTarget).toMatchObject({ alive: true, hp: -1 });
    expect(protectedTarget.extraPiles.buqu).toHaveLength(1);
    expect(current.completeRules.dying.frames).toEqual([]);
    expect(current.completeRules.damageFlow.frames).toEqual([]);
    expect(current.completeRules.damageFlow.completedDamageIds).toEqual([1]);

    current = applyAction(current, {
      type: "play_card",
      playerId: actor.id,
      cardId: "buqu-garden",
    });
    const laterPrompt = getGameView(current, target.id).prompt;
    if (laterPrompt.type !== "standard_skill") throw new Error("Expected later Buqu recovery prompt");
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: target.id,
      promptId: laterPrompt.promptId,
      activate: true,
      cardId: laterPrompt.allowedCardIds[0],
    });
    expect(current.players.find((player) => player.id === target.id)).toMatchObject({ alive: true, hp: 1 });
    expect(current.players.find((player) => player.id === target.id)?.extraPiles.buqu).toEqual([]);
    expect(getGameView(current, actor.id).players.find((player) => player.id === target.id)?.publicPiles.buqu).toEqual([]);
  });

  it("lets Zhou Tai decline the optional Buqu entry without drawing a wound", () => {
    const { game, actor, target } = setup();
    target.generalId = "zhou_tai";
    target.hp = 1;
    actor.hand = [card("decline-buqu-slash", "slash")];
    game.deck = [card("decline-buqu-wound", "dodge", "spade", 8)];

    let current = applyAction(game, {
      type: "play_card",
      playerId: actor.id,
      cardId: "decline-buqu-slash",
      targetId: target.id,
    });
    current = applyAction(current, { type: "respond", playerId: target.id, cardId: null });
    const prompt = getGameView(current, target.id).prompt;
    if (prompt.type !== "skill_choice" || prompt.skillId !== "buqu" || !prompt.promptId) {
      throw new Error("Expected Buqu entry prompt");
    }
    current = applyAction(current, {
      type: "resolve_skill",
      playerId: target.id,
      skillId: "buqu",
      activate: false,
      promptId: prompt.promptId,
    });

    expect(current.pendingResponse).toMatchObject({ type: "dying", victimId: target.id, targetId: target.id });
    expect(current.players.find((player) => player.id === target.id)?.extraPiles.buqu).toBeUndefined();
    expect(current.deck.map((owned) => owned.id)).toContain("decline-buqu-wound");
    expect(current.completeRules.dying.frames.at(-1)).toMatchObject({
      stage: "rescue",
      entrySaveSkillIds: [],
      skillResolutions: [{ skillId: "buqu", timing: "life_deduction", succeeded: false }],
    });
  });

  it("runs Niepan only at its owner's dying response, resets state, and consumes the limited use", () => {
    const { game, actor, target } = setup();
    target.generalId = "pang_tong";
    target.maxHp = 3;
    target.hp = 1;
    target.faceUp = false;
    target.chained = true;
    target.hand = [card("niepan-hand", "peach", "heart", 2)];
    target.equipment.armor = card("niepan-armor", "ba_gua_zhen", "club", 2);
    target.judgment = [card("niepan-judgment", "le_bu_si_shu", "heart", 6)];
    target.extraPiles.kept = [card("niepan-kept", "dodge", "diamond", 4)];
    actor.hand = [card("niepan-slash", "slash")];
    game.deck = [
      card("niepan-draw-1", "dodge"),
      card("niepan-draw-2", "dodge"),
      card("niepan-draw-3", "dodge"),
    ];

    let current = applyAction(game, {
      type: "play_card",
      playerId: actor.id,
      cardId: "niepan-slash",
      targetId: target.id,
    });
    current = applyAction(current, { type: "respond", playerId: target.id, cardId: null });
    const prompt = getGameView(current, target.id).prompt;
    if (prompt.type !== "skill_choice" || prompt.skillId !== "niepan" || !prompt.promptId) {
      throw new Error("Expected identified Niepan prompt");
    }
    expect(current.completeRules.dying.frames.at(-1)).toMatchObject({
      victimId: target.id,
      stage: "rescue",
      ownerResponseSaveSkillIds: ["niepan"],
    });
    expect(() => assertCompleteRulesEngineState(current.completeRules, life(current))).not.toThrow();

    current = applyAction(JSON.parse(JSON.stringify(current)) as GameSession, {
      type: "resolve_skill",
      playerId: target.id,
      skillId: "niepan",
      activate: true,
      promptId: prompt.promptId,
    });
    const revived = current.players.find((player) => player.id === target.id)!;
    expect(revived).toMatchObject({ alive: true, hp: 3, faceUp: true, chained: false });
    expect(revived.hand.map((owned) => owned.id).sort()).toEqual([
      "niepan-draw-1",
      "niepan-draw-2",
      "niepan-draw-3",
    ]);
    expect(revived.equipment).toEqual({});
    expect(revived.judgment).toEqual([]);
    expect(revived.extraPiles.kept?.map((owned) => owned.id)).toEqual(["niepan-kept"]);
    expect(current.discardPile.map((discarded) => discarded.id)).toEqual(expect.arrayContaining([
      "niepan-hand",
      "niepan-armor",
      "niepan-judgment",
      "niepan-slash",
    ]));
    expect(current.completeRules.lifecycle.limitedUses).toContainEqual(expect.objectContaining({
      ownerId: target.id,
      skillId: "niepan",
    }));
    expect(current.completeRules.dying.frames).toEqual([]);
    expect(current.completeRules.damageFlow.frames).toEqual([]);

    current.turn.slashUsed = false;
    current.players.find((player) => player.id === target.id)!.hp = 1;
    current.players.find((player) => player.id === actor.id)!.hand.push(card("niepan-slash-2", "slash"));
    current = applyAction(current, {
      type: "play_card",
      playerId: actor.id,
      cardId: "niepan-slash-2",
      targetId: target.id,
    });
    current = applyAction(current, { type: "respond", playerId: target.id, cardId: null });
    expect(current.pendingResponse).toMatchObject({ type: "dying", targetId: target.id, victimId: target.id });
    expect(getGameView(current, target.id).prompt.type).toBe("dying");
  });

  it("records the actual negative HP when Niepan is declined", () => {
    const { game, actor, target } = setup();
    target.generalId = "pang_tong";
    target.maxHp = 3;
    target.hp = 1;
    actor.hand = [card("decline-niepan-slash", "slash")];
    game.turn.slashDamageBonus = 1;

    let current = applyAction(game, {
      type: "play_card",
      playerId: actor.id,
      cardId: "decline-niepan-slash",
      targetId: target.id,
    });
    current = applyAction(current, { type: "respond", playerId: target.id, cardId: null });
    const prompt = getGameView(current, target.id).prompt;
    if (prompt.type !== "skill_choice" || prompt.skillId !== "niepan" || !prompt.promptId) {
      throw new Error("Expected Niepan decline prompt");
    }
    current = applyAction(current, {
      type: "resolve_skill",
      playerId: target.id,
      skillId: "niepan",
      activate: false,
      promptId: prompt.promptId,
    });

    expect(current.players.find((player) => player.id === target.id)?.hp).toBe(-1);
    expect(current.completeRules.dying.frames.at(-1)).toMatchObject({
      stage: "rescue",
      skillResolutions: [{
        skillId: "niepan",
        timing: "victim_response",
        succeeded: false,
        hpAfter: -1,
      }],
    });
    expect(current.pendingResponse).toMatchObject({ type: "dying", targetId: target.id });
  });

  it("persists Hongyan's effective Heart while Jijiu keeps its physical Spade", () => {
    const { game, actor } = setup();
    const victim = game.players.find((player) => player.seat === (actor.seat + 1) % game.players.length)!;
    const healer = game.players.find((player) => player.seat === (actor.seat + 2) % game.players.length)!;
    victim.hp = 1;
    healer.generalId = "hua_tuo";
    healer.hand = [card("hongyan-jijiu-spade", "dodge", "spade")];
    grantSkill(game.completeRules.lifecycle, {
      ownerId: healer.id,
      skillId: "hongyan",
      sourcePlayerId: healer.id,
      sourceSkillId: "test",
      expiry: { type: "permanent" },
    });
    actor.hand = [card("hongyan-jijiu-slash", "slash")];
    game.turn.slashDamageBonus = 1;

    let current = applyAction(game, {
      type: "play_card",
      playerId: actor.id,
      cardId: "hongyan-jijiu-slash",
      targetId: victim.id,
    });
    current = applyAction(current, { type: "respond", playerId: victim.id, cardId: null });
    current = applyAction(current, { type: "respond", playerId: victim.id, cardId: null });
    expect(getGameView(current, healer.id).prompt).toMatchObject({
      type: "dying",
      skillResponses: [expect.objectContaining({ skillId: "jijiu", cardIds: ["hongyan-jijiu-spade"] })],
    });
    current = applyAction(current, {
      type: "use_skill",
      playerId: healer.id,
      skillId: "jijiu",
      cardIds: ["hongyan-jijiu-spade"],
    });

    expect(current.players.find((player) => player.id === victim.id)?.hp).toBe(0);
    expect(current.completeRules.dying.frames.at(-1)?.rescues[0]).toMatchObject({
      cardKind: "view_as_peach",
      physicalCardIds: ["hongyan-jijiu-spade"],
      effectiveSuit: "heart",
      suitModifierSkillId: "hongyan",
    });
    expect(current.resolvingCards).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "hongyan-jijiu-spade", suit: "spade" }),
    ]));
    const restored = JSON.parse(JSON.stringify(current)) as GameSession;
    expect(() => assertCompleteRulesEngineState(restored.completeRules, life(restored))).not.toThrow();
  });
});
