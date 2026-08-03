import { describe, expect, it } from 'vitest';
import { formatBatchProductionModifier } from './ProductionModifierTag';

describe('batch production modifier presentation', () => {
  it('collapses yield and duration into one short batch label', () => {
    expect(formatBatchProductionModifier(3, 0)).toBe(
      '本批：产量 +3% · 工期 0%',
    );
    expect(formatBatchProductionModifier(-8, 6)).toBe(
      '本批：产量 -8% · 工期 +6%',
    );
    expect(formatBatchProductionModifier(0, 0)).toBeNull();
  });
});
