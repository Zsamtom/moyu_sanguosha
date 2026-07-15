import { describe, expect, it } from "vitest";
import {
  FULL_REQUIRED_SKILL_PROGRAMS,
  SkillProgramCoverageError,
  assertSkillProgramCoverage,
  auditSkillProgramCoverage,
  collectSkillProgramRequirements,
  type SkillProgramImplementation,
} from "../src/skills/program-coverage.js";
import { FULL_SKILL_RULE_DEFINITIONS } from "../src/skills/full-definitions.js";

describe("skill program completion gate", () => {
  it("collects a unique provenance-bearing requirement for every declared program", () => {
    expect(FULL_REQUIRED_SKILL_PROGRAMS).toEqual(collectSkillProgramRequirements(FULL_SKILL_RULE_DEFINITIONS));
    expect(FULL_REQUIRED_SKILL_PROGRAMS.length).toBeGreaterThan(FULL_SKILL_RULE_DEFINITIONS.length);
    expect(new Set(FULL_REQUIRED_SKILL_PROGRAMS.map((entry) => `${entry.kind}:${entry.id}`)).size)
      .toBe(FULL_REQUIRED_SKILL_PROGRAMS.length);
    expect(FULL_REQUIRED_SKILL_PROGRAMS.every((entry) =>
      entry.rulesId && entry.specId && entry.referencedBy.length > 0
    )).toBe(true);
    expect(FULL_REQUIRED_SKILL_PROGRAMS.find((entry) => entry.id === "kuangbao.add_rage_per_damage_point")?.referencedBy)
      .toHaveLength(2);
  });

  it("passes only when each declared program has an exact typed implementation", () => {
    const implementations: SkillProgramImplementation[] = FULL_REQUIRED_SKILL_PROGRAMS.map(({ id, kind }) => ({ id, kind }));
    expect(auditSkillProgramCoverage(FULL_REQUIRED_SKILL_PROGRAMS, implementations)).toMatchObject({
      complete: true,
      requiredCount: FULL_REQUIRED_SKILL_PROGRAMS.length,
      implementedCount: FULL_REQUIRED_SKILL_PROGRAMS.length,
      missing: [],
      unexpected: [],
      duplicateImplementationKeys: [],
    });
    expect(() => assertSkillProgramCoverage(FULL_REQUIRED_SKILL_PROGRAMS, implementations)).not.toThrow();
  });

  it("reports omissions, wrong kinds, unknown programs, and duplicates without false completion", () => {
    const [first, second] = FULL_REQUIRED_SKILL_PROGRAMS;
    if (!first || !second) throw new Error("coverage fixture requires at least two programs");
    const implementations: SkillProgramImplementation[] = [
      { id: first.id, kind: first.kind },
      { id: first.id, kind: first.kind },
      { id: second.id, kind: first.kind },
      { id: "unknown.program", kind: "active" },
    ];
    const audit = auditSkillProgramCoverage(FULL_REQUIRED_SKILL_PROGRAMS, implementations);
    expect(audit.complete).toBe(false);
    expect(audit.missing.length).toBeGreaterThan(0);
    expect(audit.unexpected).toEqual(expect.arrayContaining([
      { id: "unknown.program", kind: "active" },
    ]));
    expect(audit.duplicateImplementationKeys).toEqual([`${first.kind}:${first.id}`]);
    expect(() => assertSkillProgramCoverage(FULL_REQUIRED_SKILL_PROGRAMS, implementations))
      .toThrow(SkillProgramCoverageError);
  });
});
