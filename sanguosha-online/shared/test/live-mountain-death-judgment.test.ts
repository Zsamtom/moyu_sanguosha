import { describe, expect, it } from "vitest";

import {
  GameRuleError,
  addStatusEffect,
  applyAction,
  beginDirectDeath,
  createGame,
  getCardDefinition,
  getEffectiveGeneralSkillIds,
  getGameView,
  grantSkill,
  type Card,
  type CardKind,
  type GamePlayer,
  type GameSession,
  type PlayerId,
} from "../src/index.js";

const seed = "9a".repeat(32);

function card(id: string, kind: CardKind, suit: Card["suit"] = "spade", rank: Card["rank"] = 7): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank };
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function setupPlayers(prefix: string): { game: GameSession; source: GamePlayer; victim: GamePlayer; others: GamePlayer[] } {
  const game = createGame({ playerIds: Array.from({ length: 4 }, (_value, index) => `${prefix}-${index + 1}`), seed });
  const source = game.players.find((player) => player.id === game.currentPlayerId)!;
  const victim = game.players[(source.seat + 1) % game.players.length]!;
  const others = game.players.filter((player) => player.id !== source.id && player.id !== victim.id)
    .sort((left, right) => left.seat - right.seat);
  for (const player of game.players) {
    player.generalId = "gan_ning";
    player.role = "loyalist";
    player.alive = true;
    player.hp = 4;
    player.maxHp = 4;
    player.hand = [];
    player.equipment = {};
    player.judgment = [];
    player.extraPiles = {};
    player.chained = false;
    player.faceUp = true;
  }
  source.role = "loyalist";
  victim.role = "renegade";
  others[0]!.role = "lord";
  others[1]!.role = "rebel";
  game.pendingResponse = null;
  game.resolvingCards = [];
  game.discardPile = [];
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
  return { game, source, victim, others };
}

function setupBeige(withGuicai = false) {
  const { game, source, victim, others } = setupPlayers("mountain-beige");
  const [owner, retrier] = others;
  owner!.generalId = "cai_wen_ji";
  owner!.hp = 3;
  owner!.maxHp = 3;
  owner!.hand = [card("beige-cost", "dodge", "heart", 2)];
  retrier!.generalId = withGuicai ? "si_ma_yi" : "gan_ning";
  retrier!.hand = withGuicai ? [card("beige-retrial", "dodge", "diamond", 9)] : [];
  source.hand = [
    card("beige-slash", "slash", "spade", 6),
    card("beige-source-1", "dodge", "club", 3),
    card("beige-source-2", "peach", "heart", 4),
  ];
  return { game, source, victim, owner: owner!, retrier: retrier! };
}

function reachBeigePrompt(game: GameSession, sourceId: PlayerId, victimId: PlayerId): GameSession {
  let current = applyAction(game, {
    type: "play_card",
    playerId: sourceId,
    cardId: "beige-slash",
    targetId: victimId,
  });
  current = applyAction(current, { type: "respond", playerId: victimId, cardId: null });
  expect(current.pendingResponse).toMatchObject({
    type: "standard_skill",
    skillId: "beige",
    stage: "beige_cost",
  });
  return current;
}

function resolveBeigeCost(game: GameSession, ownerId: PlayerId): GameSession {
  const pending = game.pendingResponse;
  if (pending?.type !== "standard_skill" || pending.skillId !== "beige") throw new Error("expected Beige cost prompt");
  return applyAction(game, {
    type: "resolve_standard_skill",
    playerId: ownerId,
    promptId: pending.promptId,
    activate: true,
    cardId: "beige-cost",
  });
}

function passAllDying(game: GameSession): GameSession {
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

describe("live Mountain death and judgment skills", () => {
  it("Beige pays exactly one owned card, survives JSON, and uses the final Guicai-retrial suit", () => {
    const { game, source, victim, owner, retrier } = setupBeige(true);
    game.deck = [
      card("beige-draw-1", "peach", "heart", 5),
      card("beige-draw-2", "dodge", "club", 8),
      card("beige-original-judge", "slash", "spade", 11),
    ];
    let current = reachBeigePrompt(game, source.id, victim.id);
    const costPrompt = current.pendingResponse;
    if (costPrompt?.type !== "standard_skill") throw new Error("expected Beige cost prompt");
    expect(() => applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: costPrompt.promptId,
      activate: true,
      cardIds: ["beige-cost"],
    })).toThrow(GameRuleError);

    current = resolveBeigeCost(current, owner.id);
    const retrialPrompt = getGameView(current, retrier.id).prompt;
    expect(retrialPrompt).toMatchObject({ type: "standard_skill", skillId: "guicai", stage: "judgment_retrial" });
    if (retrialPrompt.type !== "standard_skill") throw new Error("expected Guicai prompt");
    current = applyAction(jsonClone(current), {
      type: "resolve_standard_skill",
      playerId: retrier.id,
      promptId: retrialPrompt.promptId,
      activate: true,
      cardId: "beige-retrial",
    });

    expect(current.players.find((player) => player.id === victim.id)).toMatchObject({ hp: 3 });
    expect(current.players.find((player) => player.id === victim.id)?.hand.map((entry) => entry.id))
      .toEqual(expect.arrayContaining(["beige-draw-1", "beige-draw-2"]));
    expect(current.discardPile.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      "beige-cost", "beige-original-judge", "beige-retrial",
    ]));
    expect(current.completeRules.damageFlow.frames).toEqual([]);
    expect(current.completeRules.damageFlow.consumedActions.filter((entry) => entry.opportunityId.includes(":beige:")))
      .toHaveLength(1);
  });

  it.each([
    ["heart" as const, "recover"],
    ["spade" as const, "turn_over"],
  ])("settles Beige %s on the live victim/source", (suit, expected) => {
    const { game, source, victim, owner } = setupBeige();
    game.deck = [card(`beige-${suit}-judge`, "dodge", suit, 10)];
    const resolved = resolveBeigeCost(reachBeigePrompt(game, source.id, victim.id), owner.id);
    if (expected === "recover") expect(resolved.players.find((player) => player.id === victim.id)?.hp).toBe(4);
    else expect(resolved.players.find((player) => player.id === source.id)?.faceUp).toBe(false);
    expect(resolved.completeRules.damageFlow.frames).toEqual([]);
  });

  it("keeps the Club source discard mandatory, frozen, tamper-evident, and resumes DamageFlow once", () => {
    const { game, source, victim, owner } = setupBeige();
    game.deck = [card("beige-club-judge", "dodge", "club", 12)];
    const current = resolveBeigeCost(reachBeigePrompt(game, source.id, victim.id), owner.id);
    const pending = current.pendingResponse;
    expect(pending).toMatchObject({ type: "standard_skill", skillId: "beige", stage: "beige_source_discard" });
    if (pending?.type !== "standard_skill" || pending.skillId !== "beige") throw new Error("expected Beige Club discard");
    const prompt = getGameView(current, source.id).prompt;
    expect(prompt).toMatchObject({ type: "standard_skill", minCards: 2, maxCards: 2, canPass: false });

    const tampered = jsonClone(current);
    if (tampered.pendingResponse?.type !== "standard_skill") throw new Error("expected frozen source cards");
    (tampered.pendingResponse.selectedCardIds as string[]).push("forged-source-card");
    expect(() => applyAction(tampered, {
      type: "resolve_standard_skill",
      playerId: source.id,
      promptId: pending.promptId,
      activate: true,
      cardIds: ["beige-source-1", "beige-source-2"],
    })).toThrow(/篡改/);
    expect(() => applyAction(current, {
      type: "resolve_standard_skill",
      playerId: source.id,
      promptId: pending.promptId,
      activate: true,
      cardIds: ["beige-source-1"],
    })).toThrow(GameRuleError);

    const resolved = applyAction(jsonClone(current), {
      type: "resolve_standard_skill",
      playerId: source.id,
      promptId: pending.promptId,
      activate: true,
      cardIds: ["beige-source-1", "beige-source-2"],
    });
    expect(resolved.players.find((player) => player.id === source.id)?.hand).toEqual([]);
    expect(resolved.completeRules.damageFlow.frames).toEqual([]);
    expect(resolved.completeRules.damageFlow.consumedActions.filter((entry) => entry.opportunityId.includes(":beige:")))
      .toHaveLength(1);
  });

  it.each(["lianying", "xiaoji"] as const)(
    "settles %s after the Club discard before resuming the same consumed Beige opportunity",
    (afterMoveSkill) => {
      const { game, source, victim, owner } = setupBeige();
      source.generalId = afterMoveSkill === "lianying" ? "lu_xun" : "sun_shang_xiang";
      if (afterMoveSkill === "xiaoji") {
        source.hand = [
          card("beige-slash", "slash", "spade", 6),
          card("beige-source-1", "dodge", "club", 3),
        ];
        source.equipment = { weapon: card("beige-source-2", "qing_gang_jian", "spade", 6) };
      }
      game.deck = [card(`beige-club-${afterMoveSkill}`, "dodge", "club", 5)];
      let current = resolveBeigeCost(reachBeigePrompt(game, source.id, victim.id), owner.id);
      const pending = current.pendingResponse;
      if (pending?.type !== "standard_skill" || pending.skillId !== "beige") throw new Error("expected Beige Club discard");
      current = applyAction(current, {
        type: "resolve_standard_skill",
        playerId: source.id,
        promptId: pending.promptId,
        activate: true,
        cardIds: ["beige-source-1", "beige-source-2"],
      });
      expect(current.pendingResponse).toMatchObject({ type: "skill_choice", skillId: afterMoveSkill });
      expect(current.completeRules.damageFlow.frames).toHaveLength(1);
      expect(current.completeRules.damageFlow.consumedActions.filter((entry) => entry.opportunityId.includes(":beige:")))
        .toHaveLength(1);
      if (current.pendingResponse?.type !== "skill_choice") throw new Error("expected after-move prompt");
      current = applyAction(jsonClone(current), {
        type: "resolve_skill",
        playerId: source.id,
        skillId: afterMoveSkill,
        activate: false,
        promptId: current.pendingResponse.promptId,
      });
      expect(current.completeRules.damageFlow.frames).toEqual([]);
      expect(current.completeRules.damageFlow.consumedActions.filter((entry) => entry.opportunityId.includes(":beige:")))
        .toHaveLength(1);
    },
  );

  it("settles a Heart Beige recovery through Buqu wound removal before completing DamageFlow", () => {
    const { game, source, victim, owner } = setupBeige();
    victim.generalId = "zhou_tai";
    victim.hp = 1;
    game.deck = [
      card("beige-buqu-heart", "dodge", "heart", 6),
      card("beige-buqu-wound", "slash", "club", 9),
    ];
    let current = applyAction(game, {
      type: "play_card",
      playerId: source.id,
      cardId: "beige-slash",
      targetId: victim.id,
    });
    current = applyAction(current, { type: "respond", playerId: victim.id, cardId: null });
    const entry = getGameView(current, victim.id).prompt;
    if (entry.type !== "skill_choice" || entry.skillId !== "buqu" || !entry.promptId) {
      throw new Error("expected Buqu entry prompt");
    }
    current = applyAction(current, {
      type: "resolve_skill",
      playerId: victim.id,
      skillId: "buqu",
      activate: true,
      promptId: entry.promptId,
    });
    expect(current.pendingResponse).toMatchObject({ type: "standard_skill", skillId: "beige", stage: "beige_cost" });
    current = resolveBeigeCost(current, owner.id);
    const recovery = getGameView(current, victim.id).prompt;
    expect(recovery).toMatchObject({
      type: "standard_skill",
      skillId: "buqu",
      stage: "buqu_recovery",
      canPass: false,
    });
    expect(current.completeRules.damageFlow.frames).toHaveLength(1);
    if (recovery.type !== "standard_skill") throw new Error("expected Buqu recovery prompt");
    current = applyAction(jsonClone(current), {
      type: "resolve_standard_skill",
      playerId: victim.id,
      promptId: recovery.promptId,
      activate: true,
      cardId: "beige-buqu-wound",
    });
    expect(current.players.find((player) => player.id === victim.id)).toMatchObject({ alive: true, hp: 1 });
    expect(current.players.find((player) => player.id === victim.id)?.extraPiles.buqu).toEqual([]);
    expect(current.completeRules.damageFlow.frames).toEqual([]);
    expect(current.completeRules.damageFlow.consumedActions.filter((entry) => entry.opportunityId.includes(":beige:")))
      .toHaveLength(1);
  });

  it("resolves Duanchang in DeathStack before rewards and removes every current effective skill snapshot", () => {
    const { game, source, victim, others } = setupPlayers("mountain-duanchang");
    source.generalId = "zhu_ge_liang";
    source.hand = [card("duanchang-slash", "slash", "spade", 7)];
    victim.generalId = "cai_wen_ji";
    victim.hp = 1;
    victim.maxHp = 3;
    let current = applyAction(game, {
      type: "play_card",
      playerId: source.id,
      cardId: "duanchang-slash",
      targetId: victim.id,
    });
    current = applyAction(current, { type: "respond", playerId: victim.id, cardId: null });
    current = passAllDying(current);

    expect(current.players.find((player) => player.id === victim.id)).toMatchObject({ alive: false, hp: 0 });
    expect(getEffectiveGeneralSkillIds(current, source.id)).toEqual([]);
    expect(current.completeRules.lifecycle.skillLosses).toEqual([
      expect.objectContaining({
        ownerId: source.id,
        sourcePlayerId: victim.id,
        sourceSkillId: "duanchang",
        skillIds: ["guanxing", "kongcheng"],
      }),
    ]);
    expect(current.completeRules.death.frames).toEqual([]);

    const challengerId = others[1]!.id;
    const challenger = current.players.find((player) => player.id === challengerId)!;
    challenger.hand = [card("duanchang-duel", "duel", "diamond", 6)];
    current.currentPlayerId = challenger.id;
    current.turn = { ...current.turn, playerId: challenger.id, phase: "play", skillUseCounts: {} };
    const play = getGameView(current, challenger.id).prompt;
    if (play.type !== "play") throw new Error("expected challenger play prompt");
    expect(play.cards.find((entry) => entry.cardId === "duanchang-duel")?.targetIds).toContain(source.id);

    grantSkill(current.completeRules.lifecycle, {
      ownerId: source.id,
      skillId: "kongcheng",
      sourcePlayerId: source.id,
      sourceSkillId: "later_grant",
      expiry: { type: "permanent" },
    });
    expect(getEffectiveGeneralSkillIds(current, source.id)).toEqual(["kongcheng"]);
    const protectedPlay = getGameView(current, challenger.id).prompt;
    if (protectedPlay.type !== "play") throw new Error("expected challenger play prompt");
    expect(protectedPlay.cards.find((entry) => entry.cardId === "duanchang-duel")?.targetIds).not.toContain(source.id);
  });

  it("does not invent a Duanchang victim for source-less direct death", () => {
    const { game, victim, source } = setupPlayers("mountain-duanchang-null");
    victim.generalId = "cai_wen_ji";
    victim.hp = 0;
    victim.maxHp = 0;
    source.generalId = "zhu_ge_liang";
    beginDirectDeath(game, victim.id, { type: "finish_effect" });
    expect(game.completeRules.lifecycle.skillLosses).toEqual([]);
    expect(getEffectiveGeneralSkillIds(game, source.id)).toEqual(["guanxing", "kongcheng"]);
    expect(game.completeRules.death.frames).toEqual([]);
  });

  it("stops projecting an existing Huashen identity and grant after Duanchang removes that snapshot", () => {
    const { game, source, victim, others } = setupPlayers("mountain-duanchang-huashen");
    source.generalId = "zuo_ci";
    source.hp = 3;
    source.maxHp = 3;
    source.hand = [card("duanchang-huashen-slash", "slash", "spade", 8)];
    victim.generalId = "cai_wen_ji";
    victim.hp = 1;
    victim.maxHp = 3;
    for (const generalId of ["cao_cao", "liu_bei"]) {
      addStatusEffect(game.completeRules.lifecycle, {
        ownerId: source.id,
        kind: "huashen_form",
        sourcePlayerId: source.id,
        sourceSkillId: "huashen",
        payload: { generalId },
        visibility: "server_only",
        expiry: { type: "permanent" },
      });
    }
    addStatusEffect(game.completeRules.lifecycle, {
      ownerId: source.id,
      kind: "huashen_selected",
      sourcePlayerId: source.id,
      sourceSkillId: "huashen",
      payload: { generalId: "cao_cao", skillId: "jianxiong" },
      visibility: "server_only",
      expiry: { type: "permanent" },
    });
    grantSkill(game.completeRules.lifecycle, {
      ownerId: source.id,
      skillId: "jianxiong",
      sourcePlayerId: source.id,
      sourceSkillId: "huashen",
      expiry: { type: "permanent" },
    });
    expect(getGameView(game, others[0]!.id).players.find((player) => player.id === source.id)?.general?.id)
      .toBe("cao_cao");

    let current = applyAction(game, {
      type: "play_card",
      playerId: source.id,
      cardId: "duanchang-huashen-slash",
      targetId: victim.id,
    });
    current = applyAction(current, { type: "respond", playerId: victim.id, cardId: null });
    current = passAllDying(current);
    const publicSource = getGameView(current, others[0]!.id).players.find((player) => player.id === source.id)!;
    expect(publicSource.general?.id).toBe("zuo_ci");
    expect(publicSource.effectiveSkillIds).toEqual([]);
    expect(current.completeRules.lifecycle.grants.filter((grant) =>
      grant.ownerId === source.id && grant.sourceSkillId === "huashen")).toEqual([]);
    expect(current.completeRules.lifecycle.skillLosses[0]?.skillIds)
      .toEqual(["huashen", "xinsheng", "jianxiong"]);
  });
});
