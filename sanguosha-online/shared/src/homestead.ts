import type { FarmingCropCounts, FarmingCropId } from "./farming.js";
import type {
  RanchProductCounts,
  RanchProductId,
} from "./ranch.js";
import type {
  MineDepositId,
  MineOreCounts,
} from "./mine.js";
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
  HOMESTEAD_SEASON_MILESTONES,
  HOMESTEAD_SEASON_MILESTONE_IDS,
  longTermCollectionDefinitions,
  type HomesteadAnimalTraitId,
  type HomesteadCollectionDefinition,
  type HomesteadCropFamily,
  type HomesteadFeedProgramId,
  type HomesteadMineLayerId,
  type HomesteadNpcId,
  type HomesteadNpcTopicId,
  type HomesteadResearchNodeId,
  type HomesteadSeasonMilestoneId,
} from "./homestead-longterm.js";

export const HOMESTEAD_STATE_VERSION = 1 as const;
export const HOMESTEAD_MAX_LOGS = 80;
export const HOMESTEAD_DAILY_ORDER_COUNT = 3;

const MINUTE = 60;

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

export const HOMESTEAD_GOOD_IDS = [
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

export const HOMESTEAD_RECIPE_IDS = [
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

export type HomesteadRecipeId = (typeof HOMESTEAD_RECIPE_IDS)[number];

export interface HomesteadRecipeDefinition {
  readonly id: HomesteadRecipeId;
  readonly name: string;
  readonly facilityId: HomesteadFacilityId;
  readonly durationSeconds: number;
  readonly inputs: readonly HomesteadResource[];
  readonly output: {
    readonly itemId: HomesteadGoodId;
    readonly quantity: number;
  };
}

export const HOMESTEAD_RECIPES: Readonly<
  Record<HomesteadRecipeId, HomesteadRecipeDefinition>
> = {
  mill_flour: {
    id: "mill_flour",
    name: "研磨面粉",
    facilityId: "mill",
    durationSeconds: 10 * MINUTE,
    inputs: [{ source: "farm", itemId: "wheat", quantity: 3 }],
    output: { itemId: "flour", quantity: 2 },
  },
  mill_coarse_feed: {
    id: "mill_coarse_feed",
    name: "混合粗饲料",
    facilityId: "mill",
    durationSeconds: 15 * MINUTE,
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
    inputs: [
      { source: "farm", itemId: "cotton", quantity: 2 },
      { source: "ranch", itemId: "wool", quantity: 1 },
      { source: "goods", itemId: "iron_ingot", quantity: 2 },
    ],
    output: { itemId: "greenhouse_parts", quantity: 1 },
  },
};

export const HOMESTEAD_ORDER_TEMPLATE_IDS = [
  "bakery_breakfast",
  "winter_uniforms",
  "miners_supply",
  "greenhouse_project",
  "mechanization_drive",
  "festival_banquet",
] as const;

export type HomesteadOrderTemplateId =
  (typeof HOMESTEAD_ORDER_TEMPLATE_IDS)[number];

export interface HomesteadOrderTemplate {
  readonly id: HomesteadOrderTemplateId;
  readonly title: string;
  readonly description: string;
  readonly requirements: readonly HomesteadResource[];
  readonly coinReward: number;
  readonly reputationReward: number;
  readonly researchReward: number;
}

export const HOMESTEAD_ORDER_TEMPLATES: Readonly<
  Record<HomesteadOrderTemplateId, HomesteadOrderTemplate>
> = {
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
};

export const HOMESTEAD_WORLD_EVENT_IDS = [
  "steady_weather",
  "harvest_festival",
  "mountain_seepage",
  "cold_snap",
] as const;

export type HomesteadWorldEventId =
  (typeof HOMESTEAD_WORLD_EVENT_IDS)[number];

export interface HomesteadWorldEventOption {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly costs: readonly HomesteadResource[];
  readonly coinCost: number;
  readonly coinReward: number;
  readonly reputationReward: number;
  readonly researchReward: number;
}

export interface HomesteadWorldEventDefinition {
  readonly id: HomesteadWorldEventId;
  readonly title: string;
  readonly summary: string;
  readonly tone: "calm" | "opportunity" | "risk";
  readonly options: readonly HomesteadWorldEventOption[];
}

export const HOMESTEAD_WORLD_EVENTS: Readonly<
  Record<HomesteadWorldEventId, HomesteadWorldEventDefinition>
> = {
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
        description: "缴纳摊位费，换取稳定收益和少量声望。",
        costs: [],
        coinCost: 60,
        coinReward: 150,
        reputationReward: 6,
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
};

export interface HomesteadProductionJob {
  readonly recipeId: HomesteadRecipeId;
  readonly startedAt: number;
  readonly completesAt: number;
  readonly outputQuantity: number;
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
  seasonRewardsClaimed: number;
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
    | "season";
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

export interface HomesteadCollectionEntry {
  readonly id: string;
  readonly unlockedAt: number;
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
}

export interface HomesteadSpecializations {
  farm: HomesteadFarmSpecializationState;
  ranch: HomesteadRanchSpecializationState;
  mine: HomesteadMineSpecializationState;
}

export interface HomesteadGameState {
  kind: "homestead";
  version: typeof HOMESTEAD_STATE_VERSION;
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
  facilities: HomesteadFacilityState[];
  orders: HomesteadOrderState[];
  worldEvent: HomesteadWorldEventState;
  statistics: HomesteadStatistics;
  logs: HomesteadLogEntry[];
  research: HomesteadResearchState;
  specializations: HomesteadSpecializations;
  npcs: HomesteadNpcMemory[];
  season: HomesteadSeasonState;
  collections: HomesteadCollectionEntry[];
  advice: HomesteadAdviceState;
}

export interface HomesteadLinkedEconomy {
  farmRevision: number;
  ranchRevision: number;
  mineRevision: number;
  coins: number;
  farmProduce: FarmingCropCounts;
  ranchProducts: RanchProductCounts;
  mineOres: MineOreCounts;
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
  readonly maximumLevel: number;
  readonly nextUpgrade: {
    readonly level: number;
    readonly coinCost: number;
    readonly ironIngotCost: number;
    readonly requiredResearch: HomesteadResearchNodeId;
    readonly canUpgrade: boolean;
  } | null;
}

export interface HomesteadOrderView extends HomesteadOrderState {
  readonly template: HomesteadOrderTemplate;
  readonly requirements: readonly HomesteadResourceView[];
  readonly canComplete: boolean;
}

export interface HomesteadResearchView {
  readonly definition: (typeof HOMESTEAD_RESEARCH)[HomesteadResearchNodeId];
  readonly unlocked: boolean;
  readonly canUnlock: boolean;
  readonly missingPrerequisites: readonly HomesteadResearchNodeId[];
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
}

export interface HomesteadMineLayerView {
  readonly definition: (typeof HOMESTEAD_MINE_LAYERS)[HomesteadMineLayerId];
  readonly discovered: boolean;
  readonly canSurvey: boolean;
  readonly lockedByResearch: boolean;
  readonly lockedByProtection: boolean;
  readonly hasResources: boolean;
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
}

export interface HomesteadCollectionView extends HomesteadCollectionDefinition {
  readonly unlocked: boolean;
  readonly unlockedAt: number | null;
}

export interface HomesteadGameView {
  readonly kind: "homestead";
  readonly version: typeof HOMESTEAD_STATE_VERSION;
  readonly revision: number;
  readonly serverTime: number;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly reputation: number;
  readonly researchPoints: number;
  readonly coins: number;
  readonly goods: HomesteadGoodCounts;
  readonly facilities: readonly HomesteadFacilityView[];
  readonly recipes: readonly HomesteadRecipeView[];
  readonly orders: readonly HomesteadOrderView[];
  readonly worldEvent: HomesteadWorldEventState & {
    readonly definition: HomesteadWorldEventDefinition;
  };
  readonly research: readonly HomesteadResearchView[];
  readonly specializations: HomesteadSpecializations & {
    readonly cropFamilies: readonly HomesteadCropFamilyView[];
    readonly feedPrograms: readonly HomesteadFeedProgramView[];
    readonly mineLayers: readonly HomesteadMineLayerView[];
    readonly canManageFarmToday: boolean;
    readonly canManageRanchToday: boolean;
    readonly canManageMineToday: boolean;
    readonly nextProtectionUpgrade: {
      readonly level: number;
      readonly coinCost: number;
      readonly ironIngotCost: number;
      readonly miningKitCost: number;
      readonly canUpgrade: boolean;
    } | null;
  };
  readonly npcs: readonly HomesteadNpcView[];
  readonly season: HomesteadSeasonState & {
    readonly progressPercent: number;
    readonly milestones: readonly HomesteadSeasonMilestoneView[];
  };
  readonly collections: readonly HomesteadCollectionView[];
  readonly advice: HomesteadAdviceState;
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
  return new Date(now).toISOString().slice(0, 10);
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

function createFacilities(): HomesteadFacilityState[] {
  return HOMESTEAD_FACILITY_IDS.map((id) => ({
    id,
    built: id === "mill",
    level: id === "mill" ? 1 : 0,
    job: null,
  }));
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

function createNpcs(): HomesteadNpcMemory[] {
  return HOMESTEAD_NPC_IDS.map((npcId) => ({
    npcId,
    affinity: 0,
    trust: 0,
    lastConversationDayKey: null,
    lastTopicId: null,
    lastDialogue: `${HOMESTEAD_NPCS[npcId].name}正在等待今天的经营记录。`,
    facts: [],
  }));
}

function createAdvice(key: string, now: number): HomesteadAdviceState {
  return {
    dayKey: key,
    source: "rules",
    headline: "让三条产业链同时向前走",
    narrative: "庄园刚刚建立，三位顾问正在整理农田、牧舍和矿层资料。",
    recommendation: "优先完成今日事件，再从轮作、牧群和勘探中各选择一项长期行动。",
    npcId: "agronomist_lin",
    npcLine: "先建立稳定循环，产量自然会跟上。",
    generatedAt: now,
  };
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
  return game.research.unlocked.includes(nodeId);
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
): void {
  const existing = npc.facts.find((fact) => fact.key === key);
  if (existing) {
    existing.value = value;
    existing.at = now;
  } else {
    npc.facts.unshift({ key, value, at: now });
    if (npc.facts.length > 8) npc.facts.length = 8;
  }
}

function ruleAdvice(
  game: HomesteadGameState,
  economy: HomesteadLinkedEconomy | null,
  now: number,
): HomesteadAdviceState {
  const farm = game.specializations.farm;
  const ranch = game.specializations.ranch;
  const mine = game.specializations.mine;
  if (farm.soilHealth < 45) {
    return {
      dayKey: game.dayKey,
      source: "rules",
      headline: "土壤健康正在成为瓶颈",
      narrative: "连续经营让部分田块的恢复速度落后于牧场和矿山。",
      recommendation: "切换作物科属，并在解锁土壤科学后投入一份土壤改良剂。",
      npcId: "agronomist_lin",
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
      recommendation: "完成动物营养研究，使用均衡或矿物强化饲料。",
      npcId: "veterinarian_su",
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
      recommendation: "准备铁锭和矿工防护套装，将矿山防护提升到一级。",
      npcId: "engineer_qiao",
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
      ? "保持三个板块都在生产，并优先加工粗饲料、铁锭和土壤改良剂。"
      : "选择一个研究分支推进，同时为下一档赛季里程碑保留订单资源。",
    npcId: "agronomist_lin",
    npcLine: "稳定不是停在原地，而是每条链都留有余量。",
    generatedAt: now,
  };
}

function ensureLongTermState(game: HomesteadGameState, now: number): boolean {
  let changed = false;
  const raw = game as HomesteadGameState & Record<string, unknown>;
  if (!raw.research || typeof raw.research !== "object") {
    game.research = { unlocked: [] };
    changed = true;
  }
  if (!raw.specializations || typeof raw.specializations !== "object") {
    game.specializations = createSpecializations();
    changed = true;
  }
  if (!Array.isArray(raw.npcs)) {
    game.npcs = createNpcs();
    changed = true;
  }
  if (!raw.season || typeof raw.season !== "object") {
    game.season = createSeason(now);
    changed = true;
  }
  if (!Array.isArray(raw.collections)) {
    game.collections = [];
    changed = true;
  }
  if (!raw.advice || typeof raw.advice !== "object") {
    game.advice = createAdvice(game.dayKey, now);
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
    | "seasonRewardsClaimed"
  > = {
    facilityUpgrades: 0,
    researchUnlocked: 0,
    fieldPlansCompleted: 0,
    herdProgramsCompleted: 0,
    surveysCompleted: 0,
    npcConversations: 0,
    seasonRewardsClaimed: 0,
  };
  for (const [key, fallback] of Object.entries(statisticDefaults)) {
    const statistics = game.statistics as unknown as Record<string, unknown>;
    if (!isNonNegativeInteger(statistics[key])) {
      statistics[key] = fallback;
      changed = true;
    }
  }
  const currentSeason = createSeason(now);
  if (game.season.id !== currentSeason.id) {
    game.season = currentSeason;
    game.advice = createAdvice(game.dayKey, now);
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

function ordersForDay(seed: string, key: string): HomesteadOrderState[] {
  return selectDailyIds(
    HOMESTEAD_ORDER_TEMPLATE_IDS,
    HOMESTEAD_DAILY_ORDER_COUNT,
    `${seed}:orders:${key}`,
  ).map((templateId, index) => ({
    id: `${key}:${index}:${templateId}`,
    templateId,
    dayKey: key,
    completed: false,
  }));
}

function eventForDay(seed: string, key: string): HomesteadWorldEventState {
  const eventIds = HOMESTEAD_WORLD_EVENT_IDS;
  const eventId = eventIds[
    hashText(`${seed}:event:${key}`) % eventIds.length
  ]!;
  const definition = HOMESTEAD_WORLD_EVENTS[eventId];
  return {
    eventId,
    dayKey: key,
    selectedOptionId: null,
    narrative: definition.summary,
    source: "rules",
  };
}

function addLog(
  game: HomesteadGameState,
  type: HomesteadLogEntry["type"],
  message: string,
  now: number,
): void {
  game.logs.unshift({
    id: `${game.revision + 1}:${now}:${type}`,
    at: now,
    type,
    message,
  });
  if (game.logs.length > HOMESTEAD_MAX_LOGS) {
    game.logs.length = HOMESTEAD_MAX_LOGS;
  }
}

function finishMutation(game: HomesteadGameState, now: number): void {
  game.revision += 1;
  game.updatedAt = Math.max(game.updatedAt, now);
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
  return game.goods[resource.itemId];
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
    } else {
      game.goods[resource.itemId] -= resource.quantity;
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
}): HomesteadGameState {
  const key = dayKey(input.now);
  return {
    kind: "homestead",
    version: HOMESTEAD_STATE_VERSION,
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
    facilities: createFacilities(),
    orders: ordersForDay(input.seed, key),
    worldEvent: eventForDay(input.seed, key),
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
      seasonRewardsClaimed: 0,
    },
    logs: [],
    research: { unlocked: [] },
    specializations: createSpecializations(),
    npcs: createNpcs(),
    season: createSeason(input.now),
    collections: [{ id: "facility:mill", unlockedAt: input.now }],
    advice: createAdvice(key, input.now),
  };
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
  game.specializations.farm.soilHealth = clamp(
    game.specializations.farm.soilHealth - 2,
    0,
    100,
  );
  game.specializations.ranch.herdHealth = clamp(
    game.specializations.ranch.herdHealth - 3,
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
  game.dayKey = key;
  game.orders = ordersForDay(game.seed, key);
  game.worldEvent = eventForDay(game.seed, key);
  game.advice = ruleAdvice(game, null, now);
  addLog(game, "event", "新一天的联合订单和庄园事件已经发布。", now);
  finishMutation(game, now);
  return game;
}

export function applyHomesteadWorldEventDecision(
  state: HomesteadGameState,
  eventId: HomesteadWorldEventId,
  source: HomesteadWorldEventState["source"],
  now: number,
  content?: {
    readonly narrative?: string;
    readonly recommendation?: string;
    readonly npcLine?: string;
  },
): HomesteadGameState {
  const definition = HOMESTEAD_WORLD_EVENTS[eventId];
  if (!definition) {
    throw new HomesteadRuleError(
      "HOMESTEAD_INVALID_ACTION",
      "未知的庄园世界事件",
    );
  }
  const game = structuredClone(state);
  ensureLongTermState(game, now);
  game.worldEvent = {
    eventId,
    dayKey: game.dayKey,
    selectedOptionId: null,
    narrative: content?.narrative?.trim() || definition.summary,
    source,
  };
  if (content?.recommendation?.trim() || content?.npcLine?.trim()) {
    game.advice = {
      dayKey: game.dayKey,
      source,
      headline: definition.title,
      narrative: content.narrative?.trim() || definition.summary,
      recommendation:
        content.recommendation?.trim() ||
        "比较两个固定选项的资源成本，再决定今日三业重点。",
      npcId: game.advice.npcId,
      npcLine:
        content.npcLine?.trim() ||
        "规则给出了边界，选择仍然属于庄主。",
      generatedAt: now,
    };
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
  if (npcId === "agronomist_lin") {
    return topicId === "soil"
      ? `当前土壤健康为 ${game.specializations.farm.soilHealth}，低于 50 时应优先恢复。`
      : `当前连续轮作 ${game.specializations.farm.rotationStreak} 次，继续更换科属能保持恢复。`;
  }
  if (npcId === "veterinarian_su") {
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
  game.advice = ruleAdvice(game, economy, now);
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
  let farmChanged = false;
  let ranchChanged = false;
  let mineChanged = false;

  if (action.type === "homestead_build_facility") {
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
    const changed = consumeResources(game, economy, recipe.inputs);
    farmChanged ||= changed.farmChanged;
    ranchChanged ||= changed.ranchChanged;
    mineChanged ||= changed.mineChanged;
    const speedMultiplier =
      1 +
      Math.max(0, facility.level - 1) * 0.2 +
      (hasResearch(game, "automation") ? 0.1 : 0);
    const outputQuantity =
      recipe.output.quantity +
      Math.max(0, facility.level - 1) +
      (hasResearch(game, "automation") ? 1 : 0);
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
    unlockCollection(game, `recipe:${recipe.id}`, effectiveNow);
    addLog(
      game,
      "production",
      `${recipe.name}完成，获得 ${outputQuantity} 份${recipe.output.itemId}。`,
      effectiveNow,
    );
  } else if (action.type === "homestead_complete_order") {
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
    if (economy.coins < option.coinCost) {
      throw new HomesteadRuleError(
        "HOMESTEAD_NOT_ENOUGH_COINS",
        "金币不足",
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
    game.statistics.eventsResolved += 1;
    addSeasonScore(game, 4, "community");
    game.worldEvent.selectedOptionId = option.id;
    addLog(
      game,
      "event",
      `${event.title}：选择了“${option.label}”。`,
      effectiveNow,
    );
  } else if (action.type === "homestead_unlock_research") {
    const definition = HOMESTEAD_RESEARCH[action.nodeId];
    if (!definition) {
      throw new HomesteadRuleError(
        "HOMESTEAD_RESEARCH_NOT_FOUND",
        "研究节点不存在",
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
    if (
      missing.length > 0 ||
      game.reputation < definition.requiredReputation ||
      game.researchPoints < definition.researchCost
    ) {
      throw new HomesteadRuleError(
        "HOMESTEAD_RESEARCH_LOCKED",
        "前置研究、声望或研究点不足",
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
    if (game.goods.iron_ingot < upgrade.ironIngotCost) {
      throw new HomesteadRuleError(
        "HOMESTEAD_NOT_ENOUGH_RESOURCES",
        "铁锭不足",
      );
    }
    economy.coins -= upgrade.coinCost;
    economy.farmRevision += 1;
    farmChanged = true;
    game.goods.iron_ingot -= upgrade.ironIngotCost;
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
    if (action.useFertilizer && game.goods.soil_conditioner < 1) {
      throw new HomesteadRuleError(
        "HOMESTEAD_NOT_ENOUGH_RESOURCES",
        "土壤改良剂不足",
      );
    }
    const rotating = farm.lastCropFamily !== null &&
      farm.lastCropFamily !== action.cropFamily;
    if (action.useFertilizer) {
      game.goods.soil_conditioner -= 1;
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
    economy.farmProduce[definition.rewardCropId] +=
      definition.rewardQuantity +
      (hasResearch(game, "crop_rotation") && rotating ? 1 : 0) +
      (farm.yieldBonusPercent >= 10 ? 1 : 0);
    farmChanged = true;
    game.statistics.fieldPlansCompleted += 1;
    addSeasonScore(game, rotating ? 4 : 3, "specializations");
    unlockCollection(game, `farm:${action.cropFamily}`, effectiveNow);
    addLog(
      game,
      "farm",
      `完成${definition.name}轮作计划，土壤健康变化 ${soilDelta >= 0 ? "+" : ""}${soilDelta}。`,
      effectiveNow,
    );
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
    if (
      definition.goodCost &&
      game.goods[definition.goodCost.itemId] < definition.goodCost.quantity
    ) {
      throw new HomesteadRuleError(
        "HOMESTEAD_NOT_ENOUGH_RESOURCES",
        "加工饲料不足",
      );
    }
    if (definition.goodCost) {
      game.goods[definition.goodCost.itemId] -= definition.goodCost.quantity;
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
    economy.ranchProducts.egg +=
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
    if (
      economy.coins < coinCost ||
      game.goods.iron_ingot < ironIngotCost ||
      game.goods.mining_kit < miningKitCost
    ) {
      throw new HomesteadRuleError(
        "HOMESTEAD_NOT_ENOUGH_RESOURCES",
        "矿山防护升级所需金币或加工品不足",
      );
    }
    economy.coins -= coinCost;
    economy.farmRevision += 1;
    farmChanged = true;
    game.goods.iron_ingot -= ironIngotCost;
    game.goods.mining_kit -= miningKitCost;
    mine.protectionLevel = level;
    addSeasonScore(game, 5, "specializations");
    addLog(game, "mine", `矿山防护提升到 ${level} 级。`, effectiveNow);
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
    if (game.goods.mining_kit < definition.kitCost) {
      throw new HomesteadRuleError(
        "HOMESTEAD_NOT_ENOUGH_RESOURCES",
        "矿工防护套装不足",
      );
    }
    game.goods.mining_kit -= definition.kitCost;
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
    economy.mineOres[definition.rewardDepositId] +=
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
      `完成${definition.name}勘探，获得 ${definition.rewardQuantity} 份${definition.rewardDepositId}线索。`,
      effectiveNow,
    );
  } else if (action.type === "homestead_talk_npc") {
    const npc = game.npcs.find(({ npcId }) => npcId === action.npcId);
    const definition = HOMESTEAD_NPCS[action.npcId];
    if (!npc || !definition) {
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
    addNpcFact(
      npc,
      action.topicId,
      npc.lastDialogue,
      effectiveNow,
    );
    if (npc.trust >= 2) {
      unlockCollection(game, `npc:${npc.npcId}`, effectiveNow);
    }
    game.statistics.npcConversations += 1;
    addSeasonScore(game, 2, "community");
    addLog(
      game,
      "npc",
      `${definition.name}：${npc.lastDialogue}`,
      effectiveNow,
    );
  } else if (action.type === "homestead_claim_season_reward") {
    const milestone = HOMESTEAD_SEASON_MILESTONES[action.milestoneId];
    if (!milestone) {
      throw new HomesteadRuleError(
        "HOMESTEAD_INVALID_ACTION",
        "赛季里程碑不存在",
      );
    }
    if (game.season.claimedMilestones.includes(milestone.id)) {
      throw new HomesteadRuleError(
        "HOMESTEAD_SEASON_REWARD_CLAIMED",
        "赛季奖励已经领取",
      );
    }
    if (game.season.score < milestone.score) {
      throw new HomesteadRuleError(
        "HOMESTEAD_SEASON_REWARD_LOCKED",
        "赛季积分尚未达到领取条件",
      );
    }
    economy.coins += milestone.coinReward;
    economy.farmRevision += 1;
    farmChanged = true;
    game.researchPoints += milestone.researchReward;
    if (milestone.goodReward) {
      game.goods[milestone.goodReward.itemId] +=
        milestone.goodReward.quantity;
    }
    game.season.claimedMilestones.push(milestone.id);
    game.statistics.seasonRewardsClaimed += 1;
    unlockCollection(game, `season:${milestone.id}`, effectiveNow);
    addLog(
      game,
      "season",
      `领取赛季里程碑“${milestone.name}”。`,
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

export function getHomesteadGameView(
  state: HomesteadGameState,
  economy: HomesteadLinkedEconomy,
  now: number,
): HomesteadGameView {
  const game = refreshHomesteadGame(state, now);
  if (game.advice.dayKey !== game.dayKey || game.advice.source === "rules") {
    game.advice = ruleAdvice(game, economy, now);
  }
  const researchUnlocked = new Set(game.research.unlocked);
  return {
    kind: "homestead",
    version: HOMESTEAD_STATE_VERSION,
    revision: game.revision,
    serverTime: now,
    ownerId: game.ownerId,
    ownerName: game.ownerName,
    reputation: game.reputation,
    researchPoints: game.researchPoints,
    coins: economy.coins,
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
      return {
        ...structuredClone(facility),
        definition,
        ready,
        progress,
        canBuild:
          !facility.built &&
          game.reputation >= definition.requiredReputation &&
          economy.coins >= definition.coinCost,
        maximumLevel: HOMESTEAD_MAX_FACILITY_LEVEL,
        nextUpgrade: upgrade
          ? {
              ...upgrade,
              canUpgrade:
                facility.job === null &&
                economy.coins >= upgrade.coinCost &&
                game.goods.iron_ingot >= upgrade.ironIngotCost &&
                researchUnlocked.has(upgrade.requiredResearch),
            }
          : null,
      };
    }),
    recipes: HOMESTEAD_RECIPE_IDS.map((recipeId) => {
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
        (researchUnlocked.has("automation") ? 0.1 : 0);
      return {
        ...recipe,
        facilityBuilt: facility.built,
        facilityBusy: facility.job !== null,
        inputsView,
        canStart:
          facility.built &&
          facility.job === null &&
          inputsView.every((resource) => resource.sufficient),
        effectiveDurationSeconds: Math.max(
          60,
          Math.round(recipe.durationSeconds / speedMultiplier),
        ),
        effectiveOutputQuantity:
          recipe.output.quantity +
          Math.max(0, facility.level - 1) +
          (researchUnlocked.has("automation") ? 1 : 0),
      };
    }),
    orders: game.orders.map((order) => {
      const template = HOMESTEAD_ORDER_TEMPLATES[order.templateId];
      const requirements = template.requirements.map((resource) =>
        resourceView(game, economy, resource)
      );
      return {
        ...order,
        template,
        requirements,
        canComplete:
          !order.completed &&
          requirements.every((resource) => resource.sufficient),
      };
    }),
    worldEvent: {
      ...structuredClone(game.worldEvent),
      definition: HOMESTEAD_WORLD_EVENTS[game.worldEvent.eventId],
    },
    research: HOMESTEAD_RESEARCH_NODE_IDS.map((nodeId) => {
      const definition = HOMESTEAD_RESEARCH[nodeId];
      const missingPrerequisites = definition.prerequisites.filter(
        (required) => !researchUnlocked.has(required),
      );
      return {
        definition,
        unlocked: researchUnlocked.has(nodeId),
        canUnlock:
          !researchUnlocked.has(nodeId) &&
          missingPrerequisites.length === 0 &&
          game.reputation >= definition.requiredReputation &&
          game.researchPoints >= definition.researchCost,
        missingPrerequisites,
      };
    }),
    specializations: {
      ...structuredClone(game.specializations),
      cropFamilies: HOMESTEAD_CROP_FAMILY_IDS.map((cropFamily) => ({
        definition: HOMESTEAD_CROP_FAMILIES[cropFamily],
        canPlan:
          game.specializations.farm.lastManagedDayKey !== game.dayKey,
        rotationImprovesSoil:
          game.specializations.farm.lastCropFamily !== null &&
          game.specializations.farm.lastCropFamily !== cropFamily,
      })),
      feedPrograms: HOMESTEAD_FEED_PROGRAM_IDS.map((programId) => {
        const definition = HOMESTEAD_FEED_PROGRAMS[programId];
        const lockedByResearch = Boolean(
          definition.requiredResearch &&
            !researchUnlocked.has(definition.requiredResearch),
        );
        const hasResources =
          !definition.goodCost ||
          game.goods[definition.goodCost.itemId] >=
            definition.goodCost.quantity;
        return {
          definition,
          canRun:
            game.specializations.ranch.lastManagedDayKey !== game.dayKey &&
            !lockedByResearch &&
            hasResources,
          lockedByResearch,
          hasResources,
        };
      }),
      mineLayers: HOMESTEAD_MINE_LAYER_IDS.map((layerId) => {
        const definition = HOMESTEAD_MINE_LAYERS[layerId];
        const lockedByResearch = Boolean(
          definition.requiredResearch &&
            !researchUnlocked.has(definition.requiredResearch),
        );
        const lockedByProtection =
          game.specializations.mine.protectionLevel <
          definition.requiredProtection;
        const hasResources =
          game.goods.mining_kit >= definition.kitCost;
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
              return {
                level,
                coinCost,
                ironIngotCost,
                miningKitCost,
                canUpgrade:
                  economy.coins >= coinCost &&
                  game.goods.iron_ingot >= ironIngotCost &&
                  game.goods.mining_kit >= miningKitCost,
              };
            })(),
    },
    npcs: game.npcs.map((npc) => ({
      ...structuredClone(npc),
      definition: HOMESTEAD_NPCS[npc.npcId],
      canTalkToday: npc.lastConversationDayKey !== game.dayKey,
    })),
    season: {
      ...structuredClone(game.season),
      progressPercent: clamp(
        Math.round(
          game.season.score /
            HOMESTEAD_SEASON_MILESTONES.gold.score *
            100,
        ),
        0,
        100,
      ),
      milestones: HOMESTEAD_SEASON_MILESTONE_IDS.map((milestoneId) => {
        const definition = HOMESTEAD_SEASON_MILESTONES[milestoneId];
        const claimed = game.season.claimedMilestones.includes(milestoneId);
        return {
          definition,
          claimed,
          canClaim: !claimed && game.season.score >= definition.score,
        };
      }),
    },
    collections: longTermCollectionDefinitions({
      facilityIds: HOMESTEAD_FACILITY_IDS,
      facilityNames: Object.fromEntries(
        HOMESTEAD_FACILITY_IDS.map((id) => [id, HOMESTEAD_FACILITIES[id].name]),
      ),
      recipeIds: HOMESTEAD_RECIPE_IDS,
      recipeNames: Object.fromEntries(
        HOMESTEAD_RECIPE_IDS.map((id) => [id, HOMESTEAD_RECIPES[id].name]),
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
    advice: structuredClone(game.advice),
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
    HOMESTEAD_GOOD_IDS.every((id) => isNonNegativeInteger(value[id]))
  );
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
    !Array.isArray(value.logs)
  ) {
    throw new Error("庄园存档结构无效");
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
    !["rules", "llm"].includes(String(value.worldEvent.source))
  ) {
    throw new Error("庄园世界事件存档无效");
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
      value.npcs.length !== HOMESTEAD_NPC_IDS.length ||
      value.npcs.some((npc, index) =>
        !isRecord(npc) ||
        npc.npcId !== HOMESTEAD_NPC_IDS[index] ||
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
          ),
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
      !isNonNegativeInteger(value.advice.generatedAt)
    )
  ) {
    throw new Error("庄园经营建议存档无效");
  }
}
