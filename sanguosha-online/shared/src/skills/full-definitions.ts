import {
  SkillRegistry,
  type ActiveSkillSpec,
  type GameEventType,
  type ModifierQueryType,
  type SkillRuleCategory,
  type SkillRuleDefinition,
  type TriggerSpec,
  type ViewAsSpec,
} from "../engine/events.js";
import { FULL_GENERAL_CATALOG } from "../full-general-catalog.js";
import { FULL_SKILL_RULE_IDS, isFullSkillRulesId, type FullSkillRulesId } from "../full-skill-ids.js";
import { DEFAULT_SKILL_RULE_DEFINITIONS } from "./default-definitions.js";

/**
 * Declarative dispatch catalog for every unique rules skill in the original
 * 66-general roster. A definition is a routing contract, not proof that its
 * condition/effect program has been implemented by the live GameSession yet.
 */

const PRIORITY = Object.freeze({
  lifecycle: 400,
  replace: 300,
  targetRewrite: 250,
  targetFollowUp: 200,
  phase: 100,
  normal: 0,
  deny: -100,
});

interface SkillParts {
  readonly triggers?: readonly TriggerSpec[];
  readonly active?: readonly ActiveSkillSpec[];
  readonly viewAs?: readonly ViewAsSpec[];
  readonly modifiers?: readonly import("../engine/events.js").ModifierSpec[];
}

const trigger = (
  id: string,
  event: GameEventType,
  compulsory: boolean,
  conditionId: string,
  effectId: string,
  priority: number = PRIORITY.normal,
): TriggerSpec => ({ id, event, compulsory, conditionId, effectId, priority });

const active = (
  id: string,
  programId: string,
  usage: ActiveSkillSpec["usage"],
): ActiveSkillSpec => ({ id, programId, usage });

const viewAs = (
  id: string,
  programId: string,
  enabledFor: ViewAsSpec["enabledFor"],
): ViewAsSpec => ({ id, programId, enabledFor });

const modifier = (
  id: string,
  query: ModifierQueryType,
  handlerId: string,
  priority: number = PRIORITY.normal,
): import("../engine/events.js").ModifierSpec => ({ id, query, handlerId, priority });

function metadataFor(rulesId: string): { readonly name: string; readonly categories: readonly SkillRuleCategory[] } {
  if (!isFullSkillRulesId(rulesId)) throw new Error(`未知完整技能规则：${rulesId}`);
  const occurrences = FULL_GENERAL_CATALOG.flatMap((general) =>
    general.skills.filter((entry) => entry.rulesId === rulesId),
  );
  if (occurrences.length === 0) throw new Error(`技能规则没有武将来源：${rulesId}`);
  const names = [...new Set(occurrences.map((entry) => entry.name))];
  if (names.length !== 1) throw new Error(`技能规则名称不一致：${rulesId}`);
  return {
    name: names[0]!,
    categories: Object.freeze([...new Set(occurrences.map((entry) => entry.category))]),
  };
}

function skill(rulesId: FullSkillRulesId, parts: SkillParts): SkillRuleDefinition {
  const metadata = metadataFor(rulesId);
  return Object.freeze({
    rulesId,
    name: metadata.name,
    categories: metadata.categories,
    triggers: Object.freeze([...(parts.triggers ?? [])]),
    active: Object.freeze([...(parts.active ?? [])]),
    viewAs: Object.freeze([...(parts.viewAs ?? [])]),
    modifiers: Object.freeze([...(parts.modifiers ?? [])]),
  });
}

/** Skills first introduced by Wind, Fire, Forest, Mountain, and God. */
export const EXTENSION_SKILL_RULE_DEFINITIONS: readonly SkillRuleDefinition[] = Object.freeze([
  // Wind
  skill("jushou", {
    triggers: [trigger("turn_over_draw_four", "phase_started", false, "jushou.owner_end_phase_started", "jushou.turn_over_draw_four_then_dispose", PRIORITY.phase)],
  }),
  skill("liegong", {
    triggers: [trigger("forbid_dodge_for_slash_target", "target_confirmed", false, "liegong.owner_slash_target_meets_hand_or_range_condition", "liegong.forbid_target_dodge", PRIORITY.targetFollowUp)],
  }),
  skill("kuanggu", {
    triggers: [trigger("recover_per_close_damage", "damage_dealt", true, "kuanggu.owner_dealt_damage_at_distance_one", "kuanggu.recover_per_damage_point")],
  }),
  skill("shensu", {
    triggers: [
      trigger("skip_judgment_and_draw_for_slash", "phase_before", false, "shensu.owner_judgment_phase_before", "shensu.skip_judgment_and_draw_then_use_slash", PRIORITY.replace),
      trigger("discard_equipment_skip_play_for_slash", "phase_before", false, "shensu.owner_play_phase_before_with_equipment", "shensu.discard_equipment_skip_play_then_use_slash", PRIORITY.replace),
    ],
  }),
  skill("tianxiang", {
    triggers: [trigger("redirect_damage_with_heart", "damage_redirecting", false, "tianxiang.owner_has_heart_hand_card_and_other_target", "tianxiang.discard_heart_redirect_then_target_draws", PRIORITY.targetRewrite)],
  }),
  skill("hongyan", {
    modifiers: [modifier("spades_are_hearts", "effective_card_suit", "hongyan.spade_as_heart", PRIORITY.lifecycle)],
  }),
  skill("guhuo", {
    viewAs: [viewAs("declare_basic_or_ordinary_trick", "guhuo.declare_hidden_hand_card_with_challenge", ["use", "respond"])],
  }),
  skill("leiji", {
    triggers: [trigger("judge_after_dodge", "card_responded", false, "leiji.owner_used_or_responded_with_dodge", "leiji.choose_target_judge_spade_for_thunder_damage")],
  }),
  skill("guidao", {
    triggers: [trigger("replace_judgment_with_black_card", "judgment_replacing", false, "guidao.owner_has_black_owned_card", "guidao.replace_judgment_with_black_card", PRIORITY.replace)],
  }),
  skill("huangtian", {
    active: [active("qun_gives_dodge_or_lightning", "huangtian.other_qun_gives_dodge_or_lightning_to_lord", "once_per_phase")],
  }),
  skill("buqu", {
    triggers: [trigger("reveal_unique_rank_to_avoid_death", "dying_started", false, "buqu.owner_hp_nonpositive", "buqu.reveal_card_and_check_unique_rank", PRIORITY.lifecycle)],
  }),

  // Fire
  skill("qiangxi", {
    active: [active("lose_hp_or_weapon_for_damage", "qiangxi.pay_hp_or_weapon_and_deal_damage", "once_per_phase")],
  }),
  skill("mengjin", {
    triggers: [trigger("discard_after_slash_dodged", "card_responded", false, "mengjin.owner_slash_was_dodged", "mengjin.discard_one_target_card")],
  }),
  skill("lianhuan", {
    viewAs: [viewAs("club_hand_as_iron_chain", "lianhuan.club_hand_as_iron_chain_or_recast", ["use"])],
  }),
  skill("niepan", {
    triggers: [trigger("limited_rebirth", "dying_started", false, "niepan.owner_dying_and_unused", "niepan.discard_all_reset_draw_three_recover_three", PRIORITY.lifecycle)],
  }),
  skill("tianyi", {
    active: [active("pindian_for_slash_modifiers", "tianyi.pindian_and_apply_slash_result", "once_per_phase")],
  }),
  skill("bazhen", {
    modifiers: [modifier("virtual_bagua_without_armor", "effect_valid", "bazhen.provide_bagua_when_armor_slot_empty", PRIORITY.lifecycle)],
  }),
  skill("huoji", {
    viewAs: [viewAs("red_hand_as_fire_attack", "huoji.red_hand_card_as_fire_attack", ["use"])],
  }),
  skill("kanpo", {
    viewAs: [viewAs("black_hand_as_nullification", "kanpo.black_hand_card_as_nullification", ["use", "respond"])],
  }),
  skill("quhu", {
    active: [active("pindian_to_redirect_damage", "quhu.pindian_larger_hp_target_then_deal_damage", "once_per_phase")],
  }),
  skill("jieming", {
    triggers: [trigger("refill_hand_per_damage", "damage_received", false, "jieming.owner_survived_positive_damage", "jieming.refill_chosen_player_per_damage_point")],
  }),
  skill("shuangxiong", {
    triggers: [trigger("replace_draw_with_judgment", "phase_started", false, "shuangxiong.owner_draw_phase_started", "shuangxiong.judge_claim_and_record_opposite_color", PRIORITY.replace)],
    viewAs: [viewAs("opposite_color_hand_as_duel", "shuangxiong.opposite_judgment_color_hand_as_duel", ["use"])],
  }),
  skill("luanji", {
    viewAs: [viewAs("same_suit_pair_as_arrow_barrage", "luanji.two_same_suit_hand_cards_as_arrow_barrage", ["use"])],
  }),
  skill("xueyi", {
    modifiers: [modifier("hand_limit_plus_two_per_other_qun", "hand_limit", "xueyi.add_two_per_other_living_qun", PRIORITY.phase)],
  }),

  // Forest
  skill("xingshang", {
    triggers: [trigger("gain_dead_players_cards", "death", false, "xingshang.other_player_died_with_cards", "xingshang.gain_all_dead_player_cards", PRIORITY.lifecycle)],
  }),
  skill("fangzhu", {
    triggers: [trigger("turn_over_other_and_draw", "damage_received", false, "fangzhu.owner_survived_positive_damage", "fangzhu.turn_over_other_and_draw_lost_hp_per_point")],
  }),
  skill("songwei", {
    triggers: [trigger("lord_draw_after_wei_black_judgment", "judgment_finished", false, "songwei.other_wei_black_judgment_finished", "songwei.owner_draw_one")],
  }),
  skill("jiuchi", {
    viewAs: [viewAs("spade_hand_as_wine", "jiuchi.spade_hand_card_as_wine", ["use", "respond"])],
  }),
  skill("roulin", {
    modifiers: [modifier("double_dodge_between_owner_and_female", "response_count", "roulin.require_two_dodges_for_cross_gender_slash", PRIORITY.phase)],
  }),
  skill("benghuai", {
    triggers: [trigger("lose_hp_or_max_hp_at_end", "phase_started", true, "benghuai.owner_end_phase_not_minimum_hp", "benghuai.choose_lose_hp_or_max_hp", PRIORITY.phase)],
  }),
  skill("baonue", {
    triggers: [trigger("qun_source_judges_to_heal_lord", "damage_dealt", false, "baonue.other_qun_dealt_damage_and_owner_wounded", "baonue.source_judges_spade_then_owner_recovers")],
  }),
  skill("wansha", {
    modifiers: [modifier("restrict_peach_during_owner_turn", "target_legal", "wansha.only_owner_or_dying_may_use_peach", PRIORITY.deny)],
  }),
  skill("luanwu", {
    active: [active("global_nearest_slash_or_hp_loss", "luanwu.each_other_uses_nearest_slash_or_loses_hp", "limited_once")],
  }),
  skill("weimu", {
    modifiers: [modifier("deny_black_trick_target", "target_legal", "weimu.deny_black_trick_target", PRIORITY.deny)],
  }),
  skill("haoshi", {
    triggers: [
      trigger("draw_two_additional", "phase_started", false, "haoshi.owner_draw_phase_started", "haoshi.draw_two_additional", PRIORITY.phase),
      trigger("give_half_hand_after_draw", "phase_ended", true, "haoshi.owner_draw_phase_ended_with_more_than_five_hand", "haoshi.give_floor_half_to_minimum_hand_target", PRIORITY.phase),
    ],
  }),
  skill("dimeng", {
    active: [active("pay_hand_difference_and_swap", "dimeng.discard_hand_difference_then_swap_two_hands", "once_per_phase")],
  }),
  skill("huoshou", {
    triggers: [trigger("rewrite_barbarian_damage_source", "targets_confirmed", true, "huoshou.barbarian_invasion_has_other_source", "huoshou.replace_damage_source_with_owner", PRIORITY.targetRewrite)],
    modifiers: [modifier("barbarian_invasion_immune", "effect_valid", "huoshou.barbarian_invasion_has_no_effect_on_owner", PRIORITY.deny)],
  }),
  skill("zaiqi", {
    triggers: [trigger("replace_draw_with_reveal_hearts", "phase_started", false, "zaiqi.owner_draw_phase_wounded", "zaiqi.reveal_lost_hp_plus_one_recover_hearts_gain_rest", PRIORITY.replace)],
  }),
  skill("yinghun", {
    triggers: [trigger("lost_hp_draw_discard_choice", "phase_started", false, "yinghun.owner_prepare_phase_wounded", "yinghun.choose_other_draw_x_discard_one_or_reverse", PRIORITY.phase)],
  }),
  skill("duanliang", {
    viewAs: [viewAs("black_basic_or_equipment_as_supply_shortage", "duanliang.black_basic_or_equipment_as_supply_shortage", ["use"])],
    modifiers: [modifier("supply_shortage_distance_two", "target_legal", "duanliang.allow_supply_shortage_at_distance_two", PRIORITY.phase)],
  }),
  skill("juxiang", {
    triggers: [trigger("gain_finished_barbarian_invasion", "card_finished", true, "juxiang.other_barbarian_invasion_finished_and_claimable", "juxiang.gain_physical_barbarian_invasion")],
    modifiers: [modifier("barbarian_invasion_immune", "effect_valid", "juxiang.barbarian_invasion_has_no_effect_on_owner", PRIORITY.deny)],
  }),
  skill("lieren", {
    triggers: [trigger("pindian_after_slash_damage", "damage_dealt", false, "lieren.owner_slash_damaged_target_with_hand", "lieren.pindian_then_gain_one_target_card")],
  }),

  // Mountain
  skill("beige", {
    triggers: [trigger("discard_to_judge_after_slash_damage", "damage_received", false, "beige.slash_damage_victim_exists_and_owner_has_card", "beige.discard_then_apply_suit_judgment")],
  }),
  skill("duanchang", {
    triggers: [trigger("killer_loses_current_skills", "death", true, "duanchang.owner_was_killed_by_living_source", "duanchang.snapshot_remove_killers_current_skills", PRIORITY.lifecycle)],
  }),
  skill("tuntian", {
    triggers: [trigger("judge_after_out_of_turn_card_loss", "cards_moved", false, "tuntian.owner_lost_cards_outside_turn", "tuntian.judge_nonheart_to_field_pile")],
    modifiers: [modifier("distance_minus_field_count", "distance_from", "tuntian.subtract_field_pile_count", PRIORITY.phase)],
  }),
  skill("zaoxian", {
    triggers: [trigger("awaken_with_three_fields", "phase_started", true, "zaoxian.owner_prepare_with_at_least_three_fields_unawakened", "zaoxian.reduce_max_hp_and_grant_jixi", PRIORITY.lifecycle)],
  }),
  skill("jixi", {
    viewAs: [viewAs("field_as_snatch", "jixi.field_pile_card_as_snatch", ["use"])],
  }),
  skill("tiaoxin", {
    active: [active("provoke_slash_or_discard", "tiaoxin.target_slashes_owner_or_owner_discards_target_card", "once_per_phase")],
  }),
  skill("zhiji", {
    triggers: [trigger("awaken_with_empty_hand", "phase_started", true, "zhiji.owner_prepare_empty_hand_unawakened", "zhiji.recover_or_draw_then_reduce_max_hp_and_grant_guanxing", PRIORITY.lifecycle)],
  }),
  skill("xiangle", {
    triggers: [trigger("slash_source_discards_basic_or_effect_invalid", "target_confirmed", true, "xiangle.owner_is_slash_target", "xiangle.require_source_basic_discard_or_cancel_target", PRIORITY.targetFollowUp)],
  }),
  skill("fangquan", {
    triggers: [
      trigger("skip_play_phase", "phase_before", false, "fangquan.owner_play_phase_before", "fangquan.skip_play_and_mark", PRIORITY.replace),
      trigger("discard_hand_for_extra_turn", "turn_finished", false, "fangquan.owner_marked_and_has_hand_card", "fangquan.discard_hand_and_queue_other_extra_turn", PRIORITY.lifecycle),
    ],
  }),
  skill("ruoyu", {
    triggers: [trigger("lord_awaken_at_minimum_hp", "phase_started", true, "ruoyu.owner_is_lord_prepare_at_minimum_hp_unawakened", "ruoyu.increase_max_hp_recover_and_grant_jijiang", PRIORITY.lifecycle)],
  }),
  skill("jiang", {
    triggers: [trigger("draw_for_red_slash_or_duel_targeting", "target_confirmed", false, "jiang.owner_uses_or_is_targeted_by_red_slash_or_duel", "jiang.draw_one")],
  }),
  skill("yingyang", {
    triggers: [trigger("adjust_pindian_rank", "pindian_revealed", false, "yingyang.owner_participates_in_pindian", "yingyang.add_or_subtract_three_clamped", PRIORITY.replace)],
  }),
  skill("hunzi", {
    triggers: [trigger("awaken_at_one_hp", "phase_started", true, "hunzi.owner_prepare_at_one_hp_unawakened", "hunzi.reduce_max_hp_and_grant_yingzi_yinghun", PRIORITY.lifecycle)],
  }),
  skill("zhiba", {
    active: [active("wu_subject_challenges_lord_pindian", "zhiba.other_wu_requests_pindian_with_lord", "once_per_phase")],
  }),
  skill("qiaobian", {
    triggers: [trigger("discard_to_skip_and_replace_phase", "phase_before", false, "qiaobian.owner_eligible_phase_before_with_hand", "qiaobian.discard_skip_and_resolve_phase_variant", PRIORITY.replace)],
  }),
  skill("zhijian", {
    active: [active("install_equipment_on_other_and_draw", "zhijian.move_hand_equipment_to_other_then_draw", "unlimited")],
  }),
  skill("guzheng", {
    triggers: [trigger("return_one_discard_gain_rest", "phase_after", false, "guzheng.other_discard_phase_after_with_owned_discards", "guzheng.return_one_to_discarder_and_gain_rest")],
  }),
  skill("huashen", {
    triggers: [
      trigger("gain_two_forms_at_game_start", "game_started", true, "huashen.owner_game_started", "huashen.draw_two_forms_and_choose_form_skill", PRIORITY.lifecycle),
      trigger("change_form_at_turn_start", "turn_started", false, "huashen.owner_turn_started_with_forms", "huashen.change_revealed_form_and_skill", PRIORITY.lifecycle),
      trigger("change_form_after_turn", "turn_after", false, "huashen.owner_turn_finished_with_forms", "huashen.change_revealed_form_and_skill", PRIORITY.lifecycle),
    ],
  }),
  skill("xinsheng", {
    triggers: [trigger("gain_form_per_damage", "damage_received", false, "xinsheng.owner_survived_positive_damage", "xinsheng.gain_new_form_per_damage_point")],
  }),

  // God
  skill("guixin", {
    triggers: [trigger("take_one_from_each_other_then_turn_over", "damage_received", false, "guixin.owner_survived_positive_damage", "guixin.take_one_card_from_each_other_per_point_then_turn_over")],
  }),
  skill("feiying", {
    modifiers: [modifier("others_distance_to_owner_plus_one", "distance_to", "feiying.distance_to_owner_plus_one", PRIORITY.phase)],
  }),
  skill("wushen", {
    viewAs: [viewAs("heart_hand_as_slash", "wushen.heart_hand_card_as_slash", ["use", "respond"])],
    modifiers: [modifier("heart_slash_unlimited_distance", "target_legal", "wushen.heart_slash_ignores_distance", PRIORITY.phase)],
  }),
  skill("wuhun", {
    triggers: [
      trigger("add_nightmare_marks_per_damage", "damage_received", true, "wuhun.damage_has_other_source", "wuhun.add_nightmare_marks_to_source"),
      trigger("judge_maximum_mark_holder_on_death", "death", true, "wuhun.owner_died_with_marked_others", "wuhun.choose_maximum_then_judge_or_kill", PRIORITY.lifecycle),
    ],
  }),
  skill("kuangbao", {
    triggers: [
      trigger("gain_two_rage_at_start", "game_started", true, "kuangbao.owner_game_started", "kuangbao.add_two_rage", PRIORITY.lifecycle),
      trigger("gain_rage_after_dealing_damage", "damage_dealt", true, "kuangbao.owner_dealt_positive_damage", "kuangbao.add_rage_per_damage_point"),
      trigger("gain_rage_after_receiving_damage", "damage_received", true, "kuangbao.owner_received_positive_damage", "kuangbao.add_rage_per_damage_point"),
    ],
  }),
  skill("wumou", {
    triggers: [trigger("spend_rage_or_lose_hp_for_trick", "card_use_declared", true, "wumou.owner_declared_ordinary_trick", "wumou.choose_spend_rage_or_lose_hp", PRIORITY.phase)],
  }),
  skill("wuqian", {
    active: [active("spend_two_rage_for_wushuang_and_armor_null", "wuqian.spend_rage_grant_wushuang_and_disable_target_armor", "unlimited")],
  }),
  skill("shenfen", {
    active: [active("spend_six_rage_global_damage_discard_turnover", "shenfen.damage_all_then_discard_all_equipment_four_hand_and_turn_over", "once_per_phase")],
  }),
  skill("shelie", {
    triggers: [trigger("replace_draw_with_five_suit_choices", "phase_started", false, "shelie.owner_draw_phase_started", "shelie.reveal_five_gain_one_per_suit", PRIORITY.replace)],
  }),
  skill("gongxin", {
    active: [active("inspect_hand_and_discard_or_top_heart", "gongxin.inspect_other_hand_then_discard_or_top_heart", "once_per_phase")],
  }),
  skill("renjie", {
    triggers: [
      trigger("gain_patience_after_damage", "damage_received", true, "renjie.owner_received_positive_damage", "renjie.add_patience_per_damage_point"),
      trigger("gain_patience_for_discarded_hand", "cards_moved", true, "renjie.owner_discarded_hand_during_discard_phase", "renjie.add_patience_per_hand_card"),
    ],
  }),
  skill("baiyin", {
    triggers: [trigger("awaken_with_four_patience", "phase_started", true, "baiyin.owner_prepare_with_four_patience_unawakened", "baiyin.reduce_max_hp_and_grant_jilue", PRIORITY.lifecycle)],
  }),
  skill("jilue", {
    active: [active("spend_patience_for_component_skill", "jilue.spend_patience_and_invoke_selected_component", "unlimited")],
  }),
  skill("lianpo", {
    triggers: [trigger("extra_turn_after_kill", "turn_after", false, "lianpo.owner_killed_during_finished_turn", "lianpo.queue_owner_extra_turn", PRIORITY.lifecycle)],
  }),
  skill("juejing", {
    modifiers: [
      modifier("draw_lost_hp_additional", "draw_count", "juejing.add_lost_hp_to_draw", PRIORITY.phase),
      modifier("hand_limit_plus_two", "hand_limit", "juejing.add_two_to_hand_limit", PRIORITY.phase),
    ],
  }),
  skill("longhun", {
    viewAs: [
      viewAs("hearts_as_peach", "longhun.same_suit_x_hearts_as_peach", ["use", "respond"]),
      viewAs("diamonds_as_fire_slash", "longhun.same_suit_x_diamonds_as_fire_slash", ["use", "respond"]),
      viewAs("clubs_as_dodge", "longhun.same_suit_x_clubs_as_dodge", ["use", "respond"]),
      viewAs("spades_as_nullification", "longhun.same_suit_x_spades_as_nullification", ["use", "respond"]),
    ],
  }),
  skill("qinyin", {
    triggers: [trigger("all_recover_or_all_lose_hp", "phase_after", false, "qinyin.owner_discard_phase_after_discarded_two_hand", "qinyin.choose_all_recover_or_all_lose_hp")],
  }),
  skill("yeyan", {
    active: [active("limited_distribute_fire_damage", "yeyan.distribute_up_to_three_fire_damage_with_greater_cost", "limited_once")],
  }),
  skill("qixing", {
    triggers: [
      trigger("place_seven_stars_at_start", "game_started", false, "qixing.owner_game_started", "qixing.place_seven_and_exchange_with_hand", PRIORITY.lifecycle),
      trigger("exchange_stars_after_draw", "phase_ended", false, "qixing.owner_draw_phase_ended", "qixing.exchange_equal_hand_and_stars", PRIORITY.phase),
    ],
  }),
  skill("kuangfeng", {
    triggers: [trigger("spend_star_for_fire_vulnerability", "phase_started", false, "kuangfeng.owner_end_phase_with_star", "kuangfeng.spend_star_mark_target_until_next_turn", PRIORITY.phase)],
  }),
  skill("dawu", {
    triggers: [trigger("spend_stars_for_non_thunder_prevention", "phase_started", false, "dawu.owner_end_phase_with_stars", "dawu.spend_stars_mark_targets_until_next_turn", PRIORITY.phase)],
  }),
]);

const defaultIds = new Set(DEFAULT_SKILL_RULE_DEFINITIONS.map((definition) => definition.rulesId));
const extensionIds = new Set(EXTENSION_SKILL_RULE_DEFINITIONS.map((definition) => definition.rulesId));
for (const rulesId of extensionIds) {
  if (defaultIds.has(rulesId)) throw new Error(`完整技能定义重复：${rulesId}`);
}

/** All 124 unique skill rules, in the canonical FULL_SKILL_RULE_IDS order. */
export const FULL_SKILL_RULE_DEFINITIONS: readonly SkillRuleDefinition[] = Object.freeze(
  FULL_SKILL_RULE_IDS.map((rulesId) => {
    const definition = DEFAULT_SKILL_RULE_DEFINITIONS.find((candidate) => candidate.rulesId === rulesId)
      ?? EXTENSION_SKILL_RULE_DEFINITIONS.find((candidate) => candidate.rulesId === rulesId);
    if (!definition) throw new Error(`完整技能规则缺少定义：${rulesId}`);
    const metadata = metadataFor(rulesId);
    return Object.freeze({
      ...definition,
      name: metadata.name,
      categories: metadata.categories,
      triggers: Object.freeze([...definition.triggers]),
      active: Object.freeze([...definition.active]),
      viewAs: Object.freeze([...definition.viewAs]),
      modifiers: Object.freeze([...definition.modifiers]),
    });
  }),
);

export function createFullSkillRegistry(): SkillRegistry {
  const registry = new SkillRegistry();
  for (const definition of FULL_SKILL_RULE_DEFINITIONS) registry.register(definition);
  registry.assertCoverage(FULL_SKILL_RULE_IDS);
  return registry;
}
