import { describe, expect, it } from "vitest";

import {
  GameRuleError,
  STANDARD_DECK_SIZE,
  applyAction,
  assertRestorableDuelResponse,
  assertRestorableMassAttackResponse,
  assertRestorableNullificationResponse,
  assertRestorableSlashResponse,
  createGame,
  createStandardDeck,
  distanceBetweenPlayers,
  getCardDefinition,
  getGameView,
  type Card,
  type CardKind,
  type GamePlayer,
  type GameSession,
  type PendingMassAttackResponse,
  type TurnState,
} from "../src/index.js";

function seedFor(value: number): string {
  return value.toString(16).padStart(64, "0");
}

function card(id: string, kind: CardKind): Card {
  return {
    id,
    kind,
    ...getCardDefinition(kind),
    suit: "spade",
    rank: 1,
  };
}

function player(session: GameSession, playerId: string): GamePlayer {
  const found = session.players.find((candidate) => candidate.id === playerId);
  if (!found) throw new Error(`Missing test player ${playerId}`);
  return found;
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
    luoyiActive: false,
    slashRespondedInPlayPhase: false,
  };
  session.pendingResponse = null;
}

/** Keep card-only fixtures independent from randomly dealt general triggers. */
function neutralizeGeneralSkills(session: GameSession): void {
  for (const candidate of session.players) candidate.generalId = "gan_ning";
}

function orderedOpponents(session: GameSession, sourceId: string): GamePlayer[] {
  const sourceIndex = session.players.findIndex((candidate) => candidate.id === sourceId);
  if (sourceIndex < 0) throw new Error("Missing source");
  const result: GamePlayer[] = [];
  for (let offset = 1; offset < session.players.length; offset += 1) {
    const candidate = session.players[(sourceIndex + offset) % session.players.length];
    if (candidate?.alive) result.push(candidate);
  }
  return result;
}

function expectRuleError(run: () => unknown, code: string): void {
  expect(run).toThrowError(expect.objectContaining({ code }));
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

describe("standard deck metadata", () => {
  it("preserves the selected CardsHeap distribution with unique JSON-safe cards", () => {
    const deck = createStandardDeck();
    expect(deck).toHaveLength(STANDARD_DECK_SIZE);
    expect(new Set(deck.map((candidate) => candidate.id))).toHaveLength(STANDARD_DECK_SIZE);

    const counts = Object.fromEntries(
      [...new Set(deck.map((candidate) => candidate.kind))].map((kind) => [
        kind,
        deck.filter((candidate) => candidate.kind === kind).length,
      ]),
    );
    expect(counts).toEqual({
      slash: 30,
      dodge: 24,
      peach: 12,
      wine: 5,
      thunder_slash: 9,
      fire_slash: 5,
      ex_nihilo: 4,
      barbarian_invasion: 3,
      arrow_barrage: 1,
      duel: 3,
      peach_garden: 1,
      zhua_huang_fei_dian: 1,
      jue_ying: 1,
      di_lu: 1,
      chi_tu: 1,
      zi_xing: 1,
      da_wan: 1,
      hua_liu: 1,
      zhu_ge_lian_nu: 2,
      gu_ding_dao: 1,
      ci_xiong_shuang_gu_jian: 1,
      han_bing_jian: 1,
      qing_long_yan_yue_dao: 1,
      zhang_ba_she_mao: 1,
      guan_shi_fu: 1,
      fang_tian_hua_ji: 1,
      zhu_que_yu_shan: 1,
      qi_lin_gong: 1,
      ren_wang_dun: 1,
      teng_jia: 2,
      bai_yin_shi_zi: 1,
      ba_gua_zhen: 2,
      qing_gang_jian: 1,
      le_bu_si_shu: 3,
      bing_liang_cun_duan: 2,
      shan_dian: 2,
      wu_xie_ke_ji: 7,
      guo_he_chai_qiao: 6,
      shun_shou_qian_yang: 5,
      fire_attack: 3,
      amazing_grace: 2,
      borrowed_sword: 2,
      iron_chain: 6,
    });
    expect(
      deck
        .filter((candidate) => candidate.kind === "barbarian_invasion")
        .map(({ suit, rank }) => ({ suit, rank })),
    ).toEqual([
      { suit: "spade", rank: 7 },
      { suit: "spade", rank: 13 },
      { suit: "club", rank: 7 },
    ]);
    expect(
      deck.filter((candidate) => candidate.kind === "wu_xie_ke_ji").map(({ suit, rank }) => ({ suit, rank })),
    ).toEqual([
      { suit: "spade", rank: 11 },
      { suit: "spade", rank: 13 },
      { suit: "club", rank: 12 },
      { suit: "club", rank: 13 },
      { suit: "diamond", rank: 12 },
      { suit: "heart", rank: 1 },
      { suit: "heart", rank: 13 },
    ]);
    expect(deck.every((candidate) => candidate.name.length > 0)).toBe(true);
    expect(deck.every((candidate) => candidate.rank >= 1 && candidate.rank <= 13)).toBe(true);
    expect(JSON.parse(JSON.stringify(deck))).toEqual(deck);
  });

  it("uses the complete supported deck independently in each seeded game", () => {
    const session = createGame({ playerIds: ["a", "b", "c", "d"], seed: seedFor(901) });
    const allCards = [
      ...session.deck,
      ...session.discardPile,
      ...session.players.flatMap((candidate) => candidate.hand),
    ];
    expect(allCards).toHaveLength(STANDARD_DECK_SIZE);
    expect(new Set(allCards.map((candidate) => candidate.id))).toHaveLength(
      STANDARD_DECK_SIZE,
    );
    expect(JSON.parse(JSON.stringify(session))).toEqual(session);
  });
});

describe("elemental Slash, Wine, and immediate cards", () => {
  it("uses Wine once, consumes its bonus on a Fire Slash, and deals two fire damage", () => {
    const initial = createGame({ playerIds: ["a", "b", "c"], seed: seedFor(902) });
    const actor = player(initial, initial.currentPlayerId);
    const target = orderedOpponents(initial, actor.id)[0];
    if (!target) throw new Error("Missing target");
    initial.players.forEach((candidate) => { candidate.hand = []; });
    actor.hand = [
      card("wine-1", "wine"),
      card("wine-2", "wine"),
      card("fire-1", "fire_slash"),
    ];
    target.hand = [];
    const startingHp = target.hp;

    const drank = applyAction(initial, {
      type: "play_card",
      playerId: actor.id,
      cardId: "wine-1",
    });
    expect(initial.turn).toMatchObject({ wineUsed: false, slashDamageBonus: 0 });
    expect(drank.turn).toMatchObject({ wineUsed: true, slashDamageBonus: 1 });
    expectRuleError(
      () =>
        applyAction(drank, {
          type: "play_card",
          playerId: actor.id,
          cardId: "wine-2",
        }),
      "WINE_ALREADY_USED",
    );

    const attacked = applyAction(drank, {
      type: "play_card",
      playerId: actor.id,
      cardId: "fire-1",
      targetId: target.id,
    });
    expect(attacked.pendingResponse).toMatchObject({
      type: "slash",
      slashKind: "fire_slash",
      nature: "fire",
      damage: 2,
    });
    expect(attacked.turn.slashDamageBonus).toBe(0);

    const damaged = applyAction(attacked, {
      type: "respond",
      playerId: target.id,
      cardId: null,
    });
    expect(player(damaged, target.id).hp).toBe(startingHp - 2);
    expect(damaged.logs.at(-1)?.message).toContain("2 点火焰伤害");
  });

  it("lets Dodge answer Thunder Slash and exposes its response contract", () => {
    const initial = createGame({ playerIds: ["a", "b"], seed: seedFor(903) });
    neutralizeGeneralSkills(initial);
    const actor = player(initial, initial.currentPlayerId);
    const target = orderedOpponents(initial, actor.id)[0];
    if (!target) throw new Error("Missing target");
    setTurn(initial, actor.id);
    actor.hand = [card("thunder-1", "thunder_slash")];
    target.hand = [card("dodge-1", "dodge")];

    const attacked = applyAction(initial, {
      type: "play_card",
      playerId: actor.id,
      cardId: "thunder-1",
      targetId: target.id,
    });
    if (attacked.pendingResponse?.type !== "slash") throw new Error("Missing Slash response");
    assertRestorableSlashResponse(attacked, attacked.pendingResponse);
    const forged = JSON.parse(JSON.stringify(attacked)) as GameSession;
    if (forged.pendingResponse?.type !== "slash") throw new Error("Missing forged Slash response");
    forged.pendingResponse = { ...forged.pendingResponse, armorAttempted: true };
    expect(() => assertRestorableSlashResponse(forged, forged.pendingResponse as typeof attacked.pendingResponse)).toThrow(/游标/);
    expect(getGameView(attacked, target.id).prompt).toMatchObject({
      type: "respond",
      targetId: target.id,
      context: "slash",
      responseKind: "dodge",
      allowedCardIds: ["dodge-1"],
      dodgeCardIds: ["dodge-1"],
      slashCardIds: [],
    });
    const dodged = applyAction(attacked, {
      type: "respond",
      playerId: target.id,
      cardId: "dodge-1",
    });
    expect(dodged.pendingResponse).toBeNull();
    expect(dodged.completeRules.lifecycle.effects.some((effect) => effect.kind === "slash_response_progress")).toBe(false);
    expect(dodged.turn.phase).toBe("play");
  });

  it("draws two for Ex Nihilo without accepting a forged target", () => {
    const initial = createGame({ playerIds: ["a", "b"], seed: seedFor(904) });
    const actor = player(initial, initial.currentPlayerId);
    const other = orderedOpponents(initial, actor.id)[0];
    if (!other) throw new Error("Missing target");
    other.hand = [];
    actor.hand = [card("draw-two", "ex_nihilo")];
    initial.deck = [card("drawn-1", "peach"), card("drawn-2", "dodge")];
    initial.discardPile = [];

    expectRuleError(
      () =>
        applyAction(initial, {
          type: "play_card",
          playerId: actor.id,
          cardId: "draw-two",
          targetId: other.id,
        }),
      "INVALID_TARGET",
    );
    const resolved = applyAction(initial, {
      type: "play_card",
      playerId: actor.id,
      cardId: "draw-two",
    });
    expect(player(resolved, actor.id).hand.map((candidate) => candidate.id)).toEqual([
      "drawn-2",
      "drawn-1",
    ]);
    expect(resolved.discardPile.map((candidate) => candidate.id)).toEqual(["draw-two"]);
  });

  it("does not recycle the resolving Ex Nihilo into its own draw", () => {
    const initial = createGame({ playerIds: ["a", "b"], seed: seedFor(9041) });
    const actor = player(initial, initial.currentPlayerId);
    actor.hand = [card("draw-two", "ex_nihilo")];
    initial.deck = [];
    initial.discardPile = [card("old-discard", "dodge")];

    const resolved = applyAction(initial, {
      type: "play_card",
      playerId: actor.id,
      cardId: "draw-two",
    });
    expect(player(resolved, actor.id).hand.map((candidate) => candidate.id)).toEqual([
      "old-discard",
    ]);
    expect(resolved.discardPile.map((candidate) => candidate.id)).toEqual(["draw-two"]);
  });

  it("heals every wounded living player once with Peach Garden in seat order", () => {
    const initial = createGame({
      playerIds: ["a", "b", "c", "d", "e"],
      seed: seedFor(905),
    });
    const actor = player(initial, initial.currentPlayerId);
    // This fixture verifies Peach Garden itself; keep it independent from a
    // random Lu Xun drawing through Lianying after spending the last hand card.
    actor.generalId = "liu_bei";
    initial.players.forEach((candidate) => { candidate.hand = []; });
    actor.hand = [card("garden", "peach_garden")];
    const living = initial.players.filter((candidate) => candidate.alive);
    living.forEach((candidate, index) => {
      candidate.hp = index === 0 ? candidate.maxHp : candidate.maxHp - 1;
    });
    const dead = initial.players.find((candidate) => candidate.id !== actor.id);
    if (!dead) throw new Error("Missing dead fixture");
    dead.alive = false;
    dead.hp = 0;

    const resolved = applyAction(initial, {
      type: "play_card",
      playerId: actor.id,
      cardId: "garden",
    });
    for (const before of initial.players) {
      const after = player(resolved, before.id);
      if (!before.alive) {
        expect(after.hp).toBe(0);
      } else {
        expect(after.hp).toBe(Math.min(before.maxHp, before.hp + 1));
      }
    }
    const healingLogs = resolved.logs.filter((entry) => entry.message.includes("因桃园结义回复"));
    expect(healingLogs.map((entry) => entry.message.split(" ")[0])).toEqual(
      [actor, ...orderedOpponents(initial, actor.id)]
        .filter((candidate) => candidate.alive && candidate.hp < candidate.maxHp)
        .map((candidate) => candidate.id),
    );
    expect(resolved.turn.phase).toBe("play");
  });
});

describe("chained responses", () => {
  it("alternates Slash responses during Duel until one side passes", () => {
    const initial = createGame({ playerIds: ["a", "b", "c"], seed: seedFor(906) });
    setTurn(initial, initial.currentPlayerId);
    const actor = player(initial, initial.currentPlayerId);
    const target = orderedOpponents(initial, actor.id)[0];
    if (!target) throw new Error("Missing target");
    initial.players.forEach((candidate) => { candidate.hand = []; });
    actor.hand = [card("duel", "duel"), card("actor-fire", "fire_slash")];
    target.hand = [card("target-slash", "slash"), card("wrong-dodge", "dodge")];
    const targetHp = target.hp;

    const challenged = applyAction(initial, {
      type: "play_card",
      playerId: actor.id,
      cardId: "duel",
      targetId: target.id,
    });
    expect(challenged.pendingResponse).toMatchObject({
      type: "duel",
      attackerId: actor.id,
      targetId: target.id,
      initiatorId: actor.id,
      originalTargetId: target.id,
    });
    if (challenged.pendingResponse?.type !== "duel") throw new Error("Missing Duel response");
    assertRestorableDuelResponse(challenged, challenged.pendingResponse);
    const forged = JSON.parse(JSON.stringify(challenged)) as GameSession;
    if (forged.pendingResponse?.type !== "duel") throw new Error("Missing forged Duel response");
    forged.pendingResponse = { ...forged.pendingResponse, declinedLordSkillIds: ["jijiang"] };
    expect(() => assertRestorableDuelResponse(forged, forged.pendingResponse as typeof challenged.pendingResponse)).toThrow(/游标/);
    expect(getGameView(challenged, target.id).prompt).toMatchObject({
      type: "respond",
      context: "duel",
      responseKind: "slash",
      allowedCardIds: ["target-slash"],
    });
    expectRuleError(
      () =>
        applyAction(challenged, {
          type: "respond",
          playerId: target.id,
          cardId: "wrong-dodge",
        }),
      "INVALID_RESPONSE",
    );
    expect(player(challenged, target.id).hand).toHaveLength(2);

    const returned = applyAction(challenged, {
      type: "respond",
      playerId: target.id,
      cardId: "target-slash",
    });
    expect(returned.pendingResponse).toMatchObject({
      type: "duel",
      attackerId: target.id,
      targetId: actor.id,
    });
    if (returned.pendingResponse?.type !== "duel") throw new Error("Missing returned Duel response");
    assertRestorableDuelResponse(returned, returned.pendingResponse);
    const countered = applyAction(returned, {
      type: "respond",
      playerId: actor.id,
      cardId: "actor-fire",
    });
    expect(countered.pendingResponse).toMatchObject({
      type: "duel",
      attackerId: actor.id,
      targetId: target.id,
    });
    const resolved = applyAction(countered, {
      type: "respond",
      playerId: target.id,
      cardId: null,
    });
    expect(player(resolved, target.id).hp).toBe(targetHp - 1);
    expect(resolved.pendingResponse).toBeNull();
    expect(resolved.completeRules.lifecycle.effects.some((effect) => effect.kind === "duel_response_progress")).toBe(false);
    expect(resolved.turn.phase).toBe("play");
    expect(resolved.discardPile.map((candidate) => candidate.kind)).toEqual([
      "duel",
      "slash",
      "fire_slash",
    ]);
  });

  it("resolves Barbarian Invasion one seat at a time with Slash-family cards", () => {
    const initial = createGame({
      playerIds: ["a", "b", "c", "d"],
      seed: seedFor(907),
    });
    const actor = player(initial, initial.currentPlayerId);
    const targets = orderedOpponents(initial, actor.id);
    const [first, second, third] = targets;
    if (!first || !second || !third) throw new Error("Missing targets");
    actor.hand = [card("barbarians", "barbarian_invasion")];
    first.hand = [card("first-fire", "fire_slash")];
    second.hand = [card("second-dodge", "dodge")];
    third.hand = [card("third-thunder", "thunder_slash")];
    const secondHp = second.hp;

    const started = applyAction(initial, {
      type: "play_card",
      playerId: actor.id,
      cardId: "barbarians",
    });
    if (started.pendingResponse?.type !== "mass_attack") throw new Error("Missing mass-attack response");
    assertRestorableMassAttackResponse(started, started.pendingResponse);
    const commitment = started.completeRules.lifecycle.effects.find((effect) => effect.kind === "mass_attack_commitment");
    expect(JSON.parse(String(commitment?.payload.commitment))).toMatchObject({
      huoshouSourceId: null,
      initialTargetIds: [first.id, second.id, third.id],
    });
    const forged = JSON.parse(JSON.stringify(started)) as GameSession;
    if (forged.pendingResponse?.type !== "mass_attack") throw new Error("Missing forged mass-attack response");
    forged.pendingResponse = { ...forged.pendingResponse, armorAttempted: true };
    expect(() => assertRestorableMassAttackResponse(forged, forged.pendingResponse as PendingMassAttackResponse)).toThrow(/游标/);
    expect(started.pendingResponse).toEqual({
      type: "mass_attack",
      attackerId: actor.id,
      targetId: first.id,
      cardId: "barbarians",
      cardKind: "barbarian_invasion",
      responseKind: "slash",
      effectiveSuit: "spade",
      remainingTargetIds: [second.id, third.id],
    });
    expectRuleError(
      () =>
        applyAction(started, {
          type: "respond",
          playerId: second.id,
          cardId: null,
        }),
      "INVALID_RESPONSE",
    );
    const firstDone = applyAction(started, {
      type: "respond",
      playerId: first.id,
      cardId: "first-fire",
    });
    expect(firstDone.pendingResponse).toMatchObject({
      targetId: second.id,
      remainingTargetIds: [third.id],
    });
    if (firstDone.pendingResponse?.type !== "mass_attack") throw new Error("Missing advanced mass attack");
    assertRestorableMassAttackResponse(firstDone, firstDone.pendingResponse);
    expectRuleError(
      () =>
        applyAction(firstDone, {
          type: "respond",
          playerId: second.id,
          cardId: "second-dodge",
        }),
      "INVALID_RESPONSE",
    );
    const secondDone = applyAction(firstDone, {
      type: "respond",
      playerId: second.id,
      cardId: null,
    });
    expect(player(secondDone, second.id).hp).toBe(secondHp - 1);
    expect(secondDone.pendingResponse).toMatchObject({
      targetId: third.id,
      remainingTargetIds: [],
    });
    const resolved = applyAction(secondDone, {
      type: "respond",
      playerId: third.id,
      cardId: "third-thunder",
    });
    expect(resolved.pendingResponse).toBeNull();
    expect(resolved.completeRules.lifecycle.effects.some((effect) => effect.kind === "mass_attack_commitment")).toBe(false);
    expect(resolved.turn.phase).toBe("play");
  });

  it("resolves Arrow Barrage one seat at a time and requests Dodge", () => {
    const initial = createGame({ playerIds: ["a", "b", "c"], seed: seedFor(908) });
    const actor = player(initial, initial.currentPlayerId);
    const [first, second] = orderedOpponents(initial, actor.id);
    if (!first || !second) throw new Error("Missing targets");
    actor.hand = [card("arrows", "arrow_barrage")];
    first.hand = [card("first-dodge", "dodge")];
    second.hand = [card("wrong-slash", "slash")];
    const secondHp = second.hp;

    const started = applyAction(initial, {
      type: "play_card",
      playerId: actor.id,
      cardId: "arrows",
    });
    expect(getGameView(started, first.id).prompt).toMatchObject({
      type: "respond",
      context: "arrow_barrage",
      responseKind: "dodge",
      allowedCardIds: ["first-dodge"],
    });
    const firstDone = applyAction(started, {
      type: "respond",
      playerId: first.id,
      cardId: "first-dodge",
    });
    expect(firstDone.pendingResponse).toMatchObject({ targetId: second.id });
    expectRuleError(
      () =>
        applyAction(firstDone, {
          type: "respond",
          playerId: second.id,
          cardId: "wrong-slash",
        }),
      "INVALID_RESPONSE",
    );
    const resolved = applyAction(firstDone, {
      type: "respond",
      playerId: second.id,
      cardId: null,
    });
    expect(player(resolved, second.id).hp).toBe(secondHp - 1);
    expect(resolved.pendingResponse).toBeNull();
  });

  it("continues a mass attack after a non-final target dies", () => {
    const initial = createGame({
      playerIds: ["a", "b", "c", "d", "e"],
      seed: seedFor(9082),
    });
    const victim = initial.players.find((candidate) => candidate.role !== "lord");
    if (!victim) throw new Error("Missing non-lord victim");
    const source = initial.players[(victim.seat - 1 + initial.players.length) % initial.players.length];
    if (!source) throw new Error("Missing source");
    setTurn(initial, source.id);
    initial.players.forEach((candidate) => { candidate.hand = []; });
    source.hand = [card("barbarians", "barbarian_invasion")];
    victim.hand = [];
    victim.hp = 1;

    const started = applyAction(initial, {
      type: "play_card",
      playerId: source.id,
      cardId: "barbarians",
    });
    expect(started.pendingResponse).toMatchObject({ targetId: victim.id });
    const victimDying = applyAction(started, {
      type: "respond",
      playerId: victim.id,
      cardId: null,
    });
    const victimDone = declineAllDyingRescues(victimDying);
    expect(player(victimDone, victim.id)).toMatchObject({ alive: false, hp: 0 });
    expect(victimDone.status).toBe("playing");
    expect(victimDone.pendingResponse).toMatchObject({ type: "mass_attack" });
    expect(victimDone.pendingResponse?.targetId).not.toBe(victim.id);
  });

  it("advances the turn when the current player dies during their Duel", () => {
    const initial = createGame({ playerIds: ["a", "b", "c", "d", "e"], seed: seedFor(9083) });
    const [lord, actor, opponent, remainingRebel, renegade] = initial.players;
    if (!lord || !actor || !opponent || !remainingRebel || !renegade) throw new Error("Missing players");
    lord.role = "lord";
    actor.role = "loyalist";
    // Keep this Duel lifecycle fixture independent from Huang Yueying's
    // pre-resolution Jizhi choice, which is covered by the skill tests.
    actor.generalId = "liu_bei";
    opponent.role = "rebel";
    remainingRebel.role = "rebel";
    renegade.role = "renegade";
    initial.players.forEach((candidate) => { candidate.hand = []; });
    initial.deck = [];
    initial.discardPile = [];
    initial.resolvingCards = [];
    actor.hp = 1;
    actor.hand = [card("fatal-duel", "duel")];
    opponent.hand = [card("duel-answer", "slash")];
    setTurn(initial, actor.id);

    const challenged = applyAction(initial, {
      type: "play_card",
      playerId: actor.id,
      cardId: "fatal-duel",
      targetId: opponent.id,
    });
    const returned = applyAction(challenged, {
      type: "respond",
      playerId: opponent.id,
      cardId: "duel-answer",
    });
    const dying = applyAction(returned, {
      type: "respond",
      playerId: actor.id,
      cardId: null,
    });
    const resolved = declineAllDyingRescues(dying);

    expect(player(resolved, actor.id)).toMatchObject({ alive: false, hp: 0 });
    expect(resolved).toMatchObject({
      status: "playing",
      currentPlayerId: opponent.id,
      pendingResponse: null,
      turn: { playerId: opponent.id, phase: "play" },
    });
  });

  it("keeps a mass-attack card out of reshuffling until every target resolves", () => {
    const initial = createGame({ playerIds: ["a", "b", "c", "d"], seed: seedFor(9084) });
    const actor = player(initial, initial.currentPlayerId);
    const [first, second, third] = orderedOpponents(initial, actor.id);
    if (!first || !second || !third) throw new Error("Missing targets");
    actor.role = "lord";
    first.role = "rebel";
    second.role = "rebel";
    third.role = "loyalist";
    initial.players.forEach((candidate) => { candidate.hand = []; });
    initial.deck = [];
    initial.discardPile = [];
    initial.resolvingCards = [];
    actor.hand = [card("active-barbarians", "barbarian_invasion")];
    first.hp = 1;

    const started = applyAction(initial, {
      type: "play_card",
      playerId: actor.id,
      cardId: "active-barbarians",
    });
    const firstDying = applyAction(started, {
      type: "respond",
      playerId: first.id,
      cardId: null,
    });
    const firstDone = declineAllDyingRescues(firstDying);

    expect(firstDone.status).toBe("playing");
    expect(player(firstDone, actor.id).hand.map((candidate) => candidate.id)).not.toContain("active-barbarians");
    expect(firstDone.discardPile.map((candidate) => candidate.id)).not.toContain("active-barbarians");
    expect(firstDone.resolvingCards.map((candidate) => candidate.id)).toContain("active-barbarians");

    const secondDone = applyAction(firstDone, {
      type: "respond",
      playerId: second.id,
      cardId: null,
    });
    const resolved = applyAction(secondDone, {
      type: "respond",
      playerId: third.id,
      cardId: null,
    });
    expect(resolved.pendingResponse).toBeNull();
    expect(resolved.resolvingCards).toEqual([]);
    expect(resolved.discardPile.map((candidate) => candidate.id)).toContain("active-barbarians");
  });
});

describe("Nullification chain", () => {
  it("lets a holder pass and then resolves Ex Nihilo", () => {
    const initial = createGame({ playerIds: ["a", "b"], seed: seedFor(9091) });
    const actor = player(initial, initial.currentPlayerId);
    initial.players.forEach((candidate) => { candidate.hand = []; });
    actor.hand = [card("ex-nullification-pass", "ex_nihilo"), card("held-nullification", "wu_xie_ke_ji")];
    const started = applyAction(initial, { type: "play_card", playerId: actor.id, cardId: "ex-nullification-pass" });
    expect(started.pendingResponse).toMatchObject({ type: "nullification", targetId: actor.id, cardKind: "ex_nihilo", negated: false });
    if (started.pendingResponse?.type !== "nullification") throw new Error("Missing Nullification response");
    assertRestorableNullificationResponse(started, started.pendingResponse);
    const forged = JSON.parse(JSON.stringify(started)) as GameSession;
    if (forged.pendingResponse?.type !== "nullification") throw new Error("Missing forged Nullification response");
    forged.pendingResponse = { ...forged.pendingResponse, negated: true };
    expect(() => assertRestorableNullificationResponse(forged, forged.pendingResponse as typeof started.pendingResponse)).toThrow(/游标/);
    expect(getGameView(started, actor.id).prompt).toMatchObject({ type: "nullification", allowedCardIds: ["held-nullification"] });
    expect(getGameView(started, orderedOpponents(started, actor.id)[0]!.id).pendingResponse).toBeNull();
    const resolved = applyAction(started, { type: "respond", playerId: actor.id, cardId: null });
    expect(resolved.pendingResponse).toBeNull();
    expect(resolved.completeRules.lifecycle.effects.some((effect) => effect.kind === "nullification_progress")).toBe(false);
    expect(player(resolved, actor.id).hand).toHaveLength(3);
    expect(player(resolved, actor.id).hand.map((candidate) => candidate.id)).toContain("held-nullification");
  });

  it("negates a delayed trick before it enters the judgment zone", () => {
    const initial = createGame({ playerIds: ["a", "b"], seed: seedFor(9092) });
    const actor = player(initial, initial.currentPlayerId);
    const target = orderedOpponents(initial, actor.id)[0]!;
    initial.players.forEach((candidate) => { candidate.hand = []; });
    actor.hand = [card("negated-indulgence", "le_bu_si_shu")];
    target.hand = [card("target-nullification", "wu_xie_ke_ji")];
    const started = applyAction(initial, { type: "play_card", playerId: actor.id, cardId: "negated-indulgence", targetId: target.id });
    expect(started.pendingResponse).toMatchObject({ type: "nullification", targetId: target.id, effectTargetId: target.id });
    const negated = applyAction(started, { type: "respond", playerId: target.id, cardId: "target-nullification" });
    expect(player(negated, target.id).judgment).toHaveLength(0);
    expect(negated.pendingResponse).toBeNull();
    expect(negated.discardPile.map((candidate) => candidate.id)).toEqual(expect.arrayContaining(["negated-indulgence", "target-nullification"]));
  });

  it("allows Nullification to counter Nullification and restores Duel", () => {
    const initial = createGame({ playerIds: ["a", "b", "c"], seed: seedFor(9093) });
    const actor = player(initial, initial.currentPlayerId);
    const [target, counter] = orderedOpponents(initial, actor.id);
    if (!target || !counter) throw new Error("Missing targets");
    initial.players.forEach((candidate) => { candidate.hand = []; });
    actor.hand = [card("countered-duel", "duel")];
    target.hand = [card("first-nullification", "wu_xie_ke_ji"), card("duel-slash", "slash")];
    counter.hand = [card("counter-nullification", "wu_xie_ke_ji")];
    const started = applyAction(initial, { type: "play_card", playerId: actor.id, cardId: "countered-duel", targetId: target.id });
    const first = applyAction(started, { type: "respond", playerId: target.id, cardId: "first-nullification" });
    expect(first.pendingResponse).toMatchObject({ type: "nullification", targetId: counter.id, negated: true });
    const restored = applyAction(first, { type: "respond", playerId: counter.id, cardId: "counter-nullification" });
    expect(restored.pendingResponse).toMatchObject({ type: "duel", attackerId: actor.id, targetId: target.id });
    expect(getGameView(restored, target.id).prompt).toMatchObject({ type: "respond", responseKind: "slash", allowedCardIds: ["duel-slash"] });
  });

  it("negates a mass attack for one target and continues with the next", () => {
    const initial = createGame({ playerIds: ["a", "b", "c"], seed: seedFor(9094) });
    setTurn(initial, initial.currentPlayerId);
    const actor = player(initial, initial.currentPlayerId);
    const [first, second] = orderedOpponents(initial, actor.id);
    if (!first || !second) throw new Error("Missing targets");
    initial.players.forEach((candidate) => { candidate.hand = []; });
    actor.hand = [card("arrows-nullification", "arrow_barrage")];
    first.hand = [card("mass-nullification", "wu_xie_ke_ji")];
    second.hand = [card("second-dodge", "dodge")];
    const started = applyAction(initial, { type: "play_card", playerId: actor.id, cardId: "arrows-nullification" });
    expect(started.pendingResponse).toMatchObject({ type: "nullification", effectTargetId: first.id, targetId: first.id });
    const advanced = applyAction(started, { type: "respond", playerId: first.id, cardId: "mass-nullification" });
    expect(advanced.pendingResponse).toMatchObject({ type: "mass_attack", targetId: second.id, responseKind: "dodge" });
    expect(getGameView(advanced, second.id).prompt).toMatchObject({ allowedCardIds: ["second-dodge"] });
  });
});

describe("cross-player zone selection tricks", () => {
  it("keeps hand choices anonymous while exposing equipment and judgment cards", () => {
    const initial = createGame({ playerIds: ["a", "b"], seed: seedFor(9095) });
    const actor = player(initial, initial.currentPlayerId);
    const target = orderedOpponents(initial, actor.id)[0]!;
    initial.players.forEach((candidate) => { candidate.hand = []; });
    actor.hand = [card("dismantlement", "guo_he_chai_qiao")];
    target.hand = [card("hidden-slash", "slash")];
    target.equipment.offensive_horse = card("public-horse", "chi_tu");
    target.judgment = [card("public-indulgence", "le_bu_si_shu")];

    const started = applyAction(initial, { type: "play_card", playerId: actor.id, cardId: "dismantlement", targetId: target.id });
    expect(started.pendingResponse).toMatchObject({ type: "zone_selection", targetId: actor.id, victimId: target.id, mode: "discard" });
    const prompt = getGameView(started, actor.id).prompt;
    expect(prompt).toMatchObject({
      type: "zone_selection",
      choices: [
        { token: "hand:0", zone: "hand", card: null },
        { token: "equipment:offensive_horse", zone: "equipment", card: { kind: "chi_tu" } },
        { token: "judgment:0", zone: "judgment", card: { kind: "le_bu_si_shu" } },
      ],
    });
    expectRuleError(() => applyAction(started, { type: "choose_zone_card", playerId: actor.id, token: "hand:9" }), "INVALID_SELECTION");
    expect(player(started, target.id).hand).toHaveLength(1);

    const resolved = applyAction(started, { type: "choose_zone_card", playerId: actor.id, token: "hand:0" });
    expect(player(resolved, target.id).hand).toHaveLength(0);
    expect(resolved.discardPile.map((candidate) => candidate.id)).toEqual(expect.arrayContaining(["hidden-slash", "dismantlement"]));
    expect(resolved.pendingResponse).toBeNull();
  });

  it("gains a public equipment card with Snatch and triggers Silver Lion loss", () => {
    const initial = createGame({ playerIds: ["a", "b"], seed: seedFor(9096) });
    const actor = player(initial, initial.currentPlayerId);
    const target = orderedOpponents(initial, actor.id)[0]!;
    initial.players.forEach((candidate) => { candidate.hand = []; });
    actor.hand = [card("snatch", "shun_shou_qian_yang")];
    target.hp -= 1;
    target.equipment.armor = card("snatched-lion", "bai_yin_shi_zi");
    const hp = target.hp;

    const started = applyAction(initial, { type: "play_card", playerId: actor.id, cardId: "snatch", targetId: target.id });
    const resolved = applyAction(started, { type: "choose_zone_card", playerId: actor.id, token: "equipment:armor" });
    expect(player(resolved, actor.id).hand.map((candidate) => candidate.id)).toContain("snatched-lion");
    expect(player(resolved, target.id).equipment.armor).toBeUndefined();
    expect(player(resolved, target.id).hp).toBe(hp + 1);
  });

  it("enforces Snatch distance and finishes safely if Nullification consumed the last target card", () => {
    const ranged = createGame({ playerIds: ["a", "b", "c", "d", "e"], seed: seedFor(9097) });
    const actor = player(ranged, ranged.currentPlayerId);
    const distant = orderedOpponents(ranged, actor.id)[1]!;
    ranged.players.forEach((candidate) => { candidate.hand = []; });
    actor.hand = [card("distant-snatch", "shun_shou_qian_yang")];
    distant.hand = [card("distant-card", "dodge")];
    expectRuleError(() => applyAction(ranged, { type: "play_card", playerId: actor.id, cardId: "distant-snatch", targetId: distant.id }), "INVALID_TARGET");

    const chained = createGame({ playerIds: ["a", "b", "c"], seed: seedFor(9098) });
    const source = player(chained, chained.currentPlayerId);
    const [victim, counter] = orderedOpponents(chained, source.id);
    if (!victim || !counter) throw new Error("Missing targets");
    chained.players.forEach((candidate) => { candidate.hand = []; });
    source.hand = [card("empty-target-dismantlement", "guo_he_chai_qiao")];
    victim.hand = [card("last-target-nullification", "wu_xie_ke_ji")];
    counter.hand = [card("restore-zone-effect", "wu_xie_ke_ji")];
    const started = applyAction(chained, { type: "play_card", playerId: source.id, cardId: "empty-target-dismantlement", targetId: victim.id });
    const negated = applyAction(started, { type: "respond", playerId: victim.id, cardId: "last-target-nullification" });
    const restored = applyAction(negated, { type: "respond", playerId: counter.id, cardId: "restore-zone-effect" });
    expect(restored.pendingResponse).toBeNull();
    expect(restored.turn.phase).toBe("play");
  });
});

describe("remaining ordinary trick cards", () => {
  it("resolves Fire Attack through reveal, matching-suit discard, and public projection", () => {
    const initial = createGame({ playerIds: ["a", "b", "c"], seed: seedFor(9301) });
    const actor = player(initial, initial.currentPlayerId);
    const target = initial.players.find((candidate) => candidate.id !== actor.id)!;
    initial.players.forEach((candidate) => { candidate.hand = []; });
    const attack = { ...card("fire-attack", "fire_attack"), suit: "heart" as const };
    const payment = { ...card("heart-payment", "slash"), suit: "heart" as const };
    const wrongSuit = { ...card("wrong-payment", "slash"), suit: "spade" as const };
    const revealed = { ...card("revealed", "dodge"), suit: "heart" as const, rank: 9 as const };
    actor.hand = [attack, payment, wrongSuit];
    target.hand = [revealed];

    const started = applyAction(initial, { type: "play_card", playerId: actor.id, cardId: attack.id, targetId: target.id });
    expect(started.pendingResponse).toMatchObject({ type: "fire_attack_reveal", targetId: target.id });
    expect(getGameView(started, target.id).prompt).toMatchObject({ type: "fire_attack_reveal", allowedCardIds: [revealed.id] });

    const shown = applyAction(started, { type: "choose_hand_card", playerId: target.id, cardId: revealed.id });
    expect(shown.pendingResponse).toMatchObject({ type: "fire_attack_discard", targetId: actor.id, victimId: target.id });
    expect(getGameView(shown, null).publicCards.map((candidate) => candidate.id)).toEqual([revealed.id]);
    expectRuleError(
      () => applyAction(shown, { type: "choose_hand_card", playerId: actor.id, cardId: wrongSuit.id }),
      "INVALID_SELECTION",
    );

    const resolved = applyAction(shown, { type: "choose_hand_card", playerId: actor.id, cardId: payment.id });
    expect(player(resolved, target.id).hp).toBe(target.hp - 1);
    expect(resolved.pendingResponse).toBeNull();
    expect(resolved.discardPile.map((candidate) => candidate.id)).toEqual(expect.arrayContaining([attack.id, payment.id]));
  });

  it("reveals an Amazing Grace pool and lets every living player take exactly one card", () => {
    const initial = createGame({ playerIds: ["a", "b", "c"], seed: seedFor(9302) });
    const actor = player(initial, initial.currentPlayerId);
    initial.players.forEach((candidate) => { candidate.hand = []; });
    const grace = card("grace", "amazing_grace");
    actor.hand = [grace];
    initial.deck = [card("pool-1", "peach"), card("pool-2", "dodge"), card("pool-3", "slash")];
    initial.discardPile = [];

    let current = applyAction(initial, { type: "play_card", playerId: actor.id, cardId: grace.id });
    expect(getGameView(current, null).publicCards).toHaveLength(3);
    const recipients: string[] = [];
    while (current.pendingResponse?.type === "amazing_grace_selection") {
      const recipientId = current.pendingResponse.targetId;
      const selected = current.pendingResponse.pool[0]!;
      recipients.push(recipientId);
      current = applyAction(current, { type: "choose_amazing_grace_card", playerId: recipientId, cardId: selected.id });
    }
    expect(new Set(recipients)).toEqual(new Set(initial.players.map((candidate) => candidate.id)));
    expect(current.players.every((candidate) => candidate.hand.length === 1)).toBe(true);
    expect(current.pendingResponse).toBeNull();
    expect(current.discardPile.map((candidate) => candidate.id)).toContain(grace.id);
  });

  it("forces a Borrowed Sword Slash and uses the weapon holder as damage source", () => {
    const initial = createGame({ playerIds: ["a", "b", "c"], seed: seedFor(9303) });
    const actor = player(initial, initial.currentPlayerId);
    const [holder, target] = initial.players.filter((candidate) => candidate.id !== actor.id);
    if (!holder || !target) throw new Error("Missing Borrowed Sword fixtures");
    initial.players.forEach((candidate) => { candidate.hand = []; });
    actor.hand = [card("borrowed", "borrowed_sword")];
    holder.hand = [card("forced-slash", "fire_slash")];
    holder.equipment.weapon = card("holder-weapon", "qing_gang_jian");

    const started = applyAction(initial, {
      type: "play_card",
      playerId: actor.id,
      cardId: "borrowed",
      targetIds: [holder.id, target.id],
    });
    expect(started.pendingResponse).toMatchObject({ type: "borrowed_sword", targetId: holder.id, attackTargetId: target.id });
    const slashed = applyAction(started, { type: "respond", playerId: holder.id, cardId: "forced-slash" });
    expect(slashed.pendingResponse).toMatchObject({ type: "slash", attackerId: holder.id, targetId: target.id, nature: "fire" });
    const resolved = applyAction(slashed, { type: "respond", playerId: target.id, cardId: null });
    expect(player(resolved, target.id).hp).toBe(target.hp - 1);
    expect(player(resolved, holder.id).equipment.weapon?.id).toBe("holder-weapon");
  });

  it("transfers the weapon when Borrowed Sword is declined", () => {
    const initial = createGame({ playerIds: ["a", "b", "c"], seed: seedFor(9304) });
    const actor = player(initial, initial.currentPlayerId);
    const [holder, target] = initial.players.filter((candidate) => candidate.id !== actor.id);
    if (!holder || !target) throw new Error("Missing Borrowed Sword fixtures");
    initial.players.forEach((candidate) => { candidate.hand = []; });
    actor.hand = [card("borrowed-pass", "borrowed_sword")];
    holder.equipment.weapon = card("transferred-weapon", "gu_ding_dao");
    const started = applyAction(initial, {
      type: "play_card", playerId: actor.id, cardId: "borrowed-pass", targetIds: [holder.id, target.id],
    });
    const resolved = applyAction(started, { type: "respond", playerId: holder.id, cardId: null });
    expect(player(resolved, holder.id).equipment.weapon).toBeUndefined();
    expect(player(resolved, actor.id).hand.map((candidate) => candidate.id)).toContain("transferred-weapon");
  });

  it("recasts Iron Chain and propagates elemental damage through chained players", () => {
    const initial = createGame({ playerIds: ["a", "b", "c"], seed: seedFor(9305) });
    const actor = player(initial, initial.currentPlayerId);
    const target = initial.players.find((candidate) => candidate.id !== actor.id)!;
    initial.players.forEach((candidate) => { candidate.hand = []; });
    actor.hand = [card("chain-targets", "iron_chain"), card("chain-recast", "iron_chain"), card("chain-fire-slash", "fire_slash")];
    initial.deck = [card("recast-draw", "dodge")];
    initial.discardPile = [];

    let current = applyAction(initial, {
      type: "play_card", playerId: actor.id, cardId: "chain-targets", targetIds: [actor.id, target.id],
    });
    expect(player(current, actor.id).chained).toBe(true);
    expect(player(current, target.id).chained).toBe(true);
    current = applyAction(current, { type: "play_card", playerId: actor.id, cardId: "chain-recast", targetIds: [] });
    expect(player(current, actor.id).hand.map((candidate) => candidate.id)).toContain("recast-draw");
    const beforeActorHp = player(current, actor.id).hp;
    const beforeTargetHp = player(current, target.id).hp;
    current = applyAction(current, { type: "play_card", playerId: actor.id, cardId: "chain-fire-slash", targetId: target.id });
    current = applyAction(current, { type: "respond", playerId: target.id, cardId: null });
    expect(player(current, target.id).hp).toBe(beforeTargetHp - 1);
    expect(player(current, actor.id).hp).toBe(beforeActorHp - 1);
    expect(player(current, target.id).chained).toBe(false);
    expect(player(current, actor.id).chained).toBe(false);
  });

  it("continues chained damage after the first dying player rescues themselves", () => {
    const initial = createGame({ playerIds: ["a", "b", "c", "d"], seed: seedFor(9306) });
    const actor = player(initial, initial.currentPlayerId);
    const target = initial.players.find((candidate) => candidate.role === "loyalist");
    const propagatedTarget = initial.players.find((candidate) => candidate.id !== actor.id && candidate.id !== target?.id);
    if (!target || !propagatedTarget) throw new Error("Missing chained dying fixtures");
    initial.players.forEach((candidate) => { candidate.hand = []; candidate.chained = false; });
    actor.hand = [card("dying-chain-slash", "fire_slash")];
    target.hand = [card("chain-rescue-peach", "peach")];
    target.hp = 1;
    target.chained = true;
    propagatedTarget.chained = true;
    const propagatedHp = propagatedTarget.hp;

    let current = applyAction(initial, { type: "play_card", playerId: actor.id, cardId: "dying-chain-slash", targetId: target.id });
    current = applyAction(current, { type: "respond", playerId: target.id, cardId: null });
    expect(current.pendingResponse).toMatchObject({
      type: "dying",
      victimId: target.id,
      resume: { type: "damage_flow", frameId: 1, damageId: 1, dyingId: 1 },
    });
    expect(current.completeRules.damageFlow.frames[0]?.callerContinuation).toMatchObject({
      type: "game_session.damage_resume.v1",
      data: { resume: { type: "chain_damage" } },
    });
    current = applyAction(current, { type: "respond", playerId: target.id, cardId: "chain-rescue-peach" });
    expect(player(current, target.id)).toMatchObject({ alive: true, hp: 1, chained: false });
    expect(player(current, propagatedTarget.id)).toMatchObject({ hp: propagatedHp - 1, chained: false });
    expect(current.pendingResponse).toBeNull();
    expect(current.completeRules.damageFlow.frames).toEqual([]);
    expect(current.completeRules.damageFlow.completedDamageIds).toEqual([1, 2]);
  });

  it("keeps the Amazing Grace pool public while Nullification skips one recipient", () => {
    const initial = createGame({ playerIds: ["a", "b", "c"], seed: seedFor(9307) });
    const actor = player(initial, initial.currentPlayerId);
    setTurn(initial, actor.id);
    const nullifier = initial.players.find((candidate) => candidate.id !== actor.id)!;
    initial.players.forEach((candidate) => { candidate.hand = []; });
    actor.hand = [card("grace-nullified", "amazing_grace")];
    nullifier.hand = [card("grace-wuxie", "wu_xie_ke_ji")];
    initial.deck = [card("grace-pool-a", "slash"), card("grace-pool-b", "dodge"), card("grace-pool-c", "peach")];
    initial.discardPile = [];

    let current = applyAction(initial, { type: "play_card", playerId: actor.id, cardId: "grace-nullified" });
    expect(current.pendingResponse).toMatchObject({ type: "nullification", targetId: nullifier.id, effectTargetId: actor.id });
    expect(getGameView(current, null).publicCards).toHaveLength(3);
    current = applyAction(current, { type: "respond", playerId: nullifier.id, cardId: "grace-wuxie" });
    while (current.pendingResponse?.type === "amazing_grace_selection") {
      const recipientId = current.pendingResponse.targetId;
      current = applyAction(current, {
        type: "choose_amazing_grace_card",
        playerId: recipientId,
        cardId: current.pendingResponse.pool[0]!.id,
      });
    }
    expect(player(current, actor.id).hand).toHaveLength(0);
    expect(current.discardPile.filter((candidate) => candidate.id.startsWith("grace-pool-"))).toHaveLength(1);
  });
});

describe("living-seat distance", () => {
  it("allows Slash only against adjacent living seats and closes gaps left by dead players", () => {
    const initial = createGame({ playerIds: ["a", "b", "c", "d", "e"], seed: seedFor(909) });
    const actor = player(initial, initial.currentPlayerId);
    const bySeat = [...initial.players].sort((left, right) => left.seat - right.seat);
    const clockwiseNeighbor = bySeat[(actor.seat + 1) % bySeat.length];
    const clockwiseFar = bySeat[(actor.seat + 2) % bySeat.length];
    const counterNeighbor = bySeat[(actor.seat - 1 + bySeat.length) % bySeat.length];
    if (!clockwiseNeighbor || !clockwiseFar || !counterNeighbor) throw new Error("Missing distance targets");
    actor.hand = [card("range-slash", "slash")];

    expect(distanceBetweenPlayers(initial, actor.id, clockwiseNeighbor.id)).toBe(1);
    expect(distanceBetweenPlayers(initial, actor.id, clockwiseFar.id)).toBe(2);
    const prompt = getGameView(initial, actor.id).prompt;
    expect(prompt).toMatchObject({ type: "play" });
    if (prompt.type !== "play") throw new Error("Missing play prompt");
    expect(prompt.cards[0]?.targetIds).toEqual(expect.arrayContaining([
      clockwiseNeighbor.id,
      counterNeighbor.id,
    ]));
    expect(prompt.cards[0]?.targetIds).not.toContain(clockwiseFar.id);
    expectRuleError(() => applyAction(initial, {
      type: "play_card",
      playerId: actor.id,
      cardId: "range-slash",
      targetId: clockwiseFar.id,
    }), "INVALID_TARGET");

    clockwiseNeighbor.alive = false;
    clockwiseNeighbor.hp = 0;
    expect(distanceBetweenPlayers(initial, actor.id, clockwiseFar.id)).toBe(1);
    expect(() => applyAction(initial, {
      type: "play_card",
      playerId: actor.id,
      cardId: "range-slash",
      targetId: clockwiseFar.id,
    })).not.toThrow();
  });
});

describe("horse equipment", () => {
  it("equips and replaces an offensive horse, reducing outgoing distance by one", () => {
    const initial = createGame({ playerIds: ["a", "b", "c", "d", "e"], seed: seedFor(910) });
    const actor = player(initial, initial.currentPlayerId);
    const bySeat = [...initial.players].sort((left, right) => left.seat - right.seat);
    const far = bySeat[(actor.seat + 2) % bySeat.length];
    if (!far) throw new Error("Missing far target");
    actor.hand = [card("horse-one", "chi_tu"), card("horse-two", "da_wan"), card("horse-slash", "slash")];
    expect(distanceBetweenPlayers(initial, actor.id, far.id)).toBe(2);

    const equipped = applyAction(initial, { type: "play_card", playerId: actor.id, cardId: "horse-one" });
    expect(player(equipped, actor.id).equipment.offensive_horse?.id).toBe("horse-one");
    expect(distanceBetweenPlayers(equipped, actor.id, far.id)).toBe(1);
    const replaced = applyAction(equipped, { type: "play_card", playerId: actor.id, cardId: "horse-two" });
    expect(player(replaced, actor.id).equipment.offensive_horse?.id).toBe("horse-two");
    expect(replaced.discardPile.map((candidate) => candidate.id)).toContain("horse-one");
    expect(() => applyAction(replaced, {
      type: "play_card",
      playerId: actor.id,
      cardId: "horse-slash",
      targetId: far.id,
    })).not.toThrow();
  });

  it("makes an adjacent target out of range while they have a defensive horse", () => {
    const initial = createGame({ playerIds: ["a", "b", "c", "d"], seed: seedFor(911) });
    const actor = player(initial, initial.currentPlayerId);
    const target = orderedOpponents(initial, actor.id)[0];
    if (!target) throw new Error("Missing target");
    target.equipment.defensive_horse = card("defensive-horse", "jue_ying");
    actor.hand = [card("blocked-slash", "slash")];
    expect(distanceBetweenPlayers(initial, actor.id, target.id)).toBe(2);
    expectRuleError(() => applyAction(initial, {
      type: "play_card",
      playerId: actor.id,
      cardId: "blocked-slash",
      targetId: target.id,
    }), "INVALID_TARGET");
  });
});

describe("first weapon batch", () => {
  it("lets Zhuge Crossbow use multiple Slashes in one play phase", () => {
    const initial = createGame({ playerIds: ["a", "b"], seed: seedFor(912) });
    neutralizeGeneralSkills(initial);
    const actor = player(initial, initial.currentPlayerId);
    const target = orderedOpponents(initial, actor.id)[0]!;
    setTurn(initial, actor.id);
    actor.hand = [card("crossbow", "zhu_ge_lian_nu"), card("replacement-blade", "gu_ding_dao"), card("slash-one", "slash"), card("slash-two", "fire_slash")];
    target.hand = [];
    const equipped = applyAction(initial, { type: "play_card", playerId: actor.id, cardId: "crossbow" });
    const first = applyAction(equipped, { type: "play_card", playerId: actor.id, cardId: "slash-one", targetId: target.id });
    const firstDone = applyAction(first, { type: "respond", playerId: target.id, cardId: null });
    expect(firstDone.turn.slashUsed).toBe(true);
    expect(() => applyAction(firstDone, { type: "play_card", playerId: actor.id, cardId: "slash-two", targetId: target.id })).not.toThrow();
    const replaced = applyAction(firstDone, { type: "play_card", playerId: actor.id, cardId: "replacement-blade" });
    expectRuleError(() => applyAction(replaced, {
      type: "play_card",
      playerId: actor.id,
      cardId: "slash-two",
      targetId: target.id,
    }), "SLASH_ALREADY_USED");
  });

  it("gives GuDing Blade range two and +1 damage against an empty hand", () => {
    const initial = createGame({ playerIds: ["a", "b", "c", "d", "e"], seed: seedFor(913) });
    const actor = player(initial, initial.currentPlayerId);
    const bySeat = [...initial.players].sort((left, right) => left.seat - right.seat);
    const target = bySeat[(actor.seat + 2) % bySeat.length]!;
    actor.hand = [card("blade", "gu_ding_dao"), card("blade-slash", "slash")];
    target.hand = [];
    const hp = target.hp;
    const equipped = applyAction(initial, { type: "play_card", playerId: actor.id, cardId: "blade" });
    expect(distanceBetweenPlayers(equipped, actor.id, target.id)).toBe(2);
    const attacked = applyAction(equipped, { type: "play_card", playerId: actor.id, cardId: "blade-slash", targetId: target.id });
    const damaged = applyAction(attacked, { type: "respond", playerId: target.id, cardId: null });
    expect(player(damaged, target.id).hp).toBe(hp - 2);
  });
});

describe("Qinggang Sword", () => {
  it("ignores armor invalidation and does not offer Bagua Formation", () => {
    const initial = createGame({ playerIds: ["a", "b"], seed: seedFor(9131) });
    const actor = player(initial, initial.currentPlayerId);
    const target = orderedOpponents(initial, actor.id)[0]!;
    actor.equipment.weapon = card("qinggang", "qing_gang_jian");
    actor.hand = [{ ...card("qinggang-black-slash", "slash"), suit: "spade" }];
    target.equipment.armor = card("renwang-qinggang", "ren_wang_dun");
    const attacked = applyAction(initial, { type: "play_card", playerId: actor.id, cardId: "qinggang-black-slash", targetId: target.id });
    expect(attacked.pendingResponse).toMatchObject({ type: "slash", armorIgnored: true });

    target.equipment.armor = card("bagua-qinggang", "ba_gua_zhen");
    const baguaInitial = { ...initial, players: initial.players.map((candidate) => ({ ...candidate, hand: [...candidate.hand], equipment: { ...candidate.equipment } })) };
    player(baguaInitial, actor.id).hand = [{ ...card("qinggang-bagua-slash", "slash"), suit: "heart" }];
    player(baguaInitial, target.id).equipment.armor = card("bagua-qinggang", "ba_gua_zhen");
    const baguaAttacked = applyAction(baguaInitial, { type: "play_card", playerId: actor.id, cardId: "qinggang-bagua-slash", targetId: target.id });
    expect(getGameView(baguaAttacked, target.id).prompt).toMatchObject({ type: "respond", responseKind: "dodge" });
  });

  it("ignores Silver Lion damage capping", () => {
    const initial = createGame({ playerIds: ["a", "b"], seed: seedFor(9132) });
    const actor = player(initial, initial.currentPlayerId);
    setTurn(initial, actor.id);
    const target = orderedOpponents(initial, actor.id)[0]!;
    actor.equipment.weapon = card("qinggang-damage", "qing_gang_jian");
    actor.hand = [card("qinggang-wine", "wine"), card("qinggang-fire", "fire_slash")];
    target.equipment.armor = card("lion-qinggang", "bai_yin_shi_zi");
    const hp = target.hp;
    const drank = applyAction(initial, { type: "play_card", playerId: actor.id, cardId: "qinggang-wine" });
    const attacked = applyAction(drank, { type: "play_card", playerId: actor.id, cardId: "qinggang-fire", targetId: target.id });
    const damaged = applyAction(attacked, { type: "respond", playerId: target.id, cardId: null });
    expect(player(damaged, target.id).hp).toBe(hp - 2);
  });
});

describe("first armor batch", () => {
  it("makes black Slash ineffective against RenWang Shield", () => {
    const initial = createGame({ playerIds: ["a", "b"], seed: seedFor(914) });
    const actor = player(initial, initial.currentPlayerId);
    const target = orderedOpponents(initial, actor.id)[0]!;
    actor.hand = [{ ...card("black-slash", "slash"), suit: "spade" }];
    target.equipment.armor = card("renwang", "ren_wang_dun");
    const hp = target.hp;
    const resolved = applyAction(initial, { type: "play_card", playerId: actor.id, cardId: "black-slash", targetId: target.id });
    expect(player(resolved, target.id).hp).toBe(hp);
    expect(resolved.pendingResponse).toBeNull();
    expect(resolved.discardPile.map((candidate) => candidate.id)).toContain("black-slash");
  });

  it("blocks normal Slash and mass attacks with Vine Armor but increases fire damage", () => {
    const initial = createGame({ playerIds: ["a", "b", "c"], seed: seedFor(915) });
    setTurn(initial, initial.currentPlayerId);
    const actor = player(initial, initial.currentPlayerId);
    const [target, other] = orderedOpponents(initial, actor.id);
    if (!target || !other) throw new Error("Missing targets");
    initial.players.forEach((candidate) => { candidate.hand = []; });
    target.equipment.armor = card("vine", "teng_jia");
    actor.hand = [card("normal", "slash"), card("fire", "fire_slash"), card("barbarians", "barbarian_invasion")];
    const blocked = applyAction(initial, { type: "play_card", playerId: actor.id, cardId: "normal", targetId: target.id });
    blocked.turn.slashUsed = false;
    const hp = player(blocked, target.id).hp;
    const fire = applyAction(blocked, { type: "play_card", playerId: actor.id, cardId: "fire", targetId: target.id });
    const burned = applyAction(fire, { type: "respond", playerId: target.id, cardId: null });
    expect(player(burned, target.id).hp).toBe(hp - 2);
    burned.turn.slashUsed = false;
    const mass = applyAction(burned, { type: "play_card", playerId: actor.id, cardId: "barbarians" });
    expect(mass.pendingResponse).toMatchObject({ type: "mass_attack", targetId: other.id });
  });

  it("caps damage with Silver Lion and heals when it is replaced", () => {
    const initial = createGame({ playerIds: ["a", "b"], seed: seedFor(916) });
    const actor = player(initial, initial.currentPlayerId);
    const target = orderedOpponents(initial, actor.id)[0]!;
    target.equipment.armor = card("lion", "bai_yin_shi_zi");
    actor.hand = [card("wine", "wine"), card("boosted", "fire_slash")];
    target.hand = [];
    const hp = target.hp;
    const drank = applyAction(initial, { type: "play_card", playerId: actor.id, cardId: "wine" });
    const attacked = applyAction(drank, { type: "play_card", playerId: actor.id, cardId: "boosted", targetId: target.id });
    const damaged = applyAction(attacked, { type: "respond", playerId: target.id, cardId: null });
    expect(player(damaged, target.id).hp).toBe(hp - 1);

    const wounded = player(damaged, target.id);
    setTurn(damaged, target.id);
    wounded.hand = [card("new-armor", "teng_jia")];
    const replaced = applyAction(damaged, { type: "play_card", playerId: target.id, cardId: "new-armor" });
    expect(player(replaced, target.id).hp).toBe(hp);
    expect(replaced.discardPile.map((candidate) => candidate.id)).toContain("lion");
  });
});

describe("Bagua Formation judgment", () => {
  it("uses a red judgment as Dodge and publishes the result", () => {
    const initial = createGame({ playerIds: ["a", "b"], seed: seedFor(917) });
    neutralizeGeneralSkills(initial);
    const actor = player(initial, initial.currentPlayerId);
    const target = orderedOpponents(initial, actor.id)[0]!;
    setTurn(initial, actor.id);
    actor.hand = [card("bagua-slash", "slash")];
    target.equipment.armor = card("bagua", "ba_gua_zhen");
    target.hand = [];
    initial.deck = [{ ...card("red-judgment", "peach"), suit: "heart", rank: 7 }];
    initial.discardPile = [];
    const hp = target.hp;

    const attacked = applyAction(initial, {
      type: "play_card",
      playerId: actor.id,
      cardId: "bagua-slash",
      targetId: target.id,
    });
    expect(getGameView(attacked, target.id).prompt).toMatchObject({ type: "armor", armorKind: "ba_gua_zhen" });

    const resolved = applyAction(attacked, { type: "activate_armor", playerId: target.id, activate: true });
    expect(player(resolved, target.id).hp).toBe(hp);
    expect(resolved.pendingResponse).toBeNull();
    expect(resolved.discardPile.map((candidate) => candidate.id)).toEqual(expect.arrayContaining(["red-judgment", "bagua-slash"]));
    expect(resolved.logs.map((entry) => entry.message).join("\n")).toContain("发动八卦阵成功");
    expect(initial.deck[0]?.id).toBe("red-judgment");
  });

  it("continues with a normal Dodge response after a black judgment", () => {
    const initial = createGame({ playerIds: ["a", "b"], seed: seedFor(918) });
    neutralizeGeneralSkills(initial);
    const actor = player(initial, initial.currentPlayerId);
    const target = orderedOpponents(initial, actor.id)[0]!;
    setTurn(initial, actor.id);
    actor.hand = [card("black-judge-slash", "slash")];
    target.equipment.armor = card("bagua-black", "ba_gua_zhen");
    target.hand = [card("real-dodge", "dodge")];
    initial.deck = [{ ...card("black-judgment", "slash"), suit: "club", rank: 2 }];
    initial.discardPile = [];

    const attacked = applyAction(initial, { type: "play_card", playerId: actor.id, cardId: "black-judge-slash", targetId: target.id });
    const judged = applyAction(attacked, { type: "activate_armor", playerId: target.id, activate: true });
    expect(judged.pendingResponse).toMatchObject({ type: "slash", targetId: target.id, armorAttempted: true });
    expect(getGameView(judged, target.id).prompt).toMatchObject({ type: "respond", responseKind: "dodge", allowedCardIds: ["real-dodge"] });
    expect(() => applyAction(judged, { type: "activate_armor", playerId: target.id, activate: true })).toThrow();

    const resolved = applyAction(judged, { type: "respond", playerId: target.id, cardId: "real-dodge" });
    expect(resolved.pendingResponse).toBeNull();
  });

  it("advances a mass attack after a successful Bagua judgment", () => {
    const initial = createGame({ playerIds: ["a", "b", "c"], seed: seedFor(919) });
    neutralizeGeneralSkills(initial);
    const actor = player(initial, initial.currentPlayerId);
    const [first, second] = orderedOpponents(initial, actor.id);
    if (!first || !second) throw new Error("Missing targets");
    setTurn(initial, actor.id);
    actor.hand = [card("arrows-bagua", "arrow_barrage")];
    first.equipment.armor = card("bagua-mass", "ba_gua_zhen");
    initial.deck = [{ ...card("mass-red-judgment", "peach"), suit: "diamond", rank: 9 }];
    initial.discardPile = [];

    const attacked = applyAction(initial, { type: "play_card", playerId: actor.id, cardId: "arrows-bagua" });
    expect(attacked.pendingResponse).toMatchObject({ type: "mass_attack", targetId: first.id, responseKind: "dodge" });
    const advanced = applyAction(attacked, { type: "activate_armor", playerId: first.id, activate: true });
    expect(advanced.pendingResponse).toMatchObject({ type: "mass_attack", targetId: second.id, responseKind: "dodge", armorAttempted: false });
  });
});

describe("delayed tricks and judgment phase", () => {
  it("places delayed tricks publicly and rejects duplicate or out-of-range targets", () => {
    const initial = createGame({ playerIds: ["a", "b", "c", "d", "e"], seed: seedFor(920) });
    const actor = player(initial, initial.currentPlayerId);
    const opponents = orderedOpponents(initial, actor.id);
    const adjacent = opponents[0]!;
    const distant = opponents[1]!;
    actor.hand = [
      card("lebu-place", "le_bu_si_shu"),
      card("lebu-duplicate", "le_bu_si_shu"),
      card("bing-place", "bing_liang_cun_duan"),
      card("lightning-place", "shan_dian"),
    ];
    const lebu = applyAction(initial, { type: "play_card", playerId: actor.id, cardId: "lebu-place", targetId: adjacent.id });
    expect(player(lebu, adjacent.id).judgment.map((candidate) => candidate.id)).toEqual(["lebu-place"]);
    expect(getGameView(lebu, actor.id).players.find((candidate) => candidate.id === adjacent.id)?.judgment).toMatchObject([{ kind: "le_bu_si_shu" }]);
    expectRuleError(() => applyAction(lebu, { type: "play_card", playerId: actor.id, cardId: "lebu-duplicate", targetId: adjacent.id }), "DUPLICATE_DELAYED_TRICK");
    expectRuleError(() => applyAction(lebu, { type: "play_card", playerId: actor.id, cardId: "bing-place", targetId: distant.id }), "INVALID_TARGET");
    const lightning = applyAction(lebu, { type: "play_card", playerId: actor.id, cardId: "lightning-place" });
    expect(player(lightning, actor.id).judgment).toMatchObject([{ kind: "shan_dian" }]);
  });

  it("skips play after a failed Indulgence judgment and enters discard", () => {
    const initial = createGame({ playerIds: ["a", "b"], seed: seedFor(921) });
    const actor = player(initial, initial.currentPlayerId);
    const target = orderedOpponents(initial, actor.id)[0]!;
    actor.hand = [];
    target.judgment = [card("lebu-resolve", "le_bu_si_shu")];
    target.hand = Array.from({ length: 5 }, (_, index) => card(`lebu-hand-${index}`, "dodge"));
    initial.deck = [{ ...card("lebu-black", "slash"), suit: "spade", rank: 7 }];
    initial.discardPile = [];
    const advanced = applyAction(initial, { type: "end_play", playerId: actor.id });
    expect(advanced.currentPlayerId).toBe(target.id);
    const advancedTarget = player(advanced, target.id);
    expect(advanced.turn).toMatchObject({
      phase: "discard",
      skipPlay: true,
      requiredDiscardCount: Math.max(0, advancedTarget.hand.length - advancedTarget.hp),
    });
    expect(player(advanced, target.id).judgment).toHaveLength(0);
  });

  it("skips draw after a failed Supply Shortage judgment", () => {
    const initial = createGame({ playerIds: ["a", "b"], seed: seedFor(922) });
    const actor = player(initial, initial.currentPlayerId);
    const target = orderedOpponents(initial, actor.id)[0]!;
    actor.hand = [];
    target.judgment = [card("supply-resolve", "bing_liang_cun_duan")];
    target.hand = [];
    initial.deck = [{ ...card("supply-heart", "peach"), suit: "heart", rank: 3 }];
    initial.discardPile = [];
    const advanced = applyAction(initial, { type: "end_play", playerId: actor.id });
    expect(advanced.currentPlayerId).toBe(target.id);
    expect(advanced.turn).toMatchObject({ phase: "play", skipDraw: true });
    expect(player(advanced, target.id).hand).toHaveLength(0);
  });

  it("moves a missed Lightning and resumes turn start after a rescued hit", () => {
    const moving = createGame({ playerIds: ["a", "b", "c"], seed: seedFor(923) });
    neutralizeGeneralSkills(moving);
    setTurn(moving, moving.currentPlayerId);
    const actor = player(moving, moving.currentPlayerId);
    const [target, next] = orderedOpponents(moving, actor.id);
    if (!target || !next) throw new Error("Missing targets");
    actor.hand = [];
    target.judgment = [card("moving-lightning", "shan_dian")];
    moving.deck = [{ ...card("lightning-miss", "peach"), suit: "heart", rank: 12 }];
    moving.discardPile = [];
    const moved = applyAction(moving, { type: "end_play", playerId: actor.id });
    expect(player(moved, next.id).judgment.map((candidate) => candidate.id)).toContain("moving-lightning");

    const hitting = createGame({ playerIds: ["a", "b"], seed: seedFor(924) });
    neutralizeGeneralSkills(hitting);
    setTurn(hitting, hitting.currentPlayerId);
    const hitter = player(hitting, hitting.currentPlayerId);
    const victim = orderedOpponents(hitting, hitter.id)[0]!;
    hitter.hand = [];
    victim.hp = 3;
    victim.hand = [card("lightning-peach", "peach")];
    victim.judgment = [card("hitting-lightning", "shan_dian")];
    hitting.deck = [{ ...card("lightning-hit", "slash"), suit: "spade", rank: 5 }];
    hitting.discardPile = [];
    const struck = applyAction(hitting, { type: "end_play", playerId: hitter.id });
    expect(struck.pendingResponse).toMatchObject({
      type: "dying",
      victimId: victim.id,
      damageSourceId: null,
      targetId: victim.id,
      resume: { type: "damage_flow", frameId: 1, damageId: 1, dyingId: 1 },
    });
    expect(struck.completeRules.damageFlow.frames[0]?.callerContinuation).toMatchObject({
      type: "game_session.damage_resume.v1",
      data: { resume: { type: "turn_start" } },
    });
    const rescued = applyAction(struck, { type: "respond", playerId: victim.id, cardId: "lightning-peach" });
    expect(rescued.currentPlayerId).toBe(victim.id);
    expect(rescued.turn.phase).toBe("play");
    expect(player(rescued, victim.id).hp).toBe(1);
    expect(rescued.completeRules.damageFlow.frames).toEqual([]);
    expect(rescued.completeRules.damageFlow.completedDamageIds).toEqual([1]);
  });

  it("keeps a source-less Lightning physical card resolving through Jianxiong", () => {
    const initial = createGame({ playerIds: ["a", "b", "c"], seed: seedFor(925) });
    neutralizeGeneralSkills(initial);
    setTurn(initial, initial.currentPlayerId);
    const actor = player(initial, initial.currentPlayerId);
    const target = orderedOpponents(initial, actor.id)[0]!;
    target.generalId = "cao_cao";
    target.hp = 4;
    target.maxHp = 4;
    for (const candidate of initial.players) candidate.hand = [];
    target.judgment = [card("jianxiong-lightning", "shan_dian")];
    initial.deck = [{ ...card("jianxiong-lightning-judge", "slash"), suit: "spade", rank: 5 }];
    initial.discardPile = [];

    let current = applyAction(initial, { type: "end_play", playerId: actor.id });
    expect(current.pendingResponse).toMatchObject({
      type: "standard_skill",
      skillId: "jianxiong",
      damageOpportunity: { frameId: 1, damageId: 1 },
    });
    expect(current.completeRules.damageFlow.frames.at(-1)?.damage).toMatchObject({
      sourceId: null,
      physicalCardIds: ["jianxiong-lightning"],
    });
    expect(current.resolvingCards.map((candidate) => candidate.id)).toContain("jianxiong-lightning");
    if (current.pendingResponse?.type !== "standard_skill") throw new Error("Expected Jianxiong prompt");
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: target.id,
      promptId: current.pendingResponse.promptId,
      activate: true,
    });
    expect(player(current, target.id).hand.map((candidate) => candidate.id)).toContain("jianxiong-lightning");
    expect(current.resolvingCards.map((candidate) => candidate.id)).not.toContain("jianxiong-lightning");
    expect(current.discardPile.map((candidate) => candidate.id)).not.toContain("jianxiong-lightning");
  });

  it("preserves null Lightning attribution through elemental chain propagation", () => {
    const initial = createGame({ playerIds: ["a", "b", "c"], seed: seedFor(926) });
    neutralizeGeneralSkills(initial);
    setTurn(initial, initial.currentPlayerId);
    const actor = player(initial, initial.currentPlayerId);
    const [lightningOwner, chainedVictim] = orderedOpponents(initial, actor.id);
    if (!lightningOwner || !chainedVictim) throw new Error("Missing chained Lightning targets");
    actor.role = "rebel";
    lightningOwner.role = "lord";
    chainedVictim.role = "loyalist";
    for (const candidate of initial.players) candidate.hand = [];
    lightningOwner.hp = 4;
    lightningOwner.maxHp = 4;
    lightningOwner.chained = true;
    chainedVictim.hp = 1;
    chainedVictim.chained = true;
    lightningOwner.judgment = [card("chain-lightning", "shan_dian")];
    initial.deck = [
      card("chain-lightning-filler-1", "dodge"),
      card("chain-lightning-filler-2", "slash"),
      { ...card("chain-lightning-judge", "slash"), suit: "spade", rank: 5 },
    ];
    initial.discardPile = [];

    let current = applyAction(initial, { type: "end_play", playerId: actor.id });
    expect(current.pendingResponse).toMatchObject({
      type: "dying",
      victimId: chainedVictim.id,
      damageSourceId: null,
      resume: { type: "damage_flow", frameId: 2, damageId: 2, dyingId: 1 },
    });
    expect(current.completeRules.damageFlow.frames[0]?.callerContinuation).toMatchObject({
      type: "game_session.damage_resume.v1",
      data: { resume: { type: "turn_start" } },
    });
    expect(current.resolvingCards.map((candidate) => candidate.id)).toContain("chain-lightning");
    while (current.pendingResponse?.type === "dying") {
      current = applyAction(current, {
        type: "respond",
        playerId: current.pendingResponse.targetId,
        cardId: null,
      });
    }
    expect(player(current, chainedVictim.id).alive).toBe(false);
    expect(current.completeRules.damageFlow.frames).toEqual([]);
    expect(current.completeRules.damageFlow.completedDamageIds).toEqual([1, 2]);
    expect(current.resolvingCards.map((candidate) => candidate.id)).not.toContain("chain-lightning");
    expect(current.discardPile.filter((candidate) => candidate.id === "chain-lightning")).toHaveLength(1);
  });
});

describe("authority, immutability, and private projection", () => {
  it("normalizes persisted pre-metadata cards and turn fields during an upgrade", () => {
    const initial = createGame({ playerIds: ["a", "b"], seed: seedFor(9081) });
    const actor = player(initial, initial.currentPlayerId);
    const target = orderedOpponents(initial, actor.id)[0];
    if (!target) throw new Error("Missing target");
    const legacySlash = card("legacy-slash", "slash") as unknown as Record<string, unknown>;
    delete legacySlash.name;
    delete legacySlash.category;
    delete legacySlash.suit;
    delete legacySlash.rank;
    actor.hand = [legacySlash as unknown as Card];
    target.hand = [];
    const legacyTurn = initial.turn as unknown as Partial<TurnState>;
    delete legacyTurn.wineUsed;
    delete legacyTurn.slashDamageBonus;
    const targetHp = target.hp;

    const attacked = applyAction(initial, {
      type: "play_card",
      playerId: actor.id,
      cardId: "legacy-slash",
      targetId: target.id,
    });
    expect(attacked.turn).toMatchObject({ wineUsed: false, slashDamageBonus: 0 });
    expect(attacked.resolvingCards[0]).toMatchObject({
      name: "杀",
      category: "basic",
      suit: "spade",
      rank: 1,
    });
    const legacyPending = attacked.pendingResponse as unknown as Record<string, unknown>;
    delete legacyPending.slashKind;
    delete legacyPending.damage;
    delete legacyPending.nature;
    const resolved = applyAction(attacked, {
      type: "respond",
      playerId: target.id,
      cardId: null,
    });
    expect(player(resolved, target.id).hp).toBe(targetHp - 1);
    expect(resolved.resolvingCards).toEqual([]);
    expect(resolved.discardPile[0]).toMatchObject({ id: "legacy-slash", name: "杀" });
  });

  it("rejects active Dodge, invalid Duel targets, and responses with unknown cards", () => {
    const initial = createGame({ playerIds: ["a", "b", "c"], seed: seedFor(909) });
    const actor = player(initial, initial.currentPlayerId);
    const target = orderedOpponents(initial, actor.id)[0];
    if (!target) throw new Error("Missing target");
    actor.hand = [card("active-dodge", "dodge"), card("duel", "duel")];

    expectRuleError(
      () =>
        applyAction(initial, {
          type: "play_card",
          playerId: actor.id,
          cardId: "active-dodge",
        }),
      "INVALID_CARD",
    );
    expectRuleError(
      () =>
        applyAction(initial, {
          type: "play_card",
          playerId: actor.id,
          cardId: "duel",
          targetId: actor.id,
        }),
      "INVALID_TARGET",
    );
    const challenged = applyAction(initial, {
      type: "play_card",
      playerId: actor.id,
      cardId: "duel",
      targetId: target.id,
    });
    expectRuleError(
      () =>
        applyAction(challenged, {
          type: "respond",
          playerId: target.id,
          cardId: "not-owned",
        }),
      "CARD_NOT_FOUND",
    );
    expect(challenged.pendingResponse).not.toBeNull();
    expect(player(challenged, target.id).hand).toEqual(player(initial, target.id).hand);
  });

  it("hides hands, deck, RNG, and another player's actionable card IDs", () => {
    const initial = createGame({
      playerIds: ["a", "b", "c", "d"],
      seed: seedFor(910),
    });
    const actor = player(initial, initial.currentPlayerId);
    const [target, observer] = orderedOpponents(initial, actor.id);
    if (!target || !observer) throw new Error("Missing players");
    actor.hand = [card("public-duel", "duel")];
    target.hand = [card("private-slash", "slash"), card("private-peach", "peach")];

    const challenged = applyAction(initial, {
      type: "play_card",
      playerId: actor.id,
      cardId: "public-duel",
      targetId: target.id,
    });
    const targetView = getGameView(challenged, target.id);
    expect(targetView.prompt).toMatchObject({
      type: "respond",
      allowedCardIds: ["private-slash"],
    });
    expect(targetView.players.find((candidate) => candidate.id === target.id)?.hand).toEqual(
      player(challenged, target.id).hand,
    );

    const observerView = getGameView(challenged, observer.id);
    expect(observerView.prompt).toEqual({ type: "waiting" });
    expect(observerView.players.find((candidate) => candidate.id === target.id)).toMatchObject({
      hand: null,
      handCount: 2,
    });
    const serialized = JSON.stringify(observerView);
    expect(serialized).not.toContain("private-slash");
    expect(serialized).not.toContain("private-peach");
    expect(serialized).not.toContain(challenged.rng.key);
    expect(serialized).not.toContain(challenged.deck[0]?.id ?? "impossible-secret");
    expect("deck" in observerView).toBe(false);
    expect(JSON.parse(serialized)).toEqual(observerView);

    const pending = observerView.pendingResponse;
    expect(pending?.type).toBe("duel");
    expect("remainingTargetIds" in (pending as PendingMassAttackResponse)).toBe(false);
  });
});
