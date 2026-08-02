import type { EstateTownId } from "./towns/registry.js";

export type HomesteadTownRhythmSectorId = "farm" | "ranch" | "mine";

export const HOMESTEAD_TOWN_RHYTHM_IDS = [
  "greenvale_water_cycle",
  "frostpeak_thermal_cycle",
] as const;

export type HomesteadTownRhythmId =
  (typeof HOMESTEAD_TOWN_RHYTHM_IDS)[number];

export interface HomesteadTownRhythmStepDefinition {
  readonly sectorId: HomesteadTownRhythmSectorId;
  readonly name: string;
  readonly description: string;
}

export interface HomesteadTownRhythmEffect {
  readonly label: string;
  readonly farm?: {
    readonly yieldPercent: number;
    readonly durationPercent: number;
  };
  readonly ranch?: {
    readonly yieldPercent: number;
    readonly durationPercent: number;
  };
  readonly mine?: {
    readonly yieldPercent: number;
    readonly durationPercent: number;
  };
  readonly marketSellPercent?: number;
}

export interface HomesteadTownRhythmDefinition {
  readonly id: HomesteadTownRhythmId;
  readonly townId: EstateTownId;
  readonly name: string;
  readonly summary: string;
  readonly steps: readonly [
    HomesteadTownRhythmStepDefinition,
    HomesteadTownRhythmStepDefinition,
    HomesteadTownRhythmStepDefinition,
  ];
  /** Cumulative effects after completing one, two, or all three steps. */
  readonly effects: Readonly<Record<1 | 2 | 3, HomesteadTownRhythmEffect>>;
}

export const HOMESTEAD_TOWN_RHYTHMS: Readonly<
  Record<HomesteadTownRhythmId, HomesteadTownRhythmDefinition>
> = {
  greenvale_water_cycle: {
    id: "greenvale_water_cycle",
    townId: "greenvale",
    name: "河谷水肥循环",
    summary:
      "先安排轮作蓄水，再把副产物投入牧群，最后组织矿务排水；顺序完整时形成河谷三业闭环。",
    steps: [
      {
        sectorId: "farm",
        name: "轮作蓄水",
        description: "先完成农场轮作，让水肥调度有稳定起点。",
      },
      {
        sectorId: "ranch",
        name: "牧肥回田",
        description: "再完成牧群计划，把饲草与有机副产物接回农田。",
      },
      {
        sectorId: "mine",
        name: "矿务排水",
        description: "最后完成矿层调查，利用排水和运输收束三业循环。",
      },
    ],
    effects: {
      1: {
        label: "河谷水肥循环·轮作蓄水",
        farm: { yieldPercent: 4, durationPercent: 0 },
      },
      2: {
        label: "河谷水肥循环·牧肥回田",
        farm: { yieldPercent: 4, durationPercent: -2 },
        ranch: { yieldPercent: 5, durationPercent: 0 },
      },
      3: {
        label: "河谷水肥循环·三业闭环",
        farm: { yieldPercent: 6, durationPercent: -2 },
        ranch: { yieldPercent: 5, durationPercent: -2 },
        mine: { yieldPercent: 0, durationPercent: -6 },
        marketSellPercent: 2,
      },
    },
  },
  frostpeak_thermal_cycle: {
    id: "frostpeak_thermal_cycle",
    townId: "frostpeak",
    name: "雪线地热供能",
    summary:
      "先由矿山确认热脉，再为温室供热，最后稳定牧棚；霜岭必须从能源端反向组织农牧生产。",
    steps: [
      {
        sectorId: "mine",
        name: "热脉勘定",
        description: "先完成矿层调查，确认当天可调用的地热与燃料能力。",
      },
      {
        sectorId: "farm",
        name: "温室供热",
        description: "再完成高寒轮作，把热力优先送入温室和滴灌管网。",
      },
      {
        sectorId: "ranch",
        name: "牧棚余热",
        description: "最后完成牧群计划，用余热稳定营养、饮水和产品形成。",
      },
    ],
    effects: {
      1: {
        label: "雪线地热供能·热脉勘定",
        mine: { yieldPercent: 0, durationPercent: -5 },
      },
      2: {
        label: "雪线地热供能·温室供热",
        farm: { yieldPercent: 6, durationPercent: -3 },
        mine: { yieldPercent: 0, durationPercent: -5 },
      },
      3: {
        label: "雪线地热供能·全网稳定",
        farm: { yieldPercent: 6, durationPercent: -3 },
        ranch: { yieldPercent: 7, durationPercent: -3 },
        mine: { yieldPercent: 2, durationPercent: -5 },
      },
    },
  },
};

export interface HomesteadTownRhythmState {
  dayKey: string;
  progress: 0 | 1 | 2 | 3;
  completedCycles: number;
}

export function townRhythmDefinition(
  townId: EstateTownId,
): HomesteadTownRhythmDefinition {
  return HOMESTEAD_TOWN_RHYTHMS[
    townId === "frostpeak"
      ? "frostpeak_thermal_cycle"
      : "greenvale_water_cycle"
  ];
}

export function createHomesteadTownRhythmState(
  dayKey: string,
): HomesteadTownRhythmState {
  return { dayKey, progress: 0, completedCycles: 0 };
}

export function refreshHomesteadTownRhythmState(
  state: HomesteadTownRhythmState,
  dayKey: string,
): HomesteadTownRhythmState {
  return state.dayKey === dayKey
    ? state
    : { ...state, dayKey, progress: 0 };
}

export function advanceHomesteadTownRhythm(
  state: HomesteadTownRhythmState,
  townId: EstateTownId,
  sectorId: HomesteadTownRhythmSectorId,
  dayKey: string,
): {
  readonly state: HomesteadTownRhythmState;
  readonly advanced: boolean;
  readonly completed: boolean;
} {
  const current = refreshHomesteadTownRhythmState(state, dayKey);
  if (current.progress >= 3) {
    return { state: current, advanced: false, completed: false };
  }
  const definition = townRhythmDefinition(townId);
  const expected = definition.steps[current.progress as 0 | 1 | 2];
  if (expected?.sectorId !== sectorId) {
    return { state: current, advanced: false, completed: false };
  }
  const progress = (current.progress + 1) as 1 | 2 | 3;
  const completed = progress === 3;
  return {
    state: {
      ...current,
      progress,
      completedCycles: current.completedCycles + (completed ? 1 : 0),
    },
    advanced: true,
    completed,
  };
}

export function homesteadTownRhythmEffect(
  state: HomesteadTownRhythmState,
  townId: EstateTownId,
  dayKey: string,
): HomesteadTownRhythmEffect | null {
  const current = refreshHomesteadTownRhythmState(state, dayKey);
  if (current.progress < 1) return null;
  return townRhythmDefinition(townId).effects[current.progress as 1 | 2 | 3];
}
