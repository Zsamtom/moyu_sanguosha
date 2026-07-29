import { describe, expect, it } from "vitest";
import {
  FARM_ACTIONS_PER_TURN,
  FARM_FINAL_DAY,
  FarmRuleError,
  applyFarmAction,
  assertRestorableFarmGameState,
  createFarmGame,
  forfeitFarmPlayer,
  getFarmGameView,
  type FarmAction,
  type FarmGameState,
} from "../src/farm.js";

const players = [
  { id: "farmer-1", name: "经营者一" },
];

function act(game: FarmGameState, action: FarmAction): FarmGameState {
  return applyFarmAction(game, action);
}

describe("Farm authoritative engine", () => {
  it("creates a deterministic market and a three-action opening turn", () => {
    const first = createFarmGame({ players, seed: "farm-seed" });
    const second = createFarmGame({ players, seed: "farm-seed" });
    expect(first).toEqual(second);
    expect(first.currentPlayerId).toBe(players[0]!.id);
    expect(first.players[0]!.actionsRemaining).toBe(FARM_ACTIONS_PER_TURN);
    expect(() => assertRestorableFarmGameState(first)).not.toThrow();
  });

  it("supports the plant, water, grow, harvest, and sell loop", () => {
    let game = createFarmGame({ players, seed: "crop-cycle" });
    game = act(game, {
      type: "farm_plant",
      playerId: players[0]!.id,
      cropId: "wheat",
      plotIndex: 0,
    });
    game = act(game, { type: "farm_water", playerId: players[0]!.id });
    game = act(game, { type: "farm_end_turn", playerId: players[0]!.id });
    expect(game.day).toBe(2);
    expect(game.players[0]!.plots[0]).toMatchObject({ cropId: "wheat", growth: 1 });

    game = act(game, { type: "farm_water", playerId: players[0]!.id });
    game = act(game, { type: "farm_end_turn", playerId: players[0]!.id });
    expect(game.players[0]!.plots[0]!.growth).toBe(2);

    game = act(game, {
      type: "farm_harvest",
      playerId: players[0]!.id,
      plotIndex: 0,
    });
    expect(game.players[0]!.produce.wheat).toBe(2);
    const price = game.market.wheat.price;
    game = act(game, {
      type: "farm_sell",
      playerId: players[0]!.id,
      cropId: "wheat",
      quantity: 2,
    });
    expect(game.players[0]!.totalRevenue).toBe(price * 2);
    expect(game.players[0]!.produce.wheat).toBe(0);
  });

  it("enforces turn ownership, funds, inventory, and action limits", () => {
    let game = createFarmGame({ players, seed: "validation" });
    expect(() => act(game, {
      type: "farm_water",
      playerId: "unknown",
    })).toThrow(FarmRuleError);
    expect(() => act(game, {
      type: "farm_buy_seed",
      playerId: players[0]!.id,
      cropId: "pumpkin",
      quantity: 20,
    })).toThrow("资金不足");
    game = act(game, {
      type: "farm_plant",
      playerId: players[0]!.id,
      cropId: "wheat",
      plotIndex: 0,
    });
    expect(() => act(game, {
      type: "farm_plant",
      playerId: players[0]!.id,
      cropId: "wheat",
      plotIndex: 0,
    })).toThrow("已有作物");
    game = act(game, { type: "farm_water", playerId: players[0]!.id });
    game = act(game, {
      type: "farm_buy_seed",
      playerId: players[0]!.id,
      cropId: "wheat",
      quantity: 1,
    });
    expect(game.players[0]!.actionsRemaining).toBe(0);
    expect(() => act(game, {
      type: "farm_buy_seed",
      playerId: players[0]!.id,
      cropId: "wheat",
      quantity: 1,
    })).toThrow("行动点");
  });

  it("settles by net worth after the final day and exposes a document-ready view", () => {
    let game = createFarmGame({ players, seed: "final-day" });
    while (game.status === "playing") {
      game = act(game, {
        type: "farm_end_turn",
        playerId: game.currentPlayerId!,
      });
    }
    expect(game.day).toBe(FARM_FINAL_DAY);
    expect(game.winner?.reason).toBe("final_day");
    expect(game.winner?.rankings).toHaveLength(1);
    expect(() => assertRestorableFarmGameState(game)).not.toThrow();
    expect(getFarmGameView(game, players[0]!.id)).toMatchObject({
      kind: "farm",
      status: "finished",
      prompt: { type: "finished" },
    });
  });

  it("settles immediately when the player exits", () => {
    const game = createFarmGame({ players, seed: "forfeit" });
    const finished = forfeitFarmPlayer(game, players[0]!.id);
    expect(finished).toMatchObject({
      status: "finished",
      currentPlayerId: null,
      winner: {
        reason: "forfeit",
        playerIds: [players[0]!.id],
      },
    });
  });
});
