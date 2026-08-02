import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  FARMING_CROPS,
  MINE_DEPOSITS,
  RANCH_ANIMALS,
  applyFarmAction,
  createEstateAccount,
  createFarmGame,
  createFarmingGame,
  createHomesteadGame,
  createMineGame,
  createRanchGame,
  TOWN_DEFINITIONS,
  type EstateAccountState,
  type FarmingGameState,
  type FarmingMarketDecision,
  type HomesteadGameState,
  type MineGameState,
  type RanchGameState,
} from "@sanguosha/shared";
import {
  BotDecisionRegistry,
  type BotDecisionProvider,
} from "./bots/decision-registry.js";
import {
  FarmService,
  MemoryFarmStateStore,
  PostgresFarmStateStore,
  type TownEstateBundle,
} from "./farm-service.js";
import {
  TOWN_WEATHER_ANCHORS,
  TownWeatherService,
  type TownWeatherDisasterMechanicId,
  type TownWeatherProviderResult,
  type TownWeatherSnapshot,
} from "./town-weather.js";
import type { PublicUser } from "./users.js";

const start = Date.UTC(2026, 6, 29, 8, 0, 0);
const user: PublicUser = {
  id: "8d177137-f16b-48ea-b5d4-280d40cd1b30",
  username: "farmer",
  displayName: "经营者",
  role: "player",
  disabled: false,
  mustChangePassword: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const neighbor: PublicUser = {
  ...user,
  id: "49a2690d-79ce-42e5-a9de-f076cd82de21",
  username: "neighbor",
  displayName: "农友",
};

function ranchReadyFarm(owner: PublicUser): FarmingGameState {
  const farm = createFarmingGame({
    ownerId: owner.id,
    ownerName: owner.displayName,
    seed: `farm-${owner.id}`,
    now: start,
  });
  farm.experience = 100;
  farm.level = 3;
  farm.coins = 2_000;
  farm.produce.wheat = 10;
  farm.produce.carrot = 10;
  farm.produce.corn = 10;
  return farm;
}

function mineReadyFarm(owner: PublicUser): FarmingGameState {
  const farm = ranchReadyFarm(owner);
  farm.experience = 400;
  farm.level = 6;
  farm.coins = 5_000;
  return farm;
}

function mineReadyRanch(owner: PublicUser): RanchGameState {
  const ranch = createRanchGame({
    ownerId: owner.id,
    ownerName: owner.displayName,
    seed: `ranch-${owner.id}`,
    now: start,
  });
  ranch.experience = 120;
  ranch.level = 3;
  ranch.products.egg = 10;
  ranch.products.rabbit_fur = 10;
  return ranch;
}

function townEstateBundle(
  owner: PublicUser,
  townId: "greenvale" | "frostpeak" = "greenvale",
): TownEstateBundle {
  return {
    kind: "town_estate_bundle",
    version: 1,
    townId,
    contentVersion: TOWN_DEFINITIONS[townId].contentVersion,
    farm: createFarmingGame({
      ownerId: owner.id,
      ownerName: owner.displayName,
      seed: `${townId}-weather-farm`,
      now: start,
      townId,
    }),
    ranch: createRanchGame({
      ownerId: owner.id,
      ownerName: owner.displayName,
      seed: `${townId}-weather-ranch`,
      now: start,
      townId,
    }),
    mine: createMineGame({
      ownerId: owner.id,
      ownerName: owner.displayName,
      seed: `${townId}-weather-mine`,
      now: start,
      townId,
    }),
    homestead: createHomesteadGame({
      ownerId: owner.id,
      ownerName: owner.displayName,
      seed: `${townId}-weather-homestead`,
      now: start,
      townId,
    }),
  };
}

function liveWeatherSnapshot(input: {
  townId?: "greenvale" | "frostpeak";
  validFrom?: number;
  providerAlertId?: string;
  mechanicId?: TownWeatherDisasterMechanicId;
} = {}): TownWeatherSnapshot {
  const townId = input.townId ?? "greenvale";
  const validFrom = input.validFrom ?? start;
  const mechanicId = input.mechanicId ?? "cold_snap";
  return {
    townId,
    anchor: TOWN_WEATHER_ANCHORS[townId],
    bucketKey: `${townId}:${new Date(validFrom).toISOString()}`,
    validFrom,
    validUntil: validFrom + 8 * 60 * 60 * 1_000,
    fetchedAt: validFrom,
    provider: "qweather",
    source: "qweather",
    stale: false,
    mechanicsEnabled: true,
    weatherId: "clear",
    observation: {
      conditionCode: "100",
      conditionText: "晴",
      observedAt: validFrom,
      temperatureC: 18,
      feelsLikeC: 18,
      humidityPercent: 45,
      precipitationMm: 0,
      windSpeedKph: 8,
      visibilityKm: 20,
    },
    alertsAvailable: true,
    disasters: [{
      providerAlertId: input.providerAlertId ?? "weather-alert-1",
      eventCode: "test-alert",
      eventName: "寒潮",
      headline: "寒潮预警",
      description: "测试天气灾害",
      instruction: null,
      senderName: "测试气象台",
      messageType: "alert",
      severity: 2,
      certainty: "likely",
      urgency: "expected",
      colorCode: "orange",
      issuedAt: validFrom,
      effectiveAt: validFrom,
      expiresAt: validFrom + 24 * 60 * 60 * 1_000,
      mechanicId,
      mechanicLabel: "测试灾害",
      affectsGameplay: true,
    }],
    attributions: ["QWeather"],
    fallbackReason: null,
  };
}

describe("real-time FarmService", () => {
  it("reuses the advisory-lock connection for all store work", async () => {
    const query = vi.fn(async (text: string) => ({
      rows: text.includes("SELECT state") ? [] : [],
    }));
    const release = vi.fn();
    const connect = vi.fn(async () => ({ query, release }));
    const pool = {
      connect,
      query: vi.fn(() => {
        throw new Error("store work escaped the advisory-lock client");
      }),
    } as unknown as Pool;
    const store = new PostgresFarmStateStore(pool);
    const first = createFarmingGame({
      ownerId: user.id,
      ownerName: user.displayName,
      seed: "lock-first",
      now: start,
    });
    const second = createFarmingGame({
      ownerId: neighbor.id,
      ownerName: neighbor.displayName,
      seed: "lock-second",
      now: start,
    });

    await store.withUserLocks(
      [neighbor.id, user.id],
      async () => {
        await store.list(10);
        await store.savePair(
          user.id,
          first,
          neighbor.id,
          second,
        );
      },
    );

    expect(connect).toHaveBeenCalledTimes(1);
    expect(pool.query).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
    const lockCalls = query.mock.calls.filter(
      ([text]) => text.includes("pg_advisory_lock"),
    );
    expect(lockCalls.map(([, values]) => values?.[0])).toEqual([
      `estate:${neighbor.id}`,
      `estate:${user.id}`,
    ].sort());
    expect(query.mock.calls.some(
      ([text]) => text === "BEGIN",
    )).toBe(true);
    expect(query.mock.calls.some(
      ([text]) => text === "COMMIT",
    )).toBe(true);
  });

  it("creates and restores one long-running account farm", async () => {
    const store = new MemoryFarmStateStore();
    const registry = new BotDecisionRegistry();
    const firstService = new FarmService(store, registry, () => start);
    const initial = await firstService.getOrCreate(user);
    const changed = await firstService.applyAction(user, initial.farm.revision, {
      type: "farming_buy_seed",
      cropId: "wheat",
      quantity: 1,
    });
    expect(changed).not.toHaveProperty("neighbors");

    const restored = await new FarmService(store, registry, () => start).getOrCreate(user);
    expect(restored.farm).toEqual(changed.farm);
    expect(restored.farm).toMatchObject({
      version: 2,
      inventory: {
        coins: initial.farm.inventory!.coins - FARMING_CROPS.wheat.seedCost,
      },
    });
  });

  it("migrates a legacy cycle save on first access", async () => {
    const store = new MemoryFarmStateStore();
    let legacy = createFarmGame({
      players: [{ id: user.id, name: user.displayName }],
      seed: "legacy-service",
    });
    legacy = applyFarmAction(legacy, {
      type: "farm_plant",
      playerId: user.id,
      cropId: "tomato",
      plotIndex: 0,
    });
    store.setRaw(user.id, legacy);

    const migrated = await new FarmService(
      store,
      new BotDecisionRegistry(),
      () => start,
    ).getOrCreate(user);

    expect(migrated.farm).toMatchObject({
      version: 2,
      ownerId: user.id,
    });
    expect(migrated.farm.plots[0]).toMatchObject({ cropId: "tomato" });
    expect((await store.load(user.id) as FarmingGameState).version).toBe(2);
  });

  it("rejects stale revisions instead of overwriting a newer save", async () => {
    const service = new FarmService(
      new MemoryFarmStateStore(),
      new BotDecisionRegistry(),
      () => start,
    );
    const initial = await service.getOrCreate(user);
    await service.applyAction(user, initial.farm.revision, {
      type: "farming_buy_seed",
      cropId: "wheat",
      quantity: 1,
    });
    await expect(service.applyAction(user, initial.farm.revision, {
      type: "farming_buy_seed",
      cropId: "wheat",
      quantity: 1,
    })).rejects.toMatchObject({
      status: 409,
      code: "FARM_REVISION_CONFLICT",
    });
  });

  it("quarantines an invalid save and creates a recoverable new farm", async () => {
    const store = new MemoryFarmStateStore();
    store.setRaw(user.id, { kind: "farm", version: 999 });
    const service = new FarmService(
      store,
      new BotDecisionRegistry(),
      () => start,
    );

    const recovered = await service.getOrCreate(user);

    expect(recovered.farm).toMatchObject({
      kind: "farm",
      version: 2,
      revision: 0,
      ownerId: user.id,
    });
    expect(store.quarantined).toHaveLength(1);
  });

  it("lists active farms and atomically applies help and steal interactions", async () => {
    let now = start;
    const store = new MemoryFarmStateStore();
    const service = new FarmService(
      store,
      new BotDecisionRegistry(),
      () => now,
    );
    await service.getOrCreate(user);
    let neighborSnapshot = await service.getOrCreate(neighbor);
    const stableHomestead = createHomesteadGame({
      ownerId: neighbor.id,
      ownerName: neighbor.displayName,
      seed: "stable-neighbor-weather",
      now,
    });
    stableHomestead.weather = { weatherId: "clear", dayKey: stableHomestead.dayKey };
    store.setRawHomestead(neighbor.id, stableHomestead);
    neighborSnapshot = await service.applyAction(
      neighbor,
      neighborSnapshot.farm.revision,
      {
        type: "farming_plant",
        cropId: "wheat",
        plotIndex: 0,
      },
    );

    let visitorSnapshot = await service.getOrCreate(user);
    const helped = await service.applyVisitAction(
      user,
      neighbor.id,
      visitorSnapshot.farm.revision,
      neighborSnapshot.farm.revision,
      {
        type: "farming_help",
        care: "water",
        plotIndex: 0,
      },
    );
    expect(helped.outcome).toBe("helped");
    expect(helped.neighbor.plots[0]).toMatchObject({ watered: true });

    now = neighborSnapshot.farm.plots[0]!.maturesAt!;
    visitorSnapshot = await service.getOrCreate(user);
    let matureNeighbor = await service.getNeighbor(user, neighbor.id);
    for (const [care, needed] of [
      ["weed", matureNeighbor.plots[0]!.hasWeeds],
      ["pest", matureNeighbor.plots[0]!.hasPests],
    ] as const) {
      if (!needed) continue;
      const careResult = await service.applyVisitAction(
        user,
        neighbor.id,
        visitorSnapshot.farm.revision,
        matureNeighbor.revision,
        {
          type: "farming_help",
          care,
          plotIndex: 0,
        },
      );
      visitorSnapshot = careResult;
      matureNeighbor = careResult.neighbor;
    }
    const stolen = await service.applyVisitAction(
      user,
      neighbor.id,
      visitorSnapshot.farm.revision,
      matureNeighbor.revision,
      {
        type: "farming_steal",
        plotIndex: 0,
      },
    );

    expect(stolen.outcome).toBe("stolen");
    expect(stolen.farm.inventory!.produce.wheat).toBe(1);
    expect(stolen.neighbor.plots[0]!.stolen).toBe(1);
    expect(stolen.neighbors).toEqual(expect.arrayContaining([
      expect.objectContaining({ ownerId: neighbor.id }),
    ]));
  });

  it("lets the market director choose only a legal daily scenario", async () => {
    let now = start;
    const registry = new BotDecisionRegistry();
    const provider: BotDecisionProvider<unknown, FarmingMarketDecision> = {
      decide: async () => ({
        candidateIndex: 1,
        usage: { promptTokens: 12, completionTokens: 2 },
      }),
    };
    registry.register("farm", provider);
    const service = new FarmService(new MemoryFarmStateStore(), registry, () => now);
    await service.getOrCreate(user);

    now += 24 * 60 * 60 * 1_000;
    const nextDay = await service.getOrCreate(user);

    expect(nextDay.marketDirectorAvailable).toBe(true);
    expect(nextDay.farm.marketEvent).toMatchObject({
      source: "llm",
      title: "合作社采购观察",
    });
    expect(nextDay.farm.market.wheat.price).toBeGreaterThanOrEqual(
      FARMING_CROPS.wheat.minimumPrice,
    );
    expect(nextDay.farm.market.wheat.price).toBeLessThanOrEqual(
      FARMING_CROPS.wheat.maximumPrice,
    );
  });

  it("persists rollover revisions before farm and ranch actions use them", async () => {
    let now = start;
    const store = new MemoryFarmStateStore();
    const service = new FarmService(
      store,
      new BotDecisionRegistry(),
      () => now,
    );
    await service.getOrCreateHomestead(user);

    const account = await store.loadEstateAccount(user.id) as
      EstateAccountState;
    const bundle = await store.loadTownEstate(
      user.id,
      "greenvale",
    ) as TownEstateBundle;
    account.coins = 2_000;
    bundle.farm.coins = 2_000;
    bundle.farm.level = 3;
    bundle.farm.experience = 100;
    store.setRawEstateAccount(user.id, account);
    store.setRawTownEstate(user.id, "greenvale", bundle);

    now += 24 * 60 * 60 * 1_000;
    const rolledRanch = await service.getOrCreateRanch(user);
    const storedAfterRanchGet = await store.loadTownEstate(
      user.id,
      "greenvale",
    ) as TownEstateBundle;

    expect(storedAfterRanchGet.farm.revision)
      .toBe(rolledRanch.ranch.farmRevision);
    expect(storedAfterRanchGet.ranch.revision)
      .toBe(rolledRanch.ranch.revision);

    const ranchAction = await service.applyRanchAction(
      user,
      rolledRanch.ranch.farmRevision,
      rolledRanch.ranch.revision,
      { type: "ranch_buy_animal", animalId: "chicken", penIndex: 0 },
      "greenvale",
    );
    expect(ranchAction.ranch.pens[0]?.animalId).toBe("chicken");

    const stableRanch = await service.getOrCreateRanch(user);
    expect(stableRanch.ranch.revision).toBe(ranchAction.ranch.revision);

    const rolledFarm = await service.getOrCreate(user);
    const storedAfterFarmGet = await store.loadTownEstate(
      user.id,
      "greenvale",
    ) as TownEstateBundle;
    expect(storedAfterFarmGet.farm.revision).toBe(rolledFarm.farm.revision);

    const farmAction = await service.applyAction(
      user,
      rolledFarm.farm.revision,
      { type: "farming_buy_seed", cropId: "wheat", quantity: 1 },
      "greenvale",
    );
    expect(farmAction.farm.revision).toBeGreaterThan(
      rolledFarm.farm.revision,
    );

    const stableFarm = await service.getOrCreate(user);
    expect(stableFarm.farm.revision).toBe(farmAction.farm.revision);
  });

  it("persists a ranch and atomically links feed, purchases and sales to the farm", async () => {
    let now = start;
    const store = new MemoryFarmStateStore();
    store.setRaw(user.id, ranchReadyFarm(user));
    const service = new FarmService(
      store,
      new BotDecisionRegistry(),
      () => now,
    );
    let snapshot = await service.getOrCreateRanch(user);
    expect(snapshot.ranch).toMatchObject({
      kind: "ranch",
      unlocked: true,
      farmLevel: 3,
      economy: { coins: 2_000 },
    });

    snapshot = await service.applyRanchAction(
      user,
      snapshot.ranch.farmRevision,
      snapshot.ranch.revision,
      { type: "ranch_buy_animal", animalId: "chicken", penIndex: 0 },
    );
    expect(snapshot.ranch.economy!.coins).toBe(
      2_000 - RANCH_ANIMALS.chicken.purchaseCost,
    );

    snapshot = await service.applyRanchAction(
      user,
      snapshot.ranch.farmRevision,
      snapshot.ranch.revision,
      { type: "ranch_feed", penIndex: 0 },
    );
    expect(snapshot.ranch.economy!.produce.wheat).toBe(9);
    expect(snapshot.ranch.economy!.coins).toBe(
      2_000 -
      RANCH_ANIMALS.chicken.purchaseCost -
      RANCH_ANIMALS.chicken.careCost,
    );
    now = snapshot.ranch.pens[0]!.producesAt!;

    snapshot = await service.applyRanchAction(
      user,
      snapshot.ranch.farmRevision,
      snapshot.ranch.revision,
      { type: "ranch_clean", penIndex: 0 },
    );
    snapshot = await service.applyRanchAction(
      user,
      snapshot.ranch.farmRevision,
      snapshot.ranch.revision,
      { type: "ranch_collect", penIndex: 0 },
    );
    snapshot = await service.applyRanchAction(
      user,
      snapshot.ranch.farmRevision,
      snapshot.ranch.revision,
      { type: "ranch_sell", productId: "egg", quantity: 1 },
    );

    expect(snapshot.ranch.economy!.coins).toBe(
      2_000 -
      RANCH_ANIMALS.chicken.purchaseCost -
      RANCH_ANIMALS.chicken.careCost +
      RANCH_ANIMALS.chicken.productPrice,
    );
    const saved = await store.loadTownEstate(
      user.id,
      "greenvale",
    ) as TownEstateBundle;
    expect(saved.farm.produce.wheat).toBe(9);
    expect(saved.ranch).toMatchObject({
      kind: "ranch",
      products: { egg: 2 },
    });
  });

  it("quarantines an invalid ranch save without discarding the farm", async () => {
    const store = new MemoryFarmStateStore();
    const farm = ranchReadyFarm(user);
    store.setRaw(user.id, farm);
    store.setRawRanch(user.id, { kind: "ranch", version: 999 });
    const service = new FarmService(
      store,
      new BotDecisionRegistry(),
      () => start,
    );

    const recovered = await service.getOrCreateRanch(user);

    expect(recovered.ranch).toMatchObject({
      kind: "ranch",
      version: 1,
      revision: 0,
    });
    expect(store.quarantinedRanches).toHaveLength(1);
    expect(await store.load(user.id)).toEqual(farm);
  });

  it("applies ranch neighbor cleaning and bounded product collection", async () => {
    let now = start;
    const store = new MemoryFarmStateStore();
    store.setRaw(user.id, ranchReadyFarm(user));
    store.setRaw(neighbor.id, ranchReadyFarm(neighbor));
    const stableHomestead = createHomesteadGame({
      ownerId: neighbor.id,
      ownerName: neighbor.displayName,
      seed: "stable-ranch-neighbor-weather",
      now,
    });
    stableHomestead.weather = { weatherId: "clear", dayKey: stableHomestead.dayKey };
    store.setRawHomestead(neighbor.id, stableHomestead);
    const service = new FarmService(
      store,
      new BotDecisionRegistry(),
      () => now,
    );
    let owner = await service.getOrCreateRanch(neighbor);
    owner = await service.applyRanchAction(
      neighbor,
      owner.ranch.farmRevision,
      owner.ranch.revision,
      { type: "ranch_buy_animal", animalId: "chicken", penIndex: 0 },
    );
    owner = await service.applyRanchAction(
      neighbor,
      owner.ranch.farmRevision,
      owner.ranch.revision,
      { type: "ranch_feed", penIndex: 0 },
    );
    let visitor = await service.getOrCreateRanch(user);
    now = owner.ranch.pens[0]!.producesAt!;

    const helped = await service.applyRanchVisitAction(
      user,
      neighbor.id,
      visitor.ranch.revision,
      owner.ranch.revision,
      { type: "ranch_help", penIndex: 0 },
    );
    expect(helped.outcome).toBe("helped");

    const collected = await service.applyRanchVisitAction(
      user,
      neighbor.id,
      helped.ranch.revision,
      helped.neighbor.revision,
      { type: "ranch_neighbor_collect", penIndex: 0 },
    );

    expect(collected.outcome).toBe("collected");
    expect(collected.ranch.economy!.products.egg).toBe(1);
    expect(collected.neighbor.pens[0]).toMatchObject({ taken: 1 });
    expect(collected.neighbors).toEqual(expect.arrayContaining([
      expect.objectContaining({ ownerId: neighbor.id }),
    ]));
  });

  it("persists linked mine expeditions across farm, ranch and mine state", async () => {
    let now = start;
    const store = new MemoryFarmStateStore();
    store.setRaw(user.id, mineReadyFarm(user));
    store.setRawRanch(user.id, mineReadyRanch(user));
    const service = new FarmService(
      store,
      new BotDecisionRegistry(),
      () => now,
    );
    let snapshot = await service.getOrCreateMine(user);
    expect(snapshot.mine).toMatchObject({
      unlocked: true,
      farmLevel: 6,
      ranchLevel: 3,
      economy: { coins: 5_000 },
    });

    snapshot = await service.applyMineAction(
      user,
      snapshot.mine.farmRevision,
      snapshot.mine.ranchRevision,
      snapshot.mine.revision,
      { type: "mine_start", depositId: "coal", shaftIndex: 0 },
    );
    expect(snapshot.mine.economy).toMatchObject({
      coins: 5_000 - MINE_DEPOSITS.coal.expeditionCost,
      ranchProducts: { egg: 9 },
    });

    now = snapshot.mine.shafts[0]!.completesAt!;
    snapshot = await service.applyMineAction(
      user,
      snapshot.mine.farmRevision,
      snapshot.mine.ranchRevision,
      snapshot.mine.revision,
      { type: "mine_reinforce", shaftIndex: 0 },
    );
    snapshot = await service.applyMineAction(
      user,
      snapshot.mine.farmRevision,
      snapshot.mine.ranchRevision,
      snapshot.mine.revision,
      { type: "mine_collect", shaftIndex: 0 },
    );
    snapshot = await service.applyMineAction(
      user,
      snapshot.mine.farmRevision,
      snapshot.mine.ranchRevision,
      snapshot.mine.revision,
      { type: "mine_sell", depositId: "coal", quantity: 1 },
    );

    expect(snapshot.mine.economy.ores.coal).toBe(
      MINE_DEPOSITS.coal.yield,
    );
    const saved = await store.loadTownEstate(
      user.id,
      "greenvale",
    ) as TownEstateBundle;
    expect(saved.farm.coins).toBe(
      5_000 -
      MINE_DEPOSITS.coal.expeditionCost +
      MINE_DEPOSITS.coal.orePrice,
    );
    expect(saved.ranch.products)
      .toMatchObject({ egg: 9, rabbit_fur: 9 });
  });

  it("quarantines only an invalid mine save", async () => {
    const store = new MemoryFarmStateStore();
    const farm = mineReadyFarm(user);
    const ranch = mineReadyRanch(user);
    store.setRaw(user.id, farm);
    store.setRawRanch(user.id, ranch);
    store.setRawMine(user.id, { kind: "mine", version: 99 });
    const service = new FarmService(
      store,
      new BotDecisionRegistry(),
      () => start,
    );

    const recovered = await service.getOrCreateMine(user);

    expect(recovered.mine).toMatchObject({
      kind: "mine",
      version: 1,
      revision: 0,
    });
    expect(store.quarantinedMines).toHaveLength(1);
    expect(await store.load(user.id)).toEqual(farm);
    expect(await store.loadRanch(user.id)).toEqual(ranch);
  });

  it("persists one linked production job across all four homestead states", async () => {
    let now = start;
    const store = new MemoryFarmStateStore();
    const farm = mineReadyFarm(user);
    farm.produce.pumpkin = 1;
    const ranch = mineReadyRanch(user);
    ranch.products.egg = 1;
    const mine = createMineGame({
      ownerId: user.id,
      ownerName: user.displayName,
      seed: "mine-homestead",
      now,
    });
    mine.ores.coal = 1;
    const homestead = createHomesteadGame({
      ownerId: user.id,
      ownerName: user.displayName,
      seed: "linked-homestead",
      now,
    });
    homestead.reputation = 100;
    store.setRaw(user.id, farm);
    store.setRawRanch(user.id, ranch);
    store.setRawMine(user.id, mine);
    store.setRawHomestead(user.id, homestead);

    const service = new FarmService(
      store,
      new BotDecisionRegistry(),
      () => now,
    );
    let snapshot = await service.getOrCreateHomestead(user);
    snapshot = await service.applyHomesteadAction(
      user,
      snapshot.homestead.revisions.farm,
      snapshot.homestead.revisions.ranch,
      snapshot.homestead.revisions.mine,
      snapshot.homestead.revision,
      {
        type: "homestead_build_facility",
        facilityId: "fertilizer_plant",
      },
    );
    snapshot = await service.applyHomesteadAction(
      user,
      snapshot.homestead.revisions.farm,
      snapshot.homestead.revisions.ranch,
      snapshot.homestead.revisions.mine,
      snapshot.homestead.revision,
      {
        type: "homestead_start_job",
        recipeId: "fertilizer_soil_conditioner",
      },
    );

    const saved = await store.loadTownEstate(
      user.id,
      "greenvale",
    ) as TownEstateBundle;
    expect(saved.farm.produce.pumpkin).toBe(0);
    expect(saved.ranch.products.egg).toBe(0);
    expect(saved.mine.ores.coal).toBe(0);

    now += 45 * 60_000;
    snapshot = await service.applyHomesteadAction(
      user,
      snapshot.homestead.revisions.farm,
      snapshot.homestead.revisions.ranch,
      snapshot.homestead.revisions.mine,
      snapshot.homestead.revision,
      {
        type: "homestead_collect_job",
        facilityId: "fertilizer_plant",
      },
    );
    expect(snapshot.homestead.goods.soil_conditioner).toBe(2);
  });

  it("quarantines only an invalid homestead save", async () => {
    const store = new MemoryFarmStateStore();
    const farm = mineReadyFarm(user);
    const ranch = mineReadyRanch(user);
    const mine = createMineGame({
      ownerId: user.id,
      ownerName: user.displayName,
      seed: "valid-mine",
      now: start,
    });
    store.setRaw(user.id, farm);
    store.setRawRanch(user.id, ranch);
    store.setRawMine(user.id, mine);
    store.setRawHomestead(user.id, { kind: "homestead", version: 99 });

    const service = new FarmService(
      store,
      new BotDecisionRegistry(),
      () => start,
    );
    const recovered = await service.getOrCreateHomestead(user);

    expect(recovered.homestead).toMatchObject({
      kind: "homestead",
      version: 1,
    });
    expect(recovered.homestead.revision).toBeGreaterThanOrEqual(0);
    expect(store.quarantinedHomesteads).toHaveLength(1);
    expect(await store.load(user.id)).toEqual(farm);
    expect(await store.loadRanch(user.id)).toEqual(ranch);
    expect(await store.loadMine(user.id)).toEqual(mine);
  });

  it("does not re-trigger or reward a handled provider alert in the next weather bucket", async () => {
    const firstWindow = Date.parse("2026-07-30T00:00:00+08:00");
    let now = firstWindow;
    const providerAlertId = "cross-bucket-cold-snap";
    const weather = new TownWeatherService({
      provider: {
        fetchTownWeather: async (): Promise<TownWeatherProviderResult> => ({
          provider: "qweather",
          observedAt: now,
          conditionCode: "100",
          conditionText: "晴",
          temperatureC: 18,
          feelsLikeC: 18,
          humidityPercent: 45,
          precipitationMm: 0,
          windSpeedKph: 8,
          visibilityKm: 20,
          alerts: [{
            id: providerAlertId,
            eventCode: "test-cold-snap",
            eventName: "寒潮",
            headline: "跨窗口寒潮预警",
            description: "测试同一预警跨天气窗口保持相同 ID",
            instruction: null,
            senderName: "测试气象台",
            messageType: "alert",
            severity: "severe",
            certainty: "likely",
            urgency: "expected",
            colorCode: "orange",
            issuedAt: firstWindow,
            effectiveAt: firstWindow,
            expiresAt: firstWindow + 24 * 60 * 60 * 1_000,
          }],
          attributions: ["QWeather"],
        }),
      },
      rules: {
        resolveWeatherId: () => "clear",
        resolveDisaster: () => ({
          mechanicId: "cold_snap",
          label: "寒潮",
        }),
      },
    });
    const store = new MemoryFarmStateStore();
    const service = new FarmService(
      store,
      new BotDecisionRegistry(),
      () => now,
      weather,
    );

    let snapshot = await service.getOrCreateHomestead(user);
    expect(snapshot.homestead.disaster).toMatchObject({
      providerAlertId,
      eventId: "cold_snap",
      mitigated: false,
    });
    const fundedAccount = await store.loadEstateAccount(user.id) as
      EstateAccountState;
    const fundedBundle = await store.loadTownEstate(
      user.id,
      "greenvale",
    ) as TownEstateBundle;
    fundedAccount.coins = 1_000;
    fundedBundle.farm.coins = 1_000;
    store.setRawEstateAccount(user.id, fundedAccount);
    store.setRawTownEstate(user.id, "greenvale", fundedBundle);
    snapshot = await service.getOrCreateHomestead(user);

    snapshot = await service.applyHomesteadAction(
      user,
      snapshot.homestead.revisions.farm,
      snapshot.homestead.revisions.ranch,
      snapshot.homestead.revisions.mine,
      snapshot.homestead.revision,
      {
        type: "homestead_choose_event",
        optionId: "buy_emergency_fuel",
      },
    );
    const resolvedEconomy = {
      coins: snapshot.homestead.coins,
      reputation: snapshot.homestead.reputation,
      researchPoints: snapshot.homestead.researchPoints,
      eventsResolved: snapshot.homestead.statistics.eventsResolved,
    };
    expect(snapshot.homestead.disaster).toMatchObject({
      providerAlertId,
      mitigated: true,
      resolution: "buy_emergency_fuel",
    });
    expect(
      (await store.loadTownEstate(
        user.id,
        "greenvale",
      ) as TownEstateBundle).homestead.handledWeatherAlertIds,
    ).toContain(providerAlertId);

    now += 8 * 60 * 60 * 1_000;
    snapshot = await service.getOrCreateHomestead(user);

    expect(snapshot.homestead.disaster).toMatchObject({
      providerAlertId,
      mitigated: true,
      resolution: "buy_emergency_fuel",
    });
    expect(snapshot.homestead.worldEvent.selectedOptionId)
      .toBe("buy_emergency_fuel");
    expect({
      coins: snapshot.homestead.coins,
      reputation: snapshot.homestead.reputation,
      researchPoints: snapshot.homestead.researchPoints,
      eventsResolved: snapshot.homestead.statistics.eventsResolved,
    }).toEqual(resolvedEconomy);
    await expect(service.applyHomesteadAction(
      user,
      snapshot.homestead.revisions.farm,
      snapshot.homestead.revisions.ranch,
      snapshot.homestead.revisions.mine,
      snapshot.homestead.revision,
      {
        type: "homestead_choose_event",
        optionId: "buy_emergency_fuel",
      },
    )).rejects.toMatchObject({
      code: "HOMESTEAD_EVENT_ALREADY_RESOLVED",
    });
  });

  it("maps a Frostpeak drought alert to the highland drought event", () => {
    const service = new FarmService(
      new MemoryFarmStateStore(),
      new BotDecisionRegistry(),
      () => start,
    );
    const resolver = service as unknown as {
      weatherDisasterContentEvent(
        townId: "greenvale" | "frostpeak",
        mechanicId: TownWeatherDisasterMechanicId,
        description: string,
      ): string;
    };

    const eventId = resolver.weatherDisasterContentEvent(
      "frostpeak",
      "drought",
      "高原持续少雨并出现干风",
    );

    expect(eventId).toBe("frost_highland_drought");
    expect(eventId).not.toBe("frost_spring_thaw");
  });

  it("resets all emergency boosts when a new weather disaster starts", () => {
    const service = new FarmService(
      new MemoryFarmStateStore(),
      new BotDecisionRegistry(),
      () => start,
    );
    const initial = townEstateBundle(user);
    initial.homestead.emergencyBoosts = {
      farm: true,
      ranch: true,
      mine: true,
    };
    const applicator = service as unknown as {
      applyTownWeatherSnapshot(
        state: TownEstateBundle,
        snapshot: TownWeatherSnapshot,
      ): TownEstateBundle;
    };

    const updated = applicator.applyTownWeatherSnapshot(
      initial,
      liveWeatherSnapshot({
        providerAlertId: "new-weather-disaster",
        mechanicId: "windstorm",
      }),
    );

    expect(updated.homestead.disaster).toMatchObject({
      providerAlertId: "new-weather-disaster",
      eventId: "windstorm",
      mitigated: false,
    });
    expect(updated.homestead.emergencyBoosts).toEqual({
      farm: false,
      ranch: false,
      mine: false,
    });
  });

  it("advances to the next unhandled playable weather alert", () => {
    const service = new FarmService(
      new MemoryFarmStateStore(),
      new BotDecisionRegistry(),
      () => start,
    );
    const initial = townEstateBundle(user);
    initial.homestead.handledWeatherAlertIds = ["handled-first-alert"];
    const firstSnapshot = liveWeatherSnapshot({
      providerAlertId: "handled-first-alert",
      mechanicId: "cold_snap",
    });
    const snapshot: TownWeatherSnapshot = {
      ...firstSnapshot,
      disasters: [
      firstSnapshot.disasters[0]!,
      {
        ...firstSnapshot.disasters[0]!,
        providerAlertId: "next-wind-alert",
        eventName: "大风",
        headline: "第二条大风预警",
        mechanicId: "windstorm",
      },
      ],
    };
    const applicator = service as unknown as {
      applyTownWeatherSnapshot(
        state: TownEstateBundle,
        weather: TownWeatherSnapshot,
      ): TownEstateBundle;
    };

    const updated = applicator.applyTownWeatherSnapshot(initial, snapshot);

    expect(updated.homestead.disaster).toMatchObject({
      providerAlertId: "next-wind-alert",
      eventId: "windstorm",
      mitigated: false,
    });
  });

  it("rejects a town bundle containing nested state from another town", () => {
    const service = new FarmService(
      new MemoryFarmStateStore(),
      new BotDecisionRegistry(),
      () => start,
    );
    const invalid = townEstateBundle(user, "greenvale");
    invalid.farm.townId = "frostpeak";
    const validator = service as unknown as {
      assertTownEstateBundle(
        value: unknown,
        ownerId: string,
        townId: "greenvale" | "frostpeak",
      ): void;
    };

    expect(() =>
      validator.assertTownEstateBundle(
        invalid,
        user.id,
        "greenvale",
      )
    ).toThrow();
  });

  it("returns a recoverable conflict when daily logistics are exhausted", async () => {
    const store = new MemoryFarmStateStore();
    const service = new FarmService(
      store,
      new BotDecisionRegistry(),
      () => start,
    );
    await service.getOrCreateHomestead(user);
    const account = await store.loadEstateAccount(user.id) as
      EstateAccountState;
    const bundle = await store.loadTownEstate(
      user.id,
      "greenvale",
    ) as TownEstateBundle;
    account.logistics.used = account.logistics.capacity;
    bundle.homestead.goods.soil_conditioner = 1;
    bundle.homestead.disaster = {
      eventId: "drought",
      contentEventId: "drought",
      startedDayKey: bundle.homestead.dayKey,
      remainingDays: 1,
      unresolvedDays: 0,
      severity: 1,
      mitigated: false,
      resolution: null,
      reputationPenaltyPaid: 0,
      temporaryOptionId: null,
    };
    store.setRawEstateAccount(user.id, account);
    store.setRawTownEstate(user.id, "greenvale", bundle);

    const snapshot = await service.getOrCreateHomestead(user);
    await expect(service.applyHomesteadAction(
      user,
      snapshot.homestead.revisions.farm,
      snapshot.homestead.revisions.ranch,
      snapshot.homestead.revisions.mine,
      snapshot.homestead.revision,
      {
        type: "homestead_activate_emergency_boost",
        sectorId: "farm",
      },
      "greenvale",
    )).rejects.toMatchObject({
      status: 409,
      code: "ESTATE_LOGISTICS_INSUFFICIENT",
    });

    const unchanged = await store.loadTownEstate(
      user.id,
      "greenvale",
    ) as TownEstateBundle;
    expect(unchanged.homestead.goods.soil_conditioner).toBe(1);
    expect(unchanged.homestead.emergencyBoosts.farm).toBe(false);
  });

  it("rejects direct cargo dispatch while a persistent logistics hazard is active", async () => {
    const store = new MemoryFarmStateStore();
    const account = createEstateAccount({
      ownerId: user.id,
      ownerName: user.displayName,
      now: start,
      coins: 2_000,
    });
    account.activeTownId = "frostpeak";
    account.townProgress.frostpeak = {
      unlocked: true,
      unlockedAt: start,
      localReputation: 0,
      farmLevel: 1,
      ranchLevel: 1,
      mineLevel: 1,
      landmarkStage: 0,
      lastVisitedAt: start,
    };
    const bundle = townEstateBundle(user, "frostpeak");
    bundle.farm.coins = account.coins;
    bundle.farm.produce.cloudberry = 2;
    bundle.ranch.products.yak_milk = 2;
    bundle.mine.ores.frost_silver = 1;
    bundle.homestead.disaster = {
      eventId: "cold_snap",
      contentEventId: "frost_rail_icing",
      startedDayKey: bundle.homestead.dayKey,
      remainingDays: 1,
      unresolvedDays: 0,
      severity: 1,
      mitigated: false,
      resolution: null,
      reputationPenaltyPaid: 0,
      temporaryOptionId: null,
    };
    store.setRawEstateAccount(user.id, account);
    store.setRawTownEstate(user.id, "frostpeak", bundle);
    const service = new FarmService(
      store,
      new BotDecisionRegistry(),
      () => start,
    );
    const snapshot = await service.getOrCreateHomestead(user);

    await expect(service.applyHomesteadAction(
      user,
      snapshot.homestead.revisions.farm,
      snapshot.homestead.revisions.ranch,
      snapshot.homestead.revisions.mine,
      snapshot.homestead.revision,
      snapshot.homestead.accountRevision,
      {
        type: "homestead_dispatch_cargo",
        cargoId: "frostpeak_coldchain_supplies",
      },
      "frostpeak",
    )).rejects.toMatchObject({
      status: 400,
      code: "ESTATE_CARGO_LOGISTICS_BLOCKED",
    });

    const unchangedAccount = await store.loadEstateAccount(user.id) as
      EstateAccountState;
    const unchangedBundle = await store.loadTownEstate(
      user.id,
      "frostpeak",
    ) as TownEstateBundle;
    expect(unchangedAccount.shipments).toHaveLength(0);
    expect(unchangedBundle.farm.produce.cloudberry).toBe(2);
    expect(unchangedBundle.ranch.products.yak_milk).toBe(2);
    expect(unchangedBundle.mine.ores.frost_silver).toBe(1);
  });

  it("does not advance the account revision when JSONB reorders town progress fields", async () => {
    const store = new MemoryFarmStateStore();
    const service = new FarmService(
      store,
      new BotDecisionRegistry(),
      () => start,
    );
    const snapshot = await service.getOrCreateHomestead(user);
    const account = await store.loadEstateAccount(user.id) as
      EstateAccountState;
    const progress = account.townProgress.greenvale!;
    account.townProgress.greenvale = {
      lastVisitedAt: progress.lastVisitedAt,
      landmarkStage: progress.landmarkStage,
      mineLevel: progress.mineLevel,
      ranchLevel: progress.ranchLevel,
      farmLevel: progress.farmLevel,
      localReputation: progress.localReputation,
      unlockedAt: progress.unlockedAt,
      unlocked: progress.unlocked,
    };
    store.setRawEstateAccount(user.id, account);

    const updated = await service.applyHomesteadAction(
      user,
      snapshot.homestead.revisions.farm,
      snapshot.homestead.revisions.ranch,
      snapshot.homestead.revisions.mine,
      snapshot.homestead.revision,
      snapshot.homestead.accountRevision,
      {
        type: "homestead_update_ai_profile",
        enabled: true,
        goal: "wealth",
        risk: "safe",
        focus: "farm",
      },
      "greenvale",
    );

    expect(updated.homestead.aiProfile.goal).toBe("wealth");
    expect(updated.homestead.accountRevision).toBe(
      snapshot.homestead.accountRevision,
    );
  });

  it("persists cross-day disaster reputation loss to the town and account", async () => {
    let now = start;
    const store = new MemoryFarmStateStore();
    const service = new FarmService(
      store,
      new BotDecisionRegistry(),
      () => now,
    );
    await service.getOrCreateHomestead(user);
    const account = await store.loadEstateAccount(user.id) as
      EstateAccountState;
    const bundle = await store.loadTownEstate(
      user.id,
      "greenvale",
    ) as TownEstateBundle;
    bundle.homestead.reputation = 20;
    bundle.homestead.disaster = {
      eventId: "cold_snap",
      contentEventId: "cold_snap",
      startedDayKey: bundle.homestead.dayKey,
      remainingDays: 3,
      unresolvedDays: 0,
      severity: 1,
      mitigated: false,
      resolution: null,
      reputationPenaltyPaid: 0,
      temporaryOptionId: null,
    };
    account.townProgress.greenvale!.localReputation = 20;
    store.setRawEstateAccount(user.id, account);
    store.setRawTownEstate(user.id, "greenvale", bundle);

    now += 24 * 60 * 60_000;
    const settled = await service.getOrCreateHomestead(user);
    expect(settled.homestead.reputation).toBe(18);
    expect(settled.homestead.disaster).toMatchObject({
      unresolvedDays: 1,
      reputationPenaltyPaid: 2,
    });

    const savedBundle = await store.loadTownEstate(
      user.id,
      "greenvale",
    ) as TownEstateBundle;
    const savedAccount = await store.loadEstateAccount(user.id) as
      EstateAccountState;
    expect(savedBundle.homestead.reputation).toBe(18);
    expect(savedBundle.homestead.disaster?.reputationPenaltyPaid).toBe(2);
    expect(savedAccount.townProgress.greenvale?.localReputation).toBe(18);

    const reloadedService = new FarmService(
      store,
      new BotDecisionRegistry(),
      () => now,
    );
    const reloaded = await reloadedService.getOrCreateHomestead(user);
    expect(reloaded.homestead.reputation).toBe(18);
    expect(reloaded.homestead.disaster?.reputationPenaltyPaid).toBe(2);
    expect(
      (await store.loadEstateAccount(user.id) as EstateAccountState)
        .townProgress.greenvale?.localReputation,
    ).toBe(18);
  });

  it("rebuilds a missing account from complete town bundles without relocking Frostpeak", async () => {
    const store = new MemoryFarmStateStore();
    const now = start + 60_000;
    const frostFarm = createFarmingGame({
      ownerId: user.id,
      ownerName: user.displayName,
      seed: "recovery-frost-farm",
      now,
      townId: "frostpeak",
    });
    frostFarm.coins = 4_321;
    frostFarm.experience = 400;
    frostFarm.level = 6;
    const frostRanch = createRanchGame({
      ownerId: user.id,
      ownerName: user.displayName,
      seed: "recovery-frost-ranch",
      now,
      townId: "frostpeak",
    });
    frostRanch.experience = 380;
    frostRanch.level = 5;
    const frostMine = createMineGame({
      ownerId: user.id,
      ownerName: user.displayName,
      seed: "recovery-frost-mine",
      now,
      townId: "frostpeak",
    });
    frostMine.experience = 275;
    frostMine.level = 4;
    const frostHomestead = createHomesteadGame({
      ownerId: user.id,
      ownerName: user.displayName,
      seed: "recovery-frost-homestead",
      now,
      townId: "frostpeak",
    });
    frostHomestead.reputation = 47;
    frostHomestead.townNetwork.merchantRenown = 6;
    const frostBundle: TownEstateBundle = {
      kind: "town_estate_bundle",
      version: 1,
      townId: "frostpeak",
      contentVersion: TOWN_DEFINITIONS.frostpeak.contentVersion,
      farm: frostFarm,
      ranch: frostRanch,
      mine: frostMine,
      homestead: frostHomestead,
    };
    store.setRawTownEstate(user.id, "frostpeak", frostBundle);

    const service = new FarmService(
      store,
      new BotDecisionRegistry(),
      () => now,
    );
    const recovered = await service.getOrCreateHomestead(user);
    const account = await store.loadEstateAccount(user.id) as
      EstateAccountState;

    expect(recovered.homestead.activeTownId).toBe("frostpeak");
    expect(recovered.homestead.coins).toBe(4_321);
    expect(account.activeTownId).toBe("frostpeak");
    expect(account.merchantRenown).toBe(6);
    expect(account.townProgress.frostpeak).toMatchObject({
      unlocked: true,
      localReputation: 47,
      farmLevel: 6,
      ranchLevel: 5,
      mineLevel: 4,
    });
  });
});
