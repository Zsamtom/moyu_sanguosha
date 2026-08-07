import type {
  EstateProductionRule,
  FarmingCropCounts,
  FarmingCropId,
} from "./farming.js";
import type {
  RanchProductCounts,
  RanchProductId,
} from "./ranch.js";
import type {
  MineDepositId,
  MineOreCounts,
} from "./mine.js";
import {
  ESTATE_MERCHANT_ITEMS,
  ESTATE_CARGO_DEFINITIONS,
  ESTATE_CARGO_IDS,
  createEstateAccount,
  estateMerchantOfferIds,
  getEstateTownUnlockStatus,
  type EstateAccountState,
  type EstateCargoDefinition,
  type EstateCargoId,
  type EstateShipment,
  type EstateMerchantInventory,
  type EstateMerchantItemDefinition,
  type EstateMerchantItemId,
  type EstateTownProgress,
} from "./estate-account.js";
import {
  ESTATE_TOWN_IDS,
  TOWN_DEFINITIONS,
  getTownRoute,
  type EstateTownId,
} from "./towns/registry.js";
import { PLANNED_TOWN_PREVIEWS } from "./towns/planned.js";
import {
  HOMESTEAD_INFRASTRUCTURE,
  HOMESTEAD_INFRASTRUCTURE_IDS,
  createHomesteadInfrastructureState,
  infrastructureIdsForTown,
  infrastructureUpgradeCost,
  type HomesteadInfrastructureId,
  type HomesteadInfrastructureState,
} from "./homestead-infrastructure.js";
import {
  advanceHomesteadTownRhythm,
  createHomesteadTownRhythmState,
  homesteadTownRhythmEffect,
  refreshHomesteadTownRhythmState,
  townRhythmDefinition,
  type HomesteadTownRhythmState,
} from "./homestead-town-rhythm.js";
import {
  FROSTPEAK_HOMESTEAD_GOOD_CATALOG,
  FROSTPEAK_HOMESTEAD_GOOD_IDS,
  FROSTPEAK_HOMESTEAD_ORDER_TEMPLATE_CATALOG,
  FROSTPEAK_HOMESTEAD_ORDER_TEMPLATE_IDS,
  FROSTPEAK_HOMESTEAD_RECIPE_CATALOG,
  FROSTPEAK_HOMESTEAD_RECIPE_IDS,
  FROSTPEAK_HOMESTEAD_SUBSTITUTIONS,
  FROSTPEAK_HOMESTEAD_VALUE_ROUTE_CATALOG,
  FROSTPEAK_HOMESTEAD_VALUE_ROUTE_IDS,
  FROSTPEAK_HOMESTEAD_WORLD_EVENT_CATALOG,
  FROSTPEAK_HOMESTEAD_WORLD_EVENT_IDS,
} from "./homestead-frostpeak.js";
import {
  HOMESTEAD_ANIMAL_TRAIT_IDS,
  HOMESTEAD_ANIMAL_TRAIT_NAMES,
  HOMESTEAD_CROP_FAMILIES,
  HOMESTEAD_CROP_FAMILY_IDS,
  HOMESTEAD_FEED_PROGRAMS,
  HOMESTEAD_FEED_PROGRAM_IDS,
  HOMESTEAD_MINE_LAYERS,
  HOMESTEAD_MINE_LAYER_IDS,
  HOMESTEAD_NPCS,
  HOMESTEAD_NPC_IDS,
  HOMESTEAD_NPC_TOPIC_IDS,
  HOMESTEAD_RESEARCH,
  HOMESTEAD_RESEARCH_NODE_IDS,
  HOMESTEAD_HONOR_MILESTONES,
  HOMESTEAD_HONOR_MILESTONE_IDS,
  HOMESTEAD_SEASON_MILESTONES,
  HOMESTEAD_SEASON_MILESTONE_IDS,
  longTermCollectionDefinitions,
  npcIdsForTown,
  researchIdForCapability,
  researchIdsForTown,
  type HomesteadAnimalTraitId,
  type HomesteadCollectionDefinition,
  type HomesteadCropFamily,
  type HomesteadFeedProgramId,
  type HomesteadMineLayerId,
  type HomesteadNpcId,
  type HomesteadNpcTopicId,
  type HomesteadResearchDefinition,
  type HomesteadResearchNodeId,
  type HomesteadResearchCapability,
  type HomesteadHonorMilestoneId,
  type HomesteadSeasonMilestoneId,
} from "./homestead-longterm.js";

export const HOMESTEAD_STATE_VERSION = 1 as const;
export const HOMESTEAD_MAX_LOGS = 80;
export const HOMESTEAD_DAILY_ORDER_COUNT = 3;

const MINUTE = 60;

export const HOMESTEAD_TOWN_IDS = ESTATE_TOWN_IDS;
export type HomesteadTownId = EstateTownId;

export const HOMESTEAD_TOWN_SECTOR_IDS = ["farm", "ranch", "mine"] as const;
export type HomesteadTownSectorId =
  (typeof HOMESTEAD_TOWN_SECTOR_IDS)[number];

export const HOMESTEAD_TOWN_RESOURCE_IDS = [
  "snow_potato",
  "yak_milk",
  "frost_crystal",
] as const;
export type HomesteadTownResourceId =
  (typeof HOMESTEAD_TOWN_RESOURCE_IDS)[number];
export type HomesteadTownResourceCounts =
  Record<HomesteadTownResourceId, number>;

export interface HomesteadTownDefinition {
  readonly id: HomesteadTownId;
  readonly name: string;
  readonly subtitle: string;
  readonly climate: string;
  readonly description: string;
  readonly landmarkName: string;
  readonly specialties: readonly string[];
  readonly status: "available" | "planned";
}

export const HOMESTEAD_TOWNS: Readonly<
  Record<HomesteadTownId, HomesteadTownDefinition>
> = Object.fromEntries(
  HOMESTEAD_TOWN_IDS.map((townId) => {
    const town = TOWN_DEFINITIONS[townId];
    return [townId, {
      id: town.id,
      name: town.name,
      subtitle: town.subtitle,
      climate: town.climate,
      description: town.description,
      landmarkName: town.landmarkName,
      specialties: town.specialties,
      status: "available" as const,
    }];
  }),
) as Readonly<Record<HomesteadTownId, HomesteadTownDefinition>>;

export interface HomesteadTownResourceDefinition {
  readonly id: HomesteadTownResourceId;
  readonly name: string;
  readonly sectorId: HomesteadTownSectorId;
  readonly salePrice: number;
}

export const HOMESTEAD_TOWN_RESOURCES: Readonly<
  Record<HomesteadTownResourceId, HomesteadTownResourceDefinition>
> = {
  snow_potato: {
    id: "snow_potato",
    name: "雪薯",
    sectorId: "farm",
    salePrice: 8,
  },
  yak_milk: {
    id: "yak_milk",
    name: "牦牛奶",
    sectorId: "ranch",
    salePrice: 26,
  },
  frost_crystal: {
    id: "frost_crystal",
    name: "霜晶",
    sectorId: "mine",
    salePrice: 50,
  },
};

export interface HomesteadTownSectorDefinition {
  readonly id: HomesteadTownSectorId;
  readonly name: string;
  readonly actionName: string;
  readonly durationSeconds: number;
  readonly input: {
    readonly itemId: HomesteadTownResourceId;
    readonly quantity: number;
  } | null;
  readonly output: {
    readonly itemId: HomesteadTownResourceId;
    readonly quantity: number;
  };
}

export const HOMESTEAD_FROSTPEAK_SECTORS: Readonly<
  Record<HomesteadTownSectorId, HomesteadTownSectorDefinition>
> = {
  farm: {
    id: "farm",
    name: "冻土农场",
    actionName: "培育雪薯",
    durationSeconds: 8 * MINUTE,
    input: null,
    output: { itemId: "snow_potato", quantity: 3 },
  },
  ranch: {
    id: "ranch",
    name: "牦牛牧场",
    actionName: "照料牦牛",
    durationSeconds: 16 * MINUTE,
    input: { itemId: "snow_potato", quantity: 1 },
    output: { itemId: "yak_milk", quantity: 2 },
  },
  mine: {
    id: "mine",
    name: "霜晶矿场",
    actionName: "勘采霜晶",
    durationSeconds: 24 * MINUTE,
    input: { itemId: "yak_milk", quantity: 1 },
    output: { itemId: "frost_crystal", quantity: 2 },
  },
};

export interface HomesteadTownProblemDefinition {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly requirements: readonly {
    readonly itemId: HomesteadTownResourceId;
    readonly quantity: number;
  }[];
  readonly coinReward: number;
  readonly reputationReward: number;
  readonly researchReward: number;
}

export const HOMESTEAD_FROSTPEAK_PROBLEMS:
  readonly HomesteadTownProblemDefinition[] = [
    {
      id: "blocked_supply_road",
      title: "积雪封锁补给山路",
      description: "先用本地粮食和耐寒乳品维持施工队，再恢复道路通行。",
      requirements: [
        { itemId: "snow_potato", quantity: 6 },
        { itemId: "yak_milk", quantity: 2 },
      ],
      coinReward: 80,
      reputationReward: 10,
      researchReward: 1,
    },
    {
      id: "frozen_waterworks",
      title: "供水管网冻裂",
      description: "牦牛奶保障居民补给，霜晶用于制作耐寒管件。",
      requirements: [
        { itemId: "yak_milk", quantity: 4 },
        { itemId: "frost_crystal", quantity: 3 },
      ],
      coinReward: 140,
      reputationReward: 18,
      researchReward: 2,
    },
    {
      id: "avalanche_mine",
      title: "雪崩封闭旧矿道",
      description: "三业共同保障清障队，重新连接热力站的矿物供应。",
      requirements: [
        { itemId: "snow_potato", quantity: 8 },
        { itemId: "yak_milk", quantity: 4 },
        { itemId: "frost_crystal", quantity: 6 },
      ],
      coinReward: 240,
      reputationReward: 28,
      researchReward: 4,
    },
  ];

export interface HomesteadTownLandmarkStageDefinition {
  readonly stage: number;
  readonly name: string;
  readonly requiredProblems: number;
  readonly requiredReputation: number;
  readonly coinCost: number;
  readonly requirements: readonly {
    readonly itemId: HomesteadTownResourceId;
    readonly quantity: number;
  }[];
  readonly reputationReward: number;
  readonly renownReward: number;
}

export const HOMESTEAD_FROSTPEAK_LANDMARK_STAGES:
  readonly HomesteadTownLandmarkStageDefinition[] = [
    {
      stage: 1,
      name: "恢复锅炉房",
      requiredProblems: 1,
      requiredReputation: 8,
      coinCost: 100,
      requirements: [
        { itemId: "snow_potato", quantity: 4 },
        { itemId: "yak_milk", quantity: 1 },
        { itemId: "frost_crystal", quantity: 1 },
      ],
      reputationReward: 5,
      renownReward: 1,
    },
    {
      stage: 2,
      name: "重建保温管网",
      requiredProblems: 2,
      requiredReputation: 25,
      coinCost: 260,
      requirements: [
        { itemId: "snow_potato", quantity: 8 },
        { itemId: "yak_milk", quantity: 4 },
        { itemId: "frost_crystal", quantity: 4 },
      ],
      reputationReward: 10,
      renownReward: 2,
    },
    {
      stage: 3,
      name: "启动山地热力站",
      requiredProblems: 3,
      requiredReputation: 55,
      coinCost: 600,
      requirements: [
        { itemId: "snow_potato", quantity: 12 },
        { itemId: "yak_milk", quantity: 8 },
        { itemId: "frost_crystal", quantity: 10 },
      ],
      reputationReward: 18,
      renownReward: 5,
    },
  ];

export const HOMESTEAD_FACILITY_IDS = [
  "mill",
  "feed_factory",
  "fertilizer_plant",
  "kitchen",
  "textile_mill",
  "smelter",
  "machine_shop",
] as const;

export type HomesteadFacilityId = (typeof HOMESTEAD_FACILITY_IDS)[number];

export const GREENVALE_HOMESTEAD_GOOD_IDS = [
  "flour",
  "coarse_feed",
  "fortified_feed",
  "soil_conditioner",
  "work_clothes",
  "iron_ingot",
  "mining_kit",
  "festival_crate",
  "greenhouse_parts",
] as const;

export const HOMESTEAD_GOOD_IDS = [
  ...GREENVALE_HOMESTEAD_GOOD_IDS,
  ...FROSTPEAK_HOMESTEAD_GOOD_IDS,
] as const;

export type HomesteadGoodId = (typeof HOMESTEAD_GOOD_IDS)[number];
export type HomesteadGoodCounts = Record<HomesteadGoodId, number>;

export type HomesteadResource =
  | {
      readonly source: "farm";
      readonly itemId: FarmingCropId;
      readonly quantity: number;
    }
  | {
      readonly source: "ranch";
      readonly itemId: RanchProductId;
      readonly quantity: number;
    }
  | {
      readonly source: "mine";
      readonly itemId: MineDepositId;
      readonly quantity: number;
    }
  | {
      readonly source: "goods";
      readonly itemId: HomesteadGoodId;
      readonly quantity: number;
    }
  | {
      readonly source: "cargo";
      readonly itemId: EstateCargoId;
      readonly quantity: number;
    };

export interface HomesteadFacilityDefinition {
  readonly id: HomesteadFacilityId;
  readonly name: string;
  readonly requiredReputation: number;
  readonly coinCost: number;
}

export const HOMESTEAD_FACILITIES: Readonly<
  Record<HomesteadFacilityId, HomesteadFacilityDefinition>
> = {
  mill: {
    id: "mill",
    name: "磨坊",
    requiredReputation: 0,
    coinCost: 0,
  },
  feed_factory: {
    id: "feed_factory",
    name: "饲料厂",
    requiredReputation: 20,
    coinCost: 320,
  },
  fertilizer_plant: {
    id: "fertilizer_plant",
    name: "肥料厂",
    requiredReputation: 35,
    coinCost: 480,
  },
  kitchen: {
    id: "kitchen",
    name: "庄园厨房",
    requiredReputation: 50,
    coinCost: 680,
  },
  textile_mill: {
    id: "textile_mill",
    name: "纺织坊",
    requiredReputation: 75,
    coinCost: 900,
  },
  smelter: {
    id: "smelter",
    name: "冶炼炉",
    requiredReputation: 100,
    coinCost: 1_200,
  },
  machine_shop: {
    id: "machine_shop",
    name: "机械工坊",
    requiredReputation: 150,
    coinCost: 1_800,
  },
};

export const GREENVALE_HOMESTEAD_RECIPE_IDS = [
  "mill_flour",
  "mill_coarse_feed",
  "feed_fortified",
  "fertilizer_soil_conditioner",
  "textile_work_clothes",
  "smelt_iron_ingot",
  "workshop_mining_kit",
  "kitchen_festival_crate",
  "workshop_greenhouse_parts",
] as const;

export const HOMESTEAD_RECIPE_IDS = [
  ...GREENVALE_HOMESTEAD_RECIPE_IDS,
  ...FROSTPEAK_HOMESTEAD_RECIPE_IDS,
] as const;

export type HomesteadRecipeId = (typeof HOMESTEAD_RECIPE_IDS)[number];

export interface HomesteadRecipeDefinition {
  readonly id: HomesteadRecipeId;
  readonly townId?: HomesteadTownId;
  readonly name: string;
  readonly facilityId: HomesteadFacilityId;
  readonly durationSeconds: number;
  readonly coinCost: number;
  readonly inputs: readonly HomesteadResource[];
  readonly output: {
    readonly itemId: HomesteadGoodId;
    readonly quantity: number;
  };
}

export const HOMESTEAD_RECIPES = {
  mill_flour: {
    id: "mill_flour",
    name: "研磨面粉",
    facilityId: "mill",
    durationSeconds: 10 * MINUTE,
    coinCost: 2,
    inputs: [{ source: "farm", itemId: "wheat", quantity: 3 }],
    output: { itemId: "flour", quantity: 2 },
  },
  mill_coarse_feed: {
    id: "mill_coarse_feed",
    name: "混合粗饲料",
    facilityId: "mill",
    durationSeconds: 15 * MINUTE,
    coinCost: 3,
    inputs: [
      { source: "farm", itemId: "wheat", quantity: 2 },
      { source: "farm", itemId: "corn", quantity: 1 },
    ],
    output: { itemId: "coarse_feed", quantity: 3 },
  },
  feed_fortified: {
    id: "feed_fortified",
    name: "矿物强化饲料",
    facilityId: "feed_factory",
    durationSeconds: 30 * MINUTE,
    coinCost: 6,
    inputs: [
      { source: "goods", itemId: "coarse_feed", quantity: 2 },
      { source: "ranch", itemId: "egg", quantity: 1 },
      { source: "mine", itemId: "coal", quantity: 1 },
    ],
    output: { itemId: "fortified_feed", quantity: 2 },
  },
  fertilizer_soil_conditioner: {
    id: "fertilizer_soil_conditioner",
    name: "复合土壤改良剂",
    facilityId: "fertilizer_plant",
    durationSeconds: 45 * MINUTE,
    coinCost: 8,
    inputs: [
      { source: "farm", itemId: "pumpkin", quantity: 1 },
      { source: "ranch", itemId: "egg", quantity: 1 },
      { source: "mine", itemId: "coal", quantity: 1 },
    ],
    output: { itemId: "soil_conditioner", quantity: 2 },
  },
  textile_work_clothes: {
    id: "textile_work_clothes",
    name: "缝制耐寒工作服",
    facilityId: "textile_mill",
    durationSeconds: 60 * MINUTE,
    coinCost: 16,
    inputs: [
      { source: "farm", itemId: "cotton", quantity: 2 },
      { source: "ranch", itemId: "wool", quantity: 1 },
      { source: "mine", itemId: "coal", quantity: 1 },
    ],
    output: { itemId: "work_clothes", quantity: 1 },
  },
  smelt_iron_ingot: {
    id: "smelt_iron_ingot",
    name: "冶炼铁锭",
    facilityId: "smelter",
    durationSeconds: 90 * MINUTE,
    coinCost: 18,
    inputs: [
      { source: "mine", itemId: "iron", quantity: 3 },
      { source: "mine", itemId: "coal", quantity: 1 },
    ],
    output: { itemId: "iron_ingot", quantity: 2 },
  },
  workshop_mining_kit: {
    id: "workshop_mining_kit",
    name: "制作矿工防护套装",
    facilityId: "machine_shop",
    durationSeconds: 2 * 60 * MINUTE,
    coinCost: 36,
    inputs: [
      { source: "farm", itemId: "cotton", quantity: 1 },
      { source: "ranch", itemId: "rabbit_fur", quantity: 1 },
      { source: "goods", itemId: "iron_ingot", quantity: 1 },
    ],
    output: { itemId: "mining_kit", quantity: 1 },
  },
  kitchen_festival_crate: {
    id: "kitchen_festival_crate",
    name: "准备庆典食品箱",
    facilityId: "kitchen",
    durationSeconds: 75 * MINUTE,
    coinCost: 24,
    inputs: [
      { source: "goods", itemId: "flour", quantity: 1 },
      { source: "ranch", itemId: "egg", quantity: 2 },
      { source: "ranch", itemId: "milk", quantity: 1 },
      { source: "mine", itemId: "coal", quantity: 1 },
    ],
    output: { itemId: "festival_crate", quantity: 1 },
  },
  workshop_greenhouse_parts: {
    id: "workshop_greenhouse_parts",
    name: "组装温室构件",
    facilityId: "machine_shop",
    durationSeconds: 3 * 60 * MINUTE,
    coinCost: 48,
    inputs: [
      { source: "farm", itemId: "cotton", quantity: 2 },
      { source: "ranch", itemId: "wool", quantity: 1 },
      { source: "goods", itemId: "iron_ingot", quantity: 2 },
    ],
    output: { itemId: "greenhouse_parts", quantity: 1 },
  },
  ...FROSTPEAK_HOMESTEAD_RECIPE_CATALOG,
} as unknown as Readonly<
  Record<HomesteadRecipeId, HomesteadRecipeDefinition>
>;

export const GREENVALE_HOMESTEAD_ORDER_TEMPLATE_IDS = [
  "bakery_breakfast",
  "winter_uniforms",
  "miners_supply",
  "greenhouse_project",
  "mechanization_drive",
  "festival_banquet",
] as const;

export const HOMESTEAD_ORDER_TEMPLATE_IDS = [
  ...GREENVALE_HOMESTEAD_ORDER_TEMPLATE_IDS,
  ...FROSTPEAK_HOMESTEAD_ORDER_TEMPLATE_IDS,
] as const;

export type HomesteadOrderTemplateId =
  (typeof HOMESTEAD_ORDER_TEMPLATE_IDS)[number];

export interface HomesteadOrderTemplate {
  readonly id: HomesteadOrderTemplateId;
  readonly townId?: HomesteadTownId;
  readonly title: string;
  readonly description: string;
  readonly requirements: readonly HomesteadResource[];
  readonly coinReward: number;
  readonly reputationReward: number;
  readonly researchReward: number;
}

export const HOMESTEAD_ORDER_TEMPLATES = {
  bakery_breakfast: {
    id: "bakery_breakfast",
    title: "车站早餐供应",
    description: "车站需要面粉、鸡蛋和燃料准备清晨餐食。",
    requirements: [
      { source: "goods", itemId: "flour", quantity: 2 },
      { source: "ranch", itemId: "egg", quantity: 3 },
      { source: "mine", itemId: "coal", quantity: 1 },
    ],
    coinReward: 260,
    reputationReward: 18,
    researchReward: 3,
  },
  winter_uniforms: {
    id: "winter_uniforms",
    title: "冬季工作服",
    description: "山区寒潮将至，城镇急需保暖的工作服。",
    requirements: [
      { source: "goods", itemId: "work_clothes", quantity: 1 },
      { source: "farm", itemId: "carrot", quantity: 4 },
    ],
    coinReward: 420,
    reputationReward: 24,
    researchReward: 5,
  },
  miners_supply: {
    id: "miners_supply",
    title: "矿工综合补给",
    description: "为下一次深层勘探准备食物与防护材料。",
    requirements: [
      { source: "farm", itemId: "carrot", quantity: 4 },
      { source: "ranch", itemId: "egg", quantity: 3 },
      { source: "mine", itemId: "iron", quantity: 2 },
    ],
    coinReward: 340,
    reputationReward: 20,
    researchReward: 4,
  },
  greenhouse_project: {
    id: "greenhouse_project",
    title: "社区温室工程",
    description: "交付跨产业构件，帮助城镇建立全年生产温室。",
    requirements: [
      { source: "goods", itemId: "greenhouse_parts", quantity: 1 },
      { source: "goods", itemId: "soil_conditioner", quantity: 2 },
    ],
    coinReward: 720,
    reputationReward: 38,
    researchReward: 10,
  },
  mechanization_drive: {
    id: "mechanization_drive",
    title: "庄园机械化计划",
    description: "用金属、纺织材料和强化饲料改善三业生产。",
    requirements: [
      { source: "mine", itemId: "copper", quantity: 3 },
      { source: "ranch", itemId: "wool", quantity: 2 },
      { source: "goods", itemId: "fortified_feed", quantity: 2 },
    ],
    coinReward: 650,
    reputationReward: 34,
    researchReward: 8,
  },
  festival_banquet: {
    id: "festival_banquet",
    title: "丰收庆典宴席",
    description: "三业庄园共同为丰收庆典提供完整物资。",
    requirements: [
      { source: "goods", itemId: "festival_crate", quantity: 1 },
      { source: "farm", itemId: "grape", quantity: 3 },
      { source: "mine", itemId: "silver", quantity: 1 },
    ],
    coinReward: 880,
    reputationReward: 45,
    researchReward: 12,
  },
  ...FROSTPEAK_HOMESTEAD_ORDER_TEMPLATE_CATALOG,
} as unknown as Readonly<
  Record<HomesteadOrderTemplateId, HomesteadOrderTemplate>
>;

export const GREENVALE_HOMESTEAD_VALUE_ROUTE_IDS = [
  "valley_sauce_batch",
  "berry_preserves",
  "oil_and_melon_crate",
  "rare_fruit_gift",
  "grain_cooperative",
  "dairy_bakery_supply",
  "thermal_textiles",
  "utility_alloy",
  "jeweler_commission",
] as const;

export const CROSS_TOWN_HOMESTEAD_VALUE_ROUTE_IDS = [
  "greenvale_frostpeak_coldchain_link",
  "frostpeak_valley_greenhouse_link",
  "frostpeak_valley_relief_kitchen",
  "frostpeak_thermal_maintenance_link",
  "greenvale_alpine_health_fair",
  "greenvale_frostproof_waterworks",
] as const;

export const HOMESTEAD_VALUE_ROUTE_IDS = [
  ...GREENVALE_HOMESTEAD_VALUE_ROUTE_IDS,
  ...FROSTPEAK_HOMESTEAD_VALUE_ROUTE_IDS,
  ...CROSS_TOWN_HOMESTEAD_VALUE_ROUTE_IDS,
] as const;

export type HomesteadValueRouteId =
  (typeof HOMESTEAD_VALUE_ROUTE_IDS)[number];

export type HomesteadValueRouteKind =
  | "processing"
  | "public_project"
  | "specialty_order";

export interface HomesteadValueRouteDefinition {
  readonly id: HomesteadValueRouteId;
  readonly townId?: HomesteadTownId;
  readonly title: string;
  readonly description: string;
  readonly kind: HomesteadValueRouteKind;
  readonly stage: 2 | 3;
  readonly requirements: readonly HomesteadResource[];
  readonly coinReward: number;
  readonly reputationReward: number;
  readonly researchReward: number;
  readonly requiredInfrastructure?: {
    readonly id: HomesteadInfrastructureId;
    readonly level: number;
  };
}

/**
 * Every Greenvale primary crop, ranch product and mine deposit participates in
 * at least one route here or in the permanent recipe/order catalog. These
 * repeatable, once-per-day projects make the coverage visible and auditable.
 */
export const HOMESTEAD_VALUE_ROUTES = {
  valley_sauce_batch: {
    id: "valley_sauce_batch",
    title: "河谷调味酱批次",
    description: "合作社将番茄与胡萝卜加工成耐储运的调味酱。",
    kind: "processing",
    stage: 2,
    requirements: [
      { source: "farm", itemId: "tomato", quantity: 3 },
      { source: "farm", itemId: "carrot", quantity: 2 },
    ],
    coinReward: 90,
    reputationReward: 2,
    researchReward: 0,
  },
  berry_preserves: {
    id: "berry_preserves",
    title: "双莓果酱订单",
    description: "草莓和蓝莓经低温加工后供应车站商店。",
    kind: "processing",
    stage: 2,
    requirements: [
      { source: "farm", itemId: "strawberry", quantity: 2 },
      { source: "farm", itemId: "blueberry", quantity: 2 },
    ],
    coinReward: 430,
    reputationReward: 3,
    researchReward: 0,
  },
  oil_and_melon_crate: {
    id: "oil_and_melon_crate",
    title: "葵油瓜果联运箱",
    description: "向日葵榨油，西瓜进入冷链，组成夏季联运商品。",
    kind: "processing",
    stage: 2,
    requirements: [
      { source: "farm", itemId: "sunflower", quantity: 3 },
      { source: "farm", itemId: "watermelon", quantity: 2 },
    ],
    coinReward: 410,
    reputationReward: 3,
    researchReward: 1,
  },
  rare_fruit_gift: {
    id: "rare_fruit_gift",
    title: "珍果礼盒",
    description: "葡萄与火龙果组合成面向外镇商会的高端礼盒。",
    kind: "specialty_order",
    stage: 3,
    requirements: [
      { source: "farm", itemId: "grape", quantity: 2 },
      { source: "farm", itemId: "dragonfruit", quantity: 1 },
    ],
    coinReward: 540,
    reputationReward: 4,
    researchReward: 1,
  },
  grain_cooperative: {
    id: "grain_cooperative",
    title: "合作社谷物包",
    description: "小麦、玉米和南瓜组成稳定供应学校食堂的基础食品包。",
    kind: "public_project",
    stage: 2,
    requirements: [
      { source: "farm", itemId: "wheat", quantity: 4 },
      { source: "farm", itemId: "corn", quantity: 3 },
      { source: "farm", itemId: "pumpkin", quantity: 1 },
    ],
    coinReward: 150,
    reputationReward: 3,
    researchReward: 0,
  },
  dairy_bakery_supply: {
    id: "dairy_bakery_supply",
    title: "乳蛋烘焙供应",
    description: "鸡鸭蛋与两类乳品进入城镇烘焙和发酵工坊。",
    kind: "processing",
    stage: 2,
    requirements: [
      { source: "ranch", itemId: "egg", quantity: 2 },
      { source: "ranch", itemId: "duck_egg", quantity: 2 },
      { source: "ranch", itemId: "milk", quantity: 2 },
      { source: "ranch", itemId: "goat_milk", quantity: 1 },
    ],
    coinReward: 620,
    reputationReward: 4,
    researchReward: 1,
  },
  thermal_textiles: {
    id: "thermal_textiles",
    title: "复合保温织物",
    description: "兔绒、羊毛与棉花制成矿工和高寒城镇需要的保温面料。",
    kind: "processing",
    stage: 3,
    requirements: [
      { source: "ranch", itemId: "rabbit_fur", quantity: 2 },
      { source: "ranch", itemId: "wool", quantity: 2 },
      { source: "farm", itemId: "cotton", quantity: 2 },
    ],
    coinReward: 700,
    reputationReward: 5,
    researchReward: 1,
  },
  utility_alloy: {
    id: "utility_alloy",
    title: "公共设施合金",
    description: "煤、铁和铜用于维修车站、泵站和农业机械。",
    kind: "public_project",
    stage: 3,
    requirements: [
      { source: "mine", itemId: "coal", quantity: 2 },
      { source: "mine", itemId: "iron", quantity: 2 },
      { source: "mine", itemId: "copper", quantity: 2 },
    ],
    coinReward: 390,
    reputationReward: 5,
    researchReward: 2,
  },
  jeweler_commission: {
    id: "jeweler_commission",
    title: "商会珠宝委托",
    description: "银、金和晶簇由珠宝商加工，形成跨城镇高价值贸易品。",
    kind: "specialty_order",
    stage: 3,
    requirements: [
      { source: "mine", itemId: "silver", quantity: 2 },
      { source: "mine", itemId: "gold", quantity: 1 },
      { source: "mine", itemId: "crystal", quantity: 1 },
    ],
    coinReward: 1_180,
    reputationReward: 6,
    researchReward: 2,
  },
  ...FROSTPEAK_HOMESTEAD_VALUE_ROUTE_CATALOG,
  greenvale_frostpeak_coldchain_link: {
    id: "greenvale_frostpeak_coldchain_link",
    townId: "greenvale",
    title: "河谷冷链展销",
    description: "用霜岭运抵的云莓、牦牛奶与霜银，配合青禾葡萄举办限定展销。",
    kind: "specialty_order",
    stage: 3,
    requirements: [
      { source: "cargo", itemId: "frostpeak_coldchain_supplies", quantity: 1 },
      { source: "farm", itemId: "grape", quantity: 2 },
    ],
    coinReward: 980,
    reputationReward: 10,
    researchReward: 4,
  },
  frostpeak_valley_greenhouse_link: {
    id: "frostpeak_valley_greenhouse_link",
    townId: "frostpeak",
    title: "雪线温室联建",
    description: "用青禾运抵的棉花、乳品与温室构件，配合高山药草扩建雪线温室。",
    kind: "public_project",
    stage: 3,
    requirements: [
      { source: "cargo", itemId: "greenvale_warmhouse_supplies", quantity: 1 },
      { source: "farm", itemId: "alpine_herb", quantity: 2 },
    ],
    coinReward: 1_450,
    reputationReward: 12,
    researchReward: 5,
  },
  frostpeak_valley_relief_kitchen: {
    id: "frostpeak_valley_relief_kitchen",
    townId: "frostpeak",
    title: "雪季公共食堂联供",
    description: "用河谷民生补给列车运抵的谷物与工作服，配合霜麦粉和牦牛奶维持雪季食堂。",
    kind: "public_project",
    stage: 3,
    requirements: [
      { source: "cargo", itemId: "greenvale_grain_relief", quantity: 1 },
      { source: "goods", itemId: "frost_barley_flour", quantity: 2 },
      { source: "ranch", itemId: "yak_milk", quantity: 1 },
    ],
    coinReward: 850,
    reputationReward: 14,
    researchReward: 5,
    requiredInfrastructure: { id: "geothermal_greenhouse", level: 1 },
  },
  frostpeak_thermal_maintenance_link: {
    id: "frostpeak_thermal_maintenance_link",
    townId: "frostpeak",
    title: "热力站联合维保",
    description: "使用青禾机修构件专列和霜岭耐寒材料完成热力站年度维保。",
    kind: "public_project",
    stage: 3,
    requirements: [
      { source: "cargo", itemId: "greenvale_machine_components", quantity: 1 },
      { source: "goods", itemId: "frost_alloy", quantity: 1 },
      { source: "mine", itemId: "lignite", quantity: 2 },
    ],
    coinReward: 1_650,
    reputationReward: 18,
    researchReward: 7,
    requiredInfrastructure: { id: "avalanche_command", level: 2 },
  },
  greenvale_alpine_health_fair: {
    id: "greenvale_alpine_health_fair",
    townId: "greenvale",
    title: "高原健康展",
    description: "将高原药膳冷链箱与青禾乳品、葡萄组合成跨城健康展销。",
    kind: "specialty_order",
    stage: 3,
    requirements: [
      { source: "cargo", itemId: "frostpeak_alpine_medicine", quantity: 1 },
      { source: "ranch", itemId: "milk", quantity: 2 },
      { source: "farm", itemId: "grape", quantity: 2 },
    ],
    coinReward: 1_050,
    reputationReward: 15,
    researchReward: 6,
    requiredInfrastructure: { id: "cooperative_cold_storage", level: 1 },
  },
  greenvale_frostproof_waterworks: {
    id: "greenvale_frostproof_waterworks",
    townId: "greenvale",
    title: "河谷抗冻管网改造",
    description: "用霜岭寒区管网材料和青禾铁锭、燃料升级供水与冷库管线。",
    kind: "public_project",
    stage: 3,
    requirements: [
      { source: "cargo", itemId: "frostpeak_thermal_materials", quantity: 1 },
      { source: "goods", itemId: "iron_ingot", quantity: 1 },
      { source: "mine", itemId: "coal", quantity: 2 },
    ],
    coinReward: 1_380,
    reputationReward: 18,
    researchReward: 7,
    requiredInfrastructure: { id: "river_irrigation", level: 2 },
  },
} as unknown as Readonly<
  Record<HomesteadValueRouteId, HomesteadValueRouteDefinition>
>;

export const GREENVALE_HOMESTEAD_WORLD_EVENT_IDS = [
  "steady_weather",
  "harvest_festival",
  "mountain_seepage",
  "cold_snap",
  "heatwave",
  "windstorm",
  "hail",
  "drought",
  "greenvale_pipe_freeze",
] as const;

export const HOMESTEAD_WORLD_EVENT_IDS = [
  ...GREENVALE_HOMESTEAD_WORLD_EVENT_IDS,
  ...FROSTPEAK_HOMESTEAD_WORLD_EVENT_IDS,
] as const;

export type HomesteadWorldEventId =
  (typeof HOMESTEAD_WORLD_EVENT_IDS)[number];

export const HOMESTEAD_WEATHER_IDS = [
  "clear",
  "gentle_rain",
  "heatwave",
  "frost",
] as const;

export type HomesteadWeatherId = (typeof HOMESTEAD_WEATHER_IDS)[number];

export interface HomesteadWeatherDefinition {
  readonly id: HomesteadWeatherId;
  readonly name: string;
  readonly description: string;
  readonly tone: "good" | "neutral" | "warning";
  readonly farmYieldPercent: number;
  readonly farmDurationPercent: number;
  readonly ranchYieldPercent: number;
  readonly ranchDurationPercent: number;
  readonly mineYieldPercent: number;
  readonly mineDurationPercent: number;
}

export const HOMESTEAD_WEATHER: Readonly<
  Record<HomesteadWeatherId, HomesteadWeatherDefinition>
> = {
  clear: {
    id: "clear",
    name: "晴朗微风",
    description: "光照和通风稳定，三业按正常节奏运转。",
    tone: "good",
    farmYieldPercent: 5,
    farmDurationPercent: -5,
    ranchYieldPercent: 0,
    ranchDurationPercent: 0,
    mineYieldPercent: 0,
    mineDurationPercent: 0,
  },
  gentle_rain: {
    id: "gentle_rain",
    name: "温和降雨",
    description: "农田得到灌溉，但畜舍和矿道的作业速度略受影响。",
    tone: "neutral",
    farmYieldPercent: 10,
    farmDurationPercent: -5,
    ranchYieldPercent: 0,
    ranchDurationPercent: 5,
    mineYieldPercent: -5,
    mineDurationPercent: 5,
  },
  heatwave: {
    id: "heatwave",
    name: "高温热浪",
    description: "作物和牧群承受热应激，露天矿道暂时较为干燥。",
    tone: "warning",
    farmYieldPercent: -15,
    farmDurationPercent: 15,
    ranchYieldPercent: -15,
    ranchDurationPercent: 15,
    mineYieldPercent: 5,
    mineDurationPercent: 0,
  },
  frost: {
    id: "frost",
    name: "霜冻低温",
    description: "生长和畜产品形成速度下降，地下采掘基本不受影响。",
    tone: "warning",
    farmYieldPercent: -20,
    farmDurationPercent: 20,
    ranchYieldPercent: -10,
    ranchDurationPercent: 10,
    mineYieldPercent: 0,
    mineDurationPercent: 0,
  },
};

export const HOMESTEAD_RESILIENCE_IDS = [
  "weather_station",
  "drainage",
  "shelter",
] as const;

export type HomesteadResilienceId =
  (typeof HOMESTEAD_RESILIENCE_IDS)[number];

export interface HomesteadResilienceDefinition {
  readonly id: HomesteadResilienceId;
  readonly name: string;
  readonly description: string;
}

export const HOMESTEAD_RESILIENCE: Readonly<
  Record<HomesteadResilienceId, HomesteadResilienceDefinition>
> = {
  weather_station: {
    id: "weather_station",
    name: "气象站",
    description: "逐级削减恶劣天气的产量与工期惩罚，并开放次日预报。",
  },
  drainage: {
    id: "drainage",
    name: "矿山排水网",
    description: "逐级削减矿山渗水造成的减产与工期延长。",
  },
  shelter: {
    id: "shelter",
    name: "三业防护棚",
    description: "逐级削减寒潮对农田和牧群的影响。",
  },
};

export interface HomesteadWorldEventOption {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly costs: readonly HomesteadResource[];
  readonly coinCost: number;
  readonly coinReward: number;
  readonly reputationReward: number;
  readonly researchReward: number;
  readonly resolvesHazard?: boolean;
}

export interface HomesteadDecisionSectorEffect {
  readonly yieldPercent: number;
  readonly durationPercent: number;
}

export interface HomesteadDecisionProductionEffect {
  readonly label: string;
  readonly farm?: HomesteadDecisionSectorEffect;
  readonly ranch?: HomesteadDecisionSectorEffect;
  readonly mine?: HomesteadDecisionSectorEffect;
  readonly marketBuyPercent?: number;
  readonly marketSellPercent?: number;
}

export interface HomesteadActiveDecisionEffect {
  readonly dayKey: string;
  readonly eventId: HomesteadWorldEventId;
  readonly optionId: string;
  readonly effect: HomesteadDecisionProductionEffect;
}

export interface HomesteadWorldEventDefinition {
  readonly id: HomesteadWorldEventId;
  readonly townId?: HomesteadTownId;
  readonly title: string;
  readonly summary: string;
  readonly tone: "calm" | "opportunity" | "risk";
  readonly category?:
    | "routine"
    | "weather"
    | "disaster"
    | "opportunity";
  readonly weatherSignals?: readonly string[];
  readonly hazard?: {
    readonly id: string;
    readonly affectedSectors: readonly (
      HomesteadSectorId | "logistics"
    )[];
    readonly persistentUntilResolved: boolean;
    readonly yieldPercent: number;
    readonly durationPercent: number;
    readonly description: string;
  };
  readonly options: readonly HomesteadWorldEventOption[];
}

export const HOMESTEAD_WORLD_EVENTS = {
  steady_weather: {
    id: "steady_weather",
    title: "三业协作周",
    summary: "天气稳定，城镇邀请庄园提交一批跨产业样品。",
    tone: "calm",
    options: [
      {
        id: "submit_samples",
        label: "提交三业样品",
        description: "用基础农产品、畜产品和矿石换取研究资料。",
        costs: [
          { source: "farm", itemId: "wheat", quantity: 2 },
          { source: "ranch", itemId: "egg", quantity: 1 },
          { source: "mine", itemId: "coal", quantity: 1 },
        ],
        coinCost: 0,
        coinReward: 80,
        reputationReward: 8,
        researchReward: 3,
      },
      {
        id: "focus_production",
        label: "维持生产",
        description: "不额外投入资源，本日保持稳定经营。",
        costs: [],
        coinCost: 0,
        coinReward: 0,
        reputationReward: 2,
        researchReward: 0,
      },
    ],
  },
  harvest_festival: {
    id: "harvest_festival",
    title: "丰收庆典筹备",
    summary: "城镇需要食品、纺织品和燃料搭建庆典会场。",
    tone: "opportunity",
    options: [
      {
        id: "sponsor_feast",
        label: "赞助宴席",
        description: "提交面粉、鸡蛋与煤炭，获得大量声望。",
        costs: [
          { source: "goods", itemId: "flour", quantity: 1 },
          { source: "ranch", itemId: "egg", quantity: 2 },
          { source: "mine", itemId: "coal", quantity: 1 },
        ],
        coinCost: 0,
        coinReward: 160,
        reputationReward: 16,
        researchReward: 2,
      },
      {
        id: "open_market_stall",
        label: "开设庄园摊位",
        description: "占用公共会场经营高利润摊位，会损失少量当地声望。",
        costs: [],
        coinCost: 60,
        coinReward: 260,
        reputationReward: -3,
        researchReward: 0,
      },
    ],
  },
  mountain_seepage: {
    id: "mountain_seepage",
    title: "矿山渗水",
    summary: "山体渗水影响矿道，也为农田带来了可利用的水源。",
    tone: "risk",
    options: [
      {
        id: "reinforce_tunnel",
        label: "加固矿道",
        description: "投入纺织和金属材料，换取地质研究资料。",
        costs: [
          { source: "goods", itemId: "work_clothes", quantity: 1 },
          { source: "mine", itemId: "iron", quantity: 2 },
        ],
        coinCost: 0,
        coinReward: 100,
        reputationReward: 12,
        researchReward: 6,
      },
      {
        id: "channel_water",
        label: "引水灌溉",
        description: "投入棉花和煤炭建设临时水渠。",
        costs: [
          { source: "farm", itemId: "cotton", quantity: 1 },
          { source: "mine", itemId: "coal", quantity: 1 },
        ],
        coinCost: 0,
        coinReward: 60,
        reputationReward: 10,
        researchReward: 3,
      },
    ],
  },
  cold_snap: {
    id: "cold_snap",
    title: "突发寒潮",
    summary: "寒潮让牧场和农田需要保温，也推高了燃料需求。",
    tone: "risk",
    options: [
      {
        id: "protect_homestead",
        label: "全面保温",
        description: "消耗羊毛、棉花和煤炭保护庄园。",
        costs: [
          { source: "farm", itemId: "cotton", quantity: 1 },
          { source: "ranch", itemId: "wool", quantity: 1 },
          { source: "mine", itemId: "coal", quantity: 2 },
        ],
        coinCost: 0,
        coinReward: 120,
        reputationReward: 14,
        researchReward: 4,
      },
      {
        id: "buy_emergency_fuel",
        label: "采购应急燃料",
        description: "支付金币从城镇购买燃料。",
        costs: [],
        coinCost: 100,
        coinReward: 0,
        reputationReward: 5,
        researchReward: 1,
      },
    ],
  },
  heatwave: {
    id: "heatwave",
    title: "高温红色预警",
    summary: "连续高温正在压制作物与牧群状态，需要安排降温和错峰生产。",
    tone: "risk",
    options: [
      {
        id: "open_cooling_stations",
        label: "开放三业降温站",
        description: "投入乳品与燃料维持循环水和通风设备。",
        costs: [
          { source: "ranch", itemId: "milk", quantity: 2 },
          { source: "mine", itemId: "coal", quantity: 2 },
        ],
        coinCost: 0,
        coinReward: 80,
        reputationReward: 14,
        researchReward: 4,
      },
      {
        id: "stagger_work_shifts",
        label: "实行错峰作业",
        description: "支付临时调度费用，避免继续透支生产状态。",
        costs: [],
        coinCost: 100,
        coinReward: 0,
        reputationReward: 7,
        researchReward: 1,
      },
    ],
  },
  windstorm: {
    id: "windstorm",
    title: "强风预警",
    summary: "强风威胁棚舍、果园和露天运输，三业需要共同加固。",
    tone: "risk",
    options: [
      {
        id: "reinforce_shelters",
        label: "加固棚舍与果架",
        description: "使用温室构件和工作服组织抢修。",
        costs: [
          { source: "goods", itemId: "greenhouse_parts", quantity: 1 },
          { source: "goods", itemId: "work_clothes", quantity: 1 },
        ],
        coinCost: 0,
        coinReward: 100,
        reputationReward: 15,
        researchReward: 4,
      },
      {
        id: "suspend_exposed_work",
        label: "暂停露天作业",
        description: "承担停工和安置费用，换取较低风险。",
        costs: [],
        coinCost: 120,
        coinReward: 0,
        reputationReward: 8,
        researchReward: 1,
      },
    ],
  },
  hail: {
    id: "hail",
    title: "冰雹预警",
    summary: "冰雹可能损伤作物和棚舍，当前窗口需要紧急覆盖。",
    tone: "risk",
    options: [
      {
        id: "deploy_hail_covers",
        label: "铺设防雹覆盖",
        description: "投入温室构件和土壤改良剂保护田块。",
        costs: [
          { source: "goods", itemId: "greenhouse_parts", quantity: 1 },
          { source: "goods", itemId: "soil_conditioner", quantity: 1 },
        ],
        coinCost: 0,
        coinReward: 70,
        reputationReward: 13,
        researchReward: 4,
      },
      {
        id: "hire_emergency_crews",
        label: "雇佣应急覆盖队",
        description: "支付费用快速完成覆盖，不额外消耗库存。",
        costs: [],
        coinCost: 110,
        coinReward: 0,
        reputationReward: 6,
        researchReward: 1,
      },
    ],
  },
  drought: {
    id: "drought",
    title: "阶段性干旱预警",
    summary: "降水持续不足，农田和牧场用水需要重新分配。",
    tone: "risk",
    options: [
      {
        id: "reuse_process_water",
        label: "启用加工回用水",
        description: "投入改良剂和燃料运行临时净化与输水设备。",
        costs: [
          { source: "goods", itemId: "soil_conditioner", quantity: 1 },
          { source: "mine", itemId: "coal", quantity: 2 },
        ],
        coinCost: 0,
        coinReward: 90,
        reputationReward: 14,
        researchReward: 5,
      },
      {
        id: "purchase_water_quota",
        label: "购买应急水配额",
        description: "支付较高费用保住本周期基本生产。",
        costs: [],
        coinCost: 140,
        coinReward: 0,
        reputationReward: 7,
        researchReward: 1,
      },
    ],
  },
  greenvale_pipe_freeze: {
    id: "greenvale_pipe_freeze",
    townId: "greenvale",
    title: "青禾供水管网冻裂",
    summary: "急降温造成河谷支管冻裂，农田灌溉、畜舍供水和道路配送同时受阻。",
    tone: "risk",
    category: "disaster",
    weatherSignals: ["寒潮", "道路结冰", "低温", "管道冰冻"],
    hazard: {
      id: "greenvale_pipe_freeze",
      affectedSectors: ["farm", "ranch", "logistics"],
      persistentUntilResolved: true,
      yieldPercent: -12,
      durationPercent: 15,
      description: "供水中断会持续压低农牧产量并阻断跨城装运。",
    },
    options: [
      {
        id: "replace_frostproof_joints",
        label: "更换抗冻伸缩接头",
        description: "投入温室构件、铁锭和燃料完成永久抢修。",
        costs: [
          { source: "goods", itemId: "greenhouse_parts", quantity: 1 },
          { source: "goods", itemId: "iron_ingot", quantity: 1 },
          { source: "mine", itemId: "coal", quantity: 2 },
        ],
        coinCost: 0,
        coinReward: 140,
        reputationReward: 18,
        researchReward: 6,
        resolvesHazard: true,
      },
      {
        id: "dispatch_water_tankers",
        label: "调派应急送水车",
        description: "临时恢复三业供水，但冻裂点仍需后续彻底维修。",
        costs: [],
        coinCost: 180,
        coinReward: 0,
        reputationReward: 6,
        researchReward: 1,
        resolvesHazard: false,
      },
    ],
  },
  ...FROSTPEAK_HOMESTEAD_WORLD_EVENT_CATALOG,
} as unknown as Readonly<
  Record<HomesteadWorldEventId, HomesteadWorldEventDefinition>
>;

/**
 * Daily decisions can change the next production cycles started that day.
 * Keeping these effects in a trusted catalog means LLM-generated narratives
 * may select a template, but can never invent arbitrary production bonuses.
 */
export const HOMESTEAD_DECISION_PRODUCTION_EFFECTS: Readonly<
  Partial<
    Record<
      HomesteadWorldEventId,
      Readonly<Record<string, HomesteadDecisionProductionEffect>>
    >
  >
> = {
  steady_weather: {
    submit_samples: {
      label: "样品反馈：三业产出 +5%",
      farm: { yieldPercent: 5, durationPercent: 0 },
      ranch: { yieldPercent: 5, durationPercent: 0 },
      mine: { yieldPercent: 5, durationPercent: 0 },
    },
    focus_production: {
      label: "专注排产：三业工期 -6%",
      farm: { yieldPercent: 0, durationPercent: -6 },
      ranch: { yieldPercent: 0, durationPercent: -6 },
      mine: { yieldPercent: 0, durationPercent: -6 },
    },
  },
  harvest_festival: {
    sponsor_feast: {
      label: "庆典协作：农牧产出 +8%",
      farm: { yieldPercent: 8, durationPercent: 0 },
      ranch: { yieldPercent: 8, durationPercent: 0 },
      marketSellPercent: 4,
    },
    open_market_stall: {
      label: "摊位占用人手：农牧工期 +6%",
      farm: { yieldPercent: 0, durationPercent: 6 },
      ranch: { yieldPercent: 0, durationPercent: 6 },
      marketSellPercent: 12,
    },
  },
  mountain_seepage: {
    reinforce_tunnel: {
      label: "专业加固：矿山产出 +8%、工期 -8%",
      mine: { yieldPercent: 8, durationPercent: -8 },
    },
    channel_water: {
      label: "渗水回用：农场产出 +12%",
      farm: { yieldPercent: 12, durationPercent: 0 },
    },
  },
  cold_snap: {
    protect_homestead: {
      label: "全面保温：农牧产出 +10%",
      farm: { yieldPercent: 10, durationPercent: 0 },
      ranch: { yieldPercent: 10, durationPercent: 0 },
    },
    buy_emergency_fuel: {
      label: "应急供暖：农牧工期 -6%",
      farm: { yieldPercent: 0, durationPercent: -6 },
      ranch: { yieldPercent: 0, durationPercent: -6 },
      marketBuyPercent: 8,
    },
  },
  heatwave: {
    open_cooling_stations: {
      label: "循环降温：农牧产出 +10%",
      farm: { yieldPercent: 10, durationPercent: 0 },
      ranch: { yieldPercent: 10, durationPercent: 0 },
    },
    stagger_work_shifts: {
      label: "错峰排班：三业工期 -8%",
      farm: { yieldPercent: 0, durationPercent: -8 },
      ranch: { yieldPercent: 0, durationPercent: -8 },
      mine: { yieldPercent: 0, durationPercent: -8 },
    },
  },
  windstorm: {
    reinforce_shelters: {
      label: "结构加固：农牧产出 +8%、矿山工期 -4%",
      farm: { yieldPercent: 8, durationPercent: 0 },
      ranch: { yieldPercent: 8, durationPercent: 0 },
      mine: { yieldPercent: 0, durationPercent: -4 },
    },
    suspend_exposed_work: {
      label: "安全停工：农场与矿山工期 +8%",
      farm: { yieldPercent: 0, durationPercent: 8 },
      mine: { yieldPercent: 0, durationPercent: 8 },
    },
  },
  hail: {
    deploy_hail_covers: {
      label: "防雹覆盖：农场产出 +12%",
      farm: { yieldPercent: 12, durationPercent: 0 },
    },
    hire_emergency_crews: {
      label: "应急班组：农场工期 -10%",
      farm: { yieldPercent: 0, durationPercent: -10 },
    },
  },
  drought: {
    reuse_process_water: {
      label: "回用水：农牧产出 +10%",
      farm: { yieldPercent: 10, durationPercent: 0 },
      ranch: { yieldPercent: 10, durationPercent: 0 },
    },
    purchase_water_quota: {
      label: "应急配水：农牧工期 -8%",
      farm: { yieldPercent: 0, durationPercent: -8 },
      ranch: { yieldPercent: 0, durationPercent: -8 },
    },
  },
  greenvale_pipe_freeze: {
    replace_frostproof_joints: {
      label: "抗冻管网恢复：农牧产出 +10%、工期 -6%",
      farm: { yieldPercent: 10, durationPercent: -6 },
      ranch: { yieldPercent: 10, durationPercent: -6 },
      marketSellPercent: 5,
    },
    dispatch_water_tankers: {
      label: "应急供水：农牧产出 +4%",
      farm: { yieldPercent: 4, durationPercent: 0 },
      ranch: { yieldPercent: 4, durationPercent: 0 },
      marketBuyPercent: 8,
    },
  },
  frost_clear_shift: {
    submit_frost_samples: {
      label: "防寒样品反馈：三业产出 +5%",
      farm: { yieldPercent: 5, durationPercent: 0 },
      ranch: { yieldPercent: 5, durationPercent: 0 },
      mine: { yieldPercent: 5, durationPercent: 0 },
    },
    inspect_independently: {
      label: "独立巡检：三业工期 -5%",
      farm: { yieldPercent: 0, durationPercent: -5 },
      ranch: { yieldPercent: 0, durationPercent: -5 },
      mine: { yieldPercent: 0, durationPercent: -5 },
    },
  },
  frost_aurora_market: {
    open_aurora_stall: {
      label: "夜市备货：农场产出 +8%、工期 +4%",
      farm: { yieldPercent: 8, durationPercent: 4 },
      marketSellPercent: 12,
    },
    license_local_vendors: {
      label: "商户分流：三业工期 -4%",
      farm: { yieldPercent: 0, durationPercent: -4 },
      ranch: { yieldPercent: 0, durationPercent: -4 },
      mine: { yieldPercent: 0, durationPercent: -4 },
    },
  },
  frost_whiteout_damage: {
    repair_snow_shelter: {
      label: "雪棚修复：农牧产出 +10%",
      farm: { yieldPercent: 10, durationPercent: 0 },
      ranch: { yieldPercent: 10, durationPercent: 0 },
    },
    temporary_snow_bracing: {
      label: "临时支撑：农牧产出 +4%",
      farm: { yieldPercent: 4, durationPercent: 0 },
      ranch: { yieldPercent: 4, durationPercent: 0 },
    },
  },
  frost_avalanche: {
    organized_avalanche_clearance: {
      label: "专业排险：矿山产出 +12%、工期 -10%",
      mine: { yieldPercent: 12, durationPercent: -10 },
    },
    open_narrow_bypass: {
      label: "便道通行：矿山产出 +5%、工期 -5%",
      mine: { yieldPercent: 5, durationPercent: -5 },
    },
  },
  frost_geothermal_vent: {
    survey_geothermal_vent: {
      label: "地热勘测：矿山产出 +10%",
      mine: { yieldPercent: 10, durationPercent: 0 },
    },
    seal_geothermal_vent: {
      label: "稳定矿道：矿山工期 -5%",
      mine: { yieldPercent: 0, durationPercent: -5 },
    },
  },
  frost_ptarmigan_migration: {
    establish_bird_buffer: {
      label: "生态缓冲：牧场产出 +10%",
      ranch: { yieldPercent: 10, durationPercent: 0 },
    },
    close_ranch_gate: {
      label: "关闭外圈：牧场工期 +6%",
      ranch: { yieldPercent: 0, durationPercent: 6 },
    },
  },
  frost_rail_icing: {
    supply_rail_deicing: {
      label: "热力协同：三业工期 -3%",
      farm: { yieldPercent: 0, durationPercent: -3 },
      ranch: { yieldPercent: 0, durationPercent: -3 },
      mine: { yieldPercent: 0, durationPercent: -3 },
    },
  },
  frost_spring_thaw: {
    drain_spring_thaw: {
      label: "联动排水：农场与矿山产出 +10%",
      farm: { yieldPercent: 10, durationPercent: 0 },
      mine: { yieldPercent: 10, durationPercent: 0 },
    },
    pump_priority_shafts: {
      label: "主巷抽排：矿山产出 +8%",
      mine: { yieldPercent: 8, durationPercent: 0 },
    },
  },
  frost_highland_drought: {
    restore_highland_cistern: {
      label: "蓄水恢复：农牧产出 +10%",
      farm: { yieldPercent: 10, durationPercent: 0 },
      ranch: { yieldPercent: 10, durationPercent: 0 },
    },
    ration_highland_water: {
      label: "临时配水：农牧产出 +4%",
      farm: { yieldPercent: 4, durationPercent: 0 },
      ranch: { yieldPercent: 4, durationPercent: 0 },
    },
  },
};

function decisionProductionEffect(
  eventId: HomesteadWorldEventId,
  optionId: string,
): HomesteadDecisionProductionEffect | null {
  return HOMESTEAD_DECISION_PRODUCTION_EFFECTS[eventId]?.[optionId] ?? null;
}

export interface HomesteadProductionJob {
  readonly recipeId: HomesteadRecipeId;
  readonly startedAt: number;
  readonly completesAt: number;
  readonly outputQuantity: number;
  readonly accelerated?: boolean;
}

export interface HomesteadFacilityState {
  readonly id: HomesteadFacilityId;
  built: boolean;
  level: number;
  job: HomesteadProductionJob | null;
}

export interface HomesteadOrderState {
  readonly id: string;
  readonly templateId: HomesteadOrderTemplateId;
  readonly dayKey: string;
  completed: boolean;
}

export interface HomesteadWorldEventState {
  readonly eventId: HomesteadWorldEventId;
  readonly dayKey: string;
  selectedOptionId: string | null;
  narrative: string;
  source: "rules" | "llm";
  readonly instanceId?: string;
  readonly rulesVersion?: 1 | 2;
  readonly parameters?: HomesteadGeneratedEventParameters;
  startedDayKey: string;
  durationDays: number;
  unresolvedDays: number;
  severity: number;
}

export const HOMESTEAD_GENERATED_EVENT_PACING_IDS = [
  "single_day",
  "two_day_follow_up",
] as const;
export type HomesteadGeneratedEventPacingId =
  typeof HOMESTEAD_GENERATED_EVENT_PACING_IDS[number];

export interface HomesteadGeneratedEventParameters {
  readonly pacingId: HomesteadGeneratedEventPacingId;
  readonly durationDays: 1 | 2;
}

export interface HomesteadGeneratedEventBlueprint {
  readonly townId: HomesteadTownId;
  readonly dayKey: string;
  readonly templateId: HomesteadWorldEventId;
  readonly narrative?: string;
  readonly pacingId?: HomesteadGeneratedEventPacingId;
}

export interface CompiledHomesteadGeneratedEvent {
  readonly instanceId: string;
  readonly rulesVersion: 2;
  readonly eventId: HomesteadWorldEventId;
  readonly narrative: string;
  readonly parameters: HomesteadGeneratedEventParameters;
}

export interface HomesteadWeatherState {
  readonly weatherId: HomesteadWeatherId;
  readonly dayKey: string;
  readonly source?: "live" | "last_known_good" | "fallback" | "rules";
  readonly observedAt?: number;
  readonly validUntil?: number;
  readonly anchorCity?: string;
  readonly temperatureC?: number | null;
  readonly humidityPercent?: number | null;
  readonly precipitationMm?: number | null;
  readonly windKph?: number | null;
  readonly conditionText?: string;
  readonly stale?: boolean;
  readonly mechanicsEnabled?: boolean;
  readonly alertsAvailable?: boolean;
  readonly forecastAvailable?: boolean;
  readonly forecast?: readonly {
    readonly forecastStartAt: number;
    readonly forecastEndAt: number;
    readonly weatherId: HomesteadWeatherId;
    readonly conditionCode: string;
    readonly conditionText: string;
    readonly temperatureMinC: number;
    readonly temperatureMaxC: number;
    readonly precipitationMm: number;
    readonly precipitationProbabilityPercent: number;
    readonly humidityPercent: number;
    readonly windSpeedKph: number;
  }[];
  readonly fallbackReason?: string | null;
  readonly providerAttributions?: readonly string[];
  readonly liveHazards?: readonly {
    readonly id: string;
    readonly name: string;
    readonly headline: string;
    readonly severity: number;
    readonly affectsGameplay: boolean;
    readonly mechanicId?: HomesteadDisasterState["eventId"] | null;
    readonly expiresAt: number | null;
  }[];
}

export const HOMESTEAD_DISASTER_MECHANIC_IDS = [
  "mountain_seepage",
  "cold_snap",
  "heatwave",
  "windstorm",
  "hail",
  "drought",
] as const;

export interface HomesteadDisasterState {
  readonly eventId: (typeof HOMESTEAD_DISASTER_MECHANIC_IDS)[number];
  readonly contentEventId?: HomesteadWorldEventId;
  readonly providerAlertId?: string;
  readonly startedDayKey: string;
  remainingDays: number;
  unresolvedDays: number;
  severity: number;
  mitigated: boolean;
  resolution: string | null;
  reputationPenaltyPaid?: number;
  temporaryOptionId?: string | null;
}

export type HomesteadResilienceState = Record<HomesteadResilienceId, number>;
export type HomesteadSectorId = "farm" | "ranch" | "mine";
export type HomesteadEmergencyBoostState = Record<HomesteadSectorId, boolean>;

export interface HomesteadEmergencyOperationDefinition {
  readonly id: HomesteadSectorId;
  readonly name: string;
  readonly description: string;
  readonly costs: readonly HomesteadResource[];
  readonly yieldBonusPercent: number;
  readonly durationBonusPercent: number;
}

export const HOMESTEAD_EMERGENCY_OPERATIONS: Readonly<
  Record<HomesteadSectorId, HomesteadEmergencyOperationDefinition>
> = {
  farm: {
    id: "farm",
    name: "温室抢种",
    description: "投入土壤改良剂保护根系，并调整灾期种植批次。",
    costs: [{ source: "goods", itemId: "soil_conditioner", quantity: 1 }],
    yieldBonusPercent: 15,
    durationBonusPercent: -10,
  },
  ranch: {
    id: "ranch",
    name: "强化营养",
    description: "投入强化饲料稳定牧群应激和产品形成速度。",
    costs: [{ source: "goods", itemId: "fortified_feed", quantity: 1 }],
    yieldBonusPercent: 15,
    durationBonusPercent: -10,
  },
  mine: {
    id: "mine",
    name: "应急排采",
    description: "投入矿工防护套装，组织排水、支护和高效采掘班组。",
    costs: [{ source: "goods", itemId: "mining_kit", quantity: 1 }],
    yieldBonusPercent: 18,
    durationBonusPercent: -12,
  },
};

export interface HomesteadProductionRules {
  readonly farm: EstateProductionRule;
  readonly ranch: EstateProductionRule;
  readonly mine: EstateProductionRule;
}

export interface HomesteadStatistics {
  jobsStarted: number;
  jobsCollected: number;
  ordersCompleted: number;
  eventsResolved: number;
  facilitiesBuilt: number;
  facilityUpgrades: number;
  researchUnlocked: number;
  fieldPlansCompleted: number;
  herdProgramsCompleted: number;
  surveysCompleted: number;
  npcConversations: number;
  cargoShipmentsCollected: number;
  valueRoutesCompleted: number;
  honorRewardsClaimed: number;
  seasonRewardsClaimed: number;
  llmCalls: number;
  llmFallbacks: number;
  llmPromptTokens: number;
  llmCompletionTokens: number;
  generatedEventsApplied: number;
}

export interface HomesteadLogEntry {
  readonly id: string;
  readonly at: number;
  readonly type:
    | "facility"
    | "production"
    | "order"
    | "event"
    | "research"
    | "farm"
    | "ranch"
    | "mine"
    | "npc"
    | "honor"
    | "season"
    | "community"
    | "market";
  readonly message: string;
}

export interface HomesteadResearchState {
  unlocked: HomesteadResearchNodeId[];
}

export interface HomesteadFarmSpecializationState {
  soilHealth: number;
  lastCropFamily: HomesteadCropFamily | null;
  rotationStreak: number;
  fertilizerApplications: number;
  lastManagedDayKey: string | null;
  yieldBonusPercent: number;
}

export interface HomesteadRanchSpecializationState {
  herdHealth: number;
  lastFeedProgram: HomesteadFeedProgramId | null;
  discoveredTraits: HomesteadAnimalTraitId[];
  lastManagedDayKey: string | null;
  productBonusPercent: number;
}

export interface HomesteadMineSpecializationState {
  protectionLevel: number;
  surveyProgress: number;
  discoveredLayers: HomesteadMineLayerId[];
  lastManagedDayKey: string | null;
  oreBonusPercent: number;
}

export interface HomesteadNpcFact {
  readonly key: string;
  value: string;
  at: number;
}

export interface HomesteadNpcMemory {
  readonly npcId: HomesteadNpcId;
  affinity: number;
  trust: number;
  lastConversationDayKey: string | null;
  lastTopicId: HomesteadNpcTopicId | null;
  lastDialogue: string;
  facts: HomesteadNpcFact[];
}

export interface HomesteadAdvisorGuidance {
  readonly dayKey: string;
  readonly npcId: HomesteadNpcId;
  readonly topicId: HomesteadNpcTopicId;
  readonly sectorId: HomesteadSectorId;
  readonly yieldPercent: number;
  readonly durationPercent: number;
  readonly label: string;
}

export type HomesteadAdvisorGuidanceState = Record<
  HomesteadSectorId,
  HomesteadAdvisorGuidance | null
>;

export interface HomesteadSeasonState {
  id: string;
  startsAt: number;
  endsAt: number;
  score: number;
  claimedMilestones: HomesteadSeasonMilestoneId[];
  counters: {
    jobs: number;
    orders: number;
    specializations: number;
    community: number;
  };
}

export interface HomesteadHonorState {
  score: number;
  claimedMilestones: HomesteadHonorMilestoneId[];
}

export interface HomesteadCollectionEntry {
  readonly id: string;
  readonly unlockedAt: number;
}

export type HomesteadAdvicePanel = "today" | "operations" | "growth";
export type HomesteadAdviceTargetId =
  | "homestead-world-event"
  | "homestead-weather"
  | "homestead-processing"
  | "homestead-orders"
  | "homestead-research"
  | "homestead-town-rhythm"
  | "homestead-town-local"
  | "homestead-town-trade";

export interface HomesteadAdviceStep {
  readonly id: string;
  readonly title: string;
  readonly reason: string;
  readonly panel: HomesteadAdvicePanel;
  readonly targetId: HomesteadAdviceTargetId;
}

export type HomesteadAiGoal =
  | "balanced"
  | "wealth"
  | "reputation"
  | "research";
export type HomesteadAiRisk = "safe" | "balanced" | "bold";
export type HomesteadAiFocus =
  | "farm"
  | "ranch"
  | "mine"
  | "processing";

export interface HomesteadAiProfile {
  enabled: boolean;
  goal: HomesteadAiGoal;
  risk: HomesteadAiRisk;
  focus: HomesteadAiFocus;
}

export interface HomesteadAdviceState {
  dayKey: string;
  source: "rules" | "llm";
  headline: string;
  narrative: string;
  recommendation: string;
  npcId: HomesteadNpcId;
  npcLine: string;
  generatedAt: number;
  /** High-level dramatic intent chosen from a server whitelist. */
  worldBeatId?: HomesteadWorldBeatId;
  /** A bounded next-day hook; display-only and never an executable promise. */
  foreshadowing?: string;
  /** Server facts selected by index, retained for player-visible traceability. */
  evidence?: readonly HomesteadDirectorEvidence[];
  steps?: readonly HomesteadAdviceStep[];
  merchantRecommendationId?: EstateMerchantItemId | null;
}

export type HomesteadWorldBeatId =
  | "recovery"
  | "pressure"
  | "opportunity"
  | "community"
  | "discovery"
  | "trade";

export interface HomesteadDirectorEvidence {
  readonly id: string;
  readonly label: string;
}

export interface HomesteadSpecializations {
  farm: HomesteadFarmSpecializationState;
  ranch: HomesteadRanchSpecializationState;
  mine: HomesteadMineSpecializationState;
}

export interface HomesteadTownSectorJobState {
  readonly cycle: number;
  readonly startedAt: number;
  readonly completesAt: number;
}

export interface HomesteadTownSectorState {
  level: number;
  cycle: number;
  job: HomesteadTownSectorJobState | null;
}

export interface HomesteadTownEstateState {
  townId: HomesteadTownId;
  reputation: number;
  landmarkStage: number;
  inventory: HomesteadTownResourceCounts;
  sectors: Record<HomesteadTownSectorId, HomesteadTownSectorState>;
  resolvedProblemIds: string[];
}

export interface HomesteadTownNetworkState {
  activeTownId: HomesteadTownId;
  merchantRenown: number;
  towns: Record<HomesteadTownId, HomesteadTownEstateState>;
}

export interface HomesteadGameState {
  kind: "homestead";
  version: typeof HOMESTEAD_STATE_VERSION;
  readonly townId?: HomesteadTownId;
  revision: number;
  ownerId: string;
  ownerName: string;
  seed: string;
  createdAt: number;
  updatedAt: number;
  dayKey: string;
  reputation: number;
  researchPoints: number;
  goods: HomesteadGoodCounts;
  cargoInventory: Record<EstateCargoId, number>;
  facilities: HomesteadFacilityState[];
  orders: HomesteadOrderState[];
  worldEvent: HomesteadWorldEventState;
  decisionEffect: HomesteadActiveDecisionEffect | null;
  weather: HomesteadWeatherState;
  disaster: HomesteadDisasterState | null;
  resilience: HomesteadResilienceState;
  emergencyBoosts: HomesteadEmergencyBoostState;
  handledWeatherAlertIds: string[];
  statistics: HomesteadStatistics;
  nextLogId: number;
  logs: HomesteadLogEntry[];
  research: HomesteadResearchState;
  specializations: HomesteadSpecializations;
  npcs: HomesteadNpcMemory[];
  advisorGuidance: HomesteadAdvisorGuidanceState;
  infrastructure: HomesteadInfrastructureState;
  townRhythm: HomesteadTownRhythmState;
  collectionProgress: Record<string, number>;
  honor: HomesteadHonorState;
  /** @deprecated Legacy 56-day state retained only for save migration. */
  season: HomesteadSeasonState;
  collections: HomesteadCollectionEntry[];
  advice: HomesteadAdviceState;
  aiProfile: HomesteadAiProfile;
  townNetwork: HomesteadTownNetworkState;
  valueRouteDayKeys: Record<HomesteadValueRouteId, string | null>;
}

export interface HomesteadLinkedEconomy {
  farmRevision: number;
  ranchRevision: number;
  mineRevision: number;
  coins: number;
  farmProduce: FarmingCropCounts;
  ranchProducts: RanchProductCounts;
  mineOres: MineOreCounts;
  readonly accountRevision?: number;
  readonly activeTownId?: EstateTownId;
  readonly unlockedTownIds?: readonly EstateTownId[];
  readonly merchantRenown?: number;
  readonly townProgress?: Partial<Record<EstateTownId, EstateTownProgress>>;
  readonly merchantInventory?: EstateMerchantInventory;
  readonly purchaseLedger?: EstateAccountState["purchaseLedger"];
  readonly logistics?: EstateAccountState["logistics"];
  readonly travelLogs?: EstateAccountState["travelLogs"];
  readonly shipments?: EstateAccountState["shipments"];
  readonly shopRecommendationId?: EstateMerchantItemId | null;
  readonly shopRecommendationSource?: "rules" | "llm";
}

export type HomesteadAction =
  | {
      readonly type: "homestead_build_facility";
      readonly facilityId: HomesteadFacilityId;
    }
  | {
      readonly type: "homestead_start_job";
      readonly recipeId: HomesteadRecipeId;
    }
  | {
      readonly type: "homestead_collect_job";
      readonly facilityId: HomesteadFacilityId;
    }
  | {
      readonly type: "homestead_complete_order";
      readonly orderId: string;
    }
  | {
      readonly type: "homestead_choose_event";
      readonly optionId: string;
    }
  | {
      readonly type: "homestead_unlock_research";
      readonly nodeId: HomesteadResearchNodeId;
    }
  | {
      readonly type: "homestead_upgrade_facility";
      readonly facilityId: HomesteadFacilityId;
    }
  | {
      readonly type: "homestead_plan_rotation";
      readonly cropFamily: HomesteadCropFamily;
      readonly useFertilizer: boolean;
    }
  | {
      readonly type: "homestead_run_feed_program";
      readonly programId: HomesteadFeedProgramId;
    }
  | {
      readonly type: "homestead_upgrade_mine_protection";
    }
  | {
      readonly type: "homestead_survey_layer";
      readonly layerId: HomesteadMineLayerId;
    }
  | {
      readonly type: "homestead_talk_npc";
      readonly npcId: HomesteadNpcId;
      readonly topicId: HomesteadNpcTopicId;
    }
  | {
      readonly type: "homestead_claim_season_reward";
      readonly milestoneId: HomesteadSeasonMilestoneId;
    }
  | {
      readonly type: "homestead_claim_honor_reward";
      readonly milestoneId: HomesteadHonorMilestoneId;
    }
  | {
      readonly type: "homestead_upgrade_resilience";
      readonly resilienceId: HomesteadResilienceId;
    }
  | {
      readonly type: "homestead_upgrade_infrastructure";
      readonly infrastructureId: HomesteadInfrastructureId;
    }
  | {
      readonly type: "homestead_activate_emergency_boost";
      readonly sectorId: HomesteadSectorId;
    }
  | {
      readonly type: "homestead_unlock_town";
      readonly townId: HomesteadTownId;
    }
  | {
      readonly type: "homestead_switch_town";
      readonly townId: HomesteadTownId;
    }
  | {
      readonly type: "homestead_buy_merchant_item";
      readonly itemId: EstateMerchantItemId;
    }
  | {
      readonly type: "homestead_use_acceleration_card";
      readonly facilityId: HomesteadFacilityId;
    }
  | {
      readonly type: "homestead_dispatch_cargo";
      readonly cargoId: EstateCargoId;
    }
  | {
      readonly type: "homestead_collect_cargo";
      readonly shipmentId: string;
    }
  | {
      readonly type: "homestead_update_ai_profile";
      readonly enabled: boolean;
      readonly goal: HomesteadAiGoal;
      readonly risk: HomesteadAiRisk;
      readonly focus: HomesteadAiFocus;
    }
  | {
      readonly type: "homestead_start_town_sector";
      readonly sectorId: HomesteadTownSectorId;
    }
  | {
      readonly type: "homestead_collect_town_sector";
      readonly sectorId: HomesteadTownSectorId;
    }
  | {
      readonly type: "homestead_upgrade_town_sector";
      readonly sectorId: HomesteadTownSectorId;
    }
  | {
      readonly type: "homestead_sell_town_resource";
      readonly resourceId: HomesteadTownResourceId;
      readonly quantity: number;
    }
  | {
      readonly type: "homestead_resolve_town_problem";
      readonly problemId: string;
    }
  | {
      readonly type: "homestead_restore_town_landmark";
    }
  | {
      readonly type: "homestead_complete_value_route";
      readonly routeId: HomesteadValueRouteId;
    };

export interface HomesteadActionResult {
  readonly homestead: HomesteadGameState;
  readonly economy: HomesteadLinkedEconomy;
  readonly farmChanged: boolean;
  readonly ranchChanged: boolean;
  readonly mineChanged: boolean;
}

export type HomesteadResourceView = HomesteadResource & {
  readonly available: number;
  readonly sufficient: boolean;
};

export interface HomesteadRecipeView extends HomesteadRecipeDefinition {
  readonly facilityBuilt: boolean;
  readonly facilityBusy: boolean;
  readonly inputsView: readonly HomesteadResourceView[];
  readonly canStart: boolean;
  readonly effectiveDurationSeconds: number;
  readonly effectiveOutputQuantity: number;
}

export interface HomesteadFacilityView extends HomesteadFacilityState {
  readonly definition: HomesteadFacilityDefinition;
  readonly ready: boolean;
  readonly progress: number;
  readonly canBuild: boolean;
  readonly canAccelerate: boolean;
  readonly accelerationDisabledReason: string | null;
  readonly maximumLevel: number;
  readonly nextUpgrade: {
    readonly level: number;
    readonly coinCost: number;
    readonly ironIngotCost: number;
    readonly requiredGoodId: HomesteadGoodId;
    readonly requiredResearch: HomesteadResearchNodeId;
    readonly canUpgrade: boolean;
  } | null;
}

export interface HomesteadOrderView extends HomesteadOrderState {
  readonly template: HomesteadOrderTemplate;
  readonly requirements: readonly HomesteadResourceView[];
  readonly logisticsCost: 2;
  readonly canComplete: boolean;
  readonly disabledReason: string | null;
}

export interface HomesteadResearchView {
  readonly definition: (typeof HOMESTEAD_RESEARCH)[HomesteadResearchNodeId];
  readonly unlocked: boolean;
  readonly canUnlock: boolean;
  readonly missingPrerequisites: readonly HomesteadResearchNodeId[];
  readonly requirements: readonly {
    readonly label: string;
    readonly current: number;
    readonly required: number;
    readonly satisfied: boolean;
  }[];
  readonly missingRequirements: readonly string[];
}

export interface HomesteadCropFamilyView {
  readonly definition: (typeof HOMESTEAD_CROP_FAMILIES)[HomesteadCropFamily];
  readonly canPlan: boolean;
  readonly rotationImprovesSoil: boolean;
}

export interface HomesteadFeedProgramView {
  readonly definition: (typeof HOMESTEAD_FEED_PROGRAMS)[HomesteadFeedProgramId];
  readonly canRun: boolean;
  readonly lockedByResearch: boolean;
  readonly hasResources: boolean;
  readonly requiredGoodId: HomesteadGoodId | null;
}

export interface HomesteadMineLayerView {
  readonly definition: (typeof HOMESTEAD_MINE_LAYERS)[HomesteadMineLayerId];
  readonly discovered: boolean;
  readonly canSurvey: boolean;
  readonly lockedByResearch: boolean;
  readonly lockedByProtection: boolean;
  readonly hasResources: boolean;
  readonly requiredKitGoodId: HomesteadGoodId;
}

export interface HomesteadNpcView extends HomesteadNpcMemory {
  readonly definition: (typeof HOMESTEAD_NPCS)[HomesteadNpcId];
  readonly canTalkToday: boolean;
}

export interface HomesteadSeasonMilestoneView {
  readonly definition:
    (typeof HOMESTEAD_SEASON_MILESTONES)[HomesteadSeasonMilestoneId];
  readonly claimed: boolean;
  readonly canClaim: boolean;
  readonly lockedByResearch: boolean;
}

export interface HomesteadHonorMilestoneView {
  readonly definition:
    (typeof HOMESTEAD_HONOR_MILESTONES)[HomesteadHonorMilestoneId];
  readonly claimed: boolean;
  readonly canClaim: boolean;
  readonly lockedByResearch: boolean;
}

export interface HomesteadResilienceView {
  readonly definition: HomesteadResilienceDefinition;
  readonly level: number;
  readonly maximumLevel: number;
  readonly nextUpgrade: {
    readonly level: number;
    readonly coinCost: number;
    readonly researchCost: number;
    readonly ironIngotCost: number;
    readonly requiredGoodId: HomesteadGoodId;
    readonly canUpgrade: boolean;
  } | null;
}

export interface HomesteadInfrastructureView {
  readonly definition:
    (typeof HOMESTEAD_INFRASTRUCTURE)[HomesteadInfrastructureId];
  readonly level: number;
  readonly nextUpgrade: {
    readonly level: number;
    readonly coinCost: number;
    readonly researchCost: number;
    readonly alloyCost: number;
    readonly requiredGoodId: HomesteadGoodId;
    readonly canUpgrade: boolean;
    readonly disabledReason: string | null;
  } | null;
}

export interface HomesteadEmergencyOperationView
  extends HomesteadEmergencyOperationDefinition {
  readonly activated: boolean;
  readonly costsView: readonly HomesteadResourceView[];
  readonly logisticsCost: 1;
  readonly canActivate: boolean;
}

export interface HomesteadCollectionView extends HomesteadCollectionDefinition {
  readonly unlocked: boolean;
  readonly unlockedAt: number | null;
}

export interface HomesteadTownSectorView extends HomesteadTownSectorState {
  readonly definition: HomesteadTownSectorDefinition;
  readonly ready: boolean;
  readonly progress: number;
  readonly outputQuantity: number;
  readonly canStart: boolean;
  readonly canCollect: boolean;
  readonly nextUpgrade: {
    readonly level: number;
    readonly coinCost: number;
    readonly reputationRequired: number;
    readonly crystalCost: number;
    readonly canUpgrade: boolean;
  } | null;
}

export interface HomesteadTownEstateView {
  readonly definition: HomesteadTownDefinition;
  readonly active: boolean;
  readonly unlocked: boolean;
  readonly canUnlock: boolean;
  readonly unlockCoinCost: number;
  readonly unlockMissing: readonly string[];
  readonly travel: {
    readonly routeName: string;
    readonly mode: "rail" | "ship" | "caravan";
    readonly baseFare: number;
    readonly payableFare: number;
    readonly canTravel: boolean;
    readonly reason: string | null;
  } | null;
  readonly reputation: number;
  readonly landmarkStage: number;
  readonly landmarkComplete: boolean;
  readonly inventory: HomesteadTownResourceCounts;
  readonly sectors: readonly HomesteadTownSectorView[];
  readonly currentProblem: (HomesteadTownProblemDefinition & {
    readonly requirementsView: readonly {
      readonly itemId: HomesteadTownResourceId;
      readonly quantity: number;
      readonly available: number;
      readonly sufficient: boolean;
    }[];
    readonly canResolve: boolean;
  }) | null;
  readonly nextLandmark: (HomesteadTownLandmarkStageDefinition & {
    readonly requirementsView: readonly {
      readonly itemId: HomesteadTownResourceId;
      readonly quantity: number;
      readonly available: number;
      readonly sufficient: boolean;
    }[];
    readonly canRestore: boolean;
  }) | null;
}

export interface HomesteadMerchantItemView
  extends EstateMerchantItemDefinition {
  readonly owned: number;
  readonly purchasedToday: number;
  readonly canBuy: boolean;
  readonly disabledReason: string | null;
  readonly recommended: boolean;
}

export interface HomesteadValueRouteView
  extends HomesteadValueRouteDefinition {
  readonly requirementsView: readonly HomesteadResourceView[];
  readonly logisticsCost: 1 | 2;
  readonly completedToday: boolean;
  readonly canComplete: boolean;
  readonly disabledReason: string | null;
}

export interface EstateCargoRouteView extends EstateCargoDefinition {
  readonly requirementsView: readonly HomesteadResourceView[];
  readonly canDispatch: boolean;
  readonly disabledReason: string | null;
}

export interface EstateShipmentView extends EstateShipment {
  readonly definition: EstateCargoDefinition;
  readonly status: "in_transit" | "ready" | "collected";
  readonly canCollect: boolean;
  readonly disabledReason: string | null;
}

export interface HomesteadGameView {
  readonly kind: "homestead";
  readonly version: typeof HOMESTEAD_STATE_VERSION;
  readonly revision: number;
  readonly serverTime: number;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly reputation: number;
  readonly merchantRenown: number;
  readonly researchPoints: number;
  readonly coins: number;
  readonly accountRevision: number;
  readonly activeTownId: HomesteadTownId;
  readonly towns: readonly HomesteadTownEstateView[];
  readonly plannedTowns: typeof PLANNED_TOWN_PREVIEWS;
  readonly logistics: EstateAccountState["logistics"];
  readonly travelLogs: EstateAccountState["travelLogs"];
  readonly intertownLogistics: {
    readonly routes: readonly EstateCargoRouteView[];
    readonly shipments: readonly EstateShipmentView[];
    readonly inventory: Readonly<Record<EstateCargoId, number>>;
  };
  readonly merchantShop: {
    readonly recommendationSource: "rules" | "llm";
    readonly items: readonly HomesteadMerchantItemView[];
  };
  readonly activeGoodIds: readonly HomesteadGoodId[];
  readonly valueRoutes: readonly HomesteadValueRouteView[];
  readonly goods: HomesteadGoodCounts;
  readonly facilities: readonly HomesteadFacilityView[];
  readonly recipes: readonly HomesteadRecipeView[];
  readonly orders: readonly HomesteadOrderView[];
  readonly worldEvent: HomesteadWorldEventState & {
    readonly definition: Omit<HomesteadWorldEventDefinition, "options"> & {
      readonly options: readonly (HomesteadWorldEventOption & {
        readonly costsView: readonly HomesteadResourceView[];
        readonly canChoose: boolean;
        readonly missingCoins: number;
        readonly missingReputation: number;
        readonly temporaryAlreadyUsed: boolean;
        readonly productionEffect: HomesteadDecisionProductionEffect | null;
      })[];
    };
  };
  readonly weather: HomesteadWeatherState & {
    readonly definition: HomesteadWeatherDefinition;
    readonly tomorrow: HomesteadWeatherDefinition | null;
  };
  readonly disaster: (HomesteadDisasterState & {
    readonly nextReputationLoss: number;
    readonly reputationPenaltyContinues: boolean;
  }) | null;
  readonly productionRules: HomesteadProductionRules;
  readonly resilience: readonly HomesteadResilienceView[];
  readonly infrastructure: readonly HomesteadInfrastructureView[];
  readonly townRhythm: {
    readonly definition: ReturnType<typeof townRhythmDefinition>;
    readonly progress: 0 | 1 | 2 | 3;
    readonly completedCycles: number;
    readonly nextStepIndex: number | null;
    readonly blockedToday: boolean;
    readonly activeEffect: ReturnType<typeof homesteadTownRhythmEffect>;
  };
  readonly emergencyOperations: readonly HomesteadEmergencyOperationView[];
  readonly research: readonly HomesteadResearchView[];
  readonly specializations: HomesteadSpecializations & {
    readonly cropFamilies: readonly HomesteadCropFamilyView[];
    readonly feedPrograms: readonly HomesteadFeedProgramView[];
    readonly mineLayers: readonly HomesteadMineLayerView[];
    readonly soilAmendmentGoodId: HomesteadGoodId;
    readonly canManageFarmToday: boolean;
    readonly canManageRanchToday: boolean;
    readonly canManageMineToday: boolean;
    readonly nextProtectionUpgrade: {
      readonly level: number;
      readonly coinCost: number;
      readonly ironIngotCost: number;
      readonly miningKitCost: number;
      readonly alloyGoodId: HomesteadGoodId;
      readonly miningKitGoodId: HomesteadGoodId;
      readonly canUpgrade: boolean;
    } | null;
  };
  readonly npcs: readonly HomesteadNpcView[];
  readonly advisorGuidance: HomesteadAdvisorGuidanceState;
  readonly honor: HomesteadHonorState & {
    readonly progressPercent: number;
    readonly milestones: readonly HomesteadHonorMilestoneView[];
  };
  /** @deprecated Legacy client compatibility. */
  readonly season: HomesteadSeasonState & {
    readonly progressPercent: number;
    readonly milestones: readonly HomesteadSeasonMilestoneView[];
  };
  readonly collections: readonly HomesteadCollectionView[];
  readonly advice: HomesteadAdviceState;
  readonly aiProfile: HomesteadAiProfile;
  readonly statistics: HomesteadStatistics;
  readonly logs: readonly HomesteadLogEntry[];
  readonly revisions: {
    readonly farm: number;
    readonly ranch: number;
    readonly mine: number;
  };
}

export type HomesteadRuleErrorCode =
  | "HOMESTEAD_INVALID_ACTION"
  | "HOMESTEAD_FACILITY_ALREADY_BUILT"
  | "HOMESTEAD_FACILITY_LOCKED"
  | "HOMESTEAD_FACILITY_NOT_BUILT"
  | "HOMESTEAD_FACILITY_BUSY"
  | "HOMESTEAD_JOB_NOT_FOUND"
  | "HOMESTEAD_JOB_NOT_READY"
  | "HOMESTEAD_NOT_ENOUGH_COINS"
  | "HOMESTEAD_NOT_ENOUGH_REPUTATION"
  | "HOMESTEAD_NOT_ENOUGH_RESOURCES"
  | "HOMESTEAD_ORDER_NOT_FOUND"
  | "HOMESTEAD_ORDER_COMPLETED"
  | "HOMESTEAD_EVENT_ALREADY_RESOLVED"
  | "HOMESTEAD_EVENT_OPTION_NOT_FOUND"
  | "HOMESTEAD_RESEARCH_NOT_FOUND"
  | "HOMESTEAD_RESEARCH_ALREADY_UNLOCKED"
  | "HOMESTEAD_RESEARCH_LOCKED"
  | "HOMESTEAD_FACILITY_MAX_LEVEL"
  | "HOMESTEAD_DAILY_SPECIALIZATION_DONE"
  | "HOMESTEAD_SPECIALIZATION_LOCKED"
  | "HOMESTEAD_NPC_NOT_FOUND"
  | "HOMESTEAD_NPC_ALREADY_TALKED"
  | "HOMESTEAD_NPC_TOPIC_NOT_FOUND"
  | "HOMESTEAD_SEASON_REWARD_LOCKED"
  | "HOMESTEAD_SEASON_REWARD_CLAIMED";

export class HomesteadRuleError extends Error {
  constructor(
    readonly code: HomesteadRuleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "HomesteadRuleError";
  }
}

function dayKey(now: number): string {
  return new Date(now + 8 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

function dayNumber(key: string): number {
  return Math.floor(Date.parse(`${key}T00:00:00.000Z`) / 86_400_000);
}

function nextDayKey(key: string, amount = 1): string {
  return new Date((dayNumber(key) + amount) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function hashText(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function goodCounts(initial = 0): HomesteadGoodCounts {
  return Object.fromEntries(
    HOMESTEAD_GOOD_IDS.map((id) => [id, initial]),
  ) as HomesteadGoodCounts;
}

function cargoCounts(initial = 0): Record<EstateCargoId, number> {
  return Object.fromEntries(
    ESTATE_CARGO_IDS.map((id) => [id, initial]),
  ) as Record<EstateCargoId, number>;
}

function createValueRouteDayKeys(): Record<
  HomesteadValueRouteId,
  string | null
> {
  return Object.fromEntries(
    HOMESTEAD_VALUE_ROUTE_IDS.map((id) => [id, null]),
  ) as Record<HomesteadValueRouteId, string | null>;
}

function townResourceCounts(initial = 0): HomesteadTownResourceCounts {
  return Object.fromEntries(
    HOMESTEAD_TOWN_RESOURCE_IDS.map((id) => [id, initial]),
  ) as HomesteadTownResourceCounts;
}

function createTownEstate(townId: HomesteadTownId): HomesteadTownEstateState {
  return {
    townId,
    reputation: 0,
    landmarkStage: 0,
    inventory: townResourceCounts(),
    sectors: {
      farm: { level: 1, cycle: 0, job: null },
      ranch: { level: 1, cycle: 0, job: null },
      mine: { level: 1, cycle: 0, job: null },
    },
    resolvedProblemIds: [],
  };
}

function createTownNetwork(): HomesteadTownNetworkState {
  return {
    activeTownId: "greenvale",
    merchantRenown: 0,
    towns: {
      greenvale: createTownEstate("greenvale"),
      frostpeak: createTownEstate("frostpeak"),
    },
  };
}

function townSectorUpgrade(
  sector: HomesteadTownSectorState,
): {
  level: number;
  coinCost: number;
  reputationRequired: number;
  crystalCost: number;
} | null {
  if (sector.level >= 3) return null;
  const level = sector.level + 1;
  return level === 2
    ? { level, coinCost: 140, reputationRequired: 8, crystalCost: 1 }
    : { level, coinCost: 360, reputationRequired: 30, crystalCost: 5 };
}

function createFacilities(): HomesteadFacilityState[] {
  return HOMESTEAD_FACILITY_IDS.map((id) => ({
    id,
    built: id === "mill",
    level: id === "mill" ? 1 : 0,
    job: null,
  }));
}

function createResilience(): HomesteadResilienceState {
  return {
    weather_station: 0,
    drainage: 0,
    shelter: 0,
  };
}

function createEmergencyBoosts(): HomesteadEmergencyBoostState {
  return { farm: false, ranch: false, mine: false };
}

function weatherForDay(seed: string, key: string): HomesteadWeatherState {
  const weatherId = HOMESTEAD_WEATHER_IDS[
    hashText(`${seed}:weather:${key}`) % HOMESTEAD_WEATHER_IDS.length
  ]!;
  return {
    weatherId,
    dayKey: key,
    source: "rules",
    mechanicsEnabled: true,
  };
}

function resilienceUpgrade(
  id: HomesteadResilienceId,
  currentLevel: number,
): {
  level: number;
  coinCost: number;
  researchCost: number;
  ironIngotCost: number;
} | null {
  if (currentLevel >= 3) return null;
  const level = currentLevel + 1;
  const base = id === "weather_station"
    ? 1
    : id === "drainage" ? 2 : 3;
  return {
    level,
    coinCost: [0, 180, 480, 960][level]! + base * 40,
    researchCost: [0, 2, 5, 9][level]! + (base === 1 ? 0 : 1),
    ironIngotCost: level === 1 ? 0 : level - 1,
  };
}

function reduceWeatherPenalty(value: number, stationLevel: number): number {
  if (value <= 0) {
    return Math.round(value * Math.max(0.4, 1 - stationLevel * 0.2));
  }
  return value;
}

function reduceWeatherDelay(value: number, stationLevel: number): number {
  if (value > 0) {
    return Math.round(value * Math.max(0.4, 1 - stationLevel * 0.2));
  }
  return value;
}

export function getHomesteadProductionRules(
  state: HomesteadGameState,
): HomesteadProductionRules {
  const weatherDefinition = HOMESTEAD_WEATHER[state.weather.weatherId];
  const weatherMechanicsEnabled =
    (
      state.weather.source === "live" ||
      state.weather.source === "rules"
    ) &&
    state.weather.mechanicsEnabled === true;
  const weather = weatherMechanicsEnabled
    ? weatherDefinition
    : {
        ...weatherDefinition,
        name: `${weatherDefinition.name}·数据回退`,
        farmYieldPercent: 0,
        farmDurationPercent: 0,
        ranchYieldPercent: 0,
        ranchDurationPercent: 0,
        mineYieldPercent: 0,
        mineDurationPercent: 0,
      };
  const stationLevel = state.resilience.weather_station;
  let farmYield = state.specializations.farm.yieldBonusPercent +
    reduceWeatherPenalty(weather.farmYieldPercent, stationLevel);
  let farmDuration = reduceWeatherDelay(
    weather.farmDurationPercent,
    stationLevel,
  );
  let ranchYield = state.specializations.ranch.productBonusPercent +
    reduceWeatherPenalty(weather.ranchYieldPercent, stationLevel);
  let ranchDuration = reduceWeatherDelay(
    weather.ranchDurationPercent,
    stationLevel,
  );
  let mineYield = state.specializations.mine.oreBonusPercent +
    reduceWeatherPenalty(weather.mineYieldPercent, stationLevel);
  let mineDuration = reduceWeatherDelay(
    weather.mineDurationPercent,
    stationLevel,
  );
  let marketBuyPercent = 0;
  let marketSellPercent = 0;
  const marketSources: string[] = [];
  const farmSources = [weather.name];
  const ranchSources = [weather.name];
  const mineSources = [weather.name];
  for (const nodeId of state.research.unlocked) {
    const definition = HOMESTEAD_RESEARCH[nodeId];
    if (!definition?.production) continue;
    const farm = definition.production.farm;
    const ranch = definition.production.ranch;
    const mine = definition.production.mine;
    if (farm) {
      farmYield += farm.yieldPercent;
      farmDuration += farm.durationPercent;
      farmSources.push(`${definition.name}：产出 ${farm.yieldPercent >= 0 ? "+" : ""}${farm.yieldPercent}%、工期 ${farm.durationPercent >= 0 ? "+" : ""}${farm.durationPercent}%`);
    }
    if (ranch) {
      ranchYield += ranch.yieldPercent;
      ranchDuration += ranch.durationPercent;
      ranchSources.push(`${definition.name}：产出 ${ranch.yieldPercent >= 0 ? "+" : ""}${ranch.yieldPercent}%、工期 ${ranch.durationPercent >= 0 ? "+" : ""}${ranch.durationPercent}%`);
    }
    if (mine) {
      mineYield += mine.yieldPercent;
      mineDuration += mine.durationPercent;
      mineSources.push(`${definition.name}：产出 ${mine.yieldPercent >= 0 ? "+" : ""}${mine.yieldPercent}%、工期 ${mine.durationPercent >= 0 ? "+" : ""}${mine.durationPercent}%`);
    }
  }
  const townId = state.townId ?? state.townNetwork.activeTownId;
  for (const infrastructureId of infrastructureIdsForTown(townId)) {
    const level = state.infrastructure?.[infrastructureId] ?? 0;
    if (level < 1) continue;
    const definition = HOMESTEAD_INFRASTRUCTURE[infrastructureId];
    if (definition.marketSellPercentPerLevel > 0) {
      marketSellPercent += definition.marketSellPercentPerLevel * level;
      marketSources.push(`${definition.name}售价 +${definition.marketSellPercentPerLevel * level}%`);
    }
    const farm = definition.production.farm;
    const ranch = definition.production.ranch;
    const mine = definition.production.mine;
    if (farm) {
      farmYield += farm.yieldPercent * level;
      farmDuration += farm.durationPercent * level;
      farmSources.push(`${definition.name} LV${level}`);
    }
    if (ranch) {
      ranchYield += ranch.yieldPercent * level;
      ranchDuration += ranch.durationPercent * level;
      ranchSources.push(`${definition.name} LV${level}`);
    }
    if (mine) {
      mineYield += mine.yieldPercent * level;
      mineDuration += mine.durationPercent * level;
      mineSources.push(`${definition.name} LV${level}`);
    }
  }
  const rhythmEffect = homesteadTownRhythmEffect(
    state.townRhythm ?? createHomesteadTownRhythmState(state.dayKey),
    townId,
    state.dayKey,
  );
  if (rhythmEffect) {
    if (rhythmEffect.farm) {
      farmYield += rhythmEffect.farm.yieldPercent;
      farmDuration += rhythmEffect.farm.durationPercent;
      farmSources.push(rhythmEffect.label);
    }
    if (rhythmEffect.ranch) {
      ranchYield += rhythmEffect.ranch.yieldPercent;
      ranchDuration += rhythmEffect.ranch.durationPercent;
      ranchSources.push(rhythmEffect.label);
    }
    if (rhythmEffect.mine) {
      mineYield += rhythmEffect.mine.yieldPercent;
      mineDuration += rhythmEffect.mine.durationPercent;
      mineSources.push(rhythmEffect.label);
    }
    if (rhythmEffect.marketSellPercent) {
      marketSellPercent += rhythmEffect.marketSellPercent;
      marketSources.push(
        `${rhythmEffect.label}·出售 +${rhythmEffect.marketSellPercent}%`,
      );
    }
  }
  for (const sectorId of HOMESTEAD_TOWN_SECTOR_IDS) {
    const guidance = state.advisorGuidance?.[sectorId];
    if (!guidance || guidance.dayKey !== state.dayKey) continue;
    if (sectorId === "farm") {
      farmYield += guidance.yieldPercent;
      farmDuration += guidance.durationPercent;
      farmSources.push(guidance.label);
    } else if (sectorId === "ranch") {
      ranchYield += guidance.yieldPercent;
      ranchDuration += guidance.durationPercent;
      ranchSources.push(guidance.label);
    } else {
      mineYield += guidance.yieldPercent;
      mineDuration += guidance.durationPercent;
      mineSources.push(guidance.label);
    }
  }
  const decisionEffect = state.decisionEffect?.dayKey === state.dayKey
    ? state.decisionEffect.effect
    : null;
  if (decisionEffect?.marketBuyPercent) {
    marketBuyPercent += decisionEffect.marketBuyPercent;
    marketSources.push(`${decisionEffect.label}·买入 +${decisionEffect.marketBuyPercent}%`);
  }
  if (decisionEffect?.marketSellPercent) {
    marketSellPercent += decisionEffect.marketSellPercent;
    marketSources.push(`${decisionEffect.label}·出售 +${decisionEffect.marketSellPercent}%`);
  }
  if (decisionEffect?.farm) {
    farmYield += decisionEffect.farm.yieldPercent;
    farmDuration += decisionEffect.farm.durationPercent;
    farmSources.push(decisionEffect.label);
  }
  if (decisionEffect?.ranch) {
    ranchYield += decisionEffect.ranch.yieldPercent;
    ranchDuration += decisionEffect.ranch.durationPercent;
    ranchSources.push(decisionEffect.label);
  }
  if (decisionEffect?.mine) {
    mineYield += decisionEffect.mine.yieldPercent;
    mineDuration += decisionEffect.mine.durationPercent;
    mineSources.push(decisionEffect.label);
  }
  if (state.disaster && !state.disaster.mitigated) {
    const severity = state.disaster.severity;
    marketBuyPercent += severity * 3;
    marketSellPercent += severity * 5;
    marketSources.push(`灾害供需·买入 +${severity * 3}%、出售 +${severity * 5}%`);
    const shelterScale = Math.max(
      0.25,
      1 - state.resilience.shelter * 0.25,
    );
    const forecastScale = Math.max(
      0.4,
      1 - state.resilience.weather_station * 0.2,
    );
    const contentEvent = HOMESTEAD_WORLD_EVENTS[
      state.disaster.contentEventId ?? state.disaster.eventId
    ];
    const customHazard = contentEvent.hazard;
    if (customHazard) {
      const hazardScale = Math.min(2, 1 + (severity - 1) * 0.5);
      for (const sectorId of customHazard.affectedSectors) {
        const yieldDelta = Math.round(
          customHazard.yieldPercent * hazardScale,
        );
        const durationDelta = Math.round(
          customHazard.durationPercent * hazardScale,
        );
        if (sectorId === "farm") {
          farmYield += yieldDelta;
          farmDuration += durationDelta;
          farmSources.push(`${contentEvent.title}·${severity}级`);
        } else if (sectorId === "ranch") {
          ranchYield += yieldDelta;
          ranchDuration += durationDelta;
          ranchSources.push(`${contentEvent.title}·${severity}级`);
        } else if (sectorId === "mine") {
          mineYield += yieldDelta;
          mineDuration += durationDelta;
          mineSources.push(`${contentEvent.title}·${severity}级`);
        }
      }
    } else switch (state.disaster.eventId) {
      case "mountain_seepage": {
        const scale = Math.max(0.25, 1 - state.resilience.drainage * 0.25);
        mineYield -= Math.round(12 * severity * scale);
        mineDuration += Math.round(15 * severity * scale);
        mineSources.push(`矿山渗水·${severity}级`);
        break;
      }
      case "cold_snap":
        farmYield -= Math.round(12 * severity * shelterScale);
        farmDuration += Math.round(12 * severity * shelterScale);
        ranchYield -= Math.round(10 * severity * shelterScale);
        ranchDuration += Math.round(10 * severity * shelterScale);
        farmSources.push(`突发寒潮·${severity}级`);
        ranchSources.push(`突发寒潮·${severity}级`);
        break;
      case "heatwave": {
        const scale = Math.min(shelterScale, forecastScale);
        farmYield -= Math.round(8 * severity * scale);
        farmDuration += Math.round(8 * severity * scale);
        ranchYield -= Math.round(9 * severity * scale);
        ranchDuration += Math.round(8 * severity * scale);
        farmSources.push(`高温预警·${severity}级`);
        ranchSources.push(`高温预警·${severity}级`);
        break;
      }
      case "windstorm":
        farmYield -= Math.round(10 * severity * shelterScale);
        farmDuration += Math.round(8 * severity * shelterScale);
        ranchYield -= Math.round(5 * severity * shelterScale);
        ranchDuration += Math.round(6 * severity * shelterScale);
        mineDuration += Math.round(4 * severity * forecastScale);
        farmSources.push(`强风预警·${severity}级`);
        ranchSources.push(`强风预警·${severity}级`);
        mineSources.push(`强风运输受阻·${severity}级`);
        break;
      case "hail": {
        const scale = Math.min(shelterScale, forecastScale);
        farmYield -= Math.round(15 * severity * scale);
        farmDuration += Math.round(10 * severity * scale);
        ranchYield -= Math.round(5 * severity * shelterScale);
        farmSources.push(`冰雹预警·${severity}级`);
        ranchSources.push(`冰雹预警·${severity}级`);
        break;
      }
      case "drought":
        farmYield -= Math.round(12 * severity * forecastScale);
        farmDuration += Math.round(12 * severity * forecastScale);
        ranchYield -= Math.round(6 * severity * shelterScale);
        ranchDuration += Math.round(5 * severity * shelterScale);
        farmSources.push(`干旱预警·${severity}级`);
        ranchSources.push(`干旱预警·${severity}级`);
        break;
    }
  }
  if (state.disaster) {
    if (state.emergencyBoosts.farm) {
      farmYield += HOMESTEAD_EMERGENCY_OPERATIONS.farm.yieldBonusPercent;
      farmDuration +=
        HOMESTEAD_EMERGENCY_OPERATIONS.farm.durationBonusPercent;
      farmSources.push(HOMESTEAD_EMERGENCY_OPERATIONS.farm.name);
    }
    if (state.emergencyBoosts.ranch) {
      ranchYield += HOMESTEAD_EMERGENCY_OPERATIONS.ranch.yieldBonusPercent;
      ranchDuration +=
        HOMESTEAD_EMERGENCY_OPERATIONS.ranch.durationBonusPercent;
      ranchSources.push(HOMESTEAD_EMERGENCY_OPERATIONS.ranch.name);
    }
    if (state.emergencyBoosts.mine) {
      mineYield += HOMESTEAD_EMERGENCY_OPERATIONS.mine.yieldBonusPercent;
      mineDuration +=
        HOMESTEAD_EMERGENCY_OPERATIONS.mine.durationBonusPercent;
      mineSources.push(HOMESTEAD_EMERGENCY_OPERATIONS.mine.name);
    }
  }
  const animalTraits = new Set(
    state.specializations.ranch.discoveredTraits,
  );
  if (animalTraits.has("productive")) {
    ranchSources.push("高产特质");
  }
  if (animalTraits.has("steady")) {
    ranchDuration -= 4;
    ranchSources.push("性情稳定：工期 -4%");
  }
  if (animalTraits.has("resilient")) {
    if (ranchYield < 0) ranchYield = Math.min(0, ranchYield + 6);
    if (ranchDuration > 0) {
      ranchDuration = Math.max(0, ranchDuration - 6);
    }
    ranchSources.push("强健特质：抵消恶劣环境");
  }
  if (animalTraits.has("fertile")) {
    ranchYield += 3;
    ranchSources.push("繁育力：产出 +3%");
  }
  if (animalTraits.has("rare_coat")) {
    ranchYield += 2;
    ranchSources.push("稀有毛色：产出 +2%");
  }
  return {
    farm: {
      yieldPercent: clamp(farmYield, -60, 60),
      durationPercent: clamp(farmDuration, -30, 80),
      label: farmSources.join(" + "),
      marketBuyPercent: clamp(marketBuyPercent, -30, 50),
      marketSellPercent: clamp(marketSellPercent, -30, 50),
      marketLabel: marketSources.join(" + ") || "常态行情",
    },
    ranch: {
      yieldPercent: clamp(ranchYield, -60, 60),
      durationPercent: clamp(ranchDuration, -30, 80),
      label: ranchSources.join(" + "),
      marketBuyPercent: clamp(marketBuyPercent, -30, 50),
      marketSellPercent: clamp(marketSellPercent, -30, 50),
      marketLabel: marketSources.join(" + ") || "常态行情",
    },
    mine: {
      yieldPercent: clamp(mineYield, -60, 60),
      durationPercent: clamp(mineDuration, -30, 80),
      label: mineSources.join(" + "),
      marketBuyPercent: clamp(marketBuyPercent, -30, 50),
      marketSellPercent: clamp(marketSellPercent, -30, 50),
      marketLabel: marketSources.join(" + ") || "常态行情",
    },
  };
}

export function isHomesteadLogisticsBlocked(
  state: HomesteadGameState,
): boolean {
  if (!state.disaster || state.disaster.mitigated) return false;
  const event = HOMESTEAD_WORLD_EVENTS[
    state.disaster.contentEventId ?? state.disaster.eventId
  ];
  return event.hazard?.affectedSectors.includes("logistics") ?? false;
}

const HOMESTEAD_SEASON_DURATION_MS = 56 * 24 * 60 * 60 * 1_000;
const HOMESTEAD_SEASON_EPOCH = Date.UTC(2026, 0, 1);
const HOMESTEAD_MAX_FACILITY_LEVEL = 3;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function createSeason(now: number): HomesteadSeasonState {
  const index = Math.max(
    0,
    Math.floor((now - HOMESTEAD_SEASON_EPOCH) / HOMESTEAD_SEASON_DURATION_MS),
  );
  const startsAt = HOMESTEAD_SEASON_EPOCH +
    index * HOMESTEAD_SEASON_DURATION_MS;
  return {
    id: `S${index + 1}`,
    startsAt,
    endsAt: startsAt + HOMESTEAD_SEASON_DURATION_MS,
    score: 0,
    claimedMilestones: [],
    counters: {
      jobs: 0,
      orders: 0,
      specializations: 0,
      community: 0,
    },
  };
}

function createPersonalSeason(now: number): HomesteadSeasonState {
  return {
    id: "P1",
    startsAt: now,
    endsAt: now + HOMESTEAD_SEASON_DURATION_MS,
    score: 0,
    claimedMilestones: [],
    counters: {
      jobs: 0,
      orders: 0,
      specializations: 0,
      community: 0,
    },
  };
}

function advancePersonalSeason(
  season: HomesteadSeasonState,
  now: number,
): HomesteadSeasonState {
  if (now < season.endsAt) return season;
  const elapsedSeasons =
    Math.floor((now - season.endsAt) / HOMESTEAD_SEASON_DURATION_MS) + 1;
  const currentIndex = Number.parseInt(season.id.slice(1), 10) || 1;
  const startsAt =
    season.endsAt + (elapsedSeasons - 1) * HOMESTEAD_SEASON_DURATION_MS;
  return {
    ...createPersonalSeason(startsAt),
    id: `P${currentIndex + elapsedSeasons}`,
  };
}

function createNpcs(townId: HomesteadTownId): HomesteadNpcMemory[] {
  return npcIdsForTown(townId).map((npcId) => ({
    npcId,
    affinity: 0,
    trust: 0,
    lastConversationDayKey: null,
    lastTopicId: null,
    lastDialogue: `${HOMESTEAD_NPCS[npcId].name}正在等待今天的经营记录。`,
    facts: [],
  }));
}

function createAdvisorGuidance(): HomesteadAdvisorGuidanceState {
  return { farm: null, ranch: null, mine: null };
}

function localAdvisorId(
  townId: HomesteadTownId,
  sectorId: HomesteadSectorId,
): HomesteadNpcId {
  const index = sectorId === "farm" ? 0 : sectorId === "ranch" ? 1 : 2;
  return npcIdsForTown(townId)[index]!;
}

function createHonor(): HomesteadHonorState {
  return { score: 0, claimedMilestones: [] };
}

function createAdvice(
  key: string,
  now: number,
  townId: HomesteadTownId,
): HomesteadAdviceState {
  return {
    dayKey: key,
    source: "rules",
    headline: "让三条产业链同时向前走",
    narrative: "庄园刚刚建立，三位顾问正在整理农田、牧舍和矿层资料。",
    recommendation: "优先完成今日事件，再从轮作、牧群和勘探中各选择一项长期行动。",
    npcId: localAdvisorId(townId, "farm"),
    npcLine: "先建立稳定循环，产量自然会跟上。",
    generatedAt: now,
    steps: [
      {
        id: "review-event",
        title: "处理今日事件",
        reason: "先确认事件选项，避免经营安排与今日环境冲突。",
        panel: "today",
        targetId: "homestead-world-event",
      },
      {
        id: "stabilize-processing",
        title: "检查加工队列",
        reason: "让已建成设施保持运转，减少原料闲置。",
        panel: "operations",
        targetId: "homestead-processing",
      },
      {
        id: "prepare-growth",
        title: "规划下一项研究",
        reason: "根据当前瓶颈选择一个长期能力方向。",
        panel: "growth",
        targetId: "homestead-research",
      },
    ],
  };
}

function createAiProfile(): HomesteadAiProfile {
  return {
    enabled: true,
    goal: "balanced",
    risk: "balanced",
    focus: "processing",
  };
}

function defaultAdviceSteps(game: HomesteadGameState): HomesteadAdviceStep[] {
  const activeTownId = game.townId ?? game.townNetwork.activeTownId;
  const first: HomesteadAdviceStep = game.disaster
    ? {
        id: "review-disaster",
        title: "检查灾害影响",
        reason: "先确认受影响产业和物流状态，再投入今日资源。",
        panel: "today",
        targetId: "homestead-weather",
      }
    : {
        id: "review-event",
        title: "处理今日事件",
        reason: "先比较事件选项，确定今天的资源优先级。",
        panel: "today",
        targetId: "homestead-world-event",
      };
  const second: HomesteadAdviceStep = activeTownId === "frostpeak"
    ? {
        id: "frostpeak-local-chain",
        title: "推进霜岭本地协作",
        reason: "检查本地产业产出、民生问题与热力站修复材料。",
        panel: "operations",
        targetId: "homestead-town-local",
      }
    : {
        id: "stabilize-processing",
        title: "检查加工队列",
        reason: "优先收取完成任务，并让空闲设施投入下一批加工。",
        panel: "operations",
        targetId: "homestead-processing",
      };
  return [
    first,
    second,
    {
      id: "prepare-growth",
      title: "规划下一项研究",
      reason: "围绕当前三业短板选择一个长期能力方向。",
      panel: "growth",
      targetId: "homestead-research",
    },
  ];
}

function createSpecializations(): HomesteadSpecializations {
  return {
    farm: {
      soilHealth: 60,
      lastCropFamily: null,
      rotationStreak: 0,
      fertilizerApplications: 0,
      lastManagedDayKey: null,
      yieldBonusPercent: 0,
    },
    ranch: {
      herdHealth: 65,
      lastFeedProgram: null,
      discoveredTraits: [],
      lastManagedDayKey: null,
      productBonusPercent: 0,
    },
    mine: {
      protectionLevel: 0,
      surveyProgress: 0,
      discoveredLayers: [],
      lastManagedDayKey: null,
      oreBonusPercent: 0,
    },
  };
}

function hasResearch(
  game: HomesteadGameState,
  nodeId: HomesteadResearchNodeId,
): boolean {
  const townId = game.townId ?? game.townNetwork.activeTownId;
  const greenvaleCapabilities = new Set<HomesteadResearchNodeId>(
    researchIdsForTown("greenvale"),
  );
  const effectiveNodeId = greenvaleCapabilities.has(nodeId)
    ? researchIdForCapability(
        townId,
        nodeId as HomesteadResearchCapability,
      )
    : nodeId;
  return game.research.unlocked.includes(effectiveNodeId);
}

export interface HomesteadResearchRequirementProgress {
  readonly label: string;
  readonly current: number;
  readonly required: number;
  readonly satisfied: boolean;
}

/** Returns server-authoritative operating milestones for a research node. */
export function getHomesteadResearchRequirementProgress(
  game: HomesteadGameState,
  definition: HomesteadResearchDefinition,
): readonly HomesteadResearchRequirementProgress[] {
  return definition.requirements.map((requirement) => {
    let current = 0;
    switch (requirement.kind) {
      case "statistic":
        current = game.statistics[requirement.statistic];
        break;
      case "mine_protection":
        current = game.specializations.mine.protectionLevel;
        break;
      case "infrastructure":
        current = game.infrastructure[requirement.infrastructureId] ?? 0;
        break;
      case "honor":
        current = game.honor?.score ?? 0;
        break;
      case "town_rhythm":
        current = game.townRhythm?.completedCycles ?? 0;
        break;
    }
    return {
      label: requirement.label,
      current,
      required: requirement.required,
      satisfied: current >= requirement.required,
    };
  });
}

function unlockCollection(
  game: HomesteadGameState,
  id: string,
  now: number,
): boolean {
  if (game.collections.some((entry) => entry.id === id)) return false;
  game.collections.push({ id, unlockedAt: now });
  return true;
}

function recordCollectionProgress(
  game: HomesteadGameState,
  baseId: string,
  now: number,
  amount = 1,
): void {
  const next = Math.max(0, (game.collectionProgress[baseId] ?? 0) + amount);
  game.collectionProgress[baseId] = next;
  if (next >= 1) unlockCollection(game, baseId, now);
  if (next >= 5) unlockCollection(game, `${baseId}:5`, now);
  if (next >= 20) unlockCollection(game, `${baseId}:20`, now);
}

function collectionDefinitionsForGame(
  game: HomesteadGameState,
): HomesteadCollectionDefinition[] {
  const townId = game.townId ?? game.townNetwork.activeTownId;
  return longTermCollectionDefinitions({
    townId,
    facilityIds: HOMESTEAD_FACILITY_IDS,
    facilityNames: Object.fromEntries(
      HOMESTEAD_FACILITY_IDS.map((id) => [id, HOMESTEAD_FACILITIES[id].name]),
    ),
    infrastructureIds: infrastructureIdsForTown(townId),
    infrastructureNames: Object.fromEntries(
      infrastructureIdsForTown(townId).map((id) => [
        id,
        HOMESTEAD_INFRASTRUCTURE[id].name,
      ]),
    ),
    recipeIds: homesteadRecipeIdsForTown(townId),
    recipeNames: Object.fromEntries(
      homesteadRecipeIdsForTown(townId).map((id) => [
        id,
        HOMESTEAD_RECIPES[id].name,
      ]),
    ),
  });
}

function synchronizeHonorCollections(
  game: HomesteadGameState,
  now: number,
): void {
  for (const facility of game.facilities) {
    if (facility.level >= 1) unlockCollection(game, `facility:${facility.id}`, now);
    if (facility.level >= 2) unlockCollection(game, `facility:${facility.id}:2`, now);
    if (facility.level >= 3) unlockCollection(game, `facility:${facility.id}:3`, now);
  }
  for (const infrastructureId of infrastructureIdsForTown(
    game.townId ?? game.townNetwork.activeTownId,
  )) {
    const level = game.infrastructure[infrastructureId];
    for (let current = 1; current <= level; current += 1) {
      unlockCollection(
        game,
        `infrastructure:${infrastructureId}:${current}`,
        now,
      );
    }
  }
  const operationCounters = {
    jobs: game.statistics.jobsCollected,
    orders: game.statistics.ordersCompleted,
    events: game.statistics.eventsResolved,
    farm: game.statistics.fieldPlansCompleted,
    ranch: game.statistics.herdProgramsCompleted,
    mine: game.statistics.surveysCompleted,
  } as const;
  for (const [kind, count] of Object.entries(operationCounters)) {
    for (const threshold of [1, 5, 15] as const) {
      if (count >= threshold) {
        unlockCollection(game, `operations:${kind}:${threshold}`, now);
      }
    }
  }
  for (const threshold of [1, 5, 20] as const) {
    if (game.statistics.cargoShipmentsCollected >= threshold) {
      unlockCollection(game, `logistics:cargo:${threshold}`, now);
    }
  }
  const definitions = new Map(
    collectionDefinitionsForGame(game).map((definition) => [
      definition.id,
      definition,
    ]),
  );
  const collectionScore = game.collections.reduce(
    (score, entry) => score + (definitions.get(entry.id)?.honorPoints ?? 0),
    0,
  );
  // Collection-derived score is authoritative for new progress. A migrated
  // legacy season score is a one-time floor so loading a save cannot erase
  // rewards earned under the previous system.
  game.honor.score = Math.max(game.honor.score, collectionScore);
}

function addSeasonScore(
  game: HomesteadGameState,
  amount: number,
  counter: keyof HomesteadSeasonState["counters"],
): void {
  const masteryBonus = hasResearch(game, "seasonal_mastery") ? 1 : 0;
  game.season.score += amount + masteryBonus;
  game.season.counters[counter] += 1;
}

function addNpcFact(
  npc: HomesteadNpcMemory,
  key: string,
  value: string,
  now: number,
  capacity: number,
): void {
  const existing = npc.facts.find((fact) => fact.key === key);
  if (existing) {
    existing.value = value;
    existing.at = now;
  } else {
    npc.facts.unshift({ key, value, at: now });
    if (npc.facts.length > capacity) npc.facts.length = capacity;
  }
}

function ruleAdvice(
  game: HomesteadGameState,
  economy: HomesteadLinkedEconomy | null,
  now: number,
): HomesteadAdviceState {
  const activeTownId = game.townId ?? game.townNetwork.activeTownId;
  const frostpeak = activeTownId === "frostpeak";
  const farm = game.specializations.farm;
  const ranch = game.specializations.ranch;
  const mine = game.specializations.mine;
  if (farm.soilHealth < 45) {
    return {
      dayKey: game.dayKey,
      source: "rules",
      headline: "土壤健康正在成为瓶颈",
      narrative: "连续经营让部分田块的恢复速度落后于牧场和矿山。",
      recommendation: frostpeak
        ? "切换霜岭作物科属，并在解锁冻土保育学后投入一份温床营养基。"
        : "切换作物科属，并在解锁土壤科学后投入一份土壤改良剂。",
      npcId: localAdvisorId(activeTownId, "farm"),
      npcLine: "土地不会突然失去力量，它会提前给出信号。",
      generatedAt: now,
    };
  }
  if (ranch.herdHealth < 55) {
    return {
      dayKey: game.dayKey,
      source: "rules",
      headline: "先恢复牧群健康",
      narrative: "牧群健康低于稳定生产区间，继续追求高产会放大波动。",
      recommendation: frostpeak
        ? "完成牦牛营养学研究，使用霜麦粉或高原营养饲料。"
        : "完成动物营养研究，使用均衡或矿物强化饲料。",
      npcId: localAdvisorId(activeTownId, "ranch"),
      npcLine: "健康是产量的上限，也是稀有特质能够保留下来的前提。",
      generatedAt: now,
    };
  }
  if (mine.protectionLevel < 1 && mine.surveyProgress >= 2) {
    return {
      dayKey: game.dayKey,
      source: "rules",
      headline: "勘探进度已经超过防护能力",
      narrative: "浅层资料已经足够，下一步需要先建设可靠的防护体系。",
      recommendation: frostpeak
        ? "准备耐寒合金锭和保温矿务套装，将矿山防护提升到一级。"
        : "准备铁锭和矿工防护套装，将矿山防护提升到一级。",
      npcId: localAdvisorId(activeTownId, "mine"),
      npcLine: "深度从来不是荣誉，安全返回才是。",
      generatedAt: now,
    };
  }
  const stock = economy
    ? Object.values(economy.farmProduce).reduce((sum, value) => sum + value, 0) +
      Object.values(economy.ranchProducts).reduce((sum, value) => sum + value, 0) +
      Object.values(economy.mineOres).reduce((sum, value) => sum + value, 0)
    : 0;
  return {
    dayKey: game.dayKey,
    source: "rules",
    headline: stock < 12 ? "补齐基础库存，再安排长链加工" : "库存稳定，适合推进研究和联合订单",
    narrative: stock < 12
      ? "三业库存仍处于紧平衡，任何单一原料短缺都会让加工队列停摆。"
      : "当前三业储备能够支撑多步加工，庄园进入结构升级窗口。",
    recommendation: stock < 12
      ? frostpeak
        ? "保持三个板块都在生产，并优先加工霜麦粉、耐寒合金和温床营养基。"
        : "保持三个板块都在生产，并优先加工粗饲料、铁锭和土壤改良剂。"
      : "选择一个研究分支推进，同时为下一档永久荣誉保留订单资源。",
    npcId: localAdvisorId(activeTownId, "farm"),
    npcLine: "稳定不是停在原地，而是每条链都留有余量。",
    generatedAt: now,
  };
}

function ensureLongTermState(game: HomesteadGameState, now: number): boolean {
  let changed = false;
  const raw = game as HomesteadGameState & Record<string, unknown>;
  const numericLogIds = game.logs.flatMap(({ id }) => {
    const match = /^homestead:(\d+)$/.exec(id);
    const parsed = match ? Number(match[1]) : Number.NaN;
    return Number.isSafeInteger(parsed) && parsed > 0 ? [parsed] : [];
  });
  let nextLogId = Number.isSafeInteger(raw.nextLogId) && Number(raw.nextLogId) > 0
    ? Number(raw.nextLogId)
    : 1;
  nextLogId = Math.max(nextLogId, ...numericLogIds.map((id) => id + 1));
  const seenLogIds = new Set<string>();
  game.logs = game.logs.map((entry) => {
    if (entry.id.length > 0 && !seenLogIds.has(entry.id)) {
      seenLogIds.add(entry.id);
      return entry;
    }
    let id = `homestead:${nextLogId++}`;
    while (seenLogIds.has(id)) id = `homestead:${nextLogId++}`;
    seenLogIds.add(id);
    changed = true;
    return { ...entry, id };
  });
  if (game.nextLogId !== nextLogId) {
    game.nextLogId = nextLogId;
    changed = true;
  }
  const localTownId =
    game.townId ??
    game.townNetwork?.activeTownId ??
    "greenvale";
  if (game.townId !== localTownId) {
    (game as HomesteadGameState & { townId: HomesteadTownId }).townId =
      localTownId;
    changed = true;
  }
  for (const goodId of HOMESTEAD_GOOD_IDS) {
    if (!Number.isSafeInteger(game.goods?.[goodId])) {
      game.goods[goodId] = 0;
      changed = true;
    }
  }
  if (!raw.cargoInventory || typeof raw.cargoInventory !== "object") {
    game.cargoInventory = cargoCounts();
    changed = true;
  } else {
    for (const cargoId of ESTATE_CARGO_IDS) {
      if (!Number.isSafeInteger(game.cargoInventory[cargoId])) {
        game.cargoInventory[cargoId] = 0;
        changed = true;
      }
    }
  }
  if (!raw.research || typeof raw.research !== "object") {
    game.research = { unlocked: [] };
    changed = true;
  }
  const localResearchIds = new Set(researchIdsForTown(localTownId));
  const normalizedResearch = [...new Set(
    game.research.unlocked.map((nodeId) => {
      if (localResearchIds.has(nodeId)) return nodeId;
      if (
        localTownId === "frostpeak" &&
        researchIdsForTown("greenvale").includes(nodeId)
      ) {
        return researchIdForCapability(
          localTownId,
          nodeId as HomesteadResearchCapability,
        );
      }
      return null;
    }).filter((nodeId): nodeId is HomesteadResearchNodeId => nodeId !== null),
  )];
  if (
    normalizedResearch.length !== game.research.unlocked.length ||
    normalizedResearch.some(
      (nodeId, index) => nodeId !== game.research.unlocked[index],
    )
  ) {
    game.research.unlocked = normalizedResearch;
    changed = true;
  }
  if (!raw.specializations || typeof raw.specializations !== "object") {
    game.specializations = createSpecializations();
    changed = true;
  }
  if (!Array.isArray(raw.npcs)) {
    game.npcs = createNpcs(localTownId);
    changed = true;
  }
  const localNpcIds = npcIdsForTown(localTownId);
  if (
    game.npcs.length !== localNpcIds.length ||
    game.npcs.some((npc, index) => npc.npcId !== localNpcIds[index])
  ) {
    const previous = new Map(game.npcs.map((npc) => [npc.npcId, npc]));
    game.npcs = createNpcs(localTownId).map((npc) =>
      previous.get(npc.npcId) ?? npc
    );
    changed = true;
  }
  if (!raw.advisorGuidance || typeof raw.advisorGuidance !== "object") {
    game.advisorGuidance = createAdvisorGuidance();
    changed = true;
  }
  if (!raw.infrastructure || typeof raw.infrastructure !== "object") {
    game.infrastructure = createHomesteadInfrastructureState();
    changed = true;
  } else {
    for (const infrastructureId of HOMESTEAD_INFRASTRUCTURE_IDS) {
      const level = game.infrastructure[infrastructureId];
      if (!Number.isSafeInteger(level) || level < 0 || level > 3) {
        game.infrastructure[infrastructureId] = 0;
        changed = true;
      }
    }
  }
  if (!raw.townRhythm || typeof raw.townRhythm !== "object") {
    game.townRhythm = createHomesteadTownRhythmState(game.dayKey);
    changed = true;
  } else {
    const rhythm = raw.townRhythm as unknown as Record<string, unknown>;
    const validProgress = Number.isSafeInteger(rhythm.progress) &&
      Number(rhythm.progress) >= 0 && Number(rhythm.progress) <= 3;
    const validCycles = Number.isSafeInteger(rhythm.completedCycles) &&
      Number(rhythm.completedCycles) >= 0;
    const validDayKey = typeof rhythm.dayKey === "string";
    if (!validProgress || !validCycles || !validDayKey) {
      game.townRhythm = createHomesteadTownRhythmState(game.dayKey);
      changed = true;
    } else {
      const refreshed = refreshHomesteadTownRhythmState(
        game.townRhythm,
        game.dayKey,
      );
      if (
        refreshed.dayKey !== game.townRhythm.dayKey ||
        refreshed.progress !== game.townRhythm.progress
      ) {
        game.townRhythm = refreshed;
        changed = true;
      }
    }
  }
  if (!raw.collectionProgress || typeof raw.collectionProgress !== "object") {
    game.collectionProgress = {};
    changed = true;
  }
  if (!raw.honor || typeof raw.honor !== "object") {
    const legacyClaims = Array.isArray(game.season?.claimedMilestones)
      ? game.season.claimedMilestones.map((id) => ({
          bronze: "newcomer",
          silver: "steward",
          gold: "specialist",
        }[String(id)] ?? id)).filter((id) =>
          HOMESTEAD_HONOR_MILESTONE_IDS.includes(
            id as HomesteadHonorMilestoneId,
          )
        ) as HomesteadHonorMilestoneId[]
      : [];
    // The old season score was already-earned player progress. Preserve it
    // when moving to permanent honor so an unclaimed legacy reward cannot
    // become unreachable merely because the save predates collections.
    const legacyScore = Number.isSafeInteger(game.season?.score)
      ? Math.max(0, game.season.score)
      : 0;
    game.honor = { score: legacyScore, claimedMilestones: legacyClaims };
    changed = true;
  }
  if (!raw.season || typeof raw.season !== "object") {
    game.season = createPersonalSeason(now);
    changed = true;
  }
  if (!Array.isArray(raw.collections)) {
    game.collections = [];
    changed = true;
  }
  if (
    !raw.advice ||
    typeof raw.advice !== "object" ||
    !npcIdsForTown(localTownId).includes(game.advice.npcId)
  ) {
    game.advice = createAdvice(game.dayKey, now, localTownId);
    changed = true;
  }
  if (
    !raw.aiProfile ||
    typeof raw.aiProfile !== "object" ||
    typeof raw.aiProfile.enabled !== "boolean" ||
    !["balanced", "wealth", "reputation", "research"].includes(
      String(raw.aiProfile.goal),
    ) ||
    !["safe", "balanced", "bold"].includes(
      String(raw.aiProfile.risk),
    ) ||
    !["farm", "ranch", "mine", "processing"].includes(
      String(raw.aiProfile.focus),
    )
  ) {
    game.aiProfile = createAiProfile();
    changed = true;
  }
  if (!raw.townNetwork || typeof raw.townNetwork !== "object") {
    game.townNetwork = createTownNetwork();
    changed = true;
  }
  if (!raw.valueRouteDayKeys || typeof raw.valueRouteDayKeys !== "object") {
    game.valueRouteDayKeys = createValueRouteDayKeys();
    changed = true;
  } else {
    for (const routeId of HOMESTEAD_VALUE_ROUTE_IDS) {
      const completedDayKey = game.valueRouteDayKeys[routeId];
      if (
        completedDayKey !== null &&
        typeof completedDayKey !== "string"
      ) {
        game.valueRouteDayKeys[routeId] = null;
        changed = true;
      }
    }
  }
  if (!raw.weather || typeof raw.weather !== "object") {
    game.weather = weatherForDay(game.seed, game.dayKey);
    changed = true;
  }
  if (raw.decisionEffect === undefined) {
    game.decisionEffect = null;
    changed = true;
  }
  if (
    !Array.isArray(game.orders) ||
    game.orders.some((order) => {
      const template = HOMESTEAD_ORDER_TEMPLATES[order.templateId];
      return !template || contentTownId(template) !== localTownId;
    })
  ) {
    game.orders = ordersForDay(game.seed, game.dayKey, localTownId);
    changed = true;
  }
  const currentEventDefinition =
    HOMESTEAD_WORLD_EVENTS[game.worldEvent.eventId];
  if (
    !currentEventDefinition ||
    contentTownId(currentEventDefinition) !== localTownId
  ) {
    game.worldEvent = game.disaster
      ? eventForDisaster(game.disaster, game.dayKey)
      : eventForDay(game.seed, game.dayKey, localTownId);
    changed = true;
  }
  if (!("disaster" in raw)) {
    game.disaster = null;
    changed = true;
  }
  if (game.disaster) {
    if (
      !Number.isSafeInteger(game.disaster.reputationPenaltyPaid) ||
      (game.disaster.reputationPenaltyPaid ?? -1) < 0 ||
      (game.disaster.reputationPenaltyPaid ?? 13) > 12
    ) {
      game.disaster.reputationPenaltyPaid = 0;
      changed = true;
    }
    if (
      game.disaster.temporaryOptionId !== null &&
      (
        typeof game.disaster.temporaryOptionId !== "string" ||
        game.disaster.temporaryOptionId.length === 0
      )
    ) {
      game.disaster.temporaryOptionId = null;
      changed = true;
    }
  }
  if (!raw.resilience || typeof raw.resilience !== "object") {
    game.resilience = createResilience();
    changed = true;
  } else {
    for (const id of HOMESTEAD_RESILIENCE_IDS) {
      if (
        !Number.isSafeInteger(game.resilience[id]) ||
        game.resilience[id] < 0 ||
        game.resilience[id] > 3
      ) {
        game.resilience[id] = 0;
        changed = true;
      }
    }
  }
  if (!raw.emergencyBoosts || typeof raw.emergencyBoosts !== "object") {
    game.emergencyBoosts = createEmergencyBoosts();
    changed = true;
  }
  if (!Array.isArray(raw.handledWeatherAlertIds)) {
    game.handledWeatherAlertIds = [];
    changed = true;
  } else {
    const normalizedAlertIds = [...new Set(
      raw.handledWeatherAlertIds
        .filter((alertId): alertId is string =>
          typeof alertId === "string" && alertId.length > 0
        )
        .slice(-64),
    )];
    if (
      normalizedAlertIds.length !== raw.handledWeatherAlertIds.length ||
      normalizedAlertIds.some(
        (alertId, index) => alertId !== raw.handledWeatherAlertIds[index],
      )
    ) {
      game.handledWeatherAlertIds = normalizedAlertIds;
      changed = true;
    }
  }
  if (
    !Number.isSafeInteger(game.worldEvent.durationDays) ||
    game.worldEvent.durationDays < 1
  ) {
    game.worldEvent.durationDays = 1;
    changed = true;
  }
  if (
    !Number.isSafeInteger(game.worldEvent.unresolvedDays) ||
    game.worldEvent.unresolvedDays < 0
  ) {
    game.worldEvent.unresolvedDays = 0;
    changed = true;
  }
  if (
    !Number.isSafeInteger(game.worldEvent.severity) ||
    game.worldEvent.severity < 0
  ) {
    game.worldEvent.severity =
      HOMESTEAD_WORLD_EVENTS[game.worldEvent.eventId].tone === "risk" ? 1 : 0;
    changed = true;
  }
  if (!game.worldEvent.startedDayKey) {
    game.worldEvent.startedDayKey = game.worldEvent.dayKey;
    changed = true;
  }
  for (const facility of game.facilities) {
    if (!Number.isSafeInteger(facility.level) || facility.level < 0) {
      facility.level = facility.built ? 1 : 0;
      changed = true;
    }
    if (
      facility.job &&
      (!Number.isSafeInteger(facility.job.outputQuantity) ||
        facility.job.outputQuantity < 1)
    ) {
      const recipe = HOMESTEAD_RECIPES[facility.job.recipeId];
      facility.job = {
        ...facility.job,
        outputQuantity: recipe.output.quantity,
      };
      changed = true;
    }
    if (
      facility.job &&
      contentTownId(HOMESTEAD_RECIPES[facility.job.recipeId]) !== localTownId
    ) {
      const replacementId = homesteadRecipeIdsForTown(localTownId).find(
        (recipeId) =>
          HOMESTEAD_RECIPES[recipeId].facilityId === facility.id,
      );
      facility.job = replacementId
        ? {
            ...facility.job,
            recipeId: replacementId,
            outputQuantity:
              HOMESTEAD_RECIPES[replacementId].output.quantity,
          }
        : null;
      changed = true;
    }
    if (
      facility.built &&
      unlockCollection(game, `facility:${facility.id}`, game.createdAt)
    ) {
      changed = true;
    }
  }
  const statisticDefaults: Pick<
    HomesteadStatistics,
    | "facilityUpgrades"
    | "researchUnlocked"
    | "fieldPlansCompleted"
    | "herdProgramsCompleted"
    | "surveysCompleted"
    | "npcConversations"
    | "cargoShipmentsCollected"
    | "valueRoutesCompleted"
    | "honorRewardsClaimed"
    | "seasonRewardsClaimed"
    | "llmCalls"
    | "llmFallbacks"
    | "llmPromptTokens"
    | "llmCompletionTokens"
    | "generatedEventsApplied"
  > = {
    facilityUpgrades: 0,
    researchUnlocked: 0,
    fieldPlansCompleted: 0,
    herdProgramsCompleted: 0,
    surveysCompleted: 0,
    npcConversations: 0,
    cargoShipmentsCollected: 0,
    valueRoutesCompleted: 0,
    honorRewardsClaimed: 0,
    seasonRewardsClaimed: 0,
    llmCalls: 0,
    llmFallbacks: 0,
    llmPromptTokens: 0,
    llmCompletionTokens: 0,
    generatedEventsApplied: 0,
  };
  for (const [key, fallback] of Object.entries(statisticDefaults)) {
    const statistics = game.statistics as unknown as Record<string, unknown>;
    if (!isNonNegativeInteger(statistics[key])) {
      statistics[key] = fallback;
      changed = true;
    }
  }
  const isPersonalSeason = /^P\d+$/.test(game.season.id);
  const remainingGlobalSeasonTime = game.season.endsAt - now;
  const shouldMigrateLateJoiner =
    !isPersonalSeason &&
    game.season.score === 0 &&
    game.season.claimedMilestones.length === 0 &&
    remainingGlobalSeasonTime > 0 &&
    remainingGlobalSeasonTime < HOMESTEAD_SEASON_DURATION_MS / 2;
  const currentSeason = isPersonalSeason
    ? advancePersonalSeason(game.season, now)
    : shouldMigrateLateJoiner
      ? createPersonalSeason(now)
      : createSeason(now);
  if (
    game.season.id !== currentSeason.id ||
    game.season.startsAt !== currentSeason.startsAt
  ) {
    game.season = currentSeason;
    game.advice = createAdvice(game.dayKey, now, localTownId);
    changed = true;
  }
  return changed;
}

function selectDailyIds<T extends string>(
  ids: readonly T[],
  count: number,
  seed: string,
): T[] {
  return [...ids]
    .sort((left, right) =>
      hashText(`${seed}:${left}`) - hashText(`${seed}:${right}`)
    )
    .slice(0, Math.min(count, ids.length));
}

function contentTownId(
  definition: { readonly townId?: HomesteadTownId },
): HomesteadTownId {
  return definition.townId ?? "greenvale";
}

type GreenvaleHomesteadGoodId =
  (typeof GREENVALE_HOMESTEAD_GOOD_IDS)[number];

function localGoodId(
  townId: HomesteadTownId,
  greenvaleId: GreenvaleHomesteadGoodId,
): HomesteadGoodId {
  return townId === "frostpeak"
    ? FROSTPEAK_HOMESTEAD_SUBSTITUTIONS[greenvaleId]
    : greenvaleId;
}

function localizeResource(
  townId: HomesteadTownId,
  resource: HomesteadResource,
): HomesteadResource {
  if (
    townId === "frostpeak" &&
    resource.source === "goods" &&
    GREENVALE_HOMESTEAD_GOOD_IDS.includes(
      resource.itemId as GreenvaleHomesteadGoodId,
    )
  ) {
    return {
      ...resource,
      itemId: localGoodId(
        townId,
        resource.itemId as GreenvaleHomesteadGoodId,
      ),
    };
  }
  return resource;
}

const FROSTPEAK_CROP_FAMILY_REWARDS: Readonly<
  Record<HomesteadCropFamily, FarmingCropId>
> = {
  grain: "frost_barley",
  root: "snow_potato",
  orchard: "cloudberry",
  fiber: "silver_flax",
};

const FROSTPEAK_MINE_LAYER_REWARDS: Readonly<
  Record<HomesteadMineLayerId, MineDepositId>
> = {
  shallow: "lignite",
  middle: "magnetite",
  deep: "frost_silver",
  ancient: "frost_crystal",
};

export function homesteadGoodIdsForTown(
  townId: HomesteadTownId,
): readonly HomesteadGoodId[] {
  return townId === "frostpeak"
    ? FROSTPEAK_HOMESTEAD_GOOD_IDS
    : GREENVALE_HOMESTEAD_GOOD_IDS;
}

export function homesteadRecipeIdsForTown(
  townId: HomesteadTownId,
): readonly HomesteadRecipeId[] {
  return HOMESTEAD_RECIPE_IDS.filter(
    (id) => contentTownId(HOMESTEAD_RECIPES[id]) === townId,
  );
}

export function homesteadOrderTemplateIdsForTown(
  townId: HomesteadTownId,
): readonly HomesteadOrderTemplateId[] {
  return HOMESTEAD_ORDER_TEMPLATE_IDS.filter(
    (id) => contentTownId(HOMESTEAD_ORDER_TEMPLATES[id]) === townId,
  );
}

export function homesteadValueRouteIdsForTown(
  townId: HomesteadTownId,
): readonly HomesteadValueRouteId[] {
  return HOMESTEAD_VALUE_ROUTE_IDS.filter(
    (id) => contentTownId(HOMESTEAD_VALUE_ROUTES[id]) === townId,
  );
}

export function homesteadWorldEventIdsForTown(
  townId: HomesteadTownId,
): readonly HomesteadWorldEventId[] {
  return HOMESTEAD_WORLD_EVENT_IDS.filter(
    (id) => contentTownId(HOMESTEAD_WORLD_EVENTS[id]) === townId,
  );
}

function ordersForDay(
  seed: string,
  key: string,
  townId: HomesteadTownId,
): HomesteadOrderState[] {
  return selectDailyIds(
    homesteadOrderTemplateIdsForTown(townId),
    HOMESTEAD_DAILY_ORDER_COUNT,
    `${seed}:${townId}:orders:${key}`,
  ).map((templateId, index) => ({
    id: `${key}:${index}:${templateId}`,
    templateId,
    dayKey: key,
    completed: false,
  }));
}

function eventForDay(
  seed: string,
  key: string,
  townId: HomesteadTownId,
): HomesteadWorldEventState {
  const eventIds = townId === "frostpeak"
    ? (["frost_clear_shift", "frost_aurora_market",
      "frost_geothermal_vent", "frost_ptarmigan_migration"] as const)
    : (["steady_weather", "harvest_festival"] as const);
  const eventId = eventIds[
    hashText(`${seed}:${townId}:event:${key}`) % eventIds.length
  ]!;
  const definition = HOMESTEAD_WORLD_EVENTS[eventId];
  return {
    eventId,
    dayKey: key,
    selectedOptionId: null,
    narrative: definition.summary,
    source: "rules",
    startedDayKey: key,
    durationDays: 1,
    unresolvedDays: 0,
    severity: 0,
  };
}

function eventForDisaster(
  disaster: HomesteadDisasterState,
  key: string,
): HomesteadWorldEventState {
  const eventId = disaster.contentEventId ?? disaster.eventId;
  const definition = HOMESTEAD_WORLD_EVENTS[eventId];
  return {
    eventId,
    dayKey: key,
    selectedOptionId: disaster.mitigated ? disaster.resolution : null,
    narrative: disaster.mitigated
      ? `${definition.summary} 当前已完成处置，仍需等待环境恢复。`
      : `${definition.summary} 已持续 ${disaster.unresolvedDays + 1} 天，当前灾情 ${disaster.severity} 级。`,
    source: "rules",
    startedDayKey: disaster.startedDayKey,
    durationDays: disaster.remainingDays,
    unresolvedDays: disaster.unresolvedDays,
    severity: disaster.severity,
  };
}

function addLog(
  game: HomesteadGameState,
  type: HomesteadLogEntry["type"],
  message: string,
  now: number,
): void {
  while (game.logs.some(({ id }) => id === `homestead:${game.nextLogId}`)) {
    game.nextLogId += 1;
  }
  game.logs.unshift({
    id: `homestead:${game.nextLogId}`,
    at: now,
    type,
    message,
  });
  game.nextLogId += 1;
  if (game.logs.length > HOMESTEAD_MAX_LOGS) {
    game.logs.length = HOMESTEAD_MAX_LOGS;
  }
}

function finishMutation(game: HomesteadGameState, now: number): void {
  synchronizeHonorCollections(game, now);
  game.revision += 1;
  game.updatedAt = Math.max(game.updatedAt, now);
}

function advanceTownRhythmForSector(
  game: HomesteadGameState,
  sectorId: HomesteadSectorId,
  now: number,
): void {
  const townId = game.townId ?? game.townNetwork.activeTownId;
  const definition = townRhythmDefinition(townId);
  const previousProgress = game.townRhythm.progress;
  const result = advanceHomesteadTownRhythm(
    game.townRhythm,
    townId,
    sectorId,
    game.dayKey,
  );
  game.townRhythm = result.state;
  if (result.advanced) {
    const step = definition.steps[(result.state.progress - 1) as 0 | 1 | 2];
    const nextStep = result.completed
      ? null
      : definition.steps[result.state.progress as 1 | 2];
    addLog(
      game,
      "community",
      result.completed
        ? `${definition.name}完成：${step.name}收束了今日三业节奏，完整循环累计 ${result.state.completedCycles} 次。`
        : `${definition.name}推进到“${step.name}”，下一步是“${nextStep!.name}”。`,
      now,
    );
    return;
  }
  if (previousProgress < 3) {
    const expected = definition.steps[previousProgress as 0 | 1 | 2];
    addLog(
      game,
      "community",
      `本次${sectorId === "farm" ? "农场" : sectorId === "ranch" ? "牧场" : "矿山"}经营没有推进${definition.name}；当前顺序需要先完成“${expected.name}”。`,
      now,
    );
  }
}

function resourceAvailable(
  game: HomesteadGameState,
  economy: HomesteadLinkedEconomy,
  resource: HomesteadResource,
): number {
  if (resource.source === "farm") {
    return economy.farmProduce[resource.itemId];
  }
  if (resource.source === "ranch") {
    return economy.ranchProducts[resource.itemId];
  }
  if (resource.source === "mine") {
    return economy.mineOres[resource.itemId];
  }
  if (resource.source === "goods") {
    return game.goods[resource.itemId];
  }
  return game.cargoInventory[resource.itemId];
}

function assertResources(
  game: HomesteadGameState,
  economy: HomesteadLinkedEconomy,
  resources: readonly HomesteadResource[],
): void {
  const missing = resources.find(
    (resource) =>
      resourceAvailable(game, economy, resource) < resource.quantity,
  );
  if (missing) {
    throw new HomesteadRuleError(
      "HOMESTEAD_NOT_ENOUGH_RESOURCES",
      `资源不足：${missing.source}/${missing.itemId}`,
    );
  }
}

function consumeResources(
  game: HomesteadGameState,
  economy: HomesteadLinkedEconomy,
  resources: readonly HomesteadResource[],
): {
  farmChanged: boolean;
  ranchChanged: boolean;
  mineChanged: boolean;
} {
  assertResources(game, economy, resources);
  let farmChanged = false;
  let ranchChanged = false;
  let mineChanged = false;
  for (const resource of resources) {
    if (resource.source === "farm") {
      economy.farmProduce[resource.itemId] -= resource.quantity;
      farmChanged = true;
    } else if (resource.source === "ranch") {
      economy.ranchProducts[resource.itemId] -= resource.quantity;
      ranchChanged = true;
    } else if (resource.source === "mine") {
      economy.mineOres[resource.itemId] -= resource.quantity;
      mineChanged = true;
    } else if (resource.source === "goods") {
      game.goods[resource.itemId] -= resource.quantity;
    } else {
      game.cargoInventory[resource.itemId] -= resource.quantity;
    }
  }
  return { farmChanged, ranchChanged, mineChanged };
}

function cloneEconomy(
  economy: HomesteadLinkedEconomy,
): HomesteadLinkedEconomy {
  return {
    ...economy,
    farmProduce: structuredClone(economy.farmProduce),
    ranchProducts: structuredClone(economy.ranchProducts),
    mineOres: structuredClone(economy.mineOres),
  };
}

export function createHomesteadGame(input: {
  readonly ownerId: string;
  readonly ownerName: string;
  readonly seed: string;
  readonly now: number;
  readonly townId?: HomesteadTownId;
}): HomesteadGameState {
  const key = dayKey(input.now);
  const townId = input.townId ?? "greenvale";
  return {
    kind: "homestead",
    version: HOMESTEAD_STATE_VERSION,
    townId,
    revision: 0,
    ownerId: input.ownerId,
    ownerName: input.ownerName.trim(),
    seed: input.seed,
    createdAt: input.now,
    updatedAt: input.now,
    dayKey: key,
    reputation: 0,
    researchPoints: 0,
    goods: goodCounts(),
    cargoInventory: cargoCounts(),
    facilities: createFacilities(),
    orders: ordersForDay(input.seed, key, townId),
    worldEvent: eventForDay(input.seed, key, townId),
    decisionEffect: null,
    weather: weatherForDay(input.seed, key),
    disaster: null,
    resilience: createResilience(),
    emergencyBoosts: createEmergencyBoosts(),
    handledWeatherAlertIds: [],
    statistics: {
      jobsStarted: 0,
      jobsCollected: 0,
      ordersCompleted: 0,
      eventsResolved: 0,
      facilitiesBuilt: 0,
      facilityUpgrades: 0,
      researchUnlocked: 0,
      fieldPlansCompleted: 0,
      herdProgramsCompleted: 0,
      surveysCompleted: 0,
      npcConversations: 0,
      cargoShipmentsCollected: 0,
      valueRoutesCompleted: 0,
      honorRewardsClaimed: 0,
      seasonRewardsClaimed: 0,
      llmCalls: 0,
      llmFallbacks: 0,
      llmPromptTokens: 0,
      llmCompletionTokens: 0,
      generatedEventsApplied: 0,
    },
    nextLogId: 1,
    logs: [],
    research: { unlocked: [] },
    specializations: createSpecializations(),
    npcs: createNpcs(townId),
    advisorGuidance: createAdvisorGuidance(),
    infrastructure: createHomesteadInfrastructureState(),
    townRhythm: createHomesteadTownRhythmState(key),
    collectionProgress: {},
    honor: createHonor(),
    season: createPersonalSeason(input.now),
    collections: [{ id: "facility:mill", unlockedAt: input.now }],
    advice: createAdvice(key, input.now, townId),
    aiProfile: createAiProfile(),
    townNetwork: {
      ...createTownNetwork(),
      activeTownId: townId,
    },
    valueRouteDayKeys: createValueRouteDayKeys(),
  };
}

function rememberHandledWeatherAlert(
  game: HomesteadGameState,
  providerAlertId: string | undefined,
): void {
  if (!providerAlertId || game.handledWeatherAlertIds.includes(providerAlertId)) {
    return;
  }
  game.handledWeatherAlertIds = [
    ...game.handledWeatherAlertIds,
    providerAlertId,
  ].slice(-64);
}

export function refreshHomesteadGame(
  state: HomesteadGameState,
  now: number,
): HomesteadGameState {
  const game = structuredClone(state);
  const key = dayKey(now);
  const migrated = ensureLongTermState(game, now);
  if (game.dayKey === key) {
    if (migrated) finishMutation(game, now);
    return game;
  }
  const elapsedDays = dayNumber(key) - dayNumber(game.dayKey);
  if (elapsedDays <= 0) {
    if (migrated) finishMutation(game, now);
    return game;
  }
  const previousWorldEvent = structuredClone(game.worldEvent);
  const previousAdvice = structuredClone(game.advice);
  const generatedEventAge =
    dayNumber(key) - dayNumber(previousWorldEvent.startedDayKey);
  const carryGeneratedEvent =
    game.disaster === null &&
    previousWorldEvent.source === "llm" &&
    previousWorldEvent.rulesVersion === 2 &&
    previousWorldEvent.parameters?.pacingId === "two_day_follow_up" &&
    previousWorldEvent.parameters.durationDays === 2 &&
    previousWorldEvent.selectedOptionId === null &&
    Number.isSafeInteger(generatedEventAge) &&
    generatedEventAge > 0 &&
    generatedEventAge < previousWorldEvent.durationDays;

  game.specializations.farm.soilHealth = clamp(
    game.specializations.farm.soilHealth - 2 * elapsedDays,
    0,
    100,
  );
  game.specializations.ranch.herdHealth = clamp(
    game.specializations.ranch.herdHealth - 3 * elapsedDays,
    0,
    100,
  );
  game.specializations.farm.yieldBonusPercent = clamp(
    Math.floor((game.specializations.farm.soilHealth - 40) / 5) +
      game.specializations.farm.rotationStreak * 2,
    0,
    25,
  );
  game.specializations.ranch.productBonusPercent = clamp(
    Math.floor((game.specializations.ranch.herdHealth - 50) / 4) +
      (
        game.specializations.ranch.discoveredTraits.includes("productive")
          ? 8
          : 0
      ),
    0,
    30,
  );
  if (game.disaster) {
    const activeDisasterEvent = HOMESTEAD_WORLD_EVENTS[
      game.disaster.contentEventId ?? game.disaster.eventId
    ];
    const persistentUntilResolved =
      !game.disaster.mitigated &&
      activeDisasterEvent.hazard?.persistentUntilResolved === true;
    const activeDays = game.disaster.mitigated
      ? 0
      : persistentUntilResolved
        ? elapsedDays
        : Math.min(elapsedDays, game.disaster.remainingDays);
    game.disaster.remainingDays -= elapsedDays;
    let reputationLoss = 0;
    for (let day = 0; day < activeDays; day += 1) {
      game.disaster.unresolvedDays += 1;
      game.disaster.severity = Math.max(
        game.disaster.severity,
        clamp(
          1 + Math.floor(game.disaster.unresolvedDays / 2),
          1,
          3,
        ),
      );
      const remainingPenalty = Math.max(
        0,
        12 - (game.disaster.reputationPenaltyPaid ?? 0),
      );
      const dailyLoss = Math.min(
        game.reputation,
        remainingPenalty,
        game.disaster.severity * 2,
      );
      game.reputation -= dailyLoss;
      game.disaster.reputationPenaltyPaid =
        (game.disaster.reputationPenaltyPaid ?? 0) + dailyLoss;
      reputationLoss += dailyLoss;
    }
    if (reputationLoss > 0) {
      addLog(
        game,
        "community",
        `已发生的灾害连续 ${activeDays} 个生效日未处理，当地声望下降 ${reputationLoss}（本次灾害累计已扣 ${game.disaster.reputationPenaltyPaid}/12）。`,
        now,
      );
    }
    if (persistentUntilResolved) {
      game.disaster.remainingDays = Math.max(
        1,
        game.disaster.remainingDays,
      );
    }
    if (game.disaster.remainingDays <= 0) {
      if (!game.disaster.mitigated) {
        const disasterEvent = HOMESTEAD_WORLD_EVENTS[
          game.disaster.contentEventId ?? game.disaster.eventId
        ];
        const affectedSectors =
          disasterEvent.hazard?.affectedSectors ??
          (
            game.disaster.eventId === "mountain_seepage"
              ? ["mine"]
              : ["farm", "ranch"]
          );
        if (affectedSectors.includes("mine")) {
          game.specializations.mine.protectionLevel = Math.max(
            0,
            game.specializations.mine.protectionLevel - 1,
          );
        }
        if (affectedSectors.includes("farm")) {
          game.specializations.farm.soilHealth = clamp(
            game.specializations.farm.soilHealth - 8,
            0,
            100,
          );
        }
        if (affectedSectors.includes("ranch")) {
          game.specializations.ranch.herdHealth = clamp(
            game.specializations.ranch.herdHealth - 8,
            0,
            100,
          );
        }
        addLog(
          game,
          "event",
          `${disasterEvent.title}未及时处理，受影响板块进入灾后检修。`,
          now,
        );
      }
      rememberHandledWeatherAlert(
        game,
        game.disaster.providerAlertId,
      );
      game.disaster = null;
      game.emergencyBoosts = createEmergencyBoosts();
    }
  }
  // Persistent disasters are created only from a trusted live-weather alert.
  // Rule-generated daily events continue below, but fallback or stale weather
  // can never invent a production penalty or reputation loss.
  game.dayKey = key;
  game.townRhythm = refreshHomesteadTownRhythmState(game.townRhythm, key);
  game.decisionEffect = null;
  game.weather = weatherForDay(game.seed, key);
  game.orders = ordersForDay(
    game.seed,
    key,
    game.townId ?? game.townNetwork.activeTownId,
  );
  game.worldEvent = game.disaster
    ? eventForDisaster(game.disaster, key)
    : carryGeneratedEvent
      ? {
          ...previousWorldEvent,
          dayKey: key,
          unresolvedDays: Math.min(
            previousWorldEvent.durationDays - 1,
            Math.max(previousWorldEvent.unresolvedDays, generatedEventAge),
          ),
        }
      : eventForDay(
          game.seed,
          key,
          game.townId ?? game.townNetwork.activeTownId,
        );
  game.advice = carryGeneratedEvent &&
      previousAdvice.source === "llm"
    ? { ...previousAdvice, dayKey: key, generatedAt: now }
    : ruleAdvice(game, null, now);
  addLog(
    game,
    "event",
    `离线结算 ${elapsedDays} 天；今日天气为${HOMESTEAD_WEATHER[game.weather.weatherId].name}，联合订单和事件已更新。`,
    now,
  );
  finishMutation(game, now);
  return game;
}

export function compileHomesteadGeneratedEvent(
  blueprint: HomesteadGeneratedEventBlueprint,
  allowedTemplateIds: readonly HomesteadWorldEventId[],
  options: {
    readonly allowHazard?: boolean;
    readonly candidateWasPrevalidated?: boolean;
    readonly allowedPacingIds?: readonly HomesteadGeneratedEventPacingId[];
  } = {},
): CompiledHomesteadGeneratedEvent {
  const definition = HOMESTEAD_WORLD_EVENTS[blueprint.templateId];
  if (
    !definition ||
    !allowedTemplateIds.includes(blueprint.templateId) ||
    contentTownId(definition) !== blueprint.townId ||
    !blueprint.dayKey.trim()
  ) {
    throw new HomesteadRuleError(
      "HOMESTEAD_INVALID_ACTION",
      "动态事件蓝图不属于当前城镇或未通过候选白名单",
    );
  }
  if (definition.hazard && options.allowHazard !== true) {
    throw new HomesteadRuleError(
      "HOMESTEAD_INVALID_ACTION",
      "灾害事件只能由权威天气与规则系统触发",
    );
  }
  const pacingId = blueprint.pacingId ?? "single_day";
  const allowedPacingIds = options.allowedPacingIds ?? ["single_day"];
  if (
    !HOMESTEAD_GENERATED_EVENT_PACING_IDS.includes(pacingId) ||
    !allowedPacingIds.includes(pacingId) ||
    (definition.hazard !== undefined && pacingId !== "single_day")
  ) {
    throw new HomesteadRuleError(
      "HOMESTEAD_INVALID_ACTION",
      "Generated event pacing is not allowed",
    );
  }
  const parameters: HomesteadGeneratedEventParameters = {
    pacingId,
    durationDays: pacingId === "two_day_follow_up" ? 2 : 1,
  };

  const hasSafeExit = definition.options.some(
    (option) =>
      option.coinCost === 0 &&
      option.costs.length === 0 &&
      option.reputationReward >= 0,
  );
  if (
    !definition.hazard &&
    !hasSafeExit &&
    options.candidateWasPrevalidated !== true
  ) {
    throw new HomesteadRuleError(
      "HOMESTEAD_INVALID_ACTION",
      "动态事件缺少不制造资源死局的安全选项",
    );
  }
  const narrative = (
    blueprint.narrative?.replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160) ||
    definition.summary
  );
  const signature = hashText(
    [
      "v2",
      blueprint.townId,
      blueprint.dayKey,
      blueprint.templateId,
      narrative,
      pacingId,
    ].join(":"),
  ).toString(16);
  return Object.freeze({
    instanceId:
      `generated:${blueprint.townId}:${blueprint.dayKey}:${signature}`,
    rulesVersion: 2 as const,
    eventId: blueprint.templateId,
    narrative,
    parameters: Object.freeze(parameters),
  });
}

export function applyHomesteadWorldEventDecision(
  state: HomesteadGameState,
  eventId: HomesteadWorldEventId,
  source: HomesteadWorldEventState["source"],
  now: number,
  content?: {
    readonly headline?: string;
    readonly narrative?: string;
    readonly recommendation?: string;
    readonly npcId?: HomesteadNpcId;
    readonly npcLine?: string;
    readonly worldBeatId?: HomesteadWorldBeatId;
    readonly foreshadowing?: string;
    readonly evidence?: readonly HomesteadDirectorEvidence[];
    readonly planSteps?: readonly HomesteadAdviceStep[];
    readonly eventInstanceId?: string;
    readonly eventRulesVersion?: 1 | 2;
    readonly eventParameters?: HomesteadGeneratedEventParameters;
    readonly llmUsage?: {
      readonly promptTokens: number;
      readonly completionTokens: number;
    };
    readonly merchantRecommendationId?: EstateMerchantItemId;
  },
): HomesteadGameState {
  if (!HOMESTEAD_WORLD_EVENTS[eventId]) {
    throw new HomesteadRuleError(
      "HOMESTEAD_INVALID_ACTION",
      "未知的庄园世界事件",
    );
  }
  const game = structuredClone(state);
  ensureLongTermState(game, now);
  const effectiveEventId =
    game.disaster?.contentEventId ??
    game.disaster?.eventId ??
    eventId;
  const definition = HOMESTEAD_WORLD_EVENTS[effectiveEventId];
  const eventParameters = content?.eventParameters;
  const expectedDuration = eventParameters?.pacingId === "two_day_follow_up"
    ? 2
    : eventParameters?.pacingId === "single_day"
      ? 1
      : null;
  const hasValidV2Parameters =
    content?.eventRulesVersion === 2 &&
    typeof content.eventInstanceId === "string" &&
    content.eventInstanceId.length > 0 &&
    eventParameters !== undefined &&
    expectedDuration !== null &&
    eventParameters.durationDays === expectedDuration;
  if (
    (content?.eventRulesVersion === 2 || eventParameters !== undefined) &&
    !hasValidV2Parameters
  ) {
    throw new HomesteadRuleError(
      "HOMESTEAD_INVALID_ACTION",
      "Generated event parameters do not match the rules version",
    );
  }
  game.worldEvent = {
    eventId: effectiveEventId,
    dayKey: game.dayKey,
    selectedOptionId: game.disaster?.mitigated
      ? game.disaster.resolution
      : null,
    narrative: content?.narrative?.trim() || definition.summary,
    source,
    ...(content?.eventInstanceId
      ? {
          instanceId: content.eventInstanceId,
          rulesVersion: content.eventRulesVersion ?? 1,
          ...(eventParameters
            ? { parameters: structuredClone(eventParameters) }
            : {}),
        }
      : {}),
    startedDayKey: game.disaster?.startedDayKey ?? game.dayKey,
    durationDays: game.disaster?.remainingDays ??
      eventParameters?.durationDays ??
      (definition.tone === "risk" ? 3 : 1),
    unresolvedDays: game.disaster?.unresolvedDays ?? 0,
    severity: game.disaster?.severity ??
      (definition.tone === "risk" ? 1 : 0),
  };
  if (
    content?.headline?.trim() ||
    content?.recommendation?.trim() ||
    content?.npcId ||
    content?.npcLine?.trim() ||
    content?.worldBeatId ||
    content?.foreshadowing?.trim() ||
    content?.evidence?.length ||
    content?.planSteps?.length ||
    content?.merchantRecommendationId
  ) {
    game.advice = {
      dayKey: game.dayKey,
      source,
      headline: content.headline?.trim() || definition.title,
      narrative: content.narrative?.trim() || definition.summary,
      recommendation:
        content.recommendation?.trim() ||
        "比较两个固定选项的资源成本，再决定今日三业重点。",
      npcId:
        content.npcId && HOMESTEAD_NPCS[content.npcId]
          ? content.npcId
          : game.advice.npcId,
      npcLine:
        content.npcLine?.trim() ||
        "规则给出了边界，选择仍然属于庄主。",
      generatedAt: now,
      ...(content.worldBeatId ? { worldBeatId: content.worldBeatId } : {}),
      ...(content.foreshadowing?.trim()
        ? { foreshadowing: content.foreshadowing.trim().slice(0, 120) }
        : {}),
      ...(content.evidence?.length
        ? {
            evidence: content.evidence.slice(0, 3).map((item) => ({
              id: item.id.slice(0, 80),
              label: item.label.trim().slice(0, 160),
            })),
          }
        : {}),
      steps: content.planSteps?.slice(0, 3) ??
        game.advice.steps ??
        defaultAdviceSteps(game),
      ...(content.merchantRecommendationId
        ? {
            merchantRecommendationId:
              content.merchantRecommendationId,
          }
        : {}),
    };
  }
  if (source === "llm") {
    game.statistics.llmCalls += 1;
    game.statistics.llmPromptTokens += Math.max(
      0,
      Math.round(content?.llmUsage?.promptTokens ?? 0),
    );
    game.statistics.llmCompletionTokens += Math.max(
      0,
      Math.round(content?.llmUsage?.completionTokens ?? 0),
    );
    if (content?.eventInstanceId) {
      game.statistics.generatedEventsApplied += 1;
    }
  }
  addLog(
    game,
    "event",
    `${source === "llm" ? "世界导演" : "规则系统"}发布事件：${definition.title}。`,
    now,
  );
  finishMutation(game, now);
  return game;
}

function facilityUpgrade(
  facility: HomesteadFacilityState,
): {
  level: number;
  coinCost: number;
  ironIngotCost: number;
  requiredResearch: HomesteadResearchNodeId;
} | null {
  if (facility.level >= HOMESTEAD_MAX_FACILITY_LEVEL) return null;
  const level = facility.level + 1;
  return {
    level,
    coinCost: level === 2 ? 600 : 1_600,
    ironIngotCost: level === 2 ? 1 : 3,
    requiredResearch: level === 2 ? "estate_engineering" : "automation",
  };
}

function specializationDone(
  lastManagedDayKey: string | null,
  key: string,
): void {
  if (lastManagedDayKey === key) {
    throw new HomesteadRuleError(
      "HOMESTEAD_DAILY_SPECIALIZATION_DONE",
      "该板块今日的深度经营已经完成",
    );
  }
}

function topicDialogue(
  game: HomesteadGameState,
  npcId: HomesteadNpcId,
  topicId: HomesteadNpcTopicId,
): string {
  if (HOMESTEAD_NPCS[npcId].topics.includes("soil")) {
    return topicId === "soil"
      ? `当前土壤健康为 ${game.specializations.farm.soilHealth}，低于 50 时应优先恢复。`
      : `当前连续轮作 ${game.specializations.farm.rotationStreak} 次，继续更换科属能保持恢复。`;
  }
  if (HOMESTEAD_NPCS[npcId].topics.includes("nutrition")) {
    return topicId === "nutrition"
      ? `牧群健康为 ${game.specializations.ranch.herdHealth}，均衡饲料适合稳定恢复。`
      : `目前记录了 ${game.specializations.ranch.discoveredTraits.length} 种特质，强化饲料更容易发现稀有表现。`;
  }
  return topicId === "layers"
    ? `勘探进度为 ${game.specializations.mine.surveyProgress}，不要越过当前防护能力。`
    : `当前防护等级 ${game.specializations.mine.protectionLevel}，深层矿带至少需要二级防护。`;
}

function updateAdviceAfterAction(
  game: HomesteadGameState,
  economy: HomesteadLinkedEconomy,
  now: number,
): void {
  if (
    game.advice.source === "rules" ||
    game.advice.dayKey !== game.dayKey
  ) {
    game.advice = ruleAdvice(game, economy, now);
  }
}

function awardMerchantRenownMilestones(
  game: HomesteadGameState,
  now: number,
): void {
  const milestones = [
    {
      id: "renown:orders:10",
      reached: game.statistics.ordersCompleted >= 10,
      reward: 1,
      label: "稳定履约",
    },
    {
      id: "renown:orders:30",
      reached: game.statistics.ordersCompleted >= 30,
      reward: 2,
      label: "区域供应商",
    },
    {
      id: "renown:orders:75",
      reached: game.statistics.ordersCompleted >= 75,
      reward: 3,
      label: "跨镇骨干商户",
    },
    {
      id: "renown:events:10",
      reached: game.statistics.eventsResolved >= 10,
      reward: 1,
      label: "社区协作者",
    },
    {
      id: "renown:events:30",
      reached: game.statistics.eventsResolved >= 30,
      reward: 2,
      label: "公共事务伙伴",
    },
  ] as const;
  for (const milestone of milestones) {
    if (!milestone.reached) continue;
    if (!unlockCollection(game, milestone.id, now)) continue;
    game.townNetwork.merchantRenown += milestone.reward;
    addLog(
      game,
      "community",
      `达成“${milestone.label}”，商会名望 +${milestone.reward}。`,
      now,
    );
  }
}

function frostpeakTown(game: HomesteadGameState): HomesteadTownEstateState {
  if (game.townNetwork.activeTownId !== "frostpeak") {
    throw new HomesteadRuleError(
      "HOMESTEAD_SPECIALIZATION_LOCKED",
      "请先切换到霜岭镇再执行该城镇操作",
    );
  }
  const town = game.townNetwork.towns.frostpeak;
  town.reputation = Math.max(town.reputation, game.reputation);
  return town;
}

function townRequirementsSufficient(
  town: HomesteadTownEstateState,
  requirements: readonly {
    readonly itemId: HomesteadTownResourceId;
    readonly quantity: number;
  }[],
): boolean {
  return requirements.every(
    ({ itemId, quantity }) => town.inventory[itemId] >= quantity,
  );
}

function consumeTownRequirements(
  town: HomesteadTownEstateState,
  requirements: readonly {
    readonly itemId: HomesteadTownResourceId;
    readonly quantity: number;
  }[],
): void {
  if (!townRequirementsSufficient(town, requirements)) {
    throw new HomesteadRuleError(
      "HOMESTEAD_NOT_ENOUGH_RESOURCES",
      "霜岭镇本地物资不足",
    );
  }
  for (const { itemId, quantity } of requirements) {
    town.inventory[itemId] -= quantity;
  }
}

export function applyHomesteadAction(
  state: HomesteadGameState,
  linkedEconomy: HomesteadLinkedEconomy,
  action: HomesteadAction,
  now: number,
): HomesteadActionResult {
  const effectiveNow = Math.max(now, state.updatedAt);
  const game = refreshHomesteadGame(state, effectiveNow);
  const economy = cloneEconomy(linkedEconomy);
  const localTownId = game.townId ?? game.townNetwork.activeTownId;
  let farmChanged = false;
  let ranchChanged = false;
  let mineChanged = false;

  if (
    action.type === "homestead_unlock_town" ||
    action.type === "homestead_switch_town" ||
    action.type === "homestead_buy_merchant_item" ||
    action.type === "homestead_use_acceleration_card"
  ) {
    throw new HomesteadRuleError(
      "HOMESTEAD_INVALID_ACTION",
      "该操作必须由庄园账户事务处理",
    );
  } else if (action.type === "homestead_update_ai_profile") {
    game.aiProfile = {
      enabled: action.enabled,
      goal: action.goal,
      risk: action.risk,
      focus: action.focus,
    };
    game.advice = ruleAdvice(game, economy, effectiveNow);
    addLog(
      game,
      "community",
      action.enabled
        ? "世界导演已更新世界倾向、压力与聚焦舞台。"
        : "世界导演个性化编排已暂停，继续使用规则提示。",
      effectiveNow,
    );
  } else if (action.type === "homestead_start_town_sector") {
    const town = frostpeakTown(game);
    const sector = town.sectors[action.sectorId];
    const definition = HOMESTEAD_FROSTPEAK_SECTORS[action.sectorId];
    if (!sector || !definition) {
      throw new HomesteadRuleError(
        "HOMESTEAD_INVALID_ACTION",
        "未知的霜岭产业",
      );
    }
    if (sector.job) {
      throw new HomesteadRuleError(
        "HOMESTEAD_FACILITY_BUSY",
        "该产业正在生产",
      );
    }
    if (definition.input) {
      consumeTownRequirements(town, [definition.input]);
    }
    const durationMultiplier = 1 - (sector.level - 1) * 0.1;
    sector.cycle += 1;
    sector.job = {
      cycle: sector.cycle,
      startedAt: effectiveNow,
      completesAt:
        effectiveNow +
        Math.max(
          60,
          Math.round(definition.durationSeconds * durationMultiplier),
        ) * 1_000,
    };
    addLog(
      game,
      action.sectorId,
      `${HOMESTEAD_TOWNS.frostpeak.name}开始${definition.actionName}。`,
      effectiveNow,
    );
  } else if (action.type === "homestead_collect_town_sector") {
    const town = frostpeakTown(game);
    const sector = town.sectors[action.sectorId];
    const definition = HOMESTEAD_FROSTPEAK_SECTORS[action.sectorId];
    if (!sector?.job || !definition) {
      throw new HomesteadRuleError(
        "HOMESTEAD_JOB_NOT_FOUND",
        "该产业没有可收取的生产批次",
      );
    }
    if (sector.job.completesAt > effectiveNow) {
      throw new HomesteadRuleError(
        "HOMESTEAD_JOB_NOT_READY",
        "该产业尚未完成生产",
      );
    }
    const quantity = definition.output.quantity + sector.level - 1;
    town.inventory[definition.output.itemId] += quantity;
    sector.job = null;
    addSeasonScore(game, 2 + sector.level, "specializations");
    unlockCollection(
      game,
      `town:frostpeak:${definition.output.itemId}`,
      effectiveNow,
    );
    addLog(
      game,
      action.sectorId,
      `${definition.name}完成生产，获得${
        HOMESTEAD_TOWN_RESOURCES[definition.output.itemId].name
      } ×${quantity}。`,
      effectiveNow,
    );
  } else if (action.type === "homestead_upgrade_town_sector") {
    const town = frostpeakTown(game);
    const sector = town.sectors[action.sectorId];
    const definition = HOMESTEAD_FROSTPEAK_SECTORS[action.sectorId];
    if (!sector || !definition) {
      throw new HomesteadRuleError(
        "HOMESTEAD_INVALID_ACTION",
        "未知的霜岭产业",
      );
    }
    if (sector.job) {
      throw new HomesteadRuleError(
        "HOMESTEAD_FACILITY_BUSY",
        "生产期间不能升级产业",
      );
    }
    const upgrade = townSectorUpgrade(sector);
    if (!upgrade) {
      throw new HomesteadRuleError(
        "HOMESTEAD_FACILITY_MAX_LEVEL",
        "该产业已经达到最高等级",
      );
    }
    if (
      economy.coins < upgrade.coinCost ||
      town.reputation < upgrade.reputationRequired ||
      town.inventory.frost_crystal < upgrade.crystalCost
    ) {
      throw new HomesteadRuleError(
        "HOMESTEAD_NOT_ENOUGH_RESOURCES",
        "升级所需金币、当地声望或霜晶不足",
      );
    }
    economy.coins -= upgrade.coinCost;
    economy.farmRevision += 1;
    farmChanged = true;
    town.inventory.frost_crystal -= upgrade.crystalCost;
    sector.level = upgrade.level;
    addLog(
      game,
      "facility",
      `${definition.name}升级到 ${upgrade.level} 级。`,
      effectiveNow,
    );
  } else if (action.type === "homestead_sell_town_resource") {
    const town = frostpeakTown(game);
    const definition = HOMESTEAD_TOWN_RESOURCES[action.resourceId];
    if (
      !definition ||
      !Number.isSafeInteger(action.quantity) ||
      action.quantity < 1 ||
      town.inventory[action.resourceId] < action.quantity
    ) {
      throw new HomesteadRuleError(
        "HOMESTEAD_NOT_ENOUGH_RESOURCES",
        "出售数量无效或本地库存不足",
      );
    }
    const revenue = definition.salePrice * action.quantity;
    town.inventory[action.resourceId] -= action.quantity;
    economy.coins += revenue;
    economy.farmRevision += 1;
    farmChanged = true;
    addLog(
      game,
      "market",
      `霜岭商路售出${definition.name} ×${action.quantity}，获得 ${revenue} 金币。`,
      effectiveNow,
    );
  } else if (action.type === "homestead_resolve_town_problem") {
    const town = frostpeakTown(game);
    const currentProblem = HOMESTEAD_FROSTPEAK_PROBLEMS.find(
      ({ id }) => !town.resolvedProblemIds.includes(id),
    );
    if (!currentProblem || currentProblem.id !== action.problemId) {
      throw new HomesteadRuleError(
        "HOMESTEAD_EVENT_OPTION_NOT_FOUND",
        "该问题不存在、尚未开放或已经解决",
      );
    }
    consumeTownRequirements(town, currentProblem.requirements);
    town.resolvedProblemIds.push(currentProblem.id);
    town.reputation += currentProblem.reputationReward;
    game.reputation += currentProblem.reputationReward;
    game.townNetwork.merchantRenown += 1;
    game.researchPoints += currentProblem.researchReward;
    economy.coins += currentProblem.coinReward;
    economy.farmRevision += 1;
    farmChanged = true;
    addSeasonScore(game, 12, "community");
    addLog(
      game,
      "community",
      `解决霜岭镇问题“${currentProblem.title}”，当地声望 +${currentProblem.reputationReward}。`,
      effectiveNow,
    );
  } else if (action.type === "homestead_restore_town_landmark") {
    const town = frostpeakTown(game);
    const nextStage = HOMESTEAD_FROSTPEAK_LANDMARK_STAGES.find(
      ({ stage }) => stage === town.landmarkStage + 1,
    );
    if (!nextStage) {
      throw new HomesteadRuleError(
        "HOMESTEAD_FACILITY_MAX_LEVEL",
        "山地热力站已经全部修复",
      );
    }
    if (
      town.resolvedProblemIds.length < nextStage.requiredProblems ||
      town.reputation < nextStage.requiredReputation
    ) {
      throw new HomesteadRuleError(
        "HOMESTEAD_FACILITY_LOCKED",
        "需要先解决当地问题并提高霜岭声望",
      );
    }
    if (economy.coins < nextStage.coinCost) {
      throw new HomesteadRuleError(
        "HOMESTEAD_NOT_ENOUGH_COINS",
        "修复地标所需金币不足",
      );
    }
    consumeTownRequirements(town, nextStage.requirements);
    economy.coins -= nextStage.coinCost;
    economy.farmRevision += 1;
    farmChanged = true;
    town.landmarkStage = nextStage.stage;
    town.reputation += nextStage.reputationReward;
    game.reputation += nextStage.reputationReward;
    game.townNetwork.merchantRenown += nextStage.renownReward;
    unlockCollection(
      game,
      `town:frostpeak:landmark:${nextStage.stage}`,
      effectiveNow,
    );
    addSeasonScore(game, 20 * nextStage.stage, "community");
    addLog(
      game,
      "community",
      `完成山地热力站阶段“${nextStage.name}”，全局名望 +${nextStage.renownReward}。`,
      effectiveNow,
    );
  } else if (action.type === "homestead_complete_value_route") {
    const route = HOMESTEAD_VALUE_ROUTES[action.routeId];
    if (!route) {
      throw new HomesteadRuleError(
        "HOMESTEAD_INVALID_ACTION",
        "未知的增值项目",
      );
    }
    const activeTownId = game.townId ?? game.townNetwork.activeTownId;
    if (contentTownId(route) !== activeTownId) {
      throw new HomesteadRuleError(
        "HOMESTEAD_SPECIALIZATION_LOCKED",
        "该增值项目不属于当前城镇",
      );
    }
    if (isHomesteadLogisticsBlocked(game)) {
      throw new HomesteadRuleError(
        "HOMESTEAD_SPECIALIZATION_LOCKED",
        "当前持续灾害阻断了城镇物流，请先处理事件",
      );
    }
    if (game.valueRouteDayKeys[action.routeId] === game.dayKey) {
      throw new HomesteadRuleError(
        "HOMESTEAD_ORDER_COMPLETED",
        "该增值项目今日已经完成",
      );
    }
    if (
      route.requiredInfrastructure &&
      game.infrastructure[route.requiredInfrastructure.id] <
        route.requiredInfrastructure.level
    ) {
      throw new HomesteadRuleError(
        "HOMESTEAD_FACILITY_LOCKED",
        `需要先将${HOMESTEAD_INFRASTRUCTURE[route.requiredInfrastructure.id].name}提升到 LV${route.requiredInfrastructure.level}`,
      );
    }
    const consumed = consumeResources(game, economy, route.requirements);
    farmChanged = farmChanged || consumed.farmChanged;
    ranchChanged = ranchChanged || consumed.ranchChanged;
    mineChanged = mineChanged || consumed.mineChanged;
    economy.coins += route.coinReward;
    economy.farmRevision += 1;
    farmChanged = true;
    game.reputation += route.reputationReward;
    game.researchPoints += route.researchReward;
    game.valueRouteDayKeys[action.routeId] = game.dayKey;
    game.statistics.valueRoutesCompleted += 1;
    addSeasonScore(game, route.stage === 3 ? 10 : 6, "community");
    addLog(
      game,
      "market",
      `完成增值项目“${route.title}”，收入 ${route.coinReward} 金币，当地声望 +${route.reputationReward}。`,
      effectiveNow,
    );
  } else if (action.type === "homestead_build_facility") {
    const definition = HOMESTEAD_FACILITIES[action.facilityId];
    const facility = game.facilities.find(
      (candidate) => candidate.id === action.facilityId,
    );
    if (!definition || !facility) {
      throw new HomesteadRuleError(
        "HOMESTEAD_INVALID_ACTION",
        "未知的庄园设施",
      );
    }
    if (facility.built) {
      throw new HomesteadRuleError(
        "HOMESTEAD_FACILITY_ALREADY_BUILT",
        "设施已经建成",
      );
    }
    if (game.reputation < definition.requiredReputation) {
      throw new HomesteadRuleError(
        "HOMESTEAD_FACILITY_LOCKED",
        "庄园声望尚未达到建设要求",
      );
    }
    if (economy.coins < definition.coinCost) {
      throw new HomesteadRuleError(
        "HOMESTEAD_NOT_ENOUGH_COINS",
        "金币不足",
      );
    }
    economy.coins -= definition.coinCost;
    economy.farmRevision += 1;
    farmChanged = true;
    facility.built = true;
    facility.level = 1;
    game.statistics.facilitiesBuilt += 1;
    unlockCollection(game, `facility:${facility.id}`, effectiveNow);
    addLog(game, "facility", `${definition.name}建成并投入使用。`, effectiveNow);
  } else if (action.type === "homestead_start_job") {
    const recipe = HOMESTEAD_RECIPES[action.recipeId];
    if (!recipe) {
      throw new HomesteadRuleError(
        "HOMESTEAD_INVALID_ACTION",
        "未知的加工配方",
      );
    }
    const activeTownId = game.townId ?? game.townNetwork.activeTownId;
    if (contentTownId(recipe) !== activeTownId) {
      throw new HomesteadRuleError(
        "HOMESTEAD_INVALID_ACTION",
        "该加工配方不属于当前城镇",
      );
    }
    const facility = game.facilities.find(
      (candidate) => candidate.id === recipe.facilityId,
    )!;
    if (!facility.built) {
      throw new HomesteadRuleError(
        "HOMESTEAD_FACILITY_NOT_BUILT",
        "需要先建设对应设施",
      );
    }
    if (facility.job) {
      throw new HomesteadRuleError(
        "HOMESTEAD_FACILITY_BUSY",
        "设施正在生产",
      );
    }
    if (economy.coins < recipe.coinCost) {
      throw new HomesteadRuleError(
        "HOMESTEAD_NOT_ENOUGH_COINS",
        "加工所需运营资金不足",
      );
    }
    const changed = consumeResources(game, economy, recipe.inputs);
    farmChanged ||= changed.farmChanged;
    ranchChanged ||= changed.ranchChanged;
    mineChanged ||= changed.mineChanged;
    economy.coins -= recipe.coinCost;
    economy.farmRevision += 1;
    farmChanged = true;
    const speedMultiplier =
      1 +
      Math.max(0, facility.level - 1) * 0.2 +
      (hasResearch(game, "automation") ? 0.1 : 0);
    // Facility upgrades improve throughput, not the material conversion
    // ratio. Keeping batch output fixed prevents mature facilities from
    // turning otherwise bounded recipes into exponential coin generators.
    const outputQuantity = recipe.output.quantity;
    facility.job = {
      recipeId: recipe.id,
      startedAt: effectiveNow,
      completesAt:
        effectiveNow +
        Math.max(60, Math.round(recipe.durationSeconds / speedMultiplier)) *
          1_000,
      outputQuantity,
    };
    game.statistics.jobsStarted += 1;
    addLog(game, "production", `${recipe.name}已经开始。`, effectiveNow);
  } else if (action.type === "homestead_collect_job") {
    const facility = game.facilities.find(
      (candidate) => candidate.id === action.facilityId,
    );
    if (!facility?.job) {
      throw new HomesteadRuleError(
        "HOMESTEAD_JOB_NOT_FOUND",
        "没有可收取的加工任务",
      );
    }
    if (facility.job.completesAt > effectiveNow) {
      throw new HomesteadRuleError(
        "HOMESTEAD_JOB_NOT_READY",
        "加工任务尚未完成",
      );
    }
    const recipe = HOMESTEAD_RECIPES[facility.job.recipeId];
    const outputQuantity = facility.job.outputQuantity ??
      recipe.output.quantity;
    game.goods[recipe.output.itemId] += outputQuantity;
    facility.job = null;
    game.statistics.jobsCollected += 1;
    addSeasonScore(game, 3, "jobs");
    recordCollectionProgress(game, `recipe:${recipe.id}`, effectiveNow);
    addLog(
      game,
      "production",
      `${recipe.name}完成，获得 ${outputQuantity} 份${recipe.output.itemId}。`,
      effectiveNow,
    );
  } else if (action.type === "homestead_complete_order") {
    if (isHomesteadLogisticsBlocked(game)) {
      throw new HomesteadRuleError(
        "HOMESTEAD_SPECIALIZATION_LOCKED",
        "当前持续灾害阻断了城镇物流，请先处理事件",
      );
    }
    const order = game.orders.find(
      (candidate) => candidate.id === action.orderId,
    );
    if (!order) {
      throw new HomesteadRuleError(
        "HOMESTEAD_ORDER_NOT_FOUND",
        "联合订单不存在或已经过期",
      );
    }
    if (order.completed) {
      throw new HomesteadRuleError(
        "HOMESTEAD_ORDER_COMPLETED",
        "联合订单已经完成",
      );
    }
    const template = HOMESTEAD_ORDER_TEMPLATES[order.templateId];
    const activeTownId = game.townId ?? game.townNetwork.activeTownId;
    if (contentTownId(template) !== activeTownId) {
      throw new HomesteadRuleError(
        "HOMESTEAD_ORDER_NOT_FOUND",
        "该联合订单不属于当前城镇",
      );
    }
    const changed = consumeResources(game, economy, template.requirements);
    farmChanged ||= changed.farmChanged;
    ranchChanged ||= changed.ranchChanged;
    mineChanged ||= changed.mineChanged;
    economy.coins += template.coinReward;
    economy.farmRevision += 1;
    farmChanged = true;
    game.reputation += template.reputationReward;
    game.researchPoints += template.researchReward;
    game.statistics.ordersCompleted += 1;
    addSeasonScore(game, 8, "orders");
    order.completed = true;
    addLog(game, "order", `完成联合订单：${template.title}。`, effectiveNow);
  } else if (action.type === "homestead_choose_event") {
    if (game.worldEvent.selectedOptionId) {
      throw new HomesteadRuleError(
        "HOMESTEAD_EVENT_ALREADY_RESOLVED",
        "今日庄园事件已经处理",
      );
    }
    const event = HOMESTEAD_WORLD_EVENTS[game.worldEvent.eventId];
    const option = event.options.find(
      (candidate) => candidate.id === action.optionId,
    );
    if (!option) {
      throw new HomesteadRuleError(
        "HOMESTEAD_EVENT_OPTION_NOT_FOUND",
        "事件选项不存在",
      );
    }
    const activeDisaster =
      game.disaster &&
        (
          game.disaster.contentEventId ??
          game.disaster.eventId
        ) === game.worldEvent.eventId
        ? game.disaster
        : null;
    const isTemporaryDisasterOption =
      activeDisaster !== null &&
      option.resolvesHazard === false;
    if (
      isTemporaryDisasterOption &&
      activeDisaster.temporaryOptionId
    ) {
      throw new HomesteadRuleError(
        "HOMESTEAD_EVENT_ALREADY_RESOLVED",
        "本次灾害已经执行过临时方案，请选择彻底处置方案",
      );
    }
    if (economy.coins < option.coinCost) {
      throw new HomesteadRuleError(
        "HOMESTEAD_NOT_ENOUGH_COINS",
        "金币不足",
      );
    }
    const reputationCost = Math.max(0, -option.reputationReward);
    if (game.reputation < reputationCost) {
      throw new HomesteadRuleError(
        "HOMESTEAD_NOT_ENOUGH_REPUTATION",
        `当地声望不足，还差 ${reputationCost - game.reputation}`,
      );
    }
    const changed = consumeResources(game, economy, option.costs);
    farmChanged ||= changed.farmChanged;
    ranchChanged ||= changed.ranchChanged;
    mineChanged ||= changed.mineChanged;
    if (option.coinCost > 0 || option.coinReward > 0) {
      economy.coins += option.coinReward - option.coinCost;
      economy.farmRevision += 1;
      farmChanged = true;
    }
    game.reputation += option.reputationReward;
    game.researchPoints += option.researchReward;
    if (!isTemporaryDisasterOption) {
      game.statistics.eventsResolved += 1;
      addSeasonScore(game, 4, "community");
    }
    game.worldEvent.selectedOptionId = option.id;
    const productionEffect = decisionProductionEffect(event.id, option.id);
    game.decisionEffect = productionEffect
      ? {
          dayKey: game.dayKey,
          eventId: event.id,
          optionId: option.id,
          effect: productionEffect,
        }
      : null;
    if (activeDisaster) {
      if (option.resolvesHazard !== false) {
        activeDisaster.mitigated = true;
        activeDisaster.resolution = option.id;
        rememberHandledWeatherAlert(
          game,
          activeDisaster.providerAlertId,
        );
      } else {
        activeDisaster.temporaryOptionId = option.id;
      }
      if (
        activeDisaster.eventId === "mountain_seepage" &&
        option.id === "channel_water"
      ) {
        game.specializations.farm.soilHealth = clamp(
          game.specializations.farm.soilHealth + 8,
          0,
          100,
        );
      }
      if (
        activeDisaster.eventId === "cold_snap" &&
        option.id === "protect_homestead"
      ) {
        game.specializations.farm.soilHealth = clamp(
          game.specializations.farm.soilHealth + 4,
          0,
          100,
        );
        game.specializations.ranch.herdHealth = clamp(
          game.specializations.ranch.herdHealth + 4,
          0,
          100,
        );
      }
    }
    addLog(
      game,
      "event",
      `${event.title}：选择了“${option.label}”。${
        isTemporaryDisasterOption
          ? "临时方案已执行，灾害仍在持续。"
          : ""
      }`,
      effectiveNow,
    );
  } else if (action.type === "homestead_unlock_research") {
    const definition = HOMESTEAD_RESEARCH[action.nodeId];
    const activeTownId = game.townId ?? game.townNetwork.activeTownId;
    if (
      !definition ||
      !researchIdsForTown(activeTownId).includes(action.nodeId)
    ) {
      throw new HomesteadRuleError(
        "HOMESTEAD_RESEARCH_NOT_FOUND",
        "研究节点不存在或不属于当前城镇",
      );
    }
    if (hasResearch(game, action.nodeId)) {
      throw new HomesteadRuleError(
        "HOMESTEAD_RESEARCH_ALREADY_UNLOCKED",
        "研究节点已经完成",
      );
    }
    const missing = definition.prerequisites.filter(
      (nodeId) => !hasResearch(game, nodeId),
    );
    const missingRequirements = getHomesteadResearchRequirementProgress(
      game,
      definition,
    ).filter((requirement) => !requirement.satisfied);
    if (
      missing.length > 0 ||
      missingRequirements.length > 0 ||
      game.reputation < definition.requiredReputation ||
      game.researchPoints < definition.researchCost
    ) {
      throw new HomesteadRuleError(
        "HOMESTEAD_RESEARCH_LOCKED",
        "前置研究、经营里程碑、声望或研究点不足",
      );
    }
    game.researchPoints -= definition.researchCost;
    game.research.unlocked.push(definition.id);
    game.statistics.researchUnlocked += 1;
    addSeasonScore(game, 5, "community");
    unlockCollection(game, `research:${definition.id}`, effectiveNow);
    addLog(game, "research", `完成研究：${definition.name}。`, effectiveNow);
  } else if (action.type === "homestead_upgrade_facility") {
    const facility = game.facilities.find(
      (candidate) => candidate.id === action.facilityId,
    );
    if (!facility?.built) {
      throw new HomesteadRuleError(
        "HOMESTEAD_FACILITY_NOT_BUILT",
        "需要先建设对应设施",
      );
    }
    if (facility.job) {
      throw new HomesteadRuleError(
        "HOMESTEAD_FACILITY_BUSY",
        "设施生产时不能升级",
      );
    }
    const upgrade = facilityUpgrade(facility);
    if (!upgrade) {
      throw new HomesteadRuleError(
        "HOMESTEAD_FACILITY_MAX_LEVEL",
        "设施已经达到最高等级",
      );
    }
    if (!hasResearch(game, upgrade.requiredResearch)) {
      throw new HomesteadRuleError(
        "HOMESTEAD_RESEARCH_LOCKED",
        "尚未完成设施升级所需研究",
      );
    }
    if (economy.coins < upgrade.coinCost) {
      throw new HomesteadRuleError(
        "HOMESTEAD_NOT_ENOUGH_COINS",
        "金币不足",
      );
    }
    const upgradeGoodId = localGoodId(localTownId, "iron_ingot");
    if (game.goods[upgradeGoodId] < upgrade.ironIngotCost) {
      throw new HomesteadRuleError(
        "HOMESTEAD_NOT_ENOUGH_RESOURCES",
        "本地设施升级合金不足",
      );
    }
    economy.coins -= upgrade.coinCost;
    economy.farmRevision += 1;
    farmChanged = true;
    game.goods[upgradeGoodId] -= upgrade.ironIngotCost;
    facility.level = upgrade.level;
    game.statistics.facilityUpgrades += 1;
    addSeasonScore(game, 5, "community");
    addLog(
      game,
      "facility",
      `${HOMESTEAD_FACILITIES[facility.id].name}升级到 ${facility.level} 级。`,
      effectiveNow,
    );
  } else if (action.type === "homestead_plan_rotation") {
    const farm = game.specializations.farm;
    const definition = HOMESTEAD_CROP_FAMILIES[action.cropFamily];
    if (!definition) {
      throw new HomesteadRuleError(
        "HOMESTEAD_INVALID_ACTION",
        "未知的轮作科属",
      );
    }
    specializationDone(farm.lastManagedDayKey, game.dayKey);
    if (action.useFertilizer && !hasResearch(game, "soil_science")) {
      throw new HomesteadRuleError(
        "HOMESTEAD_SPECIALIZATION_LOCKED",
        "完成土壤科学研究后才能使用改良剂",
      );
    }
    const fertilizerGoodId = localGoodId(localTownId, "soil_conditioner");
    if (action.useFertilizer && game.goods[fertilizerGoodId] < 1) {
      throw new HomesteadRuleError(
        "HOMESTEAD_NOT_ENOUGH_RESOURCES",
        "土壤改良剂不足",
      );
    }
    const rotating = farm.lastCropFamily !== null &&
      farm.lastCropFamily !== action.cropFamily;
    if (action.useFertilizer) {
      game.goods[fertilizerGoodId] -= 1;
      farm.fertilizerApplications += 1;
    }
    const researchBonus = hasResearch(game, "crop_rotation") ? 4 : 0;
    const soilDelta =
      (rotating ? 9 : farm.lastCropFamily === null ? 4 : -7) +
      (action.useFertilizer ? 18 : 0) +
      researchBonus;
    farm.soilHealth = clamp(farm.soilHealth + soilDelta, 0, 100);
    farm.rotationStreak = rotating ? farm.rotationStreak + 1 : 0;
    farm.lastCropFamily = action.cropFamily;
    farm.lastManagedDayKey = game.dayKey;
    farm.yieldBonusPercent = clamp(
      Math.floor((farm.soilHealth - 40) / 5) + farm.rotationStreak * 2,
      0,
      25,
    );
    const rewardCropId = localTownId === "frostpeak"
      ? FROSTPEAK_CROP_FAMILY_REWARDS[action.cropFamily]
      : definition.rewardCropId;
    economy.farmProduce[rewardCropId] +=
      definition.rewardQuantity +
      (hasResearch(game, "crop_rotation") && rotating ? 1 : 0) +
      (farm.yieldBonusPercent >= 10 ? 1 : 0);
    farmChanged = true;
    game.statistics.fieldPlansCompleted += 1;
    addSeasonScore(game, rotating ? 4 : 3, "specializations");
    recordCollectionProgress(game, `farm:${action.cropFamily}`, effectiveNow);
    addLog(
      game,
      "farm",
      `完成${definition.name}轮作计划，土壤健康变化 ${soilDelta >= 0 ? "+" : ""}${soilDelta}。`,
      effectiveNow,
    );
    advanceTownRhythmForSector(game, "farm", effectiveNow);
  } else if (action.type === "homestead_run_feed_program") {
    const ranch = game.specializations.ranch;
    const definition = HOMESTEAD_FEED_PROGRAMS[action.programId];
    if (!definition) {
      throw new HomesteadRuleError(
        "HOMESTEAD_INVALID_ACTION",
        "未知的饲料方案",
      );
    }
    specializationDone(ranch.lastManagedDayKey, game.dayKey);
    if (
      definition.requiredResearch &&
      !hasResearch(game, definition.requiredResearch)
    ) {
      throw new HomesteadRuleError(
        "HOMESTEAD_SPECIALIZATION_LOCKED",
        "尚未完成饲料方案所需研究",
      );
    }
    const feedGoodId = definition.goodCost
      ? localGoodId(localTownId, definition.goodCost.itemId)
      : null;
    if (
      definition.goodCost &&
      feedGoodId &&
      game.goods[feedGoodId] < definition.goodCost.quantity
    ) {
      throw new HomesteadRuleError(
        "HOMESTEAD_NOT_ENOUGH_RESOURCES",
        "加工饲料不足",
      );
    }
    if (definition.goodCost && feedGoodId) {
      game.goods[feedGoodId] -= definition.goodCost.quantity;
    }
    const nutritionBonus = hasResearch(game, "animal_nutrition") ? 3 : 0;
    ranch.herdHealth = clamp(
      ranch.herdHealth + definition.healthGain + nutritionBonus,
      0,
      100,
    );
    ranch.lastFeedProgram = definition.id;
    ranch.lastManagedDayKey = game.dayKey;
    ranch.productBonusPercent = clamp(
      Math.floor((ranch.herdHealth - 50) / 4) +
        (ranch.discoveredTraits.includes("productive") ? 8 : 0),
      0,
      30,
    );
    const roll = hashText(
      `${game.seed}:${game.dayKey}:trait:${definition.id}`,
    ) % 100;
    let discovered: HomesteadAnimalTraitId | null = null;
    if (roll < definition.traitChance) {
      const start = hashText(`${game.seed}:${game.dayKey}:trait-id`) %
        HOMESTEAD_ANIMAL_TRAIT_IDS.length;
      const candidates = HOMESTEAD_ANIMAL_TRAIT_IDS.map(
        (_, index) =>
          HOMESTEAD_ANIMAL_TRAIT_IDS[
            (start + index) % HOMESTEAD_ANIMAL_TRAIT_IDS.length
          ]!,
      );
      discovered = candidates.find(
        (traitId) => !ranch.discoveredTraits.includes(traitId),
      ) ?? null;
      if (discovered) {
        ranch.discoveredTraits.push(discovered);
        unlockCollection(game, `ranch:${discovered}`, effectiveNow);
      }
    }
    const rewardProductId: RanchProductId = localTownId === "frostpeak"
      ? "snow_egg"
      : "egg";
    economy.ranchProducts[rewardProductId] +=
      1 +
      (ranch.discoveredTraits.includes("productive") ? 1 : 0) +
      Math.floor(ranch.productBonusPercent / 15);
    ranchChanged = true;
    game.statistics.herdProgramsCompleted += 1;
    addSeasonScore(game, 3, "specializations");
    addLog(
      game,
      "ranch",
      `执行${definition.name}，牧群健康达到 ${ranch.herdHealth}${
        discovered ? `，发现特质“${HOMESTEAD_ANIMAL_TRAIT_NAMES[discovered]}”` : ""
      }。`,
      effectiveNow,
    );
    advanceTownRhythmForSector(game, "ranch", effectiveNow);
  } else if (action.type === "homestead_upgrade_mine_protection") {
    const mine = game.specializations.mine;
    if (mine.protectionLevel >= 3) {
      throw new HomesteadRuleError(
        "HOMESTEAD_FACILITY_MAX_LEVEL",
        "矿山防护已经达到最高等级",
      );
    }
    const level = mine.protectionLevel + 1;
    const coinCost = [0, 250, 600, 1_200][level]!;
    const ironIngotCost = [0, 1, 2, 3][level]!;
    const miningKitCost = level >= 2 ? 1 : 0;
    const alloyGoodId = localGoodId(localTownId, "iron_ingot");
    const kitGoodId = localGoodId(localTownId, "mining_kit");
    if (
      economy.coins < coinCost ||
      game.goods[alloyGoodId] < ironIngotCost ||
      game.goods[kitGoodId] < miningKitCost
    ) {
      throw new HomesteadRuleError(
        "HOMESTEAD_NOT_ENOUGH_RESOURCES",
        "矿山防护升级所需金币或加工品不足",
      );
    }
    economy.coins -= coinCost;
    economy.farmRevision += 1;
    farmChanged = true;
    game.goods[alloyGoodId] -= ironIngotCost;
    game.goods[kitGoodId] -= miningKitCost;
    mine.protectionLevel = level;
    mine.oreBonusPercent = clamp(
      mine.protectionLevel * 5 + mine.discoveredLayers.length * 3,
      0,
      25,
    );
    addSeasonScore(game, 5, "specializations");
    addLog(
      game,
      "mine",
      `矿山防护提升到 ${level} 级，后续采掘产量加成更新为 +${mine.oreBonusPercent}%。`,
      effectiveNow,
    );
  } else if (action.type === "homestead_survey_layer") {
    const mine = game.specializations.mine;
    const definition = HOMESTEAD_MINE_LAYERS[action.layerId];
    if (!definition) {
      throw new HomesteadRuleError(
        "HOMESTEAD_INVALID_ACTION",
        "未知的矿层",
      );
    }
    specializationDone(mine.lastManagedDayKey, game.dayKey);
    if (
      (definition.requiredResearch &&
        !hasResearch(game, definition.requiredResearch)) ||
      mine.protectionLevel < definition.requiredProtection
    ) {
      throw new HomesteadRuleError(
        "HOMESTEAD_SPECIALIZATION_LOCKED",
        "研究或矿山防护等级不足",
      );
    }
    const surveyKitId = localGoodId(localTownId, "mining_kit");
    if (game.goods[surveyKitId] < definition.kitCost) {
      throw new HomesteadRuleError(
        "HOMESTEAD_NOT_ENOUGH_RESOURCES",
        "矿工防护套装不足",
      );
    }
    game.goods[surveyKitId] -= definition.kitCost;
    const geologyBonus = hasResearch(game, "geology") ? 1 : 0;
    mine.surveyProgress += definition.progressReward + geologyBonus;
    mine.lastManagedDayKey = game.dayKey;
    if (!mine.discoveredLayers.includes(definition.id)) {
      mine.discoveredLayers.push(definition.id);
    }
    mine.oreBonusPercent = clamp(
      mine.protectionLevel * 5 + mine.discoveredLayers.length * 3,
      0,
      25,
    );
    const rewardDepositId = localTownId === "frostpeak"
      ? FROSTPEAK_MINE_LAYER_REWARDS[action.layerId]
      : definition.rewardDepositId;
    economy.mineOres[rewardDepositId] +=
      definition.rewardQuantity +
      (hasResearch(game, "deep_mining") && definition.id !== "shallow" ? 1 : 0) +
      (mine.oreBonusPercent >= 15 ? 1 : 0);
    mineChanged = true;
    game.statistics.surveysCompleted += 1;
    addSeasonScore(game, 3 + definition.requiredProtection, "specializations");
    unlockCollection(game, `mine:${definition.id}`, effectiveNow);
    addLog(
      game,
      "mine",
      `完成${definition.name}勘探，获得 ${definition.rewardQuantity} 份${rewardDepositId}线索。`,
      effectiveNow,
    );
    advanceTownRhythmForSector(game, "mine", effectiveNow);
  } else if (action.type === "homestead_talk_npc") {
    const npc = game.npcs.find(({ npcId }) => npcId === action.npcId);
    const definition = HOMESTEAD_NPCS[action.npcId];
    const localNpcIds = npcIdsForTown(
      game.townId ?? game.townNetwork.activeTownId,
    );
    if (!npc || !definition || !localNpcIds.includes(action.npcId)) {
      throw new HomesteadRuleError(
        "HOMESTEAD_NPC_NOT_FOUND",
        "庄园顾问不存在",
      );
    }
    if (!definition.topics.includes(action.topicId)) {
      throw new HomesteadRuleError(
        "HOMESTEAD_NPC_TOPIC_NOT_FOUND",
        "该顾问无法讨论这个主题",
      );
    }
    if (npc.lastConversationDayKey === game.dayKey) {
      throw new HomesteadRuleError(
        "HOMESTEAD_NPC_ALREADY_TALKED",
        "今天已经与该顾问深入交流过",
      );
    }
    const networkBonus = hasResearch(game, "civic_network") ? 3 : 0;
    npc.affinity = clamp(npc.affinity + 5 + networkBonus, 0, 100);
    npc.trust = clamp(Math.floor(npc.affinity / 20), 0, 5);
    npc.lastConversationDayKey = game.dayKey;
    npc.lastTopicId = action.topicId;
    npc.lastDialogue = topicDialogue(game, action.npcId, action.topicId);
    const sectorId: HomesteadSectorId = definition.topics.includes("soil")
      ? "farm"
      : definition.topics.includes("nutrition")
        ? "ranch"
        : "mine";
    const durationTopic = ["rotation", "traits", "safety"].includes(
      action.topicId,
    );
    const guidanceStrength = 2 + npc.trust;
    game.advisorGuidance[sectorId] = {
      dayKey: game.dayKey,
      npcId: npc.npcId,
      topicId: action.topicId,
      sectorId,
      yieldPercent: durationTopic ? 1 : guidanceStrength,
      durationPercent: durationTopic ? -guidanceStrength : 0,
      label: `${definition.name}指导：${durationTopic ? `工期 -${guidanceStrength}%` : `产出 +${guidanceStrength}%`}`,
    };
    addNpcFact(
      npc,
      `${action.topicId}:${game.dayKey}`,
      npc.lastDialogue,
      effectiveNow,
      hasResearch(game, "civic_network") ? 8 : 2,
    );
    if (npc.trust >= 2) {
      unlockCollection(game, `npc:${npc.npcId}`, effectiveNow);
    }
    if (npc.trust >= 5) {
      unlockCollection(game, `npc:${npc.npcId}:trusted`, effectiveNow);
    }
    game.statistics.npcConversations += 1;
    addSeasonScore(game, 2, "community");
    addLog(
      game,
      "npc",
      `${definition.name}：${npc.lastDialogue} 今日${sectorId === "farm" ? "农场" : sectorId === "ranch" ? "牧场" : "矿山"}${durationTopic ? `工期 -${guidanceStrength}%` : `产出 +${guidanceStrength}%`}。`,
      effectiveNow,
    );
  } else if (
    action.type === "homestead_claim_honor_reward" ||
    action.type === "homestead_claim_season_reward"
  ) {
    synchronizeHonorCollections(game, effectiveNow);
    const milestone = HOMESTEAD_HONOR_MILESTONES[action.milestoneId];
    if (!milestone) {
      throw new HomesteadRuleError(
        "HOMESTEAD_INVALID_ACTION",
        "荣誉里程碑不存在",
      );
    }
    if (game.honor.claimedMilestones.includes(milestone.id)) {
      throw new HomesteadRuleError(
        "HOMESTEAD_SEASON_REWARD_CLAIMED",
        "荣誉奖励已经领取",
      );
    }
    if (
      game.honor.score < milestone.score ||
      (
        milestone.id === "legend" &&
        !hasResearch(game, "seasonal_mastery")
      )
    ) {
      throw new HomesteadRuleError(
        "HOMESTEAD_SEASON_REWARD_LOCKED",
        milestone.id === "legend" && !hasResearch(game, "seasonal_mastery")
          ? "完成本地荣誉研究后才能领取传奇奖励"
          : "图鉴荣誉分尚未达到领取条件",
      );
    }
    economy.coins += milestone.coinReward;
    economy.farmRevision += 1;
    farmChanged = true;
    game.researchPoints += milestone.researchReward;
    if (milestone.goodReward) {
      const rewardGoodId = localGoodId(
        localTownId,
        milestone.goodReward.itemId,
      );
      game.goods[rewardGoodId] +=
        milestone.goodReward.quantity;
    }
    if (milestone.id === "legend") {
      game.townNetwork.merchantRenown += 2;
    }
    game.honor.claimedMilestones.push(milestone.id);
    game.statistics.honorRewardsClaimed += 1;
    unlockCollection(game, `honor:${milestone.id}`, effectiveNow);
    addLog(
      game,
      "honor",
      `领取永久荣誉“${milestone.name}”。`,
      effectiveNow,
    );
  } else if (action.type === "homestead_upgrade_infrastructure") {
    const definition = HOMESTEAD_INFRASTRUCTURE[action.infrastructureId];
    if (
      !definition ||
      !infrastructureIdsForTown(localTownId).includes(action.infrastructureId)
    ) {
      throw new HomesteadRuleError(
        "HOMESTEAD_INVALID_ACTION",
        "该基础设施不属于当前城镇",
      );
    }
    const currentLevel = game.infrastructure[action.infrastructureId];
    const upgrade = infrastructureUpgradeCost(definition, currentLevel);
    if (!upgrade) {
      throw new HomesteadRuleError(
        "HOMESTEAD_FACILITY_MAX_LEVEL",
        "该基础设施已经达到最高等级",
      );
    }
    const requiredCapability: HomesteadResearchCapability =
      action.infrastructureId === "river_irrigation" ||
        action.infrastructureId === "geothermal_greenhouse"
        ? "precision_irrigation"
        : action.infrastructureId === "cooperative_cold_storage" ||
            action.infrastructureId === "avalanche_command"
          ? "cooperative_logistics"
          : "estate_engineering";
    if (upgrade.level >= 2 && !hasResearch(game, requiredCapability)) {
      throw new HomesteadRuleError(
        "HOMESTEAD_RESEARCH_LOCKED",
        "二级及以上基础设施需要先完成对应本地研究",
      );
    }
    const alloyGoodId = localGoodId(localTownId, "iron_ingot");
    if (
      game.reputation < definition.requiredReputation ||
      economy.coins < upgrade.coinCost ||
      game.researchPoints < upgrade.researchCost ||
      game.goods[alloyGoodId] < upgrade.alloyCost
    ) {
      throw new HomesteadRuleError(
        "HOMESTEAD_NOT_ENOUGH_RESOURCES",
        "基础设施升级所需声望、金币、研究点或本地合金不足",
      );
    }
    economy.coins -= upgrade.coinCost;
    economy.farmRevision += 1;
    farmChanged = true;
    game.researchPoints -= upgrade.researchCost;
    game.goods[alloyGoodId] -= upgrade.alloyCost;
    game.infrastructure[action.infrastructureId] = upgrade.level;
    unlockCollection(
      game,
      `infrastructure:${action.infrastructureId}:${upgrade.level}`,
      effectiveNow,
    );
    addLog(
      game,
      "facility",
      `${definition.name}升级到 LV${upgrade.level}，其效果已计入三业生产规则。`,
      effectiveNow,
    );
  } else if (action.type === "homestead_upgrade_resilience") {
    if (!HOMESTEAD_RESILIENCE_IDS.includes(action.resilienceId)) {
      throw new HomesteadRuleError(
        "HOMESTEAD_INVALID_ACTION",
        "未知的庄园韧性设施",
      );
    }
    const upgrade = resilienceUpgrade(
      action.resilienceId,
      game.resilience[action.resilienceId],
    );
    if (!upgrade) {
      throw new HomesteadRuleError(
        "HOMESTEAD_FACILITY_MAX_LEVEL",
        "韧性设施已经达到最高等级",
      );
    }
    const resilienceGoodId = localGoodId(localTownId, "iron_ingot");
    if (
      economy.coins < upgrade.coinCost ||
      game.researchPoints < upgrade.researchCost ||
      game.goods[resilienceGoodId] < upgrade.ironIngotCost
    ) {
      throw new HomesteadRuleError(
        "HOMESTEAD_NOT_ENOUGH_RESOURCES",
        "升级所需金币、研究点或铁锭不足",
      );
    }
    economy.coins -= upgrade.coinCost;
    economy.farmRevision += 1;
    farmChanged = true;
    game.researchPoints -= upgrade.researchCost;
    game.goods[resilienceGoodId] -= upgrade.ironIngotCost;
    game.resilience[action.resilienceId] = upgrade.level;
    addSeasonScore(game, 6, "community");
    addLog(
      game,
      "facility",
      `${HOMESTEAD_RESILIENCE[action.resilienceId].name}升级到 ${upgrade.level} 级。`,
      effectiveNow,
    );
  } else if (action.type === "homestead_activate_emergency_boost") {
    const operation = HOMESTEAD_EMERGENCY_OPERATIONS[action.sectorId];
    if (!operation) {
      throw new HomesteadRuleError(
        "HOMESTEAD_INVALID_ACTION",
        "未知的灾期增产行动",
      );
    }
    if (!game.disaster) {
      throw new HomesteadRuleError(
        "HOMESTEAD_SPECIALIZATION_LOCKED",
        "仅在灾害持续期间可以启动应急增产",
      );
    }
    if (game.emergencyBoosts[action.sectorId]) {
      throw new HomesteadRuleError(
        "HOMESTEAD_DAILY_SPECIALIZATION_DONE",
        "本次灾害已经启动过该板块的应急增产",
      );
    }
    const localizedCosts = operation.costs.map((resource) =>
      localizeResource(localTownId, resource)
    );
    const changed = consumeResources(game, economy, localizedCosts);
    farmChanged ||= changed.farmChanged;
    ranchChanged ||= changed.ranchChanged;
    mineChanged ||= changed.mineChanged;
    game.emergencyBoosts[action.sectorId] = true;
    addSeasonScore(game, 3, "specializations");
    addLog(
      game,
      action.sectorId,
      `启动灾期行动“${operation.name}”：产量 +${operation.yieldBonusPercent}%，工期 ${operation.durationBonusPercent}%。`,
      effectiveNow,
    );
  } else {
    throw new HomesteadRuleError(
      "HOMESTEAD_INVALID_ACTION",
      "未知的庄园操作",
    );
  }

  if (farmChanged && economy.farmRevision === linkedEconomy.farmRevision) {
    economy.farmRevision += 1;
  }
  if (ranchChanged) economy.ranchRevision += 1;
  if (mineChanged) economy.mineRevision += 1;
  awardMerchantRenownMilestones(game, effectiveNow);
  synchronizeHonorCollections(game, effectiveNow);
  updateAdviceAfterAction(game, economy, effectiveNow);
  finishMutation(game, effectiveNow);
  return {
    homestead: game,
    economy,
    farmChanged,
    ranchChanged,
    mineChanged,
  };
}

function resourceView(
  game: HomesteadGameState,
  economy: HomesteadLinkedEconomy,
  resource: HomesteadResource,
): HomesteadResourceView {
  const available = resourceAvailable(game, economy, resource);
  return {
    ...resource,
    available,
    sufficient: available >= resource.quantity,
  };
}

function townEstateView(
  game: HomesteadGameState,
  account: EstateAccountState,
  townId: HomesteadTownId,
  now: number,
): HomesteadTownEstateView {
  const progress = account.townProgress[townId];
  const unlock = getEstateTownUnlockStatus(account, townId);
  const active = account.activeTownId === townId;
  const route = active
    ? null
    : getTownRoute(account.activeTownId, townId);
  const hasRailPass = account.merchantInventory.rail_pass > 0;
  const payableFare = route
    ? hasRailPass ? Math.ceil(route.coinFare * 0.5) : route.coinFare
    : 0;
  const logisticsBlocked = isHomesteadLogisticsBlocked(game);
  const localTown = game.townNetwork.towns[townId];
  const frostpeakTownView =
    active && townId === "frostpeak"
      ? (() => {
          const inventory = structuredClone(localTown.inventory);
          const reputation = Math.max(
            game.reputation,
            localTown.reputation,
          );
          const sectors = HOMESTEAD_TOWN_SECTOR_IDS.map((sectorId) => {
            const sector = localTown.sectors[sectorId];
            const definition = HOMESTEAD_FROSTPEAK_SECTORS[sectorId];
            const ready = Boolean(
              sector.job && sector.job.completesAt <= now,
            );
            const progress = !sector.job
              ? 0
              : Math.max(
                  0,
                  Math.min(
                    1,
                    (now - sector.job.startedAt) /
                      Math.max(
                        1,
                        sector.job.completesAt - sector.job.startedAt,
                      ),
                  ),
                );
            const upgrade = townSectorUpgrade(sector);
            return {
              ...structuredClone(sector),
              definition,
              ready,
              progress,
              outputQuantity:
                definition.output.quantity + sector.level - 1,
              canStart:
                sector.job === null &&
                (
                  definition.input === null ||
                  inventory[definition.input.itemId] >=
                    definition.input.quantity
                ),
              canCollect: ready,
              nextUpgrade: upgrade
                ? {
                    ...upgrade,
                    canUpgrade:
                      sector.job === null &&
                      account.coins >= upgrade.coinCost &&
                      reputation >= upgrade.reputationRequired &&
                      inventory.frost_crystal >= upgrade.crystalCost,
                  }
                : null,
            };
          });
          const currentProblem =
            HOMESTEAD_FROSTPEAK_PROBLEMS.find(
              ({ id }) => !localTown.resolvedProblemIds.includes(id),
            ) ?? null;
          const currentProblemView = currentProblem
            ? {
                ...currentProblem,
                requirementsView: currentProblem.requirements.map(
                  (requirement) => ({
                    ...requirement,
                    available: inventory[requirement.itemId],
                    sufficient:
                      inventory[requirement.itemId] >= requirement.quantity,
                  }),
                ),
                canResolve: townRequirementsSufficient(
                  localTown,
                  currentProblem.requirements,
                ),
              }
            : null;
          const nextLandmark =
            HOMESTEAD_FROSTPEAK_LANDMARK_STAGES.find(
              ({ stage }) => stage === localTown.landmarkStage + 1,
            ) ?? null;
          const nextLandmarkView = nextLandmark
            ? {
                ...nextLandmark,
                requirementsView: nextLandmark.requirements.map(
                  (requirement) => ({
                    ...requirement,
                    available: inventory[requirement.itemId],
                    sufficient:
                      inventory[requirement.itemId] >= requirement.quantity,
                  }),
                ),
                canRestore:
                  localTown.resolvedProblemIds.length >=
                    nextLandmark.requiredProblems &&
                  reputation >= nextLandmark.requiredReputation &&
                  account.coins >= nextLandmark.coinCost &&
                  townRequirementsSufficient(
                    localTown,
                    nextLandmark.requirements,
                  ),
              }
            : null;
          return {
            reputation,
            inventory,
            sectors,
            currentProblem: currentProblemView,
            nextLandmark: nextLandmarkView,
          };
        })()
      : null;
  return {
    definition: HOMESTEAD_TOWNS[townId],
    active,
    unlocked: unlock.unlocked,
    canUnlock: unlock.canUnlock,
    unlockCoinCost: unlock.coinCost,
    unlockMissing: unlock.missing,
    travel: route
      ? {
          routeName: route.name,
          mode: route.mode,
          baseFare: route.coinFare,
          payableFare,
          canTravel:
            unlock.unlocked &&
            account.coins >= payableFare &&
            !logisticsBlocked,
          reason: !unlock.unlocked
            ? "城镇尚未解锁"
            : logisticsBlocked
              ? "当前城镇交通受持续灾害影响"
            : account.coins < payableFare
              ? "交通费用所需金币不足"
              : null,
        }
      : null,
    reputation:
      frostpeakTownView?.reputation ??
      (active ? game.reputation : progress?.localReputation ?? 0),
    landmarkStage: active
      ? game.townNetwork.towns[townId].landmarkStage
      : progress?.landmarkStage ?? 0,
    landmarkComplete:
      (active
        ? game.townNetwork.towns[townId].landmarkStage
        : progress?.landmarkStage ?? 0) >=
      (townId === "frostpeak"
        ? HOMESTEAD_FROSTPEAK_LANDMARK_STAGES.length
        : 3),
    inventory: frostpeakTownView?.inventory ?? townResourceCounts(),
    sectors: frostpeakTownView?.sectors ?? [],
    currentProblem: frostpeakTownView?.currentProblem ?? null,
    nextLandmark: frostpeakTownView?.nextLandmark ?? null,
  };
}

export function getHomesteadGameView(
  state: HomesteadGameState,
  economy: HomesteadLinkedEconomy,
  now: number,
): HomesteadGameView {
  const game = refreshHomesteadGame(state, now);
  synchronizeHonorCollections(game, now);
  const activeTownId =
    economy.activeTownId ??
    game.townId ??
    game.townNetwork.activeTownId;
  game.townNetwork.activeTownId = activeTownId;
  const account = createEstateAccount({
    ownerId: game.ownerId,
    ownerName: game.ownerName,
    now: game.createdAt,
    coins: economy.coins,
    researchPoints: game.researchPoints,
    merchantRenown:
      economy.merchantRenown ?? game.townNetwork.merchantRenown,
    unlockedResearchIds: game.research.unlocked,
  });
  account.revision = economy.accountRevision ?? 0;
  account.updatedAt = game.updatedAt;
  account.activeTownId = activeTownId;
  account.coins = economy.coins;
  account.researchPoints = game.researchPoints;
  account.townResearch[activeTownId] = {
    points: game.researchPoints,
    unlockedIds: [...game.research.unlocked],
  };
  account.unlockedResearchIds = [...game.research.unlocked];
  account.merchantRenown =
    economy.merchantRenown ?? game.townNetwork.merchantRenown;
  account.townProgress = structuredClone(
    economy.townProgress ?? {
      greenvale: {
        unlocked: true,
        unlockedAt: game.createdAt,
        localReputation:
          activeTownId === "greenvale" ? game.reputation : 0,
        farmLevel: 1,
        ranchLevel: 1,
        mineLevel: 1,
        landmarkStage: game.townNetwork.towns.greenvale.landmarkStage,
        lastVisitedAt: activeTownId === "greenvale" ? now : null,
      },
      ...(activeTownId === "frostpeak"
        ? {
            frostpeak: {
              unlocked: true,
              unlockedAt: game.createdAt,
              localReputation: game.reputation,
              farmLevel: 1,
              ranchLevel: 1,
              mineLevel: 1,
              landmarkStage:
                game.townNetwork.towns.frostpeak.landmarkStage,
              lastVisitedAt: now,
            },
          }
        : {}),
    },
  );
  if (economy.unlockedTownIds) {
    for (const townId of economy.unlockedTownIds) {
      const progress = account.townProgress[townId];
      account.townProgress[townId] = progress ?? {
        unlocked: true,
        unlockedAt: now,
        localReputation: 0,
        farmLevel: 1,
        ranchLevel: 1,
        mineLevel: 1,
        landmarkStage: 0,
        lastVisitedAt: null,
      };
      account.townProgress[townId]!.unlocked = true;
    }
  }
  if (economy.merchantInventory) {
    account.merchantInventory = structuredClone(economy.merchantInventory);
  }
  if (economy.purchaseLedger) {
    account.purchaseLedger = structuredClone(economy.purchaseLedger);
  }
  if (economy.logistics) {
    account.logistics = structuredClone(economy.logistics);
  }
  if (economy.travelLogs) {
    account.travelLogs = structuredClone(economy.travelLogs);
  }
  if (economy.shipments) {
    account.shipments = structuredClone(economy.shipments);
  }
  account.shopRecommendationId =
    economy.shopRecommendationId ??
    game.advice.merchantRecommendationId ??
    null;
  account.shopRecommendationSource =
    economy.shopRecommendationSource ?? "rules";
  if (game.advice.dayKey !== game.dayKey || game.advice.source === "rules") {
    game.advice = ruleAdvice(game, economy, now);
  }
  const researchUnlocked = new Set(game.research.unlocked);
  const logisticsRemaining = Math.max(
    0,
    account.logistics.capacity - account.logistics.used,
  );
  const logisticsBlocked = isHomesteadLogisticsBlocked(game);
  const currentEventDisaster =
    game.disaster &&
      (
        game.disaster.contentEventId ??
        game.disaster.eventId
      ) === game.worldEvent.eventId
      ? game.disaster
      : null;
  const reputationPenaltyPaid =
    game.disaster?.reputationPenaltyPaid ?? 0;
  const reputationPenaltyContinues =
    game.disaster !== null &&
    !game.disaster.mitigated &&
    reputationPenaltyPaid < 12;
  const nextDisasterSeverity = game.disaster
    ? Math.max(
        game.disaster.severity,
        clamp(
          1 + Math.floor((game.disaster.unresolvedDays + 1) / 2),
          1,
          3,
        ),
      )
    : 0;
  const nextReputationLoss =
    game.disaster && reputationPenaltyContinues
      ? Math.min(
          game.reputation,
          12 - reputationPenaltyPaid,
          nextDisasterSeverity * 2,
        )
      : 0;
  const rhythmDefinition = townRhythmDefinition(activeTownId);
  const rhythmState = refreshHomesteadTownRhythmState(
    game.townRhythm,
    game.dayKey,
  );
  const nextRhythmStep = rhythmState.progress >= 3
    ? null
    : rhythmDefinition.steps[rhythmState.progress as 0 | 1 | 2];
  const rhythmBlockedToday = rhythmState.progress >= 3
    ? false
    : rhythmDefinition.steps
      .slice(rhythmState.progress)
      .some(
        (step) =>
          game.specializations[step.sectorId].lastManagedDayKey === game.dayKey,
      );
  return {
    kind: "homestead",
    version: HOMESTEAD_STATE_VERSION,
    revision: game.revision,
    serverTime: now,
    ownerId: game.ownerId,
    ownerName: game.ownerName,
    reputation: game.reputation,
    merchantRenown: account.merchantRenown,
    researchPoints: game.researchPoints,
    coins: economy.coins,
    accountRevision: account.revision,
    activeTownId,
    towns: HOMESTEAD_TOWN_IDS.map((townId) =>
      townEstateView(game, account, townId, now)
    ),
    plannedTowns: PLANNED_TOWN_PREVIEWS,
    logistics: structuredClone(account.logistics),
    travelLogs: structuredClone(account.travelLogs),
    intertownLogistics: {
      inventory: structuredClone(game.cargoInventory),
      routes: ESTATE_CARGO_IDS.map((cargoId) => {
        const cargo = ESTATE_CARGO_DEFINITIONS[cargoId];
        const requirementsView = cargo.manifest.map((resource) =>
          resourceView(game, economy, resource as HomesteadResource)
        );
        const pendingSameRoute = account.shipments.filter(
          (shipment) =>
            shipment.cargoId === cargoId && shipment.collectedAt === null,
        ).length;
        const disabledReason = account.activeTownId !== cargo.fromTownId
          ? `需在${TOWN_DEFINITIONS[cargo.fromTownId].name}装箱`
          : !account.townProgress[cargo.toTownId]?.unlocked
            ? `请先开发${TOWN_DEFINITIONS[cargo.toTownId].name}`
            : cargo.requiredResearchId &&
                !account.townResearch[cargo.fromTownId].unlockedIds.includes(
                  cargo.requiredResearchId,
                )
              ? "尚未完成该高级货运所需的本地物流研究"
              : game.reputation < cargo.requiredReputation
                ? `当地声望达到 ${cargo.requiredReputation} 后开放`
              : cargo.requiredInfrastructureId &&
                  game.infrastructure[
                    cargo.requiredInfrastructureId as HomesteadInfrastructureId
                  ] < (cargo.requiredInfrastructureLevel ?? 1)
                ? `需要${HOMESTEAD_INFRASTRUCTURE[
                    cargo.requiredInfrastructureId as HomesteadInfrastructureId
                  ].name} LV${cargo.requiredInfrastructureLevel ?? 1}`
            : logisticsBlocked
              ? "持续灾害正在阻断城镇物流"
              : logisticsRemaining < cargo.logisticsCost
                ? "今日物流点不足"
                : economy.coins < cargo.coinCost
                  ? "货运费用所需金币不足"
                  : pendingSameRoute >= 2
                    ? "同一路线已有两箱货物待领取"
                    : requirementsView.some(({ sufficient }) => !sufficient)
                      ? "本地特色物资不足"
                      : null;
        return {
          ...cargo,
          requirementsView,
          canDispatch: disabledReason === null,
          disabledReason,
        };
      }),
      shipments: account.shipments.map((shipment) => {
        const definition = ESTATE_CARGO_DEFINITIONS[shipment.cargoId];
        const status = shipment.collectedAt !== null
          ? "collected" as const
          : now >= shipment.arrivesAt
            ? "ready" as const
            : "in_transit" as const;
        const disabledReason = status === "collected"
          ? "货物已领取"
          : status === "in_transit"
            ? "货物仍在运输途中"
            : account.activeTownId !== shipment.toTownId
              ? `请前往${TOWN_DEFINITIONS[shipment.toTownId].name}领取`
              : null;
        return {
          ...structuredClone(shipment),
          definition,
          status,
          canCollect: disabledReason === null,
          disabledReason,
        };
      }),
    },
    merchantShop: {
      recommendationSource: account.shopRecommendationSource,
      items: estateMerchantOfferIds(account, activeTownId).map(
        (itemId) => ESTATE_MERCHANT_ITEMS[itemId],
      ).map((item) => {
        const owned = account.merchantInventory[item.id];
        const purchasedToday =
          account.purchaseLedger.counts[item.id];
        const disabledReason =
          account.merchantRenown < item.requiredRenown
            ? `商会名望达到 ${item.requiredRenown} 后开放`
            : economy.coins < item.coinPrice
              ? "金币不足"
              : owned >= item.inventoryLimit
                ? "库存已达上限"
                : purchasedToday >= item.dailyPurchaseLimit
                  ? "今日限购次数已用完"
                  : null;
        return {
          ...item,
          owned,
          purchasedToday,
          canBuy: disabledReason === null,
          disabledReason,
          recommended: account.shopRecommendationId === item.id,
        };
      }),
    },
    activeGoodIds: homesteadGoodIdsForTown(activeTownId),
    valueRoutes: homesteadValueRouteIdsForTown(activeTownId).map((routeId) => {
      const route = HOMESTEAD_VALUE_ROUTES[routeId];
      const logisticsCost = route.stage >= 3 ? 2 : 1;
      const requirementsView = route.requirements.map((resource) =>
        resourceView(game, economy, resource)
      );
      const completedToday =
        game.valueRouteDayKeys[routeId] === game.dayKey;
      const missingResourceCount = requirementsView.filter(
        (resource) => !resource.sufficient,
      ).length;
      const disabledReason = completedToday
        ? "该增值项目今日已经完成"
        : route.requiredInfrastructure &&
            game.infrastructure[route.requiredInfrastructure.id] <
              route.requiredInfrastructure.level
          ? `需要${HOMESTEAD_INFRASTRUCTURE[route.requiredInfrastructure.id].name} LV${route.requiredInfrastructure.level}`
        : logisticsBlocked
          ? "持续灾害正在阻断城镇物流，请先处理事件"
          : logisticsRemaining < logisticsCost
            ? `今日物流点不足（需要 ${logisticsCost}，剩余 ${logisticsRemaining}）`
            : missingResourceCount > 0
              ? `缺少 ${missingResourceCount} 类原料，红色库存标签列出了缺口`
              : null;
      return {
        ...route,
        requirementsView,
        logisticsCost,
        completedToday,
        canComplete: disabledReason === null,
        disabledReason,
      };
    }),
    goods: structuredClone(game.goods),
    facilities: game.facilities.map((facility) => {
      const definition = HOMESTEAD_FACILITIES[facility.id];
      const ready = Boolean(
        facility.job && facility.job.completesAt <= now,
      );
      const progress = !facility.job
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              (now - facility.job.startedAt) /
                Math.max(1, facility.job.completesAt - facility.job.startedAt),
            ),
      );
      const upgrade = facility.built ? facilityUpgrade(facility) : null;
      const upgradeGoodId = localGoodId(activeTownId, "iron_ingot");
      return {
        ...structuredClone(facility),
        definition,
        ready,
        progress,
        canBuild:
          !facility.built &&
          game.reputation >= definition.requiredReputation &&
          economy.coins >= definition.coinCost,
        canAccelerate:
          facility.job !== null &&
          facility.job.completesAt > now &&
          facility.job.accelerated !== true &&
          account.merchantInventory.priority_dispatch > 0,
        accelerationDisabledReason: facility.job === null
          ? "该设施没有加工任务"
          : facility.job.completesAt <= now
            ? "任务已经完成"
            : facility.job.accelerated
              ? "每个任务最多使用一次"
              : account.merchantInventory.priority_dispatch < 1
                ? "未持有优先调度券"
                : null,
        maximumLevel: HOMESTEAD_MAX_FACILITY_LEVEL,
        nextUpgrade: upgrade
          ? {
              ...upgrade,
              requiredGoodId: upgradeGoodId,
              canUpgrade:
                facility.job === null &&
                economy.coins >= upgrade.coinCost &&
                game.goods[upgradeGoodId] >= upgrade.ironIngotCost &&
                hasResearch(game, upgrade.requiredResearch),
            }
          : null,
      };
    }),
    recipes: homesteadRecipeIdsForTown(activeTownId).map((recipeId) => {
      const recipe = HOMESTEAD_RECIPES[recipeId];
      const facility = game.facilities.find(
        (candidate) => candidate.id === recipe.facilityId,
      )!;
      const inputsView = recipe.inputs.map((resource) =>
        resourceView(game, economy, resource)
      );
      const speedMultiplier =
        1 +
        Math.max(0, facility.level - 1) * 0.2 +
        (hasResearch(game, "automation") ? 0.1 : 0);
      return {
        ...recipe,
        facilityBuilt: facility.built,
        facilityBusy: facility.job !== null,
        inputsView,
        canStart:
          facility.built &&
          facility.job === null &&
          economy.coins >= recipe.coinCost &&
          inputsView.every((resource) => resource.sufficient),
        effectiveDurationSeconds: Math.max(
          60,
          Math.round(recipe.durationSeconds / speedMultiplier),
        ),
        effectiveOutputQuantity: recipe.output.quantity,
      };
    }),
    orders: game.orders.map((order) => {
      const template = HOMESTEAD_ORDER_TEMPLATES[order.templateId];
      const requirements = template.requirements.map((resource) =>
        resourceView(game, economy, resource)
      );
      const missingResourceCount = requirements.filter(
        (resource) => !resource.sufficient,
      ).length;
      const disabledReason = order.completed
        ? "联合订单已经交付"
        : logisticsBlocked
          ? "持续灾害正在阻断城镇物流，请先处理事件"
          : logisticsRemaining < 2
            ? `今日物流点不足（需要 2，剩余 ${logisticsRemaining}）`
            : missingResourceCount > 0
              ? `缺少 ${missingResourceCount} 类物资，红色库存标签列出了缺口`
              : null;
      return {
        ...order,
        template,
        requirements,
        logisticsCost: 2,
        canComplete: disabledReason === null,
        disabledReason,
      };
    }),
    worldEvent: {
      ...structuredClone(game.worldEvent),
      definition: (() => {
        const definition =
          HOMESTEAD_WORLD_EVENTS[game.worldEvent.eventId];
        return {
          ...definition,
          options: definition.options.map((option) => {
            const costsView = option.costs.map((resource) =>
              resourceView(game, economy, resource)
            );
            const missingReputation = Math.max(
              0,
              -option.reputationReward - game.reputation,
            );
            const temporaryAlreadyUsed =
              option.resolvesHazard === false &&
              Boolean(currentEventDisaster?.temporaryOptionId);
            return {
              ...option,
              productionEffect: decisionProductionEffect(
                game.worldEvent.eventId,
                option.id,
              ),
              costsView,
              canChoose:
                game.worldEvent.selectedOptionId === null &&
                economy.coins >= option.coinCost &&
                missingReputation === 0 &&
                !temporaryAlreadyUsed &&
                costsView.every((resource) => resource.sufficient),
              missingCoins: Math.max(0, option.coinCost - economy.coins),
              missingReputation,
              temporaryAlreadyUsed,
            };
          }),
        };
      })(),
    },
    weather: {
      ...structuredClone(game.weather),
      forecastAvailable:
        game.resilience.weather_station >= 1 &&
        game.weather.forecastAvailable === true,
      forecast:
        game.resilience.weather_station >= 1
          ? structuredClone(game.weather.forecast ?? [])
          : [],
      definition: HOMESTEAD_WEATHER[game.weather.weatherId],
      tomorrow:
        game.resilience.weather_station >= 1
        ? game.weather.source === "rules"
          ? HOMESTEAD_WEATHER[
              weatherForDay(game.seed, nextDayKey(game.dayKey)).weatherId
            ]
          : (() => {
              const nextKey = nextDayKey(game.dayKey);
              const forecast = game.weather.forecast?.find((day) =>
                new Date(day.forecastStartAt + 8 * 60 * 60 * 1_000)
                  .toISOString().slice(0, 10) === nextKey
              );
              return forecast
                ? HOMESTEAD_WEATHER[forecast.weatherId]
                : null;
            })()
        : null,
    },
    disaster: game.disaster
      ? {
          ...structuredClone(game.disaster),
          nextReputationLoss,
          reputationPenaltyContinues,
        }
      : null,
    productionRules: getHomesteadProductionRules(game),
    resilience: HOMESTEAD_RESILIENCE_IDS.map((id) => {
      const level = game.resilience[id];
      const upgrade = resilienceUpgrade(id, level);
      const requiredGoodId = localGoodId(activeTownId, "iron_ingot");
      return {
        definition: HOMESTEAD_RESILIENCE[id],
        level,
        maximumLevel: 3,
        nextUpgrade: upgrade
          ? {
              ...upgrade,
              requiredGoodId,
              canUpgrade:
                economy.coins >= upgrade.coinCost &&
                game.researchPoints >= upgrade.researchCost &&
                game.goods[requiredGoodId] >= upgrade.ironIngotCost,
            }
          : null,
      };
    }),
    infrastructure: infrastructureIdsForTown(activeTownId).map((id) => {
      const definition = HOMESTEAD_INFRASTRUCTURE[id];
      const level = game.infrastructure[id];
      const upgrade = infrastructureUpgradeCost(definition, level);
      if (!upgrade) return { definition, level, nextUpgrade: null };
      const requiredCapability: HomesteadResearchCapability =
        id === "river_irrigation" || id === "geothermal_greenhouse"
          ? "precision_irrigation"
          : id === "cooperative_cold_storage" || id === "avalanche_command"
            ? "cooperative_logistics"
            : "estate_engineering";
      const requiredGoodId = localGoodId(activeTownId, "iron_ingot");
      const disabledReason = game.reputation < definition.requiredReputation
        ? `当地声望达到 ${definition.requiredReputation} 后开放`
        : upgrade.level >= 2 && !hasResearch(game, requiredCapability)
          ? "二级及以上需要对应本地研究"
          : economy.coins < upgrade.coinCost
            ? "金币不足"
            : game.researchPoints < upgrade.researchCost
              ? "本地研究点不足"
              : game.goods[requiredGoodId] < upgrade.alloyCost
                ? "本地合金不足"
                : null;
      return {
        definition,
        level,
        nextUpgrade: {
          ...upgrade,
          requiredGoodId,
          canUpgrade: disabledReason === null,
          disabledReason,
        },
      };
    }),
    townRhythm: {
      definition: rhythmDefinition,
      progress: rhythmState.progress,
      completedCycles: rhythmState.completedCycles,
      nextStepIndex: rhythmState.progress >= 3 ? null : rhythmState.progress,
      blockedToday: rhythmBlockedToday,
      activeEffect: homesteadTownRhythmEffect(
        rhythmState,
        activeTownId,
        game.dayKey,
      ),
    },
    emergencyOperations: (["farm", "ranch", "mine"] as const).map(
      (sectorId) => {
        const operation = HOMESTEAD_EMERGENCY_OPERATIONS[sectorId];
        const localizedCosts = operation.costs.map((resource) =>
          localizeResource(activeTownId, resource)
        );
        const costsView = localizedCosts.map((resource) =>
          resourceView(game, economy, resource)
        );
        return {
          ...operation,
          activated: game.emergencyBoosts[sectorId],
          costsView,
          logisticsCost: 1,
          canActivate:
            game.disaster !== null &&
            !game.emergencyBoosts[sectorId] &&
            logisticsRemaining >= 1 &&
            costsView.every((resource) => resource.sufficient),
        };
      },
    ),
    research: researchIdsForTown(activeTownId).map((nodeId) => {
      const definition = HOMESTEAD_RESEARCH[nodeId];
      const missingPrerequisites = definition.prerequisites.filter(
        (required) => !researchUnlocked.has(required),
      );
      const requirements = getHomesteadResearchRequirementProgress(
        game,
        definition,
      );
      const missingRequirements = requirements
        .filter((requirement) => !requirement.satisfied)
        .map(
          (requirement) =>
            `${requirement.label} ${requirement.current}/${requirement.required}`,
        );
      return {
        definition,
        unlocked: researchUnlocked.has(nodeId),
        canUnlock:
          !researchUnlocked.has(nodeId) &&
          missingPrerequisites.length === 0 &&
          missingRequirements.length === 0 &&
          game.reputation >= definition.requiredReputation &&
          game.researchPoints >= definition.researchCost,
        missingPrerequisites,
        requirements,
        missingRequirements,
      };
    }),
    specializations: {
      ...structuredClone(game.specializations),
      soilAmendmentGoodId: localGoodId(
        activeTownId,
        "soil_conditioner",
      ),
      cropFamilies: HOMESTEAD_CROP_FAMILY_IDS.map((cropFamily) => {
        const definition = HOMESTEAD_CROP_FAMILIES[cropFamily];
        return {
          definition: activeTownId === "frostpeak"
            ? {
                ...definition,
                example: "霜岭本地特色作物",
                rewardCropId: FROSTPEAK_CROP_FAMILY_REWARDS[cropFamily],
              }
            : definition,
          canPlan:
            game.specializations.farm.lastManagedDayKey !== game.dayKey,
          rotationImprovesSoil:
            game.specializations.farm.lastCropFamily !== null &&
            game.specializations.farm.lastCropFamily !== cropFamily,
        };
      }),
      feedPrograms: HOMESTEAD_FEED_PROGRAM_IDS.map((programId) => {
        const definition = HOMESTEAD_FEED_PROGRAMS[programId];
        const lockedByResearch = Boolean(
          definition.requiredResearch &&
            !hasResearch(game, definition.requiredResearch),
        );
        const requiredGoodId = definition.goodCost
          ? localGoodId(activeTownId, definition.goodCost.itemId)
          : null;
        const hasResources =
          !definition.goodCost ||
          game.goods[requiredGoodId!] >=
            definition.goodCost.quantity;
        return {
          definition,
          canRun:
            game.specializations.ranch.lastManagedDayKey !== game.dayKey &&
            !lockedByResearch &&
            hasResources,
          lockedByResearch,
          hasResources,
          requiredGoodId,
        };
      }),
      mineLayers: HOMESTEAD_MINE_LAYER_IDS.map((layerId) => {
        const baseDefinition = HOMESTEAD_MINE_LAYERS[layerId];
        const definition = activeTownId === "frostpeak"
          ? {
              ...baseDefinition,
              rewardDepositId: FROSTPEAK_MINE_LAYER_REWARDS[layerId],
            }
          : baseDefinition;
        const lockedByResearch = Boolean(
          definition.requiredResearch &&
            !hasResearch(game, definition.requiredResearch),
        );
        const lockedByProtection =
          game.specializations.mine.protectionLevel <
          definition.requiredProtection;
        const requiredKitGoodId = localGoodId(
          activeTownId,
          "mining_kit",
        );
        const hasResources =
          game.goods[requiredKitGoodId] >= definition.kitCost;
        return {
          definition,
          discovered:
            game.specializations.mine.discoveredLayers.includes(layerId),
          canSurvey:
            game.specializations.mine.lastManagedDayKey !== game.dayKey &&
            !lockedByResearch &&
            !lockedByProtection &&
            hasResources,
          lockedByResearch,
          lockedByProtection,
          hasResources,
          requiredKitGoodId,
        };
      }),
      canManageFarmToday:
        game.specializations.farm.lastManagedDayKey !== game.dayKey,
      canManageRanchToday:
        game.specializations.ranch.lastManagedDayKey !== game.dayKey,
      canManageMineToday:
        game.specializations.mine.lastManagedDayKey !== game.dayKey,
      nextProtectionUpgrade:
        game.specializations.mine.protectionLevel >= 3
          ? null
          : (() => {
              const level = game.specializations.mine.protectionLevel + 1;
              const coinCost = [0, 250, 600, 1_200][level]!;
              const ironIngotCost = [0, 1, 2, 3][level]!;
              const miningKitCost = level >= 2 ? 1 : 0;
              const alloyGoodId = localGoodId(activeTownId, "iron_ingot");
              const miningKitGoodId = localGoodId(
                activeTownId,
                "mining_kit",
              );
              return {
                level,
                coinCost,
                ironIngotCost,
                miningKitCost,
                alloyGoodId,
                miningKitGoodId,
                canUpgrade:
                  economy.coins >= coinCost &&
                  game.goods[alloyGoodId] >= ironIngotCost &&
                  game.goods[miningKitGoodId] >= miningKitCost,
              };
            })(),
    },
    npcs: game.npcs.map((npc) => ({
      ...structuredClone(npc),
      definition: HOMESTEAD_NPCS[npc.npcId],
      canTalkToday: npc.lastConversationDayKey !== game.dayKey,
    })),
    advisorGuidance: structuredClone(game.advisorGuidance),
    honor: {
      ...structuredClone(game.honor),
      progressPercent: clamp(
        Math.round(
          game.honor.score /
            HOMESTEAD_HONOR_MILESTONES.legend.score *
            100,
        ),
        0,
        100,
      ),
      milestones: HOMESTEAD_HONOR_MILESTONE_IDS.map((milestoneId) => {
        const definition = HOMESTEAD_HONOR_MILESTONES[milestoneId];
        const claimed = game.honor.claimedMilestones.includes(milestoneId);
        const lockedByResearch =
          milestoneId === "legend" &&
          !hasResearch(game, "seasonal_mastery");
        return {
          definition,
          claimed,
          lockedByResearch,
          canClaim:
            !claimed &&
            game.honor.score >= definition.score &&
            !lockedByResearch,
        };
      }),
    },
    season: {
      ...structuredClone(game.season),
      score: game.honor.score,
      claimedMilestones: structuredClone(game.honor.claimedMilestones),
      progressPercent: clamp(
        Math.round(
          game.honor.score /
            HOMESTEAD_HONOR_MILESTONES.legend.score *
            100,
        ),
        0,
        100,
      ),
      milestones: HOMESTEAD_SEASON_MILESTONE_IDS.map((milestoneId) => {
        const definition = HOMESTEAD_SEASON_MILESTONES[milestoneId];
        const claimed = game.honor.claimedMilestones.includes(milestoneId);
        return {
          definition,
          claimed,
          lockedByResearch:
            milestoneId === "legend" &&
            !hasResearch(game, "seasonal_mastery"),
          canClaim:
            !claimed &&
            game.honor.score >= definition.score &&
            (
              milestoneId !== "legend" ||
              hasResearch(game, "seasonal_mastery")
            ),
        };
      }),
    },
    collections: longTermCollectionDefinitions({
      townId: activeTownId,
      facilityIds: HOMESTEAD_FACILITY_IDS,
      facilityNames: Object.fromEntries(
        HOMESTEAD_FACILITY_IDS.map((id) => [id, HOMESTEAD_FACILITIES[id].name]),
      ),
      infrastructureIds: infrastructureIdsForTown(activeTownId),
      infrastructureNames: Object.fromEntries(
        infrastructureIdsForTown(activeTownId).map((id) => [
          id,
          HOMESTEAD_INFRASTRUCTURE[id].name,
        ]),
      ),
      recipeIds: homesteadRecipeIdsForTown(activeTownId),
      recipeNames: Object.fromEntries(
        homesteadRecipeIdsForTown(activeTownId).map((id) => [
          id,
          HOMESTEAD_RECIPES[id].name,
        ]),
      ),
    }).map((definition) => {
      const unlocked = game.collections.find(
        (entry) => entry.id === definition.id,
      );
      return {
        ...definition,
        unlocked: Boolean(unlocked),
        unlockedAt: unlocked?.unlockedAt ?? null,
      };
    }),
    advice: {
      ...structuredClone(game.advice),
      steps: structuredClone(
        game.advice.steps?.length === 3
          ? game.advice.steps
          : defaultAdviceSteps(game),
      ),
    },
    aiProfile: structuredClone(game.aiProfile ?? createAiProfile()),
    statistics: structuredClone(game.statistics),
    logs: structuredClone(game.logs),
    revisions: {
      farm: economy.farmRevision,
      ranch: economy.ranchRevision,
      mine: economy.mineRevision,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function validGoodCounts(value: unknown): value is HomesteadGoodCounts {
  return (
    isRecord(value) &&
    HOMESTEAD_GOOD_IDS.every(
      (id) => value[id] === undefined || isNonNegativeInteger(value[id]),
    )
  );
}

function validCargoCounts(
  value: unknown,
): value is Record<EstateCargoId, number> {
  return (
    isRecord(value) &&
    ESTATE_CARGO_IDS.every((id) => isNonNegativeInteger(value[id]))
  );
}

function validDecisionSectorEffect(value: unknown): boolean {
  return value === undefined || (
    isRecord(value) &&
    Number.isSafeInteger(value.yieldPercent) &&
    Number(value.yieldPercent) >= -100 &&
    Number(value.yieldPercent) <= 100 &&
    Number.isSafeInteger(value.durationPercent) &&
    Number(value.durationPercent) >= -100 &&
    Number(value.durationPercent) <= 100
  );
}

function validActiveDecisionEffect(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (
    !isRecord(value) ||
    typeof value.dayKey !== "string" ||
    !HOMESTEAD_WORLD_EVENT_IDS.includes(
      value.eventId as HomesteadWorldEventId,
    ) ||
    typeof value.optionId !== "string" ||
    !isRecord(value.effect) ||
    typeof value.effect.label !== "string" ||
    value.effect.label.length > 160
  ) {
    return false;
  }
  return validDecisionSectorEffect(value.effect.farm) &&
    validDecisionSectorEffect(value.effect.ranch) &&
    validDecisionSectorEffect(value.effect.mine);
}

function validOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined ||
    (typeof value === "number" && Number.isFinite(value));
}

function validOptionalNullableFiniteNumber(value: unknown): boolean {
  return value === undefined ||
    value === null ||
    (typeof value === "number" && Number.isFinite(value));
}

function validTownResourceCounts(
  value: unknown,
): value is HomesteadTownResourceCounts {
  return (
    isRecord(value) &&
    HOMESTEAD_TOWN_RESOURCE_IDS.every((id) =>
      isNonNegativeInteger(value[id])
    )
  );
}

function validTownEstate(
  value: unknown,
  townId: HomesteadTownId,
): value is HomesteadTownEstateState {
  if (
    !isRecord(value) ||
    value.townId !== townId ||
    !isNonNegativeInteger(value.reputation) ||
    !isNonNegativeInteger(value.landmarkStage) ||
    Number(value.landmarkStage) > HOMESTEAD_FROSTPEAK_LANDMARK_STAGES.length ||
    !validTownResourceCounts(value.inventory) ||
    !isRecord(value.sectors) ||
    !Array.isArray(value.resolvedProblemIds) ||
    value.resolvedProblemIds.some((id) => typeof id !== "string")
  ) {
    return false;
  }
  const sectors = value.sectors;
  return HOMESTEAD_TOWN_SECTOR_IDS.every((sectorId) => {
    const sector = sectors[sectorId];
    return (
      isRecord(sector) &&
      isNonNegativeInteger(sector.level) &&
      Number(sector.level) >= 1 &&
      Number(sector.level) <= 3 &&
      isNonNegativeInteger(sector.cycle) &&
      (
        sector.job === null ||
        (
          isRecord(sector.job) &&
          isNonNegativeInteger(sector.job.cycle) &&
          isNonNegativeInteger(sector.job.startedAt) &&
          isNonNegativeInteger(sector.job.completesAt) &&
          Number(sector.job.completesAt) > Number(sector.job.startedAt)
        )
      )
    );
  });
}

export function assertRestorableHomesteadGameState(
  value: unknown,
): asserts value is HomesteadGameState {
  if (
    !isRecord(value) ||
    value.kind !== "homestead" ||
    value.version !== HOMESTEAD_STATE_VERSION ||
    !isNonNegativeInteger(value.revision) ||
    typeof value.ownerId !== "string" ||
    typeof value.ownerName !== "string" ||
    typeof value.seed !== "string" ||
    !isNonNegativeInteger(value.createdAt) ||
    !isNonNegativeInteger(value.updatedAt) ||
    typeof value.dayKey !== "string" ||
    !isNonNegativeInteger(value.reputation) ||
    !isNonNegativeInteger(value.researchPoints) ||
    !validGoodCounts(value.goods) ||
    !Array.isArray(value.facilities) ||
    value.facilities.length !== HOMESTEAD_FACILITY_IDS.length ||
    !Array.isArray(value.orders) ||
    !isRecord(value.worldEvent) ||
    !isRecord(value.statistics) ||
    (
      value.nextLogId !== undefined &&
      (!Number.isSafeInteger(value.nextLogId) || Number(value.nextLogId) < 1)
    ) ||
    !Array.isArray(value.logs)
  ) {
    throw new Error("庄园存档结构无效");
  }

  if (
    value.cargoInventory !== undefined &&
    !validCargoCounts(value.cargoInventory)
  ) {
    throw new Error("跨城货栈存档无效");
  }
  if (
    value.townRhythm !== undefined &&
    (
      !isRecord(value.townRhythm) ||
      typeof value.townRhythm.dayKey !== "string" ||
      !Number.isSafeInteger(value.townRhythm.progress) ||
      Number(value.townRhythm.progress) < 0 ||
      Number(value.townRhythm.progress) > 3 ||
      !isNonNegativeInteger(value.townRhythm.completedCycles)
    )
  ) {
    throw new Error("城镇经营节奏存档无效");
  }
  if (!validActiveDecisionEffect(value.decisionEffect)) {
    throw new Error("庄园决策生产效果存档无效");
  }

  if (
    value.townId !== undefined &&
    !HOMESTEAD_TOWN_IDS.includes(value.townId as HomesteadTownId)
  ) {
    throw new Error("庄园城镇存档无效");
  }

  for (const [index, facility] of value.facilities.entries()) {
    if (
      !isRecord(facility) ||
      facility.id !== HOMESTEAD_FACILITY_IDS[index] ||
      typeof facility.built !== "boolean" ||
      (facility.level !== undefined &&
        (!isNonNegativeInteger(facility.level) ||
          Number(facility.level) > HOMESTEAD_MAX_FACILITY_LEVEL)) ||
      (facility.job !== null &&
        (!isRecord(facility.job) ||
          !HOMESTEAD_RECIPE_IDS.includes(
            facility.job.recipeId as HomesteadRecipeId,
          ) ||
          !isNonNegativeInteger(facility.job.startedAt) ||
          !isNonNegativeInteger(facility.job.completesAt) ||
          (facility.job.outputQuantity !== undefined &&
            (!isNonNegativeInteger(facility.job.outputQuantity) ||
              Number(facility.job.outputQuantity) < 1)) ||
          (facility.job.accelerated !== undefined &&
            typeof facility.job.accelerated !== "boolean") ||
          Number(facility.job.completesAt) <=
            Number(facility.job.startedAt)))
    ) {
      throw new Error("庄园设施存档无效");
    }
  }

  for (const order of value.orders) {
    if (
      !isRecord(order) ||
      typeof order.id !== "string" ||
      !HOMESTEAD_ORDER_TEMPLATE_IDS.includes(
        order.templateId as HomesteadOrderTemplateId,
      ) ||
      typeof order.dayKey !== "string" ||
      typeof order.completed !== "boolean"
    ) {
      throw new Error("庄园订单存档无效");
    }
  }

  if (
    !HOMESTEAD_WORLD_EVENT_IDS.includes(
      value.worldEvent.eventId as HomesteadWorldEventId,
    ) ||
    typeof value.worldEvent.dayKey !== "string" ||
    (value.worldEvent.selectedOptionId !== null &&
      typeof value.worldEvent.selectedOptionId !== "string") ||
    typeof value.worldEvent.narrative !== "string" ||
    !["rules", "llm"].includes(String(value.worldEvent.source)) ||
    (
      value.worldEvent.instanceId !== undefined &&
      (
        typeof value.worldEvent.instanceId !== "string" ||
        value.worldEvent.instanceId.length > 180
      )
    ) ||
    (
      value.worldEvent.rulesVersion !== undefined &&
      ![1, 2].includes(Number(value.worldEvent.rulesVersion))
    )
  ) {
    throw new Error("庄园世界事件存档无效");
  }
  const generatedParameters = value.worldEvent.parameters;
  if (
    (value.worldEvent.rulesVersion === 2) !==
      (generatedParameters !== undefined) ||
    (
      generatedParameters !== undefined &&
      (
        !isRecord(generatedParameters) ||
        !HOMESTEAD_GENERATED_EVENT_PACING_IDS.includes(
          generatedParameters.pacingId as HomesteadGeneratedEventPacingId,
        ) ||
        generatedParameters.durationDays !==
          (generatedParameters.pacingId === "two_day_follow_up" ? 2 : 1)
      )
    )
  ) {
    throw new Error("Invalid generated homestead event parameters");
  }
  if (
    (
      value.worldEvent.startedDayKey !== undefined &&
      typeof value.worldEvent.startedDayKey !== "string"
    ) ||
    (
      value.worldEvent.durationDays !== undefined &&
      (
        !isNonNegativeInteger(value.worldEvent.durationDays) ||
        Number(value.worldEvent.durationDays) < 1
      )
    ) ||
    (
      value.worldEvent.unresolvedDays !== undefined &&
      !isNonNegativeInteger(value.worldEvent.unresolvedDays)
    ) ||
    (
      value.worldEvent.severity !== undefined &&
      (
        !isNonNegativeInteger(value.worldEvent.severity) ||
        Number(value.worldEvent.severity) > 3
      )
    )
  ) {
    throw new Error("庄园世界事件持续状态无效");
  }
  if (
    value.weather !== undefined &&
    (
      !isRecord(value.weather) ||
      !HOMESTEAD_WEATHER_IDS.includes(
        value.weather.weatherId as HomesteadWeatherId,
      ) ||
      typeof value.weather.dayKey !== "string" ||
      (
        value.weather.source !== undefined &&
        !["live", "last_known_good", "fallback", "rules"].includes(
          String(value.weather.source),
        )
      ) ||
      !validOptionalFiniteNumber(value.weather.observedAt) ||
      !validOptionalFiniteNumber(value.weather.validUntil) ||
      (
        value.weather.anchorCity !== undefined &&
        typeof value.weather.anchorCity !== "string"
      ) ||
      !validOptionalNullableFiniteNumber(value.weather.temperatureC) ||
      !validOptionalNullableFiniteNumber(value.weather.humidityPercent) ||
      !validOptionalNullableFiniteNumber(value.weather.precipitationMm) ||
      !validOptionalNullableFiniteNumber(value.weather.windKph) ||
      (
        value.weather.conditionText !== undefined &&
        typeof value.weather.conditionText !== "string"
      ) ||
      (
        value.weather.stale !== undefined &&
        typeof value.weather.stale !== "boolean"
      ) ||
      (
        value.weather.mechanicsEnabled !== undefined &&
        typeof value.weather.mechanicsEnabled !== "boolean"
      ) ||
      (
        value.weather.alertsAvailable !== undefined &&
        typeof value.weather.alertsAvailable !== "boolean"
      ) ||
      (
        value.weather.forecastAvailable !== undefined &&
        typeof value.weather.forecastAvailable !== "boolean"
      ) ||
      (
        value.weather.forecast !== undefined &&
        (
          !Array.isArray(value.weather.forecast) ||
          value.weather.forecast.length > 10 ||
          value.weather.forecast.some((day) =>
            !isRecord(day) ||
            !Number.isFinite(day.forecastStartAt) ||
            !Number.isFinite(day.forecastEndAt) ||
            !HOMESTEAD_WEATHER_IDS.includes(
              day.weatherId as HomesteadWeatherId,
            ) ||
            typeof day.conditionCode !== "string" ||
            typeof day.conditionText !== "string" ||
            !Number.isFinite(day.temperatureMinC) ||
            !Number.isFinite(day.temperatureMaxC) ||
            !Number.isFinite(day.precipitationMm) ||
            !Number.isFinite(day.precipitationProbabilityPercent) ||
            !Number.isFinite(day.humidityPercent) ||
            !Number.isFinite(day.windSpeedKph)
          )
        )
      ) ||
      (
        value.weather.fallbackReason !== undefined &&
        value.weather.fallbackReason !== null &&
        typeof value.weather.fallbackReason !== "string"
      ) ||
      (
        value.weather.providerAttributions !== undefined &&
        (
          !Array.isArray(value.weather.providerAttributions) ||
          value.weather.providerAttributions.some(
            (entry) => typeof entry !== "string",
          )
        )
      ) ||
      (
        value.weather.liveHazards !== undefined &&
        (
          !Array.isArray(value.weather.liveHazards) ||
          value.weather.liveHazards.some(
            (hazard) =>
              !isRecord(hazard) ||
              typeof hazard.id !== "string" ||
              typeof hazard.name !== "string" ||
              typeof hazard.headline !== "string" ||
              !isNonNegativeInteger(hazard.severity) ||
              Number(hazard.severity) > 3 ||
              typeof hazard.affectsGameplay !== "boolean" ||
              (
                hazard.mechanicId !== undefined &&
                hazard.mechanicId !== null &&
                !HOMESTEAD_DISASTER_MECHANIC_IDS.includes(
                  hazard.mechanicId as
                    (typeof HOMESTEAD_DISASTER_MECHANIC_IDS)[number],
                )
              ) ||
              (
                hazard.expiresAt !== null &&
                (
                  typeof hazard.expiresAt !== "number" ||
                  !Number.isFinite(hazard.expiresAt)
                )
              ),
          )
        )
      )
    )
  ) {
    throw new Error("庄园天气状态无效");
  }
  if (
    value.disaster !== undefined &&
    value.disaster !== null &&
    (
      !isRecord(value.disaster) ||
      ![
        "mountain_seepage",
        "cold_snap",
        "heatwave",
        "windstorm",
        "hail",
        "drought",
      ].includes(
        String(value.disaster.eventId),
      ) ||
      (
        value.disaster.contentEventId !== undefined &&
        !HOMESTEAD_WORLD_EVENT_IDS.includes(
          value.disaster.contentEventId as HomesteadWorldEventId,
        )
      ) ||
      (
        value.disaster.providerAlertId !== undefined &&
        (
          typeof value.disaster.providerAlertId !== "string" ||
          value.disaster.providerAlertId.length === 0
        )
      ) ||
      typeof value.disaster.startedDayKey !== "string" ||
      !isNonNegativeInteger(value.disaster.remainingDays) ||
      Number(value.disaster.remainingDays) < 1 ||
      !isNonNegativeInteger(value.disaster.unresolvedDays) ||
      !isNonNegativeInteger(value.disaster.severity) ||
      Number(value.disaster.severity) < 1 ||
      Number(value.disaster.severity) > 3 ||
      typeof value.disaster.mitigated !== "boolean" ||
      (
        value.disaster.resolution !== null &&
        typeof value.disaster.resolution !== "string"
      ) ||
      (
        value.disaster.reputationPenaltyPaid !== undefined &&
        (
          !isNonNegativeInteger(
            value.disaster.reputationPenaltyPaid,
          ) ||
          Number(value.disaster.reputationPenaltyPaid) > 12
        )
      ) ||
      (
        value.disaster.temporaryOptionId !== undefined &&
        value.disaster.temporaryOptionId !== null &&
        (
          typeof value.disaster.temporaryOptionId !== "string" ||
          value.disaster.temporaryOptionId.length === 0
        )
      )
    )
  ) {
    throw new Error("庄园灾害状态无效");
  }
  if (
    value.resilience !== undefined &&
    (
      !isRecord(value.resilience) ||
      HOMESTEAD_RESILIENCE_IDS.some(
        (id) => {
          const level = (value.resilience as Record<string, unknown>)[id];
          return !isNonNegativeInteger(level) || Number(level) > 3;
        },
      )
    )
  ) {
    throw new Error("庄园韧性设施状态无效");
  }
  if (
    value.emergencyBoosts !== undefined &&
    (
      !isRecord(value.emergencyBoosts) ||
      ["farm", "ranch", "mine"].some(
        (id) =>
          typeof (value.emergencyBoosts as Record<string, unknown>)[id] !==
            "boolean",
      )
    )
  ) {
    throw new Error("庄园灾期增产状态无效");
  }
  if (
    value.handledWeatherAlertIds !== undefined &&
    (
      !Array.isArray(value.handledWeatherAlertIds) ||
      value.handledWeatherAlertIds.length > 64 ||
      value.handledWeatherAlertIds.some(
        (alertId) => typeof alertId !== "string" || alertId.length === 0,
      ) ||
      new Set(value.handledWeatherAlertIds).size !==
        value.handledWeatherAlertIds.length
    )
  ) {
    throw new Error("庄园天气预警处理记录无效");
  }

  if (value.research !== undefined) {
    if (
      !isRecord(value.research) ||
      !Array.isArray(value.research.unlocked) ||
      value.research.unlocked.some(
        (nodeId) =>
          !HOMESTEAD_RESEARCH_NODE_IDS.includes(
            nodeId as HomesteadResearchNodeId,
          ),
      ) ||
      new Set(value.research.unlocked).size !== value.research.unlocked.length
    ) {
      throw new Error("庄园研究存档无效");
    }
  }

  if (value.specializations !== undefined) {
    const specializations = value.specializations;
    if (
      !isRecord(specializations) ||
      !isRecord(specializations.farm) ||
      !isRecord(specializations.ranch) ||
      !isRecord(specializations.mine) ||
      !isNonNegativeInteger(specializations.farm.soilHealth) ||
      Number(specializations.farm.soilHealth) > 100 ||
      !isNonNegativeInteger(specializations.ranch.herdHealth) ||
      Number(specializations.ranch.herdHealth) > 100 ||
      !Array.isArray(specializations.ranch.discoveredTraits) ||
      specializations.ranch.discoveredTraits.some(
        (traitId) =>
          !HOMESTEAD_ANIMAL_TRAIT_IDS.includes(
            traitId as HomesteadAnimalTraitId,
          ),
      ) ||
      !isNonNegativeInteger(specializations.mine.protectionLevel) ||
      Number(specializations.mine.protectionLevel) > 3 ||
      !Array.isArray(specializations.mine.discoveredLayers) ||
      specializations.mine.discoveredLayers.some(
        (layerId) =>
          !HOMESTEAD_MINE_LAYER_IDS.includes(
            layerId as HomesteadMineLayerId,
          ),
      )
    ) {
      throw new Error("庄园三业专精存档无效");
    }
  }

  if (value.npcs !== undefined) {
    if (
      !Array.isArray(value.npcs) ||
      value.npcs.length !== 3 ||
      value.npcs.some((npc) =>
        !isRecord(npc) ||
        !HOMESTEAD_NPC_IDS.includes(npc.npcId as HomesteadNpcId) ||
        !isNonNegativeInteger(npc.affinity) ||
        Number(npc.affinity) > 100 ||
        !isNonNegativeInteger(npc.trust) ||
        Number(npc.trust) > 5 ||
        !Array.isArray(npc.facts) ||
        npc.facts.length > 8
      )
    ) {
      throw new Error("庄园顾问记忆存档无效");
    }
  }

  if (
    value.advisorGuidance !== undefined &&
    (
      !isRecord(value.advisorGuidance) ||
      HOMESTEAD_TOWN_SECTOR_IDS.some((sectorId) => {
        const guidance = (
          value.advisorGuidance as Record<string, unknown>
        )[sectorId];
        return guidance !== null && (
          !isRecord(guidance) ||
          guidance.sectorId !== sectorId ||
          typeof guidance.dayKey !== "string" ||
          !HOMESTEAD_NPC_IDS.includes(guidance.npcId as HomesteadNpcId) ||
          !HOMESTEAD_NPC_TOPIC_IDS.includes(
            guidance.topicId as HomesteadNpcTopicId,
          ) ||
          typeof guidance.yieldPercent !== "number" ||
          !Number.isFinite(guidance.yieldPercent) ||
          typeof guidance.durationPercent !== "number" ||
          !Number.isFinite(guidance.durationPercent) ||
          typeof guidance.label !== "string"
        );
      })
    )
  ) {
    throw new Error("庄园顾问指导状态无效");
  }

  if (
    value.infrastructure !== undefined &&
    (
      !isRecord(value.infrastructure) ||
      HOMESTEAD_INFRASTRUCTURE_IDS.some((id) => {
        const level = (
          value.infrastructure as Record<string, unknown>
        )[id];
        return !isNonNegativeInteger(level) || Number(level) > 3;
      })
    )
  ) {
    throw new Error("庄园基础设施状态无效");
  }

  if (
    value.collectionProgress !== undefined &&
    (
      !isRecord(value.collectionProgress) ||
      Object.values(value.collectionProgress).some(
        (progress) => !isNonNegativeInteger(progress),
      )
    )
  ) {
    throw new Error("庄园图鉴进度无效");
  }

  if (
    value.honor !== undefined &&
    (
      !isRecord(value.honor) ||
      !isNonNegativeInteger(value.honor.score) ||
      !Array.isArray(value.honor.claimedMilestones) ||
      value.honor.claimedMilestones.some((milestoneId) =>
        !HOMESTEAD_HONOR_MILESTONE_IDS.includes(
          milestoneId as HomesteadHonorMilestoneId,
        )
      )
    )
  ) {
    throw new Error("庄园荣誉状态无效");
  }

  if (value.season !== undefined) {
    if (
      !isRecord(value.season) ||
      typeof value.season.id !== "string" ||
      !isNonNegativeInteger(value.season.startsAt) ||
      !isNonNegativeInteger(value.season.endsAt) ||
      Number(value.season.endsAt) <= Number(value.season.startsAt) ||
      !isNonNegativeInteger(value.season.score) ||
      !Array.isArray(value.season.claimedMilestones) ||
      value.season.claimedMilestones.some(
        (milestoneId) =>
          !HOMESTEAD_SEASON_MILESTONE_IDS.includes(
            milestoneId as HomesteadSeasonMilestoneId,
          ) &&
          !["bronze", "silver", "gold"].includes(String(milestoneId)),
      ) ||
      !isRecord(value.season.counters)
    ) {
      throw new Error("庄园赛季存档无效");
    }
  }

  if (
    value.collections !== undefined &&
    (
      !Array.isArray(value.collections) ||
      value.collections.some(
        (entry) =>
          !isRecord(entry) ||
          typeof entry.id !== "string" ||
          !isNonNegativeInteger(entry.unlockedAt),
      )
    )
  ) {
    throw new Error("庄园图鉴存档无效");
  }

  if (value.townNetwork !== undefined) {
    const townNetwork = value.townNetwork;
    if (
      !isRecord(townNetwork) ||
      !HOMESTEAD_TOWN_IDS.includes(
        townNetwork.activeTownId as HomesteadTownId,
      ) ||
      !isNonNegativeInteger(townNetwork.merchantRenown) ||
      !isRecord(townNetwork.towns)
    ) {
      throw new Error("庄园城镇网络存档无效");
    }
    const towns = townNetwork.towns;
    if (
      HOMESTEAD_TOWN_IDS.some((townId) =>
        !validTownEstate(towns[townId], townId)
      )
    ) {
      throw new Error("庄园城镇网络存档无效");
    }
  }

  if (value.valueRouteDayKeys !== undefined) {
    if (!isRecord(value.valueRouteDayKeys)) {
      throw new Error("庄园增值项目存档无效");
    }
    for (const routeId of HOMESTEAD_VALUE_ROUTE_IDS) {
      const completedDayKey = value.valueRouteDayKeys[routeId];
      if (
        completedDayKey !== undefined &&
        completedDayKey !== null &&
        typeof completedDayKey !== "string"
      ) {
        throw new Error("庄园增值项目存档无效");
      }
    }
  }

  if (
    value.aiProfile !== undefined &&
    (
      !isRecord(value.aiProfile) ||
      typeof value.aiProfile.enabled !== "boolean" ||
      !["balanced", "wealth", "reputation", "research"].includes(
        String(value.aiProfile.goal),
      ) ||
      !["safe", "balanced", "bold"].includes(
        String(value.aiProfile.risk),
      ) ||
      !["farm", "ranch", "mine", "processing"].includes(
        String(value.aiProfile.focus),
      )
    )
  ) {
    throw new Error("世界导演偏好存档无效");
  }

  if (
    value.advice !== undefined &&
    (
      !isRecord(value.advice) ||
      typeof value.advice.dayKey !== "string" ||
      !["rules", "llm"].includes(String(value.advice.source)) ||
      typeof value.advice.headline !== "string" ||
      typeof value.advice.narrative !== "string" ||
      typeof value.advice.recommendation !== "string" ||
      !HOMESTEAD_NPC_IDS.includes(value.advice.npcId as HomesteadNpcId) ||
      typeof value.advice.npcLine !== "string" ||
      !isNonNegativeInteger(value.advice.generatedAt) ||
      (
        value.advice.steps !== undefined &&
        (
          !Array.isArray(value.advice.steps) ||
          value.advice.steps.length > 3 ||
          value.advice.steps.some((step) =>
            !isRecord(step) ||
            typeof step.id !== "string" ||
            typeof step.title !== "string" ||
            typeof step.reason !== "string" ||
            !["today", "operations", "growth"].includes(
              String(step.panel),
            ) ||
            ![
              "homestead-world-event",
              "homestead-weather",
              "homestead-processing",
              "homestead-orders",
              "homestead-research",
              "homestead-town-rhythm",
              "homestead-town-local",
              "homestead-town-trade",
            ].includes(String(step.targetId))
          )
        )
      ) ||
      (
        value.advice.worldBeatId !== undefined &&
        ![
          "recovery",
          "pressure",
          "opportunity",
          "community",
          "discovery",
          "trade",
        ].includes(String(value.advice.worldBeatId))
      ) ||
      (
        value.advice.foreshadowing !== undefined &&
        (
          typeof value.advice.foreshadowing !== "string" ||
          value.advice.foreshadowing.length > 120
        )
      ) ||
      (
        value.advice.evidence !== undefined &&
        (
          !Array.isArray(value.advice.evidence) ||
          value.advice.evidence.length > 3 ||
          value.advice.evidence.some((fact) =>
            !isRecord(fact) ||
            typeof fact.id !== "string" ||
            fact.id.length > 80 ||
            typeof fact.label !== "string" ||
            fact.label.length > 160
          )
        )
      ) ||
      (
        value.advice.merchantRecommendationId !== undefined &&
        value.advice.merchantRecommendationId !== null &&
        !Object.prototype.hasOwnProperty.call(
          ESTATE_MERCHANT_ITEMS,
          String(value.advice.merchantRecommendationId),
        )
      )
    )
  ) {
    throw new Error("庄园经营建议存档无效");
  }
}
