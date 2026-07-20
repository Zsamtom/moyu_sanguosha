import { describe, expect, it } from "vitest";

import {
  GameRuleError,
  applyAction,
  assertCompleteRulesEngineState,
  assertRestorableSlashResponse,
  createGame,
  getCardDefinition,
  getGameView,
  grantSkill,
  turnOverGamePlayer,
  type Card,
  type CardKind,
  type GamePlayer,
  type GameSession,
} from "../src/index.js";

const seed = "4d".repeat(32);

function card(id: string, kind: CardKind, suit: Card["suit"] = "spade", rank: Card["rank"] = 7): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank };
}

function setup(count = 4): { game: GameSession; actor: GamePlayer; others: GamePlayer[] } {
  const game = createGame({ playerIds: Array.from({ length: count }, (_, index) => `core-${index + 1}`), seed });
  const actor = game.players.find((player) => player.id === game.currentPlayerId)!;
  const others = game.players.filter((player) => player.id !== actor.id).sort((left, right) => left.seat - right.seat);
  for (const player of game.players) {
    player.generalId = "gan_ning";
    player.hp = 4;
    player.maxHp = 4;
    player.alive = true;
    player.hand = [];
    player.equipment = {};
    player.judgment = [];
    player.chained = false;
    player.extraPiles = {};
  }
  game.pendingResponse = null;
  game.resolvingCards = [];
  game.afterMove = { queuedRecoveries: [], queuedTriggers: [], suspendedPhase: null, suspendedResponse: null };
  game.turn = {
    ...game.turn,
    playerId: actor.id,
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
  return { game, actor, others };
}

function attachTurnFlowCompletion(
  game: GameSession,
  destination: "play" | "discard_or_end",
): GameSession {
  if (game.pendingResponse?.type !== "slash") throw new Error("Expected an in-flight Slash");
  const continuationId = game.nextEventId;
  game.nextEventId += 1;
  game.completeRules.nextEventId = game.nextEventId;
  game.pendingResponse = {
    ...game.pendingResponse,
    completion: { type: "turn_flow", continuationId, playerId: game.currentPlayerId, destination },
  };
  const slash = game.pendingResponse;
  if (slash.type !== "slash") throw new Error("Expected an in-flight Slash");
  const effectIndex = game.completeRules.lifecycle.effects.findIndex((effect) =>
    effect.kind === "slash_response_progress" && effect.payload.cardId === slash.cardId);
  const effect = game.completeRules.lifecycle.effects[effectIndex];
  if (!effect) throw new Error("Expected a Slash response commitment");
  const commitment = JSON.parse(String(effect.payload.commitment)) as Record<string, unknown>;
  game.completeRules.lifecycle.effects[effectIndex] = {
    ...effect,
    payload: {
      ...effect.payload,
      commitment: JSON.stringify({ ...commitment, completion: slash.completion }),
    },
  };
  assertRestorableSlashResponse(game, slash);
  return game;
}

function startSlash(
  game: GameSession,
  actor: GamePlayer,
  target: GamePlayer,
  kind: "slash" | "fire_slash" = "slash",
  id = `core-${kind}`,
): GameSession {
  actor.hand.unshift(card(id, kind, kind === "fire_slash" ? "heart" : "spade"));
  return applyAction(game, {
    type: "play_card",
    playerId: actor.id,
    cardId: id,
    targetId: target.id,
  });
}

function ruleCode(run: () => unknown): string | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    if (!(error instanceof GameRuleError)) throw error;
    return error.code;
  }
}

function passDying(game: GameSession): GameSession {
  let current = game;
  while (current.pendingResponse?.type === "dying") {
    current = applyAction(current, {
      type: "respond",
      playerId: current.pendingResponse.targetId,
      cardId: null,
    });
  }
  return current;
}

describe("live player posture", () => {
  it("starts face up, projects orientation, and atomically skips a face-down player's entire turn", () => {
    const { game, actor, others } = setup(4);
    const skipped = game.players[(actor.seat + 1) % game.players.length]!;
    const following = game.players[(skipped.seat + 1) % game.players.length]!;
    const originalTurnNumber = game.turn.number;
    grantSkill(game.completeRules.lifecycle, {
      ownerId: skipped.id,
      skillId: "wansha",
      sourcePlayerId: skipped.id,
      sourceSkillId: "jilue",
      expiry: { type: "turn_end", turnId: originalTurnNumber + 1 },
    });

    const turned = turnOverGamePlayer(game, skipped.id);
    expect(game.players.find((player) => player.id === skipped.id)?.faceUp).toBe(true);
    expect(turned.players.find((player) => player.id === skipped.id)?.faceUp).toBe(false);
    expect(getGameView(turned, actor.id).players.find((player) => player.id === skipped.id)?.faceUp).toBe(false);

    const advanced = applyAction(turned, { type: "end_play", playerId: actor.id });
    expect(advanced.currentPlayerId).toBe(following.id);
    expect(advanced.turn.number).toBe(originalTurnNumber + 2);
    expect(advanced.players.find((player) => player.id === skipped.id)).toMatchObject({ faceUp: true, hand: [] });
    expect(advanced.logs.filter((entry) => entry.message.includes("跳过整个回合"))).toHaveLength(1);
    expect(advanced.logs.filter((entry) => entry.message === `${actor.id} 的回合结束。`)).toHaveLength(1);
    expect(advanced.logs.filter((entry) => entry.message === `${skipped.id} 的回合结束。`)).toHaveLength(1);
    expect(advanced.completeRules.lifecycle.grants.some((entry) =>
      entry.ownerId === skipped.id && entry.skillId === "wansha" && entry.sourceSkillId === "jilue"
    )).toBe(false);
    expect(others.map((player) => player.id)).toContain(skipped.id);
  });
});

describe("serializable Slash completion continuations", () => {
  it("restores discard flow once after Dodge and rejects replay", () => {
    const { game, actor, others: [target] } = setup(3);
    actor.hp = 1;
    actor.hand = [card("extra-1", "dodge"), card("extra-2", "dodge"), card("extra-3", "dodge")];
    target!.hand = [card("core-dodge", "dodge")];
    const pending = attachTurnFlowCompletion(startSlash(game, actor, target!), "discard_or_end");
    const restored = JSON.parse(JSON.stringify(pending)) as GameSession;
    const resolved = applyAction(restored, { type: "respond", playerId: target!.id, cardId: "core-dodge" });
    expect(resolved.turn).toMatchObject({ phase: "discard", requiredDiscardCount: 2 });
    expect(resolved.pendingResponse).toBeNull();
    expect(ruleCode(() => applyAction(resolved, { type: "respond", playerId: target!.id, cardId: null }))).toBe("INVALID_PHASE");
  });

  it("restores play after a direct hit", () => {
    const { game, actor, others: [target] } = setup(3);
    const pending = attachTurnFlowCompletion(startSlash(game, actor, target!), "play");
    const resolved = applyAction(pending, { type: "respond", playerId: target!.id, cardId: null });
    expect(resolved.turn.phase).toBe("play");
    expect(resolved.players.find((player) => player.id === target!.id)?.hp).toBe(3);
  });

  it("survives a dying rescue and restores discard flow once", () => {
    const { game, actor, others: [target] } = setup(3);
    actor.hp = 1;
    actor.hand = [card("rescue-extra-1", "dodge"), card("rescue-extra-2", "dodge"), card("rescue-extra-3", "dodge")];
    target!.hp = 1;
    target!.hand = [card("rescue-peach", "peach")];
    let current = attachTurnFlowCompletion(startSlash(game, actor, target!), "discard_or_end");
    current = applyAction(current, { type: "respond", playerId: target!.id, cardId: null });
    expect(current.pendingResponse).toMatchObject({ type: "dying", damageSourceId: actor.id });
    current = applyAction(current, { type: "respond", playerId: target!.id, cardId: "rescue-peach" });
    expect(current.turn.phase).toBe("discard");
    expect(current.pendingResponse).toBeNull();
  });

  it("survives target death without replaying the continuation", () => {
    const { game, actor, others } = setup(4);
    const target = game.players[(actor.seat + 1) % game.players.length]!;
    const [lord, otherRebel] = others.filter((player) => player.id !== target.id);
    actor.role = "rebel";
    target!.role = "loyalist";
    lord!.role = "lord";
    otherRebel!.role = "rebel";
    actor.hp = 1;
    actor.hand = [card("death-extra-1", "dodge"), card("death-extra-2", "dodge"), card("death-extra-3", "dodge")];
    target!.hp = 1;
    let current = attachTurnFlowCompletion(startSlash(game, actor, target!), "discard_or_end");
    current = applyAction(current, { type: "respond", playerId: target!.id, cardId: null });
    current = passDying(current);
    expect(current.players.find((player) => player.id === target!.id)?.alive).toBe(false);
    expect(current.turn.phase).toBe("discard");
    expect(current.pendingResponse).toBeNull();
  });

  it("survives elemental chain propagation", () => {
    const { game, actor, others } = setup(4);
    const target = game.players[(actor.seat + 1) % game.players.length]!;
    const chainedPeer = others.find((player) => player.id !== target.id)!;
    target!.chained = true;
    chainedPeer!.chained = true;
    const pending = attachTurnFlowCompletion(startSlash(game, actor, target!, "fire_slash"), "play");
    const resolved = applyAction(pending, { type: "respond", playerId: target!.id, cardId: null });
    expect(resolved.players.find((player) => player.id === target!.id)?.hp).toBe(3);
    expect(resolved.players.find((player) => player.id === chainedPeer!.id)?.hp).toBe(3);
    expect(resolved.turn.phase).toBe("play");
    expect(resolved.completeRules.damageFlow.frames).toEqual([]);
    expect(resolved.completeRules.damageFlow.completedDamageIds).toEqual([1, 2]);
    expect(new Set(resolved.completeRules.damageFlow.completedFrameIds).size).toBe(2);
    expect(resolved.completeRules.nextDamageId).toBe(3);
  });

  it("survives a post-damage weapon prompt", () => {
    const { game, actor, others: [target] } = setup(3);
    actor.hp = 1;
    actor.hand = [card("weapon-extra-1", "dodge"), card("weapon-extra-2", "dodge"), card("weapon-extra-3", "dodge")];
    actor.equipment.weapon = card("qilin", "qi_lin_gong");
    target!.equipment.offensive_horse = card("horse", "chi_tu");
    let current = attachTurnFlowCompletion(startSlash(game, actor, target!), "discard_or_end");
    current = applyAction(current, { type: "respond", playerId: target!.id, cardId: null });
    expect(current.pendingResponse).toMatchObject({ type: "weapon_action", stage: "qilin_discard_horse" });
    expect(current.completeRules.damageFlow.frames).toHaveLength(1);
    expect(current.completeRules.damageFlow.completedDamageIds).toEqual([]);
    expect(current.completeRules.damageFlow.completedFrameIds).toEqual([]);
    expect(current.completeRules.nextDamageId).toBe(2);
    const prompt = getGameView(current, actor.id).prompt;
    if (prompt.type !== "weapon_action" || !prompt.promptId) throw new Error("Expected identified Qilin prompt");
    current = applyAction(current, {
      type: "resolve_weapon",
      playerId: actor.id,
      promptId: prompt.promptId,
      activate: false,
    });
    expect(current.turn.phase).toBe("discard");
    expect(current.pendingResponse).toBeNull();
    expect(current.completeRules.damageFlow.frames).toEqual([]);
    expect(current.completeRules.damageFlow.completedDamageIds).toEqual([1]);
  });
});

describe("live opportunity-free DamageFlow slice", () => {
  it("deducts multi-point damage exactly once and survives JSON recovery into a unique next damage", () => {
    const { game, actor, others: [target] } = setup(3);
    game.turn.slashDamageBonus = 1;
    const pending = startSlash(game, actor, target!, "slash", "flow-first-slash");
    const damageLogsBefore = pending.logs.filter((entry) => entry.type === "damage").length;
    const resolved = applyAction(pending, { type: "respond", playerId: target!.id, cardId: null });

    expect(resolved.players.find((player) => player.id === target!.id)?.hp).toBe(2);
    expect(resolved.logs.filter((entry) => entry.type === "damage")).toHaveLength(damageLogsBefore + 1);
    expect(resolved.completeRules.resolution.frames).toEqual([]);
    expect(resolved.completeRules.damageFlow).toMatchObject({
      revision: 23,
      nextWindowId: 11,
      frames: [],
      completedDamageIds: [1],
      completedFrameIds: [1],
    });
    expect(resolved.completeRules.nextDamageId).toBe(2);
    expect(resolved.pendingResponse).toBeNull();
    expect(resolved.turn.phase).toBe("play");

    const restored = JSON.parse(JSON.stringify(resolved)) as GameSession;
    expect(() => assertCompleteRulesEngineState(restored.completeRules)).not.toThrow();
    restored.turn.slashUsed = false;
    const restoredActor = restored.players.find((player) => player.id === actor.id)!;
    const restoredTarget = restored.players.find((player) => player.id === target!.id)!;
    const secondPending = startSlash(restored, restoredActor, restoredTarget, "slash", "flow-second-slash");
    const twiceResolved = applyAction(secondPending, {
      type: "respond",
      playerId: restoredTarget.id,
      cardId: null,
    });

    expect(twiceResolved.players.find((player) => player.id === restoredTarget.id)?.hp).toBe(1);
    expect(twiceResolved.completeRules.damageFlow.frames).toEqual([]);
    expect(twiceResolved.completeRules.damageFlow.completedDamageIds).toEqual([1, 2]);
    expect(twiceResolved.completeRules.damageFlow.completedFrameIds).toEqual([1, 2]);
    expect(twiceResolved.completeRules.nextDamageId).toBe(3);
    expect(twiceResolved.pendingResponse).toBeNull();
    expect(twiceResolved.turn.phase).toBe("play");
  });

  it("persists lethal damage at its exact DamageFlow dying barrier", () => {
    const { game, actor, others: [target] } = setup(3);
    target!.hp = 1;
    const pending = startSlash(game, actor, target!, "slash", "legacy-lethal-slash");
    const resolved = applyAction(pending, { type: "respond", playerId: target!.id, cardId: null });

    expect(resolved.pendingResponse).toMatchObject({
      type: "dying",
      victimId: target!.id,
      damageSourceId: actor.id,
      resume: { type: "damage_flow", frameId: 1, damageId: 1, dyingId: 1 },
    });
    expect(resolved.players.find((player) => player.id === target!.id)?.hp).toBe(0);
    expect(resolved.completeRules.damageFlow).toMatchObject({
      revision: 8,
      nextWindowId: 4,
      nextDyingId: 2,
      completedDamageIds: [],
      completedFrameIds: [],
      frames: [{
        frameId: 1,
        damageId: 1,
        status: "active",
        step: "dying",
        damage: { stage: "life_deducted", sourceId: actor.id, targetId: target!.id, hpBefore: 1, hpAfter: 0 },
        dying: { frameId: 1, damageId: 1, dyingId: 1, targetId: target!.id, hpAfterDamage: 0 },
        callerContinuation: { type: "game_session.damage_resume.v1" },
      }],
    });
    expect(resolved.completeRules.damageFlow.completedDamageIds).toEqual([]);
    expect(resolved.completeRules.nextDamageId).toBe(2);
    const restored = JSON.parse(JSON.stringify(resolved)) as GameSession;
    expect(() => assertCompleteRulesEngineState(
      restored.completeRules,
      restored.players.map(({ id, hp, maxHp, alive }) => ({ id, hp, maxHp, alive })),
    )).not.toThrow();
  });

  it("keeps standard after-damage skills inside the live DamageFlow frame", () => {
    const { game, actor, others: [target] } = setup(3);
    target!.generalId = "cao_cao";
    const pending = startSlash(game, actor, target!, "slash", "legacy-jianxiong-slash");
    let resolved = applyAction(pending, { type: "respond", playerId: target!.id, cardId: null });

    expect(resolved.pendingResponse).toMatchObject({
      type: "standard_skill",
      targetId: target!.id,
      skillId: "jianxiong",
      stage: "invoke",
    });
    expect(resolved.players.find((player) => player.id === target!.id)?.hp).toBe(3);
    expect(resolved.completeRules.damageFlow.frames).toHaveLength(1);
    expect(resolved.completeRules.damageFlow.completedDamageIds).toEqual([]);
    expect(resolved.completeRules.nextDamageId).toBe(2);
    if (resolved.pendingResponse?.type !== "standard_skill") throw new Error("Expected Jianxiong prompt");
    resolved = applyAction(resolved, {
      type: "resolve_standard_skill",
      playerId: target!.id,
      promptId: resolved.pendingResponse.promptId,
      activate: false,
    });
    expect(resolved.completeRules.damageFlow.frames).toEqual([]);
    expect(resolved.completeRules.damageFlow.completedDamageIds).toEqual([1]);
  });
});
