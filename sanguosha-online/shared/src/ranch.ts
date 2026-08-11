import {
  type FarmingCropCounts,
  type FarmingCropId,
} from "./farming.js";
import {
  FROSTPEAK_ANIMAL_IDS,
  FROSTPEAK_PRODUCT_IDS,
  FROSTPEAK_RANCH_ANIMALS,
} from "./towns/frostpeak.js";
import {
  GREENVALE_ANIMAL_IDS,
  GREENVALE_PRODUCT_IDS,
} from "./towns/greenvale.js";
import {
  getTownDefinition,
  isEstateTownId,
  type EstateTownId,
  type TownDefinition,
} from "./towns/registry.js";
import {
  applyAccumulatedProductionModifier,
  applyDiscreteProductionModifier,
  applyPriceModifier,
} from "./production-modifier.js";

export const RANCH_STATE_VERSION = 2 as const;
export const RANCH_REQUIRED_FARM_LEVEL = 1;
export const RANCH_STARTING_PENS = 3;
export const RANCH_MAX_PENS = 12;
export const RANCH_MAX_LOGS = 80;
export const RANCH_MAX_DAILY_HELPS = 20;
export const RANCH_MAX_DAILY_COLLECTS = 10;

/** @deprecated Greenvale-only compatibility catalog. Prefer a state's town catalog. */
export const RANCH_ANIMAL_IDS = GREENVALE_ANIMAL_IDS;
export const ALL_RANCH_ANIMAL_IDS = [
  ...GREENVALE_ANIMAL_IDS,
  ...FROSTPEAK_ANIMAL_IDS,
] as const;
export type RanchAnimalId = (typeof ALL_RANCH_ANIMAL_IDS)[number];

/** @deprecated Greenvale-only compatibility catalog. Prefer a state's town catalog. */
export const RANCH_PRODUCT_IDS = GREENVALE_PRODUCT_IDS;
export const ALL_RANCH_PRODUCT_IDS = [
  ...GREENVALE_PRODUCT_IDS,
  ...FROSTPEAK_PRODUCT_IDS,
] as const;
export type RanchProductId = (typeof ALL_RANCH_PRODUCT_IDS)[number];
export type RanchProductCounts = Record<RanchProductId, number>;

export interface RanchAnimalDefinition {
  readonly id: RanchAnimalId;
  readonly name: string;
  /** Renewable animals keep their pen after collection; meat animals leave it after slaughter. */
  readonly productionKind?: "renewable" | "meat";
  readonly productId: RanchProductId;
  readonly productName: string;
  readonly requiredFarmLevel: number;
  readonly requiredRanchLevel: number;
  readonly purchaseCost: number;
  readonly resalePrice: number;
  readonly feedCropId: FarmingCropId;
  readonly feedAmount: number;
  readonly careCost: number;
  readonly productionSeconds: number;
  readonly yield: number;
  readonly productPrice: number;
  readonly collectExperience: number;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;

export const RANCH_ANIMALS: Readonly<Record<
  (typeof GREENVALE_ANIMAL_IDS)[number],
  RanchAnimalDefinition
>> = {
  chicken: {
    id: "chicken",
    name: "母鸡",
    productId: "egg",
    productName: "鸡蛋",
    requiredFarmLevel: 1,
    requiredRanchLevel: 1,
    purchaseCost: 180,
    resalePrice: 90,
    feedCropId: "wheat",
    feedAmount: 1,
    careCost: 5,
    productionSeconds: 10 * MINUTE,
    yield: 3,
    productPrice: 18,
    collectExperience: 14,
  },
  duck: {
    id: "duck",
    name: "鸭子",
    productId: "duck_egg",
    productName: "鸭蛋",
    requiredFarmLevel: 4,
    requiredRanchLevel: 2,
    purchaseCost: 320,
    resalePrice: 160,
    feedCropId: "corn",
    feedAmount: 1,
    careCost: 8,
    productionSeconds: 20 * MINUTE,
    yield: 3,
    productPrice: 30,
    collectExperience: 20,
  },
  rabbit: {
    id: "rabbit",
    name: "安哥拉兔",
    productId: "rabbit_fur",
    productName: "兔绒",
    requiredFarmLevel: 5,
    requiredRanchLevel: 3,
    purchaseCost: 480,
    resalePrice: 240,
    feedCropId: "carrot",
    feedAmount: 1,
    careCost: 12,
    productionSeconds: 30 * MINUTE,
    yield: 3,
    productPrice: 46,
    collectExperience: 27,
  },
  sheep: {
    id: "sheep",
    name: "绵羊",
    productId: "wool",
    productName: "羊毛",
    requiredFarmLevel: 6,
    requiredRanchLevel: 4,
    purchaseCost: 920,
    resalePrice: 460,
    feedCropId: "wheat",
    feedAmount: 2,
    careCost: 21,
    productionSeconds: HOUR,
    yield: 4,
    productPrice: 65,
    collectExperience: 36,
  },
  cow: {
    id: "cow",
    name: "奶牛",
    productId: "milk",
    productName: "牛奶",
    requiredFarmLevel: 8,
    requiredRanchLevel: 6,
    purchaseCost: 1_500,
    resalePrice: 750,
    feedCropId: "corn",
    feedAmount: 2,
    careCost: 36,
    productionSeconds: 2 * HOUR,
    yield: 4,
    productPrice: 110,
    collectExperience: 50,
  },
  goat: {
    id: "goat",
    name: "奶山羊",
    productId: "goat_milk",
    productName: "羊奶",
    requiredFarmLevel: 10,
    requiredRanchLevel: 8,
    purchaseCost: 3_000,
    resalePrice: 1_500,
    feedCropId: "carrot",
    feedAmount: 2,
    careCost: 66,
    productionSeconds: 3 * HOUR,
    yield: 5,
    productPrice: 165,
    collectExperience: 68,
  },
  broiler_chicken: {
    id: "broiler_chicken",
    name: "肉鸡",
    productionKind: "meat",
    productId: "raw_chicken",
    productName: "整鸡原料",
    requiredFarmLevel: 3,
    requiredRanchLevel: 2,
    purchaseCost: 240,
    resalePrice: 100,
    feedCropId: "wheat",
    feedAmount: 2,
    careCost: 8,
    productionSeconds: 20 * MINUTE,
    yield: 3,
    productPrice: 35,
    collectExperience: 18,
  },
  pig: {
    id: "pig",
    name: "肉猪",
    productionKind: "meat",
    productId: "raw_pork",
    productName: "猪肉原料",
    requiredFarmLevel: 6,
    requiredRanchLevel: 4,
    purchaseCost: 700,
    resalePrice: 300,
    feedCropId: "soybean",
    feedAmount: 3,
    careCost: 20,
    productionSeconds: 90 * MINUTE,
    yield: 4,
    productPrice: 75,
    collectExperience: 35,
  },
};

const ALL_RANCH_ANIMALS: Readonly<
  Record<RanchAnimalId, RanchAnimalDefinition>
> = {
  ...RANCH_ANIMALS,
  ...FROSTPEAK_RANCH_ANIMALS,
} as Readonly<Record<RanchAnimalId, RanchAnimalDefinition>>;

function ranchAnimalIds(townId: EstateTownId): readonly RanchAnimalId[] {
  return getTownDefinition(townId).content.animalIds as readonly RanchAnimalId[];
}

function ranchProductIds(townId: EstateTownId): readonly RanchProductId[] {
  return getTownDefinition(townId).content.productIds as readonly RanchProductId[];
}

function ranchAnimals(
  townId: EstateTownId,
): Readonly<Record<RanchAnimalId, RanchAnimalDefinition>> {
  return Object.fromEntries(
    ranchAnimalIds(townId).map((animalId) => [
      animalId,
      ALL_RANCH_ANIMALS[animalId],
    ]),
  ) as Readonly<Record<RanchAnimalId, RanchAnimalDefinition>>;
}

function ranchTownId(state: { readonly townId?: unknown }): EstateTownId {
  return isEstateTownId(state.townId) ? state.townId : "greenvale";
}

export const RANCH_LEVEL_EXPERIENCE = [
  0,
  45,
  120,
  230,
  380,
  580,
  850,
  1_200,
  1_650,
  2_200,
  2_850,
  3_600,
  4_450,
  5_400,
] as const;

export interface RanchPenExpansion {
  readonly penIndex: number;
  readonly requiredFarmLevel: number;
  readonly requiredRanchLevel: number;
  readonly coinCost: number;
}

export const RANCH_PEN_EXPANSIONS: readonly RanchPenExpansion[] = [
  { penIndex: 3, requiredFarmLevel: 4, requiredRanchLevel: 2, coinCost: 280 },
  { penIndex: 4, requiredFarmLevel: 5, requiredRanchLevel: 3, coinCost: 520 },
  { penIndex: 5, requiredFarmLevel: 7, requiredRanchLevel: 5, coinCost: 900 },
  { penIndex: 6, requiredFarmLevel: 9, requiredRanchLevel: 7, coinCost: 1_450 },
  { penIndex: 7, requiredFarmLevel: 11, requiredRanchLevel: 9, coinCost: 2_300 },
  { penIndex: 8, requiredFarmLevel: 13, requiredRanchLevel: 10, coinCost: 3_300 },
  { penIndex: 9, requiredFarmLevel: 15, requiredRanchLevel: 12, coinCost: 4_600 },
  { penIndex: 10, requiredFarmLevel: 17, requiredRanchLevel: 13, coinCost: 6_200 },
  { penIndex: 11, requiredFarmLevel: 19, requiredRanchLevel: 14, coinCost: 8_100 },
];

export interface RanchPenState {
  readonly index: number;
  cycle: number;
  animalId: RanchAnimalId | null;
  fedAt: number | null;
  producesAt: number | null;
  messAt: number | null;
  messCleaned: boolean;
  taken: number;
  collectAttempts: string[];
  takenBy: string[];
  /** Captured at feeding time for deterministic weather/disaster production. */
  productionModifierPercent?: number;
  durationModifierPercent?: number;
  productionModifierLabel?: string;
}

export interface RanchDailySocial {
  dayKey: string;
  helps: number;
  collects: number;
}

export interface RanchStatistics {
  animalsPurchased: number;
  feedings: number;
  productsCollected: number;
  productsSold: number;
  coinsEarned: number;
  cleanings: number;
  helpsGiven: number;
  helpsReceived: number;
  neighborCollections: number;
  collectedFrom: number;
  dogBlocks: number;
}

export interface RanchLogEntry {
  readonly id: number;
  readonly at: number;
  readonly kind:
    | "system"
    | "economy"
    | "animal"
    | "care"
    | "collect"
    | "social"
    | "progression";
  readonly text: string;
}

export interface RanchGameState {
  readonly kind: "ranch";
  readonly version: typeof RANCH_STATE_VERSION;
  townId: EstateTownId;
  readonly seed: string;
  revision: number;
  readonly ownerId: string;
  ownerName: string;
  readonly createdAt: number;
  updatedAt: number;
  experience: number;
  level: number;
  unlockedPens: number;
  /** Backend-only carry used to settle fractional yield across collections. */
  productionRemainder: number;
  products: RanchProductCounts;
  pens: RanchPenState[];
  dailySocial: RanchDailySocial;
  statistics: RanchStatistics;
  logs: RanchLogEntry[];
}

export interface RanchEconomyState {
  farmRevision: number;
  farmLevel: number;
  coins: number;
  produce: FarmingCropCounts;
}

export type RanchAction =
  | {
      readonly type: "ranch_buy_animal";
      readonly animalId: RanchAnimalId;
      readonly penIndex: number;
    }
  | {
      readonly type: "ranch_feed";
      readonly penIndex: number;
    }
  | {
      readonly type: "ranch_move_animal";
      readonly fromPenIndex: number;
      readonly toPenIndex: number;
    }
  | {
      readonly type: "ranch_sell_animal";
      readonly penIndex: number;
    }
  | {
      readonly type: "ranch_clean";
      readonly penIndex: number;
    }
  | {
      readonly type: "ranch_clean_all";
    }
  | {
      readonly type: "ranch_collect";
      readonly penIndex: number;
    }
  | {
      readonly type: "ranch_slaughter";
      readonly penIndex: number;
    }
  | {
      readonly type: "ranch_collect_all";
    }
  | {
      readonly type: "ranch_sell";
      readonly productId: RanchProductId;
      readonly quantity: number;
    }
  | {
      readonly type: "ranch_expand_pen";
    };

export type RanchVisitAction =
  | {
      readonly type: "ranch_help";
      readonly penIndex: number;
    }
  | {
      readonly type: "ranch_neighbor_collect";
      readonly penIndex: number;
    };

export interface RanchPenView extends RanchPenState {
  readonly unlocked: boolean;
  readonly ready: boolean;
  readonly progress: number;
  readonly hasMess: boolean;
  readonly estimatedYield: number;
  readonly maximumNeighborCollectable: number;
}

export interface RanchGameView {
  readonly kind: "ranch";
  readonly version: typeof RANCH_STATE_VERSION;
  readonly townId: EstateTownId;
  readonly townDefinition: TownDefinition;
  readonly revision: number;
  readonly serverTime: number;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly isOwner: boolean;
  readonly createdAt: number;
  readonly unlocked: boolean;
  readonly requiredFarmLevel: number;
  readonly farmLevel: number;
  readonly farmRevision: number;
  readonly dogLevel: number;
  readonly dogBlockChance: number;
  readonly level: number;
  readonly experience: number;
  readonly currentLevelExperience: number;
  readonly nextLevelExperience: number | null;
  readonly unlockedPens: number;
  readonly productionRule: import("./farming.js").EstateProductionRule;
  readonly animals: Readonly<Record<RanchAnimalId, RanchAnimalDefinition>>;
  readonly economy: {
    readonly coins: number;
    readonly produce: FarmingCropCounts;
    readonly products: RanchProductCounts;
  } | null;
  readonly pens: RanchPenView[];
  readonly nextExpansion: RanchPenExpansion | null;
  readonly dailySocial: RanchDailySocial | null;
  readonly statistics: RanchStatistics | null;
  readonly logs: RanchLogEntry[];
}

export interface RanchNeighborSummary {
  readonly ownerId: string;
  readonly ownerName: string;
  readonly level: number;
  readonly unlockedPens: number;
  readonly readyPens: number;
  readonly careNeededPens: number;
  readonly collectiblePens: number;
  readonly updatedAt: number;
}

export interface RanchActionResult {
  readonly ranch: RanchGameState;
  readonly economy: RanchEconomyState;
  readonly economyChanged: boolean;
}

export interface RanchVisitResult {
  readonly owner: RanchGameState;
  readonly visitor: RanchGameState;
  readonly outcome: "helped" | "collected" | "blocked";
}

export type RanchRuleErrorCode =
  | "RANCH_INVALID_TIME"
  | "RANCH_LOCKED"
  | "RANCH_INVALID_QUANTITY"
  | "RANCH_UNKNOWN_ANIMAL"
  | "RANCH_UNKNOWN_PRODUCT"
  | "RANCH_ANIMAL_LOCKED"
  | "RANCH_NOT_ENOUGH_COINS"
  | "RANCH_NOT_ENOUGH_FEED"
  | "RANCH_NOT_ENOUGH_PRODUCTS"
  | "RANCH_INVALID_PEN"
  | "RANCH_PEN_LOCKED"
  | "RANCH_PEN_OCCUPIED"
  | "RANCH_PEN_EMPTY"
  | "RANCH_ANIMAL_BUSY"
  | "RANCH_INVALID_MOVE"
  | "RANCH_ALREADY_FED"
  | "RANCH_NOT_FED"
  | "RANCH_CARE_NOT_NEEDED"
  | "RANCH_NOT_READY"
  | "RANCH_SLAUGHTER_REQUIRED"
  | "RANCH_MAX_PENS"
  | "RANCH_LEVEL_REQUIRED"
  | "RANCH_CANNOT_VISIT_SELF"
  | "RANCH_TOWN_MISMATCH"
  | "RANCH_DAILY_HELP_LIMIT"
  | "RANCH_DAILY_COLLECT_LIMIT"
  | "RANCH_ALREADY_ATTEMPTED"
  | "RANCH_NOTHING_TO_COLLECT";

export class RanchRuleError extends Error {
  constructor(
    readonly code: RanchRuleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RanchRuleError";
  }
}

function productCounts(
  initial = 0,
  townId: EstateTownId = "greenvale",
): RanchProductCounts {
  return Object.fromEntries(
    ranchProductIds(townId).map((productId) => [productId, initial]),
  ) as RanchProductCounts;
}

function emptyStatistics(): RanchStatistics {
  return {
    animalsPurchased: 0,
    feedings: 0,
    productsCollected: 0,
    productsSold: 0,
    coinsEarned: 0,
    cleanings: 0,
    helpsGiven: 0,
    helpsReceived: 0,
    neighborCollections: 0,
    collectedFrom: 0,
    dogBlocks: 0,
  };
}

function emptyPen(index: number): RanchPenState {
  return {
    index,
    cycle: 0,
    animalId: null,
    fedAt: null,
    producesAt: null,
    messAt: null,
    messCleaned: false,
    taken: 0,
    collectAttempts: [],
    takenBy: [],
    productionModifierPercent: 0,
    durationModifierPercent: 0,
    productionModifierLabel: "常态生产",
  };
}

function resetProduction(pen: RanchPenState): void {
  pen.fedAt = null;
  pen.producesAt = null;
  pen.messAt = null;
  pen.messCleaned = false;
  pen.taken = 0;
  pen.collectAttempts = [];
  pen.takenBy = [];
  pen.productionModifierPercent = 0;
  pen.durationModifierPercent = 0;
  pen.productionModifierLabel = "常态生产";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isAnimalId(
  value: unknown,
  townId: EstateTownId = "greenvale",
): value is RanchAnimalId {
  return typeof value === "string" &&
    (ranchAnimalIds(townId) as readonly string[]).includes(value);
}

function isProductId(
  value: unknown,
  townId: EstateTownId = "greenvale",
): value is RanchProductId {
  return typeof value === "string" &&
    (ranchProductIds(townId) as readonly string[]).includes(value);
}

function assertTime(now: number): void {
  if (!Number.isSafeInteger(now) || now < 0 || now > 8_640_000_000_000_000) {
    throw new RanchRuleError("RANCH_INVALID_TIME", "服务器时间无效");
  }
}

function dayKey(now: number): string {
  assertTime(now);
  return new Date(now + 8 * 60 * 60 * 1_000).toISOString().slice(0, 10);
}

function levelForExperience(experience: number): number {
  let level = 1;
  for (const [index, threshold] of RANCH_LEVEL_EXPERIENCE.entries()) {
    if (experience >= threshold) level = index + 1;
  }
  return Math.min(level, RANCH_LEVEL_EXPERIENCE.length);
}

function addLog(
  game: RanchGameState,
  at: number,
  kind: RanchLogEntry["kind"],
  text: string,
): void {
  game.logs.push({
    id: Math.max(
      -1,
      ...game.logs.map((entry) => entry.id).filter(Number.isSafeInteger),
    ) + 1,
    at,
    kind,
    text,
  });
  if (game.logs.length > RANCH_MAX_LOGS) {
    game.logs.splice(0, game.logs.length - RANCH_MAX_LOGS);
  }
}

function addExperience(game: RanchGameState, amount: number, now: number): void {
  if (amount <= 0) return;
  const previousLevel = game.level;
  game.experience += amount;
  game.level = levelForExperience(game.experience);
  if (game.level > previousLevel) {
    addLog(
      game,
      now,
      "progression",
      `牧场升至 ${game.level} 级，新的动物或畜舍已经解锁。`,
    );
  }
}

function validQuantity(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= 99;
}

function requireUnlockedRanch(economy: RanchEconomyState): void {
  if (economy.farmLevel < RANCH_REQUIRED_FARM_LEVEL) {
    throw new RanchRuleError(
      "RANCH_LOCKED",
      `农场达到 ${RANCH_REQUIRED_FARM_LEVEL} 级后开放牧场`,
    );
  }
}

function requirePen(
  game: RanchGameState,
  penIndex: number,
  requireUnlocked = true,
): RanchPenState {
  if (
    !Number.isSafeInteger(penIndex) ||
    penIndex < 0 ||
    penIndex >= RANCH_MAX_PENS
  ) {
    throw new RanchRuleError("RANCH_INVALID_PEN", "畜舍编号无效");
  }
  if (requireUnlocked && penIndex >= game.unlockedPens) {
    throw new RanchRuleError("RANCH_PEN_LOCKED", "这间畜舍尚未扩建");
  }
  return game.pens[penIndex]!;
}

function messAppeared(pen: RanchPenState, now: number): boolean {
  return pen.messAt !== null && pen.messAt <= now && !pen.messCleaned;
}

function penYield(pen: RanchPenState, now: number): number {
  if (!pen.animalId || pen.producesAt === null) return 0;
  const animal = ALL_RANCH_ANIMALS[pen.animalId];
  if ((animal.productionKind ?? "renewable") === "meat") return 0;
  const base = animal.yield;
  return applyDiscreteProductionModifier(
    Math.max(1, base - (messAppeared(pen, now) ? 1 : 0)),
    pen.productionModifierPercent ?? 0,
  );
}

function maximumNeighborCollectable(pen: RanchPenState, now: number): number {
  return penYield(pen, now) >= 3 ? 1 : 0;
}

function hashText(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function dogBlockChance(level: number): number {
  return [0, 15, 30, 45][level] ?? 45;
}

export function createRanchGame(input: {
  readonly ownerId: string;
  readonly ownerName: string;
  readonly seed: string;
  readonly now: number;
  readonly townId?: EstateTownId;
}): RanchGameState {
  assertTime(input.now);
  if (
    input.ownerId.trim().length === 0 ||
    input.ownerName.trim().length === 0 ||
    input.ownerName.length > 80
  ) {
    throw new Error("牧场玩家资料无效");
  }
  if (input.seed.length < 1 || input.seed.length > 128) {
    throw new Error("牧场随机种子无效");
  }
  const townId = input.townId ?? "greenvale";
  return {
    kind: "ranch",
    version: RANCH_STATE_VERSION,
    townId,
    seed: input.seed,
    revision: 0,
    ownerId: input.ownerId,
    ownerName: input.ownerName.trim(),
    createdAt: input.now,
    updatedAt: input.now,
    experience: 0,
    level: 1,
    unlockedPens: RANCH_STARTING_PENS,
    productionRemainder: 0,
    products: productCounts(0, townId),
    pens: Array.from({ length: RANCH_MAX_PENS }, (_, index) => emptyPen(index)),
    dailySocial: { dayKey: dayKey(input.now), helps: 0, collects: 0 },
    statistics: emptyStatistics(),
    logs: [{
      id: 0,
      at: input.now,
      kind: "system",
      text: `长期牧场已经建立；农场达到 ${RANCH_REQUIRED_FARM_LEVEL} 级后即可购入第一只动物。`,
    }],
  };
}

/**
 * Expands v1 ranch saves before v2 validation. Existing pens (including
 * animals and in-progress production) are preserved exactly by index.
 */
export function migrateRanchCapacityState(value: unknown): RanchGameState {
  if (!isRecord(value) || value.kind !== "ranch") {
    throw new Error("牧场存档结构无效");
  }
  if (
    ![1, RANCH_STATE_VERSION].includes(Number(value.version)) ||
    !Array.isArray(value.pens) ||
    ![8, RANCH_MAX_PENS].includes(value.pens.length)
  ) {
    throw new Error("牧场存档容量迁移版本无效");
  }

  const migrated = structuredClone(value) as Omit<
    RanchGameState,
    "version" | "pens"
  > & {
    version: number;
    pens: RanchPenState[];
  };
  if (!isNonNegativeInteger(migrated.revision)) {
    throw new Error("牧场存档修订号无效");
  }
  migrated.version = RANCH_STATE_VERSION;
  if (isNonNegativeInteger(migrated.experience)) {
    // v1 persisted the old level-10 cap even when additional experience had
    // already accumulated. Recompute it against the appended thresholds.
    migrated.level = levelForExperience(migrated.experience);
  }
  if (migrated.pens.length < RANCH_MAX_PENS) {
    const firstNewIndex = migrated.pens.length;
    migrated.pens.push(
      ...Array.from(
        { length: RANCH_MAX_PENS - firstNewIndex },
        (_, index) => emptyPen(index + firstNewIndex),
      ),
    );
  }
  const townId = isEstateTownId(migrated.townId)
    ? migrated.townId
    : "greenvale";
  const previousProducts: Record<string, unknown> = isRecord(migrated.products)
    ? migrated.products
    : {};
  migrated.products = Object.fromEntries(
    ranchProductIds(townId).map((productId) => [
      productId,
      isNonNegativeInteger(previousProducts[productId])
        ? previousProducts[productId]
        : 0,
    ]),
  ) as RanchProductCounts;
  assertRestorableRanchGameState(migrated);
  return migrated;
}

export function refreshRanchGame(
  state: RanchGameState,
  now: number,
): RanchGameState {
  assertTime(now);
  const game = structuredClone(state);
  normalizeLogIds(game);
  const effectiveNow = Math.max(now, game.updatedAt);
  const key = dayKey(effectiveNow);
  let changed = false;
  if (!isEstateTownId(game.townId)) {
    game.townId = "greenvale";
    changed = true;
  }
  if (!Number.isFinite(game.productionRemainder)) {
    game.productionRemainder = 0;
    changed = true;
  }
  if (game.dailySocial.dayKey !== key) {
    game.dailySocial = { dayKey: key, helps: 0, collects: 0 };
    changed = true;
  }
  if (changed) {
    game.updatedAt = effectiveNow;
    game.revision += 1;
  }
  return game;
}

function normalizeLogIds(game: RanchGameState): void {
  const used = new Set<number>();
  let nextId = Math.max(
    -1,
    ...game.logs.map((entry) => entry.id).filter(Number.isSafeInteger),
  );
  game.logs = game.logs.map((entry) => {
    if (Number.isSafeInteger(entry.id) && entry.id >= 0 && !used.has(entry.id)) {
      used.add(entry.id);
      return entry;
    }
    nextId += 1;
    used.add(nextId);
    return { ...entry, id: nextId };
  });
}

export function applyRanchAction(
  state: RanchGameState,
  economyState: RanchEconomyState,
  action: RanchAction,
  now: number,
  production: import("./farming.js").EstateProductionRule = {
    yieldPercent: 0,
    durationPercent: 0,
    label: "常态生产",
  },
): RanchActionResult {
  let ranch = refreshRanchGame(state, now);
  ranch = structuredClone(ranch);
  const economy = structuredClone(economyState);
  const effectiveNow = Math.max(now, ranch.updatedAt);
  const animals = ranchAnimals(ranch.townId);
  requireUnlockedRanch(economy);
  let economyChanged = false;

  if (action.type === "ranch_buy_animal") {
    if (!isAnimalId(action.animalId, ranch.townId)) {
      throw new RanchRuleError("RANCH_UNKNOWN_ANIMAL", "动物不存在");
    }
    const pen = requirePen(ranch, action.penIndex);
    if (pen.animalId !== null) {
      throw new RanchRuleError("RANCH_PEN_OCCUPIED", "这间畜舍已有动物");
    }
    const animal = animals[action.animalId];
    if (
      economy.farmLevel < animal.requiredFarmLevel ||
      ranch.level < animal.requiredRanchLevel
    ) {
      throw new RanchRuleError(
        "RANCH_ANIMAL_LOCKED",
        `需要农场 ${animal.requiredFarmLevel} 级、牧场 ${animal.requiredRanchLevel} 级才能饲养${animal.name}`,
      );
    }
    const purchaseCost = applyPriceModifier(
      animal.purchaseCost,
      production.marketBuyPercent,
    );
    if (economy.coins < purchaseCost) {
      throw new RanchRuleError("RANCH_NOT_ENOUGH_COINS", "购入动物的金币不足");
    }
    economy.coins -= purchaseCost;
    economyChanged = true;
    Object.assign(pen, emptyPen(pen.index), { animalId: animal.id });
    ranch.statistics.animalsPurchased += 1;
    addExperience(ranch, 4, effectiveNow);
    addLog(
      ranch,
      effectiveNow,
      "animal",
      `购入${animal.name}并安置在 ${pen.index + 1} 号畜舍，支出 ${purchaseCost} 金币。`,
    );
  } else if (action.type === "ranch_move_animal") {
    if (action.fromPenIndex === action.toPenIndex) {
      throw new RanchRuleError("RANCH_INVALID_MOVE", "动物已经在这间畜舍");
    }
    const source = requirePen(ranch, action.fromPenIndex);
    const target = requirePen(ranch, action.toPenIndex);
    if (!source.animalId) {
      throw new RanchRuleError("RANCH_PEN_EMPTY", "原畜舍当前没有动物");
    }
    if (source.fedAt !== null) {
      throw new RanchRuleError("RANCH_ANIMAL_BUSY", "生产中的动物不能移动，请先收取产品");
    }
    if (target.animalId !== null) {
      throw new RanchRuleError("RANCH_PEN_OCCUPIED", "目标畜舍已有动物");
    }
    const animal = animals[source.animalId];
    Object.assign(target, emptyPen(target.index), { animalId: animal.id });
    Object.assign(source, emptyPen(source.index));
    addLog(
      ranch,
      effectiveNow,
      "animal",
      `将${animal.name}从 ${source.index + 1} 号畜舍移动至 ${target.index + 1} 号畜舍。`,
    );
  } else if (action.type === "ranch_sell_animal") {
    const pen = requirePen(ranch, action.penIndex);
    if (!pen.animalId) {
      throw new RanchRuleError("RANCH_PEN_EMPTY", "畜舍当前没有动物");
    }
    if (pen.fedAt !== null) {
      throw new RanchRuleError("RANCH_ANIMAL_BUSY", "生产中的动物不能出售，请先收取产品");
    }
    const animal = animals[pen.animalId];
    const resalePrice = applyPriceModifier(
      animal.resalePrice,
      production.marketSellPercent,
    );
    economy.coins += resalePrice;
    economyChanged = true;
    ranch.statistics.coinsEarned += resalePrice;
    Object.assign(pen, emptyPen(pen.index));
    addLog(
      ranch,
      effectiveNow,
      "economy",
      `出售 ${pen.index + 1} 号畜舍的${animal.name}，农场账户收入 ${resalePrice} 金币。`,
    );
  } else if (action.type === "ranch_feed") {
    const pen = requirePen(ranch, action.penIndex);
    if (!pen.animalId) {
      throw new RanchRuleError("RANCH_PEN_EMPTY", "畜舍当前没有动物");
    }
    if (pen.fedAt !== null) {
      throw new RanchRuleError("RANCH_ALREADY_FED", "这只动物正在生产");
    }
    const animal = animals[pen.animalId];
    if (economy.produce[animal.feedCropId] < animal.feedAmount) {
      throw new RanchRuleError(
        "RANCH_NOT_ENOUGH_FEED",
        `需要 ${animal.feedAmount} 份${animal.feedCropId === "wheat" ? "小麦" : animal.feedCropId === "corn" ? "玉米" : "胡萝卜"}作为饲料`,
      );
    }
    const careCost = applyPriceModifier(
      animal.careCost,
      production.marketBuyPercent,
    );
    if (economy.coins < careCost) {
      throw new RanchRuleError(
        "RANCH_NOT_ENOUGH_COINS",
        `投喂还需要 ${careCost} 金币用于垫料与基础诊疗`,
      );
    }
    const duration = Math.max(
      60_000,
      Math.round(
        animal.productionSeconds * 1_000 *
          (100 + production.durationPercent) / 100,
      ),
    );
    economy.produce[animal.feedCropId] -= animal.feedAmount;
    economy.coins -= careCost;
    economyChanged = true;
    pen.cycle += 1;
    pen.fedAt = effectiveNow;
    pen.producesAt = effectiveNow + duration;
    pen.productionModifierPercent = production.yieldPercent;
    pen.durationModifierPercent = production.durationPercent;
    pen.productionModifierLabel = production.label;
    pen.messAt = effectiveNow + Math.floor(duration * 0.52);
    pen.messCleaned = false;
    pen.taken = 0;
    pen.collectAttempts = [];
    pen.takenBy = [];
    ranch.statistics.feedings += 1;
    addExperience(ranch, 2, effectiveNow);
    addLog(
      ranch,
      effectiveNow,
      "animal",
      `给 ${pen.index + 1} 号畜舍的${animal.name}投喂，并支付 ${careCost} 金币垫料与诊疗费；预计 ${new Date(pen.producesAt).toLocaleString("zh-CN")} 可收取${animal.productName}。`,
    );
  } else if (action.type === "ranch_clean_all") {
    const penIndices = ranch.pens
      .filter((pen) =>
        pen.index < ranch.unlockedPens &&
        pen.animalId !== null &&
        pen.fedAt !== null &&
        messAppeared(pen, effectiveNow)
      )
      .map(({ index }) => index);
    if (penIndices.length === 0) {
      throw new RanchRuleError(
        "RANCH_CARE_NOT_NEEDED",
        "当前没有需要清扫的畜舍",
      );
    }
    const baseRevision = ranch.revision;
    for (const penIndex of penIndices) {
      const result = applyRanchAction(
        ranch,
        economy,
        { type: "ranch_clean", penIndex },
        effectiveNow,
        production,
      );
      ranch = result.ranch;
    }
    addLog(
      ranch,
      effectiveNow,
      "care",
      `一键清扫完成，共处理 ${penIndices.length} 间畜舍。`,
    );
    ranch.updatedAt = effectiveNow;
    ranch.revision = baseRevision + 1;
    return { ranch, economy, economyChanged: false };
  } else if (action.type === "ranch_clean") {
    const pen = requirePen(ranch, action.penIndex);
    if (!pen.animalId || pen.fedAt === null) {
      throw new RanchRuleError("RANCH_NOT_FED", "当前没有需要清扫的生产畜舍");
    }
    if (!messAppeared(pen, effectiveNow)) {
      throw new RanchRuleError("RANCH_CARE_NOT_NEEDED", "当前没有需要清扫的粪便");
    }
    pen.messCleaned = true;
    ranch.statistics.cleanings += 1;
    addExperience(ranch, 2, effectiveNow);
    addLog(ranch, effectiveNow, "care", `完成 ${pen.index + 1} 号畜舍清扫。`);
  } else if (action.type === "ranch_collect_all") {
    const penIndices = ranch.pens
      .filter((pen) =>
        pen.index < ranch.unlockedPens &&
        pen.animalId !== null &&
        (animals[pen.animalId].productionKind ?? "renewable") === "renewable" &&
        pen.producesAt !== null &&
        effectiveNow >= pen.producesAt
      )
      .map(({ index }) => index);
    if (penIndices.length === 0) {
      throw new RanchRuleError("RANCH_NOT_READY", "当前没有可收取的畜舍");
    }
    const baseRevision = ranch.revision;
    for (const penIndex of penIndices) {
      const result = applyRanchAction(
        ranch,
        economy,
        { type: "ranch_collect", penIndex },
        effectiveNow,
        production,
      );
      ranch = result.ranch;
    }
    addLog(
      ranch,
      effectiveNow,
      "collect",
      `一键收取完成，共处理 ${penIndices.length} 间畜舍。`,
    );
    ranch.updatedAt = effectiveNow;
    ranch.revision = baseRevision + 1;
    return { ranch, economy, economyChanged: false };
  } else if (action.type === "ranch_slaughter") {
    const pen = requirePen(ranch, action.penIndex);
    if (!pen.animalId || pen.producesAt === null) {
      throw new RanchRuleError("RANCH_NOT_FED", "肉畜尚未进入育肥周期");
    }
    const animal = animals[pen.animalId];
    if ((animal.productionKind ?? "renewable") !== "meat") {
      throw new RanchRuleError("RANCH_SLAUGHTER_REQUIRED", "该动物应通过常规收取获得产品");
    }
    if (effectiveNow < pen.producesAt) {
      throw new RanchRuleError("RANCH_NOT_READY", "肉畜尚未完成育肥");
    }
    const baseYield = Math.max(
      1,
      animal.yield - (messAppeared(pen, effectiveNow) ? 1 : 0),
    );
    const settlement = applyAccumulatedProductionModifier(
      baseYield,
      pen.productionModifierPercent ?? 0,
      ranch.productionRemainder,
    );
    ranch.productionRemainder = settlement.remainder;
    ranch.products[animal.productId] += settlement.quantity;
    ranch.statistics.productsCollected += settlement.quantity;
    addExperience(ranch, animal.collectExperience, effectiveNow);
    addLog(
      ranch,
      effectiveNow,
      "collect",
      `完成 ${pen.index + 1} 号畜舍${animal.name}出栏，获得 ${settlement.quantity} 份${animal.productName}。`,
    );
    Object.assign(pen, emptyPen(pen.index));
  } else if (action.type === "ranch_collect") {
    const pen = requirePen(ranch, action.penIndex);
    if (!pen.animalId || pen.producesAt === null) {
      throw new RanchRuleError("RANCH_NOT_FED", "动物尚未进入生产周期");
    }
    if (effectiveNow < pen.producesAt) {
      throw new RanchRuleError("RANCH_NOT_READY", "动物产品尚未产出");
    }
    const animal = animals[pen.animalId];
    if ((animal.productionKind ?? "renewable") === "meat") {
      throw new RanchRuleError("RANCH_SLAUGHTER_REQUIRED", "肉畜育肥完成后需要执行出栏屠宰");
    }
    const baseYield = Math.max(
      1,
      animal.yield - (messAppeared(pen, effectiveNow) ? 1 : 0),
    );
    const settlement = applyAccumulatedProductionModifier(
      baseYield,
      pen.productionModifierPercent ?? 0,
      ranch.productionRemainder,
    );
    ranch.productionRemainder = settlement.remainder;
    const totalYield = settlement.quantity;
    const ownerYield = Math.max(0, totalYield - pen.taken);
    ranch.products[animal.productId] += ownerYield;
    ranch.statistics.productsCollected += ownerYield;
    addExperience(ranch, animal.collectExperience, effectiveNow);
    addLog(
      ranch,
      effectiveNow,
      "collect",
      `从 ${pen.index + 1} 号畜舍收取 ${ownerYield} 份${animal.productName}${
        pen.taken > 0 ? `，成熟期间被农友拿走 ${pen.taken} 份` : ""
      }。`,
    );
    resetProduction(pen);
  } else if (action.type === "ranch_sell") {
    if (!isProductId(action.productId, ranch.townId)) {
      throw new RanchRuleError("RANCH_UNKNOWN_PRODUCT", "牧场产品不存在");
    }
    if (!validQuantity(action.quantity)) {
      throw new RanchRuleError("RANCH_INVALID_QUANTITY", "出售数量需为 1 至 99");
    }
    if (ranch.products[action.productId] < action.quantity) {
      throw new RanchRuleError("RANCH_NOT_ENOUGH_PRODUCTS", "牧场仓库库存不足");
    }
    const animal = Object.values(animals).find(
      (candidate) => candidate.productId === action.productId,
    )!;
    const unitPrice = applyPriceModifier(
      animal.productPrice,
      production.marketSellPercent,
    );
    const revenue = unitPrice * action.quantity;
    ranch.products[action.productId] -= action.quantity;
    economy.coins += revenue;
    economyChanged = true;
    ranch.statistics.productsSold += action.quantity;
    ranch.statistics.coinsEarned += revenue;
    addLog(
      ranch,
      effectiveNow,
      "economy",
      `出售 ${action.quantity} 份${animal.productName}，农场账户收入 ${revenue} 金币。`,
    );
  } else if (action.type === "ranch_expand_pen") {
    if (ranch.unlockedPens >= RANCH_MAX_PENS) {
      throw new RanchRuleError("RANCH_MAX_PENS", "全部畜舍均已扩建");
    }
    const expansion = RANCH_PEN_EXPANSIONS.find(
      (candidate) => candidate.penIndex === ranch.unlockedPens,
    )!;
    if (
      economy.farmLevel < expansion.requiredFarmLevel ||
      ranch.level < expansion.requiredRanchLevel
    ) {
      throw new RanchRuleError(
        "RANCH_LEVEL_REQUIRED",
        `需要农场 ${expansion.requiredFarmLevel} 级、牧场 ${expansion.requiredRanchLevel} 级才能扩建`,
      );
    }
    if (economy.coins < expansion.coinCost) {
      throw new RanchRuleError("RANCH_NOT_ENOUGH_COINS", "扩建畜舍的金币不足");
    }
    economy.coins -= expansion.coinCost;
    economyChanged = true;
    ranch.unlockedPens += 1;
    addLog(
      ranch,
      effectiveNow,
      "progression",
      `扩建了第 ${ranch.unlockedPens} 间畜舍。`,
    );
  }

  if (economyChanged) economy.farmRevision += 1;
  ranch.updatedAt = effectiveNow;
  ranch.revision += 1;
  return { ranch, economy, economyChanged };
}

export function applyRanchVisitAction(
  ownerState: RanchGameState,
  visitorState: RanchGameState,
  action: RanchVisitAction,
  ownerDogLevel: number,
  now: number,
): RanchVisitResult {
  if (ownerState.ownerId === visitorState.ownerId) {
    throw new RanchRuleError("RANCH_CANNOT_VISIT_SELF", "不能访问自己的牧场");
  }
  if (ranchTownId(ownerState) !== ranchTownId(visitorState)) {
    throw new RanchRuleError(
      "RANCH_TOWN_MISMATCH",
      "只能访问同一城镇的牧场",
    );
  }
  let owner = refreshRanchGame(ownerState, now);
  let visitor = refreshRanchGame(visitorState, now);
  owner = structuredClone(owner);
  visitor = structuredClone(visitor);
  const effectiveNow = Math.max(now, owner.updatedAt, visitor.updatedAt);
  const animals = ranchAnimals(owner.townId);
  const pen = requirePen(owner, action.penIndex);
  let outcome: RanchVisitResult["outcome"];

  if (action.type === "ranch_help") {
    if (visitor.dailySocial.helps >= RANCH_MAX_DAILY_HELPS) {
      throw new RanchRuleError("RANCH_DAILY_HELP_LIMIT", "今日帮助农友的次数已达上限");
    }
    if (!pen.animalId || pen.fedAt === null || !messAppeared(pen, effectiveNow)) {
      throw new RanchRuleError("RANCH_CARE_NOT_NEEDED", "当前没有需要帮忙清扫的畜舍");
    }
    pen.messCleaned = true;
    visitor.dailySocial.helps += 1;
    visitor.statistics.helpsGiven += 1;
    owner.statistics.helpsReceived += 1;
    addExperience(visitor, 2, effectiveNow);
    addLog(
      owner,
      effectiveNow,
      "social",
      `${visitor.ownerName} 帮助清扫了 ${pen.index + 1} 号畜舍。`,
    );
    addLog(
      visitor,
      effectiveNow,
      "social",
      `帮助 ${owner.ownerName} 清扫 ${pen.index + 1} 号畜舍。`,
    );
    outcome = "helped";
  } else {
    if (visitor.dailySocial.collects >= RANCH_MAX_DAILY_COLLECTS) {
      throw new RanchRuleError(
        "RANCH_DAILY_COLLECT_LIMIT",
        "今日收取农友产品的次数已达上限",
      );
    }
    if (!pen.animalId || pen.producesAt === null || effectiveNow < pen.producesAt) {
      throw new RanchRuleError("RANCH_NOT_READY", "动物产品尚未产出");
    }
    if ((animals[pen.animalId].productionKind ?? "renewable") === "meat") {
      throw new RanchRuleError("RANCH_NOTHING_TO_COLLECT", "肉畜只能由场主一次性出栏");
    }
    if (pen.collectAttempts.includes(visitor.ownerId)) {
      throw new RanchRuleError("RANCH_ALREADY_ATTEMPTED", "你已经尝试过这间畜舍");
    }
    const maximum = maximumNeighborCollectable(pen, effectiveNow);
    if (maximum === 0 || pen.taken >= maximum) {
      throw new RanchRuleError("RANCH_NOTHING_TO_COLLECT", "这间畜舍已没有可取份额");
    }
    pen.collectAttempts.push(visitor.ownerId);
    visitor.dailySocial.collects += 1;
    const blocked = hashText(
      `${owner.seed}:ranch-dog:${pen.index}:${pen.cycle}:${visitor.ownerId}`,
    ) % 100 < dogBlockChance(ownerDogLevel);
    if (blocked) {
      owner.statistics.dogBlocks += 1;
      addLog(
        owner,
        effectiveNow,
        "social",
        `护院犬拦住了试图拿取产品的 ${visitor.ownerName}。`,
      );
      addLog(
        visitor,
        effectiveNow,
        "social",
        `被 ${owner.ownerName} 的护院犬发现，本次拿取失败。`,
      );
      outcome = "blocked";
    } else {
      const animal = animals[pen.animalId];
      pen.taken += 1;
      pen.takenBy.push(visitor.ownerId);
      visitor.products[animal.productId] += 1;
      visitor.statistics.neighborCollections += 1;
      owner.statistics.collectedFrom += 1;
      addExperience(visitor, 1, effectiveNow);
      addLog(
        owner,
        effectiveNow,
        "social",
        `${visitor.ownerName} 从 ${pen.index + 1} 号畜舍拿走 1 份${animal.productName}。`,
      );
      addLog(
        visitor,
        effectiveNow,
        "social",
        `从 ${owner.ownerName} 的 ${pen.index + 1} 号畜舍拿到 1 份${animal.productName}。`,
      );
      outcome = "collected";
    }
  }

  owner.updatedAt = effectiveNow;
  visitor.updatedAt = effectiveNow;
  owner.revision += 1;
  visitor.revision += 1;
  return { owner, visitor, outcome };
}

function penView(
  game: RanchGameState,
  pen: RanchPenState,
  now: number,
): RanchPenView {
  const ready = pen.producesAt !== null && now >= pen.producesAt;
  const progress = pen.fedAt === null || pen.producesAt === null
    ? 0
    : Math.max(
        0,
        Math.min(
          1,
          (now - pen.fedAt) / Math.max(1, pen.producesAt - pen.fedAt),
        ),
      );
  return {
    ...structuredClone(pen),
    unlocked: pen.index < game.unlockedPens,
    ready,
    progress,
    hasMess: messAppeared(pen, now),
    estimatedYield: penYield(pen, now),
    maximumNeighborCollectable: maximumNeighborCollectable(pen, now),
  };
}

export function getRanchGameView(
  state: RanchGameState,
  input: {
    readonly viewerId: string;
    readonly now: number;
    readonly farmRevision: number;
    readonly farmLevel: number;
    readonly dogLevel: number;
    readonly coins?: number;
    readonly produce?: FarmingCropCounts;
    readonly production?: import("./farming.js").EstateProductionRule;
  },
): RanchGameView {
  const game = refreshRanchGame(state, input.now);
  const effectiveNow = Math.max(input.now, game.updatedAt);
  const isOwner = game.ownerId === input.viewerId;
  const currentThreshold = RANCH_LEVEL_EXPERIENCE[game.level - 1] ?? 0;
  const nextThreshold = RANCH_LEVEL_EXPERIENCE[game.level] ?? null;
  const production = input.production ?? {
    yieldPercent: 0,
    durationPercent: 0,
    label: "常态生产",
  };
  return {
    kind: "ranch",
    version: RANCH_STATE_VERSION,
    townId: game.townId,
    townDefinition: structuredClone(getTownDefinition(game.townId)),
    revision: game.revision,
    serverTime: effectiveNow,
    ownerId: game.ownerId,
    ownerName: game.ownerName,
    isOwner,
    createdAt: game.createdAt,
    unlocked: input.farmLevel >= RANCH_REQUIRED_FARM_LEVEL,
    requiredFarmLevel: RANCH_REQUIRED_FARM_LEVEL,
    farmLevel: input.farmLevel,
    farmRevision: input.farmRevision,
    dogLevel: input.dogLevel,
    dogBlockChance: dogBlockChance(input.dogLevel),
    level: game.level,
    experience: game.experience,
    currentLevelExperience: currentThreshold,
    nextLevelExperience: nextThreshold,
    unlockedPens: game.unlockedPens,
    productionRule: structuredClone(production),
    animals: Object.fromEntries(
      Object.entries(ranchAnimals(game.townId)).map(([animalId, animal]) => [
        animalId,
        {
          ...structuredClone(animal),
          purchaseCost: applyPriceModifier(
            animal.purchaseCost,
            production.marketBuyPercent,
          ),
          careCost: applyPriceModifier(
            animal.careCost,
            production.marketBuyPercent,
          ),
          resalePrice: applyPriceModifier(
            animal.resalePrice,
            production.marketSellPercent,
          ),
          productPrice: applyPriceModifier(
            animal.productPrice,
            production.marketSellPercent,
          ),
        },
      ]),
    ) as Readonly<Record<RanchAnimalId, RanchAnimalDefinition>>,
    economy: isOwner && input.coins !== undefined && input.produce
      ? {
          coins: input.coins,
          produce: structuredClone(input.produce),
          products: structuredClone(game.products),
        }
      : null,
    pens: game.pens.map((pen) => penView(game, pen, effectiveNow)),
    nextExpansion: RANCH_PEN_EXPANSIONS.find(
      (candidate) => candidate.penIndex === game.unlockedPens,
    ) ?? null,
    dailySocial: isOwner ? structuredClone(game.dailySocial) : null,
    statistics: isOwner ? structuredClone(game.statistics) : null,
    logs: isOwner
      ? structuredClone(game.logs)
      : structuredClone(game.logs.filter((entry) => entry.kind === "progression").slice(-5)),
  };
}

export function getRanchNeighborSummary(
  state: RanchGameState,
  viewerId: string,
  now: number,
): RanchNeighborSummary | null {
  if (state.ownerId === viewerId) return null;
  const game = refreshRanchGame(state, now);
  const pens = game.pens
    .slice(0, game.unlockedPens)
    .map((pen) => penView(game, pen, now));
  return {
    ownerId: game.ownerId,
    ownerName: game.ownerName,
    level: game.level,
    unlockedPens: game.unlockedPens,
    readyPens: pens.filter((pen) => pen.ready).length,
    careNeededPens: pens.filter((pen) => pen.hasMess).length,
    collectiblePens: pens.filter((pen) =>
      pen.ready &&
      pen.taken < pen.maximumNeighborCollectable &&
      !pen.collectAttempts.includes(viewerId)
    ).length,
    updatedAt: game.updatedAt,
  };
}

function validProducts(
  value: unknown,
  townId: EstateTownId,
): value is RanchProductCounts {
  const townProductIds = ranchProductIds(townId);
  const allowedIds = new Set(townProductIds as readonly string[]);
  return isRecord(value) &&
    Object.keys(value).length === townProductIds.length &&
    Object.keys(value).every((productId) => allowedIds.has(productId)) &&
    townProductIds.every((productId) =>
      isNonNegativeInteger(value[productId])
    );
}

export function assertRestorableRanchGameState(
  value: unknown,
): asserts value is RanchGameState {
  if (
    !isRecord(value) ||
    value.kind !== "ranch" ||
    value.version !== RANCH_STATE_VERSION
  ) {
    throw new Error("牧场存档版本无效");
  }
  if (value.townId !== undefined && !isEstateTownId(value.townId)) {
    throw new Error("牧场城镇无效");
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
    !isNonNegativeInteger(value.experience) ||
    !Number.isSafeInteger(value.level) ||
    value.level !== levelForExperience(Number(value.experience)) ||
    !Number.isSafeInteger(value.unlockedPens) ||
    Number(value.unlockedPens) < RANCH_STARTING_PENS ||
    Number(value.unlockedPens) > RANCH_MAX_PENS ||
    (
      value.productionRemainder !== undefined &&
      (
        typeof value.productionRemainder !== "number" ||
        !Number.isFinite(value.productionRemainder) ||
        Number(value.productionRemainder) <= -1 ||
        Number(value.productionRemainder) >= 1
      )
    ) ||
    !validProducts(value.products, townId)
  ) {
    throw new Error("牧场主状态无效");
  }
  if (!Array.isArray(value.pens) || value.pens.length !== RANCH_MAX_PENS) {
    throw new Error("牧场畜舍状态无效");
  }
  for (const [index, pen] of value.pens.entries()) {
    if (
      !isRecord(pen) ||
      pen.index !== index ||
      !isNonNegativeInteger(pen.cycle) ||
      (pen.animalId !== null && !isAnimalId(pen.animalId, townId)) ||
      typeof pen.messCleaned !== "boolean" ||
      !isNonNegativeInteger(pen.taken) ||
      !Array.isArray(pen.collectAttempts) ||
      pen.collectAttempts.some((id) => typeof id !== "string" || id.length === 0) ||
      new Set(pen.collectAttempts).size !== pen.collectAttempts.length ||
      !Array.isArray(pen.takenBy) ||
      pen.takenBy.some((id) => typeof id !== "string" || id.length === 0) ||
      (
        pen.productionModifierPercent !== undefined &&
        (
          !Number.isSafeInteger(pen.productionModifierPercent) ||
          Number(pen.productionModifierPercent) < -100 ||
          Number(pen.productionModifierPercent) > 100
        )
      ) ||
      (
        pen.durationModifierPercent !== undefined &&
        (
          !Number.isSafeInteger(pen.durationModifierPercent) ||
          Number(pen.durationModifierPercent) < -100 ||
          Number(pen.durationModifierPercent) > 100
        )
      ) ||
      (
        pen.productionModifierLabel !== undefined &&
        (
          typeof pen.productionModifierLabel !== "string" ||
          pen.productionModifierLabel.length > 160
        )
      )
    ) {
      throw new Error("牧场畜舍状态无效");
    }
    if (pen.animalId === null) {
      if (
        pen.fedAt !== null ||
        pen.producesAt !== null ||
        pen.messAt !== null ||
        pen.messCleaned ||
        pen.taken !== 0 ||
        pen.collectAttempts.length > 0 ||
        pen.takenBy.length > 0
      ) {
        throw new Error("牧场空畜舍状态无效");
      }
    } else if (pen.fedAt === null) {
      if (
        pen.producesAt !== null ||
        pen.messAt !== null ||
        pen.messCleaned ||
        pen.taken !== 0 ||
        pen.collectAttempts.length > 0 ||
        pen.takenBy.length > 0
      ) {
        throw new Error("牧场待投喂状态无效");
      }
    } else if (
      !isNonNegativeInteger(pen.producesAt) ||
      Number(pen.producesAt) <= Number(pen.fedAt) ||
      !isNonNegativeInteger(pen.messAt) ||
      Number(pen.messAt) <= Number(pen.fedAt) ||
      Number(pen.messAt) >= Number(pen.producesAt) ||
      Number(pen.taken) > maximumNeighborCollectable(
        pen as unknown as RanchPenState,
        Number(pen.producesAt),
      )
    ) {
      throw new Error("牧场生产周期状态无效");
    }
  }
  if (
    !isRecord(value.dailySocial) ||
    typeof value.dailySocial.dayKey !== "string" ||
    !isNonNegativeInteger(value.dailySocial.helps) ||
    Number(value.dailySocial.helps) > RANCH_MAX_DAILY_HELPS ||
    !isNonNegativeInteger(value.dailySocial.collects) ||
    Number(value.dailySocial.collects) > RANCH_MAX_DAILY_COLLECTS ||
    !isRecord(value.statistics) ||
    Object.values(value.statistics).some((entry) => !isNonNegativeInteger(entry)) ||
    !Array.isArray(value.logs) ||
    value.logs.length > RANCH_MAX_LOGS
  ) {
    throw new Error("牧场附加状态无效");
  }
}
