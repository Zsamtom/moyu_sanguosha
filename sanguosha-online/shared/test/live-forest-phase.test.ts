import { describe, expect, it } from "vitest";

import {
  applyAction,
  createGame,
  decodeGameDamageContinuation,
  encodeGameDamageContinuation,
  getCardDefinition,
  getGameView,
  grantSkill,
  type Card,
  type CardKind,
  type GamePlayer,
  type GameSession,
} from "../src/index.js";

const seed = "c7".repeat(32);

function card(id: string, kind: CardKind, suit: Card["suit"] = "club"): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank: 7 };
}

function setup(): { game: GameSession; current: GamePlayer; others: GamePlayer[] } {
  const game = createGame({ playerIds: ["forest-c-1", "forest-c-2", "forest-c-3", "forest-c-4"], seed });
  const current = game.players.find((player) => player.id === game.currentPlayerId)!;
  const currentIndex = game.players.findIndex((player) => player.id === current.id);
  const others = Array.from({ length: game.players.length - 1 }, (_value, index) =>
    game.players[(currentIndex + index + 1) % game.players.length]!,
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
  game.pendingResponse = null;
  game.afterMove = { queuedRecoveries: [], queuedTriggers: [], suspendedPhase: null, suspendedResponse: null };
  game.turn = {
    ...game.turn,
    playerId: current.id,
    phase: "play",
    slashUsed: false,
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
    activeSlashUses: 0,
    tianyiOutcome: null,
    skillUseCounts: {},
    rendeGivenCount: 0,
    rendeRecovered: false,
  };
  return { game, current, others };
}

function grant(game: GameSession, ownerId: string, skillId: Parameters<typeof grantSkill>[1]["skillId"]): void {
  grantSkill(game.completeRules.lifecycle, {
    ownerId,
    skillId,
    sourcePlayerId: ownerId,
    sourceSkillId: "test",
    expiry: { type: "permanent" },
  });
}

function standardPrompt(game: GameSession, playerId: string) {
  const prompt = getGameView(game, playerId).prompt;
  if (prompt.type !== "standard_skill") throw new Error(`Expected standard skill prompt, got ${prompt.type}`);
  return prompt;
}

function skillChoicePrompt(game: GameSession, playerId: string) {
  const prompt = getGameView(game, playerId).prompt;
  if (prompt.type !== "skill_choice" || !prompt.promptId) throw new Error(`Expected skill choice prompt, got ${prompt.type}`);
  return prompt;
}

describe("live Forest phase skills", () => {
  it("applies Haoshi after replacements decline, then enforces an atomic half-hand transfer", () => {
    const { game, current: starter, others: [owner, poorest, richer] } = setup();
    if (!owner || !poorest || !richer) throw new Error("Missing Haoshi fixtures");
    owner.generalId = "lu_su";
    owner.hand = [card("haoshi-old-1", "slash"), card("haoshi-old-2", "dodge")];
    richer.hand = [card("haoshi-richer", "peach")];
    game.deck = [
      card("haoshi-draw-4", "slash"),
      card("haoshi-draw-3", "dodge"),
      card("haoshi-draw-2", "peach"),
      card("haoshi-draw-1", "wine"),
    ];

    let state = applyAction(game, { type: "end_play", playerId: starter.id });
    let prompt = standardPrompt(state, owner.id);
    expect(prompt).toMatchObject({ skillId: "haoshi", stage: "haoshi_draw", canPass: true });
    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, {
      type: "resolve_standard_skill", playerId: owner.id, promptId: prompt.promptId, activate: true,
    });
    prompt = standardPrompt(state, owner.id);
    expect(prompt).toMatchObject({
      skillId: "haoshi",
      stage: "haoshi_transfer",
      canPass: false,
      targetIds: expect.arrayContaining([poorest.id]),
      minCards: 3,
      maxCards: 3,
    });
    const transferred = prompt.allowedCardIds.slice(0, 3);
    const action = {
      type: "resolve_standard_skill" as const,
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      targetId: poorest.id,
      cardIds: transferred,
    };
    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, action);
    expect(state.turn).toMatchObject({ playerId: owner.id, phase: "play", haoshiActive: false });
    expect(state.players.find((player) => player.id === owner.id)?.hand).toHaveLength(3);
    expect(state.players.find((player) => player.id === poorest.id)?.hand.map((entry) => entry.id)).toEqual(transferred);
    expect(() => applyAction(state, action)).toThrow();
  });

  it("settles Zaiqi from deck plus discard using only printed Hearts and rejects replay", () => {
    const { game, current: starter, others: [owner] } = setup();
    if (!owner) throw new Error("Missing Zaiqi owner");
    owner.generalId = "meng_huo";
    owner.hp = 2;
    game.deck = [card("zaiqi-nonheart", "slash", "diamond")];
    game.discardPile = [card("zaiqi-heart", "dodge", "heart")];

    let state = applyAction(game, { type: "end_play", playerId: starter.id });
    const prompt = standardPrompt(state, owner.id);
    expect(prompt).toMatchObject({ skillId: "zaiqi", stage: "zaiqi_draw", canPass: true });
    const action = {
      type: "resolve_standard_skill" as const,
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
    };
    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, action);
    expect(state.turn).toMatchObject({ playerId: owner.id, phase: "play" });
    expect(state.players.find((player) => player.id === owner.id)).toMatchObject({ hp: 3 });
    expect(state.players.find((player) => player.id === owner.id)?.hand.map((entry) => entry.id)).toEqual(["zaiqi-nonheart"]);
    expect(state.discardPile.map((entry) => entry.id)).toContain("zaiqi-heart");
    expect(state.resolvingCards).toEqual([]);
    expect(() => applyAction(state, action)).toThrow();
  });

  it("draws before Yinghun's one-batch discard and restores Lianying/Xiaoji continuations", () => {
    const { game, current: starter, others: [owner, target] } = setup();
    if (!owner || !target) throw new Error("Missing Yinghun fixtures");
    owner.generalId = "sun_jian";
    owner.hp = 2;
    target.equipment.weapon = card("yinghun-weapon", "qing_long_yan_yue_dao");
    grant(game, target.id, "lianying");
    grant(game, target.id, "xiaoji");
    game.deck = [card("yinghun-drawn", "dodge")];

    let state = applyAction(game, { type: "end_play", playerId: starter.id });
    let prompt = standardPrompt(state, owner.id);
    expect(prompt).toMatchObject({
      skillId: "yinghun",
      stage: "yinghun_select",
      options: ["draw_x_discard_one", "draw_one_discard_x"],
      targetIds: expect.arrayContaining([target.id]),
    });
    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      targetId: target.id,
      tokens: ["draw_one_discard_x"],
    });
    prompt = standardPrompt(state, target.id);
    expect(prompt).toMatchObject({ skillId: "yinghun", stage: "yinghun_discard", minCards: 2, maxCards: 2, canPass: false });
    expect(prompt.allowedCardIds).toEqual(expect.arrayContaining(["yinghun-drawn", "yinghun-weapon"]));
    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, {
      type: "resolve_standard_skill",
      playerId: target.id,
      promptId: prompt.promptId,
      activate: true,
      cardIds: ["yinghun-drawn", "yinghun-weapon"],
    });
    expect(state.pendingResponse).toMatchObject({ type: "skill_choice", skillId: "lianying", targetId: target.id });
    expect(state.afterMove.suspendedResponse).toMatchObject({ type: "standard_skill", skillId: "yinghun", stage: "yinghun_finish" });

    let choice = skillChoicePrompt(state, target.id);
    state = applyAction(state, {
      type: "resolve_skill", playerId: target.id, skillId: "lianying", promptId: choice.promptId, activate: false,
    });
    choice = skillChoicePrompt(state, target.id);
    expect(choice.skillId).toBe("xiaoji");
    state = applyAction(state, {
      type: "resolve_skill", playerId: target.id, skillId: "xiaoji", promptId: choice.promptId, activate: false,
    });
    expect(state.turn).toMatchObject({ playerId: owner.id, phase: "play" });
    expect(state.players.find((player) => player.id === target.id)).toMatchObject({ hand: [], equipment: {} });
    expect(state.logs.some((entry) => entry.message.includes("一次性弃置了 2 张牌"))).toBe(true);
  });

  it("pays Dimeng first, resolves owner move triggers, then atomically swaps target hands", () => {
    const { game, current: owner, others: [first, second] } = setup();
    if (!first || !second) throw new Error("Missing Dimeng targets");
    owner.generalId = "lu_su";
    owner.hand = [card("dimeng-last-hand", "dodge")];
    owner.equipment.weapon = card("dimeng-equipment", "qing_long_yan_yue_dao");
    first.hand = [card("dimeng-first", "slash")];
    second.hand = [card("dimeng-second-1", "peach"), card("dimeng-second-2", "dodge"), card("dimeng-second-3", "wine")];
    grant(game, owner.id, "lianying");
    grant(game, owner.id, "xiaoji");

    let state = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "dimeng",
      targetIds: [first.id, second.id],
      cardIds: ["dimeng-last-hand", "dimeng-equipment"],
    });
    expect(state.pendingResponse).toMatchObject({ type: "skill_choice", skillId: "lianying", targetId: owner.id });
    expect(state.afterMove.suspendedResponse).toMatchObject({ type: "standard_skill", skillId: "dimeng", stage: "dimeng_swap" });
    expect(state.players.find((player) => player.id === first.id)?.hand.map((entry) => entry.id)).toEqual(["dimeng-first"]);

    let choice = skillChoicePrompt(JSON.parse(JSON.stringify(state)) as GameSession, owner.id);
    state = applyAction(state, {
      type: "resolve_skill", playerId: owner.id, skillId: "lianying", promptId: choice.promptId, activate: false,
    });
    choice = skillChoicePrompt(state, owner.id);
    expect(choice.skillId).toBe("xiaoji");
    state = applyAction(state, {
      type: "resolve_skill", playerId: owner.id, skillId: "xiaoji", promptId: choice.promptId, activate: false,
    });
    expect(state.turn.phase).toBe("play");
    expect(state.players.find((player) => player.id === first.id)?.hand.map((entry) => entry.id)).toEqual([
      "dimeng-second-1", "dimeng-second-2", "dimeng-second-3",
    ]);
    expect(state.players.find((player) => player.id === second.id)?.hand.map((entry) => entry.id)).toEqual(["dimeng-first"]);
    expect(state.turn.skillUseCounts.dimeng).toBe(1);
    expect(() => applyAction(state, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "dimeng",
      targetIds: [first.id, second.id],
      cardIds: [],
    })).toThrow();
  });

  it.each([
    {
      label: "physical Slash",
      generalId: "gan_ning" as const,
      configure(actor: GamePlayer) {
        actor.hand = [card("luanwu-physical", "fire_slash", "diamond")];
      },
      selection: { cardId: "luanwu-physical" },
      option: "physical_slash",
    },
    {
      label: "Wusheng",
      generalId: "guan_yu" as const,
      configure(actor: GamePlayer) {
        actor.hand = [card("luanwu-wusheng", "peach", "heart")];
      },
      selection: { cardId: "luanwu-wusheng", viewAsSkillId: "wusheng" as const },
      option: "wusheng",
    },
    {
      label: "Longdan",
      generalId: "zhao_yun" as const,
      configure(actor: GamePlayer) {
        actor.hand = [card("luanwu-longdan", "dodge", "spade")];
      },
      selection: { cardId: "luanwu-longdan", viewAsSkillId: "longdan" as const },
      option: "longdan",
    },
    {
      label: "Zhang Ba",
      generalId: "gan_ning" as const,
      configure(actor: GamePlayer) {
        actor.equipment.weapon = card("luanwu-zhangba", "zhang_ba_she_mao");
        actor.hand = [card("luanwu-zhangba-a", "peach"), card("luanwu-zhangba-b", "dodge")];
      },
      selection: {
        cardIds: ["luanwu-zhangba-a", "luanwu-zhangba-b"],
        viewAsSkillId: "zhang_ba_she_mao" as const,
      },
      option: "zhang_ba_she_mao",
    },
  ])("uses $label in Luanwu without consuming the normal Slash quota", ({ generalId, configure, selection, option }) => {
    const { game, current: owner, others: [actor] } = setup();
    if (!actor) throw new Error("Missing Luanwu actor");
    owner.generalId = "jia_xu";
    actor.generalId = generalId;
    configure(actor);

    let state = applyAction(game, { type: "use_skill", playerId: owner.id, skillId: "luanwu" });
    const prompt = standardPrompt(state, actor.id);
    expect(prompt).toMatchObject({
      skillId: "luanwu",
      stage: "luanwu_slash",
      canPass: true,
      targetIds: expect.arrayContaining([owner.id]),
      options: expect.arrayContaining([option, "lose_hp"]),
    });
    const action = {
      type: "resolve_standard_skill" as const,
      playerId: actor.id,
      promptId: prompt.promptId,
      activate: true,
      targetId: owner.id,
      ...selection,
    };
    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, action);
    expect(state.pendingResponse).toMatchObject({ type: "slash", attackerId: actor.id, targetId: owner.id });
    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, {
      type: "respond", playerId: owner.id, cardId: null,
    });
    expect(state.currentPlayerId).toBe(owner.id);
    expect(state.turn).toMatchObject({ phase: "play", slashUsed: false, activeSlashUses: 0 });
    expect(state.completeRules.lifecycle.limitedUses).toContainEqual(expect.objectContaining({ ownerId: owner.id, skillId: "luanwu" }));
    expect(() => applyAction(state, action)).toThrow();
  });

  it("keeps the frozen Luanwu order after its owner dies and recomputes nearest legal targets", () => {
    const { game, current: owner, others: [first, second, third] } = setup();
    if (!first || !second || !third) throw new Error("Missing Luanwu death fixtures");
    owner.generalId = "jia_xu";
    owner.role = "loyalist";
    owner.hp = 1;
    first.role = "rebel";
    first.hand = [card("luanwu-owner-kill", "slash")];
    second.role = "lord";
    third.role = "rebel";
    third.hand = [card("luanwu-after-owner-death", "slash")];

    let state = applyAction(game, { type: "use_skill", playerId: owner.id, skillId: "luanwu" });
    let prompt = standardPrompt(state, first.id);
    state = applyAction(state, {
      type: "resolve_standard_skill",
      playerId: first.id,
      promptId: prompt.promptId,
      activate: true,
      targetId: owner.id,
      cardId: "luanwu-owner-kill",
    });
    state = applyAction(state, { type: "respond", playerId: owner.id, cardId: null });
    while (state.pendingResponse?.type === "dying") {
      state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, {
        type: "respond",
        playerId: state.pendingResponse.targetId,
        cardId: null,
      });
    }
    expect(state.players.find((player) => player.id === owner.id)).toMatchObject({ alive: false, hp: 0 });
    expect(state.players.find((player) => player.id === second.id)?.hp).toBe(3);
    prompt = standardPrompt(state, third.id);
    expect(prompt).toMatchObject({
      skillId: "luanwu",
      targetIds: expect.arrayContaining([first.id, second.id]),
    });
    expect(prompt.targetIds).not.toContain(owner.id);
    state = applyAction(state, {
      type: "resolve_standard_skill",
      playerId: third.id,
      promptId: prompt.promptId,
      activate: false,
    });
    expect(state.status).toBe("playing");
    expect(state.currentPlayerId).toBe(first.id);
  });

  it("resumes Luanwu after an actor dies from its source-less HP loss and rejects a tampered cursor", () => {
    const { game, current: owner, others: [first, second] } = setup();
    if (!first || !second) throw new Error("Missing Luanwu HP-loss fixtures");
    owner.generalId = "jia_xu";
    owner.role = "lord";
    first.role = "rebel";
    first.hp = 1;
    second.role = "rebel";
    second.hand = [card("luanwu-after-hp-death", "slash")];

    let state = applyAction(game, { type: "use_skill", playerId: owner.id, skillId: "luanwu" });
    expect(state.pendingResponse).toMatchObject({ type: "dying", victimId: first.id, damageSourceId: null });
    while (state.pendingResponse?.type === "dying") {
      state = applyAction(state, { type: "respond", playerId: state.pendingResponse.targetId, cardId: null });
    }
    const prompt = standardPrompt(state, second.id);
    const tampered = JSON.parse(JSON.stringify(state)) as GameSession;
    if (tampered.pendingResponse?.type !== "standard_skill") throw new Error("Missing Luanwu cursor");
    tampered.pendingResponse.processedPlayerIds = [...(tampered.pendingResponse.processedPlayerIds ?? [])].reverse();
    expect(() => applyAction(tampered, {
      type: "resolve_standard_skill",
      playerId: second.id,
      promptId: prompt.promptId,
      activate: false,
    })).toThrow(/冻结行动座次|当前行动者/);
  });

  it("strictly round-trips Luanwu's nested Slash continuation and rejects extra JSON fields", () => {
    const { game, current: owner, others: [actor] } = setup();
    if (!actor) throw new Error("Missing Luanwu codec actor");
    owner.generalId = "jia_xu";
    actor.hand = [card("luanwu-codec-slash", "slash")];
    let state = applyAction(game, { type: "use_skill", playerId: owner.id, skillId: "luanwu" });
    const prompt = standardPrompt(state, actor.id);
    state = applyAction(state, {
      type: "resolve_standard_skill",
      playerId: actor.id,
      promptId: prompt.promptId,
      activate: true,
      targetId: owner.id,
      cardId: "luanwu-codec-slash",
    });
    if (state.pendingResponse?.type !== "slash") throw new Error("Missing Luanwu Slash continuation");
    const encoded = encodeGameDamageContinuation({ type: "slash_sequence", pending: state.pendingResponse });
    expect(decodeGameDamageContinuation(JSON.parse(JSON.stringify(encoded)))).toMatchObject({
      type: "slash_sequence",
      pending: {
        attackerId: actor.id,
        targetId: owner.id,
        completion: state.pendingResponse.completion,
      },
    });
    const tampered = JSON.parse(JSON.stringify(encoded)) as {
      data: { resume: { pending: { completion: Record<string, unknown> } } };
    };
    tampered.data.resume.pending.completion.extra = true;
    expect(() => decodeGameDamageContinuation(tampered)).toThrow(/unexpected field/);
  });

  it("resolves Benghuai exactly once and continues the end phase after losing HP", () => {
    const { game, current: owner, others: [lower] } = setup();
    if (!lower) throw new Error("Missing Benghuai comparison player");
    owner.generalId = "dong_zhuo";
    owner.hp = 3;
    lower.hp = 1;

    let state = applyAction(game, { type: "end_play", playerId: owner.id });
    const prompt = standardPrompt(state, owner.id);
    expect(prompt).toMatchObject({
      skillId: "benghuai",
      stage: "benghuai_choice",
      canPass: false,
      options: ["lose_hp", "lose_max_hp"],
    });
    const action = {
      type: "resolve_standard_skill" as const,
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      tokens: ["lose_hp"],
    };
    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, action);
    expect(state.players.find((player) => player.id === owner.id)?.hp).toBe(2);
    expect(state.logs.filter((entry) => entry.message.includes("的崩坏触发"))).toHaveLength(1);
    expect(() => applyAction(state, action)).toThrow();
  });

  it("routes Benghuai zero-max-HP death through the pausable DeathStack and Xingshang", () => {
    const { game, current: owner, others: [xingshangOwner, protectedZero, threat] } = setup();
    if (!xingshangOwner || !protectedZero || !threat) throw new Error("Missing Benghuai death fixtures");
    owner.generalId = "dong_zhuo";
    owner.role = "loyalist";
    owner.hp = owner.maxHp = 1;
    owner.hand = [card("benghuai-inheritance", "peach")];
    xingshangOwner.generalId = "cao_pi";
    xingshangOwner.role = "lord";
    protectedZero.generalId = "zhou_tai";
    protectedZero.role = "rebel";
    protectedZero.hp = 0;
    protectedZero.extraPiles.buqu = [card("benghuai-buqu", "slash")];
    threat.role = "rebel";

    let state = applyAction(game, { type: "end_play", playerId: owner.id });
    let prompt = standardPrompt(state, owner.id);
    const benghuaiAction = {
      type: "resolve_standard_skill" as const,
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      tokens: ["lose_max_hp"],
    };
    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, benghuaiAction);
    expect(state.players.find((player) => player.id === owner.id)).toMatchObject({ alive: false, hp: 0, maxHp: 0 });
    expect(state.completeRules.death.frames).toHaveLength(1);
    prompt = standardPrompt(state, xingshangOwner.id);
    expect(prompt).toMatchObject({ skillId: "xingshang", stage: "xingshang_claim", canPass: true });
    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, {
      type: "resolve_standard_skill",
      playerId: xingshangOwner.id,
      promptId: prompt.promptId,
      activate: true,
    });
    expect(state.completeRules.death.frames).toEqual([]);
    expect(state.players.find((player) => player.id === xingshangOwner.id)?.hand.map((entry) => entry.id)).toContain("benghuai-inheritance");
    expect(state.currentPlayerId).toBe(xingshangOwner.id);
    expect(() => applyAction(state, benghuaiAction)).toThrow();
  });
});
