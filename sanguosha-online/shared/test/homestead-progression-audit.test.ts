import { describe, expect, it } from "vitest";
import {
  ESTATE_CARGO_DEFINITIONS,
  ESTATE_CARGO_IDS,
  ESTATE_MERCHANT_ITEM_IDS,
  ESTATE_MERCHANT_ITEMS,
  HOMESTEAD_HONOR_MILESTONES,
  HOMESTEAD_INFRASTRUCTURE,
  HOMESTEAD_NPCS,
  HOMESTEAD_RESEARCH,
  HOMESTEAD_VALUE_ROUTES,
  HOMESTEAD_WORLD_EVENTS,
  MINE_DEPOSITS,
  RANCH_ANIMALS,
  applyHomesteadAction,
  buyEstateMerchantItem,
  createEstateAccount,
  createFarmingGame,
  createHomesteadGame,
  createMineGame,
  createRanchGame,
  estateMerchantOfferIds,
  getHomesteadGameView,
  getHomesteadProductionRules,
  infrastructureIdsForTown,
  npcIdsForTown,
  refreshEstateAccount,
  researchIdsForTown,
  type EstateTownId,
  type HomesteadLinkedEconomy,
  type HomesteadResearchNodeId,
} from "../src/index.js";

const start = Date.UTC(2026, 7, 1, 8);
const day = 24 * 60 * 60_000;
const townIds = ["greenvale", "frostpeak"] as const;

function linkedEconomy(
  townId: EstateTownId,
): HomesteadLinkedEconomy {
  const common = {
    ownerId: "audit-owner",
    ownerName: "审计庄主",
    now: start,
  };
  const farm = createFarmingGame({ ...common, seed: `farm-${townId}`, townId });
  const ranch = createRanchGame({ ...common, seed: `ranch-${townId}`, townId });
  const mine = createMineGame({ ...common, seed: `mine-${townId}`, townId });
  return {
    farmRevision: farm.revision,
    ranchRevision: ranch.revision,
    mineRevision: mine.revision,
    coins: 20_000,
    farmProduce: structuredClone(farm.produce),
    ranchProducts: structuredClone(ranch.products),
    mineOres: structuredClone(mine.ores),
    activeTownId: townId,
    unlockedTownIds: ["greenvale", "frostpeak"],
  };
}

function assertAcyclicResearch(ids: readonly HomesteadResearchNodeId[]) {
  const allowed = new Set(ids);
  const visiting = new Set<HomesteadResearchNodeId>();
  const visited = new Set<HomesteadResearchNodeId>();
  const visit = (id: HomesteadResearchNodeId) => {
    if (visiting.has(id)) throw new Error(`研究前置形成环：${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const prerequisite of HOMESTEAD_RESEARCH[id].prerequisites) {
      expect(allowed, `${id} 引用了异镇前置 ${prerequisite}`).toContain(
        prerequisite,
      );
      visit(prerequisite);
    }
    visiting.delete(id);
    visited.add(id);
  };
  ids.forEach(visit);
  expect(visited.size).toBe(ids.length);
}

describe("homestead progression and economy invariants", () => {
  it("keeps two independent, acyclic twelve-node research trees", () => {
    const greenvale = researchIdsForTown("greenvale");
    const frostpeak = researchIdsForTown("frostpeak");
    expect(greenvale).toHaveLength(12);
    expect(frostpeak).toHaveLength(12);
    expect(new Set(greenvale).size).toBe(12);
    expect(new Set(frostpeak).size).toBe(12);
    expect(greenvale.some((id) => frostpeak.includes(id))).toBe(false);
    assertAcyclicResearch(greenvale);
    assertAcyclicResearch(frostpeak);

    for (const [townId, foreignNodeId] of [
      ["greenvale", frostpeak[0]],
      ["frostpeak", greenvale[0]],
    ] as const) {
      const game = createHomesteadGame({
        ownerId: "audit-owner",
        ownerName: "审计庄主",
        seed: `foreign-research-${townId}`,
        now: start,
        townId,
      });
      game.researchPoints = 999;
      game.reputation = 999;
      expect(() => applyHomesteadAction(
        game,
        linkedEconomy(townId),
        { type: "homestead_unlock_research", nodeId: foreignNodeId },
        start,
      )).toThrow();
    }
  });

  it("turns every production research node into a real local-sector modifier", () => {
    for (const townId of townIds) {
      const baselineGame = createHomesteadGame({
        ownerId: "audit-owner",
        ownerName: "审计庄主",
        seed: `research-${townId}`,
        now: start,
        townId,
      });
      const baseline = getHomesteadProductionRules(baselineGame);
      for (const nodeId of researchIdsForTown(townId)) {
        const definition = HOMESTEAD_RESEARCH[nodeId];
        if (!definition.production) continue;
        const researched = structuredClone(baselineGame);
        researched.research.unlocked = [nodeId];
        const rules = getHomesteadProductionRules(researched);
        for (const [sector, effect] of Object.entries(definition.production)) {
          const current = rules[sector as "farm" | "ranch" | "mine"];
          const before = baseline[sector as "farm" | "ranch" | "mine"];
          expect(
            current.yieldPercent !== before.yieldPercent ||
              current.durationPercent !== before.durationPercent,
            `${townId}:${nodeId} 未进入 ${sector} 规则`,
          ).toBe(true);
          expect(effect).toBeDefined();
        }
      }
    }
  });

  it("requires local operating milestones before research points can be spent", () => {
    for (const townId of townIds) {
      const ids = researchIdsForTown(townId);
      expect(ids.reduce(
        (total, id) => total + HOMESTEAD_RESEARCH[id].researchCost,
        0,
      )).toBeGreaterThanOrEqual(250);
      for (const nodeId of ids) {
        expect(
          HOMESTEAD_RESEARCH[nodeId].requirements.length,
          `${townId}:${nodeId} 缺少经营门槛`,
        ).toBeGreaterThan(0);
      }

      const game = createHomesteadGame({
        ownerId: "audit-owner",
        ownerName: "审计庄主",
        seed: `research-gate-${townId}`,
        now: start,
        townId,
      });
      game.researchPoints = 999;
      game.reputation = 999;
      const rootId = ids.find(
        (id) => HOMESTEAD_RESEARCH[id].prerequisites.length === 0,
      )!;
      const rootView = getHomesteadGameView(
        game,
        linkedEconomy(townId),
        start,
      ).research.find(({ definition }) => definition.id === rootId)!;
      expect(rootView.canUnlock).toBe(false);
      expect(rootView.missingRequirements.length).toBeGreaterThan(0);
      expect(() => applyHomesteadAction(
        game,
        linkedEconomy(townId),
        { type: "homestead_unlock_research", nodeId: rootId },
        start,
      )).toThrow();
    }
  });

  it("gives Greenvale and Frostpeak different authoritative operation order", () => {
    const run = (
      townId: EstateTownId,
      order: readonly ("farm" | "ranch" | "mine")[],
    ) => {
      let game = createHomesteadGame({
        ownerId: "audit-owner",
        ownerName: "审计庄主",
        seed: `rhythm-${townId}`,
        now: start,
        townId,
      });
      let economy = linkedEconomy(townId);
      for (const [index, sector] of order.entries()) {
        const action = sector === "farm"
          ? {
              type: "homestead_plan_rotation" as const,
              cropFamily: "grain" as const,
              useFertilizer: false,
            }
          : sector === "ranch"
            ? {
                type: "homestead_run_feed_program" as const,
                programId: "pasture" as const,
              }
            : {
                type: "homestead_survey_layer" as const,
                layerId: "shallow" as const,
              };
        const result = applyHomesteadAction(
          game,
          economy,
          action,
          start + index,
        );
        game = result.homestead;
        economy = result.economy;
      }
      return { game, economy, rules: getHomesteadProductionRules(game) };
    };

    const greenvale = run("greenvale", ["farm", "ranch", "mine"]);
    expect(greenvale.game.townRhythm).toMatchObject({
      progress: 3,
      completedCycles: 1,
    });
    expect(greenvale.rules.farm.yieldPercent).toBeGreaterThanOrEqual(6);
    expect(greenvale.rules.farm.marketSellPercent).toBeGreaterThanOrEqual(2);

    const frostpeak = run("frostpeak", ["mine", "farm", "ranch"]);
    expect(frostpeak.game.townRhythm).toMatchObject({
      progress: 3,
      completedCycles: 1,
    });
    expect(frostpeak.rules.ranch.yieldPercent).toBeGreaterThanOrEqual(7);
    expect(frostpeak.rules.mine.durationPercent).toBeLessThanOrEqual(-5);

    const wrongOrder = run("frostpeak", ["farm", "mine", "ranch"]);
    expect(wrongOrder.game.townRhythm.progress).toBe(1);
    expect(wrongOrder.game.townRhythm.completedCycles).toBe(0);
    expect(
      getHomesteadGameView(wrongOrder.game, wrongOrder.economy, start + 2)
        .townRhythm.blockedToday,
    ).toBe(true);
  });

  it("provides local advisors and common-plus-specialty infrastructure", () => {
    const greenNpcs = npcIdsForTown("greenvale");
    const frostNpcs = npcIdsForTown("frostpeak");
    expect(greenNpcs).toHaveLength(3);
    expect(frostNpcs).toHaveLength(3);
    expect(greenNpcs.some((id) => frostNpcs.includes(id))).toBe(false);
    expect(new Set([...greenNpcs, ...frostNpcs].map((id) =>
      HOMESTEAD_NPCS[id].name
    )).size).toBe(6);

    const greenInfrastructure = infrastructureIdsForTown("greenvale");
    const frostInfrastructure = infrastructureIdsForTown("frostpeak");
    for (const ids of [greenInfrastructure, frostInfrastructure]) {
      expect(ids).toHaveLength(5);
      expect(ids.filter((id) => HOMESTEAD_INFRASTRUCTURE[id].kind === "common"))
        .toHaveLength(3);
      expect(ids.filter((id) => HOMESTEAD_INFRASTRUCTURE[id].kind === "specialty"))
        .toHaveLength(2);
    }
  });

  it("makes advisor conversations change authoritative three-sector rules", () => {
    for (const townId of townIds) {
      const game = createHomesteadGame({
        ownerId: "audit-owner",
        ownerName: "审计庄主",
        seed: `advisor-${townId}`,
        now: start,
        townId,
      });
      const economy = linkedEconomy(townId);
      const baseline = getHomesteadProductionRules(game).farm.yieldPercent;
      const npcId = npcIdsForTown(townId)[0]!;
      expect(
        getHomesteadGameView(game, economy, start).advice.npcId,
      ).toBe(npcId);
      const result = applyHomesteadAction(
        game,
        economy,
        { type: "homestead_talk_npc", npcId, topicId: "soil" },
        start,
      );
      expect(
        getHomesteadProductionRules(result.homestead).farm.yieldPercent,
      ).toBeGreaterThan(baseline);
      expect(result.homestead.advisorGuidance.farm).not.toBeNull();
    }
  });

  it("keeps each town above one hundred collections with a reachable legend", () => {
    for (const townId of townIds) {
      const game = createHomesteadGame({
        ownerId: "audit-owner",
        ownerName: "审计庄主",
        seed: `collection-${townId}`,
        now: start,
        townId,
      });
      const collections = getHomesteadGameView(
        game,
        linkedEconomy(townId),
        start,
      ).collections;
      expect(collections.length).toBeGreaterThanOrEqual(100);
      expect(new Set(collections.map(({ id }) => id)).size)
        .toBe(collections.length);
      const pointsBeforeLegend = collections
        .filter(({ id }) => id !== "honor:legend")
        .reduce((total, entry) => total + entry.honorPoints, 0);
      expect(pointsBeforeLegend).toBeGreaterThanOrEqual(
        HOMESTEAD_HONOR_MILESTONES.legend.score,
      );
      expect(collections.some(({ difficulty }) => difficulty === "legendary"))
        .toBe(true);
    }
  });

  it("rotates exactly three constrained offers from a twenty-one-item catalog", () => {
    expect(ESTATE_MERCHANT_ITEM_IDS).toHaveLength(21);
    expect(new Set(ESTATE_MERCHANT_ITEM_IDS.map((id) =>
      ESTATE_MERCHANT_ITEMS[id].category
    )).size).toBeGreaterThanOrEqual(3);
    let account = createEstateAccount({
      ownerId: "merchant-audit",
      ownerName: "商店审计",
      now: start,
      coins: 100_000,
      merchantRenown: 99,
    });
    const weeklyOffers = new Set<string>();
    for (let offset = 0; offset < 7; offset += 1) {
      account = refreshEstateAccount(account, start + offset * day);
      const offers = estateMerchantOfferIds(account, "greenvale");
      expect(offers).toHaveLength(3);
      expect(new Set(offers).size).toBe(3);
      expect(offers.filter((id) =>
        ESTATE_MERCHANT_ITEMS[id].townId === undefined
      )).toHaveLength(1);
      expect(offers.filter((id) =>
        ESTATE_MERCHANT_ITEMS[id].townId === "greenvale"
      )).toHaveLength(2);
      expect(offers.every((id) =>
        ESTATE_MERCHANT_ITEMS[id].dailyPurchaseLimit >= 1
      )).toBe(true);
      weeklyOffers.add(offers.join(","));
    }
    expect(weeklyOffers.size).toBeGreaterThan(1);

    const offered = estateMerchantOfferIds(account)[0]!;
    const purchased = buyEstateMerchantItem(account, offered, start + 6 * day);
    expect(() => buyEstateMerchantItem(purchased, offered, start + 6 * day))
      .toThrow();
  });

  it("links six cargo routes to real destination projects without dead ends", () => {
    expect(ESTATE_CARGO_IDS).toHaveLength(6);
    for (const townId of townIds) {
      expect(Object.values(ESTATE_CARGO_DEFINITIONS).filter(
        ({ fromTownId }) => fromTownId === townId,
      )).toHaveLength(3);
    }
    for (const cargo of Object.values(ESTATE_CARGO_DEFINITIONS)) {
      const project = HOMESTEAD_VALUE_ROUTES[
        cargo.destinationProjectId as keyof typeof HOMESTEAD_VALUE_ROUTES
      ];
      expect(project, cargo.id).toBeDefined();
      expect(project.townId, cargo.id).toBe(cargo.toTownId);
      expect(project.requirements, cargo.id).toContainEqual({
        source: "cargo",
        itemId: cargo.id,
        quantity: 1,
      });
      if (cargo.requiredResearchId) {
        expect(researchIdsForTown(cargo.fromTownId)).toContain(
          cargo.requiredResearchId,
        );
      }
      if (cargo.requiredInfrastructureId) {
        expect(infrastructureIdsForTown(cargo.fromTownId)).toContain(
          cargo.requiredInfrastructureId,
        );
      }
    }
  });

  it("keeps intuitive asset and rare-resource price ordering", () => {
    expect(MINE_DEPOSITS.gold.orePrice).toBeGreaterThan(
      RANCH_ANIMALS.chicken.purchaseCost,
    );
    for (const animal of Object.values(RANCH_ANIMALS)) {
      expect(animal.resalePrice).toBeLessThan(animal.purchaseCost);
    }
  });

  it("includes a real Greenvale pipe-freeze event with market or sector effects", () => {
    const event = HOMESTEAD_WORLD_EVENTS.greenvale_pipe_freeze;
    expect(event.townId).toBe("greenvale");
    expect(event.options.length).toBeGreaterThan(1);
    const game = createHomesteadGame({
      ownerId: "audit-owner",
      ownerName: "审计庄主",
      seed: "pipe-freeze",
      now: start,
      townId: "greenvale",
    });
    game.disaster = {
      eventId: "greenvale_pipe_freeze",
      contentEventId: "greenvale_pipe_freeze",
      startedDayKey: game.dayKey,
      remainingDays: 3,
      unresolvedDays: 0,
      severity: 1,
      mitigated: false,
      resolution: null,
    };
    const rules = getHomesteadProductionRules(game);
    expect(rules.farm.yieldPercent).toBeLessThan(0);
    expect(rules.farm.marketBuyPercent).toBeGreaterThan(0);
  });
});
