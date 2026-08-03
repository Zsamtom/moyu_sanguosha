import { describe, expect, it } from "vitest";
import {
  FROSTPEAK_HOMESTEAD_GOOD_CATALOG,
  FROSTPEAK_HOMESTEAD_GOOD_IDS,
  FROSTPEAK_HOMESTEAD_GOODS,
  FROSTPEAK_HOMESTEAD_ORDER_TEMPLATE_CATALOG,
  FROSTPEAK_HOMESTEAD_ORDER_TEMPLATE_IDS,
  FROSTPEAK_HOMESTEAD_ORDER_TEMPLATES,
  FROSTPEAK_HOMESTEAD_RECIPE_CATALOG,
  FROSTPEAK_HOMESTEAD_RECIPE_IDS,
  FROSTPEAK_HOMESTEAD_RECIPES,
  FROSTPEAK_HOMESTEAD_SUBSTITUTIONS,
  FROSTPEAK_HOMESTEAD_VALUE_ROUTE_CATALOG,
  FROSTPEAK_HOMESTEAD_VALUE_ROUTE_IDS,
  FROSTPEAK_HOMESTEAD_VALUE_ROUTES,
  FROSTPEAK_HOMESTEAD_WORLD_EVENT_CATALOG,
  FROSTPEAK_HOMESTEAD_WORLD_EVENT_IDS,
  FROSTPEAK_HOMESTEAD_WORLD_EVENTS,
  type FrostpeakHomesteadResource,
} from "../src/homestead-frostpeak.js";
import {
  FROSTPEAK_CROP_IDS,
  FROSTPEAK_DEPOSIT_IDS,
  FROSTPEAK_FARM_CROPS,
  FROSTPEAK_MINE_DEPOSITS,
  FROSTPEAK_PRODUCT_IDS,
  FROSTPEAK_RANCH_ANIMALS,
} from "../src/towns/frostpeak.js";
import {
  createFarmingGame,
  createHomesteadGame,
  createMineGame,
  createRanchGame,
  getHomesteadGameView,
  type HomesteadLinkedEconomy,
} from "../src/index.js";

function expectUnique(values: readonly string[]): void {
  expect(new Set(values).size).toBe(values.length);
}

function resourceKey(resource: FrostpeakHomesteadResource): string {
  return `${resource.source}:${resource.itemId}`;
}

const primaryUnitValues = new Map<string, number>([
  ...Object.values(FROSTPEAK_FARM_CROPS).map((crop) => [
    `farm:${crop.id}`,
    crop.basePrice,
  ] as const),
  ...Object.values(FROSTPEAK_RANCH_ANIMALS).map((animal) => [
    `ranch:${animal.productId}`,
    animal.productPrice,
  ] as const),
  ...Object.values(FROSTPEAK_MINE_DEPOSITS).map((deposit) => [
    `mine:${deposit.id}`,
    deposit.orePrice,
  ] as const),
]);

const goodUnitValues = new Map(
  FROSTPEAK_HOMESTEAD_GOODS.map((good) => [
    `goods:${good.id}`,
    good.unitValue,
  ] as const),
);

function unitValue(resource: FrostpeakHomesteadResource): number {
  const key = resourceKey(resource);
  const value = resource.source === "goods"
    ? goodUnitValues.get(key)
    : primaryUnitValues.get(key);
  if (value === undefined) {
    throw new Error(`Missing reference value for ${key}`);
  }
  return value;
}

function inputValue(
  resources: readonly FrostpeakHomesteadResource[],
): number {
  return resources.reduce(
    (total, resource) => total + unitValue(resource) * resource.quantity,
    0,
  );
}

describe("Frostpeak complete homestead content pack", () => {
  it("runs through the same complete homestead view as Greenvale", () => {
    const now = Date.UTC(2026, 6, 30, 8);
    const ownerId = "frost-owner";
    const farm = createFarmingGame({
      ownerId,
      ownerName: "霜岭庄园主",
      seed: "frost-farm",
      now,
      townId: "frostpeak",
    });
    const ranch = createRanchGame({
      ownerId,
      ownerName: "霜岭庄园主",
      seed: "frost-ranch",
      now,
      townId: "frostpeak",
    });
    const mine = createMineGame({
      ownerId,
      ownerName: "霜岭庄园主",
      seed: "frost-mine",
      now,
      townId: "frostpeak",
    });
    const game = createHomesteadGame({
      ownerId,
      ownerName: "霜岭庄园主",
      seed: "frost-homestead",
      now,
      townId: "frostpeak",
    });
    const economy: HomesteadLinkedEconomy = {
      farmRevision: farm.revision,
      ranchRevision: ranch.revision,
      mineRevision: mine.revision,
      coins: 2_000,
      farmProduce: farm.produce,
      ranchProducts: ranch.products,
      mineOres: mine.ores,
    };

    const view = getHomesteadGameView(game, economy, now);
    expect(view.activeTownId).toBe("frostpeak");
    expect(view.activeGoodIds).toEqual(FROSTPEAK_HOMESTEAD_GOOD_IDS);
    expect(view.recipes.map(({ id }) => id))
      .toEqual(FROSTPEAK_HOMESTEAD_RECIPE_IDS);
    expect(view.orders.every(({ template }) =>
      template.townId === "frostpeak"
    )).toBe(true);
    expect(view.valueRoutes.every((route) =>
      route.townId === "frostpeak"
    )).toBe(true);
    expect(view.worldEvent.definition.townId).toBe("frostpeak");
    expect(view.specializations.soilAmendmentGoodId).toBe("thermal_compost");
    expect(
      view.specializations.feedPrograms.find(
        ({ definition }) => definition.id === "mineral",
      )?.requiredGoodId,
    ).toBe("alpine_feed");
  });

  it("exports stable, unique ID arrays and record-shaped catalogs", () => {
    const pairs = [
      [FROSTPEAK_HOMESTEAD_GOOD_IDS, FROSTPEAK_HOMESTEAD_GOODS,
        FROSTPEAK_HOMESTEAD_GOOD_CATALOG],
      [FROSTPEAK_HOMESTEAD_RECIPE_IDS, FROSTPEAK_HOMESTEAD_RECIPES,
        FROSTPEAK_HOMESTEAD_RECIPE_CATALOG],
      [FROSTPEAK_HOMESTEAD_ORDER_TEMPLATE_IDS,
        FROSTPEAK_HOMESTEAD_ORDER_TEMPLATES,
        FROSTPEAK_HOMESTEAD_ORDER_TEMPLATE_CATALOG],
      [FROSTPEAK_HOMESTEAD_VALUE_ROUTE_IDS,
        FROSTPEAK_HOMESTEAD_VALUE_ROUTES,
        FROSTPEAK_HOMESTEAD_VALUE_ROUTE_CATALOG],
      [FROSTPEAK_HOMESTEAD_WORLD_EVENT_IDS,
        FROSTPEAK_HOMESTEAD_WORLD_EVENTS,
        FROSTPEAK_HOMESTEAD_WORLD_EVENT_CATALOG],
    ] as const;

    for (const [ids, definitions, catalog] of pairs) {
      expectUnique(ids);
      expect(definitions.map((definition) => definition.id)).toEqual(ids);
      expect(Object.keys(catalog)).toEqual(ids);
      expect(Object.isFrozen(catalog)).toBe(true);
    }
  });

  it("provides both second- and third-tier goods with an acyclic recipe path", () => {
    expect(FROSTPEAK_HOMESTEAD_GOODS.some((good) => good.tier === 2))
      .toBe(true);
    expect(FROSTPEAK_HOMESTEAD_GOODS.some((good) => good.tier === 3))
      .toBe(true);

    const produced = new Set<string>();
    for (const recipe of FROSTPEAK_HOMESTEAD_RECIPES) {
      for (const input of recipe.inputs) {
        if (input.source === "goods") {
          expect(produced.has(input.itemId)).toBe(true);
        }
      }
      produced.add(recipe.output.itemId);

      const good = FROSTPEAK_HOMESTEAD_GOOD_CATALOG[recipe.output.itemId];
      expect(recipe.tier).toBe(good.tier);
      if (recipe.tier === 3) {
        expect(recipe.inputs.some((input) => input.source === "goods"))
          .toBe(true);
      }
    }
    expect(produced).toEqual(new Set(FROSTPEAK_HOMESTEAD_GOOD_IDS));
  });

  it("maps town-neutral upgrade roles to Frostpeak-produced goods", () => {
    expect(FROSTPEAK_HOMESTEAD_SUBSTITUTIONS).toMatchObject({
      coarse_feed: "frost_barley_flour",
      fortified_feed: "alpine_feed",
      soil_conditioner: "thermal_compost",
      iron_ingot: "frost_alloy",
      mining_kit: "insulated_mining_kit",
    });
    expect(
      Object.values(FROSTPEAK_HOMESTEAD_SUBSTITUTIONS).every((itemId) =>
        FROSTPEAK_HOMESTEAD_GOOD_IDS.includes(itemId)
      ),
    ).toBe(true);
  });

  it("requires positive materials, operating funds and time for every recipe", () => {
    for (const recipe of FROSTPEAK_HOMESTEAD_RECIPES) {
      expect(recipe.townId).toBe("frostpeak");
      expect(recipe.durationSeconds).toBeGreaterThan(0);
      expect(recipe.coinCost).toBeGreaterThan(0);
      expect(recipe.inputs.length).toBeGreaterThan(0);
      expect(recipe.inputs.every((input) => input.quantity > 0)).toBe(true);
      expect(recipe.output.quantity).toBeGreaterThan(0);
      expect(recipe.inputs.some((input) =>
        input.source === "goods" &&
        input.itemId === recipe.output.itemId
      )).toBe(false);

      const totalCost = inputValue(recipe.inputs) + recipe.coinCost;
      const outputGood =
        FROSTPEAK_HOMESTEAD_GOOD_CATALOG[recipe.output.itemId];
      const totalOutputValue = outputGood.unitValue * recipe.output.quantity;

      // Processing is worthwhile but deliberately bounded. It cannot create
      // value from nothing or multiply a stockpile through a free loop.
      expect(totalOutputValue).toBeGreaterThan(totalCost);
      expect(totalOutputValue / totalCost).toBeLessThanOrEqual(1.25);
    }
  });

  it("keeps every one of the 24 Frostpeak primary products economically useful", () => {
    const routeResources = FROSTPEAK_HOMESTEAD_VALUE_ROUTES.flatMap(
      (route) => route.requirements,
    );
    const covered = new Set(routeResources.map(resourceKey));
    const expected = new Set([
      ...FROSTPEAK_CROP_IDS.map((id) => `farm:${id}`),
      ...FROSTPEAK_PRODUCT_IDS.map((id) => `ranch:${id}`),
      ...FROSTPEAK_DEPOSIT_IDS.map((id) => `mine:${id}`),
    ]);

    expect(expected.size).toBe(24);
    for (const resource of expected) {
      expect(covered.has(resource), `${resource} has no value route`).toBe(true);
    }
    for (const route of FROSTPEAK_HOMESTEAD_VALUE_ROUTES) {
      expect(route.townId).toBe("frostpeak");
      expect(route.requirements.length).toBeGreaterThan(0);
      expect(route.requirements.every((item) => item.quantity > 0)).toBe(true);
      expect(route.coinReward).toBeGreaterThan(0);
    }
  });

  it("offers full joint orders without a raw-product-only shortcut", () => {
    expect(FROSTPEAK_HOMESTEAD_ORDER_TEMPLATES).toHaveLength(6);
    for (const order of FROSTPEAK_HOMESTEAD_ORDER_TEMPLATES) {
      expect(order.townId).toBe("frostpeak");
      expect(order.requirements.length).toBeGreaterThanOrEqual(3);
      expect(order.requirements.some((item) => item.source === "goods"))
        .toBe(true);
      expect(order.requirements.every((item) => item.quantity > 0)).toBe(true);
      expect(order.coinReward).toBeGreaterThan(0);
      expect(order.reputationReward).toBeGreaterThan(0);
      expect(order.researchReward).toBeGreaterThan(0);
    }
  });

  it("defines local routine, opportunity, weather and persistent disaster events", () => {
    expect(FROSTPEAK_HOMESTEAD_WORLD_EVENTS).toHaveLength(9);
    expect(new Set(
      FROSTPEAK_HOMESTEAD_WORLD_EVENTS.map((event) => event.category),
    )).toEqual(new Set([
      "routine",
      "opportunity",
      "weather",
      "disaster",
    ]));

    for (const event of FROSTPEAK_HOMESTEAD_WORLD_EVENTS) {
      expect(event.townId).toBe("frostpeak");
      expect(event.weatherSignals.length).toBeGreaterThan(0);
      expect(event.options.length).toBeGreaterThanOrEqual(2);
      expectUnique(event.options.map((option) => option.id));
      expect(event.options.every((option) =>
        option.costs.every((cost) => cost.quantity > 0)
      )).toBe(true);
    }

    const persistentDisasters = FROSTPEAK_HOMESTEAD_WORLD_EVENTS.filter(
      (event) =>
        event.category === "disaster" &&
        event.hazard?.persistentUntilResolved,
    );
    expect(persistentDisasters.length).toBeGreaterThanOrEqual(3);
    for (const event of persistentDisasters) {
      expect(event.hazard?.affectedSectors.length).toBeGreaterThan(0);
      expect(
        (event.hazard?.yieldPercent ?? 0) < 0 ||
        (event.hazard?.durationPercent ?? 0) > 0,
      ).toBe(true);
      expect(event.options.some((option) => option.resolvesHazard)).toBe(true);
      expect(event.options.some((option) => !option.resolvesHazard)).toBe(true);
    }
  });
});
