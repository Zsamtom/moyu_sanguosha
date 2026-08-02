/**
 * Applies a percentage modifier to an integer production amount without
 * allowing a non-zero bonus or penalty to disappear through rounding.
 *
 * Production engines guarantee at least one item for a completed cycle, so a
 * -100% modifier still settles at one rather than deleting the whole harvest.
 */
export function applyDiscreteProductionModifier(
  baseAmount: number,
  percent: number,
): number {
  const base = Math.max(0, Math.floor(baseAmount));
  if (base === 0 || percent === 0) return base;
  const exact = base * (100 + Math.max(-100, Math.min(100, percent))) / 100;
  if (percent > 0) return Math.max(base + 1, Math.round(exact));
  return Math.max(1, Math.min(base - 1, Math.round(exact)));
}

export interface AccumulatedProductionResult {
  readonly quantity: number;
  readonly remainder: number;
  readonly exactQuantity: number;
}

/**
 * Settles an integer harvest while retaining the signed fractional remainder.
 * The UI only receives `quantity`; the next completed cycle consumes
 * `remainder`, so repeated +15%/-15% cycles converge to the exact multiplier.
 */
export function applyAccumulatedProductionModifier(
  baseAmount: number,
  percent: number,
  previousRemainder: number,
): AccumulatedProductionResult {
  const base = Math.max(0, Math.floor(baseAmount));
  const carry = Number.isFinite(previousRemainder)
    ? Math.max(-0.999999, Math.min(0.999999, previousRemainder))
    : 0;
  if (base === 0) {
    return { quantity: 0, remainder: carry, exactQuantity: 0 };
  }
  const normalizedPercent = Math.max(-100, Math.min(100, percent));
  const exactQuantity = base * (100 + normalizedPercent) / 100 + carry;
  const quantity = Math.max(1, Math.round(exactQuantity));
  const remainder = Math.round((exactQuantity - quantity) * 1_000_000) /
    1_000_000;
  return { quantity, remainder, exactQuantity };
}

export function applyPriceModifier(basePrice: number, percent = 0): number {
  const normalized = Math.max(-80, Math.min(100, percent));
  return Math.max(1, Math.round(basePrice * (100 + normalized) / 100));
}
