import { describe, expect, it } from "vitest";

import {
  FULL_GENERAL_CATALOG,
  FULL_GENERAL_PACKS,
  getFullGeneralDefinition,
  getFullGeneralSkillDefinition,
} from "../src/full-general-catalog.js";

describe("full general catalog", () => {
  it("contains the exact 66-character source roster and pack counts", () => {
    expect(FULL_GENERAL_CATALOG).toHaveLength(66);

    const counts = Object.fromEntries(
      FULL_GENERAL_PACKS.map((pack) => [
        pack,
        FULL_GENERAL_CATALOG.filter((general) => general.pack === pack).length,
      ]),
    );
    expect(counts).toEqual({
      standard: 25,
      sp: 1,
      wind: 8,
      fire: 8,
      forest: 8,
      mountain: 8,
      god: 8,
    });
  });

  it("uses globally unique stable snake_case general and skill ids", () => {
    const snakeCase = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
    const generalIds = FULL_GENERAL_CATALOG.map((general) => general.id);
    const skills = FULL_GENERAL_CATALOG.flatMap((general) => general.skills);
    const skillIds = skills.map((skill) => skill.id);

    expect(new Set(generalIds).size).toBe(generalIds.length);
    expect(new Set(skillIds).size).toBe(skillIds.length);
    expect(generalIds.every((id) => snakeCase.test(id))).toBe(true);
    expect(skillIds.every((id) => snakeCase.test(id))).toBe(true);
    expect(skills.every((skill) => snakeCase.test(skill.rulesId))).toBe(true);
    expect(
      FULL_GENERAL_CATALOG.every((general) =>
        general.skills.every((skill) => skill.id.startsWith(`${general.id}_`)),
      ),
    ).toBe(true);
  });

  it("keeps extension membership and source anomalies explicit", () => {
    expect(getFullGeneralDefinition("xun_yu").pack).toBe("fire");
    expect(getFullGeneralDefinition("xu_chu").pack).toBe("standard");

    const gods = FULL_GENERAL_CATALOG.filter((general) => general.pack === "god");
    expect(gods).toHaveLength(8);
    expect(gods.every((general) => general.faction === "selectable")).toBe(true);

    const xiaoQiao = getFullGeneralDefinition("xiao_qiao");
    expect(xiaoQiao.faction).toBe("qun");
    expect(xiaoQiao.notes).toContain("official");

    const jizhi = getFullGeneralSkillDefinition("huang_yue_ying_jizhi");
    expect(jizhi.name).toBe("集智");
    expect(jizhi.sourceAlias).toBe("急智");

    const shenGuanYu = getFullGeneralDefinition("shen_guan_yu");
    expect(shenGuanYu.skills.map((skill) => skill.name)).toEqual(["武神", "武魂"]);
    expect(shenGuanYu.skills.map((skill) => skill.sourceAlias)).toEqual(["武魂", "梦魇"]);
  });

  it("is immutable at runtime as well as readonly in TypeScript", () => {
    expect(Object.isFrozen(FULL_GENERAL_CATALOG)).toBe(true);
    expect(FULL_GENERAL_CATALOG.every((general) => Object.isFrozen(general))).toBe(true);
    expect(FULL_GENERAL_CATALOG.every((general) => Object.isFrozen(general.skills))).toBe(true);
    expect(FULL_GENERAL_CATALOG.flatMap((general) => general.skills).every((skill) => Object.isFrozen(skill))).toBe(true);
  });
});
