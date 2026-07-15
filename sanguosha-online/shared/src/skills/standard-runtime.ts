import type {
  CardId,
  DyingResume,
  GeneralSkillId,
  PendingSlashResponse,
  PlayerId,
  StandardDamageAftermath,
  StandardImplementedSkillId,
  StandardJudgmentContext,
} from "../types.js";

const DAMAGE_SKILLS = new Set<StandardImplementedSkillId>([
  "jianxiong", "yiji", "fankui", "ganglie",
]);

export class StandardSkillRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StandardSkillRuntimeError";
  }
}

/** Catalog order is already the owner's legal same-timing order for the default roster. */
export function standardDamageSkillQueue(
  effectiveSkillIds: readonly GeneralSkillId[],
  damageAmount: number,
): StandardImplementedSkillId[] {
  if (!Number.isSafeInteger(damageAmount) || damageAmount <= 0) {
    throw new StandardSkillRuntimeError("damage amount must be positive");
  }
  const result: StandardImplementedSkillId[] = [];
  for (const skillId of effectiveSkillIds) {
    if (!DAMAGE_SKILLS.has(skillId as StandardImplementedSkillId)) continue;
    if (skillId === "yiji") {
      for (let point = 0; point < damageAmount; point += 1) result.push("yiji");
    } else {
      result.push(skillId as StandardImplementedSkillId);
    }
  }
  return result;
}

export function standardPromptId(
  eventId: number,
  skillId: StandardImplementedSkillId,
  ownerId: PlayerId,
  stage: string,
): string {
  if (!Number.isSafeInteger(eventId) || eventId <= 0 || !ownerId || !stage) {
    throw new StandardSkillRuntimeError("standard prompt metadata is invalid");
  }
  return `standard:${eventId}:${skillId}:${ownerId}:${stage}`;
}

export function assertExactPartition(
  selectedCardIds: readonly CardId[],
  topCardIds: readonly CardId[],
  bottomCardIds: readonly CardId[],
): void {
  const all = [...topCardIds, ...bottomCardIds];
  const sorted = (ids: readonly CardId[]): CardId[] => [...ids].sort();
  if (
    new Set(selectedCardIds).size !== selectedCardIds.length ||
    new Set(all).size !== all.length ||
    selectedCardIds.length !== all.length ||
    sorted(selectedCardIds).some((id, index) => id !== sorted(all)[index])
  ) {
    throw new StandardSkillRuntimeError("top and bottom cards must exactly partition the viewed cards");
  }
}

export function cloneStandardDamageAftermath(frame: StandardDamageAftermath): StandardDamageAftermath {
  return {
    ...frame,
    damageCardIds: [...frame.damageCardIds],
    remainingSkillIds: [...frame.remainingSkillIds],
    resume: cloneDyingResumeForStandard(frame.resume),
  };
}

function cloneSlash(pending: PendingSlashResponse): PendingSlashResponse {
  return {
    ...pending,
    declinedLordSkillIds: [...(pending.declinedLordSkillIds ?? [])],
    remainingTargetIds: [...pending.remainingTargetIds],
    liuliCheckedPlayerIds: [...(pending.liuliCheckedPlayerIds ?? [])],
    excludedRedirectTargetIds: [...(pending.excludedRedirectTargetIds ?? [])],
    completion: pending.completion?.type === "turn_flow" ? { ...pending.completion } : { type: "default" },
  };
}

export function cloneStandardJudgmentContext(context: StandardJudgmentContext): StandardJudgmentContext {
  switch (context.type) {
    case "delayed_trick":
      return { ...context, delayedCard: { ...context.delayedCard } };
    case "luoshen":
      return { ...context };
    case "ganglie":
      return { type: "ganglie", aftermath: cloneStandardDamageAftermath(context.aftermath) };
    case "tieqi":
      return { type: "tieqi", slash: cloneSlash(context.slash) };
    case "armor":
      return context.pending.type === "slash"
        ? { type: "armor", pending: cloneSlash(context.pending) }
        : {
            type: "armor",
            pending: {
              ...context.pending,
              remainingTargetIds: [...context.pending.remainingTargetIds],
              declinedLordSkillIds: [...(context.pending.declinedLordSkillIds ?? [])],
            },
          };
  }
}

export function cloneDyingResumeForStandard(resume: DyingResume): DyingResume {
  switch (resume.type) {
    case "mass_attack":
      return {
        type: "mass_attack",
        pending: {
          ...resume.pending,
          declinedLordSkillIds: [...(resume.pending.declinedLordSkillIds ?? [])],
          remainingTargetIds: [...resume.pending.remainingTargetIds],
        },
      };
    case "chain_damage":
      return {
        ...resume,
        damageCardIds: [...(resume.damageCardIds ?? [])],
        remainingTargetIds: [...resume.remainingTargetIds],
        finalResume: cloneDyingResumeForStandard(resume.finalResume) as Exclude<DyingResume, { type: "chain_damage" | "damage_flow" }>,
      };
    case "slash_sequence":
      return { type: "slash_sequence", pending: cloneSlash(resume.pending) };
    case "standard_damage":
      return { type: "standard_damage", aftermath: cloneStandardDamageAftermath(resume.aftermath) };
    case "damage_flow":
      return { ...resume };
    case "skill":
      return { ...resume };
    default:
      return { type: resume.type };
  }
}
