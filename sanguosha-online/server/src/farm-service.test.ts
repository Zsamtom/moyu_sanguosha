import { describe, expect, it } from "vitest";
import { FARM_CROPS, type FarmMarketDecision } from "@sanguosha/shared";
import {
  BotDecisionRegistry,
  type BotDecisionProvider,
} from "./bots/decision-registry.js";
import {
  FarmService,
  MemoryFarmStateStore,
} from "./farm-service.js";
import type { PublicUser } from "./users.js";

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

describe("FarmService", () => {
  it("creates one account-level save and restores it through a new service instance", async () => {
    const store = new MemoryFarmStateStore();
    const registry = new BotDecisionRegistry();
    const firstService = new FarmService(store, registry);
    const initial = await firstService.getOrCreate(user);
    const changed = await firstService.applyAction(user, initial.farm.revision, {
      type: "farm_buy_seed",
      cropId: "wheat",
      quantity: 1,
    });

    const restored = await new FarmService(store, registry).getOrCreate(user);
    expect(restored.farm).toEqual(changed.farm);
    expect(restored.farm.players[0]).toMatchObject({
      id: user.id,
      coins: initial.farm.players[0]!.coins - FARM_CROPS.wheat.seedCost,
    });
  });

  it("rejects a stale client revision instead of overwriting a newer save", async () => {
    const service = new FarmService(
      new MemoryFarmStateStore(),
      new BotDecisionRegistry(),
    );
    const initial = await service.getOrCreate(user);
    await service.applyAction(user, initial.farm.revision, {
      type: "farm_buy_seed",
      cropId: "wheat",
      quantity: 1,
    });
    await expect(service.applyAction(user, initial.farm.revision, {
      type: "farm_buy_seed",
      cropId: "wheat",
      quantity: 1,
    })).rejects.toMatchObject({
      status: 409,
      code: "FARM_REVISION_CONFLICT",
    });
  });

  it("lets the configured market director choose only a server-generated scenario", async () => {
    const registry = new BotDecisionRegistry();
    const provider: BotDecisionProvider<unknown, FarmMarketDecision> = {
      decide: async () => ({
        candidateIndex: 2,
        usage: { promptTokens: 10, completionTokens: 2 },
      }),
    };
    registry.register("farm", provider);
    const service = new FarmService(new MemoryFarmStateStore(), registry);
    const initial = await service.getOrCreate(user);
    const next = await service.applyAction(user, initial.farm.revision, {
      type: "farm_end_turn",
    });

    expect(next.marketDirectorAvailable).toBe(true);
    expect(next.farm.marketEvent).toMatchObject({
      source: "llm",
      title: "餐饮订单增长",
    });
    expect(next.farm.market.tomato.price).toBe(FARM_CROPS.tomato.maximumPrice);
  });
});
