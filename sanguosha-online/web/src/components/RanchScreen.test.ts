import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type {
  RanchAnimalDefinition,
  RanchClientAction,
  RanchGameView,
  RanchPen,
  RanchSnapshot,
} from '../types';
import {
  canCommitRanchSnapshot,
  ranchAnimalCatalogIds,
  ranchAnimalName,
  ranchFeedName,
  ranchPenRuntime,
} from './RanchScreen';

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
  careCost: 5,
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

  it('uses the disaster bonus captured at feeding time', () => {
    expect(ranchPenRuntime(
      { ...pen(), messCleaned: true, productionModifierPercent: 50 },
      animal,
      601_000,
    ).estimatedYield).toBe(5);
  });

  it('offers queued one-click cleaning and collection', () => {
    const source = readFileSync(
      new URL('./RanchScreen.tsx', import.meta.url),
      'utf8',
    );
    expect(source).toContain("type: 'ranch_clean_all'");
    expect(source).toContain("type: 'ranch_collect_all'");
    expect(source).toContain('后台保存队列');
  });
});

describe('RanchScreen town-scoped snapshot guard', () => {
  const snapshot = (
    townId: RanchGameView['townId'],
    farmRevision: number,
    ranchRevision: number,
  ) => ({
    ranch: { townId, farmRevision, revision: ranchRevision },
  }) as unknown as RanchSnapshot;

  it('accepts either town at lower revisions and rejects same-town rollback', () => {
    expect(canCommitRanchSnapshot(
      snapshot('frostpeak', 1, 0),
      snapshot('greenvale', 52, 28),
    )).toBe(true);
    expect(canCommitRanchSnapshot(
      snapshot('greenvale', 2, 1),
      snapshot('frostpeak', 37, 16),
    )).toBe(true);
    expect(canCommitRanchSnapshot(
      snapshot('greenvale', 51, 29),
      snapshot('greenvale', 52, 28),
    )).toBe(false);
  });
});

describe('RanchScreen town catalog', () => {
  const snowChicken: RanchAnimalDefinition = {
    ...animal,
    id: 'snow_chicken',
    name: '雪羽鸡',
    productId: 'snow_egg',
    productName: '雪羽蛋',
    feedCropId: 'frost_barley',
  };
  const yak: RanchAnimalDefinition = {
    ...animal,
    id: 'yak',
    name: '牦牛',
    productId: 'yak_milk',
    productName: '牦牛奶',
    feedCropId: 'highland_bean',
  };
  const frostpeak = {
    townDefinition: {
      content: {
        animalIds: ['yak', 'snow_chicken'],
      },
    },
    animals: {
      snow_chicken: snowChicken,
      yak,
    },
  } as unknown as RanchGameView;

  it('uses the Frostpeak animal catalog and feed labels from the active view', () => {
    expect(ranchAnimalCatalogIds(frostpeak)).toEqual([
      'yak',
      'snow_chicken',
    ]);
    expect(ranchAnimalName(frostpeak, 'yak')).toBe('牦牛');
    expect(ranchFeedName('frost_barley')).toBe('霜麦');
    expect(ranchAnimalName(
      { animals: {} } as unknown as RanchGameView,
      'cashmere_goat',
    )).toBe('Cashmere Goat');
  });

  it('accepts a Frostpeak purchase action without translating it to Greenvale', () => {
    const action: RanchClientAction = {
      type: 'ranch_buy_animal',
      animalId: 'yak',
      penIndex: 2,
    };
    expect(action).toEqual({
      type: 'ranch_buy_animal',
      animalId: 'yak',
      penIndex: 2,
    });
  });
});
