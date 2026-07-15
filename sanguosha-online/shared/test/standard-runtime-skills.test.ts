import { describe, expect, it } from "vitest";

import {
  GameRuleError,
  applyAction,
  createGame,
  getCardDefinition,
  getGameView,
  grantSkill,
  type Card,
  type CardKind,
  type GamePlayer,
  type GameSession,
} from "../src/index.js";

const seed = "9a".repeat(32);

function card(id: string, kind: CardKind, suit: Card["suit"] = "spade", rank: Card["rank"] = 7): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank };
}

function setup(count = 4): { game: GameSession; actor: GamePlayer; others: GamePlayer[] } {
  const game = createGame({ playerIds: Array.from({ length: count }, (_, index) => `p${index + 1}`), seed });
  const actor = game.players.find((player) => player.id === game.currentPlayerId)!;
  const others = game.players.filter((player) => player.id !== actor.id);
  for (const player of game.players) {
    player.generalId = "gan_ning";
    player.hp = 4;
    player.maxHp = 4;
    player.alive = true;
    player.hand = [];
    player.equipment = {};
    player.judgment = [];
    player.extraPiles = {};
  }
  game.deck = [];
  game.discardPile = [];
  game.resolvingCards = [];
  game.pendingResponse = null;
  game.afterMove = { queuedTriggers: [], suspendedPhase: null, suspendedResponse: null };
  game.turn.phase = "play";
  game.turn.slashUsed = false;
  return { game, actor, others };
}

function code(run: () => unknown): string | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    if (!(error instanceof GameRuleError)) throw error;
    return error.code;
  }
}

function damageWithSlash(game: GameSession, source: GamePlayer, target: GamePlayer, slashId = "slash"): GameSession {
  source.hand.unshift(card(slashId, "slash"));
  let next = applyAction(game, { type: "play_card", playerId: source.id, cardId: slashId, targetId: target.id });
  next = applyAction(next, { type: "respond", playerId: target.id, cardId: null });
  return next;
}

function standardPrompt(game: GameSession, playerId: string) {
  const prompt = getGameView(game, playerId).prompt;
  if (prompt.type !== "standard_skill") throw new Error(`Expected standard prompt, got ${prompt.type}`);
  return prompt;
}

describe("remaining standard/SP runtime skills", () => {
  it("Guanxing persists a private exact partition and commits arbitrary top/bottom order", () => {
    const { game, actor, others: [zhuge] } = setup(3);
    zhuge!.generalId = "zhu_ge_liang";
    game.deck = [card("g-bottom", "slash"), card("g-1", "dodge"), card("g-2", "peach"), card("g-3", "duel")];

    let next = applyAction(game, { type: "end_play", playerId: actor.id });
    let prompt = standardPrompt(next, zhuge!.id);
    expect(prompt).toMatchObject({ skillId: "guanxing", stage: "invoke" });
    next = applyAction(next, { type: "resolve_standard_skill", playerId: zhuge!.id, promptId: prompt.promptId, activate: true });
    next = JSON.parse(JSON.stringify(next)) as GameSession;
    prompt = standardPrompt(next, zhuge!.id);
    expect(prompt.cards.map((entry) => entry.id)).toEqual(["g-3", "g-2", "g-1"]);
    expect(code(() => applyAction(next, {
      type: "resolve_standard_skill", playerId: zhuge!.id, promptId: prompt.promptId, activate: true,
      topCardIds: ["g-3"], bottomCardIds: ["g-2"],
    }))).toBe("INVALID_SELECTION");
    next = applyAction(next, {
      type: "resolve_standard_skill", playerId: zhuge!.id, promptId: prompt.promptId, activate: true,
      topCardIds: ["g-1", "g-3"], bottomCardIds: ["g-2"],
    });
    expect(next.players.find((player) => player.id === zhuge!.id)?.hand.map((entry) => entry.id)).toEqual(["g-1", "g-3"]);
    expect(next.deck.map((entry) => entry.id)).toEqual(["g-2", "g-bottom"]);
  });

  it("Tuxi replaces the draw with one anonymous hand gain from each of up to two distinct targets", () => {
    const { game, actor, others: [zhang, victim] } = setup(3);
    zhang!.generalId = "zhang_liao";
    actor.hand = [card("a-hidden", "dodge")];
    victim!.hand = [card("v-hidden", "peach")];
    game.deck = [card("draw-a", "slash"), card("draw-b", "slash")];
    let next = applyAction(game, { type: "end_play", playerId: actor.id });
    const prompt = standardPrompt(next, zhang!.id);
    expect(prompt).toMatchObject({ skillId: "tuxi", stage: "tuxi_select", minTargets: 1, maxTargets: 2 });
    expect(prompt.choices?.every((choice) => choice.card === null)).toBe(true);
    next = applyAction(next, {
      type: "resolve_standard_skill", playerId: zhang!.id, promptId: prompt.promptId, activate: true,
      targetIds: [actor.id, victim!.id], tokens: ["hand:0", "hand:0"],
    });
    expect(next.players.find((player) => player.id === zhang!.id)?.hand.map((entry) => entry.id).sort()).toEqual(["a-hidden", "v-hidden"]);
    expect(next.turn.phase).toBe("play");
  });

  it("Jianxiong gains only the causal Slash entity still in processing and rejects a replayed prompt", () => {
    const { game, actor, others: [cao] } = setup(3);
    cao!.generalId = "cao_cao";
    actor.hand = [card("unrelated", "dodge")];
    let next = damageWithSlash(game, actor, cao!, "causal-slash");
    const prompt = standardPrompt(next, cao!.id);
    next = JSON.parse(JSON.stringify(next)) as GameSession;
    next = applyAction(next, { type: "resolve_standard_skill", playerId: cao!.id, promptId: prompt.promptId, activate: true });
    expect(next.players.find((player) => player.id === cao!.id)?.hand.map((entry) => entry.id)).toContain("causal-slash");
    expect(next.players.find((player) => player.id === cao!.id)?.hand.map((entry) => entry.id)).not.toContain("unrelated");
    expect(code(() => applyAction(next, { type: "resolve_standard_skill", playerId: cao!.id, promptId: prompt.promptId, activate: true }))).toBe("INVALID_PHASE");
  });

  it("Yiji privately exposes top two per damage point and requires an exact arbitrary allocation", () => {
    const { game, actor, others: [guo, receiver] } = setup(3);
    guo!.generalId = "guo_jia";
    game.deck = [card("yiji-2", "dodge", "club"), card("yiji-1", "peach", "heart")];
    let next = damageWithSlash(game, actor, guo!, "yiji-slash");
    let prompt = standardPrompt(next, guo!.id);
    next = applyAction(next, { type: "resolve_standard_skill", playerId: guo!.id, promptId: prompt.promptId, activate: true });
    next = JSON.parse(JSON.stringify(next)) as GameSession;
    prompt = standardPrompt(next, guo!.id);
    expect(prompt).toMatchObject({ skillId: "yiji", stage: "yiji_distribute" });
    expect(prompt.cards.map((entry) => entry.id)).toEqual(["yiji-1", "yiji-2"]);
    expect(getGameView(next, receiver!.id).publicCards).toEqual([]);
    expect(code(() => applyAction(next, {
      type: "resolve_standard_skill", playerId: guo!.id, promptId: prompt.promptId, activate: true,
      allocations: [{ cardId: "yiji-1", targetId: receiver!.id }],
    }))).toBe("INVALID_SELECTION");
    next = applyAction(next, {
      type: "resolve_standard_skill", playerId: guo!.id, promptId: prompt.promptId, activate: true,
      allocations: [
        { cardId: "yiji-1", targetId: receiver!.id },
        { cardId: "yiji-2", targetId: guo!.id },
      ],
    });
    expect(next.players.find((player) => player.id === receiver!.id)?.hand.map((entry) => entry.id)).toContain("yiji-1");
    expect(next.players.find((player) => player.id === guo!.id)?.hand.map((entry) => entry.id)).toContain("yiji-2");
  });

  it("Fankui selects a hidden hand/public equipment source card and transfers the physical card", () => {
    const { game, actor, others: [sima] } = setup(3);
    sima!.generalId = "si_ma_yi";
    actor.hand = [card("feedback-card", "peach")];
    let next = damageWithSlash(game, actor, sima!, "fankui-slash");
    let prompt = standardPrompt(next, sima!.id);
    next = applyAction(next, { type: "resolve_standard_skill", playerId: sima!.id, promptId: prompt.promptId, activate: true });
    prompt = standardPrompt(next, sima!.id);
    expect(prompt).toMatchObject({ skillId: "fankui", stage: "fankui_select" });
    expect(prompt.choices?.[0]).toMatchObject({ token: "hand:0", card: null });
    expect(code(() => applyAction(next, {
      type: "resolve_standard_skill", playerId: sima!.id, promptId: prompt.promptId, activate: true,
      tokens: ["hand:0", "hand:0"],
    }))).toBe("INVALID_SELECTION");
    next = applyAction(next, {
      type: "resolve_standard_skill", playerId: sima!.id, promptId: prompt.promptId, activate: true, tokens: ["hand:0"],
    });
    expect(next.players.find((player) => player.id === sima!.id)?.hand.map((entry) => entry.id)).toContain("feedback-card");
  });

  it("Guicai replaces the final physical judgment, Tiandu claims it, and Ganglie sees the replaced suit", () => {
    const { game, actor, others: [xiahou, sima] } = setup(4);
    xiahou!.generalId = "xia_hou_dun";
    sima!.generalId = "si_ma_yi";
    sima!.hand = [card("heart-retrial", "dodge", "heart")];
    game.deck = [card("spade-judge", "slash", "spade")];
    grantSkill(game.completeRules.lifecycle, {
      ownerId: xiahou!.id, skillId: "tiandu", sourcePlayerId: xiahou!.id,
      sourceSkillId: "test", expiry: { type: "permanent" },
    });
    let next = damageWithSlash(game, actor, xiahou!, "ganglie-slash");
    let prompt = standardPrompt(next, xiahou!.id);
    next = applyAction(next, { type: "resolve_standard_skill", playerId: xiahou!.id, promptId: prompt.promptId, activate: true });
    prompt = standardPrompt(next, sima!.id);
    expect(prompt).toMatchObject({ skillId: "guicai", stage: "judgment_retrial" });
    next = JSON.parse(JSON.stringify(next)) as GameSession;
    next = applyAction(next, {
      type: "resolve_standard_skill", playerId: sima!.id, promptId: prompt.promptId, activate: true, cardId: "heart-retrial",
    });
    prompt = standardPrompt(next, xiahou!.id);
    expect(prompt).toMatchObject({ skillId: "tiandu", stage: "judgment_post" });
    next = applyAction(next, { type: "resolve_standard_skill", playerId: xiahou!.id, promptId: prompt.promptId, activate: true });
    expect(next.players.find((player) => player.id === xiahou!.id)?.hand.map((entry) => entry.id)).toContain("heart-retrial");
    expect(next.pendingResponse?.type).not.toBe("standard_skill");
    expect(next.discardPile.map((entry) => entry.id)).toContain("spade-judge");
  });

  it("routes Bagua Formation through the same Guicai and Tiandu physical judgment windows", () => {
    const { game, actor, others: [guo, sima] } = setup(3);
    guo!.generalId = "guo_jia";
    guo!.equipment.armor = card("bagua-armor", "ba_gua_zhen");
    sima!.generalId = "si_ma_yi";
    sima!.hand = [card("bagua-red-retrial", "dodge", "heart")];
    actor.hand = [card("bagua-test-slash", "slash")];
    game.deck = [card("bagua-black-original", "slash", "spade")];

    let next = applyAction(game, {
      type: "play_card", playerId: actor.id, cardId: "bagua-test-slash", targetId: guo!.id,
    });
    expect(getGameView(next, guo!.id).prompt).toMatchObject({ type: "armor", armorKind: "ba_gua_zhen" });
    next = applyAction(next, { type: "activate_armor", playerId: guo!.id, activate: true });
    let prompt = standardPrompt(next, sima!.id);
    expect(prompt).toMatchObject({ skillId: "guicai", stage: "judgment_retrial" });
    next = JSON.parse(JSON.stringify(next)) as GameSession;
    next = applyAction(next, {
      type: "resolve_standard_skill", playerId: sima!.id, promptId: prompt.promptId,
      activate: true, cardId: "bagua-red-retrial",
    });
    prompt = standardPrompt(next, guo!.id);
    expect(prompt).toMatchObject({ skillId: "tiandu", stage: "judgment_post" });
    next = applyAction(next, {
      type: "resolve_standard_skill", playerId: guo!.id, promptId: prompt.promptId, activate: true,
    });
    expect(next.pendingResponse).toBeNull();
    expect(next.players.find((player) => player.id === guo!.id)?.hand.map((entry) => entry.id)).toContain("bagua-red-retrial");
    expect(next.discardPile.map((entry) => entry.id)).toEqual(expect.arrayContaining(["bagua-black-original", "bagua-test-slash"]));
  });

  it("Ganglie forces exactly two hand discards or one damage after a non-heart judgment", () => {
    const { game, actor, others: [xiahou] } = setup(3);
    xiahou!.generalId = "xia_hou_dun";
    actor.hand = [card("g-cost-1", "dodge"), card("g-cost-2", "peach")];
    game.deck = [card("club-judge", "slash", "club")];
    let next = damageWithSlash(game, actor, xiahou!, "ganglie-hit");
    let prompt = standardPrompt(next, xiahou!.id);
    next = applyAction(next, { type: "resolve_standard_skill", playerId: xiahou!.id, promptId: prompt.promptId, activate: true });
    prompt = standardPrompt(next, actor.id);
    expect(prompt).toMatchObject({ skillId: "ganglie", stage: "ganglie_punish", canPass: true, minCards: 2, maxCards: 2 });
    expect(code(() => applyAction(next, {
      type: "resolve_standard_skill", playerId: actor.id, promptId: prompt.promptId, activate: true, cardIds: ["g-cost-1"],
    }))).toBe("INVALID_SELECTION");
    const hp = next.players.find((player) => player.id === actor.id)!.hp;
    next = applyAction(next, { type: "resolve_standard_skill", playerId: actor.id, promptId: prompt.promptId, activate: false });
    expect(next.players.find((player) => player.id === actor.id)?.hp).toBe(hp - 1);
  });

  it("Liuli runs before Tieqi, validates post-cost range/dedup, then Tieqi red forbids Dodge", () => {
    const { game, actor, others: [daqiao, redirected] } = setup(3);
    actor.generalId = "ma_chao";
    daqiao!.generalId = "da_qiao";
    daqiao!.hand = [card("liuli-cost", "dodge")];
    redirected!.hand = [card("would-be-dodge", "dodge")];
    actor.hand = [card("combo-slash", "slash")];
    game.deck = [card("tieqi-red", "slash", "diamond")];
    let next = applyAction(game, { type: "play_card", playerId: actor.id, cardId: "combo-slash", targetId: daqiao!.id });
    let prompt = standardPrompt(next, daqiao!.id);
    expect(prompt).toMatchObject({ skillId: "liuli", stage: "liuli_redirect" });
    expect(code(() => applyAction(next, {
      type: "resolve_standard_skill", playerId: daqiao!.id, promptId: prompt.promptId, activate: true,
      cardId: "liuli-cost", targetId: actor.id,
    }))).toBe("INVALID_TARGET");
    next = JSON.parse(JSON.stringify(next)) as GameSession;
    next = applyAction(next, {
      type: "resolve_standard_skill", playerId: daqiao!.id, promptId: prompt.promptId, activate: true,
      cardId: "liuli-cost", targetId: redirected!.id,
    });
    prompt = standardPrompt(next, actor.id);
    expect(prompt).toMatchObject({ skillId: "tieqi", stage: "invoke" });
    const before = next.players.find((player) => player.id === redirected!.id)!.hp;
    next = applyAction(next, { type: "resolve_standard_skill", playerId: actor.id, promptId: prompt.promptId, activate: true });
    expect(next.players.find((player) => player.id === redirected!.id)?.hp).toBe(before - 1);
    expect(next.players.find((player) => player.id === redirected!.id)?.hand.map((entry) => entry.id)).toContain("would-be-dodge");
  });
});
