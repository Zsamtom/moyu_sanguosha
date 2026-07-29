import { describe, expect, it } from "vitest";
import {
  FARMING_CROPS,
  FARMING_LEVEL_EXPERIENCE,
  FarmingRuleError,
  applyFarmingAction,
  applyFarmingVisitAction,
  assertRestorableFarmingGameState,
  createFarmingGame,
  migrateLegacyFarmGame,
  getFarmingGameView,
  getFarmingNeighborSummary,
  refreshFarmingGame,
  type FarmingGameState,
} from "../src/farming.js";
import {
  applyFarmAction,
  createFarmGame,
} from "../src/farm.js";

const start = Date.UTC(2026, 6, 29, 8, 0, 0);

function game(ownerId = "farmer-1", ownerName = "经营者一"): FarmingGameState {
  return createFarmingGame({
    ownerId,
    ownerName,
    seed: `seed-${ownerId}`,
    now: start,
  });
}

describe("real-time farming engine", () => {
  it("creates six unlocked plots, starter crops, and a restorable account save", () => {
    const state = game();
    expect(state).toMatchObject({
      version: 2,
      level: 1,
      unlockedPlots: 6,
      coins: 100,
      seeds: {
        wheat: 6,
        carrot: 3,
      },
    });
    expect(state.plots).toHaveLength(12);
    expect(() => assertRestorableFarmingGameState(state)).not.toThrow();
  });

  it("grows crops from server time while the player is offline", () => {
    let state = game();
    state = applyFarmingAction(state, {
      type: "farming_plant",
      cropId: "wheat",
      plotIndex: 0,
    }, start);

    const before = getFarmingGameView(state, state.ownerId, start + 60_000);
    const matureAt = start + FARMING_CROPS.wheat.growthSeconds * 1_000;
    const after = getFarmingGameView(state, state.ownerId, matureAt);

    expect(before.plots[0]).toMatchObject({ ready: false });
    expect(before.plots[0]!.progress).toBeGreaterThan(0);
    expect(after.plots[0]).toMatchObject({ ready: true, progress: 1 });
  });

  it("rewards care, harvest experience, levels, and crop unlocks", () => {
    let state = game();
    const matureAt = start + FARMING_CROPS.wheat.growthSeconds * 1_000;
    for (let plotIndex = 0; plotIndex < 6; plotIndex += 1) {
      state = applyFarmingAction(state, {
        type: "farming_plant",
        cropId: "wheat",
        plotIndex,
      }, start);
      state = applyFarmingAction(state, {
        type: "farming_tend",
        care: "water",
        plotIndex,
      }, start);
    }
    for (let plotIndex = 0; plotIndex < 6; plotIndex += 1) {
      const plot = getFarmingGameView(state, state.ownerId, matureAt).plots[plotIndex]!;
      if (plot.hasWeeds) {
        state = applyFarmingAction(state, {
          type: "farming_tend",
          care: "weed",
          plotIndex,
        }, matureAt);
      }
      if (plot.hasPests) {
        state = applyFarmingAction(state, {
          type: "farming_tend",
          care: "pest",
          plotIndex,
        }, matureAt);
      }
      state = applyFarmingAction(state, {
        type: "farming_harvest",
        plotIndex,
      }, matureAt);
    }

    expect(state.level).toBeGreaterThanOrEqual(2);
    expect(state.produce.wheat).toBe(18);
    expect(() => applyFarmingAction(state, {
      type: "farming_buy_seed",
      cropId: "tomato",
      quantity: 1,
    }, matureAt)).not.toThrow();
  });

  it("reduces yield when water, weeds, and pests are neglected", () => {
    let state = game();
    state = applyFarmingAction(state, {
      type: "farming_plant",
      cropId: "wheat",
      plotIndex: 0,
    }, start);
    state.plots[0]!.weedAt = start;
    state.plots[0]!.pestAt = start;
    const matureAt = state.plots[0]!.maturesAt!;

    state = applyFarmingAction(state, {
      type: "farming_harvest",
      plotIndex: 0,
    }, matureAt);

    expect(state.produce.wheat).toBe(1);
  });

  it("opens permanent land expansions only after level and coin requirements", () => {
    let state = game();
    expect(() => applyFarmingAction(state, {
      type: "farming_expand_plot",
    }, start)).toThrow(FarmingRuleError);

    state.experience = FARMING_LEVEL_EXPERIENCE[2];
    state.level = 3;
    state.coins = 500;
    state = applyFarmingAction(state, {
      type: "farming_expand_plot",
    }, start);

    expect(state.unlockedPlots).toBe(7);
    expect(state.coins).toBe(380);
    expect(() => assertRestorableFarmingGameState(state)).not.toThrow();
  });

  it("supports friend help and bounded one-attempt stealing", () => {
    let owner = game("owner", "田主");
    let visitor = game("visitor", "农友");
    owner = applyFarmingAction(owner, {
      type: "farming_plant",
      cropId: "wheat",
      plotIndex: 0,
    }, start);
    const helped = applyFarmingVisitAction(owner, visitor, {
      type: "farming_help",
      care: "water",
      plotIndex: 0,
    }, start);
    owner = helped.owner;
    visitor = helped.visitor;
    const matureAt = owner.plots[0]!.maturesAt!;

    const stolen = applyFarmingVisitAction(owner, visitor, {
      type: "farming_steal",
      plotIndex: 0,
    }, matureAt);
    owner = stolen.owner;
    visitor = stolen.visitor;

    expect(stolen.outcome).toBe("stolen");
    expect(visitor.produce.wheat).toBe(1);
    expect(owner.plots[0]!.stolen).toBe(1);
    expect(() => applyFarmingVisitAction(owner, visitor, {
      type: "farming_steal",
      plotIndex: 0,
    }, matureAt)).toThrow("已经尝试");

    owner = applyFarmingAction(owner, {
      type: "farming_harvest",
      plotIndex: 0,
    }, matureAt);
    expect(owner.produce.wheat).toBe(2);
  });

  it("publishes daily deterministic prices and resets social quotas", () => {
    const state = game();
    state.dailySocial = {
      dayKey: state.marketDay,
      helps: 4,
      steals: 3,
    };
    const nextDay = start + 24 * 60 * 60 * 1_000;
    const first = refreshFarmingGame(state, nextDay);
    const second = refreshFarmingGame(state, nextDay);

    expect(first.marketDay).not.toBe(state.marketDay);
    expect(first.dailySocial).toMatchObject({ helps: 0, steals: 0 });
    expect(second).toEqual(first);
  });

  it("provides public neighbor summaries without private inventory", () => {
    let owner = game("owner", "田主");
    owner = applyFarmingAction(owner, {
      type: "farming_plant",
      cropId: "wheat",
      plotIndex: 0,
    }, start);
    owner = applyFarmingAction(owner, {
      type: "farming_tend",
      care: "water",
      plotIndex: 0,
    }, start);
    const matureAt = owner.plots[0]!.maturesAt!;
    const maturePlot = getFarmingGameView(owner, owner.ownerId, matureAt).plots[0]!;
    if (maturePlot.hasWeeds) {
      owner = applyFarmingAction(owner, {
        type: "farming_tend",
        care: "weed",
        plotIndex: 0,
      }, matureAt);
    }
    if (maturePlot.hasPests) {
      owner = applyFarmingAction(owner, {
        type: "farming_tend",
        care: "pest",
        plotIndex: 0,
      }, matureAt);
    }

    const publicView = getFarmingGameView(owner, "visitor", matureAt);
    const summary = getFarmingNeighborSummary(owner, "visitor", matureAt);

    expect(publicView.inventory).toBeNull();
    expect(publicView.statistics).toBeNull();
    expect(summary).toMatchObject({
      ownerId: "owner",
      readyPlots: 1,
      stealablePlots: 1,
    });
    expect(getFarmingNeighborSummary(owner, "owner", matureAt)).toBeNull();
  });

  it("migrates legacy cycle saves without dropping money, inventory, or field progress", () => {
    let legacy = createFarmGame({
      players: [{ id: "legacy-owner", name: "老农友" }],
      seed: "legacy-seed",
    });
    legacy = applyFarmAction(legacy, {
      type: "farm_plant",
      playerId: "legacy-owner",
      cropId: "tomato",
      plotIndex: 0,
    });
    legacy = applyFarmAction(legacy, {
      type: "farm_buy_seed",
      playerId: "legacy-owner",
      cropId: "wheat",
      quantity: 2,
    });

    const migrated = migrateLegacyFarmGame(legacy, start);

    expect(migrated).toMatchObject({
      version: 2,
      ownerId: "legacy-owner",
      ownerName: "老农友",
      coins: legacy.players[0]!.coins,
    });
    expect(migrated.seeds.wheat).toBe(legacy.players[0]!.seeds.wheat);
    expect(migrated.plots[0]).toMatchObject({
      cropId: "tomato",
      watered: false,
    });
    expect(migrated.discoveredCrops).toEqual(
      expect.arrayContaining(["wheat", "carrot", "tomato"]),
    );
    expect(() => assertRestorableFarmingGameState(migrated)).not.toThrow();
  });
});
