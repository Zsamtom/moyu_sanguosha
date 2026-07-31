import { describe, expect, it } from "vitest";
import {
  ESTATE_DAILY_LOGISTICS_CAPACITY,
  assertRestorableEstateAccount,
  buyEstateMerchantItem,
  createEstateAccount,
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
    account = buyEstateMerchantItem(account, "rail_pass", start + 2);
    expect(account.coins).toBe(1_150);

    const outbound = travelEstateTown(account, "frostpeak", start + 3);
    expect(outbound.coins).toBe(1_090);
    expect(outbound.merchantInventory.rail_pass).toBe(0);
    expect(outbound.travelLogs[0]).toMatchObject({
      baseFare: 120,
      paidFare: 60,
      usedRailPass: true,
    });

    const inbound = travelEstateTown(outbound, "greenvale", start + 4);
    expect(inbound.coins).toBe(970);
    expect(inbound.travelLogs[0]).toMatchObject({
      baseFare: 120,
      paidFare: 120,
      usedRailPass: false,
    });
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
  });
});
