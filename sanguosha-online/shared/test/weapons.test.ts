import { describe, expect, it } from "vitest";

import {
  applyAction,
  createGame,
  getCardDefinition,
  getGameView,
  type Card,
  type CardKind,
  type GamePlayer,
  type GameSession,
} from "../src/index.js";

const seed = "42".padStart(64, "0");

function makeCard(id: string, kind: CardKind, suit: Card["suit"] = "spade", rank = 1): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank };
}

function setup(playerCount = 2): { session: GameSession; actor: GamePlayer; targets: GamePlayer[] } {
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
    player.hp = player.maxHp;
  }
  session.deck = [];
  session.discardPile = [];
  session.resolvingCards = [];
  session.pendingResponse = null;
  session.turn.phase = "play";
  session.turn.slashUsed = false;
  session.turn.wineUsed = false;
  session.turn.slashDamageBonus = 0;
  return { session, actor, targets };
}

describe("remaining standard weapons", () => {
  it("resolves CiXiong choices using assigned general gender", () => {
    const { session, actor, targets: [target] } = setup();
    actor.generalId = "guan_yu";
    target!.generalId = "diao_chan";
    actor.equipment.weapon = makeCard("cixiong", "ci_xiong_shuang_gu_jian");
    actor.hand = [makeCard("slash", "slash")];
    target!.hand = [makeCard("victim-card", "dodge")];
    session.deck = [makeCard("drawn", "peach", "heart")];

    let game = applyAction(session, { type: "play_card", playerId: actor.id, cardId: "slash", targetId: target!.id });
    expect(game.pendingResponse).toMatchObject({ type: "weapon_action", stage: "cixiong_activate", targetId: actor.id });
    game = applyAction(game, { type: "resolve_weapon", playerId: actor.id, activate: true });
    expect(game.pendingResponse).toMatchObject({ type: "weapon_action", stage: "cixiong_choice", targetId: target!.id });
    game = applyAction(game, { type: "resolve_weapon", playerId: target!.id, activate: false });
    expect(game.players.find((player) => player.id === actor.id)?.hand.map((card) => card.id)).toContain("drawn");
    expect(game.pendingResponse?.type).toBe("slash");
  });

  it("converts normal Slash to fire through ZhuQue YuShan", () => {
    const { session, actor, targets: [target] } = setup();
    actor.equipment.weapon = makeCard("zhuque", "zhu_que_yu_shan", "diamond");
    actor.hand = [makeCard("slash", "slash")];
    target!.equipment.armor = makeCard("vine", "teng_jia", "club");

    let game = applyAction(session, { type: "play_card", playerId: actor.id, cardId: "slash", targetId: target!.id });
    game = applyAction(game, { type: "resolve_weapon", playerId: actor.id, activate: true });
    expect(game.pendingResponse).toMatchObject({ type: "slash", slashKind: "fire_slash", nature: "fire" });
    game = applyAction(game, { type: "respond", playerId: target!.id, cardId: null });
    expect(game.players.find((player) => player.id === target!.id)?.hp).toBe(target!.maxHp - 2);
  });

  it("lets HanBing Jian prevent damage and discard up to two target cards", () => {
    const { session, actor, targets: [target] } = setup();
    actor.equipment.weapon = makeCard("hanbing", "han_bing_jian");
    actor.hand = [makeCard("slash", "slash")];
    target!.hand = [makeCard("h1", "dodge"), makeCard("h2", "peach", "heart")];
    const originalHp = target!.hp;

    let game = applyAction(session, { type: "play_card", playerId: actor.id, cardId: "slash", targetId: target!.id });
    game = applyAction(game, { type: "respond", playerId: target!.id, cardId: null });
    expect(game.pendingResponse).toMatchObject({ type: "weapon_action", stage: "hanbing_prevent" });
    game = applyAction(game, { type: "resolve_weapon", playerId: actor.id, activate: true });
    expect(getGameView(game, actor.id).prompt).toMatchObject({ type: "weapon_action", canPass: false });
    game = applyAction(game, { type: "resolve_weapon", playerId: actor.id, activate: true, tokens: ["hand:0"] });
    expect(getGameView(game, actor.id).prompt).toMatchObject({ type: "weapon_action", canPass: true });
    game = applyAction(game, { type: "resolve_weapon", playerId: actor.id, activate: true, tokens: ["hand:0"] });
    expect(game.players.find((player) => player.id === target!.id)).toMatchObject({ hp: originalHp, hand: [] });
  });

  it("continues attacking with QingLong after Dodge", () => {
    const { session, actor, targets: [target] } = setup();
    actor.equipment.weapon = makeCard("qinglong", "qing_long_yan_yue_dao");
    actor.hand = [makeCard("slash-1", "slash"), makeCard("slash-2", "fire_slash", "heart")];
    target!.hand = [makeCard("dodge", "dodge", "heart")];
    const originalHp = target!.hp;

    let game = applyAction(session, { type: "play_card", playerId: actor.id, cardId: "slash-1", targetId: target!.id });
    game = applyAction(game, { type: "respond", playerId: target!.id, cardId: "dodge" });
    expect(game.pendingResponse).toMatchObject({ type: "weapon_action", stage: "qinglong_followup" });
    game = applyAction(game, { type: "resolve_weapon", playerId: actor.id, activate: true, cardIds: ["slash-2"] });
    game = applyAction(game, { type: "respond", playerId: target!.id, cardId: null });
    expect(game.players.find((player) => player.id === target!.id)?.hp).toBe(originalHp - 1);
  });

  it("forces a Dodged Slash to hit through GuanShi Fu", () => {
    const { session, actor, targets: [target] } = setup();
    actor.equipment.weapon = makeCard("guanshi", "guan_shi_fu", "diamond");
    actor.hand = [makeCard("slash", "slash"), makeCard("cost-1", "peach", "heart"), makeCard("cost-2", "dodge")];
    target!.hand = [makeCard("dodge", "dodge", "heart")];
    const originalHp = target!.hp;

    let game = applyAction(session, { type: "play_card", playerId: actor.id, cardId: "slash", targetId: target!.id });
    game = applyAction(game, { type: "respond", playerId: target!.id, cardId: "dodge" });
    game = applyAction(game, { type: "resolve_weapon", playerId: actor.id, activate: true, cardIds: ["cost-1", "cost-2"] });
    expect(game.players.find((player) => player.id === target!.id)?.hp).toBe(originalHp - 1);
  });

  it("uses the final hand Slash against three targets through FangTian HuaJi", () => {
    const { session, actor, targets } = setup(4);
    actor.equipment.weapon = makeCard("fangtian", "fang_tian_hua_ji", "diamond");
    actor.hand = [makeCard("slash", "slash")];
    const originalHp = new Map(targets.map((target) => [target.id, target.hp]));

    let game = applyAction(session, { type: "play_card", playerId: actor.id, cardId: "slash", targetIds: targets.map((target) => target.id) });
    for (const target of targets) {
      expect(game.pendingResponse).toMatchObject({ type: "slash", targetId: target.id });
      game = applyAction(game, { type: "respond", playerId: target.id, cardId: null });
    }
    for (const target of targets) {
      expect(game.players.find((player) => player.id === target.id)?.hp).toBe(originalHp.get(target.id)! - 1);
    }
  });

  it("continues FangTian targets after chained damage kills the current attacker", () => {
    const { session, targets: initialTargets } = setup(4);
    const actor = session.players.find((candidate) => candidate.role === "loyalist")!;
    const targets = session.players.filter((candidate) => candidate.id !== actor.id);
    session.currentPlayerId = actor.id;
    session.turn.playerId = actor.id;
    actor.hp = 1;
    actor.chained = true;
    actor.equipment.weapon = makeCard("fangtian-chain", "fang_tian_hua_ji", "diamond");
    actor.hand = [makeCard("fire-chain", "fire_slash", "heart")];
    targets[0]!.chained = true;
    for (const player of session.players) {
      if (player.id !== actor.id) player.hand = [];
    }

    let game = applyAction(session, {
      type: "play_card",
      playerId: actor.id,
      cardId: "fire-chain",
      targetIds: targets.map((target) => target.id),
    });
    game = applyAction(game, { type: "respond", playerId: targets[0]!.id, cardId: null });
    while (game.pendingResponse?.type === "dying") {
      game = applyAction(game, { type: "respond", playerId: game.pendingResponse.targetId, cardId: null });
    }
    expect(game.players.find((candidate) => candidate.id === actor.id)?.alive).toBe(false);
    expect(game.pendingResponse).toMatchObject({ type: "slash", targetId: targets[1]!.id });
    game = applyAction(game, { type: "respond", playerId: targets[1]!.id, cardId: null });
    expect(game.pendingResponse).toMatchObject({ type: "slash", targetId: targets[2]!.id });
    game = applyAction(game, { type: "respond", playerId: targets[2]!.id, cardId: null });
    expect(game.status).toBe("playing");
    expect(game.currentPlayerId).not.toBe(actor.id);
    expect(initialTargets).toHaveLength(3);
  });

  it("discards a horse after damage through QiLin Gong", () => {
    const { session, actor, targets: [target] } = setup();
    actor.equipment.weapon = makeCard("qilin", "qi_lin_gong", "heart", 5);
    actor.hand = [makeCard("slash", "slash")];
    target!.equipment.defensive_horse = makeCard("horse", "di_lu", "club");

    let game = applyAction(session, { type: "play_card", playerId: actor.id, cardId: "slash", targetId: target!.id });
    game = applyAction(game, { type: "respond", playerId: target!.id, cardId: null });
    expect(game.pendingResponse).toMatchObject({ type: "weapon_action", stage: "qilin_discard_horse" });
    const prompt = getGameView(game, actor.id).prompt;
    if (prompt.type !== "weapon_action" || !prompt.promptId) throw new Error("Expected identified Qilin prompt");
    game = applyAction(game, {
      type: "resolve_weapon",
      playerId: actor.id,
      promptId: prompt.promptId,
      activate: true,
      tokens: ["equipment:defensive_horse"],
    });
    expect(game.players.find((player) => player.id === target!.id)?.equipment.defensive_horse).toBeUndefined();
  });

  it("uses two hand cards as Slash actively and while responding to Duel", () => {
    const first = setup();
    first.actor.equipment.weapon = makeCard("zhangba", "zhang_ba_she_mao");
    first.actor.hand = [makeCard("cost-1", "dodge", "heart"), makeCard("cost-2", "peach", "club")];
    expect(getGameView(first.session, first.actor.id).prompt).toMatchObject({
      type: "play",
      zhangBaSlash: { allowedCardIds: ["cost-1", "cost-2"], targetIds: [first.targets[0]!.id] },
    });
    let game = applyAction(first.session, {
      type: "use_zhang_ba_slash",
      playerId: first.actor.id,
      cardIds: ["cost-1", "cost-2"],
      targetId: first.targets[0]!.id,
    });
    game = applyAction(game, { type: "respond", playerId: first.targets[0]!.id, cardId: null });
    expect(game.players.find((player) => player.id === first.targets[0]!.id)?.hp).toBe(first.targets[0]!.maxHp - 1);

    const second = setup();
    second.actor.hand = [makeCard("duel", "duel", "diamond")];
    second.targets[0]!.equipment.weapon = makeCard("zhangba", "zhang_ba_she_mao");
    second.targets[0]!.hand = [makeCard("r1", "dodge"), makeCard("r2", "peach", "heart")];
    let duel = applyAction(second.session, { type: "play_card", playerId: second.actor.id, cardId: "duel", targetId: second.targets[0]!.id });
    expect(getGameView(duel, second.targets[0]!.id).prompt).toMatchObject({ zhangBaCardIds: ["r1", "r2"] });
    duel = applyAction(duel, { type: "respond", playerId: second.targets[0]!.id, cardIds: ["r1", "r2"] });
    expect(duel.pendingResponse).toMatchObject({ type: "duel", targetId: second.actor.id });
  });
});
