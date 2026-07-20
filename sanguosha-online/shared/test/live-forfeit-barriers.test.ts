import { describe, expect, it } from "vitest";

import {
  addMark,
  applyAction,
  createGame,
  forfeitPlayer,
  getCardDefinition,
  getGameView,
  grantSkill,
  type Card,
  type CardKind,
  type GamePlayer,
  type GameSession,
  type GeneralSkillId,
} from "../src/index.js";

const seed = "ad".repeat(32);

function card(id: string, kind: CardKind, suit: Card["suit"] = "club", rank: Card["rank"] = 7): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank };
}

function setup(count = 5): { game: GameSession; actor: GamePlayer; others: GamePlayer[] } {
  const game = createGame({
    playerIds: Array.from({ length: count }, (_value, index) => `forfeit-barrier-${index + 1}`),
    seed,
  });
  const actor = game.players.find((player) => player.id === game.currentPlayerId)!;
  const actorIndex = game.players.findIndex((player) => player.id === actor.id);
  const others = Array.from({ length: count - 1 }, (_value, offset) =>
    game.players[(actorIndex + offset + 1) % count]!,
  );
  for (const player of game.players) {
    player.generalId = "gan_ning";
    player.role = player.id === actor.id ? "lord" : "rebel";
    player.alive = true;
    player.hp = player.maxHp = 4;
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
  game.virtualCardOrigins = {};
  game.pendingResponse = null;
  game.afterMove = { queuedRecoveries: [], queuedTriggers: [], suspendedPhase: null, suspendedResponse: null };
  game.turn = {
    ...game.turn,
    playerId: actor.id,
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
  return { game, actor, others };
}

function grant(game: GameSession, player: GamePlayer, skillId: GeneralSkillId): void {
  grantSkill(game.completeRules.lifecycle, {
    ownerId: player.id,
    skillId,
    sourcePlayerId: player.id,
    sourceSkillId: `test:${skillId}`,
    expiry: { type: "permanent" },
  });
}

function standardPrompt(game: GameSession, playerId: string) {
  const prompt = getGameView(game, playerId).prompt;
  if (prompt.type !== "standard_skill") throw new Error(`Expected standard skill prompt, got ${prompt.type}`);
  return prompt;
}

function passDying(game: GameSession): GameSession {
  let current = game;
  for (let guard = 0; current.pendingResponse?.type === "dying" && guard < 20; guard += 1) {
    current = applyAction(current, {
      type: "respond",
      playerId: current.pendingResponse.targetId,
      cardId: null,
    });
  }
  if (current.pendingResponse?.type === "dying") throw new Error("Dying response guard exhausted");
  return current;
}

function longhunBuquBarrier() {
  const { game, actor, others: [victim, responder, unrelated] } = setup();
  if (!victim || !responder || !unrelated) throw new Error("Missing Longhun/Buqu fixtures");
  grant(game, victim, "buqu");
  grant(game, responder, "longhun");
  victim.hp = 1;
  responder.hp = 2;
  actor.hand = [card("barrier-wine", "wine", "diamond"), card("barrier-slash", "slash")];
  responder.hand = [card("barrier-heart-hand", "dodge", "heart")];
  responder.equipment.armor = card("barrier-heart-armor", "ba_gua_zhen", "heart");
  game.deck = [
    card("barrier-wound-2", "slash", "spade", 7),
    card("barrier-wound-1", "dodge", "club", 7),
  ];

  let current = applyAction(game, { type: "play_card", playerId: actor.id, cardId: "barrier-wine" });
  current = applyAction(current, {
    type: "play_card",
    playerId: actor.id,
    cardId: "barrier-slash",
    targetId: victim.id,
  });
  current = applyAction(current, { type: "respond", playerId: victim.id, cardId: null });
  const entry = getGameView(current, victim.id).prompt;
  if (entry.type !== "skill_choice" || entry.skillId !== "buqu") throw new Error("Expected Buqu entry prompt");
  current = applyAction(current, {
    type: "resolve_skill",
    playerId: victim.id,
    skillId: "buqu",
    activate: true,
    promptId: entry.promptId,
  });
  current = applyAction(current, { type: "respond", playerId: victim.id, cardId: null });
  current = applyAction(current, {
    type: "use_skill",
    playerId: responder.id,
    skillId: "longhun",
    cardIds: ["barrier-heart-hand", "barrier-heart-armor"],
  });
  expect(current.pendingResponse).toMatchObject({
    type: "standard_skill",
    skillId: "buqu",
    stage: "buqu_recovery",
    recovery: { remainingAmount: 1, dyingRescue: { responderId: responder.id, viewAsSkillId: "longhun" } },
  });
  return { current, victim, responder, unrelated };
}

function longhunTuntianBarrier() {
  const { game, actor, others: [victim, responder] } = setup();
  if (!victim || !responder) throw new Error("Missing Longhun/Tuntian fixtures");
  grant(game, responder, "longhun");
  grant(game, responder, "tuntian");
  victim.hp = 1;
  responder.hp = 2;
  actor.hand = [card("tuntian-slash", "slash")];
  responder.hand = [card("tuntian-heart-hand", "dodge", "heart")];
  responder.equipment.armor = card("tuntian-heart-armor", "ba_gua_zhen", "heart");
  game.turn.slashDamageBonus = 2;
  game.deck = [card("tuntian-judgment", "slash", "heart")];

  let current = applyAction(game, {
    type: "play_card",
    playerId: actor.id,
    cardId: "tuntian-slash",
    targetId: victim.id,
  });
  current = applyAction(current, { type: "respond", playerId: victim.id, cardId: null });
  current = applyAction(current, { type: "respond", playerId: victim.id, cardId: null });
  current = applyAction(current, {
    type: "use_skill",
    playerId: responder.id,
    skillId: "longhun",
    cardIds: ["tuntian-heart-hand", "tuntian-heart-armor"],
  });
  expect(current.pendingResponse).toMatchObject({
    type: "standard_skill",
    targetId: responder.id,
    skillId: "tuntian",
    stage: "tuntian_invoke",
  });
  expect(current.afterMove.suspendedResponse).toMatchObject({ type: "dying", victimId: victim.id });
  const suspendedTargetId = current.afterMove.suspendedResponse?.targetId;
  const unrelated = current.players.find((player) => player.alive &&
    player.id !== actor.id && player.id !== victim.id && player.id !== responder.id && player.id !== suspendedTargetId);
  if (!unrelated) throw new Error("Missing unrelated Longhun/Tuntian forfeiter");
  return { current, victim, responder, unrelated };
}

function longhunJianxiongBarrier() {
  const { game, actor, others: [owner, unrelated] } = setup();
  if (!owner || !unrelated) throw new Error("Missing Longhun/Jianxiong fixtures");
  grant(game, actor, "longhun");
  grant(game, owner, "jianxiong");
  actor.hp = 2;
  actor.hand = [card("jianxiong-diamond-hand", "dodge", "diamond")];
  actor.equipment.armor = card("jianxiong-diamond-armor", "ba_gua_zhen", "diamond");

  let current = applyAction(game, {
    type: "use_skill",
    playerId: actor.id,
    skillId: "longhun",
    cardIds: ["jianxiong-diamond-hand", "jianxiong-diamond-armor"],
    targetId: owner.id,
  });
  current = applyAction(current, { type: "respond", playerId: owner.id, cardId: null });
  expect(current.pendingResponse).toMatchObject({
    type: "standard_skill",
    targetId: owner.id,
    skillId: "jianxiong",
    stage: "invoke",
    damageOpportunity: expect.any(Object),
  });
  return { current, owner, unrelated };
}

describe("forfeit barriers", () => {
  it("closes Wuhun without an orphan prompt when Shen Guan Yu forfeits with tied maximum marks", () => {
    const { game, others: [owner, firstTarget, secondTarget] } = setup();
    if (!owner || !firstTarget || !secondTarget) throw new Error("Missing forfeit Wuhun fixtures");
    owner.generalId = "shen_guan_yu";
    owner.godFaction = "wei";
    for (const target of [firstTarget, secondTarget]) {
      addMark(game.completeRules.lifecycle, {
        markId: "nightmare",
        ownerId: target.id,
        sourcePlayerId: owner.id,
        sourceSkillId: "wuhun",
        amount: 1,
        visibility: "public",
        expiry: { type: "permanent" },
      });
    }

    const current = forfeitPlayer(game, owner.id);

    expect(current.players.find((player) => player.id === owner.id)).toMatchObject({ alive: false, hp: 0 });
    expect(current.pendingResponse).toBeNull();
    expect(current.completeRules.death.frames).toEqual([]);
    expect(current.logs.map((entry) => entry.message).join("\n")).toContain(`${owner.id} 离席并被判定出局`);
  });

  it.each(["responder", "unrelated"] as const)(
    "keeps a paid Longhun rescue through Buqu recovery when the %s forfeits",
    (departing) => {
      const { current: barrier, victim, responder, unrelated } = longhunBuquBarrier();
      const pendingBefore = JSON.parse(JSON.stringify(barrier.pendingResponse));
      let current = forfeitPlayer(barrier, departing === "responder" ? responder.id : unrelated.id);

      expect(current.pendingResponse).toEqual(pendingBefore);
      expect(current.resolvingCards.map((owned) => owned.id)).toEqual(expect.arrayContaining([
        "barrier-heart-hand",
        "barrier-heart-armor",
      ]));
      const prompt = standardPrompt(current, victim.id);
      current = applyAction(current, {
        type: "resolve_standard_skill",
        playerId: victim.id,
        promptId: prompt.promptId,
        activate: true,
        cardId: prompt.allowedCardIds[0],
      });

      expect(current.players.find((player) => player.id === victim.id)).toMatchObject({ alive: true, hp: -1 });
      expect(current.completeRules.dying.frames).toEqual([]);
      expect(current.completeRules.damageFlow.frames).toEqual([]);
      expect(current.discardPile.map((owned) => owned.id)).toEqual(expect.arrayContaining([
        "barrier-heart-hand",
        "barrier-heart-armor",
      ]));
    },
  );

  it("restores the live dying cursor when the owner of an uncommitted Tuntian prompt forfeits", () => {
    const { current: barrier, victim, responder } = longhunTuntianBarrier();
    let current = forfeitPlayer(barrier, responder.id);

    expect(current.pendingResponse).toMatchObject({ type: "dying", victimId: victim.id });
    expect(current.afterMove).toEqual({
      queuedRecoveries: [],
      queuedTriggers: [],
      suspendedPhase: null,
      suspendedResponse: null,
    });
    expect(current.completeRules.dying.frames).toHaveLength(1);
    expect(current.completeRules.damageFlow.frames).toHaveLength(1);

    current = passDying(current);
    expect(current.completeRules.dying.frames).toEqual([]);
    expect(current.completeRules.damageFlow.frames).toEqual([]);
  });

  it("keeps an unrelated Tuntian prompt and its suspended dying cursor byte-for-byte", () => {
    const { current: barrier, responder, unrelated } = longhunTuntianBarrier();
    const pendingBefore = JSON.parse(JSON.stringify(barrier.pendingResponse));
    const suspendedBefore = JSON.parse(JSON.stringify(barrier.afterMove.suspendedResponse));
    let current = forfeitPlayer(barrier, unrelated.id);

    expect(current.pendingResponse).toEqual(pendingBefore);
    expect(current.afterMove.suspendedResponse).toEqual(suspendedBefore);
    const prompt = standardPrompt(current, responder.id);
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: responder.id,
      promptId: prompt.promptId,
      activate: false,
    });
    expect(current.pendingResponse).toEqual(suspendedBefore);
    expect(current.completeRules.dying.frames).toHaveLength(1);
    expect(current.completeRules.damageFlow.frames).toHaveLength(1);
  });

  it("closes a dying and DamageFlow barrier when its victim forfeits under Tuntian", () => {
    const { current: barrier, victim } = longhunTuntianBarrier();
    const current = forfeitPlayer(barrier, victim.id);

    expect(current.pendingResponse).toBeNull();
    expect(current.afterMove.suspendedResponse).toBeNull();
    expect(current.completeRules.dying.frames).toEqual([]);
    expect(current.completeRules.damageFlow.frames).toEqual([]);
  });

  it("closes a Niepan owner-response barrier when the dying victim forfeits", () => {
    const { game, actor, others: [victim] } = setup();
    if (!victim) throw new Error("Missing Niepan fixture");
    for (const player of game.players) {
      if (player.id !== actor.id && player.id !== victim.id) player.role = "loyalist";
    }
    grant(game, victim, "niepan");
    victim.hp = 1;
    actor.hand = [card("niepan-forfeit-slash", "slash")];
    let current = applyAction(game, {
      type: "play_card",
      playerId: actor.id,
      cardId: "niepan-forfeit-slash",
      targetId: victim.id,
    });
    current = applyAction(current, { type: "respond", playerId: victim.id, cardId: null });
    expect(current.pendingResponse).toMatchObject({
      type: "skill_choice",
      targetId: victim.id,
      skillId: "niepan",
      resume: { type: "dying" },
    });

    current = forfeitPlayer(current, victim.id);
    expect(current.pendingResponse).toBeNull();
    expect(current.completeRules.dying.frames).toEqual([]);
    expect(current.completeRules.damageFlow.frames).toEqual([]);
  });

  it("preserves a Buqu entry prompt for a bystander and closes it for the forfeiting victim", () => {
    const { game, actor, others: [victim, unrelated] } = setup();
    if (!victim || !unrelated) throw new Error("Missing Buqu entry fixtures");
    grant(game, victim, "buqu");
    victim.hp = 1;
    actor.hand = [card("buqu-entry-slash", "slash")];
    game.deck = [card("buqu-entry-wound", "dodge", "spade")];
    let barrier = applyAction(game, {
      type: "play_card",
      playerId: actor.id,
      cardId: "buqu-entry-slash",
      targetId: victim.id,
    });
    barrier = applyAction(barrier, { type: "respond", playerId: victim.id, cardId: null });
    expect(barrier.pendingResponse).toMatchObject({
      type: "skill_choice",
      targetId: victim.id,
      skillId: "buqu",
      resume: { type: "dying" },
    });

    const pendingBefore = JSON.parse(JSON.stringify(barrier.pendingResponse));
    const preserved = forfeitPlayer(barrier, unrelated.id);
    expect(preserved.pendingResponse).toEqual(pendingBefore);
    expect(preserved.completeRules.dying.frames).toHaveLength(1);
    expect(preserved.completeRules.damageFlow.frames).toHaveLength(1);

    const closed = forfeitPlayer(barrier, victim.id);
    expect(closed.pendingResponse).toBeNull();
    expect(closed.completeRules.dying.frames).toEqual([]);
    expect(closed.completeRules.damageFlow.frames).toEqual([]);
  });

  it("passes an invalid Jianxiong DamageFlow opportunity when its owner forfeits", () => {
    const { current: barrier, owner } = longhunJianxiongBarrier();
    const current = forfeitPlayer(barrier, owner.id);

    expect(current.pendingResponse).toBeNull();
    expect(current.completeRules.damageFlow.frames).toEqual([]);
    expect(current.discardPile.map((owned) => owned.id)).toEqual(expect.arrayContaining([
      "jianxiong-diamond-hand",
      "jianxiong-diamond-armor",
    ]));
  });

  it("preserves a still-eligible Jianxiong DamageFlow opportunity after an unrelated forfeit", () => {
    const { current: barrier, owner, unrelated } = longhunJianxiongBarrier();
    const pendingBefore = JSON.parse(JSON.stringify(barrier.pendingResponse));
    let current = forfeitPlayer(barrier, unrelated.id);

    expect(current.pendingResponse).toEqual(pendingBefore);
    const prompt = standardPrompt(current, owner.id);
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
    });
    expect(current.players.find((player) => player.id === owner.id)?.hand.map((owned) => owned.id))
      .toEqual(expect.arrayContaining(["jianxiong-diamond-hand", "jianxiong-diamond-armor"]));
    expect(current.completeRules.damageFlow.frames).toEqual([]);
  });
});
