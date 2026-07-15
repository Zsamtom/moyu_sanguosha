import type { PlayerId } from "../types.js";
import {
  cloneJsonObject,
  type JsonObject,
  type SerializedContinuation,
  type TurnEntry,
} from "./resolution.js";

/** Persisted orientation for one player. Games begin with every player face up. */
export interface PlayerPostureState {
  readonly playerId: PlayerId;
  faceUp: boolean;
}

export type TurnOverCause = "explicit" | "face_down_turn_start" | "legacy_migration";

/**
 * Immutable audit fact emitted whenever a player is turned over. The reason is
 * JSON data rather than a callback so an interrupted game can resume safely.
 */
export interface TurnOverEvent {
  readonly eventId: number;
  readonly operationId: number;
  readonly type: "turn_over";
  readonly cause: TurnOverCause;
  readonly playerId: PlayerId;
  readonly faceUpBefore: boolean;
  readonly faceUpAfter: boolean;
  readonly turnId: number | null;
  readonly reason: SerializedContinuation;
}

export type TurnStartDisposition = "start_turn" | "skip_entire_turn";

/** One exact TurnEntry may be prepared at most once, even after restoration. */
export interface ConsumedTurnEntry {
  readonly operationId: number;
  readonly turn: TurnEntry;
  readonly disposition: TurnStartDisposition;
  readonly turnOverEventId: number | null;
}

export interface PostureEngineState {
  readonly version: 1;
  nextEventId: number;
  nextOperationId: number;
  players: PlayerPostureState[];
  events: TurnOverEvent[];
  consumedTurns: ConsumedTurnEntry[];
}

/** Explicitly supported predecessor: orientation only, without replay guards. */
export interface LegacyPostureSnapshotV0 {
  readonly version: 0;
  readonly players: readonly {
    readonly playerId: PlayerId;
    readonly faceUp: boolean;
  }[];
}

export type PostureErrorCode =
  | "INVALID_STATE"
  | "INVALID_ARGUMENT"
  | "UNKNOWN_PLAYER"
  | "TURN_ALREADY_CONSUMED"
  | "COUNTER_EXHAUSTED"
  | "UNSUPPORTED_SNAPSHOT";

export class PostureError extends Error {
  readonly code: PostureErrorCode;

  constructor(code: PostureErrorCode, message: string) {
    super(message);
    this.name = "PostureError";
    this.code = code;
  }
}

export interface TurnOverTransition {
  readonly state: PostureEngineState;
  readonly event: TurnOverEvent;
}

export interface TurnStartPostureTransition {
  readonly state: PostureEngineState;
  readonly turn: TurnEntry;
  readonly disposition: TurnStartDisposition;
  readonly turnOverEvent: TurnOverEvent | null;
}

const TURN_OVER_CAUSES = new Set<string>([
  "explicit",
  "face_down_turn_start",
  "legacy_migration",
]);
const TURN_DISPOSITIONS = new Set<string>(["start_turn", "skip_entire_turn"]);

function fail(code: PostureErrorCode, message: string): never {
  throw new PostureError(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function assertJsonRecord(value: unknown, label: string): void {
  try {
    cloneJsonObject(value);
  } catch (error) {
    fail("INVALID_STATE", `${label} must contain only plain JSON data: ${error instanceof Error ? error.message : "invalid JSON"}`);
  }
}

function cloneReason(value: unknown, errorCode: PostureErrorCode = "INVALID_ARGUMENT"): SerializedContinuation {
  if (!isRecord(value) || !isNonemptyString(value.type) || !isRecord(value.data)) {
    fail(errorCode, "posture reason requires a nonempty type and JSON-object data");
  }
  let data: JsonObject;
  try {
    data = cloneJsonObject(value.data);
  } catch (error) {
    fail(errorCode, `posture reason is not JSON-safe: ${error instanceof Error ? error.message : "invalid JSON"}`);
  }
  return { type: value.type, data };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function cloneTurnEntry(value: unknown, errorCode: PostureErrorCode = "INVALID_ARGUMENT"): TurnEntry {
  if (!isRecord(value)) fail(errorCode, "TurnEntry must be a plain object");
  if (!isPositiveSafeInteger(value.turnId)) fail(errorCode, "TurnEntry turnId must be positive");
  if (!isNonemptyString(value.playerId)) fail(errorCode, "TurnEntry playerId is required");
  if (value.kind !== "normal" && value.kind !== "extra") fail(errorCode, "TurnEntry kind must be normal or extra");
  if (value.grantedByTurnId !== null && !isPositiveSafeInteger(value.grantedByTurnId)) {
    fail(errorCode, "TurnEntry grantedByTurnId must be positive or null");
  }
  if (value.kind === "normal" && value.grantedByTurnId !== null) {
    fail(errorCode, "a normal TurnEntry cannot be granted by another turn");
  }
  if (!isPositiveSafeInteger(value.queuedAtStateVersion)) {
    fail(errorCode, "TurnEntry queuedAtStateVersion must be positive");
  }
  const reason = cloneReason(value.reason, errorCode);
  return {
    turnId: value.turnId,
    playerId: value.playerId,
    kind: value.kind,
    grantedByTurnId: value.grantedByTurnId,
    reason,
    queuedAtStateVersion: value.queuedAtStateVersion,
  };
}

function cloneEvent(event: TurnOverEvent): TurnOverEvent {
  return { ...event, reason: cloneReason(event.reason, "INVALID_STATE") };
}

function cloneConsumption(consumption: ConsumedTurnEntry): ConsumedTurnEntry {
  return {
    ...consumption,
    turn: cloneTurnEntry(consumption.turn, "INVALID_STATE"),
  };
}

function allocateOperationId(state: PostureEngineState): number {
  if (!isPositiveSafeInteger(state.nextOperationId) || state.nextOperationId >= Number.MAX_SAFE_INTEGER) {
    fail("COUNTER_EXHAUSTED", "posture operation counter exhausted its safe integer range");
  }
  const id = state.nextOperationId;
  state.nextOperationId += 1;
  return id;
}

function allocateEventId(state: PostureEngineState): number {
  if (!isPositiveSafeInteger(state.nextEventId) || state.nextEventId >= Number.MAX_SAFE_INTEGER) {
    fail("COUNTER_EXHAUSTED", "turn-over event counter exhausted its safe integer range");
  }
  const id = state.nextEventId;
  state.nextEventId += 1;
  return id;
}

function requirePlayer(state: PostureEngineState, playerId: PlayerId): PlayerPostureState {
  const player = state.players.find((candidate) => candidate.playerId === playerId);
  if (!player) fail("UNKNOWN_PLAYER", `unknown posture player: ${playerId}`);
  return player;
}

function appendTurnOverEvent(
  state: PostureEngineState,
  input: {
    readonly operationId: number;
    readonly playerId: PlayerId;
    readonly cause: TurnOverCause;
    readonly turnId: number | null;
    readonly reason: SerializedContinuation;
  },
): TurnOverEvent {
  const player = requirePlayer(state, input.playerId);
  const event: TurnOverEvent = {
    eventId: allocateEventId(state),
    operationId: input.operationId,
    type: "turn_over",
    cause: input.cause,
    playerId: input.playerId,
    faceUpBefore: player.faceUp,
    faceUpAfter: !player.faceUp,
    turnId: input.turnId,
    reason: cloneReason(input.reason),
  };
  player.faceUp = event.faceUpAfter;
  state.events.push(event);
  return event;
}

function automaticTurnOverReason(turn: TurnEntry): SerializedContinuation {
  return {
    type: "posture.face_down_turn_start",
    data: {
      turnId: turn.turnId,
      turnKind: turn.kind,
      turnReason: {
        type: turn.reason.type,
        data: cloneJsonObject(turn.reason.data),
      },
    },
  };
}

function assertAutomaticEventMatches(event: TurnOverEvent, consumption: ConsumedTurnEntry): void {
  const turn = consumption.turn;
  if (
    event.cause !== "face_down_turn_start" ||
    event.playerId !== turn.playerId ||
    event.turnId !== turn.turnId ||
    event.faceUpBefore !== false ||
    event.faceUpAfter !== true ||
    event.reason.type !== "posture.face_down_turn_start"
  ) {
    fail("INVALID_STATE", "skipped turn is not linked to its automatic face-up event");
  }
  const expectedReason = automaticTurnOverReason(turn);
  if (!sameJson(event.reason, expectedReason)) {
    fail("INVALID_STATE", "automatic face-up event has forged TurnEntry provenance");
  }
}

export function createPostureEngineState(playerIds: readonly PlayerId[]): PostureEngineState {
  if (!Array.isArray(playerIds) || playerIds.some((playerId) => !isNonemptyString(playerId))) {
    fail("INVALID_ARGUMENT", "posture player IDs must be nonempty strings");
  }
  if (new Set(playerIds).size !== playerIds.length) {
    fail("INVALID_ARGUMENT", "posture player IDs must be unique");
  }
  return {
    version: 1,
    nextEventId: 1,
    nextOperationId: 1,
    players: playerIds.map((playerId) => ({ playerId, faceUp: true })),
    events: [],
    consumedTurns: [],
  };
}

/**
 * Pure atomic transition. On failure the supplied snapshot is never modified;
 * on success both the orientation and its audit event are committed together.
 */
export function turnOverPlayer(
  state: PostureEngineState,
  input: {
    readonly playerId: PlayerId;
    readonly reason: SerializedContinuation;
    readonly turnId?: number | null;
  },
): TurnOverTransition {
  assertPostureEngineState(state);
  if (!isNonemptyString(input.playerId)) fail("INVALID_ARGUMENT", "turn-over playerId is required");
  const turnId = input.turnId ?? null;
  if (turnId !== null && !isPositiveSafeInteger(turnId)) fail("INVALID_ARGUMENT", "turn-over turnId must be positive or null");
  const reason = cloneReason(input.reason);
  requirePlayer(state, input.playerId);

  const draft = clonePostureEngineState(state);
  const operationId = allocateOperationId(draft);
  const event = appendTurnOverEvent(draft, {
    operationId,
    playerId: input.playerId,
    cause: "explicit",
    turnId,
    reason,
  });
  assertPostureEngineState(draft);
  return { state: draft, event: cloneEvent(event) };
}

/**
 * Consumes one queued TurnEntry immediately before the caller starts phases.
 * A face-down owner is atomically restored face up and the entire normal or
 * extra turn is marked skipped. The same turnId can never be consumed again.
 */
export function prepareTurnEntryStart(
  state: PostureEngineState,
  value: TurnEntry,
): TurnStartPostureTransition {
  assertPostureEngineState(state);
  const turn = cloneTurnEntry(value);
  if (state.consumedTurns.some((entry) => entry.turn.turnId === turn.turnId)) {
    fail("TURN_ALREADY_CONSUMED", `TurnEntry ${turn.turnId} was already prepared`);
  }
  requirePlayer(state, turn.playerId);

  const draft = clonePostureEngineState(state);
  const operationId = allocateOperationId(draft);
  const player = requirePlayer(draft, turn.playerId);
  let disposition: TurnStartDisposition = "start_turn";
  let turnOverEvent: TurnOverEvent | null = null;

  if (!player.faceUp) {
    disposition = "skip_entire_turn";
    turnOverEvent = appendTurnOverEvent(draft, {
      operationId,
      playerId: turn.playerId,
      cause: "face_down_turn_start",
      turnId: turn.turnId,
      reason: automaticTurnOverReason(turn),
    });
  }

  draft.consumedTurns.push({
    operationId,
    turn: cloneTurnEntry(turn),
    disposition,
    turnOverEventId: turnOverEvent?.eventId ?? null,
  });
  assertPostureEngineState(draft);
  return {
    state: draft,
    turn: cloneTurnEntry(turn),
    disposition,
    turnOverEvent: turnOverEvent ? cloneEvent(turnOverEvent) : null,
  };
}

export function assertPostureEngineState(value: unknown): asserts value is PostureEngineState {
  assertJsonRecord(value, "posture state");
  if (!isRecord(value) || value.version !== 1) fail("INVALID_STATE", "posture state version must be 1");
  if (!isPositiveSafeInteger(value.nextEventId) || !isPositiveSafeInteger(value.nextOperationId)) {
    fail("INVALID_STATE", "posture counters must be positive safe integers");
  }
  if (!Array.isArray(value.players) || !Array.isArray(value.events) || !Array.isArray(value.consumedTurns)) {
    fail("INVALID_STATE", "posture players and histories must be arrays");
  }

  const players = value.players as unknown[];
  const playerIds: string[] = [];
  for (const player of players) {
    if (!isRecord(player) || !isNonemptyString(player.playerId) || typeof player.faceUp !== "boolean") {
      fail("INVALID_STATE", "posture player state is invalid");
    }
    playerIds.push(player.playerId);
  }
  if (new Set(playerIds).size !== playerIds.length) fail("INVALID_STATE", "posture player IDs must be unique");
  const knownPlayers = new Set(playerIds);

  const events = value.events as unknown[];
  const typedEvents: TurnOverEvent[] = [];
  const eventIds = new Set<number>();
  const eventOperationIds = new Set<number>();
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (
      !isRecord(event) || event.type !== "turn_over" ||
      !isPositiveSafeInteger(event.eventId) || !isPositiveSafeInteger(event.operationId) ||
      !TURN_OVER_CAUSES.has(String(event.cause)) || !isNonemptyString(event.playerId) ||
      typeof event.faceUpBefore !== "boolean" || typeof event.faceUpAfter !== "boolean" ||
      event.faceUpAfter === event.faceUpBefore ||
      (event.turnId !== null && !isPositiveSafeInteger(event.turnId))
    ) {
      fail("INVALID_STATE", `turn-over event ${index} is invalid`);
    }
    if (!knownPlayers.has(event.playerId)) fail("INVALID_STATE", "turn-over event references an unknown player");
    if (eventIds.has(event.eventId) || eventOperationIds.has(event.operationId)) {
      fail("INVALID_STATE", "turn-over event IDs and operation IDs must be unique");
    }
    if (event.eventId !== index + 1) fail("INVALID_STATE", "turn-over event history must be contiguous and ordered");
    cloneReason(event.reason, "INVALID_STATE");
    eventIds.add(event.eventId);
    eventOperationIds.add(event.operationId);
    typedEvents.push(event as unknown as TurnOverEvent);
  }
  if (value.nextEventId !== typedEvents.length + 1) fail("INVALID_STATE", "nextEventId does not follow event history");

  const consumptions = value.consumedTurns as unknown[];
  const typedConsumptions: ConsumedTurnEntry[] = [];
  const consumedTurnIds = new Set<number>();
  const consumptionOperationIds = new Set<number>();
  for (let index = 0; index < consumptions.length; index += 1) {
    const consumption = consumptions[index];
    if (
      !isRecord(consumption) || !isPositiveSafeInteger(consumption.operationId) ||
      !TURN_DISPOSITIONS.has(String(consumption.disposition)) ||
      (consumption.turnOverEventId !== null && !isPositiveSafeInteger(consumption.turnOverEventId))
    ) {
      fail("INVALID_STATE", `consumed TurnEntry ${index} is invalid`);
    }
    const turn = cloneTurnEntry(consumption.turn, "INVALID_STATE");
    if (!knownPlayers.has(turn.playerId)) fail("INVALID_STATE", "consumed TurnEntry references an unknown player");
    if (consumedTurnIds.has(turn.turnId)) fail("INVALID_STATE", "consumed turn IDs must be unique");
    if (consumptionOperationIds.has(consumption.operationId)) fail("INVALID_STATE", "turn-consumption operation IDs must be unique");
    if (consumption.disposition === "start_turn" && consumption.turnOverEventId !== null) {
      fail("INVALID_STATE", "a started turn cannot link a turn-over event");
    }
    if (consumption.disposition === "skip_entire_turn" && consumption.turnOverEventId === null) {
      fail("INVALID_STATE", "a skipped face-down turn requires its turn-over event");
    }
    consumedTurnIds.add(turn.turnId);
    consumptionOperationIds.add(consumption.operationId);
    typedConsumptions.push({
      operationId: consumption.operationId,
      turn,
      disposition: consumption.disposition as TurnStartDisposition,
      turnOverEventId: consumption.turnOverEventId,
    });
  }

  const eventByOperation = new Map(typedEvents.map((event) => [event.operationId, event]));
  const consumptionByOperation = new Map(typedConsumptions.map((entry) => [entry.operationId, entry]));
  const operationIds = [...new Set([...eventOperationIds, ...consumptionOperationIds])].sort((left, right) => left - right);
  if (value.nextOperationId !== operationIds.length + 1 || operationIds.some((id, index) => id !== index + 1)) {
    fail("INVALID_STATE", "posture operation history must be contiguous and ordered");
  }

  const reconstructed = new Map(playerIds.map((playerId) => [playerId, true]));
  for (const operationId of operationIds) {
    const event = eventByOperation.get(operationId);
    const consumption = consumptionByOperation.get(operationId);
    if (consumption) {
      const faceUp = reconstructed.get(consumption.turn.playerId)!;
      if (consumption.disposition === "start_turn") {
        if (event || !faceUp) fail("INVALID_STATE", "started turn posture provenance is inconsistent");
      } else {
        if (!event || faceUp || event.eventId !== consumption.turnOverEventId) {
          fail("INVALID_STATE", "skipped turn posture provenance is inconsistent");
        }
        assertAutomaticEventMatches(event, consumption);
      }
    } else if (!event || event.cause === "face_down_turn_start") {
      fail("INVALID_STATE", "automatic face-up event has no consumed TurnEntry");
    }

    if (event) {
      const before = reconstructed.get(event.playerId)!;
      if (event.faceUpBefore !== before || event.faceUpAfter !== !before) {
        fail("INVALID_STATE", "turn-over event does not match the reconstructed player posture");
      }
      reconstructed.set(event.playerId, event.faceUpAfter);
    }
  }

  for (const player of players as Array<Record<string, unknown>>) {
    if (player.faceUp !== reconstructed.get(player.playerId as string)) {
      fail("INVALID_STATE", "current player posture does not match turn-over history");
    }
  }
}

export function clonePostureEngineState(state: PostureEngineState): PostureEngineState {
  assertPostureEngineState(state);
  const cloned: PostureEngineState = {
    version: 1,
    nextEventId: state.nextEventId,
    nextOperationId: state.nextOperationId,
    players: state.players.map((player) => ({ ...player })),
    events: state.events.map(cloneEvent),
    consumedTurns: state.consumedTurns.map(cloneConsumption),
  };
  assertPostureEngineState(cloned);
  return cloned;
}

export function restorePostureEngineState(value: unknown): PostureEngineState {
  assertPostureEngineState(value);
  return clonePostureEngineState(value);
}

function migrateLegacyV0(value: Record<string, unknown>): PostureEngineState {
  if (!Array.isArray(value.players)) fail("UNSUPPORTED_SNAPSHOT", "legacy posture snapshot has no player list");
  const legacyPlayers: Array<{ playerId: PlayerId; faceUp: boolean }> = [];
  for (const player of value.players) {
    if (!isRecord(player) || !isNonemptyString(player.playerId) || typeof player.faceUp !== "boolean") {
      fail("UNSUPPORTED_SNAPSHOT", "legacy posture player state is invalid");
    }
    legacyPlayers.push({ playerId: player.playerId, faceUp: player.faceUp });
  }
  if (new Set(legacyPlayers.map((player) => player.playerId)).size !== legacyPlayers.length) {
    fail("UNSUPPORTED_SNAPSHOT", "legacy posture player IDs must be unique");
  }

  const migrated = createPostureEngineState(legacyPlayers.map((player) => player.playerId));
  for (const player of legacyPlayers) {
    if (player.faceUp) continue;
    const operationId = allocateOperationId(migrated);
    appendTurnOverEvent(migrated, {
      operationId,
      playerId: player.playerId,
      cause: "legacy_migration",
      turnId: null,
      reason: { type: "posture.legacy_v0_migration", data: { legacyVersion: 0 } },
    });
  }
  assertPostureEngineState(migrated);
  return migrated;
}

/**
 * Explicit migration entry. `null`/`undefined` means the enclosing old room had
 * no posture domain; callers must supply that room's authoritative player IDs.
 */
export function migratePostureEngineState(
  value: unknown,
  missingSnapshotPlayerIds: readonly PlayerId[] = [],
): PostureEngineState {
  if (value === null || value === undefined) return createPostureEngineState(missingSnapshotPlayerIds);
  assertJsonRecord(value, "posture snapshot");
  if (!isRecord(value)) fail("UNSUPPORTED_SNAPSHOT", "posture snapshot must be an object");
  if (value.version === 1) return restorePostureEngineState(value);
  if (value.version === 0) return migrateLegacyV0(value);
  fail("UNSUPPORTED_SNAPSHOT", "unsupported posture snapshot version");
}
