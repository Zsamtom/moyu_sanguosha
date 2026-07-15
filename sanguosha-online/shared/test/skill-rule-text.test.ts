import { describe, expect, it } from "vitest";

import { FULL_GENERAL_CATALOG } from "../src/full-general-catalog.js";
import { FULL_SKILL_RULE_IDS } from "../src/full-skill-ids.js";
import {
  FULL_SKILL_RULE_TEXTS,
  combineGeneralSkillRuleText,
  getGeneralSkillRuleTexts,
  getSkillRuleText,
  getSkillRuleTextDefinition,
} from "../src/skills/rule-text.js";

describe("complete Chinese skill rules text", () => {
  it("covers all 124 unique rules exactly once in canonical order", () => {
    expect(FULL_SKILL_RULE_TEXTS).toHaveLength(124);
    expect(FULL_SKILL_RULE_TEXTS.map((definition) => definition.rulesId)).toEqual(FULL_SKILL_RULE_IDS);
    expect(new Set(FULL_SKILL_RULE_TEXTS.map((definition) => definition.rulesId))).toHaveLength(124);
    expect(FULL_SKILL_RULE_TEXTS.every(({ name, text }) => name.trim().length > 0 && text.trim().length > 0)).toBe(true);
  });

  it("keeps source naming decisions and complex rules explicit", () => {
    expect(getSkillRuleTextDefinition("jizhi").name).toBe("集智");
    expect(getSkillRuleTextDefinition("kuangbao").name).toBe("狂暴");
    expect(getSkillRuleTextDefinition("wushen").name).toBe("武神");
    expect(getSkillRuleTextDefinition("wuhun").name).toBe("武魂");

    expect(getSkillRuleText("guhuo")).toMatch(/依座次.*质疑.*红桃.*继续结算/);
    expect(getSkillRuleText("mengjin")).toMatch(/手牌或装备区/);
    expect(getSkillRuleText("mengjin")).not.toMatch(/判定区|区域里的一张牌/);
    expect(getSkillRuleText("huashen")).toMatch(/两张.*化身.*更换/);
    expect(getSkillRuleText("yeyan")).toMatch(/至多三名.*3点火焰伤害.*四张花色各不相同.*失去3点体力/);
    expect(getSkillRuleText("duanchang")).toMatch(/死亡.*当前拥有的所有武将技能/);
    expect(getSkillRuleText("duanchang")).not.toMatch(/half implemented|未实现/i);
  });

  it("combines immutable rules copy for all 66 generals", () => {
    expect(FULL_GENERAL_CATALOG).toHaveLength(66);
    for (const general of FULL_GENERAL_CATALOG) {
      const definitions = getGeneralSkillRuleTexts(general.id);
      expect(definitions).toHaveLength(general.skills.length);
      expect(Object.isFrozen(definitions)).toBe(true);
      expect(definitions.every(Object.isFrozen)).toBe(true);
      expect(combineGeneralSkillRuleText(general.id).trim().length).toBeGreaterThan(0);
      for (const [index, skill] of general.skills.entries()) {
        expect(definitions[index]).toMatchObject({
          skillId: skill.id,
          rulesId: skill.rulesId,
          name: skill.name,
          category: skill.category,
        });
      }
    }
  });

  it("deep-freezes the shared catalog and rejects unknown IDs", () => {
    expect(Object.isFrozen(FULL_SKILL_RULE_TEXTS)).toBe(true);
    expect(FULL_SKILL_RULE_TEXTS.every(Object.isFrozen)).toBe(true);
    expect(() => getSkillRuleText("not_a_skill")).toThrow(/未知技能规则/);
    expect(() => getSkillRuleTextDefinition("not_a_skill")).toThrow(/未知技能规则/);
    expect(() => getGeneralSkillRuleTexts("not_a_general")).toThrow(/未知武将/);
    expect(() => combineGeneralSkillRuleText("not_a_general")).toThrow(/未知武将/);
  });
});
