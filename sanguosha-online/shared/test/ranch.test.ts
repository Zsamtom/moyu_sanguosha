import { describe, expect, it } from "vitest";
import {
  FARMING_CROPS,
  MINE_DEPOSITS,
  RANCH_ANIMALS,
  RANCH_LEVEL_EXPERIENCE,
  RANCH_MAX_PENS,
  RANCH_PEN_EXPANSIONS,
  RanchRuleError,
  applyRanchAction,
  applyRanchVisitAction,
  assertRestorableRanchGameState,
  createFarmingGame,
  createRanchGame,
  getRanchGameView,
  getRanchNeighborSummary,
  migrateRanchCapacityState,
  refreshRanchGame,
  type RanchEconomyState,
} from "../src/index.js";

const start = Date.UTC(2026, 6, 29, 8, 0, 0);

function economy(input: Partial<RanchEconomyState> = {}): RanchEconomyState {
  const farm = createFarmingGame({
    ownerId: "farm-owner",
    ownerName: "经营者",
    seed: "farm-seed",
    now: start,
  });
  return {
    farmRevision: input.farmRevision ?? farm.revision,
    farmLevel: input.farmLevel ?? 3,
    coins: input.coins ?? 1_000,
    produce: input.produce ?? {
      ...farm.produce,
      wheat: 10,
      carrot: 10,
      corn: 10,
    },
  };
}

describe("persistent ranch engine", () => {
  it("normalizes historical duplicate log ids and allocates the next stable id", () => {
    const ranch = createRanchGame({
      ownerId: "owner",
      ownerName: "经营者",
      seed: "ranch-log-ids",
      now: start,
    });
    ranch.logs.push({ ...ranch.logs[0]!, text: "重复旧日志" });

    const refreshed = refreshRanchGame(ranch, start);
    expect(new Set(refreshed.logs.map((entry) => entry.id)).size)
      .toBe(refreshed.logs.length);
    const result = applyRanchAction(
      refreshed,
      economy({ farmLevel: 1 }),
      { type: "ranch_buy_animal", animalId: "chicken", penIndex: 0 },
      start,
    );
    expect(new Set(result.ranch.logs.map((entry) => entry.id)).size)
      .toBe(result.ranch.logs.length);
  });

  it("keeps permanent animals as multi-cycle capital investments", () => {
    for (const animal of Object.values(RANCH_ANIMALS).filter(
      ({ productionKind }) => (productionKind ?? "renewable") === "renewable",
    )) {
      const feedValue =
        FARMING_CROPS[animal.feedCropId as keyof typeof FARMING_CROPS]
          .basePrice * animal.feedAmount;
      const netCycleValue =
        animal.productPrice * animal.yield -
        feedValue -
        animal.careCost;
      expect(animal.purchaseCost / netCycleValue).toBeGreaterThanOrEqual(4);
      expect(animal.resalePrice).toBeLessThan(animal.purchaseCost);
    }
  });

  it("makes meat animals leave the pen exactly once and blocks neighbor collection", () => {
    let ranch = createRanchGame({
      ownerId: "owner",
      ownerName: "经营者",
      seed: "meat-animal",
      now: start,
    });
    ranch.experience = RANCH_LEVEL_EXPERIENCE[1]!;
    ranch.level = 2;
    let linked = economy({ farmLevel: 3, coins: 2_000 });
    let result = applyRanchAction(
      ranch,
      linked,
      { type: "ranch_buy_animal", animalId: "broiler_chicken", penIndex: 0 },
      start,
    );
    result = applyRanchAction(
      result.ranch,
      result.economy,
      { type: "ranch_feed", penIndex: 0 },
      start,
    );
    ranch = result.ranch;
    linked = result.economy;
    const readyAt = ranch.pens[0]!.producesAt!;
    expect(() => applyRanchAction(
      ranch,
      linked,
      { type: "ranch_collect", penIndex: 0 },
      readyAt,
    )).toThrowError(RanchRuleError);

    const visitor = createRanchGame({
      ownerId: "visitor",
      ownerName: "访客",
      seed: "meat-visitor",
      now: start,
    });
    expect(() => applyRanchVisitAction(
      ranch,
      visitor,
      { type: "ranch_neighbor_collect", penIndex: 0 },
      0,
      readyAt,
    )).toThrowError(RanchRuleError);

    result = applyRanchAction(
      ranch,
      linked,
      { type: "ranch_slaughter", penIndex: 0 },
      readyAt,
    );
    expect(result.ranch.products.raw_chicken).toBeGreaterThan(0);
    expect(result.ranch.pens[0]!.animalId).toBeNull();
    expect(() => applyRanchAction(
      result.ranch,
      result.economy,
      { type: "ranch_slaughter", penIndex: 0 },
      readyAt,
    )).toThrowError(RanchRuleError);
  });

  it("prices a starter chicken below one late-game gold ore", () => {
    expect(RANCH_ANIMALS.chicken.purchaseCost).toBeLessThan(
      MINE_DEPOSITS.gold.orePrice,
    );
  });

  it("opens the starter ranch on day one while retaining later animal gates", () => {
    const ranch = createRanchGame({
      ownerId: "owner",
      ownerName: "经营者",
      seed: "ranch-seed",
      now: start,
    });

    expect(getRanchGameView(ranch, {
      viewerId: "owner",
      now: start,
      farmRevision: 0,
      farmLevel: 1,
      dogLevel: 0,
      coins: 100,
      produce: economy().produce,
    }).unlocked).toBe(true);
    expect(() => applyRanchAction(
      ranch,
      economy({ farmLevel: 1 }),
      { type: "ranch_buy_animal", animalId: "chicken", penIndex: 0 },
      start,
    )).not.toThrow();
    expect(() => applyRanchAction(
      ranch,
      economy({ farmLevel: 1 }),
      { type: "ranch_buy_animal", animalId: "duck", penIndex: 0 },
      start,
    )).toThrowError(RanchRuleError);
  });

  it("uses the same market modifier in ranch cards and account settlement", () => {
    const ranch = createRanchGame({
      ownerId: "owner",
      ownerName: "经营者",
      seed: "ranch-market",
      now: start,
    });
    const production = {
      yieldPercent: 0,
      durationPercent: 0,
      label: "灾期市场",
      marketBuyPercent: 20,
      marketSellPercent: 15,
    };
    const linked = economy({ coins: 1_000, farmLevel: 1 });
    const view = getRanchGameView(ranch, {
      viewerId: "owner",
      now: start,
      farmRevision: linked.farmRevision,
      farmLevel: linked.farmLevel,
      dogLevel: 0,
      coins: linked.coins,
      produce: linked.produce,
      production,
    });
    expect(view.animals.chicken.purchaseCost).toBe(216);
    expect(view.animals.chicken.resalePrice).toBe(104);

    const bought = applyRanchAction(
      ranch,
      linked,
      { type: "ranch_buy_animal", animalId: "chicken", penIndex: 0 },
      start,
      production,
    );
    expect(bought.economy.coins).toBe(784);
    const sold = applyRanchAction(
      bought.ranch,
      bought.economy,
      { type: "ranch_sell_animal", penIndex: 0 },
      start + 1,
      production,
    );
    expect(sold.economy.coins).toBe(888);
  });

  it("links animal purchase, feed and product sales to the farm economy", () => {
    let ranch = createRanchGame({
      ownerId: "owner",
      ownerName: "经营者",
      seed: "ranch-seed",
      now: start,
    });
    let farmEconomy = economy();

    let result = applyRanchAction(
      ranch,
      farmEconomy,
      { type: "ranch_buy_animal", animalId: "chicken", penIndex: 0 },
      start,
    );
    ranch = result.ranch;
    farmEconomy = result.economy;
    expect(farmEconomy.coins).toBe(1_000 - RANCH_ANIMALS.chicken.purchaseCost);

    result = applyRanchAction(
      ranch,
      farmEconomy,
      { type: "ranch_feed", penIndex: 0 },
      start,
    );
    ranch = result.ranch;
    farmEconomy = result.economy;
    expect(farmEconomy.produce.wheat).toBe(9);
    expect(farmEconomy.coins).toBe(
      1_000 -
      RANCH_ANIMALS.chicken.purchaseCost -
      RANCH_ANIMALS.chicken.careCost,
    );

    const readyAt = start + RANCH_ANIMALS.chicken.productionSeconds * 1_000;
    result = applyRanchAction(
      ranch,
      farmEconomy,
      { type: "ranch_clean", penIndex: 0 },
      readyAt,
    );
    ranch = result.ranch;
    result = applyRanchAction(
      ranch,
      result.economy,
      { type: "ranch_collect", penIndex: 0 },
      readyAt,
    );
    ranch = result.ranch;
    expect(ranch.products.egg).toBe(RANCH_ANIMALS.chicken.yield);

    result = applyRanchAction(
      ranch,
      result.economy,
      { type: "ranch_sell", productId: "egg", quantity: 2 },
      readyAt,
    );
    expect(result.ranch.products.egg).toBe(1);
    expect(result.economy.coins).toBe(
      1_000 -
      RANCH_ANIMALS.chicken.purchaseCost +
      RANCH_ANIMALS.chicken.productPrice * 2 -
      RANCH_ANIMALS.chicken.careCost,
    );
  });

  it("cleans and collects every eligible pen in one revision", () => {
    let ranch = createRanchGame({
      ownerId: "owner",
      ownerName: "经营者",
      seed: "ranch-batch",
      now: start,
    });
    let linked = economy();
    for (const penIndex of [0, 1]) {
      let result = applyRanchAction(
        ranch,
        linked,
        { type: "ranch_buy_animal", animalId: "chicken", penIndex },
        start,
      );
      result = applyRanchAction(
        result.ranch,
        result.economy,
        { type: "ranch_feed", penIndex },
        start,
      );
      ranch = result.ranch;
      linked = result.economy;
    }
    const readyAt = start + RANCH_ANIMALS.chicken.productionSeconds * 1_000;
    const beforeCleanRevision = ranch.revision;
    let result = applyRanchAction(
      ranch,
      linked,
      { type: "ranch_clean_all" },
      readyAt,
    );
    expect(result.ranch.revision).toBe(beforeCleanRevision + 1);
    expect(result.ranch.pens.slice(0, 2).every(({ messCleaned }) => messCleaned))
      .toBe(true);

    const beforeCollectRevision = result.ranch.revision;
    result = applyRanchAction(
      result.ranch,
      result.economy,
      { type: "ranch_collect_all" },
      readyAt,
    );
    expect(result.ranch.revision).toBe(beforeCollectRevision + 1);
    expect(result.ranch.products.egg).toBe(RANCH_ANIMALS.chicken.yield * 2);
    expect(result.ranch.pens.slice(0, 2).every(({ fedAt }) => fedAt === null))
      .toBe(true);
  });

  it("captures disaster-time production bonuses when feeding starts", () => {
    let ranch = createRanchGame({
      ownerId: "owner",
      ownerName: "经营者",
      seed: "ranch-weather",
      now: start,
    });
    let linked = economy();
    let result = applyRanchAction(
      ranch,
      linked,
      { type: "ranch_buy_animal", animalId: "chicken", penIndex: 0 },
      start,
    );
    result = applyRanchAction(
      result.ranch,
      result.economy,
      { type: "ranch_feed", penIndex: 0 },
      start + 1,
      { yieldPercent: 50, durationPercent: -20, label: "强化营养" },
    );
    ranch = result.ranch;
    linked = result.economy;
    const pen = ranch.pens[0]!;
    expect(pen.producesAt! - pen.fedAt!).toBe(
      RANCH_ANIMALS.chicken.productionSeconds * 800,
    );
    pen.messAt = null;
    result = applyRanchAction(
      ranch,
      linked,
      { type: "ranch_collect", penIndex: 0 },
      pen.producesAt!,
    );
    expect(result.ranch.products.egg).toBe(
      Math.round(RANCH_ANIMALS.chicken.yield * 1.5),
    );
  });

  it("moves idle animals between pens and sells them back at the resale price", () => {
    const ranch = createRanchGame({
      ownerId: "owner",
      ownerName: "经营者",
      seed: "ranch-seed",
      now: start,
    });
    let result = applyRanchAction(
      ranch,
      economy(),
      { type: "ranch_buy_animal", animalId: "chicken", penIndex: 0 },
      start,
    );

    result = applyRanchAction(
      result.ranch,
      result.economy,
      { type: "ranch_move_animal", fromPenIndex: 0, toPenIndex: 1 },
      start + 1,
    );
    expect(result.ranch.pens[0]!.animalId).toBeNull();
    expect(result.ranch.pens[1]!.animalId).toBe("chicken");

    result = applyRanchAction(
      result.ranch,
      result.economy,
      { type: "ranch_sell_animal", penIndex: 1 },
      start + 2,
    );
    expect(result.ranch.pens[1]!.animalId).toBeNull();
    expect(result.economy.coins).toBe(
      1_000 -
      RANCH_ANIMALS.chicken.purchaseCost +
      RANCH_ANIMALS.chicken.resalePrice,
    );
  });

  it("keeps producing animals in their pen until products are collected", () => {
    let result = applyRanchAction(
      createRanchGame({
        ownerId: "owner",
        ownerName: "经营者",
        seed: "ranch-seed",
        now: start,
      }),
      economy(),
      { type: "ranch_buy_animal", animalId: "chicken", penIndex: 0 },
      start,
    );
    result = applyRanchAction(
      result.ranch,
      result.economy,
      { type: "ranch_feed", penIndex: 0 },
      start,
    );

    expect(() => applyRanchAction(
      result.ranch,
      result.economy,
      { type: "ranch_move_animal", fromPenIndex: 0, toPenIndex: 1 },
      start + 1,
    )).toThrow("生产中的动物不能移动");
    expect(() => applyRanchAction(
      result.ranch,
      result.economy,
      { type: "ranch_sell_animal", penIndex: 0 },
      start + 1,
    )).toThrow("生产中的动物不能出售");
  });

  it("reduces an unattended production cycle by one product", () => {
    let ranch = createRanchGame({
      ownerId: "owner",
      ownerName: "经营者",
      seed: "ranch-seed",
      now: start,
    });
    let result = applyRanchAction(
      ranch,
      economy(),
      { type: "ranch_buy_animal", animalId: "chicken", penIndex: 0 },
      start,
    );
    result = applyRanchAction(
      result.ranch,
      result.economy,
      { type: "ranch_feed", penIndex: 0 },
      start,
    );
    ranch = applyRanchAction(
      result.ranch,
      result.economy,
      { type: "ranch_collect", penIndex: 0 },
      start + RANCH_ANIMALS.chicken.productionSeconds * 1_000,
    ).ranch;

    expect(ranch.products.egg).toBe(RANCH_ANIMALS.chicken.yield - 1);
  });

  it("supports neighbor cleaning and one bounded product collection", () => {
    let owner = createRanchGame({
      ownerId: "owner",
      ownerName: "主人",
      seed: "owner-ranch",
      now: start,
    });
    let visitor = createRanchGame({
      ownerId: "visitor",
      ownerName: "访客",
      seed: "visitor-ranch",
      now: start,
    });
    let result = applyRanchAction(
      owner,
      economy(),
      { type: "ranch_buy_animal", animalId: "chicken", penIndex: 0 },
      start,
    );
    result = applyRanchAction(
      result.ranch,
      result.economy,
      { type: "ranch_feed", penIndex: 0 },
      start,
    );
    owner = result.ranch;
    const readyAt = start + RANCH_ANIMALS.chicken.productionSeconds * 1_000;

    const helped = applyRanchVisitAction(
      owner,
      visitor,
      { type: "ranch_help", penIndex: 0 },
      0,
      readyAt,
    );
    owner = helped.owner;
    visitor = helped.visitor;
    expect(helped.outcome).toBe("helped");

    const collected = applyRanchVisitAction(
      owner,
      visitor,
      { type: "ranch_neighbor_collect", penIndex: 0 },
      0,
      readyAt,
    );
    expect(collected.outcome).toBe("collected");
    expect(collected.visitor.products.egg).toBe(1);
    expect(collected.owner.pens[0]!.taken).toBe(1);
    expect(() => applyRanchVisitAction(
      collected.owner,
      collected.visitor,
      { type: "ranch_neighbor_collect", penIndex: 0 },
      0,
      readyAt,
    )).toThrowError(RanchRuleError);
  });

  it("projects private inventory only to the owner and summarizes neighbors", () => {
    const ranch = createRanchGame({
      ownerId: "owner",
      ownerName: "主人",
      seed: "ranch-seed",
      now: start,
    });
    const farmEconomy = economy();

    expect(getRanchGameView(ranch, {
      viewerId: "visitor",
      now: start,
      farmRevision: 0,
      farmLevel: 3,
      dogLevel: 0,
    }).economy).toBeNull();
    expect(getRanchNeighborSummary(ranch, "visitor", start)).toMatchObject({
      ownerId: "owner",
      readyPens: 0,
    });
  });

  it("strictly validates restorable ranch saves", () => {
    const ranch = createRanchGame({
      ownerId: "owner",
      ownerName: "主人",
      seed: "ranch-seed",
      now: start,
    });
    expect(() => assertRestorableRanchGameState(ranch)).not.toThrow();
    expect(() => assertRestorableRanchGameState({
      ...ranch,
      products: { ...ranch.products, egg: -1 },
    })).toThrow("牧场主状态无效");
  });

  it("migrates v1 capacity saves to 12 pens without changing old pens or revision", () => {
    const ranch = createRanchGame({
      ownerId: "owner",
      ownerName: "主人",
      seed: "ranch-capacity-migration",
      now: start,
    });
    ranch.unlockedPens = 8;
    ranch.revision = 23;
    ranch.experience = 4_998;
    ranch.level = 10;
    ranch.pens[7]!.cycle = 4;
    const legacy = {
      ...ranch,
      version: 1,
      pens: ranch.pens.slice(0, 8),
    } as unknown;

    const migrated = migrateRanchCapacityState(legacy);

    expect(migrated).toMatchObject({
      version: 2,
      revision: 23,
      level: 13,
      unlockedPens: 8,
    });
    expect(migrated.pens).toHaveLength(RANCH_MAX_PENS);
    expect(migrated.pens[7]).toMatchObject({ index: 7, cycle: 4 });
    expect(migrated.pens[8]).toMatchObject({ index: 8, animalId: null });
    expect(migrated.pens[11]).toMatchObject({ index: 11, animalId: null });
    expect(RANCH_LEVEL_EXPERIENCE).toHaveLength(14);
    expect(RANCH_PEN_EXPANSIONS.at(-1)).toEqual({
      penIndex: 11,
      requiredFarmLevel: 19,
      requiredRanchLevel: 14,
      coinCost: 8_100,
    });
    expect(() => assertRestorableRanchGameState(migrated)).not.toThrow();
  });
});
