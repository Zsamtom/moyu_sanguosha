import { describe, expect, it } from 'vitest';
import {
  isLatestRequest,
  isRevisionVectorAtLeast,
  isTownRevisionVectorAtLeast,
} from './snapshotGuards';

describe('snapshot request guards', () => {
  it('accepts only the latest response in a request sequence', () => {
    expect(isLatestRequest(4, 4)).toBe(true);
    expect(isLatestRequest(3, 4)).toBe(false);
  });

  it('rejects a snapshot when any linked revision would move backwards', () => {
    expect(isRevisionVectorAtLeast([8, 12, 5], [7, 12, 5])).toBe(true);
    expect(isRevisionVectorAtLeast([8, 11, 6], [7, 12, 5])).toBe(false);
    expect(isRevisionVectorAtLeast([8], undefined)).toBe(true);
    expect(isRevisionVectorAtLeast([8, 1], [8])).toBe(false);
  });

  it('scopes monotonic revisions to one town and accepts either travel direction', () => {
    expect(isTownRevisionVectorAtLeast(
      'frostpeak',
      [1, 0, 0],
      'greenvale',
      [40, 32, 18],
    )).toBe(true);
    expect(isTownRevisionVectorAtLeast(
      'greenvale',
      [3, 2, 1],
      'frostpeak',
      [19, 12, 8],
    )).toBe(true);
    expect(isTownRevisionVectorAtLeast(
      'greenvale',
      [39, 33, 18],
      'greenvale',
      [40, 32, 18],
    )).toBe(false);
  });
});
