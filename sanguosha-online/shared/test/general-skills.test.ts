import { describe, expect, it } from "vitest";

import {
  GameRuleError,
  ALL_GENERALS,
  DEFAULT_GENERALS,
  EXTENSION_GENERALS,
  STANDARD_GENERALS,
  applyAction,
  createGame,
  distanceBetweenPlayers,
  getCardDefinition,
  getGameView,
  getGeneralDefinition,
  getEffectiveGeneralSkillIds,
  recordSkillLoss,
  type Card,
  type CardKind,
  type GameAction,
  type GamePlayer,
  type GameSession,
} from "../src/index.js";

const seed = "51".padStart(64, "0");

function makeCard(id: string, kind: CardKind, suit: Card["suit"] = "spade"): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank: 1 };
}

function setup(playerCount = 5): { session: GameSession; actor: GamePlayer; targets: GamePlayer[] } {
  const session = createGame({
    playerIds: Array.from({ length: playerCount }, (_, index) => `p${index + 1}`),
    seed,
  });
  const actor = session.players.find((player) => player.id === session.currentPlayerId)!;
  const targets = session.players.filter((player) => player.id !== actor.id);
  for (const player of session.players) {
    player.hand = [];
    player.equipment = {};
    player.judgment = [];
    player.hp = 4;
    player.maxHp = 4;
  }
  session.deck = [];
  session.discardPile = [];
  session.resolvingCards = [];
  session.pendingResponse = null;
  session.turn.phase = "play";
  session.turn.slashUsed = false;
  return { session, actor, targets };
}

function ruleCode(action: () => unknown): string | undefined {
  try {
    action();
    return undefined;
  } catch (error) {
    if (!(error instanceof GameRuleError)) throw error;
    return error.code;
  }
}

function nextLiving(session: GameSession, source: GamePlayer): GamePlayer {
  for (let offset = 1; offset < session.players.length; offset += 1) {
    const candidate = session.players[(source.seat + offset) % session.players.length];
    if (candidate?.alive) return candidate;
  }
  throw new Error("Missing next living player");
}

function allZoneCardIds(session: GameSession): string[] {
  return [
    ...session.deck,
    ...session.discardPile,
    ...session.resolvingCards,
    ...session.players.flatMap((player) => player.hand),
    ...session.players.flatMap((player) => Object.values(player.equipment)),
    ...session.players.flatMap((player) => player.judgment),
  ].map((card) => card.id);
}

describe("complete general roster", () => {
  it("registers all 66 original generals while keeping the legacy default deal compatible", () => {
    expect(ALL_GENERALS).toHaveLength(66);
    expect(STANDARD_GENERALS).toHaveLength(25);
    expect(DEFAULT_GENERALS).toHaveLength(26);
    expect(EXTENSION_GENERALS).toHaveLength(40);
    expect(new Set(ALL_GENERALS.map((general) => general.id)).size).toBe(66);
    expect(STANDARD_GENERALS.some((general) => general.id === "xu_chu")).toBe(true);
    expect(STANDARD_GENERALS.some((general) => general.id === "xun_yu")).toBe(false);
    expect(DEFAULT_GENERALS.find((general) => general.id === "yuan_shu")?.pack).toBe("sp");
    expect(getGeneralDefinition("xu_chu")).toMatchObject({ name: "许褚", pack: "standard", maxHp: 4 });
    expect(getGeneralDefinition("xun_yu")).toMatchObject({ name: "荀彧", pack: "fire", maxHp: 3 });
    expect(getGeneralDefinition("shen_guan_yu")).toMatchObject({
      pack: "god",
      faction: "god",
      factionSelectable: true,
    });
  });
});

describe("lord dispatch skills and SP Yuan Shu", () => {
  it("runs Hujia in living seat order, persists the cursor, consumes a provider's physical Dodge, and rejects stale prompts", () => {
    const { session, actor, targets } = setup(4);
    const [caoCao, firstWei, secondWei] = targets;
    actor.hand = [makeCard("hujia-slash", "slash")];
    const oldLord = session.players.find((player) => player.role === "lord")!;
    oldLord.role = caoCao!.role;
    caoCao!.role = "lord";
    caoCao!.generalId = "cao_cao";
    firstWei!.generalId = "guo_jia";
    secondWei!.generalId = "si_ma_yi";
    firstWei!.hand = [];
    secondWei!.hand = [makeCard("hujia-dodge", "dodge", "heart")];

    let game = applyAction(session, {
      type: "play_card", playerId: actor.id, cardId: "hujia-slash", targetId: caoCao!.id,
    });
    const response = getGameView(game, caoCao!.id).prompt;
    expect(response).toMatchObject({ type: "respond", lordSkills: ["hujia"] });
    game = applyAction(game, { type: "invoke_lord_skill", playerId: caoCao!.id, skillId: "hujia" });
    expect(game.pendingResponse).toMatchObject({
      type: "lord_dispatch", requesterId: caoCao!.id, targetId: firstWei!.id, skillId: "hujia",
    });
    const firstPrompt = getGameView(game, firstWei!.id).prompt;
    if (firstPrompt.type !== "lord_dispatch") throw new Error("Expected Hujia provider prompt");
    game = applyAction(game, {
      type: "resolve_lord_dispatch", playerId: firstWei!.id, promptId: firstPrompt.promptId, cardId: null,
    });
    game = JSON.parse(JSON.stringify(game)) as GameSession;
    const secondPrompt = getGameView(game, secondWei!.id).prompt;
    if (secondPrompt.type !== "lord_dispatch") throw new Error("Expected restored Hujia provider prompt");
    expect(ruleCode(() => applyAction(game, {
      type: "resolve_lord_dispatch", playerId: secondWei!.id, promptId: firstPrompt.promptId,
      cardId: "hujia-dodge",
    }))).toBe("INVALID_RESPONSE");
    game = applyAction(game, {
      type: "resolve_lord_dispatch", playerId: secondWei!.id, promptId: secondPrompt.promptId,
      cardId: "hujia-dodge",
    });
    expect(game.players.find((player) => player.id === caoCao!.id)?.hp).toBe(4);
    expect(game.players.find((player) => player.id === secondWei!.id)?.hand).toHaveLength(0);
    expect(game.discardPile.map((card) => card.id)).toEqual(expect.arrayContaining(["hujia-slash", "hujia-dodge"]));
  });

  it("lets active Jijiang use the provider's physical Slash with the requester as source and requester Wushuang count", () => {
    const { session, actor, targets: [provider, victim] } = setup(3);
    actor.generalId = "shen_lv_bu";
    actor.role = "lord";
    provider!.generalId = "guan_yu";
    provider!.hand = [makeCard("jijiang-fire-slash", "fire_slash", "heart")];
    victim!.hand = [makeCard("jijiang-dodge-1", "dodge"), makeCard("jijiang-dodge-2", "dodge")];
    session.completeRules.lifecycle.grants.push({
      grantId: session.completeRules.lifecycle.nextEffectId++,
      ownerId: actor.id,
      skillId: "jijiang",
      sourcePlayerId: actor.id,
      sourceSkillId: "test",
      expiry: { type: "permanent" },
    });

    let game = applyAction(session, {
      type: "invoke_lord_skill", playerId: actor.id, skillId: "jijiang", targetId: victim!.id,
    });
    const prompt = getGameView(game, provider!.id).prompt;
    if (prompt.type !== "lord_dispatch") throw new Error("Expected Jijiang provider prompt");
    game = applyAction(game, {
      type: "resolve_lord_dispatch", playerId: provider!.id, promptId: prompt.promptId,
      cardId: "jijiang-fire-slash",
    });
    expect(game.turn.slashUsed).toBe(true);
    expect(game.pendingResponse).toMatchObject({
      type: "slash", attackerId: actor.id, targetId: victim!.id,
      cardId: "jijiang-fire-slash", slashKind: "fire_slash", requiredDodgeCount: 2,
    });
    game = applyAction(game, { type: "respond", playerId: victim!.id, cardId: "jijiang-dodge-1" });
    game = applyAction(game, { type: "respond", playerId: victim!.id, cardId: "jijiang-dodge-2" });
    expect(game.discardPile.map((card) => card.id)).toEqual(expect.arrayContaining([
      "jijiang-fire-slash", "jijiang-dodge-1", "jijiang-dodge-2",
    ]));
  });

  it("refreshes Weidi from only the living lord's current lord skills without recursion", () => {
    const { session, actor, targets: [yuanShu] } = setup(3);
    actor.role = "lord";
    actor.generalId = "cao_cao";
    yuanShu!.role = "rebel";
    yuanShu!.generalId = "yuan_shu";
    expect(getEffectiveGeneralSkillIds(session, yuanShu!.id)).toEqual(expect.arrayContaining(["weidi", "yongsi", "hujia"]));
    expect(getEffectiveGeneralSkillIds(session, yuanShu!.id)).not.toContain("jianxiong");

    recordSkillLoss(session.completeRules.lifecycle, {
      ownerId: actor.id,
      skillIds: ["hujia"],
      sourcePlayerId: yuanShu!.id,
      sourceSkillId: "test_loss",
      lostAtEventId: 1,
    });
    expect(getEffectiveGeneralSkillIds(session, yuanShu!.id)).not.toContain("hujia");
    actor.alive = false;
    actor.hp = 0;
    expect(getEffectiveGeneralSkillIds(session, yuanShu!.id)).toEqual(expect.arrayContaining(["weidi", "yongsi"]));
    expect(getEffectiveGeneralSkillIds(session, yuanShu!.id)).not.toContain("weidi_inherited");
  });

  it("applies Yongsi's living-faction draw and sequential forced/hand-limit discards", () => {
    const { session, actor, targets } = setup(4);
    actor.generalId = "yuan_shu";
    targets[0]!.generalId = "cao_cao";
    targets[1]!.generalId = "liu_bei";
    targets[2]!.generalId = "sun_quan";
    for (const target of targets) target.generalId = target.generalId;
    session.deck = Array.from({ length: 30 }, (_, index) => makeCard(`yongsi-deck-${index}`, "slash"));

    let game = applyAction(session, { type: "end_play", playerId: actor.id });
    for (const target of targets) {
      expect(game.currentPlayerId).toBe(target.id);
      game = applyAction(game, { type: "end_play", playerId: target.id });
    }
    const returned = game.players.find((player) => player.id === actor.id)!;
    expect(game.currentPlayerId).toBe(actor.id);
    expect(returned.hand).toHaveLength(6);
    returned.hand.push(
      makeCard("yongsi-extra-1", "dodge"), makeCard("yongsi-extra-2", "dodge"),
      makeCard("yongsi-extra-3", "dodge"), makeCard("yongsi-extra-4", "dodge"),
    );
    game = applyAction(game, { type: "end_play", playerId: actor.id });
    expect(game.turn).toMatchObject({ phase: "discard", discardStage: "yongsi", requiredDiscardCount: 4 });
    const firstDiscard = game.players.find((player) => player.id === actor.id)!.hand.slice(0, 4).map((card) => card.id);
    game = applyAction(game, { type: "discard", playerId: actor.id, cardIds: firstDiscard });
    expect(game.turn).toMatchObject({ phase: "discard", discardStage: "hand_limit", requiredDiscardCount: 2 });
    const secondDiscard = game.players.find((player) => player.id === actor.id)!.hand.slice(0, 2).map((card) => card.id);
    game = applyAction(game, { type: "discard", playerId: actor.id, cardIds: secondDiscard });
    expect(game.currentPlayerId).toBe(targets[0]!.id);
  });
});

describe("implemented locked standard skills", () => {
  it("applies Ma Chao's Mashu to seat distance", () => {
    const { session } = setup();
    const source = session.players[0]!;
    const target = session.players[2]!;
    source.generalId = "ma_chao";
    expect(distanceBetweenPlayers(session, source.id, target.id)).toBe(1);
    source.generalId = "zhao_yun";
    expect(distanceBetweenPlayers(session, source.id, target.id)).toBe(2);
  });

  it("lets Zhang Fei use more than one Slash in the same play phase", () => {
    const { session, actor, targets: [target] } = setup(3);
    actor.generalId = "zhang_fei";
    actor.hand = [makeCard("slash-1", "slash"), makeCard("slash-2", "slash")];
    target!.hand = [];

    let game = applyAction(session, {
      type: "play_card",
      playerId: actor.id,
      cardId: "slash-1",
      targetId: target!.id,
    });
    game = applyAction(game, { type: "respond", playerId: target!.id, cardId: null });
    expect(() => applyAction(game, {
      type: "play_card",
      playerId: actor.id,
      cardId: "slash-2",
      targetId: target!.id,
    })).not.toThrow();
  });

  it("requires two sequential Dodges against Lu Bu's Slash and preserves progress", () => {
    const { session, actor, targets: [target] } = setup(3);
    actor.generalId = "lv_bu";
    actor.hand = [makeCard("wushuang-slash", "slash")];
    target!.hand = [makeCard("dodge-1", "dodge"), makeCard("dodge-2", "dodge")];

    let game = applyAction(session, {
      type: "play_card",
      playerId: actor.id,
      cardId: "wushuang-slash",
      targetId: target!.id,
    });
    expect(game.pendingResponse).toMatchObject({
      type: "slash", targetId: target!.id, requiredDodgeCount: 2, dodgesPlayed: 0,
    });
    expect(getGameView(game, target!.id).prompt).toMatchObject({
      type: "respond", responseKind: "dodge", requiredCount: 2, respondedCount: 0,
    });

    game = applyAction(game, { type: "respond", playerId: target!.id, cardId: "dodge-1" });
    expect(game.pendingResponse).toMatchObject({
      type: "slash", targetId: target!.id, requiredDodgeCount: 2, dodgesPlayed: 1,
    });
    expect(game.players.find((player) => player.id === target!.id)?.hp).toBe(4);
    expect(getGameView(game, target!.id).prompt).toMatchObject({
      type: "respond", requiredCount: 2, respondedCount: 1, allowedCardIds: ["dodge-2"],
    });

    // A JSON round-trip models a restored authoritative snapshot between both responses.
    game = applyAction(JSON.parse(JSON.stringify(game)) as GameSession, {
      type: "respond", playerId: target!.id, cardId: "dodge-2",
    });
    expect(game.pendingResponse).toBeNull();
    expect(game.players.find((player) => player.id === target!.id)?.hp).toBe(4);
    expect(game.discardPile.map((card) => card.id)).toEqual(expect.arrayContaining([
      "wushuang-slash", "dodge-1", "dodge-2",
    ]));
  });

  it("still consumes the first Dodge when the second Wushuang response is passed", () => {
    const { session, actor, targets: [target] } = setup(3);
    actor.generalId = "lv_bu";
    actor.hand = [makeCard("wushuang-slash", "slash")];
    target!.hand = [makeCard("only-dodge", "dodge")];

    let game = applyAction(session, {
      type: "play_card", playerId: actor.id, cardId: "wushuang-slash", targetId: target!.id,
    });
    game = applyAction(game, { type: "respond", playerId: target!.id, cardId: "only-dodge" });
    game = applyAction(game, { type: "respond", playerId: target!.id, cardId: null });

    expect(game.players.find((player) => player.id === target!.id)?.hp).toBe(3);
    expect(game.discardPile.map((card) => card.id)).toEqual(expect.arrayContaining([
      "wushuang-slash", "only-dodge",
    ]));
  });

  it("resets the two-Dodge counter for every Fang Tian Halberd target", () => {
    const { session, actor, targets } = setup(4);
    actor.generalId = "lv_bu";
    actor.equipment.weapon = makeCard("halberd", "fang_tian_hua_ji");
    actor.hand = [makeCard("multi-slash", "slash")];
    targets.forEach((target, index) => {
      target.hand = [makeCard(`multi-dodge-${index}-1`, "dodge"), makeCard(`multi-dodge-${index}-2`, "dodge")];
    });

    let game = applyAction(session, {
      type: "play_card",
      playerId: actor.id,
      cardId: "multi-slash",
      targetIds: targets.map((target) => target.id),
    });
    for (const [index, target] of targets.entries()) {
      expect(game.pendingResponse).toMatchObject({
        type: "slash", targetId: target.id, requiredDodgeCount: 2, dodgesPlayed: 0,
      });
      game = applyAction(game, {
        type: "respond", playerId: target.id, cardId: `multi-dodge-${index}-1`,
      });
      expect(game.pendingResponse).toMatchObject({ targetId: target.id, dodgesPlayed: 1 });
      game = applyAction(game, {
        type: "respond", playerId: target.id, cardId: `multi-dodge-${index}-2`,
      });
    }
    expect(game.pendingResponse).toBeNull();
    expect(targets.map((target) => game.players.find((player) => player.id === target.id)?.hp)).toEqual([4, 4, 4]);
  });

  it("allows Ba Gua Zhen to satisfy each Wushuang Dodge request separately", () => {
    const { session, actor, targets: [target] } = setup(3);
    actor.generalId = "lv_bu";
    actor.hand = [makeCard("bagua-wushuang-slash", "slash")];
    target!.equipment.armor = makeCard("bagua", "ba_gua_zhen");
    target!.hand = [makeCard("second-dodge", "dodge")];
    session.deck = [makeCard("red-judgment", "peach", "heart")];

    let game = applyAction(session, {
      type: "play_card", playerId: actor.id, cardId: "bagua-wushuang-slash", targetId: target!.id,
    });
    expect(getGameView(game, target!.id).prompt).toMatchObject({
      type: "armor", requiredCount: 2, respondedCount: 0,
    });
    game = applyAction(game, { type: "activate_armor", playerId: target!.id, activate: true });
    expect(game.pendingResponse).toMatchObject({ dodgesPlayed: 1, armorAttempted: false });
    expect(getGameView(game, target!.id).prompt).toMatchObject({
      type: "armor", requiredCount: 2, respondedCount: 1,
    });
    game = applyAction(game, { type: "activate_armor", playerId: target!.id, activate: false });
    game = applyAction(game, { type: "respond", playerId: target!.id, cardId: "second-dodge" });
    expect(game.players.find((player) => player.id === target!.id)?.hp).toBe(4);
  });

  it("requires two Slashes per Duel exchange only from the player facing Wushuang", () => {
    const { session, actor, targets: [target] } = setup(3);
    actor.generalId = "lv_bu";
    actor.hand = [makeCard("wushuang-duel", "duel")];
    target!.hand = [makeCard("answer-1", "slash"), makeCard("answer-2", "fire_slash", "heart")];

    let game = applyAction(session, {
      type: "play_card", playerId: actor.id, cardId: "wushuang-duel", targetId: target!.id,
    });
    expect(game.pendingResponse).toMatchObject({
      type: "duel", attackerId: actor.id, targetId: target!.id, requiredSlashCount: 2, slashesPlayed: 0,
    });
    game = applyAction(game, { type: "respond", playerId: target!.id, cardId: "answer-1" });
    expect(game.pendingResponse).toMatchObject({
      type: "duel", attackerId: actor.id, targetId: target!.id, requiredSlashCount: 2, slashesPlayed: 1,
    });
    game = applyAction(game, { type: "respond", playerId: target!.id, cardId: "answer-2" });
    expect(game.pendingResponse).toMatchObject({
      type: "duel", attackerId: target!.id, targetId: actor.id, requiredSlashCount: 1, slashesPlayed: 0,
    });
    game = applyAction(game, { type: "respond", playerId: actor.id, cardId: null });
    expect(game.players.find((player) => player.id === actor.id)?.hp).toBe(3);
  });

  it("consumes the first Duel Slash before a player declines the second Wushuang response", () => {
    const { session, actor, targets: [target] } = setup(3);
    actor.generalId = "lv_bu";
    actor.hand = [makeCard("short-duel", "duel")];
    target!.hand = [makeCard("only-answer", "slash")];

    let game = applyAction(session, {
      type: "play_card", playerId: actor.id, cardId: "short-duel", targetId: target!.id,
    });
    game = applyAction(game, { type: "respond", playerId: target!.id, cardId: "only-answer" });
    game = applyAction(game, { type: "respond", playerId: target!.id, cardId: null });

    expect(game.players.find((player) => player.id === target!.id)?.hp).toBe(3);
    expect(game.discardPile.map((card) => card.id)).toEqual(expect.arrayContaining(["short-duel", "only-answer"]));
  });

  it("applies Wushuang symmetrically when Lu Bu is the target of Duel", () => {
    const { session, actor, targets: [target] } = setup(3);
    actor.hand = [makeCard("duel-lubu", "duel"), makeCard("reply-1", "slash"), makeCard("reply-2", "slash")];
    target!.generalId = "lv_bu";
    target!.hand = [makeCard("lubu-answer", "slash")];

    let game = applyAction(session, {
      type: "play_card", playerId: actor.id, cardId: "duel-lubu", targetId: target!.id,
    });
    expect(game.pendingResponse).toMatchObject({ requiredSlashCount: 1, targetId: target!.id });
    game = applyAction(game, { type: "respond", playerId: target!.id, cardId: "lubu-answer" });
    expect(game.pendingResponse).toMatchObject({
      type: "duel", attackerId: target!.id, targetId: actor.id, requiredSlashCount: 2, slashesPlayed: 0,
    });
    game = applyAction(game, { type: "respond", playerId: actor.id, cardId: "reply-1" });
    expect(game.pendingResponse).toMatchObject({ targetId: actor.id, slashesPlayed: 1 });
    game = applyAction(game, { type: "respond", playerId: actor.id, cardId: "reply-2" });
    expect(game.pendingResponse).toMatchObject({ targetId: target!.id, requiredSlashCount: 1, slashesPlayed: 0 });
  });

  it("lets Huang Yueying ignore trick-card distance", () => {
    const { session } = setup();
    const actor = session.players[0]!;
    const farTarget = session.players[2]!;
    session.currentPlayerId = actor.id;
    session.turn.playerId = actor.id;
    actor.generalId = "huang_yue_ying";
    actor.hand = [makeCard("snatch", "shun_shou_qian_yang")];
    farTarget.hand = [makeCard("loot", "dodge")];

    const prompt = getGameView(session, actor.id).prompt;
    expect(prompt).toMatchObject({ type: "play" });
    if (prompt.type !== "play") throw new Error("Expected play prompt");
    expect(prompt.cards.find((card) => card.cardId === "snatch")?.targetIds).toContain(farTarget.id);
    expect(() => applyAction(session, {
      type: "play_card",
      playerId: actor.id,
      cardId: "snatch",
      targetId: farTarget.id,
    })).not.toThrow();
  });

  it("enforces Lu Xun's Qianxun in validation and action hints", () => {
    const { session, actor, targets: [target] } = setup(3);
    actor.hand = [
      makeCard("snatch", "shun_shou_qian_yang"),
      makeCard("indulgence", "le_bu_si_shu"),
    ];
    target!.generalId = "lu_xun";
    target!.hand = [makeCard("loot", "dodge")];

    const prompt = getGameView(session, actor.id).prompt;
    if (prompt.type !== "play") throw new Error("Expected play prompt");
    expect(prompt.cards.find((card) => card.cardId === "snatch")?.targetIds ?? []).not.toContain(target!.id);
    expect(prompt.cards.find((card) => card.cardId === "indulgence")?.targetIds ?? []).not.toContain(target!.id);
    expect(ruleCode(() => applyAction(session, {
      type: "play_card", playerId: actor.id, cardId: "snatch", targetId: target!.id,
    }))).toBe("INVALID_TARGET");
    expect(ruleCode(() => applyAction(session, {
      type: "play_card", playerId: actor.id, cardId: "indulgence", targetId: target!.id,
    }))).toBe("INVALID_TARGET");
  });

  it("enforces Zhuge Liang's Kongcheng for Slash and Duel", () => {
    const { session, actor, targets: [target] } = setup(3);
    actor.hand = [makeCard("slash", "slash"), makeCard("duel", "duel")];
    target!.generalId = "zhu_ge_liang";
    target!.hand = [];

    const prompt = getGameView(session, actor.id).prompt;
    if (prompt.type !== "play") throw new Error("Expected play prompt");
    expect(prompt.cards.find((card) => card.cardId === "slash")?.targetIds).not.toContain(target!.id);
    expect(prompt.cards.find((card) => card.cardId === "duel")?.targetIds).not.toContain(target!.id);
    expect(ruleCode(() => applyAction(session, {
      type: "play_card", playerId: actor.id, cardId: "slash", targetId: target!.id,
    }))).toBe("INVALID_TARGET");
    expect(ruleCode(() => applyAction(session, {
      type: "play_card", playerId: actor.id, cardId: "duel", targetId: target!.id,
    }))).toBe("INVALID_TARGET");
  });
});

describe("Jizhi serializable card-use events", () => {
  it("pauses a legal ordinary trick before moving it, then draws once and commits it once", () => {
    const { session, actor } = setup(3);
    actor.generalId = "huang_yue_ying";
    actor.hand = [makeCard("jizhi-ex", "ex_nihilo", "heart")];
    session.deck = [
      makeCard("jizhi-effect-2", "dodge", "club"),
      makeCard("jizhi-effect-1", "slash", "spade"),
      makeCard("jizhi-draw", "peach", "diamond"),
    ];

    const offered = applyAction(session, {
      type: "play_card", playerId: actor.id, cardId: "jizhi-ex",
    });
    expect(offered.pendingResponse).toMatchObject({
      type: "skill_choice",
      targetId: actor.id,
      skillId: "jizhi",
      promptId: expect.stringContaining("jizhi"),
      resume: {
        type: "card_use",
        stage: "card_use_declared",
        intent: {
          useId: 1,
          sourceId: actor.id,
          physicalCardId: "jizhi-ex",
          physicalKind: "ex_nihilo",
          effectiveKind: "ex_nihilo",
          targetIds: [actor.id],
          method: "use",
          viaSkill: null,
        },
      },
    });
    expect(offered.players.find((player) => player.id === actor.id)?.hand.map((card) => card.id)).toEqual(["jizhi-ex"]);
    expect(offered.resolvingCards).toEqual([]);
    expect(offered.discardPile).toEqual([]);
    const prompt = getGameView(offered, actor.id).prompt;
    if (prompt.type !== "skill_choice") throw new Error("Expected Jizhi prompt");
    expect(prompt.promptId).toBe((offered.pendingResponse as Extract<GameSession["pendingResponse"], { type: "skill_choice" }>).promptId);

    const action: Extract<GameAction, { type: "resolve_skill" }> = {
      type: "resolve_skill",
      playerId: actor.id,
      skillId: "jizhi",
      activate: true,
      promptId: prompt.promptId,
    };
    const resolved = applyAction(JSON.parse(JSON.stringify(offered)) as GameSession, action);
    expect(resolved.pendingResponse).toBeNull();
    expect(resolved.players.find((player) => player.id === actor.id)?.hand.map((card) => card.id)).toEqual([
      "jizhi-draw", "jizhi-effect-1", "jizhi-effect-2",
    ]);
    expect(resolved.discardPile.filter((card) => card.id === "jizhi-ex")).toHaveLength(1);
    expect(resolved.logs.filter((log) => log.message.includes("发动集智，摸了"))).toHaveLength(1);
    expect(ruleCode(() => applyAction(resolved, action))).toBe("INVALID_PHASE");
  });

  it("declines without drawing and rejects a stale prompt id without changing the offered frame", () => {
    const { session, actor } = setup(3);
    actor.generalId = "huang_yue_ying";
    actor.hand = [makeCard("jizhi-decline", "ex_nihilo")];
    session.deck = [makeCard("decline-effect-2", "dodge"), makeCard("decline-effect-1", "slash")];
    const offered = applyAction(session, {
      type: "play_card", playerId: actor.id, cardId: "jizhi-decline",
    });
    const prompt = getGameView(offered, actor.id).prompt;
    if (prompt.type !== "skill_choice" || !prompt.promptId) throw new Error("Expected identified Jizhi prompt");
    expect(ruleCode(() => applyAction(offered, {
      type: "resolve_skill", playerId: actor.id, skillId: "jizhi", activate: true, promptId: "stale",
    }))).toBe("INVALID_PHASE");
    expect(offered.players.find((player) => player.id === actor.id)?.hand.map((card) => card.id)).toEqual(["jizhi-decline"]);

    const resolved = applyAction(offered, {
      type: "resolve_skill", playerId: actor.id, skillId: "jizhi", activate: false, promptId: prompt.promptId,
    });
    expect(resolved.players.find((player) => player.id === actor.id)?.hand.map((card) => card.id)).toEqual([
      "decline-effect-1", "decline-effect-2",
    ]);
    expect(resolved.logs.filter((log) => log.message.includes("未发动集智"))).toHaveLength(1);
  });

  it("covers every active ordinary-trick play path exactly once before commit", () => {
    const kinds: CardKind[] = [
      "ex_nihilo", "duel", "barbarian_invasion", "arrow_barrage", "peach_garden",
      "guo_he_chai_qiao", "shun_shou_qian_yang", "fire_attack", "amazing_grace",
      "borrowed_sword", "iron_chain",
    ];
    for (const kind of kinds) {
      const { session, actor, targets } = setup(3);
      actor.generalId = "huang_yue_ying";
      actor.hand = [makeCard(`jizhi-${kind}`, kind, kind === "fire_attack" ? "heart" : "spade")];
      actor.hp = kind === "peach_garden" ? 3 : 4;
      for (const [index, target] of targets.entries()) {
        target.generalId = "guan_yu";
        target.hand = [makeCard(`target-${kind}-${index}`, "dodge")];
      }
      targets[0]!.equipment.weapon = makeCard(`weapon-${kind}`, "zhu_ge_lian_nu");

      let action: Extract<GameAction, { type: "play_card" }> = {
        type: "play_card", playerId: actor.id, cardId: `jizhi-${kind}`,
      };
      if (["duel", "guo_he_chai_qiao", "shun_shou_qian_yang", "fire_attack"].includes(kind)) {
        action = { ...action, targetId: targets[0]!.id };
      } else if (kind === "borrowed_sword") {
        action = { ...action, targetIds: [targets[0]!.id, targets[1]!.id] };
      } else if (kind === "iron_chain") {
        action = { ...action, targetIds: [actor.id, targets[0]!.id] };
      }

      const offered = applyAction(session, action);
      expect(offered.pendingResponse).toMatchObject({
        type: "skill_choice",
        skillId: "jizhi",
        resume: { type: "card_use", intent: { effectiveKind: kind, method: "use" } },
      });
      expect(offered.players.find((player) => player.id === actor.id)?.hand.map((card) => card.id)).toContain(`jizhi-${kind}`);
      expect(offered.resolvingCards).toEqual([]);
      expect(offered.logs.filter((log) => log.message.includes("可以在普通锦囊结算前发动集智"))).toHaveLength(1);
    }
  });

  it("does not trigger for invalid targets, delayed tricks, Iron Chain recast, or Nullification responses", () => {
    const invalid = setup(3);
    invalid.actor.generalId = "huang_yue_ying";
    invalid.actor.hand = [makeCard("invalid-duel", "duel")];
    expect(ruleCode(() => applyAction(invalid.session, {
      type: "play_card", playerId: invalid.actor.id, cardId: "invalid-duel", targetId: invalid.actor.id,
    }))).toBe("INVALID_TARGET");
    expect(invalid.session.pendingResponse).toBeNull();
    expect(invalid.session.nextUseId).toBe(1);
    expect(invalid.actor.hand.map((card) => card.id)).toEqual(["invalid-duel"]);

    for (const kind of ["le_bu_si_shu", "bing_liang_cun_duan", "shan_dian"] as const) {
      const delayed = setup(3);
      delayed.actor.generalId = "huang_yue_ying";
      delayed.actor.hand = [makeCard(`delayed-${kind}`, kind)];
      const game = applyAction(delayed.session, {
        type: "play_card",
        playerId: delayed.actor.id,
        cardId: `delayed-${kind}`,
        targetId: kind === "shan_dian" ? undefined : delayed.targets[0]!.id,
      });
      expect(game.pendingResponse?.type).not.toBe("skill_choice");
      expect(game.logs.some((log) => log.message.includes("集智"))).toBe(false);
    }

    const recast = setup(3);
    recast.actor.generalId = "huang_yue_ying";
    recast.actor.hand = [makeCard("recast-chain", "iron_chain")];
    recast.session.deck = [makeCard("recast-draw", "dodge")];
    const recastGame = applyAction(recast.session, {
      type: "play_card", playerId: recast.actor.id, cardId: "recast-chain", targetIds: [],
    });
    expect(recastGame.pendingResponse).toBeNull();
    expect(recastGame.players.find((player) => player.id === recast.actor.id)?.hand.map((card) => card.id)).toContain("recast-draw");
    expect(recastGame.logs.some((log) => log.message.includes("集智"))).toBe(false);

    const nullification = setup(3);
    nullification.actor.generalId = "guan_yu";
    nullification.actor.hand = [makeCard("source-ex", "ex_nihilo")];
    const responder = nullification.targets[0]!;
    responder.generalId = "huang_yue_ying";
    responder.hand = [makeCard("jizhi-wuxie", "wu_xie_ke_ji")];
    let game = applyAction(nullification.session, {
      type: "play_card", playerId: nullification.actor.id, cardId: "source-ex",
    });
    expect(game.pendingResponse).toMatchObject({ type: "nullification", targetId: responder.id });
    game = applyAction(game, { type: "respond", playerId: responder.id, cardId: "jizhi-wuxie" });
    expect(game.pendingResponse?.type).not.toBe("skill_choice");
    expect(game.logs.some((log) => log.message.includes("集智"))).toBe(false);
  });

  it("restores a Qixi physical equipment card after a JSON-restored Jizhi continuation", () => {
    const { session, actor, targets: [target] } = setup(3);
    actor.generalId = "huang_yue_ying";
    actor.hp = 2;
    actor.equipment.armor = makeCard("continued-qixi-armor", "bai_yin_shi_zi", "club");
    target!.hand = [makeCard("continued-qixi-victim", "dodge")];
    session.deck = [makeCard("continued-jizhi-draw", "slash", "heart")];
    session.turn.phase = "respond";
    session.nextUseId = 2;
    session.nextEventId = 2;
    const triggerId = `1:jizhi:${actor.id}:0`;
    session.pendingResponse = {
      type: "skill_choice",
      targetId: actor.id,
      skillId: "jizhi",
      promptId: `skill:${triggerId}`,
      triggerId,
      resume: {
        type: "card_use",
        stage: "card_use_declared",
        eventId: 1,
        remainingTriggers: [],
        intent: {
          useId: 1,
          sourceId: actor.id,
          physicalCardId: "continued-qixi-armor",
          physicalKind: "bai_yin_shi_zi",
          effectiveKind: "guo_he_chai_qiao",
          suit: "club",
          rank: 1,
          targetIds: [target!.id],
          method: "use",
          viaSkill: "qixi",
        },
      },
    };

    let game = applyAction(JSON.parse(JSON.stringify(session)) as GameSession, {
      type: "resolve_skill",
      playerId: actor.id,
      skillId: "jizhi",
      activate: true,
      promptId: `skill:${triggerId}`,
    });
    expect(game.players.find((player) => player.id === actor.id)).toMatchObject({ hp: 3 });
    expect(game.players.find((player) => player.id === actor.id)?.equipment.armor).toBeUndefined();
    expect(game.players.find((player) => player.id === actor.id)?.hand.map((card) => card.id)).toContain("continued-jizhi-draw");
    expect(game.pendingResponse).toMatchObject({ type: "zone_selection", victimId: target!.id });
    expect(game.resolvingCards.find((card) => card.id === "continued-qixi-armor")?.kind).toBe("guo_he_chai_qiao");
    expect(game.virtualCardOrigins).toEqual({ "continued-qixi-armor": "bai_yin_shi_zi" });

    game = applyAction(game, { type: "choose_zone_card", playerId: actor.id, token: "hand:0" });
    expect(game.virtualCardOrigins).toEqual({});
    expect(game.discardPile.find((card) => card.id === "continued-qixi-armor")?.kind).toBe("bai_yin_shi_zi");
    const ids = allZoneCardIds(game);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("unified after-move skills", () => {
  it("offers Lianying after the last hand card moves and restores the suspended Slash response", () => {
    const { session, actor, targets: [target] } = setup(3);
    actor.generalId = "lu_xun";
    target!.generalId = "liu_bei";
    actor.hand = [makeCard("lianying-slash", "slash")];
    target!.hand = [makeCard("lianying-dodge", "dodge")];
    session.deck = [makeCard("lianying-draw", "peach", "heart")];

    const offered = applyAction(session, {
      type: "play_card",
      playerId: actor.id,
      cardId: "lianying-slash",
      targetId: target!.id,
    });
    expect(offered.pendingResponse).toMatchObject({
      type: "skill_choice",
      targetId: actor.id,
      skillId: "lianying",
      promptId: expect.stringContaining("lianying"),
      resume: { type: "after_move", eventId: expect.any(Number) },
    });
    expect(offered.afterMove).toMatchObject({
      queuedTriggers: [],
      suspendedPhase: "respond",
      suspendedResponse: { type: "slash", targetId: target!.id, cardId: "lianying-slash" },
    });
    const prompt = getGameView(offered, actor.id).prompt;
    if (prompt.type !== "skill_choice" || !prompt.promptId) throw new Error("Expected identified Lianying prompt");
    expect(ruleCode(() => applyAction(offered, {
      type: "resolve_skill",
      playerId: actor.id,
      skillId: "lianying",
      activate: true,
      promptId: "stale-after-move",
    }))).toBe("INVALID_PHASE");

    const resumed = applyAction(JSON.parse(JSON.stringify(offered)) as GameSession, {
      type: "resolve_skill",
      playerId: actor.id,
      skillId: "lianying",
      activate: true,
      promptId: prompt.promptId,
    });
    expect(resumed.players.find((player) => player.id === actor.id)?.hand.map((card) => card.id)).toEqual([
      "lianying-draw",
    ]);
    expect(resumed.pendingResponse).toMatchObject({ type: "slash", targetId: target!.id });
    expect(resumed.turn.phase).toBe("respond");
    expect(resumed.afterMove).toEqual({ queuedTriggers: [], suspendedPhase: null, suspendedResponse: null });
  });

  it("covers last-hand loss through response, another player's zone trick, and multi-card discard", () => {
    // Response path.
    const responseCase = setup(3);
    responseCase.actor.generalId = "liu_bei";
    responseCase.targets[0]!.generalId = "lu_xun";
    responseCase.actor.hand = [makeCard("response-slash", "slash")];
    responseCase.targets[0]!.hand = [makeCard("last-dodge", "dodge")];
    responseCase.session.deck = [makeCard("response-lianying-draw", "peach")];
    let responseGame = applyAction(responseCase.session, {
      type: "play_card", playerId: responseCase.actor.id, cardId: "response-slash", targetId: responseCase.targets[0]!.id,
    });
    responseGame = applyAction(responseGame, {
      type: "respond", playerId: responseCase.targets[0]!.id, cardId: "last-dodge",
    });
    expect(responseGame.pendingResponse).toMatchObject({ type: "skill_choice", skillId: "lianying" });

    // Cross-player hand movement path.
    const zoneCase = setup(3);
    zoneCase.actor.generalId = "liu_bei";
    zoneCase.targets[0]!.generalId = "lu_xun";
    zoneCase.actor.hand = [makeCard("zone-guohe", "guo_he_chai_qiao")];
    zoneCase.targets[0]!.hand = [makeCard("zone-last-hand", "dodge")];
    zoneCase.targets[1]!.hand = [];
    let zoneGame = applyAction(zoneCase.session, {
      type: "play_card", playerId: zoneCase.actor.id, cardId: "zone-guohe", targetId: zoneCase.targets[0]!.id,
    });
    expect(zoneGame.pendingResponse).toMatchObject({ type: "zone_selection", victimId: zoneCase.targets[0]!.id });
    zoneGame = applyAction(zoneGame, {
      type: "choose_zone_card", playerId: zoneCase.actor.id, token: "hand:0",
    });
    expect(zoneGame.pendingResponse).toMatchObject({
      type: "skill_choice", targetId: zoneCase.targets[0]!.id, skillId: "lianying",
    });

    // Multi-card discard reaches empty exactly once.
    const discardCase = setup(3);
    discardCase.actor.generalId = "lu_xun";
    discardCase.actor.hand = [makeCard("discard-a", "slash"), makeCard("discard-b", "dodge")];
    discardCase.session.turn.phase = "discard";
    discardCase.session.turn.requiredDiscardCount = 2;
    const discardGame = applyAction(discardCase.session, {
      type: "discard", playerId: discardCase.actor.id, cardIds: ["discard-a", "discard-b"],
    });
    expect(discardGame.pendingResponse).toMatchObject({ type: "skill_choice", skillId: "lianying" });
    expect(discardGame.logs.filter((log) => log.message.includes("可以发动连营"))).toHaveLength(1);
    expect(discardGame.afterMove.queuedTriggers).toEqual([]);
  });

  it("offers Xiaoji when equipment is replaced and draws two before returning to play", () => {
    const { session, actor } = setup(3);
    actor.generalId = "sun_shang_xiang";
    actor.equipment.armor = makeCard("old-armor", "ren_wang_dun");
    actor.hand = [makeCard("new-armor", "ba_gua_zhen", "heart")];
    session.deck = [makeCard("xiaoji-draw-2", "dodge"), makeCard("xiaoji-draw-1", "slash")];

    const offered = applyAction(session, {
      type: "play_card", playerId: actor.id, cardId: "new-armor", targetId: actor.id,
    });
    expect(offered.pendingResponse).toMatchObject({
      type: "skill_choice", targetId: actor.id, skillId: "xiaoji", resume: { type: "after_move" },
    });
    expect(offered.players.find((player) => player.id === actor.id)?.equipment.armor?.id).toBe("new-armor");
    expect(offered.discardPile.map((card) => card.id)).toContain("old-armor");
    const pending = offered.pendingResponse;
    if (pending?.type !== "skill_choice" || !pending.promptId) throw new Error("Expected Xiaoji prompt");
    const resolved = applyAction(offered, {
      type: "resolve_skill", playerId: actor.id, skillId: "xiaoji", activate: true, promptId: pending.promptId,
    });
    expect(resolved.players.find((player) => player.id === actor.id)?.hand.map((card) => card.id)).toEqual([
      "xiaoji-draw-1", "xiaoji-draw-2",
    ]);
    expect(resolved.pendingResponse).toBeNull();
    expect(resolved.turn.phase).toBe("play");
  });

  it("queues one recoverable Xiaoji choice per equipment lost to Guan Shi Fu costs", () => {
    const { session, actor, targets: [target] } = setup(3);
    actor.generalId = "sun_shang_xiang";
    target!.generalId = "liu_bei";
    actor.equipment.weapon = makeCard("xiaoji-guanshi", "guan_shi_fu");
    actor.equipment.armor = makeCard("xiaoji-cost-armor", "ren_wang_dun");
    actor.equipment.offensive_horse = makeCard("xiaoji-cost-horse", "chi_tu");
    actor.hand = [makeCard("xiaoji-guanshi-slash", "slash")];
    target!.hand = [makeCard("xiaoji-guanshi-dodge", "dodge")];
    session.deck = [
      makeCard("xiaoji-queue-draw-4", "wine"),
      makeCard("xiaoji-queue-draw-3", "peach"),
      makeCard("xiaoji-queue-draw-2", "dodge"),
      makeCard("xiaoji-queue-draw-1", "slash"),
    ];

    let game = applyAction(session, {
      type: "play_card", playerId: actor.id, cardId: "xiaoji-guanshi-slash", targetId: target!.id,
    });
    game = applyAction(game, { type: "respond", playerId: target!.id, cardId: "xiaoji-guanshi-dodge" });
    expect(game.pendingResponse).toMatchObject({ type: "weapon_action", stage: "guanshi_force_hit" });
    game = applyAction(game, {
      type: "resolve_weapon",
      playerId: actor.id,
      activate: true,
      cardIds: ["xiaoji-cost-armor", "xiaoji-cost-horse"],
    });
    expect(game.pendingResponse).toMatchObject({ type: "skill_choice", skillId: "xiaoji" });
    expect(game.afterMove.queuedTriggers).toHaveLength(1);
    const first = game.pendingResponse;
    if (first?.type !== "skill_choice" || !first.promptId) throw new Error("Missing first Xiaoji prompt");
    game = applyAction(JSON.parse(JSON.stringify(game)) as GameSession, {
      type: "resolve_skill", playerId: actor.id, skillId: "xiaoji", activate: true, promptId: first.promptId,
    });
    expect(game.pendingResponse).toMatchObject({ type: "skill_choice", skillId: "xiaoji" });
    const second = game.pendingResponse;
    if (second?.type !== "skill_choice" || !second.promptId) throw new Error("Missing second Xiaoji prompt");
    expect(second.promptId).not.toBe(first.promptId);
    game = applyAction(game, {
      type: "resolve_skill", playerId: actor.id, skillId: "xiaoji", activate: false, promptId: second.promptId,
    });
    expect(game.afterMove).toEqual({ queuedTriggers: [], suspendedPhase: null, suspendedResponse: null });
    expect(game.discardPile.map((card) => card.id)).toEqual(expect.arrayContaining([
      "xiaoji-cost-armor", "xiaoji-cost-horse",
    ]));
    expect(game.players.find((player) => player.id === actor.id)?.hand.map((card) => card.id)).toEqual([
      "xiaoji-queue-draw-1", "xiaoji-queue-draw-2",
    ]);
  });

  it("triggers Xiaoji when Borrowed Sword transfers its holder's weapon", () => {
    const { session, actor, targets: [holder, attackTarget] } = setup(3);
    actor.generalId = "liu_bei";
    holder!.generalId = "sun_shang_xiang";
    attackTarget!.generalId = "guan_yu";
    actor.hand = [makeCard("xiaoji-borrowed", "borrowed_sword")];
    holder!.hand = [];
    holder!.equipment.weapon = makeCard("xiaoji-borrowed-weapon", "zhu_ge_lian_nu");
    attackTarget!.hand = [];
    session.deck = [makeCard("xiaoji-borrowed-draw-2", "dodge"), makeCard("xiaoji-borrowed-draw-1", "slash")];

    let game = applyAction(session, {
      type: "play_card",
      playerId: actor.id,
      cardId: "xiaoji-borrowed",
      targetIds: [holder!.id, attackTarget!.id],
    });
    expect(game.pendingResponse).toMatchObject({ type: "borrowed_sword", targetId: holder!.id });
    game = applyAction(game, { type: "respond", playerId: holder!.id, cardId: null });
    expect(game.pendingResponse).toMatchObject({ type: "skill_choice", targetId: holder!.id, skillId: "xiaoji" });
    expect(game.players.find((player) => player.id === actor.id)?.hand.map((card) => card.id)).toContain(
      "xiaoji-borrowed-weapon",
    );
  });
});

describe("active and conversion standard skills", () => {
  it("uses a red card as Slash through Wusheng and preserves its physical identity", () => {
    const { session, actor, targets: [target] } = setup(3);
    actor.generalId = "guan_yu";
    actor.hand = [makeCard("wusheng-cost", "peach", "heart")];

    let game = applyAction(session, {
      type: "use_skill",
      playerId: actor.id,
      skillId: "wusheng",
      cardIds: ["wusheng-cost"],
      targetId: target!.id,
    });
    expect(game.pendingResponse).toMatchObject({ type: "slash", targetId: target!.id });
    expect(game.resolvingCards.find((card) => card.id === "wusheng-cost")?.kind).toBe("peach");

    game = applyAction(game, { type: "respond", playerId: target!.id, cardId: null });
    expect(game.discardPile.find((card) => card.id === "wusheng-cost")?.kind).toBe("peach");
    expect(game.players.find((player) => player.id === target!.id)?.hp).toBe(3);
  });

  it("uses Wusheng to answer a Duel with a red equipped card", () => {
    const { session, actor, targets: [target] } = setup(3);
    actor.hand = [makeCard("duel", "duel")];
    target!.generalId = "guan_yu";
    target!.equipment.offensive_horse = makeCard("red-horse", "chi_tu", "diamond");

    let game = applyAction(session, {
      type: "play_card",
      playerId: actor.id,
      cardId: "duel",
      targetId: target!.id,
    });
    game = applyAction(game, {
      type: "use_skill",
      playerId: target!.id,
      skillId: "wusheng",
      cardIds: ["red-horse"],
    });
    expect(game.pendingResponse).toMatchObject({ type: "duel", targetId: actor.id });
    expect(game.resolvingCards.find((card) => card.id === "red-horse")?.kind).toBe("chi_tu");
    expect(game.players.find((player) => player.id === target!.id)?.equipment.offensive_horse).toBeUndefined();
  });

  it("converts Dodge to Slash and Slash to Dodge through Longdan", () => {
    const { session, actor, targets: [target] } = setup(3);
    actor.generalId = "zhao_yun";
    actor.hand = [makeCard("longdan-dodge", "dodge", "club")];

    let game = applyAction(session, {
      type: "use_skill",
      playerId: actor.id,
      skillId: "longdan",
      cardIds: ["longdan-dodge"],
      targetId: target!.id,
    });
    game = applyAction(game, { type: "respond", playerId: target!.id, cardId: null });
    expect(game.discardPile.find((card) => card.id === "longdan-dodge")?.kind).toBe("dodge");
    expect(game.players.find((player) => player.id === target!.id)?.hp).toBe(3);

    const defender = game.players.find((player) => player.id === target!.id)!;
    game.currentPlayerId = defender.id;
    game.turn = { ...game.turn, playerId: defender.id, phase: "play", slashUsed: false, slashDamageBonus: 0 };
    defender.hand = [makeCard("incoming-slash", "slash")];
    const zhaoYun = game.players.find((player) => player.id === actor.id)!;
    zhaoYun.hand = [makeCard("longdan-slash", "fire_slash", "heart")];
    game = applyAction(game, {
      type: "play_card",
      playerId: defender.id,
      cardId: "incoming-slash",
      targetId: zhaoYun.id,
    });
    game = applyAction(game, {
      type: "use_skill",
      playerId: zhaoYun.id,
      skillId: "longdan",
      cardIds: ["longdan-slash"],
    });
    expect(game.players.find((player) => player.id === zhaoYun.id)?.hp).toBe(4);
    expect(game.discardPile.find((card) => card.id === "longdan-slash")?.kind).toBe("fire_slash");
  });

  it("uses a black equipped card as Dismantlement through Qixi", () => {
    const { session, actor, targets: [target] } = setup(3);
    actor.generalId = "gan_ning";
    actor.hp = 2;
    actor.equipment.armor = makeCard("qixi-armor", "bai_yin_shi_zi", "club");
    target!.hand = [makeCard("victim-card", "dodge")];

    let game = applyAction(session, {
      type: "use_skill",
      playerId: actor.id,
      skillId: "qixi",
      cardIds: ["qixi-armor"],
      targetId: target!.id,
    });
    expect(game.players.find((player) => player.id === actor.id)?.hp).toBe(3);
    expect(game.pendingResponse).toMatchObject({ type: "zone_selection", victimId: target!.id });
    game = applyAction(game, { type: "choose_zone_card", playerId: actor.id, token: "hand:0" });
    expect(game.discardPile.find((card) => card.id === "qixi-armor")?.kind).toBe("bai_yin_shi_zi");
    expect(game.discardPile.some((card) => card.id === "victim-card")).toBe(true);
  });

  it("loses one HP and draws two cards through Kurou, including after rescue", () => {
    const { session, actor } = setup(3);
    actor.generalId = "huang_gai";
    actor.hp = 2;
    session.deck = [makeCard("kurou-draw-2", "dodge"), makeCard("kurou-draw-1", "slash")];

    let game = applyAction(session, {
      type: "use_skill",
      playerId: actor.id,
      skillId: "kurou",
    });
    expect(game.players.find((player) => player.id === actor.id)).toMatchObject({ hp: 1, hand: [{ id: "kurou-draw-1" }, { id: "kurou-draw-2" }] });
    expect(game.turn.phase).toBe("play");

    const rescued = game.players.find((player) => player.id === actor.id)!;
    rescued.hp = 1;
    rescued.hand = [makeCard("self-peach", "peach", "heart")];
    game.deck = [makeCard("rescued-draw-2", "dodge"), makeCard("rescued-draw-1", "slash")];
    game = applyAction(game, { type: "use_skill", playerId: actor.id, skillId: "kurou" });
    expect(game.pendingResponse).toMatchObject({ type: "dying", victimId: actor.id, damageSourceId: null });
    game = applyAction(game, { type: "respond", playerId: actor.id, cardId: "self-peach" });
    expect(game.players.find((player) => player.id === actor.id)).toMatchObject({ hp: 1 });
    expect(game.players.find((player) => player.id === actor.id)?.hand.map((card) => card.id)).toEqual([
      "rescued-draw-1",
      "rescued-draw-2",
    ]);
    expect(game.turn.phase).toBe("play");
  });

  it("rejects skills the player does not own and invalid conversion costs", () => {
    const { session, actor, targets: [target] } = setup(3);
    actor.generalId = "guan_yu";
    actor.hand = [makeCard("black-card", "dodge", "spade")];
    expect(ruleCode(() => applyAction(session, {
      type: "use_skill", playerId: actor.id, skillId: "qixi", cardIds: ["black-card"], targetId: target!.id,
    }))).toBe("INVALID_SKILL");
    expect(ruleCode(() => applyAction(session, {
      type: "use_skill", playerId: actor.id, skillId: "wusheng", cardIds: ["black-card"], targetId: target!.id,
    }))).toBe("INVALID_CARD");
  });
});

describe("optional phase skills", () => {
  it("offers Luoyi before drawing, draws one when activated, and adds one Slash damage", () => {
    const { session, actor } = setup(3);
    const actorIndex = session.players.findIndex((player) => player.id === actor.id);
    const xuChu = session.players[(actorIndex + 1) % session.players.length]!;
    const victim = session.players[(actorIndex + 2) % session.players.length]!;
    xuChu.generalId = "xu_chu";
    session.deck = [makeCard("luoyi-draw-2", "dodge"), makeCard("luoyi-draw-1", "slash")];

    const choice = applyAction(session, { type: "end_play", playerId: actor.id });
    expect(choice.pendingResponse).toMatchObject({
      type: "skill_choice",
      targetId: xuChu.id,
      skillId: "luoyi",
      resume: { type: "finish_draw", playerId: xuChu.id },
    });
    expect(choice.players.find((player) => player.id === xuChu.id)?.hand).toHaveLength(0);
    expect(getGameView(choice, xuChu.id).prompt).toEqual({
      type: "skill_choice",
      playerId: xuChu.id,
      skillId: "luoyi",
      canPass: true,
    });
    expect(getGameView(choice, victim.id).pendingResponse).toBeNull();

    let game = applyAction(JSON.parse(JSON.stringify(choice)) as GameSession, {
      type: "resolve_skill",
      playerId: xuChu.id,
      skillId: "luoyi",
      activate: true,
    });
    expect(game.turn).toMatchObject({ phase: "play", luoyiActive: true });
    expect(game.players.find((player) => player.id === xuChu.id)?.hand).toHaveLength(1);

    const attacker = game.players.find((player) => player.id === xuChu.id)!;
    attacker.hand = [makeCard("luoyi-slash", "slash")];
    game = applyAction(game, {
      type: "play_card",
      playerId: attacker.id,
      cardId: "luoyi-slash",
      targetId: victim.id,
    });
    game = applyAction(game, { type: "respond", playerId: victim.id, cardId: null });
    expect(game.players.find((player) => player.id === victim.id)?.hp).toBe(2);

    const normalDraw = applyAction(choice, {
      type: "resolve_skill",
      playerId: xuChu.id,
      skillId: "luoyi",
      activate: false,
    });
    expect(normalDraw.turn).toMatchObject({ phase: "play", luoyiActive: false });
    expect(normalDraw.players.find((player) => player.id === xuChu.id)?.hand).toHaveLength(2);
  });

  it("adds Luoyi damage only when Xu Chu is the Duel damage source", () => {
    const { session, actor, targets: [target] } = setup(3);
    actor.generalId = "xu_chu";
    session.turn.luoyiActive = true;
    actor.hand = [makeCard("luoyi-duel", "duel")];

    let game = applyAction(session, {
      type: "play_card",
      playerId: actor.id,
      cardId: "luoyi-duel",
      targetId: target!.id,
    });
    game = applyAction(game, { type: "respond", playerId: target!.id, cardId: null });
    expect(game.players.find((player) => player.id === target!.id)?.hp).toBe(2);

    const losing = setup(3);
    losing.actor.generalId = "xu_chu";
    losing.session.turn.luoyiActive = true;
    losing.actor.hand = [makeCard("losing-duel", "duel")];
    losing.targets[0]!.hand = [makeCard("duel-answer", "slash")];
    let reverse = applyAction(losing.session, {
      type: "play_card",
      playerId: losing.actor.id,
      cardId: "losing-duel",
      targetId: losing.targets[0]!.id,
    });
    reverse = applyAction(reverse, {
      type: "respond",
      playerId: losing.targets[0]!.id,
      cardId: "duel-answer",
    });
    reverse = applyAction(reverse, { type: "respond", playerId: losing.actor.id, cardId: null });
    expect(reverse.players.find((player) => player.id === losing.actor.id)?.hp).toBe(3);
  });

  it("lets Keji skip a required discard only when no Slash was used or played", () => {
    const { session, actor } = setup(3);
    actor.generalId = "lv_meng";
    actor.hp = 3;
    actor.hand = Array.from({ length: 5 }, (_, index) => makeCard(`keji-${index}`, "dodge"));

    const choice = applyAction(session, { type: "end_play", playerId: actor.id });
    expect(choice.pendingResponse).toMatchObject({
      type: "skill_choice",
      skillId: "keji",
      resume: { type: "enter_discard", playerId: actor.id, count: 2 },
    });
    const activated = applyAction(choice, {
      type: "resolve_skill",
      playerId: actor.id,
      skillId: "keji",
      activate: true,
    });
    expect(activated.currentPlayerId).not.toBe(actor.id);

    const declined = applyAction(choice, {
      type: "resolve_skill",
      playerId: actor.id,
      skillId: "keji",
      activate: false,
    });
    expect(declined.turn).toMatchObject({ phase: "discard", requiredDiscardCount: 2 });

    actor.hand = [makeCard("keji-slash", "slash"), ...Array.from({ length: 4 }, (_, index) => makeCard(`keji-extra-${index}`, "dodge"))];
    const target = session.players.find((player) => player.id !== actor.id)!;
    let usedSlash = applyAction(session, {
      type: "play_card",
      playerId: actor.id,
      cardId: "keji-slash",
      targetId: target.id,
    });
    usedSlash = applyAction(usedSlash, { type: "respond", playerId: target.id, cardId: null });
    usedSlash = applyAction(usedSlash, { type: "end_play", playerId: actor.id });
    expect(usedSlash.pendingResponse?.type).not.toBe("skill_choice");
    expect(usedSlash.turn.phase).toBe("discard");
  });

  it("records a Slash played in a Duel during Lu Meng's own turn for Keji", () => {
    const { session, actor, targets: [target] } = setup(3);
    actor.generalId = "lv_meng";
    actor.hp = 3;
    actor.hand = [
      makeCard("keji-duel", "duel"),
      makeCard("keji-answer", "slash"),
      makeCard("keji-hold-1", "dodge"),
      makeCard("keji-hold-2", "dodge"),
      makeCard("keji-hold-3", "dodge"),
      makeCard("keji-hold-4", "dodge"),
    ];
    target!.hand = [makeCard("target-answer", "slash")];

    let game = applyAction(session, {
      type: "play_card",
      playerId: actor.id,
      cardId: "keji-duel",
      targetId: target!.id,
    });
    game = applyAction(game, { type: "respond", playerId: target!.id, cardId: "target-answer" });
    game = applyAction(game, { type: "respond", playerId: actor.id, cardId: "keji-answer" });
    game = applyAction(game, { type: "respond", playerId: target!.id, cardId: null });
    expect(game.turn.slashRespondedInPlayPhase).toBe(true);
    game = applyAction(JSON.parse(JSON.stringify(game)) as GameSession, {
      type: "end_play",
      playerId: actor.id,
    });
    expect(game.pendingResponse?.type).not.toBe("skill_choice");
    expect(game.turn.phase).toBe("discard");
  });
});

describe("Fanjian and Lijian", () => {
  it("restores Fanjian before RNG, rejects replay without consuming it, and publicly resolves the same random card", () => {
    const { session, actor, targets: [target, observer] } = setup(3);
    actor.generalId = "zhou_yu";
    target!.generalId = "liu_bei";
    observer!.generalId = "guan_yu";
    actor.hand = [
      makeCard("fanjian-slash", "slash", "spade"),
      makeCard("fanjian-dodge", "dodge", "spade"),
      makeCard("fanjian-peach", "peach", "spade"),
    ];

    const playPrompt = getGameView(session, actor.id).prompt;
    if (playPrompt.type !== "play") throw new Error("Expected play prompt");
    expect(playPrompt.skills.find((skill) => skill.skillId === "fanjian")).toMatchObject({
      minCards: 0,
      maxCards: 0,
      targetMode: "single-other",
      targetIds: expect.arrayContaining([target!.id, observer!.id]),
    });

    const offered = applyAction(session, {
      type: "use_skill",
      playerId: actor.id,
      skillId: "fanjian",
      targetId: target!.id,
    });
    const pending = offered.pendingResponse;
    if (pending?.type !== "fanjian_suit") throw new Error("Expected Fanjian suit prompt");
    expect(pending.promptId).toBe(`skill:${pending.eventId}:fanjian:${target!.id}:0`);
    expect(getGameView(offered, target!.id).prompt).toEqual({
      type: "fanjian_suit",
      playerId: target!.id,
      sourceId: actor.id,
      promptId: pending.promptId,
      suits: ["spade", "heart", "club", "diamond"],
    });
    expect(getGameView(offered, observer!.id).pendingResponse).toBeNull();
    expect(getGameView(offered, target!.id).players.find((player) => player.id === actor.id)?.hand).toBeNull();

    const rngBefore = { ...offered.rng };
    expect(ruleCode(() => applyAction(offered, {
      type: "choose_fanjian_suit",
      playerId: target!.id,
      suit: "heart",
      promptId: `${pending.promptId}:stale`,
    }))).toBe("INVALID_RESPONSE");
    expect(offered.rng).toEqual(rngBefore);

    const first = applyAction(JSON.parse(JSON.stringify(offered)) as GameSession, {
      type: "choose_fanjian_suit",
      playerId: target!.id,
      suit: "heart",
      promptId: pending.promptId,
    });
    const second = applyAction(JSON.parse(JSON.stringify(offered)) as GameSession, {
      type: "choose_fanjian_suit",
      playerId: target!.id,
      suit: "heart",
      promptId: pending.promptId,
    });
    const firstTarget = first.players.find((player) => player.id === target!.id)!;
    const secondTarget = second.players.find((player) => player.id === target!.id)!;
    expect(firstTarget.hand.map((card) => card.id)).toEqual(secondTarget.hand.map((card) => card.id));
    expect(first.rng).toEqual(second.rng);
    expect(first.rng.counter).toBeGreaterThan(rngBefore.counter);
    expect(firstTarget.hp).toBe(3);
    expect(first.logs.at(-1)?.message).toContain("反间展示牌花色与声明不符");
    expect(first.logs.some((log) => log.message.includes("随机获得并展示") && log.message.includes("黑桃"))).toBe(true);
    expect(first.turn).toMatchObject({ phase: "play", skillUseCounts: { fanjian: 1 } });
    expect(ruleCode(() => applyAction(first, {
      type: "use_skill",
      playerId: actor.id,
      skillId: "fanjian",
      targetId: observer!.id,
    }))).toBe("INVALID_SKILL");
  });

  it("does not damage a Fanjian target whose declared suit matches the random card", () => {
    const { session, actor, targets: [target] } = setup(3);
    actor.generalId = "zhou_yu";
    actor.hand = [makeCard("matching-fanjian", "slash", "diamond")];
    const offered = applyAction(session, {
      type: "use_skill", playerId: actor.id, skillId: "fanjian", targetId: target!.id,
    });
    const pending = offered.pendingResponse;
    if (pending?.type !== "fanjian_suit") throw new Error("Expected Fanjian suit prompt");
    const resolved = applyAction(offered, {
      type: "choose_fanjian_suit", playerId: target!.id, suit: "diamond", promptId: pending.promptId,
    });
    expect(resolved.players.find((player) => player.id === target!.id)).toMatchObject({
      hp: 4,
      hand: [{ id: "matching-fanjian" }],
    });
  });

  it("creates an ordered, unnullifiable Lijian Duel, attributes damage to its first male, and resumes Diao Chan after death", () => {
    const { session, actor, targets: [initiator, victim, other] } = setup(4);
    actor.generalId = "diao_chan";
    initiator!.generalId = "liu_bei";
    victim!.generalId = "zhu_ge_liang";
    other!.generalId = "guan_yu";
    actor.role = "rebel";
    initiator!.role = "lord";
    victim!.role = "loyalist";
    other!.role = "rebel";
    actor.equipment.armor = makeCard("lijian-cost", "ren_wang_dun", "club");
    actor.hand = [makeCard("second-lijian-cost", "dodge")];
    initiator!.hand = [makeCard("lord-kept-card", "dodge")];
    initiator!.equipment.weapon = makeCard("lord-kept-weapon", "zhu_ge_lian_nu", "club");
    initiator!.judgment = [makeCard("lord-kept-judgment", "le_bu_si_shu", "spade")];
    victim!.hand = [];
    victim!.hp = 1;
    other!.hand = [makeCard("unused-wuxie", "wu_xie_ke_ji")];

    const prompt = getGameView(session, actor.id).prompt;
    if (prompt.type !== "play") throw new Error("Expected play prompt");
    const hint = prompt.skills.find((skill) => skill.skillId === "lijian");
    expect(hint).toMatchObject({
      cardIds: expect.arrayContaining(["lijian-cost", "second-lijian-cost"]),
      minCards: 1,
      maxCards: 1,
      targetMode: "ordered-two",
    });
    expect(hint?.targetPairs).toContainEqual([initiator!.id, victim!.id]);
    expect(hint?.targetPairs).toContainEqual([victim!.id, initiator!.id]);

    let game = applyAction(session, {
      type: "use_skill",
      playerId: actor.id,
      skillId: "lijian",
      cardIds: ["lijian-cost"],
      targetIds: [initiator!.id, victim!.id],
    });
    expect(game.discardPile.map((card) => card.id)).toContain("lijian-cost");
    expect(game.pendingResponse).toMatchObject({
      type: "duel",
      attackerId: initiator!.id,
      targetId: victim!.id,
      initiatorId: initiator!.id,
      originalTargetId: victim!.id,
      cardId: expect.stringMatching(/^skill:lijian:/),
    });
    expect(getGameView(game, victim!.id).prompt).toMatchObject({
      type: "respond", context: "duel", responseKind: "slash",
    });
    expect(game.pendingResponse?.type).not.toBe("nullification");
    expect(game.players.find((player) => player.id === other!.id)?.hand.map((card) => card.id)).toContain("unused-wuxie");

    game = applyAction(JSON.parse(JSON.stringify(game)) as GameSession, {
      type: "respond", playerId: victim!.id, cardId: null,
    });
    expect(game.pendingResponse).toMatchObject({
      type: "dying", victimId: victim!.id, damageSourceId: initiator!.id,
    });
    while (game.pendingResponse?.type === "dying") {
      game = applyAction(game, {
        type: "respond",
        playerId: game.pendingResponse.targetId,
        cardId: null,
      });
    }
    expect(game.players.find((player) => player.id === victim!.id)?.alive).toBe(false);
    expect(game.players.find((player) => player.id === initiator!.id)?.hand).toHaveLength(0);
    expect(game.players.find((player) => player.id === initiator!.id)?.equipment).toEqual({});
    expect(game.players.find((player) => player.id === initiator!.id)?.judgment.map((card) => card.id)).toEqual(["lord-kept-judgment"]);
    expect(game.discardPile.map((card) => card.id)).toContain("lord-kept-card");
    expect(game.discardPile.map((card) => card.id)).toContain("lord-kept-weapon");
    expect(game.discardPile.map((card) => card.id)).not.toContain("lord-kept-judgment");
    expect(game.currentPlayerId).toBe(actor.id);
    expect(game.turn).toMatchObject({ phase: "play", skillUseCounts: { lijian: 1 } });
    expect(ruleCode(() => applyAction(game, {
      type: "use_skill",
      playerId: actor.id,
      skillId: "lijian",
      cardIds: ["second-lijian-cost"],
      targetIds: [initiator!.id, other!.id],
    }))).toBe("INVALID_SKILL");
  });

  it("uses Wushuang inside Lijian while still bypassing Nullification", () => {
    const { session, actor, targets: [luBu, victim, holder] } = setup(4);
    actor.generalId = "diao_chan";
    luBu!.generalId = "lv_bu";
    victim!.generalId = "liu_bei";
    holder!.generalId = "guan_yu";
    actor.hand = [makeCard("wushuang-lijian-cost", "dodge")];
    victim!.hand = [makeCard("lijian-answer-1", "slash"), makeCard("lijian-answer-2", "fire_slash", "heart")];
    holder!.hand = [makeCard("lijian-wuxie", "wu_xie_ke_ji")];

    let game = applyAction(session, {
      type: "use_skill",
      playerId: actor.id,
      skillId: "lijian",
      cardIds: ["wushuang-lijian-cost"],
      targetIds: [luBu!.id, victim!.id],
    });
    expect(game.pendingResponse).toMatchObject({
      type: "duel", targetId: victim!.id, requiredSlashCount: 2, slashesPlayed: 0,
    });
    game = applyAction(game, { type: "respond", playerId: victim!.id, cardId: "lijian-answer-1" });
    expect(game.pendingResponse).toMatchObject({ targetId: victim!.id, slashesPlayed: 1 });
    game = applyAction(game, { type: "respond", playerId: victim!.id, cardId: "lijian-answer-2" });
    expect(game.pendingResponse).toMatchObject({
      type: "duel", attackerId: victim!.id, targetId: luBu!.id, requiredSlashCount: 1,
    });
  });
});

describe("Yingzi, Biyue, and Luoshen phase skills", () => {
  it("offers Yingzi only in a real draw phase and draws three when accepted or two when declined", () => {
    const activated = setup(3);
    activated.actor.generalId = "guan_yu";
    const zhouYu = nextLiving(activated.session, activated.actor);
    zhouYu.generalId = "zhou_yu";
    activated.session.players.filter((player) => player.id !== zhouYu.id).forEach((player) => { player.generalId = "guan_yu"; });
    activated.session.deck = [
      makeCard("yingzi-3", "peach", "heart"),
      makeCard("yingzi-2", "dodge", "club"),
      makeCard("yingzi-1", "slash", "spade"),
    ];

    const choice = applyAction(activated.session, { type: "end_play", playerId: activated.actor.id });
    expect(choice.pendingResponse).toMatchObject({
      type: "skill_choice", targetId: zhouYu.id, skillId: "yingzi",
      resume: { type: "finish_draw", playerId: zhouYu.id },
    });
    expect(choice.players.find((player) => player.id === zhouYu.id)?.hand).toHaveLength(0);
    const accepted = applyAction(JSON.parse(JSON.stringify(choice)) as GameSession, {
      type: "resolve_skill", playerId: zhouYu.id, skillId: "yingzi", activate: true,
    });
    expect(accepted.turn.phase).toBe("play");
    expect(accepted.players.find((player) => player.id === zhouYu.id)?.hand.map((card) => card.id)).toEqual([
      "yingzi-1", "yingzi-2", "yingzi-3",
    ]);

    const declined = applyAction(choice, {
      type: "resolve_skill", playerId: zhouYu.id, skillId: "yingzi", activate: false,
    });
    expect(declined.turn.phase).toBe("play");
    expect(declined.players.find((player) => player.id === zhouYu.id)?.hand.map((card) => card.id)).toEqual([
      "yingzi-1", "yingzi-2",
    ]);
  });

  it("does not offer Yingzi when Supply Shortage skips the draw phase", () => {
    const { session, actor } = setup(3);
    actor.generalId = "guan_yu";
    const zhouYu = nextLiving(session, actor);
    zhouYu.generalId = "zhou_yu";
    zhouYu.judgment = [makeCard("yingzi-supply", "bing_liang_cun_duan")];
    session.deck = [{ ...makeCard("yingzi-supply-judge", "slash"), suit: "spade", rank: 7 }];

    const game = applyAction(session, { type: "end_play", playerId: actor.id });
    expect(game.currentPlayerId).toBe(zhouYu.id);
    expect(game.turn).toMatchObject({ phase: "play", skipDraw: true });
    expect(game.pendingResponse).toBeNull();
    expect(game.players.find((player) => player.id === zhouYu.id)?.hand).toHaveLength(0);
  });

  it("offers Biyue once after a no-discard end and draws before advancing", () => {
    const { session, actor } = setup(3);
    actor.generalId = "diao_chan";
    nextLiving(session, actor).generalId = "guan_yu";
    session.players.filter((player) => player.id !== actor.id).forEach((player) => { player.generalId = "guan_yu"; });
    session.deck = [makeCard("biyue-draw", "dodge", "heart")];

    const choice = applyAction(session, { type: "end_play", playerId: actor.id });
    expect(choice.pendingResponse).toMatchObject({
      type: "skill_choice", targetId: actor.id, skillId: "biyue",
      resume: { type: "finish_turn", playerId: actor.id },
    });
    const game = applyAction(JSON.parse(JSON.stringify(choice)) as GameSession, {
      type: "resolve_skill", playerId: actor.id, skillId: "biyue", activate: true,
    });
    expect(game.currentPlayerId).not.toBe(actor.id);
    expect(game.turn.number).toBe(session.turn.number + 1);
    expect(game.players.find((player) => player.id === actor.id)?.hand.map((card) => card.id)).toContain("biyue-draw");
  });

  it("offers Biyue after normal discard and after Indulgence skips play, while decline still advances once", () => {
    const discardedSetup = setup(3);
    discardedSetup.actor.generalId = "diao_chan";
    discardedSetup.actor.hp = 1;
    discardedSetup.actor.hand = [makeCard("biyue-hold", "dodge"), makeCard("biyue-discard", "slash")];
    discardedSetup.session.players.filter((player) => player.id !== discardedSetup.actor.id)
      .forEach((player) => { player.generalId = "guan_yu"; });
    let game = applyAction(discardedSetup.session, { type: "end_play", playerId: discardedSetup.actor.id });
    expect(game.turn.phase).toBe("discard");
    game = applyAction(game, { type: "discard", playerId: discardedSetup.actor.id, cardIds: ["biyue-discard"] });
    expect(game.pendingResponse).toMatchObject({ type: "skill_choice", skillId: "biyue" });
    const declined = applyAction(game, {
      type: "resolve_skill", playerId: discardedSetup.actor.id, skillId: "biyue", activate: false,
    });
    expect(declined.turn.number).toBe(discardedSetup.session.turn.number + 1);

    const skippedSetup = setup(3);
    skippedSetup.actor.generalId = "guan_yu";
    const diaoChan = nextLiving(skippedSetup.session, skippedSetup.actor);
    diaoChan.generalId = "diao_chan";
    diaoChan.judgment = [makeCard("biyue-indulgence", "le_bu_si_shu")];
    skippedSetup.session.deck = [
      makeCard("biyue-normal-draw-2", "dodge", "club"),
      makeCard("biyue-normal-draw-1", "slash", "spade"),
      { ...makeCard("biyue-indulgence-judge", "slash"), suit: "spade", rank: 7 },
    ];
    const skipped = applyAction(skippedSetup.session, { type: "end_play", playerId: skippedSetup.actor.id });
    expect(skipped.turn.skipPlay).toBe(true);
    expect(skipped.pendingResponse).toMatchObject({
      type: "skill_choice", targetId: diaoChan.id, skillId: "biyue",
    });
  });

  it("offers Luoshen on the first turn before any other phase and allows an initial decline", () => {
    let game: GameSession | undefined;
    for (let value = 1; value <= 500; value += 1) {
      const candidate = createGame({
        playerIds: ["first-a", "first-b", "first-c"],
        seed: value.toString(16).padStart(64, "0"),
      });
      const lord = candidate.players.find((player) => player.id === candidate.currentPlayerId);
      if (lord?.generalId === "zhen_ji") {
        game = candidate;
        break;
      }
    }
    if (!game) throw new Error("Could not find deterministic first-turn Zhen Ji fixture");
    const zhenJiId = game.currentPlayerId;
    const deckBefore = game.deck.length;
    expect(game.turn.number).toBe(1);
    expect(game.pendingResponse).toMatchObject({
      type: "skill_choice", targetId: zhenJiId, skillId: "luoshen", iteration: 0,
      resume: { type: "continue_judgment", playerId: zhenJiId },
    });
    expect(game.discardPile).toHaveLength(0);
    const declined = applyAction(game, {
      type: "resolve_skill", playerId: zhenJiId, skillId: "luoshen", activate: false,
    });
    expect(declined.turn.phase).toBe("play");
    expect(declined.deck).toHaveLength(deckBefore - 2);
    expect(declined.discardPile).toHaveLength(0);
  });

  it("serializes every Luoshen repeat, gains black judgments, and stops automatically on red", () => {
    const { session, actor } = setup(3);
    actor.generalId = "guan_yu";
    const zhenJi = nextLiving(session, actor);
    zhenJi.generalId = "zhen_ji";
    session.deck = [
      makeCard("luoshen-draw-2", "peach", "heart"),
      makeCard("luoshen-draw-1", "dodge", "diamond"),
      makeCard("luoshen-red", "slash", "heart"),
      makeCard("luoshen-black-2", "dodge", "club"),
      makeCard("luoshen-black-1", "slash", "spade"),
    ];

    let game = applyAction(session, { type: "end_play", playerId: actor.id });
    game = applyAction(game, { type: "resolve_skill", playerId: zhenJi.id, skillId: "luoshen", activate: true });
    expect(game.pendingResponse).toMatchObject({ type: "skill_choice", skillId: "luoshen", iteration: 1 });
    expect(game.players.find((player) => player.id === zhenJi.id)?.hand.map((card) => card.id)).toContain("luoshen-black-1");

    game = applyAction(JSON.parse(JSON.stringify(game)) as GameSession, {
      type: "resolve_skill", playerId: zhenJi.id, skillId: "luoshen", activate: true,
    });
    expect(game.pendingResponse).toMatchObject({ type: "skill_choice", skillId: "luoshen", iteration: 2 });
    game = applyAction(game, { type: "resolve_skill", playerId: zhenJi.id, skillId: "luoshen", activate: true });
    expect(game.pendingResponse).toBeNull();
    expect(game.turn.phase).toBe("play");
    expect(game.players.find((player) => player.id === zhenJi.id)?.hand.map((card) => card.id)).toEqual([
      "luoshen-black-1", "luoshen-black-2", "luoshen-draw-1", "luoshen-draw-2",
    ]);
    expect(game.discardPile.map((card) => card.id)).toContain("luoshen-red");
    const ids = allZoneCardIds(game);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("terminates Luoshen without a dead prompt when no card remains and can reshuffle a discard pile", () => {
    const exhausted = setup(3);
    exhausted.actor.generalId = "guan_yu";
    const zhenJi = nextLiving(exhausted.session, exhausted.actor);
    zhenJi.generalId = "zhen_ji";
    exhausted.session.deck = [makeCard("luoshen-last-black", "slash", "spade")];
    let game = applyAction(exhausted.session, { type: "end_play", playerId: exhausted.actor.id });
    game = applyAction(game, { type: "resolve_skill", playerId: zhenJi.id, skillId: "luoshen", activate: true });
    expect(game.pendingResponse).toBeNull();
    expect(game.turn.phase).toBe("play");
    expect(game.players.find((player) => player.id === zhenJi.id)?.hand.map((card) => card.id)).toEqual(["luoshen-last-black"]);

    const empty = setup(3);
    empty.actor.generalId = "guan_yu";
    const emptyZhenJi = nextLiving(empty.session, empty.actor);
    emptyZhenJi.generalId = "zhen_ji";
    let noCard = applyAction(empty.session, { type: "end_play", playerId: empty.actor.id });
    noCard = applyAction(noCard, {
      type: "resolve_skill", playerId: emptyZhenJi.id, skillId: "luoshen", activate: true,
    });
    expect(noCard.pendingResponse).toBeNull();
    expect(noCard.turn.phase).toBe("play");

    const recycled = setup(3);
    recycled.actor.generalId = "guan_yu";
    const recycledZhenJi = nextLiving(recycled.session, recycled.actor);
    recycledZhenJi.generalId = "zhen_ji";
    recycled.session.deck = [];
    recycled.session.discardPile = [
      makeCard("luoshen-recycle-a", "slash", "spade"),
      makeCard("luoshen-recycle-b", "dodge", "club"),
    ];
    const counterBefore = recycled.session.rng.counter;
    let reshuffled = applyAction(recycled.session, { type: "end_play", playerId: recycled.actor.id });
    reshuffled = applyAction(reshuffled, {
      type: "resolve_skill", playerId: recycledZhenJi.id, skillId: "luoshen", activate: true,
    });
    expect(reshuffled.rng.counter).toBeGreaterThan(counterBefore);
    expect(reshuffled.pendingResponse).toMatchObject({ type: "skill_choice", skillId: "luoshen", iteration: 1 });
  });

  it("runs Luoshen before delayed tricks and does not repeat prepare after a rescued Lightning hit", () => {
    const ordered = setup(3);
    ordered.actor.generalId = "guan_yu";
    const orderedZhenJi = nextLiving(ordered.session, ordered.actor);
    orderedZhenJi.generalId = "zhen_ji";
    orderedZhenJi.judgment = [makeCard("luoshen-order-indulgence", "le_bu_si_shu")];
    ordered.session.deck = [
      makeCard("luoshen-order-draw-2", "peach", "heart"),
      makeCard("luoshen-order-draw-1", "dodge", "diamond"),
      { ...makeCard("luoshen-order-delayed-judge", "slash"), suit: "heart", rank: 7 },
      makeCard("luoshen-order-black", "slash", "spade"),
    ];
    let orderGame = applyAction(ordered.session, { type: "end_play", playerId: ordered.actor.id });
    expect(orderGame.pendingResponse).toMatchObject({ type: "skill_choice", skillId: "luoshen", iteration: 0 });
    expect(orderGame.players.find((player) => player.id === orderedZhenJi.id)?.judgment.map((card) => card.id))
      .toEqual(["luoshen-order-indulgence"]);
    orderGame = applyAction(orderGame, {
      type: "resolve_skill", playerId: orderedZhenJi.id, skillId: "luoshen", activate: true,
    });
    expect(orderGame.players.find((player) => player.id === orderedZhenJi.id)?.judgment).toHaveLength(1);
    orderGame = applyAction(orderGame, {
      type: "resolve_skill", playerId: orderedZhenJi.id, skillId: "luoshen", activate: false,
    });
    expect(orderGame.turn.phase).toBe("play");
    expect(orderGame.players.find((player) => player.id === orderedZhenJi.id)?.judgment).toHaveLength(0);

    const lightning = setup(3);
    lightning.actor.generalId = "guan_yu";
    const victim = nextLiving(lightning.session, lightning.actor);
    victim.generalId = "zhen_ji";
    victim.hp = 3;
    victim.hand = [makeCard("luoshen-lightning-peach", "peach", "heart")];
    victim.judgment = [makeCard("luoshen-lightning", "shan_dian")];
    lightning.session.deck = [
      { ...makeCard("luoshen-lightning-hit", "slash"), suit: "spade", rank: 5 },
      makeCard("luoshen-lightning-black", "dodge", "club"),
    ];
    let lightningGame = applyAction(lightning.session, { type: "end_play", playerId: lightning.actor.id });
    lightningGame = applyAction(lightningGame, {
      type: "resolve_skill", playerId: victim.id, skillId: "luoshen", activate: true,
    });
    lightningGame = applyAction(lightningGame, {
      type: "resolve_skill", playerId: victim.id, skillId: "luoshen", activate: false,
    });
    expect(lightningGame.pendingResponse).toMatchObject({
      type: "dying",
      victimId: victim.id,
      resume: { type: "damage_flow", frameId: 1, damageId: 1, dyingId: 1 },
    });
    expect(lightningGame.completeRules.damageFlow.frames[0]?.callerContinuation).toMatchObject({
      type: "game_session.damage_resume.v1",
      data: { resume: { type: "turn_start" } },
    });
    lightningGame = applyAction(lightningGame, {
      type: "respond", playerId: victim.id, cardId: "luoshen-lightning-peach",
    });
    expect(lightningGame.currentPlayerId).toBe(victim.id);
    expect(lightningGame.turn.phase).toBe("play");
    expect(lightningGame.pendingResponse).toBeNull();
    expect(lightningGame.completeRules.damageFlow.frames).toEqual([]);
    expect(lightningGame.completeRules.damageFlow.completedDamageIds).toEqual([1]);
    expect(lightningGame.logs.filter((log) => log.message.includes("发动洛神获得黑色判定牌"))).toHaveLength(1);
    const ids = allZoneCardIds(lightningGame);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("standard utility skills", () => {
  it("uses Zhiheng once to discard owned cards and draw the same count", () => {
    const { session, actor } = setup(3);
    actor.generalId = "sun_quan";
    actor.hp = 2;
    actor.hand = [makeCard("zhiheng-hand", "dodge")];
    actor.equipment.armor = makeCard("zhiheng-lion", "bai_yin_shi_zi", "club");
    session.deck = [makeCard("zhiheng-draw-2", "peach"), makeCard("zhiheng-draw-1", "slash")];

    const prompt = getGameView(session, actor.id).prompt;
    if (prompt.type !== "play") throw new Error("Expected play prompt");
    expect(prompt.skills.find((skill) => skill.skillId === "zhiheng")).toMatchObject({
      minCards: 1,
      maxCards: 2,
      targetMode: "none",
    });

    const game = applyAction(session, {
      type: "use_skill",
      playerId: actor.id,
      skillId: "zhiheng",
      cardIds: ["zhiheng-hand", "zhiheng-lion"],
    });
    const current = game.players.find((player) => player.id === actor.id)!;
    expect(current.hp).toBe(3);
    expect(current.hand.map((card) => card.id)).toEqual(["zhiheng-draw-1", "zhiheng-draw-2"]);
    expect(game.discardPile.map((card) => card.id)).toEqual(expect.arrayContaining(["zhiheng-hand", "zhiheng-lion"]));
    expect(ruleCode(() => applyAction(game, {
      type: "use_skill",
      playerId: actor.id,
      skillId: "zhiheng",
      cardIds: ["zhiheng-draw-1"],
    }))).toBe("INVALID_SKILL");
  });

  it("transfers hand cards atomically through Rende and heals only at the first two-card threshold", () => {
    const { session, actor, targets: [target] } = setup(3);
    actor.generalId = "liu_bei";
    actor.hp = 2;
    actor.hand = [
      makeCard("rende-1", "slash"),
      makeCard("rende-2", "dodge"),
      makeCard("rende-3", "peach"),
    ];

    let game = applyAction(session, {
      type: "use_skill", playerId: actor.id, skillId: "rende", cardIds: ["rende-1"], targetId: target!.id,
    });
    expect(game.players.find((player) => player.id === actor.id)?.hp).toBe(2);
    expect(game.turn).toMatchObject({ rendeGivenCount: 1, rendeRecovered: false });
    game = applyAction(game, {
      type: "use_skill", playerId: actor.id, skillId: "rende", cardIds: ["rende-2"], targetId: target!.id,
    });
    expect(game.players.find((player) => player.id === actor.id)?.hp).toBe(3);
    expect(game.turn).toMatchObject({ rendeGivenCount: 2, rendeRecovered: true });
    game = applyAction(game, {
      type: "use_skill", playerId: actor.id, skillId: "rende", cardIds: ["rende-3"], targetId: target!.id,
    });
    expect(game.players.find((player) => player.id === actor.id)?.hp).toBe(3);
    expect(game.players.find((player) => player.id === target!.id)?.hand.map((card) => card.id)).toEqual([
      "rende-1", "rende-2", "rende-3",
    ]);
  });

  it("uses Qingnang once by discarding a hand card to heal any wounded role", () => {
    const { session, actor } = setup(3);
    actor.generalId = "hua_tuo";
    actor.hp = 2;
    actor.hand = [makeCard("qingnang-cost", "slash"), makeCard("qingnang-spare", "dodge")];
    const prompt = getGameView(session, actor.id).prompt;
    if (prompt.type !== "play") throw new Error("Expected play prompt");
    expect(prompt.skills.find((skill) => skill.skillId === "qingnang")?.targetIds).toContain(actor.id);

    const game = applyAction(session, {
      type: "use_skill",
      playerId: actor.id,
      skillId: "qingnang",
      cardIds: ["qingnang-cost"],
      targetId: actor.id,
    });
    expect(game.players.find((player) => player.id === actor.id)?.hp).toBe(3);
    expect(ruleCode(() => applyAction(game, {
      type: "use_skill",
      playerId: actor.id,
      skillId: "qingnang",
      cardIds: ["qingnang-spare"],
      targetId: actor.id,
    }))).toBe("INVALID_SKILL");
  });

  it("uses Jieyin once to heal Sun Shangxiang and another wounded male", () => {
    const { session, actor, targets: [target, invalidTarget] } = setup(3);
    actor.generalId = "sun_shang_xiang";
    actor.hp = 2;
    actor.hand = [makeCard("jieyin-1", "slash"), makeCard("jieyin-2", "dodge")];
    target!.generalId = "zhao_yun";
    target!.hp = 2;
    invalidTarget!.generalId = "da_qiao";
    invalidTarget!.hp = 2;

    const prompt = getGameView(session, actor.id).prompt;
    if (prompt.type !== "play") throw new Error("Expected play prompt");
    expect(prompt.skills.find((skill) => skill.skillId === "jieyin")?.targetIds).toEqual([target!.id]);
    const game = applyAction(session, {
      type: "use_skill",
      playerId: actor.id,
      skillId: "jieyin",
      cardIds: ["jieyin-1", "jieyin-2"],
      targetId: target!.id,
    });
    expect(game.players.find((player) => player.id === actor.id)?.hp).toBe(3);
    expect(game.players.find((player) => player.id === target!.id)?.hp).toBe(3);
  });

  it("keeps a Guose card virtual in judgment and restores its physical kind when it leaves", () => {
    const { session, actor } = setup(3);
    const actorIndex = session.players.findIndex((player) => player.id === actor.id);
    const target = session.players[(actorIndex + 1) % session.players.length]!;
    actor.generalId = "da_qiao";
    actor.equipment.offensive_horse = makeCard("guose-horse", "chi_tu", "diamond");
    target.hp = 1;
    session.deck = [
      makeCard("guose-draw-3", "peach", "heart"),
      makeCard("guose-draw-2", "dodge", "club"),
      makeCard("guose-draw-1", "slash", "spade"),
    ];

    let game = applyAction(session, {
      type: "use_skill",
      playerId: actor.id,
      skillId: "guose",
      cardIds: ["guose-horse"],
      targetId: target.id,
    });
    expect(game.players.find((player) => player.id === target.id)?.judgment).toEqual([
      expect.objectContaining({ id: "guose-horse", kind: "le_bu_si_shu", suit: "diamond" }),
    ]);
    expect(game.virtualCardOrigins).toEqual({ "guose-horse": "chi_tu" });
    game = applyAction(JSON.parse(JSON.stringify(game)) as GameSession, {
      type: "end_play",
      playerId: actor.id,
    });
    expect(game.discardPile).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "guose-horse", kind: "chi_tu" }),
    ]));
    expect(game.virtualCardOrigins).toEqual({});
  });

  it("uses a black hand card as Dodge through Qingguo", () => {
    const { session, actor, targets: [target] } = setup(3);
    actor.hand = [makeCard("qingguo-attack", "slash")];
    target!.generalId = "zhen_ji";
    target!.hand = [makeCard("qingguo-cost", "peach", "spade")];

    let game = applyAction(session, {
      type: "play_card",
      playerId: actor.id,
      cardId: "qingguo-attack",
      targetId: target!.id,
    });
    const prompt = getGameView(game, target!.id).prompt;
    if (prompt.type !== "respond") throw new Error("Expected response prompt");
    expect(prompt.skillResponses).toContainEqual({
      skillId: "qingguo",
      cardIds: ["qingguo-cost"],
      responseKind: "dodge",
    });
    game = applyAction(game, {
      type: "use_skill",
      playerId: target!.id,
      skillId: "qingguo",
      cardIds: ["qingguo-cost"],
    });
    expect(game.players.find((player) => player.id === target!.id)?.hp).toBe(4);
    expect(game.discardPile.find((card) => card.id === "qingguo-cost")?.kind).toBe("peach");
  });

  it("uses a red owned card as Peach through Jijiu outside Hua Tuo's turn", () => {
    const { session, actor } = setup(3);
    const actorIndex = session.players.findIndex((player) => player.id === actor.id);
    const victim = session.players[(actorIndex + 1) % session.players.length]!;
    const huaTuo = session.players[(actorIndex + 2) % session.players.length]!;
    actor.hand = [makeCard("jijiu-attack", "slash")];
    victim.hp = 1;
    huaTuo.generalId = "hua_tuo";
    huaTuo.equipment.offensive_horse = makeCard("jijiu-cost", "chi_tu", "diamond");

    let game = applyAction(session, {
      type: "play_card",
      playerId: actor.id,
      cardId: "jijiu-attack",
      targetId: victim.id,
    });
    game = applyAction(game, { type: "respond", playerId: victim.id, cardId: null });
    expect(game.pendingResponse).toMatchObject({ type: "dying", targetId: victim.id });
    game = applyAction(game, { type: "respond", playerId: victim.id, cardId: null });
    const prompt = getGameView(game, huaTuo.id).prompt;
    if (prompt.type !== "dying") throw new Error("Expected dying prompt");
    expect(prompt.skillResponses).toEqual([
      { skillId: "jijiu", cardIds: ["jijiu-cost"], responseKind: "peach" },
    ]);
    game = applyAction(game, {
      type: "use_skill",
      playerId: huaTuo.id,
      skillId: "jijiu",
      cardIds: ["jijiu-cost"],
    });
    expect(game.players.find((player) => player.id === victim.id)).toMatchObject({ alive: true, hp: 1 });
    expect(game.players.find((player) => player.id === huaTuo.id)?.equipment.offensive_horse).toBeUndefined();
    expect(game.discardPile.find((card) => card.id === "jijiu-cost")?.kind).toBe("chi_tu");
  });

  it("adds one recovery when another Wu general rescues lord Sun Quan through Jiuyuan", () => {
    const { session, actor } = setup(3);
    const actorIndex = session.players.findIndex((player) => player.id === actor.id);
    const sunQuan = session.players[(actorIndex + 1) % session.players.length]!;
    const rescuer = session.players[(actorIndex + 2) % session.players.length]!;
    const formerRole = sunQuan.role;
    sunQuan.role = "lord";
    actor.role = formerRole;
    sunQuan.generalId = "sun_quan";
    sunQuan.hp = 1;
    rescuer.generalId = "gan_ning";
    rescuer.hand = [makeCard("jiuyuan-peach", "peach", "heart")];
    actor.hand = [makeCard("jiuyuan-attack", "slash")];

    let game = applyAction(session, {
      type: "play_card",
      playerId: actor.id,
      cardId: "jiuyuan-attack",
      targetId: sunQuan.id,
    });
    game = applyAction(game, { type: "respond", playerId: sunQuan.id, cardId: null });
    game = applyAction(game, { type: "respond", playerId: sunQuan.id, cardId: null });
    expect(game.pendingResponse).toMatchObject({ type: "dying", targetId: rescuer.id });
    game = applyAction(game, { type: "respond", playerId: rescuer.id, cardId: "jiuyuan-peach" });
    expect(game.players.find((player) => player.id === sunQuan.id)).toMatchObject({ alive: true, hp: 2 });
  });
});
