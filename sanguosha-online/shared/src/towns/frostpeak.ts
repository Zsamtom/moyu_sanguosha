import type {
  TownAnimalDefinition,
  TownCropDefinition,
  TownDefinition,
  TownDepositDefinition,
} from "./types.js";

const MINUTE = 60;
const HOUR = 60 * MINUTE;

export const FROSTPEAK_CROP_IDS = [
  "frost_barley",
  "snow_potato",
  "ice_turnip",
  "highland_bean",
  "cloudberry",
  "alpine_herb",
  "ice_lettuce",
  "juniper_berry",
  "blue_rose",
  "silver_flax",
  "winter_melon",
  "aurora_fruit",
] as const;

export const FROSTPEAK_FARM_CROPS: Readonly<
  Record<(typeof FROSTPEAK_CROP_IDS)[number], TownCropDefinition>
> = {
  frost_barley: {
    id: "frost_barley", name: "霜麦", unlockLevel: 1, seedCost: 4,
    basePrice: 7, minimumPrice: 5, maximumPrice: 10,
    growthSeconds: 6 * MINUTE, yield: 3, harvestExperience: 9,
  },
  snow_potato: {
    id: "snow_potato", name: "雪薯", unlockLevel: 1, seedCost: 6,
    basePrice: 10, minimumPrice: 7, maximumPrice: 14,
    growthSeconds: 11 * MINUTE, yield: 3, harvestExperience: 12,
  },
  ice_turnip: {
    id: "ice_turnip", name: "冰芜菁", unlockLevel: 2, seedCost: 9,
    basePrice: 15, minimumPrice: 10, maximumPrice: 21,
    growthSeconds: 22 * MINUTE, yield: 4, harvestExperience: 16,
  },
  highland_bean: {
    id: "highland_bean", name: "高原豆", unlockLevel: 3, seedCost: 13,
    basePrice: 20, minimumPrice: 13, maximumPrice: 29,
    growthSeconds: 32 * MINUTE, yield: 4, harvestExperience: 20,
  },
  cloudberry: {
    id: "cloudberry", name: "云莓", unlockLevel: 4, seedCost: 20,
    basePrice: 31, minimumPrice: 20, maximumPrice: 45,
    growthSeconds: 65 * MINUTE, yield: 5, harvestExperience: 28,
  },
  alpine_herb: {
    id: "alpine_herb", name: "高山药草", unlockLevel: 5, seedCost: 29,
    basePrice: 44, minimumPrice: 28, maximumPrice: 63,
    growthSeconds: 2 * HOUR, yield: 5, harvestExperience: 36,
  },
  ice_lettuce: {
    id: "ice_lettuce", name: "冰叶菜", unlockLevel: 6, seedCost: 40,
    basePrice: 59, minimumPrice: 37, maximumPrice: 84,
    growthSeconds: 3 * HOUR, yield: 6, harvestExperience: 45,
  },
  juniper_berry: {
    id: "juniper_berry", name: "杜松果", unlockLevel: 7, seedCost: 55,
    basePrice: 79, minimumPrice: 49, maximumPrice: 112,
    growthSeconds: 4 * HOUR, yield: 6, harvestExperience: 55,
  },
  blue_rose: {
    id: "blue_rose", name: "寒地蓝蔷薇", unlockLevel: 8, seedCost: 74,
    basePrice: 104, minimumPrice: 64, maximumPrice: 147,
    growthSeconds: 6 * HOUR, yield: 7, harvestExperience: 67,
  },
  silver_flax: {
    id: "silver_flax", name: "银麻", unlockLevel: 9, seedCost: 98,
    basePrice: 136, minimumPrice: 83, maximumPrice: 191,
    growthSeconds: 8 * HOUR, yield: 7, harvestExperience: 80,
  },
  winter_melon: {
    id: "winter_melon", name: "寒香瓜", unlockLevel: 11, seedCost: 130,
    basePrice: 176, minimumPrice: 107, maximumPrice: 247,
    growthSeconds: 12 * HOUR, yield: 8, harvestExperience: 97,
  },
  aurora_fruit: {
    id: "aurora_fruit", name: "极光果", unlockLevel: 13, seedCost: 174,
    basePrice: 229, minimumPrice: 139, maximumPrice: 319,
    growthSeconds: 18 * HOUR, yield: 9, harvestExperience: 119,
  },
};

export const FROSTPEAK_ANIMAL_IDS = [
  "snow_chicken",
  "ptarmigan",
  "angora_rabbit",
  "highland_sheep",
  "yak",
  "cashmere_goat",
] as const;

export const FROSTPEAK_PRODUCT_IDS = [
  "snow_egg",
  "ptarmigan_egg",
  "angora_fur",
  "highland_wool",
  "yak_milk",
  "cashmere",
] as const;

export const FROSTPEAK_RANCH_ANIMALS: Readonly<
  Record<(typeof FROSTPEAK_ANIMAL_IDS)[number], TownAnimalDefinition>
> = {
  snow_chicken: {
    id: "snow_chicken", name: "雪羽鸡", productId: "snow_egg",
    productName: "雪羽蛋", requiredFarmLevel: 1, requiredRanchLevel: 1,
    purchaseCost: 210, resalePrice: 105, feedCropId: "frost_barley",
    feedAmount: 1, careCost: 5, productionSeconds: 11 * MINUTE, yield: 3,
    productPrice: 20, collectExperience: 15,
  },
  ptarmigan: {
    id: "ptarmigan", name: "岩雷鸟", productId: "ptarmigan_egg",
    productName: "雷鸟蛋", requiredFarmLevel: 4, requiredRanchLevel: 2,
    purchaseCost: 360, resalePrice: 180, feedCropId: "highland_bean",
    feedAmount: 1, careCost: 8, productionSeconds: 22 * MINUTE, yield: 3,
    productPrice: 33, collectExperience: 21,
  },
  angora_rabbit: {
    id: "angora_rabbit", name: "高原安哥拉兔", productId: "angora_fur",
    productName: "高原兔绒", requiredFarmLevel: 5, requiredRanchLevel: 3,
    purchaseCost: 530, resalePrice: 265, feedCropId: "snow_potato",
    feedAmount: 1, careCost: 12, productionSeconds: 32 * MINUTE, yield: 3,
    productPrice: 49, collectExperience: 29,
  },
  highland_sheep: {
    id: "highland_sheep", name: "高地绵羊", productId: "highland_wool",
    productName: "高地羊毛", requiredFarmLevel: 6, requiredRanchLevel: 4,
    purchaseCost: 960, resalePrice: 480, feedCropId: "frost_barley",
    feedAmount: 2, careCost: 23, productionSeconds: 65 * MINUTE, yield: 4,
    productPrice: 69, collectExperience: 38,
  },
  yak: {
    id: "yak", name: "牦牛", productId: "yak_milk",
    productName: "牦牛奶", requiredFarmLevel: 8, requiredRanchLevel: 6,
    purchaseCost: 1_650, resalePrice: 825, feedCropId: "highland_bean",
    feedAmount: 2, careCost: 38, productionSeconds: 2 * HOUR, yield: 4,
    productPrice: 118, collectExperience: 53,
  },
  cashmere_goat: {
    id: "cashmere_goat", name: "绒山羊", productId: "cashmere",
    productName: "山羊绒", requiredFarmLevel: 10, requiredRanchLevel: 8,
    purchaseCost: 3_200, resalePrice: 1_600, feedCropId: "snow_potato",
    feedAmount: 2, careCost: 71, productionSeconds: 3 * HOUR, yield: 5,
    productPrice: 176, collectExperience: 72,
  },
};

export const FROSTPEAK_DEPOSIT_IDS = [
  "lignite",
  "magnetite",
  "tin",
  "frost_silver",
  "glacier_gold",
  "frost_crystal",
] as const;

export const FROSTPEAK_MINE_DEPOSITS: Readonly<
  Record<(typeof FROSTPEAK_DEPOSIT_IDS)[number], TownDepositDefinition>
> = {
  lignite: {
    id: "lignite", name: "褐煤层", requiredFarmLevel: 1,
    requiredRanchLevel: 1, requiredMineLevel: 1, expeditionCost: 22,
    rationProductId: "snow_egg", rationAmount: 1,
    supportProductId: "angora_fur", supportAmount: 1,
    durationSeconds: 16 * MINUTE, yield: 3, orePrice: 32,
    collectExperience: 17,
  },
  magnetite: {
    id: "magnetite", name: "磁铁矿脉", requiredFarmLevel: 1,
    requiredRanchLevel: 1, requiredMineLevel: 1, expeditionCost: 34,
    rationProductId: "snow_egg", rationAmount: 1,
    supportProductId: "angora_fur", supportAmount: 1,
    durationSeconds: 32 * MINUTE, yield: 3, orePrice: 49,
    collectExperience: 23,
  },
  tin: {
    id: "tin", name: "锡矿脉", requiredFarmLevel: 7,
    requiredRanchLevel: 4, requiredMineLevel: 2, expeditionCost: 50,
    rationProductId: "ptarmigan_egg", rationAmount: 1,
    supportProductId: "highland_wool", supportAmount: 1,
    durationSeconds: 65 * MINUTE, yield: 4, orePrice: 90,
    collectExperience: 33,
  },
  frost_silver: {
    id: "frost_silver", name: "霜银矿脉", requiredFarmLevel: 8,
    requiredRanchLevel: 6, requiredMineLevel: 4, expeditionCost: 78,
    rationProductId: "yak_milk", rationAmount: 1,
    supportProductId: "highland_wool", supportAmount: 1,
    durationSeconds: 2 * HOUR, yield: 4, orePrice: 165,
    collectExperience: 47,
  },
  glacier_gold: {
    id: "glacier_gold", name: "冰川金矿", requiredFarmLevel: 10,
    requiredRanchLevel: 7, requiredMineLevel: 6, expeditionCost: 132,
    rationProductId: "yak_milk", rationAmount: 2,
    supportProductId: "highland_wool", supportAmount: 2,
    durationSeconds: 3 * HOUR, yield: 4, orePrice: 280,
    collectExperience: 65,
  },
  frost_crystal: {
    id: "frost_crystal", name: "霜晶洞", requiredFarmLevel: 10,
    requiredRanchLevel: 8, requiredMineLevel: 8, expeditionCost: 198,
    rationProductId: "cashmere", rationAmount: 1,
    supportProductId: "highland_wool", supportAmount: 2,
    durationSeconds: 6 * HOUR, yield: 5, orePrice: 450,
    collectExperience: 87,
  },
};

export const FROSTPEAK_TOWN_DEFINITION: TownDefinition = {
  id: "frostpeak",
  contentVersion: 1,
  rulesetId: "standard_three_sector_v1",
  name: "霜岭镇",
  subtitle: "高寒三业庄园",
  climate: "高寒山地",
  description: "在高寒山地重新建设完整农场、牧场、矿山和加工体系。",
  landmarkName: "山地热力站",
  specialties: ["雪薯与极光果", "牦牛与绒山羊", "霜银与霜晶"],
  unlockRequirements: {
    sourceTownId: "greenvale",
    minimumFarmLevel: 5,
    minimumRanchLevel: 4,
    minimumMineLevel: 3,
    minimumReputation: 30,
    requiredResearchIds: ["civic_network"],
    coinCost: 800,
  },
  travel: {
    terminalName: "霜岭山地站",
    defaultMode: "rail",
  },
  weatherAnchor: {
    cityName: "拉萨",
    countryCode: "CN",
    latitude: 29.65,
    longitude: 91.1,
    timeZone: "Asia/Shanghai",
    refreshIntervalSeconds: 8 * 60 * 60,
  },
  content: {
    cropIds: FROSTPEAK_CROP_IDS,
    animalIds: FROSTPEAK_ANIMAL_IDS,
    productIds: FROSTPEAK_PRODUCT_IDS,
    depositIds: FROSTPEAK_DEPOSIT_IDS,
  },
};
