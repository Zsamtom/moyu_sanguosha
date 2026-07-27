import { describe, expect, it } from "vitest";
import {
  NUMBER_CONNECT_CELL_COUNT,
  NUMBER_CONNECT_TARGET_LINES,
  NumberConnectRuleError,
  applyNumberConnectAction,
  assertRestorableNumberConnectGameState,
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
  playerId: string,
  number: number,
): NumberConnectGameState {
  return applyNumberConnectAction(game, {
    type: "number_connect_call",
    playerId,
    number,
  });
}

describe("Number Connect authoritative engine", () => {
  it("creates deterministic 5x5 permutations with no matching positions", () => {
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
    first.players[0]!.board.forEach((number, index) => {
      expect(first.players[1]!.board[index]).not.toBe(number);
    });
    const invalid = structuredClone(first);
    const matchingNumber = invalid.players[0]!.board[0]!;
    const matchingIndex = invalid.players[1]!.board.indexOf(matchingNumber);
    [invalid.players[1]!.board[0], invalid.players[1]!.board[matchingIndex]] = [
      invalid.players[1]!.board[matchingIndex]!,
      invalid.players[1]!.board[0]!,
    ];
    expect(() => assertRestorableNumberConnectGameState(invalid)).toThrow(
      /同一位置不能出现相同数字/,
    );
    expect(() => createNumberConnectGame({ players: players.slice(0, 1), seed })).toThrow();
  });

  it("counts all horizontal, vertical, and diagonal lines", () => {
    const board = Array.from({ length: NUMBER_CONNECT_CELL_COUNT }, (_, index) => index + 1);
    expect(getNumberConnectCompletedLines(board, [1, 2, 3, 4, 5])).toBe(1);
    expect(getNumberConnectCompletedLines(board, [1, 6, 11, 16, 21])).toBe(1);
    expect(getNumberConnectCompletedLines(board, [1, 7, 13, 19, 25])).toBe(1);
    expect(getNumberConnectCompletedLines(board, [5, 9, 13, 17, 21])).toBe(1);
  });

  it("lets both players freely mark only their own boards", () => {
    const initial = createNumberConnectGame({ players, seed });
    const callerId = players[0]!.id;
    const nextId = players[1]!.id;
    const game = play(initial, callerId, 13);
    expect(game.players.find((player) => player.id === callerId)?.markedNumbers).toEqual([13]);
    expect(game.players.find((player) => player.id === nextId)?.markedNumbers).toEqual([]);
    expect(game.lastMove).toEqual({ playerId: callerId, number: 13 });
    expect(game.currentPlayerId).toBeNull();
    const afterNextPlayer = applyNumberConnectAction(game, {
      type: "number_connect_call",
      playerId: nextId,
      number: 13,
    });
    expect(afterNextPlayer.players.find((player) => player.id === nextId)?.markedNumbers)
      .toEqual([13]);
    const afterAnotherCallerMark = applyNumberConnectAction(afterNextPlayer, {
      type: "number_connect_call",
      playerId: callerId,
      number: 14,
    });
    expect(afterAnotherCallerMark.players[0]!.markedNumbers).toEqual([13, 14]);
    expect(() => applyNumberConnectAction(afterAnotherCallerMark, {
      type: "number_connect_call",
      playerId: callerId,
      number: 13,
    })).toThrow(NumberConnectRuleError);
    expect(getNumberConnectGameView(game, callerId).calledNumbers).toEqual([13]);
    expect(getNumberConnectGameView(game, nextId).calledNumbers).toEqual([]);
  });

  it("keeps the opponent board private after someone reaches five lines", () => {
    let game = createNumberConnectGame({ players, seed });
    const ownView = getNumberConnectGameView(game, players[0]!.id);
    expect(ownView.players[0]!.board).toEqual(game.players[0]!.board);
    expect(ownView.players[1]!.board).toBeUndefined();

    const firstPlayerId = game.players[0]!.id;
    for (const number of game.players[0]!.board) {
      if (game.status === "finished") break;
      game = play(game, firstPlayerId, number);
    }
    expect(game.status).toBe("finished");
    expect(game.winner?.reason).toBe("lines");
    expect(game.winner?.playerIds).toEqual([firstPlayerId]);
    expect(Math.max(...game.players.map((player) => player.lineCount)))
      .toBeGreaterThanOrEqual(NUMBER_CONNECT_TARGET_LINES);
    const finalView = getNumberConnectGameView(game, players[0]!.id);
    expect(finalView.players[0]!.board).toEqual(game.players[0]!.board);
    expect(finalView.players[1]!.board).toBeUndefined();
    expect(() => assertRestorableNumberConnectGameState(game)).not.toThrow();
  });

  it("resolves forfeits", () => {
    const game = createNumberConnectGame({ players, seed });
    const forfeited = forfeitNumberConnectPlayer(game, players[0]!.id);
    expect(forfeited).toMatchObject({
      status: "finished",
      currentPlayerId: null,
      winner: { reason: "forfeit", playerIds: [players[1]!.id] },
    });
  });
});
