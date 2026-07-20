import type {
  CardId,
  DyingResume,
  GeneralSkillId,
  GuhuoRespondablePending,
  PendingDeathResolution,
  PendingSlashResponse,
  PendingTrickEffect,
  PlayerId,
  ShenfenContinuation,
  StandardDamageAftermath,
  StandardImplementedSkillId,
  StandardJudgmentContext,
  WumouContinuation,
  YeyanContinuation,
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

function cloneTrickEffectForStandard(effect: PendingTrickEffect): PendingTrickEffect {
  if (effect.type === "mass_attack") {
    return {
      type: "mass_attack",
      pending: {
        ...effect.pending,
        damageCardIds: [...(effect.pending.damageCardIds ?? [effect.pending.cardId])],
        remainingTargetIds: [...effect.pending.remainingTargetIds],
        declinedLordSkillIds: [...(effect.pending.declinedLordSkillIds ?? [])],
      },
    };
  }
  if (effect.type === "peach_garden" || effect.type === "iron_chain") {
    return { ...effect, remainingTargetIds: [...effect.remainingTargetIds] };
  }
  if (effect.type === "amazing_grace") {
    return {
      ...effect,
      pool: effect.pool.map((card) => ({ ...card })),
      remainingTargetIds: [...effect.remainingTargetIds],
    };
  }
  return { ...effect };
}

function cloneWumouForStandard(continuation: WumouContinuation): WumouContinuation {
  if (continuation.type === "trick_effect") {
    return { ...continuation, effect: cloneTrickEffectForStandard(continuation.effect) as typeof continuation.effect };
  }
  if (continuation.type === "finish_mass_attack") {
    return { ...continuation, damageCardIds: [...continuation.damageCardIds] };
  }
  if (continuation.type === "nullification") {
    return {
      ...continuation,
      pending: {
        ...continuation.pending,
        remainingResponderIds: [...continuation.pending.remainingResponderIds],
        effect: cloneTrickEffectForStandard(continuation.pending.effect),
      },
    };
  }
  return { ...continuation };
}

function cloneShenfenForStandard(continuation: ShenfenContinuation): ShenfenContinuation {
  return { ...continuation, targetIds: [...continuation.targetIds] };
}

function cloneYeyanForStandard(continuation: YeyanContinuation): YeyanContinuation {
  return {
    ...continuation,
    costCardIds: [...continuation.costCardIds],
    allocations: continuation.allocations.map((allocation) => ({ ...allocation })),
  };
}

function cloneSlash(pending: PendingSlashResponse): PendingSlashResponse {
  return {
    ...pending,
    damageCardIds: [...(pending.damageCardIds ?? [pending.cardId])],
    declinedLordSkillIds: [...(pending.declinedLordSkillIds ?? [])],
    remainingTargetIds: [...pending.remainingTargetIds],
    liuliCheckedPlayerIds: [...(pending.liuliCheckedPlayerIds ?? [])],
    liegongChecked: pending.liegongChecked ?? false,
    ...(pending.useProvenance ? { useProvenance: { ...pending.useProvenance } } : {}),
    excludedRedirectTargetIds: [...(pending.excludedRedirectTargetIds ?? [])],
    completion: pending.completion?.type === "turn_flow" ? { ...pending.completion } : { type: "default" },
  };
}

function clonePendingDeathResolution(pending: PendingDeathResolution): PendingDeathResolution {
  return {
    ...pending,
    remainingOwnerIds: [...pending.remainingOwnerIds],
    completion: pending.completion.type === "dying"
      ? {
          type: "dying",
          frameId: pending.completion.frameId,
          resume: cloneDyingResumeForStandard(pending.completion.resume),
        }
      : pending.completion.type === "direct"
        ? { type: "direct", resume: cloneDyingResumeForStandard(pending.completion.resume) }
        : pending.completion.type === "wuhun"
          ? { type: "wuhun", parent: clonePendingDeathResolution(pending.completion.parent) }
          : { type: "none" },
  };
}

export function cloneStandardJudgmentContext(context: StandardJudgmentContext): StandardJudgmentContext {
  switch (context.type) {
    case "delayed_trick":
      return { ...context, delayedCard: { ...context.delayedCard } };
    case "luoshen":
      return { ...context };
    case "shuangxiong":
      return { ...context };
    case "tuntian":
      return { ...context };
    case "ganglie":
      return {
        type: "ganglie",
        ...(context.aftermath ? { aftermath: cloneStandardDamageAftermath(context.aftermath) } : {}),
        ...(context.damageOpportunity ? { damageOpportunity: { ...context.damageOpportunity } } : {}),
      };
    case "baonue":
      return { ...context, damageOpportunity: { ...context.damageOpportunity } };
    case "beige":
      return { ...context, costCard: { ...context.costCard }, damageOpportunity: { ...context.damageOpportunity } };
    case "wuhun":
      return { ...context, deathResolution: clonePendingDeathResolution(context.deathResolution) };
    case "tieqi":
      return { type: "tieqi", slash: cloneSlash(context.slash) };
    case "armor":
      return context.pending.type === "slash"
        ? { type: "armor", pending: cloneSlash(context.pending), sourceSkillId: context.sourceSkillId ?? "ba_gua_zhen" }
        : {
            type: "armor",
            sourceSkillId: context.sourceSkillId ?? "ba_gua_zhen",
            pending: {
              ...context.pending,
              damageCardIds: [...(context.pending.damageCardIds ?? [context.pending.cardId])],
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
          damageCardIds: [...(resume.pending.damageCardIds ?? [resume.pending.cardId])],
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
    case "leiji":
      return {
        type: "leiji",
        resume: resume.resume.type === "slash"
          ? { type: "slash", pending: cloneSlash(resume.resume.pending) }
          : {
              type: "mass_attack",
              pending: {
                ...resume.resume.pending,
                damageCardIds: [...(resume.resume.pending.damageCardIds ?? [resume.resume.pending.cardId])],
                declinedLordSkillIds: [...(resume.resume.pending.declinedLordSkillIds ?? [])],
                remainingTargetIds: [...resume.resume.pending.remainingTargetIds],
              },
            },
      };
    case "standard_damage":
      return { type: "standard_damage", aftermath: cloneStandardDamageAftermath(resume.aftermath) };
    case "luanwu":
      return {
        ...resume,
        processedActorIds: [...resume.processedActorIds],
        remainingActorIds: [...resume.remainingActorIds],
      };
    case "damage_flow":
      return { ...resume };
    case "skill":
      return { ...resume };
    case "forest_end":
      return { ...resume };
    case "qinyin":
      return { ...resume, targetIds: [...resume.targetIds] };
    case "wumou":
      return { ...resume, continuation: cloneWumouForStandard(resume.continuation) };
    case "shenfen":
      return { type: "shenfen", continuation: cloneShenfenForStandard(resume.continuation) };
    case "yeyan":
      return { type: "yeyan", continuation: cloneYeyanForStandard(resume.continuation) };
    case "qiangxi":
      return { ...resume };
    case "guhuo": {
      const pending = resume.pending;
      const continuation = pending.continuation.type === "use"
        ? {
            type: "use" as const,
            intent: {
              ...pending.continuation.intent,
              targetIds: [...pending.continuation.intent.targetIds],
              ...(pending.continuation.intent.additionalPhysicalCards
                ? {
                    additionalPhysicalCards: pending.continuation.intent.additionalPhysicalCards
                      .map((card) => ({ ...card })),
                  }
                : {}),
            },
          }
        : {
            type: "respond" as const,
            pending: cloneGuhuoRespondable(pending.continuation.pending),
          };
      return {
        type: "guhuo",
        pending: {
          ...pending,
          challengerIds: [...pending.challengerIds],
          remainingConsequenceIds: [...pending.remainingConsequenceIds],
          continuation,
        },
      };
    }
    default:
      return { type: resume.type };
  }
}

function cloneGuhuoRespondable(pending: GuhuoRespondablePending): GuhuoRespondablePending {
  if (pending.type === "slash") return cloneSlash(pending);
  if (pending.type === "duel") {
    return {
      ...pending,
      declinedLordSkillIds: [...(pending.declinedLordSkillIds ?? [])],
    };
  }
  if (pending.type === "mass_attack") {
    return {
      ...pending,
      damageCardIds: [...(pending.damageCardIds ?? [pending.cardId])],
      declinedLordSkillIds: [...(pending.declinedLordSkillIds ?? [])],
      remainingTargetIds: [...pending.remainingTargetIds],
    };
  }
  if (pending.type === "nullification") {
    return { ...pending, remainingResponderIds: [...pending.remainingResponderIds] };
  }
  if (pending.type === "dying") {
    return {
      ...pending,
      remainingResponderIds: [...pending.remainingResponderIds],
      resume: cloneDyingResumeForStandard(pending.resume),
    };
  }
  return { ...pending, declinedLordSkillIds: [...(pending.declinedLordSkillIds ?? [])] };
}
