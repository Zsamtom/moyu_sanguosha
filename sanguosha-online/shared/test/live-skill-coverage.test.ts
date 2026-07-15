import { describe, expect, it } from "vitest";
import {
  LIVE_IMPLEMENTED_SKILL_RULE_IDS,
  LIVE_ENABLED_GENERAL_IDS,
  assertFullLiveSkillCoverage,
  auditLiveGeneralCoverage,
  auditLiveSkillCoverage,
} from "../src/skills/live-coverage.js";
import { FULL_SKILL_RULE_IDS } from "../src/full-skill-ids.js";

describe("strict live skill completion manifest", () => {
  it("tracks only the fully integrated GameSession verticals", () => {
    const audit = auditLiveSkillCoverage();
    expect(audit.implemented).toEqual(LIVE_IMPLEMENTED_SKILL_RULE_IDS);
    expect(audit.implementedCount).toBe(42);
    expect(audit.totalCount).toBe(FULL_SKILL_RULE_IDS.length);
    expect(audit.remaining).toHaveLength(FULL_SKILL_RULE_IDS.length - 42);
    expect(audit.complete).toBe(false);
  });

  it("provides a deliberately failing final gate until every rules skill is live", () => {
    expect(() => assertFullLiveSkillCoverage()).toThrow(/live skill coverage incomplete/);
    expect(() => assertFullLiveSkillCoverage(FULL_SKILL_RULE_IDS)).not.toThrow();
  });

  it("derives complete, partial, and untouched generals from the strict skill manifest", () => {
    const audit = auditLiveGeneralCoverage();
    expect(audit.entries).toHaveLength(66);
    expect(LIVE_ENABLED_GENERAL_IDS).toHaveLength(26);
    expect(audit.completeGeneralIds).toHaveLength(26);
    expect(audit.partialGeneralIds).toHaveLength(0);
    expect(audit.unimplementedGeneralIds).toHaveLength(0);
    expect(audit.metadataOnlyGeneralIds).toHaveLength(40);
    expect(audit.completeGeneralIds).toEqual(expect.arrayContaining([
      "huang_yue_ying", "liu_bei", "yuan_shu", "zhou_yu", "diao_chan",
      "cao_cao", "ma_chao", "zhu_ge_liang", "da_qiao", "guo_jia", "si_ma_yi", "xia_hou_dun", "zhang_liao",
    ]));
    expect(audit.partialGeneralIds).toEqual([]);
    expect(audit.unimplementedGeneralIds).toEqual([]);
    expect(audit.metadataOnlyGeneralIds).toEqual(expect.arrayContaining(["liu_chan", "pang_de", "shen_si_ma_yi"]));
  });
});
