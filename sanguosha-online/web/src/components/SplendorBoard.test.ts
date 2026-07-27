import { describe, expect, it } from 'vitest';
import {
  pokemonSprite,
  shouldShowNobleGallery,
  splendorCardDisplayName,
  splendorResourceLabel,
} from './SplendorBoard';
import type { SplendorCard, SplendorColor } from '../types';

describe('Splendor Pokémon artwork', () => {
  it('maps Chinese card names to the copied reference sprites', () => {
    expect(pokemonSprite('皮卡丘')).toBe('/assets/splendor-pokemon/pokemon/25.png');
    expect(pokemonSprite('喷火龙')).toBe('/assets/splendor-pokemon/pokemon/6.png');
    expect(pokemonSprite('烈空坐')).toBe('/assets/splendor-pokemon/pokemon/384.png');
  });

  it('does not invent artwork for an unknown server card', () => {
    expect(pokemonSprite('未知宝可梦')).toBeUndefined();
  });

  it('uses Poké Ball names for all six Pokémon resources', () => {
    expect(['red', 'blue', 'black', 'pink', 'yellow', 'purple'].map((color) =>
      splendorResourceLabel(color as SplendorColor, true),
    )).toEqual(['精灵球', '超级球', '高级球', '治愈球', '快速球', '大师球']);
  });

  it('replaces generated classic card names without changing Pokémon names', () => {
    const classicCard: SplendorCard = {
      id: 'classic-1-01',
      name: '1级white发展卡01',
      level: 1,
      points: 0,
      cost: { blue: 1 },
      bonus: 'white',
      bonusCount: 1,
    };
    expect(splendorCardDisplayName(classicCard, false)).toBe('钻石工坊');
    expect(splendorCardDisplayName({ ...classicCard, name: '皮卡丘' }, true)).toBe('皮卡丘');
  });

  it('hides the empty Pokémon noble gallery', () => {
    expect(shouldShowNobleGallery([])).toBe(false);
    expect(shouldShowNobleGallery([{ id: 'noble-1', points: 3, requirement: {} }])).toBe(true);
  });
});
