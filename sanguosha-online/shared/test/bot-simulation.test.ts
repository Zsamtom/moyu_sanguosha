import { describe, expect, it } from "vitest";

import {
  applyAction,
  createGame,
  getGameView,
  type GameAction,
  type GameSession,
  type PlayerId,
} from "../src/index.js";

function actingPlayerId(game: GameSession): PlayerId {
  return game.turn.phase === "respond" && game.pendingResponse
    ? game.pendingResponse.targetId
    : game.currentPlayerId;
}

function botAction(game: GameSession): GameAction {
  const playerId = actingPlayerId(game);
  const prompt = getGameView(game, playerId).prompt;
  switch (prompt.type) {
    case "play": {
      const hint = prompt.cards.find((card) => card.kind === "peach")
        ?? prompt.cards.find((card) => card.kind === "ex_nihilo")
        ?? prompt.cards[0];
      if (!hint) {
        const virtual = prompt.zhangBaSlash;
        const targetId = virtual?.targetIds[0];
        if (virtual && targetId) {
          return {
            type: "use_zhang_ba_slash",
            playerId,
            cardIds: virtual.allowedCardIds.slice(0, 2),
            targetId,
          };
        }
        return { type: "end_play", playerId };
      }
      if (hint.targetMode === "ordered-two") {
        return { type: "play_card", playerId, cardId: hint.cardId, targetIds: hint.targetPairs?.[0] ? [...hint.targetPairs[0]] : [] };
      }
      if (hint.targetMode === "up-to-two" || hint.targetMode === "up-to-three") {
        return {
          type: "play_card",
          playerId,
          cardId: hint.cardId,
          targetIds: hint.targetIds.slice(0, hint.targetMode === "up-to-three" ? 3 : 2),
        };
      }
      return { type: "play_card", playerId, cardId: hint.cardId, targetId: hint.targetIds[0] };
    }
    case "respond": {
      const physical = prompt.responseKind === "slash" ? prompt.slashCardIds[0] : prompt.dodgeCardIds[0];
      if (physical) return { type: "respond", playerId, cardId: physical };
      if (prompt.responseKind === "slash" && (prompt.zhangBaCardIds?.length ?? 0) >= 2) {
        return { type: "respond", playerId, cardIds: prompt.zhangBaCardIds!.slice(0, 2) };
      }
      return { type: "respond", playerId, cardId: null };
    }
    case "dying":
    case "nullification":
      return { type: "respond", playerId, cardId: prompt.allowedCardIds[0] ?? null };
    case "armor":
      return { type: "activate_armor", playerId, activate: true };
    case "weapon_action": {
      const choice = prompt.choices?.[0];
      if (choice) return { type: "resolve_weapon", playerId, activate: true, tokens: [choice.token] };
      const cardIds = prompt.allowedCardIds.slice(0, prompt.minCards);
      return prompt.minCards === 0 || cardIds.length === prompt.minCards
        ? { type: "resolve_weapon", playerId, activate: true, cardIds }
        : { type: "resolve_weapon", playerId, activate: false };
    }
    case "discard":
      return { type: "discard", playerId, cardIds: prompt.cardIds.slice(0, prompt.count) };
    case "zone_selection":
      return { type: "choose_zone_card", playerId, token: prompt.choices[0]!.token };
    case "fire_attack_reveal":
    case "fire_attack_discard":
      return { type: "choose_hand_card", playerId, cardId: prompt.allowedCardIds[0] ?? null };
    case "amazing_grace_selection":
      return { type: "choose_amazing_grace_card", playerId, cardId: prompt.cards[0]!.id };
    case "skill_choice":
      return {
        type: "resolve_skill",
        playerId,
        skillId: prompt.skillId,
        activate:
          prompt.skillId === "keji" ||
          prompt.skillId === "jizhi" ||
          prompt.skillId === "lianying" ||
          prompt.skillId === "xiaoji",
        ...(prompt.promptId ? { promptId: prompt.promptId } : {}),
      };
    case "standard_skill": {
      const base = {
        type: "resolve_standard_skill" as const,
        playerId,
        promptId: prompt.promptId,
      };
      if (prompt.stage === "judgment_retrial") return { ...base, activate: false };
      if (prompt.stage === "judgment_post") return { ...base, activate: true };
      if (prompt.skillId === "guanxing" && prompt.stage === "guanxing_reorder") {
        return { ...base, activate: true, topCardIds: prompt.cards.map((card) => card.id), bottomCardIds: [] };
      }
      if (prompt.skillId === "tuxi") {
        const targetIds = prompt.targetIds.slice(0, 2);
        const tokens = targetIds.map((targetId) => prompt.choices?.find((choice) => choice.ownerId === targetId)?.token);
        return targetIds.length > 0 && tokens.every((token): token is string => Boolean(token))
          ? { ...base, activate: true, targetIds, tokens }
          : { ...base, activate: false };
      }
      if (prompt.skillId === "yiji" && prompt.stage === "yiji_distribute") {
        return {
          ...base,
          activate: true,
          allocations: prompt.cards.map((card) => ({ cardId: card.id, targetId: playerId })),
        };
      }
      if (prompt.skillId === "fankui" && prompt.stage === "fankui_select") {
        const choice = prompt.choices?.[0];
        return choice ? { ...base, activate: true, tokens: [choice.token] } : { ...base, activate: false };
      }
      if (prompt.skillId === "ganglie" && prompt.stage === "ganglie_punish") {
        return prompt.allowedCardIds.length >= 2
          ? { ...base, activate: true, cardIds: prompt.allowedCardIds.slice(0, 2) }
          : { ...base, activate: false };
      }
      if (prompt.skillId === "liuli") {
        const cardId = prompt.allowedCardIds[0];
        const targetId = cardId ? prompt.cardTargetIds?.[cardId]?.[0] : undefined;
        return cardId && targetId
          ? { ...base, activate: true, cardId, targetId }
          : { ...base, activate: false };
      }
      return { ...base, activate: true };
    }
    case "lord_dispatch":
      return {
        type: "resolve_lord_dispatch",
        playerId,
        promptId: prompt.promptId,
        cardId: prompt.allowedCardIds[0] ?? null,
      };
    case "fanjian_suit":
      return {
        type: "choose_fanjian_suit",
        playerId,
        promptId: prompt.promptId,
        suit: prompt.suits[0]!,
      };
    case "waiting":
    case "finished":
      throw new Error(`No bot action available for ${prompt.type}.`);
  }
}

describe("prompt-driven bot simulations", () => {
  it("finishes 100 seeded five-player games without a stuck resolution", () => {
    let maximumActions = 0;
    for (let seedValue = 1; seedValue <= 100; seedValue += 1) {
      let game = createGame({
        playerIds: ["p1", "p2", "p3", "p4", "p5"],
        seed: seedValue.toString(16).padStart(64, "0"),
      });
      let actions = 0;
      while (game.status === "playing" && actions < 2_000) {
        game = applyAction(game, botAction(game));
        actions += 1;
      }
      maximumActions = Math.max(maximumActions, actions);
      expect(game.status, `seed ${seedValue} stuck after ${actions} actions`).toBe("finished");
      expect(game.winner).not.toBeNull();
    }
    expect(maximumActions).toBeLessThan(2_000);
  }, 15_000);
});
