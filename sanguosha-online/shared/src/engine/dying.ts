import type {
  Card,
  CardId,
  CardSuit,
  GeneralSkillId,
  PlayerId,
} from "../types.js";
import { DamageError, recoverHp, type LifePlayerState, type RecoveryEvent } from "./damage.js";
import {
  commitMoveBatch,
  locatePhysicalCard,
  type AtomicZoneState,
  type MoveRecord,
  type ZoneRef,
} from "./zones.js";

export const DYING_STAGES = [
  "entry_save",
  "rescue",
  "legacy_alternate_save",
  "rescued",
  "death_pending",
  "death_confirmed",
] as const;

export type DyingStage = (typeof DYING_STAGES)[number];
export type RescueCardKind = "peach" | "wine" | "view_as_peach" | "view_as_wine";
export type DyingEntrySaveSkillId = "buqu";
export type DyingOwnerResponseSaveSkillId = "niepan";

export interface DyingReason {
  readonly type: "damage" | "hp_loss";
  readonly eventId: number;
  readonly sourceId: PlayerId | null;
}

export interface RescueRecord {
  readonly eventId: number;
  readonly responderId: PlayerId;
  readonly cardKind: RescueCardKind;
  readonly requestedAmount: number;
  readonly recoveredAmount: number;
  readonly hpAfter: number;
  /** Nested card-use identity; null only on an explicitly migrated v1 record. */
  readonly useId: number | null;
  /** Resolution frame that owns the nested rescue card use. */
  readonly cardUseFrameId: number | null;
  readonly physicalCardIds: readonly CardId[];
  readonly viewAsSkillId: GeneralSkillId | null;
  /** Effective suit at declaration; null only on an explicitly migrated v1 record. */
  readonly effectiveSuit: CardSuit | null;
  /** The only current suit-changing rule; it never mutates the physical card. */
  readonly suitModifierSkillId: "hongyan" | null;
  readonly moveRecords: readonly MoveRecord[];
  readonly provenance: "verified" | "legacy_unverified";
}

export interface DyingSkillResolution {
  readonly skillId: DyingEntrySaveSkillId | DyingOwnerResponseSaveSkillId | string;
  readonly timing: "life_deduction" | "recovery" | "victim_response" | "legacy_deferred";
  readonly succeeded: boolean;
  readonly hpAfter: number;
}

export interface DyingFrame {
  readonly version: 2;
  readonly type: "dying";
  readonly frameId: number;
  readonly victimId: PlayerId;
  readonly reason: DyingReason;
  readonly responderOrder: readonly PlayerId[];
  responderIndex: number;
  stage: DyingStage;
  readonly rescues: RescueRecord[];
  /** Buqu and equivalent checks occur immediately after life deduction. */
  entrySaveSkillIds: DyingEntrySaveSkillId[];
  /** Niepan is offered only while the victim is the current responder. */
  ownerResponseSaveSkillIds: DyingOwnerResponseSaveSkillId[];
  /** Preserves already-running v1 snapshots without creating new wrong-timing windows. */
  legacyAlternateSaveSkillIds: string[];
  readonly skillResolutions: DyingSkillResolution[];
  survivalSkillId: string | null;
  parentFrameId: number | null;
  suspendedByFrameId: number | null;
  readonly migratedFromVersion: 1 | null;
}

export interface LegacyRescueRecordV1 {
  readonly eventId: number;
  readonly responderId: PlayerId;
  readonly cardKind: RescueCardKind;
  readonly requestedAmount: number;
  readonly recoveredAmount: number;
  readonly hpAfter: number;
}

/** Serialized shape produced by the original dying engine. */
export interface LegacyDyingFrameV1 {
  readonly type: "dying";
  readonly frameId: number;
  readonly victimId: PlayerId;
  readonly reason: DyingReason;
  readonly responderOrder: readonly PlayerId[];
  responderIndex: number;
  stage: "rescue" | "alternate_save" | "rescued" | "death_confirmed";
  readonly rescues: readonly LegacyRescueRecordV1[];
  alternateSaveSkillIds: string[];
  usedAlternateSaveSkillId: string | null;
}

export interface DyingStack {
  readonly version: 1;
  frames: DyingFrame[];
}

export interface RescueCardUseInput {
  readonly eventId: number;
  readonly responderId: PlayerId;
  readonly cardKind: RescueCardKind;
  readonly amount?: number;
  readonly useId: number;
  readonly cardUseFrameId: number;
  readonly physicalCardIds: readonly CardId[];
  readonly viewAsSkillId: GeneralSkillId | null;
  readonly effectiveSuit: CardSuit;
  readonly suitModifierSkillId: "hongyan" | null;
  readonly moveRecords: readonly MoveRecord[];
}

export interface RecordDyingRescueInput extends RescueCardUseInput {
  readonly recoveredAmount: number;
  readonly hpAfter: number;
}

export interface PlayDyingRescueCardInput {
  readonly eventId: number;
  readonly responderId: PlayerId;
  readonly cardKind: RescueCardKind;
  readonly amount?: number;
  readonly useId: number;
  readonly cardUseFrameId: number;
  readonly batchId: number;
  readonly physicalCardId: CardId;
  readonly from: ZoneRef;
  readonly viewAsSkillId: GeneralSkillId | null;
  readonly effectiveSuit: CardSuit;
  readonly suitModifierSkillId: "hongyan" | null;
}

export interface PlayDyingRescueCardsInput {
  readonly eventId: number;
  readonly responderId: PlayerId;
  readonly cardKind: RescueCardKind;
  readonly amount?: number;
  readonly useId: number;
  readonly cardUseFrameId: number;
  readonly batchId: number;
  readonly physicalCards: readonly {
    readonly cardId: CardId;
    readonly from: ZoneRef;
  }[];
  readonly viewAsSkillId: GeneralSkillId | null;
  readonly effectiveSuit: CardSuit;
  readonly suitModifierSkillId: "hongyan" | null;
}

export interface PlayedDyingRescueCard {
  readonly recovery: RecoveryEvent;
  readonly moveRecords: readonly MoveRecord[];
}

export interface DeathEvent {
  readonly type: "death";
  readonly eventId: number;
  readonly victimId: PlayerId;
  readonly killerId: PlayerId | null;
  readonly reason: DyingReason;
}

export class DyingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DyingError";
  }
}

const DYING_STAGE_SET = new Set<string>(DYING_STAGES);
const DYING_FRAME_KEYS = [
  "version", "type", "frameId", "victimId", "reason", "responderOrder", "responderIndex", "stage", "rescues",
  "entrySaveSkillIds", "ownerResponseSaveSkillIds", "legacyAlternateSaveSkillIds", "skillResolutions",
  "survivalSkillId", "parentFrameId", "suspendedByFrameId", "migratedFromVersion",
] as const;
const RESCUE_RECORD_KEYS = [
  "eventId", "responderId", "cardKind", "requestedAmount", "recoveredAmount", "hpAfter", "useId",
  "cardUseFrameId", "physicalCardIds", "viewAsSkillId", "effectiveSuit", "suitModifierSkillId", "moveRecords", "provenance",
] as const;
const SKILL_RESOLUTION_KEYS = ["skillId", "timing", "succeeded", "hpAfter"] as const;
const LEGACY_DYING_FRAME_KEYS = [
  "type", "frameId", "victimId", "reason", "responderOrder", "responderIndex", "stage", "rescues",
  "alternateSaveSkillIds", "usedAlternateSaveSkillId",
] as const;
const LEGACY_RESCUE_RECORD_KEYS = [
  "eventId", "responderId", "cardKind", "requestedAmount", "recoveredAmount", "hpAfter",
] as const;
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
      if (!Number.isFinite(candidate)) throw new DyingError(`${path} contains a non-finite number`);
      return;
    }
    if (typeof candidate !== "object" || depth > 256) throw new DyingError(`${path} is not strict JSON`);
    if (ancestors.includes(candidate)) throw new DyingError(`${path} contains a cycle`);
    ancestors.push(candidate);
    if (Array.isArray(candidate)) {
      const keys = Reflect.ownKeys(candidate);
      if (keys.length !== candidate.length + 1 || keys.some((key) => {
        if (key === "length") return false;
        if (typeof key !== "string") return true;
        const index = Number(key);
        return !Number.isSafeInteger(index) || index < 0 || index >= candidate.length || String(index) !== key;
      })) {
        throw new DyingError(`${path} must be a dense array without custom properties`);
      }
      for (let index = 0; index < candidate.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(candidate, String(index));
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          throw new DyingError(`${path}[${index}] must be an enumerable data property`);
        }
        visit(descriptor.value, `${path}[${index}]`, depth + 1);
      }
    } else {
      if (!isPlainRecord(candidate)) throw new DyingError(`${path} must be a plain object`);
      for (const key of Reflect.ownKeys(candidate)) {
        if (typeof key !== "string") throw new DyingError(`${path} contains a symbol key`);
        const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
          throw new DyingError(`${path}.${key} must be an enumerable data property`);
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
  if (!isPlainRecord(value)) throw new DyingError(`${label} must be an object`);
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(value, key)) || keys.some((key) => !allowed.has(key))) {
    throw new DyingError(`${label} has missing or unexpected fields`);
  }
  return value;
}

function assertLifePlayers(players: readonly LifePlayerState[]): void {
  if (!Array.isArray(players)) throw new DyingError("life player snapshot must be an array");
  const ids = new Set<PlayerId>();
  for (const player of players as readonly unknown[]) {
    if (!isPlainRecord(player)
      || typeof player.id !== "string" || player.id.length === 0 || ids.has(player.id)
      || !Number.isSafeInteger(player.hp)
      || !Number.isSafeInteger(player.maxHp) || (player.maxHp as number) < 0
      || (player.maxHp as number) === 0 && (player.alive !== false || player.hp !== 0)
      || (player.hp as number) > (player.maxHp as number)
      || typeof player.alive !== "boolean"
    ) throw new DyingError("life player snapshot is malformed or duplicated");
    ids.add(player.id);
  }
}

function assertDyingReason(value: unknown): asserts value is DyingReason {
  const reason = exactRecord(value, ["type", "eventId", "sourceId"], "dying reason");
  if ((reason.type !== "damage" && reason.type !== "hp_loss")
    || !Number.isSafeInteger(reason.eventId) || (reason.eventId as number) <= 0
    || !(reason.sourceId === null || typeof reason.sourceId === "string" && reason.sourceId.length > 0)
  ) throw new DyingError("dying reason is invalid");
}

function assertZoneRefShape(value: unknown, label: string): asserts value is ZoneRef {
  if (!isPlainRecord(value) || typeof value.kind !== "string") throw new DyingError(`${label} is invalid`);
  if (value.kind === "deck" || value.kind === "discard") {
    exactRecord(value, ["kind"], label);
  } else if (value.kind === "processing") {
    const zone = exactRecord(value, ["kind", "frameId"], label);
    positiveId(zone.frameId as number, `${label} frameId`);
  } else if (value.kind === "hand" || value.kind === "judgment") {
    const zone = exactRecord(value, ["kind", "playerId"], label);
    if (typeof zone.playerId !== "string" || zone.playerId.length === 0) throw new DyingError(`${label} playerId is invalid`);
  } else if (value.kind === "equipment") {
    const zone = exactRecord(value, ["kind", "playerId", "slot"], label);
    if (typeof zone.playerId !== "string" || zone.playerId.length === 0 || !EQUIPMENT_SLOTS.has(zone.slot as string)) {
      throw new DyingError(`${label} equipment reference is invalid`);
    }
  } else if (value.kind === "extra") {
    const zone = exactRecord(value, ["kind", "playerId", "pileId"], label);
    if (typeof zone.playerId !== "string" || zone.playerId.length === 0 || typeof zone.pileId !== "string" || zone.pileId.length === 0) {
      throw new DyingError(`${label} extra-pile reference is invalid`);
    }
  } else {
    throw new DyingError(`${label} kind is invalid`);
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
  ) throw new DyingError(`${label} is invalid`);
}

function assertMoveRecordShape(value: unknown, label: string): asserts value is MoveRecord {
  const record = exactRecord(value, MOVE_RECORD_REQUIRED_KEYS, label, MOVE_RECORD_OPTIONAL_KEYS);
  positiveId(record.batchId as number, `${label} batchId`);
  if (!Array.isArray(record.cardIds) || !Array.isArray(record.cards)
    || !MOVE_REASONS.has(record.reason as string) || !MOVE_VISIBILITIES.has(record.visibility as string)
    || Object.prototype.hasOwnProperty.call(record, "placement") && !MOVE_PLACEMENTS.has(record.placement as string)
  ) throw new DyingError(`${label} is invalid`);
  assertZoneRefShape(record.from, `${label}.from`);
  assertZoneRefShape(record.to, `${label}.to`);
  if (record.cardIds.some((cardId) => typeof cardId !== "string" || cardId.length === 0)) {
    throw new DyingError(`${label}.cardIds is invalid`);
  }
  record.cards.forEach((card, index) => assertCardShape(card, `${label}.cards[${index}]`));
  for (const key of ["actorId", "sourceId", "targetId", "skillId"] as const) {
    if (Object.prototype.hasOwnProperty.call(record, key)
      && record[key] !== null
      && (typeof record[key] !== "string" || (record[key] as string).length === 0)
    ) throw new DyingError(`${label}.${key} is invalid`);
  }
  for (const key of ["useId", "frameId"] as const) {
    if (Object.prototype.hasOwnProperty.call(record, key) && record[key] !== null) {
      positiveId(record[key] as number, `${label}.${key}`);
    }
  }
}

function assertLegacyDyingFrame(value: unknown): asserts value is LegacyDyingFrameV1 {
  assertStrictJson(value, "legacy dying frame");
  if (isPlainRecord(value) && Object.prototype.hasOwnProperty.call(value, "version")) {
    throw new DyingError("migrateDyingFrame accepts only an unversioned v1 snapshot");
  }
  const legacy = exactRecord(value, LEGACY_DYING_FRAME_KEYS, "legacy dying frame");
  if (legacy.type !== "dying"
    || typeof legacy.victimId !== "string" || legacy.victimId.length === 0
    || !Array.isArray(legacy.responderOrder)
    || !Array.isArray(legacy.rescues)
    || !Array.isArray(legacy.alternateSaveSkillIds)
    || !["rescue", "alternate_save", "rescued", "death_confirmed"].includes(legacy.stage as string)
    || !Number.isSafeInteger(legacy.responderIndex)
    || (legacy.responderIndex as number) < 0
    || !(legacy.usedAlternateSaveSkillId === null
      || typeof legacy.usedAlternateSaveSkillId === "string" && legacy.usedAlternateSaveSkillId.length > 0)
  ) throw new DyingError("legacy dying frame is invalid");
  positiveId(legacy.frameId as number, "legacy frameId");
  assertDyingReason(legacy.reason);
  if (legacy.responderOrder.some((id) => typeof id !== "string" || id.length === 0)
    || legacy.alternateSaveSkillIds.some((id) => typeof id !== "string" || id.length === 0)
  ) throw new DyingError("legacy dying frame arrays are invalid");
  legacy.rescues.forEach((value, index) => {
    const rescue = exactRecord(value, LEGACY_RESCUE_RECORD_KEYS, `legacy rescues[${index}]`);
    positiveId(rescue.eventId as number, `legacy rescues[${index}] eventId`);
    if (typeof rescue.responderId !== "string" || rescue.responderId.length === 0
      || !["peach", "wine", "view_as_peach"].includes(rescue.cardKind as string)
      || !Number.isSafeInteger(rescue.requestedAmount) || (rescue.requestedAmount as number) <= 0
      || !Number.isSafeInteger(rescue.recoveredAmount) || (rescue.recoveredAmount as number) < 0
      || !Number.isSafeInteger(rescue.hpAfter)
    ) throw new DyingError(`legacy rescues[${index}] is invalid`);
  });
}

function positiveId(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new DyingError(`${label} must be positive`);
}

function playerFor(players: readonly LifePlayerState[], playerId: PlayerId): LifePlayerState {
  const player = players.find((candidate) => candidate.id === playerId);
  if (!player) throw new DyingError(`unknown player: ${playerId}`);
  return player;
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

function sameZone(left: ZoneRef, right: ZoneRef): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case "deck":
    case "discard":
      return true;
    case "processing":
      return left.frameId === (right as Extract<ZoneRef, { kind: "processing" }>).frameId;
    case "hand":
    case "judgment":
      return left.playerId === (right as Extract<ZoneRef, { kind: typeof left.kind }>).playerId;
    case "equipment": {
      const candidate = right as Extract<ZoneRef, { kind: "equipment" }>;
      return left.playerId === candidate.playerId && left.slot === candidate.slot;
    }
    case "extra": {
      const candidate = right as Extract<ZoneRef, { kind: "extra" }>;
      return left.playerId === candidate.playerId && left.pileId === candidate.pileId;
    }
  }
}

function isResponderSource(zone: ZoneRef, responderId: PlayerId, allowEquipment: boolean): boolean {
  return zone.kind === "hand" && zone.playerId === responderId ||
    allowEquipment && zone.kind === "equipment" && zone.playerId === responderId;
}

function assertActiveFrame(frame: DyingFrame): void {
  if (frame.suspendedByFrameId !== null) {
    throw new DyingError(`dying frame ${frame.frameId} is not the stack top`);
  }
}

function validateRescueEligibility(
  players: readonly LifePlayerState[],
  frame: DyingFrame,
  input: Pick<RescueCardUseInput, "eventId" | "responderId" | "cardKind" | "amount">,
): LifePlayerState {
  assertActiveFrame(frame);
  if (frame.stage !== "rescue") throw new DyingError("dying frame is not accepting rescue cards");
  if (currentDyingResponder(frame) !== input.responderId) throw new DyingError("rescue action belongs to another responder");
  if ((input.cardKind === "wine" || input.cardKind === "view_as_wine") && input.responderId !== frame.victimId) {
    throw new DyingError("Wine can only save its dying owner");
  }
  positiveId(input.eventId, "rescue eventId");
  positiveId(input.amount ?? 1, "rescue amount");
  if (frame.rescues.some((record) => record.eventId === input.eventId)) {
    throw new DyingError("rescue event was already consumed");
  }
  const victim = playerFor(players, frame.victimId);
  if (!victim.alive || victim.hp > 0) throw new DyingError("victim no longer requires rescue");
  return victim;
}

function cardForPhysicalId(records: readonly MoveRecord[], cardId: CardId): Card | null {
  for (const record of records) {
    const index = record.cardIds.indexOf(cardId);
    const card = record.cards[index];
    if (index >= 0 && card) return card;
  }
  return null;
}

function assertVerifiedRescueProvenance(
  frame: DyingFrame,
  input: Pick<RescueCardUseInput,
    "responderId" | "cardKind" | "useId" | "cardUseFrameId" |
    "physicalCardIds" | "viewAsSkillId" | "effectiveSuit" | "suitModifierSkillId" | "moveRecords">,
  alreadyRecorded = false,
): void {
  positiveId(input.useId, "rescue useId");
  positiveId(input.cardUseFrameId, "rescue card-use frameId");
  const longhun = input.viewAsSkillId === "longhun";
  if (
    input.physicalCardIds.length < 1 ||
    (!longhun && input.physicalCardIds.length !== 1) ||
    input.physicalCardIds.some((cardId) => !cardId) ||
    new Set(input.physicalCardIds).size !== input.physicalCardIds.length
  ) {
    throw new DyingError(longhun
      ? "Longhun rescue must pay one or more distinct physical cards"
      : "a rescue declaration must pay exactly one physical card");
  }
  if (input.moveRecords.length === 0) throw new DyingError("rescue card use requires move provenance");
  if (!alreadyRecorded && frame.rescues.some((record) => record.useId === input.useId)) {
    throw new DyingError("rescue useId was already consumed");
  }
  const reusedCardIds = new Set(frame.rescues.flatMap((record) => [...record.physicalCardIds]));
  if (!alreadyRecorded && input.physicalCardIds.some((cardId) => reusedCardIds.has(cardId))) {
    throw new DyingError("a physical rescue card was already consumed");
  }

  const expectedIds = new Set(input.physicalCardIds);
  const seenIds = new Set<CardId>();
  for (const [index, record] of input.moveRecords.entries()) {
    if (record.useId !== input.useId || record.frameId !== input.cardUseFrameId) {
      throw new DyingError("rescue move belongs to another card use or frame");
    }
    if (
      (record.actorId != null && record.actorId !== input.responderId) ||
      (record.sourceId != null && record.sourceId !== input.responderId) ||
      (record.targetId != null && record.targetId !== frame.victimId)
    ) {
      throw new DyingError("rescue move has inconsistent participants");
    }
    if (record.reason !== "use" && record.reason !== "respond" && record.reason !== "skill_cost") {
      throw new DyingError("rescue move is not a card-use cost");
    }
    if (input.viewAsSkillId === null ? record.skillId != null : record.skillId !== input.viewAsSkillId) {
      throw new DyingError("rescue move has inconsistent view-as provenance");
    }
    if (record.cardIds.length !== record.cards.length || record.cardIds.length === 0) {
      throw new DyingError("rescue move has incomplete physical cards");
    }
    for (const [cardIndex, cardId] of record.cardIds.entries()) {
      const card = record.cards[cardIndex];
      if (!expectedIds.has(cardId) || !card || card.id !== cardId) {
        throw new DyingError("rescue move contains an unrelated physical card");
      }
      if (longhun && seenIds.has(cardId)) throw new DyingError("rescue move pays one physical card more than once");
      seenIds.add(cardId);
    }
    if (!longhun && index > 0 && !sameZone(input.moveRecords[index - 1]!.to, record.from)) {
      throw new DyingError("rescue move provenance is not a continuous zone chain");
    }
  }
  if (seenIds.size !== expectedIds.size) throw new DyingError("rescue move did not pay every physical card");

  const allowEquipment = input.viewAsSkillId === "jijiu" || longhun;
  if (longhun) {
    for (const record of input.moveRecords) {
      if (!isResponderSource(record.from, input.responderId, allowEquipment)) {
        throw new DyingError("Longhun rescue costs must leave the responder's hand or equipment");
      }
      if (record.to.kind !== "processing" || record.to.frameId !== input.cardUseFrameId) {
        throw new DyingError("Longhun rescue costs must enter their shared processing frame");
      }
    }
  } else {
    const first = input.moveRecords[0]!;
    const last = input.moveRecords.at(-1)!;
    if (!isResponderSource(first.from, input.responderId, allowEquipment)) {
      throw new DyingError("rescue cost must leave the responder's legal card zone");
    }
    if (
      last.to.kind !== "discard" &&
      (last.to.kind !== "processing" || last.to.frameId !== input.cardUseFrameId)
    ) {
      throw new DyingError("rescue cost must remain in its processing frame or reach discard");
    }
  }
  const physicalCards = input.physicalCardIds.map((cardId) => cardForPhysicalId(input.moveRecords, cardId));
  if (physicalCards.some((card) => card === null)) throw new DyingError("rescue physical card metadata is missing");
  const physical = physicalCards[0]!;
  if (!(["spade", "heart", "club", "diamond"] as const).includes(input.effectiveSuit)) {
    throw new DyingError("rescue effective suit is invalid");
  }
  if (input.suitModifierSkillId === null) {
    if (physicalCards.some((card) => card!.suit !== input.effectiveSuit)) {
      throw new DyingError("unmodified rescue effective suit must match every physical card");
    }
  } else if (input.suitModifierSkillId !== "hongyan" || input.effectiveSuit !== "heart" ||
    physicalCards.some((card) => card!.suit !== "heart" && card!.suit !== "spade") ||
    !physicalCards.some((card) => card!.suit === "spade")) {
    throw new DyingError("Hongyan rescue provenance must map physical Spades to effective Hearts");
  }
  if (input.cardKind === "peach") {
    if (input.viewAsSkillId !== null || physical.kind !== "peach") {
      throw new DyingError("a direct Peach rescue must pay a physical Peach");
    }
  } else if (input.cardKind === "wine") {
    if (input.viewAsSkillId !== null || physical.kind !== "wine") {
      throw new DyingError("a Wine rescue must pay a physical Wine");
    }
  } else if (input.cardKind === "view_as_peach") {
    if (input.viewAsSkillId === "jijiu") {
      if (input.effectiveSuit !== "heart" && input.effectiveSuit !== "diamond") {
        throw new DyingError("Jijiu must pay one effective-red card and record viewAsSkillId=jijiu");
      }
    } else if (input.viewAsSkillId === "longhun") {
      if (input.effectiveSuit !== "heart") {
        throw new DyingError("Longhun must pay effective-Heart cards for a Peach rescue");
      }
    } else if (input.viewAsSkillId !== "guhuo") {
      throw new DyingError("a view-as Peach rescue must record Jijiu, Guhuo, or Longhun provenance");
    }
  } else if (input.viewAsSkillId === "jiuchi") {
    if (input.effectiveSuit !== "spade" || physical.suit !== "spade") {
      throw new DyingError("Jiuchi must pay one printed and effective Spade hand card");
    }
  } else if (input.viewAsSkillId !== "guhuo") {
    throw new DyingError("a view-as Wine rescue must record Guhuo or Jiuchi provenance");
  }
}

export function createDyingFrame(
  players: readonly LifePlayerState[],
  input: {
    readonly frameId: number;
    readonly victimId: PlayerId;
    readonly reason: DyingReason;
    /** Already filtered for Wansha and other legality, in exact response order. */
    readonly responderOrder: readonly PlayerId[];
    readonly entrySaveSkillIds?: readonly DyingEntrySaveSkillId[];
    readonly ownerResponseSaveSkillIds?: readonly DyingOwnerResponseSaveSkillId[];
    /** @deprecated New frames map only Buqu and Niepan to their correct timing. */
    readonly alternateSaveSkillIds?: readonly string[];
  },
): DyingFrame {
  positiveId(input.frameId, "frameId");
  positiveId(input.reason.eventId, "reason eventId");
  const victim = playerFor(players, input.victimId);
  if (!victim.alive || victim.hp > 0) throw new DyingError("only a living player at zero or less HP can enter dying");
  if (input.responderOrder.length === 0) throw new DyingError("dying responder order cannot be empty");
  if (new Set(input.responderOrder).size !== input.responderOrder.length) {
    throw new DyingError("dying responder order contains duplicates");
  }
  for (const responderId of input.responderOrder) {
    const responder = playerFor(players, responderId);
    if (!responder.alive) throw new DyingError("dead players cannot enter the rescue order");
  }

  const entrySaveSkillIds = [...(input.entrySaveSkillIds ?? [])];
  const ownerResponseSaveSkillIds = [...(input.ownerResponseSaveSkillIds ?? [])];
  for (const skillId of input.alternateSaveSkillIds ?? []) {
    if (skillId === "buqu") entrySaveSkillIds.push(skillId);
    else if (skillId === "niepan") ownerResponseSaveSkillIds.push(skillId);
    else throw new DyingError(`legacy alternate skill ${skillId} has no declared dying timing`);
  }
  if (new Set(entrySaveSkillIds).size !== entrySaveSkillIds.length) {
    throw new DyingError("entry save skills must be unique");
  }
  if (new Set(ownerResponseSaveSkillIds).size !== ownerResponseSaveSkillIds.length) {
    throw new DyingError("owner response save skills must be unique");
  }
  if (ownerResponseSaveSkillIds.length > 0 && !input.responderOrder.includes(input.victimId)) {
    throw new DyingError("victim response skills require the victim in responder order");
  }

  const frame: DyingFrame = {
    version: 2,
    type: "dying",
    frameId: input.frameId,
    victimId: input.victimId,
    reason: { ...input.reason },
    responderOrder: Object.freeze([...input.responderOrder]),
    responderIndex: 0,
    stage: entrySaveSkillIds.length > 0 ? "entry_save" : "rescue",
    rescues: [],
    entrySaveSkillIds,
    ownerResponseSaveSkillIds,
    legacyAlternateSaveSkillIds: [],
    skillResolutions: [],
    survivalSkillId: null,
    parentFrameId: null,
    suspendedByFrameId: null,
    migratedFromVersion: null,
  };
  assertDyingFrame(players, frame);
  return frame;
}

export function currentDyingEntrySaveSkill(frame: DyingFrame): DyingEntrySaveSkillId | null {
  return frame.stage === "entry_save" ? frame.entrySaveSkillIds[0] ?? null : null;
}

export function resolveDyingEntrySave(
  players: readonly LifePlayerState[],
  frame: DyingFrame,
  input: { readonly skillId: DyingEntrySaveSkillId; readonly survives: boolean },
): void {
  assertActiveFrame(frame);
  if (frame.stage !== "entry_save") throw new DyingError("life-deduction save window is not active");
  if (currentDyingEntrySaveSkill(frame) !== input.skillId) throw new DyingError("entry save skill is not next");
  const victim = playerFor(players, frame.victimId);
  if (!victim.alive || victim.hp > 0) throw new DyingError("entry save victim is inconsistent");
  frame.entrySaveSkillIds.shift();
  frame.skillResolutions.push({
    skillId: input.skillId,
    timing: "life_deduction",
    succeeded: input.survives,
    hpAfter: victim.hp,
  });
  if (input.survives) {
    frame.survivalSkillId = input.skillId;
    frame.stage = "rescued";
  } else if (frame.entrySaveSkillIds.length === 0) {
    frame.stage = "rescue";
  }
}

export function currentDyingResponder(frame: DyingFrame): PlayerId | null {
  if (frame.stage !== "rescue") return null;
  return frame.responderOrder[frame.responderIndex] ?? null;
}

export function currentDyingOwnerResponseSkill(frame: DyingFrame): DyingOwnerResponseSaveSkillId | null {
  return frame.stage === "rescue" && currentDyingResponder(frame) === frame.victimId
    ? frame.ownerResponseSaveSkillIds[0] ?? null
    : null;
}

export function applyDyingOwnerResponseSave(
  players: readonly LifePlayerState[],
  frame: DyingFrame,
  skillId: DyingOwnerResponseSaveSkillId,
): void {
  assertActiveFrame(frame);
  if (currentDyingOwnerResponseSkill(frame) !== skillId) {
    throw new DyingError("owner save skill is available only at the victim's response point");
  }
  const victim = playerFor(players, frame.victimId);
  if (!victim.alive || victim.hp <= 0) throw new DyingError("owner save finished without positive HP");
  frame.ownerResponseSaveSkillIds.shift();
  frame.skillResolutions.push({ skillId, timing: "victim_response", succeeded: true, hpAfter: victim.hp });
  frame.survivalSkillId = skillId;
  frame.stage = "rescued";
}

export function declineDyingOwnerResponseSave(
  frame: DyingFrame,
  skillId: DyingOwnerResponseSaveSkillId,
  hpAfter = 0,
): void {
  assertActiveFrame(frame);
  if (currentDyingOwnerResponseSkill(frame) !== skillId) {
    throw new DyingError("owner save skill is available only at the victim's response point");
  }
  if (!Number.isSafeInteger(hpAfter) || hpAfter > 0) {
    throw new DyingError("declined owner save must retain the victim's nonpositive HP");
  }
  frame.ownerResponseSaveSkillIds.shift();
  frame.skillResolutions.push({ skillId, timing: "victim_response", succeeded: false, hpAfter });
}

/** Re-checks Buqu after a recovery removed one or more wound cards. */
export function resolveDyingRecoverySave(
  players: readonly LifePlayerState[],
  frame: DyingFrame,
  input: { readonly skillId: "buqu"; readonly survives: boolean },
): void {
  assertActiveFrame(frame);
  if (frame.stage !== "rescue") throw new DyingError("recovery save requires an active rescue window");
  const victim = playerFor(players, frame.victimId);
  if (!victim.alive || victim.hp > 0) throw new DyingError("recovery save victim is inconsistent");
  frame.skillResolutions.push({
    skillId: input.skillId,
    timing: "recovery",
    succeeded: input.survives,
    hpAfter: victim.hp,
  });
  if (input.survives) {
    frame.survivalSkillId = input.skillId;
    frame.stage = "rescued";
  }
}

/** Records a verified rescue whose recovery points were resolved by Buqu. */
export function recordDyingRescue(
  players: readonly LifePlayerState[],
  frame: DyingFrame,
  input: RecordDyingRescueInput,
): void {
  assertActiveFrame(frame);
  if (frame.stage !== "rescue") throw new DyingError("dying frame is not accepting a rescue record");
  if (currentDyingResponder(frame) !== input.responderId) throw new DyingError("rescue record belongs to another responder");
  positiveId(input.eventId, "rescue eventId");
  positiveId(input.amount ?? 1, "rescue amount");
  if (!Number.isSafeInteger(input.recoveredAmount) || input.recoveredAmount < 0 || input.recoveredAmount > (input.amount ?? 1)) {
    throw new DyingError("rescue recovered amount is invalid");
  }
  const victim = playerFor(players, frame.victimId);
  if (!victim.alive || !Number.isSafeInteger(input.hpAfter) || victim.hp !== input.hpAfter) {
    throw new DyingError("rescue record HP does not match the victim");
  }
  if (frame.rescues.some((record) => record.eventId === input.eventId)) throw new DyingError("rescue event was already consumed");
  assertVerifiedRescueProvenance(frame, input);
  frame.rescues.push({
    eventId: input.eventId,
    responderId: input.responderId,
    cardKind: input.cardKind,
    requestedAmount: input.amount ?? 1,
    recoveredAmount: input.recoveredAmount,
    hpAfter: input.hpAfter,
    useId: input.useId,
    cardUseFrameId: input.cardUseFrameId,
    physicalCardIds: Object.freeze([...input.physicalCardIds]),
    viewAsSkillId: input.viewAsSkillId,
    effectiveSuit: input.effectiveSuit,
    suitModifierSkillId: input.suitModifierSkillId,
    moveRecords: Object.freeze(input.moveRecords.map(cloneMoveRecord)),
    provenance: "verified",
  });
  if (victim.hp > 0) frame.stage = "rescued";
}

export function rescueDyingPlayer(
  players: readonly LifePlayerState[],
  frame: DyingFrame,
  input: RescueCardUseInput,
): RecoveryEvent {
  const victim = validateRescueEligibility(players, frame, input);
  assertVerifiedRescueProvenance(frame, input);
  let recovery: RecoveryEvent;
  try {
    recovery = recoverHp(players, {
      eventId: input.eventId,
      sourceId: input.responderId,
      targetId: frame.victimId,
      amount: input.amount ?? 1,
      reason: input.cardKind,
    });
  } catch (error) {
    if (error instanceof DamageError) throw new DyingError(error.message);
    throw error;
  }
  frame.rescues.push({
    eventId: input.eventId,
    responderId: input.responderId,
    cardKind: input.cardKind,
    requestedAmount: input.amount ?? 1,
    recoveredAmount: recovery.recoveredAmount,
    hpAfter: recovery.hpAfter,
    useId: input.useId,
    cardUseFrameId: input.cardUseFrameId,
    physicalCardIds: Object.freeze([...input.physicalCardIds]),
    viewAsSkillId: input.viewAsSkillId,
    effectiveSuit: input.effectiveSuit,
    suitModifierSkillId: input.suitModifierSkillId,
    moveRecords: Object.freeze(input.moveRecords.map(cloneMoveRecord)),
    provenance: "verified",
  });
  if (victim.hp > 0) frame.stage = "rescued";
  return recovery;
}

/**
 * High-level rescue cost helper. It moves the real physical card into the
 * nested card-use processing frame before applying recovery.
 */
export function playDyingRescueCard(
  players: readonly LifePlayerState[],
  zones: AtomicZoneState,
  frame: DyingFrame,
  input: PlayDyingRescueCardInput,
): PlayedDyingRescueCard {
  return playDyingRescueCards(players, zones, frame, {
    ...input,
    physicalCards: [{ cardId: input.physicalCardId, from: input.from }],
  });
}

/** Atomically commits every physical component of a multi-card rescue. */
export function playDyingRescueCards(
  players: readonly LifePlayerState[],
  zones: AtomicZoneState,
  frame: DyingFrame,
  input: PlayDyingRescueCardsInput,
): PlayedDyingRescueCard {
  validateRescueEligibility(players, frame, input);
  positiveId(input.useId, "rescue useId");
  positiveId(input.cardUseFrameId, "rescue card-use frameId");
  positiveId(input.batchId, "rescue move batchId");
  if (input.physicalCards.length === 0 || new Set(input.physicalCards.map((entry) => entry.cardId)).size !== input.physicalCards.length) {
    throw new DyingError("rescue physical cards must be nonempty and distinct");
  }
  const located = input.physicalCards.map((entry) => {
    const found = locatePhysicalCard(zones, entry.cardId);
    if (!sameZone(found.zone, entry.from)) throw new DyingError("rescue card is not in the declared source zone");
    return { ...entry, card: found.card };
  });
  // Cost legality is checked before the atomic move, so invalid view-as input
  // cannot strand a physical card in processing.
  const intents = located.map((entry) => ({
    cardIds: [entry.cardId],
    from: entry.from,
    to: { kind: "processing", frameId: input.cardUseFrameId } as const,
    reason: "respond" as const,
    visibility: "public" as const,
    actorId: input.responderId,
    sourceId: input.responderId,
    targetId: frame.victimId,
    skillId: input.viewAsSkillId,
    useId: input.useId,
    frameId: input.cardUseFrameId,
  }));
  const probe = {
    responderId: input.responderId,
    cardKind: input.cardKind,
    useId: input.useId,
    cardUseFrameId: input.cardUseFrameId,
    physicalCardIds: located.map((entry) => entry.cardId),
    viewAsSkillId: input.viewAsSkillId,
    effectiveSuit: input.effectiveSuit,
    suitModifierSkillId: input.suitModifierSkillId,
    moveRecords: intents.map((intent, index) => ({
      ...intent,
      batchId: input.batchId,
      cards: [located[index]!.card],
    })) as MoveRecord[],
  };
  assertVerifiedRescueProvenance(frame, probe);
  const moveRecords = commitMoveBatch(zones, {
    batchId: input.batchId,
    intents,
  });
  const recovery = rescueDyingPlayer(players, frame, {
    eventId: input.eventId,
    responderId: input.responderId,
    cardKind: input.cardKind,
    amount: input.amount,
    useId: input.useId,
    cardUseFrameId: input.cardUseFrameId,
    physicalCardIds: located.map((entry) => entry.cardId),
    viewAsSkillId: input.viewAsSkillId,
    effectiveSuit: input.effectiveSuit,
    suitModifierSkillId: input.suitModifierSkillId,
    moveRecords,
  });
  return { recovery, moveRecords };
}

export function passDyingRescue(
  players: readonly LifePlayerState[],
  frame: DyingFrame,
  responderId: PlayerId,
): void {
  assertActiveFrame(frame);
  if (frame.stage !== "rescue") throw new DyingError("dying frame is not accepting passes");
  if (currentDyingResponder(frame) !== responderId) throw new DyingError("pass belongs to another responder");
  if (responderId === frame.victimId && frame.ownerResponseSaveSkillIds.length > 0) {
    throw new DyingError("victim response skills must resolve before passing");
  }
  const victim = playerFor(players, frame.victimId);
  if (!victim.alive || victim.hp > 0) throw new DyingError("victim no longer requires rescue");
  frame.responderIndex += 1;
  if (frame.responderIndex >= frame.responderOrder.length) {
    frame.stage = frame.legacyAlternateSaveSkillIds.length > 0
      ? "legacy_alternate_save"
      : "death_pending";
  }
}

/** @deprecated Use resolveDyingEntrySave or applyDyingOwnerResponseSave at the explicit timing. */
export function applyAlternateSave(
  players: readonly LifePlayerState[],
  frame: DyingFrame,
  input: { readonly skillId: string; readonly assertRescued?: boolean },
): void {
  assertActiveFrame(frame);
  if (frame.stage === "entry_save" && input.skillId === "buqu") {
    resolveDyingEntrySave(players, frame, {
      skillId: "buqu",
      survives: input.assertRescued !== false,
    });
    return;
  }
  if (frame.stage === "rescue" && input.skillId === "niepan") {
    applyDyingOwnerResponseSave(players, frame, "niepan");
    return;
  }
  if (frame.stage !== "legacy_alternate_save") {
    throw new DyingError("alternate save is outside its declared dying timing");
  }
  const index = frame.legacyAlternateSaveSkillIds.indexOf(input.skillId);
  if (index < 0) throw new DyingError("legacy alternate save skill is unavailable or already consumed");
  const victim = playerFor(players, frame.victimId);
  if (!victim.alive) throw new DyingError("dead victim cannot use an alternate save");
  if (victim.hp <= 0 && input.assertRescued !== false) {
    throw new DyingError("alternate save finished without raising the victim above zero HP");
  }
  frame.legacyAlternateSaveSkillIds.splice(index, 1);
  const succeeded = victim.hp > 0;
  frame.skillResolutions.push({
    skillId: input.skillId,
    timing: "legacy_deferred",
    succeeded,
    hpAfter: victim.hp,
  });
  if (succeeded) {
    frame.survivalSkillId = input.skillId;
    frame.stage = "rescued";
  } else if (frame.legacyAlternateSaveSkillIds.length === 0) {
    frame.stage = "death_pending";
  }
}

/** @deprecated Use the timing-specific decline function. */
export function declineAlternateSave(frame: DyingFrame, skillId: string): void {
  assertActiveFrame(frame);
  if (frame.stage === "entry_save" && skillId === "buqu") {
    // Entry-save failure does not need life state; it simply opens rescue.
    frame.entrySaveSkillIds.shift();
    frame.skillResolutions.push({ skillId, timing: "life_deduction", succeeded: false, hpAfter: 0 });
    if (frame.entrySaveSkillIds.length === 0) frame.stage = "rescue";
    return;
  }
  if (frame.stage === "rescue" && skillId === "niepan") {
    declineDyingOwnerResponseSave(frame, "niepan");
    return;
  }
  if (frame.stage !== "legacy_alternate_save") throw new DyingError("alternate save window is not active");
  const index = frame.legacyAlternateSaveSkillIds.indexOf(skillId);
  if (index < 0) throw new DyingError("legacy alternate save skill is unavailable or already consumed");
  frame.legacyAlternateSaveSkillIds.splice(index, 1);
  frame.skillResolutions.push({ skillId, timing: "legacy_deferred", succeeded: false, hpAfter: 0 });
  if (frame.legacyAlternateSaveSkillIds.length === 0) frame.stage = "death_pending";
}

export function canConfirmDeath(frame: DyingFrame): boolean {
  return frame.stage === "death_pending";
}

export function confirmDeath(
  players: readonly LifePlayerState[],
  frame: DyingFrame,
  eventId: number,
): DeathEvent {
  assertActiveFrame(frame);
  positiveId(eventId, "death eventId");
  if (!canConfirmDeath(frame)) throw new DyingError("normal or timed save opportunities remain");
  const victim = playerFor(players, frame.victimId);
  if (!victim.alive || victim.hp > 0) throw new DyingError("victim cannot be confirmed dead");
  victim.alive = false;
  frame.stage = "death_confirmed";
  return {
    type: "death",
    eventId,
    victimId: victim.id,
    killerId: frame.reason.type === "damage" ? frame.reason.sourceId : null,
    reason: { ...frame.reason },
  };
}

export function cloneDyingFrame(frame: DyingFrame): DyingFrame {
  return {
    ...frame,
    reason: { ...frame.reason },
    responderOrder: Object.freeze([...frame.responderOrder]),
    rescues: frame.rescues.map((rescue) => ({
      ...rescue,
      physicalCardIds: Object.freeze([...rescue.physicalCardIds]),
      moveRecords: Object.freeze(rescue.moveRecords.map(cloneMoveRecord)),
    })),
    entrySaveSkillIds: [...frame.entrySaveSkillIds],
    ownerResponseSaveSkillIds: [...frame.ownerResponseSaveSkillIds],
    legacyAlternateSaveSkillIds: [...frame.legacyAlternateSaveSkillIds],
    skillResolutions: frame.skillResolutions.map((resolution) => ({ ...resolution })),
  };
}

export function migrateDyingFrame(
  players: readonly LifePlayerState[],
  legacy: LegacyDyingFrameV1,
): DyingFrame {
  assertLifePlayers(players);
  assertLegacyDyingFrame(legacy);
  const stage: DyingStage = legacy.stage === "alternate_save"
    ? "legacy_alternate_save"
    : legacy.stage;
  const migrated: DyingFrame = {
    version: 2,
    type: "dying",
    frameId: legacy.frameId,
    victimId: legacy.victimId,
    reason: { ...legacy.reason },
    responderOrder: Object.freeze([...legacy.responderOrder]),
    responderIndex: legacy.responderIndex,
    stage,
    rescues: legacy.rescues.map((rescue) => ({
      ...rescue,
      useId: null,
      cardUseFrameId: null,
      physicalCardIds: Object.freeze([]),
      viewAsSkillId: null,
      effectiveSuit: null,
      suitModifierSkillId: null,
      moveRecords: Object.freeze([]),
      provenance: "legacy_unverified",
    })),
    entrySaveSkillIds: [],
    ownerResponseSaveSkillIds: [],
    legacyAlternateSaveSkillIds: [...legacy.alternateSaveSkillIds],
    skillResolutions: legacy.usedAlternateSaveSkillId ? [{
      skillId: legacy.usedAlternateSaveSkillId,
      timing: "legacy_deferred",
      succeeded: legacy.stage === "rescued",
      hpAfter: playerFor(players, legacy.victimId).hp,
    }] : [],
    survivalSkillId: legacy.stage === "rescued" ? legacy.usedAlternateSaveSkillId : null,
    parentFrameId: null,
    suspendedByFrameId: null,
    migratedFromVersion: 1,
  };
  assertDyingFrame(players, migrated);
  return migrated;
}

export function assertDyingFrame(players: readonly LifePlayerState[], frame: DyingFrame): void {
  assertStrictJson(frame, "dying frame");
  assertLifePlayers(players);
  if (!isPlainRecord(frame) || frame.version !== 2) {
    throw new DyingError("legacy dying snapshot requires migrateDyingFrame");
  }
  const persisted = exactRecord(frame, DYING_FRAME_KEYS, "dying frame");
  if (persisted.type !== "dying") {
    throw new DyingError("legacy dying snapshot requires migrateDyingFrame");
  }
  if (typeof frame.victimId !== "string" || frame.victimId.length === 0
    || !Array.isArray(frame.responderOrder)
    || !Array.isArray(frame.rescues)
    || !Array.isArray(frame.entrySaveSkillIds)
    || !Array.isArray(frame.ownerResponseSaveSkillIds)
    || !Array.isArray(frame.legacyAlternateSaveSkillIds)
    || !Array.isArray(frame.skillResolutions)
    || !(frame.survivalSkillId === null || typeof frame.survivalSkillId === "string" && frame.survivalSkillId.length > 0)
  ) throw new DyingError("dying frame fields are invalid");
  if (!DYING_STAGE_SET.has(frame.stage)) throw new DyingError("dying stage is invalid");
  positiveId(frame.frameId, "frameId");
  assertDyingReason(frame.reason);
  if (frame.responderOrder.length === 0
    || frame.responderOrder.some((id) => typeof id !== "string" || id.length === 0)
    || new Set(frame.responderOrder).size !== frame.responderOrder.length
  ) {
    throw new DyingError("dying responder order is invalid");
  }
  frame.responderOrder.forEach((responderId) => playerFor(players, responderId));
  if (!Number.isSafeInteger(frame.responderIndex) || frame.responderIndex < 0 || frame.responderIndex > frame.responderOrder.length) {
    throw new DyingError("dying responder progress is invalid");
  }
  if (new Set(frame.entrySaveSkillIds).size !== frame.entrySaveSkillIds.length || frame.entrySaveSkillIds.some((id) => id !== "buqu")) {
    throw new DyingError("entry save skills are invalid");
  }
  if (new Set(frame.ownerResponseSaveSkillIds).size !== frame.ownerResponseSaveSkillIds.length || frame.ownerResponseSaveSkillIds.some((id) => id !== "niepan")) {
    throw new DyingError("owner response save skills are invalid");
  }
  if (
    new Set(frame.legacyAlternateSaveSkillIds).size !== frame.legacyAlternateSaveSkillIds.length ||
    frame.legacyAlternateSaveSkillIds.some((id) => !id)
  ) {
    throw new DyingError("legacy alternate save skills are invalid");
  }
  if (frame.migratedFromVersion !== null && frame.migratedFromVersion !== 1) {
    throw new DyingError("dying migration marker is invalid");
  }
  for (const [label, value] of [["parentFrameId", frame.parentFrameId], ["suspendedByFrameId", frame.suspendedByFrameId]] as const) {
    if (value !== null) positiveId(value, label);
    if (value === frame.frameId) throw new DyingError("dying frame cannot parent or suspend itself");
  }

  const victim = playerFor(players, frame.victimId);
  if (frame.stage === "entry_save" && (frame.entrySaveSkillIds.length === 0 || frame.responderIndex !== 0 || victim.hp > 0 || !victim.alive)) {
    throw new DyingError("entry save stage is inconsistent");
  }
  if (frame.stage === "rescue" && (frame.entrySaveSkillIds.length !== 0 || frame.responderIndex >= frame.responderOrder.length || victim.hp > 0 || !victim.alive)) {
    throw new DyingError("active rescue stage is inconsistent");
  }
  if (frame.stage === "legacy_alternate_save" && (frame.legacyAlternateSaveSkillIds.length === 0 || frame.responderIndex !== frame.responderOrder.length || victim.hp > 0 || !victim.alive)) {
    throw new DyingError("legacy alternate save stage is inconsistent");
  }
  if (frame.stage === "death_pending" && (
    frame.responderIndex !== frame.responderOrder.length ||
    frame.entrySaveSkillIds.length > 0 ||
    frame.ownerResponseSaveSkillIds.length > 0 ||
    frame.legacyAlternateSaveSkillIds.length > 0 ||
    victim.hp > 0 || !victim.alive
  )) {
    throw new DyingError("death-pending stage is inconsistent");
  }
  if (frame.stage === "rescued" && (!victim.alive || victim.hp <= 0 && frame.survivalSkillId !== "buqu")) {
    throw new DyingError("rescued victim life state is inconsistent");
  }
  if (frame.stage === "death_confirmed" && victim.alive) {
    throw new DyingError("confirmed death still has a living victim");
  }

  const eventIds = new Set<number>();
  const useIds = new Set<number>();
  const paidCardIds = new Set<CardId>();
  for (const [rescueIndex, rescue] of frame.rescues.entries()) {
    exactRecord(rescue, RESCUE_RECORD_KEYS, `rescues[${rescueIndex}]`);
    positiveId(rescue.eventId, "rescue eventId");
    if (eventIds.has(rescue.eventId)) throw new DyingError("rescue event ids are duplicated");
    eventIds.add(rescue.eventId);
    if (typeof rescue.responderId !== "string" || rescue.responderId.length === 0
      || !["peach", "wine", "view_as_peach", "view_as_wine"].includes(rescue.cardKind)
      || !Number.isSafeInteger(rescue.requestedAmount) || rescue.requestedAmount <= 0
      || !Number.isSafeInteger(rescue.recoveredAmount) || rescue.recoveredAmount < 0
      || !Number.isSafeInteger(rescue.hpAfter)
      || !Array.isArray(rescue.physicalCardIds)
      || rescue.physicalCardIds.some((cardId) => typeof cardId !== "string" || cardId.length === 0)
      || !Array.isArray(rescue.moveRecords)
      || !(rescue.viewAsSkillId === null || typeof rescue.viewAsSkillId === "string" && rescue.viewAsSkillId.length > 0)
      || !(rescue.effectiveSuit === null || ["spade", "heart", "club", "diamond"].includes(rescue.effectiveSuit))
      || (rescue.suitModifierSkillId !== null && rescue.suitModifierSkillId !== "hongyan")
      || (rescue.provenance !== "verified" && rescue.provenance !== "legacy_unverified")
    ) {
      throw new DyingError("rescue recovery record is invalid");
    }
    if (rescue.useId !== null) positiveId(rescue.useId, "rescue useId");
    if (rescue.cardUseFrameId !== null) positiveId(rescue.cardUseFrameId, "rescue card-use frameId");
    rescue.moveRecords.forEach((record, index) => assertMoveRecordShape(record, `rescues[${rescueIndex}].moveRecords[${index}]`));
    if (rescue.provenance === "verified") {
      if (rescue.useId === null || rescue.cardUseFrameId === null) throw new DyingError("verified rescue provenance is incomplete");
      if (useIds.has(rescue.useId)) throw new DyingError("rescue use ids are duplicated");
      useIds.add(rescue.useId);
      for (const cardId of rescue.physicalCardIds) {
        if (paidCardIds.has(cardId)) throw new DyingError("rescue physical cards are reused");
        paidCardIds.add(cardId);
      }
      assertVerifiedRescueProvenance(frame, {
        responderId: rescue.responderId,
        cardKind: rescue.cardKind,
        useId: rescue.useId,
        cardUseFrameId: rescue.cardUseFrameId,
        physicalCardIds: rescue.physicalCardIds,
        viewAsSkillId: rescue.viewAsSkillId,
        effectiveSuit: rescue.effectiveSuit!,
        suitModifierSkillId: rescue.suitModifierSkillId,
        moveRecords: rescue.moveRecords,
      }, true);
    } else if (
      frame.migratedFromVersion !== 1 ||
      rescue.useId !== null || rescue.cardUseFrameId !== null ||
      rescue.physicalCardIds.length > 0 || rescue.effectiveSuit !== null || rescue.suitModifierSkillId !== null || rescue.moveRecords.length > 0
    ) {
      throw new DyingError("unverified rescue provenance is allowed only after v1 migration");
    }
  }
  frame.skillResolutions.forEach((resolution, index) => {
    exactRecord(resolution, SKILL_RESOLUTION_KEYS, `skillResolutions[${index}]`);
    if (typeof resolution.skillId !== "string" || resolution.skillId.length === 0
      || !["life_deduction", "recovery", "victim_response", "legacy_deferred"].includes(resolution.timing)
      || typeof resolution.succeeded !== "boolean"
      || !Number.isSafeInteger(resolution.hpAfter)
    ) throw new DyingError(`skillResolutions[${index}] is invalid`);
  });
}

export function createDyingStack(): DyingStack {
  return { version: 1, frames: [] };
}

export function topDyingFrame(stack: DyingStack): DyingFrame | null {
  return stack.frames.at(-1) ?? null;
}

export function pushDyingFrame(stack: DyingStack, frame: DyingFrame): void {
  if (stack.version !== 1) throw new DyingError("dying stack version is invalid");
  if (frame.parentFrameId !== null || frame.suspendedByFrameId !== null) {
    throw new DyingError("new dying frame is already linked to a stack");
  }
  if (stack.frames.some((candidate) => candidate.frameId === frame.frameId || candidate.victimId === frame.victimId)) {
    throw new DyingError("dying stack contains a duplicate frame or victim");
  }
  const parent = topDyingFrame(stack);
  if (parent) {
    if (parent.stage === "rescued" || parent.stage === "death_confirmed") {
      throw new DyingError("resolved dying frame must be popped before nesting another");
    }
    if (parent.suspendedByFrameId !== null) throw new DyingError("only the dying stack top can be suspended");
    parent.suspendedByFrameId = frame.frameId;
    frame.parentFrameId = parent.frameId;
  }
  stack.frames.push(frame);
}

export function popResolvedDyingFrame(stack: DyingStack, frameId: number): DyingFrame {
  const top = topDyingFrame(stack);
  if (!top || top.frameId !== frameId) throw new DyingError("only the dying stack top can be popped");
  if (top.stage !== "rescued" && top.stage !== "death_confirmed") {
    throw new DyingError("unresolved dying frame cannot be popped");
  }
  stack.frames.pop();
  const parent = topDyingFrame(stack);
  if (parent) {
    if (top.parentFrameId !== parent.frameId || parent.suspendedByFrameId !== top.frameId) {
      throw new DyingError("dying stack parent link is inconsistent");
    }
    parent.suspendedByFrameId = null;
  }
  top.parentFrameId = null;
  return top;
}

export function cloneDyingStack(stack: DyingStack): DyingStack {
  return { version: 1, frames: stack.frames.map(cloneDyingFrame) };
}

export function assertDyingStack(players: readonly LifePlayerState[], stack: DyingStack): void {
  assertStrictJson(stack, "dying stack");
  assertLifePlayers(players);
  const persisted = exactRecord(stack, ["version", "frames"], "dying stack");
  if (persisted.version !== 1 || !Array.isArray(persisted.frames)) throw new DyingError("dying stack is invalid");
  const ids = stack.frames.map((frame) => frame.frameId);
  const victims = stack.frames.map((frame) => frame.victimId);
  if (new Set(ids).size !== ids.length || new Set(victims).size !== victims.length) {
    throw new DyingError("dying stack frame ids and victims must be unique");
  }
  stack.frames.forEach((frame, index) => {
    assertDyingFrame(players, frame);
    const parent = stack.frames[index - 1] ?? null;
    const child = stack.frames[index + 1] ?? null;
    if (frame.parentFrameId !== parent?.frameId && !(frame.parentFrameId === null && parent === null)) {
      throw new DyingError("dying stack parent chain is invalid");
    }
    if (frame.suspendedByFrameId !== child?.frameId && !(frame.suspendedByFrameId === null && child === null)) {
      throw new DyingError("only the dying stack top may be active");
    }
  });
}
