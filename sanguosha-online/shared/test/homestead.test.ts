import { describe, expect, it } from "vitest";
import {
  FARMING_CROP_IDS,
  HOMESTEAD_VALUE_ROUTES,
  HOMESTEAD_VALUE_ROUTE_IDS,
  HOMESTEAD_ORDER_TEMPLATES,
  HOMESTEAD_WORLD_EVENTS,
  MINE_DEPOSIT_IDS,
  RANCH_PRODUCT_IDS,
  RESTAURANT_TOWN_SUPPLIES,
  HomesteadRuleError,
  applyHomesteadAction,
  assertRestorableHomesteadGameState,
  createFarmingGame,
  createHomesteadGame,
  createMineGame,
  createRanchGame,
  compileHomesteadGeneratedEvent,
  getHomesteadGameView,
  getHomesteadProductionRules,
  applyHomesteadWorldEventDecision,
  refreshHomesteadGame,
  type HomesteadLinkedEconomy,
} from "../src/index.js";

const start = Date.UTC(2026, 6, 30, 8);
const day = 24 * 60 * 60_000;
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
      [...HOMESTEAD_VALUE_ROUTE_IDS.flatMap((routeId) =>
        HOMESTEAD_VALUE_ROUTES[routeId].requirements.map(
          ({ source, itemId }) => `${source}:${itemId}`,
        )
      ), ...RESTAURANT_TOWN_SUPPLIES
        .filter(({ townId }) => townId === "greenvale")
        .map(({ source, itemId }) => `${source}:${itemId}`)],
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

  it("keeps unlock, travel, and merchant mutations inside account transactions", () => {
    const { homestead, economy } = setup();
    expect(() => applyHomesteadAction(
      homestead,
      economy,
      { type: "homestead_switch_town", townId: "frostpeak" },
      start,
    )).toThrowError(HomesteadRuleError);
    expect(() => applyHomesteadAction(
      homestead,
      economy,
      { type: "homestead_buy_merchant_item", itemId: "rail_pass" },
      start,
    )).toThrowError(HomesteadRuleError);
  });

  it("exposes and executes the Frostpeak local industry and landmark chain", () => {
    const homestead = createHomesteadGame({
      ownerId,
      ownerName: "庄主",
      seed: "frostpeak-local-chain",
      now: start,
      townId: "frostpeak",
    });
    homestead.reputation = 8;
    homestead.townNetwork.towns.frostpeak.inventory = {
      snow_potato: 20,
      yak_milk: 10,
      frost_crystal: 10,
    };
    const { economy: baseEconomy } = setup();
    const economy: HomesteadLinkedEconomy = {
      ...baseEconomy,
      activeTownId: "frostpeak",
      unlockedTownIds: ["greenvale", "frostpeak"],
    };

    const initialView = getHomesteadGameView(homestead, economy, start);
    const frostpeak = initialView.towns.find(
      ({ definition }) => definition.id === "frostpeak",
    )!;
    expect(frostpeak.sectors).toHaveLength(3);
    expect(frostpeak.currentProblem?.id).toBe("blocked_supply_road");
    expect(frostpeak.inventory.snow_potato).toBe(20);

    const started = applyHomesteadAction(
      homestead,
      economy,
      { type: "homestead_start_town_sector", sectorId: "farm" },
      start,
    );
    const collected = applyHomesteadAction(
      started.homestead,
      started.economy,
      { type: "homestead_collect_town_sector", sectorId: "farm" },
      start + 8 * 60_000,
    );
    expect(
      collected.homestead.townNetwork.towns.frostpeak.inventory.snow_potato,
    ).toBe(23);

    const upgraded = applyHomesteadAction(
      collected.homestead,
      collected.economy,
      { type: "homestead_upgrade_town_sector", sectorId: "farm" },
      start + 8 * 60_000 + 1,
    );
    expect(
      upgraded.homestead.townNetwork.towns.frostpeak.sectors.farm.level,
    ).toBe(2);

    const sold = applyHomesteadAction(
      upgraded.homestead,
      upgraded.economy,
      {
        type: "homestead_sell_town_resource",
        resourceId: "snow_potato",
        quantity: 1,
      },
      start + 8 * 60_000 + 2,
    );
    expect(sold.economy.coins).toBeGreaterThan(upgraded.economy.coins);

    const resolved = applyHomesteadAction(
      sold.homestead,
      sold.economy,
      {
        type: "homestead_resolve_town_problem",
        problemId: "blocked_supply_road",
      },
      start + 8 * 60_000 + 3,
    );
    expect(resolved.homestead.reputation).toBe(18);
    expect(
      resolved.homestead.townNetwork.towns.frostpeak.reputation,
    ).toBe(18);

    const restored = applyHomesteadAction(
      resolved.homestead,
      resolved.economy,
      { type: "homestead_restore_town_landmark" },
      start + 8 * 60_000 + 4,
    );
    expect(restored.homestead.reputation).toBe(25);
    expect(
      restored.homestead.townNetwork.towns.frostpeak.landmarkStage,
    ).toBe(1);
    expect(
      getHomesteadGameView(
        restored.homestead,
        restored.economy,
        start + 8 * 60_000 + 4,
      ).towns.find(({ active }) => active)?.landmarkStage,
    ).toBe(1);
  });

  it("gives new and late-joining estates a complete personal season", () => {
    const { homestead, economy } = setup();
    expect(homestead.season.id).toBe("P1");
    expect(
      homestead.season.endsAt - homestead.season.startsAt,
    ).toBe(56 * day);

    const nextSeason = refreshHomesteadGame(
      homestead,
      homestead.season.endsAt + 1,
    );
    expect(nextSeason.season.id).toBe("P2");
    expect(nextSeason.season.startsAt).toBe(homestead.season.endsAt);

    const legacyLateJoiner = createHomesteadGame({
      ownerId,
      ownerName: "迟到庄主",
      seed: "late-joiner",
      now: start,
    });
    legacyLateJoiner.season = {
      id: "S4",
      startsAt: start - 50 * day,
      endsAt: start + 6 * day,
      score: 0,
      claimedMilestones: [],
      counters: {
        jobs: 0,
        orders: 0,
        specializations: 0,
        community: 0,
      },
    };
    const migrated = getHomesteadGameView(
      legacyLateJoiner,
      economy,
      start,
    );
    expect(migrated.season.id).toBe("P1");
    expect(migrated.season.endsAt - migrated.season.startsAt).toBe(56 * day);
  });

  it("persists player intent for the bounded manor manager", () => {
    const { homestead, economy } = setup();
    const updated = applyHomesteadAction(
      homestead,
      economy,
      {
        type: "homestead_update_ai_profile",
        enabled: true,
        goal: "research",
        risk: "safe",
        focus: "mine",
      },
      start,
    );
    expect(updated.homestead.aiProfile).toEqual({
      enabled: true,
      goal: "research",
      risk: "safe",
      focus: "mine",
    });
    expect(
      getHomesteadGameView(updated.homestead, updated.economy, start)
        .advice.steps,
    ).toHaveLength(3);
  });

  it("compiles only solvable same-town generated event blueprints", () => {
    const safeTemplate = Object.values(HOMESTEAD_WORLD_EVENTS).find(
      (definition) =>
        (definition.townId ?? "greenvale") === "greenvale" &&
        definition.hazard === undefined &&
        definition.options.some(
          (option) =>
            option.coinCost === 0 &&
            option.costs.length === 0 &&
            option.reputationReward >= 0,
        ),
    )!;
    const blueprint = {
      townId: "greenvale" as const,
      dayKey: "2026-07-30",
      templateId: safeTemplate.id,
      narrative: "  商队根据当前库存，提出了新的合作安排。\n请庄主决定。  ",
    };
    const first = compileHomesteadGeneratedEvent(
      blueprint,
      [safeTemplate.id],
    );
    const second = compileHomesteadGeneratedEvent(
      blueprint,
      [safeTemplate.id],
    );
    expect(first).toEqual(second);
    expect(first.instanceId).toContain("generated:greenvale:2026-07-30:");
    expect(first.narrative).not.toContain("\n");
    expect(() => compileHomesteadGeneratedEvent(
      blueprint,
      [],
    )).toThrow("未通过候选白名单");
    const hazardTemplate = Object.values(HOMESTEAD_WORLD_EVENTS).find(
      (definition) => definition.hazard !== undefined,
    )!;
    expect(() => compileHomesteadGeneratedEvent(
      {
        ...blueprint,
        townId: hazardTemplate.townId ?? "greenvale",
        templateId: hazardTemplate.id,
      },
      [hazardTemplate.id],
    )).toThrow("灾害事件只能由权威天气与规则系统触发");
  });

  it("stores only a display-only whitelisted LLM merchant recommendation", () => {
    const { homestead } = setup();
    const directed = applyHomesteadWorldEventDecision(
      homestead,
      homestead.worldEvent.eventId,
      "llm",
      start,
      {
        narrative: "三业库存已经形成新的调度压力。",
        recommendation: "若今天需要跨镇，再考虑购买联运票。",
        npcLine: "先确认行程，再花这笔钱。",
        merchantRecommendationId: "rail_pass",
      },
    );
    expect(directed.worldEvent.eventId).toBe(
      homestead.worldEvent.eventId,
    );
    expect(directed.advice).toMatchObject({
      source: "llm",
      merchantRecommendationId: "rail_pass",
    });
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

  it("consumes an imported cargo crate only in its destination linkage project", () => {
    const { homestead, economy } = setup();
    homestead.cargoInventory.frostpeak_coldchain_supplies = 1;
    economy.farmProduce.grape = 2;
    const result = applyHomesteadAction(
      homestead,
      economy,
      {
        type: "homestead_complete_value_route",
        routeId: "greenvale_frostpeak_coldchain_link",
      },
      start,
    );

    expect(result.homestead.cargoInventory.frostpeak_coldchain_supplies)
      .toBe(0);
    expect(result.economy.farmProduce.grape).toBe(0);
    expect(result.economy.coins).toBe(2_980);
    expect(result.homestead.reputation).toBe(10);
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

  it("assigns unique monotonic IDs when one action creates several logs", () => {
    const { homestead, economy } = setup();
    homestead.statistics.ordersCompleted = 75;
    homestead.statistics.eventsResolved = 30;
    const view = getHomesteadGameView(homestead, economy, start);
    const selected = view.worldEvent.definition.options.find(
      (option) => option.costs.length === 0,
    ) ?? view.worldEvent.definition.options[0]!;
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
    const ids = result.homestead.logs.map(({ id }) => id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(result.homestead.nextLogId).toBeGreaterThan(ids.length);
  });

  it("repairs duplicate legacy log IDs and initializes the counter", () => {
    const { homestead } = setup();
    const legacy = homestead as Omit<typeof homestead, "nextLogId"> & {
      nextLogId?: number;
    };
    delete legacy.nextLogId;
    legacy.logs = [
      { id: "legacy-duplicate", at: start, type: "event", message: "一" },
      { id: "legacy-duplicate", at: start, type: "event", message: "二" },
    ];

    const migrated = refreshHomesteadGame(
      legacy as typeof homestead,
      start,
    );
    const ids = migrated.logs.map(({ id }) => id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(migrated.nextLogId).toBeGreaterThan(1);
  });

  it("shows daily decision production effects, applies them, and expires them", () => {
    const { homestead, economy } = setup();
    homestead.worldEvent = {
      eventId: "steady_weather",
      dayKey: homestead.dayKey,
      selectedOptionId: null,
      narrative: "三业进入稳定排产窗口。",
      source: "rules",
      startedDayKey: homestead.dayKey,
      durationDays: 1,
      unresolvedDays: 0,
      severity: 0,
    };
    const option = getHomesteadGameView(homestead, economy, start)
      .worldEvent.definition.options.find(
        ({ id }) => id === "focus_production",
      );
    expect(option?.productionEffect?.label).toContain("三业工期 -6%");

    const result = applyHomesteadAction(
      homestead,
      economy,
      { type: "homestead_choose_event", optionId: "focus_production" },
      start,
    );
    const rules = getHomesteadProductionRules(result.homestead);
    expect(rules.farm.label).toContain("专注排产");
    expect(rules.ranch.label).toContain("专注排产");
    expect(rules.mine.label).toContain("专注排产");

    const next = refreshHomesteadGame(
      result.homestead,
      start + 24 * 60 * 60_000,
    );
    expect(next.decisionEffect).toBeNull();
    expect(getHomesteadProductionRules(next).farm.label).not.toContain(
      "专注排产",
    );
  });

  it("turns research nodes into direct three-sector production modifiers", () => {
    const { homestead } = setup();
    const baseline = getHomesteadProductionRules(homestead);
    homestead.research.unlocked.push(
      "soil_science",
      "crop_rotation",
      "animal_nutrition",
      "animal_genetics",
      "geology",
      "deep_mining",
      "estate_engineering",
    );
    const researched = getHomesteadProductionRules(homestead);

    expect(researched.farm.yieldPercent - baseline.farm.yieldPercent).toBe(8);
    expect(researched.ranch.yieldPercent - baseline.ranch.yieldPercent).toBe(8);
    expect(researched.mine.yieldPercent - baseline.mine.yieldPercent).toBe(8);
    expect(researched.farm.durationPercent).toBe(
      baseline.farm.durationPercent - 8,
    );
    expect(researched.ranch.durationPercent).toBe(
      baseline.ranch.durationPercent - 3,
    );
    expect(researched.mine.durationPercent).toBe(
      baseline.mine.durationPercent - 8,
    );
  });

  it("requires enough reputation for reputation-cost event options", () => {
    const { homestead, economy } = setup();
    homestead.reputation = 2;
    homestead.worldEvent = {
      eventId: "harvest_festival",
      dayKey: homestead.dayKey,
      selectedOptionId: null,
      narrative: "城镇正在筹备丰收庆典。",
      source: "rules",
      startedDayKey: homestead.dayKey,
      durationDays: 1,
      unresolvedDays: 0,
      severity: 0,
    };

    const option = getHomesteadGameView(homestead, economy, start)
      .worldEvent.definition.options.find(
        ({ id }) => id === "open_market_stall",
      )!;
    expect(option.missingReputation).toBe(1);
    expect(option.canChoose).toBe(false);
    expect(() =>
      applyHomesteadAction(
        homestead,
        economy,
        {
          type: "homestead_choose_event",
          optionId: "open_market_stall",
        },
        start,
      )
    ).toThrowError("当地声望不足，还差 1");

    homestead.reputation = 3;
    const result = applyHomesteadAction(
      homestead,
      economy,
      {
        type: "homestead_choose_event",
        optionId: "open_market_stall",
      },
      start,
    );
    expect(result.homestead.reputation).toBe(0);
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

  it("fails closed unless trusted weather explicitly enables mechanics", () => {
    const { homestead } = setup();
    homestead.specializations.farm.yieldBonusPercent = 7;
    homestead.specializations.ranch.productBonusPercent = 0;
    homestead.specializations.mine.oreBonusPercent = 0;

    for (const [source, mechanicsEnabled] of [
      ["last_known_good", true],
      ["fallback", true],
      ["live", undefined],
      ["rules", undefined],
      [undefined, true],
    ] as const) {
      const state = structuredClone(homestead);
      state.weather = {
        weatherId: "heatwave",
        dayKey: state.dayKey,
        ...(source === undefined ? {} : { source }),
        ...(mechanicsEnabled === undefined ? {} : { mechanicsEnabled }),
      };

      const rules = getHomesteadProductionRules(state);

      expect(rules.farm).toMatchObject({
        yieldPercent: 7,
        durationPercent: 0,
      });
      expect(rules.ranch).toMatchObject({
        yieldPercent: 0,
        durationPercent: 0,
      });
      expect(rules.mine).toMatchObject({
        yieldPercent: 0,
        durationPercent: 0,
      });
      expect(rules.farm.label).toContain("数据回退");
    }

    for (const source of ["live", "rules"] as const) {
      const state = structuredClone(homestead);
      state.weather = {
        weatherId: "heatwave",
        dayKey: state.dayKey,
        source,
        mechanicsEnabled: true,
      };

      const rules = getHomesteadProductionRules(state);

      expect(rules.farm.yieldPercent).toBeLessThan(7);
      expect(rules.farm.durationPercent).toBeGreaterThan(0);
    }
  });

  it("applies unresolved disasters to production and clears them after repair", () => {
    const { homestead, economy } = setup();
    homestead.disaster = {
      eventId: "mountain_seepage",
      contentEventId: "mountain_seepage",
      startedDayKey: homestead.dayKey,
      remainingDays: 3,
      unresolvedDays: 0,
      severity: 1,
      mitigated: false,
      resolution: null,
    };
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

  it("reduces local reputation for ignored disasters without going below zero", () => {
    const { homestead } = setup();
    homestead.reputation = 5;
    homestead.disaster = {
      eventId: "mountain_seepage",
      contentEventId: "mountain_seepage",
      startedDayKey: homestead.dayKey,
      remainingDays: 3,
      unresolvedDays: 0,
      severity: 1,
      mitigated: false,
      resolution: null,
    };

    const ignored = refreshHomesteadGame(
      homestead,
      start + 24 * 60 * 60_000,
    );
    expect(ignored.reputation).toBeLessThan(5);
    expect(ignored.reputation).toBeGreaterThanOrEqual(0);
    expect(ignored.logs.some((entry) =>
      entry.message.includes("声望下降")
    )).toBe(true);

    ignored.reputation = 1;
    const ignoredAgain = refreshHomesteadGame(
      ignored,
      start + 2 * 24 * 60 * 60_000,
    );
    expect(ignoredAgain.reputation).toBe(0);
  });

  it("does not invent persistent disasters without a trusted live alert", () => {
    const { homestead } = setup();
    let refreshed = homestead;
    for (let elapsedDays = 1; elapsedDays <= 60; elapsedDays += 1) {
      refreshed = refreshHomesteadGame(
        refreshed,
        start + elapsedDays * day,
      );
      expect(refreshed.disaster).toBeNull();
    }
  });

  it("settles only active disaster days and preserves the starting severity", () => {
    const { homestead } = setup();
    homestead.reputation = 100;
    homestead.disaster = {
      eventId: "cold_snap",
      contentEventId: "cold_snap",
      startedDayKey: homestead.dayKey,
      remainingDays: 1,
      unresolvedDays: 0,
      severity: 3,
      mitigated: false,
      resolution: null,
      reputationPenaltyPaid: 0,
      temporaryOptionId: null,
    };

    const settled = refreshHomesteadGame(homestead, start + 30 * day);
    expect(settled.reputation).toBe(94);
    expect(settled.logs.some(({ message }) =>
      message.includes("连续 1 个生效日")
    )).toBe(true);
  });

  it("produces the same disaster penalty for daily and offline refreshes", () => {
    const { homestead } = setup();
    homestead.reputation = 100;
    homestead.disaster = {
      eventId: "mountain_seepage",
      contentEventId: "mountain_seepage",
      startedDayKey: homestead.dayKey,
      remainingDays: 3,
      unresolvedDays: 0,
      severity: 1,
      mitigated: false,
      resolution: null,
      reputationPenaltyPaid: 0,
      temporaryOptionId: null,
    };

    const offline = refreshHomesteadGame(homestead, start + 2 * day);
    const daily = refreshHomesteadGame(
      refreshHomesteadGame(homestead, start + day),
      start + 2 * day,
    );
    expect(offline.reputation).toBe(94);
    expect(offline.reputation).toBe(daily.reputation);
    expect(offline.disaster).toMatchObject({
      remainingDays: 1,
      unresolvedDays: 2,
      severity: 2,
      reputationPenaltyPaid: 6,
    });
    expect(offline.disaster).toMatchObject({
      remainingDays: daily.disaster?.remainingDays,
      unresolvedDays: daily.disaster?.unresolvedDays,
      severity: daily.disaster?.severity,
      reputationPenaltyPaid: daily.disaster?.reputationPenaltyPaid,
    });
  });

  it("does not settle a disaster when the clock moves backward", () => {
    const { homestead } = setup();
    homestead.reputation = 50;
    homestead.disaster = {
      eventId: "mountain_seepage",
      contentEventId: "mountain_seepage",
      startedDayKey: homestead.dayKey,
      remainingDays: 3,
      unresolvedDays: 0,
      severity: 1,
      mitigated: false,
      resolution: null,
      reputationPenaltyPaid: 0,
      temporaryOptionId: null,
    };

    const rolledBack = refreshHomesteadGame(homestead, start - day);
    expect(rolledBack.dayKey).toBe(homestead.dayKey);
    expect(rolledBack.reputation).toBe(50);
    expect(rolledBack.disaster).toMatchObject({
      remainingDays: 3,
      unresolvedDays: 0,
      reputationPenaltyPaid: 0,
    });
  });

  it("caps reputation loss across one persistent disaster lifecycle", () => {
    const { economy } = setup();
    const homestead = createHomesteadGame({
      ownerId,
      ownerName: "庄主",
      seed: "frost-cap-seed",
      now: start,
      townId: "frostpeak",
    });
    homestead.reputation = 100;
    homestead.disaster = {
      eventId: "cold_snap",
      contentEventId: "frost_rail_icing",
      providerAlertId: "provider-alert-cap",
      startedDayKey: homestead.dayKey,
      remainingDays: 3,
      unresolvedDays: 0,
      severity: 1,
      mitigated: false,
      resolution: null,
      reputationPenaltyPaid: 0,
      temporaryOptionId: null,
    };

    const initialView = getHomesteadGameView(homestead, economy, start);
    expect(initialView.disaster).toMatchObject({
      nextReputationLoss: 2,
      reputationPenaltyContinues: true,
    });

    const capped = refreshHomesteadGame(homestead, start + 10 * day);
    expect(capped.reputation).toBe(88);
    expect(capped.disaster).toMatchObject({
      providerAlertId: "provider-alert-cap",
      remainingDays: 1,
      reputationPenaltyPaid: 12,
    });
    const cappedView = getHomesteadGameView(
      capped,
      economy,
      start + 10 * day,
    );
    expect(cappedView.disaster).toMatchObject({
      nextReputationLoss: 0,
      reputationPenaltyContinues: false,
    });

    const later = refreshHomesteadGame(capped, start + 11 * day);
    expect(later.reputation).toBe(88);
    expect(later.disaster?.reputationPenaltyPaid).toBe(12);
  });

  it("allows one temporary disaster plan without progression credit", () => {
    const { economy } = setup();
    const homestead = createHomesteadGame({
      ownerId,
      ownerName: "庄主",
      seed: "frost-temporary-seed",
      now: start,
      townId: "frostpeak",
    });
    homestead.reputation = 100;
    homestead.statistics.eventsResolved = 9;
    homestead.disaster = {
      eventId: "cold_snap",
      contentEventId: "frost_rail_icing",
      providerAlertId: "provider-alert-rail",
      startedDayKey: homestead.dayKey,
      remainingDays: 3,
      unresolvedDays: 0,
      severity: 1,
      mitigated: false,
      resolution: null,
      reputationPenaltyPaid: 0,
      temporaryOptionId: null,
    };
    const directed = applyHomesteadWorldEventDecision(
      homestead,
      "frost_rail_icing",
      "rules",
      start,
    );
    const temporary = applyHomesteadAction(
      directed,
      economy,
      {
        type: "homestead_choose_event",
        optionId: "hold_rail_shipments",
      },
      start + 1,
    );
    expect(temporary.homestead.disaster).toMatchObject({
      mitigated: false,
      temporaryOptionId: "hold_rail_shipments",
    });
    expect(temporary.homestead.statistics.eventsResolved).toBe(9);
    expect(temporary.homestead.season.counters.community).toBe(0);
    expect(temporary.homestead.season.score).toBe(0);
    expect(temporary.homestead.collections.some(
      ({ id }) => id === "renown:events:10",
    )).toBe(false);

    const nextDay = refreshHomesteadGame(
      temporary.homestead,
      start + day,
    );
    const nextView = getHomesteadGameView(
      nextDay,
      temporary.economy,
      start + day,
    );
    expect(
      nextView.worldEvent.definition.options.find(
        ({ id }) => id === "hold_rail_shipments",
      ),
    ).toMatchObject({
      canChoose: false,
      temporaryAlreadyUsed: true,
    });
    expect(() =>
      applyHomesteadAction(
        nextDay,
        temporary.economy,
        {
          type: "homestead_choose_event",
          optionId: "hold_rail_shipments",
        },
        start + day,
      )
    ).toThrowError("本次灾害已经执行过临时方案");

    nextDay.goods.frost_alloy = 1;
    temporary.economy.mineOres.lignite = 3;
    const resolved = applyHomesteadAction(
      nextDay,
      temporary.economy,
      {
        type: "homestead_choose_event",
        optionId: "supply_rail_deicing",
      },
      start + day + 1,
    );
    expect(resolved.homestead.disaster?.mitigated).toBe(true);
    expect(resolved.homestead.statistics.eventsResolved).toBe(10);
    expect(resolved.homestead.season.counters.community).toBe(1);
    expect(resolved.homestead.collections.some(
      ({ id }) => id === "renown:events:10",
    )).toBe(true);
    expect(resolved.homestead.handledWeatherAlertIds).toContain(
      "provider-alert-rail",
    );
  });

  it("projects event affordability and supports repeatable resilience sinks", () => {
    const { homestead, economy } = setup();
    homestead.disaster = {
      eventId: "mountain_seepage",
      contentEventId: "mountain_seepage",
      startedDayKey: homestead.dayKey,
      remainingDays: 3,
      unresolvedDays: 0,
      severity: 1,
      mitigated: false,
      resolution: null,
    };
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
    const baselineRules = getHomesteadProductionRules(homestead);

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
    expect(getHomesteadProductionRules(farm.homestead).farm.yieldPercent)
      .toBeGreaterThan(baselineRules.farm.yieldPercent);

    const ranch = applyHomesteadAction(
      farm.homestead,
      farm.economy,
      { type: "homestead_run_feed_program", programId: "pasture" },
      start + 1,
    );
    expect(ranch.homestead.specializations.ranch.herdHealth).toBeGreaterThan(65);
    expect(ranch.economy.ranchProducts.egg).toBeGreaterThan(0);
    expect(getHomesteadProductionRules(ranch.homestead).ranch.yieldPercent)
      .toBeGreaterThan(baselineRules.ranch.yieldPercent);

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
    expect(getHomesteadProductionRules(mine.homestead).mine.yieldPercent)
      .toBeGreaterThan(baselineRules.mine.yieldPercent);
    expect(mine.homestead.season.counters.specializations).toBe(3);
  });

  it("turns mine protection upgrades into an immediate next-batch mine bonus", () => {
    const { homestead, economy } = setup();
    homestead.goods.iron_ingot = 1;

    const upgraded = applyHomesteadAction(
      homestead,
      economy,
      { type: "homestead_upgrade_mine_protection" },
      start,
    );

    expect(upgraded.homestead.specializations.mine.protectionLevel).toBe(1);
    expect(upgraded.homestead.specializations.mine.oreBonusPercent).toBe(5);
    expect(getHomesteadProductionRules(upgraded.homestead).mine.yieldPercent)
      .toBeGreaterThan(getHomesteadProductionRules(homestead).mine.yieldPercent);
  });

  it("consumes soil conditioner and carries its soil gain into later farm batches", () => {
    const { homestead, economy } = setup();
    homestead.research.unlocked.push("soil_science");
    homestead.goods.soil_conditioner = 1;
    const baselineRules = getHomesteadProductionRules(homestead);

    const improved = applyHomesteadAction(
      homestead,
      economy,
      {
        type: "homestead_plan_rotation",
        cropFamily: "grain",
        useFertilizer: true,
      },
      start,
    );

    expect(improved.homestead.goods.soil_conditioner).toBe(0);
    expect(improved.homestead.specializations.farm.fertilizerApplications)
      .toBe(1);
    expect(improved.homestead.specializations.farm.soilHealth).toBe(82);
    expect(getHomesteadProductionRules(improved.homestead).farm.yieldPercent)
      .toBeGreaterThan(baselineRules.farm.yieldPercent);
  });

  it("consumes fortified feed and carries herd health into later ranch batches", () => {
    const { homestead, economy } = setup();
    homestead.research.unlocked.push("animal_nutrition", "animal_genetics");
    homestead.goods.fortified_feed = 1;
    const baselineRules = getHomesteadProductionRules(homestead);

    const improved = applyHomesteadAction(
      homestead,
      economy,
      { type: "homestead_run_feed_program", programId: "mineral" },
      start,
    );

    expect(improved.homestead.goods.fortified_feed).toBe(0);
    expect(improved.homestead.specializations.ranch.herdHealth).toBe(82);
    expect(improved.homestead.specializations.ranch.lastFeedProgram)
      .toBe("mineral");
    expect(getHomesteadProductionRules(improved.homestead).ranch.yieldPercent)
      .toBeGreaterThan(baselineRules.ranch.yieldPercent);
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
    homestead.researchPoints = 30;
    homestead.reputation = 40;
    homestead.statistics.jobsCollected = 4;
    homestead.statistics.facilitiesBuilt = 2;
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
    expect(job?.outputQuantity).toBe(2);
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

  it("requires local mastery for the final lifetime honor reward", () => {
    const { homestead, economy } = setup();
    homestead.collections = getHomesteadGameView(
      homestead,
      economy,
      start,
    ).collections.map(({ id }) => ({ id, unlockedAt: start }));
    expect(() =>
      applyHomesteadAction(
        homestead,
        economy,
        {
          type: "homestead_claim_honor_reward",
          milestoneId: "legend",
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
          type: "homestead_claim_honor_reward",
          milestoneId: "legend",
        },
        start,
      )
    ).not.toThrow();
  });

  it("preserves unclaimed legacy season progress when migrating to permanent honor", () => {
    const { homestead, economy } = setup();
    const legacy = structuredClone(homestead) as typeof homestead & {
      honor?: unknown;
    };
    delete legacy.honor;
    legacy.season.score = 180;
    legacy.season.claimedMilestones = [];

    const migrated = getHomesteadGameView(legacy, economy, start);

    expect(migrated.honor.score).toBe(180);
    expect(
      migrated.honor.milestones.find(
        ({ definition }) => definition.id === "specialist",
      ),
    ).toMatchObject({ canClaim: true, claimed: false });
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
    delete legacy.aiProfile;
    delete legacy.townNetwork;
    delete legacy.valueRouteDayKeys;
    delete legacy.weather;
    delete legacy.decisionEffect;
    delete legacy.cargoInventory;
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
    expect(view.research).toHaveLength(12);
    expect(view.specializations.farm.soilHealth).toBe(60);
    expect(view.npcs).toHaveLength(3);
    expect(view.aiProfile).toEqual({
      enabled: true,
      goal: "balanced",
      risk: "balanced",
      focus: "processing",
    });
    expect(view.advice.steps).toHaveLength(3);
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
