import { describe, expect, it } from "vitest";
import {
  GoujiRuleError,
  applyGoujiAction,
  canGoujiPatternBeat,
  chooseGoujiBotAction,
  createGoujiGame,
  getGoujiGameView,
  parseGoujiPattern,
  type GoujiCard,
  type GoujiGameState,
} from "../src/index.js";

const SEED = "ab".repeat(32);
const players = Array.from({ length: 6 }, (_, seat) => ({
  id: `player-${seat + 1}`,
  name: `玩家${seat + 1}`,
}));

function card(id: string, rank: GoujiCard["rank"], suit: GoujiCard["suit"] = "spade"): GoujiCard {
  return { id, rank, suit: rank.includes("joker") ? "joker" : suit };
}

function cards(rank: GoujiCard["rank"], count: number, prefix = rank): GoujiCard[] {
  return Array.from({ length: count }, (_, index) => card(`${prefix}-${index}`, rank));
}

function controlledState(): GoujiGameState {
  const state = createGoujiGame({ players, seed: SEED });
  state.players.forEach((player, seat) => {
    player.hand = [card(`seat-${seat}-5`, "5")];
    player.finishedRank = undefined;
    player.openedPoint = false;
  });
  state.currentPlayerId = state.players[0]!.id;
  state.leadPlayerId = state.players[0]!.id;
  state.trick = null;
  state.logs = [];
  state.nextLogId = 1;
  state.revision = 0;
  return state;
}

describe("Gouji authoritative engine", () => {
  it("deals the 196-card deck deterministically and hides opponents' hands", () => {
    const first = createGoujiGame({ players, seed: SEED });
    const second = createGoujiGame({ players, seed: SEED });

    expect(first.players.reduce((total, player) => total + player.hand.length, 0)).toBe(196);
    expect(first.players.every((player) =>
      player.hand.some((item) => item.rank === "3") &&
      player.hand.some((item) => item.rank === "4")
    )).toBe(true);
    expect(first.players.map((player) => player.hand.map((item) => item.id))).toEqual(
      second.players.map((player) => player.hand.map((item) => item.id)),
    );

    const view = getGoujiGameView(first, players[0]!.id);
    expect(view.players[0]?.hand?.length).toBe(first.players[0]?.hand.length);
    expect(view.players.slice(1).every((player) => player.hand === undefined)).toBe(true);
  });

  it("recognizes Gouji thresholds and compares legal groups", () => {
    const fiveTens = parseGoujiPattern(cards("10", 5));
    const fourJacks = parseGoujiPattern(cards("J", 4));
    const oneAce = parseGoujiPattern(cards("A", 1));
    const twoAces = parseGoujiPattern(cards("A", 2));

    expect(fiveTens).toMatchObject({ isGouji: true, canOpenPoint: true });
    expect(oneAce).toMatchObject({ isGouji: false, canOpenPoint: false });
    expect(twoAces).toMatchObject({ isGouji: true, canOpenPoint: true });
    expect(canGoujiPatternBeat(fourJacks!, fiveTens!)).toBe(false);
    expect(canGoujiPatternBeat(parseGoujiPattern(cards("Q", 5))!, fiveTens!)).toBe(true);
  });

  it("enforces holding threes, playing all fours, and team isolation", () => {
    const state = controlledState();
    state.players[0]!.hand = [card("three", "3"), card("five", "5")];
    expect(() => applyGoujiAction(state, {
      type: "gouji_play",
      playerId: state.players[0]!.id,
      cardIds: ["three"],
    })).toThrowError(expect.objectContaining({ code: "GOUJI_MUST_HOLD_THREES" }));

    state.players[0]!.hand = [card("four-1", "4"), card("four-2", "4"), card("five", "5")];
    expect(() => applyGoujiAction(state, {
      type: "gouji_play",
      playerId: state.players[0]!.id,
      cardIds: ["four-1"],
    })).toThrowError(expect.objectContaining({ code: "GOUJI_MUST_PLAY_ALL_FOURS" }));

    const leaderPattern = parseGoujiPattern(cards("10", 5, "lead"))!;
    state.trick = {
      pattern: leaderPattern,
      fromPlayerId: state.players[0]!.id,
      passedPlayerIds: [],
      passedAt: {},
    };
    state.currentPlayerId = state.players[2]!.id;
    state.players[2]!.hand = cards("J", 5, "ally");
    expect(() => applyGoujiAction(state, {
      type: "gouji_play",
      playerId: state.players[2]!.id,
      cardIds: state.players[2]!.hand.map((item) => item.id),
    })).toThrowError(expect.objectContaining({ code: "GOUJI_ISOLATION" }));
  });

  it("runs both ordinary and master bots to a complete ranked result", () => {
    for (const intelligence of [3, 7] as const) {
      let state = createGoujiGame({ players, seed: "cd".repeat(32) });
      for (let step = 0; step < 5_000 && state.status === "playing"; step += 1) {
        const action = chooseGoujiBotAction(state, state.currentPlayerId, intelligence);
        state = applyGoujiAction(state, action);
      }

      expect(state.status, `intelligence ${intelligence}`).toBe("finished");
      expect(state.winner?.playerIds).toHaveLength(3);
      expect(new Set(state.players.map((player) => player.finishedRank)).size).toBe(6);
      expect(state.players.map((player) => player.finishedRank)).toEqual(
        expect.arrayContaining(["头科", "二科", "三科", "四科", "二拉", "大拉"]),
      );
    }
  }, 10_000);

  it("uses intelligence for teammate cooperation while still taking a finishing play", () => {
    const state = controlledState();
    state.players[0]!.hand = [
      card("jack", "J"),
      card("queen", "Q"),
      card("king", "K"),
      card("ace", "A"),
    ];
    state.trick = {
      pattern: parseGoujiPattern([card("table-ten", "10")])!,
      fromPlayerId: state.players[2]!.id,
      passedPlayerIds: [],
      passedAt: {},
    };
    state.currentPlayerId = state.players[0]!.id;

    expect(chooseGoujiBotAction(state, state.players[0]!.id, 3).type).toBe("gouji_play");
    expect(chooseGoujiBotAction(state, state.players[0]!.id, 6).type).toBe("gouji_pass");

    state.players[0]!.hand = [card("last-jack", "J")];
    expect(chooseGoujiBotAction(state, state.players[0]!.id, 7)).toEqual({
      type: "gouji_play",
      playerId: state.players[0]!.id,
      cardIds: ["last-jack"],
    });
  });

  it("does not reopen yield after returning the final decision to the yielding player", () => {
    const state = controlledState();
    const yieldPlayer = state.players[0]!;
    const leader = state.players[3]!;
    const passedPlayers = [
      state.players[5]!,
      state.players[4]!,
      state.players[1]!,
      state.players[2]!,
    ];
    state.currentPlayerId = yieldPlayer.id;
    state.leadPlayerId = leader.id;
    state.trick = {
      pattern: parseGoujiPattern([card("table-two", "2", "club")])!,
      fromPlayerId: leader.id,
      passedPlayerIds: passedPlayers.map((player) => player.id),
      passedAt: Object.fromEntries(passedPlayers.map((player) => [player.id, leader.id])),
    };

    const yielded = applyGoujiAction(state, {
      type: "gouji_yield",
      playerId: yieldPlayer.id,
    });

    expect(yielded.currentPlayerId).toBe(yieldPlayer.id);
    expect(yielded.trick).toMatchObject({
      yielded: true,
      yieldPlayerId: yieldPlayer.id,
    });
    expect(getGoujiGameView(yielded, yieldPlayer.id).prompt.canYield).toBe(false);
    expect(() => applyGoujiAction(yielded, {
      type: "gouji_yield",
      playerId: yieldPlayer.id,
    })).toThrowError(expect.objectContaining({ code: "GOUJI_CANNOT_YIELD" }));

    const passed = applyGoujiAction(yielded, {
      type: "gouji_pass",
      playerId: yieldPlayer.id,
    });
    expect(passed.trick).toBeNull();
    expect(passed.currentPlayerId).toBe(leader.id);
  });

  it("returns a rules-valid action at every intelligence level", () => {
    for (const intelligence of [1, 2, 3, 4, 5, 6, 7] as const) {
      const state = controlledState();
      state.players[0]!.hand = [card("jack", "J"), card("queen", "Q"), card("king", "K")];
      state.trick = {
        pattern: parseGoujiPattern([card("table-ten", "10")])!,
        fromPlayerId: state.players[1]!.id,
        passedPlayerIds: [],
        passedAt: {},
      };
      const action = chooseGoujiBotAction(state, state.currentPlayerId, intelligence);
      expect(() => applyGoujiAction(state, action), `intelligence ${intelligence}`).not.toThrow();
    }
  });

  it("rejects a stale actor before mutating the state", () => {
    const state = controlledState();
    const snapshot = structuredClone(state);
    expect(() => applyGoujiAction(state, {
      type: "gouji_pass",
      playerId: state.players[1]!.id,
    })).toThrow(GoujiRuleError);
    expect(state).toEqual(snapshot);
  });
});
