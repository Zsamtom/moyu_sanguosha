import { describe, expect, it } from "vitest";
import {
  FARMING_CROP_IDS,
  HOMESTEAD_VALUE_ROUTES,
  HOMESTEAD_VALUE_ROUTE_IDS,
  HOMESTEAD_ORDER_TEMPLATES,
  MINE_DEPOSIT_IDS,
  RANCH_PRODUCT_IDS,
  HomesteadRuleError,
  applyHomesteadAction,
  assertRestorableHomesteadGameState,
  createFarmingGame,
  createHomesteadGame,
  createMineGame,
  createRanchGame,
  getHomesteadGameView,
  getHomesteadProductionRules,
  applyHomesteadWorldEventDecision,
  refreshHomesteadGame,
  type HomesteadLinkedEconomy,
} from "../src/index.js";

const start = Date.UTC(2026, 6, 30, 8);
const ownerId = "owner";

function setup() {
  const farm = createFarmingGame({
    ownerId,
    ownerName: "庄主",
    seed: "farm-seed",
    now: start,
  });
  const ranch = createRanchGame({
    ownerId,
    ownerName: "庄主",
    seed: "ranch-seed",
    now: start,
  });
  const mine = createMineGame({
    ownerId,
    ownerName: "庄主",
    seed: "mine-seed",
    now: start,
  });
  const homestead = createHomesteadGame({
    ownerId,
    ownerName: "庄主",
    seed: "homestead-seed",
    now: start,
  });
  const economy: HomesteadLinkedEconomy = {
    farmRevision: farm.revision,
    ranchRevision: ranch.revision,
    mineRevision: mine.revision,
    coins: 2_000,
    farmProduce: structuredClone(farm.produce),
    ranchProducts: structuredClone(ranch.products),
    mineOres: structuredClone(mine.ores),
  };
  return { homestead, economy };
}

describe("homestead linked economy", () => {
  it("gives every primary product a server-authoritative non-sale route", () => {
    const covered = new Set(
      HOMESTEAD_VALUE_ROUTE_IDS.flatMap((routeId) =>
        HOMESTEAD_VALUE_ROUTES[routeId].requirements.map(
          ({ source, itemId }) => `${source}:${itemId}`,
        )
      ),
    );
    for (const cropId of FARMING_CROP_IDS) {
      expect(covered, `农产品 ${cropId} 缺少增值路线`)
        .toContain(`farm:${cropId}`);
    }
    for (const productId of RANCH_PRODUCT_IDS) {
      expect(covered, `牧场产品 ${productId} 缺少增值路线`)
        .toContain(`ranch:${productId}`);
    }
    for (const depositId of MINE_DEPOSIT_IDS) {
      expect(covered, `矿物 ${depositId} 缺少增值路线`)
        .toContain(`mine:${depositId}`);
    }
  });

  it("keeps Frostpeak recoverable at zero coins and closes its three-sector loop", () => {
    const { homestead, economy } = setup();
    economy.coins = 0;
    const switched = applyHomesteadAction(
      homestead,
      economy,
      { type: "homestead_switch_town", townId: "frostpeak" },
      start,
    );
    const farmStarted = applyHomesteadAction(
      switched.homestead,
      switched.economy,
      { type: "homestead_start_town_sector", sectorId: "farm" },
      start + 1,
    );
    const farmCollected = applyHomesteadAction(
      farmStarted.homestead,
      farmStarted.economy,
      { type: "homestead_collect_town_sector", sectorId: "farm" },
      start + 8 * 60_000 + 1,
    );
    expect(
      farmCollected.homestead.townNetwork.towns.frostpeak.inventory.snow_potato,
    ).toBe(3);

    const ranchStarted = applyHomesteadAction(
      farmCollected.homestead,
      farmCollected.economy,
      { type: "homestead_start_town_sector", sectorId: "ranch" },
      start + 8 * 60_000 + 2,
    );
    const ranchCollected = applyHomesteadAction(
      ranchStarted.homestead,
      ranchStarted.economy,
      { type: "homestead_collect_town_sector", sectorId: "ranch" },
      start + 24 * 60_000 + 2,
    );
    const mineStarted = applyHomesteadAction(
      ranchCollected.homestead,
      ranchCollected.economy,
      { type: "homestead_start_town_sector", sectorId: "mine" },
      start + 24 * 60_000 + 3,
    );
    const mineCollected = applyHomesteadAction(
      mineStarted.homestead,
      mineStarted.economy,
      { type: "homestead_collect_town_sector", sectorId: "mine" },
      start + 48 * 60_000 + 3,
    );
    expect(
      mineCollected.homestead.townNetwork.towns.frostpeak.inventory.frost_crystal,
    ).toBe(2);
  });

  it("awards local reputation for town problems and global renown for landmarks", () => {
    const { homestead, economy } = setup();
    homestead.townNetwork.activeTownId = "frostpeak";
    const town = homestead.townNetwork.towns.frostpeak;
    town.inventory.snow_potato = 20;
    town.inventory.yak_milk = 10;
    town.inventory.frost_crystal = 10;

    const resolved = applyHomesteadAction(
      homestead,
      economy,
      {
        type: "homestead_resolve_town_problem",
        problemId: "blocked_supply_road",
      },
      start,
    );
    expect(resolved.homestead.townNetwork.towns.frostpeak.reputation).toBe(10);
    expect(resolved.homestead.reputation).toBe(0);

    const restored = applyHomesteadAction(
      resolved.homestead,
      resolved.economy,
      { type: "homestead_restore_town_landmark" },
      start + 1,
    );
    expect(restored.homestead.townNetwork.towns.frostpeak.landmarkStage).toBe(1);
    expect(restored.homestead.townNetwork.merchantRenown).toBe(2);
  });

  it("completes value-added projects atomically and only once per day", () => {
    const { homestead, economy } = setup();
    economy.farmProduce.tomato = 3;
    economy.farmProduce.carrot = 2;
    const result = applyHomesteadAction(
      homestead,
      economy,
      {
        type: "homestead_complete_value_route",
        routeId: "valley_sauce_batch",
      },
      start,
    );
    expect(result.economy.farmProduce.tomato).toBe(0);
    expect(result.economy.coins).toBe(2_090);
    expect(result.homestead.reputation).toBe(2);
    expect(() =>
      applyHomesteadAction(
        result.homestead,
        result.economy,
        {
          type: "homestead_complete_value_route",
          routeId: "valley_sauce_batch",
        },
        start + 1,
      )
    ).toThrowError(HomesteadRuleError);
  });

  it("creates a recoverable daily state with a starter mill", () => {
    const { homestead, economy } = setup();

    expect(homestead.facilities.find(({ id }) => id === "mill")?.built).toBe(
      true,
    );
    expect(homestead.orders).toHaveLength(3);
    expect(() => assertRestorableHomesteadGameState(homestead)).not.toThrow();

    const view = getHomesteadGameView(homestead, economy, start);
    expect(view.recipes.find(({ id }) => id === "mill_flour")?.facilityBuilt)
      .toBe(true);
  });

  it("consumes farm resources and collects a timed mill job", () => {
    const { homestead, economy } = setup();
    economy.farmProduce.wheat = 3;

    const started = applyHomesteadAction(
      homestead,
      economy,
      { type: "homestead_start_job", recipeId: "mill_flour" },
      start,
    );

    expect(started.economy.farmProduce.wheat).toBe(0);
    expect(started.economy.farmRevision).toBe(economy.farmRevision + 1);
    expect(() =>
      applyHomesteadAction(
        started.homestead,
        started.economy,
        { type: "homestead_collect_job", facilityId: "mill" },
        start + 9 * 60_000,
      )
    ).toThrowError(HomesteadRuleError);

    const collected = applyHomesteadAction(
      started.homestead,
      started.economy,
      { type: "homestead_collect_job", facilityId: "mill" },
      start + 10 * 60_000,
    );
    expect(collected.homestead.goods.flour).toBe(2);
    expect(collected.homestead.statistics.jobsCollected).toBe(1);
  });

  it("runs a three-sector fertilizer recipe atomically", () => {
    const { homestead, economy } = setup();
    homestead.reputation = 100;
    economy.farmProduce.pumpkin = 1;
    economy.ranchProducts.egg = 1;
    economy.mineOres.coal = 1;

    const built = applyHomesteadAction(
      homestead,
      economy,
      {
        type: "homestead_build_facility",
        facilityId: "fertilizer_plant",
      },
      start,
    );
    const started = applyHomesteadAction(
      built.homestead,
      built.economy,
      {
        type: "homestead_start_job",
        recipeId: "fertilizer_soil_conditioner",
      },
      start + 1,
    );

    expect(started.economy.farmProduce.pumpkin).toBe(0);
    expect(started.economy.ranchProducts.egg).toBe(0);
    expect(started.economy.mineOres.coal).toBe(0);
    expect(started.farmChanged).toBe(true);
    expect(started.ranchChanged).toBe(true);
    expect(started.mineChanged).toBe(true);

    const collected = applyHomesteadAction(
      started.homestead,
      started.economy,
      {
        type: "homestead_collect_job",
        facilityId: "fertilizer_plant",
      },
      start + 45 * 60_000 + 1,
    );
    expect(collected.homestead.goods.soil_conditioner).toBe(2);
  });

  it("completes an order from real inventories and grants progression", () => {
    const { homestead, economy } = setup();
    const order = homestead.orders[0]!;
    const template = HOMESTEAD_ORDER_TEMPLATES[order.templateId];

    for (const requirement of template.requirements) {
      if (requirement.source === "farm") {
        economy.farmProduce[requirement.itemId] = requirement.quantity;
      } else if (requirement.source === "ranch") {
        economy.ranchProducts[requirement.itemId] = requirement.quantity;
      } else if (requirement.source === "mine") {
        economy.mineOres[requirement.itemId] = requirement.quantity;
      } else {
        homestead.goods[requirement.itemId] = requirement.quantity;
      }
    }

    const result = applyHomesteadAction(
      homestead,
      economy,
      { type: "homestead_complete_order", orderId: order.id },
      start,
    );

    expect(result.homestead.orders[0]?.completed).toBe(true);
    expect(result.homestead.reputation).toBe(template.reputationReward);
    expect(result.homestead.researchPoints).toBe(template.researchReward);
    expect(result.economy.coins).toBe(2_000 + template.coinReward);
  });

  it("resolves the daily event only once", () => {
    const { homestead, economy } = setup();
    const view = getHomesteadGameView(homestead, economy, start);
    const freeOption = view.worldEvent.definition.options.find(
      (option) => option.costs.length === 0,
    );
    const selected = freeOption ?? view.worldEvent.definition.options[0]!;
    for (const requirement of selected.costs) {
      if (requirement.source === "farm") {
        economy.farmProduce[requirement.itemId] = requirement.quantity;
      } else if (requirement.source === "ranch") {
        economy.ranchProducts[requirement.itemId] = requirement.quantity;
      } else if (requirement.source === "mine") {
        economy.mineOres[requirement.itemId] = requirement.quantity;
      } else {
        homestead.goods[requirement.itemId] = requirement.quantity;
      }
    }

    const result = applyHomesteadAction(
      homestead,
      economy,
      { type: "homestead_choose_event", optionId: selected.id },
      start,
    );
    expect(result.homestead.worldEvent.selectedOptionId).toBe(selected.id);
    expect(() =>
      applyHomesteadAction(
        result.homestead,
        result.economy,
        { type: "homestead_choose_event", optionId: selected.id },
        start + 1,
      )
    ).toThrowError(HomesteadRuleError);
  });

  it("rotates orders and events on the next UTC day", () => {
    const { homestead } = setup();
    const next = refreshHomesteadGame(homestead, start + 24 * 60 * 60_000);

    expect(next.dayKey).not.toBe(homestead.dayKey);
    expect(next.orders).toHaveLength(3);
    expect(next.orders.every((order) => !order.completed)).toBe(true);
    expect(next.revision).toBe(homestead.revision + 1);
  });

  it("settles every elapsed offline day instead of decaying only once", () => {
    const { homestead } = setup();
    const next = refreshHomesteadGame(
      homestead,
      start + 30 * 24 * 60 * 60_000,
    );

    expect(next.specializations.farm.soilHealth).toBe(0);
    expect(next.specializations.ranch.herdHealth).toBe(0);
    expect(next.logs[0]?.message).toContain("离线结算 30 天");
  });

  it("applies unresolved disasters to production and clears them after repair", () => {
    const { homestead, economy } = setup();
    const seepage = applyHomesteadWorldEventDecision(
      homestead,
      "mountain_seepage",
      "rules",
      start,
    );
    const before = getHomesteadProductionRules(seepage);
    expect(before.mine.yieldPercent).toBeLessThan(
      seepage.specializations.mine.oreBonusPercent,
    );
    expect(before.mine.durationPercent).toBeGreaterThan(0);

    seepage.goods.mining_kit = 1;
    const boosted = applyHomesteadAction(
      seepage,
      economy,
      {
        type: "homestead_activate_emergency_boost",
        sectorId: "mine",
      },
      start + 1,
    );
    expect(
      getHomesteadProductionRules(boosted.homestead).mine.yieldPercent,
    ).toBe(before.mine.yieldPercent + 18);

    economy.farmProduce.cotton = 1;
    economy.mineOres.coal = 1;
    const repaired = applyHomesteadAction(
      boosted.homestead,
      economy,
      { type: "homestead_choose_event", optionId: "channel_water" },
      start + 2,
    );
    expect(repaired.homestead.disaster?.mitigated).toBe(true);
    expect(
      getHomesteadProductionRules(repaired.homestead).mine.yieldPercent,
    ).toBe(repaired.homestead.specializations.mine.oreBonusPercent + 18);
    expect(repaired.homestead.specializations.farm.soilHealth).toBe(68);
  });

  it("projects event affordability and supports repeatable resilience sinks", () => {
    const { homestead, economy } = setup();
    const seepage = applyHomesteadWorldEventDecision(
      homestead,
      "mountain_seepage",
      "rules",
      start,
    );
    const option = getHomesteadGameView(seepage, economy, start)
      .worldEvent.definition.options.find(({ id }) => id === "channel_water")!;
    expect(option.canChoose).toBe(false);
    expect(option.costsView.some(({ sufficient }) => !sufficient)).toBe(true);

    seepage.researchPoints = 20;
    seepage.goods.iron_ingot = 3;
    const upgraded = applyHomesteadAction(
      seepage,
      economy,
      {
        type: "homestead_upgrade_resilience",
        resilienceId: "drainage",
      },
      start + 1,
    );
    expect(upgraded.homestead.resilience.drainage).toBe(1);
    expect(upgraded.homestead.researchPoints).toBeLessThan(20);
    expect(upgraded.economy.coins).toBeLessThan(economy.coins);
  });

  it("runs daily farm, ranch, and mine specialization programs", () => {
    const { homestead, economy } = setup();

    const farm = applyHomesteadAction(
      homestead,
      economy,
      {
        type: "homestead_plan_rotation",
        cropFamily: "grain",
        useFertilizer: false,
      },
      start,
    );
    expect(farm.homestead.specializations.farm.lastCropFamily).toBe("grain");
    expect(farm.economy.farmProduce.wheat).toBe(1);

    const ranch = applyHomesteadAction(
      farm.homestead,
      farm.economy,
      { type: "homestead_run_feed_program", programId: "pasture" },
      start + 1,
    );
    expect(ranch.homestead.specializations.ranch.herdHealth).toBeGreaterThan(65);
    expect(ranch.economy.ranchProducts.egg).toBeGreaterThan(0);

    const mine = applyHomesteadAction(
      ranch.homestead,
      ranch.economy,
      { type: "homestead_survey_layer", layerId: "shallow" },
      start + 2,
    );
    expect(mine.homestead.specializations.mine.discoveredLayers).toContain(
      "shallow",
    );
    expect(mine.economy.mineOres.coal).toBe(1);
    expect(mine.homestead.season.counters.specializations).toBe(3);
  });

  it("enforces one specialization action per sector per day", () => {
    const { homestead, economy } = setup();
    const first = applyHomesteadAction(
      homestead,
      economy,
      {
        type: "homestead_plan_rotation",
        cropFamily: "grain",
        useFertilizer: false,
      },
      start,
    );

    expect(() =>
      applyHomesteadAction(
        first.homestead,
        first.economy,
        {
          type: "homestead_plan_rotation",
          cropFamily: "root",
          useFertilizer: false,
        },
        start + 1,
      )
    ).toThrowError(HomesteadRuleError);
  });

  it("unlocks research and applies facility upgrades to production", () => {
    const { homestead, economy } = setup();
    homestead.researchPoints = 20;
    homestead.reputation = 20;
    const researched = applyHomesteadAction(
      homestead,
      economy,
      { type: "homestead_unlock_research", nodeId: "estate_engineering" },
      start,
    );
    researched.homestead.goods.iron_ingot = 2;
    const upgraded = applyHomesteadAction(
      researched.homestead,
      researched.economy,
      { type: "homestead_upgrade_facility", facilityId: "mill" },
      start + 1,
    );
    expect(
      upgraded.homestead.facilities.find(({ id }) => id === "mill")?.level,
    ).toBe(2);

    upgraded.economy.farmProduce.wheat = 3;
    const started = applyHomesteadAction(
      upgraded.homestead,
      upgraded.economy,
      { type: "homestead_start_job", recipeId: "mill_flour" },
      start + 2,
    );
    const job = started.homestead.facilities.find(
      ({ id }) => id === "mill",
    )?.job;
    expect(job?.outputQuantity).toBe(3);
    expect(job!.completesAt - job!.startedAt).toBeLessThan(10 * 60_000);
  });

  it("records bounded NPC memories and exposes collection progress", () => {
    const { homestead, economy } = setup();
    const result = applyHomesteadAction(
      homestead,
      economy,
      {
        type: "homestead_talk_npc",
        npcId: "agronomist_lin",
        topicId: "soil",
      },
      start,
    );
    const npc = result.homestead.npcs.find(
      ({ npcId }) => npcId === "agronomist_lin",
    );
    expect(npc?.facts).toHaveLength(1);
    expect(npc?.lastDialogue).toContain("土壤健康");
    expect(
      getHomesteadGameView(result.homestead, result.economy, start).collections
        .length,
    ).toBeGreaterThan(30);
  });

  it("requires seasonal mastery for the final 56-day reward", () => {
    const { homestead, economy } = setup();
    homestead.season.score = 1_200;
    expect(() =>
      applyHomesteadAction(
        homestead,
        economy,
        {
          type: "homestead_claim_season_reward",
          milestoneId: "gold",
        },
        start,
      )
    ).toThrowError(HomesteadRuleError);

    homestead.research.unlocked.push("civic_network", "seasonal_mastery");
    expect(() =>
      applyHomesteadAction(
        homestead,
        economy,
        {
          type: "homestead_claim_season_reward",
          milestoneId: "gold",
        },
        start,
      )
    ).not.toThrow();
  });

  it("migrates the first-stage save shape without quarantining it", () => {
    const { homestead, economy } = setup();
    const legacy = structuredClone(homestead) as unknown as Record<
      string,
      unknown
    >;
    delete legacy.research;
    delete legacy.specializations;
    delete legacy.npcs;
    delete legacy.season;
    delete legacy.collections;
    delete legacy.advice;
    delete legacy.townNetwork;
    delete legacy.valueRouteDayKeys;
    delete legacy.weather;
    delete legacy.disaster;
    delete legacy.resilience;
    delete legacy.emergencyBoosts;
    for (const facility of legacy.facilities as Array<Record<string, unknown>>) {
      delete facility.level;
    }

    expect(() => assertRestorableHomesteadGameState(legacy)).not.toThrow();
    const view = getHomesteadGameView(
      legacy as unknown as typeof homestead,
      economy,
      start,
    );
    expect(view.research).toHaveLength(10);
    expect(view.specializations.farm.soilHealth).toBe(60);
    expect(view.npcs).toHaveLength(3);
  });

  it("rejects malformed persisted state", () => {
    const { homestead } = setup();
    const malformed = structuredClone(homestead) as Record<string, unknown>;
    malformed.version = 999;

    expect(() => assertRestorableHomesteadGameState(malformed)).toThrow(
      "庄园存档结构无效",
    );
  });
});
