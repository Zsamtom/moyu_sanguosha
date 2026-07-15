import type { SkillRuleDefinition } from "../engine/events.js";
import { FULL_SKILL_RULE_DEFINITIONS } from "./full-definitions.js";

export type SkillProgramKind =
  | "trigger_condition"
  | "trigger_effect"
  | "active"
  | "view_as"
  | "modifier";

export interface SkillProgramRequirement {
  readonly id: string;
  readonly kind: SkillProgramKind;
  /** First declaration, retained as a compact diagnostic label. */
  readonly rulesId: string;
  readonly specId: string;
  /** Every declaration that intentionally shares this runtime program. */
  readonly referencedBy: readonly SkillProgramReference[];
}

export interface SkillProgramReference {
  readonly rulesId: string;
  readonly specId: string;
}

export interface SkillProgramImplementation {
  readonly id: string;
  readonly kind: SkillProgramKind;
}

export interface SkillProgramCoverageAudit {
  readonly complete: boolean;
  readonly requiredCount: number;
  readonly implementedCount: number;
  readonly missing: readonly SkillProgramRequirement[];
  readonly unexpected: readonly SkillProgramImplementation[];
  readonly duplicateImplementationKeys: readonly string[];
}

export class SkillProgramCoverageError extends Error {
  readonly audit: SkillProgramCoverageAudit;

  constructor(audit: SkillProgramCoverageAudit) {
    const sections = [
      audit.missing.length > 0
        ? `missing: ${audit.missing.map((entry) => `${entry.kind}:${entry.id}`).join(", ")}`
        : null,
      audit.unexpected.length > 0
        ? `unexpected: ${audit.unexpected.map((entry) => `${entry.kind}:${entry.id}`).join(", ")}`
        : null,
      audit.duplicateImplementationKeys.length > 0
        ? `duplicates: ${audit.duplicateImplementationKeys.join(", ")}`
        : null,
    ].filter((entry): entry is string => entry !== null);
    super(`skill program coverage is incomplete (${sections.join("; ")})`);
    this.name = "SkillProgramCoverageError";
    this.audit = audit;
  }
}

const keyOf = (value: Pick<SkillProgramImplementation, "kind" | "id">): string => `${value.kind}:${value.id}`;

export function collectSkillProgramRequirements(
  definitions: readonly SkillRuleDefinition[],
): readonly SkillProgramRequirement[] {
  const declarations: Array<Omit<SkillProgramRequirement, "referencedBy">> = [];
  for (const definition of definitions) {
    for (const spec of definition.triggers) {
      declarations.push({ id: spec.conditionId, kind: "trigger_condition", rulesId: definition.rulesId, specId: spec.id });
      declarations.push({ id: spec.effectId, kind: "trigger_effect", rulesId: definition.rulesId, specId: spec.id });
    }
    for (const spec of definition.active) {
      declarations.push({ id: spec.programId, kind: "active", rulesId: definition.rulesId, specId: spec.id });
    }
    for (const spec of definition.viewAs) {
      declarations.push({ id: spec.programId, kind: "view_as", rulesId: definition.rulesId, specId: spec.id });
    }
    for (const spec of definition.modifiers) {
      declarations.push({ id: spec.handlerId, kind: "modifier", rulesId: definition.rulesId, specId: spec.id });
    }
  }
  const byKey = new Map<string, SkillProgramRequirement>();
  for (const declaration of declarations) {
    const key = keyOf(declaration);
    const reference = Object.freeze({ rulesId: declaration.rulesId, specId: declaration.specId });
    const existing = byKey.get(key);
    if (existing) {
      const duplicateReference = existing.referencedBy.some((entry) =>
        entry.rulesId === reference.rulesId && entry.specId === reference.specId
      );
      if (duplicateReference) throw new Error(`duplicate skill program declaration: ${key}`);
      byKey.set(key, Object.freeze({
        ...existing,
        referencedBy: Object.freeze([...existing.referencedBy, reference]),
      }));
      continue;
    }
    byKey.set(key, Object.freeze({
      ...declaration,
      referencedBy: Object.freeze([reference]),
    }));
  }
  return Object.freeze([...byKey.values()]);
}

/** Fail-closed list used by the final all-skills deployment gate. */
export const FULL_REQUIRED_SKILL_PROGRAMS: readonly SkillProgramRequirement[] =
  collectSkillProgramRequirements(FULL_SKILL_RULE_DEFINITIONS);

export function auditSkillProgramCoverage(
  required: readonly SkillProgramRequirement[],
  implementations: readonly SkillProgramImplementation[],
): SkillProgramCoverageAudit {
  const requiredByKey = new Map(required.map((entry) => [keyOf(entry), entry]));
  if (requiredByKey.size !== required.length) {
    throw new Error("required skill program keys must be unique");
  }
  const implementationKeys = implementations.map(keyOf);
  const duplicateImplementationKeys = [...new Set(
    implementationKeys.filter((key, index) => implementationKeys.indexOf(key) !== index),
  )].sort();
  const implementedKeySet = new Set(implementationKeys);
  const missing = required.filter((entry) => !implementedKeySet.has(keyOf(entry)));
  const unexpected = implementations.filter((entry) => !requiredByKey.has(keyOf(entry)));
  const complete = missing.length === 0 && unexpected.length === 0 && duplicateImplementationKeys.length === 0;
  return Object.freeze({
    complete,
    requiredCount: required.length,
    implementedCount: implementations.length,
    missing: Object.freeze(missing.map((entry) => Object.freeze({
      ...entry,
      referencedBy: Object.freeze(entry.referencedBy.map((reference) => Object.freeze({ ...reference }))),
    }))),
    unexpected: Object.freeze(unexpected.map((entry) => Object.freeze({ ...entry }))),
    duplicateImplementationKeys: Object.freeze(duplicateImplementationKeys),
  });
}

export function assertSkillProgramCoverage(
  required: readonly SkillProgramRequirement[],
  implementations: readonly SkillProgramImplementation[],
): void {
  const audit = auditSkillProgramCoverage(required, implementations);
  if (!audit.complete) throw new SkillProgramCoverageError(audit);
}
