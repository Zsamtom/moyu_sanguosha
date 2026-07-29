import { describe, expect, it } from 'vitest';
import type { FarmCropDefinition, FarmPlot } from '../types';
import { farmPlotRuntime, farmPlotToolAction } from './FarmScreen';

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

describe('FarmScreen plot toolbar', () => {
  const emptyPlot: FarmPlot = {
    index: 2,
    cycle: 0,
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
    unlocked: true,
    ready: false,
    progress: 0,
    hasWeeds: false,
    hasPests: false,
    estimatedYield: 0,
    maximumStealable: 0,
  };

  it('maps crop and shovel selection to the matching authoritative action', () => {
    expect(farmPlotToolAction(
      { type: 'plant', cropId: 'corn' },
      emptyPlot,
    )).toEqual({
      type: 'farming_plant',
      cropId: 'corn',
      plotIndex: 2,
    });
    expect(farmPlotToolAction(
      { type: 'shovel' },
      { ...emptyPlot, cropId: 'wheat' },
    )).toEqual({
      type: 'farming_clear_plot',
      plotIndex: 2,
    });
  });

  it('does not offer a nonsensical plot action', () => {
    expect(farmPlotToolAction({ type: 'shovel' }, emptyPlot)).toBeNull();
    expect(farmPlotToolAction(
      { type: 'plant', cropId: 'wheat' },
      { ...emptyPlot, cropId: 'carrot' },
    )).toBeNull();
    expect(farmPlotToolAction(
      { type: 'plant', cropId: 'wheat' },
      { ...emptyPlot, unlocked: false },
    )).toBeNull();
  });
});
