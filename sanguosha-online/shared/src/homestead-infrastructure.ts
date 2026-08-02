import type { EstateTownId } from "./towns/registry.js";

export const HOMESTEAD_INFRASTRUCTURE_IDS = [
  "operations_center",
  "supply_hub",
  "resilience_center",
  "river_irrigation",
  "cooperative_cold_storage",
  "geothermal_greenhouse",
  "avalanche_command",
] as const;

export type HomesteadInfrastructureId =
  (typeof HOMESTEAD_INFRASTRUCTURE_IDS)[number];

export interface HomesteadInfrastructureDefinition {
  readonly id: HomesteadInfrastructureId;
  readonly townId: EstateTownId | null;
  readonly name: string;
  readonly description: string;
  readonly kind: "common" | "specialty";
  readonly maximumLevel: 3;
  readonly baseCoinCost: number;
  readonly baseResearchCost: number;
  readonly requiredReputation: number;
  readonly production: Readonly<
    Partial<
      Record<
        "farm" | "ranch" | "mine",
        { readonly yieldPercent: number; readonly durationPercent: number }
      >
    >
  >;
  readonly marketSellPercentPerLevel: number;
}

export const HOMESTEAD_INFRASTRUCTURE: Readonly<
  Record<HomesteadInfrastructureId, HomesteadInfrastructureDefinition>
> = {
  operations_center: {
    id: "operations_center",
    townId: null,
    name: "三业调度中心",
    description: "两镇共有的基础设施，协调农牧矿班次与加工衔接。",
    kind: "common",
    maximumLevel: 3,
    baseCoinCost: 260,
    baseResearchCost: 4,
    requiredReputation: 15,
    production: {
      farm: { yieldPercent: 0, durationPercent: -2 },
      ranch: { yieldPercent: 0, durationPercent: -2 },
      mine: { yieldPercent: 0, durationPercent: -2 },
    },
    marketSellPercentPerLevel: 0,
  },
  supply_hub: {
    id: "supply_hub",
    townId: null,
    name: "综合仓配站",
    description: "两镇共有的集货设施，提高三业物资周转并承接高级跨城货运。",
    kind: "common",
    maximumLevel: 3,
    baseCoinCost: 320,
    baseResearchCost: 5,
    requiredReputation: 25,
    production: {
      farm: { yieldPercent: 1, durationPercent: 0 },
      ranch: { yieldPercent: 1, durationPercent: 0 },
      mine: { yieldPercent: 1, durationPercent: 0 },
    },
    marketSellPercentPerLevel: 1,
  },
  resilience_center: {
    id: "resilience_center",
    townId: null,
    name: "生产保障中心",
    description: "两镇共有的设备、医疗与安全物资保障设施。",
    kind: "common",
    maximumLevel: 3,
    baseCoinCost: 380,
    baseResearchCost: 6,
    requiredReputation: 35,
    production: {
      farm: { yieldPercent: 1, durationPercent: -1 },
      ranch: { yieldPercent: 1, durationPercent: -1 },
      mine: { yieldPercent: 1, durationPercent: -1 },
    },
    marketSellPercentPerLevel: 0,
  },
  river_irrigation: {
    id: "river_irrigation",
    townId: "greenvale",
    name: "河谷水利实验站",
    description: "青禾特色设施，监测墒情、维护供水管网并降低冻裂风险。",
    kind: "specialty",
    maximumLevel: 3,
    baseCoinCost: 520,
    baseResearchCost: 8,
    requiredReputation: 45,
    production: { farm: { yieldPercent: 3, durationPercent: -2 } },
    marketSellPercentPerLevel: 0,
  },
  cooperative_cold_storage: {
    id: "cooperative_cold_storage",
    townId: "greenvale",
    name: "合作社冷链中心",
    description: "青禾特色设施，为乳品、果蔬和高原来货提供分级与展销能力。",
    kind: "specialty",
    maximumLevel: 3,
    baseCoinCost: 680,
    baseResearchCost: 10,
    requiredReputation: 60,
    production: {
      farm: { yieldPercent: 1, durationPercent: 0 },
      ranch: { yieldPercent: 2, durationPercent: 0 },
    },
    marketSellPercentPerLevel: 2,
  },
  geothermal_greenhouse: {
    id: "geothermal_greenhouse",
    townId: "frostpeak",
    name: "地热温室群",
    description: "霜岭特色设施，利用热力站余热稳定高寒作物和公共食堂供应。",
    kind: "specialty",
    maximumLevel: 3,
    baseCoinCost: 560,
    baseResearchCost: 9,
    requiredReputation: 45,
    production: { farm: { yieldPercent: 3, durationPercent: -3 } },
    marketSellPercentPerLevel: 1,
  },
  avalanche_command: {
    id: "avalanche_command",
    townId: "frostpeak",
    name: "雪崩防控与热力调度站",
    description: "霜岭特色设施，联动矿队、道路与热力站处理雪灾和设备维护。",
    kind: "specialty",
    maximumLevel: 3,
    baseCoinCost: 720,
    baseResearchCost: 11,
    requiredReputation: 65,
    production: {
      ranch: { yieldPercent: 1, durationPercent: -1 },
      mine: { yieldPercent: 2, durationPercent: -3 },
    },
    marketSellPercentPerLevel: 1,
  },
};

export type HomesteadInfrastructureState = Record<
  HomesteadInfrastructureId,
  number
>;

export function createHomesteadInfrastructureState(): HomesteadInfrastructureState {
  return Object.fromEntries(
    HOMESTEAD_INFRASTRUCTURE_IDS.map((id) => [id, 0]),
  ) as HomesteadInfrastructureState;
}

export function infrastructureIdsForTown(
  townId: EstateTownId,
): readonly HomesteadInfrastructureId[] {
  return HOMESTEAD_INFRASTRUCTURE_IDS.filter((id) => {
    const definition = HOMESTEAD_INFRASTRUCTURE[id];
    return definition.townId === null || definition.townId === townId;
  });
}

export function infrastructureUpgradeCost(
  definition: HomesteadInfrastructureDefinition,
  currentLevel: number,
): {
  readonly level: number;
  readonly coinCost: number;
  readonly researchCost: number;
  readonly alloyCost: number;
} | null {
  if (currentLevel >= definition.maximumLevel) return null;
  const level = currentLevel + 1;
  return {
    level,
    coinCost: definition.baseCoinCost * level,
    researchCost: definition.baseResearchCost + (level - 1) * 3,
    alloyCost: Math.max(0, level - 1),
  };
}
