import { describe, expect, it } from "vitest";
import {
  RestaurantRuleError,
  RESTAURANT_PROCESSING,
  RESTAURANT_RECIPES,
  RESTAURANT_SHOP_ITEMS,
  RESTAURANT_TOWN_SUPPLIES,
  applyRestaurantAction,
  assertRestorableRestaurantGameState,
  createRestaurantGame,
  dispatchRestaurantSupply,
  getRestaurantGameView,
  restaurantLocalReputationRecord,
  type RestaurantEconomy,
  type RestaurantGameState,
  type RestaurantIngredientAmount,
} from "../src/index.js";

const start = Date.UTC(2026, 7, 11, 8);

function economy(): RestaurantEconomy {
  return {
    coins: 5_000,
    localReputation: restaurantLocalReputationRecord({
      greenvale: 80,
      frostpeak: 30,
    }),
  };
}

function collectSupply(
  state: RestaurantGameState,
  manifest: readonly RestaurantIngredientAmount[],
  sourceTownId: "greenvale" | "frostpeak" = "greenvale",
): RestaurantGameState {
  const dispatched = dispatchRestaurantSupply(state, {
    shipmentId: `shipment-${state.revision}-${sourceTownId}`,
    sourceTownId,
    manifest,
    now: start,
    durationSeconds: 0,
  });
  return applyRestaurantAction(
    dispatched,
    economy(),
    {
      type: "restaurant_collect_supply",
      shipmentId: `shipment-${state.revision}-${sourceTownId}`,
    },
    start,
  ).state;
}

describe("account restaurant engine", () => {
  it("gives every supplied, processed and shop ingredient a reachable culinary use", () => {
    const recipeInputs = new Set(
      Object.values(RESTAURANT_RECIPES).flatMap((recipe) =>
        recipe.inputs.map(({ ingredientId }) => ingredientId)
      ),
    );
    const processingInputs = new Set(
      Object.values(RESTAURANT_PROCESSING).flatMap((process) =>
        process.inputs.map(({ ingredientId }) => ingredientId)
      ),
    );
    for (const supply of RESTAURANT_TOWN_SUPPLIES) {
      expect(
        recipeInputs.has(supply.ingredientId) ||
          processingInputs.has(supply.ingredientId),
        `${supply.townId}/${supply.itemId} 没有餐厅用途`,
      ).toBe(true);
    }
    for (const item of Object.values(RESTAURANT_SHOP_ITEMS)) {
      expect(recipeInputs.has(item.ingredientId), `${item.name} 没有菜谱用途`)
        .toBe(true);
    }
    for (const process of Object.values(RESTAURANT_PROCESSING)) {
      expect(recipeInputs.has(process.output.ingredientId), `${process.name}产物没有菜谱用途`)
        .toBe(true);
    }
  });

  it("keeps one global warehouse while retaining cross-town provenance", () => {
    let state = createRestaurantGame({
      ownerId: "owner",
      ownerName: "经营者",
      seed: "restaurant-seed",
      now: start,
    });
    state = collectSupply(state, [{ ingredientId: "tomato", quantity: 3 }]);
    state = collectSupply(
      state,
      [{ ingredientId: "cloudberry", quantity: 2 }],
      "frostpeak",
    );

    const view = getRestaurantGameView(state, start);
    expect(view.inventory.tomato).toBe(3);
    expect(view.inventory.cloudberry).toBe(2);
    expect(view.lots.map(({ sourceTownId }) => sourceTownId))
      .toEqual(expect.arrayContaining(["greenvale", "frostpeak"]));
    assertRestorableRestaurantGameState(state);
  });

  it("reserves shipment capacity once and can collect a shipment that exactly fills it", () => {
    let state = createRestaurantGame({
      ownerId: "owner",
      ownerName: "经营者",
      seed: "capacity-seed",
      now: start,
    });
    state.warehouseCapacity = 5;
    state = dispatchRestaurantSupply(state, {
      shipmentId: "exact-capacity",
      sourceTownId: "greenvale",
      manifest: [{ ingredientId: "tomato", quantity: 5 }],
      now: start,
      durationSeconds: 0,
    });
    state = applyRestaurantAction(
      state,
      economy(),
      { type: "restaurant_collect_supply", shipmentId: "exact-capacity" },
      start,
    ).state;
    expect(getRestaurantGameView(state, start).inventory.tomato).toBe(5);
    assertRestorableRestaurantGameState(state);
  });

  it("allows direct vegetables but requires wheat and meat to be processed", () => {
    let state = createRestaurantGame({
      ownerId: "owner",
      ownerName: "经营者",
      seed: "processing-seed",
      now: start,
    });
    state = collectSupply(state, [
      { ingredientId: "tomato", quantity: 4 },
      { ingredientId: "carrot", quantity: 2 },
      { ingredientId: "wheat", quantity: 4 },
      { ingredientId: "raw_chicken", quantity: 1 },
    ]);

    let linked = economy();
    ({ state, economy: linked } = applyRestaurantAction(
      state,
      linked,
      { type: "restaurant_buy_shop_item", itemId: "mineral_salt_pack", quantity: 1 },
      start,
    ));
    ({ state, economy: linked } = applyRestaurantAction(
      state,
      linked,
      { type: "restaurant_prepare_dish", recipeId: "tomato_carrot_salad", quantity: 1 },
      start,
    ));
    expect(state.preparedDishes.tomato_carrot_salad).toBe(2);

    expect(() => applyRestaurantAction(
      state,
      linked,
      { type: "restaurant_start_processing", processingId: "mill_wheat", quantity: 1 },
      start,
    )).toThrowError(RestaurantRuleError);

    ({ state, economy: linked } = applyRestaurantAction(
      state,
      linked,
      { type: "restaurant_learn_technique", techniqueId: "grain_milling", sponsorTownId: "greenvale" },
      start,
    ));
    ({ state, economy: linked } = applyRestaurantAction(
      state,
      linked,
      { type: "restaurant_start_processing", processingId: "mill_wheat", quantity: 1 },
      start,
    ));
    const millingJob = state.processingJobs.at(-1)!;
    ({ state } = applyRestaurantAction(
      state,
      linked,
      { type: "restaurant_collect_processing", jobId: millingJob.id },
      millingJob.completesAt,
    ));
    expect(getRestaurantGameView(state, millingJob.completesAt).inventory.flour)
      .toBe(2);
  });

  it("keeps the processing queue restorable after repeated collection", () => {
    let state = createRestaurantGame({
      ownerId: "owner",
      ownerName: "经营者",
      seed: "processing-retention-seed",
      now: start,
    });
    state = collectSupply(state, [{ ingredientId: "wheat", quantity: 50 }]);
    let linked = economy();
    ({ state, economy: linked } = applyRestaurantAction(
      state,
      linked,
      {
        type: "restaurant_learn_technique",
        techniqueId: "grain_milling",
        sponsorTownId: "greenvale",
      },
      start,
    ));

    for (let index = 0; index < 25; index += 1) {
      ({ state, economy: linked } = applyRestaurantAction(
        state,
        linked,
        { type: "restaurant_start_processing", processingId: "mill_wheat", quantity: 1 },
        start + index,
      ));
      const job = state.processingJobs.at(-1)!;
      ({ state, economy: linked } = applyRestaurantAction(
        state,
        linked,
        { type: "restaurant_collect_processing", jobId: job.id },
        job.completesAt,
      ));
      expect(state.processingJobs).toHaveLength(0);
      assertRestorableRestaurantGameState(state);
    }
  });

  it("never evicts an in-transit shipment when trimming collected history", () => {
    let state = createRestaurantGame({
      ownerId: "owner",
      ownerName: "经营者",
      seed: "shipment-retention-seed",
      now: start,
    });
    state = dispatchRestaurantSupply(state, {
      shipmentId: "slow-frostpeak-shipment",
      sourceTownId: "frostpeak",
      manifest: [{ ingredientId: "cloudberry", quantity: 1 }],
      now: start,
      durationSeconds: 120,
    });

    for (let index = 0; index < 32; index += 1) {
      const shipmentId = `fast-greenvale-shipment-${index}`;
      state = dispatchRestaurantSupply(state, {
        shipmentId,
        sourceTownId: "greenvale",
        manifest: [{ ingredientId: "tomato", quantity: 1 }],
        now: start,
        durationSeconds: 0,
      });
      state = applyRestaurantAction(
        state,
        economy(),
        { type: "restaurant_collect_supply", shipmentId },
        start,
      ).state;
    }

    expect(state.shipments).toHaveLength(32);
    expect(state.shipments.find(({ id }) => id === "slow-frostpeak-shipment")?.status)
      .toBe("in_transit");
    assertRestorableRestaurantGameState(state);
  });

  it("checks and spends the supplier town reputation without borrowing another town", () => {
    const state = createRestaurantGame({
      ownerId: "owner",
      ownerName: "经营者",
      seed: "shop-seed",
      now: start,
    });
    state.shop.offers = [{ itemId: "snow_crab_crate", remaining: 1 }];
    const linked: RestaurantEconomy = {
      coins: 5_000,
      localReputation: restaurantLocalReputationRecord({
        greenvale: 80,
        frostpeak: 5,
      }),
    };
    const frostOffer = getRestaurantGameView(state, start).shop.offers[0]!;
    expect(frostOffer.itemId).toBe("snow_crab_crate");

    expect(() => applyRestaurantAction(
      state,
      linked,
      { type: "restaurant_buy_shop_item", itemId: frostOffer.itemId, quantity: 1 },
      start,
    )).toThrowError(RestaurantRuleError);
    expect(linked.localReputation.greenvale).toBe(80);
    expect(linked.localReputation.frostpeak).toBe(5);
  });

  it("serves each order once and settles rewards idempotently", () => {
    let state = createRestaurantGame({
      ownerId: "owner",
      ownerName: "经营者",
      seed: "service-seed",
      now: start,
    });
    state.preparedDishes.tomato_carrot_salad = 5;
    let linked = economy();
    ({ state, economy: linked } = applyRestaurantAction(
      state,
      linked,
      { type: "restaurant_set_menu", recipeIds: ["tomato_carrot_salad"] },
      start,
    ));
    ({ state, economy: linked } = applyRestaurantAction(
      state,
      linked,
      { type: "restaurant_open_service", serviceTownId: "frostpeak" },
      start,
    ));
    const orderId = state.service!.orders[0]!.id;
    const beforeCoins = linked.coins;
    const beforeGreenvale = linked.localReputation.greenvale;
    const beforeFrostpeak = linked.localReputation.frostpeak;
    ({ state, economy: linked } = applyRestaurantAction(
      state,
      linked,
      { type: "restaurant_serve_order", orderId },
      start,
    ));
    expect(linked.coins).toBeGreaterThan(beforeCoins);
    expect(linked.localReputation.greenvale).toBe(beforeGreenvale);
    expect(linked.localReputation.frostpeak).toBeGreaterThan(beforeFrostpeak);
    expect(() => applyRestaurantAction(
      state,
      linked,
      { type: "restaurant_serve_order", orderId },
      start,
    )).toThrowError(RestaurantRuleError);
  });
});
