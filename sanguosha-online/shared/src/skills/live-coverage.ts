import { FULL_SKILL_RULE_IDS, type FullSkillRulesId } from "../full-skill-ids.js";
import {
  FULL_GENERAL_CATALOG,
  type FullGeneralPack,
} from "../full-general-catalog.js";
import type { FullGeneralId } from "../full-general-ids.js";

/**
 * Skills with a complete current GameSession vertical: authoritative rule
 * behavior, prompts/actions, persistence, bot handling, web interaction, and
 * regression tests. Keep this deliberately stricter than declarative metadata.
 */
export const LIVE_IMPLEMENTED_SKILL_RULE_IDS = [
  "biyue",
  "fanjian",
  "fankui",
  "ganglie",
  "guanxing",
  "guose",
  "guicai",
  "hujia",
  "jijiang",
  "jijiu",
  "jieyin",
  "jizhi",
  "jianxiong",
  "jiuyuan",
  "keji",
  "kongcheng",
  "kurou",
  "lianying",
  "liuli",
  "lijian",
  "longdan",
  "luoshen",
  "luoyi",
  "mashu",
  "paoxiao",
  "qianxun",
  "qicai",
  "qingguo",
  "qingnang",
  "qixi",
  "rende",
  "tiandu",
  "tieqi",
  "tuxi",
  "weidi",
  "wusheng",
  "wushuang",
  "xiaoji",
  "yingzi",
  "yongsi",
  "yiji",
  "zhiheng",
] as const satisfies readonly FullSkillRulesId[];

/** Generals the current live room deal can actually assign before pack selection is wired. */
export const LIVE_ENABLED_GENERAL_IDS: readonly FullGeneralId[] = Object.freeze(
  FULL_GENERAL_CATALOG
    .filter((general) => general.pack === "standard" || general.pack === "sp")
    .map((general) => general.id),
);

export interface LiveSkillCoverage {
  readonly implemented: readonly FullSkillRulesId[];
  readonly remaining: readonly FullSkillRulesId[];
  readonly implementedCount: number;
  readonly totalCount: number;
  readonly complete: boolean;
}

export interface LiveGeneralCoverageEntry {
  readonly generalId: FullGeneralId;
  readonly pack: FullGeneralPack;
  readonly implementedSkillIds: readonly FullSkillRulesId[];
  readonly remainingSkillIds: readonly FullSkillRulesId[];
  readonly status: "complete" | "partial" | "unimplemented" | "metadata_only";
}

export interface LiveGeneralCoverage {
  readonly entries: readonly LiveGeneralCoverageEntry[];
  readonly completeGeneralIds: readonly FullGeneralId[];
  readonly partialGeneralIds: readonly FullGeneralId[];
  readonly unimplementedGeneralIds: readonly FullGeneralId[];
  readonly metadataOnlyGeneralIds: readonly FullGeneralId[];
}

export function auditLiveSkillCoverage(
  implemented: readonly FullSkillRulesId[] = LIVE_IMPLEMENTED_SKILL_RULE_IDS,
): LiveSkillCoverage {
  if (new Set(implemented).size !== implemented.length) {
    throw new Error("live implemented skill list contains duplicates");
  }
  const canonical = new Set<FullSkillRulesId>(FULL_SKILL_RULE_IDS);
  if (implemented.some((rulesId) => !canonical.has(rulesId))) {
    throw new Error("live implemented skill list contains an unknown rules ID");
  }
  const implementedSet = new Set(implemented);
  const remaining = FULL_SKILL_RULE_IDS.filter((rulesId) => !implementedSet.has(rulesId));
  return Object.freeze({
    implemented: Object.freeze([...implemented]),
    remaining: Object.freeze(remaining),
    implementedCount: implemented.length,
    totalCount: FULL_SKILL_RULE_IDS.length,
    complete: remaining.length === 0,
  });
}

export function assertFullLiveSkillCoverage(
  implemented: readonly FullSkillRulesId[] = LIVE_IMPLEMENTED_SKILL_RULE_IDS,
): void {
  const audit = auditLiveSkillCoverage(implemented);
  if (!audit.complete) {
    throw new Error(`live skill coverage incomplete: ${audit.remaining.join(", ")}`);
  }
}

export function auditLiveGeneralCoverage(
  implemented: readonly FullSkillRulesId[] = LIVE_IMPLEMENTED_SKILL_RULE_IDS,
  enabledGeneralIds: readonly FullGeneralId[] = LIVE_ENABLED_GENERAL_IDS,
): LiveGeneralCoverage {
  // Reuse validation of duplicate and unknown rules IDs.
  auditLiveSkillCoverage(implemented);
  if (new Set(enabledGeneralIds).size !== enabledGeneralIds.length) {
    throw new Error("live enabled general list contains duplicates");
  }
  const knownGeneralIds = new Set(FULL_GENERAL_CATALOG.map((general) => general.id));
  if (enabledGeneralIds.some((generalId) => !knownGeneralIds.has(generalId))) {
    throw new Error("live enabled general list contains an unknown general ID");
  }
  const implementedSet = new Set(implemented);
  const enabledSet = new Set(enabledGeneralIds);
  const entries = FULL_GENERAL_CATALOG.map((general): LiveGeneralCoverageEntry => {
    const skillIds = [...new Set(general.skills.map((skill) => skill.rulesId))];
    const enabled = enabledSet.has(general.id);
    const implementedSkillIds = enabled ? skillIds.filter((skillId) => implementedSet.has(skillId)) : [];
    const remainingSkillIds = enabled ? skillIds.filter((skillId) => !implementedSet.has(skillId)) : skillIds;
    const status = !enabled
      ? "metadata_only"
      : remainingSkillIds.length === 0
      ? "complete"
      : implementedSkillIds.length > 0
        ? "partial"
        : "unimplemented";
    return Object.freeze({
      generalId: general.id,
      pack: general.pack,
      implementedSkillIds: Object.freeze(implementedSkillIds),
      remainingSkillIds: Object.freeze(remainingSkillIds),
      status,
    });
  });
  return Object.freeze({
    entries: Object.freeze(entries),
    completeGeneralIds: Object.freeze(entries.filter((entry) => entry.status === "complete").map((entry) => entry.generalId)),
    partialGeneralIds: Object.freeze(entries.filter((entry) => entry.status === "partial").map((entry) => entry.generalId)),
    unimplementedGeneralIds: Object.freeze(entries.filter((entry) => entry.status === "unimplemented").map((entry) => entry.generalId)),
    metadataOnlyGeneralIds: Object.freeze(entries.filter((entry) => entry.status === "metadata_only").map((entry) => entry.generalId)),
  });
}
