import { describe, expect, it } from "vitest";

import {
  addMark,
  applyAction,
  awakenSkill,
  createGame,
  forfeitPlayer,
  getCardDefinition,
  getEffectiveGeneralSkillIds,
  getGameView,
  grantSkill,
  hasAwakened,
  initializeGameStartSkills,
  markCount,
  type Card,
  type CardKind,
  type GamePlayer,
  type GameSession,
  type GeneralSkillId,
} from "../src/index.js";

const seed = "cd".repeat(32);

function card(
  id: string,
  kind: CardKind = "slash",
  suit: Card["suit"] = "club",
  rank: Card["rank"] = 7,
): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank };
}

function setup(count = 4): { game: GameSession; current: GamePlayer; others: GamePlayer[] } {
  const game = createGame({
    playerIds: Array.from({ length: count }, (_value, index) => `god-c-${index + 1}`),
    seed,
  });
  const current = game.players.find((player) => player.id === game.currentPlayerId)!;
  const currentIndex = game.players.findIndex((player) => player.id === current.id);
  const others = Array.from({ length: count - 1 }, (_value, offset) =>
    game.players[(currentIndex + offset + 1) % count]!,
  );
  for (const player of game.players) {
    player.generalId = "gan_ning";
    player.hp = player.maxHp = 4;
    player.alive = true;
    player.faceUp = true;
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
    playerId: current.id,
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
  return { game, current, others };
}

function grant(game: GameSession, owner: GamePlayer, skillId: GeneralSkillId): void {
  grantSkill(game.completeRules.lifecycle, {
    ownerId: owner.id,
    skillId,
    sourcePlayerId: owner.id,
    sourceSkillId: `test:${skillId}`,
    expiry: { type: "permanent" },
  });
}

function prepareJilue(game: GameSession, owner: GamePlayer, renMarks = 2): void {
  awakenSkill(game.completeRules.lifecycle, owner.id, "baiyin", 900_000);
  grantSkill(game.completeRules.lifecycle, {
    ownerId: owner.id,
    skillId: "jilue",
    sourcePlayerId: owner.id,
    sourceSkillId: "baiyin",
    expiry: { type: "permanent" },
  });
  if (renMarks > 0) {
    addMark(game.completeRules.lifecycle, {
      ownerId: owner.id,
      markId: "ren",
      sourcePlayerId: owner.id,
      sourceSkillId: "renjie",
      amount: renMarks,
      visibility: "public",
      expiry: { type: "permanent" },
    });
  }
}

function standardPrompt(game: GameSession, playerId: string) {
  const prompt = getGameView(game, playerId).prompt;
  if (prompt.type !== "standard_skill") throw new Error(`Expected standard skill prompt, got ${prompt.type}`);
  return prompt;
}

describe("live God phase and weather skills", () => {
  it("settles Shelie by printed suit with public reveal, exact conservation, JSON restore, and replay rejection", () => {
    const { game, current: starter, others: [owner, observer] } = setup();
    if (!owner || !observer) throw new Error("Missing Shelie fixtures");
    grant(game, owner, "shelie");
    grant(game, owner, "hongyan");
    game.deck = [
      card("shelie-diamond", "slash", "diamond"),
      card("shelie-club", "dodge", "club"),
      card("shelie-heart", "peach", "heart"),
      card("shelie-spade-2", "wine", "spade"),
      card("shelie-spade-1", "slash", "spade"),
    ];

    let state = applyAction(game, { type: "end_play", playerId: starter.id });
    let prompt = standardPrompt(state, owner.id);
    expect(prompt).toMatchObject({ skillId: "shelie", stage: "shelie_invoke", canPass: true });
    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
    });
    prompt = standardPrompt(state, owner.id);
    expect(prompt).toMatchObject({
      skillId: "shelie",
      stage: "shelie_select",
      minCards: 4,
      maxCards: 4,
      canPass: false,
    });
    expect(getGameView(state, observer.id).publicCards.map((entry) => entry.id).sort()).toEqual(
      prompt.cards.map((entry) => entry.id).sort(),
    );
    expect(() => applyAction(state, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      cardIds: ["shelie-spade-1", "shelie-spade-2", "shelie-heart", "shelie-club"],
    })).toThrow();

    const action = {
      type: "resolve_standard_skill" as const,
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      cardIds: ["shelie-spade-2", "shelie-heart", "shelie-club", "shelie-diamond"],
    };
    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, action);
    expect(state.turn).toMatchObject({ playerId: owner.id, phase: "play" });
    expect(state.players.find((player) => player.id === owner.id)?.hand.map((entry) => entry.id).sort())
      .toEqual([...action.cardIds].sort());
    expect(state.discardPile.map((entry) => entry.id)).toEqual(["shelie-spade-1"]);
    expect(state.deck).toEqual([]);
    expect(state.players.flatMap((player) => [
      ...player.hand,
      ...Object.values(player.equipment),
      ...player.judgment,
      ...Object.values(player.extraPiles).flat(),
    ]).length + state.deck.length + state.discardPile.length + state.resolvingCards.length).toBe(5);
    expect(() => applyAction(state, action)).toThrow();
  });

  it("does not offer Shelie below five cards and can reveal across one authoritative reshuffle", () => {
    const insufficient = setup();
    const owner = insufficient.others[0]!;
    grant(insufficient.game, owner, "shelie");
    insufficient.game.deck = [card("short-4"), card("short-3"), card("short-2"), card("short-1")];
    const normal = applyAction(insufficient.game, { type: "end_play", playerId: insufficient.current.id });
    expect(normal).toMatchObject({ currentPlayerId: owner.id, turn: { phase: "play" } });
    expect(normal.players.find((player) => player.id === owner.id)?.hand).toHaveLength(2);

    const reshuffle = setup();
    const reshuffleOwner = reshuffle.others[0]!;
    grant(reshuffle.game, reshuffleOwner, "shelie");
    reshuffle.game.deck = [card("deck-2", "slash", "heart"), card("deck-1", "slash", "spade")];
    reshuffle.game.discardPile = [
      card("discard-1", "slash", "club"),
      card("discard-2", "slash", "diamond"),
      card("discard-3", "slash", "heart"),
    ];
    let state = applyAction(reshuffle.game, { type: "end_play", playerId: reshuffle.current.id });
    let prompt = standardPrompt(state, reshuffleOwner.id);
    state = applyAction(state, {
      type: "resolve_standard_skill",
      playerId: reshuffleOwner.id,
      promptId: prompt.promptId,
      activate: true,
    });
    prompt = standardPrompt(state, reshuffleOwner.id);
    expect(prompt.cards).toHaveLength(5);
    expect(state.completeRules.reshufflesRemaining).toBe(4);
  });

  it("preserves a committed Shelie reveal when an unrelated player forfeits", () => {
    const { game, current: starter, others: [owner, forfeiter] } = setup(5);
    if (!owner || !forfeiter) throw new Error("Missing Shelie forfeit fixtures");
    starter.role = "lord";
    forfeiter.role = "loyalist";
    for (const player of game.players) {
      if (player.id !== starter.id && player.id !== forfeiter.id) player.role = "rebel";
    }
    grant(game, owner, "shelie");
    game.deck = [
      card("forfeit-shelie-diamond", "slash", "diamond"),
      card("forfeit-shelie-club", "slash", "club"),
      card("forfeit-shelie-heart", "slash", "heart"),
      card("forfeit-shelie-spade-2", "slash", "spade"),
      card("forfeit-shelie-spade-1", "slash", "spade"),
    ];

    let state = applyAction(game, { type: "end_play", playerId: starter.id });
    let prompt = standardPrompt(state, owner.id);
    state = applyAction(state, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
    });
    prompt = standardPrompt(state, owner.id);
    const committedPromptId = prompt.promptId;
    const revealedIds = prompt.cards.map((entry) => entry.id);
    state = forfeitPlayer(JSON.parse(JSON.stringify(state)) as GameSession, forfeiter.id);
    const resumed = standardPrompt(state, owner.id);
    expect(resumed.promptId).toBe(committedPromptId);
    expect(resumed.cards.map((entry) => entry.id).sort()).toEqual([...revealedIds].sort());
    expect(Object.entries(state.players.find((player) => player.id === owner.id)!.extraPiles)
      .filter(([pileId]) => pileId.startsWith("shelie:"))[0]?.[1]).toHaveLength(5);

    state = applyAction(state, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: resumed.promptId,
      activate: true,
      cardIds: [
        "forfeit-shelie-spade-1",
        "forfeit-shelie-heart",
        "forfeit-shelie-club",
        "forfeit-shelie-diamond",
      ],
    });
    expect(state.turn).toMatchObject({ playerId: owner.id, phase: "play" });
    expect(state.players.find((player) => player.id === owner.id)?.hand).toHaveLength(4);
    expect(Object.keys(state.players.find((player) => player.id === owner.id)!.extraPiles)
      .some((pileId) => pileId.startsWith("shelie:"))).toBe(false);
    expect(state.players.flatMap((player) => [
      ...player.hand,
      ...Object.values(player.equipment),
      ...player.judgment,
      ...Object.values(player.extraPiles).flat(),
    ]).length + state.deck.length + state.discardPile.length + state.resolvingCards.length).toBe(5);
  });

  it("keeps Gongxin inspection private, validates frozen hand IDs, and top-decks one effective Heart", () => {
    const { game, current: owner, others: [target, observer] } = setup();
    if (!target || !observer) throw new Error("Missing Gongxin fixtures");
    grant(game, owner, "gongxin");
    grant(game, target, "hongyan");
    target.hand = [
      card("gongxin-effective-heart", "slash", "spade", 9),
      card("gongxin-private-club", "peach", "club", 3),
    ];
    game.deck = [card("gongxin-old-top", "dodge", "diamond")];

    let state = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "gongxin",
      targetId: target.id,
    });
    const prompt = standardPrompt(state, owner.id);
    expect(prompt).toMatchObject({
      skillId: "gongxin",
      stage: "gongxin_choose",
      allowedCardIds: ["gongxin-effective-heart"],
      options: ["discard", "put_on_draw_pile_top"],
      canPass: true,
    });
    expect(prompt.cards.map((entry) => entry.id).sort()).toEqual([
      "gongxin-effective-heart",
      "gongxin-private-club",
    ]);
    const observerView = getGameView(state, observer.id);
    expect(observerView.pendingResponse).toBeNull();
    expect(observerView.prompt).toEqual({ type: "waiting" });
    expect(JSON.stringify(observerView)).not.toContain("gongxin-private-club");
    const targetView = getGameView(state, target.id);
    expect(targetView.pendingResponse).toBeNull();
    expect(targetView.prompt).toEqual({ type: "waiting" });

    const forged = JSON.parse(JSON.stringify(state)) as GameSession;
    if (forged.pendingResponse?.type !== "standard_skill") throw new Error("Missing Gongxin continuation");
    forged.pendingResponse.selectedCardIds?.pop();
    expect(() => applyAction(forged, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "gongxin-effective-heart",
      tokens: ["put_on_draw_pile_top"],
    })).toThrow();

    const action = {
      type: "resolve_standard_skill" as const,
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "gongxin-effective-heart",
      tokens: ["put_on_draw_pile_top"],
    };
    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, action);
    expect(state.turn).toMatchObject({ playerId: owner.id, phase: "play" });
    expect(state.deck.at(-1)?.id).toBe("gongxin-effective-heart");
    expect(state.players.find((player) => player.id === target.id)?.hand.map((entry) => entry.id))
      .toEqual(["gongxin-private-club"]);
    const playPrompt = getGameView(state, owner.id).prompt;
    if (playPrompt.type !== "play") throw new Error("Expected restored play prompt");
    expect(playPrompt.skills.some((skill) => skill.skillId === "gongxin")).toBe(false);
    expect(() => applyAction(state, action)).toThrow();
  });

  it("initializes Qixing only at the explicit game-start boundary, keeps Stars private, and exchanges after draw", () => {
    const { game, current: owner, others: [observer] } = setup();
    if (!observer) throw new Error("Missing Qixing observer");
    grant(game, owner, "qixing");
    owner.hand = [
      card("qixing-hand-1", "slash", "spade"),
      card("qixing-hand-2", "dodge", "heart"),
      card("qixing-hand-3", "peach", "club"),
      card("qixing-hand-4", "wine", "diamond"),
    ];
    game.turn.phase = "prepare";
    game.deck = [
      card("qixing-draw-2", "slash", "diamond"),
      card("qixing-draw-1", "dodge", "club"),
      card("qixing-star-7", "slash", "spade"),
      card("qixing-star-6", "slash", "heart"),
      card("qixing-star-5", "slash", "club"),
      card("qixing-star-4", "slash", "diamond"),
      card("qixing-star-3", "dodge", "spade"),
      card("qixing-star-2", "peach", "heart"),
      card("qixing-star-1", "wine", "club"),
    ];

    let state = initializeGameStartSkills(game);
    let prompt = standardPrompt(state, owner.id);
    expect(prompt).toMatchObject({
      skillId: "qixing",
      stage: "qixing_initial",
      minCards: 0,
      maxCards: 8,
      canPass: false,
    });
    expect(state.players.find((player) => player.id === owner.id)?.hand).toHaveLength(4);
    const ownerView = getGameView(state, owner.id);
    const observerView = getGameView(state, observer.id);
    expect(ownerView.players.find((player) => player.id === owner.id)?.privatePiles.stars).toHaveLength(7);
    expect(observerView.players.find((player) => player.id === owner.id)).toMatchObject({
      publicPileCounts: { stars: 7 },
      privatePiles: {},
    });
    expect(JSON.stringify(observerView)).not.toContain("qixing-star-1");
    expect(() => initializeGameStartSkills(state)).toThrow();

    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      cardIds: ["qixing-hand-1", "qixing-star-1"],
    });
    prompt = standardPrompt(state, owner.id);
    expect(prompt).toMatchObject({ skillId: "qixing", stage: "qixing_exchange", canPass: true });
    const liveOwner = state.players.find((player) => player.id === owner.id)!;
    expect(liveOwner.hand.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      "qixing-star-1",
      "qixing-draw-1",
      "qixing-draw-2",
    ]));
    expect(liveOwner.extraPiles.stars?.map((entry) => entry.id)).toContain("qixing-hand-1");

    const forged = JSON.parse(JSON.stringify(state)) as GameSession;
    if (forged.pendingResponse?.type !== "standard_skill") throw new Error("Missing Qixing exchange continuation");
    forged.pendingResponse.starCardIds?.pop();
    expect(() => applyAction(forged, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      cardIds: ["qixing-draw-1", "qixing-hand-1"],
    })).toThrow();

    const action = {
      type: "resolve_standard_skill" as const,
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      cardIds: ["qixing-draw-1", "qixing-hand-1"],
    };
    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, action);
    expect(state.turn).toMatchObject({ playerId: owner.id, phase: "play" });
    const settled = state.players.find((player) => player.id === owner.id)!;
    expect(settled.hand.map((entry) => entry.id)).toContain("qixing-hand-1");
    expect(settled.extraPiles.stars?.map((entry) => entry.id)).toContain("qixing-draw-1");
    expect(settled.extraPiles.stars).toHaveLength(7);
    expect(() => applyAction(state, action)).toThrow();
  });

  it("awakens Baiyin authoritatively while retaining Ren marks across JSON restore", () => {
    const { game, current: starter, others: [owner] } = setup();
    if (!owner) throw new Error("Missing Baiyin owner");
    grant(game, owner, "baiyin");
    addMark(game.completeRules.lifecycle, {
      ownerId: owner.id,
      markId: "ren",
      sourcePlayerId: owner.id,
      sourceSkillId: "renjie",
      amount: 4,
      visibility: "public",
      expiry: { type: "permanent" },
    });
    owner.hp = owner.maxHp = 4;
    game.deck = [card("baiyin-draw-2"), card("baiyin-draw-1")];

    let state = applyAction(JSON.parse(JSON.stringify(game)) as GameSession, {
      type: "end_play",
      playerId: starter.id,
    });
    const awakened = state.players.find((player) => player.id === owner.id)!;
    expect(state.turn).toMatchObject({ playerId: owner.id, phase: "respond" });
    const prompt = standardPrompt(state, owner.id);
    expect(prompt).toMatchObject({ skillId: "jilue", stage: "jilue_wansha", canPass: true });
    expect(awakened).toMatchObject({ hp: 3, maxHp: 3 });
    expect(hasAwakened(state.completeRules.lifecycle, owner.id, "baiyin")).toBe(true);
    expect(markCount(state.completeRules.lifecycle, {
      ownerId: owner.id,
      markId: "ren",
      sourcePlayerId: owner.id,
      sourceSkillId: "renjie",
    })).toBe(4);
    expect(state.completeRules.lifecycle.grants).toEqual(expect.arrayContaining([
      expect.objectContaining({ ownerId: owner.id, skillId: "jilue", sourceSkillId: "baiyin" }),
    ]));
    state = applyAction(state, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: false,
    });
    expect(state.turn).toMatchObject({ playerId: owner.id, phase: "play" });
  });

  it("spends one Ren for Jilue Wansha at actual play start and expires it at turn end", () => {
    const { game, current: starter, others: [owner] } = setup();
    if (!owner) throw new Error("Missing Jilue Wansha owner");
    prepareJilue(game, owner);
    game.deck = [
      card("jilue-wansha-next-2"),
      card("jilue-wansha-next-1"),
      card("jilue-wansha-draw-2"),
      card("jilue-wansha-draw-1"),
    ];

    let state = applyAction(game, { type: "end_play", playerId: starter.id });
    const prompt = standardPrompt(state, owner.id);
    expect(prompt).toMatchObject({ skillId: "jilue", stage: "jilue_wansha", canPass: true });
    const forged = JSON.parse(JSON.stringify(state)) as GameSession;
    if (forged.pendingResponse?.type !== "standard_skill") throw new Error("Missing Jilue Wansha continuation");
    forged.pendingResponse.requestedCount = 1;
    expect(() => applyAction(forged, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
    })).toThrow();

    const action = {
      type: "resolve_standard_skill" as const,
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
    };
    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, action);
    expect(state.turn).toMatchObject({ playerId: owner.id, phase: "play" });
    expect(markCount(state.completeRules.lifecycle, {
      ownerId: owner.id,
      markId: "ren",
      sourcePlayerId: owner.id,
      sourceSkillId: "renjie",
    })).toBe(1);
    expect(getEffectiveGeneralSkillIds(state, owner.id)).toContain("wansha");
    expect(() => applyAction(state, action)).toThrow();

    state = applyAction(state, { type: "end_play", playerId: owner.id });
    expect(getEffectiveGeneralSkillIds(state, owner.id)).not.toContain("wansha");
    expect(state.completeRules.lifecycle.grants.some((entry) =>
      entry.ownerId === owner.id && entry.skillId === "wansha" && entry.sourceSkillId === "jilue")).toBe(false);
  });

  it("settles Jilue Zhiheng only after card-loss triggers, with strict JSON continuation and once limit", () => {
    const { game, current: owner } = setup();
    prepareJilue(game, owner);
    grant(game, owner, "lianying");
    grant(game, owner, "xiaoji");
    owner.hand = [card("jilue-zhiheng-hand")];
    owner.equipment.weapon = card("jilue-zhiheng-weapon", "qing_gang_jian");
    game.deck = Array.from({ length: 5 }, (_value, index) => card(`jilue-zhiheng-draw-${index + 1}`));
    const play = getGameView(game, owner.id).prompt;
    if (play.type !== "play") throw new Error("Expected Jilue play prompt");
    expect(play.skills).toEqual(expect.arrayContaining([
      expect.objectContaining({ skillId: "jilue", minCards: 1, maxCards: 2 }),
    ]));
    const action = {
      type: "use_skill" as const,
      playerId: owner.id,
      skillId: "jilue" as const,
      cardIds: ["jilue-zhiheng-hand", "jilue-zhiheng-weapon"],
    };

    let state = applyAction(JSON.parse(JSON.stringify(game)) as GameSession, action);
    expect(state.players.find((player) => player.id === owner.id)?.hand).toEqual([]);
    expect(state.discardPile.map((entry) => entry.id)).toEqual(expect.arrayContaining(action.cardIds));
    let prompt = getGameView(state, owner.id).prompt;
    expect(prompt).toMatchObject({ type: "skill_choice", skillId: "lianying" });

    const forged = JSON.parse(JSON.stringify(state)) as GameSession;
    if (forged.afterMove.suspendedResponse?.type !== "standard_skill") {
      throw new Error("Missing suspended Jilue Zhiheng continuation");
    }
    forged.afterMove.suspendedResponse.selectedCardIds?.pop();
    let forgedState = applyAction(forged, {
      type: "resolve_skill",
      playerId: owner.id,
      skillId: "lianying",
      promptId: prompt.type === "skill_choice" ? prompt.promptId : undefined,
      activate: false,
    });
    const forgedXiaoji = getGameView(forgedState, owner.id).prompt;
    if (forgedXiaoji.type !== "skill_choice") throw new Error("Missing forged Xiaoji prompt");
    expect(() => applyAction(forgedState, {
      type: "resolve_skill",
      playerId: owner.id,
      skillId: "xiaoji",
      promptId: forgedXiaoji.promptId,
      activate: false,
    })).toThrow();

    if (prompt.type !== "skill_choice") throw new Error("Missing Lianying prompt");
    state = applyAction(state, {
      type: "resolve_skill",
      playerId: owner.id,
      skillId: "lianying",
      promptId: prompt.promptId,
      activate: false,
    });
    prompt = getGameView(state, owner.id).prompt;
    if (prompt.type !== "skill_choice") throw new Error("Missing Xiaoji prompt");
    expect(prompt.skillId).toBe("xiaoji");
    state = applyAction(state, {
      type: "resolve_skill",
      playerId: owner.id,
      skillId: "xiaoji",
      promptId: prompt.promptId,
      activate: false,
    });
    expect(state.turn).toMatchObject({ playerId: owner.id, phase: "play" });
    expect(state.players.find((player) => player.id === owner.id)?.hand).toHaveLength(2);
    expect(markCount(state.completeRules.lifecycle, {
      ownerId: owner.id,
      markId: "ren",
      sourcePlayerId: owner.id,
      sourceSkillId: "renjie",
    })).toBe(1);
    const settledPlay = getGameView(state, owner.id).prompt;
    if (settledPlay.type !== "play") throw new Error("Expected settled play prompt");
    expect(settledPlay.skills.some((skill) => skill.skillId === "jilue")).toBe(false);
    expect(() => applyAction(state, action)).toThrow();
  });

  it("borrows Jizhi once for one ordinary trick use and spends Ren only on acceptance", () => {
    const { game, current: owner, others: [target] } = setup();
    if (!target) throw new Error("Missing Jilue Jizhi target");
    prepareJilue(game, owner);
    owner.hand = [card("jilue-jizhi-duel", "duel")];
    target.hand = [card("jilue-jizhi-target-slash", "slash")];
    game.deck = [card("jilue-jizhi-draw")];

    let state = applyAction(game, {
      type: "play_card",
      playerId: owner.id,
      cardId: "jilue-jizhi-duel",
      targetId: target.id,
    });
    let prompt = getGameView(state, owner.id).prompt;
    expect(prompt).toMatchObject({ type: "skill_choice", skillId: "jilue", canPass: true });
    const forged = JSON.parse(JSON.stringify(state)) as GameSession;
    if (forged.pendingResponse?.type !== "skill_choice") throw new Error("Missing Jilue Jizhi continuation");
    forged.pendingResponse.markCount = 1;
    expect(() => applyAction(forged, {
      type: "resolve_skill",
      playerId: owner.id,
      skillId: "jilue",
      promptId: prompt.type === "skill_choice" ? prompt.promptId : undefined,
      activate: true,
    })).toThrow();

    if (prompt.type !== "skill_choice") throw new Error("Missing Jilue Jizhi prompt");
    const action = {
      type: "resolve_skill" as const,
      playerId: owner.id,
      skillId: "jilue" as const,
      promptId: prompt.promptId,
      activate: true,
    };
    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, action);
    expect(state.pendingResponse).toMatchObject({ type: "duel", targetId: target.id });
    expect(state.players.find((player) => player.id === owner.id)?.hand.map((entry) => entry.id)).toContain("jilue-jizhi-draw");
    expect(markCount(state.completeRules.lifecycle, {
      ownerId: owner.id,
      markId: "ren",
      sourcePlayerId: owner.id,
      sourceSkillId: "renjie",
    })).toBe(1);
    expect(() => applyAction(state, action)).toThrow();
  });

  it("borrows Guicai with one hand card and does not duplicate an effective native Guicai", () => {
    const { game, current: starter, others: [judged, owner] } = setup();
    if (!judged || !owner) throw new Error("Missing Jilue Guicai fixtures");
    prepareJilue(game, owner);
    judged.judgment = [card("jilue-guicai-delay", "le_bu_si_shu")];
    owner.hand = [card("jilue-guicai-replacement", "slash", "heart")];
    game.deck = [
      card("jilue-guicai-draw-2"),
      card("jilue-guicai-draw-1"),
      card("jilue-guicai-original", "slash", "spade"),
    ];

    let state = applyAction(game, { type: "end_play", playerId: starter.id });
    const prompt = standardPrompt(state, owner.id);
    expect(prompt).toMatchObject({
      skillId: "jilue",
      stage: "judgment_retrial",
      allowedCardIds: ["jilue-guicai-replacement"],
      canPass: true,
    });
    const action = {
      type: "resolve_standard_skill" as const,
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "jilue-guicai-replacement",
    };
    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, action);
    expect(markCount(state.completeRules.lifecycle, {
      ownerId: owner.id,
      markId: "ren",
      sourcePlayerId: owner.id,
      sourceSkillId: "renjie",
    })).toBe(1);
    expect(state.discardPile.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      "jilue-guicai-original",
      "jilue-guicai-replacement",
    ]));
    expect(() => applyAction(state, action)).toThrow();

    const native = setup();
    const nativeJudged = native.others[0]!;
    const nativeOwner = native.others[1]!;
    prepareJilue(native.game, nativeOwner);
    grant(native.game, nativeOwner, "guicai");
    nativeJudged.judgment = [card("native-guicai-delay", "le_bu_si_shu")];
    nativeOwner.hand = [card("native-guicai-replacement", "slash", "heart")];
    native.game.deck = [card("native-guicai-original", "slash", "spade")];
    const nativeState = applyAction(native.game, { type: "end_play", playerId: native.current.id });
    expect(standardPrompt(nativeState, nativeOwner.id).skillId).toBe("guicai");
    if (nativeState.pendingResponse?.type !== "standard_judgment") throw new Error("Missing native Guicai frame");
    expect(nativeState.pendingResponse.frame.retrialOrder.filter((entry) => entry.ownerId === nativeOwner.id))
      .toEqual([{ ownerId: nativeOwner.id, skillId: "guicai" }]);
  });

  it("gains Ren before offering Jilue Fangzhu and settles turn-over before the draw", () => {
    const { game, current: attacker, others: [owner, beneficiary] } = setup();
    if (!owner || !beneficiary) throw new Error("Missing Jilue Fangzhu fixtures");
    prepareJilue(game, owner, 0);
    grant(game, owner, "renjie");
    attacker.hand = [card("jilue-fangzhu-slash", "slash")];
    game.deck = [card("jilue-fangzhu-draw")];

    let state = applyAction(game, {
      type: "play_card",
      playerId: attacker.id,
      cardId: "jilue-fangzhu-slash",
      targetId: owner.id,
    });
    state = applyAction(state, { type: "respond", playerId: owner.id });
    const prompt = standardPrompt(state, owner.id);
    expect(prompt).toMatchObject({ skillId: "jilue", stage: "jilue_fangzhu", canPass: true });
    expect(markCount(state.completeRules.lifecycle, {
      ownerId: owner.id,
      markId: "ren",
      sourcePlayerId: owner.id,
      sourceSkillId: "renjie",
    })).toBe(1);
    const action = {
      type: "resolve_standard_skill" as const,
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      targetId: beneficiary.id,
    };
    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, action);
    const settledBeneficiary = state.players.find((player) => player.id === beneficiary.id)!;
    expect(settledBeneficiary.faceUp).toBe(false);
    expect(settledBeneficiary.hand.map((entry) => entry.id)).toEqual(["jilue-fangzhu-draw"]);
    expect(markCount(state.completeRules.lifecycle, {
      ownerId: owner.id,
      markId: "ren",
      sourcePlayerId: owner.id,
      sourceSkillId: "renjie",
    })).toBe(0);
    expect(() => applyAction(state, action)).toThrow();
  });

  it("initializes multiple Qixing owners in stable seat order", () => {
    const { game, current } = setup(5);
    const [first, second] = game.players
      .filter((player) => player.id !== current.id)
      .sort((left, right) => left.seat - right.seat);
    if (!first || !second) throw new Error("Missing multiple Qixing owners");
    for (const [index, owner] of [first, second].entries()) {
      grant(game, owner, "qixing");
      owner.hand = Array.from({ length: 4 }, (_value, cardIndex) =>
        card(`multi-qixing-${index + 1}-hand-${cardIndex + 1}`));
    }
    game.turn.phase = "prepare";
    game.deck = Array.from({ length: 16 }, (_value, index) => card(`multi-qixing-deck-${index + 1}`));

    let state = initializeGameStartSkills(game);
    let prompt = standardPrompt(state, first.id);
    expect(state.pendingResponse).toMatchObject({ targetId: first.id });
    expect(prompt).toMatchObject({ skillId: "qixing", stage: "qixing_initial" });
    state = applyAction(state, {
      type: "resolve_standard_skill",
      playerId: first.id,
      promptId: prompt.promptId,
      activate: true,
      cardIds: [],
    });
    prompt = standardPrompt(state, second.id);
    expect(state.pendingResponse).toMatchObject({ targetId: second.id });
    expect(prompt).toMatchObject({ skillId: "qixing", stage: "qixing_initial" });
    state = applyAction(state, {
      type: "resolve_standard_skill",
      playerId: second.id,
      promptId: prompt.promptId,
      activate: true,
      cardIds: [],
    });
    expect(state.turn).toMatchObject({ playerId: current.id, phase: "play" });
  });

  it("cleans a forfeiting Qixing owner's private setup and continues the next setup", () => {
    const { game, current } = setup(5);
    const [departing, nextOwner] = game.players
      .filter((player) => player.id !== current.id)
      .sort((left, right) => left.seat - right.seat);
    if (!departing || !nextOwner) throw new Error("Missing Qixing forfeit fixtures");
    current.role = "lord";
    departing.role = "loyalist";
    for (const player of game.players) {
      if (player.id !== current.id && player.id !== departing.id) player.role = "rebel";
    }
    for (const [index, owner] of [departing, nextOwner].entries()) {
      grant(game, owner, "qixing");
      owner.hand = Array.from({ length: 4 }, (_value, cardIndex) =>
        card(`forfeit-qixing-${index + 1}-hand-${cardIndex + 1}`));
    }
    game.turn.phase = "prepare";
    game.deck = Array.from({ length: 16 }, (_value, index) => card(`forfeit-qixing-deck-${index + 1}`));

    let state = initializeGameStartSkills(game);
    expect(standardPrompt(state, departing.id)).toMatchObject({ stage: "qixing_initial" });
    const departedCardIds = [
      ...state.players.find((player) => player.id === departing.id)!.hand,
      ...state.players.find((player) => player.id === departing.id)!.extraPiles.stars!,
    ].map((entry) => entry.id);
    state = forfeitPlayer(JSON.parse(JSON.stringify(state)) as GameSession, departing.id);
    const departed = state.players.find((player) => player.id === departing.id)!;
    expect(departed).toMatchObject({ alive: false, hand: [], extraPiles: { stars: [] } });
    expect(state.discardPile.map((entry) => entry.id)).toEqual(expect.arrayContaining(departedCardIds));
    const prompt = standardPrompt(state, nextOwner.id);
    expect(state.pendingResponse).toMatchObject({ targetId: nextOwner.id });
    expect(prompt).toMatchObject({ skillId: "qixing", stage: "qixing_initial" });
  });

  it("commits Kuangfeng then Dawu from frozen Stars and projects only source-isolated public weather", () => {
    const { game, current: owner, others: [nextPlayer, target, observer, forfeiter] } = setup(5);
    if (!nextPlayer || !target || !observer || !forfeiter) throw new Error("Missing weather activation fixtures");
    owner.role = "lord";
    forfeiter.role = "loyalist";
    for (const player of game.players) {
      if (player.id !== owner.id && player.id !== forfeiter.id) player.role = "rebel";
    }
    grant(game, owner, "kuangfeng");
    grant(game, owner, "dawu");
    owner.extraPiles.stars = [
      card("weather-star-kuangfeng"),
      card("weather-star-dawu"),
      card("weather-star-private"),
    ];
    game.deck = [card("weather-draw-4"), card("weather-draw-3"), card("weather-draw-2"), card("weather-draw-1")];

    let state = applyAction(game, { type: "end_play", playerId: owner.id });
    let prompt = standardPrompt(state, owner.id);
    expect(prompt).toMatchObject({
      skillId: "kuangfeng",
      stage: "kuangfeng_choice",
      allowedCardIds: ["weather-star-kuangfeng", "weather-star-dawu", "weather-star-private"],
      targetIds: game.players.map((player) => player.id),
      minCards: 1,
      maxCards: 1,
      minTargets: 1,
      maxTargets: 1,
      canPass: true,
    });
    const forged = JSON.parse(JSON.stringify(state)) as GameSession;
    if (forged.pendingResponse?.type !== "standard_skill") throw new Error("Missing Kuangfeng continuation");
    forged.pendingResponse.starCardIds?.pop();
    expect(() => applyAction(forged, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "weather-star-kuangfeng",
      targetId: target.id,
    })).toThrow();

    const frozenPromptId = prompt.promptId;
    state = forfeitPlayer(JSON.parse(JSON.stringify(state)) as GameSession, forfeiter.id);
    prompt = standardPrompt(state, owner.id);
    expect(prompt.promptId).toBe(frozenPromptId);
    expect(prompt.targetIds).not.toContain(forfeiter.id);

    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "weather-star-kuangfeng",
      targetId: target.id,
    });
    prompt = standardPrompt(state, owner.id);
    expect(prompt).toMatchObject({
      skillId: "dawu",
      stage: "dawu_choice",
      allowedCardIds: ["weather-star-dawu", "weather-star-private"],
      minCards: 1,
      maxCards: 2,
      minTargets: 1,
      maxTargets: 2,
      canPass: true,
    });
    const dawuAction = {
      type: "resolve_standard_skill" as const,
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      cardIds: ["weather-star-dawu"],
      targetIds: [target.id],
    };
    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, dawuAction);
    expect(state.turn).toMatchObject({ playerId: nextPlayer.id, phase: "play" });
    expect(state.discardPile.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      "weather-star-kuangfeng",
      "weather-star-dawu",
    ]));
    expect(state.players.find((player) => player.id === owner.id)?.extraPiles.stars?.map((entry) => entry.id))
      .toEqual(["weather-star-private"]);
    const effects = getGameView(state, observer.id).players.find((player) => player.id === target.id)?.publicEffects;
    expect(effects).toEqual([
      expect.objectContaining({ kind: "kuangfeng", targetPlayerId: target.id, sourcePlayerId: owner.id }),
      expect.objectContaining({ kind: "dawu", targetPlayerId: target.id, sourcePlayerId: owner.id }),
    ]);
    expect(JSON.stringify(getGameView(state, observer.id))).not.toContain("weather-star-private");
    expect(() => applyAction(state, dawuAction)).toThrow();
  });

  it("orders Dawu, Tengjia, Kuangfeng, and Silver Lion in the authoritative receiving window", () => {
    const resolveKuangfengFire = (armorKind: Extract<CardKind, "teng_jia" | "bai_yin_shi_zi">) => {
      const { game, current: owner, others: [attacker, target] } = setup();
      if (!attacker || !target) throw new Error("Missing weather armor fixtures");
      grant(game, owner, "kuangfeng");
      owner.extraPiles.stars = [card(`armor-${armorKind}-star`)];
      target.equipment.armor = card(`armor-${armorKind}`, armorKind);
      attacker.hand = [card(`armor-${armorKind}-fire`, "fire_slash", "heart")];
      game.deck = Array.from({ length: 8 }, (_value, index) => card(`armor-${armorKind}-draw-${index + 1}`));
      let state = applyAction(game, { type: "end_play", playerId: owner.id });
      const prompt = standardPrompt(state, owner.id);
      state = applyAction(state, {
        type: "resolve_standard_skill",
        playerId: owner.id,
        promptId: prompt.promptId,
        activate: true,
        cardId: `armor-${armorKind}-star`,
        targetId: target.id,
      });
      state = applyAction(state, {
        type: "play_card",
        playerId: attacker.id,
        cardId: `armor-${armorKind}-fire`,
        targetId: target.id,
      });
      return applyAction(JSON.parse(JSON.stringify(state)) as GameSession, {
        type: "respond",
        playerId: target.id,
        cardId: null,
      });
    };

    const tengjia = resolveKuangfengFire("teng_jia");
    const tengjiaTarget = tengjia.completeRules.damageFlow.consumedActions
      .filter((entry) => entry.outcome === "resolve")
      .map((entry) => entry.resolutionRef);
    expect(tengjia.players.find((player) => player.equipment.armor?.kind === "teng_jia")?.hp).toBe(1);
    expect(tengjiaTarget.findIndex((entry) => entry?.startsWith("teng_jia:")))
      .toBeLessThan(tengjiaTarget.findIndex((entry) => entry?.startsWith("kuangfeng:")));

    const silverLion = resolveKuangfengFire("bai_yin_shi_zi");
    const silverRefs = silverLion.completeRules.damageFlow.consumedActions
      .filter((entry) => entry.outcome === "resolve")
      .map((entry) => entry.resolutionRef);
    expect(silverLion.players.find((player) => player.equipment.armor?.kind === "bai_yin_shi_zi")?.hp).toBe(3);
    expect(silverRefs.findIndex((entry) => entry?.startsWith("kuangfeng:")))
      .toBeLessThan(silverRefs.findIndex((entry) => entry?.startsWith("bai_yin_shi_zi:")));

    const thunder = setup();
    const thunderOwner = thunder.current;
    const [thunderAttacker, thunderTarget] = thunder.others;
    if (!thunderAttacker || !thunderTarget) throw new Error("Missing weather thunder fixtures");
    grant(thunder.game, thunderOwner, "kuangfeng");
    grant(thunder.game, thunderOwner, "dawu");
    thunderOwner.extraPiles.stars = [card("thunder-kuangfeng-star"), card("thunder-dawu-star")];
    thunderAttacker.hand = [card("weather-thunder-slash", "thunder_slash", "spade")];
    thunder.game.deck = Array.from({ length: 8 }, (_value, index) => card(`weather-thunder-draw-${index + 1}`));
    let thunderState = applyAction(thunder.game, { type: "end_play", playerId: thunderOwner.id });
    let thunderPrompt = standardPrompt(thunderState, thunderOwner.id);
    thunderState = applyAction(thunderState, {
      type: "resolve_standard_skill",
      playerId: thunderOwner.id,
      promptId: thunderPrompt.promptId,
      activate: true,
      cardId: "thunder-kuangfeng-star",
      targetId: thunderTarget.id,
    });
    thunderPrompt = standardPrompt(thunderState, thunderOwner.id);
    thunderState = applyAction(thunderState, {
      type: "resolve_standard_skill",
      playerId: thunderOwner.id,
      promptId: thunderPrompt.promptId,
      activate: true,
      cardIds: ["thunder-dawu-star"],
      targetIds: [thunderTarget.id],
    });
    thunderState = applyAction(thunderState, {
      type: "play_card",
      playerId: thunderAttacker.id,
      cardId: "weather-thunder-slash",
      targetId: thunderTarget.id,
    });
    thunderState = applyAction(thunderState, { type: "respond", playerId: thunderTarget.id, cardId: null });
    expect(thunderState.players.find((player) => player.id === thunderTarget.id)?.hp).toBe(3);
    expect(thunderState.completeRules.damageFlow.consumedActions
      .filter((entry) => entry.resolutionRef?.startsWith("dawu:") || entry.resolutionRef?.startsWith("kuangfeng:")))
      .toEqual([]);
  });

  it("keeps fog-protected chain roles linked while preserving propagation to later roles", () => {
    const initial = setup();
    const initialOwner = initial.current;
    const [initialAttacker, initialTarget, initialPeer] = initial.others;
    if (!initialAttacker || !initialTarget || !initialPeer) throw new Error("Missing initial fog-chain fixtures");
    grant(initial.game, initialOwner, "dawu");
    initialOwner.extraPiles.stars = [card("initial-chain-dawu-star")];
    initialTarget.chained = true;
    initialPeer.chained = true;
    initialAttacker.hand = [card("initial-chain-fire", "fire_slash", "heart")];
    initial.game.deck = Array.from({ length: 8 }, (_value, index) => card(`initial-chain-draw-${index + 1}`));
    let initialState = applyAction(initial.game, { type: "end_play", playerId: initialOwner.id });
    let prompt = standardPrompt(initialState, initialOwner.id);
    initialState = applyAction(initialState, {
      type: "resolve_standard_skill",
      playerId: initialOwner.id,
      promptId: prompt.promptId,
      activate: true,
      cardIds: ["initial-chain-dawu-star"],
      targetIds: [initialTarget.id],
    });
    initialState = applyAction(initialState, {
      type: "play_card",
      playerId: initialAttacker.id,
      cardId: "initial-chain-fire",
      targetId: initialTarget.id,
    });
    initialState = applyAction(initialState, { type: "respond", playerId: initialTarget.id, cardId: null });
    expect(initialState.players.find((player) => player.id === initialTarget.id))
      .toMatchObject({ hp: 4, chained: true });
    expect(initialState.players.find((player) => player.id === initialPeer.id))
      .toMatchObject({ hp: 4, chained: true });
    expect(initialState.completeRules.damageFlow.completedDamageIds).toEqual([1]);

    const propagated = setup(5);
    const propagatedOwner = propagated.current;
    const [propagatedAttacker, firstTarget, fogTarget, tailTarget] = propagated.others;
    if (!propagatedAttacker || !firstTarget || !fogTarget || !tailTarget) {
      throw new Error("Missing propagated fog-chain fixtures");
    }
    grant(propagated.game, propagatedOwner, "dawu");
    propagatedOwner.extraPiles.stars = [card("propagated-chain-dawu-star")];
    firstTarget.chained = true;
    fogTarget.chained = true;
    tailTarget.chained = true;
    propagatedAttacker.hand = [card("propagated-chain-fire", "fire_slash", "diamond")];
    propagated.game.deck = Array.from({ length: 10 }, (_value, index) => card(`propagated-chain-draw-${index + 1}`));
    let propagatedState = applyAction(propagated.game, { type: "end_play", playerId: propagatedOwner.id });
    prompt = standardPrompt(propagatedState, propagatedOwner.id);
    propagatedState = applyAction(propagatedState, {
      type: "resolve_standard_skill",
      playerId: propagatedOwner.id,
      promptId: prompt.promptId,
      activate: true,
      cardIds: ["propagated-chain-dawu-star"],
      targetIds: [fogTarget.id],
    });
    propagatedState = applyAction(propagatedState, {
      type: "play_card",
      playerId: propagatedAttacker.id,
      cardId: "propagated-chain-fire",
      targetId: firstTarget.id,
    });
    propagatedState = applyAction(propagatedState, { type: "respond", playerId: firstTarget.id, cardId: null });
    expect(propagatedState.players.find((player) => player.id === firstTarget.id))
      .toMatchObject({ hp: 3, chained: false });
    expect(propagatedState.players.find((player) => player.id === fogTarget.id))
      .toMatchObject({ hp: 4, chained: true });
    expect(propagatedState.players.find((player) => player.id === tailTarget.id))
      .toMatchObject({ hp: 3, chained: false });
    expect(propagatedState.completeRules.damageFlow.completedDamageIds).toEqual([1, 2, 3]);
  });

  it("prevents ordinary damage with Dawu and expires each weather source independently on death", () => {
    const normal = setup();
    const normalOwner = normal.current;
    const [normalAttacker, normalTarget] = normal.others;
    if (!normalAttacker || !normalTarget) throw new Error("Missing ordinary Dawu fixtures");
    grant(normal.game, normalOwner, "dawu");
    normalOwner.extraPiles.stars = [card("normal-dawu-star")];
    normalAttacker.hand = [card("normal-dawu-slash")];
    normal.game.deck = Array.from({ length: 8 }, (_value, index) => card(`normal-dawu-draw-${index + 1}`));
    let normalState = applyAction(normal.game, { type: "end_play", playerId: normalOwner.id });
    let prompt = standardPrompt(normalState, normalOwner.id);
    normalState = applyAction(normalState, {
      type: "resolve_standard_skill",
      playerId: normalOwner.id,
      promptId: prompt.promptId,
      activate: true,
      cardIds: ["normal-dawu-star"],
      targetIds: [normalTarget.id],
    });
    normalState = applyAction(normalState, {
      type: "play_card",
      playerId: normalAttacker.id,
      cardId: "normal-dawu-slash",
      targetId: normalTarget.id,
    });
    normalState = applyAction(normalState, { type: "respond", playerId: normalTarget.id, cardId: null });
    expect(normalState.players.find((player) => player.id === normalTarget.id)?.hp).toBe(4);
    expect(normalState.completeRules.damageFlow.consumedActions
      .some((entry) => entry.resolutionRef?.startsWith("dawu:"))).toBe(true);

    const isolated = setup(5);
    const sourceOne = isolated.current;
    const [sourceTwo, attacker, target, lord] = isolated.others;
    if (!sourceTwo || !attacker || !target || !lord) throw new Error("Missing source-isolation fixtures");
    sourceOne.role = "loyalist";
    lord.role = "lord";
    sourceTwo.role = "rebel";
    attacker.role = "rebel";
    target.role = "rebel";
    for (const [index, source] of [sourceOne, sourceTwo].entries()) {
      grant(isolated.game, source, "kuangfeng");
      source.extraPiles.stars = [card(`isolated-kuangfeng-star-${index + 1}`)];
    }
    attacker.hand = [card("isolated-kuangfeng-fire", "fire_slash", "heart")];
    isolated.game.deck = Array.from({ length: 14 }, (_value, index) => card(`isolated-draw-${index + 1}`));

    let state = applyAction(isolated.game, { type: "end_play", playerId: sourceOne.id });
    prompt = standardPrompt(state, sourceOne.id);
    state = applyAction(state, {
      type: "resolve_standard_skill",
      playerId: sourceOne.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "isolated-kuangfeng-star-1",
      targetId: target.id,
    });
    state = applyAction(state, { type: "end_play", playerId: sourceTwo.id });
    prompt = standardPrompt(state, sourceTwo.id);
    state = applyAction(state, {
      type: "resolve_standard_skill",
      playerId: sourceTwo.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "isolated-kuangfeng-star-2",
      targetId: target.id,
    });
    let effects = getGameView(state, lord.id).players.find((player) => player.id === target.id)?.publicEffects ?? [];
    expect(effects.map((effect) => effect.sourcePlayerId)).toEqual([sourceOne.id, sourceTwo.id]);

    state = forfeitPlayer(JSON.parse(JSON.stringify(state)) as GameSession, sourceOne.id);
    effects = getGameView(state, lord.id).players.find((player) => player.id === target.id)?.publicEffects ?? [];
    expect(effects).toEqual([
      expect.objectContaining({ kind: "kuangfeng", sourcePlayerId: sourceTwo.id, targetPlayerId: target.id }),
    ]);
    state = applyAction(state, {
      type: "play_card",
      playerId: attacker.id,
      cardId: "isolated-kuangfeng-fire",
      targetId: target.id,
    });
    state = applyAction(state, { type: "respond", playerId: target.id, cardId: null });
    expect(state.players.find((player) => player.id === target.id)?.hp).toBe(2);

    state = forfeitPlayer(JSON.parse(JSON.stringify(state)) as GameSession, target.id);
    expect(getGameView(state, lord.id).players.find((player) => player.id === target.id)?.publicEffects).toEqual([]);
    expect(state.completeRules.lifecycle.effects.some((effect) =>
      effect.ownerId === target.id && (effect.sourceSkillId === "kuangfeng" || effect.sourceSkillId === "dawu"))).toBe(false);
  });

  it("cleans source-owned weather at the source's next turn-start boundary after JSON restore", () => {
    const { game, current: owner, others: [nextPlayer, target] } = setup(3);
    if (!nextPlayer || !target) throw new Error("Missing turn-start weather fixtures");
    grant(game, owner, "kuangfeng");
    owner.extraPiles.stars = [card("turn-start-kuangfeng-star")];
    game.deck = Array.from({ length: 12 }, (_value, index) => card(`turn-start-draw-${index + 1}`));
    let state = applyAction(game, { type: "end_play", playerId: owner.id });
    const prompt = standardPrompt(state, owner.id);
    state = applyAction(state, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "turn-start-kuangfeng-star",
      targetId: target.id,
    });
    expect(getGameView(state, nextPlayer.id).players.find((player) => player.id === target.id)?.publicEffects)
      .toEqual([expect.objectContaining({ kind: "kuangfeng", sourcePlayerId: owner.id })]);

    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, {
      type: "end_play",
      playerId: nextPlayer.id,
    });
    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, {
      type: "end_play",
      playerId: target.id,
    });
    expect(state.turn).toMatchObject({ playerId: owner.id, phase: "play" });
    expect(getGameView(state, nextPlayer.id).players.find((player) => player.id === target.id)?.publicEffects).toEqual([]);
  });
});
