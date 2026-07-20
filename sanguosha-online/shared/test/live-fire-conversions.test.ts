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
  type GeneralSkillId,
  type GameDamageResume,
} from "../src/index.js";

const seed = "b4".repeat(32);

function card(id: string, kind: CardKind, suit: Card["suit"] = "club", rank: Card["rank"] = 7): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank };
}

function setup(): { game: GameSession; owner: GamePlayer; others: GamePlayer[] } {
  const game = createGame({ playerIds: ["fire-b-1", "fire-b-2", "fire-b-3", "fire-b-4"], seed });
  const owner = game.players.find((player) => player.id === game.currentPlayerId)!;
  const ownerIndex = game.players.findIndex((player) => player.id === owner.id);
  const others = Array.from({ length: game.players.length - 1 }, (_, offset) =>
    game.players[(ownerIndex + offset + 1) % game.players.length]!,
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
  return { game, owner, others };
}

function grant(game: GameSession, player: GamePlayer, skillId: GeneralSkillId): void {
  grantSkill(game.completeRules.lifecycle, {
    ownerId: player.id,
    skillId,
    sourcePlayerId: player.id,
    sourceSkillId: "test",
    expiry: { type: "permanent" },
  });
}

function zoneCount(game: GameSession, cardId: string): number {
  return [
    ...game.deck,
    ...game.discardPile,
    ...game.resolvingCards,
    ...game.players.flatMap((player) => player.hand),
    ...game.players.flatMap((player) => Object.values(player.equipment)),
    ...game.players.flatMap((player) => player.judgment),
    ...game.players.flatMap((player) => Object.values(player.extraPiles).flat()),
  ].filter((entry) => entry.id === cardId).length;
}

function declineSkillChoice(game: GameSession, playerId: string, skillId: "jizhi"): GameSession {
  const prompt = getGameView(game, playerId).prompt;
  if (prompt.type !== "skill_choice" || !prompt.promptId) throw new Error(`Expected ${skillId} prompt`);
  return applyAction(game, {
    type: "resolve_skill",
    playerId,
    skillId,
    promptId: prompt.promptId,
    activate: false,
  });
}

describe("live Fire card conversions", () => {
  it("strictly round-trips both Luanji entity ids in a DamageFlow continuation", () => {
    const resume: GameDamageResume = {
      type: "mass_attack",
      pending: {
        type: "mass_attack",
        attackerId: "luanji-owner",
        targetId: "luanji-target",
        cardId: "luanji-first",
        damageCardIds: ["luanji-first", "luanji-second"],
        sourceSkillId: "luanji",
        cardKind: "arrow_barrage",
        responseKind: "dodge",
        remainingTargetIds: [],
        declinedLordSkillIds: [],
      },
    };
    const encoded = encodeGameDamageContinuation(resume);
    expect(decodeGameDamageContinuation(JSON.parse(JSON.stringify(encoded)))).toEqual(resume);
    const tampered = JSON.parse(JSON.stringify(encoded)) as {
      data: { resume: { pending: { damageCardIds: string[] } } };
    };
    tampered.data.resume.pending.damageCardIds = ["forged-first", "luanji-second"];
    expect(() => decodeGameDamageContinuation(tampered)).toThrow(/primary cardId/);
    tampered.data.resume.pending.damageCardIds = ["luanji-first"];
    expect(() => decodeGameDamageContinuation(tampered)).toThrow(/2 through 2/);
  });

  it("uses or recasts a Club hand card through Lianhuan and resumes Jizhi once after JSON", () => {
    const { game, owner, others: [first, second] } = setup();
    if (!first || !second) throw new Error("Missing Lianhuan targets");
    grant(game, owner, "lianhuan");
    grant(game, owner, "jizhi");
    owner.hand = [
      card("lianhuan-recast", "dodge", "club"),
      card("lianhuan-use", "peach", "club"),
    ];
    game.deck = [card("lianhuan-draw", "slash", "diamond")];

    let current = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "lianhuan",
      cardIds: ["lianhuan-recast"],
      targetIds: [],
    });
    expect(current.pendingResponse).toBeNull();
    expect(current.players.find((player) => player.id === owner.id)?.hand.map((entry) => entry.id))
      .toEqual(expect.arrayContaining(["lianhuan-use", "lianhuan-draw"]));

    current = applyAction(current, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "lianhuan",
      cardIds: ["lianhuan-use"],
      targetIds: [first.id, second.id],
    });
    expect(current.pendingResponse).toMatchObject({ type: "skill_choice", skillId: "jizhi" });
    current = JSON.parse(JSON.stringify(current)) as GameSession;
    current = declineSkillChoice(current, owner.id, "jizhi");

    expect(current.players.find((player) => player.id === first.id)?.chained).toBe(true);
    expect(current.players.find((player) => player.id === second.id)?.chained).toBe(true);
    expect(current.logs.filter((entry) => entry.message.includes("可以在普通锦囊结算前发动集智"))).toHaveLength(1);
    for (const cardId of ["lianhuan-recast", "lianhuan-use", "lianhuan-draw"]) {
      expect(zoneCount(current, cardId)).toBe(1);
    }
    expect(current.discardPile.find((entry) => entry.id === "lianhuan-use")?.kind).toBe("peach");
  });

  it("allows Huoji to target its owner only when another hand card remains after payment", () => {
    const { game, owner } = setup();
    grant(game, owner, "huoji");
    owner.hand = [
      card("huoji-cost", "dodge", "heart"),
      card("huoji-reveal", "peach", "club", 9),
      card("huoji-payment", "slash", "club"),
    ];
    const play = getGameView(game, owner.id).prompt;
    if (play.type !== "play") throw new Error("Expected Huoji play prompt");
    expect(play.skills.find((skill) => skill.skillId === "huoji")).toMatchObject({
      targetMode: "single-any",
      targetIds: expect.arrayContaining([owner.id]),
    });

    let current = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "huoji",
      cardIds: ["huoji-cost"],
      targetId: owner.id,
    });
    expect(current.pendingResponse).toMatchObject({ type: "fire_attack_reveal", targetId: owner.id });
    current = JSON.parse(JSON.stringify(current)) as GameSession;
    current = applyAction(current, { type: "choose_hand_card", playerId: owner.id, cardId: "huoji-reveal" });
    current = JSON.parse(JSON.stringify(current)) as GameSession;
    current = applyAction(current, { type: "choose_hand_card", playerId: owner.id, cardId: "huoji-payment" });

    expect(current.players.find((player) => player.id === owner.id)?.hp).toBe(3);
    expect(current.discardPile.find((entry) => entry.id === "huoji-cost")?.kind).toBe("dodge");
    for (const cardId of ["huoji-cost", "huoji-reveal", "huoji-payment"]) {
      expect(zoneCount(current, cardId)).toBe(1);
    }

    const oneCard = setup();
    grant(oneCard.game, oneCard.owner, "huoji");
    oneCard.owner.hand = [card("only-red", "dodge", "heart")];
    expect(() => applyAction(oneCard.game, {
      type: "use_skill",
      playerId: oneCard.owner.id,
      skillId: "huoji",
      cardIds: ["only-red"],
      targetId: oneCard.owner.id,
    })).toThrow();
  });

  it("discovers Kanpo-only responders and uses a black hand card to counter Nullification", () => {
    const { game, owner, others: [physicalResponder, kanpoOwner] } = setup();
    if (!physicalResponder || !kanpoOwner) throw new Error("Missing Kanpo fixtures");
    grant(game, kanpoOwner, "kanpo");
    grant(game, kanpoOwner, "hongyan");
    owner.hand = [card("kanpo-effect", "ex_nihilo", "diamond")];
    physicalResponder.hand = [card("physical-nullification", "wu_xie_ke_ji", "heart")];
    kanpoOwner.hand = [
      card("kanpo-valid", "dodge", "club"),
      card("kanpo-hongyan-spade", "slash", "spade"),
    ];
    game.deck = [card("kanpo-draw-2", "peach"), card("kanpo-draw-1", "dodge")];

    let current = applyAction(game, { type: "play_card", playerId: owner.id, cardId: "kanpo-effect" });
    expect(current.pendingResponse).toMatchObject({ type: "nullification", targetId: physicalResponder.id });
    current = applyAction(current, { type: "respond", playerId: physicalResponder.id, cardId: "physical-nullification" });
    current = JSON.parse(JSON.stringify(current)) as GameSession;
    const prompt = getGameView(current, kanpoOwner.id).prompt;
    expect(prompt).toMatchObject({
      type: "nullification",
      kanpoCardIds: ["kanpo-valid"],
    });
    current = applyAction(current, {
      type: "use_skill",
      playerId: kanpoOwner.id,
      skillId: "kanpo",
      cardIds: ["kanpo-valid"],
    });

    expect(current.pendingResponse).toBeNull();
    expect(current.players.find((player) => player.id === owner.id)?.hand.map((entry) => entry.id))
      .toEqual(expect.arrayContaining(["kanpo-draw-1", "kanpo-draw-2"]));
    expect(current.players.find((player) => player.id === kanpoOwner.id)?.hand.map((entry) => entry.id))
      .toContain("kanpo-hongyan-spade");
    expect(current.discardPile.find((entry) => entry.id === "kanpo-valid")?.kind).toBe("dodge");
    for (const cardId of ["kanpo-effect", "physical-nullification", "kanpo-valid", "kanpo-hongyan-spade"]) {
      expect(zoneCount(current, cardId)).toBe(1);
    }
  });

  it("keeps both Luanji entities through Jizhi, mass-attack DamageFlow, and JSON restore", () => {
    const { game, owner, others: [first, second, immune] } = setup();
    if (!first || !second || !immune) throw new Error("Missing Luanji targets");
    grant(game, owner, "luanji");
    grant(game, owner, "hongyan");
    grant(game, owner, "jizhi");
    first.generalId = "cao_cao";
    immune.equipment.armor = card("luanji-vine", "teng_jia", "club");
    owner.hand = [
      card("luanji-spade", "peach", "spade"),
      card("luanji-heart", "slash", "heart"),
    ];
    second.hand = [card("luanji-dodge", "dodge", "diamond")];

    let current = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "luanji",
      cardIds: ["luanji-spade", "luanji-heart"],
    });
    expect(current.pendingResponse).toMatchObject({ type: "skill_choice", skillId: "jizhi" });
    current = JSON.parse(JSON.stringify(current)) as GameSession;
    current = declineSkillChoice(current, owner.id, "jizhi");
    expect(current.pendingResponse).toMatchObject({ type: "mass_attack", targetId: first.id, damageCardIds: ["luanji-spade", "luanji-heart"] });

    current = applyAction(current, { type: "respond", playerId: first.id, cardId: null });
    expect(current.completeRules.damageFlow.frames.at(-1)?.damage.physicalCardIds)
      .toEqual(["luanji-spade", "luanji-heart"]);
    const jianxiong = getGameView(current, first.id).prompt;
    if (jianxiong.type !== "standard_skill") throw new Error("Expected Jianxiong prompt");
    current = JSON.parse(JSON.stringify(current)) as GameSession;
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: first.id,
      promptId: jianxiong.promptId,
      activate: false,
    });
    expect(current.pendingResponse).toMatchObject({ type: "mass_attack", targetId: second.id });
    current = applyAction(current, { type: "respond", playerId: second.id, cardId: "luanji-dodge" });

    expect(current.players.find((player) => player.id === first.id)?.hp).toBe(3);
    expect(current.players.find((player) => player.id === second.id)?.hp).toBe(4);
    expect(current.discardPile.find((entry) => entry.id === "luanji-spade")?.kind).toBe("peach");
    expect(current.discardPile.find((entry) => entry.id === "luanji-heart")?.kind).toBe("slash");
    for (const cardId of ["luanji-spade", "luanji-heart", "luanji-dodge"]) {
      expect(zoneCount(current, cardId)).toBe(1);
    }
  });
});

describe("live Fire Bazhen", () => {
  it("reuses Bagua judgment, preserves Bazhen provenance through retrial, and then offers Leiji", () => {
    const { game, owner: attacker, others: [target, retrialOwner] } = setup();
    if (!target || !retrialOwner) throw new Error("Missing Bazhen fixtures");
    grant(game, target, "bazhen");
    grant(game, target, "leiji");
    retrialOwner.generalId = "si_ma_yi";
    attacker.hand = [card("bazhen-slash", "slash", "heart")];
    retrialOwner.hand = [card("bazhen-retrial", "dodge", "heart")];
    game.deck = [card("bazhen-initial", "peach", "spade")];

    let current = applyAction(game, {
      type: "play_card",
      playerId: attacker.id,
      cardId: "bazhen-slash",
      targetId: target.id,
    });
    expect(getGameView(current, target.id).prompt).toMatchObject({
      type: "armor",
      armorKind: "ba_gua_zhen",
      sourceSkillId: "bazhen",
    });
    current = applyAction(current, { type: "activate_armor", playerId: target.id, activate: true });
    current = JSON.parse(JSON.stringify(current)) as GameSession;
    const retrial = getGameView(current, retrialOwner.id).prompt;
    if (retrial.type !== "standard_skill") throw new Error("Expected Bazhen retrial prompt");
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: retrialOwner.id,
      promptId: retrial.promptId,
      activate: true,
      cardId: "bazhen-retrial",
    });

    expect(current.pendingResponse).toMatchObject({
      type: "standard_skill",
      skillId: "leiji",
      leijiDodge: { provenance: { type: "view_as", skillId: "bazhen", physicalCardIds: [] } },
    });
    const leiji = getGameView(current, target.id).prompt;
    if (leiji.type !== "standard_skill") throw new Error("Expected Leiji prompt after Bazhen");
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: target.id,
      promptId: leiji.promptId,
      activate: false,
    });
    expect(current.players.find((player) => player.id === target.id)?.hp).toBe(4);

    const suppressed = setup();
    const suppressedTarget = suppressed.others[0]!;
    grant(suppressed.game, suppressedTarget, "bazhen");
    suppressed.owner.hand = [card("suppressed-slash", "slash", "heart")];
    suppressedTarget.equipment.armor = card("actual-armor", "ren_wang_dun", "club");
    const awaitingDodge = applyAction(suppressed.game, {
      type: "play_card",
      playerId: suppressed.owner.id,
      cardId: "suppressed-slash",
      targetId: suppressedTarget.id,
    });
    expect(getGameView(awaitingDodge, suppressedTarget.id).prompt.type).toBe("respond");

    const ignored = setup();
    const ignoredTarget = ignored.others[0]!;
    grant(ignored.game, ignoredTarget, "bazhen");
    ignored.owner.equipment.weapon = card("qinggang", "qing_gang_jian", "spade");
    ignored.owner.hand = [card("ignored-slash", "slash", "heart")];
    const ignoredArmor = applyAction(ignored.game, {
      type: "play_card",
      playerId: ignored.owner.id,
      cardId: "ignored-slash",
      targetId: ignoredTarget.id,
    });
    expect(getGameView(ignoredArmor, ignoredTarget.id).prompt.type).toBe("respond");
  });
});
