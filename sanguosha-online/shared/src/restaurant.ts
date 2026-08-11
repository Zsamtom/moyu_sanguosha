import {
  ESTATE_TOWN_IDS,
  isEstateTownId,
  type EstateTownId,
} from "./towns/registry.js";

export const RESTAURANT_STATE_VERSION = 1 as const;
export const RESTAURANT_MAX_LOGS = 100;
export const RESTAURANT_MAX_LOTS = 256;
export const RESTAURANT_MAX_PROCESSING_JOBS = 24;
export const RESTAURANT_MAX_SHIPMENTS = 32;

export const RESTAURANT_INGREDIENT_IDS = [
  "wheat",
  "rice",
  "soybean",
  "tomato",
  "carrot",
  "green_pepper",
  "cucumber",
  "onion",
  "garlic",
  "pumpkin",
  "strawberry",
  "cloudberry",
  "snow_potato",
  "ice_lettuce",
  "alpine_herb",
  "mountain_mushroom",
  "snow_cabbage",
  "frost_onion",
  "alpine_pepper",
  "egg",
  "duck_egg",
  "milk",
  "goat_milk",
  "yak_milk",
  "raw_chicken",
  "raw_pork",
  "flour",
  "polished_rice",
  "tofu",
  "chicken_meat",
  "pork_slices",
  "butter",
  "mineral_salt",
  "soy_sauce",
  "vinegar",
  "sugar",
  "pepper",
  "freshwater_fish",
  "snow_crab",
  "rare_mushroom",
] as const;

export type RestaurantIngredientId =
  (typeof RESTAURANT_INGREDIENT_IDS)[number];

export type RestaurantIngredientCategory =
  | "raw"
  | "direct"
  | "processed"
  | "special"
  | "seasoning";

export interface RestaurantIngredientDefinition {
  readonly id: RestaurantIngredientId;
  readonly name: string;
  readonly category: RestaurantIngredientCategory;
  readonly dishUsable: boolean;
  readonly tags: readonly string[];
}

export const RESTAURANT_INGREDIENTS: Readonly<
  Record<RestaurantIngredientId, RestaurantIngredientDefinition>
> = Object.fromEntries([
  ["wheat", "小麦", "raw", false, ["grain"]],
  ["rice", "稻谷", "raw", false, ["grain"]],
  ["soybean", "大豆", "raw", false, ["bean"]],
  ["tomato", "番茄", "direct", true, ["vegetable", "fresh"]],
  ["carrot", "胡萝卜", "direct", true, ["vegetable", "root"]],
  ["green_pepper", "青椒", "direct", true, ["vegetable", "fresh"]],
  ["cucumber", "黄瓜", "direct", true, ["vegetable", "fresh"]],
  ["onion", "洋葱", "direct", true, ["vegetable", "aromatic"]],
  ["garlic", "大蒜", "direct", true, ["vegetable", "aromatic"]],
  ["pumpkin", "南瓜", "direct", true, ["vegetable"]],
  ["strawberry", "草莓", "direct", true, ["fruit", "sweet"]],
  ["cloudberry", "云莓", "direct", true, ["fruit", "frostpeak"]],
  ["snow_potato", "雪薯", "direct", true, ["vegetable", "frostpeak"]],
  ["ice_lettuce", "冰叶菜", "direct", true, ["vegetable", "frostpeak"]],
  ["alpine_herb", "高山药草", "direct", true, ["herb", "frostpeak"]],
  ["mountain_mushroom", "山地菌菇", "direct", true, ["mushroom", "frostpeak"]],
  ["snow_cabbage", "雪地卷心菜", "direct", true, ["vegetable", "frostpeak"]],
  ["frost_onion", "霜地洋葱", "direct", true, ["vegetable", "aromatic", "frostpeak"]],
  ["alpine_pepper", "高山青椒", "direct", true, ["vegetable", "frostpeak"]],
  ["egg", "鸡蛋", "direct", true, ["egg"]],
  ["duck_egg", "鸭蛋", "direct", true, ["egg"]],
  ["milk", "牛奶", "direct", true, ["dairy"]],
  ["goat_milk", "羊奶", "direct", true, ["dairy"]],
  ["yak_milk", "牦牛奶", "direct", true, ["dairy", "frostpeak"]],
  ["raw_chicken", "整鸡原料", "raw", false, ["meat"]],
  ["raw_pork", "猪肉原料", "raw", false, ["meat"]],
  ["flour", "面粉", "processed", true, ["grain"]],
  ["polished_rice", "精米", "processed", true, ["grain"]],
  ["tofu", "豆腐", "processed", true, ["bean"]],
  ["chicken_meat", "鸡肉", "processed", true, ["meat"]],
  ["pork_slices", "猪肉", "processed", true, ["meat"]],
  ["butter", "黄油", "processed", true, ["dairy"]],
  ["mineral_salt", "精盐", "seasoning", true, ["seasoning"]],
  ["soy_sauce", "酱油", "seasoning", true, ["seasoning"]],
  ["vinegar", "香醋", "seasoning", true, ["seasoning"]],
  ["sugar", "砂糖", "seasoning", true, ["seasoning"]],
  ["pepper", "胡椒", "seasoning", true, ["seasoning"]],
  ["freshwater_fish", "鲜鱼", "special", true, ["seafood"]],
  ["snow_crab", "雪蟹", "special", true, ["seafood", "frostpeak"]],
  ["rare_mushroom", "珍稀菌菇", "special", true, ["mushroom"]],
].map(([id, name, category, dishUsable, tags]) => [id, {
  id,
  name,
  category,
  dishUsable,
  tags,
}])) as Readonly<Record<RestaurantIngredientId, RestaurantIngredientDefinition>>;

export type RestaurantTownSupplySource = "farm" | "ranch" | "goods";

export interface RestaurantTownSupplyDefinition {
  readonly townId: EstateTownId;
  readonly source: RestaurantTownSupplySource;
  readonly itemId: string;
  readonly ingredientId: RestaurantIngredientId;
}

export const RESTAURANT_TOWN_SUPPLIES:
  readonly RestaurantTownSupplyDefinition[] = [
    { townId: "greenvale", source: "farm", itemId: "wheat", ingredientId: "wheat" },
    { townId: "greenvale", source: "farm", itemId: "rice", ingredientId: "rice" },
    { townId: "greenvale", source: "farm", itemId: "soybean", ingredientId: "soybean" },
    { townId: "greenvale", source: "farm", itemId: "tomato", ingredientId: "tomato" },
    { townId: "greenvale", source: "farm", itemId: "carrot", ingredientId: "carrot" },
    { townId: "greenvale", source: "farm", itemId: "green_pepper", ingredientId: "green_pepper" },
    { townId: "greenvale", source: "farm", itemId: "cucumber", ingredientId: "cucumber" },
    { townId: "greenvale", source: "farm", itemId: "onion", ingredientId: "onion" },
    { townId: "greenvale", source: "farm", itemId: "garlic", ingredientId: "garlic" },
    { townId: "greenvale", source: "farm", itemId: "pumpkin", ingredientId: "pumpkin" },
    { townId: "greenvale", source: "farm", itemId: "strawberry", ingredientId: "strawberry" },
    { townId: "greenvale", source: "ranch", itemId: "egg", ingredientId: "egg" },
    { townId: "greenvale", source: "ranch", itemId: "duck_egg", ingredientId: "duck_egg" },
    { townId: "greenvale", source: "ranch", itemId: "milk", ingredientId: "milk" },
    { townId: "greenvale", source: "ranch", itemId: "goat_milk", ingredientId: "goat_milk" },
    { townId: "greenvale", source: "ranch", itemId: "raw_chicken", ingredientId: "raw_chicken" },
    { townId: "greenvale", source: "ranch", itemId: "raw_pork", ingredientId: "raw_pork" },
    { townId: "greenvale", source: "goods", itemId: "flour", ingredientId: "flour" },
    { townId: "frostpeak", source: "farm", itemId: "frost_barley", ingredientId: "wheat" },
    { townId: "frostpeak", source: "farm", itemId: "cloudberry", ingredientId: "cloudberry" },
    { townId: "frostpeak", source: "farm", itemId: "snow_potato", ingredientId: "snow_potato" },
    { townId: "frostpeak", source: "farm", itemId: "ice_lettuce", ingredientId: "ice_lettuce" },
    { townId: "frostpeak", source: "farm", itemId: "alpine_herb", ingredientId: "alpine_herb" },
    { townId: "frostpeak", source: "farm", itemId: "mountain_mushroom", ingredientId: "mountain_mushroom" },
    { townId: "frostpeak", source: "farm", itemId: "snow_cabbage", ingredientId: "snow_cabbage" },
    { townId: "frostpeak", source: "farm", itemId: "frost_onion", ingredientId: "frost_onion" },
    { townId: "frostpeak", source: "farm", itemId: "alpine_pepper", ingredientId: "alpine_pepper" },
    { townId: "frostpeak", source: "ranch", itemId: "snow_egg", ingredientId: "egg" },
    { townId: "frostpeak", source: "ranch", itemId: "ptarmigan_egg", ingredientId: "duck_egg" },
    { townId: "frostpeak", source: "ranch", itemId: "yak_milk", ingredientId: "yak_milk" },
    { townId: "frostpeak", source: "goods", itemId: "frost_barley_flour", ingredientId: "flour" },
  ];

export function getRestaurantTownSupplyDefinition(
  townId: EstateTownId,
  source: RestaurantTownSupplySource,
  itemId: string,
): RestaurantTownSupplyDefinition | undefined {
  return RESTAURANT_TOWN_SUPPLIES.find((definition) =>
    definition.townId === townId &&
    definition.source === source &&
    definition.itemId === itemId
  );
}

export const RESTAURANT_TECHNIQUE_IDS = [
  "knife_basics",
  "grain_milling",
  "butchery",
  "sauce_craft",
  "cold_chain",
  "pastry",
] as const;
export type RestaurantTechniqueId =
  (typeof RESTAURANT_TECHNIQUE_IDS)[number];

export interface RestaurantTechniqueDefinition {
  readonly id: RestaurantTechniqueId;
  readonly name: string;
  readonly requiredLevel: number;
  readonly prerequisiteIds: readonly RestaurantTechniqueId[];
  readonly teacherTownId: EstateTownId;
  readonly coinCost: number;
  readonly requiredLocalReputation: number;
  readonly localReputationCost: number;
}

export const RESTAURANT_TECHNIQUES: Readonly<
  Record<RestaurantTechniqueId, RestaurantTechniqueDefinition>
> = {
  knife_basics: {
    id: "knife_basics", name: "基础刀工", requiredLevel: 1,
    prerequisiteIds: [], teacherTownId: "greenvale",
    coinCost: 0, requiredLocalReputation: 0,
    localReputationCost: 0,
  },
  grain_milling: {
    id: "grain_milling", name: "谷物精制", requiredLevel: 1,
    prerequisiteIds: ["knife_basics"], teacherTownId: "greenvale", coinCost: 120,
    requiredLocalReputation: 5, localReputationCost: 1,
  },
  butchery: {
    id: "butchery", name: "肉类分割", requiredLevel: 2,
    prerequisiteIds: ["knife_basics"], teacherTownId: "greenvale", coinCost: 240,
    requiredLocalReputation: 15, localReputationCost: 2,
  },
  sauce_craft: {
    id: "sauce_craft", name: "调味技法", requiredLevel: 2,
    prerequisiteIds: ["knife_basics"], teacherTownId: "greenvale", coinCost: 300,
    requiredLocalReputation: 20, localReputationCost: 2,
  },
  cold_chain: {
    id: "cold_chain", name: "跨镇冷链", requiredLevel: 3,
    prerequisiteIds: ["knife_basics"], teacherTownId: "frostpeak", coinCost: 420,
    requiredLocalReputation: 25, localReputationCost: 3,
  },
  pastry: {
    id: "pastry", name: "烘焙技法", requiredLevel: 4,
    prerequisiteIds: ["grain_milling", "sauce_craft"], teacherTownId: "frostpeak", coinCost: 600,
    requiredLocalReputation: 35, localReputationCost: 4,
  },
};

export const RESTAURANT_PROCESSING_IDS = [
  "mill_wheat",
  "polish_rice",
  "make_tofu",
  "butcher_chicken",
  "butcher_pork",
  "churn_butter",
] as const;
export type RestaurantProcessingId =
  (typeof RESTAURANT_PROCESSING_IDS)[number];

export interface RestaurantIngredientAmount {
  readonly ingredientId: RestaurantIngredientId;
  readonly quantity: number;
  readonly sourceKind?: "farm" | "ranch" | "homestead_goods";
}

export interface RestaurantProcessingDefinition {
  readonly id: RestaurantProcessingId;
  readonly name: string;
  readonly techniqueId: RestaurantTechniqueId;
  readonly inputs: readonly RestaurantIngredientAmount[];
  readonly output: RestaurantIngredientAmount;
  readonly durationSeconds: number;
  readonly coinCost: number;
}

export const RESTAURANT_PROCESSING: Readonly<
  Record<RestaurantProcessingId, RestaurantProcessingDefinition>
> = {
  mill_wheat: {
    id: "mill_wheat", name: "研磨面粉", techniqueId: "grain_milling",
    inputs: [{ ingredientId: "wheat", quantity: 2 }],
    output: { ingredientId: "flour", quantity: 2 },
    durationSeconds: 60, coinCost: 4,
  },
  polish_rice: {
    id: "polish_rice", name: "碾制精米", techniqueId: "grain_milling",
    inputs: [{ ingredientId: "rice", quantity: 2 }],
    output: { ingredientId: "polished_rice", quantity: 2 },
    durationSeconds: 60, coinCost: 4,
  },
  make_tofu: {
    id: "make_tofu", name: "制作豆腐", techniqueId: "grain_milling",
    inputs: [{ ingredientId: "soybean", quantity: 2 }],
    output: { ingredientId: "tofu", quantity: 2 },
    durationSeconds: 90, coinCost: 6,
  },
  butcher_chicken: {
    id: "butcher_chicken", name: "分割鸡肉", techniqueId: "butchery",
    inputs: [{ ingredientId: "raw_chicken", quantity: 1 }],
    output: { ingredientId: "chicken_meat", quantity: 3 },
    durationSeconds: 90, coinCost: 8,
  },
  butcher_pork: {
    id: "butcher_pork", name: "分割猪肉", techniqueId: "butchery",
    inputs: [{ ingredientId: "raw_pork", quantity: 1 }],
    output: { ingredientId: "pork_slices", quantity: 4 },
    durationSeconds: 120, coinCost: 12,
  },
  churn_butter: {
    id: "churn_butter", name: "搅制黄油", techniqueId: "sauce_craft",
    inputs: [{ ingredientId: "milk", quantity: 2 }],
    output: { ingredientId: "butter", quantity: 1 },
    durationSeconds: 90, coinCost: 6,
  },
};

export const RESTAURANT_RECIPE_IDS = [
  "tomato_carrot_salad",
  "cucumber_garlic_salad",
  "green_pepper_egg",
  "pumpkin_milk_soup",
  "duck_egg_tofu",
  "strawberry_goat_pudding",
  "tofu_vegetable_pot",
  "river_fish_soup",
  "farmhouse_bread",
  "chicken_skewer",
  "pork_rice_bowl",
  "frost_berry_tart",
  "yak_milk_stew",
  "mountain_mushroom_grill",
  "snow_crab_salad",
  "rare_mushroom_stew",
] as const;
export type RestaurantRecipeId = (typeof RESTAURANT_RECIPE_IDS)[number];

export interface RestaurantRecipeDefinition {
  readonly id: RestaurantRecipeId;
  readonly name: string;
  readonly originTownId: EstateTownId;
  readonly requiredLevel: number;
  readonly techniqueIds: readonly RestaurantTechniqueId[];
  readonly inputs: readonly RestaurantIngredientAmount[];
  readonly servings: number;
  readonly basePrice: number;
  readonly experienceReward: number;
  readonly localReputationReward: number;
  readonly unlockCoinCost: number;
  readonly requiredLocalReputation: number;
  readonly unlockLocalReputationCost: number;
}

export const RESTAURANT_RECIPES: Readonly<
  Record<RestaurantRecipeId, RestaurantRecipeDefinition>
> = {
  tomato_carrot_salad: {
    id: "tomato_carrot_salad", name: "番茄胡萝卜沙拉", originTownId: "greenvale", requiredLevel: 1,
    techniqueIds: ["knife_basics"],
    inputs: [
      { ingredientId: "tomato", quantity: 2 },
      { ingredientId: "carrot", quantity: 1 },
      { ingredientId: "mineral_salt", quantity: 1 },
    ],
    servings: 2, basePrice: 42, experienceReward: 10,
    localReputationReward: 1, unlockCoinCost: 0,
    requiredLocalReputation: 0, unlockLocalReputationCost: 0,
  },
  cucumber_garlic_salad: {
    id: "cucumber_garlic_salad", name: "蒜香黄瓜", originTownId: "greenvale", requiredLevel: 1,
    techniqueIds: ["knife_basics"],
    inputs: [
      { ingredientId: "cucumber", quantity: 2 },
      { ingredientId: "garlic", quantity: 1 },
      { ingredientId: "vinegar", quantity: 1 },
    ],
    servings: 2, basePrice: 38, experienceReward: 9,
    localReputationReward: 1, unlockCoinCost: 60,
    requiredLocalReputation: 4, unlockLocalReputationCost: 0,
  },
  green_pepper_egg: {
    id: "green_pepper_egg", name: "青椒炒蛋", originTownId: "greenvale", requiredLevel: 1,
    techniqueIds: ["sauce_craft"],
    inputs: [
      { ingredientId: "green_pepper", quantity: 1 },
      { ingredientId: "egg", quantity: 2 },
      { ingredientId: "soy_sauce", quantity: 1 },
    ],
    servings: 2, basePrice: 55, experienceReward: 13,
    localReputationReward: 1, unlockCoinCost: 100,
    requiredLocalReputation: 8, unlockLocalReputationCost: 1,
  },
  pumpkin_milk_soup: {
    id: "pumpkin_milk_soup", name: "南瓜奶汤", originTownId: "greenvale", requiredLevel: 2,
    techniqueIds: ["sauce_craft"],
    inputs: [
      { ingredientId: "pumpkin", quantity: 2 },
      { ingredientId: "milk", quantity: 1 },
      { ingredientId: "mineral_salt", quantity: 1 },
    ],
    servings: 3, basePrice: 62, experienceReward: 16,
    localReputationReward: 1, unlockCoinCost: 150,
    requiredLocalReputation: 12, unlockLocalReputationCost: 1,
  },
  duck_egg_tofu: {
    id: "duck_egg_tofu", name: "鸭蛋蒸豆腐", originTownId: "greenvale", requiredLevel: 2,
    techniqueIds: ["grain_milling", "sauce_craft"],
    inputs: [
      { ingredientId: "duck_egg", quantity: 2 },
      { ingredientId: "tofu", quantity: 1 },
      { ingredientId: "soy_sauce", quantity: 1 },
    ],
    servings: 2, basePrice: 70, experienceReward: 18,
    localReputationReward: 1, unlockCoinCost: 190,
    requiredLocalReputation: 15, unlockLocalReputationCost: 1,
  },
  strawberry_goat_pudding: {
    id: "strawberry_goat_pudding", name: "草莓羊乳布丁", originTownId: "greenvale", requiredLevel: 3,
    techniqueIds: ["sauce_craft"],
    inputs: [
      { ingredientId: "strawberry", quantity: 2 },
      { ingredientId: "goat_milk", quantity: 2 },
      { ingredientId: "sugar", quantity: 1 },
    ],
    servings: 3, basePrice: 92, experienceReward: 22,
    localReputationReward: 2, unlockCoinCost: 280,
    requiredLocalReputation: 21, unlockLocalReputationCost: 2,
  },
  tofu_vegetable_pot: {
    id: "tofu_vegetable_pot", name: "田园豆腐煲", originTownId: "greenvale", requiredLevel: 2,
    techniqueIds: ["grain_milling", "sauce_craft"],
    inputs: [
      { ingredientId: "tofu", quantity: 2 },
      { ingredientId: "tomato", quantity: 1 },
      { ingredientId: "onion", quantity: 1 },
      { ingredientId: "soy_sauce", quantity: 1 },
    ],
    servings: 3, basePrice: 64, experienceReward: 17,
    localReputationReward: 1, unlockCoinCost: 180,
    requiredLocalReputation: 14, unlockLocalReputationCost: 1,
  },
  river_fish_soup: {
    id: "river_fish_soup", name: "河鲜香草汤", originTownId: "greenvale", requiredLevel: 3,
    techniqueIds: ["knife_basics", "sauce_craft"],
    inputs: [
      { ingredientId: "freshwater_fish", quantity: 1 },
      { ingredientId: "onion", quantity: 1 },
      { ingredientId: "alpine_herb", quantity: 1 },
      { ingredientId: "mineral_salt", quantity: 1 },
    ],
    servings: 2, basePrice: 105, experienceReward: 24,
    localReputationReward: 2, unlockCoinCost: 320,
    requiredLocalReputation: 22, unlockLocalReputationCost: 2,
  },
  farmhouse_bread: {
    id: "farmhouse_bread", name: "农庄面包", originTownId: "greenvale", requiredLevel: 2,
    techniqueIds: ["grain_milling"],
    inputs: [
      { ingredientId: "flour", quantity: 2 },
      { ingredientId: "butter", quantity: 1 },
      { ingredientId: "sugar", quantity: 1 },
    ],
    servings: 3, basePrice: 48, experienceReward: 15,
    localReputationReward: 1, unlockCoinCost: 160,
    requiredLocalReputation: 12, unlockLocalReputationCost: 1,
  },
  chicken_skewer: {
    id: "chicken_skewer", name: "青椒鸡肉串", originTownId: "greenvale", requiredLevel: 2,
    techniqueIds: ["butchery", "sauce_craft"],
    inputs: [
      { ingredientId: "chicken_meat", quantity: 2 },
      { ingredientId: "green_pepper", quantity: 1 },
      { ingredientId: "soy_sauce", quantity: 1 },
    ],
    servings: 2, basePrice: 88, experienceReward: 20,
    localReputationReward: 2, unlockCoinCost: 260,
    requiredLocalReputation: 18, unlockLocalReputationCost: 2,
  },
  pork_rice_bowl: {
    id: "pork_rice_bowl", name: "猪肉盖饭", originTownId: "greenvale", requiredLevel: 3,
    techniqueIds: ["butchery", "grain_milling", "sauce_craft"],
    inputs: [
      { ingredientId: "pork_slices", quantity: 2 },
      { ingredientId: "polished_rice", quantity: 2 },
      { ingredientId: "soy_sauce", quantity: 1 },
    ],
    servings: 2, basePrice: 116, experienceReward: 26,
    localReputationReward: 2, unlockCoinCost: 360,
    requiredLocalReputation: 25, unlockLocalReputationCost: 3,
  },
  frost_berry_tart: {
    id: "frost_berry_tart", name: "霜岭云莓挞", originTownId: "frostpeak", requiredLevel: 4,
    techniqueIds: ["pastry", "cold_chain"],
    inputs: [
      { ingredientId: "cloudberry", quantity: 2 },
      { ingredientId: "flour", quantity: 1 },
      { ingredientId: "butter", quantity: 1 },
      { ingredientId: "sugar", quantity: 1 },
    ],
    servings: 2, basePrice: 150, experienceReward: 34,
    localReputationReward: 3, unlockCoinCost: 520,
    requiredLocalReputation: 35, unlockLocalReputationCost: 4,
  },
  yak_milk_stew: {
    id: "yak_milk_stew", name: "牦牛奶雪薯炖菜", originTownId: "frostpeak", requiredLevel: 4,
    techniqueIds: ["cold_chain", "sauce_craft"],
    inputs: [
      { ingredientId: "yak_milk", quantity: 2 },
      { ingredientId: "snow_potato", quantity: 2 },
      { ingredientId: "alpine_pepper", quantity: 1 },
      { ingredientId: "pepper", quantity: 1 },
    ],
    servings: 3, basePrice: 138, experienceReward: 32,
    localReputationReward: 3, unlockCoinCost: 480,
    requiredLocalReputation: 32, unlockLocalReputationCost: 3,
  },
  mountain_mushroom_grill: {
    id: "mountain_mushroom_grill", name: "高山香草烤菌", originTownId: "frostpeak", requiredLevel: 3,
    techniqueIds: ["cold_chain", "sauce_craft"],
    inputs: [
      { ingredientId: "mountain_mushroom", quantity: 2 },
      { ingredientId: "alpine_herb", quantity: 1 },
      { ingredientId: "butter", quantity: 1 },
      { ingredientId: "mineral_salt", quantity: 1 },
    ],
    servings: 2, basePrice: 118, experienceReward: 27,
    localReputationReward: 2, unlockCoinCost: 390,
    requiredLocalReputation: 27, unlockLocalReputationCost: 3,
  },
  snow_crab_salad: {
    id: "snow_crab_salad", name: "雪蟹冰叶沙拉", originTownId: "frostpeak", requiredLevel: 4,
    techniqueIds: ["cold_chain", "knife_basics"],
    inputs: [
      { ingredientId: "snow_crab", quantity: 1 },
      { ingredientId: "ice_lettuce", quantity: 2 },
      { ingredientId: "snow_cabbage", quantity: 1 },
      { ingredientId: "vinegar", quantity: 1 },
    ],
    servings: 2, basePrice: 168, experienceReward: 36,
    localReputationReward: 3, unlockCoinCost: 560,
    requiredLocalReputation: 38, unlockLocalReputationCost: 4,
  },
  rare_mushroom_stew: {
    id: "rare_mushroom_stew", name: "珍菌雪薯浓汤", originTownId: "frostpeak", requiredLevel: 4,
    techniqueIds: ["cold_chain", "sauce_craft"],
    inputs: [
      { ingredientId: "rare_mushroom", quantity: 1 },
      { ingredientId: "snow_potato", quantity: 2 },
      { ingredientId: "frost_onion", quantity: 1 },
      { ingredientId: "milk", quantity: 1 },
      { ingredientId: "pepper", quantity: 1 },
    ],
    servings: 3, basePrice: 144, experienceReward: 33,
    localReputationReward: 3, unlockCoinCost: 500,
    requiredLocalReputation: 34, unlockLocalReputationCost: 3,
  },
};

export const RESTAURANT_SHOP_ITEM_IDS = [
  "mineral_salt_pack",
  "soy_sauce_pack",
  "vinegar_pack",
  "sugar_pack",
  "butter_pack",
  "pepper_pack",
  "freshwater_fish_crate",
  "snow_crab_crate",
  "rare_mushroom_basket",
] as const;
export type RestaurantShopItemId =
  (typeof RESTAURANT_SHOP_ITEM_IDS)[number];

export interface RestaurantShopItemDefinition {
  readonly id: RestaurantShopItemId;
  readonly name: string;
  readonly category: "special_ingredient" | "seasoning";
  readonly supplierTownId: EstateTownId;
  readonly ingredientId: RestaurantIngredientId;
  readonly quantity: number;
  readonly coinPrice: number;
  readonly requiredLocalReputation: number;
  readonly localReputationCost: number;
  readonly dailyPurchaseLimit: number;
  readonly dailyStock: number;
}

export const RESTAURANT_SHOP_ITEMS: Readonly<
  Record<RestaurantShopItemId, RestaurantShopItemDefinition>
> = {
  mineral_salt_pack: {
    id: "mineral_salt_pack", name: "精盐包", category: "seasoning",
    supplierTownId: "greenvale", ingredientId: "mineral_salt", quantity: 4,
    coinPrice: 24, requiredLocalReputation: 0, localReputationCost: 0,
    dailyPurchaseLimit: 4, dailyStock: 4,
  },
  soy_sauce_pack: {
    id: "soy_sauce_pack", name: "酱油坛", category: "seasoning",
    supplierTownId: "greenvale", ingredientId: "soy_sauce", quantity: 3,
    coinPrice: 36, requiredLocalReputation: 5, localReputationCost: 0,
    dailyPurchaseLimit: 3, dailyStock: 3,
  },
  vinegar_pack: {
    id: "vinegar_pack", name: "香醋坛", category: "seasoning",
    supplierTownId: "greenvale", ingredientId: "vinegar", quantity: 3,
    coinPrice: 32, requiredLocalReputation: 8, localReputationCost: 0,
    dailyPurchaseLimit: 3, dailyStock: 3,
  },
  sugar_pack: {
    id: "sugar_pack", name: "砂糖包", category: "seasoning",
    supplierTownId: "greenvale", ingredientId: "sugar", quantity: 3,
    coinPrice: 40, requiredLocalReputation: 10, localReputationCost: 0,
    dailyPurchaseLimit: 3, dailyStock: 3,
  },
  butter_pack: {
    id: "butter_pack", name: "黄油块", category: "special_ingredient",
    supplierTownId: "greenvale", ingredientId: "butter", quantity: 2,
    coinPrice: 56, requiredLocalReputation: 12, localReputationCost: 0,
    dailyPurchaseLimit: 2, dailyStock: 2,
  },
  pepper_pack: {
    id: "pepper_pack", name: "高原胡椒", category: "seasoning",
    supplierTownId: "frostpeak", ingredientId: "pepper", quantity: 3,
    coinPrice: 52, requiredLocalReputation: 10, localReputationCost: 0,
    dailyPurchaseLimit: 3, dailyStock: 3,
  },
  freshwater_fish_crate: {
    id: "freshwater_fish_crate", name: "河鲜箱", category: "special_ingredient",
    supplierTownId: "greenvale", ingredientId: "freshwater_fish", quantity: 2,
    coinPrice: 90, requiredLocalReputation: 20, localReputationCost: 1,
    dailyPurchaseLimit: 2, dailyStock: 2,
  },
  snow_crab_crate: {
    id: "snow_crab_crate", name: "雪蟹箱", category: "special_ingredient",
    supplierTownId: "frostpeak", ingredientId: "snow_crab", quantity: 2,
    coinPrice: 130, requiredLocalReputation: 28, localReputationCost: 2,
    dailyPurchaseLimit: 1, dailyStock: 1,
  },
  rare_mushroom_basket: {
    id: "rare_mushroom_basket", name: "珍稀菌菇篮", category: "special_ingredient",
    supplierTownId: "frostpeak", ingredientId: "rare_mushroom", quantity: 2,
    coinPrice: 110, requiredLocalReputation: 22, localReputationCost: 1,
    dailyPurchaseLimit: 2, dailyStock: 2,
  },
};

export interface RestaurantIngredientLot {
  readonly lotId: number;
  readonly ingredientId: RestaurantIngredientId;
  readonly sourceTownId: EstateTownId | null;
  readonly sourceKind:
    | "farm"
    | "ranch"
    | "homestead_goods"
    | "restaurant_shop"
    | "processed";
  quantity: number;
  readonly acquiredAt: number;
}

export interface RestaurantSupplyShipment {
  readonly id: string;
  readonly sourceTownId: EstateTownId;
  readonly manifest: readonly RestaurantIngredientAmount[];
  readonly dispatchedAt: number;
  readonly arrivesAt: number;
  status: "in_transit" | "collected";
}

export interface RestaurantProcessingJob {
  readonly id: number;
  readonly processingId: RestaurantProcessingId;
  readonly quantity: number;
  readonly sourceTownId: EstateTownId | null;
  readonly startedAt: number;
  readonly completesAt: number;
  collected: boolean;
}

export interface RestaurantShopOffer {
  readonly itemId: RestaurantShopItemId;
  remaining: number;
}

export interface RestaurantShopState {
  dayKey: string;
  offers: RestaurantShopOffer[];
  purchaseLedger: Partial<Record<RestaurantShopItemId, number>>;
}

export interface RestaurantServiceOrder {
  readonly id: string;
  readonly recipeId: RestaurantRecipeId;
  readonly coinReward: number;
  readonly experienceReward: number;
  readonly localReputationReward: number;
  status: "pending" | "served" | "expired";
}

export interface RestaurantServiceState {
  readonly id: string;
  readonly townId: EstateTownId;
  readonly openedAt: number;
  readonly orders: RestaurantServiceOrder[];
  status: "serving" | "settled";
}

export interface RestaurantStatistics {
  ingredientsSupplied: number;
  ingredientsProcessed: number;
  dishesPrepared: number;
  customersServed: number;
  servicesCompleted: number;
  coinsEarned: number;
  shopPurchases: number;
}

export interface RestaurantLogEntry {
  readonly id: number;
  readonly at: number;
  readonly kind: "system" | "supply" | "processing" | "shop" | "service";
  readonly text: string;
}

export interface RestaurantGameState {
  readonly kind: "restaurant";
  readonly version: typeof RESTAURANT_STATE_VERSION;
  readonly ownerId: string;
  ownerName: string;
  readonly seed: string;
  revision: number;
  level: number;
  experience: number;
  warehouseCapacity: number;
  lots: RestaurantIngredientLot[];
  shipments: RestaurantSupplyShipment[];
  processingJobs: RestaurantProcessingJob[];
  unlockedTechniqueIds: RestaurantTechniqueId[];
  unlockedRecipeIds: RestaurantRecipeId[];
  preparedDishes: Partial<Record<RestaurantRecipeId, number>>;
  menu: RestaurantRecipeId[];
  service: RestaurantServiceState | null;
  shop: RestaurantShopState;
  statistics: RestaurantStatistics;
  logs: RestaurantLogEntry[];
  nextLotId: number;
  nextJobId: number;
  nextLogId: number;
  createdAt: number;
  updatedAt: number;
}

export interface RestaurantEconomy {
  coins: number;
  localReputation: Record<EstateTownId, number>;
}

export type RestaurantAction =
  | { readonly type: "restaurant_buy_shop_item"; readonly itemId: RestaurantShopItemId; readonly quantity: number }
  | { readonly type: "restaurant_learn_technique"; readonly techniqueId: RestaurantTechniqueId; readonly sponsorTownId: EstateTownId }
  | { readonly type: "restaurant_unlock_recipe"; readonly recipeId: RestaurantRecipeId; readonly sponsorTownId: EstateTownId }
  | { readonly type: "restaurant_start_processing"; readonly processingId: RestaurantProcessingId; readonly quantity: number }
  | { readonly type: "restaurant_collect_processing"; readonly jobId: number }
  | { readonly type: "restaurant_collect_supply"; readonly shipmentId: string }
  | { readonly type: "restaurant_prepare_dish"; readonly recipeId: RestaurantRecipeId; readonly quantity: number }
  | { readonly type: "restaurant_set_menu"; readonly recipeIds: readonly RestaurantRecipeId[] }
  | { readonly type: "restaurant_open_service"; readonly serviceTownId: EstateTownId }
  | { readonly type: "restaurant_serve_order"; readonly orderId: string }
  | { readonly type: "restaurant_close_service" };

export class RestaurantRuleError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "RestaurantRuleError";
  }
}

function restaurantDayKey(now: number): string {
  return new Date(now + 8 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function restaurantLevel(experience: number): number {
  const thresholds = [0, 120, 320, 650, 1_100, 1_700, 2_500, 3_600];
  let level = 1;
  for (let index = 1; index < thresholds.length; index += 1) {
    if (experience < thresholds[index]!) break;
    level = index + 1;
  }
  return level;
}

function createDailyShop(dayKey: string, seed: string): RestaurantShopState {
  const stapleIds: RestaurantShopItemId[] = [
    "mineral_salt_pack", "soy_sauce_pack", "sugar_pack",
  ];
  const rotating = RESTAURANT_SHOP_ITEM_IDS.filter((id) =>
    !stapleIds.includes(id)
  );
  const start = stableHash(`${seed}:${dayKey}:restaurant-shop`) % rotating.length;
  const selected = [
    ...stapleIds,
    rotating[start]!,
    rotating[(start + 2) % rotating.length]!,
    rotating[(start + 4) % rotating.length]!,
  ];
  return {
    dayKey,
    offers: [...new Set(selected)].map((itemId) => ({
      itemId,
      remaining: RESTAURANT_SHOP_ITEMS[itemId].dailyStock,
    })),
    purchaseLedger: {},
  };
}

function cloneRestaurant(state: RestaurantGameState): RestaurantGameState {
  return structuredClone(state);
}

function addLog(
  state: RestaurantGameState,
  now: number,
  kind: RestaurantLogEntry["kind"],
  text: string,
): void {
  state.logs.unshift({ id: state.nextLogId, at: now, kind, text });
  state.nextLogId += 1;
  if (state.logs.length > RESTAURANT_MAX_LOGS) {
    state.logs.length = RESTAURANT_MAX_LOGS;
  }
}

export function restaurantWarehouseQuantity(state: RestaurantGameState): number {
  return state.lots.reduce((total, lot) => total + lot.quantity, 0);
}

export function restaurantReservedSupplyQuantity(
  state: RestaurantGameState,
): number {
  return state.shipments.reduce(
    (total, shipment) => total + (shipment.status === "in_transit"
      ? shipment.manifest.reduce((sum, item) => sum + item.quantity, 0)
      : 0),
    0,
  );
}

export function restaurantIngredientCount(
  state: RestaurantGameState,
  ingredientId: RestaurantIngredientId,
): number {
  return state.lots.reduce(
    (total, lot) => total + (lot.ingredientId === ingredientId ? lot.quantity : 0),
    0,
  );
}

function addIngredient(
  state: RestaurantGameState,
  ingredientId: RestaurantIngredientId,
  quantity: number,
  sourceTownId: EstateTownId | null,
  sourceKind: RestaurantIngredientLot["sourceKind"],
  now: number,
): void {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new RestaurantRuleError("RESTAURANT_INVALID_QUANTITY", "食材数量无效");
  }
  if (
    restaurantWarehouseQuantity(state) +
      restaurantReservedSupplyQuantity(state) +
      quantity > state.warehouseCapacity
  ) {
    throw new RestaurantRuleError("RESTAURANT_WAREHOUSE_FULL", "餐厅仓库容量不足");
  }
  if (state.lots.length >= RESTAURANT_MAX_LOTS) {
    throw new RestaurantRuleError("RESTAURANT_TOO_MANY_LOTS", "食材批次过多，请先使用仓库食材");
  }
  state.lots.push({
    lotId: state.nextLotId,
    ingredientId,
    sourceTownId,
    sourceKind,
    quantity,
    acquiredAt: now,
  });
  state.nextLotId += 1;
}

function consumeIngredient(
  state: RestaurantGameState,
  ingredientId: RestaurantIngredientId,
  quantity: number,
): EstateTownId | null {
  if (restaurantIngredientCount(state, ingredientId) < quantity) {
    throw new RestaurantRuleError(
      "RESTAURANT_INGREDIENT_SHORTAGE",
      `${RESTAURANT_INGREDIENTS[ingredientId].name}不足`,
    );
  }
  let remaining = quantity;
  let sourceTownId: EstateTownId | null = null;
  const lots = state.lots
    .filter((lot) => lot.ingredientId === ingredientId && lot.quantity > 0)
    .sort((left, right) => left.acquiredAt - right.acquiredAt || left.lotId - right.lotId);
  for (const lot of lots) {
    const taken = Math.min(remaining, lot.quantity);
    lot.quantity -= taken;
    remaining -= taken;
    sourceTownId ??= lot.sourceTownId;
    if (remaining === 0) break;
  }
  state.lots = state.lots.filter((lot) => lot.quantity > 0);
  return sourceTownId;
}

function assertEconomyTown(
  economy: RestaurantEconomy,
  townId: EstateTownId,
): number {
  const reputation = economy.localReputation[townId];
  if (!Number.isFinite(reputation) || reputation < 0) {
    throw new RestaurantRuleError("RESTAURANT_TOWN_LOCKED", "该城镇尚未建立可用声望");
  }
  return reputation;
}

function spendUnlockCost(
  economy: RestaurantEconomy,
  townId: EstateTownId,
  coinCost: number,
  requiredReputation: number,
  reputationCost: number,
): void {
  const reputation = assertEconomyTown(economy, townId);
  if (reputation < requiredReputation) {
    throw new RestaurantRuleError("RESTAURANT_REPUTATION_REQUIRED", "当地声望不足");
  }
  if (reputation < reputationCost) {
    throw new RestaurantRuleError("RESTAURANT_REPUTATION_SHORTAGE", "可消费的当地声望不足");
  }
  if (economy.coins < coinCost) {
    throw new RestaurantRuleError("RESTAURANT_COINS_SHORTAGE", "金币不足");
  }
  economy.coins -= coinCost;
  economy.localReputation[townId] -= reputationCost;
}

export function createRestaurantGame(input: {
  readonly ownerId: string;
  readonly ownerName: string;
  readonly seed: string;
  readonly now?: number;
}): RestaurantGameState {
  const now = input.now ?? Date.now();
  return {
    kind: "restaurant",
    version: RESTAURANT_STATE_VERSION,
    ownerId: input.ownerId,
    ownerName: input.ownerName,
    seed: input.seed,
    revision: 0,
    level: 1,
    experience: 0,
    warehouseCapacity: 120,
    lots: [],
    shipments: [],
    processingJobs: [],
    unlockedTechniqueIds: ["knife_basics"],
    unlockedRecipeIds: ["tomato_carrot_salad"],
    preparedDishes: {},
    menu: [],
    service: null,
    shop: createDailyShop(restaurantDayKey(now), input.seed),
    statistics: {
      ingredientsSupplied: 0,
      ingredientsProcessed: 0,
      dishesPrepared: 0,
      customersServed: 0,
      servicesCompleted: 0,
      coinsEarned: 0,
      shopPurchases: 0,
    },
    logs: [],
    nextLotId: 1,
    nextJobId: 1,
    nextLogId: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export function refreshRestaurantGame(
  state: RestaurantGameState,
  now = Date.now(),
): RestaurantGameState {
  const next = cloneRestaurant(state);
  const dayKey = restaurantDayKey(now);
  if (next.shop.dayKey !== dayKey) {
    next.shop = createDailyShop(dayKey, next.seed);
    next.revision += 1;
    next.updatedAt = Math.max(next.updatedAt, now);
    addLog(next, now, "shop", "餐厅供应商已刷新今日货单");
  }
  return next;
}

export function dispatchRestaurantSupply(
  state: RestaurantGameState,
  input: {
    readonly shipmentId: string;
    readonly sourceTownId: EstateTownId;
    readonly manifest: readonly RestaurantIngredientAmount[];
    readonly now: number;
    readonly durationSeconds: number;
  },
): RestaurantGameState {
  const next = refreshRestaurantGame(state, input.now);
  if (!input.shipmentId || next.shipments.some(({ id }) => id === input.shipmentId)) {
    throw new RestaurantRuleError("RESTAURANT_SHIPMENT_EXISTS", "供货单编号无效或已存在");
  }
  if (next.shipments.filter(({ status }) => status === "in_transit").length >= 6) {
    throw new RestaurantRuleError("RESTAURANT_SHIPMENT_LIMIT", "运输中的餐厅供货单已达上限");
  }
  if (input.manifest.length < 1 || input.manifest.length > 8) {
    throw new RestaurantRuleError("RESTAURANT_INVALID_MANIFEST", "供货清单应包含1至8种食材");
  }
  const total = input.manifest.reduce((sum, item) => {
    if (!RESTAURANT_INGREDIENT_IDS.includes(item.ingredientId) ||
      !Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 999) {
      throw new RestaurantRuleError("RESTAURANT_INVALID_MANIFEST", "供货清单包含无效食材");
    }
    return sum + item.quantity;
  }, 0);
  if (
    restaurantWarehouseQuantity(next) +
      restaurantReservedSupplyQuantity(next) +
      total > next.warehouseCapacity
  ) {
    throw new RestaurantRuleError("RESTAURANT_WAREHOUSE_FULL", "餐厅仓库无法接收这批货物");
  }
  while (next.shipments.length >= RESTAURANT_MAX_SHIPMENTS) {
    let removableIndex = -1;
    for (let index = next.shipments.length - 1; index >= 0; index -= 1) {
      if (next.shipments[index]?.status === "collected") {
        removableIndex = index;
        break;
      }
    }
    if (removableIndex < 0) {
      throw new RestaurantRuleError("RESTAURANT_SHIPMENT_LIMIT", "餐厅供货记录已满");
    }
    next.shipments.splice(removableIndex, 1);
  }
  next.shipments.unshift({
    id: input.shipmentId,
    sourceTownId: input.sourceTownId,
    manifest: input.manifest.map((item) => ({
      ...item,
      sourceKind: item.sourceKind ?? "farm",
    })),
    dispatchedAt: input.now,
    arrivesAt: input.now + Math.max(0, input.durationSeconds) * 1_000,
    status: "in_transit",
  });
  next.statistics.ingredientsSupplied += total;
  next.revision += 1;
  next.updatedAt = Math.max(next.updatedAt, input.now);
  addLog(next, input.now, "supply", `已从${input.sourceTownId}发出餐厅供货`);
  return next;
}

function collectSupply(
  state: RestaurantGameState,
  shipmentId: string,
  now: number,
): void {
  const shipment = state.shipments.find(({ id }) => id === shipmentId);
  if (!shipment) {
    throw new RestaurantRuleError("RESTAURANT_SHIPMENT_NOT_FOUND", "未找到餐厅供货单");
  }
  if (shipment.status !== "in_transit") {
    throw new RestaurantRuleError("RESTAURANT_SHIPMENT_COLLECTED", "该供货单已经收货");
  }
  if (now < shipment.arrivesAt) {
    throw new RestaurantRuleError("RESTAURANT_SHIPMENT_IN_TRANSIT", "供货尚未抵达餐厅");
  }
  shipment.status = "collected";
  for (const item of shipment.manifest) {
    addIngredient(
      state,
      item.ingredientId,
      item.quantity,
      shipment.sourceTownId,
      item.sourceKind ?? "farm",
      now,
    );
  }
  addLog(state, now, "supply", `已接收来自${shipment.sourceTownId}的食材`);
}

function applyRestaurantActionMutable(
  state: RestaurantGameState,
  economy: RestaurantEconomy,
  action: RestaurantAction,
  now: number,
): void {
  switch (action.type) {
    case "restaurant_buy_shop_item": {
      const item = RESTAURANT_SHOP_ITEMS[action.itemId];
      if (!Number.isInteger(action.quantity) || action.quantity <= 0) {
        throw new RestaurantRuleError("RESTAURANT_INVALID_QUANTITY", "购买数量无效");
      }
      const offer = state.shop.offers.find(({ itemId }) => itemId === action.itemId);
      if (!offer) {
        throw new RestaurantRuleError("RESTAURANT_SHOP_ITEM_UNAVAILABLE", "今日没有这件商品");
      }
      const purchased = state.shop.purchaseLedger[action.itemId] ?? 0;
      if (offer.remaining < action.quantity ||
        purchased + action.quantity > item.dailyPurchaseLimit) {
        throw new RestaurantRuleError("RESTAURANT_SHOP_LIMIT", "商品库存或每日限购不足");
      }
      spendUnlockCost(
        economy,
        item.supplierTownId,
        item.coinPrice * action.quantity,
        item.requiredLocalReputation,
        item.localReputationCost * action.quantity,
      );
      addIngredient(
        state,
        item.ingredientId,
        item.quantity * action.quantity,
        item.supplierTownId,
        "restaurant_shop",
        now,
      );
      offer.remaining -= action.quantity;
      state.shop.purchaseLedger[action.itemId] = purchased + action.quantity;
      state.statistics.shopPurchases += action.quantity;
      addLog(state, now, "shop", `购买了${item.name}`);
      return;
    }
    case "restaurant_learn_technique": {
      if (state.unlockedTechniqueIds.includes(action.techniqueId)) {
        throw new RestaurantRuleError("RESTAURANT_TECHNIQUE_UNLOCKED", "已经学习该技法");
      }
      const definition = RESTAURANT_TECHNIQUES[action.techniqueId];
      if (action.sponsorTownId !== definition.teacherTownId) {
        throw new RestaurantRuleError("RESTAURANT_TECHNIQUE_ORIGIN", "必须使用技法导师所在城镇的当地声望");
      }
      if (state.level < definition.requiredLevel ||
        definition.prerequisiteIds.some((id) => !state.unlockedTechniqueIds.includes(id))) {
        throw new RestaurantRuleError("RESTAURANT_TECHNIQUE_PREREQUISITE", "餐厅等级或前置技法不足");
      }
      spendUnlockCost(
        economy, definition.teacherTownId, definition.coinCost,
        definition.requiredLocalReputation, definition.localReputationCost,
      );
      state.unlockedTechniqueIds.push(action.techniqueId);
      addLog(state, now, "system", `学会了${definition.name}`);
      return;
    }
    case "restaurant_unlock_recipe": {
      if (state.unlockedRecipeIds.includes(action.recipeId)) {
        throw new RestaurantRuleError("RESTAURANT_RECIPE_UNLOCKED", "已经解锁该菜谱");
      }
      const recipe = RESTAURANT_RECIPES[action.recipeId];
      if (action.sponsorTownId !== recipe.originTownId) {
        throw new RestaurantRuleError("RESTAURANT_RECIPE_ORIGIN", "必须使用菜谱来源城镇的当地声望");
      }
      if (state.level < recipe.requiredLevel ||
        recipe.techniqueIds.some((id) => !state.unlockedTechniqueIds.includes(id))) {
        throw new RestaurantRuleError("RESTAURANT_RECIPE_PREREQUISITE", "餐厅等级或技法不足");
      }
      spendUnlockCost(
        economy, recipe.originTownId, recipe.unlockCoinCost,
        recipe.requiredLocalReputation, recipe.unlockLocalReputationCost,
      );
      state.unlockedRecipeIds.push(action.recipeId);
      addLog(state, now, "system", `解锁了${recipe.name}`);
      return;
    }
    case "restaurant_start_processing": {
      const process = RESTAURANT_PROCESSING[action.processingId];
      if (!Number.isInteger(action.quantity) || action.quantity <= 0 || action.quantity > 99) {
        throw new RestaurantRuleError("RESTAURANT_INVALID_QUANTITY", "加工数量无效");
      }
      if (!state.unlockedTechniqueIds.includes(process.techniqueId)) {
        throw new RestaurantRuleError("RESTAURANT_PROCESSING_LOCKED", "尚未学习所需加工技法");
      }
      state.processingJobs = state.processingJobs.filter(({ collected }) => !collected);
      if (state.processingJobs.filter(({ collected }) => !collected).length >= RESTAURANT_MAX_PROCESSING_JOBS) {
        throw new RestaurantRuleError("RESTAURANT_PROCESSING_LIMIT", "加工队列已满");
      }
      if (economy.coins < process.coinCost * action.quantity) {
        throw new RestaurantRuleError("RESTAURANT_COINS_SHORTAGE", "金币不足");
      }
      let sourceTownId: EstateTownId | null = null;
      for (const input of process.inputs) {
        sourceTownId ??= consumeIngredient(
          state, input.ingredientId, input.quantity * action.quantity,
        );
      }
      economy.coins -= process.coinCost * action.quantity;
      state.processingJobs.push({
        id: state.nextJobId,
        processingId: process.id,
        quantity: action.quantity,
        sourceTownId,
        startedAt: now,
        completesAt: now + process.durationSeconds * action.quantity * 1_000,
        collected: false,
      });
      state.nextJobId += 1;
      addLog(state, now, "processing", `开始${process.name}`);
      return;
    }
    case "restaurant_collect_processing": {
      const job = state.processingJobs.find(({ id }) => id === action.jobId);
      if (!job) throw new RestaurantRuleError("RESTAURANT_JOB_NOT_FOUND", "未找到加工任务");
      if (job.collected) throw new RestaurantRuleError("RESTAURANT_JOB_COLLECTED", "加工产物已经领取");
      if (now < job.completesAt) throw new RestaurantRuleError("RESTAURANT_JOB_NOT_READY", "加工尚未完成");
      const process = RESTAURANT_PROCESSING[job.processingId];
      addIngredient(
        state,
        process.output.ingredientId,
        process.output.quantity * job.quantity,
        job.sourceTownId,
        "processed",
        now,
      );
      state.processingJobs = state.processingJobs.filter(({ id }) => id !== job.id);
      state.statistics.ingredientsProcessed += process.output.quantity * job.quantity;
      addLog(state, now, "processing", `领取了${process.name}产物`);
      return;
    }
    case "restaurant_collect_supply":
      collectSupply(state, action.shipmentId, now);
      return;
    case "restaurant_prepare_dish": {
      if (!Number.isInteger(action.quantity) || action.quantity <= 0 || action.quantity > 99) {
        throw new RestaurantRuleError("RESTAURANT_INVALID_QUANTITY", "制作数量无效");
      }
      if (!state.unlockedRecipeIds.includes(action.recipeId)) {
        throw new RestaurantRuleError("RESTAURANT_RECIPE_LOCKED", "尚未解锁该菜谱");
      }
      const recipe = RESTAURANT_RECIPES[action.recipeId];
      for (const input of recipe.inputs) {
        if (!RESTAURANT_INGREDIENTS[input.ingredientId].dishUsable) {
          throw new RestaurantRuleError("RESTAURANT_RAW_INGREDIENT", "原料必须加工后才能入菜");
        }
        if (restaurantIngredientCount(state, input.ingredientId) < input.quantity * action.quantity) {
          throw new RestaurantRuleError("RESTAURANT_INGREDIENT_SHORTAGE", "制作菜品所需食材不足");
        }
      }
      for (const input of recipe.inputs) {
        consumeIngredient(state, input.ingredientId, input.quantity * action.quantity);
      }
      const servings = recipe.servings * action.quantity;
      state.preparedDishes[action.recipeId] =
        (state.preparedDishes[action.recipeId] ?? 0) + servings;
      state.statistics.dishesPrepared += servings;
      addLog(state, now, "service", `制作了${recipe.name}${servings}份`);
      return;
    }
    case "restaurant_set_menu": {
      const unique = [...new Set(action.recipeIds)];
      const menuSlots = Math.min(6, 2 + Math.floor((state.level - 1) / 2));
      if (unique.length > menuSlots ||
        unique.some((id) => !state.unlockedRecipeIds.includes(id))) {
        throw new RestaurantRuleError("RESTAURANT_INVALID_MENU", "菜单包含未解锁菜谱或超过槽位上限");
      }
      if (state.service?.status === "serving") {
        throw new RestaurantRuleError("RESTAURANT_SERVICE_ACTIVE", "营业中不能更换菜单");
      }
      state.menu = unique;
      return;
    }
    case "restaurant_open_service": {
      if (state.service?.status === "serving") {
        throw new RestaurantRuleError("RESTAURANT_SERVICE_ACTIVE", "餐厅已经开始营业");
      }
      assertEconomyTown(economy, action.serviceTownId);
      const available = state.menu.filter((id) => (state.preparedDishes[id] ?? 0) > 0);
      if (available.length === 0) {
        throw new RestaurantRuleError("RESTAURANT_MENU_EMPTY", "菜单没有可供应的菜品");
      }
      const count = Math.min(8, 3 + Math.floor(state.level / 2));
      const serviceId = `${restaurantDayKey(now)}:${state.revision + 1}`;
      const start = stableHash(`${state.seed}:${serviceId}:${action.serviceTownId}`) % available.length;
      const orders: RestaurantServiceOrder[] = [];
      for (let index = 0; index < count; index += 1) {
        const recipeId = available[(start + index) % available.length]!;
        const recipe = RESTAURANT_RECIPES[recipeId];
        orders.push({
          id: `${serviceId}:${index + 1}`,
          recipeId,
          coinReward: recipe.basePrice,
          experienceReward: recipe.experienceReward,
          localReputationReward: recipe.localReputationReward,
          status: "pending",
        });
      }
      state.service = {
        id: serviceId,
        townId: action.serviceTownId,
        openedAt: now,
        orders,
        status: "serving",
      };
      addLog(state, now, "service", `餐厅在${action.serviceTownId}开始营业`);
      return;
    }
    case "restaurant_serve_order": {
      const service = state.service;
      if (!service || service.status !== "serving") {
        throw new RestaurantRuleError("RESTAURANT_SERVICE_INACTIVE", "餐厅当前未营业");
      }
      const order = service.orders.find(({ id }) => id === action.orderId);
      if (!order) throw new RestaurantRuleError("RESTAURANT_ORDER_NOT_FOUND", "未找到该订单");
      if (order.status !== "pending") {
        throw new RestaurantRuleError("RESTAURANT_ORDER_COMPLETED", "该订单已经处理");
      }
      const prepared = state.preparedDishes[order.recipeId] ?? 0;
      if (prepared < 1) {
        throw new RestaurantRuleError("RESTAURANT_DISH_SHORTAGE", "已备菜品份数不足");
      }
      state.preparedDishes[order.recipeId] = prepared - 1;
      order.status = "served";
      economy.coins += order.coinReward;
      economy.localReputation[service.townId] += order.localReputationReward;
      state.experience += order.experienceReward;
      state.level = restaurantLevel(state.experience);
      state.warehouseCapacity = 120 + (state.level - 1) * 20;
      state.statistics.customersServed += 1;
      state.statistics.coinsEarned += order.coinReward;
      addLog(state, now, "service", `完成了${RESTAURANT_RECIPES[order.recipeId].name}订单`);
      return;
    }
    case "restaurant_close_service": {
      const service = state.service;
      if (!service || service.status !== "serving") {
        throw new RestaurantRuleError("RESTAURANT_SERVICE_INACTIVE", "餐厅当前未营业");
      }
      for (const order of service.orders) {
        if (order.status === "pending") order.status = "expired";
      }
      service.status = "settled";
      state.statistics.servicesCompleted += 1;
      addLog(state, now, "service", "本次营业已结算");
      return;
    }
  }
}

export function applyRestaurantAction(
  state: RestaurantGameState,
  economy: RestaurantEconomy,
  action: RestaurantAction,
  now = Date.now(),
): { readonly state: RestaurantGameState; readonly economy: RestaurantEconomy } {
  const next = refreshRestaurantGame(state, now);
  const nextEconomy = structuredClone(economy);
  applyRestaurantActionMutable(next, nextEconomy, action, now);
  next.revision += 1;
  next.updatedAt = Math.max(next.updatedAt, now);
  return { state: next, economy: nextEconomy };
}

export interface RestaurantGameView extends RestaurantGameState {
  readonly inventory: Record<RestaurantIngredientId, number>;
  readonly menuSlots: number;
}

export function getRestaurantGameView(
  state: RestaurantGameState,
  now = Date.now(),
): RestaurantGameView {
  const next = refreshRestaurantGame(state, now);
  const inventory = Object.fromEntries(
    RESTAURANT_INGREDIENT_IDS.map((id) => [id, restaurantIngredientCount(next, id)]),
  ) as Record<RestaurantIngredientId, number>;
  return {
    ...next,
    inventory,
    menuSlots: Math.min(6, 2 + Math.floor((next.level - 1) / 2)),
  };
}

export function assertRestorableRestaurantGameState(
  value: unknown,
): asserts value is RestaurantGameState {
  if (!value || typeof value !== "object") throw new Error("餐厅存档结构无效");
  const state = value as Partial<RestaurantGameState>;
  const nonNegativeInteger = (input: unknown): input is number =>
    Number.isSafeInteger(input) && Number(input) >= 0;
  const positiveInteger = (input: unknown): input is number =>
    Number.isSafeInteger(input) && Number(input) > 0;
  if (state.kind !== "restaurant" || state.version !== RESTAURANT_STATE_VERSION ||
    typeof state.ownerId !== "string" || typeof state.ownerName !== "string" ||
    state.ownerId.length === 0 || typeof state.seed !== "string" || state.seed.length === 0 ||
    !nonNegativeInteger(state.revision) || !positiveInteger(state.level) ||
    !nonNegativeInteger(state.experience) || !positiveInteger(state.warehouseCapacity) ||
    !Array.isArray(state.lots) ||
    !Array.isArray(state.shipments) || !Array.isArray(state.processingJobs) ||
    !Array.isArray(state.unlockedTechniqueIds) || !Array.isArray(state.unlockedRecipeIds) ||
    !state.preparedDishes || typeof state.preparedDishes !== "object" ||
    !Array.isArray(state.menu) || !state.shop || typeof state.shop !== "object" ||
    !state.statistics || typeof state.statistics !== "object" || !Array.isArray(state.logs) ||
    !positiveInteger(state.nextLotId) || !positiveInteger(state.nextJobId) ||
    !positiveInteger(state.nextLogId) || !nonNegativeInteger(state.createdAt) ||
    !nonNegativeInteger(state.updatedAt) || state.updatedAt < state.createdAt) {
    throw new Error("餐厅存档字段无效");
  }
  const game = state as RestaurantGameState;
  if (game.lots.length > RESTAURANT_MAX_LOTS ||
    game.processingJobs.length > RESTAURANT_MAX_PROCESSING_JOBS ||
    game.shipments.length > RESTAURANT_MAX_SHIPMENTS ||
    game.logs.length > RESTAURANT_MAX_LOGS) {
    throw new Error("餐厅存档集合超出限制");
  }
  const lotIds = new Set<number>();
  for (const lot of game.lots) {
    if (!RESTAURANT_INGREDIENT_IDS.includes(lot.ingredientId) ||
      !positiveInteger(lot.lotId) || lotIds.has(lot.lotId) ||
      !positiveInteger(lot.quantity) || !nonNegativeInteger(lot.acquiredAt) ||
      !["farm", "ranch", "homestead_goods", "restaurant_shop", "processed"]
        .includes(lot.sourceKind) ||
      (lot.sourceTownId !== null && !isEstateTownId(lot.sourceTownId))) {
      throw new Error("餐厅食材批次无效");
    }
    lotIds.add(lot.lotId);
  }
  if (restaurantWarehouseQuantity(game) > game.warehouseCapacity ||
    restaurantWarehouseQuantity(game) + restaurantReservedSupplyQuantity(game) >
      game.warehouseCapacity) {
    throw new Error("餐厅仓库容量无效");
  }
  const shipmentIds = new Set<string>();
  for (const shipment of game.shipments) {
    if (typeof shipment.id !== "string" || shipment.id.length === 0 ||
      shipmentIds.has(shipment.id) || !isEstateTownId(shipment.sourceTownId) ||
      !nonNegativeInteger(shipment.dispatchedAt) ||
      !nonNegativeInteger(shipment.arrivesAt) ||
      shipment.arrivesAt < shipment.dispatchedAt ||
      !["in_transit", "collected"].includes(shipment.status) ||
      !Array.isArray(shipment.manifest) || shipment.manifest.length < 1 ||
      shipment.manifest.length > 8 || shipment.manifest.some((item) =>
        !RESTAURANT_INGREDIENT_IDS.includes(item.ingredientId) ||
        !positiveInteger(item.quantity) ||
        !["farm", "ranch", "homestead_goods"].includes(item.sourceKind ?? "farm")
      )) {
      throw new Error("餐厅供货单无效");
    }
    shipmentIds.add(shipment.id);
  }
  const jobIds = new Set<number>();
  for (const job of game.processingJobs) {
    if (!positiveInteger(job.id) || jobIds.has(job.id) ||
      !RESTAURANT_PROCESSING_IDS.includes(job.processingId) ||
      !positiveInteger(job.quantity) ||
      (job.sourceTownId !== null && !isEstateTownId(job.sourceTownId)) ||
      !nonNegativeInteger(job.startedAt) || !nonNegativeInteger(job.completesAt) ||
      job.completesAt < job.startedAt || typeof job.collected !== "boolean") {
      throw new Error("餐厅加工任务无效");
    }
    jobIds.add(job.id);
  }
  if (game.unlockedTechniqueIds.some((id) => !RESTAURANT_TECHNIQUE_IDS.includes(id)) ||
    new Set(game.unlockedTechniqueIds).size !== game.unlockedTechniqueIds.length ||
    game.unlockedRecipeIds.some((id) => !RESTAURANT_RECIPE_IDS.includes(id)) ||
    new Set(game.unlockedRecipeIds).size !== game.unlockedRecipeIds.length ||
    game.menu.some((id) => !RESTAURANT_RECIPE_IDS.includes(id)) ||
    new Set(game.menu).size !== game.menu.length) {
    throw new Error("餐厅解锁目录无效");
  }
  for (const [recipeId, quantity] of Object.entries(game.preparedDishes)) {
    if (!RESTAURANT_RECIPE_IDS.includes(recipeId as RestaurantRecipeId) ||
      !nonNegativeInteger(quantity)) {
      throw new Error("餐厅备菜库存无效");
    }
  }
  if (typeof game.shop.dayKey !== "string" || !Array.isArray(game.shop.offers) ||
    !game.shop.purchaseLedger || typeof game.shop.purchaseLedger !== "object") {
    throw new Error("餐厅商店状态无效");
  }
  const offerIds = new Set<RestaurantShopItemId>();
  for (const offer of game.shop.offers) {
    if (!RESTAURANT_SHOP_ITEM_IDS.includes(offer.itemId) || offerIds.has(offer.itemId) ||
      !nonNegativeInteger(offer.remaining) ||
      offer.remaining > RESTAURANT_SHOP_ITEMS[offer.itemId].dailyStock) {
      throw new Error("餐厅商店货单无效");
    }
    offerIds.add(offer.itemId);
  }
  for (const [itemId, quantity] of Object.entries(game.shop.purchaseLedger)) {
    if (!RESTAURANT_SHOP_ITEM_IDS.includes(itemId as RestaurantShopItemId) ||
      !nonNegativeInteger(quantity) ||
      quantity > RESTAURANT_SHOP_ITEMS[itemId as RestaurantShopItemId].dailyPurchaseLimit) {
      throw new Error("餐厅商店限购记录无效");
    }
  }
  if (game.service) {
    const service = game.service;
    const orderIds = new Set<string>();
    if (typeof service.id !== "string" || service.id.length === 0 ||
      !isEstateTownId(service.townId) || !nonNegativeInteger(service.openedAt) ||
      !["serving", "settled"].includes(service.status) ||
      !Array.isArray(service.orders) || service.orders.length < 1 || service.orders.length > 8) {
      throw new Error("餐厅营业状态无效");
    }
    for (const order of service.orders) {
      if (typeof order.id !== "string" || order.id.length === 0 || orderIds.has(order.id) ||
        !RESTAURANT_RECIPE_IDS.includes(order.recipeId) ||
        !["pending", "served", "expired"].includes(order.status) ||
        !nonNegativeInteger(order.coinReward) ||
        !nonNegativeInteger(order.experienceReward) ||
        !nonNegativeInteger(order.localReputationReward)) {
        throw new Error("餐厅顾客订单无效");
      }
      orderIds.add(order.id);
    }
  }
  for (const value of Object.values(game.statistics)) {
    if (!nonNegativeInteger(value)) throw new Error("餐厅统计数据无效");
  }
  const logIds = new Set<number>();
  for (const log of game.logs) {
    if (!positiveInteger(log.id) || logIds.has(log.id) ||
      !nonNegativeInteger(log.at) || typeof log.text !== "string" ||
      !["system", "supply", "processing", "shop", "service"].includes(log.kind)) {
      throw new Error("餐厅日志无效");
    }
    logIds.add(log.id);
  }
}

export function restaurantLocalReputationRecord(
  entries: Partial<Record<EstateTownId, number>>,
): Record<EstateTownId, number> {
  return Object.fromEntries(
    ESTATE_TOWN_IDS.map((townId) => [townId, Math.max(0, entries[townId] ?? 0)]),
  ) as Record<EstateTownId, number>;
}
