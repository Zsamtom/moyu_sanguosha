import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type {
  FarmCropDefinition,
  FarmGameView,
  FarmPlot,
  FarmSnapshot,
} from '../types';
import {
  canCommitFarmSnapshot,
  farmCropCatalogIds,
  farmCropName,
  farmPlotCardAction,
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

  it('never executes a destructive shovel action from the whole plot card', () => {
    const clearAction = farmPlotToolAction(
      { type: 'shovel' },
      { ...emptyPlot, cropId: 'wheat' },
    );
    const plantAction = farmPlotToolAction(
      { type: 'plant', cropId: 'wheat' },
      emptyPlot,
    );

    expect(farmPlotCardAction(clearAction, true)).toBeNull();
    expect(farmPlotCardAction(plantAction, true)).toEqual(plantAction);
    expect(farmPlotCardAction(plantAction, false)).toBeNull();
  });

  it('requires an explicit confirmation before clearing a planted plot', () => {
    const source = readFileSync(
      new URL('./FarmScreen.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toContain('<Popconfirm');
    expect(source).toContain('确认铲除');
    expect(source).toContain('作物、种子与本轮投入都不会返还');
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

describe('FarmScreen town-scoped snapshot guard', () => {
  const snapshot = (
    townId: FarmGameView['townId'],
    revision: number,
  ) => ({
    farm: { townId, revision },
  }) as unknown as FarmSnapshot;

  it('accepts either town at a lower revision and rejects same-town rollback', () => {
    expect(canCommitFarmSnapshot(
      snapshot('frostpeak', 1),
      snapshot('greenvale', 48),
    )).toBe(true);
    expect(canCommitFarmSnapshot(
      snapshot('greenvale', 2),
      snapshot('frostpeak', 31),
    )).toBe(true);
    expect(canCommitFarmSnapshot(
      snapshot('greenvale', 47),
      snapshot('greenvale', 48),
    )).toBe(false);
  });
});

describe('FarmScreen town catalog', () => {
  const frostBarley: FarmCropDefinition = {
    ...crop,
    id: 'frost_barley',
    name: '霜麦',
    seedCost: 4,
    basePrice: 7,
  };
  const snowPotato: FarmCropDefinition = {
    ...crop,
    id: 'snow_potato',
    name: '雪薯',
    seedCost: 6,
    basePrice: 10,
  };
  const frostpeak = {
    townDefinition: {
      content: {
        cropIds: ['snow_potato', 'frost_barley'],
      },
    },
    crops: {
      frost_barley: frostBarley,
      snow_potato: snowPotato,
    },
  } as unknown as FarmGameView;

  it('renders the Frostpeak ordering and labels from the current town view', () => {
    expect(farmCropCatalogIds(frostpeak)).toEqual([
      'snow_potato',
      'frost_barley',
    ]);
    expect(farmCropName(frostpeak, 'frost_barley')).toBe('霜麦');
    expect(farmCropName(
      { crops: {} } as unknown as FarmGameView,
      'aurora_fruit',
    )).toBe('Aurora Fruit');
  });

  it('optimistically plants a Frostpeak crop without a Greenvale catalog entry', () => {
    const snapshot = {
      farm: {
        ...frostpeak,
        isOwner: true,
        revision: 9,
        inventory: {
          coins: 100,
          seeds: { frost_barley: 2 },
          produce: { frost_barley: 0 },
          mutations: { frost_barley: 0 },
        },
        plots: [{
          index: 0,
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
        }],
        market: { frost_barley: { price: 7 } },
      },
      neighbors: [],
      marketDirectorAvailable: false,
    } as unknown as FarmSnapshot;

    const optimistic = optimisticFarmAction(snapshot, {
      type: 'farming_plant',
      cropId: 'frost_barley',
      plotIndex: 0,
    }, 20_000);

    expect(optimistic.farm.inventory?.seeds.frost_barley).toBe(1);
    expect(optimistic.farm.plots[0]).toMatchObject({
      cropId: 'frost_barley',
      plantedAt: 20_000,
      maturesAt: 320_000,
    });
  });
});
