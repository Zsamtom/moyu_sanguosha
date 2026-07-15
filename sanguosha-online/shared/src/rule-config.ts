import type { RoleDistribution } from "./types.js";
import { FULL_GENERAL_PACKS, type FullGeneralPack } from "./full-general-catalog.js";

/**
 * Stable identifier for the complete rules migration. Snapshots persist this
 * value so future rule corrections can be migrated intentionally.
 */
export const COMPLETE_RULE_SET_VERSION = "original-66-v1" as const;
export type RuleSetVersion = typeof COMPLETE_RULE_SET_VERSION;
export type PackId = FullGeneralPack;

export type GeneralSelectionMode = "choice" | "random";
export type DeckProfile = "original-160";

export interface RoomRuleConfig {
  readonly ruleSetVersion: RuleSetVersion;
  readonly enabledGeneralPacks: readonly PackId[];
  readonly generalSelection: {
    readonly mode: GeneralSelectionMode;
    /** Number of private candidates offered to every player in choice mode. */
    readonly candidatesPerPlayer: number;
    readonly allowDuplicateGenerals: boolean;
  };
  readonly deckProfile: DeckProfile;
  /** Matches CardsHeap.remainingShuffleTimes; zero means the next exhaustion is a draw. */
  readonly maximumReshuffles: number;
  /** The original project grants the lord +1 max HP only with at least five players. */
  readonly lordBonusMinimumPlayers: number;
  readonly godFactionChoice: boolean;
}

export const ORIGINAL_ROLE_DISTRIBUTIONS = Object.freeze({
  2: Object.freeze({ lord: 1, loyalist: 0, rebel: 1, renegade: 0 }),
  3: Object.freeze({ lord: 1, loyalist: 0, rebel: 1, renegade: 1 }),
  4: Object.freeze({ lord: 1, loyalist: 1, rebel: 1, renegade: 1 }),
  5: Object.freeze({ lord: 1, loyalist: 1, rebel: 2, renegade: 1 }),
  6: Object.freeze({ lord: 1, loyalist: 2, rebel: 2, renegade: 1 }),
  7: Object.freeze({ lord: 1, loyalist: 2, rebel: 3, renegade: 1 }),
  8: Object.freeze({ lord: 1, loyalist: 2, rebel: 4, renegade: 1 }),
  9: Object.freeze({ lord: 1, loyalist: 2, rebel: 4, renegade: 2 }),
  10: Object.freeze({ lord: 1, loyalist: 3, rebel: 4, renegade: 2 }),
} satisfies Readonly<Record<number, Readonly<RoleDistribution>>>);

export const DEFAULT_COMPLETE_RULE_CONFIG: Readonly<RoomRuleConfig> = Object.freeze({
  ruleSetVersion: COMPLETE_RULE_SET_VERSION,
  enabledGeneralPacks: Object.freeze([...FULL_GENERAL_PACKS]),
  generalSelection: Object.freeze({
    mode: "choice",
    candidatesPerPlayer: 3,
    allowDuplicateGenerals: false,
  }),
  deckProfile: "original-160",
  maximumReshuffles: 5,
  lordBonusMinimumPlayers: 5,
  godFactionChoice: true,
});

export type SourceConflictDecisionId =
  | "unseeded_san_jian_liang_ren_dao"
  | "standard_pool_xu_chu"
  | "zi_xing_display_name"
  | "huang_yue_ying_jizhi_name"
  | "shen_guan_yu_skill_names"
  | "shen_lv_bu_mark_name"
  | "god_faction_choice"
  | "shen_cao_cao_guixin_per_point"
  | "shen_guan_yu_wushen_distance_scope"
  | "shen_guan_yu_wuhun_resolution"
  | "shen_lv_bu_wumou_commitment"
  | "shen_lv_bu_wuqian_lifecycle"
  | "shen_lv_bu_shenfen_stages"
  | "shen_lv_meng_shelie_by_printed_suit"
  | "shen_lv_meng_gongxin_other_only"
  | "shen_si_ma_yi_baiyin_max_hp"
  | "shen_si_ma_yi_jilue_invocations"
  | "shen_si_ma_yi_lianpo_queue"
  | "shen_zhao_yun_juejing_composition"
  | "shen_zhao_yun_longhun_atomic_cost"
  | "shen_zhou_yu_qinyin_recheck"
  | "shen_zhou_yu_yeyan_commitment"
  | "shen_zhu_ge_liang_qixing_weather_sources"
  | "cao_pi_xingshang"
  | "cao_pi_fangzhu"
  | "dong_zhuo_baonue"
  | "dong_zhuo_benghuai_max_hp"
  | "jia_xu_wansha_turn_scope"
  | "jia_xu_luanwu"
  | "lu_su_haoshi"
  | "lu_su_dimeng_atomic_swap"
  | "meng_huo_huoshou_source_lifetime"
  | "meng_huo_zaiqi"
  | "zhu_rong_juxiang"
  | "zhu_rong_lieren"
  | "cai_wen_ji_duanchang"
  | "deng_ai_tuntian_loss_batch"
  | "jiang_wei_tiaoxin"
  | "liu_chan_fangquan"
  | "sun_ce_jiang_timing"
  | "sun_ce_yingyang_clamp"
  | "sun_ce_zhiba"
  | "sun_ce_yingzi_version"
  | "zhang_he_qiaobian"
  | "zuo_ci_huashen_granularity"
  | "zuo_ci_xinsheng_per_point"
  | "cao_ren_jushou"
  | "yan_liang_wen_chou_shuangxiong"
  | "xiao_qiao_faction"
  | "xiao_qiao_tianxiang_suit"
  | "xia_hou_yuan_shensu"
  | "zhang_jiao_leiji_target"
  | "yu_ji_guhuo"
  | "zhang_jiao_huangtian"
  | "zhou_tai_buqu"
  | "zhang_jiao_guidao"
  | "dian_wei_qiangxi"
  | "pang_de_mengjin_zone"
  | "pang_tong_lianhuan_targets"
  | "pang_tong_niepan"
  | "tai_shi_ci_tianyi"
  | "wo_long_bazhen"
  | "wo_long_huoji_self"
  | "xun_yu_jieming"
  | "yuan_shao_luanji"
  | "yuan_shao_xueyi";

export interface SourceConflictDecision {
  readonly id: SourceConflictDecisionId;
  readonly decision: string;
  readonly rationale: "source-description" | "original-data" | "same-era-rule";
}

/**
 * Explicit rulings for known Java source contradictions. These choices are
 * deliberately data, not comments hidden in individual skill implementations.
 */
export const SOURCE_CONFLICT_DECISIONS: readonly Readonly<SourceConflictDecision>[] = Object.freeze([
  Object.freeze({
    id: "unseeded_san_jian_liang_ren_dao",
    decision: "Keep the card out of the original 160-card deck because CardsHeap never seeds it.",
    rationale: "original-data",
  }),
  Object.freeze({
    id: "standard_pool_xu_chu",
    decision: "Standard Wei contains Xu Chu; Xun Yu remains in Fire.",
    rationale: "original-data",
  }),
  Object.freeze({
    id: "zi_xing_display_name",
    decision: "Display 紫骍; do not preserve the erroneous 赤兔 toString result.",
    rationale: "original-data",
  }),
  Object.freeze({
    id: "huang_yue_ying_jizhi_name",
    decision: "Use the stable rules id jizhi and display 集智.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "shen_guan_yu_skill_names",
    decision: "Use 武神 for heart-to-Slash and 武魂 for Nightmare marks/death judgment.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "shen_lv_bu_mark_name",
    decision: "Use 狂暴 for the Rage mark skill.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "god_faction_choice",
    decision: "Before game start, every God-pack general must publicly choose exactly one faction from Wei, Shu, Wu, or Qun; use it for all faction and lord-skill checks, keep it fixed for the game, and never leave the faction as God or null.",
    rationale: "original-data",
  }),
  Object.freeze({
    id: "shen_cao_cao_guixin_per_point",
    decision: "For each damage point Shen Cao Cao survives, open one independent optional Guixin resolution; if invoked, resnapshot zones, gain exactly one hand, equipment, or judgment card from every other living nonempty character in seat order, then toggle Shen Cao Cao's face state before opening the next point.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "shen_guan_yu_wushen_distance_scope",
    decision: "Wushen treats each effective-Heart physical hand card as Slash for use or response; only a target declaration made by Shen Guan Yu for that Heart Slash ignores distance, preselected targets are not retroactively legalized, and the declaration-scoped bypass never leaks to a later card.",
    rationale: "same-era-rule",
  }),
  Object.freeze({
    id: "shen_guan_yu_wuhun_resolution",
    decision: "After each point of sourced damage, give that source one Nightmare mark; source-less damage gives none. After Shen Guan Yu's death is confirmed but before original death rewards or punishments, choose one living other character tied at the highest positive mark count; with no such holder perform no judgment, while a final Peach or Peach Garden lets the chosen target survive and every other result causes immediate source-less death that bypasses dying rescue and Buqu.",
    rationale: "same-era-rule",
  }),
  Object.freeze({
    id: "shen_lv_bu_wumou_commitment",
    decision: "When Shen Lv Bu commits an effective ordinary trick, Wumou first removes one Rage mark if chosen and available or makes him lose 1 HP, then resolves any dying procedure; the already committed trick continues even if that cost kills its user, and delayed tricks do not trigger Wumou.",
    rationale: "same-era-rule",
  }),
  Object.freeze({
    id: "shen_lv_bu_wuqian_lifecycle",
    decision: "During Shen Lv Bu's play phase, each Wuqian use pays two Rage marks and may select any living character including himself; until that turn ends Shen Lv Bu has Wushuang and every cumulatively selected target loses all armor effects, including virtual armor skills, with cleanup restoring only invalidations owned by this Wuqian lifecycle.",
    rationale: "same-era-rule",
  }),
  Object.freeze({
    id: "shen_lv_bu_shenfen_stages",
    decision: "Once per play phase, Shenfen pays six Rage marks and resolves four global stages: damage every other initially living character in seat order, make every survivor discard all equipment, make every survivor discard four hand cards or their whole smaller hand, then toggle Shen Lv Bu if he remains alive; skip characters that die between stages, continue the committed skill if its owner dies, and stop only when the game ends.",
    rationale: "same-era-rule",
  }),
  Object.freeze({
    id: "shen_lv_meng_shelie_by_printed_suit",
    decision: "At an available draw phase, Shelie may replace normal drawing by publicly revealing exactly five cards; Shen Lv Meng must gain exactly one revealed card for every printed suit represented and discard all the rest, rather than choosing an optional subset or grouping by effective suit.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "shen_lv_meng_gongxin_other_only",
    decision: "Once per play phase, Gongxin privately inspects the complete hand of one other living character, never Shen Lv Meng himself; it may select no card or reveal exactly one effective-Heart card and either discard it or put it on the draw-pile top, and the phase use is consumed even when no card is selected.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "shen_si_ma_yi_baiyin_max_hp",
    decision: "At Shen Sima Yi's prepare phase with at least four Ren marks, unawakened Baiyin mandatorily reduces maximum HP by exactly one, clamps current HP downward only when above that new maximum and never heals him, retains every Ren mark, consumes the awakening, and grants Jilue.",
    rationale: "same-era-rule",
  }),
  Object.freeze({
    id: "shen_si_ma_yi_jilue_invocations",
    decision: "Each validated Jilue borrowed-skill invocation spends exactly one Ren mark and failed validation spends none: Guicai replaces a pending judgment with one owned hand card; Fangzhu resolves once per damage event by toggling another living character before that target draws Shen Sima Yi's lost HP; Jizhi draws once per ordinary trick use; Zhiheng once per play phase atomically discards at least one owned hand or equipment card, resolves card-loss triggers, then draws equally; Wansha is armed at the owner's play-phase start and lasts through that turn while he lives.",
    rationale: "same-era-rule",
  }),
  Object.freeze({
    id: "shen_si_ma_yi_lianpo_queue",
    decision: "When Shen Sima Yi kills another character during any character's turn, arm that turn for at most one Lianpo reward regardless of additional kills; after every full turn-end window he may queue exactly one extra turn for himself or decline, then clear the arm, never call a nested turn, and resume normal turn order after the queued turn.",
    rationale: "same-era-rule",
  }),
  Object.freeze({
    id: "shen_zhao_yun_juejing_composition",
    decision: "Juejing adds Shen Zhao Yun's current lost HP to the effective base draw count and adds two to the effective base hand limit; it composes with replacements and other modifiers instead of hard-coding a draw base of two or a hand limit equal to current HP.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "shen_zhao_yun_longhun_atomic_cost",
    decision: "Longhun maps effective Heart to Peach, Diamond to Fire Slash, Club to Dodge, and Spade to Nullification; it atomically pays exactly max(current HP, one) distinct physical cards owned in Shen Zhao Yun's hand or equipment area that all have that effective suit, and failed choice or validation consumes nothing.",
    rationale: "same-era-rule",
  }),
  Object.freeze({
    id: "shen_zhou_yu_qinyin_recheck",
    decision: "Offer Qinyin at most once when Shen Zhou Yu has discarded at least two of his hand cards during that discard phase; after a decline or a seat-ordered global recovery or source-less HP-loss resolution with intervening dying procedures, recheck his hand limit and perform any newly required discard before the phase can finish.",
    rationale: "same-era-rule",
  }),
  Object.freeze({
    id: "shen_zhou_yu_yeyan_commitment",
    decision: "Yeyan may allocate one to three total fire damage among one to three distinct living targets including Shen Zhou Yu; if any target receives at least two, first atomically discard four owned hand cards with four distinct effective suits and lose 3 HP, resolve the owner's dying procedure, then continue every committed damage step in owner-relative seat order even if the source died, stopping only if the game ends.",
    rationale: "same-era-rule",
  }),
  Object.freeze({
    id: "shen_zhu_ge_liang_qixing_weather_sources",
    decision: "At game start, Qixing chooses the final four-card hand and seven private Stars from the initial four hand cards plus the top seven deck cards, and later exchanges only equal subsets after a real draw phase; Kuangfeng and Dawu effects are tagged by their owner and expire before that owner's next turn or on that owner's death, cleanup removes only that source's weather, and Dawu prevention is checked before any Kuangfeng bonus.",
    rationale: "same-era-rule",
  }),
  Object.freeze({
    id: "cao_pi_xingshang",
    decision: "When another character dies, optionally move every card still in their hand, equipment area, and judgment area to Cao Pi's hand as one death disposition before rewards or punishment; never claim extra piles.",
    rationale: "same-era-rule",
  }),
  Object.freeze({
    id: "cao_pi_fangzhu",
    decision: "Resolve Fangzhu once after each positive damage event that Cao Pi survives: choose one other living character, have that target draw cards equal to Cao Pi's current lost HP, then toggle the target's face state.",
    rationale: "same-era-rule",
  }),
  Object.freeze({
    id: "dong_zhuo_baonue",
    decision: "After another living Qun character causes a positive damage event, that source may perform exactly one judgment even while Dong Zhuo is at full HP; an effective Spade requests one recovery, capped by missing HP.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "dong_zhuo_benghuai_max_hp",
    decision: "When Benghuai loses one maximum HP, reduce the maximum by one and clamp current HP down only when it exceeds the new maximum; never raise current HP, and reaching zero maximum HP kills immediately.",
    rationale: "same-era-rule",
  }),
  Object.freeze({
    id: "jia_xu_wansha_turn_scope",
    decision: "Wansha restricts Peach only while its living effective owner Jia Xu is the active turn player; during that turn only Jia Xu and the player in the topmost resolving dying frame may use Peach.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "jia_xu_luanwu",
    decision: "Consume Luanwu once, then in living seat order each other character either uses their own Slash on an ordinary legal target within the set of living characters at minimum authoritative distance, without consuming the normal play-phase Slash quota, or loses 1 HP; never fall back to a farther target, and Jia Xu never uses that Slash for them.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "lu_su_haoshi",
    decision: "If Haoshi leaves Lu Su with more than five hand cards after drawing, he must give floor(half of his hand) to one living other character tied for the minimum hand count; exclude Lu Su when computing that minimum.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "lu_su_dimeng_atomic_swap",
    decision: "Once per play phase, Dimeng discards exactly the two targets' hand-count difference from Lu Su's hand or equipment, then atomically exchanges the complete hands of two distinct other living characters and emits one original-hand loss batch for each affected target.",
    rationale: "same-era-rule",
  }),
  Object.freeze({
    id: "meng_huo_huoshou_source_lifetime",
    decision: "Bind one living effective Huoshou owner when Barbarian Invasion begins and use that binding across the whole card; if the bound Meng Huo dies before later damage, that later damage has no source and never falls back to the original user.",
    rationale: "same-era-rule",
  }),
  Object.freeze({
    id: "meng_huo_zaiqi",
    decision: "Replace the draw phase by revealing exactly lost-HP cards, not lost HP plus one; recover once for each printed Heart and gain every other revealed card.",
    rationale: "original-data",
  }),
  Object.freeze({
    id: "zhu_rong_juxiang",
    decision: "Treat Juxiang as mandatory: Barbarian Invasion has no effect on Zhu Rong, and after another character's physical Barbarian Invasion finishes she gains it if it remains in processing; ignore Java hasJuXiang returning false.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "zhu_rong_lieren",
    decision: "After each Slash-caused damage event, including linked propagation, Zhu Rong may Pindian with the damaged character if both have a hand card; on a win she may gain one of that character's hand or equipment cards, never a judgment card.",
    rationale: "same-era-rule",
  }),
  Object.freeze({
    id: "cai_wen_ji_duanchang",
    decision: "At Cai Wenji's death, a living killer loses a snapshot of every current general-derived skill; do not replace the killer object or alter identity, HP, maximum HP, zones, or turn flow.",
    rationale: "same-era-rule",
  }),
  Object.freeze({
    id: "deng_ai_tuntian_loss_batch",
    decision: "Treat one atomic card-move batch as one optional Tuntian judgment when it makes Deng Ai lose at least one hand or equipment card outside his turn; do not trigger once per physical card.",
    rationale: "same-era-rule",
  }),
  Object.freeze({
    id: "jiang_wei_tiaoxin",
    decision: "Once per play phase, Tiaoxin may target any other living character whose attack range contains Jiang Wei even if that target's areas are empty; the target may use a legal Slash on him, otherwise Jiang Wei may discard one card from the target's hand, equipment, or judgment area.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "liu_chan_fangquan",
    decision: "Fangquan skips Liu Chan's play phase and marks that turn; at that turn's end he may discard one hand card to queue an extra turn for another living character, and the mark clears whether he completes or declines the grant.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "sun_ce_jiang_timing",
    decision: "Trigger Jiang once when Sun Ce uses or becomes a target of Duel or a red Slash, immediately after target designation and before Nullification or effect resolution; do not wait for a Duel effect to begin.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "sun_ce_yingyang_clamp",
    decision: "After Sun Ce's Pindian card is revealed, Yingyang may add or subtract three and clamps the resulting rank to the inclusive range 1 through 13.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "sun_ce_zhiba",
    decision: "Once per play phase, another Wu character may request Pindian with the living lord Sun Ce; awakened Sun Ce may refuse, and when the challenger does not win Sun Ce may gain both Pindian cards.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "sun_ce_yingzi_version",
    decision: "Under original-66-v1, Hunzi grants the same-era Yingzi: an optional extra draw during the draw phase with no maximum-HP hand-limit override; ignore the later locked variant in Sun Ce's Java description.",
    rationale: "same-era-rule",
  }),
  Object.freeze({
    id: "zhang_he_qiaobian",
    decision: "After discarding one hand card before judgment, draw, play, or discard, Qiaobian skips that phase; its draw replacement takes from up to two distinct other characters, while its play replacement moves one equipment or judgment card between two different characters into a legal corresponding position.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "zuo_ci_huashen_granularity",
    decision: "Huashen grants exactly one normal or locked skill from one owned unused-general form and projects that form's faction and gender while preserving identity, HP, maximum HP, zones, and turn state; never replace the player object.",
    rationale: "same-era-rule",
  }),
  Object.freeze({
    id: "zuo_ci_xinsheng_per_point",
    decision: "After Zuo Ci survives a positive damage event, Xinsheng offers one independently selected unused general form for each damage point after that point's dying aftermath settles, not once for the whole event.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "cao_ren_jushou",
    decision: "Use the printed draw-four, then discard a non-equipment card or use an equipment card, and turn over.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "yan_liang_wen_chou_shuangxiong",
    decision: "Use the printed draw-phase replacement and opposite-color Duel conversion.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "xiao_qiao_faction",
    decision: "Keep Xiao Qiao in Qun because both the original constructor and migration roster place her there.",
    rationale: "original-data",
  }),
  Object.freeze({
    id: "xiao_qiao_tianxiang_suit",
    decision: "Tianxiang pays one effectively-heart hand card; do not preserve the Java prompt's erroneous spade requirement.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "xia_hou_yuan_shensu",
    decision: "Implement both printed Shensu windows, including the second window's equipment cost and phase skip.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "zhang_jiao_leiji_target",
    decision: "Leiji judges the selected character, who may be Zhang Jiao himself, rather than always judging Zhang Jiao as the Java method does.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "yu_ji_guhuo",
    decision: "Use the complete same-era Guhuo challenge and reveal procedure instead of the Java recursion and unconditional-heart defects.",
    rationale: "same-era-rule",
  }),
  Object.freeze({
    id: "zhang_jiao_huangtian",
    decision: "Only another Qun character may give a physical Dodge or Lightning to a valid Huangtian lord once in that giver's play phase.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "zhou_tai_buqu",
    decision: "Resolve Buqu once for every HP point that reaches zero or below and use the complete same-era wound and recovery procedure.",
    rationale: "same-era-rule",
  }),
  Object.freeze({
    id: "zhang_jiao_guidao",
    decision: "Guidao may pay an effectively-black hand or equipment card and moves the replaced judgment card into Zhang Jiao's hand.",
    rationale: "same-era-rule",
  }),
  Object.freeze({
    id: "dian_wei_qiangxi",
    decision: "Qiangxi accepts either one HP loss or one weapon card from hand or equipment; ignore the Java option-string typo.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "pang_de_mengjin_zone",
    decision: "Mengjin may discard one hand or equipment card, matching the original Java card-zone implementation rather than later wording variants.",
    rationale: "original-data",
  }),
  Object.freeze({
    id: "pang_tong_lianhuan_targets",
    decision: "Lianhuan supports recasting with zero targets or using Iron Chain on one or two distinct targets; do not require exactly two.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "pang_tong_niepan",
    decision: "Niepan performs the complete limited dying reset: discard every area, turn face up, unchain, clear Wine, draw three, and set HP to three.",
    rationale: "same-era-rule",
  }),
  Object.freeze({
    id: "tai_shi_ci_tianyi",
    decision: "Tianyi applies its printed turn-long Slash count, distance, target-count, or failure restriction instead of Java recursive Slash creation.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "wo_long_bazhen",
    decision: "Bazhen supplies Bagua only while the armor slot is empty and armor effects are valid; ignore the contradictory Java flags.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "wo_long_huoji_self",
    decision: "Fire Attack, including Huoji, may target its user when that target still has a hand card after the conversion cost is paid.",
    rationale: "same-era-rule",
  }),
  Object.freeze({
    id: "xun_yu_jieming",
    decision: "Jieming resolves once per damage point and fills a chosen living character to min(max HP, five), not by lost HP as in Java.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "yuan_shao_luanji",
    decision: "Luanji consumes two different same-suit hand cards and has no later-edition per-suit usage restriction.",
    rationale: "source-description",
  }),
  Object.freeze({
    id: "yuan_shao_xueyi",
    decision: "Xueyi grants two hand-limit points for every other living Qun character and never counts Yuan Shao himself.",
    rationale: "source-description",
  }),
]);

export function roleDistributionForCompleteRules(playerCount: number): RoleDistribution {
  const distribution = ORIGINAL_ROLE_DISTRIBUTIONS[playerCount as keyof typeof ORIGINAL_ROLE_DISTRIBUTIONS];
  if (!distribution) throw new RangeError("playerCount must be an integer from 2 through 10");
  return { ...distribution };
}

export function enabledGeneralPacks(config: RoomRuleConfig): readonly PackId[] {
  const unique = new Set(config.enabledGeneralPacks);
  if (unique.size !== config.enabledGeneralPacks.length) {
    throw new RangeError("enabledGeneralPacks must not contain duplicates");
  }
  for (const pack of unique) {
    if (!FULL_GENERAL_PACKS.includes(pack)) throw new RangeError(`unknown general pack: ${pack}`);
  }
  if (!unique.has("standard")) throw new RangeError("the standard pack must remain enabled");
  return Object.freeze(FULL_GENERAL_PACKS.filter((pack) => unique.has(pack)));
}
