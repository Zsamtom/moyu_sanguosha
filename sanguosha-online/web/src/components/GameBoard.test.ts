import { describe, expect, it } from 'vitest';
import { huashenChoiceAction, huashenChoiceLabel } from './GameBoard';

describe('Huashen choices', () => {
  it('shows private general and skill names in Chinese', () => {
    expect(huashenChoiceLabel('huashen:zhang_liao:tuxi')).toBe('张辽 · 突袭');
  });

  it('submits the selected private form token', () => {
    expect(huashenChoiceAction('zuo-ci', 'huashen-initial', 'huashen:zhang_liao:tuxi')).toEqual({
      type: 'resolve_standard_skill',
      playerId: 'zuo-ci',
      promptId: 'huashen-initial',
      activate: true,
      tokens: ['huashen:zhang_liao:tuxi'],
    });
  });
});
