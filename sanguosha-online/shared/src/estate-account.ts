import {
  ESTATE_TOWN_IDS,
  TOWN_DEFINITIONS,
  getTownRoute,
  type EstateTownId,
} from "./towns/registry.js";

export const ESTATE_ACCOUNT_STATE_VERSION = 1 as const;
export const ESTATE_MAX_TRAVEL_LOGS = 24;
export const ESTATE_DAILY_LOGISTICS_CAPACITY = 6;

export const ESTATE_MERCHANT_ITEM_IDS = [
  "priority_dispatch",
  "contract_reroll",
  "forecast_report",
  "disaster_supplies",
  "rail_pass",
  "merchant_banner",
] as const;

export type EstateMerchantItemId =
  (typeof ESTATE_MERCHANT_ITEM_IDS)[number];

export interface EstateMerchantItemDefinition {
  readonly id: EstateMerchantItemId;
  readonly name: string;
  readonly description: string;
  readonly coinPrice: number;
  readonly requiredRenown: number;
  readonly inventoryLimit: number;
  readonly weeklyPurchaseLimit: number;
  readonly category: "utility" | "information" | "resilience" | "cosmetic";
  readonly numericEffect:
    | {
        readonly kind: "facility_acceleration";
        readonly percent: 10;
        readonly maximumSeconds: number;
      }
    | {
        readonly kind: "contract_reroll";
        readonly count: 1;
      }
    | {
        readonly kind: "forecast_unlock";
        readonly windows: 1;
      }
    | {
        readonly kind: "disaster_penalty_reduction";
        readonly percentagePoints: 5;
      }
    | {
        readonly kind: "travel_discount";
        readonly percent: 50;
      }
    | {
        readonly kind: "cosmetic";
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
    requiredRenown: 2,
    inventoryLimit: 3,
    weeklyPurchaseLimit: 2,
    category: "utility",
    numericEffect: {
      kind: "facility_acceleration",
      percent: 10,
      maximumSeconds: 30 * 60,
    },
  },
  contract_reroll: {
    id: "contract_reroll",
    name: "合同改签券",
    description: "重新生成一份同档联合订单，不提高奖励档位。",
    coinPrice: 120,
    requiredRenown: 1,
    inventoryLimit: 2,
    weeklyPurchaseLimit: 3,
    category: "utility",
    numericEffect: { kind: "contract_reroll", count: 1 },
  },
  forecast_report: {
    id: "forecast_report",
    name: "下一周期气象报告",
    description: "提前显示下一 8 小时天气窗口；不提供任何产量加成。",
    coinPrice: 60,
    requiredRenown: 0,
    inventoryLimit: 2,
    weeklyPurchaseLimit: 5,
    category: "information",
    numericEffect: { kind: "forecast_unlock", windows: 1 },
  },
  disaster_supplies: {
    id: "disaster_supplies",
    name: "灾期保险物资",
    description: "本次灾害中将一个板块的负面倍率减轻 5 个百分点。",
    coinPrice: 260,
    requiredRenown: 3,
    inventoryLimit: 2,
    weeklyPurchaseLimit: 2,
    category: "resilience",
    numericEffect: {
      kind: "disaster_penalty_reduction",
      percentagePoints: 5,
    },
  },
  rail_pass: {
    id: "rail_pass",
    name: "商会联运票",
    description: "下一次跨镇客运基础票价减半，不减免货运费用。",
    coinPrice: 160,
    requiredRenown: 1,
    inventoryLimit: 2,
    weeklyPurchaseLimit: 2,
    category: "utility",
    numericEffect: { kind: "travel_discount", percent: 50 },
  },
  merchant_banner: {
    id: "merchant_banner",
    name: "商会纪念旗",
    description: "纯展示收藏品，用于长期经营后的金币回收。",
    coinPrice: 1_200,
    requiredRenown: 5,
    inventoryLimit: 9,
    weeklyPurchaseLimit: 1,
    category: "cosmetic",
    numericEffect: { kind: "cosmetic" },
  },
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
  weekKey: string;
  counts: EstateMerchantInventory;
}

export interface EstateLogisticsState {
  dayKey: string;
  used: number;
  capacity: number;
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
  merchantRenown: number;
  activeTownId: EstateTownId;
  unlockedResearchIds: string[];
  townProgress: Partial<Record<EstateTownId, EstateTownProgress>>;
  merchantInventory: EstateMerchantInventory;
  purchaseLedger: EstatePurchaseLedger;
  logistics: EstateLogisticsState;
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
  return new Date(now).toISOString().slice(0, 10);
}

function accountWeekKey(now: number): string {
  const date = new Date(now);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(
    ((date.getTime() - yearStart) / 86_400_000 + 1) / 7,
  );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function createEstateAccount(input: {
  readonly ownerId: string;
  readonly ownerName: string;
  readonly now: number;
  readonly coins?: number;
  readonly researchPoints?: number;
  readonly merchantRenown?: number;
  readonly unlockedResearchIds?: readonly string[];
}): EstateAccountState {
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
    merchantRenown: Math.max(0, Math.floor(input.merchantRenown ?? 0)),
    activeTownId: "greenvale",
    unlockedResearchIds: [
      ...new Set(input.unlockedResearchIds ?? []),
    ],
    townProgress: { greenvale: progress },
    merchantInventory: emptyMerchantInventory(),
    purchaseLedger: {
      weekKey: accountWeekKey(input.now),
      counts: emptyMerchantInventory(),
    },
    logistics: {
      dayKey: accountDayKey(input.now),
      used: 0,
      capacity: ESTATE_DAILY_LOGISTICS_CAPACITY,
    },
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
  const weekKey = accountWeekKey(now);
  let changed = false;
  if (account.logistics.dayKey !== dayKey) {
    account.logistics = {
      dayKey,
      used: 0,
      capacity: ESTATE_DAILY_LOGISTICS_CAPACITY,
    };
    changed = true;
  }
  if (account.purchaseLedger.weekKey !== weekKey) {
    account.purchaseLedger = {
      weekKey,
      counts: emptyMerchantInventory(),
    };
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
  const missing: string[] = [];
  if (!unlocked && progress) {
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
  } else if (!unlocked && requirements.sourceTownId && !progress) {
    missing.push(`先开发${TOWN_DEFINITIONS[requirements.sourceTownId].name}`);
  }
  for (const researchId of requirements.requiredResearchIds) {
    if (!state.unlockedResearchIds.includes(researchId)) {
      missing.push(`完成研究 ${researchId}`);
    }
  }
  if (state.coins < requirements.coinCost) {
    missing.push(`准备 ${requirements.coinCost} 金币开发资金`);
  }
  return {
    townId,
    unlocked,
    canUnlock: !unlocked && missing.length === 0,
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
  if (account.merchantRenown < item.requiredRenown) {
    throw new Error(`商会名望达到 ${item.requiredRenown} 后开放`);
  }
  if (account.coins < item.coinPrice) throw new Error("购买商品所需金币不足");
  if (account.merchantInventory[itemId] >= item.inventoryLimit) {
    throw new Error("该道具库存已达上限");
  }
  if (
    account.purchaseLedger.counts[itemId] >= item.weeklyPurchaseLimit
  ) {
    throw new Error("该商品本周限购次数已用完");
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
    !Number.isSafeInteger(state.revision) ||
    Number(state.revision) < 0 ||
    !Number.isSafeInteger(state.coins) ||
    Number(state.coins) < 0 ||
    !Number.isSafeInteger(state.researchPoints) ||
    Number(state.researchPoints) < 0 ||
    !Number.isSafeInteger(state.merchantRenown) ||
    Number(state.merchantRenown) < 0 ||
    !ESTATE_TOWN_IDS.includes(state.activeTownId as EstateTownId) ||
    !Array.isArray(state.unlockedResearchIds) ||
    !state.townProgress ||
    typeof state.townProgress !== "object" ||
    !state.merchantInventory ||
    typeof state.merchantInventory !== "object" ||
    !state.purchaseLedger ||
    !state.logistics ||
    !Array.isArray(state.travelLogs)
  ) {
    throw new Error("庄园账户存档无效");
  }
  for (const itemId of ESTATE_MERCHANT_ITEM_IDS) {
    const quantity = state.merchantInventory[itemId];
    if (!Number.isSafeInteger(quantity) || Number(quantity) < 0) {
      throw new Error("庄园商会道具存档无效");
    }
  }
}
