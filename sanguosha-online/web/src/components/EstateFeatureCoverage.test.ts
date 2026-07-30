import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (name: string) => readFileSync(
  new URL(`./${name}`, import.meta.url),
  'utf8',
);

function expectActions(screen: string, actionTypes: readonly string[]) {
  const content = source(screen);
  for (const actionType of actionTypes) {
    expect(content, `${screen} 缺少 ${actionType} 的界面入口`)
      .toContain(`type: '${actionType}'`);
  }
}

describe('three-sector interface capability coverage', () => {
  it('keeps every farm action reachable', () => {
    expectActions('FarmScreen.tsx', [
      'farming_buy_seed',
      'farming_plant',
      'farming_tend',
      'farming_harvest',
      'farming_clear_plot',
      'farming_sell',
      'farming_redeem_mutation',
      'farming_expand_plot',
      'farming_upgrade_dog',
      'farming_help',
      'farming_steal',
    ]);
  });

  it('keeps every ranch action reachable', () => {
    expectActions('RanchScreen.tsx', [
      'ranch_buy_animal',
      'ranch_feed',
      'ranch_move_animal',
      'ranch_sell_animal',
      'ranch_clean',
      'ranch_collect',
      'ranch_sell',
      'ranch_expand_pen',
      'ranch_help',
      'ranch_neighbor_collect',
    ]);
  });

  it('keeps every mine action reachable', () => {
    expectActions('MineScreen.tsx', [
      'mine_start',
      'mine_reinforce',
      'mine_abandon',
      'mine_collect',
      'mine_sell',
      'mine_expand_shaft',
      'mine_upgrade_pickaxe',
    ]);
  });

  it('keeps every unified and deep homestead action reachable', () => {
    expectActions('HomesteadScreen.tsx', [
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
    ]);
  });
});
