import {
  FARM_CROPS as LEGACY_FARM_CROPS,
  assertRestorableFarmGameState,
  type FarmGameState,
} from "./farm.js";
import {
  FROSTPEAK_CROP_IDS,
  FROSTPEAK_FARM_CROPS,
} from "./towns/frostpeak.js";
import { GREENVALE_CROP_IDS } from "./towns/greenvale.js";
import {
  getTownDefinition,
  isEstateTownId,
  type EstateTownId,
  type TownDefinition,
} from "./towns/registry.js";

export const FARMING_STATE_VERSION = 2 as const;
export const FARMING_STARTING_PLOTS = 6;
export const FARMING_MAX_PLOTS = 12;
export const FARMING_MAX_LOGS = 80;
export const FARMING_MAX_DAILY_HELPS = 20;
export const FARMING_MAX_DAILY_STEALS = 20;

/** @deprecated Greenvale-only compatibility catalog. Prefer a state's town catalog. */
export const FARMING_CROP_IDS = GREENVALE_CROP_IDS;
export const ALL_FARMING_CROP_IDS = [
  ...GREENVALE_CROP_IDS,
  ...FROSTPEAK_CROP_IDS,
] as const;

export type FarmingCropId = (typeof ALL_FARMING_CROP_IDS)[number];

export interface FarmingCropDefinition {
  readonly id: FarmingCropId;
  readonly name: string;
  readonly unlockLevel: number;
  readonly seedCost: number;
  readonly basePrice: number;
  readonly minimumPrice: number;
  readonly maximumPrice: number;
  readonly growthSeconds: number;
  readonly yield: number;
  readonly harvestExperience: number;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;

export const FARMING_CROPS: Readonly<Record<
  (typeof GREENVALE_CROP_IDS)[number],
  FarmingCropDefinition
>> = {
  wheat: {
    id: "wheat",
    name: "小麦",
    unlockLevel: 1,
    seedCost: 3,
    basePrice: 6,
    minimumPrice: 4,
    maximumPrice: 9,
    growthSeconds: 5 * MINUTE,
    yield: 3,
    harvestExperience: 8,
  },
  carrot: {
    id: "carrot",
    name: "胡萝卜",
    unlockLevel: 1,
    seedCost: 5,
    basePrice: 9,
    minimumPrice: 6,
    maximumPrice: 13,
    growthSeconds: 10 * MINUTE,
    yield: 3,
    harvestExperience: 11,
  },
  tomato: {
    id: "tomato",
    name: "番茄",
    unlockLevel: 2,
    seedCost: 8,
    basePrice: 14,
    minimumPrice: 9,
    maximumPrice: 20,
    growthSeconds: 20 * MINUTE,
    yield: 4,
    harvestExperience: 15,
  },
  corn: {
    id: "corn",
    name: "玉米",
    unlockLevel: 3,
    seedCost: 12,
    basePrice: 19,
    minimumPrice: 12,
    maximumPrice: 27,
    growthSeconds: 30 * MINUTE,
    yield: 4,
    harvestExperience: 19,
  },
  pumpkin: {
    id: "pumpkin",
    name: "南瓜",
    unlockLevel: 4,
    seedCost: 18,
    basePrice: 29,
    minimumPrice: 18,
    maximumPrice: 42,
    growthSeconds: HOUR,
    yield: 5,
    harvestExperience: 26,
  },
  strawberry: {
    id: "strawberry",
    name: "草莓",
    unlockLevel: 5,
    seedCost: 26,
    basePrice: 41,
    minimumPrice: 25,
    maximumPrice: 59,
    growthSeconds: 2 * HOUR,
    yield: 5,
    harvestExperience: 34,
  },
  sunflower: {
    id: "sunflower",
    name: "向日葵",
    unlockLevel: 6,
    seedCost: 36,
    basePrice: 55,
    minimumPrice: 34,
    maximumPrice: 79,
    growthSeconds: 3 * HOUR,
    yield: 6,
    harvestExperience: 43,
  },
  watermelon: {
    id: "watermelon",
    name: "西瓜",
    unlockLevel: 7,
    seedCost: 50,
    basePrice: 74,
    minimumPrice: 45,
    maximumPrice: 105,
    growthSeconds: 4 * HOUR,
    yield: 6,
    harvestExperience: 53,
  },
  grape: {
    id: "grape",
    name: "葡萄",
    unlockLevel: 8,
    seedCost: 68,
    basePrice: 98,
    minimumPrice: 60,
    maximumPrice: 138,
    growthSeconds: 6 * HOUR,
    yield: 7,
    harvestExperience: 65,
  },
  blueberry: {
    id: "blueberry",
    name: "蓝莓",
    unlockLevel: 9,
    seedCost: 91,
    basePrice: 128,
    minimumPrice: 78,
    maximumPrice: 180,
    growthSeconds: 8 * HOUR,
    yield: 7,
    harvestExperience: 78,
  },
  cotton: {
    id: "cotton",
    name: "棉花",
    unlockLevel: 11,
    seedCost: 120,
    basePrice: 165,
    minimumPrice: 100,
    maximumPrice: 232,
    growthSeconds: 12 * HOUR,
    yield: 8,
    harvestExperience: 94,
  },
  dragonfruit: {
    id: "dragonfruit",
    name: "火龙果",
    unlockLevel: 13,
    seedCost: 160,
    basePrice: 215,
    minimumPrice: 130,
    maximumPrice: 300,
    growthSeconds: 18 * HOUR,
    yield: 9,
    harvestExperience: 115,
  },
};

const ALL_FARMING_CROPS: Readonly<
  Record<FarmingCropId, FarmingCropDefinition>
> = {
  ...FARMING_CROPS,
  ...FROSTPEAK_FARM_CROPS,
} as Readonly<Record<FarmingCropId, FarmingCropDefinition>>;

export function getFarmingCropDefinition(
  cropId: FarmingCropId,
): FarmingCropDefinition {
  return ALL_FARMING_CROPS[cropId];
}

function farmingCropIds(townId: EstateTownId): readonly FarmingCropId[] {
  return getTownDefinition(townId).content.cropIds as readonly FarmingCropId[];
}

function farmingCrops(
  townId: EstateTownId,
): Readonly<Record<FarmingCropId, FarmingCropDefinition>> {
  const ids = farmingCropIds(townId);
  return Object.fromEntries(
    ids.map((cropId) => [cropId, ALL_FARMING_CROPS[cropId]]),
  ) as Readonly<Record<FarmingCropId, FarmingCropDefinition>>;
}

function farmingTownId(state: { readonly townId?: unknown }): EstateTownId {
  return isEstateTownId(state.townId) ? state.townId : "greenvale";
}

export const FARMING_LEVEL_EXPERIENCE = [
  0,
  40,
  100,
  180,
  280,
  400,
  550,
  730,
  940,
  1_180,
  1_450,
  1_750,
  2_100,
] as const;

export interface FarmingPlotExpansion {
  readonly plotIndex: number;
  readonly requiredLevel: number;
  readonly coinCost: number;
}

export const FARMING_PLOT_EXPANSIONS: readonly FarmingPlotExpansion[] = [
  { plotIndex: 6, requiredLevel: 3, coinCost: 120 },
  { plotIndex: 7, requiredLevel: 5, coinCost: 260 },
  { plotIndex: 8, requiredLevel: 7, coinCost: 520 },
  { plotIndex: 9, requiredLevel: 9, coinCost: 900 },
  { plotIndex: 10, requiredLevel: 11, coinCost: 1_450 },
  { plotIndex: 11, requiredLevel: 13, coinCost: 2_200 },
];

export interface FarmingDogUpgrade {
  readonly level: number;
  readonly requiredFarmLevel: number;
  readonly coinCost: number;
  readonly blockChance: number;
}

export const FARMING_DOG_UPGRADES: readonly FarmingDogUpgrade[] = [
  { level: 1, requiredFarmLevel: 4, coinCost: 240, blockChance: 15 },
  { level: 2, requiredFarmLevel: 7, coinCost: 680, blockChance: 30 },
  { level: 3, requiredFarmLevel: 10, coinCost: 1_500, blockChance: 45 },
];

export type FarmingCropCounts = Record<FarmingCropId, number>;

export interface FarmingPlotState {
  readonly index: number;
  cycle: number;
  cropId: FarmingCropId | null;
  plantedAt: number | null;
  maturesAt: number | null;
  watered: boolean;
  weedAt: number | null;
  pestAt: number | null;
  weedCleared: boolean;
  pestCleared: boolean;
  stolen: number;
  stealAttempts: string[];
  stolenBy: string[];
  /** Captured when the crop is planted so later weather changes cannot rewrite history. */
  productionModifierPercent?: number;
  durationModifierPercent?: number;
  productionModifierLabel?: string;
}

export interface EstateProductionRule {
  readonly yieldPercent: number;
  readonly durationPercent: number;
  readonly label: string;
}

export interface FarmingMarketQuote {
  readonly cropId: FarmingCropId;
  price: number;
  previousPrice: number;
  trend: -1 | 0 | 1;
}

export interface FarmingMarketEvent {
  readonly title: string;
  readonly summary: string;
  readonly tone: "neutral" | "surge" | "crash" | "volatile";
  readonly source: "rules" | "llm";
}

export interface FarmingMarketDecision {
  readonly title: string;
  readonly summary: string;
  readonly tone: FarmingMarketEvent["tone"];
  readonly prices: Record<FarmingCropId, number>;
}

export interface FarmingLogEntry {
  readonly id: number;
  readonly at: number;
  readonly kind:
    | "system"
    | "economy"
    | "plant"
    | "care"
    | "harvest"
    | "social"
    | "progression";
  readonly text: string;
}

export interface FarmingStatistics {
  harvests: number;
  produceHarvested: number;
  produceSold: number;
  coinsEarned: number;
  helpsGiven: number;
  helpsReceived: number;
  stealsSucceeded: number;
  stolenFrom: number;
  dogBlocks: number;
  mutationsFound: number;
}

export interface FarmingDailySocial {
  dayKey: string;
  helps: number;
  steals: number;
}

export interface FarmingGameState {
  readonly kind: "farm";
  readonly version: typeof FARMING_STATE_VERSION;
  townId: EstateTownId;
  readonly seed: string;
  revision: number;
  readonly ownerId: string;
  ownerName: string;
  readonly createdAt: number;
  updatedAt: number;
  coins: number;
  experience: number;
  level: number;
  unlockedPlots: number;
  dogLevel: number;
  seeds: FarmingCropCounts;
  produce: FarmingCropCounts;
  mutations: FarmingCropCounts;
  discoveredCrops: FarmingCropId[];
  plots: FarmingPlotState[];
  marketDay: string;
  market: Record<FarmingCropId, FarmingMarketQuote>;
  marketEvent: FarmingMarketEvent;
  dailySocial: FarmingDailySocial;
  statistics: FarmingStatistics;
  logs: FarmingLogEntry[];
}

export type FarmingCareKind = "water" | "weed" | "pest";

export type FarmingAction =
  | {
      readonly type: "farming_buy_seed";
      readonly cropId: FarmingCropId;
      readonly quantity: number;
    }
  | {
      readonly type: "farming_plant";
      readonly cropId: FarmingCropId;
      readonly plotIndex: number;
    }
  | {
      readonly type: "farming_batch_plant";
      readonly cropId: FarmingCropId;
      readonly plotIndices: readonly number[];
    }
  | {
      readonly type: "farming_tend";
      readonly care: FarmingCareKind;
      readonly plotIndex: number;
    }
  | {
      readonly type: "farming_harvest";
      readonly plotIndex: number;
    }
  | {
      readonly type: "farming_batch_harvest";
      readonly plotIndices: readonly number[];
    }
  | {
      readonly type: "farming_clear_plot";
      readonly plotIndex: number;
    }
  | {
      readonly type: "farming_sell";
      readonly cropId: FarmingCropId;
      readonly quantity: number;
    }
  | {
      readonly type: "farming_redeem_mutation";
      readonly cropId: FarmingCropId;
      readonly quantity: number;
    }
  | {
      readonly type: "farming_expand_plot";
    }
  | {
      readonly type: "farming_upgrade_dog";
    };

export type FarmingVisitAction =
  | {
      readonly type: "farming_help";
      readonly care: FarmingCareKind;
      readonly plotIndex: number;
    }
  | {
      readonly type: "farming_steal";
      readonly plotIndex: number;
    };

export interface FarmingPlotView extends FarmingPlotState {
  readonly unlocked: boolean;
  readonly ready: boolean;
  readonly progress: number;
  readonly hasWeeds: boolean;
  readonly hasPests: boolean;
  readonly estimatedYield: number;
  readonly maximumStealable: number;
}

export interface FarmingInventoryView {
  readonly coins: number;
  readonly seeds: FarmingCropCounts;
  readonly produce: FarmingCropCounts;
  readonly mutations: FarmingCropCounts;
}

export interface FarmingGameView {
  readonly kind: "farm";
  readonly version: typeof FARMING_STATE_VERSION;
  readonly townId: EstateTownId;
  readonly townDefinition: TownDefinition;
  readonly revision: number;
  readonly serverTime: number;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly isOwner: boolean;
  readonly createdAt: number;
  readonly level: number;
  readonly experience: number;
  readonly currentLevelExperience: number;
  readonly nextLevelExperience: number | null;
  readonly unlockedPlots: number;
  readonly dogLevel: number;
  readonly dogBlockChance: number;
  readonly crops: Readonly<Record<FarmingCropId, FarmingCropDefinition>>;
  readonly inventory: FarmingInventoryView | null;
  readonly discoveredCrops: FarmingCropId[];
  readonly plots: FarmingPlotView[];
  readonly market: Record<FarmingCropId, FarmingMarketQuote>;
  readonly marketEvent: FarmingMarketEvent;
  readonly nextExpansion: FarmingPlotExpansion | null;
  readonly nextDogUpgrade: FarmingDogUpgrade | null;
  readonly dailySocial: FarmingDailySocial | null;
  readonly statistics: FarmingStatistics | null;
  readonly logs: FarmingLogEntry[];
}

export interface FarmingNeighborSummary {
  readonly ownerId: string;
  readonly ownerName: string;
  readonly level: number;
  readonly unlockedPlots: number;
  readonly dogLevel: number;
  readonly readyPlots: number;
  readonly careNeededPlots: number;
  readonly stealablePlots: number;
  readonly updatedAt: number;
}

export interface FarmingVisitResult {
  readonly owner: FarmingGameState;
  readonly visitor: FarmingGameState;
  readonly outcome: "helped" | "stolen" | "blocked";
}

export type FarmingRuleErrorCode =
  | "FARMING_INVALID_TIME"
  | "FARMING_INVALID_QUANTITY"
  | "FARMING_UNKNOWN_CROP"
  | "FARMING_CROP_LOCKED"
  | "FARMING_NOT_ENOUGH_COINS"
  | "FARMING_NOT_ENOUGH_SEEDS"
  | "FARMING_NOT_ENOUGH_PRODUCE"
  | "FARMING_NOT_ENOUGH_MUTATIONS"
  | "FARMING_INVALID_PLOT"
  | "FARMING_PLOT_LOCKED"
  | "FARMING_PLOT_OCCUPIED"
  | "FARMING_PLOT_EMPTY"
  | "FARMING_CARE_NOT_NEEDED"
  | "FARMING_NOT_READY"
  | "FARMING_MAX_PLOTS"
  | "FARMING_LEVEL_REQUIRED"
  | "FARMING_DOG_MAX_LEVEL"
  | "FARMING_CANNOT_VISIT_SELF"
  | "FARMING_TOWN_MISMATCH"
  | "FARMING_DAILY_HELP_LIMIT"
  | "FARMING_DAILY_STEAL_LIMIT"
  | "FARMING_ALREADY_ATTEMPTED"
  | "FARMING_NOTHING_TO_STEAL";

export class FarmingRuleError extends Error {
  constructor(
    readonly code: FarmingRuleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FarmingRuleError";
  }
}

function cropCounts(
  initial = 0,
  townId: EstateTownId = "greenvale",
): FarmingCropCounts {
  return Object.fromEntries(
    farmingCropIds(townId).map((cropId) => [cropId, initial]),
  ) as FarmingCropCounts;
}

function emptyStatistics(): FarmingStatistics {
  return {
    harvests: 0,
    produceHarvested: 0,
    produceSold: 0,
    coinsEarned: 0,
    helpsGiven: 0,
    helpsReceived: 0,
    stealsSucceeded: 0,
    stolenFrom: 0,
    dogBlocks: 0,
    mutationsFound: 0,
  };
}

function emptyPlot(index: number, cycle = 0): FarmingPlotState {
  return {
    index,
    cycle,
    cropId: null,
    plantedAt: null,
    maturesAt: null,
    watered: false,
    weedAt: null,
    pestAt: null,
    weedCleared: false,
    pestCleared: false,
    stolen: 0,
    stealAttempts: [],
    stolenBy: [],
    productionModifierPercent: 0,
    durationModifierPercent: 0,
    productionModifierLabel: "常态生产",
  };
}

function hashText(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function assertTime(now: number): void {
  if (
    !Number.isSafeInteger(now) ||
    now < 0 ||
    now > 8_640_000_000_000_000
  ) {
    throw new FarmingRuleError("FARMING_INVALID_TIME", "服务器时间无效");
  }
}

function dayKey(now: number): string {
  assertTime(now);
  return new Date(now + 8 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

function levelForExperience(experience: number): number {
  let level = 1;
  for (const [index, threshold] of FARMING_LEVEL_EXPERIENCE.entries()) {
    if (experience >= threshold) level = index + 1;
  }
  return Math.min(level, FARMING_LEVEL_EXPERIENCE.length);
}

function isCropId(
  value: unknown,
  townId: EstateTownId = "greenvale",
): value is FarmingCropId {
  return typeof value === "string" &&
    (farmingCropIds(townId) as readonly string[]).includes(value);
}

function validQuantity(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= 99;
}

function marketForDay(
  seed: string,
  key: string,
  townId: EstateTownId,
  previous?: Record<FarmingCropId, FarmingMarketQuote>,
): Record<FarmingCropId, FarmingMarketQuote> {
  return Object.fromEntries(farmingCropIds(townId).map((cropId) => {
    const crop = ALL_FARMING_CROPS[cropId];
    const range = crop.maximumPrice - crop.minimumPrice + 1;
    const price = crop.minimumPrice +
      hashText(`${seed}:${key}:${cropId}`) % range;
    const previousPrice = previous?.[cropId]?.price ?? crop.basePrice;
    return [cropId, {
      cropId,
      price,
      previousPrice,
      trend: price === previousPrice ? 0 : price > previousPrice ? 1 : -1,
    }];
  })) as Record<FarmingCropId, FarmingMarketQuote>;
}

function addLog(
  game: FarmingGameState,
  at: number,
  kind: FarmingLogEntry["kind"],
  text: string,
): void {
  game.logs.push({
    id: game.revision + game.logs.length + 1,
    at,
    kind,
    text,
  });
  if (game.logs.length > FARMING_MAX_LOGS) {
    game.logs.splice(0, game.logs.length - FARMING_MAX_LOGS);
  }
}

function addExperience(
  game: FarmingGameState,
  amount: number,
  now: number,
): void {
  if (amount <= 0) return;
  const previousLevel = game.level;
  game.experience += amount;
  game.level = levelForExperience(game.experience);
  if (game.level > previousLevel) {
    addLog(
      game,
      now,
      "progression",
      `农场升至 ${game.level} 级，新的作物或土地已经解锁。`,
    );
  }
}

function dogBlockChance(level: number): number {
  return FARMING_DOG_UPGRADES.find((upgrade) => upgrade.level === level)
    ?.blockChance ?? 0;
}

function requirePlot(
  game: FarmingGameState,
  plotIndex: number,
  requireUnlocked = true,
): FarmingPlotState {
  if (
    !Number.isSafeInteger(plotIndex) ||
    plotIndex < 0 ||
    plotIndex >= FARMING_MAX_PLOTS
  ) {
    throw new FarmingRuleError("FARMING_INVALID_PLOT", "田地编号无效");
  }
  if (requireUnlocked && plotIndex >= game.unlockedPlots) {
    throw new FarmingRuleError("FARMING_PLOT_LOCKED", "这块土地尚未开垦");
  }
  return game.plots[plotIndex]!;
}

function cropIssueAppeared(at: number | null, cleared: boolean, now: number): boolean {
  return at !== null && at <= now && !cleared;
}

function plotYield(plot: FarmingPlotState, now: number): number {
  if (!plot.cropId) return 0;
  let result = ALL_FARMING_CROPS[plot.cropId].yield;
  if (!plot.watered) result -= 1;
  if (cropIssueAppeared(plot.weedAt, plot.weedCleared, now)) result -= 1;
  if (cropIssueAppeared(plot.pestAt, plot.pestCleared, now)) result -= 1;
  return Math.max(
    1,
    Math.round(result * (100 + (plot.productionModifierPercent ?? 0)) / 100),
  );
}

function maximumStealable(plot: FarmingPlotState, now: number): number {
  const amount = plotYield(plot, now);
  return amount < 3 ? 0 : Math.max(1, Math.floor(amount * 0.3));
}

function mutationFound(
  game: FarmingGameState,
  plot: FarmingPlotState,
  now: number,
): boolean {
  const perfectCare = plot.watered &&
    !cropIssueAppeared(plot.weedAt, plot.weedCleared, now) &&
    !cropIssueAppeared(plot.pestAt, plot.pestCleared, now);
  const chance = perfectCare ? 12 : 7;
  return hashText(
    `${game.seed}:mutation:${plot.index}:${plot.cycle}`,
  ) % 100 < chance;
}

function resetPlot(plot: FarmingPlotState): void {
  const next = emptyPlot(plot.index, plot.cycle);
  Object.assign(plot, next);
}

export function createFarmingGame(input: {
  readonly ownerId: string;
  readonly ownerName: string;
  readonly seed: string;
  readonly now: number;
  readonly townId?: EstateTownId;
}): FarmingGameState {
  assertTime(input.now);
  if (
    input.ownerId.trim().length === 0 ||
    input.ownerName.trim().length === 0 ||
    input.ownerName.length > 80
  ) {
    throw new Error("实时农场玩家资料无效");
  }
  if (input.seed.length < 1 || input.seed.length > 128) {
    throw new Error("实时农场随机种子无效");
  }
  const key = dayKey(input.now);
  const townId = input.townId ?? "greenvale";
  const seeds = cropCounts(0, townId);
  const starterCropIds = farmingCropIds(townId).slice(0, 2);
  seeds[starterCropIds[0]!] = 6;
  seeds[starterCropIds[1]!] = 3;
  return {
    kind: "farm",
    version: FARMING_STATE_VERSION,
    townId,
    seed: input.seed,
    revision: 0,
    ownerId: input.ownerId,
    ownerName: input.ownerName.trim(),
    createdAt: input.now,
    updatedAt: input.now,
    coins: 100,
    experience: 0,
    level: 1,
    unlockedPlots: FARMING_STARTING_PLOTS,
    dogLevel: 0,
    seeds,
    produce: cropCounts(0, townId),
    mutations: cropCounts(0, townId),
    discoveredCrops: [...starterCropIds],
    plots: Array.from(
      { length: FARMING_MAX_PLOTS },
      (_, index) => emptyPlot(index),
    ),
    marketDay: key,
    market: marketForDay(input.seed, key, townId),
    marketEvent: {
      title: "清晨开市",
      summary: "今日农产品收购价已经发布，合理安排成熟时间与出售节奏。",
      tone: "neutral",
      source: "rules",
    },
    dailySocial: { dayKey: key, helps: 0, steals: 0 },
    statistics: emptyStatistics(),
    logs: [{
      id: 0,
      at: input.now,
      kind: "system",
      text: "长期农场已经建立。作物会按照服务器时间持续生长。",
    }],
  };
}

export function migrateLegacyFarmGame(
  value: unknown,
  now: number,
): FarmingGameState {
  assertTime(now);
  assertRestorableFarmGameState(value);
  const legacy = value as FarmGameState;
  const legacyPlayer = legacy.players[0]!;
  const game = createFarmingGame({
    ownerId: legacyPlayer.id,
    ownerName: legacyPlayer.name,
    seed: legacy.seed,
    now,
  });
  game.revision = legacy.revision + 1;
  game.coins = legacyPlayer.coins;
  game.seeds.wheat = legacyPlayer.seeds.wheat;
  game.seeds.tomato = legacyPlayer.seeds.tomato;
  game.seeds.pumpkin = legacyPlayer.seeds.pumpkin;
  game.produce.wheat = legacyPlayer.produce.wheat;
  game.produce.tomato = legacyPlayer.produce.tomato;
  game.produce.pumpkin = legacyPlayer.produce.pumpkin;
  game.experience = Math.min(
    FARMING_LEVEL_EXPERIENCE.at(-1)!,
    Math.floor(legacyPlayer.totalRevenue / 5) + Math.max(0, legacy.day - 1) * 10,
  );
  game.level = levelForExperience(game.experience);
  game.discoveredCrops = FARMING_CROP_IDS.filter((cropId) => {
    if (cropId === "carrot") return true;
    if (!["wheat", "tomato", "pumpkin"].includes(cropId)) return false;
    const legacyCropId = cropId as keyof typeof legacyPlayer.seeds;
    return legacyPlayer.seeds[legacyCropId] > 0 ||
      legacyPlayer.produce[legacyCropId] > 0 ||
      legacyPlayer.plots.some((plot) => plot.cropId === legacyCropId);
  });
  if (!game.discoveredCrops.includes("wheat")) game.discoveredCrops.unshift("wheat");
  for (const [index, legacyPlot] of legacyPlayer.plots.entries()) {
    if (!legacyPlot.cropId) continue;
    const cropId = legacyPlot.cropId as FarmingCropId;
    const crop = ALL_FARMING_CROPS[cropId];
    const legacyCrop = LEGACY_FARM_CROPS[legacyPlot.cropId];
    const progress = Math.max(
      0,
      Math.min(1, legacyPlot.growth / legacyCrop.growthDays),
    );
    const duration = crop.growthSeconds * 1_000;
    const plantedAt = now - Math.floor(duration * progress);
    Object.assign(game.plots[index]!, {
      ...emptyPlot(index, 1),
      cropId,
      plantedAt,
      maturesAt: plantedAt + duration,
      watered: legacyPlot.watered,
      weedCleared: true,
      pestCleared: true,
    });
  }
  game.logs = legacy.logs.slice(-Math.max(0, FARMING_MAX_LOGS - 2)).map(
    (entry, index): FarmingLogEntry => ({
      id: index,
      at: now,
      kind: entry.playerId === null ? "system" : "economy",
      text: `旧档案记录：${entry.text}`,
    }),
  );
  addLog(
    game,
    now,
    "system",
    legacy.status === "finished"
      ? "旧经营周期已迁移为长期农场，原有资金、库存与田间进度均已保留。"
      : "农场已升级为实时长期经营模式，原有资金、库存与田间进度均已保留。",
  );
  game.updatedAt = now;
  assertRestorableFarmingGameState(game);
  return game;
}

export function refreshFarmingGame(
  state: FarmingGameState,
  now: number,
): FarmingGameState {
  assertTime(now);
  const game = structuredClone(state);
  const effectiveNow = Math.max(now, game.updatedAt);
  const key = dayKey(effectiveNow);
  let changed = false;
  if (!isEstateTownId(game.townId)) {
    game.townId = "greenvale";
    changed = true;
  }
  if (game.marketDay !== key) {
    game.market = marketForDay(game.seed, key, game.townId, game.market);
    game.marketDay = key;
    game.marketEvent = {
      title: "每日行情更新",
      summary: "新一日收购价已经生成。成熟作物可以继续入库，等待更合适的价格出售。",
      tone: "neutral",
      source: "rules",
    };
    addLog(game, effectiveNow, "economy", "新一日农产品收购价已经发布。");
    changed = true;
  }
  if (game.dailySocial.dayKey !== key) {
    game.dailySocial = { dayKey: key, helps: 0, steals: 0 };
    changed = true;
  }
  if (changed) {
    game.updatedAt = effectiveNow;
    game.revision += 1;
  }
  return game;
}

export function applyFarmingMarketDecision(
  state: FarmingGameState,
  decision: FarmingMarketDecision,
  now: number,
): FarmingGameState {
  assertTime(now);
  const townId = farmingTownId(state);
  const cropIds = farmingCropIds(townId);
  const crops = farmingCrops(townId);
  if (
    typeof decision.title !== "string" ||
    decision.title.trim().length < 1 ||
    decision.title.trim().length > 40 ||
    typeof decision.summary !== "string" ||
    decision.summary.trim().length < 1 ||
    decision.summary.trim().length > 180 ||
    !["neutral", "surge", "crash", "volatile"].includes(decision.tone) ||
    !decision.prices ||
    typeof decision.prices !== "object" ||
    !cropIds.every((cropId) => {
      const price = decision.prices[cropId];
      const crop = crops[cropId];
      return Number.isSafeInteger(price) &&
        price >= crop.minimumPrice &&
        price <= crop.maximumPrice;
    })
  ) {
    throw new Error("实时农场市场导演决策无效");
  }
  const game = structuredClone(state);
  game.townId = townId;
  const effectiveNow = Math.max(now, game.updatedAt);
  for (const cropId of cropIds) {
    const quote = game.market[cropId];
    const price = decision.prices[cropId];
    if (!quote) throw new Error("实时农场市场报价缺失");
    quote.price = price;
    quote.trend = price === quote.previousPrice ? 0 : price > quote.previousPrice ? 1 : -1;
  }
  game.marketEvent = {
    title: decision.title.trim(),
    summary: decision.summary.trim(),
    tone: decision.tone,
    source: "llm",
  };
  addLog(
    game,
    effectiveNow,
    "economy",
    `市场导演：${game.marketEvent.title}。${game.marketEvent.summary}`,
  );
  game.updatedAt = effectiveNow;
  game.revision += 1;
  return game;
}

export function applyFarmingAction(
  state: FarmingGameState,
  action: FarmingAction,
  now: number,
  production: EstateProductionRule = {
    yieldPercent: 0,
    durationPercent: 0,
    label: "常态生产",
  },
): FarmingGameState {
  let game = refreshFarmingGame(state, now);
  game = structuredClone(game);
  const effectiveNow = Math.max(now, game.updatedAt);
  const crops = farmingCrops(game.townId);

  if (action.type === "farming_buy_seed") {
    if (!isCropId(action.cropId, game.townId)) {
      throw new FarmingRuleError("FARMING_UNKNOWN_CROP", "作物不存在");
    }
    if (!validQuantity(action.quantity)) {
      throw new FarmingRuleError("FARMING_INVALID_QUANTITY", "购买数量需为 1 至 99");
    }
    const crop = crops[action.cropId];
    if (game.level < crop.unlockLevel) {
      throw new FarmingRuleError(
        "FARMING_CROP_LOCKED",
        `农场达到 ${crop.unlockLevel} 级后才能购买${crop.name}种子`,
      );
    }
    const cost = crop.seedCost * action.quantity;
    if (game.coins < cost) {
      throw new FarmingRuleError("FARMING_NOT_ENOUGH_COINS", "金币不足");
    }
    game.coins -= cost;
    game.seeds[action.cropId] += action.quantity;
    if (!game.discoveredCrops.includes(action.cropId)) {
      game.discoveredCrops.push(action.cropId);
    }
    addLog(
      game,
      effectiveNow,
      "economy",
      `购入 ${action.quantity} 袋${crop.name}种子，支出 ${cost} 金币。`,
    );
  } else if (action.type === "farming_batch_plant") {
    if (game.level < 3) {
      throw new FarmingRuleError(
        "FARMING_LEVEL_REQUIRED",
        "农场达到 3 级后解锁批量播种",
      );
    }
    if (!isCropId(action.cropId, game.townId)) {
      throw new FarmingRuleError("FARMING_UNKNOWN_CROP", "作物不存在");
    }
    const plotIndices = [...new Set(action.plotIndices)];
    if (
      plotIndices.length !== action.plotIndices.length ||
      plotIndices.length < 2 ||
      plotIndices.length > FARMING_MAX_PLOTS
    ) {
      throw new FarmingRuleError(
        "FARMING_INVALID_QUANTITY",
        "批量播种需要选择 2 至 12 块不同田地",
      );
    }
    const crop = crops[action.cropId];
    if (game.level < crop.unlockLevel) {
      throw new FarmingRuleError("FARMING_CROP_LOCKED", "该作物尚未解锁");
    }
    if (game.seeds[action.cropId] < plotIndices.length) {
      throw new FarmingRuleError(
        "FARMING_NOT_ENOUGH_SEEDS",
        "批量播种所需种子不足",
      );
    }
    for (const plotIndex of plotIndices) {
      const plot = requirePlot(game, plotIndex);
      if (plot.cropId !== null) {
        throw new FarmingRuleError(
          "FARMING_PLOT_OCCUPIED",
          "批量播种包含已有作物的田地",
        );
      }
    }
    const baseRevision = game.revision;
    for (const plotIndex of plotIndices) {
      game = applyFarmingAction(
        game,
        {
          type: "farming_plant",
          cropId: action.cropId,
          plotIndex,
        },
        effectiveNow,
        production,
      );
    }
    addLog(
      game,
      effectiveNow,
      "plant",
      `批量播种${crop.name}，共安排 ${plotIndices.length} 块田地。`,
    );
    game.updatedAt = effectiveNow;
    game.revision = baseRevision + 1;
    return game;
  } else if (action.type === "farming_plant") {
    if (!isCropId(action.cropId, game.townId)) {
      throw new FarmingRuleError("FARMING_UNKNOWN_CROP", "作物不存在");
    }
    const crop = crops[action.cropId];
    if (game.level < crop.unlockLevel) {
      throw new FarmingRuleError("FARMING_CROP_LOCKED", "该作物尚未解锁");
    }
    const plot = requirePlot(game, action.plotIndex);
    if (plot.cropId !== null) {
      throw new FarmingRuleError("FARMING_PLOT_OCCUPIED", "这块田已有作物");
    }
    if (game.seeds[action.cropId] < 1) {
      throw new FarmingRuleError("FARMING_NOT_ENOUGH_SEEDS", "没有对应种子");
    }
    const duration = Math.max(
      60_000,
      Math.round(
        crop.growthSeconds * 1_000 *
          (100 + production.durationPercent) / 100,
      ),
    );
    const cycle = plot.cycle + 1;
    game.seeds[action.cropId] -= 1;
    Object.assign(plot, {
      ...emptyPlot(plot.index, cycle),
      cropId: action.cropId,
      plantedAt: effectiveNow,
      maturesAt: effectiveNow + duration,
      productionModifierPercent: production.yieldPercent,
      durationModifierPercent: production.durationPercent,
      productionModifierLabel: production.label,
      weedAt: hashText(`${game.seed}:weed:${plot.index}:${cycle}`) % 100 < 45
        ? effectiveNow + Math.floor(duration * 0.4)
        : null,
      pestAt: hashText(`${game.seed}:pest:${plot.index}:${cycle}`) % 100 < 35
        ? effectiveNow + Math.floor(duration * 0.65)
        : null,
    });
    addExperience(game, 2, effectiveNow);
    addLog(
      game,
      effectiveNow,
      "plant",
      `在 ${plot.index + 1} 号田播种${crop.name}，预计 ${new Date(plot.maturesAt!).toLocaleString("zh-CN")} 成熟。`,
    );
  } else if (action.type === "farming_tend") {
    const plot = requirePlot(game, action.plotIndex);
    if (!plot.cropId) {
      throw new FarmingRuleError("FARMING_PLOT_EMPTY", "田地当前为空");
    }
    if (action.care === "water") {
      if (plot.watered) {
        throw new FarmingRuleError("FARMING_CARE_NOT_NEEDED", "这块田已经浇过水");
      }
      plot.watered = true;
    } else if (action.care === "weed") {
      if (!cropIssueAppeared(plot.weedAt, plot.weedCleared, effectiveNow)) {
        throw new FarmingRuleError("FARMING_CARE_NOT_NEEDED", "当前没有需要清除的杂草");
      }
      plot.weedCleared = true;
    } else if (action.care === "pest") {
      if (!cropIssueAppeared(plot.pestAt, plot.pestCleared, effectiveNow)) {
        throw new FarmingRuleError("FARMING_CARE_NOT_NEEDED", "当前没有需要处理的害虫");
      }
      plot.pestCleared = true;
    }
    addExperience(game, 2, effectiveNow);
    const label = action.care === "water"
      ? "浇水"
      : action.care === "weed" ? "除草" : "除虫";
    addLog(game, effectiveNow, "care", `完成 ${plot.index + 1} 号田${label}。`);
  } else if (action.type === "farming_batch_harvest") {
    if (game.level < 3) {
      throw new FarmingRuleError(
        "FARMING_LEVEL_REQUIRED",
        "农场达到 3 级后解锁批量收获",
      );
    }
    const plotIndices = [...new Set(action.plotIndices)];
    if (
      plotIndices.length !== action.plotIndices.length ||
      plotIndices.length < 2 ||
      plotIndices.length > FARMING_MAX_PLOTS
    ) {
      throw new FarmingRuleError(
        "FARMING_INVALID_QUANTITY",
        "批量收获需要选择 2 至 12 块不同田地",
      );
    }
    for (const plotIndex of plotIndices) {
      const plot = requirePlot(game, plotIndex);
      if (
        !plot.cropId ||
        plot.maturesAt === null ||
        effectiveNow < plot.maturesAt
      ) {
        throw new FarmingRuleError(
          "FARMING_NOT_READY",
          "批量收获包含尚未成熟或空置的田地",
        );
      }
    }
    const baseRevision = game.revision;
    for (const plotIndex of plotIndices) {
      game = applyFarmingAction(
        game,
        { type: "farming_harvest", plotIndex },
        effectiveNow,
        production,
      );
    }
    addLog(
      game,
      effectiveNow,
      "harvest",
      `批量收获完成，共处理 ${plotIndices.length} 块田地。`,
    );
    game.updatedAt = effectiveNow;
    game.revision = baseRevision + 1;
    return game;
  } else if (action.type === "farming_harvest") {
    const plot = requirePlot(game, action.plotIndex);
    if (!plot.cropId || plot.maturesAt === null) {
      throw new FarmingRuleError("FARMING_PLOT_EMPTY", "田地当前为空");
    }
    if (effectiveNow < plot.maturesAt) {
      throw new FarmingRuleError("FARMING_NOT_READY", "作物尚未成熟");
    }
    const crop = crops[plot.cropId];
    const totalYield = plotYield(plot, effectiveNow);
    const ownerYield = Math.max(0, totalYield - plot.stolen);
    game.produce[crop.id] += ownerYield;
    game.statistics.harvests += 1;
    game.statistics.produceHarvested += ownerYield;
    addExperience(game, crop.harvestExperience, effectiveNow);
    if (mutationFound(game, plot, effectiveNow)) {
      game.mutations[crop.id] += 1;
      game.statistics.mutationsFound += 1;
      addLog(
        game,
        effectiveNow,
        "progression",
        `发现一株变异${crop.name}，已收入变异图鉴。`,
      );
    }
    addLog(
      game,
      effectiveNow,
      "harvest",
      `从 ${plot.index + 1} 号田收获 ${ownerYield} 份${crop.name}${
        plot.stolen > 0 ? `，成熟期间被农友摘走 ${plot.stolen} 份` : ""
      }。`,
    );
    resetPlot(plot);
  } else if (action.type === "farming_clear_plot") {
    const plot = requirePlot(game, action.plotIndex);
    if (!plot.cropId) {
      throw new FarmingRuleError("FARMING_PLOT_EMPTY", "田地当前为空");
    }
    const crop = crops[plot.cropId];
    resetPlot(plot);
    addLog(
      game,
      effectiveNow,
      "plant",
      `铲除了 ${plot.index + 1} 号田的${crop.name}，本次种植未获得收成。`,
    );
  } else if (action.type === "farming_sell") {
    if (!isCropId(action.cropId, game.townId)) {
      throw new FarmingRuleError("FARMING_UNKNOWN_CROP", "作物不存在");
    }
    if (!validQuantity(action.quantity)) {
      throw new FarmingRuleError("FARMING_INVALID_QUANTITY", "出售数量需为 1 至 99");
    }
    if (game.produce[action.cropId] < action.quantity) {
      throw new FarmingRuleError("FARMING_NOT_ENOUGH_PRODUCE", "仓库库存不足");
    }
    const revenue = game.market[action.cropId].price * action.quantity;
    game.produce[action.cropId] -= action.quantity;
    game.coins += revenue;
    game.statistics.produceSold += action.quantity;
    game.statistics.coinsEarned += revenue;
    addLog(
      game,
      effectiveNow,
      "economy",
      `出售 ${action.quantity} 份${crops[action.cropId].name}，收入 ${revenue} 金币。`,
    );
  } else if (action.type === "farming_redeem_mutation") {
    if (!isCropId(action.cropId, game.townId)) {
      throw new FarmingRuleError("FARMING_UNKNOWN_CROP", "作物不存在");
    }
    if (!validQuantity(action.quantity)) {
      throw new FarmingRuleError("FARMING_INVALID_QUANTITY", "兑换数量需为 1 至 99");
    }
    if (game.mutations[action.cropId] < action.quantity) {
      throw new FarmingRuleError("FARMING_NOT_ENOUGH_MUTATIONS", "变异作物数量不足");
    }
    const crop = crops[action.cropId];
    const coinReward = game.market[action.cropId].price * 5 * action.quantity;
    const experienceReward = crop.harvestExperience * action.quantity;
    game.mutations[action.cropId] -= action.quantity;
    game.coins += coinReward;
    game.statistics.coinsEarned += coinReward;
    addExperience(game, experienceReward, effectiveNow);
    addLog(
      game,
      effectiveNow,
      "progression",
      `珍稀订单兑换 ${action.quantity} 株变异${crop.name}，获得 ${coinReward} 金币和 ${experienceReward} 经验。`,
    );
  } else if (action.type === "farming_expand_plot") {
    if (game.unlockedPlots >= FARMING_MAX_PLOTS) {
      throw new FarmingRuleError("FARMING_MAX_PLOTS", "全部土地均已开垦");
    }
    const expansion = FARMING_PLOT_EXPANSIONS.find(
      (candidate) => candidate.plotIndex === game.unlockedPlots,
    )!;
    if (game.level < expansion.requiredLevel) {
      throw new FarmingRuleError(
        "FARMING_LEVEL_REQUIRED",
        `农场达到 ${expansion.requiredLevel} 级后才能继续开垦`,
      );
    }
    if (game.coins < expansion.coinCost) {
      throw new FarmingRuleError("FARMING_NOT_ENOUGH_COINS", "开垦金币不足");
    }
    game.coins -= expansion.coinCost;
    game.unlockedPlots += 1;
    addLog(
      game,
      effectiveNow,
      "progression",
      `开垦了第 ${game.unlockedPlots} 块土地。`,
    );
  } else if (action.type === "farming_upgrade_dog") {
    const upgrade = FARMING_DOG_UPGRADES.find(
      (candidate) => candidate.level === game.dogLevel + 1,
    );
    if (!upgrade) {
      throw new FarmingRuleError("FARMING_DOG_MAX_LEVEL", "护院犬已经达到最高等级");
    }
    if (game.level < upgrade.requiredFarmLevel) {
      throw new FarmingRuleError(
        "FARMING_LEVEL_REQUIRED",
        `农场达到 ${upgrade.requiredFarmLevel} 级后才能升级护院犬`,
      );
    }
    if (game.coins < upgrade.coinCost) {
      throw new FarmingRuleError("FARMING_NOT_ENOUGH_COINS", "升级护院犬的金币不足");
    }
    game.coins -= upgrade.coinCost;
    game.dogLevel = upgrade.level;
    addLog(
      game,
      effectiveNow,
      "progression",
      `护院犬升至 ${game.dogLevel} 级，拦截偷取概率提升至 ${upgrade.blockChance}%。`,
    );
  }

  game.updatedAt = effectiveNow;
  game.revision += 1;
  return game;
}

function applyCareToPlot(
  plot: FarmingPlotState,
  care: FarmingCareKind,
  now: number,
): string {
  if (!plot.cropId) {
    throw new FarmingRuleError("FARMING_PLOT_EMPTY", "田地当前为空");
  }
  if (care === "water") {
    if (plot.watered) {
      throw new FarmingRuleError("FARMING_CARE_NOT_NEEDED", "这块田已经浇过水");
    }
    plot.watered = true;
    return "浇水";
  }
  if (care === "weed") {
    if (!cropIssueAppeared(plot.weedAt, plot.weedCleared, now)) {
      throw new FarmingRuleError("FARMING_CARE_NOT_NEEDED", "当前没有需要清除的杂草");
    }
    plot.weedCleared = true;
    return "除草";
  }
  if (!cropIssueAppeared(plot.pestAt, plot.pestCleared, now)) {
    throw new FarmingRuleError("FARMING_CARE_NOT_NEEDED", "当前没有需要处理的害虫");
  }
  plot.pestCleared = true;
  return "除虫";
}

export function applyFarmingVisitAction(
  ownerState: FarmingGameState,
  visitorState: FarmingGameState,
  action: FarmingVisitAction,
  now: number,
): FarmingVisitResult {
  if (ownerState.ownerId === visitorState.ownerId) {
    throw new FarmingRuleError("FARMING_CANNOT_VISIT_SELF", "不能访问自己的农场");
  }
  if (farmingTownId(ownerState) !== farmingTownId(visitorState)) {
    throw new FarmingRuleError(
      "FARMING_TOWN_MISMATCH",
      "只能访问同一城镇的农场",
    );
  }
  let owner = refreshFarmingGame(ownerState, now);
  let visitor = refreshFarmingGame(visitorState, now);
  owner = structuredClone(owner);
  visitor = structuredClone(visitor);
  const effectiveNow = Math.max(now, owner.updatedAt, visitor.updatedAt);
  const crops = farmingCrops(owner.townId);
  const plot = requirePlot(owner, action.plotIndex);

  let outcome: FarmingVisitResult["outcome"];
  if (action.type === "farming_help") {
    if (visitor.dailySocial.helps >= FARMING_MAX_DAILY_HELPS) {
      throw new FarmingRuleError(
        "FARMING_DAILY_HELP_LIMIT",
        "今日帮助农友的次数已达上限",
      );
    }
    const label = applyCareToPlot(plot, action.care, effectiveNow);
    visitor.dailySocial.helps += 1;
    visitor.statistics.helpsGiven += 1;
    owner.statistics.helpsReceived += 1;
    visitor.coins += 1;
    addExperience(visitor, 2, effectiveNow);
    addLog(
      owner,
      effectiveNow,
      "social",
      `${visitor.ownerName} 帮助 ${plot.index + 1} 号田${label}。`,
    );
    addLog(
      visitor,
      effectiveNow,
      "social",
      `帮助 ${owner.ownerName} 的 ${plot.index + 1} 号田${label}，获得 1 金币。`,
    );
    outcome = "helped";
  } else {
    if (visitor.dailySocial.steals >= FARMING_MAX_DAILY_STEALS) {
      throw new FarmingRuleError(
        "FARMING_DAILY_STEAL_LIMIT",
        "今日摘取农友作物的次数已达上限",
      );
    }
    if (!plot.cropId || plot.maturesAt === null || effectiveNow < plot.maturesAt) {
      throw new FarmingRuleError("FARMING_NOT_READY", "作物尚未成熟");
    }
    if (plot.stealAttempts.includes(visitor.ownerId)) {
      throw new FarmingRuleError("FARMING_ALREADY_ATTEMPTED", "你已经尝试过这块田");
    }
    const stealable = maximumStealable(plot, effectiveNow);
    if (stealable === 0 || plot.stolen >= stealable) {
      throw new FarmingRuleError("FARMING_NOTHING_TO_STEAL", "这块田已没有可摘取份额");
    }
    plot.stealAttempts.push(visitor.ownerId);
    visitor.dailySocial.steals += 1;
    const chance = dogBlockChance(owner.dogLevel);
    const blocked = hashText(
      `${owner.seed}:dog:${plot.index}:${plot.cycle}:${visitor.ownerId}`,
    ) % 100 < chance;
    if (blocked) {
      const penalty = Math.min(visitor.coins, 3);
      visitor.coins -= penalty;
      owner.coins += penalty;
      owner.statistics.dogBlocks += 1;
      addLog(
        owner,
        effectiveNow,
        "social",
        `护院犬拦住了 ${visitor.ownerName}，追回 ${penalty} 金币。`,
      );
      addLog(
        visitor,
        effectiveNow,
        "social",
        `摘取失败，被 ${owner.ownerName} 的护院犬拦住并损失 ${penalty} 金币。`,
      );
      outcome = "blocked";
    } else {
      plot.stolen += 1;
      plot.stolenBy.push(visitor.ownerId);
      visitor.produce[plot.cropId] += 1;
      visitor.statistics.stealsSucceeded += 1;
      owner.statistics.stolenFrom += 1;
      addExperience(visitor, 1, effectiveNow);
      addLog(
        owner,
        effectiveNow,
        "social",
        `${visitor.ownerName} 从 ${plot.index + 1} 号田摘走 1 份${crops[plot.cropId].name}。`,
      );
      addLog(
        visitor,
        effectiveNow,
        "social",
        `从 ${owner.ownerName} 的 ${plot.index + 1} 号田摘到 1 份${crops[plot.cropId].name}。`,
      );
      outcome = "stolen";
    }
  }

  owner.updatedAt = effectiveNow;
  visitor.updatedAt = effectiveNow;
  owner.revision += 1;
  visitor.revision += 1;
  return { owner, visitor, outcome };
}

function plotView(
  game: FarmingGameState,
  plot: FarmingPlotState,
  now: number,
): FarmingPlotView {
  const ready = plot.maturesAt !== null && now >= plot.maturesAt;
  const progress = plot.plantedAt === null || plot.maturesAt === null
    ? 0
    : Math.max(
        0,
        Math.min(
          1,
          (now - plot.plantedAt) / Math.max(1, plot.maturesAt - plot.plantedAt),
        ),
      );
  return {
    ...structuredClone(plot),
    unlocked: plot.index < game.unlockedPlots,
    ready,
    progress,
    hasWeeds: cropIssueAppeared(plot.weedAt, plot.weedCleared, now),
    hasPests: cropIssueAppeared(plot.pestAt, plot.pestCleared, now),
    estimatedYield: plotYield(plot, now),
    maximumStealable: maximumStealable(plot, now),
  };
}

export function getFarmingGameView(
  state: FarmingGameState,
  viewerId: string,
  now: number,
): FarmingGameView {
  const game = refreshFarmingGame(state, now);
  const effectiveNow = Math.max(now, game.updatedAt);
  const isOwner = game.ownerId === viewerId;
  const currentThreshold = FARMING_LEVEL_EXPERIENCE[game.level - 1] ?? 0;
  const nextThreshold = FARMING_LEVEL_EXPERIENCE[game.level] ?? null;
  return {
    kind: "farm",
    version: FARMING_STATE_VERSION,
    townId: game.townId,
    townDefinition: structuredClone(getTownDefinition(game.townId)),
    revision: game.revision,
    serverTime: effectiveNow,
    ownerId: game.ownerId,
    ownerName: game.ownerName,
    isOwner,
    createdAt: game.createdAt,
    level: game.level,
    experience: game.experience,
    currentLevelExperience: currentThreshold,
    nextLevelExperience: nextThreshold,
    unlockedPlots: game.unlockedPlots,
    dogLevel: game.dogLevel,
    dogBlockChance: dogBlockChance(game.dogLevel),
    crops: structuredClone(farmingCrops(game.townId)),
    inventory: isOwner
      ? {
          coins: game.coins,
          seeds: structuredClone(game.seeds),
          produce: structuredClone(game.produce),
          mutations: structuredClone(game.mutations),
        }
      : null,
    discoveredCrops: structuredClone(game.discoveredCrops),
    plots: game.plots.map((plot) => plotView(game, plot, effectiveNow)),
    market: structuredClone(game.market),
    marketEvent: structuredClone(game.marketEvent),
    nextExpansion: FARMING_PLOT_EXPANSIONS.find(
      (candidate) => candidate.plotIndex === game.unlockedPlots,
    ) ?? null,
    nextDogUpgrade: FARMING_DOG_UPGRADES.find(
      (candidate) => candidate.level === game.dogLevel + 1,
    ) ?? null,
    dailySocial: isOwner ? structuredClone(game.dailySocial) : null,
    statistics: isOwner ? structuredClone(game.statistics) : null,
    logs: isOwner
      ? structuredClone(game.logs)
      : structuredClone(game.logs.filter((entry) => entry.kind === "progression").slice(-5)),
  };
}

export function getFarmingNeighborSummary(
  state: FarmingGameState,
  viewerId: string,
  now: number,
): FarmingNeighborSummary | null {
  if (state.ownerId === viewerId) return null;
  const game = refreshFarmingGame(state, now);
  const views = game.plots
    .slice(0, game.unlockedPlots)
    .map((plot) => plotView(game, plot, now));
  return {
    ownerId: game.ownerId,
    ownerName: game.ownerName,
    level: game.level,
    unlockedPlots: game.unlockedPlots,
    dogLevel: game.dogLevel,
    readyPlots: views.filter((plot) => plot.ready).length,
    careNeededPlots: views.filter((plot) =>
      plot.cropId && (!plot.watered || plot.hasWeeds || plot.hasPests)
    ).length,
    stealablePlots: views.filter((plot) =>
      plot.ready && plot.stolen < plot.maximumStealable &&
      !plot.stealAttempts.includes(viewerId)
    ).length,
    updatedAt: game.updatedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function validCounts(
  value: unknown,
  townId: EstateTownId,
): value is FarmingCropCounts {
  const townCropIds = farmingCropIds(townId);
  const allowedIds = new Set(townCropIds as readonly string[]);
  return isRecord(value) &&
    Object.keys(value).length === townCropIds.length &&
    Object.keys(value).every((cropId) => allowedIds.has(cropId)) &&
    townCropIds.every((cropId) =>
      isNonNegativeInteger(value[cropId])
    );
}

export function assertRestorableFarmingGameState(
  value: unknown,
): asserts value is FarmingGameState {
  if (
    !isRecord(value) ||
    value.kind !== "farm" ||
    value.version !== FARMING_STATE_VERSION
  ) {
    throw new Error("实时农场存档版本无效");
  }
  if (value.townId !== undefined && !isEstateTownId(value.townId)) {
    throw new Error("实时农场城镇无效");
  }
  const townId = isEstateTownId(value.townId) ? value.townId : "greenvale";
  if (
    typeof value.seed !== "string" ||
    value.seed.length < 1 ||
    value.seed.length > 128 ||
    !isNonNegativeInteger(value.revision) ||
    typeof value.ownerId !== "string" ||
    value.ownerId.length < 1 ||
    typeof value.ownerName !== "string" ||
    value.ownerName.length < 1 ||
    value.ownerName.length > 80 ||
    !isNonNegativeInteger(value.createdAt) ||
    !isNonNegativeInteger(value.updatedAt) ||
    Number(value.updatedAt) < Number(value.createdAt) ||
    !isNonNegativeInteger(value.coins) ||
    !isNonNegativeInteger(value.experience) ||
    !Number.isSafeInteger(value.level) ||
    value.level !== levelForExperience(Number(value.experience)) ||
    !Number.isSafeInteger(value.unlockedPlots) ||
    Number(value.unlockedPlots) < FARMING_STARTING_PLOTS ||
    Number(value.unlockedPlots) > FARMING_MAX_PLOTS ||
    !Number.isSafeInteger(value.dogLevel) ||
    Number(value.dogLevel) < 0 ||
    Number(value.dogLevel) > FARMING_DOG_UPGRADES.length ||
    !validCounts(value.seeds, townId) ||
    !validCounts(value.produce, townId) ||
    !validCounts(value.mutations, townId) ||
    !Array.isArray(value.discoveredCrops) ||
    value.discoveredCrops.some((cropId) => !isCropId(cropId, townId)) ||
    new Set(value.discoveredCrops).size !== value.discoveredCrops.length
  ) {
    throw new Error("实时农场主状态无效");
  }
  if (
    !Array.isArray(value.plots) ||
    value.plots.length !== FARMING_MAX_PLOTS
  ) {
    throw new Error("实时农场田地状态无效");
  }
  for (const [index, plot] of value.plots.entries()) {
    if (
      !isRecord(plot) ||
      plot.index !== index ||
      !isNonNegativeInteger(plot.cycle) ||
      (plot.cropId !== null && !isCropId(plot.cropId, townId)) ||
      typeof plot.watered !== "boolean" ||
      typeof plot.weedCleared !== "boolean" ||
      typeof plot.pestCleared !== "boolean" ||
      !isNonNegativeInteger(plot.stolen) ||
      !Array.isArray(plot.stealAttempts) ||
      plot.stealAttempts.some((id) => typeof id !== "string" || id.length === 0) ||
      new Set(plot.stealAttempts).size !== plot.stealAttempts.length ||
      !Array.isArray(plot.stolenBy) ||
      plot.stolenBy.some((id) => typeof id !== "string" || id.length === 0) ||
      new Set(plot.stolenBy).size !== plot.stolenBy.length ||
      (
        plot.productionModifierPercent !== undefined &&
        (
          !Number.isSafeInteger(plot.productionModifierPercent) ||
          Number(plot.productionModifierPercent) < -100 ||
          Number(plot.productionModifierPercent) > 100
        )
      ) ||
      (
        plot.durationModifierPercent !== undefined &&
        (
          !Number.isSafeInteger(plot.durationModifierPercent) ||
          Number(plot.durationModifierPercent) < -100 ||
          Number(plot.durationModifierPercent) > 100
        )
      ) ||
      (
        plot.productionModifierLabel !== undefined &&
        (
          typeof plot.productionModifierLabel !== "string" ||
          plot.productionModifierLabel.length > 160
        )
      )
    ) {
      throw new Error("实时农场田地状态无效");
    }
    if (plot.cropId === null) {
      if (
        plot.plantedAt !== null ||
        plot.maturesAt !== null ||
        plot.watered ||
        plot.weedAt !== null ||
        plot.pestAt !== null ||
        plot.weedCleared ||
        plot.pestCleared ||
        plot.stolen !== 0 ||
        plot.stealAttempts.length > 0 ||
        plot.stolenBy.length > 0
      ) {
        throw new Error("实时农场空田状态无效");
      }
    } else if (
      !isNonNegativeInteger(plot.plantedAt) ||
      !isNonNegativeInteger(plot.maturesAt) ||
      Number(plot.maturesAt) <= Number(plot.plantedAt) ||
      (plot.weedAt !== null && !isNonNegativeInteger(plot.weedAt)) ||
      (plot.pestAt !== null && !isNonNegativeInteger(plot.pestAt)) ||
      Number(plot.stolen) > maximumStealable(
        plot as unknown as FarmingPlotState,
        Number(plot.maturesAt),
      )
    ) {
      throw new Error("实时农场作物状态无效");
    }
  }
  if (
    typeof value.marketDay !== "string" ||
    !isRecord(value.market) ||
    Object.keys(value.market).length !== farmingCropIds(townId).length
  ) {
    throw new Error("实时农场市场状态无效");
  }
  for (const cropId of farmingCropIds(townId)) {
    const quote = value.market[cropId];
    const crop = ALL_FARMING_CROPS[cropId];
    if (
      !isRecord(quote) ||
      quote.cropId !== cropId ||
      !Number.isSafeInteger(quote.price) ||
      Number(quote.price) < crop.minimumPrice ||
      Number(quote.price) > crop.maximumPrice ||
      !Number.isSafeInteger(quote.previousPrice) ||
      (quote.trend !== -1 && quote.trend !== 0 && quote.trend !== 1)
    ) {
      throw new Error("实时农场市场报价无效");
    }
  }
  if (
    !isRecord(value.marketEvent) ||
    typeof value.marketEvent.title !== "string" ||
    typeof value.marketEvent.summary !== "string" ||
    !["neutral", "surge", "crash", "volatile"].includes(String(value.marketEvent.tone)) ||
    (value.marketEvent.source !== "rules" && value.marketEvent.source !== "llm") ||
    !isRecord(value.dailySocial) ||
    typeof value.dailySocial.dayKey !== "string" ||
    !isNonNegativeInteger(value.dailySocial.helps) ||
    Number(value.dailySocial.helps) > FARMING_MAX_DAILY_HELPS ||
    !isNonNegativeInteger(value.dailySocial.steals) ||
    Number(value.dailySocial.steals) > FARMING_MAX_DAILY_STEALS ||
    !isRecord(value.statistics) ||
    Object.values(value.statistics).some((entry) => !isNonNegativeInteger(entry)) ||
    !Array.isArray(value.logs) ||
    value.logs.length > FARMING_MAX_LOGS
  ) {
    throw new Error("实时农场附加状态无效");
  }
}
