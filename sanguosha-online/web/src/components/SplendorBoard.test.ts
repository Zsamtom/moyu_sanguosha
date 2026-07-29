import { describe, expect, it } from 'vitest';
import {
  classicCardArtwork,
  classicNobleArtwork,
  pokemonSprite,
  shouldShowNobleGallery,
  splendorCardDisplayName,
  splendorDeckArtwork,
  splendorResourceArtwork,
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

  it('maps classic cards, nobles, decks, and gems to upstream artwork', () => {
    const card: SplendorCard = {
      id: 'classic-1-01',
      name: '1级black发展卡01',
      level: 1,
      points: 1,
      cost: { blue: 4 },
      bonus: 'black',
      bonusCount: 1,
    };
    expect(classicCardArtwork(card)).toBe('/assets/splendor-classic/cards/green-01.jpg');
    expect(classicCardArtwork({ ...card, id: 'classic-2-01' })).toBeUndefined();
    expect(classicNobleArtwork({
      id: 'classic-noble-10',
      points: 3,
      requirement: { blue: 3, green: 3, red: 3 },
    })).toBe('/assets/splendor-classic/nobles/nobles-10.jpg');
    expect(splendorDeckArtwork(3, false)).toBe('/assets/splendor-classic/cards/blue-00.jpg');
    expect(splendorResourceArtwork('gold', false)).toBe('/assets/splendor-classic/gems/goldGem.jpg');
  });

  it('maps Pokémon table pieces to the upstream UI assets', () => {
    expect(splendorDeckArtwork('legendary', true)).toBe('/assets/splendor-pokemon/ui/card-back.png');
    expect(splendorResourceArtwork('purple', true)).toBe('/assets/splendor-pokemon/ui/token-purple.png');
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
