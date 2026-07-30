import { describe, expect, it } from 'vitest';
import type { MineDepositDefinition, MineShaft } from '../types';
import { mineShaftRuntime } from './MineScreen';

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
      estimatedYield: 5,
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
    ).estimatedYield).toBe(8);
  });
});
