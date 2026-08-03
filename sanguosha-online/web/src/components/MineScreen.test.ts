import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type {
  MineClientAction,
  MineDepositDefinition,
  MineGameView,
  MineShaft,
  MineSnapshot,
} from '../types';
import {
  canCommitMineSnapshot,
  mineDepositCatalogIds,
  mineDepositName,
  mineProductName,
  mineShaftRuntime,
} from './MineScreen';

const deposit: MineDepositDefinition = {
  id: 'coal',
  name: '煤层',
  requiredFarmLevel: 6,
  requiredRanchLevel: 3,
  requiredMineLevel: 1,
  expeditionCost: 20,
  rationProductId: 'egg',
  rationAmount: 1,
  supportProductId: 'rabbit_fur',
  supportAmount: 1,
  durationSeconds: 900,
  yield: 3,
  orePrice: 25,
  collectExperience: 16,
};

function shaft(): MineShaft {
  return {
    index: 0,
    cycle: 1,
    depositId: 'coal',
    startedAt: 1_000,
    completesAt: 901_000,
    hazardAt: 496_000,
    reinforced: false,
    unlocked: true,
    ready: false,
    progress: 0,
    hasHazard: false,
    estimatedYield: 3,
  };
}

describe('MineScreen real-time shaft projection', () => {
  it('advances mining and applies the unreinforced yield penalty locally', () => {
    expect(mineShaftRuntime(shaft(), deposit, 0, 601_000)).toMatchObject({
      ready: false,
      progress: 67,
      hasHazard: true,
      estimatedYield: 2,
      remainingMs: 300_000,
    });
  });

  it('reflects tool bonuses, reinforcement and completion', () => {
    expect(mineShaftRuntime(
      { ...shaft(), reinforced: true },
      deposit,
      2,
      901_000,
    )).toMatchObject({
      ready: true,
      progress: 100,
      hasHazard: false,
      estimatedYield: 6,
      remainingMs: 0,
    });
  });

  it('uses the emergency efficiency captured at expedition start', () => {
    expect(mineShaftRuntime(
      {
        ...shaft(),
        reinforced: true,
        productionModifierPercent: 50,
      },
      deposit,
      2,
      901_000,
    ).estimatedYield).toBe(9);
  });

  it('offers queued one-click reinforcement and collection', () => {
    const source = readFileSync(
      new URL('./MineScreen.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toContain("type: 'mine_reinforce_all'");
    expect(source).toContain("type: 'mine_collect_all'");
    expect(source).toContain('后台保存队列');
  });
});

describe('MineScreen town-scoped snapshot guard', () => {
  const snapshot = (
    townId: MineGameView['townId'],
    farmRevision: number,
    ranchRevision: number,
    mineRevision: number,
  ) => ({
    mine: {
      townId,
      farmRevision,
      ranchRevision,
      revision: mineRevision,
    },
  }) as unknown as MineSnapshot;

  it('accepts either town at lower revisions and rejects same-town rollback', () => {
    expect(canCommitMineSnapshot(
      snapshot('frostpeak', 1, 0, 0),
      snapshot('greenvale', 55, 30, 14),
    )).toBe(true);
    expect(canCommitMineSnapshot(
      snapshot('greenvale', 2, 1, 0),
      snapshot('frostpeak', 41, 20, 9),
    )).toBe(true);
    expect(canCommitMineSnapshot(
      snapshot('greenvale', 54, 31, 14),
      snapshot('greenvale', 55, 30, 14),
    )).toBe(false);
  });
});

describe('MineScreen town catalog', () => {
  const lignite: MineDepositDefinition = {
    ...deposit,
    id: 'lignite',
    name: '褐煤层',
    rationProductId: 'snow_egg',
    supportProductId: 'angora_fur',
  };
  const frostCrystal: MineDepositDefinition = {
    ...deposit,
    id: 'frost_crystal',
    name: '霜晶洞',
    rationProductId: 'cashmere',
    supportProductId: 'highland_wool',
  };
  const frostpeak = {
    townDefinition: {
      content: {
        depositIds: ['frost_crystal', 'lignite'],
      },
    },
    deposits: {
      lignite,
      frost_crystal: frostCrystal,
    },
  } as unknown as MineGameView;

  it('uses Frostpeak deposits and supply names from the active town data', () => {
    expect(mineDepositCatalogIds(frostpeak)).toEqual([
      'frost_crystal',
      'lignite',
    ]);
    expect(mineDepositName(frostpeak, 'frost_crystal')).toBe('霜晶洞');
    expect(mineProductName('highland_wool')).toBe('高地羊毛');
    expect(mineDepositName(
      { deposits: {} } as unknown as MineGameView,
      'glacier_gold',
    )).toBe('Glacier Gold');
  });

  it('keeps a Frostpeak expedition action on the selected local deposit', () => {
    const action: MineClientAction = {
      type: 'mine_start',
      depositId: 'frost_crystal',
      shaftIndex: 1,
    };
    expect(action).toEqual({
      type: 'mine_start',
      depositId: 'frost_crystal',
      shaftIndex: 1,
    });
  });
});
