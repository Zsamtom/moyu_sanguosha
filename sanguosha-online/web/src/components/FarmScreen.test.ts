import { describe, expect, it } from 'vitest';
import type { FarmCropDefinition, FarmPlot, FarmSnapshot } from '../types';
import {
  farmPlotRuntime,
  farmPlotToolAction,
  optimisticFarmAction,
} from './FarmScreen';

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

  it('uses the production modifier captured by the server', () => {
    expect(farmPlotRuntime({
      ...plot(),
      watered: true,
      weedCleared: true,
      pestCleared: true,
      productionModifierPercent: 50,
    }, crop, 301_000).estimatedYield).toBe(5);
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

  it('shows a planted crop and reduced seed inventory before the server responds', () => {
    const snapshot = {
      farm: {
        isOwner: true,
        revision: 4,
        inventory: {
          coins: 100,
          seeds: { wheat: 2 },
          produce: { wheat: 0 },
          mutations: { wheat: 0 },
        },
        crops: { wheat: crop },
        plots: [emptyPlot],
        market: { wheat: { price: 6 } },
      },
      neighbors: [],
      marketDirectorAvailable: false,
    } as unknown as FarmSnapshot;

    const optimistic = optimisticFarmAction(snapshot, {
      type: 'farming_plant',
      cropId: 'wheat',
      plotIndex: 2,
    }, 10_000);

    expect(optimistic.farm).toMatchObject({
      revision: 5,
      inventory: { seeds: { wheat: 1 } },
      plots: [{
        cropId: 'wheat',
        plantedAt: 10_000,
        maturesAt: 310_000,
      }],
    });
    expect(snapshot.farm.inventory!.seeds.wheat).toBe(2);
    expect(snapshot.farm.plots[0]!.cropId).toBeNull();
  });
});
