import { describe, expect, it } from 'vitest';
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
});
