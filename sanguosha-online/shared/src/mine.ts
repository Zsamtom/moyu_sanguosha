import type { FarmingCropCounts } from "./farming.js";
import type {
  RanchProductCounts,
  RanchProductId,
} from "./ranch.js";
import {
  FROSTPEAK_DEPOSIT_IDS,
  FROSTPEAK_MINE_DEPOSITS,
} from "./towns/frostpeak.js";
import { GREENVALE_DEPOSIT_IDS } from "./towns/greenvale.js";
import {
  getTownDefinition,
  isEstateTownId,
  type EstateTownId,
  type TownDefinition,
} from "./towns/registry.js";

export const MINE_STATE_VERSION = 1 as const;
export const MINE_REQUIRED_FARM_LEVEL = 1;
export const MINE_REQUIRED_RANCH_LEVEL = 1;
export const MINE_STARTING_SHAFTS = 2;
export const MINE_MAX_SHAFTS = 6;
export const MINE_MAX_LOGS = 80;

/** @deprecated Greenvale-only compatibility catalog. Prefer a state's town catalog. */
export const MINE_DEPOSIT_IDS = GREENVALE_DEPOSIT_IDS;
export const ALL_MINE_DEPOSIT_IDS = [
  ...GREENVALE_DEPOSIT_IDS,
  ...FROSTPEAK_DEPOSIT_IDS,
] as const;
export type MineDepositId = (typeof ALL_MINE_DEPOSIT_IDS)[number];
export type MineOreCounts = Record<MineDepositId, number>;

export interface MineDepositDefinition {
  readonly id: MineDepositId;
  readonly name: string;
  readonly requiredFarmLevel: number;
  readonly requiredRanchLevel: number;
  readonly requiredMineLevel: number;
  readonly expeditionCost: number;
  readonly rationProductId: RanchProductId;
  readonly rationAmount: number;
  readonly supportProductId: RanchProductId;
  readonly supportAmount: number;
  readonly durationSeconds: number;
  readonly yield: number;
  readonly orePrice: number;
  readonly collectExperience: number;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;

export const MINE_DEPOSITS: Readonly<Record<
  (typeof GREENVALE_DEPOSIT_IDS)[number],
  MineDepositDefinition
>> = {
  coal: {
    id: "coal",
    name: "煤层",
    requiredFarmLevel: 1,
    requiredRanchLevel: 1,
    requiredMineLevel: 1,
    expeditionCost: 20,
    rationProductId: "egg",
    rationAmount: 1,
    supportProductId: "rabbit_fur",
    supportAmount: 1,
    durationSeconds: 15 * MINUTE,
    yield: 3,
    orePrice: 25,
    collectExperience: 16,
  },
  iron: {
    id: "iron",
    name: "铁矿脉",
    requiredFarmLevel: 1,
    requiredRanchLevel: 1,
    requiredMineLevel: 1,
    expeditionCost: 30,
    rationProductId: "egg",
    rationAmount: 1,
    supportProductId: "rabbit_fur",
    supportAmount: 1,
    durationSeconds: 30 * MINUTE,
    yield: 3,
    orePrice: 38,
    collectExperience: 22,
  },
  copper: {
    id: "copper",
    name: "铜矿脉",
    requiredFarmLevel: 7,
    requiredRanchLevel: 4,
    requiredMineLevel: 2,
    expeditionCost: 45,
    rationProductId: "duck_egg",
    rationAmount: 1,
    supportProductId: "wool",
    supportAmount: 1,
    durationSeconds: HOUR,
    yield: 4,
    orePrice: 60,
    collectExperience: 31,
  },
  silver: {
    id: "silver",
    name: "银矿脉",
    requiredFarmLevel: 8,
    requiredRanchLevel: 6,
    requiredMineLevel: 4,
    expeditionCost: 70,
    rationProductId: "milk",
    rationAmount: 1,
    supportProductId: "wool",
    supportAmount: 1,
    durationSeconds: 2 * HOUR,
    yield: 4,
    orePrice: 95,
    collectExperience: 44,
  },
  gold: {
    id: "gold",
    name: "金矿脉",
    requiredFarmLevel: 10,
    requiredRanchLevel: 7,
    requiredMineLevel: 6,
    expeditionCost: 120,
    rationProductId: "milk",
    rationAmount: 2,
    supportProductId: "wool",
    supportAmount: 2,
    durationSeconds: 3 * HOUR,
    yield: 4,
    orePrice: 150,
    collectExperience: 61,
  },
  crystal: {
    id: "crystal",
    name: "晶簇洞",
    requiredFarmLevel: 10,
    requiredRanchLevel: 8,
    requiredMineLevel: 8,
    expeditionCost: 180,
    rationProductId: "goat_milk",
    rationAmount: 1,
    supportProductId: "wool",
    supportAmount: 2,
    durationSeconds: 6 * HOUR,
    yield: 5,
    orePrice: 230,
    collectExperience: 82,
  },
};

const ALL_MINE_DEPOSITS: Readonly<
  Record<MineDepositId, MineDepositDefinition>
> = {
  ...MINE_DEPOSITS,
  ...FROSTPEAK_MINE_DEPOSITS,
} as Readonly<Record<MineDepositId, MineDepositDefinition>>;

function mineDepositIds(townId: EstateTownId): readonly MineDepositId[] {
  return getTownDefinition(townId).content.depositIds as readonly MineDepositId[];
}

function mineDeposits(
  townId: EstateTownId,
): Readonly<Record<MineDepositId, MineDepositDefinition>> {
  return Object.fromEntries(
    mineDepositIds(townId).map((depositId) => [
      depositId,
      ALL_MINE_DEPOSITS[depositId],
    ]),
  ) as Readonly<Record<MineDepositId, MineDepositDefinition>>;
}

function mineTownId(state: { readonly townId?: unknown }): EstateTownId {
  return isEstateTownId(state.townId) ? state.townId : "greenvale";
}

export const MINE_LEVEL_EXPERIENCE = [
  0,
  55,
  145,
  275,
  455,
  700,
  1_020,
  1_430,
  1_950,
  2_600,
] as const;

export interface MineShaftExpansion {
  readonly shaftIndex: number;
  readonly requiredFarmLevel: number;
  readonly requiredRanchLevel: number;
  readonly requiredMineLevel: number;
  readonly coinCost: number;
}

export const MINE_SHAFT_EXPANSIONS: readonly MineShaftExpansion[] = [
  { shaftIndex: 2, requiredFarmLevel: 7, requiredRanchLevel: 4, requiredMineLevel: 2, coinCost: 700 },
  { shaftIndex: 3, requiredFarmLevel: 8, requiredRanchLevel: 5, requiredMineLevel: 4, coinCost: 1_200 },
  { shaftIndex: 4, requiredFarmLevel: 10, requiredRanchLevel: 7, requiredMineLevel: 6, coinCost: 2_000 },
  { shaftIndex: 5, requiredFarmLevel: 12, requiredRanchLevel: 9, requiredMineLevel: 8, coinCost: 3_200 },
];

export interface MinePickaxeUpgrade {
  readonly level: number;
  readonly requiredFarmLevel: number;
  readonly requiredRanchLevel: number;
  readonly requiredMineLevel: number;
  readonly coinCost: number;
  readonly yieldBonus: number;
}

export const MINE_PICKAXE_UPGRADES: readonly MinePickaxeUpgrade[] = [
  { level: 1, requiredFarmLevel: 7, requiredRanchLevel: 4, requiredMineLevel: 2, coinCost: 500, yieldBonus: 1 },
  { level: 2, requiredFarmLevel: 9, requiredRanchLevel: 6, requiredMineLevel: 5, coinCost: 1_200, yieldBonus: 2 },
  { level: 3, requiredFarmLevel: 11, requiredRanchLevel: 8, requiredMineLevel: 8, coinCost: 2_500, yieldBonus: 3 },
];

export interface MineShaftState {
  readonly index: number;
  cycle: number;
  depositId: MineDepositId | null;
  startedAt: number | null;
  completesAt: number | null;
  hazardAt: number | null;
  reinforced: boolean;
  /** Captured when the expedition starts for deterministic estate effects. */
  productionModifierPercent?: number;
  durationModifierPercent?: number;
  productionModifierLabel?: string;
}

export interface MineStatistics {
  expeditionsStarted: number;
  expeditionsCompleted: number;
  oresCollected: number;
  oresSold: number;
  coinsEarned: number;
  reinforcements: number;
  relicsFound: number;
}

export interface MineLogEntry {
  readonly id: number;
  readonly at: number;
  readonly kind:
    | "system"
    | "economy"
    | "expedition"
    | "care"
    | "collect"
    | "progression";
  readonly text: string;
}

export interface MineGameState {
  readonly kind: "mine";
  readonly version: typeof MINE_STATE_VERSION;
  townId: EstateTownId;
  readonly seed: string;
  revision: number;
  readonly ownerId: string;
  ownerName: string;
  readonly createdAt: number;
  updatedAt: number;
  experience: number;
  level: number;
  unlockedShafts: number;
  pickaxeLevel: number;
  ores: MineOreCounts;
  relics: number;
  shafts: MineShaftState[];
  statistics: MineStatistics;
  logs: MineLogEntry[];
}

export interface MineLinkedEconomy {
  farmRevision: number;
  farmLevel: number;
  coins: number;
  farmProduce: FarmingCropCounts;
  ranchRevision: number;
  ranchLevel: number;
  ranchProducts: RanchProductCounts;
}

export type MineAction =
  | {
      readonly type: "mine_start";
      readonly depositId: MineDepositId;
      readonly shaftIndex: number;
    }
  | {
      readonly type: "mine_reinforce";
      readonly shaftIndex: number;
    }
  | {
      readonly type: "mine_abandon";
      readonly shaftIndex: number;
    }
  | {
      readonly type: "mine_collect";
      readonly shaftIndex: number;
    }
  | {
      readonly type: "mine_sell";
      readonly depositId: MineDepositId;
      readonly quantity: number;
    }
  | {
      readonly type: "mine_expand_shaft";
    }
  | {
      readonly type: "mine_upgrade_pickaxe";
    };

export interface MineActionResult {
  readonly mine: MineGameState;
  readonly economy: MineLinkedEconomy;
  readonly farmChanged: boolean;
  readonly ranchChanged: boolean;
}

export interface MineShaftView extends MineShaftState {
  readonly unlocked: boolean;
  readonly ready: boolean;
  readonly progress: number;
  readonly hasHazard: boolean;
  readonly estimatedYield: number;
}

export interface MineGameView {
  readonly kind: "mine";
  readonly version: typeof MINE_STATE_VERSION;
  readonly townId: EstateTownId;
  readonly townDefinition: TownDefinition;
  readonly revision: number;
  readonly serverTime: number;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly unlocked: boolean;
  readonly requiredFarmLevel: number;
  readonly requiredRanchLevel: number;
  readonly farmRevision: number;
  readonly farmLevel: number;
  readonly ranchRevision: number;
  readonly ranchLevel: number;
  readonly level: number;
  readonly experience: number;
  readonly currentLevelExperience: number;
  readonly nextLevelExperience: number | null;
  readonly unlockedShafts: number;
  readonly pickaxeLevel: number;
  readonly pickaxeYieldBonus: number;
  readonly deposits: Readonly<Record<MineDepositId, MineDepositDefinition>>;
  readonly economy: {
    readonly coins: number;
    readonly ranchProducts: RanchProductCounts;
    readonly ores: MineOreCounts;
    readonly relics: number;
  };
  readonly shafts: MineShaftView[];
  readonly nextExpansion: MineShaftExpansion | null;
  readonly nextPickaxeUpgrade: MinePickaxeUpgrade | null;
  readonly statistics: MineStatistics;
  readonly logs: MineLogEntry[];
}

export type MineRuleErrorCode =
  | "MINE_INVALID_TIME"
  | "MINE_LOCKED"
  | "MINE_INVALID_QUANTITY"
  | "MINE_UNKNOWN_DEPOSIT"
  | "MINE_DEPOSIT_LOCKED"
  | "MINE_NOT_ENOUGH_COINS"
  | "MINE_NOT_ENOUGH_RATIONS"
  | "MINE_NOT_ENOUGH_SUPPORT"
  | "MINE_NOT_ENOUGH_ORE"
  | "MINE_INVALID_SHAFT"
  | "MINE_SHAFT_LOCKED"
  | "MINE_SHAFT_BUSY"
  | "MINE_SHAFT_IDLE"
  | "MINE_CARE_NOT_NEEDED"
  | "MINE_NOT_READY"
  | "MINE_MAX_SHAFTS"
  | "MINE_LEVEL_REQUIRED"
  | "MINE_PICKAXE_MAX_LEVEL";

export class MineRuleError extends Error {
  constructor(
    readonly code: MineRuleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MineRuleError";
  }
}

function oreCounts(
  initial = 0,
  townId: EstateTownId = "greenvale",
): MineOreCounts {
  return Object.fromEntries(
    mineDepositIds(townId).map((depositId) => [depositId, initial]),
  ) as MineOreCounts;
}

function emptyStatistics(): MineStatistics {
  return {
    expeditionsStarted: 0,
    expeditionsCompleted: 0,
    oresCollected: 0,
    oresSold: 0,
    coinsEarned: 0,
    reinforcements: 0,
    relicsFound: 0,
  };
}

function emptyShaft(index: number, cycle = 0): MineShaftState {
  return {
    index,
    cycle,
    depositId: null,
    startedAt: null,
    completesAt: null,
    hazardAt: null,
    reinforced: false,
    productionModifierPercent: 0,
    durationModifierPercent: 0,
    productionModifierLabel: "常态生产",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isDepositId(
  value: unknown,
  townId: EstateTownId = "greenvale",
): value is MineDepositId {
  return typeof value === "string" &&
    (mineDepositIds(townId) as readonly string[]).includes(value);
}

function assertTime(now: number): void {
  if (!Number.isSafeInteger(now) || now < 0 || now > 8_640_000_000_000_000) {
    throw new MineRuleError("MINE_INVALID_TIME", "服务器时间无效");
  }
}

function levelForExperience(experience: number): number {
  let level = 1;
  for (const [index, threshold] of MINE_LEVEL_EXPERIENCE.entries()) {
    if (experience >= threshold) level = index + 1;
  }
  return Math.min(level, MINE_LEVEL_EXPERIENCE.length);
}

function addLog(
  game: MineGameState,
  at: number,
  kind: MineLogEntry["kind"],
  text: string,
): void {
  game.logs.push({
    id: game.revision + game.logs.length + 1,
    at,
    kind,
    text,
  });
  if (game.logs.length > MINE_MAX_LOGS) {
    game.logs.splice(0, game.logs.length - MINE_MAX_LOGS);
  }
}

function addExperience(game: MineGameState, amount: number, now: number): void {
  if (amount <= 0) return;
  const previousLevel = game.level;
  game.experience += amount;
  game.level = levelForExperience(game.experience);
  if (game.level > previousLevel) {
    addLog(
      game,
      now,
      "progression",
      `矿山升至 ${game.level} 级，新的矿脉或设施已经解锁。`,
    );
  }
}

function requireUnlocked(economy: MineLinkedEconomy): void {
  if (
    economy.farmLevel < MINE_REQUIRED_FARM_LEVEL ||
    economy.ranchLevel < MINE_REQUIRED_RANCH_LEVEL
  ) {
    throw new MineRuleError(
      "MINE_LOCKED",
      `农场达到 ${MINE_REQUIRED_FARM_LEVEL} 级且牧场达到 ${MINE_REQUIRED_RANCH_LEVEL} 级后开放矿山`,
    );
  }
}

function requireShaft(
  game: MineGameState,
  shaftIndex: number,
  requireUnlocked = true,
): MineShaftState {
  if (
    !Number.isSafeInteger(shaftIndex) ||
    shaftIndex < 0 ||
    shaftIndex >= MINE_MAX_SHAFTS
  ) {
    throw new MineRuleError("MINE_INVALID_SHAFT", "矿井编号无效");
  }
  if (requireUnlocked && shaftIndex >= game.unlockedShafts) {
    throw new MineRuleError("MINE_SHAFT_LOCKED", "这条矿井尚未扩建");
  }
  return game.shafts[shaftIndex]!;
}

function hasHazard(shaft: MineShaftState, now: number): boolean {
  return shaft.hazardAt !== null && shaft.hazardAt <= now && !shaft.reinforced;
}

function pickaxeYieldBonus(level: number): number {
  return MINE_PICKAXE_UPGRADES.find((upgrade) => upgrade.level === level)
    ?.yieldBonus ?? 0;
}

function shaftYield(
  game: MineGameState,
  shaft: MineShaftState,
  now: number,
): number {
  if (!shaft.depositId) return 0;
  const deposit = ALL_MINE_DEPOSITS[shaft.depositId];
  const base = Math.max(
    1,
    deposit.yield +
      pickaxeYieldBonus(game.pickaxeLevel) -
      (hasHazard(shaft, now) ? 1 : 0),
  );
  return Math.max(
    1,
    Math.round(
      base * (100 + (shaft.productionModifierPercent ?? 0)) / 100,
    ),
  );
}

function hashText(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function validQuantity(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= 99;
}

export function createMineGame(input: {
  readonly ownerId: string;
  readonly ownerName: string;
  readonly seed: string;
  readonly now: number;
  readonly townId?: EstateTownId;
}): MineGameState {
  assertTime(input.now);
  if (
    input.ownerId.trim().length === 0 ||
    input.ownerName.trim().length === 0 ||
    input.ownerName.length > 80
  ) {
    throw new Error("矿山玩家资料无效");
  }
  if (input.seed.length < 1 || input.seed.length > 128) {
    throw new Error("矿山随机种子无效");
  }
  const townId = input.townId ?? "greenvale";
  return {
    kind: "mine",
    version: MINE_STATE_VERSION,
    townId,
    seed: input.seed,
    revision: 0,
    ownerId: input.ownerId,
    ownerName: input.ownerName.trim(),
    createdAt: input.now,
    updatedAt: input.now,
    experience: 0,
    level: 1,
    unlockedShafts: MINE_STARTING_SHAFTS,
    pickaxeLevel: 0,
    ores: oreCounts(0, townId),
    relics: 0,
    shafts: Array.from(
      { length: MINE_MAX_SHAFTS },
      (_, index) => emptyShaft(index),
    ),
    statistics: emptyStatistics(),
    logs: [{
      id: 0,
      at: input.now,
      kind: "system",
      text: `矿山档案已经建立；农场 ${MINE_REQUIRED_FARM_LEVEL} 级、牧场 ${MINE_REQUIRED_RANCH_LEVEL} 级后开放。`,
    }],
  };
}

export function applyMineAction(
  state: MineGameState,
  economyState: MineLinkedEconomy,
  action: MineAction,
  now: number,
  production: import("./farming.js").EstateProductionRule = {
    yieldPercent: 0,
    durationPercent: 0,
    label: "常态生产",
  },
): MineActionResult {
  assertTime(now);
  const mine = structuredClone(state);
  if (!isEstateTownId(mine.townId)) mine.townId = "greenvale";
  const economy = structuredClone(economyState);
  const effectiveNow = Math.max(now, mine.updatedAt);
  const deposits = mineDeposits(mine.townId);
  requireUnlocked(economy);
  let farmChanged = false;
  let ranchChanged = false;

  if (action.type === "mine_start") {
    if (!isDepositId(action.depositId, mine.townId)) {
      throw new MineRuleError("MINE_UNKNOWN_DEPOSIT", "矿脉不存在");
    }
    const shaft = requireShaft(mine, action.shaftIndex);
    if (shaft.depositId !== null) {
      throw new MineRuleError("MINE_SHAFT_BUSY", "这条矿井已有采掘队");
    }
    const deposit = deposits[action.depositId];
    if (
      economy.farmLevel < deposit.requiredFarmLevel ||
      economy.ranchLevel < deposit.requiredRanchLevel ||
      mine.level < deposit.requiredMineLevel
    ) {
      throw new MineRuleError(
        "MINE_DEPOSIT_LOCKED",
        `需要农场 ${deposit.requiredFarmLevel} 级、牧场 ${deposit.requiredRanchLevel} 级、矿山 ${deposit.requiredMineLevel} 级`,
      );
    }
    if (economy.coins < deposit.expeditionCost) {
      throw new MineRuleError("MINE_NOT_ENOUGH_COINS", "采掘经费不足");
    }
    if (
      economy.ranchProducts[deposit.rationProductId] <
      deposit.rationAmount
    ) {
      throw new MineRuleError(
        "MINE_NOT_ENOUGH_RATIONS",
        `需要 ${deposit.rationAmount} 份牧场口粮`,
      );
    }
    const duration = Math.max(
      60_000,
      Math.round(
        deposit.durationSeconds * 1_000 *
          (100 + production.durationPercent) / 100,
      ),
    );
    economy.coins -= deposit.expeditionCost;
    economy.ranchProducts[deposit.rationProductId] -= deposit.rationAmount;
    farmChanged = true;
    ranchChanged = true;
    const cycle = shaft.cycle + 1;
    Object.assign(shaft, {
      ...emptyShaft(shaft.index, cycle),
      depositId: deposit.id,
      startedAt: effectiveNow,
      completesAt: effectiveNow + duration,
      hazardAt: effectiveNow + Math.floor(duration * 0.55),
      productionModifierPercent: production.yieldPercent,
      durationModifierPercent: production.durationPercent,
      productionModifierLabel: production.label,
    });
    mine.statistics.expeditionsStarted += 1;
    addExperience(mine, 2, effectiveNow);
    addLog(
      mine,
      effectiveNow,
      "expedition",
      `${shaft.index + 1} 号矿井进入${deposit.name}，支出 ${deposit.expeditionCost} 金币并消耗牧场口粮。`,
    );
  } else if (action.type === "mine_abandon") {
    const shaft = requireShaft(mine, action.shaftIndex);
    if (!shaft.depositId) {
      throw new MineRuleError("MINE_SHAFT_IDLE", "矿井当前没有采掘任务");
    }
    const deposit = deposits[shaft.depositId];
    Object.assign(shaft, emptyShaft(shaft.index, shaft.cycle));
    addLog(
      mine,
      effectiveNow,
      "expedition",
      `放弃 ${shaft.index + 1} 号矿井的${deposit.name}任务；已投入的经费和口粮不予返还。`,
    );
  } else if (action.type === "mine_reinforce") {
    const shaft = requireShaft(mine, action.shaftIndex);
    if (!shaft.depositId || shaft.startedAt === null) {
      throw new MineRuleError("MINE_SHAFT_IDLE", "矿井当前没有采掘任务");
    }
    if (!hasHazard(shaft, effectiveNow)) {
      throw new MineRuleError("MINE_CARE_NOT_NEEDED", "当前没有需要加固的风险点");
    }
    const deposit = deposits[shaft.depositId];
    if (
      economy.ranchProducts[deposit.supportProductId] <
      deposit.supportAmount
    ) {
      throw new MineRuleError(
        "MINE_NOT_ENOUGH_SUPPORT",
        `需要 ${deposit.supportAmount} 份牧场加固材料`,
      );
    }
    economy.ranchProducts[deposit.supportProductId] -= deposit.supportAmount;
    ranchChanged = true;
    shaft.reinforced = true;
    mine.statistics.reinforcements += 1;
    addExperience(mine, 2, effectiveNow);
    addLog(
      mine,
      effectiveNow,
      "care",
      `${shaft.index + 1} 号矿井完成支护加固，避免产量损失。`,
    );
  } else if (action.type === "mine_collect") {
    const shaft = requireShaft(mine, action.shaftIndex);
    if (!shaft.depositId || shaft.completesAt === null) {
      throw new MineRuleError("MINE_SHAFT_IDLE", "矿井当前没有采掘任务");
    }
    if (effectiveNow < shaft.completesAt) {
      throw new MineRuleError("MINE_NOT_READY", "采掘任务尚未完成");
    }
    const deposit = deposits[shaft.depositId];
    const amount = shaftYield(mine, shaft, effectiveNow);
    mine.ores[deposit.id] += amount;
    mine.statistics.expeditionsCompleted += 1;
    mine.statistics.oresCollected += amount;
    addExperience(mine, deposit.collectExperience, effectiveNow);
    const relicFound = shaft.reinforced &&
      hashText(`${mine.seed}:relic:${shaft.index}:${shaft.cycle}`) % 100 < 8;
    if (relicFound) {
      mine.relics += 1;
      mine.statistics.relicsFound += 1;
      addLog(
        mine,
        effectiveNow,
        "progression",
        `${shaft.index + 1} 号矿井发现一件矿山遗物，已收入收藏。`,
      );
    }
    addLog(
      mine,
      effectiveNow,
      "collect",
      `${shaft.index + 1} 号矿井带回 ${amount} 份${deposit.name}${
        hasHazard(shaft, effectiveNow) ? "，因未加固损失 1 份产量" : ""
      }。`,
    );
    Object.assign(shaft, emptyShaft(shaft.index, shaft.cycle));
  } else if (action.type === "mine_sell") {
    if (!isDepositId(action.depositId, mine.townId)) {
      throw new MineRuleError("MINE_UNKNOWN_DEPOSIT", "矿石不存在");
    }
    if (!validQuantity(action.quantity)) {
      throw new MineRuleError("MINE_INVALID_QUANTITY", "出售数量需为 1 至 99");
    }
    if (mine.ores[action.depositId] < action.quantity) {
      throw new MineRuleError("MINE_NOT_ENOUGH_ORE", "矿石仓库库存不足");
    }
    const deposit = deposits[action.depositId];
    const revenue = deposit.orePrice * action.quantity;
    mine.ores[action.depositId] -= action.quantity;
    economy.coins += revenue;
    farmChanged = true;
    mine.statistics.oresSold += action.quantity;
    mine.statistics.coinsEarned += revenue;
    addLog(
      mine,
      effectiveNow,
      "economy",
      `出售 ${action.quantity} 份${deposit.name}，农场账户收入 ${revenue} 金币。`,
    );
  } else if (action.type === "mine_expand_shaft") {
    if (mine.unlockedShafts >= MINE_MAX_SHAFTS) {
      throw new MineRuleError("MINE_MAX_SHAFTS", "全部矿井均已扩建");
    }
    const expansion = MINE_SHAFT_EXPANSIONS.find(
      (candidate) => candidate.shaftIndex === mine.unlockedShafts,
    )!;
    if (
      economy.farmLevel < expansion.requiredFarmLevel ||
      economy.ranchLevel < expansion.requiredRanchLevel ||
      mine.level < expansion.requiredMineLevel
    ) {
      throw new MineRuleError(
        "MINE_LEVEL_REQUIRED",
        `需要农场 ${expansion.requiredFarmLevel} 级、牧场 ${expansion.requiredRanchLevel} 级、矿山 ${expansion.requiredMineLevel} 级`,
      );
    }
    if (economy.coins < expansion.coinCost) {
      throw new MineRuleError("MINE_NOT_ENOUGH_COINS", "扩建矿井的金币不足");
    }
    economy.coins -= expansion.coinCost;
    farmChanged = true;
    mine.unlockedShafts += 1;
    addLog(
      mine,
      effectiveNow,
      "progression",
      `扩建了第 ${mine.unlockedShafts} 条矿井。`,
    );
  } else {
    const upgrade = MINE_PICKAXE_UPGRADES.find(
      (candidate) => candidate.level === mine.pickaxeLevel + 1,
    );
    if (!upgrade) {
      throw new MineRuleError("MINE_PICKAXE_MAX_LEVEL", "采掘工具已经达到最高等级");
    }
    if (
      economy.farmLevel < upgrade.requiredFarmLevel ||
      economy.ranchLevel < upgrade.requiredRanchLevel ||
      mine.level < upgrade.requiredMineLevel
    ) {
      throw new MineRuleError(
        "MINE_LEVEL_REQUIRED",
        `需要农场 ${upgrade.requiredFarmLevel} 级、牧场 ${upgrade.requiredRanchLevel} 级、矿山 ${upgrade.requiredMineLevel} 级`,
      );
    }
    if (economy.coins < upgrade.coinCost) {
      throw new MineRuleError("MINE_NOT_ENOUGH_COINS", "升级采掘工具的金币不足");
    }
    economy.coins -= upgrade.coinCost;
    farmChanged = true;
    mine.pickaxeLevel = upgrade.level;
    addLog(
      mine,
      effectiveNow,
      "progression",
      `采掘工具升至 ${mine.pickaxeLevel} 级，稳定产量提升。`,
    );
  }

  if (farmChanged) economy.farmRevision += 1;
  if (ranchChanged) economy.ranchRevision += 1;
  mine.updatedAt = effectiveNow;
  mine.revision += 1;
  return { mine, economy, farmChanged, ranchChanged };
}

function shaftView(
  game: MineGameState,
  shaft: MineShaftState,
  now: number,
): MineShaftView {
  const ready = shaft.completesAt !== null && now >= shaft.completesAt;
  const progress = shaft.startedAt === null || shaft.completesAt === null
    ? 0
    : Math.max(
        0,
        Math.min(
          1,
          (now - shaft.startedAt) /
            Math.max(1, shaft.completesAt - shaft.startedAt),
        ),
      );
  return {
    ...structuredClone(shaft),
    unlocked: shaft.index < game.unlockedShafts,
    ready,
    progress,
    hasHazard: hasHazard(shaft, now),
    estimatedYield: shaftYield(game, shaft, now),
  };
}

export function getMineGameView(
  state: MineGameState,
  economy: MineLinkedEconomy,
  now: number,
): MineGameView {
  assertTime(now);
  const effectiveNow = Math.max(now, state.updatedAt);
  const townId = mineTownId(state);
  const currentThreshold = MINE_LEVEL_EXPERIENCE[state.level - 1] ?? 0;
  const nextThreshold = MINE_LEVEL_EXPERIENCE[state.level] ?? null;
  return {
    kind: "mine",
    version: MINE_STATE_VERSION,
    townId,
    townDefinition: structuredClone(getTownDefinition(townId)),
    revision: state.revision,
    serverTime: effectiveNow,
    ownerId: state.ownerId,
    ownerName: state.ownerName,
    unlocked: economy.farmLevel >= MINE_REQUIRED_FARM_LEVEL &&
      economy.ranchLevel >= MINE_REQUIRED_RANCH_LEVEL,
    requiredFarmLevel: MINE_REQUIRED_FARM_LEVEL,
    requiredRanchLevel: MINE_REQUIRED_RANCH_LEVEL,
    farmRevision: economy.farmRevision,
    farmLevel: economy.farmLevel,
    ranchRevision: economy.ranchRevision,
    ranchLevel: economy.ranchLevel,
    level: state.level,
    experience: state.experience,
    currentLevelExperience: currentThreshold,
    nextLevelExperience: nextThreshold,
    unlockedShafts: state.unlockedShafts,
    pickaxeLevel: state.pickaxeLevel,
    pickaxeYieldBonus: pickaxeYieldBonus(state.pickaxeLevel),
    deposits: structuredClone(mineDeposits(townId)),
    economy: {
      coins: economy.coins,
      ranchProducts: structuredClone(economy.ranchProducts),
      ores: structuredClone(state.ores),
      relics: state.relics,
    },
    shafts: state.shafts.map((shaft) => shaftView(state, shaft, effectiveNow)),
    nextExpansion: MINE_SHAFT_EXPANSIONS.find(
      (candidate) => candidate.shaftIndex === state.unlockedShafts,
    ) ?? null,
    nextPickaxeUpgrade: MINE_PICKAXE_UPGRADES.find(
      (candidate) => candidate.level === state.pickaxeLevel + 1,
    ) ?? null,
    statistics: structuredClone(state.statistics),
    logs: structuredClone(state.logs),
  };
}

function validOres(
  value: unknown,
  townId: EstateTownId,
): value is MineOreCounts {
  const townDepositIds = mineDepositIds(townId);
  const allowedIds = new Set(townDepositIds as readonly string[]);
  return isRecord(value) &&
    Object.keys(value).length === townDepositIds.length &&
    Object.keys(value).every((depositId) => allowedIds.has(depositId)) &&
    townDepositIds.every((depositId) =>
      isNonNegativeInteger(value[depositId])
    );
}

export function assertRestorableMineGameState(
  value: unknown,
): asserts value is MineGameState {
  if (
    !isRecord(value) ||
    value.kind !== "mine" ||
    value.version !== MINE_STATE_VERSION
  ) {
    throw new Error("矿山存档版本无效");
  }
  if (value.townId !== undefined && !isEstateTownId(value.townId)) {
    throw new Error("矿山城镇无效");
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
    !Number.isSafeInteger(value.unlockedShafts) ||
    Number(value.unlockedShafts) < MINE_STARTING_SHAFTS ||
    Number(value.unlockedShafts) > MINE_MAX_SHAFTS ||
    !Number.isSafeInteger(value.pickaxeLevel) ||
    Number(value.pickaxeLevel) < 0 ||
    Number(value.pickaxeLevel) > MINE_PICKAXE_UPGRADES.length ||
    !validOres(value.ores, townId) ||
    !isNonNegativeInteger(value.relics)
  ) {
    throw new Error("矿山主状态无效");
  }
  if (!Array.isArray(value.shafts) || value.shafts.length !== MINE_MAX_SHAFTS) {
    throw new Error("矿井状态无效");
  }
  for (const [index, shaft] of value.shafts.entries()) {
    if (
      !isRecord(shaft) ||
      shaft.index !== index ||
      !isNonNegativeInteger(shaft.cycle) ||
      (shaft.depositId !== null && !isDepositId(shaft.depositId, townId)) ||
      typeof shaft.reinforced !== "boolean" ||
      (
        shaft.productionModifierPercent !== undefined &&
        (
          !Number.isSafeInteger(shaft.productionModifierPercent) ||
          Number(shaft.productionModifierPercent) < -100 ||
          Number(shaft.productionModifierPercent) > 100
        )
      ) ||
      (
        shaft.durationModifierPercent !== undefined &&
        (
          !Number.isSafeInteger(shaft.durationModifierPercent) ||
          Number(shaft.durationModifierPercent) < -100 ||
          Number(shaft.durationModifierPercent) > 100
        )
      ) ||
      (
        shaft.productionModifierLabel !== undefined &&
        (
          typeof shaft.productionModifierLabel !== "string" ||
          shaft.productionModifierLabel.length > 160
        )
      )
    ) {
      throw new Error("矿井状态无效");
    }
    if (shaft.depositId === null) {
      if (
        shaft.startedAt !== null ||
        shaft.completesAt !== null ||
        shaft.hazardAt !== null ||
        shaft.reinforced
      ) {
        throw new Error("空矿井状态无效");
      }
    } else if (
      !isNonNegativeInteger(shaft.startedAt) ||
      !isNonNegativeInteger(shaft.completesAt) ||
      Number(shaft.completesAt) <= Number(shaft.startedAt) ||
      !isNonNegativeInteger(shaft.hazardAt) ||
      Number(shaft.hazardAt) <= Number(shaft.startedAt) ||
      Number(shaft.hazardAt) >= Number(shaft.completesAt)
    ) {
      throw new Error("采掘任务状态无效");
    }
  }
  if (
    !isRecord(value.statistics) ||
    Object.values(value.statistics).some((entry) => !isNonNegativeInteger(entry)) ||
    !Array.isArray(value.logs) ||
    value.logs.length > MINE_MAX_LOGS
  ) {
    throw new Error("矿山附加状态无效");
  }
}
