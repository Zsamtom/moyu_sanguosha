import type { FarmingCropId } from "./farming.js";
import type { HomesteadInfrastructureId } from "./homestead-infrastructure.js";
import type { MineDepositId } from "./mine.js";
import type { EstateTownId } from "./towns/registry.js";

export const HOMESTEAD_RESEARCH_NODE_IDS = [
  "soil_science",
  "crop_rotation",
  "precision_irrigation",
  "animal_nutrition",
  "animal_genetics",
  "geology",
  "deep_mining",
  "estate_engineering",
  "automation",
  "civic_network",
  "cooperative_logistics",
  "seasonal_mastery",
  "permafrost_science",
  "alpine_rotation",
  "thermal_irrigation",
  "yak_nutrition",
  "cold_resilient_breeding",
  "glacial_geology",
  "thermal_vein_mining",
  "cold_region_engineering",
  "frostpeak_automation",
  "mountain_mutual_aid",
  "avalanche_logistics",
  "aurora_honor",
] as const;

export type HomesteadResearchNodeId =
  (typeof HOMESTEAD_RESEARCH_NODE_IDS)[number];

export type HomesteadResearchBranch =
  | "farm"
  | "ranch"
  | "mine"
  | "estate"
  | "community";

export type HomesteadResearchStatisticId =
  | "jobsCollected"
  | "ordersCompleted"
  | "facilitiesBuilt"
  | "fieldPlansCompleted"
  | "herdProgramsCompleted"
  | "surveysCompleted"
  | "npcConversations"
  | "valueRoutesCompleted";

export type HomesteadResearchRequirement =
  | {
      readonly kind: "statistic";
      readonly statistic: HomesteadResearchStatisticId;
      readonly required: number;
      readonly label: string;
    }
  | {
      readonly kind: "mine_protection";
      readonly required: number;
      readonly label: string;
    }
  | {
      readonly kind: "infrastructure";
      readonly infrastructureId: HomesteadInfrastructureId;
      readonly required: number;
      readonly label: string;
    }
  | {
      readonly kind: "honor";
      readonly required: number;
      readonly label: string;
    }
  | {
      readonly kind: "town_rhythm";
      readonly required: number;
      readonly label: string;
    };

export interface HomesteadResearchDefinition {
  readonly id: HomesteadResearchNodeId;
  readonly name: string;
  readonly description: string;
  readonly branch: HomesteadResearchBranch;
  readonly researchCost: number;
  readonly requiredReputation: number;
  readonly prerequisites: readonly HomesteadResearchNodeId[];
  /** Research is earned through relevant operations, not points alone. */
  readonly requirements: readonly HomesteadResearchRequirement[];
  readonly production?: Readonly<
    Partial<
      Record<
        "farm" | "ranch" | "mine",
        { readonly yieldPercent: number; readonly durationPercent: number }
      >
    >
  >;
  readonly unlocks: readonly string[];
}
export const HOMESTEAD_RESEARCH: Readonly<
  Record<HomesteadResearchNodeId, HomesteadResearchDefinition>
> = {
  soil_science: {
    id: "soil_science",
    name: "土壤科学",
    description: "解锁土壤改良剂使用，提高轮作恢复效果，并使农场产出 +3%。",
    branch: "farm",
    researchCost: 8,
    requiredReputation: 8,
    prerequisites: [],
    requirements: [
      { kind: "statistic", statistic: "fieldPlansCompleted", required: 1, label: "完成轮作计划" },
    ],
    production: { farm: { yieldPercent: 3, durationPercent: 0 } },
    unlocks: ["土壤改良剂", "精细轮作记录"],
  },
  crop_rotation: {
    id: "crop_rotation",
    name: "系统轮作",
    description: "连续更换作物科属时获得更高土壤健康和季节积分；农场产出 +5%、工期 -5%。",
    branch: "farm",
    researchCost: 18,
    requiredReputation: 30,
    prerequisites: ["soil_science"],
    requirements: [
      { kind: "statistic", statistic: "fieldPlansCompleted", required: 3, label: "累计轮作计划" },
      { kind: "town_rhythm", required: 1, label: "完成河谷水肥循环" },
    ],
    production: { farm: { yieldPercent: 5, durationPercent: -5 } },
    unlocks: ["高效轮作", "果园轮作项目"],
  },
  precision_irrigation: {
    id: "precision_irrigation",
    name: "精准灌溉",
    description: "依据墒情分区供水，使农场工期 -6%，并开放河谷节水工程。",
    branch: "farm",
    researchCost: 32,
    requiredReputation: 70,
    prerequisites: ["crop_rotation"],
    requirements: [
      { kind: "statistic", statistic: "fieldPlansCompleted", required: 8, label: "累计轮作计划" },
      { kind: "town_rhythm", required: 3, label: "完成河谷水肥循环" },
      { kind: "infrastructure", infrastructureId: "river_irrigation", required: 1, label: "河谷水利实验站等级" },
    ],
    production: { farm: { yieldPercent: 0, durationPercent: -6 } },
    unlocks: ["河谷节水工程", "供水管网预防维护"],
  },
  animal_nutrition: {
    id: "animal_nutrition",
    name: "动物营养学",
    description: "解锁均衡饲料方案并提高牧群健康恢复；牧场产出 +3%。",
    branch: "ranch",
    researchCost: 9,
    requiredReputation: 10,
    prerequisites: [],
    requirements: [
      { kind: "statistic", statistic: "herdProgramsCompleted", required: 1, label: "完成牧群方案" },
    ],
    production: { ranch: { yieldPercent: 3, durationPercent: 0 } },
    unlocks: ["均衡饲料", "牧群健康诊断"],
  },
  animal_genetics: {
    id: "animal_genetics",
    name: "动物特质研究",
    description: "解锁矿物强化饲料，提高稀有特质发现机会；牧场产出 +5%。",
    branch: "ranch",
    researchCost: 22,
    requiredReputation: 45,
    prerequisites: ["animal_nutrition"],
    requirements: [
      { kind: "statistic", statistic: "herdProgramsCompleted", required: 5, label: "累计牧群方案" },
      { kind: "town_rhythm", required: 1, label: "完成河谷水肥循环" },
    ],
    production: { ranch: { yieldPercent: 5, durationPercent: 0 } },
    unlocks: ["矿物强化饲料", "稀有特质追踪"],
  },
  geology: {
    id: "geology",
    name: "地层勘探",
    description: "开放中层矿脉调查，提高勘探进度，并使矿山产出 +3%。",
    branch: "mine",
    researchCost: 9,
    requiredReputation: 10,
    prerequisites: [],
    requirements: [
      { kind: "statistic", statistic: "surveysCompleted", required: 1, label: "完成矿层调查" },
    ],
    production: { mine: { yieldPercent: 3, durationPercent: 0 } },
    unlocks: ["中层矿带", "地层档案"],
  },
  deep_mining: {
    id: "deep_mining",
    name: "深层采矿",
    description: "开放深层和远古矿层；矿山产出 +5%、工期 -5%，但调查仍需要更高防护等级。",
    branch: "mine",
    researchCost: 24,
    requiredReputation: 55,
    prerequisites: ["geology"],
    requirements: [
      { kind: "statistic", statistic: "surveysCompleted", required: 4, label: "累计矿层调查" },
      { kind: "mine_protection", required: 1, label: "矿山防护等级" },
      { kind: "town_rhythm", required: 1, label: "完成河谷水肥循环" },
    ],
    production: { mine: { yieldPercent: 5, durationPercent: -5 } },
    unlocks: ["深层矿带", "远古遗迹层"],
  },
  estate_engineering: {
    id: "estate_engineering",
    name: "庄园工程学",
    description: "允许加工设施升级到二级，并通过标准化流程使农牧矿工期均 -3%。",
    branch: "estate",
    researchCost: 18,
    requiredReputation: 35,
    prerequisites: [],
    requirements: [
      { kind: "statistic", statistic: "jobsCollected", required: 4, label: "完成加工任务" },
      { kind: "statistic", statistic: "facilitiesBuilt", required: 2, label: "新建设施" },
    ],
    production: {
      farm: { yieldPercent: 0, durationPercent: -3 },
      ranch: { yieldPercent: 0, durationPercent: -3 },
      mine: { yieldPercent: 0, durationPercent: -3 },
    },
    unlocks: ["加工设施二级", "标准化工序"],
  },
  automation: {
    id: "automation",
    name: "三业自动化",
    description: "允许设施升级到三级，并使农牧矿工期再 -7%。",
    branch: "estate",
    researchCost: 48,
    requiredReputation: 130,
    prerequisites: [
      "crop_rotation",
      "animal_genetics",
      "deep_mining",
      "estate_engineering",
    ],
    requirements: [
      { kind: "statistic", statistic: "jobsCollected", required: 20, label: "完成加工任务" },
      { kind: "town_rhythm", required: 6, label: "完成河谷水肥循环" },
      { kind: "infrastructure", infrastructureId: "operations_center", required: 2, label: "三业调度中心等级" },
    ],
    production: {
      farm: { yieldPercent: 0, durationPercent: -7 },
      ranch: { yieldPercent: 0, durationPercent: -7 },
      mine: { yieldPercent: 0, durationPercent: -7 },
    },
    unlocks: ["加工设施三级", "自动调度"],
  },
  civic_network: {
    id: "civic_network",
    name: "城镇协作网络",
    description: "NPC 对话获得更多信任，并解锁长期城镇记忆。",
    branch: "community",
    researchCost: 16,
    requiredReputation: 35,
    prerequisites: [],
    requirements: [
      { kind: "statistic", statistic: "npcConversations", required: 3, label: "完成顾问对话" },
    ],
    unlocks: ["顾问长期记忆", "顾问信任增益"],
  },
  cooperative_logistics: {
    id: "cooperative_logistics",
    name: "合作社联运",
    description: "建立河谷集货标准，开放高级跨城合同并提高每日物流弹性。",
    branch: "community",
    researchCost: 30,
    requiredReputation: 80,
    prerequisites: ["civic_network", "estate_engineering"],
    requirements: [
      { kind: "statistic", statistic: "ordersCompleted", required: 4, label: "完成联合订单" },
      { kind: "statistic", statistic: "valueRoutesCompleted", required: 3, label: "完成增值路线" },
      { kind: "town_rhythm", required: 3, label: "完成河谷水肥循环" },
      { kind: "infrastructure", infrastructureId: "supply_hub", required: 1, label: "综合仓配站等级" },
    ],
    unlocks: ["高级跨城合同", "集货仓二级"],
  },
  seasonal_mastery: {
    id: "seasonal_mastery",
    name: "庄园荣誉学",
    description: "高难度图鉴额外体现经营荣誉，并开放最高级永久荣誉奖励。",
    branch: "community",
    researchCost: 42,
    requiredReputation: 120,
    prerequisites: ["cooperative_logistics"],
    requirements: [
      { kind: "honor", required: 180, label: "庄园荣誉" },
      { kind: "town_rhythm", required: 8, label: "完成河谷水肥循环" },
    ],
    unlocks: ["传奇荣誉奖励"],
  },
  permafrost_science: {
    id: "permafrost_science",
    name: "冻土保育学",
    description: "改善冻融层结构，使霜岭农场产出 +4%。",
    branch: "farm",
    researchCost: 10,
    requiredReputation: 12,
    prerequisites: [],
    requirements: [
      { kind: "statistic", statistic: "fieldPlansCompleted", required: 1, label: "完成高寒轮作计划" },
    ],
    production: { farm: { yieldPercent: 4, durationPercent: 0 } },
    unlocks: ["温床营养基", "冻土监测"],
  },
  alpine_rotation: {
    id: "alpine_rotation",
    name: "高寒轮作",
    description: "按根茎、豆科与药草耐寒带轮作，农场产出 +4%、工期 -5%。",
    branch: "farm",
    researchCost: 20,
    requiredReputation: 35,
    prerequisites: ["permafrost_science"],
    requirements: [
      { kind: "statistic", statistic: "fieldPlansCompleted", required: 4, label: "累计高寒轮作计划" },
      { kind: "town_rhythm", required: 1, label: "完成雪线地热供能" },
    ],
    production: { farm: { yieldPercent: 4, durationPercent: -5 } },
    unlocks: ["高寒轮作", "雪线药草计划"],
  },
  thermal_irrigation: {
    id: "thermal_irrigation",
    name: "地热滴灌",
    description: "利用热力站余热维持管网，使霜岭农场工期 -7%。",
    branch: "farm",
    researchCost: 36,
    requiredReputation: 75,
    prerequisites: ["alpine_rotation"],
    requirements: [
      { kind: "statistic", statistic: "fieldPlansCompleted", required: 10, label: "累计高寒轮作计划" },
      { kind: "town_rhythm", required: 4, label: "完成雪线地热供能" },
      { kind: "infrastructure", infrastructureId: "geothermal_greenhouse", required: 1, label: "地热温室群等级" },
    ],
    production: { farm: { yieldPercent: 0, durationPercent: -7 } },
    unlocks: ["地热滴灌网", "冻裂预警"],
  },
  yak_nutrition: {
    id: "yak_nutrition",
    name: "牦牛营养学",
    description: "建立高海拔能量配方，使霜岭牧场产出 +4%。",
    branch: "ranch",
    researchCost: 11,
    requiredReputation: 12,
    prerequisites: [],
    requirements: [
      { kind: "statistic", statistic: "herdProgramsCompleted", required: 1, label: "完成高原牧群方案" },
    ],
    production: { ranch: { yieldPercent: 4, durationPercent: 0 } },
    unlocks: ["高原营养饲料", "缺氧应激诊断"],
  },
  cold_resilient_breeding: {
    id: "cold_resilient_breeding",
    name: "耐寒育种",
    description: "稳定高寒特质，使霜岭牧场产出 +5%、工期 -3%。",
    branch: "ranch",
    researchCost: 24,
    requiredReputation: 48,
    prerequisites: ["yak_nutrition"],
    requirements: [
      { kind: "statistic", statistic: "herdProgramsCompleted", required: 6, label: "累计高原牧群方案" },
      { kind: "town_rhythm", required: 1, label: "完成雪线地热供能" },
    ],
    production: { ranch: { yieldPercent: 5, durationPercent: -3 } },
    unlocks: ["耐寒特质追踪", "高地繁育计划"],
  },
  glacial_geology: {
    id: "glacial_geology",
    name: "冰川地质学",
    description: "识别冻融裂隙和霜银伴生层，使霜岭矿山产出 +4%。",
    branch: "mine",
    researchCost: 11,
    requiredReputation: 12,
    prerequisites: [],
    requirements: [
      { kind: "statistic", statistic: "surveysCompleted", required: 1, label: "完成冰川矿层调查" },
    ],
    production: { mine: { yieldPercent: 4, durationPercent: 0 } },
    unlocks: ["冰川构造带", "雪线地质档案"],
  },
  thermal_vein_mining: {
    id: "thermal_vein_mining",
    name: "热脉采掘",
    description: "沿地热脉组织安全采掘，使霜岭矿山产出 +6%、工期 -4%。",
    branch: "mine",
    researchCost: 26,
    requiredReputation: 60,
    prerequisites: ["glacial_geology"],
    requirements: [
      { kind: "statistic", statistic: "surveysCompleted", required: 5, label: "累计冰川矿层调查" },
      { kind: "mine_protection", required: 1, label: "矿山防护等级" },
      { kind: "town_rhythm", required: 1, label: "完成雪线地热供能" },
    ],
    production: { mine: { yieldPercent: 6, durationPercent: -4 } },
    unlocks: ["热脉深层", "冰川遗迹层"],
  },
  cold_region_engineering: {
    id: "cold_region_engineering",
    name: "寒区工程学",
    description: "采用保温、伸缩与抗冻标准，使霜岭三业工期均 -4%。",
    branch: "estate",
    researchCost: 20,
    requiredReputation: 40,
    prerequisites: [],
    requirements: [
      { kind: "statistic", statistic: "jobsCollected", required: 5, label: "完成低温加工任务" },
      { kind: "statistic", statistic: "facilitiesBuilt", required: 2, label: "新建设施" },
    ],
    production: {
      farm: { yieldPercent: 0, durationPercent: -4 },
      ranch: { yieldPercent: 0, durationPercent: -4 },
      mine: { yieldPercent: 0, durationPercent: -4 },
    },
    unlocks: ["加工设施二级", "抗冻结构"],
  },
  frostpeak_automation: {
    id: "frostpeak_automation",
    name: "低温自动化",
    description: "让设备在低温和降雪下稳定运行，使霜岭三业工期再 -7%。",
    branch: "estate",
    researchCost: 52,
    requiredReputation: 140,
    prerequisites: [
      "alpine_rotation",
      "cold_resilient_breeding",
      "thermal_vein_mining",
      "cold_region_engineering",
    ],
    requirements: [
      { kind: "statistic", statistic: "jobsCollected", required: 24, label: "完成低温加工任务" },
      { kind: "town_rhythm", required: 8, label: "完成雪线地热供能" },
      { kind: "infrastructure", infrastructureId: "operations_center", required: 2, label: "三业调度中心等级" },
    ],
    production: {
      farm: { yieldPercent: 0, durationPercent: -7 },
      ranch: { yieldPercent: 0, durationPercent: -7 },
      mine: { yieldPercent: 0, durationPercent: -7 },
    },
    unlocks: ["加工设施三级", "低温自动调度"],
  },
  mountain_mutual_aid: {
    id: "mountain_mutual_aid",
    name: "山地互助网络",
    description: "连接牧民、矿队与温室管理员，开放霜岭顾问长期记忆。",
    branch: "community",
    researchCost: 18,
    requiredReputation: 40,
    prerequisites: [],
    requirements: [
      { kind: "statistic", statistic: "npcConversations", required: 4, label: "完成霜岭顾问对话" },
    ],
    unlocks: ["霜岭顾问长期记忆", "互助调度"],
  },
  avalanche_logistics: {
    id: "avalanche_logistics",
    name: "雪崩物流学",
    description: "规划备用山路和集货点，开放霜岭高级跨城合同。",
    branch: "community",
    researchCost: 34,
    requiredReputation: 90,
    prerequisites: ["mountain_mutual_aid", "cold_region_engineering"],
    requirements: [
      { kind: "statistic", statistic: "ordersCompleted", required: 5, label: "完成联合订单" },
      { kind: "statistic", statistic: "valueRoutesCompleted", required: 4, label: "完成雪线增值路线" },
      { kind: "town_rhythm", required: 4, label: "完成雪线地热供能" },
      { kind: "infrastructure", infrastructureId: "supply_hub", required: 1, label: "综合仓配站等级" },
    ],
    unlocks: ["雪线高级合同", "保温货栈二级"],
  },
  aurora_honor: {
    id: "aurora_honor",
    name: "极光荣誉志",
    description: "记录高难度高寒经营成果，开放最高级永久荣誉奖励。",
    branch: "community",
    researchCost: 46,
    requiredReputation: 130,
    prerequisites: ["avalanche_logistics"],
    requirements: [
      { kind: "honor", required: 200, label: "霜岭庄园荣誉" },
      { kind: "town_rhythm", required: 10, label: "完成雪线地热供能" },
    ],
    unlocks: ["传奇荣誉奖励"],
  },
};

export const HOMESTEAD_TOWN_RESEARCH_IDS: Readonly<
  Record<EstateTownId, readonly HomesteadResearchNodeId[]>
> = {
  greenvale: HOMESTEAD_RESEARCH_NODE_IDS.slice(0, 12),
  frostpeak: HOMESTEAD_RESEARCH_NODE_IDS.slice(12),
};

export type HomesteadResearchCapability =
  | "soil_science"
  | "crop_rotation"
  | "precision_irrigation"
  | "animal_nutrition"
  | "animal_genetics"
  | "geology"
  | "deep_mining"
  | "estate_engineering"
  | "automation"
  | "civic_network"
  | "cooperative_logistics"
  | "seasonal_mastery";

const FROSTPEAK_CAPABILITY_IDS: Readonly<
  Record<HomesteadResearchCapability, HomesteadResearchNodeId>
> = {
  soil_science: "permafrost_science",
  crop_rotation: "alpine_rotation",
  precision_irrigation: "thermal_irrigation",
  animal_nutrition: "yak_nutrition",
  animal_genetics: "cold_resilient_breeding",
  geology: "glacial_geology",
  deep_mining: "thermal_vein_mining",
  estate_engineering: "cold_region_engineering",
  automation: "frostpeak_automation",
  civic_network: "mountain_mutual_aid",
  cooperative_logistics: "avalanche_logistics",
  seasonal_mastery: "aurora_honor",
};

export function researchIdsForTown(
  townId: EstateTownId,
): readonly HomesteadResearchNodeId[] {
  return HOMESTEAD_TOWN_RESEARCH_IDS[townId];
}

export function researchIdForCapability(
  townId: EstateTownId,
  capability: HomesteadResearchCapability,
): HomesteadResearchNodeId {
  return townId === "frostpeak"
    ? FROSTPEAK_CAPABILITY_IDS[capability]
    : capability;
}

export const HOMESTEAD_CROP_FAMILY_IDS = [
  "grain",
  "root",
  "orchard",
  "fiber",
] as const;

export type HomesteadCropFamily =
  (typeof HOMESTEAD_CROP_FAMILY_IDS)[number];

export interface HomesteadCropFamilyDefinition {
  readonly id: HomesteadCropFamily;
  readonly name: string;
  readonly example: string;
  readonly rewardCropId: FarmingCropId;
  readonly rewardQuantity: number;
}

export const HOMESTEAD_CROP_FAMILIES: Readonly<
  Record<HomesteadCropFamily, HomesteadCropFamilyDefinition>
> = {
  grain: {
    id: "grain",
    name: "谷物科",
    example: "小麦、玉米",
    rewardCropId: "wheat",
    rewardQuantity: 1,
  },
  root: {
    id: "root",
    name: "根茎科",
    example: "胡萝卜、南瓜",
    rewardCropId: "carrot",
    rewardQuantity: 1,
  },
  orchard: {
    id: "orchard",
    name: "果园科",
    example: "葡萄、蓝莓",
    rewardCropId: "grape",
    rewardQuantity: 1,
  },
  fiber: {
    id: "fiber",
    name: "纤维科",
    example: "棉花、向日葵",
    rewardCropId: "cotton",
    rewardQuantity: 1,
  },
};

export const HOMESTEAD_FEED_PROGRAM_IDS = [
  "pasture",
  "balanced",
  "mineral",
] as const;

export type HomesteadFeedProgramId =
  (typeof HOMESTEAD_FEED_PROGRAM_IDS)[number];

export interface HomesteadFeedProgramDefinition {
  readonly id: HomesteadFeedProgramId;
  readonly name: string;
  readonly description: string;
  readonly goodCost:
    | { readonly itemId: "coarse_feed" | "fortified_feed"; readonly quantity: number }
    | null;
  readonly healthGain: number;
  readonly traitChance: number;
  readonly requiredResearch: HomesteadResearchNodeId | null;
}

export const HOMESTEAD_FEED_PROGRAMS: Readonly<
  Record<HomesteadFeedProgramId, HomesteadFeedProgramDefinition>
> = {
  pasture: {
    id: "pasture",
    name: "自然放牧",
    description: "无需加工饲料，稳定恢复少量健康。",
    goodCost: null,
    healthGain: 4,
    traitChance: 10,
    requiredResearch: null,
  },
  balanced: {
    id: "balanced",
    name: "均衡配方",
    description: "消耗粗饲料，提高健康并增加特质发现率。",
    goodCost: { itemId: "coarse_feed", quantity: 1 },
    healthGain: 9,
    traitChance: 35,
    requiredResearch: "animal_nutrition",
  },
  mineral: {
    id: "mineral",
    name: "矿物强化配方",
    description: "消耗强化饲料，显著提高健康和稀有特质发现率。",
    goodCost: { itemId: "fortified_feed", quantity: 1 },
    healthGain: 14,
    traitChance: 65,
    requiredResearch: "animal_genetics",
  },
};

export const HOMESTEAD_ANIMAL_TRAIT_IDS = [
  "steady",
  "productive",
  "resilient",
  "fertile",
  "rare_coat",
] as const;

export type HomesteadAnimalTraitId =
  (typeof HOMESTEAD_ANIMAL_TRAIT_IDS)[number];

export const HOMESTEAD_ANIMAL_TRAIT_NAMES: Readonly<
  Record<HomesteadAnimalTraitId, string>
> = {
  steady: "性情稳定",
  productive: "高产",
  resilient: "强健",
  fertile: "繁育力",
  rare_coat: "稀有毛色",
};

export const HOMESTEAD_MINE_LAYER_IDS = [
  "shallow",
  "middle",
  "deep",
  "ancient",
] as const;

export type HomesteadMineLayerId =
  (typeof HOMESTEAD_MINE_LAYER_IDS)[number];

export interface HomesteadMineLayerDefinition {
  readonly id: HomesteadMineLayerId;
  readonly name: string;
  readonly description: string;
  readonly requiredResearch: HomesteadResearchNodeId | null;
  readonly requiredProtection: number;
  readonly kitCost: number;
  readonly rewardDepositId: MineDepositId;
  readonly rewardQuantity: number;
  readonly progressReward: number;
}

export const HOMESTEAD_MINE_LAYERS: Readonly<
  Record<HomesteadMineLayerId, HomesteadMineLayerDefinition>
> = {
  shallow: {
    id: "shallow",
    name: "浅层矿带",
    description: "风险较低，适合每日基础地质巡查。",
    requiredResearch: null,
    requiredProtection: 0,
    kitCost: 0,
    rewardDepositId: "coal",
    rewardQuantity: 1,
    progressReward: 1,
  },
  middle: {
    id: "middle",
    name: "中层构造带",
    description: "需要地层勘探知识，可稳定发现铁矿。",
    requiredResearch: "geology",
    requiredProtection: 1,
    kitCost: 0,
    rewardDepositId: "iron",
    rewardQuantity: 2,
    progressReward: 2,
  },
  deep: {
    id: "deep",
    name: "深层热液带",
    description: "需要深层采矿研究和矿工防护套装。",
    requiredResearch: "deep_mining",
    requiredProtection: 2,
    kitCost: 1,
    rewardDepositId: "silver",
    rewardQuantity: 1,
    progressReward: 3,
  },
  ancient: {
    id: "ancient",
    name: "远古遗迹层",
    description: "最高风险矿层，可能发现黄金与遗迹线索。",
    requiredResearch: "deep_mining",
    requiredProtection: 3,
    kitCost: 1,
    rewardDepositId: "gold",
    rewardQuantity: 1,
    progressReward: 5,
  },
};

export const HOMESTEAD_NPC_IDS = [
  "agronomist_lin",
  "veterinarian_su",
  "engineer_qiao",
  "agronomist_lobsang",
  "veterinarian_deji",
  "engineer_sonam",
] as const;

export type HomesteadNpcId = (typeof HOMESTEAD_NPC_IDS)[number];

export const HOMESTEAD_NPC_TOPIC_IDS = [
  "soil",
  "rotation",
  "nutrition",
  "traits",
  "layers",
  "safety",
] as const;

export type HomesteadNpcTopicId =
  (typeof HOMESTEAD_NPC_TOPIC_IDS)[number];

export interface HomesteadNpcDefinition {
  readonly id: HomesteadNpcId;
  readonly name: string;
  readonly role: string;
  readonly topics: readonly HomesteadNpcTopicId[];
}

export const HOMESTEAD_NPCS: Readonly<
  Record<HomesteadNpcId, HomesteadNpcDefinition>
> = {
  agronomist_lin: {
    id: "agronomist_lin",
    name: "林禾",
    role: "农艺师",
    topics: ["soil", "rotation"],
  },
  veterinarian_su: {
    id: "veterinarian_su",
    name: "苏岚",
    role: "兽医",
    topics: ["nutrition", "traits"],
  },
  engineer_qiao: {
    id: "engineer_qiao",
    name: "乔岩",
    role: "矿业工程师",
    topics: ["layers", "safety"],
  },
  agronomist_lobsang: {
    id: "agronomist_lobsang",
    name: "洛桑次仁",
    role: "高寒农艺师",
    topics: ["soil", "rotation"],
  },
  veterinarian_deji: {
    id: "veterinarian_deji",
    name: "德吉央金",
    role: "高原兽医",
    topics: ["nutrition", "traits"],
  },
  engineer_sonam: {
    id: "engineer_sonam",
    name: "索朗多吉",
    role: "寒区工程师",
    topics: ["layers", "safety"],
  },
};

export const HOMESTEAD_TOWN_NPC_IDS: Readonly<
  Record<EstateTownId, readonly HomesteadNpcId[]>
> = {
  greenvale: HOMESTEAD_NPC_IDS.slice(0, 3),
  frostpeak: HOMESTEAD_NPC_IDS.slice(3),
};

export function npcIdsForTown(
  townId: EstateTownId,
): readonly HomesteadNpcId[] {
  return HOMESTEAD_TOWN_NPC_IDS[townId];
}

export const HOMESTEAD_NPC_TOPIC_NAMES: Readonly<
  Record<HomesteadNpcTopicId, string>
> = {
  soil: "土壤诊断",
  rotation: "轮作规划",
  nutrition: "饲料营养",
  traits: "动物特质",
  layers: "矿层判断",
  safety: "矿井防护",
};

export const HOMESTEAD_HONOR_MILESTONE_IDS = [
  "newcomer",
  "steward",
  "specialist",
  "exemplar",
  "legend",
] as const;

export type HomesteadHonorMilestoneId =
  (typeof HOMESTEAD_HONOR_MILESTONE_IDS)[number];

/** @deprecated Kept as a save/client migration alias. */
export const HOMESTEAD_SEASON_MILESTONE_IDS = HOMESTEAD_HONOR_MILESTONE_IDS;
/** @deprecated Use HomesteadHonorMilestoneId. */
export type HomesteadSeasonMilestoneId = HomesteadHonorMilestoneId;

export interface HomesteadHonorMilestoneDefinition {
  readonly id: HomesteadHonorMilestoneId;
  readonly name: string;
  readonly score: number;
  readonly coinReward: number;
  readonly researchReward: number;
  readonly goodReward:
    | { readonly itemId: "soil_conditioner" | "fortified_feed" | "mining_kit"; readonly quantity: number }
    | null;
}

export const HOMESTEAD_HONOR_MILESTONES: Readonly<
  Record<HomesteadHonorMilestoneId, HomesteadHonorMilestoneDefinition>
> = {
  newcomer: {
    id: "newcomer",
    name: "庄园新秀",
    score: 25,
    coinReward: 160,
    researchReward: 2,
    goodReward: { itemId: "soil_conditioner", quantity: 1 },
  },
  steward: {
    id: "steward",
    name: "三业管事",
    score: 80,
    coinReward: 420,
    researchReward: 4,
    goodReward: { itemId: "fortified_feed", quantity: 1 },
  },
  specialist: {
    id: "specialist",
    name: "城镇专家",
    score: 180,
    coinReward: 760,
    researchReward: 5,
    goodReward: { itemId: "fortified_feed", quantity: 2 },
  },
  exemplar: {
    id: "exemplar",
    name: "跨城典范",
    score: 350,
    coinReward: 1_300,
    researchReward: 8,
    goodReward: { itemId: "mining_kit", quantity: 1 },
  },
  legend: {
    id: "legend",
    name: "庄园传奇",
    score: 600,
    coinReward: 2_400,
    researchReward: 10,
    goodReward: { itemId: "mining_kit", quantity: 2 },
  },
};

/** @deprecated Use HOMESTEAD_HONOR_MILESTONES. */
export const HOMESTEAD_SEASON_MILESTONES = HOMESTEAD_HONOR_MILESTONES;

export type HomesteadCollectionDifficulty =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary";

export interface HomesteadCollectionDefinition {
  readonly id: string;
  readonly category:
    | "facility"
    | "recipe"
    | "farm"
    | "ranch"
    | "mine"
    | "research"
    | "npc"
    | "honor"
    | "operations"
    | "logistics";
  readonly name: string;
  readonly description: string;
  readonly difficulty: HomesteadCollectionDifficulty;
  readonly honorPoints: number;
}

function collectionMeta(
  difficulty: HomesteadCollectionDifficulty,
): Pick<HomesteadCollectionDefinition, "difficulty" | "honorPoints"> {
  return {
    difficulty,
    honorPoints: {
      common: 1,
      uncommon: 3,
      rare: 8,
      epic: 20,
      legendary: 50,
    }[difficulty],
  };
}

export function longTermCollectionDefinitions(input: {
  readonly facilityIds: readonly string[];
  readonly facilityNames: Readonly<Record<string, string>>;
  readonly infrastructureIds?: readonly string[];
  readonly infrastructureNames?: Readonly<Record<string, string>>;
  readonly recipeIds: readonly string[];
  readonly recipeNames: Readonly<Record<string, string>>;
  readonly townId?: EstateTownId;
}): HomesteadCollectionDefinition[] {
  const townId = input.townId ?? "greenvale";
  const tiered = (
    baseId: string,
    category: HomesteadCollectionDefinition["category"],
    name: string,
    verb: string,
  ): HomesteadCollectionDefinition[] => [
    {
      id: baseId,
      category,
      name,
      description: `首次${verb}。`,
      ...collectionMeta("common"),
    },
    {
      id: `${baseId}:5`,
      category,
      name: `${name} · 熟练`,
      description: `累计${verb} 5 次。`,
      ...collectionMeta("uncommon"),
    },
    {
      id: `${baseId}:20`,
      category,
      name: `${name} · 专精`,
      description: `累计${verb} 20 次。`,
      ...collectionMeta("rare"),
    },
  ];
  return [
    ...input.facilityIds.flatMap((id) => [
      {
        id: `facility:${id}`,
        category: "facility" as const,
        name: `设施 · ${input.facilityNames[id] ?? id}`,
        description: "建设对应加工设施。",
        ...collectionMeta("common"),
      },
      {
        id: `facility:${id}:2`,
        category: "facility" as const,
        name: `设施二级 · ${input.facilityNames[id] ?? id}`,
        description: "将对应加工设施升级到二级。",
        ...collectionMeta("uncommon"),
      },
      {
        id: `facility:${id}:3`,
        category: "facility" as const,
        name: `设施满级 · ${input.facilityNames[id] ?? id}`,
        description: "将对应加工设施升级到三级。",
        ...collectionMeta("rare"),
      },
    ]),
    ...(input.infrastructureIds ?? []).flatMap((id) => [
      {
        id: `infrastructure:${id}:1`,
        category: "facility" as const,
        name: `基础设施 · ${input.infrastructureNames?.[id] ?? id}`,
        description: "将对应城镇基础设施建设到一级。",
        ...collectionMeta("common"),
      },
      {
        id: `infrastructure:${id}:2`,
        category: "facility" as const,
        name: `基础设施二级 · ${input.infrastructureNames?.[id] ?? id}`,
        description: "将对应城镇基础设施建设到二级。",
        ...collectionMeta("uncommon"),
      },
      {
        id: `infrastructure:${id}:3`,
        category: "facility" as const,
        name: `基础设施满级 · ${input.infrastructureNames?.[id] ?? id}`,
        description: "将对应城镇基础设施建设到三级。",
        ...collectionMeta("rare"),
      },
    ]),
    ...input.recipeIds.flatMap((id) => tiered(
      `recipe:${id}`,
      "recipe",
      `配方 · ${input.recipeNames[id] ?? id}`,
      "收取该加工品",
    )),
    ...HOMESTEAD_CROP_FAMILY_IDS.flatMap((id) => tiered(
      `farm:${id}`,
      "farm",
      `轮作 · ${HOMESTEAD_CROP_FAMILIES[id].name}`,
      "完成该科属轮作",
    )),
    ...HOMESTEAD_ANIMAL_TRAIT_IDS.map((id) => ({
      id: `ranch:${id}`,
      category: "ranch" as const,
      name: `特质 · ${HOMESTEAD_ANIMAL_TRAIT_NAMES[id]}`,
      description: "在牧群中发现对应动物特质。",
      ...collectionMeta(id === "rare_coat" ? "rare" : "uncommon"),
    })),
    ...HOMESTEAD_MINE_LAYER_IDS.map((id) => ({
      id: `mine:${id}`,
      category: "mine" as const,
      name: `矿层 · ${HOMESTEAD_MINE_LAYERS[id].name}`,
      description: "完成一次对应矿层的勘探。",
      ...collectionMeta(
        id === "ancient" ? "epic" : id === "deep" ? "rare" : "common",
      ),
    })),
    ...researchIdsForTown(townId).map((id) => ({
      id: `research:${id}`,
      category: "research" as const,
      name: `研究 · ${HOMESTEAD_RESEARCH[id].name}`,
      description: "完成对应研究节点。",
      ...collectionMeta(
        HOMESTEAD_RESEARCH[id].researchCost >= 20
          ? "epic"
          : HOMESTEAD_RESEARCH[id].researchCost >= 12
            ? "rare"
            : "uncommon",
      ),
    })),
    ...npcIdsForTown(townId).flatMap((id) => [
      {
        id: `npc:${id}`,
        category: "npc" as const,
        name: `顾问信赖 · ${HOMESTEAD_NPCS[id].name}`,
        description: "与对应顾问建立二级信任。",
        ...collectionMeta("uncommon"),
      },
      {
        id: `npc:${id}:trusted`,
        category: "npc" as const,
        name: `顾问知己 · ${HOMESTEAD_NPCS[id].name}`,
        description: "与对应顾问建立五级信任。",
        ...collectionMeta("epic"),
      },
    ]),
    ...([1, 5, 15] as const).flatMap((threshold, tierIndex) =>
      (["jobs", "orders", "events", "farm", "ranch", "mine"] as const)
        .map((kind) => ({
          id: `operations:${kind}:${threshold}`,
          category: "operations" as const,
          name: `经营记录 · ${kind} ${threshold}`,
          description: `累计完成 ${threshold} 次对应经营行动。`,
          ...collectionMeta(
            (["common", "uncommon", "rare"] as const)[tierIndex]!,
          ),
        }))
    ),
    ...([1, 5, 20] as const).map((threshold, index) => ({
      id: `logistics:cargo:${threshold}`,
      category: "logistics" as const,
      name: `跨城货运 · ${threshold} 箱`,
      description: `累计完成 ${threshold} 箱跨城货运。`,
      ...collectionMeta(
        (["uncommon", "rare", "epic"] as const)[index]!,
      ),
    })),
    ...HOMESTEAD_HONOR_MILESTONE_IDS.map((id) => ({
      id: `honor:${id}`,
      category: "honor" as const,
      name: `荣誉 · ${HOMESTEAD_HONOR_MILESTONES[id].name}`,
      description: "领取对应永久荣誉奖励。",
      ...collectionMeta(id === "legend" ? "legendary" : "rare"),
    })),
  ];
}
