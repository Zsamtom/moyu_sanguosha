import { describe, expect, it } from "vitest";
import {
  FARMING_CROPS,
  MINE_DEPOSITS,
  RANCH_ANIMALS,
  applyFarmAction,
  createFarmGame,
  createFarmingGame,
  createHomesteadGame,
  createMineGame,
  createRanchGame,
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
} from "./farm-service.js";
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

describe("real-time FarmService", () => {
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

    now += FARMING_CROPS.wheat.growthSeconds * 1_000;
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
      title: "主粮集中采购",
    });
    expect(nextDay.farm.market.wheat.price).toBe(FARMING_CROPS.wheat.maximumPrice);
    expect(nextDay.farm.market.corn.price).toBe(FARMING_CROPS.corn.maximumPrice);
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
    now += RANCH_ANIMALS.chicken.productionSeconds * 1_000;

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
      RANCH_ANIMALS.chicken.purchaseCost +
      RANCH_ANIMALS.chicken.productPrice,
    );
    expect((await store.load(user.id) as FarmingGameState).produce.wheat).toBe(9);
    expect(await store.loadRanch(user.id)).toMatchObject({
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
    now += RANCH_ANIMALS.chicken.productionSeconds * 1_000;

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

    now += MINE_DEPOSITS.coal.durationSeconds * 1_000;
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
      MINE_DEPOSITS.coal.yield - 1,
    );
    expect((await store.load(user.id) as FarmingGameState).coins).toBe(
      5_000 -
      MINE_DEPOSITS.coal.expeditionCost +
      MINE_DEPOSITS.coal.orePrice,
    );
    expect((await store.loadRanch(user.id) as RanchGameState).products)
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

    expect((await store.load(user.id) as FarmingGameState).produce.pumpkin)
      .toBe(0);
    expect((await store.loadRanch(user.id) as RanchGameState).products.egg)
      .toBe(0);
    expect((await store.loadMine(user.id) as MineGameState).ores.coal).toBe(0);

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
      revision: 0,
    });
    expect(store.quarantinedHomesteads).toHaveLength(1);
    expect(await store.load(user.id)).toEqual(farm);
    expect(await store.loadRanch(user.id)).toEqual(ranch);
    expect(await store.loadMine(user.id)).toEqual(mine);
  });
});
