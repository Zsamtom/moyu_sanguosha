import { describe, expect, it } from "vitest";
import {
  ESTATE_DAILY_LOGISTICS_CAPACITY,
  ESTATE_CARGO_DEFINITIONS,
  FARMING_CROPS,
  FROSTPEAK_FARM_CROPS,
  FROSTPEAK_HOMESTEAD_GOODS,
  FROSTPEAK_MINE_DEPOSITS,
  FROSTPEAK_RANCH_ANIMALS,
  GREENVALE_HOMESTEAD_RECIPE_IDS,
  HOMESTEAD_RECIPES,
  HOMESTEAD_VALUE_ROUTES,
  MINE_DEPOSITS,
  RANCH_ANIMALS,
  assertRestorableEstateAccount,
  buyEstateMerchantItem,
  collectEstateShipment,
  createEstateAccount,
  dispatchEstateShipment,
  estateMerchantOfferIds,
  getEstateTownUnlockStatus,
  refreshEstateAccount,
  spendEstateLogistics,
  travelEstateTown,
  unlockEstateTown,
  updateEstateTownProgress,
} from "../src/index.js";

const start = Date.UTC(2026, 6, 30, 8);

function unlockReadyAccount() {
  let account = createEstateAccount({
    ownerId: "owner",
    ownerName: "庄园主",
    now: start,
    coins: 2_000,
    merchantRenown: 3,
    unlockedResearchIds: ["civic_network"],
  });
  account = updateEstateTownProgress(account, {
    townId: "greenvale",
    localReputation: 30,
    farmLevel: 5,
    ranchLevel: 4,
    mineLevel: 3,
    landmarkStage: 1,
  }, start);
  return account;
}

describe("estate account, travel, logistics, and merchant sinks", () => {
  it("unlocks Frostpeak once while keeping one shared coin balance", () => {
    const ready = unlockReadyAccount();
    expect(getEstateTownUnlockStatus(ready, "frostpeak")).toMatchObject({
      unlocked: false,
      canUnlock: true,
      coinCost: 800,
    });

    const unlocked = unlockEstateTown(ready, "frostpeak", start + 1);
    expect(unlocked.coins).toBe(1_200);
    expect(unlocked.activeTownId).toBe("greenvale");
    expect(unlocked.townProgress.frostpeak).toMatchObject({
      unlocked: true,
      localReputation: 0,
      farmLevel: 1,
      ranchLevel: 1,
      mineLevel: 1,
    });
    expect(unlocked.merchantRenown).toBe(5);
    expect(() => unlockEstateTown(unlocked, "frostpeak", start + 2))
      .toThrow();
  });

  it("keeps Frostpeak unlocked and travelable after Greenvale reputation falls", () => {
    let account = unlockEstateTown(
      unlockReadyAccount(),
      "frostpeak",
      start + 1,
    );
    account = updateEstateTownProgress(account, {
      townId: "greenvale",
      localReputation: 0,
      farmLevel: 5,
      ranchLevel: 4,
      mineLevel: 3,
      landmarkStage: 1,
    }, start + 2);
    account.coins = 120;
    account.unlockedResearchIds = [];

    expect(getEstateTownUnlockStatus(account, "frostpeak")).toEqual({
      townId: "frostpeak",
      unlocked: true,
      canUnlock: false,
      missing: [],
      coinCost: 800,
    });

    const traveled = travelEstateTown(account, "frostpeak", start + 3);
    expect(traveled.activeTownId).toBe("frostpeak");
    expect(traveled.coins).toBe(0);
    expect(traveled.townProgress.frostpeak?.unlocked).toBe(true);
  });

  it("charges every trip and consumes a rail pass for exactly one discount", () => {
    let account = unlockEstateTown(
      unlockReadyAccount(),
      "frostpeak",
      start + 1,
    );
    let purchaseAt = start + 2;
    for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
      purchaseAt = start + 2 + dayOffset * 24 * 60 * 60_000;
      account = refreshEstateAccount(account, purchaseAt);
      if (estateMerchantOfferIds(account).includes("rail_pass")) break;
    }
    expect(estateMerchantOfferIds(account)).toContain("rail_pass");
    account = buyEstateMerchantItem(account, "rail_pass", purchaseAt);
    expect(account.coins).toBe(1_150);

    const outbound = travelEstateTown(account, "frostpeak", purchaseAt + 1);
    expect(outbound.coins).toBe(1_090);
    expect(outbound.merchantInventory.rail_pass).toBe(0);
    expect(outbound.travelLogs[0]).toMatchObject({
      baseFare: 120,
      paidFare: 60,
      usedRailPass: true,
    });

    const inbound = travelEstateTown(outbound, "greenvale", purchaseAt + 2);
    expect(inbound.coins).toBe(970);
    expect(inbound.travelLogs[0]).toMatchObject({
      baseFare: 120,
      paidFare: 120,
      usedRailPass: false,
    });
  });

  it("switches the active research mirror without sharing town progress", () => {
    let account = unlockEstateTown(
      unlockReadyAccount(),
      "frostpeak",
      start + 1,
    );
    expect(account.townResearch.greenvale.unlockedIds).toContain(
      "civic_network",
    );
    expect(account.townResearch.frostpeak.unlockedIds).toEqual([]);

    account = travelEstateTown(account, "frostpeak", start + 2);
    expect(account.unlockedResearchIds).toEqual([]);
    expect(account.researchPoints).toBe(0);
    account.townResearch.frostpeak = {
      points: 7,
      unlockedIds: ["permafrost_science"],
    };
    account.researchPoints = 7;
    account.unlockedResearchIds = ["permafrost_science"];

    account = travelEstateTown(account, "greenvale", start + 3);
    expect(account.unlockedResearchIds).toContain("civic_network");
    expect(account.unlockedResearchIds).not.toContain("permafrost_science");
    account = travelEstateTown(account, "frostpeak", start + 4);
    expect(account.unlockedResearchIds).toEqual(["permafrost_science"]);
    expect(account.researchPoints).toBe(7);
  });

  it("resets logistics on the next UTC+8 day and rejects overspending", () => {
    const beforeMidnight = Date.UTC(2026, 6, 30, 15, 30);
    let account = createEstateAccount({
      ownerId: "owner",
      ownerName: "庄园主",
      now: beforeMidnight,
    });
    account = spendEstateLogistics(
      account,
      ESTATE_DAILY_LOGISTICS_CAPACITY,
      beforeMidnight,
    );
    expect(() => spendEstateLogistics(account, 1, beforeMidnight + 1))
      .toThrow();

    const nextBeijingDay = refreshEstateAccount(
      account,
      beforeMidnight + 60 * 60_000,
    );
    expect(nextBeijingDay.logistics.used).toBe(0);
    expect(nextBeijingDay.logistics.dayKey).not
      .toBe(account.logistics.dayKey);
  });

  it("dispatches cargo from its source and requires arrival at the destination", () => {
    let account = unlockEstateTown(
      unlockReadyAccount(),
      "frostpeak",
      start + 1,
    );
    const coinsBefore = account.coins;
    account = dispatchEstateShipment(
      account,
      "greenvale_warmhouse_supplies",
      start + 2,
    );
    const shipment = account.shipments[0]!;
    expect(account.coins).toBe(coinsBefore - 60);
    expect(account.logistics.used).toBe(1);
    expect(shipment).toMatchObject({
      fromTownId: "greenvale",
      toTownId: "frostpeak",
      collectedAt: null,
    });
    expect(() => collectEstateShipment(account, shipment.id, shipment.arrivesAt))
      .toThrow("请先前往目标城镇");

    account = travelEstateTown(account, "frostpeak", start + 3);
    expect(() => collectEstateShipment(account, shipment.id, shipment.arrivesAt - 1))
      .toThrow("运输途中");
    const collected = collectEstateShipment(
      account,
      shipment.id,
      shipment.arrivesAt,
    );
    expect(collected.shipments[0]?.collectedAt).toBe(shipment.arrivesAt);
    expect(() => assertRestorableEstateAccount(collected)).not.toThrow();
  });

  it("keeps both cross-town projects profitable after materials and freight", () => {
    const values = new Map<string, number>([
      ...Object.values(FARMING_CROPS).map((item) =>
        [`greenvale:farm:${item.id}`, item.basePrice] as const
      ),
      ...Object.values(RANCH_ANIMALS).map((item) =>
        [`greenvale:ranch:${item.productId}`, item.productPrice] as const
      ),
      ...Object.values(MINE_DEPOSITS).map((item) =>
        [`greenvale:mine:${item.id}`, item.orePrice] as const
      ),
      ...Object.values(FROSTPEAK_FARM_CROPS).map((item) =>
        [`frostpeak:farm:${item.id}`, item.basePrice] as const
      ),
      ...Object.values(FROSTPEAK_RANCH_ANIMALS).map((item) =>
        [`frostpeak:ranch:${item.productId}`, item.productPrice] as const
      ),
      ...Object.values(FROSTPEAK_MINE_DEPOSITS).map((item) =>
        [`frostpeak:mine:${item.id}`, item.orePrice] as const
      ),
      ...FROSTPEAK_HOMESTEAD_GOODS.map((item) =>
        [`frostpeak:goods:${item.id}`, item.unitValue] as const
      ),
    ]);
    const valueOf = (
      townId: "greenvale" | "frostpeak",
      resource: { source: string; itemId: string; quantity: number },
    ): number => {
      const value = values.get(
        `${townId}:${resource.source}:${resource.itemId}`,
      );
      if (value === undefined) {
        throw new Error(`Missing balance value for ${resource.itemId}`);
      }
      return value * resource.quantity;
    };
    for (const recipeId of GREENVALE_HOMESTEAD_RECIPE_IDS) {
      const recipe = HOMESTEAD_RECIPES[recipeId];
      const batchCost = recipe.inputs.reduce(
        (total, resource) => total + valueOf("greenvale", resource),
        recipe.coinCost,
      );
      values.set(
        `greenvale:goods:${recipe.output.itemId}`,
        batchCost / recipe.output.quantity,
      );
    }

    for (const cargo of Object.values(ESTATE_CARGO_DEFINITIONS)) {
      const project = HOMESTEAD_VALUE_ROUTES[cargo.destinationProjectId as
        keyof typeof HOMESTEAD_VALUE_ROUTES];
      const cargoCost = cargo.manifest.reduce(
        (total, resource) => total + valueOf(cargo.fromTownId, resource),
        cargo.coinCost,
      );
      const localCost = project.requirements
        .filter(({ source }) => source !== "cargo")
        .reduce(
          (total, resource) =>
            total + valueOf(project.townId!, resource),
          0,
        );
      const totalCost = cargoCost + localCost;
      expect(project.coinReward, cargo.id).toBeGreaterThan(totalCost);
      expect(project.coinReward / totalCost, cargo.id).toBeLessThanOrEqual(1.4);
    }
  });

  it("rejects corrupted balances, recommendations, and travel logs", () => {
    const account = unlockReadyAccount();
    expect(() => assertRestorableEstateAccount(account)).not.toThrow();

    const negative = structuredClone(account);
    negative.coins = -1;
    expect(() => assertRestorableEstateAccount(negative)).toThrow();

    const recommendation = structuredClone(account);
    (
      recommendation as unknown as { shopRecommendationId: string | null }
    ).shopRecommendationId = "unreleased_booster";
    expect(() => assertRestorableEstateAccount(recommendation)).toThrow();

    const invalidTravel = structuredClone(account);
    invalidTravel.travelLogs.push({
      id: "tampered",
      at: start,
      fromTownId: "greenvale",
      toTownId: "frostpeak",
      routeId: "greenvale_frostpeak_rail",
      baseFare: 120,
      paidFare: 121,
      usedRailPass: false,
    });
    expect(() => assertRestorableEstateAccount(invalidTravel)).toThrow();

    const invalidShipment = dispatchEstateShipment(
      unlockEstateTown(account, "frostpeak", start + 1),
      "greenvale_warmhouse_supplies",
      start + 2,
    );
    (
      invalidShipment.shipments[0] as unknown as {
        toTownId: "greenvale" | "frostpeak";
      }
    ).toTownId = "greenvale";
    expect(() => assertRestorableEstateAccount(invalidShipment)).toThrow();
  });
});
