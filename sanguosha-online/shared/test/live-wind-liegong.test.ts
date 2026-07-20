import { describe, expect, it } from "vitest";

import {
  applyAction,
  cloneStandardJudgmentContext,
  createGame,
  getCardDefinition,
  getGameView,
  grantSkill,
  type Card,
  type CardKind,
  type GamePlayer,
  type GameSession,
} from "../src/index.js";

const seed = "c7".repeat(32);

function card(id: string, kind: CardKind, suit: Card["suit"] = "spade", rank: Card["rank"] = 7): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank };
}

function setup(): { game: GameSession; owner: GamePlayer; targets: GamePlayer[] } {
  const game = createGame({ playerIds: ["owner", "target-a", "target-b"], seed });
  const owner = game.players.find((player) => player.id === game.currentPlayerId)!;
  const targets = game.players.filter((player) => player.id !== owner.id);
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
  owner.generalId = "huang_zhong";
  game.deck = [];
  game.discardPile = [];
  game.resolvingCards = [];
  game.pendingResponse = null;
  game.afterMove = { queuedTriggers: [], suspendedPhase: null, suspendedResponse: null };
  game.turn.phase = "play";
  game.turn.slashUsed = false;
  return { game, owner, targets };
}

function hand(prefix: string, count: number): Card[] {
  return Array.from({ length: count }, (_value, index) =>
    card(`${prefix}-${index + 1}`, index === 0 ? "dodge" : "peach", index % 2 === 0 ? "heart" : "club"));
}

function standardPrompt(game: GameSession, playerId: string) {
  const prompt = getGameView(game, playerId).prompt;
  if (prompt.type !== "standard_skill") throw new Error(`Expected standard skill prompt, got ${prompt.type}`);
  return prompt;
}

function playLiegongSlash(game: GameSession, owner: GamePlayer, target: GamePlayer, slashId: string): GameSession {
  owner.hand = [card(slashId, "slash")];
  return applyAction(game, {
    type: "play_card",
    playerId: owner.id,
    cardId: slashId,
    targetId: target.id,
  });
}

describe("live Wind Liegong", () => {
  it.each([
    ["target hand is at least current HP", 4],
    ["target hand is at most attack range", 1],
  ])("offers an optional persisted invoke when %s", (_label, targetHandCount) => {
    const { game, owner, targets: [target] } = setup();
    if (!target) throw new Error("Missing target");
    target.hand = hand("threshold", targetHandCount);

    let current = playLiegongSlash(game, owner, target, `threshold-slash-${targetHandCount}`);
    expect(current.pendingResponse).toMatchObject({
      type: "standard_skill",
      targetId: owner.id,
      skillId: "liegong",
      stage: "invoke",
      slash: {
        targetId: target.id,
        liegongChecked: true,
        useProvenance: { method: "use", turnPlayerId: owner.id, phase: "play" },
      },
    });
    current = JSON.parse(JSON.stringify(current)) as GameSession;
    const prompt = standardPrompt(current, owner.id);
    expect(prompt).toMatchObject({ skillId: "liegong", stage: "invoke", canPass: true });

    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: false,
    });
    expect(current.pendingResponse).toMatchObject({
      type: "slash",
      targetId: target.id,
      liegongChecked: true,
      dodgeProhibited: false,
    });
    current = applyAction(current, {
      type: "respond",
      playerId: target.id,
      cardId: target.hand[0]!.id,
    });
    expect(current.players.find((player) => player.id === target.id)?.hp).toBe(4);
  });

  it("activates to prohibit Dodge while leaving the target's Dodge in hand", () => {
    const { game, owner, targets: [target] } = setup();
    if (!target) throw new Error("Missing target");
    target.hand = hand("activate", 1);
    const dodgeId = target.hand[0]!.id;
    let current = playLiegongSlash(game, owner, target, "activate-slash");
    if (current.pendingResponse?.type !== "standard_skill" || !current.pendingResponse.slash) {
      throw new Error("Expected persisted Liegong Slash");
    }
    const sourceProvenance = current.pendingResponse.slash.useProvenance;
    const clonedContext = cloneStandardJudgmentContext({ type: "tieqi", slash: current.pendingResponse.slash });
    if (clonedContext.type !== "tieqi") throw new Error("Expected cloned Tieqi context");
    expect(clonedContext.slash.useProvenance).toEqual(sourceProvenance);
    expect(clonedContext.slash.useProvenance).not.toBe(sourceProvenance);
    const prompt = standardPrompt(current, owner.id);

    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
    });
    expect(current.players.find((player) => player.id === target.id)).toMatchObject({
      hp: 3,
      hand: [expect.objectContaining({ id: dodgeId })],
    });
    expect(current.pendingResponse).toBeNull();
    expect(current.turn.phase).toBe("play");
  });

  it("runs before Tieqi and keeps Liegong's prohibition when a Tieqi judgment fails", () => {
    const { game, owner, targets: [target] } = setup();
    if (!target) throw new Error("Missing target");
    target.hand = hand("tieqi-target", 1);
    game.deck = [card("tieqi-black", "slash", "spade")];
    grantSkill(game.completeRules.lifecycle, {
      ownerId: owner.id,
      skillId: "tieqi",
      sourcePlayerId: owner.id,
      sourceSkillId: "test",
      expiry: { type: "permanent" },
    });

    let current = playLiegongSlash(game, owner, target, "liegong-tieqi-slash");
    let prompt = standardPrompt(current, owner.id);
    expect(prompt.skillId).toBe("liegong");
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
    });
    prompt = standardPrompt(current, owner.id);
    expect(prompt.skillId).toBe("tieqi");
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: true,
    });

    expect(current.players.find((player) => player.id === target.id)).toMatchObject({ hp: 3, hand: target.hand });
    expect(current.pendingResponse).toBeNull();
  });

  it("skips the invoke when neither hand-count threshold is met", () => {
    const { game, owner, targets: [target] } = setup();
    if (!target) throw new Error("Missing target");
    target.hand = hand("ineligible", 2);

    const current = playLiegongSlash(game, owner, target, "ineligible-slash");
    expect(current.pendingResponse).toMatchObject({
      type: "slash",
      targetId: target.id,
      liegongChecked: true,
      useProvenance: { method: "use", turnPlayerId: owner.id, phase: "play" },
    });
    expect(current.pendingResponse?.type === "slash" && current.pendingResponse.dodgeProhibited).not.toBe(true);
    expect(getGameView(current, owner.id).prompt.type).not.toBe("standard_skill");
  });

  it("runs after Liuli and recalculates eligibility for the redirected target", () => {
    const { game, owner, targets: [daqiao, redirected] } = setup();
    if (!daqiao || !redirected) throw new Error("Missing Liuli fixtures");
    daqiao.generalId = "da_qiao";
    daqiao.hand = [card("liuli-cost", "dodge"), card("liuli-filler", "peach")];
    redirected.hand = hand("redirected", 1);

    let current = playLiegongSlash(game, owner, daqiao, "liuli-liegong-slash");
    let prompt = standardPrompt(current, daqiao.id);
    expect(prompt).toMatchObject({ skillId: "liuli", stage: "liuli_redirect" });
    expect(current.pendingResponse).toMatchObject({ slash: { liegongChecked: false } });
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: daqiao.id,
      promptId: prompt.promptId,
      activate: true,
      cardId: "liuli-cost",
      targetId: redirected.id,
    });

    prompt = standardPrompt(current, owner.id);
    expect(prompt).toMatchObject({ skillId: "liegong", stage: "invoke" });
    expect(current.pendingResponse).toMatchObject({
      slash: {
        targetId: redirected.id,
        liegongChecked: true,
        useProvenance: { method: "use", turnPlayerId: owner.id, phase: "play" },
      },
    });
  });

  it("fails closed when a legacy Liuli continuation has no declaration provenance", () => {
    const { game, owner, targets: [daqiao] } = setup();
    if (!daqiao) throw new Error("Missing legacy continuation fixture");
    daqiao.generalId = "da_qiao";
    daqiao.hand = [card("legacy-liuli-cost", "dodge")];

    let current = playLiegongSlash(game, owner, daqiao, "legacy-provenance-slash");
    const prompt = standardPrompt(current, daqiao.id);
    if (current.pendingResponse?.type !== "standard_skill" || !current.pendingResponse.slash) {
      throw new Error("Expected Liuli continuation");
    }
    const { useProvenance: _legacyProvenance, ...legacySlash } = current.pendingResponse.slash;
    current.pendingResponse = { ...current.pendingResponse, slash: legacySlash };
    expect(() => applyAction(current, {
      type: "resolve_standard_skill",
      playerId: daqiao.id,
      promptId: prompt.promptId,
      activate: false,
    })).toThrow(/杀响应续体与服务端承诺/);
  });

  it("inherits play-phase provenance and rechecks Liegong for a Qinglong follow-up Slash", () => {
    const { game, owner, targets: [target] } = setup();
    if (!target) throw new Error("Missing Qinglong target");
    target.generalId = "da_qiao";
    owner.equipment.weapon = card("qinglong", "qing_long_yan_yue_dao");
    owner.hand = [card("qinglong-first", "slash"), card("qinglong-followup", "fire_slash", "heart")];
    target.hand = [card("qinglong-dodge-1", "dodge"), card("qinglong-dodge-2", "dodge", "heart")];

    let current = applyAction(game, {
      type: "play_card",
      playerId: owner.id,
      cardId: "qinglong-first",
      targetId: target.id,
    });
    let prompt = standardPrompt(current, target.id);
    expect(prompt.skillId).toBe("liuli");
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: target.id,
      promptId: prompt.promptId,
      activate: false,
    });
    prompt = standardPrompt(current, owner.id);
    expect(prompt.skillId).toBe("liegong");
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: prompt.promptId,
      activate: false,
    });
    current = applyAction(current, {
      type: "respond",
      playerId: target.id,
      cardId: "qinglong-dodge-1",
    });
    expect(current.pendingResponse).toMatchObject({ type: "weapon_action", stage: "qinglong_followup" });
    current = applyAction(current, {
      type: "resolve_weapon",
      playerId: owner.id,
      activate: true,
      cardIds: ["qinglong-followup"],
    });

    prompt = standardPrompt(current, target.id);
    expect(prompt).toMatchObject({ skillId: "liuli", stage: "liuli_redirect" });
    expect(current.pendingResponse).toMatchObject({
      slash: {
        cardId: "qinglong-followup",
        damageCardIds: ["qinglong-followup"],
        targetId: target.id,
        liuliCheckedPlayerIds: [target.id],
        liegongChecked: false,
        tieqiChecked: false,
        excludedRedirectTargetIds: [owner.id, target.id],
        dodgeProhibited: false,
        declinedLordSkillIds: [],
        useProvenance: { method: "use", turnPlayerId: owner.id, phase: "play" },
      },
    });
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: target.id,
      promptId: prompt.promptId,
      activate: false,
    });
    prompt = standardPrompt(current, owner.id);
    expect(prompt).toMatchObject({ skillId: "liegong", stage: "invoke" });
    expect(current.pendingResponse).toMatchObject({
      slash: {
        cardId: "qinglong-followup",
        targetId: target.id,
        liegongChecked: true,
        useProvenance: { method: "use", turnPlayerId: owner.id, phase: "play" },
      },
    });
  });

  it("does not trigger for a Borrowed Sword Slash outside the owner's play-phase declaration", () => {
    const { game, owner: source, targets: [holder, target] } = setup();
    if (!holder || !target) throw new Error("Missing Borrowed Sword fixtures");
    source.generalId = "gan_ning";
    holder.generalId = "huang_zhong";
    source.hand = [card("borrowed", "borrowed_sword")];
    holder.hand = [card("forced-slash", "slash")];
    holder.equipment.weapon = card("holder-weapon", "qing_gang_jian");
    target.hand = hand("borrowed-target", 1);

    let current = applyAction(game, {
      type: "play_card",
      playerId: source.id,
      cardId: "borrowed",
      targetIds: [holder.id, target.id],
    });
    expect(current.pendingResponse).toMatchObject({ type: "borrowed_sword", targetId: holder.id });
    current = applyAction(current, {
      type: "respond",
      playerId: holder.id,
      cardId: "forced-slash",
    });

    expect(current.pendingResponse).toMatchObject({
      type: "slash",
      attackerId: holder.id,
      targetId: target.id,
      liegongChecked: true,
      useProvenance: { method: "use", turnPlayerId: source.id, phase: "respond" },
    });
    expect(current.pendingResponse?.type === "slash" && current.pendingResponse.dodgeProhibited).not.toBe(true);
    expect(getGameView(current, holder.id).prompt.type).not.toBe("standard_skill");
  });
});
