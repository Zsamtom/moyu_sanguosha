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

const seed = "71".repeat(32);

function card(id: string, kind: CardKind, suit: Card["suit"] = "club"): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank: 7 };
}

function setup(): { game: GameSession; attacker: GamePlayer; others: GamePlayer[] } {
  const game = createGame({ playerIds: ["leiji-1", "leiji-2", "leiji-3", "leiji-4"], seed });
  const attacker = game.players.find((player) => player.id === game.currentPlayerId)!;
  const others = game.players.filter((player) => player.id !== attacker.id).sort((left, right) => left.seat - right.seat);
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
    playerId: attacker.id,
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
  return { game, attacker, others };
}

function standardPrompt(game: GameSession, playerId: string) {
  const prompt = getGameView(game, playerId).prompt;
  if (prompt.type !== "standard_skill") throw new Error(`Expected standard skill prompt, got ${prompt.type}`);
  return prompt;
}

function declineLeiji(game: GameSession, ownerId: string): GameSession {
  const prompt = standardPrompt(game, ownerId);
  expect(prompt).toMatchObject({ skillId: "leiji", stage: "leiji_target", canPass: true });
  return applyAction(game, {
    type: "resolve_standard_skill",
    playerId: ownerId,
    promptId: prompt.promptId,
    activate: false,
  });
}

function attackAndDodge(game: GameSession, attacker: GamePlayer, owner: GamePlayer, slashId: string, dodgeId: string): GameSession {
  let current = applyAction(game, { type: "play_card", playerId: attacker.id, cardId: slashId, targetId: owner.id });
  current = applyAction(current, { type: "respond", playerId: owner.id, cardId: dodgeId });
  return current;
}

function allZoneCardIds(game: GameSession): string[] {
  return [
    ...game.deck,
    ...game.discardPile,
    ...game.resolvingCards,
    ...game.players.flatMap((player) => player.hand),
    ...game.players.flatMap((player) => Object.values(player.equipment)),
    ...game.players.flatMap((player) => player.judgment),
    ...game.players.flatMap((player) => Object.values(player.extraPiles).flat()),
  ].map((entry) => entry.id);
}

function life(game: GameSession) {
  return game.players.map(({ id, hp, maxHp, alive }) => ({ id, hp, maxHp, alive }));
}

describe("live Wind Leiji", () => {
  it("offers one target choice for an accepted physical Dodge and declining resumes the exact Slash", () => {
    const { game, attacker, others: [owner] } = setup();
    if (!owner) throw new Error("Missing Leiji owner");
    owner.generalId = "zhang_jiao";
    attacker.hand = [card("leiji-slash", "slash")];
    owner.hand = [card("leiji-dodge", "dodge", "heart")];

    let current = attackAndDodge(game, attacker, owner, "leiji-slash", "leiji-dodge");
    const prompt = standardPrompt(current, owner.id);
    expect(prompt).toMatchObject({
      skillId: "leiji",
      stage: "leiji_target",
      targetIds: expect.arrayContaining(game.players.map((player) => player.id)),
      minTargets: 1,
      maxTargets: 1,
    });
    current = declineLeiji(current, owner.id);

    expect(current).toMatchObject({ pendingResponse: null, turn: { phase: "play" } });
    expect(current.players.find((player) => player.id === owner.id)?.hp).toBe(4);
    expect(current.logs.filter((entry) => entry.message.includes("可以发动雷击"))).toHaveLength(1);
    for (const id of ["leiji-slash", "leiji-dodge"]) {
      expect(allZoneCardIds(current).filter((candidate) => candidate === id)).toHaveLength(1);
    }
  });

  it("offers Leiji once for each Wushuang Dodge, including a Qingguo view-as Dodge", () => {
    const { game, attacker, others: [owner] } = setup();
    if (!owner) throw new Error("Missing Leiji owner");
    attacker.generalId = "lv_bu";
    owner.generalId = "zhen_ji";
    grantSkill(game.completeRules.lifecycle, {
      ownerId: owner.id,
      skillId: "leiji",
      sourcePlayerId: owner.id,
      sourceSkillId: "test",
      expiry: { type: "permanent" },
    });
    attacker.hand = [card("wushuang-slash", "slash")];
    owner.hand = [card("first-dodge", "dodge", "heart"), card("qingguo-card", "peach", "club")];

    let current = attackAndDodge(game, attacker, owner, "wushuang-slash", "first-dodge");
    expect(current.pendingResponse).toMatchObject({
      type: "standard_skill",
      leijiDodge: { provenance: { type: "physical", cardId: "first-dodge" }, resume: { pending: { dodgesPlayed: 1 } } },
    });
    current = declineLeiji(current, owner.id);
    expect(current.pendingResponse).toMatchObject({ type: "slash", targetId: owner.id, requiredDodgeCount: 2, dodgesPlayed: 1 });

    current = applyAction(current, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "qingguo",
      cardIds: ["qingguo-card"],
    });
    expect(current.pendingResponse).toMatchObject({
      type: "standard_skill",
      leijiDodge: {
        provenance: { type: "view_as", skillId: "qingguo", physicalCardIds: ["qingguo-card"] },
        resume: { pending: { dodgesPlayed: 2 } },
      },
    });
    current = declineLeiji(current, owner.id);

    expect(current.pendingResponse).toBeNull();
    expect(current.logs.filter((entry) => entry.message.includes("可以发动雷击"))).toHaveLength(2);
    for (const id of ["first-dodge", "qingguo-card"]) {
      expect(allZoneCardIds(current).filter((candidate) => candidate === id)).toHaveLength(1);
    }
  });

  it("deals two thunder damage on a Spade judgment and resumes the accepted Dodge once", () => {
    const { game, attacker, others: [owner, judged] } = setup();
    if (!owner || !judged) throw new Error("Missing Leiji fixtures");
    owner.generalId = "zhang_jiao";
    attacker.hand = [card("hit-slash", "slash")];
    owner.hand = [card("hit-dodge", "dodge", "heart")];
    game.deck = [card("leiji-spade", "peach", "spade")];

    let current = attackAndDodge(game, attacker, owner, "hit-slash", "hit-dodge");
    const prompt = standardPrompt(current, owner.id);
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      targetId: judged.id,
    });

    expect(current.players.find((player) => player.id === judged.id)?.hp).toBe(2);
    expect(current.players.find((player) => player.id === owner.id)?.hp).toBe(4);
    expect(current).toMatchObject({ pendingResponse: null, turn: { phase: "play" } });
    expect(current.logs.filter((entry) => entry.message.includes("受到 2 点雷电伤害"))).toHaveLength(1);
    for (const id of ["hit-slash", "hit-dodge", "leiji-spade"]) {
      expect(allZoneCardIds(current).filter((candidate) => candidate === id)).toHaveLength(1);
    }
  });

  it("JSON-restores a Leiji dying barrier and returns to the already accepted Dodge after rescue", () => {
    const { game, attacker, others: [owner, judged] } = setup();
    if (!owner || !judged) throw new Error("Missing Leiji dying fixtures");
    owner.generalId = "zhang_jiao";
    attacker.hand = [card("dying-slash", "slash")];
    owner.hand = [card("dying-dodge", "dodge", "heart")];
    judged.hp = 1;
    judged.hand = [card("rescue-1", "peach", "heart"), card("rescue-2", "peach", "diamond")];
    game.deck = [card("dying-spade", "slash", "spade")];

    let current = attackAndDodge(game, attacker, owner, "dying-slash", "dying-dodge");
    const prompt = standardPrompt(current, owner.id);
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      targetId: judged.id,
    });
    expect(current.pendingResponse).toMatchObject({ type: "dying", victimId: judged.id, targetId: judged.id });
    expect(current.completeRules.damageFlow.frames.at(-1)?.callerContinuation).toMatchObject({
      data: { resume: { type: "leiji", resume: { type: "slash" } } },
    });

    current = JSON.parse(JSON.stringify(current)) as GameSession;
    expect(() => assertCompleteRulesEngineState(current.completeRules, life(current))).not.toThrow();
    current = applyAction(current, { type: "respond", playerId: judged.id, cardId: "rescue-1" });
    expect(current.pendingResponse).toMatchObject({ type: "dying", victimId: judged.id, targetId: judged.id });
    current = applyAction(current, { type: "respond", playerId: judged.id, cardId: "rescue-2" });

    expect(current.players.find((player) => player.id === judged.id)).toMatchObject({ alive: true, hp: 1 });
    expect(current).toMatchObject({ pendingResponse: null, turn: { phase: "play" } });
    expect(current.completeRules.damageFlow.frames).toEqual([]);
    expect(current.completeRules.dying.frames).toEqual([]);
    for (const id of ["dying-slash", "dying-dodge", "dying-spade", "rescue-1", "rescue-2"]) {
      expect(allZoneCardIds(current).filter((candidate) => candidate === id)).toHaveLength(1);
    }
  });
});
