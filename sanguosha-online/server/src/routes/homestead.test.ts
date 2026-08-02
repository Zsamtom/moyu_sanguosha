import { describe, expect, it } from "vitest";
import { homesteadActionEnvelopeSchema } from "./homestead.js";

describe("homestead HTTP schemas", () => {
  it("requires all five optimistic revisions", () => {
    expect(homesteadActionEnvelopeSchema.parse({
      townId: "greenvale",
      expectedFarmRevision: 8,
      expectedRanchRevision: 5,
      expectedMineRevision: 3,
      expectedHomesteadRevision: 2,
      expectedAccountRevision: 1,
      action: {
        type: "homestead_start_job",
        recipeId: "mill_flour",
      },
    })).toBeTruthy();

    expect(() => homesteadActionEnvelopeSchema.parse({
      expectedFarmRevision: 8,
      expectedRanchRevision: 5,
      expectedMineRevision: 3,
      expectedAccountRevision: 1,
      action: {
        type: "homestead_collect_job",
        facilityId: "mill",
      },
    })).toThrow();
  });

  it("rejects unknown recipes and injected resource changes", () => {
    expect(() => homesteadActionEnvelopeSchema.parse({
      expectedFarmRevision: 0,
      expectedRanchRevision: 0,
      expectedMineRevision: 0,
      expectedHomesteadRevision: 0,
      expectedAccountRevision: 0,
      action: {
        type: "homestead_start_job",
        recipeId: "free_gold",
      },
    })).toThrow();

    expect(() => homesteadActionEnvelopeSchema.parse({
      expectedFarmRevision: 0,
      expectedRanchRevision: 0,
      expectedMineRevision: 0,
      expectedHomesteadRevision: 0,
      expectedAccountRevision: 0,
      action: {
        type: "homestead_complete_order",
        orderId: "today:order",
        coinReward: 999_999,
      },
    })).toThrow();
  });

  it("accepts every deep-operation family and rejects cross-domain ids", () => {
    const envelope = (action: unknown) => ({
      townId: "greenvale",
      expectedFarmRevision: 1,
      expectedRanchRevision: 1,
      expectedMineRevision: 1,
      expectedHomesteadRevision: 1,
      expectedAccountRevision: 1,
      action,
    });
    for (const action of [
      { type: "homestead_unlock_research", nodeId: "soil_science" },
      { type: "homestead_upgrade_facility", facilityId: "mill" },
      {
        type: "homestead_plan_rotation",
        cropFamily: "grain",
        useFertilizer: false,
      },
      { type: "homestead_run_feed_program", programId: "pasture" },
      { type: "homestead_upgrade_mine_protection" },
      { type: "homestead_survey_layer", layerId: "shallow" },
      {
        type: "homestead_talk_npc",
        npcId: "agronomist_lin",
        topicId: "soil",
      },
      { type: "homestead_claim_honor_reward", milestoneId: "newcomer" },
      {
        type: "homestead_upgrade_infrastructure",
        infrastructureId: "operations_center",
      },
      { type: "homestead_upgrade_resilience", resilienceId: "drainage" },
      {
        type: "homestead_activate_emergency_boost",
        sectorId: "mine",
      },
      { type: "homestead_switch_town", townId: "frostpeak" },
      { type: "homestead_unlock_town", townId: "frostpeak" },
      { type: "homestead_buy_merchant_item", itemId: "rail_pass" },
      {
        type: "homestead_use_acceleration_card",
        facilityId: "mill",
      },
      {
        type: "homestead_update_ai_profile",
        enabled: true,
        goal: "research",
        risk: "safe",
        focus: "mine",
      },
      {
        type: "homestead_start_town_sector",
        sectorId: "farm",
      },
      {
        type: "homestead_collect_town_sector",
        sectorId: "ranch",
      },
      {
        type: "homestead_upgrade_town_sector",
        sectorId: "mine",
      },
      {
        type: "homestead_sell_town_resource",
        resourceId: "snow_potato",
        quantity: 2,
      },
      {
        type: "homestead_resolve_town_problem",
        problemId: "blocked_supply_road",
      },
      {
        type: "homestead_restore_town_landmark",
      },
      {
        type: "homestead_complete_value_route",
        routeId: "valley_sauce_batch",
      },
      {
        type: "homestead_start_job",
        recipeId: "frost_mill_barley_flour",
      },
      {
        type: "homestead_complete_value_route",
        routeId: "frost_highland_staples",
      },
      {
        type: "homestead_dispatch_cargo",
        cargoId: "greenvale_warmhouse_supplies",
      },
      {
        type: "homestead_collect_cargo",
        shipmentId: "shipment-1",
      },
    ]) {
      expect(() => homesteadActionEnvelopeSchema.parse(envelope(action)))
        .not.toThrow();
    }
    expect(() => homesteadActionEnvelopeSchema.parse(envelope({
      type: "homestead_survey_layer",
      layerId: "dragon_lair",
    }))).toThrow();
    expect(() => homesteadActionEnvelopeSchema.parse(envelope({
      type: "homestead_sell_town_resource",
      resourceId: "frost_crystal",
      quantity: 0,
    }))).toThrow();
    expect(() => homesteadActionEnvelopeSchema.parse(envelope({
      type: "homestead_start_town_sector",
      sectorId: "harbor",
    }))).toThrow();
  });
});
