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

  it("normalizes historical duplicate log ids and allocates the next stable id", () => {
    const state = game();
    state.logs.push({ ...state.logs[0]!, text: "重复旧日志" });

    const refreshed = refreshFarmingGame(state, start);
    expect(new Set(refreshed.logs.map((entry) => entry.id)).size)
      .toBe(refreshed.logs.length);

    const next = applyFarmingAction(
      refreshed,
      { type: "farming_plant", cropId: "wheat", plotIndex: 0 },
      start,
    );
    expect(new Set(next.logs.map((entry) => entry.id)).size)
      .toBe(next.logs.length);
    expect(next.logs.at(-1)?.id).toBeGreaterThan(
      Math.max(...refreshed.logs.map((entry) => entry.id)),
    );
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

  it("uses the authoritative same-day modifier for displayed and settled prices", () => {
    let state = game();
    state.coins = 1_000;
    state.produce.wheat = 1;
    const production = {
      yieldPercent: 0,
      durationPercent: 0,
      label: "灾期市场",
      marketBuyPercent: 20,
      marketSellPercent: 25,
    };
    const baseMarketPrice = state.market.wheat.price;
    const view = getFarmingGameView(
      state,
      state.ownerId,
      start,
      production,
    );
    expect(view.crops.wheat.seedCost).toBe(
      Math.round(FARMING_CROPS.wheat.seedCost * 1.2),
    );
    expect(view.market.wheat.price).toBe(Math.round(baseMarketPrice * 1.25));

    state = applyFarmingAction(
      state,
      { type: "farming_buy_seed", cropId: "wheat", quantity: 1 },
      start,
      production,
    );
    expect(state.coins).toBe(
      1_000 - Math.round(FARMING_CROPS.wheat.seedCost * 1.2),
    );
    const beforeSale = state.coins;
    state = applyFarmingAction(
      state,
      { type: "farming_sell", cropId: "wheat", quantity: 1 },
      start + 1,
      production,
    );
    expect(state.coins - beforeSale).toBe(Math.round(baseMarketPrice * 1.25));
  });

  it("unlocks atomic batch planting and harvesting at farm level 3", () => {
    const locked = game();
    expect(() => applyFarmingAction(
      locked,
      {
        type: "farming_batch_plant",
        cropId: "wheat",
        plotIndices: [0, 1],
      },
      start,
    )).toThrow("农场达到 3 级后解锁批量播种");

    let state = game();
    state.level = 3;
    state.experience = FARMING_LEVEL_EXPERIENCE[2];
    const revision = state.revision;
    state = applyFarmingAction(
      state,
      {
        type: "farming_batch_plant",
        cropId: "wheat",
        plotIndices: [0, 1, 2],
      },
      start,
    );
    expect(state.revision).toBe(revision + 1);
    expect(state.seeds.wheat).toBe(3);
    expect(state.plots.slice(0, 3).every(({ cropId }) => cropId === "wheat"))
      .toBe(true);

    state = applyFarmingAction(
      state,
      {
        type: "farming_batch_harvest",
        plotIndices: [0, 1, 2],
      },
      start + FARMING_CROPS.wheat.growthSeconds * 1_000,
    );
    expect(state.plots.slice(0, 3).every(({ cropId }) => cropId === null))
      .toBe(true);
    expect(state.statistics.harvests).toBe(3);
    expect(state.logs.at(-1)?.text).toContain("批量收获");
  });

  it("performs one-click watering, weeding, pest control, and harvesting atomically", () => {
    let state = game();
    state.level = 3;
    state.experience = FARMING_LEVEL_EXPERIENCE[2];
    state = applyFarmingAction(
      state,
      {
        type: "farming_batch_plant",
        cropId: "wheat",
        plotIndices: [0, 1, 2],
      },
      start,
    );
    for (const plot of state.plots.slice(0, 3)) {
      plot.weedAt = start;
      plot.pestAt = start;
    }

    state = applyFarmingAction(
      state,
      { type: "farming_tend_all", care: "water" },
      start,
    );
    state = applyFarmingAction(
      state,
      { type: "farming_tend_all", care: "weed" },
      start,
    );
    state = applyFarmingAction(
      state,
      { type: "farming_tend_all", care: "pest" },
      start,
    );
    expect(state.plots.slice(0, 3).every((plot) =>
      plot.watered && plot.weedCleared && plot.pestCleared
    )).toBe(true);

    const revision = state.revision;
    state = applyFarmingAction(
      state,
      { type: "farming_harvest_all" },
      start + FARMING_CROPS.wheat.growthSeconds * 1_000,
    );
    expect(state.revision).toBe(revision + 1);
    expect(state.statistics.harvests).toBe(3);
    expect(state.plots.slice(0, 3).every(({ cropId }) => cropId === null))
      .toBe(true);
  });

  it("captures estate weather bonuses when a crop is planted", () => {
    let state = applyFarmingAction(
      game(),
      { type: "farming_plant", cropId: "wheat", plotIndex: 0 },
      start,
      { yieldPercent: 50, durationPercent: 20, label: "灾期温室抢种" },
    );
    const plot = state.plots[0]!;
    expect(plot.maturesAt! - plot.plantedAt!).toBe(
      FARMING_CROPS.wheat.growthSeconds * 1_200,
    );
    expect(plot.productionModifierLabel).toBe("灾期温室抢种");
    plot.watered = true;
    plot.weedAt = null;
    plot.pestAt = null;
    state = applyFarmingAction(
      state,
      { type: "farming_harvest", plotIndex: 0 },
      plot.maturesAt!,
    );
    expect(state.produce.wheat).toBe(
      Math.round(FARMING_CROPS.wheat.yield * 1.5),
    );
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

  it("redeems mutation collectibles through premium orders for coins and experience", () => {
    let state = game();
    state.mutations.wheat = 2;
    const price = state.market.wheat.price;

    state = applyFarmingAction(state, {
      type: "farming_redeem_mutation",
      cropId: "wheat",
      quantity: 1,
    }, start);

    expect(state.mutations.wheat).toBe(1);
    expect(state.coins).toBe(100 + price * 5);
    expect(state.experience).toBe(FARMING_CROPS.wheat.harvestExperience);
    expect(state.logs.at(-1)?.text).toContain("珍稀订单兑换");
    expect(() => applyFarmingAction(state, {
      type: "farming_redeem_mutation",
      cropId: "wheat",
      quantity: 2,
    }, start + 1)).toThrow("变异作物数量不足");
    expect(() => assertRestorableFarmingGameState(state)).not.toThrow();
  });

  it("lets the owner shovel an occupied plot without refunding its seed", () => {
    let state = game();
    state = applyFarmingAction(state, {
      type: "farming_plant",
      cropId: "wheat",
      plotIndex: 0,
    }, start);
    const seedsAfterPlanting = state.seeds.wheat;

    state = applyFarmingAction(state, {
      type: "farming_clear_plot",
      plotIndex: 0,
    }, start + 1);

    expect(state.plots[0]).toMatchObject({
      cropId: null,
      plantedAt: null,
      maturesAt: null,
    });
    expect(state.seeds.wheat).toBe(seedsAfterPlanting);
    expect(state.logs.at(-1)?.text).toContain("铲除");
    expect(() => applyFarmingAction(state, {
      type: "farming_clear_plot",
      plotIndex: 0,
    }, start + 2)).toThrow("田地当前为空");
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
