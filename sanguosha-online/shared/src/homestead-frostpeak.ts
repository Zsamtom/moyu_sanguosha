import {
  FROSTPEAK_CROP_IDS,
  FROSTPEAK_DEPOSIT_IDS,
  FROSTPEAK_PRODUCT_IDS,
} from "./towns/frostpeak.js";

/**
 * Frostpeak owns a complete homestead content pack. The shared homestead
 * engine can merge these readonly catalogs with the Greenvale catalogs while
 * keeping every resource reference town-local.
 */

export type FrostpeakCropId = (typeof FROSTPEAK_CROP_IDS)[number];
export type FrostpeakRanchProductId =
  (typeof FROSTPEAK_PRODUCT_IDS)[number];
export type FrostpeakMineDepositId =
  (typeof FROSTPEAK_DEPOSIT_IDS)[number];

export const FROSTPEAK_HOMESTEAD_FACILITY_IDS = [
  "mill",
  "feed_factory",
  "fertilizer_plant",
  "kitchen",
  "textile_mill",
  "smelter",
  "machine_shop",
] as const;

export type FrostpeakHomesteadFacilityId =
  (typeof FROSTPEAK_HOMESTEAD_FACILITY_IDS)[number];

export const FROSTPEAK_HOMESTEAD_GOOD_IDS = [
  "frost_barley_flour",
  "alpine_feed",
  "thermal_compost",
  "frost_felt",
  "frost_alloy",
  "cloudberry_preserves",
  "winter_provisions",
  "insulated_mining_kit",
  "aurora_ceremonial_crate",
] as const;

export type FrostpeakHomesteadGoodId =
  (typeof FROSTPEAK_HOMESTEAD_GOOD_IDS)[number];

export interface FrostpeakHomesteadGoodDefinition {
  readonly id: FrostpeakHomesteadGoodId;
  readonly name: string;
  readonly tier: 2 | 3;
  /**
   * Deterministic reference value used by balance tests and later merchant
   * presentation. Actual order payouts remain server-authored.
   */
  readonly unitValue: number;
}

export const FROSTPEAK_HOMESTEAD_GOODS = [
  {
    id: "frost_barley_flour",
    name: "霜麦粉",
    tier: 2,
    unitValue: 20,
  },
  {
    id: "alpine_feed",
    name: "高原营养饲料",
    tier: 3,
    unitValue: 55,
  },
  {
    id: "thermal_compost",
    name: "温床营养基",
    tier: 2,
    unitValue: 64,
  },
  {
    id: "frost_felt",
    name: "御寒呢毡",
    tier: 2,
    unitValue: 284,
  },
  {
    id: "frost_alloy",
    name: "耐寒合金锭",
    tier: 2,
    unitValue: 196,
  },
  {
    id: "cloudberry_preserves",
    name: "云莓药草蜜饯",
    tier: 2,
    unitValue: 119,
  },
  {
    id: "winter_provisions",
    name: "雪线远行口粮",
    tier: 3,
    unitValue: 445,
  },
  {
    id: "insulated_mining_kit",
    name: "保温矿务套装",
    tier: 3,
    unitValue: 960,
  },
  {
    id: "aurora_ceremonial_crate",
    name: "极光庆典礼箱",
    tier: 3,
    unitValue: 1_715,
  },
] as const satisfies readonly FrostpeakHomesteadGoodDefinition[];

/**
 * Town-neutral homestead rules refer to these roles when they consume an
 * upgrade material. The mapping keeps those mechanics identical while making
 * the actual inventory item Frostpeak-specific.
 *
 * `frost_barley_flour` doubles as the local grain meal for the early coarse
 * feed role; the later fortified-feed role still requires the dedicated
 * tier-three `alpine_feed`, so the processing ladder is not skipped.
 */
export const FROSTPEAK_HOMESTEAD_COMMON_GOOD_ROLES = [
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

export type FrostpeakHomesteadCommonGoodRole =
  (typeof FROSTPEAK_HOMESTEAD_COMMON_GOOD_ROLES)[number];

export const FROSTPEAK_HOMESTEAD_SUBSTITUTIONS = {
  flour: "frost_barley_flour",
  coarse_feed: "frost_barley_flour",
  fortified_feed: "alpine_feed",
  soil_conditioner: "thermal_compost",
  work_clothes: "frost_felt",
  iron_ingot: "frost_alloy",
  mining_kit: "insulated_mining_kit",
  festival_crate: "aurora_ceremonial_crate",
  greenhouse_parts: "frost_alloy",
} as const satisfies Readonly<
  Record<FrostpeakHomesteadCommonGoodRole, FrostpeakHomesteadGoodId>
>;

export type FrostpeakHomesteadResource =
  | {
      readonly source: "farm";
      readonly itemId: FrostpeakCropId;
      readonly quantity: number;
    }
  | {
      readonly source: "ranch";
      readonly itemId: FrostpeakRanchProductId;
      readonly quantity: number;
    }
  | {
      readonly source: "mine";
      readonly itemId: FrostpeakMineDepositId;
      readonly quantity: number;
    }
  | {
      readonly source: "goods";
      readonly itemId: FrostpeakHomesteadGoodId;
      readonly quantity: number;
    };

export const FROSTPEAK_HOMESTEAD_RECIPE_IDS = [
  "frost_mill_barley_flour",
  "frost_feed_alpine",
  "frost_fertilizer_thermal_compost",
  "frost_textile_felt",
  "frost_smelt_alloy",
  "frost_kitchen_cloudberry_preserves",
  "frost_kitchen_winter_provisions",
  "frost_workshop_insulated_kit",
  "frost_kitchen_aurora_crate",
] as const;

export type FrostpeakHomesteadRecipeId =
  (typeof FROSTPEAK_HOMESTEAD_RECIPE_IDS)[number];

export interface FrostpeakHomesteadRecipeDefinition {
  readonly id: FrostpeakHomesteadRecipeId;
  readonly townId: "frostpeak";
  readonly name: string;
  readonly facilityId: FrostpeakHomesteadFacilityId;
  readonly tier: 2 | 3;
  readonly durationSeconds: number;
  /**
   * Processing consumes both materials and operating funds. This prevents a
   * zero-input queue from becoming an unlimited coin generator.
   */
  readonly coinCost: number;
  readonly inputs: readonly FrostpeakHomesteadResource[];
  readonly output: {
    readonly itemId: FrostpeakHomesteadGoodId;
    readonly quantity: number;
  };
}

const MINUTE = 60;

export const FROSTPEAK_HOMESTEAD_RECIPES = [
  {
    id: "frost_mill_barley_flour",
    townId: "frostpeak",
    name: "研磨霜麦粉",
    facilityId: "mill",
    tier: 2,
    durationSeconds: 12 * MINUTE,
    coinCost: 5,
    inputs: [
      { source: "farm", itemId: "frost_barley", quantity: 4 },
    ],
    output: { itemId: "frost_barley_flour", quantity: 2 },
  },
  {
    id: "frost_feed_alpine",
    townId: "frostpeak",
    name: "调配高原营养饲料",
    facilityId: "feed_factory",
    tier: 3,
    durationSeconds: 35 * MINUTE,
    coinCost: 10,
    inputs: [
      { source: "goods", itemId: "frost_barley_flour", quantity: 1 },
      { source: "farm", itemId: "highland_bean", quantity: 2 },
      { source: "ranch", itemId: "snow_egg", quantity: 1 },
    ],
    output: { itemId: "alpine_feed", quantity: 2 },
  },
  {
    id: "frost_fertilizer_thermal_compost",
    townId: "frostpeak",
    name: "发酵温床营养基",
    facilityId: "fertilizer_plant",
    tier: 2,
    durationSeconds: 50 * MINUTE,
    coinCost: 12,
    inputs: [
      { source: "farm", itemId: "snow_potato", quantity: 2 },
      { source: "farm", itemId: "ice_turnip", quantity: 2 },
      { source: "ranch", itemId: "snow_egg", quantity: 1 },
      { source: "mine", itemId: "lignite", quantity: 1 },
    ],
    output: { itemId: "thermal_compost", quantity: 2 },
  },
  {
    id: "frost_textile_felt",
    townId: "frostpeak",
    name: "织造御寒呢毡",
    facilityId: "textile_mill",
    tier: 2,
    durationSeconds: 80 * MINUTE,
    coinCost: 24,
    inputs: [
      { source: "farm", itemId: "silver_flax", quantity: 2 },
      { source: "ranch", itemId: "highland_wool", quantity: 2 },
      { source: "ranch", itemId: "angora_fur", quantity: 1 },
    ],
    output: { itemId: "frost_felt", quantity: 2 },
  },
  {
    id: "frost_smelt_alloy",
    townId: "frostpeak",
    name: "冶炼耐寒合金锭",
    facilityId: "smelter",
    tier: 2,
    durationSeconds: 110 * MINUTE,
    coinCost: 28,
    inputs: [
      { source: "mine", itemId: "magnetite", quantity: 3 },
      { source: "mine", itemId: "tin", quantity: 2 },
      { source: "mine", itemId: "lignite", quantity: 2 },
    ],
    output: { itemId: "frost_alloy", quantity: 2 },
  },
  {
    id: "frost_kitchen_cloudberry_preserves",
    townId: "frostpeak",
    name: "熬制云莓药草蜜饯",
    facilityId: "kitchen",
    tier: 2,
    durationSeconds: 70 * MINUTE,
    coinCost: 18,
    inputs: [
      { source: "farm", itemId: "cloudberry", quantity: 2 },
      { source: "farm", itemId: "alpine_herb", quantity: 1 },
      { source: "farm", itemId: "juniper_berry", quantity: 1 },
    ],
    output: { itemId: "cloudberry_preserves", quantity: 2 },
  },
  {
    id: "frost_kitchen_winter_provisions",
    townId: "frostpeak",
    name: "封装雪线远行口粮",
    facilityId: "kitchen",
    tier: 3,
    durationSeconds: 95 * MINUTE,
    coinCost: 36,
    inputs: [
      { source: "goods", itemId: "frost_barley_flour", quantity: 2 },
      { source: "goods", itemId: "cloudberry_preserves", quantity: 1 },
      { source: "ranch", itemId: "yak_milk", quantity: 1 },
      { source: "ranch", itemId: "ptarmigan_egg", quantity: 2 },
    ],
    output: { itemId: "winter_provisions", quantity: 1 },
  },
  {
    id: "frost_workshop_insulated_kit",
    townId: "frostpeak",
    name: "组装保温矿务套装",
    facilityId: "machine_shop",
    tier: 3,
    durationSeconds: 150 * MINUTE,
    coinCost: 62,
    inputs: [
      { source: "goods", itemId: "frost_felt", quantity: 1 },
      { source: "goods", itemId: "frost_alloy", quantity: 1 },
      { source: "ranch", itemId: "cashmere", quantity: 1 },
      { source: "mine", itemId: "frost_silver", quantity: 1 },
    ],
    output: { itemId: "insulated_mining_kit", quantity: 1 },
  },
  {
    id: "frost_kitchen_aurora_crate",
    townId: "frostpeak",
    name: "装配极光庆典礼箱",
    facilityId: "kitchen",
    tier: 3,
    durationSeconds: 210 * MINUTE,
    coinCost: 110,
    inputs: [
      { source: "goods", itemId: "winter_provisions", quantity: 1 },
      { source: "farm", itemId: "aurora_fruit", quantity: 2 },
      { source: "farm", itemId: "blue_rose", quantity: 2 },
      { source: "mine", itemId: "frost_crystal", quantity: 1 },
    ],
    output: { itemId: "aurora_ceremonial_crate", quantity: 1 },
  },
] as const satisfies readonly FrostpeakHomesteadRecipeDefinition[];

export const FROSTPEAK_HOMESTEAD_ORDER_TEMPLATE_IDS = [
  "frost_station_breakfast",
  "frost_winter_uniforms",
  "frost_mine_relief",
  "frost_alpine_clinic",
  "frost_aurora_exposition",
  "frost_yak_caravan",
] as const;

export type FrostpeakHomesteadOrderTemplateId =
  (typeof FROSTPEAK_HOMESTEAD_ORDER_TEMPLATE_IDS)[number];

export interface FrostpeakHomesteadOrderTemplate {
  readonly id: FrostpeakHomesteadOrderTemplateId;
  readonly townId: "frostpeak";
  readonly title: string;
  readonly description: string;
  readonly requirements: readonly FrostpeakHomesteadResource[];
  readonly coinReward: number;
  readonly reputationReward: number;
  readonly researchReward: number;
}

export const FROSTPEAK_HOMESTEAD_ORDER_TEMPLATES = [
  {
    id: "frost_station_breakfast",
    townId: "frostpeak",
    title: "山地车站暖餐",
    description: "为清晨列车准备霜麦饼、雪禽蛋和炉火燃料。",
    requirements: [
      { source: "goods", itemId: "frost_barley_flour", quantity: 2 },
      { source: "ranch", itemId: "snow_egg", quantity: 3 },
      { source: "mine", itemId: "lignite", quantity: 1 },
    ],
    coinReward: 260,
    reputationReward: 16,
    researchReward: 3,
  },
  {
    id: "frost_winter_uniforms",
    townId: "frostpeak",
    title: "雪线巡护制服",
    description: "为巡护队交付御寒呢毡、山羊绒和银麻备用料。",
    requirements: [
      { source: "goods", itemId: "frost_felt", quantity: 1 },
      { source: "ranch", itemId: "cashmere", quantity: 1 },
      { source: "farm", itemId: "silver_flax", quantity: 2 },
    ],
    coinReward: 900,
    reputationReward: 28,
    researchReward: 6,
  },
  {
    id: "frost_mine_relief",
    townId: "frostpeak",
    title: "深层矿队救援包",
    description: "为封雪矿队提供保温装备、远行口粮和霜银支护件。",
    requirements: [
      { source: "goods", itemId: "insulated_mining_kit", quantity: 1 },
      { source: "goods", itemId: "winter_provisions", quantity: 1 },
      { source: "mine", itemId: "frost_silver", quantity: 2 },
    ],
    coinReward: 1_900,
    reputationReward: 45,
    researchReward: 12,
  },
  {
    id: "frost_alpine_clinic",
    townId: "frostpeak",
    title: "高山诊所补给",
    description: "诊所需要耐储存蜜饯、药草与冰叶菜补充冬季物资。",
    requirements: [
      { source: "goods", itemId: "cloudberry_preserves", quantity: 2 },
      { source: "farm", itemId: "alpine_herb", quantity: 3 },
      { source: "farm", itemId: "ice_lettuce", quantity: 4 },
    ],
    coinReward: 760,
    reputationReward: 26,
    researchReward: 7,
  },
  {
    id: "frost_aurora_exposition",
    townId: "frostpeak",
    title: "极光博览会展柜",
    description: "用庆典礼箱、霜晶和冰川金打造霜岭的年度展品。",
    requirements: [
      { source: "goods", itemId: "aurora_ceremonial_crate", quantity: 1 },
      { source: "mine", itemId: "frost_crystal", quantity: 1 },
      { source: "mine", itemId: "glacier_gold", quantity: 1 },
    ],
    coinReward: 2_500,
    reputationReward: 60,
    researchReward: 16,
  },
  {
    id: "frost_yak_caravan",
    townId: "frostpeak",
    title: "牦牛驿队远行",
    description: "驿队需要强化饲料、牦牛奶与寒香瓜穿越雪线。",
    requirements: [
      { source: "goods", itemId: "alpine_feed", quantity: 2 },
      { source: "ranch", itemId: "yak_milk", quantity: 3 },
      { source: "farm", itemId: "winter_melon", quantity: 2 },
    ],
    coinReward: 990,
    reputationReward: 32,
    researchReward: 8,
  },
] as const satisfies readonly FrostpeakHomesteadOrderTemplate[];

export const FROSTPEAK_HOMESTEAD_VALUE_ROUTE_IDS = [
  "frost_highland_staples",
  "frost_cold_chain_vegetables",
  "frost_alpine_apothecary",
  "frost_aurora_bouquet",
  "frost_fiber_cooperative",
  "frost_dairy_and_eggs",
  "frost_thermal_industry",
  "frost_precious_ore_commission",
  "frost_summit_public_works",
] as const;

export type FrostpeakHomesteadValueRouteId =
  (typeof FROSTPEAK_HOMESTEAD_VALUE_ROUTE_IDS)[number];

export type FrostpeakHomesteadValueRouteKind =
  | "processing"
  | "public_project"
  | "specialty_order";

export interface FrostpeakHomesteadValueRouteDefinition {
  readonly id: FrostpeakHomesteadValueRouteId;
  readonly townId: "frostpeak";
  readonly title: string;
  readonly description: string;
  readonly kind: FrostpeakHomesteadValueRouteKind;
  readonly stage: 2 | 3;
  readonly requirements: readonly FrostpeakHomesteadResource[];
  readonly coinReward: number;
  readonly reputationReward: number;
  readonly researchReward: number;
}

/**
 * These repeatable routes deliberately cover every Frostpeak primary crop,
 * ranch product and mine deposit. Players therefore retain a reason to operate
 * early production lines after the high-tier facilities have matured.
 */
export const FROSTPEAK_HOMESTEAD_VALUE_ROUTES = [
  {
    id: "frost_highland_staples",
    townId: "frostpeak",
    title: "高原主粮合作包",
    description: "霜麦、雪薯、冰芜菁和高原豆组成稳定的基础口粮。",
    kind: "public_project",
    stage: 2,
    requirements: [
      { source: "farm", itemId: "frost_barley", quantity: 4 },
      { source: "farm", itemId: "snow_potato", quantity: 3 },
      { source: "farm", itemId: "ice_turnip", quantity: 2 },
      { source: "farm", itemId: "highland_bean", quantity: 2 },
    ],
    coinReward: 155,
    reputationReward: 2,
    researchReward: 0,
  },
  {
    id: "frost_cold_chain_vegetables",
    townId: "frostpeak",
    title: "冰叶寒瓜冷链",
    description: "将冰叶菜和寒香瓜送往山下餐厅，换取稳定订单。",
    kind: "processing",
    stage: 2,
    requirements: [
      { source: "farm", itemId: "ice_lettuce", quantity: 3 },
      { source: "farm", itemId: "winter_melon", quantity: 2 },
    ],
    coinReward: 620,
    reputationReward: 4,
    researchReward: 1,
  },
  {
    id: "frost_alpine_apothecary",
    townId: "frostpeak",
    title: "高山药房原料",
    description: "云莓、高山药草和杜松果组成高寒药房的季节配方。",
    kind: "specialty_order",
    stage: 2,
    requirements: [
      { source: "farm", itemId: "cloudberry", quantity: 2 },
      { source: "farm", itemId: "alpine_herb", quantity: 2 },
      { source: "farm", itemId: "juniper_berry", quantity: 2 },
    ],
    coinReward: 365,
    reputationReward: 4,
    researchReward: 1,
  },
  {
    id: "frost_aurora_bouquet",
    townId: "frostpeak",
    title: "极光花果礼篮",
    description: "寒地蓝蔷薇与极光果成为霜岭的高端礼赠名片。",
    kind: "specialty_order",
    stage: 3,
    requirements: [
      { source: "farm", itemId: "blue_rose", quantity: 2 },
      { source: "farm", itemId: "aurora_fruit", quantity: 1 },
    ],
    coinReward: 520,
    reputationReward: 5,
    researchReward: 1,
  },
  {
    id: "frost_fiber_cooperative",
    townId: "frostpeak",
    title: "雪线纤维合作社",
    description: "银麻、兔绒、羊毛和山羊绒共同支撑御寒纺织产业。",
    kind: "processing",
    stage: 3,
    requirements: [
      { source: "farm", itemId: "silver_flax", quantity: 2 },
      { source: "ranch", itemId: "angora_fur", quantity: 2 },
      { source: "ranch", itemId: "highland_wool", quantity: 2 },
      { source: "ranch", itemId: "cashmere", quantity: 1 },
    ],
    coinReward: 810,
    reputationReward: 6,
    researchReward: 2,
  },
  {
    id: "frost_dairy_and_eggs",
    townId: "frostpeak",
    title: "高寒乳蛋联供",
    description: "雪禽蛋、雷鸟蛋和牦牛奶供应车站餐饮与学校。",
    kind: "public_project",
    stage: 2,
    requirements: [
      { source: "ranch", itemId: "snow_egg", quantity: 3 },
      { source: "ranch", itemId: "ptarmigan_egg", quantity: 2 },
      { source: "ranch", itemId: "yak_milk", quantity: 2 },
    ],
    coinReward: 430,
    reputationReward: 4,
    researchReward: 1,
  },
  {
    id: "frost_thermal_industry",
    townId: "frostpeak",
    title: "山地热力工业包",
    description: "褐煤、磁铁矿和锡矿用于维护供暖站与铁路设施。",
    kind: "public_project",
    stage: 3,
    requirements: [
      { source: "mine", itemId: "lignite", quantity: 3 },
      { source: "mine", itemId: "magnetite", quantity: 2 },
      { source: "mine", itemId: "tin", quantity: 2 },
    ],
    coinReward: 350,
    reputationReward: 5,
    researchReward: 2,
  },
  {
    id: "frost_precious_ore_commission",
    townId: "frostpeak",
    title: "冰川珍矿委托",
    description: "霜银、冰川金与霜晶交由山地工艺师联合加工。",
    kind: "specialty_order",
    stage: 3,
    requirements: [
      { source: "mine", itemId: "frost_silver", quantity: 2 },
      { source: "mine", itemId: "glacier_gold", quantity: 1 },
      { source: "mine", itemId: "frost_crystal", quantity: 1 },
    ],
    coinReward: 720,
    reputationReward: 7,
    researchReward: 2,
  },
  {
    id: "frost_summit_public_works",
    townId: "frostpeak",
    title: "雪峰公共工程",
    description: "加工后的营养基、呢毡和合金用于升级温室与避险站。",
    kind: "public_project",
    stage: 3,
    requirements: [
      { source: "goods", itemId: "frost_barley_flour", quantity: 2 },
      { source: "goods", itemId: "thermal_compost", quantity: 2 },
      { source: "goods", itemId: "frost_felt", quantity: 1 },
      { source: "goods", itemId: "frost_alloy", quantity: 1 },
    ],
    coinReward: 780,
    reputationReward: 8,
    researchReward: 3,
  },
] as const satisfies readonly FrostpeakHomesteadValueRouteDefinition[];

export const FROSTPEAK_HOMESTEAD_WORLD_EVENT_IDS = [
  "frost_clear_shift",
  "frost_aurora_market",
  "frost_whiteout_damage",
  "frost_avalanche",
  "frost_geothermal_vent",
  "frost_ptarmigan_migration",
  "frost_rail_icing",
  "frost_spring_thaw",
  "frost_highland_drought",
] as const;

export type FrostpeakHomesteadWorldEventId =
  (typeof FROSTPEAK_HOMESTEAD_WORLD_EVENT_IDS)[number];

export type FrostpeakEventSector = "farm" | "ranch" | "mine" | "logistics";

export interface FrostpeakEventHazard {
  readonly id: string;
  readonly affectedSectors: readonly FrostpeakEventSector[];
  readonly persistentUntilResolved: boolean;
  readonly yieldPercent: number;
  readonly durationPercent: number;
  readonly description: string;
}

export interface FrostpeakHomesteadWorldEventOption {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly costs: readonly FrostpeakHomesteadResource[];
  readonly coinCost: number;
  readonly coinReward: number;
  readonly reputationReward: number;
  readonly researchReward: number;
  readonly resolvesHazard: boolean;
}

export interface FrostpeakHomesteadWorldEventDefinition {
  readonly id: FrostpeakHomesteadWorldEventId;
  readonly townId: "frostpeak";
  readonly title: string;
  readonly summary: string;
  readonly tone: "calm" | "opportunity" | "risk";
  readonly category: "routine" | "weather" | "disaster" | "opportunity";
  /**
   * Signals are matched against deterministic weather categories and verified
   * real-world warning categories. They are descriptive keys, not LLM output.
   */
  readonly weatherSignals: readonly string[];
  readonly hazard?: FrostpeakEventHazard;
  readonly options: readonly FrostpeakHomesteadWorldEventOption[];
}

export const FROSTPEAK_HOMESTEAD_WORLD_EVENTS = [
  {
    id: "frost_clear_shift",
    townId: "frostpeak",
    title: "三业防寒巡检",
    summary: "天气平稳，镇务所邀请庄园提交三业样品并检查冬季储备。",
    tone: "calm",
    category: "routine",
    weatherSignals: ["clear", "cloudy"],
    options: [
      {
        id: "submit_frost_samples",
        label: "提交三业样品",
        description: "用基础农产、畜产和矿物换取研究资料。",
        costs: [
          { source: "farm", itemId: "frost_barley", quantity: 2 },
          { source: "ranch", itemId: "snow_egg", quantity: 1 },
          { source: "mine", itemId: "lignite", quantity: 1 },
        ],
        coinCost: 0,
        coinReward: 90,
        reputationReward: 8,
        researchReward: 3,
        resolvesHazard: true,
      },
      {
        id: "inspect_independently",
        label: "自行巡检",
        description: "保留库存，完成基础检查。",
        costs: [],
        coinCost: 0,
        coinReward: 0,
        reputationReward: 2,
        researchReward: 0,
        resolvesHazard: true,
      },
    ],
  },
  {
    id: "frost_aurora_market",
    townId: "frostpeak",
    title: "极光夜市邀约",
    summary: "极光出现，旅客希望购买霜岭花果与耐储存食品。",
    tone: "opportunity",
    category: "opportunity",
    weatherSignals: ["clear", "aurora"],
    options: [
      {
        id: "open_aurora_stall",
        label: "开设特色摊位",
        description: "提交蓝蔷薇、极光果和蜜饯经营限时摊位。",
        costs: [
          { source: "farm", itemId: "blue_rose", quantity: 1 },
          { source: "farm", itemId: "aurora_fruit", quantity: 1 },
          { source: "goods", itemId: "cloudberry_preserves", quantity: 1 },
        ],
        coinCost: 20,
        coinReward: 520,
        reputationReward: 12,
        researchReward: 1,
        resolvesHazard: true,
      },
      {
        id: "license_local_vendors",
        label: "协助本地商户",
        description: "不消耗库存，收取少量摊位服务费。",
        costs: [],
        coinCost: 0,
        coinReward: 60,
        reputationReward: 3,
        researchReward: 0,
        resolvesHazard: true,
      },
    ],
  },
  {
    id: "frost_whiteout_damage",
    townId: "frostpeak",
    title: "暴雪损坏防护棚",
    summary: "强风与积雪破坏农田和畜舍防护，若不维修会持续拖慢生产。",
    tone: "risk",
    category: "disaster",
    weatherSignals: ["snow", "blizzard", "cold_wave_warning"],
    hazard: {
      id: "damaged_snow_shelter",
      affectedSectors: ["farm", "ranch"],
      persistentUntilResolved: true,
      yieldPercent: -18,
      durationPercent: 15,
      description: "防护棚修复前，农场与牧场产量降低且生产时间延长。",
    },
    options: [
      {
        id: "repair_snow_shelter",
        label: "立即修复防护棚",
        description: "投入呢毡与合金清雪加固，解除持续减产。",
        costs: [
          { source: "goods", itemId: "frost_felt", quantity: 1 },
          { source: "goods", itemId: "frost_alloy", quantity: 1 },
        ],
        coinCost: 80,
        coinReward: 0,
        reputationReward: 14,
        researchReward: 3,
        resolvesHazard: true,
      },
      {
        id: "temporary_snow_bracing",
        label: "搭建临时支撑",
        description: "用原料暂时控制损坏，持续影响仍需后续修复。",
        costs: [
          { source: "farm", itemId: "silver_flax", quantity: 2 },
          { source: "ranch", itemId: "highland_wool", quantity: 1 },
        ],
        coinCost: 20,
        coinReward: 0,
        reputationReward: 4,
        researchReward: 0,
        resolvesHazard: false,
      },
    ],
  },
  {
    id: "frost_avalanche",
    townId: "frostpeak",
    title: "矿区雪崩封道",
    summary: "雪崩掩埋矿道入口，长期不清理将显著影响采矿效率。",
    tone: "risk",
    category: "disaster",
    weatherSignals: ["heavy_snow", "avalanche_warning"],
    hazard: {
      id: "avalanche_blocked_mine",
      affectedSectors: ["mine"],
      persistentUntilResolved: true,
      yieldPercent: -35,
      durationPercent: 40,
      description: "矿道完成排险前，矿山产量降低且勘探时间显著延长。",
    },
    options: [
      {
        id: "organized_avalanche_clearance",
        label: "组织专业排险",
        description: "投入保温矿务套装和资金清理矿道，立即解除影响。",
        costs: [
          { source: "goods", itemId: "insulated_mining_kit", quantity: 1 },
        ],
        coinCost: 160,
        coinReward: 0,
        reputationReward: 18,
        researchReward: 5,
        resolvesHazard: true,
      },
      {
        id: "open_narrow_bypass",
        label: "开辟狭窄便道",
        description: "用合金支撑临时恢复通行，但主要矿道仍待处理。",
        costs: [
          { source: "goods", itemId: "frost_alloy", quantity: 1 },
        ],
        coinCost: 40,
        coinReward: 0,
        reputationReward: 5,
        researchReward: 1,
        resolvesHazard: false,
      },
    ],
  },
  {
    id: "frost_geothermal_vent",
    townId: "frostpeak",
    title: "地热支脉显露",
    summary: "矿山发现温热气流，可以研究供暖，也可能引发局部渗水。",
    tone: "opportunity",
    category: "opportunity",
    weatherSignals: ["frost", "cold"],
    options: [
      {
        id: "survey_geothermal_vent",
        label: "开展地热勘测",
        description: "投入霜银和锡矿建立监测点。",
        costs: [
          { source: "mine", itemId: "frost_silver", quantity: 1 },
          { source: "mine", itemId: "tin", quantity: 2 },
        ],
        coinCost: 60,
        coinReward: 160,
        reputationReward: 8,
        researchReward: 7,
        resolvesHazard: true,
      },
      {
        id: "seal_geothermal_vent",
        label: "封闭支脉",
        description: "优先保证矿道稳定，获得少量安全声望。",
        costs: [
          { source: "mine", itemId: "magnetite", quantity: 2 },
        ],
        coinCost: 20,
        coinReward: 0,
        reputationReward: 4,
        researchReward: 1,
        resolvesHazard: true,
      },
    ],
  },
  {
    id: "frost_ptarmigan_migration",
    townId: "frostpeak",
    title: "雷鸟季节迁徙",
    summary: "雷鸟群途经牧场，镇民希望兼顾生态观察与畜群安全。",
    tone: "calm",
    category: "routine",
    weatherSignals: ["clear", "light_snow"],
    options: [
      {
        id: "establish_bird_buffer",
        label: "设置迁徙缓冲带",
        description: "投入饲料引导鸟群，积累牧业研究。",
        costs: [
          { source: "goods", itemId: "alpine_feed", quantity: 1 },
        ],
        coinCost: 0,
        coinReward: 70,
        reputationReward: 9,
        researchReward: 4,
        resolvesHazard: true,
      },
      {
        id: "close_ranch_gate",
        label: "临时关闭外圈",
        description: "不额外投入，稳妥保护现有畜群。",
        costs: [],
        coinCost: 0,
        coinReward: 0,
        reputationReward: 2,
        researchReward: 0,
        resolvesHazard: true,
      },
    ],
  },
  {
    id: "frost_rail_icing",
    townId: "frostpeak",
    title: "山地铁路结冰",
    summary: "轨道结冰使订单运输受阻，但庄园内部三业仍可继续生产。",
    tone: "risk",
    category: "weather",
    weatherSignals: ["freezing_rain", "road_icing_warning"],
    hazard: {
      id: "iced_rail_logistics",
      affectedSectors: ["logistics"],
      persistentUntilResolved: true,
      yieldPercent: 0,
      durationPercent: 0,
      description: "铁路除冰前只影响订单与城镇交通，不直接修改三业产出。",
    },
    options: [
      {
        id: "supply_rail_deicing",
        label: "支援铁路除冰",
        description: "投入褐煤和合金支援热力车，恢复物流。",
        costs: [
          { source: "mine", itemId: "lignite", quantity: 3 },
          { source: "goods", itemId: "frost_alloy", quantity: 1 },
        ],
        coinCost: 60,
        coinReward: 120,
        reputationReward: 12,
        researchReward: 2,
        resolvesHazard: true,
      },
      {
        id: "hold_rail_shipments",
        label: "暂存待运货物",
        description: "不损失物资，但物流受阻状态会保留。",
        costs: [],
        coinCost: 0,
        coinReward: 0,
        reputationReward: 1,
        researchReward: 0,
        resolvesHazard: false,
      },
    ],
  },
  {
    id: "frost_spring_thaw",
    townId: "frostpeak",
    title: "融雪渗水",
    summary: "突然升温使融雪进入田沟和矿道，放任不管会持续拖慢作业。",
    tone: "risk",
    category: "disaster",
    weatherSignals: ["rapid_warming", "rain_on_snow", "flood_warning"],
    hazard: {
      id: "spring_thaw_flooding",
      affectedSectors: ["farm", "mine"],
      persistentUntilResolved: true,
      yieldPercent: -15,
      durationPercent: 25,
      description: "排水完成前，农田与矿山产量降低且生产时间延长。",
    },
    options: [
      {
        id: "drain_spring_thaw",
        label: "联动排水",
        description: "投入矿务套装和营养基疏通矿道、修复田床。",
        costs: [
          { source: "goods", itemId: "insulated_mining_kit", quantity: 1 },
          { source: "goods", itemId: "thermal_compost", quantity: 1 },
        ],
        coinCost: 100,
        coinReward: 0,
        reputationReward: 16,
        researchReward: 5,
        resolvesHazard: true,
      },
      {
        id: "pump_priority_shafts",
        label: "优先抽排主矿道",
        description: "减少眼前损失，但田沟与支巷仍需后续修复。",
        costs: [
          { source: "mine", itemId: "lignite", quantity: 2 },
        ],
        coinCost: 40,
        coinReward: 0,
        reputationReward: 4,
        researchReward: 1,
        resolvesHazard: false,
      },
    ],
  },
  {
    id: "frost_highland_drought",
    townId: "frostpeak",
    title: "高原干风缺水",
    summary: "持续少雨和干风使蓄水池见底，农田与牧群需要优先保障供水。",
    tone: "risk",
    category: "disaster",
    weatherSignals: ["drought", "dry_wind", "low_precipitation"],
    hazard: {
      id: "highland_water_shortage",
      affectedSectors: ["farm", "ranch"],
      persistentUntilResolved: true,
      yieldPercent: -20,
      durationPercent: 20,
      description: "恢复蓄水前，作物与牧群产量下降且生产时间延长。",
    },
    options: [
      {
        id: "restore_highland_cistern",
        label: "修复高原蓄水池",
        description: "投入温床营养基和耐寒合金修复集水、储水设施。",
        costs: [
          { source: "goods", itemId: "thermal_compost", quantity: 1 },
          { source: "goods", itemId: "frost_alloy", quantity: 1 },
        ],
        coinCost: 90,
        coinReward: 0,
        reputationReward: 15,
        researchReward: 4,
        resolvesHazard: true,
      },
      {
        id: "ration_highland_water",
        label: "实施临时配水",
        description: "以高原豆和牦牛奶维持基本供给，缺水影响仍需后续解决。",
        costs: [
          { source: "farm", itemId: "highland_bean", quantity: 2 },
          { source: "ranch", itemId: "yak_milk", quantity: 1 },
        ],
        coinCost: 20,
        coinReward: 0,
        reputationReward: 4,
        researchReward: 0,
        resolvesHazard: false,
      },
    ],
  },
] as const satisfies readonly FrostpeakHomesteadWorldEventDefinition[];

function readonlyCatalog<
  TId extends string,
  TDefinition extends { readonly id: TId },
>(
  definitions: readonly TDefinition[],
): Readonly<Record<TId, TDefinition>> {
  return Object.freeze(
    Object.fromEntries(definitions.map((definition) => [
      definition.id,
      definition,
    ])) as Record<TId, TDefinition>,
  );
}

/**
 * Record-shaped views are exported as a convenience for the current
 * Homestead engine, which stores its Greenvale catalogs as readonly records.
 */
export const FROSTPEAK_HOMESTEAD_GOOD_CATALOG = readonlyCatalog(
  FROSTPEAK_HOMESTEAD_GOODS,
);

export const FROSTPEAK_HOMESTEAD_RECIPE_CATALOG = readonlyCatalog(
  FROSTPEAK_HOMESTEAD_RECIPES,
);

export const FROSTPEAK_HOMESTEAD_ORDER_TEMPLATE_CATALOG = readonlyCatalog(
  FROSTPEAK_HOMESTEAD_ORDER_TEMPLATES,
);

export const FROSTPEAK_HOMESTEAD_VALUE_ROUTE_CATALOG = readonlyCatalog(
  FROSTPEAK_HOMESTEAD_VALUE_ROUTES,
);

export const FROSTPEAK_HOMESTEAD_WORLD_EVENT_CATALOG = readonlyCatalog(
  FROSTPEAK_HOMESTEAD_WORLD_EVENTS,
);
