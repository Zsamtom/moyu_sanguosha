import { describe, expect, it } from 'vitest';
import type { FarmCropDefinition, FarmPlot } from '../types';
import { farmPlotRuntime } from './FarmScreen';

const crop: FarmCropDefinition = {
  id: 'wheat',
  name: '小麦',
  unlockLevel: 1,
  seedCost: 3,
  basePrice: 6,
  minimumPrice: 4,
  maximumPrice: 9,
  growthSeconds: 300,
  yield: 3,
  harvestExperience: 8,
};

function plot(): FarmPlot {
  return {
    index: 0,
    cycle: 1,
    cropId: 'wheat',
    plantedAt: 1_000,
    maturesAt: 301_000,
    watered: false,
    weedAt: 121_000,
    pestAt: 196_000,
    weedCleared: false,
    pestCleared: false,
    stolen: 0,
    stealAttempts: [],
    stolenBy: [],
    unlocked: true,
    ready: false,
    progress: 0,
    hasWeeds: false,
    hasPests: false,
    estimatedYield: 2,
    maximumStealable: 0,
  };
}

describe('FarmScreen real-time plot projection', () => {
  it('advances growth from local display time between server refreshes', () => {
    expect(farmPlotRuntime(plot(), crop, 151_000)).toMatchObject({
      ready: false,
      progress: 50,
      hasWeeds: true,
      hasPests: false,
      estimatedYield: 1,
      remainingMs: 150_000,
    });
  });

  it('reflects care and maturity without trusting stale ready flags', () => {
    const cared = {
      ...plot(),
      watered: true,
      weedCleared: true,
      pestCleared: true,
    };
    expect(farmPlotRuntime(cared, crop, 301_000)).toMatchObject({
      ready: true,
      progress: 100,
      hasWeeds: false,
      hasPests: false,
      estimatedYield: 3,
      remainingMs: 0,
    });
  });
});
