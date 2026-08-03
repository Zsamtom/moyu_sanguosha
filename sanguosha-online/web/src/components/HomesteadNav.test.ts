import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { HOMESTEAD_NAV_ENTRIES } from './HomesteadNav';

describe('HomesteadNav', () => {
  it('uses town-neutral sector labels', () => {
    expect(HOMESTEAD_NAV_ENTRIES.map(({ label }) => label)).toEqual([
      '庄园总览',
      '农场',
      '牧场',
      '矿山',
    ]);
    expect(HOMESTEAD_NAV_ENTRIES.some(({ label }) => label.includes('青禾')))
      .toBe(false);
  });

  it('reloads an already active estate screen instead of ignoring the click', () => {
    const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    expect(source).toContain('workspaceView === next');
    expect(source).toContain('setEstateScreenKey((value) => value + 1)');
  });
});
