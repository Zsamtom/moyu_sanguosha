import { describe, expect, it } from "vitest";

import {
  applyAction,
  assertCompleteRulesEngineState,
  createGame,
  getCardDefinition,
  getEffectiveGeneralSkillIds,
  getGameView,
  type Card,
  type CardKind,
  type GamePlayer,
  type GameSession,
  type PlayerId,
} from "../src/index.js";

const seed = "a7".repeat(32);

function card(id: string, kind: CardKind, suit: Card["suit"] = "spade", rank: Card["rank"] = 7): Card {
  return { id, kind, ...getCardDefinition(kind), suit, rank };
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function setupHuashenStart(): { game: GameSession; owner: GamePlayer; starter: GamePlayer; observer: GamePlayer } {
  const game = createGame({ playerIds: ["huashen-1", "huashen-2", "huashen-3", "huashen-4"], seed });
  const starter = game.players.find((player) => player.id === game.currentPlayerId)!;
  const owner = game.players[(starter.seat + 1) % game.players.length]!;
  const observer = game.players.find((player) => player.id !== starter.id && player.id !== owner.id)!;
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
    player.faceUp = true;
  }
  starter.role = "lord";
  owner.generalId = "zuo_ci";
  owner.hp = 3;
  owner.maxHp = 3;
  observer.role = "rebel";
  game.players.find((player) => player.id !== starter.id && player.id !== owner.id && player.id !== observer.id)!.role = "rebel";
  game.pendingResponse = null;
  game.resolvingCards = [];
  game.discardPile = [];
  game.afterMove = { queuedRecoveries: [], queuedTriggers: [], suspendedPhase: null, suspendedResponse: null };
  game.turn = {
    ...game.turn,
    playerId: starter.id,
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
  return { game, owner, starter, observer };
}

function beginInitialHuashen(game: GameSession, starterId: PlayerId): GameSession {
  const current = applyAction(game, { type: "end_play", playerId: starterId });
  expect(current.pendingResponse).toMatchObject({
    type: "standard_skill",
    skillId: "huashen",
    stage: "huashen_initial",
  });
  return current;
}

function huashenPrompt(game: GameSession, ownerId: PlayerId) {
  const prompt = getGameView(game, ownerId).prompt;
  if (prompt.type !== "standard_skill" || prompt.skillId !== "huashen") throw new Error("expected Huashen prompt");
  return prompt;
}

function formId(token: string): string {
  const parts = token.split(":");
  if (parts.length !== 3 || parts[0] !== "huashen") throw new Error("invalid Huashen token");
  return parts[1]!;
}

function skillId(token: string): string {
  const parts = token.split(":");
  if (parts.length !== 3 || parts[0] !== "huashen") throw new Error("invalid Huashen token");
  return parts[2]!;
}

function authoritativeFormIds(game: GameSession, ownerId: PlayerId): string[] {
  return game.completeRules.lifecycle.effects
    .filter((effect) => effect.ownerId === ownerId && effect.kind === "huashen_form")
    .map((effect) => String(effect.payload.generalId));
}

function selectedFormId(game: GameSession, ownerId: PlayerId): string {
  const effect = game.completeRules.lifecycle.effects.find((candidate) =>
    candidate.ownerId === ownerId && candidate.kind === "huashen_selected");
  if (!effect) throw new Error("missing selected Huashen state");
  return String(effect.payload.generalId);
}

function initializeHuashen(game: GameSession, ownerId: PlayerId, token?: string): GameSession {
  const prompt = huashenPrompt(game, ownerId);
  const selectedToken = token ?? prompt.options?.[0];
  if (!selectedToken) throw new Error("missing Huashen option");
  return applyAction(game, {
    type: "resolve_standard_skill",
    playerId: ownerId,
    promptId: prompt.promptId,
    activate: true,
    tokens: [selectedToken],
  });
}

function declineStandard(game: GameSession): GameSession {
  const pending = game.pendingResponse;
  if (pending?.type !== "standard_skill") throw new Error("expected standard skill prompt");
  if (pending.stage === "benghuai_choice") {
    return applyAction(game, {
      type: "resolve_standard_skill",
      playerId: pending.targetId,
      promptId: pending.promptId,
      activate: true,
      tokens: ["lose_max_hp"],
    });
  }
  return applyAction(game, {
    type: "resolve_standard_skill",
    playerId: pending.targetId,
    promptId: pending.promptId,
    activate: false,
  });
}

function reachPlay(game: GameSession, ownerId: PlayerId): GameSession {
  let current = game;
  for (let step = 0; step < 40; step += 1) {
    if (current.currentPlayerId === ownerId && current.turn.phase === "play" && current.pendingResponse === null) return current;
    const pending = current.pendingResponse;
    if (pending?.type === "standard_skill") {
      current = declineStandard(current);
      continue;
    }
    if (pending?.type === "skill_choice") {
      current = applyAction(current, {
        type: "resolve_skill",
        playerId: pending.targetId,
        skillId: pending.skillId,
        activate: false,
        ...(pending.promptId ? { promptId: pending.promptId } : {}),
      });
      continue;
    }
    throw new Error(`could not reach Huashen play phase from ${pending?.type ?? current.turn.phase}`);
  }
  throw new Error("Huashen prepare/draw chain did not terminate");
}

function reachEndHuashen(game: GameSession, ownerId: PlayerId): GameSession {
  let current = reachPlay(game, ownerId);
  current = applyAction(current, { type: "end_play", playerId: ownerId });
  for (let step = 0; step < 40; step += 1) {
    if (current.pendingResponse?.type === "standard_skill" &&
        current.pendingResponse.skillId === "huashen" && current.pendingResponse.stage === "huashen_turn_end") return current;
    const prompt = getGameView(current, ownerId).prompt;
    if (prompt.type === "discard") {
      current = applyAction(current, {
        type: "discard",
        playerId: ownerId,
        cardIds: prompt.cardIds.slice(0, prompt.count),
      });
      continue;
    }
    if (current.pendingResponse?.type === "standard_skill") {
      current = declineStandard(current);
      continue;
    }
    if (current.pendingResponse?.type === "skill_choice") {
      const pending = current.pendingResponse;
      current = applyAction(current, {
        type: "resolve_skill",
        playerId: pending.targetId,
        skillId: pending.skillId,
        activate: false,
        ...(pending.promptId ? { promptId: pending.promptId } : {}),
      });
      continue;
    }
    throw new Error(`could not reach Huashen end window from ${prompt.type}`);
  }
  throw new Error("Huashen end chain did not terminate");
}

function nextXinshengPrompt(game: GameSession, ownerId: PlayerId): GameSession {
  let current = game;
  for (let step = 0; step < 20; step += 1) {
    if (current.pendingResponse?.type === "standard_skill" &&
        current.pendingResponse.skillId === "xinsheng" && current.pendingResponse.stage === "xinsheng_invoke") return current;
    if (current.pendingResponse?.type === "standard_skill" && current.pendingResponse.damageOpportunity) {
      current = declineStandard(current);
      continue;
    }
    throw new Error(`expected Xinsheng damage prompt for ${ownerId}`);
  }
  throw new Error("Xinsheng opportunity chain did not terminate");
}

describe("live Huashen and Xinsheng", () => {
  it("keeps two initial forms server-only, restores JSON, and publicly projects only the selected identity", () => {
    const { game, owner, starter, observer } = setupHuashenStart();
    const initial = beginInitialHuashen(game, starter.id);
    const prompt = huashenPrompt(initial, owner.id);
    const options = prompt.options ?? [];
    const forms = [...new Set(options.map(formId))];
    expect(forms).toHaveLength(2);
    expect(options.length).toBeGreaterThanOrEqual(2);
    const hiddenView = JSON.stringify(getGameView(initial, observer.id));
    for (const form of forms) expect(hiddenView).not.toContain(form);
    expect(() => assertCompleteRulesEngineState(
      jsonClone(initial).completeRules,
      initial.players.map(({ id, hp, maxHp, alive }) => ({ id, hp, maxHp, alive })),
    )).not.toThrow();

    const selectedToken = options[0]!;
    const selectedGeneralId = formId(selectedToken);
    const unselectedGeneralId = forms.find((candidate) => candidate !== selectedGeneralId)!;
    const selectedSkillId = skillId(selectedToken);
    const selected = initializeHuashen(jsonClone(initial), owner.id, selectedToken);
    expect(selected.pendingResponse).toMatchObject({
      type: "standard_skill",
      skillId: "huashen",
      stage: "huashen_turn_start",
    });
    const publicOwner = getGameView(selected, observer.id).players.find((player) => player.id === owner.id)!;
    expect(publicOwner.general?.id).toBe(selectedGeneralId);
    expect(publicOwner.effectiveSkillIds).toEqual(expect.arrayContaining(["huashen", "xinsheng", selectedSkillId]));
    expect(JSON.stringify(getGameView(selected, observer.id))).not.toContain(unselectedGeneralId);
    expect(huashenPrompt(selected, owner.id).options?.map(formId)).toEqual(expect.arrayContaining(forms));
  });

  it("switches at both prepare and end windows while revoking only the previous Huashen grant", () => {
    const { game, owner, starter, observer } = setupHuashenStart();
    const initial = beginInitialHuashen(game, starter.id);
    const initialPrompt = huashenPrompt(initial, owner.id);
    const firstToken = initialPrompt.options![0]!;
    let current = initializeHuashen(initial, owner.id, firstToken);
    const startPrompt = huashenPrompt(current, owner.id);
    const otherToken = startPrompt.options!.find((token) => formId(token) !== formId(firstToken))!;
    const previousSkillId = skillId(firstToken);
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: startPrompt.promptId,
      activate: true,
      tokens: [otherToken],
    });
    expect(getGameView(current, observer.id).players.find((player) => player.id === owner.id)?.general?.id)
      .toBe(formId(otherToken));
    const huashenGrants = current.completeRules.lifecycle.grants.filter((grant) =>
      grant.ownerId === owner.id && grant.sourceSkillId === "huashen");
    expect(huashenGrants).toEqual([expect.objectContaining({ skillId: skillId(otherToken) })]);
    if (previousSkillId !== skillId(otherToken)) expect(getEffectiveGeneralSkillIds(current, owner.id)).not.toContain(previousSkillId);

    current = reachEndHuashen(current, owner.id);
    const endPrompt = huashenPrompt(current, owner.id);
    const returnToken = endPrompt.options!.find((token) => formId(token) === formId(firstToken))!;
    current = applyAction(jsonClone(current), {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: endPrompt.promptId,
      activate: true,
      tokens: [returnToken],
    });
    expect(selectedFormId(current, owner.id)).toBe(formId(firstToken));
    expect(getGameView(current, observer.id).players.find((player) => player.id === owner.id)?.general?.id)
      .toBe(formId(firstToken));
    expect(current.currentPlayerId).not.toBe(owner.id);
  });

  it("rejects duplicated, seated, public, unknown, and mismatched Huashen state", () => {
    const { game, owner, starter } = setupHuashenStart();
    const initial = beginInitialHuashen(game, starter.id);
    const effects = initial.completeRules.lifecycle.effects.filter((effect) =>
      effect.ownerId === owner.id && effect.kind === "huashen_form");
    expect(effects).toHaveLength(2);

    const duplicate = jsonClone(initial);
    const duplicateEffects = duplicate.completeRules.lifecycle.effects.filter((effect) =>
      effect.ownerId === owner.id && effect.kind === "huashen_form");
    (duplicateEffects[1]!.payload as { generalId: string }).generalId = String(duplicateEffects[0]!.payload.generalId);
    expect(() => getGameView(duplicate, owner.id)).toThrow(/重复|篡改/);

    const seated = jsonClone(initial);
    const seatedEffect = seated.completeRules.lifecycle.effects.find((effect) =>
      effect.ownerId === owner.id && effect.kind === "huashen_form")!;
    (seatedEffect.payload as { generalId: string }).generalId = "gan_ning";
    expect(() => getGameView(seated, owner.id)).toThrow(/已登场|重复/);

    const publicState = jsonClone(initial);
    const publicEffect = publicState.completeRules.lifecycle.effects.find((effect) =>
      effect.ownerId === owner.id && effect.kind === "huashen_form")!;
    (publicEffect as { visibility: string }).visibility = "public";
    expect(() => getGameView(publicState, owner.id)).toThrow(/篡改/);

    const unknown = jsonClone(initial);
    const unknownEffect = unknown.completeRules.lifecycle.effects.find((effect) =>
      effect.ownerId === owner.id && effect.kind === "huashen_form")!;
    (unknownEffect.payload as { generalId: string }).generalId = "forged_general";
    expect(() => getGameView(unknown, owner.id)).toThrow(/未知武将/);

    const selected = initializeHuashen(initial, owner.id);
    const mismatched = jsonClone(selected);
    const grant = mismatched.completeRules.lifecycle.grants.find((candidate) =>
      candidate.ownerId === owner.id && candidate.sourceSkillId === "huashen")!;
    (grant as { skillId: string }).skillId = "forged_skill";
    expect(() => getGameView(mismatched, owner.id)).toThrow(/不一致/);
  });

  it("offers Xinsheng once per damage point, adds unique private forms, and never switches immediately", () => {
    const { game, owner, starter, observer } = setupHuashenStart();
    const initialized = initializeHuashen(beginInitialHuashen(game, starter.id), owner.id);
    let current = reachPlay(initialized, owner.id);
    const selectedBefore = selectedFormId(current, owner.id);
    const attacker = current.players.find((player) => player.id !== owner.id && player.id !== observer.id)!;
    attacker.hand = [
      card("xinsheng-wine", "wine", "spade", 9),
      card("xinsheng-slash", "slash", "heart", 10),
    ];
    current.currentPlayerId = attacker.id;
    current.turn = {
      ...current.turn,
      playerId: attacker.id,
      phase: "play",
      slashUsed: false,
      wineUsed: false,
      slashDamageBonus: 0,
      skillUseCounts: {},
    };
    current = applyAction(current, { type: "play_card", playerId: attacker.id, cardId: "xinsheng-wine" });
    current = applyAction(current, {
      type: "play_card",
      playerId: attacker.id,
      cardId: "xinsheng-slash",
      targetId: owner.id,
    });
    current = applyAction(current, { type: "respond", playerId: owner.id, cardId: null });

    const initialForms = authoritativeFormIds(current, owner.id);
    expect(initialForms).toHaveLength(2);
    current = nextXinshengPrompt(current, owner.id);
    let pending = current.pendingResponse;
    if (pending?.type !== "standard_skill") throw new Error("expected first Xinsheng prompt");
    const stale = jsonClone(current);
    if (stale.pendingResponse?.type !== "standard_skill" || !stale.pendingResponse.damageOpportunity) {
      throw new Error("missing Xinsheng cursor");
    }
    (stale.pendingResponse.damageOpportunity as { expectedRevision: number }).expectedRevision += 1;
    expect(() => applyAction(stale, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: pending.promptId,
      activate: true,
    })).toThrow(/过期|DamageFlow/);
    current = applyAction(current, {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: pending.promptId,
      activate: true,
    });
    expect(selectedFormId(current, owner.id)).toBe(selectedBefore);

    current = nextXinshengPrompt(current, owner.id);
    pending = current.pendingResponse;
    if (pending?.type !== "standard_skill") throw new Error("expected second Xinsheng prompt");
    current = applyAction(jsonClone(current), {
      type: "resolve_standard_skill",
      playerId: owner.id,
      promptId: pending.promptId,
      activate: true,
    });
    const finalForms = authoritativeFormIds(current, owner.id);
    expect(finalForms).toHaveLength(4);
    expect(new Set(finalForms).size).toBe(4);
    expect(selectedFormId(current, owner.id)).toBe(selectedBefore);
    const newForms = finalForms.filter((generalId) => !initialForms.includes(generalId));
    const observerJson = JSON.stringify(getGameView(current, observer.id));
    for (const hidden of newForms) expect(observerJson).not.toContain(hidden);
    expect(current.completeRules.damageFlow.consumedActions.filter((entry) => entry.opportunityId.includes(":xinsheng:")))
      .toHaveLength(2);
    expect(current.completeRules.damageFlow.frames).toEqual([]);
  });
});
