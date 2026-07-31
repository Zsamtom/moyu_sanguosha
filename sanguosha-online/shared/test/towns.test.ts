import { describe, expect, it } from "vitest";
import {
  ESTATE_TOWN_IDS,
  FARMING_CROP_IDS,
  FROSTPEAK_ANIMAL_IDS,
  FROSTPEAK_CROP_IDS,
  FROSTPEAK_DEPOSIT_IDS,
  FROSTPEAK_FARM_CROPS,
  FROSTPEAK_MINE_DEPOSITS,
  FROSTPEAK_PRODUCT_IDS,
  FROSTPEAK_RANCH_ANIMALS,
  MINE_DEPOSIT_IDS,
  PLANNED_TOWN_IDS,
  RANCH_ANIMAL_IDS,
  TOWN_DEFINITIONS,
  applyFarmingAction,
  applyMineAction,
  applyRanchAction,
  assertRestorableFarmingGameState,
  assertRestorableMineGameState,
  assertRestorableRanchGameState,
  createFarmingGame,
  createMineGame,
  createRanchGame,
  getFarmingGameView,
  getMineGameView,
  getRanchGameView,
  getTownRoute,
  type MineLinkedEconomy,
  type RanchEconomyState,
} from "../src/index.js";

const start = Date.UTC(2026, 6, 30, 8, 0, 0);

describe("modular estate town catalog", () => {
  it("publishes two playable towns, keeps planned towns out of runtime state, and defines symmetric travel", () => {
    expect(ESTATE_TOWN_IDS).toEqual(["greenvale", "frostpeak"]);
    expect(PLANNED_TOWN_IDS).toEqual(["tidal_harbor", "redrock"]);
    expect(Object.keys(TOWN_DEFINITIONS)).toEqual(["greenvale", "frostpeak"]);

    const outbound = getTownRoute("greenvale", "frostpeak");
    const inbound = getTownRoute("frostpeak", "greenvale");
    expect(outbound).toMatchObject({
      mode: "rail",
      coinFare: 120,
    });
    expect(inbound).toEqual(outbound);
    expect(getTownRoute("greenvale", "greenvale")).toBeNull();
  });

  it("uses one complete farm engine while exposing only the active town crop catalog", () => {
    let frostFarm = createFarmingGame({
      ownerId: "frost-farmer",
      ownerName: "霜岭庄主",
      seed: "frost-farm-seed",
      now: start,
      townId: "frostpeak",
    });
    const view = getFarmingGameView(frostFarm, frostFarm.ownerId, start);

    expect(view.townId).toBe("frostpeak");
    expect(view.townDefinition.id).toBe("frostpeak");
    expect(Object.keys(view.crops)).toEqual(FROSTPEAK_CROP_IDS);
    expect(Object.keys(view.crops)).not.toContain(FARMING_CROP_IDS[0]);
    expect(frostFarm.seeds.frost_barley).toBe(6);
    expect(frostFarm.seeds.snow_potato).toBe(3);

    frostFarm = applyFarmingAction(
      frostFarm,
      { type: "farming_plant", cropId: "frost_barley", plotIndex: 0 },
      start,
    );
    expect(frostFarm.plots[0]?.cropId).toBe("frost_barley");
    expect(() => applyFarmingAction(
      frostFarm,
      { type: "farming_buy_seed", cropId: "wheat", quantity: 1 },
      start,
    )).toThrow();
  });

  it("uses the same complete ranch and mine engines with frostpeak products", () => {
    const frostFarm = createFarmingGame({
      ownerId: "frost-owner",
      ownerName: "霜岭庄主",
      seed: "frost-farm",
      now: start,
      townId: "frostpeak",
    });
    frostFarm.produce.frost_barley = 10;
    frostFarm.produce.snow_potato = 10;

    let frostRanch = createRanchGame({
      ownerId: frostFarm.ownerId,
      ownerName: frostFarm.ownerName,
      seed: "frost-ranch",
      now: start,
      townId: "frostpeak",
    });
    const ranchEconomy: RanchEconomyState = {
      farmRevision: frostFarm.revision,
      farmLevel: 1,
      coins: 1_000,
      produce: frostFarm.produce,
    };
    const bought = applyRanchAction(
      frostRanch,
      ranchEconomy,
      { type: "ranch_buy_animal", animalId: "snow_chicken", penIndex: 0 },
      start,
    );
    frostRanch = applyRanchAction(
      bought.ranch,
      bought.economy,
      { type: "ranch_feed", penIndex: 0 },
      start,
    ).ranch;
    const ranchView = getRanchGameView(frostRanch, {
      viewerId: frostFarm.ownerId,
      now: start,
      farmRevision: frostFarm.revision,
      farmLevel: 1,
      dogLevel: 0,
      coins: 1_000,
      produce: frostFarm.produce,
    });
    expect(ranchView.townId).toBe("frostpeak");
    expect(Object.keys(ranchView.animals)).toEqual(FROSTPEAK_ANIMAL_IDS);
    expect(Object.keys(ranchView.animals)).not.toContain(RANCH_ANIMAL_IDS[0]);

    frostRanch.products.snow_egg = 10;
    frostRanch.products.angora_fur = 10;
    const frostMine = createMineGame({
      ownerId: frostFarm.ownerId,
      ownerName: frostFarm.ownerName,
      seed: "frost-mine",
      now: start,
      townId: "frostpeak",
    });
    const mineEconomy: MineLinkedEconomy = {
      farmRevision: frostFarm.revision,
      farmLevel: 1,
      coins: 2_000,
      farmProduce: frostFarm.produce,
      ranchRevision: frostRanch.revision,
      ranchLevel: 1,
      ranchProducts: frostRanch.products,
    };
    const started = applyMineAction(
      frostMine,
      mineEconomy,
      { type: "mine_start", depositId: "lignite", shaftIndex: 0 },
      start,
    );
    const mineView = getMineGameView(started.mine, started.economy, start);
    expect(mineView.townId).toBe("frostpeak");
    expect(Object.keys(mineView.deposits)).toEqual(FROSTPEAK_DEPOSIT_IDS);
    expect(Object.keys(mineView.deposits)).not.toContain(MINE_DEPOSIT_IDS[0]);
  });

  it("keeps every frostpeak primary loop economically gated", () => {
    expect(Object.values(FROSTPEAK_FARM_CROPS).every((crop) =>
      crop.seedCost > 0 && crop.growthSeconds > 0
    )).toBe(true);
    expect(Object.values(FROSTPEAK_RANCH_ANIMALS).every((animal) =>
      animal.purchaseCost > 0 && animal.feedAmount > 0 &&
      animal.productionSeconds > 0 &&
      animal.resalePrice < animal.purchaseCost &&
      FROSTPEAK_CROP_IDS.includes(
        animal.feedCropId as (typeof FROSTPEAK_CROP_IDS)[number],
      )
    )).toBe(true);
    for (const animal of Object.values(FROSTPEAK_RANCH_ANIMALS)) {
      const feedValue =
        FROSTPEAK_FARM_CROPS[
          animal.feedCropId as keyof typeof FROSTPEAK_FARM_CROPS
        ].basePrice * animal.feedAmount;
      const netCycleValue =
        animal.productPrice * animal.yield -
        feedValue -
        animal.careCost;
      expect(animal.purchaseCost / netCycleValue)
        .toBeGreaterThanOrEqual(6);
    }
    expect(Object.values(FROSTPEAK_MINE_DEPOSITS).every((deposit) =>
      deposit.expeditionCost > 0 && deposit.rationAmount > 0 &&
      deposit.supportAmount > 0 && deposit.durationSeconds > 0 &&
      FROSTPEAK_PRODUCT_IDS.includes(
        deposit.rationProductId as (typeof FROSTPEAK_PRODUCT_IDS)[number],
      ) &&
      FROSTPEAK_PRODUCT_IDS.includes(
        deposit.supportProductId as (typeof FROSTPEAK_PRODUCT_IDS)[number],
      )
    )).toBe(true);
  });

  it("rejects cross-town inventory contamination in restorable saves", () => {
    const farm = createFarmingGame({
      ownerId: "frost-owner",
      ownerName: "霜岭庄主",
      seed: "frost-farm",
      now: start,
      townId: "frostpeak",
    });
    const ranch = createRanchGame({
      ownerId: farm.ownerId,
      ownerName: farm.ownerName,
      seed: "frost-ranch",
      now: start,
      townId: "frostpeak",
    });
    const mine = createMineGame({
      ownerId: farm.ownerId,
      ownerName: farm.ownerName,
      seed: "frost-mine",
      now: start,
      townId: "frostpeak",
    });

    (farm.seeds as Record<string, number>).wheat = 1;
    (ranch.products as Record<string, number>).egg = 1;
    (mine.ores as Record<string, number>).coal = 1;

    expect(() => assertRestorableFarmingGameState(farm)).toThrow();
    expect(() => assertRestorableRanchGameState(ranch)).toThrow();
    expect(() => assertRestorableMineGameState(mine)).toThrow();
  });

  it("accepts legacy saves without townId and normalizes them to greenvale", () => {
    const farm = createFarmingGame({
      ownerId: "legacy-owner",
      ownerName: "旧档庄主",
      seed: "legacy-farm",
      now: start,
    });
    const ranch = createRanchGame({
      ownerId: farm.ownerId,
      ownerName: farm.ownerName,
      seed: "legacy-ranch",
      now: start,
    });
    const mine = createMineGame({
      ownerId: farm.ownerId,
      ownerName: farm.ownerName,
      seed: "legacy-mine",
      now: start,
    });
    delete (farm as Partial<typeof farm>).townId;
    delete (ranch as Partial<typeof ranch>).townId;
    delete (mine as Partial<typeof mine>).townId;

    expect(() => assertRestorableFarmingGameState(farm)).not.toThrow();
    expect(() => assertRestorableRanchGameState(ranch)).not.toThrow();
    expect(() => assertRestorableMineGameState(mine)).not.toThrow();
    expect(getFarmingGameView(farm, farm.ownerId, start).townId)
      .toBe("greenvale");
    expect(getRanchGameView(ranch, {
      viewerId: ranch.ownerId,
      now: start,
      farmRevision: 0,
      farmLevel: 1,
      dogLevel: 0,
    }).townId).toBe("greenvale");
    expect(getMineGameView(mine, {
      farmRevision: 0,
      farmLevel: 1,
      coins: 0,
      farmProduce: farm.produce,
      ranchRevision: 0,
      ranchLevel: 1,
      ranchProducts: ranch.products,
    }, start).townId).toBe("greenvale");
  });
});
