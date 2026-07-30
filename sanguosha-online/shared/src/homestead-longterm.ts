import type { FarmingCropId } from "./farming.js";
import type { MineDepositId } from "./mine.js";

export const HOMESTEAD_RESEARCH_NODE_IDS = [
  "soil_science",
  "crop_rotation",
  "animal_nutrition",
  "animal_genetics",
  "geology",
  "deep_mining",
  "estate_engineering",
  "automation",
  "civic_network",
  "seasonal_mastery",
] as const;

export type HomesteadResearchNodeId =
  (typeof HOMESTEAD_RESEARCH_NODE_IDS)[number];

export type HomesteadResearchBranch =
  | "farm"
  | "ranch"
  | "mine"
  | "estate"
  | "community";

export interface HomesteadResearchDefinition {
  readonly id: HomesteadResearchNodeId;
  readonly name: string;
  readonly description: string;
  readonly branch: HomesteadResearchBranch;
  readonly researchCost: number;
  readonly requiredReputation: number;
  readonly prerequisites: readonly HomesteadResearchNodeId[];
}
export const HOMESTEAD_RESEARCH: Readonly<
  Record<HomesteadResearchNodeId, HomesteadResearchDefinition>
> = {
  soil_science: {
    id: "soil_science",
    name: "土壤科学",
    description: "解锁土壤改良剂使用，并提高轮作恢复效果。",
    branch: "farm",
    researchCost: 3,
    requiredReputation: 0,
    prerequisites: [],
  },
  crop_rotation: {
    id: "crop_rotation",
    name: "系统轮作",
    description: "连续更换作物科属时获得更高土壤健康和季节积分。",
    branch: "farm",
    researchCost: 6,
    requiredReputation: 15,
    prerequisites: ["soil_science"],
  },
  animal_nutrition: {
    id: "animal_nutrition",
    name: "动物营养学",
    description: "解锁均衡饲料方案并提高牧群健康恢复。",
    branch: "ranch",
    researchCost: 3,
    requiredReputation: 0,
    prerequisites: [],
  },
  animal_genetics: {
    id: "animal_genetics",
    name: "动物特质研究",
    description: "解锁矿物强化饲料，提高稀有特质发现机会。",
    branch: "ranch",
    researchCost: 7,
    requiredReputation: 25,
    prerequisites: ["animal_nutrition"],
  },
  geology: {
    id: "geology",
    name: "地层勘探",
    description: "开放中层矿脉调查，并提高勘探进度。",
    branch: "mine",
    researchCost: 3,
    requiredReputation: 0,
    prerequisites: [],
  },
  deep_mining: {
    id: "deep_mining",
    name: "深层采矿",
    description: "开放深层和远古矿层，但需要更高防护等级。",
    branch: "mine",
    researchCost: 7,
    requiredReputation: 30,
    prerequisites: ["geology"],
  },
  estate_engineering: {
    id: "estate_engineering",
    name: "庄园工程学",
    description: "允许加工设施升级到二级，提高加工效率。",
    branch: "estate",
    researchCost: 5,
    requiredReputation: 20,
    prerequisites: [],
  },
  automation: {
    id: "automation",
    name: "三业自动化",
    description: "允许设施升级到三级，并进一步提高加工产量。",
    branch: "estate",
    researchCost: 12,
    requiredReputation: 80,
    prerequisites: [
      "crop_rotation",
      "animal_genetics",
      "deep_mining",
      "estate_engineering",
    ],
  },
  civic_network: {
    id: "civic_network",
    name: "城镇协作网络",
    description: "NPC 对话获得更多信任，并解锁长期城镇记忆。",
    branch: "community",
    researchCost: 5,
    requiredReputation: 20,
    prerequisites: [],
  },
  seasonal_mastery: {
    id: "seasonal_mastery",
    name: "季节经营学",
    description: "季节行动获得额外积分，并开放最终赛季奖励。",
    branch: "community",
    researchCost: 10,
    requiredReputation: 70,
    prerequisites: ["civic_network"],
  },
};

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
};

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

export const HOMESTEAD_SEASON_MILESTONE_IDS = [
  "bronze",
  "silver",
  "gold",
] as const;

export type HomesteadSeasonMilestoneId =
  (typeof HOMESTEAD_SEASON_MILESTONE_IDS)[number];

export interface HomesteadSeasonMilestoneDefinition {
  readonly id: HomesteadSeasonMilestoneId;
  readonly name: string;
  readonly score: number;
  readonly coinReward: number;
  readonly researchReward: number;
  readonly goodReward:
    | { readonly itemId: "soil_conditioner" | "fortified_feed" | "mining_kit"; readonly quantity: number }
    | null;
}

export const HOMESTEAD_SEASON_MILESTONES: Readonly<
  Record<HomesteadSeasonMilestoneId, HomesteadSeasonMilestoneDefinition>
> = {
  bronze: {
    id: "bronze",
    name: "协作起步",
    score: 10,
    coinReward: 180,
    researchReward: 2,
    goodReward: { itemId: "soil_conditioner", quantity: 1 },
  },
  silver: {
    id: "silver",
    name: "三业骨干",
    score: 30,
    coinReward: 520,
    researchReward: 5,
    goodReward: { itemId: "fortified_feed", quantity: 2 },
  },
  gold: {
    id: "gold",
    name: "城镇典范",
    score: 65,
    coinReward: 1_200,
    researchReward: 10,
    goodReward: { itemId: "mining_kit", quantity: 2 },
  },
};

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
    | "season";
  readonly name: string;
  readonly description: string;
}

export function longTermCollectionDefinitions(input: {
  readonly facilityIds: readonly string[];
  readonly facilityNames: Readonly<Record<string, string>>;
  readonly recipeIds: readonly string[];
  readonly recipeNames: Readonly<Record<string, string>>;
}): HomesteadCollectionDefinition[] {
  return [
    ...input.facilityIds.map((id) => ({
      id: `facility:${id}`,
      category: "facility" as const,
      name: `设施 · ${input.facilityNames[id] ?? id}`,
      description: "建设对应加工设施。",
    })),
    ...input.recipeIds.map((id) => ({
      id: `recipe:${id}`,
      category: "recipe" as const,
      name: `配方 · ${input.recipeNames[id] ?? id}`,
      description: "首次收取对应加工品。",
    })),
    ...HOMESTEAD_CROP_FAMILY_IDS.map((id) => ({
      id: `farm:${id}`,
      category: "farm" as const,
      name: `轮作 · ${HOMESTEAD_CROP_FAMILIES[id].name}`,
      description: "完成一次对应科属的轮作计划。",
    })),
    ...HOMESTEAD_ANIMAL_TRAIT_IDS.map((id) => ({
      id: `ranch:${id}`,
      category: "ranch" as const,
      name: `特质 · ${HOMESTEAD_ANIMAL_TRAIT_NAMES[id]}`,
      description: "在牧群中发现对应动物特质。",
    })),
    ...HOMESTEAD_MINE_LAYER_IDS.map((id) => ({
      id: `mine:${id}`,
      category: "mine" as const,
      name: `矿层 · ${HOMESTEAD_MINE_LAYERS[id].name}`,
      description: "完成一次对应矿层的勘探。",
    })),
    ...HOMESTEAD_RESEARCH_NODE_IDS.map((id) => ({
      id: `research:${id}`,
      category: "research" as const,
      name: `研究 · ${HOMESTEAD_RESEARCH[id].name}`,
      description: "完成对应研究节点。",
    })),
    ...HOMESTEAD_NPC_IDS.map((id) => ({
      id: `npc:${id}`,
      category: "npc" as const,
      name: `伙伴 · ${HOMESTEAD_NPCS[id].name}`,
      description: "与对应顾问建立可信赖关系。",
    })),
    ...HOMESTEAD_SEASON_MILESTONE_IDS.map((id) => ({
      id: `season:${id}`,
      category: "season" as const,
      name: `赛季 · ${HOMESTEAD_SEASON_MILESTONES[id].name}`,
      description: "领取对应软赛季里程碑。",
    })),
  ];
}
