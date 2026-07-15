import { describe, expect, it } from "vitest";

import { FULL_GENERAL_CATALOG } from "../src/full-general-catalog.js";
import { FULL_SKILL_RULE_IDS, isFullSkillRulesId } from "../src/full-skill-ids.js";

describe("complete skill rules id set", () => {
  it("matches every unique rulesId in the complete catalog without extras", () => {
    const catalogIds = [...new Set(FULL_GENERAL_CATALOG.flatMap((general) => general.skills.map((skill) => skill.rulesId)))].sort();
    expect(FULL_SKILL_RULE_IDS).toHaveLength(124);
    expect([...FULL_SKILL_RULE_IDS].sort()).toEqual(catalogIds);
    expect(new Set(FULL_SKILL_RULE_IDS).size).toBe(FULL_SKILL_RULE_IDS.length);
  });

  it("provides a runtime guard for persisted and external values", () => {
    expect(isFullSkillRulesId("wusheng")).toBe(true);
    expect(isFullSkillRulesId("huashen")).toBe(true);
    expect(isFullSkillRulesId("not_a_skill")).toBe(false);
  });
});
