/**
 * Serializable resolution primitives for the future authoritative rules engine.
 *
 * This module deliberately has no dependency on the current GameSession or
 * PendingResponse implementation. Every value stored in ResolutionStack is
 * JSON data; callers resume work by interpreting discriminants and payloads,
 * never by persisting functions or closures.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface SerializedContinuation {
  type: string;
  data: JsonObject;
}

export const RESOLUTION_FRAME_KINDS = [
  "phase",
  "trigger_window",
  "card_use",
  "judgment",
  "damage",
  "move",
  "pindian",
  "dying",
  "death",
  "skill",
  "extra_turn",
] as const;

export type ResolutionFrameKind = (typeof RESOLUTION_FRAME_KINDS)[number];
export type NonPhaseFrameKind = Exclude<ResolutionFrameKind, "phase">;
export type ResolutionFrameStatus = "active" | "suspended" | "waiting" | "ready";

export type PhaseLifecycle = "created" | "begun" | "ended";

export interface PhaseInstance {
  instanceId: number;
  turnId: number;
  playerId: string;
  name: string;
  lifecycle: PhaseLifecycle;
  beganAtStateVersion: number | null;
  endedAtStateVersion: number | null;
}

export interface DecisionRequest {
  requestId: number;
  frameId: number;
  actorId: string;
  kind: string;
  canPass: boolean;
  issuedAtStateVersion: number;
  payload: JsonObject;
}

export interface DecisionAction {
  actionId: number;
  requestId: number;
  frameId: number;
  actorId: string;
  expectedStateVersion: number;
  value: JsonValue;
}

export interface DecisionResolution {
  request: DecisionRequest;
  action: DecisionAction;
  acceptedAtStateVersion: number;
}

interface ResolutionFrameBase<K extends ResolutionFrameKind> {
  frameId: number;
  kind: K;
  status: ResolutionFrameStatus;
  continuation: SerializedContinuation | null;
  payload: JsonObject;
  decisionRequest: DecisionRequest | null;
  decisionResult: DecisionResolution | null;
}

export interface PhaseResolutionFrame extends ResolutionFrameBase<"phase"> {
  phase: PhaseInstance;
}

export interface NonPhaseResolutionFrame extends ResolutionFrameBase<NonPhaseFrameKind> {
  phase?: never;
}

export type ResolutionFrame = PhaseResolutionFrame | NonPhaseResolutionFrame;

export interface PhaseFrameSpec {
  kind: "phase";
  phase: {
    turnId: number;
    playerId: string;
    name: string;
  };
  continuation?: SerializedContinuation | null;
  payload?: JsonObject;
}

export interface NonPhaseFrameSpec {
  kind: NonPhaseFrameKind;
  continuation?: SerializedContinuation | null;
  payload?: JsonObject;
}

export type ResolutionFrameSpec = PhaseFrameSpec | NonPhaseFrameSpec;

export type TurnKind = "normal" | "extra";

export interface TurnEntry {
  turnId: number;
  playerId: string;
  kind: TurnKind;
  grantedByTurnId: number | null;
  reason: SerializedContinuation;
  queuedAtStateVersion: number;
}

export interface TurnEntrySpec {
  playerId: string;
  kind: TurnKind;
  grantedByTurnId?: number | null;
  reason?: SerializedContinuation;
}

export interface TurnQueueState {
  nextTurnId: number;
  current: TurnEntry | null;
  pending: TurnEntry[];
}

export interface ResolutionStack {
  version: 1;
  stateVersion: number;
  nextFrameId: number;
  nextDecisionId: number;
  nextActionId: number;
  frames: ResolutionFrame[];
  consumedActions: DecisionResolution[];
  turnQueue: TurnQueueState;
}

export interface DecisionRequestSpec {
  frameId: number;
  actorId: string;
  kind: string;
  canPass?: boolean;
  payload?: JsonObject;
}

/** Full replacement of the data owned by an active frame. */
export interface FrameDataUpdate {
  payload?: JsonObject;
  continuation?: SerializedContinuation | null;
}

export interface StackFrameTransition {
  stack: ResolutionStack;
  frame: ResolutionFrame;
}

export interface DecisionRequestTransition {
  stack: ResolutionStack;
  request: DecisionRequest;
}

export type DecisionConsumeResult =
  | { kind: "accepted"; stack: ResolutionStack; resolution: DecisionResolution }
  | { kind: "duplicate"; stack: ResolutionStack; resolution: DecisionResolution };

export interface DecisionResumeTransition {
  stack: ResolutionStack;
  resolution: DecisionResolution;
}

export interface TurnTransition {
  stack: ResolutionStack;
  turn: TurnEntry;
}

export interface ResolutionValidationIssue {
  path: string;
  message: string;
}

export interface ResolutionValidationResult {
  valid: boolean;
  issues: ResolutionValidationIssue[];
}

export type ResolutionErrorCode =
  | "INVALID_STACK"
  | "INVALID_ARGUMENT"
  | "EMPTY_STACK"
  | "FRAME_NOT_TOP"
  | "FRAME_NOT_ACTIVE"
  | "FRAME_HAS_PENDING_DECISION"
  | "NO_PENDING_DECISION"
  | "DECISION_NOT_READY"
  | "WRONG_ACTOR"
  | "STALE_STATE"
  | "STALE_DECISION"
  | "ACTION_OUT_OF_SEQUENCE"
  | "ACTION_ID_REUSED"
  | "PHASE_NOT_BEGUN"
  | "PHASE_ALREADY_BEGUN"
  | "PHASE_ALREADY_ENDED"
  | "PHASE_NOT_ENDED"
  | "TURN_ALREADY_ACTIVE"
  | "NO_QUEUED_TURN"
  | "NO_ACTIVE_TURN"
  | "TURN_MISMATCH"
  | "RESOLUTION_IN_PROGRESS";

export class ResolutionError extends Error {
  readonly code: ResolutionErrorCode;

  constructor(code: ResolutionErrorCode, message: string) {
    super(message);
    this.name = "ResolutionError";
    this.code = code;
  }
}

const FRAME_KIND_SET = new Set<string>(RESOLUTION_FRAME_KINDS);
const FRAME_STATUS_SET = new Set<string>(["active", "suspended", "waiting", "ready"]);
const PHASE_LIFECYCLE_SET = new Set<string>(["created", "begun", "ended"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function isSafeInteger(value: unknown, minimum = 0): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function addIssue(
  issues: ResolutionValidationIssue[],
  path: string,
  message: string,
): void {
  issues.push({ path, message });
}

function collectJsonIssues(
  value: unknown,
  path: string,
  ancestors: object[],
  issues: ResolutionValidationIssue[],
): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) addIssue(issues, path, "JSON numbers must be finite.");
    return;
  }
  if (typeof value !== "object") {
    addIssue(issues, path, `Value of type ${typeof value} is not JSON-safe.`);
    return;
  }
  if (ancestors.includes(value)) {
    addIssue(issues, path, "Cyclic references are not JSON-safe.");
    return;
  }
  const nextAncestors = [...ancestors, value];
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) {
        addIssue(issues, `${path}[${index}]`, "Sparse arrays are not JSON-safe state.");
      } else {
        collectJsonIssues(value[index], `${path}[${index}]`, nextAncestors, issues);
      }
    }
    return;
  }
  if (!isRecord(value)) {
    addIssue(issues, path, "Only plain objects may be stored in resolution state.");
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    collectJsonIssues(child, `${path}.${key}`, nextAncestors, issues);
  }
}

function validateContinuation(
  value: unknown,
  path: string,
  issues: ResolutionValidationIssue[],
): void {
  if (value === null) return;
  if (!isRecord(value)) {
    addIssue(issues, path, "Continuation must be an object or null.");
    return;
  }
  if (!isNonEmptyString(value.type)) addIssue(issues, `${path}.type`, "Continuation type is required.");
  if (!isRecord(value.data)) addIssue(issues, `${path}.data`, "Continuation data must be a JSON object.");
}

function validateDecisionRequest(
  value: unknown,
  path: string,
  issues: ResolutionValidationIssue[],
): void {
  if (!isRecord(value)) {
    addIssue(issues, path, "Decision request must be an object.");
    return;
  }
  if (!isSafeInteger(value.requestId, 1)) addIssue(issues, `${path}.requestId`, "Request ID must be positive.");
  if (!isSafeInteger(value.frameId, 1)) addIssue(issues, `${path}.frameId`, "Frame ID must be positive.");
  if (!isNonEmptyString(value.actorId)) addIssue(issues, `${path}.actorId`, "Actor ID is required.");
  if (!isNonEmptyString(value.kind)) addIssue(issues, `${path}.kind`, "Decision kind is required.");
  if (typeof value.canPass !== "boolean") addIssue(issues, `${path}.canPass`, "canPass must be boolean.");
  if (!isSafeInteger(value.issuedAtStateVersion)) {
    addIssue(issues, `${path}.issuedAtStateVersion`, "Issued state version must be nonnegative.");
  }
  if (!isRecord(value.payload)) addIssue(issues, `${path}.payload`, "Decision payload must be a JSON object.");
}

function validateDecisionAction(
  value: unknown,
  path: string,
  issues: ResolutionValidationIssue[],
): void {
  if (!isRecord(value)) {
    addIssue(issues, path, "Decision action must be an object.");
    return;
  }
  if (!isSafeInteger(value.actionId, 1)) addIssue(issues, `${path}.actionId`, "Action ID must be positive.");
  if (!isSafeInteger(value.requestId, 1)) addIssue(issues, `${path}.requestId`, "Request ID must be positive.");
  if (!isSafeInteger(value.frameId, 1)) addIssue(issues, `${path}.frameId`, "Frame ID must be positive.");
  if (!isNonEmptyString(value.actorId)) addIssue(issues, `${path}.actorId`, "Actor ID is required.");
  if (!isSafeInteger(value.expectedStateVersion)) {
    addIssue(issues, `${path}.expectedStateVersion`, "Expected state version must be nonnegative.");
  }
  if (!("value" in value)) addIssue(issues, `${path}.value`, "Decision value is required, even when null.");
}

function validateDecisionResolution(
  value: unknown,
  path: string,
  issues: ResolutionValidationIssue[],
  stackStateVersion?: unknown,
): void {
  if (!isRecord(value)) {
    addIssue(issues, path, "Decision resolution must be an object.");
    return;
  }
  validateDecisionRequest(value.request, `${path}.request`, issues);
  validateDecisionAction(value.action, `${path}.action`, issues);
  if (!isSafeInteger(value.acceptedAtStateVersion, 1)) {
    addIssue(issues, `${path}.acceptedAtStateVersion`, "Accepted state version must be positive.");
  }
  if (isRecord(value.request) && isRecord(value.action)) {
    if (value.request.requestId !== value.action.requestId) {
      addIssue(issues, path, "Resolution request and action IDs disagree.");
    }
    if (value.request.frameId !== value.action.frameId) {
      addIssue(issues, path, "Resolution request and action frame IDs disagree.");
    }
    if (value.request.actorId !== value.action.actorId) {
      addIssue(issues, path, "Resolution request and action actors disagree.");
    }
    if (value.request.issuedAtStateVersion !== value.action.expectedStateVersion) {
      addIssue(issues, path, "Action expected state does not match its request.");
    }
    if (
      isSafeInteger(value.request.issuedAtStateVersion) &&
      isSafeInteger(value.acceptedAtStateVersion, 1) &&
      value.acceptedAtStateVersion !== value.request.issuedAtStateVersion + 1
    ) {
      addIssue(issues, path, "A decision must be accepted in the state immediately after it was issued.");
    }
  }
  if (
    isSafeInteger(stackStateVersion) &&
    isSafeInteger(value.acceptedAtStateVersion, 1) &&
    value.acceptedAtStateVersion > stackStateVersion
  ) {
    addIssue(issues, `${path}.acceptedAtStateVersion`, "Decision was accepted in a future state.");
  }
}

function validatePhaseInstance(
  value: unknown,
  frameId: unknown,
  path: string,
  stackStateVersion: unknown,
  issues: ResolutionValidationIssue[],
): void {
  if (!isRecord(value)) {
    addIssue(issues, path, "Phase instance is required on a phase frame.");
    return;
  }
  if (!isSafeInteger(value.instanceId, 1)) addIssue(issues, `${path}.instanceId`, "Phase instance ID must be positive.");
  if (value.instanceId !== frameId) addIssue(issues, `${path}.instanceId`, "Phase instance ID must equal its frame ID.");
  if (!isSafeInteger(value.turnId, 1)) addIssue(issues, `${path}.turnId`, "Turn ID must be positive.");
  if (!isNonEmptyString(value.playerId)) addIssue(issues, `${path}.playerId`, "Phase player ID is required.");
  if (!isNonEmptyString(value.name)) addIssue(issues, `${path}.name`, "Phase name is required.");
  if (typeof value.lifecycle !== "string" || !PHASE_LIFECYCLE_SET.has(value.lifecycle)) {
    addIssue(issues, `${path}.lifecycle`, "Unknown phase lifecycle.");
    return;
  }
  const began = value.beganAtStateVersion;
  const ended = value.endedAtStateVersion;
  if (value.lifecycle === "created") {
    if (began !== null || ended !== null) addIssue(issues, path, "A created phase cannot have lifecycle timestamps.");
  } else if (value.lifecycle === "begun") {
    if (!isSafeInteger(began, 1) || ended !== null) addIssue(issues, path, "A begun phase needs only a begin timestamp.");
  } else if (!isSafeInteger(began, 1) || !isSafeInteger(ended, 1) || began >= ended) {
    addIssue(issues, path, "An ended phase needs ordered begin and end timestamps.");
  }
  if (isSafeInteger(stackStateVersion) && isSafeInteger(began, 1) && began > stackStateVersion) {
    addIssue(issues, `${path}.beganAtStateVersion`, "Phase begins in a future state version.");
  }
  if (isSafeInteger(stackStateVersion) && isSafeInteger(ended, 1) && ended > stackStateVersion) {
    addIssue(issues, `${path}.endedAtStateVersion`, "Phase ends in a future state version.");
  }
}

function validateFrame(
  value: unknown,
  index: number,
  frameCount: number,
  stackStateVersion: unknown,
  issues: ResolutionValidationIssue[],
): void {
  const path = `$.frames[${index}]`;
  if (!isRecord(value)) {
    addIssue(issues, path, "Frame must be an object.");
    return;
  }
  if (!isSafeInteger(value.frameId, 1)) addIssue(issues, `${path}.frameId`, "Frame ID must be positive.");
  if (typeof value.kind !== "string" || !FRAME_KIND_SET.has(value.kind)) addIssue(issues, `${path}.kind`, "Unknown frame kind.");
  if (typeof value.status !== "string" || !FRAME_STATUS_SET.has(value.status)) {
    addIssue(issues, `${path}.status`, "Unknown frame status.");
  }
  const isTop = index === frameCount - 1;
  if (isTop && value.status === "suspended") addIssue(issues, `${path}.status`, "The top frame cannot be suspended.");
  if (!isTop && value.status !== "suspended") addIssue(issues, `${path}.status`, "Every non-top frame must be suspended.");
  if (!isRecord(value.payload)) addIssue(issues, `${path}.payload`, "Frame payload must be a JSON object.");
  validateContinuation(value.continuation, `${path}.continuation`, issues);

  const request = value.decisionRequest;
  const result = value.decisionResult;
  if (value.status === "waiting") {
    validateDecisionRequest(request, `${path}.decisionRequest`, issues);
    if (result !== null) addIssue(issues, `${path}.decisionResult`, "A waiting frame cannot have a decision result.");
  } else if (value.status === "ready") {
    if (request !== null) addIssue(issues, `${path}.decisionRequest`, "A ready frame cannot still expose a request.");
    validateDecisionResolution(result, `${path}.decisionResult`, issues, stackStateVersion);
  } else if (request !== null || result !== null) {
    addIssue(issues, path, "Only waiting/ready frames may hold decision state.");
  }
  if (isRecord(request) && request.frameId !== value.frameId) {
    addIssue(issues, `${path}.decisionRequest.frameId`, "Decision request does not belong to this frame.");
  }
  if (isRecord(result) && isRecord(result.request) && result.request.frameId !== value.frameId) {
    addIssue(issues, `${path}.decisionResult.request.frameId`, "Decision result does not belong to this frame.");
  }
  if (isRecord(request) && isSafeInteger(stackStateVersion) && isSafeInteger(request.issuedAtStateVersion)) {
    if (request.issuedAtStateVersion > stackStateVersion) {
      addIssue(issues, `${path}.decisionRequest.issuedAtStateVersion`, "Decision request was issued in a future state.");
    }
  }

  if (value.kind === "phase") {
    validatePhaseInstance(value.phase, value.frameId, `${path}.phase`, stackStateVersion, issues);
    if (
      isRecord(value.phase) &&
      (value.status === "suspended" || value.status === "waiting" || value.status === "ready") &&
      value.phase.lifecycle !== "begun"
    ) {
      addIssue(issues, `${path}.phase.lifecycle`, "Only a begun phase may suspend or wait for nested resolution.");
    }
  } else if ("phase" in value) {
    addIssue(issues, `${path}.phase`, "Only phase frames may contain a phase instance.");
  }
}

function validateTurnEntry(
  value: unknown,
  path: string,
  stackStateVersion: unknown,
  issues: ResolutionValidationIssue[],
): void {
  if (!isRecord(value)) {
    addIssue(issues, path, "Turn entry must be an object.");
    return;
  }
  if (!isSafeInteger(value.turnId, 1)) addIssue(issues, `${path}.turnId`, "Turn ID must be positive.");
  if (!isNonEmptyString(value.playerId)) addIssue(issues, `${path}.playerId`, "Turn player ID is required.");
  if (value.kind !== "normal" && value.kind !== "extra") addIssue(issues, `${path}.kind`, "Unknown turn kind.");
  if (value.grantedByTurnId !== null && !isSafeInteger(value.grantedByTurnId, 1)) {
    addIssue(issues, `${path}.grantedByTurnId`, "Granting turn ID must be positive or null.");
  }
  if (value.kind === "normal" && value.grantedByTurnId !== null) {
    addIssue(issues, `${path}.grantedByTurnId`, "A normal turn cannot be granted by another turn.");
  }
  validateContinuation(value.reason, `${path}.reason`, issues);
  if (!isSafeInteger(value.queuedAtStateVersion, 1)) {
    addIssue(issues, `${path}.queuedAtStateVersion`, "Queue state version must be positive.");
  } else if (isSafeInteger(stackStateVersion) && value.queuedAtStateVersion > stackStateVersion) {
    addIssue(issues, `${path}.queuedAtStateVersion`, "Turn was queued in a future state.");
  }
}

function canonicalizeJson(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((entry) => canonicalizeJson(entry));
  const sorted: JsonObject = {};
  for (const key of Object.keys(value).sort()) sorted[key] = canonicalizeJson(value[key]!);
  return sorted;
}

function sameJson(left: unknown, right: unknown): boolean {
  const leftIssues: ResolutionValidationIssue[] = [];
  const rightIssues: ResolutionValidationIssue[] = [];
  collectJsonIssues(left, "$left", [], leftIssues);
  collectJsonIssues(right, "$right", [], rightIssues);
  if (leftIssues.length > 0 || rightIssues.length > 0) return false;
  return JSON.stringify(canonicalizeJson(left as JsonValue)) === JSON.stringify(canonicalizeJson(right as JsonValue));
}

export function validateResolutionStack(value: unknown): ResolutionValidationResult {
  const issues: ResolutionValidationIssue[] = [];
  collectJsonIssues(value, "$", [], issues);
  if (!isRecord(value)) {
    addIssue(issues, "$", "Resolution stack must be an object.");
    return { valid: false, issues };
  }

  if (value.version !== 1) addIssue(issues, "$.version", "Unsupported resolution stack version.");
  if (!isSafeInteger(value.stateVersion)) addIssue(issues, "$.stateVersion", "State version must be nonnegative.");
  if (!isSafeInteger(value.nextFrameId, 1)) addIssue(issues, "$.nextFrameId", "Next frame ID must be positive.");
  if (!isSafeInteger(value.nextDecisionId, 1)) addIssue(issues, "$.nextDecisionId", "Next decision ID must be positive.");
  if (!isSafeInteger(value.nextActionId, 1)) addIssue(issues, "$.nextActionId", "Next action ID must be positive.");

  const frames = Array.isArray(value.frames) ? value.frames : [];
  if (!Array.isArray(value.frames)) addIssue(issues, "$.frames", "Frames must be an array.");
  frames.forEach((frame, index) => validateFrame(frame, index, frames.length, value.stateVersion, issues));

  const frameIds = frames.flatMap((frame) => isRecord(frame) && isSafeInteger(frame.frameId, 1) ? [frame.frameId] : []);
  if (new Set(frameIds).size !== frameIds.length) addIssue(issues, "$.frames", "Frame IDs must be unique.");
  for (let index = 1; index < frameIds.length; index += 1) {
    if (frameIds[index]! <= frameIds[index - 1]!) {
      addIssue(issues, "$.frames", "Nested frame IDs must be strictly increasing.");
      break;
    }
  }
  const nextFrameId = value.nextFrameId;
  if (isSafeInteger(nextFrameId, 1) && frameIds.some((frameId) => frameId >= nextFrameId)) {
    addIssue(issues, "$.nextFrameId", "Next frame ID must be greater than every live frame ID.");
  }

  const phaseFrames = frames.filter((frame) => isRecord(frame) && frame.kind === "phase");
  if (phaseFrames.length > 1) addIssue(issues, "$.frames", "Only one phase instance may be live at a time.");

  const consumed = Array.isArray(value.consumedActions) ? value.consumedActions : [];
  if (!Array.isArray(value.consumedActions)) addIssue(issues, "$.consumedActions", "Consumed actions must be an array.");
  consumed.forEach((resolution, index) =>
    validateDecisionResolution(resolution, `$.consumedActions[${index}]`, issues, value.stateVersion)
  );
  const consumedActionIds = consumed.flatMap((resolution) =>
    isRecord(resolution) && isRecord(resolution.action) && isSafeInteger(resolution.action.actionId, 1)
      ? [resolution.action.actionId]
      : []
  );
  for (let index = 0; index < consumedActionIds.length; index += 1) {
    if (consumedActionIds[index] !== index + 1) {
      addIssue(issues, "$.consumedActions", "Consumed action IDs must be contiguous and monotonic.");
      break;
    }
  }
  const acceptedVersions = consumed.flatMap((resolution) =>
    isRecord(resolution) && isSafeInteger(resolution.acceptedAtStateVersion, 1)
      ? [resolution.acceptedAtStateVersion]
      : []
  );
  for (let index = 1; index < acceptedVersions.length; index += 1) {
    if (acceptedVersions[index]! <= acceptedVersions[index - 1]!) {
      addIssue(issues, "$.consumedActions", "Accepted action state versions must be strictly increasing.");
      break;
    }
  }
  if (isSafeInteger(value.nextActionId, 1) && value.nextActionId !== consumed.length + 1) {
    addIssue(issues, "$.nextActionId", "Next action ID must follow the consumed action ledger.");
  }
  const consumedRequestIds = consumed.flatMap((resolution) =>
    isRecord(resolution) && isRecord(resolution.request) && isSafeInteger(resolution.request.requestId, 1)
      ? [resolution.request.requestId]
      : []
  );
  if (new Set(consumedRequestIds).size !== consumedRequestIds.length) {
    addIssue(issues, "$.consumedActions", "A decision request may only be consumed once.");
  }

  const top = frames.at(-1);
  const liveRequestId = isRecord(top) && isRecord(top.decisionRequest) && isSafeInteger(top.decisionRequest.requestId, 1)
    ? top.decisionRequest.requestId
    : isRecord(top) && isRecord(top.decisionResult) && isRecord(top.decisionResult.request) && isSafeInteger(top.decisionResult.request.requestId, 1)
      ? top.decisionResult.request.requestId
      : null;
  const knownRequestIds = [...consumedRequestIds, ...(liveRequestId === null ? [] : [liveRequestId])];
  const nextDecisionId = value.nextDecisionId;
  if (isSafeInteger(nextDecisionId, 1) && knownRequestIds.some((requestId) => requestId >= nextDecisionId)) {
    addIssue(issues, "$.nextDecisionId", "Next decision ID must exceed every issued request ID.");
  }
  if (isRecord(top) && top.status === "ready" && isRecord(top.decisionResult)) {
    const action = top.decisionResult.action;
    const ledgerEntry = consumed.find((entry) =>
      isRecord(entry) && isRecord(entry.action) && isRecord(action) && entry.action.actionId === action.actionId
    );
    if (!ledgerEntry || !sameJson(ledgerEntry, top.decisionResult)) {
      addIssue(issues, "$.frames", "A ready decision must match the consumed action ledger.");
    }
  }
  if (
    isRecord(top) &&
    top.status === "waiting" &&
    isRecord(top.decisionRequest) &&
    top.decisionRequest.issuedAtStateVersion !== value.stateVersion
  ) {
    addIssue(issues, "$.frames", "A waiting decision must be the latest state transition.");
  }
  if (
    isRecord(top) &&
    top.status === "ready" &&
    isRecord(top.decisionResult) &&
    top.decisionResult.acceptedAtStateVersion !== value.stateVersion
  ) {
    addIssue(issues, "$.frames", "A consumed decision must be resumed before any later state transition.");
  }

  if (!isRecord(value.turnQueue)) {
    addIssue(issues, "$.turnQueue", "Turn queue must be an object.");
  } else {
    const queue = value.turnQueue;
    if (!isSafeInteger(queue.nextTurnId, 1)) addIssue(issues, "$.turnQueue.nextTurnId", "Next turn ID must be positive.");
    if (queue.current !== null) validateTurnEntry(queue.current, "$.turnQueue.current", value.stateVersion, issues);
    const pending = Array.isArray(queue.pending) ? queue.pending : [];
    if (!Array.isArray(queue.pending)) addIssue(issues, "$.turnQueue.pending", "Pending turns must be an array.");
    pending.forEach((turn, index) => validateTurnEntry(turn, `$.turnQueue.pending[${index}]`, value.stateVersion, issues));
    const entries = [...(queue.current === null ? [] : [queue.current]), ...pending];
    const turnIds = entries.flatMap((entry) => isRecord(entry) && isSafeInteger(entry.turnId, 1) ? [entry.turnId] : []);
    if (new Set(turnIds).size !== turnIds.length) addIssue(issues, "$.turnQueue", "Turn IDs must be unique.");
    const nextTurnId = queue.nextTurnId;
    if (isSafeInteger(nextTurnId, 1) && turnIds.some((turnId) => turnId >= nextTurnId)) {
      addIssue(issues, "$.turnQueue.nextTurnId", "Next turn ID must exceed every queued/current turn ID.");
    }
    if (phaseFrames.length === 1) {
      const phaseFrame = phaseFrames[0];
      const current = queue.current;
      if (!isRecord(current)) {
        addIssue(issues, "$.turnQueue.current", "A live phase requires an active turn.");
      } else if (isRecord(phaseFrame) && isRecord(phaseFrame.phase)) {
        if (phaseFrame.phase.turnId !== current.turnId || phaseFrame.phase.playerId !== current.playerId) {
          addIssue(issues, "$.frames", "Phase instance does not belong to the active turn.");
        }
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

export function assertResolutionStack(value: unknown): asserts value is ResolutionStack {
  const result = validateResolutionStack(value);
  if (!result.valid) {
    const detail = result.issues.slice(0, 8).map((issue) => `${issue.path}: ${issue.message}`).join("; ");
    throw new ResolutionError("INVALID_STACK", detail);
  }
}

function cloneJson<T>(value: T): T {
  const issues: ResolutionValidationIssue[] = [];
  collectJsonIssues(value, "$", [], issues);
  if (issues.length > 0) {
    throw new ResolutionError("INVALID_ARGUMENT", issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function cloneResolutionStack(stack: ResolutionStack): ResolutionStack {
  assertResolutionStack(stack);
  const cloned = cloneJson(stack);
  assertResolutionStack(cloned);
  return cloned;
}

export function serializeResolutionStack(stack: ResolutionStack): string {
  assertResolutionStack(stack);
  return JSON.stringify(stack);
}

export function deserializeResolutionStack(serialized: string): ResolutionStack {
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    throw new ResolutionError("INVALID_STACK", "Resolution snapshot is not valid JSON.");
  }
  assertResolutionStack(value);
  return cloneJson(value);
}

export function restoreResolutionStack(value: unknown): ResolutionStack {
  assertResolutionStack(value);
  return cloneJson(value);
}

/** Validates and clones an arbitrary domain record for use as frame payload. */
export function cloneJsonObject(value: unknown): JsonObject {
  if (!isRecord(value)) operationError("INVALID_ARGUMENT", "Frame payload must be a plain JSON object.");
  return cloneJson(value) as JsonObject;
}

export function createResolutionStack(): ResolutionStack {
  return {
    version: 1,
    stateVersion: 0,
    nextFrameId: 1,
    nextDecisionId: 1,
    nextActionId: 1,
    frames: [],
    consumedActions: [],
    turnQueue: { nextTurnId: 1, current: null, pending: [] },
  };
}

function operationError(code: ResolutionErrorCode, message: string): never {
  throw new ResolutionError(code, message);
}

function checkedDraft(stack: ResolutionStack): ResolutionStack {
  return cloneResolutionStack(stack);
}

function increment(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value >= Number.MAX_SAFE_INTEGER) {
    operationError("INVALID_STACK", `${label} exhausted its safe integer range.`);
  }
  return value + 1;
}

function finalize(draft: ResolutionStack): ResolutionStack {
  draft.stateVersion = increment(draft.stateVersion, "State version");
  assertResolutionStack(draft);
  return draft;
}

function topFrame(draft: ResolutionStack): ResolutionFrame | undefined {
  return draft.frames.at(-1);
}

function requireTop(draft: ResolutionStack, expectedFrameId: number): ResolutionFrame {
  const top = topFrame(draft);
  if (!top) operationError("EMPTY_STACK", "The resolution stack is empty.");
  if (top.frameId !== expectedFrameId) {
    operationError("FRAME_NOT_TOP", `Frame ${expectedFrameId} is not the current stack top.`);
  }
  return top;
}

function requireActiveTop(draft: ResolutionStack, expectedFrameId: number): ResolutionFrame {
  const top = requireTop(draft, expectedFrameId);
  if (top.status === "waiting" || top.status === "ready") {
    operationError("FRAME_HAS_PENDING_DECISION", `Frame ${expectedFrameId} must consume and resume its decision first.`);
  }
  if (top.status !== "active") operationError("FRAME_NOT_ACTIVE", `Frame ${expectedFrameId} is not active.`);
  return top;
}

function assertResolvablePhase(frame: ResolutionFrame): void {
  if (frame.kind !== "phase") return;
  if (frame.phase.lifecycle === "created") operationError("PHASE_NOT_BEGUN", "The phase has not begun.");
  if (frame.phase.lifecycle === "ended") operationError("PHASE_ALREADY_ENDED", "The phase has already ended.");
}

function assertNoDecisionBarrier(draft: ResolutionStack): void {
  const current = topFrame(draft);
  if (current?.status === "waiting" || current?.status === "ready") {
    operationError(
      "FRAME_HAS_PENDING_DECISION",
      "No other state transition may pass an unresolved decision barrier.",
    );
  }
}

function normalizeContinuation(value: SerializedContinuation | null | undefined): SerializedContinuation | null {
  if (value === undefined || value === null) return null;
  if (!isNonEmptyString(value.type) || !isRecord(value.data)) {
    operationError("INVALID_ARGUMENT", "Continuation requires a nonempty type and JSON object data.");
  }
  return cloneJson(value);
}

function normalizePayload(value: JsonObject | undefined): JsonObject {
  if (value === undefined) return {};
  if (!isRecord(value)) operationError("INVALID_ARGUMENT", "Payload must be a JSON object.");
  return cloneJson(value);
}

function applyFrameDataUpdate(frame: ResolutionFrame, update: FrameDataUpdate): void {
  if (update.payload !== undefined) frame.payload = normalizePayload(update.payload);
  if (update.continuation !== undefined) frame.continuation = normalizeContinuation(update.continuation);
}

function hasFrameDataUpdate(update: FrameDataUpdate): boolean {
  return update.payload !== undefined || update.continuation !== undefined;
}

function buildFrame(frameId: number, spec: ResolutionFrameSpec): ResolutionFrame {
  if (!FRAME_KIND_SET.has(spec.kind)) operationError("INVALID_ARGUMENT", `Unknown frame kind ${String(spec.kind)}.`);
  const base = {
    frameId,
    status: "active" as const,
    continuation: normalizeContinuation(spec.continuation),
    payload: normalizePayload(spec.payload),
    decisionRequest: null,
    decisionResult: null,
  };
  if (spec.kind !== "phase") return { ...base, kind: spec.kind };
  if (!isSafeInteger(spec.phase.turnId, 1) || !isNonEmptyString(spec.phase.playerId) || !isNonEmptyString(spec.phase.name)) {
    operationError("INVALID_ARGUMENT", "Phase frames require a valid turn, player, and name.");
  }
  return {
    ...base,
    kind: "phase",
    phase: {
      instanceId: frameId,
      turnId: spec.phase.turnId,
      playerId: spec.phase.playerId,
      name: spec.phase.name,
      lifecycle: "created",
      beganAtStateVersion: null,
      endedAtStateVersion: null,
    },
  };
}

function assertPhaseSpecMatchesCurrentTurn(draft: ResolutionStack, spec: ResolutionFrameSpec): void {
  if (spec.kind !== "phase") return;
  if (draft.frames.some((frame) => frame.kind === "phase")) {
    operationError("INVALID_ARGUMENT", "Only one phase instance may be live at a time.");
  }
  const current = draft.turnQueue.current;
  if (!current || current.turnId !== spec.phase.turnId || current.playerId !== spec.phase.playerId) {
    operationError("TURN_MISMATCH", "Phase spec does not match the active turn.");
  }
}

export function pushFrame(
  stack: ResolutionStack,
  expectedParentFrameId: number | null,
  spec: ResolutionFrameSpec,
): StackFrameTransition {
  const draft = checkedDraft(stack);
  const parent = topFrame(draft);
  if (!parent) {
    if (expectedParentFrameId !== null) operationError("FRAME_NOT_TOP", "An empty stack has no expected parent frame.");
  } else {
    if (expectedParentFrameId === null || parent.frameId !== expectedParentFrameId) {
      operationError("FRAME_NOT_TOP", `Frame ${String(expectedParentFrameId)} is not the current parent.`);
    }
    requireActiveTop(draft, parent.frameId);
    assertResolvablePhase(parent);
  }
  assertPhaseSpecMatchesCurrentTurn(draft, spec);
  const frameId = draft.nextFrameId;
  draft.nextFrameId = increment(draft.nextFrameId, "Frame ID");
  const frame = buildFrame(frameId, spec);
  if (parent) parent.status = "suspended";
  draft.frames.push(frame);
  const committed = finalize(draft);
  return { stack: committed, frame: cloneJson(committed.frames.at(-1)!) };
}

export function replaceTopFrame(
  stack: ResolutionStack,
  expectedFrameId: number,
  spec: ResolutionFrameSpec,
): StackFrameTransition {
  const draft = checkedDraft(stack);
  const current = requireActiveTop(draft, expectedFrameId);
  if (current.kind === "phase" && current.phase.lifecycle !== "ended") {
    operationError("PHASE_NOT_ENDED", "A phase frame must end before it is replaced.");
  }
  draft.frames.pop();
  assertPhaseSpecMatchesCurrentTurn(draft, spec);
  const frameId = draft.nextFrameId;
  draft.nextFrameId = increment(draft.nextFrameId, "Frame ID");
  const replacement = buildFrame(frameId, spec);
  draft.frames.push(replacement);
  const committed = finalize(draft);
  return { stack: committed, frame: cloneJson(committed.frames.at(-1)!) };
}

export function popFrame(stack: ResolutionStack, expectedFrameId: number): StackFrameTransition {
  const draft = checkedDraft(stack);
  const current = requireActiveTop(draft, expectedFrameId);
  if (current.kind === "phase" && current.phase.lifecycle !== "ended") {
    operationError("PHASE_NOT_ENDED", "A phase frame must end before it is popped.");
  }
  const popped = draft.frames.pop();
  if (!popped) operationError("EMPTY_STACK", "The resolution stack is empty.");
  const parent = topFrame(draft);
  if (parent) {
    if (parent.status !== "suspended") operationError("INVALID_STACK", "The parent frame is not suspended.");
    parent.status = "active";
  }
  return { stack: finalize(draft), frame: cloneJson(popped) };
}

/**
 * Atomically replaces a frame's JSON payload/continuation and advances the
 * global state version. Domain modules use this to commit a judgment, damage,
 * move, or card-use stage without mutating ResolutionStack directly.
 */
export function updateTopFrameData(
  stack: ResolutionStack,
  expectedFrameId: number,
  update: FrameDataUpdate,
): StackFrameTransition {
  const draft = checkedDraft(stack);
  const current = requireActiveTop(draft, expectedFrameId);
  if (!hasFrameDataUpdate(update)) operationError("INVALID_ARGUMENT", "Frame update contains no data.");
  if (current.kind === "phase" && current.phase.lifecycle === "ended") {
    operationError("PHASE_ALREADY_ENDED", "An ended phase frame cannot be updated.");
  }
  applyFrameDataUpdate(current, update);
  const committed = finalize(draft);
  return { stack: committed, frame: cloneJson(committed.frames.at(-1)!) };
}

export function waitForDecision(
  stack: ResolutionStack,
  spec: DecisionRequestSpec,
): DecisionRequestTransition {
  const draft = checkedDraft(stack);
  const current = requireActiveTop(draft, spec.frameId);
  assertResolvablePhase(current);
  if (!isNonEmptyString(spec.actorId) || !isNonEmptyString(spec.kind)) {
    operationError("INVALID_ARGUMENT", "Decision requests require an actor and kind.");
  }
  const issuedAtStateVersion = increment(draft.stateVersion, "State version");
  const request: DecisionRequest = {
    requestId: draft.nextDecisionId,
    frameId: current.frameId,
    actorId: spec.actorId,
    kind: spec.kind,
    canPass: spec.canPass ?? false,
    issuedAtStateVersion,
    payload: normalizePayload(spec.payload),
  };
  draft.nextDecisionId = increment(draft.nextDecisionId, "Decision ID");
  current.status = "waiting";
  current.decisionRequest = request;
  const committed = finalize(draft);
  return { stack: committed, request: cloneJson(request) };
}

function assertActionShape(action: DecisionAction): void {
  const issues: ResolutionValidationIssue[] = [];
  collectJsonIssues(action, "$action", [], issues);
  validateDecisionAction(action, "$action", issues);
  if (issues.length > 0) {
    operationError("INVALID_ARGUMENT", issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
  }
}

export function consumeDecision(
  stack: ResolutionStack,
  action: DecisionAction,
): DecisionConsumeResult {
  assertResolutionStack(stack);
  assertActionShape(action);
  const existing = stack.consumedActions.find((entry) => entry.action.actionId === action.actionId);
  if (existing) {
    if (!sameJson(existing.action, action)) {
      operationError("ACTION_ID_REUSED", `Action ID ${action.actionId} was already used with different content.`);
    }
    return { kind: "duplicate", stack, resolution: cloneJson(existing) };
  }
  if (action.actionId !== stack.nextActionId) {
    operationError("ACTION_OUT_OF_SEQUENCE", `Expected action ${stack.nextActionId}, received ${action.actionId}.`);
  }

  const draft = checkedDraft(stack);
  const current = topFrame(draft);
  if (!current || current.status !== "waiting" || !current.decisionRequest) {
    operationError("NO_PENDING_DECISION", "The stack top is not waiting for a decision.");
  }
  const request = current.decisionRequest;
  if (action.frameId !== current.frameId) operationError("FRAME_NOT_TOP", "Action does not target the stack top frame.");
  if (action.requestId !== request.requestId) operationError("STALE_DECISION", "Action targets an expired decision request.");
  if (action.actorId !== request.actorId) operationError("WRONG_ACTOR", "Action actor does not own this decision.");
  if (action.expectedStateVersion !== request.issuedAtStateVersion || action.expectedStateVersion !== draft.stateVersion) {
    operationError("STALE_STATE", "Action was created for a stale state version.");
  }
  const acceptedAtStateVersion = increment(draft.stateVersion, "State version");
  const resolution: DecisionResolution = {
    request: cloneJson(request),
    action: cloneJson(action),
    acceptedAtStateVersion,
  };
  current.status = "ready";
  current.decisionRequest = null;
  current.decisionResult = resolution;
  draft.consumedActions.push(cloneJson(resolution));
  draft.nextActionId = increment(draft.nextActionId, "Action ID");
  const committed = finalize(draft);
  return { kind: "accepted", stack: committed, resolution: cloneJson(resolution) };
}

export function resumeTopFrame(
  stack: ResolutionStack,
  expectedFrameId: number,
  expectedRequestId: number,
  update?: FrameDataUpdate,
): DecisionResumeTransition {
  const draft = checkedDraft(stack);
  const current = requireTop(draft, expectedFrameId);
  if (current.status !== "ready" || !current.decisionResult) {
    operationError("DECISION_NOT_READY", `Frame ${expectedFrameId} has no consumed decision to resume.`);
  }
  if (current.decisionResult.request.requestId !== expectedRequestId) {
    operationError("STALE_DECISION", "Resume targets an expired decision request.");
  }
  const resolution = cloneJson(current.decisionResult);
  current.status = "active";
  current.decisionResult = null;
  if (update) applyFrameDataUpdate(current, update);
  return { stack: finalize(draft), resolution };
}

export function beginPhaseInstance(stack: ResolutionStack, expectedFrameId: number): ResolutionStack {
  const draft = checkedDraft(stack);
  const current = requireActiveTop(draft, expectedFrameId);
  if (current.kind !== "phase") operationError("INVALID_ARGUMENT", "The selected frame is not a phase frame.");
  if (current.phase.lifecycle === "begun") operationError("PHASE_ALREADY_BEGUN", "Phase begin was already emitted.");
  if (current.phase.lifecycle === "ended") operationError("PHASE_ALREADY_ENDED", "Ended phases cannot begin again.");
  const version = increment(draft.stateVersion, "State version");
  current.phase.lifecycle = "begun";
  current.phase.beganAtStateVersion = version;
  return finalize(draft);
}

export function endPhaseInstance(stack: ResolutionStack, expectedFrameId: number): ResolutionStack {
  const draft = checkedDraft(stack);
  const current = requireActiveTop(draft, expectedFrameId);
  if (current.kind !== "phase") operationError("INVALID_ARGUMENT", "The selected frame is not a phase frame.");
  if (current.phase.lifecycle === "created") operationError("PHASE_NOT_BEGUN", "A phase cannot end before it begins.");
  if (current.phase.lifecycle === "ended") operationError("PHASE_ALREADY_ENDED", "Phase end was already emitted.");
  const version = increment(draft.stateVersion, "State version");
  current.phase.lifecycle = "ended";
  current.phase.endedAtStateVersion = version;
  return finalize(draft);
}

function defaultTurnReason(kind: TurnKind): SerializedContinuation {
  return { type: kind === "normal" ? "seat_order" : "extra_turn", data: {} };
}

export function enqueueTurn(stack: ResolutionStack, spec: TurnEntrySpec): TurnTransition {
  const draft = checkedDraft(stack);
  assertNoDecisionBarrier(draft);
  if (!isNonEmptyString(spec.playerId)) operationError("INVALID_ARGUMENT", "Turn player ID is required.");
  if (spec.kind !== "normal" && spec.kind !== "extra") operationError("INVALID_ARGUMENT", "Unknown turn kind.");
  const grantedByTurnId = spec.kind === "normal"
    ? null
    : spec.grantedByTurnId === undefined
      ? draft.turnQueue.current?.turnId ?? null
      : spec.grantedByTurnId;
  if (spec.kind === "extra" && grantedByTurnId !== null && !isSafeInteger(grantedByTurnId, 1)) {
    operationError("INVALID_ARGUMENT", "Granting turn ID must be positive or null.");
  }
  const queuedAtStateVersion = increment(draft.stateVersion, "State version");
  const turn: TurnEntry = {
    turnId: draft.turnQueue.nextTurnId,
    playerId: spec.playerId,
    kind: spec.kind,
    grantedByTurnId,
    reason: normalizeContinuation(spec.reason ?? defaultTurnReason(spec.kind))!,
    queuedAtStateVersion,
  };
  draft.turnQueue.nextTurnId = increment(draft.turnQueue.nextTurnId, "Turn ID");
  if (turn.kind === "normal") {
    draft.turnQueue.pending.push(turn);
  } else {
    const insertionIndex = draft.turnQueue.pending.findIndex((entry) => entry.kind === "normal");
    if (insertionIndex < 0) draft.turnQueue.pending.push(turn);
    else draft.turnQueue.pending.splice(insertionIndex, 0, turn);
  }
  const committed = finalize(draft);
  const stored = committed.turnQueue.pending.find((entry) => entry.turnId === turn.turnId)!;
  return { stack: committed, turn: cloneJson(stored) };
}

export function startNextTurn(stack: ResolutionStack): TurnTransition {
  const draft = checkedDraft(stack);
  if (draft.frames.length > 0) operationError("RESOLUTION_IN_PROGRESS", "Cannot start a turn while resolution frames are live.");
  if (draft.turnQueue.current) operationError("TURN_ALREADY_ACTIVE", "A turn is already active.");
  const turn = draft.turnQueue.pending.shift();
  if (!turn) operationError("NO_QUEUED_TURN", "There is no queued turn to start.");
  draft.turnQueue.current = turn;
  return { stack: finalize(draft), turn: cloneJson(turn) };
}

export function finishCurrentTurn(stack: ResolutionStack, expectedTurnId: number): TurnTransition {
  const draft = checkedDraft(stack);
  if (draft.frames.length > 0) operationError("RESOLUTION_IN_PROGRESS", "Cannot finish a turn while resolution frames are live.");
  const current = draft.turnQueue.current;
  if (!current) operationError("NO_ACTIVE_TURN", "There is no active turn to finish.");
  if (current.turnId !== expectedTurnId) operationError("TURN_MISMATCH", "The requested turn is not active.");
  draft.turnQueue.current = null;
  return { stack: finalize(draft), turn: cloneJson(current) };
}
