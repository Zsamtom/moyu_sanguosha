import { describe, expect, it } from "vitest";

import {
  GameRuleError,
  STANDARD_DECK_SIZE,
  applyAction,
  createGame,
  forfeitPlayer,
  getCardDefinition,
  getGameView,
  getGeneralDefinition,
  getRoleDistribution,
  type Card,
  type GamePlayer,
  type GameSession,
  type Role,
} from "../src/index.js";

function seedFor(value: number): string {
  return value.toString(16).padStart(64, "0");
}

function player(session: GameSession, playerId: string): GamePlayer {
  const result = session.players.find((candidate) => candidate.id === playerId);
  if (!result) throw new Error(`Missing test player ${playerId}`);
  return result;
}

function card(id: string, kind: Card["kind"]): Card {
  return { id, kind, ...getCardDefinition(kind), suit: "spade", rank: 1 };
}

function setTurn(session: GameSession, playerId: string): void {
  session.currentPlayerId = playerId;
  session.turn = {
    number: session.turn.number,
    playerId,
    phase: "play",
    slashUsed: false,
    wineUsed: false,
    slashDamageBonus: 0,
    requiredDiscardCount: 0,
    skipDraw: false,
    skipPlay: false,
  };
  session.pendingResponse = null;
}

function declineAllDyingRescues(session: GameSession): GameSession {
  let current = session;
  while (current.pendingResponse?.type === "dying") {
    current = applyAction(current, {
      type: "respond",
      playerId: current.pendingResponse.targetId,
      cardId: null,
    });
  }
  return current;
}

function countRoles(session: GameSession): Record<Role, number> {
  return session.players.reduce<Record<Role, number>>(
    (counts, candidate) => {
      counts[candidate.role] += 1;
      return counts;
    },
    { lord: 0, loyalist: 0, rebel: 0, renegade: 0 },
  );
}

describe("createGame", () => {
  it("assigns the documented identities for every supported player count", () => {
    for (let count = 2; count <= 10; count += 1) {
      const playerIds = Array.from({ length: count }, (_, index) => `p${index + 1}`);
      const created = createGame({ playerIds, seed: seedFor(count) });
      let session = created;
      for (let guard = 0; session.turn.phase !== "play" && guard < 20; guard += 1) {
        const pending = session.pendingResponse;
        if (pending?.type === "skill_choice") {
          session = applyAction(session, {
            type: "resolve_skill",
            playerId: pending.targetId,
            skillId: pending.skillId,
            activate: false,
            ...(pending.promptId ? { promptId: pending.promptId } : {}),
          });
        } else if (pending?.type === "standard_skill") {
          session = applyAction(session, {
            type: "resolve_standard_skill",
            playerId: pending.targetId,
            promptId: pending.promptId,
            activate: false,
          });
        } else {
          throw new Error(`Unexpected opening phase ${session.turn.phase}`);
        }
      }

      expect(countRoles(session)).toEqual(getRoleDistribution(count));
      expect(session.players).toHaveLength(count);
      expect(session.currentPlayerId).toBe(
        session.players.find((candidate) => candidate.role === "lord")?.id,
      );
      expect(session.turn).toMatchObject({
        number: 1,
        playerId: session.currentPlayerId,
        phase: "play",
        slashUsed: false,
      });
      expect(new Set(session.players.map((candidate) => candidate.generalId))).toHaveLength(count);
      expect(session.players.every((candidate) => {
        if (!candidate.generalId) return false;
        return candidate.maxHp === getGeneralDefinition(candidate.generalId).maxHp +
          (candidate.role === "lord" && count > 4 ? 1 : 0);
      })).toBe(true);
      expect(player(session, session.currentPlayerId).hand).toHaveLength(6);
      expect(
        session.players
          .filter((candidate) => candidate.id !== session.currentPlayerId)
          .every((candidate) => candidate.hand.length === 4),
      ).toBe(true);
      expect(session.deck).toHaveLength(STANDARD_DECK_SIZE - count * 4 - 2);
    }
  });

  it("is deterministic with a seed while keeping rooms independent", () => {
    const input = {
      playerIds: ["a", "b", "c", "d", "e"],
      seed: seedFor(20260711),
    };
    const first = createGame(input);
    const second = createGame(input);
    expect(first).toEqual(second);

    const changed = applyAction(first, {
      type: "end_play",
      playerId: first.currentPlayerId,
    });
    expect(changed).not.toBe(first);
    expect(first.turn.phase).toBe("play");
    expect(second).toEqual(first);
  });

  it("rejects unsupported, empty, and duplicate players", () => {
    expect(() => createGame({ playerIds: ["only-one"], seed: seedFor(1) })).toThrow(
      GameRuleError,
    );
    expect(() => createGame({ playerIds: ["a", ""], seed: seedFor(1) })).toThrowError(
      expect.objectContaining({ code: "INVALID_PLAYER_ID" }),
    );
    expect(() => createGame({ playerIds: ["a", "a"], seed: seedFor(1) })).toThrowError(
      expect.objectContaining({ code: "DUPLICATE_PLAYER" }),
    );
    expect(() => createGame({ playerIds: ["a", "b"], seed: "too-short" })).toThrowError(
      expect.objectContaining({ code: "INVALID_SEED" }),
    );
  });
});

describe("cards and attack response", () => {
  it("plays Slash and lets the target answer with Dodge", () => {
    const initial = createGame({ playerIds: ["a", "b"], seed: seedFor(7) });
    const attacker = player(initial, initial.currentPlayerId);
    const target = initial.players.find((candidate) => candidate.id !== attacker.id);
    if (!target) throw new Error("Missing target");
    attacker.hand = [card("test-slash", "slash")];
    target.hand = [card("test-dodge", "dodge")];
    const targetHp = target.hp;

    const attacked = applyAction(initial, {
      type: "play_card",
      playerId: attacker.id,
      cardId: "test-slash",
      targetId: target.id,
    });
    expect(attacked.turn.phase).toBe("respond");
    expect(attacked.pendingResponse).toMatchObject({
      attackerId: attacker.id,
      targetId: target.id,
    });
    expect(player(initial, attacker.id).hand).toHaveLength(1);

    const dodged = applyAction(attacked, {
      type: "respond",
      playerId: target.id,
      cardId: "test-dodge",
    });
    expect(dodged.turn.phase).toBe("play");
    expect(dodged.pendingResponse).toBeNull();
    expect(player(dodged, target.id).hp).toBe(targetHp);
    expect(dodged.discardPile.map((candidate) => candidate.kind)).toEqual([
      "slash",
      "dodge",
    ]);
  });

  it("deals damage when Dodge is declined and stops a second Slash", () => {
    const initial = createGame({ playerIds: ["a", "b", "c"], seed: seedFor(12) });
    const attacker = player(initial, initial.currentPlayerId);
    const target = initial.players.find((candidate) => candidate.id !== attacker.id);
    if (!target) throw new Error("Missing target");
    attacker.hand = [card("slash-1", "slash"), card("slash-2", "slash")];
    const targetHp = target.hp;

    const attacked = applyAction(initial, {
      type: "play_card",
      playerId: attacker.id,
      cardId: "slash-1",
      targetId: target.id,
    });
    const damaged = applyAction(attacked, {
      type: "respond",
      playerId: target.id,
      cardId: null,
    });
    expect(player(damaged, target.id).hp).toBe(targetHp - 1);
    expect(() =>
      applyAction(damaged, {
        type: "play_card",
        playerId: attacker.id,
        cardId: "slash-2",
        targetId: target.id,
      }),
    ).toThrowError(expect.objectContaining({ code: "SLASH_ALREADY_USED" }));
  });

  it("uses Peach only on a wounded self", () => {
    const initial = createGame({ playerIds: ["a", "b"], seed: seedFor(4) });
    const current = player(initial, initial.currentPlayerId);
    current.hp -= 2;
    current.hand = [card("test-peach", "peach")];

    const healed = applyAction(initial, {
      type: "play_card",
      playerId: current.id,
      cardId: "test-peach",
    });
    expect(player(healed, current.id).hp).toBe(current.hp + 1);
    expect(player(healed, current.id).hand).toHaveLength(0);

    current.hp = current.maxHp;
    expect(() =>
      applyAction(initial, {
        type: "play_card",
        playerId: current.id,
        cardId: "test-peach",
      }),
    ).toThrowError(expect.objectContaining({ code: "FULL_HEALTH" }));
  });
});

describe("turns, discarding, and deck recycling", () => {
  it("requires hand size above HP to be discarded before advancing", () => {
    const initial = createGame({ playerIds: ["a", "b", "c"], seed: seedFor(99) });
    setTurn(initial, initial.currentPlayerId);
    const current = player(initial, initial.currentPlayerId);
    const next = initial.players[(current.seat + 1) % initial.players.length];
    if (!next) throw new Error("Missing next player");
    current.hand = Array.from({ length: current.hp + 2 }, (_, index) =>
      card(`held-${index}`, index % 2 === 0 ? "dodge" : "peach"),
    );

    const discarding = applyAction(initial, {
      type: "end_play",
      playerId: current.id,
    });
    expect(discarding.turn.phase).toBe("discard");
    expect(discarding.turn.requiredDiscardCount).toBe(2);
    expect(() =>
      applyAction(discarding, {
        type: "discard",
        playerId: current.id,
        cardIds: ["held-0"],
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_DISCARD" }));

    const advanced = applyAction(discarding, {
      type: "discard",
      playerId: current.id,
      cardIds: ["held-0", "held-1"],
    });
    expect(advanced.currentPlayerId).toBe(next.id);
    expect(advanced.turn).toMatchObject({
      number: 2,
      playerId: next.id,
      phase: "play",
      slashUsed: false,
    });
    expect(player(advanced, current.id).hand).toHaveLength(current.hp);
    expect(player(advanced, next.id).hand).toHaveLength(player(initial, next.id).hand.length + 2);
  });

  it("recycles and shuffles the discard pile when drawing from an empty deck", () => {
    const initial = createGame({ playerIds: ["a", "b"], seed: seedFor(123) });
    const current = player(initial, initial.currentPlayerId);
    current.hand = [];
    initial.deck = [];
    initial.discardPile = [card("recycle-a", "slash"), card("recycle-b", "dodge")];
    const nextId = initial.players.find((candidate) => candidate.id !== current.id)?.id;
    if (!nextId) throw new Error("Missing next player");
    player(initial, nextId).hand = [];

    const advanced = applyAction(initial, {
      type: "end_play",
      playerId: current.id,
    });
    expect(player(advanced, nextId).hand).toHaveLength(2);
    expect(advanced.deck).toHaveLength(0);
    expect(advanced.discardPile).toHaveLength(0);
    expect(advanced.logs.some((entry) => entry.message.includes("重新洗牌"))).toBe(true);
  });
});

describe("death and identity victory", () => {
  it("lets a dying player save themselves with Wine before death is decided", () => {
    const initial = createGame({ playerIds: ["lord", "rebel"], seed: seedFor(71) });
    const attacker = initial.players.find((candidate) => candidate.role === "lord");
    const victim = initial.players.find((candidate) => candidate.role === "rebel");
    if (!attacker || !victim) throw new Error("Missing roles");
    setTurn(initial, attacker.id);
    attacker.hand = [card("rescue-test-slash", "slash")];
    victim.hand = [card("self-rescue-wine", "wine")];
    victim.hp = 1;

    const attacked = applyAction(initial, {
      type: "play_card",
      playerId: attacker.id,
      cardId: "rescue-test-slash",
      targetId: victim.id,
    });
    const dying = applyAction(attacked, {
      type: "respond",
      playerId: victim.id,
      cardId: null,
    });
    expect(dying.pendingResponse).toMatchObject({
      type: "dying",
      victimId: victim.id,
      targetId: victim.id,
    });
    expect(getGameView(dying, victim.id).prompt).toMatchObject({
      type: "dying",
      wineCardIds: ["self-rescue-wine"],
      allowedCardIds: ["self-rescue-wine"],
    });

    const saved = applyAction(dying, {
      type: "respond",
      playerId: victim.id,
      cardId: "self-rescue-wine",
    });
    expect(player(saved, victim.id)).toMatchObject({ alive: true, hp: 1 });
    expect(saved).toMatchObject({ status: "playing", pendingResponse: null });
    expect(saved.resolvingCards).toEqual([]);
  });

  it("asks living players in seat order to provide Peach for a dying player", () => {
    const initial = createGame({ playerIds: ["a", "b", "c"], seed: seedFor(72) });
    const attacker = player(initial, initial.currentPlayerId);
    const victim = initial.players[(attacker.seat + 1) % initial.players.length];
    if (!victim) throw new Error("Missing victim");
    setTurn(initial, attacker.id);
    for (const participant of initial.players) participant.generalId = "gan_ning";
    attacker.hand = [card("rescue-order-slash", "slash")];
    victim.hand = [];
    victim.hp = 1;

    const attacked = applyAction(initial, {
      type: "play_card",
      playerId: attacker.id,
      cardId: "rescue-order-slash",
      targetId: victim.id,
    });
    const dying = applyAction(attacked, {
      type: "respond",
      playerId: victim.id,
      cardId: null,
    });
    if (dying.pendingResponse?.type !== "dying") throw new Error("Missing dying prompt");
    const victimPassed = applyAction(dying, {
      type: "respond",
      playerId: victim.id,
      cardId: null,
    });
    if (victimPassed.pendingResponse?.type !== "dying") throw new Error("Missing rescuer prompt");
    const rescuer = player(victimPassed, victimPassed.pendingResponse.targetId);
    rescuer.hand = [card("rescue-peach", "peach")];
    const saved = applyAction(victimPassed, {
      type: "respond",
      playerId: rescuer.id,
      cardId: "rescue-peach",
    });
    expect(player(saved, victim.id)).toMatchObject({ alive: true, hp: 1 });
    expect(saved.pendingResponse).toBeNull();
  });

  it("awards the lord side when the final Rebel dies", () => {
    const initial = createGame({ playerIds: ["lord", "rebel"], seed: seedFor(8) });
    const lord = initial.players.find((candidate) => candidate.role === "lord");
    const rebel = initial.players.find((candidate) => candidate.role === "rebel");
    if (!lord || !rebel) throw new Error("Missing roles");
    setTurn(initial, lord.id);
    lord.hand = [card("finisher", "slash")];
    rebel.hand = [];
    rebel.hp = 1;

    const attacked = applyAction(initial, {
      type: "play_card",
      playerId: lord.id,
      cardId: "finisher",
      targetId: rebel.id,
    });
    const dying = applyAction(attacked, {
      type: "respond",
      playerId: rebel.id,
      cardId: null,
    });
    const finished = declineAllDyingRescues(dying);
    expect(finished.status).toBe("finished");
    expect(finished.winner).toEqual({ side: "lord", playerIds: [lord.id] });
    expect(player(finished, rebel.id)).toMatchObject({ alive: false, hp: 0 });
    expect(finished.logs.at(-1)?.type).toBe("victory");
  });

  it("awards Rebels when the lord dies while another camp remains", () => {
    const initial = createGame({
      playerIds: ["a", "b", "c", "d", "e"],
      seed: seedFor(18),
    });
    const lord = initial.players.find((candidate) => candidate.role === "lord");
    const rebel = initial.players.find((candidate) => candidate.role === "rebel");
    if (!lord || !rebel) throw new Error("Missing roles");
    setTurn(initial, rebel.id);
    rebel.hand = [card("rebel-slash", "slash")];
    lord.hand = [];
    lord.hp = 1;

    const attacked = applyAction(initial, {
      type: "play_card",
      playerId: rebel.id,
      cardId: "rebel-slash",
      targetId: lord.id,
    });
    const dying = applyAction(attacked, {
      type: "respond",
      playerId: lord.id,
      cardId: null,
    });
    const finished = declineAllDyingRescues(dying);
    expect(finished.winner?.side).toBe("rebel");
    expect(finished.winner?.playerIds.sort()).toEqual(
      initial.players
        .filter((candidate) => candidate.role === "rebel")
        .map((candidate) => candidate.id)
        .sort(),
    );
  });

  it("awards the Renegade only when they are the sole survivor after killing the lord", () => {
    const initial = createGame({
      playerIds: ["a", "b", "c", "d", "e"],
      seed: seedFor(25),
    });
    const lord = initial.players.find((candidate) => candidate.role === "lord");
    const renegade = initial.players.find((candidate) => candidate.role === "renegade");
    if (!lord || !renegade) throw new Error("Missing roles");
    for (const candidate of initial.players) {
      candidate.alive = candidate.id === lord.id || candidate.id === renegade.id;
      if (!candidate.alive) {
        candidate.hp = 0;
        candidate.hand = [];
      }
    }
    setTurn(initial, renegade.id);
    renegade.hand = [card("renegade-slash", "slash")];
    lord.hand = [];
    lord.hp = 1;

    const attacked = applyAction(initial, {
      type: "play_card",
      playerId: renegade.id,
      cardId: "renegade-slash",
      targetId: lord.id,
    });
    const dying = applyAction(attacked, {
      type: "respond",
      playerId: lord.id,
      cardId: null,
    });
    const finished = declineAllDyingRescues(dying);
    expect(finished.winner).toEqual({ side: "renegade", playerIds: [renegade.id] });
  });
});

describe("forfeiture", () => {
  it("marks the leaver dead and applies ordinary identity victory when possible", () => {
    const initial = createGame({ playerIds: ["a", "b"], seed: seedFor(501) });
    const rebel = initial.players.find((candidate) => candidate.role === "rebel");
    const lord = initial.players.find((candidate) => candidate.role === "lord");
    if (!rebel || !lord) throw new Error("Missing roles");
    const originalHandCount = rebel.hand.length;

    const finished = forfeitPlayer(initial, rebel.id);

    expect(initial.status).toBe("playing");
    expect(player(initial, rebel.id).hand).toHaveLength(originalHandCount);
    expect(player(finished, rebel.id)).toMatchObject({ alive: false, hp: 0, hand: [] });
    expect(finished.winner).toEqual({ side: "lord", playerIds: [lord.id] });
    expect(finished.status).toBe("finished");
    expect(finished.pendingResponse).toBeNull();
    expect(getGameView(finished, lord.id).prompt).toMatchObject({ type: "finished" });
  });

  it("keeps an unfinished identity game running when a Loyalist leaves", () => {
    const initial = createGame({
      playerIds: ["a", "b", "c", "d", "e"],
      seed: seedFor(502),
    });
    const loyalist = initial.players.find((candidate) => candidate.role === "loyalist");
    const lord = initial.players.find((candidate) => candidate.role === "lord");
    if (!loyalist || !lord) throw new Error("Missing required roles");

    const continued = forfeitPlayer(initial, loyalist.id);

    expect(continued.status).toBe("playing");
    expect(continued.winner).toBeNull();
    expect(continued.currentPlayerId).toBe(lord.id);
    expect(continued.pendingResponse).toBeNull();
    const view = getGameView(continued, lord.id);
    expect(view.prompt).toMatchObject({ type: "play", playerId: lord.id });
    expect(view.players.find((candidate) => candidate.id === loyalist.id)).toMatchObject({
      alive: false,
      hp: 0,
      handCount: 0,
      role: "loyalist",
    });
  });

  it("advances to the next living seat when the current player leaves", () => {
    const initial = createGame({
      playerIds: ["a", "b", "c", "d", "e"],
      seed: seedFor(503),
    });
    const loyalist = initial.players.find((candidate) => candidate.role === "loyalist");
    if (!loyalist) throw new Error("Missing Loyalist");
    setTurn(initial, loyalist.id);
    const loyalistIndex = initial.players.findIndex((candidate) => candidate.id === loyalist.id);
    const expectedNext = Array.from({ length: initial.players.length - 1 }, (_, offset) =>
      initial.players[(loyalistIndex + offset + 1) % initial.players.length]!,
    ).find((candidate) => candidate.alive);
    if (!expectedNext) throw new Error("Missing next player");

    const continued = forfeitPlayer(initial, loyalist.id);

    expect(continued.status).toBe("playing");
    expect(continued.currentPlayerId).toBe(expectedNext.id);
    expect(continued.turn).toMatchObject({
      number: initial.turn.number + 1,
      playerId: expectedNext.id,
      phase: "play",
    });
    expect(getGameView(continued, expectedNext.id).prompt).toMatchObject({
      type: "play",
      playerId: expectedNext.id,
    });
  });

  it("cancels an in-flight response instead of leaving a dead prompt", () => {
    const initial = createGame({
      playerIds: ["a", "b", "c", "d", "e"],
      seed: seedFor(504),
    });
    const lord = initial.players.find((candidate) => candidate.role === "lord");
    const loyalist = initial.players.find((candidate) => candidate.role === "loyalist");
    if (!lord || !loyalist) throw new Error("Missing required roles");
    setTurn(initial, lord.id);
    const resolvingSlash = card("departed-target-slash", "slash");
    for (const candidate of initial.players) candidate.generalId = "gan_ning";
    lord.hand = [resolvingSlash];
    lord.equipment.weapon = card("forfeit-range-weapon", "qing_long_yan_yue_dao");
    const resolving = applyAction(initial, {
      type: "play_card",
      playerId: lord.id,
      cardId: resolvingSlash.id,
      targetId: loyalist.id,
    });

    const continued = forfeitPlayer(resolving, loyalist.id);

    expect(continued.status).toBe("playing");
    expect(continued.currentPlayerId).toBe(lord.id);
    expect(continued.turn.phase).toBe("play");
    expect(continued.pendingResponse).toBeNull();
    expect(continued.resolvingCards).toEqual([]);
    expect(continued.discardPile).toContainEqual(resolvingSlash);
    expect(continued.logs.some((entry) => entry.message.includes("牌结算已取消"))).toBe(true);
  });

  it.each([
    ["declines", false],
    ["answers", true],
  ] as const)("finishes a mass attack when its departed source %s no longer acts", (_label, answers) => {
    const initial = createGame({
      playerIds: ["a", "b", "c", "d", "e"],
      seed: seedFor(505),
    });
    const rebels = initial.players.filter((candidate) => candidate.role === "rebel");
    const victim = rebels.find((candidate) =>
      initial.players[(candidate.seat + initial.players.length - 1) % initial.players.length]?.role !== "lord");
    const source = victim
      ? initial.players[(victim.seat + initial.players.length - 1) % initial.players.length]
      : undefined;
    if (!source || !victim) throw new Error("Missing mass-attack roles");
    setTurn(initial, source.id);
    for (const candidate of initial.players) {
      candidate.generalId = "gan_ning";
      candidate.hand = candidate.id === source.id
        ? [card("departed-source-mass-attack", "barbarian_invasion")]
        : answers && candidate.id !== victim.id ? [card(`mass-answer-${candidate.id}`, "slash")] : [];
      candidate.hp = candidate.id === victim.id ? 1 : candidate.maxHp;
    }
    const sourceIndex = initial.players.findIndex((candidate) => candidate.id === source.id);

    const started = applyAction(initial, {
      type: "play_card",
      playerId: source.id,
      cardId: "departed-source-mass-attack",
    });
    if (started.pendingResponse?.type !== "mass_attack" || started.pendingResponse.targetId !== victim.id) {
      throw new Error("Mass attack did not start at the chosen victim");
    }
    const dying = applyAction(started, {
      type: "respond",
      playerId: victim.id,
      cardId: null,
    });
    const departed = forfeitPlayer(dying, source.id);
    let resolved = declineAllDyingRescues(departed);
    while (resolved.pendingResponse?.type === "mass_attack") {
      const targetId = resolved.pendingResponse.targetId;
      resolved = applyAction(resolved, {
        type: "respond",
        playerId: targetId,
        cardId: answers ? `mass-answer-${targetId}` : null,
      });
      resolved = declineAllDyingRescues(resolved);
    }
    const expectedNext = Array.from({ length: resolved.players.length - 1 }, (_, offset) =>
      resolved.players[(sourceIndex + offset + 1) % resolved.players.length]!,
    ).find((candidate) => candidate.alive);
    if (!expectedNext) throw new Error("Missing next living player");

    expect(resolved).toMatchObject({
      status: "playing",
      currentPlayerId: expectedNext.id,
      turn: { playerId: expectedNext.id, phase: "play" },
      pendingResponse: null,
    });
    expect(player(resolved, source.id).alive).toBe(false);
    expect(getGameView(resolved, expectedNext.id).prompt).toMatchObject({
      type: "play",
      playerId: expectedNext.id,
    });
  });
});

describe("viewer-specific projections", () => {
  it("reveals only the viewer hand and public/self/dead identities", () => {
    const session = createGame({
      playerIds: ["a", "b", "c", "d", "e"],
      seed: seedFor(42),
    });
    const viewer = session.players.find((candidate) => candidate.role !== "lord");
    const hidden = session.players.find(
      (candidate) => candidate.role !== "lord" && candidate.id !== viewer?.id,
    );
    const lord = session.players.find((candidate) => candidate.role === "lord");
    if (!viewer || !hidden || !lord) throw new Error("Missing test players");

    const view = getGameView(session, viewer.id);
    expect(view.players.find((candidate) => candidate.id === viewer.id)?.hand).toEqual(
      viewer.hand,
    );
    expect(view.players.find((candidate) => candidate.id === viewer.id)?.role).toBe(
      viewer.role,
    );
    expect(view.players.find((candidate) => candidate.id === hidden.id)).toMatchObject({
      hand: null,
      handCount: hidden.hand.length,
      role: null,
    });
    expect(view.players.find((candidate) => candidate.id === lord.id)?.role).toBe("lord");

    hidden.alive = false;
    hidden.hp = 0;
    hidden.hand = [];
    const spectatorView = getGameView(session, null);
    expect(spectatorView.players.find((candidate) => candidate.id === hidden.id)?.role).toBe(
      hidden.role,
    );
    expect(spectatorView.players.every((candidate) => candidate.hand === null)).toBe(true);
    expect(spectatorView.logs).toEqual(session.logs);
    expect(spectatorView.logs).not.toBe(session.logs);
  });

  it("provides an actionable prompt only to the player who must act", () => {
    const session = createGame({ playerIds: ["a", "b"], seed: seedFor(77) });
    const current = player(session, session.currentPlayerId);
    const waiting = session.players.find((candidate) => candidate.id !== current.id);
    if (!waiting) throw new Error("Missing waiting player");
    current.hand = [card("prompt-slash", "slash"), card("prompt-dodge", "dodge")];

    expect(getGameView(session, current.id).prompt).toEqual({
      type: "play",
      playerId: current.id,
      cards: [{
        cardId: "prompt-slash",
        kind: "slash",
        targetMode: "single-other",
        targetIds: [waiting.id],
      }],
      skills: [],
    });
    expect(getGameView(session, waiting.id).prompt).toEqual({ type: "waiting" });

    const attacked = applyAction(session, {
      type: "play_card",
      playerId: current.id,
      cardId: "prompt-slash",
      targetId: waiting.id,
    });
    waiting.hand = [card("waiting-dodge", "dodge")];
    player(attacked, waiting.id).hand = [card("waiting-dodge", "dodge")];
    expect(getGameView(attacked, waiting.id).prompt).toMatchObject({
      type: "respond",
      playerId: waiting.id,
      targetId: waiting.id,
      context: "slash",
      responseKind: "dodge",
      allowedCardIds: ["waiting-dodge"],
      dodgeCardIds: ["waiting-dodge"],
      slashCardIds: [],
      canPass: true,
    });
    expect(getGameView(attacked, current.id).prompt).toEqual({ type: "waiting" });
  });
});
