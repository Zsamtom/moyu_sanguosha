import { describe, expect, it } from "vitest";

import {
  GameRuleError,
  applyAction,
  assertCompleteRulesEngineState,
  assertDyingStack,
  createGame,
  getCardDefinition,
  getGameView,
  type Card,
  type CardKind,
  type GamePlayer,
  type GameSession,
} from "../src/index.js";

const seed = "e7".repeat(32);

function card(id: string, kind: CardKind, suit: Card["suit"] = "club", rank: Card["rank"] = 7): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank };
}

function setup(count = 4): { game: GameSession; yuji: GamePlayer; others: GamePlayer[] } {
  const game = createGame({
    playerIds: Array.from({ length: count }, (_value, index) => `guhuo-${index + 1}`),
    seed,
  });
  const yuji = game.players.find((player) => player.id === game.currentPlayerId)!;
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
  yuji.generalId = "yu_ji";
  game.deck = [];
  game.discardPile = [];
  game.resolvingCards = [];
  game.pendingResponse = null;
  game.afterMove = { queuedRecoveries: [], queuedTriggers: [], suspendedPhase: null, suspendedResponse: null };
  game.turn = {
    ...game.turn,
    playerId: yuji.id,
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
  return {
    game,
    yuji,
    others: game.players.filter((player) => player.id !== yuji.id)
      .sort((left, right) => (left.seat - yuji.seat + count) % count - (right.seat - yuji.seat + count) % count),
  };
}

function challengePrompt(game: GameSession, playerId: string) {
  const prompt = getGameView(game, playerId).prompt;
  if (prompt.type !== "guhuo_challenge") throw new Error(`Expected Guhuo prompt, got ${prompt.type}`);
  return prompt;
}

function resolveChallenge(game: GameSession, challenge: boolean): GameSession {
  const pending = game.pendingResponse;
  if (pending?.type !== "guhuo" || pending.stage !== "challenge") throw new Error("Missing Guhuo challenge state");
  const prompt = challengePrompt(game, pending.targetId);
  return applyAction(game, {
    type: "resolve_guhuo",
    playerId: pending.targetId,
    promptId: prompt.promptId,
    challenge,
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

describe("live Wind Guhuo", () => {
  it("keeps the physical card hidden and lets an unchallenged false declaration resolve", () => {
    const { game, yuji } = setup(3);
    yuji.hand = [card("hidden-fake", "dodge")];
    game.deck = [card("draw-2", "peach"), card("draw-1", "slash")];

    let current = applyAction(game, {
      type: "declare_guhuo",
      playerId: yuji.id,
      cardId: "hidden-fake",
      declaredKind: "ex_nihilo",
      targetId: yuji.id,
    });
    expect(current.resolvingCards.map((entry) => entry.id)).toContain("hidden-fake");
    expect(getGameView(current, null).publicCards).toEqual([]);
    expect(getGameView(current, yuji.id).pendingResponse).toBeNull();

    current = resolveChallenge(current, false);
    current = resolveChallenge(current, false);

    expect(current.players.find((player) => player.id === yuji.id)?.hand.map((entry) => entry.id)).toEqual([
      "draw-1", "draw-2",
    ]);
    expect(current.discardPile).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "hidden-fake", kind: "dodge" }),
    ]));
    expect(current.pendingResponse).toBeNull();
    expect(current.turn.phase).toBe("play");
  });

  it("lets an unchallenged fake Peach rescue through DyingStack while retaining the physical card", () => {
    const { game, yuji: attacker, others: [yuji] } = setup(3);
    if (!yuji) throw new Error("Missing dying Guhuo fixture");
    attacker.generalId = "gan_ning";
    yuji.generalId = "yu_ji";
    yuji.hp = 1;
    attacker.hand = [card("dying-slash", "slash")];
    yuji.hand = [card("fake-peach", "slash", "club")];

    let current = applyAction(game, {
      type: "play_card",
      playerId: attacker.id,
      cardId: "dying-slash",
      targetId: yuji.id,
    });
    current = applyAction(current, { type: "respond", playerId: yuji.id, cardId: null });
    expect(current.pendingResponse).toMatchObject({ type: "dying", victimId: yuji.id, targetId: yuji.id });

    current = applyAction(current, {
      type: "declare_guhuo",
      playerId: yuji.id,
      cardId: "fake-peach",
      declaredKind: "peach",
    });
    current = JSON.parse(JSON.stringify(current)) as GameSession;
    expect(() => assertDyingStack(
      current.players.map(({ id, hp, maxHp, alive }) => ({ id, hp, maxHp, alive })),
      current.completeRules.dying,
    )).not.toThrow();
    while (current.pendingResponse?.type === "guhuo") current = resolveChallenge(current, false);

    expect(current.players.find((player) => player.id === yuji.id)).toMatchObject({ alive: true, hp: 1 });
    expect(current.completeRules.dying.frames).toEqual([]);
    expect(current.completeRules.damageFlow.frames).toEqual([]);
    expect(current.discardPile).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "fake-peach", kind: "slash", suit: "club" }),
    ]));
    expect(current.virtualCardOrigins["fake-peach"]).toBeUndefined();
    expect(() => assertCompleteRulesEngineState(current.completeRules)).not.toThrow();
  });

  it("resumes a parent rescue after a truthful Heart challenge creates a nested DyingStack", () => {
    const { game, yuji: attacker, others: [victim] } = setup(4);
    if (!victim) throw new Error("Missing nested Guhuo dying fixture");
    attacker.generalId = "gan_ning";
    victim.generalId = "yu_ji";
    victim.hp = 1;
    attacker.hand = [card("nested-guhuo-slash", "slash")];
    victim.hand = [card("nested-guhuo-peach", "peach", "heart")];

    let current = applyAction(game, {
      type: "play_card",
      playerId: attacker.id,
      cardId: "nested-guhuo-slash",
      targetId: victim.id,
    });
    current = applyAction(current, { type: "respond", playerId: victim.id, cardId: null });
    expect(current.completeRules.dying.frames).toHaveLength(1);
    current = applyAction(current, {
      type: "declare_guhuo",
      playerId: victim.id,
      cardId: "nested-guhuo-peach",
      declaredKind: "peach",
    });
    const firstChallenge = current.pendingResponse;
    if (firstChallenge?.type !== "guhuo" || firstChallenge.stage !== "challenge") {
      throw new Error("Missing nested Guhuo challenge prompt");
    }
    const challengerId = firstChallenge.targetId;
    const challenger = current.players.find((player) => player.id === challengerId)!;
    challenger.hp = 1;
    challenger.hand = [card("nested-challenger-rescue", "peach", "diamond")];

    while (current.pendingResponse?.type === "guhuo" && current.pendingResponse.stage === "challenge") {
      current = resolveChallenge(current, current.pendingResponse.targetId === challengerId);
    }

    expect(current.pendingResponse).toMatchObject({
      type: "dying",
      victimId: challengerId,
      targetId: challengerId,
      resume: { type: "guhuo" },
    });
    expect(current.completeRules.dying.frames.map((frame) => frame.victimId)).toEqual([victim.id, challengerId]);
    current = JSON.parse(JSON.stringify(current)) as GameSession;
    expect(() => assertDyingStack(
      current.players.map(({ id, hp, maxHp, alive }) => ({ id, hp, maxHp, alive })),
      current.completeRules.dying,
    )).not.toThrow();

    current = applyAction(current, {
      type: "respond",
      playerId: challengerId,
      cardId: "nested-challenger-rescue",
    });

    expect(current.players.find((player) => player.id === challengerId)).toMatchObject({ alive: true, hp: 1 });
    expect(current.players.find((player) => player.id === victim.id)).toMatchObject({ alive: true, hp: 1 });
    expect(current.completeRules.dying.frames).toEqual([]);
    expect(current.completeRules.damageFlow.frames).toEqual([]);
    expect(current.pendingResponse).toBeNull();
    expect(() => assertCompleteRulesEngineState(current.completeRules)).not.toThrow();
  });

  it("keeps the same dying responder for two independently challenged fake Peaches", () => {
    const { game, yuji: attacker, others: [yuji] } = setup(3);
    if (!yuji) throw new Error("Missing repeated Guhuo rescue fixture");
    attacker.generalId = "gan_ning";
    yuji.generalId = "yu_ji";
    yuji.hp = 1;
    attacker.hand = [card("double-damage-slash", "slash")];
    yuji.hand = [card("fake-peach-1", "slash", "club"), card("fake-peach-2", "dodge", "spade")];
    game.turn.slashDamageBonus = 1;

    let current = applyAction(game, {
      type: "play_card",
      playerId: attacker.id,
      cardId: "double-damage-slash",
      targetId: yuji.id,
    });
    current = applyAction(current, { type: "respond", playerId: yuji.id, cardId: null });
    expect(current.players.find((player) => player.id === yuji.id)?.hp).toBe(-1);

    for (const cardId of ["fake-peach-1", "fake-peach-2"]) {
      current = applyAction(current, {
        type: "declare_guhuo",
        playerId: yuji.id,
        cardId,
        declaredKind: "peach",
      });
      while (current.pendingResponse?.type === "guhuo") current = resolveChallenge(current, false);
      if (cardId === "fake-peach-1") {
        expect(current.players.find((player) => player.id === yuji.id)?.hp).toBe(0);
        expect(current.pendingResponse).toMatchObject({ type: "dying", targetId: yuji.id, victimId: yuji.id });
        expect(current.completeRules.dying.frames[0]?.rescues[0]).toMatchObject({
          cardKind: "view_as_peach",
          viewAsSkillId: "guhuo",
          physicalCardIds: ["fake-peach-1"],
          moveRecords: [{ cards: [expect.objectContaining({ id: "fake-peach-1", kind: "slash" })] }],
        });
        current = JSON.parse(JSON.stringify(current)) as GameSession;
        expect(() => assertDyingStack(
          current.players.map(({ id, hp, maxHp, alive }) => ({ id, hp, maxHp, alive })),
          current.completeRules.dying,
        )).not.toThrow();
      }
    }

    expect(current.players.find((player) => player.id === yuji.id)).toMatchObject({ alive: true, hp: 1 });
    expect(current.completeRules.dying.frames).toEqual([]);
    expect(current.discardPile.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      "fake-peach-1", "fake-peach-2",
    ]));
    expect(current.logs.filter((entry) => entry.message.includes("无人质疑") && entry.message.includes(yuji.id))).toHaveLength(2);
  });

  it("resolves truthful Heart consequences in challenge order across JSON-restored dying frames", () => {
    const { game, yuji, others: [first, second] } = setup(4);
    if (!first || !second) throw new Error("Missing multi-challenger fixtures");
    yuji.hand = [card("truthful-heart", "ex_nihilo", "heart")];
    first.hp = second.hp = 1;
    first.hand = [card("first-rescue", "peach", "diamond")];
    second.hand = [card("second-rescue", "peach", "diamond")];
    game.deck = [card("truth-draw-2", "slash"), card("truth-draw-1", "dodge")];

    let current = applyAction(game, {
      type: "declare_guhuo",
      playerId: yuji.id,
      cardId: "truthful-heart",
      declaredKind: "ex_nihilo",
      targetId: yuji.id,
    });
    current = resolveChallenge(current, true);
    current = resolveChallenge(current, true);
    current = resolveChallenge(current, false);
    expect(current.pendingResponse).toMatchObject({ type: "dying", victimId: first.id, targetId: first.id });
    expect(getGameView(current, null).publicCards).toEqual([
      expect.objectContaining({ id: "truthful-heart", kind: "ex_nihilo", suit: "heart" }),
    ]);

    const forgedCursor = JSON.parse(JSON.stringify(current)) as GameSession;
    const forgedCursorDying = forgedCursor.pendingResponse;
    if (forgedCursorDying?.type !== "dying" || forgedCursorDying.resume.type !== "guhuo") {
      throw new Error("Missing forged Guhuo dying resume");
    }
    forgedCursorDying.resume.pending.remainingConsequenceIds.splice(
      0,
      forgedCursorDying.resume.pending.remainingConsequenceIds.length,
      yuji.id,
    );
    expect(() => applyAction(forgedCursor, {
      type: "respond",
      playerId: first.id,
      cardId: "first-rescue",
    })).toThrow(/蛊惑后果.*游标|蛊惑后果续体/);

    const forgedDecision = JSON.parse(JSON.stringify(current)) as GameSession;
    const forgedDecisionDying = forgedDecision.pendingResponse;
    if (forgedDecisionDying?.type !== "dying" || forgedDecisionDying.resume.type !== "guhuo") {
      throw new Error("Missing forged Guhuo adjudication resume");
    }
    Object.assign(forgedDecisionDying.resume.pending, {
      outcome: "challenged_false",
      continuesAsDeclared: false,
      consequenceEffect: "draw",
    });
    expect(() => applyAction(forgedDecision, {
      type: "respond",
      playerId: first.id,
      cardId: "first-rescue",
    })).toThrow(/蛊惑后果续体与权威重新裁定结果不一致/);

    current = JSON.parse(JSON.stringify(current)) as GameSession;
    current = applyAction(current, { type: "respond", playerId: first.id, cardId: "first-rescue" });
    expect(current.pendingResponse).toMatchObject({ type: "dying", victimId: second.id, targetId: second.id });
    current = JSON.parse(JSON.stringify(current)) as GameSession;
    current = applyAction(current, { type: "respond", playerId: second.id, cardId: "second-rescue" });

    expect(current.players.find((player) => player.id === first.id)).toMatchObject({ alive: true, hp: 1 });
    expect(current.players.find((player) => player.id === second.id)).toMatchObject({ alive: true, hp: 1 });
    expect(current.players.find((player) => player.id === yuji.id)?.hand.map((entry) => entry.id)).toEqual([
      "truth-draw-1", "truth-draw-2",
    ]);
    expect(current.completeRules.dying.frames).toEqual([]);
    expect(current.logs.filter((entry) => entry.message.includes("质疑了真实的蛊惑声明"))).toHaveLength(2);
  });

  it("rewards challengers and cancels a false challenged declaration", () => {
    const { game, yuji, others: [challenger] } = setup(3);
    if (!challenger) throw new Error("Missing false Guhuo fixture");
    yuji.hand = [card("challenged-fake", "dodge", "spade")];
    game.deck = [card("challenge-reward", "peach")];

    let current = applyAction(game, {
      type: "declare_guhuo",
      playerId: yuji.id,
      cardId: "challenged-fake",
      declaredKind: "ex_nihilo",
      targetId: yuji.id,
    });
    current = resolveChallenge(current, true);
    current = resolveChallenge(current, false);

    expect(current.players.find((player) => player.id === challenger.id)?.hand.map((entry) => entry.id)).toEqual([
      "challenge-reward",
    ]);
    expect(current.players.find((player) => player.id === yuji.id)?.hand).toEqual([]);
    expect(current.discardPile).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "challenged-fake", kind: "dodge", suit: "spade" }),
    ]));
    expect(current.pendingResponse).toBeNull();
    expect(current.turn.phase).toBe("play");
  });

  it("uses an unchallenged fake Dodge through the existing response pipeline", () => {
    const { game, yuji: attacker, others: [yuji] } = setup(3);
    if (!yuji) throw new Error("Missing response Guhuo fixture");
    attacker.generalId = "gan_ning";
    yuji.generalId = "yu_ji";
    attacker.hand = [card("response-slash", "slash")];
    yuji.hand = [card("fake-dodge", "peach", "club")];

    let current = applyAction(game, {
      type: "play_card",
      playerId: attacker.id,
      cardId: "response-slash",
      targetId: yuji.id,
    });
    current = applyAction(current, {
      type: "declare_guhuo",
      playerId: yuji.id,
      cardId: "fake-dodge",
      declaredKind: "dodge",
    });
    while (current.pendingResponse?.type === "guhuo") current = resolveChallenge(current, false);

    expect(current.players.find((player) => player.id === yuji.id)?.hp).toBe(4);
    expect(current.pendingResponse).toBeNull();
    expect(current.discardPile).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "response-slash", kind: "slash" }),
      expect.objectContaining({ id: "fake-dodge", kind: "peach" }),
    ]));
  });

  it("rejects forbidden declarations, stale prompts, wrong actors, and forged persisted cursors", () => {
    const { game, yuji } = setup(3);
    yuji.hand = [card("guarded-card", "dodge")];
    expect(ruleCode(() => applyAction(game, {
      type: "declare_guhuo",
      playerId: yuji.id,
      cardId: "guarded-card",
      declaredKind: "shan_dian",
    }))).toBe("INVALID_CARD");

    let current = applyAction(game, {
      type: "declare_guhuo",
      playerId: yuji.id,
      cardId: "guarded-card",
      declaredKind: "ex_nihilo",
      targetId: yuji.id,
    });
    const pending = current.pendingResponse;
    if (pending?.type !== "guhuo" || pending.stage !== "challenge") throw new Error("Missing guarded Guhuo state");
    const wrongActor = current.players.find((player) => player.alive && player.id !== pending.targetId && player.id !== yuji.id)!;
    expect(ruleCode(() => applyAction(current, {
      type: "resolve_guhuo",
      playerId: wrongActor.id,
      promptId: pending.promptId,
      challenge: false,
    }))).toBe("INVALID_PHASE");
    expect(ruleCode(() => applyAction(current, {
      type: "resolve_guhuo",
      playerId: pending.targetId,
      promptId: `${pending.promptId}:stale`,
      challenge: false,
    }))).toBe("INVALID_RESPONSE");

    const forgedCard = JSON.parse(JSON.stringify(current)) as GameSession;
    if (forgedCard.pendingResponse?.type !== "guhuo") throw new Error("Missing forged Guhuo state");
    forgedCard.pendingResponse = { ...forgedCard.pendingResponse, physicalCardId: "missing-card" };
    expect(() => applyAction(forgedCard, {
      type: "resolve_guhuo",
      playerId: pending.targetId,
      promptId: pending.promptId,
      challenge: false,
    })).toThrow(/主动用牌声明不一致|不在处理区/);

    const forgedOrder = JSON.parse(JSON.stringify(current)) as GameSession;
    if (forgedOrder.pendingResponse?.type !== "guhuo" || forgedOrder.pendingResponse.stage !== "challenge") {
      throw new Error("Missing forged Guhuo order state");
    }
    forgedOrder.pendingResponse = { ...forgedOrder.pendingResponse, remainingChallengeIds: [] };
    expect(() => applyAction(forgedOrder, {
      type: "resolve_guhuo",
      playerId: pending.targetId,
      promptId: pending.promptId,
      challenge: false,
    })).toThrow(/座次游标/);

    current = resolveChallenge(current, false);
    const next = current.pendingResponse;
    if (next?.type !== "guhuo" || next.stage !== "challenge") throw new Error("Missing second Guhuo prompt");
    expect(ruleCode(() => applyAction(current, {
      type: "resolve_guhuo",
      playerId: next.targetId,
      promptId: pending.promptId,
      challenge: false,
    }))).toBe("INVALID_RESPONSE");
  });

  it("does not restore a suspended response when a truthful challenge ends the game", () => {
    const { game, yuji: lord, others: [yuji] } = setup(2);
    if (!yuji) throw new Error("Missing terminal Guhuo fixture");
    lord.generalId = "gan_ning";
    lord.hp = 1;
    yuji.generalId = "yu_ji";
    lord.hand = [card("terminal-slash", "slash")];
    yuji.hand = [card("terminal-heart-dodge", "dodge", "heart")];

    let current = applyAction(game, {
      type: "play_card",
      playerId: lord.id,
      cardId: "terminal-slash",
      targetId: yuji.id,
    });
    current = applyAction(current, {
      type: "declare_guhuo",
      playerId: yuji.id,
      cardId: "terminal-heart-dodge",
      declaredKind: "dodge",
    });
    current = resolveChallenge(current, true);
    expect(current.pendingResponse).toMatchObject({ type: "dying", victimId: lord.id });
    while (current.status === "playing" && current.pendingResponse?.type === "dying") {
      current = applyAction(current, {
        type: "respond",
        playerId: current.pendingResponse.targetId,
        cardId: null,
      });
    }

    expect(current.status).toBe("finished");
    expect(current.pendingResponse).toBeNull();
    expect(current.resolvingCards).toEqual([]);
    expect(current.discardPile.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      "terminal-slash", "terminal-heart-dodge",
    ]));
  });
});
