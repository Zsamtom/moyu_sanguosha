import type { Card, CardId, PlayerId, Role } from "../types.js";
import type { DeathEvent } from "./dying.js";
import type { MoveRecord, ZoneRef } from "./zones.js";

export const DEATH_FRAME_STAGES = [
  "identity_reveal",
  "death_triggers",
  "card_disposition",
  "reward_punishment",
  "death_after",
  "complete",
] as const;

export type DeathFrameStage = (typeof DEATH_FRAME_STAGES)[number];

export interface DeathIdentityReveal {
  readonly eventId: number;
  readonly role: Role;
  readonly wasAlreadyRevealed: boolean;
}

export interface DeathTriggerResolution {
  readonly eventId: number;
  readonly consumedTriggerIds: readonly string[];
}

export interface DeathCardDisposition {
  readonly eventId: number;
  /** Non-null records that Xingshang claimed all disposable cards. */
  readonly xingshangRecipientId: PlayerId | null;
  readonly moveRecords: readonly MoveRecord[];
}

export type DeathRewardPunishmentKind =
  | "none"
  | "rebel_bounty"
  | "lord_loyalist_penalty";

export interface DeathRewardPunishment {
  readonly eventId: number;
  readonly kind: DeathRewardPunishmentKind;
  readonly affectedPlayerId: PlayerId | null;
  readonly moveRecords: readonly MoveRecord[];
}

export interface DeathAfterResolution {
  readonly eventId: number;
  readonly consumedTriggerIds: readonly string[];
}

export interface DeathFrame {
  readonly version: 1;
  readonly type: "death_frame";
  readonly frameId: number;
  readonly death: DeathEvent;
  /** Snapshot of cards owned by the victim when death cleanup began. */
  readonly ownedPhysicalCardIds: readonly CardId[];
  stage: DeathFrameStage;
  identityReveal: DeathIdentityReveal | null;
  deathTriggers: DeathTriggerResolution | null;
  cardDisposition: DeathCardDisposition | null;
  rewardPunishment: DeathRewardPunishment | null;
  deathAfter: DeathAfterResolution | null;
  parentFrameId: number | null;
  suspendedByFrameId: number | null;
}

export interface DeathStack {
  readonly version: 1;
  frames: DeathFrame[];
}

export class DeathFrameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeathFrameError";
  }
}

const STAGE_SET = new Set<string>(DEATH_FRAME_STAGES);
const DEATH_FRAME_KEYS = [
  "version", "type", "frameId", "death", "ownedPhysicalCardIds", "stage", "identityReveal", "deathTriggers",
  "cardDisposition", "rewardPunishment", "deathAfter", "parentFrameId", "suspendedByFrameId",
] as const;
const DEATH_EVENT_KEYS = ["type", "eventId", "victimId", "killerId", "reason"] as const;
const MOVE_RECORD_REQUIRED_KEYS = ["batchId", "cardIds", "cards", "from", "to", "reason", "visibility"] as const;
const MOVE_RECORD_OPTIONAL_KEYS = [
  "placement", "actorId", "sourceId", "targetId", "skillId", "useId", "frameId",
] as const;
const CARD_KEYS = ["id", "kind", "name", "category", "suit", "rank"] as const;
const EQUIPMENT_SLOTS = new Set(["weapon", "armor", "offensive_horse", "defensive_horse"]);
const MOVE_REASONS = new Set([
  "draw", "use", "respond", "discard", "gain", "give", "steal", "equip", "replace_equipment", "judgment",
  "retrial", "pindian", "death", "skill_cost", "skill_effect", "recast", "deck_reorder",
]);
const MOVE_VISIBILITIES = new Set(["public", "owner", "source_and_target", "server_only"]);
const MOVE_PLACEMENTS = new Set(["append", "deck_top", "deck_bottom"]);
const ROLES = new Set(["lord", "loyalist", "rebel", "renegade"]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function assertStrictJson(value: unknown, label: string): void {
  const ancestors: object[] = [];
  const visit = (candidate: unknown, path: string, depth: number): void => {
    if (candidate === null || typeof candidate === "string" || typeof candidate === "boolean") return;
    if (typeof candidate === "number") {
      if (!Number.isFinite(candidate)) throw new DeathFrameError(`${path} contains a non-finite number`);
      return;
    }
    if (typeof candidate !== "object" || depth > 256) throw new DeathFrameError(`${path} is not strict JSON`);
    if (ancestors.includes(candidate)) throw new DeathFrameError(`${path} contains a cycle`);
    ancestors.push(candidate);
    if (Array.isArray(candidate)) {
      const keys = Reflect.ownKeys(candidate);
      if (keys.length !== candidate.length + 1 || keys.some((key) => {
        if (key === "length") return false;
        if (typeof key !== "string") return true;
        const index = Number(key);
        return !Number.isSafeInteger(index) || index < 0 || index >= candidate.length || String(index) !== key;
      })) {
        throw new DeathFrameError(`${path} must be a dense array without custom properties`);
      }
      for (let index = 0; index < candidate.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(candidate, String(index));
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          throw new DeathFrameError(`${path}[${index}] must be an enumerable data property`);
        }
        visit(descriptor.value, `${path}[${index}]`, depth + 1);
      }
    } else {
      if (!isPlainRecord(candidate)) throw new DeathFrameError(`${path} must be a plain object`);
      for (const key of Reflect.ownKeys(candidate)) {
        if (typeof key !== "string") throw new DeathFrameError(`${path} contains a symbol key`);
        const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          throw new DeathFrameError(`${path}.${key} must be an enumerable data property`);
        }
        visit(descriptor.value, `${path}.${key}`, depth + 1);
      }
    }
    ancestors.pop();
  };
  visit(value, label, 0);
}

function exactRecord(
  value: unknown,
  required: readonly string[],
  label: string,
  optional: readonly string[] = [],
): Record<string, unknown> {
  if (!isPlainRecord(value)) throw new DeathFrameError(`${label} must be an object`);
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(value, key)) || keys.some((key) => !allowed.has(key))) {
    throw new DeathFrameError(`${label} has missing or unexpected fields`);
  }
  return value;
}

function assertZoneRefShape(value: unknown, label: string): asserts value is ZoneRef {
  if (!isPlainRecord(value) || typeof value.kind !== "string") throw new DeathFrameError(`${label} is invalid`);
  if (value.kind === "deck" || value.kind === "discard") {
    exactRecord(value, ["kind"], label);
  } else if (value.kind === "processing") {
    const zone = exactRecord(value, ["kind", "frameId"], label);
    positive(zone.frameId as number, `${label} frameId`);
  } else if (value.kind === "hand" || value.kind === "judgment") {
    const zone = exactRecord(value, ["kind", "playerId"], label);
    if (typeof zone.playerId !== "string" || zone.playerId.length === 0) throw new DeathFrameError(`${label} playerId is invalid`);
  } else if (value.kind === "equipment") {
    const zone = exactRecord(value, ["kind", "playerId", "slot"], label);
    if (typeof zone.playerId !== "string" || zone.playerId.length === 0 || !EQUIPMENT_SLOTS.has(zone.slot as string)) {
      throw new DeathFrameError(`${label} equipment reference is invalid`);
    }
  } else if (value.kind === "extra") {
    const zone = exactRecord(value, ["kind", "playerId", "pileId"], label);
    if (typeof zone.playerId !== "string" || zone.playerId.length === 0 || typeof zone.pileId !== "string" || zone.pileId.length === 0) {
      throw new DeathFrameError(`${label} extra-pile reference is invalid`);
    }
  } else {
    throw new DeathFrameError(`${label} kind is invalid`);
  }
}

function assertCardShape(value: unknown, label: string): asserts value is Card {
  const candidate = exactRecord(value, CARD_KEYS, label);
  if (typeof candidate.id !== "string" || candidate.id.length === 0
    || typeof candidate.kind !== "string" || candidate.kind.length === 0
    || typeof candidate.name !== "string" || candidate.name.length === 0
    || !["basic", "trick", "equipment"].includes(candidate.category as string)
    || !["spade", "heart", "club", "diamond"].includes(candidate.suit as string)
    || !Number.isSafeInteger(candidate.rank) || (candidate.rank as number) < 1 || (candidate.rank as number) > 13
  ) throw new DeathFrameError(`${label} is invalid`);
}

function assertMoveRecordShape(value: unknown, label: string): asserts value is MoveRecord {
  const record = exactRecord(value, MOVE_RECORD_REQUIRED_KEYS, label, MOVE_RECORD_OPTIONAL_KEYS);
  positive(record.batchId as number, `${label} batchId`);
  if (!Array.isArray(record.cardIds) || !Array.isArray(record.cards)
    || record.cardIds.some((cardId) => typeof cardId !== "string" || cardId.length === 0)
    || !MOVE_REASONS.has(record.reason as string) || !MOVE_VISIBILITIES.has(record.visibility as string)
    || Object.prototype.hasOwnProperty.call(record, "placement") && !MOVE_PLACEMENTS.has(record.placement as string)
  ) throw new DeathFrameError(`${label} is invalid`);
  assertZoneRefShape(record.from, `${label}.from`);
  assertZoneRefShape(record.to, `${label}.to`);
  record.cards.forEach((card, index) => assertCardShape(card, `${label}.cards[${index}]`));
  for (const key of ["actorId", "sourceId", "targetId", "skillId"] as const) {
    if (Object.prototype.hasOwnProperty.call(record, key)
      && record[key] !== null
      && (typeof record[key] !== "string" || (record[key] as string).length === 0)
    ) throw new DeathFrameError(`${label}.${key} is invalid`);
  }
  for (const key of ["useId", "frameId"] as const) {
    if (Object.prototype.hasOwnProperty.call(record, key) && record[key] !== null) {
      positive(record[key] as number, `${label}.${key}`);
    }
  }
}

function assertDeathEventShape(value: unknown): asserts value is DeathEvent {
  const event = exactRecord(value, DEATH_EVENT_KEYS, "death event");
  const reason = exactRecord(event.reason, ["type", "eventId", "sourceId"], "death reason");
  positive(event.eventId as number, "death eventId");
  positive(reason.eventId as number, "death reason eventId");
  if (event.type !== "death"
    || typeof event.victimId !== "string" || event.victimId.length === 0
    || !(event.killerId === null || typeof event.killerId === "string" && event.killerId.length > 0)
    || (reason.type !== "damage" && reason.type !== "hp_loss")
    || !(reason.sourceId === null || typeof reason.sourceId === "string" && reason.sourceId.length > 0)
  ) throw new DeathFrameError("death event metadata is invalid");
}

function assertOutcomeShapes(frame: DeathFrame): void {
  if (frame.identityReveal !== null) {
    const outcome = exactRecord(frame.identityReveal, ["eventId", "role", "wasAlreadyRevealed"], "identityReveal");
    positive(outcome.eventId as number, "identityReveal eventId");
    if (!ROLES.has(outcome.role as string) || typeof outcome.wasAlreadyRevealed !== "boolean") {
      throw new DeathFrameError("identityReveal is invalid");
    }
  }
  for (const [label, outcome] of [["deathTriggers", frame.deathTriggers], ["deathAfter", frame.deathAfter]] as const) {
    if (outcome === null) continue;
    const persisted = exactRecord(outcome, ["eventId", "consumedTriggerIds"], label);
    positive(persisted.eventId as number, `${label} eventId`);
    if (!Array.isArray(persisted.consumedTriggerIds)
      || persisted.consumedTriggerIds.some((id) => typeof id !== "string" || id.length === 0)
    ) throw new DeathFrameError(`${label} is invalid`);
  }
  if (frame.cardDisposition !== null) {
    const outcome = exactRecord(frame.cardDisposition, ["eventId", "xingshangRecipientId", "moveRecords"], "cardDisposition");
    positive(outcome.eventId as number, "cardDisposition eventId");
    if (!(outcome.xingshangRecipientId === null
      || typeof outcome.xingshangRecipientId === "string" && outcome.xingshangRecipientId.length > 0)
      || !Array.isArray(outcome.moveRecords)
    ) throw new DeathFrameError("cardDisposition is invalid");
    outcome.moveRecords.forEach((record, index) => assertMoveRecordShape(record, `cardDisposition.moveRecords[${index}]`));
  }
  if (frame.rewardPunishment !== null) {
    const outcome = exactRecord(frame.rewardPunishment, ["eventId", "kind", "affectedPlayerId", "moveRecords"], "rewardPunishment");
    positive(outcome.eventId as number, "rewardPunishment eventId");
    if (!["none", "rebel_bounty", "lord_loyalist_penalty"].includes(outcome.kind as string)
      || !(outcome.affectedPlayerId === null
        || typeof outcome.affectedPlayerId === "string" && outcome.affectedPlayerId.length > 0)
      || !Array.isArray(outcome.moveRecords)
    ) throw new DeathFrameError("rewardPunishment is invalid");
    outcome.moveRecords.forEach((record, index) => assertMoveRecordShape(record, `rewardPunishment.moveRecords[${index}]`));
  }
}

function positive(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new DeathFrameError(`${label} must be positive`);
}

function cloneZoneRef(zone: ZoneRef): ZoneRef {
  return { ...zone } as ZoneRef;
}

function cloneCard(card: Card): Card {
  return { ...card };
}

function cloneMoveRecord(record: MoveRecord): MoveRecord {
  return {
    ...record,
    from: cloneZoneRef(record.from),
    to: cloneZoneRef(record.to),
    cardIds: [...record.cardIds],
    cards: record.cards.map(cloneCard),
  };
}

function cloneDeathEvent(event: DeathEvent): DeathEvent {
  return { ...event, reason: { ...event.reason } };
}

function assertActive(frame: DeathFrame): void {
  if (frame.suspendedByFrameId !== null) {
    throw new DeathFrameError(`death frame ${frame.frameId} is not the stack top`);
  }
}

function requireStage(frame: DeathFrame, stage: DeathFrameStage): void {
  assertActive(frame);
  if (frame.stage !== stage) {
    throw new DeathFrameError(`death frame expected ${stage}, current ${frame.stage}`);
  }
}

function assertUniqueStrings(values: readonly string[], label: string): void {
  if (values.some((value) => !value) || new Set(values).size !== values.length) {
    throw new DeathFrameError(`${label} must be unique and nonempty`);
  }
}

function completedEventIds(frame: DeathFrame): number[] {
  return [
    frame.identityReveal?.eventId,
    frame.deathTriggers?.eventId,
    frame.cardDisposition?.eventId,
    frame.rewardPunishment?.eventId,
    frame.deathAfter?.eventId,
  ].filter((value): value is number => value !== undefined);
}

function assertUnusedEventId(frame: DeathFrame, eventId: number): void {
  positive(eventId, "death-stage eventId");
  if (completedEventIds(frame).includes(eventId)) {
    throw new DeathFrameError("death-stage event was already consumed");
  }
}

function victimOwnedZone(zone: ZoneRef, victimId: PlayerId): boolean {
  switch (zone.kind) {
    case "hand":
    case "equipment":
    case "judgment":
    case "extra":
      return zone.playerId === victimId;
    case "deck":
    case "discard":
    case "processing":
      return false;
  }
}

function assertMoveRecordCards(record: MoveRecord, label: string): void {
  positive(record.batchId, `${label} batchId`);
  if (record.cardIds.length === 0 || record.cardIds.length !== record.cards.length) {
    throw new DeathFrameError(`${label} has incomplete cards`);
  }
  if (new Set(record.cardIds).size !== record.cardIds.length) {
    throw new DeathFrameError(`${label} has duplicate cards`);
  }
  record.cardIds.forEach((cardId, index) => {
    if (!cardId || record.cards[index]?.id !== cardId) {
      throw new DeathFrameError(`${label} card provenance is inconsistent`);
    }
  });
}

function assertCardDisposition(
  frame: DeathFrame,
  input: Pick<DeathCardDisposition, "xingshangRecipientId" | "moveRecords">,
): void {
  if (input.xingshangRecipientId === frame.death.victimId) {
    throw new DeathFrameError("victim cannot receive their own death cards");
  }
  const movedIds: CardId[] = [];
  input.moveRecords.forEach((record, index) => {
    assertMoveRecordCards(record, `cardDisposition.moveRecords[${index}]`);
    if (!victimOwnedZone(record.from, frame.death.victimId)) {
      throw new DeathFrameError("death cleanup must move cards from a victim-owned zone");
    }
    if (record.reason !== "death" && record.reason !== "skill_effect") {
      throw new DeathFrameError("death cleanup has an invalid move reason");
    }
    if (input.xingshangRecipientId === null) {
      if (record.to.kind !== "discard") throw new DeathFrameError("unclaimed death cards must enter discard");
    } else if (record.from.kind === "extra") {
      if (record.to.kind !== "discard") {
        throw new DeathFrameError("Xingshang excludes extra-pile cards from its claim");
      }
    } else if (record.to.kind !== "hand" || record.to.playerId !== input.xingshangRecipientId) {
      throw new DeathFrameError("Xingshang must move hand, equipment, and judgment cards to its recipient's hand");
    }
    movedIds.push(...record.cardIds);
  });
  if (new Set(movedIds).size !== movedIds.length) {
    throw new DeathFrameError("a death-cleanup card was moved more than once");
  }
  const expected = [...frame.ownedPhysicalCardIds].sort();
  const actual = [...movedIds].sort();
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
    throw new DeathFrameError("death cleanup did not dispose the exact owned-card snapshot");
  }
}

function assertRewardPunishment(
  frame: DeathFrame,
  input: Pick<DeathRewardPunishment, "kind" | "affectedPlayerId" | "moveRecords">,
): void {
  input.moveRecords.forEach((record, index) => assertMoveRecordCards(record, `rewardPunishment.moveRecords[${index}]`));
  if (input.kind === "none") {
    if (input.affectedPlayerId !== null || input.moveRecords.length > 0) {
      throw new DeathFrameError("no reward or punishment cannot carry an affected player or moves");
    }
    return;
  }
  if (!input.affectedPlayerId || input.affectedPlayerId !== frame.death.killerId) {
    throw new DeathFrameError("death reward or punishment must affect the killer");
  }
  if (input.kind === "rebel_bounty") {
    if (frame.identityReveal?.role !== "rebel") throw new DeathFrameError("rebel bounty requires a revealed rebel victim");
    const cardCount = input.moveRecords.reduce((count, record) => count + record.cardIds.length, 0);
    // The zone engine can exhaust both draw and discard piles while another
    // card is still resolving. The caller supplies every card actually
    // available; this frame verifies provenance and the three-card upper bound.
    if (cardCount > 3 || input.moveRecords.some((record) =>
      record.reason !== "draw" || record.from.kind !== "deck" ||
      record.to.kind !== "hand" || record.to.playerId !== input.affectedPlayerId)) {
      throw new DeathFrameError("rebel bounty may draw at most three available cards for the killer");
    }
  } else {
    if (frame.identityReveal?.role !== "loyalist") {
      throw new DeathFrameError("lord-loyalist penalty requires a revealed loyalist victim");
    }
    if (input.moveRecords.some((record) =>
      !victimOwnedZone(record.from, input.affectedPlayerId!) ||
      record.to.kind !== "discard" || record.reason !== "death")) {
      throw new DeathFrameError("lord-loyalist penalty must discard the killer's owned cards");
    }
  }
}

export function createDeathFrame(input: {
  readonly frameId: number;
  readonly death: DeathEvent;
  readonly ownedPhysicalCardIds?: readonly CardId[];
}): DeathFrame {
  positive(input.frameId, "death frameId");
  positive(input.death.eventId, "death eventId");
  if (!input.death.victimId) throw new DeathFrameError("death victim is required");
  if (input.death.killerId === input.death.victimId) throw new DeathFrameError("death killer cannot be the victim");
  const ownedPhysicalCardIds = [...(input.ownedPhysicalCardIds ?? [])];
  if (ownedPhysicalCardIds.some((id) => !id) || new Set(ownedPhysicalCardIds).size !== ownedPhysicalCardIds.length) {
    throw new DeathFrameError("owned physical card snapshot must be unique and nonempty");
  }
  const frame: DeathFrame = {
    version: 1,
    type: "death_frame",
    frameId: input.frameId,
    death: cloneDeathEvent(input.death),
    ownedPhysicalCardIds: Object.freeze(ownedPhysicalCardIds),
    stage: "identity_reveal",
    identityReveal: null,
    deathTriggers: null,
    cardDisposition: null,
    rewardPunishment: null,
    deathAfter: null,
    parentFrameId: null,
    suspendedByFrameId: null,
  };
  assertDeathFrame(frame);
  return frame;
}

export function revealDeathIdentity(
  frame: DeathFrame,
  input: { readonly eventId: number; readonly role: Role; readonly wasAlreadyRevealed?: boolean },
): void {
  requireStage(frame, "identity_reveal");
  assertUnusedEventId(frame, input.eventId);
  frame.identityReveal = {
    eventId: input.eventId,
    role: input.role,
    wasAlreadyRevealed: input.wasAlreadyRevealed ?? false,
  };
  frame.stage = "death_triggers";
}

export function completeDeathTriggers(
  frame: DeathFrame,
  input: { readonly eventId: number; readonly consumedTriggerIds?: readonly string[] },
): void {
  requireStage(frame, "death_triggers");
  assertUnusedEventId(frame, input.eventId);
  const consumedTriggerIds = [...(input.consumedTriggerIds ?? [])];
  assertUniqueStrings(consumedTriggerIds, "death trigger ids");
  frame.deathTriggers = { eventId: input.eventId, consumedTriggerIds: Object.freeze(consumedTriggerIds) };
  frame.stage = "card_disposition";
}

export function completeDeathCardDisposition(
  frame: DeathFrame,
  input: {
    readonly eventId: number;
    readonly xingshangRecipientId?: PlayerId | null;
    readonly moveRecords?: readonly MoveRecord[];
  },
): void {
  requireStage(frame, "card_disposition");
  assertUnusedEventId(frame, input.eventId);
  const disposition = {
    xingshangRecipientId: input.xingshangRecipientId ?? null,
    moveRecords: input.moveRecords ?? [],
  };
  assertCardDisposition(frame, disposition);
  frame.cardDisposition = {
    eventId: input.eventId,
    xingshangRecipientId: disposition.xingshangRecipientId,
    moveRecords: Object.freeze(disposition.moveRecords.map(cloneMoveRecord)),
  };
  frame.stage = "reward_punishment";
}

export function completeDeathRewardPunishment(
  frame: DeathFrame,
  input: {
    readonly eventId: number;
    readonly kind: DeathRewardPunishmentKind;
    readonly affectedPlayerId?: PlayerId | null;
    readonly moveRecords?: readonly MoveRecord[];
  },
): void {
  requireStage(frame, "reward_punishment");
  assertUnusedEventId(frame, input.eventId);
  const reward = {
    kind: input.kind,
    affectedPlayerId: input.affectedPlayerId ?? null,
    moveRecords: input.moveRecords ?? [],
  };
  assertRewardPunishment(frame, reward);
  frame.rewardPunishment = {
    eventId: input.eventId,
    kind: reward.kind,
    affectedPlayerId: reward.affectedPlayerId,
    moveRecords: Object.freeze(reward.moveRecords.map(cloneMoveRecord)),
  };
  frame.stage = "death_after";
}

export function completeDeathAfter(
  frame: DeathFrame,
  input: { readonly eventId: number; readonly consumedTriggerIds?: readonly string[] },
): void {
  requireStage(frame, "death_after");
  assertUnusedEventId(frame, input.eventId);
  const consumedTriggerIds = [...(input.consumedTriggerIds ?? [])];
  assertUniqueStrings(consumedTriggerIds, "death-after trigger ids");
  frame.deathAfter = { eventId: input.eventId, consumedTriggerIds: Object.freeze(consumedTriggerIds) };
  frame.stage = "complete";
}

export function cloneDeathFrame(frame: DeathFrame): DeathFrame {
  return {
    ...frame,
    death: cloneDeathEvent(frame.death),
    ownedPhysicalCardIds: Object.freeze([...frame.ownedPhysicalCardIds]),
    identityReveal: frame.identityReveal ? { ...frame.identityReveal } : null,
    deathTriggers: frame.deathTriggers ? {
      ...frame.deathTriggers,
      consumedTriggerIds: Object.freeze([...frame.deathTriggers.consumedTriggerIds]),
    } : null,
    cardDisposition: frame.cardDisposition ? {
      ...frame.cardDisposition,
      moveRecords: Object.freeze(frame.cardDisposition.moveRecords.map(cloneMoveRecord)),
    } : null,
    rewardPunishment: frame.rewardPunishment ? {
      ...frame.rewardPunishment,
      moveRecords: Object.freeze(frame.rewardPunishment.moveRecords.map(cloneMoveRecord)),
    } : null,
    deathAfter: frame.deathAfter ? {
      ...frame.deathAfter,
      consumedTriggerIds: Object.freeze([...frame.deathAfter.consumedTriggerIds]),
    } : null,
  };
}

export function assertDeathFrame(frame: DeathFrame): void {
  assertStrictJson(frame, "death frame");
  const persisted = exactRecord(frame, DEATH_FRAME_KEYS, "death frame");
  if (persisted.version !== 1 || persisted.type !== "death_frame") throw new DeathFrameError("death frame version is invalid");
  if (!Array.isArray(frame.ownedPhysicalCardIds)) throw new DeathFrameError("owned physical card snapshot is invalid");
  if (!STAGE_SET.has(frame.stage)) throw new DeathFrameError("death frame stage is invalid");
  positive(frame.frameId, "death frameId");
  assertDeathEventShape(frame.death);
  if (!frame.death.victimId || frame.death.killerId === frame.death.victimId) throw new DeathFrameError("death event metadata is invalid");
  if (
    frame.ownedPhysicalCardIds.some((id) => typeof id !== "string" || id.length === 0) ||
    new Set(frame.ownedPhysicalCardIds).size !== frame.ownedPhysicalCardIds.length
  ) {
    throw new DeathFrameError("owned physical card snapshot is invalid");
  }
  for (const [label, value] of [["parentFrameId", frame.parentFrameId], ["suspendedByFrameId", frame.suspendedByFrameId]] as const) {
    if (value !== null) positive(value, label);
    if (value === frame.frameId) throw new DeathFrameError("death frame cannot parent or suspend itself");
  }

  const stageIndex = DEATH_FRAME_STAGES.indexOf(frame.stage);
  const outcomes = [
    frame.identityReveal,
    frame.deathTriggers,
    frame.cardDisposition,
    frame.rewardPunishment,
    frame.deathAfter,
  ];
  outcomes.forEach((outcome, index) => {
    const shouldExist = stageIndex > index;
    if (shouldExist !== (outcome !== null)) throw new DeathFrameError("death frame progress does not match its stage");
  });
  assertOutcomeShapes(frame);
  const ids = completedEventIds(frame);
  ids.forEach((eventId) => positive(eventId, "death-stage eventId"));
  if (new Set(ids).size !== ids.length) throw new DeathFrameError("death-stage event ids are duplicated");
  if (frame.identityReveal && frame.deathTriggers) {
    assertUniqueStrings(frame.deathTriggers.consumedTriggerIds, "death trigger ids");
  }
  if (frame.cardDisposition) assertCardDisposition(frame, frame.cardDisposition);
  if (frame.rewardPunishment) assertRewardPunishment(frame, frame.rewardPunishment);
  if (frame.deathAfter) assertUniqueStrings(frame.deathAfter.consumedTriggerIds, "death-after trigger ids");
}

export function createDeathStack(): DeathStack {
  return { version: 1, frames: [] };
}

export function topDeathFrame(stack: DeathStack): DeathFrame | null {
  return stack.frames.at(-1) ?? null;
}

export function pushDeathFrame(stack: DeathStack, frame: DeathFrame): void {
  if (stack.version !== 1) throw new DeathFrameError("death stack version is invalid");
  assertDeathFrame(frame);
  if (frame.parentFrameId !== null || frame.suspendedByFrameId !== null) throw new DeathFrameError("new death frame is already linked");
  if (stack.frames.some((candidate) => candidate.frameId === frame.frameId || candidate.death.victimId === frame.death.victimId)) {
    throw new DeathFrameError("death stack contains a duplicate frame or victim");
  }
  const parent = topDeathFrame(stack);
  if (parent) {
    if (parent.stage === "complete") throw new DeathFrameError("completed death frame must be popped before nesting another");
    if (parent.suspendedByFrameId !== null) throw new DeathFrameError("only the death stack top can be suspended");
    parent.suspendedByFrameId = frame.frameId;
    frame.parentFrameId = parent.frameId;
  }
  stack.frames.push(frame);
}

export function popCompletedDeathFrame(stack: DeathStack, frameId: number): DeathFrame {
  const top = topDeathFrame(stack);
  if (!top || top.frameId !== frameId) throw new DeathFrameError("only the death stack top can be popped");
  if (top.stage !== "complete") throw new DeathFrameError("incomplete death frame cannot be popped");
  stack.frames.pop();
  const parent = topDeathFrame(stack);
  if (parent) {
    if (top.parentFrameId !== parent.frameId || parent.suspendedByFrameId !== top.frameId) {
      throw new DeathFrameError("death stack parent link is inconsistent");
    }
    parent.suspendedByFrameId = null;
  }
  top.parentFrameId = null;
  return top;
}

export function cloneDeathStack(stack: DeathStack): DeathStack {
  return { version: 1, frames: stack.frames.map(cloneDeathFrame) };
}

export function assertDeathStack(stack: DeathStack): void {
  assertStrictJson(stack, "death stack");
  const persisted = exactRecord(stack, ["version", "frames"], "death stack");
  if (persisted.version !== 1 || !Array.isArray(persisted.frames)) throw new DeathFrameError("death stack is invalid");
  const frameIds = stack.frames.map((frame) => frame.frameId);
  const victimIds = stack.frames.map((frame) => frame.death.victimId);
  if (new Set(frameIds).size !== frameIds.length || new Set(victimIds).size !== victimIds.length) {
    throw new DeathFrameError("death stack frame ids and victims must be unique");
  }
  stack.frames.forEach((frame, index) => {
    assertDeathFrame(frame);
    const parent = stack.frames[index - 1] ?? null;
    const child = stack.frames[index + 1] ?? null;
    if (frame.parentFrameId !== (parent?.frameId ?? null)) throw new DeathFrameError("death stack parent chain is invalid");
    if (frame.suspendedByFrameId !== (child?.frameId ?? null)) throw new DeathFrameError("only the death stack top may be active");
  });
}
