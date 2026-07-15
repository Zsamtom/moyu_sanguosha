import { describe, expect, it } from "vitest";

import { FULL_GENERAL_CATALOG, FULL_GENERAL_PACKS } from "../src/full-general-catalog.js";
import {
  COMPLETE_RULE_SET_VERSION,
  DEFAULT_COMPLETE_RULE_CONFIG,
  ORIGINAL_ROLE_DISTRIBUTIONS,
  SOURCE_CONFLICT_DECISIONS,
  enabledGeneralPacks,
  roleDistributionForCompleteRules,
} from "../src/rule-config.js";

describe("complete rule configuration", () => {
  it("enables the complete 66-general roster by default", () => {
    expect(DEFAULT_COMPLETE_RULE_CONFIG.ruleSetVersion).toBe(COMPLETE_RULE_SET_VERSION);
    expect(DEFAULT_COMPLETE_RULE_CONFIG.enabledGeneralPacks).toEqual(FULL_GENERAL_PACKS);
    expect(
      FULL_GENERAL_CATALOG.filter((general) =>
        DEFAULT_COMPLETE_RULE_CONFIG.enabledGeneralPacks.includes(general.pack),
      ),
    ).toHaveLength(66);
    expect(DEFAULT_COMPLETE_RULE_CONFIG.deckProfile).toBe("original-160");
    expect(DEFAULT_COMPLETE_RULE_CONFIG.maximumReshuffles).toBe(5);
    expect(DEFAULT_COMPLETE_RULE_CONFIG.lordBonusMinimumPlayers).toBe(5);
    expect(DEFAULT_COMPLETE_RULE_CONFIG.godFactionChoice).toBe(true);
  });

  it("freezes the original project's 2-10 player identity table", () => {
    expect(ORIGINAL_ROLE_DISTRIBUTIONS).toEqual({
      2: { lord: 1, loyalist: 0, rebel: 1, renegade: 0 },
      3: { lord: 1, loyalist: 0, rebel: 1, renegade: 1 },
      4: { lord: 1, loyalist: 1, rebel: 1, renegade: 1 },
      5: { lord: 1, loyalist: 1, rebel: 2, renegade: 1 },
      6: { lord: 1, loyalist: 2, rebel: 2, renegade: 1 },
      7: { lord: 1, loyalist: 2, rebel: 3, renegade: 1 },
      8: { lord: 1, loyalist: 2, rebel: 4, renegade: 1 },
      9: { lord: 1, loyalist: 2, rebel: 4, renegade: 2 },
      10: { lord: 1, loyalist: 3, rebel: 4, renegade: 2 },
    });
    for (let count = 2; count <= 10; count += 1) {
      const distribution = roleDistributionForCompleteRules(count);
      expect(Object.values(distribution).reduce((sum, value) => sum + value, 0)).toBe(count);
    }
    expect(() => roleDistributionForCompleteRules(1)).toThrow(RangeError);
    expect(() => roleDistributionForCompleteRules(11)).toThrow(RangeError);
  });

  it("canonicalizes pack order and rejects ambiguous pack configurations", () => {
    expect(enabledGeneralPacks({
      ...DEFAULT_COMPLETE_RULE_CONFIG,
      enabledGeneralPacks: ["god", "standard", "wind"],
    })).toEqual(["standard", "wind", "god"]);
    expect(() => enabledGeneralPacks({
      ...DEFAULT_COMPLETE_RULE_CONFIG,
      enabledGeneralPacks: ["standard", "wind", "wind"],
    })).toThrow(/duplicates/);
    expect(() => enabledGeneralPacks({
      ...DEFAULT_COMPLETE_RULE_CONFIG,
      enabledGeneralPacks: ["wind"],
    })).toThrow(/standard/);
  });

  it("records every currently known source conflict once", () => {
    expect(SOURCE_CONFLICT_DECISIONS).toHaveLength(66);
    expect(new Set(SOURCE_CONFLICT_DECISIONS.map((entry) => entry.id)).size).toBe(66);
    expect(SOURCE_CONFLICT_DECISIONS.every((entry) => entry.decision.length > 20)).toBe(true);
    expect(SOURCE_CONFLICT_DECISIONS.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      "zhang_jiao_leiji_target",
      "zhou_tai_buqu",
      "dian_wei_qiangxi",
      "tai_shi_ci_tianyi",
      "yuan_shao_xueyi",
      "god_faction_choice",
      "shen_cao_cao_guixin_per_point",
      "shen_guan_yu_wushen_distance_scope",
      "shen_guan_yu_wuhun_resolution",
      "shen_lv_bu_wumou_commitment",
      "shen_lv_bu_wuqian_lifecycle",
      "shen_lv_bu_shenfen_stages",
      "shen_lv_meng_shelie_by_printed_suit",
      "shen_lv_meng_gongxin_other_only",
      "shen_si_ma_yi_baiyin_max_hp",
      "shen_si_ma_yi_jilue_invocations",
      "shen_si_ma_yi_lianpo_queue",
      "shen_zhao_yun_juejing_composition",
      "shen_zhao_yun_longhun_atomic_cost",
      "shen_zhou_yu_qinyin_recheck",
      "shen_zhou_yu_yeyan_commitment",
      "shen_zhu_ge_liang_qixing_weather_sources",
      "cao_pi_xingshang",
      "dong_zhuo_benghuai_max_hp",
      "jia_xu_wansha_turn_scope",
      "jia_xu_luanwu",
      "lu_su_dimeng_atomic_swap",
      "meng_huo_huoshou_source_lifetime",
      "meng_huo_zaiqi",
      "zhu_rong_juxiang",
      "deng_ai_tuntian_loss_batch",
      "sun_ce_yingyang_clamp",
      "zhang_he_qiaobian",
      "zuo_ci_huashen_granularity",
    ]));
  });
});
