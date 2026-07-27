import { describe, expect, it } from "vitest";
import {
  DigitBombRuleError,
  applyDigitBombAction,
  assertRestorableDigitBombGameState,
  chooseDigitBombBotAction,
  createDigitBombGame,
  forfeitDigitBombPlayer,
  getDigitBombGameView,
  type DigitBombGameState,
} from "../src/digit-bomb.js";

const seed = "7b".repeat(32);
const players = [
  { id: "player-1", name: "玩家一" },
  { id: "player-2", name: "玩家二", botTitle: "拆弹专家" },
];

function withSecrets(digits = 4): DigitBombGameState {
  let game = createDigitBombGame({ players, seed, digits });
  game = applyDigitBombAction(game, {
    type: "digit_bomb_set_secret",
    playerId: players[1]!.id,
    secret: "0".repeat(digits),
  });
  game = applyDigitBombAction(game, {
    type: "digit_bomb_set_secret",
    playerId: players[0]!.id,
    secret: "1".repeat(digits),
  });
  return game;
}

function finishRound(game: DigitBombGameState): DigitBombGameState {
  const guesserId = game.currentPlayerId!;
  const responderId = game.players.find((player) => player.id !== guesserId)!.id;
  game = applyDigitBombAction(game, {
    type: "digit_bomb_guess",
    playerId: guesserId,
    guess: "9".repeat(game.digits),
  });
  return applyDigitBombAction(game, {
    type: "digit_bomb_feedback",
    playerId: responderId,
    correctPositions: game.digits,
  });
}

describe("Digit Bomb authoritative engine", () => {
  it("creates a deterministic two-player setup with configurable digits", () => {
    const first = createDigitBombGame({ players, seed, digits: 8 });
    const second = createDigitBombGame({ players, seed, digits: 8 });
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      kind: "digit_bomb",
      version: 1,
      revision: 0,
      phase: "setup",
      digits: 8,
      round: 1,
    });
    expect(() => createDigitBombGame({ players, seed, digits: 0 })).toThrow();
    expect(() => createDigitBombGame({ players: players.slice(0, 1), seed, digits: 4 })).toThrow();
  });

  it("projects only the viewer's own secret and never leaks it to an opponent or spectator", () => {
    let game = createDigitBombGame({ players, seed, digits: 4 });
    game = applyDigitBombAction(game, {
      type: "digit_bomb_set_secret",
      playerId: players[0]!.id,
      secret: "0070",
    });
    game = applyDigitBombAction(game, {
      type: "digit_bomb_set_secret",
      playerId: players[1]!.id,
      secret: "8642",
    });
    const ownerView = getDigitBombGameView(game, players[0]!.id);
    const opponentView = getDigitBombGameView(game, players[1]!.id);
    const spectatorView = getDigitBombGameView(game, null);
    expect(ownerView.players[0]?.secretSubmitted).toBe(true);
    expect(opponentView.players[0]?.secretSubmitted).toBe(true);
    expect(ownerView.ownSecret).toBe("0070");
    expect(opponentView.ownSecret).toBe("8642");
    expect(spectatorView.ownSecret).toBeNull();
    expect(JSON.stringify(ownerView)).not.toContain("8642");
    expect(JSON.stringify(opponentView)).not.toContain("0070");
    expect(JSON.stringify(spectatorView)).not.toContain("0070");
    expect(JSON.stringify(spectatorView)).not.toContain("8642");
    expect(ownerView.players.every((player) => !("secret" in player))).toBe(true);
    expect(opponentView.players.every((player) => !("secret" in player))).toBe(true);
  });

  it("alternates guess and manual feedback without verifying truth", () => {
    let game = withSecrets();
    const guesserId = game.currentPlayerId!;
    const responderId = game.players.find((player) => player.id !== guesserId)!.id;
    game = applyDigitBombAction(game, {
      type: "digit_bomb_guess",
      playerId: guesserId,
      guess: "2468",
    });
    expect(game).toMatchObject({
      phase: "feedback",
      currentPlayerId: responderId,
      pendingGuess: { guesserId, responderId, value: "2468", attempt: 1 },
    });

    game = applyDigitBombAction(game, {
      type: "digit_bomb_feedback",
      playerId: responderId,
      correctPositions: 2,
    });
    expect(game).toMatchObject({ phase: "guess", currentPlayerId: responderId });
    expect(game.players.find((player) => player.id === guesserId)?.guesses).toEqual([
      { value: "2468", feedback: 2 },
    ]);
    expect(() => applyDigitBombAction(game, {
      type: "digit_bomb_guess",
      playerId: guesserId,
      guess: "12",
    })).toThrow(DigitBombRuleError);
  });

  it("scores the winner, rematches with the other starter, and preserves totals", () => {
    let game = finishRound(withSecrets());
    const winnerId = game.roundResult!.winnerId;
    const oldStarter = game.roundStarterId;
    expect(game).toMatchObject({
      phase: "round_finished",
      roundResult: { winnerId, attempts: 1, points: 10 },
    });
    expect(game.players.find((player) => player.id === winnerId)?.score).toBe(10);

    game = applyDigitBombAction(game, {
      type: "digit_bomb_vote",
      playerId: players[1]!.id,
      vote: "rematch",
    });
    game = applyDigitBombAction(game, {
      type: "digit_bomb_vote",
      playerId: players[0]!.id,
      vote: "rematch",
    });
    expect(game).toMatchObject({ phase: "setup", round: 2, currentPlayerId: players[0]!.id });
    expect(game.roundStarterId).not.toBe(oldStarter);
    expect(game.players.every((player) => player.secret === null && player.guesses.length === 0)).toBe(true);
    expect(game.players.find((player) => player.id === winnerId)?.score).toBe(10);
  });

  it("allows vote changes and settles only after both players agree", () => {
    let game = finishRound(withSecrets());
    game = applyDigitBombAction(game, {
      type: "digit_bomb_vote",
      playerId: players[0]!.id,
      vote: "rematch",
    });
    game = applyDigitBombAction(game, {
      type: "digit_bomb_vote",
      playerId: players[1]!.id,
      vote: "settle",
    });
    expect(game).toMatchObject({ status: "playing", phase: "round_finished" });

    game = applyDigitBombAction(game, {
      type: "digit_bomb_vote",
      playerId: players[0]!.id,
      vote: "settle",
    });
    expect(game).toMatchObject({
      status: "finished",
      phase: "finished",
      winner: { reason: "settle" },
    });
  });

  it("uses legal private bot setup, honest feedback, and the human's settle vote", () => {
    let game = createDigitBombGame({ players, seed, digits: 4 });
    const botId = players[1]!.id;
    const secretAction = chooseDigitBombBotAction(game, botId);
    expect(secretAction).toMatchObject({ type: "digit_bomb_set_secret", playerId: botId });
    game = applyDigitBombAction(game, secretAction);
    game = applyDigitBombAction(game, {
      type: "digit_bomb_set_secret",
      playerId: players[0]!.id,
      secret: "1234",
    });

    if (game.currentPlayerId !== players[0]!.id) {
      const botGuess = chooseDigitBombBotAction(game, botId);
      game = applyDigitBombAction(game, botGuess);
      game = applyDigitBombAction(game, {
        type: "digit_bomb_feedback",
        playerId: players[0]!.id,
        correctPositions: 0,
      });
    }
    game = applyDigitBombAction(game, {
      type: "digit_bomb_guess",
      playerId: players[0]!.id,
      guess: "0000",
    });
    const feedback = chooseDigitBombBotAction(game, botId);
    expect(feedback).toEqual({
      type: "digit_bomb_feedback",
      playerId: botId,
      correctPositions: game.players.find((player) => player.id === botId)!.secret!
        .split("")
        .filter((digit, index) => digit === "0000"[index]).length,
    });

    game = applyDigitBombAction(game, {
      type: "digit_bomb_feedback",
      playerId: botId,
      correctPositions: 4,
    });
    game = applyDigitBombAction(game, {
      type: "digit_bomb_vote",
      playerId: players[0]!.id,
      vote: "settle",
    });
    expect(chooseDigitBombBotAction(game, botId)).toEqual({
      type: "digit_bomb_vote",
      playerId: botId,
      vote: "settle",
    });
  });

  it("forfeits and rejects semantically tampered snapshots", () => {
    const game = withSecrets();
    expect(() => assertRestorableDigitBombGameState(game)).not.toThrow();
    const tampered = structuredClone(game);
    tampered.players[0]!.secret = "123";
    expect(() => assertRestorableDigitBombGameState(tampered)).toThrow();
    const injected = structuredClone(game) as DigitBombGameState & { injected: boolean };
    injected.injected = true;
    expect(() => assertRestorableDigitBombGameState(injected)).toThrow();

    const forfeited = forfeitDigitBombPlayer(game, players[1]!.id);
    expect(forfeited).toMatchObject({
      status: "finished",
      winner: { reason: "forfeit", playerIds: [players[0]!.id] },
    });
  });
});
