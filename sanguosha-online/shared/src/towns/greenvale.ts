import type { TownDefinition } from "./types.js";

export const GREENVALE_CROP_IDS = [
  "wheat",
  "carrot",
  "tomato",
  "corn",
  "pumpkin",
  "strawberry",
  "sunflower",
  "watermelon",
  "grape",
  "blueberry",
  "cotton",
  "dragonfruit",
  "rice",
  "green_pepper",
  "cucumber",
  "soybean",
  "onion",
  "garlic",
] as const;

export const GREENVALE_ANIMAL_IDS = [
  "chicken",
  "duck",
  "rabbit",
  "sheep",
  "cow",
  "goat",
  "broiler_chicken",
  "pig",
] as const;

export const GREENVALE_PRODUCT_IDS = [
  "egg",
  "duck_egg",
  "rabbit_fur",
  "wool",
  "milk",
  "goat_milk",
  "raw_chicken",
  "raw_pork",
] as const;

export const GREENVALE_DEPOSIT_IDS = [
  "coal",
  "iron",
  "copper",
  "silver",
  "gold",
  "crystal",
] as const;

export const GREENVALE_TOWN_DEFINITION: TownDefinition = {
  id: "greenvale",
  contentVersion: 2,
  rulesetId: "standard_three_sector_v1",
  name: "青禾镇",
  subtitle: "河谷三业庄园",
  climate: "温带河谷",
  description: "以完整农场、牧场、矿山和加工体系为核心的起始城镇。",
  landmarkName: "三业联合车站",
  specialties: ["小麦与葡萄", "鸡与奶牛", "煤与铁"],
  unlockRequirements: {
    sourceTownId: null,
    minimumFarmLevel: 0,
    minimumRanchLevel: 0,
    minimumMineLevel: 0,
    minimumReputation: 0,
    requiredResearchIds: [],
    coinCost: 0,
  },
  travel: {
    terminalName: "青禾联合车站",
    defaultMode: "local",
  },
  weatherAnchor: {
    cityName: "郑州",
    countryCode: "CN",
    latitude: 34.75,
    longitude: 113.62,
    timeZone: "Asia/Shanghai",
    refreshIntervalSeconds: 8 * 60 * 60,
  },
  content: {
    cropIds: GREENVALE_CROP_IDS,
    animalIds: GREENVALE_ANIMAL_IDS,
    productIds: GREENVALE_PRODUCT_IDS,
    depositIds: GREENVALE_DEPOSIT_IDS,
  },
};
