import { describe, expect, it } from "vitest";
import {
  restaurantActionEnvelopeSchema,
  restaurantSupplyEnvelopeSchema,
} from "./restaurant.js";

describe("restaurant HTTP schemas", () => {
  it("accepts each server-authoritative restaurant action family", () => {
    const envelope = (action: unknown) => ({
      expectedAccountRevision: 3,
      expectedRestaurantRevision: 5,
      action,
    });
    for (const action of [
      { type: "restaurant_buy_shop_item", itemId: "mineral_salt_pack", quantity: 1 },
      { type: "restaurant_learn_technique", techniqueId: "butchery", sponsorTownId: "greenvale" },
      { type: "restaurant_unlock_recipe", recipeId: "snow_crab_salad", sponsorTownId: "frostpeak" },
      { type: "restaurant_start_processing", processingId: "butcher_pork", quantity: 1 },
      { type: "restaurant_collect_processing", jobId: 1 },
      { type: "restaurant_collect_supply", shipmentId: "shipment-1" },
      { type: "restaurant_prepare_dish", recipeId: "tomato_carrot_salad", quantity: 1 },
      { type: "restaurant_set_menu", recipeIds: [] },
      { type: "restaurant_open_service", serviceTownId: "greenvale" },
      { type: "restaurant_serve_order", orderId: "order-1" },
      { type: "restaurant_close_service" },
    ]) {
      expect(() => restaurantActionEnvelopeSchema.parse(envelope(action)))
        .not.toThrow();
    }
  });

  it("requires the restaurant and exact source-town revision vector for supply", () => {
    const valid = {
      expectedAccountRevision: 3,
      expectedRestaurantRevision: 5,
      expectedFarmRevision: 7,
      expectedRanchRevision: 4,
      expectedMineRevision: 2,
      expectedHomesteadRevision: 6,
      action: {
        type: "restaurant_supply_from_town",
        sourceTownId: "frostpeak",
        lines: [{ source: "farm", itemId: "cloudberry", quantity: 2 }],
      },
    };
    expect(restaurantSupplyEnvelopeSchema.parse(valid)).toBeTruthy();
    const { expectedRanchRevision: _missing, ...incomplete } = valid;
    expect(() => restaurantSupplyEnvelopeSchema.parse(incomplete)).toThrow();
  });

  it("rejects injected rewards, unsupported sources and quantity overflow", () => {
    expect(() => restaurantActionEnvelopeSchema.parse({
      expectedAccountRevision: 0,
      expectedRestaurantRevision: 0,
      action: {
        type: "restaurant_serve_order",
        orderId: "order-1",
        coinReward: 999_999,
      },
    })).toThrow();
    expect(() => restaurantSupplyEnvelopeSchema.parse({
      expectedAccountRevision: 0,
      expectedRestaurantRevision: 0,
      expectedFarmRevision: 0,
      expectedRanchRevision: 0,
      expectedMineRevision: 0,
      expectedHomesteadRevision: 0,
      action: {
        type: "restaurant_supply_from_town",
        sourceTownId: "greenvale",
        lines: [{ source: "mine", itemId: "coal", quantity: 1 }],
      },
    })).toThrow();
  });
});
