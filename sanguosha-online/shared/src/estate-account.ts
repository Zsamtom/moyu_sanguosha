import {
  ESTATE_TOWN_IDS,
  TOWN_DEFINITIONS,
  getTownRoute,
  type EstateTownId,
} from "./towns/registry.js";

export const ESTATE_ACCOUNT_STATE_VERSION = 2 as const;
export const ESTATE_MAX_TRAVEL_LOGS = 24;
export const ESTATE_DAILY_LOGISTICS_CAPACITY = 6;
export const ESTATE_MAX_SHIPMENTS = 32;

export const ESTATE_CARGO_IDS = [
  "greenvale_warmhouse_supplies",
  "greenvale_grain_relief",
  "greenvale_machine_components",
  "frostpeak_coldchain_supplies",
  "frostpeak_alpine_medicine",
  "frostpeak_thermal_materials",
] as const;
export type EstateCargoId = (typeof ESTATE_CARGO_IDS)[number];

export interface EstateCargoResource {
  readonly source: "farm" | "ranch" | "mine" | "goods";
  readonly itemId: string;
  readonly quantity: number;
}

export interface EstateCargoDefinition {
  readonly id: EstateCargoId;
  readonly name: string;
  readonly description: string;
  readonly fromTownId: EstateTownId;
  readonly toTownId: EstateTownId;
  readonly coinCost: number;
  readonly logisticsCost: 1;
  readonly durationSeconds: number;
  readonly manifest: readonly EstateCargoResource[];
  readonly destinationProjectId: string;
  readonly requiredResearchId: string | null;
  readonly requiredReputation: number;
  readonly requiredInfrastructureId?: string;
  readonly requiredInfrastructureLevel?: number;
}

export const ESTATE_CARGO_DEFINITIONS: Readonly<
  Record<EstateCargoId, EstateCargoDefinition>
> = {
  greenvale_warmhouse_supplies: {
    id: "greenvale_warmhouse_supplies",
    name: "河谷温室支援箱",
    description: "把青禾棉花、乳品和温室构件运往霜岭，用于雪线温室联建。",
    fromTownId: "greenvale",
    toTownId: "frostpeak",
    coinCost: 60,
    logisticsCost: 1,
    durationSeconds: 30 * 60,
    manifest: [
      { source: "farm", itemId: "cotton", quantity: 2 },
      { source: "ranch", itemId: "milk", quantity: 2 },
      { source: "goods", itemId: "greenhouse_parts", quantity: 1 },
    ],
    destinationProjectId: "frostpeak_valley_greenhouse_link",
    requiredResearchId: null,
    requiredReputation: 0,
  },
  greenvale_grain_relief: {
    id: "greenvale_grain_relief",
    name: "河谷民生补给列车",
    description: "将谷物、面粉和工作服运往霜岭，支持雪季公共食堂和抢修班组。",
    fromTownId: "greenvale",
    toTownId: "frostpeak",
    coinCost: 90,
    logisticsCost: 1,
    durationSeconds: 50 * 60,
    manifest: [
      { source: "farm", itemId: "wheat", quantity: 4 },
      { source: "goods", itemId: "flour", quantity: 2 },
      { source: "goods", itemId: "work_clothes", quantity: 1 },
    ],
    destinationProjectId: "frostpeak_valley_relief_kitchen",
    requiredResearchId: "cooperative_logistics",
    requiredReputation: 55,
    requiredInfrastructureId: "supply_hub",
    requiredInfrastructureLevel: 2,
  },
  greenvale_machine_components: {
    id: "greenvale_machine_components",
    name: "河谷机修构件专列",
    description: "把铁锭、铜矿和温室构件运往霜岭，用于热力站与低温设备维护。",
    fromTownId: "greenvale",
    toTownId: "frostpeak",
    coinCost: 130,
    logisticsCost: 1,
    durationSeconds: 65 * 60,
    manifest: [
      { source: "goods", itemId: "iron_ingot", quantity: 2 },
      { source: "mine", itemId: "copper", quantity: 2 },
      { source: "goods", itemId: "greenhouse_parts", quantity: 1 },
    ],
    destinationProjectId: "frostpeak_thermal_maintenance_link",
    requiredResearchId: "cooperative_logistics",
    requiredReputation: 70,
    requiredInfrastructureId: "operations_center",
    requiredInfrastructureLevel: 2,
  },
  frostpeak_coldchain_supplies: {
    id: "frostpeak_coldchain_supplies",
    name: "高寒冷链特产箱",
    description: "把霜岭云莓、牦牛奶和霜银运往青禾，用于河谷冷链展销。",
    fromTownId: "frostpeak",
    toTownId: "greenvale",
    coinCost: 80,
    logisticsCost: 1,
    durationSeconds: 45 * 60,
    manifest: [
      { source: "farm", itemId: "cloudberry", quantity: 2 },
      { source: "ranch", itemId: "yak_milk", quantity: 2 },
      { source: "mine", itemId: "frost_silver", quantity: 1 },
    ],
    destinationProjectId: "greenvale_frostpeak_coldchain_link",
    requiredResearchId: null,
    requiredReputation: 0,
  },
  frostpeak_alpine_medicine: {
    id: "frostpeak_alpine_medicine",
    name: "高原药膳冷链箱",
    description: "将高山药草、云莓蜜饯和霜银器具运往青禾，举办高原健康展。",
    fromTownId: "frostpeak",
    toTownId: "greenvale",
    coinCost: 110,
    logisticsCost: 1,
    durationSeconds: 60 * 60,
    manifest: [
      { source: "farm", itemId: "alpine_herb", quantity: 3 },
      { source: "goods", itemId: "cloudberry_preserves", quantity: 1 },
      { source: "mine", itemId: "frost_silver", quantity: 1 },
    ],
    destinationProjectId: "greenvale_alpine_health_fair",
    requiredResearchId: "avalanche_logistics",
    requiredReputation: 60,
    requiredInfrastructureId: "geothermal_greenhouse",
    requiredInfrastructureLevel: 2,
  },
  frostpeak_thermal_materials: {
    id: "frostpeak_thermal_materials",
    name: "寒区管网材料箱",
    description: "将耐寒合金、磁铁矿和御寒呢毡运往青禾，改造供水与冷库管线。",
    fromTownId: "frostpeak",
    toTownId: "greenvale",
    coinCost: 140,
    logisticsCost: 1,
    durationSeconds: 75 * 60,
    manifest: [
      { source: "goods", itemId: "frost_alloy", quantity: 2 },
      { source: "mine", itemId: "magnetite", quantity: 2 },
      { source: "goods", itemId: "frost_felt", quantity: 1 },
    ],
    destinationProjectId: "greenvale_frostproof_waterworks",
    requiredResearchId: "avalanche_logistics",
    requiredReputation: 75,
    requiredInfrastructureId: "avalanche_command",
    requiredInfrastructureLevel: 2,
  },
};

export const ESTATE_MERCHANT_ITEM_IDS = [
  "priority_dispatch",
  "rail_pass",
  "merchant_banner",
  "valley_flour_pack",
  "valley_feed_pack",
  "valley_fortified_feed",
  "valley_soil_kit",
  "valley_workwear",
  "valley_iron_pack",
  "valley_mining_kit",
  "valley_greenhouse_kit",
  "valley_fuel_pack",
  "frost_flour_pack",
  "alpine_feed_pack",
  "thermal_compost_pack",
  "frost_felt_pack",
  "frost_alloy_pack",
  "insulated_kit_pack",
  "winter_provisions_pack",
  "preserves_pack",
  "frost_fuel_pack",
] as const;

export type EstateMerchantItemId =
  (typeof ESTATE_MERCHANT_ITEM_IDS)[number];

const ESTATE_RESILIENCE_MERCHANT_ITEM_IDS = new Set<EstateMerchantItemId>([
  "valley_soil_kit",
  "valley_workwear",
  "valley_mining_kit",
  "valley_greenhouse_kit",
  "valley_fuel_pack",
  "thermal_compost_pack",
  "frost_felt_pack",
  "frost_alloy_pack",
  "insulated_kit_pack",
  "winter_provisions_pack",
  "frost_fuel_pack",
]);

export interface EstateMerchantItemDefinition {
  readonly id: EstateMerchantItemId;
  readonly name: string;
  readonly description: string;
  readonly coinPrice: number;
  readonly requiredLocalReputation: number;
  readonly inventoryLimit: number;
  readonly dailyPurchaseLimit: number;
  readonly townId?: EstateTownId;
  readonly category: "utility" | "information" | "resilience" | "cosmetic";
  readonly numericEffect:
    | {
        readonly kind: "facility_acceleration";
        readonly percent: 10;
        readonly maximumSeconds: number;
      }
    | {
        readonly kind: "travel_discount";
        readonly percent: 50;
      }
    | {
        readonly kind: "cosmetic";
      }
    | {
        readonly kind: "resource_bundle";
        readonly source: "farm" | "ranch" | "mine" | "goods";
        readonly itemId: string;
        readonly quantity: number;
      };
}

function merchantBundle(
  id: EstateMerchantItemId,
  name: string,
  description: string,
  townId: EstateTownId,
  coinPrice: number,
  reputationTier: number,
  source: "farm" | "ranch" | "mine" | "goods",
  itemId: string,
  quantity: number,
): EstateMerchantItemDefinition {
  return {
    id,
    name,
    description,
    townId,
    coinPrice,
    requiredLocalReputation: [0, 10, 20, 35, 50, 70][reputationTier] ?? 70,
    inventoryLimit: 3,
    dailyPurchaseLimit: 1,
    category: ESTATE_RESILIENCE_MERCHANT_ITEM_IDS.has(id)
      ? "resilience"
      : "utility",
    numericEffect: { kind: "resource_bundle", source, itemId, quantity },
  };
}

export const ESTATE_MERCHANT_ITEMS: Readonly<
  Record<EstateMerchantItemId, EstateMerchantItemDefinition>
> = {
  priority_dispatch: {
    id: "priority_dispatch",
    name: "优先调度券",
    description:
      "将一个加工任务的原始工期缩短 10%，最多节省 30 分钟；每个任务只能使用一次。",
    coinPrice: 180,
    requiredLocalReputation: 20,
    inventoryLimit: 3,
    dailyPurchaseLimit: 1,
    category: "utility",
    numericEffect: {
      kind: "facility_acceleration",
      percent: 10,
      maximumSeconds: 30 * 60,
    },
  },
  rail_pass: {
    id: "rail_pass",
    name: "商会联运票",
    description: "下一次跨镇客运基础票价减半，不减免货运费用。",
    coinPrice: 50,
    requiredLocalReputation: 10,
    inventoryLimit: 2,
    dailyPurchaseLimit: 1,
    category: "utility",
    numericEffect: { kind: "travel_discount", percent: 50 },
  },
  merchant_banner: {
    id: "merchant_banner",
    name: "商会纪念旗",
    description: "纯展示收藏品，用于长期经营后的金币回收。",
    coinPrice: 1_200,
    requiredLocalReputation: 70,
    inventoryLimit: 9,
    dailyPurchaseLimit: 1,
    category: "cosmetic",
    numericEffect: { kind: "cosmetic" },
  },
  valley_flour_pack: merchantBundle("valley_flour_pack", "河谷面粉包", "磨坊应急供应的一批面粉。", "greenvale", 90, 0, "goods", "flour", 2),
  valley_feed_pack: merchantBundle("valley_feed_pack", "河谷粗饲料包", "合作社调配的基础粗饲料。", "greenvale", 120, 0, "goods", "coarse_feed", 3),
  valley_fortified_feed: merchantBundle("valley_fortified_feed", "强化饲料箱", "适合牧群深度经营的强化饲料。", "greenvale", 240, 2, "goods", "fortified_feed", 2),
  valley_soil_kit: merchantBundle("valley_soil_kit", "土壤维护箱", "用于轮作与灾期抢种的土壤改良剂。", "greenvale", 220, 1, "goods", "soil_conditioner", 2),
  valley_workwear: merchantBundle("valley_workwear", "河谷工作服包", "加工设施和公共项目需要的工作服。", "greenvale", 310, 2, "goods", "work_clothes", 1),
  valley_iron_pack: merchantBundle("valley_iron_pack", "标准铁锭包", "用于设施升级和构件制造的标准铁锭。", "greenvale", 360, 2, "goods", "iron_ingot", 2),
  valley_mining_kit: merchantBundle("valley_mining_kit", "矿务安全箱", "包含一套矿工防护装备。", "greenvale", 480, 3, "goods", "mining_kit", 1),
  valley_greenhouse_kit: merchantBundle("valley_greenhouse_kit", "温室构件包", "跨城温室与灾害维护需要的构件。", "greenvale", 620, 4, "goods", "greenhouse_parts", 1),
  valley_fuel_pack: merchantBundle("valley_fuel_pack", "河谷燃料包", "用于应急供暖和加工的一批煤炭。", "greenvale", 150, 1, "mine", "coal", 4),
  frost_flour_pack: merchantBundle("frost_flour_pack", "霜麦粉补给", "霜岭磨坊封装的霜麦粉。", "frostpeak", 100, 0, "goods", "frost_barley_flour", 2),
  alpine_feed_pack: merchantBundle("alpine_feed_pack", "高原饲料包", "高海拔牧群使用的营养饲料。", "frostpeak", 250, 2, "goods", "alpine_feed", 2),
  thermal_compost_pack: merchantBundle("thermal_compost_pack", "温床营养箱", "高寒轮作和温室维护使用的营养基。", "frostpeak", 230, 1, "goods", "thermal_compost", 2),
  frost_felt_pack: merchantBundle("frost_felt_pack", "御寒呢毡包", "棚舍加固与雪线项目使用的呢毡。", "frostpeak", 330, 2, "goods", "frost_felt", 1),
  frost_alloy_pack: merchantBundle("frost_alloy_pack", "耐寒合金包", "寒区设施升级使用的耐寒合金锭。", "frostpeak", 390, 2, "goods", "frost_alloy", 2),
  insulated_kit_pack: merchantBundle("insulated_kit_pack", "保温矿务箱", "包含一套保温矿务装备。", "frostpeak", 510, 3, "goods", "insulated_mining_kit", 1),
  winter_provisions_pack: merchantBundle("winter_provisions_pack", "雪线口粮包", "远行、抢修与公共项目使用的口粮。", "frostpeak", 290, 2, "goods", "winter_provisions", 2),
  preserves_pack: merchantBundle("preserves_pack", "云莓蜜饯箱", "霜岭限定的云莓药草蜜饯。", "frostpeak", 350, 3, "goods", "cloudberry_preserves", 2),
  frost_fuel_pack: merchantBundle("frost_fuel_pack", "高寒燃料包", "热力站和应急供暖使用的褐煤。", "frostpeak", 170, 1, "mine", "lignite", 4),
};

export type EstateMerchantInventory =
  Record<EstateMerchantItemId, number>;

export interface EstateTownProgress {
  unlocked: boolean;
  unlockedAt: number | null;
  localReputation: number;
  farmLevel: number;
  ranchLevel: number;
  mineLevel: number;
  landmarkStage: number;
  lastVisitedAt: number | null;
}

export interface EstateTravelLogEntry {
  readonly id: string;
  readonly at: number;
  readonly fromTownId: EstateTownId;
  readonly toTownId: EstateTownId;
  readonly routeId: string;
  readonly baseFare: number;
  readonly paidFare: number;
  readonly usedRailPass: boolean;
}

export interface EstatePurchaseLedger {
  dayKey: string;
  counts: EstateMerchantInventory;
}

export interface EstateDailyMerchantOffer {
  dayKey: string;
  itemIds: EstateMerchantItemId[];
}

export type EstateMerchantOffers = Record<
  EstateTownId,
  EstateDailyMerchantOffer
>;

export interface EstateTownResearchState {
  points: number;
  unlockedIds: string[];
}

export type EstateTownResearch = Record<
  EstateTownId,
  EstateTownResearchState
>;

export interface EstateLogisticsState {
  dayKey: string;
  used: number;
  capacity: number;
}

export interface EstateShipment {
  readonly id: string;
  readonly cargoId: EstateCargoId;
  readonly fromTownId: EstateTownId;
  readonly toTownId: EstateTownId;
  readonly dispatchedAt: number;
  readonly arrivesAt: number;
  collectedAt: number | null;
}

export interface EstateAccountState {
  readonly kind: "estate_account";
  readonly version: typeof ESTATE_ACCOUNT_STATE_VERSION;
  readonly ownerId: string;
  ownerName: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  coins: number;
  researchPoints: number;
  activeTownId: EstateTownId;
  townResearch: EstateTownResearch;
  /** @deprecated Active-town compatibility mirror. */
  unlockedResearchIds: string[];
  townProgress: Partial<Record<EstateTownId, EstateTownProgress>>;
  merchantInventory: EstateMerchantInventory;
  purchaseLedger: EstatePurchaseLedger;
  merchantOffers: EstateMerchantOffers;
  logistics: EstateLogisticsState;
  shipments: EstateShipment[];
  travelLogs: EstateTravelLogEntry[];
  shopRecommendationId: EstateMerchantItemId | null;
  shopRecommendationSource: "rules" | "llm";
}

export interface EstateProgressSnapshot {
  readonly townId: EstateTownId;
  readonly localReputation: number;
  readonly farmLevel: number;
  readonly ranchLevel: number;
  readonly mineLevel: number;
  readonly landmarkStage: number;
}

export interface EstateTownUnlockStatus {
  readonly townId: EstateTownId;
  readonly unlocked: boolean;
  readonly canUnlock: boolean;
  readonly missing: readonly string[];
  readonly coinCost: number;
}

function emptyMerchantInventory(initial = 0): EstateMerchantInventory {
  return Object.fromEntries(
    ESTATE_MERCHANT_ITEM_IDS.map((id) => [id, initial]),
  ) as EstateMerchantInventory;
}

function accountDayKey(now: number): string {
  return new Date(now + 8 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

function accountWeekKey(now: number): string {
  const date = new Date(now + 8 * 60 * 60 * 1_000);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(
    ((date.getTime() - yearStart) / 86_400_000 + 1) / 7,
  );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function hashText(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function dailyMerchantOffer(
  ownerId: string,
  townId: EstateTownId,
  dayKey: string,
): EstateDailyMerchantOffer {
  const common = ESTATE_MERCHANT_ITEM_IDS.filter(
    (id) => ESTATE_MERCHANT_ITEMS[id].townId === undefined,
  );
  const local = ESTATE_MERCHANT_ITEM_IDS.filter(
    (id) => ESTATE_MERCHANT_ITEMS[id].townId === townId,
  );
  const seed = hashText(`${ownerId}:${townId}:${dayKey}:merchant`);
  const firstLocal = seed % local.length;
  const secondLocal = (firstLocal + 1 + seed % (local.length - 1)) % local.length;
  return {
    dayKey,
    itemIds: [
      common[seed % common.length]!,
      local[firstLocal]!,
      local[secondLocal]!,
    ],
  };
}

export function estateMerchantOfferIds(
  state: EstateAccountState,
  townId: EstateTownId = state.activeTownId,
): readonly EstateMerchantItemId[] {
  return state.merchantOffers[townId].itemIds;
}

export function createEstateAccount(input: {
  readonly ownerId: string;
  readonly ownerName: string;
  readonly now: number;
  readonly coins?: number;
  readonly researchPoints?: number;
  readonly unlockedResearchIds?: readonly string[];
}): EstateAccountState {
  const dayKey = accountDayKey(input.now);
  const progress: EstateTownProgress = {
    unlocked: true,
    unlockedAt: input.now,
    localReputation: 0,
    farmLevel: 1,
    ranchLevel: 1,
    mineLevel: 1,
    landmarkStage: 0,
    lastVisitedAt: input.now,
  };
  return {
    kind: "estate_account",
    version: ESTATE_ACCOUNT_STATE_VERSION,
    ownerId: input.ownerId,
    ownerName: input.ownerName.trim(),
    revision: 0,
    createdAt: input.now,
    updatedAt: input.now,
    coins: Math.max(0, Math.floor(input.coins ?? 20)),
    researchPoints: Math.max(0, Math.floor(input.researchPoints ?? 0)),
    activeTownId: "greenvale",
    townResearch: {
      greenvale: {
        points: Math.max(0, Math.floor(input.researchPoints ?? 0)),
        unlockedIds: [...new Set(input.unlockedResearchIds ?? [])],
      },
      frostpeak: { points: 0, unlockedIds: [] },
    },
    unlockedResearchIds: [
      ...new Set(input.unlockedResearchIds ?? []),
    ],
    townProgress: { greenvale: progress },
    merchantInventory: emptyMerchantInventory(),
    purchaseLedger: {
      dayKey,
      counts: emptyMerchantInventory(),
    },
    merchantOffers: {
      greenvale: dailyMerchantOffer(input.ownerId, "greenvale", dayKey),
      frostpeak: dailyMerchantOffer(input.ownerId, "frostpeak", dayKey),
    },
    logistics: {
      dayKey: accountDayKey(input.now),
      used: 0,
      capacity: ESTATE_DAILY_LOGISTICS_CAPACITY,
    },
    shipments: [],
    travelLogs: [],
    shopRecommendationId: null,
    shopRecommendationSource: "rules",
  };
}

export function refreshEstateAccount(
  state: EstateAccountState,
  now: number,
): EstateAccountState {
  const account = structuredClone(state);
  const dayKey = accountDayKey(now);
  let changed = false;
  const raw = account as EstateAccountState & Record<string, unknown>;
  if (!raw.townResearch || typeof raw.townResearch !== "object") {
    account.townResearch = {
      greenvale: {
        points: Math.max(0, Math.floor(account.researchPoints ?? 0)),
        unlockedIds: [...new Set(account.unlockedResearchIds ?? [])],
      },
      frostpeak: { points: 0, unlockedIds: [] },
    };
    changed = true;
  }
  for (const townId of ESTATE_TOWN_IDS) {
    if (!account.townResearch[townId]) {
      account.townResearch[townId] = { points: 0, unlockedIds: [] };
      changed = true;
    }
  }
  for (const itemId of ESTATE_MERCHANT_ITEM_IDS) {
    if (!Number.isSafeInteger(account.merchantInventory?.[itemId])) {
      account.merchantInventory[itemId] = 0;
      changed = true;
    }
  }
  if (account.logistics.dayKey !== dayKey) {
    account.logistics = {
      dayKey,
      used: 0,
      capacity: ESTATE_DAILY_LOGISTICS_CAPACITY,
    };
    changed = true;
  }
  if (
    !account.purchaseLedger ||
    account.purchaseLedger.dayKey !== dayKey
  ) {
    account.purchaseLedger = {
      dayKey,
      counts: emptyMerchantInventory(),
    };
    changed = true;
  } else {
    for (const itemId of ESTATE_MERCHANT_ITEM_IDS) {
      if (!Number.isSafeInteger(account.purchaseLedger.counts[itemId])) {
        account.purchaseLedger.counts[itemId] = 0;
        changed = true;
      }
    }
  }
  if (!raw.merchantOffers || typeof raw.merchantOffers !== "object") {
    account.merchantOffers = {
      greenvale: dailyMerchantOffer(account.ownerId, "greenvale", dayKey),
      frostpeak: dailyMerchantOffer(account.ownerId, "frostpeak", dayKey),
    };
    changed = true;
  }
  for (const townId of ESTATE_TOWN_IDS) {
    if (account.merchantOffers[townId]?.dayKey !== dayKey) {
      account.merchantOffers[townId] = dailyMerchantOffer(
        account.ownerId,
        townId,
        dayKey,
      );
      changed = true;
    }
  }
  const localResearch = account.townResearch[account.activeTownId];
  if (
    account.researchPoints !== localResearch.points ||
    JSON.stringify(account.unlockedResearchIds) !==
      JSON.stringify(localResearch.unlockedIds)
  ) {
    account.researchPoints = localResearch.points;
    account.unlockedResearchIds = [...localResearch.unlockedIds];
    changed = true;
  }
  if (changed) {
    account.revision += 1;
    account.updatedAt = Math.max(account.updatedAt, now);
  }
  return account;
}

export function updateEstateTownProgress(
  state: EstateAccountState,
  progress: EstateProgressSnapshot,
  now: number,
): EstateAccountState {
  const account = structuredClone(state);
  const current = account.townProgress[progress.townId];
  account.townProgress[progress.townId] = {
    unlocked: current?.unlocked ?? progress.townId === "greenvale",
    unlockedAt: current?.unlockedAt ?? (
      progress.townId === "greenvale" ? account.createdAt : null
    ),
    localReputation: Math.max(0, Math.floor(progress.localReputation)),
    farmLevel: Math.max(1, Math.floor(progress.farmLevel)),
    ranchLevel: Math.max(1, Math.floor(progress.ranchLevel)),
    mineLevel: Math.max(1, Math.floor(progress.mineLevel)),
    landmarkStage: Math.max(0, Math.floor(progress.landmarkStage)),
    lastVisitedAt: current?.lastVisitedAt ?? null,
  };
  account.updatedAt = Math.max(account.updatedAt, now);
  return account;
}

export function getEstateTownUnlockStatus(
  state: EstateAccountState,
  townId: EstateTownId,
): EstateTownUnlockStatus {
  const definition = TOWN_DEFINITIONS[townId];
  const requirements = definition.unlockRequirements;
  const progress = requirements.sourceTownId
    ? state.townProgress[requirements.sourceTownId]
    : undefined;
  const unlocked = Boolean(state.townProgress[townId]?.unlocked);
  if (unlocked) {
    return {
      townId,
      unlocked: true,
      canUnlock: false,
      missing: [],
      coinCost: requirements.coinCost,
    };
  }
  const missing: string[] = [];
  if (progress) {
    if (progress.farmLevel < requirements.minimumFarmLevel) {
      missing.push(`农场达到 ${requirements.minimumFarmLevel} 级`);
    }
    if (progress.ranchLevel < requirements.minimumRanchLevel) {
      missing.push(`牧场达到 ${requirements.minimumRanchLevel} 级`);
    }
    if (progress.mineLevel < requirements.minimumMineLevel) {
      missing.push(`矿山达到 ${requirements.minimumMineLevel} 级`);
    }
    if (progress.localReputation < requirements.minimumReputation) {
      missing.push(`当地声望达到 ${requirements.minimumReputation}`);
    }
  } else if (requirements.sourceTownId) {
    missing.push(`先开发${TOWN_DEFINITIONS[requirements.sourceTownId].name}`);
  }
  for (const researchId of requirements.requiredResearchIds) {
    const sourceResearch = requirements.sourceTownId
      ? state.townResearch[requirements.sourceTownId]
      : state.townResearch[townId];
    if (!sourceResearch.unlockedIds.includes(researchId)) {
      missing.push(`完成研究 ${researchId}`);
    }
  }
  if (state.coins < requirements.coinCost) {
    missing.push(`准备 ${requirements.coinCost} 金币开发资金`);
  }
  return {
    townId,
    unlocked: false,
    canUnlock: missing.length === 0,
    missing,
    coinCost: requirements.coinCost,
  };
}

export function unlockEstateTown(
  state: EstateAccountState,
  townId: EstateTownId,
  now: number,
): EstateAccountState {
  const account = refreshEstateAccount(state, now);
  const status = getEstateTownUnlockStatus(account, townId);
  if (status.unlocked) throw new Error("城镇已经解锁");
  if (!status.canUnlock) throw new Error(status.missing.join("；"));
  account.coins -= status.coinCost;
  account.townProgress[townId] = {
    unlocked: true,
    unlockedAt: now,
    localReputation: 0,
    farmLevel: 1,
    ranchLevel: 1,
    mineLevel: 1,
    landmarkStage: 0,
    lastVisitedAt: null,
  };
  account.revision += 1;
  account.updatedAt = Math.max(account.updatedAt, now);
  return account;
}

export function travelEstateTown(
  state: EstateAccountState,
  toTownId: EstateTownId,
  now: number,
): EstateAccountState {
  const account = refreshEstateAccount(state, now);
  if (account.activeTownId === toTownId) {
    throw new Error("已经位于该城镇");
  }
  if (!account.townProgress[toTownId]?.unlocked) {
    throw new Error("目标城镇尚未解锁");
  }
  const route = getTownRoute(account.activeTownId, toTownId);
  if (!route) throw new Error("两座城镇之间尚未开通交通");
  const hasRailPass = account.merchantInventory.rail_pass > 0;
  const paidFare = hasRailPass
    ? Math.ceil(route.coinFare * 0.5)
    : route.coinFare;
  if (account.coins < paidFare) throw new Error("交通费用所需金币不足");
  const fromTownId = account.activeTownId;
  account.coins -= paidFare;
  if (hasRailPass) account.merchantInventory.rail_pass -= 1;
  account.activeTownId = toTownId;
  account.researchPoints = account.townResearch[toTownId].points;
  account.unlockedResearchIds = [
    ...account.townResearch[toTownId].unlockedIds,
  ];
  const target = account.townProgress[toTownId]!;
  target.lastVisitedAt = now;
  account.travelLogs.unshift({
    id: `${now}:${account.revision + 1}:${fromTownId}:${toTownId}`,
    at: now,
    fromTownId,
    toTownId,
    routeId: route.id,
    baseFare: route.coinFare,
    paidFare,
    usedRailPass: hasRailPass,
  });
  account.travelLogs = account.travelLogs.slice(0, ESTATE_MAX_TRAVEL_LOGS);
  account.revision += 1;
  account.updatedAt = Math.max(account.updatedAt, now);
  return account;
}

export function buyEstateMerchantItem(
  state: EstateAccountState,
  itemId: EstateMerchantItemId,
  now: number,
): EstateAccountState {
  const account = refreshEstateAccount(state, now);
  const item = ESTATE_MERCHANT_ITEMS[itemId];
  if (!item) throw new Error("未知商会商品");
  if (!estateMerchantOfferIds(account).includes(itemId)) {
    throw new Error("该商品不在今日三项供应中，请等待每日刷新");
  }
  const reputationTownId = item.townId ?? account.activeTownId;
  const localReputation =
    account.townProgress[reputationTownId]?.localReputation ?? -1;
  if (localReputation < item.requiredLocalReputation) {
    throw new Error(
      `${TOWN_DEFINITIONS[reputationTownId].name}当地声望达到 ${item.requiredLocalReputation} 后开放`,
    );
  }
  if (account.coins < item.coinPrice) throw new Error("购买商品所需金币不足");
  if (account.merchantInventory[itemId] >= item.inventoryLimit) {
    throw new Error("该道具库存已达上限");
  }
  if (
    account.purchaseLedger.counts[itemId] >= item.dailyPurchaseLimit
  ) {
    throw new Error("该商品今日限购次数已用完");
  }
  account.coins -= item.coinPrice;
  account.merchantInventory[itemId] += 1;
  account.purchaseLedger.counts[itemId] += 1;
  account.revision += 1;
  account.updatedAt = Math.max(account.updatedAt, now);
  return account;
}

export function consumeEstateMerchantItem(
  state: EstateAccountState,
  itemId: EstateMerchantItemId,
  now: number,
): EstateAccountState {
  const account = refreshEstateAccount(state, now);
  if (account.merchantInventory[itemId] < 1) {
    throw new Error("未持有该商会道具");
  }
  account.merchantInventory[itemId] -= 1;
  account.revision += 1;
  account.updatedAt = Math.max(account.updatedAt, now);
  return account;
}

export function spendEstateLogistics(
  state: EstateAccountState,
  points: number,
  now: number,
): EstateAccountState {
  const account = refreshEstateAccount(state, now);
  if (!Number.isSafeInteger(points) || points < 1) {
    throw new Error("物流消耗无效");
  }
  if (account.logistics.used + points > account.logistics.capacity) {
    throw new Error("今日物流容量不足，请在订单与增值项目之间作出取舍");
  }
  account.logistics.used += points;
  account.revision += 1;
  account.updatedAt = Math.max(account.updatedAt, now);
  return account;
}

export function dispatchEstateShipment(
  state: EstateAccountState,
  cargoId: EstateCargoId,
  now: number,
): EstateAccountState {
  const account = refreshEstateAccount(state, now);
  const cargo = ESTATE_CARGO_DEFINITIONS[cargoId];
  if (!cargo) throw new Error("未知货运路线");
  if (account.activeTownId !== cargo.fromTownId) {
    throw new Error("只能从货物产地发车");
  }
  if (!account.townProgress[cargo.toTownId]?.unlocked) {
    throw new Error("请先开发目标城镇");
  }
  if (
    cargo.requiredResearchId &&
    !account.townResearch[cargo.fromTownId].unlockedIds.includes(
      cargo.requiredResearchId,
    )
  ) {
    throw new Error("尚未完成该高级货运所需的本地物流研究");
  }
  if (
    (account.townProgress[cargo.fromTownId]?.localReputation ?? 0) <
      cargo.requiredReputation
  ) {
    throw new Error(`当地声望达到 ${cargo.requiredReputation} 后开放该货运`);
  }
  if (account.coins < cargo.coinCost) throw new Error("货运费用所需金币不足");
  if (
    account.logistics.used + cargo.logisticsCost > account.logistics.capacity
  ) {
    throw new Error("今日物流容量不足");
  }
  const pendingSameRoute = account.shipments.filter(
    (shipment) => shipment.cargoId === cargoId && shipment.collectedAt === null,
  ).length;
  if (pendingSameRoute >= 2) {
    throw new Error("同一路线最多同时保留两箱未领取货物");
  }
  account.coins -= cargo.coinCost;
  account.logistics.used += cargo.logisticsCost;
  account.shipments.unshift({
    id: `${now}:${account.revision + 1}:${cargoId}`,
    cargoId,
    fromTownId: cargo.fromTownId,
    toTownId: cargo.toTownId,
    dispatchedAt: now,
    arrivesAt: now + cargo.durationSeconds * 1_000,
    collectedAt: null,
  });
  account.shipments = account.shipments.slice(0, ESTATE_MAX_SHIPMENTS);
  account.revision += 1;
  account.updatedAt = Math.max(account.updatedAt, now);
  return account;
}

export function collectEstateShipment(
  state: EstateAccountState,
  shipmentId: string,
  now: number,
): EstateAccountState {
  const account = refreshEstateAccount(state, now);
  const shipment = account.shipments.find(({ id }) => id === shipmentId);
  if (!shipment) throw new Error("货运记录不存在");
  if (shipment.collectedAt !== null) throw new Error("该批货物已经领取");
  if (account.activeTownId !== shipment.toTownId) {
    throw new Error("请先前往目标城镇领取货物");
  }
  if (now < shipment.arrivesAt) throw new Error("货物仍在运输途中");
  shipment.collectedAt = now;
  account.revision += 1;
  account.updatedAt = Math.max(account.updatedAt, now);
  return account;
}

/**
 * Removes the retired global merchant-renown balance before strict validation.
 * Local reputation already lives under townProgress and is deliberately not
 * increased from the former global value.
 */
export function migrateEstateAccountState(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const raw = structuredClone(value) as Record<string, unknown>;
  if (raw.kind !== "estate_account") return value;
  if (raw.version === 1) {
    delete raw.merchantRenown;
    raw.version = ESTATE_ACCOUNT_STATE_VERSION;
  }
  return raw;
}

export function assertRestorableEstateAccount(
  value: unknown,
): asserts value is EstateAccountState {
  if (!value || typeof value !== "object") {
    throw new Error("庄园账户存档无效");
  }
  const state = value as Partial<EstateAccountState>;
  if (
    state.kind !== "estate_account" ||
    state.version !== ESTATE_ACCOUNT_STATE_VERSION ||
    typeof state.ownerId !== "string" ||
    typeof state.ownerName !== "string" ||
    typeof state.createdAt !== "number" ||
    !Number.isFinite(state.createdAt) ||
    typeof state.updatedAt !== "number" ||
    !Number.isFinite(state.updatedAt) ||
    !Number.isSafeInteger(state.revision) ||
    Number(state.revision) < 0 ||
    !Number.isSafeInteger(state.coins) ||
    Number(state.coins) < 0 ||
    !Number.isSafeInteger(state.researchPoints) ||
    Number(state.researchPoints) < 0 ||
    !ESTATE_TOWN_IDS.includes(state.activeTownId as EstateTownId) ||
    !Array.isArray(state.unlockedResearchIds) ||
    !state.townProgress ||
    typeof state.townProgress !== "object" ||
    !state.merchantInventory ||
    typeof state.merchantInventory !== "object" ||
    !state.purchaseLedger ||
    !state.logistics ||
    (state.shipments !== undefined && !Array.isArray(state.shipments)) ||
    !Array.isArray(state.travelLogs) ||
    (
      state.shopRecommendationId !== null &&
      !ESTATE_MERCHANT_ITEM_IDS.includes(
        state.shopRecommendationId as EstateMerchantItemId,
      )
    ) ||
    !["rules", "llm"].includes(String(state.shopRecommendationSource))
  ) {
    throw new Error("庄园账户存档无效");
  }
  if (state.shipments === undefined) state.shipments = [];
  for (const itemId of ESTATE_MERCHANT_ITEM_IDS) {
    const quantity = state.merchantInventory[itemId];
    const purchased = state.purchaseLedger.counts?.[itemId];
    if (
      (quantity !== undefined && (
        !Number.isSafeInteger(quantity) ||
        Number(quantity) < 0 ||
        Number(quantity) > ESTATE_MERCHANT_ITEMS[itemId].inventoryLimit
      )) ||
      (purchased !== undefined && (
        !Number.isSafeInteger(purchased) ||
        Number(purchased) < 0 ||
        Number(purchased) >
          ESTATE_MERCHANT_ITEMS[itemId].dailyPurchaseLimit
      ))
    ) {
      throw new Error("庄园商会道具存档无效");
    }
  }
  if (
    (
      typeof state.purchaseLedger.dayKey !== "string" &&
      typeof (state.purchaseLedger as unknown as { weekKey?: unknown })
        .weekKey !== "string"
    ) ||
    typeof state.logistics.dayKey !== "string" ||
    !Number.isSafeInteger(state.logistics.used) ||
    !Number.isSafeInteger(state.logistics.capacity) ||
    state.logistics.used < 0 ||
    state.logistics.capacity < 1 ||
    state.logistics.used > state.logistics.capacity
  ) {
    throw new Error("庄园物流存档无效");
  }
  if (state.townResearch !== undefined) {
    for (const townId of ESTATE_TOWN_IDS) {
      const research = state.townResearch[townId];
      if (
        !research ||
        !Number.isSafeInteger(research.points) ||
        research.points < 0 ||
        !Array.isArray(research.unlockedIds) ||
        research.unlockedIds.some((id) => typeof id !== "string")
      ) {
        throw new Error("城镇研究存档无效");
      }
    }
  }
  if (state.merchantOffers !== undefined) {
    for (const townId of ESTATE_TOWN_IDS) {
      const offer = state.merchantOffers[townId];
      if (
        !offer ||
        typeof offer.dayKey !== "string" ||
        !Array.isArray(offer.itemIds) ||
        offer.itemIds.length !== 3 ||
        new Set(offer.itemIds).size !== 3 ||
        offer.itemIds.some((id) => !ESTATE_MERCHANT_ITEM_IDS.includes(id))
      ) {
        throw new Error("庄园每日商店存档无效");
      }
    }
  }
  for (const townId of ESTATE_TOWN_IDS) {
    const progress = state.townProgress[townId];
    if (!progress) continue;
    if (
      typeof progress.unlocked !== "boolean" ||
      (
        progress.unlockedAt !== null &&
        !Number.isFinite(progress.unlockedAt)
      ) ||
      !Number.isSafeInteger(progress.localReputation) ||
      progress.localReputation < 0 ||
      !Number.isSafeInteger(progress.farmLevel) ||
      progress.farmLevel < 1 ||
      !Number.isSafeInteger(progress.ranchLevel) ||
      progress.ranchLevel < 1 ||
      !Number.isSafeInteger(progress.mineLevel) ||
      progress.mineLevel < 1 ||
      !Number.isSafeInteger(progress.landmarkStage) ||
      progress.landmarkStage < 0 ||
      (
        progress.lastVisitedAt !== null &&
        !Number.isFinite(progress.lastVisitedAt)
      )
    ) {
      throw new Error("城镇开发进度存档无效");
    }
  }
  const activeTownId = state.activeTownId as EstateTownId;
  if (!state.townProgress[activeTownId]?.unlocked) {
    throw new Error("当前城镇尚未解锁");
  }
  for (const log of state.travelLogs) {
    if (
      !log ||
      typeof log !== "object" ||
      typeof log.id !== "string" ||
      !Number.isFinite(log.at) ||
      !ESTATE_TOWN_IDS.includes(log.fromTownId) ||
      !ESTATE_TOWN_IDS.includes(log.toTownId) ||
      typeof log.routeId !== "string" ||
      !Number.isSafeInteger(log.baseFare) ||
      log.baseFare < 0 ||
      !Number.isSafeInteger(log.paidFare) ||
      log.paidFare < 0 ||
      log.paidFare > log.baseFare ||
      typeof log.usedRailPass !== "boolean"
    ) {
      throw new Error("城镇交通记录存档无效");
    }
  }
  if (state.shipments.length > ESTATE_MAX_SHIPMENTS) {
    throw new Error("城镇货运存档无效");
  }
  for (const shipment of state.shipments) {
    const cargo = shipment && typeof shipment === "object"
      ? ESTATE_CARGO_DEFINITIONS[shipment.cargoId]
      : undefined;
    if (
      !shipment ||
      typeof shipment !== "object" ||
      typeof shipment.id !== "string" ||
      shipment.id.length < 1 ||
      !ESTATE_CARGO_IDS.includes(shipment.cargoId) ||
      !ESTATE_TOWN_IDS.includes(shipment.fromTownId) ||
      !ESTATE_TOWN_IDS.includes(shipment.toTownId) ||
      shipment.fromTownId !== cargo?.fromTownId ||
      shipment.toTownId !== cargo?.toTownId ||
      !Number.isFinite(shipment.dispatchedAt) ||
      !Number.isFinite(shipment.arrivesAt) ||
      shipment.arrivesAt < shipment.dispatchedAt ||
      (
        shipment.collectedAt !== null &&
        (!Number.isFinite(shipment.collectedAt) ||
          shipment.collectedAt < shipment.arrivesAt)
      )
    ) {
      throw new Error("城镇货运存档无效");
    }
  }
}
