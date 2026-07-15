import { CARD_DEFINITIONS } from "../cards.js";
import type {
  CardId,
  CardKind,
  CardUseIntent,
  CardUseMethod,
  GeneralSkillId,
  PlayerId,
} from "../types.js";
import { cloneJsonObject, type JsonObject } from "./resolution.js";

export type CardUseFrameStage =
  | "declared"
  | "target_confirming"
  | "targets_confirmed"
  | "committed"
  | "resolving_targets"
  | "finished";

export type TargetOccurrenceStatus =
  | "pending"
  | "confirming"
  | "confirmed"
  | "resolving"
  | "resolved"
  | "canceled";

export interface TargetResponsePolicy {
  requiredResponses: number;
  responseProhibited: boolean;
  /** Stable modifier provenance such as tieqi or liegong. */
  modifierIds: string[];
}

export interface CardTargetOccurrence {
  readonly occurrenceId: number;
  readonly originalTargetId: PlayerId;
  targetId: PlayerId;
  status: TargetOccurrenceStatus;
  responsePolicy: TargetResponsePolicy;
  metadata: JsonObject;
}

/** Serializable, per-target card-use domain frame. */
export interface CardUseFrame {
  readonly version: 1;
  readonly frameId: number;
  readonly useId: number;
  readonly sourceId: PlayerId;
  readonly method: CardUseMethod;
  readonly physicalCardIds: readonly CardId[];
  readonly effectiveKind: CardKind;
  readonly viewAsSkillId: GeneralSkillId | null;
  stage: CardUseFrameStage;
  /** Index into targetOccurrences; null when no target occurrence is active. */
  targetCursor: number | null;
  targetOccurrences: CardTargetOccurrence[];
}

export class CardUseFrameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CardUseFrameError";
  }
}

const STAGES = new Set<CardUseFrameStage>([
  "declared", "target_confirming", "targets_confirmed", "committed", "resolving_targets", "finished",
]);
const TARGET_STATUSES = new Set<TargetOccurrenceStatus>([
  "pending", "confirming", "confirmed", "resolving", "resolved", "canceled",
]);

function positive(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new CardUseFrameError(`${label} must be positive`);
}

function cloneOccurrence(occurrence: CardTargetOccurrence): CardTargetOccurrence {
  return {
    ...occurrence,
    responsePolicy: {
      ...occurrence.responsePolicy,
      modifierIds: [...occurrence.responsePolicy.modifierIds],
    },
    metadata: cloneJsonObject(occurrence.metadata),
  };
}

export function createCardUseFrame(input: {
  readonly frameId: number;
  readonly useId: number;
  readonly sourceId: PlayerId;
  readonly method: CardUseMethod;
  readonly physicalCardIds: readonly CardId[];
  readonly effectiveKind: CardKind;
  readonly targetIds: readonly PlayerId[];
  readonly viewAsSkillId?: GeneralSkillId | null;
}): CardUseFrame {
  positive(input.frameId, "card-use frameId");
  positive(input.useId, "card-use useId");
  if (!input.sourceId) throw new CardUseFrameError("card-use source is required");
  if (input.physicalCardIds.length === 0 || input.physicalCardIds.some((id) => !id) || new Set(input.physicalCardIds).size !== input.physicalCardIds.length) {
    throw new CardUseFrameError("physical card ids must be unique and nonempty");
  }
  if (input.targetIds.some((id) => !id) || new Set(input.targetIds).size !== input.targetIds.length) {
    throw new CardUseFrameError("target ids must be unique and nonempty");
  }
  if (!((input.effectiveKind as string) in CARD_DEFINITIONS)) throw new CardUseFrameError("effective card kind is unknown");
  const frame: CardUseFrame = {
    version: 1,
    frameId: input.frameId,
    useId: input.useId,
    sourceId: input.sourceId,
    method: input.method,
    physicalCardIds: Object.freeze([...input.physicalCardIds]),
    effectiveKind: input.effectiveKind,
    viewAsSkillId: input.viewAsSkillId ?? null,
    stage: "declared",
    targetCursor: null,
    targetOccurrences: input.targetIds.map((targetId, index) => ({
      occurrenceId: index + 1,
      originalTargetId: targetId,
      targetId,
      status: "pending",
      responsePolicy: { requiredResponses: 1, responseProhibited: false, modifierIds: [] },
      metadata: {},
    })),
  };
  assertCardUseFrame(frame);
  return frame;
}

/** Compatibility adapter for the current one-physical-card intent. */
export function createCardUseFrameFromIntent(frameId: number, intent: CardUseIntent): CardUseFrame {
  return createCardUseFrame({
    frameId,
    useId: intent.useId,
    sourceId: intent.sourceId,
    method: intent.method,
    physicalCardIds: [intent.physicalCardId],
    effectiveKind: intent.effectiveKind,
    targetIds: intent.targetIds,
    viewAsSkillId: intent.viaSkill,
  });
}

export function beginTargetConfirmation(frame: CardUseFrame): CardTargetOccurrence | null {
  if (frame.stage !== "declared") throw new CardUseFrameError("card use is not awaiting target confirmation");
  if (frame.targetOccurrences.length === 0) {
    frame.stage = "targets_confirmed";
    frame.targetCursor = null;
    return null;
  }
  frame.stage = "target_confirming";
  frame.targetCursor = 0;
  frame.targetOccurrences[0]!.status = "confirming";
  return cloneOccurrence(frame.targetOccurrences[0]!);
}

export function currentTargetOccurrence(frame: CardUseFrame): CardTargetOccurrence | null {
  if (frame.targetCursor === null) return null;
  const occurrence = frame.targetOccurrences[frame.targetCursor];
  if (!occurrence) throw new CardUseFrameError("target cursor is outside target occurrences");
  return occurrence;
}

function requireConfirmingTarget(frame: CardUseFrame): CardTargetOccurrence {
  if (frame.stage !== "target_confirming") throw new CardUseFrameError("card use is not confirming a target");
  const occurrence = currentTargetOccurrence(frame);
  if (!occurrence || occurrence.status !== "confirming") throw new CardUseFrameError("no target occurrence is being confirmed");
  return occurrence;
}

export function redirectCurrentTarget(frame: CardUseFrame, targetId: PlayerId, modifierId: string): void {
  const occurrence = requireConfirmingTarget(frame);
  if (!targetId || !modifierId) throw new CardUseFrameError("target redirect metadata is incomplete");
  if (targetId === occurrence.targetId) throw new CardUseFrameError("target redirect did not change the target");
  if (frame.targetOccurrences.some((candidate) => candidate !== occurrence && candidate.status !== "canceled" && candidate.targetId === targetId)) {
    throw new CardUseFrameError("target redirect would duplicate another target occurrence");
  }
  occurrence.targetId = targetId;
  occurrence.responsePolicy.modifierIds.push(modifierId);
}

export function setCurrentTargetResponsePolicy(
  frame: CardUseFrame,
  input: { readonly requiredResponses?: number; readonly responseProhibited?: boolean; readonly modifierId: string },
): void {
  const occurrence = requireConfirmingTarget(frame);
  if (!input.modifierId || occurrence.responsePolicy.modifierIds.includes(input.modifierId)) {
    throw new CardUseFrameError("target response modifier is missing or duplicated");
  }
  if (input.requiredResponses !== undefined) {
    positive(input.requiredResponses, "required response count");
    occurrence.responsePolicy.requiredResponses = input.requiredResponses;
  }
  if (input.responseProhibited !== undefined) occurrence.responsePolicy.responseProhibited = input.responseProhibited;
  occurrence.responsePolicy.modifierIds.push(input.modifierId);
}

export function cancelCurrentTarget(frame: CardUseFrame, modifierId: string): void {
  const occurrence = requireConfirmingTarget(frame);
  if (!modifierId) throw new CardUseFrameError("target cancellation requires provenance");
  occurrence.responsePolicy.modifierIds.push(modifierId);
  occurrence.status = "canceled";
  advanceConfirmationCursor(frame);
}

function advanceConfirmationCursor(frame: CardUseFrame): void {
  const current = frame.targetCursor ?? -1;
  const next = current + 1;
  if (next >= frame.targetOccurrences.length) {
    frame.targetCursor = null;
    frame.stage = "targets_confirmed";
    return;
  }
  frame.targetCursor = next;
  frame.targetOccurrences[next]!.status = "confirming";
}

export function confirmCurrentTarget(frame: CardUseFrame): void {
  const occurrence = requireConfirmingTarget(frame);
  occurrence.status = "confirmed";
  advanceConfirmationCursor(frame);
}

export function commitCardUseFrame(frame: CardUseFrame): void {
  if (frame.stage !== "targets_confirmed") throw new CardUseFrameError("targets are not fully confirmed");
  frame.stage = "committed";
}

export function beginTargetResolution(frame: CardUseFrame): CardTargetOccurrence | null {
  if (frame.stage !== "committed") throw new CardUseFrameError("card use has not been committed");
  const index = frame.targetOccurrences.findIndex((occurrence) => occurrence.status === "confirmed");
  if (index < 0) {
    frame.stage = "finished";
    frame.targetCursor = null;
    return null;
  }
  frame.stage = "resolving_targets";
  frame.targetCursor = index;
  frame.targetOccurrences[index]!.status = "resolving";
  return cloneOccurrence(frame.targetOccurrences[index]!);
}

export function resolveCurrentTarget(frame: CardUseFrame): CardTargetOccurrence | null {
  if (frame.stage !== "resolving_targets") throw new CardUseFrameError("card use is not resolving targets");
  const occurrence = currentTargetOccurrence(frame);
  if (!occurrence || occurrence.status !== "resolving") throw new CardUseFrameError("no target occurrence is resolving");
  occurrence.status = "resolved";
  const next = frame.targetOccurrences.findIndex((candidate, index) => index > (frame.targetCursor ?? -1) && candidate.status === "confirmed");
  if (next < 0) {
    frame.stage = "finished";
    frame.targetCursor = null;
    return null;
  }
  frame.targetCursor = next;
  frame.targetOccurrences[next]!.status = "resolving";
  return cloneOccurrence(frame.targetOccurrences[next]!);
}

export function cloneCardUseFrame(frame: CardUseFrame): CardUseFrame {
  return {
    ...frame,
    physicalCardIds: Object.freeze([...frame.physicalCardIds]),
    targetOccurrences: frame.targetOccurrences.map(cloneOccurrence),
  };
}

export function assertCardUseFrame(frame: CardUseFrame): void {
  if (!frame || frame.version !== 1) throw new CardUseFrameError("card-use frame version is invalid");
  positive(frame.frameId, "card-use frameId");
  positive(frame.useId, "card-use useId");
  if (!frame.sourceId || !STAGES.has(frame.stage)) throw new CardUseFrameError("card-use frame metadata is invalid");
  if (!Array.isArray(frame.physicalCardIds) || frame.physicalCardIds.length === 0 || frame.physicalCardIds.some((id) => !id) || new Set(frame.physicalCardIds).size !== frame.physicalCardIds.length) {
    throw new CardUseFrameError("card-use physical ids are invalid");
  }
  if (!((frame.effectiveKind as string) in CARD_DEFINITIONS)) throw new CardUseFrameError("card-use effective kind is invalid");
  const targetIds = frame.targetOccurrences.map((occurrence) => occurrence.targetId);
  if (targetIds.some((id) => !id) || new Set(targetIds.filter((_id, index) => frame.targetOccurrences[index]!.status !== "canceled")).size !== frame.targetOccurrences.filter((entry) => entry.status !== "canceled").length) {
    throw new CardUseFrameError("card-use active targets are duplicated or invalid");
  }
  for (const [index, occurrence] of frame.targetOccurrences.entries()) {
    if (occurrence.occurrenceId !== index + 1 || !occurrence.originalTargetId || !TARGET_STATUSES.has(occurrence.status)) {
      throw new CardUseFrameError("target occurrence metadata is invalid");
    }
    positive(occurrence.responsePolicy.requiredResponses, "target required response count");
    if (new Set(occurrence.responsePolicy.modifierIds).size !== occurrence.responsePolicy.modifierIds.length || occurrence.responsePolicy.modifierIds.some((id) => !id)) {
      throw new CardUseFrameError("target response modifiers are invalid");
    }
    cloneJsonObject(occurrence.metadata);
  }
  const activeIndexes = frame.targetOccurrences
    .map((occurrence, index) => occurrence.status === "confirming" || occurrence.status === "resolving" ? index : -1)
    .filter((index) => index >= 0);
  if (frame.targetCursor === null) {
    if (activeIndexes.length !== 0) throw new CardUseFrameError("card-use cursor is missing for an active target");
  } else if (!Number.isSafeInteger(frame.targetCursor) || frame.targetCursor < 0 || frame.targetCursor >= frame.targetOccurrences.length || activeIndexes.length !== 1 || activeIndexes[0] !== frame.targetCursor) {
    throw new CardUseFrameError("card-use target cursor is inconsistent");
  }
  if (frame.stage === "target_confirming" && activeIndexes.length !== 1) throw new CardUseFrameError("target-confirming stage lacks an active target");
  if (frame.stage === "resolving_targets" && activeIndexes.length !== 1) throw new CardUseFrameError("target-resolution stage lacks an active target");
  if (frame.stage !== "target_confirming" && frame.targetOccurrences.some((entry) => entry.status === "confirming")) throw new CardUseFrameError("confirming target is outside its stage");
  if (frame.stage !== "resolving_targets" && frame.targetOccurrences.some((entry) => entry.status === "resolving")) throw new CardUseFrameError("resolving target is outside its stage");
  if (frame.stage === "declared" && frame.targetOccurrences.some((entry) => entry.status !== "pending")) throw new CardUseFrameError("declared card use already mutated targets");
  if (frame.stage === "finished" && frame.targetOccurrences.some((entry) => entry.status !== "resolved" && entry.status !== "canceled")) throw new CardUseFrameError("finished card use has unresolved targets");
}
