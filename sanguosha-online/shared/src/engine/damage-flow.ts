import type { PlayerId } from "../types.js";
import {
  DamageError,
  applyDamageToLife,
  assertDamageInstance,
  beginDamageCausing,
  beginDamageReceiving,
  cloneDamageInstance,
  completeDamageTriggerWindow,
  currentDamageTriggerWindow,
  lockDamageAmount,
  modifyDamage,
  preventDamage,
  redirectDamage,
  resumeDamageAfterDying,
  resumeDamageAfterProtectedDying,
  type DamageApplicationResult,
  type DamageInstance,
  type DamageTriggerWindowKind,
  type LifePlayerState,
} from "./damage.js";
import { assertDyingFrame, type DyingFrame } from "./dying.js";

/**
 * Serializable orchestration around DamageInstance v2.
 *
 * This module owns no damage arithmetic. Every amount, redirect, prevention,
 * life deduction, and post-damage cursor transition delegates to damage.ts.
 */
export const DAMAGE_FLOW_VERSION = 1 as const;

export const DAMAGE_FLOW_WINDOW_KINDS = [
  "causing_modifier",
  "redirect",
  "receiving_modifier",
  "source_after_once",
  "source_after_per_point",
  "target_after_once",
  "target_after_per_point",
  "settlement_end",
] as const;

export type DamageFlowWindowKind = (typeof DAMAGE_FLOW_WINDOW_KINDS)[number];
export type DamageFlowStep =
  | "causing"
  | "redirect"
  | "receiving"
  | "life_deduction"
  | "dying"
  | "post_damage"
  | "complete";

export type DamageOpportunityCadence = "once" | "per_point" | "settlement";
export type DamageOpportunityRelation = "source" | "target" | "global";
export type DamageOpportunityStatus =
  | "pending"
  | "passed"
  | "resolved"
  | "skipped_dead"
  | "skipped_redirected"
  | "skipped_prevented";

export type DamageFlowJsonPrimitive = string | number | boolean | null;
export type DamageFlowJsonValue =
  | DamageFlowJsonPrimitive
  | DamageFlowJsonObject
  | readonly DamageFlowJsonValue[];
export interface DamageFlowJsonObject {
  readonly [key: string]: DamageFlowJsonValue;
}

/** The only game-level continuation retained by a root damage frame. */
export interface DamageFlowCallerContinuation {
  readonly type: string;
  readonly data: DamageFlowJsonObject;
}

export interface DamageOpportunityRef {
  readonly opportunityId: string;
  readonly ownerId: PlayerId;
  readonly skillId: string;
  readonly relation: DamageOpportunityRelation;
  readonly cadence: DamageOpportunityCadence;
  readonly pointIndex: number | null;
}

export interface DamageOpportunityState {
  readonly ref: DamageOpportunityRef;
  status: DamageOpportunityStatus;
  resolutionRef: string | null;
}

export interface DamageOpportunityPrompt {
  readonly promptId: number;
  readonly frameId: number;
  readonly damageId: number;
  readonly windowId: number;
  readonly opportunityId: string;
  readonly ownerId: PlayerId;
  readonly issuedAtRevision: number;
}

export interface DamageFlowWindow {
  readonly windowId: number;
  readonly kind: DamageFlowWindowKind;
  readonly cadence: DamageOpportunityCadence;
  readonly pointIndex: number | null;
  readonly subjectId: PlayerId | null;
  readonly targetIdAtOpen: PlayerId;
  readonly opportunities: DamageOpportunityState[];
  cursor: number;
  prompt: DamageOpportunityPrompt | null;
  redirectOccurred: boolean;
  preventionOccurred: boolean;
}

export interface DamageDyingBarrier {
  readonly dyingId: number;
  readonly frameId: number;
  readonly damageId: number;
  readonly targetId: PlayerId;
  readonly hpAfterDamage: number;
}

export interface DamageFlowFrame {
  readonly frameId: number;
  readonly damageId: number;
  status: "active" | "suspended";
  step: DamageFlowStep;
  damage: DamageInstance;
  window: DamageFlowWindow | null;
  dying: DamageDyingBarrier | null;
  /** Root-only; nested damage returns exclusively through parentResumeToken. */
  readonly callerContinuation: DamageFlowCallerContinuation | null;
  readonly parentResumeToken: string | null;
  awaitingChildToken: string | null;
}

export interface ConsumedDamageOpportunityAction {
  readonly actionId: number;
  readonly promptId: number;
  readonly frameId: number;
  readonly damageId: number;
  readonly windowId: number;
  readonly opportunityId: string;
  readonly ownerId: PlayerId;
  readonly outcome: "pass" | "resolve";
  readonly resolutionRef: string | null;
  readonly acceptedAtRevision: number;
}

export interface DamageFlowState {
  readonly version: 1;
  readonly type: "damage_flow";
  revision: number;
  nextWindowId: number;
  nextPromptId: number;
  nextActionId: number;
  nextDyingId: number;
  nextResumeTokenId: number;
  frames: DamageFlowFrame[];
  completedDamageIds: number[];
  completedFrameIds: number[];
  retiredPromptIds: number[];
  retiredResumeTokens: string[];
  consumedActions: ConsumedDamageOpportunityAction[];
}

/** v0 is migratable only at an empty, fully completed boundary. */
export interface LegacyDamageFlowStateV0 {
  readonly version: 0;
  readonly type: "damage_flow";
  readonly revision: number;
  readonly activeDamage: null;
  readonly completedDamageIds: readonly number[];
  readonly completedFrameIds: readonly number[];
}

export type DamageFlowErrorCode =
  | "INVALID_STATE"
  | "INVALID_ARGUMENT"
  | "UNSUPPORTED_VERSION"
  | "AMBIGUOUS_MIGRATION"
  | "EMPTY_STACK"
  | "FRAME_NOT_TOP"
  | "FRAME_NOT_ACTIVE"
  | "DUPLICATE_DAMAGE_ID"
  | "DUPLICATE_FRAME_ID"
  | "WINDOW_ALREADY_OPEN"
  | "WINDOW_NOT_OPEN"
  | "WRONG_WINDOW"
  | "WINDOW_NOT_COMPLETE"
  | "NO_PENDING_PROMPT"
  | "STALE_REVISION"
  | "STALE_PROMPT"
  | "WRONG_OWNER"
  | "PROMPT_REPLAY"
  | "ACTION_OUT_OF_SEQUENCE"
  | "ACTION_REPLAY"
  | "OWNER_DEAD"
  | "INVALID_EFFECT"
  | "REDIRECT_CYCLE"
  | "DAMAGE_NOT_READY"
  | "DYING_NOT_PENDING"
  | "INVALID_DYING_RESULT"
  | "INVALID_RESUME_TOKEN"
  | "RESUME_REPLAY"
  | "FRAME_NOT_COMPLETE";

export class DamageFlowError extends Error {
  readonly code: DamageFlowErrorCode;

  constructor(code: DamageFlowErrorCode, message: string) {
    super(message);
    this.name = "DamageFlowError";
    this.code = code;
  }
}

export type DamageOpportunityEffect =
  | { readonly type: "none" }
  | { readonly type: "modifier"; readonly operation: "add" | "set" | "cap"; readonly value: number }
  | { readonly type: "redirect"; readonly toTargetId: PlayerId }
  | { readonly type: "prevention"; readonly reason: string };

export interface DamageOpportunityAction {
  readonly actionId: number;
  readonly promptId: number;
  readonly frameId: number;
  readonly damageId: number;
  readonly windowId: number;
  readonly opportunityId: string;
  readonly ownerId: PlayerId;
  readonly expectedRevision: number;
  readonly outcome: "pass" | "resolve";
  readonly resolutionRef: string | null;
  readonly effect: DamageOpportunityEffect;
}

export interface PushDamageFlowResult {
  readonly state: DamageFlowState;
  readonly frame: DamageFlowFrame;
  /** Null for a root frame; opaque and required to return from a child. */
  readonly resumeToken: string | null;
}

export interface PushDamageFlowInput {
  readonly expectedParentFrameId: number | null;
  readonly expectedRevision: number;
  readonly damage: DamageInstance;
  /** Omitted legacy calls are normalized to null. Nested frames must use null. */
  readonly callerContinuation?: DamageFlowCallerContinuation | null;
}

export interface OpenDamageFlowWindowInput {
  readonly frameId: number;
  readonly expectedRevision: number;
  readonly kind: DamageFlowWindowKind;
  readonly opportunities: readonly DamageOpportunityRef[];
  readonly players: readonly LifePlayerState[];
}

export interface CloseDamageFlowWindowInput {
  readonly frameId: number;
  readonly windowId: number;
  readonly expectedRevision: number;
}

export interface DamageLifeInput {
  readonly frameId: number;
  readonly expectedRevision: number;
}

interface ResumeDamageDyingInputBase {
  readonly frameId: number;
  readonly dyingId: number;
  readonly expectedRevision: number;
}

export type ResumeDamageDyingInput =
  | (ResumeDamageDyingInputBase & {
    readonly outcome: "rescued" | "dead";
    readonly proof?: never;
  })
  | (ResumeDamageDyingInputBase & {
    readonly outcome: "protected_by_buqu";
    readonly proof: DyingFrame;
  });

export interface FinishDamageFlowInput {
  readonly frameId: number;
  readonly resumeToken: string | null;
  readonly expectedRevision: number;
  /** Required for a nested return so newly dead opportunity owners are filtered. */
  readonly players: readonly LifePlayerState[] | null;
}

export interface RefreshDamageOpportunityOwnersInput {
  readonly frameId: number;
  readonly expectedRevision: number;
  readonly players: readonly LifePlayerState[];
}

export interface DamageLifeTransaction {
  readonly state: DamageFlowState;
  readonly players: LifePlayerState[];
  readonly application: DamageApplicationResult;
  readonly dying: DamageDyingBarrier | null;
}

export interface FinishDamageFlowResult {
  readonly state: DamageFlowState;
  readonly completedDamageId: number;
  readonly completedFrameId: number;
  readonly resumedParentFrameId: number | null;
  /** Returned exactly once when a root frame completes; always null for a child. */
  readonly callerContinuation: DamageFlowCallerContinuation | null;
}

const WINDOW_KIND_SET = new Set<string>(DAMAGE_FLOW_WINDOW_KINDS);
const FLOW_STEP_SET = new Set<string>([
  "causing", "redirect", "receiving", "life_deduction", "dying", "post_damage", "complete",
]);
const OPPORTUNITY_STATUS_SET = new Set<string>([
  "pending", "passed", "resolved", "skipped_dead", "skipped_redirected", "skipped_prevented",
]);
const CADENCE_SET = new Set<string>(["once", "per_point", "settlement"]);
const RELATION_SET = new Set<string>(["source", "target", "global"]);

function flowError(code: DamageFlowErrorCode, message: string): never {
  throw new DamageFlowError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function assertResumeDamageDyingInput(value: unknown): asserts value is ResumeDamageDyingInput {
  if (!isRecord(value)
    || !isPositiveInteger(value.frameId)
    || !isPositiveInteger(value.dyingId)
    || !isNonnegativeInteger(value.expectedRevision)
  ) flowError("INVALID_ARGUMENT", "dying resume input is malformed");
  const baseKeys = ["frameId", "dyingId", "expectedRevision", "outcome"] as const;
  if (value.outcome === "rescued" || value.outcome === "dead") {
    if (!hasExactKeys(value, baseKeys)) {
      flowError("INVALID_ARGUMENT", "ordinary dying outcomes must not include proof");
    }
    return;
  }
  if (value.outcome !== "protected_by_buqu"
    || !hasExactKeys(value, [...baseKeys, "proof"])
    || !isRecord(value.proof)
  ) flowError("INVALID_ARGUMENT", "Buqu-protected dying outcome requires a proof frame");
}

function increment(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value >= Number.MAX_SAFE_INTEGER) {
    flowError("INVALID_STATE", `${label} cannot be incremented safely`);
  }
  return value + 1;
}

function assertUniquePositive(values: readonly number[], label: string): void {
  if (!Array.isArray(values) || values.some((value) => !isPositiveInteger(value)) || new Set(values).size !== values.length) {
    flowError("INVALID_STATE", `${label} must contain unique positive integers`);
  }
}

function assertUniqueStrings(values: readonly string[], label: string): void {
  if (!Array.isArray(values) || values.some((value) => !isNonemptyString(value)) || new Set(values).size !== values.length) {
    flowError("INVALID_STATE", `${label} must contain unique nonempty strings`);
  }
}

function assertJsonSafe(value: unknown): void {
  const ancestors: object[] = [];
  const visit = (candidate: unknown, path: string): void => {
    if (candidate === null || typeof candidate === "string" || typeof candidate === "boolean") return;
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) flowError("INVALID_STATE", `${path} contains a non-finite number`);
      return;
    }
    if (typeof candidate !== "object") flowError("INVALID_STATE", `${path} is not JSON-safe`);
    if (ancestors.includes(candidate)) flowError("INVALID_STATE", `${path} contains a cycle`);
    ancestors.push(candidate);
    if (Array.isArray(candidate)) {
      for (let index = 0; index < candidate.length; index += 1) {
        if (!(index in candidate)) flowError("INVALID_STATE", `${path} contains a sparse array`);
        visit(candidate[index], `${path}[${index}]`);
      }
    } else {
      if (!isRecord(candidate)) flowError("INVALID_STATE", `${path} contains a non-plain object`);
      for (const [key, child] of Object.entries(candidate)) visit(child, `${path}.${key}`);
    }
    ancestors.pop();
  };
  visit(value, "$damageFlow");
}

function assertCallerContinuation(
  value: unknown,
  code: Extract<DamageFlowErrorCode, "INVALID_ARGUMENT" | "INVALID_STATE">,
): asserts value is DamageFlowCallerContinuation {
  if (!isRecord(value)
    || !isNonemptyString(value.type)
    || !isRecord(value.data)
    || Object.keys(value).length !== 2
    || !Object.prototype.hasOwnProperty.call(value, "type")
    || !Object.prototype.hasOwnProperty.call(value, "data")
  ) flowError(code, "damage caller continuation must contain only a nonempty type and plain JSON data object");
}

function cloneJsonValue(value: DamageFlowJsonValue): DamageFlowJsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return (value as readonly DamageFlowJsonValue[]).map((entry) => cloneJsonValue(entry));
  }
  return Object.fromEntries(
    Object.entries(value as DamageFlowJsonObject).map(([key, entry]) => [key, cloneJsonValue(entry)]),
  ) as DamageFlowJsonObject;
}

function cloneCallerContinuation(
  continuation: DamageFlowCallerContinuation | null,
): DamageFlowCallerContinuation | null {
  if (continuation === null) return null;
  return {
    type: continuation.type,
    data: cloneJsonValue(continuation.data) as DamageFlowJsonObject,
  };
}

function assertPlayerSnapshot(players: readonly LifePlayerState[]): void {
  if (!Array.isArray(players)) flowError("INVALID_ARGUMENT", "player snapshot must be an array");
  const ids = new Set<string>();
  for (const candidate of players as readonly unknown[]) {
    if (!isRecord(candidate)
      || !isNonemptyString(candidate.id)
      || ids.has(candidate.id)
      || !Number.isSafeInteger(candidate.hp)
      || !isPositiveInteger(candidate.maxHp)
      || (candidate.hp as number) > candidate.maxHp
      || typeof candidate.alive !== "boolean"
    ) flowError("INVALID_ARGUMENT", "player snapshot is malformed or duplicated");
    const player = candidate as unknown as LifePlayerState;
    ids.add(player.id);
  }
}

function clonePlayers(players: readonly LifePlayerState[]): LifePlayerState[] {
  assertPlayerSnapshot(players);
  return players.map((player) => ({ ...player }));
}

const DYING_FRAME_KEYS = [
  "version", "type", "frameId", "victimId", "reason", "responderOrder", "responderIndex", "stage", "rescues",
  "entrySaveSkillIds", "ownerResponseSaveSkillIds", "legacyAlternateSaveSkillIds", "skillResolutions",
  "survivalSkillId", "parentFrameId", "suspendedByFrameId", "migratedFromVersion",
] as const;

function assertBuquProtectedResumeProof(
  players: readonly LifePlayerState[],
  frame: DamageFlowFrame,
  barrier: DamageDyingBarrier,
  proof: DyingFrame,
): void {
  const target = players.find((player) => player.id === barrier.targetId);
  if (!target) flowError("INVALID_DYING_RESULT", "dying target is missing from the player snapshot");
  if (!target.alive || target.hp > 0) {
    flowError("INVALID_DYING_RESULT", "Buqu-protected target must be alive with nonpositive HP");
  }

  try {
    assertDyingFrame(players, proof);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown dying proof error";
    flowError("INVALID_DYING_RESULT", `Buqu dying proof is invalid: ${message}`);
  }
  if (!hasExactKeys(proof as unknown as Record<string, unknown>, DYING_FRAME_KEYS)
    || proof.type !== "dying"
    || !isRecord(proof.reason)
    || !hasExactKeys(proof.reason as unknown as Record<string, unknown>, ["type", "eventId", "sourceId"])
    || proof.frameId !== barrier.dyingId
    || proof.victimId !== barrier.targetId
    || proof.victimId !== frame.damage.targetId
    || proof.reason.type !== "damage"
    || proof.reason.sourceId !== frame.damage.sourceId
    || proof.stage !== "rescued"
    || proof.survivalSkillId !== "buqu"
    || !Array.isArray(proof.skillResolutions)
  ) flowError("INVALID_DYING_RESULT", "Buqu dying proof does not match the pending damage frame");

  const resolutions = (proof.skillResolutions as readonly unknown[])
    .filter((resolution): resolution is Record<string, unknown> =>
      isRecord(resolution) && resolution.skillId === "buqu" && resolution.succeeded === true);
  if (resolutions.length !== 1) {
    flowError("INVALID_DYING_RESULT", "Buqu dying proof must contain exactly one successful Buqu resolution");
  }
  const resolution = resolutions[0]!;
  if (!hasExactKeys(resolution, ["skillId", "timing", "succeeded", "hpAfter"])
    || (resolution.timing !== "life_deduction" && resolution.timing !== "recovery")
    || resolution.succeeded !== true
    || !Number.isSafeInteger(resolution.hpAfter)
    || resolution.hpAfter !== target.hp
  ) flowError("INVALID_DYING_RESULT", "Buqu resolution does not prove the target's current HP");
}

function cloneOpportunityRef(ref: DamageOpportunityRef): DamageOpportunityRef {
  return { ...ref };
}

function cloneWindow(window: DamageFlowWindow | null): DamageFlowWindow | null {
  if (window === null) return null;
  return {
    ...window,
    opportunities: window.opportunities.map((opportunity) => ({
      ref: cloneOpportunityRef(opportunity.ref),
      status: opportunity.status,
      resolutionRef: opportunity.resolutionRef,
    })),
    prompt: window.prompt ? { ...window.prompt } : null,
  };
}

function cloneFrame(frame: DamageFlowFrame): DamageFlowFrame {
  return {
    ...frame,
    damage: cloneDamageInstance(frame.damage),
    window: cloneWindow(frame.window),
    dying: frame.dying ? { ...frame.dying } : null,
    callerContinuation: cloneCallerContinuation(frame.callerContinuation),
  };
}

function cloneStateUnchecked(state: DamageFlowState): DamageFlowState {
  return {
    ...state,
    frames: state.frames.map(cloneFrame),
    completedDamageIds: [...state.completedDamageIds],
    completedFrameIds: [...state.completedFrameIds],
    retiredPromptIds: [...state.retiredPromptIds],
    retiredResumeTokens: [...state.retiredResumeTokens],
    consumedActions: state.consumedActions.map((action) => ({ ...action })),
  };
}

function expectedWindowDescriptor(frame: DamageFlowFrame): {
  readonly kind: DamageFlowWindowKind;
  readonly cadence: DamageOpportunityCadence;
  readonly pointIndex: number | null;
  readonly subjectId: PlayerId | null;
} {
  if (frame.step === "causing") return { kind: "causing_modifier", cadence: "once", pointIndex: null, subjectId: frame.damage.sourceId };
  if (frame.step === "redirect") return { kind: "redirect", cadence: "once", pointIndex: null, subjectId: frame.damage.targetId };
  if (frame.step === "receiving") return { kind: "receiving_modifier", cadence: "once", pointIndex: null, subjectId: frame.damage.targetId };
  if (frame.step !== "post_damage") flowError("WRONG_WINDOW", `flow step ${frame.step} has no opportunity window`);
  const window = currentDamageTriggerWindow([], frame.damage);
  if (window === null) flowError("INVALID_STATE", "post-damage step has no DamageInstance trigger window");
  return { kind: window.kind, cadence: window.cadence, pointIndex: window.pointIndex, subjectId: window.subjectId };
}

function assertOpportunityRef(
  ref: unknown,
  frame: DamageFlowFrame,
  descriptor: ReturnType<typeof expectedWindowDescriptor>,
  knownPlayerIds: ReadonlySet<string>,
): asserts ref is DamageOpportunityRef {
  if (!isRecord(ref)
    || !isNonemptyString(ref.opportunityId)
    || !isNonemptyString(ref.ownerId)
    || !knownPlayerIds.has(ref.ownerId)
    || !isNonemptyString(ref.skillId)
    || typeof ref.relation !== "string"
    || !RELATION_SET.has(ref.relation)
    || ref.cadence !== descriptor.cadence
    || ref.pointIndex !== descriptor.pointIndex
  ) flowError("INVALID_ARGUMENT", "damage opportunity ref is malformed or belongs to another window");
  if (ref.relation === "source") {
    if (frame.damage.sourceId === null || ref.ownerId !== frame.damage.sourceId) {
      flowError("INVALID_ARGUMENT", "source opportunity owner does not match the damage source");
    }
    if (!(descriptor.kind === "causing_modifier" || descriptor.kind.startsWith("source_after_"))) {
      flowError("INVALID_ARGUMENT", "source opportunity was supplied to a non-source window");
    }
  } else if (ref.relation === "target") {
    if (ref.ownerId !== frame.damage.targetId) flowError("INVALID_ARGUMENT", "target opportunity owner does not match the current damage target");
    if (descriptor.kind === "causing_modifier" || descriptor.kind.startsWith("source_after_")) {
      flowError("INVALID_ARGUMENT", "target opportunity was supplied to a source window");
    }
  }
}

function promptFor(
  state: DamageFlowState,
  frame: DamageFlowFrame,
  window: DamageFlowWindow,
  issuedAtRevision: number,
): DamageOpportunityPrompt | null {
  const opportunity = window.opportunities[window.cursor];
  if (!opportunity || opportunity.status !== "pending") return null;
  const prompt: DamageOpportunityPrompt = {
    promptId: state.nextPromptId,
    frameId: frame.frameId,
    damageId: frame.damageId,
    windowId: window.windowId,
    opportunityId: opportunity.ref.opportunityId,
    ownerId: opportunity.ref.ownerId,
    issuedAtRevision,
  };
  state.nextPromptId = increment(state.nextPromptId, "next prompt ID");
  return prompt;
}

function advanceWindowCursor(window: DamageFlowWindow): void {
  while (window.cursor < window.opportunities.length && window.opportunities[window.cursor]!.status !== "pending") {
    window.cursor += 1;
  }
}

function retirePrompt(state: DamageFlowState, window: DamageFlowWindow): void {
  if (window.prompt !== null) {
    if (!state.retiredPromptIds.includes(window.prompt.promptId)) state.retiredPromptIds.push(window.prompt.promptId);
    window.prompt = null;
  }
}

function assertStepMatchesDamage(frame: DamageFlowFrame): void {
  const stage = frame.damage.stage;
  const preventedWindowStillOpen = frame.window?.preventionOccurred === true
    && frame.damage.prevention !== null
    && stage === "settlement_end"
    && (frame.step === "causing" || frame.step === "redirect" || frame.step === "receiving");
  const matches =
    (frame.step === "causing" && stage === "causing")
    || ((frame.step === "redirect" || frame.step === "receiving") && stage === "receiving")
    || (frame.step === "life_deduction" && stage === "ready_for_life_deduction")
    || (frame.step === "dying" && stage === "life_deducted")
    || (frame.step === "post_damage" && [
      "source_after_once", "source_after_per_point", "target_after_once", "target_after_per_point", "settlement_end",
    ].includes(stage))
    || (frame.step === "complete" && stage === "complete")
    || preventedWindowStillOpen;
  if (!matches) flowError("INVALID_STATE", `flow step ${frame.step} disagrees with DamageInstance stage ${stage}`);
}

function assertPersistedOpportunityRef(
  value: unknown,
  frame: DamageFlowFrame,
  window: DamageFlowWindow,
): asserts value is DamageOpportunityRef {
  if (!isRecord(value)
    || !isNonemptyString(value.opportunityId)
    || !isNonemptyString(value.ownerId)
    || !isNonemptyString(value.skillId)
    || typeof value.relation !== "string"
    || !RELATION_SET.has(value.relation)
    || value.cadence !== window.cadence
    || value.pointIndex !== window.pointIndex
  ) flowError("INVALID_STATE", "persisted damage opportunity ref is malformed");

  if (value.relation === "source") {
    if (frame.damage.sourceId === null || value.ownerId !== frame.damage.sourceId) {
      flowError("INVALID_STATE", "persisted source opportunity has the wrong owner");
    }
    if (!(window.kind === "causing_modifier" || window.kind.startsWith("source_after_"))) {
      flowError("INVALID_STATE", "persisted source opportunity is in the wrong timing");
    }
  } else if (value.relation === "target") {
    if (value.ownerId !== window.targetIdAtOpen) {
      flowError("INVALID_STATE", "persisted target opportunity has the wrong owner");
    }
    if (window.kind === "causing_modifier" || window.kind.startsWith("source_after_")) {
      flowError("INVALID_STATE", "persisted target opportunity is in the wrong timing");
    }
  }
}

function assertPersistedWindow(frame: DamageFlowFrame, value: unknown): asserts value is DamageFlowWindow {
  if (!isRecord(value)
    || !isPositiveInteger(value.windowId)
    || typeof value.kind !== "string"
    || !WINDOW_KIND_SET.has(value.kind)
    || typeof value.cadence !== "string"
    || !CADENCE_SET.has(value.cadence)
    || !(value.pointIndex === null || isPositiveInteger(value.pointIndex))
    || !(value.subjectId === null || isNonemptyString(value.subjectId))
    || !isNonemptyString(value.targetIdAtOpen)
    || !Array.isArray(value.opportunities)
    || !isNonnegativeInteger(value.cursor)
    || typeof value.redirectOccurred !== "boolean"
    || typeof value.preventionOccurred !== "boolean"
  ) flowError("INVALID_STATE", "persisted damage opportunity window is malformed");

  const window = value as unknown as DamageFlowWindow;
  if (window.cursor > window.opportunities.length) flowError("INVALID_STATE", "damage opportunity cursor is out of range");
  if (window.kind !== "redirect" && window.redirectOccurred) {
    flowError("INVALID_STATE", "only a redirect window may record a redirect");
  }
  if (window.preventionOccurred && frame.damage.prevention === null) {
    flowError("INVALID_STATE", "window records prevention but DamageInstance does not");
  }
  if (window.targetIdAtOpen !== frame.damage.targetId && !window.redirectOccurred) {
    flowError("INVALID_STATE", "window target differs from the current damage target");
  }

  const descriptor = expectedWindowDescriptor(frame);
  if (window.kind !== descriptor.kind
    || window.cadence !== descriptor.cadence
    || window.pointIndex !== descriptor.pointIndex
    || (!window.redirectOccurred && window.subjectId !== descriptor.subjectId)
  ) flowError("INVALID_STATE", "persisted window does not match the current DamageInstance timing");

  const opportunityIds = new Set<string>();
  let firstPending = window.opportunities.length;
  for (let index = 0; index < window.opportunities.length; index += 1) {
    const opportunity = window.opportunities[index] as unknown;
    if (!isRecord(opportunity)
      || typeof opportunity.status !== "string"
      || !OPPORTUNITY_STATUS_SET.has(opportunity.status)
      || !(opportunity.resolutionRef === null || isNonemptyString(opportunity.resolutionRef))
    ) flowError("INVALID_STATE", "persisted opportunity state is malformed");
    assertPersistedOpportunityRef(opportunity.ref, frame, window);
    const typed = opportunity as unknown as DamageOpportunityState;
    if (opportunityIds.has(typed.ref.opportunityId)) flowError("INVALID_STATE", "opportunity IDs must be unique within a window");
    opportunityIds.add(typed.ref.opportunityId);
    if (typed.status === "pending" && firstPending === window.opportunities.length) firstPending = index;
    if (typed.status === "resolved") {
      if (typed.resolutionRef === null) flowError("INVALID_STATE", "a resolved opportunity must retain its resolution ref");
    } else if (typed.resolutionRef !== null) {
      flowError("INVALID_STATE", "only a resolved opportunity may retain a resolution ref");
    }
    if (typed.status === "skipped_redirected" && !window.redirectOccurred) {
      flowError("INVALID_STATE", "redirect-skipped opportunity has no redirect");
    }
    if (typed.status === "skipped_prevented" && !window.preventionOccurred) {
      flowError("INVALID_STATE", "prevention-skipped opportunity has no prevention");
    }
  }
  if (window.cursor !== firstPending) flowError("INVALID_STATE", "damage opportunity cursor is not at the first pending entry");

  if (!(window.prompt === null || isRecord(window.prompt))) flowError("INVALID_STATE", "persisted damage prompt is malformed");
  if (firstPending === window.opportunities.length) {
    if (window.prompt !== null) flowError("INVALID_STATE", "completed damage window still has a prompt");
  } else {
    const opportunity = window.opportunities[firstPending]!;
    const prompt = window.prompt;
    if (frame.status === "suspended") {
      if (prompt !== null) flowError("INVALID_STATE", "suspended damage frame must not retain an actionable prompt");
    } else if (prompt === null
      || !isPositiveInteger(prompt.promptId)
      || prompt.frameId !== frame.frameId
      || prompt.damageId !== frame.damageId
      || prompt.windowId !== window.windowId
      || prompt.opportunityId !== opportunity.ref.opportunityId
      || prompt.ownerId !== opportunity.ref.ownerId
      || !isNonnegativeInteger(prompt.issuedAtRevision)
    ) flowError("INVALID_STATE", "persisted prompt does not name the current opportunity");
  }
}

/** Strict assertion for a JSON-safe, internally consistent v1 snapshot. */
export function assertDamageFlowState(value: unknown): asserts value is DamageFlowState {
  assertJsonSafe(value);
  if (!isRecord(value)
    || value.version !== DAMAGE_FLOW_VERSION
    || value.type !== "damage_flow"
    || !isNonnegativeInteger(value.revision)
    || !isPositiveInteger(value.nextWindowId)
    || !isPositiveInteger(value.nextPromptId)
    || !isPositiveInteger(value.nextActionId)
    || !isPositiveInteger(value.nextDyingId)
    || !isPositiveInteger(value.nextResumeTokenId)
    || !Array.isArray(value.frames)
    || !Array.isArray(value.completedDamageIds)
    || !Array.isArray(value.completedFrameIds)
    || !Array.isArray(value.retiredPromptIds)
    || !Array.isArray(value.retiredResumeTokens)
    || !Array.isArray(value.consumedActions)
  ) flowError("INVALID_STATE", "damage flow snapshot root is malformed");

  const state = value as unknown as DamageFlowState;
  assertUniquePositive(state.completedDamageIds, "completed damage IDs");
  assertUniquePositive(state.completedFrameIds, "completed frame IDs");
  assertUniquePositive(state.retiredPromptIds, "retired prompt IDs");
  assertUniqueStrings(state.retiredResumeTokens, "retired resume tokens");

  const activeDamageIds = new Set<number>();
  const activeFrameIds = new Set<number>();
  const activeWindowIds = new Set<number>();
  const activePromptIds = new Set<number>();
  const activeTokens = new Set<string>();
  let maximumWindowId = 0;
  let maximumPromptId = 0;
  let maximumDyingId = 0;
  let maximumTokenNumber = 0;

  for (let index = 0; index < state.frames.length; index += 1) {
    const candidate = state.frames[index] as unknown;
    if (!isRecord(candidate)
      || !isPositiveInteger(candidate.frameId)
      || !isPositiveInteger(candidate.damageId)
      || (candidate.status !== "active" && candidate.status !== "suspended")
      || typeof candidate.step !== "string"
      || !FLOW_STEP_SET.has(candidate.step)
      || !(candidate.window === null || isRecord(candidate.window))
      || !(candidate.dying === null || isRecord(candidate.dying))
      || !(candidate.callerContinuation === null || isRecord(candidate.callerContinuation))
      || !(candidate.parentResumeToken === null || isNonemptyString(candidate.parentResumeToken))
      || !(candidate.awaitingChildToken === null || isNonemptyString(candidate.awaitingChildToken))
    ) flowError("INVALID_STATE", "persisted damage frame is malformed");
    const frame = candidate as unknown as DamageFlowFrame;
    if (frame.callerContinuation !== null) {
      assertCallerContinuation(frame.callerContinuation, "INVALID_STATE");
    }
    try {
      assertDamageInstance(frame.damage);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown DamageInstance error";
      flowError("INVALID_STATE", `persisted DamageInstance is invalid: ${message}`);
    }
    if (frame.damageId !== frame.damage.damageId || frame.frameId !== frame.damage.frameId) {
      flowError("INVALID_STATE", "flow frame IDs do not match DamageInstance IDs");
    }
    if (activeDamageIds.has(frame.damageId) || state.completedDamageIds.includes(frame.damageId)) {
      flowError("INVALID_STATE", "damage ID is duplicated across active and completed frames");
    }
    if (activeFrameIds.has(frame.frameId) || state.completedFrameIds.includes(frame.frameId)) {
      flowError("INVALID_STATE", "frame ID is duplicated across active and completed frames");
    }
    activeDamageIds.add(frame.damageId);
    activeFrameIds.add(frame.frameId);

    const isTop = index === state.frames.length - 1;
    if ((isTop && frame.status !== "active") || (!isTop && frame.status !== "suspended")) {
      flowError("INVALID_STATE", "only the top damage frame may be active");
    }
    if (index === 0) {
      if (frame.parentResumeToken !== null) flowError("INVALID_STATE", "root damage frame cannot have a parent token");
    } else {
      if (frame.callerContinuation !== null) {
        flowError("INVALID_STATE", "nested damage frame cannot retain a caller continuation");
      }
      const parent = state.frames[index - 1]!;
      if (frame.parentResumeToken === null || parent.awaitingChildToken !== frame.parentResumeToken) {
        flowError("INVALID_STATE", "nested damage frame is not linked to its exact parent token");
      }
      if (!/^dfr1:[1-9]\d*$/.test(frame.parentResumeToken)) flowError("INVALID_STATE", "nested resume token is malformed");
      if (activeTokens.has(frame.parentResumeToken) || state.retiredResumeTokens.includes(frame.parentResumeToken)) {
        flowError("INVALID_STATE", "nested resume token is duplicated or already retired");
      }
      activeTokens.add(frame.parentResumeToken);
      const tokenNumber = Number(frame.parentResumeToken.slice("dfr1:".length));
      if (!Number.isSafeInteger(tokenNumber)) flowError("INVALID_STATE", "nested resume token is unsafe");
      maximumTokenNumber = Math.max(maximumTokenNumber, tokenNumber);
    }
    if (isTop) {
      if (frame.awaitingChildToken !== null) flowError("INVALID_STATE", "top damage frame cannot await a child");
    } else if (frame.awaitingChildToken === null) {
      flowError("INVALID_STATE", "suspended damage frame is missing its child token");
    }

    assertStepMatchesDamage(frame);
    if (frame.step === "dying") {
      const dying = frame.dying;
      if (dying === null
        || !isPositiveInteger(dying.dyingId)
        || dying.frameId !== frame.frameId
        || dying.damageId !== frame.damageId
        || dying.targetId !== frame.damage.targetId
        || !Number.isSafeInteger(dying.hpAfterDamage)
        || dying.hpAfterDamage > 0
        || dying.hpAfterDamage !== frame.damage.hpAfter
      ) flowError("INVALID_STATE", "persisted dying barrier is malformed");
      maximumDyingId = Math.max(maximumDyingId, dying.dyingId);
    } else if (frame.dying !== null) {
      flowError("INVALID_STATE", "non-dying damage frame retains a dying barrier");
    }

    if (frame.window !== null) {
      if (!(frame.step === "causing" || frame.step === "redirect" || frame.step === "receiving" || frame.step === "post_damage")) {
        flowError("INVALID_STATE", "damage window is open at an impossible flow step");
      }
      assertPersistedWindow(frame, frame.window);
      if (activeWindowIds.has(frame.window.windowId)) flowError("INVALID_STATE", "active window IDs must be unique");
      activeWindowIds.add(frame.window.windowId);
      maximumWindowId = Math.max(maximumWindowId, frame.window.windowId);
      if (frame.window.prompt !== null) {
        if (activePromptIds.has(frame.window.prompt.promptId)
          || state.retiredPromptIds.includes(frame.window.prompt.promptId)
        ) flowError("INVALID_STATE", "active prompt is duplicated or retired");
        activePromptIds.add(frame.window.prompt.promptId);
        maximumPromptId = Math.max(maximumPromptId, frame.window.prompt.promptId);
        if (frame.window.prompt.issuedAtRevision > state.revision) {
          flowError("INVALID_STATE", "active prompt was issued in a future revision");
        }
      }
    }
  }

  const actionIds = new Set<number>();
  const consumedPromptIds = new Set<number>();
  let maximumActionId = 0;
  for (const candidate of state.consumedActions as readonly unknown[]) {
    if (!isRecord(candidate)
      || !isPositiveInteger(candidate.actionId)
      || !isPositiveInteger(candidate.promptId)
      || !isPositiveInteger(candidate.frameId)
      || !isPositiveInteger(candidate.damageId)
      || !isPositiveInteger(candidate.windowId)
      || !isNonemptyString(candidate.opportunityId)
      || !isNonemptyString(candidate.ownerId)
      || (candidate.outcome !== "pass" && candidate.outcome !== "resolve")
      || !(candidate.resolutionRef === null || isNonemptyString(candidate.resolutionRef))
      || !isPositiveInteger(candidate.acceptedAtRevision)
      || candidate.acceptedAtRevision > state.revision
    ) flowError("INVALID_STATE", "persisted consumed damage action is malformed");
    const action = candidate as unknown as ConsumedDamageOpportunityAction;
    if ((action.outcome === "pass") !== (action.resolutionRef === null)) {
      flowError("INVALID_STATE", "consumed damage action outcome disagrees with its resolution ref");
    }
    if (actionIds.has(action.actionId) || consumedPromptIds.has(action.promptId)) {
      flowError("INVALID_STATE", "consumed action or prompt ID is duplicated");
    }
    if (!state.retiredPromptIds.includes(action.promptId)) {
      flowError("INVALID_STATE", "consumed action prompt was not retired");
    }
    actionIds.add(action.actionId);
    consumedPromptIds.add(action.promptId);
    maximumActionId = Math.max(maximumActionId, action.actionId);
    maximumPromptId = Math.max(maximumPromptId, action.promptId);
  }

  for (const promptId of state.retiredPromptIds) maximumPromptId = Math.max(maximumPromptId, promptId);
  for (const token of state.retiredResumeTokens) {
    const match = /^dfr1:([1-9]\d*)$/.exec(token);
    if (!match) flowError("INVALID_STATE", "retired resume token is malformed");
    const tokenNumber = Number(match[1]);
    if (!Number.isSafeInteger(tokenNumber)) flowError("INVALID_STATE", "retired resume token is unsafe");
    maximumTokenNumber = Math.max(maximumTokenNumber, tokenNumber);
  }
  if (state.nextWindowId <= maximumWindowId
    || state.nextPromptId <= maximumPromptId
    || state.nextActionId <= maximumActionId
    || state.nextDyingId <= maximumDyingId
    || state.nextResumeTokenId <= maximumTokenNumber
  ) flowError("INVALID_STATE", "damage flow ID counters do not exceed persisted IDs");
}

export function createDamageFlowState(): DamageFlowState {
  return {
    version: DAMAGE_FLOW_VERSION,
    type: "damage_flow",
    revision: 0,
    nextWindowId: 1,
    nextPromptId: 1,
    nextActionId: 1,
    nextDyingId: 1,
    nextResumeTokenId: 1,
    frames: [],
    completedDamageIds: [],
    completedFrameIds: [],
    retiredPromptIds: [],
    retiredResumeTokens: [],
    consumedActions: [],
  };
}

export function cloneDamageFlowState(state: DamageFlowState): DamageFlowState {
  assertDamageFlowState(state);
  const clone = cloneStateUnchecked(state);
  assertDamageFlowState(clone);
  return clone;
}

export function restoreDamageFlowState(snapshot: unknown): DamageFlowState {
  if (!isRecord(snapshot) || snapshot.version !== DAMAGE_FLOW_VERSION) {
    flowError("UNSUPPORTED_VERSION", "restoreDamageFlowState accepts only an explicit v1 snapshot");
  }
  assertDamageFlowState(snapshot);
  return cloneStateUnchecked(snapshot);
}

export function serializeDamageFlowState(state: DamageFlowState): string {
  assertDamageFlowState(state);
  return JSON.stringify(state);
}

export function deserializeDamageFlowState(serialized: string): DamageFlowState {
  if (typeof serialized !== "string") flowError("INVALID_ARGUMENT", "serialized damage flow must be a string");
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    flowError("INVALID_STATE", "serialized damage flow is not valid JSON");
  }
  return restoreDamageFlowState(parsed);
}

/**
 * The only v0 migration boundary is an empty stack after every legacy frame
 * completed. An active legacy cursor has no unambiguous v1 timing and is rejected.
 */
export function migrateDamageFlowState(snapshot: unknown): DamageFlowState {
  if (isRecord(snapshot) && snapshot.version === DAMAGE_FLOW_VERSION) {
    assertJsonSafe(snapshot);
    const migrated = structuredClone(snapshot) as Record<string, unknown>;
    if (Array.isArray(migrated.frames)) {
      for (const candidate of migrated.frames) {
        if (isRecord(candidate) && !Object.prototype.hasOwnProperty.call(candidate, "callerContinuation")) {
          candidate.callerContinuation = null;
        }
      }
    }
    return restoreDamageFlowState(migrated);
  }
  assertJsonSafe(snapshot);
  if (!isRecord(snapshot) || snapshot.version !== 0 || snapshot.type !== "damage_flow") {
    flowError("UNSUPPORTED_VERSION", "unsupported damage flow snapshot version");
  }
  if (!("activeDamage" in snapshot) || snapshot.activeDamage !== null) {
    flowError("AMBIGUOUS_MIGRATION", "legacy active damage cannot be mapped to an exact v1 timing");
  }
  if (!isNonnegativeInteger(snapshot.revision)
    || !Array.isArray(snapshot.completedDamageIds)
    || !Array.isArray(snapshot.completedFrameIds)
  ) flowError("AMBIGUOUS_MIGRATION", "legacy completed boundary is malformed");
  assertUniquePositive(snapshot.completedDamageIds as number[], "legacy completed damage IDs");
  assertUniquePositive(snapshot.completedFrameIds as number[], "legacy completed frame IDs");
  const migrated = createDamageFlowState();
  migrated.revision = snapshot.revision;
  migrated.completedDamageIds = [...snapshot.completedDamageIds] as number[];
  migrated.completedFrameIds = [...snapshot.completedFrameIds] as number[];
  assertDamageFlowState(migrated);
  return migrated;
}

function requireExpectedRevision(state: DamageFlowState, expectedRevision: unknown): void {
  if (!isNonnegativeInteger(expectedRevision)) flowError("INVALID_ARGUMENT", "expected revision must be a nonnegative integer");
  if (state.revision !== expectedRevision) {
    flowError("STALE_REVISION", `expected damage flow revision ${expectedRevision}, received ${state.revision}`);
  }
}

function requireTopFrame(state: DamageFlowState, frameId: unknown): DamageFlowFrame {
  if (!isPositiveInteger(frameId)) flowError("INVALID_ARGUMENT", "frame ID must be a positive integer");
  const top = state.frames[state.frames.length - 1];
  if (!top) flowError("EMPTY_STACK", "damage flow stack is empty");
  if (top.frameId !== frameId) flowError("FRAME_NOT_TOP", `damage frame ${frameId} is not the active top frame`);
  if (top.status !== "active") flowError("FRAME_NOT_ACTIVE", `damage frame ${frameId} is suspended`);
  return top;
}

function commitRevision(state: DamageFlowState): number {
  state.revision = increment(state.revision, "damage flow revision");
  return state.revision;
}

function finishTransaction(state: DamageFlowState): DamageFlowState {
  assertDamageFlowState(state);
  return state;
}

function throwDamageFailure(error: unknown, code: DamageFlowErrorCode, context: string): never {
  if (error instanceof DamageFlowError) throw error;
  if (error instanceof DamageError) {
    if (/redirect.*cycle|cycle/i.test(error.message)) flowError("REDIRECT_CYCLE", error.message);
    flowError(code, `${context}: ${error.message}`);
  }
  throw error;
}

function assertEffect(effect: unknown): asserts effect is DamageOpportunityEffect {
  if (!isRecord(effect) || typeof effect.type !== "string") flowError("INVALID_EFFECT", "damage opportunity effect is malformed");
  if (effect.type === "none") return;
  if (effect.type === "modifier") {
    if ((effect.operation !== "add" && effect.operation !== "set" && effect.operation !== "cap")
      || !Number.isSafeInteger(effect.value)
    ) flowError("INVALID_EFFECT", "damage modifier effect is malformed");
    return;
  }
  if (effect.type === "redirect") {
    if (!isNonemptyString(effect.toTargetId)) flowError("INVALID_EFFECT", "damage redirect target is required");
    return;
  }
  if (effect.type === "prevention") {
    if (!isNonemptyString(effect.reason)) flowError("INVALID_EFFECT", "damage prevention reason is required");
    return;
  }
  flowError("INVALID_EFFECT", "unknown damage opportunity effect type");
}

function issuePromptAfterCommit(state: DamageFlowState, frame: DamageFlowFrame): void {
  if (frame.window === null) return;
  advanceWindowCursor(frame.window);
  frame.window.prompt = promptFor(state, frame, frame.window, state.revision);
}

/** Returns a defensive copy of the only actionable prompt. */
export function currentDamageFlowPrompt(state: DamageFlowState, frameId?: number): DamageOpportunityPrompt | null {
  assertDamageFlowState(state);
  const top = state.frames[state.frames.length - 1];
  if (!top) return null;
  if (frameId !== undefined && top.frameId !== frameId) flowError("FRAME_NOT_TOP", `damage frame ${frameId} is not active`);
  return top.window?.prompt ? { ...top.window.prompt } : null;
}

/** Pushes a fresh DamageInstance and enters its exact causing-damage timing. */
export function pushDamageFlowFrame(state: DamageFlowState, input: PushDamageFlowInput): PushDamageFlowResult {
  const suppliedContinuation = input.callerContinuation ?? null;
  assertJsonSafe({ ...input, callerContinuation: suppliedContinuation });
  if (suppliedContinuation !== null) {
    assertCallerContinuation(suppliedContinuation, "INVALID_ARGUMENT");
  }
  const callerContinuation = cloneCallerContinuation(suppliedContinuation);
  const draft = cloneDamageFlowState(state);
  requireExpectedRevision(draft, input.expectedRevision);
  try {
    assertDamageInstance(input.damage);
  } catch (error) {
    throwDamageFailure(error, "INVALID_ARGUMENT", "fresh DamageInstance is invalid");
  }
  if (input.damage.stage !== "start") flowError("INVALID_ARGUMENT", "only a fresh DamageInstance at stage start can be pushed");
  if (draft.completedDamageIds.includes(input.damage.damageId)
    || draft.frames.some((frame) => frame.damageId === input.damage.damageId)
  ) flowError("DUPLICATE_DAMAGE_ID", `damage ID ${input.damage.damageId} was already used`);
  if (draft.completedFrameIds.includes(input.damage.frameId)
    || draft.frames.some((frame) => frame.frameId === input.damage.frameId)
  ) flowError("DUPLICATE_FRAME_ID", `frame ID ${input.damage.frameId} was already used`);

  let resumeToken: string | null = null;
  if (draft.frames.length === 0) {
    if (input.expectedParentFrameId !== null) flowError("FRAME_NOT_TOP", "root damage frame cannot name a parent");
  } else {
    if (callerContinuation !== null) {
      flowError("INVALID_ARGUMENT", "nested damage frame cannot carry a caller continuation");
    }
    const parent = requireTopFrame(draft, input.expectedParentFrameId);
    if (parent.step === "complete") flowError("FRAME_NOT_COMPLETE", "a completed parent must be popped before pushing another frame");
    if (parent.awaitingChildToken !== null) flowError("INVALID_STATE", "parent damage frame already awaits a child");
    if (parent.window !== null) retirePrompt(draft, parent.window);
    resumeToken = `dfr1:${draft.nextResumeTokenId}`;
    draft.nextResumeTokenId = increment(draft.nextResumeTokenId, "next resume token ID");
    parent.awaitingChildToken = resumeToken;
    parent.status = "suspended";
  }

  const damage = cloneDamageInstance(input.damage);
  try {
    beginDamageCausing(damage);
  } catch (error) {
    throwDamageFailure(error, "INVALID_ARGUMENT", "damage causing timing cannot begin");
  }
  const frame: DamageFlowFrame = {
    frameId: damage.frameId,
    damageId: damage.damageId,
    status: "active",
    step: "causing",
    damage,
    window: null,
    dying: null,
    callerContinuation,
    parentResumeToken: resumeToken,
    awaitingChildToken: null,
  };
  draft.frames.push(frame);
  commitRevision(draft);
  const completed = finishTransaction(draft);
  return { state: completed, frame: cloneFrame(frame), resumeToken };
}

/** Opens the exact current timing with a persisted, caller-ordered opportunity list. */
export function openDamageFlowWindow(state: DamageFlowState, input: OpenDamageFlowWindowInput): DamageFlowState {
  assertJsonSafe(input);
  const draft = cloneDamageFlowState(state);
  requireExpectedRevision(draft, input.expectedRevision);
  const frame = requireTopFrame(draft, input.frameId);
  if (frame.window !== null) flowError("WINDOW_ALREADY_OPEN", "damage frame already has an open opportunity window");
  if (!Array.isArray(input.opportunities)) flowError("INVALID_ARGUMENT", "damage opportunities must be an array");
  assertPlayerSnapshot(input.players);
  const descriptor = expectedWindowDescriptor(frame);
  if (input.kind !== descriptor.kind) {
    flowError("WRONG_WINDOW", `expected ${descriptor.kind}, received ${input.kind}`);
  }
  const playersById = new Map(input.players.map((player) => [player.id, player] as const));
  const opportunityIds = new Set<string>();
  const opportunities: DamageOpportunityState[] = input.opportunities.map((candidate) => {
    assertOpportunityRef(candidate, frame, descriptor, new Set(playersById.keys()));
    if (opportunityIds.has(candidate.opportunityId)) {
      flowError("INVALID_ARGUMENT", `duplicate opportunity ID ${candidate.opportunityId}`);
    }
    opportunityIds.add(candidate.opportunityId);
    const owner = playersById.get(candidate.ownerId)!;
    return {
      ref: cloneOpportunityRef(candidate),
      status: owner.alive ? "pending" : "skipped_dead",
      resolutionRef: null,
    };
  });
  const window: DamageFlowWindow = {
    windowId: draft.nextWindowId,
    kind: descriptor.kind,
    cadence: descriptor.cadence,
    pointIndex: descriptor.pointIndex,
    subjectId: descriptor.subjectId,
    targetIdAtOpen: frame.damage.targetId,
    opportunities,
    cursor: 0,
    prompt: null,
    redirectOccurred: false,
    preventionOccurred: false,
  };
  draft.nextWindowId = increment(draft.nextWindowId, "next window ID");
  advanceWindowCursor(window);
  frame.window = window;
  commitRevision(draft);
  issuePromptAfterCommit(draft, frame);
  return finishTransaction(draft);
}

/** Accepts exactly one prompt once; every cursor field is checked independently. */
export function actOnDamageOpportunity(state: DamageFlowState, action: DamageOpportunityAction): DamageFlowState {
  assertJsonSafe(action);
  assertDamageFlowState(state);
  if (!isRecord(action)
    || !isPositiveInteger(action.actionId)
    || !isPositiveInteger(action.promptId)
    || !isPositiveInteger(action.frameId)
    || !isPositiveInteger(action.damageId)
    || !isPositiveInteger(action.windowId)
    || !isNonemptyString(action.opportunityId)
    || !isNonemptyString(action.ownerId)
    || !isNonnegativeInteger(action.expectedRevision)
    || (action.outcome !== "pass" && action.outcome !== "resolve")
    || !(action.resolutionRef === null || isNonemptyString(action.resolutionRef))
  ) flowError("INVALID_ARGUMENT", "damage opportunity action is malformed");
  assertEffect(action.effect);

  if (state.consumedActions.some((entry) => entry.actionId === action.actionId)) {
    flowError("ACTION_REPLAY", `damage action ${action.actionId} was already consumed`);
  }
  if (state.retiredPromptIds.includes(action.promptId)) {
    flowError("PROMPT_REPLAY", `damage prompt ${action.promptId} was already retired`);
  }
  if (action.actionId !== state.nextActionId) {
    flowError("ACTION_OUT_OF_SEQUENCE", `expected damage action ${state.nextActionId}, received ${action.actionId}`);
  }
  requireExpectedRevision(state, action.expectedRevision);

  const draft = cloneStateUnchecked(state);
  const frame = requireTopFrame(draft, action.frameId);
  const window = frame.window;
  if (window === null) flowError("WINDOW_NOT_OPEN", "damage frame has no open opportunity window");
  const prompt = window.prompt;
  if (prompt === null) flowError("NO_PENDING_PROMPT", "damage window has no pending opportunity prompt");
  if (action.promptId !== prompt.promptId
    || action.damageId !== prompt.damageId
    || action.windowId !== prompt.windowId
    || action.opportunityId !== prompt.opportunityId
  ) flowError("STALE_PROMPT", "damage action cursor does not match the current prompt");
  if (action.ownerId !== prompt.ownerId) flowError("WRONG_OWNER", "damage action owner does not own the current prompt");
  if (prompt.issuedAtRevision !== draft.revision) flowError("STALE_PROMPT", "damage prompt was issued at an obsolete revision");
  const opportunity = window.opportunities[window.cursor];
  if (!opportunity || opportunity.status !== "pending") flowError("NO_PENDING_PROMPT", "damage opportunity cursor is exhausted");
  if (opportunity.ref.ownerId !== action.ownerId) flowError("WRONG_OWNER", "damage opportunity owner was forged");

  if (action.outcome === "pass") {
    if (action.resolutionRef !== null || action.effect.type !== "none") {
      flowError("INVALID_EFFECT", "passing a damage opportunity cannot carry an effect or resolution ref");
    }
  } else if (action.resolutionRef === null) {
    flowError("INVALID_EFFECT", "resolving a damage opportunity requires a stable resolution ref");
  }

  try {
    if (action.outcome === "resolve") {
      if (action.effect.type === "modifier") {
        if (window.kind !== "causing_modifier" && window.kind !== "receiving_modifier") {
          flowError("INVALID_EFFECT", "damage modifiers are not legal in this opportunity window");
        }
        modifyDamage(frame.damage, {
          operation: action.effect.operation,
          value: action.effect.value,
          sourceId: opportunity.ref.ownerId,
          skillId: opportunity.ref.skillId,
        });
      } else if (action.effect.type === "redirect") {
        if (window.kind !== "redirect" || opportunity.ref.relation !== "target") {
          flowError("INVALID_EFFECT", "only the current target's redirect opportunity can redirect damage");
        }
        redirectDamage(frame.damage, {
          toTargetId: action.effect.toTargetId,
          sourceId: opportunity.ref.ownerId,
          skillId: opportunity.ref.skillId,
        });
        window.redirectOccurred = true;
      } else if (action.effect.type === "prevention") {
        if (window.kind !== "causing_modifier" && window.kind !== "redirect" && window.kind !== "receiving_modifier") {
          flowError("INVALID_EFFECT", "damage prevention is not legal in a post-damage window");
        }
        preventDamage(frame.damage, {
          sourceId: opportunity.ref.ownerId,
          skillId: opportunity.ref.skillId,
          reason: action.effect.reason,
        });
        window.preventionOccurred = true;
      }
    }
  } catch (error) {
    throwDamageFailure(error, "INVALID_EFFECT", "damage opportunity effect failed");
  }

  opportunity.status = action.outcome === "pass" ? "passed" : "resolved";
  opportunity.resolutionRef = action.resolutionRef;
  retirePrompt(draft, window);
  if (window.redirectOccurred || window.preventionOccurred) {
    const skippedStatus: DamageOpportunityStatus = window.redirectOccurred ? "skipped_redirected" : "skipped_prevented";
    for (const remaining of window.opportunities) {
      if (remaining.status === "pending") remaining.status = skippedStatus;
    }
  }
  advanceWindowCursor(window);
  draft.nextActionId = increment(draft.nextActionId, "next damage action ID");
  const acceptedAtRevision = commitRevision(draft);
  draft.consumedActions.push({
    actionId: action.actionId,
    promptId: action.promptId,
    frameId: action.frameId,
    damageId: action.damageId,
    windowId: action.windowId,
    opportunityId: action.opportunityId,
    ownerId: action.ownerId,
    outcome: action.outcome,
    resolutionRef: action.resolutionRef,
    acceptedAtRevision,
  });
  issuePromptAfterCommit(draft, frame);
  return finishTransaction(draft);
}

/** Closes an exhausted window and delegates the exact stage transition to damage.ts. */
export function closeDamageFlowWindow(state: DamageFlowState, input: CloseDamageFlowWindowInput): DamageFlowState {
  assertJsonSafe(input);
  const draft = cloneDamageFlowState(state);
  requireExpectedRevision(draft, input.expectedRevision);
  const frame = requireTopFrame(draft, input.frameId);
  const window = frame.window;
  if (window === null) flowError("WINDOW_NOT_OPEN", "damage frame has no open opportunity window");
  if (!isPositiveInteger(input.windowId) || input.windowId !== window.windowId) {
    flowError("STALE_PROMPT", "window ID does not match the current damage window");
  }
  if (window.prompt !== null || window.opportunities.some((opportunity) => opportunity.status === "pending")) {
    flowError("WINDOW_NOT_COMPLETE", "damage opportunity window still has pending entries");
  }

  try {
    if (frame.step === "causing") {
      if (window.kind !== "causing_modifier") flowError("WRONG_WINDOW", "causing step has the wrong window kind");
      if (window.preventionOccurred) frame.step = "post_damage";
      else {
        beginDamageReceiving(frame.damage);
        frame.step = "redirect";
      }
    } else if (frame.step === "redirect") {
      if (window.kind !== "redirect") flowError("WRONG_WINDOW", "redirect step has the wrong window kind");
      if (window.preventionOccurred) frame.step = "post_damage";
      else frame.step = window.redirectOccurred ? "redirect" : "receiving";
    } else if (frame.step === "receiving") {
      if (window.kind !== "receiving_modifier") flowError("WRONG_WINDOW", "receiving step has the wrong window kind");
      if (window.preventionOccurred) frame.step = "post_damage";
      else {
        const amount = lockDamageAmount(frame.damage);
        frame.step = amount === 0 ? "post_damage" : "life_deduction";
      }
    } else if (frame.step === "post_damage") {
      if (window.kind !== frame.damage.stage) flowError("WRONG_WINDOW", "post-damage window disagrees with DamageInstance stage");
      completeDamageTriggerWindow(frame.damage);
      frame.step = (frame.damage.stage as string) === "complete" ? "complete" : "post_damage";
    } else {
      flowError("WRONG_WINDOW", `damage window cannot close during ${frame.step}`);
    }
  } catch (error) {
    throwDamageFailure(error, "INVALID_STATE", "damage window transition failed");
  }
  frame.window = null;
  commitRevision(draft);
  return finishTransaction(draft);
}

/** Applies life loss once. A lethal result inserts a persisted dying barrier. */
export function applyDamageLifeFlow(
  state: DamageFlowState,
  players: readonly LifePlayerState[],
  input: DamageLifeInput,
): DamageLifeTransaction {
  assertJsonSafe({ players, input });
  const draft = cloneDamageFlowState(state);
  requireExpectedRevision(draft, input.expectedRevision);
  const frame = requireTopFrame(draft, input.frameId);
  if (frame.step !== "life_deduction" || frame.damage.stage !== "ready_for_life_deduction" || frame.window !== null) {
    flowError("DAMAGE_NOT_READY", "damage frame is not ready for life deduction");
  }
  const playerDraft = clonePlayers(players);
  let application: DamageApplicationResult;
  try {
    application = applyDamageToLife(playerDraft, frame.damage);
  } catch (error) {
    throwDamageFailure(error, "DAMAGE_NOT_READY", "damage life deduction failed");
  }

  let dying: DamageDyingBarrier | null = null;
  if (application.entersDying) {
    dying = {
      dyingId: draft.nextDyingId,
      frameId: frame.frameId,
      damageId: frame.damageId,
      targetId: application.targetId,
      hpAfterDamage: application.hpAfter,
    };
    draft.nextDyingId = increment(draft.nextDyingId, "next dying ID");
    frame.dying = dying;
    frame.step = "dying";
  } else {
    try {
      resumeDamageAfterDying(playerDraft, frame.damage);
    } catch (error) {
      throwDamageFailure(error, "INVALID_STATE", "nonlethal damage could not enter post-damage timing");
    }
    frame.step = "post_damage";
  }
  commitRevision(draft);
  return {
    state: finishTransaction(draft),
    players: playerDraft,
    application: { ...application },
    dying: dying ? { ...dying } : null,
  };
}

/** Resumes the exact damage frame only after its inserted dying resolution ends. */
export function resumeDamageAfterDyingFlow(
  state: DamageFlowState,
  players: readonly LifePlayerState[],
  input: ResumeDamageDyingInput,
): DamageFlowState {
  assertResumeDamageDyingInput(input);
  assertJsonSafe({ players, input });
  const draft = cloneDamageFlowState(state);
  requireExpectedRevision(draft, input.expectedRevision);
  const frame = requireTopFrame(draft, input.frameId);
  const dying = frame.dying;
  if (frame.step !== "dying" || dying === null) flowError("DYING_NOT_PENDING", "damage frame is not awaiting dying resolution");
  if (!isPositiveInteger(input.dyingId) || input.dyingId !== dying.dyingId) {
    flowError("DYING_NOT_PENDING", "dying cursor does not match the damage frame barrier");
  }
  const playerDraft = clonePlayers(players);
  const target = playerDraft.find((player) => player.id === dying.targetId);
  if (!target) flowError("INVALID_DYING_RESULT", "dying target is missing from the player snapshot");
  if (input.outcome === "protected_by_buqu") {
    assertBuquProtectedResumeProof(playerDraft, frame, dying, input.proof);
    try {
      resumeDamageAfterProtectedDying(playerDraft, frame.damage, {
        skillId: "buqu",
        targetId: dying.targetId,
      });
    } catch (error) {
      throwDamageFailure(error, "INVALID_DYING_RESULT", "damage could not resume under Buqu protection");
    }
  } else {
    if (input.outcome === "rescued") {
      if (!target.alive || target.hp <= 0) flowError("INVALID_DYING_RESULT", "rescued target must be alive with positive HP");
    } else if (target.alive || target.hp > 0) {
      flowError("INVALID_DYING_RESULT", "dead target must be marked dead with nonpositive HP");
    }
    try {
      resumeDamageAfterDying(playerDraft, frame.damage);
    } catch (error) {
      throwDamageFailure(error, "INVALID_DYING_RESULT", "damage could not resume after dying");
    }
  }
  frame.dying = null;
  frame.step = "post_damage";
  commitRevision(draft);
  return finishTransaction(draft);
}

function filterDeadPendingOwners(
  state: DamageFlowState,
  frame: DamageFlowFrame,
  players: readonly LifePlayerState[],
  forceReissue: boolean,
): boolean {
  const window = frame.window;
  if (window === null) return false;
  assertPlayerSnapshot(players);
  const playersById = new Map(players.map((player) => [player.id, player] as const));
  let changed = false;
  for (const opportunity of window.opportunities) {
    if (opportunity.status !== "pending") continue;
    const owner = playersById.get(opportunity.ref.ownerId);
    if (!owner) flowError("INVALID_ARGUMENT", `opportunity owner ${opportunity.ref.ownerId} is missing from player snapshot`);
    if (!owner.alive) {
      opportunity.status = "skipped_dead";
      changed = true;
    }
  }
  if (changed || forceReissue) retirePrompt(state, window);
  advanceWindowCursor(window);
  return changed || forceReissue;
}

/** Revalidates pending owners after any external/nested resolution changed life state. */
export function refreshDamageOpportunityOwners(
  state: DamageFlowState,
  input: RefreshDamageOpportunityOwnersInput,
): DamageFlowState {
  assertJsonSafe(input);
  const draft = cloneDamageFlowState(state);
  requireExpectedRevision(draft, input.expectedRevision);
  const frame = requireTopFrame(draft, input.frameId);
  if (frame.window === null) flowError("WINDOW_NOT_OPEN", "damage frame has no opportunity owners to refresh");
  const changed = filterDeadPendingOwners(draft, frame, input.players, false);
  if (!changed) return finishTransaction(draft);
  commitRevision(draft);
  issuePromptAfterCommit(draft, frame);
  return finishTransaction(draft);
}

/** Pops a complete frame and resumes only the parent named by its opaque token. */
export function finishDamageFlowFrame(state: DamageFlowState, input: FinishDamageFlowInput): FinishDamageFlowResult {
  assertJsonSafe(input);
  assertDamageFlowState(state);
  if (isPositiveInteger(input.frameId) && state.completedFrameIds.includes(input.frameId)) {
    flowError("RESUME_REPLAY", "damage frame completion and its caller continuation were already consumed");
  }
  if (input.resumeToken !== null && state.retiredResumeTokens.includes(input.resumeToken)) {
    flowError("RESUME_REPLAY", "nested damage resume token was already consumed");
  }
  const draft = cloneStateUnchecked(state);
  requireExpectedRevision(draft, input.expectedRevision);
  const frame = requireTopFrame(draft, input.frameId);
  if (frame.step !== "complete" || frame.damage.stage !== "complete" || frame.window !== null || frame.dying !== null) {
    flowError("FRAME_NOT_COMPLETE", "damage frame has not completed settlement-end");
  }

  const parent = draft.frames.length > 1 ? draft.frames[draft.frames.length - 2]! : null;
  let resumedParentFrameId: number | null = null;
  const callerContinuation = parent === null
    ? cloneCallerContinuation(frame.callerContinuation)
    : null;
  if (parent === null) {
    if (input.resumeToken !== null || frame.parentResumeToken !== null) {
      flowError("INVALID_RESUME_TOKEN", "root damage frame must finish without a resume token");
    }
    if (input.players !== null) assertPlayerSnapshot(input.players);
  } else {
    const expectedToken = frame.parentResumeToken;
    if (expectedToken === null || input.resumeToken !== expectedToken || parent.awaitingChildToken !== expectedToken) {
      flowError("INVALID_RESUME_TOKEN", "resume token does not identify the exact suspended parent frame");
    }
    if (input.players === null) {
      flowError("INVALID_ARGUMENT", "nested damage return requires a player snapshot for dead-owner filtering");
    }
    assertPlayerSnapshot(input.players);
  }

  draft.frames.pop();
  draft.completedDamageIds.push(frame.damageId);
  draft.completedFrameIds.push(frame.frameId);
  if (parent !== null) {
    const token = frame.parentResumeToken!;
    draft.retiredResumeTokens.push(token);
    parent.awaitingChildToken = null;
    parent.status = "active";
    resumedParentFrameId = parent.frameId;
    filterDeadPendingOwners(draft, parent, input.players!, true);
  }
  commitRevision(draft);
  if (parent !== null) issuePromptAfterCommit(draft, parent);
  return {
    state: finishTransaction(draft),
    completedDamageId: frame.damageId,
    completedFrameId: frame.frameId,
    resumedParentFrameId,
    callerContinuation,
  };
}
