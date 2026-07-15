import { describe, expect, it } from "vitest";

import {
  applyAction,
  assertCompleteRulesEngineState,
  createGame,
  forfeitPlayer,
  getCardDefinition,
  getGameView,
  type Card,
  type CardKind,
  type DyingResume,
  type GamePlayer,
  type GameSession,
  type PendingDyingResponse,
} from "../src/index.js";

const seed = "6e".repeat(32);

type LiveDyingCursor = Extract<DyingResume, { type: "damage_flow" }>;
type LiveDyingPending = PendingDyingResponse & { readonly resume: LiveDyingCursor };

function card(id: string, kind: CardKind, suit: Card["suit"] = "spade", rank: Card["rank"] = 7): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank };
}

function setup(count = 4): { game: GameSession; actor: GamePlayer; others: GamePlayer[] } {
  const game = createGame({
    playerIds: Array.from({ length: count }, (_value, index) => `dying-flow-${index + 1}`),
    seed,
  });
  const actor = game.players.find((player) => player.id === game.currentPlayerId)!;
  const others = game.players
    .filter((player) => player.id !== actor.id)
    .sort((left, right) => left.seat - right.seat);
  for (const player of game.players) {
    player.generalId = "gan_ning";
    player.hp = 4;
    player.maxHp = 4;
    player.alive = true;
    player.hand = [];
    player.equipment = {};
    player.judgment = [];
    player.chained = false;
    player.extraPiles = {};
  }
  game.pendingResponse = null;
  game.resolvingCards = [];
  game.afterMove = { queuedTriggers: [], suspendedPhase: null, suspendedResponse: null };
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

function attachTurnFlowCompletion(
  game: GameSession,
  destination: "play" | "discard_or_end" = "play",
): GameSession {
  if (game.pendingResponse?.type !== "slash") throw new Error("Expected an in-flight Slash");
  const continuationId = game.nextEventId;
  game.nextEventId += 1;
  game.completeRules.nextEventId = game.nextEventId;
  game.pendingResponse = {
    ...game.pendingResponse,
    completion: { type: "turn_flow", continuationId, playerId: game.currentPlayerId, destination },
  };
  return game;
}

function startSlash(
  game: GameSession,
  actor: GamePlayer,
  target: GamePlayer,
  kind: "slash" | "fire_slash" = "slash",
): GameSession {
  const id = `dying-flow-${kind}`;
  actor.hand.unshift(card(id, kind, kind === "fire_slash" ? "heart" : "spade"));
  return applyAction(game, { type: "play_card", playerId: actor.id, cardId: id, targetId: target.id });
}

function liveDyingPending(game: GameSession): LiveDyingPending {
  const pending = game.pendingResponse;
  if (pending?.type !== "dying" || pending.resume.type !== "damage_flow") {
    throw new Error("Expected an ordinary dying prompt backed by a live DamageFlow cursor");
  }
  return pending as LiveDyingPending;
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

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function arrangeOngoingRebelDeath(
  game: GameSession,
  actor: GamePlayer,
  target: GamePlayer,
): { lord: GamePlayer; survivingRebel: GamePlayer } {
  const remaining = game.players.filter((player) => player.id !== actor.id && player.id !== target.id);
  const [lord, survivingRebel] = remaining;
  if (!lord || !survivingRebel) throw new Error("Expected two remaining players");
  actor.role = "loyalist";
  target.role = "rebel";
  lord.role = "lord";
  survivingRebel.role = "rebel";
  return { lord, survivingRebel };
}

describe("live lethal DamageFlow integration", () => {
  it("survives JSON recovery mid-dying, consumes Peach, and completes the frame exactly once", () => {
    const { game, actor, others: [target] } = setup(3);
    actor.hp = 1;
    actor.hand = [card("extra-1", "dodge"), card("extra-2", "dodge"), card("extra-3", "dodge")];
    target!.hp = 1;
    target!.hand = [card("rescue-peach", "peach", "heart")];

    let current = attachTurnFlowCompletion(startSlash(game, actor, target!), "discard_or_end");
    current = applyAction(current, { type: "respond", playerId: target!.id, cardId: null });
    const pending = liveDyingPending(current);
    expect(pending.resume).toEqual({ type: "damage_flow", frameId: 1, damageId: 1, dyingId: 1 });
    expect(current.completeRules.damageFlow.frames).toHaveLength(1);
    expect(current.completeRules.damageFlow.completedDamageIds).toEqual([]);
    expect(current.completeRules.nextDamageId).toBe(2);

    const restored = jsonClone(current);
    expect(() => assertCompleteRulesEngineState(restored.completeRules)).not.toThrow();
    current = applyAction(restored, {
      type: "respond",
      playerId: target!.id,
      cardId: "rescue-peach",
    });

    expect(current.players.find((player) => player.id === target!.id)).toMatchObject({ hp: 1, alive: true, hand: [] });
    expect(current.completeRules.damageFlow.frames).toEqual([]);
    expect(current.completeRules.damageFlow.completedDamageIds).toEqual([1]);
    expect(current.completeRules.damageFlow.completedFrameIds).toEqual([1]);
    expect(current.completeRules.nextDamageId).toBe(2);
    expect(current.pendingResponse).toBeNull();
    expect(current.turn).toMatchObject({ phase: "discard", requiredDiscardCount: 2 });
    expect(() => assertCompleteRulesEngineState(current.completeRules)).not.toThrow();
  });

  it("kills after every responder passes, awards the rebel bounty once, and keeps the game running", () => {
    const { game, actor } = setup(4);
    const target = game.players[(actor.seat + 1) % game.players.length]!;
    const { survivingRebel } = arrangeOngoingRebelDeath(game, actor, target);
    target.hp = 1;

    let current = attachTurnFlowCompletion(startSlash(game, actor, target));
    current = applyAction(current, { type: "respond", playerId: target.id, cardId: null });
    liveDyingPending(current);
    const actorHandBeforeDeath = current.players.find((player) => player.id === actor.id)!.hand.length;
    const deckBeforeDeath = current.deck.length;
    const cardLogsBeforeDeath = current.logs.filter((entry) => entry.type === "card").length;
    const deathLogsBeforeDeath = current.logs.filter((entry) => entry.type === "death").length;

    current = passAllDyingResponders(current);

    expect(current.players.find((player) => player.id === target.id)).toMatchObject({ hp: 0, alive: false });
    expect(current.players.find((player) => player.id === actor.id)?.hand).toHaveLength(actorHandBeforeDeath + 3);
    expect(current.deck).toHaveLength(deckBeforeDeath - 3);
    expect(current.logs.filter((entry) => entry.type === "card")).toHaveLength(cardLogsBeforeDeath + 1);
    expect(current.logs.filter((entry) => entry.type === "death")).toHaveLength(deathLogsBeforeDeath + 1);
    expect(current.status).toBe("playing");
    expect(current.players.find((player) => player.id === survivingRebel.id)?.alive).toBe(true);
    expect(current.completeRules.damageFlow.frames).toEqual([]);
    expect(current.completeRules.damageFlow.completedDamageIds).toEqual([1]);
    expect(current.completeRules.damageFlow.completedFrameIds).toEqual([1]);
    expect(current.completeRules.nextDamageId).toBe(2);
  });

  it("clears the lethal frame even when a two-player death determines the winner", () => {
    const { game, actor, others: [target] } = setup(2);
    actor.role = "lord";
    target!.role = "rebel";
    target!.hp = 1;

    let current = attachTurnFlowCompletion(startSlash(game, actor, target!));
    current = applyAction(current, { type: "respond", playerId: target!.id, cardId: null });
    liveDyingPending(current);
    current = passAllDyingResponders(current);

    expect(current.status).toBe("finished");
    expect(current.winner).toMatchObject({ side: "lord", playerIds: expect.arrayContaining([actor.id]) });
    expect(current.players.find((player) => player.id === target!.id)?.alive).toBe(false);
    expect(current.pendingResponse).toBeNull();
    expect(current.completeRules.damageFlow.frames).toEqual([]);
    expect(current.completeRules.damageFlow.completedDamageIds).toEqual([1]);
    expect(current.completeRules.damageFlow.completedFrameIds).toEqual([1]);
    expect(current.completeRules.nextDamageId).toBe(2);
  });

  it("continues fire-chain propagation after the first target dies and consumes unique damage IDs", () => {
    const { game, actor } = setup(4);
    const target = game.players[(actor.seat + 1) % game.players.length]!;
    const { survivingRebel: chainedPeer } = arrangeOngoingRebelDeath(game, actor, target);
    target.hp = 1;
    target.chained = true;
    chainedPeer.chained = true;

    let current = attachTurnFlowCompletion(startSlash(game, actor, target, "fire_slash"));
    current = applyAction(current, { type: "respond", playerId: target.id, cardId: null });
    liveDyingPending(current);
    expect(current.players.find((player) => player.id === chainedPeer.id)?.hp).toBe(4);

    current = passAllDyingResponders(current);

    expect(current.status).toBe("playing");
    expect(current.players.find((player) => player.id === target.id)).toMatchObject({ hp: 0, alive: false, chained: false });
    expect(current.players.find((player) => player.id === chainedPeer.id)).toMatchObject({ hp: 3, alive: true, chained: false });
    expect(current.completeRules.damageFlow.frames).toEqual([]);
    expect(current.completeRules.damageFlow.completedDamageIds).toEqual([1, 2]);
    expect(current.completeRules.damageFlow.completedFrameIds).toEqual([1, 2]);
    expect(new Set(current.completeRules.damageFlow.completedDamageIds).size).toBe(2);
    expect(new Set(current.completeRules.damageFlow.completedFrameIds).size).toBe(2);
    expect(current.completeRules.nextDamageId).toBe(3);
    expect(current.pendingResponse).toBeNull();
    expect(current.turn.phase).toBe("play");
  });

  it("closes the exact lethal frame when its victim forfeits without ending the game", () => {
    const { game, actor } = setup(4);
    const target = game.players[(actor.seat + 1) % game.players.length]!;
    arrangeOngoingRebelDeath(game, actor, target);
    target.hp = 1;

    let current = attachTurnFlowCompletion(startSlash(game, actor, target));
    current = applyAction(current, { type: "respond", playerId: target.id, cardId: null });
    liveDyingPending(current);
    const original = JSON.stringify(current);

    const continued = forfeitPlayer(current, target.id);

    expect(JSON.stringify(current)).toBe(original);
    expect(continued.status).toBe("playing");
    expect(continued.players.find((player) => player.id === target.id)).toMatchObject({ alive: false, hp: 0 });
    expect(continued.pendingResponse).toBeNull();
    expect(continued.completeRules.damageFlow.frames).toEqual([]);
    expect(continued.completeRules.damageFlow.completedDamageIds).toEqual([1]);
    expect(continued.completeRules.damageFlow.completedFrameIds).toEqual([1]);
  });

  it("settles a different dying victim before a third-party forfeit ends the game", () => {
    const { game, actor, others } = setup(4);
    const target = game.players[(actor.seat + 1) % game.players.length]!;
    const [threat, ally] = others.filter((player) => player.id !== target.id);
    if (!threat || !ally) throw new Error("Missing terminal-forfeit fixtures");
    actor.role = "lord";
    target.role = "loyalist";
    threat.role = "rebel";
    ally.role = "loyalist";
    target.hp = 1;

    let current = attachTurnFlowCompletion(startSlash(game, actor, target));
    current = applyAction(current, { type: "respond", playerId: target.id, cardId: null });
    liveDyingPending(current);
    current = forfeitPlayer(current, threat.id);

    expect(current.status).toBe("finished");
    expect(current.winner).toMatchObject({ side: "lord" });
    expect(current.players.find((player) => player.id === threat.id)).toMatchObject({ alive: false, hp: 0 });
    expect(current.players.find((player) => player.id === target.id)).toMatchObject({ alive: false, hp: 0 });
    expect(current.pendingResponse).toBeNull();
    expect(current.completeRules.damageFlow.frames).toEqual([]);
    expect(current.completeRules.damageFlow.completedDamageIds).toEqual([1]);
    expect(current.completeRules.damageFlow.completedFrameIds).toEqual([1]);
  });

  it("restores a dying cursor suspended by an after-move prompt before forfeiture", () => {
    const { game, actor } = setup(4);
    const target = game.players[(actor.seat + 1) % game.players.length]!;
    arrangeOngoingRebelDeath(game, actor, target);
    target.hp = 1;

    let current = attachTurnFlowCompletion(startSlash(game, actor, target));
    current = applyAction(current, { type: "respond", playerId: target.id, cardId: null });
    const dying = jsonClone(liveDyingPending(current));
    current.nextEventId = Math.max(current.nextEventId, 2);
    current.completeRules.nextEventId = current.nextEventId;
    current.afterMove = {
      queuedTriggers: [],
      suspendedPhase: "respond",
      suspendedResponse: dying,
    };
    current.pendingResponse = {
      type: "skill_choice",
      targetId: actor.id,
      skillId: "lianying",
      resume: { type: "after_move", eventId: 1 },
      promptId: `skill:1:lianying:${actor.id}:0`,
      triggerId: `1:lianying:${actor.id}:0`,
    };

    const continued = forfeitPlayer(current, target.id);

    expect(continued.status).toBe("playing");
    expect(continued.players.find((player) => player.id === target.id)).toMatchObject({ alive: false, hp: 0 });
    expect(continued.pendingResponse).toBeNull();
    expect(continued.afterMove).toEqual({ queuedTriggers: [], suspendedPhase: null, suspendedResponse: null });
    expect(continued.completeRules.damageFlow.frames).toEqual([]);
    expect(continued.completeRules.damageFlow.completedDamageIds).toEqual([1]);
  });

  it("redacts the internal dying cursor from every browser-safe game view", () => {
    const { game, actor, others: [target] } = setup(3);
    target!.hp = 1;
    let current = attachTurnFlowCompletion(startSlash(game, actor, target!));
    current = applyAction(current, { type: "respond", playerId: target!.id, cardId: null });
    liveDyingPending(current);

    for (const viewerId of [null, ...current.players.map((player) => player.id)]) {
      const view = getGameView(current, viewerId);
      expect(view.pendingResponse).toBeNull();
      if (viewerId === liveDyingPending(current).targetId) {
        expect(view.prompt).toMatchObject({ type: "dying", playerId: viewerId, victimId: target!.id });
      }
      expect(JSON.stringify(view)).not.toContain("damage_flow");
      expect(JSON.stringify(view)).not.toContain("game_session.damage_resume.v1");
    }
  });

  it.each(["frameId", "damageId", "dyingId"] as const)(
    "rejects a tampered internal %s atomically",
    (field) => {
      const { game, actor, others: [target] } = setup(3);
      target!.hp = 1;
      target!.hand = [card("tamper-peach", "peach", "heart")];
      let pendingGame = attachTurnFlowCompletion(startSlash(game, actor, target!));
      pendingGame = applyAction(pendingGame, { type: "respond", playerId: target!.id, cardId: null });
      liveDyingPending(pendingGame);

      const tampered = jsonClone(pendingGame);
      const pending = liveDyingPending(tampered);
      (pending.resume as unknown as Record<typeof field, number>)[field] += 1;
      const before = JSON.stringify(tampered);

      expect(() => applyAction(tampered, {
        type: "respond",
        playerId: target!.id,
        cardId: "tamper-peach",
      })).toThrow(/Dying cursor does not match the active root damage barrier/);
      expect(JSON.stringify(tampered)).toBe(before);
      expect(liveDyingPending(tampered).resume[field]).toBe(2);
      expect(tampered.players.find((player) => player.id === target!.id)).toMatchObject({ hp: 0, alive: true });
      expect(tampered.players.find((player) => player.id === target!.id)?.hand.map((entry) => entry.id)).toContain("tamper-peach");
      expect(tampered.completeRules.damageFlow.frames).toHaveLength(1);
      expect(tampered.completeRules.damageFlow.completedDamageIds).toEqual([]);
    },
  );
});
