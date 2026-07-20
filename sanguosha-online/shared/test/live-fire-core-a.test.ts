import { describe, expect, it } from "vitest";

import {
  GameRuleError,
  addStatusEffect,
  applyAction,
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

const seed = "f3".repeat(32);

function card(
  id: string,
  kind: CardKind,
  rank: Card["rank"] = 7,
  suit: Card["suit"] = "club",
): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank };
}

function setup(count = 5): { game: GameSession; owner: GamePlayer; others: GamePlayer[] } {
  const game = createGame({
    playerIds: Array.from({ length: count }, (_value, index) => `fire-a-${index + 1}`),
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
    slashRespondedInPlayPhase: false,
    skillUseCounts: {},
    rendeGivenCount: 0,
    rendeRecovered: false,
  };
  return {
    game,
    owner,
    others: game.players.filter((player) => player.id !== owner.id),
  };
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

function pindianPrompt(game: GameSession, playerId: string) {
  const prompt = getGameView(game, playerId).prompt;
  if (prompt.type !== "choose_pindian_card") throw new Error(`Expected Pindian prompt, got ${prompt.type}`);
  return prompt;
}

function choosePindian(game: GameSession, playerId: string, cardId: string): GameSession {
  const prompt = pindianPrompt(game, playerId);
  return applyAction(game, {
    type: "choose_pindian_card",
    playerId,
    promptId: prompt.promptId,
    cardId,
  });
}

function declineAfterMove(game: GameSession, playerId: string, skillId: "lianying" | "xiaoji"): GameSession {
  const prompt = getGameView(game, playerId).prompt;
  if (prompt.type !== "skill_choice" || prompt.skillId !== skillId || !prompt.promptId) {
    throw new Error(`Expected ${skillId} prompt`);
  }
  return applyAction(game, {
    type: "resolve_skill",
    playerId,
    skillId,
    promptId: prompt.promptId,
    activate: false,
  });
}

function winTianyi(
  game: GameSession,
  owner: GamePlayer,
  opponent: GamePlayer,
  ownerCardId = "tianyi-high",
  opponentCardId = "tianyi-low",
): GameSession {
  let current = applyAction(game, {
    type: "use_skill",
    playerId: owner.id,
    skillId: "tianyi",
    targetId: opponent.id,
  });
  current = choosePindian(current, owner.id, ownerCardId);
  return choosePindian(current, opponent.id, opponentCardId);
}

function passSlash(game: GameSession, targetId: string): GameSession {
  return applyAction(game, { type: "respond", playerId: targetId, cardId: null });
}

describe("live Fire core A", () => {
  it("keeps both Pindian commitments private and runs each last-hand Lianying before reveal", () => {
    const { game, owner, others: [opponent, observer] } = setup();
    if (!opponent || !observer) throw new Error("Missing Pindian fixtures");
    owner.generalId = "tai_shi_ci";
    owner.hand = [card("owner-secret", "slash", 13)];
    opponent.hand = [card("opponent-secret", "dodge", 1)];
    grant(game, owner.id, "lianying");
    grant(game, opponent.id, "lianying");

    let current = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "tianyi",
      targetId: opponent.id,
    });
    const ownerPrompt = pindianPrompt(current, owner.id);
    expect(ownerPrompt.allowedCardIds).toEqual(["owner-secret"]);
    expect(getGameView(current, opponent.id).prompt).toEqual({ type: "waiting" });
    expect(getGameView(current, observer.id).publicCards).toEqual([]);

    current = applyAction(current, {
      type: "choose_pindian_card",
      playerId: owner.id,
      promptId: ownerPrompt.promptId,
      cardId: "owner-secret",
    });
    expect(current.pendingResponse).toMatchObject({ type: "skill_choice", skillId: "lianying", targetId: owner.id });
    expect(current.afterMove.suspendedResponse).toMatchObject({
      type: "pindian",
      frame: { stage: "selecting", selections: { [owner.id]: "owner-secret" } },
    });
    expect(getGameView(current, observer.id).publicCards).toEqual([]);
    expect(current.logs.some((entry) => entry.message.includes("亮出"))).toBe(false);

    current = declineAfterMove(JSON.parse(JSON.stringify(current)) as GameSession, owner.id, "lianying");
    const opponentPrompt = pindianPrompt(current, opponent.id);
    expect(() => applyAction(current, {
      type: "choose_pindian_card",
      playerId: opponent.id,
      promptId: ownerPrompt.promptId,
      cardId: "opponent-secret",
    })).toThrow(GameRuleError);

    current = applyAction(current, {
      type: "choose_pindian_card",
      playerId: opponent.id,
      promptId: opponentPrompt.promptId,
      cardId: "opponent-secret",
    });
    expect(current.pendingResponse).toMatchObject({ type: "skill_choice", skillId: "lianying", targetId: opponent.id });
    expect(current.afterMove.suspendedResponse).toMatchObject({ type: "pindian", frame: { stage: "ready_to_reveal" } });
    expect(current.discardPile.map((entry) => entry.id)).not.toContain("owner-secret");
    expect(current.logs.some((entry) => entry.message.includes("亮出"))).toBe(false);

    current = declineAfterMove(JSON.parse(JSON.stringify(current)) as GameSession, opponent.id, "lianying");
    expect(current.turn.tianyiOutcome).toBe("win");
    expect(current.pendingResponse).toBeNull();
    expect(current.discardPile.filter((entry) => entry.id === "owner-secret")).toHaveLength(1);
    expect(current.discardPile.filter((entry) => entry.id === "opponent-secret")).toHaveLength(1);
    const revealIndex = current.logs.findIndex((entry) => entry.message.includes("亮出"));
    const lastLianyingIndex = current.logs.findLastIndex((entry) => entry.message.includes("连营"));
    expect(lastLianyingIndex).toBeGreaterThanOrEqual(0);
    expect(revealIndex).toBeGreaterThan(lastLianyingIndex);
  });

  it("rejects a forged JSON-restored Pindian entity location and still settles each card once", () => {
    const { game, owner, others: [opponent] } = setup();
    if (!opponent) throw new Error("Missing forged Pindian fixture");
    owner.generalId = "tai_shi_ci";
    owner.hand = [card("owner-high", "slash", 12), card("owner-spare", "peach")];
    opponent.hand = [card("target-low", "dodge", 2), card("target-spare", "peach")];

    let current = applyAction(game, { type: "use_skill", playerId: owner.id, skillId: "tianyi", targetId: opponent.id });
    current = choosePindian(current, owner.id, "owner-high");
    const forged = JSON.parse(JSON.stringify(current)) as GameSession;
    const committed = forged.resolvingCards.find((entry) => entry.id === "owner-high");
    if (!committed) throw new Error("Missing committed Pindian card");
    forged.resolvingCards = forged.resolvingCards.filter((entry) => entry.id !== committed.id);
    forged.players.find((player) => player.id === owner.id)!.hand.push(committed);
    const prompt = pindianPrompt(current, opponent.id);
    expect(() => applyAction(forged, {
      type: "choose_pindian_card",
      playerId: opponent.id,
      promptId: prompt.promptId,
      cardId: "target-low",
    })).toThrow(/pindian|拼点/i);

    current = choosePindian(JSON.parse(JSON.stringify(current)) as GameSession, opponent.id, "target-low");
    expect(current.discardPile.filter((entry) => entry.id === "owner-high")).toHaveLength(1);
    expect(current.discardPile.filter((entry) => entry.id === "target-low")).toHaveLength(1);
  });

  it("attributes Quhu damage to the opponent and resumes its dying target after JSON restore", () => {
    const { game, owner, others: [opponent, victim] } = setup();
    if (!opponent || !victim) throw new Error("Missing Quhu fixtures");
    owner.generalId = "xun_yu";
    owner.hp = 2;
    opponent.hp = 3;
    victim.hp = 1;
    owner.hand = [card("quhu-owner", "slash", 13), card("owner-spare", "dodge")];
    opponent.hand = [card("quhu-opponent", "dodge", 1), card("opponent-spare", "peach")];
    victim.hand = [card("victim-rescue", "peach")];

    let current = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "quhu",
      targetIds: [opponent.id, victim.id],
    });
    current = choosePindian(current, owner.id, "quhu-owner");
    current = choosePindian(JSON.parse(JSON.stringify(current)) as GameSession, opponent.id, "quhu-opponent");
    expect(current.pendingResponse).toMatchObject({ type: "dying", victimId: victim.id, targetId: victim.id });
    expect(current.completeRules.damageFlow.frames.at(-1)?.damage).toMatchObject({
      sourceId: opponent.id,
      targetId: victim.id,
      hpAfter: 0,
    });

    current = applyAction(JSON.parse(JSON.stringify(current)) as GameSession, {
      type: "respond",
      playerId: victim.id,
      cardId: "victim-rescue",
    });
    expect(current.players.find((player) => player.id === victim.id)).toMatchObject({ alive: true, hp: 1 });
    expect(current.completeRules.dying.frames).toEqual([]);
    expect(current.discardPile.filter((entry) => entry.id === "quhu-owner")).toHaveLength(1);
    expect(current.discardPile.filter((entry) => entry.id === "quhu-opponent")).toHaveLength(1);
  });

  it("runs Qiangxi Xiaoji before damage and keeps the pre-payment weapon range", () => {
    const { game, owner, others } = setup();
    owner.generalId = "dian_wei";
    owner.equipment.weapon = card("qiangxi-equipped", "qing_long_yan_yue_dao");
    grant(game, owner.id, "xiaoji");
    game.deck = [card("xiaoji-draw-1", "dodge"), card("xiaoji-draw-2", "peach")];
    const target = others.find((candidate) => distanceBetweenPlayers(game, owner.id, candidate.id) > 1);
    if (!target) throw new Error("Missing far Qiangxi target");
    const hpBefore = target.hp;

    let current = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "qiangxi",
      cardIds: ["qiangxi-equipped"],
      targetId: target.id,
    });
    expect(current.pendingResponse).toMatchObject({ type: "skill_choice", skillId: "xiaoji", targetId: owner.id });
    expect(current.afterMove.suspendedResponse).toMatchObject({ type: "qiangxi_effect", damageTargetId: target.id });
    expect(current.players.find((player) => player.id === target.id)?.hp).toBe(hpBefore);

    const prompt = getGameView(current, owner.id).prompt;
    if (prompt.type !== "skill_choice" || !prompt.promptId) throw new Error("Expected Xiaoji prompt");
    current = applyAction(current, {
      type: "resolve_skill",
      playerId: owner.id,
      skillId: "xiaoji",
      promptId: prompt.promptId,
      activate: true,
    });
    expect(current.players.find((player) => player.id === target.id)?.hp).toBe(hpBefore - 1);
    expect(current.players.find((player) => player.id === owner.id)?.hand).toHaveLength(2);
    expect(current.discardPile.filter((entry) => entry.id === "qiangxi-equipped")).toHaveLength(1);
  });

  it("runs last-hand Lianying before Qiangxi damage", () => {
    const { game, owner, others: [target] } = setup(3);
    if (!target) throw new Error("Missing hand-weapon Qiangxi target");
    owner.generalId = "dian_wei";
    owner.hand = [card("qiangxi-hand-weapon", "zhu_ge_lian_nu")];
    grant(game, owner.id, "lianying");
    const hpBefore = target.hp;

    let current = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "qiangxi",
      cardIds: ["qiangxi-hand-weapon"],
      targetId: target.id,
    });
    expect(current.pendingResponse).toMatchObject({ type: "skill_choice", skillId: "lianying" });
    expect(current.players.find((player) => player.id === target.id)?.hp).toBe(hpBefore);
    current = declineAfterMove(current, owner.id, "lianying");
    expect(current.players.find((player) => player.id === target.id)?.hp).toBe(hpBefore - 1);
    expect(current.discardPile.filter((entry) => entry.id === "qiangxi-hand-weapon")).toHaveLength(1);
  });

  it("resumes an HP-paid Qiangxi exactly once after the owner is rescued", () => {
    const { game, owner, others: [target] } = setup(3);
    if (!target) throw new Error("Missing Qiangxi dying target");
    owner.generalId = "dian_wei";
    owner.hp = 1;
    owner.hand = [card("qiangxi-self-rescue", "peach")];
    const hpBefore = target.hp;

    let current = applyAction(game, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "qiangxi",
      targetId: target.id,
    });
    expect(current.pendingResponse).toMatchObject({ type: "dying", victimId: owner.id, targetId: owner.id });
    expect(current.players.find((player) => player.id === target.id)?.hp).toBe(hpBefore);
    current = applyAction(JSON.parse(JSON.stringify(current)) as GameSession, {
      type: "respond",
      playerId: owner.id,
      cardId: "qiangxi-self-rescue",
    });
    expect(current.players.find((player) => player.id === owner.id)?.hp).toBe(1);
    expect(current.players.find((player) => player.id === target.id)?.hp).toBe(hpBefore - 1);
    expect(current.turn.skillUseCounts.qiangxi).toBe(1);
    expect(current.logs.filter((entry) => entry.message.includes("受到强袭影响"))).toHaveLength(1);
  });

  it("lets a Tianyi winner use an extra physical/Longdan Slash but no third active Slash", () => {
    const { game, owner, others: [target] } = setup(3);
    if (!target) throw new Error("Missing Tianyi Slash target");
    owner.generalId = "tai_shi_ci";
    grant(game, owner.id, "longdan");
    owner.hand = [
      card("tianyi-high", "peach", 13),
      card("first-active-slash", "slash"),
      card("longdan-dodge", "dodge"),
      card("third-active-slash", "slash"),
    ];
    target.hand = [card("tianyi-low", "peach", 1), card("target-spare", "dodge")];

    let current = winTianyi(game, owner, target);
    current = applyAction(current, {
      type: "play_card",
      playerId: owner.id,
      cardId: "first-active-slash",
      targetId: target.id,
    });
    current = passSlash(current, target.id);
    current = applyAction(current, {
      type: "use_skill",
      playerId: owner.id,
      skillId: "longdan",
      cardIds: ["longdan-dodge"],
      targetId: target.id,
    });
    current = passSlash(current, target.id);
    expect(current.turn.activeSlashUses).toBe(2);
    expect(() => applyAction(current, {
      type: "play_card",
      playerId: owner.id,
      cardId: "third-active-slash",
      targetId: target.id,
    })).toThrow(/每个出牌阶段只能使用一张杀|SLASH_ALREADY_USED/);
  });

  it("stacks a Tianyi win with Fang Tian to four targets and ignores distance", () => {
    const { game, owner, others } = setup(5);
    const opponent = others[0];
    if (!opponent) throw new Error("Missing Fang Tian Pindian opponent");
    owner.generalId = "tai_shi_ci";
    owner.equipment.weapon = card("fangtian", "fang_tian_hua_ji");
    owner.hand = [card("tianyi-high", "peach", 13), card("fangtian-slash", "slash")];
    opponent.hand = [card("tianyi-low", "dodge", 1), card("opponent-spare", "peach")];

    let current = winTianyi(game, owner, opponent);
    const targetIds = others.map((player) => player.id);
    expect(targetIds).toHaveLength(4);
    expect(targetIds.some((targetId) => distanceBetweenPlayers(current, owner.id, targetId) > 1)).toBe(true);
    current = applyAction(current, {
      type: "play_card",
      playerId: owner.id,
      cardId: "fangtian-slash",
      targetIds,
    });
    expect(current.pendingResponse).toMatchObject({
      type: "slash",
      targetId: targetIds[0],
      remainingTargetIds: targetIds.slice(1),
    });
  });

  it.each([
    { label: "loss overrides Paoxiao", ownerRank: 1 as const, targetRank: 13 as const, grantPaoxiao: true },
    { label: "tie overrides Crossbow", ownerRank: 7 as const, targetRank: 7 as const, grantPaoxiao: false },
  ])("makes Tianyi $label for active Slash without blocking a response Slash", ({ ownerRank, targetRank, grantPaoxiao }) => {
    const { game, owner, others: [opponent] } = setup(3);
    if (!opponent) throw new Error("Missing failed Tianyi fixture");
    owner.generalId = "tai_shi_ci";
    if (grantPaoxiao) grant(game, owner.id, "paoxiao");
    else owner.equipment.weapon = card("failed-crossbow", "zhu_ge_lian_nu");
    owner.hand = [card("failed-owner", "peach", ownerRank), card("response-slash", "slash")];
    opponent.hand = [card("failed-target", "dodge", targetRank), card("target-spare", "peach")];

    let current = applyAction(game, { type: "use_skill", playerId: owner.id, skillId: "tianyi", targetId: opponent.id });
    current = choosePindian(current, owner.id, "failed-owner");
    current = choosePindian(current, opponent.id, "failed-target");
    expect(current.turn.tianyiOutcome).not.toBe("win");
    expect(() => applyAction(current, {
      type: "play_card",
      playerId: owner.id,
      cardId: "response-slash",
      targetId: opponent.id,
    })).toThrow(/每个出牌阶段只能使用一张杀|SLASH_ALREADY_USED/);

    current.turn.phase = "respond";
    current.pendingResponse = {
      type: "duel",
      attackerId: opponent.id,
      targetId: owner.id,
      cardId: "test-duel",
      initiatorId: opponent.id,
      originalTargetId: owner.id,
      requiredSlashCount: 1,
      slashesPlayed: 0,
    };
    addStatusEffect(current.completeRules.lifecycle, {
      ownerId: opponent.id,
      kind: "duel_response_progress",
      sourcePlayerId: opponent.id,
      sourceSkillId: "duel",
      payload: {
        cardId: "test-duel",
        commitment: JSON.stringify({
          cardId: "test-duel",
          initiatorId: opponent.id,
          originalTargetId: owner.id,
        }),
        cursor: JSON.stringify({
          attackerId: opponent.id,
          targetId: owner.id,
          requiredSlashCount: 1,
          slashesPlayed: 0,
          declinedLordSkillIds: [],
        }),
      },
      visibility: "server_only",
      expiry: { type: "game_end" },
    });
    current = applyAction(current, { type: "respond", playerId: owner.id, cardId: "response-slash" });
    expect(current.pendingResponse).toMatchObject({ type: "duel", targetId: opponent.id });
  });
});
