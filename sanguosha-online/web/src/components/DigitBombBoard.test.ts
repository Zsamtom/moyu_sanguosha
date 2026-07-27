import { describe, expect, it } from 'vitest';
import {
  digitBombCardBackSlots,
  digitBombFeedbackLabel,
  digitBombFeedbackOptions,
  digitBombVisibleSecretSlots,
  generateRandomDigitCode,
  sanitizeDigitBombEntry,
} from './DigitBombBoard';

describe('Digit Bomb controls', () => {
  it('keeps leading zeroes and repeated digits while removing non-digits', () => {
    expect(sanitizeDigitBombEntry('00a11-22', 6)).toBe('001122');
    expect(sanitizeDigitBombEntry('000000000', 4)).toBe('0000');
  });

  it('generates an exact-length code without forbidding zeroes or repeats', () => {
    const draws = [0, 0, 7, 7];
    expect(generateRandomDigitCode(4, () => draws.shift() ?? 0)).toBe('0077');
  });

  it('offers every manual feedback value without deriving an answer', () => {
    expect(digitBombFeedbackOptions(4)).toEqual([0, 1, 2, 3, 4]);
    expect(digitBombFeedbackLabel({ value: '0123', feedback: null }, 4)).toBe('等待反馈');
    expect(digitBombFeedbackLabel({ value: '0123', feedback: 4 }, 4)).toBe('完全命中');
  });

  it('renders one password card-back slot per configured digit', () => {
    expect(digitBombCardBackSlots(1)).toEqual([0]);
    expect(digitBombCardBackSlots(8)).toHaveLength(8);
  });

  it('always reveals a valid secret on the viewing player card', () => {
    expect(digitBombVisibleSecretSlots('0077', 4, true)).toEqual([
      '0',
      '0',
      '7',
      '7',
    ]);
    expect(digitBombVisibleSecretSlots('0077', 4, false)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('keeps malformed private-view values concealed', () => {
    expect(digitBombVisibleSecretSlots('123', 4, true)).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(digitBombVisibleSecretSlots('12a4', 4, true)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });
});
