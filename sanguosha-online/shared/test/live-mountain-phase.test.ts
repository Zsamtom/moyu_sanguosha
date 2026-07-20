import { describe, expect, it } from "vitest";

import {
  applyAction,
  createGame,
  forfeitPlayer,
  getCardDefinition,
  getGameView,
  grantSkill,
  hasAwakened,
  type Card,
  type CardKind,
  type GamePlayer,
  type GameSession,
} from "../src/index.js";

const seed = "e7".repeat(32);

function card(id: string, kind: CardKind): Card {
  return { id, kind, ...getCardDefinition(kind), suit: "club", rank: 7 };
}

function setup(): { game: GameSession; seats: GamePlayer[] } {
  const game = createGame({ playerIds: ["mountain-1", "mountain-2", "mountain-3", "mountain-4"], seed });
  const currentIndex = game.players.findIndex((player) => player.id === game.currentPlayerId);
  const seats = Array.from({ length: game.players.length }, (_value, index) =>
    game.players[(currentIndex + index) % game.players.length]!,
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
    playerId: seats[0]!.id,
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
    normalTurnAnchorPlayerId: null,
    queuedExtraTurns: [],
    fangquanSkippedPlay: false,
    discardPhaseStarted: false,
    discardPhaseHandCardIds: [],
  };
  return { game, seats };
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

describe("live Mountain phase continuations", () => {
  it("runs a Fangquan extra turn before resuming normal order from Liu Shan's seat", () => {
    const { game, seats: [starter, owner, normalNext, extraTarget] } = setup();
    if (!starter || !owner || !normalNext || !extraTarget) throw new Error("Missing Fangquan fixtures");
    grant(game, owner.id, "fangquan");
    owner.hand = [card("fangquan-cost", "dodge")];

    let state = applyAction(game, { type: "end_play", playerId: starter.id });
    let prompt = standardPrompt(state, owner.id);
    expect(prompt).toMatchObject({ skillId: "fangquan", stage: "fangquan_skip", canPass: true });
    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
    });
    prompt = standardPrompt(state, owner.id);
    expect(prompt).toMatchObject({
      skillId: "fangquan",
      stage: "fangquan_finish",
      allowedCardIds: ["fangquan-cost"],
      targetIds: expect.arrayContaining([extraTarget.id]),
    });
    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "fangquan-cost",
      targetId: extraTarget.id,
    });

    expect(state.currentPlayerId).toBe(extraTarget.id);
    expect(state.turn).toMatchObject({
      playerId: extraTarget.id,
      normalTurnAnchorPlayerId: owner.id,
      queuedExtraTurns: [],
    });

    state = applyAction(state, { type: "end_play", playerId: extraTarget.id });
    expect(state.currentPlayerId).toBe(normalNext.id);
    expect(state.turn.normalTurnAnchorPlayerId).toBeNull();
  });

  it("resumes Yongsi through Lianying before hand-limit discard and then offers Guzheng", () => {
    const { game, seats: [owner, guzhengOwner] } = setup();
    if (!owner || !guzhengOwner) throw new Error("Missing Yongsi fixtures");
    owner.generalId = "zhou_tai";
    owner.hp = 0;
    owner.extraPiles.buqu = [card("buqu-wound", "slash")];
    owner.hand = [card("yongsi-discard", "dodge")];
    game.deck = [card("lianying-draw", "peach")];
    grant(game, owner.id, "yongsi");
    grant(game, owner.id, "lianying");
    grant(game, guzhengOwner.id, "guzheng");

    let state = applyAction(game, { type: "end_play", playerId: owner.id });
    expect(getGameView(state, owner.id).prompt).toMatchObject({ type: "discard", count: 1 });
    state = applyAction(state, { type: "discard", playerId: owner.id, cardIds: ["yongsi-discard"] });
    let choice = skillChoicePrompt(state, owner.id);
    expect(choice.skillId).toBe("lianying");

    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, {
      type: "resolve_skill",
      playerId: owner.id,
      skillId: "lianying",
      promptId: choice.promptId,
      activate: true,
    });
    expect(getGameView(state, owner.id).prompt).toMatchObject({
      type: "discard",
      count: 1,
      cardIds: ["lianying-draw"],
    });

    state = applyAction(state, { type: "discard", playerId: owner.id, cardIds: ["lianying-draw"] });
    choice = skillChoicePrompt(state, owner.id);
    state = applyAction(state, {
      type: "resolve_skill",
      playerId: owner.id,
      skillId: "lianying",
      promptId: choice.promptId,
      activate: false,
    });

    const prompt = standardPrompt(state, guzhengOwner.id);
    expect(prompt).toMatchObject({
      skillId: "guzheng",
      stage: "guzheng_claim",
      canPass: true,
      allowedCardIds: expect.arrayContaining(["yongsi-discard", "lianying-draw"]),
    });
    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, {
      type: "resolve_standard_skill",
      playerId: guzhengOwner.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "lianying-draw",
    });
    expect(state.players.find((player) => player.id === owner.id)?.hand.map((entry) => entry.id)).toEqual(["lianying-draw"]);
    expect(state.players.find((player) => player.id === guzhengOwner.id)?.hand.map((entry) => entry.id)).toEqual(["yongsi-discard"]);
  });

  it("pays Qiaobian before the phase, restores Lianying, steals from two distinct hands, and suspends on Xiaoji", () => {
    const { game, seats: [starter, owner, equipmentOwner, destination] } = setup();
    if (!starter || !owner || !equipmentOwner || !destination) throw new Error("Missing Qiaobian fixtures");
    owner.hand = [card("qiaobian-draw-cost", "dodge")];
    equipmentOwner.hand = [card("qiaobian-hidden-1", "slash")];
    destination.hand = [card("qiaobian-hidden-2", "peach")];
    equipmentOwner.equipment.weapon = card("qiaobian-weapon", "qing_long_yan_yue_dao");
    game.deck = [card("qiaobian-lianying", "wine")];
    grant(game, owner.id, "qiaobian");
    grant(game, owner.id, "lianying");
    grant(game, equipmentOwner.id, "xiaoji");

    let state = applyAction(game, { type: "end_play", playerId: starter.id });
    let prompt = standardPrompt(state, owner.id);
    expect(prompt).toMatchObject({ skillId: "qiaobian", stage: "qiaobian_skip", canPass: true });
    state = applyAction(state, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: false,
    });
    prompt = standardPrompt(state, owner.id);
    expect(prompt).toMatchObject({ skillId: "qiaobian", stage: "qiaobian_skip", allowedCardIds: ["qiaobian-draw-cost"] });
    state = applyAction(state, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "qiaobian-draw-cost",
    });
    let choice = skillChoicePrompt(state, owner.id);
    expect(state.afterMove.suspendedResponse).toMatchObject({
      type: "standard_skill",
      skillId: "qiaobian",
      stage: "qiaobian_after_cost",
      phase: "draw",
    });
    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, {
      type: "resolve_skill",
      playerId: owner.id,
      skillId: "lianying",
      promptId: choice.promptId,
      activate: true,
    });
    prompt = standardPrompt(state, owner.id);
    expect(prompt).toMatchObject({ skillId: "qiaobian", stage: "qiaobian_draw", minCards: 0, maxCards: 2 });
    const drawTokens = (prompt.choices ?? [])
      .filter((entry) => entry.ownerId === equipmentOwner.id || entry.ownerId === destination.id)
      .map((entry) => entry.token);
    expect(drawTokens).toHaveLength(2);
    state = applyAction(state, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      tokens: drawTokens,
    });
    prompt = standardPrompt(state, owner.id);
    expect(prompt).toMatchObject({ skillId: "qiaobian", stage: "qiaobian_skip" });
    const playCost = state.players.find((player) => player.id === owner.id)!.hand[0]!.id;
    state = applyAction(state, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: playCost,
    });
    prompt = standardPrompt(state, owner.id);
    expect(prompt).toMatchObject({
      skillId: "qiaobian",
      stage: "qiaobian_play",
      allowedCardIds: expect.arrayContaining(["qiaobian-weapon"]),
    });
    expect(prompt.cardTargetIds?.["qiaobian-weapon"]).toContain(destination.id);
    state = applyAction(state, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "qiaobian-weapon",
      targetId: destination.id,
    });
    choice = skillChoicePrompt(state, equipmentOwner.id);
    expect(choice.skillId).toBe("xiaoji");
    expect(state.afterMove.suspendedResponse).toMatchObject({
      type: "standard_skill",
      skillId: "qiaobian",
      stage: "qiaobian_finish",
      phase: "play",
    });
    state = applyAction(state, {
      type: "resolve_skill",
      playerId: equipmentOwner.id,
      skillId: "xiaoji",
      promptId: choice.promptId,
      activate: false,
    });
    expect(state.players.find((player) => player.id === equipmentOwner.id)?.equipment.weapon).toBeUndefined();
    expect(state.players.find((player) => player.id === destination.id)?.equipment.weapon?.id).toBe("qiaobian-weapon");
  });

  it("uses a public Field as Snatch through Jixi while preserving the physical card", () => {
    const { game, seats: [owner, adjacent, distant, observer] } = setup();
    if (!owner || !adjacent || !distant || !observer) throw new Error("Missing Jixi fixtures");
    owner.extraPiles.field = [card("jixi-field", "dodge")];
    owner.extraPiles.private_test = [card("private-pile", "peach")];
    distant.hand = [card("jixi-gain", "slash")];
    grant(game, owner.id, "tuntian");
    grant(game, owner.id, "jixi");

    const observerView = getGameView(game, observer.id);
    const publicOwner = observerView.players.find((player) => player.id === owner.id)!;
    expect(publicOwner.publicPiles.field.map((entry) => entry.id)).toEqual(["jixi-field"]);
    expect(publicOwner.publicPiles.private_test).toBeUndefined();
    const playPrompt = getGameView(game, owner.id).prompt;
    if (playPrompt.type !== "play") throw new Error(`Expected play prompt, got ${playPrompt.type}`);
    const jixi = playPrompt.skills.find((skill) => skill.skillId === "jixi");
    expect(jixi).toMatchObject({
      cardIds: ["jixi-field"],
      targetIds: expect.arrayContaining([distant.id]),
      virtualCardKind: "shun_shou_qian_yang",
    });

    let state = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "jixi",
      cardIds: ["jixi-field"],
      targetId: distant.id,
    });
    expect(state.pendingResponse).toMatchObject({
      type: "zone_selection",
      targetId: owner.id,
      victimId: distant.id,
      mode: "gain",
    });
    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, {
      type: "choose_zone_card",
      playerId: owner.id,
      token: "hand:0",
    });
    expect(state.players.find((player) => player.id === owner.id)?.hand.map((entry) => entry.id)).toContain("jixi-gain");
    expect(state.players.find((player) => player.id === owner.id)?.extraPiles.field).toEqual([]);
    expect(state.discardPile).toContainEqual(expect.objectContaining({ id: "jixi-field", kind: "dodge" }));
    expect(() => applyAction(state, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "jixi",
      cardIds: ["jixi-field"],
      targetId: adjacent.id,
    })).toThrow();
  });

  it("creates a public Field from an outside-turn loss and rejects stale Tuntian replay", () => {
    const { game, seats: [actor, owner] } = setup();
    if (!actor || !owner) throw new Error("Missing Tuntian fixtures");
    actor.hand = [card("tuntian-snatch", "shun_shou_qian_yang")];
    owner.hand = [card("tuntian-lost", "dodge")];
    game.deck = [{ ...card("tuntian-judgment", "slash"), suit: "club" }];
    grant(game, owner.id, "tuntian");

    let state = applyAction(game, {
      type: "play_card",
      playerId: actor.id,
      cardId: "tuntian-snatch",
      targetId: owner.id,
    });
    state = applyAction(state, { type: "choose_zone_card", playerId: actor.id, token: "hand:0" });
    const prompt = standardPrompt(state, owner.id);
    expect(prompt).toMatchObject({ skillId: "tuntian", stage: "tuntian_invoke", canPass: true });
    const action = {
      type: "resolve_standard_skill" as const,
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
    };
    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, action);
    expect(state.players.find((player) => player.id === owner.id)?.extraPiles.field)
      .toContainEqual(expect.objectContaining({ id: "tuntian-judgment" }));
    expect(getGameView(state, actor.id).players.find((player) => player.id === owner.id)?.publicPiles.field)
      .toContainEqual(expect.objectContaining({ id: "tuntian-judgment" }));
    expect(() => applyAction(state, action)).toThrow();
  });

  it("queues exactly one Tuntian judgment when an outside-turn Guicai retrial spends its last hand card", () => {
    const { game, seats: [starter, judged, owner] } = setup();
    if (!starter || !judged || !owner) throw new Error("Missing Tuntian retrial fixtures");
    judged.judgment = [card("tuntian-delayed", "le_bu_si_shu")];
    owner.hand = [{ ...card("tuntian-retrial-cost", "dodge"), suit: "club" }];
    game.deck = [
      { ...card("tuntian-retrial-field", "peach"), suit: "diamond" },
      { ...card("tuntian-original-judgment", "slash"), suit: "club" },
    ];
    grant(game, owner.id, "guicai");
    grant(game, owner.id, "tuntian");

    let state = applyAction(game, { type: "end_play", playerId: starter.id });
    let prompt = standardPrompt(state, owner.id);
    expect(prompt).toMatchObject({ skillId: "guicai", stage: "judgment_retrial" });
    state = applyAction(JSON.parse(JSON.stringify(state)) as GameSession, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "tuntian-retrial-cost",
    });
    prompt = standardPrompt(state, owner.id);
    expect(prompt).toMatchObject({ skillId: "tuntian", stage: "tuntian_invoke" });
    expect(state.afterMove.queuedTriggers.filter((trigger) => trigger.skillId === "tuntian")).toHaveLength(0);
    state = applyAction(state, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
    });
    expect(state.players.find((player) => player.id === owner.id)?.extraPiles.field)
      .toContainEqual(expect.objectContaining({ id: "tuntian-retrial-field" }));
  });

  it("awakens Zaoxian, Zhiji, Ruoyu, and Hunzi once and immediately exposes granted live skills", () => {
    {
      const { game, seats: [starter, owner] } = setup();
      if (!starter || !owner) throw new Error("Missing Zaoxian fixtures");
      owner.extraPiles.field = [card("field-1", "slash"), card("field-2", "dodge"), card("field-3", "peach")];
      grant(game, owner.id, "zaoxian");
      const state = applyAction(game, { type: "end_play", playerId: starter.id });
      const resolved = state.players.find((player) => player.id === owner.id)!;
      expect(resolved.maxHp).toBe(3);
      expect(hasAwakened(state.completeRules.lifecycle, owner.id, "zaoxian")).toBe(true);
      expect(getGameView(state, owner.id).players.find((player) => player.id === owner.id)?.effectiveSkillIds).toContain("jixi");
    }

    {
      const { game, seats: [starter, owner] } = setup();
      if (!starter || !owner) throw new Error("Missing Zhiji fixtures");
      owner.hp = 3;
      grant(game, owner.id, "zhiji");
      let state = applyAction(game, { type: "end_play", playerId: starter.id });
      const prompt = standardPrompt(state, owner.id);
      expect(prompt).toMatchObject({ skillId: "zhiji", stage: "zhiji_choice", options: ["recover_one", "draw_two"] });
      state = applyAction(state, {
        type: "resolve_standard_skill",
        playerId: owner.id,
        promptId: prompt.promptId,
        activate: true,
        tokens: ["recover_one"],
      });
      expect(state.players.find((player) => player.id === owner.id)).toMatchObject({ hp: 3, maxHp: 3 });
      expect(hasAwakened(state.completeRules.lifecycle, owner.id, "zhiji")).toBe(true);
      expect(standardPrompt(state, owner.id)).toMatchObject({ skillId: "guanxing", stage: "invoke" });
    }

    {
      const { game, seats: [starter, owner] } = setup();
      if (!starter || !owner) throw new Error("Missing Ruoyu fixtures");
      for (const player of game.players) player.role = player.id === owner.id ? "lord" : "rebel";
      owner.hp = 2;
      grant(game, owner.id, "ruoyu");
      const state = applyAction(game, { type: "end_play", playerId: starter.id });
      expect(state.players.find((player) => player.id === owner.id)).toMatchObject({ hp: 3, maxHp: 5 });
      expect(hasAwakened(state.completeRules.lifecycle, owner.id, "ruoyu")).toBe(true);
      expect(getGameView(state, owner.id).players.find((player) => player.id === owner.id)?.effectiveSkillIds).toContain("jijiang");
    }

    {
      const { game, seats: [starter, owner] } = setup();
      if (!starter || !owner) throw new Error("Missing Hunzi fixtures");
      owner.hp = 1;
      grant(game, owner.id, "hunzi");
      const state = applyAction(game, { type: "end_play", playerId: starter.id });
      expect(state.players.find((player) => player.id === owner.id)).toMatchObject({ hp: 1, maxHp: 3 });
      expect(hasAwakened(state.completeRules.lifecycle, owner.id, "hunzi")).toBe(true);
      expect(getGameView(state, owner.id).players.find((player) => player.id === owner.id)?.effectiveSkillIds)
        .toEqual(expect.arrayContaining(["yingzi", "yinghun"]));
      expect(standardPrompt(state, owner.id)).toMatchObject({ skillId: "yinghun", stage: "yinghun_select" });
    }
  });

  it("offers multiple Guzheng owners in seat order and only the later claimant gains the current discard", () => {
    const { game, seats: [discarder, firstOwner, secondOwner] } = setup();
    if (!discarder || !firstOwner || !secondOwner) throw new Error("Missing Guzheng order fixtures");
    discarder.hp = 1;
    discarder.hand = [card("guzheng-a", "slash"), card("guzheng-b", "dodge"), card("guzheng-keep", "peach")];
    grant(game, firstOwner.id, "guzheng");
    grant(game, secondOwner.id, "guzheng");

    let state = applyAction(game, { type: "end_play", playerId: discarder.id });
    state = applyAction(state, { type: "discard", playerId: discarder.id, cardIds: ["guzheng-a", "guzheng-b"] });
    let prompt = standardPrompt(state, firstOwner.id);
    expect(prompt).toMatchObject({ skillId: "guzheng", stage: "guzheng_claim" });
    state = applyAction(state, {
      type: "resolve_standard_skill",
      playerId: firstOwner.id,
      promptId: prompt.promptId,
      activate: false,
    });
    prompt = standardPrompt(state, secondOwner.id);
    state = applyAction(state, {
      type: "resolve_standard_skill",
      playerId: secondOwner.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "guzheng-a",
    });
    expect(state.players.find((player) => player.id === discarder.id)?.hand.map((entry) => entry.id))
      .toEqual(expect.arrayContaining(["guzheng-keep", "guzheng-a"]));
    expect(state.players.find((player) => player.id === firstOwner.id)?.hand).toEqual([]);
    expect(state.players.find((player) => player.id === secondOwner.id)?.hand.map((entry) => entry.id)).toEqual(["guzheng-b"]);
  });

  it("keeps the Fangquan normal-seat anchor when the current extra-turn player forfeits", () => {
    const { game, seats: [starter, owner, normalNext, extraTarget] } = setup();
    if (!starter || !owner || !normalNext || !extraTarget) throw new Error("Missing Fangquan forfeit fixtures");
    owner.hand = [card("fangquan-forfeit-cost", "dodge")];
    grant(game, owner.id, "fangquan");
    let state = applyAction(game, { type: "end_play", playerId: starter.id });
    let prompt = standardPrompt(state, owner.id);
    state = applyAction(state, {
      type: "resolve_standard_skill", playerId: owner.id, promptId: prompt.promptId, activate: true,
    });
    prompt = standardPrompt(state, owner.id);
    state = applyAction(state, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "fangquan-forfeit-cost",
      targetId: extraTarget.id,
    });
    expect(state.currentPlayerId).toBe(extraTarget.id);
    state = forfeitPlayer(state, extraTarget.id);
    expect(state.currentPlayerId).toBe(normalNext.id);
    expect(state.turn.normalTurnAnchorPlayerId).toBeNull();
  });
});
