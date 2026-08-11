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
      'farming_batch_plant',
      'farming_tend',
      'farming_tend_all',
      'farming_harvest',
      'farming_harvest_all',
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
      'ranch_clean_all',
      'ranch_collect',
      'ranch_collect_all',
      'ranch_slaughter',
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
      'mine_reinforce_all',
      'mine_abandon',
      'mine_collect',
      'mine_collect_all',
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
      'homestead_claim_honor_reward',
      'homestead_upgrade_infrastructure',
      'homestead_upgrade_resilience',
      'homestead_activate_emergency_boost',
      'homestead_unlock_town',
      'homestead_switch_town',
      'homestead_buy_merchant_item',
      'homestead_use_acceleration_card',
      'homestead_complete_value_route',
      'homestead_dispatch_cargo',
      'homestead_collect_cargo',
    ]);
  });

  it('keeps the full account-level restaurant loop reachable', () => {
    expectActions('RestaurantScreen.tsx', [
      'restaurant_supply_from_town',
      'restaurant_collect_supply',
      'restaurant_buy_shop_item',
      'restaurant_learn_technique',
      'restaurant_unlock_recipe',
      'restaurant_start_processing',
      'restaurant_collect_processing',
      'restaurant_prepare_dish',
      'restaurant_set_menu',
      'restaurant_open_service',
      'restaurant_serve_order',
      'restaurant_close_service',
    ]);
  });
});
