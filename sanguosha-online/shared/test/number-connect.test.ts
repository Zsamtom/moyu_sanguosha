import { describe, expect, it } from "vitest";
import {
  NUMBER_CONNECT_CELL_COUNT,
  NUMBER_CONNECT_TARGET_LINES,
  NumberConnectRuleError,
  applyNumberConnectAction,
  assertRestorableNumberConnectGameState,
  chooseNumberConnectBotAction,
  createNumberConnectGame,
  forfeitNumberConnectPlayer,
  getNumberConnectCompletedLines,
  getNumberConnectGameView,
  type NumberConnectGameState,
} from "../src/number-connect.js";

const seed = "4d".repeat(32);
const players = [
  { id: "player-1", name: "玩家一" },
  { id: "player-2", name: "玩家二", botTitle: "连线高手" },
];

function play(
  game: NumberConnectGameState,
  number: number,
): NumberConnectGameState {
  return applyNumberConnectAction(game, {
    type: "number_connect_call",
    playerId: game.currentPlayerId!,
    number,
  });
}

describe("Number Connect authoritative engine", () => {
  it("creates deterministic, distinct 5x5 permutations", () => {
    const first = createNumberConnectGame({ players, seed });
    const second = createNumberConnectGame({ players, seed });
    expect(first).toEqual(second);
    expect(first.players).toHaveLength(2);
    for (const player of first.players) {
      expect(player.board).toHaveLength(NUMBER_CONNECT_CELL_COUNT);
      expect(new Set(player.board).size).toBe(NUMBER_CONNECT_CELL_COUNT);
      expect([...player.board].sort((left, right) => left - right)).toEqual(
        Array.from({ length: NUMBER_CONNECT_CELL_COUNT }, (_, index) => index + 1),
      );
    }
    expect(first.players[0]!.board).not.toEqual(first.players[1]!.board);
    expect(() => createNumberConnectGame({ players: players.slice(0, 1), seed })).toThrow();
  });

  it("counts all horizontal, vertical, and diagonal lines", () => {
    const board = Array.from({ length: NUMBER_CONNECT_CELL_COUNT }, (_, index) => index + 1);
    expect(getNumberConnectCompletedLines(board, [1, 2, 3, 4, 5])).toBe(1);
    expect(getNumberConnectCompletedLines(board, [1, 6, 11, 16, 21])).toBe(1);
    expect(getNumberConnectCompletedLines(board, [1, 7, 13, 19, 25])).toBe(1);
    expect(getNumberConnectCompletedLines(board, [5, 9, 13, 17, 21])).toBe(1);
  });

  it("marks a called number for both players and alternates turns", () => {
    const initial = createNumberConnectGame({ players, seed });
    const callerId = initial.currentPlayerId!;
    const nextId = initial.players.find((player) => player.id !== callerId)!.id;
    const game = play(initial, 13);
    expect(game.calledNumbers).toEqual([13]);
    expect(game.lastNumber).toBe(13);
    expect(game.currentPlayerId).toBe(nextId);
    expect(() => applyNumberConnectAction(game, {
      type: "number_connect_call",
      playerId: nextId,
      number: 13,
    })).toThrow(NumberConnectRuleError);
  });

  it("hides the opponent board until someone reaches five lines", () => {
    let game = createNumberConnectGame({ players, seed });
    const ownView = getNumberConnectGameView(game, players[0]!.id);
    expect(ownView.players[0]!.board).toEqual(game.players[0]!.board);
    expect(ownView.players[1]!.board).toBeUndefined();

    for (const number of game.players[0]!.board) {
      if (game.status === "finished") break;
      game = play(game, number);
    }
    expect(game.status).toBe("finished");
    expect(game.winner?.reason).toBe("lines");
    expect(Math.max(...game.players.map((player) => player.lineCount)))
      .toBeGreaterThanOrEqual(NUMBER_CONNECT_TARGET_LINES);
    const finalView = getNumberConnectGameView(game, players[0]!.id);
    expect(finalView.players.every((player) => player.board?.length === 25)).toBe(true);
    expect(() => assertRestorableNumberConnectGameState(game)).not.toThrow();
  });

  it("chooses legal bot calls and resolves forfeits", () => {
    const game = createNumberConnectGame({ players, seed });
    const botId = game.currentPlayerId!;
    const action = chooseNumberConnectBotAction(game, botId);
    expect(action).toMatchObject({ type: "number_connect_call", playerId: botId });
    expect(action.number).toBeGreaterThanOrEqual(1);
    expect(action.number).toBeLessThanOrEqual(25);

    const forfeited = forfeitNumberConnectPlayer(game, players[0]!.id);
    expect(forfeited).toMatchObject({
      status: "finished",
      currentPlayerId: null,
      winner: { reason: "forfeit", playerIds: [players[1]!.id] },
    });
  });
});
