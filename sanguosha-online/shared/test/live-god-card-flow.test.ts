import { describe, expect, it } from "vitest";

import {
  addMark,
  applyAction,
  createGame,
  decodeGameDamageContinuation,
  distanceBetweenPlayers,
  encodeGameDamageContinuation,
  forfeitPlayer,
  getCardDefinition,
  getGameView,
  getEffectiveGeneralSkillIds,
  grantSkill,
  handLimitFor,
  markCount,
  type Card,
  type CardKind,
  type GamePlayer,
  type GameAction,
  type GameSession,
  type GeneralSkillId,
} from "../src/index.js";

const seed = "9b".repeat(32);

function card(id: string, kind: CardKind, suit: Card["suit"] = "club", rank: Card["rank"] = 7): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank };
}

function setup(count = 4): { game: GameSession; owner: GamePlayer; others: GamePlayer[] } {
  const game = createGame({
    playerIds: Array.from({ length: count }, (_value, index) => `god-b-${index + 1}`),
    seed,
  });
  const owner = game.players.find((player) => player.id === game.currentPlayerId)!;
  const ownerIndex = game.players.findIndex((player) => player.id === owner.id);
  const others = Array.from({ length: count - 1 }, (_value, offset) =>
    game.players[(ownerIndex + offset + 1) % count]!,
  );
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
  game.virtualCardOrigins = {};
  game.pendingResponse = null;
  game.afterMove = { queuedRecoveries: [], queuedTriggers: [], suspendedPhase: null, suspendedResponse: null };
  game.turn = {
    ...game.turn,
    playerId: owner.id,
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
  return { game, owner, others };
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

function passAllDyingResponses(game: GameSession): GameSession {
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

describe("live God card flow", () => {
  it("composes Juejing with draw modifiers and hand limit", () => {
    const { game, owner, others: [juejing] } = setup();
    if (!juejing) throw new Error("Missing Juejing fixture");
    grant(game, juejing, "juejing");
    juejing.hp = 2;
    juejing.maxHp = 4;
    game.deck = [
      card("juejing-draw-4", "slash"),
      card("juejing-draw-3", "dodge"),
      card("juejing-draw-2", "peach"),
      card("juejing-draw-1", "wine"),
    ];

    const current = applyAction(game, { type: "end_play", playerId: owner.id });
    const live = current.players.find((player) => player.id === juejing.id)!;
    expect(current.currentPlayerId).toBe(juejing.id);
    expect(live.hand).toHaveLength(4);
    expect(handLimitFor(current, juejing.id)).toBe(4);
  });

  it("adds Feiying only to incoming distance", () => {
    const { game, owner, others: [target] } = setup(3);
    if (!target) throw new Error("Missing Feiying fixture");
    grant(game, target, "feiying");

    expect(distanceBetweenPlayers(game, owner.id, target.id)).toBe(2);
    expect(distanceBetweenPlayers(game, target.id, owner.id)).toBe(1);
  });

  it("uses an effective-Heart hand card as Slash at unlimited distance and survives JSON restore", () => {
    const { game, owner, others } = setup();
    const distant = others[1];
    if (!distant) throw new Error("Missing distant Wushen target");
    grant(game, owner, "wushen");
    owner.hand = [card("wushen-heart", "dodge", "heart")];

    const prompt = getGameView(game, owner.id).prompt;
    if (prompt.type !== "play") throw new Error("Expected play prompt");
    expect(prompt.skills.find((skill) => skill.skillId === "wushen")).toMatchObject({
      cardIds: ["wushen-heart"],
      targetIds: expect.arrayContaining([distant.id]),
      virtualCardKind: "slash",
    });

    let current = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "wushen",
      cardIds: ["wushen-heart"],
      targetId: distant.id,
    });
    current = JSON.parse(JSON.stringify(current)) as GameSession;
    expect(current.pendingResponse).toMatchObject({ type: "slash", targetId: distant.id });
    current = applyAction(current, { type: "respond", playerId: distant.id, cardId: null });
    expect(current.players.find((player) => player.id === distant.id)?.hp).toBe(3);
    expect(current.discardPile).toContainEqual(expect.objectContaining({ id: "wushen-heart", kind: "dodge" }));
  });

  it("lets a physical effective-Heart Slash ignore distance and replaces other Heart card responses", () => {
    const direct = setup();
    const distant = direct.others[1]!;
    grant(direct.game, direct.owner, "wushen");
    direct.owner.hand = [card("wushen-slash", "slash", "heart")];
    expect(() => applyAction(direct.game, {
      type: "play_card",
      playerId: direct.owner.id,
      cardId: "wushen-slash",
      targetId: distant.id,
    })).not.toThrow();

    const duel = setup();
    const responder = duel.others[0]!;
    grant(duel.game, responder, "wushen");
    duel.owner.hand = [card("wushen-duel", "duel", "spade")];
    responder.hand = [card("wushen-response", "dodge", "heart")];
    let current = applyAction(duel.game, {
      type: "play_card",
      playerId: duel.owner.id,
      cardId: "wushen-duel",
      targetId: responder.id,
    });
    const prompt = getGameView(current, responder.id).prompt;
    expect(prompt).toMatchObject({
      type: "respond",
      responseKind: "slash",
      skillResponses: expect.arrayContaining([
        expect.objectContaining({ skillId: "wushen", cardIds: ["wushen-response"] }),
      ]),
    });
    current = applyAction(current, {
      type: "use_skill",
      playerId: responder.id,
      skillId: "wushen",
      cardIds: ["wushen-response"],
    });
    expect(current.pendingResponse).toMatchObject({ type: "duel", targetId: duel.owner.id });
    expect(() => applyAction(current, { type: "respond", playerId: duel.owner.id, cardId: null })).not.toThrow();
  });

  it("locks every effective-Heart hand card to ordinary Slash instead of its printed identity or nature", () => {
    const elemental = setup();
    const target = elemental.others[0]!;
    grant(elemental.game, elemental.owner, "wushen");
    elemental.owner.hand = [card("wushen-fire", "fire_slash", "heart")];
    let prompt = getGameView(elemental.game, elemental.owner.id).prompt;
    if (prompt.type !== "play") throw new Error("Expected Wushen play prompt");
    expect(prompt.cards).not.toContainEqual(expect.objectContaining({ cardId: "wushen-fire" }));
    let current = applyAction(elemental.game, {
      type: "use_skill",
      playerId: elemental.owner.id,
      skillId: "wushen",
      cardIds: ["wushen-fire"],
      targetId: target.id,
    });
    expect(current.pendingResponse).toMatchObject({
      type: "slash",
      slashKind: "slash",
      nature: "normal",
    });
    current = applyAction(current, { type: "respond", playerId: target.id, cardId: null });
    expect(current.discardPile).toContainEqual(expect.objectContaining({ id: "wushen-fire", kind: "fire_slash" }));

    const original = setup();
    grant(original.game, original.owner, "wushen");
    original.owner.hp = 3;
    original.owner.hand = [card("wushen-peach", "peach", "heart")];
    prompt = getGameView(original.game, original.owner.id).prompt;
    if (prompt.type !== "play") throw new Error("Expected locked Wushen prompt");
    expect(prompt.cards).not.toContainEqual(expect.objectContaining({ cardId: "wushen-peach", kind: "peach" }));
    expect(() => applyAction(original.game, {
      type: "play_card",
      playerId: original.owner.id,
      cardId: "wushen-peach",
      targetId: original.owner.id,
    })).toThrow();
  });

  it("excludes locked Heart Dodge, Peach, Wine, and Nullification from their original response windows", () => {
    const dodge = setup();
    const defender = dodge.others[0]!;
    grant(dodge.game, defender, "wushen");
    dodge.owner.hand = [card("wushen-test-slash", "slash", "club")];
    defender.hand = [card("wushen-dodge", "dodge", "heart")];
    let current = applyAction(dodge.game, {
      type: "play_card",
      playerId: dodge.owner.id,
      cardId: "wushen-test-slash",
      targetId: defender.id,
    });
    let prompt = getGameView(current, defender.id).prompt;
    expect(prompt).toMatchObject({ type: "respond", dodgeCardIds: [] });
    expect(() => applyAction(current, { type: "respond", playerId: defender.id, cardId: "wushen-dodge" })).toThrow();

    const dying = setup();
    const victim = dying.others[0]!;
    grant(dying.game, victim, "wushen");
    victim.hp = 1;
    dying.owner.hand = [card("wushen-dying-slash", "slash", "club")];
    victim.hand = [
      card("wushen-dying-peach", "peach", "heart"),
      card("wushen-dying-wine", "wine", "heart"),
    ];
    current = applyAction(dying.game, {
      type: "play_card",
      playerId: dying.owner.id,
      cardId: "wushen-dying-slash",
      targetId: victim.id,
    });
    current = applyAction(current, { type: "respond", playerId: victim.id, cardId: null });
    prompt = getGameView(current, victim.id).prompt;
    expect(prompt).toMatchObject({ type: "dying", peachCardIds: [], wineCardIds: [], allowedCardIds: [] });
    expect(() => applyAction(current, {
      type: "respond",
      playerId: victim.id,
      cardId: "wushen-dying-peach",
    })).toThrow();

    const wuxie = setup();
    const responder = wuxie.others[0]!;
    grant(wuxie.game, responder, "wushen");
    wuxie.owner.hand = [card("wushen-trick", "ex_nihilo", "diamond")];
    responder.hand = [
      card("wushen-heart-wuxie", "wu_xie_ke_ji", "heart"),
      card("wushen-spade-wuxie", "wu_xie_ke_ji", "spade"),
    ];
    wuxie.game.deck = [card("wushen-draw-2", "peach"), card("wushen-draw-1", "dodge")];
    current = applyAction(wuxie.game, {
      type: "play_card",
      playerId: wuxie.owner.id,
      cardId: "wushen-trick",
    });
    prompt = getGameView(current, responder.id).prompt;
    expect(prompt).toMatchObject({
      type: "nullification",
      allowedCardIds: ["wushen-spade-wuxie"],
    });
    expect(() => applyAction(current, {
      type: "respond",
      playerId: responder.id,
      cardId: "wushen-heart-wuxie",
    })).toThrow();
  });

  it("spends Rage for Wuqian, grants temporary Wushuang, and invalidates physical or virtual armor through turn end", () => {
    const physical = setup();
    const target = physical.others[0]!;
    grant(physical.game, physical.owner, "wuqian");
    addMark(physical.game.completeRules.lifecycle, {
      markId: "rage",
      ownerId: physical.owner.id,
      sourcePlayerId: physical.owner.id,
      sourceSkillId: "kuangbao",
      amount: 2,
      visibility: "public",
      expiry: { type: "permanent" },
    });
    physical.owner.hand = [card("wuqian-black-slash", "slash", "spade")];
    target.equipment.armor = card("wuqian-renwang", "ren_wang_dun", "club");

    let current = applyAction(physical.game, {
      type: "use_skill",
      playerId: physical.owner.id,
      skillId: "wuqian",
      targetId: target.id,
    });
    current = JSON.parse(JSON.stringify(current)) as GameSession;
    expect(markCount(current.completeRules.lifecycle, {
      ownerId: physical.owner.id,
      markId: "rage",
      sourcePlayerId: physical.owner.id,
      sourceSkillId: "kuangbao",
    })).toBe(0);
    expect(getEffectiveGeneralSkillIds(current, physical.owner.id)).toContain("wushuang");
    current = applyAction(current, {
      type: "play_card",
      playerId: physical.owner.id,
      cardId: "wuqian-black-slash",
      targetId: target.id,
    });
    expect(current.pendingResponse).toMatchObject({
      type: "slash",
      targetId: target.id,
      requiredDodgeCount: 2,
    });

    const virtual = setup();
    const bazhen = virtual.others[0]!;
    grant(virtual.game, virtual.owner, "wuqian");
    grant(virtual.game, bazhen, "bazhen");
    addMark(virtual.game.completeRules.lifecycle, {
      markId: "rage",
      ownerId: virtual.owner.id,
      sourcePlayerId: virtual.owner.id,
      sourceSkillId: "kuangbao",
      amount: 2,
      visibility: "public",
      expiry: { type: "permanent" },
    });
    virtual.owner.hand = [card("wuqian-bazhen-slash", "slash", "diamond")];
    current = applyAction(virtual.game, {
      type: "use_skill",
      playerId: virtual.owner.id,
      skillId: "wuqian",
      targetId: bazhen.id,
    });
    current = applyAction(current, {
      type: "play_card",
      playerId: virtual.owner.id,
      cardId: "wuqian-bazhen-slash",
      targetId: bazhen.id,
    });
    expect(getGameView(current, bazhen.id).prompt.type).toBe("respond");

    const expiry = setup();
    grant(expiry.game, expiry.owner, "wuqian");
    addMark(expiry.game.completeRules.lifecycle, {
      markId: "rage",
      ownerId: expiry.owner.id,
      sourcePlayerId: expiry.owner.id,
      sourceSkillId: "kuangbao",
      amount: 2,
      visibility: "public",
      expiry: { type: "permanent" },
    });
    current = applyAction(expiry.game, {
      type: "use_skill",
      playerId: expiry.owner.id,
      skillId: "wuqian",
      targetId: expiry.owner.id,
    });
    expect(getEffectiveGeneralSkillIds(current, expiry.owner.id)).toContain("wushuang");
    current = applyAction(current, { type: "end_play", playerId: expiry.owner.id });
    expect(getEffectiveGeneralSkillIds(current, expiry.owner.id)).not.toContain("wushuang");
    expect(current.completeRules.lifecycle.effects.some((effect) => effect.sourceSkillId === "wuqian")).toBe(false);
    expect(current.logs.filter((entry) => entry.message === `${expiry.owner.id} 的回合结束。`)).toHaveLength(1);
  });

  it("runs the full turn-end boundary when the active player forfeits", () => {
    const { game, owner, others: [next, lord, rebel] } = setup();
    if (!next || !lord || !rebel) throw new Error("Missing active-forfeit fixtures");
    owner.role = "loyalist";
    next.role = "rebel";
    lord.role = "lord";
    rebel.role = "rebel";
    grant(game, owner, "wuqian");
    addMark(game.completeRules.lifecycle, {
      markId: "rage",
      ownerId: owner.id,
      sourcePlayerId: owner.id,
      sourceSkillId: "kuangbao",
      amount: 2,
      visibility: "public",
      expiry: { type: "permanent" },
    });

    let current = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "wuqian",
      targetId: next.id,
    });
    grantSkill(current.completeRules.lifecycle, {
      ownerId: owner.id,
      skillId: "wansha",
      sourcePlayerId: owner.id,
      sourceSkillId: "jilue",
      expiry: { type: "turn_end", turnId: current.turn.number },
    });
    expect(getEffectiveGeneralSkillIds(current, owner.id)).toEqual(expect.arrayContaining(["wushuang", "wansha"]));
    expect(current.completeRules.lifecycle.effects).toEqual(expect.arrayContaining([
      expect.objectContaining({ ownerId: next.id, kind: "armor_invalid", sourceSkillId: "wuqian" }),
    ]));

    const endedTurn = current.turn.number;
    current = forfeitPlayer(JSON.parse(JSON.stringify(current)) as GameSession, owner.id);

    expect(current.status).toBe("playing");
    expect(current.currentPlayerId).toBe(next.id);
    expect(current.turn).toMatchObject({
      number: endedTurn + 1,
      playerId: next.id,
      normalTurnAnchorPlayerId: null,
    });
    expect(getEffectiveGeneralSkillIds(current, owner.id)).not.toEqual(expect.arrayContaining(["wushuang", "wansha"]));
    expect(current.completeRules.lifecycle.effects.some((effect) =>
      effect.sourceSkillId === "wuqian" && effect.kind === "armor_invalid"
    )).toBe(false);
    expect(current.logs.filter((entry) => entry.message === `${owner.id} 的回合结束。`)).toHaveLength(1);
  });

  it("keeps repeated Wuqian targets cumulative without duplicate lifecycle state and rejects extra payload", () => {
    const { game, owner, others: [first, second] } = setup();
    if (!first || !second) throw new Error("Missing repeated Wuqian targets");
    grant(game, owner, "wuqian");
    addMark(game.completeRules.lifecycle, {
      markId: "rage",
      ownerId: owner.id,
      sourcePlayerId: owner.id,
      sourceSkillId: "kuangbao",
      amount: 6,
      visibility: "public",
      expiry: { type: "permanent" },
    });
    expect(() => applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "wuqian",
      targetId: first.id,
      forged: true,
    } as unknown as GameAction)).toThrow();

    let current = game;
    for (const targetId of [first.id, second.id, first.id]) {
      current = applyAction(current, {
        type: "use_skill",
        playerId: owner.id,
        skillId: "wuqian",
        targetId,
      });
      current = JSON.parse(JSON.stringify(current)) as GameSession;
    }
    expect(markCount(current.completeRules.lifecycle, {
      ownerId: owner.id,
      markId: "rage",
      sourcePlayerId: owner.id,
      sourceSkillId: "kuangbao",
    })).toBe(0);
    expect(current.completeRules.lifecycle.effects.filter((effect) => effect.sourceSkillId === "wuqian"))
      .toHaveLength(2);
    expect(current.completeRules.lifecycle.grants.filter((entry) =>
      entry.sourceSkillId === "wuqian" && entry.skillId === "wushuang"
    )).toHaveLength(1);
  });

  it("pays Wumou after committing an ordinary trick, restores through JSON, and resolves it exactly once", () => {
    const { game, owner } = setup();
    grant(game, owner, "wumou");
    addMark(game.completeRules.lifecycle, {
      markId: "rage",
      ownerId: owner.id,
      sourcePlayerId: owner.id,
      sourceSkillId: "kuangbao",
      amount: 1,
      visibility: "public",
      expiry: { type: "permanent" },
    });
    owner.hand = [card("wumou-ex-nihilo", "ex_nihilo", "heart")];
    game.deck = [card("wumou-draw-2", "peach"), card("wumou-draw-1", "dodge")];

    let current = applyAction(game, {
      type: "play_card",
      playerId: owner.id,
      cardId: "wumou-ex-nihilo",
    });
    expect(current.players.find((player) => player.id === owner.id)?.hand).toHaveLength(0);
    expect(current.resolvingCards).toContainEqual(expect.objectContaining({ id: "wumou-ex-nihilo" }));
    current = JSON.parse(JSON.stringify(current)) as GameSession;
    const prompt = standardPrompt(current, owner.id);
    expect(prompt).toMatchObject({
      skillId: "wumou",
      stage: "wumou_choice",
      canPass: false,
      options: ["remove_rage", "lose_hp"],
    });
    const action = {
      type: "resolve_standard_skill" as const,
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      tokens: ["remove_rage"],
    };
    const commitment = current.completeRules.lifecycle.effects.find((effect) =>
      effect.kind === "wumou_commitment");
    if (!commitment) throw new Error("Expected Wumou commitment");
    const forgedExpiry = JSON.parse(JSON.stringify(current)) as GameSession;
    const forgedIndex = forgedExpiry.completeRules.lifecycle.effects.findIndex((effect) =>
      effect.effectId === commitment.effectId);
    forgedExpiry.completeRules.lifecycle.effects[forgedIndex] = {
      ...forgedExpiry.completeRules.lifecycle.effects[forgedIndex]!,
      expiry: { type: "game_end" },
    };
    expect(() => applyAction(forgedExpiry, action)).toThrow(/无谋续体.*承诺/);

    const shadowed = JSON.parse(JSON.stringify(current)) as GameSession;
    const shadowEffectId = shadowed.completeRules.lifecycle.nextEffectId;
    shadowed.completeRules.lifecycle.nextEffectId += 1;
    shadowed.completeRules.lifecycle.effects.push({
      ...commitment,
      effectId: shadowEffectId,
      payload: { ...commitment.payload, commitment: `${commitment.payload.commitment}:shadow` },
    });
    expect(() => applyAction(shadowed, action)).toThrow(/无谋续体.*承诺/);

    current = applyAction(current, action);
    expect(markCount(current.completeRules.lifecycle, {
      ownerId: owner.id,
      markId: "rage",
      sourcePlayerId: owner.id,
      sourceSkillId: "kuangbao",
    })).toBe(0);
    expect(current.players.find((player) => player.id === owner.id)?.hand.map((candidate) => candidate.id))
      .toEqual(["wumou-draw-1", "wumou-draw-2"]);
    expect(current.discardPile.filter((candidate) => candidate.id === "wumou-ex-nihilo")).toHaveLength(1);
    expect(current.completeRules.lifecycle.effects.some((effect) => effect.kind === "wumou_commitment")).toBe(false);
    expect(() => applyAction(current, action)).toThrow();
  });

  it("does not trigger Wumou for delayed tricks, recasts, or rejected declarations", () => {
    const delayed = setup();
    const target = delayed.others[0]!;
    grant(delayed.game, delayed.owner, "wumou");
    addMark(delayed.game.completeRules.lifecycle, {
      markId: "rage",
      ownerId: delayed.owner.id,
      sourcePlayerId: delayed.owner.id,
      sourceSkillId: "kuangbao",
      amount: 1,
      visibility: "public",
      expiry: { type: "permanent" },
    });
    delayed.owner.hand = [card("wumou-delayed", "le_bu_si_shu", "spade")];
    let current = applyAction(delayed.game, {
      type: "play_card",
      playerId: delayed.owner.id,
      cardId: "wumou-delayed",
      targetId: target.id,
    });
    expect(current.pendingResponse?.type).not.toBe("standard_skill");
    expect(current.players.find((player) => player.id === target.id)?.judgment)
      .toContainEqual(expect.objectContaining({ id: "wumou-delayed" }));
    expect(markCount(current.completeRules.lifecycle, {
      ownerId: delayed.owner.id,
      markId: "rage",
      sourcePlayerId: delayed.owner.id,
      sourceSkillId: "kuangbao",
    })).toBe(1);

    const recast = setup();
    grant(recast.game, recast.owner, "wumou");
    addMark(recast.game.completeRules.lifecycle, {
      markId: "rage",
      ownerId: recast.owner.id,
      sourcePlayerId: recast.owner.id,
      sourceSkillId: "kuangbao",
      amount: 1,
      visibility: "public",
      expiry: { type: "permanent" },
    });
    recast.owner.hand = [card("wumou-recast", "iron_chain", "club")];
    recast.game.deck = [card("wumou-recast-draw", "slash")];
    current = applyAction(recast.game, {
      type: "play_card",
      playerId: recast.owner.id,
      cardId: "wumou-recast",
      targetIds: [],
    });
    expect(current.pendingResponse?.type).not.toBe("standard_skill");
    expect(current.players.find((player) => player.id === recast.owner.id)?.hand)
      .toContainEqual(expect.objectContaining({ id: "wumou-recast-draw" }));
    expect(markCount(current.completeRules.lifecycle, {
      ownerId: recast.owner.id,
      markId: "rage",
      sourcePlayerId: recast.owner.id,
      sourceSkillId: "kuangbao",
    })).toBe(1);

    const rejected = setup();
    grant(rejected.game, rejected.owner, "wumou");
    rejected.owner.hand = [card("wumou-rejected", "ex_nihilo", "diamond")];
    expect(() => applyAction(rejected.game, {
      type: "play_card",
      playerId: rejected.owner.id,
      cardId: "wumou-rejected",
      targetId: rejected.others[0]!.id,
    })).toThrow();
    expect(rejected.owner.hand).toContainEqual(expect.objectContaining({ id: "wumou-rejected" }));
  });

  it("continues a committed Wumou mass attack after its user dies", () => {
    const { game, owner, others } = setup();
    const [lord, loyalist, renegade] = others;
    if (!lord || !loyalist || !renegade) throw new Error("Missing Wumou death fixtures");
    owner.role = "rebel";
    lord.role = "lord";
    loyalist.role = "loyalist";
    renegade.role = "renegade";
    owner.hp = 1;
    grant(game, owner, "wumou");
    owner.hand = [card("wumou-nanman", "barbarian_invasion", "spade")];
    game.deck = Array.from({ length: 10 }, (_value, index) => card(`wumou-death-deck-${index}`, "dodge"));

    let current = applyAction(game, {
      type: "play_card",
      playerId: owner.id,
      cardId: "wumou-nanman",
    });
    const prompt = standardPrompt(current, owner.id);
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      tokens: ["lose_hp"],
    });
    while (current.pendingResponse?.type === "dying") {
      current = applyAction(current, {
        type: "respond",
        playerId: current.pendingResponse.targetId,
        cardId: null,
      });
    }
    expect(current.players.find((player) => player.id === owner.id)).toMatchObject({ alive: false, hp: 0 });
    while (current.pendingResponse?.type === "mass_attack") {
      current = applyAction(current, {
        type: "respond",
        playerId: current.pendingResponse.targetId,
        cardId: null,
      });
    }
    for (const survivor of [lord, loyalist, renegade]) {
      expect(current.players.find((player) => player.id === survivor.id)?.hp).toBe(3);
    }
    expect(current.discardPile.filter((candidate) => candidate.id === "wumou-nanman")).toHaveLength(1);
    expect(current.completeRules.dying.frames).toHaveLength(0);
    expect(current.completeRules.death.frames).toHaveLength(0);
  });

  it("charges Wumou for a physical Nullification before toggling the committed response", () => {
    const { game, owner, others: [responder] } = setup();
    if (!responder) throw new Error("Missing Wumou Nullification responder");
    grant(game, responder, "wumou");
    addMark(game.completeRules.lifecycle, {
      markId: "rage",
      ownerId: responder.id,
      sourcePlayerId: responder.id,
      sourceSkillId: "kuangbao",
      amount: 1,
      visibility: "public",
      expiry: { type: "permanent" },
    });
    owner.hand = [card("wumou-nullified-trick", "ex_nihilo", "heart")];
    responder.hand = [card("wumou-nullification", "wu_xie_ke_ji", "spade")];
    game.deck = [card("wumou-nullified-draw-2", "peach"), card("wumou-nullified-draw-1", "dodge")];

    let current = applyAction(game, {
      type: "play_card",
      playerId: owner.id,
      cardId: "wumou-nullified-trick",
    });
    current = applyAction(current, {
      type: "respond",
      playerId: responder.id,
      cardId: "wumou-nullification",
    });
    const prompt = standardPrompt(JSON.parse(JSON.stringify(current)) as GameSession, responder.id);
    expect(prompt).toMatchObject({ skillId: "wumou", stage: "wumou_choice" });
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: responder.id,
      promptId: prompt.promptId,
      activate: true,
      tokens: ["remove_rage"],
    });
    expect(current.players.find((player) => player.id === owner.id)?.hand).toHaveLength(0);
    expect(current.discardPile.map((candidate) => candidate.id)).toEqual(expect.arrayContaining([
      "wumou-nullified-trick",
      "wumou-nullification",
    ]));
  });

  it("charges Wumou for both an active Qixi trick and a Kanpo Nullification", () => {
    const qixi = setup();
    const qixiTarget = qixi.others[0]!;
    grant(qixi.game, qixi.owner, "qixi");
    grant(qixi.game, qixi.owner, "wumou");
    addMark(qixi.game.completeRules.lifecycle, {
      markId: "rage",
      ownerId: qixi.owner.id,
      sourcePlayerId: qixi.owner.id,
      sourceSkillId: "kuangbao",
      amount: 1,
      visibility: "public",
      expiry: { type: "permanent" },
    });
    qixi.owner.hand = [card("wumou-qixi-cost", "slash", "spade")];
    qixiTarget.hand = [card("wumou-qixi-victim", "dodge")];
    let current = applyAction(qixi.game, {
      type: "use_skill",
      playerId: qixi.owner.id,
      skillId: "qixi",
      cardIds: ["wumou-qixi-cost"],
      targetId: qixiTarget.id,
    });
    let prompt = standardPrompt(current, qixi.owner.id);
    expect(prompt).toMatchObject({ skillId: "wumou", stage: "wumou_choice" });
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: qixi.owner.id,
      promptId: prompt.promptId,
      activate: true,
      tokens: ["remove_rage"],
    });
    expect(current.pendingResponse).toMatchObject({ type: "zone_selection", victimId: qixiTarget.id });
    current = applyAction(current, {
      type: "choose_zone_card",
      playerId: qixi.owner.id,
      token: "hand:0",
    });
    expect(current.discardPile.find((candidate) => candidate.id === "wumou-qixi-cost")?.kind).toBe("slash");

    const kanpo = setup();
    const kanpoOwner = kanpo.others[0]!;
    grant(kanpo.game, kanpoOwner, "kanpo");
    grant(kanpo.game, kanpoOwner, "wumou");
    addMark(kanpo.game.completeRules.lifecycle, {
      markId: "rage",
      ownerId: kanpoOwner.id,
      sourcePlayerId: kanpoOwner.id,
      sourceSkillId: "kuangbao",
      amount: 1,
      visibility: "public",
      expiry: { type: "permanent" },
    });
    kanpo.owner.hand = [card("wumou-kanpo-effect", "ex_nihilo", "diamond")];
    kanpoOwner.hand = [card("wumou-kanpo-cost", "dodge", "club")];
    kanpo.game.deck = [card("wumou-kanpo-draw-2", "peach"), card("wumou-kanpo-draw-1", "slash")];
    current = applyAction(kanpo.game, {
      type: "play_card",
      playerId: kanpo.owner.id,
      cardId: "wumou-kanpo-effect",
    });
    current = applyAction(current, {
      type: "use_skill",
      playerId: kanpoOwner.id,
      skillId: "kanpo",
      cardIds: ["wumou-kanpo-cost"],
    });
    prompt = standardPrompt(current, kanpoOwner.id);
    expect(prompt).toMatchObject({ skillId: "wumou", stage: "wumou_choice" });
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: kanpoOwner.id,
      promptId: prompt.promptId,
      activate: true,
      tokens: ["remove_rage"],
    });
    expect(current.players.find((player) => player.id === kanpo.owner.id)?.hand).toHaveLength(0);
    expect(current.discardPile.find((candidate) => candidate.id === "wumou-kanpo-cost")?.kind).toBe("dodge");
  });

  it("strictly round-trips and rejects tampering in a Wumou damage continuation", () => {
    const encoded = encodeGameDamageContinuation({
      type: "wumou",
      ownerId: "wumou-owner",
      eventId: 17,
      continuation: {
        type: "trick_effect",
        cardKind: "ex_nihilo",
        effect: {
          type: "ex_nihilo",
          sourceId: "wumou-owner",
          targetId: "wumou-owner",
          cardId: "wumou-card",
        },
      },
    });
    expect(decodeGameDamageContinuation(JSON.parse(JSON.stringify(encoded)))).toEqual({
      type: "wumou",
      ownerId: "wumou-owner",
      eventId: 17,
      continuation: {
        type: "trick_effect",
        cardKind: "ex_nihilo",
        effect: {
          type: "ex_nihilo",
          sourceId: "wumou-owner",
          targetId: "wumou-owner",
          cardId: "wumou-card",
        },
      },
    });
    const tampered = JSON.parse(JSON.stringify(encoded)) as {
      data: { resume: { continuation: Record<string, unknown> } };
    };
    tampered.data.resume.continuation.forged = true;
    expect(() => decodeGameDamageContinuation(tampered)).toThrow(/unexpected field/);
  });

  it("settles committed Shenfen in global stages and conserves every discarded card across JSON restore", () => {
    const { game, owner, others } = setup();
    grant(game, owner, "shenfen");
    addMark(game.completeRules.lifecycle, {
      markId: "rage",
      ownerId: owner.id,
      sourcePlayerId: owner.id,
      sourceSkillId: "kuangbao",
      amount: 6,
      visibility: "public",
      expiry: { type: "permanent" },
    });
    for (const [index, target] of others.entries()) {
      target.equipment.armor = card(`shenfen-equipment-${index}`, "ba_gua_zhen", "spade");
      target.hand = Array.from({ length: 5 }, (_value, cardIndex) =>
        card(`shenfen-hand-${index}-${cardIndex}`, "dodge", cardIndex % 2 === 0 ? "club" : "diamond"));
    }
    const playPrompt = getGameView(game, owner.id).prompt;
    if (playPrompt.type !== "play") throw new Error("Expected Shenfen play prompt");
    expect(playPrompt.skills).toContainEqual(expect.objectContaining({ skillId: "shenfen", targetMode: "none" }));

    let current = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "shenfen",
    });
    expect(markCount(current.completeRules.lifecycle, {
      ownerId: owner.id,
      markId: "rage",
      sourcePlayerId: owner.id,
      sourceSkillId: "kuangbao",
    })).toBe(0);
    for (const [index, target] of others.entries()) {
      const live = current.players.find((player) => player.id === target.id)!;
      expect(live.hp).toBe(3);
      expect(live.equipment).toEqual({});
      expect(live.hand).toHaveLength(5);
      expect(current.discardPile).toContainEqual(expect.objectContaining({ id: `shenfen-equipment-${index}` }));
    }

    current = JSON.parse(JSON.stringify(current)) as GameSession;
    const discardedHandIds: string[] = [];
    while (current.pendingResponse?.type === "standard_skill" &&
        current.pendingResponse.skillId === "shenfen" && current.pendingResponse.stage === "shenfen_discard_hand") {
      const prompt = standardPrompt(current, current.pendingResponse.targetId);
      expect(prompt).toMatchObject({ canPass: false, minCards: 4, maxCards: 4 });
      const selected = prompt.allowedCardIds.slice(0, 4);
      discardedHandIds.push(...selected);
      current = applyAction(current, {
        type: "resolve_standard_skill",
        playerId: prompt.playerId,
        promptId: prompt.promptId,
        activate: true,
        cardIds: selected,
      });
    }
    expect(current.pendingResponse).toBeNull();
    expect(current.players.find((player) => player.id === owner.id)?.faceUp).toBe(false);
    expect(discardedHandIds).toHaveLength(12);
    for (const cardId of discardedHandIds) {
      expect(current.discardPile.filter((candidate) => candidate.id === cardId)).toHaveLength(1);
    }
    expect(current.completeRules.lifecycle.effects.some((effect) => effect.kind === "shenfen_commitment")).toBe(false);
  });

  it("continues Shenfen after a victim's Ganglie kills its committed source", () => {
    const { game, owner, others: [ganglieOwner, loyalist, renegade] } = setup();
    if (!ganglieOwner || !loyalist || !renegade) throw new Error("Missing Shenfen source-death fixtures");
    owner.role = "rebel";
    ganglieOwner.role = "lord";
    loyalist.role = "loyalist";
    renegade.role = "renegade";
    owner.hp = 1;
    grant(game, owner, "shenfen");
    grant(game, ganglieOwner, "ganglie");
    addMark(game.completeRules.lifecycle, {
      markId: "rage",
      ownerId: owner.id,
      sourcePlayerId: owner.id,
      sourceSkillId: "kuangbao",
      amount: 6,
      visibility: "public",
      expiry: { type: "permanent" },
    });
    game.deck = [
      card("shenfen-reward-3", "dodge"),
      card("shenfen-reward-2", "dodge"),
      card("shenfen-reward-1", "dodge"),
      card("shenfen-ganglie-judge", "slash", "club"),
    ];

    let current = applyAction(game, { type: "use_skill", playerId: owner.id, skillId: "shenfen" });
    let prompt = standardPrompt(current, ganglieOwner.id);
    expect(prompt).toMatchObject({ skillId: "ganglie", stage: "invoke" });
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: ganglieOwner.id,
      promptId: prompt.promptId,
      activate: true,
    });
    prompt = standardPrompt(current, owner.id);
    expect(prompt).toMatchObject({ skillId: "ganglie", stage: "ganglie_punish" });
    current = JSON.parse(JSON.stringify(current)) as GameSession;
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: false,
    });
    while (current.pendingResponse?.type === "dying") {
      current = applyAction(current, {
        type: "respond",
        playerId: current.pendingResponse.targetId,
        cardId: null,
      });
    }
    expect(current.players.find((player) => player.id === owner.id)).toMatchObject({ alive: false, hp: 0 });
    for (const target of [ganglieOwner, loyalist, renegade]) {
      expect(current.players.find((player) => player.id === target.id)?.hp).toBe(3);
    }
    expect(current.completeRules.damageFlow.frames).toHaveLength(0);
    expect(current.completeRules.dying.frames).toHaveLength(0);
    expect(current.completeRules.death.frames).toHaveLength(0);
  });

  it("keeps a mid-sequence Shenfen cursor through victim and source forfeits", () => {
    const { game, owner, others: [departingVictim, lord, rebel] } = setup();
    if (!departingVictim || !lord || !rebel) throw new Error("Missing Shenfen forfeit fixtures");
    owner.role = "loyalist";
    departingVictim.role = "loyalist";
    lord.role = "lord";
    rebel.role = "rebel";
    grant(game, owner, "shenfen");
    addMark(game.completeRules.lifecycle, {
      markId: "rage",
      ownerId: owner.id,
      sourcePlayerId: owner.id,
      sourceSkillId: "kuangbao",
      amount: 6,
      visibility: "public",
      expiry: { type: "permanent" },
    });
    for (const [index, target] of [departingVictim, lord, rebel].entries()) {
      target.hand = Array.from({ length: 5 }, (_value, cardIndex) =>
        card(`shenfen-forfeit-${index}-${cardIndex}`, "dodge"));
    }
    game.deck = Array.from({ length: 8 }, (_value, index) => card(`shenfen-next-turn-${index}`, "slash"));

    let current = applyAction(game, { type: "use_skill", playerId: owner.id, skillId: "shenfen" });
    current = JSON.parse(JSON.stringify(current)) as GameSession;
    expect(current.pendingResponse).toMatchObject({
      type: "standard_skill",
      skillId: "shenfen",
      stage: "shenfen_discard_hand",
      targetId: departingVictim.id,
    });
    current = forfeitPlayer(current, departingVictim.id);
    expect(current.pendingResponse).toMatchObject({ targetId: lord.id, skillId: "shenfen" });
    current = forfeitPlayer(current, owner.id);
    expect(current.pendingResponse).toMatchObject({ targetId: lord.id, skillId: "shenfen" });

    const discardedAfterForfeit: string[] = [];
    while (current.pendingResponse?.type === "standard_skill" && current.pendingResponse.skillId === "shenfen") {
      const handPrompt = standardPrompt(current, current.pendingResponse.targetId);
      const selected = handPrompt.allowedCardIds.slice(0, 4);
      discardedAfterForfeit.push(...selected);
      current = applyAction(current, {
        type: "resolve_standard_skill",
        playerId: handPrompt.playerId,
        promptId: handPrompt.promptId,
        activate: true,
        cardIds: selected,
      });
    }
    expect(current.players.find((player) => player.id === owner.id)?.alive).toBe(false);
    expect(current.players.find((player) => player.id === departingVictim.id)?.alive).toBe(false);
    expect(discardedAfterForfeit).toHaveLength(8);
    for (const cardId of discardedAfterForfeit) {
      expect(current.discardPile.filter((candidate) => candidate.id === cardId)).toHaveLength(1);
    }
    expect(current.completeRules.dying.frames).toHaveLength(0);
    expect(current.completeRules.death.frames).toHaveLength(0);
  });

  it("strictly round-trips and rejects tampering in a Shenfen damage continuation", () => {
    const resume = {
      type: "shenfen" as const,
      continuation: {
        eventId: 31,
        ownerId: "shenfen-owner",
        targetIds: ["shenfen-a", "shenfen-b"],
        stage: "damage" as const,
        nextTargetIndex: 1,
      },
    };
    const encoded = encodeGameDamageContinuation(resume);
    expect(decodeGameDamageContinuation(JSON.parse(JSON.stringify(encoded)))).toEqual(resume);
    const tampered = JSON.parse(JSON.stringify(encoded)) as {
      data: { resume: { continuation: { nextTargetIndex: number; forged?: boolean } } };
    };
    tampered.data.resume.continuation.forged = true;
    expect(() => decodeGameDamageContinuation(tampered)).toThrow(/unexpected field/);
    delete tampered.data.resume.continuation.forged;
    tampered.data.resume.continuation.nextTargetIndex = 3;
    expect(() => decodeGameDamageContinuation(tampered)).toThrow(/0 through 2/);
  });

  it("server-validates lesser Yeyan allocations and consumes the limit exactly once", () => {
    const { game, owner, others: [first, second, third] } = setup();
    if (!first || !second || !third) throw new Error("Missing lesser Yeyan fixtures");
    grant(game, owner, "yeyan");

    const playPrompt = getGameView(game, owner.id).prompt;
    if (playPrompt.type !== "play") throw new Error("Expected Yeyan play prompt");
    expect(playPrompt.skills).toContainEqual(expect.objectContaining({
      skillId: "yeyan",
      minCards: 0,
      maxCards: 0,
      targetMode: "up-to-three",
      targetIds: expect.arrayContaining([owner.id, first.id, second.id, third.id]),
    }));

    expect(() => applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "yeyan",
      allocations: [
        { targetId: first.id, damage: 2 },
        { targetId: second.id, damage: 2 },
      ],
    })).toThrow();
    expect(() => applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "yeyan",
      allocations: [{ targetId: first.id, damage: 1 }],
      cardIds: [],
    })).toThrow(/小业炎/);
    expect(game.completeRules.lifecycle.limitedUses).not.toContainEqual(expect.objectContaining({
      ownerId: owner.id,
      skillId: "yeyan",
    }));

    const current = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "yeyan",
      allocations: [
        { targetId: third.id, damage: 1 },
        { targetId: first.id, damage: 1 },
        { targetId: second.id, damage: 1 },
      ],
    });
    expect(current.pendingResponse).toBeNull();
    for (const target of [first, second, third]) {
      expect(current.players.find((player) => player.id === target.id)?.hp).toBe(3);
    }
    expect(current.completeRules.lifecycle.limitedUses).toContainEqual(expect.objectContaining({
      ownerId: owner.id,
      skillId: "yeyan",
    }));
    expect(current.completeRules.lifecycle.effects.some((effect) => effect.kind === "yeyan_commitment")).toBe(false);
    expect(() => applyAction(current, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "yeyan",
      allocations: [{ targetId: first.id, damage: 1 }],
    })).toThrow();
  });

  it("rejects an invalid greater Yeyan cost without consuming cards, HP, or its limited use", () => {
    const { game, owner, others: [first, second] } = setup();
    if (!first || !second) throw new Error("Missing atomic Yeyan fixtures");
    owner.hp = 3;
    grant(game, owner, "yeyan");
    owner.hand = [
      card("atomic-yeyan-spade", "slash", "spade"),
      card("atomic-yeyan-heart-a", "dodge", "heart"),
      card("atomic-yeyan-heart-b", "peach", "heart"),
      card("atomic-yeyan-diamond", "wine", "diamond"),
    ];
    const handBefore = owner.hand.map((candidate) => candidate.id);

    expect(() => applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "yeyan",
      cardIds: [...handBefore],
      allocations: [
        { targetId: first.id, damage: 2 },
        { targetId: second.id, damage: 1 },
      ],
    })).toThrow();

    expect(owner.hand.map((candidate) => candidate.id)).toEqual(handBefore);
    expect(owner.hp).toBe(3);
    expect(game.discardPile).toHaveLength(0);
    expect(game.completeRules.lifecycle.limitedUses).not.toContainEqual(expect.objectContaining({
      ownerId: owner.id,
      skillId: "yeyan",
    }));
  });

  it("atomically pays greater Yeyan, resolves afterMove first, then rescues its live DyingStack before damage", () => {
    const { game, owner, others: [first, second, third] } = setup();
    if (!first || !second || !third) throw new Error("Missing greater Yeyan fixtures");
    owner.role = "loyalist";
    first.role = "lord";
    second.role = "rebel";
    third.role = "renegade";
    owner.hp = 3;
    grant(game, owner, "yeyan");
    grant(game, owner, "lianying");
    owner.hand = [
      card("yeyan-spade", "slash", "spade"),
      card("yeyan-heart", "peach", "heart"),
      card("yeyan-club", "dodge", "club"),
      card("yeyan-diamond", "wine", "diamond"),
    ];
    first.hand = [card("yeyan-rescue", "peach", "heart")];

    let current = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "yeyan",
      cardIds: ["yeyan-heart", "yeyan-club", "yeyan-diamond", "yeyan-spade"],
      allocations: [
        { targetId: second.id, damage: 1 },
        { targetId: first.id, damage: 2 },
      ],
    });
    expect(current.pendingResponse).toMatchObject({
      type: "skill_choice",
      skillId: "lianying",
      targetId: owner.id,
    });
    expect(current.players.find((player) => player.id === owner.id)).toMatchObject({ hp: 3, hand: [] });
    for (const costCardId of ["yeyan-spade", "yeyan-heart", "yeyan-club", "yeyan-diamond"]) {
      expect(current.discardPile.filter((candidate) => candidate.id === costCardId)).toHaveLength(1);
    }

    current = JSON.parse(JSON.stringify(current)) as GameSession;
    const lianying = current.pendingResponse;
    if (lianying?.type !== "skill_choice") throw new Error("Expected Yeyan Lianying prompt");
    current = applyAction(current, {
      type: "resolve_skill",
      playerId: owner.id,
      skillId: "lianying",
      promptId: lianying.promptId,
      activate: false,
    });
    expect(current.players.find((player) => player.id === owner.id)?.hp).toBe(0);
    expect(current.pendingResponse).toMatchObject({ type: "dying", victimId: owner.id, targetId: owner.id });
    expect(current.completeRules.dying.frames).toHaveLength(1);

    current = applyAction(JSON.parse(JSON.stringify(current)) as GameSession, {
      type: "respond",
      playerId: owner.id,
      cardId: null,
    });
    expect(current.pendingResponse).toMatchObject({ type: "dying", victimId: owner.id, targetId: first.id });
    current = applyAction(current, {
      type: "respond",
      playerId: first.id,
      cardId: "yeyan-rescue",
    });
    expect(current.players.find((player) => player.id === owner.id)).toMatchObject({ alive: true, hp: 1 });
    expect(current.players.find((player) => player.id === first.id)?.hp).toBe(2);
    expect(current.players.find((player) => player.id === second.id)?.hp).toBe(3);
    expect(current.completeRules.damageFlow.frames).toHaveLength(0);
    expect(current.completeRules.dying.frames).toHaveLength(0);
    expect(current.completeRules.death.frames).toHaveLength(0);
  });

  it("continues committed greater Yeyan after its source dies to the three-HP cost", () => {
    const { game, owner, others: [lord, rebel, renegade] } = setup();
    if (!lord || !rebel || !renegade) throw new Error("Missing fatal Yeyan fixtures");
    owner.role = "loyalist";
    lord.role = "lord";
    rebel.role = "rebel";
    renegade.role = "renegade";
    owner.hp = 3;
    grant(game, owner, "yeyan");
    owner.hand = [
      card("fatal-yeyan-spade", "slash", "spade"),
      card("fatal-yeyan-heart", "dodge", "heart"),
      card("fatal-yeyan-club", "slash", "club"),
      card("fatal-yeyan-diamond", "dodge", "diamond"),
    ];

    let current = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "yeyan",
      cardIds: owner.hand.map((candidate) => candidate.id),
      allocations: [
        { targetId: rebel.id, damage: 1 },
        { targetId: lord.id, damage: 2 },
      ],
    });
    expect(current.pendingResponse).toMatchObject({ type: "dying", victimId: owner.id });
    current = passAllDyingResponses(JSON.parse(JSON.stringify(current)) as GameSession);
    expect(current.players.find((player) => player.id === owner.id)).toMatchObject({ alive: false, hp: 0 });
    expect(current.players.find((player) => player.id === lord.id)?.hp).toBe(2);
    expect(current.players.find((player) => player.id === rebel.id)?.hp).toBe(3);
    expect(current.status).toBe("playing");
    expect(current.completeRules.damageFlow.frames).toHaveLength(0);
    expect(current.completeRules.dying.frames).toHaveLength(0);
    expect(current.completeRules.death.frames).toHaveLength(0);
  });

  it("keeps frozen Yeyan damage through source and allocated-target forfeits", () => {
    const sourceCase = setup();
    const [lord, rebel, renegade] = sourceCase.others;
    if (!lord || !rebel || !renegade) throw new Error("Missing Yeyan source-forfeit fixtures");
    sourceCase.owner.role = "loyalist";
    lord.role = "lord";
    rebel.role = "rebel";
    renegade.role = "renegade";
    sourceCase.owner.hp = 3;
    grant(sourceCase.game, sourceCase.owner, "yeyan");
    grant(sourceCase.game, sourceCase.owner, "lianying");
    sourceCase.owner.hand = [
      card("forfeit-yeyan-spade", "slash", "spade"),
      card("forfeit-yeyan-heart", "dodge", "heart"),
      card("forfeit-yeyan-club", "slash", "club"),
      card("forfeit-yeyan-diamond", "dodge", "diamond"),
    ];
    sourceCase.game.deck = Array.from({ length: 8 }, (_value, index) =>
      card(`forfeit-yeyan-next-turn-${index}`, "slash"));
    let current = applyAction(sourceCase.game, {
      type: "use_skill",
      playerId: sourceCase.owner.id,
      skillId: "yeyan",
      cardIds: sourceCase.owner.hand.map((candidate) => candidate.id),
      allocations: [
        { targetId: lord.id, damage: 2 },
        { targetId: rebel.id, damage: 1 },
      ],
    });
    expect(current.pendingResponse).toMatchObject({ type: "skill_choice", skillId: "lianying" });
    current = forfeitPlayer(JSON.parse(JSON.stringify(current)) as GameSession, sourceCase.owner.id);
    expect(current.players.find((player) => player.id === sourceCase.owner.id)?.alive).toBe(false);
    expect(current.players.find((player) => player.id === lord.id)?.hp).toBe(2);
    expect(current.players.find((player) => player.id === rebel.id)?.hp).toBe(3);
    for (const costCardId of sourceCase.owner.hand.map((candidate) => candidate.id)) {
      expect(current.discardPile.filter((candidate) => candidate.id === costCardId)).toHaveLength(1);
    }

    const targetCase = setup();
    const [departing, nextTarget, survivor] = targetCase.others;
    if (!departing || !nextTarget || !survivor) throw new Error("Missing Yeyan target-forfeit fixtures");
    targetCase.owner.role = "lord";
    departing.role = "loyalist";
    nextTarget.role = "rebel";
    survivor.role = "renegade";
    departing.hp = 1;
    grant(targetCase.game, targetCase.owner, "yeyan");
    current = applyAction(targetCase.game, {
      type: "use_skill",
      playerId: targetCase.owner.id,
      skillId: "yeyan",
      allocations: [
        { targetId: departing.id, damage: 1 },
        { targetId: nextTarget.id, damage: 1 },
      ],
    });
    expect(current.pendingResponse).toMatchObject({ type: "dying", victimId: departing.id });
    current = forfeitPlayer(JSON.parse(JSON.stringify(current)) as GameSession, departing.id);
    expect(current.players.find((player) => player.id === departing.id)?.alive).toBe(false);
    expect(current.players.find((player) => player.id === nextTarget.id)?.hp).toBe(3);
    expect(current.completeRules.dying.frames).toHaveLength(0);
    expect(current.completeRules.death.frames).toHaveLength(0);
  });

  it("strictly round-trips Yeyan continuations and rejects structural and committed-state forgery", () => {
    const resume = {
      type: "yeyan" as const,
      continuation: {
        eventId: 41,
        ownerId: "yeyan-owner",
        greaterYeyan: true,
        costCardIds: ["yeyan-a", "yeyan-b", "yeyan-c", "yeyan-d"],
        allocations: [
          { targetId: "yeyan-target-a", amount: 2 },
          { targetId: "yeyan-target-b", amount: 1 },
        ],
        stage: "damage" as const,
        nextAllocationIndex: 1,
      },
    };
    const encoded = encodeGameDamageContinuation(resume);
    expect(decodeGameDamageContinuation(JSON.parse(JSON.stringify(encoded)))).toEqual(resume);
    const tampered = JSON.parse(JSON.stringify(encoded)) as {
      data: { resume: { continuation: {
        allocations: Array<{ targetId: string; amount: number }>;
        forged?: boolean;
      } } };
    };
    tampered.data.resume.continuation.forged = true;
    expect(() => decodeGameDamageContinuation(tampered)).toThrow(/unexpected field/);
    delete tampered.data.resume.continuation.forged;
    tampered.data.resume.continuation.allocations[1]!.targetId = "yeyan-target-a";
    expect(() => decodeGameDamageContinuation(tampered)).toThrow(/duplicates/);

    const live = setup();
    const [first, second, third] = live.others;
    if (!first || !second || !third) throw new Error("Missing live Yeyan tamper fixtures");
    live.owner.role = "loyalist";
    first.role = "lord";
    second.role = "rebel";
    third.role = "renegade";
    live.owner.hp = 3;
    grant(live.game, live.owner, "yeyan");
    live.owner.hand = [
      card("live-yeyan-spade", "slash", "spade"),
      card("live-yeyan-heart", "dodge", "heart"),
      card("live-yeyan-club", "slash", "club"),
      card("live-yeyan-diamond", "dodge", "diamond"),
    ];
    let current = applyAction(live.game, {
      type: "use_skill",
      playerId: live.owner.id,
      skillId: "yeyan",
      cardIds: live.owner.hand.map((candidate) => candidate.id),
      allocations: [
        { targetId: first.id, damage: 2 },
        { targetId: second.id, damage: 1 },
      ],
    });
    current = JSON.parse(JSON.stringify(current)) as GameSession;
    if (current.pendingResponse?.type !== "dying" || current.pendingResponse.resume.type !== "yeyan") {
      throw new Error("Expected live Yeyan dying continuation");
    }
    current.pendingResponse.resume.continuation.allocations[0] = {
      ...current.pendingResponse.resume.continuation.allocations[0]!,
      targetId: live.owner.id,
    };
    expect(() => passAllDyingResponses(current)).toThrow(/业炎续体|已承诺/);
  });

  it("uses mixed hand and equipment components atomically for a live Longhun Fire Slash", () => {
    const { game, owner, others: [target] } = setup();
    if (!target) throw new Error("Missing Longhun Slash target");
    grant(game, owner, "longhun");
    owner.hp = 2;
    owner.hand = [card("longhun-diamond-hand", "dodge", "diamond")];
    owner.equipment.armor = card("longhun-diamond-armor", "ba_gua_zhen", "diamond");

    const prompt = getGameView(game, owner.id).prompt;
    if (prompt.type !== "play") throw new Error("Expected Longhun play prompt");
    expect(prompt.skills).toContainEqual(expect.objectContaining({
      skillId: "longhun",
      cardGroups: [["longhun-diamond-hand", "longhun-diamond-armor"]],
      virtualCardKind: "fire_slash",
    }));

    let current = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "longhun",
      cardIds: ["longhun-diamond-hand", "longhun-diamond-armor"],
      targetId: target.id,
    });
    current = JSON.parse(JSON.stringify(current)) as GameSession;
    expect(current.pendingResponse).toMatchObject({
      type: "slash",
      slashKind: "fire_slash",
      nature: "fire",
      damageCardIds: ["longhun-diamond-hand", "longhun-diamond-armor"],
    });
    current = applyAction(current, { type: "respond", playerId: target.id, cardId: null });
    expect(current.players.find((player) => player.id === target.id)?.hp).toBe(3);
    expect(current.discardPile).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "longhun-diamond-hand", kind: "dodge" }),
      expect.objectContaining({ id: "longhun-diamond-armor", kind: "ba_gua_zhen" }),
    ]));

    const rejected = setup();
    grant(rejected.game, rejected.owner, "longhun");
    rejected.owner.hp = 2;
    rejected.owner.hand = [card("longhun-atomic-heart", "slash", "heart")];
    rejected.owner.equipment.armor = card("longhun-atomic-diamond", "ba_gua_zhen", "diamond");
    expect(() => applyAction(rejected.game, {
      type: "use_skill",
      playerId: rejected.owner.id,
      skillId: "longhun",
      cardIds: ["longhun-atomic-heart", "longhun-atomic-diamond"],
      targetId: rejected.others[0]!.id,
    })).toThrow();
    expect(rejected.owner.hand.map((candidate) => candidate.id)).toEqual(["longhun-atomic-heart"]);
    expect(rejected.owner.equipment.armor?.id).toBe("longhun-atomic-diamond");

    const range = setup();
    const distant = range.others[1]!;
    grant(range.game, range.owner, "longhun");
    range.owner.hp = 2;
    range.owner.hand = [card("longhun-range-hand", "dodge", "diamond")];
    range.owner.equipment.offensive_horse = card("longhun-range-horse", "chi_tu", "diamond");
    expect(distanceBetweenPlayers(range.game, range.owner.id, distant.id)).toBe(1);
    expect(() => applyAction(range.game, {
      type: "use_skill",
      playerId: range.owner.id,
      skillId: "longhun",
      cardIds: ["longhun-range-hand", "longhun-range-horse"],
      targetId: distant.id,
    })).toThrow();
    expect(range.owner.hand.map((candidate) => candidate.id)).toEqual(["longhun-range-hand"]);
    expect(range.owner.equipment.offensive_horse?.id).toBe("longhun-range-horse");
  });

  it("commits a Longhun Peach before Silver Lion recovery and resumes its unified after-move trigger", () => {
    const { game, owner } = setup();
    grant(game, owner, "longhun");
    grant(game, owner, "xiaoji");
    owner.hp = 2;
    owner.hand = [card("longhun-peach-hand", "slash", "heart")];
    owner.equipment.armor = card("longhun-peach-lion", "bai_yin_shi_zi", "heart");

    let current = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "longhun",
      cardIds: ["longhun-peach-hand", "longhun-peach-lion"],
    });
    expect(current.players.find((player) => player.id === owner.id)?.hp).toBe(4);
    expect(current.pendingResponse).toMatchObject({ type: "skill_choice", skillId: "xiaoji", targetId: owner.id });
    const xiaoji = current.pendingResponse;
    if (xiaoji?.type !== "skill_choice" || xiaoji.skillId !== "xiaoji") throw new Error("Expected Xiaoji prompt");
    current = applyAction(JSON.parse(JSON.stringify(current)) as GameSession, {
      type: "resolve_skill",
      playerId: owner.id,
      skillId: "xiaoji",
      activate: false,
      promptId: xiaoji.promptId,
    });
    expect(current.pendingResponse).toBeNull();
    expect(current.discardPile).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "longhun-peach-hand", kind: "slash" }),
      expect.objectContaining({ id: "longhun-peach-lion", kind: "bai_yin_shi_zi" }),
    ]));
  });

  it("answers Dodge and Nullification windows with exact multi-card Longhun groups", () => {
    const slash = setup();
    const slashResponder = slash.others[0]!;
    grant(slash.game, slashResponder, "longhun");
    slashResponder.hp = 2;
    slash.owner.hand = [card("longhun-duel", "duel", "spade")];
    slashResponder.hand = [card("longhun-slash-hand", "dodge", "diamond")];
    slashResponder.equipment.weapon = card("longhun-slash-weapon", "zhu_ge_lian_nu", "diamond");
    let current = applyAction(slash.game, {
      type: "play_card",
      playerId: slash.owner.id,
      cardId: "longhun-duel",
      targetId: slashResponder.id,
    });
    current = applyAction(current, {
      type: "use_skill",
      playerId: slashResponder.id,
      skillId: "longhun",
      cardIds: ["longhun-slash-hand", "longhun-slash-weapon"],
    });
    expect(current.pendingResponse).toMatchObject({ type: "duel", targetId: slash.owner.id });
    expect(current.resolvingCards.map((candidate) => candidate.id)).toEqual(expect.arrayContaining([
      "longhun-slash-hand",
      "longhun-slash-weapon",
    ]));
    current = applyAction(current, { type: "respond", playerId: slash.owner.id, cardId: null });
    expect(current.discardPile.map((candidate) => candidate.id)).toEqual(expect.arrayContaining([
      "longhun-slash-hand",
      "longhun-slash-weapon",
    ]));

    const dodge = setup();
    const defender = dodge.others[0]!;
    grant(dodge.game, defender, "longhun");
    grant(dodge.game, defender, "leiji");
    defender.hp = 2;
    dodge.owner.hand = [card("longhun-source-slash", "slash", "heart")];
    defender.hand = [card("longhun-club-hand", "peach", "club")];
    defender.equipment.weapon = card("longhun-club-armor", "zhu_ge_lian_nu", "club");
    current = applyAction(dodge.game, {
      type: "play_card",
      playerId: dodge.owner.id,
      cardId: "longhun-source-slash",
      targetId: defender.id,
    });
    let prompt = getGameView(current, defender.id).prompt;
    expect(prompt).toMatchObject({
      type: "respond",
      skillResponses: expect.arrayContaining([expect.objectContaining({
        skillId: "longhun",
        minCards: 2,
        maxCards: 2,
        cardGroups: [["longhun-club-hand", "longhun-club-armor"]],
      })]),
    });
    current = applyAction(current, {
      type: "use_skill",
      playerId: defender.id,
      skillId: "longhun",
      cardIds: ["longhun-club-hand", "longhun-club-armor"],
    });
    expect(current.pendingResponse).toMatchObject({
      type: "standard_skill",
      skillId: "leiji",
      leijiDodge: {
        provenance: {
          type: "view_as",
          skillId: "longhun",
          physicalCardIds: ["longhun-club-hand", "longhun-club-armor"],
        },
      },
    });

    const wuxie = setup();
    const responder = wuxie.others[0]!;
    grant(wuxie.game, responder, "longhun");
    responder.hp = 2;
    wuxie.owner.hand = [card("longhun-trick", "ex_nihilo", "heart")];
    responder.hand = [card("longhun-spade-hand", "slash", "spade")];
    responder.equipment.weapon = card("longhun-spade-armor", "zhu_ge_lian_nu", "spade");
    wuxie.game.deck = [card("longhun-trick-draw-2", "dodge"), card("longhun-trick-draw-1", "peach")];
    current = applyAction(wuxie.game, {
      type: "play_card",
      playerId: wuxie.owner.id,
      cardId: "longhun-trick",
    });
    prompt = getGameView(current, responder.id).prompt;
    expect(prompt).toMatchObject({
      type: "nullification",
      longhunCardGroups: [["longhun-spade-hand", "longhun-spade-armor"]],
    });
    current = applyAction(JSON.parse(JSON.stringify(current)) as GameSession, {
      type: "use_skill",
      playerId: responder.id,
      skillId: "longhun",
      cardIds: ["longhun-spade-hand", "longhun-spade-armor"],
    });
    expect(current.players.find((player) => player.id === wuxie.owner.id)?.hand).toHaveLength(0);
    expect(current.discardPile.map((candidate) => candidate.id)).toEqual(expect.arrayContaining([
      "longhun-trick",
      "longhun-spade-hand",
      "longhun-spade-armor",
    ]));
  });

  it("rescues through DyingStack and Buqu recovery with every Longhun component preserved", () => {
    const { game, owner, others: [victim, responder] } = setup();
    if (!victim || !responder) throw new Error("Missing Longhun dying fixtures");
    grant(game, victim, "buqu");
    grant(game, responder, "longhun");
    victim.hp = 1;
    responder.hp = 2;
    owner.hand = [
      card("longhun-dying-wine", "wine", "diamond"),
      card("longhun-dying-slash", "slash", "club"),
    ];
    responder.hand = [card("longhun-heart-hand", "dodge", "heart")];
    responder.equipment.armor = card("longhun-heart-armor", "ba_gua_zhen", "heart");
    game.deck = [
      card("longhun-buqu-2", "slash", "spade", 7),
      card("longhun-buqu-1", "dodge", "club", 7),
    ];

    let current = applyAction(game, {
      type: "play_card",
      playerId: owner.id,
      cardId: "longhun-dying-wine",
    });
    current = applyAction(current, {
      type: "play_card",
      playerId: owner.id,
      cardId: "longhun-dying-slash",
      targetId: victim.id,
    });
    current = applyAction(current, { type: "respond", playerId: victim.id, cardId: null });
    let buquPrompt = getGameView(current, victim.id).prompt;
    if (buquPrompt.type !== "skill_choice" || buquPrompt.skillId !== "buqu") {
      throw new Error(`Expected Buqu entry prompt, got ${buquPrompt.type}`);
    }
    current = applyAction(current, {
      type: "resolve_skill",
      playerId: victim.id,
      skillId: "buqu",
      activate: true,
      promptId: buquPrompt.promptId,
    });
    expect(current.pendingResponse).toMatchObject({ type: "dying", targetId: victim.id });
    current = applyAction(current, { type: "respond", playerId: victim.id, cardId: null });
    expect(current.pendingResponse).toMatchObject({ type: "dying", targetId: responder.id });
    current = applyAction(JSON.parse(JSON.stringify(current)) as GameSession, {
      type: "use_skill",
      playerId: responder.id,
      skillId: "longhun",
      cardIds: ["longhun-heart-hand", "longhun-heart-armor"],
    });
    current = JSON.parse(JSON.stringify(current)) as GameSession;
    expect(current.pendingResponse).toMatchObject({
      type: "standard_skill",
      skillId: "buqu",
      stage: "buqu_recovery",
      recovery: {
        dyingRescue: {
          viewAsSkillId: "longhun",
          physicalCards: [
            expect.objectContaining({ physicalCardId: "longhun-heart-hand", from: "hand" }),
            expect.objectContaining({ physicalCardId: "longhun-heart-armor", from: "equipment" }),
          ],
        },
      },
    });
    const recoveryPrompt = standardPrompt(current, victim.id);
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: victim.id,
      promptId: recoveryPrompt.promptId,
      activate: true,
      cardId: recoveryPrompt.allowedCardIds[0],
    });
    expect(current.players.find((player) => player.id === victim.id)).toMatchObject({ alive: true, hp: -1 });
    expect(current.completeRules.dying.frames).toHaveLength(0);
    expect(current.discardPile).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "longhun-heart-hand", kind: "dodge" }),
      expect.objectContaining({ id: "longhun-heart-armor", kind: "ba_gua_zhen" }),
    ]));
  });

  it("uses Hongyan-adjusted Hearts for a normal Longhun rescue and lets Wansha reject without payment", () => {
    const normal = setup();
    const victim = normal.others[0]!;
    const responder = normal.others[1]!;
    grant(normal.game, responder, "longhun");
    grant(normal.game, responder, "hongyan");
    victim.hp = 1;
    responder.hp = 2;
    normal.owner.hand = [card("longhun-normal-slash", "slash", "club")];
    responder.hand = [
      card("longhun-normal-heart", "dodge", "heart"),
      card("longhun-normal-spade", "slash", "spade"),
    ];
    let current = applyAction(normal.game, {
      type: "play_card",
      playerId: normal.owner.id,
      cardId: "longhun-normal-slash",
      targetId: victim.id,
    });
    current = applyAction(current, { type: "respond", playerId: victim.id, cardId: null });
    current = applyAction(current, { type: "respond", playerId: victim.id, cardId: null });
    current = applyAction(current, {
      type: "use_skill",
      playerId: responder.id,
      skillId: "longhun",
      cardIds: ["longhun-normal-heart", "longhun-normal-spade"],
    });
    expect(current.players.find((player) => player.id === victim.id)).toMatchObject({ alive: true, hp: 1 });
    expect(current.completeRules.dying.frames).toHaveLength(0);

    const blocked = setup();
    const blockedVictim = blocked.others[0]!;
    const blockedResponder = blocked.others[1]!;
    grant(blocked.game, blocked.owner, "wansha");
    grant(blocked.game, blockedResponder, "longhun");
    blockedVictim.hp = 1;
    blockedResponder.hp = 2;
    blocked.owner.hand = [card("longhun-wansha-slash", "slash", "club")];
    blockedResponder.hand = [card("longhun-wansha-heart-1", "dodge", "heart")];
    blockedResponder.equipment.weapon = card("longhun-wansha-heart-2", "zhu_ge_lian_nu", "heart");
    current = applyAction(blocked.game, {
      type: "play_card",
      playerId: blocked.owner.id,
      cardId: "longhun-wansha-slash",
      targetId: blockedVictim.id,
    });
    current = applyAction(current, { type: "respond", playerId: blockedVictim.id, cardId: null });
    current = applyAction(current, { type: "respond", playerId: blockedVictim.id, cardId: null });
    expect(getGameView(current, blockedResponder.id).prompt).toMatchObject({
      type: "dying",
      skillResponses: [],
    });
    expect(() => applyAction(current, {
      type: "use_skill",
      playerId: blockedResponder.id,
      skillId: "longhun",
      cardIds: ["longhun-wansha-heart-1", "longhun-wansha-heart-2"],
    })).toThrow();
    expect(current.players.find((player) => player.id === blockedResponder.id)?.hand.map((candidate) => candidate.id))
      .toEqual(["longhun-wansha-heart-1"]);
    expect(current.players.find((player) => player.id === blockedResponder.id)?.equipment.weapon?.id)
      .toBe("longhun-wansha-heart-2");
  });
});
