import { describe, expect, it } from 'vitest';
import type { RanchAnimalDefinition, RanchPen } from '../types';
import { ranchPenRuntime } from './RanchScreen';

const animal: RanchAnimalDefinition = {
  id: 'chicken',
  name: '母鸡',
  productId: 'egg',
  productName: '鸡蛋',
  requiredFarmLevel: 3,
  requiredRanchLevel: 1,
  purchaseCost: 80,
  resalePrice: 40,
  feedCropId: 'wheat',
  feedAmount: 1,
  productionSeconds: 600,
  yield: 3,
  productPrice: 18,
  collectExperience: 14,
};

function pen(): RanchPen {
  return {
    index: 0,
    cycle: 1,
    animalId: 'chicken',
    fedAt: 1_000,
    producesAt: 601_000,
    messAt: 313_000,
    messCleaned: false,
    taken: 0,
    collectAttempts: [],
    takenBy: [],
    unlocked: true,
    ready: false,
    progress: 0,
    hasMess: false,
    estimatedYield: 3,
    maximumNeighborCollectable: 1,
  };
}

describe('RanchScreen real-time pen projection', () => {
  it('advances production and applies the unattended yield penalty locally', () => {
    expect(ranchPenRuntime(pen(), animal, 401_000)).toMatchObject({
      ready: false,
      progress: 67,
      hasMess: true,
      estimatedYield: 2,
      remainingMs: 200_000,
    });
  });

  it('reflects cleaning and readiness without trusting stale server flags', () => {
    expect(ranchPenRuntime(
      { ...pen(), messCleaned: true },
      animal,
      601_000,
    )).toMatchObject({
      ready: true,
      progress: 100,
      hasMess: false,
      estimatedYield: 3,
      remainingMs: 0,
    });
  });
});
