import { describe, expect, it } from "vitest";

import {
  applyAction,
  assertCompleteRulesEngineState,
  createGame,
  distanceBetweenPlayers,
  forfeitPlayer,
  getCardDefinition,
  type Card,
  type CardKind,
  type GamePlayer,
  type GameSession,
} from "../src/index.js";

const seed = "9b".repeat(32);

function card(id: string, kind: CardKind, suit: Card["suit"] = "spade", rank: Card["rank"] = 7): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank };
}

function setup(count = 4): { game: GameSession; source: GamePlayer; others: GamePlayer[] } {
  const game = createGame({
    playerIds: Array.from({ length: count }, (_value, index) => `kuanggu-${index + 1}`),
    seed,
  });
  const source = game.players.find((player) => player.id === game.currentPlayerId)!;
  const others = game.players.filter((player) => player.id !== source.id).sort((left, right) => left.seat - right.seat);
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
  source.generalId = "wei_yan";
  game.deck = [];
  game.discardPile = [];
  game.resolvingCards = [];
  game.pendingResponse = null;
  game.afterMove = { queuedRecoveries: [], queuedTriggers: [], suspendedPhase: null, suspendedResponse: null };
  game.turn = {
    ...game.turn,
    playerId: source.id,
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
  return { game, source, others };
}

function startSlash(
  game: GameSession,
  source: GamePlayer,
  target: GamePlayer,
  id: string,
  kind: Extract<CardKind, "slash" | "fire_slash"> = "slash",
): GameSession {
  source.hand.unshift(card(id, kind, kind === "fire_slash" ? "heart" : "spade"));
  return applyAction(game, { type: "play_card", playerId: source.id, cardId: id, targetId: target.id });
}

function takeSlash(game: GameSession, target: GamePlayer): GameSession {
  return applyAction(game, { type: "respond", playerId: target.id, cardId: null });
}

function passAllDyingResponders(game: GameSession): GameSession {
  let current = game;
  while (current.pendingResponse?.type === "dying") {
    current = applyAction(current, {
      type: "respond",
      playerId: current.pendingResponse.targetId,
      cardId: null,
    });
  }
  return current;
}

function arrangeOngoingDeath(game: GameSession, source: GamePlayer, target: GamePlayer): void {
  const remaining = game.players.filter((player) => player.id !== source.id && player.id !== target.id);
  if (remaining.length !== 2) throw new Error("Expected four-player death fixture");
  source.role = "loyalist";
  target.role = "rebel";
  remaining[0]!.role = "lord";
  remaining[1]!.role = "rebel";
}

function kuangguResolutionRefs(game: GameSession): string[] {
  return game.completeRules.damageFlow.consumedActions
    .map((action) => action.resolutionRef)
    .filter((value): value is string => value?.startsWith("kuanggu:") === true);
}

describe("live Wind Kuanggu", () => {
  it("recovers once per damage point and never exceeds max HP", () => {
    const { game, source } = setup(3);
    const target = game.players[(source.seat + 1) % game.players.length]!;
    source.hp = 3;
    game.turn.slashDamageBonus = 1;

    const resolved = takeSlash(startSlash(game, source, target, "kuanggu-two-point"), target);

    expect(resolved.players.find((player) => player.id === source.id)?.hp).toBe(4);
    expect(resolved.players.find((player) => player.id === target.id)?.hp).toBe(2);
    expect(kuangguResolutionRefs(resolved)).toEqual([
      "kuanggu:1:distance:1",
      "kuanggu:1:recover:1",
      "kuanggu:1:recover:2",
    ]);
    expect(resolved.logs.filter((entry) => entry.message.includes("因狂骨回复了"))).toHaveLength(1);
    expect(resolved.completeRules.damageFlow.frames).toEqual([]);
  });

  it("waits for the target's dying rescue and resumes from a JSON-restored distance snapshot", () => {
    const { game, source } = setup(3);
    const target = game.players[(source.seat + 1) % game.players.length]!;
    source.hp = 2;
    target.hp = 1;
    target.hand = [card("kuanggu-rescue", "peach", "heart")];

    let current = takeSlash(startSlash(game, source, target, "kuanggu-rescued"), target);
    expect(current.pendingResponse).toMatchObject({ type: "dying", victimId: target.id });
    expect(current.players.find((player) => player.id === source.id)?.hp).toBe(2);
    expect(kuangguResolutionRefs(current)).toEqual(["kuanggu:1:distance:1"]);

    current = JSON.parse(JSON.stringify(current)) as GameSession;
    expect(() => assertCompleteRulesEngineState(
      current.completeRules,
      current.players.map(({ id, hp, maxHp, alive }) => ({ id, hp, maxHp, alive })),
    )).not.toThrow();
    current = applyAction(current, {
      type: "respond",
      playerId: target.id,
      cardId: "kuanggu-rescue",
    });

    expect(current.players.find((player) => player.id === target.id)).toMatchObject({ hp: 1, alive: true });
    expect(current.players.find((player) => player.id === source.id)?.hp).toBe(3);
    expect(kuangguResolutionRefs(current)).toEqual([
      "kuanggu:1:distance:1",
      "kuanggu:1:recover:1",
    ]);
    expect(current.completeRules.damageFlow.frames).toEqual([]);
  });

  it("keeps a far distance locked through the target's death instead of recalculating afterward", () => {
    const { game, source } = setup(4);
    const target = game.players.find((player) =>
      player.id !== source.id && distanceBetweenPlayers(game, source.id, player.id) === 2)!;
    arrangeOngoingDeath(game, source, target);
    source.hp = 2;
    source.equipment.weapon = card("kuanggu-range", "qing_long_yan_yue_dao");
    target.hp = 1;

    let current = takeSlash(startSlash(game, source, target, "kuanggu-far-death"), target);
    expect(current.pendingResponse).toMatchObject({ type: "dying", victimId: target.id });
    expect(kuangguResolutionRefs(current)).toEqual(["kuanggu:1:distance:2"]);
    current = JSON.parse(JSON.stringify(current)) as GameSession;
    current = passAllDyingResponders(current);

    expect(current.players.find((player) => player.id === target.id)).toMatchObject({ hp: 0, alive: false });
    expect(current.players.find((player) => player.id === source.id)?.hp).toBe(2);
    expect(kuangguResolutionRefs(current)).toEqual(["kuanggu:1:distance:2"]);
    expect(current.status).toBe("playing");
    expect(current.completeRules.damageFlow.frames).toEqual([]);
  });

  it("does not recover when the damage source dies before the target's dying settlement finishes", () => {
    const { game, source } = setup(4);
    const target = game.players[(source.seat + 1) % game.players.length]!;
    arrangeOngoingDeath(game, source, target);
    source.hp = 2;
    target.hp = 1;

    let current = takeSlash(startSlash(game, source, target, "kuanggu-dead-source"), target);
    expect(kuangguResolutionRefs(current)).toEqual(["kuanggu:1:distance:1"]);
    current = forfeitPlayer(current, source.id);
    current = passAllDyingResponders(current);

    expect(current.players.find((player) => player.id === source.id)).toMatchObject({ hp: 0, alive: false });
    expect(kuangguResolutionRefs(current)).toEqual(["kuanggu:1:distance:1"]);
    expect(current.completeRules.damageFlow.frames).toEqual([]);
  });

  it("recovers independently for each propagated elemental-chain damage event", () => {
    const { game, source, others } = setup(3);
    const target = game.players[(source.seat + 1) % game.players.length]!;
    const chainedPeer = others.find((player) => player.id !== target.id)!;
    source.hp = 1;
    target.chained = true;
    chainedPeer.chained = true;

    const resolved = takeSlash(startSlash(game, source, target, "kuanggu-chain", "fire_slash"), target);

    expect(resolved.players.find((player) => player.id === source.id)?.hp).toBe(3);
    expect(resolved.players.find((player) => player.id === target.id)).toMatchObject({ hp: 3, chained: false });
    expect(resolved.players.find((player) => player.id === chainedPeer.id)).toMatchObject({ hp: 3, chained: false });
    expect(kuangguResolutionRefs(resolved)).toEqual([
      "kuanggu:1:distance:1",
      "kuanggu:1:recover:1",
      "kuanggu:2:distance:1",
      "kuanggu:2:recover:1",
    ]);
    expect(resolved.completeRules.damageFlow.completedDamageIds).toEqual([1, 2]);
    expect(resolved.completeRules.damageFlow.frames).toEqual([]);
  });
});
