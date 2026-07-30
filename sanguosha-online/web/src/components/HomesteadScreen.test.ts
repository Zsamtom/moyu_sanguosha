import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { formatHomesteadDuration } from './HomesteadScreen';

describe('HomesteadScreen helpers', () => {
  it('formats production countdowns for short and long jobs', () => {
    expect(formatHomesteadDuration(0)).toBe('可收取');
    expect(formatHomesteadDuration(10 * 60_000)).toBe('10 分钟');
    expect(formatHomesteadDuration(90 * 60_000)).toBe('1 小时 30 分');
    expect(formatHomesteadDuration(2 * 60 * 60_000)).toBe('2 小时');
  });

  it('keeps every homestead server action reachable from the interface', () => {
    const source = readFileSync(
      new URL('./HomesteadScreen.tsx', import.meta.url),
      'utf8',
    );
    for (const actionType of [
      'homestead_build_facility',
      'homestead_start_job',
      'homestead_collect_job',
      'homestead_complete_order',
      'homestead_choose_event',
      'homestead_unlock_research',
      'homestead_upgrade_facility',
      'homestead_plan_rotation',
      'homestead_run_feed_program',
      'homestead_upgrade_mine_protection',
      'homestead_survey_layer',
      'homestead_talk_npc',
      'homestead_claim_season_reward',
      'homestead_upgrade_resilience',
      'homestead_activate_emergency_boost',
      'homestead_switch_town',
      'homestead_start_town_sector',
      'homestead_collect_town_sector',
      'homestead_upgrade_town_sector',
      'homestead_sell_town_resource',
      'homestead_resolve_town_problem',
      'homestead_restore_town_landmark',
      'homestead_complete_value_route',
    ]) {
      expect(source).toContain(`type: '${actionType}'`);
    }
  });
});
