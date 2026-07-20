import { describe, expect, it } from "vitest";

import {
  applyAction,
  assertCompleteRulesEngineState,
  beginDirectDeath,
  createGame,
  forfeitPlayer,
  getCardDefinition,
  getGameView,
  type Card,
  type CardKind,
  type GameSession,
  type PlayerId,
} from "../src/index.js";

const seed = "8d".repeat(32);

function card(id: string, kind: CardKind, suit: Card["suit"] = "spade", rank: Card["rank"] = 7): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank };
}

function setupWansha(): { game: GameSession; ownerId: PlayerId; victimId: PlayerId; rescuerId: PlayerId } {
  const game = createGame({ playerIds: ["wansha-owner", "wansha-victim", "wansha-rescuer", "wansha-peer"], seed });
  const owner = game.players.find((player) => player.id === game.currentPlayerId)!;
  const victim = game.players[(owner.seat + 1) % game.players.length]!;
  const rescuer = game.players.find((player) => player.id !== owner.id && player.id !== victim.id)!;
  for (const player of game.players) {
    player.generalId = "gan_ning";
    player.alive = true;
    player.hp = 4;
    player.maxHp = 4;
    player.hand = [];
    player.equipment = {};
    player.judgment = [];
    player.extraPiles = {};
    player.chained = false;
  }
  owner.generalId = "jia_xu";
  rescuer.generalId = "hua_tuo";
  victim.hp = 1;
  owner.hand = [card("wansha-slash", "slash")];
  rescuer.hand = [
    card("wansha-peach", "peach", "heart", 3),
    card("wansha-jijiu", "dodge", "diamond", 9),
  ];
  game.pendingResponse = null;
  game.resolvingCards = [];
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
  return { game, ownerId: owner.id, victimId: victim.id, rescuerId: rescuer.id };
}

function advanceToDyingResponder(game: GameSession, responderId: PlayerId): GameSession {
  let current = game;
  while (current.pendingResponse?.type === "dying" && current.pendingResponse.targetId !== responderId) {
    current = applyAction(current, {
      type: "respond",
      playerId: current.pendingResponse.targetId,
      cardId: null,
    });
  }
  if (current.pendingResponse?.type !== "dying" || current.pendingResponse.targetId !== responderId) {
    throw new Error("expected the requested dying responder");
  }
  return current;
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function setupXingshang(ownerCount = 1, playerCount = Math.max(4, ownerCount + 3)) {
  const game = createGame({
    playerIds: Array.from({ length: playerCount }, (_value, index) => `xingshang-${index + 1}`),
    seed,
  });
  const attacker = game.players.find((player) => player.id === game.currentPlayerId)!;
  const victim = game.players[(attacker.seat + 1) % game.players.length]!;
  const candidates = game.players
    .filter((player) => player.id !== attacker.id && player.id !== victim.id)
    .sort((left, right) => left.seat - right.seat);
  const owners = candidates.slice(0, ownerCount);
  const survivingRebel = candidates.at(-1)!;
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
  }
  attacker.role = "loyalist";
  victim.role = "rebel";
  survivingRebel.role = "rebel";
  const lord = candidates.find((player) => player.id !== survivingRebel.id) ?? attacker;
  lord.role = "lord";
  for (const owner of owners) owner.generalId = "cao_pi";
  attacker.hand = [card("xingshang-slash", "slash")];
  victim.hp = 1;
  victim.hand = [card("xingshang-hand", "dodge", "heart", 2)];
  victim.equipment = { weapon: card("xingshang-weapon", "qing_gang_jian", "spade", 6) };
  victim.judgment = [card("xingshang-judgment", "le_bu_si_shu", "heart", 6)];
  victim.extraPiles = { private: [card("xingshang-extra", "peach", "diamond", 12)] };
  game.pendingResponse = null;
  game.resolvingCards = [];
  game.afterMove = { queuedRecoveries: [], queuedTriggers: [], suspendedPhase: null, suspendedResponse: null };
  game.turn = {
    ...game.turn,
    playerId: attacker.id,
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
  return { game, attacker, victim, owners, survivingRebel };
}

function reachDeathPrompt(game: GameSession, attackerId: PlayerId, victimId: PlayerId): GameSession {
  let current = applyAction(game, {
    type: "play_card",
    playerId: attackerId,
    cardId: "xingshang-slash",
    targetId: victimId,
  });
  current = applyAction(current, { type: "respond", playerId: victimId, cardId: null });
  while (current.pendingResponse?.type === "dying") {
    current = applyAction(current, {
      type: "respond",
      playerId: current.pendingResponse.targetId,
      cardId: null,
    });
  }
  return current;
}

function startUnansweredSlash(game: GameSession, sourceId: PlayerId, targetId: PlayerId): GameSession {
  let current = applyAction(game, {
    type: "play_card",
    playerId: sourceId,
    cardId: "forest-damage-slash",
    targetId,
  });
  current = applyAction(current, { type: "respond", playerId: targetId, cardId: null });
  return current;
}

describe("live Forest global skills", () => {
  it("Wansha hides and rejects third-party Peach and Jijiu against the top DyingStack victim", () => {
    const { game, ownerId, victimId, rescuerId } = setupWansha();
    let current = applyAction(game, {
      type: "play_card",
      playerId: ownerId,
      cardId: "wansha-slash",
      targetId: victimId,
    });
    current = applyAction(current, { type: "respond", playerId: victimId, cardId: null });
    current = advanceToDyingResponder(current, rescuerId);

    const prompt = getGameView(current, rescuerId).prompt;
    expect(prompt).toMatchObject({
      type: "dying",
      playerId: rescuerId,
      victimId,
      peachCardIds: [],
      skillResponses: [],
    });
    if (prompt.type !== "dying") throw new Error("expected dying prompt");
    expect(prompt.allowedCardIds).not.toContain("wansha-peach");

    expect(() => applyAction(current, {
      type: "respond",
      playerId: rescuerId,
      cardId: "wansha-peach",
    })).toThrow(/完杀/);
    expect(() => applyAction(current, {
      type: "use_skill",
      playerId: rescuerId,
      skillId: "jijiu",
      cardIds: ["wansha-jijiu"],
    })).toThrow(/完杀/);
  });

  it("Wansha rejects a third-party Guhuo declaration that resolves as Peach", () => {
    const { game, ownerId, victimId, rescuerId } = setupWansha();
    const rescuer = game.players.find((player) => player.id === rescuerId)!;
    rescuer.generalId = "yu_ji";
    rescuer.hand = [card("wansha-guhuo", "dodge", "heart", 4)];
    let current = applyAction(game, {
      type: "play_card",
      playerId: ownerId,
      cardId: "wansha-slash",
      targetId: victimId,
    });
    current = applyAction(current, { type: "respond", playerId: victimId, cardId: null });
    current = advanceToDyingResponder(current, rescuerId);
    expect(() => applyAction(current, {
      type: "declare_guhuo",
      playerId: rescuerId,
      cardId: "wansha-guhuo",
      declaredKind: "peach",
    })).toThrow(/完杀/);
  });

  it("Xingshang pauses DeathStack, survives JSON, rejects cursor/snapshot tampering, excludes extra piles, then awards bounty", () => {
    const { game, attacker, victim } = setupXingshang();
    const current = reachDeathPrompt(game, attacker.id, victim.id);
    const pending = current.pendingResponse;
    expect(pending).toMatchObject({ type: "standard_skill", skillId: "xingshang", stage: "xingshang_claim" });
    if (pending?.type !== "standard_skill" || pending.skillId !== "xingshang" || !pending.deathResolution) {
      throw new Error("expected Xingshang death prompt");
    }
    expect(current.completeRules.dying.frames.at(-1)?.stage).toBe("death_confirmed");
    expect(current.completeRules.death.frames.at(-1)?.stage).toBe("card_disposition");
    expect(current.status).toBe("playing");

    const restored = jsonClone(current);
    expect(() => assertCompleteRulesEngineState(
      restored.completeRules,
      restored.players.map(({ id, hp, maxHp, alive }) => ({ id, hp, maxHp, alive })),
    )).not.toThrow();
    const badFrame = jsonClone(restored);
    if (badFrame.pendingResponse?.type !== "standard_skill" || !badFrame.pendingResponse.deathResolution) throw new Error("missing death cursor");
    (badFrame.pendingResponse.deathResolution as { frameId: number }).frameId += 1;
    expect(() => applyAction(badFrame, {
      type: "resolve_standard_skill",
      playerId: pending.targetId,
      promptId: pending.promptId,
      activate: true,
    })).toThrow(/DeathStack|行殇/);

    const badResume = jsonClone(restored);
    if (badResume.pendingResponse?.type !== "standard_skill" ||
        badResume.pendingResponse.deathResolution?.completion.type !== "dying" ||
        badResume.pendingResponse.deathResolution.completion.resume.type !== "damage_flow") throw new Error("missing damage resume");
    (badResume.pendingResponse.deathResolution.completion.resume as { dyingId: number }).dyingId += 1;
    expect(() => applyAction(badResume, {
      type: "resolve_standard_skill",
      playerId: pending.targetId,
      promptId: pending.promptId,
      activate: true,
    })).toThrow(/DamageFlow|篡改/);

    const badOwned = jsonClone(restored);
    const deathFrame = badOwned.completeRules.death.frames.at(-1);
    if (!deathFrame) throw new Error("missing death frame");
    (deathFrame.ownedPhysicalCardIds as string[]).push("forged-owned-card");
    expect(() => applyAction(badOwned, {
      type: "resolve_standard_skill",
      playerId: pending.targetId,
      promptId: pending.promptId,
      activate: true,
    })).toThrow(/篡改/);

    const attackerHandBefore = restored.players.find((player) => player.id === attacker.id)!.hand.length;
    const resolved = applyAction(restored, {
      type: "resolve_standard_skill",
      playerId: pending.targetId,
      promptId: pending.promptId,
      activate: true,
    });
    const owner = resolved.players.find((player) => player.id === pending.targetId)!;
    expect(owner.hand.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      "xingshang-hand", "xingshang-weapon", "xingshang-judgment",
    ]));
    expect(owner.hand.map((entry) => entry.id)).not.toContain("xingshang-extra");
    expect(resolved.discardPile.map((entry) => entry.id)).toContain("xingshang-extra");
    expect(resolved.players.find((player) => player.id === attacker.id)?.hand).toHaveLength(attackerHandBefore + 3);
    expect(resolved.completeRules.death.frames).toEqual([]);
    expect(resolved.completeRules.dying.frames).toEqual([]);
    expect(resolved.completeRules.damageFlow.frames).toEqual([]);
    expect(resolved.players.find((player) => player.id === victim.id)).toMatchObject({ alive: false, hp: 0 });
  });

  it("offers multiple Xingshang owners in order and lets the later owner claim after the first declines", () => {
    const { game, attacker, victim } = setupXingshang(2, 5);
    let current = reachDeathPrompt(game, attacker.id, victim.id);
    const first = current.pendingResponse;
    if (first?.type !== "standard_skill" || first.skillId !== "xingshang") throw new Error("missing first Xingshang prompt");
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: first.targetId,
      promptId: first.promptId,
      activate: false,
    });
    const second = current.pendingResponse;
    if (second?.type !== "standard_skill" || second.skillId !== "xingshang") throw new Error("missing second Xingshang prompt");
    expect(second.targetId).not.toBe(first.targetId);
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: second.targetId,
      promptId: second.promptId,
      activate: true,
    });
    expect(current.players.find((player) => player.id === first.targetId)?.hand).toEqual([]);
    expect(current.players.find((player) => player.id === second.targetId)?.hand.map((entry) => entry.id))
      .toEqual(expect.arrayContaining(["xingshang-hand", "xingshang-weapon", "xingshang-judgment"]));
  });

  it("skips a Xingshang owner who forfeits while its DeathStack prompt is pending", () => {
    const { game, attacker, victim, owners, survivingRebel } = setupXingshang(2, 5);
    attacker.role = "lord";
    for (const owner of owners) owner.role = "loyalist";
    survivingRebel.role = "rebel";
    let current = reachDeathPrompt(game, attacker.id, victim.id);
    const first = current.pendingResponse;
    if (first?.type !== "standard_skill" || first.skillId !== "xingshang") throw new Error("missing first Xingshang prompt");

    current = forfeitPlayer(current, first.targetId);
    expect(current.players.find((player) => player.id === first.targetId)).toMatchObject({ alive: false, hp: 0 });
    const second = current.pendingResponse;
    if (second?.type !== "standard_skill" || second.skillId !== "xingshang") throw new Error("missing resumed Xingshang prompt");
    expect(second.targetId).not.toBe(first.targetId);

    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: second.targetId,
      promptId: second.promptId,
      activate: true,
    });
    expect(current.players.find((player) => player.id === second.targetId)?.hand.map((entry) => entry.id))
      .toEqual(expect.arrayContaining(["xingshang-hand", "xingshang-weapon", "xingshang-judgment"]));
    expect(current.completeRules.death.frames).toEqual([]);
    expect(current.completeRules.dying.frames).toEqual([]);
    expect(current.completeRules.damageFlow.frames).toEqual([]);
  });

  it("runs a max-HP-zero direct death through the same pausable DeathStack entry", () => {
    const { game, victim, owners } = setupXingshang();
    const owner = owners[0]!;
    victim.maxHp = 0;
    victim.hp = 0;
    const paused = beginDirectDeath(game, victim.id, { type: "finish_effect" });
    expect(paused).toBe(true);
    const pending = game.pendingResponse;
    if (pending?.type !== "standard_skill" || pending.skillId !== "xingshang") throw new Error("missing direct-death Xingshang prompt");
    expect(pending.targetId).toBe(owner.id);
    const resolved = applyAction(game, {
      type: "resolve_standard_skill",
      playerId: pending.targetId,
      promptId: pending.promptId,
      activate: false,
    });
    expect(resolved.players.find((player) => player.id === victim.id)).toMatchObject({ alive: false, hp: 0, maxHp: 0 });
    expect(resolved.completeRules.death.frames).toEqual([]);
  });

  it("records only the rebel-bounty cards actually available when fewer than three can be drawn", () => {
    const { game, attacker, victim } = setupXingshang(0);
    victim.hand = [];
    victim.equipment = {};
    victim.judgment = [];
    victim.extraPiles = {};
    game.deck = [card("only-bounty-card", "dodge", "club", 5)];
    game.discardPile = [];
    const resolved = reachDeathPrompt(game, attacker.id, victim.id);
    expect(resolved.players.find((player) => player.id === attacker.id)?.hand.map((entry) => entry.id))
      .toEqual(["only-bounty-card"]);
    expect(resolved.logs.some((entry) => entry.message.includes("摸了 1 张牌"))).toBe(true);
    expect(resolved.completeRules.death.frames).toEqual([]);
  });

  it("applies the lord-kills-loyalist hand/equipment penalty after Xingshang disposition", () => {
    const { game, attacker, victim } = setupXingshang();
    attacker.role = "lord";
    victim.role = "loyalist";
    attacker.hand.push(card("lord-penalty-hand", "peach", "heart", 8));
    attacker.equipment = { armor: card("lord-penalty-armor", "ren_wang_dun", "club", 2) };
    let current = reachDeathPrompt(game, attacker.id, victim.id);
    const pending = current.pendingResponse;
    if (pending?.type !== "standard_skill" || pending.skillId !== "xingshang") throw new Error("missing Xingshang prompt");
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: pending.targetId,
      promptId: pending.promptId,
      activate: false,
    });
    const lord = current.players.find((player) => player.id === attacker.id)!;
    expect(lord.hand).toEqual([]);
    expect(lord.equipment).toEqual({});
    expect(current.discardPile.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      "lord-penalty-hand", "lord-penalty-armor",
    ]));
  });

  it("does not publish a winner until Xingshang and all DeathStack stages finish", () => {
    const { game, attacker, victim, owners } = setupXingshang(1, 3);
    attacker.role = "lord";
    victim.role = "rebel";
    owners[0]!.role = "loyalist";
    let current = reachDeathPrompt(game, attacker.id, victim.id);
    expect(current.status).toBe("playing");
    expect(current.winner).toBeNull();
    expect(current.completeRules.death.frames.at(-1)?.stage).toBe("card_disposition");
    const pending = current.pendingResponse;
    if (pending?.type !== "standard_skill" || pending.skillId !== "xingshang") throw new Error("missing Xingshang prompt");
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: pending.targetId,
      promptId: pending.promptId,
      activate: true,
    });
    expect(current.status).toBe("finished");
    expect(current.winner?.side).toBe("lord");
    expect(current.completeRules.death.frames).toEqual([]);
    expect(current.completeRules.dying.frames).toEqual([]);
    expect(current.completeRules.damageFlow.frames).toEqual([]);
  });

  it("Fangzhu uses one target-after-damage opportunity to draw lost HP then turn over another player", () => {
    const { game, attacker: source, victim: owner } = setupXingshang(0);
    owner.generalId = "cao_pi";
    owner.hp = 4;
    owner.hand = [];
    owner.equipment = {};
    owner.judgment = [];
    owner.extraPiles = {};
    source.hand = [card("forest-damage-slash", "slash")];
    const recipient = game.players.find((player) => player.id !== source.id && player.id !== owner.id)!;
    const handBefore = recipient.hand.length;
    let current = startUnansweredSlash(game, source.id, owner.id);
    const pending = current.pendingResponse;
    expect(pending).toMatchObject({ type: "standard_skill", skillId: "fangzhu", stage: "fangzhu_target" });
    if (pending?.type !== "standard_skill" || pending.skillId !== "fangzhu") throw new Error("missing Fangzhu prompt");
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: pending.promptId,
      activate: true,
      targetId: recipient.id,
    });
    expect(current.players.find((player) => player.id === owner.id)?.hp).toBe(3);
    expect(current.players.find((player) => player.id === recipient.id)).toMatchObject({ faceUp: false });
    expect(current.players.find((player) => player.id === recipient.id)?.hand).toHaveLength(handBefore + 1);
    expect(current.completeRules.damageFlow.frames).toEqual([]);
  });

  it("Lieren reuses the persisted PindianFrame and anonymously gains one target card only on a strict win", () => {
    const { game, attacker: source, victim: target } = setupXingshang(0);
    source.generalId = "zhu_rong";
    target.generalId = "gan_ning";
    target.hp = 4;
    source.hand = [
      card("forest-damage-slash", "slash"),
      card("lieren-owner-high", "dodge", "heart", 13),
    ];
    target.hand = [
      card("lieren-target-low", "dodge", "club", 1),
      card("lieren-gain", "peach", "heart", 5),
    ];
    let current = startUnansweredSlash(game, source.id, target.id);
    let pending = current.pendingResponse;
    if (pending?.type !== "standard_skill" || pending.skillId !== "lieren" || pending.stage !== "lieren_invoke") {
      throw new Error("missing Lieren invoke prompt");
    }
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: source.id,
      promptId: pending.promptId,
      activate: true,
    });
    pending = current.pendingResponse;
    if (pending?.type !== "pindian") throw new Error("missing Lieren initiator Pindian prompt");
    current = applyAction(current, {
      type: "choose_pindian_card",
      playerId: source.id,
      promptId: pending.promptId,
      cardId: "lieren-owner-high",
    });
    pending = current.pendingResponse;
    if (pending?.type !== "pindian") throw new Error("missing Lieren target Pindian prompt");
    current = applyAction(current, {
      type: "choose_pindian_card",
      playerId: target.id,
      promptId: pending.promptId,
      cardId: "lieren-target-low",
    });
    pending = current.pendingResponse;
    if (pending?.type !== "standard_skill" || pending.skillId !== "lieren" || pending.stage !== "lieren_gain") {
      throw new Error("missing Lieren gain prompt");
    }
    const prompt = getGameView(current, source.id).prompt;
    expect(prompt).toMatchObject({ type: "standard_skill", skillId: "lieren", stage: "lieren_gain" });
    if (prompt.type !== "standard_skill") throw new Error("missing Lieren projected prompt");
    expect(prompt.choices?.find((choice) => choice.token === "hand:0")?.card).toBeNull();
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: source.id,
      promptId: pending.promptId,
      activate: true,
      tokens: ["hand:0"],
    });
    expect(current.players.find((player) => player.id === source.id)?.hand.map((entry) => entry.id)).toContain("lieren-gain");
    expect(current.players.find((player) => player.id === target.id)?.hand).toEqual([]);
    expect(current.completeRules.damageFlow.frames).toEqual([]);
  });

  it("Baonue offers a living Qun damage source and settles its spade JudgmentFrame for the lord", () => {
    const { game, attacker: source, victim: target } = setupXingshang(0);
    source.generalId = "hua_tuo";
    target.generalId = "gan_ning";
    target.hp = 4;
    source.hand = [card("forest-damage-slash", "slash")];
    const lord = game.players.find((player) => player.id !== source.id && player.id !== target.id)!;
    lord.generalId = "dong_zhuo";
    lord.role = "lord";
    lord.hp = 3;
    lord.maxHp = 4;
    game.deck.push(card("baonue-spade", "dodge", "spade", 7));
    let current = startUnansweredSlash(game, source.id, target.id);
    const pending = current.pendingResponse;
    expect(pending).toMatchObject({ type: "standard_skill", skillId: "baonue", stage: "baonue_invoke", sourceId: lord.id });
    if (pending?.type !== "standard_skill" || pending.skillId !== "baonue") throw new Error("missing Baonue prompt");
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: source.id,
      promptId: pending.promptId,
      activate: true,
    });
    expect(current.players.find((player) => player.id === lord.id)?.hp).toBe(4);
    expect(current.discardPile.map((entry) => entry.id)).toContain("baonue-spade");
    expect(current.completeRules.damageFlow.frames).toEqual([]);
  });

  it("Songwei is offered to the judged Wei player only after the final black successful judgment", () => {
    const { game, attacker: source, victim: judged } = setupXingshang(0);
    source.generalId = "gan_ning";
    judged.generalId = "xia_hou_dun";
    judged.hp = 4;
    source.hand = [
      card("forest-damage-slash", "slash"),
      card("ganglie-cost-1", "dodge", "heart", 2),
      card("ganglie-cost-2", "dodge", "diamond", 3),
    ];
    const lord = game.players.find((player) => player.id !== source.id && player.id !== judged.id)!;
    lord.generalId = "cao_pi";
    lord.role = "lord";
    const lordHandBefore = lord.hand.length;
    game.deck.push(
      card("songwei-draw", "peach", "heart", 4),
      card("songwei-black-judgment", "dodge", "club", 10),
    );
    let current = startUnansweredSlash(game, source.id, judged.id);
    let pending = current.pendingResponse;
    if (pending?.type !== "standard_skill" || pending.skillId !== "ganglie") throw new Error("missing Ganglie prompt");
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: judged.id,
      promptId: pending.promptId,
      activate: true,
    });
    pending = current.pendingResponse;
    if (pending?.type !== "standard_judgment") throw new Error("missing Songwei judgment prompt");
    expect(getGameView(current, judged.id).prompt).toMatchObject({
      type: "standard_skill",
      skillId: "songwei",
      stage: "songwei_invoke",
      playerId: judged.id,
    });
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: judged.id,
      promptId: pending.promptId,
      activate: true,
    });
    expect(current.players.find((player) => player.id === lord.id)?.hand).toHaveLength(lordHandBefore + 1);
    expect(current.players.find((player) => player.id === lord.id)?.hand.map((entry) => entry.id)).toContain("songwei-draw");
    expect(current.pendingResponse).toMatchObject({ type: "standard_skill", skillId: "ganglie", stage: "ganglie_punish" });
  });
});
