import { describe, expect, it } from "vitest";

import {
  GameRuleError,
  addMark,
  applyAction,
  assertCompleteRulesEngineState,
  createGame,
  forfeitPlayer,
  getCardDefinition,
  getGameView,
  grantSkill,
  initializeGameStartSkills,
  markCount,
  type Card,
  type CardKind,
  type GamePlayer,
  type GameSession,
  type GeneralSkillId,
} from "../src/index.js";

const seed = "b3".repeat(32);

function card(id: string, kind: CardKind, suit: Card["suit"] = "club", rank: Card["rank"] = 7): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank };
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function setup(count = 4): { game: GameSession; source: GamePlayer; others: GamePlayer[] } {
  const game = createGame({
    playerIds: Array.from({ length: count }, (_value, index) => `god-a-${index + 1}`),
    seed,
  });
  const source = game.players.find((player) => player.id === game.currentPlayerId)!;
  const others = Array.from({ length: count - 1 }, (_value, offset) =>
    game.players[(source.seat + offset + 1) % count]!,
  );
  for (const player of game.players) {
    player.generalId = "gan_ning";
    player.role = "loyalist";
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
    playerId: source.id,
    phase: "play",
    slashUsed: false,
    activeSlashUses: 0,
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
    discardPhaseStarted: false,
    discardPhaseHandCardIds: [],
    qinyinInvoked: false,
    qinyinEventId: null,
    lianpoArmedOwnerIds: [],
  };
  return { game, source, others };
}

function grant(game: GameSession, player: GamePlayer, skillId: GeneralSkillId): void {
  grantSkill(game.completeRules.lifecycle, {
    ownerId: player.id,
    skillId,
    sourcePlayerId: player.id,
    sourceSkillId: `test:${skillId}`,
    expiry: { type: "permanent" },
  });
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

function attack(game: GameSession, source: GamePlayer, target: GamePlayer, slashId: string): GameSession {
  let current = applyAction(game, {
    type: "play_card",
    playerId: source.id,
    cardId: slashId,
    targetId: target.id,
  });
  current = applyAction(current, { type: "respond", playerId: target.id, cardId: null });
  return current;
}

describe("live God damage and death integration", () => {
  it("resolves a tied Wuhun choice from its dead owner before parent rewards and preserves parent-child DeathStack JSON", () => {
    const { game, source, others: [owner, lord, xingshangOwner] } = setup();
    if (!owner || !lord || !xingshangOwner) throw new Error("Missing Wuhun fixtures");
    source.role = "loyalist";
    owner.role = "rebel";
    lord.role = "lord";
    xingshangOwner.role = "rebel";
    owner.hp = 1;
    grant(game, owner, "wuhun");
    grant(game, xingshangOwner, "xingshang");
    source.hand = [
      card("wuhun-slash", "slash", "spade"),
      card("source-kept-1", "dodge"),
      card("source-kept-2", "peach", "heart"),
    ];
    lord.hand = [card("lord-death-card", "dodge")];
    game.deck = [card("wuhun-judge", "slash", "spade")];
    addMark(game.completeRules.lifecycle, {
      markId: "nightmare",
      ownerId: lord.id,
      sourcePlayerId: owner.id,
      sourceSkillId: "wuhun",
      amount: 1,
      visibility: "public",
      expiry: { type: "permanent" },
    });
    addMark(game.completeRules.lifecycle, {
      markId: "nightmare",
      ownerId: lord.id,
      sourcePlayerId: xingshangOwner.id,
      sourceSkillId: "wuhun",
      amount: 3,
      visibility: "public",
      expiry: { type: "permanent" },
    });

    let current = passDying(attack(game, source, owner, "wuhun-slash"));
    expect(current.players.find((player) => player.id === owner.id)).toMatchObject({ alive: false, hp: 0 });
    expect(current.pendingResponse).toMatchObject({
      type: "standard_skill",
      skillId: "wuhun",
      stage: "wuhun_target",
      targetId: owner.id,
      targetIds: [lord.id, source.id],
    });
    const deadPrompt = getGameView(current, owner.id).prompt;
    expect(deadPrompt).toMatchObject({
      type: "standard_skill",
      skillId: "wuhun",
      stage: "wuhun_target",
      canPass: false,
      targetIds: [lord.id, source.id],
      minTargets: 1,
      maxTargets: 1,
    });
    expect(getGameView(current, source.id).players.find((player) => player.id === source.id)?.publicMarks)
      .toMatchObject({ [`nightmare:${owner.id}`]: 1 });
    expect(getGameView(current, source.id).players.find((player) => player.id === lord.id)?.publicMarks)
      .toEqual({ [`nightmare:${owner.id}`]: 1, [`nightmare:${xingshangOwner.id}`]: 3 });

    current = jsonClone(current);
    expect(() => assertCompleteRulesEngineState(
      current.completeRules,
      current.players.map(({ id, hp, maxHp, alive }) => ({ id, hp, maxHp, alive })),
    )).not.toThrow();
    const wuhunPending = current.pendingResponse;
    if (wuhunPending?.type !== "standard_skill") throw new Error("Expected dead-owner Wuhun choice");
    const tampered = jsonClone(current);
    if (tampered.pendingResponse?.type !== "standard_skill") throw new Error("Expected Wuhun tamper fixture");
    tampered.pendingResponse.targetIds = [...(tampered.pendingResponse.targetIds ?? []), xingshangOwner.id];
    expect(() => applyAction(tampered, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: wuhunPending.promptId,
      activate: true,
      targetId: lord.id,
    })).toThrow(/篡改|最大梦魇/);

    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: wuhunPending.promptId,
      activate: true,
      targetId: lord.id,
    });
    expect(current.pendingResponse).toMatchObject({
      type: "standard_skill",
      skillId: "xingshang",
      stage: "xingshang_claim",
      targetId: xingshangOwner.id,
      sourceId: lord.id,
      deathResolution: { completion: { type: "wuhun" } },
    });
    expect(current.completeRules.death.frames).toHaveLength(2);
    const [parent, child] = current.completeRules.death.frames;
    expect(parent).toMatchObject({ death: { victimId: owner.id }, stage: "death_triggers", suspendedByFrameId: child!.frameId });
    expect(child).toMatchObject({ death: { victimId: lord.id, killerId: null }, parentFrameId: parent!.frameId });

    current = jsonClone(current);
    expect(() => assertCompleteRulesEngineState(
      current.completeRules,
      current.players.map(({ id, hp, maxHp, alive }) => ({ id, hp, maxHp, alive })),
    )).not.toThrow();
    const xingshang = current.pendingResponse;
    if (xingshang?.type !== "standard_skill") throw new Error("Expected child-death Xingshang choice");
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: xingshangOwner.id,
      promptId: xingshang.promptId,
      activate: false,
    });

    expect(current.status).toBe("finished");
    expect(current.winner).toMatchObject({ side: "rebel", playerIds: expect.arrayContaining([xingshangOwner.id]) });
    expect(current.completeRules.death.frames).toEqual([]);
    expect(current.completeRules.dying.frames).toEqual([]);
    expect(current.players.find((player) => player.id === source.id)?.hand.map((entry) => entry.id).sort())
      .toEqual(["source-kept-1", "source-kept-2"]);
    const deathMessages = current.logs.filter((entry) => entry.type === "death").map((entry) => entry.message);
    expect(deathMessages.findIndex((message) => message.includes(`${lord.id} 阵亡`)))
      .toBeLessThan(deathMessages.findIndex((message) => message.includes(`${owner.id} 阵亡`)));
  });

  it("preserves Wuhun across unrelated forfeits and recomputes tied or single maximum candidates", () => {
    const reachChoice = (tieCount: 2 | 3) => {
      const { game, source, others } = setup(6);
      const [owner, first, second, third, unrelated] = others;
      if (!owner || !first || !second || !third || !unrelated) throw new Error("Missing Wuhun forfeit fixtures");
      source.role = "lord";
      owner.role = "renegade";
      first.role = "loyalist";
      second.role = "rebel";
      third.role = "loyalist";
      unrelated.role = "loyalist";
      owner.hp = 1;
      grant(game, owner, "wuhun");
      source.hand = [card(`wuhun-forfeit-slash-${tieCount}`, "slash")];
      game.deck = [card(`wuhun-forfeit-peach-${tieCount}`, "peach", "heart")];
      for (const candidate of [first, second, ...(tieCount === 3 ? [third] : [])]) {
        addMark(game.completeRules.lifecycle, {
          markId: "nightmare",
          ownerId: candidate.id,
          sourcePlayerId: owner.id,
          sourceSkillId: "wuhun",
          amount: 2,
          visibility: "public",
          expiry: { type: "permanent" },
        });
      }
      const current = passDying(attack(game, source, owner, `wuhun-forfeit-slash-${tieCount}`));
      expect(current.pendingResponse).toMatchObject({
        type: "standard_skill",
        skillId: "wuhun",
        targetIds: tieCount === 3 ? [first.id, second.id, third.id] : [first.id, second.id],
      });
      return { current, owner, first, second, third, unrelated };
    };

    const unrelatedCase = reachChoice(3);
    const original = unrelatedCase.current.pendingResponse;
    if (original?.type !== "standard_skill") throw new Error("Expected Wuhun forfeit choice");
    const preserved = forfeitPlayer(jsonClone(unrelatedCase.current), unrelatedCase.unrelated.id);
    expect(preserved.pendingResponse).toMatchObject({
      type: "standard_skill",
      skillId: "wuhun",
      promptId: original.promptId,
      targetIds: [unrelatedCase.first.id, unrelatedCase.second.id, unrelatedCase.third.id],
    });
    expect(preserved.completeRules.death.frames).toHaveLength(1);
    expect(preserved.completeRules.death.frames[0]?.death.victimId).toBe(unrelatedCase.owner.id);

    const refreshedCase = reachChoice(3);
    const previous = refreshedCase.current.pendingResponse;
    if (previous?.type !== "standard_skill") throw new Error("Expected refreshable Wuhun choice");
    const refreshed = forfeitPlayer(jsonClone(refreshedCase.current), refreshedCase.first.id);
    expect(refreshed.pendingResponse).toMatchObject({
      type: "standard_skill",
      skillId: "wuhun",
      targetIds: [refreshedCase.second.id, refreshedCase.third.id],
    });
    expect(refreshed.pendingResponse).not.toMatchObject({ promptId: previous.promptId });
    expect(refreshed.completeRules.death.frames).toHaveLength(1);

    const singleCase = reachChoice(2);
    const settled = forfeitPlayer(jsonClone(singleCase.current), singleCase.first.id);
    expect(settled.players.find((player) => player.id === singleCase.second.id)?.alive).toBe(true);
    expect(settled.logs.map((entry) => entry.message).join("\n"))
      .toContain(`${singleCase.owner.id} 的武魂判定为桃，${singleCase.second.id}存活`);
    expect(settled.completeRules.death.frames).toEqual([]);
    expect(settled.pendingResponse).toBeNull();
  });

  it("keeps Guixin hand selection anonymous and server-random, then resumes its final after-move trigger from JSON", () => {
    const { game, source, others: [lastHandOwner, owner] } = setup(3);
    if (!owner || !lastHandOwner) throw new Error("Missing Guixin fixtures");
    grant(game, owner, "guixin");
    grant(game, lastHandOwner, "lianying");
    source.hand = [
      card("guixin-slash", "slash", "spade"),
      card("hidden-a", "dodge", "heart"),
      card("hidden-b", "peach", "diamond"),
    ];
    lastHandOwner.hand = [card("last-hidden", "wine", "spade")];
    game.deck = [card("unused-lianying-draw", "dodge")];

    let current = attack(game, source, owner, "guixin-slash");
    let prompt = getGameView(current, owner.id).prompt;
    expect(prompt).toMatchObject({ type: "standard_skill", skillId: "guixin", stage: "guixin_invoke", canPass: true });
    if (prompt.type !== "standard_skill") throw new Error("Expected Guixin invoke prompt");
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
    });

    prompt = getGameView(current, owner.id).prompt;
    expect(prompt).toMatchObject({ type: "standard_skill", skillId: "guixin", stage: "guixin_select", canPass: false });
    if (prompt.type !== "standard_skill") throw new Error("Expected Guixin source selection");
    expect(prompt.choices).toEqual([{ token: "hand", ownerId: source.id, zone: "hand", card: null }]);
    expect(JSON.stringify(prompt)).not.toContain("hidden-a");
    expect(JSON.stringify(prompt)).not.toContain("hidden-b");
    const originalJson = JSON.stringify(current);
    expect(() => applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      tokens: ["hand:0"],
    })).toThrow(GameRuleError);
    expect(JSON.stringify(current)).toBe(originalJson);

    const first = applyAction(jsonClone(current), {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      tokens: ["hand"],
    });
    const replay = applyAction(jsonClone(current), {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      tokens: ["hand"],
    });
    expect(first.players.find((player) => player.id === owner.id)?.hand.map((entry) => entry.id))
      .toEqual(replay.players.find((player) => player.id === owner.id)?.hand.map((entry) => entry.id));
    expect(first.rng).toEqual(replay.rng);
    current = first;

    prompt = getGameView(current, owner.id).prompt;
    expect(prompt).toMatchObject({ type: "standard_skill", skillId: "guixin", stage: "guixin_select" });
    if (prompt.type !== "standard_skill") throw new Error("Expected final Guixin selection");
    expect(prompt.choices).toEqual([{ token: "hand", ownerId: lastHandOwner.id, zone: "hand", card: null }]);
    const stalePromptId = prompt.promptId;
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
      tokens: ["hand"],
    });
    expect(current.pendingResponse).toMatchObject({ type: "skill_choice", skillId: "lianying", targetId: lastHandOwner.id });
    expect(current.completeRules.damageFlow.frames).toHaveLength(1);
    expect(current.players.find((player) => player.id === owner.id)?.faceUp).toBe(false);
    current = jsonClone(current);
    expect(() => assertCompleteRulesEngineState(current.completeRules)).not.toThrow();
    expect(() => applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: stalePromptId,
      activate: true,
      tokens: ["hand"],
    })).toThrow(GameRuleError);
    const lianying = current.pendingResponse;
    if (lianying?.type !== "skill_choice") throw new Error("Expected Lianying after-move prompt");
    current = applyAction(current, {
      type: "resolve_skill",
      playerId: lastHandOwner.id,
      skillId: "lianying",
      promptId: lianying.promptId,
      activate: false,
    });

    expect(current.completeRules.damageFlow.frames).toEqual([]);
    expect(current.afterMove).toEqual({ queuedRecoveries: [], queuedTriggers: [], suspendedPhase: null, suspendedResponse: null });
    expect(current.players.find((player) => player.id === owner.id)?.hand).toHaveLength(2);
    expect(current.players.find((player) => player.id === lastHandOwner.id)?.hand).toEqual([]);
  });

  it("skips a forfeited Guixin source and consumes the opportunity when the Guixin owner forfeits", () => {
    const { game, source, others } = setup(5);
    const [owner, firstTarget, lord, rebel] = others;
    if (!owner || !firstTarget || !lord || !rebel) throw new Error("Missing Guixin forfeit fixtures");
    source.role = "loyalist";
    owner.role = "loyalist";
    firstTarget.role = "loyalist";
    lord.role = "lord";
    rebel.role = "rebel";
    grant(game, owner, "guixin");
    source.hand = [card("guixin-forfeit-slash", "slash"), card("guixin-source-kept", "dodge")];
    firstTarget.hand = [card("guixin-forfeit-hidden", "peach", "heart")];
    let prompted = attack(game, source, owner, "guixin-forfeit-slash");
    const invoke = getGameView(prompted, owner.id).prompt;
    if (invoke.type !== "standard_skill") throw new Error("Expected Guixin forfeit invoke prompt");

    const ownerLeft = forfeitPlayer(jsonClone(prompted), owner.id);
    expect(ownerLeft.players.find((player) => player.id === owner.id)?.alive).toBe(false);
    expect(ownerLeft.completeRules.damageFlow.frames).toEqual([]);
    expect(ownerLeft.pendingResponse).not.toMatchObject({ skillId: "guixin" });
    expect(ownerLeft.completeRules.damageFlow.consumedActions.some((entry) =>
      entry.ownerId === owner.id && entry.outcome === "pass")).toBe(true);

    prompted = applyAction(prompted, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: invoke.promptId,
      activate: true,
    });
    expect(prompted.pendingResponse).toMatchObject({
      type: "standard_skill",
      skillId: "guixin",
      stage: "guixin_select",
      sourceId: firstTarget.id,
    });
    let skipped = forfeitPlayer(jsonClone(prompted), firstTarget.id);
    expect(skipped.pendingResponse).toMatchObject({
      type: "standard_skill",
      skillId: "guixin",
      stage: "guixin_select",
      sourceId: source.id,
    });
    const selection = skipped.pendingResponse;
    if (selection?.type !== "standard_skill") throw new Error("Expected Guixin selection after skip");
    skipped = applyAction(skipped, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: selection.promptId,
      activate: true,
      tokens: ["hand"],
    });
    expect(skipped.completeRules.damageFlow.frames).toEqual([]);
    expect(skipped.players.find((player) => player.id === owner.id)?.faceUp).toBe(false);
  });

  it("initializes Kuangbao once at the post-draft boundary and gains Rage/Ren once per damage point", () => {
    const initial = setup(3);
    grant(initial.game, initial.source, "kuangbao");
    initial.game.turn.phase = "prepare";
    const initialized = initializeGameStartSkills(initial.game);
    expect(markCount(initialized.completeRules.lifecycle, {
      ownerId: initial.source.id,
      markId: "rage",
      sourcePlayerId: initial.source.id,
      sourceSkillId: "kuangbao",
    })).toBe(2);
    expect(getGameView(initialized, initial.source.id).players.find((player) => player.id === initial.source.id)?.publicMarks)
      .toMatchObject({ rage: 2 });
    expect(() => initializeGameStartSkills(initialized)).toThrow(GameRuleError);

    const { game, source, others: [target] } = setup(3);
    if (!target) throw new Error("Missing Kuangbao target");
    grant(game, source, "kuangbao");
    grant(game, target, "kuangbao");
    grant(game, target, "renjie");
    source.hand = [card("rage-slash", "slash")];
    game.turn.slashDamageBonus = 1;
    const resolved = attack(game, source, target, "rage-slash");
    expect(resolved.players.find((player) => player.id === target.id)?.hp).toBe(2);
    for (const [playerId, markId, skillId, expected] of [
      [source.id, "rage", "kuangbao", 2],
      [target.id, "rage", "kuangbao", 2],
      [target.id, "ren", "renjie", 2],
    ] as const) {
      expect(markCount(resolved.completeRules.lifecycle, {
        ownerId: playerId,
        markId,
        sourcePlayerId: playerId,
        sourceSkillId: skillId,
      })).toBe(expected);
    }
    expect(resolved.completeRules.damageFlow.frames).toEqual([]);
  });

  it("gains two Rage for each point of self-damage across source and target windows", () => {
    const { game, source: owner } = setup(3);
    grant(game, owner, "kuangbao");
    owner.hand = [
      card("self-fire-attack", "fire_attack", "heart"),
      card("self-revealed", "dodge", "heart", 9),
      card("self-payment", "slash", "heart"),
    ];
    let current = applyAction(game, {
      type: "play_card",
      playerId: owner.id,
      cardId: "self-fire-attack",
      targetId: owner.id,
    });
    current = applyAction(current, {
      type: "choose_hand_card",
      playerId: owner.id,
      cardId: "self-revealed",
    });
    current = applyAction(current, {
      type: "choose_hand_card",
      playerId: owner.id,
      cardId: "self-payment",
    });
    expect(current.players.find((player) => player.id === owner.id)?.hp).toBe(3);
    expect(markCount(current.completeRules.lifecycle, {
      ownerId: owner.id,
      markId: "rage",
      sourcePlayerId: owner.id,
      sourceSkillId: "kuangbao",
    })).toBe(2);
    expect(current.completeRules.damageFlow.consumedActions.filter((entry) =>
      entry.ownerId === owner.id && entry.opportunityId.includes(":kuangbao:"))).toHaveLength(2);
  });

  it("keeps surviving source Kuangbao but skips dead target Kuangbao/Renjie after lethal settlement", () => {
    const { game, source, others: [target, lord, rebel] } = setup(4);
    if (!target || !lord || !rebel) throw new Error("Missing lethal mark fixtures");
    source.role = "loyalist";
    target.role = "renegade";
    lord.role = "lord";
    rebel.role = "rebel";
    target.hp = 1;
    grant(game, source, "kuangbao");
    grant(game, target, "kuangbao");
    grant(game, target, "renjie");
    source.hand = [card("lethal-mark-slash", "slash")];
    const current = passDying(attack(game, source, target, "lethal-mark-slash"));
    expect(current.players.find((player) => player.id === target.id)?.alive).toBe(false);
    expect(markCount(current.completeRules.lifecycle, {
      ownerId: source.id,
      markId: "rage",
      sourcePlayerId: source.id,
      sourceSkillId: "kuangbao",
    })).toBe(1);
    expect(markCount(current.completeRules.lifecycle, {
      ownerId: target.id,
      markId: "rage",
      sourcePlayerId: target.id,
      sourceSkillId: "kuangbao",
    })).toBe(0);
    expect(markCount(current.completeRules.lifecycle, {
      ownerId: target.id,
      markId: "ren",
      sourcePlayerId: target.id,
      sourceSkillId: "renjie",
    })).toBe(0);
  });

  it("counts only discard-phase hand cards for Renjie", () => {
    const { game, source: owner } = setup(3);
    grant(game, owner, "renjie");
    owner.hand = Array.from({ length: 6 }, (_value, index) => card(`ren-discard-${index + 1}`, "dodge"));
    let current = applyAction(game, { type: "end_play", playerId: owner.id });
    expect(current.turn).toMatchObject({ phase: "discard", requiredDiscardCount: 2 });
    current = applyAction(current, {
      type: "discard",
      playerId: owner.id,
      cardIds: ["ren-discard-1", "ren-discard-2"],
    });
    expect(markCount(current.completeRules.lifecycle, {
      ownerId: owner.id,
      markId: "ren",
      sourcePlayerId: owner.id,
      sourceSkillId: "renjie",
    })).toBe(2);
  });

  it("resumes Qinyin after its owner dies first and continues source-less HP loss in frozen seat order", () => {
    const { game, source: owner, others } = setup(4);
    const [next, lord, rebel] = others;
    if (!next || !lord || !rebel) throw new Error("Missing Qinyin owner-death fixtures");
    owner.role = "loyalist";
    next.role = "rebel";
    lord.role = "lord";
    rebel.role = "rebel";
    owner.hp = 1;
    grant(game, owner, "qinyin");
    owner.hand = Array.from({ length: 3 }, (_value, index) => card(`qinyin-owner-${index + 1}`, "dodge"));
    let current = applyAction(game, { type: "end_play", playerId: owner.id });
    current = applyAction(current, {
      type: "discard",
      playerId: owner.id,
      cardIds: ["qinyin-owner-1", "qinyin-owner-2"],
    });
    const choice = getGameView(current, owner.id).prompt;
    expect(choice).toMatchObject({
      type: "standard_skill",
      skillId: "qinyin",
      stage: "qinyin_choice",
      options: ["all_recover_one", "all_lose_one_hp"],
      canPass: true,
    });
    if (choice.type !== "standard_skill") throw new Error("Expected Qinyin choice");
    current = applyAction(jsonClone(current), {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: choice.promptId,
      activate: true,
      tokens: ["all_lose_one_hp"],
    });
    expect(current.pendingResponse).toMatchObject({
      type: "dying",
      victimId: owner.id,
      damageSourceId: null,
      resume: { type: "qinyin", ownerId: owner.id, nextTargetIndex: 1 },
    });
    current = jsonClone(current);
    current = passDying(current);
    expect(current.players.find((player) => player.id === owner.id)).toMatchObject({ alive: false, hp: 0 });
    for (const player of [next, lord, rebel]) {
      expect(current.players.find((candidate) => candidate.id === player.id)?.hp).toBe(3);
    }
    expect(current.status).toBe("playing");
    expect(current.currentPlayerId).toBe(next.id);
    expect(current.completeRules.dying.frames).toEqual([]);
    expect(current.completeRules.death.frames).toEqual([]);
    expect(current.turn.qinyinEventId).toBeNull();
  });

  it("resumes Qinyin after a middle target dies and rechecks its owner's hand limit", () => {
    const { game, source: owner, others } = setup(4);
    const [doomed, lord, rebel] = others;
    if (!doomed || !lord || !rebel) throw new Error("Missing Qinyin middle-death fixtures");
    owner.role = "loyalist";
    doomed.role = "rebel";
    lord.role = "lord";
    rebel.role = "rebel";
    owner.hp = 2;
    doomed.hp = 1;
    grant(game, owner, "qinyin");
    owner.hand = Array.from({ length: 4 }, (_value, index) => card(`qinyin-middle-${index + 1}`, "dodge"));
    let current = applyAction(game, { type: "end_play", playerId: owner.id });
    current = applyAction(current, {
      type: "discard",
      playerId: owner.id,
      cardIds: ["qinyin-middle-1", "qinyin-middle-2"],
    });
    const choice = getGameView(current, owner.id).prompt;
    if (choice.type !== "standard_skill") throw new Error("Expected Qinyin choice");
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: choice.promptId,
      activate: true,
      tokens: ["all_lose_one_hp"],
    });
    expect(current.pendingResponse).toMatchObject({ type: "dying", victimId: doomed.id, damageSourceId: null });
    current = passDying(jsonClone(current));
    expect(current.players.find((player) => player.id === doomed.id)).toMatchObject({ alive: false, hp: 0 });
    expect(current.players.find((player) => player.id === owner.id)?.hp).toBe(1);
    expect(current.players.find((player) => player.id === lord.id)?.hp).toBe(3);
    expect(current.players.find((player) => player.id === rebel.id)?.hp).toBe(3);
    expect(current.turn).toMatchObject({ playerId: owner.id, phase: "discard", requiredDiscardCount: 1 });
  });

  it("keeps Qinyin playable when another role forfeits and ends the discard turn when its owner forfeits", () => {
    const { game, source: owner, others } = setup(5);
    const [unrelated, lord, rebel, ally] = others;
    if (!unrelated || !lord || !rebel || !ally) throw new Error("Missing Qinyin forfeit fixtures");
    owner.role = "loyalist";
    unrelated.role = "loyalist";
    lord.role = "lord";
    rebel.role = "rebel";
    ally.role = "rebel";
    grant(game, owner, "qinyin");
    owner.hand = Array.from({ length: 6 }, (_value, index) => card(`qinyin-forfeit-${index + 1}`, "dodge"));
    let prompted = applyAction(game, { type: "end_play", playerId: owner.id });
    prompted = applyAction(prompted, {
      type: "discard",
      playerId: owner.id,
      cardIds: ["qinyin-forfeit-1", "qinyin-forfeit-2"],
    });
    const originalPrompt = prompted.pendingResponse;
    if (originalPrompt?.type !== "standard_skill") throw new Error("Expected Qinyin forfeit prompt");

    let unrelatedLeft = forfeitPlayer(jsonClone(prompted), unrelated.id);
    expect(unrelatedLeft.pendingResponse).toMatchObject({
      type: "standard_skill",
      skillId: "qinyin",
      targetId: owner.id,
      promptId: originalPrompt.promptId,
    });
    unrelatedLeft = applyAction(unrelatedLeft, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: originalPrompt.promptId,
      activate: false,
    });
    expect(unrelatedLeft.currentPlayerId).not.toBe(owner.id);

    const ownerLeft = forfeitPlayer(jsonClone(prompted), owner.id);
    expect(ownerLeft.players.find((player) => player.id === owner.id)?.alive).toBe(false);
    expect(ownerLeft.pendingResponse).not.toMatchObject({ skillId: "qinyin" });
    expect(ownerLeft.currentPlayerId).not.toBe(owner.id);
    expect(ownerLeft.turn.discardPhaseStarted).toBe(false);
  });

  it("persists Qinyin recovery while Buqu removal suspends its discard-phase continuation", () => {
    const { game, source: owner, others: [wounded, unrelated, rebel] } = setup(4);
    if (!wounded || !unrelated || !rebel) throw new Error("Missing Qinyin recovery target");
    owner.role = "lord";
    wounded.role = "loyalist";
    unrelated.role = "loyalist";
    rebel.role = "rebel";
    grant(game, owner, "qinyin");
    owner.hp = 3;
    wounded.generalId = "zhou_tai";
    wounded.hp = 0;
    wounded.extraPiles.buqu = [card("qinyin-buqu-wound", "slash", "club", 9)];
    owner.hand = Array.from({ length: 5 }, (_value, index) => card(`qinyin-recover-${index + 1}`, "dodge"));
    let current = applyAction(game, { type: "end_play", playerId: owner.id });
    current = applyAction(current, {
      type: "discard",
      playerId: owner.id,
      cardIds: ["qinyin-recover-1", "qinyin-recover-2"],
    });
    const choice = getGameView(current, owner.id).prompt;
    if (choice.type !== "standard_skill") throw new Error("Expected Qinyin recovery choice");
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: choice.promptId,
      activate: true,
      tokens: ["all_recover_one"],
    });
    expect(current.pendingResponse).toMatchObject({
      type: "standard_skill",
      skillId: "buqu",
      stage: "buqu_recovery",
      targetId: wounded.id,
    });
    expect(current.afterMove.suspendedResponse).toMatchObject({
      type: "standard_skill",
      skillId: "qinyin",
      mode: "all_recover_one",
    });
    current = jsonClone(current);
    expect(() => assertCompleteRulesEngineState(current.completeRules)).not.toThrow();
    current = forfeitPlayer(current, unrelated.id);
    expect(current.pendingResponse).toMatchObject({
      type: "standard_skill",
      skillId: "buqu",
      stage: "buqu_recovery",
      targetId: wounded.id,
    });
    expect(current.afterMove.suspendedResponse).toMatchObject({ type: "standard_skill", skillId: "qinyin" });
    const recovery = current.pendingResponse;
    if (recovery?.type !== "standard_skill") throw new Error("Expected Buqu recovery prompt");
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: wounded.id,
      promptId: recovery.promptId,
      activate: true,
      cardId: "qinyin-buqu-wound",
    });
    expect(current.players.find((player) => player.id === owner.id)?.hp).toBe(4);
    expect(current.players.find((player) => player.id === wounded.id)).toMatchObject({ alive: true, hp: 1 });
    expect(current.afterMove).toEqual({ queuedRecoveries: [], queuedTriggers: [], suspendedPhase: null, suspendedResponse: null });
  });

  it("queues Lianpo after the full turn end, preserves the normal anchor, and survives actor or unrelated forfeits", () => {
    const { game, source: owner, others } = setup(5);
    const [victim, next, lord, rebel] = others;
    if (!victim || !next || !lord || !rebel) throw new Error("Missing Lianpo fixtures");
    owner.role = "loyalist";
    victim.role = "renegade";
    next.role = "loyalist";
    lord.role = "lord";
    rebel.role = "rebel";
    grant(game, owner, "lianpo");
    victim.hp = 1;
    owner.hand = [card("lianpo-slash", "slash")];
    let current = passDying(attack(game, owner, victim, "lianpo-slash"));
    expect(current.turn.lianpoArmedOwnerIds).toEqual([owner.id]);
    current = applyAction(current, { type: "end_play", playerId: owner.id });
    expect(current.pendingResponse).toMatchObject({
      type: "standard_skill",
      skillId: "lianpo",
      stage: "lianpo_choice",
      targetId: owner.id,
    });
    const base = jsonClone(current);
    const lianpo = base.pendingResponse;
    if (lianpo?.type !== "standard_skill") throw new Error("Expected Lianpo choice");

    const unrelatedLeft = forfeitPlayer(jsonClone(base), next.id);
    expect(unrelatedLeft.pendingResponse).toMatchObject({
      type: "standard_skill",
      skillId: "lianpo",
      targetId: owner.id,
      promptId: lianpo.promptId,
    });
    const ownerLeft = forfeitPlayer(jsonClone(base), owner.id);
    expect(ownerLeft.players.find((player) => player.id === owner.id)?.alive).toBe(false);
    expect(ownerLeft.pendingResponse).not.toMatchObject({ skillId: "lianpo" });
    expect(ownerLeft.currentPlayerId).toBe(next.id);

    current = applyAction(base, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: lianpo.promptId,
      activate: true,
    });
    expect(current.logs.filter((entry) => entry.message === `${owner.id} 的回合结束。`)).toHaveLength(1);
    expect(current.currentPlayerId).toBe(owner.id);
    expect(current.turn).toMatchObject({
      number: 2,
      playerId: owner.id,
      normalTurnAnchorPlayerId: owner.id,
    });
    expect(current.turn.queuedExtraTurns).toEqual([]);
    current = applyAction(current, { type: "end_play", playerId: owner.id });
    expect(current.currentPlayerId).toBe(next.id);
    expect(current.turn.normalTurnAnchorPlayerId).toBeNull();
  });

  it("orders two armed Lianpo owners by seat and drains both extra turns before the normal anchor", () => {
    const { game, source: firstOwner, others } = setup(6);
    const [firstVictim, secondOwner, secondVictim, lord, rebel] = others;
    if (!firstVictim || !secondOwner || !secondVictim || !lord || !rebel) {
      throw new Error("Missing two-owner Lianpo fixtures");
    }
    firstOwner.role = "loyalist";
    firstVictim.role = "renegade";
    secondOwner.role = "loyalist";
    secondVictim.role = "loyalist";
    lord.role = "lord";
    rebel.role = "rebel";
    grant(game, firstOwner, "lianpo");
    grant(game, secondOwner, "lianpo");
    grant(game, secondOwner, "leiji");
    firstVictim.hp = 1;
    secondVictim.hp = 2;
    firstOwner.equipment.weapon = card("lianpo-crossbow", "zhu_ge_lian_nu");
    firstOwner.hand = [card("lianpo-first-slash", "slash"), card("lianpo-second-slash", "slash")];
    secondOwner.hand = [card("lianpo-leiji-dodge", "dodge", "heart")];
    game.deck = [card("lianpo-leiji-spade", "peach", "spade")];

    let current = passDying(attack(game, firstOwner, firstVictim, "lianpo-first-slash"));
    current = applyAction(current, {
      type: "play_card",
      playerId: firstOwner.id,
      cardId: "lianpo-second-slash",
      targetId: secondOwner.id,
    });
    current = applyAction(current, {
      type: "respond",
      playerId: secondOwner.id,
      cardId: "lianpo-leiji-dodge",
    });
    const leiji = getGameView(current, secondOwner.id).prompt;
    if (leiji.type !== "standard_skill") throw new Error("Expected Leiji target choice");
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: secondOwner.id,
      promptId: leiji.promptId,
      activate: true,
      targetId: secondVictim.id,
    });
    current = passDying(current);
    expect(current.turn.lianpoArmedOwnerIds).toEqual([firstOwner.id, secondOwner.id]);

    current = applyAction(current, { type: "end_play", playerId: firstOwner.id });
    expect(current.pendingResponse).toMatchObject({
      type: "standard_skill",
      skillId: "lianpo",
      targetId: firstOwner.id,
      targetIds: [secondOwner.id],
    });
    let prompt = current.pendingResponse;
    if (prompt?.type !== "standard_skill") throw new Error("Expected first Lianpo choice");
    current = applyAction(jsonClone(current), {
      type: "resolve_standard_skill",
      playerId: firstOwner.id,
      promptId: prompt.promptId,
      activate: true,
    });
    expect(current.pendingResponse).toMatchObject({ type: "standard_skill", skillId: "lianpo", targetId: secondOwner.id });
    expect(current.turn.queuedExtraTurns?.map((entry) => entry.playerId)).toEqual([firstOwner.id]);
    prompt = current.pendingResponse;
    if (prompt?.type !== "standard_skill") throw new Error("Expected second Lianpo choice");
    current = applyAction(jsonClone(current), {
      type: "resolve_standard_skill",
      playerId: secondOwner.id,
      promptId: prompt.promptId,
      activate: true,
    });
    expect(current.turn).toMatchObject({ number: 2, playerId: firstOwner.id, normalTurnAnchorPlayerId: firstOwner.id });
    expect(current.turn.queuedExtraTurns?.map((entry) => entry.playerId)).toEqual([secondOwner.id]);

    current = applyAction(current, { type: "end_play", playerId: firstOwner.id });
    expect(current.turn).toMatchObject({ number: 3, playerId: secondOwner.id, normalTurnAnchorPlayerId: firstOwner.id });
    current = applyAction(current, { type: "end_play", playerId: secondOwner.id });
    expect(current.turn).toMatchObject({ number: 4, playerId: secondOwner.id, normalTurnAnchorPlayerId: null });
    expect(current.turn.queuedExtraTurns).toEqual([]);
  });
});
