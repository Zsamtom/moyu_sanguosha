import { describe, expect, it } from "vitest";

import {
  GameRuleError,
  applyAction,
  beginDirectDeath,
  createGame,
  distanceBetweenPlayers,
  getCardDefinition,
  getGameView,
  grantSkill,
  type Card,
  type CardKind,
  type GamePlayer,
  type GameSession,
} from "../src/index.js";

const seed = "b7".repeat(32);

function card(id: string, kind: CardKind, suit: Card["suit"] = "club"): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank: 7 };
}

function setup(count = 4): { game: GameSession; owner: GamePlayer; others: GamePlayer[] } {
  const game = createGame({
    playerIds: Array.from({ length: count }, (_value, index) => `forest-b-${index + 1}`),
    seed,
  });
  const owner = game.players.find((player) => player.id === game.currentPlayerId)!;
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
  game.pendingResponse = null;
  game.afterMove = { queuedRecoveries: [], queuedTriggers: [], suspendedPhase: null, suspendedResponse: null };
  game.turn = {
    ...game.turn,
    playerId: owner.id,
    phase: "play",
    slashUsed: false,
    activeSlashUses: 0,
    tianyiOutcome: null,
    wineUsed: false,
    slashDamageBonus: 0,
    requiredDiscardCount: 0,
    discardStage: "hand_limit",
    skipDraw: false,
    skipPlay: false,
    luoyiActive: false,
    shuangxiongJudgmentColor: null,
    slashRespondedInPlayPhase: false,
    skillUseCounts: {},
    rendeGivenCount: 0,
    rendeRecovered: false,
  };
  return { game, owner, others: game.players.filter((player) => player.id !== owner.id) };
}

function grant(game: GameSession, ownerId: string, skillId: string): void {
  grantSkill(game.completeRules.lifecycle, {
    ownerId,
    skillId,
    sourcePlayerId: ownerId,
    sourceSkillId: `test:${skillId}`,
    expiry: { type: "permanent" },
  });
}

function seatOrderAfter(game: GameSession, source: GamePlayer): GamePlayer[] {
  return game.players
    .filter((player) => player.id !== source.id)
    .sort((left, right) =>
      (left.seat - source.seat + game.players.length) % game.players.length -
      (right.seat - source.seat + game.players.length) % game.players.length
    );
}

describe("live Forest card flow", () => {
  it("makes Roulin require exactly two Dodges and combines with Wushuang by maximum", () => {
    const { game, owner: attacker, others: [target] } = setup();
    if (!target) throw new Error("Missing Roulin target");
    attacker.generalId = "dong_zhuo";
    target.generalId = "diao_chan";
    grant(game, attacker.id, "wushuang");
    attacker.hand = [card("roulin-slash", "slash")];
    target.hand = [card("roulin-dodge-1", "dodge", "heart"), card("roulin-dodge-2", "dodge", "diamond")];

    let current = applyAction(game, {
      type: "play_card",
      playerId: attacker.id,
      cardId: "roulin-slash",
      targetId: target.id,
    });
    expect(current.pendingResponse).toMatchObject({ type: "slash", requiredDodgeCount: 2, dodgesPlayed: 0 });
    current = applyAction(current, { type: "respond", playerId: target.id, cardId: "roulin-dodge-1" });
    expect(current.pendingResponse).toMatchObject({ type: "slash", requiredDodgeCount: 2, dodgesPlayed: 1 });
  });

  it("rejects a black trick target through Weimu but never blocks black Nullification", () => {
    const { game, owner: source, others: [target] } = setup();
    if (!target) throw new Error("Missing Weimu target");
    target.generalId = "jia_xu";
    source.hand = [card("black-duel", "duel", "club")];
    expect(() => applyAction(game, {
      type: "play_card",
      playerId: source.id,
      cardId: "black-duel",
      targetId: target.id,
    })).toThrow(GameRuleError);

    source.hand = [card("red-duel", "duel", "heart")];
    target.hand = [card("black-nullification", "wu_xie_ke_ji", "spade")];
    let current = applyAction(game, {
      type: "play_card",
      playerId: source.id,
      cardId: "red-duel",
      targetId: target.id,
    });
    expect(current.pendingResponse).toMatchObject({ type: "nullification", targetId: target.id });
    current = applyAction(JSON.parse(JSON.stringify(current)) as GameSession, {
      type: "respond",
      playerId: target.id,
      cardId: "black-nullification",
    });
    expect(current.discardPile.some((candidate) => candidate.id === "black-nullification")).toBe(true);
  });

  it("uses a printed and effective Spade hand card as Wine through Jiuchi", () => {
    const { game, owner } = setup();
    owner.generalId = "dong_zhuo";
    owner.hand = [card("jiuchi-cost", "slash", "spade")];

    const current = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "jiuchi",
      cardIds: ["jiuchi-cost"],
    });
    expect(current.turn).toMatchObject({ wineUsed: true, slashDamageBonus: 1 });
    expect(current.discardPile).toContainEqual(expect.objectContaining({ id: "jiuchi-cost", kind: "slash" }));

    const blocked = setup().game;
    const hongyanOwner = blocked.players.find((player) => player.id === blocked.currentPlayerId)!;
    hongyanOwner.generalId = "dong_zhuo";
    hongyanOwner.hand = [card("hongyan-spade", "dodge", "spade")];
    grant(blocked, hongyanOwner.id, "hongyan");
    expect(() => applyAction(blocked, {
      type: "use_skill",
      playerId: hongyanOwner.id,
      skillId: "jiuchi",
      cardIds: ["hongyan-spade"],
    })).toThrow(GameRuleError);
  });

  it("lets the dying owner self-rescue with Jiuchi once across JSON restore", () => {
    const { game, owner, others: [target] } = setup();
    if (!target) throw new Error("Missing Jiuchi dying target");
    owner.generalId = "dong_zhuo";
    owner.hp = 1;
    owner.hand = [card("jiuchi-rescue", "dodge", "spade")];
    grant(game, owner.id, "qiangxi");

    let current = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "qiangxi",
      targetId: target.id,
    });
    expect(current.pendingResponse).toMatchObject({ type: "dying", victimId: owner.id, targetId: owner.id });
    expect(getGameView(current, owner.id).prompt).toMatchObject({
      type: "dying",
      skillResponses: [{ skillId: "jiuchi", cardIds: ["jiuchi-rescue"], responseKind: "wine" }],
    });

    current = applyAction(JSON.parse(JSON.stringify(current)) as GameSession, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "jiuchi",
      cardIds: ["jiuchi-rescue"],
    });
    expect(current.players.find((player) => player.id === owner.id)?.hp).toBe(1);
    expect(current.players.find((player) => player.id === target.id)?.hp).toBe(3);
    const rescueOccurrences = [
      ...current.deck,
      ...current.discardPile,
      ...current.resolvingCards,
      ...current.players.flatMap((player) => [...player.hand, ...Object.values(player.equipment), ...player.judgment]),
    ].filter((candidate) => candidate.id === "jiuchi-rescue");
    expect(rescueOccurrences).toEqual([expect.objectContaining({ kind: "dodge" })]);
  });

  it("freezes Duanliang distance before an equipped cost and runs Xiaoji before continuing", () => {
    const { game, owner, others } = setup(6);
    owner.equipment.offensive_horse = card("duanliang-horse", "chi_tu", "spade");
    const target = others.find((candidate) => distanceBetweenPlayers(game, owner.id, candidate.id) === 2);
    if (!target) throw new Error("Missing distance-three Duanliang target");
    const nullifier = others.find((candidate) => candidate.id !== target.id);
    if (!nullifier) throw new Error("Missing Duanliang Nullification holder");
    owner.generalId = "xu_huang";
    grant(game, owner.id, "xiaoji");
    nullifier.hand = [card("duanliang-nullification", "wu_xie_ke_ji", "heart")];
    expect(distanceBetweenPlayers(game, owner.id, target.id)).toBe(2);

    let current = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "duanliang",
      cardIds: ["duanliang-horse"],
      targetId: target.id,
    });
    expect(current.pendingResponse).toMatchObject({ type: "skill_choice", skillId: "xiaoji", targetId: owner.id });
    expect(current.afterMove.suspendedResponse).toMatchObject({ type: "nullification", targetId: nullifier.id });
    expect(current.players.find((player) => player.id === target.id)?.judgment).toEqual([]);
    expect(current.resolvingCards).toContainEqual(expect.objectContaining({
      id: "duanliang-horse",
      kind: "bing_liang_cun_duan",
    }));
    expect(current.virtualCardOrigins["duanliang-horse"]).toBe("chi_tu");

    const prompt = getGameView(JSON.parse(JSON.stringify(current)) as GameSession, owner.id).prompt;
    if (prompt.type !== "skill_choice" || !prompt.promptId) throw new Error("Expected Xiaoji prompt");
    current = applyAction(current, {
      type: "resolve_skill",
      playerId: owner.id,
      skillId: "xiaoji",
      promptId: prompt.promptId,
      activate: false,
    });
    expect(current.pendingResponse).toMatchObject({ type: "nullification", targetId: nullifier.id });
    current = applyAction(current, { type: "respond", playerId: nullifier.id, cardId: null });
    expect(current.players.find((player) => player.id === target.id)?.judgment).toContainEqual(
      expect.objectContaining({ id: "duanliang-horse", kind: "bing_liang_cun_duan" }),
    );
    const occurrences = [
      ...current.deck,
      ...current.discardPile,
      ...current.resolvingCards,
      ...current.players.flatMap((player) => [
        ...player.hand,
        ...Object.values(player.equipment),
        ...player.judgment,
      ]),
    ].filter((candidate) => candidate.id === "duanliang-horse");
    expect(occurrences).toHaveLength(1);

    const outOfRange = setup(6);
    outOfRange.owner.generalId = "xu_huang";
    outOfRange.owner.hand = [card("duanliang-too-far", "slash", "club")];
    const farTarget = outOfRange.others.find((candidate) =>
      distanceBetweenPlayers(outOfRange.game, outOfRange.owner.id, candidate.id) === 3
    );
    if (!farTarget) throw new Error("Missing distance-three rejection target");
    expect(() => applyAction(outOfRange.game, {
      type: "use_skill",
      playerId: outOfRange.owner.id,
      skillId: "duanliang",
      cardIds: ["duanliang-too-far"],
      targetId: farTarget.id,
    })).toThrow(GameRuleError);

    const invalid = setup();
    invalid.owner.generalId = "xu_huang";
    grant(invalid.game, invalid.owner.id, "hongyan");
    invalid.owner.hand = [card("duanliang-red-spade", "slash", "spade")];
    const duplicateTarget = invalid.others[0]!;
    expect(() => applyAction(invalid.game, {
      type: "use_skill",
      playerId: invalid.owner.id,
      skillId: "duanliang",
      cardIds: ["duanliang-red-spade"],
      targetId: duplicateTarget.id,
    })).toThrow(GameRuleError);
    grant(invalid.game, invalid.owner.id, "duanliang");
    invalid.owner.hand = [card("duanliang-duplicate", "slash", "club")];
    duplicateTarget.judgment = [card("existing-shortage", "bing_liang_cun_duan", "spade")];
    expect(() => applyAction(invalid.game, {
      type: "use_skill",
      playerId: invalid.owner.id,
      skillId: "duanliang",
      cardIds: ["duanliang-duplicate"],
      targetId: duplicateTarget.id,
    })).toThrow(GameRuleError);
  });

  it("excludes Weimu from global and virtual black tricks and skips it during Lightning transfer", () => {
    const { game, owner: source, others } = setup();
    const ordered = seatOrderAfter(game, source);
    const normal = ordered[0];
    const weimu = ordered[1];
    if (!normal || !weimu) throw new Error("Missing Weimu global fixtures");
    weimu.generalId = "jia_xu";
    source.hand = [card("weimu-nanman", "barbarian_invasion", "club")];
    const started = applyAction(game, {
      type: "play_card",
      playerId: source.id,
      cardId: "weimu-nanman",
    });
    expect(started.pendingResponse).toMatchObject({ type: "mass_attack", targetId: normal.id });
    expect(JSON.stringify(started.pendingResponse)).not.toContain(weimu.id);

    const virtual = setup();
    virtual.owner.generalId = "gan_ning";
    const virtualWeimu = virtual.others[0]!;
    virtualWeimu.generalId = "jia_xu";
    virtualWeimu.hand = [card("weimu-zone-card", "peach", "heart")];
    virtual.owner.hand = [card("weimu-qixi-cost", "slash", "club")];
    expect(() => applyAction(virtual.game, {
      type: "use_skill",
      playerId: virtual.owner.id,
      skillId: "qixi",
      cardIds: ["weimu-qixi-cost"],
      targetId: virtualWeimu.id,
    })).toThrow(GameRuleError);

    const lightning = setup();
    const lightningOrder = seatOrderAfter(lightning.game, lightning.owner);
    const lightningOwner = lightningOrder[0];
    const skippedWeimu = lightningOrder[1];
    const recipient = lightningOrder[2];
    if (!lightningOwner || !skippedWeimu || !recipient) throw new Error("Missing Lightning transfer fixtures");
    skippedWeimu.generalId = "jia_xu";
    lightningOwner.judgment = [card("weimu-lightning", "shan_dian", "spade")];
    lightning.game.deck = [card("weimu-lightning-miss", "peach", "heart")];
    const moved = applyAction(lightning.game, { type: "end_play", playerId: lightning.owner.id });
    expect(moved.players.find((player) => player.id === skippedWeimu.id)?.judgment).toEqual([]);
    expect(moved.players.find((player) => player.id === recipient.id)?.judgment).toContainEqual(
      expect.objectContaining({ id: "weimu-lightning" }),
    );
  });

  it("binds Huoshou once and uses no source after the bound owner later dies", () => {
    const { game, owner: source } = setup(5);
    const [firstVictim, huoshou, secondVictim] = seatOrderAfter(game, source);
    if (!firstVictim || !huoshou || !secondVictim) throw new Error("Missing Huoshou fixtures");
    huoshou.generalId = "meng_huo";
    firstVictim.hp = 1;
    firstVictim.hand = [card("huoshou-rescue", "peach", "heart")];
    secondVictim.hp = 1;
    source.hand = [card("huoshou-nanman", "barbarian_invasion", "spade")];

    let current = applyAction(game, {
      type: "play_card",
      playerId: source.id,
      cardId: "huoshou-nanman",
    });
    expect(current.pendingResponse).toMatchObject({
      type: "mass_attack",
      targetId: firstVictim.id,
      huoshouSourceId: huoshou.id,
    });
    current = applyAction(JSON.parse(JSON.stringify(current)) as GameSession, {
      type: "respond",
      playerId: firstVictim.id,
      cardId: null,
    });
    expect(current.pendingResponse).toMatchObject({
      type: "dying",
      victimId: firstVictim.id,
      damageSourceId: huoshou.id,
    });
    current = applyAction(current, {
      type: "respond",
      playerId: firstVictim.id,
      cardId: "huoshou-rescue",
    });
    expect(current.pendingResponse).toMatchObject({ type: "mass_attack", targetId: secondVictim.id, huoshouSourceId: huoshou.id });

    const restored = JSON.parse(JSON.stringify(current)) as GameSession;
    const restoredHuoshou = restored.players.find((player) => player.id === huoshou.id)!;
    const pending = restored.pendingResponse;
    if (pending?.type !== "mass_attack") throw new Error("Missing Huoshou mass-attack continuation");
    const resumedAfterDeath = beginDirectDeath(restored, restoredHuoshou.id, {
      type: "mass_attack",
      pending: {
        ...pending,
        targetId: firstVictim.id,
        remainingTargetIds: [pending.targetId, ...pending.remainingTargetIds],
      },
    });
    expect(resumedAfterDeath).toBe(true);
    expect(restored.completeRules.death.frames).toEqual([]);
    expect(restored.players.find((player) => player.id === huoshou.id)).toMatchObject({ alive: false, hp: 0 });
    expect(restored.pendingResponse).toMatchObject({
      type: "mass_attack",
      targetId: secondVictim.id,
      huoshouSourceId: huoshou.id,
    });
    current = applyAction(restored, {
      type: "respond",
      playerId: secondVictim.id,
      cardId: null,
    });
    expect(current.pendingResponse).toMatchObject({
      type: "dying",
      victimId: secondVictim.id,
      damageSourceId: null,
    });
  });

  it("claims a finished physical Nanman once by Juxiang after nested Dying", () => {
    const { game, owner: source } = setup();
    const [victim, firstOwner, secondOwner] = seatOrderAfter(game, source);
    if (!victim || !firstOwner || !secondOwner) throw new Error("Missing Juxiang fixtures");
    firstOwner.generalId = "zhu_rong";
    secondOwner.generalId = "zhu_rong";
    victim.hp = 1;
    victim.hand = [card("juxiang-rescue", "peach", "heart")];
    source.hand = [card("juxiang-nanman", "barbarian_invasion", "club")];

    let current = applyAction(game, {
      type: "play_card",
      playerId: source.id,
      cardId: "juxiang-nanman",
    });
    expect(current.pendingResponse).toMatchObject({ type: "mass_attack", targetId: victim.id });
    current = applyAction(current, { type: "respond", playerId: victim.id, cardId: null });
    expect(current.pendingResponse).toMatchObject({ type: "dying", victimId: victim.id });
    current = applyAction(JSON.parse(JSON.stringify(current)) as GameSession, {
      type: "respond",
      playerId: victim.id,
      cardId: "juxiang-rescue",
    });

    expect(current.players.find((player) => player.id === firstOwner.id)?.hand).toContainEqual(
      expect.objectContaining({ id: "juxiang-nanman", kind: "barbarian_invasion" }),
    );
    expect(current.players.find((player) => player.id === secondOwner.id)?.hand).toEqual([]);
    expect(current.discardPile.some((candidate) => candidate.id === "juxiang-nanman")).toBe(false);
    const occurrences = [
      ...current.deck,
      ...current.discardPile,
      ...current.resolvingCards,
      ...current.players.flatMap((player) => [...player.hand, ...Object.values(player.equipment), ...player.judgment]),
    ].filter((candidate) => candidate.id === "juxiang-nanman");
    expect(occurrences).toHaveLength(1);
  });

  it("never lets a Nanman user reclaim their own card through Juxiang", () => {
    const { game, owner: source, others } = setup();
    source.generalId = "zhu_rong";
    for (const target of others) target.generalId = "meng_huo";
    source.hand = [card("own-juxiang-nanman", "barbarian_invasion", "spade")];
    const current = applyAction(game, {
      type: "play_card",
      playerId: source.id,
      cardId: "own-juxiang-nanman",
    });
    expect(current.pendingResponse).toBeNull();
    expect(current.discardPile).toContainEqual(expect.objectContaining({ id: "own-juxiang-nanman" }));
    expect(current.players.find((player) => player.id === source.id)?.hand).toEqual([]);
  });

  it("never lets Juxiang claim a virtual Guhuo Nanman whose physical card is not Nanman", () => {
    const { game, owner: source, others } = setup();
    source.generalId = "yu_ji";
    const juxiang = others[0]!;
    juxiang.generalId = "zhu_rong";
    for (const target of others.slice(1)) target.generalId = "meng_huo";
    source.hand = [card("guhuo-virtual-nanman", "slash", "club")];

    let current = applyAction(game, {
      type: "declare_guhuo",
      playerId: source.id,
      cardId: "guhuo-virtual-nanman",
      declaredKind: "barbarian_invasion",
    });
    while (current.pendingResponse?.type === "guhuo" && current.pendingResponse.stage === "challenge") {
      const pending = current.pendingResponse;
      const prompt = getGameView(current, pending.targetId).prompt;
      if (prompt.type !== "guhuo_challenge") throw new Error("Missing Guhuo challenge prompt");
      current = applyAction(current, {
        type: "resolve_guhuo",
        playerId: pending.targetId,
        promptId: prompt.promptId,
        challenge: false,
      });
    }

    expect(current.pendingResponse).toBeNull();
    expect(current.players.find((player) => player.id === juxiang.id)?.hand).toEqual([]);
    expect(current.discardPile).toContainEqual(expect.objectContaining({
      id: "guhuo-virtual-nanman",
      kind: "slash",
    }));
    expect(current.virtualCardOrigins["guhuo-virtual-nanman"]).toBeUndefined();
  });
});
