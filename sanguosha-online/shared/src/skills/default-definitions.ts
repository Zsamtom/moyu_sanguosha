import { SkillRegistry, type ActiveSkillSpec, type GameEventType, type ModifierQueryType, type ModifierSpec, type SkillRuleCategory, type SkillRuleDefinition, type TriggerSpec, type ViewAsSpec } from "../engine/events.js";
import { FULL_GENERAL_CATALOG } from "../full-general-catalog.js";

/**
 * Declarative rule registration for the default roster only.
 *
 * These identifiers describe dispatch points; they do not claim that the
 * corresponding condition/effect programs have already been implemented.
 */

const PRIORITY = Object.freeze({
  lifecycleSync: 400,
  judgmentReplacement: 300,
  targetRewrite: 300,
  targetFollowUp: 200,
  phaseReplacement: 200,
  phaseHook: 100,
  normal: 0,
  hardTargetDeny: -100,
});

interface SkillParts {
  readonly triggers?: readonly TriggerSpec[];
  readonly active?: readonly ActiveSkillSpec[];
  readonly viewAs?: readonly ViewAsSpec[];
  readonly modifiers?: readonly ModifierSpec[];
}

function trigger(
  id: string,
  event: GameEventType,
  compulsory: boolean,
  conditionId: string,
  effectId: string,
  priority: number,
): TriggerSpec {
  return { id, event, compulsory, conditionId, effectId, priority };
}

function active(id: string, programId: string, usage: ActiveSkillSpec["usage"]): ActiveSkillSpec {
  return { id, programId, usage };
}

function viewAs(id: string, programId: string, enabledFor: ViewAsSpec["enabledFor"]): ViewAsSpec {
  return { id, programId, enabledFor };
}

function modifier(id: string, query: ModifierQueryType, handlerId: string, priority: number): ModifierSpec {
  return { id, query, handlerId, priority };
}

function skill(
  rulesId: string,
  name: string,
  categories: readonly SkillRuleCategory[],
  parts: SkillParts,
): SkillRuleDefinition {
  return {
    rulesId,
    name,
    categories,
    triggers: parts.triggers ?? [],
    active: parts.active ?? [],
    viewAs: parts.viewAs ?? [],
    modifiers: parts.modifiers ?? [],
  };
}

export const DEFAULT_SKILL_RULE_DEFINITIONS: readonly SkillRuleDefinition[] = Object.freeze([
  // Standard Wei
  skill("jianxiong", "奸雄", ["optional"], {
    triggers: [trigger(
      "after_damage_gain_cards",
      "damage_received",
      false,
      "jianxiong.owner_survived_and_damage_cards_available",
      "jianxiong.gain_damage_cards",
      PRIORITY.normal,
    )],
  }),
  skill("hujia", "护驾", ["lord"], {
    viewAs: [viewAs("dispatch_dodge", "hujia.dispatch_wei_dodge", ["use", "respond"])],
  }),
  skill("tiandu", "天妒", ["optional"], {
    triggers: [trigger(
      "claim_final_judgment_card",
      "judgment_finished",
      false,
      "tiandu.owner_is_judged_player_and_final_card_claimable",
      "tiandu.claim_final_judgment_card",
      PRIORITY.normal,
    )],
  }),
  skill("yiji", "遗计", ["optional"], {
    triggers: [trigger(
      "distribute_two_cards_per_damage",
      "damage_received",
      false,
      "yiji.owner_survived_positive_damage",
      "yiji.distribute_two_cards_per_damage_point",
      PRIORITY.normal,
    )],
  }),
  skill("guicai", "鬼才", ["optional"], {
    triggers: [trigger(
      "replace_judgment",
      "judgment_replacing",
      false,
      "guicai.owner_has_hand_card_and_judgment_replaceable",
      "guicai.replace_judgment_with_hand_card",
      PRIORITY.judgmentReplacement,
    )],
  }),
  skill("fankui", "反馈", ["optional"], {
    triggers: [trigger(
      "gain_source_card_after_damage",
      "damage_received",
      false,
      "fankui.owner_survived_and_source_has_obtainable_card",
      "fankui.gain_one_source_card",
      PRIORITY.normal,
    )],
  }),
  skill("ganglie", "刚烈", ["optional"], {
    triggers: [trigger(
      "judge_and_punish_damage_source",
      "damage_received",
      false,
      "ganglie.owner_survived_and_damage_has_source",
      "ganglie.judge_and_punish_damage_source",
      PRIORITY.normal,
    )],
  }),
  skill("luoyi", "裸衣", ["optional"], {
    triggers: [trigger(
      "replace_draw_for_damage_bonus",
      "phase_started",
      false,
      "luoyi.owner_draw_phase_started",
      "luoyi.draw_one_and_mark_damage_bonus",
      PRIORITY.phaseReplacement,
    )],
  }),
  skill("tuxi", "突袭", ["optional"], {
    triggers: [trigger(
      "replace_draw_with_hand_gains",
      "phase_started",
      false,
      "tuxi.owner_draw_phase_started_with_eligible_targets",
      "tuxi.replace_draw_with_up_to_two_hand_gains",
      PRIORITY.phaseReplacement,
    )],
  }),
  skill("luoshen", "洛神", ["optional"], {
    triggers: [trigger(
      "repeat_black_judgments",
      "phase_started",
      false,
      "luoshen.owner_prepare_phase_started",
      "luoshen.repeat_black_judgments",
      PRIORITY.phaseHook,
    )],
  }),
  skill("qingguo", "倾国", ["optional"], {
    viewAs: [viewAs("black_hand_as_dodge", "qingguo.black_hand_card_as_dodge", ["use", "respond"])],
  }),

  // Standard Shu
  skill("wusheng", "武圣", ["optional"], {
    viewAs: [viewAs("red_card_as_slash", "wusheng.red_card_as_slash", ["use", "respond"])],
  }),
  skill("jizhi", "集智", ["optional"], {
    triggers: [trigger(
      "draw_after_ordinary_trick_declared",
      "card_use_declared",
      false,
      "jizhi.owner_declared_ordinary_trick_use",
      "jizhi.draw_one_card",
      PRIORITY.normal,
    )],
  }),
  skill("qicai", "奇才", ["locked"], {
    modifiers: [modifier("ignore_trick_distance", "target_legal", "qicai.ignore_trick_distance", PRIORITY.phaseHook)],
  }),
  skill("rende", "仁德", ["optional"], {
    active: [active("give_hand_cards", "rende.give_hand_cards", "unlimited")],
  }),
  skill("jijiang", "激将", ["lord"], {
    active: [active("request_slash_for_use", "jijiang.request_shu_slash_for_use", "unlimited")],
    viewAs: [viewAs("dispatch_slash", "jijiang.dispatch_shu_slash", ["use", "respond"])],
  }),
  skill("mashu", "马术", ["locked"], {
    modifiers: [modifier("distance_from_minus_one", "distance_from", "mashu.distance_from_minus_one", PRIORITY.phaseHook)],
  }),
  skill("tieqi", "铁骑", ["optional"], {
    triggers: [trigger(
      "judge_to_forbid_dodge",
      "target_confirmed",
      false,
      "tieqi.owner_slash_target_confirmed",
      "tieqi.judge_and_maybe_forbid_dodge",
      PRIORITY.targetFollowUp,
    )],
  }),
  skill("paoxiao", "咆哮", ["locked"], {
    modifiers: [modifier("unlimited_slash_uses", "card_use_limit", "paoxiao.unlimited_slash_uses", PRIORITY.phaseHook)],
  }),
  skill("longdan", "龙胆", ["optional"], {
    viewAs: [
      viewAs("dodge_as_slash", "longdan.dodge_as_slash", ["use", "respond"]),
      viewAs("slash_as_dodge", "longdan.slash_as_dodge", ["use", "respond"]),
    ],
  }),
  skill("guanxing", "观星", ["optional"], {
    triggers: [trigger(
      "reorder_deck_top_and_bottom",
      "phase_started",
      false,
      "guanxing.owner_prepare_phase_started",
      "guanxing.reorder_top_x_cards",
      PRIORITY.phaseHook,
    )],
  }),
  skill("kongcheng", "空城", ["locked"], {
    modifiers: [modifier("deny_slash_or_duel_target", "target_legal", "kongcheng.deny_slash_or_duel_when_hand_empty", PRIORITY.hardTargetDeny)],
  }),

  // Standard Wu
  skill("guose", "国色", ["optional"], {
    viewAs: [viewAs("diamond_as_indulgence", "guose.diamond_card_as_indulgence", ["use"])],
  }),
  skill("liuli", "流离", ["optional"], {
    triggers: [trigger(
      "discard_and_redirect_slash",
      "target_confirming",
      false,
      "liuli.owner_is_slash_target_with_cost_and_redirect_target",
      "liuli.discard_and_rewrite_slash_target",
      PRIORITY.targetRewrite,
    )],
  }),
  skill("qixi", "奇袭", ["optional"], {
    viewAs: [viewAs("black_card_as_dismantlement", "qixi.black_card_as_dismantlement", ["use"])],
  }),
  skill("kurou", "苦肉", ["optional"], {
    active: [active("lose_hp_and_draw_two", "kurou.lose_one_hp_and_draw_two", "unlimited")],
  }),
  skill("qianxun", "谦逊", ["locked"], {
    modifiers: [modifier("deny_indulgence_or_snatch_target", "target_legal", "qianxun.deny_indulgence_or_snatch_target", PRIORITY.hardTargetDeny)],
  }),
  skill("lianying", "连营", ["optional"], {
    triggers: [trigger(
      "draw_after_last_hand_card_lost",
      "hand_became_empty",
      false,
      "lianying.owner_alive_and_hand_transitioned_to_empty",
      "lianying.draw_one_card",
      PRIORITY.normal,
    )],
  }),
  skill("keji", "克己", ["optional"], {
    triggers: [trigger(
      "skip_discard_phase",
      "phase_before",
      false,
      "keji.owner_discard_phase_before_without_slash_use_or_response",
      "keji.skip_discard_phase",
      PRIORITY.phaseReplacement,
    )],
  }),
  skill("zhiheng", "制衡", ["optional"], {
    active: [active("discard_and_redraw", "zhiheng.discard_owned_cards_and_draw_equal", "once_per_phase")],
  }),
  skill("jiuyuan", "救援", ["lord", "locked"], {
    triggers: [trigger(
      "extra_recovery_from_wu_peach",
      "recovered",
      true,
      "jiuyuan.other_wu_character_used_peach_on_owner",
      "jiuyuan.recover_one_additional_hp",
      PRIORITY.normal,
    )],
  }),
  skill("xiaoji", "枭姬", ["optional"], {
    triggers: [trigger(
      "draw_two_per_lost_equipment",
      "equipment_lost",
      false,
      "xiaoji.owner_alive_and_equipment_left_zone",
      "xiaoji.draw_two_cards",
      PRIORITY.normal,
    )],
  }),
  skill("jieyin", "结姻", ["optional"], {
    active: [active("discard_two_and_recover_pair", "jieyin.discard_two_hand_cards_and_recover_pair", "once_per_phase")],
  }),
  skill("yingzi", "英姿", ["optional"], {
    triggers: [trigger(
      "draw_one_additional_card",
      "phase_started",
      false,
      "yingzi.owner_draw_phase_started",
      "yingzi.add_one_to_draw_count",
      PRIORITY.phaseHook,
    )],
  }),
  skill("fanjian", "反间", ["optional"], {
    active: [active("guess_suit_and_transfer_card", "fanjian.guess_suit_transfer_reveal_and_damage", "once_per_phase")],
  }),

  // Standard Qun
  skill("biyue", "闭月", ["optional"], {
    triggers: [trigger(
      "draw_at_end_phase",
      "phase_started",
      false,
      "biyue.owner_end_phase_started",
      "biyue.draw_one_card",
      PRIORITY.normal,
    )],
  }),
  skill("lijian", "离间", ["optional"], {
    active: [active("discard_and_create_duel", "lijian.discard_and_create_unnullifiable_duel", "once_per_phase")],
  }),
  skill("jijiu", "急救", ["optional"], {
    viewAs: [viewAs("red_card_as_peach_outside_turn", "jijiu.red_card_as_peach_outside_owner_turn", ["use", "respond"])],
  }),
  skill("qingnang", "青囊", ["optional"], {
    active: [active("discard_hand_card_to_recover", "qingnang.discard_hand_card_to_recover_target", "once_per_phase")],
  }),
  skill("wushuang", "无双", ["locked"], {
    modifiers: [modifier("double_slash_or_dodge_response", "response_count", "wushuang.require_two_responses", PRIORITY.phaseHook)],
  }),

  // SP Yuan Shu
  skill("yongsi", "庸肆", ["locked"], {
    triggers: [trigger(
      "discard_faction_count_at_discard_start",
      "phase_started",
      true,
      "yongsi.owner_discard_phase_started",
      "yongsi.discard_living_faction_count_then_enforce_hand_limit",
      PRIORITY.phaseReplacement,
    )],
    modifiers: [modifier("draw_living_faction_count", "draw_count", "yongsi.add_living_faction_count_to_draw", PRIORITY.phaseHook)],
  }),
  skill("weidi", "伪帝", ["locked"], {
    triggers: [
      trigger(
        "resolve_lord_skill_at_game_start",
        "game_started",
        true,
        "weidi.owner_is_nonlord_and_current_lord_has_lord_skill",
        "weidi.refresh_current_lord_skill",
        PRIORITY.lifecycleSync,
      ),
      trigger(
        "refresh_after_relevant_skill_gained",
        "skill_gained",
        true,
        "weidi.current_lord_skill_gain_changes_effective_skill",
        "weidi.refresh_current_lord_skill",
        PRIORITY.lifecycleSync,
      ),
      trigger(
        "refresh_after_relevant_skill_lost",
        "skill_lost",
        true,
        "weidi.current_lord_skill_loss_changes_effective_skill",
        "weidi.refresh_current_lord_skill",
        PRIORITY.lifecycleSync,
      ),
    ],
  }),
]);

/** Exact unique rules IDs belonging to the 25 standard generals and SP Yuan Shu. */
export const DEFAULT_SKILL_RULE_IDS: readonly string[] = Object.freeze([
  ...new Set(
    FULL_GENERAL_CATALOG
      .filter((general) => general.pack === "standard" || general.pack === "sp")
      .flatMap((general) => general.skills.map((entry) => entry.rulesId)),
  ),
]);

export function createDefaultSkillRegistry(): SkillRegistry {
  const registry = new SkillRegistry();
  for (const definition of DEFAULT_SKILL_RULE_DEFINITIONS) registry.register(definition);
  registry.assertCoverage(DEFAULT_SKILL_RULE_IDS);
  return registry;
}
