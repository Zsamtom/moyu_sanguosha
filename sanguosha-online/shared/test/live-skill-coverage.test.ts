import { describe, expect, it } from "vitest";
import {
  LIVE_ENABLED_GENERAL_IDS,
  assertFullLiveSkillCoverage,
  auditLiveGeneralCoverage,
  auditLiveSkillCoverage,
} from "../src/skills/live-coverage.js";
import { FULL_SKILL_RULE_IDS } from "../src/full-skill-ids.js";

describe("strict live skill completion manifest", () => {
  it("covers all fully integrated GameSession verticals", () => {
    const audit = auditLiveSkillCoverage();
    expect(audit.implemented).toEqual(FULL_SKILL_RULE_IDS);
    expect(audit.implementedCount).toBe(124);
    expect(audit.totalCount).toBe(124);
    expect(audit.remaining).toEqual([]);
    expect(audit.complete).toBe(true);
  });

  it("passes the final gate", () => {
    expect(() => assertFullLiveSkillCoverage()).not.toThrow();
  });

  it("marks every enabled general complete", () => {
    const audit = auditLiveGeneralCoverage();
    expect(audit.entries).toHaveLength(66);
    expect(LIVE_ENABLED_GENERAL_IDS).toHaveLength(66);
    expect(audit.completeGeneralIds).toEqual(LIVE_ENABLED_GENERAL_IDS);
    expect(audit.partialGeneralIds).toEqual([]);
    expect(audit.unimplementedGeneralIds).toEqual([]);
    expect(audit.metadataOnlyGeneralIds).toEqual([]);
  });
});
