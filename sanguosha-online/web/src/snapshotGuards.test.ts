import { describe, expect, it } from 'vitest';
import {
  isLatestRequest,
  isRevisionVectorAtLeast,
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
});
